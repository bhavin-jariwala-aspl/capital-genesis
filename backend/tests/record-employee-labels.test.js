'use strict';

jest.mock('@prisma/client');
const RecordService = require('../src/services/record.service');

// A text field marked `config.employee` holds a staff id; the payload labels it with the person's name.
describe('RecordService — staff-id fields carry the person\'s name', () => {
  function makePrisma() {
    const rec = { id: 5, object_id: 166, created_by: 'GCRM1', assigned_to: 'GCRM1', created_at: new Date(), updated_at: new Date(), deleted_at: null, pipeline_stage: null, object: { name: 'fs_opportunity' } };
    return {
      record: { findMany: jest.fn().mockResolvedValue([rec]), findUnique: jest.fn().mockResolvedValue(rec), count: jest.fn().mockResolvedValue(1) },
      uiObject: { findUnique: jest.fn().mockResolvedValue({ name: 'fs_opportunity', config: {} }), findMany: jest.fn().mockResolvedValue([]) },
      uiField: {
        findMany: jest.fn(async ({ where }) => (where?.field_type === 'lookup' ? [] : [
          { name: 'owner_rm', config: { employee: true } }, { name: 'amount', config: {} },
        ])),
      },
      recordFieldValue: { findMany: jest.fn().mockResolvedValue([
        { record_id: 5, field_name: 'owner_rm', str_value: 'GCRM1' },
        { record_id: 5, field_name: 'referrer_rm', str_value: 'NOBODY' },
      ]) },
      employee: { findMany: jest.fn().mockResolvedValue([{ employee_id: 'GCRM1', employee_name: 'Priya Ramdin' }]) },
      ...Object.fromEntries(['crmLead', 'crmContact', 'crmAccount', 'crmOpportunity', 'crmCase'].map((m) => [m, { findMany: jest.fn().mockResolvedValue([]) }])),
      employeeHierarchy: { findMany: jest.fn().mockResolvedValue([]) },
      auditLog: { create: jest.fn().mockResolvedValue({}) },
    };
  }

  it('adds labels[field] = employee name on a list', async () => {
    const prisma = makePrisma();
    const out = await new RecordService(prisma).getRecords(166, null, null);
    const rows = out.data ?? out.records ?? out;
    expect(rows[0].data.owner_rm).toBe('GCRM1');
    expect(rows[0].labels).toEqual(expect.objectContaining({ owner_rm: 'Priya Ramdin' }));
    expect(prisma.employee.findMany.mock.calls[0][0].where.employee_id.in).toEqual(['GCRM1']);
  });
});
