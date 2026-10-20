# Step 4 — How a request travels

<!-- nav:top -->
> **[Docs roadmap](../README.md)** › **[Understanding Genesis](README.md)** › 4 of 8 · **For:** Everyone (Part B: engineers)
> ← [Step 3 — How data is stored and read](03-how-data-is-stored.md) · [Step 5 — Who sees what](05-who-sees-what.md) →
<!-- /nav:top -->

> **Track:** both. Part A for everyone, Part B technical. **Time:** 15 minutes.
>

## Part A — From click to database and back

Think of the CRM as a restaurant. The **browser** is the dining room, where screens are drawn. The **server** is the
kitchen, where every rule is enforced. The **database** is the pantry, where everything is kept. The dining room never
goes into the pantry; it always asks the kitchen.

What happens when a relationship manager opens the Clients list:

1. **Sign-in, once.** They enter their employee ID and password (and a six-digit code if two-step sign-in is on). The
   server checks them against the `employees` table and hands back a **pass** — a signed token saying who they are,
   their role and their workspace.
2. **The screen asks for the blueprint.** The browser asks "which modules may I show, and what fields does a client
   have?". The server answers from the blueprint tables, usually from a fast cache.
3. **The screen asks for the records.** The browser asks "give me the clients". Every request carries the pass.
4. **The server checks the pass and applies the rules** — which workspace, which records this person may see (Step 5)
   — and reads the envelopes and values from the database (Step 3).
5. **The browser draws the list.** It keeps the answer for a few minutes, so moving between screens is quick, and asks
   again after anything is saved.

Saving works the same way in reverse: the browser sends the form; the server checks permissions and validates, writes
the record, answers straight away, and then lets the automations run (Step 6).

**Clients and introducers** use a separate, smaller **portal**. They sign in with a one-time code sent to their email
instead of a password, and see only the records linked to them.

---

## Part B — Technical detail

### The two sides

| | Browser (`frontend/`) | Server (`backend/`) |
|---|---|---|
| Built with | React 18, Vite, Tailwind, React Query, Zustand | Node.js, Fastify 5, Prisma, MySQL 8, Redis (optional) |
| Talks via | `services/api.js` (axios, base `/api`, `Authorization: Bearer`) | Route groups under `/api/*` registered in `src/app.js` |
| Holds state in | React Query cache (fresh for 5 min), persisted `metadataStore` | Database; Redis cache for metadata |

### Staff sign-in and the token

- `POST /api/auth/login` → `AuthService.login`: finds the `employees` row, rejects inactive accounts, checks the
  bcrypt hash, then checks the workspace is active. Rate-limited per account and per IP.
- With two-step sign-in (TOTP) enabled or required by policy, the first answer is a 5-minute challenge token;
  `POST /api/auth/mfa/verify` exchanges it for a session.
- The **access token** is a JWT valid 8 hours, carrying `employee_id`, `role`, `role_level`, `branchId`, `regionId`
  and `tenant_id`. A **refresh token** (14 days, stored only as a SHA-256 hash in `auth_refresh_tokens`) rotates on
  every use; replaying an old one revokes its whole family.
- "Sign out everywhere", a password change or a deactivation sets `employees.tokens_valid_after`, which invalidates
  every earlier token within about 30 seconds.
- The browser keeps the tokens in `localStorage` ("Remember me") or `sessionStorage`; on a 401 it tries one refresh,
  then signs out.

### Portal sign-in

`POST /api/portal/:slug/login/request` → a six-digit code, stored only as a hash (Redis, 10 minutes, 5 attempts).
`/login/verify` matches the email to a `party` record's `email` value (client) or an `introducer` record's
`portal_email` value, and issues a signed `gp1.…` token valid 8 hours. Portal requests can read only objects
configured for the portal, only records linked to the signed-in party, and only the configured fields.

### One request through the server

```text
GET /api/runtime/records?object_id=12
  authenticate (middleware/authenticate.js)
     verify JWT → enter tenant context (AsyncLocalStorage) → workspace status gate → revocation check
  route handler (routes/runtime/index.js)
  RecordService.getRecords (services/record.service.js)
     owner / business-unit / barrier filters (Step 5)
     Prisma query  ── tenant-scope extension adds  WHERE tenant_id = <caller's tenant>  to every query
  hydrate values, lookup labels, mask personal data (Step 3)
  ok(data) → { success: true, data }
```

The **tenant-scope extension** (`middleware/tenant-scope.js`) is a Prisma extension that adds the caller's
`tenant_id` to every read and pins it on every write, so application code rarely mentions the tenant. Platform tables
(`tenants`, plans, feature flags…) are exempt.

### The API route groups

| Prefix | Purpose |
|---|---|
| `/api/auth` | Sign-in, MFA, sessions, employees, roles, hierarchy |
| `/api/metadata`, `/api/builder` | Blueprint editing (admin only) |
| `/api/runtime` | Everything the workspace screens use: modules, objects, forms, records, import, forecast |
| `/api/activities`, `/api/tasks`, `/api/reminders`, `/api/notifications`, `/api/search` | Work around records |
| `/api/reports`, `/api/analytics`, `/api/ai-reports` | Reports, dashboard data, "Ask Genesis" |
| `/api/documents`, `/api/email`, `/api/social-media`, `/api/sla`, `/api/lead-scoring`, `/api/settings`, `/api/access` | Feature areas |
| `/api/integrations` | Inbound webhooks |
| `/api/public`, `/api/web-forms`, `/api/upload-links`, `/api/calendar`, `/api/portal` | Unauthenticated or portal-authenticated |
| `/api/platform` | Platform console (platform admin only) |

Every endpoint: [API_REFERENCE](../developer-guide/api-reference.md).

### Caching

Blueprint reads go through `CacheService.remember` (Redis, keys per tenant, 1-hour TTL, cleared on every Builder
change). If Redis is down, the server reads the database instead. A few per-process memos (30 seconds) cover role
levels, workspace status, entitlements and access scope. Records themselves are never cached on the server.
After a save, the browser's `utils/invalidate.js` refreshes the affected screens, and again 1.8 seconds later to pick
up changes made by workflows.

## Go deeper

| If you are | Read next |
|---|---|
| Platform operators | [Installation](../getting-started/installation.md) · [Platform administration](../platform-operations/platform-administration.md) |
| Engineers | [Architecture & setup](../developer-guide/architecture-and-setup.md) · [API reference](../developer-guide/api-reference.md) · [Security](../developer-guide/security.md) · [Performance](../developer-guide/performance-optimization.md) |

<!-- nav:bottom -->

---

### Where to next

| | |
|---|---|
| **Next** | [Step 5 — Who sees what](05-who-sees-what.md) — The seven access locks, from workspace to personal-data masking, and known gaps |
| **Previous** | [Step 3 — How data is stored and read](03-how-data-is-stored.md) |
| **On these journeys** | [Platform operator](../README.md#platform-operator) (step 2 of 9) |
| **Lost?** | [Docs roadmap](../README.md) · [Understanding Genesis](README.md) · [Understanding Genesis](README.md) |
<!-- /nav:bottom -->
