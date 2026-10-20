# Genesis CRM — Product Roadmap

<!-- nav:top -->
> **[Docs roadmap](../README.md)** › **[Project](README.md)** › 1 of 3 · **For:** Everyone
> ← [Local LLM operations](../developer-guide/ai-reporting/local-llm-operations.md) *(AI reporting)* · [Build effort & capabilities](build-effort-and-capabilities.md) →
> New to Genesis? Background: [Understanding Genesis › Configure or code?](../understanding/07-configure-or-code.md)
<!-- /nav:top -->

> **Note (2026-10-13):** the insurance domain (quotes, applications, policies,
> underwriting, claims, commissions and their pages, APIs and tables) was removed
> from the product. Genesis is positioned as a CRM; ratings and inventories
> below are historical where they predate that change.

---

## Current Status (April 2026)

### Genesis CRM Rating: 8.8/10

Compared against industry-leading CRM platforms (Salesforce, HubSpot,
Microsoft Dynamics 365, Zoho CRM, Pipedrive):

- `8.8/10` against best CRM providers — **44 of 47 core modules
  covered (~94%)**
- `9.5/10` as a customizable internal CRM platform

> **Note (July 2026):** the ratings above are the product/positioning
> self-assessment. The section immediately below is an **independent,
> code-level review** of what the source actually implements, benchmarked
> against Salesforce, HubSpot, Microsoft Dynamics 365, Zoho CRM, and
> Pipedrive. It is deliberately more conservative and is the reference used
> for due-diligence and hardening planning.

---

## Independent Code-Level Assessment (July 2026)

An independent read of the actual backend + frontend source (not the docs),
benchmarked against the top 5 CRM providers (Salesforce, HubSpot, Microsoft
Dynamics 365, Zoho CRM, Pipedrive). Findings are grounded in the shipped code
(~59K LOC, 106 models, 37 services), not roadmap intent.

### Verdict (two lenses)

| Lens | Independent rating |
| ---- | ------------------ |
| **As a head-to-head commercial CRM competitor** | **~6.0 / 10** |
| **As a customizable low-code internal CRM platform** | **~8.0 / 10** |

The engine architecture (metadata → dynamic records → event-driven workflows →
RBAC scoping → reporting) genuinely mirrors the *core* of Salesforce/Zoho, and
the code shows real production hardening. It cannot match the top 5 on breadth,
ecosystem, AI, mobile, compliance, or scale. The self-rated 8.8 is generous for
the commercial framing but reasonable for the internal-platform framing.

### Scorecard by Capability Dimension

Scored 0–10 where 10 = parity with the best of the top 5.

| Dimension | Score | Verdict |
| --------- | :---: | ------- |
| Low-code / metadata platform | 8 | Real object/field/form/pipeline/dashboard/wizard builders with working drag-drop + verified persistence. Rivals the *core* of Zoho Creator / SF Object Manager. |
| Core data model & records | 7 | Sophisticated hybrid relational + typed-EAV storage, soft-delete/trash, concurrency-hardened. Metadata validations are enforced server-side on write (Sept 2026). **Gap: record reads do not check the object's `can_view`; a field's `can_view: false` hides it on screen only** (finding #16). |
| Workflow automation | 7 | Genuine event-driven engine: 10 step types, delays, human approvals, multi-pod atomic scheduling. Gap: linear only (no visual branching graph / formula language); step config is raw JSON. |
| Reporting & charts | 8.5 | **Self-service by design** — a non-technical user builds, shares, schedules and dashboards a report unaided (template gallery, stepped builder, AND/OR filters, value bands, no-code calculated measures, totals, period-over-period, drill-down, folders, emailed subscriptions, CSV/Excel/PDF). At parity with SF/HubSpot/Zoho/D365/Pipedrive on the self-service surface. Remaining gaps: **report sources are fixed typed tables (leads, accounts, opportunities, cases, tasks, activities, SLA), so Builder objects cannot be reported on** (finding #15); relation paths capped at 2 hops, one primary source per report, and in-JS aggregation caps it at ~20K rows — SMB scale, not warehouse. See [reporting.md](../developer-guide/engines/reporting.md). |
| Sales core (pipeline, forecasting, lead scoring) | 6.5 | Kanban with persisted drag-to-move, weighted forecast + quotas. Forecasting is basic (no scenario / commit-vs-best-case). |
| Integrations / API | 5 | Framework is excellent (SSRF-guarded delivery, HMAC, idempotency/replay defense). But no marketplace, no OAuth connectors, **every external connector is a stub**. Integration-call retries go through the database job queue (Oct 2026). |
| Communication (email / notifications) | 4.5 | Real SMTP send (nodemailer) + record-aware merge fields. But SMTP-only (no SendGrid/SES API), open tracking only on research distributions, no click tracking, no campaigns/drip, notifications are **in-app only**. |
| Marketing & social | 3.5 | Social engine is real (Sept 2026): server-side scheduled publishing with failure notifications, per-account sync cadence, token refresh, replies posted to the channel, rule-based inbox routing, keyword-driven priority, mention → lead, campaign roll-ups, `social.*` events. **Connectors are still simulation only** (contract + OAuth wired). No email marketing-campaign engine. |
| Search | 4 | Correct, permission-scoped global search — but SQL `LIKE %q%`, no ranking or fuzzy matching. (Exception: the DMS has a real MySQL **FULLTEXT** in-document search over `documents(original_filename, description, content_text)`; the gap is global CRM search, not documents.) |
| Security & compliance | 4.5 | Sound crypto (bcrypt, hashed single-use reset tokens, JWT) and a solid tenant-isolation design. Login rate limiting and security headers are in place (Sept 2026). But **no general API rate limit, request validation largely absent, raw-SQL paths bypass the tenant filter, object `can_view` not enforced on record reads, plan gates enforced server-side only on workflow and assignment-rule routes**. No SOC 2. |
| Scale / production-readiness | 4 | Single-process in-memory event bus. A database job queue (integration retries) and a GitHub Actions CI workflow exist. Fine for single-pod SMB; not multi-region SaaS. |
| AI / intelligence | 1 | Essentially none. All five benchmark CRMs ship AI copilots in 2026; Genesis has rule-based lead scoring and an optional plain-English "Ask" that turns a question into a report (configured model, e.g. self-hosted Ollama), but no AI layer. |
| Native mobile apps | 0–1 | None. Responsive web only. |

### Verified Strengths (code-reviewed)

These were confirmed as real, working implementations in the source — not
scaffolding:

- **Metadata engine** (`metadata.service.js`) — full builder-hierarchy CRUD,
  Redis-cached with precise invalidation, transaction-wrapped cascade deletes,
  and a `SAFE_FIELD_NAME` grammar on every field name. Field changes never run DDL.
- **Record engine** (`record.service.js`, ~1.4K LOC) — hybrid relational +
  typed-EAV storage with field aliasing, overflow capture, auto-number mutex,
  RBAC-scoped queries, soft-delete/trash/restore/purge, and domain-event
  emission.
- **Workflow engine** (`workflow.service.js`) — real event-bus consumer; 10
  executing step types incl. `delay` (persisted resume) and token-based
  `approval`; multi-pod atomic conditional UPDATEs; cycle guard.
- **Assignment engine** — fixed / rule-based / round-robin (**`SELECT … FOR
  UPDATE` cursor**) / load-balanced, with full audit trail.
- **Two-tier RBAC** (`permission.service.js`) — metadata permissions +
  operational scope (`none/own/team/hierarchy/all`) compiled into Prisma WHERE
  clauses against the hierarchy closure table.
- **Self-service reporting engine** — every control is server-enumerated, so the
  builder cannot produce a config the engine rejects: nested AND/OR filters with
  real-data value pick-lists, relative-date periods, cross-object fields up to two hops
  (`Owner ▸ Branch`), fan-out-free child roll-ups, named value bands, dropdown-assembled calculated measures (no
  formula parser, nothing `eval`d), truthful totals, period-over-period comparison,
  and drill-down to the underlying records. **Any saved report is also a dashboard
  widget**, which is what removes the developer from the loop. 26-report starter
  gallery, folders/favourites, role-and-team sharing that never widens data scope,
  and multi-pod-safe emailed subscriptions. Plus **19 themed, CVD-safe,
  light/dark chart types** across recharts + apexcharts.
- **Integration framework** — outbound HMAC-SHA256 signing, exponential-backoff
  retry, and an **unusually strong SSRF guard that validates the resolved IP at
  connect time** (closes the DNS-rebinding TOCTOU hole); inbound HMAC verify +
  Redis rate-limit + replay/idempotency defense.
- **SLA engine** (`sla.service.js`) — business-hours-aware calendar math,
  pause/resume with paused-time credit, warning/breach thresholds, and real
  escalations. Richer than the base SLA tiers of Zoho/HubSpot.
- **No-code builders** — Form, Dashboard, Pipeline/Kanban, and Wizard builders
  are real drag-and-drop with verified persistence back to the API; the
  builder → runtime loop is genuinely closed.
- **PDF generation** — `utils/html-to-pdf.js` renders documents to real PDFs via
  system Chrome headless (dependency-free by design), with graceful HTML
  fallback when Chrome is absent.

### Verified Gaps & Findings (code-reviewed)

Prioritised by rating impact. These complement the
[Pre-Production Readiness Gaps](#pre-production-readiness-gaps) and
[Missing Modules](#missing-modules-13-gaps--needed-for-90) tables below.

| # | Finding | Evidence | Priority |
| --- | ------- | -------- | -------- |
| 1 | ~~Server-side validation not enforced on write~~ — **Closed Sept 2026.** `RecordService` enforces `is_required`, field-type formats, admin rules (23 rule types incl. cross-field) and uniqueness before any write through `services/validation-engine.js`; the browser mirrors the same vocabulary. Custom JS remains browser-only by design. See [configurability.md](../developer-guide/engines/configurability.md#validation-engine). | `validation-engine.js`, `record.service.js` | Done |
| 2 | **No AI layer** — biggest 2026 gap vs. the top 5, which are all AI-first. Lead scoring is rule-based only. | No ML/AI services | P0 |
| 3 | **No live social connector ships** — every platform resolves to `SimulationConnector`. The engine around it is complete as of Sept 2026 (scheduled publishing, sync cadence, token refresh, OAuth callback, replies, routing, lead capture), so a live channel is now a per-platform HTTP implementation plus app review — see [social-engine.md](../developer-guide/engines/social-engine.md#connector-contract-and-oauth). | `connectors/social/index.js`, `simulation.js` | P1 |
| 4 | **Partly closed Sept 2026.** Login / forgot / reset are rate-limited per account and per IP (Redis-backed, in-memory fallback) and API security headers are set (`helmet`-equivalent). Still open: a general per-token API rate limit for authenticated routes. | `utils/rate-limit.js`, `app.js` | P2 |
| 5 | **Request-body validation largely absent** outside `auth`/`settings` — most routes pass `req.body` straight into services. | `routes/` | P1 |
| 6 | **Tenant context now reaches every authenticated handler** (Sept 2026 — `authenticate` installs it synchronously; before this every request ran unscoped). Still open: the extension is deny-by-omission for *unauthenticated* code paths (public share/sign routes scope manually), and raw-SQL paths bypass it. | `middleware/authenticate.js`, `tenant-scope.js` | P2 |
| 7 | **Partly closed Oct 2026.** Integration calls from workflows retry through the database `job_queue` (leases, back-off, dead-letter). Workflow `delay`/`approval` resume from `WorkflowPendingStep` rows polled every 60s. | `job-queue.service.js`, `workflow.service.js` | P2 |
| 8 | **Email is SMTP-only** — no transactional-provider API (SendGrid/SES), no open/click tracking, no campaigns/drip; notifications are **in-app only** (no email/push fan-out on escalation). | `email-send.service.js`, `notification.service.js` | P1 |
| 9 | **Search is SQL `LIKE %q%`** — no full-text index, ranking, or fuzzy/typo tolerance. | `search.service.js` | P2 |
| 10 | **Partly closed.** `.github/workflows/ci.yml` runs the backend and frontend tests, lint, build and a Docker build. Still open: test breadth is light on security/isolation adversarial cases; no deployment pipeline. | `.github/workflows/ci.yml` | P2 |
| 11 | ~~Chart-type wiring bug~~ — fixed Aug 2026; charts additionally gained per-widget appearance (palette, legend, number format, sort/top-N, goal line, axis titles) and tenant palettes in Sept 2026. | `ChartRenderer.jsx`, `utils/chart.js` | Done |
| 12 | ~~Derived data drifts across modules~~ — **Closed Oct 2026.** Roll-ups and formulas follow every write path (re-link, bulk/single delete, restore, merge/unmerge, workflow writes, single and bulk stage moves with the mirrored status field); Builder renames/deletes are refused while the field or object is in use (`GET /api/metadata/fields/:id/usages`); import runs through `RecordService`; trashed records stop SLA timers, reminders and list/report rows; one frontend invalidation helper. See [CHANGELOG](changelog.md). | `record.service.js`, `metadata-dependencies.js`, `utils/invalidate.js` | Done |
| 13 | **Legacy first-class CRM tables (lead/contact/account/opportunity/case) still bypass the record engine** — deliberately deferred; the Genesis Capital pack keeps all 91 objects in the generic field store and is unaffected. Open: `CrmService` create/update bypasses `RecordService`; `crm_*.owner_id` vs `records.assigned_to` drift (forecast, report scope and search read `owner_id`); lead conversion does not carry activities/tasks/documents or write record-level links; merge does not re-point `crm_*` foreign keys; `crm_cases.contact_name`/`contact_email` copies are not refreshed. | `crm.service.js`, `record.service.js` | P2 |
| 14 | **Lifecycle hand-overs** — deactivating an employee does not hand over their open records, tasks or reminders (manual bulk reassign); restoring a record from the Trash does not restart its canceled SLA timers. | `assignment.service.js`, `sla.service.js` | P2 |
| 15 | **The report builder cannot see Builder objects.** Report sources are fixed typed tables in `report-registry.js` (leads, accounts, opportunities, cases, tasks, activities, SLA). Objects stored in `records` / `record_field_values` — all 91 Genesis Capital objects — can be charted only through dashboard object widgets (`object-analytics.service.js`). The "Ask" feature has the same limit. | `report-registry.js`, `object-analytics.service.js` | P1 |
| 16 | **Object `can_view` is not enforced on record reads.** Record list and detail reads apply ownership, business-unit and barrier scope but do not check the role's object `can_view`; a field's `can_view: false` hides the field on screen only, and the API still returns it. | `record.service.js`, `permission.service.js` | P1 |
| 17 | **Plan gates are mostly client-side.** `requireFeature` is enforced on the server only for workflow and assignment-rule create/edit routes; every other plan feature is hidden in the UI (`FeatureGate`) but its API stays callable. | `middleware/require-feature.js`, `routes/builder/index.js` | P2 |
| 18 | **Portal identity and token.** A portal user is the first non-deleted party whose `email` (or introducer whose `portal_email`) matches; there is no portal account, so two parties sharing an email resolve to one, and changing the email moves access. The `gp1` token is stateless (HMAC, 8 hours) and cannot be revoked before it expires. | `portal.service.js` | P2 |
| 19 | ~~Builder and configuration defects found in the October audit~~ — **Closed Oct 2026.** The workflow dialog sets trigger settings (watched field, interval, per-record sweep) and has an on/off switch, and the server refuses a schedule that could never run; social-media tokens are stored encrypted and decrypted only for the connector; *Record Permissions* scopes are enforced for roles that have them; *By Role* push notifications reach the workspace's own roles. | `WorkflowBuilderPage.jsx`, `dashboard.service.js`, `social-media.service.js`, `record.service.js`, `routes/builder` | — |

### Fastest Ratings Movers

The highest-leverage work to close the gap toward the top 5, in order:

1. ~~Enforce metadata validations server-side on record write (finding #1).~~ Done Sept 2026.
2. Add app-level rate limiting + `helmet` + login lockout + request-body
   schemas (findings #4, #5).
3. Wire at least one real external connector with OAuth + secrets management
   (finding #3).
4. Introduce a durable job queue (e.g. BullMQ) for async workflow steps and
   webhook retries (finding #7).
5. Add a CI pipeline and cross-tenant leakage test suite (findings #6, #10).

---

## Project Scope Snapshot (July 2026)

A consolidated, current measure of the platform's footprint — useful for
scoping roadmap effort and positioning.

| Dimension | Measure |
| --------- | ------- |
| Database models (tables) | 106 (trimmed from 170, then +1 reminders — see July 2026 hardening) |
| HTTP endpoints | ~445 across 19 route groups |
| Backend services | 37 |
| Frontend pages / components | 53 / 57 |
| Application code | ~59,000 LOC (25.6K backend + 33.7K frontend) |
| Automated tests | 323 (289 backend + 34 frontend) |
| Database migrations | 16 |
| Documentation | 44 files (~15.9K lines) |

### Platform Capability Summary

Genesis is a multi-tenant, low-code CRM platform:

- **Metadata-driven builders** — modules, objects, fields, forms, pipelines, dashboards, wizards
- **CRM core** — leads → contacts → accounts → opportunities → cases
- **Automation** — workflow engine, assignment-rule engine, lead scoring
- **Engagement** — social media management (multi-platform), email + templates, notifications, reminders
- **Operations** — documents, forecasting, cross-object search, integrations (inbound/outbound)
- **SaaS platform tier** — tenants, feature flags, plans, security policies, audit logs

### Commercial Strengths (positioning)

- Multi-tenant SaaS architecture with row-level tenant isolation
- Low-code builder as an extensibility moat — customers self-serve new objects, forms, and workflows without code
- Strong automated-test coverage and unusually thorough documentation

### Pre-Production Readiness Gaps

The items most likely to surface in technical due diligence or a production
rollout. These complement the [Critical Gaps](#critical-gaps-for-80-rating)
list below.

| Area | Gap | Status |
| ---- | --- | ------ |
| External connectors | Meta / LinkedIn / X / WhatsApp and several integrations run in **simulation mode** — not wired to real provider APIs or secrets management | Open |
| Performance | Record list + CSV export are now bounded (safety cap + opt-in `limit`/`offset`); remaining N+1 hotspots (e.g. hierarchy tree/move) still to address | Partly addressed (Jul 2026) |
| Security & compliance | Closed SSRF (resolved-IP validation), DDL-injection (field-name grammar), and cross-tenant sequence scoping. SOC 2 / pen-testing still outstanding | Partly addressed (Jul 2026) |
| Tenant isolation | Shared-instance `_requestTenantId` fallback **removed** — isolation is now ALS-only; proven with a 100-concurrent-request no-leak test. Also fixes the platform-admin cross-tenant bypass | Done (Jul 2026) |
| CI/CD | GitHub Actions CI runs tests, lint and build; no deployment pipeline | Partly addressed |
| Async workflows | `delay` / `approval` resume from a 60s poll of `WorkflowPendingStep`; integration retries use the database job queue | Partly addressed (Oct 2026) |
| Auto-numbering | Record EAV auto-numbers use an in-process lock (safe single-instance); a DB sequence/`FOR UPDATE` is needed for multi-pod | Open |
| Observability | Central `LoggingService` not yet wired to an external monitoring sink | Open |
| Frontend hygiene | `react-hooks/exhaustive-deps` and dead imports cleaned — **0 lint warnings** | Done (Jul 2026) |

### Deferred Domains (schema removed July 2026 — to be built when prioritised)

These nine domains were previously scaffolded in the database only (no service,
route, seed data, or UI) and have been **removed from the active schema** so the
data model reflects what ships. Each is a genuine roadmap candidate and should be
(re)introduced together with its service layer, API, and UI when prioritised:

- **Email Marketing Campaigns** — bulk campaigns, lists, sends, click/unsubscribe tracking
- **Calendar & Meeting Management** — external calendar sync, rooms/bookings (interim: `Activity` timeline)
- **Contract & Deal Management** — contract lifecycle, templates, e-signature, milestones (note:
  document-level **native e-signature** and **merge templates** already ship in the DMS; this item is the
  contract-object lifecycle layer on top)
- **Territory Management & Sales Teams** — territory rules/assignment, team rollups (interim: `EmployeeHierarchy`)
- **Knowledge Base** — articles and self-help (the **client and introducer portal** shipped in October 2026: sign-in by
  one-time code, own records, requests, uploads, fund orders, messages)
- **Partner / Channel Management (PRM)** — partner lifecycle, deal registration, performance
- **Deal Stages** (interim: `UiPipeline` / `UiPipelineStage`) and the duplicate **Analytics/KPI**
  stack (superseded by the live `UiDashboard` engine)

---

## What Is Already Strong

- Metadata-driven object, field, form, dashboard, workflow, pipeline, and wizard architecture
- **Category-driven sidebar navigation** — modules grouped by `category`
  (crm, settings) with section headers rendered dynamically;
  no hardcoded navigation
- Runtime UI for record creation, editing, search, pipeline movement, activity tracking, and task management
- Role-aware record visibility and task/activity permissions (two-tier: metadata + operational scope)
- **Assignment engine** — fixed, round-robin (per-rule isolated), rule-based (14 condition operators), and
  load-balanced strategies; full assignment audit logs
- **Forecasting & quotas** — weighted pipeline forecast by stage, manager hierarchy rollup, per-rep quota management
- **CSV import pipeline** — drag-and-drop upload, metadata-driven field mapping, dedupe key checkbox grid, preview
  stats, skip/create/merge strategy
- **Integration framework** — connector registry; outbound webhooks with configurable timeout; inbound webhook
  reception with HMAC-SHA256 verification (`X-Signature-256`); execution retry; per-integration health stats
- **Typed EAV storage** — `record_field_values` table stores custom-object field values in typed columns
  (`str_value`, `num_value`, `bool_value`, `date_value`, `json_value`)
- **Cross-object global search** — all five CRM relational tables + custom objects searched in parallel
- **Permission management** — `ui_permissions` + `operational_permissions` tables; operational scope is enforced server-side, object `can_view` on record reads is not (finding #16)
- **Reusable UI component library** — `ObjectPicker`, `EmployeePicker`, `EmployeeMultiPicker`, hooks
- **Lead scoring product surface** — backend API routes (10 endpoints),
  builder rules page, runtime analytics/rankings page, sidebar navigation,
  **clickable score breakdown drill-down** showing matched rules with type,
  field, operator, points; per-lead inline recalculate
- **Event-driven integrations** — outbound webhooks subscribe to CRM domain
  events (`record.created/updated/deleted/field_changed`) and fire
  automatically; HMAC-SHA256 signed payloads, automatic retries with backoff,
  SSRF protection, and an inbound-webhook → workflow bridge (`event_map`)
- **Integration health dashboard** — cross-integration health overview,
  per-integration stats, execution history, retry failed runs
- **Kanban drag-and-drop automation** — pipeline stage changes via
  Kanban drag-and-drop auto-trigger lead conversion (Lead → Prospect →
  Client) with frontend navigation
- Working frontend build, 0 lint errors, 0 lint warnings
- Frontend Vitest test suite: 49 test files
- Backend Jest test suite: 95 test files

---

## Phase Completion Summary

| Phase | Status | Goal | Score Impact |
| ----- | ------ | ---- | ------------ |
| Phase 1 | Complete | Foundation & Metadata Engine | 3.0 → 4.5 |
| Phase 2 | Complete | Assignment and Routing | 4.5 → 5.5 |
| Phase 3 | Complete | RevOps and Data Quality | 5.5 → 6.0 |
| Phase 4 | Complete | Integrations, Governance, Credibility | 6.0 → 6.5 |
| Phase 5 | Complete | Essential CRM Features | 6.5 → 7.0 |
| Phase 6 | Complete | Specialized CRM | 7.0 → 8.0 |
| Phase 7 | Planned | Conversational & Revenue Completion | 7.5 → 8.5 |
| Phase 8 | Planned | Intelligence & Service Excellence | 8.5 → 9.0 |
| Phase 9 | Planned | Extended Platform | 9.0 → 9.5+ |

---

## Completed Phases

### Phase 1 — Foundation & Metadata Engine

- Workflow execution for core step types (`trigger`, `condition`, `action`, `notification`)
- Metadata safety: field normalisation, form builder payload validation
- 119 backend unit tests across 10 suites; 0 failures

### Phase 2 — Assignment and Routing

**Assignment Engine** (`backend/src/services/assignment.service.js`):

- `assign(objectId, recordId, recordData)` — evaluates rules in `order_index` ascending; applies first match
- Fixed assignment — always assigns to `assignee_id`
- Round-robin assignment — cycles through `pool_ids`, state persisted per-rule in `round_robin_states`
- Rule-based assignment — evaluates conditions array (14 supported operators) against record data
- Load-balanced assignment — assigns to pool member with fewest open records

**Schema additions:**

- `assignment_rules` — rule definition (type, conditions, pool_ids, assignee_id, fallback_id, order_index)
- `round_robin_states` — per-rule cursor (PK: `rule_id`)
- `assignment_logs` — immutable decision log

**API Endpoints:**

| Method | Path | Description |
| ------ | ---- | ----------- |
| `GET` | `/api/builder/assignment-rules` | List rules (filterable by `object_id`) |
| `GET` | `/api/builder/assignment-rules/:id` | Get a single rule |
| `POST` | `/api/builder/assignment-rules` | Create a new rule (admin only) |
| `PUT` | `/api/builder/assignment-rules/:id` | Update a rule (admin only) |
| `DELETE` | `/api/builder/assignment-rules/:id` | Delete a rule (admin only) |
| `PUT` | `/api/builder/assignment-rules/reorder` | Bulk reorder rules for an object (admin only) |
| `POST` | `/api/runtime/records/:id/assign` | Manually trigger assignment for a record |

> **Security note:** `POST /api/runtime/records/:id/assign` uses `RecordService.getRecord(id, user)` to fetch the
> record before triggering assignment. This enforces the same ownership / hierarchy access rules as all other record
> operations. Attempting to assign a record outside the caller's scope returns a `NotFoundError` (no information
> leakage about record existence).

### Phase 3 — RevOps and Data Quality

**Forecasting** (`backend/src/services/forecast.service.js`):

- `computeForecast(objectId, options)` — loads stage weights from `stage.config.forecast_weight`, returns
  `total_pipeline`, `weighted_forecast`, `by_stage`, `by_employee`
- `getTeamForecast(managerId, objectId, options)` — aggregates across all hierarchy descendants
- `setQuota / getQuotas / deleteQuota` — quota CRUD
- API: `GET /api/runtime/forecast`, `GET /api/runtime/forecast/team`

**CSV Import** (`backend/src/services/import.service.js`):

- `parseCsv(buffer)` — pure Node.js CSV parser (no third-party deps), handles quoted fields + CRLF
- `mapFields(rows, headers, mapping)` — maps CSV columns to target field names
- `validate(rows, objectId)` — strips empty rows; returns `{ valid, errors }`
- `detectDuplicates(rows, dedupeKeys, objectId)` — case-insensitive key matching against existing records
- Three duplicate strategies: `skip`, `create`, `merge` (safe field-level merge)
- API: `GET/POST /api/runtime/import/jobs`, `/preview`, `/execute`

**Schema additions:**

- `quotas` — employee × object × period_type × period_key → `target_value`
- `import_jobs` — lifecycle state, field_mapping, dedupe_keys, strategy, stats

### Phase 4 — Integrations, Governance, and Credibility

**Integration framework** (`backend/src/services/integration.service.js`):

- `OutboundWebhookConnector.execute(config, payload)` — HTTP/HTTPS with configurable `timeout_ms` (default 10,000ms)
- `InboundWebhookConnector.verifySignature(rawBody, secret, signature)` — HMAC-SHA256 with `crypto.timingSafeEqual`
- `executeIntegration(id, payload)` — executes, logs, updates `last_run_at` atomically in one `$transaction`
- `receiveInbound(name, payload, {rawBody, signature})` — verifies HMAC, logs event
- `retryIntegration(logId)` — re-runs original payload from a failed log entry
- `getIntegrationStats(integrationId)` — single-pass accumulation over last 200 logs

**API:**

- `GET/POST/PUT/DELETE /api/builder/integrations`, `/:id/toggle`, `/:id/test`, `/:id/logs`
- `GET /api/builder/integrations/:id/stats`
- `POST /api/builder/integrations/logs/:logId/retry`
- `POST /api/integrations/inbound/:name` (public, no JWT)

**Typed EAV Storage** (`backend/src/services/record.service.js`):

- `record_field_values` table with typed columns: `num_value FLOAT`, `bool_value BOOLEAN`, `date_value DATETIME`,
  `json_value JSON` alongside `str_value TEXT`
- All field upserts run in a single `$transaction`
- Reads back most-specific non-null column (json > date > bool > num > str)

**Cross-Object Search** (`backend/src/services/search.service.js`):

- 6-way parallel fan-out: 5 CRM relational tables + `#searchCustomObjects`
- Custom objects opt-in via `UiField.is_searchable=true`
- Owner filtering applied uniformly across all object types

### Phase 5 — Essential CRM Features

Added 7 new database models:

- `Product`, `EmailTemplate`, `EmailLog`, `Document`,
  `LeadScoringRule`, `LeadScore`

Added 6 comprehensive service classes:

- ProductService, EmailTemplateService, EmailSendService,
  DocumentService, LeadScoringService

Lead scoring fully aligned with Prisma schema (`field_value`,
`job_title`, `tenant_id`, actual CrmLead fields). Formal
`LeadScore → CrmLead` relation added (was missing FK). 20
dedicated tests covering rule CRUD, scoring, operator evaluation,
include-based hydration, and analytics.

Productized features (v2.4.0):

- Lead scoring: backend routes (10 endpoints), builder rules page,
  runtime analytics page
- Integration health dashboard with retry capability
- Custom-object search fixed (`field_name` not `field_id`) + 11
  SearchService tests

---

## Enterprise Feature Implementation (ROADMAP.md — March 2026)

Eight enterprise feature sets were planned. Only three are built:

1. **Email Marketing & Campaign Management** — not built (see [Deferred Domains](#deferred-domains-schema-removed-july-2026--to-be-built-when-prioritised))
2. **Calendar Integration & Meeting Management** — not built; each user has a read-only calendar feed link
3. **Advanced Analytics & Custom Reporting** — built: self-service report builder (fixed typed sources only, finding #15), report-backed dashboards, automated emailed delivery
4. **Contract & Deal Management** — not built; document e-signature ships in the DMS
5. **Territory Management & Sales Teams** — not built; quotas ship with forecasting
6. **Customer Self-Service** — partly built: the client and introducer portal (October 2026); no knowledge base
7. **Social Media Integration** — built: multi-platform management, listening, mention → lead (connectors simulated)
8. **Partner/Channel Management** — not built

The tables scaffolded for the unbuilt sets were removed in July 2026.

---

## Phase 6 — Specialized CRM (Complete)

### Objective

Transform Genesis from "platform that can do CRM" to "purpose-built
CRM" while preserving metadata flexibility.

### Key Deliverables

1. **Email Integration & Automation** (Implemented)
   - SMTP integration via nodemailer with preview mode
   - Email compose from any record via Activity Timeline
   - Templates scoped to Module > Object in Builder
   - Server-side variable resolution from CRM record data
   - Email log tracking (sent, delivered, opened, clicked, bounced)

2. **Field Change Automation** (Implemented)
   - `field_changed` workflow trigger type
   - Auto audit logging with old/new values on all CRM entity updates
   - Auto activity logging for status field changes
   - Lead Status Change workflow (notify rep + manager)

3. **Social Media Integration — Runtime + Builder Split** (Implemented)
   - Runtime page at `/social-media` for all users (Feed, Posts, Campaigns, Mentions, Accounts)
   - Admin control panel at `/builder/social-media` with full CRUD (accounts, tokens, keywords)
   - Three-tier API permissions: read (user), create/edit posts and campaigns (manager+), admin config (admin+)
   - Corporate-level account connection (one per platform per tenant) — employees share via RBAC
   - WhatsApp Business: single number per tenant, messages routed via assignment rules
   - OAuth token storage with refresh support
   - Social listening keyword management (brand, competitor, industry, product, hashtag)
   - Campaign management with budget tracking, platform targeting, and status lifecycle
   - Mention monitoring with sentiment tracking and response management

4. **Calendar & Meeting Management** (Not built)
   - Built: a per-user read-only calendar feed link (`calendar-feed.service.js`) and meetings as Activity Timeline entries
   - Not built: two-way calendar sync, availability checking, video meeting links

5. **Specialized CRM UI Components** (Partially Implemented)
   - Lead management interface with scoring visualization — **done**: score
     breakdown drill-down with rule-by-rule detail, per-lead recalculate
   - Product catalog with search and filtering
   - Pipeline view with forecasting dashboard

6. **Web-to-Lead Forms** (Implemented October 2026)
   - Any Builder form publishes as a web form (`/f/<key>`) that creates records of its object
   - Routing through the assignment engine
   - UTM and source capture

---

## Industry Module Coverage (vs. Salesforce, HubSpot, Zoho, Dynamics 365, Freshsales)

### Covered Modules (33/47 — ~70%)

| # | Module | Evidence |
| --- | --- | --- |
| 1 | Contact Management | `CrmContact`, `CrmAccount`, `CrmAssociation` |
| 2 | Lead Management | `CrmLead`, `CrmLeadConversion`, `LeadScoringRule`, `LeadScore` |
| 3 | Opportunity / Deal Management | `CrmOpportunity`, pipelines (`UiPipeline`, `UiPipelineStage`) |
| 4 | Pipeline Management | `UiPipeline`, `UiPipelineStage`, `PipelineBuilderPage` |
| 5 | Account Management | `CrmAccount` with owner relations |
| 6 | Task & Activity Tracking | `Task`, `Activity`, `ActivityTimeline` |
| 7 | Email Integration | `EmailTemplate`, `EmailLog`, `EmailComposeModal`, `email-send.service` |
| 8 | Email Campaigns / Marketing | **Not built** — models removed July 2026 (see Deferred Domains) |
| 9 | Product Catalog | `Product`, `ProductsPage` |
| 10 | Sales Forecasting | `Quota`, `ForecastPage`, `forecast.service` |
| 11 | Dashboards & Analytics | `UiDashboard`, `UiChart`, `UiDashboardWidget`, `CustomReport` (report-backed widgets), `analytics.service` dataset catalogue. The `KpiDefinition` / `KpiValue` / `AnalyticDashboard` stack was pruned before use — KPI figures are reports with the `kpi` visualization. See [dashboard-analytics.md](../developer-guide/engines/dashboard-analytics.md) |
| 12 | Workflow Automation | `UiWorkflow`, `UiWorkflowStep`, `WorkflowPendingStep` (conditions, delays, approvals, webhooks) |
| 13 | Reports (self-service) | `CustomReport`, `ReportExecution`, `ReportFolder`, `ReportSubscription`, `ReportFavorite`; `report-registry`, `report.service`, `report-templates` (26 starters), `report-library.service`, `report-schedule.service`; `ReportsPage`, `ReportBuilderPage`, `components/reports/*`. Template gallery, stepped builder, AND/OR filter trees, value bands, no-code calculated measures, totals/subtotals, period-over-period, conditional formatting, drill-down, folders/favourites, visibility (private/team/roles/everyone) with role-clamped data scope, emailed subscriptions, CSV/Excel/PDF. **Any saved report is a dashboard widget.** See [reporting.md](../developer-guide/engines/reporting.md) |
| 14 | Document Management System (DMS) | Standalone module — `Document`, `DocumentFolder`, `DocumentShareLink`, `DocumentViewEvent`, `DocumentTemplate`, `DocumentSignatureRequest`, `DocumentSignatory`, `UiDocumentCategory`, `UiDocumentChecklist`; `DocumentsPage`, `DocumentBuilderPage`, `SharedDocumentPage`, `SignDocumentPage`, `DocumentPanel`. Pluggable storage (local/S3/Azure/GCS), dedup+versioning, folders, in-document full-text search, builder (categories/checklists), merge templates, tracked public sharing + analytics, **native e-signature** with certificate. See [document-management.md](../developer-guide/engines/document-management.md) |
| 15 | Role-Based Access Control | `Role`, `UiPermission`, `OperationalPermission`, `PermissionsBuilderPage` |
| 16 | Case / Ticket Management | `CrmCase`, SLA engine (`SlaPolicy`, `SlaInstance`, `SlaEscalation`) |
| 17 | Knowledge Base | **Not built** — models removed July 2026 |
| 18 | Customer Self-Service Portal | Client and introducer portal (`portal.service.js`, `routes/portal`): one-time email code, own records, requests, uploads, messages; no portal tables (finding #18) |
| 19 | Territory Management | **Not built** — models removed July 2026 |
| 20 | Sales Team Management | **Not built** — models removed July 2026 (interim: `EmployeeHierarchy`) |
| 21 | Calendar & Meeting Management | **Not built** — models removed July 2026 (per-user calendar feed link only) |
| 22 | Contract Management | **Not built** — models removed July 2026 (document e-signature ships in the DMS) |
| 23 | Partner / Channel Management | **Not built** — models removed July 2026 |
| 24 | Social Media Integration | `SocialMediaAccount`, `SocialMediaPost`, `SocialMediaMention`, `SocialMediaCampaign`, `SocialListeningKeyword` — **Full-stack: service, API, control panel** |
| 25 | Data Import | `ImportJob`, `ImportPage` |
| 26 | Lead Assignment / Round Robin | `AssignmentRule`, `RoundRobinState`, `AssignmentLog` |
| 27 | Notifications | `Notification`, `notification.service` |
| 28 | Audit Logs | `AuditLog`, `PlatformAuditLog`, `AuditLogPage` — **durable & general**: every pipeline-data action (record CRUD/stage/delete/restore/purge, single + bulk) and pipeline-config action is logged to the acting user; `record_id` FK is `SET NULL` so the trail survives hard-deletes. Read per-record and per-pipeline (`/pipelines/:id/audit`) |
| 29 | Multi-Tenancy / SaaS Platform | `Tenant`, `TenantConfig`, `SubscriptionPlan`, `FeatureFlag` |
| 30 | Form Builder (Low-Code) | `UiForm`, `FormBuilder`, `FormRenderer`, `WizardBuilder` |
| 31 | Integration Framework | `Integration`, `IntegrationLog`, `IntegrationBuilderPage` |
| 32 | Search | `search.service`, full-text index support |
| 33 | Customer Feedback | **Not built** as a module — models removed; CSAT/NPS can be fields on a Builder object |
| 34 | Record Trash & Recovery | Soft-delete for records (`records.deleted_at`), admin-only Trash with restore / permanent-delete (`RecordsTrashPage`, `/builder/trash/records`), per-pipeline soft/hard **Deletion behaviour** toggle (`ui_pipelines.config.delete_mode`) |

### Missing Modules (13 gaps — needed for 9.0+)

| # | Module | Offered By | Gap Details | Priority |
| --- | --- | --- | --- | --- |
| 1 | **Live Chat / Chatbot** | Salesforce, HubSpot, Zoho, Freshsales | No models or services for real-time chat, chatbots, or conversational AI. Table stakes for modern CRMs. | P0 |
| 2 | **Invoicing & Billing** | Zoho, Freshsales, Dynamics | No quote, `Invoice`, `Payment`, or billing lifecycle models. No quote-to-cash cycle. | P0 |
| 3 | **Full Marketing Automation** | HubSpot, Salesforce Pardot, Zoho | No email campaign engine (models removed July 2026); also missing: landing pages, A/B testing, multi-channel journeys (SMS, WhatsApp), marketing attribution, web forms with tracking. | P0 |
| 4 | ~~**Web Forms / Form-to-Lead**~~ | HubSpot, Salesforce, Zoho | **Delivered (October 2026):** any Builder form publishes as a branded web form (`/f/<key>`) creating records of its object, with CAPTCHA, honeypot, consent, UTM capture, routing, and staff sharing by email or link (Tools ▸ Web forms). Remaining: an embeddable JS snippet and A/B testing. | — |
| 5 | **Telephony / CTI Integration** | Salesforce, Freshsales, Dynamics | No click-to-call, VoIP, IVR, or CTI adapter framework (call tracking is via the Activity Timeline, type: call). | P1 |
| 6 | **AI / ML Features** | Salesforce Einstein, Zoho Zia, HubSpot | Lead scoring is manual/rule-based. No predictive scoring, sentiment analysis, deal insights, or AI recommendations. | P1 |
| 7 | ~~**SLA Management**~~ | Salesforce, Dynamics, Freshdesk | **Delivered:** SLA policies and targets on any object, business-hours calendars, pause/resume, warning/breach escalations, SLA Board (`sla.service.js`). | — |
| 8 | **Subscription / Recurring Revenue Mgmt** | Salesforce, Zoho | No ARR/MRR tracking, subscription lifecycle, or renewal revenue models beyond contracts. | P2 |
| 9 | **Project Management** | Zoho, Dynamics | No project, milestone tracking, or Kanban for post-sale project delivery. | P2 |
| 10 | **Inventory Management** | Zoho, Dynamics | Products exist but no `Warehouse`, `StockLevel`, `PurchaseOrder` models. | P2 |
| 11 | **Surveys / NPS** | HubSpot, Salesforce, Zoho | No survey builder or NPS/CSAT system (CSAT/NPS can only be fields on a Builder object). | P2 |
| 12 | **Mobile App / Offline Access** | All major CRMs | No evidence of a mobile-specific build (React Native, PWA config, etc.). | P2 |
| 13 | **Data Enrichment** | HubSpot, Salesforce, ZoomInfo integrations | No models or services for automatic company/contact data enrichment from third-party sources. | P2 |

---

## Critical Gaps for 8.0+ Rating

| Gap | Impact |
| --- | ------ |
| Live Chat / Chatbot Missing | Every major CRM competitor ships real-time chat; absence is immediately visible to evaluators |
| Invoicing & Billing Missing | No quote-to-cash cycle; users must leave Genesis to complete deals |
| Full Marketing Automation Missing | No email campaign engine; multi-channel journeys, landing pages, and attribution are expected |
| Mobile Gap | Responsive web only, no native mobile apps |
| Report builder blind to Builder objects | Reports cover only fixed typed tables; customers who model their business as Builder objects can chart it on dashboards but not report on it (finding #15) |
| Async Workflow Steps | `delay` and `approval` steps work today via a `WorkflowPendingStep` table polled by a 60s scheduler; a dedicated job queue (e.g. BullMQ) would give lower-latency, higher-scale resumption |

---

## Phase 7 — Conversational & Revenue Completion (Planned — 7.5 → 8.5)

Close the three highest-impact gaps that separate Genesis from full-featured CRM competitors.

1. **Live Chat & Chatbot Engine**
   - Real-time chat widget (WebSocket-based) embeddable on customer-facing sites
   - Chat routing to agents using existing assignment engine
   - Chatbot builder with rule-based flows and AI integration hooks
   - Chat transcript logging as Activities on CRM records
   - Models: `ChatSession`, `ChatMessage`, `ChatBot`, `ChatBotFlow`, `ChatBotNode`

2. **Invoicing & Billing**
   - Invoice generation from opportunities (one-click conversion)
   - Payment tracking (partial payments, payment plans)
   - Recurring invoice schedules
   - Integration hooks for payment gateways (Stripe, Razorpay)
   - Models: `Invoice`, `InvoiceLineItem`, `Payment`, `PaymentPlan`

3. **Full Marketing Automation**
   - Landing page builder with form-to-lead capture
   - Multi-channel journey builder (email + SMS + WhatsApp)
   - A/B testing for email campaigns
   - Marketing attribution and UTM tracking
   - Web-to-lead forms with source tracking
   - Models: `LandingPage`, `MarketingJourney`, `JourneyStep`, `AbTest`, `Attribution`

4. **WhatsApp Business Channel** — the conversational channel clients ask for
   first. Design and step-by-step plan:
   [social-media.md → WHATSAPP INTEGRATION](../administration/social-media.md#whatsapp-integration)
   - Live WhatsApp Cloud API connector registered in `LIVE_CONNECTORS`
     (the connector contract and OAuth round-trip already exist)
   - **Embedded Signup** onboarding so each tenant brings its own WABA, number,
     templates and billing — rather than one shared operator account
   - Approved-template registry, bulk **and** targeted sends with a delivery
     state per recipient, opt-in / STOP handling, messaging-tier rate caps
   - Two-way conversations landing on the CRM record, routed through the
     existing assignment engine and emitting bus events for workflow / SLA
   - Public inbound webhook with **tenant resolved from `phone_number_id`** —
     the highest-risk piece, given the `AsyncLocalStorage` isolation model
   - New `/conversations` route (three-pane inbox) + a thread panel embedded on
     Contact / Lead / Case; broadcast composer and delivery report
   - Models: `WhatsAppTemplate`, `WhatsAppBroadcast`, `WhatsAppBroadcastRecipient`,
     `WhatsAppConversation`, `WhatsAppMessage`
   - Entitlement: new `eng_whatsapp` catalogue key

5. **Paid Campaign Analytics (Meta Marketing API)** — measure engagement and
   revenue per campaign, not just per post. Design:
   [social-media.md → Meta Ads & Campaign Analytics](../administration/social-media.md#meta-ads--campaign-analytics)
   - Separate `MetaAdsConnector` (`ads_read`; its own App Review submission,
     distinct from the page publishing scopes)
   - `platform_campaign_id` / `ad_account_id` on `SocialMediaCampaign` and a
     `campaign_id` FK on `SocialMediaPost` — today's roll-up is positional
     (same platform, same dates), so overlapping campaigns double-count
   - Dated insights table (spend, impressions, CTR, CPC, conversions,
     breakdowns) with ~3-day backfill, replacing the single overwritten
     `performance_summary` blob that carries no history
   - **Lead Ads** `leadgen` webhook → `CrmLead` carrying `campaign_id` / `ad_id`,
     and Click-to-WhatsApp referral capture — the attribution that connects
     campaign spend to closed business
   - Surfaced through the existing reporting / dashboard engines, not bespoke charts
   - Models: `MetaAdInsight`
   - Independent of item 4 — different API, tokens and tables, so the two can
     run in parallel

---

## Phase 8 — Intelligence & Service Excellence (Planned — 8.5 → 9.0)

Add AI-powered intelligence and complete the service management suite.

1. **AI / ML Features** — see the full [AI Capabilities — Proposed Feature Catalog](#ai-capabilities--proposed-feature-catalog) for the architecture-grounded breakdown and model strategy
   - Predictive lead scoring (replace manual rules with ML model)
   - Deal win-probability prediction
   - Sentiment analysis on emails and case messages
   - AI-powered next-best-action recommendations
   - Smart field auto-fill and data deduplication

2. **SLA Management** — *delivered*: `SlaPolicy`, `SlaTarget`, `SlaInstance`, `SlaEscalation`, `SlaBusinessHours`, the SLA Board and the `sla` report source.

3. **Telephony / CTI Integration**
   - Click-to-call from any phone field
   - CTI adapter framework (Twilio, Exotel, Aircall)
   - Call recording links on Activity Timeline
   - IVR routing integration
   - Automatic call logging with duration and disposition

4. **Web Forms / Form-to-Lead** — *delivered October 2026* (any object, CAPTCHA and honeypot, assignment routing,
   staff sharing). Still open:
   - Embeddable JS snippet (today: iframe or posting to `/api/public/forms/:key`)
   - A/B testing and per-form conversion reporting

---

## Phase 9 — Extended Platform (Planned — 9.0 → 9.5+)

Add secondary modules that differentiate enterprise CRMs and improve post-sale experience.

1. **Subscription & Recurring Revenue Management**
   - ARR/MRR tracking and churn analysis
   - Subscription lifecycle (trial → active → renewal → churned)
   - Revenue recognition schedules
   - Models: `Subscription`, `SubscriptionEvent`, `RevenueSchedule`

2. **Surveys / NPS**
   - Survey builder with question types (rating, text, multiple choice, NPS)
   - Email/portal-based survey distribution
   - NPS/CSAT score tracking per account and over time
   - Models: `Survey`, `SurveyQuestion`, `SurveyResponse`, `SurveyAnswer`

3. **Project Management**
   - Post-sale project tracking with milestones
   - Task boards (Kanban) linked to accounts/opportunities
   - Time tracking and resource allocation
   - Models: `Project`, `ProjectMilestone`, `ProjectTask`, `TimeEntry`

4. **Inventory Management**
   - Warehouse and stock level tracking
   - Purchase orders and vendor management
   - Stock alerts and reorder rules
   - Models: `Warehouse`, `StockLevel`, `PurchaseOrder`, `Vendor`

5. **Mobile App**
   - React Native or PWA with offline-first architecture
   - Push notifications for tasks, assignments, and approvals
   - Mobile-optimized record views and quick actions

6. **Data Enrichment**
   - Third-party enrichment adapters (Clearbit, ZoomInfo, Apollo)
   - Auto-fill company and contact data on creation
   - Periodic re-enrichment schedules

---

## AI Capabilities — Proposed Feature Catalog

The independent assessment scores **AI / intelligence at 1/10** — the single
biggest gap versus the top-5 CRMs, which all ship AI copilots in 2026. This
section expands the thin Phase 8 "AI / ML Features" bullet into a concrete,
architecture-grounded catalog of what Genesis could offer. It is deliberately
mapped to the services and data the platform *already* has, so most features are
a new layer over existing code rather than net-new subsystems.

**Model strategy.** Build on the Anthropic Claude API via the official SDK,
behind a provider abstraction so the model tier is a per-task choice (mirroring
the existing social connector pattern):

| Tier | Model | Use for |
| ---- | ----- | ------- |
| Frontier reasoning | `claude-opus-4-8` | Deal strategy, NL→report, agentic copilot |
| Balanced / high-volume | `claude-sonnet-5` | Email drafting, summaries, case triage, most production traffic |
| Fast / cheap | `claude-haiku-4-5` | Classification, routing, sentiment, dedup scoring, tagging |
| Hardest long-horizon | `claude-fable-5` | Multi-step research/analysis agents (reserve for high-value runs) |

Cross-cutting techniques: **RAG** over tenant-scoped CRM records for grounded
answers; **tool use** so the copilot calls the existing service layer
(`crm.service`, `record.service`, `search.service`, …) instead of touching the
DB directly; **structured outputs** for schema-safe extraction that flows into
typed EAV fields; and **prompt caching** on stable system/context prefixes to
control cost.

### A. Sales Intelligence

| Capability | Backed by | Model tier |
| ---------- | --------- | ---------- |
| **Predictive lead scoring** — ML/LLM score replacing/augmenting the rule engine, with an explanation | `lead-scoring.service`, `LeadScore`, `CrmLead` | Haiku/Sonnet |
| **Deal win-probability & risk** — per-opportunity likelihood + "why", stalled-deal alerts | `crm.service` (opportunities), `forecast.service` | Sonnet |
| **Next-best-action** — recommended step per lead/deal, surfaced as a Task/Reminder | `task.service`, `activity.service`, event bus | Sonnet |
| **Forecast narratives** — plain-language "why the number moved" over the weighted forecast | `forecast.service`, `dashboard.service` | Sonnet |

### B. Conversational Copilot & NL Interface

| Capability | Backed by | Model tier |
| ---------- | --------- | ---------- |
| **CRM copilot (tool-use agent)** — "create a lead for Acme", "show my overdue tasks", "advance the Globex deal" — Claude calls existing services under the user's RBAC/tenant scope | `crm/record/task/search/report` services, `permission.service` | Opus |
| **Natural-language reports** — "pipeline by stage for Q3 as a bar chart" → a saved report/chart | `report.service`, `report-registry`, `UiChart` | Opus |
| **WhatsApp / channel chatbot** — the same tool-use agent over WhatsApp (see [SOCIAL_MEDIA — WHATSAPP INTEGRATION](../administration/social-media.md#whatsapp-integration)) | WhatsApp connector + copilot | Sonnet/Opus |
| **Global semantic search** — embeddings-backed retrieval to replace SQL `LIKE %q%` (finding #9) | `search.service` | embeddings + Haiku |

### C. Content Generation

| Capability | Backed by | Model tier |
| ---------- | --------- | ---------- |
| **Email drafting & reply** — context-aware drafts from record data, tone controls | `email-template.service`, `email-send.service`, `template-engine` | Sonnet |
| **Record & thread summarization** — one-line and full summaries of a record's Activity timeline | `activity.service`, `record.service` | Sonnet |
| **Meeting/voice-note → notes** — transcribe + structure into an Activity (pairs with the WhatsApp voice-note flow) | `activity.service`, `document.service` | Sonnet |
| **Template authoring assist** — generate/refine email & document templates in the builder | `email-template.service`, `template-engine.service` | Sonnet |

### D. Data Quality & Enrichment

| Capability | Backed by | Model tier |
| ---------- | --------- | ---------- |
| **Smart dedup** — semantic duplicate detection beyond exact-key matching in imports | `import.service`, `record.service` | Haiku + embeddings |
| **Auto-classification & routing** — categorize inbound records/messages, feed the assignment engine | `assignment.service`, event bus | Haiku |
| **Field auto-fill & normalization** — infer/clean fields on create (address, industry, title) | `record.service` (typed EAV) | Haiku/Sonnet |
| **AI enrichment adapter** — an enrichment connector that uses an LLM to structure scraped/public data | Data Enrichment (above), `integration.service` | Sonnet |

### E. Service, Analytics & Ops

| Capability | Backed by | Model tier |
| ---------- | --------- | ---------- |
| **Case triage & sentiment** — auto-categorize, prioritize, and sentiment-tag cases and social mentions | `sla.service`, `social-media.service`, `notification.service` | Haiku/Sonnet |
| **Suggested replies & KB drafting** — draft case responses; turn resolved cases into knowledge articles | `email-send.service`, `document.service` | Sonnet |
| **Dashboard narratives & anomaly detection** — "what changed and why" over report data; flag outliers | `report.service`, `dashboard.service` | Sonnet |
| **Workflow copilot** — natural-language authoring of workflow/assignment rules in the builder | `workflow.service`, `assignment.service` | Opus |

### AI Platform Architecture (cross-cutting)

A shared `ai.service.js` (peer of the other backend services) should own:

- **Provider abstraction + model routing** — pick Opus/Sonnet/Haiku/Fable per
  task; swap providers without touching feature code.
- **RAG over tenant-scoped data** — retrieval must run inside the tenant's
  `AsyncLocalStorage` context and `permission.service` scope so a prompt can
  never surface another tenant's rows (the same isolation risk called out for
  the WhatsApp webhook).
- **Tool-use registry** — expose existing service methods as Claude tools with
  confirmation gates on writes/destructive actions; every AI-initiated change
  flows through the same `AuditLog`.
- **Prompt caching & cost controls** — cache stable system/context prefixes;
  budget caps and per-tenant usage metering.
- **Guardrails & evaluation** — PII handling (⚠️ the DB is a shared AWS RDS —
  scrub/redact before sending, honor `do_not_contact`), output validation via
  structured outputs, refusal handling, and an eval harness so quality is
  measured, not assumed.

### Suggested AI Rollout (aligns with Phase 8)

1. **Assistive, low-risk first** — summaries, email drafts, record classification
   (read-mostly, high value, easy to gate). Establishes the `ai.service` + caching.
2. **Predictive** — LLM/ML lead scoring and deal win-probability with explanations
   (replaces finding #2's rule-only scoring).
3. **Conversational** — the tool-use copilot (web + WhatsApp) over the service
   layer, under RBAC/tenant scope.

### Key Risks

- **Tenant isolation on retrieval/tool-use** — the highest risk; RAG and agent
  tools must never cross tenant boundaries (ties to the ALS isolation model).
- **PII egress** — sending CRM data to a model provider needs a clear data
  policy given the shared RDS instance; scrub/redact and respect consent flags.
- **Cost & latency** — meter usage per tenant, cache aggressively, and route
  cheap tasks to Haiku; reserve Opus/Fable for high-value reasoning.
- **Trust & correctness** — human-in-the-loop on any
  write action; measure with an eval harness before enabling autonomy.

---

## Client Life-Event Capture — Proposed Feature Catalog

> **Status: proposed / not built.** This section is architect-level guidance on
> *how, when, and why* Genesis should capture a client's **life events** (marriage,
> new baby, home purchase, job change, retirement, bereavement, …). For a
> relationship-led CRM these events *are* the buying triggers, so
> capturing them is one of the highest-ROI additions available. Like the AI catalog
> above, it is deliberately mapped to the services and data Genesis **already** has,
> so most of it is a thin layer over existing code rather than a net-new subsystem.

### Why — the business case

Life events are the moments a client's **needs change** —
among the highest-converting trigger sets in relationship-led selling.

| Reason | What it buys |
| ------ | ------------ |
| **Cross-sell / up-sell timing** | New home, new business, retirement — each opens a need for a different product. Catch the need before a competitor does. |
| **Retention & loyalty** | A timely, relevant check-in reads as service, not selling; generic mistimed mail reads as spam. |
| **Segmentation & LTV** | Life-stage cohorts (young family, empty-nester, pre-retiree) drive tailored journeys and lifetime-value modelling. |
| **Suitability / audit** | Documenting *why* a recommendation was made (the triggering event) supports suitability and an audit trail. |

> Framing that drives every design decision below: this is **not "collecting data"** —
> it is *detecting the moment a client's need changes and being the first useful voice
> in that moment.*

### When — timing & event taxonomy

Two "whens": *which* events, and *at what moment* to act.

**Which events** (starter taxonomy, grouped so users and rules think in categories):

- **Family** — marriage, divorce, birth/adoption, child coming of age, bereavement.
- **Property & assets** — home purchase, renovation, second home, new vehicle, boat/RV.
- **Career & financial** — new job, promotion, business start-up, layoff, inheritance, bankruptcy.
- **Health & age** — serious diagnosis, disability, milestone birthdays, retirement.
- **Relationship with you** — customer anniversary, renewal window, case opened, product gap detected.

**At what moment to act:**

- **At capture time** — fire a workflow the instant the event is recorded (task, alert, journey enrolment).
- **Anticipatory / date-derived** — the highest-value class: events *predictable* from data Genesis already holds (a client's DOB → "turns 65 next quarter"; client-since date → "10-year anniversary in 30 days"). Act *before* the client thinks of it.
- **Anniversary / recurring** — renewals and annual reviews on the same trigger machinery.

> **Timing discipline:** capture always; *act* only when relevant and welcome. Sensitive
> events (divorce, bereavement) may warrant a quiet internal flag and a **delayed**, gentle
> review — never an automated "congratulations." Sensitivity levels belong in the taxonomy.

### How — capture mechanisms, mapped to existing services

Think of it as a pipeline — **capture → store → detect → act** — with several capture
sources feeding one canonical event record.

| Mechanism | Backed by (existing) | Notes |
| --------- | -------------------- | ----- |
| **Agent-logged (manual)** — one-click "log life event" from the record's Activity Timeline | `activity.service`, `record.service` | Baseline; must be one click, not a buried form |
| **Client self-service** — clients update milestones in the portal; periodic "annual check-in" review forms | client portal (`portal.service`), `email-send.service` | Turns the client into a capture source |
| **Derived / computed (highest ROI)** — a scheduler runs rules over data already held (DOBs, contract dates, anniversaries) | same 60s scheduler pattern as `WorkflowPendingStep`; `record.service` typed-EAV/date values; `Reminder` model | "Any client turning 65 in 90 days" is a *query*, not new data collection |
| **External signals / enrichment** — job change, business formation, property records | Data Enrichment adapter (Missing Modules #13; e.g. the connected Lusha MCP), `integration.service` | Lower-confidence → a lead to verify, not a fact to act on |
| **AI extraction (future)** — NLP over call notes / emails auto-suggests "possible life event detected" | AI catalog §C/§D above, `ai.service` | Lands as *unverified*, routed for confirmation |

### Detect vs. act — architecture guidance

Since Genesis owns its platform, the design principles the top-5 CRMs converge on:

1. **First-class `LifeEvent` record** (not a note). Because Genesis is metadata-driven it can start as a **custom object** with typed EAV fields — no schema migration required. Minimum fields: `type` (taxonomy), `event_date`, `captured_date`, `source` (manual/self-service/derived/enriched/ai), `confidence`, `sensitivity_level`, `status` (detected → verified → actioned → closed), `related_contact`, `linked_opportunity`.
2. **Separate *detection* from *action*.** Detection writes the event; the **workflow engine** decides whether/when to act via the `field_changed` trigger and the `record.created/updated` domain events on the existing event bus. Tuning outreach never touches capture.
3. **Confidence + verification queue.** Enriched/derived/AI events land `unverified` and route (via `assignment.service`) to an adviser to confirm before any client-facing action — protects against acting on bad data.
4. **Consent & privacy by design.** Life events are sensitive personal data (health, family, finance). Honour the existing `do_not_contact` flag, add purpose/retention rules, and log every AI/enrichment touch through `AuditLog`. ⚠️ The DB is a shared AWS RDS — scrub/redact before any model egress (same rule as the AI catalog).
5. **Tenant scoping.** `LifeEvent` reads/writes and any derived-rule scheduler must run inside the tenant `AsyncLocalStorage` context — the same isolation guarantee as every other record.
6. **Event → next-best-action mapping as *configuration*.** Each event type maps to a playbook (recommended product, task owner, message template, wait time) stored as tunable config — no deploy to change.
7. **Feedback loop.** Track conversion per event type (`forecast.service` / `report.service`) to learn which triggers actually produce business and refine the taxonomy.

### Suggested rollout (crawl → walk → run)

1. **Crawl** — a `LifeEvent` custom object + one-click manual capture on the Activity Timeline + a handful of derived-date rules (renewals, anniversaries, milestone ages) on the existing scheduler.
2. **Walk** — workflow mapping event → task/journey/NBA, sensitivity levels, and portal self-service review forms.
3. **Run** — AI extraction over calls/emails with a verification queue, third-party enrichment, and per-event conversion analytics feeding next-best-action.

> **One-line summary:** capture life events because they are the exact moments a client's
> needs change; capture them continuously (manual, self-service, **derived rules
> over data already held**, and — carefully — enrichment/AI); act on them **selectively and
> sensitively** via the workflow engine, on a first-class, consent-aware, tenant-scoped
> `LifeEvent` record that separates *detecting* the event from *deciding to act*.

---

## Future Assignment Strategies

| Priority | Strategy | Effort |
| -------- | -------- | ------ |
| 1 — High | Territory / Region Routing (match lead region to employee territory) | Medium |
| 2 — Medium | Capacity-capped Assignment (skip reps at `max_leads` limit) | Low |

**Territory routing note:** Schema already supports this — `employees` has `region_id` and `branch_id`. Add a
`territories` table mapping region/branch → employee pool, then apply round-robin within that pool.

**Capacity-capped note:** Add a `max_leads INT` column to `employees`. Skip reps who have reached their cap during
the assignment loop.

---

## Prioritization Matrix

### P0 — Must-Have To Reach 7/10 (All Complete)

- Real workflow execution for `notification`, `action`, `condition` step types
- Assignment engine with round-robin, rule-based, and load-balanced strategies
- Manager forecasting and quotas
- Import with duplicate detection and merge
- Backend unit tests covering all major services (165 tests, 13 suites)
- Frontend test suite (27 tests, 5 suites, 0 lint errors/warnings)

### P1 — Strong Boosters (Partially Complete)

- Live chat / chatbot engine (planned — Phase 7)
- Invoicing & billing (planned — Phase 7)
- Full marketing automation with journeys (planned — Phase 7)
- AI / ML features — predictive scoring, sentiment analysis (planned — Phase 8)
- SLA management (complete)
- Telephony / CTI integration (planned — Phase 8)
- Web forms / form-to-lead capture (complete, October 2026)
- Field-level security via `ui_permissions` (partial — hides fields on screen; the API still returns them, finding #16)
- Operational scope permissions via `operational_permissions` (complete)
- Assignment audit and admin governance (complete)
- Retryable webhook infrastructure (complete)
- Inbound webhook reception with HMAC-SHA256 verification (complete)
- Typed custom-object EAV storage (complete)
- Cross-object global search (complete)

### P2 — Useful But Not Critical

- Subscription / recurring revenue management
- Project management for post-sale delivery
- Inventory management
- Surveys / NPS scoring system
- Mobile app / offline access
- Data enrichment from third-party sources
- Advanced territory models
- Capacity-based routing

---

## Success Metrics

Use the following metrics to judge roadmap progress:

- Workflow success rate
- Percentage of records assigned automatically
- Average time from record creation to first owner action
- Duplicate rate in imported records
- Forecast coverage and forecast accuracy
- Number of builder/runtime regressions caught before release
- Number of permission defects reported by users
- Number of manual admin interventions needed for routing and data cleanup

---

## Final Recommendation

Do not try to beat Salesforce on breadth. Beat lighter CRMs on adaptability while getting close enough on operational
depth that a growing sales team can run the business inside Genesis without immediate pressure to migrate elsewhere.

That is the most realistic path to a defensible `7/10` product score — and with Phase 6 complete, to `8/10`.

---

## Related Guides

- **Changelog**: [changelog.md](changelog.md)
- **Architecture**: [../developer-guide/architecture-and-setup.md](../developer-guide/architecture-and-setup.md)
- **Workflow Engine**: [../developer-guide/engines/workflow-engine.md](../developer-guide/engines/workflow-engine.md)

<!-- nav:bottom -->

---

### Where to next

| | |
|---|---|
| **Next** | [Build effort & capabilities](build-effort-and-capabilities.md) — No-code envelope and effort estimates for new processes |
| **Previous** | [Local LLM operations](../developer-guide/ai-reporting/local-llm-operations.md) *(AI reporting)* |
| **Background** | [Understanding Genesis › Configure or code?](../understanding/07-configure-or-code.md) |
| **On these journeys** | [Decision-maker](../README.md#decision-maker) (step 8 of 8) |
| **Lost?** | [Docs roadmap](../README.md) · [Project](README.md) · [Understanding Genesis](../understanding/README.md) |
<!-- /nav:bottom -->
