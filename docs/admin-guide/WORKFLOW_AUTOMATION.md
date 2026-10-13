# Genesis CRM — Workflow Automation

Complete guide to understanding and building automated workflows in Genesis CRM.

---

## Table of Contents

Concepts:

1. [What Is a Workflow?](#what-is-a-workflow)
1. [Workflow Components](#workflow-components)
1. [How Workflows Are Stored](#how-workflows-are-stored)
1. [Workflow Execution](#workflow-execution)
1. [Built-in Workflows](#built-in-workflows)
1. [Pipeline Drag-and-Drop Automation](#pipeline-drag-and-drop-automation-insurance)
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
| **18 built-in workflows** | The Builder now ships a full lifecycle suite instead of three demo workflows. See [Built-in Workflows](#built-in-workflows) for the catalogue and [Tuning the Built-in Workflows](#tuning-the-built-in-workflows) for what to adjust first. |
| **Workflows now work on every module** | Conditions, actions and `{{placeholders}}` previously did nothing on Application, Policy, Claim, Quote and Client records — only the CRM objects worked. All modules now behave identically. If you worked around this by hard-coding text into a message, you can replace it with a placeholder. |
| **Scheduled workflows can sweep records** | `"per_record": true` runs a scheduled workflow once for every record, which is what any date-driven rule needs ("expiring within 30 days", "payment overdue"). Without it a scheduled workflow runs once with no record and every condition fails. |
| **Ownership is automatable** | `assigned_to` can be read in conditions and messages, and set by an action step — so a workflow can re-route a record, not just talk about it. |
| **Action values accept placeholders** | An action can compose a value from other fields, e.g. setting a note to `Auto-expired {{policy_number}}`. |
| **Approval outcomes are visible** | Quote, Application and Commission carry an **Approval Status** field that records the reviewer's decision and prevents repeat submissions. |

> **Known limitation:** the workflow create/edit dialog has no field for trigger configuration, so
> `interval_minutes` and `per_record` cannot yet be set from the Builder UI. A Scheduled workflow
> created through the dialog will never fire. Until that is addressed, scheduled workflows must be
> configured by the development team. The built-in scheduled workflows are already configured
> correctly.

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
- Provide audit trails for all automated actions
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

The `field_changed` trigger monitors individual field changes on CRM entities
(Lead, Contact, Account, Opportunity, Case). Configure `trigger_config.field`
to specify which field to watch.

When a field changes, the workflow receives a `_changed` context:

```json
{ "_changed": { "lead_status": { "old": "new", "new": "contacted" } } }
```

Condition steps can read old/new values using dotted notation
(e.g. `field: "_changed.lead_status.new"`) or `source: "old"` / `source: "new"`.

**What happens automatically on any CRM field change:**

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
- In `${{coverage_amount}}` the `$` is literal text; only `{{coverage_amount}}` is the placeholder

**Where the values come from:** placeholders are filled from a merged view of everywhere the
record's data can live, so the same `{{field_name}}` syntax works on every object:

| Source | Applies to |
| ------ | ---------- |
| The object's CRM table | Lead, Prospect, Contact, Account, Opportunity, Case |
| The typed field-value store | Application, Policy, Claim, Quote, Underwriting Case, Commission, Client, and all custom objects |
| The record itself | `{{assigned_to}}`, `{{pipeline_stage_id}}`, `{{created_by}}`, `{{record_id}}` |

Fields that have both a form name and a database name resolve under **both** — `{{annual_income}}`
and `{{annual_revenue}}` return the same value on a Prospect.

> **Changed in the workflow catalogue release.** Placeholders on insurance objects
> (`{{application_number}}`, `{{claim_number}}`, `{{policy_number}}`, `{{coverage_amount}}`, …)
> previously rendered blank because the engine read only the CRM tables. They now resolve
> correctly. If you built a workflow that worked around this by hard-coding text into a message,
> you can replace it with the placeholder. See the
> [Workflow Engine Technical Reference](../developer-guide/WORKFLOW_ENGINE.md#placeholder-interpolation--where-values-come-from)
> for the routing rules.

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
| step_type | enum | trigger, condition, action, notification, delay, approval, webhook, create_record, update_related |
| order_index | int | Execution sequence |
| config | json | Step-specific configuration |
| on_true_id | int | Next step if condition true |
| on_false_id | int | Next step if condition false |

**`ui_field_computeds` — field-level computed triggers**

Separate from workflow automations, individual object fields can declare a computed function that fires
based on a `trigger_event`:

| trigger_event | When It Fires |
| ------------- | ------------- |
| `on_change`   | When a watched dependency field value changes (e.g. `calc_full_name`, `calc_age`) |
| `on_blur`     | When the field loses focus in the UI form |
| `on_load`     | When the record/form is first loaded |

These are configured in the field's `config.computed` JSON and execute client-side or server-side
calculations (e.g. auto-populating `full_name` from `first_name` + `last_name`).

> **Note — No database-level triggers or stored procedures are used anywhere in the project.**
> All automation logic (workflow execution, field computation, audit logging) runs at the application layer
> in the Node.js services.

### Step Chaining Logic

Steps do **not** run purely in `order_index` sequence after the first step. After the first step (lowest
`order_index`) is executed, the engine follows the **`on_true_id` / `on_false_id` pointers** to determine the next
step. This enables branching flows.

```text
Step 1 (trigger)   → on_true_id: 2
Step 2 (condition)
    ├── on_true_id:  3   ← goes here when condition matches
    └── on_false_id: 4   ← goes here when condition does NOT match
Step 3 (action)    → on_true_id: 5
Step 4 (action)    → on_true_id: 5
Step 5 (notification) → on_true_id: null  ← end of chain
```

If `on_true_id` is `null`, the chain ends at that step.

---

## Workflow Execution

### Automatic Execution

**Trigger Points:**

The workflow engine is called automatically at six points:

```text
POST /api/runtime/records           → RecordService.createRecord()       → trigger('on_create')
PUT  /api/runtime/records/:id       → RecordService.updateRecord()       → trigger('on_update')
PATCH /api/runtime/records/:id/stage→ RecordService.updateRecordStage()  → trigger('on_update') + triggerFieldChanged('pipeline_stage_id')
DELETE /api/runtime/records/:id     → RecordService.deleteRecord()       → trigger('on_delete')
PUT  /api/runtime/crm/leads/:id     → CrmService.updateLead()            → triggerFieldChanged()
  (same for contacts, accounts, opportunities, cases)
App scheduler (every 60s)           → runScheduled()                     → trigger('scheduled')
```

> **Note (v4.0.4):** Pipeline stage changes (Kanban drag-and-drop) now
> fire both `on_update` and `field_changed` triggers with
> `pipeline_stage_id` old/new values. This enables workflows that react
> to stage transitions (e.g., send notification when moved to "Approved").

**Fire-and-Forget Model:**

- Workflow execution does **not** await a response before returning the HTTP response
- A failure in any workflow step will **never** cause the user's create/update/delete request to fail
- Errors are logged to the server console as `[workflow:N] "name" failed: ...`

### Execution Flow

**Step Processing:**

1. Engine queries for all active workflows matching object and trigger type
2. For each workflow, execution starts at step with lowest `order_index`
3. Steps execute sequentially following `on_true_id`/`on_false_id` chains
4. Execution continues until reaching a step with `on_true_id: null`
5. Cycle guard (MAX_STEPS = 50) prevents infinite loops

**Error Handling:**

- Individual workflow failures do not affect other workflows
- Step failures are logged with context information
- Failed workflows can be manually re-run for troubleshooting

---

## Built-in Workflows

Genesis CRM ships with **18 pre-configured workflows** covering the full CRM
lifecycle, from lead capture through to commission payout. Each one implements
an automation pattern that Salesforce, HubSpot, Zoho CRM, Dynamics 365, and
Pipedrive all provide out of the box, adapted to the life-insurance object model.

They are installed by the seed script and are fully editable in
**Builder > Workflows** — treat them as working templates and adjust the
thresholds, roles, and wait times to match how your agency operates. Every
workflow's description in the Builder names the industry pattern it implements.

### The catalogue

| Object | Workflow | Trigger | What it does |
| ------ | -------- | ------- | ------------ |
| Lead | Instant Routing & Priority Alert | On Create | Normalises status, queues the lead to sales, escalates hot/warm leads to the manager for a 5-minute callback |
| Lead | First-Response SLA & Re-routing | On Create | Waits 60 minutes; if still untouched, alerts the manager and re-assigns the lead to them |
| Lead | Qualification Handoff to Prospect | On Update | On reaching Qualified, creates the Prospect record and notifies the manager |
| Prospect | Cold Nurture Sweep | Scheduled (weekly) | Flags prospects stuck at New/Contacted with a cold rating |
| Quote | Presented Follow-up Cadence | On Update | Reminds the owner 3 days after presenting if the client has not decided |
| Quote | High-Value Approval | On Update | Holds quotes of 1,000,000+ cover at draft pending manager approval |
| Quote | Expiry Warning | Scheduled (daily) | Warns the owner 7 days before an open quote's validity date |
| Quote | Auto-Expire Past Validity | Scheduled (daily) | Closes out open quotes whose validity date has passed |
| Application | Submission Handoff to Underwriting | On Create | Stamps the status, opens the underwriting case, notifies both sides |
| Application | Jumbo Limit Referral & Approval | On Update | Refers 2,000,000+ cover to the chief underwriter, then approves or declines |
| Underwriting Case | 48-Hour SLA Escalation | On Create | Queues the case; escalates to the chief underwriter if still pending after 48h |
| Policy | In-Force Onboarding Handoff | On Create | Raises the welcome call, opens the commission record, notifies the manager |
| Policy | 30-Day Renewal Outreach | Scheduled (daily) | Surfaces policies expiring within 30 days |
| Policy | Lapse Prevention | Scheduled (daily) | Alerts on overdue premium payments while the policy can still be saved |
| Claim | Intake Triage & Large-Loss Routing | On Create | Alerts the claims manager, routes 250,000+ claims to a senior underwriter |
| Claim | Documentation SLA Escalation | On Create | Chases missing documents after 3 days, escalates to the manager |
| Commission | Large Payout Approval | On Update | Requires manager sign-off before releasing a payout of 25,000+ |
| Client | Data Hygiene Sweep | Scheduled (weekly) | Flags client records with no email address |

### Three shapes worth understanding

Almost every workflow in the catalogue is one of these three. Learn them and you
can read — and safely modify — any of the 18.

**1. Gated linear chain** — the most common shape. Steps run top to bottom, and a
condition that fails **stops the whole chain**. So you order conditions from
broadest to narrowest and put the work at the end.

```text
Lead — Instant Routing & Priority Alert   (Lead, on_create)

Trigger: New Lead Captured
  → Action:       lead_status = "new"
  → Notification: role "user" — "New lead in your queue"
  → Condition:    rating in [hot, warm]        ← fails here ⇒ chain ends
  → Notification: role "manager" — high-intent escalation
```

Every lead gets the queue notification; only hot and warm leads reach the
manager escalation. No branching required.

**2. SLA clock** — a `delay` step parks the run and the scheduler resumes it. The
condition after the delay re-reads the record, so it sees whatever happened
during the wait.

```text
Lead — First-Response SLA & Re-routing   (Lead, on_create)

Trigger: Lead Captured — Start Response Clock
  → Delay:        60 minutes                   ← execution pauses here
  → Condition:    lead_status still "new"      ← someone worked it ⇒ chain ends
  → Notification: role "manager" — SLA breached
  → Action:       assigned_to = the sales manager
```

The same shape drives the 48-hour underwriting escalation and the 3-day claim
documentation chase.

**3. Approval with a guard** — the only genuinely branching shape, and the one
that most often gets broken when edited.

```text
Quote — High-Value Approval   (Quote, on_update)

Trigger: Quote Updated
  → Condition: status == "presented"
  → Condition: coverage_amount >= 1,000,000
  → Condition: approval_status is empty        ← latch: only the first time
  → Action:    approval_status = "pending"
  → Action:    status = "draft"                ← hold it back from the client
  → Approval:  role "manager"
       ├─ APPROVED  → Action: approval_status = "approved"
       │              Action: status = "presented"
       │              Notification: owner — released
       │                    ↓ falls through to the guard
       └─ REJECTED  ──────→ Guard: approval_status != "approved"
                            Action: approval_status = "rejected"
                            Notification: owner — revise and resubmit
```

**Why the guard exists:** a step with no explicit link continues to the next step
in order. Without the guard, the approved path would run straight on into the
rejection steps. The guard is a condition that re-reads what the approved branch
just wrote — arriving from the approved path it is false and the chain stops;
arriving from the rejection link it is true and the rejection steps run.

> **If you clone or edit an approval workflow, keep the guard step and keep the
> rejection steps ordered after the approved ones.** Deleting the guard makes
> every approval also execute its own rejection.

### The Approval Status field

The three approval workflows read and write an **Approval Status** field
(Pending / Approved / Rejected) on Quote, Application, and Commission. The seed
script creates it. It does two jobs:

- it shows the reviewer's decision on the record, and
- it is the **latch** that stops the same record being sent for approval twice
  every time someone saves it.

Clearing it on a record puts that record back in scope for approval — which is
the supported way to re-request one.

### Additional patterns you can build

The catalogue does not cover everything. These are worth building on top:

Territory-based routing:

- Trigger: `on_create`
- Condition: `address_state` in your territory list
- Action: `assigned_to` = the territory owner

Multi-level approval:

- Chain two `approval` steps, each with its own guard, so a very large case needs
  both the sales manager and the chief underwriter

Outbound sync:

- Trigger: `field_changed` on status
- Webhook or Integration step posting to your policy admin or billing system

## Pipeline Drag-and-Drop Automation (Insurance)

In addition to the configurable workflow engine above, Genesis
includes **built-in pipeline automation** for insurance modules.
When a user drags a card to a new Kanban lane, the system
auto-triggers the corresponding insurance domain action — no
workflow configuration required.

| Module | Lane | Auto-Action |
| ------ | ---- | ----------- |
| Prospects | Converted | Converts lead to client (Account + Contact + EAV copy) |
| Applications | Under Review | Creates underwriting case with CRM Record + EAV |
| Applications | Pending Medical / Declined | Syncs status to `insurance_applications` |
| Claims | Any status lane | Syncs status to `insurance_claims` |

This automation is hardcoded in the `PATCH /records/:id/stage`
route (not configurable via the Workflow Builder). It runs after
the stage update succeeds, so the Kanban move is never blocked
by automation failures.

**Additionally (v4.0.4):** Every pipeline stage change now also fires
the workflow engine's `on_update` and `field_changed` triggers, so
custom workflows configured in the Workflow Builder will also execute
on Kanban drag-and-drop moves. This enables user-configured automations
(notifications, field updates, webhooks) on top of the built-in
insurance domain actions.

For the full insurance journey flow, see the
[Genesis Insure Journey](../user-guide/GENESIS_INSURE_JOURNEY.md)
documentation.

---

## Tuning the Built-in Workflows

The built-in workflows are configured with defaults, not policy. These are the settings most
agencies change first. Every one is edited the same way: open the workflow in
**Builder > Workflows**, click the step named below, and edit its **Configuration (JSON)**.

Full plain-English descriptions of what each workflow does are in
[Workflows — the workflows in detail](../user-guide/06-workflows.md#the-workflows-in-detail).

### Money thresholds

Each threshold is independent — changing one does not change the others.

| Workflow | Step | Key | Default |
| -------- | ---- | --- | ------- |
| Quote — High-Value Approval | Gate: Coverage 1,000,000 or More? | `value` | `1000000` |
| Application — Jumbo Limit Referral | Gate: Coverage 2,000,000 or More? | `value` | `2000000` |
| Claim — Intake Triage | Gate: Large-Loss Claim? | `value` | `250000` |
| Commission — Large Payout Approval | Gate: Amount 25,000 or More? | `value` | `25000` |

### Timings

| Workflow | Step | Default | Notes |
| -------- | ---- | ------- | ----- |
| Lead — First-Response SLA | Wait 60 Minutes for First Touch | 60 minutes | Set to the SLA you actually promise |
| Quote — Presented Follow-up | Wait 3 Days for a Decision | 3 days | |
| Underwriting — 48-Hour SLA | Wait 48 Hours | 48 hours | |
| Claim — Documentation SLA | Wait 3 Days for Documentation | 3 days | |
| Quote — Expiry Warning | Gate: Expiring Within 7 Days? | 7 days | `date_within_days` value |
| Policy — Renewal Outreach | Gate: Expiring Within 30 Days? | 30 days | 60–90 is common for longer sales cycles |
| Prospect — Cold Nurture Sweep | trigger config | weekly | `interval_minutes: 10080` |
| Client — Data Hygiene Sweep | trigger config | weekly | `interval_minutes: 10080` |

A `delay` step's wait is `{ "duration": N, "unit": "minutes" | "hours" | "days" }`.

### Who gets notified

Every notification and approval step names its recipient one of four ways:

| Config | Resolves to |
| ------ | ----------- |
| `"role": "manager"` | Everyone active in that role |
| `"field": "assigned_to"` | The record's owner |
| `"employee_id": "USR001"` | One named person |
| `"notify_actor": true` | Whoever triggered the workflow |

Roles used by the built-in workflows: `user` (agents), `manager`, `underwriter`,
`senior_underwriter`, `uw_manager`. If your role names differ, update these — a `role` that matches
nobody means the step notifies nobody, and it does so without error.

### Turning things off

Deactivate rather than delete — a deleted built-in workflow comes back on the next install, while a
deactivated one stays off and keeps its edits.

The two most commonly deactivated:

- **Quote — Auto-Expire Past Validity** — the only built-in workflow that changes records without
  being asked. On its first run it expires every already-overdue quote.
- **Policy — In-Force Onboarding Handoff**, step *Notify Sales Manager* — noisy on a high-volume book.

### A caution on editing

Two things will break a workflow quietly if changed carelessly:

- **Guard steps** in the three approval workflows. Removing one makes every approval also run its
  own rejection steps. See [Three shapes worth understanding](#three-shapes-worth-understanding).
- **The conversion latch** in *Lead — Qualification Handoff* (the "Not Already Converted" gate and
  the "Latch" action). They work as a pair; removing either produces a duplicate Prospect on every
  save of a qualified lead.

After any edit, use **Test Run** on a real record and read the step log before reactivating.

---

# Part 2 — Builder Guide

## Accessing the Workflow Builder

### Prerequisites

- Admin or super_admin role
- Module configuration permissions

### Navigation

1. Go to **Builder → Workflows** (or **Builder → Modules → [Module Name] → Workflows**)
2. Click **+ Create Workflow** or edit an existing workflow

---

## Creating Your First Workflow

### Example: Lead Assignment Workflow

**Goal**: Automatically assign new leads to sales reps based on territory.

**Steps:**

1. **Create New Workflow**
   - Name: "Lead Auto Assignment"
   - Trigger: "Record Created"
   - Module: "Leads"

2. **Add Condition Step**
   - Type: "Condition"
   - Name: "Check Territory"
   - Condition: `territory == "North"`

3. **Add Assignment Action**
   - Type: "Update Record"
   - Name: "Assign to Northern Rep"
   - Field: `assigned_to`
   - Value: employee ID of the northern rep

4. **Add Else Branch**
   - Type: "Update Record"
   - Name: "Assign to Default Rep"
   - Field: `assigned_to`
   - Value: default employee ID

---

## Step Configuration

### Condition Steps

**Basic Condition:**

```json
{ "field": "status", "operator": "eq", "value": "new" }
```

**Field Changed Context (old/new values):**

```json
{ "field": "_changed.lead_status.new", "operator": "eq", "value": "qualified" }
```

Or using `source`:

```json
{ "field": "lead_status", "source": "new", "operator": "eq", "value": "qualified" }
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

### Action Steps

**Update Record Fields:**

- Field: Select from dropdown
- Value: Static text, formula, or field reference
- Example: Set `priority = "High"` when `lead_score > 90`

> ⚠️ **A workflow `action` step only writes `field = value` (a single static value).** It does
> **not** do pool-based or round-robin assignment. Config keys like `pool` or `assignment_type`
> on an action step are ignored, and without a `value` the step does nothing. Round-robin /
> pool assignment is handled by the separate **Assignment Rules** engine (`pool_ids`), which
> runs automatically on record create. See
> [Assignment Rules](../user-guide/07-assignment-rules.md).

**Send Notification:**

- Template: Select pre-configured template
- Recipients: Field values or role-based
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

Patterns 1–3 are not covered by the built-in workflows and are worth building. Pattern 4 shows how
to extend one that already ships.

> The `field_changed` trigger used below is not currently selectable in the workflow dialog — see
> [What's New](#whats-new). Use `on_update` with a condition on the current value instead; it fires
> on every save and gates the same way.

### 1. Lead Scoring and Assignment

Route on score rather than rating. Ordered broadest-first, so the chain stops when the score is low.

```text
Trigger: on_update
→ Condition: { field: "score", operator: "gt", value: 80 }
→ Action:    { field: "rating", value: "hot" }
→ Action:    { field: "assigned_to", value: "MGR001" }
→ Notification: { role: "manager", title: "High-scoring lead",
                  message: "{{first_name}} {{last_name}} scored {{score}}." }
```

### 2. Territory-Based Routing

```text
Trigger: on_create
→ Condition: { field: "address_state", operator: "in", value: ["CA", "OR", "WA"] }
→ Action:    { field: "assigned_to", value: "USR001" }
→ Notification: { field: "assigned_to", title: "New record in your territory",
                  message: "{{first_name}} {{last_name}} — {{address_state}}." }
```

Build one workflow per territory. Each stops harmlessly when the state does not match.

### 3. Anniversary and Milestone Outreach

```text
Trigger: scheduled  { interval_minutes: 1440, per_record: true }
→ Condition: { field: "client_since", operator: "date_within_days", value: 14 }
→ Notification: { field: "assigned_to", title: "Client anniversary approaching",
                  message: "{{first_name}} {{last_name}} — client since {{client_since}}." }
```

`per_record` is essential here: without it the workflow runs once with no record and the condition
always fails.

### 4. Extending an Approval — Multi-Level Sign-off

*Application — Jumbo Limit Referral* sends every case above the limit to the chief underwriter. To
require a second sign-off above a higher limit, chain a second approval **inside the approved
branch**, each with its own guard:

```text
… Approval: { role: "uw_manager" }
   → Approved: Action: { field: "approval_status", value: "approved" }
               Condition: { field: "coverage_amount", operator: "gte", value: 5000000 }
               Approval: { role: "super_admin", title: "Board referral" }
                  → Approved: Action: { field: "status", value: "approved" }
                  → Rejected: Guard → Action: { field: "status", value: "declined" }
   → Rejected: Guard: { field: "approval_status", operator: "neq", value: "approved" }
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
- Check module permissions — workflow service requires record access
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
- The field is a column on the object's CRM table but the record has no CRM entity
  row yet (it was created without any field data). The engine refuses to write it
  elsewhere rather than create a duplicate value in a second store — save the
  record with its fields first

### Action Failing

- Verify field permissions — workflow cannot set a field the executing context lacks permission to edit
- Check required field validation rules
- Review integration credentials for webhook steps

### Performance Problems

- Identify bottleneck steps using execution timing in test runs
- Optimize condition ordering — most selective conditions first
- Consider breaking long workflows into smaller ones
- Avoid workflows that trigger other workflow-triggering updates (avoid cascades)

---

## Related Guides

- **Permissions**: [PERMISSIONS_AND_ROLES.md](PERMISSIONS_AND_ROLES.md)
- **System Configuration**: [SYSTEM_CONFIGURATION.md](SYSTEM_CONFIGURATION.md)
- **Workflow Engine Technical Reference**: [../developer-guide/WORKFLOW_ENGINE.md](../developer-guide/WORKFLOW_ENGINE.md)
- **Daily Operations**: [../user-guide/DAILY_OPERATIONS.md](../user-guide/DAILY_OPERATIONS.md)
