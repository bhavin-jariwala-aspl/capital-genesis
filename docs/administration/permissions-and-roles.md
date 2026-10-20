# Genesis CRM — Permissions & Roles

<!-- nav:top -->
> **[Docs roadmap](../README.md)** › **[Administration](README.md)** › 2 of 5 · **For:** Administrators
> ← [System configuration](system-configuration.md) · [Automation reference](automation-reference.md) →
> New to Genesis? Background: [Understanding Genesis › Who sees what](../understanding/05-who-sees-what.md)
<!-- /nav:top -->

## Overview

Genesis CRM implements a two-tier permission model:

| Domain | Table | Covers |
| ------ | ----- | ------ |
| Metadata | `ui_permissions` | Modules, objects, fields, forms, pipelines, wizards (can_view / can_edit per role); on objects also `view_scope` |
| Operational | `operational_permissions` | Task and activity scope per role (view / create / edit / delete / assign), plus the special grants `barrier_override`, `wall_crossing_decide` and `view_pii` |

Roles sit on a level ladder (lower = more power): `platform_admin` 1, `super_admin` 2, `admin` 3,
`manager` 4, `user` 5. A workspace adds its own roles with a level; every check below uses the level, so
a custom level-4 role behaves as a manager. Genesis Capital ships 17 roles and 305 permission rows.

Which records a role sees is decided separately — see [Record visibility](#record-visibility).

All permission logic is centralised in `backend/src/services/permission.service.js`.

---

## 1. Metadata Permissions (`ui_permissions`)

### What it controls

Role-based **view** and **edit** access to individual metadata entities:

- **can_view = false** → the entity is removed from the metadata the backend sends (sidebar, forms, object tabs)
- **can_view = true, can_edit = false** → entity is visible but read-only (fields are rendered disabled)
- **can_view = true, can_edit = true** → full access

These rows shape the **screen**, not the data. Record reads do not check an object's `can_view`, and a
field with `can_view = false` is still returned by the record API — it is only left off the form. Use
the PII mask (`config.pii` with the `view_pii` grant) for values that must not reach a role. An
object's `can_edit = false` is enforced on the server: create, update and delete are refused.

### Default behaviour (when no row exists)

| Role | can_view | can_edit |
| ---- | -------- | -------- |
| Level 3 or better (`super_admin`, `admin`, …) | always `true` (bypasses all rows) | always `true` (bypasses all rows) |
| Level 4 and 5 | `true` | `false` |

With no row, a non-admin role can see an entity but not edit it. Add a row with `can_edit = true` to
let a role create and change records of an object.

### Inheritance

The `/api/runtime/form/:id` endpoint uses `MetadataService.getFormForViewer()` which:

1. Loads the full form from cache
2. For non-admin roles, fetches all `ui_permissions` rows for the form's fields
3. Filters out hidden fields (can_view=false)
4. Sets `config.always_disabled=true` on read-only fields (can_view=true, can_edit=false)

This means the backend drives the rendering decision — the `FormRenderer` component in React simply reads
`field.config.always_disabled`.

The `/api/runtime/modules` and `/api/runtime/module/:id` endpoints similarly filter modules and their nested objects.

### How to configure (Admin UI)

**For fields:**

1. Go to **Builder → Modules & Objects**
2. Navigate to an Object's fields
3. In the Form Builder, select a field → tab **Access**
4. Check/uncheck **Can View** and **Can Edit** per role
5. Click **Save**

**For modules and objects:**

1. Go to **Builder → Modules & Objects**
2. Click the shield button on any module or object row
3. A modal appears with the role permission table
4. Check/uncheck **Can View** and **Can Edit** per role
5. Click **Save**

---

## 2. Operational Permissions (`operational_permissions`)

### Scope dimensions (tasks and activities)

Five scope dimensions for **tasks** and **activities**:

| Dimension | Key | Scopes |
| --------- | --- | ------ |
| View | `view_scope` | Which records the role can list and read |
| Create | `create_scope` | Who the role can create tasks/activities for |
| Edit | `edit_scope` | Which records the role can modify |
| Delete | `delete_scope` | Which records the role can remove |
| Assign | `assign_scope` | Which tasks/activities the role can reassign |

### Scope values

| Scope | Records accessible |
| ----- | ------------------ |
| `none` | No access — operation not permitted |
| `own` | Only records created by or assigned to this employee |
| `team` | Records belonging to the employee's direct team |
| `hierarchy` | All records in the reporting chain below this employee |
| `all` | All records in the system |

### Default scopes (if no explicit DB row configured)

| Role level | view | create | edit | delete | assign |
| ---------- | ---- | ------ | ---- | ------ | ------ |
| 3 or better (`super_admin`, `admin`) | `all` | `all` | `all` | `all` | `all` |
| 4 (`manager` and custom level-4 roles) | `hierarchy` | `own` | `hierarchy` | `own` | `team` |
| 5 (`user` and custom level-5 roles) | `own` | `own` | `own` | `own` | `none` |

### Special grants

The same table holds three grants that are not task or activity scopes. A row with a `view_scope`
other than `none` gives the role the right:

| `entity_type` | Grants | Genesis Capital roles |
| ------------- | ------ | --------------------- |
| `barrier_override` | See inside every information barrier | `mlro` |
| `wall_crossing_decide` | Approve or refuse wall-crossing requests | `compliance_officer`, `mlro` |
| `view_pii` | See PII-masked field values unmasked (each reveal is audited) | `compliance_officer`, `mlro`, `credit_analyst`, `operations_checker` |

### Parent record access

Before any task or activity operation, the service also checks record-level visibility (the existing
`#assertRecordAccess` method). A user cannot create or view tasks/activities on a record they cannot see, regardless of
their operational permission scopes.

### Configuring operational permissions (Admin UI)

1. Go to **Builder → Permissions**, tab **Operational**
2. Select **Task Permissions**, **Activity Permissions**, **Record Permissions**, **Barrier Override** or
   **Wall-crossing Decisions**. Record Permissions limit a role on every business record — what it sees and what it
   may create, edit, delete or reassign — but only for roles you save there; other roles keep the level-based
   visibility described below.
3. For each role, configure `view`, `create`, `edit`, `delete`, and `assign` scopes using the dropdowns
4. Click **Save** per role row
5. Changes take effect immediately (no cache invalidation needed — these are read on each request)

---

## 3. Backend Enforcement

### Record visibility

Business records (every Builder object) are filtered on the server in three layers, all of which must
pass:

1. **Owner scope by level.** Level 3 or better sees every record. Level 4 sees records it or anyone
   below it in the org chart created or owns. Level 5 sees records it created or that are assigned to
   it.
2. **Object-wide access.** An object permission row with `view_scope = 'all'` lets that role see every
   record of the object (used for back-office desks). Set it per role on the object's permission modal.
3. **Business unit and barrier.** An employee who belongs to business units sees only records of those
   units plus records with no unit; an employee with no memberships, and any admin, is not limited by
   unit. A record in a barrier zone is visible only to zone members, approved unexpired wall-crossings
   and roles with `barrier_override` — this applies to admins too.

### Metadata routes

| Endpoint | Enforcement |
| -------- | ----------- |
| `GET /api/runtime/modules` | Filters out modules where `can_view = false` for the caller's role |
| `GET /api/runtime/module/:id` | Filters objects where `can_view = false`; sets `_can_edit` flag |
| `GET /api/runtime/object/:id` | Filters hidden fields; marks read-only fields with `always_disabled` |
| `GET /api/runtime/form/:id` | Filters fields by `can_view`; sets `always_disabled` on `can_edit = false` fields |

Builder mutation routes (`PUT`, `POST`, `DELETE`) remain restricted to admin/super_admin by the existing `requireAdmin`
middleware — they are unaffected by `ui_permissions`.

### Operational routes

| Endpoint | Enforcement |
| -------- | ----------- |
| `GET /api/tasks` | Results filtered by `view_scope` |
| `POST /api/tasks` | Checked against `create_scope` |
| `PUT /api/tasks/:id` | Checked against `edit_scope` |
| `DELETE /api/tasks/:id` | Checked against `delete_scope` |
| `GET /api/activities` | Results filtered by `view_scope` |
| `POST /api/activities` | Checked against `create_scope` |
| `PUT /api/activities/:id` | Checked against `edit_scope` |
| `DELETE /api/activities/:id` | Checked against `delete_scope` |

All operational endpoints also enforce **parent record access** before any action is taken.

---

## 4. Frontend Behaviour

| Condition | Rendering |
| --------- | --------- |
| Module / object has `can_view = false` | Not shown in sidebar or object tabs |
| Entity has `can_view = true`, `can_edit = false` | Visible but rendered as read-only (fields disabled) |
| Entity has `can_view = true`, `can_edit = true` | Fully interactive |

The `_can_edit` flag returned on each entity (modules, objects) is available in the response for the frontend to
conditionally render action buttons.

---

## 5. Database Tables

### `ui_permissions`

```sql
entity_type  VARCHAR(50)   -- module | object | field | form | pipeline | wizard
entity_id    INT
role_name    VARCHAR(50)   -- FK → roles.name
can_view     BOOL DEFAULT 1
can_edit     BOOL DEFAULT 0
view_scope   VARCHAR(10)   -- objects only: null/'own' or 'all'
updated_by   VARCHAR(20)
```

Unique index on `(entity_type, entity_id, role_name, tenant_id)`.

### `operational_permissions` table

```sql
entity_type   VARCHAR(30)  -- task | activity | barrier_override | wall_crossing_decide | view_pii
role_name     VARCHAR(50)  -- FK → roles.name
view_scope    VARCHAR(20)  DEFAULT 'own'
create_scope  VARCHAR(20)  DEFAULT 'own'
edit_scope    VARCHAR(20)  DEFAULT 'own'
delete_scope  VARCHAR(20)  DEFAULT 'own'
assign_scope  VARCHAR(20)  DEFAULT 'none'
updated_by    VARCHAR(20)
```

Unique index on `(entity_type, role_name, tenant_id)`.

---

## 6. Auditability

`updated_by` is stored on every permission row. Every save from the Builder is also written to the
tamper-evident audit chain as `permission.<entity_type>` or `permission.operational.<entity_type>`,
marked sensitive, with the submitted values.

---

## 7. Migration

```bash
cd backend
npx prisma migrate deploy     # applies all pending migrations, including the permission tables
npx prisma generate           # regenerates the Prisma client
```

---

## 8. Known Limitations / Next Steps

- **Permission inheritance**: object-level permissions do not yet auto-populate child field permissions. The admin must
  configure field permissions independently.
- **Pipeline stage permissions**: `UiPipelineStage` can be restricted per-entity but there is no "which stages are
  visible to which role" logic yet.
- **Screen-only field and object visibility**: see [What it controls](#what-it-controls) — `can_view` does not
  filter record data.
- **Cache**: `ui_permissions` rows are fetched fresh on each runtime request (not cached). For very high-traffic
  deployments, these can be added to the Redis cache with a short TTL.
- **Field-level `_can_edit` in form response**: the `_can_edit` attribute is set per-field-layout; the frontend could
  use it to render a lock icon rather than silently disabling the field.

<!-- nav:bottom -->

---

### Where to next

| | |
|---|---|
| **Next** | [Automation reference](automation-reference.md) — Workflow vs assignment vs scoring vs SLA: which to use, full vocabulary, shipped rules, guard rails |
| **Previous** | [System configuration](system-configuration.md) |
| **Background** | [Understanding Genesis › Who sees what](../understanding/05-who-sees-what.md) |
| **Related** | [Permissions](../builder-guide/06-permissions.md) · [Security](../developer-guide/security.md) |
| **On these journeys** | [CRM administrator](../README.md#crm-administrator) (step 4 of 7) |
| **Lost?** | [Docs roadmap](../README.md) · [Administration](README.md) · [Understanding Genesis](../understanding/README.md) |
<!-- /nav:bottom -->
