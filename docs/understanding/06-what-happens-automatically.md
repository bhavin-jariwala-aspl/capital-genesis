# Step 6 — What happens automatically

<!-- nav:top -->
> **[Docs roadmap](../README.md)** › **[Understanding Genesis](README.md)** › 6 of 8 · **For:** Everyone (Part B: engineers)
> ← [Step 5 — Who sees what](05-who-sees-what.md) · [Step 7 — Configure or code?](07-configure-or-code.md) →
<!-- /nav:top -->

> **Track:** both. Part A for everyone, Part B technical. **Time:** 20 minutes.
>

## Part A — A save is the start, not the end

When someone saves a record, the server answers immediately. Then, in the background, several "helpers" look at what
changed and react. Nobody waits for them, and if one fails the save still stands.

| Helper | What it does | Genesis Capital example |
|---|---|---|
| **Formulas & roll-ups** | Recalculate computed fields, here and on linked records | A client's total relationship value goes up when a loan is disbursed |
| **Assignment rules** | Pick an owner for a new record without one | A web enquiry goes to the next RM on the right desk, in turn |
| **Workflows** | "When X happens and Y is true, do Z" — update fields, create records, send emails, ask for approval, wait, call another system | Moving an enquiry to *Converted* creates the client, the relationship, the KYC case and, for loans, the application |
| **SLA timers** | Start a countdown, warn when it is close, escalate when it is missed | A complaint must get a first response within the agreed working hours |
| **Notifications & reminders** | Tell people what needs their attention | "Enquiry converted — Lina Chan" to the owner |
| **Audit** | Record who did what | Every stage move appears on the record's timeline |

Some helpers run on a **clock** instead of a save: overnight sweeps (for example, "flag clients whose KYC review is
due"), scheduled reports by email, due reminders, social-media publishing, and retries of calls to other systems that
failed.

The Genesis Capital pack ships **89 workflows**: 27 run when a record is created, 36 when a field or stage changes,
23 on a schedule and 3 on demand. The full catalogue: [AUTOMATION_REFERENCE](../administration/automation-reference.md).

---

## Part B — Technical detail

### The order of events on a save

```text
RecordService.createRecord / updateRecord
  ├─ before writing:  defaults → formulas → validation → auto-numbers        (synchronous; can reject)
  ├─ write envelope + values                                                  (Step 3)
  ├─ parent roll-ups (2 levels up) and child refresh (1 level down)           (awaited)
  └─ after answering (fire-and-forget):
       audit_logs row
       AssignmentService.assign      create only, when no owner was given
       emit record.created / record.updated / record.field_changed / record.deleted / record.derived_changed
            ├─ WorkflowEngine          on_create · on_update · on_delete · field_changed
            ├─ SlaService.reconcileRecord
            ├─ IntegrationService      outbound webhooks (listens to every event)
            └─ formula refresh of LATEST() readers
       lead scoring                  only for an object named lead_intake (none in Genesis Capital)
```

The event bus (`events.service.js`) is **in-process**: handlers run in the same server process that saved the
record. A stage change is emitted as `record.field_changed` on `pipeline_stage_id`; workflows match it with a
`field_changed` trigger plus a stage condition.

### Workflows

- Definitions are rows in `ui_workflows` / `ui_workflow_steps`. Genesis Capital's come from the vertical pack
  (`automation.js`, `automation-phase2.js`) and are written by the installer, which replaces a workflow by name when the
  pack's definition differs. They can also be edited in the Builder, but a re-install overwrites by name.
- Steps run in order or along true/false branches, with a 50-step loop guard. A failing step is logged and the run
  continues. Runs are not stored in a table.
- **Delays and approvals** persist in `workflow_pending_steps`: a delay resumes when `resume_after` passes; an approval
  waits for an approver's decision.
- A workflow's field write goes straight to the store (the same storage map as the API), then recomputes formulas. By
  design it emits no event, writes no audit row and runs no validation, so workflows cannot trigger each other in a
  loop. A stage write is the exception: it goes through the normal stage move, with gates and events.

### Assignment

Strategies `fixed`, `rule_based`, `round_robin` (turn kept in `round_robin_states`, locked per rule) and
`load_balanced` (fewest open records). Rules are tried in order with a fallback; inactive staff are skipped. Each
decision is logged in `assignment_logs`. It runs on create only.

### SLA timers

`sla_policies` say which records a timer applies to; `sla_targets` how long it may take; `sla_escalations` what to do
at warning or breach (notify owner, notify manager, raise priority, create task). `sla_instances` holds one live timer
per record and metric, counting only business hours (`sla_business_hours`). Timers update on every save and in a
60-second sweep. Details: [SLA_ENGINE](../developer-guide/engines/sla-engine.md).

### Background schedulers

All run inside the API process, registered in `src/app.js` via `utils/scheduler.js`. Each claims its own rows, so
several server instances can run safely.

| Scheduler | Every | Does |
|---|---|---|
| `workflow` | 60 s | Scheduled workflows; resumes due delays |
| `sla` | 60 s | Reconciles every open SLA timer |
| `reminder` | 60 s | Fires due reminders |
| `report-schedule` | 60 s | Sends scheduled reports |
| `social-publish` / `social-sync` | 60 s / 5 min | Publishes scheduled posts; pulls mentions and metrics |
| `job-queue` | 15 s | Retries failed integration calls (`job_queue`, back-off up to 1 h, 6 attempts) |
| `formula-refresh` | hourly check, daily work | Recomputes date-based formulas (TODAY, AGE…) |

### What is recorded where

| Table | Holds |
|---|---|
| `audit_logs` | Create, update, stage change, delete, restore, purge, bulk actions by a person — not system or workflow writes, and not which fields changed |
| `audit_chain_events` | Hash-chained log of sensitive actions: personal-data reveals, merges, permission and barrier changes, sensitive record views |
| `status_events` | One row per stage move — the record's status timeline |
| `assignment_logs`, `email_logs`, `integration_logs` | Each engine's own decisions and sends |
| `platform_audit_logs` | Platform-console actions |

### Things to know

- Demo records written by the installer, and changes from the daily formula refresh, emit no events, so they do not
  start workflows or SLA timers.
- Records imported into Genesis Capital objects go through the normal save path (validation, assignment, events), one
  row at a time.

### Known gaps

| Gap | Effect |
|---|---|
| A pack re-install replaces shipped workflows by name | An edit or switch-off made in the Builder to a pack workflow is undone by re-installing the pack |
| Workflow field writes are not audited and start no other workflow | By design (no loops), but the audit trail does not show automated edits |
| Lead scoring only knows the object `lead_intake` | Genesis Capital scores enquiries with formula fields instead |

## Go deeper

| If you are | Read next |
|---|---|
| Administrators | [Automation reference](../administration/automation-reference.md) — which tool to use · [Workflows](../builder-guide/12-workflows.md) · [Assignment rules](../builder-guide/11-assignment-rules.md) · [SLA engine](../builder-guide/14-sla-engine.md) |
| Engineers | [Workflow engine](../developer-guide/engines/workflow-engine.md) · [SLA engine](../developer-guide/engines/sla-engine.md) · [Social engine](../developer-guide/engines/social-engine.md) (scheduler registry) |

<!-- nav:bottom -->

---

### Where to next

| | |
|---|---|
| **Next** | [Step 7 — Configure or code?](07-configure-or-code.md) — Builder vs vertical pack vs platform code: who can make which change |
| **Previous** | [Step 5 — Who sees what](05-who-sees-what.md) |
| **Lost?** | [Docs roadmap](../README.md) · [Understanding Genesis](README.md) · [Understanding Genesis](README.md) |
<!-- /nav:bottom -->
