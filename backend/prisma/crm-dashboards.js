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
 * correct and completely characterless: premium plotted as bare integers
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
 * same dataset demonstrates different treatments (commission mix as a radial
 * bar here, product mix as a treemap there), but the override must still suit
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
  agency:    'tenant', // follows the tenant's brand colour from Appearance & Branding
  sales:     'ocean',
  claims:    'warm',
  portfolio: 'vivid',
};

const DASHBOARDS = [
  // ═══════════════════════════════════════════════════════════════════════════
  // 1. Agency Dashboard — the default landing board: is the agency on track?
  // ═══════════════════════════════════════════════════════════════════════════
  {
    name: 'agency_dashboard',
    label: 'Agency Dashboard',
    description: 'Production against target, application throughput and the renewal runway.',
    is_default: true,
    palette: PALETTES.agency,
    widgets: [
      { dataset: 'kpi-active-policies',      size: 'kpi' },
      { dataset: 'kpi-premium-in-force',     size: 'kpi' },
      { dataset: 'kpi-new-applications-mtd', size: 'kpi' },
      { dataset: 'kpi-pending-claims',       size: 'kpi' },

      // The hero: written premium per month against a monthly target. The goal
      // line is what turns a bar chart into an answer.
      {
        dataset: 'premium-revenue-monthly', size: 'full', chart: 'bar',
        title: 'Premium Written vs Target',
        appearance: {
          format: 'currency_compact', goal: 20000, goalLabel: 'Monthly target',
          xLabel: 'Month', yLabel: 'Annualised premium', legend: 'hidden',
        },
      },
      // Submitted → issued, as a funnel: the drop-off is the point.
      {
        dataset: 'application-funnel', size: 'half', chart: 'funnel',
        title: 'Application Funnel',
        appearance: { format: 'integer', dataLabels: true, legend: 'hidden' },
      },
      {
        dataset: 'policy-type-distribution', size: 'half', chart: 'donut',
        title: 'Book Mix by Product',
        appearance: { format: 'integer', dataLabels: true, legend: 'bottom' },
      },
      {
        dataset: 'new-policies-monthly', size: 'half', chart: 'line',
        title: 'New Policies per Month',
        appearance: { format: 'integer', smooth: true, dataLabels: true, xLabel: 'Month', yLabel: 'Policies', legend: 'hidden' },
      },
      {
        dataset: 'claims-trend-monthly', size: 'half', chart: 'area',
        title: 'Claims Filed per Month',
        appearance: { format: 'integer', smooth: true, xLabel: 'Month', yLabel: 'Claims', legend: 'hidden' },
      },
      // Renewal runway — the nearest bucket is the one that needs staffing.
      {
        dataset: 'renewals-due-buckets', size: 'full', chart: 'bar',
        title: 'Renewal Runway',
        appearance: { format: 'integer', dataLabels: true, xLabel: 'Due within', yLabel: 'Policies', legend: 'hidden' },
      },
      { dataset: 'list-upcoming-renewals', size: 'full' },
    ],
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // 2. Sales & Distribution — where business comes from and who is writing it
  // ═══════════════════════════════════════════════════════════════════════════
  {
    name: 'sales_distribution',
    label: 'Sales & Distribution',
    description: 'Pipeline value by stage, lead sources, producer league table and commission flow.',
    palette: PALETTES.sales,
    widgets: [
      { dataset: 'kpi-open-pipeline',       size: 'kpi' },
      { dataset: 'kpi-open-leads',          size: 'kpi' },
      { dataset: 'kpi-renewals-30d',        size: 'kpi' },
      { dataset: 'kpi-pending-commissions', size: 'kpi' },

      {
        dataset: 'opportunity-pipeline-by-stage', size: 'full', chart: 'funnel',
        title: 'Pipeline Value by Stage',
        appearance: { format: 'currency_compact', dataLabels: true, legend: 'hidden' },
      },
      // Ranked league table: the tail is folded into one "Other" bar rather than
      // stretching the axis with a long list of small producers.
      {
        dataset: 'top-agents-by-premium', size: 'half', chart: 'bar',
        title: 'Top Producers by Premium',
        appearance: {
          format: 'currency_compact', sort: 'desc', topN: 8, dataLabels: true,
          yLabel: 'Premium written', legend: 'hidden',
        },
      },
      {
        dataset: 'leads-by-source', size: 'half', chart: 'donut',
        title: 'Where Leads Come From',
        appearance: { format: 'integer', dataLabels: true, legend: 'bottom' },
      },
      {
        dataset: 'opportunity-win-loss-monthly', size: 'half', chart: 'bar_stacked',
        title: 'Won vs Lost by Month',
        appearance: { format: 'integer', legend: 'bottom', xLabel: 'Month', yLabel: 'Opportunities' },
      },
      {
        dataset: 'leads-by-status', size: 'half', chart: 'bar',
        title: 'Leads by Status',
        appearance: { format: 'integer', dataLabels: true, sort: 'desc', legend: 'hidden' },
      },
      // Two measures, two encodings: commission as bars, the premium that earned
      // it as a line — the pairing is the story.
      {
        dataset: 'commission-by-period', size: 'full', chart: 'composed',
        title: 'Commission Earned vs Premium Written',
        appearance: { format: 'currency_compact', legend: 'bottom', smooth: true, xLabel: 'Period' },
      },
      {
        dataset: 'agent-product-heatmap', size: 'half', chart: 'heatmap',
        title: 'Who Sells What',
        appearance: { format: 'integer' },
      },
      {
        dataset: 'commission-status-mix', size: 'half', chart: 'radial_bar',
        title: 'Commission by Status',
        appearance: { format: 'currency_compact' },
      },
      { dataset: 'list-agent-leaderboard', size: 'full' },
    ],
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // 3. Claims & Underwriting — cost of claims and the quality of what we accept
  // ═══════════════════════════════════════════════════════════════════════════
  {
    name: 'claims_underwriting',
    label: 'Claims & Underwriting',
    description: 'Claimed against paid, loss ratio, risk mix and where applications are lost.',
    palette: PALETTES.claims,
    widgets: [
      { dataset: 'kpi-pending-claims',       size: 'kpi' },
      { dataset: 'kpi-claims-paid-ytd',      size: 'kpi' },
      { dataset: 'kpi-new-applications-mtd', size: 'kpi' },
      { dataset: 'kpi-active-policies',      size: 'kpi' },

      // Claimed vs paid stacked over time — the gap is the reserve.
      {
        dataset: 'claims-financials-monthly', size: 'full', chart: 'area_stacked',
        title: 'Claimed vs Paid',
        appearance: {
          format: 'currency_compact', legend: 'bottom', smooth: true,
          xLabel: 'Month', yLabel: 'Amount',
        },
      },
      { dataset: 'loss-ratio-gauge',     size: 'half', chart: 'gauge', title: 'Loss Ratio' },
      {
        dataset: 'underwriting-risk-mix', size: 'half', chart: 'radar',
        title: 'Underwriting Risk Mix',
        appearance: { format: 'integer' },
      },
      // A waterfall reads as "of everything submitted, this is where it went".
      {
        dataset: 'application-outcome-waterfall', size: 'full', chart: 'waterfall',
        title: 'Where Applications End Up',
        appearance: { format: 'integer', xLabel: 'Stage', yLabel: 'Applications', legend: 'hidden' },
      },
      {
        dataset: 'claims-by-status', size: 'half', chart: 'bar',
        title: 'Claims by Status',
        appearance: { format: 'integer', dataLabels: true, sort: 'desc', legend: 'hidden' },
      },
      {
        dataset: 'claims-by-priority', size: 'half', chart: 'donut',
        title: 'Claims by Priority',
        appearance: { format: 'integer', dataLabels: true, legend: 'bottom' },
      },
      {
        dataset: 'claims-by-type', size: 'half', chart: 'radial_bar',
        title: 'Claims by Type',
        appearance: { format: 'integer' },
      },
      {
        dataset: 'applications-by-product', size: 'half', chart: 'treemap',
        title: 'Applications by Product',
        appearance: { format: 'integer' },
      },
      { dataset: 'list-recent-claims', size: 'full' },
    ],
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // 4. Portfolio Analytics — the shape of the book: exposure, spread, structure
  // ═══════════════════════════════════════════════════════════════════════════
  {
    name: 'portfolio_analytics',
    label: 'Portfolio Analytics',
    description: 'Exposure by product, premium spread, coverage-to-premium relationship and term structure.',
    palette: PALETTES.portfolio,
    widgets: [
      { dataset: 'kpi-premium-in-force',    size: 'kpi' },
      { dataset: 'kpi-total-coverage',      size: 'kpi' },
      { dataset: 'kpi-active-policies',     size: 'kpi' },
      { dataset: 'kpi-pending-commissions', size: 'kpi' },

      // Area encodes exposure: the biggest tile is the biggest concentration.
      {
        dataset: 'coverage-by-product-type', size: 'full', chart: 'treemap',
        title: 'Exposure by Product',
        appearance: { format: 'currency_compact' },
      },
      // Open/high/low/close of monthly premium — the spread, not just the mean.
      {
        dataset: 'premium-ohlc-monthly', size: 'half', chart: 'candlestick',
        title: 'Monthly Premium Range',
        appearance: { format: 'currency_compact' },
      },
      {
        dataset: 'premium-by-frequency', size: 'half', chart: 'radial_bar',
        title: 'Premium by Payment Frequency',
        appearance: { format: 'currency_compact' },
      },
      // Does more coverage actually earn more premium? One dot per policy.
      {
        dataset: 'coverage-vs-premium', size: 'half', chart: 'scatter',
        title: 'Coverage vs Premium',
        appearance: { format: 'currency_compact', xLabel: 'Coverage', yLabel: 'Annual premium' },
      },
      // Age against coverage, sized by risk — three dimensions in one chart.
      {
        dataset: 'applicant-risk-bubble', size: 'half', chart: 'bubble',
        title: 'Applicant Age, Coverage and Risk',
        appearance: { format: 'currency_compact', xLabel: 'Applicant age', yLabel: 'Coverage' },
      },
      {
        dataset: 'policy-status-breakdown', size: 'half', chart: 'bar',
        title: 'Policies by Status',
        appearance: { format: 'integer', dataLabels: true, sort: 'desc', legend: 'hidden' },
      },
      {
        dataset: 'applications-by-status', size: 'half', chart: 'pie',
        title: 'Applications by Status',
        appearance: { format: 'integer', dataLabels: true, legend: 'bottom' },
      },
      // Every policy's effective → expiry window on one timeline.
      { dataset: 'policy-terms-timeline', size: 'tall', chart: 'timeline', title: 'Policy Terms' },
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
