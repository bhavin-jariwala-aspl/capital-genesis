'use strict';

/**
 * Tests for LeadScoringService:
 *  - Rule CRUD (create, update, list, delete)
 *  - Score calculation with rule evaluation
 *  - Operator coverage (equals, contains, greater_than, in_list, is_empty, etc.)
 *  - Top scored leads retrieval (hydrated via separate query)
 *  - Analytics and distribution
 */

const LeadScoringService = require('../src/services/lead-scoring.service');

// ── Prisma mock factory ──────────────────────────────────────────────────────

function makePrisma(overrides = {}) {
  const mock = {
    leadScoringRule: {
      create:   jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: 1, ...data })),
      update:   jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: 1, ...data })),
      findMany: jest.fn().mockResolvedValue([]),
      delete:   jest.fn().mockResolvedValue({ id: 1 }),
    },
    leadScore: {
      create:    jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: 1, ...data })),
      update:    jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: 1, ...data })),
      findFirst: jest.fn().mockResolvedValue(null),
      findMany:  jest.fn().mockResolvedValue([]),
      aggregate: jest.fn().mockResolvedValue({
        _count: { id: 0 },
        _avg: { total_score: null },
        _max: { total_score: null },
        _min: { total_score: null },
      }),
    },
    crmLead: {
      findUnique: jest.fn().mockResolvedValue(null),
      findMany:   jest.fn().mockResolvedValue([]),
    },
    crmLeadIntake: {
      findUnique: jest.fn().mockResolvedValue(null),
      findMany:   jest.fn().mockResolvedValue([]),
    },
    uiObject: {
      findFirst: jest.fn().mockResolvedValue({ id: 1 }),
    },
  };

  const result = { ...mock, ...overrides };
  result.$transaction = jest.fn().mockImplementation(fn => fn(result));
  return result;
}

const TENANT_ID = 1;

// ── Rule CRUD ────────────────────────────────────────────────────────────────

describe('LeadScoringService — Rule CRUD', () => {
  it('createScoringRule writes field_value and tenant_id', async () => {
    const db = makePrisma();
    const svc = new LeadScoringService(db);

    const result = await svc.createScoringRule({
      name: 'Hot Rating',
      rule_type: 'behavioral',
      field_name: 'rating',
      operator: 'equals',
      field_value: 'hot',
      points: 25,
    }, 'EMP001', TENANT_ID);

    expect(db.leadScoringRule.create).toHaveBeenCalledTimes(1);
    const arg = db.leadScoringRule.create.mock.calls[0][0];
    expect(arg.data.field_value).toBe('hot');
    expect(arg.data.tenant_id).toBe(TENANT_ID);
    expect(arg.data.created_by).toBe('EMP001');
    expect(arg.data.order_index).toBe(0);
    // Ensure it does NOT contain the old `value` key
    expect(arg.data).not.toHaveProperty('value');
  });

  it('updateScoringRule writes field_value, not value', async () => {
    const db = makePrisma();
    const svc = new LeadScoringService(db);

    await svc.updateScoringRule(1, { field_value: 'warm', points: 10 });

    const arg = db.leadScoringRule.update.mock.calls[0][0];
    expect(arg.data.field_value).toBe('warm');
    expect(arg.data.points).toBe(10);
    expect(arg.data).not.toHaveProperty('value');
  });

  it('getScoringRules filters by rule_type and is_active', async () => {
    const db = makePrisma();
    const svc = new LeadScoringService(db);

    await svc.getScoringRules({ ruleType: 'demographic', isActive: true });

    const arg = db.leadScoringRule.findMany.mock.calls[0][0];
    expect(arg.where.rule_type).toBe('demographic');
    expect(arg.where.is_active).toBe(true);
  });

  it('deleteScoringRule soft-deletes when rule has been used in scores', async () => {
    const db = makePrisma({
      leadScore: {
        findFirst: jest.fn().mockResolvedValue({ id: 99, scoring_details: { rules: [{ rule_id: 1 }] } }),
      },
    });
    db.$transaction = jest.fn().mockImplementation(fn => fn(db));
    const svc = new LeadScoringService(db);

    const result = await svc.deleteScoringRule(1);

    expect(db.leadScoringRule.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ is_active: false }) }),
    );
    expect(db.leadScoringRule.delete).not.toHaveBeenCalled();
  });

  it('deleteScoringRule hard-deletes when rule has never been used', async () => {
    const db = makePrisma();
    db.$transaction = jest.fn().mockImplementation(fn => fn(db));
    const svc = new LeadScoringService(db);

    const result = await svc.deleteScoringRule(5);

    expect(db.leadScoringRule.delete).toHaveBeenCalledWith({ where: { id: 5 } });
    expect(result).toEqual({ id: 5, deleted: true });
  });
});

// ── Score calculation ────────────────────────────────────────────────────────

describe('LeadScoringService — scoreLead', () => {
  const sampleLead = {
    id: 10,
    first_name: 'Jane',
    last_name: 'Doe',
    email: 'jane@example.com',
    company: 'Acme Corp',
    phone: '555-1234',
    job_title: 'VP Engineering',
    lead_status: 'new',
    lead_source: 'referral',
    industry: 'Technology',
    annual_revenue: 5000000,
    rating: 'hot',
    website: 'https://acme.com',
    created_at: new Date(),
  };

  it('scores a lead using active rules and writes field_value-based evaluation', async () => {
    const rules = [
      { id: 1, name: 'Hot Rating', rule_type: 'behavioral', field_name: 'rating', operator: 'equals', field_value: 'hot', points: 25, is_active: true },
      { id: 2, name: 'Has Email', rule_type: 'engagement', field_name: 'email', operator: 'is_not_empty', field_value: null, points: 10, is_active: true },
      { id: 3, name: 'Cold Rating', rule_type: 'behavioral', field_name: 'rating', operator: 'equals', field_value: 'cold', points: -5, is_active: true },
    ];

    const db = makePrisma();
    db.crmLead.findUnique.mockResolvedValue(sampleLead);
    db.leadScoringRule.findMany.mockResolvedValue(rules);
    db.$transaction = jest.fn().mockImplementation(fn => fn(db));
    const svc = new LeadScoringService(db);

    await svc.scoreLead(10, TENANT_ID, true);

    // Should create a score (no existing score)
    expect(db.leadScore.create).toHaveBeenCalledTimes(1);
    const created = db.leadScore.create.mock.calls[0][0].data;
    expect(created.lead_id).toBe(10);
    expect(created.tenant_id).toBe(TENANT_ID);
    // Hot Rating (25) + Has Email (10) = 35 (Cold Rating should NOT match)
    expect(created.total_score).toBe(35);
    expect(created.scoring_details.rules).toHaveLength(2);
    expect(created.scoring_details.rules[0].rule_name).toBe('Hot Rating');
  });

  it('returns existing score without recalculating when recalculate=false', async () => {
    const existingScore = { id: 99, lead_id: 10, total_score: 50, scoring_details: {} };
    const db = makePrisma();
    db.crmLead.findUnique.mockResolvedValue(sampleLead);
    db.leadScore.findFirst.mockResolvedValue(existingScore);
    db.$transaction = jest.fn().mockImplementation(fn => fn(db));
    const svc = new LeadScoringService(db);

    const result = await svc.scoreLead(10, TENANT_ID, false);

    expect(result).toBe(existingScore);
    expect(db.leadScore.create).not.toHaveBeenCalled();
    expect(db.leadScore.update).not.toHaveBeenCalled();
  });

  it('updates existing score when recalculate=true', async () => {
    const existingScore = { id: 99, lead_id: 10, total_score: 50, scoring_details: {} };
    const db = makePrisma();
    db.crmLead.findUnique.mockResolvedValue(sampleLead);
    db.leadScore.findFirst.mockResolvedValue(existingScore);
    db.leadScoringRule.findMany.mockResolvedValue([]);
    db.$transaction = jest.fn().mockImplementation(fn => fn(db));
    const svc = new LeadScoringService(db);

    await svc.scoreLead(10, TENANT_ID, true);

    expect(db.leadScore.update).toHaveBeenCalledTimes(1);
    expect(db.leadScore.create).not.toHaveBeenCalled();
  });

  it('throws on invalid lead ID', async () => {
    const svc = new LeadScoringService(makePrisma());
    await expect(svc.scoreLead('abc', TENANT_ID)).rejects.toThrow('Invalid lead ID');
    await expect(svc.scoreLead(-1, TENANT_ID)).rejects.toThrow('Invalid lead ID');
  });

  it('throws when lead not found', async () => {
    const db = makePrisma();
    db.crmLead.findUnique.mockResolvedValue(null);
    db.$transaction = jest.fn().mockImplementation(fn => fn(db));
    const svc = new LeadScoringService(db);
    await expect(svc.scoreLead(999, TENANT_ID, true)).rejects.toThrow('Lead not found');
  });
});

// ── scoreLeadIntake (raw Lead → the primary scoring target) ───────────────────

describe('LeadScoringService — scoreLeadIntake', () => {
  const sampleIntake = {
    id: 70, first_name: 'Olivia', last_name: 'Bennett', email: 'olivia@example.com',
    company: 'Freelance', phone: '555-0611', job_title: 'Designer', lead_status: 'new',
    lead_source: 'web', industry: 'Creative', annual_revenue: 90000, rating: 'hot',
    website: null, created_at: new Date(),
  };

  it('scores a raw lead and writes lead_intake_id (not lead_id)', async () => {
    const rules = [
      { id: 1, name: 'Hot Rating', rule_type: 'behavioral', field_name: 'rating', operator: 'equals', field_value: 'hot', points: 25, is_active: true },
      { id: 2, name: 'Has Email', rule_type: 'engagement', field_name: 'email', operator: 'is_not_empty', field_value: null, points: 10, is_active: true },
    ];
    const db = makePrisma();
    db.crmLeadIntake.findUnique.mockResolvedValue(sampleIntake);
    db.leadScoringRule.findMany.mockResolvedValue(rules);
    db.$transaction = jest.fn().mockImplementation(fn => fn(db));
    const svc = new LeadScoringService(db);

    await svc.scoreLeadIntake(70, TENANT_ID, true);

    expect(db.leadScore.create).toHaveBeenCalledTimes(1);
    const created = db.leadScore.create.mock.calls[0][0].data;
    expect(created.lead_intake_id).toBe(70);
    expect(created.lead_id).toBeUndefined();
    expect(created.tenant_id).toBe(TENANT_ID);
    expect(created.total_score).toBe(35);
  });

  it('finds the existing score by lead_intake_id and updates on recalculate', async () => {
    const db = makePrisma();
    db.crmLeadIntake.findUnique.mockResolvedValue(sampleIntake);
    db.leadScore.findFirst.mockResolvedValue({ id: 99, lead_intake_id: 70, total_score: 20, scoring_details: {} });
    db.leadScoringRule.findMany.mockResolvedValue([]);
    db.$transaction = jest.fn().mockImplementation(fn => fn(db));
    const svc = new LeadScoringService(db);

    await svc.scoreLeadIntake(70, TENANT_ID, true);

    expect(db.leadScore.findFirst).toHaveBeenCalledWith({ where: { lead_intake_id: 70 }, orderBy: { calculated_at: 'desc' } });
    expect(db.leadScore.update).toHaveBeenCalledTimes(1);
    expect(db.leadScore.create).not.toHaveBeenCalled();
  });

  it('throws on invalid id and when the lead is not found', async () => {
    const svc1 = new LeadScoringService(makePrisma());
    await expect(svc1.scoreLeadIntake('abc', TENANT_ID)).rejects.toThrow('Invalid lead ID');

    const db = makePrisma();
    db.crmLeadIntake.findUnique.mockResolvedValue(null);
    db.$transaction = jest.fn().mockImplementation(fn => fn(db));
    const svc2 = new LeadScoringService(db);
    await expect(svc2.scoreLeadIntake(999, TENANT_ID, true)).rejects.toThrow('Lead not found');
  });
});

// ── Rule operator coverage ───────────────────────────────────────────────────

describe('LeadScoringService — rule operators', () => {
  let svc;

  beforeEach(() => {
    svc = new LeadScoringService(makePrisma());
  });

  // Access private method via naming convention
  function evaluate(operator, fieldValue, ruleValue) {
    const rule = { field_name: 'test_field', operator, field_value: ruleValue };
    const lead = { test_field: fieldValue };
    // Call the private #evaluateRule via scoreLead internals
    // Since we can't call private methods directly, test through #calculateScore
    const result = svc['#calculateScore'] // not accessible, so we test via the public API
    // Alternative: test via full scoreLead flow
    return null; // placeholder
  }

  it('scores correctly with equals operator', async () => {
    const rules = [
      { id: 1, name: 'R', rule_type: 'demographic', field_name: 'rating', operator: 'equals', field_value: 'hot', points: 10, is_active: true },
    ];
    const db = makePrisma();
    db.crmLead.findUnique.mockResolvedValue({ id: 1, rating: 'hot', created_at: new Date() });
    db.leadScoringRule.findMany.mockResolvedValue(rules);
    db.$transaction = jest.fn().mockImplementation(fn => fn(db));
    const s = new LeadScoringService(db);
    await s.scoreLead(1, TENANT_ID, true);
    expect(db.leadScore.create.mock.calls[0][0].data.total_score).toBe(10);
  });

  it('scores correctly with contains operator', async () => {
    const rules = [
      { id: 1, name: 'R', rule_type: 'demographic', field_name: 'job_title', operator: 'contains', field_value: 'Director', points: 15, is_active: true },
    ];
    const db = makePrisma();
    db.crmLead.findUnique.mockResolvedValue({ id: 1, job_title: 'Sales Director', created_at: new Date() });
    db.leadScoringRule.findMany.mockResolvedValue(rules);
    db.$transaction = jest.fn().mockImplementation(fn => fn(db));
    const s = new LeadScoringService(db);
    await s.scoreLead(1, TENANT_ID, true);
    expect(db.leadScore.create.mock.calls[0][0].data.total_score).toBe(15);
  });

  it('scores correctly with greater_than operator', async () => {
    const rules = [
      { id: 1, name: 'R', rule_type: 'behavioral', field_name: 'annual_revenue', operator: 'greater_than', field_value: '1000000', points: 25, is_active: true },
    ];
    const db = makePrisma();
    db.crmLead.findUnique.mockResolvedValue({ id: 1, annual_revenue: 5000000, created_at: new Date() });
    db.leadScoringRule.findMany.mockResolvedValue(rules);
    db.$transaction = jest.fn().mockImplementation(fn => fn(db));
    const s = new LeadScoringService(db);
    await s.scoreLead(1, TENANT_ID, true);
    expect(db.leadScore.create.mock.calls[0][0].data.total_score).toBe(25);
  });

  it('scores correctly with in_list operator', async () => {
    const rules = [
      { id: 1, name: 'R', rule_type: 'demographic', field_name: 'industry', operator: 'in_list', field_value: 'Technology, Finance, Healthcare', points: 15, is_active: true },
    ];
    const db = makePrisma();
    db.crmLead.findUnique.mockResolvedValue({ id: 1, industry: 'Finance', created_at: new Date() });
    db.leadScoringRule.findMany.mockResolvedValue(rules);
    db.$transaction = jest.fn().mockImplementation(fn => fn(db));
    const s = new LeadScoringService(db);
    await s.scoreLead(1, TENANT_ID, true);
    expect(db.leadScore.create.mock.calls[0][0].data.total_score).toBe(15);
  });

  it('scores correctly with is_empty and is_not_empty operators', async () => {
    const rules = [
      { id: 1, name: 'Has Email', rule_type: 'engagement', field_name: 'email', operator: 'is_not_empty', field_value: null, points: 10, is_active: true },
      { id: 2, name: 'No Website', rule_type: 'engagement', field_name: 'website', operator: 'is_empty', field_value: null, points: -5, is_active: true },
    ];
    const db = makePrisma();
    db.crmLead.findUnique.mockResolvedValue({ id: 1, email: 'a@b.com', website: null, created_at: new Date() });
    db.leadScoringRule.findMany.mockResolvedValue(rules);
    db.$transaction = jest.fn().mockImplementation(fn => fn(db));
    const s = new LeadScoringService(db);
    await s.scoreLead(1, TENANT_ID, true);
    // is_not_empty matches (10) + is_empty matches for null website (-5) = 5
    expect(db.leadScore.create.mock.calls[0][0].data.total_score).toBe(5);
  });

  it('does not match when field value does not satisfy rule', async () => {
    const rules = [
      { id: 1, name: 'R', rule_type: 'behavioral', field_name: 'rating', operator: 'equals', field_value: 'hot', points: 10, is_active: true },
    ];
    const db = makePrisma();
    db.crmLead.findUnique.mockResolvedValue({ id: 1, rating: 'cold', created_at: new Date() });
    db.leadScoringRule.findMany.mockResolvedValue(rules);
    db.$transaction = jest.fn().mockImplementation(fn => fn(db));
    const s = new LeadScoringService(db);
    await s.scoreLead(1, TENANT_ID, true);
    expect(db.leadScore.create.mock.calls[0][0].data.total_score).toBe(0);
  });
});

// ── Top scored leads (via Prisma include relation) ───────────────────────────

describe('LeadScoringService — getTopScoredLeads', () => {
  it('fetches scores with lead data via include', async () => {
    const db = makePrisma();
    db.leadScore.findMany.mockResolvedValue([
      { id: 1, lead_id: 10, total_score: 90, lead: { id: 10, first_name: 'Jane', last_name: 'Doe', email: 'j@e.com', company: 'A', lead_status: 'new' } },
      { id: 2, lead_id: 20, total_score: 60, lead: { id: 20, first_name: 'John', last_name: 'Doe', email: 'jo@e.com', company: 'B', lead_status: 'contacted' } },
    ]);
    const svc = new LeadScoringService(db);

    const results = await svc.getTopScoredLeads(50);

    expect(results).toHaveLength(2);
    expect(results[0].lead.first_name).toBe('Jane');
    expect(results[1].lead.first_name).toBe('John');
    // Verify include is used instead of separate crmLead query
    const call = db.leadScore.findMany.mock.calls[0][0];
    expect(call.include).toHaveProperty('lead');
  });

  it('returns empty array when no scores exist', async () => {
    const db = makePrisma();
    const svc = new LeadScoringService(db);
    const results = await svc.getTopScoredLeads();
    expect(results).toEqual([]);
  });
});

// ── Analytics ────────────────────────────────────────────────────────────────

describe('LeadScoringService — analytics', () => {
  it('getScoringAnalytics returns aggregated stats', async () => {
    const db = makePrisma();
    db.leadScore.aggregate.mockResolvedValue({
      _count: { id: 100 },
      _avg: { total_score: 55.5 },
      _max: { total_score: 95 },
      _min: { total_score: 5 },
    });
    db.leadScoringRule.findMany.mockResolvedValue([{ id: 1 }, { id: 2 }]);
    // For getScoreDistribution called inside
    db.leadScore.findMany.mockResolvedValue([]);
    const svc = new LeadScoringService(db);

    const result = await svc.getScoringAnalytics();

    expect(result.total_scored).toBe(100);
    expect(result.average_score).toBe(55.5);
    expect(result.highest_score).toBe(95);
    expect(result.active_rules).toBe(2);
  });

  it('getScoreDistribution buckets scores into grades', async () => {
    const db = makePrisma();
    db.leadScore.findMany.mockResolvedValue([
      { total_score: 85 }, // A
      { total_score: 90 }, // A
      { total_score: 65 }, // B
      { total_score: 45 }, // C
      { total_score: 10 }, // F
    ]);
    const svc = new LeadScoringService(db);

    const result = await svc.getScoreDistribution();

    const byGrade = Object.fromEntries(result.map(r => [r.grade, r.count]));
    expect(byGrade.A).toBe(2);
    expect(byGrade.B).toBe(1);
    expect(byGrade.C).toBe(1);
    expect(byGrade.D).toBe(0);
    expect(byGrade.F).toBe(1);
  });
});
