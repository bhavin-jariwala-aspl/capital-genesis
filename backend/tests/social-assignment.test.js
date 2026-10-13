'use strict';

jest.mock('@prisma/client');

// getTenantId is read inside createRule — stub it to a fixed tenant.
jest.mock('../src/middleware/tenant-scope', () => ({
  getTenantId: () => 1,
}));

const SocialAssignmentService = require('../src/services/social-assignment.service');

// ── Prisma mock ─────────────────────────────────────────────────────────────

function makePrisma() {
  const p = {
    socialAssignmentRule: {
      findMany:   jest.fn().mockResolvedValue([]),
      findUnique: jest.fn().mockResolvedValue(null),
      create:     jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: 1, ...data })),
      update:     jest.fn().mockImplementation(({ where, data }) => Promise.resolve({ id: where.id, ...data })),
      delete:     jest.fn().mockResolvedValue({ id: 1 }),
    },
  };
  p.$transaction = jest.fn(fn => (typeof fn === 'function' ? fn(p) : Promise.all(fn)));
  // $queryRaw returns the last_index the most recent rule.update was given,
  // so consecutive round-robin calls advance correctly.
  p._lastIndex = 0;
  p.$queryRaw = jest.fn(async () => [{ last_index: p._lastIndex }]);
  p.socialAssignmentRule.update.mockImplementation(({ where, data }) => {
    if (data.last_index !== undefined) p._lastIndex = data.last_index;
    return Promise.resolve({ id: where.id, ...data });
  });
  return p;
}

const fields = (over = {}) => ({
  platform: 'instagram', mention_type: 'comment', sentiment: 'neutral',
  response_priority: 'medium', follower_count: 100, ...over,
});

// ── Validation ──────────────────────────────────────────────────────────────

describe('SocialAssignmentService validation', () => {
  const svc = new SocialAssignmentService(makePrisma());

  it('rejects an invalid rule_type', async () => {
    await expect(svc.createRule({ name: 'x', rule_type: 'nope' }))
      .rejects.toThrow(/Invalid rule_type/);
  });

  it('rejects an invalid platform', async () => {
    await expect(svc.createRule({ name: 'x', rule_type: 'fixed', assignee_id: 'E1', platform: 'myspace' }))
      .rejects.toThrow(/Invalid platform/);
  });

  it('requires assignee_id for a fixed rule', async () => {
    await expect(svc.createRule({ name: 'x', rule_type: 'fixed' }))
      .rejects.toThrow(/assignee_id is required/);
  });

  it('requires a non-empty pool for round_robin', async () => {
    await expect(svc.createRule({ name: 'x', rule_type: 'round_robin', pool_ids: [] }))
      .rejects.toThrow(/pool_ids/);
  });

  it('requires conditions for rule_based', async () => {
    await expect(svc.createRule({ name: 'x', rule_type: 'rule_based' }))
      .rejects.toThrow(/conditions/);
  });

  it('creates a valid fixed rule (null platform = all channels)', async () => {
    const rule = await svc.createRule({ name: 'VIP', rule_type: 'fixed', assignee_id: 'E9' });
    expect(rule).toMatchObject({ name: 'VIP', rule_type: 'fixed', assignee_id: 'E9', platform: null, tenant_id: 1 });
  });
});

// ── Routing ─────────────────────────────────────────────────────────────────

describe('SocialAssignmentService.route', () => {
  let svc;
  beforeEach(() => { svc = new SocialAssignmentService(makePrisma()); });

  it('fixed rule returns its assignee', async () => {
    const rules = [{ id: 1, rule_type: 'fixed', assignee_id: 'E1' }];
    expect(await svc.route(rules, { mentionData: fields(), load: {} })).toBe('E1');
  });

  it('load_balanced rule picks the least-loaded pool member', async () => {
    const rules = [{ id: 1, rule_type: 'load_balanced', pool_ids: ['E1', 'E2'] }];
    const load = { E1: 4, E2: 1 };
    expect(await svc.route(rules, { mentionData: fields(), load })).toBe('E2');
    expect(load.E2).toBe(2); // tally incremented for batch balance
  });

  it('rule_based routes on a matching condition and skips on a miss', async () => {
    const rules = [
      { id: 1, rule_type: 'rule_based', conditions: [{ field: 'sentiment', operator: 'equals', value: 'negative' }], assignee_id: 'ESCALATION' },
      { id: 2, rule_type: 'fixed', assignee_id: 'DEFAULT' },
    ];
    expect(await svc.route(rules, { mentionData: fields({ sentiment: 'negative' }), load: {} })).toBe('ESCALATION');
    expect(await svc.route(rules, { mentionData: fields({ sentiment: 'positive' }), load: {} })).toBe('DEFAULT');
  });

  it('falls back to the last fallback_id when nothing matches', async () => {
    const rules = [
      { id: 1, rule_type: 'rule_based', conditions: [{ field: 'sentiment', operator: 'equals', value: 'negative' }], assignee_id: 'X', fallback_id: 'FB' },
    ];
    expect(await svc.route(rules, { mentionData: fields({ sentiment: 'positive' }), load: {} })).toBe('FB');
  });

  it('round_robin advances through the pool', async () => {
    const rules = [{ id: 7, rule_type: 'round_robin', pool_ids: ['A', 'B', 'C'], last_index: 0 }];
    const r1 = await svc.route(rules, { mentionData: fields(), load: {} });
    const r2 = await svc.route(rules, { mentionData: fields(), load: {} });
    const r3 = await svc.route(rules, { mentionData: fields(), load: {} });
    // last_index 0 → 1 → 2 → 0  (mirrors record round-robin semantics)
    expect([r1, r2, r3]).toEqual(['B', 'C', 'A']);
  });

  it('returns null when no rule yields an assignee', async () => {
    const rules = [{ id: 1, rule_type: 'rule_based', conditions: [{ field: 'sentiment', operator: 'equals', value: 'negative' }], assignee_id: 'X' }];
    expect(await svc.route(rules, { mentionData: fields({ sentiment: 'positive' }), load: {} })).toBeNull();
  });
});

describe('SocialAssignmentService.activeRulesFor', () => {
  it('matches rules for the platform OR all-platform (null) rules', async () => {
    const db = makePrisma();
    const svc = new SocialAssignmentService(db);
    await svc.activeRulesFor(1, 'whatsapp');
    expect(db.socialAssignmentRule.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        tenant_id: 1,
        is_active: true,
        OR: [{ platform: null }, { platform: 'whatsapp' }],
      }),
    }));
  });
});
