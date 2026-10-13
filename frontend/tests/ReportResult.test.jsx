import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import ReportResult from '../src/components/runtime/ReportResult';
import {
  cellFormatClass, describeFormatRule, formatValue, formatDelta, trendOf,
} from '../src/utils/report';
import { normalize, countConditions, repairFilters } from '../src/components/reports/FilterGroupBuilder';
import {
  widgetTypeForReport, shapeForWidgetType, widgetUpdatesForReport,
} from '../src/utils/dashboard';
import { withSeededColumns } from '../src/pages/runtime/ReportBuilderPage';

// Recharts needs a sized container in jsdom; the chart cases here only assert
// that rendering does not throw, so a stub keeps them fast and deterministic.
vi.mock('recharts', async () => {
  const actual = await vi.importActual('recharts');
  return { ...actual, ResponsiveContainer: ({ children }) => <div>{children}</div> };
});

const grouped = {
  columns: [
    { key: 'stage', label: 'Stage', type: 'enum', dimension: true },
    { key: 'm0', label: 'Pipeline value', type: 'currency' },
    { key: 'm1', label: 'Deals', type: 'number' },
  ],
  rows: [
    { stage: 'closed_won', m0: 900, m1: 2 },
    { stage: 'proposal', m0: 100, m1: 2 },
  ],
  summary: { grand: { m0: 1000, m1: 4 }, subtotals: [] },
  comparison: {
    mode: 'previous_period',
    label: 'Previous period',
    rows: [
      { m0: 300, m0__delta: 600, m0__delta_pct: 200, m1: 1, m1__delta: 1, m1__delta_pct: 100 },
      { m0: 100, m0__delta: 0, m0__delta_pct: 0, m1: 2, m1__delta: 0, m1__delta_pct: 0 },
    ],
  },
  meta: { row_count: 2, scanned: 4, warnings: [], grouped: true, drilldown: true, executed_ms: 3, generated_at: new Date().toISOString() },
};

describe('ReportResult — table', () => {
  it('renders a grand total row when the report asked for totals', () => {
    render(<ReportResult result={grouped} viz="table" />);
    expect(screen.getByText('Total')).toBeInTheDocument();
    expect(screen.getByText('$1,000')).toBeInTheDocument();
  });

  it('formats a currency measure as currency and a count as a plain number', () => {
    render(<ReportResult result={grouped} viz="table" />);
    expect(screen.getByText('$900')).toBeInTheDocument();
    expect(screen.getAllByText('2').length).toBeGreaterThan(0);
  });

  it('shows the previous-period value and the percentage change', () => {
    render(<ReportResult result={grouped} viz="table" />);
    expect(screen.getByText('+200%')).toBeInTheDocument();
    expect(screen.getByText('was $300')).toBeInTheDocument();
  });

  it('says "no earlier data" when a bucket has no counterpart, rather than a change', () => {
    const result = {
      ...grouped,
      comparison: {
        mode: 'previous_year',
        label: 'Same period last year',
        rows: [
          { m0: null, m0__delta: null, m0__delta_pct: null, m1: null, m1__delta: null, m1__delta_pct: null },
          { m0: 100, m0__delta: 0, m0__delta_pct: 0, m1: 2, m1__delta: 0, m1__delta_pct: 0 },
        ],
      },
    };
    render(<ReportResult result={result} viz="table" />);
    expect(screen.getAllByText('no earlier data').length).toBe(2); // both measures of row 1
  });

  it('leaves a null total as a dash rather than showing zero', () => {
    const result = {
      ...grouped,
      summary: { grand: { m0: null, m1: 4 }, subtotals: [] },
      comparison: null,
    };
    render(<ReportResult result={result} viz="table" />);
    expect(screen.getByText('—')).toBeInTheDocument();
  });

  it('explains that hidden rows are still counted in the total', () => {
    const result = {
      ...grouped,
      comparison: null,
      summary: { grand: { m0: 1000 }, subtotals: [], hidden_rows: 7 },
    };
    render(<ReportResult result={result} viz="table" />);
    expect(screen.getByText(/includes 7 further rows/i)).toBeInTheDocument();
  });

  it('surfaces engine warnings to the user', () => {
    const result = { ...grouped, comparison: null, meta: { ...grouped.meta, warnings: ['Only the first 20,000 records were included.'] } };
    render(<ReportResult result={result} viz="table" />);
    expect(screen.getByText(/first 20,000 records/)).toBeInTheDocument();
  });

  it('says what to try when nothing matched, instead of just "no data"', () => {
    render(<ReportResult result={{ columns: grouped.columns, rows: [], meta: grouped.meta }} viz="table" />);
    expect(screen.getByText(/No records match this report/i)).toBeInTheDocument();
    expect(screen.getByText(/widening the date range/i)).toBeInTheDocument();
  });

  it('only invites a drill-down click when the config is available', () => {
    const { rerender } = render(<ReportResult result={grouped} viz="table" />);
    expect(screen.queryByText(/Click a row/i)).not.toBeInTheDocument();
    rerender(<ReportResult result={grouped} viz="table" config={{ source: 'opportunities' }} />);
    expect(screen.getByText(/Click a row/i)).toBeInTheDocument();
  });
});

describe('ReportResult — number tiles', () => {
  it('prefers the grand total over the first row for a headline number', () => {
    render(<ReportResult result={grouped} viz="kpi" />);
    expect(screen.getByText('$1,000')).toBeInTheDocument();
    expect(screen.getByText('Pipeline value')).toBeInTheDocument();
  });

  it('shows the change against the comparison period', () => {
    render(<ReportResult result={grouped} viz="kpi" />);
    expect(screen.getByText('+200%')).toBeInTheDocument();
  });
});

describe('ReportResult — headline numbers', () => {
  it('shows a dash, not the first bucket, when a total cannot be computed', () => {
    // A distinct-count grand total is deliberately null. Falling back to row[0]
    // would present one group's figure as the headline total for all groups.
    const result = {
      columns: [
        { key: 'owner', label: 'Owner', type: 'string', dimension: true },
        { key: 'm0', label: 'Distinct products', type: 'number', agg: 'count_distinct' },
      ],
      rows: [{ owner: 'Ann', m0: 3 }, { owner: 'Bob', m0: 5 }],
      summary: { grand: { m0: null }, subtotals: [] },
      comparison: null,
      meta: { row_count: 2, scanned: 8, warnings: [], grouped: true },
    };
    render(<ReportResult result={result} viz="kpi" />);
    expect(screen.getByText('—')).toBeInTheDocument();
    expect(screen.queryByText('3')).not.toBeInTheDocument();
  });

  it('uses the grand total as the headline when one is available', () => {
    render(<ReportResult result={{ ...grouped, comparison: null }} viz="kpi" />);
    expect(screen.getByText('$1,000')).toBeInTheDocument();
  });
});

describe('ReportResult — matrix', () => {
  const matrix = {
    columns: [
      { key: 'stage', label: 'Stage', type: 'enum', dimension: true },
      { key: 'owner', label: 'Owner', type: 'string', dimension: true },
      { key: 'm0', label: 'Value', type: 'currency' },
    ],
    rows: [
      { stage: 'closed_won', owner: 'Ann', m0: 300 },
      { stage: 'closed_won', owner: 'Bob', m0: 600 },
      { stage: 'proposal', owner: 'Ann', m0: 100 },
    ],
    summary: {
      grand: { m0: 1000 },
      subtotals: [
        { dimension: 'stage', value: 'closed_won', values: { m0: 900 } },
        { dimension: 'stage', value: 'proposal', values: { m0: 100 } },
      ],
    },
    meta: { row_count: 3, scanned: 4, warnings: [], grouped: true, drilldown: true },
  };

  it('renders a subtotal per row group and a grand total', () => {
    render(<ReportResult result={matrix} viz="pivot" />);
    expect(screen.getByText('$900')).toBeInTheDocument();
    expect(screen.getByText('$1,000')).toBeInTheDocument();
  });

  it('does not total a column of averages, which cannot be summed', () => {
    // Summing per-bucket averages produces a meaningless figure; the engine refuses
    // to combine them, and the footer must refuse too.
    const avgMatrix = {
      columns: [
        { key: 'stage', label: 'Stage', type: 'enum', dimension: true },
        { key: 'owner', label: 'Owner', type: 'string', dimension: true },
        { key: 'm0', label: 'Average value', type: 'currency', agg: 'avg' },
      ],
      rows: [
        { stage: 'closed_won', owner: 'Ann', m0: 300 },
        { stage: 'proposal', owner: 'Ann', m0: 100 },
      ],
      summary: { grand: { m0: 200 }, subtotals: [] },
      meta: { row_count: 2, scanned: 4, warnings: [], grouped: true },
    };
    render(<ReportResult result={avgMatrix} viz="pivot" />);
    // 400 would be the naive sum of the two averages; it must not appear.
    expect(screen.queryByText('$400')).not.toBeInTheDocument();
    // The engine's own weighted grand total is still shown.
    expect(screen.getByText('$200')).toBeInTheDocument();
  });

  it('still totals a column of sums', () => {
    render(<ReportResult result={{ ...matrix, columns: matrix.columns.map((c) => (c.key === 'm0' ? { ...c, agg: 'sum' } : c)) }} viz="pivot" />);
    expect(screen.getByText('$900')).toBeInTheDocument();  // Ann 300 + Bob 600
  });

  it('marks a cell with no data distinctly from a real zero', () => {
    // Two owners × two stages, but only two of the four combinations have data:
    // the present zero must read "$0" while the two absent cells read as a dot.
    const sparse = {
      ...matrix,
      rows: [
        { stage: 'closed_won', owner: 'Ann', m0: 0 },
        { stage: 'proposal', owner: 'Bob', m0: 5 },
      ],
      summary: { grand: { m0: 5 }, subtotals: [] },
    };
    render(<ReportResult result={sparse} viz="pivot" />);
    expect(screen.getAllByText('$0').length).toBeGreaterThan(0);
    expect(screen.getAllByText('·')).toHaveLength(2);
  });
});

describe('ReportResult — charts', () => {
  it.each(['bar', 'line', 'area', 'pie', 'donut', 'funnel'])('renders %s without throwing', (viz) => {
    expect(() => render(<ReportResult result={{ ...grouped, comparison: null }} viz={viz} />)).not.toThrow();
  });

  it('tells the user a measure is needed when a chart has none', () => {
    const noMetrics = {
      columns: [{ key: 'stage', label: 'Stage', type: 'enum', dimension: true }],
      rows: [{ stage: 'proposal' }],
      meta: grouped.meta,
    };
    render(<ReportResult result={noMetrics} viz="pie" />);
    expect(screen.getByText(/Add a measure/i)).toBeInTheDocument();
  });
});

describe('conditional formatting', () => {
  const rules = [
    { column: 'm0', op: 'gte', value: 500, color: 'green' },
    { column: 'm0', op: 'lt', value: 500, color: 'red' },
  ];

  it('applies the first matching rule', () => {
    expect(cellFormatClass(rules, 'm0', 900)).toContain('emerald');
    expect(cellFormatClass(rules, 'm0', 100)).toContain('rose');
  });

  it('ignores rules for other columns', () => {
    expect(cellFormatClass(rules, 'm1', 900)).toBe('');
  });

  it('matches an is-empty rule on null and blank, but not on zero', () => {
    const r = [{ column: 'm0', op: 'is_empty', color: 'gray' }];
    expect(cellFormatClass(r, 'm0', null)).not.toBe('');
    expect(cellFormatClass(r, 'm0', '')).not.toBe('');
    expect(cellFormatClass(r, 'm0', 0)).toBe('');
  });

  it('handles a between rule inclusively at both ends', () => {
    const r = [{ column: 'm0', op: 'between', value: 100, value2: 200, color: 'blue' }];
    expect(cellFormatClass(r, 'm0', 100)).not.toBe('');
    expect(cellFormatClass(r, 'm0', 200)).not.toBe('');
    expect(cellFormatClass(r, 'm0', 201)).toBe('');
  });

  it('describes a rule using the column label', () => {
    expect(describeFormatRule(rules[0], grouped.columns)).toBe('Pipeline value is at least 500');
  });

  it('paints a formatted cell in the rendered table', () => {
    render(<ReportResult result={{ ...grouped, comparison: null }} viz="table" formatRules={rules} />);
    expect(screen.getByText('$900').className).toContain('emerald');
    expect(screen.getByText('$100').className).toContain('rose');
  });
});

describe('formatting helpers', () => {
  it('renders each value type the way a business reader expects', () => {
    expect(formatValue(1234.5, 'currency')).toBe('$1,235');
    expect(formatValue(12.34, 'percent')).toBe('12.3%');
    expect(formatValue(true, 'boolean')).toBe('Yes');
    expect(formatValue('closed_won', 'enum')).toBe('closed won');
    expect(formatValue(null, 'currency')).toBe('—');
  });

  it('signs a positive delta and leaves a missing one null', () => {
    expect(formatDelta(12.5)).toBe('+12.5%');
    expect(formatDelta(-4)).toBe('-4%');
    expect(formatDelta(null)).toBeNull();
  });

  it('reads a trend direction from the delta', () => {
    expect(trendOf(5)).toBe('up');
    expect(trendOf(-5)).toBe('down');
    expect(trendOf(0)).toBe('flat');
    expect(trendOf(null)).toBe('flat');
  });
});

describe('filter tree helpers', () => {
  it('upgrades a legacy flat filter array to a tree', () => {
    expect(normalize([{ field: 'stage', op: 'equals', value: 'x' }]))
      .toEqual({ logic: 'AND', conditions: [{ field: 'stage', op: 'equals', value: 'x' }] });
  });

  it('defaults an absent filter to an empty AND group', () => {
    expect(normalize(undefined)).toEqual({ logic: 'AND', conditions: [] });
  });

  it('counts conditions across nested groups', () => {
    const tree = {
      logic: 'AND',
      conditions: [
        { field: 'a', op: 'equals', value: 1 },
        { logic: 'OR', conditions: [{ field: 'b', op: 'equals', value: 2 }, { field: 'c', op: 'equals', value: 3 }] },
      ],
    };
    expect(countConditions(tree)).toBe(3);
  });
});

describe('stale filter operators are repaired on load', () => {
  const FIELDS = [
    { key: 'amount', label: 'Amount', type: 'currency' },
    { key: 'stage', label: 'Stage', type: 'enum' },
    { key: 'close_date', label: 'Close date', type: 'date' },
  ];
  const OPS = [
    { key: 'equals', label: 'is', types: '*' },
    { key: 'contains', label: 'contains', types: 'string' },
    { key: 'gte', label: 'is at least', types: 'number,currency,percent,date' },
    { key: 'date_range', label: 'is within', types: 'date', preset: true },
  ];

  it('replaces an operator that cannot apply to the field', () => {
    // "contains" on a currency field: the row displayed a fallback while the config
    // kept "contains", and the engine then dropped the condition entirely.
    const fixed = repairFilters(
      { logic: 'AND', conditions: [{ field: 'amount', op: 'contains', value: '10' }] },
      FIELDS, OPS,
    );
    expect(fixed.conditions[0].op).not.toBe('contains');
    expect(fixed.conditions[0].value).toBe('');
  });

  it('leaves a valid operator and its value untouched', () => {
    const input = { logic: 'AND', conditions: [{ field: 'amount', op: 'gte', value: '500' }] };
    expect(repairFilters(input, FIELDS, OPS).conditions[0]).toEqual({ field: 'amount', op: 'gte', value: '500' });
  });

  it('repairs conditions inside nested groups too', () => {
    const fixed = repairFilters({
      logic: 'AND',
      conditions: [
        { field: 'stage', op: 'equals', value: 'proposal' },
        { logic: 'OR', conditions: [{ field: 'close_date', op: 'contains', value: 'x' }] },
      ],
    }, FIELDS, OPS);
    expect(fixed.conditions[1].conditions[0].op).not.toBe('contains');
  });

  it('upgrades a legacy flat array while repairing', () => {
    const fixed = repairFilters([{ field: 'amount', op: 'contains', value: '1' }], FIELDS, OPS);
    expect(fixed.logic).toBe('AND');
    expect(fixed.conditions[0].op).not.toBe('contains');
  });

  it('is a no-op before the operator vocabulary has loaded', () => {
    const input = { logic: 'AND', conditions: [{ field: 'amount', op: 'contains', value: '1' }] };
    expect(repairFilters(input, FIELDS, [])).toBe(input);
  });

  it('leaves a condition alone when its field is unknown to this source', () => {
    const input = { logic: 'AND', conditions: [{ field: 'mystery', op: 'contains', value: '1' }] };
    expect(repairFilters(input, FIELDS, OPS).conditions[0].op).toBe('contains');
  });
});

describe('the column picker matches what a table renders', () => {
  const SOURCES = [
    { key: 'opportunities', default_columns: ['name', 'stage', 'amount'] },
    { key: 'leads', default_columns: ['last_name', 'first_name', 'company'] },
  ];

  it('ticks the source defaults for a table with no columns chosen', () => {
    // The engine falls back to these, so an empty picker disagreed with the preview.
    const seeded = withSeededColumns({ source: 'opportunities', viz: 'table', columns: [] }, SOURCES);
    expect(seeded.columns).toEqual(['name', 'stage', 'amount']);
  });

  it('leaves a deliberate column choice alone', () => {
    const chosen = { source: 'opportunities', viz: 'table', columns: ['amount'] };
    expect(withSeededColumns(chosen, SOURCES)).toBe(chosen);
  });

  it('does not seed a chart — columns are not used there', () => {
    const chart = { source: 'opportunities', viz: 'bar', columns: [] };
    expect(withSeededColumns(chart, SOURCES)).toBe(chart);
  });

  it('is a no-op before the source catalogue has loaded', () => {
    const config = { source: 'opportunities', viz: 'table', columns: [] };
    expect(withSeededColumns(config, [])).toBe(config);
  });

  it('leaves an unknown source alone rather than inventing columns', () => {
    const config = { source: 'mystery', viz: 'table', columns: [] };
    expect(withSeededColumns(config, SOURCES)).toBe(config);
  });

  it('seeds per source, so switching source re-ticks correctly', () => {
    expect(withSeededColumns({ source: 'leads', viz: 'table', columns: [] }, SOURCES).columns)
      .toEqual(['last_name', 'first_name', 'company']);
  });

  it('copies the defaults rather than aliasing the catalogue', () => {
    const seeded = withSeededColumns({ source: 'opportunities', viz: 'table', columns: [] }, SOURCES);
    seeded.columns.push('mutated');
    expect(SOURCES[0].default_columns).toHaveLength(3);
  });
});

describe('report-backed dashboard widgets', () => {
  it('maps each report visualization to a sensible widget type', () => {
    expect(widgetTypeForReport({ config: { viz: 'kpi' } })).toBe('metric');
    expect(widgetTypeForReport({ config: { viz: 'table' } })).toBe('list');
    expect(widgetTypeForReport({ config: { viz: 'pivot' } })).toBe('list');
    expect(widgetTypeForReport({ config: { viz: 'bar' } })).toBe('chart');
  });

  it('pairs each widget type with the data shape it consumes', () => {
    expect(shapeForWidgetType('metric')).toBe('metric');
    expect(shapeForWidgetType('list')).toBe('rows');
    expect(shapeForWidgetType('chart')).toBe('series');
  });

  it('stores only the report id — never a field name that could go stale', () => {
    const patch = widgetUpdatesForReport({ id: 42, config: { viz: 'line' } });
    expect(patch.data_source).toEqual({ type: 'report', report_id: 42, shape: 'series' });
    expect(patch.config.chart_type).toBe('line');
    expect(patch.config.xAxisKey).toBeUndefined();
    expect(patch.config.yAxisKey).toBeUndefined();
  });

  it('clears a previously linked chart record so inline config wins', () => {
    expect(widgetUpdatesForReport({ id: 1, config: { viz: 'bar' } }).chart_id).toBeNull();
  });
});
