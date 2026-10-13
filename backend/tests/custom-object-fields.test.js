'use strict';

/**
 * Tests for the hybrid persistence model:
 *
 *   CRM objects  → crm_* relational tables via #upsertCrmEntity
 *   Custom/non-CRM objects → EAV record_field_values table via #upsertCustomFieldValues
 *
 * Also covers canonical FIELD_ALIAS translations (e.g. num_employees → employee_count)
 * so that form field names do not have to match DB column names exactly.
 */

jest.mock('@prisma/client');

const RecordService = require('../src/services/record.service');
const ImportService = require('../src/services/import.service');

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Build a minimal Prisma mock wired for custom-object EAV tests */
function makePrisma(overrides = {}) {
  const base = {
    record: {
      create:     jest.fn().mockResolvedValue({ id: 10, object_id: 99, created_by: 'EMP1', assigned_to: null, created_at: new Date(), updated_at: new Date(), pipeline_stage: null }),
      findUnique: jest.fn().mockResolvedValue({ id: 10, object_id: 99, created_by: 'EMP1', assigned_to: null, created_at: new Date(), updated_at: new Date() }),
      findMany:   jest.fn().mockResolvedValue([]),
      update:     jest.fn().mockResolvedValue({ id: 10, object_id: 99, created_by: 'EMP1', assigned_to: null, created_at: new Date(), updated_at: new Date(), pipeline_stage: null }),
    },
    uiObject: {
      findUnique: jest.fn().mockResolvedValue({ name: 'custom_product' }), // non-CRM object
      findMany:   jest.fn().mockResolvedValue([]),
    },
    recordFieldValue: {
      upsert:     jest.fn().mockResolvedValue({}),
      create:     jest.fn().mockResolvedValue({}),
      findMany:   jest.fn().mockResolvedValue([]),
    },
    crmLead:        { create: jest.fn(), update: jest.fn(), upsert: jest.fn().mockResolvedValue({}), findUnique: jest.fn().mockResolvedValue(null), findMany: jest.fn().mockResolvedValue([]) },
    crmContact:     { create: jest.fn(), update: jest.fn(), upsert: jest.fn().mockResolvedValue({}), findUnique: jest.fn().mockResolvedValue(null), findMany: jest.fn().mockResolvedValue([]) },
    crmAccount:     { create: jest.fn(), update: jest.fn(), upsert: jest.fn().mockResolvedValue({}), findUnique: jest.fn().mockResolvedValue(null), findMany: jest.fn().mockResolvedValue([]) },
    crmOpportunity: { create: jest.fn(), update: jest.fn(), upsert: jest.fn().mockResolvedValue({}), findUnique: jest.fn().mockResolvedValue(null), findMany: jest.fn().mockResolvedValue([]), count: jest.fn().mockResolvedValue(0) },
    crmCase:        { create: jest.fn(), update: jest.fn(), upsert: jest.fn().mockResolvedValue({}), findUnique: jest.fn().mockResolvedValue(null), findMany: jest.fn().mockResolvedValue([]) },
    auditLog:    { create: jest.fn().mockResolvedValue({}) },
    uiField:     { findMany: jest.fn().mockResolvedValue([]) },
    employeeHierarchy: { findMany: jest.fn().mockResolvedValue([]) },
    importJob:   { create: jest.fn(), findUnique: jest.fn(), update: jest.fn(), findMany: jest.fn().mockResolvedValue([]) },
  };
  const merged = { ...base, ...overrides };
  // Handle both array-of-ops form ($transaction([...]) used by EAV upserts)
  // and callback form ($transaction(fn) used by other services).
  merged.$transaction = jest.fn().mockImplementation(opsOrFn =>
    Array.isArray(opsOrFn) ? Promise.all(opsOrFn) : opsOrFn(merged),
  );
  return merged;
}

function adminViewer() {
  return { role: 'super_admin', employee_id: 'EMP1', tenant_id: 1 };
}

// ── RecordService: Custom object EAV persistence ──────────────────────────────

describe('RecordService — custom object field persistence', () => {
  it('createRecord with crmData for a non-CRM object calls recordFieldValue.upsert', async () => {
    const db  = makePrisma();
    // simulate #hydrateCrm: record.findUnique returns record with no CRM entities
    db.record.findUnique
      .mockResolvedValueOnce({ id: 10, object_id: 99, created_by: 'EMP1', assigned_to: null, created_at: new Date(), updated_at: new Date(), pipeline_stage: null }) // create
      .mockResolvedValueOnce({ id: 10, crm_lead: null, crm_contact: null, crm_account: null, crm_opportunity: null, crm_case: null }); // #hydrateCrm findUnique

    db.recordFieldValue.findMany.mockResolvedValueOnce([
      { field_name: 'product_name', str_value: 'Widget Pro' },
      { field_name: 'sku',          str_value: 'WGT-001'     },
    ]);

    const svc = new RecordService(db);
    const result = await svc.createRecord(
      99, null, 'EMP1', null, adminViewer(),
      { product_name: 'Widget Pro', sku: 'WGT-001' },
    );

    // Should have called upsert for each field
    expect(db.recordFieldValue.upsert).toHaveBeenCalledTimes(2);
    const calls = db.recordFieldValue.upsert.mock.calls;
    const fieldNames = calls.map(c => c[0].create.field_name).sort();
    expect(fieldNames).toEqual(['product_name', 'sku']);

    // Returned record should have data hydrated from EAV
    expect(result.data).toEqual({ product_name: 'Widget Pro', sku: 'WGT-001' });
  });

  it('updateRecord with crmData for a non-CRM object calls recordFieldValue.upsert', async () => {
    const existingRecord = { id: 10, object_id: 99, created_by: 'EMP1', assigned_to: null, created_at: new Date(), updated_at: new Date() };
    const db = makePrisma();
    db.record.findUnique
      .mockResolvedValueOnce(existingRecord)         // #assertAccess in updateRecord
      .mockResolvedValueOnce({ ...existingRecord, pipeline_stage: null }) // record.update return
      .mockResolvedValueOnce({ id: 10, crm_lead: null, crm_contact: null, crm_account: null, crm_opportunity: null, crm_case: null }); // #hydrateCrm

    db.record.update.mockResolvedValueOnce({ ...existingRecord, pipeline_stage: null });
    db.recordFieldValue.findMany.mockResolvedValueOnce([
      { field_name: 'product_name', str_value: 'Gadget X' },
    ]);

    const svc = new RecordService(db);
    const result = await svc.updateRecord(10, 'EMP1', adminViewer(), undefined, { product_name: 'Gadget X' });

    expect(db.recordFieldValue.upsert).toHaveBeenCalledTimes(1);
    expect(db.recordFieldValue.upsert.mock.calls[0][0].create.field_name).toBe('product_name');
    expect(result.data).toEqual({ product_name: 'Gadget X' });
  });

  it('getRecords hydrates custom objects from EAV when no CRM entity exists', async () => {
    const anchor = { id: 10, object_id: 99, created_by: 'EMP1', assigned_to: null, created_at: new Date(), updated_at: new Date(), pipeline_stage: null };
    const db = makePrisma();
    db.record.findMany.mockResolvedValueOnce([anchor]);
    // No CRM entities for this record
    db.crmLead.findMany.mockResolvedValueOnce([]);
    db.crmContact.findMany.mockResolvedValueOnce([]);
    db.crmAccount.findMany.mockResolvedValueOnce([]);
    db.crmOpportunity.findMany.mockResolvedValueOnce([]);
    db.crmCase.findMany.mockResolvedValueOnce([]);
    db.recordFieldValue.findMany.mockResolvedValueOnce([
      { record_id: 10, field_name: 'color', str_value: 'blue' },
      { record_id: 10, field_name: 'size',  str_value: 'M'    },
    ]);

    const svc = new RecordService(db);
    const records = await svc.getRecords(99, undefined, adminViewer());
    expect(records).toHaveLength(1);
    expect(records[0].data).toEqual({ color: 'blue', size: 'M' });
  });

  it('getRecord falls back to EAV for custom object (no CRM entity)', async () => {
    const anchor = { id: 10, object_id: 99, created_by: 'EMP1', assigned_to: null, created_at: new Date(), updated_at: new Date(), pipeline_stage: null };
    const db = makePrisma();
    // First findUnique: getRecord itself
    db.record.findUnique
      .mockResolvedValueOnce(anchor)
      // Second findUnique: #hydrateCrm — no CRM entities
      .mockResolvedValueOnce({ id: 10, crm_lead: null, crm_contact: null, crm_account: null, crm_opportunity: null, crm_case: null });
    db.recordFieldValue.findMany.mockResolvedValueOnce([
      { field_name: 'sku', str_value: 'ABC-123' },
    ]);

    const svc = new RecordService(db);
    const result = await svc.getRecord(10, adminViewer());
    expect(result.data).toEqual({ sku: 'ABC-123' });
  });
});

// ── RecordService: CRM object still uses relational tables ────────────────────

describe('RecordService — CRM object uses relational tables, not EAV', () => {
  it('createRecord for a lead writes to crmLead, not recordFieldValue', async () => {
    const db = makePrisma({
      uiObject: { findUnique: jest.fn().mockResolvedValue({ name: 'lead' }), findMany: jest.fn().mockResolvedValue([]) },
    });

    // record.create, then #hydrateCrm findUnique
    db.record.findUnique
      .mockResolvedValueOnce({
        id: 20, crm_lead: { first_name: 'Jane', last_name: 'Doe', email: 'j@doe.com',
          id: 1, record_id: 20, owner_id: null, created_by: null, created_at: new Date(), updated_at: new Date() },
        crm_contact: null, crm_account: null, crm_opportunity: null, crm_case: null,
      });

    db.crmLead.findUnique.mockResolvedValueOnce(null); // retained for any fallback read

    const svc = new RecordService(db);
    await svc.createRecord(
      1, null, 'EMP1', null, adminViewer(),
      { first_name: 'Jane', last_name: 'Doe', email: 'j@doe.com' },
    );

    expect(db.crmLead.upsert).toHaveBeenCalledTimes(1);
    expect(db.recordFieldValue.upsert).not.toHaveBeenCalled();
  });
});

// ── RecordService: FIELD_ALIAS — num_employees → employee_count ───────────────

describe('RecordService — field alias translation for account', () => {
  it('translates num_employees to employee_count before writing to crmAccount', async () => {
    const db = makePrisma({
      uiObject: { findUnique: jest.fn().mockResolvedValue({ name: 'account' }), findMany: jest.fn().mockResolvedValue([]) },
    });
    db.record.findUnique
      .mockResolvedValueOnce({
        id: 30, crm_lead: null, crm_contact: null,
        crm_account: { id: 5, name: 'ACME', employee_count: 50,
          record_id: 30, owner_id: null, created_by: null, created_at: new Date(), updated_at: new Date() },
        crm_opportunity: null, crm_case: null,
      });

    db.crmAccount.findUnique.mockResolvedValueOnce(null); // retained for any fallback read

    const svc = new RecordService(db);
    // Form sends num_employees (legacy field name)
    await svc.createRecord(2, null, 'EMP1', null, adminViewer(), { name: 'ACME Corp', num_employees: 50 });

    expect(db.crmAccount.upsert).toHaveBeenCalledTimes(1);
    const createCall = db.crmAccount.upsert.mock.calls[0][0].create;
    // Alias must have translated num_employees → employee_count
    expect(createCall.employee_count).toBe(50);
    expect(createCall.num_employees).toBeUndefined();
    // Non-existent 'rating' field should be absent (not in allowed set)
    expect(createCall.rating).toBeUndefined();

    // EAV should NOT have been called
    expect(db.recordFieldValue.upsert).not.toHaveBeenCalled();
  });
});

// ── RecordService: case contact_email / contact_name allowed ─────────────────

describe('RecordService — case field mapping', () => {
  it('persists contact_email and contact_name for case records', async () => {
    const db = makePrisma({
      uiObject: { findUnique: jest.fn().mockResolvedValue({ name: 'case' }), findMany: jest.fn().mockResolvedValue([]) },
    });
    db.record.findUnique
      .mockResolvedValueOnce({
        id: 40, crm_lead: null, crm_contact: null, crm_account: null,
        crm_opportunity: null,
        crm_case: { id: 3, subject: 'Issue', contact_email: 'c@test.com', contact_name: 'C Name',
          record_id: 40, owner_id: null, created_by: null, created_at: new Date(), updated_at: new Date() },
      });

    db.crmCase.findUnique.mockResolvedValueOnce(null); // retained for any fallback read

    const svc = new RecordService(db);
    await svc.createRecord(5, null, 'EMP1', null, adminViewer(), {
      subject: 'Issue',
      contact_email: 'c@test.com',
      contact_name:  'C Name',
    });

    expect(db.crmCase.upsert).toHaveBeenCalledTimes(1);
    const createCall = db.crmCase.upsert.mock.calls[0][0].create;
    expect(createCall.contact_email).toBe('c@test.com');
    expect(createCall.contact_name).toBe('C Name');
    // Fields that were removed from CRM_FIELDS.case should not appear
    expect(createCall.internal_comments).toBeUndefined();
    expect(createCall.maturity_stage).toBeUndefined();
    expect(createCall.assigned_to).toBeUndefined();
  });
});

// ── Conversion gating: required-field completeness ──────────────────────────

describe('RecordService — getMissingRequiredFields (conversion gating)', () => {
  // One record.findUnique object serves both the metadata lookup (object/object_id)
  // and #hydrateCrm (crm_lead relation → prospect data).
  function prospectPrisma(crmLead) {
    return makePrisma({
      record: {
        ...makePrisma().record,
        findUnique: jest.fn().mockResolvedValue({
          id: 5, object_id: 2, object: { name: 'prospect' },
          crm_lead: crmLead, crm_lead_intake: null, crm_contact: null, crm_account: null,
          crm_opportunity: null, crm_case: null, product: null, quote: null, email_template: null,
        }),
      },
      recordFieldValue: { ...makePrisma().recordFieldValue, findMany: jest.fn().mockResolvedValue([]) },
      uiField: {
        findMany: jest.fn().mockResolvedValue([
          { name: 'first_name', label: 'First Name', config: null },
          { name: 'last_name',  label: 'Last Name',  config: null },
          { name: 'email',      label: 'Email',      config: null },
        ]),
      },
    });
  }

  it('returns the labels of empty required fields', async () => {
    const db  = prospectPrisma({ id: 1, record_id: 5, first_name: 'Jane', last_name: '', email: 'jane@x.com', lead_status: 'new' });
    const svc = new RecordService(db);
    const missing = await svc.getMissingRequiredFields(5);
    expect(missing).toEqual(['Last Name']);
  });

  it('returns [] when all required fields are filled', async () => {
    const db  = prospectPrisma({ id: 1, record_id: 5, first_name: 'Jane', last_name: 'Doe', email: 'jane@x.com', lead_status: 'new' });
    const svc = new RecordService(db);
    const missing = await svc.getMissingRequiredFields(5);
    expect(missing).toEqual([]);
  });

  it('returns [] when the object has no required fields', async () => {
    const db = prospectPrisma({ id: 1, record_id: 5, first_name: 'Jane', last_name: 'Doe', email: 'jane@x.com' });
    db.uiField.findMany.mockResolvedValue([]);
    const svc = new RecordService(db);
    expect(await svc.getMissingRequiredFields(5)).toEqual([]);
  });
});

// ── ImportService: custom object import persists EAV rows ────────────────────

describe('ImportService — custom object import writes EAV field values', () => {
  function makeImportPrisma() {
    const db = makePrisma();
    db.importJob.findUnique.mockResolvedValue({
      id: 1, object_id: 99, filename: 'products.csv',
      status: 'previewing', field_mapping: { 'Product Name': 'product_name', 'SKU': 'sku' },
      dedupe_keys: [], strategy: 'skip', created_by: 'EMP1', stats: {},
    });
    db.uiObject.findUnique.mockResolvedValue(null); // non-CRM object
    return db;
  }

  it('creates anchor record + EAV rows for each field in a custom object import', async () => {
    const db  = makeImportPrisma();
    const svc = new ImportService(db);

    const csv = Buffer.from('Product Name,SKU\nWidget Pro,WGT-001\nGadget X,GDG-002');
    await svc.executeImport(1, csv);

    // Two records should have been created (one per unique row)
    expect(db.record.create).toHaveBeenCalledTimes(2);

    // EAV rows should have been created for each field per record
    expect(db.recordFieldValue.create).toHaveBeenCalled();
    const eavCalls = db.recordFieldValue.create.mock.calls;
    const fieldNames = eavCalls.map(c => c[0].data.field_name).sort();
    // Each of the 2 records has 2 fields → 4 total EAV create calls
    expect(eavCalls).toHaveLength(4);
    expect(fieldNames).toEqual(['product_name', 'product_name', 'sku', 'sku'].sort());
  });

  it('does NOT call crmLead.create for a custom object import', async () => {
    const db  = makeImportPrisma();
    const svc = new ImportService(db);

    const csv = Buffer.from('Product Name,SKU\nWidget Pro,WGT-001');
    await svc.executeImport(1, csv);

    expect(db.crmLead.create).not.toHaveBeenCalled();
  });
});
