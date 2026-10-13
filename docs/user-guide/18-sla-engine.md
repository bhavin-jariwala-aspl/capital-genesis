# SLA Engine & Service Levels

> **Builder → Automate** · `/builder/sla` (configure) · **Tools → SLA Board** · `/sla` (monitor)
> Configure service-level agreements and watch them live on an information radiator.

## What it is

The SLA engine measures, enforces, and escalates the time-based commitments your team makes on **cases, leads, and
tasks**. You define **policies** (targets like "respond to a critical case within 1 hour", "resolve within 8 business
hours"); a background engine attaches a live timer to every matching record, computes a **business-hours-aware**
deadline, and — as timers approach or cross their deadline — flags them **at risk** or **breached** and runs your
configured **escalations**.

Everything is surfaced where people already work:

- A **live radiator** at the top of the home Dashboard shows every logged-in user their own on-time compliance,
  breached / at-risk / on-track counts, and the most urgent countdowns — all ticking in real time.
- A dedicated **SLA Board** (`/sla`) gives the full picture with My / Team / Everyone scopes.

> ⚙️ **First-time setup (admins):** the SLA tables ship in migration
> `20260703120000_add_sla_engine`. Run `npm run db:migrate` (or `prisma migrate deploy`) once.
>
> - **Fresh demo data?** `npm run db:seed` now creates **4 sample policies, a business-hours calendar, sample
>   support cases, and live timers** — the SLA board is populated the moment you log in.
> - **Existing database?** Open **Builder → SLA Engine** and click **Seed starter policies** to add a working set.

## Concepts

| Term | Meaning |
| --- | --- |
| **Policy** | A rule set for one record type (case / lead / task). The first active, matching policy wins. |
| **Metric** | What is being timed: **First response** or **Resolution**. |
| **Target** | The minutes allowed for a metric at a given priority (e.g. Critical = 60, High = 240). `Default` (`*`) applies when no priority-specific target exists. |
| **Warning %** | How far into the target counts as "at risk" (default 80%). |
| **Business hours** | A working-hours calendar (timezone + weekly hours + holidays). Clocks only tick inside it. Leave blank for 24/7. |
| **Escalation** | An automated action when a timer warns or breaches: notify owner, notify manager, raise priority, or create a follow-up task. |

### The priority dimension

Targets are keyed to each record type's natural priority field: **cases → priority** (low/medium/high/critical),
**leads → rating** (cold/warm/hot), **tasks → priority** (low/normal/high/urgent).

### How a timer completes

- **Case — First response**: met when the case leaves `new`. **Resolution**: met when `resolved` or `closed`.
- **Lead — First response**: met when the lead leaves `new` (contacted/qualified/etc.).
- **Task — Resolution**: met when `completed`; `cancelled` cancels the timer. If the task has a **due date**, that
  date is used as the deadline.

A timer is **met on time** if it completed before its deadline, **met late** otherwise. On-time compliance =
met-on-time ÷ all completed.

## Configure SLAs (admins)

**Builder → Automate → SLA Engine.**

### Policies tab

1. Click **New policy**.
2. **Name** it and choose what it **applies to** (Cases / Leads / Tasks / **Records of an object**).
   For **Records of an object**, pick the **Object** (it needs a pipeline), then map its stages:
   **First response is due while in**, **Resolved when it reaches** (at least one stage) and **Cancel the timers
   in**. A **Priority field (optional)** lets targets differ per value, such as per priority. Pause statuses are
   stage names.
3. Pick a **Business hours** calendar (or leave 24/7), a **priority order** (lower runs first when several policies
   could match), and toggle **Active**.
4. **Targets** — add a row per metric + priority. Set the minutes and the warning %.
5. **Escalations** — add actions for `warning` and/or `breach` triggers.
6. **Match conditions** (optional) — restrict the policy with field/operator/value rows (e.g. `type equals billing`).
   With no conditions the policy applies to every record of that type.
7. **Save.**

### Business hours tab

Create calendars with a **timezone label**, a **UTC offset in minutes** (e.g. `330` for IST +5:30), per-day working
hours, and **holidays** (comma-separated `YYYY-MM-DD`). Mark one as **default**. Offsets are fixed (no daylight-saving
shifts) for predictable, dependency-free math.

> The engine re-evaluates every 60 seconds. New policies and edits take effect on the next tick — no restart needed.

## Monitor SLAs — the radiator & board

### Dashboard radiator (everyone)

At the top of the home Dashboard, always visible:

- A **compliance gauge** (your on-time %).
- **Breached / At risk / On track** counters — click any to open the board.
- A live strip of your **most urgent countdowns**, colour-coded (red = breached, amber = at risk, green = on track).

If nothing is configured yet, admins see a one-click "Set up your SLA engine" nudge; everyone else sees nothing.

### SLA Board (`/sla`, Tools → SLA Board)

- **Scope** — *My SLAs* (everyone), *My team* (managers+), *Everyone* (admins+).
- **Compliance gauge** plus **Active / On track / At risk / Breached** cards.
- **Breakdowns** by priority, record type, and policy (stacked bars).
- **Live timers** table with per-record countdowns, progress meters, owner, and a filter for Open / At risk /
  Breached. Sorted so the most urgent work is on top.

Everything refreshes automatically and the countdowns tick every second.

## Escalations in detail

| Action | What it does |
| --- | --- |
| **Notify owner** | In-app notification to the record's owner/assignee. |
| **Notify manager** | Notifies the owner's manager (via the reporting hierarchy). |
| **Raise priority** | Bumps the case/task up one priority level (leads are left unchanged). |
| **Create follow-up task** | Creates a high-priority task for the owner to action the record. |

Warnings and breaches each fire their own set of escalations, in the order listed.

## Benchmark — how this compares

The design follows the SLA models proven by the major CRM/service platforms:

- **Salesforce** (Entitlements & Milestones): per-metric targets, business-hours calendars, milestone
  warning/violation actions → mirrored by targets + warning % + escalations.
- **Microsoft Dynamics 365 Customer Service** (standard/enhanced SLAs): applicable-when conditions, pause on hold,
  success/warning/failure timers → mirrored by match conditions, pause statuses, and warn/breach triggers.
- **Zoho Desk / Freshdesk**: priority-based response & resolution SLAs with escalation ladders → mirrored per record
  type and metric.
- **HubSpot Service Hub**: time-to-first-response and time-to-close on the dashboard → mirrored by the radiator and
  board, extended here to **leads and tasks**, not just cases.

## Tips

- Start with **Seed starter policies**, then tune the numbers to your team.
- Set a **business-hours calendar** — 24/7 timers breach overnight and at weekends.
- Add a **Notify manager on breach** escalation so misses never go unseen.
- Use **match conditions** for VIP or product-specific tiers (e.g. `account_id in 12,34 → tighter targets`) by giving
  that policy a lower order number so it wins.

## Related guides

- [Org Chart](17-org-chart.md) — the reporting hierarchy that "Notify manager" and *My team* scope rely on
- [Workflows](06-workflows.md) — event-driven automation alongside SLAs
- [Employees](15-employees.md) — owners and managers

## Troubleshooting

- **Radiator/board empty** — No policies yet (admins: seed or create one), or the migration hasn't been applied. Run
  `npm run db:migrate`.
- **Timers never appear** — Records must be **open** (cases not resolved/closed, leads not converted, tasks not
  completed) and must match an **active** policy with a target for their priority (or a `Default` target).
- **A breach didn't escalate** — Check the policy has a `breach` escalation for that metric, and that the owner (and
  their manager, for *Notify manager*) exist.
- **Deadlines look off** — Confirm the calendar's **UTC offset** and working hours. Remember offsets don't shift for
  daylight saving.
