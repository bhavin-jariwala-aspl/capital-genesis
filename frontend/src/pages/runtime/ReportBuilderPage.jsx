import { useState, useEffect, useMemo, useCallback } from 'react';
import { useParams, useNavigate, useSearchParams, useLocation } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import * as Icons from 'lucide-react';
import {
  Save, Download, Database, ArrowLeft, AlertCircle, Check,
  ChevronDown, ChevronRight, Printer, FileSpreadsheet, Share2, Sparkles, RotateCcw,
} from 'lucide-react';
import clsx from 'clsx';
import { reportService, downloadBlob, openPrintView } from '../../services/report.service';
import { useAuthStore } from '../../store/authStore';
import ReportResult from '../../components/runtime/ReportResult';
import TemplateGallery from '../../components/reports/TemplateGallery';
import FilterGroupBuilder, { normalize as normalizeFilters, countConditions, repairFilters } from '../../components/reports/FilterGroupBuilder';
import MeasureEditor from '../../components/reports/MeasureEditor';
import GroupingEditor from '../../components/reports/GroupingEditor';
import ConditionalFormatEditor from '../../components/reports/ConditionalFormatEditor';
import ShareSettings from '../../components/reports/ShareSettings';
import Spinner from '../../components/ui/Spinner';
import { isChartViz } from '../../utils/report';

const input = 'rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-sm text-gray-900 focus:border-primary-500 focus:outline-none dark:border-white/10 dark:bg-white/5 dark:text-white';

const emptyConfig = {
  source: '',
  viz: 'bar',
  columns: [],
  group_by: [],
  metrics: [{ agg: 'count', label: 'Number of records' }],
  filters: { logic: 'AND', conditions: [] },
  sort: [],
  limit: 100,
  totals: true,
  compare: '',
  format_rules: [],
};

const emptyMeta = {
  name: '',
  description: '',
  category: 'custom',
  visibility: 'private',
  shared_with: [],
  folder_id: null,
};

const SCOPES = [['me', 'Mine', 99], ['team', 'My team', 4], ['all', 'Everyone', 3]];

function useDebounced(value, ms = 450) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setV(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return v;
}

/**
 * ReportBuilderPage — the guided report builder.
 *
 * Structured as a numbered set of steps rather than a wall of controls, because
 * the people using it are not analysts: each step asks one question in plain
 * English, shows a tick when it is answered, and the preview to the right
 * re-renders as they go so the effect of every choice is immediately visible.
 *
 * Nothing in here is typed except names and numbers — sources, fields, operators,
 * aggregations and periods all come from GET /reports/sources and
 * GET /reports/vocabulary, so the builder can never produce a report the engine
 * cannot run.
 */
export default function ReportBuilderPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [params] = useSearchParams();
  const location = useLocation();
  // "Save as report" from Ask hands over a ready config as router state.
  const draft = !id ? location.state?.draft : null;
  const roleLevel = useAuthStore((s) => s.employee?.role_level ?? 5);

  const [meta, setMeta] = useState(draft ? { ...emptyMeta, name: draft.name || '', description: draft.description || '' } : emptyMeta);
  const [config, setConfig] = useState(draft?.config ? { ...emptyConfig, ...draft.config } : emptyConfig);
  const [openStep, setOpenStep] = useState(draft ? 'save' : 'source');
  const [showGallery, setShowGallery] = useState(!id && !params.get('template') && !draft);
  const [scope, setScope] = useState('all');
  const [exporting, setExporting] = useState(false);

  const set = useCallback((patch) => setConfig((c) => ({ ...c, ...patch })), []);

  // ── Metadata ─────────────────────────────────────────────────────────────
  const { data: sourcesData } = useQuery({
    queryKey: ['report-sources'], queryFn: reportService.getSources, staleTime: Infinity,
  });
  const sources = useMemo(() => sourcesData?.data ?? sourcesData ?? [], [sourcesData]);

  const { data: vocabData } = useQuery({
    queryKey: ['report-vocabulary'], queryFn: reportService.getVocabulary, staleTime: Infinity,
  });
  const vocabulary = vocabData?.data ?? vocabData ?? {};

  const { data: foldersData } = useQuery({ queryKey: ['report-folders'], queryFn: reportService.listFolders });
  const folders = foldersData?.data ?? foldersData ?? [];

  const source = useMemo(() => sources.find((s) => s.key === config.source), [sources, config.source]);
  const fields = source?.fields ?? [];
  const visualizations = vocabulary.visualizations ?? [];
  const activeViz = visualizations.find((v) => v.key === config.viz);

  // ── Load an existing report, or a template ───────────────────────────────
  const { data: existing } = useQuery({
    queryKey: ['report', id], queryFn: () => reportService.get(id), enabled: !!id,
  });
  useEffect(() => {
    const r = existing?.data ?? existing;
    if (!r?.config) return;
    setConfig(withSeededColumns({
      ...emptyConfig,
      ...r.config,
      // Repair stale operators here rather than at render time, so the builder never
      // shows an operator the engine is not actually using.
      filters: repairFilters(r.config.filters, sourceFieldsFor(sources, r.config.source), vocabulary.operators),
    }, sources));
    setMeta({
      name: r.name,
      description: r.description || '',
      category: r.category || 'custom',
      visibility: r.visibility || 'private',
      shared_with: r.shared_with || [],
      folder_id: r.folder_id ?? null,
    });
    setOpenStep(null);
  }, [existing, sources, vocabulary.operators]);

  const templateKey = params.get('template');
  const { data: templateData } = useQuery({
    queryKey: ['report-template', templateKey],
    queryFn: () => reportService.getTemplate(templateKey),
    enabled: !!templateKey && !id,
  });
  useEffect(() => {
    const t = templateData?.data ?? templateData;
    if (!t?.config) return;
    applyTemplate(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [templateData]);

  const applyTemplate = (t) => {
    setConfig(withSeededColumns({
      ...emptyConfig,
      ...t.config,
      filters: repairFilters(t.config.filters, sourceFieldsFor(sources, t.config.source), vocabulary.operators),
    }, sources));
    setMeta((m) => ({ ...m, name: t.name, description: t.question, category: t.category }));
    setShowGallery(false);
    setOpenStep(null);
  };

  // ── Live preview ─────────────────────────────────────────────────────────
  const previewKey = useDebounced(JSON.stringify({ config, scope }));
  const { data: previewData, isFetching, error } = useQuery({
    queryKey: ['report-preview', previewKey],
    queryFn: () => reportService.run(config, scope),
    enabled: !!config.source,
    placeholderData: (prev) => prev,
    retry: false,
  });
  const result = previewData?.data ?? previewData;
  const resultColumns = result?.columns ?? [];

  // ── Save ─────────────────────────────────────────────────────────────────
  const saveMut = useMutation({
    mutationFn: () => {
      const payload = { ...meta, config };
      return id ? reportService.update(id, payload) : reportService.create(payload);
    },
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['reports'] });
      const saved = res?.data ?? res;
      navigate(saved?.id ? `/reports?opened=${saved.id}` : '/reports');
    },
  });

  const exportAs = async (format) => {
    setExporting(true);
    try {
      const blob = await reportService.exportFile(config, { format, scope, name: meta.name });
      downloadBlob(blob, `${(meta.name || config.source || 'report').replace(/[^\w -]/g, '')}.${format}`);
    } finally {
      setExporting(false);
    }
  };

  if (showGallery) {
    return (
      <div className="h-full overflow-auto">
        <div className="border-b border-gray-200 px-6 py-3 dark:border-white/10">
          <button onClick={() => navigate('/reports')} className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-primary-600 dark:text-white/50">
            <ArrowLeft className="h-4 w-4" /> Back to reports
          </button>
        </div>
        <TemplateGallery
          onPick={applyTemplate}
          onBlank={() => { setShowGallery(false); setOpenStep('source'); }}
        />
      </div>
    );
  }

  // ── Step completeness, used for the ticks and the "what's missing" hint ──
  const needsGroup = activeViz?.needs_group;
  const groupTarget = needsGroup === 2 ? 2 : needsGroup ? 1 : 0;
  const isTable = config.viz === 'table';
  const filterCount = countConditions(config.filters);
  const canCompare = canCompareConfig(config, fields);

  const steps = [
    { key: 'source', n: 1, title: 'What do you want to report on?', done: !!config.source, summary: source?.label },
    { key: 'viz', n: 2, title: 'How should it look?', done: !!config.viz, summary: activeViz?.label },
    ...(isTable
      ? [{ key: 'columns', n: 3, title: 'Which columns?', done: config.columns.length > 0, summary: config.columns.length ? `${config.columns.length} columns` : 'Standard columns' }]
      : [
          { key: 'group', n: 3, title: 'How should it be grouped?', done: config.group_by.length >= groupTarget, summary: config.group_by.length ? `${config.group_by.length} grouping${config.group_by.length > 1 ? 's' : ''}` : null },
          { key: 'measure', n: 4, title: 'What do you want to measure?', done: config.metrics.length > 0, summary: config.metrics.length ? `${config.metrics.length} measure${config.metrics.length > 1 ? 's' : ''}` : null },
        ]),
    { key: 'filters', n: isTable ? 4 : 5, title: 'Which records should be included?', done: true, summary: filterCount ? `${filterCount} condition${filterCount > 1 ? 's' : ''}` : 'All records' },
    { key: 'polish', n: isTable ? 5 : 6, title: 'Totals, comparison and colours', done: true, summary: polishSummary(config) },
    { key: 'save', n: isTable ? 6 : 7, title: 'Name it and choose who can see it', done: !!meta.name, summary: meta.name || null },
  ];

  const nextIncomplete = steps.find((s) => !s.done);
  const canSave = !!meta.name && !!config.source;

  const StepBlock = ({ step, children }) => (
    <Step
      step={step}
      open={openStep === step.key}
      onToggle={() => setOpenStep(openStep === step.key ? null : step.key)}
    >
      {children}
    </Step>
  );

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-200 px-6 py-3 dark:border-white/10">
        <div className="flex min-w-0 items-center gap-3">
          <button onClick={() => navigate('/reports')} aria-label="Back to reports" className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 dark:hover:bg-white/10">
            <ArrowLeft className="h-5 w-5" />
          </button>
          <input
            value={meta.name}
            onChange={(e) => setMeta({ ...meta, name: e.target.value })}
            placeholder="Untitled report"
            className="w-56 min-w-0 border-none bg-transparent text-lg font-semibold text-gray-900 placeholder:text-gray-400 focus:outline-none dark:text-white sm:w-72"
          />
        </div>

        <div className="flex items-center gap-2">
          {SCOPES.filter(([, , min]) => roleLevel <= min).length > 1 && (
            <div className="flex rounded-lg border border-gray-200 p-0.5 dark:border-white/10" title="Whose records to include in the preview">
              {SCOPES.filter(([, , min]) => roleLevel <= min).map(([k, l]) => (
                <button
                  key={k}
                  onClick={() => setScope(k)}
                  className={clsx(
                    'rounded-md px-2 py-1 text-[11px] font-medium',
                    scope === k ? 'bg-primary-600 text-on-primary' : 'text-gray-500 hover:bg-gray-100 dark:text-white/60 dark:hover:bg-white/10',
                  )}
                >
                  {l}
                </button>
              ))}
            </div>
          )}

          <div className="flex rounded-lg border border-gray-200 dark:border-white/10">
            <button onClick={() => exportAs('csv')} disabled={!result || exporting} title="Download as CSV"
              className="flex items-center gap-1 rounded-l-lg px-2.5 py-2 text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-40 dark:text-white/70 dark:hover:bg-white/5">
              <Download className="h-3.5 w-3.5" /> CSV
            </button>
            <button onClick={() => exportAs('xlsx')} disabled={!result || exporting} title="Download as an Excel workbook"
              className="flex items-center gap-1 border-l border-gray-200 px-2.5 py-2 text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-40 dark:border-white/10 dark:text-white/70 dark:hover:bg-white/5">
              <FileSpreadsheet className="h-3.5 w-3.5" /> Excel
            </button>
            {id && (
              <button type="button" onClick={() => openPrintView(id, scope)} title="Open a print view — use your browser's Save as PDF"
                className="flex items-center gap-1 rounded-r-lg border-l border-gray-200 px-2.5 py-2 text-xs font-medium text-gray-600 hover:bg-gray-50 dark:border-white/10 dark:text-white/70 dark:hover:bg-white/5">
                <Printer className="h-3.5 w-3.5" /> Print
              </button>
            )}
          </div>

          <button
            onClick={() => (canSave ? saveMut.mutate() : setOpenStep('save'))}
            disabled={saveMut.isPending}
            className="flex items-center gap-1.5 rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-on-primary hover:bg-primary-700 disabled:opacity-40"
          >
            <Save className="h-4 w-4" /> {saveMut.isPending ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>

      {saveMut.error && (
        <div className="flex items-center gap-2 border-b border-rose-200 bg-rose-50 px-6 py-2 text-sm text-rose-700 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-300">
          <AlertCircle className="h-4 w-4" />
          {saveMut.error?.response?.data?.error?.message || 'Could not save this report.'}
        </div>
      )}

      <div className="flex flex-1 overflow-hidden">
        {/* Steps */}
        <div className="w-[22rem] shrink-0 space-y-2 overflow-y-auto border-r border-gray-200 p-4 dark:border-white/10">
          {nextIncomplete && (
            <button
              onClick={() => setOpenStep(nextIncomplete.key)}
              className="flex w-full items-center gap-2 rounded-xl bg-primary-50 px-3 py-2 text-left text-xs text-primary-700 dark:bg-primary-500/10 dark:text-primary-300"
            >
              <Sparkles className="h-3.5 w-3.5 shrink-0" />
              <span>Next: {nextIncomplete.title.toLowerCase()}</span>
            </button>
          )}

          <StepBlock step={steps.find((s) => s.key === 'source')}>
            <p className="mb-2 text-xs text-gray-500 dark:text-white/50">
              Each choice below is a kind of record. One row in the report = one of these.
            </p>
            <div className="space-y-1">
              {sources.map((s) => {
                const Icon = Icons[s.icon] ?? Database;
                const active = config.source === s.key;
                return (
                  <button
                    key={s.key}
                    onClick={() => {
                      // Columns come from the new source's defaults, so switching source
                      // re-ticks the picker to match what the preview will render.
                      set({
                        source: s.key,
                        columns: config.viz === 'table' ? [...(s.default_columns ?? [])] : [],
                        group_by: [], filters: { logic: 'AND', conditions: [] }, sort: [], format_rules: [],
                      });
                      setOpenStep('viz');
                    }}
                    className={clsx(
                      'flex w-full items-start gap-2 rounded-xl border p-2 text-left transition',
                      active ? 'border-primary-500 bg-primary-50 dark:bg-primary-500/10' : 'border-gray-200 hover:bg-gray-50 dark:border-white/10 dark:hover:bg-white/5',
                    )}
                  >
                    <span className={clsx('mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg', active ? 'bg-primary-600 text-on-primary' : 'bg-gray-100 text-gray-400 dark:bg-white/10 dark:text-white/40')}>
                      <Icon className="h-3.5 w-3.5" />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-sm font-medium text-gray-800 dark:text-white/80">{s.label}</span>
                      <span className="block text-[11px] leading-snug text-gray-500 dark:text-white/45">{s.description}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          </StepBlock>

          {source && (
            <>
              <StepBlock step={steps.find((s) => s.key === 'viz')}>
                <div className="grid grid-cols-3 gap-1.5">
                  {visualizations.map((v) => {
                    const Icon = Icons[v.icon] ?? Icons.BarChart3;
                    return (
                      <button
                        key={v.key}
                        onClick={() => {
                          const patch = { viz: v.key };
                          // Charts need a grouping; give them a sensible one rather
                          // than showing an empty chart the user has to diagnose.
                          if (v.needs_group && config.group_by.length === 0) {
                            const first = fields.find((f) => f.type === 'enum' && f.group !== false) ?? fields.find((f) => f.group !== false);
                            if (first) patch.group_by = [{ field: first.key, period: '' }];
                          }
                          // Switching *to* a table reveals the column picker, so fill it.
                          if (v.key === 'table' && !config.columns.length) {
                            patch.columns = [...(source?.default_columns ?? [])];
                          }
                          set(patch);
                        }}
                        title={v.description}
                        className={clsx(
                          'flex flex-col items-center gap-1 rounded-lg border py-2 text-[11px] font-medium transition',
                          config.viz === v.key
                            ? 'border-primary-500 bg-primary-50 text-primary-600 dark:bg-primary-500/10 dark:text-primary-300'
                            : 'border-gray-200 text-gray-500 hover:bg-gray-50 dark:border-white/10 dark:text-white/60 dark:hover:bg-white/5',
                        )}
                      >
                        <Icon className="h-4 w-4" /> {v.label}
                      </button>
                    );
                  })}
                </div>
                {activeViz?.description && (
                  <p className="mt-2 text-[11px] text-gray-500 dark:text-white/45">{activeViz.description}</p>
                )}
              </StepBlock>

              {isTable ? (
                <StepBlock step={steps.find((s) => s.key === 'columns')}>
                  <p className="mb-2 text-xs text-gray-500 dark:text-white/50">
                    Tick the columns to show. These start out matching what the preview is showing.
                  </p>
                  <ColumnPicker
                    fields={fields}
                    columns={config.columns}
                    defaults={source?.default_columns ?? []}
                    onChange={(columns) => set({ columns })}
                  />
                </StepBlock>
              ) : (
                <>
                  <StepBlock step={steps.find((s) => s.key === 'group')}>
                    <GroupingEditor
                      groups={config.group_by}
                      fields={fields}
                      vocabulary={vocabulary}
                      max={config.viz === 'pivot' ? 2 : config.viz === 'kpi' ? 0 : 2}
                      onChange={(group_by) => set({ group_by })}
                    />
                    {config.viz === 'kpi' && (
                      <p className="mt-1.5 text-[11px] text-gray-500 dark:text-white/45">
                        Number tiles show one total per measure, so a grouping is optional.
                      </p>
                    )}
                  </StepBlock>

                  <StepBlock step={steps.find((s) => s.key === 'measure')}>
                    <MeasureEditor
                      metrics={config.metrics}
                      fields={fields}
                      vocabulary={vocabulary}
                      onChange={(metrics) => set({ metrics })}
                    />
                  </StepBlock>
                </>
              )}

              <StepBlock step={steps.find((s) => s.key === 'filters')}>
                <FilterGroupBuilder
                  source={config.source}
                  fields={fields}
                  vocabulary={vocabulary}
                  value={config.filters}
                  onChange={(filters) => set({ filters })}
                />
              </StepBlock>

              <StepBlock step={steps.find((s) => s.key === 'polish')}>
                <div className="space-y-3">
                  <label className="flex items-start gap-2 text-sm text-gray-700 dark:text-white/70">
                    <input
                      type="checkbox"
                      checked={!!config.totals}
                      onChange={(e) => set({ totals: e.target.checked })}
                      className="mt-0.5 h-4 w-4 rounded accent-primary-600"
                    />
                    <span>
                      Show totals
                      <span className="block text-[11px] text-gray-500 dark:text-white/45">
                        Adds a grand total row, and a subtotal per group on a matrix.
                      </span>
                    </span>
                  </label>

                  <label className="block">
                    <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-gray-400">Compare with</span>
                    <select className={clsx(input, 'w-full')} value={config.compare || ''} onChange={(e) => set({ compare: e.target.value })}>
                      {(vocabulary.compare ?? []).map((c) => (
                        <option key={c.key} value={c.key}>{c.label}</option>
                      ))}
                    </select>
                    {config.compare && !canCompare && (
                      <span className="mt-1 block text-[11px] text-amber-600 dark:text-amber-400">
                        To compare periods, either group this report by a date (for example “by month”)
                        or add a date filter using “is within”.
                      </span>
                    )}
                  </label>

                  <label className="block">
                    <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                      {isChartViz(config.viz) ? 'Show top' : 'Row limit'}
                    </span>
                    <input
                      type="number"
                      min={1}
                      className={clsx(input, 'w-28')}
                      value={config.limit ?? ''}
                      onChange={(e) => set({ limit: Number(e.target.value) || null })}
                    />
                  </label>

                  <div>
                    <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-gray-400">Colour rules</span>
                    <ConditionalFormatEditor
                      rules={config.format_rules ?? []}
                      columns={resultColumns}
                      onChange={(format_rules) => set({ format_rules })}
                    />
                  </div>
                </div>
              </StepBlock>

              <StepBlock step={steps.find((s) => s.key === 'save')}>
                <div className="space-y-3">
                  <label className="block">
                    <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-gray-400">Report name</span>
                    <input className={clsx(input, 'w-full')} value={meta.name} placeholder="e.g. Pipeline by stage" onChange={(e) => setMeta({ ...meta, name: e.target.value })} />
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-gray-400">Description (optional)</span>
                    <input className={clsx(input, 'w-full')} value={meta.description} placeholder="What question does this answer?" onChange={(e) => setMeta({ ...meta, description: e.target.value })} />
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-gray-400">Category</span>
                    <select className={clsx(input, 'w-full')} value={meta.category} onChange={(e) => setMeta({ ...meta, category: e.target.value })}>
                      {(vocabulary.categories ?? []).map((c) => (
                        <option key={c.key} value={c.key}>{c.label}</option>
                      ))}
                    </select>
                  </label>

                  <div className="border-t border-gray-100 pt-3 dark:border-white/5">
                    <span className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                      <Share2 className="h-3 w-3" /> Who can see it
                    </span>
                    <ShareSettings
                      visibility={meta.visibility}
                      sharedWith={meta.shared_with}
                      folderId={meta.folder_id}
                      folders={folders}
                      visibilities={vocabulary.visibilities ?? []}
                      onChange={(patch) => setMeta({ ...meta, ...patch })}
                    />
                  </div>
                </div>
              </StepBlock>
            </>
          )}
        </div>

        {/* Preview */}
        <div className="flex-1 overflow-auto bg-gray-50 p-6 dark:bg-[#0d1117]">
          {!config.source ? (
            <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary-500/10 text-primary-500">
                <Database className="h-7 w-7" />
              </div>
              <p className="text-sm font-medium text-gray-600 dark:text-white/60">Choose what to report on to begin</p>
              <p className="max-w-xs text-xs text-gray-400">
                Work down the steps on the left. This panel updates as you go, so you always see what you are building.
              </p>
            </div>
          ) : (
            <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-white/10 dark:bg-[#161b22]">
              <div className="mb-4 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="truncate text-base font-semibold text-gray-900 dark:text-white">{meta.name || 'Live preview'}</h2>
                  {result?.meta && (
                    <p className="text-xs text-gray-400">
                      {result.meta.row_count} row{result.meta.row_count === 1 ? '' : 's'} · from {result.meta.scanned.toLocaleString()} record{result.meta.scanned === 1 ? '' : 's'} · {result.meta.executed_ms}ms
                    </p>
                  )}
                </div>
                {isFetching && <span className="shrink-0 text-xs text-primary-500">updating…</span>}
              </div>

              {error ? (
                <div className="flex items-start gap-2 rounded-lg bg-rose-50 px-4 py-3 text-sm text-rose-600 dark:bg-rose-500/10 dark:text-rose-300">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                  {error?.response?.data?.error?.message || 'Could not run this report with these settings.'}
                </div>
              ) : !result ? (
                <div className="flex justify-center py-16"><Spinner /></div>
              ) : (
                <ReportResult
                  result={result}
                  viz={config.viz}
                  formatRules={config.format_rules}
                  config={config}
                  scope={scope}
                />
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Step shell ──────────────────────────────────────────────────────────────

function Step({ step, open, onToggle, children }) {
  if (!step) return null;
  return (
    <div className={clsx('rounded-xl border transition', open ? 'border-primary-300 dark:border-primary-500/30' : 'border-gray-200 dark:border-white/10')}>
      <button onClick={onToggle} className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left">
        <span
          className={clsx(
            'flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold',
            step.done ? 'bg-emerald-500 text-white' : 'bg-gray-200 text-gray-500 dark:bg-white/10 dark:text-white/50',
          )}
        >
          {step.done ? <Check className="h-3.5 w-3.5" /> : step.n}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium text-gray-800 dark:text-white/85">{step.title}</span>
          {step.summary && !open && (
            <span className="block truncate text-[11px] text-gray-500 dark:text-white/45">{step.summary}</span>
          )}
        </span>
        {open ? <ChevronDown className="h-4 w-4 shrink-0 text-gray-400" /> : <ChevronRight className="h-4 w-4 shrink-0 text-gray-400" />}
      </button>
      {open && <div className="border-t border-gray-100 p-3 dark:border-white/5">{children}</div>}
    </div>
  );
}

function ColumnPicker({ fields, columns, defaults = [], onChange }) {
  const toggle = (key) =>
    onChange(columns.includes(key) ? columns.filter((c) => c !== key) : [...columns, key]);
  const isDefault = defaults.length > 0
    && columns.length === defaults.length
    && defaults.every((k) => columns.includes(k));

  // Own fields first, then one section per related object / roll-up collection, so a
  // long list stays scannable once two-hop paths are in play.
  const groups = fields.reduce((acc, f) => {
    const key = f.relation_label || 'This record';
    (acc[key] ||= []).push(f);
    return acc;
  }, {});

  return (
    <div className="space-y-2">
      {Object.entries(groups).map(([groupLabel, list]) => (
        <div key={groupLabel}>
          <p className="mb-0.5 text-[10px] font-semibold uppercase tracking-wider text-gray-400">{groupLabel}</p>
          {list.map((f) => (
            <label key={f.key} className="flex items-center gap-2 rounded px-1 py-0.5 text-sm text-gray-700 hover:bg-gray-50 dark:text-white/70 dark:hover:bg-white/5">
              <input type="checkbox" checked={columns.includes(f.key)} onChange={() => toggle(f.key)} className="h-4 w-4 rounded accent-primary-600" />
              {f.relation_label
                ? (f.label.slice(f.relation_label.length + 3) || f.relation_label)
                : f.label}
            </label>
          ))}
        </div>
      ))}
      {columns.length === 0 && (
        <p className="rounded-lg bg-amber-50 px-2 py-1.5 text-[11px] text-amber-700 dark:bg-amber-500/10 dark:text-amber-300">
          Nothing ticked — the report falls back to the standard columns.
        </p>
      )}
      {!isDefault && defaults.length > 0 && (
        <button
          onClick={() => onChange([...defaults])}
          className="flex items-center gap-1 text-[11px] text-gray-400 hover:text-primary-600"
        >
          <RotateCcw className="h-3 w-3" /> Reset to the standard columns
        </button>
      )}
    </div>
  );
}

// ── helpers ─────────────────────────────────────────────────────────────────

function polishSummary(config) {
  const bits = [];
  if (config.totals) bits.push('totals');
  if (config.compare) bits.push('comparison');
  if (config.format_rules?.length) bits.push(`${config.format_rules.length} colour rule${config.format_rules.length > 1 ? 's' : ''}`);
  return bits.length ? bits.join(' · ') : 'None';
}

/**
 * Can a period comparison be worked out for this config? Mirrors the engine's rule:
 * either the filters bound a date on both sides, or the report is grouped by a date
 * period (which already states the period). Only when neither holds is the hint shown.
 */
const sourceFieldsFor = (sources, key) => sources.find((s) => s.key === key)?.fields ?? [];

/**
 * A table report with no chosen columns renders the source's default set. Seed those
 * into the config so "Which columns?" ticks exactly what the preview shows — leaving
 * it empty made the picker disagree with the result the user was looking at.
 */
export function withSeededColumns(config, sources) {
  if (config.viz !== 'table' || config.columns?.length) return config;
  const defaults = sources.find((s) => s.key === config.source)?.default_columns;
  return defaults?.length ? { ...config, columns: [...defaults] } : config;
}

function canCompareConfig(config, fields = []) {
  const typeOf = (key) => fields.find((f) => f.key === key)?.type;
  const hasWindow = (node) => normalizeFilters(node).conditions.some((c) => (
    c.conditions
      ? hasWindow(c)
      : (c.op === 'date_range' || c.op === 'between') && typeOf(c.field) === 'date'
  ));
  const hasDateGrouping = (config.group_by || []).some(
    (g) => typeOf(g.field) === 'date' && g.period && !g.buckets?.length,
  );
  return hasWindow(config.filters) || hasDateGrouping;
}
