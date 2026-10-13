'use strict';

jest.mock('@prisma/client');

const AssignmentService = require('../src/services/assignment.service');

// ── Prisma mock ────────────────────────────────────────────────────────────

/**
 * @param {object} opts
 * @param {object|null} opts.crmFields     CRM entity fields for rule_based conditions
 * @param {string[]|null} opts.activeEmployees  who may receive work; null = everyone in the pool
 * @param {object[]} opts.stages           pipeline stages for terminal-stage detection
 */
function makePrisma({ crmFields = null, activeEmployees = null, stages = [] } = {}) {
  const p = {
    assignmentRule:  { findMany: jest.fn(), findUnique: jest.fn(), create: jest.fn(), update: jest.fn(), delete: jest.fn() },
    roundRobinState: { upsert: jest.fn(), update: jest.fn() },
    assignmentLog:   { create: jest.fn(), findMany: jest.fn() },
    // Pool eligibility: a deactivated employee must never be handed work.
    employee: {
      findMany: jest.fn(async ({ where }) => {
        const asked = where.employee_id.in;
        const allowed = activeEmployees ?? asked;
        return asked.filter((id) => allowed.includes(id)).map((employee_id) => ({ employee_id }));
      }),
    },
    uiPipelineStage: { findMany: jest.fn(async () => stages) },
    record: {
      update:     jest.fn(),
      count:      jest.fn(),
      groupBy:    jest.fn(async () => []),
      findUnique: jest.fn().mockResolvedValue(
        crmFields
          ? { crm_lead: crmFields, crm_contact: null, crm_account: null, crm_opportunity: null, crm_case: null }
          : null,
      ),
    },
  };

  // #roundRobin now uses $transaction + $queryRaw FOR UPDATE.
  // Pass the same mock db as the transaction client so upsert/update mocks work.
  p.$transaction = jest.fn(fn => fn(p));

  // Real per-rule cursor state, so a test that calls assign() repeatedly sees
  // the pointer advance. `$queryRaw` still honours an explicitly mocked
  // `upsert` result when one is configured, which is how the single-step tests
  // pin a specific starting index.
  const cursor = new Map();
  p.roundRobinState.update.mockImplementation(async ({ where, data }) => {
    cursor.set(where.rule_id, data.last_index);
    return { rule_id: where.rule_id, ...data };
  });

  // $queryRaw is used to SELECT last_index FOR UPDATE.
  p.$queryRaw = jest.fn(async function () {
    const results = p.roundRobinState.upsert.mock.results;
    const lastResult = results[results.length - 1];
    if (!lastResult) return [{ last_index: 0 }];
    const val = await lastResult.value;
    const ruleId = val?.rule_id;
    // A stored cursor (written by a previous assign in this test) wins over the
    // static upsert fixture.
    if (ruleId !== undefined && cursor.has(ruleId)) return [{ last_index: cursor.get(ruleId) }];
    return [{ last_index: val?.last_index ?? 0 }];
  });

  return p;
}

// ── Helpers ────────────────────────────────────────────────────────────────

const FIXED_RULE = {
  id: 1, object_id: 10, name: 'Fixed CEO', rule_type: 'fixed',
  assignee_id: 'EMP-1', pool_ids: null, fallback_id: null,
  order_index: 0, is_active: true, conditions: null,
};

const RR_RULE = {
  id: 2, object_id: 10, name: 'Round Robin', rule_type: 'round_robin',
  assignee_id: null, pool_ids: ['EMP-A', 'EMP-B', 'EMP-C'], fallback_id: null,
  order_index: 1, is_active: true, conditions: null,
};

const RULE_BASED_RULE = {
  id: 3, object_id: 10, name: 'Rule Based', rule_type: 'rule_based',
  assignee_id: 'EMP-2', pool_ids: null, fallback_id: 'EMP-FALLBACK',
  order_index: 0, is_active: true,
  conditions: [{ field: 'status', operator: 'equals', value: 'high' }],
};

// ── Tests ──────────────────────────────────────────────────────────────────

describe('AssignmentService', () => {
  describe('assign() — fixed rule', () => {
    it('assigns to assignee_id for a fixed rule', async () => {
      const prisma = makePrisma();
      prisma.assignmentRule.findMany.mockResolvedValue([FIXED_RULE]);
      prisma.record.update.mockResolvedValue({ id: 100, assigned_to: 'EMP-1' });
      prisma.assignmentLog.create.mockResolvedValue({ id: 1 });

      const svc = new AssignmentService(prisma);
      const result = await svc.assign(10, 100);

      expect(result).toBe('EMP-1');
      expect(prisma.record.update).toHaveBeenCalledWith(expect.objectContaining({
        where: { id: 100 },
        data:  { assigned_to: 'EMP-1' },
      }));
      expect(prisma.assignmentLog.create).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({ method: 'fixed', assigned_to: 'EMP-1' }),
      }));
    });
  });

  describe('assign() — round_robin', () => {
    it('cycles through pool members and persists state keyed by rule_id', async () => {
      const prisma = makePrisma();
      prisma.assignmentRule.findMany.mockResolvedValue([RR_RULE]);
      // State is keyed by rule_id (id: 2), NOT object_id
      prisma.roundRobinState.upsert.mockResolvedValue({ rule_id: 2, pool_ids: ['EMP-A','EMP-B','EMP-C'], last_index: 0 });
      prisma.roundRobinState.update.mockResolvedValue({});
      prisma.record.update.mockResolvedValue({});
      prisma.assignmentLog.create.mockResolvedValue({});

      const svc    = new AssignmentService(prisma);
      const result = await svc.assign(10, 200);

      // last_index was 0, next = (0+1) % 3 = 1, so pool[1] = 'EMP-B'
      expect(result).toBe('EMP-B');
      // upsert and update must use rule_id key, not object_id
      expect(prisma.roundRobinState.upsert).toHaveBeenCalledWith(expect.objectContaining({
        where: { rule_id: 2 },
      }));
      expect(prisma.roundRobinState.update).toHaveBeenCalledWith(expect.objectContaining({
        where: { rule_id: 2 },
        data:  expect.objectContaining({ last_index: 1 }),
      }));
    });

    it('wraps around pool correctly', async () => {
      const prisma = makePrisma();
      prisma.assignmentRule.findMany.mockResolvedValue([RR_RULE]);
      // last_index is at the end (2), next should wrap to 0
      prisma.roundRobinState.upsert.mockResolvedValue({ rule_id: 2, pool_ids: ['EMP-A','EMP-B','EMP-C'], last_index: 2 });
      prisma.roundRobinState.update.mockResolvedValue({});
      prisma.record.update.mockResolvedValue({});
      prisma.assignmentLog.create.mockResolvedValue({});

      const svc    = new AssignmentService(prisma);
      const result = await svc.assign(10, 201, {});

      expect(result).toBe('EMP-A');
    });

    it('two round-robin rules on the same object use independent state', async () => {
      // Both rules belong to object_id 10 but have different ids (20, 21)
      const RR_RULE_A = {
        id: 20, object_id: 10, name: 'RR Pool A', rule_type: 'round_robin',
        assignee_id: null, pool_ids: ['EMP-A', 'EMP-B'], fallback_id: null,
        order_index: 0, is_active: true, conditions: null,
      };
      const RR_RULE_B = {
        id: 21, object_id: 10, name: 'RR Pool B', rule_type: 'round_robin',
        assignee_id: null, pool_ids: ['EMP-X', 'EMP-Y'], fallback_id: null,
        order_index: 1, is_active: true, conditions: null,
      };

      const prisma = makePrisma();

      // First call → rule 20 (Pool A) — last_index=0 → picks pool[1]=EMP-B
      prisma.assignmentRule.findMany.mockResolvedValueOnce([RR_RULE_A]);
      prisma.roundRobinState.upsert.mockResolvedValueOnce({ rule_id: 20, pool_ids: ['EMP-A','EMP-B'], last_index: 0 });
      prisma.roundRobinState.update.mockResolvedValue({});
      prisma.record.update.mockResolvedValue({});
      prisma.assignmentLog.create.mockResolvedValue({});

      const svcA    = new AssignmentService(prisma);
      const resultA = await svcA.assign(10, 300, {});
      expect(resultA).toBe('EMP-B');
      expect(prisma.roundRobinState.upsert).toHaveBeenCalledWith(expect.objectContaining({
        where: { rule_id: 20 },
      }));

      // Second call → rule 21 (Pool B) — last_index=0 → picks pool[1]=EMP-Y
      prisma.assignmentRule.findMany.mockResolvedValueOnce([RR_RULE_B]);
      prisma.roundRobinState.upsert.mockResolvedValueOnce({ rule_id: 21, pool_ids: ['EMP-X','EMP-Y'], last_index: 0 });

      const svcB    = new AssignmentService(prisma);
      const resultB = await svcB.assign(10, 301);
      expect(resultB).toBe('EMP-Y');
      expect(prisma.roundRobinState.upsert).toHaveBeenCalledWith(expect.objectContaining({
        where: { rule_id: 21 },
      }));

      // Each upsert used a different rule_id — confirming independent state
      const ruleKeys = prisma.roundRobinState.upsert.mock.calls.map(c => c[0].where.rule_id);
      expect(ruleKeys).toEqual([20, 21]);
    });
  });

  describe('assign() — rule_based', () => {
    it('assigns when condition matches', async () => {
      const prisma = makePrisma({ crmFields: { status: 'high' } });
      prisma.assignmentRule.findMany.mockResolvedValue([RULE_BASED_RULE]);
      prisma.record.update.mockResolvedValue({});
      prisma.assignmentLog.create.mockResolvedValue({});

      const svc    = new AssignmentService(prisma);
      const result = await svc.assign(10, 300);

      expect(result).toBe('EMP-2');
    });

    it('skips rule when condition does not match', async () => {
      const prisma = makePrisma({ crmFields: { status: 'low' } });
      prisma.assignmentRule.findMany.mockResolvedValue([RULE_BASED_RULE]);
      // no matching condition → falls through, uses fallback
      prisma.record.update.mockResolvedValue({});
      prisma.assignmentLog.create.mockResolvedValue({});

      const svc    = new AssignmentService(prisma);
      const result = await svc.assign(10, 301);

      // RULE_BASED_RULE has fallback_id = 'EMP-FALLBACK'
      expect(result).toBe('EMP-FALLBACK');
    });
  });

  describe('assign() — no rules', () => {
    it('returns null when no active rules exist', async () => {
      const prisma = makePrisma();
      prisma.assignmentRule.findMany.mockResolvedValue([]);

      const svc    = new AssignmentService(prisma);
      const result = await svc.assign(99, 400);

      expect(result).toBeNull();
    });
  });

  describe('condition operators', () => {
    // Access the private method indirectly through a rule_based rule
    const makeRuleWithCondition = (condition) => ({
      id: 10, object_id: 1, name: 'test', rule_type: 'rule_based',
      assignee_id: 'EMP-X', pool_ids: null, fallback_id: null,
      order_index: 0, is_active: true, conditions: [condition],
    });

    const cases = [
      ['contains',     { field: 'name', operator: 'contains',     value: 'john' }, { name: 'john doe' }, 'EMP-X'],
      ['starts_with',  { field: 'name', operator: 'starts_with',  value: 'jo'   }, { name: 'john'    }, 'EMP-X'],
      ['ends_with',    { field: 'name', operator: 'ends_with',    value: 'hn'   }, { name: 'john'    }, 'EMP-X'],
      ['gt',           { field: 'score', operator: 'gt',          value: 80     }, { score: 90       }, 'EMP-X'],
      ['lte',          { field: 'score', operator: 'lte',         value: 50     }, { score: 50       }, 'EMP-X'],
      ['in',           { field: 'region', operator: 'in',         value: ['US','EU'] }, { region: 'US' }, 'EMP-X'],
      ['is_empty',     { field: 'tag', operator: 'is_empty',      value: null   }, { tag: ''         }, 'EMP-X'],
      ['is_not_empty', { field: 'tag', operator: 'is_not_empty',  value: null   }, { tag: 'vip'      }, 'EMP-X'],
    ];

    test.each(cases)('operator %s', async (opName, condition, data, expected) => {
      const prisma = makePrisma({ crmFields: data });
      prisma.assignmentRule.findMany.mockResolvedValue([makeRuleWithCondition(condition)]);
      prisma.record.update.mockResolvedValue({});
      prisma.assignmentLog.create.mockResolvedValue({});

      const svc    = new AssignmentService(prisma);
      const result = await svc.assign(1, 500);

      expect(result).toBe(expected);
    });
  });

  describe('CRUD helpers', () => {
    it('createRule rejects invalid rule_type', async () => {
      const svc = new AssignmentService(makePrisma());
      await expect(svc.createRule({ rule_type: 'bad_type', object_id: 1 })).rejects.toThrow('Invalid rule_type');
    });

    it('getRules calls findMany with object_id filter', async () => {
      const prisma = makePrisma();
      prisma.assignmentRule.findMany.mockResolvedValue([]);
      const svc = new AssignmentService(prisma);
      await svc.getRules(5);
      expect(prisma.assignmentRule.findMany).toHaveBeenCalledWith(expect.objectContaining({
        where: { object_id: 5 },
      }));
    });
  });
});

// ── Routing quality: eligibility, load, and rule updates ───────────────────

const LB_RULE = {
  id: 4, object_id: 10, name: 'Load balanced', rule_type: 'load_balanced',
  assignee_id: null, pool_ids: ['EMP-A', 'EMP-B', 'EMP-C'], fallback_id: null,
  order_index: 0, is_active: true, conditions: null,
};

describe('pool eligibility', () => {
  it('never hands work to a deactivated employee', async () => {
    // The regression: a deactivated rep stayed in the rotation and kept
    // receiving records they can no longer sign in to see.
    const prisma = makePrisma({ activeEmployees: ['EMP-B', 'EMP-C'] });
    prisma.assignmentRule.findMany.mockResolvedValue([RR_RULE]);
    prisma.roundRobinState.upsert.mockResolvedValue({ rule_id: 2, last_index: 0 });
    prisma.record.update.mockResolvedValue({});

    const svc = new AssignmentService(prisma);
    const picked = [];
    for (let i = 0; i < 4; i++) picked.push(await svc.assign(10, 100 + i));
    expect(picked).not.toContain('EMP-A');
    expect(new Set(picked)).toEqual(new Set(['EMP-B', 'EMP-C']));
  });

  it('falls back rather than assigning when the whole pool is deactivated', async () => {
    const prisma = makePrisma({ activeEmployees: [] });
    prisma.assignmentRule.findMany.mockResolvedValue([{ ...RR_RULE, fallback_id: 'EMP-MGR' }]);
    prisma.record.update.mockResolvedValue({});
    expect(await new AssignmentService(prisma).assign(10, 100)).toBe('EMP-MGR');
  });

  it('de-duplicates a pool, so one person cannot take a double share', async () => {
    const prisma = makePrisma();
    prisma.assignmentRule.findMany.mockResolvedValue([
      { ...RR_RULE, pool_ids: ['EMP-A', 'EMP-A', 'EMP-B'] },
    ]);
    prisma.roundRobinState.upsert.mockResolvedValue({ rule_id: 2, last_index: 0 });
    prisma.record.update.mockResolvedValue({});

    const svc = new AssignmentService(prisma);
    const picked = [];
    for (let i = 0; i < 4; i++) picked.push(await svc.assign(10, 100 + i));
    expect(picked.filter((p) => p === 'EMP-A').length).toBe(2);
    expect(picked.filter((p) => p === 'EMP-B').length).toBe(2);
  });

  it('normalisePool trims, drops blanks and accepts a comma string', () => {
    expect(AssignmentService.normalisePool([' EMP-A ', '', 'EMP-B', 'EMP-A'])).toEqual(['EMP-A', 'EMP-B']);
    expect(AssignmentService.normalisePool('EMP-A, EMP-B')).toEqual(['EMP-A', 'EMP-B']);
    expect(AssignmentService.normalisePool(null)).toEqual([]);
  });
});

describe('load_balanced counts current workload, not lifetime volume', () => {
  const STAGES = [
    { id: 1, name: 'new', config: null },
    { id: 2, name: 'closed_won', config: null },
    { id: 3, name: 'archive', config: { is_closed: true } },
  ];

  function setup(groups) {
    const prisma = makePrisma({ stages: STAGES });
    prisma.assignmentRule.findMany.mockResolvedValue([LB_RULE]);
    prisma.record.update.mockResolvedValue({});
    prisma.record.groupBy.mockResolvedValue(groups);
    return prisma;
  }

  it('picks the pool member with the fewest open records', async () => {
    const prisma = setup([
      { assigned_to: 'EMP-A', _count: { id: 7 } },
      { assigned_to: 'EMP-B', _count: { id: 2 } },
      { assigned_to: 'EMP-C', _count: { id: 5 } },
    ]);
    expect(await new AssignmentService(prisma).assign(10, 100)).toBe('EMP-B');
  });

  it('excludes terminal stages, deleted records, and other objects from the count', async () => {
    const prisma = setup([]);
    await new AssignmentService(prisma).assign(10, 100);

    const where = prisma.record.groupBy.mock.calls[0][0].where;
    expect(where.object_id).toBe(10);      // this rule's object only
    expect(where.deleted_at).toBeNull();   // trashed records are not workload
    // Both the conventionally named and the explicitly flagged terminal stages.
    expect(where.OR).toEqual([
      { pipeline_stage_id: null },
      { pipeline_stage_id: { notIn: [2, 3] } },
    ]);
  });

  it('counts nothing as zero, and breaks ties by pool order', async () => {
    const prisma = setup([]);
    expect(await new AssignmentService(prisma).assign(10, 100)).toBe('EMP-A');
  });

  it('ignores a deactivated member however idle they look', async () => {
    const prisma = makePrisma({ stages: STAGES, activeEmployees: ['EMP-B', 'EMP-C'] });
    prisma.assignmentRule.findMany.mockResolvedValue([LB_RULE]);
    prisma.record.update.mockResolvedValue({});
    prisma.record.groupBy.mockResolvedValue([
      { assigned_to: 'EMP-B', _count: { id: 4 } },
      { assigned_to: 'EMP-C', _count: { id: 9 } },
    ]);
    // EMP-A has zero load but cannot receive work.
    expect(await new AssignmentService(prisma).assign(10, 100)).toBe('EMP-B');
  });
});

describe('isTerminalStage', () => {
  it('honours the explicit metadata flag so a tenant can rename its lanes', () => {
    expect(AssignmentService.isTerminalStage({ name: 'anything', config: { is_closed: true } })).toBe(true);
  });

  it('recognises the conventional terminal names, case-insensitively', () => {
    for (const name of ['closed_won', 'Lost', 'CONVERTED', 'cancelled', 'resolved']) {
      expect(AssignmentService.isTerminalStage({ name })).toBe(true);
    }
  });

  it('treats an ordinary stage as open', () => {
    expect(AssignmentService.isTerminalStage({ name: 'negotiation' })).toBe(false);
    expect(AssignmentService.isTerminalStage({ name: 'new', config: { is_closed: false } })).toBe(false);
    expect(AssignmentService.isTerminalStage(null)).toBe(false);
  });
});

describe('updateRule', () => {
  it('toggles is_active without throwing', async () => {
    // The regression: `update` came from a const rest pattern and was then
    // rebound, so every activate/deactivate threw
    // `TypeError: Assignment to constant variable` and answered 500.
    const prisma = makePrisma();
    prisma.assignmentRule.update.mockResolvedValue({ id: 1, is_active: false });
    await expect(new AssignmentService(prisma).updateRule(1, { is_active: false }))
      .resolves.toMatchObject({ is_active: false });
    expect(prisma.assignmentRule.update).toHaveBeenCalledWith({
      where: { id: 1 }, data: { is_active: false },
    });
  });

  it('coerces the string form a checkbox posts', async () => {
    const prisma = makePrisma();
    prisma.assignmentRule.update.mockResolvedValue({});
    await new AssignmentService(prisma).updateRule(1, { is_active: 'true' });
    expect(prisma.assignmentRule.update.mock.calls[0][0].data.is_active).toBe(true);
  });

  it('normalises a pool on update, not only on create', async () => {
    const prisma = makePrisma();
    prisma.assignmentRule.update.mockResolvedValue({});
    await new AssignmentService(prisma).updateRule(1, { pool_ids: ['EMP-A', ' EMP-A ', 'EMP-B'] });
    expect(prisma.assignmentRule.update.mock.calls[0][0].data.pool_ids).toEqual(['EMP-A', 'EMP-B']);
  });

  it('drops columns a caller may not set, and still rejects a bad rule_type', async () => {
    const prisma = makePrisma();
    prisma.assignmentRule.update.mockResolvedValue({});
    await new AssignmentService(prisma).updateRule(1, { name: 'X', object_id: 99, created_by: 'E1' });
    expect(prisma.assignmentRule.update.mock.calls[0][0].data).toEqual({ name: 'X' });
    await expect(new AssignmentService(prisma).updateRule(1, { rule_type: 'nope' }))
      .rejects.toThrow(/Invalid rule_type/);
  });
});

// ── explain(): the dry run behind the Builder simulator ─────────────────────

describe('explain — who would get this record, and why', () => {
  function harness({ rules, activeEmployees = null, rrIndex = 0, load = [] }) {
    const prisma = makePrisma({ activeEmployees, stages: [{ id: 2, name: 'closed_won', config: null }] });
    prisma.assignmentRule.findMany.mockResolvedValue(rules);
    prisma.roundRobinState.findUnique = jest.fn(async () => ({ rule_id: 2, last_index: rrIndex }));
    prisma.record.groupBy.mockResolvedValue(load);
    return prisma;
  }

  it('reports every rule in order with an outcome and a reason, then the decision', async () => {
    const prisma = harness({ rules: [RULE_BASED_RULE, RR_RULE] });
    prisma.record.findUnique.mockResolvedValue({ crm_lead: { status: 'low' }, crm_contact: null, crm_account: null, crm_opportunity: null, crm_case: null });
    const out = await new AssignmentService(prisma).explain(10, { recordId: 100 });

    expect(out.trace.map((t) => t.outcome)).toEqual(['no_match', 'matched']);
    expect(out.trace[0].failed_conditions[0]).toMatchObject({ field: 'status', actual: 'low' });
    expect(out.decision).toMatchObject({ method: 'round_robin', rule_id: 2 });
    expect(out.rules_evaluated).toBe(2);
  });

  it('writes nothing and does not advance the rotation', async () => {
    const prisma = harness({ rules: [RR_RULE], rrIndex: 0 });
    const svc = new AssignmentService(prisma);
    const a = await svc.explain(10, { fields: {} });
    const b = await svc.explain(10, { fields: {} });
    expect(a.decision.assignee).toBe(b.decision.assignee);           // peeked, not advanced
    expect(prisma.record.update).not.toHaveBeenCalled();
    expect(prisma.assignmentLog.create).not.toHaveBeenCalled();
    expect(prisma.roundRobinState.update).not.toHaveBeenCalled();
  });

  it('accepts hypothetical field values instead of a record', async () => {
    const prisma = harness({ rules: [RULE_BASED_RULE] });
    const out = await new AssignmentService(prisma).explain(10, { fields: { status: 'high' } });
    expect(out.decision).toMatchObject({ assignee: 'EMP-2', method: 'rule_based' });
    expect(out.input).toEqual({ fields: { status: 'high' } });
  });

  it('says why a pool rule could not match, and who it skipped', async () => {
    const prisma = harness({ rules: [RR_RULE], activeEmployees: [] });
    const out = await new AssignmentService(prisma).explain(10, { fields: {} });
    expect(out.trace[0]).toMatchObject({ outcome: 'no_match', dropped_inactive: ['EMP-A', 'EMP-B', 'EMP-C'] });
    expect(out.decision.method).toBe('none');
  });

  it('shows the open-load table for a load-balanced pick', async () => {
    const lb = { id: 4, object_id: 10, name: 'LB', rule_type: 'load_balanced', pool_ids: ['EMP-A', 'EMP-B'], assignee_id: null, fallback_id: null, order_index: 0, is_active: true, conditions: null };
    const prisma = harness({ rules: [lb], load: [{ assigned_to: 'EMP-A', _count: { id: 3 } }] });
    const out = await new AssignmentService(prisma).explain(10, { fields: {} });
    expect(out.decision.assignee).toBe('EMP-B');
    expect(out.trace[0].load).toEqual([{ employee_id: 'EMP-A', open: 3 }, { employee_id: 'EMP-B', open: 0 }]);
  });

  it('marks rules after the first match as skipped, and falls back when nothing matches', async () => {
    const prisma = harness({ rules: [FIXED_RULE, RR_RULE] });
    const out = await new AssignmentService(prisma).explain(10, { fields: {} });
    expect(out.trace[1].outcome).toBe('skipped');

    const none = harness({ rules: [{ ...RULE_BASED_RULE, fallback_id: 'EMP-FALLBACK' }] });
    const out2 = await new AssignmentService(none).explain(10, { fields: { status: 'nope' } });
    expect(out2.decision).toMatchObject({ assignee: 'EMP-FALLBACK', method: 'fallback' });
  });
});
