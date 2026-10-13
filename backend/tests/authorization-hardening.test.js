'use strict';

/**
 * The authorization invariants that used to be violable.
 *
 * Each block here corresponds to a way a tenant could reach authority it was
 * never granted. They are cheap, pure-ish tests on purpose: the guarantees are
 * arithmetic on role levels and a frozen threshold table, and that arithmetic
 * is what every route in the app leans on.
 */

const Fastify = require('fastify');
const jwtPlugin = require('../src/plugins/jwt');
const {
  authenticate, requireRole, requireAdmin, requirePlatformAdmin,
  resolveRoleLevel, levelOf, initRoleLevel,
  ROLE_LEVEL, BUILTIN_ROLE_LEVEL, NO_ACCESS_LEVEL,
  ADMIN_THRESHOLD, MANAGER_THRESHOLD, PLATFORM_ADMIN_THRESHOLD, PLATFORM_ADMIN_ROLE,
} = require('../src/middleware/authenticate');

describe('resolveRoleLevel — an unresolvable role is not a platform admin', () => {
  it('uses the level on the role row', () => {
    expect(resolveRoleLevel('manager', 4)).toBe(4);
    expect(resolveRoleLevel('custom_thing', 9)).toBe(9);
  });

  it('falls back to the built-in ladder when there is no row', () => {
    expect(resolveRoleLevel('admin', undefined)).toBe(BUILTIN_ROLE_LEVEL.admin);
    expect(resolveRoleLevel('user', null)).toBe(BUILTIN_ROLE_LEVEL.user);
  });

  it('fails closed for a role it cannot place at all', () => {
    // The regression: this used to be `?? 1`, i.e. full platform authority for
    // any employee whose role had no matching row — the guaranteed state of
    // every freshly created tenant.
    expect(resolveRoleLevel('regional_champion', undefined)).toBe(NO_ACCESS_LEVEL);
  });

  it('refuses to hand level 1 to anything but the reserved role', () => {
    expect(resolveRoleLevel(PLATFORM_ADMIN_ROLE, 1)).toBe(1);
    // A tenant-authored row claiming level 1 (or 0, or a negative) is clamped.
    expect(resolveRoleLevel('super_admin', 1)).toBe(BUILTIN_ROLE_LEVEL.super_admin);
    expect(resolveRoleLevel('sneaky', 0)).toBe(BUILTIN_ROLE_LEVEL.super_admin);
    expect(resolveRoleLevel('sneaky', -5)).toBe(BUILTIN_ROLE_LEVEL.super_admin);
  });
});

describe('levelOf — a forged token claim cannot buy platform access', () => {
  it('honours role_level from the token', () => {
    expect(levelOf({ role: 'manager', role_level: 4 })).toBe(4);
  });

  it('falls back to the name hints, then to no access', () => {
    expect(levelOf({ role: 'admin' })).toBe(BUILTIN_ROLE_LEVEL.admin);
    expect(levelOf({ role: 'nope' })).toBe(NO_ACCESS_LEVEL);
    expect(levelOf(undefined)).toBe(NO_ACCESS_LEVEL);
  });

  it('downgrades a level-1 claim on any role but platform_admin', () => {
    expect(levelOf({ role: PLATFORM_ADMIN_ROLE, role_level: 1 })).toBe(1);
    expect(levelOf({ role: 'super_admin', role_level: 1 })).toBe(BUILTIN_ROLE_LEVEL.super_admin);
  });
});

describe('the built-in ladder is immutable', () => {
  it('is frozen', () => {
    expect(Object.isFrozen(BUILTIN_ROLE_LEVEL)).toBe(true);
    expect(() => { BUILTIN_ROLE_LEVEL.admin = 9; }).toThrow();
  });

  it('sources the gate thresholds from the ladder, not the mutable hints', () => {
    expect(PLATFORM_ADMIN_THRESHOLD).toBe(BUILTIN_ROLE_LEVEL.platform_admin);
    expect(ADMIN_THRESHOLD).toBe(BUILTIN_ROLE_LEVEL.admin);
    expect(MANAGER_THRESHOLD).toBe(BUILTIN_ROLE_LEVEL.manager);
  });

  it('refuses to build a gate for a name that is not built in', () => {
    // A typo used to produce `targetLevel = 0`, i.e. a gate nobody could pass —
    // or, with a tenant role of that name in the map, one anybody could.
    expect(() => requireRole('regional_champion')).toThrow(/not a built-in role/);
  });

  it('keeps tenant-authored role names out of the process-wide hints', async () => {
    const prisma = {
      role: {
        findMany: jest.fn(async ({ where }) => {
          // Only system rows may be absorbed; assert the query says so.
          expect(where).toEqual({ is_active: true, tenant_id: null });
          return [
            { name: 'admin', level: 7 },            // built-in — must be ignored
            { name: 'compliance_officer', level: 5 }, // custom system role — absorbed
          ];
        }),
      },
    };
    await initRoleLevel(prisma);
    expect(ROLE_LEVEL.admin).toBe(BUILTIN_ROLE_LEVEL.admin);
    expect(ROLE_LEVEL.compliance_officer).toBe(5);
  });
});

describe('the platform gate', () => {
  let app;

  beforeAll(async () => {
    app = Fastify();
    await app.register(jwtPlugin);
    app.decorate('prisma', {}); // the lifecycle gate no-ops without a real client
    app.get('/platform', { preHandler: [requirePlatformAdmin] }, async () => ({ ok: true }));
    app.get('/admin', { preHandler: [requireAdmin] }, async () => ({ ok: true }));
    app.get('/any', { preHandler: [authenticate] }, async () => ({ ok: true }));
    await app.ready();
  });
  afterAll(async () => { await app.close(); });

  const call = (url, payload) => app.inject({
    method: 'GET', url, headers: { authorization: `Bearer ${app.jwt.sign(payload)}` },
  });

  it('admits the reserved platform role', async () => {
    const res = await call('/platform', { sub: 'P1', role: 'platform_admin', role_level: 1, tenant_id: null });
    expect(res.statusCode).toBe(200);
  });

  it('rejects a tenant super_admin holding a forged level-1 claim', async () => {
    const res = await call('/platform', { sub: 'A1', role: 'super_admin', role_level: 1, tenant_id: 4 });
    expect(res.statusCode).toBe(403);
  });

  it('rejects a tenant role merely NAMED platform_admin at a tenant level', async () => {
    // The cross-tenant escalation: one tenant creating a role called
    // `platform_admin` used to move the gate for the whole deployment.
    const res = await call('/platform', { sub: 'A2', role: 'platform_admin', role_level: 2, tenant_id: 4 });
    expect(res.statusCode).toBe(403);
  });

  it('still lets admins through the admin gate and keeps users out', async () => {
    expect((await call('/admin', { sub: 'A3', role: 'admin', role_level: 3, tenant_id: 4 })).statusCode).toBe(200);
    expect((await call('/admin', { sub: 'U1', role: 'user', role_level: 5, tenant_id: 4 })).statusCode).toBe(403);
  });

  it('keeps an unknown role out of every gate but lets it authenticate', async () => {
    const token = { sub: 'X1', role: 'regional_champion', tenant_id: 4 };
    expect((await call('/any', token)).statusCode).toBe(200);
    expect((await call('/admin', token)).statusCode).toBe(403);
    expect((await call('/platform', token)).statusCode).toBe(403);
  });
});
