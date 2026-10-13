'use strict';

/**
 * `min_role` on a dashboard.
 *
 * The schema defines it as the LEAST powerful role admitted — "'manager' =
 * manager + admin + super_admin only" — and levels are inverted, so the test is
 * `viewerLevel <= minLevel`. Both the list filter and the single-dashboard gate
 * asked the opposite, which hid restricted boards from the people entitled to
 * them and showed them to everyone else. `min_role` is the only restriction on
 * a dashboard with no explicit `UiPermission` row, i.e. on anything an admin
 * built by hand, so the direction of this comparison is a confidentiality
 * property, not a cosmetic one.
 */

const DashboardService = require('../src/services/dashboard.service');
const { BUILTIN_ROLE_LEVEL, NO_ACCESS_LEVEL, ADMIN_THRESHOLD } = require('../src/middleware/authenticate');

const { platform_admin: PLATFORM, super_admin: SUPER, admin: ADMIN, manager: MANAGER, user: USER } = BUILTIN_ROLE_LEVEL;

describe('canSeeDashboard', () => {
  it('admits the named role and everyone more senior', () => {
    // min_role = 'manager' → manager, admin, super_admin, platform_admin.
    for (const level of [PLATFORM, SUPER, ADMIN, MANAGER]) {
      expect(DashboardService.canSeeDashboard(level, MANAGER)).toBe(true);
    }
  });

  it('excludes everyone more junior than the named role', () => {
    expect(DashboardService.canSeeDashboard(USER, MANAGER)).toBe(false);
    expect(DashboardService.canSeeDashboard(NO_ACCESS_LEVEL, MANAGER)).toBe(false);
  });

  it('is not the old inverted test', () => {
    // The regression, stated as its own case: an admin must be able to see a
    // manager-gated board, and an ordinary user must not.
    expect(DashboardService.canSeeDashboard(ADMIN, MANAGER)).toBe(true);
    expect(DashboardService.canSeeDashboard(USER, MANAGER)).toBe(false);
  });

  it('treats a dangling min_role as admin-and-above', () => {
    // Never widen access because a role was deleted, but leave the board
    // reachable by someone who can repair it.
    expect(DashboardService.canSeeDashboard(ADMIN, null)).toBe(true);
    expect(DashboardService.canSeeDashboard(ADMIN_THRESHOLD, null)).toBe(true);
    expect(DashboardService.canSeeDashboard(MANAGER, null)).toBe(false);
    expect(DashboardService.canSeeDashboard(USER, null)).toBe(false);
  });
});

describe('getDashboards / canViewDashboard', () => {
  const BOARDS = [
    { id: 1, name: 'open', label: 'Everyone', min_role: null, is_active: true },
    { id: 2, name: 'mgr', label: 'Managers up', min_role: 'manager', is_active: true },
    { id: 3, name: 'exec', label: 'Super admins only', min_role: 'super_admin', is_active: true },
    { id: 4, name: 'custom', label: 'Compliance', min_role: 'compliance_officer', is_active: true },
    { id: 5, name: 'orphan', label: 'Deleted role', min_role: 'role_that_went_away', is_active: true },
  ];

  // The tenant's own roles, including a custom one the process-wide hints map
  // knows nothing about — the case that forced this lookup to hit the database.
  const ROLES = [
    { name: 'super_admin', level: SUPER, is_active: true },
    { name: 'admin', level: ADMIN, is_active: true },
    { name: 'manager', level: MANAGER, is_active: true },
    { name: 'user', level: USER, is_active: true },
    { name: 'compliance_officer', level: 4, is_active: true },
  ];

  function svc() {
    const db = {
      uiDashboard: { findMany: async () => BOARDS.map((b) => ({ ...b })) },
      role: {
        findFirst: async ({ where }) => ROLES.find((r) => r.name === where.name && r.is_active) ?? null,
      },
    };
    // A pass-through cache: caching by viewer role is orthogonal to the filter.
    const cache = { key: (...p) => p.join(':'), remember: (_k, fn) => fn() };
    return new DashboardService(db, cache);
  }

  const namesFor = async (role) => (await svc().getDashboards(role)).map((d) => d.name).sort();

  it('shows an ungated board to everybody', async () => {
    for (const role of ['user', 'manager', 'admin', 'super_admin']) {
      expect(await namesFor(role)).toContain('open');
    }
  });

  it('shows a manager-gated board to managers and above, not to users', async () => {
    expect(await namesFor('manager')).toContain('mgr');
    expect(await namesFor('admin')).toContain('mgr');
    expect(await namesFor('super_admin')).toContain('mgr');
    expect(await namesFor('user')).not.toContain('mgr');
  });

  it('shows a super-admin board only to super admins', async () => {
    expect(await namesFor('super_admin')).toContain('exec');
    expect(await namesFor('admin')).not.toContain('exec');
    expect(await namesFor('manager')).not.toContain('exec');
  });

  it('honours a custom tenant role as the bar', async () => {
    // compliance_officer sits at level 4, same as manager.
    expect(await namesFor('compliance_officer')).toContain('custom');
    expect(await namesFor('admin')).toContain('custom');
    expect(await namesFor('user')).not.toContain('custom');
  });

  it('keeps a board whose min_role was deleted away from non-admins', async () => {
    expect(await namesFor('admin')).toContain('orphan');
    expect(await namesFor('manager')).not.toContain('orphan');
    expect(await namesFor('user')).not.toContain('orphan');
  });

  it('shows an unrecognised viewer only the ungated boards', async () => {
    expect(await namesFor('who_is_this')).toEqual(['open']);
  });

  it('returns everything for the builder context (no viewer role)', async () => {
    expect((await svc().getDashboards(null)).map((d) => d.name).sort())
      .toEqual(BOARDS.map((b) => b.name).sort());
  });

  it('agrees with itself between the list filter and the single-board gate', async () => {
    const s = svc();
    for (const role of ['user', 'manager', 'admin', 'super_admin', 'compliance_officer']) {
      const listed = new Set((await s.getDashboards(role)).map((d) => d.id));
      for (const board of BOARDS) {
        expect(await s.canViewDashboard(role, board.min_role)).toBe(listed.has(board.id));
      }
    }
  });
});
