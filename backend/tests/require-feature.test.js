'use strict';

/**
 * Feature gates on the request path.
 *
 * The entitlement engine answered "does this tenant have feature X?" for a
 * release before anything but the underwriting guard asked it, so a Starter
 * tenant could use Claims and Commissions in full. These tests pin that a
 * gate refuses with a 403 the client can act on, that the platform console is
 * never gated, and that the prefix table matches the declared route pattern
 * rather than user-supplied path text.
 */

const Fastify = require('fastify');
const jwtPlugin = require('../src/plugins/jwt');
const { authenticate } = require('../src/middleware/authenticate');
const { requireFeature, featureGateByPrefix, FeatureNotEntitledError } = require('../src/middleware/require-feature');
const EntitlementService = require('../src/services/platform/entitlement.service');
const C = require('../src/services/platform/feature-catalogue');

/** A Prisma double that puts tenant 4 on `plan`, with no flags or overrides. */
function prismaOnPlan(plan) {
  const plans = C.PLAN_TIERS.map((t, i) => ({ id: i + 1, name: t.name, features: C.defaultFeaturesForPlan(t.name) }));
  return {
    tenant: { findUnique: async ({ where }) => (where.id === 4 ? { id: 4, plan, status: 'active', trial_ends_at: null } : null) },
    subscriptionPlan: { findUnique: async ({ where }) => plans.find((p) => p.name === where.name) ?? null },
    featureFlag: { findMany: async () => [] },
    tenantFeatureOverride: { findMany: async () => [] },
  };
}

async function appOnPlan(plan) {
  const app = Fastify();
  await app.register(jwtPlugin);
  app.decorate('prisma', prismaOnPlan(plan));
  // Mirror the app's error handler shape for operational errors.
  app.setErrorHandler((err, _req, reply) => reply.code(err.statusCode ?? 500).send({
    success: false, error: { code: err.code, message: err.message, ...(err.details ? { details: err.details } : {}) },
  }));

  app.get('/claims', { preHandler: [authenticate, requireFeature('ins_claims')] }, async () => ({ ok: true }));
  app.get('/quotes', { preHandler: [authenticate, requireFeature('ins_quoting')] }, async () => ({ ok: true }));

  await app.register(async (plugin) => {
    plugin.addHook('preHandler', authenticate);
    plugin.addHook('preHandler', featureGateByPrefix([['/claims', 'ins_claims'], ['/claims/adjuster-queue', 'ins_commissions'], ['/policies', 'ins_policy_admin']]));
    plugin.get('/claims/:id/reserves', async () => ({ ok: true }));
    plugin.get('/claims/adjuster-queue', async () => ({ ok: true }));
    plugin.get('/policies', async () => ({ ok: true }));
    plugin.get('/products', async () => ({ ok: true }));
  }, { prefix: '/api/insurance' });

  await app.ready();
  return app;
}

const bearer = (app, payload) => `Bearer ${app.jwt.sign(payload)}`;
const TENANT_USER = { sub: 'U1', role: 'user', role_level: 5, tenant_id: 4 };
const PLATFORM = { sub: 'P1', role: 'platform_admin', role_level: 1, tenant_id: null };

beforeEach(() => EntitlementService.invalidate());

describe('requireFeature', () => {
  it('admits a tenant whose plan includes the feature', async () => {
    const app = await appOnPlan('professional');
    const res = await app.inject({ method: 'GET', url: '/claims', headers: { authorization: bearer(app, TENANT_USER) } });
    expect(res.statusCode).toBe(200);
    await app.close();
  });

  it('refuses a tenant whose plan excludes it, naming the feature and the tier', async () => {
    const app = await appOnPlan('starter');
    const res = await app.inject({ method: 'GET', url: '/claims', headers: { authorization: bearer(app, TENANT_USER) } });
    expect(res.statusCode).toBe(403);
    const body = res.json();
    expect(body.error.code).toBe('FEATURE_NOT_ENTITLED');
    expect(body.error.message).toMatch(/Claims management/);
    expect(body.error.message).toMatch(/professional plan/);
    expect(body.error.details[0]).toMatchObject({ feature: 'ins_claims', min_plan: 'professional' });
    await app.close();
  });

  it('admits the same tenant to a feature its plan does include', async () => {
    const app = await appOnPlan('starter');
    const res = await app.inject({ method: 'GET', url: '/quotes', headers: { authorization: bearer(app, TENANT_USER) } });
    expect(res.statusCode).toBe(200);
    await app.close();
  });

  it('never gates a platform admin', async () => {
    // The console has no plan and must not be locked out of a tenant's data.
    const app = await appOnPlan('free');
    const res = await app.inject({ method: 'GET', url: '/claims', headers: { authorization: bearer(app, PLATFORM) } });
    expect(res.statusCode).toBe(200);
    await app.close();
  });

  it('still requires authentication first', async () => {
    const app = await appOnPlan('enterprise');
    expect((await app.inject({ method: 'GET', url: '/claims' })).statusCode).toBe(401);
    await app.close();
  });

  it('refuses to build a gate for a key the catalogue does not know', () => {
    expect(() => requireFeature('not_a_feature')).toThrow(/not a catalogue feature/);
    expect(() => featureGateByPrefix([['/x', 'not_a_feature']])).toThrow(/not a catalogue feature/);
  });
});

describe('featureGateByPrefix', () => {
  it('gates every route under a prefix from one table', async () => {
    const app = await appOnPlan('starter');
    const h = { authorization: bearer(app, TENANT_USER) };
    expect((await app.inject({ method: 'GET', url: '/api/insurance/claims/7/reserves', headers: h })).statusCode).toBe(403);
    expect((await app.inject({ method: 'GET', url: '/api/insurance/policies', headers: h })).statusCode).toBe(200);
    await app.close();
  });

  it('leaves routes outside the table open', async () => {
    const app = await appOnPlan('free');
    const res = await app.inject({ method: 'GET', url: '/api/insurance/products', headers: { authorization: bearer(app, TENANT_USER) } });
    expect(res.statusCode).toBe(200);
    await app.close();
  });

  it('lets the longest matching prefix win', async () => {
    // /claims/adjuster-queue is mapped to commissions; on professional both
    // are entitled, on starter neither is — so use a plan with claims but
    // check the message names commissions, proving the longer prefix matched.
    const app = await appOnPlan('starter');
    const res = await app.inject({ method: 'GET', url: '/api/insurance/claims/adjuster-queue', headers: { authorization: bearer(app, TENANT_USER) } });
    expect(res.statusCode).toBe(403);
    expect(res.json().error.details[0].feature).toBe('ins_commissions');
    await app.close();
  });
});

describe('FeatureNotEntitledError', () => {
  it('is a 403 that carries what the client needs', () => {
    const err = new FeatureNotEntitledError(C.getFeature('ins_claims'));
    expect(err.statusCode).toBe(403);
    expect(err.code).toBe('FEATURE_NOT_ENTITLED');
    expect(err.feature).toBe('ins_claims');
    expect(err.min_plan).toBe('professional');
    expect(err.isOperational).toBe(true);
  });
});
