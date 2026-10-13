import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Plus, Trash2, Zap, Play, ToggleLeft, ToggleRight,
  ChevronDown, ChevronUp, Webhook, CheckCircle2, XCircle,
  Clock, Settings2, AlertCircle, RefreshCw,
} from 'lucide-react';
import { builderService } from '../../services/builder.service';
import Button from '../../components/ui/Button';
import Badge from '../../components/ui/Badge';
import Input from '../../components/ui/Input';
import Select from '../../components/ui/Select';
import Modal from '../../components/ui/Modal';
import Spinner from '../../components/ui/Spinner';
import PageHeader from '../../components/ui/PageHeader';
import BuilderGuide from '../../components/builder/BuilderGuide';
import StatTile from '../../components/ui/StatTile';

/* ─── Constants ─────────────────────────────────────────────────── */

const INTEGRATION_TYPES = [
  { value: 'outbound_webhook', label: 'Outbound Webhook' },
  { value: 'inbound_webhook',  label: 'Inbound Webhook' },
  { value: 'enrichment',       label: 'Enrichment' },
  { value: 'custom',           label: 'Custom' },
  { value: 'simulator',        label: 'Sandbox simulator' },
];

// Sandbox providers (backend: services/integration-simulators.js). Each answers
// with the same response contract as the live system, so workflows and their
// field mappings can be built and tested before the real connection exists.
const SIMULATOR_PROVIDERS = [
  { value: 'screening',  label: 'Sanctions / PEP screening' },
  { value: 'mcib',       label: 'Credit bureau (MCIB)' },
  { value: 'lms',        label: 'Core loan system (booking)' },
  { value: 'ta',         label: 'Transfer agent (fund orders)' },
  { value: 'oms',        label: 'Order management system' },
  { value: 'fx_dealing', label: 'FX dealing system' },
  { value: 'sms',        label: 'SMS gateway' },
];

const TYPE_META = {
  outbound_webhook: { color: 'primary', icon: Webhook, label: 'Outbound Webhook' },
  inbound_webhook:  { color: 'info',    icon: Webhook, label: 'Inbound Webhook' },
  enrichment:       { color: 'purple',  icon: RefreshCw, label: 'Enrichment' },
  custom:           { color: 'default', icon: Settings2, label: 'Custom' },
  simulator:        { color: 'warning', icon: Zap, label: 'Sandbox simulator' },
};

const HTTP_METHODS = ['POST', 'PUT', 'PATCH'];

// Fallback generic catalog if the metadata-driven catalog hasn't loaded yet.
// The live catalog (generic record.* + per-object events) comes from
// GET /builder/integrations/event-catalog, derived from the tenant's objects.
const EVENT_CATALOG = [
  { event: 'record.created',       label: 'Record created' },
  { event: 'record.updated',       label: 'Record updated' },
  { event: 'record.deleted',       label: 'Record deleted' },
  { event: 'record.field_changed', label: 'Field changed' },
  { event: '*',                    label: 'All events' },
];

const emptyForm = () => ({
  name:      '',
  label:     '',
  type:      'outbound_webhook',
  is_active: false,
  config:    { url: '', method: 'POST', headers: '{}', timeout_ms: 10000, events: [], secret: '' },
});

/* ─── Config Editor ─────────────────────────────────────────────── */

function EventSubscriptions({ config, onChange }) {
  const selected = Array.isArray(config.events) ? config.events : [];

  // Metadata-driven catalog: generic record.* events + per-object events
  // (lead.created, opportunity.updated, …) derived from the tenant's objects.
  const { data } = useQuery({
    queryKey: ['integration-event-catalog'],
    queryFn:  () => builderService.getIntegrationEventCatalog(),
    staleTime: 5 * 60 * 1000,
  });
  const catalog   = data?.data ?? {};
  const generic   = catalog.generic ?? EVENT_CATALOG;
  const perObject  = (catalog.events ?? []).filter(e => e.object);
  const genericSet = new Set(generic.map(g => g.event));
  const objectChips = selected.filter(e => !genericSet.has(e));

  const toggle = (ev) =>
    onChange({ ...config, events: selected.includes(ev) ? selected.filter(e => e !== ev) : [...selected, ev] });
  const addObjEvent = (ev) => { if (ev && !selected.includes(ev)) onChange({ ...config, events: [...selected, ev] }); };

  return (
    <div className="flex flex-col gap-2">
      <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Trigger on events</label>
      <div className="grid grid-cols-2 gap-2">
        {generic.map(({ event, label }) => {
          const on = selected.includes(event);
          return (
            <button
              type="button"
              key={event}
              onClick={() => toggle(event)}
              className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-left text-xs transition-colors ${
                on
                  ? 'border-primary-300 dark:border-primary-500/40 bg-primary-50 dark:bg-primary-500/10 text-primary-700 dark:text-primary-300'
                  : 'border-gray-200 dark:border-white/10 bg-white dark:bg-white/5 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-white/10'
              }`}
            >
              {on ? <CheckCircle2 className="h-3.5 w-3.5 shrink-0" /> : <div className="h-3.5 w-3.5 shrink-0 rounded-full border border-gray-300" />}
              <span className="min-w-0">
                <span className="block font-medium">{label}</span>
                <span className="block font-mono text-[10px] text-gray-400">{event}</span>
              </span>
            </button>
          );
        })}
      </div>

      {/* Per-object subscriptions (metadata-driven — HubSpot/Pipedrive style) */}
      {perObject.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <Select
            label="Add object-specific event"
            value=""
            onChange={e => addObjEvent(e.target.value)}
            options={[{ value: '', label: 'Select an object event…' },
              ...perObject.map(e => ({ value: e.event, label: `${e.label} (${e.event})` }))]}
          />
          {objectChips.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {objectChips.map(ev => (
                <span key={ev} className="inline-flex items-center gap-1 rounded-md bg-primary-50 dark:bg-primary-500/10 px-2 py-1 font-mono text-[11px] text-primary-700 dark:text-primary-300">
                  {ev}
                  <button type="button" onClick={() => toggle(ev)} className="hover:text-red-500" aria-label={`Remove ${ev}`}>
                    <XCircle className="h-3 w-3" />
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      <p className="form-help">
        Active integrations fire automatically whenever a subscribed event occurs. Subscribe to generic
        <code className="mx-1">record.*</code> events (all objects) or specific ones like
        <code className="mx-1">lead.created</code>. Leave empty to disable auto-firing (test-only).
      </p>
    </div>
  );
}

function ConfigEditor({ type, config, onChange }) {
  if (type === 'simulator') {
    return (
      <div className="space-y-4">
        <Select
          label="Simulated system"
          options={SIMULATOR_PROVIDERS}
          value={config.provider ?? 'screening'}
          onChange={e => onChange({ ...config, provider: e.target.value })}
        />
        <p className="form-help">
          Returns deterministic, realistic responses in the live system&apos;s format. Switch the type to
          Outbound Webhook or Enrichment and enter the provider URL to go live — workflows need no change.
        </p>
      </div>
    );
  }

  if (type === 'outbound_webhook') {
    return (
      <div className="space-y-4">
        <Input
          label="Webhook URL"
          placeholder="https://example.com/webhook"
          value={config.url ?? ''}
          onChange={e => onChange({ ...config, url: e.target.value })}
        />
        <div className="grid grid-cols-2 gap-4">
          <Select
            label="HTTP Method"
            options={HTTP_METHODS}
            value={config.method ?? 'POST'}
            onChange={e => onChange({ ...config, method: e.target.value })}
          />
          <Input
            label="Timeout (ms)"
            type="number"
            value={config.timeout_ms ?? 10000}
            onChange={e => onChange({ ...config, timeout_ms: Number(e.target.value) })}
          />
        </div>

        <EventSubscriptions config={config} onChange={onChange} />

        <Input
          label="Signing secret (optional)"
          type="password"
          placeholder="Sign each payload with HMAC-SHA256"
          value={config.secret ?? ''}
          onChange={e => onChange({ ...config, secret: e.target.value })}
          help="When set, requests carry an X-Signature-256 header the receiver can verify"
        />

        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Headers (JSON)</label>
          <textarea
            className="form-input font-mono text-xs resize-none"
            rows={3}
            value={config.headers ?? '{}'}
            onChange={e => onChange({ ...config, headers: e.target.value })}
            placeholder={'{"Authorization": "Bearer TOKEN"}'}
          />
          <p className="form-help">Custom HTTP headers sent with every request</p>
        </div>
      </div>
    );
  }

  if (type === 'inbound_webhook') {
    return (
      <div className="space-y-4">
        <div className="rounded-lg border border-dashed border-gray-200 dark:border-white/10 bg-gray-50 dark:bg-white/5 px-4 py-3 text-xs text-gray-500">
          Public endpoint: <code className="font-mono text-primary-600">POST /api/integrations/inbound/{'{name}'}</code>
        </div>
        <Input
          label="Signing secret (optional)"
          type="password"
          placeholder="Verify inbound X-Signature-256 (HMAC-SHA256)"
          value={config.secret ?? ''}
          onChange={e => onChange({ ...config, secret: e.target.value })}
          help="When set, inbound requests must carry a valid X-Signature-256 header"
        />
        <Input
          label="Event field (optional)"
          placeholder="event"
          value={config.event_field ?? ''}
          onChange={e => onChange({ ...config, event_field: e.target.value })}
          help="Dotted path to the event name in the payload (defaults to event / type / action)"
        />
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Event → Workflow map (JSON)</label>
          <textarea
            className="form-input font-mono text-xs resize-none"
            rows={3}
            value={config.event_map ?? '{}'}
            onChange={e => onChange({ ...config, event_map: e.target.value })}
            placeholder={'{"payment.succeeded": 12}'}
          />
          <p className="form-help">Maps an inbound event name to a workflow ID to run automatically</p>
        </div>
      </div>
    );
  }

  if (type === 'enrichment') {
    return (
      <div className="space-y-4">
        <Input
          label="Provider URL"
          placeholder="https://enrichment-provider.com/lookup"
          value={config.url ?? ''}
          onChange={e => onChange({ ...config, url: e.target.value })}
          help="The record is POSTed here; the response can be mapped back onto record fields from a workflow's Integration step (field_map)."
        />
        <div className="grid grid-cols-2 gap-4">
          <Select
            label="HTTP Method"
            options={HTTP_METHODS}
            value={config.method ?? 'POST'}
            onChange={e => onChange({ ...config, method: e.target.value })}
          />
          <Input
            label="Timeout (ms)"
            type="number"
            value={config.timeout_ms ?? 10000}
            onChange={e => onChange({ ...config, timeout_ms: Number(e.target.value) })}
          />
        </div>
        <EventSubscriptions config={config} onChange={onChange} />
        <Input
          label="Signing secret (optional)"
          type="password"
          value={config.secret ?? ''}
          onChange={e => onChange({ ...config, secret: e.target.value })}
          help="Signs the outbound request with X-Signature-256 (HMAC-SHA256)"
        />
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Headers (JSON)</label>
          <textarea
            className="form-input font-mono text-xs resize-none"
            rows={3}
            value={config.headers ?? '{}'}
            onChange={e => onChange({ ...config, headers: e.target.value })}
            placeholder={'{"Authorization": "Bearer API_KEY"}'}
          />
        </div>
      </div>
    );
  }

  if (type === 'custom') {
    return (
      <div className="space-y-4">
        <Input
          label="Endpoint URL"
          placeholder="https://example.com/custom"
          value={config.url ?? ''}
          onChange={e => onChange({ ...config, url: e.target.value })}
          help="A user-defined outbound destination. Behaves like an outbound webhook (SSRF-guarded, signed, retried)."
        />
        <div className="grid grid-cols-2 gap-4">
          <Select
            label="HTTP Method"
            options={HTTP_METHODS}
            value={config.method ?? 'POST'}
            onChange={e => onChange({ ...config, method: e.target.value })}
          />
          <Input
            label="Timeout (ms)"
            type="number"
            value={config.timeout_ms ?? 10000}
            onChange={e => onChange({ ...config, timeout_ms: Number(e.target.value) })}
          />
        </div>
        <EventSubscriptions config={config} onChange={onChange} />
        <Input
          label="Signing secret (optional)"
          type="password"
          value={config.secret ?? ''}
          onChange={e => onChange({ ...config, secret: e.target.value })}
          help="Signs the request with X-Signature-256 (HMAC-SHA256)"
        />
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Headers (JSON)</label>
          <textarea
            className="form-input font-mono text-xs resize-none"
            rows={3}
            value={config.headers ?? '{}'}
            onChange={e => onChange({ ...config, headers: e.target.value })}
            placeholder={'{"Authorization": "Bearer TOKEN"}'}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3 rounded-xl border border-dashed border-gray-200 dark:border-white/10 bg-gray-50 dark:bg-white/5 px-4 py-5">
      <AlertCircle className="h-5 w-5 shrink-0 text-gray-400" />
      <p className="text-sm text-gray-500 italic">
        Configuration UI for <span className="font-medium">&ldquo;{type}&rdquo;</span> is not yet available.
      </p>
    </div>
  );
}

/* ─── Integration Form (inside Modal) ───────────────────────────── */

function IntegrationForm({ integration, onSave, onCancel, saving }) {
  // Normalise persisted config (JSON objects) into the string/array shapes the
  // editors expect, so editing an existing integration round-trips cleanly.
  const [form, setForm] = useState(() => {
    const base = { ...emptyForm(), ...integration };
    const cfg  = { ...base.config };
    if (cfg.headers && typeof cfg.headers === 'object')     cfg.headers   = JSON.stringify(cfg.headers, null, 2);
    if (cfg.event_map && typeof cfg.event_map === 'object') cfg.event_map = JSON.stringify(cfg.event_map, null, 2);
    if (!Array.isArray(cfg.events))                         cfg.events    = cfg.events ? [cfg.events].flat() : [];
    base.config = cfg;
    return base;
  });
  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));

  const handleSave = () => {
    let config = { ...form.config };
    // Headers are edited as a JSON string across all HTTP connector types.
    if (typeof config.headers === 'string') {
      try { config.headers = JSON.parse(config.headers || '{}'); }
      catch { config.headers = {}; }
    }
    if (form.type === 'inbound_webhook' && typeof config.event_map === 'string') {
      try { config.event_map = JSON.parse(config.event_map || '{}'); }
      catch { config.event_map = {}; }
    }
    onSave({ ...form, config });
  };

  return (
    <div className="space-y-5">
      {/* Basic info */}
      <div className="grid grid-cols-2 gap-4">
        <Input
          label="Name (unique slug)"
          placeholder="slack-notify"
          value={form.name}
          onChange={e => set('name', e.target.value)}
          help="Used as the integration identifier"
        />
        <Input
          label="Label"
          placeholder="Slack Notification"
          value={form.label}
          onChange={e => set('label', e.target.value)}
          help="Human-readable display name"
        />
      </div>

      <div className="grid grid-cols-2 gap-4 items-end">
        <Select
          label="Type"
          options={INTEGRATION_TYPES}
          value={form.type}
          onChange={e => set('type', e.target.value)}
        />
        {/* Active toggle */}
        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Status</span>
          <button
            type="button"
            onClick={() => set('is_active', !form.is_active)}
            className={`inline-flex items-center gap-2.5 self-start rounded-xl border px-4 py-2.5 text-sm font-medium transition-all duration-150 ${
              form.is_active
                ? 'border-emerald-200 dark:border-emerald-500/30 bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-100 dark:hover:bg-emerald-500/20'
                : 'border-gray-200 dark:border-white/10 bg-gray-50 dark:bg-white/5 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-white/10'
            }`}
          >
            {form.is_active
              ? <ToggleRight className="h-5 w-5 text-emerald-500" />
              : <ToggleLeft  className="h-5 w-5 text-gray-400" />}
            {form.is_active ? 'Active' : 'Inactive'}
          </button>
        </div>
      </div>

      {/* Config section */}
      <div>
        <p className="mb-3 text-sm font-semibold text-gray-800 dark:text-gray-200">Configuration</p>
        <ConfigEditor
          type={form.type}
          config={form.config ?? {}}
          onChange={cfg => set('config', cfg)}
        />
      </div>

      {/* Footer actions */}
      <div className="flex justify-end gap-2 pt-2">
        <Button variant="ghost" onClick={onCancel} disabled={saving}>Cancel</Button>
        <Button variant="primary" onClick={handleSave} loading={saving}>
          {integration?.id ? 'Save Changes' : 'Create Integration'}
        </Button>
      </div>
    </div>
  );
}

/* ─── Log Row ────────────────────────────────────────────────────── */

function LogRow({ log }) {
  const isSuccess = log.status === 'success';
  return (
    <div className={`flex items-start gap-3 rounded-lg px-3 py-2.5 text-xs ${
      isSuccess ? 'bg-emerald-50 dark:bg-emerald-500/10' : 'bg-red-50 dark:bg-red-500/10'
    }`}>
      {isSuccess
        ? <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-500 mt-0.5" />
        : <XCircle      className="h-3.5 w-3.5 shrink-0 text-red-500 mt-0.5" />}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-3">
          <span className={`font-semibold ${isSuccess ? 'text-emerald-700' : 'text-red-700'}`}>
            {log.status}
          </span>
          <span className="flex items-center gap-1 text-gray-500">
            <Clock className="h-3 w-3" /> {log.duration_ms}ms
          </span>
          <span className="text-gray-400">
            {new Date(log.created_at).toLocaleString()}
          </span>
        </div>
        {log.error && (
          <p className="mt-0.5 truncate text-red-600">{log.error}</p>
        )}
      </div>
    </div>
  );
}

/* ─── Integration Logs ───────────────────────────────────────────── */

function IntegrationLogs({ integrationId }) {
  const { data, isLoading } = useQuery({
    queryKey:        ['integration-logs', integrationId],
    queryFn:         () => builderService.getIntegrationLogs(integrationId),
    refetchInterval: 5000,
  });
  const logs = data?.data ?? [];

  return (
    <div className="space-y-1.5">
      <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">Recent Executions</p>
      {isLoading && <Spinner size="sm" />}
      {!isLoading && logs.length === 0 && (
        <p className="text-xs italic text-gray-400">No executions yet.</p>
      )}
      {logs.slice(0, 6).map(l => <LogRow key={l.id} log={l} />)}
    </div>
  );
}

/* ─── Integration Card ───────────────────────────────────────────── */

function IntegrationCard({ integ, onEdit, onDelete, onToggle, onTest, testResult }) {
  const [expanded, setExpanded] = useState(false);
  const meta = TYPE_META[integ.type] ?? TYPE_META.custom;
  const TypeIcon = meta.icon;
  const result = testResult ?? {};

  return (
    <div className="card overflow-hidden transition-shadow hover:shadow-card-md">
      {/* Main row */}
      <div className="flex items-center gap-4 px-5 py-4">
        {/* Icon */}
        <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
          integ.is_active ? 'bg-primary-50' : 'bg-gray-100 dark:bg-white/10'
        }`}>
          <TypeIcon className={`h-5 w-5 ${integ.is_active ? 'text-primary-600' : 'text-gray-400'}`} />
        </div>

        {/* Info */}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold text-gray-900 dark:text-gray-100">{integ.label || integ.name}</span>
            <span className="font-mono text-xs text-gray-400">({integ.name})</span>
            <Badge variant={meta.color}>{meta.label}</Badge>
            <Badge variant={integ.is_active ? 'success' : 'default'} dot>
              {integ.is_active ? 'Active' : 'Inactive'}
            </Badge>
          </div>
          {integ.last_run_at && (
            <p className="mt-0.5 flex items-center gap-1.5 text-xs text-gray-400">
              <Clock className="h-3 w-3" />
              Last run {new Date(integ.last_run_at).toLocaleString()}
            </p>
          )}
        </div>

        {/* Actions */}
        <div className="flex shrink-0 items-center gap-1">
          {/* Test result */}
          {result.loading && <Spinner size="sm" />}
          {!result.loading && result.ok    && <span className="flex items-center gap-1 text-xs font-medium text-emerald-600"><CheckCircle2 className="h-3.5 w-3.5" /> OK</span>}
          {!result.loading && result.error && (
            <span className="max-w-[140px] truncate text-xs text-red-500" title={result.error}>
              {result.error}
            </span>
          )}

          <Button
            variant="ghost"
            size="sm"
            onClick={() => onTest(integ.id)}
            disabled={!integ.is_active}
            title={integ.is_active ? 'Run test' : 'Activate to test'}
          >
            <Play className="h-3.5 w-3.5" />
            Test
          </Button>

          <Button variant="ghost" size="sm" onClick={() => onEdit(integ)}>
            Edit
          </Button>

          <button
            onClick={() => onToggle(integ)}
            title={integ.is_active ? 'Deactivate' : 'Activate'}
            className="rounded-lg p-1.5 transition-colors hover:bg-gray-100 dark:hover:bg-white/10"
          >
            {integ.is_active
              ? <ToggleRight className="h-5 w-5 text-emerald-500" />
              : <ToggleLeft  className="h-5 w-5 text-gray-400" />}
          </button>

          <button
            onClick={() => onDelete(integ.id)}
            title="Delete"
            className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-red-50 dark:hover:bg-red-500/10 hover:text-red-500"
          >
            <Trash2 className="h-4 w-4" />
          </button>

          <button
            onClick={() => setExpanded(e => !e)}
            className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-gray-100 dark:hover:bg-white/10 hover:text-gray-700 dark:hover:text-gray-300"
            title="View logs"
          >
            {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {/* Logs panel */}
      {expanded && (
        <div className="border-t border-gray-100 dark:border-white/[0.07] bg-gray-50/60 dark:bg-white/[0.03] px-5 py-4">
          <IntegrationLogs integrationId={integ.id} />
        </div>
      )}
    </div>
  );
}

/* ─── Stats Banner ───────────────────────────────────────────────── */

/* ─── Page ───────────────────────────────────────────────────────── */

export default function IntegrationBuilderPage() {
  const [modalOpen, setModalOpen]   = useState(false);
  const [editing, setEditing]       = useState(null);
  const [testResult, setTestResult] = useState({});
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['integrations'],
    queryFn:  () => builderService.getIntegrations(),
  });
  const integrations = data?.data ?? [];
  const active = integrations.filter(i => i.is_active).length;

  const createMut = useMutation({
    mutationFn: d => builderService.createIntegration(d),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['integrations'] }); closeModal(); },
  });
  const updateMut = useMutation({
    mutationFn: ({ id, ...d }) => builderService.updateIntegration(id, d),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['integrations'] }); closeModal(); },
  });
  const deleteMut = useMutation({
    mutationFn: id => builderService.deleteIntegration(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['integrations'] }),
  });
  const toggleMut = useMutation({
    mutationFn: ({ id, is_active }) => builderService.toggleIntegration(id, is_active),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['integrations'] }),
  });

  const openNew  = () => { setEditing(null); setModalOpen(true); };
  const openEdit = (integ) => { setEditing(integ); setModalOpen(true); };
  const closeModal = () => { setModalOpen(false); setEditing(null); };

  const handleSave = (form) => {
    if (editing) updateMut.mutate({ id: editing.id, ...form });
    else         createMut.mutate(form);
  };

  const handleTest = async (id) => {
    setTestResult(p => ({ ...p, [id]: { loading: true } }));
    try {
      await builderService.testIntegration(id, { _test: true });
      setTestResult(p => ({ ...p, [id]: { ok: true } }));
    } catch (e) {
      setTestResult(p => ({ ...p, [id]: { error: e.message } }));
    }
  };

  const saving = createMut.isPending || updateMut.isPending;

  return (
    <div className="min-h-full bg-surface px-4 py-8">
      <div className="mx-auto max-w-4xl space-y-6">

        {/* ── Page header ── */}
        <PageHeader
          icon={Zap}
          eyebrow="Builder"
          title="Integrations"
          subtitle="Configure inbound & outbound webhooks and external service connectors — active outbound integrations fire automatically on the CRM events they subscribe to."
          className="!mb-0"
          actions={(
            <Button variant="primary" size="md" onClick={openNew} className="shrink-0">
              <Plus className="h-4 w-4" /> New Integration
            </Button>
          )}
        />

      <BuilderGuide section="/builder/integrations" />

        {/* Stats */}
        <div className="grid gap-4 grid-cols-1 sm:grid-cols-3">
          <StatTile label="Total Integrations" value={integrations.length}          icon={Zap}         tone="primary" />
          <StatTile label="Active"             value={active}                       icon={CheckCircle2} tone="emerald" />
          <StatTile label="Inactive"           value={integrations.length - active} icon={ToggleLeft}   tone="rose" />
        </div>

        {/* ── Integration list ── */}
        {isLoading ? (
          <div className="flex justify-center py-16">
            <Spinner size="lg" />
          </div>
        ) : integrations.length === 0 ? (
          <div className="card flex flex-col items-center justify-center py-20 text-center">
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-cyan-50">
              <Zap className="h-8 w-8 text-cyan-400" />
            </div>
            <p className="text-base font-semibold text-gray-700 dark:text-gray-300">No integrations yet</p>
            <p className="mt-1 max-w-xs text-sm text-gray-400">
              Create your first integration to start connecting external services and automating data flow.
            </p>
            <Button variant="primary" size="md" className="mt-6" onClick={openNew}>
              <Plus className="h-4 w-4" /> Create Integration
            </Button>
          </div>
        ) : (
          <div className="space-y-3 animate-fade-in">
            {integrations.map(integ => (
              <IntegrationCard
                key={integ.id}
                integ={integ}
                onEdit={openEdit}
                onDelete={id => deleteMut.mutate(id)}
                onToggle={i => toggleMut.mutate({ id: i.id, is_active: !i.is_active })}
                onTest={handleTest}
                testResult={testResult[integ.id]}
              />
            ))}
          </div>
        )}
      </div>

      {/* ── Create / Edit Modal ── */}
      <Modal
        open={modalOpen}
        onClose={closeModal}
        title={editing ? `Edit — ${editing.label || editing.name}` : 'New Integration'}
        size="lg"
      >
        <IntegrationForm
          integration={editing}
          onSave={handleSave}
          onCancel={closeModal}
          saving={saving}
        />
      </Modal>
    </div>
  );
}
