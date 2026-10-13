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
    insurancePolicy:      emptyDelegate(),
    insuranceApplication: emptyDelegate(),
    insuranceClaim:       emptyDelegate(),
    underwritingCase:     emptyDelegate(),
    commissionEntry:      emptyDelegate(),
    crmOpportunity:       emptyDelegate(),
    crmLead:              emptyDelegate(),
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
  it('annualises premium by payment frequency', async () => {
    const prisma = makePrisma();
    prisma.insurancePolicy.findMany.mockResolvedValue([
      { premium_amount: 100, premium_frequency: 'monthly' },   // 1200
      { premium_amount: 400, premium_frequency: 'quarterly' }, // 1600
      { premium_amount: 900, premium_frequency: 'annual' },    //  900
    ]);

    const { data } = await new AnalyticsService(prisma).getData('kpi-premium-in-force');
    expect(data.value).toBe('$3.7K'); // 1200 + 1600 + 900 = 3700
    expect(data.raw).toBe(3700);
  });

  it('buckets policy premium into the month it took effect', async () => {
    const now = new Date();
    const thisMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 15));
    const prisma = makePrisma();
    prisma.insurancePolicy.findMany.mockResolvedValue([
      { effective_date: thisMonth, premium_amount: 1000, premium_frequency: 'annual' },
      { effective_date: thisMonth, premium_amount: 500,  premium_frequency: 'annual' },
    ]);

    const { data } = await new AnalyticsService(prisma).getData('premium-revenue-monthly');
    expect(data).toHaveLength(12);
    expect(data[11].revenue).toBe(1500); // current month is the last bucket
    expect(data.slice(0, 11).every((r) => r.revenue === 0)).toBe(true);
  });

  it('keeps the full status domain so the axis survives missing statuses', async () => {
    const prisma = makePrisma();
    prisma.insuranceApplication.findMany.mockResolvedValue([
      { status: 'approved' }, { status: 'approved' }, { status: 'declined' },
    ]);

    const { data } = await new AnalyticsService(prisma).getData('applications-by-status');
    expect(data).toHaveLength(7); // all seven application statuses present
    expect(data.find((r) => r.key === 'approved').count).toBe(2);
    expect(data.find((r) => r.key === 'issued').count).toBe(0);
  });

  it('builds a monotonically narrowing application funnel', async () => {
    const prisma = makePrisma();
    prisma.insuranceApplication.findMany.mockResolvedValue([
      { status: 'submitted' }, { status: 'under_review' }, { status: 'pending_medical' },
      { status: 'approved' }, { status: 'issued' }, { status: 'declined' },
    ]);

    const { data } = await new AnalyticsService(prisma).getData('application-funnel');
    expect(data.map((r) => r.count)).toEqual([6, 4, 3, 2, 1]);
  });

  it('caps the loss ratio at 100% and reports it as a single gauge row', async () => {
    const prisma = makePrisma();
    prisma.insurancePolicy.findMany.mockResolvedValue([
      { premium_amount: 1000, premium_frequency: 'annual' },
    ]);
    prisma.insuranceClaim.aggregate.mockResolvedValue({ _sum: { paid_amount: 5000 } });

    const { data } = await new AnalyticsService(prisma).getData('loss-ratio-gauge');
    expect(data).toEqual([{ name: 'Loss Ratio', value: 100 }]);
  });

  it('reports a rise in pending claims as a negative trend', async () => {
    const prisma = makePrisma();
    prisma.insuranceClaim.count
      .mockResolvedValueOnce(9)  // total pending
      .mockResolvedValueOnce(6)  // last 30 days
      .mockResolvedValueOnce(2); // preceding 30 days

    const { data } = await new AnalyticsService(prisma).getData('kpi-pending-claims');
    expect(data.value).toBe(9);
    expect(data.change).toBe('+4');
    expect(data.trend).toBe('down'); // more new claims is a worse outcome
  });

  it('fills the agent × product heatmap grid with explicit zeroes', async () => {
    const prisma = makePrisma();
    prisma.insurancePolicy.findMany.mockResolvedValue([
      { agent_id: 'E1', product_type: 'term_life',      agent: { employee_name: 'Ann' } },
      { agent_id: 'E2', product_type: 'universal_life', agent: { employee_name: 'Bo' } },
    ]);

    const { data } = await new AnalyticsService(prisma).getData('agent-product-heatmap');
    expect(data).toHaveLength(4); // 2 products × 2 agents
    expect(data.filter((c) => c.value === 0)).toHaveLength(2);
  });
});
