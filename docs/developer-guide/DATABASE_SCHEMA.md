# Database Schema Reference

> ⚠️ **July 2026 — 65 tables removed.** Nine never-implemented domains were dropped
> from the schema (migration `20260708120000_drop_orphaned_domains`): **Email
> Campaigns**, **Calendar/Meetings**, **Analytics/KPI** (duplicate of `ui_dashboards`),
> **Contracts**, **Deal Stages**, **Territories**, **Sales Teams**, **Customer
> Portal/Knowledge**, **Partner/Channel**, plus `call_logs` and three unused
> social-media tables. Any section below describing those tables is retained for
> historical reference only and no longer reflects the live database — treat the
> Prisma schema/migrations as the source of truth. See
> [ROADMAP](../project/ROADMAP.md#deferred-domains-schema-removed-july-2026--to-be-built-when-prioritised).

> **Source of truth:** Prisma SQL migration files in [`backend/prisma/migrations/`](../../backend/prisma/migrations/)
> **Database engine:** MySQL
> **Generated from:** `init`, `insurance_ams_p0_p4`, `carrier_adapter_config`, `add_missing_application_columns`, `add_module_category`, `add_status_events`, `add_pipeline_config`, `add_social_assignment_rules`

This document describes every table in the database — what business information it stores, its columns/types, and how it relates to other tables. The platform is a **multi-tenant CRM + Insurance Agency Management System (AMS)**; almost every table carries a `tenant_id` for tenant isolation.

## Conventions

- **PK** = primary key, **FK** = foreign key. Most surrogate keys are `INTEGER AUTO_INCREMENT`; `employees` and most user-reference columns use `VARCHAR(20)` employee IDs.
- `tenant_id` (INTEGER) appears on nearly every table and scopes rows to a tenant; it generally references `tenants(id)`.
- `created_at` / `updated_at` are `DATETIME(3)`; `created_at` defaults to `CURRENT_TIMESTAMP(3)`.
- "Notes" call out nullability, defaults, uniqueness, enum-like value sets, and what a column represents.

## Domain Index

1. [Organization & Identity](#organization--identity)
2. [UI Metadata & Low-Code Engine](#ui-metadata--low-code-engine)
3. [Generic Records & Activity Engine](#generic-records--activity-engine)
4. [Assignment, Quotas & Integrations](#assignment-quotas--integrations)
5. [CRM Core](#crm-core)
6. [Products & Quoting](#products--quoting)
7. [Email, Campaigns & Lead Scoring](#email-campaigns--lead-scoring)
8. [Calendar, Meetings & Calls](#calendar-meetings--calls)
9. [Reporting & Analytics](#reporting--analytics)
10. [Contracts & CLM](#contracts--clm)
11. [Deals, Territories & Sales Teams](#deals-territories--sales-teams)
12. [Customer Portal & Service](#customer-portal--service)
13. [Social Media](#social-media)
14. [Partners & Channel](#partners--channel)
15. [Multi-Tenant Platform & Administration](#multi-tenant-platform--administration)
16. [Insurance Core (Carriers, Policies, Underwriting, Claims)](#insurance-core-carriers-policies-underwriting-claims)
17. [Insurance AMS (Compliance, Billing, Payments, Commissions)](#insurance-ams-compliance-billing-payments-commissions)
18. [Status & Workflow Tracking](#status--workflow-tracking)

---

## Organization & Identity

### `regions`
Geographic regions for organizational structure and record assignment.

| Column | Type | Notes |
|---|---|---|
| region_id | INTEGER | PK, auto-increment |
| region_name | VARCHAR(100) | NOT NULL |
| region_code | VARCHAR(10) | NOT NULL, UNIQUE |
| is_active | BOOLEAN | NOT NULL, default true |
| created_at | DATETIME(3) | NOT NULL, default CURRENT_TIMESTAMP(3) |
| tenant_id | INTEGER | NOT NULL, indexed |

**Relationships:** Referenced by `branches` and `employees` via `region_id`.

### `branches`
Organizational branches within regions, storing location-specific information.

| Column | Type | Notes |
|---|---|---|
| branch_id | INTEGER | PK, auto-increment |
| branch_name | VARCHAR(100) | NOT NULL |
| branch_code | VARCHAR(10) | NOT NULL, UNIQUE |
| region_id | INTEGER | NOT NULL, FK→regions |
| address | TEXT | nullable |
| is_active | BOOLEAN | NOT NULL, default true |
| created_at | DATETIME(3) | NOT NULL, default CURRENT_TIMESTAMP(3) |
| tenant_id | INTEGER | NOT NULL, indexed |

**Relationships:** FK to `regions(region_id)`; referenced by `employees`.

### `roles`
Role definitions for access control and authorization within the system.

| Column | Type | Notes |
|---|---|---|
| id | INTEGER | PK, auto-increment |
| name | VARCHAR(50) | NOT NULL |
| label | VARCHAR(100) | NOT NULL |
| description | TEXT | nullable |
| level | INTEGER | NOT NULL, default 1 |
| is_active | BOOLEAN | NOT NULL, default true |
| created_at | DATETIME(3) | NOT NULL, default CURRENT_TIMESTAMP(3) |
| tenant_id | INTEGER | nullable, indexed, UNIQUE with name |

**Relationships:** Referenced by `ui_permissions(role_name)` and `operational_permissions(role_name)`; `employees.role` stores the role name as VARCHAR.

### `employees`
User accounts and employee records with authentication and organizational assignments.

| Column | Type | Notes |
|---|---|---|
| employee_id | VARCHAR(20) | PK |
| employee_name | VARCHAR(100) | NOT NULL |
| role | VARCHAR(50) | NOT NULL (role name reference) |
| email | VARCHAR(100) | nullable, UNIQUE |
| phone | VARCHAR(20) | nullable |
| password | VARCHAR(255) | NOT NULL |
| branch_id | INTEGER | nullable, FK→branches |
| region_id | INTEGER | nullable, FK→regions |
| is_active | BOOLEAN | NOT NULL, default true |
| created_at | DATETIME(3) | NOT NULL, default CURRENT_TIMESTAMP(3) |
| updated_at | DATETIME(3) | NOT NULL |
| tenant_id | INTEGER | NOT NULL, indexed |

**Relationships:** FK to `branches` and `regions`; referenced widely as owner/creator/assignee across the schema (activities, tasks, notifications, audit_logs, assignment_rules, quotas, integrations, and most CRM/insurance tables).

### `employee_hierarchy`
Closure-table representation of the employee reporting tree (ancestor/descendant) for reporting relationships and delegation paths.

| Column | Type | Notes |
|---|---|---|
| ancestor_id | VARCHAR(20) | PK part 1, FK→employees |
| descendant_id | VARCHAR(20) | PK part 2, FK→employees |
| depth | INTEGER | NOT NULL, default 0 (hierarchy level) |
| tenant_id | INTEGER | NOT NULL, indexed |

**Relationships:** Composite PK; self-referential FKs to `employees(employee_id)`.

---

## UI Metadata & Low-Code Engine

> These tables drive a configurable, metadata-defined UI: modules → objects → fields → forms/pages/dashboards, plus workflows, wizards, pipelines, and permissions.

### `ui_modules`
Top-level modules organizing UI objects into business domains (e.g., CRM, Insurance, Settings).

| Column | Type | Notes |
|---|---|---|
| id | INTEGER | PK, auto-increment |
| name | VARCHAR(100) | NOT NULL |
| label | VARCHAR(100) | NOT NULL |
| description | TEXT | nullable |
| icon | VARCHAR(50) | nullable |
| color | VARCHAR(20) | nullable (hex color) |
| order_index | INTEGER | NOT NULL, default 0 |
| is_active | BOOLEAN | NOT NULL, default true |
| created_at | DATETIME(3) | NOT NULL, default CURRENT_TIMESTAMP(3) |
| updated_at | DATETIME(3) | NOT NULL |
| category | VARCHAR(50) | NOT NULL, default 'crm' (added in `add_module_category`; values: crm, insurance, settings) |
| tenant_id | INTEGER | NOT NULL, indexed |

**Relationships:** Referenced by `ui_objects(module_id)`.

### `ui_objects`
Business entities within modules (e.g., Accounts, Contacts, Opportunities) — the core configurable data objects.

| Column | Type | Notes |
|---|---|---|
| id | INTEGER | PK, auto-increment |
| module_id | INTEGER | NOT NULL, FK→ui_modules |
| name | VARCHAR(100) | NOT NULL |
| label | VARCHAR(100) | NOT NULL |
| plural_label | VARCHAR(100) | nullable |
| description | TEXT | nullable |
| icon | VARCHAR(50) | nullable |
| order_index | INTEGER | NOT NULL, default 0 |
| is_active | BOOLEAN | NOT NULL, default true |
| created_at | DATETIME(3) | NOT NULL, default CURRENT_TIMESTAMP(3) |
| updated_at | DATETIME(3) | NOT NULL |
| tenant_id | INTEGER | NOT NULL, indexed |

**Relationships:** FK to `ui_modules`; referenced by `ui_fields`, `ui_forms`, `ui_pages`, `ui_workflows`, `ui_wizards`, `ui_pipelines`, `records`, `assignment_rules`, `import_jobs`, `quotas`.

### `ui_fields`
Field definitions for objects — schema and metadata for individual data attributes.

| Column | Type | Notes |
|---|---|---|
| id | INTEGER | PK, auto-increment |
| object_id | INTEGER | NOT NULL, FK→ui_objects |
| name | VARCHAR(100) | NOT NULL |
| label | VARCHAR(100) | NOT NULL |
| field_type | VARCHAR(50) | NOT NULL (text, number, date, select, …) |
| data_type | VARCHAR(50) | NOT NULL (string, integer, decimal, boolean, …) |
| is_required | BOOLEAN | NOT NULL, default false |
| is_unique | BOOLEAN | NOT NULL, default false |
| is_searchable | BOOLEAN | NOT NULL, default true |
| is_sortable | BOOLEAN | NOT NULL, default true |
| is_indexed | BOOLEAN | NOT NULL, default false |
| default_value | TEXT | nullable |
| placeholder | VARCHAR(200) | nullable |
| help_text | TEXT | nullable |
| options | JSON | nullable (select/radio/checkbox options) |
| config | JSON | nullable (extra field configuration) |
| order_index | INTEGER | NOT NULL, default 0 |
| is_active | BOOLEAN | NOT NULL, default true |
| created_at | DATETIME(3) | NOT NULL, default CURRENT_TIMESTAMP(3) |
| updated_at | DATETIME(3) | NOT NULL |
| tenant_id | INTEGER | NOT NULL, indexed |

**Relationships:** FK to `ui_objects`; referenced by `ui_form_field_layouts`, `ui_validations`, `ui_field_dependencies`.

### `ui_forms`
Form definitions that organize fields for data entry and display.

| Column | Type | Notes |
|---|---|---|
| id | INTEGER | PK, auto-increment |
| object_id | INTEGER | NOT NULL, FK→ui_objects |
| name | VARCHAR(100) | NOT NULL |
| label | VARCHAR(100) | NOT NULL |
| description | TEXT | nullable |
| form_type | VARCHAR(50) | NOT NULL (create, edit, view, detail) |
| columns | INTEGER | NOT NULL, default 2 |
| is_active | BOOLEAN | NOT NULL, default true |
| created_at | DATETIME(3) | NOT NULL, default CURRENT_TIMESTAMP(3) |
| updated_at | DATETIME(3) | NOT NULL |
| tenant_id | INTEGER | NOT NULL, indexed |

**Relationships:** FK to `ui_objects`; referenced by `ui_form_field_layouts(form_id)` and `ui_wizard_steps(form_id)`.

### `ui_form_field_layouts`
Grid layout configuration for fields within a form (row/column positioning).

| Column | Type | Notes |
|---|---|---|
| id | INTEGER | PK, auto-increment |
| form_id | INTEGER | NOT NULL, FK→ui_forms |
| field_id | INTEGER | NOT NULL, FK→ui_fields |
| row | INTEGER | NOT NULL, default 0 |
| col | INTEGER | NOT NULL, default 0 |
| col_span | INTEGER | NOT NULL, default 1 |
| order_index | INTEGER | NOT NULL, default 0 |
| is_visible | BOOLEAN | NOT NULL, default true |
| config | JSON | nullable |
| tenant_id | INTEGER | NOT NULL, indexed |

**Relationships:** FKs to `ui_forms` and `ui_fields`; UNIQUE on (form_id, field_id).

### `ui_validations`
Field validation rules (required, pattern, min/max, etc.).

| Column | Type | Notes |
|---|---|---|
| id | INTEGER | PK, auto-increment |
| field_id | INTEGER | NOT NULL, FK→ui_fields |
| validation_type | VARCHAR(50) | NOT NULL (required, regex, min, max, email, …) |
| value | VARCHAR(500) | nullable (validation parameter) |
| error_message | VARCHAR(500) | NOT NULL |
| order_index | INTEGER | NOT NULL, default 0 |
| tenant_id | INTEGER | NOT NULL, indexed |

**Relationships:** FK to `ui_fields`.

### `ui_field_dependencies`
Conditional dependencies between fields, driving dynamic form behavior (show/hide, enable/disable, require).

| Column | Type | Notes |
|---|---|---|
| id | INTEGER | PK, auto-increment |
| source_field_id | INTEGER | NOT NULL, FK→ui_fields |
| target_field_id | INTEGER | NOT NULL, FK→ui_fields |
| condition_type | VARCHAR(50) | NOT NULL (equals, contains, greaterThan, …) |
| condition_value | TEXT | nullable |
| action_type | VARCHAR(50) | NOT NULL (show, hide, enable, disable, require) |
| action_value | TEXT | nullable |
| tenant_id | INTEGER | NOT NULL, indexed |

**Relationships:** Two FKs to `ui_fields` (source and target).

### `ui_pages`
Page definitions composing UI sections and layouts.

| Column | Type | Notes |
|---|---|---|
| id | INTEGER | PK, auto-increment |
| object_id | INTEGER | nullable, FK→ui_objects |
| name | VARCHAR(100) | NOT NULL |
| label | VARCHAR(100) | NOT NULL |
| page_type | VARCHAR(50) | NOT NULL (list, detail, form, dashboard) |
| config | JSON | nullable |
| is_active | BOOLEAN | NOT NULL, default true |
| created_at | DATETIME(3) | NOT NULL, default CURRENT_TIMESTAMP(3) |
| updated_at | DATETIME(3) | NOT NULL |
| tenant_id | INTEGER | NOT NULL, indexed |

**Relationships:** FK to `ui_objects` (nullable).

### `ui_dashboards`
Dashboard definitions aggregating widgets and charts.

| Column | Type | Notes |
|---|---|---|
| id | INTEGER | PK, auto-increment |
| name | VARCHAR(100) | NOT NULL |
| label | VARCHAR(100) | NOT NULL |
| description | TEXT | nullable |
| min_role | VARCHAR(50) | nullable (minimum role to view) |
| is_default | BOOLEAN | NOT NULL, default false |
| is_active | BOOLEAN | NOT NULL, default true |
| created_by | VARCHAR(20) | nullable, FK→employees |
| created_at | DATETIME(3) | NOT NULL, default CURRENT_TIMESTAMP(3) |
| updated_at | DATETIME(3) | NOT NULL |
| tenant_id | INTEGER | NOT NULL, indexed |

**Relationships:** FK to `employees(created_by)`; referenced by `ui_dashboard_widgets(dashboard_id)`.

### `ui_dashboard_widgets`
Widgets placed on dashboards (charts, metrics, lists, custom content) with grid positioning.

| Column | Type | Notes |
|---|---|---|
| id | INTEGER | PK, auto-increment |
| dashboard_id | INTEGER | NOT NULL, FK→ui_dashboards |
| widget_type | VARCHAR(50) | NOT NULL (chart, metric, list, custom) |
| title | VARCHAR(200) | nullable |
| x / y | INTEGER | NOT NULL, default 0 (grid position) |
| w | INTEGER | NOT NULL, default 6 (grid width) |
| h | INTEGER | NOT NULL, default 4 (grid height) |
| chart_id | INTEGER | nullable, FK→ui_charts |
| config | JSON | nullable |
| data_source | JSON | nullable — `{ type: "endpoint", dataset }` (default), `{ type: "api", url, … }`, or `{ type: "json", data }` |
| order_index | INTEGER | NOT NULL, default 0 |
| is_active | BOOLEAN | NOT NULL, default true |
| tenant_id | INTEGER | NOT NULL, indexed |

**Relationships:** FKs to `ui_dashboards` and `ui_charts` (nullable).

**Note:** widgets store a *pointer* to an analytics dataset, not the numbers. See
[Analytics · `/api/analytics`](API_REFERENCE.md#analytics--apianalytics).

### `ui_charts`
Chart/visualization definitions (bar, line, pie, etc.).

| Column | Type | Notes |
|---|---|---|
| id | INTEGER | PK, auto-increment |
| name | VARCHAR(100) | NOT NULL |
| label | VARCHAR(100) | NOT NULL |
| chart_type | VARCHAR(50) | NOT NULL (bar, bar_stacked, line, area, area_stacked, pie, donut, scatter, bubble, radar, radial_bar, treemap, funnel, heatmap, candlestick, gauge, waterfall, composed, timeline) |
| config | JSON | nullable |
| data_source | JSON | nullable — same shape as widget `data_source` |
| is_active | BOOLEAN | NOT NULL, default true |
| created_at | DATETIME(3) | NOT NULL, default CURRENT_TIMESTAMP(3) |
| updated_at | DATETIME(3) | NOT NULL |
| tenant_id | INTEGER | NOT NULL, indexed |

**Relationships:** Referenced by `ui_dashboard_widgets`.

### `ui_workflows`
Workflow-engine definitions for automation and business-process execution.

| Column | Type | Notes |
|---|---|---|
| id | INTEGER | PK, auto-increment |
| object_id | INTEGER | nullable, FK→ui_objects |
| name | VARCHAR(100) | NOT NULL |
| label | VARCHAR(100) | NOT NULL |
| description | TEXT | nullable |
| trigger_type | VARCHAR(50) | NOT NULL (manual, automatic, scheduled) |
| trigger_config | JSON | nullable |
| is_active | BOOLEAN | NOT NULL, default true |
| last_run_at | DATETIME(3) | nullable |
| created_at | DATETIME(3) | NOT NULL, default CURRENT_TIMESTAMP(3) |
| updated_at | DATETIME(3) | NOT NULL |
| tenant_id | INTEGER | NOT NULL, indexed |

**Relationships:** FK to `ui_objects` (nullable); referenced by `ui_workflow_steps`, `workflow_pending_steps`.

### `ui_workflow_steps`
Individual steps within a workflow (actions, conditions, branches).

| Column | Type | Notes |
|---|---|---|
| id | INTEGER | PK, auto-increment |
| workflow_id | INTEGER | NOT NULL, FK→ui_workflows |
| name | VARCHAR(100) | NOT NULL |
| step_type | VARCHAR(50) | NOT NULL (action, condition, branch, loop) |
| order_index | INTEGER | NOT NULL, default 0 |
| config | JSON | nullable |
| on_true_id | INTEGER | nullable, self-reference (true branch) |
| on_false_id | INTEGER | nullable, self-reference (false branch) |
| tenant_id | INTEGER | NOT NULL, indexed |

**Relationships:** FK to `ui_workflows`; self-referential via `on_true_id`/`on_false_id`.

### `workflow_pending_steps`
Tracks in-progress workflow instances, particularly approval / human-in-the-loop steps.

| Column | Type | Notes |
|---|---|---|
| id | INTEGER | PK, auto-increment |
| workflow_id | INTEGER | NOT NULL, FK→ui_workflows |
| resume_step_id | INTEGER | nullable, FK→ui_workflow_steps |
| record_id | INTEGER | nullable, FK→records |
| actor_id | VARCHAR(100) | nullable |
| context | JSON | nullable (runtime data) |
| resume_after | DATETIME(3) | nullable (scheduled resume) |
| approval_token | VARCHAR(255) | nullable, UNIQUE |
| approval_status | VARCHAR(20) | nullable, default 'pending' (pending, approved, rejected) |
| created_at | DATETIME(3) | NOT NULL, default CURRENT_TIMESTAMP(3) |
| tenant_id | INTEGER | NOT NULL, indexed |

**Relationships:** FKs to `ui_workflows`, `ui_workflow_steps` (nullable), `records` (nullable).

### `ui_wizards`
Step-by-step guided processes for complex/multi-stage data entry.

| Column | Type | Notes |
|---|---|---|
| id | INTEGER | PK, auto-increment |
| object_id | INTEGER | nullable, FK→ui_objects |
| name | VARCHAR(100) | NOT NULL |
| label | VARCHAR(100) | NOT NULL |
| description | TEXT | nullable |
| submit_label | VARCHAR(100) | nullable |
| success_message | VARCHAR(255) | nullable |
| is_active | BOOLEAN | NOT NULL, default true |
| created_at | DATETIME(3) | NOT NULL, default CURRENT_TIMESTAMP(3) |
| updated_at | DATETIME(3) | NOT NULL |
| tenant_id | INTEGER | NOT NULL, indexed |

**Relationships:** FK to `ui_objects` (nullable); referenced by `ui_wizard_steps`.

### `ui_wizard_steps`
Individual wizard steps, each optionally bound to a form.

| Column | Type | Notes |
|---|---|---|
| id | INTEGER | PK, auto-increment |
| wizard_id | INTEGER | NOT NULL, FK→ui_wizards |
| form_id | INTEGER | nullable, FK→ui_forms |
| name | VARCHAR(100) | NOT NULL |
| label | VARCHAR(100) | NOT NULL |
| description | TEXT | nullable |
| order_index | INTEGER | NOT NULL, default 0 |
| config | JSON | nullable |
| tenant_id | INTEGER | NOT NULL, indexed |

**Relationships:** FKs to `ui_wizards` and `ui_forms` (nullable).

### `ui_pipelines`
Configurable pipelines (sales/business/insurance) for tracking objects through stages.

| Column | Type | Notes |
|---|---|---|
| id | INTEGER | PK, auto-increment |
| object_id | INTEGER | NOT NULL, FK→ui_objects |
| name | VARCHAR(100) | NOT NULL |
| label | VARCHAR(100) | NOT NULL |
| description | TEXT | nullable |
| config | JSON | nullable (added in `add_pipeline_config`) |
| is_active | BOOLEAN | NOT NULL, default true |
| created_at | DATETIME(3) | NOT NULL, default CURRENT_TIMESTAMP(3) |
| updated_at | DATETIME(3) | NOT NULL |
| tenant_id | INTEGER | NOT NULL, indexed |

**Relationships:** FK to `ui_objects`; referenced by `ui_pipeline_stages`.

### `ui_pipeline_stages`
Stages within a pipeline (e.g., Prospecting, Qualified, Negotiating, Closed).

| Column | Type | Notes |
|---|---|---|
| id | INTEGER | PK, auto-increment |
| pipeline_id | INTEGER | NOT NULL, FK→ui_pipelines |
| name | VARCHAR(100) | NOT NULL |
| label | VARCHAR(100) | NOT NULL |
| color | VARCHAR(20) | NOT NULL, default '#6366f1' |
| order_index | INTEGER | NOT NULL, default 0 |
| config | JSON | nullable |
| tenant_id | INTEGER | NOT NULL, indexed |

**Relationships:** FK to `ui_pipelines`; referenced by `records(pipeline_stage_id)` and `crm_opportunities(pipeline_stage_id)`.

### `ui_permissions`
Fine-grained view/edit access control for UI entities (modules, objects, forms, dashboards, pages) by role.

| Column | Type | Notes |
|---|---|---|
| id | INTEGER | PK, auto-increment |
| entity_type | VARCHAR(50) | NOT NULL (module, object, form, dashboard, page) |
| entity_id | INTEGER | NOT NULL |
| role_name | VARCHAR(50) | NOT NULL |
| can_view | BOOLEAN | NOT NULL, default true |
| can_edit | BOOLEAN | NOT NULL, default false |
| updated_by | VARCHAR(20) | nullable, FK→employees |
| created_at | DATETIME(3) | NOT NULL, default CURRENT_TIMESTAMP(3) |
| updated_at | DATETIME(3) | NOT NULL |
| tenant_id | INTEGER | NOT NULL, indexed |

**Relationships:** UNIQUE on (entity_type, entity_id, role_name, tenant_id); FK to `employees(updated_by)`.

### `operational_permissions`
Scope-based CRUD permissions per entity type and role (own / team / all / none).

| Column | Type | Notes |
|---|---|---|
| id | INTEGER | PK, auto-increment |
| entity_type | VARCHAR(30) | NOT NULL (account, contact, lead, opportunity, case, …) |
| role_name | VARCHAR(50) | NOT NULL |
| view_scope | VARCHAR(20) | NOT NULL, default 'own' (own, team, all, none) |
| create_scope | VARCHAR(20) | NOT NULL, default 'own' |
| edit_scope | VARCHAR(20) | NOT NULL, default 'own' |
| delete_scope | VARCHAR(20) | NOT NULL, default 'own' |
| assign_scope | VARCHAR(20) | NOT NULL, default 'none' |
| updated_by | VARCHAR(20) | nullable, FK→employees |
| created_at | DATETIME(3) | NOT NULL, default CURRENT_TIMESTAMP(3) |
| updated_at | DATETIME(3) | NOT NULL |
| tenant_id | INTEGER | NOT NULL, indexed |

**Relationships:** UNIQUE on (entity_type, role_name, tenant_id); FK to `employees(updated_by)`.

---

## Generic Records & Activity Engine

> A polymorphic record layer: `records` is the universal container for any UI object, with `record_field_values` holding dynamic field data (EAV-style), plus shared activity/task/notification/audit tables.

### `records`
Base container for all business objects managed through the platform, linked to a UI object and (optionally) a pipeline stage.

| Column | Type | Notes |
|---|---|---|
| id | INTEGER | PK, auto-increment |
| object_id | INTEGER | The UI object this record instantiates |
| pipeline_stage_id | INTEGER | nullable, FK→ui_pipeline_stages |
| assigned_to | VARCHAR(20) | nullable, FK→employees |
| created_by | VARCHAR(100) | nullable |
| created_at | DATETIME(3) | default CURRENT_TIMESTAMP(3) |
| updated_at | DATETIME(3) | last modification |
| deleted_at | DATETIME(3) | nullable, indexed (added in `add_record_soft_delete`) — NULL = live; NOT NULL = in Trash (soft-deleted, hidden from users, admin-recoverable) |
| deleted_by | VARCHAR(100) | nullable (added in `add_record_soft_delete`) — actor who deleted it |
| tenant_id | INTEGER | multi-tenancy |

**Relationships:** Links to `ui_objects`, `employees` (assigned_to), `ui_pipeline_stages`. Parent for activities, tasks, audit_logs, record_field_values, and the typed CRM/insurance entities (one-to-one via their `record_id`).

**Soft delete / Trash:** when the record's pipeline has `config.delete_mode` = `soft` (the default, set via the Pipeline Builder toggle), deleting a record sets `deleted_at`/`deleted_by` instead of removing the row. Soft-deleted records are excluded from every user-facing query and surface only in the admin Trash (`GET /api/builder/trash/records`), where they can be restored or permanently purged. `hard` mode deletes the row outright. The mode is resolved per record from its object's pipeline in `RecordService`.

### `record_field_values`
Dynamic per-field values for records in columnar/typed form (string, number, bool, date, JSON).

| Column | Type | Notes |
|---|---|---|
| id | BIGINT | PK, auto-increment |
| record_id | INTEGER | FK→records |
| field_name | VARCHAR(100) | field being stored |
| str_value | TEXT | nullable |
| num_value | DOUBLE | nullable |
| bool_value | BOOLEAN | nullable |
| date_value | DATETIME(3) | nullable |
| json_value | JSON | nullable |
| created_at | DATETIME(3) | default CURRENT_TIMESTAMP(3) |
| updated_at | DATETIME(3) | |
| tenant_id | INTEGER | |

**Relationships:** FK to `records`; UNIQUE on (record_id, field_name) — one row per field per record.

### `activities`
Logged interactions on records (calls, meetings, notes, etc.).

| Column | Type | Notes |
|---|---|---|
| id | INTEGER | PK, auto-increment |
| record_id | INTEGER | FK→records |
| employee_id | VARCHAR(20) | FK→employees (who performed it) |
| type | VARCHAR(50) | call, meeting, note, … |
| subject | VARCHAR(200) | |
| description | TEXT | nullable |
| outcome | VARCHAR(500) | nullable |
| duration_min | INTEGER | nullable |
| scheduled_at | DATETIME(3) | nullable |
| completed_at | DATETIME(3) | nullable |
| created_at / updated_at | DATETIME(3) | |
| tenant_id | INTEGER | |

**Relationships:** FKs to `records`, `employees`.

### `tasks`
Assignable work items with status and priority tracking.

| Column | Type | Notes |
|---|---|---|
| id | INTEGER | PK, auto-increment |
| record_id | INTEGER | nullable, FK→records |
| assigned_to | VARCHAR(20) | FK→employees |
| created_by | VARCHAR(20) | FK→employees |
| title | VARCHAR(200) | |
| description | TEXT | nullable |
| status | VARCHAR(30) | default 'open' (open, in_progress, completed, closed) |
| priority | VARCHAR(20) | default 'normal' (low, normal, high, urgent) |
| due_date | DATETIME(3) | nullable |
| completed_at | DATETIME(3) | nullable |
| created_at / updated_at | DATETIME(3) | |
| tenant_id | INTEGER | |

**Relationships:** Optional FK to `records`; FKs to `employees` (assigned_to, created_by).

### `reminders`
Time-based reminders / follow-ups. When `remind_at` passes, the reminder scheduler creates a `reminder`-type row in `notifications` for the target employee.

| Column | Type | Notes |
|---|---|---|
| id | INTEGER | PK, auto-increment |
| record_id | INTEGER | nullable, FK→records (ON DELETE SET NULL) |
| employee_id | VARCHAR(20) | FK→employees — who is reminded |
| created_by | VARCHAR(20) | FK→employees |
| title | VARCHAR(200) | |
| note | TEXT | nullable |
| remind_at | DATETIME(3) | when to fire |
| status | VARCHAR(20) | default 'pending' (pending, notified, done, dismissed, cancelled) |
| priority | VARCHAR(20) | default 'normal' (low, normal, high, urgent) |
| notified_at | DATETIME(3) | nullable — set when the sweep fires it |
| completed_at | DATETIME(3) | nullable |
| created_at / updated_at | DATETIME(3) | |
| tenant_id | INTEGER | |

**Relationships:** Optional FK to `records`; FKs to `employees` (employee_id, created_by). Indexed on (remind_at, status) for the due-sweep and (employee_id, status) for the agenda feed.

### `notifications`
In-app notifications for employees.

| Column | Type | Notes |
|---|---|---|
| id | INTEGER | PK, auto-increment |
| employee_id | VARCHAR(20) | FK→employees |
| type | VARCHAR(50) | task_assigned, lead_converted, … |
| title | VARCHAR(200) | |
| body | TEXT | nullable |
| link | VARCHAR(500) | nullable |
| is_read | BOOLEAN | default false |
| created_at | DATETIME(3) | default CURRENT_TIMESTAMP(3) |
| tenant_id | INTEGER | |

**Relationships:** FK to `employees`; indexed on (employee_id, is_read).

### `audit_logs`
Durable, general audit trail for user actions — record data actions AND pipeline-config actions — each attributed to the acting employee.

| Column | Type | Notes |
|---|---|---|
| id | INTEGER | PK, auto-increment |
| record_id | INTEGER | **nullable**, FK→records **ON DELETE SET NULL** (so the entry survives a hard-delete/purge of its record) |
| entity_type | VARCHAR(50) | nullable — set for non-record actions (e.g. `pipeline`); null for record actions (added in `audit_log_general_durable`) |
| entity_id | INTEGER | nullable — id of the non-record entity (added in `audit_log_general_durable`) |
| employee_id | VARCHAR(20) | FK→employees (the acting user) |
| action | VARCHAR(40) | `create`, `update`, `delete`, `stage_change`, `restore`, `purge`, `pipeline.create`, `pipeline.update`, `pipeline.delete` |
| changes | JSON | nullable — field-level diff, or action payload (e.g. `{ mode, record_id, object_id }` for deletes) |
| created_at | DATETIME(3) | default CURRENT_TIMESTAMP(3) |
| tenant_id | INTEGER | |

**Relationships:** FKs to `records` (nullable, SET NULL), `employees`. Indexed on `record_id`, `(entity_type, entity_id)`, and `tenant_id`.

**Coverage:** every mutating action on pipeline data writes an entry — record `create` / `update` / `stage_change` (single + bulk) / `delete` (soft or hard, mode in `changes`) / `restore` / `purge` — plus pipeline-config `pipeline.create` / `pipeline.update` / `pipeline.delete`. Because `record_id` is `SET NULL` (not cascade), hard-delete and purge entries persist with the original id retained in `changes`.

---

## Assignment, Quotas & Integrations

### `assignment_rules`
Rules engine for auto-assigning records to employees (direct, round-robin, pool).

| Column | Type | Notes |
|---|---|---|
| id | INTEGER | PK, auto-increment |
| object_id | INTEGER | FK→ui_objects (object the rule applies to) |
| name | VARCHAR(100) | |
| rule_type | VARCHAR(30) | direct, round_robin, pool, … |
| conditions | JSON | nullable (trigger conditions) |
| assignee_id | VARCHAR(20) | nullable, FK→employees (direct) |
| pool_ids | JSON | nullable (employee IDs for pool/round-robin) |
| fallback_id | VARCHAR(20) | nullable, FK→employees |
| order_index | INTEGER | default 0 |
| is_active | BOOLEAN | default true |
| created_by | VARCHAR(20) | nullable, FK→employees |
| created_at / updated_at | DATETIME(3) | |
| tenant_id | INTEGER | |

**Relationships:** FK to `ui_objects`; FKs to `employees`; one-to-one with `round_robin_states`.

### `round_robin_states`
Tracks last-assigned index for round-robin rules to ensure fair distribution.

| Column | Type | Notes |
|---|---|---|
| rule_id | INTEGER | PK, FK→assignment_rules |
| pool_ids | JSON | current rotation pool |
| last_index | INTEGER | default 0 |
| updated_at | DATETIME(3) | |
| tenant_id | INTEGER | |

**Relationships:** One-to-one FK to `assignment_rules`.

### `assignment_logs`
Audit trail of every assignment action with rule/method used.

| Column | Type | Notes |
|---|---|---|
| id | INTEGER | PK, auto-increment |
| record_id | INTEGER | FK→records |
| object_id | INTEGER | FK→ui_objects (denormalized) |
| rule_id | INTEGER | nullable, FK→assignment_rules |
| assigned_to | VARCHAR(20) | FK→employees |
| method | VARCHAR(30) | auto_rule, manual, import, api |
| created_at | DATETIME(3) | default CURRENT_TIMESTAMP(3) |
| tenant_id | INTEGER | |

**Relationships:** FKs to `records`, `ui_objects`, `assignment_rules`, `employees`.

### `quotas`
Sales/performance quotas per employee, object type, and period.

| Column | Type | Notes |
|---|---|---|
| id | INTEGER | PK, auto-increment |
| employee_id | VARCHAR(20) | FK→employees |
| object_id | INTEGER | FK→ui_objects |
| period_type | VARCHAR(20) | daily, weekly, monthly, quarterly, annual |
| period_key | VARCHAR(20) | e.g., "2026-Q1", "2026-02" |
| target_value | DECIMAL(18,2) | |
| currency | VARCHAR(10) | default 'USD' |
| created_by | VARCHAR(20) | nullable, FK→employees |
| created_at / updated_at | DATETIME(3) | |
| tenant_id | INTEGER | |

**Relationships:** FKs to `employees`, `ui_objects`; UNIQUE on (employee_id, object_id, period_type, period_key).

### `import_jobs`
Bulk import operations for records (CSV, Excel, API) with mapping, dedupe, and stats.

| Column | Type | Notes |
|---|---|---|
| id | INTEGER | PK, auto-increment |
| object_id | INTEGER | FK→ui_objects (import target) |
| filename | VARCHAR(255) | |
| status | VARCHAR(20) | default 'pending' (pending, processing, completed, failed) |
| field_mapping | JSON | nullable |
| dedupe_keys | JSON | nullable |
| strategy | VARCHAR(20) | default 'skip' (skip, update, merge) |
| stats | JSON | nullable (total/created/updated/failed) |
| error_rows | JSON | nullable |
| created_by | VARCHAR(20) | FK→employees |
| created_at / updated_at | DATETIME(3) | |
| tenant_id | INTEGER | |

**Relationships:** FKs to `ui_objects`, `employees`.

### `integrations`
External system integrations (APIs, webhooks, data-sync configs).

| Column | Type | Notes |
|---|---|---|
| id | INTEGER | PK, auto-increment |
| name | VARCHAR(100) | UNIQUE |
| label | VARCHAR(100) | |
| type | VARCHAR(50) | outbound_webhook, inbound_webhook, enrichment, custom (email_sync planned) |
| config | JSON | nullable. Outbound/enrichment/custom: `url`, `method`, `headers`, `timeout_ms`, `events` (subscribed event patterns, generic or per-object), `secret` (HMAC signing), `retry` `{attempts,backoff_ms}`. Inbound: `secret`, `event_field`, `event_map` `{event:workflowId}` |
| is_active | BOOLEAN | default true |
| last_run_at | DATETIME(3) | nullable |
| created_by | VARCHAR(20) | nullable, FK→employees |
| created_at / updated_at | DATETIME(3) | |
| tenant_id | INTEGER | |

**Relationships:** FK to `employees`; has many `integration_logs`.

### `integration_logs`
Execution logs (request/response/error/timing) for integration runs.

| Column | Type | Notes |
|---|---|---|
| id | INTEGER | PK, auto-increment |
| integration_id | INTEGER | FK→integrations |
| status | VARCHAR(20) | success, error (failed delivery after retries) |
| request_body | JSON | nullable |
| response_body | JSON | nullable |
| error | TEXT | nullable |
| duration_ms | INTEGER | nullable |
| created_at | DATETIME(3) | default CURRENT_TIMESTAMP(3) |
| tenant_id | INTEGER | |

**Relationships:** FK to `integrations`.

---

## CRM Core

> Each typed CRM entity has a one-to-one `record_id` link to the polymorphic `records` table, plus an `owner_id`/`created_by` employee reference.

### `crm_accounts`
Company/organizational accounts — businesses the company sells to.

Key columns: `name`, `website`, `phone`, `email`, `industry`, `account_type`, `annual_revenue` (DECIMAL 18,2), `employee_count`, full **billing address** (street/city/state/country/zip), `description`, `owner_id` (FK→employees), `external_id` (external system ID), `record_id` (UNIQUE FK→records), `created_by`, timestamps, `tenant_id`.

**Relationships:** One-to-one with `records`; FKs to `employees`. Parent for `crm_contacts`, `crm_opportunities`, `crm_cases`, `quotes`, and insurance policies/applications.

### `crm_contacts`
Individual people, optionally linked to an account.

Key columns: `account_id` (nullable FK→crm_accounts), `first_name`, `last_name`, `email`, `phone`, `mobile`, `title`, `department`, `lead_source`, full **mailing address**, `birthdate`, `description`, `do_not_contact` (BOOLEAN, compliance DNC), `owner_id`, `external_id`, `record_id` (UNIQUE FK→records), timestamps, `tenant_id`.

**Relationships:** One-to-one with `records`; FKs to `crm_accounts`, `employees`. Parent for opportunities, cases, quotes, policies, beneficiaries.

### `crm_lead_intake`
Raw, unqualified inbound **Leads** (the UI "Leads" module, internal object name `lead_intake`). This is the *front* of the CRM lifecycle — capture happens here before qualification. Qualifying/converting a lead creates a `crm_leads` (Prospect) row; see `CrmService.convertLeadToProspect`. Kept as a separate table so raw inbound never pollutes the working prospect pipeline (the Salesforce/Zoho separation — see [DATA_DICTIONARY](DATA_DICTIONARY.md) for the Lead-vs-Prospect rationale).

Key columns: `first_name`, `last_name`, `company`, `email`, `phone`, `mobile`, `job_title`, `lead_source`, `lead_status` (default 'new': new, contacted, qualified, converted), `rating` (hot/warm/cold), `industry`, `annual_revenue`, `website`, `description`, `is_converted` (BOOLEAN), `converted_at`, `converted_prospect_id` (→ `crm_leads.id` created on conversion), `owner_id`, `external_id`, `record_id` (UNIQUE FK→records), `created_by`, timestamps, `tenant_id`.

**Relationships:** One-to-one with `records`; FK to `employees` (owner). Converts into `crm_leads` (Prospect).

### `crm_leads`
The **Prospect** layer — a qualified/working lead (the UI "Prospects" module, object name `prospect`). Populated either directly or by converting a `crm_lead_intake` row. Converting a prospect (via `CrmService.convertLead`) creates account/contact/opportunity (Client).

Key columns: `first_name`, `last_name`, `company`, `email`, `phone`, `mobile`, `job_title`, `lead_source`, `lead_status` (default 'new': new, contacted, qualified, unqualified, converted), `rating` (hot/warm/cold), `industry`, `annual_revenue`, `website`, `description`, `is_converted` (BOOLEAN), `converted_at`, `owner_id`, `external_id`, `record_id` (UNIQUE FK→records), timestamps, `tenant_id`.

**Relationships:** One-to-one with `records`; FK to `employees`. Parent for `crm_lead_conversions`, `lead_scores`. Fed by `crm_lead_intake`.

### `crm_opportunities`
Qualified deals with revenue value and sales stages.

Key columns: `account_id`, `contact_id`, `name`, `amount` (DECIMAL 18,2), `currency`, `stage` (default 'prospecting' → … closed_won/closed_lost), `probability` (0–100), `close_date`, `lead_source`, `type`, `next_step`, `description`, `is_closed`, `is_won`, `forecast_category`, `pipeline_stage_id` (FK→ui_pipeline_stages), `owner_id`, `external_id`, `record_id` (UNIQUE FK→records), timestamps, `tenant_id`.

**Relationships:** One-to-one with `records`; FKs to `crm_accounts`, `crm_contacts`, `employees`, `ui_pipeline_stages`. Parent for `quotes`, `crm_lead_conversions`, `deal_stage_history`, `deal_competitors`, `contracts`, `partner_opportunities`.

### `crm_cases`
Support/service tickets for customer issues.

Key columns: `account_id`, `contact_id`, `subject`, `description`, `status` (default 'new': new, in_progress, waiting_customer, resolved, closed), `priority` (default 'medium': low/medium/high/critical), `type`, `origin` (email/phone/chat/web), `contact_email`, `contact_name`, `resolution`, `owner_id`, `external_id`, `record_id` (UNIQUE FK→records), timestamps, `tenant_id`.

**Relationships:** One-to-one with `records`; FKs to `crm_accounts`, `crm_contacts`, `employees`. Linkable to `customer_cases` (portal).

### `crm_lead_conversions`
Audit of converting a lead into contact/account/opportunity.

| Column | Type | Notes |
|---|---|---|
| id | INTEGER | PK |
| lead_id | INTEGER | FK→crm_leads, UNIQUE (one conversion per lead) |
| account_id | INTEGER | nullable, FK→crm_accounts |
| contact_id | INTEGER | nullable, FK→crm_contacts |
| opportunity_id | INTEGER | UNIQUE, FK→crm_opportunities |
| converted_by | VARCHAR(20) | nullable, FK→employees |
| converted_at | DATETIME(3) | default CURRENT_TIMESTAMP(3) |
| notes | TEXT | nullable |
| created_at | DATETIME(3) | |
| tenant_id | INTEGER | |

**Relationships:** FKs to `crm_leads`, `crm_accounts`, `crm_contacts`, `crm_opportunities`, `employees`.

### `crm_associations`
Flexible N-to-N associations between any two CRM entities.

| Column | Type | Notes |
|---|---|---|
| id | INTEGER | PK |
| from_type / from_id | VARCHAR(50) / INTEGER | source entity type + id |
| to_type / to_id | VARCHAR(50) / INTEGER | target entity type + id |
| assoc_type | VARCHAR(100) | related_to, parent_of, decision_maker_for, … |
| created_by | VARCHAR(20) | nullable, FK→employees |
| created_at | DATETIME(3) | |
| tenant_id | INTEGER | |

**Relationships:** Polymorphic by (type, id); UNIQUE on (from_type, from_id, to_type, to_id, assoc_type).

---

## Products & Quoting

### `products`
Catalog of sellable products/services with pricing, tax, vendor, and physical attributes.

Key columns: `record_id` (UNIQUE FK→records, nullable), `name`, `sku` (UNIQUE), `category`, `description`, `unit_price` (DECIMAL 18,2, NOT NULL), `cost_price`, `currency` ('USD'), `tax_rate` (DECIMAL 5,4), `is_active`, `is_service`, `min_quantity` (default 1), `max_quantity`, `vendor_name`, `vendor_sku`, `dimensions`, `weight`, `warranty_months`, `image_url`, `created_by`, timestamps, `tenant_id`.

**Relationships:** references `records`; referenced by `quote_line_items(product_id)`.

### `quotes`
Sales quotes with pricing, totals, billing/shipping addresses, and status.

Key columns: `record_id` (UNIQUE), `opportunity_id` (FK→crm_opportunities), `account_id`, `contact_id`, `quote_number` (UNIQUE), `name`, `status` ('draft'), `valid_until`, monetary fields `subtotal`/`discount_amount`/`discount_percent`/`tax_amount`/`total_amount` (default 0), `currency`, `terms`, `notes`, full **billing + shipping addresses**, `accepted_at`, `sent_at`, `owner_id` (FK→employees), `created_by`, timestamps, `tenant_id`.

**Relationships:** FKs to `records`, `crm_opportunities`, `crm_accounts`, `crm_contacts`, `employees`; has many `quote_line_items`.

### `quote_line_items`
Line items within a quote.

| Column | Type | Notes |
|---|---|---|
| id | INTEGER | PK |
| quote_id | INTEGER | FK→quotes |
| product_id | INTEGER | nullable, FK→products |
| name | VARCHAR(255) | |
| description | TEXT | nullable |
| quantity | DECIMAL(10,2) | |
| unit_price | DECIMAL(18,2) | |
| discount | DECIMAL(5,2) | default 0 |
| line_total | DECIMAL(18,2) | |
| order_index | INTEGER | default 0 |
| tenant_id | INTEGER | |

**Relationships:** FKs to `quotes`, `products`.

### `quote_scenarios`
Alternative insurance quote scenarios for comparison (coverage, term, rate source, premiums). *(from `insurance_ams_p0_p4`)*

Key columns: `scenario_ref` (UNIQUE with tenant), `contact_id` (FK→crm_contacts), `application_id` (FK→insurance_applications), `product_type`, `coverage_amount`, `term_years`, `payment_frequency` ('monthly'), `applicant_data` (JSON), `riders` (JSON), `rate_source` ('internal'), `rate_source_meta` (JSON), `quote_result` (JSON), `monthly_premium`, `annual_premium`, `status` ('active'), `valid_until`, `comparison_group`, `created_by`, timestamps, `tenant_id`.

**Relationships:** FKs to `crm_contacts`, `insurance_applications`.

---

## Email, Campaigns & Lead Scoring

### `email_templates`
Reusable templates with HTML/text bodies and variable placeholders.

Key columns: `record_id` (UNIQUE), `object_id` (FK→ui_objects), `name`, `category`, `subject`, `body_html` (MEDIUMTEXT), `body_text`, `variables` (JSON), `is_active`, `usage_count`, `language` ('en'), `created_by`, timestamps, `tenant_id`.

**Relationships:** FKs to `records`, `ui_objects`; referenced by `email_logs`, `email_campaigns`.

### `email_logs`
Per-send email records with delivery/open/click/bounce tracking.

Key columns: `template_id` (FK→email_templates), `related_record_id` + `related_type` (polymorphic), `to_email`, `from_email`, `cc_emails`/`bcc_emails` (JSON), `subject`, `body_html`, `body_text`, `status` ('sent'), `opened_at`, `clicked_at`, `bounced_at`, `bounce_reason`, `sent_by`, `sent_at`, `created_at`, `tenant_id`.

**Relationships:** FK to `email_templates`.

### `documents`
Unified store for the **standalone Document Management System (DMS)** — generic CRM attachments, insurance application
documents, generated documents, and compliance artifacts. Bytes live in a pluggable `StorageProvider` (local / S3 /
Azure / GCS) under a tenant-first **relative** key; the row holds only metadata. See
[DOCUMENT_MANAGEMENT.md](DOCUMENT_MANAGEMENT.md).

Key columns: `record_id` (UNIQUE, runtime-records bridge), `document_ref` (human ref e.g. `DOC-APP2026001-001`),
polymorphic owner `entity_type` + `entity_id` (and typed `application_id`), `original_filename`, `stored_key`
(relative storage key, never an absolute path), `file_size`, `mime_type`, `file_hash` (SHA-256 — integrity & dedup),
`category`, `folder_id` (FK→document_folders), `description`, `notes`, `content_text` (MediumText — extracted plain
text for full-text search; **never returned over the API**), `version`, `status` (`uploaded` | `under_review` |
`approved` | `rejected` | `waived` | `deleted` …), `is_public`, review columns (`reviewed_by`, `reviewed_at`,
`rejection_reason`), `uploaded_by`/`uploaded_at`, `deleted_at` (soft-delete marker), timestamps, `tenant_id`.

Indexes: `(entity_type, entity_id)`, `application_id`, `category`, `status`, `file_hash`, `original_filename`,
`folder_id`, `deleted_at`, `tenant_id`, plus a **FULLTEXT** index `documents_fulltext` on
`(original_filename, description, content_text)`.

**Relationships:** FK to `records`, `insurance_applications` (AppDocuments), `document_folders`; referenced by
`compliance_artifacts`, `submission_checklists`, `document_share_links`, `document_signature_requests`.

### `document_folders`
Self-referential per-tenant folder tree with a materialised `path` (e.g. `/Contracts/2026`) for cheap breadcrumbs and
subtree moves.

Key columns: `name`, `parent_id` (FK→document_folders, self), `path`, `order_index`, `created_by`, timestamps,
`tenant_id`. Deleting a folder cascades to children and NULLs `documents.folder_id` (documents survive).

### `document_share_links`
Shareable, optionally-expiring public links to a document.

Key columns: `document_id` (FK→documents), `token` (UNIQUE, unguessable), `allow_download`, `expires_at`, `is_active`,
`view_count`, `last_viewed_at`, `created_by`, timestamps, `tenant_id`.

### `document_view_events`
Per-open/download engagement events for share links.

Key columns: `share_link_id` (FK→document_share_links), `document_id`, `event_type` (`view` | `download`), `viewer_ip`,
`user_agent`, `referrer`, `duration_secs`, `viewed_at`, `tenant_id`.

### `document_templates`
Admin-managed merge templates rendered into first-class documents.

Key columns: `name`, `description`, `entity_type`, `body` (MediumText, `{{placeholder}}` source), `format`
(`html` | `text`), `output_category`, `is_active`, `created_by`, timestamps, `tenant_id`.

### `document_signature_requests`
Native e-signature requests against a document.

Key columns: `document_id` (FK→documents), `title`, `message`, `status` (`sent` | `completed` | `declined` |
`cancelled` | `expired`), `ordered` (enforce signer order), `expires_at`, `completed_at`, `certificate_doc_id`
(generated certificate Document id), `created_by`, timestamps, `tenant_id`.

### `document_signatories`
Individual signers on a signature request.

Key columns: `request_id` (FK→document_signature_requests), `name`, `email`, `order_index`, `status` (`pending` |
`viewed` | `signed` | `declined`), `token` (UNIQUE, unguessable signing token), `signature_type` (`typed` | `drawn`),
`signature_data` (typed name or base64 PNG), `decline_reason`, `viewer_ip`, `viewed_at`, `signed_at`, timestamps,
`tenant_id`.

### `ui_document_categories`
Document Management **builder** config: per-category upload policy.

Key columns: `code` (machine key, UNIQUE per tenant), `label`, `description`, `allowed_mime` (JSON; null → global
policy), `max_file_mb`, `retention_days`, `review_required`, `is_required`, `color`, `order_index`, `is_active`,
`config` (JSON), timestamps, `tenant_id`.

### `ui_document_checklists`
Document Management **builder** config: required-document checklists per entity type.

Key columns: `entity_type`, `label`, `description`, `items` (JSON `[{ category_code, required, label }]`), `is_active`,
`order_index`, timestamps, `tenant_id`.

### `lead_scoring_rules`
Point rules for scoring leads by field conditions.

| Column | Type | Notes |
|---|---|---|
| id | INTEGER | PK |
| name | VARCHAR(255) | |
| description | TEXT | nullable |
| field_name | VARCHAR(100) | |
| operator | VARCHAR(50) | comparison operator |
| field_value | TEXT | nullable |
| points | INTEGER | points awarded |
| rule_type | VARCHAR(50) | |
| is_active | BOOLEAN | default true |
| order_index | INTEGER | default 0 |
| created_by | VARCHAR(20) | nullable |
| created_at / updated_at | DATETIME(3) | |
| tenant_id | INTEGER | |

### `lead_scores`
Calculated total score per lead with scoring detail. Primary target is a **Lead** (`crm_lead_intake`); `lead_id`
(Prospect) remains for legacy/manual prospect scoring. Exactly one of `lead_intake_id` / `lead_id` is set per row.

| Column | Type | Notes |
|---|---|---|
| id | INTEGER | PK |
| lead_intake_id | INTEGER | nullable, FK→crm_lead_intake (the Lead being scored) |
| lead_id | INTEGER | nullable, FK→crm_leads (legacy/manual Prospect score) |
| total_score | INTEGER | default 0 |
| scoring_details | JSON | nullable |
| calculated_at | DATETIME(3) | default CURRENT_TIMESTAMP(3) |
| tenant_id | INTEGER | |

### `email_campaigns`
Email campaign config with scheduling, segmentation, and aggregated metrics.

Key columns: `name`, `description`, `campaign_type`, `status` ('draft'), `email_template_id`, `sender_name`, `sender_email`, `reply_to_email`, `subject`, `email_html`/`email_text`, `send_date`, `time_zone` ('UTC'), `is_recurring` + `recurring_config` (JSON), `segment_filter` (JSON), and counters: `total_recipients`, `sent_count`, `delivered_count`, `opened_count`, `clicked_count`, `bounced_count`, `unsubscribed_count`, `created_by`, timestamps, `tenant_id`.

**Relationships:** FK to `email_templates`; referenced by `campaign_recipients`, `campaign_email_sends`, `campaign_list_assignments`.

### `campaign_recipients`
Recipients of a campaign with personalization and send status.

Key columns: `campaign_id` (FK), `recipient_type`, `recipient_id`, `email`, `first_name`, `last_name`, `company`, `status` ('active'), `send_status` ('pending'), `personalization` (JSON), `added_at`, `tenant_id`.

**Relationships:** FK to `email_campaigns`; referenced by `campaign_email_sends`.

### `campaign_email_sends`
Individual send records with delivery + engagement timeline and tracking metadata.

Key columns: `campaign_id`, `recipient_id` (FK→campaign_recipients), `email`, `subject`, `email_html`/`email_text`, `send_status`, timeline (`sent_at`, `delivered_at`, `opened_at`, `first_opened_at`, `clicked_at`, `first_clicked_at`, `bounced_at`, `bounce_reason`, `unsubscribed_at`, `spam_reported_at`), `open_count`, `click_count`, `user_agent`, `ip_address`, `tracking_data` (JSON), `created_at`, `tenant_id`.

**Relationships:** FKs to `email_campaigns`, `campaign_recipients`; referenced by `email_click_events`.

### `email_lists`
Segmented distribution lists with member counts and dynamic criteria.

Key columns: `name`, `description`, `list_type`, `is_active`, `total_contacts`, `active_contacts`, `segment_criteria` (JSON), `created_by`, timestamps, `tenant_id`.

**Relationships:** referenced by `email_list_subscriptions`, `campaign_list_assignments`.

### `email_list_subscriptions`
Individual subscriptions to an email list.

Key columns: `list_id` (FK), `subscriber_type`, `subscriber_id`, `email`, `first_name`, `last_name`, `company`, `status` ('subscribed'), `source`, `subscribed_at`, `unsubscribed_at`, `tags` (JSON), `tenant_id`.

### `campaign_list_assignments`
Junction linking campaigns to email lists.

| Column | Type | Notes |
|---|---|---|
| id | INTEGER | PK |
| campaign_id | INTEGER | FK→email_campaigns |
| list_id | INTEGER | FK→email_lists |
| assigned_at | DATETIME(3) | |
| tenant_id | INTEGER | |

### `email_click_events`
Per-link click tracking within sent emails.

Key columns: `email_send_id` (FK→campaign_email_sends), `link_url`, `link_text`, `clicked_at`, `ip_address`, `user_agent`, `referrer`, `tenant_id`.

### `email_unsubscribes`
Global unsubscribe registry with reasons/feedback.

Key columns: `email` (UNIQUE), `unsubscribed_at`, `unsubscribe_reason`, `campaign_id`, `feedback`, `is_global` (default true), `created_at`, `tenant_id`.

---

## Calendar, Meetings & Calls

### `calendar_events`
Calendar events with scheduling, recurrence, visibility, and reminders.

Key columns: `title`, `description`, `event_type`, `start_datetime`, `end_datetime`, `all_day`, `time_zone` ('UTC'), `location`, `meeting_link`, `related_record_id` + `related_type` (polymorphic), `status` ('scheduled'), `visibility` ('private'), `priority` ('medium'), `reminder_minutes`, `is_recurring` + `recurring_config` (JSON), `external_id`, `organizer_id` (FK→employees), timestamps, `tenant_id`.

**Relationships:** FK to `employees`; referenced by `calendar_attendees`, `meeting_notes`, `room_bookings`.

### `calendar_attendees`
Event attendees with RSVP and required/optional flags.

Key columns: `event_id` (FK), `attendee_type`, `attendee_id`, `external_name`, `external_email`, `response_status` ('pending'), `is_organizer`, `is_required` (default true), `responded_at`, `added_at`, `tenant_id`.

### `meeting_notes`
Notes, action items, and outcomes captured per event.

Key columns: `event_id` (FK), `notes`, `action_items` (JSON), `outcomes`, `follow_up`, `recorded_by`, timestamps, `tenant_id`.

### `meeting_rooms`
Bookable room resources with capacity/equipment.

Key columns: `name`, `location`, `capacity`, `equipment` (JSON), `is_active`, `description`, `booking_url`, `created_at`, `tenant_id`.

**Relationships:** referenced by `room_bookings`.

### `room_bookings`
Time-based room reservations.

Key columns: `room_id` (FK→meeting_rooms), `event_id` (FK→calendar_events), `booked_by` (FK→employees), `start_time`, `end_time`, `purpose`, `notes`, `status` ('confirmed'), `created_at`, `tenant_id`.

### `call_logs` *(removed — historical reference only)*
Legacy phone-call records. The Call Logs service/route were removed, and the `call_logs` table **and** its `CallLog`
Prisma model were **dropped** (migration `20260708120000_drop_orphaned_domains`). Call tracking is now handled via the
Activity Timeline (type: call). This entry is kept for historical reference only — the table no longer exists.

Former columns (historical): `related_to_id` + `related_to_type` (polymorphic), `phone_number`, `direction`, `duration_seconds`, `call_result`, `summary`, `next_action`, `recording_url`, `caller_name`, `logged_by`, `called_at`, timestamps, `tenant_id`.

---

## Reporting & Analytics

Five tables back the self-service reporting module — see
[REPORTING.md](REPORTING.md) for the engine and [Reports](../user-guide/19-reports.md)
for the user-facing feature. Every table carries a non-null tenant-scoped `tenant_id`
(FK → `tenants.id`, indexed).

> **Removed tables.** Earlier revisions of this document described `kpi_definitions`,
> `kpi_values`, `analytic_dashboards`, `analytic_widgets`, `dashboard_kpis`,
> `dashboard_shares` and `data_exports`. None of them exist in `schema.prisma` or in the
> database — they were pruned before any code used them, and their descriptions have been
> removed rather than left as specifications for tables nobody can query. Dashboard
> composition lives in `ui_dashboards` / `ui_dashboard_widgets` / `ui_charts` (see
> [UI Metadata & Low-Code Engine](#ui-metadata--low-code-engine)), and KPI-style figures are ordinary
> reports with the `kpi` visualization.
>
> The `data_exports` table described previously is likewise absent. It is not the same thing
> as [`data_export_requests`](#data_export_requests), which is a real model
> (`DataExportRequest`) covering GDPR data-portability requests, not report exports —
> report exports stream directly to the client and are not recorded in a table.

### `custom_reports`

A saved report definition. `data_source` holds the complete builder config and is the only
column the engine reads; `fields` / `filters` / `grouping` / `sorting` / `chart_config` are
**mirrors** kept for SQL readability and list queries.

Key columns: `name`, `description`, `report_type` (table | chart | pivot | summary, derived
from `data_source.viz`), `category`, `data_source` (JSON — the config), `fields` /
`filters` / `grouping` / `sorting` / `chart_config` (JSON mirrors), `visibility`
(private | team | shared | everyone), `shared_with` (JSON — role names / employee IDs,
consulted only when `visibility = 'shared'`), `is_shared` (legacy boolean, kept in step),
`folder_id` (FK → `report_folders`, `ON DELETE SET NULL`), `is_scheduled` (denormalised
"has ≥1 active subscription"), `last_run_at`, `created_by`, timestamps, `tenant_id`.

Legacy / unused: `schedule_config` (superseded by `report_subscriptions`),
`refresh_frequency`, `cache_expires_at`, and `cached_result` — the last of which
briefly received the full result of every run (a JSON blob of up to 20 000 rows,
written on every view and never read back). That write has been removed; only
`last_run_at` is stored.

Indexes: `(report_type, category)`, `created_by`, `is_shared`, `folder_id`, `tenant_id`.

**Relationships:** `created_by`→employees (by convention, no FK); belongs to one
`report_folders`; has many `report_executions`, `report_subscriptions`, `report_favorites`
(all cascade on delete).

### `report_executions`

Per-run log, used for run history and performance monitoring.

Key columns: `report_id` (FK, cascade), `executed_by` (**NULL = scheduled run**),
`execution_time` (ms), `status` (success | error | timeout | cancelled), `result_rows`,
`error_message`, `filters_used` (JSON — records the scope and any overrides applied),
`cache_hit`, `executed_at`, `tenant_id`.

Indexes: `report_id`, `executed_at`, `status`, `tenant_id`.

### `report_folders`

A folder a report can be filed in, so a growing library stays navigable. Self-referencing
for sub-folders; cycles are rejected in `ReportLibraryService.updateFolder`.

Key columns: `name`, `description`, `color`, `parent_id` (FK → self, `ON DELETE SET NULL`),
`order_index`, `created_by`, timestamps, `tenant_id`.

Indexes: `parent_id`, `tenant_id`.

**Deleting a folder never deletes reports** — contained reports are set to `folder_id = NULL`
and child folders are re-parented to the deleted folder's parent.

### `report_subscriptions`

One recurring emailed delivery of a report, **owned by an employee** — a business user
schedules their own reports with no admin involvement.

Key columns: `report_id` (FK, cascade), `employee_id` (the owner; always a recipient),
`frequency` (daily | weekdays | weekly | monthly), `hour` (0–23, local), `day_of_week`
(0–6, weekly only), `day_of_month` (1–28, monthly only), `format` (inline | xlsx | csv),
`recipients` (JSON — extra addresses, validated and capped at 25), `scope`
(me | team | all, clamped to the owner's role at send time), `subject`, `message`,
`is_active`, `last_sent_at`, `last_status` (sent | error | skipped), `last_error`,
`next_run_at`, timestamps, `tenant_id`.

Indexes: `report_id`, `employee_id`, **`(is_active, next_run_at)`** — the composite the
sweeper's due-query uses — and `tenant_id`.

`next_run_at` is the concurrency primitive: `sweepDue()` claims a row with
`updateMany({ where: { id, next_run_at: <the value it read> }, data: { next_run_at: null } })`,
so a second pod reading the same row updates 0 rows and skips it. It is recomputed after every
send, **including after a failure**, so one bad run cannot silently kill a schedule.

### `report_favorites`

Per-user starred report, giving each person their own shortlist.

Key columns: `report_id` (FK, cascade), `employee_id`, `created_at`, `tenant_id`.

Constraints: UNIQUE `(report_id, employee_id)` — the upsert target. Indexes: `employee_id`,
`tenant_id`.

## Contracts & CLM

### `contracts`
Contract lifecycle records (creation → active → renewal) with value, terms, legal review, and signature status.

Key columns: `contract_number` (UNIQUE), `title`, `contract_type`, `status` ('draft'), `priority` ('medium'), `related_opportunity_id`/`related_account_id`/`related_contact_id` (FKs to CRM), `value` (DECIMAL 18,2), `currency`, `start_date`/`end_date`, `auto_renewal`, `renewal_period`, `renewal_notice_days` (30), `payment_terms`, `billing_frequency`, `contract_terms`, `legal_review_required`, `legal_reviewer_id`, `legal_review_status`, `legal_review_notes`, `template_id` (FK→contract_templates), `document_url`, `signature_status` ('pending'), `signed_date`, `created_by`, `owner_id`, timestamps, `tenant_id`.

**Relationships:** FKs to `crm_opportunities`, `crm_accounts`, `crm_contacts`, `contract_templates`, `employees`. Parent for approvals, signatures, milestones, amendments, renewals.

### `contract_templates`
Reusable contract templates with predefined terms and versioning.

Key columns: `name`, `category`, `description`, `template_content` (LONGTEXT), `variables` (JSON), `approval_required`, `default_terms` (JSON), `legal_approved`, `version`, `is_active`, `created_by`, timestamps, `tenant_id`.

### `contract_approvals`
Sequential approval workflow stages for contracts.

Key columns: `contract_id` (FK), `approver_id` (FK→employees), `approval_stage` (Legal/Finance/Executive), `status` ('pending'), `approval_level` (default 1), `required`, `comments`, `conditions` (JSON), `approved_at`, `due_date`, `delegated_to_id`, `notification_sent`, timestamps, `tenant_id`.

### `contract_signatures`
Signature collection tracking per signer.

Key columns: `contract_id` (FK), `signer_name`, `signer_email`, `signer_role`, `signature_order` (default 1), `status` ('pending': viewed/signed/declined), `signature_method`, `signature_url`, `ip_address`, `signature_data`, `invited_at`/`viewed_at`/`signed_at`, `declined_reason`, `is_required`, `created_at`, `tenant_id`.

### `contract_milestones`
Key milestones/deliverables, optionally payment-triggering.

Key columns: `contract_id` (FK), `name`, `description`, `due_date`, `status` ('pending'), `completion_criteria`, `deliverables` (JSON), `assigned_to`, `completion_notes`, `payment_trigger` (BOOLEAN), `payment_amount`, `completed_at`, `order_index`, timestamps, `tenant_id`.

### `contract_amendments`
Changes/amendments to contracts with old/new value capture.

Key columns: `contract_id` (FK), `amendment_number`, `title`, `description`, `change_type`, `effective_date`, `old_values`/`new_values` (JSON), `reason`, `status` ('draft'), `requested_by`, `approved_by`, `document_url`, timestamps, `tenant_id`.

### `contract_renewals`
Renewal workflow with new terms and link to the renewed contract.

Key columns: `contract_id` (FK), `renewal_type` (auto/conditional/manual), `renewal_period`, `new_start_date`/`new_end_date`, `new_value`, `rate_change_percent`, `status` ('pending'), `terms_changed`, `new_terms`, `approval_required`, `notice_sent_date`, `decision_due_date`, `executed_date`, `new_contract_id` (FK→contracts), `notes`, `created_by`, timestamps, `tenant_id`.

---

## Deals, Territories & Sales Teams

### `deal_stages`
Sales pipeline stage definitions for opportunities.

Key columns: `name` (UNIQUE), `stage_order` (UNIQUE), `probability`, `is_closed`, `is_won`, `required_fields` (JSON), `typical_duration` (days), `stage_criteria`, `exit_criteria`, `category`, `color` ('#6366f1'), `is_active`, timestamps, `tenant_id`.

### `deal_stage_history`
Opportunity stage-transition history.

Key columns: `opportunity_id` (FK→crm_opportunities), `from_stage_id`/`to_stage_id` (FK→deal_stages), `from_probability`/`to_probability`, `days_in_prev_stage`, `changed_by`, `change_reason`, `notes`, `changed_at`, `tenant_id`.

### `deal_competitors`
Competitor intelligence per opportunity.

Key columns: `opportunity_id` (FK), `competitor_name`, `product_solution`, `strength`, `weakness`, `pricing_intel`, `status` ('active'), `win_probability`, `threat_level` ('medium'), `last_activity`, `intelligence_source`, `added_by`, timestamps, `tenant_id`.

### `territories`
Geographic/segment-based sales territories (hierarchical).

Key columns: `name`, `territory_code` (UNIQUE), `territory_type` (geographic/account/segment), `description`, `parent_territory_id` (self-FK), `geographic_data`/`industry_focus`/`account_criteria` (JSON), `annual_quota`, `quota_currency`, `manager_id`, `is_active`, `effective_from`/`effective_to`, `created_by`, timestamps, `tenant_id`.

**Relationships:** self-referential; FKs to `employees`. Parent for assignments, members, rules, performances.

### `territory_assignments`
Assignment of records (accounts/contacts/leads/opportunities) to territories.

Key columns: `territory_id` (FK), `record_type` + `record_id` (polymorphic), `assignment_method` (manual/rule/ai), `assignment_rule_id` (FK→territory_rules), `confidence_score`, `assigned_by`, `effective_from`/`effective_to`, `is_active`, `notes`, timestamps, `tenant_id`. UNIQUE (territory_id, record_type, record_id, effective_from).

### `territory_members`
Employees assigned to territories with quota share and commission.

Key columns: `territory_id` (FK), `employee_id` (FK), `member_role`, `role_type` (primary/secondary/support), `quota_percentage`, `commission_rate` (DECIMAL 5,4), `start_date`/`end_date`, `is_active`, `can_reassign`, `permissions` (JSON), `added_by`, timestamps, `tenant_id`. UNIQUE (territory_id, employee_id, start_date).

### `territory_rules`
Auto-assignment rules mapping records to territories.

Key columns: `territory_id` (FK), `rule_name`, `object_type`, `conditions` (JSON), `priority`, `is_active`, `effective_from`/`effective_to`, `created_by`, timestamps, `tenant_id`.

### `territory_performances`
Aggregated performance metrics per territory and period.

Key columns: `territory_id` (FK), `period_start`/`period_end`, `period_type`, `quota_amount`, `revenue_actual`, `revenue_pipeline`, `deals_won`/`deals_lost`, `new_accounts`, `activities_completed`, `lead_conversion_rate`, `avg_deal_size`, `sales_cycle_days`, `quota_attainment`, `rank`, `metrics_data` (JSON), `calculated_at`, `tenant_id`. UNIQUE (territory_id, period_type, period_start, period_end).

### `sales_teams`
Sales team org structure and settings (hierarchical).

Key columns: `name`, `team_code` (UNIQUE), `team_type` (field/inside/support), `description`, `manager_id` (FK→employees), `parent_team_id` (self-FK), `territory_focus`/`product_focus` (JSON), `market_segment`, `annual_quota`, `quota_currency`, `commission_plan` (JSON), `meeting_cadence`, `kpi_targets` (JSON), `is_active`, `created_by`, timestamps, `tenant_id`.

### `sales_team_members`
Members of sales teams with quota and commission.

Key columns: `team_id` (FK), `employee_id` (FK), `member_role`, `is_team_lead`, `individual_quota`, `commission_rate` (DECIMAL 5,4), `start_date`/`end_date`, `is_active`, `performance_tier`, `mentoring_role`, `specializations` (JSON), `added_by`, timestamps, `tenant_id`. UNIQUE (team_id, employee_id, start_date).

### `team_meetings`
Sales team meetings and cadences.

Key columns: `team_id` (FK), `meeting_type` (1on1/standup/forecast/all-hands), `title`, `meeting_date`, `duration_minutes` (60), `location`, `meeting_link`, `agenda`, `notes`, `action_items`/`attendees`/`metrics_reviewed` (JSON), `decisions_made`, `next_meeting`, `organizer_id`, timestamps, `tenant_id`.

### `team_performances`
Aggregated performance metrics per sales team and period.

Key columns: `team_id` (FK), `period_start`/`period_end`, `period_type`, `quota_amount`, `revenue_actual`, `revenue_pipeline`, `deals_won`/`deals_lost`, `activities_logged`, `avg_deal_size`, `sales_velocity`, `quota_attainment`, `activity_score`, `collaboration_score`, `top_performer_id`, `improvement_areas`/`achievements` (JSON), `calculated_at`, `tenant_id`. UNIQUE (team_id, period_type, period_start, period_end).

---

## Customer Portal & Service

### `customer_portal_users`
Customer self-service portal accounts with authentication and CRM linkage.

Key columns: `contact_id` (UNIQUE FK→crm_contacts), `account_id` (FK→crm_accounts), `email` (UNIQUE), `password_hash`, `first_name`, `last_name`, `phone`, `company`, `job_title`, `role` ('user'), `permissions` (JSON), `last_login_at`, `login_attempts`, `is_locked`, `is_verified`, `verification_token` (UNIQUE), `reset_token` (UNIQUE) + `reset_token_expires`, `preferences` (JSON), `timezone` ('UTC'), `language` ('en'), `is_active`, `created_by`, timestamps, `tenant_id`.

**Relationships:** FKs to `crm_contacts`, `crm_accounts`. Parent for portal sessions, customer cases, service requests, feedback, downloads, article feedback.

### `portal_sessions`
Active portal user sessions.

Key columns: `id` VARCHAR(128) PK (session token), `user_id` (FK→customer_portal_users), `ip_address`, `user_agent`, `login_method`, `location`, `is_active`, `expires_at`, `last_activity`, `created_at`, `tenant_id`.

### `customer_cases`
Support cases created via the portal, optionally linked to an internal CRM case.

Key columns: `case_number` (UNIQUE), `user_id` (FK→customer_portal_users), `related_crm_case_id` (UNIQUE FK→crm_cases), `subject`, `description`, `category`, `priority` ('medium'), `status` ('open'), `source` ('portal'), `product_area`, `attachment_urls` (JSON), `internal_notes`, `resolution`, `satisfaction_rating` (1–5), `satisfaction_feedback`, `assigned_to`, `resolved_at`/`closed_at`/`escalated_at`, `sla_due_date`, timestamps, `tenant_id`.

**Relationships:** FKs to `customer_portal_users`, `crm_cases`; parent for `case_messages`, `case_escalations`.

### `case_messages`
Message thread between customer and support on a case.

Key columns: `case_id` (FK), `sender_type` (customer/support/system), `sender_id`, `sender_name`, `message`, `is_internal`, `attachments` (JSON), `message_type` ('text'), `read_by_customer`, `read_by_support`, `created_at`, `tenant_id`.

### `case_escalations`
Escalation history for customer cases.

Key columns: `case_id` (FK), `escalated_from`, `escalated_to`, `escalation_reason`, `escalation_level` (level_1/2/3), `notes`, `status` ('pending'), `resolved_at`, `escalated_at`, `tenant_id`.

### `service_requests`
Customer requests for services (document requests, data exports, access).

Key columns: `user_id` (FK), `request_type`, `title`, `details` (JSON), `status` ('pending'), `approval_required`, `approved_by`, `processed_by`, `approval_notes`, `completion_data` (JSON), `completed_at`, `expires_at`, timestamps, `tenant_id`.

### `knowledge_articles`
Knowledge-base articles with SEO and engagement metrics.

Key columns: `title`, `slug` (UNIQUE), `content` (LONGTEXT), `summary`, `category_id` (FK→knowledge_categories), `tags` (JSON), `is_published`, `is_featured`, `is_internal`, `view_count`, `helpful_votes`, `unhelpful_votes`, `search_keywords`, `related_articles` (JSON), `author_id`, `last_reviewed`, `review_due`, `version`, `meta_title`, `meta_description`, timestamps, `tenant_id`.

**Relationships:** FK to `knowledge_categories`; parent for `article_feedback`, `article_attachments`.

### `knowledge_categories`
Hierarchical categories for KB articles.

Key columns: `name`, `slug` (UNIQUE), `description`, `parent_id` (self-FK), `icon`, `color`, `sort_order`, `is_visible`, timestamps, `tenant_id`.

### `article_feedback`
Ratings/feedback on KB articles (can be anonymous).

Key columns: `article_id` (FK), `user_id` (FK→customer_portal_users, nullable), `rating` (1–5), `is_helpful`, `feedback`, `visitor_id`, `ip_address`, `created_at`, `tenant_id`.

### `article_attachments`
Files attached to KB articles.

Key columns: `article_id` (FK), `filename`, `file_path`, `file_size`, `mime_type`, `description`, `is_downloadable`, `download_count`, `uploaded_by`, `created_at`, `tenant_id`.

### `customer_feedback`
General feedback/satisfaction surveys with multi-dimensional ratings.

Key columns: `user_id` (FK), `feedback_type`, `related_id` + `related_type` (polymorphic), `rating_overall`/`rating_quality`/`rating_speed`/`rating_ease` (1–5), `comments`, `improvement_suggestions`, `would_recommend` (NPS), `contact_permission`, `is_public`, `sentiment`, `follow_up_required`, `follow_up_notes`, `created_at`, `tenant_id`.

### `portal_downloads`
Audit log of portal downloads.

Key columns: `user_id` (FK), `item_type`, `item_id`, `item_name`, `file_path`, `file_size`, `ip_address`, `user_agent`, `created_at`, `tenant_id`.

---

## Social Media

### `social_media_accounts`
Connected social accounts for monitoring, posting, and lead-gen, with OAuth tokens.

Key columns: `platform`, `account_name`, `account_id` (platform ID), `display_name`, `profile_url`, `follower_count`/`following_count`/`post_count`, `account_type`, `verification_status`, `connection_status` ('active'), `access_token`/`refresh_token`/`token_expires_at`, `last_sync_at`, `sync_frequency` ('daily'), `auto_monitoring`, `managed_by`, `is_active`, timestamps, `tenant_id`.

**Relationships:** many-to-many with `social_media_campaigns` (via `_SocialMediaAccountToSocialMediaCampaign`); parent for posts, mentions, engagements.

### `social_media_posts`
Published/scheduled posts with promotion and performance metrics.

Key columns: `account_id` (FK), `platform_post_id`, `post_type`, `content`, `media_urls`/`hashtags`/`mentions` (JSON), `engagement_metrics` (JSON), `post_url`, `is_promoted` + `promotion_budget`, `target_audience` (JSON), `reach`, `impressions`, `click_through_rate`, `lead_generated`, `published_at`/`scheduled_for`, `status` ('draft'), `created_by`, timestamps, `tenant_id`.

### `social_media_mentions`
Brand/company mentions across platforms with sentiment and response workflow.

Key columns: `account_id` (FK, nullable), `platform`, `mention_type`, `content`, `author_name`/`author_handle`/`author_profile`, `follower_count`, `post_url`, `sentiment` (positive/neutral/negative), `sentiment_score` (-1.0–1.0), `influence_score`, `reach_estimate`, `keywords_matched` (JSON), `is_verified_author`, `requires_response`, `response_priority` ('medium'), `assigned_to`, `response_sent` + `response_content` + `response_sent_at`, `mentioned_at`, `processed_at`, `created_at`, `tenant_id`.

### `social_media_engagements`
Likes/comments/shares/follows on posts, with lead-potential scoring.

Key columns: `account_id` (FK), `post_id` (FK), `platform`, `engagement_type`, `user_handle`/`user_name`/`user_profile`, `content`, `engagement_url`, `is_lead_potential`, `lead_score`, `user_follower_count`, `engagement_value`, `occurred_at`, `processed_at`, `created_at`, `tenant_id`.

### `social_media_campaigns`
Social marketing campaigns with goals, budgets, schedule, and ROI.

Key columns: `name`, `description`, `campaign_type`, `objective`, `target_audience` (JSON), `budget_total`/`budget_daily`, `currency`, `start_date`/`end_date`, `platforms` (JSON), `content_themes`/`hashtag_strategy`/`posting_schedule`/`success_metrics` (JSON), `status` ('planning'), `performance_summary` (JSON), `lessons_learned`, `roi`, `lead_conversion_rate`, `created_by`, `manager_id`, timestamps, `tenant_id`.

**Relationships:** many-to-many with `social_media_accounts`; parent for `social_media_leads`.

### `social_media_leads`
Leads sourced from social interactions, with UTM tracking and CRM sync.

Key columns: `campaign_id` (FK), `platform`, `source_type`, `source_url`, `user_handle`/`user_profile`/`display_name`, `email`, `phone`, `company`, `job_title`, `location`, `bio_keywords` (JSON), `follower_count`, `verified_account`, `engagement_history` (JSON), `lead_score`, `interest_indicators` (JSON), `conversion_action`, UTM fields (`utm_source`/`utm_medium`/`utm_campaign`/`utm_content`), `crm_lead_id` (UNIQUE FK→crm_leads), `status` ('new'), `qualification_notes`, `assigned_to`, `converted_at`, `discovered_at`, timestamps, `tenant_id`.

### `social_listening_keywords`
Keywords/phrases monitored across platforms (brand, competitor, industry, product).

Key columns: `keyword`, `keyword_type`, `category`, `match_type` ('contains'), `platforms` (JSON), `is_case_sensitive`, `exclude_own_mentions` (default true), `alert_threshold`, `priority` ('medium'), `is_active`, `created_by`, timestamps, `tenant_id`.

### `competitor_social_activities`
Tracking of competitor social-media activity for competitive intelligence.

Key columns: `competitor_name`, `platform`, `account_handle`, `activity_type`, `content_summary`, `content_url`, `engagement_metrics`/`campaign_insights` (JSON), `competitive_impact`, `response_needed`, `response_plan`, `detected_at`, `analyzed_at`, `created_at`, `tenant_id`.

### `_SocialMediaAccountToSocialMediaCampaign`
Prisma implicit many-to-many join table.

| Column | Type | Notes |
|---|---|---|
| A | INTEGER | FK→social_media_accounts(id), cascade delete |
| B | INTEGER | FK→social_media_campaigns(id), cascade delete |

### `social_assignment_rules`
Routing rules for social mentions/engagements to team members. *(from `add_social_assignment_rules`)*

Key columns: `platform` (nullable = all), `name`, `rule_type` (direct/round_robin/skill_based/load_balanced), `conditions` (JSON), `assignee_id`, `pool_ids` (JSON), `fallback_id`, `order_index`, `is_active`, `last_index` (round-robin state), `created_by`, timestamps, `tenant_id`.

---

## Partners & Channel

### `partners`
Partner organizations in reseller/channel programs with tier, commercial terms, and performance.

Key columns: `partner_code` (UNIQUE), `company_name`, `legal_name`, `partner_type` (reseller/distributor/integrator/technology), `partner_tier` (gold/silver/bronze/standard), `status` ('prospect'), `business_model`, `primary_industry`, `geographic_coverage` (JSON), `website`, `headquarters_country`/`headquarters_city`, `employee_count`, `annual_revenue`, `revenue_currency`, `partnership_start_date`, `contract_end_date`, `contract_terms`, `commission_rate` (DECIMAL 5,4), `discount_level`, `credit_limit`, `payment_terms`, `certifications`/`specializations` (JSON), `portal_access`, `marketing_enabled`, `lead_sharing_enabled`, `performance_score`, `last_activity_date`, `account_manager_id`, `onboarding_status`, `notes`, `created_by`, timestamps, `tenant_id`.

**Relationships:** parent (cascade) for contacts, opportunities, performances, certifications, marketing activities, portal users, lead shares, channel conflicts.

### `partner_contacts`
Contacts at partner organizations.

Key columns: `partner_id` (FK, cascade), `first_name`, `last_name`, `email`, `phone`, `mobile`, `job_title`, `department`, `role_type` (executive/manager/technical/administrative), `is_primary`, `decision_maker`, `portal_access`, `communication_preferences`/`specializations` (JSON), `last_contacted`, `is_active`, timestamps, `tenant_id`.

### `partner_opportunities`
Deals registered by / shared with partners.

Key columns: `partner_id` (FK), `opportunity_id` (UNIQUE FK→crm_opportunities), `deal_registration_id` (UNIQUE), `customer_name`, `customer_contact`, `estimated_value`, `currency`, `partner_role`, `collaboration_type` (co-sell/resale/referral), `revenue_split` (JSON), `expected_close_date`, `stage`, `probability`, `competitive_situation`, `partner_investment`, `support_needed`, `status` ('active'), `win_reason`/`loss_reason`/`lessons_learned`, `registered_by`, `approved_by`, `registered_at`, `closed_at`, `tenant_id`.

### `partner_performances`
Performance metrics/rankings per partner and period.

Key columns: `partner_id` (FK), `period_start`/`period_end`, `period_type`, `deals_registered`/`deals_won`/`deals_lost`, `revenue_generated`/`revenue_influenced`, `commission_earned`, `certification_count`, `training_hours`, `marketing_activities`, `lead_referrals_sent`/`lead_referrals_converted`, `customer_satisfaction`, `partner_satisfaction`, `activity_score`, `engagement_level`, `performance_trend`, `ranking`, `goal_attainment`, `key_achievements`/`improvement_areas` (JSON), `calculated_at`, `tenant_id`.

### `partner_certifications`
Certifications earned by partners/contacts.

Key columns: `partner_id` (FK), `contact_id` (FK→partner_contacts), `certification_name`, `certification_type`, `certification_level`, `issuing_body`, `badge_url`, `earned_date`, `expiry_date`, `renewal_required`, `credits_earned`, `score_achieved`, `training_hours`, `status` ('active'), `verified_by`, `notes`, `created_at`, `tenant_id`.

### `partner_marketing_activities`
Co-marketing/joint marketing activities.

Key columns: `partner_id` (FK), `activity_name`, `activity_type` (webinar/event/whitepaper/case_study/email_campaign), `description`, `target_audience`, `geographic_scope` (JSON), `start_date`/`end_date`, budgets (`budget_total`/`budget_partner_share`/`budget_our_share`), `currency`, `expected_leads`/`expected_revenue`, `actual_leads`/`actual_revenue`, `partner_satisfaction`/`our_satisfaction`, `success_metrics` (JSON), `lessons_learned`, `status` ('planned'), `approval_status` ('pending'), `approved_by`, `managed_by`, `created_by`, timestamps, `tenant_id`.

### `partner_portal_users`
Partner-portal login accounts.

Key columns: `partner_id` (FK), `contact_id` (UNIQUE FK→partner_contacts), `username` (UNIQUE), `email` (UNIQUE), `password_hash`, `first_name`, `last_name`, `role`, `permissions` (JSON), `is_approved` + `approved_by`/`approved_at`, `last_login_at`, `login_count`, `is_locked`, `failed_attempts`, `must_change_password` (default true), `portal_preferences`/`notification_settings` (JSON), `is_active`, `created_by`, timestamps, `tenant_id`.

### `partner_lead_shares`
Leads shared to/from partners with acceptance, outcome, and commission tracking.

Key columns: `partner_id` (FK), `lead_id`, `share_type`, `lead_source`, `customer_industry`, `deal_size_estimate`, `partner_role`, `exclusivity` ('none') + `exclusivity_expires`, `revenue_split` (JSON), `requirements`, `acceptance_deadline`, `acceptance_status` ('pending') + `acceptance_reason`, `follow_up_required`, `last_activity`, `outcome` (won/lost/cancelled/transferred), `outcome_revenue`, `commission_paid`, `feedback_score`, `feedback_notes`, `shared_by`, `shared_at`, `updated_at`, `tenant_id`.

### `channel_conflicts`
Channel-conflict management for overlapping territories/customers between partners.

Key columns: `conflict_type`, `priority` ('medium'), `status` ('reported'), `customer_name`, `deal_value`, `currency`, `primary_partner_id` (FK→partners), `secondary_partner_id` (not a FK, for flexibility), `territory_disputed`, `reported_by`, `assigned_to`, `description`, `impact_assessment`, `resolution_strategy`/`resolution_details`, `escalation_level` (default 1), `escalation_reason`, `sla_due_date`, `customer_impact`, `prevention_measures`, `lessons_learned`, `resolved_at`, timestamps, `tenant_id`.

---

## Multi-Tenant Platform & Administration

### `tenants`
Top-level tenant (customer) accounts with plan, limits, branding, and billing config.

Key columns: `name`, `slug` (UNIQUE), `domain` (UNIQUE), `industry`, `plan` ('free'), `status` ('active'), `trial_ends_at`, `suspended_at`/`suspended_reason`, `deleted_at` (soft delete), limits `max_users` (5)/`max_storage_mb` (500)/`max_api_calls` (10000), `logo_url`, `primary_color`, `timezone` ('UTC'), `locale` ('en'), `billing_email`, `billing_address` (JSON), `metadata` (JSON), `created_by`, timestamps.

**Relationships:** one-to-many with `tenant_configs`, `tenant_usage`, `tenant_feature_overrides`, `api_rate_limits`, `security_policies`, `data_export_requests`, `push_notification_logs`; referenced platform-wide via `tenant_id`.

### `tenant_configs`
Per-tenant key-value configuration.

Key columns: `tenant_id` (FK), `config_key`, `config_value` (TEXT), `updated_by`, timestamps. UNIQUE (tenant_id, config_key).

### `tenant_usage`
Usage metrics per tenant (API calls, storage, users) by period.

Key columns: `tenant_id` (FK), `metric`, `value` (DECIMAL 18,2), `period`, `period_type` (monthly/weekly/daily/hourly), `recorded_at`. UNIQUE (tenant_id, metric, period, period_type).

### `subscription_plans`
Product/pricing tiers with feature sets and limits.

Key columns: `name` (UNIQUE), `label`, `description`, `price_monthly`/`price_annual` (DECIMAL 10,2), `currency`, limits (`max_users`, `max_storage_mb`, `max_api_calls`, `max_records`, `max_workflows`, `max_dashboards`), `features`/`limits` (JSON), `is_active`, `trial_days` (14), `order_index`, timestamps.

**Relationships:** referenced by `tenants.plan` and `api_rate_limits.plan_name`.

### `feature_flags`
Global feature toggles with gradual rollout.

Key columns: `name` (UNIQUE), `label`, `description`, `category` ('general'), `is_enabled`, `rollout_percent` (0–100), `config` (JSON), `created_by`, timestamps.

**Relationships:** one-to-many with `tenant_feature_overrides`.

### `tenant_feature_overrides`
Per-tenant override of a global feature flag.

Key columns: `tenant_id` (FK), `flag_id` (FK→feature_flags), `is_enabled`, `config` (JSON), `updated_by`, timestamps. UNIQUE (tenant_id, flag_id).

### `platform_audit_logs`
Immutable log of platform-level admin actions.

Key columns: `admin_id` (FK→employees), `action`, `target_type`, `target_id`, `details` (JSON), `ip_address`, `user_agent`, `created_at` (indexed).

### `system_announcements`
Platform-wide announcements with targeting and scheduling.

Key columns: `title`, `message`, `severity` ('info': info/warning/error/success), `type` ('banner'), `target` ('all': all/admins/specific_tenants), `target_ids` (JSON), `action_url`/`action_label`, `is_active`, `is_dismissible`, `active_from`/`active_to`, `created_by`, timestamps.

### `impersonation_logs`
Audit trail of admin impersonation sessions.

Key columns: `admin_id` (FK→employees), `target_user_id` (FK→employees), `target_tenant_id` (FK→tenants), `reason`, `started_at`/`ended_at`, `actions_taken` (JSON), `ip_address`.

### `api_rate_limits`
Rate-limit configuration per plan or tenant.

Key columns: `name`, `plan_name` (→subscription_plans.name), `tenant_id` (FK), `endpoint_pattern`, `requests_per_minute` (60)/`requests_per_hour` (1000)/`requests_per_day` (10000), `burst_limit` (100), `is_active`, timestamps.

### `security_policies`
Per-tenant (or platform-default) security requirements.

Key columns: `tenant_id` (FK, nullable = platform default), `require_mfa`, password rules (`password_min_length` 8, `password_require_upper`, `password_require_number`, `password_require_special`, `password_expiry_days`), `max_login_attempts` (5), `lockout_duration_min` (30), `session_timeout_min` (480), `ip_allowlist`/`ip_blocklist`/`allowed_domains` (JSON), `force_password_reset`, `is_active`, `updated_by`, timestamps.

### `data_export_requests`
Tenant/user data export requests (GDPR / data portability).

Key columns: `tenant_id` (FK, nullable), `requested_by` (FK→employees), `export_type`, `scope` (JSON), `status` ('pending'), `file_path`, `file_size` (BIGINT), `error`, `expires_at`, `completed_at`, timestamps.

### `push_notification_logs`
Records of push notifications sent to tenants/users.

Key columns: `title`, `body`, `link`, `target_type` (all/tenant/user/role), `target_value` (JSON), `recipient_count`, `sent_by` (FK→employees), `created_at`, `tenant_id` (FK).

---

## Insurance Core (Carriers, Policies, Underwriting, Claims)

### `insurance_carriers`
Master registry of insurance carriers with licensing and ratings.

Key columns: `name`, `code` (UNIQUE with tenant), `naic_code`, `am_best_rating`, `carrier_type` ('life'), `phone`, `email`, `website`, `is_active`, `created_by`, timestamps, `tenant_id`.

**Relationships:** has many carrier_products, insurance_policies, insurance_applications, commission_entries, producer_appointments, commission_statements, carrier_adapter_configs.

### `carrier_products`
Products offered by carriers with coverage and age limits.

Key columns: `carrier_id` (FK), `product_type`, `name`, `plan_code`, `description`, `min_coverage`/`max_coverage` (DECIMAL 18,2), `min_age`/`max_age`, `is_active`, timestamps, `tenant_id`.

### `insurance_policies`
Issued policies (active and historical).

Key columns: `record_id` (UNIQUE FK→records), `policy_number` (UNIQUE with tenant), `carrier_id`, `carrier_product_id`, `contact_id`, `account_id`, `agent_id` (FK→employees), `application_id` (UNIQUE FK→insurance_applications), `product_type`, `product_name`, `coverage_amount`, `premium_amount`, `premium_frequency` ('monthly'), `status` ('active': lapsed/surrendered/…), `effective_date`, `expiry_date`, `renewal_due_date` (indexed), `is_lapsed` + `lapsed_at` + `reinstated_at`, `surrender_value`, `death_benefit`, `last_payment_date`, `notes`, `created_by`, timestamps, `tenant_id`.

**Relationships:** FKs to carriers, products, CRM contact/account, employees, applications. Parent for beneficiaries, status history, claims, endorsements, renewal tasks, billing schedules, invoices, commission entries, compliance artifacts.

### `insurance_policy_beneficiaries`
Beneficiary designations with allocation percentages.

Key columns: `policy_id` (FK, cascade), `name`, `relationship`, `beneficiary_type` ('primary'/'contingent'), `allocation_pct` (default 100), `contact_id` (FK→crm_contacts), `date_of_birth`, `is_active`, timestamps, `tenant_id`.

### `insurance_policy_status_history`
Audit trail of policy status changes.

Key columns: `policy_id` (FK, cascade), `from_status`, `to_status`, `reason`, `changed_by`, `created_at`, `tenant_id`.

### `insurance_applications`
Applications submitted for underwriting/processing.

Key columns: `record_id` (UNIQUE), `app_number` (UNIQUE with tenant), `contact_id`, `account_id`, `agent_id`, `carrier_id`, `carrier_product_id`, `product_type`, `product_name`, `coverage_amount`, `premium_amount`, `status` ('submitted': pending_uw/approved/declined/…), `submitted_at`, `age`, `gender`, `is_smoker`, `height_in`, `weight_lbs`, plus **added by `add_missing_application_columns`**: `date_of_birth`, `health_class`, `payment_frequency`, `term_years`; `notes`, `created_by`, timestamps, `tenant_id`.

**Relationships:** FKs to carriers, products, CRM contact/account, employees, records. Parent for underwriting cases, policies, application documents, compliance artifacts, submission checklists, quote scenarios, commission entries.

### `application_documents`
Document uploads for applications. *(from `add_missing_application_columns`)*

Key columns: `application_id` (FK, cascade), `record_id` (UNIQUE), `document_ref`, `original_filename`, `stored_filename`, `category` (tax_return/medical_report/identity/…), `mime_type`, `file_size`, `file_path`, `file_hash`, `version` (default 1), `status` ('uploaded': reviewed/approved/rejected), `uploaded_by`/`uploaded_at`, `reviewed_by`/`reviewed_at`, `rejection_reason`, `notes`, timestamps, `tenant_id`.

### `underwriting_cases`
Underwriting decisions and medical underwriting per application.

Key columns: `case_number` (UNIQUE with tenant), `application_id` (UNIQUE FK, cascade), `assigned_underwriter` (FK→employees), `status` ('pending': approved/declined/suspended/…), `risk_class`, `bmi` (DOUBLE), `blood_pressure`, `cholesterol`, `medical_conditions`, `medications`, `family_history`, `decision_notes`, `decided_at`, timestamps, `tenant_id`.

**Relationships:** has many `underwriting_requirements`.

### `underwriting_requirements`
Documentation/info requests for underwriting cases.

Key columns: `case_id` (FK, cascade), `description`, `requirement_type` (medical_exam/financial_doc/…), `status` ('pending': received/waived), `due_date`, `received_at`, `notes`, timestamps, `tenant_id`.

### `insurance_claims`
Claims filed against policies, with FNOL and loss details.

Key columns: `record_id` (UNIQUE), `claim_number` (UNIQUE with tenant), `policy_id` (FK, cascade), `contact_id`, `claim_type` (death_claim/disability/surrender/…), `amount`, `status` ('filed': approved/denied/paid), `priority` ('medium'), `adjuster_id` (FK→employees), `filed_at`, `description`, `paid_at`, `paid_amount`, `denial_reason`. **Added by `insurance_ams_p0_p4`**: `fnol_received_at`, `loss_date`, `loss_description`, `loss_location`, `reporter_name`, `reporter_phone`, `reporter_relationship`, `is_fraud_flagged`, `is_litigation` + `litigation_details`, `reserve_amount`. Plus `created_by`, timestamps, `tenant_id`.

**Relationships:** FKs to policies, CRM contact, employees, records. Parent for claim_events, claim_reserves, claim_payment_events.

### `claim_events`
Event log for claim state transitions.

Key columns: `claim_id` (FK, cascade), `event_type` (filed/approved/denied/paid), `description`, `created_by`, `created_at`, `tenant_id`.

### `commission_entries`
Agent commissions on policies/applications with reconciliation and splits.

Key columns: `agent_id` (FK→employees, restrict), `policy_id`, `application_id`, `carrier_id`, `product_type`, `source_premium`, `commission_rate` (DECIMAL 5,2), `commission_amount`, `commission_period` (YYYY-MM). **Added by `insurance_ams_p0_p4`**: `commission_type` ('first_year'), `expected_amount`, `statement_id` (FK→commission_statements), `variance`. Plus `status` ('pending': paid/reversed/clawed_back), `paid_at`, `clawback_reason`, `split_agent_id` (FK→employees), `split_percent`, `notes`, `created_by`, timestamps, `tenant_id`.

### `carrier_adapter_configs`
Per-carrier API integration configuration. *(from `carrier_adapter_config`)*

Key columns: `carrier_id` (UNIQUE FK, cascade), `adapter_type` ('simulated'/api/web_service), `api_base_url`, `api_key_env_var` (env var name, not the key), `timeout_ms` (10000), `is_enabled`, `environment` ('sandbox'/production), `supported_products` (JSON), `notes`, `last_health_check_at`, `health_status`, `health_detail`, timestamps.

---

## Insurance AMS (Compliance, Billing, Payments, Commissions)

> Tables from `insurance_ams_p0_p4` extending the insurance core with compliance, billing, payments, claims reserving, producer licensing, and commission reconciliation.

### `compliance_artifacts`
Compliance documents/evidence for regulatory requirements (KYC, disclosures, signatures) with retention.

Key columns: `artifact_type` (kyc_doc/disclosure/signature/…), `contact_id`, `application_id`, `policy_id`, `document_id` (FK→documents), `status` ('pending': completed/expired), `completed_at`, `expires_at`, `signed_by`, `signature_ip`, `retention_until`, `metadata` (JSON), `notes`, `created_by`, timestamps, `tenant_id`.

### `submission_checklists`
Per-application checklist of required documents/requirements.

Key columns: `application_id` (FK, cascade), `item_name`, `item_type`, `is_required` (default true), `status` ('pending': received/waived), `document_id` (FK→documents), `received_at`, `waived_by` + `waived_reason`, `notes`, timestamps, `tenant_id`.

### `policy_endorsements`
Post-issuance policy modifications (coverage/rider/beneficiary changes).

Key columns: `endorsement_ref` (UNIQUE with tenant), `policy_id` (FK, cascade), `endorsement_type`, `description`, `effective_date`, `status` ('pending': approved/applied), `old_values`/`new_values` (JSON), `premium_impact`, `approved_by`, `applied_at`, `notes`, `created_by`, timestamps, `tenant_id`.

### `renewal_tasks`
Renewal tracking/follow-up for approaching policy renewals.

Key columns: `policy_id` (FK, cascade), `agent_id`, `renewal_date`, `status` ('upcoming': in_progress/completed/lapsed), `outreach_count`, `last_contacted`, `renewal_premium`, `notes`, timestamps, `tenant_id`.

### `billing_schedules`
Billing frequency and terms per policy.

Key columns: `policy_id` (UNIQUE FK, cascade), `frequency` (monthly/quarterly/semi-annual/annual), `amount_due`, `next_due_date`, `auto_pay`, `grace_period_days` (31), `status` ('active': suspended/cancelled), timestamps, `tenant_id`.

**Relationships:** has many `policy_invoices`.

### `policy_invoices`
Invoices generated from billing schedules.

Key columns: `invoice_number` (UNIQUE with tenant), `billing_schedule_id` (FK, cascade), `policy_id` (FK, cascade), `amount`, `due_date`, `status` ('pending': paid/overdue/written_off), `paid_at`, timestamps, `tenant_id`.

**Relationships:** has many `policy_payments`.

### `policy_payments`
Payments received against invoices.

Key columns: `invoice_id` (FK, cascade), `payment_ref`, `amount`, `payment_method` (check/ACH/credit_card/wire), `payment_date`, `notes`, `created_by`, `created_at`, `tenant_id`.

### `claim_reserves`
Reserve amounts set aside for claim payments, tracked cumulatively.

Key columns: `claim_id` (FK, cascade), `reserve_type` (initial/increased/decreased/final), `amount`, `running_total`, `reason`, `created_by`, `created_at`, `tenant_id`.

### `claim_payment_events`
Individual claim payment events (partial/final).

Key columns: `claim_id` (FK, cascade), `payment_type` (advance/partial/final/supplemental), `amount`, `payee_name`, `payment_ref`, `payment_date`, `notes`, `created_by`, `created_at`, `tenant_id`.

### `producer_appointments`
Agent/producer appointments with carriers by state.

Key columns: `agent_id` (FK→employees, restrict), `carrier_id` (FK, cascade), `state_code`, `license_number`, `license_type` (life/health/property_casualty), `appointment_status` ('active': inactive/terminated), `appointed_at`, `expires_at`, `terminated_at`, `notes`, timestamps, `tenant_id`. UNIQUE (agent_id, carrier_id, state_code, tenant_id).

### `commission_statements`
Carrier-provided commission statements for reconciliation.

Key columns: `statement_ref` (UNIQUE with tenant), `carrier_id` (FK, cascade), `statement_period` (YYYY-MM), `received_date`, `total_expected`, `total_actual`, `variance`, `status` ('pending': reconciled/disputed), `reconciled_at`, `reconciled_by`, `notes`, `created_by`, timestamps, `tenant_id`.

**Relationships:** has many `commission_entries` (via `statement_id`).

---

## Status & Workflow Tracking

### `status_events`
Generic event log tracking status changes and milestones for any record. *(from `add_status_events`)*

| Column | Type | Notes |
|---|---|---|
| id | INTEGER | PK |
| record_id | INTEGER | FK→records (cascade) |
| status | VARCHAR(60) | current status value |
| title | VARCHAR(200) | event title/label |
| description | TEXT | event details |
| location | VARCHAR(200) | optional location |
| event_type | VARCHAR(30) | default 'milestone' (milestone, flag, alert, task_completed) |
| occurred_at | DATETIME(3) | default CURRENT_TIMESTAMP(3) |
| changed_by | VARCHAR(20) | user who triggered event |
| created_at | DATETIME(3) | |
| tenant_id | INTEGER | FK→tenants |

**Relationships:** FK to `records`; indexed on (record_id, occurred_at) for timeline queries. See [STATUS_TRACKER.md](STATUS_TRACKER.md) for usage.

---

## Appendix: Cross-Cutting Conventions

- **Multi-tenancy:** Nearly every table carries `tenant_id`; many uniqueness constraints are scoped per tenant (e.g., `policy_number`, `app_number`, `claim_number`, carrier `code`).
- **Polymorphic links:** Several tables use a `<thing>_type` + `<thing>_id` pair (e.g., `email_logs.related_type/related_record_id`, `crm_associations`, `territory_assignments`, `customer_feedback`) instead of hard FKs.
- **Typed records pattern:** CRM and insurance entities each own a row in the generic `records` table via a UNIQUE `record_id`, unifying assignment, activities, tasks, audit logs, and status events across all object types.
- **Money:** Monetary amounts use `DECIMAL(18,2)`; rates use `DECIMAL(5,2)` or `DECIMAL(5,4)`.
- **Timestamps:** `DATETIME(3)` (millisecond precision); `created_at` defaults to `CURRENT_TIMESTAMP(3)`.
- **JSON columns** store flexible config, metrics, and structured metadata throughout.
