# Genesis CRM — Workflow Automation

<!-- nav:top -->
> **[Docs roadmap](../README.md)** › **[Administration](README.md)** › 4 of 5 · **For:** Administrators
> ← [Automation reference](automation-reference.md) · [Social media administration](social-media.md) →
> New to Genesis? Background: [Understanding Genesis › What happens automatically](../understanding/06-what-happens-automatically.md)
<!-- /nav:top -->

Complete guide to understanding and building automated workflows in Genesis CRM.

---

## Table of Contents

Concepts:

1. [What Is a Workflow?](#what-is-a-workflow)
1. [Workflow Components](#workflow-components)
1. [How Workflows Are Stored](#how-workflows-are-stored)
1. [Workflow Execution](#workflow-execution)
1. [Built-in Workflows](#built-in-workflows)
1. [Pipeline Drag-and-Drop Automation](#pipeline-drag-and-drop-automation)
1. [Tuning the Built-in Workflows](#tuning-the-built-in-workflows)

Builder Guide:

1. [Accessing the Workflow Builder](#accessing-the-workflow-builder)
1. [Creating Your First Workflow](#creating-your-first-workflow)
1. [Step Configuration](#step-configuration)
1. [Testing Workflows](#testing-workflows)
1. [Common Patterns](#common-patterns)

Best Practices & Troubleshooting:

1. [Best Practices](#best-practices)
1. [Troubleshooting](#troubleshooting)

---

## What's New

Capabilities added in the workflow catalogue release. If you built workflows before it, the first
two items change what your existing ones can do.

| Change | What it means for you |
| ------ | --------------------- |
| **Built-in workflows** | The Genesis Capital pack ships 89 workflows across its modules. See [Built-in Workflows](#built-in-workflows) for the catalogue and [Tuning the Built-in Workflows](#tuning-the-built-in-workflows) for what to adjust first. |
| **Workflows work on every module** | Conditions, actions and `{{placeholders}}` behave the same on every object, whether its data lives in the field-value store (every Genesis Capital object) or in a CRM table. |
| **Scheduled workflows can sweep records** | `"per_record": true` runs a scheduled workflow once for every record, which is what any date-driven rule needs ("expiring within 30 days", "payment overdue"). Without it a scheduled workflow runs once with no record and every condition fails. |
| **Ownership is automatable** | `assigned_to` can be read in conditions and messages, and set by an action step — so a workflow can re-route a record, not just talk about it. |
| **Action values accept placeholders** | An action can compose a value from other fields, e.g. setting a note to `Escalated {{case_number}}`. |
| **Workflow writes reach totals and formulas** | Values written by `action` and `update_related` steps now flow into parent roll-ups and dependent formulas, as a form save does. Before, a workflow that set a status a parent total filters on never reached the parent. |
| **Setting `pipeline_stage_id` is a real stage move** | An `action` step that sets `pipeline_stage_id` now applies the stage entry rules, the mirrored status field, the status timeline and stage events, exactly like an action on `stage`. Before, it was a bare column write. |
| **Encrypted fields stay encrypted** | A field marked for encryption that a workflow step writes is stored encrypted, as a form save stores it. Before, it was written in clear text. |

| **Trigger settings in the Builder** | The workflow dialog sets the watched **Field** of a *When a specific field changes* workflow (or **Any field**, and optionally formula recalculations), and the **Run every** interval and **once for every record** sweep of a scheduled one. The server refuses a schedule with no interval and a per-record sweep with no object, instead of saving a workflow that never runs. |
| **On/off switch** | Click a workflow's **Active / Inactive** badge, or untick **Active** in its dialog, to stop it without deleting it. A pack re-install still restores a shipped workflow it defines. |

---

# Part 1 — Concepts

## What Is a Workflow?

> **Plain language:** A workflow is a set of automated rules that the CRM follows whenever something happens — like
> a new customer record being created, a deal being updated, or a time schedule being reached.
>
> Instead of a human manually sending emails, assigning leads, or updating fields, the system performs those actions
> automatically.

A workflow in Genesis CRM is a **sequential, step-based automation** that:

1. **Listens** for a specific trigger event (a record being created, updated, deleted, or a time interval)
2. **Walks** through a chain of configured steps in order
3. **Branches** at condition steps depending on the values in the record's data fields
4. **Executes** actions: updating fields, sending in-app notifications, or halting for approvals

Workflows are fully defined in the database — no code deployment is required to add or modify them. They are created
and managed in the **Builder → Workflows** section of the admin UI.

### Key Benefits

**Automation Benefits:**

- Reduce manual repetitive tasks
- Ensure consistent process execution
- Improve response times for customer interactions
- Eliminate human errors in routine processes

**Business Process Benefits:**

- Standardize sales and support processes
- Enforce compliance and approval workflows
- Record approval decisions in the audit log
- Enable scalable operations without proportional staff increases

---

## Workflow Components

### Triggers

**Trigger Types:**

- **on_create**: Fires when a new record is created
- **on_update**: Fires when an existing record is modified
- **on_delete**: Fires when a record is deleted
- **field_changed**: Fires when a specific CRM field value changes
- **scheduled**: Fires at regular time intervals — see **Scheduled sweeps** below
- **manual**: Fired explicitly via `POST /api/builder/workflows/:id/run`

**Scheduled sweeps:**

A scheduled workflow runs in one of two modes, set in `trigger_config`:

```json
{ "interval_minutes": 1440, "per_record": true, "limit": 500 }
```

| Setting | Behaviour |
| ------- | --------- |
| `per_record` omitted | Runs **once** with no record in context. Only steps that need no record do anything — a `role` notification, a webhook with a fixed body. Condition and action steps see no field values and the chain stops. |
| `per_record: true` | Runs **once for every record** of the object, so conditions can read each record's own fields. This is what date-driven sweeps ("expiring within 30 days", "payment overdue") need. |

`limit` caps a per-record sweep (default 500). Records are processed one at a time so a sweep
never competes with live user traffic.

> If a scheduled workflow you build never seems to do anything, this is almost always why —
> add `"per_record": true`.

**field_changed Trigger:**

The `field_changed` trigger monitors field changes on any object: a record save, a stage move and a
CRM-table update all report the fields that changed. Configure `trigger_config.field` to specify which
field to watch (without it the workflow fires on any change). A stage move is a change to
`pipeline_stage_id`, which is what most Genesis Capital field-change workflows watch.

With `"derived": true` the workflow also fires when a formula value changes without its record being
saved (for example a loan's LTV status after a pledge is revalued).

When a field changes, the workflow receives a `_changed` context:

```json
{ "_changed": { "disposition": { "old": "pending", "new": "true_match" } } }
```

Condition steps can read old/new values using dotted notation
(e.g. `field: "_changed.disposition.new"`) or `source: "old"` / `source: "new"`.

**What happens automatically when a user saves a change:**

1. Audit log entry with old/new values
2. Activity timeline entry for status field changes
3. All matching `field_changed` workflows fire

**Trigger Scope:**

- Workflows are object-specific (applies to one object type)
- Multiple workflows can exist for the same object and trigger
- Workflows can be enabled/disabled without deletion

### Steps

**Step Categories:**

**1. Condition Steps:**

- Test field values against criteria
- Branch execution based on results
- Support multiple operators (equals, contains, greater than, etc.)

**2. Action Steps:**

- Update field values in the record
- Perform calculations and data transformations
- Integrate with external systems (via webhook integration)

**3. Notification Steps:**

- Send in-app notifications to users (rows in the `notification` table)
- Custom recipient logic — by `field`, `role`, `employee_id`, or `notify_actor`

**4. Delay Steps:**

- Pause execution for specified time periods
- Create scheduled follow-up actions
- Enable multi-stage approval workflows

### Data Flow

**Record Context:**

- Each workflow execution operates on a single record
- Current field values are available throughout execution
- Field updates made during workflow are immediately available

**Variable Interpolation:**

- Use `{{field_name}}` syntax to reference field values in notification/approval titles &
  messages, webhook bodies, and `create_record` / `update_related` values
- A missing field becomes an **empty string** (the placeholder is not left visible)
- In `${{amount}}` the `$` is literal text; only `{{amount}}` is the placeholder

**Where the values come from:** placeholders are filled from a merged view of everywhere the
record's data can live, so the same `{{field_name}}` syntax works on every object:

| Source | Applies to |
| ------ | ---------- |
| The object's CRM table | Objects named lead, prospect, lead_intake, contact, account, opportunity, case (none in Genesis Capital) |
| The typed field-value store | Every other object, including all Genesis Capital objects |
| The record itself | `{{assigned_to}}`, `{{pipeline_stage_id}}`, `{{created_by}}`, `{{record_id}}` |

On a CRM-table object, fields that have both a form name and a database name resolve under **both**.
See the
[Workflow Engine Technical Reference](../developer-guide/engines/workflow-engine.md#placeholder-interpolation--where-values-come-from)
for the routing rules, and [How data is stored](../understanding/03-how-data-is-stored.md) for the two stores.

---

## How Workflows Are Stored

### Database Structure

**Core Tables:**

**`ui_workflows` — the workflow definition**

| Column | Type | Description |
| ------ | ---- | ----------- |
| id | int | Primary key |
| object_id | int | Which object this applies to |
| trigger_type | enum | on_create, on_update, on_delete, field_changed, scheduled, manual |
| name | varchar | Human-readable name |
| description | text | Optional description |
| is_active | boolean | Whether workflow runs |

**`ui_workflow_steps` — individual steps within a workflow**

| Column | Type | Description |
| ------ | ---- | ----------- |
| id | int | Primary key |
| workflow_id | int | Parent workflow |
| step_type | enum | trigger, condition, action, notification, delay, approval, webhook, integration, create_record, update_related, create_reminder, send_email, send_sms, generate_document, email_list |
| order_index | int | Execution sequence |
| config | json | Step-specific configuration |
| on_true_id | int | Next step if condition true |
| on_false_id | int | Next step if condition false |

**Field-level computed values (`ui_fields.config.computed`)**

Separate from workflow automations, a field can declare a computed function (there is no separate table)
that fires based on a `trigger_event`:

| trigger_event | When It Fires |
| ------------- | ------------- |
| `on_change`   | When a watched dependency field value changes (e.g. `calc_full_name`, `calc_age`) |
| `on_blur`     | When the field loses focus in the UI form |
| `on_load`     | When the record/form is first loaded |

The functions live in `frontend/src/utils/fieldFunctions.js` and run in the browser form (e.g.
auto-populating `full_name` from `first_name` + `last_name`). Server-side calculated values are
**Formula** fields.

> **Note — No database-level triggers or stored procedures are used anywhere in the project.**
> All automation logic (workflow execution, field computation, audit logging) runs at the application layer
> in the Node.js services.

### Step Chaining Logic

Steps run in `order_index` order. A step with an explicit `on_true_id` jumps there; without one it
falls through to the next step in order. A `condition` that passes follows `on_true_id` or falls
through; one that fails follows `on_false_id`, and **without an `on_false_id` the chain stops**. An
`approval` resumes at `on_true_id` when approved and `on_false_id` when rejected.

```text
Step 1 (trigger)
Step 2 (condition)              ← fails, no on_false_id ⇒ chain ends
Step 3 (approval)
    ├── on_true_id:  4          ← approved
    └── on_false_id: 6          ← rejected
Step 4 (action)                 ← approved path
Step 5 (condition: guard)       ← false on the approved path ⇒ chain ends
Step 6 (action)                 ← rejected path
```

The chain ends after the last step.

---

## Workflow Execution

### Automatic Execution

**Trigger Points:**

The workflow engine is called automatically at these points:

```text
POST /api/runtime/records           → RecordService.createRecord()       → trigger('on_create')  (after assignment rules)
PUT  /api/runtime/records/:id       → RecordService.updateRecord()       → trigger('on_update') + triggerFieldChanged()
PATCH /api/runtime/records/:id/stage→ RecordService.updateRecordStage()  → trigger('on_update') + triggerFieldChanged('pipeline_stage_id')
DELETE /api/runtime/records/:id     → RecordService.deleteRecord()       → trigger('on_delete')
PUT  /api/runtime/crm/leads/:id     → CrmService.updateLead()            → triggerFieldChanged()
  (same for contacts, accounts, opportunities, cases)
Formula value changes on its own    → record.derived_changed             → field_changed workflows with "derived": true
App scheduler (every 60s)           → runScheduled()                     → trigger('scheduled')
```

Pipeline stage changes (Kanban drag-and-drop) fire both `on_update` and `field_changed` with
`pipeline_stage_id` old/new values, so a workflow can react to a stage transition.

Workflow `action` and `update_related` writes do **not** publish record events and write no audit
entry, so they never trigger other workflows. A `create_record` step goes through the normal record
path, so the new record's `on_create` workflows and assignment rules do run.

**Fire-and-Forget Model:**

- Workflow execution does **not** await a response before returning the HTTP response
- A failure in any workflow step will **never** cause the user's create/update/delete request to fail
- Errors are logged to the server console as `[workflow:N] … failed` entries

### Execution Flow

**Step Processing:**

1. Engine queries for all active workflows matching object and trigger type
2. For each workflow, execution starts at step with lowest `order_index`
3. Steps execute in order, following `on_true_id`/`on_false_id` where set
4. Execution ends after the last step, or at a failed condition with no `on_false_id`
5. Cycle guard (MAX_STEPS = 50) prevents infinite loops

**Error Handling:**

- Individual workflow failures do not affect other workflows
- Step failures are logged with context information
- Failed workflows can be manually re-run for troubleshooting

---

## Built-in Workflows

The Genesis Capital pack ships **89 workflows**: 27 on create, 36 on a field change (mostly stage
moves), 23 scheduled and 3 manual. They are installed with the pack
(`backend/prisma/verticals/genesis-capital/automation.js` and `automation-phase2.js`) and are fully
editable in **Builder > Workflows** — treat them as working templates and adjust thresholds, roles and
messages to match how your team operates.

### The catalogue

| Module | Workflows | Examples |
| ------ | --------- | -------- |
| Enquiries & Leads | 7 | Acknowledgement (EN/FR); existing clients go to their RM; convert to Party, KYC and application; website call-back |
| Clients | 7 | ID document expiring; risk profile refresh due; birthday reminder; four next-best-action sweeps |
| KYC & Compliance | 10 | Risk-based approval (MLRO for high risk); sanctions/PEP screening; daily rescreening; STR alert; gifts approval |
| Retail Lending | 14 | Request documents; approval matrix; offer and decline letters; disbursement maker-checker; MCIB report; LTV margin call |
| Commercial Lending | 3 | Facility approval matrix; annual review; covenant breach alert |
| Collateral & Pledges | 4 | Insurance lapsing; revaluation due; margin call notice |
| Loan Servicing | 8 | PLR change notices; arrears early warning; instalment reminder by SMS; maturity retention |
| Wealth Management | 5 | Mandate review scheduling and invite; attrition risk alert |
| Investment Funds | 3 | Fund order maker-checker; distribution notice |
| Trading Solutions | 3 | Order hand-off; dormant account reactivation; research send-out (manual) |
| Corporate Advisory | 6 | Conflict check; engagement letter; insider list; milestone fee invoice |
| Forex Desk | 6 | Book the deal; spread income; rate alerts (hourly); forward maturity reminder |
| Cross-sell & RM Workbench | 4 | Accepted suggestion opens an opportunity; stage sets probability; Accept / Dismiss (manual) |
| Marketing & Consent | 3 | Event follow-up; registration to the guest's RM; campaign Compliance sign-off |
| Service & Complaints | 3 | Acknowledge (complaints to Compliance); route approvals; satisfaction survey |
| Introducers | 2 | Referral creates the enquiry; accrue commission |
| Masters | 1 | Rate alerts on a new board rate |

`prisma/crm-workflows.js` holds a separate five-workflow lead-to-client catalogue for objects named
`lead_intake`, `prospect` and `client`. The onboarding wizard's **Automation** step installs it into a
new workspace that has no workflows yet (as does `scripts/seed-crm-workflows.js`); a workflow whose
object does not exist in the workspace is skipped. The seed does not install it, and Genesis Capital
has none of those objects.

### Three shapes worth understanding

The Genesis Capital pack uses the first and third (none of its workflows uses a
`delay` step). Learn them and you can read — and safely modify — any workflow.

**1. Gated linear chain** — the most common shape. Steps run top to bottom, and a
condition that fails **stops the whole chain**. So you order conditions from
broadest to narrowest and put the work at the end.

```text
Enquiry — existing clients go to their RM   (Enquiry, on_create)

Trigger: A new enquiry
  → Condition:    existing_rm is not empty     ← fails here ⇒ chain ends
  → Action:       assigned_to = {{existing_rm}}
  → Notification: field "assigned_to" — "Existing client enquiry — {{display_name}}"
```

Only an enquiry from an existing client reaches the reassignment. No branching required.

**2. SLA clock** — a `delay` step parks the run and the scheduler resumes it. The
condition after the delay re-reads the record, so it sees whatever happened
during the wait.

```text
Enquiry — first-touch check   (Enquiry, on_create — an example you would build)

Trigger: A new enquiry
  → Delay:        4 hours                      ← execution pauses here
  → Condition:    still in stage "new"         ← someone worked it ⇒ chain ends
  → Notification: role "bu_head" — not contacted in time
```

The same shape fits any "nobody touched it in time" rule, such as a case
escalation.

**3. Approval with a guard** — the only genuinely branching shape, and the one
that most often gets broken when edited. The pack has 14 approval steps; the gift
register is the simplest.

```text
Gifts — above-threshold approval   (Gift register, on_create)

Trigger: A new declaration
  → Condition: needs_approval = true
  → Approval:  role "compliance_officer" (never the person who declared it)
       ├─ APPROVED  → Action: decision = "approved"
       │                    ↓ falls through to the guard
       │              Guard: decision = "declined"   ← false ⇒ chain stops
       └─ REJECTED  ──────→ Action: decision = "declined"
```

**Why the guard exists:** a step with no explicit link continues to the next step
in order. Without the guard, the approved path would run straight on into the
rejection steps. The guard is a condition that re-reads what the approved branch
just wrote, so arriving from the approved path it is false and the chain stops.
The rejection link either points past the guard or at a guard that is true for it.

> **If you clone or edit an approval workflow, keep the guard step and keep the
> rejection steps ordered after the approved ones.** Deleting the guard makes
> every approval also execute its own rejection.

### The Approval Status field

An approval workflow should read and write a decision or **Approval Status** field
(Pending / Approved / Rejected) on its object — the gift register uses `decision`.
Add it as a select field in the Builder. It does two jobs:

- it shows the reviewer's decision on the record, and
- it is the **latch** that stops the same record being sent for approval twice
  every time someone saves it.

Clearing it on a record puts that record back in scope for approval — which is
the supported way to re-request one.

### Additional patterns you can build

The catalogue does not cover everything. These are worth building on top:

Business-unit routing:

- Trigger: `on_create`
- Condition: `business_unit` = your unit
- Action: `assigned_to` = the unit's desk (the shipped assignment rules already do this for enquiries,
  referrals and service requests)

Multi-level approval:

- Chain two `approval` steps, each with its own guard, so a very large loan needs
  both the loans manager and the credit committee (the shipped retail approval matrix instead sends
  each amount band to one approver)

Outbound sync:

- Trigger: `field_changed` on status
- Webhook or Integration step posting to your ERP or billing system

## Pipeline Drag-and-Drop Automation

In addition to the configurable workflow engine above, the stage route has
**built-in conversion** for objects named `lead_intake`, `lead` and `prospect`.
When a user drags a card of one of those objects to a conversion lane (the
`converted` stage, or a stage with `config.is_conversion_stage`), the system
converts it — no workflow configuration required.

| Object | Lane | Auto-Action |
| ------ | ---- | ----------- |
| Lead Intake | Converted | Qualifies the lead into a prospect |
| Prospect / Lead | Converted | Converts the lead to a client (Account + Contact + EAV copy) |

Genesis Capital has none of these objects, so this never runs there: an enquiry is
converted by the **Enquiry — convert to Party, relationship, KYC and application**
workflow when it reaches its conversion stage.

Every pipeline stage change also fires the workflow engine's `on_update` and
`field_changed` triggers, so workflows configured in the Workflow Builder run on
Kanban drag-and-drop moves.

---

## Tuning the Built-in Workflows

The built-in workflows are configured with defaults, not fixed rules. These are the settings most
teams change first. Every one is edited the same way: open the workflow in
**Builder > Workflows**, click the step named below, and edit its **Configuration (JSON)**.

Full plain-English descriptions of what each workflow does are in
[Workflows — what ships out of the box](../builder-guide/12-workflows.md#what-ships-out-of-the-box).

### Timings

| Workflows | Setting | Default | Notes |
| --------- | ------- | ------- | ----- |
| Scheduled sweeps (most) | trigger config | daily | `interval_minutes: 1440`, `per_record: true`, `limit` 2000 or 5000 |
| FX — rate alerts | trigger config | hourly | `interval_minutes: 60` |
| Date windows in conditions | `date_within_days` value | per workflow | e.g. how many days before an ID document expires |

A `delay` step's wait is `{ "duration": N, "unit": "minutes" | "hours" | "days" }`.

### Who gets notified

Every notification and approval step names its recipient one of four ways:

| Config | Resolves to |
| ------ | ----------- |
| `"role": "compliance_officer"` | Everyone active in that role |
| `"field": "assigned_to"` | The record's owner |
| `"employee_id": "GCCOMP1"` | One named person |
| `"notify_actor": true` | Whoever triggered the workflow |

Roles used by the built-in workflows: `mlro`, `compliance_officer`, `loans_manager`, `credit_committee`,
`board_credit_committee`, `operations_checker`, `portfolio_manager`, `trader`, `bu_head` and `marketing`.
If you rename a role, update these — a `role` that matches nobody means the step notifies nobody, and it
does so without error. `exclude_actor` / `exclude_field` keep the maker out of a checker's recipients.

### Turning things off

Deactivate rather than delete, so the workflow keeps its edits and can be switched back on. Re-running
the Genesis Capital installer (`node scripts/install-vertical.js genesis-capital --tenant …`, or a
reseed) restores every pack workflow to its shipped definition: a deleted one is recreated, and an
edited or deactivated one is replaced and switched back on.

### A caution on editing

Two things will break a workflow quietly if changed carelessly:

- **Guard steps** in any approval workflow you build. Removing one makes every approval also run its
  own rejection steps. See [Three shapes worth understanding](#three-shapes-worth-understanding).
- **Latch conditions** — a condition that checks the workflow has not already done its work (for
  example an empty decision or reference field) before a `create_record` step. Removing it produces a
  duplicate record on every qualifying save.

After any edit, use **Test Run** on a real record and read the step log before reactivating.

---

# Part 2 — Builder Guide

## Accessing the Workflow Builder

### Prerequisites

- Admin or super_admin role

### Navigation

1. Go to **Builder → Workflows**
2. Click **+ Create Workflow** or edit an existing workflow

---

## Creating Your First Workflow

### Example: Large Loan Alert

**Goal**: Tell the loans manager when a large loan application is created.

**Steps:**

1. **Create New Workflow**
   - Name: "large_loan_alert"
   - Trigger: "When a record is created"
   - Object: "Loan Application"

2. **Add Condition Step**
   - Type: "Condition"
   - Name: "Large amount"
   - Condition: `{ "field": "loan_amount_mur", "operator": "gte", "value": 10000000 }`

3. **Add Notification Step**
   - Type: "Notification"
   - Name: "Tell the loans manager"
   - Config: `{ "role": "loans_manager", "title": "Large application — {{name}}" }`

Routing a record to a person is better done with **Assignment Rules**; use a workflow `action` on
`assigned_to` when the target comes from the record itself (for example `{{existing_rm}}`).

---

## Step Configuration

### Condition Steps

**Basic Condition:**

```json
{ "field": "request_type", "operator": "eq", "value": "complaint" }
```

**Field Changed Context (old/new values):**

```json
{ "field": "_changed.disposition.new", "operator": "eq", "value": "true_match" }
```

Or using `source`:

```json
{ "field": "disposition", "source": "new", "operator": "eq", "value": "true_match" }
```

**Supported Operators:**

| Operator | Description | Example |
| -------- | ----------- | ------- |
| `eq` / `==` | Exact match | `lead_status eq "qualified"` |
| `neq` / `!=` | Not equal | `status neq "closed"` |
| `in` | Value in list | `lead_source in ["web", "referral"]` |
| `nin` | Value not in list | `stage nin ["lost", "won"]` |
| `gt`, `gte`, `lt`, `lte` | Numeric comparisons | `amount gt 10000` |
| `contains` | String contains (case-insensitive) | `company contains "tech"` |
| `empty` | Field is null or blank | `phone empty` |
| `notempty` | Field has a value | `email notempty` |
| `before_today` | Date before today | `close_date before_today` |
| `after_today` | Date after today | `follow_up after_today` |
| `today` | Date is today | `created_at today` |
| `date_within_days` | Date within N days | `close_date date_within_days 7` |
| `date_overdue` | Date is in the past | `due_date date_overdue` |
| `expression` | A formula over the whole record is true (`value` holds the formula) | `DAYS_BETWEEN(TODAY(), next_birthday) = 0` |

### Action Steps

**Update Record Fields:**

- Field: Select from dropdown
- Value: Static text, formula, or field reference
- Example: Set `decision = "approved"` on the approved branch of an approval

> ⚠️ **A workflow `action` step only writes `field = value` (a single static value).** It does
> **not** do pool-based or round-robin assignment. Config keys like `pool` or `assignment_type`
> on an action step are ignored, and without a `value` the step does nothing. Round-robin /
> pool assignment is handled by the separate **Assignment Rules** engine (`pool_ids`), which
> runs automatically on record create. See
> [Assignment Rules](../builder-guide/11-assignment-rules.md).

What a write does next (the same applies to `update_related`):

- **Roll-ups and formulas follow.** The record's formulas, parent totals that count or sum it (including totals
  filtered on the field you changed) and records that read it through a lookup are recalculated.
- **Stage moves go through the pipeline.** Setting `stage` (by API name) or `pipeline_stage_id` (by id) is a stage
  move: entry rules apply, the mirrored status field and the status timeline are updated, and stage events fire.
- **Encryption is honoured.** Fields marked for encryption are stored encrypted.

**Send Notification:**

- Title and message, with placeholders
- Recipients: an employee, a record field, a role, and/or the actor
- Dynamic content using `{{field_name}}` syntax

**Delay Step:**

```json
{ "duration": 24, "unit": "hours" }
```

Supported units: `minutes`, `hours`, `days`.

### Variable Syntax

The only placeholder syntax the engine supports is `{{field_name}}`, resolved from the record's
merged field map (see [Variable Interpolation](#data-flow) above for exactly which stores feed it).

| Syntax | Meaning |
| ------ | ------- |
| `{{field_name}}` | Value of a field on the current record, whichever store holds it |
| `{{assigned_to}}` | The record's owner — usable in a message or as a `field` recipient |

---

## Testing Workflows

> **Plain language:** Before turning a workflow on, you can test it against a real record to see exactly what it
> would do, step by step, without affecting anything live.

**Note:** `action` steps do write fields to the database during a manual run — use a test record if you do not want
live changes.

**Testing Process:**

1. Select a workflow in Builder → Workflows
2. Choose a test record from the target object
3. Click "Test Run" to execute against the record
4. Review step-by-step execution log
5. Verify expected behavior before enabling

**Debug Information:**

- **Step Results**: See actual values used
- **Condition Evaluation**: True/false with reasoning
- **Error Messages**: Clear description of issues

---

## Common Patterns

Patterns 1 and 2 are not covered by the built-in workflows; pattern 3 is the shape of the shipped
*Party — ID document expiring* sweep. Pattern 4 shows how to extend an approval workflow.

> These patterns use a watched field or a schedule: set them in the workflow dialog's **Field** or **Run every**
> controls.

### 1. Escalate a High-Risk Party

Ordered broadest-first, so the chain stops when the condition fails.

```text
Trigger: field_changed  { field: "risk_rating" }
→ Condition: { field: "_changed.risk_rating.new", operator: "eq", value: "high" }
→ Notification: { role: "mlro", title: "Party now high risk",
                  message: "{{display_name}} moved to high risk." }
```

### 2. Business-Unit Routing

```text
Trigger: on_create
→ Condition: { field: "business_unit", operator: "eq", value: "FX" }
→ Action:    { field: "assigned_to", value: "GCFX1" }
→ Notification: { field: "assigned_to", title: "New FX enquiry",
                  message: "{{display_name}} — {{product_code}}." }
```

Build one workflow per unit, or use Assignment Rules, which the pack already ships for this.

### 3. Date-Driven Outreach

```text
Trigger: scheduled  { interval_minutes: 1440, per_record: true }
→ Condition: { field: "id_expiry_date", operator: "date_within_days", value: 30 }
→ Notification: { field: "assigned_to", title: "ID document expiring",
                  message: "{{display_name}} — ID expires {{id_expiry_date}}." }
```

`per_record` is essential here: without it the workflow runs once with no record and the condition
always fails.

### 4. Extending an Approval — Multi-Level Sign-off

An approval that sends every application over a limit to the loans manager can require a second
sign-off above a higher limit: chain a second approval **inside the approved branch**, each with its
own guard:

```text
… Approval: { role: "loans_manager" }
   → Approved: Action: { field: "credit_decision", value: "approved" }
               Condition: { field: "loan_amount_mur", operator: "gte", value: 50000000 }
               Approval: { role: "credit_committee", title: "Committee referral" }
                  → Approved: Action: { field: "stage", value: "offer_issued" }
                  → Rejected: Guard → Action: { field: "stage", value: "declined" }
   → Rejected: Guard: { field: "credit_decision", operator: "neq", value: "approved" }
               …
```

Each approval needs its own guard and its own state field value, or the branches interleave. Test
this shape with **Test Run** on a real record before activating it — nested approvals are the
easiest workflow shape to get subtly wrong.

---

# Part 3 — Best Practices & Troubleshooting

## Best Practices

### Workflow Design

**Keep It Simple:**

- Start with basic workflows and add complexity gradually
- Use clear, descriptive names for workflows and steps
- Document the business logic and purpose in the description field
- One workflow per business process — don't combine unrelated automations

**Test Thoroughly:**

- Always test workflows with sample data first
- Verify all branching paths (both true and false) work correctly
- Check notifications reach intended recipients
- Test with edge cases (null values, missing data)

### Performance Considerations

**Efficient Conditions:**

- Use specific field conditions to avoid unnecessary processing
- Order conditions from most selective to least selective
- Avoid complex calculations in condition steps if possible

**Manageable Scope:**

- Keep workflow step counts to the minimum needed
- Break complex processes into multiple linked workflows
- Use clear naming conventions for related workflows

### Maintenance

**Regular Review:**

- Review workflow effectiveness monthly
- Update conditions as business rules change
- Disable obsolete workflows rather than deleting (preserves history)
- Maintain change logs in the description field

---

## Troubleshooting

### Workflow Not Triggering

- Check trigger type matches the operation (create vs update)
- Verify workflow `is_active = true`
- Review server console logs for `[workflow:N]` entries

### Condition Always False

- Validate field names are exactly correct (case-sensitive)
- Check data types (string "1" vs number 1)
- Use the Test Run feature to see actual values at runtime
- Try simplifying the condition first, then add complexity back
- On a **scheduled** workflow, confirm `trigger_config` has `"per_record": true`.
  Without it the workflow runs with no record in context, so every condition sees
  nothing and fails

### Scheduled Workflow Does Nothing

- Add `"per_record": true` to `trigger_config` if any step reads record fields —
  this is the single most common cause
- Confirm `interval_minutes` is set and greater than zero
- The scheduler ticks every 60 seconds, but a workflow only fires once its
  interval has elapsed since `last_run_at`
- A sweep stops at `limit` records (default 500) — raise it for a large object

### Approval Runs Its Own Rejection Steps

The approved branch fell through into the rejection steps. Check that:

- the approval step's rejection link points at the **Guard** condition, not at the
  first rejection action
- the guard is still present and still tests the field the approved branch writes
  (`approval_status != "approved"`)
- the rejection steps are ordered **after** the approved ones

See [Three shapes worth understanding](#three-shapes-worth-understanding).

### Approval Never Fires a Second Time

By design. The `approval_status` latch stops a record being re-submitted on every
save. Clear **Approval Status** on the record to put it back in scope.

### Action Step Reports a No-op

- `cfg.field` or `cfg.value` is missing — both are required
- On a CRM-table object only: the field is a column on the CRM table but the record
  has no CRM entity row yet (it was created without any field data). The engine
  refuses to write it elsewhere rather than create a duplicate value in a second
  store — save the record with its fields first

### Action Failing

- Check the field name and value type (workflow writes skip permissions and validation, so a wrong name
  or a value the field cannot hold is the usual cause)
- Review integration credentials for webhook steps

### Performance Problems

- Identify bottleneck steps using execution timing in test runs
- Optimize condition ordering — most selective conditions first
- Consider breaking long workflows into smaller ones
- `action` writes never trigger other workflows, but `create_record` does run the new record's `on_create` workflows — watch for loops between objects

---

## Related Guides

- **Permissions**: [permissions-and-roles.md](permissions-and-roles.md)
- **System Configuration**: [system-configuration.md](system-configuration.md)
- **Workflow Engine Technical Reference**: [../developer-guide/engines/workflow-engine.md](../developer-guide/engines/workflow-engine.md)
- **Daily Operations**: [../using-the-crm/daily-operations.md](../using-the-crm/daily-operations.md)

<!-- nav:bottom -->

---

### Where to next

| | |
|---|---|
| **Next** | [Social media administration](social-media.md) — Accounts, OAuth, publishing, routing; Meta/WhatsApp go-live plans |
| **Previous** | [Automation reference](automation-reference.md) |
| **Background** | [Understanding Genesis › What happens automatically](../understanding/06-what-happens-automatically.md) |
| **Related** | [Workflow engine](../developer-guide/engines/workflow-engine.md) |
| **On these journeys** | [CRM administrator](../README.md#crm-administrator) (step 6 of 7) |
| **Lost?** | [Docs roadmap](../README.md) · [Administration](README.md) · [Understanding Genesis](../understanding/README.md) |
<!-- /nav:bottom -->
