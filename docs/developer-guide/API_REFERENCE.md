# API Reference — Endpoints, Relevance & Invocation

> A complete reference to the Genesis CRM backend REST API (**Fastify 5**). For every endpoint it states **what it is
> for (relevance)** and **when & how it is invoked** across the application (which frontend action, background
> scheduler, or external webhook triggers it).
>
> **Source of truth:** route handlers under [`backend/src/routes/`](../../backend/src/routes/), registered in
> [`backend/src/app.js`](../../backend/src/app.js). Business logic lives in
> [`backend/src/services/`](../../backend/src/services/). Frontend callers live in
> [`frontend/src/services/*.service.js`](../../frontend/src/services/).

## Conventions

- **Base URL.** All routes are mounted under `/api`. Each group below is registered with a prefix in `app.js` (e.g.
  `/api/auth`, `/api/runtime`).
- **Auth.** Most endpoints require a **JWT** via the `authenticate` preHandler
  ([`middleware/authenticate.js`](../../backend/src/middleware/authenticate.js)), which also sets the tenant context.
  Endpoints marked **public** (e.g. `POST /api/auth/login`) run without a token. Some endpoints add a **role gate**
  (`ROLE_LEVEL` — user < manager < admin < super_admin); those are noted per row.
- **Tenant scoping.** After authentication the tenant is derived from the token and applied to all Prisma queries, so
  endpoints operate only on the caller's tenant unless they are part of the super-admin **Platform** control plane.
- **Response envelope.** Handlers return `ok(data)` → `{ success: true, data }`; errors are shaped by the global error
  handler in `app.js` (`{ success: false, error: { code, message } }`) with appropriate HTTP status.
- **"When & how it's invoked."** Describes the concrete trigger — a UI screen/action calling a
  `frontend/src/services/*.service.js` function, a background scheduler in `app.js`, or an inbound webhook/approval
  link. Where no frontend caller exists, the row says so (server/CLI/seed/external use).

### Background schedulers (not HTTP-triggered)

Eight server-side loops run inside the API process, registered through the `SchedulerRegistry` in
[`utils/scheduler.js`](../../backend/src/utils/scheduler.js) from [`app.js`](../../backend/src/app.js). Each has an
overlap guard (a slow tick is skipped, never queued) and claims its own rows atomically so several pods can run
the same loop. `GET /health` reports every loop under `schedulers` (`runs`, `last_started_at`, `last_duration_ms`,
`last_result`, `last_error`, `skipped_overlaps`).

| Loop | Interval | What it does |
|---|---|---|
| `workflow` | every 60s | `WorkflowEngineService.runScheduled()` — runs due scheduled workflows and resumes delayed steps. |
| `sla` | every 60s (15s startup offset) | `SlaService.reconcile()` — recomputes SLA timers, flags at-risk/breached, escalates. |
| `social-publish` | every 60s (10s offset) | `SocialMediaService.publishDue()` — publishes posts whose `scheduled_for` has passed; failures notify the author. |
| `social-sync` | every 5 min (30s offset) | `SocialMediaService.runSyncCycle()` — for accounts due under their own `sync_frequency`: token refresh, profile metrics, mentions (keyword-matched, routed), engagement; then campaign roll-ups. |
| `reminder` | every 60s (45s offset) | `ReminderService.sweepDue()` — fires due reminders as in-app notifications. |
| `report-schedule` | every 60s (20s offset) | `ReportScheduleService.sweepDue()` — emails saved reports whose subscription is due. |
| `job-queue` | every 15s (20s offset) | `JobQueue.work()` — runs due jobs from the durable `job_queue` table (retried integration and SMS calls); exponential back-off, dead-letter after 6 attempts. Depth by status is on `/health` under `job_queue`. |
| `formula-refresh` | hourly (5 min offset), works once a day | `FormulaRefreshService.run()` — recomputes date-dependent formulas (`TODAY`, `NOW`, `AGE`). |

## Route groups

| Prefix | Group | Primary consumer |
|---|---|---|
| `/api/auth` | Authentication & password reset | Login / account screens |
| `/api/metadata` | Metadata read API (modules→objects→fields→forms) | App bootstrap, dynamic UI rendering |
| `/api/builder` | Low-code Builder (admin config) | Admin builder screens |
| `/api/runtime` | Generic record CRUD & operations | End-user CRM screens |
| `/api/activities`, `/api/tasks`, `/api/reminders`, `/api/notifications` | Activity / task / reminder / notification operations | Record detail, task & reminder lists, bell menu |
| `/api/search` | Global search | Global search bar |
| `/api/email`, `/api/documents` | Email send/templates, document storage | Compose, attachments |
| `/api/social-media` | Social media management & listening | Social console + 5-min sync |
| `/api/lead-scoring` | Lead scoring rules & analytics | Lead screens |
| `/api/sla` | SLA policies & instances | SLA admin + 60s reconciler |
| `/api/reports` | Reporting & analytics | Reports module |
| `/api/analytics` | Live dashboard datasets | Dashboard widgets + Dashboard Builder |
| `/api/settings` | Tenant application settings | Settings page |
| `/api/platform` | Super-admin multi-tenant control plane | Platform/super-admin console |
| `/api/integrations` | Inbound integration webhook | External systems |
| `/api/access` | Business units, information barriers, wall-crossings, audit chain | Tools ▸ Access & Barriers |
| `/api/public` | Published web forms and website data feeds (**no authentication**) | Websites, `/f/:key` |
| `/api/portal` | Client & introducer portal (separate sign-in realm) | `/portal/:workspace` |
| `/api/calendar` | Personal iCalendar feed | Calendar apps, My account ▸ Security |
| `/api/web-forms` | Share published web forms with clients (link, email) | Tools ▸ Web forms |
| `/api/upload-links` | Document checklist status and secure client upload links | Record Docs tab, `/upload/:token` |

---

## Contents

- [Auth  ·  `/api/auth`](#auth----apiauth)
- [Metadata  ·  `/api/metadata`](#metadata----apimetadata)
- [Search  ·  `/api/search`](#search----apisearch)
- [Integrations (inbound)  ·  `/api/integrations`](#integrations-inbound----apiintegrations)
- [Builder  ·  `/api/builder`](#builder----apibuilder)
- [Runtime  ·  `/api/runtime`](#runtime----apiruntime)
- [Platform (Super-Admin)  ·  `/api/platform`](#platform-super-admin----apiplatform)
- [Settings  ·  `/api/settings`](#settings----apisettings)
- [SLA · `/api/sla`](#sla--apisla)
- [Reports · `/api/reports`](#reports--apireports)
- [Analytics · `/api/analytics`](#analytics--apianalytics)
- [Lead Scoring · `/api/lead-scoring`](#lead-scoring--apilead-scoring)
- [Email · `/api/email`](#email--apiemail)
- [Documents · `/api/documents`](#documents--apidocuments)
- [Social Media · `/api/social-media`](#social-media--apisocial-media)
- [Activities · `/api/activities`](#activities--apiactivities)
- [Tasks · `/api/tasks`](#tasks--apitasks)
- [Reminders · `/api/reminders`](#reminders--apireminders)
- [Notifications · `/api/notifications`](#notifications--apinotifications)
- [Access · `/api/access`](#access--apiaccess)
- [Public forms · `/api/public`](#public-forms--apipublic)
- [Portal · `/api/portal`](#portal--apiportal)
- [Calendar · `/api/calendar`](#calendar--apicalendar)
- [Web forms · `/api/web-forms`](#web-forms--apiweb-forms)
- [Upload links · `/api/upload-links`](#upload-links--apiupload-links)

---

Auth model recap (see `backend/src/middleware/authenticate.js`):

- `authenticate` preHandler → requires a valid Bearer JWT; populates `req.user` (`employeeId`, `tenant_id`, `role`, …).
- `requireAdmin` preHandler → runs `authenticate` **and** gates on an admin role.
- Endpoints with **no** preHandler are public (no JWT).

Frontend service layer callers referenced below live in `frontend/src/services/*.service.js` and the pages/components
that consume them.

---

## Auth  ·  `/api/auth`

Handles authentication (login, password reset, change/forgot password), the current-user profile, the employee reporting
hierarchy / org graph, employee CRUD, tenant-scoped Role CRUD, and region/branch lookups. Login and the two
password-reset endpoints are **public**; `me`, `change-password`, `hierarchy`, `direct-reports`, `roles` (list),
`regions`, `branches` require a JWT (`authenticate`); all employee mutations, the org graph, and role
create/update/delete require **admin** (`requireAdmin`). Source: `backend/src/routes/auth/index.js`.

| Method & Path | Purpose / Relevance | Auth | When & how it's invoked |
|---|---|---|---|
| POST `/api/auth/login` | Authenticate by `employee_id` + `password`. Returns `{ token, refresh_token, employee }`, or `{ mfa_required \| mfa_setup_required, mfa_token }` when two-factor applies. | Public | Login page form submit via `authService.login()` (`frontend/src/pages/Login.jsx`). |
| POST `/api/auth/refresh` | Body `{ refresh_token }`. Rotates: returns a new `{ token, refresh_token, employee }` and retires the old token. Replaying a retired token revokes its whole family. | Public (the token is the credential) | `services/api.js` on a 401, single-flight. |
| POST `/api/auth/logout` | Body `{ refresh_token?, everywhere? }`. Revokes the refresh token; `everywhere: true` also revokes every issued access token (`tokens_valid_after`). | JWT | `authStore.logout()`; *Sign out everywhere* on My account ▸ Security. |
| POST `/api/auth/mfa/verify` | Body `{ mfa_token, code }` (TOTP or recovery code). Completes a two-factor sign-in. | Challenge token | `Login.jsx` second step. |
| POST `/api/auth/mfa/setup` | Starts enrolment; returns `{ secret, otpauth_uri }`. Body `{ mfa_token? }` when enrolment is forced at sign-in. | JWT or challenge token | `AccountSecurityPage.jsx`, `Login.jsx`. |
| POST `/api/auth/mfa/enable` | Body `{ code, mfa_token? }`. Turns MFA on; returns ten recovery codes once (and a session when called during sign-in). | JWT or challenge token | Same. |
| POST `/api/auth/mfa/disable` | Body `{ code }`. Turns MFA off (not allowed while the security policy requires it). | JWT | `AccountSecurityPage.jsx`. |
| POST `/api/auth/forgot-password` | Emails a password-reset link if the identifier matches; always returns a generic message (no account-existence leak). | Public | Forgot-password form via `authService.forgotPassword()` (`frontend/src/pages/ForgotPassword.jsx`). |
| POST `/api/auth/reset-password` | Consumes the emailed token + `new_password` to set a new password. | Public | Reset-password page (link from email) via `authService.resetPassword()` (`frontend/src/pages/ResetPassword.jsx`). |
| GET `/api/auth/entitlements` | `{ plan, features, locked }` — the feature keys this workspace may use and, for each locked one, the source and reason. Platform admins get every key. The same block ships inside `/runtime/bootstrap`. | JWT (`authenticate`) | `authService.entitlements()`; `useEntitlements()` reads the bootstrap copy so every screen has it from first render. |
| GET `/api/auth/me` | Returns the current user's profile. | JWT (`authenticate`) | Service method `authService.me()` is defined but no direct page caller was found (bootstrap flow uses the stored token; likely reserved/server use). |
| POST `/api/auth/change-password` | Change own password with `current_password` + `new_password`. | JWT (`authenticate`) | Service method `authService.changePassword()` is defined but no direct UI caller was found. |
| GET `/api/auth/hierarchy` | Reporter/subordinate tree for the current user. | JWT (`authenticate`) | `authService.getHierarchy()` — Employees and Roles builder pages (`frontend/src/pages/builder/EmployeesPage.jsx`, `RolesPage.jsx`). |
| GET `/api/auth/hierarchy/:id` | Admin views any employee's tree. | Admin (`requireAdmin`) | Same `authService.getHierarchy(id)`, passing an id (EmployeesPage "show hierarchy for" selection). |
| GET `/api/auth/org-hierarchy` | Full org graph for admin visualization. | Admin (`requireAdmin`) | `authService.getOrgHierarchy()` — Org Chart page (`frontend/src/pages/builder/OrgChartPage.jsx`). |
| GET `/api/auth/direct-reports` | Direct reports of the current user. | JWT (`authenticate`) | Service method `authService.getDirectReports()` is defined but no direct UI caller was found. |
| GET `/api/auth/employees` | List all employees (id, name, role, contact, branch, region). | Admin (`requireAdmin`) | `authService.getEmployees()` — EmployeesPage, RolesPage, and `EmployeePicker` component (`frontend/src/components/ui/EmployeePicker.jsx`). |
| POST `/api/auth/employees` | Create an employee (validates, enforces tenant `max_users`, builds hierarchy rows). | Admin (`requireAdmin`) | `authService.createEmployee()` — EmployeesPage create dialog. |
| PUT `/api/auth/employees/:id` | Update an employee (optional password re-hash, optional hierarchy re-parent). Refused for the platform administrator and for an account with more authority than the caller. | Admin (`requireAdmin`) | `authService.updateEmployee()` — EmployeesPage edit dialog. |
| PATCH `/api/auth/employees/:id/deactivate` | Soft-deactivate an employee (`is_active=false`) and revoke their sessions. Refused for the platform administrator, an account with more authority, and yourself (`PATCH …/reactivate` has the same guard, except self). | Admin (`requireAdmin`) | `authService.deactivateEmployee()` — EmployeesPage row action. |
| PATCH `/api/auth/employees/:id/reactivate` | Reactivate an employee (`is_active=true`). | Admin (`requireAdmin`) | `authService.reactivateEmployee()` — EmployeesPage row action. |
| GET `/api/auth/roles` | List tenant roles (ordered by level) with employee counts. | JWT (`authenticate`) | `authService.getRoles()` — RolesPage and EmployeesPage (role dropdown). |
| POST `/api/auth/roles` | Create a custom role; shifts existing roles at/below the level down by 1. | Admin (`requireAdmin`) | `authService.createRole()` — RolesPage create form. |
| GET `/api/auth/roles/preview-shift` | Preview which roles would shift when inserting at a given `level`. | Admin (`requireAdmin`) | Service method `authService.previewShift(level)` is defined but no direct UI caller was found. |
| PUT `/api/auth/roles/:id` | Update a role (label/description/level/active). | Admin (`requireAdmin`) | `authService.updateRole()` — RolesPage edit form. |
| DELETE `/api/auth/roles/:id` | Delete a role (only if no employees use it); closes the level gap. | Admin (`requireAdmin`) | `authService.deleteRole()` — RolesPage delete action. |
| GET `/api/auth/regions` | List active regions for the tenant. | JWT (`authenticate`) | Service method `authService.getRegions()` is defined but no direct UI caller was found. |
| GET `/api/auth/branches` | List active branches (with region name) for the tenant. | JWT (`authenticate`) | `authService.getBranches()` — EmployeesPage (branch dropdown). |

---

## Metadata  ·  `/api/metadata`

The no-code schema layer: CRUD over **Modules → Objects → Fields → Forms** plus **Validations** and **field
Dependencies**, backed by `MetadataService` with Redis caching. All GET (read) endpoints require a JWT (`authenticate`);
all create/update/delete/layout mutations require **admin** (`requireAdmin`). POST returns 201, DELETE returns 204.
Source: `backend/src/routes/metadata/index.js`. Frontend callers are in `frontend/src/services/metadata.service.js`,
consumed mainly by the builder pages.

**Dependency guards.** Renames, deletes and picklist-option removals that would break something are refused with a
400 `VALIDATION_ERROR` whose message names what is in the way (see `backend/src/services/metadata-dependencies.js`).
The Genesis Capital vertical installer writes metadata directly and is not affected.

| Method & Path | Purpose / Relevance | Auth | When & how it's invoked |
|---|---|---|---|
| GET `/api/metadata/modules` | List all modules. | JWT (`authenticate`) | `metadataService.getModules()` — ModuleBuilder, FormBuilder, WizardBuilder, PipelineBuilder, `ObjectPicker` (`frontend/src/pages/builder/*`, `frontend/src/components/ui/ObjectPicker.jsx`). |
| GET `/api/metadata/modules/:id` | Fetch one module. | JWT (`authenticate`) | `metadataService.getModule(id)` (single-module fetch; store also caches modules). |
| POST `/api/metadata/modules` | Create a module. | Admin (`requireAdmin`) | `metadataService.createModule()` — ModuleBuilder create dialog. |
| PUT `/api/metadata/modules/:id` | Update a module. | Admin (`requireAdmin`) | `metadataService.updateModule()` — ModuleBuilder edit dialog. |
| DELETE `/api/metadata/modules/:id` | Delete a module. | Admin (`requireAdmin`) | `metadataService.deleteModule()` — ModuleBuilder delete action. |
| GET `/api/metadata/objects` | List objects (optional `?module_id`). | JWT (`authenticate`) | `metadataService.getObjects(moduleId)` — ModuleBuilder, FormBuilder, WizardBuilder, PipelineBuilder. |
| GET `/api/metadata/objects/:id` | Fetch one object. | JWT (`authenticate`) | `metadataService.getObject(id)`. |
| POST `/api/metadata/objects` | Create an object. | Admin (`requireAdmin`) | `metadataService.createObject()` — ModuleBuilder object create. |
| PUT `/api/metadata/objects/:id` | Update an object. An API-name rename is refused (400) while the object has records or references, for built-in CRM object names, or if the name is taken; label changes are always allowed. | Admin (`requireAdmin`) | `metadataService.updateObject()` — ModuleBuilder object edit. |
| DELETE `/api/metadata/objects/:id` | Delete an object. Refused (400) while it holds any records (live or in the Trash) or other objects reference it. | Admin (`requireAdmin`) | `metadataService.deleteObject()` — ModuleBuilder object delete. |
| GET `/api/metadata/fields` | List fields for `?object_id`. | JWT (`authenticate`) | `metadataService.getFields(objectId)` — ModuleBuilder field list, ImportPage column mapping (`frontend/src/pages/runtime/ImportPage.jsx`). |
| GET `/api/metadata/fields/:id` | Fetch one field. | JWT (`authenticate`) | `metadataService.getField(id)`. |
| GET `/api/metadata/fields/:id/usages` | What blocks a rename or delete: `{ usages: string[], records_with_value: number }` (from `metadata-dependencies.js` `fieldUsages`). | Admin (`requireAdmin`) | `metadataService.getFieldUsages(id)` — ModuleBuilder Edit Field ("used by") and Delete Field dialogs. |
| POST `/api/metadata/fields` | Create a field. | Admin (`requireAdmin`) | `metadataService.createField()` — ModuleBuilder field create and FormBuilder inline field add. |
| PUT `/api/metadata/fields/:id` | Update a field. Refused (400) for: an API-name rename while the field is used, with an unsafe or taken name, or on a built-in CRM column (an allowed rename carries stored values to the new name); an `object_id` change; removing picklist values records still hold, unless the body carries `option_replacements: { "<removed>": "<remaining>" }`, which moves those records. Label changes are always allowed. | Admin (`requireAdmin`) | `metadataService.updateField()` — ModuleBuilder field edit. |
| DELETE `/api/metadata/fields/:id` | Delete a field. Refused (400) while the field is used (deactivate it instead). | Admin (`requireAdmin`) | `metadataService.deleteField()` — ModuleBuilder field delete. |
| GET `/api/metadata/forms` | List forms (optional `?object_id`). | JWT (`authenticate`) | `metadataService.getForms(objectId)` — FormBuilder, RecordFormPage (`frontend/src/pages/runtime/RecordFormPage.jsx`). |
| GET `/api/metadata/forms/:id` | Fetch one form in full (fields + layout). | JWT (`authenticate`) | `metadataService.getForm(id)`. |
| POST `/api/metadata/forms` | Create a form. | Admin (`requireAdmin`) | `metadataService.createForm()` — FormBuilder save (`frontend/src/pages/builder/FormBuilderPage.jsx`). |
| PUT `/api/metadata/forms/:id` | Update a form. | Admin (`requireAdmin`) | `metadataService.updateForm()` — FormBuilder save (existing form). |
| DELETE `/api/metadata/forms/:id` | Delete a form. | Admin (`requireAdmin`) | `metadataService.deleteForm()` — FormBuilder delete. |
| PUT `/api/metadata/forms/:id/layout` | Bulk-update field positions in a form; returns the full form. | Admin (`requireAdmin`) | `metadataService.saveFormLayout(id, layouts)` — FormBuilder drag-and-drop layout save (`FormBuilderPage.jsx`). |
| GET `/api/metadata/validations` | List validations for `?field_id`. | JWT (`authenticate`) | Service method `metadataService.getValidations(fieldId)` is defined but no direct UI caller was found. |
| POST `/api/metadata/validations` | Create a validation rule. | Admin (`requireAdmin`) | Service method `metadataService.createValidation()` is defined but no direct UI caller was found. |
| PUT `/api/metadata/validations/:id` | Update a validation rule. | Admin (`requireAdmin`) | Service method `metadataService.updateValidation()` is defined but no direct UI caller was found. |
| DELETE `/api/metadata/validations/:id` | Delete a validation rule. | Admin (`requireAdmin`) | Service method `metadataService.deleteValidation()` is defined but no direct UI caller was found. |
| GET `/api/metadata/dependencies` | List field dependencies for `?field_id` (or `?form_id`). | JWT (`authenticate`) | Service methods `metadataService.getDependencies()/getDepsForForm()` are defined but no direct UI caller was found. |
| POST `/api/metadata/dependencies` | Create a field dependency. | Admin (`requireAdmin`) | Service method `metadataService.createDependency()` is defined but no direct UI caller was found. |
| PUT `/api/metadata/dependencies/:id` | Update a field dependency. | Admin (`requireAdmin`) | Service method `metadataService.updateDependency()` is defined but no direct UI caller was found. |
| DELETE `/api/metadata/dependencies/:id` | Delete a field dependency. | Admin (`requireAdmin`) | Service method `metadataService.deleteDependency()` is defined but no direct UI caller was found. |

---

## Search  ·  `/api/search`

A single global full-text search endpoint backed by `SearchService`, scoped to the viewer (`req.user`) for
tenant/permission filtering. Requires a JWT (`authenticate`). Source: `backend/src/routes/search/index.js`.

| Method & Path | Purpose / Relevance | Auth | When & how it's invoked |
|---|---|---|---|
| GET `/api/search` | Global search: `?q=<query>&limit=<n>` (limit capped at 50, default 20); empty `q` returns `[]`. | JWT (`authenticate`) | Debounced typing in the global search bar via `searchService.search()` (`frontend/src/components/ui/GlobalSearch.jsx`). |

---

## Integrations (inbound)  ·  `/api/integrations`

Public inbound-webhook receiver that lets **external systems** (e.g. Stripe, GitHub, custom sources) push payloads into
Genesis. Intentionally **unauthenticated** (external callers can't hold JWTs); security comes from an optional
per-integration HMAC-SHA256 shared secret verified against the `X-Signature-256` header. A `preParsing` hook captures
the exact raw body bytes so signature verification is byte-accurate. **Hardened** with a 1 MB body cap, a Redis
rate limit (120/min per integration+IP), and Redis idempotency/replay dedup (24 h). Source:
`backend/src/routes/integration-inbound/index.js`.

| Method & Path | Purpose / Relevance | Auth | When & how it's invoked |
|---|---|---|---|
| POST `/api/integrations/inbound/:name` | Receive an inbound webhook for the named `inbound_webhook` integration; logs the event (in the owning tenant's context) and verifies HMAC if `config.secret` is set. On success it **bridges** the event into the app: runs any workflow mapped in `config.event_map` (`{ eventName: workflowId }`) and re-publishes the event onto the domain bus. **Replays/duplicates** (same `Idempotency-Key` / signature / body within 24 h) return `200 { duplicate: true }` without re-processing. Returns `200` (log id + status), `401` signature error, `413` body > 1 MB, `429` rate-limited, `400` other errors. | Public (HMAC-verified) | **Webhook — not a frontend caller.** Invoked by external/third-party systems posting to the integration's configured URL; no `frontend/src` caller (server-side/external use). |

---

**Total endpoints documented: 52** (Auth 21 · Metadata 29 · Search 1 · Integrations 1).

## Builder  ·  `/api/builder`

The Builder API is the admin/config surface for Genesis CRM's metadata-driven, low-code UI. It backs the "Builder"
section of the app (`frontend/src/pages/builder/*`, reached from the Sidebar) where administrators design the runtime
experience: dashboards & widgets, charts, sales pipelines, automation workflows, multi-step wizards, entity/operational
permissions, assignment rules, sales quotas, outbound integrations, and ad-hoc push notifications. Every endpoint
carries a JWT preHandler: **read** endpoints (GET) use `authenticate` (any logged-in user — the runtime UI also consumes
some of these, e.g. charts/pipelines/permissions lookups), while all **mutating** endpoints (POST/PUT/DELETE) use
`requireAdmin`, which additionally gates on admin role. Handlers are thin wrappers delegating to `DashboardService`,
`PermissionService`, `AssignmentService`, `IntegrationService`, `ForecastService`, `NotificationService`, and the shared
`WorkflowEngineService`. The near-universal frontend client is `frontend/src/services/builder.service.js`
(`builderService.*`). Note: despite the task brief, this route file exposes **no** Modules / Objects / Fields / Forms
endpoints — those live under `/api/metadata` (the builder service proxies to `/metadata/forms` for the wizard step
picker). Full backend file: `backend/src/routes/builder/index.js`.

### Dashboards & Roles

| Method & Path | Purpose / Relevance | Auth | When & how it's invoked |
|---|---|---|---|
| GET `/api/builder/dashboards` | List all dashboards (builder context: admins see ALL regardless of `min_role`) | authenticate | `DashboardBuilderPage`, `BuilderHome`, and `PermissionsBuilderPage` load the dashboard list on mount (`builderService.getDashboards`) |
| GET `/api/builder/roles` | Active role list (name/label/level) for the "Visible to" dropdown | authenticate | `DashboardBuilderPage` (and other builders) populate role pickers via `getRoles` |
| GET `/api/builder/dashboards/:id` | Fetch a single dashboard with widgets | authenticate | Opening a dashboard for editing (`getDashboard`) |
| POST `/api/builder/dashboards` | Create dashboard (stamps `created_by` from JWT) | requireAdmin | "Save" in Dashboard Builder when creating a new dashboard (`createDashboard`) |
| PUT `/api/builder/dashboards/:id` | Update dashboard metadata | requireAdmin | Saving edits to an existing dashboard (`updateDashboard`) |
| DELETE `/api/builder/dashboards/:id` | Delete dashboard (204) | requireAdmin | "Delete" on a dashboard card (`deleteDashboard`) |

### Widgets

| Method & Path | Purpose / Relevance | Auth | When & how it's invoked |
|---|---|---|---|
| POST `/api/builder/dashboards/:id/widgets` | Add a widget to a dashboard | requireAdmin | `DashboardBuilderPage` after save, adds each configured widget (`addWidget`) |
| PUT `/api/builder/widgets/:id` | Update a widget config | requireAdmin | Editing a widget in the dashboard canvas (`updateWidget`) |
| DELETE `/api/builder/widgets/:id` | Delete a widget (204) | requireAdmin | Removing a widget (`deleteWidget`) |
| PUT `/api/builder/widget-positions` | Bulk-update widget positions after drag-and-drop | requireAdmin | Persisting layout after DnD reflow (`saveWidgetPositions`, body `{ positions }`) |

### Charts

| Method & Path | Purpose / Relevance | Auth | When & how it's invoked |
|---|---|---|---|
| GET `/api/builder/charts` | List all chart definitions | authenticate | Chart pickers / widget config load available charts (`getCharts`) |
| GET `/api/builder/charts/:id` | Fetch a single chart definition | authenticate | Editing a chart (`getChart`) |
| POST `/api/builder/charts` | Create a chart | requireAdmin | Saving a new chart (`createChart`) |
| PUT `/api/builder/charts/:id` | Update a chart | requireAdmin | Saving chart edits (`updateChart`) |
| DELETE `/api/builder/charts/:id` | Delete a chart (204) | requireAdmin | Deleting a chart (`deleteChart`) |

### Pipelines

| Method & Path | Purpose / Relevance | Auth | When & how it's invoked |
|---|---|---|---|
| GET `/api/builder/pipelines` | List pipelines, optional `?object_id=` filter | authenticate | `PipelineBuilderPage` loads the pipeline list (`getPipelines`) |
| GET `/api/builder/pipelines/:id` | Fetch one pipeline with stages | authenticate | Opening a pipeline to edit (`getPipeline`) |
| POST `/api/builder/pipelines` | Create a pipeline | requireAdmin | "New pipeline" save (`createPipeline`) |
| PUT `/api/builder/pipelines/:id` | Update pipeline + stages together. Removing a stage is refused (400) while live records sit in it | requireAdmin | Saving pipeline & its stages (`updatePipelineWithStages`) |
| DELETE `/api/builder/pipelines/:id` | Delete a pipeline (204). Refused (400) while live records are on it | requireAdmin | Deleting a pipeline (`deletePipeline`) |

### Trash (admin record recovery)

Records that users soft-deleted (when their object's pipeline has `config.delete_mode` = `soft`) are recoverable here. Admin-only; end users have no visibility into the Trash.

| Method & Path | Purpose / Relevance | Auth | When & how it's invoked |
|---|---|---|---|
| GET `/api/builder/pipelines/:id/audit` | Pipeline config change history (create/update/delete), newest-first, with actor names | requireAdmin | `PipelineBuilderPage` **History** modal (`getPipelineAudit`) |
| GET `/api/builder/trash/records` | List soft-deleted records, hydrated with CRM/EAV data; optional `?object_id=` filter | requireAdmin | `RecordsTrashPage` loads the Trash (`getTrashedRecords`) |
| POST `/api/builder/trash/records/:id/restore` | Restore a trashed record to its object's live list. Writes a `restore` audit entry | requireAdmin | "Restore" in `RecordsTrashPage` (`restoreRecord`) |
| DELETE `/api/builder/trash/records/:id` | Permanently delete a trashed record; **must already be in the Trash** (204). Writes a `purge` audit entry (kept after the row is gone) | requireAdmin | "Delete permanently" in `RecordsTrashPage` (`purgeRecord`) |

> **Audit:** every mutating action on pipeline data is recorded in `audit_logs`, attributed to the acting user — record create/update/stage-change (single + bulk), delete (soft/hard), restore, purge, and pipeline config create/update/delete. See [Database schema → audit_logs](DATABASE_SCHEMA.md#audit_logs).

### Workflows

| Method & Path | Purpose / Relevance | Auth | When & how it's invoked |
|---|---|---|---|
| GET `/api/builder/workflows` | List workflows, optional `?object_id=` filter | authenticate | `WorkflowBuilderPage`, `BuilderHome`, `PermissionsBuilderPage` load workflows (`getWorkflows`) |
| GET `/api/builder/workflows/:id` | Fetch one workflow with steps | authenticate | Opening a workflow to edit (`getWorkflow`) |
| POST `/api/builder/workflows` | Create a workflow | requireAdmin | "New workflow" save (`createWorkflow`) |
| PUT `/api/builder/workflows/:id` | Update workflow metadata/trigger | requireAdmin | Saving workflow edits (`updateWorkflow`) |
| DELETE `/api/builder/workflows/:id` | Delete a workflow (204) | requireAdmin | Deleting a workflow (`deleteWorkflow`) |
| POST `/api/builder/workflows/:id/run` | Manually execute a workflow for testing; optional body `{ record_id }`; returns `{ steps_executed, log }` via `WorkflowEngineService.manualRun` | requireAdmin | "Run/Test" button in the Workflow Builder to dry-run an automation |

### Workflow Steps

| Method & Path | Purpose / Relevance | Auth | When & how it's invoked |
|---|---|---|---|
| POST `/api/builder/workflows/:id/steps` | Add a step to a workflow | requireAdmin | Adding a step in `WorkflowBuilder` canvas (`addWorkflowStep`) |
| PUT `/api/builder/workflow-steps/:id` | Update a workflow step | requireAdmin | Editing a step (`updateWorkflowStep`) |
| DELETE `/api/builder/workflow-steps/:id` | Delete a workflow step (204) | requireAdmin | Removing a step (`deleteWorkflowStep`) |

### Wizards

| Method & Path | Purpose / Relevance | Auth | When & how it's invoked |
|---|---|---|---|
| GET `/api/builder/wizards` | List wizards, optional `?object_id=` filter | authenticate | `WizardBuilderPage` loads the wizard list (`getWizards`) |
| GET `/api/builder/wizards/:id` | Fetch one wizard with steps | authenticate | Opening a wizard to edit (`getWizard`) |
| POST `/api/builder/wizards` | Create a wizard | requireAdmin | "New wizard" save (`createWizard`) |
| PUT `/api/builder/wizards/:id` | Update wizard metadata | requireAdmin | Saving wizard edits (`updateWizard`) |
| DELETE `/api/builder/wizards/:id` | Delete a wizard (204) | requireAdmin | Deleting a wizard (`deleteWizard`) |

### Wizard Steps

| Method & Path | Purpose / Relevance | Auth | When & how it's invoked |
|---|---|---|---|
| POST `/api/builder/wizards/:id/steps` | Add a step to a wizard | requireAdmin | Adding a step in `WizardBuilder` (`addWizardStep`) |
| PUT `/api/builder/wizard-steps/:id` | Update a wizard step | requireAdmin | Editing a wizard step (`updateWizardStep`) |
| DELETE `/api/builder/wizard-steps/:id` | Delete a wizard step (204) | requireAdmin | Removing a wizard step (`deleteWizardStep`) |
| PUT `/api/builder/wizards/:id/reorder` | Reorder a wizard's steps (body `{ steps }`) | requireAdmin | Drag-reordering wizard steps (`reorderWizardSteps`) |

### Permissions

| Method & Path | Purpose / Relevance | Auth | When & how it's invoked |
|---|---|---|---|
| GET `/api/builder/permissions/:entityType/:entityId` | Get all role-permission rows for a metadata entity (`module\|object\|field\|form\|pipeline\|wizard`) + full role list for the UI | authenticate | `PermissionsBuilderPage` loads permission matrix for the selected entity |
| PUT `/api/builder/permissions/:entityType/:entityId` | Upsert role permissions (body `{ permissions:[{role_name,can_view,can_edit}] }`); validates entityType against module/object/field/form/pipeline/wizard/dashboard/workflow | requireAdmin | Saving the entity permission matrix in `PermissionsBuilderPage` |
| GET `/api/builder/permissions/operational` | Operational permissions (`?entity_type=task\|activity`), merged with per-role defaults so the grid is always complete | authenticate | `PermissionsBuilderPage` operational tab loads task/activity scopes |
| PUT `/api/builder/permissions/operational/:entityType/:roleName` | Set a role's operational scopes (body `{ view_scope, create_scope, edit_scope, delete_scope, assign_scope }`); entityType ∈ task/activity/record | requireAdmin | Saving an operational scope row in `PermissionsBuilderPage` |

### Assignment Rules

| Method & Path | Purpose / Relevance | Auth | When & how it's invoked |
|---|---|---|---|
| GET `/api/builder/assignment-rules` | List assignment rules, optional `?object_id=` | authenticate | `AssignmentBuilderPage` loads rules for the selected object (`getAssignmentRules`) |
| GET `/api/builder/assignment-rules/:id` | Fetch one rule | authenticate | Opening a rule to edit (`getRule` — no explicit service wrapper; loaded via list) |
| POST `/api/builder/assignment-rules` | Create an assignment rule | requireAdmin | "New rule" save (`createAssignmentRule`) |
| PUT `/api/builder/assignment-rules/:id` | Update a rule | requireAdmin | Saving rule edits (`updateAssignmentRule`) |
| DELETE `/api/builder/assignment-rules/:id` | Delete a rule (204) | requireAdmin | Deleting a rule (`deleteAssignmentRule`) |
| PUT `/api/builder/assignment-rules/reorder` | Bulk reorder rules for an object (body `{ object_id, ordered_ids }`) | requireAdmin | Drag-reordering rule priority (`reorderAssignmentRules`) |
| POST `/api/builder/assignment-rules/explain` | Dry run of `assign()` for `{ object_id, record_id? \| fields? }`: every active rule in order with outcome and reason, failed conditions with actual values, the open-load table for a load-balanced pick, deactivated pool members skipped, then the decision. Writes nothing; peeks the round-robin cursor. | requireAdmin | "Test these rules" panel in `AssignmentBuilderPage` (`explainAssignment`) |
| GET `/api/builder/assignment-logs` | Assignment audit log (`?record_id=&object_id=`) | authenticate | Viewing assignment history in `AssignmentBuilderPage` (`getAssignmentLogs`) |

### Quotas

| Method & Path | Purpose / Relevance | Auth | When & how it's invoked |
|---|---|---|---|
| GET `/api/builder/quotas` | List sales quotas (query filters, e.g. `object_id`) | authenticate | `ForecastPage` (runtime) loads quotas for the object (`getQuotas`) |
| POST `/api/builder/quotas` | Create/set a quota | requireAdmin | Setting a quota in the forecast/quota UI (`setQuota`) |
| DELETE `/api/builder/quotas/:id` | Delete a quota (204) | requireAdmin | Removing a quota (`deleteQuota`) |

### Integrations

Outbound integrations are **event-driven**: `IntegrationService` subscribes to the in-process `DomainEventBus`, and
each CRM domain event (`record.created` / `record.updated` / `record.deleted` / `record.field_changed`, published by
the record/CRM **service layer** — `RecordService`/`CrmService`) is fanned out to every active integration whose
`config.events` subscribes to it. The workflow engine subscribes to the same events, so one mutation drives both. Deliveries send a versioned envelope, are signed with HMAC-SHA256 when `config.secret` is set, treat any non-2xx
as a failure, and retry transient failures with exponential backoff. There is no dedicated HTTP endpoint to fire an
event — it happens automatically; `.../:id/test` below is only for manual verification. (`triggerByType(type, payload)`
remains in the service for backward compatibility but is superseded by event subscriptions.)

| Method & Path | Purpose / Relevance | Auth | When & how it's invoked |
|---|---|---|---|
| GET `/api/builder/integrations` | List integrations | **requireAdmin** | `IntegrationBuilderPage` & `IntegrationHealthPage` load the integration list (`getIntegrations`). Admin-gated: rows carry signing secrets / outbound auth headers |
| GET `/api/builder/integrations/event-catalog` | Metadata-driven event catalog: generic `record.*` events + a per-object variant (`lead.created`, …) for every active object | **requireAdmin** | Subscription picker in `IntegrationBuilderPage` (`getIntegrationEventCatalog`) |
| GET `/api/builder/integrations/:id` | Fetch one integration | **requireAdmin** | Opening an integration to edit (`getIntegration`) |
| POST `/api/builder/integrations` | Create an integration | requireAdmin | "New integration" save (`createIntegration`) |
| PUT `/api/builder/integrations/:id` | Update an integration | requireAdmin | Saving integration edits (`updateIntegration`) |
| DELETE `/api/builder/integrations/:id` | Delete an integration (204) | requireAdmin | Deleting an integration (`deleteIntegration`) |
| POST `/api/builder/integrations/:id/toggle` | Activate/deactivate (body `{ is_active }`) | requireAdmin | Toggle switch on an integration (`toggleIntegration`) |
| POST `/api/builder/integrations/:id/test` | Fire a test payload through the integration | requireAdmin | "Test" button in `IntegrationBuilderPage` (`testIntegration`) |
| GET `/api/builder/integrations/:id/logs` | Recent execution logs (`?limit=`) | **requireAdmin** | Log panel in `IntegrationHealthPage` (`getIntegrationLogs`) |
| GET `/api/builder/integrations/:id/stats` | Execution health summary: `{ total, success, errors, error_rate (0..1), avg_duration_ms, last_run }` | **requireAdmin** | Health metrics in `IntegrationHealthPage` (`getIntegrationStats`) |
| POST `/api/builder/integrations/logs/:logId/retry` | Re-run a failed execution log | requireAdmin | "Retry" on a failed log row (`retryIntegrationLog`) |

### Push Notifications

| Method & Path | Purpose / Relevance | Auth | When & how it's invoked |
|---|---|---|---|
| GET `/api/builder/push-notifications` | History of sent push notifications (latest 100) | requireAdmin | `PushNotificationsPage` loads send history (`getPushNotifications`) |
| POST `/api/builder/push-notifications` | Send an ad-hoc push notification; resolves recipients by `target_type` (`all\|role\|employee`) via `NotificationService.broadcastNotification`, then logs it | requireAdmin | "Send" in `PushNotificationsPage` (`sendPushNotification`, body `{ title, body, link, target_type, target_value }`) |

### Formulas and public web forms

| Method & Path | Purpose / Relevance | Auth | When & how it's invoked |
|---|---|---|---|
| POST `/api/builder/formula/check` | Parse a formula; body `{ expression }`. Returns `{ error, functions }` (`error` null when valid). | Admin | `builderService.checkFormula` — `FormulaEditor.jsx` as the admin types. |
| POST `/api/builder/forms/:id/publish` | Publish a form as a public web form, or update its settings; body `{ success_message?, consent_field?, consent_text_version?, capture_fields?, result_fields?, stage?, channel?, captcha?, rotate? }` (`rotate: true` issues a new key). Returns `{ id, public_key, path, settings }`. Audited to the chain. | Admin | `builderService.publishForm` — Form Builder ▸ **Public web form**. |
| DELETE `/api/builder/forms/:id/publish` | Take the form offline; the key stops working. 204. Audited. | Admin | `builderService.unpublishForm`. |

`PUT /api/metadata/forms/:id` cannot set `config` or `public_key`; publishing is only through these routes.

## Runtime  ·  `/api/runtime`

The Runtime API is the data plane used by end-users of the CRM runtime renderer. It serves fully-resolved,
permission-filtered metadata (modules/objects/forms/wizards/pipelines/dashboards) plus generic per-object record CRUD,
pipeline stage moves (with lead-conversion automation), status timelines, imports, quota/forecast, workflow approvals,
first-class CRM relational entities (leads/contacts/accounts/opportunities/cases/associations), products, and
system announcements. Route file: `backend/src/routes/runtime/index.js`, mounted at prefix `/api/runtime`.

**Auth:** Every endpoint is guarded by the `authenticate` preHandler (JWT Bearer token → `req.user` with `employee_id`,
`role`, `tenant_id`). There is no anonymous access. Beyond authentication, metadata reads are additionally
role/tenant-filtered through `PermissionService` (returns 404 when the viewer lacks `can_view`), and record reads/writes
are ownership/role-scoped inside `RecordService`. Most metadata responses are Redis-cached (TTL ~1h). Primary frontend
callers: `frontend/src/services/metadata.service.js` (bootstrap, metadata, records, products),
`frontend/src/services/runtime.service.js` (forecast, import, assign), `frontend/src/services/statusEvent.service.js`
(status timeline), and `frontend/src/components/layout/AnnouncementBanner.jsx` (announcements). The CRM relational
endpoints (`/crm/*`) have no direct frontend caller.

### Metadata & Bootstrap

| Method & Path | Purpose / Relevance | Auth | When & how it's invoked |
|---|---|---|---|
| GET `/api/runtime/bootstrap` | Single-request load of all role-filtered metadata: `{ modules, objects, forms, wizards, pipelines, resolvedNames }`. Warms the frontend runtime cache in one round-trip. | JWT + per-entity `PermissionService` filtering | `metadataService.bootstrap()` — called once at app startup to seed the runtime renderer's metadata store. |
| GET `/api/runtime/modules` | Lists active modules visible to the viewer's role, each with permission-filtered nested objects. | JWT + role filter | `metadataService.getModules()` — navigation/sidebar module list. |
| GET `/api/runtime/module/:id` | Full module with permission-filtered objects; 404 if not viewable. Includes `_can_edit`. | JWT + `getEffectiveUiPermission('module')` | `metadataService.getModule(id)` — opening a module. |
| GET `/api/runtime/object/:id` | Full object with role-filtered fields + attached pipelines; 404 if not viewable. Includes `_can_edit`. | JWT + `getEffectiveUiPermission('object')` | `metadataService.getObject(id)` — rendering an object's list/detail views. |
| GET `/api/runtime/form/:id` | Role-filtered form metadata (field layouts + dependencies). | JWT + role-filtered form viewer | `metadataService.getForm(id)` / `getFormFull(id)` — rendering a record create/edit form. |
| GET `/api/runtime/dashboard/:id` | Dashboard with widgets; unified UiPermission check plus legacy `min_role` fallback; 404 if not viewable. | JWT + `getEffectiveUiPermission('dashboard')` + `min_role` | `metadataService.getDashboard(id)` — opening a dashboard. |
| GET `/api/runtime/dashboards` | Lists dashboards visible to the viewer (UiPermission + `min_role` filter). | JWT + role filter | `metadataService.getDashboards()` — dashboard picker/menu. |
| GET `/api/runtime/wizards` | Lists wizards, optionally filtered by `object_id`; role-filtered. | JWT + role filter | `metadataService.getWizards(objectId)` — multi-step create wizard discovery. |
| GET `/api/runtime/wizard/:id` | Wizard with all step forms; 404 if not viewable. Includes `_can_edit`. | JWT + `getEffectiveUiPermission('wizard')` | `metadataService.getWizard(id)` — launching a create wizard. |
| GET `/api/runtime/pipeline/:id` | Pipeline with stages; 404 if not viewable. Includes `_can_edit`. | JWT + `getEffectiveUiPermission('pipeline')` | `metadataService.getPipeline(id)` — rendering a Kanban board. |
| GET `/api/runtime/resolve?object=<name>` | Resolves an object name → `{ object_id, module_id, first_stage_id, pipeline_id, wizard_id }` so the UI avoids hardcoding auto-increment IDs. | JWT | `metadataService.resolveObject(name)` — deep-links / routing by object name. |

### Records CRUD

| Method & Path | Purpose / Relevance | Auth | When & how it's invoked |
|---|---|---|---|
| GET `/api/runtime/records?object_id=X[&stage_id=Y]` | Lists records for an object (optionally one pipeline stage), ownership/role scoped. | JWT + `RecordService` scoping | `metadataService.getRecords(objectId)` — object list page / Kanban column load. |
| GET `/api/runtime/records/:id` | Single record with resolved field values; enforces view access. | JWT + `RecordService` scoping | `metadataService.getRecord(id)` — record detail/drawer. |
| POST `/api/runtime/records` | Creates a record (coerces `object_id` to int against injection); body `{ object_id, stage_id?, assigned_to?, data }`. Returns 201. | JWT | `metadataService.createRecord(data)` — form/wizard submit to create a new record. |
| PUT `/api/runtime/records/:id` | Updates a record's field values / assignee; body `{ assigned_to?, data }`. | JWT | `metadataService.updateRecord(id, data)` — edit form submit. |
| PATCH `/api/runtime/records/:id/stage` | Moves a record to a pipeline stage (body `{ stage_id }`); used by Kanban drag-and-drop. Stage gates run first: a missing required field or a false entry rule answers **400** `{ error: { code: 'VALIDATION_ERROR', message, details: [{ field, label, message }] } }`, the message naming fields by label ("Complete LMS reference before moving to Booked"). On success the pipeline's mirrored status field (`config.status_field`) is updated too; audit, status timeline, `record.updated` and `record.field_changed` follow. Returns the record with `pipeline_stage`. | JWT | `metadataService.updateRecordStage` — Kanban drop (`ModulePage`), record panel stage bar. |
| DELETE `/api/runtime/records/:id` | Deletes a record; 204. **Soft** (moves to admin Trash, recoverable) or **hard** (permanent) per the record's pipeline `config.delete_mode` (resolved in `RecordService`) — the deleting user never sees the mode, the record just disappears from their list. | JWT | `metadataService.deleteRecord(id)` — delete action on list/detail. |
| POST `/api/runtime/records/bulk-delete` | Deletes many records; body `{ ids }`. Resolves soft/hard per record from its pipeline, same as the single delete. | JWT | `metadataService.bulkDeleteRecords(ids)` — multi-select "Delete" on list page. |
| POST `/api/runtime/records/bulk-stage` | Moves many records to a stage; body `{ ids, stage_id }`. | JWT | `metadataService.bulkUpdateRecordStage(ids, stageId)` — multi-select "Change stage". |
| POST `/api/runtime/records/bulk-assign` | Reassigns many records; body `{ ids, assigned_to }` (an active employee, or null). Audited per record. | JWT + manager | `metadataService.bulkAssignRecords` — multi-select "Reassign". |
| POST `/api/runtime/records/:id/merge` | Merge this (duplicate) record into `{ into }`: fills empty fields, re-points lookups, trashes the duplicate; change set stored on the audit chain. | JWT + manager | `RecordMerge.jsx` — record panel "Merge". |
| POST `/api/runtime/records/:id/unmerge` | Reverse a merge within 30 days. | JWT + manager | Trash ▸ "Reverse merge". |
| POST `/api/runtime/records/:id/reveal` | Body `{ field }`. Returns the unmasked value of a `pii` field to a user with `view_pii`; audited to the chain. | JWT + `view_pii` | `FieldValue.jsx` — *Reveal*. |
| GET `/api/runtime/records/export?object_id=X` | Streams a CSV export of the object's records (attachment). | JWT + `RecordService` scoping | `metadataService.exportRecords(...)` (via `apiWrapper.blob`) — "Export CSV" button on list page. |
| GET `/api/runtime/records/:id/audit` | Returns the record's last 50 audit-log entries (with actor); asserts view access first. | JWT | `metadataService.getRecordAudit(id)` — "History/Audit" tab on record detail. |

### Lookups, related lists and record actions

| Method & Path | Purpose / Relevance | Auth | When & how it's invoked |
|---|---|---|---|
| GET `/api/runtime/records/:id/related` | Every record that points at this one through a lookup field, grouped by object and field, filtered by the viewer's access. | JWT + `RecordService` scoping | `metadataService.getRelated(id)` — the **Related** tab (`RelatedPanel.jsx`). |
| GET `/api/runtime/lookup/:objectName?q=&limit=` / `?id=` | Search the target object's records by title, or resolve one id to its title. Scoped like the list. | JWT + scoping | `metadataService.searchLookup(...)` — `RecordPicker.jsx` for lookup fields. |
| GET `/api/runtime/objects/:id/actions` | Active manual workflows on the object (record action buttons). | JWT | `metadataService.getObjectActions(objectId)` — `RecordActions.jsx`. |
| POST `/api/runtime/records/:id/actions/:workflowId` | Run a manual workflow on a record. Re-checks that the caller can see and edit the record and that the workflow is a manual workflow of the record's object. Returns the step log. | JWT + edit access | `metadataService.runRecordAction(id, workflowId)` — a record action button. |

Record writes also: compute formula fields, enforce `expression` validation rules and stage gates (`PATCH …/stage` and `bulk-stage` answer **400** with the gate's message), and stamp `business_unit_id` / `barrier_zone_id`. Records outside the viewer's unit or barrier scope answer **404**.

### Status Timeline (status_tracker)

| Method & Path | Purpose / Relevance | Auth | When & how it's invoked |
|---|---|---|---|
| GET `/api/runtime/records/:id/status-events` | Returns the record's status timeline, newest-first (UPS/Amazon-style tracker). | JWT + `RecordService` scoping | `statusEventService.list(recordId)` — rendering a `status_tracker` field. |
| POST `/api/runtime/records/:id/status-events` | Appends a status event; body `{ status, title?, description?, location?, event_type?, occurred_at? }` (`status` required). | JWT | `statusEventService.add(recordId, data)` — adding a tracking update on a record. |

### Assignment

| Method & Path | Purpose / Relevance | Auth | When & how it's invoked |
|---|---|---|---|
| POST `/api/runtime/records/:id/assign` | Re-runs the assignment engine for a record and returns the chosen assignee; getRecord enforces access before re-assign. | JWT + `RecordService` access check | `runtimeService.assignRecord(recordId)` — "Re-assign / Auto-assign" action on a record. |

### Pipeline Automation (Lead Convert)

| Method & Path | Purpose / Relevance | Auth | When & how it's invoked |
|---|---|---|---|
| POST `/api/runtime/records/:id/convert-to-prospect` | **Lead → Prospect** convert-by-record-ID: finds (or synthesizes from EAV) the linked `crm_lead_intake` row and creates a `crm_leads` (Prospect) record from it via `CrmService.convertLeadToProspect`; marks the lead converted + links `converted_prospect_id`. 201; 409 if already converted. | JWT | `metadataService.convertToProspect(recordId)` — "Convert to Prospect" button on a **Lead** record. Also auto-fired when a lead is dragged to the "Converted" stage. |
| POST `/api/runtime/records/:id/convert-lead` | **Prospect → Client** convert-by-record-ID: finds (or synthesizes from EAV) the linked `crm_leads` row, converts it to account/contact, and copies mapped prospect→client EAV fields. 201; 409 if already converted; **400 `{ error, missing_fields }` if required Prospect fields are incomplete** (required-field gating). | JWT | `metadataService.convertLead(recordId, options)` — "Convert" button on a prospect record. |

### Workflows

| Method & Path | Purpose / Relevance | Auth | When & how it's invoked |
|---|---|---|---|
| POST `/api/runtime/workflows/approval/:token` | Decide a pending approval; body `{ action: 'approve' \| 'reject', comment? }`. Only an approver named when the request was created may act; the decision, decider, time and comment are stored and written to the record's history. Unknown, already decided or not-yours answers 400. | JWT | `runtimeService.decideApproval` — **Tools ▸ Approvals** (`ApprovalsPage.jsx`). |
| GET `/api/runtime/workflows/approvals?scope=mine\|all\|decided` | The approvals inbox: requests waiting for the user (`mine`), every pending request (`all`, managers and administrators), or the user's decisions (`decided`). Each item has title, message, workflow, requester, approvers, record link and decision details. | JWT | `runtimeService.getApprovals` — Approvals page and the sidebar count. |

### Forecast / Quotas

| Method & Path | Purpose / Relevance | Auth | When & how it's invoked |
|---|---|---|---|
| GET `/api/runtime/forecast?object_id=X[&value_field=&assigned_to=]` | Generic EAV-based forecast/quota rollup for an object. | JWT | `runtimeService.getForecast(objectId, params)` — Forecast/Quota widget for an individual. |
| GET `/api/runtime/forecast/team?manager_id=X&object_id=Y` | Team-level forecast rollup under a manager. | JWT | `runtimeService.getTeamForecast(managerId, objectId, params)` — manager's team forecast view. |
| GET `/api/runtime/crm/forecast` | SQL-based relational forecast over migrated `crm_opportunities` (faster than generic `/forecast`). | JWT | **No direct frontend caller found** (`crmSvc.computeRelationalForecast`); intended for pipeline/opportunity forecasting once opportunities are relational. |

### Import

| Method & Path | Purpose / Relevance | Auth | When & how it's invoked |
|---|---|---|---|
| GET `/api/runtime/import/jobs?object_id=X` | Lists import jobs for an object. | JWT | `runtimeService.listImportJobs(objectId)` — import history in the import wizard. |
| GET `/api/runtime/import/jobs/:id` | Fetches one import job (status/progress). | JWT | `runtimeService.getImportJob(id)` — polling job status. |
| POST `/api/runtime/import/jobs` | Creates an import job; body `{ object_id, filename? }`. 201. | JWT | `runtimeService.createImportJob(body)` — step 1 of the CSV import wizard. |
| POST `/api/runtime/import/jobs/:id/preview` | Previews mapped/deduped rows; body `{ csv_data(base64), field_mapping, dedupe_keys, strategy }`. | JWT | `runtimeService.previewImport(id, body)` — mapping/preview step of the import wizard. |
| POST `/api/runtime/import/jobs/:id/execute` | Executes the import; body `{ csv_data(base64) }`. Returns `{ created, merged, skipped, failed, total }`; a row failing validation does not abort the run — failed rows are stored on the job as `error_rows: [{ row, reason }]` (1-based, first 100). Builder-object rows go through `RecordService.createRecord`. | JWT | `runtimeService.executeImport(id, body)` — final "Import" step of the wizard. |

### CRM Relational — Leads

| Method & Path | Purpose / Relevance | Auth | When & how it's invoked |
|---|---|---|---|
| GET `/api/runtime/crm/leads` | Lists CRM leads (query filters). | JWT | No direct frontend caller found. |
| GET `/api/runtime/crm/leads/:id` | Single lead; 404 if missing. | JWT | No direct frontend caller found. |
| POST `/api/runtime/crm/leads` | Creates a lead; body `{ assigned_to?, ...data }`. 201. | JWT | No direct frontend caller found. |
| PUT `/api/runtime/crm/leads/:id` | Updates a lead. | JWT | No direct frontend caller found. |
| POST `/api/runtime/crm/leads/:id/convert` | Converts a lead by CRM lead ID → account/contact/opportunity; body has create flags & opportunity fields. 201; **400 `{ error, missing_fields }` if required Prospect fields are incomplete**. | JWT | No direct frontend caller found (UI uses the record-ID variant `/records/:id/convert-lead`). |

### CRM Relational — Contacts

| Method & Path | Purpose / Relevance | Auth | When & how it's invoked |
|---|---|---|---|
| GET `/api/runtime/crm/contacts` | Lists contacts. | JWT | No direct frontend caller found. |
| GET `/api/runtime/crm/contacts/:id` | Single contact; 404 if missing. | JWT | No direct frontend caller found. |
| POST `/api/runtime/crm/contacts` | Creates a contact. 201. | JWT | No direct frontend caller found. |
| PUT `/api/runtime/crm/contacts/:id` | Updates a contact. | JWT | No direct frontend caller found. |

### CRM Relational — Accounts

| Method & Path | Purpose / Relevance | Auth | When & how it's invoked |
|---|---|---|---|
| GET `/api/runtime/crm/accounts` | Lists accounts. | JWT | No direct frontend caller found. |
| GET `/api/runtime/crm/accounts/:id` | Single account; 404 if missing. | JWT | No direct frontend caller found. |
| POST `/api/runtime/crm/accounts` | Creates an account. 201. | JWT | No direct frontend caller found. |
| PUT `/api/runtime/crm/accounts/:id` | Updates an account. | JWT | No direct frontend caller found. |

### CRM Relational — Opportunities

| Method & Path | Purpose / Relevance | Auth | When & how it's invoked |
|---|---|---|---|
| GET `/api/runtime/crm/opportunities` | Lists opportunities. | JWT | No direct frontend caller found. |
| GET `/api/runtime/crm/opportunities/:id` | Single opportunity; 404 if missing. | JWT | No direct frontend caller found. |
| POST `/api/runtime/crm/opportunities` | Creates an opportunity. 201. | JWT | No direct frontend caller found. |
| PUT `/api/runtime/crm/opportunities/:id` | Updates an opportunity. | JWT | No direct frontend caller found. |

### CRM Relational — Cases

| Method & Path | Purpose / Relevance | Auth | When & how it's invoked |
|---|---|---|---|
| GET `/api/runtime/crm/cases` | Lists CRM cases. | JWT | No direct frontend caller found. |
| GET `/api/runtime/crm/cases/:id` | Single case; 404 if missing. | JWT | No direct frontend caller found. |
| POST `/api/runtime/crm/cases` | Creates a case. 201. | JWT | No direct frontend caller found. |
| PUT `/api/runtime/crm/cases/:id` | Updates a case. | JWT | No direct frontend caller found. |

### CRM Relational — Associations

| Method & Path | Purpose / Relevance | Auth | When & how it's invoked |
|---|---|---|---|
| GET `/api/runtime/crm/associations?from_type=&from_id=[&to_type=]` | Lists associations between CRM entities. | JWT | No direct frontend caller found. |
| POST `/api/runtime/crm/associations` | Creates an association; body `{ from_type, from_id, to_type, to_id, assoc_type }` (all required). 201. | JWT | No direct frontend caller found. |
| DELETE `/api/runtime/crm/associations/:id` | Removes an association; 204. | JWT | No direct frontend caller found. |

### Products

| Method & Path | Purpose / Relevance | Auth | When & how it's invoked |
|---|---|---|---|
| GET `/api/runtime/products` | Lists products (query filters). | JWT | `metadataService.getProducts()` — product catalog. |
| GET `/api/runtime/products/:id` | Single product; 404 if missing. | JWT | `metadataService.getProduct(id)` — product detail. |
| POST `/api/runtime/products` | Creates a product. 201. | JWT | `metadataService.createProduct(data)` — product admin create. |
| PUT `/api/runtime/products/:id` | Updates a product. | JWT | `metadataService.updateProduct(id, data)` — product admin edit. |
| DELETE `/api/runtime/products/:id` | Deletes a product; 204. | JWT | `metadataService.deleteProduct(id)` — product admin delete. |

### Misc — Announcements

| Method & Path | Purpose / Relevance | Auth | When & how it's invoked |
|---|---|---|---|
| GET `/api/runtime/announcements` | Returns active system announcements for the current user's role. | JWT | `api.get('/runtime/announcements')` in `components/layout/AnnouncementBanner.jsx` — polled to render the top-of-app announcement banner. |

## Platform (Super-Admin)  ·  `/api/platform`

Super-admin / multi-tenant control plane. Source: `backend/src/routes/platform/index.js` (mounted at prefix
`/api/platform`).

**Auth / role gate.** Every route in this group is gated by two `preHandler` hooks applied at the plugin level:

1. `requirePlatformAdmin` (`backend/src/middleware/authenticate.js`) — requires the caller's role level ≤
`platform_admin`, i.e. level **1** in the inverted ladder (lower = more powerful). The threshold comes from the frozen
`BUILTIN_ROLE_LEVEL` constant, never from the `roles` table, and the gate *also* insists on the literal role name
`platform_admin`: a tenant-authored role could otherwise move the bar for the whole deployment. `levelOf()` refuses to
honour a `role_level: 1` claim on any other role name. See `developer-guide/SECURITY.md`, *Authorization: three
escalation paths closed*.
2. A tenant-scope bypass — `tenantContext.enterWith({ tenantId: null })` so platform admin operates cross-tenant
(queries are not filtered to a single tenant).

Because both hooks run for the whole plugin, the **Auth** column below is uniformly "platform_admin" for all endpoints;
it is not repeated per row except to note the impersonation guard.

**Auditing.** Almost every mutating endpoint calls the internal `audit()` helper → `PlatformAuditService.log()`,
recording admin id, action, target, details, IP, and user-agent. These audit rows are what the Audit Log endpoints read
back.

**Frontend.** All calls go through `frontend/src/services/platform.service.js` (base `/platform`). The super-admin
console screens live under `frontend/src/pages/platform/*` and are mounted in `App.jsx` behind
`<ProtectedRoute roles={['platform_admin']} />` at `/platform/*` (Dashboard, Tenants, Feature Flags, Plans,
Announcements, Analytics, Security, Audit Log). So the client-side route guard mirrors the server-side `platform_admin`
gate.

### Tenants

| Method & Path | Purpose / Relevance | Auth | When & how it's invoked |
|---|---|---|---|
| `GET /api/platform/tenants` | List tenants (paginated; filter by `status`, `plan`, `search`). | platform_admin | `platformService.listTenants()` — Tenants console screen (`TenantsPage.jsx`) main table load / filter / search. |
| `GET /api/platform/tenants/stats` | Aggregate tenant counts/metrics for dashboard cards. | platform_admin | `platformService.getTenantStats()` — Platform Dashboard and Tenants page summary cards. |
| `GET /api/platform/tenants/:id` | Fetch a single tenant's full detail. | platform_admin | `platformService.getTenant(id)` — opening a tenant detail/drawer in TenantsPage. |
| `POST /api/platform/tenants` | Create the tenant **row only** — no roles, metadata or admin, so the workspace is not yet usable. Validates name/slug/plan/status/billing email, derives the slug from the name when blank, and takes plan limits from the `subscription_plans` row rather than the body. Audited `tenant.create`. | platform_admin | `platformService.createTenant()` — API/script clients. The console uses `/onboard`. |
| `PUT /api/platform/tenants/:id` | Update tenant fields from a whitelist. `plan` and `slug` are rejected here (use `/change-plan`; slugs are immutable once URLs and asset keys reference them). Drops the lifecycle memo. Audited `tenant.update`. | platform_admin | `platformService.updateTenant(id, d)` — edit-tenant form. |
| `POST /api/platform/tenants/:id/suspend` | Suspend a tenant (optional `reason`). **Every user loses access immediately**, including live sessions — the lifecycle gate rejects their tokens. Drops the lifecycle memo. Audited `tenant.suspend`. | platform_admin | `platformService.suspendTenant(id, d)` — Suspend action; the console prompts for a reason. |
| `POST /api/platform/tenants/:id/reactivate` | Reactivate a suspended tenant; access resumes on the next request. Audited `tenant.reactivate`. | platform_admin | `platformService.reactivateTenant(id)` — Reactivate action. |
| `DELETE /api/platform/tenants/:id` | Soft-delete tenant (30-day recovery window); access stops at once. Audited `tenant.delete`. | platform_admin | `platformService.deleteTenant(id)` — Delete action; UI shows recovery-window notice. |
| `POST /api/platform/tenants/:id/restore` | Restore a soft-deleted tenant within the window. Audited `tenant.restore`. | platform_admin | `platformService.restoreTenant(id)` — Restore action on deleted tenants. |
| `POST /api/platform/tenants/:id/change-plan` | Change a tenant's subscription plan (`plan` required); limits follow the plan. Audited `tenant.change_plan`. | platform_admin | `platformService.changeTenantPlan(id, { plan })` — Change-plan mutation in TenantsPage. |

### Tenant Onboarding & Provisioning

Full guide: [../admin-guide/TENANT_ONBOARDING.md](../admin-guide/TENANT_ONBOARDING.md). Source:
`backend/src/services/platform/tenant-provisioning.service.js`. Step keys, in dependency order:
`roles`, `org`, `metadata`, `workflows`, `dashboards`, `sla`, `email_templates`, `admin`. Every step
is idempotent — it installs only what is missing — so re-running finishes a half-provisioned tenant
rather than duplicating it.

| Method & Path | Purpose / Relevance | Auth | When & how it's invoked |
|---|---|---|---|
| `POST /api/platform/tenants/onboard` | Create the tenant **and** provision it **and** create its first admin, in one call. Body: tenant fields + optional `admin: { employee_id, employee_name, email, password }`, `template_tenant_id`, `skip_steps[]`. Returns `201 { tenant, provisioning: { ok, steps[] }, readiness }`. The row commits before the steps run, so a failing step leaves a real tenant the console can finish. Audited `tenant.create` + `tenant.provision`. | platform_admin | `platformService.onboardTenant()` — the "Create and set up" button in `TenantOnboardWizard.jsx`. |
| `GET /api/platform/tenants/provisioning-steps` | The step catalogue (`key`, `title`), so the UI renders the checklist from the server's list rather than a hard-coded copy. | platform_admin | `platformService.getProvisioningSteps()` — wizard step 2, "Install with the workspace". |
| `GET /api/platform/tenants/check-slug?slug=` | `{ slug, available, reason?, suggestion? }`. | platform_admin | `platformService.checkTenantSlug()` — debounced as the operator types the organisation name (wizard step 1). |
| `GET /api/platform/tenants/check-admin?employee_id=&email=&slug=` | Availability of the **platform-wide** unique identity columns (`employees.employee_id`, `employees.email`), with a workspace-prefixed suggestion. Runs unscoped by necessity — the columns are not per tenant. | platform_admin | `platformService.checkTenantAdmin()` — debounced in wizard step 3. |
| `GET /api/platform/tenants/:id/readiness` | `{ ready, usable, steps[], missing[], completed, total, users }`. `usable` = roles + metadata + an admin (somebody can sign in and see a CRM); `ready` = all eight steps. Counts only. | platform_admin | `platformService.getTenantReadiness(id)` — one query per visible row, drives the **Setup** column and checklist in `TenantsPage.jsx`. |
| `POST /api/platform/tenants/:id/provision` | (Re-)run steps. Body: `{ steps?: string[], missing_only?: true, template_tenant_id?, admin? }`. Returns the per-step report plus fresh `readiness`. Audited `tenant.provision`. | platform_admin | `platformService.provisionTenant(id, { missing_only: true })` — the "Finish setup" button. |
| `POST /api/platform/tenants/:id/provision-admin` | Create the tenant's first `super_admin` (bcrypt password, hierarchy self-row), running the `roles`, `org` and `email_templates` steps alongside it so the new admin signs in to a working role ladder. Skips if an admin already exists; a platform-wide `employee_id`/`email` clash returns **409** with a message that says what to do. Audited `tenant.provision_admin`. | platform_admin | `platformService.provisionAdmin(id, d)` — the per-row "Provision Admin" action, shown only while the tenant has no admin. |

### Industries & Template Provisioning

| Method & Path | Purpose / Relevance | Auth | When & how it's invoked |
|---|---|---|---|
| `GET /api/platform/industries` | Return the supported industries list (from `industry-templates`). | platform_admin | `platformService.getIndustries()` — populates the industry dropdown in wizard step 2 and the template-provisioning UI. |
| `POST /api/platform/tenants/:id/provision-templates` | (Re-runnable) install the industry email templates; industry from body or tenant record, persisted first when supplied so the step reads it. Delegates to the `email_templates` provisioning step, so it skips a tenant that already has templates rather than duplicating them. Audited `tenant.provision_templates`. | platform_admin | `platformService.provisionTemplates(id, d)` — "Provision templates" action. |

### Tenant Config

| Method & Path | Purpose / Relevance | Auth | When & how it's invoked |
|---|---|---|---|
| `GET /api/platform/tenants/:id/config` | List a tenant's config key/values. | platform_admin | `platformService.getTenantConfig(id)` — tenant config panel. |
| `PUT /api/platform/tenants/:id/config` | Upsert a single config `key`/`value` (records actor). Audited `tenant.config_update`. | platform_admin | `platformService.setTenantConfig(id, d)` — save config entry. |
| `DELETE /api/platform/tenants/:id/config/:key` | Remove a config key. Audited `tenant.config_delete`. | platform_admin | `platformService.deleteTenantConfig(id, k)` — delete config entry. |

### Tenant Usage

| Method & Path | Purpose / Relevance | Auth | When & how it's invoked |
|---|---|---|---|
| `GET /api/platform/tenants/:id/usage` | Usage metrics for a tenant (filter by `period`, `metric`). | platform_admin | `platformService.getTenantUsage(id, p)` — usage/consumption view for a tenant. |

### Platform Audit Log

| Method & Path | Purpose / Relevance | Auth | When & how it's invoked |
|---|---|---|---|
| `GET /api/platform/audit-log` | Paginated platform audit trail; filter by `admin_id`, `action`, `target_type`, `target_id`, `from`, `to`. | platform_admin | `platformService.listAuditLog(params)` — Audit Log console (`AuditLogPage.jsx`) table. |
| `GET /api/platform/audit-log/stats` | Action-count stats over a `from`/`to` window. | platform_admin | `platformService.getAuditStats(params)` — Audit Log page summary/chart. |
| `GET /api/platform/audit-log/target/:type/:id` | Full audit history for one target object. | platform_admin | `platformService.getTargetHistory(t, id)` — "history" drill-down for a specific entity. |

### Impersonation

| Method & Path | Purpose / Relevance | Auth | When & how it's invoked |
|---|---|---|---|
| `POST /api/platform/impersonate` | Start an impersonation session for `target_user_id` (+ optional `reason`). Loads target employee, refuses if target is another `platform_admin`, resolves role level (tenant-scoped then global), mints a 1-hour JWT flagged `is_impersonated` / `impersonated_by`, logs via `SecurityService.logImpersonation`. Audited `user.impersonate`. Returns `{ token, impersonation_id, target }`. | platform_admin (extra guard: cannot impersonate another platform_admin) | `platformService.startImpersonation(data)` — triggered from a super-admin "Impersonate user" action; the returned token is swapped in to act as that tenant user. (No dedicated button located in the platform pages searched; wired in the service and used to obtain the impersonation JWT.) |
| `POST /api/platform/impersonate/:id/end` | End an impersonation session (optional `actions_taken`). Audited `user.impersonate_end`. | platform_admin | `platformService.endImpersonation(id, d)` — "Exit impersonation" flow. |
| `GET /api/platform/impersonation-logs` | Paginated impersonation history (filter by `admin_id`). | platform_admin | `platformService.listImpersonationLogs()` — "Impersonation History" section on Security console (`SecurityPage.jsx`, `platform-imp-logs` query). |

### Announcements

| Method & Path | Purpose / Relevance | Auth | When & how it's invoked |
|---|---|---|---|
| `GET /api/platform/announcements` | List announcements (filter `severity`, `active_only`). | platform_admin | `platformService.listAnnouncements(params)` — Announcements console (`AnnouncementsPage.jsx`). |
| `GET /api/platform/announcements/:id` | Get one announcement. | platform_admin | `platformService.getAnnouncement(id)` — open/edit an announcement. |
| `POST /api/platform/announcements` | Create announcement (records `created_by`). Audited `announcement.create`. | platform_admin | `platformService.createAnnouncement(data)` — "New announcement" form. |
| `PUT /api/platform/announcements/:id` | Update announcement. Audited `announcement.update`. | platform_admin | `platformService.updateAnnouncement(id, d)` — edit form. |
| `DELETE /api/platform/announcements/:id` | Delete announcement. Audited `announcement.delete`. | platform_admin | `platformService.deleteAnnouncement(id)` — delete action. |
| `POST /api/platform/announcements/:id/activate` | Activate (publish) an announcement. Audited `announcement.activate`. | platform_admin | `platformService.activateAnnouncement(id)` — activate toggle. |
| `POST /api/platform/announcements/:id/deactivate` | Deactivate an announcement. Audited `announcement.deactivate`. | platform_admin | `platformService.deactivateAnnouncement(id)` — deactivate toggle. |

### Feature Entitlements

Full guide: [../admin-guide/PLANS_AND_FEATURES.md](../admin-guide/PLANS_AND_FEATURES.md). Source:
`backend/src/services/platform/entitlement.service.js` and `feature-catalogue.js`.

Three inputs decide whether a tenant has a feature, resolved in this order: the **plan** (what was
sold), the **flag** (whether we shipped it — may only withhold, never grant), and a **per-tenant
override** (the deliberate exception, which wins over both). Core features sit outside all of it and
are always on.

Before this existed, `subscription_plans.features` held free text nothing read and `feature_flags`
resolved without consulting the plan at all, so the two systems shared no vocabulary and a `premium`
flag gated nothing.

| Method & Path | Purpose / Relevance | Auth | When & how it's invoked |
|---|---|---|---|
| `GET /api/platform/feature-catalogue` | The closed vocabulary: groups, features, and which plan tiers include each. Code, not data — a feature key is referenced by a code branch. | platform_admin | `platformService.getFeatureCatalogue()` — the plan editor's feature picker and the tenant Features panel. |
| `GET /api/platform/tenants/:id/features` | One tenant's matrix: every feature with its resolved `state` (`enabled`, `source`, `in_plan`, `override`, `reason`), plus a count summary. | platform_admin | `platformService.getTenantFeatures(id)` — `TenantFeaturesPanel.jsx`. |
| `PUT /api/platform/tenants/:id/features/:key` | Grant, revoke or clear one override. Body `{ enabled: true \| false \| null }`; `null` removes the override and returns the feature to the plan's answer. Creates the `feature_flags` row an override hangs off, if needed, fully enabled so its existence changes nothing. Audited `tenant.feature_override`. | platform_admin | `platformService.setTenantFeature(id, key, enabled)` — the three-state control on each row. |
| `PUT /api/platform/tenants/:id/features` | Apply a group of overrides in one save. Body `{ features: { key: true \| false \| null } }`. Rejects an unknown key before writing anything. Audited `tenant.feature_override_bulk`. | platform_admin | `platformService.setTenantFeatures(id, features)`. |
| `POST /api/platform/plans/:id/reset-features` | Reset a plan's features to the catalogue default for its tier. Audited `plan.reset_features`. | platform_admin | `platformService.resetPlanFeatures(id)` — the reset action on a plan card. |

**Caching.** Resolved entitlements are memoised per tenant for 30 s. Every write path that changes an
answer drops the memo as it writes (plan edit, flag toggle, rollout change, override, tenant plan
change). A new write path that affects entitlements must call `EntitlementService.invalidate(tenantId)`
or the change appears not to take effect for up to the TTL.

### Feature Flags

| Method & Path | Purpose / Relevance | Auth | When & how it's invoked |
|---|---|---|---|
| `GET /api/platform/feature-flags` | List feature flags (filter `category`). Each row carries a `feature` object naming the catalogue feature it controls and the tier that sells it, or `null` when the flag's name matches no catalogue key — i.e. it gates nothing sellable. | platform_admin | `platformService.listFeatureFlags(params)` — Feature Flags console (`FeatureFlagsPage.jsx`). |
| `GET /api/platform/feature-flags/:id` | Get one flag. | platform_admin | `platformService.getFeatureFlag(id)` — flag detail/edit. |
| `POST /api/platform/feature-flags` | Create a flag (records `created_by`). Audited `flag.create`. | platform_admin | `platformService.createFeatureFlag(data)` — new-flag form. |
| `PUT /api/platform/feature-flags/:id` | Update a flag. Audited `flag.update`. | platform_admin | `platformService.updateFeatureFlag(id, d)` — edit form. |
| `POST /api/platform/feature-flags/:id/toggle` | Enable/disable a flag globally (`enabled` boolean required). Audited `flag.toggle`. | platform_admin | `platformService.toggleFeatureFlag(id, d)` — on/off switch in flag list. |
| `POST /api/platform/feature-flags/:id/rollout` | Set percentage rollout (`percent` number required). Audited `flag.rollout`. | platform_admin | `platformService.setFlagRollout(id, d)` — rollout slider/input. |
| `DELETE /api/platform/feature-flags/:id` | Delete a flag. Audited `flag.delete`. | platform_admin | `platformService.deleteFeatureFlag(id)` — delete action. |
| `GET /api/platform/feature-flags/tenant/:tenantId` | Effective flags (with overrides) for one tenant. **Superseded by `GET /tenants/:id/features`**, which also accounts for the plan; kept for existing clients. | platform_admin | `platformService.getTenantFlags(tid)` — per-tenant flag view. |
| `POST /api/platform/feature-flags/:id/tenant-override` | Set a per-tenant override by numeric flag id (`tenant_id`, `enabled`, optional `config`). Audited `flag.tenant_override`. Prefer `PUT /tenants/:id/features/:key`, which takes a feature key rather than an id the caller has to look up, and can clear an override as well as set one. | platform_admin | `platformService.setTenantFlagOverride(id, d)`. |
| `DELETE /api/platform/feature-flags/:id/tenant-override/:tenantId` | Remove a tenant override. Audited `flag.remove_tenant_override`. | platform_admin | `platformService.removeTenantFlagOverride(id, tid)` — remove override. |

### Subscription Plans

| Method & Path | Purpose / Relevance | Auth | When & how it's invoked |
|---|---|---|---|
| `GET /api/platform/plans` | List plans, each with its resolved `features` array, `features_explicit` (false when the row has no stored list and the catalogue derivation is being shown) and `tenant_count`. | platform_admin | `platformService.listPlans()` — Plans console (`PlansPage.jsx`), Cards view. |
| `GET /api/platform/plans/compare` | The comparison grid: `{ plans, groups, tiers }` — tiers with prices, limits and feature lists, plus the catalogue grouped for the row headers. | platform_admin | `platformService.comparePlans()` — Plans console, Compare view. |
| `GET /api/platform/plans/:id` | Get one plan. | platform_admin | `platformService.getPlan(id)` — plan detail/edit. |
| `POST /api/platform/plans` | Create a plan. `features` is validated against the catalogue; omitting it means "the standard set for this tier" rather than nothing. Limits, prices and `trial_days` are range-checked. Audited `plan.create`. | platform_admin | `platformService.createPlan(data)` — new-plan form. |
| `PUT /api/platform/plans/:id` | Update a plan. **`name` cannot be changed** — `tenants.plan` points at it, so a rename would orphan every tenant on the plan (400). `features` is validated against the catalogue and unknown keys are rejected with the offending keys named. Audited `plan.update`. | platform_admin | `platformService.updatePlan(id, d)` — edit form. |
| `DELETE /api/platform/plans/:id` | Delete a plan. Audited `plan.delete`. | platform_admin | `platformService.deletePlan(id)` — delete action. |

### Platform Analytics

| Method & Path | Purpose / Relevance | Auth | When & how it's invoked |
|---|---|---|---|
| `GET /api/platform/analytics/overview` | High-level platform KPIs. | platform_admin | `platformService.getOverview()` — Platform Dashboard / Analytics console (`AnalyticsPage.jsx`). |
| `GET /api/platform/analytics/tenant-growth` | Tenant growth over `months` (default 12). | platform_admin | `platformService.getTenantGrowth(params)` — growth chart. |
| `GET /api/platform/analytics/feature-usage` | Feature-usage breakdown. | platform_admin | `platformService.getFeatureUsage()` — feature usage chart. |
| `GET /api/platform/analytics/user-activity` | User activity over `days` (default 30). | platform_admin | `platformService.getUserActivity(params)` — activity chart. |
| `GET /api/platform/analytics/system-health` | System health indicators. | platform_admin | `platformService.getSystemHealth()` — health widget on dashboard. |
| `GET /api/platform/analytics/revenue` | Revenue metrics. | platform_admin | `platformService.getRevenue()` — revenue panel. |
| `GET /api/platform/analytics/churn` | Churn metrics over `months` (default 6). | platform_admin | `platformService.getChurn(params)` — churn chart. |

### Security — Policies

| Method & Path | Purpose / Relevance | Auth | When & how it's invoked |
|---|---|---|---|
| `GET /api/platform/security/policies` | List all security policies. | platform_admin | `platformService.listSecurityPolicies()` — Security console (`SecurityPage.jsx`). |
| `GET /api/platform/security/policies/global` | Get the global (default) security policy. | platform_admin | `platformService.getGlobalPolicy()` — global policy editor. |
| `GET /api/platform/security/policies/tenant/:tenantId` | Get a tenant-specific policy. | platform_admin | `platformService.getTenantPolicy(tid)` — per-tenant policy view. |
| `PUT /api/platform/security/policies` | Upsert a policy (records `updated_by`). Audited `security.policy_update`. | platform_admin | `platformService.upsertSecurityPolicy(data)` — save policy. |

### Security — Password Management

| Method & Path | Purpose / Relevance | Auth | When & how it's invoked |
|---|---|---|---|
| `POST /api/platform/security/force-password-reset` | Force one user (`employee_id`) to reset password. Audited `security.force_password_reset`. | platform_admin | `platformService.forcePasswordReset(data)` — per-user "Force reset" action. |
| `POST /api/platform/security/bulk-password-reset` | Force reset for many users (`employee_ids` array). Audited `security.bulk_password_reset`. | platform_admin | `platformService.bulkPasswordReset(data)` — bulk reset action. |

### Security — Sessions & Users

| Method & Path | Purpose / Relevance | Auth | When & how it's invoked |
|---|---|---|---|
| `GET /api/platform/security/sessions` | List active sessions across the platform. | platform_admin | `platformService.getActiveSessions()` — active-sessions panel on Security console. |
| `POST /api/platform/security/deactivate-user` | Deactivate a user (`employee_id`). Audited `security.deactivate_user`. | platform_admin | `platformService.deactivateUser(data)` — deactivate action. |
| `POST /api/platform/security/reactivate-user` | Reactivate a user (`employee_id`). Audited `security.reactivate_user`. | platform_admin | `platformService.reactivateUser(data)` — reactivate action. |

### Security — API Rate Limits

| Method & Path | Purpose / Relevance | Auth | When & how it's invoked |
|---|---|---|---|
| `GET /api/platform/security/rate-limits` | List configured API rate limits. | platform_admin | `platformService.listRateLimits()` — rate-limits panel on Security console. |
| `PUT /api/platform/security/rate-limits` | Upsert a rate limit. Audited `security.rate_limit_update`. | platform_admin | `platformService.upsertRateLimit(data)` — save rate limit. |
| `DELETE /api/platform/security/rate-limits/:id` | Remove a rate limit. Audited `security.rate_limit_delete`. | platform_admin | `platformService.deleteRateLimit(id)` — delete rate limit. |

### Security — Data Exports

| Method & Path | Purpose / Relevance | Auth | When & how it's invoked |
|---|---|---|---|
| `GET /api/platform/security/data-exports` | List data-export requests (filter `tenant_id`, `status`; paginated). | platform_admin | `platformService.listDataExports(params)` — data-export queue on Security console. |
| `POST /api/platform/security/data-exports` | Create a data-export request (status `pending`, records `requested_by`). Audited `security.data_export_request`. | platform_admin | `platformService.requestDataExport(data)` — "Request export" action. |
| `PUT /api/platform/security/data-exports/:id/status` | Update an export's `status` (+ extra fields). Audited `security.data_export_status`. | platform_admin | `platformService.updateExportStatus(id, d)` — advance export through its lifecycle. |

---

## Settings  ·  `/api/settings`

Tenant-wide application settings. Source: `backend/src/routes/settings/index.js` (mounted at prefix `/api/settings`),
backed by `SettingsService`. Reads/writes are scoped to `req.user.tenant_id`; the write records an actor id
(`employee_id` → `sub` → `SYSTEM`). Reads are open to any authenticated user because the SPA needs branding/localization
to render for everyone; writes require admin.

**Frontend.** `frontend/src/services/settings.service.js` (base `/settings`); consumed by the Organization Settings
screen (`frontend/src/pages/OrganizationSettings.jsx`). GET returns `{ schema, values }` and the UI renders form fields
generically from `schema`.

| Method & Path | Purpose / Relevance | Auth | When & how it's invoked |
|---|---|---|---|
| `GET /api/settings/` | Return settings **schema + effective values** for the caller's tenant. Drives generic rendering of the settings form (and app-wide branding/localization). | Any authenticated user (`authenticate`) | `settingsService.get()` — Organization Settings page load; also used app-wide to fetch branding/localization. |
| `GET /api/settings/effective` | Return the **flat effective values** only (schema omitted), for programmatic consumers. | Any authenticated user (`authenticate`) | `settingsService.getEffective()` — programmatic reads that just need resolved values. |
| `PUT /api/settings/` | Update settings for the tenant. Accepts `{ values: { "group.key": value, ... } }` (falls back to raw body). | Admin only (`authenticate` + `requireAdmin`, level ≤ 3) | `settingsService.update(values)` — "Save" on the Organization Settings page. |

**Totals:** Platform = 68 endpoints; Settings = 3 endpoints; **grand total = 71**.

All routes require a valid JWT. Authentication is enforced by the `authenticate`
preHandler (decodes the bearer token, populates `req.user` with `employeeId`,
`role_level`, `tenant_id`, etc.); config/mutation endpoints add `requireAdmin`,
which rejects any user whose `role_level` is above `ADMIN_THRESHOLD`. Successful
responses are wrapped by the shared `ok()` helper (`{ success, data }`).

Role scoping uses two thresholds from `middleware/authenticate`:
`ADMIN_THRESHOLD` (admins, lowest level numbers) and `MANAGER_THRESHOLD`
(managers). Lower `role_level` = more privilege; users default to level 99.

---

## SLA · `/api/sla`

Mounted from `backend/src/routes/sla/index.js`. Backs the SLA engine: business-hours
calendars, SLA policies (targets + escalations) and a live timer dashboard. The
dashboard is open to every authenticated user (scoped to their own timers unless
they are a manager/admin); all configuration (`business-hours`, `policies`,
`seed-defaults`, manual `reconcile`) is admin-only. Note the SLA engine also runs
a **server-side reconcile on a 60s interval** (`backend/src/app.js`, started ~15s
after boot via `slaService.reconcile()`), independent of any HTTP call, which is
what continuously recomputes timers, flags at-risk/breached, and escalates.

| Method & Path | Purpose / Relevance | Auth | When & how it's invoked |
|---|---|---|---|
| GET `/api/sla/dashboard` | Live SLA timer dashboard; `?scope=me\|team\|all` (auto-downgraded to what the caller's role permits). | JWT | `slaService.getDashboard(scope)` in `SlaDashboardPage.jsx` (react-query) and `SlaRadiator.jsx` (scope `'me'`). |
| POST `/api/sla/reconcile` | Manually force a timer recompute/refresh (testing / on-demand). | JWT + admin | `slaService.reconcile()` in `sla.service.js`; server also auto-reconciles every 60s regardless. |
| GET `/api/sla/business-hours` | List business-hours calendars. | JWT | `slaService.getBusinessHours()` — `SlaBuilderPage.jsx` query. |
| POST `/api/sla/business-hours` | Create a calendar (weekly hours, holidays, timezone; enforces single default). | JWT + admin | `slaService.createBusinessHours(data)` — SLA builder save. |
| PUT `/api/sla/business-hours/:id` | Update a calendar (partial fields; toggling `is_default` clears others). | JWT + admin | `slaService.updateBusinessHours(id, data)` — SLA builder edit. |
| DELETE `/api/sla/business-hours/:id` | Delete a calendar. | JWT + admin | `slaService.deleteBusinessHours(id)` — SLA builder delete mutation. |
| GET `/api/sla/policies` | List all SLA policies with targets, escalations, business_hours. | JWT | `slaService.getPolicies()` — `SlaBuilderPage.jsx` query. |
| GET `/api/sla/policies/:id` | Fetch one policy (with children). | JWT | `slaService.getPolicy(id)` in `sla.service.js`. |
| POST `/api/sla/policies` | Create a policy (entity_type `case\|lead\|task`) plus its targets/escalations. | JWT + admin | `slaService.createPolicy(data)` — SLA builder save (new). |
| PUT `/api/sla/policies/:id` | Update a policy; if `targets`/`escalations` supplied, children are replaced. | JWT + admin | `slaService.updatePolicy(id, data)` — SLA builder save (edit). |
| DELETE `/api/sla/policies/:id` | Delete a policy. | JWT + admin | `slaService.deletePolicy(id)` — SLA builder delete mutation. |
| POST `/api/sla/seed-defaults` | One-time seed of default calendar + Case/Lead/Task policies (no-op if policies exist). | JWT + admin | `slaService.seedDefaults()` — SLA builder "seed defaults" mutation. |

---

## Reports · `/api/reports`

Mounted from `backend/src/routes/reports/index.js`. The self-service report builder
over CRM data — see [REPORTING.md](REPORTING.md) for the engine.

Any authenticated user can create, save, share and schedule reports; no admin is
involved. Two independent controls apply:

- **Visibility** — who may *open* a report (`private` / `team` / `shared` / `everyone`,
  `ReportLibraryService.canView`). Admins may always view; only the author or an admin
  may edit (`assertCanEdit`).
- **Scope** — which records a report *shows*. `resolveScope()` downgrades any requested
  scope to what the caller's role allows (admins `all`, managers `team` via
  `employeeHierarchy`, everyone else `me`), so sharing never widens data access.

Every handler runs inside `tenantContext.run()` (see
[REPORTING.md](REPORTING.md#tenant-scoping--a-local-workaround)).

| Method & Path | Purpose / Relevance | Auth | When & how it's invoked |
|---|---|---|---|
| GET `/api/reports/sources` | Registry of available data sources/fields that drives the builder UI. | JWT | `reportService.getSources()` — `report.service.js`. |
| GET `/api/reports` | Reports visible to the caller (newest first). Optional `folder_id` (or `none`), `search`, `favorites`, `mine`. | JWT | `reportService.list(params)` — `ReportsPage.jsx` query. |
| GET `/api/reports/:id` | Fetch one saved report's config. | JWT | `reportService.get(id)` — report edit/detail load. |
| POST `/api/reports` | Create/save a report (name, config, sharing). | JWT | `reportService.create(data)` — `ReportBuilderPage.jsx` save. |
| PUT `/api/reports/:id` | Update a saved report (creator or admin only). | JWT (owner/admin) | `reportService.update(id, data)` — report builder edit. |
| DELETE `/api/reports/:id` | Delete a saved report (creator or admin only). | JWT (owner/admin) | `reportService.remove(id)` — `ReportsPage.jsx` delete. |
| POST `/api/reports/run` | Ad-hoc run of an unsaved config; live preview in the builder. Body `{ config, scope?, params?, global? }` — `params` answers prompted filters, `global` is `{ date_range, owner }`. | JWT | `reportService.run(config, scope, params)` — builder live preview. |
| POST `/api/reports/:id/run` | Run a saved report; logs a `reportExecution` row and, for a plain run (no `params`/`global`/`overrides`), appends a trend snapshot. Result carries `insights` and `meta.parameters`. | JWT | `reportService.runSaved(id, scope, params)` — the viewer. |
| GET `/api/reports/:id/snapshots` | The report's headline numbers over time, `?scope=`: `{ columns, snapshots: [{ at, scope, row_count, grand }], enough }`. | JWT (viewer) | `TrendStrip` under a saved report. |
| GET `/api/reports/vocabulary` | Every operator, aggregation, formula op, period, visualization, visibility and schedule option the builder may offer. | JWT | `reportService.getVocabulary()` — populates all builder dropdowns. |
| GET `/api/reports/templates` | The starter report gallery (~26 working configs). | JWT | `TemplateGallery.jsx` — first screen of *New report*. |
| GET `/api/reports/templates/:key` | One template. | JWT | Deep link `/reports/new?template=<key>`. |
| GET `/api/reports/field-values` | Distinct values present for `?source=&field=`, so the filter UI offers a pick-list. | JWT | `svc.getFieldValues()` — `FilterGroupBuilder.jsx`. |
| GET `/api/reports/folders` | List folders with report counts. | JWT | Library folder rail. |
| POST `/api/reports/folders` | Create a folder. | JWT | Library folder rail. |
| PUT `/api/reports/folders/:id` | Rename / recolour / re-parent (cycles rejected). | JWT | Library folder rail. |
| DELETE `/api/reports/folders/:id` | Delete a folder; contained reports become uncategorised, never deleted. | JWT | Library folder rail. |
| POST `/api/reports/:id/duplicate` | Save-as-a-copy, owned by the caller and private. | JWT (viewer) | How a non-owner adapts someone else's report. |
| POST `/api/reports/:id/favorite` | Star / unstar for the caller only. | JWT (viewer) | Library star button. |
| GET `/api/reports/:id/data` | The report reshaped for a dashboard widget: `?shape=series\|metric\|rows`. Optional dashboard-level filters `?date_range=<preset\|from,to>&owner=<id[,id]>` applied on the source's primary date / owner. Returns rows plus metadata describing its own axes/measures. | JWT (viewer) | `useDataSource` → report-backed widgets; `DashboardRenderer` date bar. |
| POST `/api/reports/drilldown` | Records behind a bucket of an *unsaved* config (`{ config, keys }`). | JWT | Builder preview drill-down. |
| POST `/api/reports/:id/drilldown` | Records behind a bucket of a saved report. | JWT (viewer) | Chart / matrix click-through. |
| GET `/api/reports/:id/history` | Last 25 executions, including scheduled runs. | JWT (viewer) | Run-history modal. |
| POST `/api/reports/export` | Run a config and stream CSV or Excel (`format: 'csv'\|'xlsx'`). | JWT | Builder export buttons, `responseType: 'blob'`. |
| POST `/api/reports/:id/export` | Same for a saved report. | JWT (viewer) | Viewer export buttons. |
| GET `/api/reports/:id/print` | Print-ready HTML (`text/html`); the browser's Save-as-PDF produces the PDF. Also the scheduled-email body. | JWT (viewer) | Viewer **PDF** button. |
| GET `/api/reports/:id/subscriptions` | Schedules on a report. | JWT (viewer) | Subscribe modal. |
| POST `/api/reports/:id/subscriptions` | Create a recurring emailed delivery. `frequency` incl. `hourly`; optional `alert: { measure: 'm0'\|'row_count', op, value, only_on_change }` makes it an exception report that only emails when the condition holds. | JWT (viewer) | Subscribe modal. |
| PUT `/api/reports/subscriptions/:subId` | Update / pause a schedule (owner or report admin). | JWT (owner) | Subscribe modal. |
| DELETE `/api/reports/subscriptions/:subId` | Delete a schedule. | JWT (owner) | Subscribe modal. |
| POST `/api/reports/subscriptions/:subId/send-now` | Send one immediately, to verify the schedule (an alert condition is bypassed). | JWT (owner) | **Send now** button. |
| GET `/api/reports/my-subscriptions` | Every schedule the caller owns, across reports. | JWT | "My schedules" view. |

---

## AI reporting · `/api/ai-reports`

Mounted from `backend/src/routes/ai-reports/index.js`; feature-flagged by `AI_REPORTING_ENABLED`.
Natural-language report building on top of the report engine — the model emits a **report config**,
never SQL, and the result is scope-clamped exactly like a hand-built report. See
[AI_REPORTING.md](AI_REPORTING.md).

| Method & Path | Purpose / Relevance | Auth | When & how it's invoked |
|---|---|---|---|
| GET `/api/ai-reports/status` | Feature flag + provider health: `{ enabled, ok, provider, model, reason }`. | JWT | `reportService.aiStatus()` — decides whether **Ask Genesis** and **Explain** are shown. |
| GET `/api/ai-reports/suggestions` | Starter questions from the template gallery and named metrics; no model call. | JWT | `AskPanel` empty state. |
| POST `/api/ai-reports/ask` | `{ message, history?, scope?, options?: { force_viz, want_summary } }` → plan + data + visualization + narrative, or a clarification / refusal. 429 with `Retry-After` past 30 questions per 10 min. | JWT | `reportService.ask()` — `AskPanel`. |
| POST `/api/ai-reports/explain` | `{ title, result, scope? }` → a grounded narrative for a result the client already has (every numeral checked against the result). | JWT | **Explain** in `InsightsPanel`. |

---

## Analytics · `/api/analytics`

> **Object analytics (October 2026).** `POST /api/analytics/object` — body
> `{ object, metric: count|sum|avg|min|max, field?, group_by?, filters?: [{ field, op, value }] }` —
> aggregates the records of any Builder object, scoped by the viewer's record access. Used by widgets
> whose data source is `{ type: 'object', … }`. See
> [PLATFORM_BUILDER_EXTENSIONS.md](PLATFORM_BUILDER_EXTENSIONS.md#8-object-analytics).

Mounted from `backend/src/routes/analytics/index.js`, backed by
`backend/src/services/analytics.service.js`. This is the **live data layer behind
dashboard widgets**: instead of embedding a JSON blob in its configuration, a
widget stores a pointer (`{ type: 'endpoint', dataset: '<key>' }`) and fetches the
numbers at render time. Any authenticated user may read; every dataset is computed
with ordinary Prisma calls so the tenant-scope extension filters rows automatically
(the service deliberately never uses `$queryRaw`, which would bypass that
isolation).

| Method & Path | Purpose / Relevance | Auth | When & how it's invoked |
|---|---|---|---|
| GET `/api/analytics/datasets` | Catalog of every published dataset (key, label, description, category, shape, suggested `chart_type`/`xKey`/`yKey`/`columns`) — the runner functions are stripped. | JWT | `analyticsService.getDatasets()` — the **Live** section of `WidgetPalette.jsx` and the dataset picker in `WidgetConfigPanel.jsx` (cached with `staleTime: Infinity`). |
| GET `/api/analytics/data/:key` | Run one dataset and return its payload plus a `meta` block (`shape`, suggested keys, `generated_at`). 404 on an unknown key. | JWT | `useDataSource` → `analyticsService.getData(key)` — every endpoint-backed chart, metric card and list widget, in both the runtime dashboard and the builder canvas. |

### Dataset shapes

Each dataset declares a `shape` that decides which widget types can consume it.
The Dashboard Builder filters its picker on this field.

| Shape | Payload | Consumed by |
|---|---|---|
| `series` | Array of row objects, e.g. `[{ month: 'Aug', revenue: 12500 }]` | `chart` widgets |
| `metric` | Single object `{ value, change?, trend?, raw? }` where `trend` is `up` / `down` / `flat` | `metric` widgets (KPI cards) |
| `rows` | Array of flat objects keyed by the dataset's `columns` | `list` / `table` widgets |

### Dataset catalog

Datasets are grouped by category. `series` entries carry the chart type they were
designed for; the builder pre-fills it when you pick the dataset.

| Category | Datasets |
|---|---|
| Pipeline | `opportunity-pipeline-by-stage` (funnel), `leads-by-source` (donut), `leads-by-status` (bar), `opportunity-win-loss-monthly` (stacked bar) |
| KPIs | `kpi-open-pipeline`, `kpi-open-leads` |

### Conventions worth knowing

- **Status datasets keep their full domain.** `tallyByDomain()` emits every known
  enum value including zero-count ones, so a chart keeps its complete axis before
  the tenant has records in each state.
- **Month buckets are UTC and fixed-length.** `monthBuckets(12)` always returns 12
  entries ending with the current month, so a sparse table still produces a
  continuous time series.
- **Multi-series datasets declare `yKey` as an array** (e.g.
  `opportunity-win-loss-monthly` → `['won', 'lost']`). `ChartRenderer` treats the
  array as its series list; for `composed` charts the first key is drawn as bars
  and the second as the overlaid line.
- **Metric trends can be inverted.** A metric where more is worse (a backlog of
  unresolved items) reports a *rise* as `trend: 'down'`.
- **Reads are capped** at `MAX_ROWS = 5000` per query (smaller for point-per-record
  charts such as scatter/bubble/timeline).

### Adding a dataset

Append an entry to `DATASETS` in `analytics.service.js` with `key`, `label`,
`description`, `category`, `shape`, the suggested `chart_type`/`xKey`/`yKey` (or
`columns` for `rows`), and an `async run(db)`. It appears in the builder's picker
immediately — no route, migration or frontend change. `backend/tests/analytics.test.js`
executes every catalog entry against a Prisma double, so a new dataset is covered
by the existing suite the moment it is registered.

---

## Lead Scoring · `/api/lead-scoring`

Mounted from `backend/src/routes/lead-scoring/index.js`. Manages scoring rules and
computes/serves lead scores, rankings and analytics. Rule management and bulk
scoring are **admin-only**; reading scores, rankings and analytics is open to any
authenticated user. Only the `/rules*` endpoints have a static frontend caller
(the Lead Scoring **Rules** builder). Lead scores themselves are surfaced inline on
the **Leads** module — the engine writes to `lead_scores` and `RecordService`
injects each lead's `score`/`grade` at read time — so the scoring/analytics
endpoints have no direct hand-written frontend caller.

| Method & Path | Purpose / Relevance | Auth | When & how it's invoked |
|---|---|---|---|
| GET `/api/lead-scoring/rules` | List scoring rules; optional `?rule_type=&is_active=`. | JWT | `getRules()` in `LeadScoringBuilderPage.jsx`. |
| POST `/api/lead-scoring/rules` | Create a scoring rule (201). | JWT + admin | `createRule(data)` — Lead Scoring builder save. |
| PUT `/api/lead-scoring/rules/:id` | Update a scoring rule. | JWT + admin | `updateRule(id, data)` — Lead Scoring builder edit. |
| DELETE `/api/lead-scoring/rules/:id` | Delete a scoring rule. | JWT + admin | `deleteRule(id)` — Lead Scoring builder delete. |
| POST `/api/lead-scoring/rules/setup-defaults` | Seed the tenant's default scoring rules (201). | JWT + admin | `setupDefaults()` — Lead Scoring builder "setup defaults". |
| GET `/api/lead-scoring/leads/:id/score` | Get a lead's current score. | JWT | No direct frontend caller found (metadata-driven module). |
| POST `/api/lead-scoring/leads/:id/score` | Force-recalculate a single lead's score. | JWT | No direct frontend caller found (metadata-driven module). |
| POST `/api/lead-scoring/bulk-score` | Batch re-score leads (`{ limit, offset }`) for the tenant. | JWT + admin | No direct frontend caller found (metadata-driven module). |
| GET `/api/lead-scoring/top` | Top-scored leads ranking (`?limit`, default 50). | JWT | No direct frontend caller found (metadata-driven module). |
| GET `/api/lead-scoring/analytics` | Aggregate scoring analytics. | JWT | No direct frontend caller found (metadata-driven module). |
| GET `/api/lead-scoring/distribution` | Score distribution (buckets/histogram). | JWT | No direct frontend caller found (metadata-driven module). |

---

Communication & collaboration route groups: Email, Documents, Social Media, Activities, Tasks, Notifications.

Every endpoint below runs behind Fastify preHandlers. The baseline `authenticate` middleware validates the JWT bearer
token and populates `req.user` (`employee_id`, `role`, `tenant_id`). Social Media additionally layers role gates
(`requireManager`, `requireAdmin`). All responses are wrapped by the shared `ok()` / `created()` helpers
(`{ success, data }`) unless a raw stream or `204 No Content` is returned.

---

## Email · `/api/email`

Template CRUD, variable resolution, template rendering/preview, transactional send (with-template, raw, and
PDF-attachment variants), and per-record email history. Backed by `EmailTemplateService`, `EmailSendService`,
`ActivityService`, and `MetadataService`. Every route requires a valid JWT (`authenticate`); there is no extra role
gate. Send endpoints optionally write an `Activity` timeline entry against the related record (best-effort — never fails
the send).

| Method & Path | Purpose / Relevance | Auth | When & how it's invoked |
|---|---|---|---|
| `GET /api/email/templates` | List/filter templates (category, object_id, is_active, language, search, limit, offset, order_by). | JWT | `emailService.getTemplates()` — EmailComposeModal (active templates for the record's object) and EmailTemplateBuilderPage (all templates list). |
| `GET /api/email/templates/categories` | Templates grouped by category. | JWT | `emailService.getTemplateCategories()` — no direct frontend caller found. |
| `GET /api/email/templates/top` | Most-used templates (default 10). | JWT | `emailService.getTopTemplates()` — no direct frontend caller found. |
| `GET /api/email/templates/:id` | Fetch one template; 404 if missing. | JWT | `emailService.getTemplate()` — EmailComposeModal (on template select) and EmailTemplateBuilderPage (edit load). |
| `POST /api/email/templates` | Create a template (records `created_by`). Returns 201. | JWT | `emailService.createTemplate()` — EmailTemplateBuilderPage save (new). |
| `PUT /api/email/templates/:id` | Update a template (records `updated_by`). | JWT | `emailService.updateTemplate()` — EmailTemplateBuilderPage save (edit). |
| `DELETE /api/email/templates/:id` | Delete a template. | JWT | `emailService.deleteTemplate()` — EmailTemplateBuilderPage delete action. |
| `GET /api/email/templates/fields/:objectId` | Insertable variable list for an object ({name,label}, internal fields excluded) plus common system variables (sender_name, company_name, etc.). Powers the variable picker. | JWT | `emailService.getTemplateFields()` — EmailComposeModal and EmailTemplateBuilderPage variable picker. |
| `POST /api/email/templates/:id/render` | Render template with supplied `variables` (preview, no send). | JWT | `emailService.renderTemplate()` — EmailComposeModal preview and EmailTemplateBuilderPage live preview. |
| `GET /api/email/templates/:id/analytics` | Usage/analytics for a template; 404 if missing. | JWT | `emailService.getTemplateAnalytics()` — no direct frontend caller found. |
| `GET /api/email/templates/:id/resolve/:recordId` | Auto-resolve template variables from a CRM record's field data; also returns the record's "To" email. 404 on error. | JWT | `emailService.resolveVariables()` — EmailComposeModal, pre-fills variables/recipient when composing from a record. |
| `POST /api/email/send` | Primary send: renders template, dispatches, writes `EmailLog`, optionally logs an Activity. Returns 201 `{ email_log, activity }`. | JWT | `emailService.sendEmail()` — EmailComposeModal send when a template is selected. |
| `POST /api/email/send-raw` | Send a one-off email without a template (subject + body_html/text). Returns 201. | JWT | `emailService.sendRawEmail()` — EmailComposeModal send in free-form/raw mode. |
| `POST /api/email/send-with-pdf` | Convert `pdf_html` to a real PDF via Chrome headless, attach it (+ any `extra_attachments`), and send; falls back to inline HTML if Chrome is unavailable. Validates to_email/subject/pdf_html (400 otherwise). Returns 201 with `pdf_attached`. | JWT | Direct `api.post('/email/send-with-pdf', …)` from PDFViewer.jsx — emails a rendered document as a PDF attachment. |
| `GET /api/email/record/:recordId` | All emails sent in the context of a CRM record (history). | JWT | `emailService.getEmailsForRecord()` — no direct frontend caller found. |

---

## Documents · `/api/documents`

The **standalone Document Management System (DMS)**: a domain-neutral document platform backed by `DocumentService`
(pluggable storage + DB) plus the folder, share, template, and e-signature services. Uploads are base64 JSON payloads
restricted to an allowed MIME whitelist (PDF, Office docs, text/csv, common images). Create/delete on a record-attached
document also write a best-effort `auditLog` entry to the parent record's timeline. Tenant scoping via `getTenantId()`.
Responses reshape rows through `toApiDoc` to legacy field names (`filename`, `related_to_id`, `related_to_type`) and
never expose the extracted `content_text`. See [DOCUMENT_MANAGEMENT.md](DOCUMENT_MANAGEMENT.md) for the full design.

**Auth:** the authenticated routes below require a valid JWT (`authenticate`). Two route families are **public
(token-gated, no JWT)** — the share surface (`/public/:token`) and the signing surface (`/sign/:token`) — gated only by
an unguessable token; they carry no tenant context and resolve by token. Numeric params (`related_record_id`,
`folder_id`, `limit`, `offset`, `recordId`) are validated and return 400 on non-integers.

### Core documents

| Method & Path | Purpose / Relevance | Auth | When & how it's invoked |
|---|---|---|---|
| `POST /api/documents/upload` | Upload a base64 file with metadata (`category`, `description`, `folder_id`, `related_record_id`/`related_type`). Validates filename+data (400) and MIME whitelist (400); enforces per-category MIME/size/review policy. Dedup+versioning are scoped to the owner (or, for owner-less uploads, the folder). Writes `document_create` audit entry. Returns 201. | JWT | `documentService.upload()` — DocumentPanel / Documents page upload. |
| `GET /api/documents` | List/filter documents (`related_record_id`, `related_type`, `category`, `folder_id` [`''`/`null` = Unfiled], `search`, `limit=50`, `offset=0`). `search` matches metadata (LIKE) **and** document contents (MySQL FULLTEXT). Returns `{ documents, total }`. | JWT | `documentService.list()` — Documents page listing/search. |
| `GET /api/documents/:id` | Single document metadata; 404 if missing. | JWT | `documentService.get()`. |
| `GET /api/documents/:id/download` | Stream the file as an attachment (RFC 5987-encoded Content-Disposition); 404 if the row or stored file is missing. | JWT | DocumentPanel / Documents page download. |
| `PUT /api/documents/:id` | Update document metadata (filename, category, `folder_id`, description, notes, entity link, is_public). | JWT | `documentService.update()`. |
| `DELETE /api/documents/:id` | Soft-delete a document; writes `document_delete` audit entry. Returns 204; 404 if missing. | JWT | DocumentPanel / Documents page delete. |
| `GET /api/documents/record/:recordId` | All documents attached to a record (limit 200). | JWT | DocumentPanel loads a record's documents. |

### Folders

| Method & Path | Purpose / Relevance | Auth | When & how it's invoked |
|---|---|---|---|
| `GET /api/documents/folders` | Flat, path-ordered folder tree (frontend assembles hierarchy). | JWT | Documents page folder rail. |
| `POST /api/documents/folders` | Create a folder (`name`, `parent_id?`). Name is sanitised of path separators. Returns 201. | JWT | Folder rail — new folder. |
| `PUT /api/documents/folders/:id` | Rename/move a folder (re-materialises descendant paths; blocks moving into a descendant). | JWT | Folder rail — rename/move. |
| `DELETE /api/documents/folders/:id` | Delete a folder (children cascade; documents fall back to Unfiled). 204; 404 if missing. | JWT | Folder rail — delete. |

### Sharing & engagement analytics

| Method & Path | Purpose / Relevance | Auth | When & how it's invoked |
|---|---|---|---|
| `POST /api/documents/:id/share` | Mint a public share link (`expires_in_days?`, `allow_download?`). Returns 201 with token. | JWT | Share & Analytics modal. |
| `GET /api/documents/:id/shares` | List a document's share links. | JWT | Share & Analytics modal. |
| `DELETE /api/documents/shares/:linkId` | Revoke (deactivate) a share link. | JWT | Share & Analytics modal. |
| `GET /api/documents/:id/analytics` | Aggregated engagement: view/download counts, active links, recent events. | JWT | Share & Analytics modal. |
| `GET /api/documents/public/:token` | **Public.** Document metadata for a share link; records a `view` event. 404 if unknown/expired/revoked. | Token | `SharedDocumentPage` public view. |
| `GET /api/documents/public/:token/download` | **Public.** Stream the file for a share link; records a `download` event. 403 if downloads disabled. | Token | `SharedDocumentPage` download. |

### Merge templates → documents

| Method & Path | Purpose / Relevance | Auth | When & how it's invoked |
|---|---|---|---|
| `POST /api/documents/templates/:id/preview` | Render a template against `{ data }` without storing; returns `{ format, content, placeholders }`. | JWT | Template preview in the builder. |
| `POST /api/documents/templates/:id/render` | Render + store the output as a first-class Document (`filename?`, `entity_type?`, `entity_id?`, `folder_id?`). Returns 201. | JWT | Generate document from template. |

### Native e-signature

| Method & Path | Purpose / Relevance | Auth | When & how it's invoked |
|---|---|---|---|
| `POST /api/documents/:id/signature-requests` | Create a signature request (`title?`, `message?`, `ordered?`, `expires_in_days?`, `signers[]`). Nested signatories are stamped with `tenant_id`. Returns 201. | JWT | "Request Signatures" modal. |
| `GET /api/documents/:id/signature-requests` | List a document's signature requests + per-signer status. | JWT | "Request Signatures" modal. |
| `DELETE /api/documents/signature-requests/:reqId` | Cancel a signature request. | JWT | "Request Signatures" modal. |
| `GET /api/documents/sign/:token` | **Public.** Resolve a signing link (signer, request, document meta); records first view. 404 if unknown/completed/expired/declined. | Token | `SignDocumentPage`. |
| `GET /api/documents/sign/:token/document` | **Public.** Stream the document under review (inline). | Token | `SignDocumentPage` preview. |
| `POST /api/documents/sign/:token` | **Public.** Apply a signature (`type` drawn/typed, `data`). Enforces signing order; on the last signer, atomically completes the request and generates an HTML certificate Document. | Token | `SignDocumentPage` sign. |
| `POST /api/documents/sign/:token/decline` | **Public.** Decline to sign (`reason?`); marks the request declined. | Token | `SignDocumentPage` decline. |

### Builder configuration · `/api/builder` (read: JWT · write: admin)

| Method & Path | Purpose / Relevance |
|---|---|
| `GET/POST/PUT/DELETE /api/builder/document-categories[/:id]` | Configure categories: allowed MIME, max size, retention, review-required, required-document, colour. |
| `GET/POST/PUT/DELETE /api/builder/document-checklists[/:id]` | Required-document checklists per entity type. |
| `GET/POST/PUT/DELETE /api/builder/document-templates[/:id]` | Manage merge templates (body, format, output category, active). |

---

## Social Media · `/api/social-media`

Full social suite backed by `SocialMediaService` and `SocialAssignmentService`. Three permission tiers, enforced
per-route:

- **`authenticate`** (any user) — read all resources, reply to mentions, convert a mention to a lead, sync one account.
- **`requireManager`** (manager+) — create/edit posts & campaigns, publish/retry posts.
- **`requireAdmin`** (admin+) — connect/manage accounts & tokens, OAuth, keywords, routing rules, delete resources,
  run the publish sweep and the org-wide sync.

Every handler is wrapped in `scopedHandler` (tenant context), create routes stamp `created_by`/`managed_by` and
`tenant_id` from `req.user`, and account responses never include tokens (`has_access_token`/`has_refresh_token`
instead). Two schedulers drive the module without any client call: `social-publish` (every minute) and
`social-sync` (every 5 minutes, honouring each account's `sync_frequency`) — see
[SOCIAL_ENGINE.md](SOCIAL_ENGINE.md). Frontend usage lives in SocialMediaPage.jsx (runtime) and
SocialMediaBuilderPage.jsx (admin), both over `frontend/src/services/social-media.service.js`.

### Overview

| Method & Path | Purpose / Relevance | Auth | When & how it's invoked |
|---|---|---|---|
| `GET /api/social-media/overview` | Totals (accounts, posts, scheduled/failed posts, mentions, open mentions, campaigns, keywords, expiring tokens), breakdowns by platform/sentiment/post status, engagement over recent posts, connector modes. | JWT | `getOverview()` — Feed (runtime) and Overview (builder). |

### Accounts

| Method & Path | Purpose / Relevance | Auth | When & how it's invoked |
|---|---|---|---|
| `GET /api/social-media/accounts` | List active accounts (`platform`, `connection_status`, `include_inactive`). | JWT | `getAccounts()` — both pages. |
| `GET /api/social-media/accounts/:id` | Fetch one account (tokens stripped). | JWT | `getAccount()`. |
| `POST /api/social-media/accounts` | Connect an account; validates platform/type/frequency; stamps managed_by/tenant_id. 201. | Admin | `createAccount()` — builder Connect Account. |
| `PUT /api/social-media/accounts/:id` | Update settings; blank token fields keep existing tokens. | Admin | `updateAccount()` — builder Edit. |
| `DELETE /api/social-media/accounts/:id` | Soft-delete (inactive + disabled). 204. | Admin | `deleteAccount()` — builder. |
| `POST /api/social-media/accounts/:id/toggle` | Enable/disable (`is_active`). | Admin | `toggleAccount()` — builder card. |
| `POST /api/social-media/accounts/:id/refresh-token` | Body with `access_token` = manual rotation; empty body = connector `refreshToken` using the stored refresh token. | Admin | `refreshToken()` — builder **Refresh token**. |
| `POST /api/social-media/accounts/:id/sync` | Sync one account now, sequentially: token check → metrics → mentions → engagement → stamp `last_sync_at`. | JWT | `syncAccount()` — **Sync Now** on both pages. |
| `GET /api/social-media/oauth/:id/authorize` | `{ url, state }` — the platform consent URL with an HMAC-signed, 15-minute `state`. | Admin | `getOAuthUrl()` — builder **Authorize**; the browser is sent to `url`. |
| `GET /api/social-media/oauth/callback` | Verifies `state`, exchanges `code` via the connector, stores tokens, redirects to `${APP_URL}/builder/social-media?oauth=success\|error`. | public | The platform (or the simulation connector) redirects the browser here. |

### Posts

| Method & Path | Purpose / Relevance | Auth | When & how it's invoked |
|---|---|---|---|
| `GET /api/social-media/posts` | List posts; hides `deleted` unless `status`/`include_deleted`; `status=scheduled` sorts by `scheduled_for`. | JWT | `getPosts()` — both pages, with the status filter. |
| `GET /api/social-media/posts/:id` | Fetch one post. | JWT | `getPost()`. |
| `POST /api/social-media/posts` | Create as `draft` or `scheduled` (scheduled needs content + `scheduled_for`); account must be active. 201. | Manager | `createPost()` — Create Post on both pages. |
| `PUT /api/social-media/posts/:id` | Edit; published/publishing posts accept only promotion fields (409 otherwise); status limited to draft/scheduled. | Manager | `updatePost()`. |
| `DELETE /api/social-media/posts/:id` | Soft-delete; a published post is removed from the platform first (502 if the platform refuses). 204. | Admin | `deletePost()` — builder. |
| `POST /api/social-media/posts/:id/publish` | Publish now (draft/scheduled/failed): atomic claim → connector → `published`; on failure `failed` + author notification + 502. | Manager | `publishPost()` — **Publish now** / **Retry**; the same method the scheduler calls. |
| `POST /api/social-media/posts/publish-due` | Run the scheduled-publishing sweep now; returns `{ due, published, failed, skipped, errors }`. | Admin | `publishDue()` — builder Overview **Run publish sweep now**. |

### Campaigns

| Method & Path | Purpose / Relevance | Auth | When & how it's invoked |
|---|---|---|---|
| `GET /api/social-media/campaigns` | List; hides `cancelled` unless `status`/`include_cancelled`. Includes `performance_summary`. | JWT | `getCampaigns()` — both pages. |
| `GET /api/social-media/campaigns/:id` | Fetch one campaign. | JWT | `getCampaign()`. |
| `POST /api/social-media/campaigns` | Create; validates type/status/platforms and end > start. 201. | Manager | `createCampaign()`. |
| `PUT /api/social-media/campaigns/:id` | Edit (same validation). | Manager | `updateCampaign()`. |
| `DELETE /api/social-media/campaigns/:id` | Cancel (soft). 204. | Admin | `deleteCampaign()` — builder. |

### Mentions

| Method & Path | Purpose / Relevance | Auth | When & how it's invoked |
|---|---|---|---|
| `GET /api/social-media/mentions` | Inbox list. Filters: `platform`, `sentiment`, `mention_type`, `account_id`, `requires_response`, `open=true` (awaiting reply), `assigned_to` (`me` = caller). Each row carries `lead_id`/`lead_record_id` when converted. | JWT | `getMentions()` — runtime Inbox (Assigned to me / Needs reply toggles), builder Inbox. |
| `PUT /api/social-media/mentions/:id` | Triage (`assigned_to`, `response_priority`, `requires_response`) or reply (`response_content` → delivered via connector `sendReply` first; 502 if rejected; 409 if already responded). New assignee notified. | JWT | `updateMention()` — Reply (runtime), Re-assign / priority (builder). |
| `POST /api/social-media/mentions/:id/convert-to-lead` | Create a CRM lead from the mention (`lead_source=social_media`, `external_id=social:<platform>:<id>`, idempotent → 409). 201. | JWT | `convertMentionToLead()` — **Convert to lead**. |

### Listening Keywords

| Method & Path | Purpose / Relevance | Auth | When & how it's invoked |
|---|---|---|---|
| `GET /api/social-media/keywords` | List listening keywords. | JWT | `getKeywords()` — builder. |
| `POST /api/social-media/keywords` | Create (validates type/match/priority/platforms). 201. | Admin | `createKeyword()` — builder. |
| `PUT /api/social-media/keywords/:id` | Update. | Admin | `updateKeyword()` — builder. |
| `DELETE /api/social-media/keywords/:id` | Hard delete. 204. | Admin | `deleteKeyword()` — builder. |

Keywords are evaluated on ingest (`pullMentions`): matches are stored on `keywords_matched` and a `high`
keyword raises the mention's `response_priority`.

### Assignment Rules (`SocialAssignmentService`)

Configurable routing for inbound conversations (mentions/DMs), edited on the builder **Routing** tab.

| Method & Path | Purpose / Relevance | Auth | When & how it's invoked |
|---|---|---|---|
| `GET /api/social-media/assignment-rules` | List routing rules (`platform`, `is_active`). | JWT | `getAssignmentRules()` — Routing tab. |
| `GET /api/social-media/assignment-rules/:id` | Fetch one rule. | JWT | — |
| `POST /api/social-media/assignment-rules` | Create a rule; stamps created_by/tenant_id. 201. | Admin | `createAssignmentRule()` — Routing tab. |
| `PUT /api/social-media/assignment-rules/:id` | Update a rule. | Admin | `updateAssignmentRule()` — Routing tab. |
| `DELETE /api/social-media/assignment-rules/:id` | Delete a rule. 204. | Admin | `deleteAssignmentRule()` — Routing tab. |
| `POST /api/social-media/assignment-rules/reorder` | Reorder rules by `ordered_ids`. | Admin | `reorderAssignmentRules()` — Routing tab ▲▼. |

### Connector / Sync Operations

| Method & Path | Purpose / Relevance | Auth | When & how it's invoked |
|---|---|---|---|
| `GET /api/social-media/connector-status` | Which platforms use a live connector vs the simulation. | JWT | `getConnectorStatus()`; the same data is embedded in `/overview`. |
| `POST /api/social-media/sync-all` | `runSyncCycle({ force: true })` — sync every connectable account now, ignoring per-account frequency; returns per-account results and campaigns refreshed. | Admin | `syncAll()` — builder Overview **Sync all accounts now**; the scheduler runs the non-forced variant every 5 minutes. |

---

## Activities · `/api/activities`

Record timeline entries (calls, emails, notes, meetings, etc.) via `ActivityService`. All routes require a valid JWT
(`authenticate`); the service applies its own visibility/ownership checks with `req.user`. Activities are also written
server-side as side effects of email sends. Frontend usage is ActivityTimeline.jsx on a record's detail view.

| Method & Path | Purpose / Relevance | Auth | When & how it's invoked |
|---|---|---|---|
| `GET /api/activities?record_id=X` | List activities for a record (400 if `record_id` missing). | JWT | `activityService.getActivities()` — ActivityTimeline loads a record's timeline. |
| `POST /api/activities` | Create an activity against a record (400 if `record_id` missing). Stamps actor from `req.user`. Returns 201. | JWT | `activityService.createActivity()` — ActivityTimeline "add activity". |
| `PUT /api/activities/:id` | Update an activity. | JWT | `activityService.updateActivity()` — edit timeline entry. |
| `DELETE /api/activities/:id` | Delete an activity. Returns 204. | JWT | `activityService.deleteActivity()` — ActivityTimeline delete. |

---

## Tasks · `/api/tasks`

Task assignment/tracking via `TaskService`. All routes require a valid JWT (`authenticate`). Row-level visibility is
enforced in the route: non-manager users cannot list another employee's tasks — the `employee_id` filter is forced to
the viewer's own id unless the caller is manager+ (`ROLE_LEVEL >= manager`). Frontend usage is TaskPanel.jsx on a
record.

| Method & Path | Purpose / Relevance | Auth | When & how it's invoked |
|---|---|---|---|
| `GET /api/tasks?record_id=&employee_id=&status=` | List tasks by record/employee/status; non-elevated users are scoped to their own tasks. | JWT | `taskService.getTasks({ record_id })` — TaskPanel loads a record's tasks. |
| `GET /api/tasks/my` | Tasks assigned to the current user. | JWT | `taskService.getMyTasks()` — no direct frontend caller found. |
| `POST /api/tasks` | Create a task (creator from `req.user`). Returns 201. | JWT | `taskService.createTask()` — TaskPanel "add task". |
| `PUT /api/tasks/:id` | Update a task (status, patch, etc.). | JWT | `taskService.updateTask()` — TaskPanel edit/complete. |
| `DELETE /api/tasks/:id` | Delete a task. Returns 204. | JWT | `taskService.deleteTask()` — TaskPanel delete. |

---

## Reminders · `/api/reminders`

Time-based reminders / follow-ups via `ReminderService`. All routes require a valid JWT (`authenticate`). Reminders are
personal: visibility is role-scoped (own → hierarchy → all). A 60s scheduler sweep (`ReminderService.sweepDue`, wired in
`app.js`) fires reminders whose `remind_at` has passed as in-app **Notifications** (type `reminder`), so they surface in
the notification bell automatically; each due reminder is claimed with an atomic UPDATE (multi-pod safe). Frontend usage
is ReminderPanel.jsx on a record and the "My Reminders" agenda (`/reminders`).

| Method & Path | Purpose / Relevance | Auth | When & how it's invoked |
|---|---|---|---|
| `GET /api/reminders?record_id=&status=&scope=open` | List reminders (role-scoped); `scope=open` returns pending+notified. | JWT | `reminderService.getReminders({ record_id })` — ReminderPanel. |
| `GET /api/reminders/my?scope=open` | Reminders targeting the current user — the agenda feed. | JWT | `reminderService.getMyReminders()` — RemindersPage. |
| `POST /api/reminders` | Create a reminder (`title`, `remind_at`, optional `record_id`, `priority`, `note`, `employee_id`). Returns 201. | JWT | `reminderService.createReminder()` — ReminderPanel / RemindersPage. |
| `PUT /api/reminders/:id` | Update a reminder (title, note, priority, remind_at, status). | JWT | `reminderService.updateReminder()`. |
| `POST /api/reminders/:id/snooze` | Reschedule by `{ minutes }` or `{ remind_at }` and re-arm to pending. | JWT | `reminderService.snoozeReminder()` — snooze menu. |
| `POST /api/reminders/:id/complete` | Mark done. | JWT | `reminderService.completeReminder()`. |
| `POST /api/reminders/:id/dismiss` | Dismiss without completing. | JWT | `reminderService.dismissReminder()`. |
| `DELETE /api/reminders/:id` | Delete a reminder. Returns 204. | JWT | `reminderService.deleteReminder()`. |

---

## Notifications · `/api/notifications`

Per-user in-app notifications via `NotificationService`; the recipient is resolved from the JWT
(`RequestUtils.getUserId`). All routes require a valid JWT (`authenticate`). Frontend usage is the NotificationBell.jsx
header widget (polls count + list, marks read).

| Method & Path | Purpose / Relevance | Auth | When & how it's invoked |
|---|---|---|---|
| `GET /api/notifications?unread_only=true` | List the current user's notifications (optionally unread-only). | JWT | `notificationService.getNotifications()` — NotificationBell dropdown. |
| `GET /api/notifications/count` | Unread-count badge value. | JWT | `notificationService.getUnreadCount()` — NotificationBell badge (polled). |
| `PATCH /api/notifications/read` | Mark specific notification `ids` read. | JWT | `notificationService.markRead()` — NotificationBell mark-as-read. |
| `PATCH /api/notifications/read-all` | Mark all of the user's notifications read. | JWT | `notificationService.markAllRead()` — NotificationBell "mark all read". |

---

## Access · `/api/access`

Mounted from `backend/src/routes/access/index.js` (`SegmentationService`, `AuditChainService`). *Compliance*
means an admin role or a role holding the `barrier_override` operational permission. Listing and deciding
wall-crossings also accepts the `wall_crossing_decide` operational permission (it grants no view inside a barrier).
All bodies are schema-validated.

| Method & Path | Purpose / Relevance | Auth |
|---|---|---|
| GET `/api/access/business-units` | List units with members | JWT |
| POST `/api/access/business-units` · PUT `/:id` | Create / update a unit (`code`, `name`, `legal_name`, `regulator`, `licence`, `base_currency`, `is_active`) | Admin |
| PUT `/api/access/business-units/:id/members` | Replace the unit's members; body `{ employee_ids, primary_ids? }`. Chained. | Admin |
| GET `/api/access/barrier-zones` | List zones with members | Compliance |
| POST `/api/access/barrier-zones` · PUT `/:id` | Create / update a zone | Compliance |
| POST `/api/access/barrier-zones/:id/members` · DELETE `/:id/members/:employeeId` | Add / remove a standing member. Chained. | Compliance |
| GET `/api/access/barrier-zones/:id/insiders` | Current insiders (standing and crossed, unexpired) — the insider list | Compliance |
| POST `/api/access/wall-crossings` | Request a crossing; body `{ zone_id, employee_id?, reason }` | JWT |
| GET `/api/access/wall-crossings?status=` | List crossings | Compliance |
| POST `/api/access/wall-crossings/:id/decide` | Approve or reject; body `{ approve, valid_days? (1–365, default 30) }`. The requester cannot decide. | Compliance |
| GET `/api/access/audit-chain?entity_type=&entity_id=&limit=&offset=` | Chained events, newest first | Compliance |
| GET `/api/access/audit-chain/verify` | Recompute the chain: `{ ok, events, broken_at, reason }` | Compliance |

## Public forms · `/api/public`

Mounted from `backend/src/routes/public/index.js`. **No authentication**: the 48-hex key identifies the form and its
tenant. Rate limits: 20 submissions per IP and 600 per form per 10 minutes (429 with `Retry-After`). Body limit 64 KB.

| Method & Path | Purpose / Relevance |
|---|---|
| GET `/api/public/forms/:key` | Query `expert?`. The renderable form: `{ tenant_id, workspace, title, description, columns, consent_field, captcha, captcha_site_key, fields, expert }` (`expert: { id, name }` when the ID names active staff in the form's `expert_roles`, else `null`). A picklist narrowed by the form's `field_options` lists only the allowed values; `tenant_id` lets the page load the workspace's public theme |
| POST `/api/public/forms/:key` | Submit; body `{ data, _hp?, captcha_token?, utm?: { utm_source, … }, page_url?, referrer?, language?, expert? }`. Creates the record through `RecordService` in the form's tenant, assigned to the `expert` when they are eligible (otherwise the assignment rules apply); a value outside a narrowed picklist is refused (400). Returns `{ message, reference, results?, result_fields? }` — `result_fields: [{ name, label, format, precision }]` describes the computed results |
| GET `/api/public/feeds/:workspace/:name` | Read-only data feed configured by an object's `config.public_feed`: `{ feed, updated_at, items }`. Any origin; cached 60 s on the server and 5 min by clients; 300 requests per IP per 10 minutes. Personal or encrypted fields are never included. |
| GET `/api/public/workspaces/:slug/forms` | The workspace's published forms for a website: `{ tenant_id, workspace, forms: [{ title, description, path }] }`. 404 unless the workspace is active. 120 requests per IP per 10 minutes |
| GET `/api/public/email-open/:token.gif` | Email-open pixel (`geo1.` token, HMAC-signed). Always returns a 1×1 GIF; a valid token stamps `opened_at` on the email log once and recounts the opens into the tracked record field |

## Portal · `/api/portal`

Mounted from `backend/src/routes/portal/index.js`. A separate realm: sign-in by a one-time email code, and a `gp1.` portal token that staff routes never accept (and vice versa). Every handler runs inside the token's tenant. Rate limits: 30 sign-in attempts per IP and 5 codes per email per 15 minutes.

| Method & Path | Purpose |
|---|---|
| GET `/api/portal/:slug` | Workspace branding (`tenant_id`, name, logo, colour) for the sign-in page |
| POST `/api/portal/:slug/login/request` | Body `{ realm: client \| introducer, email }`. Sends a code when the email matches a record (always answers the same way). Outside production with no SMTP, returns `dev_code` |
| POST `/api/portal/:slug/login/verify` | Body `{ realm, email, code }` → `{ token, me }` |
| GET `/api/portal/me` | The signed-in person |
| GET `/api/portal/views` | The sections (`config.portal.<realm>`) available to this realm |
| GET / POST `/api/portal/records/:object` | The user's own records of a portal object / create one (only `create.fields`, with `create.defaults`) |
| POST `/api/portal/records/:object/:id/actions/:action` | Run a row action (`config.portal.<realm>.row_actions`, e.g. *Redeem* on a fund holding) on one of the user's own rows: creates a record in the action's target section with the user's `fields`, the row's `prefill` values and the configured `defaults` (never taken from the request). Returns `{ id, object }` |
| GET `/api/portal/records/:object/options/:field` | Options for a create-form lookup, limited to the user's own records |
| GET `/api/portal/documents` · GET `…/documents/:id/download` | Portal-visible documents on the user's records |
| POST `/api/portal/records/:id/documents` | Upload (base64; PDF, JPEG, PNG; 10 MB) to a record whose section allows `uploads` |
| GET / POST `/api/portal/messages` | Messages with the record owner (stored as activities; the owner is notified) |

## Calendar · `/api/calendar`

| Method & Path | Purpose | Auth |
|---|---|---|
| GET `/api/calendar/subscription` | `{ path }` of the user's private iCalendar feed | JWT |
| GET `/api/calendar/feed/:token.ics` | `text/calendar`: the user's scheduled activities, open tasks and pending reminders (−30 to +180 days). The token is signed over the user's revocation point; any failure answers 404. 120 requests per IP per hour | The token |

## Web forms · `/api/web-forms`

Mounted from `backend/src/routes/web-forms/index.js`; `WebFormShareService`. Any signed-in staff member; tenant-scoped.

| Method & Path | Purpose |
|---|---|
| GET `/api/web-forms` | The workspace's published forms: `[{ id, key, title, description, object, path, field_count, products, channel, expert_roles, experts }]` (`experts` = `[{ value: employee_id, label }]`, the active staff whose role is in the form's `expert_roles`) (`products` = the options of the form's product picker, after `field_options`) |
| POST `/api/web-forms/:id/link` | Body `{ prod?, expert? }` → `{ url }`: `/f/<key>?prod=…&expert=…&utm_source=crm&utm_medium=link&utm_campaign=form_share`. The base is `APP_URL`, else the browser's origin. A product the form does not offer, or an `expert` who is not eligible for it → 400 |
| POST `/api/web-forms/:id/send` | Body `{ to, name?, prod?, expert?, message?, language: en\|fr, record_id? }`. Emails the link (`utm_medium=email`) through `EmailSendService.sendRaw`, logged with `related_type: 'web_form'`; user text is HTML-escaped. 30 sends per user per hour (429). Returns `{ url, status, email_log_id }` |

## Upload links · `/api/upload-links`

Mounted from `backend/src/routes/upload-links/index.js`; `DocumentChecklistService`, `UploadLinkService`.

A link is `/upload/gul1.<payload>.<hmac>`. The payload holds the tenant, the record, an optional checklist and the
expiry; it is signed with `UPLOAD_LINK_SECRET` (default: derived from `JWT_SECRET`). Nothing is stored, so a link
cannot be revoked before it expires; keep the validity short.

| Method & Path | Auth | Purpose |
|---|---|---|
| GET `/api/upload-links/records/:id/checklist` | JWT; the user must be able to open the record | `{ record, checklists: [{ id, label, items: [{ label, category, category_label, required, received, documents }] }], outstanding, categories }`. The checklist matching the record's product is listed first |
| POST `/api/upload-links/records/:id` | JWT; as above | Body `{ days? (1–60, default 14), checklist_id?, email?: { to, name?, language: en\|fr } }` → `{ url, token, expires_at, email? }`. With `email`, the link is sent (logged against the record); 30 sends per user per hour |
| GET `/api/upload-links/:token` | **Public** (token) | What the client sees: `{ tenant_id, workspace, what, reference, expires_at, items: [{ label, category, required, received }] }`. No file names or other documents. Invalid or expired token → 404. 120 requests per IP per 10 minutes |
| POST `/api/upload-links/:token` | **Public** (token) | Body `{ filename, mime_type, data (base64), category }` → 201. The category must be one the link requests; the content must be a PDF, JPEG or PNG (checked by its first bytes) under 10 MB. Stored through `DocumentService` against the record, status *uploaded* (*under review* where the category requires review). 30 uploads per IP per 10 minutes |
