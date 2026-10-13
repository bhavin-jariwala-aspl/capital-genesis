'use strict';

const { AuthorizationError } = require('../utils/errors');
const EntitlementService = require('../services/platform/entitlement.service');
const { getFeature } = require('../services/platform/feature-catalogue');

/**
 * Feature gates — make a plan mean something on the request path.
 *
 * ── Why this exists ─────────────────────────────────────────────────────────
 * The entitlement engine (September 2026) answers "does this tenant have
 * feature X?" correctly, but until now exactly one route asked it — the
 * underwriting guard. A Starter tenant could open Claims, Commissions and the
 * automation builders and use them in full, because nothing between the URL
 * and the service checked the plan. The price book was a suggestion.
 *
 * Two shapes, for two kinds of route file:
 *
 *   requireFeature('ins_claims')
 *     A per-route preHandler. Use it where routes are declared one by one.
 *
 *   featureGateByPrefix([['/claims', 'ins_claims'], …])
 *     A single plugin-level hook that maps the *route pattern* (not the URL)
 *     to a feature by its first segment. Use it where one plugin declares
 *     dozens of routes under a handful of prefixes — a table beats ninety
 *     annotations, and a new route under an existing prefix is gated without
 *     anyone remembering to add one.
 *
 * Both fail with a 403 that names the feature and the tier it is sold from,
 * so the client can show an upgrade prompt rather than a generic error. The
 * error carries `code: 'FEATURE_NOT_ENTITLED'` and `feature` / `min_plan`
 * fields for exactly that purpose.
 *
 * Platform admins pass every gate: they have no tenant, and the console must
 * not be locked out of a tenant's data by that tenant's plan.
 */

class FeatureNotEntitledError extends AuthorizationError {
  constructor(feature) {
    super(`${feature.label} is not included in your plan. It is available from the ${feature.min_plan} plan.`);
    this.code = 'FEATURE_NOT_ENTITLED';
    this.feature = feature.key;
    this.min_plan = feature.min_plan;
    this.details = [{ feature: feature.key, label: feature.label, min_plan: feature.min_plan }];
  }
}

/** One resolver per Prisma client, so the memo is shared across gates. */
const resolvers = new WeakMap();
function resolverFor(prisma) {
  let svc = resolvers.get(prisma);
  if (!svc) { svc = new EntitlementService(prisma); resolvers.set(prisma, svc); }
  return svc;
}

/**
 * Throw unless the request's tenant is entitled to `featureKey`.
 * @param {import('fastify').FastifyRequest} request
 * @param {string} featureKey
 */
async function assertEntitled(request, featureKey) {
  const feature = getFeature(featureKey);
  if (!feature) throw new Error(`requireFeature: "${featureKey}" is not a catalogue feature`);

  const user = request.user;
  // A platform admin has no tenant of their own; the console is never gated.
  if (user?.role === 'platform_admin' || user?.tenant_id == null) return;

  const prisma = request.server?.prisma;
  if (!prisma) return; // unit tests without a client — nothing to check against

  const enabled = await resolverFor(prisma).isEnabled(feature.key, user.tenant_id);
  if (!enabled) throw new FeatureNotEntitledError(feature);
}

/**
 * Per-route preHandler.
 * @param {string} featureKey a catalogue key
 */
function requireFeature(featureKey) {
  // Fail at registration, not at first request, for a key that is not real.
  if (!getFeature(featureKey)) throw new Error(`requireFeature: "${featureKey}" is not a catalogue feature`);
  return async function checkFeature(request) {
    await assertEntitled(request, featureKey);
  };
}

/**
 * Plugin-level hook mapping route-pattern prefixes to features.
 *
 * Matches against `request.routeOptions.url` — the declared pattern such as
 * `/claims/:id/reserves` — so a match is on the route the developer wrote,
 * never on user-supplied path text. The longest matching prefix wins, so
 * `/claims/adjuster-queue` can be gated differently from `/claims` if ever
 * needed. Routes matching no prefix are left alone.
 *
 * @param {Array<[string, string]>} table `[prefix, featureKey]` pairs
 */
function featureGateByPrefix(table) {
  const entries = table
    .map(([prefix, key]) => {
      if (!getFeature(key)) throw new Error(`featureGateByPrefix: "${key}" is not a catalogue feature`);
      return { prefix: prefix.replace(/\/+$/, ''), key };
    })
    .sort((a, b) => b.prefix.length - a.prefix.length);

  return async function gateByPrefix(request) {
    const pattern = request.routeOptions?.url ?? '';
    // The plugin prefix (`/api/insurance`) is part of the pattern; strip it so
    // the table can be written against the paths as declared in the file.
    const local = pattern.replace(/^\/api\/[^/]+/, '') || '/';
    const hit = entries.find((e) => local === e.prefix || local.startsWith(`${e.prefix}/`));
    if (hit) await assertEntitled(request, hit.key);
  };
}

module.exports = { requireFeature, featureGateByPrefix, assertEntitled, FeatureNotEntitledError };
