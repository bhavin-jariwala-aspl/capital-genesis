'use strict';

/**
 * MetadataService — field creation normalisation tests.
 * Verifies that UI-only extras (col_span, position, is_readonly) are correctly
 * stripped or mapped before being written to the UiField table.
 */

const MetadataService = require('../src/services/metadata.service');

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Build a minimal mock Prisma that captures the data passed to uiField.create */
function makePrisma() {
  const created = [];
  const validationRows = [];
  return {
    _created: created,
    _validationRows: validationRows,
    uiField: {
      create: jest.fn(async ({ data }) => {
        created.push(data);
        return { id: 1, ...data };
      }),
      findUnique: jest.fn(async ({ where }) => ({ id: where.id, ...created[0], validations: validationRows })),
    },
    uiValidation: {
      createMany: jest.fn(async ({ data }) => { validationRows.push(...data); return { count: data.length }; }),
    },
    cache: null, // MetadataService checks this.cache
  };
}

/** Minimal CacheService stub */
function makeCache() {
  return { invalidateField: jest.fn().mockResolvedValue(undefined) };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('MetadataService.createField — normalisation', () => {
  let svc;
  let db;

  beforeEach(() => {
    db  = makePrisma();
    svc = new MetadataService(db, makeCache());
  });

  it('maps position to order_index', async () => {
    await svc.createField({ object_id: 1, name: 'city', label: 'City', field_type: 'text', position: 3 });
    const data = db._created[0];
    expect(data.order_index).toBe(3);
    expect(data.position).toBeUndefined();
  });

  it('strips col_span (belongs to UiFormFieldLayout, not UiField)', async () => {
    await svc.createField({ object_id: 1, name: 'city', label: 'City', field_type: 'text', col_span: 2 });
    const data = db._created[0];
    expect(data.col_span).toBeUndefined();
  });

  it('maps is_readonly=true to config.always_disabled', async () => {
    await svc.createField({ object_id: 1, name: 'ref', label: 'Ref', field_type: 'text', is_readonly: true });
    const data = db._created[0];
    expect(data.config?.always_disabled).toBe(true);
    expect(data.is_readonly).toBeUndefined();
  });

  it('maps is_readonly=false to config.always_disabled=false', async () => {
    await svc.createField({ object_id: 1, name: 'ref', label: 'Ref', field_type: 'text', is_readonly: false });
    const data = db._created[0];
    expect(data.config?.always_disabled).toBe(false);
  });

  it('merges is_readonly into existing config object', async () => {
    await svc.createField({
      object_id: 1, name: 'score', label: 'Score', field_type: 'number',
      config: { min: 0, max: 100 },
      is_readonly: true,
    });
    const data = db._created[0];
    expect(data.config.always_disabled).toBe(true);
    expect(data.config.min).toBe(0);
    expect(data.config.max).toBe(100);
  });

  it('derives data_type=number for field_type=currency', async () => {
    await svc.createField({ object_id: 1, name: 'amount', label: 'Amount', field_type: 'currency' });
    const data = db._created[0];
    expect(data.data_type).toBe('number');
  });

  it('derives data_type=boolean for field_type=checkbox', async () => {
    await svc.createField({ object_id: 1, name: 'active', label: 'Active', field_type: 'checkbox' });
    const data = db._created[0];
    expect(data.data_type).toBe('boolean');
  });

  it('preserves explicitly supplied data_type', async () => {
    await svc.createField({ object_id: 1, name: 'custom', label: 'Custom', field_type: 'text', data_type: 'object' });
    const data = db._created[0];
    expect(data.data_type).toBe('object');
  });

  // ── Regression: inline validations must be written as a SEPARATE top-level
  //    createMany (not nested under uiField.create) so the tenant-scope Prisma
  //    extension injects the required UiValidation.tenant_id. Nesting → 500.
  it('writes inline validations via a separate top-level uiValidation.createMany with field_id', async () => {
    const result = await svc.createField({
      object_id: 1, name: 'email', label: 'Email', field_type: 'text',
      validations: [{ rule_type: 'regex', config: { pattern: '.+@.+' }, message: 'Bad email' }],
    });
    // Not nested under the field create()
    expect(db._created[0].validations).toBeUndefined();
    // Written separately with field_id linking back to the created field
    expect(db.uiValidation.createMany).toHaveBeenCalledTimes(1);
    expect(db._validationRows[0]).toMatchObject({ rule_type: 'regex', field_id: 1 });
    expect(result.validations).toHaveLength(1);
  });

  it('returns an empty validations array when none are supplied', async () => {
    const result = await svc.createField({ object_id: 1, name: 'plain', label: 'Plain', field_type: 'text' });
    expect(db.uiValidation.createMany).not.toHaveBeenCalled();
    expect(result.validations).toEqual([]);
  });

  // ── Regression: field name is a SQL identifier interpolated into DDL — reject
  //    anything outside the safe grammar to prevent injection into ALTER TABLE.
  it('rejects a field name that is not a safe SQL identifier', async () => {
    await expect(
      svc.createField({ object_id: 1, name: 'x`; DROP TABLE records;--', label: 'Evil', field_type: 'text' }),
    ).rejects.toThrow(/Invalid field name/);
    expect(db.uiField.create).not.toHaveBeenCalled();
  });
});

// ── updateField — validation rules are replaced, not dropped ─────────────────

describe('MetadataService.updateField — validations', () => {
  function makeUpdatePrisma() {
    const validationRows = [{ id: 1, field_id: 7, validation_type: 'min', value: '1', error_message: 'old' }];
    return {
      _validationRows: validationRows,
      uiField: {
        findUnique: jest.fn(async () => ({ id: 7, object_id: 3, name: 'qty', label: 'Qty', is_indexed: false, config: {}, validations: validationRows })),
        update:     jest.fn(async ({ data }) => ({ id: 7, object_id: 3, ...data })),
      },
      uiValidation: {
        deleteMany: jest.fn(async () => { validationRows.length = 0; return { count: 1 }; }),
        createMany: jest.fn(async ({ data }) => { validationRows.push(...data); return { count: data.length }; }),
      },
    };
  }

  it('replaces the rule set when a list is sent (the builder used to lose edits here)', async () => {
    const db = makeUpdatePrisma();
    const svc = new MetadataService(db, makeCache());
    await svc.updateField(7, {
      label: 'Qty',
      validations: [
        { validation_type: 'max', value: 10, error_message: 'Too many' },
        { validation_type: 'required', value: '', error_message: '' },
      ],
    });
    expect(db.uiValidation.deleteMany).toHaveBeenCalledWith({ where: { field_id: 7 } });
    expect(db._validationRows).toEqual([
      { field_id: 7, validation_type: 'max', value: '10', error_message: 'Too many', order_index: 0 },
      { field_id: 7, validation_type: 'required', value: null, error_message: 'Qty is invalid', order_index: 1 },
    ]);
  });

  it('clears all rules when an empty list is sent, and leaves them alone when omitted', async () => {
    const db = makeUpdatePrisma();
    const svc = new MetadataService(db, makeCache());
    await svc.updateField(7, { label: 'Qty' });
    expect(db.uiValidation.deleteMany).not.toHaveBeenCalled();
    await svc.updateField(7, { label: 'Qty', validations: [] });
    expect(db.uiValidation.deleteMany).toHaveBeenCalled();
    expect(db.uiValidation.createMany).not.toHaveBeenCalled();
  });
});
