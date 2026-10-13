'use strict';

const { NotFoundError } = require('../utils/errors');

/**
 * AnalyticsService — the live data layer behind dashboard widgets.
 *
 * Every dashboard widget (chart / metric / list) points at a *dataset key*
 * instead of carrying a hard-coded JSON blob. A widget's data_source becomes:
 *
 *   { type: 'endpoint', dataset: 'premium-revenue-monthly' }
 *
 * which the frontend resolves to `GET /api/analytics/data/premium-revenue-monthly`.
 *
 * Datasets are computed from the tenant's real CRM/insurance tables. All reads
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
const FREQ_PER_YEAR = { monthly: 12, quarterly: 4, semi_annual: 2, annual: 1 };

const num = (v) => (v == null ? 0 : Number(v));
const round = (v, dp = 0) => {
  const f = 10 ** dp;
  return Math.round(num(v) * f) / f;
};
const titleize = (s) =>
  String(s ?? 'unknown').replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

/** Annualised premium — normalises monthly/quarterly/annual policies onto one scale. */
const annualPremium = (p) => num(p.premium_amount) * (FREQ_PER_YEAR[p.premium_frequency] ?? 1);

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
const daysAhead = (n) => new Date(Date.now() + n * 86_400_000);
const startOfYear = () => new Date(Date.UTC(new Date().getUTCFullYear(), 0, 1));
const startOfMonth = () => {
  const n = new Date();
  return new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), 1));
};

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
  // ─────────────────────────────── Policies ────────────────────────────────
  {
    key: 'premium-revenue-monthly',
    label: 'Monthly Premium Revenue',
    description: 'Annualised premium written per month, from policy effective dates (last 12 months).',
    category: 'Policies',
    shape: 'series',
    chart_type: 'bar',
    xKey: 'month',
    yKey: 'revenue',
    async run(db) {
      const buckets = monthBuckets(12);
      const policies = await db.insurancePolicy.findMany({
        where:  { effective_date: { gte: buckets[0].start } },
        select: { effective_date: true, premium_amount: true, premium_frequency: true },
        take:   MAX_ROWS,
      });
      const totals = new Map(buckets.map((b) => [b.key, 0]));
      for (const p of policies) {
        const k = monthKey(p.effective_date);
        if (totals.has(k)) totals.set(k, totals.get(k) + annualPremium(p));
      }
      return buckets.map((b) => ({ month: b.label, period: b.key, revenue: round(totals.get(b.key)) }));
    },
  },
  {
    key: 'new-policies-monthly',
    label: 'New Policies per Month',
    description: 'Count of policies taking effect each month (last 12 months).',
    category: 'Policies',
    shape: 'series',
    chart_type: 'line',
    xKey: 'month',
    yKey: 'policies',
    async run(db) {
      const buckets = monthBuckets(12);
      const policies = await db.insurancePolicy.findMany({
        where:  { effective_date: { gte: buckets[0].start } },
        select: { effective_date: true },
        take:   MAX_ROWS,
      });
      const counts = new Map(buckets.map((b) => [b.key, 0]));
      for (const p of policies) {
        const k = monthKey(p.effective_date);
        if (counts.has(k)) counts.set(k, counts.get(k) + 1);
      }
      return buckets.map((b) => ({ month: b.label, period: b.key, policies: counts.get(b.key) }));
    },
  },
  {
    key: 'policy-type-distribution',
    label: 'Policy Mix by Product Type',
    description: 'How the in-force book splits across product types.',
    category: 'Policies',
    shape: 'series',
    chart_type: 'donut',
    xKey: 'type',
    yKey: 'count',
    async run(db) {
      const grouped = await db.insurancePolicy.groupBy({
        by: ['product_type'],
        _count: { _all: true },
      });
      return grouped
        .map((g) => ({ type: titleize(g.product_type), key: g.product_type, count: g._count._all }))
        .sort((a, b) => b.count - a.count);
    },
  },
  {
    key: 'policy-status-breakdown',
    label: 'Policies by Status',
    description: 'Policy lifecycle spread — pending through cancelled.',
    category: 'Policies',
    shape: 'series',
    chart_type: 'bar',
    xKey: 'status',
    yKey: 'count',
    async run(db) {
      const rows = await db.insurancePolicy.findMany({ select: { status: true }, take: MAX_ROWS });
      return tallyByDomain(
        rows, 'status',
        ['pending', 'active', 'lapsed', 'surrendered', 'matured', 'cancelled'],
        { nameKey: 'status', valueKey: 'count' },
      );
    },
  },
  {
    key: 'coverage-by-product-type',
    label: 'Coverage Exposure by Product',
    description: 'Total death benefit / coverage amount carried per product type.',
    category: 'Policies',
    shape: 'series',
    chart_type: 'treemap',
    xKey: 'type',
    yKey: 'coverage',
    async run(db) {
      const grouped = await db.insurancePolicy.groupBy({
        by: ['product_type'],
        _sum: { coverage_amount: true },
      });
      return grouped
        .map((g) => ({ type: titleize(g.product_type), key: g.product_type, coverage: round(g._sum.coverage_amount) }))
        .sort((a, b) => b.coverage - a.coverage);
    },
  },
  {
    key: 'premium-by-frequency',
    label: 'Premium by Payment Frequency',
    description: 'Annualised premium grouped by how often the policyholder pays.',
    category: 'Policies',
    shape: 'series',
    chart_type: 'radial_bar',
    xKey: 'frequency',
    yKey: 'premium',
    async run(db) {
      const policies = await db.insurancePolicy.findMany({
        select: { premium_amount: true, premium_frequency: true },
        take:   MAX_ROWS,
      });
      const totals = new Map(Object.keys(FREQ_PER_YEAR).map((f) => [f, 0]));
      for (const p of policies) {
        const f = p.premium_frequency ?? 'annual';
        totals.set(f, (totals.get(f) ?? 0) + annualPremium(p));
      }
      return [...totals.entries()].map(([f, v]) => ({ frequency: titleize(f), key: f, premium: round(v) }));
    },
  },
  {
    key: 'coverage-vs-premium',
    label: 'Coverage vs Premium',
    description: 'One point per policy — coverage amount against annualised premium.',
    category: 'Policies',
    shape: 'series',
    chart_type: 'scatter',
    xKey: 'coverage',
    yKey: 'premium',
    async run(db) {
      const policies = await db.insurancePolicy.findMany({
        select: { policy_number: true, coverage_amount: true, premium_amount: true, premium_frequency: true },
        take:   500,
      });
      return policies.map((p) => ({
        name:     p.policy_number,
        coverage: round(num(p.coverage_amount)),
        premium:  round(annualPremium(p)),
      }));
    },
  },
  {
    key: 'policy-terms-timeline',
    label: 'Policy Terms (Gantt)',
    description: 'Effective date → expiry/renewal date for each policy.',
    category: 'Policies',
    shape: 'series',
    chart_type: 'timeline',
    xKey: 'task',
    yKey: 'value',
    async run(db) {
      // `effective_date` is a required column, so there is nothing to filter out
      // here — and `{ not: null }` on a non-nullable field is rejected by Prisma
      // ("Argument `not` must not be null"), which used to make this dataset
      // throw on every render. Rows without an end date are dropped below.
      const policies = await db.insurancePolicy.findMany({
        select:  { policy_number: true, product_type: true, effective_date: true, expiry_date: true, renewal_due_date: true },
        orderBy: { effective_date: 'asc' },
        take:    40,
      });
      return policies
        .map((p) => {
          const end = p.expiry_date ?? p.renewal_due_date;
          if (!end) return null;
          return {
            series: titleize(p.product_type),
            task:   p.policy_number,
            start:  p.effective_date,
            end,
          };
        })
        .filter(Boolean);
    },
  },
  {
    key: 'premium-ohlc-monthly',
    label: 'Policy Premium Range by Month',
    description: 'Open/high/low/close of individual policy premiums written each month.',
    category: 'Policies',
    shape: 'series',
    chart_type: 'candlestick',
    xKey: 'x',
    yKey: 'close',
    async run(db) {
      const buckets = monthBuckets(12);
      const policies = await db.insurancePolicy.findMany({
        where:   { effective_date: { gte: buckets[0].start } },
        select:  { effective_date: true, premium_amount: true, premium_frequency: true },
        orderBy: { effective_date: 'asc' },
        take:    MAX_ROWS,
      });
      const grouped = new Map(buckets.map((b) => [b.key, []]));
      for (const p of policies) {
        const k = monthKey(p.effective_date);
        if (grouped.has(k)) grouped.get(k).push(round(annualPremium(p)));
      }
      return buckets
        .filter((b) => grouped.get(b.key).length > 0)
        .map((b) => {
          const vals = grouped.get(b.key);
          return {
            x:     b.label,
            open:  vals[0],
            high:  Math.max(...vals),
            low:   Math.min(...vals),
            close: vals[vals.length - 1],
          };
        });
    },
  },

  // ───────────────────────────── Applications ──────────────────────────────
  {
    key: 'applications-by-status',
    label: 'Applications by Status',
    description: 'Where every in-flight application currently sits.',
    category: 'Applications',
    shape: 'series',
    chart_type: 'pie',
    xKey: 'status',
    yKey: 'count',
    async run(db) {
      const rows = await db.insuranceApplication.findMany({ select: { status: true }, take: MAX_ROWS });
      return tallyByDomain(
        rows, 'status',
        ['submitted', 'under_review', 'pending_medical', 'approved', 'declined', 'withdrawn', 'issued'],
        { nameKey: 'status', valueKey: 'count' },
      );
    },
  },
  {
    key: 'application-funnel',
    label: 'Application Funnel',
    description: 'Cumulative drop-off from submission through to issued policy.',
    category: 'Applications',
    shape: 'series',
    chart_type: 'funnel',
    xKey: 'stage',
    yKey: 'count',
    async run(db) {
      const rows = await db.insuranceApplication.findMany({ select: { status: true }, take: MAX_ROWS });
      const n = (...statuses) => rows.filter((r) => statuses.includes(r.status)).length;
      const reviewed = n('under_review', 'pending_medical', 'approved', 'issued');
      const medical  = n('pending_medical', 'approved', 'issued');
      const approved = n('approved', 'issued');
      const issued   = n('issued');
      return [
        { stage: 'Submitted',   count: rows.length },
        { stage: 'Under Review', count: reviewed },
        { stage: 'Medical',     count: medical },
        { stage: 'Approved',    count: approved },
        { stage: 'Issued',      count: issued },
      ];
    },
  },
  {
    key: 'application-outcome-waterfall',
    label: 'Application Outcome Waterfall',
    description: 'Submitted volume less declines, withdrawals and still-open cases → net issued.',
    category: 'Applications',
    shape: 'series',
    chart_type: 'waterfall',
    xKey: 'stage',
    yKey: 'value',
    async run(db) {
      const rows = await db.insuranceApplication.findMany({ select: { status: true }, take: MAX_ROWS });
      const n = (...statuses) => rows.filter((r) => statuses.includes(r.status)).length;
      return [
        { stage: 'Submitted',  value: rows.length },
        { stage: 'Declined',   value: -n('declined') },
        { stage: 'Withdrawn',  value: -n('withdrawn') },
        { stage: 'In Process', value: -n('submitted', 'under_review', 'pending_medical') },
        { stage: 'Approved',   value: -n('approved') },
      ];
    },
  },
  {
    key: 'applications-by-product',
    label: 'Applications by Product Type',
    description: 'Which products applicants are asking for.',
    category: 'Applications',
    shape: 'series',
    chart_type: 'bar',
    xKey: 'type',
    yKey: 'count',
    async run(db) {
      const grouped = await db.insuranceApplication.groupBy({
        by: ['product_type'],
        _count: { _all: true },
      });
      return grouped
        .map((g) => ({ type: titleize(g.product_type), key: g.product_type, count: g._count._all }))
        .sort((a, b) => b.count - a.count);
    },
  },
  {
    key: 'applicant-risk-bubble',
    label: 'Applicant Age / Coverage / Premium',
    description: 'Bubble per application — age on X, coverage on Y, premium as bubble size.',
    category: 'Applications',
    shape: 'series',
    chart_type: 'bubble',
    xKey: 'age',
    yKey: 'coverage',
    async run(db) {
      const apps = await db.insuranceApplication.findMany({
        where:  { age: { not: null } },
        select: { app_number: true, age: true, coverage_amount: true, premium_amount: true },
        take:   300,
      });
      return apps.map((a) => ({
        name:     a.app_number,
        age:      a.age,
        coverage: round(num(a.coverage_amount)),
        r:        Math.max(6, round(num(a.premium_amount) / 100)),
      }));
    },
  },
  {
    key: 'underwriting-risk-mix',
    label: 'Underwriting Risk Classes',
    description: 'Spread of assigned risk classes across underwriting cases.',
    category: 'Applications',
    shape: 'series',
    chart_type: 'radar',
    xKey: 'risk_class',
    yKey: 'count',
    async run(db) {
      const rows = await db.underwritingCase.findMany({ select: { risk_class: true }, take: MAX_ROWS });
      return tallyByDomain(
        rows, 'risk_class',
        ['preferred_plus', 'preferred', 'standard', 'substandard', 'high_risk'],
        { nameKey: 'risk_class', valueKey: 'count' },
      );
    },
  },

  // ─────────────────────────────── Claims ──────────────────────────────────
  {
    key: 'claims-by-status',
    label: 'Claims by Status',
    description: 'Open and closed claims by processing stage.',
    category: 'Claims',
    shape: 'series',
    chart_type: 'bar',
    xKey: 'status',
    yKey: 'count',
    async run(db) {
      const rows = await db.insuranceClaim.findMany({ select: { status: true }, take: MAX_ROWS });
      return tallyByDomain(
        rows, 'status',
        ['fnol', 'filed', 'under_investigation', 'approved', 'denied', 'paid', 'closed'],
        { nameKey: 'status', valueKey: 'count' },
      );
    },
  },
  {
    key: 'claims-by-type',
    label: 'Claims by Type',
    description: 'Death, disability, critical illness and accident claim counts.',
    category: 'Claims',
    shape: 'series',
    chart_type: 'radial_bar',
    xKey: 'claim_type',
    yKey: 'count',
    async run(db) {
      const rows = await db.insuranceClaim.findMany({ select: { claim_type: true }, take: MAX_ROWS });
      return tallyByDomain(
        rows, 'claim_type',
        ['death', 'disability', 'critical_illness', 'accident', 'other'],
        { nameKey: 'claim_type', valueKey: 'count' },
      );
    },
  },
  {
    key: 'claims-trend-monthly',
    label: 'Claims Filed per Month',
    description: 'Claim volume by filing month (last 12 months).',
    category: 'Claims',
    shape: 'series',
    chart_type: 'area',
    xKey: 'month',
    yKey: 'claims',
    async run(db) {
      const buckets = monthBuckets(12);
      const claims = await db.insuranceClaim.findMany({
        where:  { filed_at: { gte: buckets[0].start } },
        select: { filed_at: true },
        take:   MAX_ROWS,
      });
      const counts = new Map(buckets.map((b) => [b.key, 0]));
      for (const c of claims) {
        const k = monthKey(c.filed_at);
        if (counts.has(k)) counts.set(k, counts.get(k) + 1);
      }
      return buckets.map((b) => ({ month: b.label, period: b.key, claims: counts.get(b.key) }));
    },
  },
  {
    key: 'claims-financials-monthly',
    label: 'Claimed vs Paid Amount',
    description: 'Amount claimed against amount actually paid, per month.',
    category: 'Claims',
    shape: 'series',
    chart_type: 'area_stacked',
    xKey: 'month',
    yKey: ['claimed', 'paid'],
    async run(db) {
      const buckets = monthBuckets(12);
      const claims = await db.insuranceClaim.findMany({
        where:  { filed_at: { gte: buckets[0].start } },
        select: { filed_at: true, amount: true, paid_amount: true },
        take:   MAX_ROWS,
      });
      const acc = new Map(buckets.map((b) => [b.key, { claimed: 0, paid: 0 }]));
      for (const c of claims) {
        const k = monthKey(c.filed_at);
        if (!acc.has(k)) continue;
        const slot = acc.get(k);
        slot.claimed += num(c.amount);
        slot.paid    += num(c.paid_amount);
      }
      return buckets.map((b) => ({
        month:   b.label,
        period:  b.key,
        claimed: round(acc.get(b.key).claimed),
        paid:    round(acc.get(b.key).paid),
      }));
    },
  },
  {
    key: 'loss-ratio-gauge',
    label: 'Loss Ratio',
    description: 'Claims paid as a percentage of annualised premium in force.',
    category: 'Claims',
    shape: 'series',
    chart_type: 'gauge',
    xKey: 'name',
    yKey: 'value',
    async run(db) {
      const [policies, paid] = await Promise.all([
        db.insurancePolicy.findMany({
          where:  { status: 'active' },
          select: { premium_amount: true, premium_frequency: true },
          take:   MAX_ROWS,
        }),
        db.insuranceClaim.aggregate({ _sum: { paid_amount: true } }),
      ]);
      const premium = policies.reduce((s, p) => s + annualPremium(p), 0);
      const ratio = premium > 0 ? (num(paid._sum.paid_amount) / premium) * 100 : 0;
      return [{ name: 'Loss Ratio', value: round(Math.min(ratio, 100), 1) }];
    },
  },
  {
    key: 'claims-by-priority',
    label: 'Claims by Priority',
    description: 'High / medium / low priority split of the claims queue.',
    category: 'Claims',
    shape: 'series',
    chart_type: 'donut',
    xKey: 'priority',
    yKey: 'count',
    async run(db) {
      const rows = await db.insuranceClaim.findMany({ select: { priority: true }, take: MAX_ROWS });
      return tallyByDomain(rows, 'priority', ['high', 'medium', 'low'], {
        nameKey: 'priority', valueKey: 'count',
      });
    },
  },

  // ────────────────────────── Production & Agents ──────────────────────────
  {
    key: 'top-agents-by-premium',
    label: 'Top Producers by Premium',
    description: 'Annualised premium written per producing agent.',
    category: 'Production',
    shape: 'series',
    chart_type: 'bar',
    xKey: 'agent',
    yKey: 'premium',
    async run(db) {
      const policies = await db.insurancePolicy.findMany({
        where:   { agent_id: { not: null } },
        select:  { agent_id: true, premium_amount: true, premium_frequency: true,
                   agent: { select: { employee_name: true } } },
        take:    MAX_ROWS,
      });
      const totals = new Map();
      for (const p of policies) {
        const name = p.agent?.employee_name || p.agent_id;
        totals.set(name, (totals.get(name) ?? 0) + annualPremium(p));
      }
      return [...totals.entries()]
        .map(([agent, premium]) => ({ agent, premium: round(premium) }))
        .sort((a, b) => b.premium - a.premium)
        .slice(0, 10);
    },
  },
  {
    key: 'agent-product-heatmap',
    label: 'Agent × Product Heatmap',
    description: 'Policy counts per agent, broken out by product type.',
    category: 'Production',
    shape: 'series',
    chart_type: 'heatmap',
    xKey: 'name',
    yKey: 'value',
    async run(db) {
      const policies = await db.insurancePolicy.findMany({
        where:  { agent_id: { not: null } },
        select: { agent_id: true, product_type: true, agent: { select: { employee_name: true } } },
        take:   MAX_ROWS,
      });
      const cells = new Map();
      for (const p of policies) {
        const agent = p.agent?.employee_name || p.agent_id;
        const key = `${titleize(p.product_type)}|${agent}`;
        cells.set(key, (cells.get(key) ?? 0) + 1);
      }
      // Fill the full grid so the heatmap stays rectangular.
      const products = [...new Set(policies.map((p) => titleize(p.product_type)))];
      const agents   = [...new Set(policies.map((p) => p.agent?.employee_name || p.agent_id))];
      const out = [];
      for (const series of products) {
        for (const name of agents) {
          out.push({ series, name, value: cells.get(`${series}|${name}`) ?? 0 });
        }
      }
      return out;
    },
  },
  {
    key: 'commission-by-period',
    label: 'Commission vs Source Premium',
    description: 'Commission earned against the premium it was calculated on, per period.',
    category: 'Production',
    shape: 'series',
    chart_type: 'composed',
    xKey: 'period',
    // First key is drawn as bars, the second as the overlaid line.
    yKey: ['commission', 'premium'],
    async run(db) {
      const grouped = await db.commissionEntry.groupBy({
        by: ['commission_period'],
        _sum: { commission_amount: true, source_premium: true },
      });
      return grouped
        .map((g) => ({
          period:     g.commission_period,
          commission: round(g._sum.commission_amount),
          premium:    round(g._sum.source_premium),
        }))
        .sort((a, b) => a.period.localeCompare(b.period));
    },
  },
  {
    key: 'commission-status-mix',
    label: 'Commission Status Mix',
    description: 'Pending, paid and clawed-back commission dollars.',
    category: 'Production',
    shape: 'series',
    chart_type: 'donut',
    xKey: 'status',
    yKey: 'amount',
    async run(db) {
      const grouped = await db.commissionEntry.groupBy({
        by: ['status'],
        _sum: { commission_amount: true },
      });
      return grouped.map((g) => ({
        status: titleize(g.status),
        key:    g.status,
        amount: round(g._sum.commission_amount),
      }));
    },
  },
  {
    key: 'renewals-due-buckets',
    label: 'Renewals Due',
    description: 'Policies bucketed by how soon their renewal date falls.',
    category: 'Production',
    shape: 'series',
    chart_type: 'bar',
    xKey: 'bucket',
    yKey: 'policies',
    async run(db) {
      const policies = await db.insurancePolicy.findMany({
        where:  { renewal_due_date: { not: null } },
        select: { renewal_due_date: true },
        take:   MAX_ROWS,
      });
      const now = Date.now();
      const buckets = [
        { bucket: 'Overdue',   policies: 0 },
        { bucket: '0–30 days', policies: 0 },
        { bucket: '31–60 days', policies: 0 },
        { bucket: '61–90 days', policies: 0 },
        { bucket: '90+ days',  policies: 0 },
      ];
      for (const p of policies) {
        const days = Math.floor((new Date(p.renewal_due_date).getTime() - now) / 86_400_000);
        const idx = days < 0 ? 0 : days <= 30 ? 1 : days <= 60 ? 2 : days <= 90 ? 3 : 4;
        buckets[idx].policies += 1;
      }
      return buckets;
    },
  },

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
    key: 'kpi-active-policies',
    label: 'Active Policies',
    description: 'Policies currently in force, vs the prior 30 days.',
    category: 'KPIs',
    shape: 'metric',
    async run(db) {
      const [value, d] = await Promise.all([
        db.insurancePolicy.count({ where: { status: 'active' } }),
        withDelta(db.insurancePolicy, 'created_at', 30, { status: 'active' }),
      ]);
      return { value, ...delta(d.current, d.previous) };
    },
  },
  {
    key: 'kpi-premium-in-force',
    label: 'Premium in Force',
    description: 'Annualised premium across all active policies.',
    category: 'KPIs',
    shape: 'metric',
    async run(db) {
      const policies = await db.insurancePolicy.findMany({
        where:  { status: 'active' },
        select: { premium_amount: true, premium_frequency: true },
        take:   MAX_ROWS,
      });
      const total = policies.reduce((s, p) => s + annualPremium(p), 0);
      return { value: money(total), raw: round(total), trend: 'flat' };
    },
  },
  {
    key: 'kpi-total-coverage',
    label: 'Total Coverage',
    description: 'Aggregate coverage amount carried on active policies.',
    category: 'KPIs',
    shape: 'metric',
    async run(db) {
      const agg = await db.insurancePolicy.aggregate({
        where: { status: 'active' },
        _sum:  { coverage_amount: true },
      });
      const total = num(agg._sum.coverage_amount);
      return { value: money(total), raw: total, trend: 'flat' };
    },
  },
  {
    key: 'kpi-new-applications-mtd',
    label: 'New Applications (MTD)',
    description: 'Applications submitted since the start of this month.',
    category: 'KPIs',
    shape: 'metric',
    async run(db) {
      const [value, d] = await Promise.all([
        db.insuranceApplication.count({ where: { submitted_at: { gte: startOfMonth() } } }),
        withDelta(db.insuranceApplication, 'submitted_at', 30),
      ]);
      return { value, ...delta(d.current, d.previous) };
    },
  },
  {
    key: 'kpi-pending-claims',
    label: 'Pending Claims',
    description: 'Claims not yet paid, denied or closed.',
    category: 'KPIs',
    shape: 'metric',
    async run(db) {
      const where = { status: { in: ['fnol', 'filed', 'under_investigation', 'approved'] } };
      const [value, d] = await Promise.all([
        db.insuranceClaim.count({ where }),
        withDelta(db.insuranceClaim, 'filed_at', 30, where),
      ]);
      // More new pending claims is a worse outcome — invert the trend colour.
      const t = delta(d.current, d.previous);
      return { value, change: t.change, trend: t.trend === 'up' ? 'down' : t.trend === 'down' ? 'up' : 'flat' };
    },
  },
  {
    key: 'kpi-claims-paid-ytd',
    label: 'Claims Paid (YTD)',
    description: 'Total claim dollars paid out since 1 January.',
    category: 'KPIs',
    shape: 'metric',
    async run(db) {
      const agg = await db.insuranceClaim.aggregate({
        where: { paid_at: { gte: startOfYear() } },
        _sum:  { paid_amount: true },
      });
      const total = num(agg._sum.paid_amount);
      return { value: money(total), raw: total, trend: 'flat' };
    },
  },
  {
    key: 'kpi-pending-commissions',
    label: 'Pending Commissions',
    description: 'Commission dollars earned but not yet paid to producers.',
    category: 'KPIs',
    shape: 'metric',
    async run(db) {
      const agg = await db.commissionEntry.aggregate({
        where: { status: 'pending' },
        _sum:  { commission_amount: true },
      });
      const total = num(agg._sum.commission_amount);
      return { value: money(total), raw: total, trend: 'flat' };
    },
  },
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
  {
    key: 'kpi-renewals-30d',
    label: 'Renewals Due (30 days)',
    description: 'Policies with a renewal date inside the next 30 days.',
    category: 'KPIs',
    shape: 'metric',
    async run(db) {
      const value = await db.insurancePolicy.count({
        where: { renewal_due_date: { gte: new Date(), lte: daysAhead(30) } },
      });
      return { value, trend: 'flat' };
    },
  },

  // ──────────────────────────── List / table ───────────────────────────────
  {
    key: 'list-recent-claims',
    label: 'Recent Claims',
    description: 'Newest claims with type, amount and status.',
    category: 'Lists',
    shape: 'rows',
    columns: ['Claim', 'Type', 'Amount', 'Status', 'Filed'],
    async run(db) {
      const claims = await db.insuranceClaim.findMany({
        orderBy: { filed_at: 'desc' },
        take:    10,
        select:  { claim_number: true, claim_type: true, amount: true, status: true, filed_at: true },
      });
      return claims.map((c) => ({
        Claim:  c.claim_number,
        Type:   titleize(c.claim_type),
        Amount: money(c.amount),
        Status: titleize(c.status),
        Filed:  new Date(c.filed_at).toISOString().slice(0, 10),
      }));
    },
  },
  {
    key: 'list-upcoming-renewals',
    label: 'Upcoming Renewals',
    description: 'Policies renewing soonest, with premium and agent.',
    category: 'Lists',
    shape: 'rows',
    columns: ['Policy', 'Product', 'Premium', 'Renews', 'Agent'],
    async run(db) {
      const policies = await db.insurancePolicy.findMany({
        where:   { renewal_due_date: { gte: new Date() } },
        orderBy: { renewal_due_date: 'asc' },
        take:    10,
        select:  { policy_number: true, product_type: true, premium_amount: true,
                   premium_frequency: true, renewal_due_date: true,
                   agent: { select: { employee_name: true } } },
      });
      return policies.map((p) => ({
        Policy:  p.policy_number,
        Product: titleize(p.product_type),
        Premium: money(annualPremium(p)),
        Renews:  new Date(p.renewal_due_date).toISOString().slice(0, 10),
        Agent:   p.agent?.employee_name ?? '—',
      }));
    },
  },
  {
    key: 'list-agent-leaderboard',
    label: 'Producer Leaderboard',
    description: 'Agents ranked by policies written and premium produced.',
    category: 'Lists',
    shape: 'rows',
    columns: ['Agent', 'Policies', 'Premium', 'Coverage'],
    async run(db) {
      const policies = await db.insurancePolicy.findMany({
        where:  { agent_id: { not: null } },
        select: { agent_id: true, premium_amount: true, premium_frequency: true,
                  coverage_amount: true, agent: { select: { employee_name: true } } },
        take:   MAX_ROWS,
      });
      const acc = new Map();
      for (const p of policies) {
        const name = p.agent?.employee_name || p.agent_id;
        const slot = acc.get(name) ?? { policies: 0, premium: 0, coverage: 0 };
        slot.policies += 1;
        slot.premium  += annualPremium(p);
        slot.coverage += num(p.coverage_amount);
        acc.set(name, slot);
      }
      return [...acc.entries()]
        .sort((a, b) => b[1].premium - a[1].premium)
        .slice(0, 10)
        .map(([Agent, s]) => ({
          Agent,
          Policies: s.policies,
          Premium:  money(s.premium),
          Coverage: money(s.coverage),
        }));
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
