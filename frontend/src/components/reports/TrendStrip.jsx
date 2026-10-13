import { useMemo } from 'react';
import { History } from 'lucide-react';
import clsx from 'clsx';
import { formatValue, trendClass, trendOf, formatDelta } from '../../utils/report';

/**
 * TrendStrip — how this report's headline numbers have moved over its runs.
 *
 * Reads the report's snapshot history (one entry per scope per day, written each
 * time the saved report is run or emailed) and draws one sparkline per measure.
 * A report that reads *current state* — open pipeline, active accounts — cannot
 * otherwise answer "how did this look last month"; this is the lightweight
 * version of Salesforce's historical trending that needs no extra table.
 */
export default function TrendStrip({ history, className }) {
  const series = useMemo(() => buildSeries(history), [history]);
  if (!series.length) return null;

  return (
    <div className={clsx('mt-4 rounded-xl border border-gray-200 p-3 dark:border-white/10', className)}>
      <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-gray-700 dark:text-white/80">
        <History className="h-3.5 w-3.5 text-gray-400" /> Over time
        <span className="font-normal text-gray-400">· {history.snapshots.length} snapshot{history.snapshots.length === 1 ? '' : 's'} since {new Date(history.snapshots[0].at).toLocaleDateString()}</span>
      </p>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {series.map((s) => (
          <div key={s.key} className="flex items-center gap-3 rounded-lg bg-gray-50 px-3 py-2 dark:bg-white/5">
            <Sparkline points={s.points} className="h-8 w-24 shrink-0 text-primary-500" />
            <div className="min-w-0">
              <p className="truncate text-[11px] text-gray-500 dark:text-white/50">{s.label}</p>
              <p className="text-sm font-semibold tabular-nums text-gray-900 dark:text-white">
                {formatValue(s.last, s.type)}
                {s.deltaPct !== null && (
                  <span className={clsx('ml-1.5 text-[11px] font-medium', trendClass(trendOf(s.deltaPct)))}>{formatDelta(s.deltaPct)}</span>
                )}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Build one series per measure (plus row count), from oldest to newest. */
export function buildSeries(history) {
  const snaps = history?.snapshots ?? [];
  if (snaps.length < 2) return [];
  const cols = history.columns?.length ? history.columns : [];
  const out = [];
  const push = (key, label, type, pick) => {
    const points = snaps.map((s) => pick(s)).map((v) => (v === null || v === undefined ? null : Number(v)));
    if (points.every((v) => v === null)) return;
    const defined = points.filter((v) => v !== null);
    const first = defined[0], last = defined[defined.length - 1];
    out.push({ key, label, type, points, last, deltaPct: first ? Math.round(((last - first) / Math.abs(first)) * 1000) / 10 : null });
  };
  for (const c of cols) push(c.key, c.label, c.type, (s) => s.grand?.[c.key]);
  if (!out.length) push('row_count', 'Rows', 'number', (s) => s.row_count);
  return out;
}

function Sparkline({ points, className }) {
  const vals = points.filter((v) => v !== null);
  if (vals.length < 2) return <svg className={className} viewBox="0 0 96 32" />;
  const min = Math.min(...vals), max = Math.max(...vals);
  const span = max - min || 1;
  const step = 96 / (points.length - 1);
  const d = points.map((v, i) => (v === null ? null : `${(i * step).toFixed(1)},${(30 - ((v - min) / span) * 28).toFixed(1)}`)).filter(Boolean).join(' ');
  return (
    <svg className={className} viewBox="0 0 96 32" aria-hidden="true">
      <polyline points={d} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}
