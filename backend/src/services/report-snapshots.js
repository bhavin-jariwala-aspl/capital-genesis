'use strict';

/**
 * Report snapshots — a bounded history of a saved report's headline numbers.
 *
 * Every time a saved report is run (by a person or by a schedule) its grand
 * totals and row count are appended to `custom_reports.cached_result`, one entry
 * per scope per calendar day. That is enough to draw "how has this KPI moved
 * over the last few months" without a warehouse, and it is what Salesforce
 * calls historical trending and Power BI calls a snapshot.
 *
 * The column is the legacy `cached_result` JSON, which used to hold a whole
 * result blob and was never read back. It now holds:
 *
 *   { version: 1,
 *     columns:   [{ key, label, type }],            // the measures, from the latest run
 *     snapshots: [{ at, scope, row_count, grand }]  // oldest first, capped
 *   }
 *
 * Writes are best-effort: a snapshot must never make a report run fail.
 */

const MAX_SNAPSHOTS = 120;
const VERSION = 1;

/** The measures worth remembering for a result — never dimensions. */
function measureColumns(result) {
  return (result?.columns || [])
    .filter((c) => !c.dimension && ['number', 'currency', 'percent'].includes(c.type))
    .map((c) => ({ key: c.key, label: c.label, type: c.type }));
}

/**
 * Merge one run into the stored history. Pure: returns the new blob.
 * @param {object|null} current   the stored `cached_result`
 * @param {object} result         a ReportService.run() result
 * @param {string} scope          me | team | all
 * @param {Date} [now]
 */
function appendSnapshot(current, result, scope, now = new Date()) {
  const grand = result?.summary?.grand ?? headline(result);
  const entry = {
    at: now.toISOString(),
    scope: scope || 'all',
    row_count: result?.meta?.row_count ?? (result?.rows?.length || 0),
    grand: grand && Object.keys(grand).length ? grand : null,
  };
  // A report with neither totals nor a single-row headline has nothing to trend.
  if (entry.grand === null && !Number.isFinite(entry.row_count)) return current;

  const prior = isBlob(current) ? current.snapshots : [];
  const day = entry.at.slice(0, 10);
  const kept = prior.filter((s) => !(s.scope === entry.scope && String(s.at).slice(0, 10) === day));
  kept.push(entry);
  kept.sort((a, b) => String(a.at).localeCompare(String(b.at)));

  return {
    version: VERSION,
    columns: measureColumns(result),
    snapshots: kept.slice(-MAX_SNAPSHOTS),
  };
}

/**
 * The headline numbers of a report that did not ask for totals. A KPI report's
 * headline is its single row; a grouped report's is the sum of each additive
 * measure (counts and sums) across its rows. Averages, min/max, formulas and
 * table calculations cannot be combined from buckets and are left out rather
 * than recorded wrong — the same rule grandTotals follows.
 */
function headline(result) {
  const rows = result?.rows || [];
  if (!rows.length) return null;
  const measures = measureColumns(result);
  const hasDimension = (result.columns || []).some((c) => c.dimension);
  const out = {};
  if (!hasDimension) {
    for (const c of measures) if (c.key in rows[0]) out[c.key] = rows[0][c.key];
    return out;
  }
  const additive = (result.columns || []).filter((c) => !c.dimension && ['count', 'sum'].includes(c.agg) && !c.calc);
  for (const c of additive) out[c.key] = round(rows.reduce((a, r) => a + (Number(r[c.key]) || 0), 0));
  return out;
}

const round = (n) => Math.round(n * 100) / 100;

/** Persist a run's snapshot. Swallows errors — trending must never break a run. */
async function recordSnapshot(db, report, result, scope) {
  try {
    const next = appendSnapshot(report.cached_result, result, scope);
    if (next === report.cached_result) return null;
    await db.customReport.update({
      where: { id: report.id },
      data: { cached_result: next, last_run_at: new Date() },
    });
    return next;
  } catch {
    return null;
  }
}

/** The stored history, filtered to one scope, shaped for a sparkline. */
function listSnapshots(report, scope) {
  const blob = isBlob(report?.cached_result) ? report.cached_result : { columns: [], snapshots: [] };
  const snapshots = blob.snapshots.filter((s) => !scope || s.scope === scope);
  return {
    columns: blob.columns || [],
    snapshots,
    scope: scope || null,
    // Enough history to say something about a trend — the UI hides the strip below this.
    enough: snapshots.length >= 2,
  };
}

const isBlob = (v) => !!v && typeof v === 'object' && Array.isArray(v.snapshots);

module.exports = { appendSnapshot, recordSnapshot, listSnapshots, measureColumns, MAX_SNAPSHOTS };
