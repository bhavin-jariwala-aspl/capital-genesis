# Step 5 — Who sees what

<!-- nav:top -->
> **[Docs roadmap](../README.md)** › **[Understanding Genesis](README.md)** › 5 of 8 · **For:** Everyone (Part B: admins, engineers)
> ← [Step 4 — How a request travels](04-how-a-request-travels.md) · [Step 6 — What happens automatically](06-what-happens-automatically.md) →
<!-- /nav:top -->

> **Track:** both. Part A for everyone, Part B for administrators and engineers. **Time:** 20 minutes.
>

## Part A — Seven locks, checked in order

Every time someone asks for data, the server checks a series of locks. Each one can only take away access, never add
it back.

| # | Lock | Question it answers | Genesis Capital example |
|---|---|---|---|
| 1 | **Workspace** | Is this my company's data? | Genesis Capital staff never see another customer's data |
| 2 | **Plan** | Has my company bought this feature? | Workflows need a plan that includes them |
| 3 | **Role permissions** | May my role use this module, object or field? | Only admins open the Builder |
| 4 | **Ownership** | Is this record mine, or my team's? | A relationship manager sees their own clients; their manager sees the team's |
| 5 | **Business unit** | Does it belong to an entity I work for? | Lending staff see lending records |
| 6 | **Information barrier** | Is it behind a wall I'm not inside? | Corporate-advisory deal records are hidden from the trading desk — even from administrators |
| 7 | **Personal data** | May I see this sensitive value unmasked? | An ID number shows as `••••1234` unless the role may reveal it, and every reveal is logged |

Two more controls protect *changes* rather than *views*:

- **Four-eyes approval** — some stage moves need a second person, and nobody can approve their own work.
- **Audit trail** — creates, edits, stage moves and deletes are logged; sensitive actions (revealing personal data,
  merging records, crossing a barrier, changing permissions) go into a tamper-evident chain where each entry is sealed
  with the one before it.

---

## Part B — How each lock works

### 1. Workspace (tenant isolation)

Every request runs inside a tenant context set by `authenticate`, and the Prisma tenant-scope extension adds
`tenant_id` to every query (Step 4). Roles are the one shared table: a workspace sees its own roles plus system roles
(`tenant_id` NULL). Suspended, cancelled or expired workspaces are blocked at sign-in and on every request.

### 2. Plan (entitlements)

Plan → feature flag → per-tenant override, resolved by `services/platform/entitlement.service.js`. Enforced on the
server by `middleware/require-feature.js` and in the browser by `FeatureGate`. Today the server-side gate covers
workflow and assignment-rule routes; other areas are gated in the browser only. Details:
[PLANS_AND_FEATURES](../platform-operations/plans-and-features.md).

### 3. Role level and role permissions

- **Role level** — a fixed ladder: 1 platform admin, 2 super admin, 3 admin, 4 manager, 5 user (lower is more
  powerful). Custom roles take a level from the `roles` table; an unknown role gets no access. Genesis Capital's
  managers (loans manager, COO, credit committees, BU heads) are level 4; desk roles (RM, analyst, compliance…) are 5.
- **Role permissions** (`ui_permissions`) — `can_view` / `can_edit` per module, object, field, dashboard and wizard.
  No row means view yes, edit no. Admins have full access. The workspace screens hide what a role may not view, and
  creating or editing a record requires `can_edit` on its object.
- **Operational permissions** (`operational_permissions`) — scopes (none / own / team / hierarchy / all) for tasks,
  activities and — for roles that have a saved row — business records, plus the flags `view_pii` and
  `barrier_override`.

### 4. Ownership (record scope)

`RecordService.#ownerFilter`:

| Viewer | Sees |
|---|---|
| Level 1–3 (admins) | All records |
| Level 4 (manager) | Records created by or assigned to anyone below them in the org tree (`employee_hierarchy`, a closure table holding every manager–report pair at every depth) |
| Level 5 | Records they created or are assigned |
| Any role with `view_scope: 'all'` on an object | All records of that object (Genesis Capital gives this to most desks; RMs and loans executives stay on "own") |
| A role with a saved *Record Permissions* row | Its saved view scope replaces the level rows above; the object rule still widens it |

A saved *Record Permissions* row also limits which records the role may create, edit (including stage moves),
delete and reassign — so "see every record, change only your own" is one object setting plus one role setting.
Roles without a row behave as in the table; admins are never restricted.

Opening a record outside one's scope returns "not found", not "forbidden", so its existence is not revealed.

### 5. Business units

`records.business_unit_id` is stamped from the object's business-unit field. A viewer who belongs to one or more units
(`employee_business_units`) sees those units' records and records with no unit. Admins and staff with no unit
membership are not restricted. Service: `access-scope.service.js`.

### 6. Information barriers

`records.barrier_zone_id` marks a record as inside a zone. A viewer sees it only as a zone member, through an
unexpired **wall crossing**, or with `barrier_override` (Genesis Capital's MLRO). This applies to admins too. A wall
crossing is requested, approved by someone else, time-limited (30 days by default, 365 at most) and written to the
audit chain. Service: `segmentation.service.js`.

### 7. Personal data

- Fields with `config.pii` are masked in every response (last four characters kept) for viewers without `view_pii`;
  `POST /api/runtime/records/:id/reveal` unmasks one value and records the reveal in the audit chain.
- Fields with `config.encrypt` are stored with AES-256-GCM (`enc:v1:…`) in `record_field_values.str_value`, so the
  database never holds them in clear. Encrypted values cannot be searched.

### Known gaps

Found while preparing this guide; worth closing:

| Gap | Effect |
|---|---|
| Record reads do not check the object's `can_view` | A role denied an object in the Builder still receives records of it through the API, within its ownership scope; the screens hide it |
| Field `can_view: false` hides the field on screen only | The value is still in the API response; use `pii` masking for genuinely sensitive values |
| Plan gates are enforced on the server for workflows and assignment only | Other features are hidden in the browser but reachable through the API |
| Portal tokens cannot be revoked and skip the workspace-status check after sign-in | A portal session lasts its full 8 hours |

More: [SECURITY](../developer-guide/security.md), [PERMISSIONS_AND_ROLES](../administration/permissions-and-roles.md),
[access & barriers user guide](../builder-guide/10-business-units-and-barriers.md).

## Go deeper

| If you are | Read next |
|---|---|
| Administrators | [Permissions & roles](../administration/permissions-and-roles.md) · [Permissions](../builder-guide/06-permissions.md) · [Roles & levels](../builder-guide/07-roles-and-levels.md) · [Org chart](../builder-guide/09-org-chart.md) · [Business units & barriers](../builder-guide/10-business-units-and-barriers.md) |
| Platform operators | [Plans & features](../platform-operations/plans-and-features.md) |
| Engineers | [Security](../developer-guide/security.md) · [Platform Builder extensions](../developer-guide/engines/platform-builder-extensions.md) (barriers, PII, portal, MFA) |

<!-- nav:bottom -->

---

### Where to next

| | |
|---|---|
| **Next** | [Step 6 — What happens automatically](06-what-happens-automatically.md) — What runs after a save: formulas, assignment, workflows, SLA timers, schedulers, audit |
| **Previous** | [Step 4 — How a request travels](04-how-a-request-travels.md) |
| **On these journeys** | [Decision-maker](../README.md#decision-maker) (step 6 of 8) · [Platform operator](../README.md#platform-operator) (step 3 of 9) |
| **Lost?** | [Docs roadmap](../README.md) · [Understanding Genesis](README.md) · [Understanding Genesis](README.md) |
<!-- /nav:bottom -->
