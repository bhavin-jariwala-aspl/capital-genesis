# Genesis CRM — Security Implementation

## Overview

This document provides a comprehensive analysis of the security features implemented in the Genesis CRM platform. The
system demonstrates robust security practices across authentication, authorization, data protection, and workflow
security.

---

## Authentication & Authorization

### JWT-Based Authentication

**Implementation**: `backend/src/plugins/jwt.js`, `backend/src/middleware/authenticate.js`

- **JWT Token Management**: Secure token generation with configurable expiry (default 8 hours)
- **Token Verification**: Middleware-based JWT verification on all protected routes
- **Configuration**: Environment-based JWT secret management (`JWT_SECRET`, `JWT_EXPIRY`)
- **Refresh and revocation (October 2026)**: rotating refresh tokens and per-user revocation; see [Sessions, two-factor and personal data](#sessions-two-factor-and-personal-data-october-2026)

```javascript
// Fastify JWT plugin with secure configuration
fastify.register(jwt, {
  secret: config.jwt.secret,
  sign: { expiresIn: config.jwt.expiry },
});
```

### Password Security

**Implementation**: `backend/src/services/auth.service.js`

- **Bcrypt Hashing**: Passwords hashed using bcryptjs with salt rounds of 12
- **Password Comparison**: Secure password verification during login
- **Password Updates**: Validates current password before allowing changes

```javascript
// Secure password hashing
const hashed = await bcrypt.hash(newPassword, 12);

// Secure password verification
const valid = await bcrypt.compare(password, employee.password);
```

### Password Reset (Forgot Password)

**Implementation**: `backend/src/services/auth.service.js` · routes in `backend/src/routes/auth/index.js`

Self-service reset is designed so a database leak or a probing attacker gains nothing:

- **Hashed tokens at rest**: the reset token is a random 32-byte value emailed to the
  user; only its **sha256 hash** is stored in `employees.reset_token`. The raw token
  never touches the database.
- **Short expiry & single use**: tokens expire after 1 hour (`reset_token_expires`)
  and are cleared once the password is changed, so a link cannot be replayed.
- **No account enumeration**: `POST /auth/forgot-password` always returns the same
  generic message, and email-send failures are swallowed (logged internally), so the
  response never reveals whether an account or email exists.

```javascript
// Store only the hash of the emailed token
const rawToken = crypto.randomBytes(32).toString('hex');
await db.employee.update({
  where: { employee_id },
  data: {
    reset_token: crypto.createHash('sha256').update(rawToken).digest('hex'),
    reset_token_expires: new Date(Date.now() + 60 * 60 * 1000),
  },
});
```

> **Hardening TODO**: `forgot-password` is currently unthrottled. Add rate limiting
> (per-IP and per-account) before production to prevent reset-email flooding.

### Role-Based Access Control (RBAC)

**Implementation**: `backend/src/middleware/authenticate.js`

Levels are **inverted — a lower number is more powerful** — and unlimited nesting is supported, so a
tenant may add roles at any level from 2 downwards.

```javascript
// The frozen ladder the authorization gates compare against.
const BUILTIN_ROLE_LEVEL = Object.freeze({
  platform_admin:     1,  // reserved — platform-wide
  super_admin:        2,
  admin:              3,
  manager:            4,
  user:               5,
});
```

- **Role-based middleware**: `requireRole(name)` builds a gate whose threshold comes from the frozen
  ladder. `name` must be a built-in — a typo throws at startup rather than producing a gate nobody
  (or everybody) can pass.
- **Admin-only routes**: Builder functionality restricted to level <= 3.
- **The platform gate** additionally insists on the role *name* `platform_admin`, because a mistake
  there is cross-tenant.
- **`ROLE_LEVEL`** is a separate, mutable map of name → level *hints*, used only when a token
  predates the `role_level` claim. It absorbs custom **system** roles (`tenant_id IS NULL`) at boot
  and never overwrites a built-in name. See *Authorization: three escalation paths closed* below for
  why that distinction matters.

---

## Permission System

### Two-Tier Permission Model

**Implementation**: `backend/src/services/permission.service.js`

#### 1. UI/Metadata Permissions (`ui_permissions`)

Controls access to system configuration:

- **Entities**: modules, objects, fields, forms, pipelines, wizards
- **Granularity**: `can_view` and `can_edit` permissions per role
- **Inheritance**: Child entities inherit parent permissions

#### 2. Operational Permissions (`operational_permissions`)

Controls data access based on scope:

- **View Scope**: `own` | `team` | `hierarchy` | `all`
- **Edit/Delete Scope**: Granular modification control
- **Assignment Scope**: Controls record assignment capabilities
- **Default Fallbacks**: Sensible defaults when no explicit permissions exist

```javascript
const DEFAULT_OPERATIONAL_PERMS = {
  super_admin: {
    view_scope: "all",
    create_scope: "all",
    edit_scope: "all",
    delete_scope: "all",
    assign_scope: "all",
  },
  user: {
    view_scope: "own",
    create_scope: "own",
    edit_scope: "own",
    delete_scope: "own",
    assign_scope: "none",
  },
  // ... other roles
};
```

For complete permission model documentation, see [../admin-guide/PERMISSIONS_AND_ROLES.md](../admin-guide/PERMISSIONS_AND_ROLES.md).

---

## Input Validation & Security

### Schema Validation

**Implementation**: `backend/src/utils/schemas.js`

- **Fastify JSON Schemas**: Comprehensive validation patterns
- **Format Validation**: Email, URL, phone number, color code validation
- **Length Constraints**: String length limits and character restrictions
- **Numeric Validation**: Range validation and positive number enforcement

```javascript
const commonProps = {
  email: { type: "string", format: "email" },
  url: { type: "string", format: "uri" },
  phone: { type: "string", pattern: "^[\\d\\s\\-\\+\\(\\)]+$" },
  color: { type: "string", pattern: "^#[0-9A-Fa-f]{6}$" },
  name: { type: "string", pattern: "^[a-z][a-z0-9_]*$", maxLength: 50 },
};
```

### Tenant Scoping

- **Prisma tenant-scoping extension** (v4.0.4) —
  `backend/src/middleware/tenant-scope.js` uses `prisma.$extends()` to inject
  `tenant_id` into reads, writes-with-where, upserts and creates. All `.create()`
  calls inside `$transaction` blocks must also pass `tenant_id` explicitly as a
  safety net (see Architecture doc for the required pattern).

  > ⚠️ **The extension is currently inert on most routes.** It reads the tenant from
  > `AsyncLocalStorage`, but `authenticate` calls `tenantContext.enterWith()` *after*
  > `await request.jwtVerify()`. After that await the hook resumes in a child async
  > context which Fastify discards, so the store never reaches the handler:
  > `getTenantId()` returns `null` and the extension **skips scoping entirely** —
  > reads run unscoped across all tenants, and creates fail with
  > `Argument 'tenant' is missing`. Verified empirically in August 2026 against the
  > shared instance.
  >
  > `tests/tenant-als-propagation.test.js` passes only because its preHandler calls
  > `enterWith` with **no preceding await**, so it does not exercise the real path.
  >
  > **Mitigation status:** the reporting routes work around this locally by wrapping
  > each handler in `tenantContext.run({ tenantId })` (see
  > [REPORTING.md](REPORTING.md#tenant-scoping--a-local-workaround)), and the
  > scheduled-report sweeper does the same since it has no request. **Every other
  > route is still affected.** The fix is to verify the JWT synchronously
  > (`request.server.jwt.verify(token)`) and set `request.user` + `enterWith` in a
  > non-async preHandler — deferred because enabling real scoping will begin filtering
  > queries that currently return cross-tenant rows, which needs its own change and
  > regression pass (watch the `role.findFirst({ tenant_id: null })` global-role
  > fallbacks and the `platform/index.js` bypass).

### Silent Failure Observability (v3.1.2+)

- `RecordService.#audit()` now logs warnings via
  `logger.warn` instead of silently swallowing errors. This preserves
  non-blocking behavior while ensuring audit failures are observable.

### Comprehensive Pipeline Audit Trail (v3.2+)

- **Every** mutating action on pipeline data writes an `audit_logs` entry
  attributed to the logged-in user: record `create` / `update` /
  `stage_change` (single + bulk) / `delete` (soft or hard, mode captured) /
  `restore` / `purge`, plus pipeline-config `pipeline.create` /
  `pipeline.update` / `pipeline.delete`.
- **Tamper/loss resistance:** the `audit_logs.record_id` FK is
  **`ON DELETE SET NULL`** (not cascade), so an entry survives a hard-delete
  or purge of its record — the original id is preserved in `changes`.
  Previously a hard delete cascade-removed its own audit entry.
- Attribution comes from the authenticated JWT (`req.user.employee_id`);
  tenant isolation is enforced by the tenant-scope Prisma extension.
- Readable via `GET /runtime/records/:id/audit` (per record) and
  `GET /builder/pipelines/:id/audit` (per pipeline, admin).

### Inbound Webhook Hardening (v3.2+)

The public, unauthenticated `POST /api/integrations/inbound/:name` endpoint
(`routes/integration-inbound/index.js`) is protected by defence-in-depth:

- **HMAC-SHA256 signature** verification against `config.secret` (`X-Signature-256`)
  when a secret is configured — the auth equivalent for external callers.
- **Replay / idempotency guard** — each request is fingerprinted (caller
  `Idempotency-Key`, else the signature, else a raw-body hash) and stored in Redis
  for 24 h; a replayed or duplicate request is acknowledged with `200 { duplicate }`
  and **not re-processed**. This defeats replay of a captured signed request and
  makes sender retries idempotent.
- **Body-size cap (1 MB)** enforced *inside* the `preParsing` hook before the raw
  body is buffered for HMAC — closes the unbounded-buffering DoS (previously the
  global 50 MB limit applied).
- **Rate limit** — Redis fixed window per (integration, client IP), `429` past
  120 req/min.
- These degrade **fail-open** if Redis is unavailable (except the body cap, always on),
  so a Redis outage never blocks legitimate webhooks.

Admin-gated reads: `GET /builder/integrations*` (list/detail/logs/stats/event-catalog)
are `requireAdmin` because the rows carry signing secrets and outbound auth headers.

**Remaining hardening (not yet implemented):** signing secrets are returned in full
to admins for the edit form (consider masking + change-only updates); and a
crash-durable outbound-delivery outbox (outbound deliveries currently retry
synchronously with backoff but are in-memory until delivered).

### Central error-status integrity (v3.2+)

- The global `setErrorHandler` (`app.js`) surfaces **any** error carrying an explicit
  4xx `statusCode` (hand-thrown `{ statusCode, message }`, `requireFields` 400s) as
  that status — previously only `401` was honoured and everything else was masked as a
  generic `500`, hiding validation/not-found errors from clients.

### Date Coercion Safety (v3.1.2+)

- `RecordService.#upsertCrmEntity()` validates `close_date` and
  `birthdate` with `isNaN(d.getTime())` before storing, preventing
  `Invalid Date` objects from reaching the database.

### Field-Level Permission Defaults (v3.1.3+)

- `MetadataService.getFormForViewer()` now defaults `can_edit` to
  `true` for fields without explicit `ui_permissions` rows. The
  previous `false` default caused all form fields to be read-only
  for non-admin roles when no field permissions were configured.

### Reporting: sharing vs. data scope (Aug 2026)

**Implementation**: `backend/src/services/report-library.service.js`,
`backend/src/routes/reports/index.js`

Self-service reporting means any authenticated user can build, save, share and schedule a
report without an administrator. Two **independent** controls keep that from becoming a
data-access hole:

- **Visibility** decides who may *open* a report — `private` | `team` | `shared` | `everyone`
  (`canView`). `shared_with` is consulted **only** for `shared`. Editing and deleting stay
  with the author and admins (`assertCanEdit`); everyone else gets *Save as a copy*.
- **Scope** decides which records a report *shows*. `resolveScope()` downgrades any requested
  scope to what the caller's own role allows (admins `all`, managers `team` via the hierarchy
  closure, everyone else `me`). **Sharing therefore never widens data access** — a report
  shared with everyone still shows each viewer only their own slice.

A **scheduled** delivery is scoped from the *subscription owner's* role, so a schedule cannot
be used to email data its owner could not see interactively. Recipient lists are
regex-validated, de-duplicated and capped at 25 addresses, so a subscription cannot be turned
into a mailing relay.

### Reporting: injection surfaces closed by design (Aug 2026)

**Implementation**: `backend/src/services/report.service.js`

- **No expression language.** Calculated measures are `{ op, a, b }` where `op` comes from a
  fixed list and `a`/`b` name earlier measures or are numeric constants. Nothing is `eval`d
  or parsed, so there is no formula-injection surface. Only *earlier* measures are
  referenceable, which makes reference cycles impossible by construction.
- **No user-supplied field or model names reach Prisma.** Every field key is resolved through
  the registry (`getField`) before use; an unknown key is dropped with a warning rather than
  interpolated. Filters build Prisma `AND`/`OR` clause objects — never string SQL — and the
  engine never uses `$queryRaw`, so the tenant-scope extension applies to every read.
- **HTML output is escaped.** `toHtml()` (the print view and the scheduled-email body) passes
  all report content through `escapeHtml()`; report data is user-controlled and lands in both
  a browser and an email client.
- **Export filenames are sanitised** to `[a-z0-9 _-]` before reaching `Content-Disposition`,
  so a report name cannot inject a response header.
- **Row cap.** Reads are capped at 20 000 rows (`FETCH_CAP`) with the truncation surfaced to
  the user, bounding the memory a single crafted report can consume.

### Removed: arbitrary outbound fetch from dashboard widgets (Aug 2026)

**Implementation**: `frontend/src/hooks/useDataSource.js`

Dashboard widgets previously supported `data_source.type: 'api'` — an arbitrary URL with
hand-written headers, fetched **from the browser** via `fetchExternal`. Scheme validation
limited it to `http:`/`https:` (CWE-918), but it still let any dashboard author aim the
viewer's browser at a host of their choosing and carried credentials in a config blob that is
copied between dashboards and cached in Redis.

The mode has been **removed entirely**, along with `fetchExternal`; the descriptor no longer
resolves. Widgets now read from a saved report or a built-in dataset, both server-side and
tenant-scoped. Note this was a *browser-side* fetch, so it was never an SSRF vector against
the backend — the outbound-webhook guard below remains the single policy for server-side
outbound requests.

### SQL Injection Prevention

**Implementation**: Prisma ORM throughout the application

- **Parameterized Queries**: All database operations use Prisma's type-safe query builder
- **Type Safety**: Strong typing prevents malicious input injection
- **Transaction Safety**: Atomic operations with proper rollback handling

---

## Infrastructure Security

### Database Security

**Implementation**: `backend/src/app.js`

- **Connection Pooling**: Configured with connection limits to prevent exhaustion
- **Pool Timeout**: 30-second timeout prevents hanging connections
- **URL Sanitization**: Database URL parameters safely appended

```javascript
// Connection pool tuning
if (!dbUrlObj.searchParams.has("connection_limit")) dbUrlObj.searchParams.set("connection_limit", "10");
if (!dbUrlObj.searchParams.has("pool_timeout")) dbUrlObj.searchParams.set("pool_timeout", "30");
```

### Inbound Webhook Security

**Implementation**: `backend/src/services/integration.service.js`

- **HMAC-SHA256 Verification**: All inbound webhooks verified via `X-Signature-256` header
- **Timing-Safe Comparison**: Uses `crypto.timingSafeEqual` (length-guarded) to prevent timing oracle attacks
- **Raw Body Capture**: `preParsing` hook captures exact byte sequence before JSON parsing
- **Tenant Isolation**: The verified payload is logged, and any workflow bridged via `config.event_map` runs inside
  the owning tenant's context

### Outbound Webhook Security

**Implementation**: `backend/src/services/integration.service.js` (`OutboundWebhookConnector`)

- **SSRF Protection**: `OutboundWebhookConnector.isSafeUrl()` is the single outbound-URL policy for the whole app —
  both integration deliveries and the workflow `webhook` step delegate to it. It rejects non-`http(s)` schemes and
  private / loopback / link-local hosts, including IPv6-bracketed forms (`[::1]`), IPv4-mapped IPv6
  (`::ffff:127.0.0.1`), and integer/hex-encoded IPv4 (`2130706433`, `0x7f000001`).
- **HMAC-SHA256 Request Signing**: When an outbound integration has a `config.secret`, each request is signed over
  the exact transmitted body and sent as `X-Signature-256: sha256=<hex>` — the symmetric counterpart to inbound
  verification, so a receiver can authenticate Genesis.
- **Delivery Semantics**: Any non-2xx response is treated as a failed delivery; transient failures (network error,
  timeout, HTTP 429/5xx) are retried with exponential backoff. Deterministic errors (SSRF block, missing URL) are
  not retried.

---

## Tenant Isolation — context propagation fixed (Sept 2026)

`authenticate()` used to `await request.jwtVerify()` **before** calling `tenantContext.enterWith()`. After
an `await`, the hook resumes in a child async context that Fastify discards when the hook resolves, so the
tenant never reached the route handler: `getTenantId()` returned `null` on every authenticated request, the
Prisma tenant-scope extension skipped scoping (unscoped reads), and creates omitted `tenant_id` (500s such
as "Argument `tenant` is missing"). Reporting and social worked around it with per-route
`tenantContext.run` wrappers.

The hook now verifies the token **synchronously** (`request.server.jwt.verify(token)`) and calls
`enterWith()` with no preceding `await`, so the store binds to the request's own async resource. The
currency profile is installed the same way from a memoised cache (`CurrencyService.peek`), warmed for every
tenant at boot. `tests/authenticate-tenant-context.test.js` drives the real hook through Fastify + @fastify/jwt
and asserts propagation, 60-way concurrent isolation, platform-admin bypass and 401s.

Two scoping refinements shipped with it:

- **System roles.** `Role.tenant_id` is nullable — `null` rows are the shared system roles. Scoped reads on
  `Role` now match `tenant_id = mine OR tenant_id IS NULL`, so `admin`/`manager`/`user` remain visible; an
  explicit `tenant_id: null` filter (system-only) is honoured; creates still stamp the tenant.
- **Models without `tenant_id`** must be listed in `GLOBAL_MODELS`, otherwise the injected filter is rejected
  by Prisma. One platform-level model was missing. `tests/tenant-scope-coverage.test.js` checks the whole list
  against the Prisma DMMF so a new model cannot slip through.

The `scopedHandler` wrapper remains on reporting and social as a belt-and-braces guard.

## Server-side field validation (Sept 2026)

`UiValidation` rules, `is_required`, `is_unique` and the formats implied by `field_type` are enforced by
`RecordService` on every create/update through `services/validation-engine.js` — before any write. Custom
JavaScript validators are **never executed on the server**. Failures return
`{ error: { code: 'VALIDATION_ERROR', message, details: [{ field, message }] } }`. See
[CONFIGURABILITY.md → Validation engine](CONFIGURABILITY.md#validation-engine).

## Login brute-force protection (Sept 2026)

`utils/rate-limit.js` — a fixed-window limiter backed by Redis when connected, falling back to an
in-process store (so a Redis outage degrades to per-pod limits, not to no limits):

| Endpoint | Key | Limit |
| --- | --- | --- |
| `POST /auth/login` | account (`employee_id`, case-insensitive) | 5 failures / 15 min — a successful login clears it |
| `POST /auth/login` | client IP | 30 attempts / 15 min |
| `POST /auth/forgot-password` | client IP | 5 / hour |
| `POST /auth/reset-password` | client IP | 10 / hour |

Over the limit the API answers `429 RATE_LIMITED` with a `Retry-After` header; the message never reveals
whether the account exists. The limiter is decorated as `fastify.rateLimiter` for reuse.

## Security response headers (Sept 2026)

An `onSend` hook adds `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`,
`Referrer-Policy: no-referrer`, `Permissions-Policy` (camera/microphone/geolocation off),
`Cross-Origin-Opener-Policy: same-origin`, `Cross-Origin-Resource-Policy: same-site`, and in production
`Strict-Transport-Security`. Equivalent to the API-relevant subset of `helmet`, without the dependency.

## Integration signing secrets are masked (Sept 2026)

`GET /builder/integrations*` never returns `config.secret`; the field is replaced by a fixed mask and
`config.has_secret` is added. An update that sends the mask back (or omits the key) keeps the stored secret;
an explicit blank clears it. Closes hardening follow-up #5.

## Authorization: three escalation paths closed (September 2026)

Three independent routes to authority a tenant was never granted. All three converged on the same
outcome — a tenant-level user acting as a **platform administrator**, which in a multi-tenant
deployment means reading every other customer's data.

### 1. An unresolvable role was treated as the most powerful role

`AuthService.login` resolved a user's authority by looking up their role name in `roles`
(tenant-scoped row first, then the shared system row) and ended with `role?.level ?? 1`. Level 1 is
`platform_admin`. So an employee whose role name matched **no row at all** signed in holding
platform-wide authority.

This was not a corner case: it was the guaranteed state of every newly created tenant. Roles are
tenant-scoped (`@@unique([tenant_id, name])`) and only the seeded demo tenant had rows, so the first
administrator of every tenant created through the console hit exactly this path. The same `?? 1`
appeared in the impersonation endpoint, and a permissive `?? 1` in the dashboard and runtime
visibility filters.

**Fixed**: `resolveRoleLevel(roleName, dbLevel)` is now the single resolver — the row's level, then
the built-in ladder, then `NO_ACCESS_LEVEL` (999). It also **clamps**: only the literal role name
`platform_admin` may hold level 1; any other name resolves to level 2 at best, whatever its row
says. `levelOf(user)` applies the same clamp to the `role_level` claim on a token.

### 2. One tenant's role name moved the gates for every tenant

`requireRole(minRole)` took its threshold from the process-wide `ROLE_LEVEL` map, and that map was
hydrated at boot from **every tenant's** `roles` rows with last-write-wins. Role names are
tenant-chosen, so:

- a tenant creating a role called `admin` at level 7 moved the admin bar to 7 for the whole
  deployment, letting level-5 users into the Builder everywhere;
- a tenant creating a role called `platform_admin` at level 2 (permitted — only level 1 was
  reserved) handed the platform console to every level-2 user in every tenant.

**Fixed**: the gates compare against the frozen `BUILTIN_ROLE_LEVEL`, which no row can touch.
`initRoleLevel` loads only system roles (`tenant_id IS NULL`) and never overwrites a built-in name.
The name `platform_admin` is reserved: `POST /api/auth/roles` rejects it, and no tenant-level route
will assign it.

### 3. A tenant admin could rewrite their own role

`PUT /api/auth/employees/:id` and `POST /api/auth/employees` spread `req.body` straight into the
Prisma `data`. A tenant admin (level <= 3) could therefore send `{ "role": "platform_admin" }` —
the `platform_admin` row is system-wide, so the level-1 lookup succeeded on their next sign-in — or
`{ "tenant_id": 7 }` to move an employee, or themselves, into another customer's workspace.

**Fixed**: both routes take an explicit field whitelist (`EMPLOYEE_WRITABLE`), so `tenant_id`,
`employee_id` and everything else off the list is dropped. `assertAssignableRole` additionally
requires that the role exists, is visible to this tenant, and is not reserved — which also closes
path 1 at the write end, since an employee can no longer be given a role that resolves to nothing.

`tests/authorization-hardening.test.js` pins all three, including the specific cases: a forged
`role_level: 1` claim, a tenant role merely *named* `platform_admin`, and a tenant role name never
reaching the hints map.

## Tenant lifecycle is enforced (September 2026)

`Tenant.status` was decorative. The admin guide promised that suspending a tenant made "all users
lose access", but nothing read the flag on the request path: every already-issued JWT kept working
until it expired, so a suspended or deleted customer carried on using the product. `trial_ends_at`
was written at creation and never read again.

`middleware/tenant-lifecycle.js` is now the single decision point, called from `authenticate()` on
every authenticated request **and** from `AuthService.login`, so both "no new sessions" and
"existing sessions stop" are covered. `suspended`, `cancelled` and `deleted` are refused with a 403
carrying a readable reason, as is a `trial` whose `trial_ends_at` has passed.

Operationally:

- the status is memoised for 30 seconds, so the check costs one query per tenant per TTL rather
  than one per request;
- every platform route that changes a status drops the memo as it writes, so suspend, reactivate,
  delete, restore and change-plan take effect on the next request rather than at the end of the TTL;
- a database error **fails open** and caches nothing — a connectivity blip must not lock every
  tenant out of the product, and the request that follows will fail on its own merits if the
  database really is down;
- the sign-in check runs **after** the password comparison, so the error cannot be used to tell a
  real account in a suspended tenant from one that does not exist.

Pinned by `tests/tenant-lifecycle.test.js`.

## Dashboard `min_role` was inverted (September 2026)

`ui_dashboards.min_role` is defined by the schema as the **least powerful** role admitted —
"'manager' = manager + admin + super_admin only". With inverted levels that means a viewer is
admitted when `viewerLevel <= minLevel`.

Both the list filter (`DashboardService.getDashboards`) and the single-dashboard gate
(`GET /api/runtime/dashboard/:id`) asked the opposite, `minLevel <= viewerLevel`. A board restricted
to managers was therefore **hidden from admins and super admins and shown to every ordinary user**.
`min_role` is the only restriction on a dashboard with no explicit `UiPermission` row — the default
for anything an admin builds by hand — so this was a live confidentiality bug, not a display quirk.

**Fixed**: the comparison lives in one place, `DashboardService.canSeeDashboard`, used by both call
sites so they cannot disagree again. Levels are now resolved from the **tenant's own** `roles` rows
rather than the process-wide hints map, because `min_role` is chosen in the Builder from the
tenant's role list and may name a custom role. A `min_role` whose role has since been deleted is
treated as admin-and-above: a dangling restriction must never widen access, but the board still has
to be reachable by someone who can repair it. `tests/dashboard-visibility.test.js` covers both
directions and asserts the two call sites agree.

## Provisioning crosses tenants deliberately, and only there (September 2026)

`TenantProvisioningService` is the one component that legitimately reads one tenant and writes
another: it clones a template tenant's UI metadata into a new workspace. It therefore runs with
**no** tenant in `AsyncLocalStorage` and addresses `tenant_id` explicitly on every query.

That is a deliberate exception, so it is tested as one. `tests/tenant-provisioning.test.js` asserts
that the clone runs unscoped, that every copied row is stamped with the **new** tenant, that every
foreign key is rewritten to the new tenant's rows rather than left pointing at the template's, that
rows it cannot remap (a `ui_permissions` row for an entity type outside the plan) are **dropped**
rather than copied with a foreign id, that the template tenant is left untouched, and that no
business-data model appears in the clone plan at all.

See [../admin-guide/TENANT_ONBOARDING.md](../admin-guide/TENANT_ONBOARDING.md).

## Dead authorization code removed (September 2026)

- **The `X-Impersonate-User` header path.** `middleware/authenticate.js` exported an `impersonation`
  hook that read the header, verified the caller was a platform admin and swapped
  `request.user`. It was imported by the platform routes but **never registered as a hook**, so the
  header was silently ignored on every route in the application while reading as a live feature in
  both the code and the admin guide. Removed; real impersonation mints a separate short-lived JWT
  through `POST /api/platform/impersonate`, which is audited and expires in an hour.
- **`RequestUtils.isSuperAdmin` / `requireSuperAdmin`.** `isSuperAdmin` compared the caller's level
  against `Math.max(...Object.values(ROLE_LEVEL))`, which every real role satisfies — the gate
  returned `true` for everybody. Unused, and removed rather than left as a guard that guards
  nothing.

## Missing-parameter guards returned 500, not 400 (September 2026)

Thirteen call sites in `routes/runtime`, `routes/builder` and `routes/activities` were written as
`return fastify.httpErrors.badRequest(...)`. `@fastify/sensible` is not part of this deployment, so
the `httpErrors` decorator does not exist: each of those guards threw
`TypeError: Cannot read properties of undefined` and the request answered **500**. Every
missing-`object_id`, missing-`csv_data` and invalid-`entity_type` request was reported to the client
as a server fault. They now throw the application's own `ValidationError` / `NotFoundError`, which
the error handler in `app.js` maps to 400 / 404 with a code and message.

## Role levels resolve from the tenant's roles table (September 2026)

A regression from the September authorization fix, caught on review. `initRoleLevel` had correctly
stopped absorbing every tenant's `roles` rows into the process-wide `ROLE_LEVEL` map, but five call
sites — the admin-bypass checks in `PermissionService` and `MetadataService`, and the
operational-scope defaults — still resolved a role's level from that map with no other source. Every
**custom** tenant role fell to `NO_ACCESS_LEVEL`: a `regional_manager` at level 4 dropped from
`hierarchy` scope to `own`; a custom admin-level role lost its admin bypass. The failure was toward
*less* access, so it was not an exposure, but it silently broke tenants with custom roles.

`services/role-level.js` is now the single resolver: the tenant's own `roles` row, then the shared
system row, then the built-in ladder, then no access — the same order as sign-in — memoised per
(tenant, role) for 30 s and dropped on any role write. `PermissionService`, `MetadataService` and
`DashboardService` all use it. A database error falls back to the built-in ladder for shipped roles
and fails closed for custom ones; it never becomes a 500. `tests/role-level.test.js`.

The client mirror: `ProtectedRoute` compared roles by **name**, turning away a custom admin-level
role from `/builder` that the server would admit. It now compares `role_level`.

## Plan entitlements are enforced on the request path (September 2026)

`middleware/require-feature.js` — `requireFeature(key)` per route and `featureGateByPrefix(table)`
per plugin. The prefix gate matches the **declared route pattern** (`request.routeOptions.url`),
never user-supplied path text, longest prefix first. A refusal is a 403 carrying
`code: FEATURE_NOT_ENTITLED` and `details: [{ feature, label, min_plan }]`. Platform admins pass
every gate. Applied to gated route families and to the write paths of the Workflow and
Assignment builders. (The `MODULE_FEATURE` map that hid plan-excluded shipped modules from
bootstrap was removed with the insurance modules, its only entries; every remaining module is
Builder metadata and is filtered by role.) The client's own gating
(`FeatureGate`, `useEntitlements`) fails **open** until bootstrap delivers; the server never does.
`tests/require-feature.test.js`.

## Access segmentation, public forms and formula safety (October 2026)

Full design: [PLATFORM_BUILDER_EXTENSIONS.md](PLATFORM_BUILDER_EXTENSIONS.md).

- **Business units and information barriers** add two filters on top of owner/hierarchy scope,
  applied in `RecordService` (list, get, bulk, related, lookup), global search, object analytics and
  record-attached documents. Barriers **bind administrators**; only `barrier_override` passes them.
  A record outside scope answers 404, not 403. Scope resolution **fails closed** on a database error.
  Wall-crossings need a decider who is not the requester. Tests: `tests/access-scope.test.js`.
- **Tamper-evident audit chain** (`audit_chain_events`): permission, membership, crossing and
  publishing changes are SHA-256 hash-chained per tenant; `GET /api/access/audit-chain/verify`.
- **Public web forms** are the only unauthenticated write path into tenant data. Guard rails: random
  48-hex key set only by the publish endpoint; laid-out fields only; consent enforced; honeypot;
  per-IP (20 per 10 minutes) and per-form (600 per 10 minutes) limits; optional reCAPTCHA; JSON
  schema; 64 KB body limit. The record is created inside `tenantContext.run` for the form's tenant.
- **Formulas never execute code.** A tokenizer/parser builds an AST that is evaluated against a
  function whitelist. The retired `custom` validation type ran admin-typed JavaScript through
  `new Function` in every user's browser (stored XSS); legacy `custom` rows are now inert.
- **Tenant pinning on writes.** The tenant extension overwrites `data.tenant_id` (and an upsert's
  `update.tenant_id`) on scoped writes, and module/object/form writes take column whitelists, so a
  body carrying `tenant_id` can no longer move a metadata row to another tenant
  (`tests/tenant-scope-writes.test.js`, `tests/metadata-writable.test.js`).
- **Documents inherit record access.** Every `/api/documents/:id` route and the record document list
  check that the caller can see the record the document is attached to.

## Sessions, two-factor and personal data (October 2026)

Delivered for the Genesis Capital PRD (E-01, E-02, E-16, X-08), for every tenant.

### Refresh tokens (`auth_refresh_tokens`)

- Stored only as SHA-256 hashes.
- Each use retires the token and issues a new one in the same *family*. Presenting a retired token again is treated as theft, and the whole family is revoked.
- `POST /api/auth/logout` revokes one token, or every session with `everywhere: true`.

### Access-token revocation (`employees.tokens_valid_after`)

- `authenticate` rejects any token issued before this time, and any token of an inactive employee. The check is cached for 30 seconds per instance, and the instance that revokes applies it immediately.
- It is set on deactivation (tenant and platform consoles), password change, password reset and *Sign out everywhere*.
- Tokens with a `purpose` claim (the five-minute MFA challenge) are never accepted as sessions.

### Who a workspace admin may manage (`findManageableEmployee`, `routes/auth`)

`PUT /api/auth/employees/:id`, `PATCH …/deactivate` and `PATCH …/reactivate` share one guard: a tenant-scoped
lookup (another workspace's employee is a 404); never the platform administrator, who signs in through a workspace
but is managed only from the platform console; never an account with more authority than the caller (that would
let an admin reset a super-admin's password); and no self-deactivation.

### Two-factor (TOTP) (`utils/totp.js`)

- RFC 6238 with ±1 step and constant-time comparison.
- The secret is stored encrypted (`enc:v1:`). Ten recovery codes are stored as hashes and each works once.
- Enforced when the tenant's security policy requires MFA. Users who have not enrolled are taken through set-up at sign-in.

### Personal data

- Fields with `config.encrypt` are stored AES-256-GCM encrypted under `FIELD_ENCRYPTION_KEY`. Set a dedicated 32-byte key in production; without it the key is derived from `JWT_SECRET`, which ties the two secrets together.
- Fields with `config.pii` are masked for roles without `view_pii`. Each reveal is written to the hash-chained audit, and so are views of objects with `config.audit_views`.
- `config.conceal_existence` removes even the count of hidden related records (STR "no tipping-off").

### Portal realm (`/api/portal`)

- Clients and introducers sign in with a 6-digit email code: 10-minute expiry, 5 attempts, rate limited per IP and per email.
- Their `gp1.` tokens are HMAC-signed with a separate key and are not JWTs, so staff routes cannot accept them and portal routes cannot accept staff tokens.
- Every portal query is filtered to records linked to the signed-in person.
- Uploads are restricted to PDF, JPEG and PNG, checked by content (magic bytes), up to 10 MB.
- Row actions (*Redeem* on a holding) run only on a row the signed-in person owns; the values that matter — which
  holding, which order type — come from the row (`prefill`) and the configuration (`defaults`), never from the request.

### Calendar feed tokens

- Signed over the user's `tokens_valid_after`, so any revocation also kills the feed URL.
- Every failure answers 404.

### Public data feeds

- Publish only the fields an administrator lists. Fields marked `pii` or `encrypt` are dropped even when listed.

### Public forms and sharing them (`/api/public`, `/api/web-forms`)

- A form's `field_options` is enforced on submit: a value the form never offered (a forex product on the loan
  calculator) is refused, not just hidden.
- Staff can email a form link to any address, so sending is limited to 30 per user per hour; what the user types
  (name, note) is HTML-escaped in the email, and every send is written to the email log.
- The link's base is `APP_URL` when set, otherwise the requesting browser's origin — set `APP_URL` in production so
  links always point at the public host.

Tests: `auth-hardening.test.js`, `field-protection.test.js`, `portal.test.js`, `calendar-feed.test.js`, `public-feed.test.js`, `public-form.test.js`, `web-form-share.test.js`, `employee-deactivation.test.js`.

## Areas for Security Enhancement

### Recommended Improvements

Items 1-3 of the previous list (tenant-isolation ALS propagation, login rate limiting, security
response headers) have shipped — see the sections above. What remains:

1. **Identity columns are unique platform-wide, not per tenant** (highest remaining severity for a
   multi-tenant deployment)
   - `employees.employee_id` (primary key), `employees.email`, `regions.region_code` and
     `branches.branch_code` are unique across the whole installation, so two tenants cannot both
     have an `ADMIN001`, a `WEST` region or an `HQ` office.
   - This is a scaling and usability constraint rather than a leak, but it also means an employee ID
     probe reveals whether an id exists *somewhere* on the platform.
   - Fix: make each composite with `tenant_id`. Needs a migration and a careful pass over
     `Employee`'s primary key, which several closure-table and FK relations reference.
   - Mitigated meanwhile: onboarding checks availability up front and suggests a workspace-prefixed
     id; provisioning generates tenant-qualified region and branch codes.

2. **Session Management**
   - Delivered in October 2026: refresh-token rotation, revocation on deactivation and password
     change, and *Sign out everywhere* (see above).
   - Still open: concurrent-session limits, SSO (OIDC/SAML) and SMS as a second factor.

3. **Audit Logging**
   - Permission changes (object and operational) are now written to the hash-chained audit
     (`audit_chain_events`), as are barrier memberships, wall-crossings, form publishing, PII reveals,
     record merges and sensitive views. `GET /api/access/audit-chain/verify` checks the chain.

---

Document Version: 1.2 — Last Updated: October 13, 2026
