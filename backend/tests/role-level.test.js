'use strict';

/**
 * The role-level resolver, and the regression it exists to close.
 *
 * `initRoleLevel` stopped absorbing tenant roles into the process-wide map in
 * September 2026 (correctly — a tenant naming a role `admin` at level 7 had
 * been moving the admin bar for every other tenant). But the permission
 * service still resolved a role's level from that map alone, so every custom
 * tenant role fell to NO_ACCESS: a `regional_manager` at level 4 that relied
 * on default scopes dropped from `hierarchy` to `own`, and a custom
 * admin-level role lost its admin bypass. These tests pin the fix.
 */

const { roleLevelFor, viewerLevel, invalidateRoleLevels } = require('../src/services/role-level');
const { BUILTIN_ROLE_LEVEL, NO_ACCESS_LEVEL, ADMIN_THRESHOLD } = require('../src/middleware/authenticate');
const PermissionService = require('../src/services/permission.service');

beforeEach(() => invalidateRoleLevels());

function dbWithRoles(rows) {
  return {
    role: {
      findFirst: jest.fn(async ({ where }) => {
        const hits = rows.filter((r) => r.name === where.name && r.is_active !== false);
        // Mimic `orderBy tenant_id desc`: a tenant row beats the system row.
        hits.sort((a, b) => (b.tenant_id ?? -1) - (a.tenant_id ?? -1));
        return hits[0] ?? null;
      }),
    },
    uiPermission: { findUnique: jest.fn(async () => null), findMany: jest.fn(async () => []) },
    operationalPermission: { findFirst: jest.fn(async () => null) },
  };
}

describe('roleLevelFor', () => {
  it('reads a custom tenant role from the roles table', async () => {
    const db = dbWithRoles([{ name: 'regional_manager', level: 4, tenant_id: 3 }]);
    expect(await roleLevelFor(db, 'regional_manager', 3)).toBe(4);
  });

  it('prefers the tenant row over the shared system row', async () => {
    const db = dbWithRoles([
      { name: 'manager', level: 4, tenant_id: null },
      { name: 'manager', level: 5, tenant_id: 3 },   // this tenant demoted managers
    ]);
    expect(await roleLevelFor(db, 'manager', 3)).toBe(5);
  });

  it('falls back to the built-in ladder for a shipped role with no row', async () => {
    expect(await roleLevelFor(dbWithRoles([]), 'admin', 3)).toBe(BUILTIN_ROLE_LEVEL.admin);
  });

  it('fails closed for a role that exists nowhere', async () => {
    expect(await roleLevelFor(dbWithRoles([]), 'ghost', 3)).toBe(NO_ACCESS_LEVEL);
    expect(await roleLevelFor(dbWithRoles([]), null, 3)).toBe(NO_ACCESS_LEVEL);
  });

  it('never lets a tenant row claim platform authority', async () => {
    const db = dbWithRoles([{ name: 'sneaky', level: 1, tenant_id: 3 }]);
    expect(await roleLevelFor(db, 'sneaky', 3)).toBe(BUILTIN_ROLE_LEVEL.super_admin);
  });

  it('memoises per tenant and role, and forgets on invalidate', async () => {
    const db = dbWithRoles([{ name: 'x', level: 6, tenant_id: 3 }]);
    await roleLevelFor(db, 'x', 3);
    await roleLevelFor(db, 'x', 3);
    expect(db.role.findFirst).toHaveBeenCalledTimes(1);
    invalidateRoleLevels(3);
    await roleLevelFor(db, 'x', 3);
    expect(db.role.findFirst).toHaveBeenCalledTimes(2);
  });

  it('keeps tenants apart in the memo', async () => {
    const a = dbWithRoles([{ name: 'ops', level: 3, tenant_id: 1 }]);
    const b = dbWithRoles([{ name: 'ops', level: 6, tenant_id: 2 }]);
    expect(await roleLevelFor(a, 'ops', 1)).toBe(3);
    expect(await roleLevelFor(b, 'ops', 2)).toBe(6);
  });

  it('survives a database error without turning a check into a 500', async () => {
    const db = { role: { findFirst: jest.fn(async () => { throw new Error('ECONNRESET'); }) } };
    expect(await roleLevelFor(db, 'admin', 3)).toBe(BUILTIN_ROLE_LEVEL.admin); // built-in still resolves
    expect(await roleLevelFor(db, 'custom', 3)).toBe(NO_ACCESS_LEVEL);          // unknown fails closed
  });
});

describe('viewerLevel', () => {
  it('prefers the live role row over the token claim', async () => {
    const db = dbWithRoles([{ name: 'manager', level: 5, tenant_id: 3 }]);
    expect(await viewerLevel(db, { role: 'manager', role_level: 4, tenant_id: 3 })).toBe(5);
  });

  it('falls back to the claim without a client', async () => {
    expect(await viewerLevel(null, { role: 'manager', role_level: 4 })).toBe(4);
    expect(await viewerLevel(null, {})).toBe(NO_ACCESS_LEVEL);
  });
});

describe('PermissionService — custom tenant roles keep their authority', () => {
  it('gives a custom manager-level role manager default scopes', async () => {
    // The regression: this returned the level-999 defaults (view own only).
    const db = dbWithRoles([{ name: 'regional_manager', level: 4, tenant_id: 3 }]);
    const perms = await new PermissionService(db).getOperationalPermission('task', 'regional_manager');
    expect(perms.view_scope).toBe('hierarchy');
    expect(perms.assign_scope).toBe('team');
  });

  it('gives a custom admin-level role the admin bypass', async () => {
    const db = dbWithRoles([{ name: 'regional_admin', level: ADMIN_THRESHOLD, tenant_id: 3 }]);
    const svc = new PermissionService(db);
    expect(await svc.getEffectiveUiPermission('module', 1, 'regional_admin', 3)).toEqual({ can_view: true, can_edit: true });
    expect(db.uiPermission.findUnique).not.toHaveBeenCalled(); // bypassed the row lookup
    await expect(svc.assertCanDecideUnderwriting('regional_admin', 3)).resolves.toBe(true);
  });

  it('still denies an unknown role the admin bypass', async () => {
    const svc = new PermissionService(dbWithRoles([]));
    const p = await svc.getEffectiveUiPermission('module', 1, 'ghost', 3);
    expect(p.can_edit).toBe(false);
    const perms = await svc.getOperationalPermission('task', 'ghost');
    expect(perms.view_scope).toBe('own');
    expect(perms.assign_scope).toBe('none');
  });
});
