'use strict';

/**
 * `config.for_each` runs a step once per matching record of another object
 * (a PLR change → one notice per variable-rate loan), and a create_record
 * field may be a `{ expr }` formula over the looped record.
 */

const WorkflowEngineService = require('../src/services/workflow.service');

// campaign 50 (object 2) · loans 60, 61, 62 (object 3) · notices 70, 71 (object 4)
function world() {
  const objects = { 2: 'plr_change_event', 3: 'loan_account', 4: 'plr_notification' };
  const values = {
    50: { old_rate: 6.825, new_rate: 6.575 },
    60: { rate_type: true, status: 'active', instalment: 21577, outstanding: 1142857, months_to_maturity: 73, margin: -0.175 },
    61: { rate_type: false, status: 'active', instalment: 22500, outstanding: 2520000, months_to_maturity: 2, margin: 0 },
    62: { rate_type: true, status: 'settled', instalment: 0, outstanding: 0, months_to_maturity: 0, margin: 0 },
    70: { plr_change_event: 50, status: 'pending' },
    71: { plr_change_event: 99, status: 'pending' },
  };
  const objectOf = { 50: 2, 60: 3, 61: 3, 62: 3, 70: 4, 71: 4 };
  const fieldValues = (id) => Object.entries(values[id] ?? {}).map(([field_name, v]) => (
    typeof v === 'number' ? { field_name, num_value: v } : typeof v === 'boolean' ? { field_name, bool_value: v } : { field_name, str_value: v }));
  const db = {
    uiObject: {
      findFirst: jest.fn(async ({ where }) => { const id = Object.keys(objects).find((k) => objects[k] === where.name); return id ? { id: Number(id) } : null; }),
      findUnique: jest.fn(async ({ where }) => (objects[where.id] ? { name: objects[where.id] } : null)),
    },
    record: {
      findUnique: jest.fn(async ({ where }) => (objectOf[where.id] ? {
        id: where.id, object_id: objectOf[where.id], object: { name: objects[objectOf[where.id]] }, pipeline_stage: null,
        field_values: fieldValues(where.id), assigned_to: 'GCLOAN1', created_by: null, tenant_id: 7,
      } : null)),
      findMany: jest.fn(async ({ where }) => Object.keys(objectOf).map(Number)
        .filter((id) => objectOf[id] === where.object_id && (!where.id?.in || where.id.in.includes(id)))
        .map((id) => ({ id, object_id: objectOf[id], tenant_id: 7, assigned_to: 'GCLOAN1', created_by: null, pipeline_stage_id: null }))),
    },
    recordFieldValue: {
      findMany: jest.fn(async ({ where }) => Object.keys(objectOf).map(Number)
        .filter((id) => objectOf[id] === where.record.object_id)
        .flatMap((id) => fieldValues(id).filter((r) => where.field_name.in.includes(r.field_name)).map((r) => ({ record_id: id, ...r, num_value: r.num_value ?? null, str_value: r.str_value ?? null, bool_value: r.bool_value ?? null })))),
      upsert: jest.fn(async () => ({})),
    },
    uiField: { findFirst: jest.fn(async () => null), findMany: jest.fn(async () => []) },
  };
  return { db, values };
}

const wf = (step) => ({ id: 1, name: 'wf', trigger_type: 'field_changed', object_id: 2, is_active: true, steps: [{ id: 10, order_index: 1, on_true_id: null, on_false_id: null, ...step }] });

describe('for_each steps', () => {
  it('creates one record per matching looped record, reading the source as source_*', async () => {
    const { db } = world();
    const created = [];
    const svc = new WorkflowEngineService(db);
    svc.setRecordService({ createRecord: jest.fn(async (objectId, _s, _b, _a, _v, data) => { created.push({ objectId, data }); return { id: 900 + created.length }; }) });
    db.uiWorkflow = { findUnique: jest.fn(async () => wf({
      name: 'Notices', step_type: 'create_record',
      config: {
        object_id: 4,
        fields: {
          plr_change_event: '{{source_id}}', loan_account: '{{id}}', old_instalment: '{{instalment}}',
          new_instalment: { expr: 'ROUND(instalment * PMT((source_new_rate + margin) / 1200, months_to_maturity, outstanding) / PMT((source_old_rate + margin) / 1200, months_to_maturity, outstanding), 2)' },
        },
        for_each: { object: 'loan_account', where: "rate_type AND status != 'settled'" },
      },
    })) };
    const log = await svc.manualRun(1, { id: 50, object_id: 2, tenant_id: 7 }, 'GCLMGR');
    expect(created).toHaveLength(1);
    const d = created[0].data;
    expect(created[0].objectId).toBe(4);
    expect(d).toMatchObject({ plr_change_event: '50', loan_account: '60', old_instalment: '21577' });
    // 25 bps lower on 73 months: a little less than the old instalment.
    expect(d.new_instalment).toBeGreaterThan(21300);
    expect(d.new_instalment).toBeLessThan(21577);
    expect(log[0].result).toBe('ran on 1 of 3 loan_account records');
  });

  it('match limits the loop to the records linked to this one', async () => {
    const { db } = world();
    const svc = new WorkflowEngineService(db);
    db.uiWorkflow = { findUnique: jest.fn(async () => wf({
      name: 'Mark sent', step_type: 'action',
      config: { field: 'status', value: 'sent', for_each: { object: 'plr_notification', match: { plr_change_event: '{{id}}' }, where: "status = 'pending'" } },
    })) };
    const log = await svc.manualRun(1, { id: 50, object_id: 2, tenant_id: 7 }, 'GCLMGR');
    expect(log[0].result).toBe('ran on 1 of 1 plr_notification records');
    const writes = db.recordFieldValue.upsert.mock.calls.map(([a]) => a.where?.record_id_field_name?.record_id ?? a.create?.record_id);
    expect(writes).toEqual([70]);
  });

  it('an unknown loop object is a no-op', async () => {
    const { db } = world();
    const svc = new WorkflowEngineService(db);
    db.uiWorkflow = { findUnique: jest.fn(async () => wf({ name: 'x', step_type: 'action', config: { field: 'status', value: 'sent', for_each: { object: 'nope' } } })) };
    const log = await svc.manualRun(1, { id: 50, object_id: 2, tenant_id: 7 }, 'GCLMGR');
    expect(log[0].result).toMatch(/no-op/);
  });
});
