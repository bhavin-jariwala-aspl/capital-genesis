'use strict';

/**
 * Report insights — plain-statistics narration of a result.
 *
 * Every serious analytics product now puts a sentence or two next to a chart
 * ("Enterprise is 62% of the total", "March is 40% above the average"). Users
 * trust those sentences only when they are *derived from the numbers on screen*,
 * so this module is deliberately not an LLM: each insight is a deterministic
 * calculation over `result.rows`, is reproducible, and can be unit-tested. The
 * optional AI layer (ai-reporting.service.js) reads these same insights when it
 * writes its summary, which keeps the prose grounded.
 *
 * An insight is `{ kind, severity, title, detail, measure?, rows?: [labels] }`.
 *   severity  'info' | 'notice' | 'warn'
 */

const CurrencyService = require('./currency.service');

const MAX_INSIGHTS = 6;
const MIN_ROWS_FOR_OUTLIERS = 6;
const OUTLIER_Z = 2;
const CONCENTRATION_SHARE = 0.6;
const TREND_MIN_POINTS = 4;
const MISSING_LABEL = '—';

function computeInsights(result, config = {}) {
  const out = [];
  const dims = result.columns.filter((c) => c.dimension);
  const measures = result.columns.filter((c) => !c.dimension && isNumeric(c.type));
  const rows = result.rows || [];
  if (!rows.length || !measures.length) {
    if (!rows.length) out.push({ kind: 'empty', severity: 'notice', title: 'No matching records', detail: 'Nothing matched the filters for this run. Widen the date range or remove a condition.' });
    return out.slice(0, MAX_INSIGHTS);
  }

  const primary = measures[0];
  const dim = dims[0];
  // Table calculations already transform the value; narrating "% of total of a %
  // of total" is noise, so insights use the first plain measure when one exists.
  const measure = measures.find((m) => !(config.metrics || []).find((s, i) => `m${i}` === m.key && s.calc)) || primary;
  const values = rows.map((r) => Number(r[measure.key]) || 0);
  const total = values.reduce((a, b) => a + b, 0);
  const isAdditive = additive(measure, config);

  if (dim && rows.length > 1) {
    // Missing-value share before anything else: a big "—" bucket changes how
    // every other sentence should be read.
    const missing = rows.find((r) => String(r[dim.key]) === MISSING_LABEL);
    if (missing && isAdditive && total > 0) {
      const share = (Number(missing[measure.key]) || 0) / total;
      if (share >= 0.1) {
        out.push({
          kind: 'data_quality', severity: 'warn', measure: measure.key, rows: [MISSING_LABEL],
          title: `${pct(share)} of ${lc(measure.label)} has no ${lc(dim.label)}`,
          detail: `Records with a blank ${lc(dim.label)} are grouped under “—”. Fill the field in on those records for a complete picture.`,
        });
      }
    }

    const isTime = /\(by (day|week|month|quarter|year)\)$/.test(dim.label || '');
    if (isTime) out.push(...trendInsights(rows, dim, measure, values));
    else out.push(...categoryInsights(rows, dim, measure, values, total, isAdditive));

    out.push(...outlierInsights(rows, dim, measure, values));
  }

  if (result.comparison?.rows?.length) out.push(...moverInsights(result, dim, measure));

  if (result.meta?.capped) {
    out.push({ kind: 'capped', severity: 'warn', title: 'Not every record was included', detail: 'The report hit its row limit. Add a date filter so the totals reflect the whole set.' });
  }
  if (result.summary?.hidden_rows) {
    out.push({ kind: 'truncated', severity: 'info', title: `${result.summary.hidden_rows} more rows are not shown`, detail: 'The report has a row limit; totals still include the hidden rows.' });
  }

  return dedupe(out).slice(0, MAX_INSIGHTS);
}

// ── Categories ──────────────────────────────────────────────────────────────

function categoryInsights(rows, dim, measure, values, total, isAdditive) {
  const out = [];
  const ranked = rows.map((r, i) => ({ label: String(r[dim.key]), v: values[i] })).sort((a, b) => b.v - a.v);
  const top = ranked[0];
  const bottom = ranked[ranked.length - 1];

  if (isAdditive && total > 0) {
    const topShare = top.v / total;
    out.push({
      kind: 'leader', severity: 'info', measure: measure.key, rows: [top.label],
      title: `${top.label} leads with ${pct(topShare)} of ${lc(measure.label)}`,
      detail: `${fmt(top.v, measure.type)} of ${fmt(total, measure.type)} across ${rows.length} ${plural(rows.length, lc(dim.label))}.`,
    });
    const n = Math.min(3, ranked.length - 1);
    if (rows.length >= 5 && n >= 2) {
      const share = ranked.slice(0, n).reduce((a, r) => a + r.v, 0) / total;
      if (share >= CONCENTRATION_SHARE) {
        out.push({
          kind: 'concentration', severity: 'notice', measure: measure.key, rows: ranked.slice(0, n).map((r) => r.label),
          title: `The top ${n} make up ${pct(share)} of the total`,
          detail: `${ranked.slice(0, n).map((r) => r.label).join(', ')} together account for most of ${lc(measure.label)}; the other ${rows.length - n} share the remaining ${pct(1 - share)}.`,
        });
      }
    }
    if (rows.length >= 8) {
      const tail = ranked.filter((r) => r.v / total < 0.02).length;
      if (tail >= rows.length / 2) {
        out.push({
          kind: 'long_tail', severity: 'info', measure: measure.key,
          title: `${tail} ${plural(tail, lc(dim.label))} each contribute under 2%`,
          detail: 'A long tail like this usually reads better with a "Top N" limit or by bucketing the small groups together.',
        });
      }
    }
  } else {
    out.push({
      kind: 'leader', severity: 'info', measure: measure.key, rows: [top.label],
      title: `${top.label} has the highest ${lc(measure.label)}`,
      detail: `${fmt(top.v, measure.type)}, against ${fmt(bottom.v, measure.type)} for ${bottom.label} at the other end.`,
    });
  }

  if (ranked.length >= 3 && top.v > 0 && bottom.v > 0 && top.v / bottom.v >= 5) {
    out.push({
      kind: 'spread', severity: 'info', measure: measure.key, rows: [top.label, bottom.label],
      title: `${top.label} is ${ratio(top.v / bottom.v)} ${bottom.label}`,
      detail: `The gap between the highest and lowest ${lc(dim.label)} is ${fmt(top.v - bottom.v, measure.type)}.`,
    });
  }
  return out;
}

// ── Time series ─────────────────────────────────────────────────────────────

function trendInsights(rows, dim, measure, values) {
  const out = [];
  // Ignore the "no date" bucket, which is never part of the series.
  const pts = rows.map((r, i) => ({ label: String(r[dim.key]), v: values[i] })).filter((p) => p.label !== MISSING_LABEL);
  if (pts.length < TREND_MIN_POINTS) return out;

  const first = pts[0], last = pts[pts.length - 1];
  const slope = linearSlope(pts.map((p) => p.v));
  const mean = pts.reduce((a, p) => a + p.v, 0) / pts.length;
  const relSlope = mean === 0 ? 0 : (slope * (pts.length - 1)) / Math.abs(mean);

  if (Math.abs(relSlope) >= 0.15) {
    const dir = slope > 0 ? 'rising' : 'falling';
    out.push({
      kind: 'trend', severity: 'info', measure: measure.key, rows: [first.label, last.label],
      title: `${measure.label} is ${dir} over the period`,
      detail: `From ${fmt(first.v, measure.type)} in ${first.label} to ${fmt(last.v, measure.type)} in ${last.label}${first.v ? ` (${signed(((last.v - first.v) / Math.abs(first.v)) * 100)}%)` : ''}.`,
    });
  } else {
    out.push({
      kind: 'trend', severity: 'info', measure: measure.key,
      title: `${measure.label} is broadly flat`,
      detail: `It averages ${fmt(mean, measure.type)} per ${periodOf(dim.label)} with no sustained rise or fall.`,
    });
  }

  const peak = pts.reduce((a, p) => (p.v > a.v ? p : a), pts[0]);
  const trough = pts.reduce((a, p) => (p.v < a.v ? p : a), pts[0]);
  if (peak.v !== trough.v && mean > 0) {
    out.push({
      kind: 'peak', severity: 'info', measure: measure.key, rows: [peak.label],
      title: `${peak.label} was the peak at ${fmt(peak.v, measure.type)}`,
      detail: `That is ${pct(peak.v / mean - 1, true)} above the period average; ${trough.label} was the low point at ${fmt(trough.v, measure.type)}.`,
    });
  }

  // Latest point vs the one before it — the question every Monday meeting asks.
  if (pts.length >= 2) {
    const prev = pts[pts.length - 2];
    if (prev.v !== 0) {
      const change = ((last.v - prev.v) / Math.abs(prev.v)) * 100;
      if (Math.abs(change) >= 20) {
        out.push({
          kind: 'latest_move', severity: Math.abs(change) >= 50 ? 'notice' : 'info', measure: measure.key, rows: [last.label],
          title: `${last.label} is ${signed(change)}% versus ${prev.label}`,
          detail: `${fmt(last.v, measure.type)} against ${fmt(prev.v, measure.type)} the ${periodOf(dim.label)} before.`,
        });
      }
    }
  }
  return out;
}

// ── Outliers ────────────────────────────────────────────────────────────────

function outlierInsights(rows, dim, measure, values) {
  if (rows.length < MIN_ROWS_FOR_OUTLIERS) return [];
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const sd = Math.sqrt(values.reduce((a, v) => a + (v - mean) ** 2, 0) / values.length);
  if (!sd) return [];
  const flagged = rows
    .map((r, i) => ({ label: String(r[dim.key]), v: values[i], z: (values[i] - mean) / sd }))
    .filter((p) => Math.abs(p.z) >= OUTLIER_Z && p.label !== MISSING_LABEL);
  if (!flagged.length) return [];
  return [{
    kind: 'outlier', severity: 'notice', measure: measure.key, rows: flagged.map((p) => p.label),
    title: `${flagged.length === 1 ? `${flagged[0].label} stands out` : `${flagged.length} groups stand out`} from the rest`,
    detail: `${flagged.map((p) => `${p.label} (${fmt(p.v, measure.type)})`).join(', ')} ${flagged.length === 1 ? 'is' : 'are'} more than two standard deviations from the average of ${fmt(mean, measure.type)}.`,
  }];
}

// ── Period-over-period movers ───────────────────────────────────────────────

function moverInsights(result, dim, measure) {
  const out = [];
  const cmp = result.comparison;
  const grandNow = result.summary?.grand?.[measure.key];
  const grandWas = cmp.grand?.[measure.key];
  if (isNum(grandNow) && isNum(grandWas) && grandWas !== 0) {
    const change = ((grandNow - grandWas) / Math.abs(grandWas)) * 100;
    out.push({
      kind: 'overall_change', severity: Math.abs(change) >= 25 ? 'notice' : 'info', measure: measure.key,
      title: `${measure.label} is ${signed(change)}% ${lc(cmp.label)}`,
      detail: `${fmt(grandNow, measure.type)} now against ${fmt(grandWas, measure.type)} before.`,
    });
  }
  if (!dim) return out;
  const deltas = result.rows.map((r, i) => ({
    label: String(r[dim.key]),
    delta: cmp.rows[i]?.[`${measure.key}__delta`],
    pct: cmp.rows[i]?.[`${measure.key}__delta_pct`],
  })).filter((d) => isNum(d.delta) && d.label !== MISSING_LABEL);
  if (deltas.length < 2) return out;
  const up = deltas.reduce((a, d) => (d.delta > a.delta ? d : a), deltas[0]);
  const down = deltas.reduce((a, d) => (d.delta < a.delta ? d : a), deltas[0]);
  if (up.delta > 0) {
    out.push({
      kind: 'mover_up', severity: 'info', measure: measure.key, rows: [up.label],
      title: `${up.label} gained the most (${fmt(up.delta, measure.type)})`,
      detail: `Up ${isNum(up.pct) ? `${signed(up.pct)}%` : 'from nothing'} ${lc(cmp.label)}.`,
    });
  }
  if (down.delta < 0 && down.label !== up.label) {
    out.push({
      kind: 'mover_down', severity: 'notice', measure: measure.key, rows: [down.label],
      title: `${down.label} fell the most (${fmt(down.delta, measure.type)})`,
      detail: `Down ${isNum(down.pct) ? `${Math.abs(down.pct).toFixed(1)}%` : ''} ${lc(cmp.label)}.`.replace(/\s+/g, ' '),
    });
  }
  return out;
}

// ── helpers ─────────────────────────────────────────────────────────────────

const isNumeric = (t) => ['number', 'currency', 'percent'].includes(t);
const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const lc = (s) => String(s || '').replace(/^./, (c) => c.toLowerCase());
const plural = (n, word) => (n === 1 ? word : /s$/.test(word) ? word : `${word}s`);
const pct = (share, plain = false) => `${Math.round(share * 1000) / 10}%`.replace(/\.0%$/, '%').replace(/^-/, plain ? '-' : '−');
const signed = (n) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${Math.abs(n).toFixed(1).replace(/\.0$/, '')}`;
const ratio = (r) => (r >= 10 ? `${Math.round(r)}× ` : `${r.toFixed(1)}× `);
const periodOf = (label) => (/\(by (\w+)\)/.exec(label || '') || [])[1] || 'period';

/** Whether the measure sums meaningfully across rows — shares only make sense then. */
function additive(measure, config) {
  const idx = /^m(\d+)$/.exec(measure.key);
  const spec = idx ? (config.metrics || [])[+idx[1]] : null;
  if (!spec) return measure.type !== 'percent';
  if (spec.formula || spec.agg === 'formula') return false;
  return ['count', 'sum', undefined].includes(spec.agg) && !spec.calc;
}

function linearSlope(ys) {
  const n = ys.length;
  const xm = (n - 1) / 2;
  const ym = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0, den = 0;
  ys.forEach((y, x) => { num += (x - xm) * (y - ym); den += (x - xm) ** 2; });
  return den ? num / den : 0;
}

function fmt(v, type) {
  if (!isNum(v)) return '—';
  if (type === 'percent') return `${Math.round(v * 10) / 10}%`;
  const abs = Math.abs(v);
  if (type === 'currency') {
    // Formatted in the tenant's currency (request or scheduled-run context), the
    // same way the emailed HTML does it, so the sentence matches the table.
    const money = CurrencyService.activeProfile();
    if (abs >= 1e6) return money.format(v / 1e6, { decimals: 1 }) + 'M';
    if (abs >= 1e4) return money.format(v / 1e3, { decimals: 1 }) + 'k';
    return money.format(v, { decimals: abs < 100 && !Number.isInteger(v) ? 2 : 0 });
  }
  if (abs >= 1e6) return `${(v / 1e6).toFixed(1)}M`;
  if (abs >= 1e4) return `${(v / 1e3).toFixed(1)}k`;
  return Number.isInteger(v) ? v.toLocaleString('en-US') : v.toLocaleString('en-US', { maximumFractionDigits: 2 });
}

function dedupe(list) {
  const seen = new Set();
  return list.filter((i) => { const k = `${i.kind}|${i.title}`; if (seen.has(k)) return false; seen.add(k); return true; });
}

module.exports = { computeInsights, linearSlope };
