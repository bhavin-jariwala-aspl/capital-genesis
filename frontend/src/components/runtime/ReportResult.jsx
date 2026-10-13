import { useMemo, useState } from 'react';
import {
  BarChart, Bar, LineChart, Line, AreaChart, Area, PieChart, Pie, Cell,
  FunnelChart, Funnel, LabelList,
  XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend,
} from 'recharts';
import { TrendingUp, TrendingDown, Minus, AlertTriangle } from 'lucide-react';
import clsx from 'clsx';
import {
  CHART_COLORS, formatValue, compactNumber, isNumericType,
  cellFormatClass, trendOf, trendClass, formatDelta,
} from '../../utils/report';
import DrilldownModal from '../reports/DrilldownModal';

/**
 * Renders a report result according to its visualization.
 *
 * Shared by the builder preview, the report viewer and report-backed dashboard
 * widgets, so a report always looks the same wherever it appears. Beyond drawing
 * the data it carries the three things that make a report trustworthy:
 *
 *   • totals — a grand total row, and subtotals per first grouping on a matrix
 *   • comparison — the previous period's value and the % change, when the report
 *     asked for one
 *   • drill-down — clicking a bar, slice or row opens the records behind it
 */
export default function ReportResult({
  result,
  viz = 'table',
  height = 340,
  formatRules = [],
  config = null,
  scope,
  onDrilldown,
}) {
  const [drill, setDrill] = useState(null);

  const columns = useMemo(() => result?.columns ?? [], [result]);
  const dimCols = useMemo(() => columns.filter((c) => c.dimension), [columns]);
  const metricCols = useMemo(() => columns.filter((c) => !c.dimension), [columns]);
  const rows = result?.rows ?? [];

  // Drill-down is only meaningful for a grouped report we still hold the config for.
  const canDrill = !!(config && result?.meta?.drilldown && dimCols.length);
  const openDrill = (row) => {
    if (!canDrill) return;
    const keys = Object.fromEntries(dimCols.map((c) => [c.key, row[c.key]]));
    const title = dimCols.map((c) => formatValue(row[c.key], c.type)).join(' · ');
    if (onDrilldown) onDrilldown(keys, title);
    else setDrill({ keys, title });
  };

  if (!result) return null;

  const warnings = result.meta?.warnings ?? [];

  const body = (() => {
    if (rows.length === 0) {
      return (
        <div className="flex h-40 flex-col items-center justify-center gap-1 text-center">
          <p className="text-sm text-gray-500 dark:text-white/50">No records match this report.</p>
          <p className="text-xs text-gray-400">Try widening the date range or removing a filter.</p>
        </div>
      );
    }

    if (viz === 'kpi') {
      return <KpiTiles metricCols={metricCols} rows={rows} summary={result.summary} comparison={result.comparison} />;
    }
    if (viz === 'pivot' && dimCols.length >= 2 && metricCols.length >= 1) {
      return (
        <PivotTable
          dimCols={dimCols}
          metric={metricCols[0]}
          rows={rows}
          summary={result.summary}
          formatRules={formatRules}
          onCellClick={canDrill ? openDrill : null}
        />
      );
    }
    if (['bar', 'line', 'area', 'pie', 'donut', 'funnel'].includes(viz)) {
      return (
        <ChartView
          viz={viz}
          dimCols={dimCols}
          metricCols={metricCols}
          rows={rows}
          comparison={result.comparison}
          height={height}
          onPointClick={canDrill ? openDrill : null}
        />
      );
    }
    return (
      <TableView
        columns={columns}
        rows={rows}
        summary={result.summary}
        comparison={result.comparison}
        metricCols={metricCols}
        formatRules={formatRules}
        onRowClick={canDrill ? openDrill : null}
      />
    );
  })();

  return (
    <div className="space-y-2">
      {warnings.length > 0 && (
        <div className="space-y-1">
          {warnings.map((w, i) => (
            <p key={i} className="flex items-start gap-1.5 rounded-lg bg-amber-50 px-2.5 py-1.5 text-[11px] text-amber-700 dark:bg-amber-500/10 dark:text-amber-300">
              <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" /> {w}
            </p>
          ))}
        </div>
      )}

      {body}

      {canDrill && rows.length > 0 && (
        <p className="text-[10px] text-gray-400">Click a {viz === 'table' ? 'row' : viz === 'pivot' ? 'cell' : 'point'} to see the records behind it.</p>
      )}

      {drill && (
        <DrilldownModal
          config={config}
          keys={drill.keys}
          scope={scope}
          title={drill.title}
          onClose={() => setDrill(null)}
        />
      )}
    </div>
  );
}

// ── Table ───────────────────────────────────────────────────────────────────

function TableView({ columns, rows, summary, comparison, metricCols, formatRules, onRowClick }) {
  const showCompare = !!comparison?.rows?.length;

  return (
    <div className="overflow-auto rounded-xl border border-gray-200 dark:border-white/10">
      <table className="min-w-full text-sm">
        <thead className="bg-gray-50 dark:bg-white/5">
          <tr>
            {columns.map((c) => (
              <th
                key={c.key}
                className={clsx(
                  'whitespace-nowrap px-3 py-2 font-semibold text-gray-600 dark:text-white/70',
                  isNumericType(c.type) ? 'text-right' : 'text-left',
                )}
              >
                {c.label}
              </th>
            ))}
            {showCompare && metricCols.map((c) => (
              <th key={`${c.key}-cmp`} className="whitespace-nowrap px-3 py-2 text-right font-semibold text-gray-400 dark:text-white/40">
                vs {comparison.label.toLowerCase()}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100 dark:divide-white/5">
          {rows.map((r, i) => (
            <tr
              key={i}
              onClick={onRowClick ? () => onRowClick(r) : undefined}
              className={clsx(
                'hover:bg-gray-50 dark:hover:bg-white/[0.03]',
                onRowClick && 'cursor-pointer',
              )}
            >
              {columns.map((c) => (
                <td
                  key={c.key}
                  className={clsx(
                    'px-3 py-2 text-gray-800 dark:text-white/80',
                    isNumericType(c.type) && 'text-right font-medium tabular-nums',
                    cellFormatClass(formatRules, c.key, r[c.key]),
                  )}
                >
                  {formatValue(r[c.key], c.type)}
                </td>
              ))}
              {showCompare && metricCols.map((c) => (
                <DeltaCell key={`${c.key}-cmp`} cmp={comparison.rows[i]} col={c} />
              ))}
            </tr>
          ))}
        </tbody>
        {summary?.grand && Object.keys(summary.grand).length > 0 && (
          <tfoot>
            <tr className="border-t-2 border-gray-200 bg-gray-50 font-semibold dark:border-white/15 dark:bg-white/5">
              {columns.map((c, i) => (
                <td
                  key={c.key}
                  className={clsx('px-3 py-2 text-gray-900 dark:text-white', isNumericType(c.type) && 'text-right tabular-nums')}
                >
                  {i === 0
                    ? 'Total'
                    : summary.grand[c.key] === undefined
                      ? ''
                      : summary.grand[c.key] === null
                        ? '—'
                        : formatValue(summary.grand[c.key], c.type)}
                </td>
              ))}
              {showCompare && metricCols.map((c) => <td key={`${c.key}-cmp-total`} />)}
            </tr>
            {summary.hidden_rows > 0 && (
              <tr>
                <td colSpan={columns.length + (showCompare ? metricCols.length : 0)} className="px-3 py-1.5 text-[11px] text-gray-400">
                  The total includes {summary.hidden_rows} further row{summary.hidden_rows === 1 ? '' : 's'} not shown by the row limit.
                </td>
              </tr>
            )}
          </tfoot>
        )}
      </table>
    </div>
  );
}

function DeltaCell({ cmp, col }) {
  const pct = cmp?.[`${col.key}__delta_pct`];
  const prev = cmp?.[col.key];

  // A null prior value means this bucket had no counterpart in the earlier period —
  // which is different from it having been zero, and must not read as a change.
  if (prev === null || prev === undefined) {
    return (
      <td className="whitespace-nowrap px-3 py-2 text-right">
        <span className="text-[10px] text-gray-400">no earlier data</span>
      </td>
    );
  }

  const trend = trendOf(pct);
  const Icon = trend === 'up' ? TrendingUp : trend === 'down' ? TrendingDown : Minus;

  return (
    <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">
      <span className={clsx('inline-flex items-center gap-1 text-xs font-medium', trendClass(trend))}>
        <Icon className="h-3 w-3" />
        {formatDelta(pct) ?? '—'}
      </span>
      <span className="ml-1.5 text-[10px] text-gray-400">was {formatValue(prev, col.type)}</span>
    </td>
  );
}

// ── Charts ──────────────────────────────────────────────────────────────────

function ChartView({ viz, dimCols, metricCols, rows, comparison, height, onPointClick }) {
  const xKey = dimCols[0]?.key || 'x';
  const data = useMemo(
    () => rows.map((r, i) => ({
      ...r,
      __x: formatValue(r[xKey], dimCols[0]?.type),
      __i: i,
      // Fold the previous period in as an extra series when comparing.
      ...(comparison?.rows?.[i]
        ? Object.fromEntries(metricCols.map((m) => [`${m.key}__prev`, comparison.rows[i][m.key]]))
        : {}),
    })),
    [rows, xKey, dimCols, comparison, metricCols],
  );

  const axis = { fontSize: 11, fill: 'currentColor' };
  const tooltip = {
    contentStyle: { borderRadius: 12, border: '1px solid rgba(0,0,0,0.08)', fontSize: 12 },
    formatter: (v, name) => {
      const col = metricCols.find((m) => m.label === name || `${m.label} (previous)` === name);
      return [formatValue(v, col?.type || 'number'), name];
    },
  };
  const clickProps = onPointClick
    ? { onClick: (e) => { const p = e?.activePayload?.[0]?.payload ?? e?.payload; if (p) onPointClick(rows[p.__i] ?? p); }, style: { cursor: 'pointer' } }
    : {};

  if (viz === 'pie' || viz === 'donut') {
    const m = metricCols[0];
    if (!m) return <Empty />;
    return (
      <ResponsiveContainer width="100%" height={height}>
        <PieChart>
          <Pie
            data={data}
            dataKey={m.key}
            nameKey="__x"
            cx="50%"
            cy="50%"
            outerRadius={height / 3}
            innerRadius={viz === 'donut' ? height / 6 : 0}
            paddingAngle={2}
            onClick={onPointClick ? (p) => onPointClick(rows[p.__i] ?? p) : undefined}
            cursor={onPointClick ? 'pointer' : undefined}
          >
            {data.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
          </Pie>
          <Tooltip {...tooltip} formatter={(v) => formatValue(v, m.type)} />
          <Legend wrapperStyle={{ fontSize: 12 }} />
        </PieChart>
      </ResponsiveContainer>
    );
  }

  if (viz === 'funnel') {
    const m = metricCols[0];
    if (!m) return <Empty />;
    return (
      <ResponsiveContainer width="100%" height={height}>
        <FunnelChart>
          <Tooltip {...tooltip} formatter={(v) => formatValue(v, m.type)} />
          <Funnel
            dataKey={m.key}
            data={data}
            isAnimationActive
            onClick={onPointClick ? (p) => onPointClick(rows[p.__i] ?? p) : undefined}
            cursor={onPointClick ? 'pointer' : undefined}
          >
            {data.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
            <LabelList position="right" dataKey="__x" fill="currentColor" stroke="none" fontSize={11} className="text-gray-500" />
          </Funnel>
        </FunnelChart>
      </ResponsiveContainer>
    );
  }

  const Chart = viz === 'bar' ? BarChart : viz === 'area' ? AreaChart : LineChart;
  const showLegend = metricCols.length > 1 || !!comparison;

  return (
    <ResponsiveContainer width="100%" height={height}>
      <Chart data={data} margin={{ top: 8, right: 16, left: 4, bottom: 4 }} className="text-gray-400" {...clickProps}>
        <CartesianGrid strokeDasharray="3 3" className="stroke-gray-200 dark:stroke-white/10" vertical={false} />
        <XAxis dataKey="__x" tick={axis} tickLine={false} axisLine={false} interval="preserveStartEnd" />
        <YAxis tick={axis} tickLine={false} axisLine={false} tickFormatter={compactNumber} width={48} />
        <Tooltip {...tooltip} />
        {showLegend && <Legend wrapperStyle={{ fontSize: 12 }} />}

        {metricCols.map((m, i) => {
          const color = CHART_COLORS[i % CHART_COLORS.length];
          if (viz === 'bar') return <Bar key={m.key} dataKey={m.key} name={m.label} fill={color} radius={[4, 4, 0, 0]} maxBarSize={56} />;
          if (viz === 'area') return <Area key={m.key} dataKey={m.key} name={m.label} stroke={color} fill={color} fillOpacity={0.18} strokeWidth={2.5} />;
          return <Line key={m.key} dataKey={m.key} name={m.label} stroke={color} strokeWidth={2.5} dot={false} />;
        })}

        {/* Previous period drawn as a muted dashed line, whatever the main viz is. */}
        {comparison && metricCols.map((m, i) => (
          <Line
            key={`${m.key}__prev`}
            type="monotone"
            dataKey={`${m.key}__prev`}
            name={`${m.label} (previous)`}
            stroke={CHART_COLORS[i % CHART_COLORS.length]}
            strokeWidth={1.5}
            strokeDasharray="4 3"
            strokeOpacity={0.55}
            dot={false}
          />
        ))}
      </Chart>
    </ResponsiveContainer>
  );
}

const Empty = () => (
  <div className="flex h-40 items-center justify-center text-sm text-gray-400">
    Add a measure to draw this chart.
  </div>
);

// ── KPI tiles ───────────────────────────────────────────────────────────────

function KpiTiles({ metricCols, rows, summary, comparison }) {
  // With no grouping there is exactly one row; with a grouping, the totals are
  // the honest headline number, so prefer them when present.
  const row = rows[0] || {};
  const cmp = comparison?.rows?.[0];

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
      {metricCols.map((m, i) => {
        // A grand total of `null` is the engine saying "this cannot be totalled"
        // (a distinct count, a derived measure). Showing the first bucket's value
        // instead would label one group's number as the headline total.
        const grand = summary?.grand;
        const value = grand && m.key in grand ? grand[m.key] : row[m.key];
        const pct = cmp?.[`${m.key}__delta_pct`];
        const trend = trendOf(pct);
        const Icon = trend === 'up' ? TrendingUp : trend === 'down' ? TrendingDown : Minus;

        return (
          <div key={m.key} className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-white/10 dark:bg-[#161b22]">
            <div className="h-1 w-8 rounded-full" style={{ background: CHART_COLORS[i % CHART_COLORS.length] }} />
            <div className="mt-2 text-2xl font-bold text-gray-900 dark:text-white">{formatValue(value, m.type)}</div>
            <div className="mt-0.5 text-xs text-gray-500 dark:text-white/50">{m.label}</div>
            {pct !== null && pct !== undefined && (
              <div className={clsx('mt-1.5 flex items-center gap-1 text-[11px] font-medium', trendClass(trend))}>
                <Icon className="h-3 w-3" />
                {formatDelta(pct)}
                <span className="text-gray-400">vs {comparison.label.toLowerCase()}</span>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Matrix / pivot ──────────────────────────────────────────────────────────

function PivotTable({ dimCols, metric, rows, summary, formatRules, onCellClick }) {
  const [d1, d2] = dimCols;

  const colVals = useMemo(() => [...new Set(rows.map((r) => r[d2.key]))], [rows, d2]);
  const rowVals = useMemo(() => [...new Set(rows.map((r) => r[d1.key]))], [rows, d1]);
  const cell = useMemo(() => {
    const m = {};
    for (const r of rows) m[`${r[d1.key]}|${r[d2.key]}`] = r[metric.key];
    return m;
  }, [rows, d1, d2, metric]);

  const subtotalFor = (rowVal) =>
    summary?.subtotals?.find((s) => String(s.value) === String(rowVal))?.values?.[metric.key];

  // Only a count or a sum may be added up across a column. An average, a min/max
  // or a derived measure summed down the column would produce a meaningless
  // number (a sum of averages), so it is left blank instead.
  const additive = !metric.agg || metric.agg === 'count' || metric.agg === 'sum';
  const colTotal = (colVal) => {
    if (!additive) return null;
    const vals = rowVals.map((rv) => cell[`${rv}|${colVal}`]).filter((v) => typeof v === 'number');
    return vals.length ? vals.reduce((a, b) => a + b, 0) : null;
  };
  const showTotals = !!summary;

  return (
    <div className="overflow-auto rounded-xl border border-gray-200 dark:border-white/10">
      <table className="min-w-full text-sm">
        <thead className="bg-gray-50 dark:bg-white/5">
          <tr>
            <th className="sticky left-0 z-10 bg-gray-50 px-3 py-2 text-left font-semibold text-gray-600 dark:bg-[#1c2128] dark:text-white/70">
              {d1.label} <span className="text-gray-300">/</span> {d2.label}
            </th>
            {colVals.map((c) => (
              <th key={c} className="whitespace-nowrap px-3 py-2 text-right font-semibold text-gray-600 dark:text-white/70">
                {formatValue(c, d2.type)}
              </th>
            ))}
            {showTotals && <th className="px-3 py-2 text-right font-semibold text-gray-900 dark:text-white">Total</th>}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100 dark:divide-white/5">
          {rowVals.map((rv) => (
            <tr key={rv} className="hover:bg-gray-50 dark:hover:bg-white/[0.03]">
              <td className="sticky left-0 z-10 bg-white px-3 py-2 font-medium text-gray-800 dark:bg-[#161b22] dark:text-white/80">
                {formatValue(rv, d1.type)}
              </td>
              {colVals.map((cv) => {
                const v = cell[`${rv}|${cv}`];
                return (
                  <td
                    key={cv}
                    onClick={onCellClick && v !== undefined ? () => onCellClick({ [d1.key]: rv, [d2.key]: cv }) : undefined}
                    className={clsx(
                      'px-3 py-2 text-right tabular-nums text-gray-700 dark:text-white/70',
                      onCellClick && v !== undefined && 'cursor-pointer',
                      cellFormatClass(formatRules, metric.key, v),
                    )}
                  >
                    {v !== undefined && v !== null ? formatValue(v, metric.type) : <span className="text-gray-300 dark:text-white/20">·</span>}
                  </td>
                );
              })}
              {showTotals && (
                <td className="bg-gray-50/60 px-3 py-2 text-right font-semibold tabular-nums text-gray-900 dark:bg-white/[0.04] dark:text-white">
                  {subtotalFor(rv) === undefined || subtotalFor(rv) === null ? '—' : formatValue(subtotalFor(rv), metric.type)}
                </td>
              )}
            </tr>
          ))}
        </tbody>
        {showTotals && (
          <tfoot>
            <tr className="border-t-2 border-gray-200 bg-gray-50 font-semibold dark:border-white/15 dark:bg-white/5">
              <td className="sticky left-0 z-10 bg-gray-50 px-3 py-2 text-gray-900 dark:bg-[#1c2128] dark:text-white">Total</td>
              {colVals.map((cv) => (
                <td key={cv} className="px-3 py-2 text-right tabular-nums text-gray-900 dark:text-white">
                  {colTotal(cv) === null ? '—' : formatValue(colTotal(cv), metric.type)}
                </td>
              ))}
              <td className="px-3 py-2 text-right tabular-nums text-gray-900 dark:text-white">
                {summary.grand?.[metric.key] === null || summary.grand?.[metric.key] === undefined
                  ? '—'
                  : formatValue(summary.grand[metric.key], metric.type)}
              </td>
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}
