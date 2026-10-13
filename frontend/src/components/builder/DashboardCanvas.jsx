import GridLayout from 'react-grid-layout';
import clsx from 'clsx';
import { BarChart2, Table, List, TrendingUp, Columns, Code, Trash2, GripHorizontal } from 'lucide-react';
import { useBuilderStore } from '../../store/builderStore';
import ChartRenderer from '../runtime/ChartRenderer';
import Badge from '../ui/Badge';
import Spinner from '../ui/Spinner';
import { useDataSourceRows, useDataSourceRecord } from '../../hooks/useDataSource';
import { resolveWidgetChart } from '../../utils/dashboard';

const WIDGET_ICONS = { chart: BarChart2, table: Table, list: List, metric: TrendingUp, pipeline: Columns, custom_html: Code };

/**
 * DashboardCanvas — the center panel of the Dashboard Builder.
 * Uses react-grid-layout for drag-and-drop + resize of widgets.
 *
 * Props:
 *   editable — if false, just renders
 */
export default function DashboardCanvas({ editable = true }) {
  const {
    dashboardWidgets, selectedWidgetId,
    setSelectedWidget, updateWidgetPositions,
  } = useBuilderStore();

  const layout = dashboardWidgets.map((w) => ({
    i:          String(w._tempId ?? w.id),
    x:          w.x ?? 0,
    y:          w.y ?? 0,
    w:          w.w ?? 6,
    h:          w.h ?? 4,
    minW:       2,
    minH:       2,
    isDraggable: editable,
    isResizable: editable,
  }));

  const handleLayoutChange = (newLayout) => {
    if (!editable) return;
    updateWidgetPositions(newLayout);
  };

  return (
    <div className="flex-1 overflow-auto bg-gray-50 dark:bg-night-0 p-4">
      {dashboardWidgets.length === 0 ? (
        <div className="h-full min-h-[400px] flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-gray-200 dark:border-white/[0.08] bg-white dark:bg-white/[0.02]">
          <BarChart2 className="h-10 w-10 text-gray-300 mb-3" />
          <p className="text-base font-medium text-gray-400 mb-1">Empty dashboard</p>
          <p className="text-sm text-gray-400">Drag widgets from the left panel</p>
        </div>
      ) : (
        <GridLayout
          className="layout"
          layout={layout}
          cols={12}
          rowHeight={80}
          width={1200}
          draggableHandle=".widget-drag-handle"
          onLayoutChange={handleLayoutChange}
          margin={[12, 12]}
        >
          {dashboardWidgets.map((widget) => {
            const key = String(widget._tempId ?? widget.id);
            const isSelected = selectedWidgetId === (widget._tempId ?? widget.id);
            return (
              <div
                key={key}
                className={clsx(
                  'bg-white dark:bg-night-2 rounded-xl border-2 overflow-hidden flex flex-col transition-all',
                  isSelected ? 'border-primary-400 shadow-card-md' : 'border-gray-200 dark:border-white/[0.07] hover:border-gray-300 dark:hover:border-white/[0.12]',
                )}
                onClick={() => editable && setSelectedWidget(widget._tempId ?? widget.id)}
              >
                <WidgetContainer widget={widget} editable={editable} />
              </div>
            );
          })}
        </GridLayout>
      )}
    </div>
  );
}

function WidgetContainer({ widget, editable }) {
  const { removeWidget } = useBuilderStore();
  const Icon = WIDGET_ICONS[widget.widget_type] || BarChart2;
  const id = widget._tempId ?? widget.id;

  return (
    <>
      {/* Widget header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-gray-100 dark:border-white/[0.07] shrink-0">
        <div className={clsx('flex items-center gap-2 min-w-0', editable && 'widget-drag-handle cursor-grab active:cursor-grabbing')}>
          {editable && <GripHorizontal className="h-4 w-4 text-gray-300 shrink-0" />}
          <Icon className="h-3.5 w-3.5 text-gray-400 shrink-0" />
          <span className="text-xs font-medium text-gray-700 dark:text-white/70 truncate">{widget.title || widget.widget_type}</span>
          {widget._isNew && <Badge variant="info" className="text-[10px]">New</Badge>}
        </div>
        {editable && (
          <button
            onClick={(e) => { e.stopPropagation(); removeWidget(id); }}
            className="p-1 text-gray-400 hover:text-red-500 shrink-0"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {/* Widget body */}
      <div className="flex-1 min-h-0 p-2">
        <WidgetBody widget={widget} />
      </div>
    </>
  );
}

function WidgetBody({ widget }) {
  if (widget.widget_type === 'chart') {
    return <ChartRenderer chart={resolveWidgetChart(widget)} />;
  }

  if (widget.widget_type === 'metric') {
    return <MetricPreview widget={widget} />;
  }

  if (widget.widget_type === 'list' || widget.widget_type === 'table') {
    return <RowsPreview widget={widget} />;
  }

  return (
    <div className="h-full flex items-center justify-center text-sm text-gray-400">
      Widget preview
    </div>
  );
}

/** Live KPI preview — reads the widget's data source exactly like runtime does. */
function MetricPreview({ widget }) {
  const { data, loading, error } = useDataSourceRecord(widget.data_source);
  const valueKey  = widget.config?.valueKey  || 'value';
  const changeKey = widget.config?.changeKey || 'change';

  if (loading) {
    return (
      <div className="h-full flex flex-col justify-center px-2 gap-2">
        <div className="h-7 w-24 rounded bg-gray-100 dark:bg-white/[0.07] animate-pulse" />
        <div className="h-3 w-12 rounded bg-gray-100 dark:bg-white/[0.07] animate-pulse" />
      </div>
    );
  }
  if (error) {
    return <div className="h-full flex items-center px-2 text-xs text-red-500">{error}</div>;
  }

  const change = data[changeKey] ?? data.change;
  return (
    <div className="h-full flex flex-col justify-center px-2">
      <p className="text-2xl font-bold text-gray-900 dark:text-white/90">
        {data[valueKey] ?? data.value ?? '—'}
      </p>
      {change && (
        <p className={clsx('text-sm font-medium mt-1', data.trend === 'down' ? 'text-red-500' : 'text-green-600')}>
          {change}
        </p>
      )}
    </div>
  );
}

/** Live list/table preview — first few rows of the widget's data source. */
function RowsPreview({ widget }) {
  const { data: rows, loading, error } = useDataSourceRows(widget.data_source);
  const columns = widget.config?.columns || (rows[0] ? Object.keys(rows[0]) : []);

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <Spinner size="sm" />
      </div>
    );
  }
  if (error) {
    return <div className="h-full flex items-center justify-center px-2 text-xs text-red-500 text-center">{error}</div>;
  }
  if (!rows.length) {
    return (
      <div className="h-full flex items-center justify-center text-xs text-gray-400">
        <Table className="h-4 w-4 mr-1.5 opacity-50" /> No data
      </div>
    );
  }

  return (
    <div className="h-full overflow-auto text-[11px]">
      <table className="w-full text-left">
        <thead className="sticky top-0 bg-gray-50 dark:bg-white/5">
          <tr>
            {columns.map(col => (
              <th key={col} className="px-2 py-1 font-medium text-gray-500 dark:text-white/50 uppercase tracking-wide">
                {col}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.slice(0, 20).map((row, i) => (
            <tr key={i} className="border-t border-gray-100 dark:border-white/[0.07]">
              {columns.map(col => (
                <td key={col} className="px-2 py-1 text-gray-700 dark:text-white/70 whitespace-nowrap">
                  {String(row[col] ?? '')}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
