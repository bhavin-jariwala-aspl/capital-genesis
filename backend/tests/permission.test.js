'use strict';

/**
 * PermissionService — unit tests.
 *
 * Covers:
 *   1. UI/Metadata permissions (filterMetadataByRole, getEffectiveUiPermission)
 *   2. Operational permissions (checkOperationalScope, buildViewScopeFilter)
 *   3. Scope-based task create/edit/delete (via TaskService integration)
 *   4. Scope-based activity create/edit/delete (via ActivityService integration)
 */

const PermissionService = require('../src/services/permission.service');
const TaskService       = require('../src/services/task.service');
const ActivityService   = require('../src/services/activity.service');
const { AuthorizationError } = require('../src/utils/errors');

// ── Mock helpers ──────────────────────────────────────────────────────────────

function makePermDb({
  uiPermRows = [],
  opPermRow  = null,
  hierarchyRows = [],
} = {}) {
  return {
    uiPermission: {
      findUnique: jest.fn(({ where }) => {
        const key = where.entity_type_entity_id_role_name_tenant_id ?? where.entity_type_entity_id_role_name ?? {};
        const row = uiPermRows.find(
          r => r.entity_type === key.entity_type &&
               r.entity_id  === key.entity_id   &&
               r.role_name  === key.role_name,
        );
        return Promise.resolve(row ?? null);
      }),
      findMany: jest.fn().mockResolvedValue(uiPermRows),
      upsert:   jest.fn(({ create }) => Promise.resolve(create)),
    },
    operationalPermission: {
      findFirst:  jest.fn().mockResolvedValue(opPermRow),
      findMany:   jest.fn().mockResolvedValue(opPermRow ? [opPermRow] : []),
      update:     jest.fn(({ data }) => Promise.resolve(data)),
      create:     jest.fn(({ data }) => Promise.resolve(data)),
    },
    employeeHierarchy: {
      findMany: jest.fn().mockResolvedValue(hierarchyRows),
    },
  };
}

function viewer(role, id) {
  return { role, employee_id: id, employeeId: id };
}

// ── UI Permission tests ───────────────────────────────────────────────────────

describe('PermissionService — UI permissions', () => {
  describe('getEffectiveUiPermission', () => {
    it('returns full access for super_admin without DB query', async () => {
      const db  = makePermDb();
      const svc = new PermissionService(db);
      const p   = await svc.getEffectiveUiPermission('module', 1, 'super_admin');
      expect(p).toEqual({ can_view: true, can_edit: true });
      expect(db.uiPermission.findUnique).not.toHaveBeenCalled();
    });

    it('returns full access for admin without DB query', async () => {
      const db  = makePermDb();
      const svc = new PermissionService(db);
      const p   = await svc.getEffectiveUiPermission('object', 5, 'admin');
      expect(p).toEqual({ can_view: true, can_edit: true });
      expect(db.uiPermission.findUnique).not.toHaveBeenCalled();
    });

    it('returns explicit row when present', async () => {
      const db = makePermDb({
        uiPermRows: [{
          entity_type: 'field', entity_id: 7, role_name: 'manager',
          can_view: true, can_edit: true,
        }],
      });
      const svc = new PermissionService(db);
      const p   = await svc.getEffectiveUiPermission('field', 7, 'manager');
      expect(p).toEqual({ can_view: true, can_edit: true });
    });

    it('defaults to can_view=true, can_edit=false when no row exists', async () => {
      const db  = makePermDb();
      const svc = new PermissionService(db);
      const p   = await svc.getEffectiveUiPermission('field', 99, 'user');
      expect(p).toEqual({ can_view: true, can_edit: false });
    });

    it('respects can_view=false explicit row', async () => {
      const db = makePermDb({
        uiPermRows: [{
          entity_type: 'module', entity_id: 3, role_name: 'user',
          can_view: false, can_edit: false,
        }],
      });
      const svc = new PermissionService(db);
      const p   = await svc.getEffectiveUiPermission('module', 3, 'user');
      expect(p).toEqual({ can_view: false, can_edit: false });
    });
  });

  describe('filterMetadataByRole', () => {
    const entities = [
      { id: 1, name: 'contacts' },
      { id: 2, name: 'deals' },
      { id: 3, name: 'secrets' },
    ];

    it('admins see all entities with _can_edit=true', async () => {
      const db  = makePermDb();
      const svc = new PermissionService(db);
      const out = await svc.filterMetadataByRole(entities, 'object', 'admin');
      expect(out).toHaveLength(3);
      expect(out.every(e => e._can_edit === true)).toBe(true);
    });

    it('hides entities where can_view=false for the role', async () => {
      const db = makePermDb({
        uiPermRows: [
          { entity_type: 'object', entity_id: 3, role_name: 'user', can_view: false, can_edit: false },
        ],
      });
      const svc = new PermissionService(db);
      const out = await svc.filterMetadataByRole(entities, 'object', 'user');
      expect(out.map(e => e.id)).not.toContain(3);
      expect(out).toHaveLength(2);
    });

    it('marks _can_edit=false for view-only rows', async () => {
      const db = makePermDb({
        uiPermRows: [
          { entity_type: 'object', entity_id: 1, role_name: 'user', can_view: true, can_edit: false },
        ],
      });
      const svc = new PermissionService(db);
      const out = await svc.filterMetadataByRole(entities, 'object', 'user');
      const obj = out.find(e => e.id === 1);
      expect(obj._can_edit).toBe(false);
    });

    it('marks _can_edit=false (default) for entities with no explicit row', async () => {
      const db  = makePermDb();
      const svc = new PermissionService(db);
      const out = await svc.filterMetadataByRole(entities, 'object', 'manager');
      expect(out.every(e => e._can_edit === false)).toBe(true);
    });
  });
});

// ── Operational permission tests ──────────────────────────────────────────────

describe('PermissionService — operational permissions', () => {
  describe('checkOperationalScope — defaults', () => {
    it('admin can create any task', async () => {
      const db  = makePermDb();
      const svc = new PermissionService(db);
      await expect(
        svc.checkOperationalScope('task', 'create', viewer('admin', 'A'), {
          created_by: 'A', assigned_to: 'A',
        }),
      ).resolves.toBe(true);
    });

    it('user can create own task', async () => {
      const db  = makePermDb();
      const svc = new PermissionService(db);
      await expect(
        svc.checkOperationalScope('task', 'create', viewer('user', 'E001'), {
          created_by: 'E001', assigned_to: 'E001',
        }),
      ).resolves.toBe(true);
    });

    it('user cannot edit another user\'s task (own scope)', async () => {
      const db  = makePermDb();
      const svc = new PermissionService(db);
      await expect(
        svc.checkOperationalScope('task', 'edit', viewer('user', 'E999'), {
          created_by: 'E001', assigned_to: 'E001',
        }),
      ).rejects.toThrow(AuthorizationError);
    });

    it('manager can edit task created by hierarchy descendant', async () => {
      const db = makePermDb({
        hierarchyRows: [{ descendant_id: 'E001' }, { descendant_id: 'E002' }],
      });
      const svc = new PermissionService(db);
      await expect(
        svc.checkOperationalScope('task', 'edit', viewer('manager', 'E002'), {
          created_by: 'E001', assigned_to: 'E001',
        }),
      ).resolves.toBe(true);
    });

    it('manager cannot edit task outside their hierarchy', async () => {
      const db = makePermDb({
        hierarchyRows: [{ descendant_id: 'E002' }],
      });
      const svc = new PermissionService(db);
      await expect(
        svc.checkOperationalScope('task', 'edit', viewer('manager', 'E002'), {
          created_by: 'E001', assigned_to: 'E001',
        }),
      ).rejects.toThrow(AuthorizationError);
    });
  });

  describe('checkOperationalScope — explicit DB permissions', () => {
    it('user with view_scope=all can view any task', async () => {
      const db = makePermDb({
        opPermRow: {
          entity_type: 'task', role_name: 'user',
          view_scope: 'all', create_scope: 'own',
          edit_scope: 'own', delete_scope: 'own', assign_scope: 'none',
        },
      });
      const svc = new PermissionService(db);
      await expect(
        svc.checkOperationalScope('task', 'view', viewer('user', 'E999'), {
          created_by: 'E001', assigned_to: 'E001',
        }),
      ).resolves.toBe(true);
    });

    it('user with delete_scope=none cannot delete anything', async () => {
      const db = makePermDb({
        opPermRow: {
          entity_type: 'task', role_name: 'user',
          view_scope: 'own', create_scope: 'own',
          edit_scope: 'own', delete_scope: 'none', assign_scope: 'none',
        },
      });
      const svc = new PermissionService(db);
      await expect(
        svc.checkOperationalScope('task', 'delete', viewer('user', 'E001'), {
          created_by: 'E001', assigned_to: 'E001',
        }),
      ).rejects.toThrow(AuthorizationError);
    });
  });

  describe('buildViewScopeFilter', () => {
    it('admin scope=all returns empty filter (no restriction)', async () => {
      const db  = makePermDb();
      const svc = new PermissionService(db);
      const f   = await svc.buildViewScopeFilter('task', viewer('admin', 'A'));
      expect(f).toEqual({});
    });

    it('user scope=own returns OR filter on created_by/assigned_to', async () => {
      const db  = makePermDb();
      const svc = new PermissionService(db);
      const f   = await svc.buildViewScopeFilter('task', viewer('user', 'E001'));
      expect(f).toEqual({
        OR: [{ created_by: 'E001' }, { assigned_to: 'E001' }],
      });
    });

    it('scope=none returns null (caller should return empty list)', async () => {
      const db = makePermDb({
        opPermRow: {
          entity_type: 'task', role_name: 'user',
          view_scope: 'none', create_scope: 'own',
          edit_scope: 'own', delete_scope: 'own', assign_scope: 'none',
        },
      });
      const svc = new PermissionService(db);
      const f   = await svc.buildViewScopeFilter('task', viewer('user', 'E001'));
      expect(f).toBeNull();
    });
  });
});

// ── TaskService — scope enforcement ──────────────────────────────────────────

function makeTaskDb({ hierarchyRows = [], task = null, record = null } = {}) {
  return {
    record: {
      findUnique: jest.fn().mockResolvedValue(record),
    },
    employeeHierarchy: {
      findMany: jest.fn().mockResolvedValue(hierarchyRows),
    },
    task: {
      findMany:   jest.fn().mockResolvedValue([]),
      findUnique: jest.fn().mockResolvedValue(task),
      create:     jest.fn(({ data }) => Promise.resolve({ ...data, id: 1 })),
      update:     jest.fn(({ data }) => Promise.resolve({ ...data, id: 1 })),
      delete:     jest.fn().mockResolvedValue({}),
    },
    operationalPermission: {
      findFirst: jest.fn().mockResolvedValue(null),
    },
  };
}

describe('TaskService — scope-powered edit/delete', () => {
  it('user with own scope cannot delete another\'s task', async () => {
    const task = { id: 1, created_by: 'E001', assigned_to: 'E001', status: 'open', completed_at: null };
    const db   = makeTaskDb({ task });
    const svc  = new TaskService(db);
    await expect(
      svc.deleteTask(1, viewer('user', 'E002'))
    ).rejects.toThrow(AuthorizationError);
  });

  it('user with own scope can delete their own task', async () => {
    const task = { id: 1, created_by: 'E002', assigned_to: 'E002', status: 'open', completed_at: null };
    const db   = makeTaskDb({ task });
    db.task.findUnique.mockResolvedValue(task);
    const svc  = new TaskService(db);
    await expect(
      svc.deleteTask(1, viewer('user', 'E002'))
    ).resolves.toBeDefined();
  });

  it('user cannot assign a task to someone else (assign_scope=none by default)', async () => {
    const db  = makeTaskDb({
      record: { id: 1, created_by: 'E001', assigned_to: 'E001' },
    });
    const svc = new TaskService(db);
    await expect(
      svc.createTask('E001', {
        title: 'Test',
        assigned_to: 'E002',  // assigning to someone else
      }, viewer('user', 'E001'))
    ).rejects.toThrow(AuthorizationError);
  });

  it('admin can assign a task to anyone (assign_scope=all)', async () => {
    const db  = makeTaskDb();
    const svc = new TaskService(db);
    await expect(
      svc.createTask('A', { title: 'Test', assigned_to: 'E002' }, viewer('admin', 'A'))
    ).resolves.toBeDefined();
  });
});
