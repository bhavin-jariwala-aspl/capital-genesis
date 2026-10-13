import { useState, useMemo, useEffect } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  BarChart3, Plus, Table, LineChart, PieChart, Gauge, Grid3x3, ArrowLeft, Download,
  Pencil, Trash2, RefreshCw, FileBarChart, Clock, Star, Search, Folder, FolderPlus,
  Mail, Copy, Printer, FileSpreadsheet, MoreHorizontal, Inbox, X, Check, Sparkles,
} from 'lucide-react';
import clsx from 'clsx';
import { reportService, downloadBlob, openPrintView } from '../../services/report.service';
import { useAuthStore } from '../../store/authStore';
import ReportResult from '../../components/runtime/ReportResult';
import SubscribeModal from '../../components/reports/SubscribeModal';
import ParameterBar from '../../components/reports/ParameterBar';
import InsightsPanel from '../../components/reports/InsightsPanel';
import TrendStrip from '../../components/reports/TrendStrip';
import AskPanel from '../../components/reports/AskPanel';
import Spinner from '../../components/ui/Spinner';
import Modal from '../../components/ui/Modal';
import Button from '../../components/ui/Button';
import { confirmDialog } from '../../utils/dialog';

const VIZ_ICON = {
  table: Table, bar: BarChart3, line: LineChart, area: LineChart, pie: PieChart,
  donut: PieChart, funnel: BarChart3, kpi: Gauge, pivot: Grid3x3, chart: BarChart3, summary: Gauge,
};
const CAT_COLOR = {
  sales: 'bg-primary-500/10 text-primary-600 dark:text-primary-300',
  support: 'bg-sky-500/10 text-sky-600 dark:text-sky-300',
  finance: 'bg-amber-500/10 text-amber-600 dark:text-amber-300',
  productivity: 'bg-violet-500/10 text-violet-600 dark:text-violet-300',
  custom: 'bg-slate-500/10 text-slate-600 dark:text-slate-300',
};
const SCOPES = [['me', 'Mine', 99], ['team', 'My team', 4], ['all', 'Everyone', 3]];

/**
 * ReportsPage — the report library, and the viewer for a single report.
 *
 * The library is organised the way a growing collection needs to be: folders a
 * user creates themselves, personal favourites, a search box, and filters for
 * "mine" vs everything shared with me. Everything a business user needs after
 * building a report — run it, share it, schedule it, export it, copy it — is
 * reachable from here without an administrator.
 */
export default function ReportsPage() {
  const [params, setParams] = useSearchParams();
  const openedId = params.get('opened');
  const [selected, setSelected] = useState(null);
  const [folderId, setFolderId] = useState(undefined);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all'); // all | mine | favorites
  const [newFolder, setNewFolder] = useState(false);
  const [asking, setAsking] = useState(params.get('ask') === '1');
  const qc = useQueryClient();
  const level = useAuthStore((s) => s.employee?.role_level ?? 5);

  // "Ask" appears only when the server has the AI layer switched on.
  const { data: aiStatusData } = useQuery({ queryKey: ['ai-status'], queryFn: reportService.aiStatus, staleTime: 60_000, retry: false });
  const aiEnabled = !!(aiStatusData?.data ?? aiStatusData)?.enabled;

  const listParams = {
    ...(folderId === undefined ? {} : { folder_id: folderId === null ? 'none' : folderId }),
    ...(search.trim() ? { search: search.trim() } : {}),
    ...(filter === 'mine' ? { mine: 'true' } : {}),
    ...(filter === 'favorites' ? { favorites: 'true' } : {}),
  };

  const { data, isLoading } = useQuery({
    queryKey: ['reports', listParams],
    queryFn: () => reportService.list(listParams),
  });
  const reports = useMemo(() => data?.data ?? data ?? [], [data]);

  const { data: foldersData } = useQuery({ queryKey: ['report-folders'], queryFn: reportService.listFolders });
  const folders = foldersData?.data ?? foldersData ?? [];

  const favMut = useMutation({
    mutationFn: ({ id, on }) => reportService.setFavorite(id, on),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['reports'] }),
  });
  const folderMut = useMutation({
    mutationFn: (name) => reportService.createFolder({ name }),
    onSuccess: () => { setNewFolder(false); qc.invalidateQueries({ queryKey: ['report-folders'] }); },
  });
  const deleteFolderMut = useMutation({
    mutationFn: (id) => reportService.deleteFolder(id),
    onSuccess: () => { setFolderId(undefined); qc.invalidateQueries({ queryKey: ['report-folders'] }); qc.invalidateQueries({ queryKey: ['reports'] }); },
  });

  // A freshly-saved report opens straight into its viewer. Done in an effect
  // rather than during render, so React is not asked to set state mid-render.
  useEffect(() => {
    if (!openedId || selected) return;
    const justSaved = reports.find((r) => String(r.id) === openedId);
    if (!justSaved) return;
    setSelected(justSaved);
    setParams({}, { replace: true });
  }, [openedId, reports, selected, setParams]);

  if (selected) {
    return <ReportViewer report={selected} onBack={() => setSelected(null)} />;
  }

  const byCat = reports.reduce((m, r) => { (m[r.category] ||= []).push(r); return m; }, {});

  return (
    <div className="flex h-full overflow-hidden">
      {/* Folder rail */}
      <aside className="w-56 shrink-0 overflow-y-auto border-r border-gray-200 p-3 dark:border-white/10">
        <p className="mb-1.5 px-1 text-[10px] font-semibold uppercase tracking-widest text-gray-400">Library</p>
        <RailItem icon={FileBarChart} label="All reports" active={!asking && folderId === undefined && filter === 'all'} onClick={() => { setAsking(false); setFolderId(undefined); setFilter('all'); }} />
        <RailItem icon={Star} label="Favourites" active={!asking && filter === 'favorites'} onClick={() => { setAsking(false); setFolderId(undefined); setFilter('favorites'); }} />
        <RailItem icon={Pencil} label="Created by me" active={!asking && filter === 'mine'} onClick={() => { setAsking(false); setFolderId(undefined); setFilter('mine'); }} />
        {aiEnabled && (
          <RailItem icon={Sparkles} label="Ask Genesis" active={asking} onClick={() => setAsking(true)} accent />
        )}

        <p className="mb-1.5 mt-4 flex items-center justify-between px-1 text-[10px] font-semibold uppercase tracking-widest text-gray-400">
          Folders
          <button onClick={() => setNewFolder(true)} aria-label="New folder" className="rounded p-0.5 text-gray-400 hover:text-primary-600">
            <FolderPlus className="h-3.5 w-3.5" />
          </button>
        </p>

        {newFolder && (
          <div className="mb-1 flex items-center gap-1 px-1">
            <input
              autoFocus
              className="min-w-0 flex-1 rounded border border-gray-200 px-1.5 py-1 text-xs dark:border-white/10 dark:bg-white/5 dark:text-white"
              placeholder="Folder name"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && e.currentTarget.value.trim()) folderMut.mutate(e.currentTarget.value.trim());
                if (e.key === 'Escape') setNewFolder(false);
              }}
            />
            <button onClick={() => setNewFolder(false)} aria-label="Cancel" className="text-gray-400 hover:text-rose-500"><X className="h-3.5 w-3.5" /></button>
          </div>
        )}

        {folders.map((f) => (
          <div key={f.id} className="group relative">
            <RailItem
              icon={Folder}
              label={f.name}
              badge={f.report_count}
              active={!asking && folderId === f.id}
              onClick={() => { setAsking(false); setFolderId(f.id); setFilter('all'); }}
            />
            <button
              onClick={async (e) => {
                e.stopPropagation();
                if (await confirmDialog({
                  title: 'Delete folder',
                  message: `“${f.name}” will be removed. The reports inside it are kept and become uncategorised.`,
                  confirmLabel: 'Delete folder',
                })) {
                  deleteFolderMut.mutate(f.id);
                }
              }}
              aria-label={`Delete folder ${f.name}`}
              className="absolute right-1 top-1.5 hidden rounded p-1 text-gray-400 hover:text-rose-500 group-hover:block"
            >
              <Trash2 className="h-3 w-3" />
            </button>
          </div>
        ))}
        <RailItem icon={Inbox} label="Uncategorised" active={!asking && folderId === null} onClick={() => { setAsking(false); setFolderId(null); setFilter('all'); }} />
      </aside>

      {/* Main */}
      {asking ? (
        <div className="flex-1 overflow-hidden">
          <AskPanel
            scope={level <= 3 ? 'all' : level <= 4 ? 'team' : 'me'}
            onBack={() => setAsking(false)}
          />
        </div>
      ) : (
      <div className="flex-1 overflow-auto">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-200 px-6 py-4 dark:border-white/10">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-primary-500 to-mid-600 text-on-primary">
              <FileBarChart className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-lg font-semibold text-gray-900 dark:text-white">Reports</h1>
              <p className="text-xs text-gray-500 dark:text-white/50">Build, share and schedule your own reports — no help needed</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-gray-400" />
              <input
                className="w-56 rounded-lg border border-gray-200 bg-white py-2 pl-8 pr-3 text-sm text-gray-900 focus:border-primary-500 focus:outline-none dark:border-white/10 dark:bg-white/5 dark:text-white"
                placeholder="Search reports…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <Link to="/reports/new" className="flex items-center gap-1.5 rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-on-primary hover:bg-primary-700">
              <Plus className="h-4 w-4" /> New report
            </Link>
          </div>
        </div>

        {isLoading ? (
          <div className="flex justify-center p-16"><Spinner /></div>
        ) : reports.length === 0 ? (
          <EmptyLibrary filter={filter} search={search} />
        ) : (
          <div className="space-y-6 p-6">
            {Object.entries(byCat).map(([cat, list]) => (
              <div key={cat}>
                <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">{cat}</h2>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                  {list.map((r) => (
                    <ReportCard
                      key={r.id}
                      report={r}
                      onOpen={() => setSelected(r)}
                      onToggleFavorite={() => favMut.mutate({ id: r.id, on: !r.is_favorite })}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      )}
    </div>
  );
}

function RailItem({ icon: Icon, label, badge, active, onClick, accent = false }) {
  return (
    <button
      onClick={onClick}
      className={clsx(
        'flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm transition',
        active
          ? 'bg-primary-50 font-medium text-primary-700 dark:bg-primary-500/10 dark:text-primary-300'
          : accent
            ? 'text-violet-700 hover:bg-violet-50 dark:text-violet-300 dark:hover:bg-violet-500/10'
            : 'text-gray-600 hover:bg-gray-50 dark:text-white/60 dark:hover:bg-white/5',
      )}
    >
      <Icon className="h-3.5 w-3.5 shrink-0" />
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {badge > 0 && <span className="shrink-0 text-[10px] text-gray-400">{badge}</span>}
    </button>
  );
}

function EmptyLibrary({ filter, search }) {
  const message = search
    ? `Nothing matches “${search}”.`
    : filter === 'favorites'
      ? 'No favourites yet — star a report to keep it here.'
      : filter === 'mine'
        ? 'You have not created a report yet.'
        : 'No reports yet.';
  return (
    <div className="flex flex-col items-center justify-center gap-3 p-20 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary-500/10 text-primary-500">
        <FileBarChart className="h-7 w-7" />
      </div>
      <p className="text-sm font-medium text-gray-700 dark:text-white/70">{message}</p>
      <p className="max-w-sm text-xs text-gray-400">
        Start from a ready-made report — pipeline by stage, cases by status, revenue by owner — and change anything you like.
      </p>
      <Link to="/reports/new" className="mt-1 rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-on-primary hover:bg-primary-700">
        Browse report templates
      </Link>
    </div>
  );
}

function ReportCard({ report, onOpen, onToggleFavorite }) {
  const Icon = VIZ_ICON[report.config?.viz] || VIZ_ICON[report.report_type] || Table;
  return (
    <div className="group relative flex flex-col rounded-2xl border border-gray-200 bg-white p-4 transition hover:border-primary-300 hover:shadow-md dark:border-white/10 dark:bg-[#161b22] dark:hover:border-primary-500/40">
      <button onClick={onOpen} className="flex-1 text-left">
        <div className="flex items-start justify-between gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary-500/10 text-primary-500">
            <Icon className="h-5 w-5" />
          </span>
          <span className={clsx('rounded px-1.5 py-0.5 text-[10px] font-medium capitalize', CAT_COLOR[report.category] || CAT_COLOR.custom)}>
            {report.category}
          </span>
        </div>
        <p className="mt-2.5 truncate text-sm font-semibold text-gray-900 dark:text-white">{report.name}</p>
        <p className="mt-0.5 line-clamp-2 text-xs text-gray-400">
          {report.description || `${report.config?.source || ''} report`}
        </p>
      </button>

      <div className="mt-2 flex items-center gap-2 text-[10px] text-gray-400">
        {report.last_run_at && (
          <span className="flex items-center gap-1"><Clock className="h-3 w-3" /> ran {new Date(report.last_run_at).toLocaleDateString()}</span>
        )}
        {report.is_scheduled && (
          <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400" title="This report is emailed on a schedule">
            <Mail className="h-3 w-3" /> scheduled
          </span>
        )}
      </div>

      <button
        onClick={onToggleFavorite}
        aria-label={report.is_favorite ? 'Remove from favourites' : 'Add to favourites'}
        className={clsx(
          'absolute right-2 top-2 rounded p-1 transition',
          report.is_favorite
            ? 'text-amber-500'
            : 'text-gray-300 opacity-0 hover:text-amber-500 group-hover:opacity-100 dark:text-white/20',
        )}
      >
        <Star className={clsx('h-4 w-4', report.is_favorite && 'fill-current')} />
      </button>
    </div>
  );
}

// ── Viewer ──────────────────────────────────────────────────────────────────

function ReportViewer({ report, onBack }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const level = useAuthStore((s) => s.employee?.role_level ?? 5);
  const employeeId = useAuthStore((s) => s.employee?.employee_id);
  const [scope, setScope] = useState('all');
  const [params, setParams] = useState({}); // answers to the report's prompted filters
  const [subscribing, setSubscribing] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [explanation, setExplanation] = useState(null);
  const [explaining, setExplaining] = useState(false);

  const viz = report.config?.viz || (report.report_type === 'chart' ? 'bar' : report.report_type) || 'table';
  const canEdit = report.created_by === employeeId || level <= 3;
  const hasParams = Object.keys(params).length > 0;

  const { data, isFetching, refetch, error } = useQuery({
    queryKey: ['report-run', report.id, scope, params],
    queryFn: () => reportService.runSaved(report.id, scope, hasParams ? params : undefined),
    retry: false,
  });
  const result = data?.data ?? data;

  const { data: vocabData } = useQuery({
    queryKey: ['report-vocabulary'], queryFn: reportService.getVocabulary, staleTime: Infinity,
  });
  const vocabulary = vocabData?.data ?? vocabData ?? {};

  // Trend history is the report's own numbers, so it is refreshed after each plain run.
  const { data: snapData } = useQuery({
    queryKey: ['report-snapshots', report.id, scope, data?.data?.meta?.generated_at ?? null],
    queryFn: () => reportService.snapshots(report.id, scope),
    enabled: !!result && !hasParams,
    staleTime: 60_000,
  });
  const history = snapData?.data ?? snapData ?? null;

  const { data: aiStatusData } = useQuery({ queryKey: ['ai-status'], queryFn: reportService.aiStatus, staleTime: 60_000, retry: false });
  const aiStatus = aiStatusData?.data ?? aiStatusData ?? null;

  const explain = async () => {
    if (!result) return;
    setExplaining(true);
    try {
      const res = await reportService.explain(report.name, result, scope);
      const out = res?.data ?? res;
      setExplanation(out?.narrative ? { text: out.narrative, grounded: out.grounded !== false } : null);
    } catch (e) {
      setExplanation({ text: e?.response?.data?.error?.message || 'The AI could not explain this report right now.', grounded: true });
    } finally {
      setExplaining(false);
    }
  };

  const del = useMutation({
    mutationFn: () => reportService.remove(report.id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['reports'] }); onBack(); },
  });
  const dup = useMutation({
    mutationFn: () => reportService.duplicate(report.id),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['reports'] });
      const copy = res?.data ?? res;
      if (copy?.id) navigate(`/reports/${copy.id}/edit`);
    },
  });

  const exportAs = async (format) => {
    setExporting(true);
    try {
      const blob = await reportService.exportSaved(report.id, { format, scope, params: hasParams ? params : undefined });
      downloadBlob(blob, `${report.name.replace(/[^\w -]/g, '')}.${format}`);
    } finally {
      setExporting(false);
    }
  };

  const scopes = SCOPES.filter(([, , min]) => level <= min);

  return (
    <div className="h-full overflow-auto bg-gray-50 dark:bg-[#0d1117]">
      <div className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-3 border-b border-gray-200 bg-white/80 px-6 py-4 backdrop-blur dark:border-white/10 dark:bg-[#161b22]/80">
        <div className="flex min-w-0 items-center gap-3">
          <button onClick={onBack} aria-label="Back" className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 dark:hover:bg-white/10">
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div className="min-w-0">
            <h1 className="truncate text-lg font-semibold text-gray-900 dark:text-white">{report.name}</h1>
            <p className="truncate text-xs text-gray-500 dark:text-white/50">
              {report.description || `${report.config?.source} · ${viz}`}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {scopes.length > 1 && (
            <div className="flex rounded-lg border border-gray-200 p-0.5 dark:border-white/10">
              {scopes.map(([k, l]) => (
                <button
                  key={k}
                  onClick={() => setScope(k)}
                  className={clsx(
                    'rounded-md px-2.5 py-1.5 text-xs font-medium',
                    scope === k ? 'bg-primary-600 text-on-primary' : 'text-gray-500 hover:bg-gray-100 dark:text-white/60 dark:hover:bg-white/10',
                  )}
                >
                  {l}
                </button>
              ))}
            </div>
          )}

          <IconAction onClick={() => refetch()} label="Refresh">
            <RefreshCw className={clsx('h-4 w-4', isFetching && 'animate-spin')} />
          </IconAction>

          <div className="flex rounded-lg border border-gray-200 dark:border-white/10">
            <button onClick={() => exportAs('csv')} disabled={exporting} title="Download as CSV"
              className="flex items-center gap-1 rounded-l-lg px-2.5 py-2 text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-40 dark:text-white/70 dark:hover:bg-white/5">
              <Download className="h-3.5 w-3.5" /> CSV
            </button>
            <button onClick={() => exportAs('xlsx')} disabled={exporting} title="Download as an Excel workbook"
              className="flex items-center gap-1 border-l border-gray-200 px-2.5 py-2 text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-40 dark:border-white/10 dark:text-white/70 dark:hover:bg-white/5">
              <FileSpreadsheet className="h-3.5 w-3.5" /> Excel
            </button>
            <button type="button" onClick={() => openPrintView(report.id, scope, hasParams ? params : undefined)} title="Open a print view — use your browser's Save as PDF"
              className="flex items-center gap-1 rounded-r-lg border-l border-gray-200 px-2.5 py-2 text-xs font-medium text-gray-600 hover:bg-gray-50 dark:border-white/10 dark:text-white/70 dark:hover:bg-white/5">
              <Printer className="h-3.5 w-3.5" /> PDF
            </button>
          </div>

          <button
            onClick={() => setSubscribing(true)}
            className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 dark:border-white/10 dark:text-white/70 dark:hover:bg-white/5"
          >
            <Mail className="h-4 w-4" /> Email me this
          </button>

          <IconAction onClick={() => dup.mutate()} label="Save as a copy"><Copy className="h-4 w-4" /></IconAction>
          <IconAction onClick={() => setShowHistory(true)} label="Run history"><MoreHorizontal className="h-4 w-4" /></IconAction>

          {canEdit && (
            <>
              <button
                onClick={() => navigate(`/reports/${report.id}/edit`)}
                className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 dark:border-white/10 dark:text-white/70 dark:hover:bg-white/5"
              >
                <Pencil className="h-4 w-4" /> Edit
              </button>
              <IconAction
                onClick={async () => (await confirmDialog({ title: 'Delete report', message: `“${report.name}” will be permanently removed. This cannot be undone.`, confirmLabel: 'Delete' })) && del.mutate()}
                label="Delete"
                danger
              >
                <Trash2 className="h-4 w-4" />
              </IconAction>
            </>
          )}
        </div>
      </div>

      <div className="p-6">
        <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-white/10 dark:bg-[#161b22]">
          {result?.meta && (
            <p className="mb-4 text-xs text-gray-400">
              {result.meta.row_count} row{result.meta.row_count === 1 ? '' : 's'} · {result.meta.executed_ms}ms
              {' · '}generated {new Date(result.meta.generated_at).toLocaleString()}
            </p>
          )}
          {result?.meta?.parameters?.length > 0 && (
            <ParameterBar
              parameters={result.meta.parameters}
              values={params}
              datePresets={vocabulary.date_presets ?? []}
              onApply={(next) => { setExplanation(null); setParams(next); }}
            />
          )}
          {isFetching && !result ? (
            <div className="flex justify-center py-16"><Spinner /></div>
          ) : error ? (
            <div className="rounded-lg bg-rose-50 px-4 py-3 text-sm text-rose-600 dark:bg-rose-500/10 dark:text-rose-300">
              {error?.response?.data?.error?.message || 'Could not run this report.'}
            </div>
          ) : (
            <>
              <ReportResult
                result={result}
                viz={viz}
                height={420}
                formatRules={report.config?.format_rules}
                config={report.config}
                scope={scope}
              />
              <InsightsPanel
                insights={result?.insights ?? []}
                narrative={explanation}
                aiAvailable={!!aiStatus?.enabled}
                onExplain={explain}
                explaining={explaining}
              />
              {history?.enough && <TrendStrip history={history} />}
            </>
          )}
        </div>
      </div>

      {subscribing && (
        <SubscribeModal report={report} schedule={vocabulary.schedule} result={result} onClose={() => setSubscribing(false)} />
      )}
      {showHistory && <HistoryModal report={report} onClose={() => setShowHistory(false)} />}
    </div>
  );
}

function IconAction({ onClick, label, danger, children }) {
  return (
    <button
      onClick={onClick}
      title={label}
      aria-label={label}
      className={clsx(
        'rounded-lg border border-gray-200 p-2 dark:border-white/10',
        danger
          ? 'text-gray-400 hover:bg-rose-50 hover:text-rose-500 dark:hover:bg-rose-500/10'
          : 'text-gray-500 hover:bg-gray-50 dark:text-white/60 dark:hover:bg-white/5',
      )}
    >
      {children}
    </button>
  );
}

function HistoryModal({ report, onClose }) {
  const { data, isPending } = useQuery({
    queryKey: ['report-history', report.id],
    queryFn: () => reportService.history(report.id),
  });
  const rows = data?.data ?? data ?? [];

  return (
    <Modal
      isOpen
      onClose={onClose}
      size="lg"
      icon={Clock}
      eyebrow="Run history"
      title={report.name}
      subtitle="The last 25 times this report ran, including scheduled deliveries."
      footer={<div className="flex justify-end"><Button variant="ghost" size="sm" onClick={onClose}>Close</Button></div>}
    >
      {isPending ? (
        <div className="flex justify-center py-8"><Spinner /></div>
      ) : rows.length === 0 ? (
        <p className="py-6 text-center text-sm text-gray-500 dark:text-white/50">This report has not been run yet.</p>
      ) : (
        <div className="divide-y divide-gray-100 dark:divide-white/5">
          {rows.map((x) => (
            <div key={x.id} className="flex items-center justify-between gap-3 py-2 text-sm">
              <span className="text-gray-700 dark:text-white/70">{new Date(x.executed_at).toLocaleString()}</span>
              <span className="text-xs text-gray-400">
                {x.executed_by ? `by ${x.executed_by}` : 'scheduled'} · {x.result_rows ?? 0} rows · {x.execution_time}ms
              </span>
              <span
                className={clsx('flex items-center gap-1 text-xs font-medium', x.status === 'success' ? 'text-emerald-600 dark:text-emerald-400' : x.status === 'skipped' ? 'text-gray-400' : 'text-rose-600 dark:text-rose-400')}
                title={x.status === 'skipped' ? 'The alert condition was not met, so nothing was emailed.' : undefined}
              >
                {x.status === 'success' ? <Check className="h-3 w-3" /> : x.status === 'skipped' ? <Clock className="h-3 w-3" /> : <X className="h-3 w-3" />}
                {x.status === 'skipped' ? 'not sent' : x.status}
              </span>
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}
