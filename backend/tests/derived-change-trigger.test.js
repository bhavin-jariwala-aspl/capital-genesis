'use strict';

jest.mock('@prisma/client');

const RecordService = require('../src/services/record.service');
const WorkflowEngineService = require('../src/services/workflow.service');

/**
 * A formula that moves because a related record changed (a pledge revalued →
 * the loan's LTV) is written without its record being saved. Workflows that
 * opt in with `trigger_config.derived` must still see that change; every other
 * field-change workflow must not.
 */

describe('RecordService — derived formula changes are published', () => {
  // collateral_valuation (10) → collateral (20, market value) → loan_application (30, LTV)
  function world(eventBus) {
    const objects = { 1: 'collateral_valuation', 2: 'collateral', 3: 'loan_application' };
    const records = { 10: 1, 20: 2, 30: 3 };
    const deleted = new Set();
    const rows = [
      { record_id: 10, field_name: 'collateral', num_value: 20, str_value: '20' },
      { record_id: 10, field_name: 'market_value', num_value: 1390000 },
      { record_id: 20, field_name: 'loan_application', num_value: 30, str_value: '30' },
      { record_id: 20, field_name: 'market_value', num_value: 1615000 },
      { record_id: 30, field_name: 'exposure_mur', num_value: 1142857 },
      { record_id: 30, field_name: 'pledged_value', num_value: 1615000 },
      { record_id: 30, field_name: 'ibl_ltv_status', str_value: 'ok' },
    ];
    const fields = [
      { object_id: 1, name: 'collateral', field_type: 'lookup', config: { target_object: 'collateral' } },
      { object_id: 2, name: 'loan_application', field_type: 'lookup', config: { target_object: 'loan_application' } },
      { object_id: 2, name: 'market_value', field_type: 'formula', data_type: 'number', order_index: 1, config: { expression: "LOOKUP('collateral_valuation', 'collateral', id, 'market_value')" } },
      { object_id: 3, name: 'pledged_value', field_type: 'formula', data_type: 'number', order_index: 1, config: { expression: "SUM_RELATED('collateral', 'loan_application', 'market_value')" } },
      { object_id: 3, name: 'ibl_ltv_status', field_type: 'formula', data_type: 'string', order_index: 2, config: { expression: "IF(exposure_mur / pledged_value * 100 >= 80, 'margin_call', 'ok')" } },
    ];
    const match = (f, where) => (where.object_id === undefined || f.object_id === where.object_id)
      && (!where.field_type || f.field_type === where.field_type)
      && (!where.config || f.config?.target_object === where.config.equals);
    const rowsWhere = (where) => rows.filter((r) => (where.record_id === undefined
        || (where.record_id?.in ? where.record_id.in.includes(r.record_id) : r.record_id === where.record_id))
      && (!where.field_name || r.field_name === where.field_name)
      && (where.num_value === undefined || r.num_value === where.num_value)
      && (where.str_value === undefined || r.str_value === where.str_value)
      && (!where.record || (records[r.record_id] === where.record.object_id && !deleted.has(r.record_id))));
    const db = {
      uiObject: {
        findUnique: async ({ where }) => (objects[where.id] ? { name: objects[where.id] } : null),
        findFirst: async ({ where }) => { const id = Object.keys(objects).find((k) => objects[k] === where.name); return id ? { id: Number(id) } : null; },
      },
      uiField: {
        findMany: async ({ where }) => fields.filter((f) => match(f, where)),
        findFirst: async () => null,
      },
      record: {
        findUnique: async ({ where }) => (records[where.id] ? { id: where.id, object_id: records[where.id], tenant_id: 7, deleted_at: deleted.has(where.id) ? new Date() : null, assigned_to: 'GCLOAN1', object: { name: objects[records[where.id]] } } : null),
        update: async ({ where, data }) => { if (data?.deleted_at) deleted.add(where.id); return { id: where.id, object_id: records[where.id], tenant_id: 7 }; },
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
    const svc = new RecordService(db, eventBus);
    svc.setRow = (id, name, num) => { const r = rows.find((x) => x.record_id === id && x.field_name === name); r.num_value = num; };
    svc.value = (id, name) => { const r = rows.find((x) => x.record_id === id && x.field_name === name); return r?.str_value ?? r?.num_value; };
    db.auditLog = { create: async () => ({}) };
    return svc;
  }

  it('a revaluation two levels down publishes the loan\'s new LTV status', async () => {
    const eventBus = { publish: jest.fn().mockResolvedValue() };
    const svc = world(eventBus);
    await svc.recompute(10); // the valuation was saved
    const derived = eventBus.publish.mock.calls.filter(([name]) => name === 'record.derived_changed').map(([, p]) => p);
    const loan = derived.find((p) => p.record.id === 30);
    expect(loan).toBeDefined();
    expect(loan.objectId).toBe(3);
    expect(loan.changed.ibl_ltv_status).toEqual({ old: 'ok', new: 'margin_call' });
    expect(loan.record.assigned_to).toBe('GCLOAN1');
    // Never under the save event's name: webhooks and SLA clocks keep listening to real saves only.
    expect(eventBus.publish.mock.calls.some(([name]) => name === 'record.field_changed')).toBe(false);
  });

  it('deleting the valuation takes it out of the parents\' roll-ups again', async () => {
    const svc = world(null);
    await svc.recompute(10);
    expect(svc.value(30, 'ibl_ltv_status')).toBe('margin_call');
    await svc.deleteRecord(10, 'GCCRED1', null, { mode: 'soft' });
    expect(svc.value(20, 'market_value')).toBeNull();
  });

  it('a partial edit of a child (one field, no lookup in the patch) still refreshes its parent', async () => {
    const svc = world(null);
    svc.scope = { stampFor: async () => ({}) };
    await svc.recompute(10);
    expect(svc.value(30, 'ibl_ltv_status')).toBe('margin_call');
    // The valuation is corrected behind the collateral's back; then one unrelated field of the collateral is edited.
    svc.setRow(10, 'market_value', 2000000);
    await svc.updateRecord(20, 'GCOPS1', null, undefined, { note: 'pledge reduced' });
    expect(Number(svc.value(20, 'market_value'))).toBe(2000000);
    expect(Number(svc.value(30, 'pledged_value'))).toBe(2000000);
    expect(svc.value(30, 'ibl_ltv_status')).toBe('ok');
  });

  it('publishes nothing without an event bus (bulk refreshes, installs)', async () => {
    const svc = world(null);
    await expect(svc.recompute(10)).resolves.toBe(false);
  });
});

describe('WorkflowEngineService.triggerFieldChanged — derived changes', () => {
  // A workflow records that it ran when the engine reads its steps (only #run does).
  const ran = [];
  const wf = (id, trigger_config) => {
    const w = { id, name: `wf${id}`, trigger_type: 'field_changed', trigger_config, is_active: true };
    Object.defineProperty(w, 'steps', { get: () => { ran.push(id); return []; } });
    return w;
  };
  const engine = (workflows) => new WorkflowEngineService({ uiWorkflow: { findMany: jest.fn().mockResolvedValue(workflows) } });
  const change = { ibl_ltv_status: { old: 'ok', new: 'margin_call' } };
  beforeEach(() => { ran.length = 0; });

  it('runs only the workflows that opted in to derived changes', async () => {
    const svc = engine([wf(1, { field: 'ibl_ltv_status', derived: true }), wf(2, { field: 'ibl_ltv_status' }), wf(3, {})]);
    await svc.triggerFieldChanged(3, { id: 30, object_id: 3 }, change, null, { derived: true });
    expect(ran).toEqual([1]);
  });

  it('on a real save, opted-in and plain workflows both run', async () => {
    const svc = engine([wf(1, { field: 'ibl_ltv_status', derived: true }), wf(2, { field: 'ibl_ltv_status' }), wf(4, { field: 'other' })]);
    await svc.triggerFieldChanged(3, { id: 30, object_id: 3 }, change, 'GCCRED1');
    expect(ran).toEqual([1, 2]);
  });
});
