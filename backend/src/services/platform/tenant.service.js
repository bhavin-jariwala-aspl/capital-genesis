'use strict';

const { BaseRepository } = require('../../utils/repository');
const { NotFoundError, ValidationError, ConflictError } = require('../../utils/errors');
const { SLUG_RE } = require('./tenant-provisioning.service');

// Plans and statuses the API accepts. Both used to be free text taken straight
// from the request body, so a typo ("Enterprise", "activ") produced a tenant
// whose plan matched no `subscription_plans` row and whose status matched no
// lifecycle branch — silently unlimited, or silently inaccessible.
const PLANS    = ['free', 'starter', 'professional', 'enterprise'];
const STATUSES = ['active', 'trial', 'suspended', 'cancelled', 'deleted'];

// Plans that come with a trial period.
const TRIAL_PLANS = ['starter', 'professional', 'enterprise'];

/**
 * Columns a platform admin may set through the API.
 *
 * `create` and `update` used to spread `req.body` into Prisma, so a caller
 * could set `id`, `created_at`, or the plan limits the chosen plan is supposed
 * to dictate. Limits are derived from the plan below, never accepted.
 */
const TENANT_WRITABLE = Object.freeze([
  'name', 'slug', 'domain', 'industry', 'plan', 'status', 'trial_ends_at',
  'logo_url', 'primary_color', 'timezone', 'locale',
  'billing_email', 'billing_address', 'metadata', 'created_by',
]);

/** Columns only the plan may set — accepted from a plan row, never from a body. */
const PLAN_LIMITS = Object.freeze(['max_users', 'max_storage_mb', 'max_api_calls']);

/** Keep only `allowed` keys that were actually supplied. */
function pick(data, allowed) {
  const out = {};
  for (const key of allowed) {
    if (data?.[key] !== undefined) out[key] = data[key];
  }
  return out;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

class TenantService extends BaseRepository {
  constructor(prisma) {
    super(prisma, 'tenant');
  }

  // ── CRUD ──────────────────────────────────────────────────

  async list({ page = 1, limit = 20, status, plan, search } = {}) {
    const where = {};
    if (status) where.status = status;
    if (plan) where.plan = plan;
    if (search) {
      where.OR = [
        { name: { contains: search } },
        { slug: { contains: search } },
        { domain: { contains: search } },
        { billing_email: { contains: search } },
      ];
    }

    // `take` is clamped, so `skip` has to be computed from the clamped value.
    // Paging with the raw limit skipped a different number of rows than it
    // returned, so any caller asking for more than 100 per page silently lost
    // tenants between page 1 and page 2.
    const take = Math.min(Math.max(Number(limit) || 20, 1), 100);
    const skip = (Math.max(Number(page) || 1, 1) - 1) * take;

    const [data, total] = await Promise.all([
      this.db.tenant.findMany({
        where,
        orderBy: { created_at: 'desc' },
        skip,
        take,
        include: {
          _count: { select: { configs: true, usage_records: true, feature_overrides: true } },
        },
      }),
      this.db.tenant.count({ where }),
    ]);

    return { data, pagination: { total, page, limit: take, pages: Math.ceil(total / take) } };
  }

  async getById(id) {
    const tenant = await this.db.tenant.findUnique({
      where: { id: Number(id) },
      include: {
        configs: true,
        feature_overrides: { include: { flag: { select: { name: true, label: true } } } },
      },
    });
    if (!tenant) throw new NotFoundError('Tenant');
    return tenant;
  }

  /**
   * Create a tenant row.
   *
   * Validation lives here rather than in the route so the onboarding endpoint,
   * the plain create endpoint and any script all reject the same bad input.
   * Note what this does NOT do: it makes the tenant exist, not usable. See
   * `TenantProvisioningService` for the rest.
   */
  async create(input) {
    const data = pick(input, TENANT_WRITABLE);

    if (!data.name || !String(data.name).trim()) throw new ValidationError('name is required');
    data.name = String(data.name).trim();

    // A blank slug is derived from the name, which is what a novice expects and
    // what the console pre-fills — but the console can be bypassed.
    data.slug = String(data.slug ?? '').trim().toLowerCase() || slugify(data.name);
    if (!SLUG_RE.test(data.slug)) {
      throw new ValidationError('slug must be 3-100 characters of lowercase letters, numbers and hyphens, starting and ending with a letter or number');
    }
    if (data.plan && !PLANS.includes(data.plan)) {
      throw new ValidationError(`plan must be one of: ${PLANS.join(', ')}`);
    }
    if (data.status && !STATUSES.includes(data.status)) {
      throw new ValidationError(`status must be one of: ${STATUSES.join(', ')}`);
    }
    if (data.billing_email && !EMAIL_RE.test(data.billing_email)) {
      throw new ValidationError('billing_email must be a valid email address');
    }

    const existing = await this.db.tenant.findUnique({ where: { slug: data.slug } });
    if (existing) throw new ConflictError(`Tenant with slug '${data.slug}' already exists`);
    if (data.domain) {
      const domainTaken = await this.db.tenant.findUnique({ where: { domain: data.domain } });
      if (domainTaken) throw new ConflictError(`Domain '${data.domain}' is already claimed by another tenant`);
    }

    // Plan limits come from the plan, never from the request.
    const plan = await this.db.subscriptionPlan.findUnique({ where: { name: data.plan || 'free' } });
    if (plan) Object.assign(data, pick(plan, PLAN_LIMITS));

    if (data.plan && TRIAL_PLANS.includes(data.plan) && !data.trial_ends_at) {
      const trialDays = plan?.trial_days || 14;
      data.trial_ends_at = new Date(Date.now() + trialDays * 86400000);
      data.status = 'trial';
    }

    return this.db.tenant.create({ data });
  }

  async update(id, input) {
    await this.getById(id); // ensure exists
    const data = pick(input, TENANT_WRITABLE);
    if (data.plan !== undefined || data.slug !== undefined) {
      // Both have their own endpoints (`change-plan`, and slugs are immutable
      // once URLs and asset keys reference them), so reject rather than half-
      // apply: a plan set here would not bring its limits with it.
      throw new ValidationError('Use POST /tenants/:id/change-plan to change the plan; slug cannot be changed');
    }
    if (data.status && !STATUSES.includes(data.status)) {
      throw new ValidationError(`status must be one of: ${STATUSES.join(', ')}`);
    }
    if (data.billing_email && !EMAIL_RE.test(data.billing_email)) {
      throw new ValidationError('billing_email must be a valid email address');
    }
    if (!Object.keys(data).length) throw new ValidationError('No updatable fields supplied');
    return this.db.tenant.update({ where: { id: Number(id) }, data });
  }

  async suspend(id, reason) {
    const tenant = await this.getById(id);
    if (tenant.status === 'suspended') throw new ValidationError('Tenant is already suspended');

    return this.db.tenant.update({
      where: { id: Number(id) },
      data: { status: 'suspended', suspended_at: new Date(), suspended_reason: reason },
    });
  }

  async reactivate(id) {
    const tenant = await this.getById(id);
    if (tenant.status !== 'suspended') throw new ValidationError('Tenant is not suspended');

    return this.db.tenant.update({
      where: { id: Number(id) },
      data: { status: 'active', suspended_at: null, suspended_reason: null },
    });
  }

  async softDelete(id) {
    const tenant = await this.getById(id);
    if (tenant.status === 'deleted') throw new ValidationError('Tenant is already deleted');

    return this.db.tenant.update({
      where: { id: Number(id) },
      data: { status: 'deleted', deleted_at: new Date() },
    });
  }

  async restore(id) {
    const tenant = await this.getById(id);
    if (tenant.status !== 'deleted') throw new ValidationError('Tenant is not deleted');
    // 30-day recovery window
    const daysSinceDelete = (Date.now() - new Date(tenant.deleted_at).getTime()) / 86400000;
    if (daysSinceDelete > 30) throw new ValidationError('Recovery window (30 days) has expired');

    return this.db.tenant.update({
      where: { id: Number(id) },
      data: { status: 'active', deleted_at: null },
    });
  }

  async changePlan(id, newPlan) {
    const tenant = await this.getById(id);
    const plan = await this.db.subscriptionPlan.findUnique({ where: { name: newPlan } });
    if (!plan) throw new NotFoundError('Subscription plan');

    return this.db.tenant.update({
      where: { id: Number(id) },
      data: {
        plan: newPlan,
        max_users: plan.max_users,
        max_storage_mb: plan.max_storage_mb,
        max_api_calls: plan.max_api_calls,
      },
    });
  }

  // ── Config ────────────────────────────────────────────────

  async getConfig(tenantId) {
    return this.db.tenantConfig.findMany({ where: { tenant_id: Number(tenantId) } });
  }

  async setConfig(tenantId, key, value, adminId) {
    return this.db.tenantConfig.upsert({
      where: { tenant_id_config_key: { tenant_id: Number(tenantId), config_key: key } },
      create: { tenant_id: Number(tenantId), config_key: key, config_value: value, updated_by: adminId },
      update: { config_value: value, updated_by: adminId },
    });
  }

  async deleteConfig(tenantId, key) {
    return this.db.tenantConfig.deleteMany({
      where: { tenant_id: Number(tenantId), config_key: key },
    });
  }

  // ── Usage ─────────────────────────────────────────────────

  async getUsage(tenantId, { period, metric } = {}) {
    const where = { tenant_id: Number(tenantId) };
    if (period) where.period = period;
    if (metric) where.metric = metric;

    return this.db.tenantUsage.findMany({
      where,
      orderBy: { period: 'desc' },
    });
  }

  async recordUsage(tenantId, metric, value, period, periodType = 'monthly') {
    return this.db.tenantUsage.upsert({
      where: {
        tenant_id_metric_period_period_type: {
          tenant_id: Number(tenantId), metric, period, period_type: periodType,
        },
      },
      create: { tenant_id: Number(tenantId), metric, value, period, period_type: periodType },
      update: { value },
    });
  }

  async incrementUsage(tenantId, metric, delta, period, periodType = 'monthly') {
    return this.db.tenantUsage.upsert({
      where: {
        tenant_id_metric_period_period_type: {
          tenant_id: Number(tenantId), metric, period, period_type: periodType,
        },
      },
      create: { tenant_id: Number(tenantId), metric, value: delta, period, period_type: periodType },
      update: { value: { increment: delta } },
    });
  }

  // ── Stats ─────────────────────────────────────────────────

  async getStats() {
    const [totalTenants, byStatus, byPlan] = await Promise.all([
      this.db.tenant.count(),
      this.db.tenant.groupBy({ by: ['status'], _count: true }),
      this.db.tenant.groupBy({ by: ['plan'], _count: true }),
    ]);

    return {
      total: totalTenants,
      by_status: Object.fromEntries(byStatus.map(r => [r.status, r._count])),
      by_plan: Object.fromEntries(byPlan.map(r => [r.plan, r._count])),
    };
  }
}

/**
 * Turn an organisation name into a URL-safe slug.
 * The console derives the same value client-side so what the admin sees typed
 * for them is what the server stores.
 */
function slugify(name) {
  return String(name)
    // Fold accents first, so "Café Assurance" becomes "cafe-assurance" rather
    // than "caf-assurance" - real organisation names are not ASCII.
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 100)
    .replace(/-+$/, '');
}

module.exports = TenantService;
module.exports.PLANS = PLANS;
module.exports.STATUSES = STATUSES;
module.exports.TENANT_WRITABLE = TENANT_WRITABLE;
module.exports.slugify = slugify;
