import { useState, useEffect, useCallback, useMemo } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import {
  FileSignature, RefreshCw, Search, XCircle, Eye, CheckCircle2,
  Clock, Shield, PenTool, Plus, FolderOpen,
} from 'lucide-react';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import Select from '../../components/ui/Select';
import Badge from '../../components/ui/Badge';
import DataTable from '../../components/ui/DataTable';
import Modal from '../../components/ui/Modal';
import PageHeader from '../../components/ui/PageHeader';
import { insuranceService } from '../../services/insurance.service';
import { useResolvedObject } from '../../hooks/useResolvedObject';
import { fmtDate, fmtDateTime } from '../../utils/formatters';
import { statusVariant, fieldLabel, fieldOptions, optionLabel } from '../../utils/metadata-helpers';
import { showError } from '../../utils/dialog';

/* ── Send Declaration Modal (metadata-driven) ────────────── */

function SendDeclarationModal({ open, onClose, applications, onSend, typeOptions, deliveryOptions, defaultApplicationId }) {
  const [form, setForm] = useState({ application_id: defaultApplicationId || '', declaration_types: [], delivery_method: 'email', notes: '' });

  // Sync defaultApplicationId when it changes (e.g. from URL param after apps load).
  // Read the current application_id inside the updater so we only seed it once,
  // without needing `form` in the dependency array.
  useEffect(() => {
    if (defaultApplicationId) {
      setForm(f => (f.application_id ? f : { ...f, application_id: defaultApplicationId }));
    }
  }, [defaultApplicationId]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const toggleType = (type) => {
    setForm(f => ({
      ...f,
      declaration_types: f.declaration_types.includes(type)
        ? f.declaration_types.filter(t => t !== type)
        : [...f.declaration_types, type],
    }));
  };

  const selectAll = () => setForm(f => ({ ...f, declaration_types: typeOptions.map(t => t.value) }));
  const clearAll = () => setForm(f => ({ ...f, declaration_types: [] }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.application_id) { setError('Please select an application.'); return; }
    if (form.declaration_types.length === 0) { setError('Please select at least one declaration.'); return; }
    setSaving(true); setError('');
    try {
      await onSend(form);
      onClose();
      setForm({ application_id: '', declaration_types: [], delivery_method: 'email', notes: '' });
    } catch (err) {
      setError(err?.response?.data?.message ?? err.message ?? 'Failed to send declarations');
    } finally { setSaving(false); }
  };

  return (
    <Modal open={open} onClose={onClose} title="Send Declarations for Acceptance" size="lg">
      <form onSubmit={handleSubmit} className="space-y-5">
        {error && <p className="rounded-lg bg-red-50 dark:bg-red-500/10 px-3 py-2 text-sm text-red-600">{error}</p>}

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Application *</label>
            <select className="input w-full" value={form.application_id} onChange={e => set('application_id', e.target.value)}>
              <option value="">Select application…</option>
              {applications.map(a => (
                <option key={a.id} value={a.id}>
                  {a.app_number} — {a.contact ? `${a.contact.first_name} ${a.contact.last_name}` : 'N/A'}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Delivery Method</label>
            <select className="input w-full" value={form.delivery_method} onChange={e => set('delivery_method', e.target.value)}>
              {deliveryOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
        </div>

        {/* Declaration Types Selection — options from metadata */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300">Declarations to Send *</label>
            <div className="flex gap-2">
              <button type="button" onClick={selectAll} className="text-[10px] font-medium text-primary-600 hover:text-primary-700">Select All</button>
              <span className="text-gray-300">|</span>
              <button type="button" onClick={clearAll} className="text-[10px] font-medium text-gray-500 hover:text-gray-700">Clear</button>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 max-h-64 overflow-y-auto pr-1">
            {typeOptions.map(dt => {
              const selected = form.declaration_types.includes(dt.value);
              return (
                <button
                  key={dt.value}
                  type="button"
                  onClick={() => toggleType(dt.value)}
                  className={`flex items-start gap-2.5 p-3 rounded-xl border text-left transition-all ${
                    selected
                      ? 'border-primary-300 bg-primary-50 dark:bg-primary-500/10 dark:border-primary-500/30 ring-1 ring-primary-200 dark:ring-primary-500/20'
                      : 'border-gray-200 dark:border-white/[0.07] bg-white dark:bg-white/5 hover:border-gray-300 dark:hover:border-white/10'
                  }`}
                >
                  <div className={`mt-0.5 h-5 w-5 rounded-md flex items-center justify-center shrink-0 ${
                    selected ? 'bg-primary-500 text-on-primary' : 'bg-gray-100 dark:bg-white/10 text-gray-400'
                  }`}>
                    {selected ? <CheckCircle2 className="h-3 w-3" /> : <FileSignature className="h-3 w-3" />}
                  </div>
                  <p className={`text-xs font-medium ${selected ? 'text-primary-700 dark:text-primary-300' : 'text-gray-700 dark:text-gray-300'}`}>{dt.label}</p>
                </button>
              );
            })}
          </div>
          {form.declaration_types.length > 0 && (
            <p className="text-[10px] text-primary-600 mt-1.5">{form.declaration_types.length} declaration(s) selected</p>
          )}
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Notes</label>
          <textarea className="input w-full h-16 resize-none" placeholder="Optional notes for the client…" value={form.notes} onChange={e => set('notes', e.target.value)} />
        </div>

        <div className="flex justify-end gap-2 pt-2 border-t border-gray-100 dark:border-white/[0.07]">
          <Button type="button" variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="primary" size="sm" disabled={saving}>
            <PenTool className="h-3.5 w-3.5 mr-1" />
            {saving ? 'Sending…' : 'Send for Acceptance'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

/* ── Declaration Detail Modal ────────────────────────────── */

function DeclarationDetailModal({ open, onClose, declaration, onAccept, onResend, onUploadDocs, fields, statusOptions, typeOptions }) {
  if (!declaration) return null;
  const variant = statusVariant(declaration.status, statusOptions);
  const statusLabel = optionLabel(declaration.status, statusOptions);
  const typeLabel = optionLabel(declaration.declaration_type, typeOptions);

  return (
    <Modal open={open} onClose={onClose} title="Declaration Details" size="lg">
      <div className="space-y-5">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-lg font-bold text-gray-900 dark:text-gray-100">{typeLabel}</p>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5 font-mono">{declaration.declaration_number ?? declaration.id}</p>
          </div>
          <Badge variant={variant} dot>{statusLabel}</Badge>
        </div>

        {/* Info Grid — driven by fields metadata */}
        <div className="grid grid-cols-2 gap-4">
          {fields.filter(f => !['content', 'notes', 'signature_hash'].includes(f.name)).map(f => {
            let val = declaration[f.name] ?? declaration.data?.[f.name];
            if (val === null || val === undefined) val = '—';
            else if (f.field_type === 'datetime' || f.field_type === 'date') val = fmtDateTime(val);
            else if (f.field_type === 'select') val = optionLabel(val, f.options ?? []);
            return (
              <div key={f.name}>
                <p className="text-xs font-medium text-gray-400 uppercase tracking-wide">{f.label}</p>
                <p className="mt-1 text-sm font-medium text-gray-900 dark:text-gray-100 capitalize">{String(val)}</p>
              </div>
            );
          })}
        </div>

        {/* Declaration Content */}
        {(declaration.content || declaration.data?.content) && (
          <div>
            <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">{fieldLabel('content', fields)}</p>
            <div className="rounded-xl border border-gray-200 dark:border-white/[0.07] bg-gray-50 dark:bg-white/5 px-4 py-3 max-h-48 overflow-y-auto">
              <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap leading-relaxed">{declaration.content ?? declaration.data?.content}</p>
            </div>
          </div>
        )}

        {/* E-Signature Info */}
        {declaration.status === 'accepted' && (
          <div className="rounded-xl border border-emerald-100 dark:border-emerald-500/20 bg-emerald-50 dark:bg-emerald-500/10 px-4 py-3">
            <div className="flex items-center gap-2 mb-1">
              <PenTool className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
              <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-300 uppercase tracking-wide">E-Signature Captured</p>
            </div>
            <p className="text-sm text-emerald-700 dark:text-emerald-300">
              Signed by <span className="font-semibold">{declaration.signed_by ?? declaration.data?.signed_by ?? declaration.applicant_name ?? 'Applicant'}</span> on {fmtDateTime(declaration.accepted_at ?? declaration.data?.accepted_at)}
            </p>
            {(declaration.signature_hash || declaration.data?.signature_hash) && (
              <p className="text-[10px] text-emerald-500 dark:text-emerald-400 mt-1 font-mono">Hash: {declaration.signature_hash ?? declaration.data?.signature_hash}</p>
            )}
          </div>
        )}

        {/* Notes */}
        {(declaration.notes || declaration.data?.notes) && (
          <div>
            <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">{fieldLabel('notes', fields)}</p>
            <p className="text-sm text-gray-700 dark:text-gray-300">{declaration.notes ?? declaration.data?.notes}</p>
          </div>
        )}

        {/* Timeline */}
        {declaration.timeline && declaration.timeline.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">Activity Timeline</p>
            <div className="space-y-2">
              {declaration.timeline.map((event, i) => (
                <div key={i} className="flex items-start gap-3 px-3 py-2 rounded-lg bg-gray-50 dark:bg-white/5">
                  <div className={`mt-0.5 h-2 w-2 rounded-full shrink-0 ${
                    event.type === 'accepted' ? 'bg-emerald-500' :
                    event.type === 'viewed' ? 'bg-purple-500' :
                    event.type === 'sent' ? 'bg-blue-500' : 'bg-gray-400'
                  }`} />
                  <div>
                    <p className="text-xs font-medium text-gray-700 dark:text-gray-300">{event.description}</p>
                    <p className="text-[10px] text-gray-400">{fmtDateTime(event.timestamp)}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="flex justify-end gap-2 pt-2 border-t border-gray-100 dark:border-white/[0.07]">
          <Button variant="ghost" size="sm" onClick={onClose}>Close</Button>
          {(declaration.status === 'pending' || declaration.status === 'expired') && (
            <Button variant="secondary" size="sm" onClick={() => onResend(declaration)}>
              <RefreshCw className="h-3.5 w-3.5 mr-1" /> Resend
            </Button>
          )}
          {declaration.status === 'sent' && (
            <Button variant="primary" size="sm" onClick={() => onAccept(declaration)}>
              <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Mark Accepted
            </Button>
          )}
          {declaration.status === 'accepted' && (
            <Button variant="primary" size="sm" onClick={() => onUploadDocs(declaration)}>
              <FolderOpen className="h-3.5 w-3.5 mr-1" /> Upload Documents
            </Button>
          )}
        </div>
      </div>
    </Modal>
  );
}

/* ── Stats Cards ─────────────────────────────────────────── */

function StatsBar({ declarations, statusOptions }) {
  const total = declarations.length;
  const accepted = declarations.filter(d => d.status === 'accepted').length;
  const pending = declarations.filter(d => ['pending', 'sent', 'viewed'].includes(d.status)).length;
  const declined = declarations.filter(d => d.status === 'declined').length;
  const acceptRate = total > 0 ? Math.round((accepted / total) * 100) : 0;

  return (
    <div className="grid grid-cols-5 gap-4">
      {[
        { label: 'Total Sent', value: total, icon: FileSignature, color: 'text-gray-700 dark:text-gray-200', bg: 'bg-gray-100 dark:bg-white/10' },
        { label: optionLabel('accepted', statusOptions), value: accepted, icon: CheckCircle2, color: 'text-emerald-700 dark:text-emerald-400', bg: 'bg-emerald-100 dark:bg-emerald-500/20' },
        { label: 'Pending', value: pending, icon: Clock, color: 'text-amber-700 dark:text-amber-400', bg: 'bg-amber-100 dark:bg-amber-500/20' },
        { label: optionLabel('declined', statusOptions), value: declined, icon: XCircle, color: 'text-red-700 dark:text-red-400', bg: 'bg-red-100 dark:bg-red-500/20' },
        { label: 'Acceptance Rate', value: `${acceptRate}%`, icon: Shield, color: 'text-primary-700 dark:text-primary-400', bg: 'bg-primary-100 dark:bg-primary-500/20' },
      ].map(stat => {
        const SIcon = stat.icon;
        return (
          <div key={stat.label} className="card px-4 py-3">
            <div className="flex items-center gap-2 mb-1">
              <div className={`h-6 w-6 rounded-lg flex items-center justify-center ${stat.bg}`}>
                <SIcon className={`h-3.5 w-3.5 ${stat.color}`} />
              </div>
              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">{stat.label}</p>
            </div>
            <p className={`text-xl font-bold ${stat.color}`}>{stat.value}</p>
          </div>
        );
      })}
    </div>
  );
}

/* ── Page ─────────────────────────────────────────────────── */

export default function DeclarationPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const recordIdParam = searchParams.get('record_id');

  /* ── Metadata: resolve object + load fields (MetadataStore → API fallback) ── */
  const { fields } = useResolvedObject('declaration');
  const statusOptions = useMemo(() => fieldOptions('status', fields), [fields]);
  const typeOptions = useMemo(() => fieldOptions('declaration_type', fields), [fields]);
  const deliveryOptions = useMemo(() => fieldOptions('delivery_method', fields), [fields]);

  /* ── Build table columns from metadata (show_in_list fields) ── */
  const listFields = useMemo(() => {
    const marked = fields.filter(f => f.config?.show_in_list === true);
    return marked.length > 0 ? marked : fields.filter(f => !['content', 'notes', 'signature_hash', 'ip_address'].includes(f.name)).slice(0, 7);
  }, [fields]);

  /* ── Data state ── */
  const [declarations, setDeclarations] = useState([]);
  const [applications, setApplications] = useState([]);
  const [loading, setLoading]           = useState(true);
  const [error, setError]               = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [typeFilter, setTypeFilter]     = useState('');
  const [searchTerm, setSearchTerm]     = useState('');
  const [detailDecl, setDetailDecl]     = useState(null);
  const [showSend, setShowSend]         = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  // Resolve record_id → insurance application_id for auto-selecting in the modal
  const [defaultAppId, setDefaultAppId] = useState('');
  useEffect(() => {
    if (!recordIdParam) return;
    // The record_id is the CRM record id; find the matching InsuranceApplication
    insuranceService.listApplications({}).then(res => {
      const apps = res?.data?.applications ?? res?.applications ?? [];
      const match = apps.find(a => String(a.record_id) === recordIdParam || String(a.id) === recordIdParam);
      if (match) {
        setDefaultAppId(String(match.id));
        setShowSend(true);  // Auto-open the Send Declaration modal
      }
    }).catch(() => {});
    // Clear the query param so refreshing doesn't re-open
    setSearchParams({}, { replace: true });
  }, [recordIdParam, setSearchParams]);

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const params = {};
      if (statusFilter) params.status = statusFilter;
      if (typeFilter)   params.declaration_type = typeFilter;
      if (searchTerm)   params.search = searchTerm;
      const [declRes, appRes] = await Promise.all([
        insuranceService.listDeclarations(params).catch(() => ({ data: { declarations: [] } })),
        insuranceService.listApplications({}).catch(() => ({ data: { applications: [] } })),
      ]);
      setDeclarations(declRes?.data?.declarations ?? declRes?.declarations ?? []);
      setApplications(appRes?.data?.applications ?? appRes?.applications ?? []);
    } catch (err) { setError(err?.response?.data?.message ?? 'Failed to load declarations'); }
    finally { setLoading(false); }
  }, [statusFilter, typeFilter, searchTerm]);

  useEffect(() => { load(); }, [load]);

  // Business process flow: once declarations are sent, the next step is
  // Document Collection for the same application (it opens the upload modal).
  const handleSend = async (form) => {
    await insuranceService.sendDeclarations(form);
    navigate(`/insurance/documents?application_id=${encodeURIComponent(form.application_id)}`);
  };

  const handleAccept = async (decl) => {
    setActionLoading(true);
    try {
      await insuranceService.updateDeclaration(decl.id, { status: 'accepted', accepted_at: new Date().toISOString() });
      // Keep modal open so user sees the "Upload Documents" button
      setDetailDecl({ ...decl, status: 'accepted', accepted_at: new Date().toISOString() });
      load();
    } catch (err) { showError(err?.response?.data?.message ?? 'Failed to update declaration'); }
    finally { setActionLoading(false); }
  };

  const handleResend = useCallback(async (decl) => {
    setActionLoading(true);
    try {
      await insuranceService.resendDeclaration(decl.id);
      load(); setDetailDecl(null);
    } catch (err) { showError(err?.response?.data?.message ?? 'Failed to resend'); }
    finally { setActionLoading(false); }
  }, [load]);

  const handleUploadDocs = useCallback((decl) => {
    setDetailDecl(null);
    const appNum = decl.app_number ?? decl.data?.app_number ?? '';
    navigate(`/insurance/documents${appNum ? `?app_number=${appNum}` : ''}`);
  }, [navigate]);

  /* ── Columns built dynamically from metadata ── */
  const columns = useMemo(() => {
    const cols = listFields.map(f => ({
      key: f.name, label: f.label, sortable: true,
      render: (v, row) => {
        const val = v ?? row.data?.[f.name];
        if (val === null || val === undefined || val === '') return <span className="text-gray-400">—</span>;

        // Auto-number field
        if (f.config?.auto_number) return <span className="font-mono text-xs font-semibold text-primary-600 dark:text-primary-400">{val}</span>;

        // Status field — use badge with color from metadata
        if (f.name === 'status') {
          const variant = statusVariant(val, f.options ?? []);
          const label = optionLabel(val, f.options ?? []);
          return <Badge variant={variant} dot>{label}</Badge>;
        }

        // Select fields — show label
        if (f.field_type === 'select') return <span className="text-sm font-medium text-gray-900 dark:text-gray-100">{optionLabel(val, f.options ?? [])}</span>;

        // Date/datetime fields
        if (f.field_type === 'datetime' || f.field_type === 'date') return <span className="text-gray-600 dark:text-gray-400 text-xs">{fmtDate(val)}</span>;

        // Accepted date — special render with icon
        if (f.name === 'accepted_at' && val) return (
          <div className="flex items-center gap-1">
            <PenTool className="h-3 w-3 text-emerald-500" />
            <span className="text-emerald-600 dark:text-emerald-400 text-xs font-medium">{fmtDate(val)}</span>
          </div>
        );

        return <span className="text-sm text-gray-700 dark:text-gray-300">{String(val)}</span>;
      },
    }));

    // Actions column
    cols.push({
      key: '_actions', label: '', width: '120px',
      render: (_, row) => (
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="xs" onClick={() => setDetailDecl(row)} title="View Details"><Eye className="h-3.5 w-3.5" /></Button>
          {(row.status === 'pending' || row.status === 'expired') && (
            <Button variant="ghost" size="xs" onClick={() => handleResend(row)} disabled={actionLoading} title="Resend"><RefreshCw className="h-3 w-3" /></Button>
          )}
          {row.status === 'accepted' && (
            <Button variant="ghost" size="xs" onClick={() => handleUploadDocs(row)} title="Upload Documents"><FolderOpen className="h-3.5 w-3.5 text-emerald-600" /></Button>
          )}
        </div>
      ),
    });

    return cols;
  }, [listFields, actionLoading, handleResend, handleUploadDocs]);

  return (
    <div className="min-h-full bg-surface px-4 py-8">
      <div className="mx-auto max-w-7xl space-y-6">

        {/* Header */}
        <PageHeader
          icon={FileSignature}
          eyebrow="Insurance"
          title="Declarations"
          subtitle="Manage client declarations, disclosures, and regulatory acknowledgments required for policy acceptance."
          className="!mb-0"
          actions={(
            <>
              <Button variant="secondary" size="sm" onClick={load} title="Refresh"><RefreshCw className="h-4 w-4" /></Button>
              <Button variant="primary" size="sm" onClick={() => setShowSend(true)}><Plus className="h-4 w-4" /> Send Declarations</Button>
            </>
          )}
        />

        {/* Stats */}
        {!loading && declarations.length > 0 && <StatsBar declarations={declarations} statusOptions={statusOptions} />}

        {/* Filters — options driven from metadata */}
        <div className="card px-6 py-4">
          <div className="flex flex-wrap items-end gap-4">
            <div className="flex-1 min-w-[200px] max-w-xs">
              <Input label="Search" placeholder="Applicant name, declaration #…" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} prefix={<Search className="h-3.5 w-3.5" />} />
            </div>
            <div className="w-44">
              <Select label={fieldLabel('status', fields) || 'Status'} placeholder="All Statuses" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
                options={statusOptions} />
            </div>
            <div className="w-56">
              <Select label={fieldLabel('declaration_type', fields) || 'Type'} placeholder="All Types" value={typeFilter} onChange={e => setTypeFilter(e.target.value)}
                options={typeOptions} />
            </div>
            {(statusFilter || typeFilter || searchTerm) && (
              <Button variant="ghost" size="sm" onClick={() => { setStatusFilter(''); setTypeFilter(''); setSearchTerm(''); }}>
                <XCircle className="h-3.5 w-3.5" /> Clear
              </Button>
            )}
          </div>
          {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
        </div>

        {/* Table — columns from metadata */}
        <div className="card overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center py-16 text-gray-400">
              <RefreshCw className="h-5 w-5 animate-spin mr-2" /> Loading declarations…
            </div>
          ) : (
            <DataTable frame={false} data={declarations} columns={columns} searchable={false} onRowClick={setDetailDecl}
              emptyText="No declarations found. Send declarations to clients to get started." />
          )}
        </div>
      </div>

      {/* Modals */}
      <SendDeclarationModal
        open={showSend}
        onClose={() => { setShowSend(false); setDefaultAppId(''); }}
        applications={applications}
        onSend={handleSend}
        typeOptions={typeOptions}
        deliveryOptions={deliveryOptions.length > 0 ? deliveryOptions : [{ value: 'email', label: 'Email' }]}
        defaultApplicationId={defaultAppId}
      />
      <DeclarationDetailModal
        open={!!detailDecl}
        onClose={() => setDetailDecl(null)}
        declaration={detailDecl}
        onAccept={handleAccept}
        onResend={handleResend}
        onUploadDocs={handleUploadDocs}
        fields={fields}
        statusOptions={statusOptions}
        typeOptions={typeOptions}
      />
    </div>
  );
}
