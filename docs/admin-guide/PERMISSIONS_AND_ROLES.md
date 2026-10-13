# Genesis CRM — Permissions & Roles

## Overview

Genesis CRM implements a two-tier permission model:

| Domain | Table | Covers |
| ------ | ----- | ------ |
| Metadata | `ui_permissions` | Modules, objects, fields, forms, pipelines, wizards (can_view / can_edit per role) |
| Operational | `operational_permissions` | Task and activity scope per role (view / create / edit / delete / assign) |

All permission logic is centralised in `backend/src/services/permission.service.js`.

---

## 1. Metadata Permissions (`ui_permissions`)

### What it controls

Role-based **view** and **edit** access to individual metadata entities:

- **can_view = false** → the entity is hidden entirely from the UI (filtered by the backend, not just the frontend)
- **can_view = true, can_edit = false** → entity is visible but read-only (fields are rendered disabled)
- **can_view = true, can_edit = true** → full access

### Default behaviour (when no row exists)

| Role | can_view | can_edit |
| ---- | -------- | -------- |
| `super_admin` / `admin` | always `true` (bypasses all rows) | always `true` (bypasses all rows) |
| `manager` / `user` | `true` | `true` |
| `uw_manager` / `senior_underwriter` / `underwriter` | per seed row | per seed row |

> **Underwriter roles** have restricted access — they can only
> view/edit UW-related objects. See section 3a for details.
>
> **Note (v3.1.3):** Both the field-level and object-level `can_edit`
> defaults were changed from `false` to `true`. Previously, form fields
> were read-only and record create/update/delete returned 403 for
> non-admin roles when no explicit `ui_permissions` row existed. Now
> everything is editable by default — add an explicit row with
> `can_edit = false` to restrict access.

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

| Role | view | create | edit | delete | assign |
| ---- | ---- | ------ | ---- | ------ | ------ |
| `super_admin` | `all` | `all` | `all` | `all` | `all` |
| `admin` | `all` | `all` | `all` | `all` | `all` |
| `manager` | `team` | `team` | `team` | `own` | `own` |
| `uw_manager` | `all` | `all` | `all` | `all` | `all` |
| `user` | `own` | `own` | `own` | `own` | `none` |
| `senior_underwriter` | `all` | `all` | `all` | `none` | `none` |
| `underwriter` | `all` | `all` | `own` | `none` | `none` |

### Parent record access

Before any task or activity operation, the service also checks record-level visibility (the existing
`#assertRecordAccess` method). A user cannot create or view tasks/activities on a record they cannot see, regardless of
their operational permission scopes.

### Configuring operational permissions (Admin UI)

1. Go to **Builder → Permission Management**
2. Select the **Task Permissions** or **Activity Permissions** tab
3. For each role, configure `view`, `create`, `edit`, `delete`, and `assign` scopes using the dropdowns
4. Click **Save** per role row
5. Changes take effect immediately (no cache invalidation needed — these are read on each request)

---

## 3. Backend Enforcement

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
| `GET /api/runtime/tasks` | Results filtered by `view_scope` |
| `POST /api/runtime/tasks` | Checked against `create_scope` |
| `PUT /api/runtime/tasks/:id` | Checked against `edit_scope` |
| `DELETE /api/runtime/tasks/:id` | Checked against `delete_scope` |
| `GET /api/runtime/activities` | Results filtered by `view_scope` |
| `POST /api/runtime/activities` | Checked against `create_scope` |
| `DELETE /api/runtime/activities/:id` | Checked against `delete_scope` |

All operational endpoints also enforce **parent record access** before any action is taken.

---

## 3a. Underwriting Decision Authority

Underwriting decisions (approve / decline / refer) carry regulatory and financial weight and are gated by
a **dedicated `underwriting` operational permission** — separate from task/activity scopes.

### Enforcement mechanism

`PermissionService.assertCanDecideUnderwriting(roleName, tenantId)` is called before:

| Endpoint | Why |
| -------- | --- |
| `PATCH /api/insurance/underwriting/:id` | Updates any field, including `status` |
| `POST /api/insurance/underwriting/:id/decision` | Formal approve / decline / refer action |

**Bypass rule**: `admin`, `super_admin`, and `platform_admin` (roles at or below `ADMIN_THRESHOLD`)
always pass — no DB row required.

**All other roles** require an explicit `operational_permissions` row with:

- `entity_type = 'underwriting'`
- `edit_scope != 'none'`

### Seeded defaults

The seed grants UW decision authority to admin and all three
dedicated underwriter roles:

| Role | view | create | edit | delete | assign |
| ---- | ---- | ------ | ---- | ------ | ------ |
| `admin` | all | all | all | all | all |
| `uw_manager` | all | all | all | all | all |
| `senior_underwriter` | all | all | all | none | none |
| `underwriter` | all | all | own | none | none |

Agent roles (`manager`, `user`) have **no** underwriting
operational permission row — they cannot make UW decisions.

### UiPermission access for underwriter roles

Underwriter logins see a restricted sidebar. The seed creates
`ui_permissions` rows that enforce:

| Object | UW roles |
| ------ | -------- |
| Underwriting Cases | view + edit |
| Application Documents | view + edit |
| Applications | view only |
| Policies | view only |
| Claims | view only |
| Clients | view only |
| Prospects | hidden |
| Quotes | hidden |
| Commissions | hidden |
| Settings | hidden |
| Declarations | hidden |

### Granting underwriting authority to a non-admin role

Upsert a row via the Prisma client or Admin UI:

```sql
INSERT INTO operational_permissions
  (entity_type, role_name, view_scope, create_scope,
   edit_scope, delete_scope, assign_scope, tenant_id)
VALUES
  ('underwriting', 'manager', 'all', 'all',
   'all', 'own', 'none', <tenant_id>);
```

> Setting `edit_scope = 'none'` on an existing row revokes
> decision authority for that role immediately.

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
updated_by   VARCHAR(20)
```

Unique index on `(entity_type, entity_id, role_name)`.

### `operational_permissions` table

```sql
entity_type   VARCHAR(30)  -- task | activity | underwriting
role_name     VARCHAR(50)  -- FK → roles.name
view_scope    VARCHAR(20)  DEFAULT 'own'
create_scope  VARCHAR(20)  DEFAULT 'own'
edit_scope    VARCHAR(20)  DEFAULT 'own'   -- 'none' revokes decision authority for underwriting rows
delete_scope  VARCHAR(20)  DEFAULT 'own'
assign_scope  VARCHAR(20)  DEFAULT 'none'
updated_by    VARCHAR(20)
```

Unique index on `(entity_type, role_name, tenant_id)`.

---

## 6. Auditability

`updated_by` is stored on every permission row and updated each time an admin saves permissions. To track the full
history of permission changes, an `AuditLog` entry should be added to `PermissionService.setEntityPermissions` and
`setOperationalPermission` — this is a recommended next enhancement.

---

## 7. Migration

```bash
cd backend
npx prisma migrate deploy     # applies 20260326_add_permissions/migration.sql
npx prisma generate           # regenerates the Prisma client
```

---

## 8. Known Limitations / Next Steps

- **Permission inheritance**: object-level permissions do not yet auto-populate child field permissions. The admin must
  configure field permissions independently.
- **Pipeline stage permissions**: `UiPipelineStage` can be restricted per-entity but there is no "which stages are
  visible to which role" logic yet.
- **Audit log for permission changes**: `updated_by` is recorded but no `AuditLog` entry is written. Add this to
  `setEntityPermissions` / `setOperationalPermission` for a full audit trail.
- **Cache**: `ui_permissions` rows are fetched fresh on each runtime request (not cached). For very high-traffic
  deployments, these can be added to the Redis cache with a short TTL.
- **Field-level `_can_edit` in form response**: the `_can_edit` attribute is set per-field-layout; the frontend could
  use it to render a lock icon rather than silently disabling the field.
