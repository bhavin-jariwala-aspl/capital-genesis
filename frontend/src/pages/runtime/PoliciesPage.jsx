import { useState, useMemo, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useResolvedObject } from '../../hooks/useResolvedObject';
import {
  Shield, DollarSign, AlertTriangle, CheckCircle2,
  XCircle, Clock, Eye, FileText, Search, Plus, RefreshCw,
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
import { fmtCurrency as fmt, fmtDate, contactName as holderName } from '../../utils/formatters';
import { showError, showSuccess } from '../../utils/dialog';

/* ── Config ──────────────────────────────────────────────── */

const STATUS_CONFIG = {
  active:      { label: 'Active',      variant: 'success' },
  pending:     { label: 'Pending',     variant: 'info' },
  lapsed:      { label: 'Lapsed',      variant: 'warning' },
  surrendered: { label: 'Surrendered', variant: 'default' },
  matured:     { label: 'Matured',     variant: 'info' },
  cancelled:   { label: 'Cancelled',   variant: 'danger' },
};

const ENDORSEMENT_STATUS_CONFIG = {
  pending:  { label: 'Pending',  variant: 'warning' },
  approved: { label: 'Approved', variant: 'info' },
  applied:  { label: 'Applied',  variant: 'success' },
  rejected: { label: 'Rejected', variant: 'danger' },
};

const INVOICE_STATUS_CONFIG = {
  pending:  { label: 'Pending',  variant: 'warning' },
  paid:     { label: 'Paid',     variant: 'success' },
  overdue:  { label: 'Overdue',  variant: 'danger' },
  voided:   { label: 'Voided',   variant: 'default' },
};

const PRODUCT_TYPES = ['term_life', 'whole_life', 'universal_life', 'variable_life', 'iul', 'final_expense'];
const PRODUCT_LABELS = {
  term_life: 'Term Life', whole_life: 'Whole Life', universal_life: 'Universal Life',
  variable_life: 'Variable Life', iul: 'Indexed UL', final_expense: 'Final Expense',
};
const FREQ_LABELS = { monthly: 'Monthly', quarterly: 'Quarterly', semi_annual: 'Semi-Annual', annual: 'Annual' };


const isRenewalDueSoon = (policy) => {
  if (policy.status !== 'active' || !policy.renewal_due_date) return false;
  const diff = (new Date(policy.renewal_due_date) - new Date()) / (1000 * 60 * 60 * 24);
  return diff >= 0 && diff <= 90;
};

/* ── Helpers ─────────────────────────────────────────────── */

/* ── Endorsements Tab ───────────────────────────────────── */

function EndorsementsTab({ policy }) {
  const [endorsements, setEndorsements] = useState([]);
  const [loading, setLoading]           = useState(true);
  const [error, setError]               = useState('');
  const [actionLoading, setActionLoading] = useState('');
  const [showForm, setShowForm]         = useState(false);
  const [form, setForm]                 = useState({ type: '', description: '', effective_date: '', premium_impact: '' });
  const [formSaving, setFormSaving]     = useState(false);
  const [formError, setFormError]       = useState('');

  const loadEndorsements = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await insuranceService.listEndorsements({ policy_id: policy.id });
      setEndorsements(res?.data?.endorsements ?? res?.endorsements ?? []);
    } catch (err) {
      setError(err?.response?.data?.message ?? 'Failed to load endorsements');
    } finally { setLoading(false); }
  }, [policy.id]);

  useEffect(() => { loadEndorsements(); }, [loadEndorsements]);

  const handleApprove = async (id) => {
    setActionLoading(`approve-${id}`);
    try {
      await insuranceService.approveEndorsement(id);
      await loadEndorsements();
    } catch (err) {
      setError(err?.response?.data?.message ?? 'Failed to approve endorsement');
    } finally { setActionLoading(''); }
  };

  const handleApply = async (id) => {
    setActionLoading(`apply-${id}`);
    try {
      await insuranceService.applyEndorsement(id);
      await loadEndorsements();
    } catch (err) {
      setError(err?.response?.data?.message ?? 'Failed to apply endorsement');
    } finally { setActionLoading(''); }
  };

  const handleCreateEndorsement = async (e) => {
    e.preventDefault();
    if (!form.type || !form.description) {
      setFormError('Type and description are required.');
      return;
    }
    setFormSaving(true);
    setFormError('');
    try {
      await insuranceService.createEndorsement({ policy_id: policy.id, ...form });
      setShowForm(false);
      setForm({ type: '', description: '', effective_date: '', premium_impact: '' });
      await loadEndorsements();
    } catch (err) {
      setFormError(err?.response?.data?.message ?? 'Failed to create endorsement');
    } finally { setFormSaving(false); }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 text-gray-400 dark:text-gray-500">
        <RefreshCw className="h-4 w-4 animate-spin mr-2" /> Loading endorsements…
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {error && <p className="rounded-lg bg-red-50 dark:bg-red-900/20 px-3 py-2 text-sm text-red-600 dark:text-red-400">{error}</p>}

      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-gray-700 dark:text-gray-300">Endorsements ({endorsements.length})</p>
        <Button variant="primary" size="xs" onClick={() => setShowForm(f => !f)}>
          <Plus className="h-3.5 w-3.5" /> New Endorsement
        </Button>
      </div>

      {showForm && (
        <form onSubmit={handleCreateEndorsement} className="rounded-lg border border-gray-200 dark:border-white/10 bg-gray-50 dark:bg-white/[0.03] p-4 space-y-3">
          {formError && <p className="rounded-lg bg-red-50 dark:bg-red-900/20 px-3 py-2 text-sm text-red-600 dark:text-red-400">{formError}</p>}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Type *</label>
              <input type="text" className="input w-full" placeholder="e.g. beneficiary_change" value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Effective Date</label>
              <input type="date" className="input w-full" value={form.effective_date} onChange={e => setForm(f => ({ ...f, effective_date: e.target.value }))} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Premium Impact</label>
              <input type="number" className="input w-full" placeholder="0" value={form.premium_impact} onChange={e => setForm(f => ({ ...f, premium_impact: e.target.value }))} />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Description *</label>
            <textarea className="input w-full h-16 resize-none" placeholder="Describe the endorsement…" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" size="xs" onClick={() => { setShowForm(false); setFormError(''); }}>Cancel</Button>
            <Button type="submit" variant="primary" size="xs" disabled={formSaving}>{formSaving ? 'Saving…' : 'Create'}</Button>
          </div>
        </form>
      )}

      {endorsements.length === 0 && !showForm ? (
        <p className="text-center text-sm text-gray-400 dark:text-gray-500 py-8">No endorsements found for this policy.</p>
      ) : (
        <div className="space-y-2">
          {endorsements.map((end) => {
            const stCfg = ENDORSEMENT_STATUS_CONFIG[end.status] ?? ENDORSEMENT_STATUS_CONFIG.pending;
            return (
              <div key={end.id} className="rounded-lg border border-gray-200 dark:border-white/10 bg-white dark:bg-night-2 px-4 py-3">
                <div className="flex items-start justify-between">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-mono font-semibold text-primary-600 dark:text-primary-400">{end.ref ?? end.id}</span>
                      <Badge variant="primary">{end.type}</Badge>
                      <Badge variant={stCfg.variant} dot>{stCfg.label}</Badge>
                    </div>
                    <p className="text-sm text-gray-700 dark:text-gray-300">{end.description}</p>
                    <div className="flex items-center gap-4 text-xs text-gray-500 dark:text-gray-400">
                      <span>Effective: {fmtDate(end.effective_date)}</span>
                      {end.premium_impact != null && <span>Premium Impact: {fmt(end.premium_impact)}</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    {end.status === 'pending' && (
                      <Button variant="ghost" size="xs" onClick={() => handleApprove(end.id)} disabled={!!actionLoading}>
                        {actionLoading === `approve-${end.id}` ? 'Approving…' : 'Approve'}
                      </Button>
                    )}
                    {(end.status === 'approved') && (
                      <Button variant="primary" size="xs" onClick={() => handleApply(end.id)} disabled={!!actionLoading}>
                        {actionLoading === `apply-${end.id}` ? 'Applying…' : 'Apply'}
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ── Billing Tab ────────────────────────────────────────── */

function BillingTab({ policy }) {
  const [billing, setBilling]           = useState(null);
  const [loading, setLoading]           = useState(true);
  const [error, setError]               = useState('');
  const [actionLoading, setActionLoading] = useState('');

  const loadBilling = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await insuranceService.getBilling(policy.id);
      setBilling(res?.data ?? res ?? null);
    } catch (err) {
      setError(err?.response?.data?.message ?? 'Failed to load billing');
    } finally { setLoading(false); }
  }, [policy.id]);

  useEffect(() => { loadBilling(); }, [loadBilling]);

  const handleSetupBilling = async () => {
    setActionLoading('setup');
    setError('');
    try {
      await insuranceService.createBilling(policy.id);
      await loadBilling();
    } catch (err) {
      setError(err?.response?.data?.message ?? 'Failed to setup billing');
    } finally { setActionLoading(''); }
  };

  const handleGenerateInvoice = async () => {
    setActionLoading('generate');
    setError('');
    try {
      await insuranceService.generateInvoice(policy.id);
      await loadBilling();
    } catch (err) {
      setError(err?.response?.data?.message ?? 'Failed to generate invoice');
    } finally { setActionLoading(''); }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 text-gray-400 dark:text-gray-500">
        <RefreshCw className="h-4 w-4 animate-spin mr-2" /> Loading billing…
      </div>
    );
  }

  const schedule = billing?.schedule ?? null;
  const invoices = billing?.invoices ?? [];

  return (
    <div className="space-y-4">
      {error && <p className="rounded-lg bg-red-50 dark:bg-red-900/20 px-3 py-2 text-sm text-red-600 dark:text-red-400">{error}</p>}

      {/* Schedule Section */}
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-gray-700 dark:text-gray-300">Billing Schedule</p>
        <div className="flex items-center gap-2">
          {!schedule && (
            <Button variant="primary" size="xs" onClick={handleSetupBilling} disabled={!!actionLoading}>
              {actionLoading === 'setup' ? 'Setting up…' : 'Setup Billing'}
            </Button>
          )}
          {schedule && (
            <Button variant="primary" size="xs" onClick={handleGenerateInvoice} disabled={!!actionLoading}>
              <Plus className="h-3.5 w-3.5" /> {actionLoading === 'generate' ? 'Generating…' : 'Generate Invoice'}
            </Button>
          )}
        </div>
      </div>

      {schedule ? (
        <div className="rounded-lg border border-gray-200 dark:border-white/10 bg-gray-50 dark:bg-white/[0.03] px-4 py-3">
          <div className="grid grid-cols-2 gap-4">
            {[
              ['Frequency',  FREQ_LABELS[schedule.frequency] ?? schedule.frequency ?? '—'],
              ['Amount',     fmt(schedule.amount)],
              ['Next Due',   fmtDate(schedule.next_due_date)],
              ['Auto-Pay',   schedule.auto_pay ? 'Enabled' : 'Disabled'],
            ].map(([label, value]) => (
              <div key={label}>
                <p className="text-xs font-medium text-gray-400 dark:text-gray-500 uppercase tracking-wide">{label}</p>
                <p className="mt-1 text-sm font-medium text-gray-900 dark:text-gray-100">{value}</p>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <p className="text-center text-sm text-gray-400 dark:text-gray-500 py-4">No billing schedule configured.</p>
      )}

      {/* Invoices Section */}
      <div>
        <p className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Invoices ({invoices.length})</p>
        {invoices.length === 0 ? (
          <p className="text-center text-sm text-gray-400 dark:text-gray-500 py-6">No invoices yet.</p>
        ) : (
          <div className="space-y-2">
            {invoices.map((inv) => {
              const invCfg = INVOICE_STATUS_CONFIG[inv.status] ?? INVOICE_STATUS_CONFIG.pending;
              return (
                <div key={inv.id} className="rounded-lg border border-gray-200 dark:border-white/10 bg-white dark:bg-night-2 px-4 py-3 flex items-center justify-between">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-mono font-semibold text-primary-600 dark:text-primary-400">{inv.invoice_number ?? inv.id}</span>
                      <Badge variant={invCfg.variant} dot>{invCfg.label}</Badge>
                    </div>
                    <div className="flex items-center gap-4 text-xs text-gray-500 dark:text-gray-400">
                      <span>Amount: {fmt(inv.amount)}</span>
                      <span>Due: {fmtDate(inv.due_date)}</span>
                      {inv.paid_date && <span>Paid: {fmtDate(inv.paid_date)}</span>}
                    </div>
                  </div>
                  {inv.status === 'pending' && (
                    <Button variant="ghost" size="xs" title="Record Payment">
                      <DollarSign className="h-3.5 w-3.5" /> Record Payment
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Policy Detail Modal ────────────────────────────────── */

function PolicyDetailModal({ policy, onClose, onFileClaim }) {
  const [activeTab, setActiveTab] = useState('details');

  if (!policy) return null;

  const tabs = [
    { key: 'details',      label: 'Details' },
    { key: 'endorsements', label: 'Endorsements' },
    { key: 'billing',      label: 'Billing' },
  ];

  return (
    <Modal open={!!policy} onClose={onClose} title="Policy Details" size="lg">
      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-200 dark:border-white/10 mb-4">
        {tabs.map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              activeTab === tab.key
                ? 'border-primary-600 text-primary-600 dark:text-primary-400'
                : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-white/80'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Details Tab */}
      {activeTab === 'details' && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-lg font-bold text-gray-900 dark:text-gray-100">{holderName(policy)}</p>
              <p className="text-sm font-mono text-primary-600 dark:text-primary-400">{policy.policy_number}</p>
            </div>
            <Badge variant={STATUS_CONFIG[policy.status]?.variant} dot>{STATUS_CONFIG[policy.status]?.label}</Badge>
          </div>
          <div className="grid grid-cols-2 gap-4">
            {[
              ['Product',         PRODUCT_LABELS[policy.product_type] ?? policy.product_type],
              ['Coverage',        fmt(policy.coverage_amount)],
              ['Premium',         `${fmt(policy.premium_amount)} / ${FREQ_LABELS[policy.premium_frequency] ?? policy.premium_frequency}`],
              ['Carrier',         policy.carrier?.name ?? '—'],
              ['Effective Date',  fmtDate(policy.effective_date)],
              ['Expiry Date',     fmtDate(policy.expiry_date)],
              ['Renewal Due',     fmtDate(policy.renewal_due_date)],
              ['Agent',           policy.agent?.employee_name ?? '—'],
              ['Last Payment',    fmtDate(policy.last_payment_date)],
            ].map(([label, value]) => (
              <div key={label}>
                <p className="text-xs font-medium text-gray-400 dark:text-gray-500 uppercase tracking-wide">{label}</p>
                <p className="mt-1 text-sm font-medium text-gray-900 dark:text-gray-100">{value}</p>
              </div>
            ))}
          </div>
          {policy.beneficiaries?.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">Beneficiaries</p>
              <div className="space-y-1">
                {policy.beneficiaries.map((b, i) => (
                  <div key={i} className="flex justify-between text-sm text-gray-700 dark:text-gray-300 bg-gray-50 dark:bg-white/[0.03] rounded-lg px-3 py-1.5">
                    <span>{b.name} <span className="text-gray-400 dark:text-gray-500 text-xs">({b.relationship ?? 'beneficiary'})</span></span>
                    <span className="font-semibold">{b.allocation_pct}%</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {policy.notes && (
            <div>
              <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">Notes</p>
              <p className="text-sm text-gray-700 dark:text-gray-300">{policy.notes}</p>
            </div>
          )}
          <div className="flex justify-end gap-2 pt-2 border-t border-gray-100 dark:border-white/[0.07]">
            <Button variant="ghost" size="sm" onClick={onClose}>Close</Button>
            {policy.status === 'active' && (
              <Button variant="warning" size="sm" onClick={() => { onClose(); onFileClaim(policy); }}>
                <AlertTriangle className="h-3.5 w-3.5 mr-1" /> File Claim
              </Button>
            )}
            <Button variant="primary" size="sm"><FileText className="h-3.5 w-3.5 mr-1" /> Documents</Button>
          </div>
        </div>
      )}

      {/* Endorsements Tab */}
      {activeTab === 'endorsements' && <EndorsementsTab policy={policy} />}

      {/* Billing Tab */}
      {activeTab === 'billing' && <BillingTab policy={policy} />}
    </Modal>
  );
}

/* ── Create Policy Modal ─────────────────────────────────── */

function CreatePolicyModal({ open, onClose, onCreate }) {
  const [form, setForm] = useState({
    product_type: 'term_life', coverage_amount: '', premium_amount: '',
    premium_frequency: 'monthly', effective_date: '',
    notes: '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.coverage_amount || !form.premium_amount || !form.effective_date) {
      setError('Coverage amount, premium, and effective date are required.');
      return;
    }
    setSaving(true); setError('');
    try {
      const created = await insuranceService.createPolicy(form);
      onCreate(created?.data ?? created);
      onClose();
      setForm({ product_type: 'term_life', coverage_amount: '', premium_amount: '', premium_frequency: 'monthly', effective_date: '', notes: '' });
    } catch (err) {
      setError(err?.response?.data?.message ?? err.message ?? 'Failed to create policy');
    } finally { setSaving(false); }
  };

  return (
    <Modal open={open} onClose={onClose} title="Add New Policy" size="md">
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && <p className="rounded-lg bg-red-50 dark:bg-red-900/20 px-3 py-2 text-sm text-red-600 dark:text-red-400">{error}</p>}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Product Type *</label>
            <select className="input w-full" value={form.product_type} onChange={e => set('product_type', e.target.value)}>
              {PRODUCT_TYPES.map(t => <option key={t} value={t}>{PRODUCT_LABELS[t]}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Payment Frequency</label>
            <select className="input w-full" value={form.premium_frequency} onChange={e => set('premium_frequency', e.target.value)}>
              {Object.entries(FREQ_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Coverage Amount *</label>
            <input type="number" className="input w-full" placeholder="500000" value={form.coverage_amount} onChange={e => set('coverage_amount', e.target.value)} />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Premium Amount *</label>
            <input type="number" className="input w-full" placeholder="450" value={form.premium_amount} onChange={e => set('premium_amount', e.target.value)} />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Effective Date *</label>
            <input type="date" className="input w-full" value={form.effective_date} onChange={e => set('effective_date', e.target.value)} />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Expiry Date</label>
            <input type="date" className="input w-full" value={form.expiry_date ?? ''} onChange={e => set('expiry_date', e.target.value)} />
          </div>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Notes</label>
          <textarea className="input w-full h-20 resize-none" placeholder="Additional notes…" value={form.notes} onChange={e => set('notes', e.target.value)} />
        </div>
        <div className="flex justify-end gap-2 pt-2 border-t border-gray-100 dark:border-white/[0.07]">
          <Button type="button" variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="primary" size="sm" disabled={saving}>{saving ? 'Saving…' : 'Create Policy'}</Button>
        </div>
      </form>
    </Modal>
  );
}

/* ── Page ─────────────────────────────────────────────────── */

export default function PoliciesPage() {
  const navigate = useNavigate();

  const { fields: objectFields } = useResolvedObject('policy');

  const statusOptions = useMemo(() => {
    const f = objectFields.find(f => f.name === 'status');
    return f?.options ?? Object.entries(STATUS_CONFIG).map(([k, v]) => ({ value: k, label: v.label }));
  }, [objectFields]);

  const productOptions = useMemo(() => {
    const f = objectFields.find(f => f.name === 'product_type');
    return f?.options ?? PRODUCT_TYPES.map(t => ({ value: t, label: PRODUCT_LABELS[t] }));
  }, [objectFields]);

  const [policies, setPolicies]       = useState([]);
  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState('');
  const [statusFilter, setStatusFilter]   = useState('');
  const [productFilter, setProductFilter] = useState('');
  const [searchTerm, setSearchTerm]       = useState('');
  const [detailPolicy, setDetailPolicy]   = useState(null);
  const [showCreate, setShowCreate]       = useState(false);

  const handleFileClaim = useCallback((policy) => {
    const params = new URLSearchParams();
    params.set('policy_id', policy.id);
    params.set('policy_number', policy.policy_number);
    params.set('amount', policy.coverage_amount);
    navigate(`/insurance/claims?${params.toString()}`);
  }, [navigate]);

  const handleRenew = useCallback(async (policy) => {
    try {
      await insuranceService.createRenewalTask({ policy_id: policy.id });
      showSuccess(`Renewal task created for policy ${policy.policy_number}.`);
    } catch (err) {
      showError(err?.response?.data?.message ?? 'Failed to create renewal task');
    }
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = {};
      if (statusFilter)  params.status       = statusFilter;
      if (productFilter) params.product_type = productFilter;
      if (searchTerm)    params.search       = searchTerm;
      const res = await insuranceService.listPolicies(params);
      setPolicies(res?.data?.policies ?? res?.policies ?? []);
    } catch (err) {
      setError(err?.response?.data?.message ?? 'Failed to load policies');
    } finally { setLoading(false); }
  }, [statusFilter, productFilter, searchTerm]);

  useEffect(() => { load(); }, [load]);

  const activePolicies = useMemo(() => policies.filter(p => p.status === 'active'), [policies]);
  const totalCoverage  = useMemo(() => activePolicies.reduce((s, p) => s + Number(p.coverage_amount ?? 0), 0), [activePolicies]);
  const avgPremium     = useMemo(() => activePolicies.length ? Math.round(activePolicies.reduce((s, p) => s + Number(p.premium_amount ?? 0), 0) / activePolicies.length) : 0, [activePolicies]);
  const renewalSoon    = useMemo(() => policies.filter(p => {
    if (!p.renewal_due_date) return false;
    const diff = (new Date(p.renewal_due_date) - new Date()) / (1000 * 60 * 60 * 24);
    return diff >= 0 && diff <= 90;
  }).length, [policies]);

  const columns = [
    { key: 'policy_number', label: 'Policy Number', sortable: true, render: (v) => <span className="font-mono text-xs font-semibold text-primary-600 dark:text-primary-400">{v}</span> },
    { key: 'contact', label: 'Policyholder', sortable: false, render: (_, row) => <span className="font-medium text-gray-900 dark:text-gray-100">{holderName(row)}</span> },
    { key: 'product_type', label: 'Product', sortable: true, render: (v) => <Badge variant="primary">{PRODUCT_LABELS[v] ?? v}</Badge> },
    { key: 'coverage_amount', label: 'Coverage', sortable: true, render: (v) => <span className="font-semibold text-gray-800 dark:text-gray-200">{fmt(v)}</span> },
    { key: 'premium_amount', label: 'Premium', sortable: true, render: (v, row) => <span className="text-gray-700 dark:text-gray-300">{fmt(v)}<span className="text-gray-400 dark:text-gray-500 text-xs">/{(row.premium_frequency ?? 'mo').replace('monthly', 'mo').replace('annual', 'yr')}</span></span> },
    { key: 'status', label: 'Status', sortable: true, render: (v) => { const cfg = STATUS_CONFIG[v] ?? STATUS_CONFIG.active; return <Badge variant={cfg.variant} dot>{cfg.label}</Badge>; } },
    { key: 'effective_date', label: 'Effective', sortable: true, render: (v) => <span className="text-gray-600 dark:text-gray-400 text-xs">{fmtDate(v)}</span> },
    { key: 'renewal_due_date', label: 'Renewal Due', sortable: true, render: (v) => v ? <span className={`text-xs ${new Date(v) < new Date() ? 'text-red-600 dark:text-red-400 font-semibold' : 'text-gray-600 dark:text-gray-400'}`}>{fmtDate(v)}</span> : <span className="text-gray-400 dark:text-gray-500 text-xs">—</span> },
    {
      key: 'id', label: '', width: '120px',
      render: (_, row) => (
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="xs" onClick={() => setDetailPolicy(row)} title="View Details"><Eye className="h-3.5 w-3.5" /></Button>
          {row.status === 'active' && (
            <Button variant="ghost" size="xs" onClick={() => handleFileClaim(row)} title="File Claim"><AlertTriangle className="h-3.5 w-3.5 text-amber-500 dark:text-amber-400" /></Button>
          )}
          {isRenewalDueSoon(row) && (
            <Button variant="ghost" size="xs" onClick={() => handleRenew(row)} title="Renew Policy"><RefreshCw className="h-3.5 w-3.5 text-primary-500 dark:text-primary-400" /></Button>
          )}
          <Button variant="ghost" size="xs" title="View Documents"><FileText className="h-3.5 w-3.5" /></Button>
        </div>
      ),
    },
  ];

  return (
    <div className="min-h-full bg-surface px-4 py-8">
      <div className="mx-auto max-w-7xl space-y-6">

        {/* Header */}
        <PageHeader
          icon={Shield}
          eyebrow="Insurance"
          title="Policies"
          subtitle="Manage life insurance policies, track coverage, and monitor renewals."
          className="!mb-0"
          actions={(
            <>
              <Button variant="secondary" size="sm" onClick={load} title="Refresh"><RefreshCw className="h-4 w-4" /></Button>
              <Button variant="primary" size="sm" onClick={() => setShowCreate(true)}><Plus className="h-4 w-4" /> New Policy</Button>
            </>
          )}
        />

        {/* KPI tiles */}
        <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
          <StatTile label="Total Active"      value={activePolicies.length} icon={CheckCircle2} tone="emerald" />
          <StatTile label="Total Coverage"    value={fmt(totalCoverage)}    icon={Shield}       tone="primary" />
          <StatTile label="Avg Premium"       value={fmt(avgPremium)}       icon={DollarSign}   tone="sky" />
          <StatTile label="Renewing ≤90 days" value={renewalSoon}           icon={Clock}        tone="amber" />
        </div>

        {/* Filters */}
        <div className="card px-6 py-4">
          <div className="flex flex-wrap items-end gap-4">
            <div className="flex-1 min-w-[200px] max-w-xs">
              <Input label="Search" placeholder="Policy number…" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} prefix={<Search className="h-3.5 w-3.5" />} />
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
          {error && <p className="mt-2 text-sm text-red-600 dark:text-red-400">{error}</p>}
        </div>

        {/* Table */}
        <div className="card overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center py-16 text-gray-400 dark:text-gray-500">
              <RefreshCw className="h-5 w-5 animate-spin mr-2" /> Loading policies…
            </div>
          ) : (
            <DataTable frame={false} data={policies} columns={columns} searchable={false} onRowClick={setDetailPolicy} emptyText="No policies found. Create one to get started." />
          )}
        </div>
      </div>

      {/* Detail Modal */}
      <PolicyDetailModal policy={detailPolicy} onClose={() => setDetailPolicy(null)} onFileClaim={handleFileClaim} />

      <CreatePolicyModal open={showCreate} onClose={() => setShowCreate(false)} onCreate={(p) => { setPolicies(prev => [p, ...prev]); }} />
    </div>
  );
}
