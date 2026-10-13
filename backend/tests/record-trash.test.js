'use strict';

jest.mock('@prisma/client');

const RecordService = require('../src/services/record.service');
const { NotFoundError, ValidationError } = require('../src/utils/errors');

function makePrisma() {
  return {
    record: {
      findUnique: jest.fn(),
      findMany:   jest.fn().mockResolvedValue([]),
      update:     jest.fn().mockResolvedValue({}),
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      delete:     jest.fn().mockResolvedValue({}),
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      count:      jest.fn().mockResolvedValue(0),
    },
    uiObject:          { findUnique: jest.fn().mockResolvedValue({ name: 'lead' }) },
    // Delete mode is resolved from the object's pipeline config. null → 'soft'.
    uiPipeline:        { findFirst: jest.fn().mockResolvedValue(null) },
    employeeHierarchy: { findMany: jest.fn().mockResolvedValue([]) },
    auditLog:          { create: jest.fn().mockResolvedValue({}), createMany: jest.fn().mockResolvedValue({ count: 0 }) },
  };
}

// viewer=null → owner filter is empty and access checks no-op (admin-equivalent
// for the delete path), letting us isolate the soft/hard delete behaviour.
function makeSvc() {
  const prisma = makePrisma();
  return { svc: new RecordService(prisma), prisma };
}

// ── User-facing queries hide trashed records ────────────────────────────────

describe('RecordService.getRecords — trash filtering', () => {
  it('excludes soft-deleted records via deleted_at: null', async () => {
    const { svc, prisma } = makeSvc();
    await svc.getRecords(2, null, null);
    expect(prisma.record.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ object_id: 2, deleted_at: null }) }),
    );
  });
});

// ── deleteRecord: soft vs hard ──────────────────────────────────────────────

describe('RecordService.deleteRecord', () => {
  it('soft delete (default) sets deleted_at/deleted_by and keeps the row', async () => {
    const { svc, prisma } = makeSvc();
    prisma.record.findUnique.mockResolvedValue({ id: 1, object_id: 2, tenant_id: 1, deleted_at: null });

    await svc.deleteRecord(1, 'EMP-1', null);

    expect(prisma.record.delete).not.toHaveBeenCalled();
    const arg = prisma.record.update.mock.calls[0][0];
    expect(arg.where).toEqual({ id: 1 });
    expect(arg.data.deleted_by).toBe('EMP-1');
    expect(arg.data.deleted_at).toBeInstanceOf(Date);
    // Audited with actor + mode
    const audit = prisma.auditLog.create.mock.calls[0][0];
    expect(audit.data.employee_id).toBe('EMP-1');
    expect(audit.data.action).toBe('delete');
    expect(audit.data.changes.mode).toBe('soft');
  });

  it('hard delete removes the row and never soft-updates', async () => {
    const { svc, prisma } = makeSvc();
    prisma.record.findUnique.mockResolvedValue({ id: 1, object_id: 2, tenant_id: 1, deleted_at: null });

    await svc.deleteRecord(1, 'EMP-1', null, { mode: 'hard' });

    expect(prisma.record.delete).toHaveBeenCalledWith({ where: { id: 1 } });
    expect(prisma.record.update).not.toHaveBeenCalled();
  });

  it("resolves 'hard' from the object's pipeline config when no mode is passed", async () => {
    const { svc, prisma } = makeSvc();
    prisma.record.findUnique.mockResolvedValue({ id: 1, object_id: 2, tenant_id: 1, deleted_at: null });
    prisma.uiPipeline.findFirst.mockResolvedValue({ config: { delete_mode: 'hard' } });

    await svc.deleteRecord(1, 'EMP-1', null);

    expect(prisma.record.delete).toHaveBeenCalledWith({ where: { id: 1 } });
    expect(prisma.record.update).not.toHaveBeenCalled();
  });

  it('treats an already-trashed record as not found', async () => {
    const { svc, prisma } = makeSvc();
    prisma.record.findUnique.mockResolvedValue({ id: 1, object_id: 2, deleted_at: new Date() });
    await expect(svc.deleteRecord(1, 'EMP-1', null)).rejects.toThrow(NotFoundError);
  });
});

// ── bulkDelete: soft vs hard ────────────────────────────────────────────────

describe('RecordService.bulkDelete', () => {
  it('soft bulk delete uses updateMany', async () => {
    const { svc, prisma } = makeSvc();
    prisma.record.findMany.mockResolvedValue([{ id: 1, object_id: 2 }, { id: 2, object_id: 2 }]);

    const res = await svc.bulkDelete([1, 2], 'EMP-1', null);

    expect(prisma.record.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: { in: [1, 2] } }, data: expect.objectContaining({ deleted_by: 'EMP-1' }) }),
    );
    expect(prisma.record.deleteMany).not.toHaveBeenCalled();
    expect(res).toEqual({ deleted: 2 });
    // Every record in the bulk op is audited (one createMany)
    expect(prisma.auditLog.createMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.arrayContaining([
        expect.objectContaining({ record_id: 1, action: 'delete' }),
        expect.objectContaining({ record_id: 2, action: 'delete' }),
      ]) }),
    );
  });

  it('hard bulk delete uses deleteMany', async () => {
    const { svc, prisma } = makeSvc();
    prisma.record.findMany.mockResolvedValue([{ id: 1, object_id: 2 }]);

    await svc.bulkDelete([1], 'EMP-1', null, { mode: 'hard' });

    expect(prisma.record.deleteMany).toHaveBeenCalledWith({ where: { id: { in: [1] } } });
    expect(prisma.record.updateMany).not.toHaveBeenCalled();
  });
});

// ── Admin trash: list / restore / purge ─────────────────────────────────────

describe('RecordService trash recovery', () => {
  it('getTrashedRecords lists only soft-deleted rows', async () => {
    const { svc, prisma } = makeSvc();
    await svc.getTrashedRecords({});
    expect(prisma.record.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { deleted_at: { not: null } } }),
    );
  });

  it('getTrashedRecords can filter by object', async () => {
    const { svc, prisma } = makeSvc();
    await svc.getTrashedRecords({ objectId: 5 });
    expect(prisma.record.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { deleted_at: { not: null }, object_id: 5 } }),
    );
  });

  it('restoreRecord clears deleted_at/deleted_by', async () => {
    const { svc, prisma } = makeSvc();
    prisma.record.findUnique.mockResolvedValue({ id: 1, object_id: 2, deleted_at: new Date() });
    prisma.record.update.mockResolvedValue({ id: 1, object_id: 2, deleted_at: null });

    await svc.restoreRecord(1, 'EMP-1');

    expect(prisma.record.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 1 }, data: { deleted_at: null, deleted_by: null } }),
    );
    expect(prisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ action: 'restore', employee_id: 'EMP-1' }) }),
    );
  });

  it('restoreRecord refuses a record that is not in the Trash', async () => {
    const { svc, prisma } = makeSvc();
    prisma.record.findUnique.mockResolvedValue({ id: 1, deleted_at: null });
    await expect(svc.restoreRecord(1)).rejects.toThrow(ValidationError);
  });

  it('purgeRecord permanently deletes a trashed record', async () => {
    const { svc, prisma } = makeSvc();
    prisma.record.findUnique.mockResolvedValue({ id: 1, deleted_at: new Date() });

    const res = await svc.purgeRecord(1, 'EMP-9');

    expect(prisma.record.delete).toHaveBeenCalledWith({ where: { id: 1 } });
    expect(res).toEqual({ id: 1, purged: true });
    // Audited BEFORE deletion, record id preserved in changes for traceability
    expect(prisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ action: 'purge', employee_id: 'EMP-9', changes: expect.objectContaining({ record_id: 1 }) }) }),
    );
  });

  it('purgeRecord refuses a live record (must be trashed first)', async () => {
    const { svc, prisma } = makeSvc();
    prisma.record.findUnique.mockResolvedValue({ id: 1, deleted_at: null });
    await expect(svc.purgeRecord(1)).rejects.toThrow(ValidationError);
    expect(prisma.record.delete).not.toHaveBeenCalled();
  });
});
