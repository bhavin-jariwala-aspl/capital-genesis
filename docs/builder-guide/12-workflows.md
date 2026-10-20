# Workflows

<!-- nav:top -->
> **[Docs roadmap](../README.md)** › **[Builder guide](README.md)** › 12 of 20 · **For:** Administrators
> ← [Assignment rules](11-assignment-rules.md) · [Lead scoring rules](13-lead-scoring-rules.md) →
> New to Genesis? Background: [Understanding Genesis › What happens automatically](../understanding/06-what-happens-automatically.md)
<!-- /nav:top -->

> **Builder → Automate** · `/builder/workflow` · Build step-based automations that run when records change.

## What it is

A workflow is a sequential, step-based automation that runs automatically when a specific event happens to a
record — for example when a record is created, updated, or deleted. Each workflow starts with a trigger and then
runs a chain of steps (conditions, actions, notifications, approvals, and more) from top to bottom. Workflows let
you reduce manual work: update fields, notify people, ask for approval, call external systems, or create related
records, all without writing code.

## Where to find it

Sidebar → **Builder** → **Automate** → **Workflows**. Requires an **Admin** or **Super Admin** role.

## Before you begin

- You need at least one object to attach the workflow to. See
  [Modules & Objects](01-modules-and-objects.md).
- If a step needs to notify or assign people, those employees must already exist and be active.
- For approval and notification steps, know which employee, role, or record field holds the right recipient.

## Create a workflow: step by step

1. Click **New Workflow** in the top-right corner.
2. In the **New Workflow** dialog, fill in the fields:
   - **Name** — the internal name (required).
   - **Label (Display Name)** — a friendly name shown in lists; defaults to the Name if left blank.
   - **Trigger** — choose when the workflow fires (see the trigger table below).
   - **Object** — the object whose records the workflow watches. Required for the record triggers and for a
     scheduled workflow that runs once per record.
   - **Field** (*When a specific field changes* only) — the field to watch, or **Any field**. Tick **Also fire when
     a formula or roll-up recalculates this field** to react to computed values too.
   - **Run every** and **Unit** (*On a schedule* only) — how often it runs, in minutes, hours or days. Tick **Run
     once for every record of an object** to sweep the object's records, and optionally cap how many per run.
   - **Description** — an optional note about what the workflow does.
   - **Active — runs automatically** — on by default. Untick it to stop the workflow without deleting it.
3. Click **Save**. The new workflow opens automatically in the visual builder.
4. In the builder, click **Add Step**.
5. In the **Add Workflow Step** dialog, pick a **Step Type** from the dropdown or click one of the step-type cards
   (Trigger, Condition, Action, Notification, Delay, Approval, Webhook, Integration, Create Record, Update Related,
   Send Email, Email a List, Send SMS, Generate Document, Create Reminder).
6. Click **Add Step**. The step appears as a card on the canvas.
7. Click a step card to open the **Configure Step** panel on the right.
8. Set the **Step Label**, an optional **Description**, and the **Configuration (JSON)** for that step. The JSON
   holds the step-specific settings — see the per-step config notes below.
9. Click **Save Step**.
10. Repeat for each step you need. Steps run top-to-bottom in the order they were added.
11. A new workflow is **Active** as soon as it is created unless you untick **Active**. To switch a workflow off or
    on later, click its **Active / Inactive** badge in the **Status** column, or untick **Active** in the edit dialog.
    The server refuses a workflow that could never fire — a record trigger with no object, a schedule with no
    interval, or a per-record sweep with no object — and says why.

## Test a workflow

The Builder has no test-run button. An admin can run a workflow once through the API,
`POST /api/builder/workflows/:id/run` with an optional `{ "record_id": … }`, and get back an execution log of
which steps ran and what each step decided. A workflow with the **Manual** trigger can also be run from a record's
panel.

## Reference: trigger types

| Trigger Type | What it does | Notes |
| --- | --- | --- |
| On Record Create (`on_create`) | Runs when a new record is created in the object. | Fired from the record create flow. |
| On Record Update (`on_update`) | Runs when an existing record is updated. | Fired from the record update flow. |
| On Record Delete (`on_delete`) | Runs just before a record is deleted. | Use it to clean up or notify before removal. |
| Scheduled (`scheduled`) | Runs on a repeating timer. | Set **Run every** (stored as `trigger_config.interval_minutes`); a scheduler checks every 60 seconds. Tick **Run once for every record of an object** (`per_record`) to run it for **every record** of the object — needed for any sweep whose conditions read record fields. |
| Manual (`manual`) | Runs only when you trigger it by hand. | Good for test runs and one-off bulk actions. |

The `field_changed` trigger (*When a specific field changes*) fires only when the field you pick actually changes —
or on any change if you pick **Any field**. It can read old and new values of changed fields inside condition steps. A stage move is a `field_changed` trigger on the stage
(`pipeline_stage_id`).

## Reference: step types

| Step Type | What it does | Key Configuration (JSON) |
| --- | --- | --- |
| Trigger | Marks the start of the chain and validates the event. | Usually no config; passes through to the next step. |
| Condition | Branches true or false based on one field comparison. | `field`, `operator`, `value`. Continues on the true path if matched, else the false path. |
| Action | Writes a value to a field on the triggering record. | `field`, `value`. Updates the linked CRM record in the database. |
| Notification | Creates an in-app notification for chosen recipients. | `title`, `message`, plus a recipient key: `employee_id`, `field`, `role`, or `notify_actor`. |
| Delay | Pauses the workflow for a set time, then resumes. | `duration` (number) and `unit` (`minutes`, `hours`, or `days`). Resumed by the scheduler. |
| Approval | Halts and asks approvers to approve or reject. | `title`, `message`, plus a recipient key. Approved continues the true path; rejected continues the false path. |
| Webhook | Sends an HTTP request to an external URL. | `url`, optional `method` (default POST), `headers`, `body`. Blocks private/loopback URLs; 10-second timeout. |
| Integration | Calls a configured integration by name. | `integration`, optional `body`; `field_map` writes values from the response back onto the record. |
| Create Record | Creates a new record in any object. | `object_id`, `fields` (or `data`), optional `assigned_to`, `stage_id`. Values support `{{field}}` placeholders. |
| Update Related | Bulk-updates linked records in another object. | `object_id`, `link_field`, `field`, `value`. Matches records where `link_field` equals this record's id. |
| Send Email | Emails a template to the record. | `template`, optional `to_field` (default `email`) or `to`, and `language_field`: with `preferred_language = fr` the `<template>_fr` version is used when it exists. |
| Generate Document | Creates a document from a merge template and files it on the record. | `template` (the document template's name), optional `filename`. |
| Send SMS | Texts the record through an SMS integration. | `integration`, `message`, optional `message_fr`, `to_field` (default `mobile`), `language_field`, `suppress_field` (for example `do_not_contact`: skipped when true). |
| Email a List | Emails a template to everyone on a list held in another object — for example every subscriber of this publication's topic. | `template`, `list_object`, `link_field` (the list's field pointing at the person), `match` (list fields that must equal this record's values, e.g. `{ "topic": "{{publication_type}}" }`), `active` (e.g. `{ "status": "subscribed" }`), `language_field`, `suppress_field`, `track_field` (a number field on this record that counts opens). |
| Create Reminder | Sets a reminder relative to a date on the record. | `title`, `date_field`, optional `offset_days`, `employee_id` or `employee_field` (default `assigned_to`). Skips if the same reminder is already open. |

**Create Record** can also take `link_field` (a lookup field on the new record that points back to this one),
`store_as` (a field on this record that receives the new record's id) and `stage` (the starting stage by API
name). An **Action** on the field `stage` moves the record to the named stage, and the stage's entry rules
apply. An **Action** that sets `pipeline_stage_id` behaves the same way: it is a real stage move, with the entry
rules, the mirrored status field and the status timeline. An **Approval** with `exclude_actor: true` never asks the
person who triggered it (maker-checker).

Values written by **Action** and **Update Related** steps behave like a form save:

- Totals and counts on parent records (roll-ups) and formulas that depend on the changed value update straight
  away. A workflow that sets a status a parent total filters on is reflected on the parent.
- Fields set to be encrypted stay encrypted when a workflow writes them.
- Screens that are open refresh to show the workflow's result shortly after the save.

A workflow with the **Manual** trigger appears as a button on its object's record panel, so users can run it
on a record.

In a **Send Email** template, `{{upload_link}}` inserts a secure link (valid 14 days) where the client uploads the
documents the record's checklist still needs. **Email a List** sends each person one email even if they appear on
the list twice; open counts are approximate, because many mail apps block or pre-load images.

## Reference: condition operators

Condition steps and the comparison they perform:

| Operator | Meaning |
| --- | --- |
| `eq` / `==` | Equals (as text). |
| `neq` / `!=` | Not equals. |
| `in` | Value is in the given list. |
| `nin` | Value is not in the given list. |
| `gt`, `lt`, `gte`, `lte` | Numeric greater / less than (or equal). |
| `contains` | Text contains the value (case-insensitive). |
| `empty` | Field is empty or missing. |
| `notempty` | Field has a value. |
| `before_today`, `after_today`, `today` | Date comparisons against today's date. |
| `date_within_days` | Date falls within the next N days. |
| `date_overdue` | Date is in the past. |
| `expression` | A formula over the whole record is true, e.g. `amount_mur > 5000000 AND risk_rating = 'high'`. Leave **Field** empty. |

## What ships out of the box

The Genesis Capital pack installs **89 workflows**: 27 run on create, 36 on a field or stage change, 23 on a
schedule and 3 manually. They are defined as code in `backend/prisma/verticals/genesis-capital/automation.js` and
`automation-phase2.js`, and stored as ordinary workflow rows you can open and edit in the Builder.

Treat them as working templates. The thresholds, roles, and wait times are sensible defaults, not
rules — open any workflow in the Builder and adjust it to how your team actually operates.

| Module | Workflows | Examples |
| --- | --- | --- |
| Retail Lending | 14 | Loan — approval matrix · Loan — disbursement maker-checker |
| KYC & Compliance | 10 | KYC — risk-based approval (MLRO for high risk) |
| Loan Servicing | 8 | Loan accounts, collection actions, PLR change notices |
| Enquiries & Leads | 7 | Enquiry — acknowledgement (EN/FR) · Enquiry — convert to Party, relationship, KYC and application |
| Clients | 7 | Party records |
| Corporate Advisory · Forex Desk | 6 each | Conflict checks · FX deals and rate alerts |
| Wealth Management | 5 | Mandates and reviews |
| Collateral & Pledges · Cross-sell & RM Workbench | 4 each | Margin calls · next-best-action suggestions |
| Commercial Lending · Investment Funds · Trading Solutions · Service & Complaints · Marketing & Consent | 3 each | Facility — approval matrix · Fund order — maker-checker and TA hand-off · Campaign — Compliance sign-off |
| Introducers · Masters | 2 and 1 | Introducer referrals · FX rates |

> `backend/prisma/crm-workflows.js` holds a separate set of five generic workflows for objects named `lead`,
> `prospect` and `client`. They are installed only by `node scripts/seed-crm-workflows.js`, not by the seed, and do
> nothing in Genesis Capital, which has none of those objects.

## Building an approval workflow

Nine shipped workflows use **Approval** steps (for example **Loan — approval matrix** and
**Gifts — above-threshold approval**). If you add an **Approval** step to your own workflow there are two things
worth understanding.

**Record the outcome in a field.** Have each branch write its outcome to a status field (for example
an **Approval Status** select with Pending / Approved / Rejected) on the object. It does two jobs: it
shows the reviewer's decision on the record, and — when an early Condition step checks that the field
is empty — it stops the same record being sent for approval again every time somebody saves it.
Clearing it on a record is then the supported way to re-request approval.

**Add a Guard step.** Workflow steps run top to bottom, so an approval's "approved" path would
otherwise continue straight into its "rejected" steps. End the approved path with a **Guard**
condition that re-reads the approval status field and stops there.

Keep the Guard step pointing at the same field, and keep the rejection steps ordered after the
approved ones. Removing the Guard makes every approval also run its own rejection.

## Tips

- Steps run **top-to-bottom** in the order you add them. A **Condition** that fails stops the chain — every later
  step is skipped.
- Use `{{field}}` placeholders in notification titles, messages, webhook bodies, and create-record values to pull
  in live values from the triggering record. For example, `Hello {{first_name}}`.
- For **Notification** and **Approval** recipients you can target a fixed person (`employee_id`), a field that holds
  an employee id (`field`), everyone with a role (`role`), or the person who triggered the workflow
  (`notify_actor: true`).
- For **Scheduled** workflows, remember to set `interval_minutes` in the trigger config, otherwise the workflow
  never fires on its own.
- Webhooks only accept public `http`/`https` URLs. Internal addresses such as `localhost` or private IP ranges are
  blocked for security.
- New workflows are active as soon as they are created.

## Related guides

- [Modules & Objects](01-modules-and-objects.md)
- [Pipeline Builder](03-pipeline-builder.md)
- [Assignment Rules](11-assignment-rules.md)
- [Lead Scoring Rules](13-lead-scoring-rules.md)
- [Email Templates](15-email-templates.md)

## Troubleshooting

- **Workflow never runs** — Check that it is **Active**, that it is on the right **Object**, and that its trigger
  type matches the event you expect.
  Scheduled workflows also need `interval_minutes` in the trigger config.
- **A step is skipped** — A Condition step earlier in the chain probably evaluated false. Run the workflow through
  the API (see [Test a workflow](#test-a-workflow)) to read the execution log and see where the chain stopped.
- **Notification or approval reaches no one** — The recipient could not be resolved. Confirm the `employee_id`,
  `field`, or `role` in the step config points to an active employee.
- **Webhook step fails or is blocked** — The URL may be private or loopback (rejected for security), unreachable,
  or it returned a non-2xx status. Use a public URL and check the target server.
- **Action step does nothing** — Confirm the step has both a `field` and a `value`, and that the field's API name
  exists on the object (or, for `lookup.field`, on the linked record). The execution log says "no-op" when it
  cannot find the field.

<!-- nav:bottom -->

---

### Where to next

| | |
|---|---|
| **Next** | [Lead scoring rules](13-lead-scoring-rules.md) — Rule-based scores and grades — and which object they apply to |
| **Previous** | [Assignment rules](11-assignment-rules.md) |
| **Background** | [Understanding Genesis › What happens automatically](../understanding/06-what-happens-automatically.md) |
| **Related** | [Workflow automation](../administration/workflow-automation.md) · [Automation reference](../administration/automation-reference.md) |
| **Lost?** | [Docs roadmap](../README.md) · [Builder guide](README.md) · [Understanding Genesis](../understanding/README.md) |
<!-- /nav:bottom -->
