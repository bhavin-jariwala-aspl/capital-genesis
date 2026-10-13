/**
 * Chart appearance — pure helpers shared by ChartRenderer and the Dashboard
 * Builder's Appearance controls.
 *
 * A widget's `config.appearance` (all optional):
 *   palette        vivid | brand | pastel | mono | ocean | warm | tenant (default: tenant setting)
 *   colors         ["#hex", …] explicit per-series overrides
 *   legend         auto | top | bottom | hidden
 *   dataLabels     boolean — print values on bars / slices
 *   format         number | compact | currency | percent | integer
 *   decimals       0–4
 *   currency       ISO code for `currency` format (default: tenant currency)
 *   sort           none | asc | desc          (by first series)
 *   topN           positive integer — keep the N largest, fold the rest into "Other"
 *   goal           number — horizontal reference line
 *   goalLabel      text for the goal line
 *   xLabel / yLabel axis titles
 *   showGrid       boolean (default true)
 *   smooth         boolean — curved lines/areas (default true)
 *   stacked        boolean — force stacking for bar/area
 */

export const CHART_APPEARANCE_DEFAULTS = {
  palette: 'tenant', colors: [], legend: 'auto', dataLabels: false, format: 'number', decimals: 0,
  currency: '', sort: 'none', topN: 0, goal: null, goalLabel: 'Goal', xLabel: '', yLabel: '',
  showGrid: true, smooth: true, stacked: null,
};

export function resolveChartAppearance(config = {}) {
  const a = { ...CHART_APPEARANCE_DEFAULTS, ...(config?.appearance || {}) };
  a.decimals = Math.max(0, Math.min(4, Number(a.decimals) || 0));
  a.topN = Math.max(0, parseInt(a.topN, 10) || 0);
  a.goal = a.goal === '' || a.goal === null || a.goal === undefined || Number.isNaN(Number(a.goal)) ? null : Number(a.goal);
  a.colors = Array.isArray(a.colors) ? a.colors.filter((c) => /^#[0-9a-f]{6}$/i.test(String(c))) : [];
  return a;
}

/**
 * Apply sort / top-N to a row set. Sorting and ranking use the first series
 * key; the folded remainder becomes one "Other" row summing each series.
 */
export function applySeriesTransforms(rows, { sort = 'none', topN = 0 } = {}, xKey = 'name', seriesKeys = ['value']) {
  if (!Array.isArray(rows) || !rows.length) return rows ?? [];
  const primary = seriesKeys[0];
  let out = rows.slice();
  if (sort === 'asc' || sort === 'desc') {
    out.sort((a, b) => {
      const d = (Number(a[primary]) || 0) - (Number(b[primary]) || 0);
      return sort === 'asc' ? d : -d;
    });
  }
  if (topN > 0 && out.length > topN) {
    const ranked = sort === 'none'
      ? out.slice().sort((a, b) => (Number(b[primary]) || 0) - (Number(a[primary]) || 0))
      : out;
    const keep = new Set(ranked.slice(0, topN));
    const kept = out.filter((r) => keep.has(r));
    const rest = out.filter((r) => !keep.has(r));
    if (rest.length) {
      const other = { [xKey]: `Other (${rest.length})`, __other: true };
      for (const k of seriesKeys) other[k] = rest.reduce((s, r) => s + (Number(r[k]) || 0), 0);
      kept.push(other);
    }
    out = kept;
  }
  return out;
}

/** Number formatter for axis ticks, tooltips and data labels. */
export function makeValueFormatter({ format = 'number', decimals = 0, currency = '' } = {}, locale) {
  const loc = locale || (typeof navigator !== 'undefined' ? navigator.language : 'en-US');
  const fixed = { minimumFractionDigits: decimals, maximumFractionDigits: decimals };
  let nf;
  try {
    switch (format) {
      case 'compact':  nf = new Intl.NumberFormat(loc, { notation: 'compact', maximumFractionDigits: Math.max(1, decimals) }); break;
      case 'currency': nf = new Intl.NumberFormat(loc, { style: 'currency', currency: currency || 'USD', ...fixed }); break;
      // Money on a chart axis is unreadable in full ("$2,750,000"); compact
      // currency keeps the unit and the magnitude ("$2.8M") in the width a
      // 260px-tall widget actually has.
      case 'currency_compact':
        nf = new Intl.NumberFormat(loc, { style: 'currency', currency: currency || 'USD', notation: 'compact', maximumFractionDigits: Math.max(1, decimals) });
        break;
      case 'percent':  nf = new Intl.NumberFormat(loc, { style: 'percent', ...fixed }); break;
      case 'integer':  nf = new Intl.NumberFormat(loc, { maximumFractionDigits: 0 }); break;
      default:         nf = new Intl.NumberFormat(loc, fixed);
    }
  } catch {
    nf = new Intl.NumberFormat('en-US', fixed);
  }
  return (v) => {
    if (v === null || v === undefined || v === '') return '';
    const n = Number(v);
    if (Number.isNaN(n)) return String(v);
    // Percent format expects a ratio; the data holds whole percentages.
    return nf.format(format === 'percent' ? n / 100 : n);
  };
}

/** Formats offered in the builder, in the order they are listed. */
export const NUMBER_FORMATS = [
  { value: 'number',           label: 'Number' },
  { value: 'compact',          label: 'Compact (1.2K)' },
  { value: 'currency',         label: 'Currency' },
  { value: 'currency_compact', label: 'Currency, compact ($1.2M)' },
  { value: 'percent',          label: 'Percent' },
  { value: 'integer',          label: 'Whole number' },
];

/** Which appearance controls make sense for a chart type. */
export function appearanceCapabilities(chartType) {
  const cartesian = ['bar', 'bar_stacked', 'line', 'area', 'area_stacked', 'composed', 'waterfall', 'scatter'];
  const part = ['pie', 'donut', 'funnel', 'treemap', 'radial_bar', 'radar'];
  return {
    axes:      cartesian.includes(chartType),
    goal:      ['bar', 'bar_stacked', 'line', 'area', 'area_stacked', 'composed'].includes(chartType),
    stacked:   ['bar', 'bar_stacked', 'area', 'area_stacked'].includes(chartType),
    smooth:    ['line', 'area', 'area_stacked', 'composed'].includes(chartType),
    sortTopN:  [...cartesian.filter((t) => t !== 'scatter'), ...part].includes(chartType),
    dataLabels: ['bar', 'bar_stacked', 'pie', 'donut', 'funnel', 'line', 'area'].includes(chartType),
    legend:    true,
    palette:   true,
  };
}
