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
