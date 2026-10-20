'use strict';

jest.mock('@prisma/client');

const MetadataService = require('../src/services/metadata.service');
const CacheService = require('../src/services/cache.service');

/**
 * Builder changes must not strand the data or the references that depend on
 * them: a renamed field takes its stored values along (or is refused while a
 * formula / gate still names it), a removed picklist value in use needs a
 * replacement, and an object with records is never deleted.
 */
function makeDb({ fields = [], objects = [{ id: 1, name: 'holding', label: 'Holding', module_id: 9, config: {} }], counts = {} } = {}) {
  const byId = (list, id) => list.find((x) => x.id === id) ?? null;
  return {
    uiObject: {
      findUnique: jest.fn(async ({ where }) => byId(objects, where.id)),
      findFirst: jest.fn(async () => null),
    },
    uiField: {
      findUnique: jest.fn(async ({ where }) => byId(fields, where.id)),
      findFirst: jest.fn(async ({ where }) => fields.find((f) => f.object_id === where.object_id && f.name === where.name && f.id !== where.NOT?.id) ?? null),
      findMany: jest.fn(async ({ where }) => fields.filter((f) => (!where.field_type || f.field_type === where.field_type)
        && (!where.config || f.config?.target_object === where.config.equals))),
      update: jest.fn(async ({ where, data }) => ({ ...byId(fields, where.id), ...data })),
      delete: jest.fn(async () => ({})),
    },
    uiValidation: { findMany: jest.fn(async () => []), deleteMany: jest.fn(), createMany: jest.fn() },
    uiPipeline: { findMany: jest.fn(async () => []) },
    uiWorkflow: { findMany: jest.fn(async () => []) },
    assignmentRule: { findMany: jest.fn(async () => []) },
    uiDashboardWidget: { findMany: jest.fn(async () => []) },
    uiFormFieldLayout: { deleteMany: jest.fn() },
    record: { count: jest.fn(async () => counts.records ?? 0) },
    recordFieldValue: {
      count: jest.fn(async ({ where }) => counts[where.str_value] ?? 0),
      updateMany: jest.fn(async () => ({ count: 1 })),
      deleteMany: jest.fn(async () => ({ count: 0 })),
    },
  };
}

function makeSvc(db) {
  const cache = { del: jest.fn(), delPattern: jest.fn(), key: (...p) => p.join(':') };
  cache.invalidateField = CacheService.prototype.invalidateField.bind(cache);
  cache.invalidateObject = jest.fn();
  return { svc: new MetadataService(db, cache), cache };
}

const status = { id: 5, object_id: 1, name: 'status', label: 'Status', field_type: 'select', options: ['active', 'closed', 'dormant'], config: {} };

describe('Renaming a field', () => {
  it('carries its stored values over to the new name', async () => {
    const db = makeDb({ fields: [status] });
    const { svc } = makeSvc(db);
    await svc.updateField(5, { name: 'holding_status' });
    expect(db.recordFieldValue.updateMany).toHaveBeenCalledWith({
      where: { field_name: 'status', record: { object_id: 1 } },
      data:  { field_name: 'holding_status' },
    });
  });

  it('is refused while a formula still reads it by name', async () => {
    const formula = { id: 6, object_id: 1, name: 'is_live', label: 'Is live', field_type: 'formula', config: { expression: "status = 'active'" } };
    const db = makeDb({ fields: [status, formula] });
    const { svc } = makeSvc(db);
    await expect(svc.updateField(5, { name: 'holding_status' })).rejects.toThrow(/used by formula field "Is live"/);
    expect(db.uiField.update).not.toHaveBeenCalled();
  });

  it('is refused when the new name is unsafe or taken, and a field never moves object', async () => {
    const other = { ...status, id: 7, name: 'state' };
    const { svc } = makeSvc(makeDb({ fields: [status, other] }));
    await expect(svc.updateField(5, { name: 'bad.name' })).rejects.toThrow(/Invalid field name/);
    await expect(svc.updateField(5, { name: 'state' })).rejects.toThrow(/already has a field named/);
    await expect(svc.updateField(5, { object_id: 2 })).rejects.toThrow(/cannot be moved/);
  });
});

describe('Removing a picklist value', () => {
  it('is refused while records hold it and no replacement is given', async () => {
    const db = makeDb({ fields: [status], counts: { dormant: 3 } });
    const { svc } = makeSvc(db);
    await expect(svc.updateField(5, { options: ['active', 'closed'] })).rejects.toThrow(/"dormant" \(3 records\)/);
  });

  it('moves the records onto the chosen replacement', async () => {
    const db = makeDb({ fields: [status], counts: { dormant: 3 } });
    const { svc } = makeSvc(db);
    await svc.updateField(5, { options: ['active', 'closed'], option_replacements: { dormant: 'closed' } });
    expect(db.recordFieldValue.updateMany).toHaveBeenCalledWith({
      where: { field_name: 'status', str_value: 'dormant', record: { object_id: 1 } },
      data:  { str_value: 'closed' },
    });
    expect(db.uiField.update.mock.calls[0][0].data).not.toHaveProperty('option_replacements');
  });

  it('is free when no record uses the value', async () => {
    const db = makeDb({ fields: [status] });
    const { svc } = makeSvc(db);
    await svc.updateField(5, { options: ['active', 'closed'] });
    expect(db.recordFieldValue.updateMany).not.toHaveBeenCalled();
  });
});

describe('Deleting', () => {
  it('a field a stage gate needs is refused', async () => {
    const db = makeDb({ fields: [status] });
    db.uiPipeline.findMany.mockResolvedValue([{ label: 'Sales', stages: [{ label: 'Won', config: { required_fields: ['status'] } }], config: {} }]);
    const { svc } = makeSvc(db);
    await expect(svc.deleteField(5)).rejects.toThrow(/stage "Won" entry rule/);
    expect(db.uiField.delete).not.toHaveBeenCalled();
  });

  it('an object that holds records is refused (they would cascade away)', async () => {
    const db = makeDb({ counts: { records: 12 } });
    const { svc } = makeSvc(db);
    await expect(svc.deleteObject(1)).rejects.toThrow(/holds 12 record/);
  });

  it('an object another object looks up is refused, and so is renaming it', async () => {
    const lookup = { id: 8, object_id: 2, name: 'holding', label: 'Holding', field_type: 'lookup', config: { target_object: 'holding' }, object: { label: 'Valuation' } };
    const db = makeDb({ fields: [lookup] });
    const { svc } = makeSvc(db);
    await expect(svc.deleteObject(1)).rejects.toThrow(/lookup "Holding" on Valuation/);
    await expect(svc.updateObject(1, { name: 'position' })).rejects.toThrow(/lookup "Holding" on Valuation/);
  });
});

describe('Cache', () => {
  it('a field change clears the cached object that embeds the field list', async () => {
    const db = makeDb({ fields: [status] });
    const { svc, cache } = makeSvc(db);
    await svc.updateField(5, { label: 'Holding status' });
    expect(cache.del).toHaveBeenCalledWith('field:5', 'fields:object:1', 'object:1');
  });
});
