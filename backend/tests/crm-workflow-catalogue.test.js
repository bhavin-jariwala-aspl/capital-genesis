'use strict';

/**
 * Structural checks on the shipped workflow catalogue.
 *
 * These guard the invariants the engine relies on, which are easy to break by
 * hand-editing a definition: step links must resolve, the branch shape of an
 * approval must terminate, and every field a step reads or writes must be one
 * the engine can actually resolve for that object's storage.
 */

const { WORKFLOWS, SUPPORTING_FIELDS } = require('../prisma/crm-workflows');
const { resolveStorage } = require('../src/services/crm-storage-map');

const STEP_TYPES = new Set([
  'trigger', 'condition', 'action', 'notification', 'delay',
  'approval', 'webhook', 'integration', 'create_record', 'update_related',
]);

const OPERATORS = new Set([
  'eq', '==', 'neq', '!=', 'in', 'nin', 'gt', 'lt', 'gte', 'lte',
  'contains', 'empty', 'notempty',
  'before_today', 'after_today', 'today', 'date_within_days', 'date_overdue',
]);

const ROLES = new Set([
  'platform_admin', 'super_admin', 'admin', 'manager', 'user',
  'uw_manager', 'senior_underwriter', 'underwriter',
]);

describe('CRM workflow catalogue — shape', () => {
  it('ships a workflow for every stage of the CRM lifecycle', () => {
    const objects = new Set(WORKFLOWS.map(w => w.object));
    // lead capture → qualification → quoting → application/underwriting →
    // policy servicing → claims → commissions → data quality
    ['lead_intake', 'prospect', 'quote', 'application', 'underwriting_case',
      'policy', 'claim', 'commission', 'client'].forEach(o => {
      expect(objects).toContain(o);
    });
  });

  it('uses unique workflow names', () => {
    const names = WORKFLOWS.map(w => w.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it('names the benchmark platform pattern for every workflow', () => {
    for (const wf of WORKFLOWS) {
      expect(typeof wf.benchmark).toBe('string');
      expect(wf.benchmark.length).toBeGreaterThan(20);
    }
  });

  it('uses only trigger types the engine dispatches', () => {
    const valid = new Set(['on_create', 'on_update', 'on_delete', 'field_changed', 'scheduled', 'manual']);
    for (const wf of WORKFLOWS) expect(valid.has(wf.trigger_type)).toBe(true);
  });

  it('gives every scheduled workflow an interval', () => {
    for (const wf of WORKFLOWS.filter(w => w.trigger_type === 'scheduled')) {
      expect(Number(wf.trigger_config?.interval_minutes)).toBeGreaterThan(0);
    }
  });

  it('runs every scheduled workflow per record, since its steps read record fields', () => {
    // A scheduled workflow without per_record executes once with no record, so
    // its condition steps would see an empty field map and always halt.
    for (const wf of WORKFLOWS.filter(w => w.trigger_type === 'scheduled')) {
      const readsFields = wf.steps.some(s => ['condition', 'action'].includes(s.step_type));
      if (readsFields) expect(wf.trigger_config.per_record).toBe(true);
    }
  });
});

describe('CRM workflow catalogue — steps', () => {
  it('starts every workflow with a trigger step', () => {
    for (const wf of WORKFLOWS) expect(wf.steps[0].step_type).toBe('trigger');
  });

  it('uses only step types the engine implements', () => {
    for (const wf of WORKFLOWS) {
      for (const s of wf.steps) expect(STEP_TYPES.has(s.step_type)).toBe(true);
    }
  });

  it('resolves every on_true / on_false link to a step in the same workflow', () => {
    for (const wf of WORKFLOWS) {
      const keys = new Set(wf.steps.map(s => s.key));
      expect(keys.size).toBe(wf.steps.length); // no duplicate keys
      for (const s of wf.steps) {
        if (s.on_true)  expect(keys.has(s.on_true)).toBe(true);
        if (s.on_false) expect(keys.has(s.on_false)).toBe(true);
      }
    }
  });

  it('gives every condition step a field and a supported operator', () => {
    for (const wf of WORKFLOWS) {
      for (const s of wf.steps.filter(x => x.step_type === 'condition')) {
        expect(typeof s.config.field).toBe('string');
        expect(OPERATORS.has(s.config.operator)).toBe(true);
        // Value-taking operators must actually carry a value.
        if (!['empty', 'notempty', 'date_overdue', 'before_today', 'after_today', 'today'].includes(s.config.operator)) {
          expect(s.config.value).toBeDefined();
        }
      }
    }
  });

  it('gives every action step a field and a value', () => {
    for (const wf of WORKFLOWS) {
      for (const s of wf.steps.filter(x => x.step_type === 'action')) {
        expect(typeof s.config.field).toBe('string');
        expect(s.config.value).toBeDefined();
      }
    }
  });

  it('addresses every notification and approval to a resolvable recipient', () => {
    for (const wf of WORKFLOWS) {
      for (const s of wf.steps.filter(x => ['notification', 'approval'].includes(x.step_type))) {
        const { role, field, employee_id, notify_actor } = s.config;
        expect(Boolean(role || field || employee_id || notify_actor)).toBe(true);
        if (role) expect(ROLES.has(role)).toBe(true);
        expect(typeof s.config.title).toBe('string');
      }
    }
  });

  it('gives every delay step a positive duration in a supported unit', () => {
    for (const wf of WORKFLOWS) {
      for (const s of wf.steps.filter(x => x.step_type === 'delay')) {
        expect(Number(s.config.duration)).toBeGreaterThan(0);
        expect(['minutes', 'hours', 'days']).toContain(s.config.unit);
      }
    }
  });

  it('points every create_record step at a target object in the catalogue', () => {
    const known = new Set(WORKFLOWS.map(w => w.object));
    for (const wf of WORKFLOWS) {
      for (const s of wf.steps.filter(x => x.step_type === 'create_record')) {
        expect(typeof s.config.object).toBe('string');
        expect(known.has(s.config.object)).toBe(true);
        expect(Object.keys(s.config.fields ?? {}).length).toBeGreaterThan(0);
      }
    }
  });
});

describe('CRM workflow catalogue — approval branch termination', () => {
  // The engine falls through to the next step by order_index when a step has no
  // explicit link, so an approval's approved branch would otherwise run the
  // rejected branch's steps too. Each approval workflow must therefore end its
  // approved path with a guard condition that halts.
  it('routes every approval step to both an approved and a rejected step', () => {
    for (const wf of WORKFLOWS) {
      for (const s of wf.steps.filter(x => x.step_type === 'approval')) {
        expect(s.on_true).toBeTruthy();
        expect(s.on_false).toBeTruthy();
      }
    }
  });

  it('places a guard condition at the head of every rejected branch', () => {
    for (const wf of WORKFLOWS) {
      for (const approval of wf.steps.filter(x => x.step_type === 'approval')) {
        const guard = wf.steps.find(x => x.key === approval.on_false);
        expect(guard.step_type).toBe('condition');
        // The guard must re-read the state the approved branch writes, so the
        // approved path halts there instead of falling into the rejection steps.
        const approvedWrites = wf.steps
          .filter(x => x.step_type === 'action')
          .map(x => x.config.field);
        expect(approvedWrites).toContain(guard.config.field);
      }
    }
  });

  it('orders the rejected branch after the approved branch', () => {
    for (const wf of WORKFLOWS) {
      for (const approval of wf.steps.filter(x => x.step_type === 'approval')) {
        const idx = (key) => wf.steps.findIndex(s => s.key === key);
        expect(idx(approval.on_false)).toBeGreaterThan(idx(approval.on_true));
      }
    }
  });
});

describe('CRM workflow catalogue — supporting fields', () => {
  it('declares the approval_status field on every object with an approval workflow', () => {
    const approvalObjects = WORKFLOWS
      .filter(w => w.steps.some(s => s.step_type === 'approval'))
      .map(w => w.object);
    const declared = new Set(SUPPORTING_FIELDS.flatMap(f => f.objects));
    for (const obj of approvalObjects) expect(declared.has(obj)).toBe(true);
  });

  it('only declares fields the engine can write to EAV-backed objects', () => {
    for (const spec of SUPPORTING_FIELDS) {
      for (const obj of spec.objects) {
        // These objects have no first-class CRM table, so the field lands in
        // record_field_values — which is exactly what makes it writable.
        expect(resolveStorage(obj).kind).toBe('eav');
      }
    }
  });
});
