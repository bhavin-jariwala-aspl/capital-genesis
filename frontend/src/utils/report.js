/**
 * Shared reporting helpers — value formatting, a categorical chart palette, and
 * the conditional-formatting evaluator.
 *
 * Colours are chosen to stay distinguishable in both themes and to survive the
 * most common form of colour-vision deficiency (they vary in lightness as well
 * as hue, so a series is still separable if hue alone is not).
 */

import { fmtCurrency } from './formatters';

export const CHART_COLORS = [
  '#6366f1', '#0ea5e9', '#10b981', '#f59e0b', '#f43f5e',
  '#8b5cf6', '#06b6d4', '#d946ef', '#84cc16', '#fb923c',
];

/** Charts that need at least one grouping to make sense. */
const CHART_VIZ = ['bar', 'line', 'area', 'pie', 'donut', 'funnel'];
export const isChartViz = (viz) => CHART_VIZ.includes(viz);

const numberFmt = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 });
const percentFmt = new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 });

export function formatValue(value, type) {
  if (value === null || value === undefined || value === '') return '—';
  switch (type) {
    // Money is resolved per call, not cached in a module-level Intl instance —
    // the tenant can switch currency without a reload.
    case 'currency': return fmtCurrency(Number(value));
    case 'number':   return numberFmt.format(Number(value));
    case 'percent':  return `${percentFmt.format(Number(value))}%`;
    case 'date':     return new Date(value).toLocaleDateString();
    case 'boolean':  return value ? 'Yes' : 'No';
    default:         return String(value).replace(/_/g, ' ');
  }
}

/** Short axis-friendly number (1.2k, 3.4M). */
export function compactNumber(n) {
  const abs = Math.abs(n);
  if (abs >= 1e9) return `${(n / 1e9).toFixed(1)}B`;
  if (abs >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (abs >= 1e3) return `${(n / 1e3).toFixed(1)}k`;
  return `${n}`;
}

export const isNumericType = (type) => ['currency', 'number', 'percent'].includes(type);

// ── Conditional formatting ──────────────────────────────────────────────────

/**
 * The colour choices offered in the builder. Each carries both a light and a dark
 * class set so a rule looks right in either theme, and a `dot` swatch for the
 * picker itself.
 */
export const FORMAT_COLORS = [
  { key: 'green',  label: 'Green',  dot: 'bg-emerald-500', cell: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300' },
  { key: 'red',    label: 'Red',    dot: 'bg-rose-500',    cell: 'bg-rose-50 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300' },
  { key: 'amber',  label: 'Amber',  dot: 'bg-amber-500',   cell: 'bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300' },
  { key: 'blue',   label: 'Blue',   dot: 'bg-sky-500',     cell: 'bg-sky-50 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300' },
  { key: 'violet', label: 'Violet', dot: 'bg-violet-500',  cell: 'bg-violet-50 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300' },
  { key: 'gray',   label: 'Grey',   dot: 'bg-gray-400',    cell: 'bg-gray-100 text-gray-600 dark:bg-white/10 dark:text-white/60' },
];

export const FORMAT_RULE_OPS = [
  { key: 'gt', label: 'is greater than' },
  { key: 'gte', label: 'is at least' },
  { key: 'lt', label: 'is less than' },
  { key: 'lte', label: 'is at most' },
  { key: 'equals', label: 'is exactly' },
  { key: 'between', label: 'is between' },
  { key: 'is_empty', label: 'is empty' },
];

const colorClass = (key) => FORMAT_COLORS.find((c) => c.key === key)?.cell ?? '';

/**
 * Evaluate the conditional-formatting rules for one cell. Rules are checked in
 * order and the first match wins, which is what the builder's list order implies.
 *
 * A rule is `{ column, op, value, value2?, color }`.
 */
export function cellFormatClass(rules, columnKey, value) {
  if (!rules?.length) return '';
  for (const rule of rules) {
    if (rule.column !== columnKey) continue;
    if (matches(rule, value)) return colorClass(rule.color);
  }
  return '';
}

function matches(rule, value) {
  if (rule.op === 'is_empty') return value === null || value === undefined || value === '';
  const n = Number(value);
  if (Number.isNaN(n)) return false;
  const a = Number(rule.value);
  switch (rule.op) {
    case 'gt': return n > a;
    case 'gte': return n >= a;
    case 'lt': return n < a;
    case 'lte': return n <= a;
    case 'equals': return n === a;
    case 'between': return n >= a && n <= Number(rule.value2);
    default: return false;
  }
}

/** Plain-English summary of a rule, shown in the builder's rule list. */
export function describeFormatRule(rule, columns) {
  const col = columns.find((c) => c.key === rule.column);
  const op = FORMAT_RULE_OPS.find((o) => o.key === rule.op);
  const val = rule.op === 'between' ? `${rule.value} and ${rule.value2}` : rule.value;
  return `${col?.label || rule.column} ${op?.label || rule.op}${rule.op === 'is_empty' ? '' : ` ${val ?? ''}`}`;
}

// ── Trend helpers (period-over-period comparison) ───────────────────────────

export function trendOf(deltaPct) {
  if (deltaPct === null || deltaPct === undefined) return 'flat';
  if (deltaPct > 0) return 'up';
  if (deltaPct < 0) return 'down';
  return 'flat';
}

const TREND_CLASS = {
  up: 'text-emerald-600 dark:text-emerald-400',
  down: 'text-rose-600 dark:text-rose-400',
  flat: 'text-gray-400 dark:text-white/40',
};

/**
 * For most measures "up" is good, but for a few (claims paid, SLA breaches,
 * overdue tasks) up is bad — so the caller can invert the colour without
 * inverting the arrow.
 */
export const trendClass = (trend, higherIsBetter = true) =>
  TREND_CLASS[higherIsBetter ? trend : { up: 'down', down: 'up', flat: 'flat' }[trend]];

export function formatDelta(deltaPct) {
  if (deltaPct === null || deltaPct === undefined) return null;
  return `${deltaPct > 0 ? '+' : ''}${percentFmt.format(deltaPct)}%`;
}
