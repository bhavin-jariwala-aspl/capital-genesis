/**
 * Resolve the chart definition a `chart` widget should render.
 *
 * A widget may either link a saved chart record (`chart_id` → `widget.chart`)
 * or carry its own inline `config` / `data_source`. Inline values win so that
 * edits in the builder's config panel show up immediately, while anything the
 * widget does not override falls back to the linked chart record.
 */
export function resolveWidgetChart(widget) {
  if (!widget) return null;
  const linked = widget.chart;
  return {
    ...(linked || {}),
    chart_type:  widget.config?.chart_type || linked?.chart_type || 'bar',
    config:      { ...(linked?.config || {}), ...(widget.config || {}) },
    data_source: widget.data_source ?? linked?.data_source ?? null,
  };
}

/** Which data shape a widget type can consume. */
export function shapeForWidgetType(widgetType) {
  if (widgetType === 'metric') return 'metric';
  if (widgetType === 'list' || widgetType === 'table') return 'rows';
  return 'series';
}

/**
 * Which widget type a report's visualization naturally becomes on a dashboard.
 * Used when a saved report is dropped straight onto the canvas.
 */
export function widgetTypeForReport(report) {
  const viz = report?.config?.viz || 'table';
  if (viz === 'kpi') return 'metric';
  if (viz === 'table' || viz === 'pivot') return 'list';
  return 'chart';
}

/** Chart type a report's visualization maps to in the chart renderer. */
const REPORT_CHART_TYPE = { bar: 'bar', line: 'line', area: 'area', pie: 'pie', donut: 'donut', funnel: 'funnel' };

/**
 * The widget patch that points a widget at a saved report.
 *
 * Crucially it stores *no field names*: the report's own result metadata tells the
 * renderer which column is the category and which are the measures at render
 * time. That means editing the report — renaming a measure, swapping the grouping
 * — never leaves a dashboard widget silently broken.
 */
export function widgetUpdatesForReport(report, widget = {}) {
  const viz = report?.config?.viz || 'table';
  const widgetType = widgetTypeForReport(report);
  return {
    widget_type: widgetType,
    chart_id: null,
    data_source: {
      type: 'report',
      report_id: report.id,
      shape: shapeForWidgetType(widgetType),
    },
    config: {
      ...(widget.config || {}),
      chart_type: REPORT_CHART_TYPE[viz] || widget.config?.chart_type || 'bar',
      // Axis keys are resolved from the report result, never stored.
      xAxisKey: undefined,
      yAxisKey: undefined,
      dataKey: undefined,
      bars: undefined,
      lines: undefined,
      columns: undefined,
    },
  };
}

/** Default grid footprint for a report-backed widget. */
export function sizeForReport(report) {
  const type = widgetTypeForReport(report);
  if (type === 'metric') return { w: 3, h: 2 };
  if (type === 'list') return { w: 6, h: 4 };
  return { w: 6, h: 4 };
}

/**
 * Build the widget patch that wires it to an analytics dataset: point the data
 * source at the endpoint and pre-fill the chart type / axis keys / columns the
 * dataset suggests, so a freshly-picked dataset renders correctly right away.
 */
export function widgetUpdatesForDataset(dataset, widget = {}) {
  const updates = {
    data_source: { type: 'endpoint', dataset: dataset.key },
    config: { ...(widget.config || {}) },
  };

  if (dataset.shape === 'series') {
    updates.config.chart_type = dataset.chart_type || widget.config?.chart_type || 'bar';
    updates.config.xAxisKey   = dataset.xKey ?? undefined;
    updates.config.yAxisKey   = dataset.yKey ?? undefined;
    // Multi-series datasets are described by yKey alone; drop any stale
    // single-series bar/line definitions left over from a previous dataset.
    delete updates.config.bars;
    delete updates.config.lines;
    delete updates.config.dataKey;
  } else if (dataset.shape === 'metric') {
    updates.config.valueKey  = 'value';
    updates.config.changeKey = 'change';
  } else if (dataset.shape === 'rows') {
    updates.config.columns = dataset.columns ?? undefined;
  }

  return updates;
}

export default resolveWidgetChart;
