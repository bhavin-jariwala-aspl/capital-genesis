# Application Settings

<!-- nav:top -->
> **[Docs roadmap](../../README.md)** › **[Engine references](README.md)** › 11 of 12 · **For:** Engineers
> ← [Currency](currency.md) · [Status tracker](status-tracker.md) →
> New to Genesis? Background: [Understanding Genesis › Configure or code?](../../understanding/07-configure-or-code.md)
<!-- /nav:top -->

> Status: **Implemented**
> Scope: tenant-wide (organization) configuration that drives workspace behaviour.

This document describes the Settings module — what it configures, how it is stored, its
API and access control — and benchmarks it against the settings/admin capabilities of the
top five CRM platforms.

---

## 1. What changed and why

`/settings` is the **application Settings module**: tenant-wide configuration that
governs how the whole workspace behaves. It is admin-gated and reachable from a dedicated
**Settings** entry in the sidebar. Personal actions (theme toggle, identity, sign-out) live
in the top navigation **Header**.

---

## 2. What it configures

Settings are organised into groups, each a card in the UI:

| Group | Settings |
|---|---|
| **Organization** | Company name, industry, logo URL, primary (brand) colour, billing email |
| **Appearance & Branding** | App name, theme preset, logos and favicon, accent colour, light/dark defaults, shape, density, typography, sidebar, chart palette, sign-in page. Edited in Builder → Appearance Studio |
| **Localization** | Time zone, language, currency, date format, number format, fiscal year start |
| **Business Hours** | Week start, work-day start/end, working days |
| **Home Page** | Home dashboard per role (`role:dashboard_name` pairs) |
| **Security** | Session timeout, minimum password length, password expiry, require MFA (stored only — see below) |
| **Notifications** | Email notifications, notify on assignment, daily digest |
| **Documents** | Max upload size (MB), retention-after-delete (days), allow public links, show preview button |

The four **Security** values are stored but nothing in the sign-in flow reads them. MFA is
enforced from the platform security policy (`security_policies.require_mfa`, Platform → Security),
and the access token lifetime comes from `JWT_EXPIRY`.

The **Documents** group is the policy surface for the [Document Management System](document-management.md)
(upload ceiling, GC retention window, public-link toggle).

> **Record delete mode is not an application setting.** Whether deleting a record moves it to the Trash
> (soft) or removes it permanently (hard) is configured **per pipeline** via the **Deletion behaviour**
> toggle in the [Pipeline Builder](../../builder-guide/03-pipeline-builder.md#trash-recovering-deleted-records),
> stored on `ui_pipelines.config.delete_mode`. It is deliberately not a global setting.

---

## 3. Architecture

A single **schema** (`SCHEMA` in [`backend/src/services/settings.service.js`](../../../backend/src/services/settings.service.js))
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
| MFA toggle | 🟡 (TOTP MFA enforced by the platform security policy; this workspace flag is not read) | ✅ | ✅ | ✅ | ✅ | ✅ |
| Notification defaults | ✅ | ✅ | ✅ | ✅ | ✅ | 🟡 |
| Document/storage policy | ✅ | 🟡 | 🟡 | ✅ | 🟡 | ⚪ |
| Role-gated settings access | ✅ (admin) | ✅ | ✅ | ✅ | ✅ | ✅ |
| Schema-driven / extensible config | ✅ (key/value + schema) | ✅ (custom settings/metadata) | 🟡 | ✅ | 🟡 | ⚪ |
| Per-tenant isolation | ✅ | ✅ (per-org) | ✅ | ✅ | ✅ | ✅ |
| Audit of setting changes | 🟡 (`updated_by` stamped) | ✅ (Setup Audit Trail) | 🟡 | ✅ | 🟡 | ⚪ |
| Change history / rollback | ⚪ | ✅ | ⚪ | 🟡 | ⚪ | ⚪ |
| Per-user preference overrides | 🟡 (light/dark and text size only, when the workspace allows) | ✅ | ✅ | ✅ | ✅ | ✅ |

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
| High | Workspace security settings | Read `security.require_mfa` and the password settings in the auth flow, or drop them in favour of the platform security policy. |
| High | Session timeout enforcement | Apply `security.session_timeout_minutes` to JWT expiry / idle logout. |
| Medium | Setting-change audit log | Write each change to `audit_logs` (already stamping `updated_by`). |
| Medium | Multi-currency | Move from a single currency to per-record currency + exchange rates. |
| Low | Per-user preference overrides | Extend beyond light/dark and text size. |
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

<!-- nav:bottom -->

---

### Where to next

| | |
|---|---|
| **Next** | [Status tracker](status-tracker.md) — Building the status stepper field |
| **Previous** | [Currency](currency.md) |
| **Background** | [Understanding Genesis › Configure or code?](../../understanding/07-configure-or-code.md) |
| **Lost?** | [Docs roadmap](../../README.md) · [Engine references](README.md) · [Understanding Genesis](../../understanding/README.md) |
<!-- /nav:bottom -->
