'use strict';

/**
 * Task service — authorization tests.
 * Covers: getTasks param mapping, read record visibility, write ownership.
 * All DB calls are mocked.
 */

const TaskService     = require('../src/services/task.service');
const { NotFoundError, AuthorizationError } = require('../src/utils/errors');

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeRecord(overrides = {}) {
  return { id: 10, created_by: 'E001', assigned_to: null, ...overrides };
}

function makePrisma({ record = makeRecord(), hierarchyRows = [], tasks = [] } = {}) {
  return {
    record: {
      findUnique: jest.fn().mockResolvedValue(record),
    },
    employeeHierarchy: {
      findMany: jest.fn().mockResolvedValue(hierarchyRows),
    },
    task: {
      findMany:  jest.fn().mockResolvedValue(tasks),
      findUnique: jest.fn(),
      create:     jest.fn(),
      update:     jest.fn(),
      delete:     jest.fn(),
    },
    // Required by PermissionService (returns null → default scopes apply)
    operationalPermission: {
      findFirst: jest.fn().mockResolvedValue(null),
    },
  };
}

function viewer(role, id) {
  return { role, employee_id: id, employeeId: id };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('TaskService.getTasks', () => {
  describe('record visibility', () => {
    it('admin bypasses record ownership check', async () => {
      const db = makePrisma();
      const svc = new TaskService(db);
      await expect(
        svc.getTasks({ recordId: 10 }, viewer('admin', 'E999'))
      ).resolves.toBeDefined();
      // findUnique on record should NOT have been called for admin
      expect(db.record.findUnique).not.toHaveBeenCalled();
    });

    it('user who owns the record can list tasks', async () => {
      const db = makePrisma({ record: makeRecord({ created_by: 'E001' }) });
      const svc = new TaskService(db);
      await expect(
        svc.getTasks({ recordId: 10 }, viewer('user', 'E001'))
      ).resolves.toBeDefined();
    });

    it('user who does NOT own the record is denied', async () => {
      const db = makePrisma({ record: makeRecord({ created_by: 'E001', assigned_to: null }) });
      const svc = new TaskService(db);
      await expect(
        svc.getTasks({ recordId: 10 }, viewer('user', 'E999'))
      ).rejects.toThrow(NotFoundError);
    });

    it('throws when record does not exist', async () => {
      const db = makePrisma({ record: null });
      const svc = new TaskService(db);
      await expect(
        svc.getTasks({ recordId: 99 }, viewer('user', 'E001'))
      ).rejects.toThrow(NotFoundError);
    });

    it('manager with employee in hierarchy can list tasks', async () => {
      // manager E002 has E001 as a descendant
      const db = makePrisma({
        record:         makeRecord({ created_by: 'E001' }),
        hierarchyRows:  [{ descendant_id: 'E001' }, { descendant_id: 'E002' }],
      });
      const svc = new TaskService(db);
      await expect(
        svc.getTasks({ recordId: 10 }, viewer('manager', 'E002'))
      ).resolves.toBeDefined();
    });

    it('manager WITHOUT employee in hierarchy is denied', async () => {
      const db = makePrisma({
        record:        makeRecord({ created_by: 'E001' }),
        hierarchyRows: [{ descendant_id: 'E002' }], // E001 not in list
      });
      const svc = new TaskService(db);
      await expect(
        svc.getTasks({ recordId: 10 }, viewer('manager', 'E002'))
      ).rejects.toThrow(NotFoundError);
    });
  });

  describe('filter mapping', () => {
    it('filters by recordId when provided', async () => {
      const db = makePrisma({ record: makeRecord({ created_by: 'E001' }) });
      const svc = new TaskService(db);
      await svc.getTasks({ recordId: 10 }, viewer('admin', 'A'));
      const call = db.task.findMany.mock.calls[0][0];
      expect(call.where.record_id).toBe(10);
    });

    it('filters by employeeId (assigned_to) when provided', async () => {
      const db = makePrisma();
      const svc = new TaskService(db);
      await svc.getTasks({ employeeId: 'E005' }, viewer('admin', 'A'));
      const call = db.task.findMany.mock.calls[0][0];
      expect(call.where.assigned_to).toBe('E005');
    });
  });
});

describe('TaskService write authorization', () => {
  it('user can update their own task', async () => {
    const task = { id: 1, created_by: 'E001', assigned_to: 'E001', status: 'open', completed_at: null };
    const db = makePrisma();
    db.task.findUnique.mockResolvedValue(task);
    db.task.update.mockResolvedValue({ ...task, title: 'Updated' });
    const svc = new TaskService(db);
    await expect(
      svc.updateTask(1, { title: 'Updated' }, viewer('user', 'E001'))
    ).resolves.toBeDefined();
  });

  it('user cannot update another user\'s task', async () => {
    const task = { id: 1, created_by: 'E001', assigned_to: 'E001', status: 'open', completed_at: null };
    const db = makePrisma();
    db.task.findUnique.mockResolvedValue(task);
    const svc = new TaskService(db);
    await expect(
      svc.updateTask(1, { title: 'Hack' }, viewer('user', 'E999'))
    ).rejects.toThrow(AuthorizationError);
  });

  it('admin can update any task', async () => {
    const task = { id: 1, created_by: 'E001', assigned_to: 'E001', status: 'open', completed_at: null };
    const db = makePrisma();
    db.task.findUnique.mockResolvedValue(task);
    db.task.update.mockResolvedValue(task);
    const svc = new TaskService(db);
    await expect(
      svc.updateTask(1, {}, viewer('admin', 'A'))
    ).resolves.toBeDefined();
  });
});
