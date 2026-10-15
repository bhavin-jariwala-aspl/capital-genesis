import { useId } from 'react';
import { createContext, useContext } from 'react';
import {
  BarChart, Bar, LineChart, Line, AreaChart, Area,
  PieChart, Pie, Cell, ScatterChart, Scatter,
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  RadialBarChart, RadialBar, Treemap, ComposedChart,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  FunnelChart, Funnel, LabelList, ReferenceLine, Label,
} from 'recharts';
import ReactApexChart from 'react-apexcharts';
import Spinner from '../ui/Spinner';
import { useThemeStore } from '../../store/themeStore';
import { useAppearanceStore } from '../../store/appearanceStore';
import { useCurrencyStore } from '../../store/currencyStore';
import { useDataSourceRows } from '../../hooks/useDataSource';
import { chartSeries as tenantChartSeries, CHART_PALETTES } from '../../utils/appearance';
import { resolveChartAppearance, applySeriesTransforms, makeValueFormatter } from '../../utils/chart';

/**
 * Per-widget appearance (config.appearance) flows to every sub-chart through
 * this context so the leaf components keep their small prop surface.
 */
const AppearanceCtx = createContext({ a: resolveChartAppearance({}), fmt: (v) => v, series: null });

/* ────────────────────────────────────────────────────────────────────────────
 * Chic chart system
 *
 * A single validated categorical palette (colourblind-safe, run through the
 * data-viz validator in both light and dark), plus recessive chrome tokens and
 * a glassy tooltip / pill legend. Every chart is drawn with soft gradient fills,
 * rounded data-ends, hairline horizontal-only grids and hidden axis spines so
 * the whole dashboard reads as one modern system rather than default recharts.
 * ──────────────────────────────────────────────────────────────────────────── */

// Categorical series palette — validated (CVD-safe) for each surface.
/**
 * Y-axis width that fits its widest tick label. A fixed width clipped longer
 * currency labels ("MUR 28M") — the axis is sized from the largest value the
 * chart plots, formatted the way the axis will show it.
 */
function axisWidth(data, fmt, extra = 0) {
  let max = 0;
  for (const row of data ?? []) {
    for (const v of Object.values(row ?? {})) {
      if (typeof v === 'boolean' || v === '' || v === null) continue;
      const n = Number(v);
      if (Number.isFinite(n) && Math.abs(n) > max) max = Math.abs(n);
    }
  }
  const label = String(fmt ? fmt(max) : max);
  return Math.min(120, Math.max(40, Math.round(label.length * 6.8) + 16)) + extra;
}

const SERIES_LIGHT = ['#6366f1', '#14b8a6', '#f59e0b', '#a855f7', '#22c55e', '#ef4444', '#0ea5e9', '#f97316'];
const SERIES_DARK  = ['#6366f1', '#0d9488', '#d97706', '#9333ea', '#16a34a', '#dc2626', '#0284c7', '#ea580c'];

// Fixed status colours (waterfall +/-) — never themed.
const POS = '#0ca30c';
const NEG = '#d03b3b';

/** Read an "r g b" appearance token from <html> as a CSS colour (falls back when unset). */
function token(name, fallback) {
  if (typeof document === 'undefined') return fallback;
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v ? `rgb(${v})` : fallback;
}

function useChartTheme() {
  const isDark = useThemeStore(s => s.isDark);
  const tenant = useAppearanceStore(s => s.current);
  const { a, series: override } = useContext(AppearanceCtx);
  // Series colours: explicit per-widget colours → widget palette → tenant palette → built-in.
  let series;
  if (override?.length) series = override;
  else if (a.palette && a.palette !== 'tenant') {
    series = a.palette === 'brand'
      ? tenantChartSeries({ ...tenant, 'appearance.chart_palette': 'brand' }, isDark)
      : (CHART_PALETTES[a.palette] ?? CHART_PALETTES.vivid)[isDark ? 'dark' : 'light'];
  } else {
    series = tenant ? tenantChartSeries(tenant, isDark) : (isDark ? SERIES_DARK : SERIES_LIGHT);
  }
  if (a.colors?.length) series = [...a.colors, ...series.filter((c) => !a.colors.includes(c))];
  return {
    isDark,
    series,
    // Axes and surfaces follow the tenant's neutral tone and dark-surface stack.
    grid:   isDark ? token('--s-3', '#272640') : token('--n-200', '#eceef2'),
    tick:   token('--n-400', isDark ? '#8b8aa0' : '#94a3b8'),
    text:   isDark ? token('--n-100', '#e8e8f2') : token('--n-900', '#0f172a'),
    surface: isDark ? token('--s-2', '#131224') : '#ffffff',
    a,
  };
}

/** Value formatter honouring the widget's number format. */
function useFmt() {
  return useContext(AppearanceCtx).fmt;
}

/** Axis titles + goal line + grid toggle, shared by the cartesian charts. */
function useCartesianDecor() {
  const { a, grid, tick } = useChartTheme();
  const fmt = useFmt();
  const showLegend = (defaultShow) => a.legend === 'hidden' ? false : a.legend === 'auto' ? defaultShow : true;
  const legendProps = a.legend === 'top' ? { verticalAlign: 'top', wrapperStyle: { paddingBottom: 8 } } : {};
  const gridEl = a.showGrid === false ? null : <CartesianGrid vertical={false} stroke={grid} strokeDasharray="4 4" />;
  const xLabel = a.xLabel ? { value: a.xLabel, position: 'insideBottom', offset: -2, fontSize: 11, fill: tick } : undefined;
  const yLabel = a.yLabel ? { value: a.yLabel, angle: -90, position: 'insideLeft', fontSize: 11, fill: tick } : undefined;
  const goalEl = a.goal !== null
    ? <ReferenceLine y={a.goal} stroke="#f59e0b" strokeDasharray="6 4" strokeWidth={1.5}><Label value={`${a.goalLabel || 'Goal'} ${fmt(a.goal)}`} position="insideTopRight" fontSize={10} fill="#d97706" /></ReferenceLine>
    : null;
  const margin = { top: 10, right: 12, left: a.yLabel ? 4 : -12, bottom: a.xLabel ? 14 : 0 };
  return { a, fmt, showLegend, legendProps, gridEl, xLabel, yLabel, goalEl, margin, lineType: a.smooth === false ? 'linear' : 'monotone' };
}

/* ─── Glass tooltip ──────────────────────────────────────────────────────── */
function ChicTooltip({ active, payload, label }) {
  const { isDark } = useChartTheme();
  const fmt = useFmt();
  if (!active || !payload?.length) return null;
  const rows = payload.filter(p => p.value != null && p.dataKey !== 'base' && p.name !== 'base');
  if (!rows.length) return null;
  return (
    <div
      style={{
        background: isDark ? 'rgba(19,18,36,0.9)' : 'rgba(255,255,255,0.9)',
        backdropFilter: 'blur(10px)',
        WebkitBackdropFilter: 'blur(10px)',
        border: `1px solid ${isDark ? 'rgba(255,255,255,0.1)' : 'rgba(15,23,42,0.08)'}`,
        borderRadius: 14,
        boxShadow: '0 12px 32px -8px rgba(0,0,0,0.3)',
        padding: '10px 12px',
        fontSize: 12,
        color: isDark ? '#e8e8f2' : '#0f172a',
        minWidth: 128,
      }}
    >
      {label != null && label !== '' && (
        <div style={{ fontWeight: 600, fontSize: 10.5, letterSpacing: 0.5, textTransform: 'uppercase', opacity: 0.55, marginBottom: 7 }}>
          {label}
        </div>
      )}
      {rows.map((p, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '2px 0' }}>
          <span style={{ width: 10, height: 10, borderRadius: 3, background: p.color || p.payload?.fill || p.payload?.__fill, flexShrink: 0 }} />
          <span style={{ flex: 1, opacity: 0.75 }}>{p.name}</span>
          <span style={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{fmt(p.value)}</span>
        </div>
      ))}
    </div>
  );
}

/* ─── Pill legend (recharts payload) ─────────────────────────────────────── */
function ChicLegend({ payload }) {
  const { tick } = useChartTheme();
  if (!payload?.length) return null;
  return (
    <ul style={{ display: 'flex', flexWrap: 'wrap', gap: '5px 14px', justifyContent: 'center', listStyle: 'none', margin: 0, padding: '10px 0 0' }}>
      {payload.map((e, i) => (
        <li key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5, color: tick }}>
          <span style={{ width: 9, height: 9, borderRadius: '50%', background: e.color }} />
          <span>{e.value}</span>
        </li>
      ))}
    </ul>
  );
}

/* ─── Static swatch legend (built from data, for radial) ─────────────────── */
function SwatchLegend({ items }) {
  const { tick } = useChartTheme();
  return (
    <ul style={{ display: 'flex', flexWrap: 'wrap', gap: '5px 14px', justifyContent: 'center', listStyle: 'none', margin: 0, padding: '8px 0 0' }}>
      {items.map((it, i) => (
        <li key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5, color: tick }}>
          <span style={{ width: 9, height: 9, borderRadius: '50%', background: it.color }} />
          <span>{it.name}</span>
        </li>
      ))}
    </ul>
  );
}

const AXIS = { tickLine: false, axisLine: false };

// ---- Recharts-based charts ----

function ReBarChart({ data, xKey = 'name', yKey = 'value', barDefs = [], stacked: stackedProp }) {
  const { series, tick, isDark } = useChartTheme();
  const { a, fmt, showLegend, legendProps, gridEl, xLabel, yLabel, goalEl, margin } = useCartesianDecor();
  const stacked = a.stacked ?? stackedProp;
  const yKeys = Array.isArray(yKey) ? yKey : [yKey];
  const gid = useId().replace(/[:]/g, '');
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} margin={margin} barCategoryGap="24%">
        <defs>
          {yKeys.map((k, i) => {
            const c = barDefs[i]?.fill || series[i % series.length];
            return (
              <linearGradient key={k} id={`${gid}-b${i}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={c} stopOpacity={0.95} />
                <stop offset="100%" stopColor={c} stopOpacity={0.55} />
              </linearGradient>
            );
          })}
        </defs>
        {gridEl}
        <XAxis dataKey={xKey} tick={{ fontSize: 11, fill: tick }} {...AXIS} dy={6} label={xLabel} />
        <YAxis tick={{ fontSize: 11, fill: tick }} {...AXIS} width={axisWidth(data, fmt, a.yLabel ? 16 : 0)} tickFormatter={fmt} label={yLabel} />
        <Tooltip content={<ChicTooltip />} cursor={{ fill: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(15,23,42,0.03)' }} />
        {showLegend(yKeys.length > 1) && <Legend content={<ChicLegend />} {...legendProps} />}
        {goalEl}
        {yKeys.map((k, i) => (
          <Bar
            key={k}
            dataKey={k}
            fill={`url(#${gid}-b${i})`}
            name={barDefs[i]?.name || k}
            stackId={stacked ? 'a' : undefined}
            radius={stacked ? (i === yKeys.length - 1 ? [6, 6, 0, 0] : [0, 0, 0, 0]) : [6, 6, 0, 0]}
            maxBarSize={48}
          >
            {a.dataLabels && <LabelList dataKey={k} position="top" formatter={fmt} fontSize={10} fill={tick} />}
          </Bar>
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}

function ReLineChart({ data, xKey = 'name', yKey = 'value', lineDefs = [] }) {
  const { series, tick, surface } = useChartTheme();
  const { a, fmt, showLegend, legendProps, gridEl, xLabel, yLabel, goalEl, margin, lineType } = useCartesianDecor();
  const yKeys = Array.isArray(yKey) ? yKey : [yKey];
  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={data} margin={margin}>
        {gridEl}
        <XAxis dataKey={xKey} tick={{ fontSize: 11, fill: tick }} {...AXIS} dy={6} label={xLabel} />
        <YAxis tick={{ fontSize: 11, fill: tick }} {...AXIS} width={axisWidth(data, fmt, a.yLabel ? 16 : 0)} tickFormatter={fmt} label={yLabel} />
        <Tooltip content={<ChicTooltip />} cursor={{ stroke: tick, strokeDasharray: '4 4', strokeOpacity: 0.5 }} />
        {showLegend(yKeys.length > 1) && <Legend content={<ChicLegend />} {...legendProps} />}
        {goalEl}
        {yKeys.map((k, i) => {
          const c = lineDefs[i]?.stroke || series[i % series.length];
          return (
            <Line
              key={k}
              type={lineType}
              dataKey={k}
              stroke={c}
              name={lineDefs[i]?.name || k}
              strokeWidth={2.5}
              dot={a.dataLabels ? { r: 3, strokeWidth: 0, fill: c } : false}
              activeDot={{ r: 5, strokeWidth: 2, stroke: surface }}
            >
              {a.dataLabels && <LabelList dataKey={k} position="top" formatter={fmt} fontSize={10} fill={tick} />}
            </Line>
          );
        })}
      </LineChart>
    </ResponsiveContainer>
  );
}

function ReAreaChart({ data, xKey = 'name', yKey = 'value', stacked: stackedProp }) {
  const { series, tick, surface } = useChartTheme();
  const { a, fmt, showLegend, legendProps, gridEl, xLabel, yLabel, goalEl, margin, lineType } = useCartesianDecor();
  const stacked = a.stacked ?? stackedProp;
  const yKeys = Array.isArray(yKey) ? yKey : [yKey];
  const gid = useId().replace(/[:]/g, '');
  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={data} margin={margin}>
        <defs>
          {yKeys.map((k, i) => {
            const c = series[i % series.length];
            return (
              <linearGradient key={k} id={`${gid}-a${i}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={c} stopOpacity={0.38} />
                <stop offset="95%" stopColor={c} stopOpacity={0.02} />
              </linearGradient>
            );
          })}
        </defs>
        {gridEl}
        <XAxis dataKey={xKey} tick={{ fontSize: 11, fill: tick }} {...AXIS} dy={6} label={xLabel} />
        <YAxis tick={{ fontSize: 11, fill: tick }} {...AXIS} width={axisWidth(data, fmt, a.yLabel ? 16 : 0)} tickFormatter={fmt} label={yLabel} />
        <Tooltip content={<ChicTooltip />} cursor={{ stroke: tick, strokeDasharray: '4 4', strokeOpacity: 0.5 }} />
        {showLegend(yKeys.length > 1) && <Legend content={<ChicLegend />} {...legendProps} />}
        {goalEl}
        {yKeys.map((k, i) => {
          const c = series[i % series.length];
          return (
            <Area
              key={k}
              type={lineType}
              dataKey={k}
              stroke={c}
              strokeWidth={2.5}
              fill={`url(#${gid}-a${i})`}
              stackId={stacked ? 'a' : undefined}
              activeDot={{ r: 5, strokeWidth: 2, stroke: surface }}
            />
          );
        })}
      </AreaChart>
    </ResponsiveContainer>
  );
}

function RePieChart({ data, nameKey = 'name', valueKey = 'value', donut }) {
  const { series, text, a, tick } = useChartTheme();
  const fmt = useFmt();
  const total = data.reduce((s, d) => s + (Number(d[valueKey]) || 0), 0);
  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            dataKey={valueKey}
            nameKey={nameKey}
            cx="50%"
            cy="50%"
            innerRadius={donut ? '64%' : '0%'}
            outerRadius="88%"
            paddingAngle={donut ? 3 : 1.5}
            cornerRadius={donut ? 6 : 3}
            stroke="none"
          >
            {data.map((_, i) => (
              <Cell key={i} fill={series[i % series.length]} />
            ))}
            {a.dataLabels && <LabelList dataKey={valueKey} position="outside" formatter={fmt} fontSize={10} fill={tick} stroke="none" />}
          </Pie>
          <Tooltip content={<ChicTooltip />} />
          {a.legend !== 'hidden' && <Legend content={<ChicLegend />} {...(a.legend === 'top' ? { verticalAlign: 'top' } : {})} />}
        </PieChart>
      </ResponsiveContainer>
      {donut && (
        <div
          style={{
            position: 'absolute', top: '43%', left: 0, right: 0,
            transform: 'translateY(-50%)', textAlign: 'center', pointerEvents: 'none',
          }}
        >
          <div style={{ fontSize: 24, fontWeight: 700, color: text, lineHeight: 1.1, fontVariantNumeric: 'tabular-nums' }}>{fmt(total)}</div>
          <div style={{ fontSize: 10.5, letterSpacing: 0.6, textTransform: 'uppercase', opacity: 0.5, color: text }}>Total</div>
        </div>
      )}
    </div>
  );
}

function ReScatterChart({ data, xKey = 'x', yKey = 'y' }) {
  const { series, grid, tick } = useChartTheme();
  return (
    <ResponsiveContainer width="100%" height="100%">
      <ScatterChart margin={{ top: 10, right: 10, left: -12, bottom: 0 }}>
        <CartesianGrid stroke={grid} strokeDasharray="4 4" />
        <XAxis dataKey={xKey} type="number" tick={{ fontSize: 11, fill: tick }} {...AXIS} />
        <YAxis dataKey={yKey} type="number" tick={{ fontSize: 11, fill: tick }} {...AXIS} width={48} />
        <Tooltip cursor={{ strokeDasharray: '4 4', stroke: tick, strokeOpacity: 0.5 }} content={<ChicTooltip />} />
        <Scatter data={data} fill={series[0]} fillOpacity={0.75} />
      </ScatterChart>
    </ResponsiveContainer>
  );
}

function ReRadarChart({ data, angleKey = 'subject', valueKey = 'value' }) {
  const { series, grid, tick } = useChartTheme();
  const gid = useId().replace(/[:]/g, '');
  const c = series[0];
  return (
    <ResponsiveContainer width="100%" height="100%">
      <RadarChart data={data}>
        <defs>
          <radialGradient id={`${gid}-r`}>
            <stop offset="0%" stopColor={c} stopOpacity={0.5} />
            <stop offset="100%" stopColor={c} stopOpacity={0.15} />
          </radialGradient>
        </defs>
        <PolarGrid stroke={grid} />
        <PolarAngleAxis dataKey={angleKey} tick={{ fontSize: 11, fill: tick }} />
        <PolarRadiusAxis tick={{ fontSize: 10, fill: tick }} axisLine={false} />
        <Radar dataKey={valueKey} stroke={c} strokeWidth={2} fill={`url(#${gid}-r)`} />
        <Tooltip content={<ChicTooltip />} />
      </RadarChart>
    </ResponsiveContainer>
  );
}

function ReRadialBarChart({ data, valueKey = 'value', nameKey = 'name' }) {
  const { series, isDark } = useChartTheme();
  const rows = data.map((d, i) => ({ ...d, __fill: series[i % series.length] }));
  const max = Math.max(...rows.map(d => Number(d[valueKey]) || 0), 0);
  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ flex: 1, minHeight: 0 }}>
        <ResponsiveContainer width="100%" height="100%">
          <RadialBarChart innerRadius="28%" outerRadius="100%" data={rows} startAngle={90} endAngle={-270}>
            <PolarAngleAxis type="number" domain={[0, max || 1]} tick={false} />
            <RadialBar
              dataKey={valueKey}
              cornerRadius={9}
              background={{ fill: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(15,23,42,0.04)' }}
            >
              {rows.map((d, i) => (
                <Cell key={i} fill={d.__fill} />
              ))}
            </RadialBar>
            <Tooltip content={<ChicTooltip />} />
          </RadialBarChart>
        </ResponsiveContainer>
      </div>
      <SwatchLegend items={rows.map(d => ({ name: d[nameKey], color: d.__fill }))} />
    </div>
  );
}

function ReTreemap({ data, valueKey = 'value', nameKey = 'name' }) {
  const { series, surface } = useChartTheme();
  const rows = data.map((d, i) => ({ ...d, fill: series[i % series.length] }));
  return (
    <ResponsiveContainer width="100%" height="100%">
      <Treemap
        data={rows}
        dataKey={valueKey}
        nameKey={nameKey}
        aspectRatio={4 / 3}
        stroke={surface}
        strokeWidth={3}
        isAnimationActive={false}
        content={<TreemapCell />}
      >
        <Tooltip content={<ChicTooltip />} />
      </Treemap>
    </ResponsiveContainer>
  );
}

function TreemapCell({ x, y, width, height, name, fill }) {
  if (width == null) return null;
  return (
    <g>
      <rect x={x} y={y} width={width} height={height} rx={8} ry={8} fill={fill} />
      {width > 60 && height > 26 && (
        <text x={x + 10} y={y + 22} fill="#fff" fontSize={12} fontWeight={600} style={{ pointerEvents: 'none' }}>
          {name}
        </text>
      )}
    </g>
  );
}

function ReFunnelChart({ data, valueKey = 'value', nameKey = 'name' }) {
  const { series } = useChartTheme();
  return (
    <ResponsiveContainer width="100%" height="100%">
      <FunnelChart>
        <Tooltip content={<ChicTooltip />} />
        <Funnel dataKey={valueKey} nameKey={nameKey} data={data} isAnimationActive stroke="none">
          {data.map((_, i) => (
            <Cell key={i} fill={series[i % series.length]} />
          ))}
          <LabelList position="right" fill="currentColor" stroke="none" dataKey={nameKey} className="text-gray-600 dark:text-white/70" fontSize={12} />
          <LabelList position="center" fill="#fff" stroke="none" dataKey={valueKey} fontSize={13} fontWeight={700} />
        </Funnel>
      </FunnelChart>
    </ResponsiveContainer>
  );
}

function ReComposedChart({ data, xKey = 'name', barKey = 'bar', lineKey = 'line' }) {
  const { series, tick, surface } = useChartTheme();
  const { a, fmt, showLegend, legendProps, gridEl, xLabel, yLabel, goalEl, margin, lineType } = useCartesianDecor();
  const gid = useId().replace(/[:]/g, '');
  return (
    <ResponsiveContainer width="100%" height="100%">
      <ComposedChart data={data} margin={margin}>
        <defs>
          <linearGradient id={`${gid}-c`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={series[0]} stopOpacity={0.95} />
            <stop offset="100%" stopColor={series[0]} stopOpacity={0.55} />
          </linearGradient>
        </defs>
        {gridEl}
        <XAxis dataKey={xKey} tick={{ fontSize: 11, fill: tick }} {...AXIS} dy={6} label={xLabel} />
        <YAxis tick={{ fontSize: 11, fill: tick }} {...AXIS} width={axisWidth(data, fmt, a.yLabel ? 16 : 0)} tickFormatter={fmt} label={yLabel} />
        <Tooltip content={<ChicTooltip />} cursor={{ fill: 'rgba(148,163,184,0.08)' }} />
        {showLegend(true) && <Legend content={<ChicLegend />} {...legendProps} />}
        {goalEl}
        <Bar dataKey={barKey} fill={`url(#${gid}-c)`} radius={[6, 6, 0, 0]} maxBarSize={48} />
        <Line type={lineType} dataKey={lineKey} stroke={series[3]} strokeWidth={2.5} dot={false} activeDot={{ r: 5, strokeWidth: 2, stroke: surface }} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

function ReWaterfallChart({ data, xKey = 'name', valueKey = 'value' }) {
  // Waterfall via bar chart with invisible base bars
  const processed = [];
  let running = 0;
  for (const row of data) {
    const val = Number(row[valueKey]) || 0;
    processed.push({ ...row, base: val >= 0 ? running : running + val, abs: Math.abs(val), positive: val >= 0 });
    running += val;
  }
  const { grid, tick } = useChartTheme();
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={processed} margin={{ top: 10, right: 8, left: -12, bottom: 0 }}>
        <CartesianGrid vertical={false} stroke={grid} strokeDasharray="4 4" />
        <XAxis dataKey={xKey} tick={{ fontSize: 11, fill: tick }} {...AXIS} dy={6} />
        <YAxis tick={{ fontSize: 11, fill: tick }} {...AXIS} width={48} />
        <Tooltip content={<ChicTooltip />} cursor={{ fill: 'rgba(148,163,184,0.08)' }} />
        <Bar dataKey="base" fill="transparent" stackId="wf" />
        <Bar dataKey="abs" stackId="wf" radius={[4, 4, 0, 0]} maxBarSize={48}>
          {processed.map((entry, i) => (
            <Cell key={i} fill={entry.positive ? POS : NEG} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

// ---- ApexCharts-based charts ----

function ApexChart({ type, data, xKey = 'name', yKey = 'value' }) {
  const { series: palette, isDark } = useChartTheme();
  const categories = data.map(d => d[xKey] ?? '');
  const seriesData = data.map(d => d[yKey] ?? 0);

  const options = {
    chart: { type, toolbar: { show: false }, animations: { enabled: false }, background: 'transparent', fontFamily: 'inherit' },
    theme: { mode: isDark ? 'dark' : 'light' },
    xaxis: { categories, axisBorder: { show: false }, axisTicks: { show: false } },
    grid: { borderColor: isDark ? '#272640' : '#eceef2', strokeDashArray: 4 },
    colors: palette,
    plotOptions: { heatmap: { radius: 6, enableShades: true } },
    stroke: { width: 0 },
    dataLabels: { enabled: false },
    legend: { show: true, markers: { radius: 12 } },
    tooltip: { theme: isDark ? 'dark' : 'light' },
  };

  const series = [{ name: yKey, data: seriesData }];

  return (
    <ReactApexChart
      options={options}
      series={type === 'heatmap' ? buildHeatmapSeries(data, xKey) : series}
      type={type}
      width="100%"
      height="100%"
    />
  );
}

function buildHeatmapSeries(data, xKey) {
  // Group by a "series" key if present, else single series
  const grouped = {};
  for (const row of data) {
    const s = row.series ?? 'Value';
    if (!grouped[s]) grouped[s] = [];
    grouped[s].push({ x: row[xKey], y: row.value ?? 0 });
  }
  return Object.entries(grouped).map(([name, d]) => ({ name, data: d }));
}

function GaugeChart({ data, valueKey = 'value' }) {
  const value = data[0]?.[valueKey] ?? 0;
  const { series, isDark } = useChartTheme();
  const options = {
    chart: { type: 'radialBar', toolbar: { show: false }, background: 'transparent', fontFamily: 'inherit' },
    theme: { mode: isDark ? 'dark' : 'light' },
    plotOptions: {
      radialBar: {
        startAngle: -135,
        endAngle: 135,
        hollow: { size: '62%' },
        track: { background: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(15,23,42,0.05)', strokeWidth: '100%' },
        dataLabels: {
          name: { fontSize: '13px', offsetY: 22, color: isDark ? '#8b8aa0' : '#94a3b8' },
          value: { offsetY: -18, fontSize: '26px', fontWeight: 700, color: isDark ? '#e8e8f2' : '#0f172a', formatter: v => `${v}%` },
        },
      },
    },
    fill: {
      type: 'gradient',
      gradient: { shade: 'light', type: 'horizontal', shadeIntensity: 0.4, gradientToColors: [series[3]], stops: [0, 100] },
    },
    stroke: { lineCap: 'round' },
    labels: ['Progress'],
    colors: [series[0]],
  };
  return (
    <ReactApexChart options={options} series={[Math.min(100, Math.max(0, value))]} type="radialBar" width="100%" height="100%" />
  );
}

function CandlestickChart({ data }) {
  const series = [{
    data: data.map(d => ({
      x: d.x ?? d.date ?? d.name,
      y: [d.open ?? 0, d.high ?? 0, d.low ?? 0, d.close ?? 0],
    })),
  }];
  const { isDark } = useChartTheme();
  const options = {
    chart: { type: 'candlestick', toolbar: { show: false }, background: 'transparent', fontFamily: 'inherit' },
    theme: { mode: isDark ? 'dark' : 'light' },
    grid: { borderColor: isDark ? '#272640' : '#eceef2', strokeDashArray: 4 },
    xaxis: { type: 'category', axisBorder: { show: false }, axisTicks: { show: false } },
    yaxis: { tooltip: { enabled: true } },
    plotOptions: { candlestick: { colors: { upward: '#0ca30c', downward: '#d03b3b' } } },
  };
  return <ReactApexChart options={options} series={series} type="candlestick" width="100%" height="100%" />;
}

function BubbleChart({ data, xKey = 'x', yKey = 'y', rKey = 'r' }) {
  const series = [{ name: 'Bubble', data: data.map(d => [d[xKey] ?? 0, d[yKey] ?? 0, d[rKey] ?? 10]) }];
  const { series: palette, isDark } = useChartTheme();
  const options = {
    chart: { type: 'bubble', toolbar: { show: false }, background: 'transparent', fontFamily: 'inherit' },
    theme: { mode: isDark ? 'dark' : 'light' },
    fill: { opacity: 0.7 },
    grid: { borderColor: isDark ? '#272640' : '#eceef2', strokeDashArray: 4 },
    colors: palette,
    dataLabels: { enabled: false },
    xaxis: { tickAmount: 6, axisBorder: { show: false }, axisTicks: { show: false } },
    yaxis: { max: Math.max(...data.map(d => d[yKey] ?? 0)) * 1.2 },
  };
  return <ReactApexChart options={options} series={series} type="bubble" width="100%" height="100%" />;
}

function TimelineChart({ data }) {
  const grouped = {};
  for (const row of data) {
    const s = row.series ?? row.name ?? 'Task';
    if (!grouped[s]) grouped[s] = [];
    grouped[s].push({ x: row.task ?? s, y: [new Date(row.start).getTime(), new Date(row.end).getTime()] });
  }
  const series = Object.entries(grouped).map(([name, d]) => ({ name, data: d }));
  const { series: palette, isDark } = useChartTheme();
  const options = {
    chart: { type: 'rangeBar', toolbar: { show: false }, background: 'transparent', fontFamily: 'inherit' },
    theme: { mode: isDark ? 'dark' : 'light' },
    plotOptions: { bar: { horizontal: true, borderRadius: 6, rangeBarGroupRows: true } },
    grid: { borderColor: isDark ? '#272640' : '#eceef2', strokeDashArray: 4 },
    xaxis: { type: 'datetime', axisBorder: { show: false }, axisTicks: { show: false } },
    fill: { type: 'solid', opacity: 0.85 },
    legend: { position: 'top', markers: { radius: 12 } },
    colors: palette,
  };
  return <ReactApexChart options={options} series={series} type="rangeBar" width="100%" height="100%" />;
}

// ---- Main ChartRenderer ----

export default function ChartRenderer({ chart }) {
  const { data, meta, loading, error } = useDataSourceRows(chart?.data_source);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Spinner size="lg" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-full text-red-500 text-sm">
        Error: {error}
      </div>
    );
  }

  if (!data.length) {
    return (
      <div className="flex items-center justify-center h-full text-gray-400 text-sm">
        No data available
      </div>
    );
  }

  const cfg = chart?.config || {};
  return <ChartBody chart={chart} cfg={cfg} rawData={data} meta={meta} />;
}

function ChartBody({ chart, cfg, rawData, meta }) {
  const tenantCurrency = useCurrencyStore((s) => s.code);
  const a = resolveChartAppearance(cfg);
  const fmt = makeValueFormatter({ ...a, currency: a.currency || tenantCurrency || 'USD' });
  // A report-backed widget describes its own axes in the result metadata, so it
  // takes precedence: the widget never stores a field name that could go stale.
  const reportSeries = meta?.series?.length ? meta.series.map((s) => s.key) : null;
  const xKey = meta?.xKey || cfg.xAxisKey || 'name';
  const yAxisKey = reportSeries ?? cfg.yAxisKey ?? cfg.dataKey ?? 'value';
  // A dataset may declare several series (e.g. ['claimed', 'paid']); single-value
  // consumers (pie, gauge, treemap…) always take the first one.
  const baseYKey = Array.isArray(yAxisKey) ? (yAxisKey[0] ?? 'value') : yAxisKey;
  const chartType = chart?.chart_type;

  // Resolve the series data-key(s) from bar/line definitions when present so that
  // any cartesian chart type (bar/line/area) reads the right column regardless of
  // how the widget was originally authored.
  const seriesKeys = reportSeries
    ?? (cfg.bars?.length
      ? cfg.bars.map(b => b.dataKey)
      : cfg.lines?.length
        ? cfg.lines.map(l => l.dataKey)
        : Array.isArray(yAxisKey) ? yAxisKey : [yAxisKey]);

  // Sort / top-N are presentation choices, applied after the data arrives.
  const data = applySeriesTransforms(rawData, a, xKey, seriesKeys);

  return (
    <AppearanceCtx.Provider value={{ a, fmt, series: a.colors?.length ? a.colors : null }}>
      {renderChart()}
    </AppearanceCtx.Provider>
  );

  function renderChart() {
  switch (chartType) {
    case 'bar':
      return <ReBarChart data={data} xKey={xKey} yKey={seriesKeys} barDefs={cfg.bars || []} />;
    case 'bar_stacked':
      return <ReBarChart data={data} xKey={xKey} yKey={seriesKeys} barDefs={cfg.bars || []} stacked />;
    case 'line':
      return <ReLineChart data={data} xKey={xKey} yKey={seriesKeys} lineDefs={cfg.lines || []} />;
    case 'area':
      return <ReAreaChart data={data} xKey={xKey} yKey={seriesKeys} />;
    case 'area_stacked':
      return <ReAreaChart data={data} xKey={xKey} yKey={seriesKeys} stacked />;
    case 'pie':
      return <RePieChart data={data} nameKey={xKey} valueKey={baseYKey} />;
    case 'donut':
      return <RePieChart data={data} nameKey={xKey} valueKey={baseYKey} donut />;
    case 'scatter':
      return <ReScatterChart data={data} xKey={cfg.xAxisKey || 'x'} yKey={cfg.yAxisKey || 'y'} />;
    case 'radar':
      return <ReRadarChart data={data} angleKey={xKey} valueKey={baseYKey} />;
    case 'radial_bar':
      return <ReRadialBarChart data={data} valueKey={baseYKey} nameKey={xKey} />;
    case 'treemap':
      return <ReTreemap data={data} valueKey={baseYKey} nameKey={xKey} />;
    case 'funnel':
      return <ReFunnelChart data={data} valueKey={baseYKey} nameKey={xKey} />;
    case 'composed':
      // Fall back to the declared series keys — the first is drawn as bars, the
      // second as the overlaid line — so a composed chart works without the
      // explicit barKey/lineKey pair.
      return (
        <ReComposedChart
          data={data}
          xKey={xKey}
          barKey={cfg.barKey || seriesKeys[0] || 'bar'}
          lineKey={cfg.lineKey || seriesKeys[1] || 'line'}
        />
      );
    case 'waterfall':
      return <ReWaterfallChart data={data} xKey={xKey} valueKey={baseYKey} />;
    case 'heatmap':
      return <ApexChart type="heatmap" data={data} xKey={xKey} yKey={baseYKey} />;
    case 'candlestick':
      return <CandlestickChart data={data} />;
    case 'gauge':
      return <GaugeChart data={data} valueKey={baseYKey} />;
    case 'bubble':
      return <BubbleChart data={data} xKey={cfg.xAxisKey || 'x'} yKey={cfg.yAxisKey || 'y'} rKey={cfg.rKey || 'r'} />;
    case 'timeline':
      return <TimelineChart data={data} />;
    default:
      return <ReBarChart data={data} xKey={xKey} yKey={seriesKeys} barDefs={cfg.bars || []} />;
  }
  }
}
