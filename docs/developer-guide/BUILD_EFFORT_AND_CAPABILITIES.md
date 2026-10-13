# Build Effort & Platform Capabilities

**A decision-maker's reference for "what can I build on Genesis CRM, and how much effort will it take?"**

This guide answers two recurring questions:

1. How much effort is needed to build a **CRM process flow end-to-end** on the existing framework?
2. Can a **sophisticated Insurance CRM** be built on the existing framework — and if so, at what effort?

It also notes where **AI-assisted development (Claude Code)** moves the needle and where it does not.

> Effort figures are planning estimates, not commitments. They assume a developer/admin familiar with
> the platform conventions and exclude third-party gating (carrier API contracts, compliance sign-off,
> credential provisioning) unless stated.

---

## The foundation: what you start from

Three structural facts drive every estimate below.

### 1. The backend is truly metadata-driven

New business objects, fields, forms, pipelines, and workflows are created through **metadata APIs** — no
schema migration, no backend code, no restart. A single generic records API serves CRUD, search, audit,
status events, and permissions for **any** object.

- Generic runtime API: [`backend/src/routes/runtime/index.js`](../../backend/src/routes/runtime/index.js)
  (`/api/runtime/records`, `/:id/status-events`, `/:id/audit`, bulk ops, stage changes)
- Persistence: dedicated relational tables for core CRM entities (Lead, Contact, Account, Opportunity,
  Case) **plus** an EAV pattern (`RecordFieldValue`) for custom objects — so new objects need no new table.
- Multi-tenancy is enforced at the Prisma middleware layer (`tenant_id` injected on every read/write).
- See [ARCHITECTURE_AND_SETUP.md](ARCHITECTURE_AND_SETUP.md) and [`backend/prisma/schema.prisma`](../../backend/prisma/schema.prisma).

**Implication:** A new entity + its full process is configured, not coded.

### 2. ~80–90% of a CRM process is no-code configurable

Fourteen production-grade builders cover the CRM surface. The WorkflowBuilder is notably powerful —
conditions, approvals, delays, webhooks, and cross-object create/update — backed by a real execution
engine with persisted pending steps and a scheduler.

| Builder | Configures (no code) | Maturity |
| ------- | -------------------- | -------- |
| Module & Objects | Objects, fields (30+ field types), constraints, layout | Production |
| Form | Drag-drop multi-column layouts, form types (create/edit/view/search/modal) | Production |
| Pipeline | Kanban stages, colors, enabled views | Production |
| Workflow | Triggers (create/update/delete/scheduled/manual), conditions, actions, notifications, delays, approvals, webhooks, create-record, update-related | Advanced |
| Wizard | Multi-step guided data entry | Production |
| Dashboard | Widgets, grid layout, role visibility, 19 chart types; widgets read a **saved report** or a built-in dataset | Production |
| Report | Data source, visualization, groupings + value bands, measures + no-code calculations, AND/OR filters, totals, period-over-period, colour rules, folders, sharing, emailed schedules; **related fields up to 2 hops and fan-out-free child roll-ups** | Production |
| Permissions & Roles | Two-tier RBAC, 5-tier record scopes, org hierarchy | Production |
| Assignment | Fixed / round-robin / rule-based / load-balanced | Production |
| Email Templates | HTML templates with `{{variable}}` insertion | Production |
| Lead Scoring | Demographic/behavioral/engagement rules | Production |
| Integrations | Outbound webhooks (others scaffolded) | Production (webhook) |
| Social Media | Accounts, posts, campaigns, mentions, listening | Advanced |

Most builders are admin tools. **Reporting is deliberately not** — any authenticated user can
build, share, schedule and dashboard a report unaided, which is what removes the vendor from the
loop for the single most frequently-changing artefact in a CRM. See
[REPORTING.md](REPORTING.md).

Source: [`frontend/src/pages/builder/`](../../frontend/src/pages/builder/),
[WORKFLOW_ENGINE.md](WORKFLOW_ENGINE.md), [REPORTING.md](REPORTING.md).

### 3. The Insurance vertical already exists end-to-end

The platform ships a working Life-Insurance Agency Management System: **Lead → Quote → Application →
Underwriting → Policy → Claims → Commissions**, with real tables, atomic transactions, ~12k lines of
backend + frontend code, seed data, tests, and extensive docs.

- Domain service (~1.8k lines): [`backend/src/services/insurance-domain.service.js`](../../backend/src/services/insurance-domain.service.js)
- Routes (~1.3k lines): [`backend/src/routes/insurance/index.js`](../../backend/src/routes/insurance/index.js)
- Journey docs: [../user-guide/GENESIS_INSURE_JOURNEY.md](../user-guide/GENESIS_INSURE_JOURNEY.md),
  [../user-guide/UNDERWRITING_FLOW.md](../user-guide/UNDERWRITING_FLOW.md)

**Maturity: ~85% of a sophisticated life-insurance AMS is already built and production-grade.**

---

## Q1 — Effort to build one end-to-end CRM process flow

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

- OR / nested workflow conditions (builder uses AND + JSON config)
- Custom field types or custom dashboard widgets. Note that a **new dashboard *dataset*** is not one of these:
  append an entry to `DATASETS` in `analytics.service.js` and it shows up in the builder's picker with no route,
  migration or frontend change (~30 min).
- Custom validation logic beyond built-in constraints
- A new third-party integration connector

---

## Q2 — Effort for a sophisticated Insurance CRM

You inherit ~85% of it, so effort splits into three buckets.

### Bucket A — Configure & brand what exists

Tenant setup, products/carriers/rate tables, declaration & document categories, role hierarchy, branding,
seed data. Pure configuration.

**A life-insurance agency can be live on existing capability in ~2–4 weeks.**

### Bucket B — Close the known ~15% gaps (the real engineering)

These are genuine code projects. AI assistance accelerates each but does not remove third-party gating.

| Gap | Nature | Effort (AI-assisted) |
| --- | ------ | -------------------- |
| Real carrier API rating integrations | External APIs; adapter interface scaffolded | 1–3 weeks **per carrier** |
| Underwriting auto-decision rules engine | Backend logic + UI | 1–2 weeks |
| Renewal automation (quote → notify → track) | Workflow + scheduled jobs | ~1 week |
| Regulatory reporting (NAIC / state filings) | Exports, domain-heavy | 1–3 weeks |
| MIB / medical-records lookups | External integration + compliance | 2–4 weeks |
| Advanced commission holdback / clawback windows | Backend logic | ~1 week |

### Bucket C — Domain extension beyond life insurance

The schema carries `carrier_type` for life/health/P&C, but full P&C (ISO forms, ratable exposures,
line-of-business rating) or group/health is net-new modeling: **4–10+ weeks** depending on scope.

### Summary

| Goal | Effort | Code vs config |
| ---- | ------ | -------------- |
| One end-to-end CRM process flow | **1–5 days** | Mostly config |
| Insurance CRM live on current capability | **2–4 weeks** | Mostly config |
| "Sophisticated" insurance CRM (integrations + automation + compliance) | **2–4 months** (small team) | Config + targeted engineering |

The hard estimates are dominated by **external integrations and regulatory work**, not by core
CRM/insurance plumbing — which is already done.

---

## Where AI-assisted development (Claude Code) helps

This codebase is unusually well-suited to agentic development: consistent patterns, clean service layers,
and thorough docs. Strong multiplier for:

- **Generating new pages/modules** by mirroring existing ones (e.g. a new table + detail view following
  `DataTable` / `StatusTracker` conventions).
- **Authoring metadata & seed scripts** (objects, fields, workflows, sample data) instead of hand-clicking
  builders.
- **Writing Bucket-B backend services, tests, and docs** following established conventions.
- **Wiring integrations** against the existing rating-adapter interface.

**Not** a multiplier for what dominates the hard estimates: external carrier API contracts/credentials,
regulatory domain decisions, and compliance sign-off — these are gated by third parties and SMEs, not by
coding speed.

---

## Known gaps & enhancement backlog

Tracked for prioritization; none block go-live on existing capability:

- Real carrier API connectors (rating adapters simulated today)
- Underwriting auto-approval rules engine
- Renewal automation loop
- Premium-guarantee tracking, lapse-management automation, policy-replacement workflows
- MIB lookups, NAIC/state regulatory reporting
- Advanced endorsement premium recalculation
- Reporting: relation paths beyond 2 hops, two primary sources in one report (Salesforce's *joined
  reports*), filtering on a roll-up total (needs a `HAVING` pass), dashboard-wide cross-filtering,
  historical snapshots ("pipeline as it stood last month"), threshold alerts, and >20K-row reports
  (aggregation would move into SQL) — see [REPORTING.md](REPORTING.md#benchmark)
- Social: live platform connectors (simulation only; contract and OAuth flow complete), post approval
  workflow, publishing calendar / best-time-to-post, AI drafting, `last_error` on posts and
  `platform_mention_id` (both need a migration) — see [SOCIAL_ENGINE.md](SOCIAL_ENGINE.md#known-gaps)

See [../project/ROADMAP.md](../project/ROADMAP.md) for phased planning.

---

<!-- Last updated: August 17, 2026 -->
