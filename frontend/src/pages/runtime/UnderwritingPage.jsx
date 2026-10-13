import { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Shield, Eye, RefreshCw, Search, XCircle, CheckCircle2,
  ThumbsDown, Plus, AlertCircle,
} from 'lucide-react';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import Select from '../../components/ui/Select';
import Badge from '../../components/ui/Badge';
import DataTable from '../../components/ui/DataTable';
import Modal from '../../components/ui/Modal';
import PageHeader from '../../components/ui/PageHeader';
import StatTile from '../../components/ui/StatTile';
import { insuranceService } from '../../services/insurance.service';
import { useResolvedObject } from '../../hooks/useResolvedObject';
import { fmtCurrency as fmt, fmtDate } from '../../utils/formatters';
import { statusVariant, fieldOptions, optionLabel, fieldLabel } from '../../utils/metadata-helpers';
import { showError, showWarning } from '../../utils/dialog';

/* ── Fallbacks (used when metadata is unavailable) ────────── */

const FB_STATUS = [
  { value: 'pending',     label: 'Pending',     color: '#3b82f6' },
  { value: 'in_progress', label: 'In Progress', color: '#8b5cf6' },
  { value: 'approved',    label: 'Approved',    color: '#10b981' },
  { value: 'declined',    label: 'Declined',    color: '#ef4444' },
  { value: 'referred',    label: 'Referred',    color: '#f59e0b' },
];

const FB_RISK_CLASSES = [
  { value: 'standard',       label: 'Standard' },
  { value: 'preferred',      label: 'Preferred' },
  { value: 'preferred_plus', label: 'Preferred Plus' },
  { value: 'substandard',    label: 'Substandard' },
  { value: 'rated',          label: 'Table Rated' },
];

/** Pick first non-empty options array */
function pick(metaOpts, fallback) {
  return metaOpts?.length ? metaOpts : fallback;
}

/* ── Page ─────────────────────────────────────────────────── */

export default function UnderwritingPage() {
  const navigate = useNavigate();

  /* ── Metadata loading (MetadataStore → API fallback) ──── */
  const { fields: uwFields } = useResolvedObject('underwriting_case');

  const statusOpts    = useMemo(() => pick(fieldOptions('status', uwFields), FB_STATUS), [uwFields]);
  const riskClassOpts = useMemo(() => pick(fieldOptions('risk_class', uwFields), FB_RISK_CLASSES), [uwFields]);

  /* ── Component state ───────────────────────────────────── */

  const [cases, setCases]              = useState([]);
  const [loading, setLoading]          = useState(true);
  const [error, setError]              = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [searchTerm, setSearchTerm]    = useState('');

  /* Decision modal state */
  const [decisionModal, setDecisionModal] = useState(null);
  const [riskClass, setRiskClass]         = useState('standard');
  const [decisionNotes, setDecisionNotes] = useState('');
  const [decisionSaving, setDecisionSaving] = useState(false);

  /* Requirement modal */
  const [reqModal, setReqModal]   = useState(null);
  const [reqForm, setReqForm]     = useState({ requirement_type: '', description: '' });
  const [reqSaving, setReqSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const params = {};
      if (statusFilter) params.status = statusFilter;
      if (searchTerm)   params.search = searchTerm;
      const res = await insuranceService.listUnderwriting(params);
      setCases(res?.data?.cases ?? res?.cases ?? []);
    } catch (err) { setError(err?.response?.data?.message ?? 'Failed to load underwriting cases'); }
    finally { setLoading(false); }
  }, [statusFilter, searchTerm]);

  useEffect(() => { load(); }, [load]);

  const openDecision = (uwCase, action) => {
    setDecisionModal({ uwCase, action });
    setRiskClass('standard');
    setDecisionNotes('');
  };

  const submitDecision = async () => {
    if (!decisionModal) return;
    setDecisionSaving(true);
    try {
      const payload = decisionModal.action === 'approve'
        ? { status: 'approved', risk_class: riskClass, decision_notes: decisionNotes }
        : { status: 'declined', decision_notes: decisionNotes };
      await insuranceService.makeUWDecision(decisionModal.uwCase.id, payload);
      setDecisionModal(null);
      await load();
    } catch (err) { showError(err?.response?.data?.message ?? err.message ?? 'Failed'); }
    finally { setDecisionSaving(false); }
  };

  const submitRequirement = async () => {
    if (!reqModal || !reqForm.requirement_type) { showWarning('Requirement type is required'); return; }
    setReqSaving(true);
    try {
      await insuranceService.addRequirement(reqModal.id, reqForm);
      setReqModal(null);
      setReqForm({ requirement_type: '', description: '' });
      await load();
    } catch (err) { showError(err?.response?.data?.message ?? err.message ?? 'Failed'); }
    finally { setReqSaving(false); }
  };

  const totalPending  = cases.filter(c => c.status === 'pending' || c.status === 'information_needed' || c.status === 'medical_review').length;
  const totalApproved = cases.filter(c => c.status === 'approved').length;
  const totalDeclined = cases.filter(c => c.status === 'declined').length;

  const columns = useMemo(() => [
    { key: 'case_number', label: fieldLabel('case_number', uwFields) || 'UW Case', sortable: true, render: (v) => <span className="font-mono text-xs font-semibold text-primary-600">{v}</span> },
    { key: 'application', label: 'Application', sortable: false, render: (_, row) => <span className="font-mono text-xs text-gray-500">{row.application?.app_number ?? '—'}</span> },
    { key: 'product', label: 'Product', sortable: false, render: (_, row) => <span className="text-xs capitalize text-gray-600 dark:text-gray-400">{(row.application?.product_type ?? '—').replace(/_/g, ' ')}</span> },
    { key: 'coverage_amount', label: 'Coverage', sortable: false, render: (_, row) => <span className="font-semibold text-gray-800 dark:text-gray-200">{fmt(row.application?.coverage_amount)}</span> },
    { key: 'underwriter_employee', label: 'Underwriter', sortable: false, render: (_, row) => row.underwriter_employee?.employee_name ?? <span className="text-gray-400 italic text-xs">Unassigned</span> },
    { key: 'status', label: fieldLabel('status', uwFields) || 'Status', sortable: true,
      render: (v) => (
        <Badge variant={statusVariant(v, statusOpts)} dot>
          {optionLabel(v, statusOpts)}
        </Badge>
      ),
    },
    { key: 'requirements', label: 'Reqs', sortable: false,
      render: (_, row) => {
        const reqs = row.requirements ?? [];
        const done = reqs.filter(r => r.status !== 'pending').length;
        return reqs.length > 0
          ? <span className="text-xs font-medium text-gray-600 dark:text-gray-400">{done}/{reqs.length}</span>
          : <span className="text-xs text-gray-400">—</span>;
      },
    },
    { key: 'created_at', label: 'Received', sortable: true, render: (v) => <span className="text-xs text-gray-500 dark:text-gray-400">{fmtDate(v)}</span> },
    {
      key: 'id', label: '', width: '130px',
      render: (_, row) => (
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="xs" title="Review Case" onClick={() => navigate(`/insurance/underwriting/${row.id}`)}><Eye className="h-3.5 w-3.5" /></Button>
          <Button variant="ghost" size="xs" title="Add Requirement" onClick={() => setReqModal(row)}><Plus className="h-3.5 w-3.5" /></Button>
          {(row.status === 'pending' || row.status === 'in_progress') && (
            <>
              <Button variant="ghost" size="xs" title="Approve" className="text-emerald-500 hover:bg-emerald-50" onClick={() => openDecision(row, 'approve')} disabled={decisionSaving}>
                <CheckCircle2 className="h-3.5 w-3.5" />
              </Button>
              <Button variant="ghost" size="xs" title="Decline" className="text-red-400 hover:bg-red-50" onClick={() => openDecision(row, 'decline')} disabled={decisionSaving}>
                <ThumbsDown className="h-3.5 w-3.5" />
              </Button>
            </>
          )}
        </div>
      ),
    },
  ], [uwFields, statusOpts, decisionSaving, navigate]);

  return (
    <div className="min-h-full bg-surface px-4 py-8">
      <div className="mx-auto max-w-7xl space-y-6">

        {/* Header */}
        <PageHeader
          icon={Shield}
          eyebrow="Insurance"
          title="Underwriting"
          subtitle="Review and decide on insurance applications."
          className="!mb-0"
          actions={<Button variant="secondary" size="sm" onClick={load} title="Refresh"><RefreshCw className="h-4 w-4" /></Button>}
        />

        {/* KPI tiles */}
        <div className="grid gap-4 grid-cols-1 sm:grid-cols-3">
          <StatTile label="In Review" value={totalPending}  icon={AlertCircle}  tone="amber" />
          <StatTile label="Approved"  value={totalApproved} icon={CheckCircle2} tone="emerald" />
          <StatTile label="Declined"  value={totalDeclined} icon={XCircle}      tone="rose" />
        </div>

        {/* Filters */}
        <div className="card px-6 py-4">
          <div className="flex flex-wrap items-end gap-4">
            <div className="flex-1 min-w-[200px] max-w-xs">
              <Input label="Search" placeholder="UW case or app number…" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} prefix={<Search className="h-3.5 w-3.5" />} />
            </div>
            <div className="w-48">
              <Select label={fieldLabel('status', uwFields) || 'Status'} placeholder="All Statuses" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
                options={statusOpts} />
            </div>
            {(statusFilter || searchTerm) && (
              <Button variant="ghost" size="sm" onClick={() => { setStatusFilter(''); setSearchTerm(''); }}>
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
              <RefreshCw className="h-5 w-5 animate-spin mr-2" /> Loading underwriting cases…
            </div>
          ) : (
            <DataTable frame={false} data={cases} columns={columns} searchable={false} onRowClick={(row) => navigate(`/insurance/underwriting/${row.id}`)} emptyText="No underwriting cases found. Convert an application to start." />
          )}
        </div>
      </div>

      {/* Decision Modal */}
      <Modal open={!!decisionModal} onClose={() => setDecisionModal(null)} title={decisionModal?.action === 'approve' ? 'Approve Application' : 'Decline Application'} size="sm">
        {decisionModal && (
          <div className="space-y-4">
            {decisionModal.action === 'approve' && (
              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                  {fieldLabel('risk_class', uwFields) || 'Risk Class'}
                </label>
                <select className="input w-full" value={riskClass} onChange={e => setRiskClass(e.target.value)}>
                  {riskClassOpts.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                </select>
              </div>
            )}
            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                {fieldLabel('decision_notes', uwFields) || 'Notes'}
              </label>
              <textarea className="input w-full h-20 resize-none" placeholder="Decision notes…" value={decisionNotes} onChange={e => setDecisionNotes(e.target.value)} />
            </div>
            <div className="flex justify-end gap-2 pt-2 border-t border-gray-100 dark:border-white/[0.07]">
              <Button variant="ghost" size="sm" onClick={() => setDecisionModal(null)}>Cancel</Button>
              <Button variant={decisionModal.action === 'approve' ? 'primary' : 'danger'} size="sm" onClick={submitDecision} disabled={decisionSaving}>
                {decisionSaving ? 'Saving…' : decisionModal.action === 'approve' ? 'Approve' : 'Decline'}
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Add Requirement Modal */}
      <Modal open={!!reqModal} onClose={() => setReqModal(null)} title="Add Requirement" size="sm">
        {reqModal && (
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                {fieldLabel('requirement_type', uwFields) || 'Requirement Type'} *
              </label>
              <input className="input w-full" placeholder="e.g. attending_physician_statement" value={reqForm.requirement_type} onChange={e => setReqForm(f => ({ ...f, requirement_type: e.target.value }))} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Description</label>
              <textarea className="input w-full h-16 resize-none" placeholder="Details…" value={reqForm.description} onChange={e => setReqForm(f => ({ ...f, description: e.target.value }))} />
            </div>
            <div className="flex justify-end gap-2 pt-2 border-t border-gray-100 dark:border-white/[0.07]">
              <Button variant="ghost" size="sm" onClick={() => setReqModal(null)}>Cancel</Button>
              <Button variant="primary" size="sm" onClick={submitRequirement} disabled={reqSaving}>{reqSaving ? 'Saving…' : 'Add Requirement'}</Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
