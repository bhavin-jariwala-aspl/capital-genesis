'use strict';

/**
 * The real `authenticate` hook, through a real Fastify + @fastify/jwt stack.
 *
 * Proves hardening follow-up #1 is closed: the tenant installed by the hook
 * reaches the route handler (and therefore the Prisma tenant-scope extension),
 * stays isolated across concurrent requests, and is absent for platform-admin
 * tokens. The earlier `tenant-als-propagation.test.js` only proved the
 * *mechanism*; this one exercises the actual middleware, which used to `await`
 * before `enterWith()` and so never propagated anything.
 */

const Fastify = require('fastify');
const jwtPlugin = require('../src/plugins/jwt');
const { authenticate, requireRole, extractBearerToken } = require('../src/middleware/authenticate');
const { getTenantId } = require('../src/middleware/tenant-scope');
const CurrencyService = require('../src/services/currency.service');

async function buildApp() {
  const app = Fastify();
  await app.register(jwtPlugin);
  app.decorate('prisma', {}); // authenticate only touches prisma on a currency cache miss
  app.get('/whoami', { preHandler: [authenticate] }, async () => {
    await new Promise((r) => setTimeout(r, Math.floor(Math.random() * 4)));
    return { tenant: getTenantId(), currency: CurrencyService.activeProfile().code };
  });
  app.get('/admin', { preHandler: [requireRole('admin')] }, async () => ({ tenant: getTenantId() }));
  await app.ready();
  return app;
}

describe('authenticate — tenant context reaches the handler', () => {
  let app;
  beforeAll(async () => { app = await buildApp(); });
  afterAll(async () => { await app.close(); });

  const token = (payload) => app.jwt.sign(payload);
  const get = (url, t) => app.inject({ method: 'GET', url, headers: t ? { authorization: `Bearer ${t}` } : {} });

  it('installs the token tenant for the handler', async () => {
    const res = await get('/whoami', token({ sub: 'E1', role: 'user', tenant_id: 7 }));
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ tenant: 7 });
  });

  it('propagates through requireRole (which awaits authenticate)', async () => {
    const res = await get('/admin', token({ sub: 'A1', role: 'admin', role_level: 3, tenant_id: 3 }));
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ tenant: 3 });
  });

  it('keeps tenants isolated across 60 concurrent requests', async () => {
    const results = await Promise.all(Array.from({ length: 60 }, (_, i) => {
      const t = (i % 6) + 1;
      return get('/whoami', token({ sub: `E${i}`, role: 'user', tenant_id: t }))
        .then((r) => ({ expected: t, got: r.json().tenant }));
    }));
    expect(results.filter((r) => r.got !== r.expected)).toEqual([]);
  });

  it('leaves platform-admin tokens (no tenant) unscoped', async () => {
    const res = await get('/whoami', token({ sub: 'P1', role: 'platform_admin', role_level: 1, tenant_id: null }));
    expect(res.json().tenant).toBeNull();
  });

  it('rejects a missing, malformed, or forged token with 401', async () => {
    expect((await get('/whoami')).statusCode).toBe(401);
    expect((await get('/whoami', 'not-a-jwt')).statusCode).toBe(401);
    // Flip a character in the MIDDLE of the signature. The last base64url
    // character of an HMAC-SHA256 signature carries unused padding bits, so
    // changing it can decode to the same bytes and the "forged" token stays
    // valid — which made this test fail about one run in twelve.
    const good = token({ sub: 'X', tenant_id: 1 });
    const sigAt = good.lastIndexOf('.') + 10;
    const forged = good.slice(0, sigAt) + (good[sigAt] === 'a' ? 'b' : 'a') + good.slice(sigAt + 1);
    expect((await get('/whoami', forged)).statusCode).toBe(401);
    const res = await app.inject({ method: 'GET', url: '/whoami', headers: { authorization: 'Basic abc' } });
    expect(res.statusCode).toBe(401);
  });

  it('installs the memoised currency profile when one is cached', async () => {
    // Prime the cache directly through getProfile with a stubbed settings read.
    const svc = new CurrencyService({});
    jest.spyOn(require('../src/services/settings.service').prototype, 'getEffective')
      .mockResolvedValueOnce({ 'localization.currency': 'EUR', 'localization.locale': 'de-DE', 'localization.number_format': '1.234,56' });
    await svc.getProfile(11);
    expect(CurrencyService.peek(11)?.code).toBe('EUR');

    const res = await get('/whoami', token({ sub: 'E9', role: 'user', tenant_id: 11 }));
    expect(res.json()).toEqual({ tenant: 11, currency: 'EUR' });

    // A tenant with no cached profile falls back to USD but is still scoped.
    const miss = await get('/whoami', token({ sub: 'E10', role: 'user', tenant_id: 12 }));
    expect(miss.json()).toEqual({ tenant: 12, currency: 'USD' });
  });
});

describe('extractBearerToken', () => {
  it('accepts only the Bearer scheme', () => {
    expect(extractBearerToken({ headers: { authorization: 'Bearer abc' } })).toBe('abc');
    expect(extractBearerToken({ headers: { authorization: 'bearer abc' } })).toBe('abc');
    expect(extractBearerToken({ headers: { authorization: 'Basic abc' } })).toBeNull();
    expect(extractBearerToken({ headers: {} })).toBeNull();
  });
});
