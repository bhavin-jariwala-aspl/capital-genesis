'use strict';

const { BaseRepository } = require('../../utils/repository');
const { NotFoundError, ConflictError, ValidationError } = require('../../utils/errors');
const EntitlementService = require('./entitlement.service');
const {
  PLAN_TIERS, defaultFeaturesForPlan, normaliseFeatureList, unknownFeatureKeys,
  catalogueForConsole, planRank, hasCuratedFeatures,
} = require('./feature-catalogue');

/** Numeric limits a plan carries, so validation and the editor agree. */
const LIMIT_FIELDS = Object.freeze([
  'max_users', 'max_storage_mb', 'max_api_calls', 'max_records', 'max_workflows', 'max_dashboards',
]);

class SubscriptionService extends BaseRepository {
  constructor(prisma) {
    super(prisma, 'subscriptionPlan');
  }

  /**
   * Plans, each with its resolved feature list and how many tenants are on it.
   *
   * `features` is filled in from the catalogue when the row has none — the
   * state of every plan created before the catalogue existed. Without that
   * fallback those plans would read as selling nothing at all.
   */
  async list() {
    const [plans, counts] = await Promise.all([
      this.db.subscriptionPlan.findMany({ orderBy: { order_index: 'asc' } }),
      this.db.tenant.groupBy({ by: ['plan'], _count: true }),
    ]);
    const tenantsByPlan = Object.fromEntries(counts.map((c) => [c.plan, c._count]));
    return plans.map((p) => ({
      ...p,
      features: this.#effectiveFeatures(p),
      features_explicit: hasCuratedFeatures(p.features),
      tenant_count: tenantsByPlan[p.name] ?? 0,
    }));
  }

  /**
   * The feature list a plan sells.
   *
   * Falls back to the tier default both when the column is empty and when it
   * holds a pre-catalogue list — see `hasCuratedFeatures`. Without the second
   * case every deployed plan resolved to the core features alone.
   */
  #effectiveFeatures(plan) {
    return hasCuratedFeatures(plan?.features)
      ? normaliseFeatureList(plan.features)
      : defaultFeaturesForPlan(plan?.name);
  }

  /** The feature catalogue, for the plan editor and the tenant feature matrix. */
  catalogue() {
    return catalogueForConsole();
  }

  /**
   * Reset a plan's features to the catalogue default for its tier.
   * The "start again" the editor needs once someone has hand-edited a plan into
   * an incoherent state.
   */
  async resetFeatures(id) {
    const plan = await this.getById(id);
    const updated = await this.db.subscriptionPlan.update({
      where: { id: plan.id },
      data:  { features: defaultFeaturesForPlan(plan.name) },
    });
    EntitlementService.invalidate();
    return { ...updated, features: this.#effectiveFeatures(updated) };
  }

  async getById(id) {
    const plan = await this.db.subscriptionPlan.findUnique({ where: { id: Number(id) } });
    if (!plan) throw new NotFoundError('Subscription plan');
    return plan;
  }

  async getByName(name) {
    const plan = await this.db.subscriptionPlan.findUnique({ where: { name } });
    if (!plan) throw new NotFoundError('Subscription plan');
    return plan;
  }

  async create(input) {
    const data = { ...input };
    if (!data.name || !String(data.name).trim()) throw new ValidationError('name is required');
    data.name = String(data.name).trim().toLowerCase().replace(/[^a-z0-9_]/g, '');
    if (!data.name) throw new ValidationError('name must contain letters, numbers or underscores');
    if (!data.label || !String(data.label).trim()) throw new ValidationError('label is required');

    const existing = await this.db.subscriptionPlan.findUnique({ where: { name: data.name } });
    if (existing) throw new ConflictError(`Plan '${data.name}' already exists`);

    this.#assertLimits(data);
    // An unspecified feature list means "the standard set for this tier"
    // rather than "nothing" — a plan that sells nothing is never what the
    // operator meant, and was the previous behaviour by omission.
    data.features = data.features === undefined
      ? defaultFeaturesForPlan(data.name)
      : this.#validateFeatures(data.features);

    const plan = await this.db.subscriptionPlan.create({ data });
    EntitlementService.invalidate();
    return { ...plan, features: this.#effectiveFeatures(plan) };
  }

  async update(id, input) {
    const existing = await this.getById(id);
    const data = { ...input };
    // `name` is the key `tenants.plan` points at, so renaming it would orphan
    // every tenant on the plan. The editor already disables the field.
    if (data.name !== undefined && data.name !== existing.name) {
      throw new ValidationError('A plan\'s name cannot be changed — tenants reference it. Create a new plan instead.');
    }
    delete data.name;
    this.#assertLimits(data);
    if (data.features !== undefined) data.features = this.#validateFeatures(data.features);

    const plan = await this.db.subscriptionPlan.update({ where: { id: Number(id) }, data });
    // Limits and features both change what tenants on this plan may do.
    EntitlementService.invalidate();
    return { ...plan, features: this.#effectiveFeatures(plan) };
  }

  /**
   * Reject feature keys the catalogue does not know.
   *
   * The column used to hold free text (`'basic_crm'`, `'workflow_automation'`)
   * that matched no feature flag and no code path, so it could never have an
   * effect. Validating against the catalogue is what makes the column mean
   * something.
   */
  #validateFeatures(features) {
    if (!Array.isArray(features)) throw new ValidationError('features must be an array of feature keys');
    const unknown = unknownFeatureKeys(features);
    if (unknown.length) {
      throw new ValidationError(`Unknown feature key(s): ${unknown.join(', ')}. See GET /api/platform/feature-catalogue.`);
    }
    return normaliseFeatureList(features);
  }

  /** Limits must be non-negative integers; a negative cap locks a tenant out. */
  #assertLimits(data) {
    for (const field of LIMIT_FIELDS) {
      if (data[field] === undefined) continue;
      const value = Number(data[field]);
      if (!Number.isInteger(value) || value < 0) {
        throw new ValidationError(`${field} must be a non-negative whole number`);
      }
      data[field] = value;
    }
    for (const field of ['price_monthly', 'price_annual']) {
      if (data[field] === undefined) continue;
      const value = Number(data[field]);
      if (!Number.isFinite(value) || value < 0) throw new ValidationError(`${field} must be zero or more`);
      data[field] = value;
    }
    if (data.trial_days !== undefined) {
      const value = Number(data.trial_days);
      if (!Number.isInteger(value) || value < 0 || value > 365) {
        throw new ValidationError('trial_days must be between 0 and 365');
      }
      data.trial_days = value;
    }
  }

  async delete(id) {
    const plan = await this.getById(id);
    // Check if any tenants use this plan
    const tenantsOnPlan = await this.db.tenant.count({ where: { plan: plan.name } });
    if (tenantsOnPlan > 0) {
      throw new ConflictError(`Cannot delete plan '${plan.name}' — ${tenantsOnPlan} tenant(s) are using it`);
    }
    return this.db.subscriptionPlan.delete({ where: { id: Number(id) } });
  }

  /**
   * The plan comparison grid: tiers across the top, the feature catalogue down
   * the side. This is what lets an operator see at a glance that Professional
   * really is a superset of Starter.
   */
  async compare() {
    const plans = await this.db.subscriptionPlan.findMany({
      where: { is_active: true },
      orderBy: { order_index: 'asc' },
    });
    const catalogue = catalogueForConsole();
    const rows = plans.map((p) => {
      const features = this.#effectiveFeatures(p);
      return {
        name: p.name,
        label: p.label,
        tier_rank: planRank(p.name),
        price_monthly: p.price_monthly,
        price_annual: p.price_annual,
        currency: p.currency,
        trial_days: p.trial_days,
        limits: {
          users: p.max_users,
          storage_mb: p.max_storage_mb,
          api_calls: p.max_api_calls,
          records: p.max_records,
          workflows: p.max_workflows,
          dashboards: p.max_dashboards,
        },
        features,
        feature_count: features.length,
      };
    });
    return { plans: rows, groups: catalogue.groups, tiers: PLAN_TIERS };
  }
}

module.exports = SubscriptionService;
module.exports.LIMIT_FIELDS = LIMIT_FIELDS;
