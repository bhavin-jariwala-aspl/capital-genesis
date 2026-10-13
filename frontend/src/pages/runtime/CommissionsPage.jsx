import { useState, useEffect, useCallback, useMemo } from 'react';
import { useResolvedObject } from '../../hooks/useResolvedObject';
import {
  DollarSign, RefreshCw, Search, XCircle, Eye, CheckCircle2,
  AlertOctagon, TrendingUp, FileText, UserCheck, Plus, RotateCcw, Ban,
} from 'lucide-react';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import Select from '../../components/ui/Select';
import Badge from '../../components/ui/Badge';
import DataTable from '../../components/ui/DataTable';
import Modal from '../../components/ui/Modal';
import TabbedWorkspace from '../../components/ui/TabbedWorkspace';
import PageHeader from '../../components/ui/PageHeader';
import StatTile from '../../components/ui/StatTile';
import { insuranceService } from '../../services/insurance.service';
import { fmtCurrency as fmt, fmtPct, fmtDate } from '../../utils/formatters';
import { showError, showWarning, confirmDialog } from '../../utils/dialog';

/* ── Config ──────────────────────────────────────────────── */

const STATUS_CONFIG = {
  pending:     { label: 'Pending',     variant: 'info' },
  approved:    { label: 'Approved',    variant: 'warning' },
  paid:        { label: 'Paid',        variant: 'success' },
  clawed_back: { label: 'Clawed Back', variant: 'danger' },
  cancelled:   { label: 'Cancelled',   variant: 'default' },
};

const PRODUCT_TYPE_MAP = {
  term_life:         { label: 'Term Life',         variant: 'info' },
  whole_life:        { label: 'Whole Life',        variant: 'success' },
  universal_life:    { label: 'Universal Life',    variant: 'purple' },
  variable_life:     { label: 'Variable Life',     variant: 'warning' },
  indexed_universal: { label: 'Indexed UL',        variant: 'default' },
  final_expense:     { label: 'Final Expense',     variant: 'default' },
  group_life:        { label: 'Group Life',        variant: 'default' },
  annuity:           { label: 'Annuity',           variant: 'default' },
};

const STATEMENT_STATUS_CONFIG = {
  pending:     { label: 'Pending',     variant: 'info' },
  reconciled:  { label: 'Reconciled',  variant: 'success' },
  variance:    { label: 'Variance',    variant: 'danger' },
  in_review:   { label: 'In Review',   variant: 'warning' },
};

const APPOINTMENT_STATUS_CONFIG = {
  active:      { label: 'Active',      variant: 'success' },
  pending:     { label: 'Pending',     variant: 'info' },
  terminated:  { label: 'Terminated',  variant: 'danger' },
  expired:     { label: 'Expired',     variant: 'default' },
  suspended:   { label: 'Suspended',   variant: 'warning' },
};

const LICENSE_TYPE_OPTIONS = [
  { value: 'life',      label: 'Life' },
  { value: 'health',    label: 'Health' },
  { value: 'p_and_c',   label: 'P&C' },
  { value: 'variable',  label: 'Variable' },
];

const TABS = [
  { key: 'commissions', label: 'Commissions',  icon: DollarSign },
  { key: 'statements',  label: 'Statements',   icon: FileText },
  { key: 'appointments', label: 'Appointments', icon: UserCheck },
];


/* ── Clawback modal ──────────────────────────────────────── */

function ClawbackModal({ entry, open, onClose, onSaved }) {
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSubmit = async () => {
    if (!reason.trim()) { showWarning('A reason is required for clawbacks.'); return; }
    setSaving(true);
    try {
      await insuranceService.updateCommissionStatus(entry.id, 'clawed_back', reason.trim());
      onSaved();
      onClose();
      setReason('');
    } catch (err) { showError(err?.response?.data?.message ?? err.message ?? 'Failed'); }
    finally { setSaving(false); }
  };

  return (
    <Modal open={open} onClose={onClose} title="Clawback Commission" size="sm">
      <div className="space-y-4">
        <p className="text-sm text-gray-600 dark:text-gray-400">You are about to claw back commission entry <span className="font-semibold">{entry?.id}</span> ({fmt(entry?.commission_amount)}). This action will update the status to <strong>Clawed Back</strong>.</p>
        <div>
          <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Reason</label>
          <textarea className="input w-full h-16 resize-none" placeholder="Reason for clawback…" value={reason} onChange={e => setReason(e.target.value)} />
        </div>
        <div className="flex justify-end gap-2 pt-2 border-t border-gray-100 dark:border-white/[0.07]">
          <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
          <Button variant="danger" size="sm" onClick={handleSubmit} disabled={saving || !reason.trim()}>{saving ? 'Saving…' : 'Claw Back'}</Button>
        </div>
      </div>
    </Modal>
  );
}

/* ── Add Statement modal ─────────────────────────────────── */

function AddStatementModal({ open, onClose, onSaved, carriers }) {
  const [form, setForm] = useState({ carrier_id: '', statement_period: '', received_date: '', total_actual: '' });
  const [saving, setSaving] = useState(false);

  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));

  const handleSubmit = async () => {
    if (!form.carrier_id || !form.statement_period || !form.received_date || !form.total_actual) {
      showWarning('All fields are required.'); return;
    }
    setSaving(true);
    try {
      await insuranceService.createStatement({
        carrier_id: Number(form.carrier_id),
        statement_period: form.statement_period,
        received_date: form.received_date,
        total_actual: Number(form.total_actual),
      });
      onSaved();
      onClose();
      setForm({ carrier_id: '', statement_period: '', received_date: '', total_actual: '' });
    } catch (err) { showError(err?.response?.data?.message ?? err.message ?? 'Failed'); }
    finally { setSaving(false); }
  };

  return (
    <Modal open={open} onClose={onClose} title="Add Commission Statement" size="md">
      <div className="space-y-4">
        <Select label="Carrier" placeholder="Select carrier…" value={form.carrier_id} onChange={set('carrier_id')}
          options={carriers.map(c => ({ value: String(c.id), label: c.carrier_name ?? c.name ?? `Carrier #${c.id}` }))} />
        <Input label="Statement Period" placeholder="e.g. 2026-03" value={form.statement_period} onChange={set('statement_period')} />
        <Input label="Received Date" type="date" value={form.received_date} onChange={set('received_date')} />
        <Input label="Total Actual Amount" type="number" placeholder="0" value={form.total_actual} onChange={set('total_actual')} />
        <div className="flex justify-end gap-2 pt-2 border-t border-gray-100 dark:border-white/[0.07]">
          <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
          <Button variant="primary" size="sm" onClick={handleSubmit} disabled={saving}>{saving ? 'Saving…' : 'Add Statement'}</Button>
        </div>
      </div>
    </Modal>
  );
}

/* ── Add Appointment modal ───────────────────────────────── */

function AddAppointmentModal({ open, onClose, onSaved, carriers }) {
  const [form, setForm] = useState({ agent_id: '', carrier_id: '', state_code: '', license_number: '', license_type: '', appointment_status: 'pending' });
  const [saving, setSaving] = useState(false);

  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));

  const handleSubmit = async () => {
    if (!form.agent_id || !form.carrier_id || !form.state_code || !form.license_number || !form.license_type) {
      showWarning('All fields are required.'); return;
    }
    setSaving(true);
    try {
      await insuranceService.createAppointment({
        agent_id: Number(form.agent_id),
        carrier_id: Number(form.carrier_id),
        state_code: form.state_code,
        license_number: form.license_number,
        license_type: form.license_type,
        appointment_status: form.appointment_status,
      });
      onSaved();
      onClose();
      setForm({ agent_id: '', carrier_id: '', state_code: '', license_number: '', license_type: '', appointment_status: 'pending' });
    } catch (err) { showError(err?.response?.data?.message ?? err.message ?? 'Failed'); }
    finally { setSaving(false); }
  };

  return (
    <Modal open={open} onClose={onClose} title="Add Producer Appointment" size="md">
      <div className="space-y-4">
        <Input label="Agent ID" type="number" placeholder="Agent ID" value={form.agent_id} onChange={set('agent_id')} />
        <Select label="Carrier" placeholder="Select carrier…" value={form.carrier_id} onChange={set('carrier_id')}
          options={carriers.map(c => ({ value: String(c.id), label: c.carrier_name ?? c.name ?? `Carrier #${c.id}` }))} />
        <Input label="State Code" placeholder="e.g. CA" value={form.state_code} onChange={set('state_code')} />
        <Input label="License Number" placeholder="License #" value={form.license_number} onChange={set('license_number')} />
        <Select label="License Type" placeholder="Select type…" value={form.license_type} onChange={set('license_type')} options={LICENSE_TYPE_OPTIONS} />
        <Select label="Status" value={form.appointment_status} onChange={set('appointment_status')}
          options={Object.entries(APPOINTMENT_STATUS_CONFIG).map(([k, v]) => ({ value: k, label: v.label }))} />
        <div className="flex justify-end gap-2 pt-2 border-t border-gray-100 dark:border-white/[0.07]">
          <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
          <Button variant="primary" size="sm" onClick={handleSubmit} disabled={saving}>{saving ? 'Saving…' : 'Add Appointment'}</Button>
        </div>
      </div>
    </Modal>
  );
}

/* ── Statements Tab ──────────────────────────────────────── */

function StatementsTab() {
  const [statements, setStatements]     = useState([]);
  const [loading, setLoading]           = useState(true);
  const [error, setError]               = useState('');
  const [carriers, setCarriers]         = useState([]);
  const [carrierFilter, setCarrierFilter] = useState('');
  const [periodFilter, setPeriodFilter] = useState('');
  const [showAdd, setShowAdd]           = useState(false);
  const [reconcilingId, setReconcilingId] = useState(null);

  const loadCarriers = useCallback(async () => {
    try {
      const res = await insuranceService.listCarriers();
      setCarriers(res?.data?.carriers ?? res?.carriers ?? []);
    } catch { /* ignore */ }
  }, []);

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const params = {};
      if (carrierFilter) params.carrier_id = carrierFilter;
      if (periodFilter)  params.statement_period = periodFilter;
      const res = await insuranceService.listStatements(params);
      setStatements(res?.data?.statements ?? res?.statements ?? []);
    } catch (err) { setError(err?.response?.data?.message ?? 'Failed to load statements'); }
    finally { setLoading(false); }
  }, [carrierFilter, periodFilter]);

  useEffect(() => { loadCarriers(); }, [loadCarriers]);
  useEffect(() => { load(); }, [load]);

  const handleReconcile = async (row) => {
    setReconcilingId(row.id);
    try { await insuranceService.reconcileStatement(row.id); await load(); }
    catch (err) { showError(err?.response?.data?.message ?? err.message ?? 'Reconciliation failed'); }
    finally { setReconcilingId(null); }
  };

  const columns = [
    { key: 'id', label: 'Statement Ref', sortable: true, render: (v) => <span className="font-mono text-xs text-gray-500">#{v}</span> },
    { key: 'carrier', label: 'Carrier', sortable: false, render: (_, row) => <span className="font-medium text-gray-900 dark:text-gray-100">{row.carrier?.carrier_name ?? row.carrier?.name ?? '—'}</span> },
    { key: 'statement_period', label: 'Period', sortable: true, render: (v) => <span className="text-sm text-gray-700 dark:text-gray-300">{v ?? '—'}</span> },
    { key: 'total_expected', label: 'Expected', sortable: true, render: (v) => <span className="text-gray-700 dark:text-gray-300">{fmt(v)}</span> },
    { key: 'total_actual', label: 'Actual', sortable: true, render: (v) => <span className="text-gray-700 dark:text-gray-300">{fmt(v)}</span> },
    {
      key: 'variance', label: 'Variance', sortable: true,
      render: (_, row) => {
        const variance = (Number(row.total_actual ?? 0)) - (Number(row.total_expected ?? 0));
        const isNeg = variance < 0;
        return <span className={`font-semibold ${isNeg ? 'text-red-600' : 'text-gray-700 dark:text-gray-300'}`}>{fmt(variance)}</span>;
      },
    },
    {
      key: 'status', label: 'Status', sortable: true,
      render: (v) => { const cfg = STATEMENT_STATUS_CONFIG[v] ?? { label: v ?? '—', variant: 'default' }; return <Badge variant={cfg.variant} dot>{cfg.label}</Badge>; },
    },
    {
      key: '_actions', label: '', width: '80px',
      render: (_, row) => (
        <div className="flex items-center gap-1">
          {row.status !== 'reconciled' && (
            <Button variant="ghost" size="xs" title="Reconcile" className="text-primary-500 hover:bg-primary-50" onClick={() => handleReconcile(row)} disabled={reconcilingId === row.id}>
              <RotateCcw className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      ),
    },
  ];

  return (
    <>
      {/* Filters */}
      <div className="card px-6 py-4">
        <div className="flex flex-wrap items-end gap-4">
          <div className="w-52">
            <Select label="Carrier" placeholder="All Carriers" value={carrierFilter} onChange={e => setCarrierFilter(e.target.value)}
              options={carriers.map(c => ({ value: String(c.id), label: c.carrier_name ?? c.name ?? `Carrier #${c.id}` }))} />
          </div>
          <div className="flex-1 min-w-[160px] max-w-xs">
            <Input label="Period" placeholder="e.g. 2026-03" value={periodFilter} onChange={e => setPeriodFilter(e.target.value)} />
          </div>
          {(carrierFilter || periodFilter) && (
            <Button variant="ghost" size="sm" onClick={() => { setCarrierFilter(''); setPeriodFilter(''); }}>
              <XCircle className="h-3.5 w-3.5" /> Clear
            </Button>
          )}
          <div className="ml-auto">
            <Button variant="primary" size="sm" onClick={() => setShowAdd(true)}><Plus className="h-3.5 w-3.5" /> Add Statement</Button>
          </div>
        </div>
        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      </div>

      {/* Table */}
      <div className="card overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16 text-gray-400">
            <RefreshCw className="h-5 w-5 animate-spin mr-2" /> Loading statements…
          </div>
        ) : (
          <DataTable frame={false} data={statements} columns={columns} searchable={false} emptyText="No commission statements found." />
        )}
      </div>

      <AddStatementModal open={showAdd} onClose={() => setShowAdd(false)} onSaved={load} carriers={carriers} />
    </>
  );
}

/* ── Appointments Tab ────────────────────────────────────── */

function AppointmentsTab() {
  const [appointments, setAppointments] = useState([]);
  const [loading, setLoading]           = useState(true);
  const [error, setError]               = useState('');
  const [carriers, setCarriers]         = useState([]);
  const [agentFilter, setAgentFilter]   = useState('');
  const [carrierFilter, setCarrierFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [showAdd, setShowAdd]           = useState(false);
  const [terminatingId, setTerminatingId] = useState(null);

  const loadCarriers = useCallback(async () => {
    try {
      const res = await insuranceService.listCarriers();
      setCarriers(res?.data?.carriers ?? res?.carriers ?? []);
    } catch { /* ignore */ }
  }, []);

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const params = {};
      if (agentFilter)   params.agent_id = agentFilter;
      if (carrierFilter) params.carrier_id = carrierFilter;
      if (statusFilter)  params.appointment_status = statusFilter;
      const res = await insuranceService.listAppointments(params);
      setAppointments(res?.data?.appointments ?? res?.appointments ?? []);
    } catch (err) { setError(err?.response?.data?.message ?? 'Failed to load appointments'); }
    finally { setLoading(false); }
  }, [agentFilter, carrierFilter, statusFilter]);

  useEffect(() => { loadCarriers(); }, [loadCarriers]);
  useEffect(() => { load(); }, [load]);

  const handleTerminate = async (row) => {
    const who = row.agent?.employee_name ?? `Agent #${row.agent_id}`;
    if (!(await confirmDialog({
      tone: 'warning',
      title: 'Terminate appointment',
      message: `${who}’s appointment will be marked terminated and they stop earning on it.`,
      confirmLabel: 'Terminate',
    }))) return;
    setTerminatingId(row.id);
    try { await insuranceService.updateAppointment(row.id, { appointment_status: 'terminated' }); await load(); }
    catch (err) { showError(err?.response?.data?.message ?? err.message ?? 'Failed to terminate'); }
    finally { setTerminatingId(null); }
  };

  const columns = [
    { key: 'agent', label: 'Agent', sortable: false, render: (_, row) => <span className="font-medium text-gray-900 dark:text-gray-100">{row.agent?.employee_name ?? `Agent #${row.agent_id ?? '—'}`}</span> },
    { key: 'carrier', label: 'Carrier', sortable: false, render: (_, row) => <span className="text-gray-700 dark:text-gray-300">{row.carrier?.carrier_name ?? row.carrier?.name ?? '—'}</span> },
    { key: 'state_code', label: 'State', sortable: true, render: (v) => <span className="font-mono text-xs text-gray-600 dark:text-gray-400">{v ?? '—'}</span> },
    { key: 'license_number', label: 'License#', sortable: true, render: (v) => <span className="font-mono text-xs text-primary-600">{v ?? '—'}</span> },
    {
      key: 'license_type', label: 'Type', sortable: true,
      render: (v) => {
        const found = LICENSE_TYPE_OPTIONS.find(o => o.value === v);
        return <span className="text-sm text-gray-700 dark:text-gray-300">{found?.label ?? v ?? '—'}</span>;
      },
    },
    {
      key: 'appointment_status', label: 'Status', sortable: true,
      render: (v) => { const cfg = APPOINTMENT_STATUS_CONFIG[v] ?? { label: v ?? '—', variant: 'default' }; return <Badge variant={cfg.variant} dot>{cfg.label}</Badge>; },
    },
    { key: 'appointed_date', label: 'Appointed', sortable: true, render: (v) => <span className="text-xs text-gray-500">{fmtDate(v)}</span> },
    { key: 'expiration_date', label: 'Expires', sortable: true, render: (v) => <span className="text-xs text-gray-500">{fmtDate(v)}</span> },
    {
      key: '_actions', label: '', width: '80px',
      render: (_, row) => (
        <div className="flex items-center gap-1">
          {row.appointment_status !== 'terminated' && (
            <Button variant="ghost" size="xs" title="Terminate" className="text-red-400 hover:bg-red-50" onClick={() => handleTerminate(row)} disabled={terminatingId === row.id}>
              <Ban className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      ),
    },
  ];

  return (
    <>
      {/* Filters */}
      <div className="card px-6 py-4">
        <div className="flex flex-wrap items-end gap-4">
          <div className="flex-1 min-w-[160px] max-w-xs">
            <Input label="Agent ID" placeholder="Filter by agent…" value={agentFilter} onChange={e => setAgentFilter(e.target.value)} />
          </div>
          <div className="w-52">
            <Select label="Carrier" placeholder="All Carriers" value={carrierFilter} onChange={e => setCarrierFilter(e.target.value)}
              options={carriers.map(c => ({ value: String(c.id), label: c.carrier_name ?? c.name ?? `Carrier #${c.id}` }))} />
          </div>
          <div className="w-44">
            <Select label="Status" placeholder="All Statuses" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
              options={Object.entries(APPOINTMENT_STATUS_CONFIG).map(([k, v]) => ({ value: k, label: v.label }))} />
          </div>
          {(agentFilter || carrierFilter || statusFilter) && (
            <Button variant="ghost" size="sm" onClick={() => { setAgentFilter(''); setCarrierFilter(''); setStatusFilter(''); }}>
              <XCircle className="h-3.5 w-3.5" /> Clear
            </Button>
          )}
          <div className="ml-auto">
            <Button variant="primary" size="sm" onClick={() => setShowAdd(true)}><Plus className="h-3.5 w-3.5" /> Add Appointment</Button>
          </div>
        </div>
        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      </div>

      {/* Table */}
      <div className="card overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16 text-gray-400">
            <RefreshCw className="h-5 w-5 animate-spin mr-2" /> Loading appointments…
          </div>
        ) : (
          <DataTable frame={false} data={appointments} columns={columns} searchable={false} emptyText="No producer appointments found." />
        )}
      </div>

      <AddAppointmentModal open={showAdd} onClose={() => setShowAdd(false)} onSaved={load} carriers={carriers} />
    </>
  );
}

/* ── Page ─────────────────────────────────────────────────── */

export default function CommissionsPage() {
  const { fields: objectFields } = useResolvedObject('commission');

  const statusOptions = useMemo(() => {
    const f = objectFields.find(f => f.name === 'status');
    return f?.options ?? Object.entries(STATUS_CONFIG).map(([k, v]) => ({ value: k, label: v.label }));
  }, [objectFields]);

  const productOptions = useMemo(() => {
    const f = objectFields.find(f => f.name === 'product_type');
    return f?.options ?? Object.keys(PRODUCT_TYPE_MAP).map(k => ({ value: k, label: PRODUCT_TYPE_MAP[k]?.label ?? k }));
  }, [objectFields]);

  const [activeTab, setActiveTab]       = useState('commissions');
  const [entries, setEntries]           = useState([]);
  const [loading, setLoading]           = useState(true);
  const [error, setError]               = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [typeFilter, setTypeFilter]     = useState('');
  const [searchTerm, setSearchTerm]     = useState('');
  const [detailEntry, setDetailEntry]   = useState(null);
  const [clawbackEntry, setClawbackEntry] = useState(null);
  const [updatingId, setUpdatingId]     = useState(null);

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const params = {};
      if (statusFilter) params.status           = statusFilter;
      if (typeFilter)   params.product_type    = typeFilter;
      if (searchTerm)   params.search           = searchTerm;
      const res = await insuranceService.listCommissions(params);
      setEntries(res?.data?.entries ?? res?.entries ?? []);
    } catch (err) { setError(err?.response?.data?.message ?? 'Failed to load commissions'); }
    finally { setLoading(false); }
  }, [statusFilter, typeFilter, searchTerm]);

  useEffect(() => { load(); }, [load]);

  const handleMarkPaid = async (entry) => {
    setUpdatingId(entry.id);
    try { await insuranceService.updateCommissionStatus(entry.id, 'paid'); await load(); }
    catch (err) { showError(err?.response?.data?.message ?? err.message ?? 'Failed'); }
    finally { setUpdatingId(null); }
  };

  const totalEarned    = entries.filter(e => e.status === 'paid').reduce((s, e) => s + Number(e.commission_amount ?? 0), 0);
  const totalPending   = entries.filter(e => e.status === 'pending' || e.status === 'approved').reduce((s, e) => s + Number(e.commission_amount ?? 0), 0);
  const clawbackTotal  = entries.filter(e => e.status === 'clawed_back').reduce((s, e) => s + Number(e.commission_amount ?? 0), 0);

  const columns = [
    { key: 'id', label: 'ID', sortable: true, render: (v) => <span className="font-mono text-xs text-gray-500">#{v}</span> },
    { key: 'agent', label: 'Agent', sortable: false, render: (_, row) => <span className="font-medium text-gray-900 dark:text-gray-100">{row.agent?.employee_name ?? '—'}</span> },
    { key: 'policy', label: 'Policy', sortable: false, render: (_, row) => <span className="font-mono text-xs text-primary-600">{row.policy?.policy_number ?? '—'}</span> },
    { key: 'product_type', label: 'Product', sortable: true, render: (v) => { const cfg = PRODUCT_TYPE_MAP[v] ?? { label: v ?? '—', variant: 'default' }; return <Badge variant={cfg.variant}>{cfg.label}</Badge>; } },
    { key: 'source_premium', label: 'Premium', sortable: true, render: (v) => <span className="text-gray-700 dark:text-gray-300">{fmt(v)}</span> },
    { key: 'commission_rate', label: 'Rate', sortable: true, render: (v) => <span className="text-gray-600 dark:text-gray-400">{fmtPct(v)}</span> },
    { key: 'commission_amount', label: 'Commission', sortable: true, render: (v) => <span className="font-semibold text-emerald-700">{fmt(v)}</span> },
    { key: 'status', label: 'Status', sortable: true, render: (v) => { const cfg = STATUS_CONFIG[v] ?? STATUS_CONFIG.pending; return <Badge variant={cfg.variant} dot>{cfg.label}</Badge>; } },
    { key: 'commission_period', label: 'Period', sortable: true, render: (v) => <span className="text-xs text-gray-500">{v ?? '—'}</span> },
    {
      key: 'id2', label: '', width: '100px',
      render: (_, row) => (
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="xs" title="View" onClick={() => setDetailEntry(row)}><Eye className="h-3.5 w-3.5" /></Button>
          {(row.status === 'pending' || row.status === 'approved') && (
            <Button variant="ghost" size="xs" title="Mark Paid" className="text-emerald-500 hover:bg-emerald-50" onClick={() => handleMarkPaid(row)} disabled={updatingId === row.id}>
              <CheckCircle2 className="h-3.5 w-3.5" />
            </Button>
          )}
          {row.status === 'paid' && (
            <Button variant="ghost" size="xs" title="Clawback" className="text-red-400 hover:bg-red-50" onClick={() => setClawbackEntry(row)}>
              <AlertOctagon className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="min-h-full bg-surface px-4 py-8">
      <div className="mx-auto max-w-7xl space-y-6">

        {/* Header */}
        <PageHeader
          icon={DollarSign}
          eyebrow="Insurance"
          title="Commissions"
          subtitle="Track producer commissions, payouts and clawbacks."
          className="!mb-0"
          actions={<Button variant="secondary" size="sm" onClick={load} title="Refresh"><RefreshCw className="h-4 w-4" /></Button>}
        />

        {activeTab === 'commissions' && (
          <div className="grid gap-4 grid-cols-1 sm:grid-cols-3">
            <StatTile label="Paid Out"    value={fmt(totalEarned)}  icon={CheckCircle2} tone="emerald" />
            <StatTile label="Pending"     value={fmt(totalPending)} icon={TrendingUp}   tone="amber" />
            <StatTile label="Clawed Back" value={fmt(clawbackTotal)} icon={AlertOctagon} tone="rose" />
          </div>
        )}

        {/* Tab Bar — metadata-driven via TabbedWorkspace */}
        <TabbedWorkspace
          tabs={TABS}
          activeTab={activeTab}
          onTabChange={setActiveTab}
          variant="boxed"
          className="card px-4 py-2"
        >
          {() => null}
        </TabbedWorkspace>

        {/* Tab Content */}
        {activeTab === 'commissions' && (
          <>
            {/* Filters */}
            <div className="card px-6 py-4">
              <div className="flex flex-wrap items-end gap-4">
                <div className="flex-1 min-w-[200px] max-w-xs">
                  <Input label="Search" placeholder="Agent or policy…" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} prefix={<Search className="h-3.5 w-3.5" />} />
                </div>
                <div className="w-44">
                  <Select label="Status" placeholder="All Statuses" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
                    options={statusOptions} />
                </div>
                <div className="w-44">
                  <Select label="Type" placeholder="All Types" value={typeFilter} onChange={e => setTypeFilter(e.target.value)}
                    options={productOptions} />
                </div>
                {(statusFilter || typeFilter || searchTerm) && (
                  <Button variant="ghost" size="sm" onClick={() => { setStatusFilter(''); setTypeFilter(''); setSearchTerm(''); }}>
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
                  <RefreshCw className="h-5 w-5 animate-spin mr-2" /> Loading commissions…
                </div>
              ) : (
                <DataTable frame={false} data={entries} columns={columns} searchable={false} onRowClick={setDetailEntry} emptyText="No commission entries found." />
              )}
            </div>
          </>
        )}

        {activeTab === 'statements' && <StatementsTab />}
        {activeTab === 'appointments' && <AppointmentsTab />}
      </div>

      {/* Detail Modal */}
      <Modal open={!!detailEntry} onClose={() => setDetailEntry(null)} title="Commission Entry" size="md">
        {detailEntry && (
          <div className="space-y-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-lg font-bold text-gray-900 dark:text-gray-100">{fmt(detailEntry.commission_amount)}</p>
                <p className="text-sm text-gray-500 dark:text-gray-400">{detailEntry.agent?.employee_name ?? '—'}</p>
              </div>
              <Badge variant={STATUS_CONFIG[detailEntry.status]?.variant} dot>{STATUS_CONFIG[detailEntry.status]?.label}</Badge>
            </div>
            <div className="grid grid-cols-2 gap-4">
              {[
                ['Policy',      detailEntry.policy?.policy_number ?? '—'],
                ['Product',     (PRODUCT_TYPE_MAP[detailEntry.product_type]?.label ?? detailEntry.product_type) ?? '—'],
                ['Source Premium', fmt(detailEntry.source_premium)],
                ['Rate',        fmtPct(detailEntry.commission_rate)],
                ['Commission',  fmt(detailEntry.commission_amount)],
                ['Period',      detailEntry.commission_period ?? '—'],
                ['Paid Date',   fmtDate(detailEntry.paid_at)],
              ].map(([label, value]) => (
                <div key={label}><p className="text-xs font-medium text-gray-400 uppercase">{label}</p><p className="mt-1 text-sm font-medium text-gray-900 dark:text-gray-100">{value}</p></div>
              ))}
            </div>
            {detailEntry.split_agent && (
              <div><p className="text-xs font-medium text-gray-400 uppercase">Split With</p><p className="mt-1 text-sm text-gray-900 dark:text-gray-100">{detailEntry.split_agent.employee_name} — {fmtPct(detailEntry.split_percent)}</p></div>
            )}
            <div className="flex justify-end gap-2 pt-2 border-t border-gray-100 dark:border-white/[0.07]">
              <Button variant="ghost" size="sm" onClick={() => setDetailEntry(null)}>Close</Button>
            </div>
          </div>
        )}
      </Modal>

      <ClawbackModal entry={clawbackEntry} open={!!clawbackEntry} onClose={() => setClawbackEntry(null)} onSaved={load} />
    </div>
  );
}
