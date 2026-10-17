'use strict';

/**
 * WorkflowEngineService — condition evaluation and step-type routing tests.
 * Uses manualRun() with a mocked DB; no real DB needed.
 */

const WorkflowEngineService = require('../src/services/workflow.service');

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Build a mock Prisma for workflow execution.
 * Steps are embedded in the workflow row (included via Prisma relation).
 * crmFields — optional key-value map of CRM entity fields to expose for
 *             condition/action testing (returned from record.findUnique).
 */
function makePrisma(workflow, crmFields = {}) {
  const hasCrm = Object.keys(crmFields).length > 0;
  const mockRecord = hasCrm
    ? {
        id: 100,
        object_id:       1,
        object:          { name: 'lead' },
        assigned_to:     null,
        created_by:      'E001',
        field_values:    [],
        crm_lead:        { id: 1, record_id: 100, ...crmFields },
        crm_lead_intake: null,
        crm_contact:     null,
        crm_account:     null,
        crm_opportunity: null,
        crm_case:        null,
      }
    : null;
  return {
    uiWorkflow: {
      findUnique: jest.fn().mockResolvedValue(workflow ?? null),
      update:     jest.fn().mockResolvedValue({}),
    },
    notification: {
      createMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    record: {
      update:     jest.fn().mockResolvedValue({}),
      findUnique: jest.fn().mockResolvedValue(mockRecord),
    },
    crmLead: {
      update: jest.fn().mockResolvedValue({}),
    },
    // Typed EAV store — where fields that are not first-class CRM columns land.
    recordFieldValue: {
      upsert:   jest.fn().mockResolvedValue({}),
      findMany: jest.fn().mockResolvedValue([]),
    },
    uiField: {
      findFirst: jest.fn().mockResolvedValue(null),
    },
    uiObject: {
      findUnique: jest.fn().mockResolvedValue({ name: 'lead' }),
    },
    employee: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    workflowPendingStep: {
      create: jest.fn().mockResolvedValue({ id: 999 }),
    },
  };
}

function makeWorkflow(steps = []) {
  return {
    id: 1, name: 'Test WF', trigger_type: 'on_create',
    object_id: 1, is_active: true,
    steps,
  };
}

function makeRecord() {
  return { id: 100, object_id: 1, created_by: 'E001', assigned_to: null };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('WorkflowEngineService.manualRun', () => {
  it('throws when workflow is not found', async () => {
    const db  = makePrisma(null);
    const svc = new WorkflowEngineService(db);
    await expect(svc.manualRun(999)).rejects.toThrow();
  });

  it('executes a notification step and calls notification.createMany', async () => {
    const step = {
      id: 10, name: 'Notify', step_type: 'notification', order_index: 1,
      config: { employee_id: 'E002', title: 'Hello', message: 'Record created' },
      on_true_id: null, on_false_id: null,
    };
    const db  = makePrisma(makeWorkflow([step]));
    const svc = new WorkflowEngineService(db);
    const log = await svc.manualRun(1, makeRecord(), 'E001');
    expect(db.notification.createMany).toHaveBeenCalled();
    expect(log[0].type).toBe('notification');
  });

  it('condition resolves false → on_false_id taken, on_true chain skipped', async () => {
    // CRM lead has status = 'closed'
    const condStep = {
      id: 10, name: 'Check status', step_type: 'condition', order_index: 1,
      config: { field: 'lead_status', operator: 'eq', value: 'open' },
      on_true_id: 20, on_false_id: null,
    };
    const notifyStep = {
      id: 20, name: 'Notify open', step_type: 'notification', order_index: 2,
      config: { employee_id: 'E002', message: 'Status is open' },
      on_true_id: null, on_false_id: null,
    };
    // CRM entity has lead_status='contacted' (not 'open' → condition false)
    const db = makePrisma(makeWorkflow([condStep, notifyStep]), { lead_status: 'contacted' });
    const svc = new WorkflowEngineService(db);
    await svc.manualRun(1, makeRecord(), 'E001');
    // Condition was false → on_false_id=null → chain stopped, notification never ran
    expect(db.notification.createMany).not.toHaveBeenCalled();
  });

  it('condition resolves true → on_true_id taken, notification runs', async () => {
    const condStep = {
      id: 10, name: 'Check status', step_type: 'condition', order_index: 1,
      config: { field: 'lead_status', operator: 'eq', value: 'new' },
      on_true_id: 20, on_false_id: null,
    };
    const notifyStep = {
      id: 20, name: 'Notify open', step_type: 'notification', order_index: 2,
      config: { employee_id: 'E002', message: 'Status is new' },
      on_true_id: null, on_false_id: null,
    };
    // CRM entity has lead_status='new' → condition true
    const db  = makePrisma(makeWorkflow([condStep, notifyStep]), { lead_status: 'new' });
    const svc = new WorkflowEngineService(db);
    await svc.manualRun(1, makeRecord(), 'E001');
    expect(db.notification.createMany).toHaveBeenCalled();
  });

  it('delay step persists a pending step and halts execution (downstream steps do not run synchronously)', async () => {
    const record = makeRecord({});
    const delayStep = {
      id: 10, name: 'Wait 5m', step_type: 'delay', order_index: 1,
      workflow_id: 1,
      config: { duration: 5, unit: 'minutes' },
      on_true_id: 20, on_false_id: null,
    };
    const notifyStep = {
      id: 20, name: 'After delay', step_type: 'notification', order_index: 2,
      config: { employee_id: 'E002', message: 'After delay' },
      on_true_id: null, on_false_id: null,
    };
    const db  = makePrisma(makeWorkflow([delayStep, notifyStep]));
    const svc = new WorkflowEngineService(db);
    const log = await svc.manualRun(1, record, 'E001');
    // Engine persists a WorkflowPendingStep row and halts; scheduler resumes later
    expect(db.workflowPendingStep.create).toHaveBeenCalled();
    // Downstream notification must NOT run synchronously
    expect(db.notification.createMany).not.toHaveBeenCalled();
    // Log entry should describe the pause, not "skipped delay"
    expect(log[0].result).toMatch(/paused|pending/);
  });

  it('action step updates record field via DB', async () => {
    const actionStep = {
      id: 10, name: 'Set status', step_type: 'action', order_index: 1,
      config: { field: 'lead_status', value: 'contacted' },
      on_true_id: null, on_false_id: null,
    };
    // CRM entity exists so #updateCrmField can update it
    const db  = makePrisma(makeWorkflow([actionStep]), { lead_status: 'new' });
    const svc = new WorkflowEngineService(db);
    await svc.manualRun(1, makeRecord(), 'E001');
    // Should update the CRM lead table, NOT records.data
    expect(db.crmLead.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ lead_status: 'contacted' }) })
    );
    expect(db.record.update).not.toHaveBeenCalled();
  });
});

// ── Named connections + integration step (workflow ⇄ integration cohesion) ────

describe('WorkflowEngineService integration cohesion', () => {
  it('webhook step referencing a named integration delegates to IntegrationService', async () => {
    const step = {
      id: 10, name: 'Notify Slack', step_type: 'webhook', order_index: 1,
      config: { integration: 'slack-notify', body: { text: 'hi' } },
      on_true_id: null, on_false_id: 99,
    };
    const db  = makePrisma(makeWorkflow([step]), { lead_status: 'new' });
    const svc = new WorkflowEngineService(db);
    const integrationService = { executeByName: jest.fn().mockResolvedValue({ id: 55 }) };
    svc.setIntegrationService(integrationService);

    const log = await svc.manualRun(1, makeRecord(), 'E001');
    expect(integrationService.executeByName).toHaveBeenCalledWith('slack-notify', expect.any(Object));
    expect(log[0].result).toMatch(/integration 'slack-notify'/);
  });

  it('integration step publishes a custom domain event on the bus', async () => {
    const step = {
      id: 10, name: 'Emit qualified', step_type: 'integration', order_index: 1,
      config: { event: 'lead.qualified', data: { stage: 'hot' } },
      on_true_id: null, on_false_id: null,
    };
    const db  = makePrisma(makeWorkflow([step]), { lead_status: 'new' });
    const eventBus = { subscribe: jest.fn(), publish: jest.fn().mockResolvedValue() };
    const svc = new WorkflowEngineService(db, { eventBus });
    const log = await svc.manualRun(1, makeRecord(), 'E001');
    expect(eventBus.publish).toHaveBeenCalledWith('lead.qualified', expect.objectContaining({ actorId: 'E001' }));
    expect(log[0].result).toMatch(/published event 'lead.qualified'/);
  });

  it('integration step writes enrichment response back onto record fields (field_map)', async () => {
    const step = {
      id: 10, name: 'Enrich', step_type: 'integration', order_index: 1,
      config: { integration: 'clearbit', field_map: { industry: 'data.industry' } },
      on_true_id: null, on_false_id: 99,
    };
    const db  = makePrisma(makeWorkflow([step]), { lead_status: 'new' });
    const svc = new WorkflowEngineService(db);
    // executeByName returns a log whose response_body carries the provider data
    const integrationService = {
      executeByName: jest.fn().mockResolvedValue({ id: 7, response_body: { data: { industry: 'SaaS' } } }),
    };
    svc.setIntegrationService(integrationService);

    await svc.manualRun(1, makeRecord(), 'E001');
    // `industry` IS a crm_leads column, so it is written to the CRM entity
    expect(db.crmLead.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ industry: 'SaaS' }) })
    );
  });

  it('field_map enrichment routes a non-CRM column to the typed EAV store', async () => {
    const step = {
      id: 10, name: 'Enrich', step_type: 'integration', order_index: 1,
      config: { integration: 'clearbit', field_map: { company_size: 'data.employees' } },
      on_true_id: null, on_false_id: 99,
    };
    const db  = makePrisma(makeWorkflow([step]), { lead_status: 'new' });
    const svc = new WorkflowEngineService(db);
    svc.setIntegrationService({
      executeByName: jest.fn().mockResolvedValue({ id: 7, response_body: { data: { employees: 250 } } }),
    });

    await svc.manualRun(1, makeRecord(), 'E001');
    // company_size is not a crm_leads column — it must not be written there…
    expect(db.crmLead.update).not.toHaveBeenCalled();
    // …it lands in record_field_values instead of being silently dropped.
    expect(db.recordFieldValue.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { record_id_field_name: { record_id: 100, field_name: 'company_size' } },
      })
    );
  });

  it('webhook step routes an ad-hoc URL through IntegrationService.deliver', async () => {
    const step = {
      id: 10, name: 'Ad-hoc', step_type: 'webhook', order_index: 1,
      config: { url: 'https://hooks.example.com/x', body: { a: 1 } },
      on_true_id: null, on_false_id: 99,
    };
    const db  = makePrisma(makeWorkflow([step]), { lead_status: 'new' });
    const svc = new WorkflowEngineService(db);
    const integrationService = { deliver: jest.fn().mockResolvedValue({ status: 200 }) };
    svc.setIntegrationService(integrationService);

    const log = await svc.manualRun(1, makeRecord(), 'E001');
    expect(integrationService.deliver).toHaveBeenCalledWith(expect.objectContaining({ url: 'https://hooks.example.com/x' }));
    expect(log[0].result).toMatch(/HTTP 200/);
  });
});

// ── Linear multi-step flows (the shape the Workflow Builder produces) ────────
describe('WorkflowEngineService — linear step chaining (no on_*_id links)', () => {
  it('executes EVERY step in order_index order when no branch links are set', async () => {
    // This is exactly what the UI builds: a linear trigger→action→notification
    // with on_true_id/on_false_id all null. Regression for the bug where only
    // the first step ran.
    const steps = [
      { id: 1, name: 'Trigger',     step_type: 'trigger',      order_index: 1, config: {}, on_true_id: null, on_false_id: null },
      { id: 2, name: 'Set status',  step_type: 'action',       order_index: 2, config: { field: 'lead_status', value: 'qualified' }, on_true_id: null, on_false_id: null },
      { id: 3, name: 'Notify',      step_type: 'notification', order_index: 3, config: { employee_id: 'E002', message: 'done' }, on_true_id: null, on_false_id: null },
    ];
    const db  = makePrisma(makeWorkflow(steps), { lead_status: 'new' });
    const svc = new WorkflowEngineService(db);
    const log = await svc.manualRun(1, makeRecord(), 'E001');

    expect(db.crmLead.update).toHaveBeenCalled();        // action step ran
    expect(db.notification.createMany).toHaveBeenCalled(); // notification step ran after it
    expect(log).toHaveLength(3);                          // all three steps executed
  });

  it('a throwing step is logged but does NOT abort the remaining steps', async () => {
    const steps = [
      { id: 1, name: 'Trigger', step_type: 'trigger',      order_index: 1, config: {}, on_true_id: null, on_false_id: null },
      { id: 2, name: 'Bad',     step_type: 'notification', order_index: 2, config: { employee_id: 'E002', message: 'x' }, on_true_id: null, on_false_id: null },
      { id: 3, name: 'Action',  step_type: 'action',       order_index: 3, config: { field: 'lead_status', value: 'qualified' }, on_true_id: null, on_false_id: null },
    ];
    const db  = makePrisma(makeWorkflow(steps), { lead_status: 'new' });
    db.notification.createMany.mockRejectedValue(new Error('FK violation'));
    const svc = new WorkflowEngineService(db);
    const log = await svc.manualRun(1, makeRecord(), 'E001');

    const badEntry = log.find(l => l.step === 2);
    expect(badEntry.error).toBeTruthy();          // the failure was captured
    expect(db.crmLead.update).toHaveBeenCalled();  // the step AFTER the failure still ran
    expect(log).toHaveLength(3);
  });

  it('blocks an integration step from publishing a reserved record.* event (loop guard)', async () => {
    const steps = [
      { id: 1, name: 'Trigger',     step_type: 'trigger',     order_index: 1, config: {}, on_true_id: null, on_false_id: null },
      { id: 2, name: 'Loop danger', step_type: 'integration', order_index: 2, config: { event: 'record.updated' }, on_true_id: null, on_false_id: null },
    ];
    const db  = makePrisma(makeWorkflow(steps), { lead_status: 'new' });
    const svc = new WorkflowEngineService(db);
    const publish = jest.fn().mockResolvedValue();
    svc.setEventBus({ subscribe: jest.fn(), publish });

    const log = await svc.manualRun(1, makeRecord(), 'E001');
    expect(publish).not.toHaveBeenCalled();               // reserved event never published
    expect(log.find(l => l.step === 2).error).toBe('reserved-event');
  });
});


describe('WorkflowEngineService — send_sms', () => {
  const smsStep = (config) => ({ id: 11, name: 'Text', step_type: 'send_sms', order_index: 1, config, on_true_id: null, on_false_id: null });
  const run = async (config, fields) => {
    const svc = new WorkflowEngineService(makePrisma(makeWorkflow([smsStep(config)]), fields));
    const integrationService = { executeByName: jest.fn().mockResolvedValue({ id: 3 }) };
    svc.setIntegrationService(integrationService);
    await svc.manualRun(1, makeRecord(), 'E001');
    return integrationService.executeByName;
  };

  it('sends the message in the record language through the named integration', async () => {
    const call = await run(
      { integration: 'genesis_sms', message: 'Hi {{first_name}}', message_fr: 'Bonjour {{first_name}}', to_field: 'phone', language_field: 'lead_source' },
      { first_name: 'Anne', phone: '+23057000000', lead_source: 'fr' },
    );
    expect(call).toHaveBeenCalledWith('genesis_sms', expect.objectContaining({ to: '+23057000000', message: 'Bonjour Anne' }));
  });

  it('skips when the suppression field is set or there is no number', async () => {
    expect(await run({ integration: 'genesis_sms', message: 'x', to_field: 'phone', suppress_field: 'is_converted' }, { phone: '+2305', is_converted: true })).not.toHaveBeenCalled();
    expect(await run({ integration: 'genesis_sms', message: 'x', to_field: 'phone' }, { first_name: 'A' })).not.toHaveBeenCalled();
  });
});

describe('WorkflowEngineService — durable retry (E-03)', () => {
  it('queues a failed integration call for retry, but not a configuration error', async () => {
    const step = { id: 12, name: 'Screen', step_type: 'integration', order_index: 1, config: { integration: 'genesis_screening', field_map: { hits: 'hits' } }, on_true_id: null, on_false_id: null };
    for (const [message, queued] of [['ECONNRESET', true], ["Integration 'genesis_screening' not found", false]]) {
      const svc = new WorkflowEngineService(makePrisma(makeWorkflow([step]), { first_name: 'A' }));
      svc.setIntegrationService({ executeByName: jest.fn().mockRejectedValue(new Error(message)) });
      const jobQueue = { enqueue: jest.fn().mockResolvedValue({ id: 5 }) };
      svc.setJobQueue(jobQueue);
      await svc.manualRun(1, makeRecord(), 'E001');
      if (queued) {
        expect(jobQueue.enqueue).toHaveBeenCalledWith('integration.call',
          expect.objectContaining({ integration: 'genesis_screening', record_id: 100, field_map: { hits: 'hits' } }),
          expect.objectContaining({ dedupeKey: 'wfstep:12:100' }));
      } else {
        expect(jobQueue.enqueue).not.toHaveBeenCalled();
      }
    }
  });
});

describe('email_list step — a publication to the subscribers of its topic', () => {
  const step = { id: 21, name: 'Email the subscribers', step_type: 'email_list', order_index: 1, on_true_id: null, on_false_id: null, config: {
    template: 'research_publication', list_object: 'subscription', link_field: 'party',
    match: { topic: '{{publication_type}}' }, active: { status: 'subscribed' },
    language_field: 'preferred_language', suppress_field: 'marketing_suppressed', track_field: 'opens',
  } };
  // Subscriptions: 501/502 weekly + subscribed (party 1 twice), 503 unsubscribed, 504 another topic.
  const SUBS = [
    [501, { topic: 'weekly_highlights', status: 'subscribed', party: '1' }],
    [502, { topic: 'weekly_highlights', status: 'subscribed', party: '1' }],
    [503, { topic: 'weekly_highlights', status: 'unsubscribed', party: '2' }],
    [504, { topic: 'research', status: 'subscribed', party: '3' }],
    [505, { topic: 'weekly_highlights', status: 'subscribed', party: '4' }],
    [506, { topic: 'weekly_highlights', status: 'subscribed', party: '5' }],
  ];
  const PEOPLE = {
    1: { email: 'anne@example.mu', first_name: 'Anne', preferred_language: 'fr', marketing_suppressed: false },
    4: { email: 'raj@example.mu', first_name: 'Raj', preferred_language: 'en', marketing_suppressed: true },
    5: { first_name: 'No Email', marketing_suppressed: false },
  };

  async function run() {
    const db = makePrisma(makeWorkflow([step]), { publication_type: 'weekly_highlights', title: 'Weekly market highlights' });
    db.uiObject.findFirst = jest.fn().mockResolvedValue({ id: 9 });
    db.emailTemplate = { findMany: jest.fn().mockResolvedValue([{ id: 5, name: 'research_publication' }, { id: 6, name: 'research_publication_fr' }]) };
    db.recordFieldValue.findMany = jest.fn(async ({ where }) => {
      if (where.record?.object_id === 9) return SUBS.flatMap(([id, row]) => Object.entries(row).map(([field_name, str_value]) => ({ record_id: id, field_name, str_value })));
      if (where.record_id?.in) return where.record_id.in.flatMap((pid) => Object.entries(PEOPLE[pid] ?? {}).map(([field_name, v]) => ({ record_id: pid, field_name, ...(typeof v === 'boolean' ? { bool_value: v } : { str_value: v }) })));
      return [];
    });
    const svc = new WorkflowEngineService(db);
    svc.emailSender = { sendWithTemplate: jest.fn().mockResolvedValue({ id: 1, status: 'sent' }) };
    await svc.manualRun(1, { ...makeRecord(), tenant_id: 7 }, 'GCMKT1');
    return svc.emailSender.sendWithTemplate;
  }

  it('emails each matching, consenting subscriber once, in their language, with open tracking', async () => {
    const send = await run();
    expect(send).toHaveBeenCalledTimes(1);
    const mail = send.mock.calls[0][0];
    expect(mail).toMatchObject({ template_id: 6, to_email: 'anne@example.mu', related_record_id: 100, related_type: 'distribution:opens' });
    expect(mail.variables).toMatchObject({ first_name: 'Anne', title: 'Weekly market highlights' });
    expect(mail.append_html).toMatch(/\/api\/public\/email-open\/geo1\..+\.gif/);
  });

  it('tells the user how many were emailed and skipped, and keeps it on the record timeline', async () => {
    const db = makePrisma(makeWorkflow([step]), { publication_type: 'weekly_highlights', title: 'Weekly market highlights' });
    db.uiObject.findFirst = jest.fn().mockResolvedValue({ id: 9 });
    db.emailTemplate = { findMany: jest.fn().mockResolvedValue([{ id: 5, name: 'research_publication' }]) };
    db.recordFieldValue.findMany = jest.fn(async ({ where }) => {
      if (where.record?.object_id === 9) return SUBS.flatMap(([id, row]) => Object.entries(row).map(([field_name, str_value]) => ({ record_id: id, field_name, str_value })));
      if (where.record_id?.in) return where.record_id.in.flatMap((pid) => Object.entries(PEOPLE[pid] ?? {}).map(([field_name, v]) => ({ record_id: pid, field_name, ...(typeof v === 'boolean' ? { bool_value: v } : { str_value: v }) })));
      return [];
    });
    db.activity = { create: jest.fn().mockResolvedValue({ id: 1 }) };
    db.emailLog = { count: jest.fn().mockResolvedValue(0) };
    db.recordFieldValue.upsert = jest.fn().mockResolvedValue({});
    const svc = new WorkflowEngineService(db);
    svc.emailSender = { sendWithTemplate: jest.fn().mockResolvedValue({ id: 1, status: 'sent' }) };
    const log = await svc.manualRun(1, { ...makeRecord(), tenant_id: 7 }, 'GCTRD1');
    expect(db.recordFieldValue.upsert).toHaveBeenCalledWith(expect.objectContaining({ create: expect.objectContaining({ field_name: 'opens', num_value: 0, tenant_id: 7 }) }));
    const entry = log.find((l) => l.type === 'email_list');
    expect(entry.summary).toBe('Emailed to 1 subscriber — 2 skipped (no email address or no marketing consent).');
    expect(db.activity.create).toHaveBeenCalledWith({ data: expect.objectContaining({ record_id: 100, employee_id: 'GCTRD1', type: 'email', subject: 'Sent to 1 subscriber' }) });
  });
});

describe('email open tracking', () => {
  const tracking = require('../src/services/email-tracking');
  it('stamps the recipient\'s email as opened once and counts opens on the record', async () => {
    const token = tracking.signOpen({ tenantId: 7, recordId: 100, email: 'Anne@Example.mu', field: 'opens' });
    const p = tracking.verifyOpen(token);
    expect(p).toMatchObject({ t: 7, r: 100, f: 'opens' });
    expect(tracking.verifyOpen(token.replace(/.$/, 'x'))).toBeNull();
    const db = {
      emailLog: {
        findMany: jest.fn().mockResolvedValue([{ id: 1, to_email: 'raj@example.mu' }, { id: 2, to_email: 'anne@example.mu' }]),
        update: jest.fn().mockResolvedValue({}),
        count: jest.fn().mockResolvedValue(3),
      },
      recordFieldValue: { upsert: jest.fn().mockResolvedValue({}) },
    };
    expect(await tracking.recordOpen(db, p)).toBe(true);
    expect(db.emailLog.update).toHaveBeenCalledWith({ where: { id: 2 }, data: { opened_at: expect.any(Date) } });
    expect(db.recordFieldValue.upsert).toHaveBeenCalledWith(expect.objectContaining({ update: { num_value: 3 } }));
  });
});

describe('send_email step — the email shows on the record timeline', () => {
  it('sends the template and logs an email activity on the record', async () => {
    const step = { id: 31, name: 'Acknowledge', step_type: 'send_email', order_index: 1, on_true_id: null, on_false_id: null,
      config: { template: 'complaint_ack', to_field: 'party_email' } };
    const db = makePrisma(makeWorkflow([step]), { party_email: 'anne@example.mu' });
    db.emailTemplate = { findMany: jest.fn().mockResolvedValue([{ id: 8, name: 'complaint_ack' }]) };
    db.activity = { create: jest.fn().mockResolvedValue({ id: 1 }) };
    const svc = new WorkflowEngineService(db);
    svc.emailSender = { sendWithTemplate: jest.fn().mockResolvedValue({ id: 1, status: 'sent', subject: 'We received your complaint' }) };
    await svc.manualRun(1, makeRecord(), 'GCRM1');
    expect(svc.emailSender.sendWithTemplate).toHaveBeenCalledWith(expect.objectContaining({ template_id: 8, to_email: 'anne@example.mu', related_record_id: 100 }));
    expect(db.activity.create).toHaveBeenCalledWith({ data: expect.objectContaining({
      record_id: 100, employee_id: 'GCRM1', type: 'email', subject: 'Email sent: We received your complaint',
    }) });
  });
});

describe('send_email step — amounts and dates as people read them', () => {
  it('formats currency fields and dates from the field metadata and workspace settings', async () => {
    const step = { id: 32, name: 'Offer', step_type: 'send_email', order_index: 1, on_true_id: null, on_false_id: null,
      config: { template: 'loan_offer', to_field: 'party_email' } };
    const db = makePrisma(makeWorkflow([step]), { party_email: 'anne@example.mu', loan_amount_mur: 39834.26, value_date: new Date('2026-10-17T00:00:00Z'), product_code: 'LND-RE' });
    db.uiField.findMany = jest.fn().mockResolvedValue([
      { name: 'loan_amount_mur', field_type: 'formula', config: { format: 'currency', precision: 2 } },
      { name: 'value_date', field_type: 'date', config: {} },
    ]);
    db.tenantConfig = { findUnique: jest.fn().mockResolvedValue({ config_value: 'DD/MM/YYYY' }) };
    db.emailTemplate = { findMany: jest.fn().mockResolvedValue([{ id: 9, name: 'loan_offer' }]) };
    db.activity = { create: jest.fn().mockResolvedValue({ id: 1 }) };
    const svc = new WorkflowEngineService(db);
    svc.emailSender = { sendWithTemplate: jest.fn().mockResolvedValue({ id: 1, status: 'sent' }) };
    await svc.manualRun(1, { ...makeRecord(), object_id: 5, tenant_id: 7 }, 'GCRM1');
    const { variables } = svc.emailSender.sendWithTemplate.mock.calls[0][0];
    expect(variables.loan_amount_mur).toBe('39,834.26');
    expect(variables.value_date).toBe('17/10/2026');
    expect(variables.product_code).toBe('LND-RE');
  });
});

describe('approval and notification text — what people read', () => {
  it('shows picklist labels and formatted amounts, not stored codes', async () => {
    const step = {
      id: 10, name: 'Notify', step_type: 'notification', order_index: 1,
      config: { employee_id: 'E002', title: 'Credit approval', message: 'MUR {{amount}} · Analyst: {{recommendation}} · {{lead_status}}' },
      on_true_id: null, on_false_id: null,
    };
    const db = makePrisma(makeWorkflow([step]), { amount: 4500000, recommendation: 'approve_conditions', lead_status: 'new' });
    db.uiField.findMany = jest.fn().mockResolvedValue([
      { name: 'amount', field_type: 'currency', options: null, config: {} },
      { name: 'recommendation', field_type: 'select', options: [{ value: 'approve', label: 'Approve' }, { value: 'approve_conditions', label: 'Approve with conditions' }], config: {} },
    ]);
    const svc = new WorkflowEngineService(db);
    await svc.manualRun(1, makeRecord(), 'E001');
    const body = db.notification.createMany.mock.calls[0][0].data[0].body;
    expect(body).toBe('MUR 4,500,000 · Analyst: Approve with conditions · new');
  });
});

describe('approvals inbox', () => {
  it('leaves out open requests whose record is in the trash', async () => {
    const pending = (id, record_id) => ({ id, record_id, approval_token: `t${id}`, approval_status: 'pending', created_at: new Date(), actor_id: 'E001', context: { approver_ids: ['E002'], title: `Approve ${record_id}` }, workflow: { label: 'WF', object_id: 1 } });
    const db = {
      workflowPendingStep: { findMany: jest.fn().mockResolvedValue([pending(1, 100), pending(2, 200)]) },
      record: { findMany: jest.fn().mockResolvedValue([{ id: 200 }]) },
      uiObject: { findMany: jest.fn().mockResolvedValue([]) },
      recordFieldValue: { findMany: jest.fn().mockResolvedValue([]) },
      employee: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const svc = new WorkflowEngineService(db);
    const list = await svc.listApprovals('E002');
    expect(list.map((a) => a.title)).toEqual(['Approve 100']);
  });
});

describe('create_reminder — a reminder relative to a date on the record', () => {
  const step = (config) => ({ id: 10, name: 'Remind', step_type: 'create_reminder', order_index: 1, config, on_true_id: null, on_false_id: null });
  const setup = (fields, open = null) => {
    const db = makePrisma(makeWorkflow([step({ title: 'Forward maturity — {{deal_no}}', note: 'Value date {{value_date}}.', date_field: 'value_date', offset_days: -7, priority: 'high' })]), fields);
    db.reminder = { findFirst: jest.fn().mockResolvedValue(open), create: jest.fn(async ({ data }) => ({ id: 77, ...data })) };
    return db;
  };
  const inDays = (n) => new Date(Date.now() + n * 86400e3);

  it('reminds the owner the given number of days before the date', async () => {
    const value = inDays(30);
    const db = setup({ deal_no: 'FXD-2026-000091', value_date: value });
    const svc = new WorkflowEngineService(db);
    const log = await svc.manualRun(1, { ...makeRecord(), assigned_to: 'GCFX1', tenant_id: 7 }, 'GCFX1');
    const data = db.reminder.create.mock.calls[0][0].data;
    expect(data).toMatchObject({ record_id: 100, employee_id: 'GCFX1', title: 'Forward maturity — FXD-2026-000091', priority: 'high', status: 'pending', tenant_id: 7 });
    expect(data.note).toBe(`Value date ${value.toISOString().slice(0, 10)}.`);
    expect(Math.round((value - data.remind_at) / 86400e3)).toBe(7);
    expect(log[0].result).toMatch(/^created reminder #77 for GCFX1/);
  });

  it('sets a reminder that would already be due for now', async () => {
    const db = setup({ deal_no: 'FXD-1', value_date: inDays(3) });
    await new WorkflowEngineService(db).manualRun(1, { ...makeRecord(), assigned_to: 'GCFX1', tenant_id: 7 }, 'GCFX1');
    expect(Math.abs(db.reminder.create.mock.calls[0][0].data.remind_at - Date.now())).toBeLessThan(5000);
  });

  it('does nothing without the date, and never twice', async () => {
    const empty = setup({ deal_no: 'FXD-1' });
    const log = await new WorkflowEngineService(empty).manualRun(1, { ...makeRecord(), assigned_to: 'GCFX1' }, 'GCFX1');
    expect(empty.reminder.create).not.toHaveBeenCalled();
    expect(log[0].result).toBe('no-op (value_date is empty)');
    const dup = setup({ deal_no: 'FXD-1', value_date: inDays(30) }, { id: 5 });
    await new WorkflowEngineService(dup).manualRun(1, { ...makeRecord(), assigned_to: 'GCFX1' }, 'GCFX1');
    expect(dup.reminder.create).not.toHaveBeenCalled();
  });
});
