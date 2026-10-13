import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import clsx from 'clsx';
import { BarChart2, TrendingUp, Table, List, Columns, Code, ChevronRight, Zap, FileBarChart, Star } from 'lucide-react';
import { WIDGET_TYPES, CHART_TYPES } from '../../utils/constants';
import { useBuilderStore } from '../../store/builderStore';
import { analyticsService } from '../../services/analytics.service';
import { reportService } from '../../services/report.service';
import {
  widgetUpdatesForDataset, widgetUpdatesForReport, widgetTypeForReport, sizeForReport,
} from '../../utils/dashboard';
import Spinner from '../ui/Spinner';

const SECTIONS = ['reports', 'built-in', 'blank'];

/** Default footprint on the 12-column grid, by dataset shape. */
const SIZE_BY_SHAPE = {
  metric: { w: 3, h: 2 },
  rows:   { w: 6, h: 4 },
  series: { w: 6, h: 4 },
};

const WIDGET_TYPE_BY_SHAPE = { metric: 'metric', rows: 'list', series: 'chart' };

/**
 * WidgetPalette — left panel of the Dashboard Builder.
 * Clicking a widget type adds it to the canvas.
 */
export default function WidgetPalette() {
  const { addWidget } = useBuilderStore();
  const [activeSection, setActiveSection] = useState('reports');

  const { data: catalogData, isPending: catalogLoading } = useQuery({
    queryKey: ['analytics-datasets'],
    queryFn:  () => analyticsService.getDatasets(),
    staleTime: Infinity,
  });
  const datasets = catalogData?.data || [];

  const { data: reportsData, isPending: reportsLoading } = useQuery({
    queryKey: ['reports', {}],
    queryFn:  () => reportService.list(),
  });
  // `reportService.list()` resolves to the array itself (apiWrapper.extract), so
  // an envelope-style `?.data` read would always come back empty.
  const reports = reportsData?.data ?? reportsData ?? [];

  const handleAddWidget = (widgetType) => {
    addWidget({
      widget_type:  widgetType.type,
      title:        widgetType.label,
      w:            widgetType.defaultW,
      h:            widgetType.defaultH,
      config:       {},
      // New widgets start out report-backed; pick the report in the Data tab.
      data_source:  { type: 'report' },
    });
  };

  const handleAddChart = (chartType) => {
    addWidget({
      widget_type:  'chart',
      title:        chartType.label,
      w:            6,
      h:            4,
      config:       { chart_type: chartType.type },
      data_source:  { type: 'report' },
    });
  };

  /**
   * One click → a widget backed by a saved report. This is the self-service path:
   * whatever a business user built in the report builder becomes a dashboard
   * widget, with the visualization and shape inferred from the report itself.
   */
  const handleAddReport = (report) => {
    addWidget({
      widget_type: widgetTypeForReport(report),
      title:       report.name,
      ...sizeForReport(report),
      ...widgetUpdatesForReport(report, {}),
    });
  };

  /** One click → a widget already wired to a live analytics endpoint. */
  const handleAddDataset = (dataset) => {
    const size = SIZE_BY_SHAPE[dataset.shape] ?? SIZE_BY_SHAPE.series;
    const widgetType = WIDGET_TYPE_BY_SHAPE[dataset.shape] ?? 'chart';
    const { config, data_source } = widgetUpdatesForDataset(dataset, {});
    addWidget({
      widget_type: widgetType,
      title:       dataset.label,
      ...size,
      config,
      data_source,
    });
  };

  const icons = { chart: BarChart2, metric: TrendingUp, table: Table, list: List, pipeline: Columns, custom_html: Code };

  // Group live datasets by category for a scannable list.
  const grouped = datasets.reduce((acc, d) => {
    (acc[d.category] ||= []).push(d);
    return acc;
  }, {});

  return (
    <div className="w-56 shrink-0 bg-white dark:bg-night-1 border-r border-gray-200 dark:border-white/[0.07] flex flex-col overflow-hidden">
      {/* Section switcher */}
      <div className="px-4 py-3 border-b border-gray-100 dark:border-white/[0.07]">
          <div className="flex bg-gray-100 dark:bg-white/[0.07] rounded-lg p-0.5">
          {SECTIONS.map((s) => (
            <button
              key={s}
              onClick={() => setActiveSection(s)}
              className={clsx(
                'flex-1 text-[11px] py-1 rounded-md font-medium transition-colors capitalize',
                activeSection === s ? 'bg-white dark:bg-white/10 shadow text-gray-800 dark:text-white/90' : 'text-gray-500 dark:text-white/40',
              )}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto py-2">
        {activeSection === 'reports' && (
          <>
            <p className="px-4 py-1 text-[10px] font-semibold text-gray-400 dark:text-white/30 uppercase tracking-widest">
              Your saved reports
            </p>
            {reportsLoading ? (
              <div className="flex justify-center py-6"><Spinner size="sm" /></div>
            ) : !reports.length ? (
              <div className="px-4 py-3">
                <p className="text-xs text-gray-400">You have no reports yet.</p>
                <a href="/reports/new" target="_blank" rel="noreferrer" className="mt-1 inline-block text-xs font-medium text-primary-600 hover:underline">
                  Build your first report →
                </a>
              </div>
            ) : (
              Object.entries(reports.reduce((acc, r) => {
                (acc[r.category || 'custom'] ||= []).push(r);
                return acc;
              }, {})).map(([category, items]) => (
                <div key={category} className="mb-1">
                  <p className="px-4 pt-2 pb-1 text-[10px] font-semibold text-gray-400 dark:text-white/25 uppercase tracking-wider">
                    {category}
                  </p>
                  {items.map((r) => (
                    <button
                      key={r.id}
                      onClick={() => handleAddReport(r)}
                      title={r.description || `Add “${r.name}” to this dashboard`}
                      className="w-full px-4 py-2 flex items-center gap-2.5 text-sm text-gray-700 dark:text-white/60
                                 hover:bg-gray-50 dark:hover:bg-white/5 hover:text-primary-600 dark:hover:text-primary-400 transition-colors text-left"
                    >
                      <FileBarChart className="h-3.5 w-3.5 shrink-0 text-primary-500/70" />
                      <span className="flex-1 leading-snug">{r.name}</span>
                      {r.is_favorite && <Star className="h-3 w-3 shrink-0 fill-current text-amber-500" />}
                      <span className="text-[10px] text-gray-300 dark:text-white/20">{r.config?.viz}</span>
                    </button>
                  ))}
                </div>
              ))
            )}
          </>
        )}

        {activeSection === 'built-in' && (
          <>
            <p className="px-4 py-1 text-[10px] font-semibold text-gray-400 dark:text-white/30 uppercase tracking-widest">
              Ready-made metrics
            </p>
            {catalogLoading ? (
              <div className="flex justify-center py-6"><Spinner size="sm" /></div>
            ) : !datasets.length ? (
              <p className="px-4 py-3 text-xs text-gray-400">No analytics datasets published.</p>
            ) : (
              Object.entries(grouped).map(([category, items]) => (
                <div key={category} className="mb-1">
                  <p className="px-4 pt-2 pb-1 text-[10px] font-semibold text-gray-400 dark:text-white/25 uppercase tracking-wider">
                    {category}
                  </p>
                  {items.map((d) => (
                    <button
                      key={d.key}
                      onClick={() => handleAddDataset(d)}
                      title={`${d.description}\n\nGET /api/analytics/data/${d.key}`}
                      className="w-full px-4 py-2 flex items-center gap-2.5 text-sm text-gray-700 dark:text-white/60
                                 hover:bg-gray-50 dark:hover:bg-white/5 hover:text-primary-600 dark:hover:text-primary-400 transition-colors text-left"
                    >
                      <Zap className="h-3.5 w-3.5 shrink-0 text-emerald-500/70" />
                      <span className="flex-1 leading-snug">{d.label}</span>
                      {d.chart_type && (
                        <span className="text-[10px] text-gray-300 dark:text-white/20">{d.chart_type}</span>
                      )}
                    </button>
                  ))}
                </div>
              ))
            )}
          </>
        )}

        {activeSection === 'blank' && (
          <>
            <p className="px-4 pt-1 pb-2 text-[10px] leading-relaxed text-gray-400 dark:text-white/30">
              Add an empty widget, then choose a report for it in the Data tab.
            </p>
            {WIDGET_TYPES.map((wt) => {
              const Icon = icons[wt.type] || BarChart2;
              return (
                <button
                  key={wt.type}
                  onClick={() => handleAddWidget(wt)}
                  className="w-full mx-0 px-4 py-2.5 flex items-center gap-2.5 text-sm text-gray-700 dark:text-white/60
                             hover:bg-gray-50 dark:hover:bg-white/5 hover:text-primary-600 dark:hover:text-primary-400 transition-colors text-left"
                >
                  <Icon className="h-4 w-4 shrink-0 text-gray-400 dark:text-white/30" />
                  <span className="flex-1">{wt.label}</span>
                  <ChevronRight className="h-3.5 w-3.5 text-gray-300" />
                </button>
              );
            })}

            <p className="px-4 pt-3 py-1 text-[10px] font-semibold text-gray-400 dark:text-white/30 uppercase tracking-widest">
              Chart shapes
            </p>
            {CHART_TYPES.map((ct) => (
              <button
                key={ct.type}
                onClick={() => handleAddChart(ct)}
                className="w-full px-4 py-2 flex items-center gap-2.5 text-sm text-gray-700 dark:text-white/60
                           hover:bg-gray-50 dark:hover:bg-white/5 hover:text-primary-600 dark:hover:text-primary-400 transition-colors text-left"
              >
                <BarChart2 className="h-3.5 w-3.5 shrink-0 text-gray-400 dark:text-white/30" />
                <span className="flex-1">{ct.label}</span>
              </button>
            ))}
          </>
        )}
      </div>
    </div>
  );
}
