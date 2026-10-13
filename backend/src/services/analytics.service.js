'use strict';

const { NotFoundError } = require('../utils/errors');

/**
 * AnalyticsService — the live data layer behind dashboard widgets.
 *
 * Every dashboard widget (chart / metric / list) points at a *dataset key*
 * instead of carrying a hard-coded JSON blob. A widget's data_source becomes:
 *
 *   { type: 'endpoint', dataset: 'leads-by-source' }
 *
 * which the frontend resolves to `GET /api/analytics/data/leads-by-source`.
 *
 * Datasets are computed from the tenant's real CRM tables. All reads
 * go through the Prisma client, so the tenant-scope extension filters rows
 * automatically — never use $queryRaw here, it bypasses that isolation.
 *
 * Shapes:
 *   series → array of row objects, for chart widgets
 *   metric → { value, change, trend } for KPI metric cards
 *   rows   → array of flat objects, for list / table widgets
 */

// ── helpers ────────────────────────────────────────────────────────────────

const MAX_ROWS = 5000;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const num = (v) => (v == null ? 0 : Number(v));
const round = (v, dp = 0) => {
  const f = 10 ** dp;
  return Math.round(num(v) * f) / f;
};
const titleize = (s) =>
  String(s ?? 'unknown').replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

/** UTC `YYYY-MM` key for a date-ish value. */
function monthKey(d) {
  if (!d) return null;
  const date = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(date.getTime())) return null;
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

/** The last `count` months (inclusive of the current one), oldest first. */
function monthBuckets(count, from = new Date()) {
  const out = [];
  for (let i = count - 1; i >= 0; i--) {
    const m = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth() - i, 1));
    out.push({
      key:   `${m.getUTCFullYear()}-${String(m.getUTCMonth() + 1).padStart(2, '0')}`,
      label: MONTHS[m.getUTCMonth()],
      start: m,
      end:   new Date(Date.UTC(m.getUTCFullYear(), m.getUTCMonth() + 1, 1)),
    });
  }
  return out;
}

const daysAgo = (n) => new Date(Date.now() - n * 86_400_000);

/**
 * Count rows in the current vs the preceding window of the same length and
 * express the delta the way a KPI card wants it.
 */
async function withDelta(model, dateField, windowDays, where = {}) {
  const [current, previous] = await Promise.all([
    model.count({ where: { ...where, [dateField]: { gte: daysAgo(windowDays) } } }),
    model.count({
      where: { ...where, [dateField]: { gte: daysAgo(windowDays * 2), lt: daysAgo(windowDays) } },
    }),
  ]);
  return { current, previous };
}

const delta = (current, previous, { suffix = '' } = {}) => {
  const diff = current - previous;
  return {
    change: diff === 0 ? null : `${diff > 0 ? '+' : ''}${round(diff, 1)}${suffix}`,
    trend:  diff === 0 ? 'flat' : diff > 0 ? 'up' : 'down',
  };
};

const money = (v) => {
  const n = num(v);
  if (Math.abs(n) >= 1_000_000) return `$${round(n / 1_000_000, 1)}M`;
  if (Math.abs(n) >= 1_000)     return `$${round(n / 1_000, 1)}K`;
  return `$${round(n)}`;
};

/**
 * Tally rows into a fixed category domain so a chart keeps its full axis even
 * when a status has no rows yet. Categories not in `domain` are appended.
 */
function tallyByDomain(rows, field, domain, { nameKey = 'name', valueKey = 'value' } = {}) {
  const counts = new Map(domain.map((d) => [d, 0]));
  for (const r of rows) {
    const k = r[field] ?? 'unknown';
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  return [...counts.entries()].map(([k, v]) => ({ [nameKey]: titleize(k), [valueKey]: v, key: k }));
}

// ── dataset catalog ────────────────────────────────────────────────────────
//
// `run(db)` returns the payload. `chart_type` / `xKey` / `yKey` are *suggestions*
// the Dashboard Builder uses to pre-wire a widget when the dataset is picked.

const DATASETS = [
  // ─────────────────────────────── Pipeline ────────────────────────────────
  {
    key: 'opportunity-pipeline-by-stage',
    label: 'Opportunity Pipeline Value',
    description: 'Open opportunity value sitting in each sales stage.',
    category: 'Pipeline',
    shape: 'series',
    chart_type: 'funnel',
    xKey: 'stage',
    yKey: 'amount',
    async run(db) {
      const grouped = await db.crmOpportunity.groupBy({
        by: ['stage'],
        where: { is_closed: false },
        _sum: { amount: true },
        _count: { _all: true },
      });
      return grouped
        .map((g) => ({
          stage:  titleize(g.stage),
          key:    g.stage,
          amount: round(g._sum.amount),
          count:  g._count._all,
        }))
        .sort((a, b) => b.amount - a.amount);
    },
  },
  {
    key: 'leads-by-source',
    label: 'Leads by Source',
    description: 'Where prospects are coming from.',
    category: 'Pipeline',
    shape: 'series',
    chart_type: 'donut',
    xKey: 'source',
    yKey: 'count',
    async run(db) {
      const grouped = await db.crmLead.groupBy({
        by: ['lead_source'],
        _count: { _all: true },
      });
      return grouped
        .map((g) => ({ source: titleize(g.lead_source), key: g.lead_source, count: g._count._all }))
        .sort((a, b) => b.count - a.count);
    },
  },
  {
    key: 'leads-by-status',
    label: 'Leads by Status',
    description: 'Prospect qualification funnel — new through converted.',
    category: 'Pipeline',
    shape: 'series',
    chart_type: 'bar',
    xKey: 'status',
    yKey: 'count',
    async run(db) {
      const rows = await db.crmLead.findMany({ select: { lead_status: true }, take: MAX_ROWS });
      return tallyByDomain(
        rows, 'lead_status',
        ['new', 'contacted', 'qualified', 'unqualified', 'converted'],
        { nameKey: 'status', valueKey: 'count' },
      );
    },
  },
  {
    key: 'opportunity-win-loss-monthly',
    label: 'Won vs Lost Opportunities',
    description: 'Closed-won against closed-lost value by close month.',
    category: 'Pipeline',
    shape: 'series',
    chart_type: 'bar_stacked',
    xKey: 'month',
    yKey: ['won', 'lost'],
    async run(db) {
      const buckets = monthBuckets(12);
      const opps = await db.crmOpportunity.findMany({
        where:  { is_closed: true, close_date: { gte: buckets[0].start } },
        select: { close_date: true, amount: true, is_won: true },
        take:   MAX_ROWS,
      });
      const acc = new Map(buckets.map((b) => [b.key, { won: 0, lost: 0 }]));
      for (const o of opps) {
        const k = monthKey(o.close_date);
        if (!acc.has(k)) continue;
        acc.get(k)[o.is_won ? 'won' : 'lost'] += num(o.amount);
      }
      return buckets.map((b) => ({
        month: b.label, period: b.key,
        won:   round(acc.get(b.key).won),
        lost:  round(acc.get(b.key).lost),
      }));
    },
  },

  // ─────────────────────────────── Metrics ─────────────────────────────────
  {
    key: 'kpi-open-pipeline',
    label: 'Open Pipeline',
    description: 'Total value of opportunities that have not closed.',
    category: 'KPIs',
    shape: 'metric',
    async run(db) {
      const agg = await db.crmOpportunity.aggregate({
        where: { is_closed: false },
        _sum:  { amount: true },
      });
      const total = num(agg._sum.amount);
      return { value: money(total), raw: total, trend: 'flat' };
    },
  },
  {
    key: 'kpi-open-leads',
    label: 'Open Leads',
    description: 'Prospects not yet converted or disqualified.',
    category: 'KPIs',
    shape: 'metric',
    async run(db) {
      const where = { lead_status: { in: ['new', 'contacted', 'qualified'] } };
      const [value, d] = await Promise.all([
        db.crmLead.count({ where }),
        withDelta(db.crmLead, 'created_at', 30, where),
      ]);
      return { value, ...delta(d.current, d.previous) };
    },
  },
];

const BY_KEY = new Map(DATASETS.map((d) => [d.key, d]));

class AnalyticsService {
  constructor(prisma, cache = null) {
    this.db = prisma;
    this.cache = cache;
  }

  /** Catalog for the Dashboard Builder's dataset picker (no runners). */
  getCatalog() {
    return DATASETS.map(({ run: _run, ...meta }) => meta);
  }

  static has(key) {
    return BY_KEY.has(key);
  }

  /** Execute one dataset and return its payload. */
  async getData(key) {
    const dataset = BY_KEY.get(key);
    if (!dataset) throw new NotFoundError(`Analytics dataset "${key}"`);
    const data = await dataset.run(this.db);
    return {
      data,
      meta: {
        key:        dataset.key,
        label:      dataset.label,
        shape:      dataset.shape,
        chart_type: dataset.chart_type ?? null,
        xKey:       dataset.xKey ?? null,
        yKey:       dataset.yKey ?? null,
        columns:    dataset.columns ?? null,
        generated_at: new Date().toISOString(),
      },
    };
  }
}

module.exports = AnalyticsService;
module.exports.DATASETS = DATASETS;
