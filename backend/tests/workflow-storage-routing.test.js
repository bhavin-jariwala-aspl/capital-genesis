'use strict';

/**
 * WorkflowEngineService — field storage routing and per-record scheduling.
 *
 * The engine used to read and write fields only on the five first-class CRM
 * tables, so on an EAV-backed object (every insurance domain object, `client`,
 * and all custom objects) a condition saw no value and an action wrote nothing.
 * These tests pin the routing that makes the shipped workflow catalogue run.
 */

const WorkflowEngineService = require('../src/services/workflow.service');

function makeDb({ record = null, eavRows = [], records = [] } = {}) {
  return {
    uiWorkflow:  { findUnique: jest.fn(), findMany: jest.fn().mockResolvedValue([]) },
    uiObject:    { findUnique: jest.fn().mockResolvedValue({ name: 'policy' }) },
    uiField:     { findFirst: jest.fn().mockResolvedValue({ data_type: 'string' }) },
    notification:{ createMany: jest.fn().mockResolvedValue({ count: 1 }) },
    employee:    { findMany: jest.fn().mockResolvedValue([]) },
    workflowPendingStep: { create: jest.fn().mockResolvedValue({ id: 1 }), findMany: jest.fn().mockResolvedValue([]) },
    recordFieldValue: {
      upsert:   jest.fn().mockResolvedValue({}),
      findMany: jest.fn().mockResolvedValue(eavRows),
    },
    crmLead: { update: jest.fn().mockResolvedValue({}), create: jest.fn().mockResolvedValue({}) },
    record: {
      findUnique: jest.fn().mockResolvedValue(record),
      findMany:   jest.fn().mockResolvedValue(records),
      create:     jest.fn().mockResolvedValue({ id: 500 }),
      update:     jest.fn().mockResolvedValue({}),
    },
    $executeRaw: jest.fn().mockResolvedValue(1),
    $transaction: jest.fn().mockResolvedValue([]),
  };
}

/** An EAV-backed record (a Policy), as loaded with its field_values relation. */
function eavRecord(fieldValues = []) {
  return {
    id: 100, object_id: 45, object: { name: 'policy' },
    assigned_to: 'USR001', created_by: 'USR001', pipeline_stage_id: null,
    field_values: fieldValues,
    crm_lead: null, crm_lead_intake: null, crm_contact: null,
    crm_account: null, crm_opportunity: null, crm_case: null,
  };
}

/**
 * The scheduler dispatches each due workflow fire-and-forget so one slow sweep
 * cannot stall the tick, so tests must let the pending chain drain.
 */
async function flush() {
  for (let i = 0; i < 20; i++) await new Promise(r => setImmediate(r));
}

function wf(steps, extra = {}) {
  return { id: 1, name: 'wf', trigger_type: 'on_create', object_id: 45, is_active: true, steps, ...extra };
}

describe('WorkflowEngineService — EAV-backed objects', () => {
  it('evaluates a condition against a value stored in record_field_values', async () => {
    const db = makeDb({
      record: eavRecord([
        { field_name: 'status',      str_value: 'active', num_value: null, bool_value: null, date_value: null, json_value: null },
        { field_name: 'policyholder', str_value: 'Jane Roe', num_value: null, bool_value: null, date_value: null, json_value: null },
      ]),
    });
    const steps = [
      { id: 1, name: 'Gate', step_type: 'condition', order_index: 1,
        config: { field: 'status', operator: 'eq', value: 'active' }, on_true_id: null, on_false_id: null },
      { id: 2, name: 'Notify', step_type: 'notification', order_index: 2,
        config: { field: 'assigned_to', title: 'Renewal on {{policyholder}}' }, on_true_id: null, on_false_id: null },
    ];
    db.uiWorkflow.findUnique.mockResolvedValue(wf(steps));

    const log = await new WorkflowEngineService(db).manualRun(1, { id: 100 });

    expect(log[0].result).toBe('true');
    // The record's own assigned_to resolved as the recipient…
    expect(db.notification.createMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: [expect.objectContaining({ employee_id: 'USR001' })] }),
    );
    // …and {{policyholder}} interpolated from the EAV value.
    expect(db.notification.createMany.mock.calls[0][0].data[0].title).toBe('Renewal on Jane Roe');
  });

  it('halts the chain when the condition reads a value that is not there', async () => {
    const db = makeDb({ record: eavRecord([]) });
    const steps = [
      { id: 1, name: 'Gate', step_type: 'condition', order_index: 1,
        config: { field: 'status', operator: 'eq', value: 'active' }, on_true_id: null, on_false_id: null },
      { id: 2, name: 'Notify', step_type: 'notification', order_index: 2,
        config: { role: 'manager', title: 'x' }, on_true_id: null, on_false_id: null },
    ];
    db.uiWorkflow.findUnique.mockResolvedValue(wf(steps));

    const log = await new WorkflowEngineService(db).manualRun(1, { id: 100 });
    expect(log).toHaveLength(1);
    expect(db.notification.createMany).not.toHaveBeenCalled();
  });

  it('writes an action step to the typed EAV row, not a CRM table', async () => {
    const db = makeDb({ record: eavRecord([]) });
    db.uiField.findFirst.mockResolvedValue({ data_type: 'string' });
    const steps = [
      { id: 1, name: 'Expire', step_type: 'action', order_index: 1,
        config: { field: 'status', value: 'expired' }, on_true_id: null, on_false_id: null },
    ];
    db.uiWorkflow.findUnique.mockResolvedValue(wf(steps));

    const log = await new WorkflowEngineService(db).manualRun(1, { id: 100 });

    expect(db.crmLead.update).not.toHaveBeenCalled();
    expect(db.recordFieldValue.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where:  { record_id_field_name: { record_id: 100, field_name: 'status' } },
      create: expect.objectContaining({ field_name: 'status', str_value: 'expired' }),
    }));
    expect(log[0].result).toBe('set status=expired');
  });

  it('serialises an EAV write into the typed column for the field data type', async () => {
    const db = makeDb({ record: eavRecord([]) });
    db.uiField.findFirst.mockResolvedValue({ data_type: 'number' });
    const steps = [
      { id: 1, name: 'Set amount', step_type: 'action', order_index: 1,
        config: { field: 'settlement_amount', value: 12500 }, on_true_id: null, on_false_id: null },
    ];
    db.uiWorkflow.findUnique.mockResolvedValue(wf(steps));

    await new WorkflowEngineService(db).manualRun(1, { id: 100 });
    expect(db.recordFieldValue.upsert.mock.calls[0][0].create.num_value).toBe(12500);
  });

  it('interpolates {{field}} placeholders in an action value', async () => {
    const db = makeDb({
      record: eavRecord([
        { field_name: 'policy_number', str_value: 'POL-9', num_value: null, bool_value: null, date_value: null, json_value: null },
      ]),
    });
    const steps = [
      { id: 1, name: 'Stamp note', step_type: 'action', order_index: 1,
        config: { field: 'notes', value: 'Auto-expired {{policy_number}}' }, on_true_id: null, on_false_id: null },
    ];
    db.uiWorkflow.findUnique.mockResolvedValue(wf(steps));

    await new WorkflowEngineService(db).manualRun(1, { id: 100 });
    expect(db.recordFieldValue.upsert.mock.calls[0][0].create.str_value).toBe('Auto-expired POL-9');
  });
});

describe('WorkflowEngineService — record-level columns', () => {
  it('writes assigned_to to the records row rather than an entity or EAV', async () => {
    const db = makeDb({ record: eavRecord([]) });
    const steps = [
      { id: 1, name: 'Re-route', step_type: 'action', order_index: 1,
        config: { field: 'assigned_to', value: 'MGR001' }, on_true_id: null, on_false_id: null },
    ];
    db.uiWorkflow.findUnique.mockResolvedValue(wf(steps));

    await new WorkflowEngineService(db).manualRun(1, { id: 100 });

    expect(db.record.update).toHaveBeenCalledWith({ where: { id: 100 }, data: { assigned_to: 'MGR001' } });
    expect(db.recordFieldValue.upsert).not.toHaveBeenCalled();
  });
});

describe('WorkflowEngineService — create_record routing', () => {
  it('creates the anchor row and writes its fields to EAV for a non-CRM object', async () => {
    const db = makeDb({ record: eavRecord([
      { field_name: 'application_number', str_value: 'APP-7', num_value: null, bool_value: null, date_value: null, json_value: null },
    ]) });
    db.uiObject.findUnique.mockResolvedValue({ name: 'underwriting_case' });
    const steps = [
      { id: 1, name: 'Open UW case', step_type: 'create_record', order_index: 1,
        config: { object_id: 47, fields: { case_number: 'UWC-{{application_number}}', status: 'pending' } },
        on_true_id: null, on_false_id: null },
    ];
    db.uiWorkflow.findUnique.mockResolvedValue(wf(steps));

    const log = await new WorkflowEngineService(db).manualRun(1, { id: 100 });

    expect(db.record.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ object_id: 47 }),
    }));
    const written = db.recordFieldValue.upsert.mock.calls.map(c => c[0].create);
    expect(written).toEqual(expect.arrayContaining([
      expect.objectContaining({ record_id: 500, field_name: 'case_number', str_value: 'UWC-APP-7' }),
      expect.objectContaining({ record_id: 500, field_name: 'status', str_value: 'pending' }),
    ]));
    expect(log[0].result).toMatch(/created record #500/);
  });

  it('splits CRM columns from overflow fields when the target has a CRM table', async () => {
    const db = makeDb({ record: eavRecord([]) });
    db.uiObject.findUnique.mockResolvedValue({ name: 'prospect' });
    const steps = [
      { id: 1, name: 'Create prospect', step_type: 'create_record', order_index: 1,
        config: { object_id: 41, fields: { first_name: 'Ada', last_name: 'Lovelace', preferred_product: 'term_life' } },
        on_true_id: null, on_false_id: null },
    ];
    db.uiWorkflow.findUnique.mockResolvedValue(wf(steps));

    await new WorkflowEngineService(db).manualRun(1, { id: 100 });

    // first_name / last_name are crm_leads columns…
    expect(db.crmLead.create).toHaveBeenCalledWith({
      data: { first_name: 'Ada', last_name: 'Lovelace', record_id: 500 },
    });
    // …preferred_product is not, so it lands in EAV instead of being dropped.
    expect(db.recordFieldValue.upsert).toHaveBeenCalledWith(expect.objectContaining({
      create: expect.objectContaining({ field_name: 'preferred_product', str_value: 'term_life' }),
    }));
  });
});

describe('WorkflowEngineService — scheduled per-record sweeps', () => {
  const sweepSteps = [
    { id: 1, name: 'Gate', step_type: 'condition', order_index: 1,
      config: { field: 'status', operator: 'eq', value: 'active' }, on_true_id: null, on_false_id: null },
    { id: 2, name: 'Notify', step_type: 'notification', order_index: 2,
      config: { field: 'assigned_to', title: 'Renewal due' }, on_true_id: null, on_false_id: null },
  ];

  it('runs the workflow once per live record when per_record is set', async () => {
    const db = makeDb({
      records: [{ id: 100, object_id: 45 }, { id: 101, object_id: 45 }, { id: 102, object_id: 45 }],
      record:  eavRecord([{ field_name: 'status', str_value: 'active', num_value: null, bool_value: null, date_value: null, json_value: null }]),
    });
    db.uiWorkflow.findMany.mockResolvedValue([
      wf(sweepSteps, { trigger_type: 'scheduled', tenant_id: 4, trigger_config: { interval_minutes: 1440, per_record: true } }),
    ]);

    await new WorkflowEngineService(db).runScheduled();
    await flush();

    expect(db.record.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { object_id: 45, deleted_at: null },
    }));
    expect(db.notification.createMany).toHaveBeenCalledTimes(3);
  });

  it('caps a sweep at trigger_config.limit', async () => {
    const db = makeDb({ records: [], record: eavRecord([]) });
    db.uiWorkflow.findMany.mockResolvedValue([
      wf(sweepSteps, { trigger_type: 'scheduled', tenant_id: 4, trigger_config: { interval_minutes: 1440, per_record: true, limit: 25 } }),
    ]);

    await new WorkflowEngineService(db).runScheduled();
    await flush();
    expect(db.record.findMany).toHaveBeenCalledWith(expect.objectContaining({ take: 25 }));
  });

  it('runs once with no record context when per_record is not set', async () => {
    const db = makeDb({ record: null });
    db.uiWorkflow.findMany.mockResolvedValue([
      wf([{ id: 1, name: 'Broadcast', step_type: 'notification', order_index: 1,
        config: { role: 'manager', title: 'Digest' }, on_true_id: null, on_false_id: null }],
      { trigger_type: 'scheduled', tenant_id: 4, trigger_config: { interval_minutes: 1440 } }),
    ]);

    await new WorkflowEngineService(db).runScheduled();
    await flush();
    expect(db.record.findMany).not.toHaveBeenCalled();
  });
});

describe('WorkflowEngineService — CRM objects without an entity row', () => {
  it('reports a no-op instead of shadow-writing a CRM column into EAV', async () => {
    // A lead_intake record created without CRM data has no crm_lead_intake row.
    // lead_status is a real column there, so writing it to EAV would create a
    // shadow value that the API's CRM-wins hydration would then mask.
    const db = makeDb({
      record: {
        id: 100, object_id: 40, object: { name: 'lead_intake' },
        assigned_to: null, created_by: 'USR001', pipeline_stage_id: null, field_values: [],
        crm_lead: null, crm_lead_intake: null, crm_contact: null,
        crm_account: null, crm_opportunity: null, crm_case: null,
      },
    });
    const steps = [
      { id: 1, name: 'Normalise status', step_type: 'action', order_index: 1,
        config: { field: 'lead_status', value: 'new' }, on_true_id: null, on_false_id: null },
    ];
    db.uiWorkflow.findUnique.mockResolvedValue(wf(steps, { object_id: 40 }));

    const log = await new WorkflowEngineService(db).manualRun(1, { id: 100 });

    expect(db.recordFieldValue.upsert).not.toHaveBeenCalled();
    expect(log[0].result).toMatch(/could not resolve storage/);
  });

  it('still routes a genuine overflow field to EAV on a CRM-backed object', async () => {
    const db = makeDb({
      record: {
        id: 100, object_id: 41, object: { name: 'prospect' },
        assigned_to: null, created_by: 'USR001', pipeline_stage_id: null, field_values: [],
        crm_lead: { id: 9 }, crm_lead_intake: null, crm_contact: null,
        crm_account: null, crm_opportunity: null, crm_case: null,
      },
    });
    const steps = [
      { id: 1, name: 'Set preferred product', step_type: 'action', order_index: 1,
        config: { field: 'preferred_product', value: 'term_life' }, on_true_id: null, on_false_id: null },
    ];
    db.uiWorkflow.findUnique.mockResolvedValue(wf(steps, { object_id: 41 }));

    await new WorkflowEngineService(db).manualRun(1, { id: 100 });

    expect(db.crmLead.update).not.toHaveBeenCalled();
    expect(db.recordFieldValue.upsert).toHaveBeenCalledWith(expect.objectContaining({
      create: expect.objectContaining({ field_name: 'preferred_product', str_value: 'term_life' }),
    }));
  });
});
