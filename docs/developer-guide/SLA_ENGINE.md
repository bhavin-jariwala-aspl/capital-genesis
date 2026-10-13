# Genesis CRM — SLA Engine Technical Reference

For: Developers extending or debugging the SLA engine

Everything here reflects the **actual implementation** in
[`backend/src/services/sla.service.js`](../../backend/src/services/sla.service.js) (572 lines),
[`backend/src/routes/sla/index.js`](../../backend/src/routes/sla/index.js) and the
`sla_*` tables in [`backend/prisma/schema.prisma`](../../backend/prisma/schema.prisma).
Line references are given as `file:LNN` and were accurate at the time of writing — grep the
symbol name if they drift.

---

## Table of Contents

Part 1 — How the engine works

1. [Mental model](#mental-model)
2. [The tick](#the-tick)
3. [Where the data lives](#where-the-data-lives)
4. [Read → match → write](#read--match--write)
5. [Instance lifecycle](#instance-lifecycle)
6. [Business-hours math](#business-hours-math)

Part 2 — Escalation

7. [When escalations fire](#when-escalations-fire)
8. [How rules are selected](#how-rules-are-selected)
9. [Action reference](#action-reference)
10. [How the manager is resolved](#how-the-manager-is-resolved)
11. [How it reaches the manager's screen](#how-it-reaches-the-managers-screen)

Part 3 — Working on it

12. [API surface](#api-surface)
13. [Extension recipes](#extension-recipes)
14. [Testing the engine](#testing-the-engine)
15. [Known gaps and traps](#known-gaps-and-traps)
16. [Invariants — read before you change anything](#invariants--read-before-you-change-anything)

---

# Part 1 — How the engine works

## Mental model

The SLA engine is a **poll-and-reconcile loop**, not an event-driven system.

Nothing fires when a case is saved. There is no DB trigger, no Prisma hook, no workflow-engine
subscription. Every 60 seconds the engine re-scans open records and *derives* what the world
should look like, then writes the difference. That single design choice explains most of the
engine's behaviour:

- **It is idempotent.** Running `reconcile()` twice in a row is harmless — the second pass finds
  the same state and writes nothing new. This is enforced by a unique key, not by luck.
- **It is eventually consistent, not immediate.** A breach is detected up to 60 s after it happens.
- **It self-heals.** Delete an instance row by hand and the next tick recreates it. Take the server
  down for a day and the next tick backfills every timer that should have started, warned or
  breached while it was off (see the *silent backfill* caveat in
  [Known gaps](#known-gaps-and-traps)).
- **A record it can't see doesn't exist.** Timers are keyed off `openWhere` queries; anything
  outside that filter is finalized, not tracked.

## The tick

[`app.js:182-190`](../../backend/src/app.js#L182-L190)

```js
const slaStartDelay = setTimeout(() => {
  slaService.reconcile().catch(() => {});          // first run, 15 s after boot
  slaInterval = setInterval(() => {
    slaService.reconcile().catch((err) => fastify.log.error({ err }, '[sla] reconcile error'));
  }, 60_000);
}, 15_000);
```

The 15 s offset exists so the SLA tick doesn't collide with the workflow scheduler on startup.
Both timers are cleared on `onClose` ([`app.js:242-243`](../../backend/src/app.js#L242-L243)).

[`reconcile()`](../../backend/src/services/sla.service.js#L192) guards against overlapping runs with a private
`#running` flag and returns `{ skipped: true }` if a previous tick is still in flight — so a
reconcile that takes longer than 60 s degrades to back-to-back runs rather than overlapping ones.
It then loops the three entity types in order and swallows errors at the top level, so one bad
entity type cannot stop the others in a later tick.

**Single-process assumption.** `#running` is in-memory. Run two backend instances against one
database and both will reconcile the same records concurrently. See
[Known gaps](#known-gaps-and-traps) #7.

### Tenancy inside a background job

This is the part that surprises people. The two big reads run with **no tenant context at all**:

```js
// sla.service.js:212 — every tenant's policies, in one query
const policies = await this.db.slaPolicy.findMany({
  where: { entity_type: type, is_active: true },
  include: { targets: true, escalations: true, business_hours: true },
  orderBy: [{ tenant_id: 'asc' }, { order_index: 'asc' }],
});
```

That works because [`getTenantId()`](../../backend/src/middleware/tenant-scope.js#L67) returns
`null` outside a request, and the tenant-scope middleware treats `null` as "no filter". The engine
then buckets policies by tenant itself (`policiesByTenant`) and processes each record inside its
own context:

```js
// sla.service.js:237
await tenantContext.run({ tenantId: rec.tenant_id }, async () => {
  await this.#processRecord(type, cfg, metricNames, rec, tenantPolicies);
});
```

**Every write the engine performs — instances, notifications, follow-up tasks, priority bumps —
happens inside that `run()` callback**, which is why none of them pass `tenant_id` explicitly: the
Prisma middleware injects it. If you add a write outside that callback, it will land with a null or
wrong tenant. This is the single easiest way to introduce a cross-tenant leak in this file.

## Where the data lives

| Table | Written by | Read by the engine | Notes |
| ----- | ---------- | ------------------ | ----- |
| `sla_business_hours` | Admin UI → `POST/PUT /api/sla/business-hours` | joined via `policy.business_hours` | `weekly` JSON + `holidays` JSON + fixed `utc_offset_minutes` |
| `sla_policies` | Admin UI → `POST/PUT /api/sla/policies` | `:212` | `conditions` and `pause_statuses` are JSON; `order_index` decides precedence |
| `sla_targets` | replaced wholesale on policy PUT | via `include` | unique on `(policy_id, metric, priority)` |
| `sla_escalations` | replaced wholesale on policy PUT | via `include` | ordered by `order_index` within a trigger |
| `sla_instances` | **the engine only** | `:225` (finalization sweep), `:255` (per metric) | unique on `(entity_type, entity_id, metric)` |
| `crm_cases` / `crm_leads` / `tasks` | the app | `:221` via `cfg.openWhere` | also **written** by `raise_priority` and `create_task` |
| `notifications` | many services incl. this one | not read | the escalation output channel |
| `employee_hierarchy` | [`hierarchy.service.js`](../../backend/src/services/hierarchy.service.js) | `:414`, `:522` | closure table; `depth: 1` = direct manager |

The engine **owns** `sla_instances`. Nothing else writes it, which is why the reconcile loop can
treat its own rows as derived state and overwrite them freely.

### Entity configuration

Everything entity-specific is table-driven in the `ENTITY` map at
[`sla.service.js:24-63`](../../backend/src/services/sla.service.js#L24-L63) — there are no
`if (type === 'case')` branches in the engine body.

| key | `case` | `lead` | `task` |
| --- | ------ | ------ | ------ |
| `model` | `crmCase` | `crmLead` | `task` |
| `dimField` (targets keyed by this) | `priority` | `rating` | `priority` |
| `ownerField` | `owner_id` | `owner_id` | `assigned_to` |
| `openWhere` | status ∉ resolved, closed | not converted | status ∉ completed, cancelled |
| `dueField` | — | — | `due_date` (overrides computed deadline) |
| `priorityLadder` | low→medium→high→critical | cold→warm→hot | low→normal→high→urgent |
| `metricStatus` keys | `first_response`, `resolution` | `first_response` | `resolution` |

`metricStatus` is the **completion oracle**: a function per metric returning
`running | met | canceled` from the record alone. For example a case's first response is considered
met the moment its status is no longer `new`. There is no separate "first replied at" column — the
engine infers it. If you need real first-response timestamps, that is a schema change, not a tuning
change.

## Read → match → write

```text
reconcile()                                        sla.service.js:192
└── for type of [case, lead, task]
    └── #reconcileEntity(type)                                    :208
        ├── read sla_policies (+targets, escalations, calendar)   :212   ← ALL tenants
        ├── read open records via cfg.openWhere                   :221   ← ALL tenants
        ├── read live instances whose record is no longer open    :225   ← finalization sweep
        └── for each record  →  tenantContext.run(tenant_id)      :237
            └── #processRecord()                                  :249
                ├── policy = first policy whose conditions match  :253
                └── for each metric of this entity type
                    ├── existing = sla_instances[(type,id,metric)] :256
                    ├── skip if existing.status ∈ {met, canceled}  :259   ← terminal
                    ├── target = pickTarget(policy.targets, …)     :261
                    ├── no target & no instance → skip             :262
                    ├── no target & instance    → status=canceled  :263
                    ├── no instance → #createInstance()            :279   (never escalates)
                    └── instance    → #updateInstance()            :317   (may escalate)
```

### Policy matching — first match wins

```js
// sla.service.js:253
const policy = tenantPolicies.find((p) => conditionsMatch(p.conditions, rec));
```

`find`, not `filter`. The array arrives sorted by `order_index`, so **the lowest `order_index`
whose conditions match is the only policy that applies**. That is what the "Priority (order)" input
in the SLA builder controls.

[`conditionsMatch`](../../backend/src/services/sla.service.js#L158) is AND-only across the rows:

| `op` | semantics | comparison |
| ---- | --------- | ---------- |
| `equals` / `not_equals` | exact | `String(actual)` vs `String(expected)` |
| `in` | membership | array, or comma-separated string, compared as strings |
| `contains` | substring | lowercased both sides, null-safe |
| `gt` / `lt` | numeric | `Number(actual)` vs `Number(expected)` |
| *(anything else)* | **matches** | unknown ops return `true` — they do not block |

`c.field` is read as a **raw Prisma column** (`rec[c.field]`), not a metadata field name. Custom
fields stored in a JSON blob are not reachable this way.

An empty/missing `conditions` array matches everything. A catch-all policy with `order_index: 0`
therefore shadows every policy beneath it — the most common "my new policy doesn't apply"
support question.

### Target matching — exact dimension, else `*`

```js
// sla.service.js:177
function pickTarget(targets, metric, dim) {
  const forMetric = targets.filter((t) => t.metric === metric);
  return forMetric.find((t) => t.priority === dim)
      || forMetric.find((t) => t.priority === '*')
      || null;
}
```

`dim` is `String(rec[cfg.dimField] ?? '*')` — the record's live priority/rating. No target for a
metric means that metric is simply not tracked for this record; if an instance already existed it
is **canceled**, not left dangling.

## Instance lifecycle

One row per `(entity_type, entity_id, metric)`, enforced by
[`@@unique`](../../backend/prisma/schema.prisma#L3804). That constraint is what makes the loop
idempotent — remove it and every tick would insert duplicates.

```text
                    ┌─────────────────────────────────────────┐
   first sight ───► │ running │──── status in pause_statuses ──► paused ──┐
                    └────┬────┘ ◄──────────── resumed ────────────────────┘
                         │                    (due_at += paused business minutes)
      now >= warning_at  │  → warned = true,  #runEscalations('warning')
      now >  due_at      │  → breached = true, #runEscalations('breach')
                         ▼
                     breached ──── metricStatus = 'met' ──► met (breached=true → "met late")
                         │
   metricStatus 'met' ───┴──► met        metricStatus 'canceled' ──► canceled
                                          target disappeared      ──► canceled
```

`met` and `canceled` are **terminal** — [`:259`](../../backend/src/services/sla.service.js#L259)
`continue`s past them forever. A reopened case does *not* restart its timer; the engine will never
touch that instance again.

### Creation ([`#createInstance:279`](../../backend/src/services/sla.service.js#L279))

```js
started = rec.created_at ?? now
due_at     = addBusinessMinutes(started, target.target_minutes, calendar)
warning_at = addBusinessMinutes(started, target.target_minutes * warning_pct/100, calendar)
```

For tasks, an explicit `rec.due_date` **overrides** the computed `due_at` for the `resolution`
metric, and `warning_at` is interpolated as `warning_pct` of the real window.

The state is then **backfilled** to match reality — an already-late record is created directly as
`status: 'breached'`, `warned: true` — but:

> **Escalations never fire on creation.** ([`:291`](../../backend/src/services/sla.service.js#L291))
> Only `#updateInstance` calls `#runEscalations`. A record that is already breached the first time
> the engine sees it notifies nobody, ever.

### Update ([`#updateInstance:317`](../../backend/src/services/sla.service.js#L317))

Per tick, in order: re-sync `owner_id` → pause/resume → terminal check (`canceled`, then `met`) →
threshold evaluation. On resume, the elapsed *business* minutes since `paused_at` are added to both
`due_at` and `warning_at`, so a pause genuinely stops the clock rather than shifting it by wall time.

**What `#updateInstance` never does:** recompute `due_at` from a changed target. If a case's
priority is bumped from `low` to `critical` — including by the engine's own `raise_priority` action
— the next tick picks the *critical* target for matching purposes but leaves the existing deadline
untouched. Deadlines are frozen at creation except for pause adjustments.

## Business-hours math

[`addBusinessMinutes:108`](../../backend/src/services/sla.service.js#L108) and
[`businessMinutesBetween:133`](../../backend/src/services/sla.service.js#L133).

A calendar is `{ utc_offset_minutes, weekly: { mon: [["09:00","17:00"]], … }, holidays: ["2026-12-25"] }`.
The implementation converts to "wall time" (a `Date` whose **UTC getters read local values**),
walks day by day subtracting available interval minutes, and converts back. Both functions cap the
walk at 732 iterations (~2 years) and fall back to plain wall-clock arithmetic on overflow.

Deliberate simplification: **the offset is fixed, so there is no DST**. `utc_offset_minutes: 330`
is IST year-round. For zones that observe DST, deadlines computed before a transition drift by an
hour after it. `isValidCalendar` requires at least one non-empty weekday; anything else (including
a null `business_hours_id`) means **24/7** — the policy's clock never stops.

---

# Part 2 — Escalation

This is the part most people need and the least obvious from the UI.

## When escalations fire

Threshold evaluation is **edge-triggered**, latched on two persisted booleans
([`:351-364`](../../backend/src/services/sla.service.js#L351-L364)):

```js
const paused = data.status === 'paused' || (existing.paused_at && data.paused_at !== null);
if (!paused) {
  if (!existing.warned && now >= warnAt) {
    data.warned = true;
    await this.#runEscalations(policy, existing, rec, cfg, metric, 'warning');
  }
  if (!existing.breached && now > dueAt) {
    data.breached = true; data.breached_at = now; data.status = 'breached';
    await this.#runEscalations(policy, existing, rec, cfg, metric, 'breach');
  } else if (!existing.breached) {
    data.status = 'running';
  }
}
await this.db.slaInstance.update({ where: { id: existing.id }, data });
```

Consequences worth knowing:

- **Each trigger fires exactly once per instance, for all time.** The latch is a column, not a
  cache. There is no repeat nagging while a breach stays open.
- **Warning and breach can fire in the same tick** (e.g. after downtime) — the `if`s are
  independent. The record gets both notifications back to back.
- **A paused timer escalates nothing.** Neither threshold is evaluated.
- **The flag write and the escalation are not in one transaction.** `#runEscalations` is awaited
  *before* the `update` that sets `warned`/`breached`. If the process dies in between, the
  notification exists but the latch does not — the next tick re-sends it. Crash-duplicated
  notifications are possible; crash-lost ones are not.
- `breached_at` is set to **now** on the update path but to **`dueAt`** on the create/backfill path
  ([`:300-304`](../../backend/src/services/sla.service.js#L300-L304)) — a known inconsistency if you build
  "how late was it" reporting.

## How rules are selected

[`#runEscalations:369`](../../backend/src/services/sla.service.js#L369)

```js
const escs = (policy.escalations || [])
  .filter((e) => (e.metric === metric || e.metric === '*') && e.trigger === trigger)
  .sort((a, b) => a.order_index - b.order_index);
if (escs.length === 0) return;
```

Selection is a plain in-memory filter over rows already loaded with the policy — **no extra query,
no rule engine, no condition evaluation at escalation time**. The only three dimensions are
`metric` (or `*`), `trigger` (`warning` | `breach`), and `order_index` for sequencing. The
`config` JSON column exists on `sla_escalations` but **no current action reads it** — it is the
natural home for anything you add (levels, role targeting, delays).

Each action runs in its own `try/catch` ([`:383-404`](../../backend/src/services/sla.service.js#L383-L404)),
logging `[sla] escalation action failed` and continuing — one broken action never blocks the rest,
and never rolls back the latch.

The message is built once for all actions in the group:

```js
title = `SLA ${trigger === 'breach' ? 'breach' : 'warning'}: ${METRIC_LABEL[metric]}`
body  = `${cfg.label(rec)} — ${METRIC_LABEL[metric]} SLA ${breach ? 'breached' : 'is at risk'}.`
link  = `/sla?focus=${entity_type}:${rec.id}`
```

## Action reference

| `action` | What it writes | Target resolution | Silently does nothing when |
| -------- | -------------- | ----------------- | -------------------------- |
| `notify_owner` | `INSERT notifications` (`type: 'sla'`) | `rec[cfg.ownerField]` | the record is unassigned |
| `notify_manager` | `INSERT notifications` (`type: 'sla'`) | `employee_hierarchy` `depth: 1` above the owner | owner is null **or has no manager row** |
| `raise_priority` | `UPDATE crm_cases \| tasks SET priority = <next rung>` | `cfg.priorityLadder` | entity is a lead (hard-skipped), or already at the top rung, or the current value isn't in the ladder |
| `create_task` | `INSERT tasks` assigned to the owner, `priority: 'high'`, due in 1 h | owner | the record is unassigned |
| *anything else* | — | — | unknown actions hit `default:` and are dropped without a log |

Two side effects that are easy to miss:

1. `create_task` inserts into the same `tasks` table the engine polls, so **the follow-up task is
   itself SLA-tracked** on the next tick. A task-resolution policy with a `create_task` escalation
   will generate a task per breach — and if that task breaches, another one. There is no loop guard.
2. `raise_priority` mutates the customer-visible record. It changes which target *would* match
   next tick, but not the existing deadline (see [Instance lifecycle](#instance-lifecycle)).

## How the manager is resolved

```js
// sla.service.js:388
case 'notify_manager': {
  const mgr = await this.#managerOf(ownerId);
  if (mgr) await this.#notify(mgr, title, body, link);
  break;
}

// sla.service.js:414
async #managerOf(employeeId) {
  if (!employeeId) return null;
  const row = await this.db.employeeHierarchy.findFirst({
    where: { descendant_id: employeeId, depth: 1 },
    select: { ancestor_id: true },
  });
  return row?.ancestor_id || null;
}
```

`employee_hierarchy` ([schema:140](../../backend/prisma/schema.prisma#L140)) is a **closure table** —
one row per (ancestor, descendant, depth) pair, including `depth: 0` self-rows. It is maintained by
[`hierarchy.service.js`](../../backend/src/services/hierarchy.service.js) whenever an employee's
manager is set or changed, and seeded at signup
([`routes/auth/index.js:359-369`](../../backend/src/routes/auth/index.js#L359-L369)) and tenant
provisioning ([`routes/platform/index.js:152`](../../backend/src/routes/platform/index.js#L152)).

So `depth: 1` = **the direct manager, one hop up**. Escalation is single-level; there is no
skip-level or role-based fallback anywhere in the engine.

```text
crm_cases.owner_id ─┐
tasks.assigned_to  ─┼─► ownerId ─► employee_hierarchy (descendant_id = ownerId, depth = 1)
crm_leads.owner_id ─┘                        │
                                             ▼
                                        ancestor_id  ─► notifications.employee_id
```

> **The #1 cause of "manager escalation didn't work" is a missing `depth: 1` row** — an owner with
> no manager assigned, a hierarchy never rebuilt after a re-org, or a record whose owner field is
> null. All three fail silently. There is no log line and no fallback recipient. If you touch this
> code, adding a `this.log.warn` on the null branches is a two-line, high-value change.

## How it reaches the manager's screen

There is **no push** — no WebSocket, no SSE, no email. Two independent 30-second client polls:

| Path | Client | Endpoint | Scope |
| ---- | ------ | -------- | ----- |
| Bell badge | [`NotificationBell.jsx:36`](../../frontend/src/components/ui/NotificationBell.jsx#L36) `refetchInterval: 30_000` | `GET /api/notifications/count`, list on open | `employee_id` from the JWT — the manager sees the row because their id was written into it |
| SLA board | [`SlaDashboardPage.jsx:113-115`](../../frontend/src/pages/runtime/SlaDashboardPage.jsx#L113-L115) `refetchInterval: 30_000` | `GET /api/sla/dashboard?scope=team` | reads `sla_instances` directly — needs no notification row |

```text
t+0s    case first-response deadline passes
t+≤60s  reconcile tick → breached=true → INSERT notifications(employee_id = manager)
t+≤90s  manager's bell badge increments      ← worst case 60 + 30
```

The two paths are independent: the dashboard shows a breach even if `notify_manager` was never
configured (or silently did nothing), because it derives status from `due_at` client-side via
[`timerState()`](../../frontend/src/utils/sla.js). **Use the dashboard, not the bell, to verify the
engine is working.**

Note the scope asymmetry: the escalation notifies **only the direct manager** (`depth: 1`), while
`scope: 'team'` on the dashboard shows the **entire sub-tree** (`#teamIds:521`, `depth >= 0`).
Scope is also downgraded server-side by role level —
[`routes/sla/index.js:28-31`](../../backend/src/routes/sla/index.js#L28-L31) demotes `all` → `team`
→ `me` if the caller's `role_level` is above the admin/manager thresholds.

---

# Part 3 — Working on it

## API surface

All under `/api/sla`, mounted at [`app.js:297`](../../backend/src/app.js#L297).

| Method | Path | Guard | Notes |
| ------ | ---- | ----- | ----- |
| GET | `/dashboard?scope=me\|team\|all` | authenticate | scope downgraded by `role_level`; returns `{ summary, breakdown, timers, scope }` |
| POST | `/reconcile` | requireAdmin | **runs a full tick synchronously** — the testing hook |
| GET/POST/PUT/DELETE | `/business-hours[/:id]` | GET authenticate, writes requireAdmin | setting `is_default` clears it on all others |
| GET | `/policies`, `/policies/:id` | authenticate | includes targets, escalations, calendar |
| POST | `/policies` | requireAdmin | validates `entity_type ∈ {case, lead, task}` |
| PUT | `/policies/:id` | requireAdmin | **does not validate `entity_type`** — see gaps #1 |
| DELETE | `/policies/:id` | requireAdmin | cascades to targets/escalations/instances |
| POST | `/seed-defaults` | requireAdmin | no-op if any policy exists; creates a 9–5 calendar + 3 policies |

`PUT /policies/:id` **deletes and recreates all targets and escalations** whenever either array is
present ([`routes/sla/index.js:99-108`](../../backend/src/routes/sla/index.js#L99-L108)). Row ids
therefore change on every save. Instances reference `policy_id`, not `target_id`, so they survive —
do not add a FK from `sla_instances` to `sla_targets` without changing that write strategy.

Dashboard aggregation ([`getDashboard:448`](../../backend/src/services/sla.service.js#L448)) runs
**inside a request**, so it *is* tenant-scoped by the middleware. It buckets every instance into
`on_track | at_risk | breached | met | met_late`, computes `compliance = metOnTime / completed`,
and enriches the 60 most urgent open timers with record labels and owner names
([`#enrich:536`](../../backend/src/services/sla.service.js#L536)).

## Extension recipes

### Add an escalation action

1. Add the `case` to the `switch` in
   [`#runEscalations:383`](../../backend/src/services/sla.service.js#L383) and a private method
   beside `#notify` / `#raisePriority`.
2. Add the option to `ACTIONS` in
   [`SlaBuilderPage.jsx:15`](../../frontend/src/pages/builder/SlaBuilderPage.jsx#L15) — the array
   is `[value, label]` pairs and drives the dropdown directly.
3. `action` is `VarChar(40)`; no enum, no migration needed.
4. Read per-action settings from `esc.config` (JSON, currently unused by every action).
5. Keep the work inside the existing `try/catch` contract: throw freely, it will be logged and the
   remaining actions will still run.

*Example — notify a role instead of a person:* read `esc.config.role`, query employees by
`role_level`, loop `#notify`. Keep it to one query; this runs per breach per record.

### Add an entity type

Add a key to the `ENTITY` map ([`:24`](../../backend/src/services/sla.service.js#L24)) with
`model`, `statusField`, `dimField`, `ownerField`, `openWhere`, `priorityLadder`, `label` and
`metricStatus`. The engine body is fully driven by that map — `reconcile()` iterates
`Object.keys(ENTITY)`. Then:

- add the value to `ENTITIES` and `PRIORITY_HINTS` in
  [`SlaBuilderPage.jsx:12,20`](../../frontend/src/pages/builder/SlaBuilderPage.jsx#L12-L23),
- add labels to `ENTITY_LABEL` / `ENTITY_SINGULAR` in
  [`frontend/src/utils/sla.js`](../../frontend/src/utils/sla.js),
- extend the `entity_type` validation in `POST /policies`
  ([`routes/sla/index.js:93`](../../backend/src/routes/sla/index.js#L93)),
- extend `byType` in [`#enrich:537`](../../backend/src/services/sla.service.js#L537) or the
  dashboard will silently drop those timers (`byType[i.entity_type]?.push` — the `?.` swallows it).

### Add a metric

`metric` is a free `VarChar(30)`. Add the key to that entity's `metricStatus` (a
`(rec) => 'running' | 'met' | 'canceled'` function), add a label to `METRIC_LABEL`
([`:65`](../../backend/src/services/sla.service.js#L65)) and to `METRICS` in the builder. The
per-metric loop in `#processRecord` picks it up automatically. Remember there is no timestamp
column behind these — the status function must be derivable from the record's current row.

### Repeat / multi-level escalation

The most-requested enhancement. The blocker is that `warned`/`breached` are booleans, so "fire
again after N minutes" has nowhere to record the last send. Minimal design:

1. Add `last_escalated_at DateTime?` and `escalation_level Int @default(0)` to `SlaInstance`.
2. Store cadence in the existing `sla_escalations.config`, e.g. `{ "repeat_minutes": 120, "level": 2 }`.
3. In the breach branch, replace `!existing.breached` with a second condition:
   `existing.breached && cfg.repeat_minutes && now - last_escalated_at >= repeat_minutes`.
4. For skip-level, extend `#managerOf(employeeId, depth = 1)` — the closure table already
   supports `depth: 2` with no schema change.

### Make escalations real-time

Replace the poll, not the engine. The notification row is already written; the missing piece is a
push channel. Cheapest credible step: emit on the existing notification insert and have
`NotificationBell` subscribe, keeping the 30 s poll as the fallback. Do **not** shorten the
reconcile interval to chase latency — the tick cost scales with open-record count.

### A note on `entity_type` being locked in the UI

The "Applies to" select is disabled when editing
([`SlaBuilderPage.jsx:235`](../../frontend/src/pages/builder/SlaBuilderPage.jsx#L235) `disabled={isEdit}`).
That is deliberate: targets are keyed by a per-entity priority vocabulary, and flipping the entity
would make `pickTarget` fall through to `*` or null, which cancels every live instance on the next
tick (`existing && !target`). If you make it editable, you must also reset the targets and warn
about the cancellation. The API does not enforce the lock — see gaps #1.

## Testing the engine

**There are currently no SLA tests** in [`backend/tests/`](../../backend/tests). Two obstacles and
how to get past them:

1. **The pure helpers are not exported.** `addBusinessMinutes`, `businessMinutesBetween`,
   `conditionsMatch` and `pickTarget` are module-private; only the class is exported
   ([`:572`](../../backend/src/services/sla.service.js#L572)). They are genuinely pure and are the
   highest-value unit tests in the file (DST-free offset math, holiday skipping, the `*` fallback).
   Change the last line to `module.exports = SlaService; module.exports._internals = { … }` — no
   behavioural risk.
2. **Time is read via `new Date()` inside the methods.** For integration tests, prefer driving
   state through `POST /api/sla/reconcile` with records whose `created_at` is backdated far enough
   to cross the threshold — that exercises the real path without faking the clock.

A worthwhile first suite: create a policy with a 60-minute `first_response` target and a
`notify_manager` breach escalation, insert a case owned by an employee with a `depth: 1` manager
row and `created_at` two hours ago, call `reconcile()` twice, then assert **exactly one**
`notifications` row for the manager — that single test covers policy match, target pick, backfill,
edge-trigger latching and manager resolution.

## Known gaps and traps

Ordered by how likely they are to bite you. None of these are hypothetical — each is visible in the
code as written.

1. **`PUT /policies/:id` does not validate `entity_type`.** `POST` restricts it to
   `case | lead | task` ([`:93`](../../backend/src/routes/sla/index.js#L93)); `buildPolicyData`
   passes it straight through on update ([`:177`](../../backend/src/routes/sla/index.js#L177)). An
   API client can set an arbitrary string that no reconcile pass will ever match — the policy goes
   dark and every live instance under it gets canceled.
2. **The escalation deep link goes nowhere useful.** Notifications carry
   `link = /sla?focus=case:123`, but `SlaDashboardPage` never reads a `focus` param — the manager
   lands on their default `scope: 'me'` board where the offending record may not even appear.
   Either implement the param or change the link to the record.
3. **One notification per breach, forever.** See [When escalations fire](#when-escalations-fire).
   A breach nobody acts on notifies once on day one and never again.
4. **Already-breached records notify nobody.** Backfill on creation is deliberately silent, so
   anything that breaches while the server is down is recorded but never escalated.
5. **`getDashboard` truncates at 2000 rows** ([`:449-460`](../../backend/src/services/sla.service.js#L449-L460))
   ordered by `due_at asc` with no date filter, over a status set that *includes* `met`. As history
   accumulates, the oldest completed timers consume the cap and current running timers fall off the
   end — compliance figures and the urgent list silently drift. Add a `started_at` window or split
   the query.
6. **A stale `policy_id` on re-matched instances.** When a record changes such that a different
   policy now matches, escalations, pause statuses and the calendar all come from the **new**
   policy, but `sla_instances.policy_id` is never updated — so the dashboard's `by_policy`
   breakdown attributes the timer to the old one.
7. **`#running` is per-process.** Horizontal scaling will double-process every record and can
   double-send escalations. A DB advisory lock or a single designated scheduler instance is
   required before running more than one backend replica.
8. **Silent no-ops everywhere in escalation.** Missing owner, missing manager, lead + `raise_priority`,
   top-of-ladder priority, unknown action string — all return without a log line.
9. **No DST.** Fixed `utc_offset_minutes` per calendar; deadlines drift by an hour across a
   transition for zones that observe one.
10. **`create_task` can cascade.** Auto-created follow-up tasks are themselves SLA-eligible.

## Invariants — read before you change anything

If a change breaks one of these, it is a bug even if the tests pass:

- **Every engine write happens inside `tenantContext.run({ tenantId: rec.tenant_id })`.** Writes
  outside it lose tenant isolation.
- **`reconcile()` is idempotent.** Running it twice back-to-back must produce no additional rows and
  no additional notifications. The `@@unique(entity_type, entity_id, metric)` key and the
  `warned`/`breached` latches are what guarantee this — do not weaken either.
- **The engine is the sole writer of `sla_instances`.** If another service needs to influence a
  timer, it should change the *record* (status, priority, owner) and let the next tick derive the
  consequence.
- **`met` and `canceled` are terminal.** Nothing may transition out of them.
- **No entity-specific branching in the engine body.** New entity behaviour belongs in the `ENTITY`
  map, not in `if (type === …)`.
- **Escalation actions never throw out of `#runEscalations`.** Each is individually caught; keep it
  that way so one failure cannot suppress the others or the latch write.

---

## Related documents

- [WORKFLOW_ENGINE.md](WORKFLOW_ENGINE.md) — the other background scheduler; similar tick model, different execution semantics
- [DATA_DICTIONARY.md](DATA_DICTIONARY.md) — column-level reference for the `sla_*` tables
- [API_REFERENCE.md](API_REFERENCE.md) — full REST surface
- [ARCHITECTURE_AND_SETUP.md](ARCHITECTURE_AND_SETUP.md) — tenant scoping, service layer conventions
