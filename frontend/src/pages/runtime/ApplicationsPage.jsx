import { useState, useEffect, useCallback, useMemo } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation } from '@tanstack/react-query';
import {
  Eye, RefreshCw, XCircle, Search,
  ClipboardList, CheckCircle2, Stethoscope, Plus, ArrowRight, ArrowLeft,
  ShieldCheck, FileCheck, AlertCircle, FolderOpen, FileText, Mail,
} from 'lucide-react';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import Select from '../../components/ui/Select';
import Badge from '../../components/ui/Badge';
import DataTable from '../../components/ui/DataTable';
import Modal from '../../components/ui/Modal';
import StatusStepper from '../../components/ui/StatusStepper';
import PageHeader from '../../components/ui/PageHeader';
import PDFViewer from '../../components/runtime/PDFViewer';
import { insuranceService } from '../../services/insurance.service';
import { useResolvedObject } from '../../hooks/useResolvedObject';
import api from '../../services/api';
import { fmtCurrency as fmt, fmtDate, contactName } from '../../utils/formatters';
import { showError, showWarning } from '../../utils/dialog';

/* ── Static fallbacks (used only when metadata is unavailable) ── */

const STATUS_VARIANT = {
  submitted: 'info', under_review: 'purple', approved: 'success',
  declined: 'danger', withdrawn: 'default', pending_medical: 'warning', issued: 'success',
};

const FALLBACK_STATUS_OPTIONS = [
  { value: 'submitted',       label: 'Submitted',       color: '#6366f1' },
  { value: 'under_review',    label: 'Under Review',    color: '#3b82f6' },
  { value: 'pending_medical', label: 'Pending Medical', color: '#f59e0b' },
  { value: 'approved',        label: 'Approved',        color: '#10b981' },
  { value: 'declined',        label: 'Declined',        color: '#ef4444' },
  { value: 'withdrawn',       label: 'Withdrawn',       color: '#6b7280' },
  { value: 'issued',          label: 'Issued',          color: '#8b5cf6' },
];

const FALLBACK_PRODUCT_OPTIONS = [
  { value: 'term_life', label: 'Term Life' },
  { value: 'whole_life', label: 'Whole Life' },
  { value: 'universal_life', label: 'Universal Life' },
  { value: 'variable_life', label: 'Variable Life' },
  { value: 'iul', label: 'Indexed UL' },
  { value: 'final_expense', label: 'Final Expense' },
];

/* ── Helpers ──────────────────────────────────────────────── */

/** Build a lookup map from metadata options: value → label */
function buildLabelMap(options) {
  const map = {};
  for (const o of options) map[o.value] = o.label;
  return map;
}

/** Resolve a status value's display variant from its metadata color */
function variantFromColor(color) {
  if (!color) return 'default';
  if (color.includes('10b981') || color.includes('green')) return 'success';
  if (color.includes('ef4444') || color.includes('red'))   return 'danger';
  if (color.includes('f59e0b') || color.includes('amber')) return 'warning';
  if (color.includes('8b5cf6') || color.includes('purple')) return 'purple';
  if (color.includes('6366f1') || color.includes('indigo')) return 'info';
  if (color.includes('3b82f6') || color.includes('blue'))  return 'info';
  return 'default';
}


const ARTIFACT_TYPES = [
  { value: 'soa', label: 'Scope of Appointment' },
  { value: 'consent', label: 'Consent to Contact' },
  { value: 'attestation', label: 'Attestation' },
  { value: 'esign', label: 'E-Signature' },
  { value: 'disclosure', label: 'Disclosure' },
];

/* ── Create modal (metadata-driven) ─────────────────────── */

function CreateAppModal({ open, onClose, onCreate, productOptions }) {
  const [form, setForm] = useState({ product_type: '', coverage_amount: '', age: '', is_smoker: false, notes: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  // Default to first product option when available
  useEffect(() => {
    if (productOptions.length > 0 && !form.product_type) {
      set('product_type', productOptions[0].value);
    }
  }, [productOptions, form.product_type]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.coverage_amount) { setError('Coverage amount is required.'); return; }
    setSaving(true); setError('');
    try {
      const created = await insuranceService.createApplication(form);
      onCreate(created?.data ?? created);
      onClose();
      setForm({ product_type: productOptions[0]?.value ?? '', coverage_amount: '', age: '', is_smoker: false, notes: '' });
    } catch (err) {
      setError(err?.response?.data?.message ?? err.message ?? 'Failed to create application');
    } finally { setSaving(false); }
  };

  return (
    <Modal open={open} onClose={onClose} title="New Application" size="md">
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && <p className="rounded-lg bg-red-50 dark:bg-red-500/10 px-3 py-2 text-sm text-red-600">{error}</p>}
        <div className="grid grid-cols-2 gap-4">
          <Select label="Product Type *" value={form.product_type}
            onChange={e => set('product_type', e.target.value)}
            options={productOptions} />
          <div>
            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Coverage Amount *</label>
            <input type="number" className="input w-full" placeholder="500000" value={form.coverage_amount} onChange={e => set('coverage_amount', e.target.value)} />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Applicant Age</label>
            <input type="number" className="input w-full" placeholder="35" value={form.age} onChange={e => set('age', e.target.value)} />
          </div>
          <div className="flex items-center gap-2 pt-4">
            <input type="checkbox" id="smoker" checked={form.is_smoker} onChange={e => set('is_smoker', e.target.checked)} />
            <label htmlFor="smoker" className="text-sm text-gray-700 dark:text-gray-300">Smoker</label>
          </div>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Notes</label>
          <textarea className="input w-full h-20 resize-none" placeholder="Notes…" value={form.notes} onChange={e => set('notes', e.target.value)} />
        </div>
        <div className="flex justify-end gap-2 pt-2 border-t border-gray-100 dark:border-white/[0.07]">
          <Button type="button" variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="primary" size="sm" disabled={saving}>{saving ? 'Saving…' : 'Submit Application'}</Button>
        </div>
      </form>
    </Modal>
  );
}

/* ── Pipeline bar (metadata-driven) ─────────────────────── */

function PipelineBar({ applications, statusOptions }) {
  const counts = {};
  statusOptions.forEach(s => { counts[s.value] = 0; });
  applications.forEach(a => { if (counts[a.status] !== undefined) counts[a.status]++; });

  return (
    <StatusStepper
      stages={statusOptions}
      variant="bar"
      showCounts={counts}
    />
  );
}

/* ── Compliance & Submission Section ─────────────────────── */

function ComplianceSection({ applicationId }) {
  const [checklist, setChecklist] = useState([]);
  const [compliance, setCompliance] = useState([]);
  const [readiness, setReadiness] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showAddCompliance, setShowAddCompliance] = useState(false);
  const [newArtifact, setNewArtifact] = useState({ artifact_type: 'soa' });

  const loadData = useCallback(async () => {
    if (!applicationId) return;
    setLoading(true);
    try {
      const [clRes, compRes, rdRes] = await Promise.all([
        insuranceService.getChecklist(applicationId).catch(() => ({ data: [] })),
        insuranceService.listCompliance({ application_id: applicationId }).catch(() => ({ data: { artifacts: [] } })),
        insuranceService.getSubmissionReadiness(applicationId).catch(() => ({ data: null })),
      ]);
      setChecklist(clRes?.data ?? clRes ?? []);
      setCompliance(compRes?.data?.artifacts ?? compRes?.artifacts ?? []);
      setReadiness(rdRes?.data ?? rdRes);
    } catch { /* ignore */ }
    setLoading(false);
  }, [applicationId]);

  useEffect(() => { loadData(); }, [loadData]);

  const handleAddArtifact = async () => {
    try {
      await insuranceService.createCompliance({ ...newArtifact, application_id: applicationId });
      setShowAddCompliance(false);
      setNewArtifact({ artifact_type: 'soa' });
      loadData();
    } catch (err) { showError(err?.response?.data?.message ?? 'Failed to create artifact'); }
  };

  const handleCompleteArtifact = async (id) => {
    try {
      await insuranceService.updateCompliance(id, { status: 'completed' });
      loadData();
    } catch (err) { showError(err?.message ?? 'Failed'); }
  };

  const handleUpdateChecklist = async (id, status) => {
    try {
      await insuranceService.updateChecklistItem(id, { status });
      loadData();
    } catch (err) { showError(err?.message ?? 'Failed'); }
  };

  if (loading) return <div className="text-xs text-gray-400 py-3">Loading compliance data...</div>;

  return (
    <div className="space-y-4">
      {/* Submission Readiness */}
      {readiness && (
        <div className="rounded-xl border border-blue-100 bg-blue-50 px-4 py-3">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <FileCheck className="h-4 w-4 text-blue-600" />
              <p className="text-xs font-semibold text-blue-700 uppercase tracking-wide">Submission Readiness</p>
            </div>
            <Badge variant={readiness.ready ? 'success' : 'warning'}>
              {readiness.ready ? 'Ready to Submit' : `${readiness.pending} items pending`}
            </Badge>
          </div>
          <div className="w-full bg-blue-200 rounded-full h-2">
            <div className="bg-blue-600 h-2 rounded-full transition-all"
              style={{ width: `${readiness.required > 0 ? (readiness.completed / readiness.required) * 100 : 0}%` }} />
          </div>
          <p className="text-xs text-blue-600 mt-1">{readiness.completed} of {readiness.required} required items complete</p>
        </div>
      )}

      {/* Checklist Items */}
      {checklist.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">Submission Checklist</p>
          <div className="space-y-1.5">
            {checklist.map(item => (
              <div key={item.id} className="flex items-center justify-between px-3 py-2 rounded-lg bg-gray-50 dark:bg-white/5 border border-gray-100 dark:border-white/[0.07]">
                <div className="flex items-center gap-2">
                  {item.status === 'received' ? <CheckCircle2 className="h-4 w-4 text-emerald-500" /> :
                   item.status === 'waived' ? <XCircle className="h-4 w-4 text-gray-400" /> :
                   <AlertCircle className="h-4 w-4 text-amber-500" />}
                  <span className="text-sm text-gray-700 dark:text-gray-300">{item.item_name}</span>
                  {item.is_required && <span className="text-[10px] text-red-400 font-medium">Required</span>}
                </div>
                {item.status === 'pending' && (
                  <div className="flex gap-1">
                    <Button size="xs" variant="secondary" onClick={() => handleUpdateChecklist(item.id, 'received')}>Received</Button>
                    <Button size="xs" variant="ghost" onClick={() => handleUpdateChecklist(item.id, 'waived')}>Waive</Button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Compliance Artifacts */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-purple-600" />
            <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Compliance Artifacts</p>
          </div>
          <Button size="xs" variant="secondary" onClick={() => setShowAddCompliance(!showAddCompliance)}>
            <Plus className="h-3 w-3" /> Add
          </Button>
        </div>

        {showAddCompliance && (
          <div className="flex items-end gap-2 mb-3 p-3 rounded-lg bg-purple-50 border border-purple-100">
            <Select label="Type" value={newArtifact.artifact_type}
              onChange={e => setNewArtifact(p => ({ ...p, artifact_type: e.target.value }))}
              options={ARTIFACT_TYPES} className="w-48" />
            <Input label="Notes" value={newArtifact.notes ?? ''} placeholder="Optional notes"
              onChange={e => setNewArtifact(p => ({ ...p, notes: e.target.value }))} className="flex-1" />
            <Button size="sm" variant="primary" onClick={handleAddArtifact}>Create</Button>
          </div>
        )}

        {compliance.length === 0 ? (
          <p className="text-xs text-gray-400">No compliance artifacts yet.</p>
        ) : (
          <div className="space-y-1.5">
            {compliance.map(a => (
              <div key={a.id} className="flex items-center justify-between px-3 py-2 rounded-lg bg-gray-50 dark:bg-white/5 border border-gray-100 dark:border-white/[0.07]">
                <div className="flex items-center gap-2">
                  <Badge variant={a.status === 'completed' ? 'success' : a.status === 'expired' ? 'danger' : 'warning'} dot>
                    {a.status}
                  </Badge>
                  <span className="text-sm text-gray-700 dark:text-gray-300">{ARTIFACT_TYPES.find(t => t.value === a.artifact_type)?.label ?? a.artifact_type}</span>
                </div>
                {a.status === 'pending' && (
                  <Button size="xs" variant="secondary" onClick={() => handleCompleteArtifact(a.id)}>Complete</Button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Page ─────────────────────────────────────────────────── */

export default function ApplicationsPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  /* ── Metadata-driven field options (MetadataStore → API fallback) ── */
  const { fields: objectFields } = useResolvedObject('application');

  // Derive filter options from metadata fields, fallback to static defaults
  const statusOptions = useMemo(() => {
    const field = objectFields.find(f => f.name === 'status');
    return field?.options?.length ? field.options : FALLBACK_STATUS_OPTIONS;
  }, [objectFields]);

  const productOptions = useMemo(() => {
    const field = objectFields.find(f => f.name === 'product_type');
    return field?.options?.length ? field.options : FALLBACK_PRODUCT_OPTIONS;
  }, [objectFields]);

  // Build value→label lookup maps from metadata options
  const statusLabelMap = useMemo(() => buildLabelMap(statusOptions), [statusOptions]);
  const productLabelMap = useMemo(() => buildLabelMap(productOptions), [productOptions]);

  // Build value→variant map for status badges
  const statusVariantMap = useMemo(() => {
    const map = {};
    for (const o of statusOptions) {
      map[o.value] = o.color ? variantFromColor(o.color) : (STATUS_VARIANT[o.value] ?? 'default');
    }
    return map;
  }, [statusOptions]);

  // Check if underwriting workflow is enabled (feature flag)
  const { data: uwEnabled } = useQuery({
    queryKey: ['uw-workflow-enabled'],
    queryFn: () => insuranceService.isUwWorkflowEnabled(),
    staleTime: 300_000,
  });
  const isUwEnabled = uwEnabled === true;

  /* ── Local state ───────────────────────────────────────────── */
  const [applications, setApplications] = useState([]);
  const [loading, setLoading]           = useState(true);
  const [error, setError]               = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [productFilter, setProductFilter] = useState('');
  const [searchTerm, setSearchTerm]     = useState('');
  const [detailApp, setDetailApp]       = useState(null);
  const [showCreate, setShowCreate]     = useState(false);
  const [highlightApp, setHighlightApp] = useState(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [pdfScreen, setPdfScreen]       = useState(null);
  // Track which applications have had their report viewed (required before submission)
  const [reportViewedApps, setReportViewedApps] = useState(new Set());

  // Auto-highlight new application when navigated from Quote Engine
  useEffect(() => {
    const h = searchParams.get('highlight');
    if (h) {
      setHighlightApp(h);
      setSearchParams({}, { replace: true });
      const timer = setTimeout(() => setHighlightApp(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [searchParams, setSearchParams]);

  /* ── Report PDF mutation (renders + auto-archives as document) */
  const reportPdfMutation = useMutation({
    mutationFn: (applicationId) =>
      insuranceService.renderAndArchive({
        report_type: 'application_report',
        application_id: applicationId,
      }),
    onSuccess: (result, applicationId) => {
      const html = result?.html ?? (typeof result === 'string' ? result : '');
      if (html) {
        setPdfScreen({ content: html, title: 'Application Report' });
        setReportViewedApps(prev => new Set(prev).add(applicationId));
      }
    },
  });

  /* ── Email to client mutation ────────────────────────────── */
  const emailMutation = useMutation({
    mutationFn: async (app) => {
      const html = await insuranceService.renderApplicationReport(app.id);
      const clientEmail = app.contact?.email;
      if (!clientEmail) throw new Error('No client email address on this application.');
      return api.post('/email/send-with-pdf', {
        to_email:     clientEmail,
        subject:      `Your Insurance Application Report — ${app.app_number}`,
        body_text:    'Please find your insurance application report attached as a PDF for your records.',
        pdf_html:     typeof html === 'string' ? html : '',
        pdf_filename: `Application-${app.app_number}.pdf`,
      }).then(r => r.data);
    },
  });

  // Reset email mutation state when detail app changes
  useEffect(() => { emailMutation.reset(); }, [detailApp?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ── Data loading ──────────────────────────────────────────── */
  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const params = {};
      if (statusFilter)  params.status       = statusFilter;
      if (productFilter) params.product_type = productFilter;
      if (searchTerm)    params.search       = searchTerm;
      const res = await insuranceService.listApplications(params);
      setApplications(res?.data?.applications ?? res?.applications ?? []);
    } catch (err) { setError(err?.response?.data?.message ?? 'Failed to load applications'); }
    finally { setLoading(false); }
  }, [statusFilter, productFilter, searchTerm]);

  useEffect(() => { load(); }, [load]);

  /* ── Action handlers ───────────────────────────────────────── */
  // Wrapped in useCallback so the `columns` useMemo (which lists them as deps)
  // isn't invalidated on every render — otherwise the whole DataTable re-renders
  // on any state change (e.g. typing in the search box).
  const handleConvertUW = useCallback(async (app) => {
    setActionLoading(true);
    try { await insuranceService.convertToUnderwriting(app.id); await load(); }
    catch (err) { showError(err?.response?.data?.message ?? err.message ?? 'Failed'); }
    finally { setActionLoading(false); }
  }, [load]);

  const handleIssuePolicy = useCallback(async (app) => {
    setActionLoading(true);
    try {
      await insuranceService.issuePolicy(app.id, { effective_date: new Date().toISOString().slice(0, 10) });
      await load();
    } catch (err) { showError(err?.response?.data?.message ?? err.message ?? 'Failed to issue policy'); }
    finally { setActionLoading(false); }
  }, [load]);

  const handleViewReport = useCallback((app) => {
    reportPdfMutation.mutate(app.id);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleEmailClient = useCallback((app) => {
    if (!app.contact?.email) {
      showWarning('No email address found for this applicant.');
      return;
    }
    emailMutation.mutate(app);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /* ── Table columns (metadata-driven labels) ────────────────── */
  const columns = useMemo(() => [
    { key: 'app_number', label: 'App Number', sortable: true, render: (v) => (
      <span className={`font-mono text-xs font-semibold ${v === highlightApp ? 'text-on-primary bg-primary-600 px-2 py-0.5 rounded-md animate-pulse' : 'text-primary-600'}`}>{v}</span>
    ) },
    { key: 'contact', label: 'Applicant', sortable: false, render: (_, row) => <span className="font-medium text-gray-900 dark:text-gray-100">{contactName(row)}</span> },
    { key: 'product_type', label: 'Product', sortable: true, render: (v) => <Badge variant="primary">{productLabelMap[v] ?? v}</Badge> },
    { key: 'coverage_amount', label: 'Coverage', sortable: true, render: (v) => <span className="font-semibold text-gray-800 dark:text-gray-200">{fmt(v)}</span> },
    { key: 'status', label: 'Status', sortable: true, render: (v) => (
      <Badge variant={statusVariantMap[v] ?? 'default'} dot>{statusLabelMap[v] ?? v}</Badge>
    ) },
    { key: 'submitted_at', label: 'Submitted', sortable: true, render: (v) => <span className="text-gray-600 dark:text-gray-400 text-xs">{fmtDate(v)}</span> },
    { key: 'agent', label: 'Agent', sortable: false, render: (_, row) => <span className="text-gray-700 dark:text-gray-300">{row.agent?.employee_name ?? '—'}</span> },
    {
      key: 'id', label: 'Actions', width: '320px',
      render: (_, row) => (
        <div className="flex items-center gap-1.5">
          <Button variant="ghost" size="xs" onClick={() => setDetailApp(row)} title="View Details"><Eye className="h-3.5 w-3.5" /></Button>
          <Button variant="secondary" size="xs" onClick={(e) => { e.stopPropagation(); handleViewReport(row); }}
            disabled={reportPdfMutation.isPending}>
            <FileText className="h-3 w-3 mr-1" />
            View Report
          </Button>
          <Button variant="ghost" size="xs" onClick={() => navigate(`/insurance/documents?application_id=${row.id}`)} title="Documents">
            <FolderOpen className="h-3.5 w-3.5" />
          </Button>
          {isUwEnabled && (row.status === 'submitted' || row.status === 'under_review') && !row.underwriting_case && (
            <Button variant="secondary" size="xs"
              onClick={() => reportViewedApps.has(row.id) ? handleConvertUW(row) : handleViewReport(row)}
              disabled={actionLoading}
              className={reportViewedApps.has(row.id) ? 'text-purple-600 border-purple-200 hover:bg-purple-50' : 'text-amber-600 border-amber-200 hover:bg-amber-50'}
              title={reportViewedApps.has(row.id) ? '' : 'View the Application Report before submitting'}>
              {reportViewedApps.has(row.id) ? <Stethoscope className="h-3 w-3 mr-1" /> : <FileText className="h-3 w-3 mr-1" />}
              {reportViewedApps.has(row.id) ? 'Send to UW' : 'View Report to Submit'}
            </Button>
          )}
          {isUwEnabled && row.underwriting_case && row.underwriting_case.status === 'pending' && (
            <Button variant="ghost" size="xs" onClick={() => navigate('/insurance/underwriting')}
              className="text-purple-600 hover:bg-purple-50">
              <ArrowRight className="h-3 w-3 mr-1" />
              In Underwriting
            </Button>
          )}
          {/* When UW is ON: only approved apps can issue policy. When OFF: submitted apps can issue directly. */}
          {(isUwEnabled ? row.status === 'approved' : row.status === 'submitted' || row.status === 'approved') && !row.policy && (
            <Button variant="secondary" size="xs" onClick={() => handleIssuePolicy(row)} disabled={actionLoading}
              className="text-emerald-600 border-emerald-200 hover:bg-emerald-50">
              <CheckCircle2 className="h-3 w-3 mr-1" />
              Issue Policy
            </Button>
          )}
          {row.policy && <Badge variant="success">Policy Issued</Badge>}
          {row.status === 'declined' && <Badge variant="danger">Declined</Badge>}
        </div>
      ),
    },
  ], [highlightApp, productLabelMap, statusLabelMap, statusVariantMap, actionLoading, reportPdfMutation.isPending, handleViewReport, handleIssuePolicy, handleConvertUW, navigate, reportViewedApps, isUwEnabled]);

  /* ── Full-screen PDF view ──────────────────────────────────── */
  if (pdfScreen) {
    return (
      <div className="fixed inset-0 z-50 flex flex-col bg-gray-100 dark:bg-night-0">
        <div className="flex items-center gap-3 px-4 py-3 bg-white dark:bg-night-3
                        border-b border-gray-200 dark:border-white/10 shrink-0 shadow-sm">
          <button
            onClick={() => setPdfScreen(null)}
            className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium
                       text-gray-600 dark:text-white/60 hover:text-gray-900
                       dark:hover:text-white hover:bg-gray-100 dark:hover:bg-white/10
                       rounded-lg transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Applications
          </button>
          <span className="text-gray-300 dark:text-white/20 select-none">|</span>
          <h1 className="text-sm font-semibold text-gray-800 dark:text-white/90">
            {pdfScreen.title}
          </h1>
        </div>
        <div className="flex-1 min-h-0">
          <PDFViewer
            content={pdfScreen.content}
            title={pdfScreen.title}
            clientEmail={detailApp?.contact?.email}
            className="h-full"
          />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-full bg-surface px-4 py-8">
      <div className="mx-auto max-w-7xl space-y-6">

        {/* Header */}
        <PageHeader
          icon={ClipboardList}
          eyebrow="Insurance"
          title="Applications"
          subtitle="Track insurance applications through the approval pipeline."
          className="!mb-0"
          actions={(
            <>
              <Button variant="secondary" size="sm" onClick={load} title="Refresh"><RefreshCw className="h-4 w-4" /></Button>
              <Button variant="primary" size="sm" onClick={() => setShowCreate(true)}><Plus className="h-4 w-4" /> New Application</Button>
            </>
          )}
        />

        {/* Pipeline bar */}
        {!loading && applications.length > 0 && (
          <div className="widget widget-pad">
            <PipelineBar applications={applications} statusOptions={statusOptions} />
          </div>
        )}

        {/* Filters */}
        <div className="card px-6 py-4">
          <div className="flex flex-wrap items-end gap-4">
            <div className="flex-1 min-w-[200px] max-w-xs">
              <Input label="Search" placeholder="App number…" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} prefix={<Search className="h-3.5 w-3.5" />} />
            </div>
            <div className="w-44">
              <Select label="Status" placeholder="All Statuses" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
                options={statusOptions} />
            </div>
            <div className="w-48">
              <Select label="Product" placeholder="All Products" value={productFilter} onChange={e => setProductFilter(e.target.value)}
                options={productOptions} />
            </div>
            {(statusFilter || productFilter || searchTerm) && (
              <Button variant="ghost" size="sm" onClick={() => { setStatusFilter(''); setProductFilter(''); setSearchTerm(''); }}>
                <XCircle className="h-3.5 w-3.5" /> Clear
              </Button>
            )}
          </div>
          {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
        </div>

        {/* Table */}
        <div className="card overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center py-16 text-gray-400">
              <RefreshCw className="h-5 w-5 animate-spin mr-2" /> Loading applications…
            </div>
          ) : (
            <DataTable frame={false} data={applications} columns={columns} searchable={false} onRowClick={setDetailApp} emptyText="No applications found. Submit one to get started." />
          )}
        </div>
      </div>

      {/* Detail Modal */}
      <Modal open={!!detailApp} onClose={() => setDetailApp(null)} title="Application Details" size="lg">
        {detailApp && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-lg font-bold text-gray-900 dark:text-gray-100">{contactName(detailApp)}</p>
                <p className="text-sm font-mono text-primary-600">{detailApp.app_number}</p>
              </div>
              <Badge variant={statusVariantMap[detailApp.status] ?? 'default'} dot>
                {statusLabelMap[detailApp.status] ?? detailApp.status}
              </Badge>
            </div>

            {/* Report viewing required before submission */}
            {detailApp.status === 'submitted' && !reportViewedApps.has(detailApp.id) && (
              <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20">
                <AlertCircle className="h-4 w-4 text-amber-600 shrink-0" />
                <p className="text-xs text-amber-700 dark:text-amber-400">
                  You must <strong>View the Application Report</strong> before this application can be submitted for underwriting. The report is auto-archived as a document.
                </p>
              </div>
            )}
            {reportViewedApps.has(detailApp.id) && (
              <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/20">
                <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                <p className="text-xs text-emerald-700 dark:text-emerald-400">Application report viewed and archived. Submission is enabled.</p>
              </div>
            )}

            {/* Quick actions bar */}
            <div className="flex items-center gap-2 p-3 rounded-xl bg-primary-50 dark:bg-primary-500/10 border border-primary-100 dark:border-primary-500/20">
              <Button variant="primary" size="sm" onClick={() => handleViewReport(detailApp)}
                disabled={reportPdfMutation.isPending}>
                <FileText className="h-4 w-4 mr-1.5" />
                {reportPdfMutation.isPending ? 'Generating & Archiving…' : 'View Application Report'}
              </Button>
              <Button variant="secondary" size="sm" onClick={() => handleEmailClient(detailApp)}
                disabled={emailMutation.isPending || !detailApp.contact?.email}
                title={!detailApp.contact?.email ? 'No client email on file' : 'Email application report to client'}>
                <Mail className="h-4 w-4 mr-1.5" />
                {emailMutation.isPending ? 'Sending…' : 'Email Application to Client'}
              </Button>
              <Button variant="secondary" size="sm" onClick={() => { setDetailApp(null); navigate(`/insurance/documents?application_id=${detailApp.id}`); }}>
                <FolderOpen className="h-4 w-4 mr-1.5" />
                Documents
              </Button>
              {/* Email feedback inline */}
              {emailMutation.isSuccess && (
                <span className="ml-auto text-xs text-emerald-600 font-medium">Sent to {detailApp.contact?.email}</span>
              )}
              {emailMutation.isError && (
                <span className="ml-auto text-xs text-red-600 font-medium">
                  {emailMutation.error?.response?.data?.message ?? emailMutation.error?.message ?? 'Send failed'}
                </span>
              )}
            </div>
            {/* Contact Details */}
            {detailApp.contact && (
              <div className="rounded-xl border border-gray-100 dark:border-white/[0.07] bg-gray-50 dark:bg-white/[0.03] px-4 py-3">
                <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">Contact Details</p>
                <div className="grid grid-cols-2 gap-3">
                  {[
                    ['Email', detailApp.contact.email],
                    ['Phone', detailApp.contact.phone],
                  ].filter(([, v]) => v).map(([label, value]) => (
                    <div key={label}>
                      <p className="text-xs text-gray-400">{label}</p>
                      <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{value}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <div className="grid grid-cols-2 gap-4">
              {[
                ['Product',           productLabelMap[detailApp.product_type] ?? detailApp.product_type],
                ['Coverage',          fmt(detailApp.coverage_amount)],
                ['Premium',           fmt(detailApp.premium_amount)],
                ['Carrier',           detailApp.carrier?.name ?? '—'],
                ['Agent',             detailApp.agent?.employee_name ?? '—'],
                ['Submitted',         fmtDate(detailApp.submitted_at)],
                ['Age',               detailApp.age ?? '—'],
                ['Date of Birth',     detailApp.date_of_birth ? fmtDate(detailApp.date_of_birth) : '—'],
                ['Gender',            detailApp.gender ?? '—'],
                ['Smoker',            detailApp.is_smoker ? 'Yes' : 'No'],
                ['Health Class',      detailApp.health_class?.replace(/_/g, ' ') ?? '—'],
                ['Term',              detailApp.term_years ? `${detailApp.term_years} years` : '—'],
                ['Payment Frequency', detailApp.payment_frequency?.replace(/_/g, ' ') ?? '—'],
              ].map(([label, value]) => (
                <div key={label}>
                  <p className="text-xs font-medium text-gray-400 uppercase tracking-wide">{label}</p>
                  <p className="mt-1 text-sm font-medium text-gray-900 dark:text-gray-100 capitalize">{value}</p>
                </div>
              ))}
            </div>
            {detailApp.underwriting_case && (
              <div className="rounded-xl border border-purple-100 bg-purple-50 px-4 py-3">
                <p className="text-xs font-semibold text-purple-600 uppercase tracking-wide mb-1">Underwriting Case</p>
                <p className="text-sm text-purple-800">{detailApp.underwriting_case.case_number} — <span className="font-semibold">{detailApp.underwriting_case.status}</span>
                {detailApp.underwriting_case.risk_class && <span> · Risk: {detailApp.underwriting_case.risk_class}</span>}</p>
              </div>
            )}
            {detailApp.policy && (
              <div className="rounded-xl border border-emerald-100 bg-emerald-50 px-4 py-3">
                <p className="text-xs font-semibold text-emerald-600 uppercase tracking-wide mb-1">Policy Issued</p>
                <p className="text-sm text-emerald-800 font-semibold">{detailApp.policy.policy_number}</p>
              </div>
            )}
            {detailApp.notes && (
              <div>
                <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">Notes</p>
                <p className="text-sm text-gray-700 dark:text-gray-300">{detailApp.notes}</p>
              </div>
            )}

            {/* Compliance & Submission Readiness */}
            <ComplianceSection applicationId={detailApp.id} />

            <div className="flex justify-end pt-2 border-t border-gray-100 dark:border-white/[0.07]">
              <Button variant="ghost" size="sm" onClick={() => setDetailApp(null)}>Close</Button>
            </div>
          </div>
        )}
      </Modal>

      <CreateAppModal open={showCreate} onClose={() => setShowCreate(false)}
        productOptions={productOptions}
        onCreate={(a) => { setApplications(prev => [a, ...prev]); }} />
    </div>
  );
}
