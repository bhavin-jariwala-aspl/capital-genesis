'use strict';

/**
 * `Tenant.status` has to mean something.
 *
 * The admin guide has always promised that suspending a tenant makes "all
 * users lose access", but nothing read the flag on the request path: issued
 * tokens kept working until they expired, and an expired trial was simply a
 * date nobody looked at. These tests pin the gate that closes that, including
 * the part that matters operationally — that a suspension takes effect without
 * waiting out the status memo.
 */

const Fastify = require('fastify');
const jwtPlugin = require('../src/plugins/jwt');
const { authenticate } = require('../src/middleware/authenticate');
const lifecycle = require('../src/middleware/tenant-lifecycle');
const { assertTenantUsable, blockReason, invalidate, STATUS_TTL_MS } = lifecycle;

const DAY = 86_400_000;

beforeEach(() => invalidate());

describe('blockReason', () => {
  it('lets an active tenant through', () => {
    expect(blockReason({ status: 'active', trial_ends_at: null })).toBeNull();
  });

  it('blocks suspended, cancelled and deleted tenants', () => {
    expect(blockReason({ status: 'suspended' })).toMatch(/suspended/i);
    expect(blockReason({ status: 'cancelled' })).toMatch(/cancelled/i);
    expect(blockReason({ status: 'deleted' })).toMatch(/no longer available/i);
  });

  it('blocks a tenant whose row has vanished', () => {
    expect(blockReason(null)).toMatch(/no longer available/i);
  });

  it('lets a live trial through and blocks an expired one', () => {
    const now = Date.now();
    expect(blockReason({ status: 'trial', trial_ends_at: new Date(now + DAY) }, now)).toBeNull();
    expect(blockReason({ status: 'trial', trial_ends_at: new Date(now - DAY) }, now)).toMatch(/trial has ended/i);
  });

  it('treats a trial with no end date as open-ended rather than expired', () => {
    expect(blockReason({ status: 'trial', trial_ends_at: null })).toBeNull();
  });
});

describe('assertTenantUsable', () => {
  const clientFor = (tenant) => ({
    tenant: { findUnique: jest.fn(async () => tenant) },
  });

  it('no-ops for a platform admin (no tenant)', async () => {
    const db = clientFor({ status: 'suspended' });
    await expect(assertTenantUsable(db, null)).resolves.toBeUndefined();
    expect(db.tenant.findUnique).not.toHaveBeenCalled();
  });

  it('no-ops for a client that cannot answer (unit tests, boot)', async () => {
    await expect(assertTenantUsable({}, 3)).resolves.toBeUndefined();
    await expect(assertTenantUsable(undefined, 3)).resolves.toBeUndefined();
  });

  it('throws 403 for a suspended tenant', async () => {
    await expect(assertTenantUsable(clientFor({ status: 'suspended' }), 3))
      .rejects.toMatchObject({ statusCode: 403 });
  });

  it('memoises the status instead of reading it per request', async () => {
    const db = clientFor({ status: 'active' });
    for (let i = 0; i < 5; i++) await assertTenantUsable(db, 3);
    expect(db.tenant.findUnique).toHaveBeenCalledTimes(1);
  });

  it('re-reads once invalidated, so a suspension bites immediately', async () => {
    let status = 'active';
    // A fresh object each call: returning one shared reference would let the
    // mutation below leak into the memoised copy and prove nothing.
    const db = { tenant: { findUnique: jest.fn(async () => ({ id: 3, status, trial_ends_at: null })) } };
    await assertTenantUsable(db, 3);

    status = 'suspended';
    // Without the drop the old status would stand for up to the TTL.
    await expect(assertTenantUsable(db, 3)).resolves.toBeUndefined();
    invalidate(3);
    await expect(assertTenantUsable(db, 3)).rejects.toMatchObject({ statusCode: 403 });
  });

  it('keeps tenants in separate memo slots', async () => {
    const db = {
      tenant: {
        findUnique: jest.fn(async ({ where }) => ({ status: where.id === 9 ? 'suspended' : 'active' })),
      },
    };
    await expect(assertTenantUsable(db, 8)).resolves.toBeUndefined();
    await expect(assertTenantUsable(db, 9)).rejects.toMatchObject({ statusCode: 403 });
  });

  it('fails open when the database cannot be reached', async () => {
    // A connectivity blip must not lock every tenant out of the product; the
    // request that follows will fail on its own if the database is really down.
    const db = { tenant: { findUnique: jest.fn(async () => { throw new Error('ECONNRESET'); }) } };
    await expect(assertTenantUsable(db, 3)).resolves.toBeUndefined();
    // Nothing was cached, so the next request retries rather than trusting it.
    await assertTenantUsable(db, 3);
    expect(db.tenant.findUnique).toHaveBeenCalledTimes(2);
  });

  it('ships a TTL short enough to be operationally honest', () => {
    expect(STATUS_TTL_MS).toBeLessThanOrEqual(60_000);
  });
});

describe('authenticate — the gate is on the request path', () => {
  /** @returns {Promise<import('fastify').FastifyInstance>} */
  async function buildApp(status) {
    const app = Fastify();
    await app.register(jwtPlugin);
    app.decorate('prisma', { tenant: { findUnique: async () => ({ id: 5, status, trial_ends_at: null }) } });
    app.get('/whoami', { preHandler: [authenticate] }, async () => ({ ok: true }));
    await app.ready();
    return app;
  }

  const hit = (app) => app.inject({
    method: 'GET', url: '/whoami',
    headers: { authorization: `Bearer ${app.jwt.sign({ sub: 'E1', role: 'user', role_level: 5, tenant_id: 5 })}` },
  });

  it('serves a request from an active tenant', async () => {
    const app = await buildApp('active');
    expect((await hit(app)).statusCode).toBe(200);
    await app.close();
  });

  it('rejects an otherwise-valid token from a suspended tenant', async () => {
    const app = await buildApp('suspended');
    const res = await hit(app);
    expect(res.statusCode).toBe(403);
    // No custom error handler on this bare app, so Fastify's default body applies.
    expect(res.json().message).toMatch(/suspended/i);
    await app.close();
  });
});
