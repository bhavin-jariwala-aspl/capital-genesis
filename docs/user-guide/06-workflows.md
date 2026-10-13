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

## What ships out of the box

Genesis installs **18 workflows** covering the full CRM lifecycle. Each one implements an automation
pattern that Salesforce, HubSpot, Zoho CRM, Dynamics 365, and Pipedrive all provide out of the box,
adapted to the life-insurance object model.

Treat them as working templates. The thresholds, roles, and wait times are sensible defaults, not
rules — open any workflow in the Builder and adjust it to how your agency actually operates.

| Module | Workflows |
| --- | --- |
| Lead | Instant Routing · First-Response SLA · Qualification Handoff |
| Prospect | Cold Nurture Sweep |
| Quote | Presented Follow-up · High-Value Approval · Expiry Warning · Auto-Expire |
| Application | Submission Handoff · Jumbo Limit Referral |
| Underwriting | 48-Hour SLA Escalation |
| Policy | In-Force Onboarding · 30-Day Renewal Outreach · Lapse Prevention |
| Claim | Intake Triage · Documentation SLA Escalation |
| Commission | Large Payout Approval |
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

### Quote — Presented Follow-up Cadence

**Fires:** when a quote is saved — then completes three days later.

**The problem it solves.** A presented quote with no follow-up is the most common way a nearly-closed
deal goes quiet.

**What it does.**

1. Checks the quote's status is **Presented**. If not, stops.
2. **Waits 3 days.**
3. Re-reads the quote. If the client has accepted or declined in the meantime, stops — no reminder.
4. Otherwise reminds the quote's owner, quoting the client, product, and cover amount.

**What you may want to change.** The three-day wait, and whether the manager is copied on the
reminder.

### Quote — High-Value Approval

**Fires:** when a quote is saved.

**The problem it solves.** Large quotes carry pricing and risk exposure that should not go to a
client on one person's judgement — but a review step that relies on people remembering to ask is not
a control.

**What it does.**

1. Checks the quote is **Presented** and carries **1,000,000 or more** of cover. Below that
   threshold, nothing happens.
2. Checks the quote has not already been through approval, so re-saving does not restart the process.
3. Marks it **Pending Approval** and **pulls the quote back to Draft**, so it cannot reach the client
   while under review.
4. Sends the sales manager an approval request quoting the client, cover, product, and premium.
5. **If approved** — records the approval, returns the quote to Presented, and tells the owner it has
   been released.
6. **If rejected** — records the rejection and tells the owner to revise and resubmit. The quote stays
   at Draft.

**What you may want to change.** The 1,000,000 threshold and the approving role. If you change the
threshold, change it in this workflow only — the Application and Commission approvals have their own.

> This workflow contains a **Guard** step between the approved and rejected paths. It is what stops
> an approved quote also running the rejection steps. If you edit this workflow, leave the guard in
> place — see [About the approval workflows](#about-the-approval-workflows).

### Quote — Expiry Warning

**Fires:** daily, checking every quote.

**The problem it solves.** A quote that lapses without anyone noticing is a lost sale that never
appears in any report.

**What it does.**

1. Runs across every live quote each day.
2. Continues only for quotes still **Draft** or **Presented** — settled quotes are ignored.
3. Continues only if the validity date is **within the next 7 days**.
4. Warns the quote's owner, naming the client and the exact expiry date.

**What you may want to change.** The seven-day warning window.

### Quote — Auto-Expire Past Validity

**Fires:** daily, checking every quote.

**The problem it solves.** Open quotes that are past their validity date inflate the pipeline and
make forecasts meaningless.

**What it does.**

1. Runs across every live quote each day.
2. Continues only for quotes still **Draft** or **Presented**.
3. Continues only if the validity date has **already passed**.
4. Sets the status to **Expired**.
5. Tells the owner, so they can re-quote if the client is still interested.

**What you may want to change.** Whether it auto-expires at all. If you would rather review these by
hand, deactivate this workflow and rely on the Expiry Warning above.

> This is the one shipped workflow that changes existing records without anyone asking. On its first
> run it will expire every already-overdue quote in your system.

### Application — Submission Handoff to Underwriting

**Fires:** when an application record is created.

**The problem it solves.** Submission is a handoff between two teams working in different parts of
the system, and it needs to happen the same way every time.

**What it does.**

1. Sets the application status to **Submitted**.
2. Creates the matching **Underwriting Case**, numbered from the application (`UWC-` plus the
   application number) and carrying the applicant, product, and cover amount across.
3. Notifies the underwriting team that work is queued.
4. Confirms to the submitting agent that the application is in flight.

**What you may want to change.** The case-numbering pattern, and which fields carry across to the
underwriting case.

### Application — Jumbo Limit Referral & Approval

**Fires:** when an application is saved.

**The problem it solves.** Cover above the automatic limit needs a named senior decision, and that
decision needs to be recorded rather than agreed in a corridor.

**What it does.**

1. Checks the application is **Under Review** with **2,000,000 or more** of cover.
2. Checks it has not already been referred, so re-saving does not refer it twice.
3. Marks the referral in progress.
4. Sends the chief underwriter a referral request quoting the applicant, cover, product, and premium.
5. **If approved** — records it, advances the application to **Approved**, and tells the agent.
6. **If declined** — records it, sets the application to **Declined**, and tells the agent to discuss
   alternatives with the client.

**What you may want to change.** The 2,000,000 jumbo limit and the approving role. This workflow also
contains a Guard step — leave it in place.

### Underwriting — 48-Hour SLA Escalation

**Fires:** when an underwriting case is created, including cases opened automatically by the
application handoff above.

**The problem it solves.** Underwriting turnaround is what agents and clients actually feel, and a
case sitting untouched is invisible until someone complains.

**What it does.**

1. Sets the case status to **Pending**.
2. Notifies the underwriting team, stating the 48-hour SLA.
3. **Waits 48 hours.**
4. Re-reads the case. If it has moved off Pending, someone picked it up and the workflow stops.
5. If it is still Pending, escalates to the chief underwriter.
6. Flags the case as **Referred**, so it is visible as a problem rather than just old.

**What you may want to change.** The 48-hour SLA, and whether a breach should re-flag the status
(step 6) or only notify.

### Policy — In-Force Onboarding Handoff

**Fires:** when a policy record is created.

**The problem it solves.** The moment a policy goes in force, three separate things need to happen —
the client needs a welcome call, the agent needs paying, and the manager needs the number. Doing them
by hand means one gets forgotten.

**What it does.**

1. Checks the policy is **Active**. Policies created as Pending are ignored until they go in force.
2. Raises the welcome-call task for the servicing agent, quoting the policyholder, cover, product,
   and effective date.
3. Creates the **Commission** record, carrying the policy number, agent, annual premium, and product
   across, set to Pending.
4. Notifies the sales manager of the new in-force policy and its premium.

**What you may want to change.** Which fields populate the commission record, and whether the manager
notification is wanted at all on a high-volume book.

### Policy — 30-Day Renewal Outreach

**Fires:** daily, checking every policy.

**The problem it solves.** Renewal is the cheapest premium you will ever write, and it is lost by
silence more often than by competition.

**What it does.**

1. Runs across every live policy each day.
2. Continues only for **Active** policies.
3. Continues only if the expiry date is **within the next 30 days**.
4. Prompts the servicing agent to open the renewal conversation, quoting the policyholder, product,
   cover, and expiry date.
5. Alerts the sales manager, quoting the annual premium at risk, so renewals are visible as a
   pipeline rather than a series of individual tasks.

**What you may want to change.** The 30-day window. For products with a longer sales cycle, 60 or 90
days is more realistic.

### Policy — Lapse Prevention

**Fires:** daily, checking every policy.

**The problem it solves.** A missed payment is recoverable for a while and then it is not. The
window between those two states is where retention is won.

**What it does.**

1. Runs across every live policy each day.
2. Continues only for **Active** policies.
3. Continues only if the next payment date has **already passed**.
4. Alerts the servicing agent, naming the policyholder, the missed due date, and the payment method.
5. Alerts the sales manager, so at-risk policies are visible above the individual agent.

**What you may want to change.** Nothing structural. Consider whether the manager alert should fire
immediately or only after a grace period — for the latter, clone the workflow and gate the second
notification behind a longer delay.

### Claim — Intake Triage & Large-Loss Routing

**Fires:** when a claim record is created, from any intake channel.

**The problem it solves.** Claims are the moment a policy is judged. Triage needs to be immediate,
and large losses need different eyes.

**What it does.**

1. Sets the claim status to **Filed**.
2. Notifies the claims manager, quoting the claim number, type, claimant, policy, and amount.
3. Checks the amount. **Claims below 250,000 stop here** — filed, and the manager knows.
4. For **large-loss claims**, notifies a senior underwriter for review.
5. Moves the claim to **Under Investigation**.

**What you may want to change.** The 250,000 large-loss threshold, and the reviewing role. Note that
step 5 only runs for large-loss claims — if you want every claim moved to investigation
automatically, move that step above the condition in step 3.

### Claim — Documentation SLA Escalation

**Fires:** when a claim is created — then completes three days later.

**The problem it solves.** Most claims stall waiting for paperwork, and the delay is invisible
because nothing is technically wrong.

**What it does.**

1. Starts a documentation clock when the claim is filed.
2. **Waits 3 days.**
3. Checks whether documents have been received. If they have, stops — no chase, no escalation.
4. Prompts the adjuster to chase the claimant.
5. Escalates to the manager, so a stalled claim is visible without anyone having to report it.

**What you may want to change.** The three-day window, and whether the manager escalation should
happen at the same time as the chase or later.

### Commission — Large Payout Approval

**Fires:** when a commission record is saved.

**The problem it solves.** Commission is money leaving the business, and large payouts should have a
recorded approval rather than an assumed one.

**What it does.**

1. Checks the payout is still **Pending** and is **25,000 or more**.
2. Checks it has not already been reviewed.
3. Marks the approval in progress.
4. Sends the sales manager an approval request quoting the agent, amount, policy, product, and
   period.
5. **If approved** — records it, sets the commission to **Paid**, and tells the agent.
6. **If rejected** — records it and asks the manager to review the calculation. The commission stays
   Pending.

**What you may want to change.** The 25,000 threshold and the approving role. This workflow contains
a Guard step — leave it in place.

### Client — Data Hygiene Sweep

**Fires:** weekly, checking every client.

**The problem it solves.** Automation fails quietly on incomplete records. A client with no email
address is silently skipped by every renewal and servicing message you send, and nobody finds out.

**What it does.**

1. Runs across every live client record once a week.
2. Continues only for clients with **no email address**.
3. Raises a data-hygiene task for the servicing agent, explaining why it matters.

**What you may want to change.** This is the easiest workflow to extend — clone it and change the
field in step 2 to check for a missing phone number, date of birth, or beneficiary.

## About the approval workflows

Three workflows use an approval gate: **Quote — High-Value Approval**, **Application — Jumbo Limit
Referral**, and **Commission — Large Payout Approval**. They share two things worth understanding
before you edit them.

**The Approval Status field.** Each writes its outcome to an **Approval Status** field (Pending /
Approved / Rejected) on its object. The field is created for you. It does two jobs: it shows the
reviewer's decision on the record, and it stops the same record being sent for approval again every
time somebody saves it. Clearing it on a record is the supported way to re-request approval.

**The Guard step.** Workflow steps run top to bottom, so an approval's "approved" path would
otherwise continue straight into its "rejected" steps. Each approval workflow therefore ends its
approved path with a **Guard** condition that re-reads the Approval Status and stops there.

If you clone or edit one of these workflows: keep the Guard step, keep it pointing at the same field,
and keep the rejection steps ordered after the approved ones. Removing the Guard makes every
approval also run its own rejection.

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
