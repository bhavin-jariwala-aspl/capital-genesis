# Developer Guide

Technical reference for developers building on, extending, or deploying Genesis CRM.

## Guides in This Section

| Guide | Who It's For | What You'll Learn |
| ----- | ------------ | ----------------- |
| [ARCHITECTURE_AND_SETUP.md](ARCHITECTURE_AND_SETUP.md) | All Developers | Stack, project structure, backend/frontend patterns, database |
| [DATABASE_SCHEMA.md](DATABASE_SCHEMA.md) | All Developers | Every table, what it stores, columns/types, and relationships (from the Prisma SQL migrations) |
| [DATA_DICTIONARY.md](DATA_DICTIONARY.md) | All Developers | For every one of the 169 tables: **why it exists**, **when/how its rows are written**, and what each column represents (data lifecycle companion to DATABASE_SCHEMA.md) |
| [API_REFERENCE.md](API_REFERENCE.md) | All Developers | Every REST endpoint (497 across 20 route groups): its purpose/relevance and **when & how it is invoked** (frontend action, scheduler, or webhook) |
| [BUILD_EFFORT_AND_CAPABILITIES.md](BUILD_EFFORT_AND_CAPABILITIES.md) | Architects & Decision-makers | No-code envelope, build-effort estimates for CRM flows |
| [DESIGN_SYSTEM.md](DESIGN_SYSTEM.md) | Frontend Developers | The "widget" design language — tokens, shared components (`PageHeader`, `StatTile`, `EmptyState`, widget `DataTable`/`Card`), patterns, and a new-page checklist |
| [WORKFLOW_ENGINE.md](WORKFLOW_ENGINE.md) | Developers & Advanced Admins | Step types, operators, functions, workflow API |
| [SLA_ENGINE.md](SLA_ENGINE.md) | Developers & Advanced Admins | The reconcile loop, policy/target matching, instance lifecycle, business-hours math, escalation firing & manager resolution, extension recipes |
| [LEAD_SCORING.md](LEAD_SCORING.md) | Developers & Advanced Admins | Write-time rule-sum scoring: Lead vs Prospect targets, triggers, operator semantics, grading, how scores reach the UI, extension recipes |
| [CONFIGURABILITY.md](CONFIGURABILITY.md) | Developers & Architects | The configurability engine: tenant Appearance & Branding (CSS-variable theming, palette generation, light/dark precedence), the server-enforced validation engine and its browser mirror, field appearance config, per-form layout overrides, chart appearance |
| [SOCIAL_ENGINE.md](SOCIAL_ENGINE.md) | Developers & Advanced Admins | The social engine: scheduled publishing and account-sync jobs, post lifecycle, token refresh, mention ingest (keywords, dedupe, routing), replies and lead conversion, the scheduler registry behind every background loop, connector contract & OAuth, events, CRM benchmark |
| [CURRENCY.md](CURRENCY.md) | Developers & Advanced Admins | The dynamic currency manager: ISO 4217 registry, the three Localization settings, request-scoped resolution on the server, live switching in the UI, and a benchmark against the top 5 CRMs |
| [DASHBOARD_ANALYTICS.md](DASHBOARD_ANALYTICS.md) | Developers | How dashboard widgets read live data: the dataset catalog, `/api/analytics`, adding a dataset, chart-type row shapes |
| [REPORTING.md](REPORTING.md) | Developers & Architects | The self-service reporting engine: registry, filter trees, buckets, calculated measures, totals, comparison, drill-down, scheduling, report-backed dashboard widgets, CRM benchmark |
| [DOCUMENT_MANAGEMENT.md](DOCUMENT_MANAGEMENT.md) | Developers & Architects | Unified document storage, StorageProvider, API, CRM benchmark |
| [APPLICATION_SETTINGS.md](APPLICATION_SETTINGS.md) | Developers & Architects | Tenant-wide settings model, schema-driven config, API, CRM benchmark |
| [SECURITY.md](SECURITY.md) | Developers & Security Engineers | Auth, permissions, input validation, infrastructure security |
| [CONTRIBUTING.md](CONTRIBUTING.md) | Contributors | Code style, testing, PR process, architectural principles |

## Quick Navigation

**Setting up your development environment?**
[ARCHITECTURE_AND_SETUP.md](ARCHITECTURE_AND_SETUP.md) — covers environment setup, the full stack, project structure,
key patterns, and common troubleshooting.

**Building or integrating with workflows?**
[WORKFLOW_ENGINE.md](WORKFLOW_ENGINE.md) — complete step type reference, operators, functions, and the programmatic API.

**Extending or debugging SLA timers and escalations?**
[SLA_ENGINE.md](SLA_ENGINE.md) — how the 60 s reconcile loop derives timers, how a policy and target are matched, when escalations fire, and how `notify_manager` resolves a recipient.

**Working on lead scoring?**
[LEAD_SCORING.md](LEAD_SCORING.md) — when a score is calculated, how rules are evaluated and summed, the Lead/Prospect split, grade banding, and where scores surface in the UI.

**Working on social publishing, the inbox, or any background scheduler?**
[SOCIAL_ENGINE.md](SOCIAL_ENGINE.md) — how scheduled posts publish, how accounts sync on their own cadence, how mentions are routed and replied to, and how the `SchedulerRegistry` runs every automation loop.

**Understanding security implementation?**
[SECURITY.md](SECURITY.md) — JWT auth, RBAC, two-tier permissions, input validation, HMAC webhook verification.

**Looking up a table or a column?**
[DATA_DICTIONARY.md](DATA_DICTIONARY.md) — per-table purpose, write path, and column meaning for all
91 models; pair it with [DATABASE_SCHEMA.md](DATABASE_SCHEMA.md) for exact column types.

**Calling or integrating with the API?**
[API_REFERENCE.md](API_REFERENCE.md) — every endpoint with its purpose and the exact UI action,
scheduler, or webhook that invokes it.

**Adding a chart or KPI to a dashboard?**
[DASHBOARD_ANALYTICS.md](DASHBOARD_ANALYTICS.md) — widgets store a dataset key, not numbers.
[REPORTING.md](REPORTING.md) — a report is a declarative config over a curated registry; a
dashboard widget can point at a saved report, so a business user needs no developer.
Append an entry to `DATASETS` in `analytics.service.js` and it shows up in the builder's picker
with no route, migration or frontend change.

**Building a new page or UI?**
[DESIGN_SYSTEM.md](DESIGN_SYSTEM.md) — the widget design language: tokens, the shared
`PageHeader`/`StatTile`/`EmptyState` components, the widget-framed `DataTable`/`Card`, and a
new-page checklist so every screen stays consistent in light and dark.

**Want to contribute code?**
[CONTRIBUTING.md](CONTRIBUTING.md) — code conventions, testing requirements, PR process, and architectural principles.

## Key Technical Facts

- **Backend**: Fastify 5 + Prisma 5 + MySQL + Redis (optional)
- **Frontend**: React 18 + Vite + TailwindCSS + TanStack React Query v5 + Zustand
- **Auth**: JWT (configurable expiry, default 8h), bcrypt passwords (12 rounds)
- **All UI components use default exports** — `import Button from '...'` not `{ Button }`
- **React Query v5**: `useMutation` takes single options object, use `isPending` not `isLoading`
- **Workflow execution**: fire-and-forget, failures never block HTTP responses, MAX_STEPS=50 cycle guard
- **Prisma models** across CRM core, metadata, org, permissions, sales ops, integrations,
  and the platform control plane — see [DATA_DICTIONARY.md](DATA_DICTIONARY.md)
- **497 REST endpoints** across 20 route groups — see [API_REFERENCE.md](API_REFERENCE.md)
- **Dashboards read live data** — widgets store a dataset key, not numbers; see
  [DASHBOARD_ANALYTICS.md](DASHBOARD_ANALYTICS.md)

## Related Sections

- **Installation**: [../getting-started/INSTALLATION.md](../getting-started/INSTALLATION.md)
- **Admin Configuration**: [../admin-guide/README.md](../admin-guide/README.md)
- **All Guides**: [../INDEX.md](../INDEX.md)
