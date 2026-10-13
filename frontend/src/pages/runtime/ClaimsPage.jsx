import { useState, useEffect, useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useResolvedObject } from '../../hooks/useResolvedObject';
import {
  FileWarning, Eye, RefreshCw, XCircle, Search,
  DollarSign, Clock, CheckCircle2, AlertOctagon, Plus,
  ShieldAlert, Scale, User,
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
import { fmtCurrency as fmt, fmtDate } from '../../utils/formatters';
import { showError } from '../../utils/dialog';

/* ── Config ──────────────────────────────────────────────── */

const STATUS_CONFIG = {
  filed:               { label: 'Filed',               variant: 'info' },
  under_investigation: { label: 'Under Investigation', variant: 'purple' },
  approved:            { label: 'Approved',            variant: 'success' },
  denied:              { label: 'Denied',              variant: 'danger' },
  paid:                { label: 'Paid',                variant: 'default' },
  closed:              { label: 'Closed',              variant: 'default' },
};

const CLAIM_TYPES = {
  death:            { label: 'Death',            variant: 'danger' },
  disability:       { label: 'Disability',       variant: 'warning' },
  critical_illness: { label: 'Critical Illness', variant: 'purple' },
  accident:         { label: 'Accident',         variant: 'warning' },
  other:            { label: 'Other',            variant: 'default' },
};

const PRIORITY_CONFIG = {
  high:   { label: 'High',   color: 'text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20' },
  medium: { label: 'Medium', color: 'text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20' },
  low:    { label: 'Low',    color: 'text-gray-600 dark:text-gray-400 bg-gray-50 dark:bg-white/[0.03]' },
};

const REPORTER_RELATIONSHIPS = [
  { value: 'insured',      label: 'Insured' },
  { value: 'beneficiary',  label: 'Beneficiary' },
  { value: 'third_party',  label: 'Third Party' },
  { value: 'agent',        label: 'Agent' },
];

const claimantName = (c) => c?.contact ? `${c.contact.first_name} ${c.contact.last_name}`.trim() : '—';

/* ── Create Claim Modal ───────────────────────────────────── */

const INITIAL_FORM = {
  policy_id: '', claim_type: 'death', amount: '', priority: 'medium', description: '',
  reporter_name: '', reporter_phone: '', reporter_relationship: 'insured',
  loss_date: '', loss_location: '', loss_description: '',
};

function CreateClaimModal({ open, onClose, onCreate, initialData }) {
  const [form, setForm] = useState({ ...INITIAL_FORM });
  // Pre-fill from initialData when the modal opens (e.g., from Policy → File Claim)
  useEffect(() => {
    if (open && initialData) {
      setForm(f => ({ ...f, ...initialData }));
    }
  }, [open, initialData]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.policy_id || !form.amount) { setError('Policy ID and amount are required.'); return; }
    setSaving(true); setError('');
    try {
      const payload = {
        ...form,
        policy_id: Number(form.policy_id),
        amount: Number(form.amount),
      };
      const created = await insuranceService.createClaim(payload);
      onCreate(created?.data ?? created);
      onClose();
      setForm({ ...INITIAL_FORM });
    } catch (err) {
      setError(err?.response?.data?.message ?? err.message ?? 'Failed to create claim');
    } finally { setSaving(false); }
  };

  return (
    <Modal open={open} onClose={onClose} title="File New Claim" size="lg">
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && <p className="rounded-lg bg-red-50 dark:bg-red-900/20 px-3 py-2 text-sm text-red-600 dark:text-red-400">{error}</p>}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Policy ID *</label>
            <input type="number" className="input w-full" placeholder="Policy ID" value={form.policy_id} onChange={e => set('policy_id', e.target.value)} />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Claim Type *</label>
            <select className="input w-full" value={form.claim_type} onChange={e => set('claim_type', e.target.value)}>
              {Object.entries(CLAIM_TYPES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Claim Amount *</label>
            <input type="number" className="input w-full" placeholder="100000" value={form.amount} onChange={e => set('amount', e.target.value)} />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Priority</label>
            <select className="input w-full" value={form.priority} onChange={e => set('priority', e.target.value)}>
              {Object.entries(PRIORITY_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
          </div>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Description</label>
          <textarea className="input w-full h-20 resize-none" placeholder="Describe the claim…" value={form.description} onChange={e => set('description', e.target.value)} />
        </div>

        {/* FNOL Details Section */}
        <div className="border-t border-gray-200 dark:border-white/10 pt-4">
          <p className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">FNOL Details</p>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Reporter Name</label>
              <input type="text" className="input w-full" placeholder="Full name" value={form.reporter_name} onChange={e => set('reporter_name', e.target.value)} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Reporter Phone</label>
              <input type="tel" className="input w-full" placeholder="(555) 123-4567" value={form.reporter_phone} onChange={e => set('reporter_phone', e.target.value)} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Reporter Relationship</label>
              <select className="input w-full" value={form.reporter_relationship} onChange={e => set('reporter_relationship', e.target.value)}>
                {REPORTER_RELATIONSHIPS.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Loss Date</label>
              <input type="date" className="input w-full" value={form.loss_date} onChange={e => set('loss_date', e.target.value)} />
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Loss Location</label>
              <input type="text" className="input w-full" placeholder="Address or location description" value={form.loss_location} onChange={e => set('loss_location', e.target.value)} />
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Loss Description</label>
              <textarea className="input w-full h-16 resize-none" placeholder="Describe the loss event…" value={form.loss_description} onChange={e => set('loss_description', e.target.value)} />
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2 border-t border-gray-100 dark:border-white/[0.07]">
          <Button type="button" variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="primary" size="sm" disabled={saving}>{saving ? 'Filing…' : 'File Claim'}</Button>
        </div>
      </form>
    </Modal>
  );
}

/* ── Stat card ───────────────────────────────────────────── */

/* ── Page ─────────────────────────────────────────────────── */

export default function ClaimsPage() {
  /* ── Metadata loading ──────────────────────────────────── */
  const { fields: objectFields } = useResolvedObject('claim');

  const statusOptions = useMemo(() => {
    const f = objectFields.find(f => f.name === 'status');
    return f?.options ?? Object.entries(STATUS_CONFIG).map(([k, v]) => ({ value: k, label: v.label }));
  }, [objectFields]);

  const claimTypeOptions = useMemo(() => {
    const f = objectFields.find(f => f.name === 'claim_type');
    return f?.options ?? Object.entries(CLAIM_TYPES).map(([k, v]) => ({ value: k, label: v.label }));
  }, [objectFields]);

  const [searchParams, setSearchParams] = useSearchParams();
  const [claims, setClaims]               = useState([]);
  const [loading, setLoading]             = useState(true);
  const [error, setError]                 = useState('');
  const [statusFilter, setStatusFilter]   = useState('');
  const [typeFilter, setTypeFilter]       = useState('');
  const [searchTerm, setSearchTerm]       = useState('');
  const [detailClaim, setDetailClaim]     = useState(null);
  const [showCreate, setShowCreate]       = useState(false);
  const [updatingId, setUpdatingId]       = useState(null);
  const [adjusterQueue, setAdjusterQueue] = useState(false);
  const [togglingFraud, setTogglingFraud] = useState(null);

  // Reserve sub-section state (inside detail modal)
  const [showReserve, setShowReserve]       = useState(false);
  const [reserveAmount, setReserveAmount]   = useState('');
  const [reserveReason, setReserveReason]   = useState('');
  const [savingReserve, setSavingReserve]   = useState(false);

  // Auto-open Create Claim modal when navigated from Policy → File Claim
  const [claimInitialData, setClaimInitialData] = useState(null);
  useEffect(() => {
    const policyId = searchParams.get('policy_id');
    if (policyId) {
      setClaimInitialData({
        policy_id: policyId,
        amount: searchParams.get('amount') || '',
      });
      setShowCreate(true);
      // Clear params so refreshing doesn't re-open
      setSearchParams({}, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      if (adjusterQueue) {
        // Fetch adjuster queue — uses current user context
        const res = await insuranceService.getAdjusterQueue('me');
        setClaims(res?.data?.claims ?? res?.claims ?? []);
      } else {
        const params = {};
        if (statusFilter) params.status     = statusFilter;
        if (typeFilter)   params.claim_type = typeFilter;
        if (searchTerm)   params.search     = searchTerm;
        const res = await insuranceService.listClaims(params);
        setClaims(res?.data?.claims ?? res?.claims ?? []);
      }
    } catch (err) { setError(err?.response?.data?.message ?? 'Failed to load claims'); }
    finally { setLoading(false); }
  }, [statusFilter, typeFilter, searchTerm, adjusterQueue]);

  useEffect(() => { load(); }, [load]);

  const handleStatusUpdate = async (claim, newStatus) => {
    setUpdatingId(claim.id);
    try { await insuranceService.updateClaim(claim.id, { status: newStatus }); await load(); }
    catch (err) { showError(err?.response?.data?.message ?? err.message ?? 'Failed'); }
    finally { setUpdatingId(null); }
  };

  const handleToggleFraud = async (claim) => {
    setTogglingFraud(claim.id);
    try {
      await insuranceService.flagFraud(claim.id, !claim.is_fraud_flagged);
      await load();
    } catch (err) { showError(err?.response?.data?.message ?? err.message ?? 'Failed to toggle fraud flag'); }
    finally { setTogglingFraud(null); }
  };

  const handleSetReserve = async () => {
    if (!reserveAmount || !detailClaim) return;
    setSavingReserve(true);
    try {
      await insuranceService.setClaimReserve(detailClaim.id, {
        amount: Number(reserveAmount),
        reason: reserveReason,
      });
      // Refresh detail claim data
      const updated = { ...detailClaim, reserve_amount: Number(reserveAmount) };
      setDetailClaim(updated);
      setShowReserve(false);
      setReserveAmount('');
      setReserveReason('');
      await load();
    } catch (err) { showError(err?.response?.data?.message ?? err.message ?? 'Failed to set reserve'); }
    finally { setSavingReserve(false); }
  };

  // Reset reserve sub-section when detail modal changes
  useEffect(() => {
    if (!detailClaim) {
      setShowReserve(false);
      setReserveAmount('');
      setReserveReason('');
    }
  }, [detailClaim]);

  const totalClaims     = claims.length;
  const approvedAmount  = claims.filter(c => c.status === 'approved' || c.status === 'paid').reduce((s, c) => s + Number(c.amount ?? 0), 0);
  const pendingClaims   = claims.filter(c => c.status === 'filed' || c.status === 'under_investigation').length;

  const columns = [
    { key: 'claim_number', label: 'Claim #', sortable: true, render: (v) => <span className="font-mono text-xs font-semibold text-primary-600 dark:text-primary-400">{v}</span> },
    { key: 'policy', label: 'Policy', sortable: false, render: (_, row) => <span className="font-mono text-xs text-gray-500 dark:text-gray-400">{row.policy?.policy_number ?? '—'}</span> },
    { key: 'contact', label: 'Claimant', sortable: false, render: (_, row) => <span className="font-medium text-gray-900 dark:text-gray-100">{claimantName(row)}</span> },
    { key: 'claim_type', label: 'Type', sortable: true, render: (v) => { const cfg = CLAIM_TYPES[v] ?? { label: v, variant: 'default' }; return <Badge variant={cfg.variant}>{cfg.label}</Badge>; } },
    { key: 'amount', label: 'Amount', sortable: true, render: (v) => <span className="font-semibold text-gray-800 dark:text-gray-200">{fmt(v)}</span> },
    { key: 'status', label: 'Status', sortable: true, render: (v) => { const cfg = STATUS_CONFIG[v] ?? STATUS_CONFIG.filed; return <Badge variant={cfg.variant} dot>{cfg.label}</Badge>; } },
    { key: 'priority', label: 'Priority', sortable: true, render: (v) => { const cfg = PRIORITY_CONFIG[v] ?? PRIORITY_CONFIG.medium; return <span className={`inline-flex items-center gap-1 rounded-lg px-2 py-0.5 text-xs font-semibold ${cfg.color}`}>{v === 'high' && <AlertOctagon className="h-3 w-3" />}{cfg.label}</span>; } },
    { key: 'filed_at', label: 'Filed', sortable: true, render: (v) => <span className="text-gray-600 dark:text-gray-400 text-xs">{fmtDate(v)}</span> },
    {
      key: 'id', label: '', width: '160px',
      render: (_, row) => (
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="xs" onClick={() => setDetailClaim(row)} title="View Details"><Eye className="h-3.5 w-3.5" /></Button>
          {(row.status === 'filed' || row.status === 'under_investigation') && (
            <>
              <Button variant="ghost" size="xs" title="Approve" className="text-emerald-500 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-900/20" onClick={() => handleStatusUpdate(row, 'approved')} disabled={updatingId === row.id}>
                <CheckCircle2 className="h-3.5 w-3.5" />
              </Button>
              <Button variant="ghost" size="xs" title="Deny" className="text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20" onClick={() => handleStatusUpdate(row, 'denied')} disabled={updatingId === row.id}>
                <XCircle className="h-3.5 w-3.5" />
              </Button>
            </>
          )}
          {row.status === 'approved' && (
            <Button variant="ghost" size="xs" title="Mark Paid" className="text-blue-500 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20" onClick={() => handleStatusUpdate(row, 'paid')} disabled={updatingId === row.id}>
              <DollarSign className="h-3.5 w-3.5" />
            </Button>
          )}
          <Button
            variant="ghost"
            size="xs"
            title={row.is_fraud_flagged ? 'Remove Fraud Flag' : 'Flag as Fraud'}
            className={row.is_fraud_flagged ? 'text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20' : 'text-gray-400 dark:text-gray-500 hover:bg-gray-50 dark:hover:bg-white/5'}
            onClick={() => handleToggleFraud(row)}
            disabled={togglingFraud === row.id}
          >
            <ShieldAlert className="h-3.5 w-3.5" />
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="min-h-full bg-surface px-4 py-8">
      <div className="mx-auto max-w-7xl space-y-6">

        {/* Header */}
        <PageHeader
          icon={FileWarning}
          eyebrow="Insurance"
          title="Claims"
          subtitle="Manage insurance claims from filing through payment."
          className="!mb-0"
          actions={(
            <>
              {adjusterQueue && <Badge variant="warning" className="mr-1">Adjuster Queue</Badge>}
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setAdjusterQueue(q => !q)}
                title={adjusterQueue ? 'Show All Claims' : 'Show My Adjuster Queue'}
              >
                <User className="h-4 w-4" />
                {adjusterQueue ? 'All Claims' : 'My Queue'}
              </Button>
              <Button variant="secondary" size="sm" onClick={load} title="Refresh"><RefreshCw className="h-4 w-4" /></Button>
              <Button variant="primary" size="sm" onClick={() => setShowCreate(true)}><Plus className="h-4 w-4" /> File Claim</Button>
            </>
          )}
        />

        {/* KPI tiles */}
        <div className="grid gap-4 grid-cols-1 sm:grid-cols-3">
          <StatTile label="Total Claims"    value={totalClaims}        icon={FileWarning} tone="rose" />
          <StatTile label="Approved Amount" value={fmt(approvedAmount)} icon={DollarSign}  tone="emerald" />
          <StatTile label="Pending Review"  value={pendingClaims}      icon={Clock}       tone="amber" />
        </div>

        {/* Filters */}
        {!adjusterQueue && (
          <div className="card px-6 py-4">
            <div className="flex flex-wrap items-end gap-4">
              <div className="flex-1 min-w-[200px] max-w-xs">
                <Input label="Search" placeholder="Claim number…" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} prefix={<Search className="h-3.5 w-3.5" />} />
              </div>
              <div className="w-48">
                <Select label="Status" placeholder="All Statuses" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
                  options={statusOptions} />
              </div>
              <div className="w-48">
                <Select label="Claim Type" placeholder="All Types" value={typeFilter} onChange={e => setTypeFilter(e.target.value)}
                  options={claimTypeOptions} />
              </div>
              {(statusFilter || typeFilter || searchTerm) && (
                <Button variant="ghost" size="sm" onClick={() => { setStatusFilter(''); setTypeFilter(''); setSearchTerm(''); }}>
                  <XCircle className="h-3.5 w-3.5" /> Clear
                </Button>
              )}
            </div>
            {error && <p className="mt-2 text-sm text-red-600 dark:text-red-400">{error}</p>}
          </div>
        )}
        {adjusterQueue && error && (
          <div className="card px-6 py-4">
            <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
          </div>
        )}

        {/* Table */}
        <div className="card overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center py-16 text-gray-400 dark:text-gray-500">
              <RefreshCw className="h-5 w-5 animate-spin mr-2" /> Loading claims…
            </div>
          ) : (
            <DataTable frame={false} data={claims} columns={columns} searchable={false} onRowClick={setDetailClaim} emptyText="No claims found. File one to get started." />
          )}
        </div>
      </div>

      {/* Detail Modal */}
      <Modal open={!!detailClaim} onClose={() => setDetailClaim(null)} title="Claim Details" size="lg">
        {detailClaim && (
          <div className="space-y-6">
            {/* Header with fraud/litigation badges */}
            <div className="flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <p className="text-lg font-bold text-gray-900 dark:text-gray-100">{claimantName(detailClaim)}</p>
                  {detailClaim.is_fraud_flagged && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-red-100 dark:bg-red-900/30 px-2.5 py-0.5 text-xs font-semibold text-red-700 dark:text-red-300">
                      <ShieldAlert className="h-3 w-3" /> Fraud Alert
                    </span>
                  )}
                  {detailClaim.is_litigation && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-orange-100 dark:bg-orange-900/30 px-2.5 py-0.5 text-xs font-semibold text-orange-700 dark:text-orange-300">
                      <Scale className="h-3 w-3" /> In Litigation
                    </span>
                  )}
                </div>
                <p className="text-sm font-mono text-primary-600 dark:text-primary-400">{detailClaim.claim_number}</p>
              </div>
              <Badge variant={STATUS_CONFIG[detailClaim.status]?.variant} dot>{STATUS_CONFIG[detailClaim.status]?.label}</Badge>
            </div>

            {/* Core details grid */}
            <div className="grid grid-cols-2 gap-4">
              {[
                ['Policy',      detailClaim.policy?.policy_number ?? '—'],
                ['Claim Type',  CLAIM_TYPES[detailClaim.claim_type]?.label ?? detailClaim.claim_type],
                ['Amount',      fmt(detailClaim.amount)],
                ['Priority',    PRIORITY_CONFIG[detailClaim.priority]?.label ?? detailClaim.priority],
                ['Adjuster',    detailClaim.adjuster?.employee_name ?? 'Unassigned'],
                ['Filed',       fmtDate(detailClaim.filed_at)],
                ['Approved',    detailClaim.status === 'paid' ? fmtDate(detailClaim.paid_at) : '—'],
                ['Paid Amount', fmt(detailClaim.paid_amount)],
              ].map(([label, value]) => (
                <div key={label}>
                  <p className="text-xs font-medium text-gray-400 dark:text-gray-500 uppercase tracking-wide">{label}</p>
                  <p className="mt-1 text-sm font-medium text-gray-900 dark:text-gray-100">{value}</p>
                </div>
              ))}
            </div>

            {/* Reserve Section */}
            <div className="rounded-lg border border-gray-200 dark:border-white/10 p-4">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Reserve</p>
                <Button variant="ghost" size="xs" onClick={() => setShowReserve(s => !s)}>
                  <DollarSign className="h-3.5 w-3.5" /> {showReserve ? 'Cancel' : 'Set / Adjust Reserve'}
                </Button>
              </div>
              <p className="text-lg font-bold text-gray-900 dark:text-gray-100">{fmt(detailClaim.reserve_amount)}</p>
              {showReserve && (
                <div className="mt-3 space-y-3 border-t border-gray-100 dark:border-white/[0.07] pt-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">New Reserve Amount</label>
                    <input type="number" className="input w-full" placeholder="50000" value={reserveAmount} onChange={e => setReserveAmount(e.target.value)} />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Reason</label>
                    <input type="text" className="input w-full" placeholder="Reason for adjustment" value={reserveReason} onChange={e => setReserveReason(e.target.value)} />
                  </div>
                  <div className="flex justify-end">
                    <Button variant="primary" size="xs" onClick={handleSetReserve} disabled={savingReserve || !reserveAmount}>
                      {savingReserve ? 'Saving…' : 'Save Reserve'}
                    </Button>
                  </div>
                </div>
              )}
            </div>

            {/* Description */}
            {detailClaim.description && (
              <div>
                <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">Description</p>
                <p className="text-sm text-gray-700 dark:text-gray-300">{detailClaim.description}</p>
              </div>
            )}

            {/* FNOL Details */}
            {(detailClaim.reporter_name || detailClaim.loss_date || detailClaim.loss_location || detailClaim.loss_description) && (
              <div className="rounded-lg border border-gray-200 dark:border-white/10 p-4">
                <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3">FNOL Details</p>
                <div className="grid grid-cols-2 gap-4">
                  {detailClaim.reporter_name && (
                    <div>
                      <p className="text-xs font-medium text-gray-400 dark:text-gray-500 uppercase tracking-wide">Reporter Name</p>
                      <p className="mt-1 text-sm font-medium text-gray-900 dark:text-gray-100">{detailClaim.reporter_name}</p>
                    </div>
                  )}
                  {detailClaim.reporter_phone && (
                    <div>
                      <p className="text-xs font-medium text-gray-400 dark:text-gray-500 uppercase tracking-wide">Reporter Phone</p>
                      <p className="mt-1 text-sm font-medium text-gray-900 dark:text-gray-100">{detailClaim.reporter_phone}</p>
                    </div>
                  )}
                  {detailClaim.reporter_relationship && (
                    <div>
                      <p className="text-xs font-medium text-gray-400 dark:text-gray-500 uppercase tracking-wide">Relationship</p>
                      <p className="mt-1 text-sm font-medium text-gray-900 dark:text-gray-100 capitalize">{detailClaim.reporter_relationship.replace('_', ' ')}</p>
                    </div>
                  )}
                  {detailClaim.loss_date && (
                    <div>
                      <p className="text-xs font-medium text-gray-400 dark:text-gray-500 uppercase tracking-wide">Loss Date</p>
                      <p className="mt-1 text-sm font-medium text-gray-900 dark:text-gray-100">{fmtDate(detailClaim.loss_date)}</p>
                    </div>
                  )}
                  {detailClaim.loss_location && (
                    <div className="col-span-2">
                      <p className="text-xs font-medium text-gray-400 dark:text-gray-500 uppercase tracking-wide">Loss Location</p>
                      <p className="mt-1 text-sm font-medium text-gray-900 dark:text-gray-100">{detailClaim.loss_location}</p>
                    </div>
                  )}
                  {detailClaim.loss_description && (
                    <div className="col-span-2">
                      <p className="text-xs font-medium text-gray-400 dark:text-gray-500 uppercase tracking-wide">Loss Description</p>
                      <p className="mt-1 text-sm text-gray-700 dark:text-gray-300">{detailClaim.loss_description}</p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Timeline */}
            {detailClaim.events?.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">Timeline</p>
                <div className="space-y-2">
                  {detailClaim.events.map((e, i) => (
                    <div key={i} className="flex gap-3 text-sm">
                      <span className="text-gray-400 dark:text-gray-500 text-xs whitespace-nowrap pt-0.5">{fmtDate(e.created_at)}</span>
                      <span className="text-gray-700 dark:text-gray-300">{e.description}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2 border-t border-gray-100 dark:border-white/[0.07]">
              <Button variant="ghost" size="sm" onClick={() => setDetailClaim(null)}>Close</Button>
            </div>
          </div>
        )}
      </Modal>

      <CreateClaimModal open={showCreate} onClose={() => { setShowCreate(false); setClaimInitialData(null); }}
        onCreate={(c) => { setClaims(prev => [c, ...prev]); }} initialData={claimInitialData} />
    </div>
  );
}
