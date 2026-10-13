'use strict';

/**
 * Dashboard catalogue — the demo dashboards, as code.
 *
 * Managed the same way as the workflow catalogue (`crm-workflows.js`): this file
 * is the source of truth, `scripts/seed-dashboards.js` installs it, and
 * `prisma/seed.js` calls the same installer so `db:seed` and the script can
 * never drift. Hand-editing a dashboard in the Builder is fine for
 * experimenting, but anything that should survive a reseed belongs here.
 *
 * ── Why every widget carries an `appearance` block ───────────────────────────
 * Every widget used to be seeded as `{ chart_type, xAxisKey, yAxisKey }` taken
 * straight from the analytics catalogue and nothing else. The charts were
 * correct and completely characterless: money plotted as bare integers
 * ("2750000"), no axis titles, no targets, no labels, the same palette on every
 * board, and long category lists rendered in whatever order the database
 * returned. The rendering engine supports far more than that
 * (see `frontend/src/utils/chart.js`), so the catalogue now uses it:
 *
 *   format / decimals   money as compact currency ($2.8M), counts as integers,
 *                       ratios as percentages — the axis, tooltip and labels all follow
 *   goal / goalLabel    a dashed target line, so a trend reads as "ahead" or "behind"
 *                       rather than just "a shape"
 *   sort / topN         rank a long category list and fold the tail into one
 *                       "Other (n)" bar instead of 30 unreadable slivers
 *   dataLabels          print values on small categorical charts
 *   xLabel / yLabel     say what the axis actually measures
 *   legend / smooth /
 *   stacked / showGrid  presentation choices per chart
 *   palette             one identity per dashboard (see PALETTES below)
 *
 * ── Choosing a chart type ────────────────────────────────────────────────────
 * `chart` overrides the analytics catalogue's default. Overriding is how the
 * same dataset demonstrates different treatments (a status mix as a donut
 * here, as a ranked bar there), but the override must still suit
 * the data: `tests/dashboard-catalogue.test.js` enforces the constraints that
 * are not obvious, notably that sort/topN are never applied to a chart whose
 * y-key is not a plain measure (timeline, candlestick, bubble, heatmap,
 * scatter), where reordering rows would silently corrupt the picture.
 */

// ── Layout ───────────────────────────────────────────────────────────────────
// The runtime renderer flows widgets by type and only distinguishes full-width
// (w >= 8) from half-width, but the Builder canvas is a real 12-column
// react-grid-layout, so every widget still needs honest coordinates. Sizes are
// named here and packed into the grid by `buildDashboard`, which removes the
// hand-maintained x/y/w/h numbers that used to be copied between widgets.
const SIZES = {
  kpi:  { w: 3,  h: 2 },
  half: { w: 6,  h: 4 },
  full: { w: 12, h: 4 },
  tall: { w: 12, h: 5 },
};

const GRID_COLUMNS = 12;

/** Palette per dashboard, so each board reads as its own product surface. */
const PALETTES = {
  sales: 'tenant', // follows the tenant's brand colour from Appearance & Branding
};

const DASHBOARDS = [
  // ═══════════════════════════════════════════════════════════════════════════
  // Sales Dashboard — the default landing board: where business comes from
  // and how the pipeline is converting
  // ═══════════════════════════════════════════════════════════════════════════
  {
    name: 'sales_distribution',
    label: 'Sales Dashboard',
    description: 'Pipeline value by stage, lead sources and win/loss trend.',
    is_default: true,
    palette: PALETTES.sales,
    widgets: [
      { dataset: 'kpi-open-pipeline', size: 'kpi' },
      { dataset: 'kpi-open-leads',    size: 'kpi' },

      {
        dataset: 'opportunity-pipeline-by-stage', size: 'full', chart: 'funnel',
        title: 'Pipeline Value by Stage',
        appearance: { format: 'currency_compact', dataLabels: true, legend: 'hidden' },
      },
      {
        dataset: 'leads-by-source', size: 'half', chart: 'donut',
        title: 'Where Leads Come From',
        appearance: { format: 'integer', dataLabels: true, legend: 'bottom' },
      },
      {
        dataset: 'leads-by-status', size: 'half', chart: 'bar',
        title: 'Leads by Status',
        appearance: { format: 'integer', dataLabels: true, sort: 'desc', legend: 'hidden' },
      },
      {
        dataset: 'opportunity-win-loss-monthly', size: 'full', chart: 'bar_stacked',
        title: 'Won vs Lost by Month',
        appearance: { format: 'integer', legend: 'bottom', xLabel: 'Month', yLabel: 'Opportunities' },
      },
    ],
  },
];

// ── Constraints the renderer imposes ─────────────────────────────────────────

/**
 * Charts whose y-key is not a plain measure. `applySeriesTransforms` ranks and
 * folds rows by the first series key, which would scramble an OHLC series, a
 * Gantt row or an (x, y, r) point cloud — so sort/topN must never be set on
 * these. Enforced by the catalogue test.
 */
const NON_MEASURE_CHARTS = new Set(['timeline', 'candlestick', 'bubble', 'heatmap', 'scatter', 'gauge']);

/** Appearance keys the chart layer understands. Anything else is a typo. */
const APPEARANCE_KEYS = new Set([
  'palette', 'colors', 'legend', 'dataLabels', 'format', 'decimals', 'currency',
  'sort', 'topN', 'goal', 'goalLabel', 'xLabel', 'yLabel', 'showGrid', 'smooth', 'stacked',
]);

const NUMBER_FORMATS = new Set(['number', 'compact', 'currency', 'currency_compact', 'percent', 'integer']);

/** Chart types `ChartRenderer` can draw. */
const CHART_TYPES = new Set([
  'bar', 'bar_stacked', 'line', 'area', 'area_stacked', 'pie', 'donut', 'scatter',
  'radar', 'radial_bar', 'treemap', 'funnel', 'composed', 'heatmap', 'candlestick',
  'gauge', 'bubble', 'timeline', 'waterfall',
]);

const WIDGET_TYPE_BY_SHAPE = { series: 'chart', metric: 'metric', rows: 'list' };

/**
 * Turn one catalogue entry into the rows to insert: the dashboard, and its
 * widgets with grid coordinates packed and config assembled.
 *
 * @param {object} dash        a DASHBOARDS entry
 * @param {Map<string, object>} datasetByKey  the analytics catalogue, keyed
 * @returns {{ dashboard: object, widgets: object[] }}
 */
function buildDashboard(dash, datasetByKey) {
  let x = 0;
  let y = 0;
  let rowHeight = 0;

  const widgets = dash.widgets.map((w, i) => {
    const d = datasetByKey.get(w.dataset);
    if (!d) throw new Error(`Dashboard "${dash.name}" references unknown analytics dataset "${w.dataset}"`);

    const { w: width, h: height } = SIZES[w.size] ?? SIZES.half;
    // Pack left to right, wrapping at the grid edge.
    if (x + width > GRID_COLUMNS) { x = 0; y += rowHeight; rowHeight = 0; }
    const pos = { x, y, w: width, h: height };
    x += width;
    rowHeight = Math.max(rowHeight, height);

    return {
      widget_type: WIDGET_TYPE_BY_SHAPE[d.shape],
      title:       w.title ?? d.label,
      ...pos,
      order_index: i + 1,
      config:      widgetConfig(d, w, dash),
      data_source: { type: 'endpoint', dataset: d.key },
    };
  });

  const { widgets: _w, palette: _p, ...dashboard } = dash;
  return { dashboard, widgets };
}

/** The `config` blob for one widget: axis keys from the dataset, then appearance. */
function widgetConfig(d, w, dash) {
  if (d.shape === 'metric') return { valueKey: 'value', changeKey: 'change' };
  if (d.shape === 'rows')   return { columns: d.columns };

  const appearance = { palette: dash.palette, ...(w.appearance ?? {}) };
  return {
    chart_type: w.chart ?? d.chart_type,
    xAxisKey:   d.xKey,
    yAxisKey:   d.yKey,
    appearance,
  };
}

module.exports = {
  DASHBOARDS,
  SIZES,
  PALETTES,
  GRID_COLUMNS,
  CHART_TYPES,
  APPEARANCE_KEYS,
  NUMBER_FORMATS,
  NON_MEASURE_CHARTS,
  WIDGET_TYPE_BY_SHAPE,
  buildDashboard,
};
