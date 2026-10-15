# Genesis CRM — Workflow Engine Technical Reference

For: Developers and Advanced Admins

Complete technical reference for the Genesis CRM workflow engine — step types, operators, and the
programmatic API. Everything here reflects the **actual implementation** in
[`backend/src/services/workflow.service.js`](../../backend/src/services/workflow.service.js).

---

## Table of Contents

Part 1 — Step Reference

1. [Step Types Overview](#step-types-overview)
2. [Step Execution Reference](#step-execution-reference)
3. [Recipient Resolution](#recipient-resolution)
4. [Placeholder Interpolation](#placeholder-interpolation--where-values-come-from)
5. [Operators Reference](#operators-reference)

Part 2 — API Reference

1. [API Overview](#api-overview)
2. [Workflow Management API](#workflow-management-api)
3. [Execution Control API](#execution-control-api)
4. [Trigger Types](#trigger-types)
5. [Execution Model & Error Handling](#execution-model--error-handling)

Part 3 — Shipped Workflow Catalogue

1. [Catalogue Overview](#shipped-workflow-catalogue)
2. [What Each Workflow Exercises](#what-each-workflow-exercises)
3. [Writing a Branching Approval](#writing-a-branching-approval)

Part 4 — Extending the Engine

1. [Where Everything Lives](#where-everything-lives)
2. [Adding a Step Type](#adding-a-step-type)
3. [Adding an Operator](#adding-an-operator)
4. [Adding a Trigger Type](#adding-a-trigger-type)
5. [Supporting a New Storage Backend](#supporting-a-new-storage-backend)
6. [Adding a Workflow to the Catalogue](#adding-a-workflow-to-the-catalogue)
7. [Testing Conventions](#testing-conventions)
8. [Known Gaps & Enhancement Backlog](#known-gaps--enhancement-backlog)

---

## What's New

Recent capability changes, newest first. Each is described in full in the section linked.

| Capability | What changed | Where |
| ---------- | ------------ | ----- |
| **`email_list` step and `{{upload_link}}`** | Email one template to every member of a list held in another object (subscribers of a publication), in each person's language, skipping suppressed people, with optional open tracking. `send_email` templates can use `{{upload_link}}`, a 14-day link where the client uploads the record's missing documents. | [Config keys per step type](#config-keys-per-step-type), [PLATFORM_BUILDER_EXTENSIONS.md §28](PLATFORM_BUILDER_EXTENSIONS.md#28-distribution-lists-and-open-tracking) |
| **`send_email` and `generate_document` steps** | Email a template to the record (picking a `<template>_<lang>` variant from a language field), and render a merge template filed on the record. | [Config keys per step type](#config-keys-per-step-type) |
| **Formula conditions** | Operator `expression` evaluates a formula over the whole record (`AND`/`OR`/`IF`/`LOOKUP`…), so multi-field logic no longer needs chained steps. | [Operators Reference](#operators-reference) |
| **Linked `create_record`, stage by name** | `create_record` runs through `RecordService` (formulas, BU stamping, assignment, events) and takes `link_field`, `store_as` and `stage`; an `action` on `stage` moves the record through the stage gates. | [Config keys per step type](#config-keys-per-step-type) |
| **Maker-checker approvals** | `exclude_actor` / `exclude_field` remove the maker from the approver list. | [Config keys per step type](#config-keys-per-step-type) |
| **Record actions** | Active `manual` workflows appear as buttons on their object's record panel. | [PLATFORM_BUILDER_EXTENSIONS.md](PLATFORM_BUILDER_EXTENSIONS.md#3-record-actions) |
| **Storage-routed field access** | The engine read and wrote fields only on the five first-class `crm_*` tables. It now resolves a field through the same map the API write path uses, so `condition`, `action`, `create_record` and `update_related` behave identically on a CRM object and a custom object. Before this, workflows on Client and custom objects silently did nothing. | [Field storage routing](#field-storage-routing) |
| **Per-record scheduled sweeps** | `trigger_config.per_record: true` runs a scheduled workflow once for every live record of its object, so date-driven sweeps can read each record's own fields. Previously a scheduled workflow ran once with no record, making every condition fail. | [Scheduled sweeps](#scheduled-sweeps) |
| **Record-level column access** | `assigned_to`, `pipeline_stage_id`, `created_by` and `record_id` are readable as placeholders and in conditions, and `assigned_to` / `pipeline_stage_id` are writable by an `action` step — so ownership re-routing is a first-class automation. | [Field storage routing](#field-storage-routing) |
| **Interpolated action values** | `action.config.value` runs through `#interpolate`, so an action can compose a value from other fields. | [Config keys per step type](#config-keys-per-step-type) |
| **`update_related` by business key** | `config.link_value` matches related records on an interpolated value (e.g. every related record carrying the same `email`) instead of only on the parent record's id. | [Config keys per step type](#config-keys-per-step-type) |
| **Overflow-safe `create_record`** | Fields that are not writable columns on the target's CRM table are written to the typed EAV store instead of being dropped. | [Config keys per step type](#config-keys-per-step-type) |
| **Shipped catalogue as code** | Benchmarked workflows defined in `prisma/crm-workflows.js` and installed by a script, rather than hand-built in the Builder. | [Shipped Workflow Catalogue](#shipped-workflow-catalogue) |

---

# Part 1 — Step Reference

## Step Types Overview

| Category | Step Type | Purpose | Example Use |
| -------- | --------- | ------- | ----------- |
| **Entry** | `trigger` | Pass-through; validates the trigger event | First step of every workflow |
| **Conditions** | `condition` | Branch on `on_true_id`/`on_false_id` based on a field comparison | Check if status = "New" |
| **Actions** | `action` | Write a field value to the record in the DB | Set priority to "High" |
| | `create_record` | Create a new record in another object | Generate follow-up task |
| | `update_related` | Bulk-update records in another object linked by a field value | Update all child line items |
| **Notifications** | `notification` | Create in-app notification rows for resolved recipients | Alert assigned agent |
| **Control** | `delay` | Persist a `WorkflowPendingStep`; scheduler resumes when due | Wait 24 hours |
| | `approval` | Persist a `WorkflowPendingStep` + notify approvers; resumed via API token | Manager sign-off |
| | `send_email` | Send an email template to the record (language variant aware) | Bilingual acknowledgement |
| | `generate_document` | Render a merge template and file it on the record | Offer letter |
| | `send_sms` | Send a text through an SMS integration (language variant aware, suppressible) | Payment reminder |
| | `email_list` | Email a template to every matching member of a list in another object, with open tracking | Research to subscribers |
| **Integration** | `webhook` | SSRF-protected HTTP POST/GET to an external URL | Sync with external system |
| | `integration` | Run a registered integration, or publish a custom domain event | Enrich from a data provider |

These fourteen `step_type` values are the **only** ones the engine recognizes. Any other value falls
through to the `default` case and is skipped (logged as `unknown step type: …`).

---

## Step Execution Reference

All step dispatch lives in `#execStep` in
[`workflow.service.js`](../../backend/src/services/workflow.service.js)
(the `switch (step.step_type)` at ~L326).

### How the chain runs

`#runFrom` starts at the first step (lowest `order_index`) and executes steps in sequence.
Each step returns the ID of the next step to run. **Two modes coexist:**

- **Linear (what the Workflow Builder produces):** steps have no explicit `on_true_id`/`on_false_id`
  links, so each step falls through to the **next step by `order_index`**. A `condition` that fails
  stops the chain (a failed gate blocks what follows).
- **Branching (explicit links):** when a step sets `on_true_id` / `on_false_id`, those win over the
  linear fall-through — a `condition` routes to its true/false target, a `webhook`/`integration`
  routes to `on_false_id` on failure, etc.

A `crmCache` holds the record's field map (loaded once via `#loadFields`, reused across steps,
invalidated after an `action` write). A `MAX_STEPS = 50` counter guards against cycles. **A step that
throws is logged into the run log and does NOT abort the remaining steps** — the engine continues
linearly. The `integration` step refuses to publish reserved `record.*` events (they would re-trigger
the engine and loop). When a step has no explicit link and no next step by order, the chain ends.

```text
Step 1 (trigger)      → on_true_id: 2
Step 2 (condition)
    ├── on_true_id:  3   ← condition matched
    └── on_false_id: 4   ← condition did NOT match
Step 3 (action)       → on_true_id: 5
Step 4 (action)       → on_true_id: 5
Step 5 (notification) → on_true_id: null   ← end of chain
```

### Per-step behavior

| Step (`step_type`) | What it does | How it does it | Halts? |
| ------------------ | ------------ | -------------- | ------ |
| `trigger` | Entry point / pass-through | Returns `on_true_id`. Event matching (`on_create`, etc.) happened earlier in `trigger()`, not here | No |
| `condition` | Branch on a field comparison | Reads a field (current value, or `_changed.field.old\|new`), compares via `#evaluate`, returns `on_true_id` (match) or `on_false_id` (no match) | No |
| `action` | Write one field to the record | If **both** `cfg.field` and `cfg.value` are set, interpolates `value`, calls `#writeField` to route it to the store owning that field, then invalidates the field cache. No `value` ⇒ **no-op**; a real CRM column on a record with no entity row ⇒ **no-op** (never shadow-written to EAV) | No |
| `notification` | Create in-app notification rows | Resolves recipients (`#resolveRecipients`), interpolates `{{ }}` in `title`/`message`, bulk-inserts into the `notification` table | No |
| `delay` | Pause and resume later | Computes resume time from `{duration, unit}` (minutes/hours/days), writes a `WorkflowPendingStep` with `resume_after`, returns `null`. The 60s scheduler (`runScheduled`) resumes from the saved next step | **Yes** |
| `approval` | Human approve/reject gate | Generates a token, writes a `WorkflowPendingStep` (with reject branch + allowed approver IDs), notifies approvers with a token link, returns `null`. `POST /api/runtime/workflows/approval/:token` resumes it — approve → `on_true_id`, reject → `on_false_id` | **Yes** |
| `webhook` | Outbound HTTP call | Two modes: **named connection** — `cfg.integration` references a registered integration by name and reuses its URL/secret/headers/retry, logging to its health dashboard (the Salesforce "named credential" pattern); or **ad-hoc** — `cfg.url` posts an interpolated JSON body. Both go through `IntegrationService` (one SSRF policy, one signer, one client). Branches: success → `on_true_id`, failure → `on_false_id` | No |
| `integration` | Invoke an integration / emit an event | **Dispatch mode** — `cfg.integration` runs a registered integration by name (regardless of its active toggle) with an optional `cfg.field_map` to write the response back onto record fields (enrichment). **Event mode** — `cfg.event` publishes a custom domain event onto the bus that event-subscribed integrations (and other workflows) react to. Branches: success → `on_true_id`, failure → `on_false_id` | No |
| `create_record` | Create a record in another object | Interpolates `{{ }}` in each `cfg.fields` value. CRM object types → thin `record` anchor + `crm_*` entity row; non-CRM → anchor only | No |
| `update_related` | Cascade an update to child records | Finds CRM entities in `cfg.object_id` where `cfg.link_field == record.id`, sets `cfg.field` to interpolated `cfg.value` on all of them in one transaction. CRM object types only (non-CRM = no-op) | No |

### Config keys per step type

All config lives under `step.config`:

```jsonc
// condition
{ "field": "status", "operator": "eq", "value": "new", "source": "new" }  // source optional
// action  — value is REQUIRED; without it the step is a no-op
{ "field": "priority", "value": "high" }
// notification / approval
{ "field": "assigned_to", "role": "manager", "employee_id": "USR001",
  "notify_actor": true, "title": "…", "message": "…", "link": "…" }
// delay
{ "duration": 3, "unit": "hours" }               // unit: minutes | hours | days
// webhook — named connection (reuse a registered integration)…
{ "integration": "slack-notify", "body": { "text": "{{name}} updated" } }
//          …or ad-hoc URL
{ "url": "https://…", "method": "POST", "headers": {}, "body": {}, "secret": "…" }
// integration — run a registered integration (optionally enrich the record)…
{ "integration": "clearbit", "body": {}, "field_map": { "company_size": "data.employees" } }
//             …or publish a custom domain event other integrations/workflows react to
{ "event": "lead.qualified", "data": {} }
// create_record — runs through RecordService; stage by id or by API name
{ "object_id": 5, "fields": { "party": "{{party}}" }, "assigned_to": "USR001", "stage": "initiated",
  "link_field": "enquiry",      // set on the NEW record to this record's id
  "store_as": "kyc_case" }      // set on THIS record to the new record's id
// action on the stage pseudo-field — moves through updateRecordStage (gates apply)
{ "field": "stage", "value": "offer_issued" }
// approval — maker-checker
{ "role": "operations_checker", "exclude_actor": true, "exclude_field": "captured_by" }
// send_email — to the record's `email` unless to / to_field is given
{ "template": "loan_offer", "to_field": "party_email", "language_field": "preferred_language" }
// generate_document — a DocumentTemplate by name, filed on the record
{ "template": "loan_offer_letter", "filename": "Offer {{application_number}}.pdf" }
// update_related
{ "object_id": 5, "link_field": "account_id", "field": "status", "value": "…" }
// send_sms — through a Builder SMS integration
{ "integration": "sms_gateway", "message": "…", "message_fr": "…", "to_field": "mobile",
  "language_field": "preferred_language", "suppress_field": "do_not_contact" }
// email_list — one email per person on a list held in another object
{ "template": "research_publication", "list_object": "subscription", "link_field": "party",
  "match": { "topic": "{{publication_type}}" },   // interpolated against THIS record
  "active": { "status": "subscribed" },
  "email_field": "email", "language_field": "preferred_language",
  "suppress_field": "marketing_suppressed",      // true on the person → skipped
  "track_field": "opens",                         // integer field on THIS record counting opens
  "limit": 2000 }
```

> ⚠️ **`action` steps only do `field = value`.** A config like
> `{ "pool": [...], "assignment_type": "round_robin", "field": "assigned_to" }` is **not**
> honored — `pool` and `assignment_type` are never read by the engine, and with no `value`
> the step is a no-op. Round-robin assignment is a **separate** system: `AssignmentService`
> ([`assignment.service.js`](../../backend/src/services/assignment.service.js)) driven by
> `AssignmentRule.pool_ids`, invoked directly from `RecordService` on create.

---

## Recipient Resolution

`#resolveRecipients` (~L604), used by `notification` and `approval`, returns the **union** of:

| Config key | Resolves to |
| ---------- | ----------- |
| `employee_id` | That literal employee ID |
| `field` | The value of that field on the record, treated as an `employee_id`. Because `#loadFields` exposes record-level columns, `field: "assigned_to"` addresses the record's owner on any object. |
| `role` | All active employees whose `role` equals this value |
| `notify_actor: true` | The user who triggered the workflow |

---

## Placeholder Interpolation — where values come from

`title`, `message`, webhook `body`, and `create_record` / `update_related` field values are
run through `#interpolate` (~L671):

```js
#interpolate(template, data = {}) {
  return String(template).replace(/\{\{(\w+)\}\}/g, (_, k) => data[k] ?? '');
}
```

- `{{key}}` matches word characters only (`\w+`). A **missing key becomes an empty string**
  (not left as `{{key}}`).
- In `${{amount}}` the `$` is **literal text** — only `{{amount}}` is the
  placeholder — so it renders as `$<value>`.
- The `data` object is **`#loadFields(record)`**, which merges every place a record's
  data can live:

  | Source | Contributes |
  | ------ | ----------- |
  | `record_field_values` (typed EAV) | `client` and all custom objects |
  | `crm_*` entity row | `lead` / `lead_intake` / `prospect` / `contact` / `account` / `opportunity` / `case` |
  | The `records` row | `assigned_to`, `pipeline_stage_id`, `record_id`, `created_by` |

  EAV values form the base and non-null CRM columns take precedence, matching how
  `RecordService` hydrates a record for the API. Columns that have a form-facing alias are
  exposed under **both** names, so `{{annual_income}}` and `{{annual_revenue}}` both resolve
  on a `crm_leads` row.

  So `{{email}}` ⇒ the EAV value for a Client, and `{{first_name}}` ⇒ the
  `crm_leads` column for a Prospect — with no per-object special-casing in the step config.

### Field storage routing

`src/services/crm-storage-map.js` is the single source of truth for which store owns an
object's data. `RecordService` (the API write path) and `WorkflowEngineService` both import it,
so a workflow resolves a field exactly the way a form save does.

| Object name | Storage |
| ----------- | ------- |
| `lead`, `prospect` | `crm_leads` |
| `lead_intake` | `crm_lead_intake` |
| `contact`, `account`, `opportunity`, `case` | the matching `crm_*` table |
| everything else (`client`, custom objects) | `record_field_values` |

Writes follow the same routing (`#writeField`):

- `assigned_to` / `pipeline_stage_id` → the `records` row
- a writable column on the object's CRM table → that entity row (aliases applied)
- anything else → `record_field_values`, serialised into the typed column matching the
  `UiField.data_type` so numbers and dates stay queryable

A field that is not a writable CRM column falls through to EAV rather than being silently
dropped. Workflow writes go straight to Prisma, **not** through `RecordService`, because
`RecordService` publishes `record.updated` — which this engine subscribes to, so routing an
action step through it would re-trigger the workflow that is running.

---

## Operators Reference

Condition steps evaluate `cfg.value` against the field via `#evaluate` (~L629). These are the
**only** operators supported:

| Operator | Description |
| -------- | ----------- |
| `eq` / `==` | Exact match (string-compared) |
| `neq` / `!=` | Not equal |
| `in` | Value is in the provided array |
| `nin` | Value is not in the provided array |
| `gt` / `gte` / `lt` / `lte` | Numeric comparisons |
| `contains` | String contains substring (case-insensitive) |
| `empty` | Field is null or blank |
| `notempty` | Field has a value |
| `before_today` | Date is before today |
| `after_today` | Date is after today |
| `today` | Date is today |
| `date_within_days` | Date is within N days from now (N = `value`) |
| `date_overdue` | Date is in the past |
| `expression` | `value` is a formula over the whole record (see [formula language](PLATFORM_BUILDER_EXTENSIONS.md#1-formula-language)); `field` is ignored |

Placeholders also include `{{id}}`, `{{stage}}` (stage API name) and `{{today}}`.

Any unrecognized operator evaluates to `false`.

---

# Part 2 — API Reference

## API Overview

### Authentication

All API calls require valid JWT authentication:

```javascript
{
  "Authorization": "Bearer <jwt_token>",
  "Content-Type": "application/json"
}
```

### Base paths

- Workflow management (admin): `/api/builder/workflows`
- Runtime execution: automatic via record create/update/delete
- Approval resolution: `POST /api/runtime/workflows/approval/:token`
- Manual trigger: `POST /api/builder/workflows/:id/run` (or "Test Run" in the Builder UI)

---

## Workflow Management API

Defined in [`backend/src/routes/builder/index.js`](../../backend/src/routes/builder/index.js).
Read endpoints require authentication; write endpoints require admin.

| Method & Path | Purpose |
| ------------- | ------- |
| `GET /api/builder/workflows?object_id=:id` | List workflows (optionally by object) |
| `GET /api/builder/workflows/:id` | Get one workflow with its steps |
| `POST /api/builder/workflows` | Create a workflow |
| `PUT /api/builder/workflows/:id` | Update a workflow |
| `DELETE /api/builder/workflows/:id` | Delete a workflow |
| `POST /api/builder/workflows/:id/run` | Manually execute a workflow (testing) |
| `POST /api/builder/workflows/:id/steps` | Add a step to a workflow |
| `PUT /api/builder/workflow-steps/:id` | Update a step |
| `DELETE /api/builder/workflow-steps/:id` | Delete a step |

### Create Workflow

```javascript
POST /api/builder/workflows

{
  "name": "Lead Assignment",
  "object_id": 1,
  "trigger_type": "on_create",
  "description": "Auto-assign new leads by territory",
  "is_active": false
}
```

### Get Workflow

```javascript
GET /api/builder/workflows/:id

// Response
{
  "id": 1,
  "name": "Lead Assignment",
  "object_id": 1,
  "trigger_type": "on_create",
  "is_active": true,
  "steps": [ /* workflow steps */ ]
}
```

---

## Execution Control API

### Automatic Execution

Workflows fire automatically when records change via the runtime API:

```text
POST   /api/runtime/records          → RecordService.createRecord() → trigger('on_create')
PUT    /api/runtime/records/:id       → RecordService.updateRecord() → trigger('on_update')
DELETE /api/runtime/records/:id       → RecordService.deleteRecord() → trigger('on_delete')
PATCH  /api/runtime/records/:id/stage → updateRecordStage()          → on_update + field_changed
PUT    /api/runtime/crm/<entity>/:id  → CrmService.update*()         → triggerFieldChanged()
App scheduler (every 60s)             → runScheduled()               → trigger('scheduled') + resume delays
```

Execution is fire-and-forget — workflow failures do not affect the HTTP response.

### Manual Test Execution

Available through the Builder UI ("Test Run") or `POST /api/builder/workflows/:id/run`.
`action` steps write to the database during test runs — use a test record to avoid modifying
live data.

### Approval Resolution

```javascript
POST /api/runtime/workflows/approval/:token
{ "action": "approve" }   // or "reject"
```

Resumes the paused `WorkflowPendingStep`: `approve` continues from `on_true_id`, `reject` from
`on_false_id`. Only an employee in the step's persisted `approver_ids` may act.

---

## Trigger Types

| Trigger Type | Fired By | Description |
| ------------ | -------- | ----------- |
| `on_create` | `RecordService.createRecord()` | New record created |
| `on_update` | `RecordService.updateRecord()` | Record modified |
| `on_delete` | `RecordService.deleteRecord()` | Record deleted (fires before delete) |
| `field_changed` | `CrmService.update*()` | Specific CRM field value changed |
| `manual` | `POST /api/builder/workflows/:id/run` | Manually triggered via API |
| `scheduled` | App scheduler (60s interval) | Time-based execution — see **Scheduled sweeps** below |

### Scheduled sweeps

A scheduled workflow runs in one of two modes, chosen by `trigger_config`:

```json
{ "trigger_type": "scheduled",
  "trigger_config": { "interval_minutes": 1440, "per_record": true, "limit": 500 } }
```

| `per_record` | Behaviour |
| ------------ | --------- |
| absent / `false` | Runs **once** with no record context. Only steps that need no record do anything useful — a role-broadcast `notification`, a `webhook` with a static body. `condition` and `action` steps see an empty field map and halt. |
| `true` | Runs **once per live record** of the workflow's object, exactly like a Salesforce scheduled-triggered Flow or a Zoho scheduled rule. This is what makes date-driven sweeps possible, because the condition step can read that record's own fields. |

`limit` caps a per-record sweep (default 500, hard ceiling 5 000) so one scheduler tick cannot
turn into an unbounded run. Records are processed sequentially — a sweep is a background job and
must not contend with request traffic for the connection pool.

Which mode a workflow needs is enforced by `tests/crm-workflow-catalogue.test.js`: any scheduled
workflow with a `condition` or `action` step must set `per_record`.

### field_changed Trigger

Fires when a CRM entity field is updated via CrmService. Works for all entity
types: Lead, Contact, Account, Opportunity, Case.

**Workflow definition:**

```json
{
  "trigger_type": "field_changed",
  "trigger_config": { "field": "lead_status" }
}
```

If `trigger_config.field` is set, the workflow only fires when that specific
field changes. If omitted, it fires on any field change.

**Changed field context:**

The record passed to workflow steps is enriched with a `_changed` map:

```json
{
  "id": 42,
  "object_id": 2,
  "_changed": {
    "lead_status": { "old": "new", "new": "contacted" },
    "rating": { "old": "cold", "new": "warm" }
  }
}
```

**Accessing old/new values in condition steps:**

```json
{
  "step_type": "condition",
  "config": { "field": "_changed.lead_status.new", "operator": "eq", "value": "qualified" }
}
```

Alternative syntax using `source`:

```json
{
  "step_type": "condition",
  "config": { "field": "lead_status", "source": "new", "operator": "eq", "value": "qualified" }
}
```

**Automatic side effects on CRM field changes:**

Every CRM entity update (regardless of workflows) triggers:

1. **Audit log** — `audit_logs` entry with `action: "update"` and
   `changes: { field: { old, new } }`
2. **Auto activity** — for status field changes, an activity
   (type: note) is created: "Status changed: old -> new"

**Event-driven architecture (shared backbone):**

The engine no longer *produces* events — the **record/CRM service layer** does. On a mutation, `RecordService` /
`CrmService` publish a canonical domain event onto the in-process `DomainEventBus` (`events.service.js`), and the
workflow engine is one **subscriber** among others:

```javascript
// RecordService.createRecord() / updateRecord() / deleteRecord(),
// and CrmService after a CRM entity update, publish onto the bus:
eventBus.publish('record.created',       { objectId, record, actorId });
eventBus.publish('record.field_changed', { objectId, record, changed, actorId });

// events.service.js → both consumers react independently:
//   • WorkflowEngineService  → runs matching on_create/on_update/on_delete/field_changed workflows
//   • IntegrationService     → fans out to outbound webhooks whose config.events subscribe
```

So a single CRM mutation drives **both** workflow automations and event-subscribed webhook integrations, with no
extra wiring at the call site. (`WorkflowEngineService.trigger()` / `triggerFieldChanged()` still exist and now run
as the bus-subscription handlers; `manualRun` and the scheduler remain direct, non-bus paths.)

---

## Execution Model & Error Handling

- **Fire-and-forget:** workflow execution does not block or alter the HTTP response of the
  record operation that triggered it.
- **Isolation:** each workflow executes independently — one workflow's failure does not affect
  others, and a failing step does not roll back prior steps.
- **Logging:** failures are logged to the server console as
  `[workflow:N] "name" failed: …`. There is no structured error API — inspect server logs or
  the Builder "Test Run" step results.
- **Cycle guard:** `MAX_STEPS = 50` per run prevents infinite loops.
- **Async steps:** `delay` and `approval` persist a `WorkflowPendingStep` row and halt. The
  60-second scheduler (`runScheduled`) picks up due delays; approvals resume via the token
  endpoint. No external job queue is required.

### Performance notes

- Keep step counts minimal and place the most selective conditions first.
- Avoid workflows whose `action`/`create_record`/`update_related` steps trigger further
  workflow-firing updates (cascade risk).
- The CRM field map is loaded once per run and cached (invalidated only after an `action`
  write), so multiple `notification`/`condition` steps do not re-query.

---

# Part 3 — Shipped Workflow Catalogue

## Shipped Workflow Catalogue

The workflows that ship in **Builder ▸ Workflows** are defined as data in
`backend/prisma/crm-workflows.js` and installed by
`backend/scripts/seed-crm-workflows.js`. `prisma/seed.js` imports the same installer, so
`npm run db:seed` and the standalone script always produce an identical suite.

```bash
node scripts/seed-crm-workflows.js --dry-run    # list what would be deleted/created
node scripts/seed-crm-workflows.js              # replace every workflow in every tenant
node scripts/seed-crm-workflows.js --keep       # add without deleting existing workflows
node scripts/seed-crm-workflows.js --tenant 4   # target a single tenant
```

Each definition carries a `benchmark` string naming the equivalent feature in Salesforce,
HubSpot, Zoho CRM, Dynamics 365, and Pipedrive; the installer appends it to the workflow's
description so it is visible in the Builder. `{{@manager}}` in a step config is resolved at
install time to the tenant's active `manager` employee, so no employee ID is hard-coded.

`SUPPORTING_FIELDS` in the same module declares metadata fields the catalogue depends on (for
example an `approval_status` field that an approval workflow writes), which the installer creates
if missing so an approval outcome is visible on the record rather than living only in
automation state.

`tests/crm-workflow-catalogue.test.js` enforces the structural invariants: links resolve,
operators and step types exist, recipients are addressable, scheduled workflows that read
record fields set `per_record`, and every approval's branches terminate correctly.

### What Each Workflow Exercises

Useful when you change the engine: this is the coverage map of which shipped workflow will break
if a given mechanic regresses. Full behavioural descriptions are in
[Workflows](../user-guide/06-workflows.md#the-workflows-in-detail).

| Workflow | Object storage | Trigger | Engine mechanics it depends on |
| -------- | -------------- | ------- | ------------------------------ |
| `lead_instant_routing` | `crm_lead_intake` | on_create | `action` write to a CRM column · `in` operator · gated linear chain · `role` recipients |
| `lead_first_response_sla` | `crm_lead_intake` | on_create | `delay` → `WorkflowPendingStep` → scheduler resume · `action` write to the **records** row (`assigned_to`) · seed-time actor placeholder |
| `lead_qualification_handoff` | `crm_lead_intake` | on_update | Boolean condition + boolean `action` write (`is_converted` latch) · `create_record` into a **different** storage kind (`crm_leads`) with alias mapping (`notes`→`description`) |
| `prospect_nurture_sweep` | `crm_leads` | scheduled | `per_record` sweep · `in` operator · `field` recipient resolving `assigned_to` |
| `client_data_hygiene_sweep` | EAV | scheduled | `per_record` · `empty` operator |

Two mechanics deserve care when refactoring:

- **`per_record` sweeps** — every date- or state-driven scheduled workflow. Breaking `#runScheduledWorkflow` silently disables
  every date-driven sweep, and the failure mode is *nothing happens*, not an error.
- **Approval guard termination** — every branching approval. Breaking fall-through ordering causes approvals to
  execute their own rejection steps, which corrupts record state rather than merely failing.

---

### Writing a branching approval

`approval` is the only step with two real outcomes, and the engine falls through to the next
step by `order_index` when a step has no explicit link. An approved branch would therefore run
the rejected branch's steps as well. The catalogue's convention:

1. The approval step links `on_true` to the first approved step and `on_false` to a **guard**.
2. The approved branch writes a state field (`approval_status: "approved"`).
3. The guard is a `condition` re-reading that field (`approval_status neq approved`). Reached
   by fall-through from the approved branch it evaluates false and halts; reached from
   `on_false` it evaluates true and runs the rejection steps.
4. The rejected branch is ordered **after** the approved branch.

`tests/crm-workflow-catalogue.test.js` asserts this shape for every approval in the catalogue.

---

# Part 4 — Extending the Engine

This part is for the development team. It lists every file a given kind of change touches, so an
enhancement lands complete rather than working in the engine but invisible in the Builder.

## Where Everything Lives

| Concern | File |
| ------- | ---- |
| Execution engine — step dispatch, chaining, scheduler, approvals | `backend/src/services/workflow.service.js` |
| Which store owns an object's field data + form↔column aliases | `backend/src/services/crm-storage-map.js` |
| Workflow/step CRUD used by the Builder API | `backend/src/services/dashboard.service.js` (`createWorkflow`, `addWorkflowStep`, …) |
| HTTP routes | `backend/src/routes/builder/index.js` (`/workflows`, `/workflow-steps`) |
| Approval resolution endpoint | `backend/src/routes/runtime/index.js` |
| Event production the engine consumes | `backend/src/services/record.service.js`, `crm.service.js` |
| Event bus | `backend/src/services/events.service.js` |
| Scheduler tick wiring | `backend/src/app.js` |
| Shipped catalogue definitions | `backend/prisma/crm-workflows.js` |
| Catalogue installer | `backend/scripts/seed-crm-workflows.js` |
| Builder — step palette, icons, config hints | `frontend/src/components/builder/WorkflowBuilder.jsx` |
| Builder — workflow list, create/edit modal, trigger dropdown | `frontend/src/pages/builder/WorkflowBuilderPage.jsx` |
| Tests | `backend/tests/workflow-step.test.js`, `workflow-storage-routing.test.js`, `crm-workflow-catalogue.test.js` |

## Adding a Step Type

Step types are dispatched by a `switch` on `step.step_type` in `#execStep`. A step handler receives
`(step, record, actorId, logEntry, crmCache, defaultNextId)` and **returns the id of the next step**
— or `null` to halt the chain.

1. **Implement the handler.** Add a `case` to the `#execStep` switch in `workflow.service.js`.
   Contract every handler must honour:

   ```js
   case 'my_step': {
     // Read fields through the cache — never query the record directly.
     if (!crmCache.fields) crmCache.fields = await this.#loadFields(record);

     if (!cfg.required_key) {
       logEntry.result = 'no-op (missing required_key)';   // degrade, don't throw
       return step.on_true_id ?? defaultNextId;
     }

     try {
       // …do the work…
       logEntry.result = 'what happened, in past tense';    // shown in Test Run
     } catch (err) {
       logEntry.result = `failed: ${err.message}`;
       logEntry.error  = err.message;
       return step.on_false_id ?? null;                     // failure branch
     }
     return step.on_true_id ?? defaultNextId;               // success branch
   }
   ```

   - **Always set `logEntry.result`** — it is the entire Test Run experience for that step.
   - **Prefer a logged no-op over a throw** for misconfiguration. A throw is caught and the chain
     continues linearly anyway, so throwing only loses the explanation.
   - **If the step mutates the record**, set `crmCache.fields = null` afterwards so later steps
     re-read fresh values.
   - **Write through `#writeField`**, never `db.record.update` or a `crm*` model directly, or the
     step will only work on one storage kind.

2. **Register it in the Builder palette** — `STEP_TYPES` in `WorkflowBuilder.jsx` (value, label,
   icon, colour) and `CONFIG_HINTS` in the same file (the example JSON shown under the editor).
   A step type missing from `STEP_TYPES` cannot be added through the UI at all.

3. **Add it to the concept panel** — `STEP_OVERVIEW` in `WorkflowBuilderPage.jsx`.

4. **Document it** — the [Step Types Overview](#step-types-overview) and
   [Config keys per step type](#config-keys-per-step-type) tables in this file, and the step list in
   [Workflow Automation](../admin-guide/WORKFLOW_AUTOMATION.md).

5. **Test it** — add a case to `workflow-step.test.js`, and extend the `STEP_TYPES` set in
   `crm-workflow-catalogue.test.js` so catalogue definitions may use it.

> **Long-running work does not belong inline.** The engine awaits each step and holds a DB
> connection for the whole chain. Anything slow should follow the `delay`/`approval` pattern:
> persist a `WorkflowPendingStep`, return `null` to halt, and resume from the scheduler or a
> callback endpoint.

## Adding an Operator

Operators live in one `switch` in `#evaluate(actual, operator, expected)`, which returns a boolean.

1. Add the `case` to `#evaluate`. Follow the existing coercion conventions — string comparisons go
   through `String(x ?? '')`, numeric through `Number(x)`, dates through `new Date(x)` — so an EAV
   value and a CRM column behave the same.
2. Add it to the [Operators Reference](#operators-reference) table here and the operator table in
   [Workflows](../user-guide/06-workflows.md).
3. Add it to the `OPERATORS` set in `crm-workflow-catalogue.test.js`.
4. If it takes no `value` (like `empty` or `date_overdue`), add it to that test's
   no-value-required list too.

An unrecognised operator returns `false`, which halts the chain — so a typo in a config fails
closed and silently. Consider surfacing unknown operators in `logEntry.result`.

## Adding a Trigger Type

Triggers reach the engine two ways, and the right one depends on whether an event already exists.

**From the domain event bus** (preferred — no new plumbing in the write path):

1. Subscribe in `setEventBus()`:

   ```js
   eventBus.subscribe('opportunity.won', (_e, p) => this.trigger('on_opportunity_won', p.objectId, p.record, p.actorId));
   ```

2. Publish the event from the service that owns the transition (`record.service.js`,
   `crm.service.js`, …) **after** the write commits, so `#loadFields` sees final state.
3. Guard against loops — `integration` steps already refuse to publish reserved `record.*` events
   for exactly this reason. Any new internally-subscribed event should be added to that guard.

**From the scheduler** — extend `#runScheduledInner` / `#runScheduledWorkflow`.

Then, whichever route you took, expose it:

- Add the value to the trigger dropdown in `WorkflowBuilderPage.jsx`, or admins cannot select it.
- Add it to the `enum` in `schemas.workflowCreate` (`backend/src/utils/schemas.js`).
- Add it to the valid-trigger set in `crm-workflow-catalogue.test.js` and the
  [Trigger Types](#trigger-types) table here.

> `field_changed` is the cautionary example: the engine has supported it since the beginning, but it
> is absent from both the UI dropdown and the `schemas.workflowCreate` enum, so it can only be
> created by seed or by a direct API call. Without these three steps a trigger stays engine-only.

## Supporting a New Storage Backend

If a new object family stores its data somewhere new (a dedicated table, an external system), the
change belongs in `crm-storage-map.js`, **not** in the engine:

1. Add the object name → model mapping to `MODEL_MAP` and its writable-column set to `CRM_FIELDS`
   (plus `FIELD_ALIAS` if the form vocabulary differs from the columns).
2. `resolveStorage()` then reports `kind: 'crm'`, and both `RecordService` and the engine route to
   it with no further change.
3. Add the relation to the `include` blocks in `#loadFields` and `#writeField`, and to
   `ENTITY_KEYS` in `#resolveRecordStorage`.

Because `RecordService` imports the same module, a mapping added for the API is automatically
honoured by automations — which is the point of the shared map. Do not re-introduce a private copy
of these tables in either file.

## Adding a Workflow to the Catalogue

Catalogue workflows are data, not UI state. Editing one in the Builder works, but the change is
lost on the next install.

1. Append a definition to `WORKFLOWS` in `backend/prisma/crm-workflows.js`. Required keys:
   `name`, `label`, `description`, `object`, `trigger_type`, `trigger_config`, `benchmark`, `steps`.
2. Give every step a unique `key`; link branches with `on_true` / `on_false` **by key** — the
   installer resolves keys to row ids after all steps exist, so links may point forwards or
   backwards.
3. `create_record` steps name their target with `object:` (an object *name*); the installer resolves
   it to that tenant's `object_id`.
4. Use `{{@manager}}` rather than an employee id; add new placeholders to `ACTOR_PLACEHOLDERS` and
   resolve them in the installer's `actors` map.
5. If the workflow writes a field that is not part of the object's metadata, declare it in
   `SUPPORTING_FIELDS` so the installer creates it and the value is visible on the record.
6. Run `node scripts/seed-crm-workflows.js --dry-run`, then `npm test` — the catalogue tests will
   reject unresolved links, unknown operators, unaddressable recipients, a scheduled workflow that
   reads fields without `per_record`, and a malformed approval branch.

## Testing Conventions

Three suites, with different jobs:

| Suite | Job | Style |
| ----- | --- | ----- |
| `workflow-step.test.js` | Per-step-type dispatch and chaining | Mocked Prisma, `manualRun()` |
| `workflow-storage-routing.test.js` | Which store a read/write lands in; per-record sweeps | Mocked Prisma with realistic `include` shapes |
| `crm-workflow-catalogue.test.js` | Structural invariants of the shipped definitions | Pure data assertions, no DB |

Notes for writing new tests:

- The mock `record.findUnique` must include `object: { name }` and `field_values: []`, or storage
  resolution falls back to entity inference and the test asserts the wrong path.
- The scheduler dispatches workflows **fire-and-forget** so one slow sweep cannot stall the tick.
  Tests must drain pending microtasks after `runScheduled()` — see the `flush()` helper in
  `workflow-storage-routing.test.js`.
- No test requires a live database. Keep it that way; `DATABASE_URL` points at shared
  infrastructure.

## Known Gaps & Enhancement Backlog

Verified against the current implementation. Roughly ordered by value-to-effort.

### 1. A scheduled workflow created in the Builder can never run

**The gap.** The create/edit modal in `WorkflowBuilderPage.jsx` exposes Name, Label, Trigger Type
and Description — there is **no `trigger_config` editor**. `#runScheduledInner` computes
`intervalMs` from `trigger_config.interval_minutes` and skips the workflow when it is zero. So an
admin can create a Scheduled workflow, see it listed as Active, and it will never fire. The same
gap makes `per_record` unreachable from the UI.

**Fix.** Add a trigger-config section to the modal that switches on trigger type: interval + a
"run for every record" toggle + row limit for `scheduled`; a field picker for `field_changed`.

### 2. `field_changed` is engine-only

Supported by `triggerFieldChanged()` and used by the `_changed` condition syntax, but missing from
the UI dropdown and the `schemas.workflowCreate` enum. See [Adding a Trigger Type](#adding-a-trigger-type).

### 3. `schemas.workflowCreate` is dead code

Defined in `backend/src/utils/schemas.js` but never attached to the `POST /workflows` route, so
workflow creation is currently unvalidated at the schema layer. Either wire it up (and correct its
enum) or delete it — as it stands it reads as protection that is not there.

### 4. No execution history

`manualRun()` returns a log array, but nothing is persisted. There is no way to answer "did this
workflow fire on this record last Tuesday, and what did each step decide?" — the only evidence is
server console output. A `workflow_run` / `workflow_run_step` pair written on every execution would
make automation debuggable in production and is the single biggest operational gap.

### 5. Conditions are single-field only (resolved for most cases)

The `expression` operator now covers multi-field logic in one step. The original note follows.

`#evaluate` compares one field against one value. Multi-condition logic requires chaining several
`condition` steps, which reads as AND; there is no OR without duplicating a whole branch. A
`config.all` / `config.any` array of clauses would be backward compatible — treat the existing flat
`{field, operator, value}` as a one-clause `all`.

### 6. No first-class terminator

A step with no link falls through by `order_index`, so the only way to end a branch early is a
condition that fails. That is why every approval needs a guard step. A `config.stop: true` honoured
by every handler — returning `null` — would remove the guard convention entirely and make branching
workflows much harder to break.

### 7. Sweeps re-scan the full object

`#runScheduledWorkflow` loads every live record of the object (capped at `limit`) and runs the
chain per record, so the first condition does the filtering in application code. Pushing a
`trigger_config.filter` down into the `record.findMany` `where` would cut the work sharply on large
objects — the date-driven sweeps typically match a small fraction of rows.

### 8. Per-record sweeps are sequential

Deliberate, to protect the connection pool, but a 500-record sweep is 500 sequential chains. A
small bounded concurrency (4–8) would cut sweep wall-clock without threatening request traffic.

### 9. No dry-run for a whole workflow

`POST /workflows/:id/run` executes for real, including writes and notifications. A `dry_run` flag
that returns the log while suppressing every mutation would make the Test Run button safe on
production data.

### 10. Notifications are in-app only

The `notification` step writes rows to the `notification` table. Email and push exist elsewhere in
the platform (`email-template.service.js`, push notifications) but are not reachable from a
workflow step. A `channel: 'email' | 'push' | 'in_app'` config key would close this.

---

## Related Guides

- **Workflow Concepts & Builder**: [../admin-guide/WORKFLOW_AUTOMATION.md](../admin-guide/WORKFLOW_AUTOMATION.md)
- **Architecture**: [ARCHITECTURE_AND_SETUP.md](ARCHITECTURE_AND_SETUP.md)
- **Assignment Rules**: [../user-guide/07-assignment-rules.md](../user-guide/07-assignment-rules.md)
