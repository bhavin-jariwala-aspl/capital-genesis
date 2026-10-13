'use strict';

const { BaseRepository } = require('../../utils/repository');
const { NotFoundError, ConflictError } = require('../../utils/errors');
const EntitlementService = require('./entitlement.service');
const { getFeature, isFeatureKey } = require('./feature-catalogue');

class FeatureFlagService extends BaseRepository {
  constructor(prisma) {
    super(prisma, 'featureFlag');
    this.entitlements = new EntitlementService(prisma);
  }

  /**
   * Anything that changes a flag or an override changes what tenants may do, so
   * the resolved-entitlement memo has to go with it — otherwise a toggle in the
   * console appears to do nothing for up to the TTL.
   */
  #forget(tenantId = null) {
    EntitlementService.invalidate(tenantId);
  }

  async list({ category } = {}) {
    const where = {};
    if (category) where.category = category;

    const flags = await this.db.featureFlag.findMany({
      where,
      orderBy: { name: 'asc' },
      include: {
        _count: { select: { tenant_overrides: true } },
      },
    });

    // Say which catalogue feature each row controls, and from which plan tier
    // it is sold. A flag whose name is not a catalogue key (or a legacy alias)
    // controls nothing an operator can sell — the console labels it as such
    // rather than implying it gates something.
    return flags.map((flag) => {
      const feature = getFeature(flag.name);
      return {
        ...flag,
        feature: feature
          ? { key: feature.key, label: feature.label, group: feature.group, min_plan: feature.min_plan }
          : null,
      };
    });
  }

  async getById(id) {
    const flag = await this.db.featureFlag.findUnique({
      where: { id: Number(id) },
      include: {
        tenant_overrides: {
          include: { tenant: { select: { id: true, name: true, slug: true } } },
        },
      },
    });
    if (!flag) throw new NotFoundError('Feature flag');
    return flag;
  }

  async create(data) {
    const existing = await this.db.featureFlag.findUnique({ where: { name: data.name } });
    if (existing) throw new ConflictError(`Feature flag '${data.name}' already exists`);
    return this.db.featureFlag.create({ data });
  }

  async update(id, data) {
    await this.getById(id);
    const flag = await this.db.featureFlag.update({ where: { id: Number(id) }, data });
    this.#forget();
    return flag;
  }

  async toggle(id, enabled) {
    await this.getById(id);
    const flag = await this.db.featureFlag.update({
      where: { id: Number(id) },
      data: { is_enabled: enabled },
    });
    this.#forget(); // global change — every tenant's answer may differ now
    return flag;
  }

  async setRollout(id, percent) {
    await this.getById(id);
    const flag = await this.db.featureFlag.update({
      where: { id: Number(id) },
      data: { rollout_percent: Math.min(100, Math.max(0, percent)) },
    });
    this.#forget();
    return flag;
  }

  async delete(id) {
    await this.getById(id);
    const flag = await this.db.featureFlag.delete({ where: { id: Number(id) } });
    this.#forget();
    return flag;
  }

  // ── Per-tenant overrides ──────────────────────────────────

  async setTenantOverride(flagId, tenantId, enabled, config, adminId) {
    const row = await this.db.tenantFeatureOverride.upsert({
      where: { tenant_id_flag_id: { tenant_id: Number(tenantId), flag_id: Number(flagId) } },
      create: {
        tenant_id: Number(tenantId),
        flag_id: Number(flagId),
        is_enabled: enabled,
        config,
        updated_by: adminId,
      },
      update: { is_enabled: enabled, config, updated_by: adminId },
    });
    this.#forget(tenantId);
    return row;
  }

  async removeTenantOverride(flagId, tenantId) {
    const result = await this.db.tenantFeatureOverride.deleteMany({
      where: { tenant_id: Number(tenantId), flag_id: Number(flagId) },
    });
    this.#forget(tenantId);
    return result;
  }

  async getTenantFlags(tenantId) {
    const [allFlags, overrides] = await Promise.all([
      this.db.featureFlag.findMany({ orderBy: { name: 'asc' } }),
      this.db.tenantFeatureOverride.findMany({ where: { tenant_id: Number(tenantId) } }),
    ]);

    const overrideMap = new Map(overrides.map(o => [o.flag_id, o]));

    return allFlags.map(flag => {
      const override = overrideMap.get(flag.id);
      return {
        id: flag.id,
        name: flag.name,
        label: flag.label,
        category: flag.category,
        global_enabled: flag.is_enabled,
        effective_enabled: override ? override.is_enabled : flag.is_enabled,
        has_override: !!override,
        override_config: override?.config || null,
      };
    });
  }

  /**
   * Is a feature enabled for a tenant?
   *
   * Delegates to {@link EntitlementService}, which is the only thing that knows
   * the whole answer. This method used to resolve tenant override -> rollout
   * percentage -> global default and **never consult the plan**, so a `premium`
   * flag was not gated behind a paid plan at all. Existing call sites (the
   * underwriting guards in `routes/insurance` and `routes/runtime`) keep
   * working unchanged, and become plan-aware by doing so — `underwriting_workflow`
   * resolves through the catalogue's legacy alias.
   *
   * @param {string} flagName a catalogue feature key, or a legacy flag name
   * @param {number} tenantId
   */
  async isEnabled(flagName, tenantId) {
    if (!isFeatureKey(flagName)) {
      // A flag outside the catalogue sells nothing and gates nothing through
      // the entitlement engine; fall back to its own row so a bespoke
      // operational kill-switch still works.
      const flag = await this.db.featureFlag.findUnique({
        where:  { name: flagName },
        select: { is_enabled: true, rollout_percent: true },
      });
      if (!flag) return false;
      if (flag.rollout_percent > 0 && flag.rollout_percent < 100 && tenantId) {
        return Number(tenantId) % 100 < flag.rollout_percent;
      }
      return flag.is_enabled;
    }
    return this.entitlements.isEnabled(flagName, tenantId);
  }
}

module.exports = FeatureFlagService;
