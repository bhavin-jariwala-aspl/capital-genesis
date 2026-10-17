'use strict';

jest.mock('@prisma/client');
const RecordService = require('../src/services/record.service');

// The CSV export speaks the user's language: labels, not codes and ids — and can follow the table's filter.
describe('RecordService — CSV export', () => {
  function makePrisma() {
    const rec = { id: 9, object_id: 226, created_by: 'GCBDH', assigned_to: null, created_at: new Date('2026-10-17T08:00:00Z'), updated_at: new Date(), deleted_at: null, pipeline_stage: null };
    return {
      record: { findMany: jest.fn().mockResolvedValue([rec]) },
      uiObject: { findUnique: jest.fn().mockResolvedValue({ name: 'revenue_entry', config: { title_field: 'name' } }), findMany: jest.fn().mockResolvedValue([{ id: 157, name: 'party' }]) },
      uiField: {
        findMany: jest.fn(async ({ where }) => {
          if (where?.field_type === 'lookup') return [{ name: 'party', config: { target_object: 'party' } }];
          return [
            { name: 'party', label: 'Client', field_type: 'lookup', config: { target_object: 'party' } },
            { name: 'business_unit', label: 'Business unit', field_type: 'select', options: [{ value: 'FX', label: 'Forex (Genesis Forex)' }] },
            { name: 'amount', label: 'Amount', field_type: 'currency' },
            { name: 'booked_on', label: 'Booked on', field_type: 'date' },
            { name: 'rm', label: 'RM credited', field_type: 'text', config: { employee: true } },
          ];
        }),
      },
      recordFieldValue: { findMany: jest.fn(async ({ where }) => (where.field_name === 'display_name' || where.field_name === 'name'
        ? [{ record_id: 3057, str_value: 'Priya Naidoo, Ltd' }]
        : [
          { record_id: 9, field_name: 'party', num_value: 3057 },
          { record_id: 9, field_name: 'business_unit', str_value: 'FX' },
          { record_id: 9, field_name: 'amount', num_value: 12250 },
          { record_id: 9, field_name: 'booked_on', date_value: new Date('2026-10-17T00:00:00Z') },
          { record_id: 9, field_name: 'rm', str_value: 'GCFX1' },
        ])) },
      employee: { findMany: jest.fn().mockResolvedValue([{ employee_id: 'GCFX1', employee_name: 'Deepak Mungur' }, { employee_id: 'GCBDH', employee_name: 'Shalini Ramtohul' }]) },
      ...Object.fromEntries(['crmLead', 'crmContact', 'crmAccount', 'crmOpportunity', 'crmCase'].map((m) => [m, { findMany: jest.fn().mockResolvedValue([]) }])),
      employeeHierarchy: { findMany: jest.fn().mockResolvedValue([]) },
      auditLog: { create: jest.fn().mockResolvedValue({}) },
    };
  }

  it('writes field labels, picklist labels, linked titles and staff names, quoted where needed', async () => {
    const prisma = makePrisma();
    const csv = await new RecordService(prisma).exportRecordsCsv(226, null);
    const [head, row] = csv.split('\r\n');
    expect(head).toBe('ID,Stage,Owner,Created by,Created at,Client,Business unit,Amount,Booked on,RM credited');
    expect(row).toBe('9,,,Shalini Ramtohul,2026-10-17T08:00:00.000Z,"Priya Naidoo, Ltd",Forex (Genesis Forex),12250,2026-10-17,Deepak Mungur');
  });

  it('exports only the rows the table was filtered to', async () => {
    const prisma = makePrisma();
    await new RecordService(prisma).exportRecordsCsv(226, null, { ids: [9, 'x', 12] });
    expect(prisma.record.findMany.mock.calls[0][0].where.id).toEqual({ in: [9, 12] });
  });
});
