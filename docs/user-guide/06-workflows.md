# Workflows

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
   - **Trigger Type** — choose when the workflow fires (see the trigger table below).
   - **Description** — an optional note about what the workflow does.
3. Click **Save**. The new workflow opens automatically in the visual builder.
4. In the builder, click **Add Step**.
5. In the **Add Workflow Step** dialog, pick a **Step Type** from the dropdown or click one of the step-type cards
   (Trigger, Condition, Action, Notification, Delay, Approval, Webhook, Create Record, Update Related).
6. Click **Add Step**. The step appears as a card on the canvas.
7. Click a step card to open the **Configure Step** panel on the right.
8. Set the **Step Label**, an optional **Description**, and the **Configuration (JSON)** for that step. The JSON
   holds the step-specific settings — see the per-step config notes below.
9. Click **Save Step**.
10. Repeat for each step you need. Steps run top-to-bottom in the order they were added.
11. To turn the workflow on, edit it from the list and make sure its status is **Active**. New workflows start
    inactive until activated.

## Test a workflow

Use the manual run option (the "Test Run" path, backed by `POST /builder/workflows/:id/run`) to execute the
workflow once and see an execution log of which steps ran and what each step decided. This is the safest way to
check your step chain before turning the workflow on for real records.

## Reference: trigger types

| Trigger Type | What it does | Notes |
| --- | --- | --- |
| On Record Create (`on_create`) | Runs when a new record is created in the object. | Fired from the record create flow. |
| On Record Update (`on_update`) | Runs when an existing record is updated. | Fired from the record update flow. |
| On Record Delete (`on_delete`) | Runs just before a record is deleted. | Use it to clean up or notify before removal. |
| Scheduled (`scheduled`) | Runs on a repeating timer. | Set `interval_minutes` in the trigger config; a scheduler checks every 60 seconds. Add `"per_record": true` to run the workflow once for **every record** of the object — needed for any sweep whose conditions read record fields. |
| Manual (`manual`) | Runs only when you trigger it by hand. | Good for test runs and one-off bulk actions. |

The `field_changed` trigger fires only when a field you name actually changes, and is selectable in the Builder alongside the others. It can read old and new
values of changed fields inside condition steps.

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
| Create Record | Creates a new record in any object. | `object_id`, `fields` (or `data`), optional `assigned_to`, `stage_id`. Values support `{{field}}` placeholders. |
| Update Related | Bulk-updates linked records in another object. | `object_id`, `link_field`, `field`, `value`. Matches records where `link_field` equals this record's id. |
| Send Email | Emails a template to the record. | `template`, optional `to_field` (default `email`) or `to`, and `language_field`: with `preferred_language = fr` the `<template>_fr` version is used when it exists. |
| Generate Document | Creates a document from a merge template and files it on the record. | `template` (the document template's name), optional `filename`. |
| Send SMS | Texts the record through an SMS integration. | `integration`, `message`, optional `message_fr`, `to_field` (default `mobile`), `language_field`, `suppress_field` (for example `do_not_contact`: skipped when true). |
| Email a List | Emails a template to everyone on a list held in another object — for example every subscriber of this publication's topic. | `template`, `list_object`, `link_field` (the list's field pointing at the person), `match` (list fields that must equal this record's values, e.g. `{ "topic": "{{publication_type}}" }`), `active` (e.g. `{ "status": "subscribed" }`), `language_field`, `suppress_field`, `track_field` (a number field on this record that counts opens). |

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

Genesis installs **5 workflows** covering the lead-to-client lifecycle. Each one implements an automation
pattern that Salesforce, HubSpot, Zoho CRM, Dynamics 365, and Pipedrive all provide out of the box,
adapted to the Genesis CRM object model.

Treat them as working templates. The thresholds, roles, and wait times are sensible defaults, not
rules — open any workflow in the Builder and adjust it to how your team actually operates.

| Module | Workflows |
| --- | --- |
| Lead | Instant Routing · First-Response SLA · Qualification Handoff |
| Prospect | Cold Nurture Sweep |
| Client | Data Hygiene Sweep |

## The workflows in detail

Each entry below explains what the workflow is for, exactly when it fires, what it does step by
step, and the settings you are most likely to want to change.

### Lead — Instant Routing & Priority Alert

**Fires:** the moment a lead record is created, from any source — web form, import, API, or manual
entry.

**The problem it solves.** Response time is the single strongest predictor of whether a lead
converts, and a lead that lands in a shared queue with no announcement gets worked late or not at
all. This workflow makes sure someone knows about every lead immediately, and that the best leads
get more than a queue entry.

**What it does.**

1. Sets the lead's status to **New**, so leads arriving from different sources all start in the
   same place.
2. Notifies the whole sales team that a lead is in the queue, quoting the name, company, and source.
3. Checks the lead's rating. **If it is Cold, the workflow stops here** — a cold lead gets the queue
   notification and nothing more.
4. For **Hot or Warm** leads only, escalates to the sales manager so they can confirm someone is
   acting on it inside the five-minute window.

**What you may want to change.** The rating values that count as high-intent (step 4's condition);
the role that receives the escalation; the message wording. If you route by source rather than
rating, change the condition's field from `rating` to `lead_source`.

### Lead — First-Response SLA & Re-routing

**Fires:** when a lead is created — then pauses and finishes an hour later.

**The problem it solves.** Notifying people is not the same as holding them accountable. This is the
enforcement half: it comes back an hour later and checks whether anyone actually touched the lead.

**What it does.**

1. Starts a clock the moment the lead lands.
2. **Waits 60 minutes.** The workflow is paused, not looping — it consumes nothing while waiting.
3. Re-reads the lead. If its status has moved off **New**, someone worked it and the workflow stops
   silently. No message is sent when the SLA is met.
4. If it is still New, alerts the sales manager that the first-response SLA has been breached.
5. Re-assigns the lead to the sales manager, so an unworked lead has a named owner rather than
   sitting in a queue nobody is watching.

**What you may want to change.** The 60-minute wait (step 2) is the main one — set it to match the
SLA you actually promise. You can also remove the re-assignment if you prefer alerting without
moving ownership.

### Lead — Qualification Handoff to Prospect

**Fires:** every time a lead is saved.

**The problem it solves.** Qualifying a lead is a marketing milestone; working a prospect is a sales
activity. The handoff between them is where leads get dropped, and doing it by hand means someone
has to remember to re-key the details.

**What it does.**

1. Checks whether the status is **Qualified**. If not, stops.
2. Checks the lead has not already been converted. **This is what makes the workflow safe** — without
   it, every subsequent save of a qualified lead would create another prospect.
3. Marks the lead as converted, closing the latch.
4. Creates a **Prospect** record carrying the name, contact details, company, job title, industry and
   source across, rated Hot, with a note recording where it came from.
5. Notifies the sales manager that there is a new prospect to assign for discovery.

**What you may want to change.** Which fields carry across (step 4) — add any field that exists on
both objects. Note that steps 2 and 3 work as a pair; removing either one will produce duplicate
prospects.

### Prospect — Cold Nurture Sweep

**Fires:** weekly, checking every prospect.

**The problem it solves.** Prospects rarely get formally rejected — they just stop being worked, and
the pipeline slowly fills with records nobody has touched in months.

**What it does.**

1. Runs across every live prospect record once a week.
2. Skips anyone already past early-stage — only **New** or **Contacted** prospects continue.
3. Skips anyone rated Hot or Warm — only **Cold** prospects continue.
4. Raises a re-engagement task for the prospect's owner, naming them and their current status.

**What you may want to change.** The frequency, and the definition of "going cold" in steps 2 and 3.
A weekly cadence is deliberately gentle; daily would be noisy for something this open-ended.

### Client — Data Hygiene Sweep

**Fires:** weekly, checking every client.

**The problem it solves.** Automation fails quietly on incomplete records. A client with no email
address is silently skipped by every follow-up and servicing message you send, and nobody finds out.

**What it does.**

1. Runs across every live client record once a week.
2. Continues only for clients with **no email address**.
3. Raises a data-hygiene task for the servicing agent, explaining why it matters.

**What you may want to change.** This is the easiest workflow to extend — clone it and change the
field in step 2 to check for a missing phone number or date of birth.

## Building an approval workflow

None of the shipped workflows uses an approval gate, but if you add an **Approval** step to your own
workflow there are two things worth understanding.

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
- New workflows are inactive by default. Activate them only after testing.

## Related guides

- [Modules & Objects](01-modules-and-objects.md)
- [Pipeline Builder](04-pipeline-builder.md)
- [Assignment Rules](07-assignment-rules.md)
- [Lead Scoring Rules](08-lead-scoring-rules.md)
- [Email Templates](11-email-templates.md)

## Troubleshooting

- **Workflow never runs** — Check that it is **Active** and that its trigger type matches the event you expect.
  Scheduled workflows also need `interval_minutes` in the trigger config.
- **A step is skipped** — A Condition step earlier in the chain probably evaluated false. Use a manual test run to
  read the execution log and see where the chain stopped.
- **Notification or approval reaches no one** — The recipient could not be resolved. Confirm the `employee_id`,
  `field`, or `role` in the step config points to an active employee.
- **Webhook step fails or is blocked** — The URL may be private or loopback (rejected for security), unreachable,
  or it returned a non-2xx status. Use a public URL and check the target server.
- **Action step does nothing** — The action only updates CRM records that have a linked entity. Confirm the step
  has both a `field` and a `value`, and that the object is a CRM object.
