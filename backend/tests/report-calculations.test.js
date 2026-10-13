'use strict';

jest.mock('@prisma/client');

const ReportService = require('../src/services/report.service');
const { resolveWindow, applyParameters, applyGlobalFilters, CALCULATIONS, DATE_PRESETS } = require('../src/services/report.service');
const { getSource } = require('../src/services/report-registry');
const { computeInsights, linearSlope } = require('../src/services/report-insights');
const { appendSnapshot, listSnapshots, MAX_SNAPSHOTS } = require('../src/services/report-snapshots');

const OPPS = [
  { id: 1, amount: 100, stage: 'proposal',    is_won: false, is_closed: false, close_date: new Date('2026-01-15'), owner_id: 'E1', owner: { employee_name: 'Ann' } },
  { id: 2, amount: 300, stage: 'closed_won',  is_won: true,  is_closed: true,  close_date: new Date('2026-02-20'), owner_id: 'E1', owner: { employee_name: 'Ann' } },
  { id: 3, amount: 600, stage: 'closed_won',  is_won: true,  is_closed: true,  close_date: new Date('2026-02-25'), owner_id: 'E2', owner: { employee_name: 'Bob' } },
  { id: 4, amount: 250, stage: 'negotiation', is_won: false, is_closed: false, close_date: new Date('2026-03-05'), owner_id: 'E2', owner: { employee_name: 'Bob' } },
  { id: 5, amount: 50,  stage: 'qualification', is_won: false, is_closed: false, close_date: new Date('2026-04-05'), owner_id: 'E2', owner: { employee_name: 'Bob' } },
];

function makePrisma(rows) {
  const delegate = { findMany: jest.fn().mockResolvedValue(rows) };
  return { crmOpportunity: delegate, __delegate: delegate };
}
const run = (config, ctx = {}, rows = OPPS) => {
  const prisma = makePrisma(rows);
  return new ReportService(prisma).run({ source: 'opportunities', ...config }, ctx).then((r) => ({ ...r, prisma }));
};
const monthly = (metrics, extra = {}) => ({
  viz: 'bar', group_by: [{ field: 'close_date', period: 'month' }], metrics, totals: true, ...extra,
});

describe('table calculations ("show as")', () => {
  it('computes a running total along the sorted result and totals it like the base measure', async () => {
    const r = await run(monthly([{ agg: 'sum', field: 'amount' }, { agg: 'sum', field: 'amount', calc: 'running_total' }]));
    expect(r.rows.map((x) => x.m1)).toEqual([100, 1000, 1250, 1300]);
    expect(r.summary.grand.m1).toBe(1300);
    expect(r.columns.find((c) => c.key === 'm1')).toMatchObject({ label: 'Sum of Amount (running total)', type: 'currency' });
  });

  it('expresses each row as a percentage of the column total, summing to 100', async () => {
    const r = await run(monthly([{ agg: 'sum', field: 'amount', calc: 'percent_of_total' }]));
    expect(r.rows.map((x) => x.m0)).toEqual([7.7, 69.2, 19.2, 3.8]);
    expect(r.columns[1].type).toBe('percent');
    expect(r.summary.grand.m0).toBe(100);
  });

  it('ranks rows with 1 as the largest and leaves the total blank', async () => {
    const r = await run(monthly([{ agg: 'sum', field: 'amount', calc: 'rank' }]));
    expect(r.rows.map((x) => x.m0)).toEqual([3, 1, 2, 4]);
    expect(r.summary.grand.m0).toBeNull();
  });

  it('computes change and percent change from the previous row, null on the first', async () => {
    const r = await run(monthly([
      { agg: 'sum', field: 'amount', calc: 'difference' },
      { agg: 'sum', field: 'amount', calc: 'percent_change' },
    ]));
    expect(r.rows.map((x) => x.m0)).toEqual([null, 800, -650, -200]);
    expect(r.rows.map((x) => x.m1)).toEqual([null, 800, -72.2, -80]);
  });

  it('averages over a trailing window of three', async () => {
    const r = await run(monthly([{ agg: 'sum', field: 'amount', calc: 'moving_avg' }]));
    expect(r.rows.map((x) => x.m0)).toEqual([100, 500, 416.67, 400]);
  });

  it('runs the calculation over the full result before a row limit is applied', async () => {
    const r = await run(monthly([{ agg: 'sum', field: 'amount', calc: 'running_total' }], { limit: 2 }));
    expect(r.rows).toHaveLength(2);
    expect(r.summary.hidden_rows).toBe(2);
    expect(r.summary.grand.m0).toBe(1300);
  });

  it('partitions by the second dimension so a running total restarts per series', async () => {
    const r = await run({
      viz: 'pivot', totals: true,
      group_by: [{ field: 'close_date', period: 'month' }, { field: 'owner.employee_name' }],
      metrics: [{ agg: 'sum', field: 'amount', calc: 'running_total' }],
      sort: [{ key: 'close_date', dir: 'asc' }],
    });
    const ann = r.rows.filter((x) => x['owner.employee_name'] === 'Ann').map((x) => x.m0);
    const bob = r.rows.filter((x) => x['owner.employee_name'] === 'Bob').map((x) => x.m0);
    expect(ann).toEqual([100, 400]);
    expect(bob).toEqual([600, 850, 900]);
  });

  it('ignores an unknown calculation and publishes the list in the vocabulary', async () => {
    const r = await run(monthly([{ agg: 'sum', field: 'amount', calc: 'nope' }]));
    expect(r.rows[0].m0).toBe(100);
    const vocab = new ReportService(makePrisma([])).getVocabulary();
    expect(vocab.calculations).toBe(CALCULATIONS);
    expect(vocab.calculations.map((c) => c.key)).toContain('running_total');
  });

  it('keeps a custom label over the generated one', async () => {
    const r = await run(monthly([{ agg: 'sum', field: 'amount', calc: 'rank', label: 'Position' }]));
    expect(r.columns[1].label).toBe('Position');
  });
});

describe('date presets', () => {
  const now = new Date(2026, 8, 5, 12); // 5 Sep 2026

  it('covers month, quarter and year to date up to and including today', () => {
    expect(resolveWindow('month_to_date', { now })).toEqual({ gte: new Date(2026, 8, 1), lt: new Date(2026, 8, 6) });
    expect(resolveWindow('quarter_to_date', { now })).toEqual({ gte: new Date(2026, 6, 1), lt: new Date(2026, 8, 6) });
    expect(resolveWindow('year_to_date', { now })).toEqual({ gte: new Date(2026, 0, 1), lt: new Date(2026, 8, 6) });
  });

  it('rolls the last 12 months back to the start of the month a year ago', () => {
    expect(resolveWindow('last_12_months', { now })).toEqual({ gte: new Date(2025, 9, 1), lt: new Date(2026, 8, 6) });
  });

  it('names a fiscal year by the calendar year it starts in', () => {
    const april = { now, fiscalStart: 4 };
    expect(resolveWindow('this_fiscal_year', april)).toEqual({ gte: new Date(2026, 3, 1), lt: new Date(2027, 3, 1) });
    expect(resolveWindow('last_fiscal_year', april)).toEqual({ gte: new Date(2025, 3, 1), lt: new Date(2026, 3, 1) });
    expect(resolveWindow('fiscal_year_to_date', april)).toEqual({ gte: new Date(2026, 3, 1), lt: new Date(2026, 8, 6) });
    // Before the start month, the current fiscal year began last calendar year.
    const feb = { now: new Date(2026, 1, 10), fiscalStart: 4 };
    expect(resolveWindow('this_fiscal_year', feb)).toEqual({ gte: new Date(2025, 3, 1), lt: new Date(2026, 3, 1) });
  });

  it('treats a missing or invalid fiscal start as January, so it equals the calendar year', () => {
    expect(resolveWindow('this_fiscal_year', { now })).toEqual(resolveWindow('this_year', { now }));
    expect(resolveWindow('this_fiscal_year', { now, fiscalStart: 13 })).toEqual(resolveWindow('this_year', { now }));
  });

  it('publishes every preset the resolver understands, and marks the fiscal ones', () => {
    for (const p of DATE_PRESETS) expect(resolveWindow(p.key, { now, fiscalStart: 4 })).not.toBeNull();
    expect(DATE_PRESETS.filter((p) => p.fiscal).map((p) => p.key)).toEqual(['this_fiscal_year', 'last_fiscal_year', 'fiscal_year_to_date']);
  });

  it('threads the tenant fiscal month from the run context into the query', async () => {
    const { prisma } = await run({
      viz: 'table',
      filters: { logic: 'AND', conditions: [{ field: 'close_date', op: 'date_range', value: 'this_fiscal_year' }] },
    }, { fiscal_year_start_month: 4 });
    const { where } = prisma.__delegate.findMany.mock.calls[0][0];
    expect(where.close_date.gte.getMonth()).toBe(3);
    expect(where.close_date.gte.getDate()).toBe(1);
  });
});

describe('prompted filters (runtime parameters)', () => {
  const tree = {
    logic: 'AND',
    conditions: [
      { field: 'stage', op: 'in', value: ['proposal'], prompt: true, label: 'Stage' },
      { field: 'amount', op: 'gte', value: 100 },
      { logic: 'OR', conditions: [{ field: 'owner_id', op: 'equals', value: 'E1', prompt: true, param: 'who' }] },
    ],
  };

  it('uses the builder value as the default when no answer is given', () => {
    const out = applyParameters(tree, undefined);
    expect(out.conditions[0].value).toEqual(['proposal']);
    expect(out.conditions[2].conditions[0].value).toBe('E1');
  });

  it('substitutes an answer, keyed by param name or field', () => {
    const out = applyParameters(tree, { stage: ['closed_won'], who: 'E2' });
    expect(out.conditions[0].value).toEqual(['closed_won']);
    expect(out.conditions[2].conditions[0].value).toBe('E2');
  });

  it('drops a prompted condition whose answer is blank — blank means "any"', () => {
    const out = applyParameters(tree, { stage: '' });
    expect(out.conditions.map((c) => c.field)).toEqual(['amount', undefined]);
    expect(out.conditions[1].conditions).toHaveLength(1);
  });

  it('never touches an un-prompted condition', () => {
    const out = applyParameters(tree, { amount: 999 });
    expect(out.conditions[1].value).toBe(100);
  });

  it('describes the prompts on the result so a viewer can be shown a parameter bar', async () => {
    const r = await run({ viz: 'table', filters: tree }, { params: { who: 'E2' } });
    expect(r.meta.parameters).toEqual([
      expect.objectContaining({ key: 'stage', label: 'Stage', type: 'enum', op: 'in', multi: true, default: ['proposal'], value: ['proposal'], options: expect.arrayContaining(['proposal']) }),
      expect.objectContaining({ key: 'who', field: 'owner_id', label: 'Owner', value: 'E2', default: 'E1' }),
    ]);
    const { where } = r.prisma.__delegate.findMany.mock.calls[0][0];
    expect(JSON.stringify(where)).toContain('"E2"');
  });

  it('resolves a prompted date preset to a concrete window in the description', async () => {
    const r = await run({ viz: 'table', filters: { logic: 'AND', conditions: [{ field: 'close_date', op: 'date_range', value: 'this_year', prompt: true }] } });
    const from = new Date(r.meta.parameters[0].window.from);
    expect([from.getFullYear(), from.getMonth(), from.getDate()]).toEqual([new Date().getFullYear(), 0, 1]);
  });
});

describe('dashboard-level (global) filters', () => {
  const source = getSource('opportunities');
  const base = { logic: 'AND', conditions: [{ field: 'stage', op: 'equals', value: 'proposal' }] };

  it('ANDs a date range onto the source primary date and an owner onto the owner field', () => {
    const warnings = [];
    const out = applyGlobalFilters(source, base, { date_range: 'this_quarter', owner: ['E1', 'E2'] }, warnings);
    expect(out.logic).toBe('AND');
    expect(out.conditions[0]).toBe(base);
    expect(out.conditions[1]).toEqual({ field: 'created_at', op: 'date_range', value: 'this_quarter' });
    expect(out.conditions[2]).toEqual({ field: 'owner_id', op: 'in', value: ['E1', 'E2'] });
    expect(warnings).toEqual([]);
  });

  it('leaves the tree alone when there is nothing to apply', () => {
    expect(applyGlobalFilters(source, base, null, [])).toBe(base);
    expect(applyGlobalFilters(source, base, { date_range: '' }, [])).toBe(base);
  });

  it('accepts an explicit [from, to] pair and reports it on the result meta', async () => {
    const r = await run({ viz: 'table' }, { global: { date_range: ['2026-01-01', '2026-03-31'] } });
    const { where } = r.prisma.__delegate.findMany.mock.calls[0][0];
    expect(where.created_at.gte).toEqual(new Date('2026-01-01'));
    expect(r.meta.global).toEqual({ date_range: ['2026-01-01', '2026-03-31'] });
  });

  it('is a restriction even under an OR filter', async () => {
    const r = await run({
      viz: 'table',
      filters: { logic: 'OR', conditions: [{ field: 'stage', op: 'equals', value: 'proposal' }, { field: 'stage', op: 'equals', value: 'negotiation' }] },
    }, { global: { date_range: 'this_year' } });
    const { where } = r.prisma.__delegate.findMany.mock.calls[0][0];
    expect(where.AND).toHaveLength(2);
    expect(where.AND[0].OR).toHaveLength(2);
    expect(where.AND[1].created_at).toBeDefined();
  });
});

describe('insights', () => {
  it('names the leader, its share, and the concentration of the top groups', async () => {
    const rows = ['A', 'B', 'C', 'D', 'E', 'F'].map((s, i) => ({ id: i, amount: [500, 300, 150, 20, 20, 10][i], stage: s, close_date: null, owner_id: 'E1' }));
    const r = await run({ viz: 'bar', group_by: [{ field: 'stage' }], metrics: [{ agg: 'sum', field: 'amount' }], totals: true }, {}, rows);
    const kinds = r.insights.map((i) => i.kind);
    expect(kinds).toContain('leader');
    expect(kinds).toContain('concentration');
    expect(r.insights.find((i) => i.kind === 'leader').title).toMatch(/^A leads with 50% of/);
  });

  it('reads a monthly series as a trend with its peak, and flags a big latest move', async () => {
    const r = await run(monthly([{ agg: 'sum', field: 'amount' }]));
    const kinds = r.insights.map((i) => i.kind);
    expect(kinds).toEqual(expect.arrayContaining(['trend', 'peak', 'latest_move']));
    expect(r.insights.find((i) => i.kind === 'peak').title).toBe('2026-02 was the peak at $900');
  });

  it('warns when a large share of a measure has no grouping value', async () => {
    const rows = [{ id: 1, amount: 900, stage: null }, { id: 2, amount: 100, stage: 'proposal' }, { id: 3, amount: 50, stage: 'negotiation' }];
    const r = await run({ viz: 'bar', group_by: [{ field: 'stage' }], metrics: [{ agg: 'sum', field: 'amount' }], totals: true }, {}, rows);
    expect(r.insights[0]).toMatchObject({ kind: 'data_quality', severity: 'warn' });
  });

  it('flags an outlier more than two standard deviations from the mean', () => {
    const result = {
      columns: [{ key: 'g', label: 'Group', type: 'string', dimension: true }, { key: 'm0', label: 'Count', type: 'number' }],
      rows: [10, 11, 9, 10, 12, 10, 95].map((v, i) => ({ g: `G${i}`, m0: v })),
      meta: {},
    };
    const out = computeInsights(result, { metrics: [{ agg: 'count' }] });
    expect(out.find((i) => i.kind === 'outlier')).toMatchObject({ rows: ['G6'] });
  });

  it('reports the biggest movers when a comparison is present', () => {
    const result = {
      columns: [{ key: 'g', label: 'Owner', type: 'string', dimension: true }, { key: 'm0', label: 'Revenue', type: 'currency' }],
      rows: [{ g: 'Ann', m0: 500 }, { g: 'Bob', m0: 200 }, { g: 'Cy', m0: 100 }],
      summary: { grand: { m0: 800 } },
      comparison: { label: 'Previous period', grand: { m0: 600 }, rows: [{ m0__delta: 300, m0__delta_pct: 150 }, { m0__delta: -100, m0__delta_pct: -33.3 }, { m0__delta: 0, m0__delta_pct: 0 }] },
      meta: {},
    };
    const out = computeInsights(result, { metrics: [{ agg: 'sum', field: 'amount' }] });
    expect(out.find((i) => i.kind === 'overall_change').title).toBe('Revenue is +33.3% previous period');
    expect(out.find((i) => i.kind === 'mover_up').rows).toEqual(['Ann']);
    expect(out.find((i) => i.kind === 'mover_down').rows).toEqual(['Bob']);
  });

  it('says so when nothing matched, and can be switched off per config', async () => {
    const empty = await run({ viz: 'bar', group_by: [{ field: 'stage' }], metrics: [{ agg: 'count' }] }, {}, []);
    expect(empty.insights[0].kind).toBe('empty');
    const off = await run(monthly([{ agg: 'count' }], { insights: false }));
    expect(off.insights).toEqual([]);
  });

  it('never returns more than six insights and never duplicates one', () => {
    const result = {
      columns: [{ key: 'g', label: 'Stage', type: 'string', dimension: true }, { key: 'm0', label: 'Amount', type: 'currency' }],
      rows: Array.from({ length: 30 }, (_, i) => ({ g: `S${i}`, m0: i === 0 ? 5000 : 10 })),
      summary: { grand: { m0: 5290 }, hidden_rows: 3 },
      meta: { capped: true },
    };
    const out = computeInsights(result, { metrics: [{ agg: 'sum', field: 'amount' }] });
    expect(out.length).toBeLessThanOrEqual(6);
    expect(new Set(out.map((i) => i.kind)).size).toBe(out.length);
  });

  it('fits a least-squares slope', () => {
    expect(linearSlope([1, 2, 3, 4])).toBe(1);
    expect(linearSlope([4, 3, 2, 1])).toBe(-1);
    expect(linearSlope([2, 2, 2])).toBe(0);
  });
});

describe('snapshots (trend history)', () => {
  const result = (grand, rows = 3) => ({
    columns: [{ key: 'g', label: 'Stage', type: 'string', dimension: true }, { key: 'm0', label: 'Pipeline', type: 'currency' }],
    rows: Array.from({ length: rows }, (_, i) => ({ g: `S${i}`, m0: 1 })),
    summary: { grand },
    meta: { row_count: rows, grouped: true },
  });

  it('starts a history from an empty legacy column and records the measures', () => {
    const blob = appendSnapshot(null, result({ m0: 1000 }), 'all', new Date('2026-09-01T10:00:00Z'));
    expect(blob.version).toBe(1);
    expect(blob.columns).toEqual([{ key: 'm0', label: 'Pipeline', type: 'currency' }]);
    expect(blob.snapshots).toEqual([{ at: '2026-09-01T10:00:00.000Z', scope: 'all', row_count: 3, grand: { m0: 1000 } }]);
  });

  it('keeps one entry per scope per day — a later run the same day replaces the earlier one', () => {
    let blob = appendSnapshot(null, result({ m0: 1000 }), 'all', new Date('2026-09-01T10:00:00Z'));
    blob = appendSnapshot(blob, result({ m0: 1100 }), 'all', new Date('2026-09-01T15:00:00Z'));
    blob = appendSnapshot(blob, result({ m0: 50 }), 'me', new Date('2026-09-01T15:00:00Z'));
    blob = appendSnapshot(blob, result({ m0: 1200 }), 'all', new Date('2026-09-02T09:00:00Z'));
    expect(blob.snapshots.map((s) => [s.scope, s.grand.m0])).toEqual([['all', 1100], ['me', 50], ['all', 1200]]);
  });

  it('is bounded', () => {
    let blob = null;
    for (let i = 0; i < MAX_SNAPSHOTS + 20; i++) {
      blob = appendSnapshot(blob, result({ m0: i }), 'all', new Date(Date.UTC(2026, 0, 1) + i * 86400000));
    }
    expect(blob.snapshots).toHaveLength(MAX_SNAPSHOTS);
    expect(blob.snapshots[blob.snapshots.length - 1].grand.m0).toBe(MAX_SNAPSHOTS + 19);
  });

  it('sums the additive measures of a grouped report that did not ask for totals, and skips the rest', () => {
    const grouped = {
      columns: [
        { key: 'g', label: 'Type', type: 'string', dimension: true },
        { key: 'm0', label: 'Timers', type: 'number', agg: 'count' },
        { key: 'm1', label: 'Avg', type: 'number', agg: 'avg' },
        { key: 'm2', label: 'Running', type: 'number', agg: 'sum', calc: 'running_total' },
      ],
      rows: [{ g: 'case', m0: 2, m1: 5, m2: 2 }, { g: 'lead', m0: 3, m1: 7, m2: 5 }],
      summary: null,
      meta: { row_count: 2, grouped: true },
    };
    expect(appendSnapshot(null, grouped, 'all').snapshots[0].grand).toEqual({ m0: 5 });
  });

  it('uses the single KPI row as the headline when a report has no totals', () => {
    const kpi = { columns: [{ key: 'm0', label: 'Open deals', type: 'number' }], rows: [{ m0: 42 }], summary: null, meta: { row_count: 1, grouped: true } };
    const blob = appendSnapshot(null, kpi, 'all');
    expect(blob.snapshots[0].grand).toEqual({ m0: 42 });
  });

  it('ignores whatever an old result-cache blob held', () => {
    const blob = appendSnapshot({ columns: [], rows: [{ x: 1 }] }, result({ m0: 5 }), 'all');
    expect(blob.snapshots).toHaveLength(1);
  });

  it('lists a scope’s history and says whether there is enough to trend', () => {
    let blob = appendSnapshot(null, result({ m0: 1 }), 'all', new Date('2026-09-01T10:00:00Z'));
    blob = appendSnapshot(blob, result({ m0: 2 }), 'all', new Date('2026-09-02T10:00:00Z'));
    blob = appendSnapshot(blob, result({ m0: 9 }), 'me', new Date('2026-09-02T10:00:00Z'));
    expect(listSnapshots({ cached_result: blob }, 'all')).toMatchObject({ enough: true, scope: 'all' });
    expect(listSnapshots({ cached_result: blob }, 'all').snapshots).toHaveLength(2);
    expect(listSnapshots({ cached_result: blob }, 'me').enough).toBe(false);
    expect(listSnapshots({ cached_result: null }, 'all')).toEqual({ columns: [], snapshots: [], scope: 'all', enough: false });
  });
});
