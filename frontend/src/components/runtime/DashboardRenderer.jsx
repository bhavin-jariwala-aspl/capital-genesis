import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import ChartRenderer from './ChartRenderer';
import Spinner from '../ui/Spinner';
import { TrendingUp, TrendingDown, Minus, CalendarRange, X } from 'lucide-react';
import { useDataSourceRows, useDataSourceRecord } from '../../hooks/useDataSource';
import { resolveWidgetChart } from '../../utils/dashboard';
import { formatValue, isNumericType } from '../../utils/report';
import { makeValueFormatter } from '../../utils/chart';
import { useCurrencyStore } from '../../store/currencyStore';
import { reportService } from '../../services/report.service';

/**
 * Dashboard-level filters. A date range chosen here is applied to every
 * report-backed widget at once (on each report's primary date field) without
 * editing any report — the cross-filtering every BI tool has and CRM dashboards
 * usually lack. Endpoint-backed widgets are unaffected; the bar says so.
 */
const isReportWidget = (w) => w?.data_source?.type === 'report' && !!w.data_source.report_id;
const withGlobal = (w, global) =>
  (global && isReportWidget(w) ? { ...w, data_source: { ...w.data_source, global } } : w);

export default function DashboardRenderer({ dashboard, loading = false }) {
  const [global, setGlobal] = useState(null);
  const widgetsWithGlobal = useMemo(
    () => (dashboard?.widgets || []).map((w) => withGlobal(w, global)),
    [dashboard?.widgets, global],
  );
  const reportCount = widgetsWithGlobal.filter(isReportWidget).length;

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12">
        <Spinner size="xl" />
      </div>
    );
  }

  if (!dashboard) {
    return (
      <div className="flex items-center justify-center p-12 text-gray-400">
        No dashboard selected.
      </div>
    );
  }

  const widgets = widgetsWithGlobal.filter(w => w.is_active !== false);
  const metrics = widgets.filter(w => w.widget_type === 'metric');
  const charts  = widgets.filter(w => w.widget_type === 'chart');
  const textWs  = widgets.filter(w => w.widget_type === 'text');
  const listWs  = widgets.filter(w => w.widget_type === 'list');

  const metricsGridCls =
    metrics.length >= 4 ? 'grid-cols-2 md:grid-cols-4' :
    metrics.length === 3 ? 'grid-cols-1 md:grid-cols-3' :
    'grid-cols-2';

  return (
    <div className="p-6 space-y-6">
      {/* Dashboard label */}
      <div>
        <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">
          {dashboard.label || dashboard.name}
        </h2>
        {dashboard.description && (
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">{dashboard.description}</p>
        )}
      </div>

      {reportCount > 0 && (
        <GlobalFilterBar global={global} onChange={setGlobal} reportCount={reportCount} total={widgets.length} />
      )}

      {/* KPI metric cards */}
      {metrics.length > 0 && (
        <div className={`grid gap-4 ${metricsGridCls}`}>
          {metrics.map(w => <MetricCard key={w.id} widget={w} />)}
        </div>
      )}

      {/* Chart widgets */}
      {charts.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {charts.map(w => (
            <div
              key={w.id}
              className={`bg-white dark:bg-night-2 rounded-xl border border-gray-100 dark:border-white/[0.07] shadow-sm overflow-hidden${w.w >= 8 ? ' lg:col-span-2' : ''}`}
            >
              <div className="px-5 py-3 border-b border-gray-100 dark:border-white/[0.07]">
                <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-200">{w.title || 'Chart'}</h3>
              </div>
              <div style={{ height: 260 }} className="p-4">
                <ChartRenderer chart={resolveWidgetChart(w)} />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Text widgets */}
      {textWs.map(w => (
        <div key={w.id} className="bg-white dark:bg-night-2 rounded-xl border border-gray-100 dark:border-white/[0.07] shadow-sm p-5">
          {w.title && <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-2">{w.title}</h3>}
          <p className="text-sm text-gray-600 dark:text-gray-400 whitespace-pre-wrap">{w.config?.content}</p>
        </div>
      ))}

      {/* List widgets */}
      {listWs.map(w => (
        <div key={w.id} className="bg-white dark:bg-night-2 rounded-xl border border-gray-100 dark:border-white/[0.07] shadow-sm overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-100 dark:border-white/[0.07]">
            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-200">{w.title || 'List'}</h3>
          </div>
          <ListWidget widget={w} />
        </div>
      ))}

      {/* Empty state */}
      {widgets.length === 0 && (
        <div className="flex items-center justify-center py-24 text-gray-400 text-sm">
          No widgets configured for this dashboard.
        </div>
      )}
    </div>
  );
}

function GlobalFilterBar({ global, onChange, reportCount, total }) {
  const { data } = useQuery({ queryKey: ['report-vocabulary'], queryFn: reportService.getVocabulary, staleTime: Infinity });
  const presets = (data?.data ?? data)?.date_presets ?? [];
  const value = typeof global?.date_range === 'string' ? global.date_range : '';
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-gray-100 bg-white px-4 py-2.5 text-sm shadow-sm dark:border-white/[0.07] dark:bg-night-2">
      <CalendarRange className="h-4 w-4 text-primary-500" />
      <span className="text-xs font-medium text-gray-600 dark:text-gray-300">Date range for every report widget</span>
      <select
        aria-label="Dashboard date range"
        className="rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs text-gray-900 focus:border-primary-500 focus:outline-none dark:border-white/10 dark:bg-white/5 dark:text-white"
        value={value}
        onChange={(e) => onChange(e.target.value ? { date_range: e.target.value } : null)}
      >
        <option value="">As each report is built</option>
        {presets.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
      </select>
      {value && (
        <button type="button" onClick={() => onChange(null)} className="flex items-center gap-1 text-xs text-gray-500 hover:text-primary-600 dark:text-gray-400" aria-label="Clear dashboard date range">
          <X className="h-3.5 w-3.5" /> Clear
        </button>
      )}
      {reportCount < total && (
        <span className="ml-auto text-[11px] text-gray-400">Applies to {reportCount} of {total} widgets — the rest read fixed datasets.</span>
      )}
    </div>
  );
}

const TREND = {
  up:   { Icon: TrendingUp,   bg: 'bg-emerald-50 dark:bg-emerald-900/30', text: 'text-emerald-600 dark:text-emerald-400', iconBg: 'bg-emerald-100 dark:bg-emerald-900/40' },
  down: { Icon: TrendingDown, bg: 'bg-red-50 dark:bg-red-900/30',         text: 'text-red-500 dark:text-red-400',         iconBg: 'bg-red-100 dark:bg-red-900/40'     },
  flat: { Icon: Minus,        bg: 'bg-gray-50 dark:bg-white/5',           text: 'text-gray-500 dark:text-gray-400',       iconBg: 'bg-gray-100 dark:bg-white/10'      },
};

function MetricCard({ widget }) {
  const { data: row, loading, error } = useDataSourceRecord(widget.data_source);
  const currency = useCurrencyStore((s) => s.code);

  const valueKey = widget.config?.valueKey || 'value';
  const changeKey = widget.config?.changeKey || 'change';
  const rawValue = row[valueKey] ?? row.value;
  // A report-backed tile reports its own measure type, so a currency measure
  // renders as currency without the widget having to be told.
  // Otherwise the widget's own `config.format` applies (currency, compact
  // currency, percent…) in the workspace currency; a bare number still gets
  // digit grouping rather than printing as "5628201541.5".
  const value    = rawValue === null || rawValue === undefined
    ? '—'
    : row.type
      ? formatValue(rawValue, row.type)
      : makeValueFormatter({ format: widget.config?.format ?? 'number', decimals: widget.config?.decimals ?? 0, currency })(rawValue);
  const change   = row[changeKey] ?? row.change ?? widget.config?.change;
  const trendKey = row.trend  ?? widget.config?.trend ?? 'flat';
  const { Icon, bg, text, iconBg } = TREND[trendKey] ?? TREND.flat;

  return (
    <div className="bg-white dark:bg-night-2 rounded-xl border border-gray-100 dark:border-white/[0.07] shadow-sm p-5 flex items-start gap-4">
      <div className={`${iconBg} rounded-lg p-2.5 flex-shrink-0`}>
        <Icon className={`w-5 h-5 ${text}`} />
      </div>
      <div className="min-w-0">
        <p className="text-xs font-medium text-gray-500 dark:text-gray-400 truncate">{widget.title}</p>
        {loading ? (
          <div className="mt-2 h-7 w-20 rounded bg-gray-100 dark:bg-white/[0.07] animate-pulse" />
        ) : error ? (
          <p className="text-sm text-red-500 mt-1" title={error}>Unavailable</p>
        ) : (
          <p className="text-2xl font-bold text-gray-900 dark:text-gray-100 mt-0.5">{value}</p>
        )}
        {!loading && !error && change && (
          <span className={`inline-flex items-center gap-1 mt-1 text-xs font-medium px-1.5 py-0.5 rounded-full ${bg} ${text}`}>
            {change}
          </span>
        )}
      </div>
    </div>
  );
}

function ListWidget({ widget }) {
  const { data: rows, meta, loading, error } = useDataSourceRows(widget.data_source);

  // A report-backed list gets its headings and value types from the report, so a
  // column reads "Pipeline value / $1,200,000" rather than "m0 / 1200000".
  const columns = meta?.columns?.length
    ? meta.columns
    : (widget.config?.columns || (rows[0] ? Object.keys(rows[0]) : [])).map((key) => ({ key, label: key }));

  if (loading) {
    return (
      <div className="flex items-center justify-center py-10">
        <Spinner size="md" />
      </div>
    );
  }

  if (error) {
    return <div className="px-4 py-8 text-center text-sm text-red-500">{error}</div>;
  }

  return (
    <div className="overflow-auto text-sm">
      <table className="w-full text-left">
        <thead className="bg-gray-50 dark:bg-white/5">
          <tr>
            {columns.map(col => (
              <th
                key={col.key}
                className={`px-4 py-2.5 font-medium text-gray-600 dark:text-gray-300 text-xs uppercase tracking-wide ${isNumericType(col.type) ? 'text-right' : ''}`}
              >
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-t border-gray-100 dark:border-white/[0.07] hover:bg-gray-50 dark:hover:bg-white/5 transition-colors">
              {columns.map(col => (
                <td
                  key={col.key}
                  className={`px-4 py-2.5 text-gray-700 dark:text-gray-300 ${isNumericType(col.type) ? 'text-right tabular-nums' : ''}`}
                >
                  {col.type ? formatValue(row[col.key], col.type) : String(row[col.key] ?? '')}
                </td>
              ))}
            </tr>
          ))}
          {!rows.length && (
            <tr>
              <td colSpan={columns.length || 1} className="px-4 py-8 text-center text-gray-400">
                No data
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
