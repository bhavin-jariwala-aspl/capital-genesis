'use strict';

jest.mock('@prisma/client');

const ReportService = require('../src/services/report.service');
const { getTemplates } = require('../src/services/report-templates');
const { getField, allFields, relationSelect, SOURCES } = require('../src/services/report-registry');

/** A Prisma double that hands back a fixed row set for the source under test. */
function makePrisma(model, rows) {
  const delegate = {
    findMany: jest.fn().mockResolvedValue(rows),
    count: jest.fn().mockResolvedValue(rows.length),
  };
  return { [model]: delegate, __delegate: delegate };
}

const OPPS = [
  { id: 1, name: 'Alpha', amount: 100, stage: 'proposal',   is_won: false, is_closed: false, probability: 40, close_date: new Date('2026-01-15'), owner_id: 'E1', owner: { employee_name: 'Ann' } },
  { id: 2, name: 'Bravo', amount: 300, stage: 'closed_won', is_won: true,  is_closed: true,  probability: 100, close_date: new Date('2026-02-20'), owner_id: 'E1', owner: { employee_name: 'Ann' } },
  { id: 3, name: 'Cee',   amount: 600, stage: 'closed_won', is_won: true,  is_closed: true,  probability: 100, close_date: new Date('2026-02-25'), owner_id: 'E2', owner: { employee_name: 'Bob' } },
  { id: 4, name: 'Delta', amount: null, stage: 'proposal',  is_won: false, is_closed: false, probability: 10, close_date: null,                   owner_id: 'E2', owner: { employee_name: 'Bob' } },
];

const run = (config, rows = OPPS, ctx = {}) => {
  const prisma = makePrisma('crmOpportunity', rows);
  const svc = new ReportService(prisma);
  return svc.run({ source: 'opportunities', ...config }, ctx).then((r) => ({ ...r, prisma }));
};

describe('report registry', () => {
  it('exposes related-object fields as dotted keys with a readable label', () => {
    const f = getField('opportunities', 'owner.employee_name');
    expect(f).toMatchObject({ via: 'owner', leaf: 'employee_name', related: true, label: 'Owner ▸ Name' });
  });

  it('builds a Prisma select tree for only the relations a config touches', () => {
    expect(relationSelect('cases', ['account.industry', 'owner.employee_name', 'priority']))
      .toEqual({ account: { select: { industry: true } }, owner: { select: { employee_name: true } } });
    expect(relationSelect('cases', ['priority'])).toBeNull();
  });

  it('gives every source a description and every field a label and type', () => {
    for (const s of Object.values(SOURCES)) {
      expect(typeof s.description).toBe('string');
      for (const f of allFields(s.key)) {
        expect(f.label).toEqual(expect.any(String));
        expect(['string', 'enum', 'number', 'currency', 'percent', 'date', 'boolean']).toContain(f.type);
      }
    }
  });
});

describe('ReportService — filters', () => {
  it('combines two filters on the SAME field instead of overwriting one', async () => {
    const { prisma } = await run({
      viz: 'table',
      filters: { logic: 'AND', conditions: [
        { field: 'amount', op: 'gte', value: 100 },
        { field: 'amount', op: 'lte', value: 500 },
      ] },
    });
    const { where } = prisma.__delegate.findMany.mock.calls[0][0];
    expect(where).toEqual({ AND: [{ amount: { gte: 100 } }, { amount: { lte: 500 } }] });
  });

  it('supports OR groups nested inside an AND group', async () => {
    const { prisma } = await run({
      viz: 'table',
      filters: { logic: 'AND', conditions: [
        { field: 'is_closed', op: 'equals', value: false },
        { logic: 'OR', conditions: [
          { field: 'stage', op: 'equals', value: 'proposal' },
          { field: 'amount', op: 'gt', value: 500 },
        ] },
      ] },
    });
    const { where } = prisma.__delegate.findMany.mock.calls[0][0];
    expect(where).toEqual({
      AND: [
        { is_closed: false },
        { OR: [{ stage: 'proposal' }, { amount: { gt: 500 } }] },
      ],
    });
  });

  it('routes a related-field filter through its relation', async () => {
    const { prisma } = await run({
      viz: 'table',
      filters: [{ field: 'owner.employee_name', op: 'equals', value: 'Ann' }],
    });
    const { where } = prisma.__delegate.findMany.mock.calls[0][0];
    expect(where).toEqual({ owner: { employee_name: 'Ann' } });
  });

  it('accepts the legacy flat filter array', async () => {
    const { prisma } = await run({ viz: 'table', filters: [{ field: 'stage', op: 'equals', value: 'proposal' }] });
    expect(prisma.__delegate.findMany.mock.calls[0][0].where).toEqual({ stage: 'proposal' });
  });

  it('warns instead of throwing when a filter names an unavailable field', async () => {
    const res = await run({ viz: 'table', filters: [{ field: 'nope', op: 'equals', value: 1 }] });
    expect(res.meta.warnings.join(' ')).toMatch(/nope/);
    expect(res.prisma.__delegate.findMany.mock.calls[0][0].where).toEqual({});
  });

  it('turns a relative date preset into a bounded window', async () => {
    const { prisma } = await run({ viz: 'table', filters: [{ field: 'close_date', op: 'date_range', value: 'this_year' }] });
    const clause = prisma.__delegate.findMany.mock.calls[0][0].where.close_date;
    expect(clause.gte).toBeInstanceOf(Date);
    expect(clause.lt).toBeInstanceOf(Date);
    expect(clause.gte.getFullYear()).toBe(new Date().getFullYear());
  });

  it('selects only the columns the config references', async () => {
    const { prisma } = await run({
      viz: 'bar',
      group_by: [{ field: 'stage' }],
      metrics: [{ agg: 'sum', field: 'amount' }],
    });
    const { select } = prisma.__delegate.findMany.mock.calls[0][0];
    expect(select).toEqual({ id: true, stage: true, amount: true });
  });
});

describe('ReportService — aggregation', () => {
  it('groups and sums, sorting by the first measure descending', async () => {
    const res = await run({
      viz: 'bar',
      group_by: [{ field: 'stage' }],
      metrics: [{ agg: 'sum', field: 'amount', label: 'Value' }, { agg: 'count', label: 'Deals' }],
    });
    expect(res.rows.map((r) => [r.stage, r.m0, r.m1])).toEqual([
      ['closed_won', 900, 2],
      ['proposal', 100, 2],
    ]);
  });

  it('groups on a related field', async () => {
    const res = await run({
      viz: 'bar',
      group_by: [{ field: 'owner.employee_name' }],
      metrics: [{ agg: 'sum', field: 'amount' }],
    });
    expect(res.rows.map((r) => [r['owner.employee_name'], r.m0])).toEqual([['Bob', 600], ['Ann', 400]]);
  });

  it('buckets a numeric field into named bands', async () => {
    const res = await run({
      viz: 'bar',
      group_by: [{ field: 'amount', buckets: [
        { label: 'Small', max: 200 },
        { label: 'Large', min: 200 },
      ], other_label: 'No amount' }],
      metrics: [{ agg: 'count' }],
    });
    expect(Object.fromEntries(res.rows.map((r) => [r.amount, r.m0])))
      .toEqual({ Large: 2, Small: 1, 'No amount': 1 });
  });

  it('buckets enum values into named groups', async () => {
    const res = await run({
      viz: 'bar',
      group_by: [{ field: 'stage', buckets: [{ label: 'Open', values: ['proposal'] }, { label: 'Won', values: ['closed_won'] }] }],
      metrics: [{ agg: 'count' }],
    });
    expect(Object.fromEntries(res.rows.map((r) => [r.stage, r.m0]))).toEqual({ Open: 2, Won: 2 });
  });

  it('buckets dates by month', async () => {
    const res = await run({
      viz: 'line',
      group_by: [{ field: 'close_date', period: 'month' }],
      metrics: [{ agg: 'count' }],
    });
    expect(res.rows.map((r) => r.close_date)).toEqual(['2026-01', '2026-02', '—']);
  });

  it('marks the grouping column as a dimension so renderers can find the axis', async () => {
    const res = await run({ viz: 'bar', group_by: [{ field: 'stage' }], metrics: [{ agg: 'count' }] });
    expect(res.columns[0]).toMatchObject({ key: 'stage', dimension: true });
    expect(res.columns[1].dimension).toBeUndefined();
  });
});

describe('ReportService — formulas', () => {
  it('divides one measure by another', async () => {
    const res = await run({
      viz: 'table',
      group_by: [{ field: 'stage' }],
      metrics: [
        { agg: 'count', label: 'Deals' },
        { agg: 'sum', field: 'amount', label: 'Value' },
        { agg: 'formula', label: 'Avg', formula: { op: 'divide', a: 'm1', b: 'm0' } },
      ],
    });
    const won = res.rows.find((r) => r.stage === 'closed_won');
    expect(won.m2).toBe(450);
  });

  it('expresses a measure as a percentage of the column total', async () => {
    const res = await run({
      viz: 'table',
      group_by: [{ field: 'stage' }],
      metrics: [
        { agg: 'sum', field: 'amount', label: 'Value' },
        { agg: 'formula', label: 'Share', formula: { op: 'percent_of_total', a: 'm0' } },
      ],
    });
    expect(res.rows.find((r) => r.stage === 'closed_won').m1).toBe(90);
    expect(res.rows.find((r) => r.stage === 'proposal').m1).toBe(10);
  });

  it('returns null rather than Infinity when dividing by zero', async () => {
    const res = await run({
      viz: 'table',
      group_by: [{ field: 'stage' }],
      metrics: [
        { agg: 'sum', field: 'amount' },
        { agg: 'formula', formula: { op: 'divide', a: 'm0', b: 0 } },
      ],
    });
    expect(res.rows.every((r) => r.m1 === null)).toBe(true);
  });

  it('types a percentage formula as a percent and labels it in plain English', async () => {
    const res = await run({
      viz: 'table',
      group_by: [{ field: 'stage' }],
      metrics: [
        { agg: 'sum', field: 'amount', label: 'Paid' },
        { agg: 'sum', field: 'probability', label: 'Premium' },
        { agg: 'formula', formula: { op: 'percent_of', a: 'm0', b: 'm1' } },
      ],
    });
    const col = res.columns.find((c) => c.key === 'm2');
    expect(col.type).toBe('percent');
    expect(col.label).toBe('Paid % Premium');
  });
});

describe('ReportService — totals', () => {
  it('sums a sum, but recomputes an average weighted by row count', async () => {
    const res = await run({
      viz: 'table',
      totals: true,
      group_by: [{ field: 'stage' }],
      metrics: [
        { agg: 'sum', field: 'amount' },
        { agg: 'avg', field: 'amount' },
        { agg: 'count' },
      ],
    });
    expect(res.summary.grand.m0).toBe(1000);
    // 4 rows scanned, amounts 100/300/600/null → weighted avg over the buckets
    expect(res.summary.grand.m1).toBeCloseTo(333.33, 1);
    expect(res.summary.grand.m2).toBe(4);
  });

  it('leaves a distinct-count total blank rather than reporting a wrong number', async () => {
    const res = await run({
      viz: 'table', totals: true,
      group_by: [{ field: 'stage' }],
      metrics: [{ agg: 'count_distinct', field: 'owner_id' }],
    });
    expect(res.summary.grand.m0).toBeNull();
  });

  it('adds a subtotal per first dimension for a two-dimension matrix', async () => {
    const res = await run({
      viz: 'pivot', totals: true,
      group_by: [{ field: 'stage' }, { field: 'owner.employee_name' }],
      metrics: [{ agg: 'sum', field: 'amount' }],
    });
    const labels = res.summary.subtotals.map((s) => s.value);
    expect(labels).toContain('closed_won');
    expect(res.summary.subtotals.find((s) => s.value === 'closed_won').values.m0).toBe(900);
  });

  it('totals the numeric columns of an ungrouped table', async () => {
    const res = await run({ viz: 'table', totals: true, columns: ['name', 'amount'] });
    expect(res.summary.grand.amount).toBe(1000);
  });
});

describe('ReportService — comparison', () => {
  // Two years of monthly data, so a year-over-year comparison has real counterparts.
  const DATED = [
    { id: 1, close_date: new Date('2025-03-10'), amount: 100, stage: 'closed_won' },
    { id: 2, close_date: new Date('2025-04-10'), amount: 200, stage: 'closed_won' },
    { id: 3, close_date: new Date('2026-03-10'), amount: 150, stage: 'closed_won' },
    { id: 4, close_date: new Date('2026-04-10'), amount: 400, stage: 'closed_won' },
  ];

  /** A Prisma double that honours whatever close_date window the engine asks for. */
  function datedPrisma(rows = DATED) {
    const windowOf = (where) =>
      where?.close_date ?? (where?.AND || []).map((a) => a.close_date).find(Boolean);
    return {
      crmOpportunity: {
        findMany: jest.fn(async ({ where }) => {
          const w = windowOf(where);
          if (!w) return rows;
          return rows.filter((r) => (
            (!w.gte || r.close_date >= w.gte)
            && (!w.lt || r.close_date < w.lt)
            && (!w.lte || r.close_date <= w.lte)
          ));
        }),
      },
    };
  }

  const monthly = (over = {}) => ({
    source: 'opportunities',
    viz: 'line',
    group_by: [{ field: 'close_date', period: 'month' }],
    metrics: [{ agg: 'sum', field: 'amount', label: 'Won' }],
    ...over,
  });

  const deltaFor = (res, label, key = 'm0') =>
    res.comparison.rows[res.rows.findIndex((r) => r.close_date === label)][`${key}__delta_pct`];

  it('aligns prior date buckets onto the current labels so deltas actually match', async () => {
    // Regression: the prior window produces "2025-03" labels while the current rows are
    // "2026-03", so joining on the raw label matched nothing and every delta was 0/null.
    const res = await new ReportService(datedPrisma()).run(monthly({
      filters: [{ field: 'close_date', op: 'date_range', value: 'this_year' }],
      compare: 'previous_year',
    }));
    expect(res.comparison.matched).toBe(2);
    expect(deltaFor(res, '2026-03')).toBe(50);   // 150 vs 100
    expect(deltaFor(res, '2026-04')).toBe(100);  // 400 vs 200
  });

  it('derives the period from a date grouping when there is no date filter at all', async () => {
    const res = await new ReportService(datedPrisma()).run(monthly({ compare: 'previous_year' }));
    expect(res.meta.warnings).toEqual([]);
    expect(res.comparison.label).toBe('Same period last year');
    expect(deltaFor(res, '2026-03')).toBe(50);
  });

  it('treats previous_period on a monthly report as the preceding month', async () => {
    const res = await new ReportService(datedPrisma()).run(monthly({ compare: 'previous_period' }));
    expect(res.comparison.label).toBe('Previous month');
    expect(deltaFor(res, '2026-04')).toBe(166.7); // 400 vs 150
  });

  it('accepts an explicit "is between" window, not only a relative preset', async () => {
    const res = await new ReportService(datedPrisma()).run(monthly({
      filters: [{ field: 'close_date', op: 'between', value: ['2026-01-01', '2026-12-31'] }],
      compare: 'previous_year',
    }));
    expect(res.comparison.matched).toBe(2);
    expect(deltaFor(res, '2026-03')).toBe(50);
  });

  it('leaves a bucket with no counterpart null rather than implying a rise from zero', async () => {
    const res = await new ReportService(datedPrisma()).run(monthly({ compare: 'previous_year' }));
    // 2025 buckets have no 2024 counterpart.
    const cmp = res.comparison.rows[res.rows.findIndex((r) => r.close_date === '2025-03')];
    expect(cmp.m0).toBeNull();
    expect(cmp.m0__delta).toBeNull();
    expect(cmp.m0__delta_pct).toBeNull();
  });

  it('asks for a period when the date filter has no value chosen yet', async () => {
    const res = await new ReportService(datedPrisma()).run(monthly({
      filters: [{ field: 'close_date', op: 'date_range', value: '' }],
      compare: 'previous_year',
    }));
    expect(res.comparison).toBeNull();
    expect(res.meta.warnings.join(' ')).toMatch(/Pick a period/i);
  });

  it('explains that the earlier period is empty instead of a column of blanks', async () => {
    // Only 2026 data — the prior year has nothing at all.
    const only2026 = DATED.filter((r) => r.close_date.getFullYear() === 2026);
    const res = await new ReportService(datedPrisma(only2026)).run(monthly({
      filters: [{ field: 'close_date', op: 'date_range', value: 'this_year' }],
      compare: 'previous_year',
    }));
    expect(res.comparison).toBeNull();
    expect(res.meta.warnings.join(' ')).toMatch(/no data in the same period last year/i);
  });

  it('names both remedies when neither a date grouping nor a date window exists', async () => {
    const res = await run({
      viz: 'bar', group_by: [{ field: 'stage' }], metrics: [{ agg: 'count' }], compare: 'previous_period',
    });
    expect(res.comparison).toBeNull();
    expect(res.meta.warnings.join(' ')).toMatch(/group this report by a date/i);
    expect(res.meta.warnings.join(' ')).toMatch(/is within/i);
  });

  it('still compares a non-date grouping when the filters supply the window', async () => {
    const prisma = datedPrisma();
    const res = await new ReportService(prisma).run({
      source: 'opportunities',
      viz: 'bar',
      group_by: [{ field: 'stage' }],
      metrics: [{ agg: 'sum', field: 'amount' }],
      filters: [{ field: 'close_date', op: 'date_range', value: 'this_year' }],
      compare: 'previous_year',
    });
    // 2026 total 550 vs 2025 total 300.
    const won = res.comparison.rows[res.rows.findIndex((r) => r.stage === 'closed_won')];
    expect(won.m0).toBe(300);
    expect(won.m0__delta).toBe(250);
  });
});

describe('ReportService — drill-down', () => {
  it('replays a value bucket as an equality filter', async () => {
    const prisma = makePrisma('crmOpportunity', OPPS);
    await new ReportService(prisma).runDrilldown(
      { source: 'opportunities', group_by: [{ field: 'stage' }], filters: [{ field: 'is_closed', op: 'equals', value: true }] },
      { stage: 'closed_won' },
    );
    const { where } = prisma.crmOpportunity.findMany.mock.calls[0][0];
    expect(where).toEqual({ AND: [{ is_closed: true }, { stage: 'closed_won' }] });
  });

  it('replays a month bucket as the matching date window', async () => {
    const prisma = makePrisma('crmOpportunity', OPPS);
    await new ReportService(prisma).runDrilldown(
      { source: 'opportunities', group_by: [{ field: 'close_date', period: 'month' }] },
      { close_date: '2026-02' },
    );
    const clause = prisma.crmOpportunity.findMany.mock.calls[0][0].where.AND[1].close_date;
    expect(clause.gte.getMonth()).toBe(1);
    expect(clause.lt.getMonth()).toBe(2);
  });

  it('replays a numeric band as a range filter', async () => {
    const prisma = makePrisma('crmOpportunity', OPPS);
    await new ReportService(prisma).runDrilldown(
      { source: 'opportunities', group_by: [{ field: 'amount', buckets: [{ label: 'Large', min: 200 }] }] },
      { amount: 'Large' },
    );
    expect(prisma.crmOpportunity.findMany.mock.calls[0][0].where.AND[1]).toEqual({ amount: { gte: 200 } });
  });
});

describe('ReportService — export', () => {
  const result = {
    columns: [{ key: 'stage', label: 'Stage', type: 'enum' }, { key: 'm0', label: 'Value', type: 'currency' }],
    rows: [{ stage: 'closed_won', m0: 900 }, { stage: 'pro, posal', m0: 100 }],
    summary: { grand: { m0: 1000 } },
    meta: { row_count: 2, generated_at: new Date().toISOString() },
  };

  it('quotes a value containing a comma and appends the total row', () => {
    const csv = new ReportService({}).toCsv(result);
    const lines = csv.split('\n');
    expect(lines[0]).toBe('Stage,Value');
    expect(lines[2]).toBe('"pro, posal",100');
    expect(lines[3]).toBe('Total,1000');
  });

  it('produces a non-empty xlsx workbook buffer', () => {
    const buf = new ReportService({}).toXlsx(result, 'Pipeline');
    expect(Buffer.isBuffer(buf)).toBe(true);
    expect(buf.length).toBeGreaterThan(0);
  });

  it('escapes report content when rendering print/email HTML', () => {
    const html = new ReportService({}).toHtml(
      { ...result, rows: [{ stage: '<script>x</script>', m0: 1 }] },
      { name: 'A & B <b>' },
    );
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('A &amp; B');
  });
});

describe('report templates', () => {
  const templates = getTemplates();

  it('ships a starter report for every category the UI groups by', () => {
    for (const cat of ['sales', 'support', 'productivity']) {
      expect(templates.some((t) => t.category === cat)).toBe(true);
    }
  });

  it('only references fields that exist on its source', () => {
    for (const t of templates) {
      const keys = [];
      for (const g of t.config.group_by || []) keys.push(g.field);
      for (const m of t.config.metrics || []) if (m.field) keys.push(m.field);
      for (const c of t.config.columns || []) if (typeof c === 'string') keys.push(c);
      const walk = (n) => { for (const c of n?.conditions || []) (c.conditions ? walk(c) : keys.push(c.field)); };
      walk(t.config.filters);
      for (const k of keys) {
        expect(getField(t.config.source, k)).not.toBeNull();
      }
    }
  });

  it('states the business question each template answers', () => {
    for (const t of templates) {
      expect(t.question).toEqual(expect.any(String));
      expect(t.question.length).toBeGreaterThan(10);
    }
  });

  it('runs every template against a stub datasource without throwing', async () => {
    for (const t of templates) {
      const model = SOURCES[t.config.source].model;
      const svc = new ReportService(makePrisma(model, []));
      const res = await svc.run(t.config, { scope: 'all' });
      expect(res.meta.source).toBe(t.config.source);
    }
  });
});
