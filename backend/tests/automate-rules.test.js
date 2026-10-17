'use strict';

/**
 * The AUTOMATE section's rules and guard rails.
 *
 * Three separate concerns, each of which previously let an admin save a
 * configuration that looked correct and then did nothing:
 *
 *   1. The shipped lead-scoring defaults — two of which could never match.
 *   2. Workflow trigger/object binding — record triggers are matched by
 *      object, so a workflow without one is inert.
 *   3. SLA policy shape — the reconciler only evaluates the metrics an entity
 *      declares, so a target on any other metric was silently ignored.
 *
 * A silently inert automation is worse than a rejected one: the team believes
 * it is covered. Every assertion here is about refusing, or about making sure
 * the shipped configuration is actually evaluable.
 */

const LeadScoringService = require('../src/services/lead-scoring.service');
const { leadScoreGrade } = require('../src/utils/lead-grade');
const DashboardService = require('../src/services/dashboard.service');
const { assertWorkflowTriggerable, WORKFLOW_TRIGGERS, OBJECT_BOUND_TRIGGERS } = DashboardService;
const slaRoutes = require('../src/routes/sla/index');
const { assertPolicyShape, DEFAULT_POLICIES, ESCALATION_ACTIONS } = slaRoutes;
const SlaService = require('../src/services/sla.service');

// ── The shipped lead-scoring model ──────────────────────────────────────────

/** Capture the default rules without touching a database. */
async function shippedRules() {
  const created = [];
  const svc = new LeadScoringService({});
  svc.createScoringRule = async (data) => { created.push(data); return { id: created.length, ...data }; };
  await svc.setupDefaultRules('ADMIN001', 1);
  return created;
}

/** Operators `#evaluateRule` implements. */
const ENGINE_OPERATORS = new Set([
  'equals', 'not_equals', 'contains', 'not_contains', 'starts_with', 'ends_with',
  'greater_than', 'less_than', 'greater_equal', 'less_equal',
  'is_empty', 'is_not_empty', 'in_list', 'not_in_list',
]);

/** Columns `scoreLead` selects, i.e. the only fields a rule can read. */
const SELECTED_FIELDS = new Set([
  'id', 'first_name', 'last_name', 'email', 'company', 'phone', 'job_title',
  'lead_status', 'lead_source', 'industry', 'annual_revenue', 'rating', 'created_at',
]);

/** Values this product actually stores, from the schema comments and the seed. */
const REAL_VALUES = {
  lead_source: ['web', 'referral', 'partner', 'seminar', 'social_media', 'cold_call'],
  lead_status: ['new', 'contacted', 'qualified', 'unqualified', 'converted'],
  rating:      ['hot', 'warm', 'cold'],
};

describe('the shipped lead-scoring defaults', () => {
  let rules;
  beforeAll(async () => { rules = await shippedRules(); });

  it('ships a model, not an empty list', () => {
    expect(rules.length).toBeGreaterThanOrEqual(8);
  });

  it('only uses operators the engine implements', () => {
    for (const r of rules) expect(ENGINE_OPERATORS.has(r.operator)).toBe(true);
  });

  it('only reads fields the scorer actually selects', () => {
    // A rule on an unselected column reads undefined and scores nothing — the
    // silent failure that is hardest to notice, because the rule looks fine.
    for (const r of rules) expect(SELECTED_FIELDS.has(r.field_name)).toBe(true);
  });

  it('never uses `contains` with a comma-separated list', () => {
    // The regression: "Senior Job Title" tested whether a job title contained
    // the literal string "VP, Director, Chief, President, Owner, Founder".
    // It awarded 20 points to nobody, and looked entirely reasonable in the UI.
    for (const r of rules) {
      if (r.operator === 'contains' || r.operator === 'not_contains') {
        expect(String(r.field_value ?? '')).not.toContain(',');
      }
    }
  });

  it('matches values the product really stores', () => {
    for (const r of rules) {
      const allowed = REAL_VALUES[r.field_name];
      if (!allowed || r.field_value == null) continue;
      const asked = r.operator.endsWith('_list')
        ? String(r.field_value).split(',').map((v) => v.trim())
        : [String(r.field_value)];
      for (const v of asked) expect(allowed).toContain(v);
    }
  });

  it('asks for no value where the operator takes none', () => {
    for (const r of rules) {
      if (['is_empty', 'is_not_empty'].includes(r.operator)) expect(r.field_value).toBeNull();
    }
  });

  it('carries disqualifiers, so the distribution cannot drift upward', () => {
    // A model where every rule adds eventually rates every lead highly, which
    // is how scoring stops meaning anything.
    expect(rules.some((r) => r.points < 0)).toBe(true);
  });

  it('separates who they are, what they did, and whether we can reach them', () => {
    const types = new Set(rules.map((r) => r.rule_type));
    expect(types).toEqual(new Set(['demographic', 'behavioral', 'engagement']));
  });

  it('is domain-appropriate: no B2B firmographics left over', () => {
    // The previous defaults scored a company website and a B2B industry list on
    // what are individual and family life-cover prospects.
    const fields = rules.map((r) => r.field_name);
    expect(fields).not.toContain('website');
    expect(fields).not.toContain('industry');
  });

  it('names and describes every rule, so a breakdown is explainable', () => {
    for (const r of rules) {
      expect(r.name?.length).toBeGreaterThan(3);
      expect(r.description?.length).toBeGreaterThan(20);
    }
  });

  it('produces a usable spread of grades against the shipped bands', () => {
    const score = (predicate) => rules.filter(predicate).reduce((sum, r) => sum + r.points, 0);

    // A referred, contacted, well-off, reachable prospect.
    const strong = score((r) => [
      'High-value prospect', 'Mid-value prospect', 'Employment on file',
      'Referred or introduced', 'Conversation started', 'Reachable by phone', 'Reachable by email',
    ].includes(r.name));

    // A cold-called lead with contact details and nothing else.
    const weak = score((r) => ['Cold outbound', 'Reachable by phone', 'Reachable by email'].includes(r.name));

    expect(leadScoreGrade(strong)).toBe('A');
    expect(['D', 'F']).toContain(leadScoreGrade(weak));
    expect(strong).toBeGreaterThan(weak);
  });
});

// ── Workflow trigger binding ────────────────────────────────────────────────

describe('workflow trigger validation', () => {
  it('knows the six triggers the engine dispatches', () => {
    expect(WORKFLOW_TRIGGERS).toEqual(
      expect.arrayContaining(['on_create', 'on_update', 'on_delete', 'field_changed', 'scheduled', 'manual']),
    );
    expect(WORKFLOW_TRIGGERS).toHaveLength(6);
  });

  it('refuses a record-triggered workflow with no object', () => {
    // `trigger()` queries `where: { object_id, trigger_type, is_active }`, so
    // one with a null object matches no event — ever. The Builder had no object
    // field at all, which made every workflow built there inert on save.
    for (const trigger of OBJECT_BOUND_TRIGGERS) {
      expect(() => assertWorkflowTriggerable({ trigger_type: trigger }))
        .toThrow(/must be bound to an object/);
      expect(() => assertWorkflowTriggerable({ trigger_type: trigger, object_id: 7 })).not.toThrow();
    }
  });

  it('allows scheduled and manual workflows without an object', () => {
    // The scheduler sweeps across objects; a manual run is invoked by id.
    expect(() => assertWorkflowTriggerable({ trigger_type: 'scheduled' })).not.toThrow();
    expect(() => assertWorkflowTriggerable({ trigger_type: 'manual' })).not.toThrow();
  });

  it('rejects a trigger the engine has no branch for', () => {
    expect(() => assertWorkflowTriggerable({ trigger_type: 'on_monday', object_id: 1 }))
      .toThrow(/trigger_type must be one of/);
  });

  it('treats 0 and an empty string as no object', () => {
    for (const object_id of [0, '', null, undefined]) {
      expect(() => assertWorkflowTriggerable({ trigger_type: 'on_create', object_id })).toThrow();
    }
  });
});

// ── SLA policy shape ────────────────────────────────────────────────────────

describe('SLA policy validation', () => {
  it('derives the metric matrix from the reconciler, not a parallel list', () => {
    // `#reconcileEntity` iterates `Object.keys(cfg.metricStatus)`, so that is
    // the only honest source for what an entity can be measured on.
    expect(SlaService.supportedMetrics).toEqual({
      case: ['first_response', 'resolution'],
      lead: ['first_response'],
      task: ['resolution'],
      record: ['first_response', 'resolution'],
    });
  });

  it('maps a metadata object\'s pipeline onto the clock for record SLAs', () => {
    const cfg = SlaService.recordEntityConfig({
      first_response_stages: ['new'], closed_stages: ['converted', 'disqualified'], canceled_stages: ['withdrawn'],
    });
    expect(cfg.metricStatus.first_response({ stage: 'new' })).toBe('running');
    expect(cfg.metricStatus.first_response({ stage: 'contacted' })).toBe('met');
    expect(cfg.metricStatus.resolution({ stage: 'contacted' })).toBe('running');
    expect(cfg.metricStatus.resolution({ stage: 'converted' })).toBe('met');
    expect(cfg.metricStatus.resolution({ stage: 'withdrawn' })).toBe('canceled');
    // No first-response stages configured → due until the record gets any stage.
    expect(SlaService.recordEntityConfig({ closed_stages: ['x'] }).metricStatus.first_response({ stage: null })).toBe('running');
  });

  it('takes a record\'s own target (business hours) from the field the policy names', () => {
    // e.g. an enquiry's first-contact target comes from its product's routing rule (a master).
    const cfg = SlaService.recordEntityConfig({ closed_stages: ['converted'], target_hours_fields: { first_response: 'first_contact_hours' } });
    const target = { metric: 'first_response', target_minutes: 240 };
    expect(SlaService.targetMinutesFor(cfg, target, { first_contact_hours: 2 }, 'first_response')).toBe(120);
    expect(SlaService.targetMinutesFor(cfg, target, { first_contact_hours: 1.5 }, 'first_response')).toBe(90);
    // Blank, zero or not a number → the policy's own target.
    for (const v of [null, undefined, 0, '', 'soon', -3]) {
      expect(SlaService.targetMinutesFor(cfg, target, { first_contact_hours: v }, 'first_response')).toBe(240);
    }
    // Another metric is not affected, nor is a policy without the setting.
    expect(SlaService.targetMinutesFor(cfg, { metric: 'resolution', target_minutes: 4800 }, { first_contact_hours: 2 }, 'resolution')).toBe(4800);
    expect(SlaService.targetMinutesFor(SlaService.recordEntityConfig({ closed_stages: ['x'] }), target, { first_contact_hours: 2 }, 'first_response')).toBe(240);
  });

  it('rejects a target on a metric the entity is not measured on', () => {
    expect(() => assertPolicyShape('lead', { targets: [{ metric: 'resolution', target_minutes: 60 }] }))
      .toThrow(/cannot be measured on "resolution"/);
    expect(() => assertPolicyShape('task', { targets: [{ metric: 'first_response', target_minutes: 60 }] }))
      .toThrow(/cannot be measured on "first_response"/);
  });

  it('accepts every metric an entity does support', () => {
    for (const [entity, metrics] of Object.entries(SlaService.supportedMetrics)) {
      for (const metric of metrics) {
        expect(() => assertPolicyShape(entity, { targets: [{ metric, target_minutes: 60 }] })).not.toThrow();
      }
    }
  });

  it('rejects a target duration that is not a positive number of minutes', () => {
    for (const target_minutes of [0, -5, 'soon', null, undefined]) {
      expect(() => assertPolicyShape('case', { targets: [{ metric: 'resolution', target_minutes }] }))
        .toThrow(/positive number of minutes/);
    }
  });

  it('rejects a warning threshold that cannot warn', () => {
    // 0 warns at creation; 100 warns exactly at breach. Neither is a warning.
    for (const warning_pct of [0, 100, 101, -1]) {
      expect(() => assertPolicyShape('case', { targets: [{ metric: 'resolution', target_minutes: 60, warning_pct }] }))
        .toThrow(/between 1 and 99/);
    }
    expect(() => assertPolicyShape('case', { targets: [{ metric: 'resolution', target_minutes: 60, warning_pct: 80 }] }))
      .not.toThrow();
  });

  it('rejects an escalation action the engine has no branch for', () => {
    expect(() => assertPolicyShape('case', { escalations: [{ trigger: 'breach', action: 'send_pigeon' }] }))
      .toThrow(/action must be one of/);
    for (const action of ESCALATION_ACTIONS) {
      expect(() => assertPolicyShape('case', { escalations: [{ trigger: 'breach', action }] })).not.toThrow();
    }
  });

  it('accepts the wildcard metric on an escalation but not a wrong one', () => {
    expect(() => assertPolicyShape('lead', { escalations: [{ trigger: 'breach', action: 'notify_owner', metric: '*' }] }))
      .not.toThrow();
    expect(() => assertPolicyShape('lead', { escalations: [{ trigger: 'breach', action: 'notify_owner', metric: 'resolution' }] }))
      .toThrow(/cannot target "resolution"/);
  });

  it('rejects a condition with an unsupported operator', () => {
    expect(() => assertPolicyShape('case', { conditions: [{ field: 'priority', op: 'sorta_equals' }] }))
      .toThrow(/not supported/);
    expect(() => assertPolicyShape('case', { conditions: [{ op: 'equals', value: 'x' }] }))
      .toThrow(/needs a field/);
  });

  it('does not match when an operator is unrecognised', () => {
    // It used to `return true`, so a typo silently widened a policy to every
    // record of the entity — the opposite of what the author asked for.
    expect(SlaService.conditionsMatch([{ field: 'priority', op: 'bogus', value: 'high' }], { priority: 'high' }))
      .toBe(false);
  });

  it('still treats an empty condition list as a catch-all', () => {
    // This is the documented way to write the fallback policy.
    expect(SlaService.conditionsMatch([], { priority: 'low' })).toBe(true);
    expect(SlaService.conditionsMatch(undefined, { priority: 'low' })).toBe(true);
  });

  it('accepts the shipped starter policies it is meant to guard', () => {
    // The seeded defaults and the validator must agree, or `seed-defaults`
    // would create policies the editor then refuses to save.
    for (const spec of DEFAULT_POLICIES) {
      expect(() => assertPolicyShape(spec.entity_type, spec)).not.toThrow();
    }
  });
});

describe('SLA board breakdown', () => {
  it('names Builder-object timers by their object instead of one "record" bucket', () => {
    const out = SlaService.splitRecordsByObject([
      { entity_type: 'record', entity_id: 1, bucket: 'breached' },
      { entity_type: 'record', entity_id: 2, bucket: 'on_track' },
      { entity_type: 'record', entity_id: 3, bucket: 'at_risk' },
      { entity_type: 'record', entity_id: 9, bucket: 'on_track' },
      { entity_type: 'case', entity_id: 1, bucket: 'breached' },
    ], { 1: { label: 'Enquiry', plural_label: 'Enquiries' }, 2: { label: 'Enquiry', plural_label: 'Enquiries' }, 3: { label: 'KYC Case', plural_label: null } });
    expect(out).toEqual({
      Enquiries: { total: 2, breached: 1, at_risk: 0 },
      'KYC Case': { total: 1, breached: 0, at_risk: 1 },
      'Other records': { total: 1, breached: 0, at_risk: 0 },
    });
  });
});

describe('SLA board focus', () => {
  it('keeps a focused record timer that falls outside the 60 most urgent', async () => {
    const soon = Date.now() + 3600_000, later = Date.now() + 86400_000;
    const instances = Array.from({ length: 61 }, (_, n) => ({
      id: n + 1, entity_type: 'record', entity_id: 100 + n, metric: 'resolution', priority: 'normal', policy_id: 1,
      status: 'running', breached: false, owner_id: 'GCRM1',
      due_at: new Date(n === 60 ? later : soon + n), warning_at: new Date(n === 60 ? later - 1000 : soon - 1000),
    }));
    const empty = { findMany: async () => [] };
    const db = {
      slaInstance: { findMany: async () => instances.map((i) => ({ ...i })) },
      record: empty, recordFieldValue: empty, employee: empty, slaPolicy: empty,
      crmCase: empty, crmLead: empty, task: empty, employeeHierarchy: empty,
    };
    const svc = new SlaService(db, { info() {}, warn() {}, error() {} });
    const plain = await svc.getDashboard({ employeeId: 'GCRM1', scope: 'me' });
    expect(plain.timers).toHaveLength(60);
    expect(plain.timers.some((t) => t.entity_id === 160)).toBe(false);
    const focused = await svc.getDashboard({ employeeId: 'GCRM1', scope: 'me', focus: { entity_type: 'record', entity_id: 160 } });
    expect(focused.timers).toHaveLength(61);
    expect(focused.timers.some((t) => t.entity_id === 160)).toBe(true);
  });
});
