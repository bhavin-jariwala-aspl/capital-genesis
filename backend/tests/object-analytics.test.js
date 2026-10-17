'use strict';

const ObjectAnalyticsService = require('../src/services/object-analytics.service');

function fixture() {
  const anchors = [
    { id: 1, created_at: new Date('2026-01-05'), pipeline_stage: { name: 'new', label: 'New', order_index: 1 } },
    { id: 2, created_at: new Date('2026-01-20'), pipeline_stage: { name: 'approved', label: 'Approved', order_index: 3 } },
    { id: 3, created_at: new Date('2026-02-02'), pipeline_stage: { name: 'approved', label: 'Approved', order_index: 3 } },
  ];
  const fields = {
    1: { amount: 100, product: 'LND-RE', business_unit: 'LND' },
    2: { amount: 300, product: 'LND-PL', business_unit: 'LND' },
    3: { amount: 600, product: 'LND-RE', business_unit: 'LND' },
  };
  const db = {
    uiObject: { findFirst: jest.fn(async () => ({ id: 9, label: 'Loan Application' })) },
    uiField: { findFirst: jest.fn(async () => ({ options: [{ value: 'LND-RE', label: 'Real Estate Loan' }, { value: 'LND-PL', label: 'Personal Loan' }] })) },
    record: { findMany: jest.fn(async () => anchors) },
    recordFieldValue: {
      findMany: jest.fn(async ({ where }) => where.record_id.in.flatMap((id) =>
        Object.entries(fields[id]).filter(([k]) => where.field_name.in.includes(k)).map(([k, v]) => ({
          record_id: id, field_name: k, num_value: typeof v === 'number' ? v : null, str_value: String(v),
        })))),
    },
  };
  const recordService = { accessWhere: jest.fn(async () => ({ AND: [{ barrier_zone_id: null }] })) };
  return { svc: new ObjectAnalyticsService(db, recordService), db, recordService };
}

describe('ObjectAnalyticsService', () => {
  it('counts records per pipeline stage, in pipeline order', async () => {
    const { svc } = fixture();
    const { data } = await svc.run({ object: 'loan_application', group_by: 'stage' }, { employee_id: 'U1' });
    expect(data).toEqual([{ name: 'New', key: 'new', value: 1 }, { name: 'Approved', key: 'approved', value: 2 }]);
  });

  it('sums a field per select option, labelled as the UI labels it', async () => {
    const { svc } = fixture();
    const { data } = await svc.run({ object: 'loan_application', metric: 'sum', field: 'amount', group_by: 'product' }, null);
    expect(data).toEqual([
      { name: 'Real Estate Loan', key: 'LND-RE', value: 700 },
      { name: 'Personal Loan', key: 'LND-PL', value: 300 },
    ]);
  });

  it('returns a single metric when ungrouped, after filters', async () => {
    const { svc } = fixture();
    const { data, meta } = await svc.run({ object: 'loan_application', metric: 'avg', field: 'amount', filters: [{ field: 'amount', op: 'gte', value: 300 }] }, null);
    expect(data.value).toBe(450);
    expect(meta.records).toBe(2);
  });

  it('buckets by creation month', async () => {
    const { svc } = fixture();
    const { data } = await svc.run({ object: 'loan_application', group_by: 'created_month' }, null);
    expect(data.map((r) => [r.name, r.value])).toEqual([['2026-01', 2], ['2026-02', 1]]);
  });

  it('reads only records the viewer can access', async () => {
    const { svc, db, recordService } = fixture();
    const viewer = { employee_id: 'U1', role: 'user' };
    await svc.run({ object: 'loan_application' }, viewer);
    expect(recordService.accessWhere).toHaveBeenCalledWith(viewer);
    expect(db.record.findMany.mock.calls[0][0].where).toMatchObject({ object_id: 9, deleted_at: null, AND: [{ barrier_zone_id: null }] });
  });

  it('rejects a malformed spec before touching the database', async () => {
    const { svc, db } = fixture();
    await expect(svc.run({ object: 'x', metric: 'sum' }, null)).rejects.toThrow(/needs a field/);
    await expect(svc.run({ object: 'x', filters: [{ field: 'a', op: 'drop table' }] }, null)).rejects.toThrow(/Invalid filter/);
    expect(db.uiObject.findFirst).not.toHaveBeenCalled();
  });
});

describe('ObjectAnalyticsService — periods sort by time', () => {
  it('orders a text period field chronologically, not by value', async () => {
    const { svc, db } = fixture();
    const periods = { 1: '2026-07', 2: '2026-05', 3: '2026-06' };
    db.uiField.findFirst = jest.fn(async () => null);
    db.recordFieldValue.findMany = jest.fn(async ({ where }) => where.record_id.in.flatMap((id) => [
      ...(where.field_name.in.includes('period') ? [{ record_id: id, field_name: 'period', str_value: periods[id] }] : []),
      ...(where.field_name.in.includes('amount') ? [{ record_id: id, field_name: 'amount', num_value: id * 100 }] : []),
    ]));
    const { data } = await svc.run({ object: 'revenue_entry', metric: 'sum', field: 'amount', group_by: 'period' }, null);
    expect(data.map((r) => r.key)).toEqual(['2026-05', '2026-06', '2026-07']);
  });
});

describe('ObjectAnalyticsService — staff-id fields', () => {
  it('labels groups of a `config.employee` field with the person\'s name', async () => {
    const { svc, db } = fixture();
    const owners = { 1: 'GCRM1', 2: 'GCRM2', 3: 'GCRM1' };
    db.uiField.findFirst = jest.fn(async () => ({ options: null, config: { employee: true } }));
    db.employee = { findMany: jest.fn(async () => [{ employee_id: 'GCRM1', employee_name: 'Priya Ramdin' }, { employee_id: 'GCRM2', employee_name: 'Natasha Appadoo' }]) };
    db.recordFieldValue.findMany = jest.fn(async ({ where }) => where.record_id.in.map((id) => ({ record_id: id, field_name: 'owner_rm', str_value: owners[id] })));
    const { data } = await svc.run({ object: 'fs_opportunity', group_by: 'owner_rm' }, null);
    expect(data).toEqual([{ name: 'Priya Ramdin', key: 'GCRM1', value: 2 }, { name: 'Natasha Appadoo', key: 'GCRM2', value: 1 }]);
  });
});

describe('ObjectAnalyticsService — checkbox fields', () => {
  it('labels the groups of a checkbox Yes / No, or with the field\'s own wording', async () => {
    const { svc, db } = fixture();
    const linked = { 1: true, 2: false, 3: true };
    db.recordFieldValue.findMany = jest.fn(async ({ where }) => where.record_id.in.map((id) => ({ record_id: id, field_name: 'rate_type', bool_value: linked[id] })));
    db.uiField.findFirst = jest.fn(async () => ({ field_type: 'checkbox', options: null, config: {} }));
    expect((await svc.run({ object: 'loan_account', group_by: 'rate_type' }, null)).data.map((r) => r.name)).toEqual(['Yes', 'No']);
    db.uiField.findFirst = jest.fn(async () => ({ field_type: 'checkbox', options: null, config: { true_label: 'PLR-linked', false_label: 'Fixed' } }));
    expect((await svc.run({ object: 'loan_account', group_by: 'rate_type' }, null)).data.map((r) => r.name)).toEqual(['PLR-linked', 'Fixed']);
  });
});

describe('ObjectAnalyticsService — lookup fields', () => {
  it('labels groups of a lookup with the linked record\'s title — only for records the viewer may see', async () => {
    const { svc, db, recordService } = fixture();
    const mandate = { 1: 501, 2: 502, 3: 501 };
    db.uiField.findFirst = jest.fn(async () => ({ field_type: 'lookup', options: null, config: { target_object: 'advisory_mandate' } }));
    // Anchors first, then the linked records the viewer can see (502 sits behind a wall the viewer is outside).
    db.record.findMany = jest.fn()
      .mockResolvedValueOnce(fixture().db.record.findMany.getMockImplementation()())
      .mockResolvedValueOnce([{ id: 501, object_id: 204 }]);
    db.recordFieldValue.findMany = jest.fn(async ({ where }) => (where.field_name === 'code_name'
      ? where.record_id.in.map((id) => ({ record_id: id, str_value: `Project ${id === 501 ? 'Dodo' : 'Secret'}` }))
      : where.record_id.in.map((id) => ({ record_id: id, field_name: 'advisory_mandate', num_value: mandate[id] }))));
    recordService.titleFieldFor = jest.fn(async () => 'code_name');
    const { data } = await svc.run({ object: 'time_entry', group_by: 'advisory_mandate' }, { employee_id: 'U1' });
    expect(data).toEqual([{ name: 'Project Dodo', key: '501', value: 2 }, { name: '502', key: '502', value: 1 }]);
    expect(db.record.findMany.mock.calls[1][0].where).toMatchObject({ id: { in: [501, 502] }, deleted_at: null, AND: [{ barrier_zone_id: null }] });
  });
});
