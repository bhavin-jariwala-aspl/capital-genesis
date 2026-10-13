'use strict';

const {
  FEATURES, FEATURE_KEYS, CORE_FEATURE_KEYS,
  getFeature, isFeatureKey, canonicalKey, defaultFeaturesForPlan, normaliseFeatureList,
  hasCuratedFeatures,
} = require('./feature-catalogue');
const { ValidationError, NotFoundError } = require('../../utils/errors');

/**
 * Entitlements — the one place that answers "does this tenant have feature X?".
 *
 * ── The three inputs, and why the order is what it is ───────────────────────
 * There used to be no answer to that question. `feature_flags` resolved
 * override -> rollout -> global default and never looked at the plan;
 * `subscription_plans.features` was free text nothing read. So a `premium` flag
 * gated nothing, and a customer's plan bought them nothing.
 *
 * Three things now decide, in this order:
 *
 *   1. **The plan says what was sold.** `subscription_plans.features` is the
 *      entitlement, so a feature the plan does not include is off. This is the
 *      commercial floor, and it is the layer that was missing entirely.
 *
 *   2. **A feature flag says whether we have shipped it yet.** Only the
 *      catalogue entries marked `flag: true` have one — things we want to roll
 *      out gradually or kill remotely. A flag can only ever *withhold* a
 *      feature the plan includes; it cannot grant one that was not sold, so
 *      switching a flag on globally can never hand paid functionality to a
 *      free tenant by accident.
 *
 *   3. **A per-tenant override is the deliberate exception**, and it is the
 *      only input allowed to contradict the other two — in both directions. An
 *      operator granting `auto_approvals` to a Starter tenant for a pilot,
 *      or revoking a feature from a tenant that is abusing it, must not have to
 *      rewrite the price book to do it. That is why an override wins: anything
 *      weaker would make the escape hatch useless, and anything applied earlier
 *      would be silently overturned by the plan.
 *
 * Every answer carries the `source` that decided it, because "why can this
 * customer not see quoting?" is the question an operator actually asks, and a
 * bare boolean cannot answer it.
 *
 * Core features (`core: true`) sit outside all of this and are always on — an
 * operator must not be able to revoke the record engine and leave a customer
 * with a working login and nothing behind it.
 */

/** How long a tenant's resolved entitlements are trusted. */
const TTL_MS = 30_000;

/** How an entitlement was decided. Ordered from most to least specific. */
const SOURCE = Object.freeze({
  CORE:            'core',             // always on
  TENANT_OVERRIDE: 'tenant_override',  // explicit grant or revoke
  FLAG_ROLLOUT:    'flag_rollout',     // within/outside the rollout cohort
  FLAG_DISABLED:   'flag_disabled',    // shipped but switched off globally
  PLAN:            'plan',             // included in the plan
  PLAN_EXCLUDED:   'plan_excluded',    // not in the plan — needs an upgrade
});

/** tenantId -> { at, map } */
const memo = new Map();

/** Forget a tenant's resolved entitlements. Call after any change that affects them. */
function invalidate(tenantId) {
  if (tenantId == null) memo.clear();
  else memo.delete(Number(tenantId));
}

class EntitlementService {
  /**
   * @param {import('@prisma/client').PrismaClient} prisma
   */
  constructor(prisma) {
    this.db = prisma;
  }

  // -- Resolution ------------------------------------------------------------

  /**
   * Every feature's state for one tenant.
   *
   * @param {number} tenantId
   * @param {{ fresh?: boolean }} [opts] `fresh` bypasses the memo
   * @returns {Promise<Record<string, {
   *   key: string, enabled: boolean, source: string,
   *   in_plan: boolean, override: boolean|null, reason: string
   * }>>}
   */
  async resolve(tenantId, { fresh = false } = {}) {
    const id = Number(tenantId);
    if (!Number.isInteger(id) || id <= 0) return this.#allOff('No tenant in context');

    const hit = memo.get(id);
    if (!fresh && hit && Date.now() - hit.at < TTL_MS) return hit.map;

    const [tenant, overrides] = await Promise.all([
      this.db.tenant.findUnique({ where: { id }, select: { id: true, plan: true } }),
      this.db.tenantFeatureOverride.findMany({
        where:  { tenant_id: id },
        select: { is_enabled: true, flag: { select: { name: true } } },
      }),
    ]);
    if (!tenant) return this.#allOff('Workspace not found');

    const planFeatures = await this.#planFeatureSet(tenant.plan);
    // Overrides hang off a flag row, so `flag.name` may be a legacy name —
    // canonicalise before keying, or a pre-catalogue override is ignored.
    const overrideByKey = new Map();
    for (const o of overrides) {
      const key = canonicalKey(o.flag?.name);
      if (key) overrideByKey.set(key, o.is_enabled);
    }
    const flagByKey = await this.#flagMap();

    const map = {};
    for (const feature of FEATURES) {
      map[feature.key] = this.#decide(feature, { id, planFeatures, overrideByKey, flagByKey });
    }

    memo.set(id, { at: Date.now(), map });
    return map;
  }

  /** Decide one feature. Pure given its inputs — see the class note for the order. */
  #decide(feature, { id, planFeatures, overrideByKey, flagByKey }) {
    const inPlan = planFeatures.has(feature.key);
    const override = overrideByKey.has(feature.key) ? overrideByKey.get(feature.key) : null;
    const base = { key: feature.key, in_plan: inPlan, override };

    if (feature.core) {
      return { ...base, enabled: true, source: SOURCE.CORE, reason: 'Always included' };
    }

    // The deliberate exception, and the only input allowed to contradict the plan.
    if (override !== null) {
      return {
        ...base,
        enabled: override,
        source:  SOURCE.TENANT_OVERRIDE,
        reason:  override
          ? (inPlan ? 'Granted for this workspace' : 'Granted for this workspace (not in plan)')
          : 'Revoked for this workspace',
      };
    }

    if (!inPlan) {
      return {
        ...base,
        enabled: false,
        source:  SOURCE.PLAN_EXCLUDED,
        reason:  `Not included in the ${feature.min_plan} plan or below — requires ${feature.min_plan}`,
      };
    }

    // Sold, so now: have we shipped it to this tenant yet?
    const flag = flagByKey.get(feature.key);
    if (flag) {
      if (!flag.is_enabled && flag.rollout_percent <= 0) {
        return { ...base, enabled: false, source: SOURCE.FLAG_DISABLED, reason: 'Switched off platform-wide' };
      }
      if (flag.rollout_percent > 0 && flag.rollout_percent < 100) {
        const inCohort = id % 100 < flag.rollout_percent;
        return {
          ...base,
          enabled: inCohort,
          source:  SOURCE.FLAG_ROLLOUT,
          reason:  `${flag.rollout_percent}% rollout — this workspace is ${inCohort ? 'in' : 'outside'} the cohort`,
        };
      }
      if (!flag.is_enabled) {
        return { ...base, enabled: false, source: SOURCE.FLAG_DISABLED, reason: 'Switched off platform-wide' };
      }
    }

    return { ...base, enabled: true, source: SOURCE.PLAN, reason: 'Included in the plan' };
  }

  /** Everything off, with one reason — for a missing or contextless tenant. */
  #allOff(reason) {
    return Object.fromEntries(FEATURES.map((x) => [x.key, {
      key: x.key,
      enabled: Boolean(x.core),
      source: x.core ? SOURCE.CORE : SOURCE.PLAN_EXCLUDED,
      in_plan: Boolean(x.core),
      override: null,
      reason: x.core ? 'Always included' : reason,
    }]));
  }

  /**
   * The feature set a plan sells.
   *
   * Falls back to the catalogue's `min_plan` derivation when the plan row has
   * no explicit list — which is the state of every plan created before this
   * existed, so the fallback is what keeps those plans meaningful rather than
   * empty.
   */
  async #planFeatureSet(planName) {
    const plan = await this.db.subscriptionPlan.findUnique({
      where:  { name: String(planName ?? 'free') },
      select: { name: true, features: true },
    });
    // A stored list counts only when at least one entry is a key we
    // understand. A pre-catalogue list (`'basic_crm'`, …) normalises to the
    // core features alone, so honouring it as curated made every deployed
    // plan — Enterprise included — sell one feature out of thirty-seven. See
    // `hasCuratedFeatures`.
    const keys = hasCuratedFeatures(plan?.features)
      ? normaliseFeatureList(plan.features)
      : defaultFeaturesForPlan(plan?.name ?? planName);
    return new Set(keys);
  }

  /**
   * Flag rows keyed by **catalogue key**. Only catalogue-named flags
   * participate; a row named anything else gates nothing sellable.
   *
   * The keying matters: a deployed row is stored under its legacy name
   * (`advanced_workflows`), while `#decide` looks it up by catalogue key
   * (`auto_approvals`). Indexing by the raw name would quietly drop every
   * pre-catalogue flag's rollout and kill-switch state.
   */
  async #flagMap() {
    const rows = await this.db.featureFlag.findMany({
      select: { id: true, name: true, is_enabled: true, rollout_percent: true },
    });
    const map = new Map();
    for (const row of rows) {
      const key = canonicalKey(row.name);
      // A catalogue-key row wins over a legacy-named one for the same feature,
      // so a deployment that has both does not depend on read order.
      if (key && (!map.has(key) || row.name === key)) map.set(key, row);
    }
    return map;
  }

  // -- Queries ---------------------------------------------------------------

  /**
   * Is one feature on for this tenant?
   * The hot path: `FeatureFlagService.isEnabled` and route guards use this.
   */
  async isEnabled(featureKey, tenantId) {
    // The resolved map is keyed by catalogue key, but callers legitimately pass
    // a legacy flag name (`advanced_workflows`). Canonicalise or the lookup
    // silently misses and the feature reads as off.
    const key = canonicalKey(featureKey);
    if (!key) return false;
    const map = await this.resolve(tenantId);
    return Boolean(map[key]?.enabled);
  }

  /** Just the enabled keys — what a client needs to hide what it cannot use. */
  async enabledKeys(tenantId) {
    const map = await this.resolve(tenantId);
    return FEATURE_KEYS.filter((k) => map[k].enabled);
  }

  /**
   * The console view for one tenant: the catalogue, each feature's resolved
   * state, and a count summary.
   */
  async tenantMatrix(tenantId) {
    const id = Number(tenantId);
    const tenant = await this.db.tenant.findUnique({
      where:  { id },
      select: { id: true, name: true, slug: true, plan: true, status: true },
    });
    if (!tenant) throw new NotFoundError('Tenant');

    const [map, plan] = await Promise.all([
      this.resolve(id, { fresh: true }),
      this.db.subscriptionPlan.findUnique({
        where:  { name: tenant.plan },
        select: { name: true, label: true, features: true },
      }),
    ]);

    const { catalogueForConsole } = require('./feature-catalogue');
    const catalogue = catalogueForConsole();
    const groups = catalogue.groups.map((g) => ({
      ...g,
      features: g.features.map((x) => ({ ...x, state: map[x.key] })),
    }));

    const all = Object.values(map);
    return {
      tenant,
      plan: plan ? { name: plan.name, label: plan.label } : { name: tenant.plan, label: tenant.plan },
      plans: catalogue.plans,
      groups,
      summary: {
        total:     all.length,
        enabled:   all.filter((s) => s.enabled).length,
        in_plan:   all.filter((s) => s.in_plan).length,
        granted:   all.filter((s) => s.override === true).length,
        revoked:   all.filter((s) => s.override === false).length,
      },
    };
  }

  // -- Mutation --------------------------------------------------------------

  /**
   * Set a per-tenant override, or clear it back to the plan's answer.
   *
   * `enabled: null` removes the override — the third state the console needs so
   * an operator can undo an exception rather than being stuck with a permanent
   * grant or revoke.
   *
   * An override needs a `feature_flags` row to hang off (that is where the
   * schema puts `tenant_feature_overrides.flag_id`), so one is created on
   * demand for any catalogue feature. Creating it lazily keeps the flag list
   * free of thirty-odd rows nobody has ever touched.
   *
   * @param {number} tenantId
   * @param {string} featureKey
   * @param {boolean|null} enabled
   * @param {string|null} actorId
   */
  async setOverride(tenantId, featureKey, enabled, actorId = null) {
    const id = Number(tenantId);
    const feature = getFeature(featureKey);
    if (!feature) throw new ValidationError(`Unknown feature "${featureKey}"`);
    if (feature.core) throw new ValidationError(`"${feature.label}" is part of the core product and cannot be switched off`);
    if (enabled !== null && typeof enabled !== 'boolean') {
      throw new ValidationError('enabled must be true, false, or null to inherit the plan');
    }

    const tenant = await this.db.tenant.findUnique({ where: { id }, select: { id: true } });
    if (!tenant) throw new NotFoundError('Tenant');

    const flag = await this.#ensureFlagRow(feature, actorId);

    if (enabled === null) {
      await this.db.tenantFeatureOverride.deleteMany({ where: { tenant_id: id, flag_id: flag.id } });
    } else {
      await this.db.tenantFeatureOverride.upsert({
        where:  { tenant_id_flag_id: { tenant_id: id, flag_id: flag.id } },
        create: { tenant_id: id, flag_id: flag.id, is_enabled: enabled, updated_by: actorId },
        update: { is_enabled: enabled, updated_by: actorId },
      });
    }

    invalidate(id);
    const map = await this.resolve(id, { fresh: true });
    return map[feature.key];
  }

  /**
   * Apply several overrides at once, so the console can save a whole group.
   * @param {number} tenantId
   * @param {Record<string, boolean|null>} changes
   */
  async setOverrides(tenantId, changes, actorId = null) {
    const entries = Object.entries(changes ?? {});
    if (!entries.length) throw new ValidationError('No feature changes supplied');
    const unknown = entries.map(([k]) => k).filter((k) => !isFeatureKey(k));
    if (unknown.length) throw new ValidationError(`Unknown feature(s): ${unknown.join(', ')}`);

    const results = {};
    for (const [key, value] of entries) {
      results[key] = await this.setOverride(tenantId, key, value, actorId);
    }
    return results;
  }

  /**
   * Find or create the `feature_flags` row a catalogue feature hangs off.
   *
   * The row's `name` is the catalogue key, which is what ties the two systems
   * together: before this, flag names and plan feature names shared nothing, so
   * neither could refer to the other.
   */
  async #ensureFlagRow(feature, actorId) {
    const existing = await this.db.featureFlag.findUnique({
      where:  { name: feature.key },
      select: { id: true },
    });
    if (existing) return existing;
    return this.db.featureFlag.create({
      data: {
        name:            feature.key,
        label:           feature.label,
        description:     feature.description || null,
        category:        feature.flag ? 'beta' : 'general',
        // A row created only to hold an override must not change the answer for
        // anyone else, so it ships enabled at full rollout: the plan and the
        // override decide, not this row's existence.
        is_enabled:      true,
        rollout_percent: 100,
        created_by:      actorId,
      },
      select: { id: true },
    });
  }
}

module.exports = EntitlementService;
module.exports.SOURCE = SOURCE;
module.exports.invalidate = invalidate;
module.exports.TTL_MS = TTL_MS;
module.exports.CORE_FEATURE_KEYS = CORE_FEATURE_KEYS;
