'use strict';

const { requirePlatformAdmin, resolveRoleLevel } = require('../../middleware/authenticate');
const { tenantContext } = require('../../middleware/tenant-scope');
const tenantLifecycle   = require('../../middleware/tenant-lifecycle');
const { ok, list } = require('../../utils/response');
const { ValidationError } = require('../../utils/errors');

// Services
const TenantService          = require('../../services/platform/tenant.service');
const SubscriptionService    = require('../../services/platform/subscription.service');
const FeatureFlagService     = require('../../services/platform/feature-flag.service');
const PlatformAuditService   = require('../../services/platform/platform-audit.service');
const AnnouncementService    = require('../../services/platform/announcement.service');
const PlatformAnalyticsService = require('../../services/platform/analytics.service');
const SecurityService        = require('../../services/platform/security.service');
const TenantProvisioningService = require('../../services/platform/tenant-provisioning.service');
const EntitlementService     = require('../../services/platform/entitlement.service');
const { INDUSTRIES }         = require('../../services/industry-templates');

/** The provisioning steps, surfaced so the console can render the checklist. */
const PROVISIONING_STEPS = TenantProvisioningService.STEPS;

/**
 * Extract client IP from request.
 */
function getIp(req) {
  // req.ip honours X-Forwarded-For only behind a trusted proxy (TRUST_PROXY).
  return req.ip;
}

module.exports = async function platformRoutes(fastify) {
  // All platform routes require platform_admin (level 5)
  fastify.addHook('preHandler', requirePlatformAdmin);

  // Platform admin operates cross-tenant — bypass tenant scoping
  fastify.addHook('preHandler', async () => {
    tenantContext.enterWith({ tenantId: null });
  });

  // Instantiate services
  const tenantSvc      = new TenantService(fastify.prisma);
  const subSvc         = new SubscriptionService(fastify.prisma);
  const flagSvc        = new FeatureFlagService(fastify.prisma);
  const auditSvc       = new PlatformAuditService(fastify.prisma);
  const announceSvc    = new AnnouncementService(fastify.prisma);
  const analyticsSvc   = new PlatformAnalyticsService(fastify.prisma);
  const securitySvc    = new SecurityService(fastify.prisma);
  const provisionSvc   = new TenantProvisioningService(fastify.prisma, { log: fastify.log });
  const entitleSvc     = new EntitlementService(fastify.prisma);

  /** Helper — log platform action + return result */
  async function audit(req, action, targetType, targetId, details) {
    await auditSvc.log({
      adminId:    req.user.employeeId,
      action,
      targetType,
      targetId,
      details,
      ip:         getIp(req),
      userAgent:  req.headers['user-agent'],
    });
  }

  // ═══════════════════════════════════════════════════════════
  // TENANT MANAGEMENT + ONBOARDING
  // ═══════════════════════════════════════════════════════════
  //
  // The onboarding story, in order of how much the caller wants done for them:
  //
  //   POST /tenants                      just the row (kept for scripts/API clients)
  //   POST /tenants/onboard              row + full workspace + first admin, one call
  //   POST /tenants/:id/provision        (re-)run some or all setup steps
  //   GET  /tenants/:id/readiness        what is set up and what is missing
  //
  // `onboard` is what the console's wizard calls. Everything it does is
  // idempotent per step, so a partial failure is finished by `provision`
  // rather than by deleting the tenant and starting again.

  // LIST tenants
  fastify.get('/tenants', async (req) => {
    const { page, limit, status, plan, search } = req.query;
    const result = await tenantSvc.list({ page: Number(page) || 1, limit: Number(limit) || 20, status, plan, search });
    return ok(result.data, { pagination: result.pagination });
  });

  // GET tenant stats
  fastify.get('/tenants/stats', async () => {
    const stats = await tenantSvc.getStats();
    return ok(stats);
  });

  // ── Onboarding wizard support ──────────────────────────────
  // Declared before `/tenants/:id` so the literal paths win the route match.

  /** The steps `onboard` / `provision` can run, for the wizard's checklist. */
  fastify.get('/tenants/provisioning-steps', async () => ok(PROVISIONING_STEPS));

  /** Is this slug free? Returns a suggestion when it is not. */
  fastify.get('/tenants/check-slug', async (req) => {
    if (!req.query.slug) throw new ValidationError('slug is required');
    return ok(await provisionSvc.checkSlug(req.query.slug));
  });

  /**
   * Is this admin identity free?
   *
   * `employees.employee_id` and `employees.email` are unique platform-wide, so
   * the wizard asks before submitting and shows a suggestion inline instead of
   * failing the whole form with a 409.
   */
  fastify.get('/tenants/check-admin', async (req) => {
    const { employee_id, email, slug } = req.query;
    if (!employee_id && !email) throw new ValidationError('employee_id or email is required');
    return ok(await provisionSvc.checkAdminIdentity({ employee_id, email, slug }));
  });

  /**
   * CREATE + SET UP a tenant in one call.
   *
   * Body: tenant fields (see TenantService.create) plus an optional
   * `admin: { employee_id, employee_name, email, password }` and an optional
   * `template_tenant_id` / `skip_steps`.
   *
   * The tenant row is committed before the setup steps run, so a step that
   * fails leaves a real tenant the console can finish rather than a rolled-back
   * half-creation the admin has to diagnose.
   */
  fastify.post('/tenants/onboard', async (req, reply) => {
    const { admin, template_tenant_id: templateTenantId, skip_steps: skipSteps, ...tenantFields } = req.body ?? {};

    const tenant = await tenantSvc.create({ ...tenantFields, created_by: req.user.employeeId });
    await audit(req, 'tenant.create', 'tenant', tenant.id, { name: tenant.name, plan: tenant.plan, via: 'onboard' });

    const skip = new Set(Array.isArray(skipSteps) ? skipSteps : []);
    const only = PROVISIONING_STEPS.map((s) => s.key).filter((k) => !skip.has(k));

    const result = await provisionSvc.provision(tenant.id, {
      only,
      templateTenantId,
      actorId: req.user.employeeId,
      admin:   admin ?? null,
    });
    await audit(req, 'tenant.provision', 'tenant', tenant.id, {
      via:    'onboard',
      ok:     result.ok,
      steps:  result.steps.map((s) => `${s.key}:${s.status}`),
    });

    const readiness = await provisionSvc.readiness(tenant.id);
    return reply.code(201).send(ok({ tenant, provisioning: result, readiness }));
  });

  // GET tenant by ID
  fastify.get('/tenants/:id', async (req) => {
    const tenant = await tenantSvc.getById(req.params.id);
    return ok(tenant);
  });

  // CREATE tenant (row only — see /tenants/onboard for the full workspace)
  fastify.post('/tenants', async (req) => {
    const tenant = await tenantSvc.create({ ...req.body, created_by: req.user.employeeId });
    await audit(req, 'tenant.create', 'tenant', tenant.id, { name: tenant.name, plan: tenant.plan });
    return ok(tenant);
  });

  // UPDATE tenant
  fastify.put('/tenants/:id', async (req) => {
    const tenant = await tenantSvc.update(req.params.id, req.body);
    tenantLifecycle.invalidate(tenant.id);
    await audit(req, 'tenant.update', 'tenant', tenant.id, req.body);
    return ok(tenant);
  });

  // SUSPEND tenant
  fastify.post('/tenants/:id/suspend', async (req) => {
    const { reason } = req.body || {};
    const tenant = await tenantSvc.suspend(req.params.id, reason);
    // Drop the cached status so the block takes effect on the next request
    // rather than at the end of the memo TTL.
    tenantLifecycle.invalidate(tenant.id);
    await audit(req, 'tenant.suspend', 'tenant', tenant.id, { reason });
    return ok(tenant);
  });

  // REACTIVATE tenant
  fastify.post('/tenants/:id/reactivate', async (req) => {
    const tenant = await tenantSvc.reactivate(req.params.id);
    tenantLifecycle.invalidate(tenant.id);
    await audit(req, 'tenant.reactivate', 'tenant', tenant.id);
    return ok(tenant);
  });

  // SOFT DELETE tenant (30-day recovery window)
  fastify.delete('/tenants/:id', async (req) => {
    const tenant = await tenantSvc.softDelete(req.params.id);
    tenantLifecycle.invalidate(tenant.id);
    await audit(req, 'tenant.delete', 'tenant', tenant.id);
    return ok({ message: 'Tenant marked for deletion. Can be restored within 30 days.' });
  });

  // RESTORE deleted tenant
  fastify.post('/tenants/:id/restore', async (req) => {
    const tenant = await tenantSvc.restore(req.params.id);
    tenantLifecycle.invalidate(tenant.id);
    await audit(req, 'tenant.restore', 'tenant', tenant.id);
    return ok(tenant);
  });

  /** What is set up for this tenant, and what is still missing. */
  fastify.get('/tenants/:id/readiness', async (req) => {
    return ok(await provisionSvc.readiness(req.params.id));
  });

  /**
   * (RE-)RUN setup steps for an existing tenant.
   *
   * Body: `{ steps?: string[], template_tenant_id?, admin?, missing_only?: true }`
   * With `missing_only` the readiness check picks the steps, which is what the
   * console's "Finish setup" button sends.
   */
  fastify.post('/tenants/:id/provision', async (req) => {
    const { steps, template_tenant_id: templateTenantId, admin, missing_only: missingOnly } = req.body ?? {};

    let only = Array.isArray(steps) && steps.length ? steps : undefined;
    if (missingOnly) {
      const readiness = await provisionSvc.readiness(req.params.id);
      only = readiness.missing;
      if (!only.length) return ok({ tenant_id: readiness.tenant_id, ok: true, steps: [], readiness });
    }

    const result = await provisionSvc.provision(req.params.id, {
      only,
      templateTenantId,
      actorId: req.user.employeeId,
      admin:   admin ?? null,
    });
    await audit(req, 'tenant.provision', 'tenant', Number(req.params.id), {
      ok:    result.ok,
      steps: result.steps.map((s) => `${s.key}:${s.status}`),
    });

    const readiness = await provisionSvc.readiness(req.params.id);
    return ok({ ...result, readiness });
  });

  /**
   * PROVISION the first admin for an existing tenant.
   *
   * Kept as its own endpoint because that is how the console's per-row action
   * and existing API clients call it. It runs the `roles`, `org` and `admin`
   * steps: an admin created without the role ladder in place cannot sign in
   * meaningfully, which is exactly the trap the old version fell into.
   */
  fastify.post('/tenants/:id/provision-admin', async (req) => {
    const { employee_id, employee_name, email, password } = req.body ?? {};
    if (!employee_id || !employee_name || !password) {
      throw new ValidationError('employee_id, employee_name, and password are required');
    }

    const tenantId = Number(req.params.id);
    const result = await provisionSvc.provision(tenantId, {
      only:    ['roles', 'org', 'admin', 'email_templates'],
      actorId: req.user.employeeId,
      admin:   { employee_id, employee_name, email, password },
    });

    const adminStep = result.steps.find((s) => s.key === 'admin');
    if (adminStep?.status === 'failed') throw new ValidationError(adminStep.detail);

    await audit(req, 'tenant.provision_admin', 'tenant', tenantId, { admin_id: result.admin?.employee_id ?? employee_id });
    return ok({ ...(result.admin ?? {}), provisioning: result.steps });
  });

  // CHANGE PLAN
  fastify.post('/tenants/:id/change-plan', async (req) => {
    const { plan } = req.body;
    if (!plan) throw new ValidationError('plan is required');
    const tenant = await tenantSvc.changePlan(req.params.id, plan);
    tenantLifecycle.invalidate(tenant.id);
    // The plan decides what the tenant is entitled to, so the resolved-feature
    // memo has to go too or the change appears not to take effect.
    EntitlementService.invalidate(tenant.id);
    await audit(req, 'tenant.change_plan', 'tenant', tenant.id, { new_plan: plan });
    return ok(tenant);
  });

  // ═══════════════════════════════════════════════════════════
  // FEATURE ENTITLEMENTS
  // ═══════════════════════════════════════════════════════════
  //
  // Three things decide whether a tenant has a feature, and the console needs
  // to show all three or an operator cannot answer "why can this customer not
  // see quoting?":
  //
  //   the plan       — what was sold        (subscription_plans.features)
  //   the flag       — whether we shipped it (feature_flags, rollout %)
  //   the override   — the deliberate exception (tenant_feature_overrides)
  //
  // See services/platform/entitlement.service.js for why the order is what it
  // is. Before this, the plan was not consulted at all.

  /** The closed vocabulary of features, grouped, with the tiers that include each. */
  fastify.get('/feature-catalogue', async () => ok(subSvc.catalogue()));

  /**
   * One tenant's feature matrix: every feature, its resolved state, and the
   * reason. This is what the Features tab on a tenant renders.
   */
  fastify.get('/tenants/:id/features', async (req) => {
    return ok(await entitleSvc.tenantMatrix(req.params.id));
  });

  /**
   * Grant, revoke, or clear a per-tenant override.
   *
   * Body: `{ enabled: true | false | null }` — `null` clears the override and
   * returns the feature to whatever the plan says, which is the third state an
   * operator needs to undo an exception rather than live with it forever.
   */
  fastify.put('/tenants/:id/features/:key', async (req) => {
    const { enabled } = req.body ?? {};
    const state = await entitleSvc.setOverride(req.params.id, req.params.key, enabled ?? null, req.user.employeeId);
    await audit(req, 'tenant.feature_override', 'tenant', Number(req.params.id), {
      feature: req.params.key,
      enabled: enabled ?? null,
    });
    return ok(state);
  });

  /** Apply a whole group of overrides in one save. */
  fastify.put('/tenants/:id/features', async (req) => {
    const { features } = req.body ?? {};
    const states = await entitleSvc.setOverrides(req.params.id, features, req.user.employeeId);
    await audit(req, 'tenant.feature_override_bulk', 'tenant', Number(req.params.id), { features });
    return ok(states);
  });

  /** Reset a plan's features to the catalogue default for its tier. */
  fastify.post('/plans/:id/reset-features', async (req) => {
    const plan = await subSvc.resetFeatures(req.params.id);
    await audit(req, 'plan.reset_features', 'plan', plan.id, { features: plan.features.length });
    return ok(plan);
  });

  // ── Industries ──────────────────────────────────────────────

  // GET supported industries list
  fastify.get('/industries', async () => {
    return ok(INDUSTRIES);
  });

  // PROVISION industry templates for a tenant (standalone, re-runnable)
  fastify.post('/tenants/:id/provision-templates', async (req) => {
    const tenantId = Number(req.params.id);
    const tenant = await tenantSvc.getById(tenantId);
    const industry = req.body?.industry || tenant.industry;
    if (!industry) throw new ValidationError('No industry specified on tenant or in request body');

    // Persist the requested industry first so the provisioning step reads it.
    if (req.body?.industry && req.body.industry !== tenant.industry) {
      await tenantSvc.update(tenantId, { industry: req.body.industry });
    }

    const result = await provisionSvc.provision(tenantId, {
      only:    ['email_templates'],
      actorId: req.user.employeeId,
    });
    const step = result.steps[0];
    await audit(req, 'tenant.provision_templates', 'tenant', tenantId, { industry, status: step?.status, detail: step?.detail });
    return ok({ industry, status: step?.status, detail: step?.detail });
  });

  // ── Tenant Config ──────────────────────────────────────────

  fastify.get('/tenants/:id/config', async (req) => {
    const configs = await tenantSvc.getConfig(req.params.id);
    return ok(configs);
  });

  fastify.put('/tenants/:id/config', async (req) => {
    const { key, value } = req.body;
    if (!key) throw new ValidationError('key is required');
    const config = await tenantSvc.setConfig(req.params.id, key, value, req.user.employeeId);
    await audit(req, 'tenant.config_update', 'tenant', req.params.id, { key, value });
    return ok(config);
  });

  fastify.delete('/tenants/:id/config/:key', async (req) => {
    await tenantSvc.deleteConfig(req.params.id, req.params.key);
    await audit(req, 'tenant.config_delete', 'tenant', req.params.id, { key: req.params.key });
    return ok({ message: 'Config removed' });
  });

  // ── Tenant Usage ──────────────────────────────────────────

  fastify.get('/tenants/:id/usage', async (req) => {
    const { period, metric } = req.query;
    const usage = await tenantSvc.getUsage(req.params.id, { period, metric });
    return ok(usage);
  });

  // ═══════════════════════════════════════════════════════════
  // PHASE 2 — PLATFORM AUDIT LOG
  // ═══════════════════════════════════════════════════════════

  fastify.get('/audit-log', async (req) => {
    const { page, limit, admin_id, action, target_type, target_id, from, to } = req.query;
    const result = await auditSvc.list({
      page: Number(page) || 1,
      limit: Number(limit) || 50,
      adminId: admin_id,
      action,
      targetType: target_type,
      targetId: target_id,
      from,
      to,
    });
    return ok(result.data, { pagination: result.pagination });
  });

  fastify.get('/audit-log/stats', async (req) => {
    const { from, to } = req.query;
    const stats = await auditSvc.getActionStats(from, to);
    return ok(stats);
  });

  fastify.get('/audit-log/target/:type/:id', async (req) => {
    const history = await auditSvc.getTargetHistory(req.params.type, req.params.id);
    return ok(history);
  });

  // ═══════════════════════════════════════════════════════════
  // PHASE 2 — IMPERSONATION
  // ═══════════════════════════════════════════════════════════

  // START impersonation session — returns a new JWT token
  fastify.post('/impersonate', async (req) => {
    const { target_user_id, reason } = req.body;
    if (!target_user_id) throw new ValidationError('target_user_id is required');

    const targetUser = await fastify.prisma.employee.findUnique({
      where: { employee_id: target_user_id },
      include: {
        branch: { select: { branch_id: true, branch_name: true } },
        region: { select: { region_id: true, region_name: true } },
      },
    });

    if (!targetUser) throw new ValidationError('Target user not found');
    if (targetUser.role === 'platform_admin') {
      throw new ValidationError('Cannot impersonate another platform admin');
    }
    if (!targetUser.is_active) throw new ValidationError('Target user is deactivated');
    // Impersonating into a suspended workspace would hand the session a token
    // the lifecycle gate rejects on its first request; say so up front.
    await tenantLifecycle.assertTenantUsable(fastify.prisma, targetUser.tenant_id);

    // Look up role level from tenant-scoped roles, then the shared system row.
    // `resolveRoleLevel` settles the miss: it used to be `?? 1`, so
    // impersonating a user whose role had no row minted a level-1 token — a
    // platform-admin session wearing someone else's name.
    const targetRole = await fastify.prisma.role.findFirst({
      where: { name: targetUser.role, tenant_id: targetUser.tenant_id },
      select: { level: true },
    }) ?? await fastify.prisma.role.findFirst({
      where: { name: targetUser.role, tenant_id: null },
      select: { level: true },
    });
    const targetLevel = resolveRoleLevel(targetUser.role, targetRole?.level);

    // Create impersonation JWT
    const payload = {
      sub:           targetUser.employee_id,
      employeeId:    targetUser.employee_id,
      employee_id:   targetUser.employee_id,
      employeeName:  targetUser.employee_name,
      role:          targetUser.role,
      role_level:    targetLevel,
      branchId:      targetUser.branch_id,
      regionId:      targetUser.region_id,
      tenant_id:     targetUser.tenant_id ?? null,
      // Mark as impersonated
      impersonated_by: req.user.employeeId,
      is_impersonated: true,
    };

    const token = fastify.jwt.sign(payload, { expiresIn: '1h' });

    // Log impersonation
    const logEntry = await securitySvc.logImpersonation({
      admin_id: req.user.employeeId,
      target_user_id: target_user_id,
      reason: reason || null,
      ip_address: getIp(req),
    });

    await audit(req, 'user.impersonate', 'user', target_user_id, { reason });

    return ok({
      token,
      impersonation_id: logEntry.id,
      target: {
        employee_id: targetUser.employee_id,
        employee_name: targetUser.employee_name,
        role: targetUser.role,
        email: targetUser.email,
      },
    });
  });

  // END impersonation session
  fastify.post('/impersonate/:id/end', async (req) => {
    const { actions_taken } = req.body || {};
    await securitySvc.endImpersonation(req.params.id, actions_taken || null);
    await audit(req, 'user.impersonate_end', 'impersonation', req.params.id, { actions_taken });
    return ok({ message: 'Impersonation session ended' });
  });

  // LIST impersonation logs
  fastify.get('/impersonation-logs', async (req) => {
    const { page, limit, admin_id } = req.query;
    const result = await securitySvc.listImpersonationLogs({
      page: Number(page) || 1,
      limit: Number(limit) || 20,
      adminId: admin_id,
    });
    return ok(result.data, { pagination: result.pagination });
  });

  // ═══════════════════════════════════════════════════════════
  // PHASE 2 — ANNOUNCEMENTS
  // ═══════════════════════════════════════════════════════════

  fastify.get('/announcements', async (req) => {
    const { page, limit, severity, active_only } = req.query;
    const result = await announceSvc.list({
      page: Number(page) || 1,
      limit: Number(limit) || 20,
      severity,
      activeOnly: active_only === 'true',
    });
    return ok(result.data, { pagination: result.pagination });
  });

  fastify.get('/announcements/:id', async (req) => {
    const announcement = await announceSvc.getById(req.params.id);
    return ok(announcement);
  });

  fastify.post('/announcements', async (req) => {
    const announcement = await announceSvc.create({ ...req.body, created_by: req.user.employeeId });
    await audit(req, 'announcement.create', 'announcement', announcement.id, { title: announcement.title });
    return ok(announcement);
  });

  fastify.put('/announcements/:id', async (req) => {
    const announcement = await announceSvc.update(req.params.id, req.body);
    await audit(req, 'announcement.update', 'announcement', announcement.id, req.body);
    return ok(announcement);
  });

  fastify.delete('/announcements/:id', async (req) => {
    await announceSvc.delete(req.params.id);
    await audit(req, 'announcement.delete', 'announcement', req.params.id);
    return ok({ message: 'Announcement deleted' });
  });

  fastify.post('/announcements/:id/activate', async (req) => {
    const announcement = await announceSvc.activate(req.params.id);
    await audit(req, 'announcement.activate', 'announcement', req.params.id);
    return ok(announcement);
  });

  fastify.post('/announcements/:id/deactivate', async (req) => {
    const announcement = await announceSvc.deactivate(req.params.id);
    await audit(req, 'announcement.deactivate', 'announcement', req.params.id);
    return ok(announcement);
  });

  // ═══════════════════════════════════════════════════════════
  // PHASE 3 — FEATURE FLAGS
  // ═══════════════════════════════════════════════════════════

  fastify.get('/feature-flags', async (req) => {
    const { category } = req.query;
    const flags = await flagSvc.list({ category });
    return ok(flags);
  });

  fastify.get('/feature-flags/:id', async (req) => {
    const flag = await flagSvc.getById(req.params.id);
    return ok(flag);
  });

  fastify.post('/feature-flags', async (req) => {
    const flag = await flagSvc.create({ ...req.body, created_by: req.user.employeeId });
    await audit(req, 'flag.create', 'feature_flag', flag.id, { name: flag.name });
    return ok(flag);
  });

  fastify.put('/feature-flags/:id', async (req) => {
    const flag = await flagSvc.update(req.params.id, req.body);
    await audit(req, 'flag.update', 'feature_flag', flag.id, req.body);
    return ok(flag);
  });

  fastify.post('/feature-flags/:id/toggle', async (req) => {
    const { enabled } = req.body;
    if (typeof enabled !== 'boolean') throw new ValidationError('enabled (boolean) is required');
    const flag = await flagSvc.toggle(req.params.id, enabled);
    await audit(req, 'flag.toggle', 'feature_flag', flag.id, { enabled });
    return ok(flag);
  });

  fastify.post('/feature-flags/:id/rollout', async (req) => {
    const { percent } = req.body;
    if (typeof percent !== 'number') throw new ValidationError('percent (number) is required');
    const flag = await flagSvc.setRollout(req.params.id, percent);
    await audit(req, 'flag.rollout', 'feature_flag', flag.id, { percent });
    return ok(flag);
  });

  fastify.delete('/feature-flags/:id', async (req) => {
    await flagSvc.delete(req.params.id);
    await audit(req, 'flag.delete', 'feature_flag', req.params.id);
    return ok({ message: 'Feature flag deleted' });
  });

  // Per-tenant flag overrides
  fastify.get('/feature-flags/tenant/:tenantId', async (req) => {
    const flags = await flagSvc.getTenantFlags(req.params.tenantId);
    return ok(flags);
  });

  fastify.post('/feature-flags/:id/tenant-override', async (req) => {
    const { tenant_id, enabled, config } = req.body;
    if (!tenant_id) throw new ValidationError('tenant_id is required');
    if (typeof enabled !== 'boolean') throw new ValidationError('enabled (boolean) is required');
    const override = await flagSvc.setTenantOverride(req.params.id, tenant_id, enabled, config, req.user.employeeId);
    await audit(req, 'flag.tenant_override', 'feature_flag', req.params.id, { tenant_id, enabled });
    return ok(override);
  });

  fastify.delete('/feature-flags/:id/tenant-override/:tenantId', async (req) => {
    await flagSvc.removeTenantOverride(req.params.id, req.params.tenantId);
    await audit(req, 'flag.remove_tenant_override', 'feature_flag', req.params.id, { tenant_id: req.params.tenantId });
    return ok({ message: 'Tenant override removed' });
  });

  // ═══════════════════════════════════════════════════════════
  // PHASE 3 — SUBSCRIPTION PLANS
  // ═══════════════════════════════════════════════════════════

  fastify.get('/plans', async () => {
    const plans = await subSvc.list();
    return ok(plans);
  });

  fastify.get('/plans/compare', async () => {
    const comparison = await subSvc.compare();
    return ok(comparison);
  });

  fastify.get('/plans/:id', async (req) => {
    const plan = await subSvc.getById(req.params.id);
    return ok(plan);
  });

  fastify.post('/plans', async (req) => {
    const plan = await subSvc.create(req.body);
    await audit(req, 'plan.create', 'plan', plan.id, { name: plan.name });
    return ok(plan);
  });

  fastify.put('/plans/:id', async (req) => {
    const plan = await subSvc.update(req.params.id, req.body);
    await audit(req, 'plan.update', 'plan', plan.id, req.body);
    return ok(plan);
  });

  fastify.delete('/plans/:id', async (req) => {
    await subSvc.delete(req.params.id);
    await audit(req, 'plan.delete', 'plan', req.params.id);
    return ok({ message: 'Plan deleted' });
  });

  // ═══════════════════════════════════════════════════════════
  // PHASE 4 — PLATFORM ANALYTICS
  // ═══════════════════════════════════════════════════════════

  fastify.get('/analytics/overview', async () => {
    const overview = await analyticsSvc.getOverview();
    return ok(overview);
  });

  fastify.get('/analytics/tenant-growth', async (req) => {
    const { months } = req.query;
    const growth = await analyticsSvc.getTenantGrowth(Number(months) || 12);
    return ok(growth);
  });

  fastify.get('/analytics/feature-usage', async () => {
    const usage = await analyticsSvc.getFeatureUsage();
    return ok(usage);
  });

  fastify.get('/analytics/user-activity', async (req) => {
    const { days } = req.query;
    const activity = await analyticsSvc.getUserActivity(Number(days) || 30);
    return ok(activity);
  });

  fastify.get('/analytics/system-health', async () => {
    const health = await analyticsSvc.getSystemHealth();
    return ok(health);
  });

  fastify.get('/analytics/revenue', async () => {
    const revenue = await analyticsSvc.getRevenueMetrics();
    return ok(revenue);
  });

  fastify.get('/analytics/churn', async (req) => {
    const { months } = req.query;
    const churn = await analyticsSvc.getChurnMetrics(Number(months) || 6);
    return ok(churn);
  });

  // ═══════════════════════════════════════════════════════════
  // PHASE 4 — SECURITY CONTROLS
  // ═══════════════════════════════════════════════════════════

  // ── Security Policies ──────────────────────────────────────

  fastify.get('/security/policies', async () => {
    const policies = await securitySvc.listPolicies();
    return ok(policies);
  });

  fastify.get('/security/policies/global', async () => {
    const policy = await securitySvc.getGlobalPolicy();
    return ok(policy);
  });

  fastify.get('/security/policies/tenant/:tenantId', async (req) => {
    const policy = await securitySvc.getTenantPolicy(req.params.tenantId);
    return ok(policy);
  });

  fastify.put('/security/policies', async (req) => {
    const policy = await securitySvc.upsertPolicy({ ...req.body, updated_by: req.user.employeeId });
    await audit(req, 'security.policy_update', 'security', policy.id, req.body);
    return ok(policy);
  });

  // ── Password Management ───────────────────────────────────

  fastify.post('/security/force-password-reset', async (req) => {
    const { employee_id } = req.body;
    if (!employee_id) throw new ValidationError('employee_id is required');
    const result = await securitySvc.forcePasswordReset(employee_id, req.user.employeeId);
    await audit(req, 'security.force_password_reset', 'user', employee_id);
    return ok(result);
  });

  fastify.post('/security/bulk-password-reset', async (req) => {
    const { employee_ids } = req.body;
    if (!employee_ids || !Array.isArray(employee_ids)) {
      throw new ValidationError('employee_ids (array) is required');
    }
    const results = await securitySvc.bulkForcePasswordReset(employee_ids, req.user.employeeId);
    await audit(req, 'security.bulk_password_reset', 'security', null, { count: employee_ids.length });
    return ok(results);
  });

  // ── Session & User Management ──────────────────────────────

  fastify.get('/security/sessions', async () => {
    const sessions = await securitySvc.getActiveSessions();
    return ok(sessions);
  });

  fastify.post('/security/deactivate-user', async (req) => {
    const { employee_id } = req.body;
    if (!employee_id) throw new ValidationError('employee_id is required');
    const user = await securitySvc.deactivateUser(employee_id, req.user.employeeId);
    await audit(req, 'security.deactivate_user', 'user', employee_id);
    return ok(user);
  });

  fastify.post('/security/reactivate-user', async (req) => {
    const { employee_id } = req.body;
    if (!employee_id) throw new ValidationError('employee_id is required');
    const user = await securitySvc.reactivateUser(employee_id);
    await audit(req, 'security.reactivate_user', 'user', employee_id);
    return ok(user);
  });

  // ── API Rate Limits ───────────────────────────────────────

  fastify.get('/security/rate-limits', async () => {
    const limits = await securitySvc.listRateLimits();
    return ok(limits);
  });

  fastify.put('/security/rate-limits', async (req) => {
    const limit = await securitySvc.upsertRateLimit(req.body);
    await audit(req, 'security.rate_limit_update', 'security', limit.id, req.body);
    return ok(limit);
  });

  fastify.delete('/security/rate-limits/:id', async (req) => {
    await securitySvc.deleteRateLimit(req.params.id);
    await audit(req, 'security.rate_limit_delete', 'security', req.params.id);
    return ok({ message: 'Rate limit removed' });
  });

  // ── Data Export ───────────────────────────────────────────

  fastify.get('/security/data-exports', async (req) => {
    const { tenant_id, status, page, limit } = req.query;
    const result = await securitySvc.listDataExports({
      tenantId: tenant_id,
      status,
      page: Number(page) || 1,
      limit: Number(limit) || 20,
    });
    return ok(result.data, { pagination: result.pagination });
  });

  fastify.post('/security/data-exports', async (req) => {
    const exportReq = await securitySvc.requestDataExport({
      ...req.body,
      requested_by: req.user.employeeId,
      status: 'pending',
    });
    await audit(req, 'security.data_export_request', 'data_export', exportReq.id, req.body);
    return ok(exportReq);
  });

  fastify.put('/security/data-exports/:id/status', async (req) => {
    const { status, ...extra } = req.body;
    if (!status) throw new ValidationError('status is required');
    const result = await securitySvc.updateExportStatus(req.params.id, status, extra);
    await audit(req, 'security.data_export_status', 'data_export', req.params.id, { status });
    return ok(result);
  });
};
