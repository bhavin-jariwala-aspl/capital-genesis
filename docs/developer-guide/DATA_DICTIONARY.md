# Database Data Dictionary — Purpose & Data Lifecycle

> ⚠️ **July 2026 — 65 tables removed.** Nine never-implemented domains (Email Campaigns,
> Calendar/Meetings, Analytics/KPI, Contracts, Deal Stages, Territories, Sales Teams,
> Customer Portal/Knowledge, Partner/Channel) plus `call_logs` and three unused social
> tables were dropped (migration `20260708120000_drop_orphaned_domains`). Entries below for
> those tables are historical only; the Prisma schema is the source of truth.

> **Companion to** [DATABASE_SCHEMA.md](DATABASE_SCHEMA.md). That document is the column-level reference (types,
> nullability, defaults). **This** document explains, for every table: **why it exists**, **when & how its rows are
> written**, and **what the stored data represents and why**.
>
> **Source of truth:** [`backend/prisma/schema.prisma`](../../backend/prisma/schema.prisma) (97 models) and the
> services under [`backend/src/services/`](../../backend/src/services/) that read and write these tables.
> **Engine:** MySQL (AWS RDS) via Prisma.

## How to read this document

Each table is documented as:

- **Why this table exists (relevance)** — the business/technical reason it is in the schema and what would break without
  it.
- **When & how rows are written** — the user action, service, scheduler, import, or webhook that inserts/updates/deletes
  rows.
- **What the data represents & notable columns** — the meaning of the stored data, notable columns, enum-like value
  sets, and JSON blob shapes.
- **Related to** — the key foreign-key relationships in plain language.

### Cross-cutting conventions

- **Multi-tenancy.** Almost every table carries a `tenant_id` (INTEGER) that scopes rows to a single tenant and
  references `tenants(id)`. A global Prisma middleware
  ([`middleware/tenant-scope.js`](../../backend/src/middleware/tenant-scope.js)) injects the current request's tenant
  into every query, so application code rarely sets it explicitly. The domain intros below therefore do **not** repeat
  this on every table.
- **Naming.** `ui_*` tables hold **UI configuration / low-code metadata**; `crm_*` tables hold **relational CRM entity
  data**; unprefixed tables are operational/org data. Model names are PascalCase (`CrmAccount`); the physical table name
  (`crm_accounts`, via `@@map`) is shown in each heading.
- **Keys.** Most surrogate PKs are `INTEGER AUTO_INCREMENT`. `employees.employee_id` and all employee references
  (`owner_id`, `assigned_to`, `created_by`, `updated_by`, …) are `VARCHAR(20)` employee IDs.
- **Timestamps.** `created_at` / `updated_at` are `DATETIME(3)`; `created_at` defaults to the insert time, `updated_at`
  is stamped by Prisma `@updatedAt` on every write.
- **The polymorphic bridge.** `records` is a universal anchor row for any object instance. Typed CRM tables
  (`crm_*`) each hold a one-to-one nullable `record_id → records.id` so that shared machinery
  (activities, tasks, audit logs, pipeline stage, assignment) can reference any entity uniformly. `CrmService` performs
  a **dual-write**: it writes the typed row and its `records` anchor together.

---

## Contents

- [Organization & Identity](#organization--identity)
- [UI Metadata & Low-Code Engine](#ui-metadata--low-code-engine)
- [Generic Records & Activity Engine](#generic-records--activity-engine)
- [Permissions](#permissions)
- [Assignment, Quotas, Import & Integrations](#assignment-quotas-import--integrations)
- [CRM Core](#crm-core)
- [Products](#products)
- [Email, Campaigns & Lead Scoring](#email-campaigns--lead-scoring)
- [Calendar, Meetings & Calls](#calendar-meetings--calls)
- [Reporting & Analytics](#reporting--analytics)
- [Contracts & CLM](#contracts--clm)
- [Deals, Territories & Sales Teams](#deals-territories--sales-teams)
- [Customer Portal & Service](#customer-portal--service)
- [Social Media](#social-media)
- [Partners & Channel](#partners--channel)
- [Multi-Tenant Platform & Administration](#multi-tenant-platform--administration)
- [SLA Engine](#sla-engine)
- [Access Segmentation & Audit Chain](#access-segmentation--audit-chain)
- [Sessions & Background Jobs](#sessions--background-jobs)

---

## Organization & Identity

> **Tenant scoping:** Every table in this domain is multi-tenant. Each row carries a `tenant_id` FK to `tenants.id`
> (with a matching `@@index([tenant_id])`) and all queries are filtered by the caller's tenant. The one exception is
> `roles`, whose `tenant_id` is nullable — a `NULL` value marks a system-default role shared across all tenants, while a
> set value marks a tenant-specific custom role. Tenant scoping is assumed below and only called out again where it
> changes uniqueness or behaviour.
>
> **Four identity columns in this domain are unique across the whole installation, not per tenant:**
> `employees.employee_id` (the primary key), `employees.email`, `regions.region_code` and `branches.branch_code`. Two
> tenants therefore cannot both have an `ADMIN001`, a `WEST` region or an `HQ` office. Tenant provisioning works around
> it — the onboarding wizard checks availability before you submit and suggests a workspace-prefixed employee id, and
> provisioning generates tenant-qualified `T<id>-HQ` region and branch codes — but making these composite with
> `tenant_id` is the real fix and needs a migration. See
> [../admin-guide/TENANT_ONBOARDING.md](../admin-guide/TENANT_ONBOARDING.md#known-schema-constraints).

### `regions`  ·  Prisma model `Region`

**Why this table exists (relevance):** Top level of the geographic org structure. Regions group branches and give
employees a coarse territorial scope used for reporting rollups and access filtering. Without it, branches have no
parent grouping and region-level dashboards/quotas cannot be aggregated.
**When & how rows are written:** Seeded/provisioned per tenant during onboarding (tenant provisioning), then managed by
admins through the platform/org-admin routes. Low write volume — effectively reference data.
**What the data represents & notable columns:**

- `region_name` — display name (VarChar 100).
- `region_code` — short code (VarChar 10), globally `@unique`.
- `is_active` — soft on/off flag; inactive regions are hidden rather than deleted.

**Related to:** Parent of `branches` (one region → many branches) and of `employees` (`employees.region_id`). Belongs to
a `tenant`.

### `branches`  ·  Prisma model `Branch`

**Why this table exists (relevance):** Second level of the org geography — a physical/logical office under a region.
Employees are posted to a branch, so branch scoping drives who sees whose records and how numbers roll up to a region.
Without it there is no office-level grouping between region and employee.
**When & how rows are written:** Seeded during tenant provisioning and thereafter maintained by admins via
platform/org-admin routes. Reference-data write volume.
**What the data represents & notable columns:**

- `branch_name` / `branch_code` — display name and short code; `branch_code` is globally `@unique`.
- `region_id` — required FK to the owning region.
- `address` — free-text office address (Text, optional).
- `is_active` — soft on/off flag.

**Related to:** Child of `regions` (`region_id`), parent of `employees` (`employees.branch_id`). Belongs to a `tenant`.

### `roles`  ·  Prisma model `Role`

**Why this table exists (relevance):** Defines the named authorization roles used across the app (permissions,
dashboards `min_role`, operational scopes). Both system-default roles and tenant-custom roles live here. Without it
there is no vocabulary of roles to attach permissions to.
**When & how rows are written:** System-default rows (`tenant_id = NULL`) are created by seed/migration; tenant-custom
rows are created by admins. Individual rows are updated via `PATCH` in the auth routes (`prisma.role.update`).
**What the data represents & notable columns:**

- `name` — machine key, e.g. `super_admin | admin | manager | user` or a custom name; validated in application code
  (there is no DB enum).
- `label` — human-friendly display name.
- `level` — integer hierarchy level (default 1) that determines access scope; higher-privilege roles carry higher
  levels.
- `tenant_id` — **nullable**: `NULL` = shared system default, set = tenant custom role.
- Uniqueness: `@@unique([tenant_id, name])` — a name is unique within a tenant (and once among system defaults).

**Related to:** Not a hard FK from `employees`; instead `employees.role` stores the role `name` as a string and the app
resolves it against `roles` via the `(tenant_id, name)` pair (see comment in `Employee`). Belongs to a `tenant`
(optionally).

### `employees`  ·  Prisma model `Employee`

**Why this table exists (relevance):** The core identity/user table — every human actor (agent, manager, admin) that
logs in, owns records, is assigned work, and appears in the org hierarchy. It is the authentication principal and the
assignee target for nearly all operational tables. Nothing in the CRM runs without it.
**When & how rows are written:** Created by admins through the platform routes (`prisma.employee.create`, e.g.
platform/org-admin employee provisioning). Updated by the same admin routes and by the auth routes
(`prisma.employee.update`) for profile edits and password-reset flows. Deletions cascade closure-table rows.
**What the data represents & notable columns:**

- `employee_id` — **string** primary key (VarChar 20), e.g. `E001`; used as the FK target across the whole schema
  (owners, assignees, creators).
- `employee_name`, `email` (`@unique`, nullable), `phone`.
- `role` — role `name` string (validated in app code against `roles`, no FK).
- `password` — hashed credential (VarChar 255).
- `branch_id` / `region_id` — optional postings into the org geography.
- `reset_token` (sha256 hash of the active password-reset token) and `reset_token_expires` — support the forgot-password
  flow.
- `is_active` — enable/disable login.
- `tokens_valid_after` — revocation point: every token issued earlier is refused (set on deactivation, password
  change and *Sign out everywhere*).
- `mfa_enabled`, `mfa_secret` (encrypted TOTP secret), `mfa_recovery` (hashes of unused recovery codes) — two-factor
  sign-in.

**Related to:** Optionally belongs to a `branch` and a `region`. Appears on both sides of `employee_hierarchy` (as
ancestor and descendant). Is the FK target for a large set of operational relations — activities, tasks
(assignee/creator), notifications, audit logs, assigned `records`, quotas, CRM ownership
(leads/contacts/accounts/opportunities/cases), calendar/meeting, and territory/team membership. Belongs to a `tenant`.

### `employee_hierarchy`  ·  Prisma model `EmployeeHierarchy`

**Why this table exists (relevance):** A **closure table** that materialises every ancestor→descendant reporting pair at
every depth, so "who reports to me" and "everyone below me" can be answered with a single indexed query instead of
recursive walks. It powers hierarchy-scoped permissions (`team` = depth 1, `hierarchy` = any depth) for tasks/activities
and record visibility. Without it, manager rollups and scope checks would require recursive CTEs on every request.
**When & how rows are written:** Written by `HierarchyService` when an employee's manager is set/changed: it
`deleteMany`s the employee's existing pairs and re-inserts the full ancestor/descendant set (`createMany` / `upsert`). A
self-referencing row with `depth = 0` is always present for every employee. Rows cascade-delete when either linked
employee is deleted.
**What the data represents & notable columns:**

- `ancestor_id` / `descendant_id` — both FKs to `employees.employee_id`; composite primary key
  `@@id([ancestor_id, descendant_id])`.
- `depth` — number of hops between the two (0 = self, 1 = direct report). Indexed for fast depth-based scope filtering.

**Related to:** Both columns reference `employees` (relations `HierarchyAncestor` / `HierarchyDescendant`,
`onDelete: Cascade`). Belongs to a `tenant`.

## UI Metadata & Low-Code Engine

> **What this domain is:** These `ui_*` tables are the low-code/metadata engine. Admins use a Builder UI to define
> modules, objects, fields, forms, layouts, validations, dependencies, pages, dashboards, charts, workflows, wizards and
> pipelines; the runtime then renders and enforces those definitions instead of hard-coded screens. The definitions are
> cached in Redis for fast metadata access. Most writes come from **`MetadataService`**
> (`backend/src/services/metadata.service.js`, the Object/Field/Form Builder) and **`DashboardService`**
> (`backend/src/services/dashboard.service.js`, the Dashboard/Chart/Pipeline/Wizard/Workflow builders); the workflow
> **runtime** writes `workflow_pending_steps`.
>
> **Tenant scoping:** Every table here carries a `tenant_id` FK to `tenants.id` (with `@@index([tenant_id])`);
> definitions are per-tenant. Not repeated per table below.

### `ui_modules`  ·  Prisma model `UiModule`

**Why this table exists (relevance):** Top-level navigation / functional grouping (the sidebar sections). Objects hang
off modules, so a module is the container that gives the app its navigation shape. Without it there is no grouping for
objects in the UI.
**When & how rows are written:** Created/updated/deleted by `MetadataService` (`uiModule.create/update/delete`) when an
admin manages modules in the Builder.
**What the data represents & notable columns:**

- `name` / `label` — machine name and display label.
- `icon` — Lucide icon name; `color` — Tailwind color token (e.g. `"blue"`).
- `category` — sidebar grouping bucket, default `"crm"` (values seen: `crm | tools`).
- `order_index` — sidebar sort order; `is_active` — show/hide.

**Related to:** Parent of `ui_objects` (one module → many objects).

### `ui_objects`  ·  Prisma model `UiObject`

**Why this table exists (relevance):** Defines a data entity within a module (e.g. Lead, Contact, Account). It is the
anchor that fields, forms, pages, pipelines, workflows, wizards, records, assignment rules, imports, quotas and email
templates all attach to — the central hub of the metadata model.
**When & how rows are written:** Created/updated/deleted by `MetadataService` (`uiObject.create/update/delete`) via the
Object Builder. Delete runs in a transaction that also removes dependent metadata.
**What the data represents & notable columns:**

- `module_id` — FK to the owning module.
- `name`, `label`, `plural_label` — singular/plural display naming.
- `icon`, `order_index`, `is_active`.
- `config` (JSON) — record settings: `title_field` (what lookups and related lists show), `business_unit_field`,
  `barrier_zone`, `barrier_zone_field` (how records are stamped for access segmentation).
  `portal: { client?, introducer? }` exposes the object in the client / introducer portal: `title`, `link` (the
  lookup tying a row to the signed-in person), `fields`, `create` (a create form), `uploads`, and `row_actions` (a
  button on each row that creates a record in another portal section — *Redeem* on a fund holding — with `prefill`
  and `defaults` set by the server).

**Related to:** Child of `ui_modules`. Parent/anchor of `ui_fields`, `ui_forms`, `ui_pages`, `ui_pipelines`,
`ui_workflows`, `ui_wizards`, `records`, `assignment_rules`, `import_jobs`, `quotas`, and `email_templates`.

### `ui_fields`  ·  Prisma model `UiField`

**Why this table exists (relevance):** Defines a single field (column) on an object — its type, UI component,
constraints and options. This is the heart of the low-code engine: it drives form rendering, validation
and search/sort. Without it objects have no attributes.
**When & how rows are written:** Created/updated/deleted by `MetadataService` (`uiField.create/update/delete`) in the
Field Builder. No DDL is ever run from a field change — every field lives in the `records.data` JSON and the
`record_field_values` table.
**What the data represents & notable columns:**

- `object_id` — FK to owning object; `name` is the API/DB column name in snake_case, `label` the display name.
- `field_type` — UI component family. Supported set (from schema doc):
  `text` | `textarea` | `number` | `email` | `phone` | `url` |
  `date` | `datetime` | `time` | `select` | `multi_select` | `radio` |
  `checkbox` | `currency` | `percentage` | `rating` | `color` | `file` |
  `image` | `rich_text` | `code` | `lookup` | `formula` | `auto_number`.
- `data_type` — storage/value type: `string | number | boolean | date | array | object`.
- Behaviour flags: `is_required`, `is_unique`, `is_searchable` (default true), `is_sortable` (default true),
  `is_indexed` (a stored flag; it does not change the schema).
- `default_value`, `placeholder`, `help_text`.
- `options` (JSON) — for select/radio/checkbox: array of `{ value, label, color? }`.
- `config` (JSON) — field-type-specific configuration.
- `order_index`, `is_active`.

**Related to:** Child of `ui_objects`. Parent of `ui_validations`, `ui_form_field_layouts`, and both sides of
`ui_field_dependencies` (source/target).

### `ui_forms`  ·  Prisma model `UiForm`

**Why this table exists (relevance):** Defines a form for an object — a named create/edit/view/search screen with a grid
layout. It lets one object expose multiple purpose-built forms; without it there is no configurable data-entry/view
surface.
**When & how rows are written:** Created/updated/deleted by `MetadataService` (`uiForm.create/update/delete`) in the
Form Builder.
**What the data represents & notable columns:**

- `object_id` — FK to owning object.
- `name`, `label`, `description`.
- `form_type` — `create | edit | view | search | modal`.
- `columns` — default grid column count (1–4, default 2).
- `is_active`.
- `public_key` / `config.public` — set only by `POST /api/builder/forms/:id/publish` (never by the ordinary form update):
  a random key that makes the form an unauthenticated web-to-record form at `/f/<key>`, and its settings (consent,
  capture fields, result fields, captcha, success message, and `field_options: { field: [values] }` to narrow a
  picklist on this form only). `expert_roles: [role names]` (set by a vertical pack, kept by re-publishing) lets a
  link `?expert=<employee_id>` assign the submission to an active employee in one of those roles. Staff share published forms from **Tools ▸ Web forms** (`/api/web-forms`).

**Related to:** Child of `ui_objects`. Parent of `ui_form_field_layouts` (field placements) and referenced by
`ui_wizard_steps` (each wizard step maps to a form).

### `ui_form_field_layouts`  ·  Prisma model `UiFormFieldLayout`

**Why this table exists (relevance):** Junction that places a specific field at a specific row/column position inside a
form and can override its presentation. It is what turns a flat field list into a laid-out grid form. Without it forms
would have no ordering or layout.
**When & how rows are written:** Written by `MetadataService` via `uiFormFieldLayout.upsert` when an admin
drags/arranges fields on a form. Rows cascade-delete with their form.
**What the data represents & notable columns:**

- `form_id` + `field_id` — the placed field; `@@unique([form_id, field_id])` so a field appears at most once per form.
- `row`, `col`, `col_span` — grid position and width (columns occupied).
- `order_index`, `is_visible`.
- `config` (JSON) — per-placement overrides (label, placeholder, etc.).

**Related to:** Junction between `ui_forms` (`onDelete: Cascade`) and `ui_fields`.

### `ui_validations`  ·  Prisma model `UiValidation`

**Why this table exists (relevance):** Declarative validation rules attached to a field, evaluated by the runtime on
submit. Keeps validation as configurable metadata rather than hard-coded logic. Without it, field constraints beyond the
basic flags couldn't be defined per tenant.
**When & how rows are written:** Created/updated/deleted by `MetadataService` (`uiValidation.create/update/delete`) in
the Field Builder. Rows cascade-delete with their field.
**What the data represents & notable columns:**

- `field_id` — FK to the validated field.
- `validation_type` — `required | min | max | minLength | maxLength | pattern | custom`.
- `value` — the rule's parameter, e.g. `"10"` for min or a regex `"^[A-Z].*"` for pattern (VarChar 500, optional).
- `error_message` — message shown when the rule fails.
- `order_index` — evaluation order.

**Related to:** Child of `ui_fields` (`onDelete: Cascade`).

### `ui_field_dependencies`  ·  Prisma model `UiFieldDependency`

**Why this table exists (relevance):** Encodes inter-field conditional logic ("when field A meets a condition, do X to
field B") so forms can show/hide, enable/disable, require, or repopulate fields dynamically. Without it, dynamic form
behaviour would be hard-coded per screen.
**When & how rows are written:** Created/updated/deleted by `MetadataService` (`uiFieldDependency.create/update/delete`)
in the Builder. Cascade-deletes with either linked field.
**What the data represents & notable columns:**

- `source_field_id` / `target_field_id` — the trigger field and the affected field (both FK to `ui_fields`).
- `condition_type` —
  `equals | not_equals | contains | not_contains | gt | lt | gte | lte | in | not_in | is_empty | is_not_empty`.
- `condition_value` — value the source is tested against (Text).
- `action_type` — `show | hide | enable | disable | require | unrequire | set_value | set_options | clear`.
- `action_value` — payload for `set_value` / `set_options` actions (Text).

**Related to:** Two relations into `ui_fields` (`DepSourceField` / `DepTargetField`, both `onDelete: Cascade`).

### `ui_pages`  ·  Prisma model `UiPage`

**Why this table exists (relevance):** Defines a named page (list / detail / dashboard / custom) that the runtime
renders, optionally bound to an object. Provides configurable full-page surfaces beyond individual forms.
**When & how rows are written:** Managed by `MetadataService` (`uiPage` create/update) in the Builder.
**What the data represents & notable columns:**

- `object_id` — optional FK (custom pages need not be object-bound).
- `name`, `label`.
- `page_type` — `list | detail | dashboard | custom`.
- `config` (JSON) — page-type-specific layout/config.
- `is_active`.

**Related to:** Optionally child of `ui_objects`.

### `ui_dashboards`  ·  Prisma model `UiDashboard`

**Why this table exists (relevance):** Defines a dashboard — a named, role-gated container of widgets. It is the
home/analytics surface users land on. Without it there is no configurable dashboard layer.
**When & how rows are written:** Created/updated/deleted by `DashboardService` (`uiDashboard.*`) when an admin builds a
dashboard.
**What the data represents & notable columns:**

- `name`, `label`, `description`.
- `min_role` — minimum role to view: `NULL` = all roles, otherwise a role name (e.g. `manager` = manager + admin +
  super_admin).
- `is_default` — the dashboard shown by default; `is_active`.
- `created_by` — `employees.employee_id` of the author.

**Related to:** Parent of `ui_dashboard_widgets`.

### `ui_dashboard_widgets`  ·  Prisma model `UiDashboardWidget`

**Why this table exists (relevance):** A single widget placed on a dashboard's grid, with its position/size and data
binding. This is what actually renders charts, tables, metrics and lists on a dashboard. Without it dashboards are empty
shells.
**When & how rows are written:** Created/updated/deleted by `DashboardService` (`uiDashboardWidget.*`) as an admin
arranges a dashboard grid. Cascade-deletes with its dashboard.
**What the data represents & notable columns:**

- `dashboard_id` — FK to owning dashboard.
- `widget_type` — `chart | table | list | metric | pipeline | custom_html`.
- `title`.
- `x, y, w, h` — react-grid-layout coordinates and size (default 12-column grid; `w` default 6, `h` default 4).
- `chart_id` — optional FK to a `ui_charts` definition (for chart widgets).
- `config` (JSON) — widget-type-specific config. For charts: `chart_type`, `xAxisKey`, and `yAxisKey` (a string, or
  an array of field names for a multi-series chart). For metrics: `valueKey` / `changeKey`. For lists: `columns`.
- `data_source` (JSON) — one of three shapes:
  - `{ type: "endpoint", dataset }` — **the default.** A pointer to an
    [analytics dataset](API_REFERENCE.md#analytics--apianalytics); the widget calls
    `GET /api/analytics/data/<dataset>` at render time, so no numbers are stored on the widget and the dashboard
    never goes stale. `{ type: "endpoint", url, dataPath? }` targets any other internal API path through the
    authenticated axios client.
  - `{ type: "api", url, method?, headers?, dataPath? }` — an external REST endpoint (`http`/`https` only).
  - `{ type: "json", data }` — a static inline payload. Supported for back-compat; nothing seeded uses it.
- `order_index`, `is_active`.

**Related to:** Child of `ui_dashboards` (`onDelete: Cascade`); optionally references `ui_charts`.

### `ui_charts`  ·  Prisma model `UiChart`

**Why this table exists (relevance):** A reusable chart/graph definition (type + config + data source) that widgets can
reference. Centralising charts lets the same visualization be reused across dashboards. Without it, chart config would
have to be duplicated on every widget.
**When & how rows are written:** Created/updated/deleted by `DashboardService` (`uiChart.*`) in the chart builder.
**What the data represents & notable columns:**

- `name`, `label`.
- `chart_type` — one of:
  `bar` | `bar_stacked` | `line` | `area` | `area_stacked` | `pie` | `donut` |
  `scatter` | `bubble` | `radar` | `radial_bar` | `treemap` | `funnel` |
  `heatmap` | `candlestick` | `gauge` | `waterfall` | `composed` | `timeline`.
  These are the values `ChartRenderer` switches on; anything unrecognised falls back to `bar`.
- `config` (JSON) — chart-library-specific config (`xAxisKey`, `yAxisKey`, optional `bars` / `lines` definitions).
- `data_source` (JSON) — same shape as widget `data_source`; seeded chart-library records use
  `{ type: "endpoint", dataset }`.
- `is_active`.

A widget may either link a chart record via `chart_id` or carry its own inline `config` / `data_source`. When both
are present the widget's values win (`resolveWidgetChart()` in `frontend/src/utils/dashboard.js`), so edits in the
builder's config panel take effect without mutating the shared chart definition.

**Related to:** Referenced by `ui_dashboard_widgets` (`chart_id`).

### `ui_workflows`  ·  Prisma model `UiWorkflow`

**Why this table exists (relevance):** Header/definition of a workflow automation — its trigger and metadata. It is the
entry point for the no-code automation engine that reacts to record events or schedules. Without it there is no way to
define automations declaratively.
**When & how rows are written:** Created/updated by `MetadataService` and `DashboardService` (`uiWorkflow.*`) in the
workflow builder. `last_run_at` is stamped by the workflow engine/scheduler (`WorkflowService`) on each execution.
**What the data represents & notable columns:**

- `object_id` — optional FK to the object the workflow acts on.
- `name`, `label`, `description`.
- `trigger_type` — `on_create | on_update | on_delete | scheduled | manual`.
- `trigger_config` (JSON) — e.g. `{ fields: ["status"], interval_minutes: 60 }`.
- `is_active`; `last_run_at` (nullable, set by the engine).

**Related to:** Optionally child of `ui_objects`. Parent of `ui_workflow_steps` and of `workflow_pending_steps`.

### `ui_workflow_steps`  ·  Prisma model `UiWorkflowStep`

**Why this table exists (relevance):** An ordered node in a workflow — condition branches, actions, notifications,
delays, approvals, webhooks, etc. Together the steps form the executable graph the engine walks. Without it a workflow
has a trigger but nothing to do.
**When & how rows are written:** Created/updated/deleted by `MetadataService` / `DashboardService` (`uiWorkflowStep.*`)
as steps are added in the builder. Cascade-deletes with the workflow.
**What the data represents & notable columns:**

- `workflow_id` — FK to owning workflow.
- `name`.
- `step_type` —
  `trigger | condition | action | notification | delay | approval | webhook | create_record | update_related | email_list`.
- `order_index` — sequence.
- `config` (JSON) — step-type-specific configuration.
- `on_true_id` / `on_false_id` — next-step pointers for branching (the false branch applies to `condition` steps).

**Related to:** Child of `ui_workflows` (`onDelete: Cascade`); `on_true_id`/`on_false_id` are soft references to other
step ids.

### `workflow_pending_steps`  ·  Prisma model `WorkflowPendingStep`

**Why this table exists (relevance):** Runtime state for a **paused** workflow execution — created when a workflow hits
a `delay` or `approval` step so the engine can resume it later. This is what makes long-running, time-delayed, and
human-approval workflows possible across requests/restarts. Without it, paused executions would be lost.
**When & how rows are written:** Written by `WorkflowService` step handlers (`workflowPendingStep.create`) when a
delay/approval step runs; read/updated when the scheduler polls or an approval callback arrives. Delays are resumed by
the scheduler once `resume_after` passes; approvals are resumed via `POST /api/runtime/workflows/approval/:token`.
**What the data represents & notable columns:**

- `workflow_id` — FK to the paused workflow.
- `resume_step_id` — step to continue from when resumed.
- `record_id`, `actor_id` — the record and actor the execution is bound to.
- `context` (JSON) — serialized execution snapshot, e.g. `{ record, reject_step_id }`.
- `resume_after` — timestamp the scheduler waits for (delay steps); indexed for polling.
- `approval_token` — `@unique` token used in the approval callback URL (approval steps).
- `approval_status` — `pending | resumed | approved | rejected` (default `pending`).

**Related to:** Child of `ui_workflows` (`onDelete: Cascade`).

### `ui_wizards`  ·  Prisma model `UiWizard`

**Why this table exists (relevance):** Defines a multi-step guided data-capture flow for an object (e.g. an onboarding
or application wizard). It sequences several forms into one guided experience. Without it, multi-step guided capture
would have to be hard-coded.
**When & how rows are written:** Created/updated/deleted by `MetadataService` / `DashboardService` (`uiWizard.*`) in the
wizard builder.
**What the data represents & notable columns:**

- `object_id` — optional FK to the target object.
- `name`, `label`, `description`.
- `submit_label` — final-button text; `success_message` — post-submit confirmation text.
- `is_active`.

**Related to:** Optionally child of `ui_objects`. Parent of `ui_wizard_steps`.

### `ui_wizard_steps`  ·  Prisma model `UiWizardStep`

**Why this table exists (relevance):** One ordered step of a wizard, each typically mapped to a form. It sequences the
wizard's screens. Without it a wizard has no pages.
**When & how rows are written:** Created/updated/deleted by `MetadataService` / `DashboardService` (`uiWizardStep.*`)
alongside the wizard. Cascade-deletes with the wizard.
**What the data represents & notable columns:**

- `wizard_id` — FK to owning wizard.
- `form_id` — optional FK to the form rendered on this step.
- `name`, `label`, `description`.
- `order_index` — step sequence.
- `config` (JSON) — step-specific config.

**Related to:** Child of `ui_wizards` (`onDelete: Cascade`); optionally references a `ui_forms` row.

### `ui_pipelines`  ·  Prisma model `UiPipeline`

**Why this table exists (relevance):** Defines a Kanban/pipeline board for an object (e.g. a sales pipeline for
Opportunities). It provides the staged, drag-and-drop view of an object's records. Without it there is no board/stage
configuration.
**When & how rows are written:** Created/updated/deleted by `MetadataService` / `DashboardService` (`uiPipeline.*`) in
the builder.
**What the data represents & notable columns:**

- `object_id` — required FK to the object the board visualizes.
- `name`, `label`, `description`.
- `config` (JSON) — `enabled_views` (which views the object's page offers: `table`, `pipeline`, and the opt-in
  `cards`; unset → Table + Pipeline), `delete_mode` (`soft` | `hard`), and `status_field: { field, map: { stage_name:
  value } }` — a status picklist kept in step with the stage on every stage change.
- `is_active`.

**Related to:** Child of `ui_objects`. Parent of `ui_pipeline_stages`.

### `ui_pipeline_stages`  ·  Prisma model `UiPipelineStage`

**Why this table exists (relevance):** A single column/stage within a pipeline board. Records and opportunities point at
a stage to indicate where they sit in the flow, so this table defines the possible stages and their order/color. Without
it a pipeline has no columns to move cards between.
**When & how rows are written:** Created/updated/deleted by `MetadataService` / `DashboardService` (`uiPipelineStage.*`)
when the pipeline is configured. Cascade-deletes with the pipeline.
**What the data represents & notable columns:**

- `pipeline_id` — FK to owning pipeline.
- `name`, `label`.
- `color` — hex color for the column (default `#6366f1`).
- `order_index` — left-to-right stage order.
- `config` (JSON) — stage-specific config.

**Related to:** Child of `ui_pipelines` (`onDelete: Cascade`). Referenced by `records.pipeline_stage_id` and
`crm_opportunities.pipeline_stage_id` (which stage a record/opportunity currently sits in).

## Generic Records & Activity Engine

> A polymorphic record layer. `records` is the universal identity/stage anchor for any UI object; typed CRM
> field data lives in dedicated `crm_*` tables, while custom objects (with no relational table) store dynamic values
> EAV-style in `record_field_values`. Activities, tasks, notifications, audit and status-timeline events all hang off
> records/employees. Every table in this domain carries `tenant_id` (INTEGER, indexed → `tenants.id`) for tenant
> isolation; all queries and writes are tenant-scoped.

### `records`  ·  Prisma model `Record`

**Why this table exists (relevance):** The base container/identity row for every business object managed by the low-code
engine. It anchors activities, tasks, audit logs, status events, and bridges one-to-one to the typed CRM
entities. It does not store field values itself (except for custom objects, via `record_field_values`).
**When & how rows are written:** Inserted by `RecordService.createRecord()` (route: records API; also invoked by
ImportService for non-CRM objects and by CrmService dual-write). It resolves `tenant_id` from the JWT or
AsyncLocalStorage, sets `object_id`, optional `pipeline_stage_id`, `created_by`, `assigned_to`, then fires audit +
auto-assign + `on_create` workflow (fire-and-forget). `updateRecord()` updates `assigned_to`; `updateRecordStage()`
updates `pipeline_stage_id` and appends a `StatusEvent`. `deleteRecord()` **soft-deletes by default** (moves the row to
the Trash) or hard-deletes, depending on the object's pipeline `config.delete_mode`; a hard delete cascades to children.
**What the data represents & notable columns:**

- `id` — INTEGER PK (auto-increment).
- `object_id` — FK → `ui_objects.id`; which UI object this row instantiates (cascade delete).
- `pipeline_stage_id` — nullable FK → `ui_pipeline_stages.id` (SetNull on delete); current kanban stage.
- `assigned_to` — nullable VARCHAR(20) FK → `employees.employee_id` (SetNull); the current owner/assignee, set by the
  assignment engine or manually.
- `created_by` — VARCHAR(100), nullable; free-form creator id.
- `created_at` / `updated_at` — timestamps.
- `updated_by` — VARCHAR(100), nullable; who last edited, moved or bulk-changed the record (workflow writes leave it
  unchanged).
- `deleted_at` / `deleted_by` — nullable soft-delete markers (indexed). When set, the record is in the **Trash**: hidden
  from every user-facing query but retained in the DB and recoverable by an admin. Resolved via the pipeline's
  `config.delete_mode` (`soft` default / `hard`).

**Related to:** Belongs to `UiObject` and optional `UiPipelineStage`; assigned to an `Employee`. Parent (cascade) of
`Activity`, `Task`, `AuditLog`, `StatusEvent`, `RecordFieldValue`. One-to-one bridge (via each child's `record_id`) to
`CrmLead`, `CrmContact`, `CrmAccount`, `CrmOpportunity`, `CrmCase`, `Product`, `EmailTemplate`, `Document`.

### `record_field_values`  ·  Prisma model `RecordFieldValue`

**Why this table exists (relevance):** EAV-style typed storage for dynamic field values of records whose object has no
dedicated relational table (custom objects). Keeps one strongly-typed row per field per record instead of a JSON blob,
so values are queryable/indexable.
**When & how rows are written:** Upserted by `RecordService` (`this.db.recordFieldValue.upsert`, keyed on the
`(record_id, field_name)` unique) when persisting custom-object field data; read back via `findMany` by `record_id`.
Also used for auto-number generation (reads the last value with `findFirst`). Deleted by cascade when the parent record
is removed.
**What the data represents & notable columns:**

- `id` — BIGINT PK (auto-increment).
- `record_id` — FK → `records.id` (cascade delete).
- `field_name` — VARCHAR(100); the UI field's `name`.
- Typed value columns: `str_value` (TEXT), `num_value` (Float/DOUBLE), `bool_value` (Boolean), `date_value`
  (DateTime), `json_value` (JSON). `str_value` is always populated; the typed column matching the field's `data_type` is
  populated alongside it. See [DATABASE_SCHEMA](DATABASE_SCHEMA.md#where-record-data-lives-and-querying-it-with-sql).
- `created_at` / `updated_at` — timestamps.
- **Uniqueness:** `@@unique([record_id, field_name])` — exactly one row per field per record.

**Related to:** Belongs to `Record`.

### `activities`  ·  Prisma model `Activity`

**Why this table exists (relevance):** Interaction log for a record — the timeline of calls, emails, notes, and meetings
against a CRM record.
**When & how rows are written:** Created via the activities API / CRM service when a user logs an interaction on a
record; updated when an activity is edited or completed. Cascade-deleted with the parent record.
**What the data represents & notable columns:**

- `record_id` — FK → `records.id` (cascade); the anchor record.
- `employee_id` — FK → `employees.employee_id`; who performed the activity.
- `type` — VARCHAR(50); value set: `note | call | email | meeting | task | other`.
- `subject` — VARCHAR(200); `description` — TEXT; `outcome` — VARCHAR(500).
- `duration_min` — INTEGER (call/meeting length).
- `scheduled_at` / `completed_at` — DateTime, nullable; timestamps.

**Related to:** Belongs to `Record` and `Employee`.

### `tasks`  ·  Prisma model `Task`

**Why this table exists (relevance):** Assignable work items / reminders, optionally tied to a record, with status and
priority. Scope of who may see/create/edit them is governed by `operational_permissions`.
**When & how rows are written:** Created/updated via the tasks API (creator assigns to an employee); `completed_at`
stamped when status → completed. `record_id` set to NULL if the parent record is deleted (SetNull).
**What the data represents & notable columns:**

- `record_id` — nullable FK → `records.id` (SetNull); a standalone task has none.
- `assigned_to` — FK → `employees.employee_id` (the assignee); `created_by` — FK → `employees.employee_id` (the
  creator).
- `title` — VARCHAR(200); `description` — TEXT.
- `status` — default `open`; value set: `open | in_progress | completed | cancelled`.
- `priority` — default `normal`; value set: `low | normal | high | urgent`.
- `due_date` / `completed_at` — DateTime, nullable.

**Related to:** Optionally belongs to `Record`; two `Employee` relations (assignee, creator).

### `reminders`  ·  Prisma model `Reminder`

**Why this table exists (relevance):** Time-based reminders / follow-ups on a record (or standalone) — the
reminder/follow-up primitive found in every major CRM. Distinct from `tasks` (which model assignable work); a reminder
exists to fire a notification at a moment in time. Visibility is role-scoped (own → hierarchy → all).
**When & how rows are written:** Created/updated via the reminders API (`ReminderService`). A 60s scheduler sweep
(`sweepDue`) selects rows with `status = 'pending' AND remind_at <= now`, atomically flips each to `notified`
(multi-pod safe), and writes a `reminder`-type row into `notifications` for `employee_id`. `snooze` reschedules
`remind_at` and resets status to `pending`; `complete`/`dismiss` close it.
**What the data represents & notable columns:**

- `record_id` — nullable FK → `records.id` (SetNull); a standalone reminder has none.
- `employee_id` — FK → `employees.employee_id` (who is reminded); `created_by` — FK → `employees.employee_id`.
- `title` — VARCHAR(200); `note` — TEXT, nullable.
- `remind_at` — DateTime, when to fire; `notified_at` / `completed_at` — DateTime, nullable.
- `status` — default `pending`; value set: `pending | notified | done | dismissed | cancelled`.
- `priority` — default `normal`; value set: `low | normal | high | urgent`.

**Related to:** Optionally belongs to `Record`; two `Employee` relations (employee, creator).

### `notifications`  ·  Prisma model `Notification`

**Why this table exists (relevance):** In-app notification inbox per employee (task due, record assigned, mentions,
workflow, system messages).
**When & how rows are written:** Created by services/workflow engine on notable events (e.g. task assignment, record
assignment, @mentions); `is_read` flipped true when the user reads it. Cascade-deleted with the employee.
**What the data represents & notable columns:**

- `employee_id` — FK → `employees.employee_id` (cascade); recipient.
- `type` — VARCHAR(50); value set: `task_due | record_assigned | mention | workflow | system`.
- `title` — VARCHAR(200); `body` — TEXT; `link` — VARCHAR(500) deep-link.
- `is_read` — Boolean, default false. Indexed on `(employee_id, is_read)` for unread-badge queries.

**Related to:** Belongs to `Employee`.

### `audit_logs`  ·  Prisma model `AuditLog`

**Why this table exists (relevance):** Durable, general audit trail — **every** user action on pipeline data (record
create/update/stage-change/delete/restore/purge, single and bulk) **and** pipeline-config actions
(create/update/delete), each attributed to the acting employee.
**When & how rows are written:** Written fire-and-forget by `RecordService.#audit()` / `#auditBulk()` from `createRecord`
(`create`), `updateRecord` (`update`), `updateRecordStage` + `bulkUpdateStage` (`stage_change`), `deleteRecord` +
`bulkDelete` (`delete`, with `{mode}`), `restoreRecord` (`restore`), and `purgeRecord` (`purge`); and by
`DashboardService.#auditPipeline()` for `pipeline.create | pipeline.update | pipeline.delete`. Never blocks the response.
**Durability:** the `record_id` FK is **SET NULL** (not cascade), so the trail **survives a hard-delete/purge** — the
original record id is preserved in `changes`.
**What the data represents & notable columns:**

- `record_id` — nullable FK → `records.id` (**SET NULL** on delete); null for pipeline-config actions.
- `entity_type` / `entity_id` — nullable; set for non-record actions (e.g. `pipeline` + pipeline id).
- `employee_id` — FK → `employees.employee_id` (the actor).
- `action` — VARCHAR(40); value set: `create | update | delete | stage_change | restore | purge | pipeline.create |
  pipeline.update | pipeline.delete`.
- `changes` — JSON: `{ field: { old, new } }`, stage payload, or action payload (e.g. `{ mode, record_id, object_id }`).
- `created_at` — timestamp.

**Related to:** Belongs to `Record` (nullable) and `Employee`. Read per-record via `GET /runtime/records/:id/audit`, and
per-pipeline via `GET /builder/pipelines/:id/audit`.

### `status_events`  ·  Prisma model `StatusEvent`

**Why this table exists (relevance):** Chronological status timeline for a record — powers the `status_tracker`
fieldtype (Amazon/UPS/Bluedart-style package tracking). Each row is one dated milestone/scan/note/exception with
optional location and description.
**When & how rows are written:** Appended automatically by `RecordService.#recordStatusEvent()` on pipeline stage change
(from `updateRecordStage`, using the new stage's `name`/`label` as `status`/`title`, `event_type='milestone'`); also
insertable manually via the API. Fire-and-forget, never throws; read newest-first via `listStatusEvents()`. Read-only at
the field level. Cascade-deleted with the record.
**What the data represents & notable columns:**

- `record_id` — FK → `records.id` (cascade).
- `status` — VARCHAR(60); milestone key, ideally matches a pipeline stage `name` (truncated to 60 chars on write).
- `title` — VARCHAR(200) human label (e.g. "Out for delivery"); `description` — TEXT; `location` — VARCHAR(200) (e.g.
  "Mumbai Hub, IN").
- `event_type` — default `milestone`; value set: `milestone | scan | note | exception`.
- `occurred_at` — DateTime, default now(); drives timeline ordering (indexed with `record_id`).
- `changed_by` — VARCHAR(20); `employees.employee_id` (plain column, resolved to a name on read — not a FK relation).
- `created_at` — timestamp.

**Related to:** Belongs to `Record`.

## Permissions

> Two permission tables, both tenant-scoped (`tenant_id` INTEGER, indexed). `ui_permissions` is metadata-entity
> visibility/editability by role; `operational_permissions` is CRUD-scope (own/team/hierarchy/all) for tasks and
> activities. Both are consulted by `PermissionService`, which applies hardcoded defaults when no row exists for a role.

### `ui_permissions`  ·  Prisma model `UiPermission`

**Why this table exists (relevance):** Role-based view/edit access control for a metadata entity (module, object, field,
form, pipeline, wizard). Lets admins hide or lock UI entities per role at runtime.
**When & how rows are written:** Upserted via the permissions admin API/`PermissionService` when an admin sets access
for a role on an entity; `updated_by` records who changed it.
**What the data represents & notable columns:**

- `entity_type` — VARCHAR(50); value set: `module | object | field | form | pipeline | wizard`.
- `entity_id` — INTEGER; id of the target metadata row (indexed with `entity_type`).
- `role_name` — VARCHAR(50); the role.
- `can_view` — Boolean default true; `can_edit` — Boolean default false. Set `can_view=false` to fully hide.
- `updated_by` — VARCHAR(20), nullable.
- **Uniqueness:** `@@unique([entity_type, entity_id, role_name, tenant_id])`.
- **Defaults when no row:** super_admin/admin → view+edit; other roles → view-only.

**Related to:** `role_name` references `roles.name`; `entity_id` is a soft reference into the relevant `ui_*` table (no
hard FK).

### `operational_permissions`  ·  Prisma model `OperationalPermission`

**Why this table exists (relevance):** Role-based operational **scope** permissions for tasks and activities — controls
how wide a user's view/create/edit/delete/assign reach is across the employee hierarchy.
**When & how rows are written:** Upserted via the permissions admin API/`PermissionService`; `updated_by` records the
editor.
**What the data represents & notable columns:**

- `entity_type` — VARCHAR(30); value set: `task | activity`.
- `role_name` — VARCHAR(50).
- Scope columns — value set `none | own | team | hierarchy | all`, where `team`=direct reports (depth=1 in
  `employee_hierarchy`), `hierarchy`=all descendants at any depth: `view_scope` (default `own`), `create_scope` (`own`),
  `edit_scope` (`own`), `delete_scope` (`own`), `assign_scope` (default `none`).
- `updated_by` — VARCHAR(20), nullable.
- **Uniqueness:** `@@unique([entity_type, role_name, tenant_id])`.
- **Defaults when no row:** hardcoded defaults in `PermissionService`.

**Related to:** `role_name` references `roles.name`; scopes resolve against `employee_hierarchy`.

## Assignment, Quotas, Import & Integrations

> Auto-assignment engine (rules + round-robin cursor state + immutable decision log, plus a parallel social-mention
> router), sales quotas, CSV import jobs, and the outbound integration framework. All tables carry `tenant_id` (INTEGER,
> indexed → `tenants.id`) and are tenant-scoped.

### `assignment_rules`  ·  Prisma model `AssignmentRule`

**Why this table exists (relevance):** Configurable auto-assignment rules per UI object. On record create,
`AssignmentService` evaluates a tenant's active rules in `order_index` order and routes the record to an employee.
**When & how rows are written:** Created/updated/reordered via the assignment admin API
(`AssignmentService.create/update`, reorder loop). Evaluated (read) by `assign()` during `RecordService.createRecord()`
auto-assign.
**What the data represents & notable columns:**

- `object_id` — FK → `ui_objects.id` (cascade); which object the rule governs (indexed with `is_active, order_index`).
- `name` — VARCHAR(100).
- `rule_type` — VARCHAR(30); value set: `fixed | round_robin | rule_based | load_balanced` (validated in service).
- `conditions` — JSON `[{ field, operator, value }]`; all must match (rule_based only).
- `assignee_id` — VARCHAR(20) FK → `employees.employee_id` (fixed rule target).
- `pool_ids` — JSON `["E001","E002"]` (round_robin / load_balanced pool).
- `fallback_id` — VARCHAR(20) FK → `employees.employee_id`; used when no rule matches / pool empty.
- `order_index`, `is_active`, `created_by` (VARCHAR(20)), timestamps.

**Related to:** Belongs to `UiObject`; one-to-one with `RoundRobinState`.

### `round_robin_states`  ·  Prisma model `RoundRobinState`

**Why this table exists (relevance):** Per-rule cursor tracking who was last assigned in a round-robin pool, so multiple
round-robin rules on the same object rotate independently and fairly.
**When & how rows are written:** Upserted inside a transaction by `AssignmentService` when a round-robin rule fires — it
locks the row (`SELECT ... FOR UPDATE`), reads `last_index`, computes the next index, and writes `last_index` +
refreshed `pool_ids`. Cascade-deleted with the rule.
**What the data represents & notable columns:**

- `rule_id` — INTEGER PK **and** FK → `assignment_rules.id` (cascade); one row per rule.
- `pool_ids` — JSON; the serialized ordered rotation pool.
- `last_index` — INTEGER default 0; index of the last employee assigned.
- `updated_at` — timestamp.

**Related to:** One-to-one with `AssignmentRule`.

### `social_assignment_rules`  ·  Prisma model `SocialAssignmentRule`

**Why this table exists (relevance):** Routing rules for **inbound social conversations** (mentions/DMs/comments).
Mirrors `AssignmentRule` but is scoped by social `platform` instead of a UI object, and carries its round-robin cursor
inline. Falls back to default managed-by-team load-balanced routing when no rule matches.
**When & how rows are written:** Managed via the social routing admin API; evaluated when an inbound mention is routed.
Note: unlike `AssignmentRule`, its round-robin cursor is updated in-place on this row (`last_index`) — there is no
separate state table.
**What the data represents & notable columns:**

- `platform` — VARCHAR(50), nullable; `null`=all platforms, else
  `facebook | instagram | linkedin | twitter | whatsapp | youtube | tiktok`.
- `name`, `rule_type` (`fixed | round_robin | rule_based | load_balanced`), `conditions` (JSON over mention fields,
  rule_based only).
- `assignee_id` / `fallback_id` — VARCHAR(20) FK → `employees.employee_id`; `pool_ids` — JSON.
- `order_index`, `is_active`, `last_index` (INTEGER default 0 — inline round-robin cursor), `created_by`, timestamps.
- **Index:** `(tenant_id, platform, is_active, order_index)` lookup index.

**Related to:** Tenant-scoped only (no object FK); `assignee_id`/`fallback_id`/`pool_ids` reference employees by id.

### `assignment_logs`  ·  Prisma model `AssignmentLog`

**Why this table exists (relevance):** Immutable audit trace of every assignment decision (auto or manual) for
accountability.
**When & how rows are written:** Created by `AssignmentService.#applyAssignment()` — in the same `Promise.all` that
writes `assigned_to` back to the record — every time an assignment is applied. Never updated.
**What the data represents & notable columns:**

- `record_id` — FK → `records.id` (indexed); `object_id` — denormalized FK → `ui_objects.id` (indexed).
- `rule_id` — nullable FK → `assignment_rules.id`; `null` = manual assignment.
- `assigned_to` — VARCHAR(20); the chosen employee.
- `method` — VARCHAR(30); value set: `fixed | round_robin | rule_based | fallback | manual` (the strategy that produced
  the decision).
- `created_at` — timestamp.

**Related to:** References `Record`, `UiObject`, optional `AssignmentRule`, and an employee.

### `quotas`  ·  Prisma model `Quota`

**Why this table exists (relevance):** Sales/performance targets per employee × object × time period, consumed by the
forecasting service to compute attainment.
**When & how rows are written:** Upserted by `ForecastService.setQuota()` on the compound unique key (create sets
`target_value` as Decimal; update overwrites it); deleted by `deleteQuota()`.
**What the data represents & notable columns:**

- `employee_id` — FK → `employees.employee_id` (cascade, indexed); `object_id` — FK → `ui_objects.id` (cascade,
  indexed).
- `period_type` — VARCHAR(20); value set: `monthly | quarterly | annual` (service treats `period_key` as freeform).
- `period_key` — VARCHAR(20); e.g. `"2026-03" | "2026-Q1" | "2026"`.
- `target_value` — DECIMAL(18,2); `currency` — VARCHAR(10) default `USD`.
- `created_by` — VARCHAR(20), nullable; timestamps.
- **Uniqueness:** `@@unique([employee_id, object_id, period_type, period_key])`.

**Related to:** Belongs to `Employee` and `UiObject`.

### `import_jobs`  ·  Prisma model `ImportJob`

**Why this table exists (relevance):** Tracks a CSV import through its lifecycle (create → preview → execute), holding
the field mapping, dedupe config, duplicate-resolution strategy, and result stats.
**When & how rows are written:** `ImportService.createJob()` inserts with `status='pending'`; `previewImport()` parses
the CSV, applies mapping, validates/dedupes, and updates to `status='previewing'` with `field_mapping`, `dedupe_keys`,
`strategy`, `stats`, and up to the first 100 `error_rows`; `executeImport()` writes records (CRM rows via CrmService;
Builder-object rows one at a time through `RecordService.createRecord`) and updates to `done`/`failed`. A row failing
validation does not abort the run; it is recorded in `error_rows`.
**What the data represents & notable columns:**

- `object_id` — FK → `ui_objects.id` (cascade, indexed); import target.
- `filename` — VARCHAR(255).
- `status` — default `pending`; value set: `pending | previewing | importing | done | failed` (indexed).
- `field_mapping` — JSON `{ "CSV Header": "field_name" }`.
- `dedupe_keys` — JSON `["email"]`; fields used for duplicate detection.
- `strategy` — default `skip`; value set: `skip | create | merge` (duplicate resolution).
- `stats` — JSON; after preview `{ total_rows, valid_rows, error_rows, duplicate_rows, unique_rows }`, after
  execute `{ created, merged, skipped, failed, total }`. `error_rows` — JSON; preview `[{ row, reason }]` with the
  mapped row and a reason such as "Empty row"; execute `[{ row, reason }]` with row = 1-based position among
  imported rows (first 100), written only when rows failed.
- `created_by` — VARCHAR(20) NOT NULL; timestamps.

**Related to:** Belongs to `UiObject`; `created_by` references an employee.

### `integrations`  ·  Prisma model `Integration`

**Why this table exists (relevance):** Registered connector instances (outbound/inbound webhooks, email sync,
enrichment, custom) with their connector-specific, sensitive config. Outbound integrations are **event-driven**:
`IntegrationService` subscribes to the domain event bus and fans each CRM event to the integrations that subscribe.
**When & how rows are written:** CRUD via `IntegrationService.createIntegration/updateIntegration/toggleIntegration/deleteIntegration`.
On execution (event dispatch, test, retry, or inbound webhook path), `last_run_at` is stamped (in a transaction
alongside the log write).
**What the data represents & notable columns:**

- `name` — VARCHAR(100) **UNIQUE**; used as the public endpoint slug for inbound webhooks.
- `label` — VARCHAR(100); `type` — VARCHAR(50); value set: `outbound_webhook | inbound_webhook | enrichment | custom`
  (selects the connector class from the registry). `enrichment` calls a provider and returns its data; `custom` is a
  user-defined generic outbound connector. (`email_sync` is planned — no connector yet.)
- `config` — JSON; connector-specific settings, treated as sensitive. Notable keys:
  - `url`, `method`, `timeout_ms`, `headers` — outbound HTTP request.
  - `events` — array of event patterns this outbound integration subscribes to (`record.created`,
    `record.updated`, `record.deleted`, `record.field_changed`, `*`, or `prefix.*`). Empty ⇒ never auto-fires.
  - `secret` — HMAC-SHA256 signing secret (outbound: signs `X-Signature-256`; inbound: verifies it).
  - `retry` — `{ attempts, backoff_ms }` for outbound exponential-backoff retries (defaults 3 / 500 ms).
  - `event_map` — (inbound) `{ eventName: workflowId }` bridge; `event_field` — path to the event name in the payload.
- `is_active` — Boolean default true (execution rejected if inactive); `last_run_at` — DateTime nullable.
- `created_by` — VARCHAR(20), nullable; timestamps.

**Related to:** Has many `IntegrationLog`; `created_by` references an employee.

### `integration_logs`  ·  Prisma model `IntegrationLog`

**Why this table exists (relevance):** Per-execution log of an integration run — request/response payloads, error, and
timing for observability and debugging.
**When & how rows are written:** Created by `IntegrationService` after each connector execution (batched in one
transaction with the parent's `last_run_at` update), and by the inbound-webhook handler.
**What the data represents & notable columns:**

- `integration_id` — FK → `integrations.id` (indexed).
- `status` — VARCHAR(20); value set: `success | error` (a failed delivery that exhausted retries is `error`, with
  the attempt count noted in the `error` text).
- `request_body` / `response_body` — JSON, nullable; `error` — TEXT, nullable; `duration_ms` — INTEGER, nullable.
- `created_at` — timestamp.

**Related to:** Belongs to `Integration`.

CRM Core, Products & Quoting, Email/Campaigns/Lead Scoring.

## CRM Core

> Multi-tenant: every table in this domain carries a non-null `tenant_id` (scopes rows to a tenant, references
> `tenants.id`, indexed). It is omitted from the per-table notes below.
>
> **CrmService dual-write bridge:** the typed CRM entities (`crm_lead_intake`, `crm_leads`, `crm_contacts`,
> `crm_accounts`, `crm_opportunities`, `crm_cases`) each carry a nullable, UNIQUE `record_id` that bridges one-to-one to
> a `records` row. `CrmService` (`backend/src/services/crm.service.js`) writes both in a single Prisma transaction: it
> first `tx.record.create(...)` (anchor for activities, tasks, audit_logs, pipeline stage, assignment) then creates the
> typed row with `record_id: record?.id ?? null`. Field data lives ONLY in the crm_* table — the records row holds no
> JSON blob. Owner changes propagate: on update, when `owner_id` changes the service also updates `records.assigned_to`.
>
> **Lead vs. Prospect — why they are distinct tables/objects.** The CRM models a three-stage front-of-funnel:
> **Lead** (`crm_lead_intake`, UI module "Leads") → **Prospect** (`crm_leads`, UI module "Prospects") → **Client**
> (`crm_contacts`/`crm_accounts` via conversion). This mirrors the top-5 CRM providers: in **Salesforce**, **Zoho**,
> **Microsoft Dynamics 365** and **Pipedrive**, a *Lead* is a raw, unqualified inbound record that is kept separate and
> *converts* into the working sales entity (Contact/Account/Opportunity or Deal); "Prospect" is the qualified lead being
> actively worked. (**HubSpot** collapses these into one Contact object with lifecycle *stages* — the same idea modeled
> as status rather than a separate object.) Keeping Leads in their own table means raw/bulk-imported inbound never
> pollutes the working prospect pipeline, and each layer can have its own fields, permissions, scoring, and reporting.
> **Naming note:** the Lead object's internal name is `lead_intake` (UI label "Lead"), because the token `lead` is
> historically an alias for the `crm_leads`/Prospect entity across the code. Conversion: `CrmService.convertLeadToProspect`
> (Lead→Prospect) and `CrmService.convertLead` (Prospect→Client).

### `crm_accounts`  ·  Prisma model `CrmAccount`

**Why this table exists (relevance):** First-class relational store for company/organization records — the businesses
the tenant sells to. Parent anchor for contacts, opportunities, cases, and lead conversions.
**When & how rows are written:** Inserted by `CrmService.createAccount` (dual-write: `tx.record.create` +
`tx.crmAccount.create`); also created inline during lead conversion (`CrmService.convertLead` → `tx.crmAccount.create`
with its own record). Updated by `CrmService.updateAccount` (detects field changes, propagates `owner_id` →
`records.assigned_to`).
**What the data represents & notable columns:**

- `record_id` — nullable UNIQUE bridge to `records.id` (CrmService dual-write); `onDelete: SetNull`.
- `name` (required), `website`, `phone`, `email`, `industry`.
- `account_type` — prospect | customer | partner | competitor.
- `annual_revenue` Decimal(18,2), `employee_count` Int.
- Billing address block: `billing_street`/`billing_city`/`billing_state`/`billing_country`/`billing_zip`.
- `description`, `owner_id` (FK→employees), `created_by`.
- `external_id` — integration dedupe key (indexed); used by the dedupe finder in crm.service.

**Related to:** owned by an `employees` row (`owner_id`); parent of `crm_contacts`, `crm_opportunities`, `crm_cases`,
`crm_lead_conversions`, contracts, and portal users.

### `crm_contacts`  ·  Prisma model `CrmContact`

**Why this table exists (relevance):** Relational person record, optionally linked to an account — the individual people
the tenant communicates with.
**When & how rows are written:** Inserted by `CrmService.createContact` (dual-write `tx.record.create` +
`tx.crmContact.create`); also created during `CrmService.convertLead`. Updated by `CrmService.updateContact` (owner
change → `records.assigned_to`).
**What the data represents & notable columns:**

- `record_id` — nullable UNIQUE bridge to `records.id` (dual-write).
- `account_id` — nullable FK→crm_accounts (`onDelete: SetNull`).
- `first_name`, `last_name` (both required), `email`, `phone`, `mobile`, `title`, `department`, `lead_source`.
- Mailing address block: `mailing_street`/`mailing_city`/`mailing_state`/`mailing_country`/`mailing_zip`.
- `birthdate` (Date), `description`.
- `do_not_contact` Boolean default false — compliance DNC flag.
- `owner_id` (FK→employees), `external_id` (dedupe), `created_by`.

**Related to:** belongs to `crm_accounts`; owned by `employees`; parent of opportunities (via `OpportunityContact`),
cases, and lead conversions.

### `crm_lead_intake`  ·  Prisma model `CrmLeadIntake`

**Why this table exists (relevance):** Raw, unqualified inbound **Lead** (UI module "Leads", object name
`lead_intake`) — the front of the CRM funnel, before a record becomes a working Prospect. Separated from `crm_leads`
so bulk/cold inbound never pollutes the prospect pipeline (see the Lead-vs-Prospect note at the top of this section).
**When & how rows are written:** Inserted through the runtime record path (`RecordService` → `crmLeadIntake` via the
`lead_intake` object mapping) or synthesized from EAV on convert. On conversion, `CrmService.convertLeadToProspect`
sets `is_converted=true`, `lead_status='converted'`, stamps `converted_at`, records `converted_prospect_id`, and moves
the lead's record to its pipeline's converted stage.
**What the data represents & notable columns:**

- `record_id` — nullable UNIQUE bridge to `records.id` (dual-write).
- `first_name`, `last_name` (required), `company`, `email`, `phone`, `mobile`, `job_title`, `lead_source`.
- `lead_status` default `new` — new | contacted | qualified | converted (indexed).
- `rating` — hot | warm | cold. `industry`, `annual_revenue` Decimal(18,2), `website`, `description`.
- `is_converted` Boolean, `converted_at` DateTime, `converted_prospect_id` Int (→ `crm_leads.id` created on convert).
- `owner_id` (FK→employees), `external_id`, `created_by`.

**Related to:** owned by `employees`; converts into a `crm_leads` (Prospect) row via `CrmService.convertLeadToProspect`.

### `crm_leads`  ·  Prisma model `CrmLead`

**Why this table exists (relevance):** The **Prospect** layer — a qualified/working lead (UI module "Prospects",
object name `prospect`). Fed directly or by converting a `crm_lead_intake` (Lead) row. Lead scoring now primarily
targets **Leads** (`crm_lead_intake`); prospect scoring is legacy/manual only. Also the target of social-media lead
capture; converting a prospect creates a Client (account/contact/opportunity).
**When & how rows are written:** Inserted by `CrmService.createLead` (dual-write `tx.record.create` +
`tx.crmLead.create`), or by `CrmService.convertLeadToProspect` when a Lead (`crm_lead_intake`) is qualified. Updated by
`CrmService.updateLead`. On conversion to Client, `CrmService.convertLead` sets `is_converted=true`,
`lead_status='converted'`, stamps `converted_at`, and (if it has a record) moves the record to the pipeline's converted
stage.
**What the data represents & notable columns:**

- `record_id` — nullable UNIQUE bridge to `records.id` (dual-write).
- `first_name`, `last_name` (required), `company`, `email`, `phone`, `mobile`, `job_title`, `lead_source`.
- `lead_status` default `new` — new | contacted | qualified | unqualified | converted (indexed).
- `rating` — hot | warm | cold.
- `industry`, `annual_revenue` Decimal(18,2), `website`, `description`.
- `is_converted` Boolean, `converted_at` DateTime.
- `owner_id` (FK→employees), `external_id` (dedupe), `created_by`.

**Related to:** owned by `employees`; one-to-one `crm_lead_conversions` (conversion); one-to-one optional
`social_media_lead` source; one-to-many `lead_scores`.

### `crm_opportunities`  ·  Prisma model `CrmOpportunity`

**Why this table exists (relevance):** Qualified deal in the sales pipeline, carrying revenue value, stage, and forecast
metadata.
**When & how rows are written:** Inserted by `CrmService.createOpportunity` (dual-write); also created during
`CrmService.convertLead`. Updated by `CrmService.updateOpportunity` (owner change → `records.assigned_to`).
**What the data represents & notable columns:**

- `record_id` — nullable UNIQUE bridge to `records.id` (dual-write).
- `account_id`, `contact_id` — nullable FKs (SetNull).
- `name` (required), `amount` Decimal(18,2), `currency` default USD.
- `stage` default `prospecting` (e.g. …→ closed_won/closed_lost); `probability` Int 0–100.
- `close_date` (Date), `lead_source`, `type` (new_business | existing_business | renewal), `next_step`, `description`.
- `is_closed`, `is_won` Booleans; `forecast_category` (pipeline | best_case | commit | closed).
- `pipeline_stage_id` — FK→ui_pipeline_stages (back-compat kanban board).
- `owner_id`, `external_id`, `created_by`.

**Related to:** belongs to `crm_accounts` and `crm_contacts`; FK to `ui_pipeline_stages`; owned by `employees`; parent
of `crm_lead_conversions`, contracts, partner opportunity.

### `crm_cases`  ·  Prisma model `CrmCase`

**Why this table exists (relevance):** Customer support/service ticket, optionally tied to an account/contact. Bridges
to the customer portal.
**When & how rows are written:** Inserted by `CrmService.createCase` (dual-write). Updated by `CrmService.updateCase`
(owner change → `records.assigned_to`).
**What the data represents & notable columns:**

- `record_id` — nullable UNIQUE bridge to `records.id` (dual-write).
- `account_id`, `contact_id` — nullable FKs (SetNull).
- `subject` (required), `description`.
- `status` default `new` — new | open | in_progress | escalated | resolved | closed (indexed).
- `priority` default `medium` — low | medium | high | critical.
- `type`, `origin` (web | email | phone | chat).
- `contact_email`, `contact_name` — free-text reporter details when no linked contact.
- `resolution`, `owner_id`, `external_id`, `created_by`.

**Related to:** belongs to `crm_accounts`/`crm_contacts`; owned by `employees`; one-to-one optional `customer_case`
(portal).

### `crm_lead_conversions`  ·  Prisma model `CrmLeadConversion`

**Why this table exists (relevance):** Immutable audit record of a lead-conversion event; enforces one conversion per
lead and one opportunity per conversion.
**When & how rows are written:** Inserted by `CrmService.convertLead` (`tx.crmLeadConversion.create`) at the end of the
conversion transaction, after any new account/contact/opportunity are created.
**What the data represents & notable columns:**

- `lead_id` — UNIQUE FK→crm_leads (`onDelete: Cascade`); one conversion per lead.
- `account_id`, `contact_id` — nullable FKs to created/matched account & contact (SetNull).
- `opportunity_id` — nullable UNIQUE FK→crm_opportunities (SetNull); one opportunity per conversion.
- `converted_by` (FK→employees), `converted_at` default now, `notes`, `created_at`.

**Related to:** joins `crm_leads` to the resulting `crm_accounts`, `crm_contacts`, `crm_opportunities`; actor is an
`employees` row.

### `crm_associations`  ·  Prisma model `CrmAssociation`

**Why this table exists (relevance):** Generic many-to-many link between any two CRM entities, avoiding a combinatorial
explosion of dedicated join tables while staying queryable.
**When & how rows are written:** Upserted by `CrmService.associate` (`db.crmAssociation.upsert` on the composite unique
key); listed via `getAssociations`; removed via `db.crmAssociation.delete`. No `records` bridge (not a dual-write
table).
**What the data represents & notable columns:**

- `from_type`/`from_id` and `to_type`/`to_id` — polymorphic endpoints; type ∈ lead | contact | account | opportunity |
  case.
- `assoc_type` — relationship label, e.g. primary_contact | decision_maker | influencer | billing_contact.
- `created_by`, `created_at`.
- UNIQUE on `(from_type, from_id, to_type, to_id, assoc_type)`; indexed on both endpoints.

**Related to:** polymorphic (resolved in application code by type+id); no DB-level FK to CRM tables.

## Products

> Multi-tenant: all tables carry a non-null indexed `tenant_id`. `products` participates in the
> CrmService-style dual-write (nullable UNIQUE `record_id` → `records.id`).

### `products`  ·  Prisma model `Product`

**Why this table exists (relevance):** Catalog of sellable products/services referenced by
opportunities.
**When & how rows are written:** Inserted by `ProductService.create` (`backend/src/services/product.service.js`) via
dual-write (`tx.record.create` + `tx.product.create`, `record_id: record?.id ?? null`). Updated by
`ProductService.update` (`db.product.update`).
**What the data represents & notable columns:**

- `record_id` — nullable UNIQUE bridge to `records.id`.
- `name` (required), `sku` (UNIQUE), `category`, `description`.
- `unit_price` Decimal(18,2) NOT NULL; `cost_price` Decimal(18,2); `currency` default USD.
- `tax_rate` Decimal(5,4) — e.g. 0.0825 for 8.25%.
- `is_active`, `is_service` Booleans.
- `min_quantity` default 1, `max_quantity`.
- Vendor/physical attrs: `vendor_name`, `vendor_sku`, `dimensions` ("10x15x5 cm"), `weight` Decimal(8,2) kg,
  `warranty_months`, `image_url`.
- `created_by`.

**Related to:** references `records`.

## Email, Campaigns & Lead Scoring

> Multi-tenant: all tables carry a non-null indexed `tenant_id`. `email_templates` and `documents` participate in the
> dual-write (nullable UNIQUE `record_id` → `records.id`); the campaign/list/tracking tables and lead-scoring tables do
> not. Note: the campaign-management models (`email_campaigns`, `campaign_recipients`, `campaign_email_sends`,
> `email_lists`, `email_list_subscriptions`, `campaign_list_assignments`, `email_click_events`, `email_unsubscribes`)
> are defined in the schema but are NOT written by any of the five services reviewed here
> (crm/product/email-template/email-send/lead-scoring); they back the marketing-campaign subsystem and are
> populated by its own flows.

### `email_templates`  ·  Prisma model `EmailTemplate`

**Why this table exists (relevance):** Reusable HTML/text email templates with variable placeholders, scoped optionally
to a CRM object; source content for one-off sends and campaigns.
**When & how rows are written:** Inserted by `EmailTemplateService.create`
(`backend/src/services/email-template.service.js`) via dual-write (`tx.record.create` + `tx.emailTemplate.create`,
`usage_count: 0`). `usage_count` incremented (`{ increment: 1 }`) when a template is used to send. Soft-guard on delete:
if any `email_logs` reference it, it is deactivated rather than hard-deleted.
**What the data represents & notable columns:**

- `record_id` — nullable UNIQUE bridge to `records.id`.
- `object_id` — nullable FK→ui_objects (scope to Lead/Contact/etc.).
- `name` (required), `category` (sales | marketing | support | onboarding), `subject` (required).
- `body_html` MediumText, `body_text` Text.
- `variables` JSON — array of placeholder names, e.g. `["first_name","company","amount"]`.
- `is_active`, `usage_count` Int, `language` default `en`.
- `created_by`.

**Related to:** references `records` and `ui_objects`; parent of `email_logs`; referenced by
`email_campaigns.email_template_id`.

### `email_logs`  ·  Prisma model `EmailLog`

**Why this table exists (relevance):** Per-send record of transactional/CRM emails with delivery/open/click/bounce
tracking; the audit trail of what was actually sent.
**When & how rows are written:** Inserted by `EmailSendService` (`backend/src/services/email-send.service.js`) on each
send (`db.emailLog.create`) — both the template-based send path and the raw send path create a row. Queried per-record
via `related_record_id`.
**What the data represents & notable columns:**

- `template_id` — nullable FK→email_templates (SetNull).
- `related_record_id` + `related_type` — polymorphic link to the CRM record the email relates to (type ∈ lead | contact
  | account | opportunity | case | record | web_form | `distribution` | `distribution:<field>`); indexed together.
  `distribution:<field>` rows come from an `email_list` workflow step; their opens are counted into `<field>` on the
  related record.
- `to_email` (required), `from_email`, `cc_emails`/`bcc_emails` JSON arrays.
- `subject` (required), `body_html` MediumText, `body_text`.
- `status` default `sent` — sent | bounced | delivered | opened | clicked.
- Tracking timestamps: `opened_at`, `clicked_at`, `bounced_at`, `bounce_reason`. `opened_at` is stamped by the
  open-tracking pixel (`/api/public/email-open/…`) on distribution emails.
- `sent_by` (employee), `sent_at` default now.

**Related to:** references `email_templates`; polymorphic link to a CRM record via `related_record_id`/`related_type`.

### `documents`  ·  Prisma model `Document`

**Why this table exists (relevance):** Unified metadata store for ALL document types (generic CRM attachments,
auto-archived reports, generated documents, e-signed documents) in the
**standalone Document Management System**. Bytes live in a pluggable `StorageProvider` (local / S3 / Azure / GCS) under
`stored_key`; this row holds only metadata.
**When & how rows are written:** Inserted by `DocumentService` (`backend/src/services/document.service.js`) after the
file is streamed to storage (`db.document.create`, storing `stored_key`, `entity_type`/`entity_id`).
Dedup + versioning are scoped to the owner (or, for owner-less DMS uploads, the target folder). Soft-deleted via
`deleted_at` for atomic GC; storage bytes removed alongside.
**What the data represents & notable columns:**

- `record_id` — nullable UNIQUE bridge to `records.id`.
- `document_ref` — human reference, e.g. `DOC-GEN-001`.
- Polymorphic owner: `entity_type` (lead | contact | account | opportunity | case) +
  `entity_id`.
- `original_filename` (required), `stored_key` (required, RELATIVE storage key), `file_size` bytes, `mime_type`,
  `file_hash` SHA-256 (integrity + dedup).
- `category` (contract | proof_of_income | reports | photo | other), `folder_id` (FK→document_folders; SetNull on
  folder delete), `description`, `notes`.
- `content_text` (MediumText) — extracted plain text (pdf/docx/txt) for full-text search; best-effort, populated on
  upload, **never returned over the API**. Backs the `documents_fulltext` FULLTEXT index on
  `(original_filename, description, content_text)`.
- `version` default 1; `status` default `uploaded` — required | pending | uploaded | under_review | approved | rejected
  | waived | deleted.
- `is_public` default false.
- Review workflow: `uploaded_by`/`uploaded_at`, `reviewed_by`/`reviewed_at`, `rejection_reason`.
- `deleted_at` — soft-delete marker.

**Related to:** references `records`, `document_folders`; parent of share links and signature requests.

### `document_folders`  ·  Prisma model `DocumentFolder`

**Why this table exists (relevance):** Hierarchical, per-tenant folders for organising documents in the standalone DMS.
**When & how rows are written:** `DocumentFolderService` (create/rename/move/delete). A materialised `path` is
recomputed on move/rename (descendants re-pathed); folder names are sanitised of path separators so they can't inject
fake levels.
**What the data represents & notable columns:** `name`, `parent_id` (self-FK, Cascade delete), `path` (e.g.
`/Contracts/2026`), `order_index`, `created_by`, `tenant_id`. Deleting a folder cascades to children and NULLs
`documents.folder_id` — documents are never destroyed with a folder.

**Related to:** self-referential tree; parent of `documents`.

### `document_share_links`  ·  Prisma model `DocumentShareLink`

**Why this table exists (relevance):** Public, optionally-expiring share links to a document with engagement tracking.
**When & how rows are written:** `DocumentShareService.createLink`/`revokeLink`; `view_count`/`last_viewed_at` bumped by
`recordEvent` on public views.
**What the data represents & notable columns:** `document_id` (FK, Cascade), `token` (UNIQUE, unguessable),
`allow_download`, `expires_at`, `is_active`, `view_count`, `last_viewed_at`, `created_by`, `tenant_id`. Resolved
publicly by token (no tenant context); writes stamp `tenant_id` explicitly.

**Related to:** child of `documents`; parent of `document_view_events`.

### `document_view_events`  ·  Prisma model `DocumentViewEvent`

**Why this table exists (relevance):** Per-open/download engagement events feeding share analytics.
**When & how rows are written:** `DocumentShareService.recordEvent` on each public view/download; `tenant_id` set
explicitly from the link (public request has no tenant context).
**What the data represents & notable columns:** `share_link_id` (FK, Cascade), `document_id`, `event_type`
(view | download), `viewer_ip`, `user_agent`, `referrer`, `duration_secs`, `viewed_at`, `tenant_id`.

**Related to:** child of `document_share_links` / `documents`.

### `document_templates`  ·  Prisma model `DocumentTemplate`

**Why this table exists (relevance):** Admin-authored merge templates rendered into first-class documents.
**When & how rows are written:** `DocumentTemplateService` CRUD (managed in the Document Management builder);
`preview`/`render` merge `{{placeholders}}` against a context — `render` stores the output via `DocumentService`.
**What the data represents & notable columns:** `name`, `description`, `entity_type`, `body` (MediumText,
`{{placeholder}}`/`{{dot.path}}` source), `format` (html | text), `output_category`, `is_active`, `created_by`,
`tenant_id`.

**Related to:** rendered output becomes a `documents` row.

### `document_signature_requests`  ·  Prisma model `DocumentSignatureRequest`

**Why this table exists (relevance):** Native e-signature requests against a document (no external provider).
**When & how rows are written:** `DocumentSignatureService.createRequest` (with nested signatories); `sign`/`decline`
advance `status`; on the last signer the request is **atomically** completed and an HTML certificate Document is
generated (`certificate_doc_id`).
**What the data represents & notable columns:** `document_id` (FK, Cascade), `title`, `message`, `status` (sent |
completed | declined | cancelled | expired), `ordered` (enforce signer order), `expires_at`, `completed_at`,
`certificate_doc_id`, `created_by`, `tenant_id`.

**Related to:** child of `documents`; parent of `document_signatories`; `certificate_doc_id` → a `documents` row.

### `document_signatories`  ·  Prisma model `DocumentSignatory`

**Why this table exists (relevance):** Individual signers on a signature request, each with a private signing token.
**When & how rows are written:** Created nested under `createRequest` (each carries `tenant_id` explicitly — nested
creates aren't auto-scoped); updated by the public `recordView`/`sign`/`decline` surface.
**What the data represents & notable columns:** `request_id` (FK, Cascade), `name`, `email`, `order_index`, `status`
(pending | viewed | signed | declined), `token` (UNIQUE, unguessable), `signature_type` (typed | drawn),
`signature_data` (typed name or base64 PNG), `decline_reason`, `viewer_ip`, `viewed_at`, `signed_at`, `tenant_id`.

**Related to:** child of `document_signature_requests`.

### `ui_document_categories`  ·  Prisma model `UiDocumentCategory`

**Why this table exists (relevance):** Document Management **builder** config — per-category upload policy enforced at
write time by `DocumentService.upload`.
**When & how rows are written:** `DocumentConfigService` via `/api/builder/document-categories` (read: JWT, write:
admin).
**What the data represents & notable columns:** `code` (machine key, UNIQUE per tenant), `label`, `description`,
`allowed_mime` (JSON; null → global policy), `max_file_mb`, `retention_days`, `review_required` (uploads land in
`under_review`), `is_required`, `color`, `order_index`, `is_active`, `config` (JSON), `tenant_id`.

**Related to:** matched to `documents.category` at upload time.

### `ui_document_checklists`  ·  Prisma model `UiDocumentChecklist`

**Why this table exists (relevance):** Document Management **builder** config — required-document checklists per entity
type (e.g. every `application` needs these categories).
**When & how rows are written:** `DocumentConfigService` via `/api/builder/document-checklists` (read: JWT, write:
admin).
**What the data represents & notable columns:** `entity_type`, `label`, `description`, `items` (JSON
`[{ category_code, required, label }]`), `is_active`, `order_index`, `tenant_id`.

**Related to:** references category codes in `ui_document_categories`.

**Read by:** `DocumentChecklistService` — the record's Docs tab and client upload links compare a record's documents
with its checklist (a document whose `status` is `rejected` or `expired` does not count). When an object has several
checklists, the one whose `label` shares most words with the record's picklist labels is used, so name checklists
after the product they serve.

### `lead_scoring_rules`  ·  Prisma model `LeadScoringRule`

**Why this table exists (relevance):** Configurable point rules that drive automated lead qualification
(demographic/behavioral/firmographic).
**When & how rows are written:** Created/updated by `LeadScoringService`
(`backend/src/services/lead-scoring.service.js`) — `createRule`/`updateRule` (`db.leadScoringRule.create`/`.update`);
`seedDefaultRules` bulk-creates defaults keyed to actual CrmLead fields. Delete is guarded: if a rule already appears in
any `lead_scores.scoring_details`, it is deactivated instead of removed.
**What the data represents & notable columns:**

- `name` (required), `description`.
- `field_name` — CrmLead field the rule evaluates.
- `operator` — equals | contains | greater_than | less_than | in_list.
- `field_value` — comparison value (Text, nullable).
- `points` Int — awarded when the rule matches.
- `rule_type` — demographic | behavioral | firmographic.
- `is_active`, `order_index` (evaluation order; indexed together).
- `created_by`.

**Related to:** no FK; applied against **Lead** (`crm_lead_intake`) fields — same rule set also usable for prospect
scoring; matched rules are recorded in `lead_scores.scoring_details`.

### `lead_scores`  ·  Prisma model `LeadScore`

**Why this table exists (relevance):** Calculated total score per lead with a breakdown, kept for auditability and
grading/analytics.
**When & how rows are written:** Primary target is a **Lead** (`crm_lead_intake`): `LeadScoringService.scoreLeadIntake`
runs automatically when a lead is created/updated (fire-and-forget hook in `RecordService`), writing `lead_intake_id`.
Legacy/manual **Prospect** scoring (`scoreLead`, `POST /lead-scoring/leads/:id/score`) still writes `lead_id`. One row
per entity: `db.leadScore.update` if an existing row is found (refreshes `total_score`, `scoring_details`,
`calculated_at`), else `db.leadScore.create`. Aggregate/grade endpoints read `total_score`.
**What the data represents & notable columns:**

- `lead_intake_id` — nullable FK→crm_lead_intake (`onDelete: Cascade`, indexed) — the **Lead** being scored (primary).
- `lead_id` — nullable FK→crm_leads (`onDelete: Cascade`, indexed) — a **Prospect** score (legacy/manual). Exactly one
  of `lead_intake_id` / `lead_id` is set per row.
- `total_score` Int default 0 (indexed for leaderboards/grading: A≥80, B≥60, C≥40, D≥20).
- `scoring_details` JSON — `[{ rule_id, rule_name, points, matched_value }]`.
- `calculated_at` default now.

**Related to:** belongs to a `crm_lead_intake` (relation `LeadIntakeScores`) or a `crm_leads` row (relation
`LeadScores`).

### `email_campaigns`  ·  Prisma model `EmailCampaign`

**Why this table exists (relevance):** Configuration and aggregated metrics for an email marketing campaign
(newsletter/drip/promotional/etc.) used for lead nurturing.
**When & how rows are written:** Not written by any of the six reviewed services; populated by the campaign-management
subsystem (create/schedule/send flows). Counters are maintained as sends progress.
**What the data represents & notable columns:**

- `name` (required), `description`, `campaign_type` (newsletter | drip | promotional | event | follow_up).
- `status` default `draft` — draft | scheduled | sending | sent | paused | completed.
- `email_template_id` — nullable FK→email_templates (SetNull).
- `sender_name`, `sender_email` (required), `reply_to_email`, `subject`, `email_html` MediumText, `email_text`.
- `send_date`, `time_zone` default UTC.
- `is_recurring` + `recurring_config` JSON (`{ frequency, interval, end_date }`).
- `segment_filter` JSON — audience filter, e.g. `{ lead_status: [...], industry: [...] }`.
- Aggregate counters: `total_recipients`, `sent_count`, `delivered_count`, `opened_count`, `clicked_count`,
  `bounced_count`, `unsubscribed_count`.
- `created_by`.

**Related to:** references `email_templates`; parent of `campaign_recipients`, `campaign_email_sends`,
`campaign_list_assignments`.

### `campaign_recipients`  ·  Prisma model `CampaignRecipient`

**Why this table exists (relevance):** The resolved audience of a campaign — who should receive it, with personalization
data and per-recipient status.
**When & how rows are written:** Populated by the campaign subsystem when a campaign's audience is built (not by the six
reviewed services).
**What the data represents & notable columns:**

- `campaign_id` — FK→email_campaigns (Cascade).
- `recipient_type` (lead | contact | employee | custom) + `recipient_id` (FK-by-convention to crm_* tables).
- `email` (required), `first_name`, `last_name`, `company`.
- `status` default `active` — active | unsubscribed | bounced | invalid.
- `send_status` default `pending` — pending | sent | failed | skipped.
- `personalization` JSON — custom merge fields.
- `added_at`.
- UNIQUE on `(campaign_id, recipient_type, recipient_id)`.

**Related to:** belongs to `email_campaigns`; parent of `campaign_email_sends`.

### `campaign_email_sends`  ·  Prisma model `CampaignEmailSend`

**Why this table exists (relevance):** Per-recipient send record for a campaign with a full delivery + engagement
timeline and tracking metadata.
**When & how rows are written:** Written by the campaign send/tracking subsystem (not by the six reviewed services);
timestamps/counters updated as delivery and engagement webhooks arrive.
**What the data represents & notable columns:**

- `campaign_id` — FK→email_campaigns (Cascade); `recipient_id` — FK→campaign_recipients (Cascade).
- `email`, `subject`, `email_html` MediumText, `email_text`.
- `send_status` — sent | failed | bounced | delivered | opened | clicked.
- Timeline: `sent_at`, `delivered_at`, `opened_at`, `first_opened_at`, `clicked_at`, `first_clicked_at`, `bounced_at`,
  `bounce_reason`, `unsubscribed_at`, `spam_reported_at`.
- `open_count`, `click_count` (multiple opens/clicks).
- `user_agent`, `ip_address` VarChar(45) IPv6-capable, `tracking_data` JSON.

**Related to:** belongs to `email_campaigns` and `campaign_recipients`; parent of `email_click_events`.

### `email_lists`  ·  Prisma model `EmailList`

**Why this table exists (relevance):** Segmented distribution lists for organizing contacts/leads; manual, dynamic
(criteria-driven), or imported.
**When & how rows are written:** Managed by the campaign/list subsystem (not the six reviewed services); member counts
maintained as subscriptions change.
**What the data represents & notable columns:**

- `name` (required), `description`, `list_type` (manual | dynamic | imported).
- `is_active`, `total_contacts`, `active_contacts` counters.
- `segment_criteria` JSON — for dynamic lists.
- `created_by`.

**Related to:** parent of `email_list_subscriptions` and `campaign_list_assignments`.

### `email_list_subscriptions`  ·  Prisma model `EmailListSubscription`

**Why this table exists (relevance):** Membership + subscription status of an individual within an email list.
**When & how rows are written:** Written by the list subsystem (signup form/import/manual/api); status transitions on
unsubscribe/bounce/complaint.
**What the data represents & notable columns:**

- `list_id` — FK→email_lists (Cascade).
- `subscriber_type` (lead | contact | employee | custom) + `subscriber_id`.
- `email` (required), `first_name`, `last_name`, `company`.
- `status` default `subscribed` — subscribed | unsubscribed | bounced | complained.
- `source` (signup_form | import | manual | api).
- `subscribed_at`, `unsubscribed_at`, `tags` JSON.
- UNIQUE on `(list_id, email)`.

**Related to:** belongs to `email_lists`.

### `campaign_list_assignments`  ·  Prisma model `CampaignListAssignment`

**Why this table exists (relevance):** Junction linking a campaign to the email lists it targets.
**When & how rows are written:** Written by the campaign subsystem when lists are attached to a campaign.
**What the data represents & notable columns:**

- `campaign_id` — FK→email_campaigns (Cascade); `list_id` — FK→email_lists (Cascade).
- `assigned_at`.
- UNIQUE on `(campaign_id, list_id)`.

**Related to:** many-to-many bridge between `email_campaigns` and `email_lists`.

### `email_click_events`  ·  Prisma model `EmailClickEvent`

**Why this table exists (relevance):** Granular per-link click tracking within a sent campaign email (which URL, when,
from where).
**When & how rows are written:** Appended by the click-tracking subsystem on each tracked link click.
**What the data represents & notable columns:**

- `email_send_id` — FK→campaign_email_sends (Cascade, indexed).
- `link_url` (Text), `link_text`.
- `clicked_at` default now (indexed), `ip_address` VarChar(45), `user_agent`, `referrer`.

**Related to:** belongs to a `campaign_email_sends` row.

### `email_unsubscribes`  ·  Prisma model `EmailUnsubscribe`

**Why this table exists (relevance):** Global unsubscribe / suppression registry with reasons and feedback for
compliance.
**When & how rows are written:** Written by the unsubscribe subsystem when a recipient opts out (link or complaint).
**What the data represents & notable columns:**

- `email` — UNIQUE (one suppression row per address; indexed).
- `unsubscribed_at` default now (indexed), `unsubscribe_reason`, `feedback`.
- `campaign_id` — nullable; which campaign triggered the unsubscribe.
- `is_global` default true — suppress from all mail vs specific lists.

**Related to:** loosely references `email_campaigns` via `campaign_id` (no DB-level FK); matched by `email` against
recipients/subscriptions.

## Calendar, Meetings & Calls

Scheduling, meeting-record-keeping, and resource booking for the CRM. Every table in this domain carries a non-null
`tenant_id` (FK → `tenants.id`) and is indexed on it; all reads/writes are tenant-scoped. The calendar, meeting, and
room tables are schema-defined (with full FK wiring and indexes) but have no dedicated Fastify route or service in the
current backend — rows are created directly through Prisma. (The former `call_logs` service/route was removed; call
tracking is handled via the Activity Timeline (type: call). The `call_logs` table remains in the schema but is no
longer backed by a service or route.)

### `calendar_events`  ·  Prisma model `CalendarEvent`

**Why this table exists (relevance):** Central scheduling entity for meetings, calls, demos, tasks, and reminders. Can
be linked polymorphically to any CRM record (lead, contact, account, opportunity, case) so scheduling context stays
attached to the deal.
**When & how rows are written:** No dedicated calendar route/service exists in the current backend; rows are written
directly via Prisma (`prisma.calendarEvent`). Deleting the organizer employee cascades and removes their events
(`onDelete: Cascade` on `organizer`).
**What the data represents & notable columns:**

- `title`, `description`, `event_type` (meeting | call | task | reminder | demo | presentation).
- `start_datetime` / `end_datetime` (required DateTimes), `all_day` bool, `time_zone` (default "UTC").
- `location`, `meeting_link` (Zoom/Teams URL, VarChar 500).
- `related_record_id` + `related_type` (lead | contact | account | opportunity | case) — polymorphic soft link, no DB
  FK; composite-indexed.
- `status` (scheduled | confirmed | in_progress | completed | cancelled | no_show, default "scheduled").
- `visibility` (private | public | confidential, default "private"); `priority` (low | medium | high | urgent, default
  "medium").
- `reminder_minutes` (e.g. 15/30/60 before start).
- `is_recurring` + `recurring_config` JSON `{ frequency, interval, until }`.
- `external_id` for external-calendar sync; `organizer_id` (FK → employees) is the creator.

**Related to:** Belongs to one organizer `Employee`; parent of `calendar_attendees`, `meeting_notes`, and
`room_bookings`.

### `calendar_attendees`  ·  Prisma model `CalendarAttendee`

**Why this table exists (relevance):** Tracks the invitee list and RSVP state for an event, supporting both internal
employees and external people (leads, contacts, raw email addresses).
**When & how rows are written:** Written directly via Prisma when attendees are added to an event; cascade-deleted when
the parent event is removed.
**What the data represents & notable columns:**

- `event_id` (FK → calendar_events).
- `attendee_type` (employee | lead | contact | external); `attendee_id` holds the `employee_id` for internal attendees.
- `external_name` / `external_email` for non-employee invitees.
- `response_status` (pending | accepted | declined | tentative | no_response, default "pending"); `responded_at`.
- `is_organizer`, `is_required` flags.
- Uniqueness: `@@unique([event_id, attendee_type, attendee_id])` prevents duplicate invites of the same party.

**Related to:** Each row belongs to one `CalendarEvent`.

### `meeting_notes`  ·  Prisma model `MeetingNote`

**Why this table exists (relevance):** Captures the outcome and follow-up of a meeting event — minutes, action items,
and next steps.
**When & how rows are written:** Written directly via Prisma by the note recorder after/around a meeting;
cascade-deleted with the parent event.
**What the data represents & notable columns:**

- `event_id` (FK → calendar_events).
- `notes` (Text), `outcomes` (VarChar 500 summary), `follow_up` (VarChar 500 next steps).
- `action_items` JSON array: `[{ task, assignee (employee_id), due_date }]`.
- `recorded_by` (FK → employees, relation "MeetingRecorder").

**Related to:** Belongs to one `CalendarEvent`; `recorded_by` → `Employee`.

### `meeting_rooms`  ·  Prisma model `MeetingRoom`

**Why this table exists (relevance):** Master list of bookable physical/virtual meeting rooms and their resources.
**When & how rows are written:** Written directly via Prisma as an admin/setup catalog; no dedicated service.
**What the data represents & notable columns:**

- `name`, `location`, `capacity` (Int).
- `equipment` JSON array, e.g. `["projector","whiteboard","video_conf"]`.
- `is_active` (indexed), `description`, `booking_url` (external booking-system integration).

**Related to:** Parent of `room_bookings`.

### `room_bookings`  ·  Prisma model `RoomBooking`

**Why this table exists (relevance):** Reservations of a meeting room for a time window, optionally tied to a calendar
event.
**When & how rows are written:** Written directly via Prisma when a room is reserved. Cascade-deleted if the room is
deleted; `event_id` is set null if the linked event is deleted.
**What the data represents & notable columns:**

- `room_id` (FK → meeting_rooms), `event_id` (optional FK → calendar_events).
- `booked_by` (FK → employees, relation "RoomBooker").
- `start_time` / `end_time`, `purpose`, `notes`.
- `status` (confirmed | cancelled | completed, default "confirmed").
- Uniqueness: `@@unique([room_id, start_time, end_time])` — one booking per room per exact slot (double-booking guard).

**Related to:** `MeetingRoom` (parent), optional `CalendarEvent`, `Employee` booker.

### `call_logs`  ·  Prisma model `CallLog`  *(removed — historical reference only)*

**Why this table exists (relevance):** Legacy table for inbound/outbound phone interactions. **The Call Logs module
(service `call-log.service.js` and route `/api/call-logs`) was removed**, and the `call_logs` table **and** its
`CallLog` Prisma model were subsequently **dropped** (migration `20260708120000_drop_orphaned_domains`). Call
tracking is now handled via the Activity Timeline (type: call). This entry is retained for historical reference only —
the table no longer exists in the live schema; the Prisma schema is the source of truth.
**When & how rows are written:** N/A — the table and model no longer exist. The former `call-log.service.js` /
`routes/call-logs` were deleted before the table was dropped.
**What the data represents & notable columns (historical):**

- `phone_number`, `direction` (inbound | outbound, indexed), `duration_seconds`.
- `call_result` (answered | no_answer | busy | voicemail | wrong_number).
- `summary` (Text), `next_action`, `recording_url`, `caller_name`.
- `related_to_id` + `related_to_type` (lead | contact | account | opportunity | case) — polymorphic soft link,
  composite-indexed; no DB FK.
- `logged_by` (employee_id, nullable), `called_at` (required, indexed) vs `created_at`.

**Related to:** No hard FKs beyond `tenant`; links to CRM records only via the polymorphic `related_to_*` pair.

## Reporting & Analytics

The self-service reporting module: users build reports, file them in folders, share them, schedule
them by email, and place them on dashboards — all without a developer or an administrator. Five
tables, each carrying a non-null tenant-scoped `tenant_id` (FK → `tenants.id`, indexed).

See [REPORTING.md](REPORTING.md) for the engine (config shape, filter trees, buckets, calculated
measures, totals, comparison, drill-down) and [Reports](../user-guide/19-reports.md) for the
user-facing feature.

> **Tables removed from an earlier revision of this document.** `kpi_definitions`, `kpi_values`,
> `analytic_dashboards`, `analytic_widgets`, `dashboard_kpis`, `dashboard_shares` and `data_exports`
> were previously documented here in full. **None of them exist** in `schema.prisma` or in the
> database; they were pruned before any code used them, leaving only orphan doc comments in the
> schema (now replaced by the real models below). Their descriptions have been removed rather than
> left as specifications for tables nobody can query.
>
> The equivalents that do exist: dashboard composition is `ui_dashboards` /
> `ui_dashboard_widgets` / `ui_charts` (see [UI Metadata](#ui-metadata--low-code-engine)); KPI-style
> figures are ordinary reports using the `kpi` visualization; and `data_export_requests`
> (`DataExportRequest`) is a real model for GDPR data-portability requests — **not** report
> exports, which stream straight to the client and are not recorded in a table.

### `custom_reports`  ·  Prisma model `CustomReport`

**Why this table exists (relevance):** Stores a user-defined report — its data source, columns or
measures, filter tree, groupings, visualization, totals/comparison settings, colour rules, folder,
and sharing. This is the unit of self-service reporting: it is what the builder saves, what the
viewer runs, what a schedule emails, and what a dashboard widget points at.

**When & how rows are written:** Created/updated/deleted through `routes/reports/index.js`. The
`serialize()` helper maps the builder payload into columns: `report_type` derives from `config.viz`
(`VIZ_TO_TYPE`, default `table`), and `data_source` receives **the full config**. Running a saved
report (`POST /:id/run`) updates `last_run_at` only. `is_scheduled` is maintained by
`ReportScheduleService` whenever a subscription is added, changed or removed. Every write happens
inside `tenantContext.run()` — see
[tenant scoping](REPORTING.md#tenant-scoping--a-local-workaround).

**What the data represents & notable columns:**

- `data_source` (JSON) — **the single source of truth**, and the only column the engine reads:
  `{ source, viz, columns, group_by, metrics, filters, totals, compare, sort, limit, format_rules }`.
- `fields`, `filters`, `grouping`, `sorting`, `chart_config` (JSON) — **mirrors** of parts of
  `data_source`, kept for SQL readability and list queries. Never read by `run()`; do not edit them
  expecting the report to change.
- `report_type` (table | chart | pivot | summary) and `category` (sales | finance |
  support | productivity | custom) — both used for grouping in the library UI.
- `visibility` (private | team | shared | everyone) — who may *open* the report.
  `shared_with` (JSON: role names and/or employee IDs) is consulted **only** when
  `visibility = 'shared'`. `is_shared` is the pre-`visibility` boolean, kept in step for any older
  code path; rows written before the column existed fall back to it, so nothing disappears on
  upgrade. Note that visibility is independent of **scope** — see below.
- `folder_id` (FK → `report_folders`, `ON DELETE SET NULL`, indexed).
- `is_scheduled` — denormalised "has at least one active subscription", so the library can show a
  schedule badge without a join. The schedule itself is in `report_subscriptions`.
- `last_run_at` — stamped after each successful run; the library shows it as "ran `<date>`".
- **Legacy / unused:** `schedule_config` (single-schedule blob, superseded by
  `report_subscriptions`), `refresh_frequency`, `cache_expires_at`, and `cached_result`. Retained as
  columns rather than dropped; nothing reads them. `cached_result` previously received the entire
  result of every saved-report run — up to a 20 000-row JSON blob written on each view, read by
  nothing — so that write was removed.

**Cross-table reads.** A report on this source may also read **related records** (up to two to-one
hops, e.g. `opportunities → owner → region`, resolved as a nested Prisma `select`) and **roll-ups** of a
child collection. Roll-ups are read with a separate `groupBy` on the child table keyed by its
foreign key — **never a join** — so the parent row is never duplicated and its measures cannot be
inflated. See [REPORTING.md](REPORTING.md#the-join-model).

**Visibility vs scope — two independent controls.** `visibility` decides who can open the report.
What a report *shows* is decided at run time by `ReportLibraryService.resolveScope()`, which
downgrades any requested scope to what the caller's role allows (admins `all`, managers `team` via
`employee_hierarchy`, everyone else `me`). Sharing a report therefore never widens anyone's data
access — the same report shows each viewer only their own slice.

**Related to:** `created_by` → employees (by convention, no FK); belongs to one `ReportFolder`; has
many `ReportExecution`, `ReportSubscription` and `ReportFavorite` (all cascade on delete).

### `report_executions`  ·  Prisma model `ReportExecution`

**Why this table exists (relevance):** Execution history, surfaced to users as **Run history** on a
report and used for performance monitoring. It is also the audit trail for scheduled deliveries.

**When & how rows are written:** Inserted by `POST /reports/:id/run` after each interactive run, and
by `ReportScheduleService` after each scheduled send. Both writes are best-effort
(`.catch(() => {})`) — a logging failure must never fail the report.

**What the data represents & notable columns:**

- `report_id` (FK → custom_reports, cascade delete).
- `executed_by` — **NULL means a scheduled run**; that is how the UI distinguishes the two.
- `execution_time` (ms, required), `status` (success | error | timeout | cancelled), `result_rows`,
  `error_message`.
- `filters_used` (JSON) — records the `scope` the run used plus any overrides, and for scheduled
  runs `{ scheduled: true, subscription_id }`. This matters when reconciling why two runs of the
  same report returned different numbers.
- `cache_hit` (bool), `executed_at` (indexed).

**Related to:** Belongs to one `CustomReport`.

### `report_folders`  ·  Prisma model `ReportFolder`

**Why this table exists (relevance):** Lets users organise a growing report library themselves.
Mirrors the report-folder concept in Salesforce, Zoho and Dynamics.

**When & how rows are written:** Created/updated/deleted by any authenticated user through
`/api/reports/folders` (`ReportLibraryService`). Re-parenting is validated against cycles by
`#isDescendant`, which also refuses to make a folder its own parent.

**What the data represents & notable columns:**

- `name`, `description`, `color` (one of a fixed palette), `order_index`, `created_by`.
- `parent_id` (FK → self, `ON DELETE SET NULL`, indexed) — supports sub-folders.

**Deleting a folder never deletes reports.** `deleteFolder` sets contained reports to
`folder_id = NULL` (they become *Uncategorised*) and re-parents child folders to the deleted
folder's parent, then deletes the row.

**Related to:** Self-referencing tree; has many `CustomReport`.

### `report_subscriptions`  ·  Prisma model `ReportSubscription`

**Why this table exists (relevance):** One recurring emailed delivery of a report, **owned by an
employee**. This is what lets a business user say "email me the pipeline every Monday at 8am"
without involving an administrator.

**When & how rows are written:** Created/updated/deleted by the owner (or a report admin) through
`/api/reports/:id/subscriptions` and `/api/reports/subscriptions/:subId`, all handled by
`ReportScheduleService`. `next_run_at` is computed on create and recomputed after every send.

**What the data represents & notable columns:**

- `report_id` (FK, cascade delete), `employee_id` — the owner, who is **always** a recipient.
- `frequency` (daily | weekdays | weekly | monthly), `hour` (0–23, server local time),
  `day_of_week` (0 = Sunday … 6; weekly only), `day_of_month` (1–28, capped so every month has the
  day; monthly only). Out-of-range values are clamped rather than rejected.
- `format` (inline | xlsx | csv) — `inline` renders the report in the email body; the others attach
  a file and still include the inline table.
- `recipients` (JSON) — extra addresses. Normalised on write: split on commas/semicolons/whitespace,
  lower-cased, regex-validated, de-duplicated and **capped at 25**, so a subscription cannot be
  turned into a mailing blast.
- `scope` (me | team | all) — clamped at send time to what the **owner's** role allows, so
  scheduling cannot be used to email data the owner could not see interactively.
- `subject`, `message` (an optional note shown in the email body).
- `is_active`, `last_sent_at`, `last_status` (sent | error | skipped), `last_error`.
- `next_run_at` — **the concurrency primitive**, see below.

**Indexes:** `report_id`, `employee_id`, `(is_active, next_run_at)` — the composite the sweeper's
due-query uses — and `tenant_id`.

**How the sweeper uses `next_run_at`:** `sweepDue()` (run every 60 s from `app.js`, offset 20 s)
selects active rows whose `next_run_at` has passed, then claims each one with
`updateMany({ where: { id, next_run_at: <the value it read> }, data: { next_run_at: null } })`.
A second pod that read the same row updates 0 rows and skips it, so multiple pods cannot
double-send. The report is then run inside `tenantContext.run({ tenantId })` — a scheduled run has
no HTTP request, so the tenant must be established explicitly or the Prisma tenant-scope extension
sees no tenant at all. `next_run_at` is recomputed **even after a failure**, so one bad send cannot
silently kill a schedule; the failure is recorded on `last_status` / `last_error`.

**Related to:** Belongs to one `CustomReport`.

### `report_favorites`  ·  Prisma model `ReportFavorite`

**Why this table exists (relevance):** A per-user starred report, so each person gets their own
shortlist of the reports they actually use — independent of who created or shared them.

**When & how rows are written:** Upserted / deleted by `POST /api/reports/:id/favorite`
(`ReportLibraryService.setFavorite`). The library list stamps `is_favorite` onto each report for the
calling user.

**What the data represents & notable columns:**

- `report_id` (FK, cascade delete), `employee_id`, `created_at`.
- UNIQUE `(report_id, employee_id)` — the upsert target, and what makes starring idempotent.

**Related to:** Belongs to one `CustomReport`.

## Contracts & CLM

Contract lifecycle management — templates, approvals, e-signatures, milestones, amendments, and renewals — tied to CRM
opportunities/accounts/contacts. Every table carries a non-null tenant-scoped `tenant_id` (FK → `tenants.id`, indexed).
No dedicated contract route/service exists in the current backend; all rows in this domain are schema-defined with full
FK wiring and indexes but are written directly via Prisma.

### `contracts`  ·  Prisma model `Contract`

**Why this table exists (relevance):** Root record of the contract lifecycle — party links, financial terms,
legal-review state, signing status, and renewal settings.
**When & how rows are written:** No dedicated route/service; rows written directly via Prisma. FKs to
opportunity/account/contact/template all `SetNull` on parent delete (contract survives).
**What the data represents & notable columns:**

- `contract_number` (unique), `title`, `contract_type` (sales | service | partnership | nda | msa).
- `status` (draft | review | approval | signed | active | expired | terminated | cancelled, default "draft"; indexed),
  `priority` (low | medium | high | urgent).
- `related_opportunity_id` (FK → crm_opportunities), `related_account_id` (FK → crm_accounts, "contracting party"),
  `related_contact_id` (FK → crm_contacts).
- `value` (Decimal 18,2), `currency` (default "USD"), `start_date` / `end_date` (Date).
- `auto_renewal`, `renewal_period` (monthly | quarterly | annual), `renewal_notice_days` (default 30).
- `payment_terms` (net_30 | net_60 | prepaid | milestone), `billing_frequency` (monthly | quarterly | annual |
  one_time), `contract_terms` (Text).
- Legal review: `legal_review_required` (default true), `legal_reviewer_id`, `legal_review_status` (pending | approved |
  rejected | changes_requested), `legal_review_notes`.
- `template_id` (FK → contract_templates), `document_url`, `signature_status` (pending | partial | complete, indexed),
  `signed_date`.
- `created_by`, `owner_id` (account manager).

**Related to:** FKs to `CrmOpportunity`, `CrmAccount`, `CrmContact`, `ContractTemplate`; parent of `contract_approvals`,
`contract_signatures`, `contract_milestones`, `contract_amendments`, `contract_renewals`.

### `contract_templates`  ·  Prisma model `ContractTemplate`

**Why this table exists (relevance):** Reusable, versioned contract templates with variable placeholders and default
terms for standardized contract creation.
**When & how rows are written:** No dedicated route/service; rows written directly via Prisma.
**What the data represents & notable columns:**

- `name`, `category` (sales | service | legal | hr, indexed), `description`.
- `template_content` (LongText — HTML or markdown).
- `variables` JSON `[{ name, type, required }]`; `default_terms` JSON.
- `approval_required` (default true), `legal_approved` (default false), `version` (VarChar), `is_active` (indexed),
  `created_by`.

**Related to:** Has many `contracts`.

### `contract_approvals`  ·  Prisma model `ContractApproval`

**Why this table exists (relevance):** Multi-stage, multi-level approval workflow rows for a contract, with delegation
and deadline tracking.
**When & how rows are written:** No dedicated route/service; rows written directly via Prisma. Cascade-deleted with the
parent contract.
**What the data represents & notable columns:**

- `contract_id` (FK, cascade), `approver_id`, `approval_stage` (legal | finance | management | executive).
- `status` (pending | approved | rejected | delegated, default "pending").
- `approval_level` (Int sequence for multi-level), `required` (true = blocking).
- `comments`, `conditions` JSON, `approved_at`, `due_date` (indexed), `delegated_to_id`, `notification_sent`.
- Indexes on `[contract_id, approval_level]` and `[approver_id, status]`.

**Related to:** Belongs to one `Contract`.

### `contract_signatures`  ·  Prisma model `ContractSignature`

**Why this table exists (relevance):** Tracks each signer's e-signature state and audit metadata for a contract.
**When & how rows are written:** No dedicated route/service; rows written directly via Prisma. Cascade-deleted with the
parent contract.
**What the data represents & notable columns:**

- `contract_id` (FK, cascade), `signer_name`, `signer_email` (indexed), `signer_role` (client | vendor | witness |
  internal).
- `signature_order` (signing sequence), `status` (pending | invited | viewed | signed | declined, indexed).
- `signature_method` (docusign | adobe_sign | wet_signature | internal), `signature_url` (external e-sign link).
- `ip_address` (VarChar 45), `signature_data` (Text — metadata/image).
- Timeline: `invited_at`, `viewed_at`, `signed_at`, `declined_reason`; `is_required`.
- Index on `[contract_id, signature_order]`.

**Related to:** Belongs to one `Contract`.

### `contract_milestones`  ·  Prisma model `ContractMilestone`

**Why this table exists (relevance):** Deliverables/milestones of a contract, optionally triggering payments on
completion.
**When & how rows are written:** No dedicated route/service; rows written directly via Prisma. Cascade-deleted with the
parent contract.
**What the data represents & notable columns:**

- `contract_id` (FK, cascade), `name`, `description`, `due_date` (indexed).
- `status` (pending | in_progress | completed | overdue | cancelled, default "pending"; indexed).
- `completion_criteria`, `deliverables` JSON, `assigned_to`, `completion_notes`.
- `payment_trigger` (bool) + `payment_amount` (Decimal 18,2) — completing the milestone can release payment.
- `completed_at`, `order_index` (indexed with contract_id).

**Related to:** Belongs to one `Contract`.

### `contract_amendments`  ·  Prisma model `ContractAmendment`

**Why this table exists (relevance):** Change-tracking record for modifications to an executed contract (before/after
values, reason, status).
**When & how rows are written:** No dedicated route/service; rows written directly via Prisma. Cascade-deleted with the
parent contract.
**What the data represents & notable columns:**

- `contract_id` (FK, cascade), `amendment_number` (e.g. "Amendment #1"), `title`, `description` (required Text).
- `change_type` (extension | value_change | scope_change | termination | other), `effective_date`.
- `old_values` / `new_values` JSON (before/after snapshots), `reason`.
- `status` (draft | review | approved | executed | rejected, default "draft"; indexed).
- `requested_by`, `approved_by`, `document_url`.

**Related to:** Belongs to one `Contract`.

### `contract_renewals`  ·  Prisma model `ContractRenewal`

**Why this table exists (relevance):** Manages renewal decisions and terms for an expiring contract, including rate
changes and optional creation of a successor contract.
**When & how rows are written:** No dedicated route/service; rows written directly via Prisma. Cascade-deleted with the
parent contract.
**What the data represents & notable columns:**

- `contract_id` (FK, cascade), `renewal_type` (automatic | manual | negotiated), `renewal_period` (1_year | 2_year |
  monthly | quarterly).
- `new_start_date` / `new_end_date`, `new_value` (Decimal 18,2), `rate_change_percent` (Decimal 5,2).
- `status` (pending | approved | rejected | executed | cancelled, default "pending"; indexed).
- `terms_changed` + `new_terms`, `approval_required` (default true).
- Timeline: `notice_sent_date`, `decision_due_date` (indexed), `executed_date`.
- `new_contract_id` — soft link to the successor contract if one is created; `notes`, `created_by`.

**Related to:** Belongs to one `Contract` (parent); `new_contract_id` optionally references a successor contract row.

## Deals, Territories & Sales Teams

Sales-pipeline structure, geographic/segment territory management, and sales-team org modeling. Every table in this
domain is tenant-scoped via a required `tenant_id` Int FK to `Tenant` (with a `@@index([tenant_id])`), so all
reads/writes must be filtered by tenant. Note: these models are defined in the Prisma schema and the initial migration,
but no service under `backend/src/services` or route under `backend/src/routes` currently reads or writes them — they
are schema-only scaffolding awaiting API wiring, so "how rows are written" below describes the intended path, not live
code.

### `deal_stages`  ·  Prisma model `DealStage`

**Why this table exists (relevance):** Defines the ordered pipeline stages a deal/opportunity moves through, along with
each stage's win probability and win/loss semantics. Drives forecast probability weighting and pipeline UI.
**When & how rows are written:** Configuration data, seeded/administered per tenant (no live service references it).
Rows are effectively reference data created by admins; `updated_at` bumps on edit via `@updatedAt`.
**What the data represents & notable columns:**

- `name` (VarChar 100, `@unique`) and `stage_order` (Int, `@unique`) — pipeline ordering (1, 2, 3…).
- `probability` (Int, 0–100) — win probability for deals in this stage.
- `is_closed` / `is_won` (Boolean) — mark final stages; `is_won` true only for "closed won".
- `category` (VarChar 50) — `prospecting | proposal | negotiation | closing`.
- `required_fields` (JSON) — fields required to advance into the stage.
- `stage_criteria` / `exit_criteria` (Text), `typical_duration` (Int days), `color` (hex, default `#6366f1`),
  `is_active`.
- Note: uniqueness of `name`/`stage_order` is global (not scoped to `tenant_id`).

**Related to:** Parent of `deal_stage_history` (via `to_stage_id`). Tenant-scoped.

### `deal_stage_history`  ·  Prisma model `DealStageHistory`

**Why this table exists (relevance):** Immutable audit trail of every stage transition on an opportunity, enabling
sales-cycle and stage-duration analytics.
**When & how rows are written:** Inserted whenever an opportunity changes stage (intended to be written by the
opportunity/deal update path). Append-only; no `updated_at`.
**What the data represents & notable columns:**

- `opportunity_id` (Int) — the deal that moved (indexed with `changed_at`); note: no FK constraint to the opportunity
  table.
- `from_stage_id` (Int?, null for initial stage) and `to_stage_id` (Int, FK→`deal_stages`).
- `from_probability` / `to_probability` — probability snapshot before/after.
- `days_in_prev_stage` (Int?) — time spent in the prior stage.
- `changed_by` (VarChar 20 — employee id), `change_reason` (VarChar 255), `notes` (Text), `changed_at`.

**Related to:** `to_stage` → `deal_stages`; loosely references an opportunity via `opportunity_id`. Tenant-scoped.

### `deal_competitors`  ·  Prisma model `DealCompetitor`

**Why this table exists (relevance):** Competitive-intelligence tracking per opportunity — who else is bidding, their
strengths/weaknesses, and threat assessment.
**When & how rows are written:** Created/edited by sales reps on a deal's competitor tab (intended). `updated_at` via
`@updatedAt`.
**What the data represents & notable columns:**

- `opportunity_id` (Int, indexed; no FK constraint), `competitor_name` (VarChar 255, indexed).
- `product_solution` — the competing offering; `strength` / `weakness` / `pricing_intel` (Text).
- `status` (default `active`) — `active | eliminated | withdrawn | unknown`.
- `threat_level` (default `medium`) — `low | medium | high`.
- `win_probability` (Int?) — impact on our win chance; `last_activity`, `intelligence_source`, `added_by` (employee id).

**Related to:** Loosely tied to an opportunity via `opportunity_id`. Tenant-scoped.

### `territories`  ·  Prisma model `Territory`

**Why this table exists (relevance):** Defines geographic/industry/account-based sales territories, optionally
hierarchical, each with a quota and manager. Basis for routing records and measuring territory performance.
**When & how rows are written:** Created/administered by sales-ops; supports self-referencing hierarchy. `updated_at`
via `@updatedAt`.
**What the data represents & notable columns:**

- `name`, `territory_code` (VarChar 20, `@unique`).
- `territory_type` (VarChar 50) — `geographic | industry | account_based | product`.
- `parent_territory_id` (self-FK, `onDelete: SetNull`) — hierarchy.
- `geographic_data` (JSON: `{ countries, states, cities, zip_codes }`), `industry_focus` (JSON), `account_criteria`
  (JSON assignment rules).
- `annual_quota` (Decimal 18,2), `quota_currency` (default `USD`), `manager_id` (employee id, indexed).
- `effective_from` / `effective_to` (Date), `is_active`, `created_by`.

**Related to:** Self-hierarchy (`parent_territory`/`sub_territories`); parent of `territory_assignments`,
`territory_members`, `territory_rules`, `territory_performances`. Tenant-scoped.

### `territory_assignments`  ·  Prisma model `TerritoryAssignment`

**Why this table exists (relevance):** Maps individual CRM records (lead/contact/account/opportunity) to a territory,
tracking how and when the assignment was made and its effective window.
**When & how rows are written:** Inserted when a record is routed to a territory — automatically (rule/AI), manually, or
inherited. `updated_at` via `@updatedAt`.
**What the data represents & notable columns:**

- `territory_id` (FK→`territories`, `onDelete: Cascade`).
- `record_type` (VarChar 50) + `record_id` (Int) — polymorphic target: `lead | contact | account | opportunity` (indexed
  together).
- `assignment_method` — `automatic | manual | inherited`; `assignment_rule_id` (Int?) — which rule fired.
- `confidence_score` (Decimal 5,2, 0–100) — confidence in an automatic assignment.
- `assigned_by`, `effective_from` (default now), `effective_to`, `is_active`, `notes`.
- `@@unique([territory_id, record_type, record_id, effective_from])` — one active assignment per record/territory/start.

**Related to:** `territory` → `territories`; references a CRM record polymorphically. Tenant-scoped.

### `territory_members`  ·  Prisma model `TerritoryMember`

**Why this table exists (relevance):** Staffing of territories — which employees work a territory, in what role, with
what quota share and commission.
**When & how rows are written:** Inserted when an employee is added to a territory; end-dated on removal. `updated_at`
via `@updatedAt`.
**What the data represents & notable columns:**

- `territory_id` (FK→`territories`, Cascade), `employee_id` (FK→`employees.employee_id`, Cascade).
- `member_role` — `manager | rep | support | overlay`; `role_type` — `primary | secondary | support`.
- `quota_percentage` (Decimal 5,2) — share of territory quota; `commission_rate` (Decimal 5,4).
- `start_date` / `end_date`, `is_active`, `can_reassign` (Boolean — may reassign accounts), `permissions` (JSON),
  `added_by`.
- `@@unique([territory_id, employee_id, start_date])`.

**Related to:** `territory` → `territories`; `employee` → `employees`. Tenant-scoped.

### `territory_rules`  ·  Prisma model `TerritoryRule`

**Why this table exists (relevance):** Declarative rules that drive automatic assignment of records into a territory
based on field conditions and priority.
**When & how rows are written:** Authored by sales-ops as assignment automation config. `updated_at` via `@updatedAt`.
**What the data represents & notable columns:**

- `territory_id` (FK→`territories`, Cascade), `rule_name` (VarChar 255).
- `object_type` — `lead | account | contact | opportunity`.
- `conditions` (JSON, required) — e.g. `[{ field: "state", operator: "in", values: ["CA","NV"] }]`.
- `priority` (Int, higher = evaluated first), `is_active`, `effective_from`/`effective_to`, `created_by`.
- Indexed on `(territory_id, is_active, priority)` for rule evaluation.

**Related to:** `territory` → `territories`; referenced by `territory_assignments.assignment_rule_id` (by value, not
enforced FK). Tenant-scoped.

### `territory_performances`  ·  Prisma model `TerritoryPerformance`

**Why this table exists (relevance):** Pre-aggregated performance snapshot per territory per period for dashboards and
ranking.
**When & how rows are written:** Written by a metrics rollup/scheduler that computes each period (no live scheduler
references it yet). `calculated_at` records when computed; no `updated_at`.
**What the data represents & notable columns:**

- `territory_id` (FK→`territories`, Cascade), `period_start`/`period_end` (Date), `period_type` —
  `month | quarter | year`.
- Financials: `quota_amount`, `revenue_actual`, `revenue_pipeline`, `avg_deal_size` (Decimal 18,2).
- Counts: `deals_won`, `deals_lost`, `new_accounts`, `activities_completed` (default 0).
- Rates: `lead_conversion_rate` (Decimal 5,2 %), `sales_cycle_days` (Decimal 5,1), `quota_attainment` (Decimal 5,2 %).
- `rank` (Int vs other territories), `metrics_data` (JSON extra metrics).
- `@@unique([territory_id, period_type, period_start, period_end])`.

**Related to:** `territory` → `territories`. Tenant-scoped.

### `sales_teams`  ·  Prisma model `SalesTeam`

**Why this table exists (relevance):** Organizes reps into hierarchical sales teams with a manager, quota,
product/territory focus, and KPI targets.
**When & how rows are written:** Created/administered by sales management; supports parent/child team hierarchy.
`updated_at` via `@updatedAt`.
**What the data represents & notable columns:**

- `name`, `team_code` (VarChar 20, `@unique`), `team_type` — `inside_sales | field_sales | channel | overlay | support`.
- `manager_id` (required, FK→`employees.employee_id`, `onDelete: Restrict`).
- `parent_team_id` (self-FK, `onDelete: SetNull`) — team hierarchy.
- `territory_focus` (JSON territory ids), `product_focus` (JSON), `market_segment` — `enterprise | mid_market | smb`.
- `annual_quota` (Decimal 18,2), `quota_currency` (default USD), `commission_plan` (JSON), `meeting_cadence`
  (`daily | weekly | monthly`), `kpi_targets` (JSON), `is_active`, `created_by`.

**Related to:** `manager` → `employees`; self-hierarchy; parent of `sales_team_members`, `team_meetings`,
`team_performances`. Tenant-scoped.

### `sales_team_members`  ·  Prisma model `SalesTeamMember`

**Why this table exists (relevance):** Roster of a sales team — members, their roles, individual quotas, commission, and
performance tier.
**When & how rows are written:** Inserted when a rep joins a team; end-dated on departure. `updated_at` via
`@updatedAt`.
**What the data represents & notable columns:**

- `team_id` (FK→`sales_teams`, Cascade), `employee_id` (FK→`employees.employee_id`, Cascade).
- `member_role` — `rep | senior_rep | lead | specialist`; `is_team_lead` (Boolean).
- `individual_quota` (Decimal 18,2), `commission_rate` (Decimal 5,4).
- `performance_tier` — `bronze | silver | gold | platinum`; `mentoring_role` — `mentor | mentee | buddy`;
  `specializations` (JSON).
- `start_date`/`end_date`, `is_active`, `added_by`.
- `@@unique([team_id, employee_id, start_date])`.

**Related to:** `team` → `sales_teams`; `employee` → `employees`. Tenant-scoped.

### `team_meetings`  ·  Prisma model `TeamMeeting`

**Why this table exists (relevance):** Records team meetings (standups, forecast/pipeline reviews, training) with
agenda, notes, action items, and attendees.
**When & how rows are written:** Created by the team organizer when scheduling/logging a meeting. `updated_at` via
`@updatedAt`.
**What the data represents & notable columns:**

- `team_id` (FK→`sales_teams`, Cascade), `meeting_type` — `standup | forecast | review | training | pipeline`.
- `title`, `meeting_date` (DateTime), `duration_minutes` (default 60), `location`, `meeting_link` (virtual URL).
- `agenda`/`notes`/`decisions_made` (Text), `next_meeting` (DateTime?), `organizer_id` (employee id).
- `action_items` (JSON: `[{task, assignee, due_date, completed}]`), `attendees` (JSON employee ids), `metrics_reviewed`
  (JSON KPIs).

**Related to:** `team` → `sales_teams`. Tenant-scoped.

### `team_performances`  ·  Prisma model `TeamPerformance`

**Why this table exists (relevance):** Pre-aggregated performance snapshot per sales team per period, including
velocity, collaboration, and top-performer tracking.
**When & how rows are written:** Written by a metrics rollup/scheduler per period (not yet wired). `calculated_at`
records computation time; no `updated_at`.
**What the data represents & notable columns:**

- `team_id` (FK→`sales_teams`, Cascade), `period_start`/`period_end` (Date), `period_type` — `month | quarter | year`.
- Financials: `quota_amount`, `revenue_actual`, `revenue_pipeline`, `avg_deal_size` (Decimal 18,2).
- Counts: `deals_won`, `deals_lost`, `activities_logged` (default 0).
- `sales_velocity` (Decimal 8,2 — deals/week), `quota_attainment` (Decimal 5,2 %, indexed), `activity_score` /
  `collaboration_score` (Decimal 5,1).
- `top_performer_id` (employee id), `improvement_areas` (JSON), `achievements` (JSON).
- `@@unique([team_id, period_type, period_start, period_end])`.

**Related to:** `team` → `sales_teams`. Tenant-scoped.

## Customer Portal & Service

Customer-facing self-service portal: external user accounts, sessions, cases and their message threads/escalations,
service requests, a knowledge base, and satisfaction/feedback/download analytics. Every table here is tenant-scoped via
a required `tenant_id` Int FK to `Tenant` (with `@@index([tenant_id])`). As with the sales domain above, these models
are present in the schema/migration but are not referenced by any current service or route — the write paths described
are the intended portal flows.

### `customer_portal_users`  ·  Prisma model `CustomerPortalUser`

**Why this table exists (relevance):** External login accounts for the customer self-service portal, distinct from
internal `employees`. Optionally linked to a CRM contact/account.
**When & how rows are written:** Created on portal self-registration or by an internal user (`created_by`); updated on
login (sets `last_login_at`, `login_attempts`, `is_locked`), verification, and password reset. `updated_at` via
`@updatedAt`.
**What the data represents & notable columns:**

- `contact_id` (Int?, `@unique`, FK→`crm_contacts`, SetNull), `account_id` (Int?, FK→`crm_accounts`, SetNull) — CRM
  linkage.
- `email` (VarChar 255, `@unique`), `password_hash`, name/phone/company/job_title.
- `role` (default `user`) — `user | admin | viewer`; `permissions` (JSON).
- Auth/security: `login_attempts`, `is_locked`, `is_verified`, `verification_token` (`@unique`), `reset_token`
  (`@unique`) + `reset_token_expires`, `last_login_at`.
- `preferences` (JSON), `timezone` (default UTC), `language` (default en), `is_active`, `created_by` (internal user).

**Related to:** `contact` → `crm_contacts`, `account` → `crm_accounts`; parent of `portal_sessions`, `customer_cases`,
`service_requests`, `customer_feedback`, `portal_downloads`, `article_feedback`. Tenant-scoped.

### `portal_sessions`  ·  Prisma model `PortalSession`

**Why this table exists (relevance):** Tracks active portal login sessions for security, expiry, and analytics.
**When & how rows are written:** Inserted on login (session token as PK); `last_activity` updated on each request;
`is_active` flipped / row deleted on logout or expiry (cleanup scheduler intended).
**What the data represents & notable columns:**

- `id` (VarChar 128, PK) — the session token itself.
- `user_id` (FK→`customer_portal_users`, Cascade).
- `ip_address` (VarChar 45 — IPv6-capable), `user_agent` (Text), `login_method` — `password | sso | token`, `location`
  (geo).
- `is_active`, `expires_at` (indexed), `last_activity` (indexed).

**Related to:** `user` → `customer_portal_users`. Tenant-scoped.

### `customer_cases`  ·  Prisma model `CustomerCase`

**Why this table exists (relevance):** Support tickets raised by portal users, optionally mirrored to an internal CRM
case, with SLA, priority, resolution, and satisfaction tracking.
**When & how rows are written:** Inserted when a portal user opens a case; updated by support staff
(status/assignment/resolution) and by the customer (satisfaction rating). `updated_at` via `@updatedAt`.
**What the data represents & notable columns:**

- `case_number` (VarChar 50, `@unique`), `user_id` (FK→`customer_portal_users`, Cascade).
- `related_crm_case_id` (Int?, `@unique`, FK→`crm_cases`, SetNull) — one-to-one bridge to internal CRM case.
- `subject`, `description` (Text), `category` — `technical | billing | general | product`.
- `priority` (default `medium`) — `low | medium | high | urgent`; `status` (default `open`) —
  `open | in_progress | waiting | resolved | closed`; `source` (default `portal`) — `portal | email | phone | chat`.
- `attachment_urls` (JSON), `internal_notes` (staff-only Text), `resolution` (Text).
- `satisfaction_rating` (Int 1–5), `satisfaction_feedback`, `assigned_to` (employee id).
- Timestamps: `resolved_at`, `closed_at`, `escalated_at`, `sla_due_date` (indexed).

**Related to:** `user` → `customer_portal_users`; `crm_case` → `crm_cases`; parent of `case_messages`,
`case_escalations`. Tenant-scoped.

### `case_messages`  ·  Prisma model `CaseMessage`

**Why this table exists (relevance):** The threaded conversation on a case between customer, support staff, and system,
including internal-only notes.
**When & how rows are written:** Appended each time a customer or agent posts a reply, or the system emits an event.
Append-only (no `updated_at`); read flags updated in place.
**What the data represents & notable columns:**

- `case_id` (FK→`customer_cases`, Cascade).
- `sender_type` — `customer | support | system`; `sender_id` (user_id or employee_id), `sender_name`.
- `message` (Text), `is_internal` (Boolean — support-only, indexed), `attachments` (JSON).
- `message_type` (default `text`) — `text | file | system | escalation`.
- `read_by_customer` / `read_by_support` (Boolean).

**Related to:** `case` → `customer_cases`. Tenant-scoped.

### `case_escalations`  ·  Prisma model `CaseEscalation`

**Why this table exists (relevance):** Records escalation events on a case — who escalated to whom, why, and at what
tier — for SLA/handoff tracking.
**When & how rows are written:** Inserted when a case is escalated; `status` updated on acknowledgement/resolution
(`resolved_at` set). Append-only otherwise.
**What the data represents & notable columns:**

- `case_id` (FK→`customer_cases`, Cascade).
- `escalated_from` (employee id?), `escalated_to` (employee id, required, indexed).
- `escalation_reason` (VarChar 255), `escalation_level` — `tier_2 | manager | executive`, `notes` (Text).
- `status` (default `pending`) — `pending | acknowledged | resolved`; `resolved_at`, `escalated_at`.

**Related to:** `case` → `customer_cases`. Tenant-scoped.

### `service_requests`  ·  Prisma model `ServiceRequest`

**Why this table exists (relevance):** Self-service requests for common account actions (password reset, access, data
export) with optional approval workflow.
**When & how rows are written:** Inserted when a portal user submits a request; updated through
approval/processing/completion (`approved_by`, `processed_by`, `completed_at`). `updated_at` via `@updatedAt`.
**What the data represents & notable columns:**

- `user_id` (FK→`customer_portal_users`, Cascade).
- `request_type` — `password_reset | access_request | data_export | account_update`; `title`, `details` (JSON
  request-specific payload).
- `status` (default `pending`) — `pending | approved | rejected | completed`; `approval_required` (Boolean).
- `approved_by` / `processed_by` (employee ids), `approval_notes`, `completion_data` (JSON results), `completed_at`,
  `expires_at` (indexed — time-sensitive).

**Related to:** `user` → `customer_portal_users`. Tenant-scoped.

### `knowledge_articles`  ·  Prisma model `KnowledgeArticle`

**Why this table exists (relevance):** Knowledge-base articles for customer (and internal) self-help, with publishing,
versioning, SEO, and vote/view analytics.
**When & how rows are written:** Authored/edited by internal staff (`author_id`); `view_count` and
`helpful_votes`/`unhelpful_votes` incremented on read/feedback. `updated_at` via `@updatedAt`.
**What the data represents & notable columns:**

- `title`, `slug` (VarChar 255, `@unique` — URL id), `content` (LongText, HTML/markdown), `summary` (Text).
- `category_id` (FK→`knowledge_categories`, `onDelete: Restrict`), `tags` (JSON), `related_articles` (JSON ids).
- Flags: `is_published`, `is_featured`, `is_internal` (employee-only).
- Analytics: `view_count`, `helpful_votes`, `unhelpful_votes`.
- `search_keywords` (Text) plus `@@fulltext([title, summary, content])` for search.
- Lifecycle: `author_id`, `last_reviewed`, `review_due`, `version` (default 1); SEO `meta_title`, `meta_description`.

**Related to:** `category` → `knowledge_categories`; parent of `article_feedback`, `article_attachments`. Tenant-scoped.

### `knowledge_categories`  ·  Prisma model `KnowledgeCategory`

**Why this table exists (relevance):** Hierarchical categorization/navigation for the knowledge base.
**When & how rows are written:** Created/administered by KB editors; supports parent/child nesting. `updated_at` via
`@updatedAt`.
**What the data represents & notable columns:**

- `name`, `slug` (VarChar 255, `@unique`), `description` (Text).
- `parent_id` (self-FK, `onDelete: SetNull`) — nested categories.
- `icon` (UI icon name), `color`, `sort_order` (Int, default 0), `is_visible` (indexed with `sort_order`).

**Related to:** Self-hierarchy (`parent_category`/`sub_categories`); parent of `knowledge_articles`. Tenant-scoped.

### `article_feedback`  ·  Prisma model `ArticleFeedback`

**Why this table exists (relevance):** Per-article ratings and helpful/unhelpful votes, from logged-in portal users or
anonymous visitors.
**When & how rows are written:** Inserted when a reader rates an article. Append-only (no `updated_at`).
**What the data represents & notable columns:**

- `article_id` (FK→`knowledge_articles`, Cascade).
- `user_id` (Int?, FK→`customer_portal_users`, SetNull — null for anonymous).
- `rating` (Int 1–5), `is_helpful` (Boolean? — thumbs up/down), `feedback` (Text).
- Anonymous tracking: `visitor_id` (VarChar 255), `ip_address` (VarChar 45).

**Related to:** `article` → `knowledge_articles`; `user` → `customer_portal_users`. Tenant-scoped.

### `article_attachments`  ·  Prisma model `ArticleAttachment`

**Why this table exists (relevance):** Downloadable file attachments (PDFs, images, etc.) associated with a knowledge
article.
**When & how rows are written:** Inserted when an editor uploads a file to an article; `download_count` incremented on
download. Append-only otherwise (no `updated_at`).
**What the data represents & notable columns:**

- `article_id` (FK→`knowledge_articles`, Cascade), `filename`, `file_path` (VarChar 500 storage location).
- `file_size` (BigInt bytes), `mime_type`, `description` (Text).
- `is_downloadable` (Boolean, default true), `download_count` (Int), `uploaded_by` (employee id).

**Related to:** `article` → `knowledge_articles`. Tenant-scoped.

### `customer_feedback`  ·  Prisma model `CustomerFeedback`

**Why this table exists (relevance):** General customer satisfaction/NPS feedback across cases, products, services, and
the portal, with multi-dimensional ratings and sentiment.
**When & how rows are written:** Inserted when a portal user submits feedback (post-case survey, NPS prompt, etc.).
Append-only (no `updated_at`); `follow_up_*` may be updated by staff.
**What the data represents & notable columns:**

- `user_id` (FK→`customer_portal_users`, Cascade).
- `feedback_type` — `general | case | product | service | portal`; `related_id` (Int?) + `related_type`
  (`case | product | service | interaction`) — polymorphic target.
- Ratings (Int 1–5): `rating_overall` (indexed), `rating_quality`, `rating_speed`, `rating_ease`.
- `comments`, `improvement_suggestions` (Text), `would_recommend` (Boolean? — NPS, indexed), `sentiment` —
  `positive | neutral | negative`.
- `contact_permission`, `is_public`, `follow_up_required`, `follow_up_notes`.

**Related to:** `user` → `customer_portal_users`; loosely references case/product/service via
`related_id`/`related_type`. Tenant-scoped.

### `portal_downloads`  ·  Prisma model `PortalDownload`

**Why this table exists (relevance):** Audit/analytics log of every file a portal user downloads (documents,
attachments, reports, invoices).
**When & how rows are written:** Inserted on each download event. Append-only (no `updated_at`).
**What the data represents & notable columns:**

- `user_id` (FK→`customer_portal_users`, Cascade).
- `item_type` — `document | attachment | report | invoice` (indexed); `item_id` (VarChar 255), `item_name`, `file_path`
  (VarChar 500).
- `file_size` (BigInt bytes), `ip_address` (VarChar 45), `user_agent` (Text), `created_at` (indexed).

**Related to:** `user` → `customer_portal_users`. Tenant-scoped.

Covers Social Media, Partner/Channel Management, and Multi-Tenant Platform &
Administration tables. Verified against `backend/prisma/schema.prisma`,
`backend/src/services/social-media.service.js`,
`backend/src/services/social-assignment.service.js`, and
`backend/src/services/platform/*` + `backend/src/routes/platform/`.

> **Multi-tenancy note.** `Tenant` (`tenants`) is the root of the SaaS
> multi-tenant model. Almost every operational table in the schema carries a
> non-null `tenant_id` → `tenants.id` foreign key (declared via a named
> `@relation("Tenant<Model>")` and an `@@index([tenant_id])`), so all queries are
> tenant-scoped. Where a table below omits `tenant_id`, that is called out
> explicitly — those are platform-global (super-admin) tables that sit above any
> single tenant.

---

## Social Media

The social suite is managed **at the tenant level** — accounts are connected once
per org and staff interact through RBAC; individual employees do not link their
own accounts (see the class docstring in `social-media.service.js`). All CRUD and
sync logic lives in `SocialMediaService`; inbound-conversation routing lives in
`SocialAssignmentService`. Platform APIs are reached through a Connector layer
(`backend/src/connectors/social`) with a SimulationConnector default. Two
background jobs write to these tables without any request: `social-publish`
(every minute) and `social-sync` (every 5 minutes) — see
[SOCIAL_ENGINE.md](SOCIAL_ENGINE.md). `social_media_engagements`, `social_media_leads`
and `competitor_social_activities` below were **dropped in July 2026** and are
historical; social lead capture now writes a `crm_leads` row with
`external_id = social:<platform>:<mention id>` instead.

### `social_media_accounts`  ·  Prisma model `SocialMediaAccount`

**Why this table exists (relevance):** One row per connected social profile/page
(Facebook, Instagram, LinkedIn, X/Twitter, YouTube, TikTok, WhatsApp). It is the
anchor for all posts, mentions and campaign associations and holds the OAuth
credentials used to call each platform's API. **Tokens never leave the server** —
API responses replace them with `has_access_token` / `has_refresh_token`.
**When & how rows are written:** Inserted by `SocialMediaService.createAccount`
(validates `account_name`, `account_id`, `display_name`, `platform`,
`account_type`, `sync_frequency`). Updated by `updateAccount` (blank tokens keep
the existing ones), `refreshAccountToken` (manual rotation, or connector refresh
when the body is empty), `completeOAuth` (tokens from the OAuth callback),
`syncAccountMetrics` (follower/following/post counts). **`last_sync_at` is
stamped in exactly one place**: `runSyncCycle` sets it as the atomic claim
before syncing (the previous value is the mention window), and the manual
`syncAccount` sets it after a successful run. `connection_status` moves to
`expired` when a token cannot be refreshed and to `error` when a sync fails on a
platform call. `deleteAccount` is a soft delete: sets `is_active=false`,
`connection_status='disabled'`; `toggleAccount` flips both.
**What the data represents & notable columns:**

- `platform` (VarChar 50) — one of facebook | instagram | linkedin | twitter | youtube | tiktok | whatsapp (validated in
  service).
- `account_name` (@username/page), `account_id` (platform-specific ID), `display_name`, `profile_url`.
- `follower_count` / `following_count` / `post_count` — cached profile metrics refreshed by sync.
- `account_type` — personal | business | organization.
- `verification_status` — verified | unverified | pending (default 'pending').
- `connection_status` — active | expired | error | disabled (default 'active').
- `access_token` / `refresh_token` (Text, "encrypted OAuth token" per comment), `token_expires_at`.
- `sync_frequency` — hourly | daily | weekly (default 'daily') — **honoured by the sync cycle** (an account is
  synced only when `now - last_sync_at` reaches the interval); `auto_monitoring` (default true) — when false the
  mention pull is skipped; `last_sync_at`.
- `managed_by` (VarChar 20) — employee_id of the account manager; drives the default inbound-routing "social team" pool.
- Uniqueness: `@@unique([platform, account_id])`. Indexes on platform, managed_by, connection_status, tenant_id.

**Related to:** `tenant` (tenant_id); has-many `posts`, `mentions`, and
many-to-many `campaigns` (`SocialMediaCampaign`).

### `social_media_posts`  ·  Prisma model `SocialMediaPost`

**Why this table exists (relevance):** Content management for outbound posts —
drafts, scheduled, published, and promoted (paid) content — plus their cached
performance metrics.
**When & how rows are written:** Created by `SocialMediaService.createPost`
(requires an active `account_id`; `status` may be `draft` or `scheduled` only —
`scheduled` needs content and `scheduled_for`; `platform_post_id` defaults to
`draft_<random hex>`). Edited by `updatePost`; a `published`/`publishing` post
accepts only promotion fields. `publishPost` (the button, the `social-publish`
scheduler via `publishDue`, and the admin sweep) claims the row by flipping
`status` to `publishing` with a conditional `updateMany`, calls the connector,
then writes `platform_post_id`, `post_url`, `published_at`, `status='published'`;
on failure it sets `status='failed'` and notifies the author (the reason lives in
the notification, not on the row). `deletePost` removes a published post from the
platform first, then sets `status='deleted'`. `syncPostEngagement` refreshes
`engagement_metrics` for the 50 most recent published posts per account.
**What the data represents & notable columns:**

- `platform_post_id` (VarChar 255) — platform's own post ID; `@@unique([account_id, platform_post_id])`.
- `post_type` — post | story | reel | video | carousel | live.
- `content` (Text); `media_urls`, `hashtags`, `mentions`, `engagement_metrics`, `target_audience` are JSON.
- Paid-promotion fields: `is_promoted`, `promotion_budget` (Decimal 10,2), `reach`, `impressions`, `click_through_rate`
  (Decimal 5,4).
- `lead_generated` (Boolean) flags posts that produced leads (indexed).
- `status` — draft | scheduled | publishing (engine claim) | published | failed | deleted; `scheduled_for`
  (the publish sweep selects `status='scheduled' AND scheduled_for <= now`), `published_at`.
- `created_by` — employee_id.

**Related to:** `account` (`SocialMediaAccount`, onDelete Cascade); `tenant`.

### `social_media_mentions`  ·  Prisma model `SocialMediaMention`

**Why this table exists (relevance):** Brand-monitoring / social-listening
inbox. Each row is an inbound mention/comment/review/tag about the brand,
enriched with sentiment and routed to staff for response — the core of the
inbound-conversation workflow.
**When & how rows are written:** Created by `SocialMediaService.pullMentions`
(connector fetches mentions since the account's previous `last_sync_at`; one row
per mention). On the way in: mentions authored by the account itself are dropped;
a mention whose `post_url` already exists for the account is skipped; active
listening keywords are matched and written to `keywords_matched` (a keyword-only
match sets `mention_type='keyword'`); negative sentiment defaults
`requires_response=true` / `response_priority='high'`, and a high-priority keyword
hit raises the priority. Immediately after insert, `#assignInboundMentions` sets
`assigned_to` for mentions that require a response (routing rules, else the
least-loaded account manager) and the assignee is notified. `updateMention` sets
`assigned_to`/`response_priority`/`requires_response`; when `response_content` is
supplied the reply is **delivered through the connector first** (`post_url` is
the target id), then `response_sent=true`, `response_content`,
`response_sent_at=now()` are written. `convertMentionToLead` does not write here
(it creates a `crm_leads` row keyed by `external_id`). No hard delete.
**What the data represents & notable columns:**

- `account_id` nullable — null for organic mentions not tied to one of our accounts (onDelete SetNull).
- `mention_type` — mention | hashtag | keyword | tag | comment | review.
- `author_name` / `author_handle` / `author_profile` / `follower_count` / `is_verified_author` — who mentioned us.
- `sentiment` — positive | neutral | negative (indexed); `sentiment_score` (Decimal 3,2, −1.0…1.0); `influence_score`
  (1–100); `reach_estimate`.
- `keywords_matched` (JSON array of keyword strings, or null) — which listening keywords matched on ingest.
- `post_url` — the platform's canonical URL/id for the mention; used to dedupe re-pulled mentions and as the
  target for `sendReply`.
- `requires_response` (indexed), `response_priority` (low | medium | high | urgent, default 'medium'), `assigned_to`
  (employee_id, indexed).
- `response_sent`, `response_content`, `response_sent_at`.
- `mentioned_at` (when it happened, indexed) vs `processed_at` (when detected).

**Related to:** `account` (nullable), `tenant`. Routing target employee is
`assigned_to` (resolved by `SocialAssignmentService`, no FK).

### `social_media_engagements`  ·  Prisma model `SocialMediaEngagement`

**Why this table exists (relevance):** Granular record of individual interactions
(likes, comments, shares, etc.) on our accounts/posts, used to surface potential
leads from engaging users.
**When & how rows are written:** No create/update path exists in
`social-media.service.js` today (the service only reads/counts engagements, e.g.
in `listAccounts`/`getOverview` `_count`). Rows are intended to be written by
connector ingestion; **not currently populated by the reviewed service code** —
treat as connector/ingestion-owned.
**What the data represents & notable columns:**

- `account_id` / `post_id` both nullable (onDelete SetNull / Cascade respectively).
- `engagement_type` — like | comment | share | retweet | reply | save | click (indexed).
- `user_handle` / `user_name` / `user_profile` / `user_follower_count` — the engaging user.
- `content` (Text) — comment/reply text; `engagement_url`.
- `is_lead_potential` (Boolean, indexed), `lead_score` (Int), `engagement_value` (Decimal 5,2).
- `occurred_at` (indexed) vs `processed_at`.

**Related to:** `account`, `post` (`SocialMediaPost`), `tenant`.

### `social_media_campaigns`  ·  Prisma model `SocialMediaCampaign`

**Why this table exists (relevance):** Planning and results tracking for
multi-platform social campaigns (brand awareness, lead-gen, promotions), with
budgets, targeting, KPIs, and ROI.
**When & how rows are written:** Created by
`SocialMediaService.createCampaign` (requires name, objective, start_date,
end_date; enforces end > start; validates `campaign_type`, `status`, `platforms`;
defaults `target_audience={}`, `platforms=[]`, `status='planning'`). Edited by
`updateCampaign` (whitelisted incl. `roi`, `lead_conversion_rate`).
`performance_summary` is **written by the sync cycle**
(`refreshCampaignPerformance`): for each `active` campaign it sums
`engagement_metrics` of posts published inside `[start_date, end_date + 1 day)`
on accounts of the campaign's `platforms` →
`{ posts, likes, comments, shares, views, computed_at }`. `deleteCampaign`
soft-cancels by setting `status='cancelled'`.
**What the data represents & notable columns:**

- `campaign_type` — brand_awareness | lead_generation | promotion | engagement | traffic; `objective` free text.
- `target_audience` (JSON, required/non-null), `platforms` (JSON, required), plus JSON `content_themes`,
  `hashtag_strategy`, `posting_schedule`, `success_metrics`, `performance_summary`.
- Budgets: `budget_total` (Decimal 10,2), `budget_daily` (Decimal 8,2), `currency` (default USD).
- `start_date`/`end_date` (Date).
- `status` — planning | active | paused | completed | cancelled.
- Results: `roi` (Decimal 8,4), `lead_conversion_rate` (Decimal 5,2), `lessons_learned`.
- `created_by` (required), `manager_id` (campaign manager).

**Related to:** many-to-many `accounts` (`SocialMediaAccount`, join table
present but unused — posts are associated to a campaign by window + platform);
`tenant`.

### `social_media_leads`  ·  Prisma model `SocialMediaLead`

**Why this table exists (relevance):** Captures prospects discovered through
social activity (ad clicks, post engagement, mentions, DMs, profile visits) and
bridges them into the CRM lead pipeline.
**When & how rows are written:** No create/update path in the reviewed
`social-media.service.js` (it only reads via campaign `_count`). Rows are
ingestion/connector-owned; **not written by the reviewed service code.**
**What the data represents & notable columns:**

- `campaign_id` nullable (originating campaign, onDelete SetNull); `source_type` — post_engagement | ad_click | mention
  | message | profile_visit.
- Enriched profile fields: `user_handle`, `display_name`, `email`, `phone`, `company`, `job_title`, `location`,
  `bio_keywords` (JSON), `follower_count`, `verified_account`.
- Scoring/interest: `lead_score` (default 0), `interest_indicators` (JSON), `engagement_history` (JSON),
  `conversion_action`.
- UTM tracking: `utm_source`/`utm_medium`/`utm_campaign`/`utm_content`.
- `crm_lead_id` — `@unique`, one-to-one link to the created `crm_leads` row (onDelete SetNull).
- `status` — new | qualified | converted | rejected; `assigned_to` (sales rep), `qualification_notes`, `converted_at`,
  `discovered_at`.

**Related to:** `campaign` (`SocialMediaCampaign`), `crm_lead` (`CrmLead`,
unique), `tenant`.

### `social_listening_keywords`  ·  Prisma model `SocialListeningKeyword`

**Why this table exists (relevance):** Configuration of the terms the platform
watches for across channels — brand, competitor, industry, product, and hashtag
monitoring that drives mention capture and alerting.
**When & how rows are written:** CRUD via
`SocialMediaService.createKeyword` (requires `keyword`; validates type, match
type, priority and platforms; defaults `keyword_type='brand'`,
`match_type='contains'`, `platforms=[]`), `updateKeyword` (whitelisted fields),
and `deleteKeyword` (**hard delete**). **Read by `pullMentions`** on every
ingest: `SocialMediaService.matchKeywords` applies `match_type`,
`is_case_sensitive`, `is_active` and the `platforms` scope (empty = all).
`alert_threshold` is stored but not yet evaluated.
**What the data represents & notable columns:**

- `keyword` (VarChar 255); `keyword_type` — brand | competitor | industry | product | hashtag (indexed); `category`
  grouping (indexed).
- `match_type` — exact | contains | starts_with | ends_with (default 'contains').
- `platforms` (JSON, required) — channels to monitor.
- `is_case_sensitive`, `exclude_own_mentions` (default true — don't count our own posts), `alert_threshold` (min volume
  for alerts), `priority` (low | medium | high).
- `is_active` (indexed), `created_by` (required).

**Related to:** `tenant`.

### `competitor_social_activities`  ·  Prisma model `CompetitorSocialActivity`

**Why this table exists (relevance):** Log of observed competitor social moves
(posts, campaigns, engagement spikes, follower growth) with competitive impact
notes and response planning.
**When & how rows are written:** No create/update path in the reviewed
service code (`social-media.service.js` does not touch this model). Rows are
ingestion/monitoring-owned; **not written by the reviewed service code.**
**What the data represents & notable columns:**

- `competitor_name` (indexed), `platform` (indexed), `account_handle`.
- `activity_type` — post | campaign | engagement | follower_growth (indexed).
- `content_summary` (Text), `content_url`, `engagement_metrics` (JSON), `campaign_insights` (JSON).
- `competitive_impact` (VarChar 255), `response_needed` (Boolean, indexed), `response_plan` (Text).
- `detected_at` (when the activity occurred, indexed) vs `analyzed_at`.

**Related to:** `tenant` (no other FK — competitor is free-text, not a Partner/Account).

> **Related social table** (documented under *Assignment, Quotas, Import & Integrations*, cross-referenced here):
> `social_assignment_rules` (`SocialAssignmentRule`) holds the admin-configured
> inbound-routing rules (fixed | round_robin | rule_based | load_balanced,
> scoped per `platform`) that `SocialAssignmentService` evaluates to set a
> mention's `assigned_to`; its round-robin cursor is the inline `last_index`
> column.

---

## Partners & Channel

Channel-partner / reseller management. **Verification note:** these tables are
fully defined in the schema with `tenant_id` scoping, but **no dedicated service
or route currently writes them** — grepping `backend/src` for
`partner*.create/update/…` and for `partner` under `src/routes/` returns nothing.
So "how rows are written" below describes the schema-intended lifecycle; the
write paths are not yet wired into application code (schema-only / future
domain).

### `partners`  ·  Prisma model `Partner`

**Why this table exists (relevance):** Master record for each channel partner
(reseller, distributor, SI, consultant, OEM, referral) — the root of the
partner domain that contacts, opportunities, performance, certifications,
marketing, portal users, lead shares, and conflicts all hang off.
**When & how rows are written:** Intended via a partner-management admin flow
(create on onboarding, update through lifecycle). **No service/route writes it in
the current codebase.**
**What the data represents & notable columns:**

- `partner_code` — `@unique` (VarChar 20) human identifier; `company_name`, `legal_name`.
- `partner_type` — reseller | distributor | system_integrator | consultant | oem | referral (indexed).
- `partner_tier` — bronze | silver | gold | platinum | elite (indexed).
- `status` — prospect | onboarding | active | suspended | terminated (default 'prospect', indexed).
- Commercial terms: `commission_rate` (Decimal 5,4), `discount_level` (Decimal 5,2), `credit_limit`, `payment_terms`
  (net_30 | net_60 | prepaid).
- Capability flags: `portal_access`, `marketing_enabled`, `lead_sharing_enabled`.
- `geographic_coverage`, `certifications`, `specializations` are JSON.
- `performance_score` (Decimal 3,1, 0.0–10.0), `account_manager_id` (internal manager, indexed), `onboarding_status`,
  `created_by` (required).

**Related to:** `tenant`; has-many `contacts`, `opportunities`, `performance`,
`certifications_earned`, `marketing_activities`, `portal_users`,
`leads_received`, `conflicts`.

### `partner_contacts`  ·  Prisma model `PartnerContact`

**Why this table exists (relevance):** People within a partner org and their
roles, so the vendor knows who to work with (primary, technical, sales, exec).
**When & how rows are written:** Intended via partner-management UI. **No
service/route write in current codebase.**
**What the data represents & notable columns:**

- `partner_id` FK; `first_name`/`last_name`/`email` (email required), `phone`, `mobile`, `job_title`, `department`.
- `role_type` — primary | technical | sales | marketing | executive.
- `is_primary` (indexed), `decision_maker`, `portal_access` flags.
- `communication_preferences`, `specializations` are JSON; `last_contacted`.
- Uniqueness: `@@unique([partner_id, email])`.

**Related to:** `partner` (onDelete Cascade); has-many `certifications`; optional
one-to-one `portal_user`; `tenant`.

### `partner_opportunities`  ·  Prisma model `PartnerOpportunity`

**Why this table exists (relevance):** Deal-registration / co-sell records
linking a partner to a specific customer deal, optionally bridged to a CRM
opportunity.
**When & how rows are written:** Intended on partner deal registration. **No
service/route write in current codebase.**
**What the data represents & notable columns:**

- `partner_id` FK; `opportunity_id` — `@unique`, optional link to `crm_opportunities` (onDelete SetNull);
  `deal_registration_id` — `@unique` partner's registration number.
- `customer_name`, `customer_contact`, `estimated_value` (Decimal 18,2), `currency`.
- `partner_role` — lead | reseller | influencer | referral; `collaboration_type` — joint | partner_led | vendor_led |
  referral_only.
- `revenue_split` (JSON), `stage`, `probability`, `status` — active | won | lost | stalled (default 'active').
- Retrospective: `win_reason`, `loss_reason`, `lessons_learned`; `registered_by`, `approved_by`, `registered_at`,
  `closed_at`.

**Related to:** `partner` (Cascade), `opportunity` (`CrmOpportunity`, unique),
`tenant`.

### `partner_performances`  ·  Prisma model `PartnerPerformance`

**Why this table exists (relevance):** Periodic (month/quarter/year) performance
scorecard per partner — deals, revenue, commissions, satisfaction, ranking.
**When & how rows are written:** Intended to be computed/recorded per period
(`calculated_at` stamp). **No service/route write in current codebase.**
**What the data represents & notable columns:**

- `partner_id` FK; `period_start`/`period_end` (Date), `period_type` — month | quarter | year.
- Deal counts: `deals_registered`/`deals_won`/`deals_lost`; revenue: `revenue_generated`, `revenue_influenced`,
  `commission_earned` (Decimal 18,2).
- Activity: `certification_count`, `training_hours`, `marketing_activities`, `lead_referrals_sent`/`_converted`.
- Ratings: `customer_satisfaction`, `partner_satisfaction` (Decimal 3,2), `activity_score` (Decimal 5,2).
- `engagement_level` (high | medium | low | inactive), `performance_trend` (improving | stable | declining, indexed),
  `ranking` (indexed), `goal_attainment` (Decimal 5,2), `key_achievements`/`improvement_areas` (JSON).
- Uniqueness: `@@unique([partner_id, period_type, period_start, period_end])`.

**Related to:** `partner` (Cascade), `tenant`.

### `partner_certifications`  ·  Prisma model `PartnerCertification`

**Why this table exists (relevance):** Tracks certifications/training earned by a
partner (or a specific partner contact), including expiry and renewal.
**When & how rows are written:** Intended on certification award/verification.
**No service/route write in current codebase.**
**What the data represents & notable columns:**

- `partner_id` FK; `contact_id` optional (specific person certified, onDelete SetNull).
- `certification_name`; `certification_type` — product | technical | sales | marketing | support (indexed);
  `certification_level` — basic | intermediate | advanced | expert.
- `issuing_body`, `badge_url`, `earned_date` (Date), `expiry_date` (Date, indexed), `renewal_required` (default true).
- `credits_earned`, `score_achieved` (Decimal 5,2), `training_hours`.
- `status` — active | expired | revoked (indexed); `verified_by`.

**Related to:** `partner` (Cascade, relation "PartnerCertified"), `contact`
(`PartnerContact`, relation "ContactCertified"), `tenant`.

### `partner_marketing_activities`  ·  Prisma model `PartnerMarketingActivity`

**Why this table exists (relevance):** Co-op / co-marketing activities run with a
partner (events, webinars, campaigns, tradeshows), with split budgets and
approval workflow.
**When & how rows are written:** Intended via partner marketing admin. **No
service/route write in current codebase.**
**What the data represents & notable columns:**

- `partner_id` FK; `activity_name`; `activity_type` — event | webinar | campaign | content | advertising | tradeshow
  (indexed).
- `geographic_scope` (JSON), `start_date`/`end_date` (Date).
- Split budgets: `budget_total`, `budget_partner_share`, `budget_our_share` (Decimal 10,2), `currency`.
- Goals vs actuals: `expected_leads`/`actual_leads`, `expected_revenue`/`actual_revenue` (Decimal 18,2);
  `success_metrics` (JSON).
- Ratings: `partner_satisfaction`, `our_satisfaction` (Decimal 3,2).
- `status` — planned | active | completed | cancelled; `approval_status` — pending | approved | rejected; `approved_by`,
  `managed_by`, `created_by` (required).

**Related to:** `partner` (Cascade), `tenant`.

### `partner_portal_users`  ·  Prisma model `PartnerPortalUser`

**Why this table exists (relevance):** Login accounts for partner staff to access
the partner portal — a separate credential store from internal `employees`.
**When & how rows are written:** Intended on portal provisioning/approval. **No
service/route write in current codebase.**
**What the data represents & notable columns:**

- `partner_id` FK; `contact_id` — `@unique` optional link to a `partner_contacts` row.
- `username`, `email` both `@unique`; `password_hash` (VarChar 255); `first_name`/`last_name`.
- `role` — admin | user | viewer | manager; `permissions` (JSON).
- Approval/lockout: `is_approved` (indexed), `approved_by`/`approved_at`, `is_locked`, `failed_attempts`,
  `must_change_password` (default true), `last_login_at`, `login_count`.
- `portal_preferences`, `notification_settings` (JSON).

**Related to:** `partner` (Cascade), `contact` (`PartnerContact`, unique,
SetNull), `tenant`.

### `partner_lead_shares`  ·  Prisma model `PartnerLeadShare`

**Why this table exists (relevance):** Records the sharing/referral of an internal
lead to a partner, including exclusivity, acceptance, revenue split, and outcome.
**When & how rows are written:** Intended on lead-sharing action. **No
service/route write in current codebase.**
**What the data represents & notable columns:**

- `partner_id` FK; `lead_id` (Int, internal lead ID — plain column, no declared FK); `share_type` — referral |
  collaboration | assignment (indexed).
- `partner_role` — primary | support | referral; `exclusivity` — none | temporary | permanent (default 'none'),
  `exclusivity_expires` (Date, indexed).
- `revenue_split` (JSON), `deal_size_estimate` (Decimal 18,2), `requirements`, `acceptance_deadline`.
- `acceptance_status` — pending | accepted | declined | expired (indexed); `acceptance_reason`.
- Outcome: `outcome` — won | lost | transferred | cancelled; `outcome_revenue`, `commission_paid` (Decimal 18,2),
  `feedback_score` (Decimal 3,2), `feedback_notes`; `shared_by` (required).

**Related to:** `partner` (Cascade), `tenant`. `lead_id` references an internal
lead by value only.

### `channel_conflicts`  ·  Prisma model `ChannelConflict`

**Why this table exists (relevance):** Tracks and resolves channel conflicts
(pricing, territory, customer, deal-registration disputes) between partners,
with escalation and SLA.
**When & how rows are written:** Intended on conflict report and through
resolution workflow. **No service/route write in current codebase.**
**What the data represents & notable columns:**

- `conflict_type` — pricing | territory | customer | deal_registration (indexed); `priority` — low | medium | high |
  critical (indexed).
- `status` — reported | investigating | escalated | resolved | closed (default 'reported', indexed).
- `primary_partner_id` / `secondary_partner_id` (both nullable); `customer_name`, `deal_value` (Decimal 18,2),
  `territory_disputed`.
- `reported_by` / `assigned_to` (required employee_ids, assigned_to indexed); `description` (required Text).
- Resolution: `resolution_strategy`, `resolution_details`, `escalation_level` (1–5, default 1), `escalation_reason`,
  `sla_due_date` (indexed), `customer_impact`, `prevention_measures`, `lessons_learned`, `resolved_at`.

**Related to:** `primary_partner` (`Partner`, relation "ConflictPartner",
SetNull) — note only the primary side has a declared relation; `secondary_partner_id`
is a plain column. `tenant`.

---

## Multi-Tenant Platform & Administration

Super-administrator layer: tenant provisioning, plans, feature flags, usage
metering, platform audit, security, and cross-tenant operations. Services live in
`backend/src/services/platform/`. **Note:** several tables here are
platform-global and deliberately have **no `tenant_id`** — they either describe or
act across all tenants.

### `tenants`  ·  Prisma model `Tenant`

**Why this table exists (relevance):** THE root of multi-tenancy. Each row is one
customer organization in the SaaS platform; virtually every operational table
carries `tenant_id → tenants.id` (declared as reverse relations on this model —
see the large block of `@relation("Tenant…")` lists) so all data is partitioned
per tenant.
**When & how rows are written:** `TenantService.create` (`tenant.service.js`):
validates unique `slug`, copies limits (`max_users`, `max_storage_mb`,
`max_api_calls`) from the chosen `SubscriptionPlan`, and for paid plans sets
`trial_ends_at`/`status='trial'`. Lifecycle updates: `update`, `suspend`
(status='suspended' + `suspended_at`/`suspended_reason`), `reactivate`,
`softDelete` (status='deleted' + `deleted_at`, 30-day recovery), `restore`
(enforces 30-day window), `changePlan` (re-applies plan limits). No hard delete.
**What the data represents & notable columns:**

- `slug` — `@unique` URL key; `domain` — `@unique` optional custom domain.
- `industry` — technology | healthcare | finance | retail | manufacturing | education | real_estate | media |
  hospitality | professional_services | other (indexed).
- `plan` — free | starter | professional | enterprise (indexed); `status` — active | suspended | trial | cancelled |
  deleted (indexed).
- Trial/lifecycle: `trial_ends_at`, `suspended_at`/`suspended_reason`, `deleted_at` (soft-delete, 30-day recovery).
- Quotas: `max_users` (5), `max_storage_mb` (500), `max_api_calls` (10000/month).
- Branding: `logo_url`, `primary_color`, `timezone` (UTC), `locale` (en); billing: `billing_email`, `billing_address`
  (JSON), `metadata` (JSON).

**Related to:** Has-many `configs`, `usage_records`, `feature_overrides`, plus the
full set of tenant-scoped reverse relations across the whole schema. **This is the
FK target for `tenant_id` on almost every other table.**

### `tenant_configs`  ·  Prisma model `TenantConfig`

**Why this table exists (relevance):** Flexible key/value settings per tenant that
don't warrant dedicated columns on `tenants`.
**When & how rows are written:** `TenantService.setConfig` uses
`tenantConfig.upsert` keyed by `(tenant_id, config_key)`; `deleteConfig` uses
`deleteMany`. Read via `getConfig`.
**What the data represents & notable columns:**

- `config_key` (VarChar 100), `config_value` (Text, nullable), `updated_by`.
- Uniqueness: `@@unique([tenant_id, config_key])`.

**Related to:** `tenant` (tenant_id, onDelete Cascade). (Scoped by explicit
tenant_id column, not the named-relation pattern.)

### `tenant_usage`  ·  Prisma model `TenantUsage`

**Why this table exists (relevance):** Usage-metering rollups per tenant per
period — the basis for quota enforcement and billing/analytics.
**When & how rows are written:** `TenantService.recordUsage` /
`incrementUsage` use `tenantUsage.upsert` keyed by
`(tenant_id, metric, period, period_type)`.
**What the data represents & notable columns:**

- `metric` — api_calls | storage_mb | active_users | records | emails_sent (indexed).
- `value` (Decimal 18,2); `period` — e.g. 2026-04 | 2026-Q1 | 2026 (indexed); `period_type` — daily | monthly |
  quarterly | annual.
- Uniqueness: `@@unique([tenant_id, metric, period, period_type])`.

**Related to:** `tenant` (Cascade).

### `subscription_plans`  ·  Prisma model `SubscriptionPlan`

**Why this table exists (relevance):** Catalog of purchasable plans and their
limits/features; provisioning and plan changes copy these limits onto the tenant.
**Platform-global — no `tenant_id`.**
**When & how rows are written:** `SubscriptionService` — `create` (unique
`name`), `update`, `delete` (blocked if any tenant is on the plan, via
`tenant.count`). Read by `TenantService.create`/`changePlan`.
**What the data represents & notable columns:**

- `name` — `@unique`, free | starter | professional | enterprise; `label`, `description`.
- Pricing: `price_monthly`/`price_annual` (Decimal 10,2), `currency`.
- Limits: `max_users`, `max_storage_mb`, `max_api_calls`, `max_records`, `max_workflows`, `max_dashboards`.
- `features` (JSON array, e.g. ["email_templates","workflow_automation","api_access"]), `limits` (JSON), `trial_days`
  (14), `order_index`, `is_active` (indexed).

**Related to:** No FK relations; tenants reference it by matching `Tenant.plan`
to `SubscriptionPlan.name` (by value, not FK).

### `feature_flags`  ·  Prisma model `FeatureFlag`

**Why this table exists (relevance):** Global feature toggles for progressive
rollout of platform capabilities. **Platform-global — no `tenant_id`.**
**When & how rows are written:** `FeatureFlagService` — `create` (unique `name`),
`update`, toggle/rollout updates, `delete`.
**What the data represents & notable columns:**

- `name` — `@unique` (e.g. "ai_lead_scoring"); `label`, `description`.
- `category` — general | beta | experimental | premium (indexed).
- `is_enabled` (global default, indexed), `rollout_percent` (0–100 gradual rollout), `config` (JSON).

**Related to:** Has-many `tenant_overrides` (`TenantFeatureOverride`).

### `tenant_feature_overrides`  ·  Prisma model `TenantFeatureOverride`

**Why this table exists (relevance):** Per-tenant override of a global feature
flag — enable/disable a flag for one tenant regardless of the global default.
**When & how rows are written:** `FeatureFlagService.setOverride` uses
`tenantFeatureOverride.upsert` keyed by `(tenant_id, flag_id)`; removal via
`deleteMany`.
**What the data represents & notable columns:**

- `tenant_id` + `flag_id`; `is_enabled` (required, no default — explicit override); `config` (JSON, tenant-specific).
- Uniqueness: `@@unique([tenant_id, flag_id])`.

**Related to:** `tenant` (Cascade) and `flag` (`FeatureFlag`, Cascade).

### `platform_audit_logs`  ·  Prisma model `PlatformAuditLog`

**Why this table exists (relevance):** Immutable record of super-admin actions
across the platform (tenant create/suspend, impersonation, flag toggles, plan
updates). **Platform-global — no `tenant_id`.**
**When & how rows are written:** `PlatformAuditService.log` inserts one row per
admin action (`platformAuditLog.create`); the service otherwise only reads/groups.
**What the data represents & notable columns:**

- `admin_id` (platform admin employee_id, indexed); `action` — e.g. tenant.create | tenant.suspend | user.impersonate |
  flag.toggle | plan.update (indexed).
- `target_type` — tenant | user | feature_flag | plan | announcement | security; `target_id` (indexed together);
  `details` (JSON payload).
- `ip_address` (VarChar 45), `user_agent` (Text), `created_at` (indexed).

**Related to:** No FK relations (references entities by type+id string for
durability).

### `system_announcements`  ·  Prisma model `SystemAnnouncement`

**Why this table exists (relevance):** Platform-wide announcements/banners pushed
to tenants or admins (maintenance notices, alerts). **Platform-global — no
`tenant_id`** (targeting is by `target`/`target_ids`).
**When & how rows are written:** `AnnouncementService` — `create`, `update`,
`delete` (hard delete), plus activate/deactivate toggles (`systemAnnouncement.update`).
**What the data represents & notable columns:**

- `title`, `message` (Text); `severity` — info | warning | critical | maintenance; `type` — banner | modal | toast |
  page.
- `target` — all | admins | specific_tenants; `target_ids` (JSON tenant IDs when target=specific_tenants).
- `action_url`/`action_label`; `is_active` (indexed), `is_dismissible`; scheduling `active_from`/`active_to` (indexed).

**Related to:** No FK relations; targets tenants by ID list in `target_ids`.

### `impersonation_logs`  ·  Prisma model `ImpersonationLog`

**Why this table exists (relevance):** Audit trail of every "login as" (support
impersonation) session for compliance. **Platform-global — no `tenant_id`**
(records the target tenant via `target_tenant_id`).
**When & how rows are written:** `SecurityService` — `impersonationLog.create`
starts a session; an update path ends it (writes `ended_at`/`actions_taken`).
**What the data represents & notable columns:**

- `admin_id` (initiating admin, indexed), `target_user_id` (impersonated user, indexed), `target_tenant_id` (nullable).
- `reason` (Text), `started_at` (indexed)/`ended_at`, `actions_taken` (JSON summary), `ip_address`.

**Related to:** No FK relations (IDs stored by value).

### `api_rate_limits`  ·  Prisma model `ApiRateLimit`

**Why this table exists (relevance):** Configurable API throttling, either global,
per-plan, or per-tenant/per-endpoint.
**When & how rows are written:** `SecurityService` — create/update
(`apiRateLimit.update` when exists else `.create`) and `delete`.
**What the data represents & notable columns:**

- `plan_name` (NULL = global default, indexed); `tenant_id` (NULL = plan-level default — **a plain nullable column, not
  the tenant relation**, indexed); `endpoint_pattern` (e.g. "/api/runtime/*" or NULL for all).
- Limits: `requests_per_minute` (60), `requests_per_hour` (1000), `requests_per_day` (10000), `burst_limit` (100);
  `is_active`.

**Related to:** No declared `tenant` relation — `tenant_id` here is an optional
scoping value, not an enforced FK.

### `security_policies`  ·  Prisma model `SecurityPolicy`

**Why this table exists (relevance):** Password/MFA/session/IP security policy,
either global (NULL tenant) or per-tenant override.
**When & how rows are written:** `SecurityService` — `securityPolicy.findFirst`
then update-if-exists else create (upsert-by-hand); read via `getPolicy`/list.
**What the data represents & notable columns:**

- `tenant_id` (NULL = global default — plain nullable column, indexed).
- MFA/password: `require_mfa`, `password_min_length` (8), `password_require_upper`/`_number` (true), `_special` (false),
  `password_expiry_days` (0 = never), `force_password_reset`.
- Lockout/session: `max_login_attempts` (5), `lockout_duration_min` (30), `session_timeout_min` (480 = 8h).
- Access: `ip_allowlist`/`ip_blocklist` (JSON CIDR), `allowed_domains` (JSON email-domain restriction).

**Related to:** No declared `tenant` relation — `tenant_id` is an optional scoping
value.

### `data_export_requests`  ·  Prisma model `DataExportRequest`

**Why this table exists (relevance):** Tracks backup / GDPR export / GDPR delete
requests through their lifecycle, including the generated file.
**When & how rows are written:** `SecurityService` — `dataExportRequest.create`
on request; status/result updates via `.update`; listing via findMany.
**What the data represents & notable columns:**

- `tenant_id` (nullable plain column); `requested_by` (required employee_id, indexed).
- `export_type` — full_backup | partial | gdpr_export | gdpr_delete; `scope` (JSON: { tables, date_range }).
- `status` — pending | processing | completed | failed | expired (indexed).
- `file_path`, `file_size` (BigInt), `error` (Text), `expires_at`, `completed_at`.

**Related to:** No declared `tenant` relation — `tenant_id` is an optional
scoping value.

### `push_notification_logs`  ·  Prisma model `PushNotificationLog`

**Why this table exists (relevance):** History of admin-sent manual/broadcast
notifications (who was targeted, how many recipients). **This one IS tenant-scoped**
(non-null `tenant_id` with the `Tenant` relation).
**When & how rows are written:** Written in `backend/src/routes/builder/index.js`
(the admin push endpoint): after `notifSvc.broadcastNotification(...)` fans out
in-app notifications, `pushNotificationLog.create` records the send. Insert-only
(no update/delete path).
**What the data represents & notable columns:**

- `title` (VarChar 200), `body` (Text), `link`.
- `target_type` — all | role | employee; `target_value` (JSON — role names or employee IDs).
- `recipient_count` (default 0, count of employees notified), `sent_by` (admin employee_id, indexed).

**Related to:** `tenant` (tenant_id, named relation "TenantPushNotificationLog").

Source of truth: `backend/prisma/schema.prisma`. Column types cross-checked against
`docs/developer-guide/DATABASE_SCHEMA.md`. Write behavior verified against
`backend/src/services/sla.service.js` and the routes in `backend/src/routes/sla/index.js`.

## SLA Engine

> The SLA tables carry `tenant_id` (INT, FK → `tenants.id`) and are tenant-scoped, but the reconciler runs cross-tenant:
> `SlaService.reconcile()` (invoked every 60s from `app.js`) loads active policies grouped by tenant, then processes
> each record inside `tenantContext.run({ tenantId })`. Timers only tick inside business hours (offset-based, DST-free
> calendar math). Config tables (business hours, policies, targets, escalations) are managed by CRUD routes in
> `routes/sla/index.js`; `SlaInstance` rows are owned entirely by the reconciler.

### `sla_business_hours`  ·  Prisma model `SlaBusinessHours`

**Why this table exists (relevance):** A working-hours calendar; SLA clocks only advance inside these windows. Timezone
is a fixed UTC offset (minutes) to stay DST-free and dependency-free.
**When & how rows are written:** Created/updated via `POST`/`PUT` routes in `routes/sla/index.js`. Setting `is_default`
first clears the flag on all others (`updateMany`). A default Mon–Fri 9–5 UTC calendar is auto-seeded on first access if
none exists.
**What the data represents & notable columns:**

- `name`, `timezone_label` default `"UTC"` (display only), `utc_offset_minutes` default 0 (e.g. 330 = IST +05:30).
- `weekly` (JSON, NOT NULL) — `{ "mon": [["09:00","17:00"]], ... }`; an omitted/empty day = non-working.
- `holidays` (JSON) — `["2026-12-25", ...]` full non-working local-calendar days.
- `is_default`, `is_active`.

**Related to:** Referenced by `SlaPolicy.business_hours_id`.

### `sla_policies`  ·  Prisma model `SlaPolicy`

**Why this table exists (relevance):** A configurable SLA definition scoped to an entity type; the first matching active
policy (by `order_index`) for a record wins. `conditions` is an AND-list evaluated against the record.
**When & how rows are written:** Created by `createPolicy()` in `routes/sla/index.js` (then `writeChildren` inserts its
targets/escalations); updated/deleted via the SLA config routes. Read every tick by the reconciler with `targets`,
`escalations`, and `business_hours` included.
**What the data represents & notable columns:**

- `name`, `description`, `entity_type` — `case | lead | task | record`.
- `object_id`, `config` (JSON) — for `record` policies only: the object timed and its stage mapping
  (`first_response_stages`, `closed_stages`, `canceled_stages`, `dimension_field`).
- `is_active`, `order_index` default 0 (indexed together as `[tenant_id, entity_type, is_active, order_index]`).
- `conditions` (JSON) — `[{ field, op, value }]` AND-matched (ops: `equals | not_equals | in | contains | gt | lt`).
- `pause_statuses` (JSON) — record statuses that PAUSE the clock (e.g. `["on_hold"]`).
- `business_hours_id` (nullable).

**Related to:** `business_hours_id` FK → `SlaBusinessHours` (`SetNull`); parent of `SlaTarget`, `SlaEscalation`,
`SlaInstance`.

### `sla_targets`  ·  Prisma model `SlaTarget`

**Why this table exists (relevance):** The target minutes for a metric at a given priority dimension. The dimension is
priority for cases, rating for leads, priority for tasks; `priority = "*"` is the any/default fallback.
**When & how rows are written:** Bulk-inserted by `writeChildren()` (`slaTarget.createMany`) when a policy is
created/edited. Read by the reconciler; `pickTarget()` prefers an exact dimension match, else the `"*"` row.
**What the data represents & notable columns:**

- `metric` — `first_response | resolution`.
- `priority` default `"*"` (the dimension value).
- `target_minutes` (NOT NULL) — SLA budget in working minutes.
- `warning_pct` default 80 — % of target elapsed → "at risk".
- `@@unique([policy_id, metric, priority])`.

**Related to:** `policy_id` FK → `SlaPolicy` (Cascade).

### `sla_escalations`  ·  Prisma model `SlaEscalation`

**Why this table exists (relevance):** An automated action fired when a metric crosses its warning or breach threshold.
**When & how rows are written:** Bulk-inserted by `writeChildren()` (`slaEscalation.createMany`) with a policy. Fired by
`SlaService.#runEscalations()` when a running instance warns or breaches — filtered to matching `metric`/`trigger` and
run in `order_index` order.
**What the data represents & notable columns:**

- `metric` — `first_response | resolution | *` (any).
- `trigger` — `warning | breach`.
- `action` — `notify_owner | notify_manager | raise_priority | create_task`. (`notify_*` write a `Notification`;
  `raise_priority` bumps the record's priority up the ladder, skipped for leads; `create_task` inserts a high-priority
  follow-up `Task`.)
- `config` (JSON) — action-specific, e.g. `{ "role": "manager" }` or `{ "levels": 1 }`; `order_index` default 0.

**Related to:** `policy_id` FK → `SlaPolicy` (Cascade).

### `sla_instances`  ·  Prisma model `SlaInstance`

**Why this table exists (relevance):** A live SLA timer for one (record, metric) pair — the running/paused/met/breached
state, business-hours-aware due date, and warning threshold. This is the operational heart of the engine and the source
for the SLA dashboard.
**When & how rows are written:** Created and updated exclusively by the 60s reconciler (`#createInstance` /
`#updateInstance`). On creation, `due_at`/`warning_at` are computed via `addBusinessMinutes` (or from a task's explicit
`due_date` for resolution); flags are backfilled to reality but escalations are NOT fired on creation. On update it
handles pause/resume (extending `due_at`/`warning_at` by paused business-minutes), marks `met`/`canceled`, and on
threshold crossings sets `warned`/`breached` and fires escalations. Removing the matching policy/target cancels the
instance. Open timers are also canceled when the record is deleted (soft or hard) or merged away
(`SlaService.cancelForRecords` on `record.deleted`), and by the reconciler when the record is in the Trash or gone;
restoring the record does not restart them.
**What the data represents & notable columns:**

- `entity_type` (`case | lead | task`) + `entity_id` + `metric` — `@@unique([entity_type, entity_id, metric])`.
- `priority` — the dimension value captured at creation; `owner_id` — record owner/assignee at last sync (indexed).
- `target_minutes`; `started_at` (record creation = clock start), `due_at` (business-hours deadline), `warning_at`
  (at-risk threshold), `paused_at`.
- `status` default `"running"` — `running | paused | met | breached | canceled`.
- Flags `warned`, `breached`; `completed_at` (when met), `breached_at`.
- Indexed on `[tenant_id, status]`, `[status, due_at]`, `owner_id`, `policy_id`.

**Related to:** `policy_id` FK → `SlaPolicy` (Cascade); `entity_id` is a soft reference into `crm_cases` / `crm_leads` /
`tasks` by `entity_type` (no DB-level FK).

---

## Access Segmentation & Audit Chain

Added October 2026 (migration `20261013180000_platform_builder_extensions`) for multi-entity tenants. Enforced by
[`access-scope.service.js`](../../backend/src/services/access-scope.service.js); administered at `/api/access` and
**Tools ▸ Access & Barriers**. Records carry `business_unit_id` and `barrier_zone_id`, stamped on every create/update
from the object's `config`.

### `business_units`  ·  Prisma model `BusinessUnit`

**Why this table exists (relevance):** A tenant may be a group of legal entities (Genesis: lending, wealth, funds,
securities, advisory, FX). A record tagged with a unit is visible only to that unit's members.
**When & how rows are written:** `SegmentationService` (`/api/access/business-units`, admin) or a vertical pack install.
**What the data represents & notable columns:** `code` (unique per tenant; what formulas and object config refer to),
`legal_name`, `regulator`, `licence`, `base_currency`.
**Related to:** members in `employee_business_units`; `records.business_unit_id` (SetNull).

### `employee_business_units`  ·  Prisma model `EmployeeBusinessUnit`

**Why this table exists (relevance):** Which units an employee works in. An employee with **no** rows is unrestricted
by unit (group functions); admins are always unrestricted by unit.
**When & how rows are written:** `SegmentationService.setUnitMembers` (replace-all), audited to the chain.
**What the data represents & notable columns:** `is_primary` marks the home unit.

### `barrier_zones`  ·  Prisma model `BarrierZone`

**Why this table exists (relevance):** Information barriers (Chinese walls). A record in a zone is visible only to zone
members and to roles holding the `barrier_override` operational permission — **administrators included**.
**When & how rows are written:** `/api/access/barrier-zones` (compliance) or a vertical pack.

### `barrier_members`  ·  Prisma model `BarrierMember`

**Why this table exists (relevance):** Who is inside a wall. `source = member` is standing; `source = wall_crossing` was
created by an approved wall-crossing and ends at `valid_to`.
**When & how rows are written:** add/remove member routes, and `decideCrossing` on approval (never shortening a standing
membership). Every change is chained.

### `wall_crossings`  ·  Prisma model `WallCrossing`

**Why this table exists (relevance):** The request-and-approve record for bringing someone over a wall temporarily — the
evidence a regulator asks for.
**When & how rows are written:** `requestCrossing` (anyone) then `decideCrossing` (compliance; never the requester).

### `audit_chain_events`  ·  Prisma model `AuditChainEvent`

**Why this table exists (relevance):** Tamper evidence. Each event's `hash` covers its canonical content and the previous
event's hash, so any edit, insert or delete breaks `GET /api/access/audit-chain/verify` from that point.
**When & how rows are written:** `AuditChainService.append` (serialised per tenant) for permission changes, unit and
barrier membership, wall-crossings, public-form publishing, PII reveals, record merges and views of objects with
`config.audit_views`. Never updated or deleted.

## Sessions & Background Jobs

### `auth_refresh_tokens`  ·  Prisma model `AuthRefreshToken`

**Why this table exists (relevance):** Staff sessions outlive the short access token through refresh tokens, and a
stolen refresh token must be detectable and revocable (PRD E-01).
**When & how rows are written:** `AuthService.issueSession` on sign-in; `refresh` retires the presented token
(`revoked_at`, `replaced_by`) and inserts its successor in the same `family`; presenting a retired token revokes the
family. `logout` / `revokeAll` set `revoked_at`.
**What the data represents & notable columns:** `token_hash` (SHA-256; the token is never stored), `family`,
`expires_at`, `revoked_at`, `user_agent`, `ip`. Global model (outside the tenant extension); `tenant_id` is informational.

### `job_queue`  ·  Prisma model `JobQueue`

**Why this table exists (relevance):** Outbound work that must survive failures and restarts (PRD E-03): integration
and SMS calls a workflow could not complete are retried from here instead of being lost.
**When & how rows are written:** `JobQueue.enqueue` (the workflow engine, on a retryable failure); `JobQueue.work`
claims due rows atomically (`queued` → `running`), then marks them `done`, re-queues them with back-off, or parks
them as `dead` after `max_attempts`. Administrators can re-queue a dead job (`JobQueue.retry`).
**What the data represents & notable columns:** `type`, `payload`, `status`, `attempts`, `run_after`, `locked_at`
(lease), `last_error`, `dedupe_key`, `tenant_id` (the job runs inside it).
