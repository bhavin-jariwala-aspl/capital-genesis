# Plans & Feature Entitlements — Genesis CRM

**Audience:** platform administrators who price and package the product, plus the engineers who
gate code on a feature.

---

## The short version

Three things decide whether a customer has a feature. In this order:

| # | Input | Where you set it | What it means |
|---|-------|------------------|---------------|
| 1 | **The plan** | Platform ▸ Plans | What was sold. A feature the plan excludes is off. |
| 2 | **The flag** | Platform ▸ Feature Flags | Whether we have shipped it yet. Can only *withhold*. |
| 3 | **The override** | Platform ▸ Tenants ▸ **Features** | The deliberate exception. Wins over both. |

To give one customer something their plan does not include, use an override. To give every customer
on a tier something, change the plan. To take something away from everyone while you fix it, use the
flag.

---

## Why it is built this way

### The plan is the commercial floor

`subscription_plans.features` is the entitlement. It is the layer that decides what a customer
bought, so it is checked first and a feature outside it is off.

### A flag can withhold, never grant

A feature flag answers a different question from a plan: *have we shipped this?* — for gradual
rollout and for remote kill-switches. It is therefore allowed to withhold a feature the plan
includes, and never to grant one that was not sold.

That asymmetry is deliberate and load-bearing. If a flag could grant, switching one on platform-wide
would silently hand paid functionality to every free tenant, and the blast radius of a routine
rollout would be the whole price book.

### An override is the only thing allowed to contradict the plan

Real operations need exceptions in both directions: a pilot for a customer evaluating an upgrade, a
goodwill grant during a trial, a feature pulled from a tenant that is abusing it. Requiring a price
change to do any of that would mean operators either could not act or would corrupt the price book
to act. So the override wins, and it is the last word.

It is also the only one of the three that is per-customer, which is why it lives on the tenant
rather than in the price book.

### Core features are outside all of it

A few features are marked core (the record engine, for one) and are always on for every plan, with
no way to switch them off. An operator must not be able to leave a customer with a working login and
nothing behind it.

---

## Managing features for one tenant

**Platform ▸ Tenants**, then the ✨ **Features** action on the row.

Every feature shows its resolved state, a badge saying which input decided it, and the reason in
words. Each row offers three choices:

| Choice | Effect |
|--------|--------|
| **Plan default** | Follow the plan. The normal state. |
| **Granted** | On for this workspace, even if the plan excludes it. |
| **Revoked** | Off for this workspace, even if the plan includes it. |

**Plan default is how you undo an exception.** A two-state switch would let you create an override
and never remove it — the tenant would stop tracking its own plan forever, including when you later
upgrade them. That is why there are three states and not two.

Use **Exceptions only** to see just the overrides; on a healthy tenant that list is empty.

### The badges

| Badge | Meaning |
|-------|---------|
| **In plan** | Included in the tenant's plan, nothing else to say. |
| **Upgrade** | Not sold at this tier. The row says which tier it needs. |
| **Override** | Granted or revoked for this workspace specifically. |
| **Rollout** | Sold, but this workspace is in or outside a partial rollout cohort. |
| **Off** | Sold, but the feature is switched off platform-wide right now. |
| **Core** | Always on. |

---

## Managing plans

**Platform ▸ Plans.**

The shipped tiers, cheapest first:

| Plan | Price | Users | For |
|------|-------|-------|-----|
| **Free** | $0 | 3 | Evaluation — records, pipelines, dashboards, email |
| **Starter** | $29/mo | 10 | A small agency — quoting, policy admin, workflows, reports, documents |
| **Professional** | $79/mo | 50 | A growing agency — underwriting, claims, commissions, automation, forecasting |
| **Enterprise** | $199/mo | 999 | The full platform — SSO, carrier feeds, AI assistance, data export |

Each tier is a **strict superset** of the one below. That holds by construction, not by discipline:
a feature declares the cheapest tier that includes it (`min_plan`) and inclusion is a rank
comparison, so nothing can be in Starter but missing from Professional. A new feature lands in the
right tiers the moment it is added to the catalogue.

### Two views

- **Cards** — price, limits, feature count and how many tenants are on each plan. Check the tenant
  count before changing a plan: it is the number of customers the change affects.
- **Compare** — tiers across the top, the whole feature catalogue down the side. This is the view
  that answers "is Professional actually a superset of Starter?", which four separate cards cannot.

### Editing a plan

The editor has pricing, the six numeric limits, and a **grouped feature picker** with select-all per
group. **Use the standard set for this tier** resets the picker to the catalogue default.

Two things the editor will not let you do:

- **Rename a plan.** `tenants.plan` points at the name, so renaming would orphan every tenant on it.
  Create a new plan and move tenants instead.
- **Set limits below zero, or a trial longer than a year.** Both used to be accepted; a negative cap
  locks a tenant out of their own workspace.

A plan showing a **tier default** badge has no explicit feature list stored — it is displaying the
catalogue derivation for its tier. That is the state of every plan created before entitlements
existed, and it is a sensible default rather than a problem; saving the plan makes the list explicit.

### Plans created before the feature catalogue

`subscription_plans.features` used to hold free text (`basic_crm`, `workflow_automation`, …) that
matched no catalogue key. A plan row still carrying that list is **not** treated as a curated
selection — it falls back to the standard set for its tier, and the card shows a **tier default**
badge. Without that fallback every such plan would sell only the core record engine, whatever tier
it claimed to be.

The distinction is whether *any* entry is a key the catalogue understands. One is enough: no legacy
name collides with a catalogue key, so a partial match means somebody edited the plan in this
editor, and a deliberately narrow selection is honoured even when it sells less than its tier.

Nothing needs migrating — the fallback applies at read time. To replace the legacy strings with real
keys, either open the plan and save it, or use **Reset features** on its card.

### Changing a tenant's plan

Use **Change plan** on the tenant row. Limits and features both follow immediately — the entitlement
cache is dropped as the change is written, so the tenant's Features panel is accurate on the next
load.

---

## Feature flags

**Platform ▸ Feature Flags.** Use one when you need to roll a feature out gradually or switch it off
remotely — not to decide what a customer has bought.

Each card now names **which catalogue feature it controls** and **from which tier that feature is
sold**. A flag whose name matches no catalogue feature is labelled *gates nothing sellable*: it is a
switch with nothing behind it, which is worse than no switch. Either rename it to a catalogue key or
delete it.

| Category | Meaning |
|----------|---------|
| `general` | A feature sold from Starter or Professional |
| `premium` | A feature sold only at Enterprise |
| `beta` | Mid-rollout — expect a partial `rollout_percent` |
| `experimental` | Not ready for anyone by default |

**Rollout percentage** splits tenants deterministically by id (`tenant_id % 100 < percent`), so a
tenant does not flap in and out of the cohort between requests. Only tenants whose plan includes the
feature are eligible at all.

---

## For engineers

### Gating code on a feature

```js
const EntitlementService = require('../services/platform/entitlement.service');
const entitlements = new EntitlementService(fastify.prisma);

if (!await entitlements.isEnabled('ins_claims', req.user.tenant_id)) {
  throw new ValidationError('Claims management is not included in this plan.');
}
```

`FeatureFlagService.isEnabled(name, tenantId)` delegates here, so existing call sites keep working
and became plan-aware without being touched — including the underwriting guards in
`routes/insurance` and `routes/runtime`, which call `isEnabled('underwriting_workflow', …)`.

### Adding a feature

1. Add an entry to `FEATURES` in `backend/src/services/platform/feature-catalogue.js`:

   ```js
   f('ins_reinsurance', 'Reinsurance treaties', 'insurance', 'enterprise', {
     description: 'Treaty definitions, cessions and bordereaux.' }),
   ```

2. Reference the key from the code that gates on it.
3. Set `flag: true` **only** if you want rollout control — most features do not need a flag row, and
   one nobody will ever touch is clutter.

`min_plan` does the tier work: the feature appears in that tier and every tier above it, in the plan
editor, in the comparison grid and in every tenant's Features panel, with no lists to update.

### The catalogue is code, not data

A feature key is referenced by a code branch, so it lives next to that code. A key that exists in a
table but in no branch does nothing; a key a branch expects but no row defines fails silently.
What each *customer* gets is data, and lives in `subscription_plans.features` and
`tenant_feature_overrides`.

### Files

| File | Role |
|------|------|
| `backend/src/services/platform/feature-catalogue.js` | The vocabulary: features, groups, tiers, `min_plan` derivation, legacy aliases |
| `backend/src/services/platform/entitlement.service.js` | The resolver: plan → flag → override, with the reason |
| `backend/src/services/platform/subscription.service.js` | Plan CRUD, feature validation, the comparison grid |
| `backend/src/services/platform/feature-flag.service.js` | Flag CRUD; `isEnabled` delegates to the resolver |
| `frontend/src/pages/platform/TenantFeaturesPanel.jsx` | The per-tenant matrix and the three-state control |
| `frontend/src/pages/platform/PlansPage.jsx` | The plan editor's feature picker and the comparison view |
| `backend/tests/entitlements.test.js` | 54 tests, most of them about the resolution order |

### Caching

Resolved entitlements are memoised per tenant for 30 seconds. Anything that changes an answer drops
the memo as it writes — a plan edit, a flag toggle, a rollout change, an override, a plan change on a
tenant. If you add a new write path that affects entitlements, call
`EntitlementService.invalidate(tenantId)` (or `invalidate()` for a global change), or your change
will appear not to take effect for up to the TTL.

### Legacy flag names

Five `feature_flags` rows predate the catalogue and are still referenced by deployed databases and
by code. They resolve through an alias rather than a migration against production:

| Deployed flag name | Catalogue key |
|--------------------|---------------|
| `underwriting_workflow` | `ins_underwriting` |
| `ai_underwriting` | `ins_ai_underwriting` |
| `advanced_workflows` | `auto_approvals` |
| `policy_analytics` | `analytics_policy` |
| `api_v2` | `plat_api_v2` |

`dark_mode` is deliberately **not** aliased: it was never a sellable feature, it is a per-user
appearance preference, and it gated nothing. New code should use catalogue keys.

---

## API

All under `/api/platform`, all requiring `platform_admin`.

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/feature-catalogue` | The vocabulary: groups, features, and which tiers include each |
| `GET` | `/tenants/:id/features` | One tenant's matrix: every feature, its state, the reason, a summary |
| `PUT` | `/tenants/:id/features/:key` | `{ enabled: true \| false \| null }` — grant, revoke, or clear |
| `PUT` | `/tenants/:id/features` | `{ features: { key: true\|false\|null } }` — a whole group at once |
| `GET` | `/plans` | Plans with resolved features and tenant counts |
| `GET` | `/plans/compare` | The comparison grid: tiers, features by group, limits |
| `POST` | `/plans/:id/reset-features` | Reset a plan to the catalogue default for its tier |

Every override change is written to the platform audit log (`tenant.feature_override`).

---

## How a plan is enforced

Three layers, from the inside out:

1. **The API refuses.** `middleware/require-feature.js` gates the insurance route families
   (quoting, policy administration, underwriting, claims, commissions, carrier feeds, application
   documents) and the write paths of the Workflow and Assignment builders. A refusal is a 403 with
   `code: FEATURE_NOT_ENTITLED` naming the feature and the tier it is sold from. Reference data
   every insurance tenant has from Starter — products, carriers, templates — is never gated.
2. **The server hides shipped modules.** `/runtime/modules` and `/runtime/bootstrap` drop the
   shipped modules (`quotes`, `claims`, `underwriting`, …) the plan excludes, so they never reach the
   sidebar. Modules a tenant made itself are never gated.
3. **The client explains.** `FeatureGate` wraps the tenant-facing routes and, for a locked feature,
   shows a page naming it, quoting the server's reason, and telling an admin where the plan is
   changed — rather than a redirect that reads as a bug. The sidebar hides locked tools and Builder
   sections. Until bootstrap has delivered the entitlement list the client fails **open**; the
   server never does.

Platform admins pass every gate: they have no tenant of their own, and the console must not be
locked out of a customer's data by that customer's plan.

`GET /api/auth/entitlements` returns `{ plan, features, locked }` — the enabled keys, and for each
locked one the source and reason. The same block ships inside the bootstrap payload.

### Adding a gate

- A single route: `{ preHandler: [authenticate, requireFeature('ins_claims')] }`.
- A route family: add a `[prefix, key]` pair to that plugin's `featureGateByPrefix` table. Matching
  is on the declared route pattern, longest prefix first.
- A shipped module: add its `name` to `MODULE_FEATURE` in `routes/runtime`.
- A client page: add its route prefix to `ROUTE_FEATURE` in `frontend/src/utils/featureMap.js`.

`tests/require-feature.test.js` covers the 403 shape, the platform bypass, the prefix table and
registration-time rejection of a key the catalogue does not know.
