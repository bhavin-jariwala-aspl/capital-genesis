'use strict';

jest.mock('@prisma/client');

const AnalyticsService = require('../src/services/analytics.service');
const { DATASETS } = require('../src/services/analytics.service');

/**
 * A Prisma double whose delegates return empty results by default, so every
 * dataset runner can be executed without a database. Individual tests override
 * only the delegate they care about.
 */
function makePrisma(overrides = {}) {
  const emptyDelegate = () => ({
    findMany: jest.fn().mockResolvedValue([]),
    groupBy:  jest.fn().mockResolvedValue([]),
    count:    jest.fn().mockResolvedValue(0),
    aggregate: jest.fn().mockResolvedValue({ _sum: {}, _count: { _all: 0 } }),
  });
  return {
    crmOpportunity: emptyDelegate(),
    crmLead:        emptyDelegate(),
    ...overrides,
  };
}

describe('AnalyticsService — catalog', () => {
  it('exposes every dataset without its runner function', () => {
    const catalog = new AnalyticsService(makePrisma()).getCatalog();
    expect(catalog).toHaveLength(DATASETS.length);
    for (const entry of catalog) {
      expect(entry.run).toBeUndefined();
      expect(entry.key).toEqual(expect.any(String));
      expect(entry.label).toEqual(expect.any(String));
      expect(['series', 'metric', 'rows']).toContain(entry.shape);
    }
  });

  it('gives every series dataset the chart type and axis keys the builder needs', () => {
    for (const d of DATASETS.filter((x) => x.shape === 'series')) {
      expect(d.chart_type).toBeTruthy();
      expect(d.xKey).toBeTruthy();
      expect(d.yKey).toBeTruthy();
    }
  });

  it('gives every rows dataset an explicit column list', () => {
    for (const d of DATASETS.filter((x) => x.shape === 'rows')) {
      expect(Array.isArray(d.columns)).toBe(true);
      expect(d.columns.length).toBeGreaterThan(0);
    }
  });

  it('uses unique dataset keys', () => {
    const keys = DATASETS.map((d) => d.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('rejects an unknown dataset key', async () => {
    const svc = new AnalyticsService(makePrisma());
    await expect(svc.getData('no-such-dataset')).rejects.toThrow(/no-such-dataset/);
  });
});

describe('AnalyticsService — every dataset runs', () => {
  it.each(DATASETS.map((d) => [d.key, d.shape]))(
    '%s (%s) returns the declared shape on an empty dataset',
    async (key, shape) => {
      const { data, meta } = await new AnalyticsService(makePrisma()).getData(key);
      expect(meta.key).toBe(key);
      if (shape === 'metric') {
        expect(Array.isArray(data)).toBe(false);
        expect(data).toHaveProperty('value');
      } else {
        expect(Array.isArray(data)).toBe(true);
      }
    },
  );
});

describe('AnalyticsService — aggregation behaviour', () => {
  it('formats open pipeline value as compact money', async () => {
    const prisma = makePrisma();
    prisma.crmOpportunity.aggregate.mockResolvedValue({ _sum: { amount: 3700 } });

    const { data } = await new AnalyticsService(prisma).getData('kpi-open-pipeline');
    expect(data.value).toBe('$3.7K');
    expect(data.raw).toBe(3700);
  });

  it('buckets closed opportunity value into the month it closed', async () => {
    const now = new Date();
    const thisMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 15));
    const prisma = makePrisma();
    prisma.crmOpportunity.findMany.mockResolvedValue([
      { close_date: thisMonth, amount: 1000, is_won: true },
      { close_date: thisMonth, amount: 500,  is_won: true },
      { close_date: thisMonth, amount: 200,  is_won: false },
    ]);

    const { data } = await new AnalyticsService(prisma).getData('opportunity-win-loss-monthly');
    expect(data).toHaveLength(12);
    expect(data[11]).toMatchObject({ won: 1500, lost: 200 }); // current month is the last bucket
    expect(data.slice(0, 11).every((r) => r.won === 0 && r.lost === 0)).toBe(true);
  });

  it('keeps the full status domain so the axis survives missing statuses', async () => {
    const prisma = makePrisma();
    prisma.crmLead.findMany.mockResolvedValue([
      { lead_status: 'qualified' }, { lead_status: 'qualified' }, { lead_status: 'new' },
    ]);

    const { data } = await new AnalyticsService(prisma).getData('leads-by-status');
    expect(data).toHaveLength(5); // all five lead statuses present
    expect(data.find((r) => r.key === 'qualified').count).toBe(2);
    expect(data.find((r) => r.key === 'converted').count).toBe(0);
  });

  it('reports a rise in open leads as a positive trend', async () => {
    const prisma = makePrisma();
    prisma.crmLead.count
      .mockResolvedValueOnce(9)  // total open
      .mockResolvedValueOnce(6)  // last 30 days
      .mockResolvedValueOnce(2); // preceding 30 days

    const { data } = await new AnalyticsService(prisma).getData('kpi-open-leads');
    expect(data.value).toBe(9);
    expect(data.change).toBe('+4');
    expect(data.trend).toBe('up');
  });
});
