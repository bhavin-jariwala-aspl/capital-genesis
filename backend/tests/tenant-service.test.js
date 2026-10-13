'use strict';

/**
 * TenantService input handling.
 *
 * `create` and `update` used to spread the request body into Prisma, so the
 * plan limits the chosen plan is supposed to dictate were caller-settable and a
 * misspelled plan or status produced a tenant no lifecycle branch recognised.
 * `list` clamped `take` but paged with the unclamped `limit`, which silently
 * dropped rows between pages.
 */

const TenantService = require('../src/services/platform/tenant.service');
const { slugify, PLANS, STATUSES } = TenantService;

function fakeDb({ tenants = [], plans = [] } = {}) {
  const created = [];
  const updated = [];
  const calls = { findMany: [] };
  const db = {
    tenant: {
      findUnique: async ({ where }) => tenants.find((t) => (where.slug ? t.slug === where.slug : where.domain ? t.domain === where.domain : t.id === where.id)) ?? null,
      findMany: async (args) => { calls.findMany.push(args); return []; },
      count: async () => tenants.length,
      create: async ({ data }) => { created.push(data); return { id: 99, ...data }; },
      update: async ({ where, data }) => { updated.push({ where, data }); return { id: where.id, ...data }; },
      groupBy: async () => [],
    },
    subscriptionPlan: {
      findUnique: async ({ where }) => plans.find((p) => p.name === where.name) ?? null,
    },
  };
  return { db, created, updated, calls, svc: new TenantService(db) };
}

const PRO = { name: 'professional', max_users: 50, max_storage_mb: 5000, max_api_calls: 100000, trial_days: 21 };

describe('slugify', () => {
  it('produces a slug the API will accept', () => {
    expect(slugify('Acme Insurance Group, Inc.')).toBe('acme-insurance-group-inc');
    expect(slugify('  Hello   World  ')).toBe('hello-world');
    // Accents are folded, not dropped, so real organisation names survive.
    expect(slugify('Ünïcode & Co')).toBe('unicode-co');
    expect(slugify('Café Assurance')).toBe('cafe-assurance');
  });

  it('never leaves a trailing hyphen, even after truncation', () => {
    const long = slugify(`${'a'.repeat(99)} b`);
    expect(long.length).toBeLessThanOrEqual(100);
    expect(long.endsWith('-')).toBe(false);
  });
});

describe('create', () => {
  it('requires a name', async () => {
    const { svc } = fakeDb();
    await expect(svc.create({ slug: 'acme' })).rejects.toThrow(/name is required/);
    await expect(svc.create({ name: '   ' })).rejects.toThrow(/name is required/);
  });

  it('derives the slug from the name when none is given', async () => {
    const { svc, created } = fakeDb();
    await svc.create({ name: 'Acme Insurance Group' });
    expect(created[0].slug).toBe('acme-insurance-group');
  });

  it('rejects a malformed slug rather than storing an unroutable one', async () => {
    const { svc } = fakeDb();
    await expect(svc.create({ name: 'Acme', slug: 'Not A Slug' })).rejects.toThrow(/slug must be/);
    await expect(svc.create({ name: 'Acme', slug: 'ab' })).rejects.toThrow(/slug must be/);
    await expect(svc.create({ name: 'Acme', slug: '-nope-' })).rejects.toThrow(/slug must be/);
  });

  it('rejects an unknown plan or status', async () => {
    const { svc } = fakeDb();
    await expect(svc.create({ name: 'Acme', plan: 'Enterprise' })).rejects.toThrow(/plan must be one of/);
    await expect(svc.create({ name: 'Acme', status: 'activ' })).rejects.toThrow(/status must be one of/);
  });

  it('rejects a malformed billing email', async () => {
    const { svc } = fakeDb();
    await expect(svc.create({ name: 'Acme', billing_email: 'not-an-email' })).rejects.toThrow(/billing_email/);
  });

  it('reports a slug or domain already in use as a conflict', async () => {
    const { svc } = fakeDb({ tenants: [{ id: 1, slug: 'acme', domain: 'acme.test' }] });
    await expect(svc.create({ name: 'Acme', slug: 'acme' })).rejects.toMatchObject({ statusCode: 409 });
    await expect(svc.create({ name: 'Acme', slug: 'acme-2', domain: 'acme.test' })).rejects.toMatchObject({ statusCode: 409 });
  });

  it('takes the plan limits from the plan, never from the caller', async () => {
    const { svc, created } = fakeDb({ plans: [PRO] });
    await svc.create({ name: 'Acme', plan: 'professional', max_users: 100000, max_api_calls: 999999999 });
    expect(created[0]).toMatchObject({ max_users: PRO.max_users, max_api_calls: PRO.max_api_calls });
  });

  it('drops columns the database owns', async () => {
    const { svc, created } = fakeDb();
    await svc.create({ name: 'Acme', id: 4242, created_at: new Date(0), suspended_at: new Date(0), deleted_at: new Date(0) });
    expect(created[0].id).toBeUndefined();
    expect(created[0].created_at).toBeUndefined();
    expect(created[0].suspended_at).toBeUndefined();
    expect(created[0].deleted_at).toBeUndefined();
  });

  it('starts a paid plan on trial using the plan trial length', async () => {
    const { svc, created } = fakeDb({ plans: [PRO] });
    const before = Date.now();
    await svc.create({ name: 'Acme', plan: 'professional' });
    expect(created[0].status).toBe('trial');
    const days = (created[0].trial_ends_at.getTime() - before) / 86_400_000;
    expect(Math.round(days)).toBe(PRO.trial_days);
  });

  it('leaves the free plan off trial', async () => {
    const { svc, created } = fakeDb({ plans: [{ name: 'free', max_users: 5, max_storage_mb: 500, max_api_calls: 10000 }] });
    await svc.create({ name: 'Acme', plan: 'free' });
    expect(created[0].status).toBeUndefined();
    expect(created[0].trial_ends_at).toBeUndefined();
  });
});

describe('update', () => {
  const existing = { tenants: [{ id: 1, slug: 'acme', status: 'active' }] };

  it('sends the plan and slug to their own paths instead of half-applying them', async () => {
    const { svc } = fakeDb(existing);
    // A plan set here would not bring its limits with it, and a changed slug
    // would orphan every URL and branding asset key that references it.
    await expect(svc.update(1, { plan: 'enterprise' })).rejects.toThrow(/change-plan/);
    await expect(svc.update(1, { slug: 'renamed' })).rejects.toThrow(/slug cannot be changed/);
  });

  it('drops fields the caller may not set', async () => {
    const { svc, updated } = fakeDb(existing);
    await svc.update(1, { name: 'Acme Two', max_users: 99999, id: 7, deleted_at: null });
    expect(updated[0].data).toEqual({ name: 'Acme Two' });
  });

  it('rejects an empty update rather than issuing a no-op write', async () => {
    const { svc } = fakeDb(existing);
    await expect(svc.update(1, { nonsense: true })).rejects.toThrow(/No updatable fields/);
  });

  it('validates status and billing email', async () => {
    const { svc } = fakeDb(existing);
    await expect(svc.update(1, { status: 'paused' })).rejects.toThrow(/status must be one of/);
    await expect(svc.update(1, { billing_email: 'nope' })).rejects.toThrow(/billing_email/);
  });
});

describe('list', () => {
  it('pages with the clamped page size, so no rows fall between pages', async () => {
    const { svc, calls } = fakeDb();
    await svc.list({ page: 2, limit: 500 });
    const [args] = calls.findMany;
    // take is capped at 100; skip must be computed from the same number.
    expect(args.take).toBe(100);
    expect(args.skip).toBe(100);
  });

  it('defaults sanely and ignores nonsense paging input', async () => {
    const { svc, calls } = fakeDb();
    await svc.list({ page: 0, limit: -3 });
    expect(calls.findMany[0]).toMatchObject({ skip: 0, take: 1 });
    await svc.list({});
    expect(calls.findMany[1]).toMatchObject({ skip: 0, take: 20 });
  });
});

describe('the accepted vocabularies', () => {
  it('match what the tenant lifecycle and the console know about', () => {
    expect(PLANS).toEqual(['free', 'starter', 'professional', 'enterprise']);
    expect(STATUSES).toEqual(expect.arrayContaining(['active', 'trial', 'suspended', 'cancelled', 'deleted']));
  });
});
