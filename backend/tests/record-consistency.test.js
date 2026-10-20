'use strict';

jest.mock('@prisma/client');

const RecordService = require('../src/services/record.service');

/**
 * A change made in one place must reach every record that derives a value from
 * it — whichever path made the change (an edit, a bulk action, the Trash, a
 * merge, a pipeline move). The world: holdings roll up into their client
 * (`holding_count`, `aum` over active holdings only), and a disbursement's
 * Status mirrors its pipeline stage.
 */
function world() {
  const objects = { 1: 'client', 2: 'holding', 3: 'disbursement', 4: 'loan' };
  const records = {
    100: { object_id: 1 }, 101: { object_id: 1 },
    200: { object_id: 2 }, 201: { object_id: 2 },
    300: { object_id: 3 }, 400: { object_id: 4 },
  };
  for (const r of Object.values(records)) { r.deleted_at = null; r.pipeline_stage_id = null; r.tenant_id = 7; }
  const rows = [
    { record_id: 200, field_name: 'client', num_value: 100, str_value: '100' },
    { record_id: 200, field_name: 'value', num_value: 50, str_value: '50' },
    { record_id: 200, field_name: 'status', str_value: 'active' },
    { record_id: 201, field_name: 'client', num_value: 100, str_value: '100' },
    { record_id: 201, field_name: 'value', num_value: 30, str_value: '30' },
    { record_id: 201, field_name: 'status', str_value: 'active' },
    { record_id: 201, field_name: 'value_k', num_value: 0.03, str_value: '0.03' },
    { record_id: 100, field_name: 'holding_count', num_value: 2, str_value: '2' },
    { record_id: 100, field_name: 'aum', num_value: 80, str_value: '80' },
    { record_id: 300, field_name: 'loan', num_value: 400, str_value: '400' },
    { record_id: 300, field_name: 'status', str_value: 'pending' },
    { record_id: 300, field_name: 'amount', num_value: 25, str_value: '25' },
  ];
  const fields = [
    { object_id: 2, name: 'client', field_type: 'lookup', data_type: 'number', config: { target_object: 'client' } },
    { object_id: 2, name: 'value', field_type: 'number', data_type: 'number', config: {} },
    { object_id: 2, name: 'status', field_type: 'picklist', data_type: 'string', config: {} },
    // a formula of its own that the status write does not move
    { object_id: 2, name: 'value_k', field_type: 'formula', data_type: 'number', config: { expression: 'value / 1000' } },
    { object_id: 1, name: 'holding_count', field_type: 'formula', data_type: 'number', config: { expression: "COUNT_RELATED('holding', 'client')" } },
    { object_id: 1, name: 'aum', field_type: 'formula', data_type: 'number', config: { expression: "SUM_RELATED('holding', 'client', 'value', 'status', 'active')" } },
    { object_id: 3, name: 'loan', field_type: 'lookup', data_type: 'number', config: { target_object: 'loan' } },
    { object_id: 3, name: 'status', field_type: 'picklist', data_type: 'string', config: {} },
    { object_id: 3, name: 'amount', field_type: 'number', data_type: 'number', config: {} },
    { object_id: 4, name: 'disbursed', field_type: 'formula', data_type: 'number', config: { expression: "SUM_RELATED('disbursement', 'loan', 'amount', 'status', 'disbursed')" } },
  ].map((f) => ({ is_active: true, validations: [], ...f }));
  for (const f of fields) f.active = true;
  const stages = {
    1: { id: 1, name: 'pending', label: 'Pending', color: null, pipeline: { config: { status_field: { field: 'status', map: { pending: 'pending', paid: 'disbursed' } } } } },
    2: { id: 2, name: 'paid', label: 'Paid', color: null, pipeline: { config: { status_field: { field: 'status', map: { pending: 'pending', paid: 'disbursed' } } } } },
  };
  const statusEvents = [];

  const fieldMatch = (f, where) => (where.object_id === undefined || f.object_id === where.object_id)
    && (where.name === undefined || f.name === where.name)
    && (!where.field_type || f.field_type === where.field_type)
    && (!where.config || f.config?.target_object === where.config.equals);
  const live = (id) => records[id] && !records[id].deleted_at;
  const rowsWhere = (where) => rows.filter((r) => (where.record_id === undefined
      || (typeof where.record_id === 'object' ? where.record_id.in.includes(r.record_id) : r.record_id === where.record_id))
    && (!where.field_name || (typeof where.field_name === 'object' ? where.field_name.in.includes(r.field_name) : r.field_name === where.field_name))
    && (where.num_value === undefined || r.num_value === where.num_value)
    && (where.str_value === undefined || r.str_value === where.str_value)
    && (where.id === undefined || where.id.in.includes(r.id))
    && (!where.record || (records[r.record_id]?.object_id === where.record.object_id
      && (where.record.deleted_at !== null || live(r.record_id)))));
  const recordRow = (id) => (records[id] ? { id: Number(id), ...records[id], object: { name: objects[records[id].object_id] }, pipeline_stage: stages[records[id].pipeline_stage_id] ?? null } : null);
  const activities = [{ id: 1, record_id: 101 }, { id: 2, record_id: 101 }, { id: 3, record_id: 100 }];
  const related = (list) => ({
    findMany: async ({ where }) => list.filter((a) => a.record_id === where.record_id),
    updateMany: async ({ where, data }) => { for (const a of list) if (where.id.in.includes(a.id)) Object.assign(a, data); return {}; },
  });

  const db = {
    uiObject: {
      findUnique: async ({ where }) => (objects[where.id] ? { name: objects[where.id], config: {} } : null),
      findFirst: async ({ where }) => { const id = Object.keys(objects).find((k) => objects[k] === where.name); return id ? { id: Number(id) } : null; },
    },
    uiField: {
      findMany: async ({ where }) => fields.filter((f) => fieldMatch(f, where)),
      findFirst: async ({ where }) => fields.find((f) => fieldMatch(f, where)) ?? null,
    },
    uiPipeline: { findFirst: async () => null },
    uiPipelineStage: {
      findUnique: async ({ where }) => stages[where.id] ?? null,
      findFirst: async () => null,
    },
    statusEvent: { create: async ({ data }) => { statusEvents.push(data); return data; } },
    auditLog: { create: async () => ({}), createMany: async () => ({}) },
    activity: related(activities),
    employeeHierarchy: { findMany: async () => [] },
    record: {
      findUnique: async ({ where }) => recordRow(where.id),
      findMany: async ({ where }) => Object.keys(records).map(Number)
        .filter((id) => (!where.id || where.id.in.includes(id)) && (where.object_id === undefined || records[id].object_id === where.object_id)
          && (where.deleted_at !== null || live(id)))
        .map(recordRow),
      update: async ({ where, data }) => { Object.assign(records[where.id], data); return recordRow(where.id); },
      updateMany: async ({ where, data }) => { for (const id of where.id.in) Object.assign(records[id], data); return { count: where.id.in.length }; },
      deleteMany: async ({ where }) => { for (const id of where.id.in) delete records[id]; return { count: where.id.in.length }; },
    },
    recordFieldValue: {
      findMany: async ({ where }) => rowsWhere(where),
      findFirst: async ({ where }) => rowsWhere(where)[0] ?? null,
      findUnique: async ({ where }) => rows.find((r) => r.record_id === where.record_id_field_name.record_id && r.field_name === where.record_id_field_name.field_name) ?? null,
      createMany: async ({ data }) => { rows.push(...data); return { count: data.length }; },
      updateMany: async ({ where, data }) => { const hit = rowsWhere(where); for (const r of hit) Object.assign(r, data); return { count: hit.length }; },
      upsert: async ({ where, create, update }) => {
        const r = rows.find((x) => x.record_id === where.record_id_field_name.record_id && x.field_name === where.record_id_field_name.field_name);
        if (r) { for (const k of ['str_value', 'num_value', 'bool_value', 'date_value', 'json_value']) delete r[k]; Object.assign(r, update); return r; }
        rows.push(create); return create;
      },
    },
  };
  const value = (id, name) => rows.find((r) => r.record_id === id && r.field_name === name)?.str_value;
  const svc = new RecordService(db);
  svc.auditChain = { append: async (e) => { chain.push(e); } };
  const chain = [];
  return { svc, value, records, rows, statusEvents, activities, chain };
}

describe('Roll-ups follow every path that changes a child', () => {
  it('a child re-linked to another parent leaves the old parent’s roll-ups too', async () => {
    const { svc, value } = world();
    await svc.updateRecord(201, 'EMP1', null, undefined, { client: 101 });
    expect(value(101, 'holding_count')).toBe('1');
    expect(value(101, 'aum')).toBe('30');
    expect(value(100, 'holding_count')).toBe('1'); // was 2: the old parent dropped it
    expect(value(100, 'aum')).toBe('50');
  });

  it('a bulk delete drops the children from their parents’ roll-ups, as a single delete does', async () => {
    const { svc, value } = world();
    await svc.bulkDelete([200, 201], 'EMP1', null);
    expect(value(100, 'holding_count')).toBe('0');
    expect(value(100, 'aum')).toBe('0');
  });

  it('a record restored from the Trash is counted by its parent again', async () => {
    const { svc, value } = world();
    await svc.deleteRecord(200, 'EMP1', null);
    expect(value(100, 'holding_count')).toBe('1');
    await svc.restoreRecord(200, 'ADMIN');
    expect(value(100, 'holding_count')).toBe('2');
    expect(value(100, 'aum')).toBe('80');
  });

  it('a stored value written outside a save (a workflow step) still reaches the parent', async () => {
    const { svc, value, rows } = world();
    // the workflow engine writes the field straight to the store, then recomputes
    rows.find((r) => r.record_id === 201 && r.field_name === 'status').str_value = 'closed';
    await svc.recompute(201, { propagate: true });
    expect(value(100, 'aum')).toBe('50');
  });
});

describe('A pipeline move keeps the mirrored status — and what reads it — in step', () => {
  it('a single move writes the status and refreshes the parent roll-up filtered on it', async () => {
    const { svc, value } = world();
    await svc.updateRecordStage(300, 2, 'EMP1', null);
    expect(value(300, 'status')).toBe('disbursed');
    expect(value(400, 'disbursed')).toBe('25');
  });

  it('a bulk move does the same for every record, and writes the status timeline', async () => {
    const { svc, value, statusEvents } = world();
    await svc.bulkUpdateStage([300], 2, 'EMP1', null);
    expect(value(300, 'status')).toBe('disbursed');
    expect(value(400, 'disbursed')).toBe('25');
    await new Promise((r) => setImmediate(r));
    expect(statusEvents).toEqual([expect.objectContaining({ record_id: 300, status: 'paid' })]);
  });
});

describe('Merging duplicates keeps one timeline', () => {
  it('moves the duplicate’s activities to the survivor, and an unmerge moves exactly those back', async () => {
    const { svc, activities, chain, records } = world();
    const res = await svc.mergeRecords(101, 100, null);
    expect(res.moved.activity).toBe(2);
    expect(activities.map((a) => a.record_id)).toEqual([100, 100, 100]);
    expect(records[101].deleted_at).toBeInstanceOf(Date);
    // the unmerge reads the change set back from the audit chain
    svc.db.auditChainEvent = {
      findFirst: async ({ where }) => (where.entity_type === 'record.merge' ? { ...chain[0], seq: 1, created_at: new Date(), payload: chain[0].payload } : null),
    };
    activities.push({ id: 4, record_id: 100 }); // logged on the survivor after the merge
    await svc.unmergeRecord(101, null);
    expect(activities.map((a) => a.record_id)).toEqual([101, 101, 100, 100]);
  });
});
