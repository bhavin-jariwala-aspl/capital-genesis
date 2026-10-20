# Build Effort & Platform Capabilities

<!-- nav:top -->
> **[Docs roadmap](../README.md)** › **[Project](README.md)** › 2 of 3 · **For:** Architects, decision-makers
> ← [Roadmap](roadmap.md) · [Changelog](changelog.md) →
> New to Genesis? Background: [Understanding Genesis › Configure or code?](../understanding/07-configure-or-code.md)
<!-- /nav:top -->

**A decision-maker's reference for "what can I build on Genesis CRM, and how much effort will it take?"**

This guide answers a recurring question: how much effort is needed to build a **CRM process flow
end-to-end** on the existing framework?

It also notes where **AI-assisted development (Claude Code)** moves the needle and where it does not.

> Effort figures are planning estimates, not commitments. They assume a developer/admin familiar with
> the platform conventions and exclude third-party gating (third-party API contracts, compliance sign-off,
> credential provisioning) unless stated.

---

## The foundation: what you start from

Two structural facts drive every estimate below.

### 1. The backend is truly metadata-driven

New business objects, fields, forms, pipelines, and workflows are created through **metadata APIs** — no
schema migration, no backend code, no restart. A single generic records API serves CRUD, search, audit,
status events, and permissions for **any** object.

- Generic runtime API: [`backend/src/routes/runtime/index.js`](../../backend/src/routes/runtime/index.js)
  (`/api/runtime/records`, `/:id/status-events`, `/:id/audit`, bulk ops, stage changes)
- Persistence: every record of every object is one `records` row plus one `record_field_values` row per
  filled field — so new objects need no new table. The `crm_*` tables are filled only for objects named
  lead, prospect, lead_intake, contact, account, opportunity or case; Genesis Capital has none of these, so
  they are empty there. See [03 — How data is stored](../understanding/03-how-data-is-stored.md).
- Multi-tenancy is enforced in the Prisma tenant-scope layer (`tenant_id` injected on every read/write).
- See [architecture-and-setup.md](../developer-guide/architecture-and-setup.md) and [`backend/prisma/schema.prisma`](../../backend/prisma/schema.prisma).

**Implication:** A new entity + its full process is configured, not coded.

### 2. ~80–90% of a CRM process is no-code configurable

The builders below cover the CRM surface. The WorkflowBuilder is notably powerful —
conditions, approvals, delays, webhooks, and cross-object create/update — backed by a real execution
engine with persisted pending steps and a scheduler.

| Builder | Configures (no code) | Maturity |
| ------- | -------------------- | -------- |
| Module & Objects | Objects, fields (30+ field types), constraints, layout | Production |
| Form | Drag-drop multi-column layouts, form types (create/edit/view/search/modal) | Production |
| Pipeline | Kanban stages, colors, enabled views | Production |
| Workflow | Triggers (create/update/delete/field changed — stage moves included/scheduled/manual), conditions (including formula `expression` gates), actions, notifications, delays, approvals, webhooks, create-record, update-related | Advanced |
| Wizard | Multi-step guided data entry | Production |
| Dashboard | Widgets, grid layout, role visibility, 19 chart types; widgets read a **saved report**, a built-in dataset, or a Builder object directly | Production |
| Report | Data source (fixed typed sources only: leads, accounts, opportunities, cases, tasks, activities, SLA — not Builder objects), visualization, groupings + value bands, measures + no-code calculations, AND/OR filters, totals, period-over-period, colour rules, folders, sharing, emailed schedules; **related fields up to 2 hops and fan-out-free child roll-ups** | Production |
| Permissions & Roles | Two-tier RBAC, 5-tier record scopes, org hierarchy | Production |
| Assignment | Fixed / round-robin / rule-based / load-balanced | Production |
| Email Templates | HTML templates with `{{variable}}` insertion | Production |
| Lead Scoring | Demographic/behavioral/engagement rules; scores only an object named `lead_intake` | Production |
| Integrations | Outbound webhooks (others scaffolded) | Production (webhook) |
| Social Media | Accounts, posts, campaigns, mentions, listening | Advanced |

Most builders are admin tools. **Reporting is deliberately not** — any authenticated user can
build, share, schedule and dashboard a report unaided, which is what removes the vendor from the
loop for the single most frequently-changing artefact in a CRM. See
[reporting.md](../developer-guide/engines/reporting.md).

Source: [`frontend/src/pages/builder/`](../../frontend/src/pages/builder/),
[workflow-engine.md](../developer-guide/engines/workflow-engine.md), [reporting.md](../developer-guide/engines/reporting.md).

---

## Effort to build one end-to-end CRM process flow

Reference flow: *Lead capture → qualify → convert → opportunity pipeline → won*, with auto-assignment,
an approval gate, notifications, and a dashboard. Nearly all of it is configuration:

| Step | Mechanism | Code? | Rough effort |
| ---- | --------- | ----- | ------------ |
| Define object + fields | ModuleBuilder | No | 2–4 hrs |
| Forms (create/edit/view) | FormBuilder | No | 2–4 hrs |
| Pipeline stages + Kanban | PipelineBuilder | No | ~1 hr |
| Automation (trigger, approval, notify, field updates) | WorkflowBuilder | No (JSON config) | 0.5–1.5 days |
| Auto-assignment rules | AssignmentBuilder | No | 1–2 hrs |
| Roles & record-scope permissions | Permissions/Roles | No | 2–4 hrs |
| Email templates | EmailTemplateBuilder | No | 1–3 hrs |
| Dashboard widgets | DashboardBuilder | No | 2–4 hrs |
| Seed/test data + walkthrough | seed script | Light | 0.5 day |

**Verdict: ~2–5 days of configuration, zero-to-minimal code.** With AI-assisted authoring of workflow
JSON, seed scripts, and any bespoke page, realistically **1–3 days**.

**What pushes it into real code** (focused 1–3 day engineering tasks each):

- Nested condition groups in the workflow builder (OR is possible today only inside a formula `expression` condition)
- Custom field types or custom dashboard widgets. Note that a **new dashboard *dataset*** is not one of these:
  append an entry to `DATASETS` in `analytics.service.js` and it shows up in the builder's picker with no route,
  migration or frontend change (~30 min).
- Custom validation logic beyond built-in constraints
- A new third-party integration connector

---

## Where AI-assisted development (Claude Code) helps

This codebase is unusually well-suited to agentic development: consistent patterns, clean service layers,
and thorough docs. Strong multiplier for:

- **Generating new pages/modules** by mirroring existing ones (e.g. a new table + detail view following
  `DataTable` / `StatusTracker` conventions).
- **Authoring metadata & seed scripts** (objects, fields, workflows, sample data) instead of hand-clicking
  builders.
- **Writing backend services, tests, and docs** following established conventions.
- **Wiring integrations** against the existing integration-connector interface.

**Not** a multiplier for what dominates the hard estimates: external API contracts/credentials,
regulatory domain decisions, and compliance sign-off — these are gated by third parties and SMEs, not by
coding speed.

---

## Known gaps & enhancement backlog

Tracked for prioritization; none block go-live on existing capability:

- Reporting: relation paths beyond 2 hops, two primary sources in one report (Salesforce's *joined
  reports*), filtering on a roll-up total (needs a `HAVING` pass), dashboard-wide cross-filtering,
  reporting on Builder objects (the report registry sees only the fixed typed sources), and >20K-row reports
  (aggregation would move into SQL) — see [reporting.md](../developer-guide/engines/reporting.md#benchmark)
- Social: live platform connectors (simulation only; contract and OAuth flow complete), post approval
  workflow, publishing calendar / best-time-to-post, AI drafting, `last_error` on posts and
  `platform_mention_id` (both need a migration) — see [social-engine.md](../developer-guide/engines/social-engine.md#known-gaps)

See [../project/roadmap.md](roadmap.md) for phased planning.

---

<!-- Last updated: August 17, 2026 -->

<!-- nav:bottom -->

---

### Where to next

| | |
|---|---|
| **Next** | [Changelog](changelog.md) — What changed in each release |
| **Previous** | [Roadmap](roadmap.md) |
| **Background** | [Understanding Genesis › Configure or code?](../understanding/07-configure-or-code.md) |
| **On these journeys** | [Decision-maker](../README.md#decision-maker) (step 7 of 8) |
| **Lost?** | [Docs roadmap](../README.md) · [Project](README.md) · [Understanding Genesis](../understanding/README.md) |
<!-- /nav:bottom -->
