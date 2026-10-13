import { useState, useEffect, useCallback } from 'react';
import {
  Briefcase, RefreshCw, Clock, AlertTriangle, ShieldCheck, ShieldAlert,
  Play, Phone, CheckCircle2, XCircle,
} from 'lucide-react';
import Button from '../../components/ui/Button';
import Badge from '../../components/ui/Badge';
import DataTable from '../../components/ui/DataTable';
import PageHeader from '../../components/ui/PageHeader';
import StatTile from '../../components/ui/StatTile';
import { insuranceService } from '../../services/insurance.service';
import { useAuthStore } from '../../store/authStore';
import { showError } from '../../utils/dialog';
import { fmtCurrency } from '../../utils/formatters';

/* ── Config ──────────────────────────────────────────────── */

const RENEWAL_STATUS_CONFIG = {
  pending:     { label: 'Pending',     variant: 'warning' },
  in_progress: { label: 'In Progress', variant: 'info' },
  completed:   { label: 'Completed',   variant: 'success' },
  lapsed:      { label: 'Lapsed',      variant: 'danger' },
};

const COMPLIANCE_STATUS_CONFIG = {
  pending:   { label: 'Pending',   variant: 'warning' },
  completed: { label: 'Completed', variant: 'success' },
  waived:    { label: 'Waived',    variant: 'default' },
  overdue:   { label: 'Overdue',   variant: 'danger' },
};

// Money renders in the tenant's currency (BUILDER > Settings > Localization).
const fmt = (n) => fmtCurrency(n);
const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }) : '—';

/* ── Helpers ─────────────────────────────────────────────── */

/* ── Page ─────────────────────────────────────────────────── */

export default function AgentWorkbenchPage() {
  const employee = useAuthStore((s) => s.employee);

  const [renewals, setRenewals]         = useState([]);
  const [compliance, setCompliance]     = useState([]);
  const [loading, setLoading]           = useState(true);
  const [error, setError]               = useState('');
  const [updatingId, setUpdatingId]     = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await insuranceService.getAgentWorkbench(employee?.id);
      const data = res?.data ?? res ?? {};
      setRenewals(data.renewals ?? []);
      setCompliance(data.compliance ?? []);
    } catch (err) {
      setError(err?.response?.data?.message ?? 'Failed to load workbench data');
    } finally {
      setLoading(false);
    }
  }, [employee?.id]);

  useEffect(() => { load(); }, [load]);

  /* ── Computed stats ─────────────────────────────────────── */

  const now = new Date();
  const renewals30 = renewals.filter((r) => {
    if (!r.renewal_date) return false;
    const diff = (new Date(r.renewal_date) - now) / (1000 * 60 * 60 * 24);
    return diff >= 0 && diff <= 30;
  }).length;

  const renewals90 = renewals.filter((r) => {
    if (!r.renewal_date) return false;
    const diff = (new Date(r.renewal_date) - now) / (1000 * 60 * 60 * 24);
    return diff >= 0 && diff <= 90;
  }).length;

  const compliancePending = compliance.filter((c) => c.status === 'pending').length;
  const complianceOverdue = compliance.filter((c) => c.status === 'overdue').length;

  /* ── Renewal actions ────────────────────────────────────── */

  const handleStartRenewal = async (renewal) => {
    setUpdatingId(renewal.id);
    try {
      await insuranceService.updateRenewal(renewal.id, { status: 'in_progress' });
      await load();
    } catch (err) {
      showError(err?.response?.data?.message ?? err.message ?? 'Failed to start renewal');
    } finally {
      setUpdatingId(null);
    }
  };

  const handleContact = async (renewal) => {
    setUpdatingId(renewal.id);
    try {
      await insuranceService.updateRenewal(renewal.id, {
        outreach_count: (renewal.outreach_count ?? 0) + 1,
      });
      await load();
    } catch (err) {
      showError(err?.response?.data?.message ?? err.message ?? 'Failed to log contact');
    } finally {
      setUpdatingId(null);
    }
  };

  /* ── Compliance actions ─────────────────────────────────── */

  const handleCompleteCompliance = async (item) => {
    setUpdatingId(item.id);
    try {
      await insuranceService.updateCompliance(item.id, { status: 'completed' });
      await load();
    } catch (err) {
      showError(err?.response?.data?.message ?? err.message ?? 'Failed to complete');
    } finally {
      setUpdatingId(null);
    }
  };

  const handleWaiveCompliance = async (item) => {
    setUpdatingId(item.id);
    try {
      await insuranceService.updateCompliance(item.id, { status: 'waived' });
      await load();
    } catch (err) {
      showError(err?.response?.data?.message ?? err.message ?? 'Failed to waive');
    } finally {
      setUpdatingId(null);
    }
  };

  /* ── Column definitions ─────────────────────────────────── */

  const renewalColumns = [
    { key: 'policy_number', label: 'Policy #', sortable: true, render: (v) => <span className="font-mono text-xs font-semibold text-primary-600">{v}</span> },
    { key: 'client_name', label: 'Client Name', sortable: true, render: (v) => <span className="font-medium text-gray-900 dark:text-gray-100">{v ?? '—'}</span> },
    { key: 'product', label: 'Product', sortable: true, render: (v) => <Badge variant="primary">{v ?? '—'}</Badge> },
    { key: 'coverage', label: 'Coverage', sortable: true, render: (v) => <span className="font-semibold text-gray-800 dark:text-gray-200">{fmt(v)}</span> },
    { key: 'premium', label: 'Premium', sortable: true, render: (v) => <span className="text-gray-700 dark:text-gray-300">{fmt(v)}</span> },
    {
      key: 'renewal_date', label: 'Renewal Date', sortable: true,
      render: (v) => {
        if (!v) return <span className="text-gray-400 text-xs">—</span>;
        const diff = (new Date(v) - now) / (1000 * 60 * 60 * 24);
        const urgent = diff >= 0 && diff <= 30;
        return <span className={`text-xs ${urgent ? 'text-amber-600 font-semibold' : 'text-gray-600 dark:text-gray-400'}`}>{fmtDate(v)}</span>;
      },
    },
    {
      key: 'status', label: 'Status', sortable: true,
      render: (v) => {
        const cfg = RENEWAL_STATUS_CONFIG[v] ?? RENEWAL_STATUS_CONFIG.pending;
        return <Badge variant={cfg.variant} dot>{cfg.label}</Badge>;
      },
    },
    {
      key: 'id', label: '', width: '120px',
      render: (_, row) => (
        <div className="flex items-center gap-1">
          {row.status === 'pending' && (
            <Button variant="ghost" size="xs" title="Start Renewal" className="text-primary-500 hover:bg-primary-50" onClick={() => handleStartRenewal(row)} disabled={updatingId === row.id}>
              <Play className="h-3.5 w-3.5" />
            </Button>
          )}
          <Button variant="ghost" size="xs" title="Contact" className="text-blue-500 hover:bg-blue-50" onClick={() => handleContact(row)} disabled={updatingId === row.id}>
            <Phone className="h-3.5 w-3.5" />
          </Button>
        </div>
      ),
    },
  ];

  const complianceColumns = [
    { key: 'type', label: 'Type', sortable: true, render: (v) => <Badge variant="purple">{v ?? '—'}</Badge> },
    { key: 'linked_entity', label: 'Linked Entity', sortable: true, render: (v) => <span className="font-medium text-gray-900 dark:text-gray-100">{v ?? '—'}</span> },
    {
      key: 'status', label: 'Status', sortable: true,
      render: (v) => {
        const cfg = COMPLIANCE_STATUS_CONFIG[v] ?? COMPLIANCE_STATUS_CONFIG.pending;
        return <Badge variant={cfg.variant} dot>{cfg.label}</Badge>;
      },
    },
    { key: 'created_at', label: 'Created', sortable: true, render: (v) => <span className="text-gray-600 dark:text-gray-400 text-xs">{fmtDate(v)}</span> },
    {
      key: 'expires_at', label: 'Expires', sortable: true,
      render: (v) => {
        if (!v) return <span className="text-gray-400 text-xs">—</span>;
        const overdue = new Date(v) < now;
        return <span className={`text-xs ${overdue ? 'text-red-600 font-semibold' : 'text-gray-600 dark:text-gray-400'}`}>{fmtDate(v)}</span>;
      },
    },
    {
      key: 'id', label: '', width: '140px',
      render: (_, row) => (
        <div className="flex items-center gap-1">
          {(row.status === 'pending' || row.status === 'overdue') && (
            <>
              <Button variant="ghost" size="xs" title="Complete" className="text-emerald-500 hover:bg-emerald-50" onClick={() => handleCompleteCompliance(row)} disabled={updatingId === row.id}>
                <CheckCircle2 className="h-3.5 w-3.5" />
              </Button>
              <Button variant="ghost" size="xs" title="Waive" className="text-gray-400 hover:bg-gray-50" onClick={() => handleWaiveCompliance(row)} disabled={updatingId === row.id}>
                <XCircle className="h-3.5 w-3.5" />
              </Button>
            </>
          )}
        </div>
      ),
    },
  ];

  /* ── Render ─────────────────────────────────────────────── */

  return (
    <div className="min-h-full bg-surface px-4 py-8">
      <div className="mx-auto max-w-7xl space-y-6">

        {/* Header */}
        <PageHeader
          icon={Briefcase}
          eyebrow="Insurance"
          title="Agent Workbench"
          subtitle="Manage upcoming renewals and outstanding compliance artifacts."
          className="!mb-0"
          actions={<Button variant="secondary" size="sm" onClick={load} title="Refresh"><RefreshCw className="h-4 w-4" /></Button>}
        />

        {/* KPI tiles */}
        <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
          <StatTile label="Renewals Due (30 days)" value={renewals30}        icon={Clock}         tone="amber" />
          <StatTile label="Renewals Due (90 days)" value={renewals90}        icon={AlertTriangle} tone="sky" />
          <StatTile label="Compliance Pending"     value={compliancePending} icon={ShieldCheck}   tone="primary" />
          <StatTile label="Compliance Overdue"     value={complianceOverdue} icon={ShieldAlert}   tone="rose" />
        </div>

        {error && (
          <div className="card px-6 py-4">
            <p className="text-sm text-red-600">{error}</p>
          </div>
        )}

        {/* Upcoming Renewals */}
        <div className="card overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100 dark:border-white/[0.07]">
            <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Upcoming Renewals</h2>
          </div>
          {loading ? (
            <div className="flex items-center justify-center py-16 text-gray-400">
              <RefreshCw className="h-5 w-5 animate-spin mr-2" /> Loading renewals…
            </div>
          ) : (
            <DataTable frame={false} data={renewals} columns={renewalColumns} searchable={false} emptyText="No upcoming renewals." />
          )}
        </div>

        {/* Outstanding Compliance */}
        <div className="card overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100 dark:border-white/[0.07]">
            <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Outstanding Compliance</h2>
          </div>
          {loading ? (
            <div className="flex items-center justify-center py-16 text-gray-400">
              <RefreshCw className="h-5 w-5 animate-spin mr-2" /> Loading compliance items…
            </div>
          ) : (
            <DataTable frame={false} data={compliance} columns={complianceColumns} searchable={false} emptyText="No outstanding compliance items." />
          )}
        </div>
      </div>
    </div>
  );
}
