# Genesis CRM — Lead Scoring Engine Technical Reference

For: Developers extending or debugging lead scoring

Everything here reflects the **actual implementation** in
[`backend/src/services/lead-scoring.service.js`](../../backend/src/services/lead-scoring.service.js) (635 lines),
[`backend/src/routes/lead-scoring/index.js`](../../backend/src/routes/lead-scoring/index.js),
[`backend/src/utils/lead-grade.js`](../../backend/src/utils/lead-grade.js), the scoring hook inside
[`record.service.js`](../../backend/src/services/record.service.js), and the `lead_scoring_rules` /
`lead_scores` tables. Line references are given as `file:LNN` and were accurate at the time of
writing — grep the symbol name if they drift.

For the end-user view of the same feature, see
[user-guide/08-lead-scoring-rules.md](../user-guide/08-lead-scoring-rules.md).

---

## Table of Contents

Part 1 — How the engine works

1. [Mental model](#mental-model)
2. [Leads vs Prospects — the split that explains everything](#leads-vs-prospects--the-split-that-explains-everything)
3. [What triggers a score](#what-triggers-a-score)
4. [Where the data lives](#where-the-data-lives)
5. [Rule evaluation](#rule-evaluation)
6. [Operator reference](#operator-reference)
7. [What gets persisted](#what-gets-persisted)
8. [Grading](#grading)
9. [How a score reaches the UI](#how-a-score-reaches-the-ui)

Part 2 — Working on it

10. [API surface](#api-surface)
11. [Extension recipes](#extension-recipes)
12. [Testing the engine](#testing-the-engine)
13. [Known gaps and traps](#known-gaps-and-traps)
14. [Invariants — read before you change anything](#invariants--read-before-you-change-anything)

---

# Part 1 — How the engine works

## Mental model

Lead scoring is a **synchronous, write-time, additive rule sum**. It is the opposite of the
[SLA engine](SLA_ENGINE.md), and it is worth holding both models in your head because the codebase
contains one of each:

| | SLA engine | Lead scoring engine |
| --- | --- | --- |
| Execution | 60 s background reconcile loop | inline, when a lead record is written |
| Trigger | polling `openWhere` queries | `RecordService.createRecord` / `updateRecord`, or an explicit API call |
| State | derived and self-healing | **persisted and never recomputed on its own** |
| Rule selection | first policy by `order_index` wins | **every active rule is evaluated, all matches accumulate** |
| Recovery from a config change | automatic on the next tick | none — stale scores stay stale |

Three consequences follow directly, and most confusion about this engine traces back to one of them:

1. **All matching rules stack.** There is no first-match-wins and no per-type cap. Four rules
   matching at 20 points each produce 80 points.
2. **Nothing re-scores in the background.** Change a rule's points and every existing
   `lead_scores` row keeps the old number until that specific lead is edited again or someone calls
   the scoring API. There is no scheduler for this engine at all.
3. **The score is a plain integer with a floor and no ceiling.** `Math.max(0, totalScore)` at
   [`:334`](../../backend/src/services/lead-scoring.service.js#L334) clamps negatives to zero;
   nothing clamps the top. The A–F bands are absolute thresholds, so adding rules inflates grades
   across the whole database (see [Grading](#grading)).

## Leads vs Prospects — the split that explains everything

Genesis has **two lead-ish entities**, and the scoring engine talks to both — asymmetrically. Get
this wrong and nothing else in the file makes sense.

| | **Lead** (raw inbound) | **Prospect** (qualified) |
| --- | --- | --- |
| Table | `crm_lead_intake` | `crm_leads` |
| UI object name | `lead_intake` (label "Lead", plural "Leads" — in the generic CRM template) | `lead` |
| Score FK | `lead_scores.lead_intake_id` | `lead_scores.lead_id` |
| Service method | [`scoreLeadIntake:188`](../../backend/src/services/lead-scoring.service.js#L188) | [`scoreLead:109`](../../backend/src/services/lead-scoring.service.js#L109) |
| Scored automatically? | **yes** — on every create/update | no |
| Reachable from `/api/lead-scoring/*`? | **no** | yes (every endpoint) |

`LeadScore` carries **both nullable FKs** ([schema:1920-1939](../../backend/prisma/schema.prisma#L1920-L1939))
and exactly one is set per row. The schema comments say it plainly: `lead_intake_id` is
"the primary scoring target", `lead_id` is "legacy/manual scoring".

> **The asymmetry is the single most important thing in this document.** Automatic scoring writes
> `lead_intake_id`. Every REST endpoint under `/api/lead-scoring/leads/*` and `/bulk-score` writes or
> reads `lead_id`. So the API cannot rescore the records the engine actually scores — see
> [Known gaps](#known-gaps-and-traps) #2. If you are adding anything to this engine, decide which
> entity you are targeting *first*.

Both methods share the same rule set and the same evaluation core, so a rule written against
`job_title` behaves identically on either entity — the selected column list is deliberately
identical in both methods.

## What triggers a score

There are exactly three entry points. No scheduler, no event-bus subscription, no DB trigger.

### 1. Automatic — a Lead record is created or updated

[`record.service.js:1075`](../../backend/src/services/record.service.js#L1075) (create) and
[`:1102`](../../backend/src/services/record.service.js#L1102) (update) both end with:

```js
if (crmData) this.#maybeScoreLead(record.id, objectId, tenantId);   // fire-and-forget, not awaited
```

[`#maybeScoreLead:194`](../../backend/src/services/record.service.js#L194) then guards three times
before doing any work:

```js
if (!this.scoringSvc) return;                       // service not wired
const obj = await this.db.uiObject.findUnique(…);
if (!obj || obj.name !== 'lead_intake') return;     // not a Lead
const intake = await this.db.crmLeadIntake.findUnique({ where: { record_id: … } });
if (!intake) return;                                // CRM entity not persisted yet
await this.scoringSvc.scoreLeadIntake(intake.id, tenantId, true);   // recalculate = true
```

Points worth noting:

- **Not awaited.** The HTTP response does not wait for scoring, and a scoring failure cannot fail
  the record write. Errors are caught and logged as `[RecordService] lead auto-scoring failed`.
- **`recalculate = true`.** The automatic path always recomputes; the `recalculate` flag only
  matters on the read-through path (below).
- **Requires `crmData`.** A record update that touches only `assigned_to` or the pipeline stage does
  **not** rescore.
- **Tenant context survives.** The promise is started inside the request's `AsyncLocalStorage`
  context, so the Prisma tenant middleware still scopes the rule query and stamps `tenant_id` on the
  new `lead_scores` row. Do not move this call into a detached timer/queue without re-establishing
  the context.
- Wiring lives in [`routes/runtime/index.js:47-50`](../../backend/src/routes/runtime/index.js#L47-L50) —
  `RecordService` receives the scoring service as its fifth constructor argument. Anywhere
  `RecordService` is constructed without it, auto-scoring silently does nothing.

### 2. Read-through — `GET /api/lead-scoring/leads/:id/score`

[`getLeadScore:414`](../../backend/src/services/lead-scoring.service.js#L414) looks for an existing
row and, if there is none, **scores on demand and stores the result**. A GET that writes; harmless
but worth knowing before you wrap it in a cache.

### 3. Explicit — `POST .../score`, `POST /bulk-score`

Force a recalculation with `recalculate = true`. `bulkScoreLeads` walks `crm_leads` in pages of
`limit`/`offset`, in batches of 10 via `Promise.all`, collecting per-lead `success`/`failed` results
so one bad lead cannot abort the run ([`:257`](../../backend/src/services/lead-scoring.service.js#L257)).

## Where the data lives

| Table | Written by | Read by the engine | Notes |
| ----- | ---------- | ------------------ | ----- |
| `lead_scoring_rules` | Builder UI → `/api/lead-scoring/rules` | every scoring call, `where: { is_active: true }`, `orderBy: order_index` | `operator`/`rule_type` are free `VarChar` — no enum |
| `lead_scores` | **the engine only** | dedup lookup before write | both FKs nullable, exactly one set; `scoring_details` JSON holds the audit trail |
| `crm_lead_intake` | the app | 14-column `select` in `scoreLeadIntake` | the primary scoring target |
| `crm_leads` | the app | identical `select` in `scoreLead` | legacy/manual target |
| `ui_objects` | seed/builder | `#maybeScoreLead` reads `name` to gate on `lead_intake` | |

Both scoring methods run inside `db.$transaction`, so the read of the existing score, the rule
fetch, and the write are atomic per lead.

The **rule ordering** (`order_index`) has no effect on the result — every rule is evaluated and the
points are summed, so ordering is presentation only. It is *not* a precedence mechanism, unlike the
SLA engine's `order_index`.

## Rule evaluation

[`#calculateScore:315`](../../backend/src/services/lead-scoring.service.js#L315) is the whole
algorithm:

```js
for (const rule of rules) {
  if (this.#evaluateRule(rule, leadData)) {
    appliedRules.push({ rule_id, rule_name, rule_type, points, field, matched_value });
    totalScore += rule.points;
  }
}
return {
  totalScore: Math.max(0, totalScore),
  breakdown: {
    rules: appliedRules,
    total_rules_applied: appliedRules.length,
    demographic_score: …, behavioral_score: …, engagement_score: …,   // #getScoreByType
  },
};
```

- `points` is a signed `Int` — **negative rules are supported** and are the intended way to subtract points for
  (free email domains, competitor company names). The total is floored at 0, individual rules are not.
- The three `*_score` buckets are computed by filtering `appliedRules` on `rule_type`
  ([`#getScoreByType:406`](../../backend/src/services/lead-scoring.service.js#L406)). A rule with any
  other `rule_type` string still counts toward `totalScore` but appears in **none** of the buckets —
  the breakdown will not add up to the total. See [Known gaps](#known-gaps-and-traps) #6.
- `matched_value` snapshots the field value at scoring time, which is what makes
  `scoring_details` a genuine audit trail rather than a recomputation.

### Field resolution

```js
const fieldValue = leadData[rule.field_name];   // #evaluateRule:346
```

A **direct property read on the selected columns** — not a metadata field lookup and not a JSON
path. Two implications:

1. Only the ~14 columns in each method's `select` can be scored. A rule naming any other column
   (`mobile`, `city`, `owner_id`, a custom field) reads `undefined` and, per the null rule below,
   matches only `is_empty`. It fails silently — there is no validation at rule-creation time.
2. To score a new field you must add it to **both** `select` blocks
   ([`:117-134`](../../backend/src/services/lead-scoring.service.js#L117-L134) and
   [`:197-212`](../../backend/src/services/lead-scoring.service.js#L197-L212)).

### Null semantics

```js
// #evaluateRule:350
if (fieldValue === null || fieldValue === undefined) {
  return rule.operator === 'is_empty';
}
```

Every operator except `is_empty` returns `false` on a null field — **including the negative ones**.
"industry `not_equals` Retail" does **not** match a lead with no industry, which is usually the
opposite of what the rule author intended. Empty string is not caught by this guard; it falls
through to the operator (where `is_empty` also returns true for `''`).

## Operator reference

All fourteen live in the `switch` at
[`#evaluateRule:345-403`](../../backend/src/services/lead-scoring.service.js#L345-L403).

| Operator | Comparison | Case-sensitive | In the Builder UI? |
| -------- | ---------- | -------------- | ------------------ |
| `equals` / `not_equals` | `String(field)` vs `String(value)` | yes | yes |
| `contains` / `not_contains` | substring, **both sides lowercased** | no | yes |
| `starts_with` / `ends_with` | prefix/suffix, lowercased | no | **no** |
| `greater_than` / `less_than` | `Number(field)` vs `Number(value)` | — | yes |
| `greater_equal` / `less_equal` | numeric | — | **no** |
| `is_empty` | `!fieldValue \|\| fieldValue === ''` | — | yes |
| `is_not_empty` | `fieldValue && fieldValue !== ''` | — | yes |
| `in_list` | `String(value).split(',').map(trim)` contains `String(field)` | **yes** | yes |
| `not_in_list` | negation of `in_list` | yes | **no** |
| *anything else* | `default: return false` | — | — |

Five operators the engine supports are missing from `OPERATORS` in
[`LeadScoringBuilderPage.jsx:29-39`](../../frontend/src/pages/builder/LeadScoringBuilderPage.jsx#L29-L39).
They work when created through the API; the Builder's `<Select>` simply has no matching option, so
opening such a rule in the edit modal will not display its operator correctly.

> **`contains` is a substring test, not a list test.** This is the trap that bit the seeded default
> rules — `contains: 'VP, Director, Chief, President, Owner, Founder'` requires the job title to
> literally contain that entire comma-separated string. Use `in_list` for a set of values, or one
> `contains` rule per token. See [Known gaps](#known-gaps-and-traps) #1.

Numeric operators are safe on `Decimal` columns (`annual_revenue` is `Decimal(18,2)`): Prisma
returns a Decimal object, and `Number()` coerces it correctly via `valueOf`. They are **not** safe
on non-numeric text — `Number('enterprise')` is `NaN`, and every comparison against `NaN` is false,
so such a rule silently never matches.

## What gets persisted

One `lead_scores` row per lead, found by `findFirst` + `orderBy: { calculated_at: 'desc' }` and then
updated in place ([`:142`](../../backend/src/services/lead-scoring.service.js#L142) /
[`:219`](../../backend/src/services/lead-scoring.service.js#L219)):

```json
{
  "total_score": 65,
  "calculated_at": "2026-08-27T09:14:22.000Z",
  "scoring_details": {
    "rules": [
      { "rule_id": 3, "rule_name": "Target Industry", "rule_type": "demographic",
        "points": 15, "field": "industry", "matched_value": "Technology" }
    ],
    "total_rules_applied": 4,
    "demographic_score": 20,
    "behavioral_score": 35,
    "engagement_score": 10
  }
}
```

`scoring_details` is the contract two other places depend on — do not reshape it casually:

- [`deleteScoringRule:81`](../../backend/src/services/lead-scoring.service.js#L81) queries
  `scoring_details` with the JSON path `$.rules[*].rule_id` and `array_contains` to decide between a
  **soft delete** (deactivate, because the rule appears in historical scores) and a **hard delete**
  (never used). That path expression is MySQL JSON syntax — the datasource provider is `mysql`
  ([schema:9](../../backend/prisma/schema.prisma#L9)) — and would need rewriting on a Postgres move.
- [`RecordService.#summarizeScoringDetails`](../../backend/src/services/record.service.js#L1032)
  renders `rules[]` into the human-readable `"Rule name: +15 pts"` lines shown in the UI.

There is **no unique constraint** on `lead_scores.lead_intake_id` or `lead_id` — uniqueness is a
convention enforced by find-then-update, not by the database.

## Grading

The score → letter mapping lives in
[`backend/src/utils/lead-grade.js`](../../backend/src/utils/lead-grade.js), extracted precisely
because it had been duplicated and had drifted:

```js
const DEFAULT_GRADE_BANDS = [
  { grade: 'A', min: 80 }, { grade: 'B', min: 60 },
  { grade: 'C', min: 40 }, { grade: 'D', min: 20 }, { grade: 'F', min: 0 },
];
leadScoreGrade(score, bands = DEFAULT_GRADE_BANDS)   // highest band whose min is met, sorted defensively
gradeLetters(bands)                                   // distinct grades, descending
```

`leadScoreGrade` already **accepts a per-tenant band override** — the metadata-driven hook is
built. Nothing passes one yet; every call site uses the default. That is the cheapest real
enhancement available in this engine (see [recipes](#extension-recipes)).

Because bands are absolute and the total is unbounded, **grades inflate as rules are added**. The
twelve seeded defaults sum to 160 points if every one matched, so a "perfect" lead is far above the
A threshold of 80 and the band spread compresses. If you add rules, revisit the bands — or move to
percentage-of-maximum, which is a genuine behaviour change and needs a migration plan for existing
rows.

## How a score reaches the UI

Two separate surfaces, both read-only — the UI never writes a score.

**1. Inline on the Leads list and detail.**
[`RecordService.#attachLeadScores:956`](../../backend/src/services/record.service.js#L956) merges
the latest score into `record.data` when the object is `lead_intake`:

```js
return { ...r, data: { ...r.data, score: total, grade: leadScoreGrade(total) } };
```

The matching `score` and `grade` fields belong on the Lead object with
`config: { always_disabled: true, show_in_list: true }` — they are engine-owned columns
rendered like any other field but never editable. Called from
[`getRecords:900`](../../backend/src/services/record.service.js#L900) and
[`getRecord:916`](../../backend/src/services/record.service.js#L916).

**2. The insights panel.** [`LeadScoringInsights.jsx`](../../frontend/src/components/runtime/LeadScoringInsights.jsx)
renders grade distribution, headline KPIs and the top 5 leads from
`/api/lead-scoring/{distribution,analytics,top}` with a 60 s `staleTime`. It is mounted only on the
Leads module ([`ModulePage.jsx:803`](../../frontend/src/pages/runtime/ModulePage.jsx#L803)) and
returns `null` until at least one lead has been scored.


---

# Part 2 — Working on it

## API surface

All under `/api/lead-scoring`, mounted at [`app.js:294`](../../backend/src/app.js#L294).

| Method | Path | Guard | Target | Notes |
| ------ | ---- | ----- | ------ | ----- |
| GET | `/rules?rule_type=&is_active=` | authenticate | — | omitting `is_active` returns active **and** inactive, so the Builder can reactivate soft-deleted rules |
| POST | `/rules` | requireAdmin | — | no validation of `operator`, `field_name` or `rule_type` |
| PUT | `/rules/:id` | requireAdmin | — | partial update; only provided keys are written |
| DELETE | `/rules/:id` | requireAdmin | — | soft-deactivates if the rule appears in any `scoring_details`, hard-deletes otherwise |
| POST | `/rules/setup-defaults` | requireAdmin | — | seeds 12 rules; **not idempotent** — calling twice creates duplicates |
| GET | `/leads/:id/score` | authenticate | Prospect | scores on demand if absent |
| POST | `/leads/:id/score` | authenticate | Prospect | force recalculate — note: **not** admin-guarded |
| POST | `/bulk-score` | requireAdmin | Prospect | `{ limit = 100, offset = 0 }`, batches of 10 |
| GET | `/top?limit=` | authenticate | both | ordered by `total_score` desc, includes both relations |
| GET | `/analytics` | authenticate | both | count/avg/max/min + distribution |
| GET | `/distribution` | authenticate | both | A–F counts and percentages |

Tenant isolation on every one of these comes from the Prisma middleware, not from explicit `where`
clauses — the service passes `tenantId` only on **create** paths (`leadScore.create`,
`leadScoringRule.create`), where the middleware needs it stamped.

`getScoreDistribution` ([`:441`](../../backend/src/services/lead-scoring.service.js#L441)) selects
**every** `lead_scores` row for the tenant and buckets in JS. Fine at thousands, not at millions —
push it into a `groupBy` when it starts showing up in slow-query logs.

## Extension recipes

### Add an operator

1. Add a `case` to the `switch` in
   [`#evaluateRule:345`](../../backend/src/services/lead-scoring.service.js#L345). Return a boolean;
   remember the null guard above already short-circuited null fields.
2. Add it to `OPERATORS` in
   [`LeadScoringBuilderPage.jsx:29`](../../frontend/src/pages/builder/LeadScoringBuilderPage.jsx#L29).
3. No migration — `operator` is `VarChar(50)` with no enum or CHECK constraint.
4. Add a case to the operator block in
   [`backend/tests/lead-scoring.test.js:285`](../../backend/tests/lead-scoring.test.js#L285); the
   existing tests give you the exact fixture shape.

### Score a new field

Add the column to **both** `select` blocks (`scoreLead` and `scoreLeadIntake`) — they must stay
identical or the same rule will behave differently on Leads and Prospects — then add it to
`LEAD_FIELDS` in
[`LeadScoringBuilderPage.jsx:41`](../../frontend/src/pages/builder/LeadScoringBuilderPage.jsx#L41).
Nothing else is needed; `#evaluateRule` reads it by name.

For a field that is *not* a column on the entity (a custom/EAV field, a related-record aggregate),
`leadData[field]` will not find it. Either widen the object passed to `#calculateScore` — it takes a
plain object, so a resolver can compose one — or, better, precompute the signal into a real column
first, so scoring stays a pure function of a flat record.

### Add a `rule_type` bucket

`rule_type` is a free `VarChar(50)`. Adding one means: a `#getScoreByType` line in the breakdown at
[`:338-340`](../../backend/src/services/lead-scoring.service.js#L338-L340), an entry in `RULE_TYPES`
and `TYPE_COLORS` in the Builder
([`:23`, `:54`](../../frontend/src/pages/builder/LeadScoringBuilderPage.jsx#L23-L58)), and a
decision about historical rows that carry the old value. Until the breakdown line exists, the new
type's points count toward the total but appear in no bucket.

### Per-tenant grade bands

The plumbing exists — `leadScoreGrade(score, bands)` and `gradeLetters(bands)` both take an
override. To finish it: store bands in the tenant settings model, load them where grading happens
(`getScoreDistribution`, `#attachLeadScores`, `#getLeadScoreRecords`), and pass them through.
**Also replace the hardcoded duplicate `gradeFor()` in
[`LeadScoringInsights.jsx:10`](../../frontend/src/components/runtime/LeadScoringInsights.jsx#L10)**,
which reintroduces exactly the drift `lead-grade.js` was extracted to prevent — expose the bands on
an API response and have the component read them.

### Rescore everything after a rule change

Today there is no supported path for Leads (`bulkScoreLeadIntakes` exists but has no route). The fix
is four lines — route `POST /bulk-score-intake` to the existing method — plus a decision about *when*
to trigger it. Options, cheapest first:

1. Manual admin button (route the existing method; recommended first step).
2. Fire it from the rule create/update/delete handlers, in the background.
3. A periodic sweep re-scoring leads whose `calculated_at` predates the newest rule's `updated_at` —
   the closest thing to the SLA engine's self-healing property.

Whichever you choose, keep the existing batch-of-10 pattern; scoring is a transaction per lead and
an unbounded `Promise.all` over thousands of leads will exhaust the connection pool.

### Real behavioural / engagement signals

Today "behavioral" and "engagement" rules read static columns (`rating`, `email`, `website`) — there
is no event history behind them. Genuine behavioural scoring (email opens, page views, form
submissions, call outcomes) needs an event table and an aggregate the rule can address. Design it so
the aggregate lands on a column or a composed object passed into `#calculateScore`; keep
`#evaluateRule` a pure function of `(rule, flatRecord)` and it stays testable.

## Testing the engine

Unlike the SLA engine, this one **has a real suite**:
[`backend/tests/lead-scoring.test.js`](../../backend/tests/lead-scoring.test.js) (457 lines), with a
mocked Prisma client — no database required. Covered today:

- rule CRUD, including both branches of the soft/hard delete decision
- `scoreLead` and `scoreLeadIntake`, including the `recalculate` flag and the
  `lead_intake_id`-vs-`lead_id` distinction
- six operators (`equals`, `contains`, `greater_than`, `in_list`, `is_empty`, `is_not_empty`) and a
  no-match case
- `getTopScoredLeads`, `getScoringAnalytics`, `getScoreDistribution`

Not covered, in rough order of value:

1. The remaining eight operators — `starts_with`, `ends_with`, `greater_equal`, `less_equal`,
   `not_equals`, `not_contains`, `not_in_list`, and the `default: return false` fallthrough.
2. **Negative points and the `Math.max(0, …)` floor.**
3. Null-field semantics — that a negative operator does *not* match a null field is exactly the kind
   of behaviour a test should pin down before someone "fixes" it.
4. `#maybeScoreLead`'s three guards, in `record.service`'s own tests.
5. `leadScoreGrade` band boundaries (79/80, 0, negative, a custom band set) — pure function, trivial
   to test, currently untested.

`#calculateScore` and `#evaluateRule` are private but reachable through `scoreLead` with a mocked
`crmLead.findUnique`, which is how the existing operator tests work — follow that pattern rather
than exporting them.

## Known gaps and traps

Ordered by how likely they are to bite you. Each is visible in the code as written.

1. **Two of the twelve seeded default rules can never match.** "Senior Job Title" (20 pts) and
   "Manager Job Title" (10 pts) use `contains` with a comma-separated list
   ([`:475-520`](../../backend/src/services/lead-scoring.service.js#L475-L520)), but `contains` is a
   single-substring test — the job title would have to literally read
   `"… vp, director, chief, president, owner, founder …"`. 30 points of demographic scoring is dead
   on every tenant that ran `setup-defaults`. Fix by switching to `in_list` (exact tokens) or by
   splitting each into one rule per token (substring semantics preserved).
2. **The API cannot rescore the entity that is actually scored.** `POST /bulk-score` and
   `/leads/:id/score` operate on `crm_leads` (Prospects), while automatic scoring writes
   `crm_lead_intake` (Leads). `bulkScoreLeadIntakes:286` implements the missing half but **no route
   calls it** — dead code. An admin pressing "rescore" today changes nothing on the Leads module.
3. **Nothing recalculates when rules change.** Editing points, adding a rule or deactivating one
   leaves every existing score untouched. Combined with #2, there is currently no supported way to
   backfill Leads at all.
4. **`setup-defaults` is not idempotent.** It has no existence check (contrast the SLA engine's
   `seed-defaults`, which returns early if any policy exists). Calling it twice doubles every
   default rule and therefore roughly doubles everyone's score.
5. **The grade bands are duplicated in the frontend.** `gradeFor()` in
   [`LeadScoringInsights.jsx:10`](../../frontend/src/components/runtime/LeadScoringInsights.jsx#L10)
   hardcodes 80/60/40/20 — the exact duplication `lead-grade.js` was created to eliminate. Any band
   change must be made in two languages, and the backend's tenant-override parameter is unused.
6. **`rule_type` has three spellings.** The schema comment says
   `demographic | behavioral | firmographic` ([schema:1904](../../backend/prisma/schema.prisma#L1904)),
   the service buckets `demographic | behavioral | engagement`, and the Builder offers
   `demographic | behavioral | engagement`. The column is unconstrained, so a typo or a
   `firmographic` rule counts toward the total but vanishes from the breakdown.
7. **Five operators are unreachable from the Builder** — `starts_with`, `ends_with`,
   `greater_equal`, `less_equal`, `not_in_list`. Rules using them can be created via API but cannot
   be edited faithfully in the UI.
8. **Negative operators fail closed on nulls.** `not_equals` / `not_contains` / `not_in_list` all
   return `false` when the field is null, which is usually the opposite of the author's intent.
9. **No unique constraint on `lead_scores`.** Two concurrent writes to the same lead (an update
   racing a manual rescore) can each `findFirst` → miss → `create`, leaving duplicate rows.
   `#attachLeadScores` then relies on `orderBy calculated_at asc` and Map-overwrite ordering to pick
   a winner. A unique index on `lead_intake_id` and on `lead_id` would make this structural.
10. **`POST /leads/:id/score` is not admin-guarded** while `/bulk-score` is — any authenticated user
    can force a recalculation of any Prospect in their tenant.
11. **`getScoreDistribution` loads every score row into memory** to bucket it; it is called by both
    `/distribution` and `/analytics` (so twice per insights-panel render).
12. **MySQL-specific JSON path.** The soft-delete check uses `$.rules[*].rule_id` with
    `array_contains`; it is correct for the current `mysql` provider and will need rewriting if the
    datasource ever changes.

## Invariants — read before you change anything

If a change breaks one of these, it is a bug even if the tests pass:

- **`#evaluateRule` stays a pure function of `(rule, flatRecord)`.** No DB access, no async, no
  entity-specific branching. It is the only reason the engine is testable without a database.
- **`scoreLead` and `scoreLeadIntake` keep identical `select` blocks and share the same evaluation
  core.** They differ only in table and FK; any divergence means the same rule scores differently on
  Leads and Prospects.
- **The engine is the sole writer of `lead_scores`.** The `score`/`grade` fields on the Lead object
  are injected at read time and must stay `always_disabled` — never let a form write them back.
- **`scoring_details.rules[]` keeps its shape.** `deleteScoringRule`'s soft/hard-delete decision and
  the UI summary both parse it; changing the key names silently converts soft deletes into hard
  deletes.
- **Auto-scoring stays fire-and-forget and inside the request's tenant context.** It must never fail
  a record write, and it must never run detached from `AsyncLocalStorage`.
- **Grading goes through `leadScoreGrade`.** No new hardcoded 80/60/40/20 anywhere, in either
  language.

---

## Related documents

- [SLA_ENGINE.md](SLA_ENGINE.md) — the other rules engine; poll-and-reconcile rather than write-time, and a useful contrast
- [user-guide/08-lead-scoring-rules.md](../user-guide/08-lead-scoring-rules.md) — the admin-facing guide to writing rules
- [DATA_DICTIONARY.md](DATA_DICTIONARY.md) — column-level reference for `lead_scoring_rules` and `lead_scores`
- [API_REFERENCE.md](API_REFERENCE.md) — full REST surface
- [ARCHITECTURE_AND_SETUP.md](ARCHITECTURE_AND_SETUP.md) — tenant scoping, service layer conventions
