# Database Schema Reference

<!-- nav:top -->
> **[Docs roadmap](../README.md)** › **[Developer guide](README.md#core-reading-in-order)** › 2 of 9 · **For:** Engineers
> ← [Architecture & setup](architecture-and-setup.md) · [Data dictionary](data-dictionary.md) →
> New to Genesis? Background: [Understanding Genesis › How data is stored and read](../understanding/03-how-data-is-stored.md)
<!-- /nav:top -->

> **Start here if you are new:** [Understanding Genesis › How data is stored and read](../understanding/03-how-data-is-stored.md)
> explains the storage model in plain terms. This page is the column-level reference for the tables that exist today.

> **Source of truth:** [`backend/prisma/schema.prisma`](../../backend/prisma/schema.prisma) (99 models) and the migrations in
> [`backend/prisma/migrations/`](../../backend/prisma/migrations/). **Database engine:** MySQL 8.

This document describes every table in the database — what business information it stores, its columns/types, and how it relates to other tables. The platform is a **multi-tenant CRM**; almost every table carries a `tenant_id` for tenant isolation.

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
6. [Products](#products)
7. [Email, Documents & Lead Scoring](#email-documents--lead-scoring)
8. [Reporting & Analytics](#reporting--analytics)
9. [Social Media](#social-media)
10. [Multi-Tenant Platform & Administration](#multi-tenant-platform--administration)
11. [Status & Workflow Tracking](#status--workflow-tracking)
12. [SLA Engine](#sla-engine)
13. [Access Segmentation & Audit Chain](#access-segmentation--audit-chain)
14. [Sessions & Background Jobs](#sessions--background-jobs)

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
| tokens_valid_after | DATETIME(3) | nullable — tokens issued before this time are rejected (deactivation, password change, sign out everywhere) |
| mfa_enabled | BOOLEAN | NOT NULL, default false |
| mfa_secret | VARCHAR(255) | nullable — TOTP secret, stored encrypted (`enc:v1:`) |
| mfa_recovery | JSON | nullable — SHA-256 hashes of unused recovery codes |
| created_at | DATETIME(3) | NOT NULL, default CURRENT_TIMESTAMP(3) |
| updated_at | DATETIME(3) | NOT NULL |
| tenant_id | INTEGER | NOT NULL, indexed |

**Relationships:** FK to `branches` and `regions`; referenced widely as owner/creator/assignee across the schema (activities, tasks, notifications, audit_logs, assignment_rules, quotas, integrations, and most CRM tables).

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
Top-level modules organizing UI objects into business domains (e.g., CRM, Settings).

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
| category | VARCHAR(50) | NOT NULL, default 'crm' (added in `add_module_category`; values: crm, settings) |
| config | JSON | nullable (added in `module_config`) — e.g. `label_fr` |
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
| config | JSON | nullable — `title_field`, `business_unit_field`, `barrier_zone`, `barrier_zone_field` |
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
| config | JSON | nullable — `{ public: { success_message, consent_field, capture_fields, result_fields, field_options, expert_roles, stage, captcha, … } }` |
| public_key | VARCHAR(64) | nullable, UNIQUE — set only by the publish endpoint; the form is live at `/f/<key>` |
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
[Analytics · `/api/analytics`](api-reference.md#analytics--apianalytics).

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
Configurable pipelines (sales/business) for tracking objects through stages.

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

> The heart of the data model: `records` holds one envelope row per business record of any object, `record_field_values` one row per field value (EAV), plus shared activity/task/notification/audit tables. Every Genesis Capital object is stored this way.

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
| updated_by | VARCHAR(100) | nullable (added in `record_updated_by`) — who last edited, moved or bulk-changed the record |
| updated_at | DATETIME(3) | last modification |
| deleted_at | DATETIME(3) | nullable, indexed (added in `add_record_soft_delete`) — NULL = live; NOT NULL = in Trash (soft-deleted, hidden from users, admin-recoverable) |
| deleted_by | VARCHAR(100) | nullable (added in `add_record_soft_delete`) — actor who deleted it |
| business_unit_id | INTEGER | nullable, indexed, FK→business_units (SetNull) — stamped from the object's `business_unit_field` |
| barrier_zone_id | INTEGER | nullable, indexed, FK→barrier_zones (SetNull) — stamped from the object's `barrier_zone` / `barrier_zone_field` |
| tenant_id | INTEGER | multi-tenancy |

**Relationships:** Links to `ui_objects`, `employees` (assigned_to), `ui_pipeline_stages`. Parent for activities, tasks, audit_logs, record_field_values, and the typed CRM entities (one-to-one via their `record_id`).

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

### Where record data lives, and querying it with SQL

**Which table holds a record's fields** depends on the object's `ui_objects.name` (`MODEL_MAP` in
[`crm-storage-map.js`](../../backend/src/services/crm-storage-map.js)):

| Object name | Field data lives in |
|---|---|
| `lead`, `prospect` | `crm_leads` |
| `lead_intake` | `crm_lead_intake` |
| `contact` / `account` / `opportunity` / `case` | `crm_contacts` / `crm_accounts` / `crm_opportunities` / `crm_cases` |
| everything else | `record_field_values` |

The Genesis Capital workspace uses none of the names in the first rows, so **all of its business data is in `records` +
`record_field_values`** and the `crm_*` tables are empty (Oct 2026). Leads are object `enquiry` and clients are
`party`; [IMPLEMENTATION](../genesis-capital/implementation.md) lists the objects for each module.

**How values are written** (`toTypedValue`, used by `RecordService`):

- `str_value` is **always** populated, also for numbers, dates and booleans, alongside the typed column (`num_value`,
  `date_value`, `bool_value`, `json_value`). Use `str_value` when unsure and the typed column to sort, sum or compare.
- An empty field has no row at all.
- A `lookup` field stores the target record's `records.id` (in `num_value` and `str_value`); the target object is
  `ui_fields.config.target_object`.
- Fields with `config.encrypt` (e.g. `party.id_number`) hold `enc:v1:…` ciphertext in `str_value`, which SQL cannot
  read — see [PLATFORM_BUILDER_EXTENSIONS](engines/platform-builder-extensions.md#12-personal-data-protection).
- Soft-deleted records keep their values; filter `records.deleted_at IS NULL`.

**Recipes** (any SQL client — connection details in [INSTALLATION](../getting-started/installation.md)):

```sql
-- Record types with live record counts
SELECT o.id, o.name, o.label, COUNT(r.id) AS records
FROM ui_objects o JOIN records r ON r.object_id = o.id AND r.deleted_at IS NULL
GROUP BY o.id ORDER BY records DESC;

-- Fields of one object
SELECT f.name, f.label, f.field_type, f.config
FROM ui_fields f JOIN ui_objects o ON o.id = f.object_id
WHERE o.name = 'enquiry' ORDER BY f.order_index;

-- One row per record, fields as columns (here: leads). Add a MAX(CASE …) line per field.
SELECT r.id, r.created_at, r.created_by, r.assigned_to, s.label AS stage,
  MAX(CASE WHEN v.field_name = 'enquiry_no'   THEN v.str_value END) AS enquiry_no,
  MAX(CASE WHEN v.field_name = 'display_name' THEN v.str_value END) AS name,
  MAX(CASE WHEN v.field_name = 'email'        THEN v.str_value END) AS email,
  MAX(CASE WHEN v.field_name = 'channel'      THEN v.str_value END) AS channel,
  MAX(CASE WHEN v.field_name = 'score'        THEN v.num_value END) AS score
FROM records r
JOIN ui_objects o ON o.id = r.object_id AND o.name = 'enquiry'
LEFT JOIN ui_pipeline_stages s ON s.id = r.pipeline_stage_id
LEFT JOIN record_field_values v ON v.record_id = r.id
WHERE r.deleted_at IS NULL
GROUP BY r.id, s.label
ORDER BY r.created_at DESC;

-- Follow a lookup: the client (party) a lead converted into
SELECT enq.record_id AS enquiry_id, cli.str_value AS client_name
FROM record_field_values enq
JOIN record_field_values cli ON cli.record_id = enq.num_value AND cli.field_name = 'display_name'
WHERE enq.field_name = 'party';
```

`records.created_by` is `NULL` for records created by the public web form or an integration, and an employee ID (e.g.
`GCRM1`) for records staff created.

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
| stats | JSON | nullable; after execute `{ created, merged, skipped, failed, total }` |
| error_rows | JSON | nullable; after execute `[{ row, reason }]` (1-based, first 100) |
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

> **Not used by the Genesis Capital workspace.** A record's fields go to one of these tables only when its object is
> named exactly `lead`, `prospect`, `lead_intake`, `contact`, `account`, `opportunity` or `case`. Genesis Capital has no
> object with those names (its leads are `enquiry`, its clients `party`), so these tables are empty and all its data is in
> `records` + `record_field_values`. They remain for tenants that define those standard objects.
>
> Each typed CRM entity has a one-to-one `record_id` link to the `records` table, plus an `owner_id`/`created_by` employee reference.

### `crm_accounts`
Company/organizational accounts — businesses the company sells to.

Key columns: `name`, `website`, `phone`, `email`, `industry`, `account_type`, `annual_revenue` (DECIMAL 18,2), `employee_count`, full **billing address** (street/city/state/country/zip), `description`, `owner_id` (FK→employees), `external_id` (external system ID), `record_id` (UNIQUE FK→records), `created_by`, timestamps, `tenant_id`.

**Relationships:** One-to-one with `records`; FKs to `employees`. Parent for `crm_contacts`, `crm_opportunities`, and `crm_cases`.

### `crm_contacts`
Individual people, optionally linked to an account.

Key columns: `account_id` (nullable FK→crm_accounts), `first_name`, `last_name`, `email`, `phone`, `mobile`, `title`, `department`, `lead_source`, full **mailing address**, `birthdate`, `description`, `do_not_contact` (BOOLEAN, compliance DNC), `owner_id`, `external_id`, `record_id` (UNIQUE FK→records), timestamps, `tenant_id`.

**Relationships:** One-to-one with `records`; FKs to `crm_accounts`, `employees`. Parent for opportunities and cases.

### `crm_lead_intake`
Raw, unqualified inbound **Leads** (the UI "Leads" module, internal object name `lead_intake`). This is the *front* of the CRM lifecycle — capture happens here before qualification. Qualifying/converting a lead creates a `crm_leads` (Prospect) row; see `CrmService.convertLeadToProspect`. Kept as a separate table so raw inbound never pollutes the working prospect pipeline (the Salesforce/Zoho separation — see [DATA_DICTIONARY](data-dictionary.md) for the Lead-vs-Prospect rationale).

Key columns: `first_name`, `last_name`, `company`, `email`, `phone`, `mobile`, `job_title`, `lead_source`, `lead_status` (default 'new': new, contacted, qualified, converted), `rating` (hot/warm/cold), `industry`, `annual_revenue`, `website`, `description`, `is_converted` (BOOLEAN), `converted_at`, `converted_prospect_id` (→ `crm_leads.id` created on conversion), `owner_id`, `external_id`, `record_id` (UNIQUE FK→records), `created_by`, timestamps, `tenant_id`.

**Relationships:** One-to-one with `records`; FK to `employees` (owner). Converts into `crm_leads` (Prospect).

### `crm_leads`
The **Prospect** layer — a qualified/working lead (the UI "Prospects" module, object name `prospect`). Populated either directly or by converting a `crm_lead_intake` row. Converting a prospect (via `CrmService.convertLead`) creates account/contact/opportunity (Client).

Key columns: `first_name`, `last_name`, `company`, `email`, `phone`, `mobile`, `job_title`, `lead_source`, `lead_status` (default 'new': new, contacted, qualified, unqualified, converted), `rating` (hot/warm/cold), `industry`, `annual_revenue`, `website`, `description`, `is_converted` (BOOLEAN), `converted_at`, `owner_id`, `external_id`, `record_id` (UNIQUE FK→records), timestamps, `tenant_id`.

**Relationships:** One-to-one with `records`; FK to `employees`. Parent for `crm_lead_conversions`, `lead_scores`. Fed by `crm_lead_intake`.

### `crm_opportunities`
Qualified deals with revenue value and sales stages.

Key columns: `account_id`, `contact_id`, `name`, `amount` (DECIMAL 18,2), `currency`, `stage` (default 'prospecting' → … closed_won/closed_lost), `probability` (0–100), `close_date`, `lead_source`, `type`, `next_step`, `description`, `is_closed`, `is_won`, `forecast_category`, `pipeline_stage_id` (FK→ui_pipeline_stages), `owner_id`, `external_id`, `record_id` (UNIQUE FK→records), timestamps, `tenant_id`.

**Relationships:** One-to-one with `records`; FKs to `crm_accounts`, `crm_contacts`, `employees`, `ui_pipeline_stages`. Parent for `crm_lead_conversions`.

### `crm_cases`
Support/service tickets for customer issues.

Key columns: `account_id`, `contact_id`, `subject`, `description`, `status` (default 'new': new, in_progress, waiting_customer, resolved, closed), `priority` (default 'medium': low/medium/high/critical), `type`, `origin` (email/phone/chat/web), `contact_email`, `contact_name`, `resolution`, `owner_id`, `external_id`, `record_id` (UNIQUE FK→records), timestamps, `tenant_id`.

**Relationships:** One-to-one with `records`; FKs to `crm_accounts`, `crm_contacts`, `employees`.

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

## Products

### `products`
Catalog of sellable products/services with pricing, tax, vendor, and physical attributes.

Key columns: `record_id` (UNIQUE FK→records, nullable), `name`, `sku` (UNIQUE), `category`, `description`, `unit_price` (DECIMAL 18,2, NOT NULL), `cost_price`, `currency` ('USD'), `tax_rate` (DECIMAL 5,4), `is_active`, `is_service`, `min_quantity` (default 1), `max_quantity`, `vendor_name`, `vendor_sku`, `dimensions`, `weight`, `warranty_months`, `image_url`, `created_by`, timestamps, `tenant_id`.

**Relationships:** references `records`.

---

## Email, Documents & Lead Scoring

### `email_templates`
Reusable templates with HTML/text bodies and variable placeholders.

Key columns: `record_id` (UNIQUE), `object_id` (FK→ui_objects), `name`, `category`, `subject`, `body_html` (MEDIUMTEXT), `body_text`, `variables` (JSON), `is_active`, `usage_count`, `language` ('en'), `created_by`, timestamps, `tenant_id`.

**Relationships:** FKs to `records`, `ui_objects`; referenced by `email_logs`.

### `email_logs`
Per-send email records with delivery/open/click/bounce tracking.

Key columns: `template_id` (FK→email_templates), `related_record_id` + `related_type` (polymorphic), `to_email`, `from_email`, `cc_emails`/`bcc_emails` (JSON), `subject`, `body_html`, `body_text`, `status` ('sent'), `opened_at`, `clicked_at`, `bounced_at`, `bounce_reason`, `sent_by`, `sent_at`, `created_at`, `tenant_id`.

**Relationships:** FK to `email_templates`.

### `documents`
Unified store for the **standalone Document Management System (DMS)** — generic CRM attachments,
generated documents, and e-signed documents. Bytes live in a pluggable `StorageProvider` (local / S3 /
Azure / GCS) under a tenant-first **relative** key; the row holds only metadata. See
[document-management.md](engines/document-management.md).

Key columns: `record_id` (UNIQUE, runtime-records bridge), `document_ref` (human ref e.g. `DOC-GEN-001`),
polymorphic owner `entity_type` + `entity_id`, `original_filename`, `stored_key`
(relative storage key, never an absolute path), `file_size`, `mime_type`, `file_hash` (SHA-256 — integrity & dedup),
`category`, `folder_id` (FK→document_folders), `description`, `notes`, `content_text` (MediumText — extracted plain
text for full-text search; **never returned over the API**), `version`, `status` (`uploaded` | `under_review` |
`approved` | `rejected` | `waived` | `deleted` …), `is_public`, review columns (`reviewed_by`, `reviewed_at`,
`rejection_reason`), `uploaded_by`/`uploaded_at`, `deleted_at` (soft-delete marker), timestamps, `tenant_id`.

Indexes: `(entity_type, entity_id)`, `category`, `status`, `file_hash`, `original_filename`,
`folder_id`, `deleted_at`, `tenant_id`, plus a **FULLTEXT** index `documents_fulltext` on
`(original_filename, description, content_text)`.

**Relationships:** FK to `records`, `document_folders`; referenced by `document_share_links`,
`document_signature_requests`.

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

## Reporting & Analytics

Five tables back the self-service reporting module — see
[reporting.md](engines/reporting.md) for the engine and [Reports](../using-the-crm/reports.md)
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

### `social_media_campaigns`
Social marketing campaigns with goals, budgets, schedule, and ROI.

Key columns: `name`, `description`, `campaign_type`, `objective`, `target_audience` (JSON), `budget_total`/`budget_daily`, `currency`, `start_date`/`end_date`, `platforms` (JSON), `content_themes`/`hashtag_strategy`/`posting_schedule`/`success_metrics` (JSON), `status` ('planning'), `performance_summary` (JSON), `lessons_learned`, `roi`, `lead_conversion_rate`, `created_by`, `manager_id`, timestamps, `tenant_id`.

**Relationships:** many-to-many with `social_media_accounts`.

### `social_listening_keywords`
Keywords/phrases monitored across platforms (brand, competitor, industry, product).

Key columns: `keyword`, `keyword_type`, `category`, `match_type` ('contains'), `platforms` (JSON), `is_case_sensitive`, `exclude_own_mentions` (default true), `alert_threshold`, `priority` ('medium'), `is_active`, `created_by`, timestamps, `tenant_id`.

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

**Relationships:** FK to `records`; indexed on (record_id, occurred_at) for timeline queries. See [status-tracker.md](engines/status-tracker.md) for usage.

---

## SLA Engine

> Service-level timers. Admins configure business hours, policies, targets and escalations (`routes/sla`); the
> reconciler in `SlaService` owns `sla_instances`, one live timer per record and metric. See [SLA_ENGINE](engines/sla-engine.md).

### `sla_business_hours`
Working-hours calendar; SLA clocks only run inside it.

Key columns: `name`, `timezone_label`, `utc_offset_minutes` (fixed offset, no DST), `weekly` (JSON day → open/close), `holidays` (JSON), `is_default`, `is_active`, timestamps, `tenant_id`.

**Relationships:** Parent for `sla_policies` (SetNull on delete).

### `sla_policies`
Which records an SLA applies to, in priority order.

Key columns: `name`, `description`, `entity_type` (case | lead | task | record), `object_id` (nullable — the object for `record` policies), `conditions` (JSON filter), `pause_statuses` (JSON), `config` (JSON), `business_hours_id`, `is_active`, `order_index`, timestamps, `tenant_id`.

**Relationships:** FK to `sla_business_hours`; parent (cascade) for `sla_targets`, `sla_escalations`, `sla_instances`. Index on (tenant_id, entity_type, is_active, order_index).

### `sla_targets`
How long each metric may take, per priority.

Key columns: `policy_id`, `metric` (first_response | resolution), `priority` (`*` = any), `target_minutes`, `warning_pct` (default 80 — share of the target after which the timer is "at risk"), `tenant_id`.

**Relationships:** FK to `sla_policies` (cascade); UNIQUE on (policy_id, metric, priority).

### `sla_escalations`
What happens when a timer is at risk or breached.

Key columns: `policy_id`, `metric` (first_response | resolution | `*`), `trigger` (warning | breach), `action` (notify_owner | notify_manager | raise_priority | create_task), `config` (JSON), `order_index`, `tenant_id`.

**Relationships:** FK to `sla_policies` (cascade).

### `sla_instances`
One running timer per (entity, metric).

Key columns: `policy_id`, `entity_type` + `entity_id` (polymorphic — for `record` policies, a `records.id`; no FK), `metric`, `priority`, `owner_id`, `target_minutes`, `started_at`, `due_at` (business-hours-aware), `warning_at`, `paused_at`, `status` (running | paused | met | breached | canceled), `warned`, `breached`, `completed_at`, `breached_at`, timestamps, `tenant_id`.

**Relationships:** FK to `sla_policies` (cascade); UNIQUE on (entity_type, entity_id, metric); indexes on (tenant_id, status), (status, due_at), owner_id.

---

## Access Segmentation & Audit Chain

> Added by migration `20261013180000_platform_builder_extensions`. See [platform-builder-extensions.md](engines/platform-builder-extensions.md#5-business-units-and-information-barriers).

### `business_units`

Legal entities / divisions a tenant's records and staff belong to.

| Column | Type | Notes |
|---|---|---|
| id | INTEGER | PK, auto-increment |
| code | VARCHAR(20) | NOT NULL; UNIQUE (tenant_id, code) |
| name | VARCHAR(150) | NOT NULL |
| legal_name, regulator | VARCHAR(200), VARCHAR(150) | nullable |
| licence | VARCHAR(200) | nullable |
| base_currency | CHAR(3) | nullable |
| is_active | BOOLEAN | default true |
| config | JSON | nullable |
| created_at, updated_at | DATETIME(3) | |
| tenant_id | INTEGER | NOT NULL, FK→tenants |

### `employee_business_units`

| Column | Type | Notes |
|---|---|---|
| id | INTEGER | PK |
| employee_id | VARCHAR(20) | FK→employees (Cascade); UNIQUE (employee_id, business_unit_id) |
| business_unit_id | INTEGER | FK→business_units (Cascade) |
| is_primary | BOOLEAN | default false |
| created_at | DATETIME(3) | |
| tenant_id | INTEGER | FK→tenants |

### `barrier_zones`

| Column | Type | Notes |
|---|---|---|
| id | INTEGER | PK |
| code | VARCHAR(40) | NOT NULL; UNIQUE (tenant_id, code) |
| name | VARCHAR(150) | NOT NULL |
| description | TEXT | nullable |
| is_active | BOOLEAN | default true |
| created_at, updated_at | DATETIME(3) | |
| tenant_id | INTEGER | FK→tenants |

### `barrier_members`

| Column | Type | Notes |
|---|---|---|
| id | INTEGER | PK |
| zone_id | INTEGER | FK→barrier_zones (Cascade); UNIQUE (zone_id, employee_id) |
| employee_id | VARCHAR(20) | FK→employees (Cascade), indexed |
| source | VARCHAR(20) | `member` (standing) or `wall_crossing` |
| valid_to | DATETIME(3) | nullable — NULL = standing; a crossing expires here |
| granted_by | VARCHAR(20) | nullable |
| created_at | DATETIME(3) | |
| tenant_id | INTEGER | FK→tenants |

### `wall_crossings`

| Column | Type | Notes |
|---|---|---|
| id | INTEGER | PK |
| zone_id | INTEGER | FK→barrier_zones (Cascade); index (zone_id, status) |
| employee_id | VARCHAR(20) | FK→employees (Cascade) — who is brought over the wall |
| reason | TEXT | NOT NULL |
| status | VARCHAR(20) | `pending` / `approved` / `rejected` |
| requested_by, decided_by | VARCHAR(20) | nullable; the decider can never be the requester |
| decided_at, valid_to | DATETIME(3) | nullable |
| created_at, updated_at | DATETIME(3) | |
| tenant_id | INTEGER | FK→tenants |

### `audit_chain_events`

Append-only, hash-chained per tenant.

| Column | Type | Notes |
|---|---|---|
| id | INTEGER | PK |
| seq | INTEGER | NOT NULL; UNIQUE (tenant_id, seq) — 1, 2, 3 … per tenant |
| entity_type | VARCHAR(50) | NOT NULL; index (entity_type, entity_id) |
| entity_id | VARCHAR(64) | nullable |
| action | VARCHAR(60) | NOT NULL |
| actor | VARCHAR(20) | nullable |
| sensitivity | VARCHAR(20) | default `normal` |
| payload | JSON | nullable |
| prev_hash | CHAR(64) | previous event's hash (64 zeros for the first) |
| hash | CHAR(64) | SHA-256 over the canonical event and `prev_hash` |
| created_at | DATETIME(3) | |
| tenant_id | INTEGER | FK→tenants |

## Sessions & Background Jobs

### `auth_refresh_tokens`

Refresh tokens for staff sessions (PRD E-01). Global (not tenant-scoped through the extension); `tenant_id` is recorded for reporting.

| Column | Type | Notes |
|---|---|---|
| id | INTEGER | PK, auto-increment |
| employee_id | VARCHAR(20) | indexed |
| token_hash | CHAR(64) | UNIQUE — SHA-256 of the token; the token itself is never stored |
| family | CHAR(32) | indexed — every rotation of one sign-in shares a family; reuse of a retired token revokes the family |
| expires_at | DATETIME(3) | NOT NULL |
| revoked_at | DATETIME(3) | nullable |
| replaced_by | INTEGER | nullable — the token that superseded this one |
| user_agent | VARCHAR(255) | nullable |
| ip | VARCHAR(64) | nullable |
| created_at | DATETIME(3) | default CURRENT_TIMESTAMP(3) |
| tenant_id | INTEGER | nullable |

### `job_queue`

Durable job queue (PRD E-03): retried integration and SMS calls. Worked by every API instance every 15 seconds.

| Column | Type | Notes |
|---|---|---|
| id | INTEGER | PK, auto-increment |
| type | VARCHAR(60) | handler name, e.g. `integration.call` |
| payload | JSON | NOT NULL |
| status | VARCHAR(20) | `queued` \| `running` \| `done` \| `dead` |
| attempts / max_attempts | INTEGER | default 0 / 6 |
| run_after | DATETIME(3) | next attempt time (exponential back-off) |
| locked_at | DATETIME(3) | nullable — lease; released after 10 minutes |
| last_error | TEXT | nullable |
| dedupe_key | VARCHAR(191) | nullable, indexed — one pending job per key |
| created_at / updated_at | DATETIME(3) | |
| tenant_id | INTEGER | nullable — the job runs inside this tenant |

Index: (`status`, `run_after`).

## Appendix: Cross-Cutting Conventions

- **Multi-tenancy:** Nearly every table carries `tenant_id`; many uniqueness constraints are scoped per tenant (e.g., role `name`, `tenant_configs.config_key`).
- **Polymorphic links:** Several tables use a `<thing>_type` + `<thing>_id` pair (e.g., `email_logs.related_type/related_record_id`, `crm_associations`, `audit_logs`) instead of hard FKs. Lookup fields stored in `record_field_values` are the same: the value is the target `records.id`, with no foreign key.
- **Typed records pattern:** CRM entities each own a row in the generic `records` table via a UNIQUE `record_id`, unifying assignment, activities, tasks, audit logs, and status events across all object types.
- **Money:** Monetary amounts use `DECIMAL(18,2)`; rates use `DECIMAL(5,2)` or `DECIMAL(5,4)`.
- **Timestamps:** `DATETIME(3)` (millisecond precision); `created_at` defaults to `CURRENT_TIMESTAMP(3)`.
- **JSON columns** store flexible config, metrics, and structured metadata throughout.

<!-- nav:bottom -->

---

### Where to next

| | |
|---|---|
| **Next** | [Data dictionary](data-dictionary.md) — Why each table exists and when its rows are written |
| **Previous** | [Architecture & setup](architecture-and-setup.md) |
| **Background** | [Understanding Genesis › How data is stored and read](../understanding/03-how-data-is-stored.md) |
| **On these journeys** | [Engineer](../README.md#engineer) (step 4 of 9) |
| **Lost?** | [Docs roadmap](../README.md) · [Developer guide](README.md#core-reading-in-order) · [Understanding Genesis](../understanding/README.md) |
<!-- /nav:bottom -->
