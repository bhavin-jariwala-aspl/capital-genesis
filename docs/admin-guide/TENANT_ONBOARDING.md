# Tenant Onboarding — Genesis CRM

**Audience:** platform administrators who sign in as `PLATFORM01` and put customers onto the
platform, plus the engineers who maintain that path.

---

## The short version

Sign in as the platform administrator, go to **Platform ▸ Tenants**, click **New workspace**, and
answer three screens. One request creates the tenant *and* everything that makes it usable, and
hands you the sign-in details to pass on.

```text
Employee ID: PLATFORM01
Password:    Platform@123     (seed default — change it on any real deployment)
```

The **Setup** column on each row tells you whether a workspace is actually usable. Click it for a
checklist, and **Finish setup** to run whatever is still missing.

---

## What "a tenant" consists of

A row in `tenants` is an invoice, not a product. A workspace someone can log into and use is that
row plus eight things:

| Step              | What it installs                                                        | Why a workspace is unusable without it |
|-------------------|-------------------------------------------------------------------------|----------------------------------------|
| Role ladder       | The tenant's own `roles` rows (`super_admin` … `underwriter`)            | Sign-in resolves a user's authority from these. No rows, no working session. |
| Office and region | A default region and head office                                         | The employee form has nothing to file people under. |
| CRM metadata      | Modules, objects, fields, forms, layouts, validations, dependencies, pages, pipelines, stages, wizards, document categories and checklists, per-role metadata permissions, lead-scoring rules, carriers and carrier products | The entire UI is generated from these. Without them the app renders an empty shell. |
| Automation        | The workflow catalogue (`prisma/crm-workflows.js`)                       | Optional — nothing breaks, nothing automates. |
| Dashboards        | The dashboard catalogue (`prisma/crm-dashboards.js`) and its chart library | Optional. |
| SLA policies      | Starter case / lead / task policies on a Mon–Fri 9–5 calendar             | Optional. |
| Email templates   | The template pack for the tenant's industry                              | Optional. |
| First administrator | One `super_admin` employee plus their hierarchy self-row                | Nobody can sign in without it. |

The first three and the last are what the console calls **usable**. All eight are **ready**.

### Where the content comes from

Two sources, on purpose:

- **A template tenant** supplies the CRM metadata. Metadata is data, not code — an admin edits it
  in the Builder, and it exists only in the database. Cloning one nominated workspace means the
  platform team curates a single template and every new tenant inherits it. The template is chosen
  as: an explicit `template_tenant_id` on the request → the tenant whose slug matches
  `TEMPLATE_TENANT_SLUG` (default `genesis-life-demo`) → the lowest-numbered tenant that has any
  metadata at all.
- **The code catalogues** supply workflows and dashboards. Those already live in
  `prisma/crm-workflows.js` and `prisma/crm-dashboards.js` with installers that take a
  tenant-scoped Prisma client, so provisioning calls them and a new tenant gets the *current*
  catalogue even if the template tenant's copy has been hand-edited since.

### What is never copied

Business data. Records, leads, contacts, accounts, opportunities, cases, quotes, policies,
applications, claims, commissions, documents, reports, social accounts and employees all stay with
the tenant that owns them. A new customer gets a configured product, not somebody else's book of
business.

`assignment_rules` is skipped for a narrower reason: every branch of a rule points at an employee
(`assignee_id`, `pool_ids`, `fallback_id`) and those ids do not exist in the new tenant, so copying
them would produce silently broken routing rather than a head start. Configure assignment after the
tenant has users.

---

## The wizard, screen by screen

### 1. Organisation

Type the organisation's name. The **workspace address** (the slug used in URLs and branding asset
paths) is derived as you type, checked against every existing tenant, and shown with a tick or a
clash plus a suggested alternative you can accept in one click. **Next** stays disabled until the
address is confirmed free, so you cannot submit a form that is going to 409.

Accents are folded rather than dropped — "Café Assurance" becomes `cafe-assurance`.

Billing email and a custom domain are optional. The slug is **fixed once the workspace exists**:
branding asset keys and URLs reference it.

### 2. Plan and contents

Pick the plan. User, storage and API limits come from the `subscription_plans` row, never from the
form — a paid plan also starts a trial of the plan's own length and sets the status to `trial`.

Pick the industry. This selects the email-template pack.

Then choose what to install. Automation, dashboards, SLA policies and email templates can be
unticked; the role ladder, office and metadata cannot, because a workspace without them cannot be
used. Everything is re-runnable later from the setup checklist, so unticking now costs nothing.

### 3. Administrator

The employee ID is suggested from the workspace name (`Acme Life` → `ACMELIFE_ADMIN`) and checked
for availability, with a workspace-prefixed suggestion if it is taken. Click **Generate** for an
18-character password; ambiguous glyphs (`0 O 1 l I`) are left out so it survives being read aloud.

This account is created as **Super Administrator of the new workspace** — the most senior role
*inside* it. It carries no access to the platform console and none to any other workspace.

> **`employee_id` and `email` are unique across the entire platform, not per tenant.** Two tenants
> cannot both have an `ADMIN001`. That is why the wizard checks and suggests rather than letting you
> discover it on submit. See *Known schema constraints* below.

### 4. Setup report

You get a per-step report, not a "Created" toast: what was installed, what was skipped and why, and
the sign-in details to hand over. **Copy sign-in details** puts the workspace, employee ID and
password on the clipboard. The password is shown once.

If a step failed, the workspace still exists and is listed — use **Finish setup** on its row to
retry only what is missing.

---

## The setup checklist

Every tenant row carries a **Setup** badge:

| Badge          | Meaning |
|----------------|---------|
| **Ready**      | All eight steps are done. |
| **n/8 set up** | Usable — somebody can sign in and see a CRM — but some optional steps are outstanding. |
| **Needs setup**| Not usable. Missing the role ladder, the metadata, or an administrator. |

Click the badge for the checklist, then **Finish setup**. Every step is idempotent: it checks what
is already there and installs only the gap, so pressing it twice is safe and a half-provisioned
tenant is finished rather than abandoned.

---

## Day-to-day tenant operations

**Suspend** — the tenant's status becomes `suspended` and *everyone loses access immediately*,
including sessions already signed in. You are asked for a reason, which is recorded in the platform
audit log.

**Reactivate** — status returns to `active`; access resumes on the next request.

**Change plan** — updates the plan and its limits together.

**Delete** — a soft delete with a 30-day recovery window. Access stops at once; **Restore** undoes
it within the window.

**Trials** — a tenant on `trial` whose `trial_ends_at` has passed is blocked in the same way as a
suspension. Change the plan to restore access.

All of these take effect within 30 seconds at worst (the tenant-status memo's TTL) and immediately
for the action you just performed, because the console drops the cached status as it writes.

---

## API

Everything below requires the `platform_admin` role and lives under `/api/platform`.

### Onboarding

| Method | Path | Purpose |
|--------|------|---------|
| `POST` | `/tenants/onboard` | Create a tenant **and** provision it, in one call. Body: the tenant fields, plus optional `admin: { employee_id, employee_name, email, password }`, `template_tenant_id`, and `skip_steps: string[]`. Returns `{ tenant, provisioning, readiness }` with `201`. |
| `GET`  | `/tenants/provisioning-steps` | The step catalogue (`key`, `title`), for rendering a checklist. |
| `GET`  | `/tenants/check-slug?slug=` | `{ slug, available, reason?, suggestion? }`. |
| `GET`  | `/tenants/check-admin?employee_id=&email=&slug=` | Availability for the platform-wide unique identity columns, with a suggestion. |
| `GET`  | `/tenants/:id/readiness` | Per-step checklist: `{ ready, usable, steps[], missing[], completed, total, users }`. |
| `POST` | `/tenants/:id/provision` | Re-run steps. Body: `{ steps?: string[], missing_only?: true, template_tenant_id?, admin? }`. |
| `POST` | `/tenants/:id/provision-admin` | Create the first admin (runs `roles`, `org`, `admin`, `email_templates`). |
| `POST` | `/tenants/:id/provision-templates` | Install or re-install the industry email templates. |

`POST /tenants` still exists and still creates only the row — for scripts that want to provision
separately. It is no longer what the console uses.

### Step keys

`roles`, `org`, `metadata`, `workflows`, `dashboards`, `sla`, `email_templates`, `admin`.

The order is a dependency order and is always honoured, whatever order you list them in:
`admin` runs last so the dashboard and email-template steps can stamp `created_by`, and `workflows`
needs `metadata` to have produced objects first.

### Committing before provisioning

`POST /tenants/onboard` commits the tenant row **before** running the setup steps. A step that
fails therefore leaves a real, listed tenant the console can finish — not a rolled-back
half-creation whose failure an operator has to diagnose from a log. The per-step report says
exactly what happened.

### Example

```bash
curl -sX POST http://localhost:3000/api/platform/tenants/onboard \
  -H "Authorization: Bearer $PLATFORM_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{
        "name": "Acme Life Insurance",
        "plan": "professional",
        "industry": "life_insurance",
        "billing_email": "billing@acme.test",
        "admin": {
          "employee_id": "ACME_ADMIN",
          "employee_name": "Ada Lovelace",
          "email": "ada@acme.test",
          "password": "a-generated-passphrase"
        }
      }'
```

---

## Known schema constraints

These are properties of the current schema, not of the onboarding code. Provisioning works around
each of them; changing them needs a migration.

| Column | Constraint | Consequence | Workaround in place |
|--------|------------|-------------|---------------------|
| `employees.employee_id` | Primary key, platform-wide | Two tenants cannot share an employee ID | The wizard checks availability and suggests a workspace-prefixed ID |
| `employees.email` | `@unique`, platform-wide | One email, one account, platform-wide | Checked before submit; a clash returns `409` with a clear message |
| `regions.region_code` | `@unique`, platform-wide | Two tenants cannot both use `WEST` | Provisioning generates `T<id>-HQ` |
| `branches.branch_code` | `@unique`, platform-wide | Two tenants cannot both use `HQ` | Provisioning generates `T<id>-HQ` |

If you plan to run many tenants, making these composite with `tenant_id` is the right fix. Until
then, adopt a per-tenant ID prefix convention — which is what the suggestions nudge you toward.

---

## Tenant data isolation

Onboarding does not weaken isolation; it is the one operation that legitimately crosses it.

Every one of the 104 tenant-scoped Prisma models carries a `tenant_id` column, and a Prisma client
extension injects it into every read, write and delete from the tenant on the caller's JWT (held in
`AsyncLocalStorage`). `backend/tests/tenant-scope-coverage.test.js` asserts against the generated
Prisma DMMF that no model outside the platform control-plane set can be added without one, so a new
table cannot silently escape scoping.

`TenantProvisioningService` runs with **no** tenant in that store and addresses `tenant_id`
explicitly on every query, because it must read the template tenant and write another. That is
deliberate and tested: `tenant-provisioning.test.js` asserts the clone runs unscoped, that every
copied row is stamped with the *new* tenant, that every foreign key is rewritten to the new tenant's
rows rather than the template's, and that the template tenant is left untouched.

See [developer-guide/SECURITY.md](../developer-guide/SECURITY.md) for the whole isolation model.

---

## For engineers

| File | Role |
|------|------|
| `backend/src/services/platform/tenant-provisioning.service.js` | The engine: the clone plan, the role/org/admin steps, readiness, availability probes |
| `backend/src/services/platform/tenant.service.js` | Tenant CRUD, validation, plan limits, `slugify` |
| `backend/src/routes/platform/index.js` | The endpoints above |
| `backend/src/middleware/tenant-lifecycle.js` | The suspended / cancelled / deleted / expired-trial gate |
| `frontend/src/pages/platform/TenantOnboardWizard.jsx` | The three-step wizard and the setup report |
| `frontend/src/pages/platform/TenantsPage.jsx` | The tenant list, Setup column and checklist |
| `backend/tests/tenant-provisioning.test.js` | 45 tests, including the foreign-key remapping, against an in-memory Prisma double |
| `frontend/tests/TenantOnboarding.test.jsx` | The wizard driven end to end against a mocked service |

### Adding a step to the clone

Append an entry to `CLONE_PLAN` in `tenant-provisioning.service.js`:

```js
{ model: 'uiThing', label: 'things', key: ['name'], remap: { object_id: 'uiObject' } }
```

- `key` — the columns that identify a row within its tenant. Only needed when a *later* entry
  points at this model: MySQL returns no ids from a bulk insert, so the source-id → target-id map is
  rebuilt by reading the new rows back and matching on this key. Leaves omit it.
- `remap` — a foreign key to translate through an earlier entry's map. A row whose parent was not
  copied is dropped rather than left pointing at the template tenant.
- `nullify` — columns naming a person (`created_by`), cleared because the template tenant's employee
  ids mean nothing in the new tenant.
- `polymorphic` — for `ui_permissions`, whose `entity_id` means a different table per `entity_type`.

Entries must appear parent-first. `tenant-provisioning.test.js` enforces that, checks every entry
against the Prisma schema, and fails if a business-data model appears in the plan.

### Adding a provisioning step

Add a `{ key, title }` to `STEPS`, a `case` to `#runStep`, and a `done` check to `readiness()`.
Steps must be idempotent — check what exists and install only the gap — because both "Finish setup"
and a retry after a failure call them again.
