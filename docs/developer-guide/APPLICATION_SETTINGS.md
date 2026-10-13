# Application Settings

> Status: **Implemented**
> Scope: tenant-wide (organization) configuration that drives workspace behaviour.

This document describes the Settings module — what it configures, how it is stored, its
API and access control — and benchmarks it against the settings/admin capabilities of the
top five CRM platforms.

---

## 1. What changed and why

The previous `/settings` page was a **personal** view — it showed the logged-in user's
read-only profile, a theme toggle, and a sign-out button. Every one of those already exists
in the top navigation **Header** (theme toggle, user identity, sign-out), so the page carried
no unique value and was removed.

In its place is a genuine **application Settings module**: tenant-wide configuration that
governs how the whole workspace behaves. It is admin-gated and reachable from a dedicated
**Settings** entry in the sidebar.

Removed: `frontend/src/pages/Settings.jsx`, its public `/settings` route, and the sidebar
footer link. The footer now shows the user's identity only (actions live in the Header).

---

## 2. What it configures

Settings are organised into groups, each a card in the UI:

| Group | Settings |
|---|---|
| **Organization** | Company name, industry, logo URL, primary (brand) colour, billing email |
| **Localization** | Time zone, language, currency, date format, number format, fiscal year start |
| **Business Hours** | Week start, work-day start/end, working days |
| **Security** | Session timeout, minimum password length, password expiry, require MFA |
| **Notifications** | Email notifications, notify on assignment, daily digest |
| **Documents** | Max upload size (MB), retention-after-delete (days), allow public links |

The **Documents** group is the policy surface for the [Document Management System](DOCUMENT_MANAGEMENT.md)
(upload ceiling, GC retention window, public-link toggle).

> **Record delete mode is not an application setting.** Whether deleting a record moves it to the Trash
> (soft) or removes it permanently (hard) is configured **per pipeline** via the **Deletion behaviour**
> toggle in the [Pipeline Builder](../user-guide/04-pipeline-builder.md#trash-recovering-deleted-records),
> stored on `ui_pipelines.config.delete_mode`. It is deliberately not a global setting.

---

## 3. Architecture

A single **schema** (`SCHEMA` in [`backend/src/services/settings.service.js`](../../backend/src/services/settings.service.js))
is the source of truth. It drives validation, type coercion, defaults, **and** the UI — the
frontend renders every control generically from the schema returned by the API, so adding a
setting is a one-line schema change with no UI work.

Storage is split by the nature of each setting:

- **Profile settings** (`source: 'tenant'`) map to first-class columns on the `tenants` row:
  `name`, `industry`, `logo_url`, `primary_color`, `billing_email`, `timezone`, `locale`.
- **Everything else** is a typed key/value pair in `tenant_configs`
  (`config_key = "{group}.{key}"`, `config_value` = stringified value, unique per tenant).

```
 Frontend (generic renderer)          Backend                         Storage
 ┌──────────────────────────┐   ┌────────────────────────┐   ┌────────────────────┐
 │ OrganizationSettings.jsx  │──▶│ GET/PUT /api/settings   │──▶│ SettingsService     │
 │ renders from schema        │   │  (PUT = admin only)     │   │  ├ tenants (profile)│
 │ sends only changed keys    │   └────────────────────────┘   │  └ tenant_configs   │
 └──────────────────────────┘                                   └────────────────────┘
```

Type safety: values are coerced to their declared type (`boolean`/`number`/`text`/`select`/
`email`/`url`/`color`) on both read and write; `select` values are checked against their
option list, numbers against `min`/`max`, and emails against a format check.

`Tenant` and `TenantConfig` are **global** Prisma models (not auto-scoped by the tenant
middleware), so the service filters by `tenant_id` on every query. Writes run in a single
`$transaction`.

---

## 4. API

| Method | Path | Access | Purpose |
|---|---|---|---|
| GET | `/api/settings` | Any authenticated user | `{ schema, values }` — the app needs localization/branding for everyone |
| GET | `/api/settings/effective` | Any authenticated user | Flat `{ "group.key": value }` for programmatic consumers |
| PUT | `/api/settings` | **Admin** (`requireAdmin`) | Apply a partial patch `{ values: { "group.key": v } }` |

The UI reads on load, tracks a working copy, and `PUT`s **only changed keys**. The route is
admin-gated server-side; the page is additionally behind an admin `ProtectedRoute`.

---

## 5. Benchmark vs. top 5 CRM platforms

Compared against the organization/admin settings of **Salesforce**, **HubSpot**,
**Microsoft Dynamics 365**, **Zoho CRM**, and **Pipedrive**. CRM columns reflect publicly
documented product capabilities (general knowledge, early 2026).

Legend: ✅ full · 🟡 partial / basic · ⚪ not yet

| Capability | **Genesis** | Salesforce | HubSpot | Dynamics 365 | Zoho CRM | Pipedrive |
|---|:--:|:--:|:--:|:--:|:--:|:--:|
| Company profile & branding | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Localization (tz/locale/date/number) | ✅ | ✅ | ✅ | ✅ | ✅ | 🟡 |
| Currency | 🟡 (single, selectable) | ✅ (multi-currency) | 🟡 | ✅ (multi) | ✅ (multi) | 🟡 |
| Fiscal year configuration | ✅ | ✅ | ⚪ | ✅ | ✅ | ⚪ |
| Business hours | ✅ | ✅ | 🟡 | ✅ | ✅ | 🟡 |
| Session/security policy | ✅ | ✅ | 🟡 | ✅ | ✅ | 🟡 |
| Password policy | ✅ | ✅ | 🟡 | ✅ | ✅ | 🟡 |
| MFA toggle | 🟡 (flag; enforcement pending) | ✅ | ✅ | ✅ | ✅ | ✅ |
| Notification defaults | ✅ | ✅ | ✅ | ✅ | ✅ | 🟡 |
| Document/storage policy | ✅ | 🟡 | 🟡 | ✅ | 🟡 | ⚪ |
| Role-gated settings access | ✅ (admin) | ✅ | ✅ | ✅ | ✅ | ✅ |
| Schema-driven / extensible config | ✅ (key/value + schema) | ✅ (custom settings/metadata) | 🟡 | ✅ | 🟡 | ⚪ |
| Per-tenant isolation | ✅ | ✅ (per-org) | ✅ | ✅ | ✅ | ✅ |
| Audit of setting changes | 🟡 (`updated_by` stamped) | ✅ (Setup Audit Trail) | 🟡 | ✅ | 🟡 | ⚪ |
| Change history / rollback | ⚪ | ✅ | ⚪ | 🟡 | ⚪ | ⚪ |
| Per-user preference overrides | ⚪ (workspace-level only) | ✅ | ✅ | ✅ | ✅ | ✅ |

### Where Genesis is competitive

- **Schema-driven model** — one declaration drives validation, storage, and UI, matching the
  spirit of Salesforce Custom Settings / Custom Metadata while staying simple. New settings
  are a one-line change.
- **Coverage of the essentials** — organization, localization, business hours, security,
  notifications, and document policy in one place, on par with the mid-tier configuration of
  Zoho/Dynamics.
- **Clean storage split** — structured attributes on the tenant row, free-form policy in a
  typed key/value store, all tenant-isolated.

### Gaps to close (prioritized)

| Priority | Gap | Direction |
|---|---|---|
| High | MFA **enforcement** | Wire `security.require_mfa` into the auth flow (currently a stored flag). |
| High | Session timeout enforcement | Apply `security.session_timeout_minutes` to JWT expiry / idle logout. |
| Medium | Setting-change audit log | Write each change to `audit_logs` (already stamping `updated_by`). |
| Medium | Multi-currency | Move from a single currency to per-record currency + exchange rates. |
| Low | Per-user preference overrides | Layer user prefs over workspace defaults. |
| Low | Change history / rollback | Version `tenant_configs` for point-in-time restore. |

---

## 6. Extending

Add an entry to `SCHEMA` in `settings.service.js`:

```js
{ key: 'my_flag', label: 'My Flag', type: 'boolean', default: false }   // → tenant_configs
{ key: 'company_phone', label: 'Phone', type: 'text', source: 'tenant', column: 'phone' } // → tenants column
```

Validation, storage, the API response, and the settings UI all update automatically — no
frontend change required.
