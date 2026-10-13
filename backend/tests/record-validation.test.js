'use strict';

/**
 * RecordService enforces field validation on write (ROADMAP P0 #1).
 */

jest.mock('@prisma/client', () => ({
  PrismaClient: class {},
  Prisma: { dmmf: { datamodel: { models: [] } } },
}));

const RecordService = require('../src/services/record.service');
const { ValidationError } = require('../src/utils/errors');

const viewer = { role: 'admin', role_level: 3, employee_id: 'A1', employeeId: 'A1', tenant_id: 7 };

function makePrisma({ fields = [], objectName = 'widget', duplicate = null, existing = null } = {}) {
  return {
    uiField: { findMany: jest.fn().mockResolvedValue(fields) },
    uiObject: { findUnique: jest.fn().mockResolvedValue({ id: 42, name: objectName }) },
    record: {
      create: jest.fn(async ({ data }) => ({ id: 1000, ...data, pipeline_stage: null })),
      update: jest.fn(async ({ where, data }) => ({ id: where.id, object_id: 42, ...data, pipeline_stage: null })),
      findUnique: jest.fn().mockResolvedValue(existing),
    },
    recordFieldValue: {
      upsert: jest.fn().mockResolvedValue({}),
      findMany: jest.fn().mockResolvedValue([]),
      findFirst: jest.fn().mockResolvedValue(duplicate),
    },
    auditLog: { create: jest.fn().mockResolvedValue({}) },
    operationalPermission: { findFirst: jest.fn().mockResolvedValue(null) },
    employeeHierarchy: { findMany: jest.fn().mockResolvedValue([]) },
    leadScore: { findMany: jest.fn().mockResolvedValue([]) },
  };
}

const F = (over) => ({ id: 1, name: 'title', label: 'Title', field_type: 'text', data_type: 'string', is_required: false, is_active: true, is_unique: false, validations: [], config: null, ...over });

describe('RecordService.createRecord validation', () => {
  it('rejects a missing required field before writing anything', async () => {
    const db = makePrisma({ fields: [F({ is_required: true })] });
    const svc = new RecordService(db);
    const err = await svc.createRecord(42, null, 'A1', null, viewer, { title: '' }).catch((e) => e);
    expect(err).toBeInstanceOf(ValidationError);
    expect(err.details).toEqual([{ field: 'title', message: 'Title is required' }]);
    expect(db.record.create).not.toHaveBeenCalled();
  });

  it('applies admin rules and reports every failing field', async () => {
    const db = makePrisma({ fields: [
      F({ id: 1, name: 'email', label: 'Email', field_type: 'email' }),
      F({ id: 2, name: 'qty', label: 'Qty', field_type: 'number', data_type: 'number',
          validations: [{ validation_type: 'min', value: '1', error_message: 'At least one', order_index: 0 }] }),
    ] });
    const svc = new RecordService(db);
    const err = await svc.createRecord(42, null, 'A1', null, viewer, { email: 'bad', qty: 0 }).catch((e) => e);
    expect(err.message).toBe('2 fields need attention');
    expect(err.details.map((d) => d.field).sort()).toEqual(['email', 'qty']);
  });

  it('writes when everything passes', async () => {
    const db = makePrisma({ fields: [F({ is_required: true })] });
    const svc = new RecordService(db);
    const rec = await svc.createRecord(42, null, 'A1', null, viewer, { title: 'ok' });
    expect(rec.id).toBe(1000);
    expect(db.record.create).toHaveBeenCalled();
  });

  it('a draft defers absent required fields but still validates what is sent', async () => {
    const fields = [
      F({ id: 1, name: 'title', is_required: true }),
      F({ id: 2, name: 'email', label: 'Email', field_type: 'email', is_required: true }),
    ];
    const ok = await new RecordService(makePrisma({ fields }))
      .createRecord(42, null, 'A1', null, viewer, { title: 'Draft' }, { draft: true });
    expect(ok.id).toBe(1000);

    const err = await new RecordService(makePrisma({ fields }))
      .createRecord(42, null, 'A1', null, viewer, { email: 'bad' }, { draft: true }).catch((e) => e);
    expect(err).toBeInstanceOf(ValidationError);
    expect(err.details.map((d) => d.field)).toEqual(['email']);
  });

  it('exempts auto-number and computed fields from the required check', async () => {
    const db = makePrisma({ fields: [
      F({ id: 1, name: 'ref', field_type: 'auto_number', is_required: true }),
      F({ id: 2, name: 'total', field_type: 'number', is_required: true, config: { computed: { fn: 'a+b' } } }),
    ] });
    const svc = new RecordService(db);
    await expect(svc.createRecord(42, null, 'A1', null, viewer, {})).resolves.toBeTruthy();
  });

  it('exempts a required text field carrying an auto_number config (filled after validation)', async () => {
    const db = makePrisma({ fields: [
      F({ name: 'declaration_number', is_required: true, config: { auto_number: { prefix: 'DCL-' } } }),
    ] });
    const svc = new RecordService(db);
    await expect(svc.createRecord(42, null, 'A1', null, viewer, { notes: 'x' })).resolves.toBeTruthy();
  });

  it('enforces uniqueness against the field-value store', async () => {
    const db = makePrisma({
      fields: [F({ name: 'code', label: 'Code', is_unique: true })],
      duplicate: { id: 9 },
    });
    const svc = new RecordService(db);
    const err = await svc.createRecord(42, null, 'A1', null, viewer, { code: 'X1' }).catch((e) => e);
    expect(err.details[0].message).toMatch(/must be unique/);
    const where = db.recordFieldValue.findFirst.mock.calls[0][0].where;
    expect(where).toMatchObject({ field_name: 'code', record: { object_id: 42, deleted_at: null } });
  });

  it('skips validation gracefully when the field catalogue cannot be loaded', async () => {
    const db = makePrisma();
    db.uiField.findMany.mockRejectedValueOnce(new Error('db down'));
    const svc = new RecordService(db);
    await expect(svc.createRecord(42, null, 'A1', null, viewer, { title: '' })).resolves.toBeTruthy();
  });
});

describe('RecordService.updateRecord validation', () => {
  const existing = { id: 5, object_id: 42, tenant_id: 7, assigned_to: 'A1', created_by: 'A1', deleted_at: null };

  it('validates only the submitted fields', async () => {
    const db = makePrisma({ existing, fields: [F({ id: 1, name: 'title', is_required: true }), F({ id: 2, name: 'note', label: 'Note', validations: [{ validation_type: 'maxLength', value: '3', error_message: 'Too long' }] })] });
    const svc = new RecordService(db);
    // title (required) not sent → fine; note too long → rejected
    const err = await svc.updateRecord(5, 'A1', viewer, undefined, { note: 'abcd' }).catch((e) => e);
    expect(err.details).toEqual([{ field: 'note', message: 'Too long' }]);
    await expect(svc.updateRecord(5, 'A1', viewer, undefined, { note: 'ab' })).resolves.toBeTruthy();
  });

  it('excludes the record itself from the uniqueness check', async () => {
    const db = makePrisma({ existing, fields: [F({ name: 'code', is_unique: true })] });
    const svc = new RecordService(db);
    await svc.updateRecord(5, 'A1', viewer, undefined, { code: 'X1' });
    expect(db.recordFieldValue.findFirst.mock.calls[0][0].where.record_id).toEqual({ not: 5 });
  });
});
