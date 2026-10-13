import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Settings, Database, Zap, FileBarChart, ExternalLink, Info } from 'lucide-react';
import clsx from 'clsx';
import Input from '../ui/Input';
import Select from '../ui/Select';
import Spinner from '../ui/Spinner';
import TextArea from '../ui/TextArea';
import ObjectPicker from '../ui/ObjectPicker';
import { useBuilderStore } from '../../store/builderStore';
import { CHART_TYPES } from '../../utils/constants';
import { analyticsService } from '../../services/analytics.service';
import { reportService } from '../../services/report.service';
import { useDataSource } from '../../hooks/useDataSource';
import {
  shapeForWidgetType, widgetUpdatesForDataset, widgetUpdatesForReport, widgetTypeForReport,
} from '../../utils/dashboard';
import { resolveChartAppearance, appearanceCapabilities, NUMBER_FORMATS } from '../../utils/chart';
import { CHART_PALETTES } from '../../utils/appearance';

const TABS = [
  { id: 'config', label: 'Appearance', icon: Settings },
  { id: 'data',   label: 'Data',       icon: Database },
];

/**
 * WidgetConfigPanel — right panel of the Dashboard Builder.
 *
 * A widget gets its numbers from one of two places, both of which a business user
 * can pick from a list:
 *
 *   1. A saved report — the self-service path. Anything buildable in the report
 *      builder can be placed on a dashboard, and the widget stores only the report
 *      id, so the dashboard follows the report as it is refined.
 *   2. A built-in dataset — the pre-computed metrics that ship with Genesis.
 *
 * The old "External REST API" and "Static JSON" modes are gone. They required a
 * URL, hand-written auth headers and dot-notation paths — knowledge no business
 * user has — and the external mode let a dashboard author aim the browser at an
 * arbitrary host. Widgets that still carry a static payload keep rendering; the
 * panel just shows what they hold and offers to move them onto a report.
 */
export default function WidgetConfigPanel() {
  const { dashboardWidgets, selectedWidgetId, updateWidget } = useBuilderStore();
  const [activeTab, setActiveTab] = useState('config');

  const widget = selectedWidgetId !== null
    ? dashboardWidgets.find((w) => (w._tempId ?? w.id) === selectedWidgetId)
    : null;

  if (!widget) {
    return (
      <div className="flex w-72 shrink-0 items-center justify-center border-l border-gray-200 bg-white p-8 dark:border-white/[0.07] dark:bg-night-1">
        <div className="text-center text-gray-400 dark:text-white/30">
          <Settings className="mx-auto mb-2 h-8 w-8 opacity-40" />
          <p className="text-sm">Select a widget to configure</p>
        </div>
      </div>
    );
  }

  const id = widget._tempId ?? widget.id;
  const effectiveDs = widget.data_source ?? widget.chart?.data_source ?? { type: 'report' };
  const dsType = effectiveDs?.type || 'report';

  const update = (updates) => updateWidget(id, updates);
  const updateConfig = (configUpdates) => update({ config: { ...widget.config, ...configUpdates } });

  // A report-backed widget derives its axes at render time, so the manual
  // axis-key inputs are neither needed nor shown for it.
  const isReportBacked = dsType === 'report';

  return (
    <div className="flex w-72 shrink-0 flex-col overflow-hidden border-l border-gray-200 bg-white dark:border-white/[0.07] dark:bg-night-1">
      <div className="border-b border-gray-100 px-4 py-3 dark:border-white/[0.07]">
        <p className="truncate text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-white/50">
          {widget.title || widget.widget_type}
        </p>
        <p className="mt-0.5 text-xs capitalize text-gray-400 dark:text-white/30">{widget.widget_type}</p>
      </div>

      <div className="flex shrink-0 border-b border-gray-100 dark:border-white/[0.07]">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={clsx(
                'flex flex-1 items-center justify-center gap-1.5 py-2.5 text-xs font-medium transition-colors',
                activeTab === tab.id
                  ? 'border-b-2 border-primary-500 text-primary-600'
                  : 'text-gray-400 hover:text-gray-600 dark:text-white/30 dark:hover:text-white/60',
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              {tab.label}
            </button>
          );
        })}
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto p-4">
        {activeTab === 'config' && (
          <>
            <Input label="Widget Title" value={widget.title || ''} onChange={(e) => update({ title: e.target.value })} />

            {widget.widget_type === 'chart' && (
              <>
                <Select
                  label="Chart Type"
                  value={widget.config?.chart_type || 'bar'}
                  onChange={(e) => updateConfig({ chart_type: e.target.value })}
                  options={CHART_TYPES.map((c) => ({ value: c.type, label: c.label }))}
                />
                {isReportBacked ? (
                  <p className="flex items-start gap-1.5 rounded-lg bg-gray-50 p-2 text-[11px] leading-relaxed text-gray-500 dark:bg-white/[0.04] dark:text-white/45">
                    <Info className="mt-0.5 h-3 w-3 shrink-0" />
                    The categories and measures come from the report, so there is nothing to
                    map here. Change the grouping or measures in the report itself.
                  </p>
                ) : (
                  <>
                    <Input
                      label="X-Axis Key"
                      value={widget.config?.xAxisKey || ''}
                      onChange={(e) => updateConfig({ xAxisKey: e.target.value })}
                      placeholder="e.g. month"
                    />
                    <Input
                      label="Y-Axis Data Key(s)"
                      value={
                        Array.isArray(widget.config?.yAxisKey)
                          ? widget.config.yAxisKey.join(', ')
                          : (widget.config?.yAxisKey || widget.config?.dataKey || '')
                      }
                      onChange={(e) => {
                        const parts = e.target.value.split(',').map((s) => s.trim()).filter(Boolean);
                        updateConfig({ yAxisKey: parts.length > 1 ? parts : e.target.value });
                      }}
                      placeholder="e.g. value  ·  claimed, paid"
                    />
                  </>
                )}
              </>
            )}

            {widget.widget_type === 'metric' && !isReportBacked && (
              <>
                <Input label="Value Key" value={widget.config?.valueKey || 'value'} onChange={(e) => updateConfig({ valueKey: e.target.value })} />
                <Input label="Change Key" value={widget.config?.changeKey || 'change'} onChange={(e) => updateConfig({ changeKey: e.target.value })} />
              </>
            )}

            <div className="grid grid-cols-2 gap-2">
              <Input label="Width (cols)" type="number" min={2} max={12} value={widget.w || 6} onChange={(e) => update({ w: Number(e.target.value) })} />
              <Input label="Height (rows)" type="number" min={2} max={12} value={widget.h || 4} onChange={(e) => update({ h: Number(e.target.value) })} />
            </div>

            {widget.widget_type === 'chart' && (
              <ChartAppearance
                chartType={widget.config?.chart_type || 'bar'}
                appearance={resolveChartAppearance(widget.config)}
                onChange={(patch) => updateConfig({ appearance: { ...(widget.config?.appearance || {}), ...patch } })}
              />
            )}
          </>
        )}

        {activeTab === 'data' && (
          <>
            <Select
              label="Where the numbers come from"
              value={dsType === 'json' ? 'json' : dsType}
              onChange={(e) => {
                const type = e.target.value;
                update({ data_source: { type } });
              }}
              options={[
                { value: 'report',   label: 'A saved report' },
                { value: 'object',   label: 'Records of an object' },
                { value: 'endpoint', label: 'A built-in dataset' },
                ...(dsType === 'json' ? [{ value: 'json', label: 'Fixed values (legacy)' }] : []),
              ]}
            />

            {dsType === 'report' && (
              <ReportSource widget={widget} dataSource={effectiveDs} onApply={update} />
            )}

            {dsType === 'endpoint' && (
              <EndpointSource widget={widget} dataSource={effectiveDs} onApply={update} />
            )}

            {dsType === 'object' && (
              <ObjectSource widget={widget} dataSource={effectiveDs} onApply={update} />
            )}

            {dsType === 'json' && <LegacyStaticSource dataSource={effectiveDs} />}
          </>
        )}
      </div>
    </div>
  );
}

/**
 * Point the widget at a saved report — the self-service data source.
 *
 * Reports are grouped by category and matched to the widget's shape: a metric
 * tile wants a "Number tiles" report, a chart wants a grouped one, a list wants a
 * table. Mismatches are still selectable but flagged, because a user who has
 * built the report they want should not be blocked by our categorisation.
 */
function ReportSource({ widget, dataSource, onApply }) {
  const shape = shapeForWidgetType(widget.widget_type);

  const { data, isPending, error } = useQuery({
    queryKey: ['reports', {}],
    queryFn: () => reportService.list(),
  });
  const reports = useMemo(() => data?.data ?? data ?? [], [data]);

  const selected = reports.find((r) => r.id === dataSource?.report_id);
  const suits = (r) => shapeForWidgetType(widgetTypeForReport(r)) === shape;

  const grouped = reports.reduce((acc, r) => {
    (acc[r.category || 'custom'] ||= []).push(r);
    return acc;
  }, {});

  const pick = (reportId) => {
    const report = reports.find((r) => r.id === Number(reportId));
    if (!report) return;
    onApply({
      ...widgetUpdatesForReport(report, widget),
      // Keep the widget type the user chose on the canvas; only the data changes.
      widget_type: widget.widget_type,
      data_source: { type: 'report', report_id: report.id, shape },
      ...(widget.title ? {} : { title: report.name }),
    });
  };

  if (isPending) return <div className="flex justify-center py-6"><Spinner size="sm" /></div>;
  if (error) return <p className="text-xs text-red-500">Could not load your reports: {error.message}</p>;

  return (
    <>
      <div className="flex items-start gap-2 rounded-lg border border-primary-100 bg-primary-50 p-2.5 dark:border-primary-500/20 dark:bg-primary-500/10">
        <FileBarChart className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary-500" />
        <p className="text-xs leading-relaxed text-primary-700 dark:text-primary-300">
          Build the report you want in <strong>Reports</strong>, then pick it here. The widget updates
          whenever the report changes.
        </p>
      </div>

      <div>
        <label htmlFor="widget-report" className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
          Report
        </label>
        <select
          id="widget-report"
          className="form-input text-sm"
          value={dataSource?.report_id ?? ''}
          onChange={(e) => pick(e.target.value)}
        >
          <option value="">Select a report…</option>
          {Object.entries(grouped).map(([category, items]) => (
            <optgroup key={category} label={category}>
              {items.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}{suits(r) ? '' : ' — different shape'}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
        {reports.length === 0 && (
          <p className="mt-1 text-xs text-gray-400">
            You have no reports yet. Create one in Reports, then come back here.
          </p>
        )}
      </div>

      {selected && (
        <>
          <p className="text-xs leading-relaxed text-gray-500 dark:text-white/40">{selected.description}</p>
          {!suits(selected) && (
            <p className="rounded-lg bg-amber-50 p-2 text-[11px] leading-relaxed text-amber-700 dark:bg-amber-500/10 dark:text-amber-300">
              This report is built as “{selected.config?.viz}”, which does not naturally fit a{' '}
              {widget.widget_type} widget. It will still render, but a{' '}
              {shape === 'metric' ? 'Number tiles' : shape === 'rows' ? 'Table' : 'chart'} report suits this widget better.
            </p>
          )}
          <a
            href={`/reports/${selected.id}/edit`}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1 text-xs font-medium text-primary-600 hover:underline"
          >
            <ExternalLink className="h-3 w-3" /> Open this report to change it
          </a>
          <WidgetPreview dataSource={{ type: 'report', report_id: selected.id, shape }} />
        </>
      )}
    </>
  );
}

/** The built-in, pre-computed datasets that ship with Genesis. */
function EndpointSource({ widget, dataSource, onApply }) {
  const shape = shapeForWidgetType(widget.widget_type);

  const { data: catalogData, isPending, error } = useQuery({
    queryKey: ['analytics-datasets'],
    queryFn: () => analyticsService.getDatasets(),
    staleTime: Infinity,
  });

  const datasets = (catalogData?.data || []).filter((d) => d.shape === shape);
  const selectedKey = dataSource?.dataset || '';
  const selected = datasets.find((d) => d.key === selectedKey);

  const grouped = datasets.reduce((acc, d) => {
    (acc[d.category] ||= []).push(d);
    return acc;
  }, {});

  const handleSelect = (key) => {
    const ds = datasets.find((d) => d.key === key);
    if (!ds) return;
    onApply({
      ...widgetUpdatesForDataset(ds, widget),
      ...(widget.title ? {} : { title: ds.label }),
    });
  };

  if (isPending) return <div className="flex justify-center py-6"><Spinner size="sm" /></div>;
  if (error) return <p className="text-xs text-red-500">Could not load the dataset catalog: {error.message}</p>;

  return (
    <>
      <div className="flex items-start gap-2 rounded-lg border border-emerald-100 bg-emerald-50 p-2.5 dark:border-emerald-500/20 dark:bg-emerald-500/10">
        <Zap className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-500" />
        <p className="text-xs leading-relaxed text-emerald-700 dark:text-emerald-400">
          Ready-made metrics that ship with Genesis. Fetched live on every render.
        </p>
      </div>

      <div>
        <label htmlFor="widget-dataset" className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
          Dataset
        </label>
        <select id="widget-dataset" className="form-input text-sm" value={selectedKey} onChange={(e) => handleSelect(e.target.value)}>
          <option value="">Select a dataset…</option>
          {Object.entries(grouped).map(([category, items]) => (
            <optgroup key={category} label={category}>
              {items.map((d) => (
                <option key={d.key} value={d.key}>{d.label}</option>
              ))}
            </optgroup>
          ))}
        </select>
        {!datasets.length && (
          <p className="mt-1 text-xs text-gray-400">
            No built-in {shape} datasets fit this widget type — use a saved report instead.
          </p>
        )}
      </div>

      {selected && (
        <>
          <p className="text-xs leading-relaxed text-gray-500 dark:text-white/40">{selected.description}</p>
          <WidgetPreview dataSource={dataSource} />
        </>
      )}
    </>
  );
}

/**
 * Count, sum or average any Builder object's records — grouped by pipeline
 * stage, creation month or any field — for verticals configured entirely in
 * the Builder. Scoped server-side to what each viewer can see.
 */
function ObjectSource({ widget, dataSource, onApply }) {
  const ds = { metric: 'count', ...dataSource, type: 'object' };
  const isMetric = shapeForWidgetType(widget.widget_type) === 'metric';
  const apply = (patch) => {
    const next = { ...ds, ...patch };
    if (next.metric === 'count') delete next.field;
    if (isMetric) delete next.group_by;
    onApply({
      data_source: next,
      ...(isMetric ? {} : { config: { ...(widget.config || {}), xAxisKey: 'name', yAxisKey: 'value' } }),
    });
  };
  return (
    <>
      <ObjectPicker label="Object" valueKey="name" value={ds.object || ''} onChange={(name) => apply({ object: name })} />
      <Select label="Measure" value={ds.metric} onChange={(e) => apply({ metric: e.target.value })}
        options={[{ value: 'count', label: 'Number of records' }, { value: 'sum', label: 'Sum of a field' }, { value: 'avg', label: 'Average of a field' }, { value: 'min', label: 'Minimum' }, { value: 'max', label: 'Maximum' }]} />
      {ds.metric !== 'count' && (
        <Input label="Field (API name)" placeholder="e.g. loan_amount" value={ds.field || ''} onChange={(e) => apply({ field: e.target.value })} />
      )}
      {!isMetric && (
        <Input label="Group by" placeholder="stage · created_month · or a field API name" value={ds.group_by || ''} onChange={(e) => apply({ group_by: e.target.value || null })}
          help="“stage” follows the pipeline order; a select field shows its option labels." />
      )}
      <TextArea label="Filters (optional JSON)" rows={3} className="font-mono text-xs"
        value={ds.filters ? JSON.stringify(ds.filters) : ''}
        placeholder='[{"field":"status","op":"eq","value":"approved"}]'
        onChange={(e) => {
          try { apply({ filters: e.target.value.trim() ? JSON.parse(e.target.value) : undefined }); } catch { /* keep typing */ }
        }} />
      {ds.object && <WidgetPreview dataSource={ds} />}
    </>
  );
}

/**
 * Widgets authored before report-backed widgets existed may still hold a fixed
 * payload. Shown read-only, with a nudge to move onto a report, rather than
 * silently dropping data someone put there.
 */
function LegacyStaticSource({ dataSource }) {
  const rows = Array.isArray(dataSource?.data) ? dataSource.data : [];
  return (
    <>
      <p className="rounded-lg bg-amber-50 p-2.5 text-xs leading-relaxed text-amber-700 dark:bg-amber-500/10 dark:text-amber-300">
        This widget holds fixed values that never change. Switch it to a saved report so it
        shows live data.
      </p>
      <div>
        <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-white/30">
          Stored values · {rows.length} row{rows.length === 1 ? '' : 's'}
        </p>
        <pre className="max-h-40 overflow-auto rounded-lg border border-gray-100 bg-gray-50 p-2 font-mono text-[10px] leading-relaxed text-gray-600 dark:border-white/[0.07] dark:bg-white/[0.04] dark:text-white/50">
          {JSON.stringify(rows.slice(0, 5), null, 2)}
        </pre>
      </div>
    </>
  );
}

/** Shows what the data source actually returned, so a choice can be checked at a glance. */
function WidgetPreview({ dataSource }) {
  const { data, meta, loading, error } = useDataSource(dataSource);

  if (loading) return <div className="flex justify-center py-4"><Spinner size="sm" /></div>;
  if (error) return <p className="text-xs text-red-500">{error}</p>;

  const sample = Array.isArray(data) ? data.slice(0, 3) : data;
  const count = Array.isArray(data) ? `${data.length} row${data.length === 1 ? '' : 's'}` : 'single value';

  return (
    <div>
      <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-white/30">
        Live result · {count}
      </p>
      {meta?.series?.length > 0 && (
        <p className="mb-1 text-[10px] text-gray-500 dark:text-white/40">
          Categories: {meta.xLabel || meta.xKey} · Measures: {meta.series.map((s) => s.label).join(', ')}
        </p>
      )}
      <pre className="max-h-40 overflow-auto rounded-lg border border-gray-100 bg-gray-50 p-2 font-mono text-[10px] leading-relaxed text-gray-600 dark:border-white/[0.07] dark:bg-white/[0.04] dark:text-white/50">
        {JSON.stringify(sample, null, 2)}
      </pre>
      {meta?.warnings?.length > 0 && (
        <p className="mt-1 text-[10px] text-amber-600 dark:text-amber-400">{meta.warnings[0]}</p>
      )}
    </div>
  );
}

/**
 * Chart appearance controls. Only the controls that make sense for the chosen
 * chart type are shown; everything is optional and the tenant's Appearance
 * setting supplies the palette unless overridden here.
 */
function ChartAppearance({ chartType, appearance: a, onChange }) {
  const can = appearanceCapabilities(chartType);
  const paletteOptions = [
    { value: 'tenant', label: 'Organization default' },
    { value: 'brand', label: 'Brand colours' },
    ...Object.keys(CHART_PALETTES).map((k) => ({ value: k, label: k.charAt(0).toUpperCase() + k.slice(1) })),
  ];
  return (
    <div className="space-y-3 border-t border-gray-100 pt-3 dark:border-white/[0.07]">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-white/30">Chart appearance</p>
      {can.palette && (
        <Select label="Palette" value={a.palette} onChange={(e) => onChange({ palette: e.target.value })} options={paletteOptions} />
      )}
      <Input
        label="Series colours (override)"
        value={(a.colors || []).join(', ')}
        onChange={(e) => onChange({ colors: e.target.value.split(',').map((c) => c.trim()).filter(Boolean) })}
        placeholder="#4f46e5, #14b8a6"
        help="Hex colours, in series order. Leave blank to use the palette."
      />
      {can.legend && (
        <Select label="Legend" value={a.legend} onChange={(e) => onChange({ legend: e.target.value })}
          options={[{ value: 'auto', label: 'Automatic' }, { value: 'bottom', label: 'Always, below' }, { value: 'top', label: 'Always, above' }, { value: 'hidden', label: 'Hidden' }]} />
      )}
      <div className="grid grid-cols-2 gap-2">
        <Select label="Number format" value={a.format} onChange={(e) => onChange({ format: e.target.value })} options={NUMBER_FORMATS} />
        <Input label="Decimals" type="number" min={0} max={4} value={a.decimals} onChange={(e) => onChange({ decimals: Number(e.target.value) })} />
      </div>
      {a.format.startsWith('currency') && (
        <Input label="Currency code" value={a.currency} placeholder="Tenant default" onChange={(e) => onChange({ currency: e.target.value.toUpperCase() })} />
      )}
      {can.sortTopN && (
        <div className="grid grid-cols-2 gap-2">
          <Select label="Sort" value={a.sort} onChange={(e) => onChange({ sort: e.target.value })}
            options={[{ value: 'none', label: 'As returned' }, { value: 'desc', label: 'Largest first' }, { value: 'asc', label: 'Smallest first' }]} />
          <Input label="Top N (+ Other)" type="number" min={0} value={a.topN || ''} placeholder="All" onChange={(e) => onChange({ topN: Number(e.target.value) || 0 })} />
        </div>
      )}
      {can.axes && (
        <div className="grid grid-cols-2 gap-2">
          <Input label="X-axis title" value={a.xLabel} onChange={(e) => onChange({ xLabel: e.target.value })} />
          <Input label="Y-axis title" value={a.yLabel} onChange={(e) => onChange({ yLabel: e.target.value })} />
        </div>
      )}
      {can.goal && (
        <div className="grid grid-cols-2 gap-2">
          <Input label="Goal line" type="number" value={a.goal ?? ''} placeholder="None" onChange={(e) => onChange({ goal: e.target.value === '' ? null : Number(e.target.value) })} />
          <Input label="Goal label" value={a.goalLabel} onChange={(e) => onChange({ goalLabel: e.target.value })} />
        </div>
      )}
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        {can.dataLabels && (
          <label className="flex items-center gap-1.5 text-xs text-gray-600 dark:text-gray-300"><input type="checkbox" className="rounded border-gray-300 text-primary-600" checked={!!a.dataLabels} onChange={(e) => onChange({ dataLabels: e.target.checked })} /> Data labels</label>
        )}
        {can.axes && (
          <label className="flex items-center gap-1.5 text-xs text-gray-600 dark:text-gray-300"><input type="checkbox" className="rounded border-gray-300 text-primary-600" checked={a.showGrid !== false} onChange={(e) => onChange({ showGrid: e.target.checked })} /> Grid lines</label>
        )}
        {can.smooth && (
          <label className="flex items-center gap-1.5 text-xs text-gray-600 dark:text-gray-300"><input type="checkbox" className="rounded border-gray-300 text-primary-600" checked={a.smooth !== false} onChange={(e) => onChange({ smooth: e.target.checked })} /> Smooth curves</label>
        )}
        {can.stacked && (
          <label className="flex items-center gap-1.5 text-xs text-gray-600 dark:text-gray-300"><input type="checkbox" className="rounded border-gray-300 text-primary-600" checked={a.stacked ?? chartType.endsWith('_stacked')} onChange={(e) => onChange({ stacked: e.target.checked })} /> Stacked</label>
        )}
      </div>
    </div>
  );
}
