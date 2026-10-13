'use strict';

/**
 * Proves that AsyncLocalStorage tenant context set in a Fastify preHandler
 * (via enterWith) propagates to the route handler AND stays isolated across
 * many concurrent, interleaved requests. This is the safety precondition for
 * removing the shared-instance `prisma._requestTenantId` fallback: if ALS is
 * reliable, the fallback is dead code and its cross-tenant race goes away.
 */

const Fastify = require('fastify');
const { tenantContext, getTenantId } = require('../src/middleware/tenant-scope');

function buildApp() {
  const app = Fastify();
  // Mirror the real authenticate() flow: set ALS in a preHandler from the token.
  app.addHook('onRequest', async () => {
    // Real app resets a per-request baseline here; ALS has no leak surface.
  });
  app.get('/whoami', {
    preHandler: async (req) => {
      const t = Number(req.headers['x-tenant']);
      if (t) tenantContext.enterWith({ tenantId: t });
    },
  }, async () => {
    // Simulate downstream async work (DB round-trips) before reading tenant.
    await new Promise((r) => setTimeout(r, Math.floor(Math.random() * 5)));
    return { tenant: getTenantId() };
  });
  return app;
}

describe('AsyncLocalStorage tenant propagation (Fastify hook → handler)', () => {
  let app;
  beforeAll(async () => { app = buildApp(); await app.ready(); });
  afterAll(async () => { await app.close(); });

  it('propagates the preHandler tenant to the handler', async () => {
    const res = await app.inject({ method: 'GET', url: '/whoami', headers: { 'x-tenant': '7' } });
    expect(res.json()).toEqual({ tenant: 7 });
  });

  it('keeps tenant isolated across 100 concurrent interleaved requests', async () => {
    const requests = [];
    for (let i = 1; i <= 100; i++) {
      const tenant = (i % 9) + 1; // tenants 1..9
      requests.push(
        app.inject({ method: 'GET', url: '/whoami', headers: { 'x-tenant': String(tenant) } })
          .then((res) => ({ expected: tenant, got: res.json().tenant })),
      );
    }
    const results = await Promise.all(requests);
    const leaks = results.filter((r) => r.got !== r.expected);
    expect(leaks).toEqual([]);
  });
});
