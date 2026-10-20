# Step 8 — Codebase tour

<!-- nav:top -->
> **[Docs roadmap](../README.md)** › **[Understanding Genesis](README.md)** › 8 of 8 · **For:** Engineers
> ← [Step 7 — Configure or code?](07-configure-or-code.md) · [Installation & setup](../getting-started/installation.md) *(Getting started)* →
<!-- /nav:top -->

> **Track:** engineers. **Time:** 30 minutes, with the code open.

## Run it first

```bash
make install && make dev          # or: docker compose up
cd backend && node prisma/seed.js # platform layer + Genesis Capital workspace + demo data
```

Sign in at `http://localhost:5173` as `GCRM1` (relationship manager) or `GCADMIN` (administrator) with
`GenesisDemo#2026`. Full setup: [INSTALLATION](../getting-started/installation.md).

## The layout

```text
backend/
  src/
    app.js              wires everything: plugins, Prisma + tenant scope, services, event bus, schedulers, routes
    middleware/         authenticate · tenant-scope · tenant-lifecycle · require-feature
    routes/<area>/      26 route groups, one index.js each (thin: parse, check, call a service)
    services/           92 files of business logic — start with the five below
    connectors/         outside-system adapters (social)
    utils/              errors, responses, scheduler, rate limit, TOTP, PDF
  prisma/
    schema.prisma       99 models
    migrations/         34 SQL migrations
    seed.js             builds the demo database
    verticals/genesis-capital/   the vertical pack (19 files)
  scripts/              install-vertical, purge-tenant, data-hygiene, encrypt-existing-fields …
  tests/                95 Jest test files

frontend/src/
  App.jsx               all routes
  pages/runtime/        workspace screens: ModulePage (list/board/detail), RecordFormPage, WizardPage, Reports …
  pages/builder/        22 Builder screens
  pages/platform/       platform console
  components/runtime/   FormRenderer, FieldRenderer, DashboardRenderer, RelatedPanel, ActivityTimeline …
  components/builder/   FormBuilder, WorkflowBuilder, FormulaEditor, ValidationEditor …
  services/             25 API clients (axios)
  store/                Zustand stores (auth, metadata, builder …)
  utils/invalidate.js   which screens to refresh after a save
frontend/tests/         49 Vitest files
```

## Five files to read first

| File | Why |
|---|---|
| `backend/src/services/crm-storage-map.js` | Where every field value is stored (Step 3) — short, and explains the rest |
| `backend/src/services/record.service.js` | Create, read, update, delete, stage moves, access filters, hydration — the centre of the system |
| `backend/src/middleware/tenant-scope.js` | How every query is kept inside one workspace |
| `backend/src/services/workflow.service.js` | The automation engine (Step 6) |
| `backend/prisma/verticals/genesis-capital/objects.js` | What a real object definition looks like |

## How to trace any feature

1. **Find the screen.** `frontend/src/App.jsx` maps the URL to a page.
2. **Find the call.** The page uses a function in `frontend/src/services/*.service.js`, which names the endpoint.
3. **Find the route.** `backend/src/routes/<area>/index.js` — note its `preHandler` (who may call it).
4. **Find the service.** The route calls a method in `backend/src/services/`.
5. **Find the data.** The service's Prisma calls name the tables; check [DATA_DICTIONARY](../developer-guide/data-dictionary.md).
   If they are `record`/`recordFieldValue`, the data is business records (Step 3).
6. **Find the configuration.** If behaviour differs per workspace, it comes from a `ui_*` row or a pack file.

Example — "where does the client's total relationship value come from?" In
`prisma/verticals/genesis-capital/objects.js`, `party.total_relationship_value` is a formula adding `loan_exposure_mur`,
`aum_mur`, `fund_holdings_mur` and `securities_value_mur`; each of those is a roll-up such as
`SUM_RELATED('loan_account', 'party', 'outstanding_mur')`. `record-compute.js` evaluates them and stores the results as
value rows; when a linked loan account is saved, `RecordService.#refreshParents` recomputes the client's roll-ups and
then the total.

## Testing

| | Backend | Frontend |
|---|---|---|
| Framework | Jest | Vitest |
| Run | `cd backend && npm test` | `cd frontend && npm test` |
| Notable | `genesis-capital-pack.test.js` and `metadata-consistency.test.js` check the pack and blueprint stay consistent | |

`make test` runs both. Conventions: [CONTRIBUTING](../developer-guide/contributing.md).

## Where to go deeper

| Topic | Document |
|---|---|
| Runtime loading pipeline, caching, patterns | [ARCHITECTURE_AND_SETUP](../developer-guide/architecture-and-setup.md) |
| Every table and column | [DATABASE_SCHEMA](../developer-guide/database-schema.md), [DATA_DICTIONARY](../developer-guide/data-dictionary.md) |
| Every endpoint | [API_REFERENCE](../developer-guide/api-reference.md) |
| Each engine | [WORKFLOW_ENGINE](../developer-guide/engines/workflow-engine.md), [SLA_ENGINE](../developer-guide/engines/sla-engine.md), [REPORTING](../developer-guide/engines/reporting.md), [DOCUMENT_MANAGEMENT](../developer-guide/engines/document-management.md), [SOCIAL_ENGINE](../developer-guide/engines/social-engine.md) |
| Security | [SECURITY](../developer-guide/security.md) |
| How the Genesis Capital workspace was built | [IMPLEMENTATION](../genesis-capital/implementation.md) |

## Go deeper

| If you are | Read next |
|---|---|
| Engineers | [Architecture & setup](../developer-guide/architecture-and-setup.md) · [Contributing](../developer-guide/contributing.md) · [Design system](../developer-guide/design-system.md) · [Engine references](../developer-guide/engines/README.md) |

<!-- nav:bottom -->

---

### Where to next

| | |
|---|---|
| **Next** | [Installation & setup](../getting-started/installation.md) *(Getting started)* — Install, configure, seed the Genesis Capital demo, sign in, local demo database, common issues |
| **Previous** | [Step 7 — Configure or code?](07-configure-or-code.md) |
| **Lost?** | [Docs roadmap](../README.md) · [Understanding Genesis](README.md) · [Understanding Genesis](README.md) |
<!-- /nav:bottom -->
