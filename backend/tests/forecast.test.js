'use strict';

jest.mock('@prisma/client');

const ForecastService = require('../src/services/forecast.service');

function makePrisma(overrides = {}) {
  return {
    quota:             { upsert: jest.fn(), findMany: jest.fn(), delete: jest.fn() },
    uiPipeline:        { findMany: jest.fn().mockResolvedValue([]) },
    record:            { findMany: jest.fn().mockResolvedValue([]) },
    employeeHierarchy: { findMany: jest.fn() },
    crmOpportunity:    { count: jest.fn().mockResolvedValue(0), findMany: jest.fn().mockResolvedValue([]) },
    // uiObject needed by CrmService.#objectIds()
    uiObject:          { findMany: jest.fn().mockResolvedValue([]), findUnique: jest.fn().mockResolvedValue(null) },
    ...overrides,
  };
}

// ── Quota tests ────────────────────────────────────────────────────────────

describe('ForecastService — Quota', () => {
  it('setQuota upserts a quota record', async () => {
    const prisma = makePrisma();
    prisma.quota.upsert.mockResolvedValue({ id: 1, target_value: '50000', currency: 'USD' });

    const svc = new ForecastService(prisma);
    const result = await svc.setQuota({
      employee_id: 'EMP-1',
      object_id:   1,
      period_type: 'quarterly',
      period_key:  '2026-Q1',
      target_value: 50000,
      currency:    'USD',
    });

    expect(prisma.quota.upsert).toHaveBeenCalledTimes(1);
    expect(result.id).toBe(1);
  });

  it('setQuota rejects invalid period_type', async () => {
    const svc = new ForecastService(makePrisma());
    await expect(svc.setQuota({ employee_id: 'E', object_id: 1, period_type: 'daily', period_key: 'x', target_value: 100 }))
      .rejects.toThrow('Invalid period_type');
  });

  it('getQuotas applies filters', async () => {
    const prisma = makePrisma();
    prisma.quota.findMany.mockResolvedValue([]);
    const svc = new ForecastService(prisma);
    await svc.getQuotas({ employee_id: 'EMP-1', period_type: 'monthly' });
    expect(prisma.quota.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { employee_id: 'EMP-1', period_type: 'monthly' },
    }));
  });
});

// ── Forecast computation tests ─────────────────────────────────────────────

describe('ForecastService — computeForecast', () => {
  // computeForecast now always delegates to CrmService.computeRelationalForecast()
  // which reads crm_opportunities + uiPipeline stage weights.
  const pipeline = {
    id: 1,
    stages: [
      { name: 'Prospecting', config: { forecast_weight: 0.1 } },
      { name: 'Proposal',    config: { forecast_weight: 0.5 } },
      { name: 'Closed Won', config: { forecast_weight: 1.0 } },
    ],
  };

  const opps = [
    { id: 1, amount: 10000, stage: 'Prospecting', probability: 10, owner_id: 'EMP-A' },
    { id: 2, amount: 20000, stage: 'Proposal',    probability: 50, owner_id: 'EMP-A' },
    { id: 3, amount: 5000,  stage: 'Closed Won',  probability: 100, owner_id: 'EMP-B' },
  ];

  it('computes total_pipeline and weighted_forecast correctly', async () => {
    const prisma = makePrisma({
      uiPipeline:     { findMany: jest.fn().mockResolvedValue([pipeline]) },
      crmOpportunity: { count: jest.fn().mockResolvedValue(3), findMany: jest.fn().mockResolvedValue(opps) },
    });
    const svc    = new ForecastService(prisma);
    const result = await svc.computeForecast(5);

    // total = 10000 + 20000 + 5000 = 35000
    expect(result.total_pipeline).toBe(35000);
    // weighted = 10000*0.1 + 20000*0.5 + 5000*1.0 = 1000 + 10000 + 5000 = 16000
    expect(result.weighted_forecast).toBe(16000);
  });

  it('groups by_stage correctly', async () => {
    const prisma = makePrisma({
      uiPipeline:     { findMany: jest.fn().mockResolvedValue([pipeline]) },
      crmOpportunity: { count: jest.fn().mockResolvedValue(3), findMany: jest.fn().mockResolvedValue(opps) },
    });
    const svc    = new ForecastService(prisma);
    const result = await svc.computeForecast(5);

    const proposalStage = result.by_stage.find(s => s.stage === 'Proposal');
    expect(proposalStage).toBeDefined();
    expect(proposalStage.count).toBe(1);
    expect(proposalStage.amount).toBe(20000);
    expect(proposalStage.weighted).toBe(10000);
  });

  it('groups by_employee correctly', async () => {
    const prisma = makePrisma({
      uiPipeline:     { findMany: jest.fn().mockResolvedValue([pipeline]) },
      crmOpportunity: { count: jest.fn().mockResolvedValue(3), findMany: jest.fn().mockResolvedValue(opps) },
    });
    const svc    = new ForecastService(prisma);
    const result = await svc.computeForecast(5);

    const empA = result.by_employee.find(e => e.owner_id === 'EMP-A');
    expect(empA.count).toBe(2);
    expect(empA.amount).toBe(30000);
  });

  it('returns zeros when no opportunities exist', async () => {
    const prisma = makePrisma();
    const svc    = new ForecastService(prisma);
    const result = await svc.computeForecast(5);

    expect(result.total_pipeline).toBe(0);
    expect(result.weighted_forecast).toBe(0);
  });
});

// ── Team forecast ──────────────────────────────────────────────────────────

describe('ForecastService — getTeamForecast', () => {
  it('aggregates across all direct reports', async () => {
    const prisma = makePrisma();

    prisma.employeeHierarchy.findMany.mockResolvedValue([
      { descendant_id: 'EMP-A' },
      { descendant_id: 'EMP-B' },
    ]);

    // computeForecast delegates to crmOpportunity.findMany (no record.findMany)
    prisma.uiPipeline.findMany.mockResolvedValue([]);
    prisma.crmOpportunity.findMany.mockResolvedValue([]);

    const svc    = new ForecastService(prisma);
    const result = await svc.getTeamForecast('MGR-1', 5, { value_field: 'amount' });

    expect(result.team_size).toBe(2);
    expect(result.total_pipeline).toBe(0);
    expect(result.weighted_forecast).toBe(0);
    expect(result.manager_id).toBe('MGR-1');
  });
});

// ── Builder objects (records, not crm_opportunities) ───────────────────────

describe('ForecastService — Builder object forecast', () => {
  const fields = [
    { name: 'amount', field_type: 'currency', label: 'Amount' },
    { name: 'amount_mur', field_type: 'formula', label: 'Amount (MUR)' },
    { name: 'probability', field_type: 'percent', label: 'Probability %' },
    { name: 'expected_close', field_type: 'date', label: 'Expected close' },
    { name: 'forecast_category', field_type: 'select', label: 'Forecast' },
    { name: 'owner_rm', field_type: 'text', label: 'Owner RM' },
  ];
  const stages = [
    { id: 1, name: 'qualified', label: 'Qualified', config: {} },
    { id: 2, name: 'proposal', label: 'Proposal', config: {} },
    { id: 3, name: 'won', label: 'Won', config: {} },
  ];
  const rec = (id, stage, data, assigned_to = null) => ({ id, pipeline_stage_id: stage, assigned_to, data });
  const records = [
    rec(1, 1, { amount: 100, amount_mur: 1000, probability: 25, owner_rm: 'RM1', forecast_category: 'pipeline', expected_close: '2026-11-15' }),
    rec(2, 2, { amount: 2000, amount_mur: 2000, probability: 50, owner_rm: 'RM2', forecast_category: 'commit', expected_close: '2026-12-20' }),
    rec(3, 3, { amount: 9999, amount_mur: 9999, probability: 100, owner_rm: 'RM1' }), // won → not pipeline
    rec(4, 2, { amount: 400, amount_mur: 400, probability: 50, forecast_category: 'pipeline' }, 'RM3'), // owner from assignee
  ];
  function build() {
    const prisma = makePrisma({
      uiObject:        { findUnique: jest.fn().mockResolvedValue({ id: 166, name: 'fs_opportunity', config: {} }) },
      uiField:         { findMany: jest.fn().mockResolvedValue(fields) },
      uiPipelineStage: { findMany: jest.fn().mockResolvedValue(stages) },
    });
    const recordSvc = { getRecords: jest.fn().mockResolvedValue(records) };
    return { svc: new ForecastService(prisma, recordSvc), recordSvc, prisma };
  }

  it('reads the object\'s records with the viewer\'s scope, in the base-currency amount', async () => {
    const { svc, recordSvc, prisma } = build();
    const viewer = { employee_id: 'RM1', role: 'rm' };
    const f = await svc.computeForecast(166, { value_field: 'amount' }, viewer);
    expect(recordSvc.getRecords).toHaveBeenCalledWith(166, null, viewer, {});
    expect(prisma.crmOpportunity.findMany).not.toHaveBeenCalled();
    expect(f.value_field).toBe('amount_mur');
    expect(f.total_pipeline).toBe(3400);
    // 1000×25% + 2000×50% + 400×50%
    expect(f.weighted_forecast).toBe(1450);
    expect(f.by_stage.map((s) => s.stage)).toEqual(['Qualified', 'Proposal']);
    expect(f.by_employee.find((e) => e.owner_id === 'RM3').amount).toBe(400);
    expect(f.by_category.find((c) => c.category === 'commit').weighted).toBe(1000);
  });

  it('filters by owner and close date, and rolls up a team', async () => {
    const { svc, prisma } = build();
    expect((await svc.computeForecast(166, { assigned_to: 'RM2' })).total_pipeline).toBe(2000);
    expect((await svc.computeForecast(166, { from: '2026-11-01', to: '2026-11-30' })).total_pipeline).toBe(1000);
    prisma.employeeHierarchy.findMany.mockResolvedValue([{ descendant_id: 'RM1' }, { descendant_id: 'RM3' }]);
    const team = await svc.getTeamForecast('MGR', 166, {});
    expect(team.total_pipeline).toBe(1400);
    expect(team.team_size).toBe(2);
  });

  it('uses the object\'s forecast config over the conventional names', () => {
    const roles = ForecastService.resolveRoles(fields, { forecast: { amount_field: 'amount', owner_field: 'owner_rm' } });
    expect(roles.amount).toBe('amount');
    expect(roles.close).toBe('expected_close');
    expect(roles.category).toBe('forecast_category');
  });
});
