'use strict';

/**
 * Record and activity service — authorization tests.
 * Covers:
 *   - ActivityService: getActivities, create/update/delete ownership
 *   - RecordService.getRecord: ownership/scope enforcement
 *     (used by the POST /records/:id/assign route to gate re-assignment)
 */

const ActivityService = require('../src/services/activity.service');
const RecordService   = require('../src/services/record.service');
const { NotFoundError, AuthorizationError } = require('../src/utils/errors');

// ── Helpers ──────────────────────────────────────────────────────────────────

function makePrisma({ record = null, hierarchyRows = [], activities = [] } = {}) {
  return {
    record: {
      findUnique: jest.fn().mockResolvedValue(record),
    },
    employeeHierarchy: {
      findMany: jest.fn().mockResolvedValue(hierarchyRows),
    },
    activity: {
      findMany:   jest.fn().mockResolvedValue(activities),
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

describe('ActivityService.getActivities', () => {
  it('admin sees activities without record ownership check', async () => {
    const db = makePrisma({ record: { id: 5, created_by: 'E001', assigned_to: null } });
    const svc = new ActivityService(db);
    await expect(svc.getActivities(5, viewer('admin', 'X'))).resolves.toBeDefined();
    expect(db.record.findUnique).not.toHaveBeenCalled();
  });

  it('record owner (user) can fetch activities', async () => {
    const db = makePrisma({ record: { id: 5, created_by: 'E001', assigned_to: null } });
    const svc = new ActivityService(db);
    await expect(svc.getActivities(5, viewer('user', 'E001'))).resolves.toBeDefined();
  });

  it('assigned user can fetch activities', async () => {
    const db = makePrisma({ record: { id: 5, created_by: 'E001', assigned_to: 'E002' } });
    const svc = new ActivityService(db);
    await expect(svc.getActivities(5, viewer('user', 'E002'))).resolves.toBeDefined();
  });

  it('unrelated user is denied (NotFoundError — no leaking record existence)', async () => {
    const db = makePrisma({ record: { id: 5, created_by: 'E001', assigned_to: null } });
    const svc = new ActivityService(db);
    await expect(svc.getActivities(5, viewer('user', 'E999'))).rejects.toThrow(NotFoundError);
  });

  it('throws when record is not found', async () => {
    const db = makePrisma({ record: null });
    const svc = new ActivityService(db);
    await expect(svc.getActivities(99, viewer('user', 'E001'))).rejects.toThrow(NotFoundError);
  });
});

describe('ActivityService write authorization', () => {
  it('activity author can update their own activity', async () => {
    const activity = { id: 1, employee_id: 'E001', record_id: 5 };
    const db = makePrisma();
    db.activity.findUnique.mockResolvedValue(activity);
    db.activity.update.mockResolvedValue(activity);
    const svc = new ActivityService(db);
    await expect(
      svc.updateActivity(1, { subject: 'Hello' }, viewer('user', 'E001'))
    ).resolves.toBeDefined();
  });

  it('different user cannot update someone else\'s activity', async () => {
    const activity = { id: 1, employee_id: 'E001', record_id: 5 };
    const db = makePrisma();
    db.activity.findUnique.mockResolvedValue(activity);
    const svc = new ActivityService(db);
    await expect(
      svc.updateActivity(1, {}, viewer('user', 'E999'))
    ).rejects.toThrow(AuthorizationError);
  });

  it('manager in hierarchy of activity owner can update the activity', async () => {
    const activity = { id: 1, employee_id: 'E001', record_id: 5 };
    // Manager E002 has E001 as a descendant (depth=any)
    const db = makePrisma({ hierarchyRows: [{ descendant_id: 'E001' }, { descendant_id: 'E002' }] });
    db.activity.findUnique.mockResolvedValue(activity);
    db.activity.update.mockResolvedValue(activity);
    const svc = new ActivityService(db);
    await expect(
      svc.updateActivity(1, {}, viewer('manager', 'E002'))
    ).resolves.toBeDefined();
  });

  it('manager NOT in hierarchy of activity owner is denied', async () => {
    const activity = { id: 1, employee_id: 'E001', record_id: 5 };
    // Manager E002 hierarchy does NOT contain E001
    const db = makePrisma({ hierarchyRows: [{ descendant_id: 'E002' }] });
    db.activity.findUnique.mockResolvedValue(activity);
    const svc = new ActivityService(db);
    await expect(
      svc.updateActivity(1, {}, viewer('manager', 'E002'))
    ).rejects.toThrow(AuthorizationError);
  });

  it('user cannot delete another\'s activity', async () => {
    const activity = { id: 1, employee_id: 'E001', record_id: 5 };
    const db = makePrisma();
    db.activity.findUnique.mockResolvedValue(activity);
    const svc = new ActivityService(db);
    await expect(
      svc.deleteActivity(1, viewer('user', 'E999'))
    ).rejects.toThrow(AuthorizationError);
  });
});

// ── RecordService.getRecord — access enforcement (used by assign endpoint) ───
//
// The POST /records/:id/assign route calls recSvc.getRecord(id, req.user) to
// enforce record visibility before triggering assignment.  These tests validate
// that unauthorized callers are blocked with a NotFoundError (avoids leaking
// whether the record exists).

function makeRecordPrisma({ record = null, hierarchyRows = [] } = {}) {
  // #hydrateCrm calls findUnique twice: once in getRecord, once inside #hydrateCrm.
  // Return the same record object for both calls.
  const findUniqueMock = jest.fn().mockResolvedValue(record
    ? { ...record, crm_lead: null, crm_contact: null, crm_account: null, crm_opportunity: null, crm_case: null }
    : null
  );
  return {
    record: {
      findUnique: findUniqueMock,
    },
    employeeHierarchy: {
      findMany: jest.fn().mockResolvedValue(hierarchyRows),
    },
    auditLog: {
      create: jest.fn().mockResolvedValue({}),
    },
    recordFieldValue: {
      findMany: jest.fn().mockResolvedValue([]),
    },
  };
}

describe('RecordService.getRecord — access enforcement for re-assignment', () => {
  const ownRecord      = { id: 10, object_id: 1, created_by: 'E001', assigned_to: null,
                           data: {}, pipeline_stage: null };
  const assignedRecord = { id: 11, object_id: 1, created_by: 'E002', assigned_to: 'E001',
                           data: {}, pipeline_stage: null };
  const otherRecord    = { id: 12, object_id: 1, created_by: 'E002', assigned_to: null,
                           data: {}, pipeline_stage: null };

  it('admin can access any record', async () => {
    const db = makeRecordPrisma({ record: otherRecord });
    const svc = new RecordService(db);
    await expect(svc.getRecord(12, viewer('admin', 'ADMIN'))).resolves.toBeDefined();
  });

  it('record owner (user) can access their own record', async () => {
    const db = makeRecordPrisma({ record: ownRecord });
    const svc = new RecordService(db);
    await expect(svc.getRecord(10, viewer('user', 'E001'))).resolves.toBeDefined();
  });

  it('assigned user can access a record assigned to them', async () => {
    const db = makeRecordPrisma({ record: assignedRecord });
    const svc = new RecordService(db);
    await expect(svc.getRecord(11, viewer('user', 'E001'))).resolves.toBeDefined();
  });

  it('unrelated user is denied — NotFoundError prevents record-existence leaking', async () => {
    const db = makeRecordPrisma({ record: otherRecord });
    const svc = new RecordService(db);
    await expect(svc.getRecord(12, viewer('user', 'E999'))).rejects.toThrow(NotFoundError);
  });

  it('manager within hierarchy can access a report\'s record', async () => {
    const db = makeRecordPrisma({
      record:        ownRecord, // created_by: 'E001'
      hierarchyRows: [{ descendant_id: 'E001' }, { descendant_id: 'MGR1' }],
    });
    const svc = new RecordService(db);
    await expect(svc.getRecord(10, viewer('manager', 'MGR1'))).resolves.toBeDefined();
  });

  it('manager outside hierarchy is denied', async () => {
    const db = makeRecordPrisma({
      record:        ownRecord, // created_by: 'E001'
      hierarchyRows: [{ descendant_id: 'MGR1' }], // E001 NOT in hierarchy
    });
    const svc = new RecordService(db);
    await expect(svc.getRecord(10, viewer('manager', 'MGR1'))).rejects.toThrow(NotFoundError);
  });

  it('returns NotFoundError when record does not exist', async () => {
    const db = makeRecordPrisma({ record: null });
    const svc = new RecordService(db);
    await expect(svc.getRecord(999, viewer('user', 'E001'))).rejects.toThrow(NotFoundError);
  });
});
