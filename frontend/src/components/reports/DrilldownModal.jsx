import { useQuery } from '@tanstack/react-query';
import { ListTree, Download } from 'lucide-react';
import Modal from '../ui/Modal';
import Spinner from '../ui/Spinner';
import { reportService, downloadBlob } from '../../services/report.service';
import { formatValue, isNumericType } from '../../utils/report';

/**
 * DrilldownModal — the records behind one bar, slice or matrix cell.
 *
 * "Why is that number what it is?" is the first question anyone asks of a chart,
 * and having to rebuild the report as a table to answer it is what makes people
 * stop trusting dashboards. Clicking through re-runs the same filters plus the
 * bucket that was clicked, so what is listed is exactly what was counted.
 */
export default function DrilldownModal({ config, keys, scope, title, onClose }) {
  const { data, isPending, error } = useQuery({
    queryKey: ['report-drilldown', JSON.stringify({ config, keys, scope })],
    queryFn: () => reportService.drilldown(config, keys, scope),
    retry: false,
  });
  const result = data?.data ?? data;

  const exportCsv = () => {
    if (!result) return;
    const esc = (v) => {
      const s = v === null || v === undefined ? '' : String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const csv = [
      result.columns.map((c) => esc(c.label)).join(','),
      ...result.rows.map((r) => result.columns.map((c) => esc(r[c.key])).join(',')),
    ].join('\n');
    // Reuse the shared helper: it attaches the anchor before clicking, which some
    // browsers require for a programmatic download to actually start.
    downloadBlob(new Blob([csv], { type: 'text/csv;charset=utf-8' }), 'records.csv');
  };

  const subtitle = Object.entries(keys || {})
    .map(([, v]) => String(v))
    .join(' · ');

  return (
    <Modal
      isOpen
      onClose={onClose}
      size="xl"
      icon={ListTree}
      eyebrow="Records behind this number"
      title={title || 'Matching records'}
      subtitle={subtitle}
      footer={
        <div className="flex items-center justify-between gap-2">
          <span className="text-[11px] text-gray-400">
            {result ? `${result.rows.length} record${result.rows.length === 1 ? '' : 's'}` : ''}
            {result?.meta?.capped ? ' · showing the first 500' : ''}
          </span>
          <button
            type="button"
            onClick={exportCsv}
            disabled={!result?.rows?.length}
            className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-40 dark:border-white/10 dark:text-white/70 dark:hover:bg-white/5"
          >
            <Download className="h-3.5 w-3.5" /> Export these records
          </button>
        </div>
      }
    >
      {isPending ? (
        <div className="flex justify-center py-12"><Spinner /></div>
      ) : error ? (
        <p className="py-6 text-center text-sm text-rose-600 dark:text-rose-400">
          {error?.response?.data?.error?.message || 'Could not load these records.'}
        </p>
      ) : !result?.rows?.length ? (
        <p className="py-8 text-center text-sm text-gray-500 dark:text-white/50">
          No records matched — the grouping may have been recalculated since the chart was drawn.
        </p>
      ) : (
        <div className="max-h-[60vh] overflow-auto rounded-xl border border-gray-200 dark:border-white/10">
          <table className="min-w-full text-sm">
            <thead className="sticky top-0 bg-gray-50 dark:bg-[#1c2128]">
              <tr>
                {result.columns.map((c) => (
                  <th
                    key={c.key}
                    className={`whitespace-nowrap px-3 py-2 font-semibold text-gray-600 dark:text-white/70 ${isNumericType(c.type) ? 'text-right' : 'text-left'}`}
                  >
                    {c.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-white/5">
              {result.rows.map((r) => (
                <tr key={r.id} className="hover:bg-gray-50 dark:hover:bg-white/[0.03]">
                  {result.columns.map((c) => (
                    <td
                      key={c.key}
                      className={`px-3 py-2 text-gray-800 dark:text-white/80 ${isNumericType(c.type) ? 'text-right tabular-nums' : ''}`}
                    >
                      {formatValue(r[c.key], c.type)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Modal>
  );
}
