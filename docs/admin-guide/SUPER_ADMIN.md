# Super Administrator (Platform Admin) — Genesis CRM

## Overview

The **Super Administrator** (role: `platform_admin`, level 1) is the highest-privilege
role in Genesis CRM. It operates **above the tenant level** — managing the SaaS
platform itself rather than individual organizations.

**Inverted level system — lower number = more powerful, unlimited nesting.**

| Level | Role           | Scope              |
|-------|----------------|---------------------|
| 1     | platform_admin | Platform-wide       |
| 2     | super_admin    | Full tenant access  |
| 3     | admin          | Configure system    |
| 4     | manager        | Team/hierarchy      |
| 5     | user           | Own records only    |
| 6+    | custom roles   | Tenant-defined      |

**Level 1 and the name `platform_admin` are reserved.** The authorization gates compare against a
frozen ladder in `backend/src/middleware/authenticate.js` (`BUILTIN_ROLE_LEVEL`), not against the
`roles` table, and no tenant-scoped role may hold level 1 whatever its row says. A tenant cannot
create a role called `platform_admin`, and no tenant-level route will assign that role. A role name
that resolves to no row at all is treated as *no access*, never as level 1.

---

## Login Credentials (Demo / Seed)

```text
Employee ID: PLATFORM01
Password:    Platform@123
```

After login, the **Platform** section appears in the sidebar navigation (golden crown icon).

---

## Architecture

### Database Tables (12 new tables)

| Table                      | Purpose                                        |
|----------------------------|-------------------------------------------------|
| `tenants`                  | Customer organizations on the platform          |
| `tenant_configs`           | Key-value settings per tenant                   |
| `tenant_usage`             | Usage metrics per tenant per period             |
| `subscription_plans`       | Pricing tiers (Free/Starter/Pro/Enterprise)     |
| `feature_flags`            | Global feature toggles with rollout %           |
| `tenant_feature_overrides` | Per-tenant flag overrides                       |
| `platform_audit_logs`      | Every platform admin action (immutable)         |
| `system_announcements`     | Banners/alerts pushed to all users              |
| `impersonation_logs`       | "Login as" session tracking                     |
| `api_rate_limits`          | Rate limiting per plan/tenant/endpoint          |
| `security_policies`        | Password/session/MFA policies per tenant        |
| `data_export_requests`     | Backup and GDPR export tracking                 |

### Backend Services (`backend/src/services/platform/`)

| Service                    | File                          | Responsibility                                   |
|----------------------------|-------------------------------|--------------------------------------------------|
| TenantService              | `tenant.service.js`           | CRUD tenants, config, usage, plan changes         |
| SubscriptionService        | `subscription.service.js`     | CRUD plans, comparison, plan deletion guard       |
| FeatureFlagService         | `feature-flag.service.js`     | CRUD flags, toggle, rollout %, tenant overrides   |
| PlatformAuditService       | `platform-audit.service.js`   | Immutable action logging, query, stats            |
| AnnouncementService        | `announcement.service.js`     | CRUD announcements, active filtering for runtime  |
| PlatformAnalyticsService   | `analytics.service.js`        | Overview, growth, feature usage, revenue, churn   |
| SecurityService            | `security.service.js`         | Policies, password resets, sessions, rate limits   |
| TenantProvisioningService  | `tenant-provisioning.service.js` | Turns a tenant row into a usable workspace: role ladder, org units, metadata clone, catalogues, first admin, readiness |

Two pieces of middleware belong to the same story:

| Middleware            | File                              | Responsibility |
|-----------------------|-----------------------------------|----------------|
| Tenant scope          | `middleware/tenant-scope.js`      | Injects `tenant_id` into every Prisma read and write from the caller's JWT |
| Tenant lifecycle gate | `middleware/tenant-lifecycle.js`  | Blocks suspended / cancelled / deleted / expired-trial tenants on every request and at sign-in |

### API Routes (`/api/platform/*`)

All routes require the `platform_admin` role — both the level and the reserved role name are
checked. See [TENANT_ONBOARDING.md](TENANT_ONBOARDING.md#api) for the onboarding endpoints.

### Frontend Pages (`frontend/src/pages/platform/`)

| Page                  | Route                    | Purpose                                    |
|-----------------------|--------------------------|--------------------------------------------|
| PlatformDashboard     | `/platform`              | Overview: metrics, health, revenue          |
| TenantsPage           | `/platform/tenants`      | Create, manage, suspend/delete tenants      |
| FeatureFlagsPage      | `/platform/feature-flags`| Toggle features, set rollout %, overrides   |
| PlansPage             | `/platform/plans`        | Manage subscription tiers and pricing       |
| AnnouncementsPage     | `/platform/announcements`| Create system-wide banners and alerts       |
| AnalyticsPage         | `/platform/analytics`    | Growth, usage, revenue, churn dashboards    |
| SecurityPage          | `/platform/security`     | Policies, passwords, sessions, rate limits  |
| AuditLogPage          | `/platform/audit-log`    | Searchable log of all admin actions         |

---

## Day-to-Day Usage Guide

### 1. Tenant Management

> **Full guide: [TENANT_ONBOARDING.md](TENANT_ONBOARDING.md).** It covers the wizard, the setup
> checklist, the provisioning API, and the platform-wide unique columns to watch for.

**Create a new tenant (the normal path):**

1. Navigate to **Platform > Tenants**
2. Click **New workspace**
3. **Organisation** — type the name; the URL slug is derived and checked for you
4. **Plan and contents** — pick the plan and industry, and tick what to install
5. **Administrator** — accept the suggested employee ID and click **Generate** for a password
6. Click **Create and set up**

One request creates the tenant *and* its role ladder, head office, CRM metadata, automation,
dashboards, SLA policies, email templates and first administrator. You get a per-step report and
the sign-in details to hand over. Creating a tenant row on its own leaves a workspace nobody can
use — that is what the wizard exists to prevent.

**Check or finish a tenant's setup:**

1. The **Setup** column shows `Ready`, `n/8 set up`, or `Needs setup`
2. Click the badge for the per-step checklist
3. Click **Finish setup** to run only the steps still missing (every step is idempotent)

**Provision an admin for an existing tenant:**

1. Find the tenant in the list
2. Click the **UserPlus** icon (shown only while the tenant has no admin)
3. Accept the suggested Employee ID, add the full name, and copy the generated password
4. Click **Create admin** — creates a `super_admin` employee bound to this tenant, and its role
   ladder and head office if they are not there yet

**Suspend a tenant** (e.g., non-payment):

1. Find the tenant in the list
2. Click the pause icon and give a reason (recorded in the audit log)
3. Tenant status changes to `suspended` and **every user loses access immediately**, including
   anyone already signed in — the tenant-lifecycle gate rejects their existing tokens rather than
   waiting for them to expire

The same applies to `cancelled`, `deleted`, and a `trial` whose `trial_ends_at` has passed.

**Change a tenant's plan:**

1. Use the plan dropdown on the tenant row
2. Select the new plan — limits update immediately

**Delete a tenant:**

1. Click the trash icon — tenant is soft-deleted and access stops at once
2. **30-day recovery window** — click Restore to undo
3. After 30 days, data is eligible for permanent deletion

**Tenant config:**

- Set custom key-value settings (branding, currency, date format)
- Via API: `PUT /api/platform/tenants/:id/config { key, value }`

### 2. Features & Entitlements

> **Full guide: [PLANS_AND_FEATURES.md](PLANS_AND_FEATURES.md).**

Three things decide whether a customer has a feature, and each has its own place:

| Input | Where | What it means |
|-------|-------|---------------|
| **The plan** | Platform ▸ Plans | What was sold. A feature the plan excludes is off. |
| **The flag** | Platform ▸ Feature Flags | Whether we have shipped it. Can only *withhold*. |
| **The override** | Platform ▸ Tenants ▸ **Features** | The deliberate exception. Wins over both. |

**Give one customer a feature their plan excludes:**

1. Navigate to **Platform > Tenants**
2. Click the ✨ **Features** action on the row
3. Find the feature and choose **Granted**

Each row offers **Plan default**, **Granted** and **Revoked**. Plan default is how an exception is
undone — with a two-state switch, a tenant that was once overridden would stop tracking its own plan
forever, including through later upgrades. Every row also states *why* it resolved the way it did,
because "not sold", "switched off platform-wide", "outside a rollout cohort" and "explicitly
revoked" are four different problems with four different fixes.

**Change what a whole tier includes:** edit the plan (below). Check the tenant count on the plan card
first — that is how many customers the change affects.

**Toggle a feature globally (rollout and kill-switches):**

1. Navigate to **Platform > Feature Flags**
2. Click the toggle on any flag, or its rollout percentage for a partial cohort

A flag can only withhold a feature a tenant's plan already includes; it can never grant one that was
not sold. That asymmetry is why switching a flag on platform-wide cannot hand paid functionality to
a free tenant. Rollout splits tenants deterministically by id, so a tenant does not flap in and out
of the cohort between requests.

Each flag card names the catalogue feature it controls and the tier that sells it. A flag whose name
matches no catalogue feature is labelled *gates nothing sellable* — rename it to a catalogue key or
delete it.

**Flag categories:**

- `general` — a feature sold from Starter or Professional
- `premium` — a feature sold only at Enterprise
- `beta` — mid-rollout; expect a partial `rollout_percent`
- `experimental` — not ready for anyone by default

### 3. Subscription Plans

**View all plans:**

1. Navigate to **Platform > Plans**
2. **Cards** shows price, limits, feature count and tenants per plan
3. **Compare** shows the tiers across the top and the whole feature catalogue down the side —
   the view that answers "is Professional actually a superset of Starter?"

**Edit a plan:**

1. Click the edit icon on any plan card
2. Modify pricing, trial length and the six numeric limits
3. Pick the **features included** — grouped, with select-all per group, and
   *Use the standard set for this tier* to reset
4. Changes apply immediately to every tenant already on the plan, not only to future ones

A plan's **name cannot be changed** — `tenants.plan` points at it, so renaming would orphan every
tenant on the plan. Create a new plan and move tenants instead.

Each tier is a strict superset of the one below, by construction: a feature declares the cheapest
tier that includes it, and inclusion is a rank comparison rather than four hand-maintained lists.

**Delete a plan:**

- Only possible if no tenants are currently on that plan
- System blocks deletion with a clear error message

### 4. System Announcements

**Create a maintenance notice:**

1. Navigate to **Platform > Announcements**

2. Click **New Announcement**
3. Set severity to `maintenance`, target to `all`
4. Set active_from and active_to dates
5. Users see the banner during that window

**Severity levels:**

- `info` — Blue banner, general information
- `warning` — Amber alert, action may be needed
- `critical` — Red alert, immediate attention required
- `maintenance` — Gray banner, scheduled downtime

**Target audiences:**

- `all` — Every user on the platform
- `admins` — Only admin, super_admin, and platform_admin users

### 5. User Impersonation

**Login as another user** (for debugging/support):

```bash
POST /api/platform/impersonate
{
  "target_user_id": "USR001",
  "reason": "Investigating reported bug #1234"
}
```

Response includes a new JWT token for the target user's session. Use this token in subsequent API calls.

**End impersonation:**

```bash
POST /api/platform/impersonate/:id/end
{ "actions_taken": ["Viewed lead records", "Verified form rendering"] }
```

**Important:**

- Cannot impersonate other platform admins
- Every impersonation is logged with admin ID, target, reason, IP, and duration
- All actions during impersonation are auditable

### 6. Platform Analytics

**Dashboard overview** (`/platform`):

- Total tenants, active users, record counts
- MRR/ARR revenue metrics
- System health (DB latency, uptime, memory)
- Churn indicators

**Detailed analytics** (`/platform/analytics`):

- Tenant growth over 12 months
- Feature usage heatmap
- User activity (records, activities, tasks in 30 days)
- Revenue breakdown by plan
- Churn metrics (suspended, deleted, expired trials)

### 7. Security Controls

**Password management:**

- Force reset any user's password — generates a random 16-char temp password
- Bulk reset — provide array of employee IDs

**User management:**

- Deactivate users — immediately locks them out
- Reactivate users — restores access
- Cannot deactivate other platform admins (safety guard)

**Security policies** (global or per-tenant):

- MFA requirement
- Password complexity (length, uppercase, number, special char)
- Password expiry (0 = never)
- Max login attempts and lockout duration
- Session timeout
- IP allowlist/blocklist

**API rate limits:**

- Pre-configured per plan (Free: 20/min, Enterprise: 300/min)
- Customizable per tenant or endpoint pattern

**Data exports:**

- Request full backups or GDPR-compliant exports
- Track export status (pending → processing → completed)
- Exports include expiry dates

### 8. Audit Log

**Every platform admin action is logged:**

- Tenant create/update/suspend/delete/restore
- Feature flag toggle/rollout/override
- Plan create/update/delete
- Announcement create/activate/deactivate
- Security policy updates
- Password resets
- User impersonation start/end
- Data export requests

**Searchable by:**

- Admin ID
- Action type (e.g., `tenant.suspend`)
- Target type and ID
- Date range

---

## API Reference

### Authentication

All `/api/platform/*` endpoints require:

- JWT token in `Authorization: Bearer <token>` header
- User must have `platform_admin` role (level 1)

### Impersonation

Impersonation works by **minting a separate, short-lived JWT** for the target user:

```text
POST /api/platform/impersonate  { "target_user_id": "USR001", "reason": "..." }
  → { token, impersonation_id, target }
```

Use that token as the `Authorization: Bearer` credential; it carries `is_impersonated` and
`impersonated_by` for the audit trail and expires in 1 hour. Call
`POST /api/platform/impersonate/:id/end` when finished.

A target must be an active user in a tenant that is allowed to transact, and another
`platform_admin` can never be impersonated.

> **There is no `X-Impersonate-User` header.** Earlier revisions of this document described one.
> The middleware behind it was never registered as a request hook, so the header was silently
> ignored on every route; it has been removed rather than left as documented-but-dead behaviour.

### Endpoints Summary

```text
TENANTS
  GET    /api/platform/tenants                    List tenants (paginated, filterable)
  GET    /api/platform/tenants/stats              Tenant statistics
  GET    /api/platform/tenants/:id                Get tenant details
  POST   /api/platform/tenants                    Create the tenant ROW only
  PUT    /api/platform/tenants/:id                Update tenant

ONBOARDING  (see TENANT_ONBOARDING.md)
  POST   /api/platform/tenants/onboard             Create AND provision, one call
  GET    /api/platform/tenants/provisioning-steps  The step catalogue
  GET    /api/platform/tenants/check-slug          Is this workspace address free?
  GET    /api/platform/tenants/check-admin         Is this employee_id / email free?
  GET    /api/platform/tenants/:id/readiness       Per-step setup checklist
  POST   /api/platform/tenants/:id/provision       (Re-)run steps; `missing_only` for "finish setup"
  POST   /api/platform/tenants/:id/provision-admin Create the first admin
  POST   /api/platform/tenants/:id/provision-templates  Install industry email templates
  POST   /api/platform/tenants/:id/suspend        Suspend tenant
  POST   /api/platform/tenants/:id/reactivate     Reactivate tenant
  DELETE /api/platform/tenants/:id                Soft-delete tenant (30-day recovery)
  POST   /api/platform/tenants/:id/restore        Restore deleted tenant
  POST   /api/platform/tenants/:id/change-plan    Change subscription plan
  GET    /api/platform/tenants/:id/config          Get tenant config
  PUT    /api/platform/tenants/:id/config          Set tenant config key
  DELETE /api/platform/tenants/:id/config/:key     Delete config key
  GET    /api/platform/tenants/:id/usage           Get usage metrics

AUDIT LOG
  GET    /api/platform/audit-log                   List audit entries (paginated)
  GET    /api/platform/audit-log/stats             Action type statistics
  GET    /api/platform/audit-log/target/:type/:id  History for specific target

IMPERSONATION
  POST   /api/platform/impersonate                 Start impersonation session
  POST   /api/platform/impersonate/:id/end         End impersonation session
  GET    /api/platform/impersonation-logs          List impersonation history

ANNOUNCEMENTS
  GET    /api/platform/announcements               List announcements
  GET    /api/platform/announcements/:id           Get announcement
  POST   /api/platform/announcements               Create announcement
  PUT    /api/platform/announcements/:id           Update announcement
  DELETE /api/platform/announcements/:id           Delete announcement
  POST   /api/platform/announcements/:id/activate  Activate
  POST   /api/platform/announcements/:id/deactivate Deactivate

FEATURE FLAGS
  GET    /api/platform/feature-flags               List all flags
  GET    /api/platform/feature-flags/:id           Get flag with overrides
  POST   /api/platform/feature-flags               Create flag
  PUT    /api/platform/feature-flags/:id           Update flag
  POST   /api/platform/feature-flags/:id/toggle    Toggle on/off
  POST   /api/platform/feature-flags/:id/rollout   Set rollout percentage
  DELETE /api/platform/feature-flags/:id           Delete flag
  GET    /api/platform/feature-flags/tenant/:id    Get tenant's effective flags
  POST   /api/platform/feature-flags/:id/tenant-override   Set tenant override
  DELETE /api/platform/feature-flags/:id/tenant-override/:tid  Remove override

SUBSCRIPTION PLANS
  GET    /api/platform/plans                       List all plans
  GET    /api/platform/plans/compare               Plan comparison matrix
  GET    /api/platform/plans/:id                   Get plan details
  POST   /api/platform/plans                       Create plan
  PUT    /api/platform/plans/:id                   Update plan
  DELETE /api/platform/plans/:id                   Delete plan (if no tenants use it)

ANALYTICS
  GET    /api/platform/analytics/overview          Platform overview metrics
  GET    /api/platform/analytics/tenant-growth     Tenant growth by month
  GET    /api/platform/analytics/feature-usage     Feature usage heatmap
  GET    /api/platform/analytics/user-activity     User activity (30d default)
  GET    /api/platform/analytics/system-health     DB, memory, uptime
  GET    /api/platform/analytics/revenue           MRR/ARR breakdown by plan
  GET    /api/platform/analytics/churn             Churn indicators (6mo default)

SECURITY
  GET    /api/platform/security/policies           List all policies
  GET    /api/platform/security/policies/global    Global security policy
  GET    /api/platform/security/policies/tenant/:id  Tenant policy
  PUT    /api/platform/security/policies           Upsert policy
  POST   /api/platform/security/force-password-reset  Reset user password
  POST   /api/platform/security/bulk-password-reset   Bulk reset
  GET    /api/platform/security/sessions           Active user sessions
  POST   /api/platform/security/deactivate-user    Deactivate a user
  POST   /api/platform/security/reactivate-user    Reactivate a user
  GET    /api/platform/security/rate-limits        List rate limits
  PUT    /api/platform/security/rate-limits        Upsert rate limit
  DELETE /api/platform/security/rate-limits/:id    Delete rate limit
  GET    /api/platform/security/data-exports       List export requests
  POST   /api/platform/security/data-exports       Request data export
  PUT    /api/platform/security/data-exports/:id/status  Update export status

RUNTIME (Available to all authenticated users)
  GET    /api/runtime/announcements                Active system announcements
```

---

## Setup After Fresh Deploy

```bash
# 1. Run migration to create platform tables
cd backend
npx prisma migrate dev --name add-platform-admin

# 2. Seed the database (includes platform admin, plans, flags, tenant)
node prisma/seed.js

# 3. Restart the backend
npm run dev
```

---

## Multi-Tenancy Architecture

Genesis CRM uses **shared-schema multi-tenancy** with row-level isolation:

- Every tenant-scoped table has a `tenant_id` column (FK to `tenants.id`)

- **Prisma middleware** (`tenant-scope.js`) auto-injects `tenant_id` into all queries
- JWT tokens include `tenant_id` — extracted per-request and set on the Prisma client

- **Platform admin routes bypass tenant scoping** — they operate cross-tenant

- **Global tables** (SubscriptionPlan, FeatureFlag, etc.) have no tenant_id
- **Roles are tenant-scoped** — each tenant defines custom roles at level 2+.
  `platform_admin` (level 1) is the only system-wide role (`tenant_id: null`).
  Inserting a role at an occupied level auto-shifts existing roles down;
  deleting a role auto-closes the gap by shifting roles up
- `max_users` enforcement: employee creation checks current count against the tenant's plan limit

### How tenant scoping works

1. User logs in → JWT includes `tenant_id`
2. On each request, Fastify hook sets `prisma._tenantId = request.user.tenant_id`

3. Prisma middleware intercepts every query:
   - **Reads** (findMany, count, etc.) → adds `WHERE tenant_id = ?`
   - **Creates** → injects `tenant_id` into data
   - **Updates/Deletes** → adds `tenant_id` to WHERE clause
   - **findUnique** → verifies tenant ownership after fetch
4. Platform admin routes set `prisma._tenantId = null` → no filtering

### Tables NOT tenant-scoped (global)

Tenant, TenantConfig, TenantUsage, SubscriptionPlan, FeatureFlag,
TenantFeatureOverride, PlatformAuditLog, SystemAnnouncement,
ImpersonationLog, ApiRateLimit, SecurityPolicy, DataExportRequest

---

## Role Levels vs Employee Hierarchy — Two Independent Systems

Genesis CRM separates **access control** (what you can do) from
**organizational structure** (who reports to whom). These are deliberately
decoupled so changes to one never affect the other.

### Role levels — determine permissions

The `roles` table stores a **level** per role. Lower number = more powerful.
The middleware checks `userLevel <= threshold` to grant access.

```text
Level 1 → platform_admin  (platform-wide)
Level 2 → super_admin     (full tenant access)
Level 3 → admin           (configure system)
Level 4 → team_lead       (custom — inserted dynamically)
Level 5 → manager         (team/hierarchy scoped)
Level 6 → user            (own records only)
Level 7+→ custom roles    (unlimited nesting)
```

When a new role is **inserted** at an occupied level, all roles at that
level and below shift down by 1 (like inserting a row in a spreadsheet).
When a role is **deleted**, roles below shift up to close the gap.

### Employee hierarchy — determines reporting chain

The `employee_hierarchy` closure table stores **who reports to whom**:

```text
ancestor_id | descendant_id | depth
ADMIN001    | ADMIN001      | 0      ← self-row
ADMIN001    | MGR001        | 1      ← direct report
ADMIN001    | USR001        | 2      ← 2 levels down
MGR001      | USR001        | 1      ← direct report
```

This table has **no reference to roles or levels**. It only stores
ancestor/descendant pairs and depth. It answers: "Who are my reports?"

### Why they're independent

| Action | Impact on hierarchy | Impact on permissions |
|--------|--------------------|-----------------------|
| Insert role at level 4 | None — zero rows touched | Roles renumber |
| Delete role at level 4 | None — zero rows touched | Gap closes |
| Change role level 5→3 | None | That role gets admin access |
| Move employee to new manager | Hierarchy rebuilds | None |
| Create employee under parent | Hierarchy entries added | None |

An employee's **access scope** comes from their role level.
The hierarchy determines **which records** they can see at that scope:

1. Look up employee's role → find level in `roles` table
2. If level <= 4 (manager threshold) → scope = "team records"
3. Query `employee_hierarchy WHERE ancestor_id = X` → get subordinates
4. Filter records by those subordinate IDs

Changing role levels never touches `employee_hierarchy`.
Changing the org chart never touches `roles`.

---

## Security Design Principles

1. **Every action is audited** — `platform_audit_logs` captures admin ID, action, target, details, IP, and user agent

2. **Soft-delete with recovery** — Tenant deletion has a 30-day window before permanent removal

3. **Impersonation is logged** — Start time, end time, reason, and actions are all tracked

4. **Least privilege** — Platform admin capabilities are granular per endpoint

5. **Cannot self-destruct** — Platform admins cannot deactivate other platform admins

6. **Rate limits per plan** — Prevent abuse without blocking legitimate usage

7. **Feature flags have rollout control** — Gradual rollout (0-100%) prevents big-bang deployments

8. **Row-level tenant isolation** — Prisma middleware ensures no cross-tenant data leakage

9. **max_users enforcement** — Employee creation blocked when tenant's plan limit is reached

---

## File Structure

```text
backend/
  prisma/
    schema.prisma              # +12 platform tables, tenant_id on all scoped tables
    seed.js                    # +platform_admin role, plans, flags, tenant, policy
  src/
    middleware/
      authenticate.js          # +requirePlatformAdmin, impersonation middleware
      tenant-scope.js          # Prisma middleware for auto tenant_id injection
    services/platform/
      tenant.service.js        # Tenant CRUD, config, usage, stats
      subscription.service.js  # Plan CRUD, comparison, delete guard
      feature-flag.service.js  # Flag CRUD, toggle, rollout, tenant overrides
      platform-audit.service.js# Immutable logging, query, stats
      announcement.service.js  # Announcement CRUD, runtime filtering
      analytics.service.js     # Overview, growth, feature usage, revenue, churn
      security.service.js      # Policies, passwords, sessions, rate limits, exports
    routes/platform/
      index.js                 # All platform API routes (60+ endpoints)
    routes/auth/
      index.js                 # Auth + employee CRUD + hierarchy (transactional)
    app.js                     # Registers /api/platform routes

frontend/
  src/
    services/
      platform.service.js      # API client for all platform endpoints
      auth.service.js          # Employee CRUD, roles, branches, hierarchy
    store/
      authStore.js             # +isPlatformAdmin(), +getTenantId()
    pages/platform/
      PlatformDashboard.jsx    # Overview dashboard
      TenantsPage.jsx          # Tenant management + Provision Admin
      FeatureFlagsPage.jsx     # Feature flag management
      PlansPage.jsx            # Subscription plan management
      AnnouncementsPage.jsx    # System announcements
      AnalyticsPage.jsx        # Platform analytics
      SecurityPage.jsx         # Security controls
      AuditLogPage.jsx         # Audit log viewer
    pages/builder/
      EmployeesPage.jsx        # Employee CRUD with org chart (admin)
      RolesPage.jsx            # Role hierarchy & permissions view (admin)
    components/layout/
      Sidebar.jsx              # +Platform section, +Employees & Roles links
      ProtectedRoute.jsx       # +platform_admin inherits all access
    App.jsx                    # +8 platform + 2 builder routes
```
