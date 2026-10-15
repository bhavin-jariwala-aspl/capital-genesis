# Automation Reference — Genesis CRM

**Audience:** administrators configuring the four AUTOMATE sections, and the engineers who maintain
them.

---

## Choosing the right tool

The single most expensive configuration mistake is reaching for the wrong mechanism. All four can
technically produce the same outcome; only one of them is easy to reason about six months later.

| The question you are answering | Use | Why not the others |
|---|---|---|
| "Who owns this record?" | **Assignment Rules** | A workflow can set an owner, but you lose round-robin state, load balancing, and the assignment log. |
| "How long may this take, and who hears about it if we slip?" | **SLA Engine** | Only the SLA engine measures against a working calendar and gives you breach reporting. A workflow with a delay is a nudge, not a commitment. |
| "Who should we call first?" | **Lead Scoring** | Scoring ranks a queue. It deliberately does nothing on its own. |
| "Something should happen *because* a record changed" | **Workflows** | The general-purpose tool. Use it when none of the three above fit. |

A workflow can *read* a lead score in a condition, which is how scoring turns into action.

---

## Workflows

### What the engine actually does

Six triggers, ten step types. All six triggers and all ten step types are reachable from the
Builder — `field_changed` was previously implemented but absent from the form.

| Trigger | Fires | Needs an object |
|---|---|---|
| `on_create` | Once, as the record is created | **Yes** |
| `on_update` | On every save | **Yes** |
| `field_changed` | Only when a named field actually changes | **Yes** |
| `on_delete` | Before removal, while field values are still readable | **Yes** |
| `scheduled` | Swept every 60 s; `trigger_config.per_record` runs it once per live record | No |
| `manual` | Only when run from the canvas or the API | No |

> **A record-triggered workflow must be bound to an object.** The engine finds workflows with
> `where: { object_id, trigger_type, is_active }`, so one with no object matches no event — ever.
> The form now requires it, the API rejects a save without it, and the list flags older rows that
> lack one as **Not bound — cannot fire**.

### Step types

| Step | What it does | Cannot act without |
|---|---|---|
| `trigger` | Documents the entry point; passes through | — |
| `condition` | Gates the chain on a field comparison | `field`, `operator` |
| `action` | Writes a value to a field on the triggering record | `field`, `value` |
| `notification` | Creates in-app notifications | a resolvable recipient |
| `delay` | Pauses durably; resumed by the scheduler | `duration`, `unit` |
| `approval` | Halts, notifies approvers, branches on their decision | a resolvable approver |
| `webhook` | Calls a URL, or a registered integration by name | `integration` or `url` |
| `integration` | Invokes an integration, or publishes a domain event | `integration` or `event` |
| `create_record` | Creates a record in another object | `object_id`, `fields` |
| `update_related` | Bulk-updates linked records in another object | `object_id`, `link_field`, `field`, `value` |
| `send_email` | Emails a template to the record, in its language when a `<template>_<lang>` exists; templates may use `{{upload_link}}` | `template` and a recipient (`email` field, `to_field` or `to`) |
| `send_sms` | Texts the record through an SMS integration; skipped when `suppress_field` is true | `integration`, `message` |
| `generate_document` | Renders a merge template and files it on the record | `template` |
| `email_list` | Emails one template to every matching record of a list object (for example the subscribers of a publication), each in their language, skipping suppressed people, with optional open tracking (`track_field`). Accepts `match`, `active`, `email_field`, `language_field`, `suppress_field`, `limit` | `template`, `list_object`, `link_field` |

The step editor shows the accepted keys, which are required, and a practice note per type, with
**Insert a working example** to start from.

> **Invalid configuration JSON is no longer discarded.** The editor previously did
> `try { JSON.parse(config) } catch { config = {} }`, so a misplaced comma silently threw the
> author's work away and saved an **empty** config — a webhook with no URL, a condition with no
> field, and nothing to indicate it. Parse errors and missing required keys are now shown as you
> type and block the save.

### Condition operators

`eq` `neq` `gt` `gte` `lt` `lte` `contains` `in` `nin` `empty` `notempty` `today` `before_today`
`after_today` `date_within_days` `date_overdue`

On a `field_changed` workflow, set **Source** to `old` to test what a field changed *from* — that is
how you detect a transition (open → won) rather than merely landing on a value. `_changed.<field>.old`
works as a field path too.

### How to build one

1. Create it with the **manual** trigger.
2. Add the steps, cheapest and most selective condition first.
3. Run it against a real record and read the run log.
4. Only then switch it to an automatic trigger.

This is how mature CRM teams work, because an automation that first fires on live data is expensive
to debug.

### Watch out for

- An `on_update` workflow that writes a field can re-trigger itself, or a second workflow watching
  that field. Two workflows that each set a field the other watches will loop.
- A delay or approval persists the remainder of the chain and hands it to the scheduler, so it needs
  a following step to resume into. A delay at the end of a chain simply stops.
- An approval with no resolvable approver waits forever — the engine records the approvers when the
  step runs and accepts a decision only from them.
- Notify a **role** or a **field**, never a hard-coded employee id. An id breaks the day that person
  changes team, and is the usual reason an alert quietly stops reaching anyone.

---

## Assignment Rules

### Strategies

| Strategy | Picks | Use it for |
|---|---|---|
| `fixed` | One named employee | Escalation paths, named account owners |
| `round_robin` | The next pool member in rotation | Lead distribution, where even *counts* matter |
| `load_balanced` | The pool member with the fewest **open** records of this object | Casework, where *capacity* matters |
| `rule_based` | Conditions must all match, then a named assignee or the pool | Territory, product, or value-based routing |

Rules are evaluated by `order_index` and **the first match wins**, so specific rules go above general
ones. A catch-all at the top makes everything below it dead.

### Eligibility and load — what counts

Both pool strategies now filter the pool to **active** employees. A deactivated rep used to stay in
the rotation and keep receiving records they can no longer sign in to see — work that is silently
lost until somebody notices the queue. If the whole pool is inactive the rule falls through to its
fallback; with no fallback, nothing is assigned.

Load balancing counts **open records of this rule's own object**, excluding:

- **terminal stages** — otherwise a rep who has closed 400 deals looks 400 times busier than a new
  hire with an empty desk, and the balance never recovers;
- **deleted records** — trashed records still carry `assigned_to`;
- **other objects** — a rule routes one object, and mixing others in made two rules on the same pool
  disagree about who is busiest.

A stage counts as terminal when its metadata says so (`config.is_closed`) or its name is one of
`closed`, `closed_won`, `closed_lost`, `won`, `lost`, `converted`, `cancelled`, `rejected`,
`completed`, `resolved`. **Mark your terminal stages in the Pipeline Builder** — reporting,
forecasting and load balancing all read them.

Pools are de-duplicated on save. Listing somebody twice to give them a double share does not work;
give them their own `fixed` rule above the round-robin instead.

### Test the rules before you trust them

The Builder has a **Test these rules** panel above the list (pick an object first). Give it an
existing record id, or type field values for a hypothetical record, and it shows every active rule
in evaluation order — matched, no match, or skipped — with the reason: which conditions failed and
what the field actually held, the open-load table behind a load-balanced pick, and any pool members
skipped because they are deactivated. Then the decision, or a plain statement that nobody would be
assigned.

Nothing is written and the round-robin cursor is only peeked, so run it as often as you like while
tuning. It is `POST /builder/assignment-rules/explain` underneath.

### Rule-based rules can rotate through a pool

When a `rule_based` rule matches and names **no** assignee, the engine rotates through the rule's
pool instead — a per-rule round-robin. The form now offers the pool picker on rule-based rules;
leave the assignee blank to use it.

### Watch out for

- A `rule_based` rule with **no** conditions never matches. ALL conditions must hold, and an empty
  list is treated as "no rule", not "always".
- Always give the last rule a fallback. An unassigned record belongs to nobody.
- Assignment runs on create. Changing rules does not retrospectively reassign existing records.

---

## Lead Scoring

### The shipped starter model

Eleven rules across three groups. Maximum positive total 130, against
grade bands A ≥ 80, B ≥ 60, C ≥ 40, D ≥ 20.

| Group | Rule | Field | Points |
|---|---|---|---|
| Demographic | Income supports permanent cover | `annual_revenue` > 150,000 | +20 |
| Demographic | Income supports term cover | `annual_revenue` > 75,000 | +10 |
| Demographic | Employment on file | `job_title` not empty | +5 |
| Behavioral | Referred or introduced | `lead_source` in referral, partner | +25 |
| Behavioral | Asked us first | `lead_source` in web, seminar | +15 |
| Behavioral | Cold outbound | `lead_source` in cold_call, social_media | **−10** |
| Behavioral | Needs analysis started | `lead_status` in contacted, qualified | +15 |
| Behavioral | Ruled out | `lead_status` = unqualified | **−30** |
| Behavioral | Agent rates it hot | `rating` = hot | +15 |
| Engagement | Reachable by phone | `phone` not empty | +15 |
| Engagement | Reachable by email | `email` not empty | +10 |

`annual_revenue` is read as the prospect's **annual household income** — the figure the
recommended cover is sized against.

The two negative rules are deliberate. In a model where every rule adds, every lead eventually scores
highly and the ranking stops meaning anything.

Phone outscores email because life cover is sold in conversation and a needs analysis is a phone
call. "Agent rates it hot" is weighted *below* source and status on purpose: it is a judgement, not
an observation, and a model that leans on it mostly scores the salesperson.

### What the previous defaults were, and why they are gone

The old starter set was generic B2B-SaaS boilerplate, and two rules could not work at all:

- **"Senior Job Title"** and **"Manager Job Title"** used `contains` with a comma-separated list
  (`'VP, Director, Chief, President, Owner, Founder'`). `contains` is a single substring test, so
  each asked whether the job title contained that entire literal string. They awarded 20 and 10
  points to nobody, while looking entirely reasonable in the UI.
- **"Target Industry"** scored `Technology, Software, Finance, Healthcare, Manufacturing` — a B2B
  firmographic list, meaningless for individual and family life cover.
- **"Has Website"** scored a company attribute on a consumer prospect.
- Annual revenue and rating were filed as `behavioral`, which neither is.

`tests/automate-rules.test.js` now asserts that every shipped rule uses an operator the engine
implements, reads a field the scorer selects, matches values the product really stores, and never
pairs `contains` with a list.

### Operators

All fourteen the engine implements are now selectable: `equals` `not_equals` `contains`
`not_contains` `starts_with` `ends_with` `greater_than` `greater_equal` `less_than` `less_equal`
`in_list` `not_in_list` `is_empty` `is_not_empty`. Five of them (`starts_with`, `ends_with`,
`greater_equal`, `less_equal`, `not_in_list`) were implemented but previously unreachable.

`in_list` and `not_in_list` match **exactly** per item, so `Technology` does not match
`technology`. `contains` is a substring test — use it for one term, never a list.

### Watch out for

- Rules apply to **leads only** and read the lead's own columns. A rule on a field the scorer does
  not select scores nothing.
- A rule already used in a calculated score is **deactivated** rather than deleted, so historic
  scores stay explainable. Deactivated rules stay in the list.
- Scores are calculated on demand and cached. A newly added rule affects a lead when its score is
  next recalculated.
- A rule on a rarely populated field contributes almost nothing. Check how often the field is filled
  before giving it weight.

---

## SLA Engine

### What each entity can be measured on

| Entity | Metrics | Priority ladder | Owner field |
|---|---|---|---|
| `case` | `first_response`, `resolution` | low, medium, high, critical | `owner_id` |
| `lead` | `first_response` | cold, warm, hot | `owner_id` |
| `task` | `resolution` | low, normal, high, urgent | `assigned_to` |

> **Other combinations are rejected on save, and the editor no longer offers them.** The reconciler
> only evaluates the metrics an entity declares, so a `resolution` target on a lead — which the
> Builder used to offer — was written to the database and then silently never evaluated.
> `GET /api/sla/capabilities` serves this matrix; the policy editor derives its metric dropdowns from
> it per entity, states in plain language what the entity is measured on, and warns about any
> existing target the server will reject before you press save.

### Targets and warnings

- `target_minutes` must be a positive number of minutes, counted in **business hours** from the
  calendar attached to the policy.
- `warning_pct` must be between 1 and 99. Zero would warn at creation and 100 would warn exactly at
  breach; neither is an early warning, which is the only thing the field is for. 75–80 is usual.
- A task with its own `due_date` uses that date as the resolution target; the policy's minutes are
  the fallback.

### Conditions

Operators: `equals` `not_equals` `in` `not_in` `contains` `gt` `gte` `lt` `lte` `is_empty`
`is_not_empty`.

An **empty** condition list matches everything — that is the documented way to write the catch-all
policy. An **unrecognised** operator now matches nothing; it used to match everything, so a typo in
one condition silently widened a policy to every record of the entity.

Policies are evaluated by `order_index` and the first match wins. Order specific to general, and
give the last one no conditions.

### Escalations

`notify_owner` · `notify_manager` · `raise_priority` · `create_task`, each on a `warning` or
`breach` trigger, optionally scoped to one metric (or `*` for any).

Escalate to the owner, then to their manager, with a gap. An escalation that pages three people at
once trains everybody to ignore it.

### Watch out for

- Business hours matter. A four-hour target that expires overnight is not a target anyone can meet,
  and it makes breach reporting worthless.
- Removing a target **cancels** the live timers depending on it. History stays; those records stop
  being measured.
- Set targets per priority. One target for everything means your urgent work is too slow or your
  routine work is permanently in breach.

---

## In-product guidance

Every Builder section now carries a guidance panel above its form — what the section is for, when to
use it instead of a neighbouring one, how it is normally set up, and the specific ways it goes wrong
in this product. It opens by default and remembers per section when collapsed, so an experienced
admin dismisses each one once while it stays available for the next person.

The content lives in `frontend/src/utils/builderGuides.js` as data, so a new section needs an entry
rather than a new component, and `tests/builderGuides.test.jsx` fails if a Builder route has no
guide, if a guide is a stub, or if a line is filler.

---

## For engineers

| File | Role |
|---|---|
| `backend/src/services/workflow.service.js` | The workflow engine: triggers, ten step types, scheduler, delay/approval resumption |
| `backend/src/services/assignment.service.js` | Assignment strategies, pool eligibility, terminal-stage detection |
| `backend/src/services/lead-scoring.service.js` | Scoring engine and the shipped starter model |
| `backend/src/services/sla.service.js` | SLA reconciler, business-hours maths, `supportedMetrics` |
| `backend/src/routes/sla/index.js` | `assertPolicyShape`, `GET /capabilities`, `seedSlaDefaults` |
| `backend/src/services/dashboard.service.js` | Workflow CRUD and `assertWorkflowTriggerable` |
| `frontend/src/utils/workflowStepSchema.js` | Per-step-type config schema, parsing and validation |
| `frontend/src/utils/builderGuides.js` | Guidance for every Builder section |
| `frontend/src/components/builder/BuilderGuide.jsx` | The shared guidance panel |
| `backend/tests/automate-rules.test.js` | The shipped rules, and all three guard rails |
| `backend/tests/assignment.test.js` | Strategies, eligibility, open-work load, rule updates |
| `frontend/tests/builderGuides.test.jsx` | Guide coverage and step-config validation |

### Adding a step type

1. Add the branch to `#executeStep` in `workflow.service.js`.
2. Add an entry to `STEP_SCHEMAS` in `workflowStepSchema.js` — `required` means the engine's branch
   cannot act without it, so read the branch rather than guessing.
3. Add it to `STEP_TYPES` in `WorkflowBuilder.jsx`.

The test asserts every shipped example satisfies its own required fields, so an example that would
not save fails the build.

### Adding an SLA metric or entity

Add it to `ENTITY[type].metricStatus` in `sla.service.js`. That map is what the reconciler iterates,
so `supportedMetrics`, `GET /capabilities`, the Builder's dropdowns and `assertPolicyShape` all
follow from it with nothing else to update.

### Condition semantics

All three engines now **fail closed** on an unrecognised operator. If you add a fourth rule engine,
match that: a condition that cannot be evaluated must not match. The SLA engine was the outlier and
defaulted to `true`.
