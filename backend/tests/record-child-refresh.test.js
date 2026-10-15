'use strict';

jest.mock('@prisma/client');

const RecordService = require('../src/services/record.service');

/**
 * A KYC case decides its party's KYC status (a roll-up on the party), and a
 * loan application reads that status through its `party` lookup. Approving the
 * case must reach the application — its disbursement gate checks the value.
 */
function world() {
  const objects = { 1: 'kyc_case', 2: 'party', 3: 'loan_application' };
  const records = { 10: 1, 20: 2, 30: 3, 31: 3 };
  const rows = [
    { record_id: 10, field_name: 'party', num_value: 20, str_value: '20' },
    { record_id: 10, field_name: 'kyc_outcome', str_value: 'approved' },
    { record_id: 20, field_name: 'kyc_status', str_value: 'in_progress' },
    { record_id: 30, field_name: 'party', num_value: 20, str_value: '20' },
    { record_id: 30, field_name: 'kyc_status', str_value: 'in_progress' },
    { record_id: 31, field_name: 'party', num_value: 99, str_value: '99' },
    { record_id: 31, field_name: 'kyc_status', str_value: 'in_progress' },
  ];
  const fields = [
    { object_id: 1, name: 'party', field_type: 'lookup', data_type: 'number', config: { target_object: 'party' } },
    { object_id: 2, name: 'kyc_status', field_type: 'formula', data_type: 'string', config: { expression: "LOOKUP('kyc_case', 'party', id, 'kyc_outcome')" } },
    { object_id: 3, name: 'party', field_type: 'lookup', data_type: 'number', config: { target_object: 'party' } },
    { object_id: 3, name: 'kyc_status', field_type: 'formula', data_type: 'string', config: { expression: 'party.kyc_status' } },
  ];
  const match = (f, where) => (where.object_id === undefined || f.object_id === where.object_id)
    && (!where.field_type || f.field_type === where.field_type)
    && (!where.config || f.config?.target_object === where.config.equals);
  const rowsWhere = (where) => rows.filter((r) => (where.record_id === undefined || r.record_id === where.record_id)
    && (!where.field_name || r.field_name === where.field_name)
    && (where.num_value === undefined || r.num_value === where.num_value)
    && (where.str_value === undefined || r.str_value === where.str_value)
    && (!where.record || records[r.record_id] === where.record.object_id));
  const db = {
    uiObject: {
      findUnique: async ({ where }) => (objects[where.id] ? { name: objects[where.id] } : null),
      findFirst: async ({ where }) => { const id = Object.keys(objects).find((k) => objects[k] === where.name); return id ? { id: Number(id) } : null; },
    },
    uiField: { findMany: async ({ where }) => fields.filter((f) => match(f, where)) },
    record: {
      findUnique: async ({ where }) => (records[where.id] ? { id: where.id, object_id: records[where.id], tenant_id: 7, deleted_at: null } : null),
      findMany: async ({ where }) => Object.keys(records).filter((id) => records[id] === where.object_id).map((id) => ({ id: Number(id) })),
    },
    recordFieldValue: {
      findMany: async ({ where }) => rowsWhere(where),
      findFirst: async ({ where }) => rowsWhere(where)[0] ?? null,
      findUnique: async ({ where }) => rows.find((r) => r.record_id === where.record_id_field_name.record_id && r.field_name === where.record_id_field_name.field_name) ?? null,
      createMany: async ({ data }) => { rows.push(...data); return { count: data.length }; },
      upsert: async ({ where, create, update }) => {
        const r = rows.find((x) => x.record_id === where.record_id_field_name.record_id && x.field_name === where.record_id_field_name.field_name);
        if (r) { for (const k of ['str_value', 'num_value', 'bool_value', 'date_value', 'json_value']) delete r[k]; Object.assign(r, update); return r; }
        rows.push(create); return create;
      },
    },
  };
  const value = (id, name) => rows.find((r) => r.record_id === id && r.field_name === name)?.str_value;
  return { svc: new RecordService(db), value };
}

describe('RecordService — formulas that read a parent through a lookup', () => {
  it('follow the parent when a grandchild changes it (KYC case → party → loan application)', async () => {
    const { svc, value } = world();
    await svc.recompute(10);
    expect(value(20, 'kyc_status')).toBe('approved');
    expect(value(30, 'kyc_status')).toBe('approved');
    expect(value(31, 'kyc_status')).toBe('in_progress'); // another party's application is untouched
  });
});

describe('RecordService.formulasDependingOn — which parent formulas a child save can change', () => {
  const party = [
    { name: 'kyc_status', config: { expression: "LOOKUP('kyc_case', 'party', id, 'kyc_outcome')" } },
    { name: 'aum_mur', config: { expression: "SUM_RELATED('wealth_mandate', 'party', 'aum_mur')" } },
    { name: 'total_relationship_value', config: { expression: 'COALESCE(aum_mur, 0) + 1' } },
    { name: 'total_usd', config: { expression: 'ROUND(total_relationship_value / 47, 0)' } },
    { name: 'display_name', config: { expression: "CONCAT(first_name, ' ', last_name)" } },
  ];
  it('keeps the roll-ups over the child and everything built on them, in order', () => {
    expect(RecordService.formulasDependingOn(party, 'wealth_mandate').map((f) => f.name)).toEqual(['aum_mur', 'total_relationship_value', 'total_usd']);
    expect(RecordService.formulasDependingOn(party, 'kyc_case').map((f) => f.name)).toEqual(['kyc_status']);
  });
  it('returns nothing when no formula reads the child object', () => {
    expect(RecordService.formulasDependingOn(party, 'party_relationship')).toEqual([]);
  });
});
