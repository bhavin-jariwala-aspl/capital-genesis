import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ShieldCheck, Plus, Trash2, Pencil, Clock, Zap, Sparkles, CalendarClock,
} from 'lucide-react';
import clsx from 'clsx';
import Modal from '../../components/ui/Modal';
import { slaService } from '../../services/sla.service';
import { ENTITY_LABEL, PRIORITY_LABEL } from '../../utils/sla';
import BuilderGuide from '../../components/builder/BuilderGuide';
import { confirmDialog } from '../../utils/dialog';
import { builderService } from '../../services/builder.service';
import ObjectPicker from '../../components/ui/ObjectPicker';

const ENTITIES = ['case', 'lead', 'task', 'record'];
const METRICS = [['first_response', 'First response'], ['resolution', 'Resolution']];
const TRIGGERS = [['warning', 'Warning (at risk)'], ['breach', 'Breach']];
const ACTIONS = [
  ['notify_owner', 'Notify owner'], ['notify_manager', 'Notify manager'],
  ['raise_priority', 'Raise priority'], ['create_task', 'Create follow-up task'],
];
const OPS = [['equals', '='], ['not_equals', '≠'], ['in', 'in'], ['contains', 'contains'], ['gt', '>'], ['lt', '<']];
const PRIORITY_HINTS = {
  case: ['*', 'low', 'medium', 'high', 'critical'],
  lead: ['*', 'cold', 'warm', 'hot'],
  task: ['*', 'low', 'normal', 'high', 'urgent'],
  record: ['*'],
};
const DAYS = [['mon', 'Mon'], ['tue', 'Tue'], ['wed', 'Wed'], ['thu', 'Thu'], ['fri', 'Fri'], ['sat', 'Sat'], ['sun', 'Sun']];
const inputCls = 'rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 focus:border-primary-500 focus:outline-none dark:border-white/10 dark:bg-white/5 dark:text-white';

const minsToLabel = (m) => (m >= 1440 ? `${(m / 1440).toFixed(m % 1440 ? 1 : 0)}d` : m >= 60 ? `${(m / 60).toFixed(m % 60 ? 1 : 0)}h` : `${m}m`);

export default function SlaBuilderPage() {
  const qc = useQueryClient();
  const [tab, setTab] = useState('policies');
  const [editPolicy, setEditPolicy] = useState(null);
  const [editHours, setEditHours] = useState(null);

  const { data: polData } = useQuery({ queryKey: ['sla-policies'], queryFn: slaService.getPolicies });
  const { data: bhData } = useQuery({ queryKey: ['sla-business-hours'], queryFn: slaService.getBusinessHours });
  // What the engine can actually measure per entity. The dropdowns used to
  // offer both metrics for every entity; a target on an unsupported pair saved
  // and was then silently never evaluated. Now the server says, and the editor
  // only offers what will run.
  const { data: capData } = useQuery({ queryKey: ['sla-capabilities'], queryFn: slaService.getCapabilities, staleTime: 60 * 60_000 });
  const capabilities = capData?.data ?? capData ?? null;
  const policies = polData?.data ?? polData ?? [];
  const hours = bhData?.data ?? bhData ?? [];

  const invalidate = () => { qc.invalidateQueries({ queryKey: ['sla-policies'] }); qc.invalidateQueries({ queryKey: ['sla-business-hours'] }); qc.invalidateQueries({ queryKey: ['sla-dashboard'] }); };

  const seedMut = useMutation({ mutationFn: slaService.seedDefaults, onSuccess: invalidate });
  const delPolicy = useMutation({ mutationFn: slaService.deletePolicy, onSuccess: invalidate });
  const delHours = useMutation({ mutationFn: slaService.deleteBusinessHours, onSuccess: invalidate });

  return (
    <div className="h-full overflow-auto">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-200 px-6 py-4 dark:border-white/10">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-primary-500 to-mid-600 text-on-primary"><ShieldCheck className="h-5 w-5" /></div>
          <div>
            <h1 className="text-lg font-semibold text-gray-900 dark:text-white">SLA Engine</h1>
            <p className="text-xs text-gray-500 dark:text-white/50">Configure service-level policies, targets, escalations &amp; business hours</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {policies.length === 0 && (
            <button onClick={() => seedMut.mutate()} disabled={seedMut.isPending}
              className="flex items-center gap-1.5 rounded-lg border border-primary-200 bg-primary-50 px-3 py-2 text-sm font-medium text-primary-600 hover:bg-primary-100 disabled:opacity-50 dark:border-primary-500/30 dark:bg-primary-500/10 dark:text-primary-300">
              <Sparkles className="h-4 w-4" /> {seedMut.isPending ? 'Creating…' : 'Seed starter policies'}
            </button>
          )}
          {tab === 'policies'
            ? <button onClick={() => setEditPolicy({})} className="flex items-center gap-1.5 rounded-lg bg-primary-600 px-3 py-2 text-sm font-medium text-on-primary hover:bg-primary-700"><Plus className="h-4 w-4" /> New policy</button>
            : <button onClick={() => setEditHours({})} className="flex items-center gap-1.5 rounded-lg bg-primary-600 px-3 py-2 text-sm font-medium text-on-primary hover:bg-primary-700"><Plus className="h-4 w-4" /> New calendar</button>}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-200 px-6 dark:border-white/10">
        {[['policies', 'Policies', ShieldCheck], ['hours', 'Business hours', CalendarClock]].map(([k, l, Icon]) => (
          <button key={k} onClick={() => setTab(k)}
            className={clsx('flex items-center gap-1.5 border-b-2 px-3 py-2.5 text-sm font-medium transition',
              tab === k ? 'border-primary-600 text-primary-600 dark:text-primary-300' : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-white/50')}>
            <Icon className="h-4 w-4" /> {l}
          </button>
        ))}
      </div>

      <div className="p-6">
        <BuilderGuide section="/builder/sla" />
        {tab === 'policies' ? (
          policies.length === 0 ? (
            <Empty text="No SLA policies yet." hint="Create one or seed the starter set to begin tracking response &amp; resolution targets." />
          ) : (
            <div className="space-y-6">
              {ENTITIES.map((ent) => {
                const list = policies.filter((p) => p.entity_type === ent);
                if (!list.length) return null;
                return (
                  <div key={ent}>
                    <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">{ENTITY_LABEL[ent]}</h2>
                    <div className="grid gap-3 lg:grid-cols-2">
                      {list.map((p) => (
                        <PolicyCard key={p.id} policy={p} hours={hours}
                          onEdit={() => setEditPolicy(p)} onDelete={async () => (await confirmDialog({ title: 'Delete SLA policy', message: `“${p.name}” will stop applying to new records.`, confirmLabel: 'Delete' })) && delPolicy.mutate(p.id)} />
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )
        ) : (
          hours.length === 0 ? (
            <Empty text="No business-hours calendars." hint="Add a calendar so SLA clocks only tick during working hours." />
          ) : (
            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
              {hours.map((h) => (
                <HoursCard key={h.id} cal={h} onEdit={() => setEditHours(h)} onDelete={async () => (await confirmDialog({ title: 'Delete business hours', message: `“${h.name}” will be removed from the SLA calendars.`, confirmLabel: 'Delete' })) && delHours.mutate(h.id)} />
              ))}
            </div>
          )
        )}
      </div>

      {editPolicy && <PolicyModal policy={editPolicy} hours={hours} capabilities={capabilities} onClose={() => setEditPolicy(null)} onSaved={() => { invalidate(); setEditPolicy(null); }} />}
      {editHours && <HoursModal cal={editHours} onClose={() => setEditHours(null)} onSaved={() => { invalidate(); setEditHours(null); }} />}
    </div>
  );
}

function Empty({ text, hint }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-gray-300 py-16 text-center dark:border-white/10">
      <ShieldCheck className="h-8 w-8 text-gray-300 dark:text-white/20" />
      <p className="text-sm font-medium text-gray-600 dark:text-white/60">{text}</p>
      <p className="max-w-sm text-xs text-gray-400" dangerouslySetInnerHTML={{ __html: hint }} />
    </div>
  );
}

function PolicyCard({ policy, hours, onEdit, onDelete }) {
  const cal = hours.find((h) => h.id === policy.business_hours_id);
  return (
    <div className={clsx('rounded-2xl border bg-white p-4 dark:bg-[#161b22]', policy.is_active ? 'border-gray-200 dark:border-white/10' : 'border-gray-200 opacity-60 dark:border-white/10')}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="truncate text-sm font-semibold text-gray-900 dark:text-white">{policy.name}</h3>
            {!policy.is_active && <span className="rounded bg-gray-200 px-1.5 py-0.5 text-[10px] text-gray-500 dark:bg-white/10 dark:text-white/50">inactive</span>}
          </div>
          {policy.description && <p className="mt-0.5 line-clamp-1 text-xs text-gray-400">{policy.description}</p>}
        </div>
        <div className="flex shrink-0 gap-1">
          <button onClick={onEdit} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-primary-500 dark:hover:bg-white/10"><Pencil className="h-4 w-4" /></button>
          <button onClick={onDelete} className="rounded-lg p-1.5 text-gray-400 hover:bg-rose-50 hover:text-rose-500 dark:hover:bg-rose-500/10"><Trash2 className="h-4 w-4" /></button>
        </div>
      </div>
      {/* Targets */}
      <div className="mt-3 flex flex-wrap gap-1.5">
        {(policy.targets || []).map((t) => (
          <span key={t.id} className="inline-flex items-center gap-1 rounded-lg bg-gray-100 px-2 py-1 text-[11px] text-gray-600 dark:bg-white/5 dark:text-white/70">
            <Clock className="h-3 w-3 text-gray-400" />
            <span className="capitalize">{t.metric.replace('_', ' ')}</span>
            <span className="text-gray-400">·</span>
            <span className="capitalize">{PRIORITY_LABEL(t.priority)}</span>
            <span className="font-semibold text-primary-600 dark:text-primary-300">{minsToLabel(t.target_minutes)}</span>
          </span>
        ))}
        {(policy.targets || []).length === 0 && <span className="text-[11px] text-amber-500">No targets — add at least one.</span>}
      </div>
      {/* Footer */}
      <div className="mt-3 flex items-center gap-3 border-t border-gray-100 pt-2 text-[11px] text-gray-400 dark:border-white/5">
        <span className="flex items-center gap-1"><Zap className="h-3 w-3" /> {(policy.escalations || []).length} escalations</span>
        <span className="flex items-center gap-1"><CalendarClock className="h-3 w-3" /> {cal ? cal.name : '24/7'}</span>
        {policy.conditions?.length > 0 && <span>· {policy.conditions.length} condition(s)</span>}
      </div>
    </div>
  );
}

function HoursCard({ cal, onEdit, onDelete }) {
  const days = DAYS.filter(([k]) => cal.weekly?.[k]?.length).map(([, l]) => l).join(' ');
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-white/10 dark:bg-[#161b22]">
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white">{cal.name}</h3>
            {cal.is_default && <span className="rounded bg-primary-500/10 px-1.5 py-0.5 text-[10px] font-medium text-primary-600 dark:text-primary-300">default</span>}
          </div>
          <p className="mt-0.5 text-xs text-gray-400">{cal.timezone_label} ({cal.utc_offset_minutes >= 0 ? '+' : ''}{Math.floor(cal.utc_offset_minutes / 60)}:{String(Math.abs(cal.utc_offset_minutes % 60)).padStart(2, '0')})</p>
        </div>
        <div className="flex gap-1">
          <button onClick={onEdit} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-primary-500 dark:hover:bg-white/10"><Pencil className="h-4 w-4" /></button>
          <button onClick={onDelete} className="rounded-lg p-1.5 text-gray-400 hover:bg-rose-50 hover:text-rose-500 dark:hover:bg-rose-500/10"><Trash2 className="h-4 w-4" /></button>
        </div>
      </div>
      <p className="mt-2 text-xs text-gray-500 dark:text-white/60">{days || 'No working days set'}</p>
      {cal.holidays?.length > 0 && <p className="mt-1 text-[11px] text-gray-400">{cal.holidays.length} holiday(s)</p>}
    </div>
  );
}

/* ── Policy modal ──────────────────────────────────────────────────────── */
function PolicyModal({ policy, hours, capabilities, onClose, onSaved }) {
  const isEdit = !!policy.id;
  const [form, setForm] = useState({
    name: policy.name || '', description: policy.description || '',
    entity_type: policy.entity_type || 'case', is_active: policy.is_active ?? true,
    order_index: policy.order_index ?? 0, business_hours_id: policy.business_hours_id || '',
    conditions: policy.conditions || [],
    object_id: policy.object_id || '',
    config: { first_response_stages: [], closed_stages: [], canceled_stages: [], dimension_field: '', ...(policy.config ?? {}) },
    targets: policy.targets?.map((t) => ({ ...t })) || [{ metric: 'first_response', priority: '*', target_minutes: 240, warning_pct: 80 }],
    escalations: policy.escalations?.map((e) => ({ ...e })) || [{ metric: '*', trigger: 'warning', action: 'notify_owner' }],
  });
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const prio = PRIORITY_HINTS[form.entity_type];
  // Metrics the engine measures this entity on. Falls back to the static list
  // only while capabilities are loading, so the editor never goes blank.
  const entityCaps = capabilities?.entities?.find((e) => e.type === form.entity_type);
  const metricOptions = entityCaps ? METRICS.filter(([v]) => entityCaps.metrics.includes(v)) : METRICS;
  const unsupportedTargets = entityCaps ? form.targets.filter((t) => !entityCaps.metrics.includes(t.metric)) : [];
  const metricName = (m) => METRICS.find(([v]) => v === m)?.[1]?.toLowerCase() ?? m;

  const save = useMutation({
    mutationFn: () => {
      const payload = {
        ...form,
        order_index: Number(form.order_index),
        business_hours_id: form.business_hours_id || null,
        targets: form.targets.filter((t) => t.metric && t.target_minutes).map((t) => ({ ...t, target_minutes: Number(t.target_minutes), warning_pct: Number(t.warning_pct) || 80 })),
        escalations: form.escalations.filter((e) => e.action && e.trigger),
        conditions: form.conditions.filter((c) => c.field && c.op),
        ...(form.entity_type === 'record'
          ? { object_id: Number(form.object_id) || null, config: { ...form.config, dimension_field: form.config.dimension_field || undefined } }
          : { object_id: undefined, config: undefined }),
      };
      return isEdit ? slaService.updatePolicy(policy.id, payload) : slaService.createPolicy(payload);
    },
    onSuccess: onSaved,
  });

  const updateRow = (key, i, patch) => set(key, form[key].map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  const removeRow = (key, i) => set(key, form[key].filter((_, idx) => idx !== i));

  return (
    <Modal open size="lg" icon={ShieldCheck} title={isEdit ? 'Edit policy' : 'New SLA policy'} onClose={onClose}>
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Name"><input className={inputCls + ' w-full'} value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="Standard Case SLA" /></Field>
          <Field label="Applies to">
            <select className={inputCls + ' w-full'} value={form.entity_type} disabled={isEdit} onChange={(e) => set('entity_type', e.target.value)}>
              {ENTITIES.map((e) => <option key={e} value={e}>{ENTITY_LABEL[e]}</option>)}
            </select>
          </Field>
        </div>
        <Field label="Description"><input className={inputCls + ' w-full'} value={form.description} onChange={(e) => set('description', e.target.value)} placeholder="Optional" /></Field>
        {form.entity_type === 'record' && (
          <RecordClockConfig objectId={form.object_id} config={form.config} disabled={isEdit && !!policy.object_id}
            onObject={(id) => set('object_id', id)} onConfig={(cfg) => set('config', cfg)} />
        )}
        <div className="grid grid-cols-3 gap-3">
          <Field label="Business hours">
            <select className={inputCls + ' w-full'} value={form.business_hours_id} onChange={(e) => set('business_hours_id', e.target.value)}>
              <option value="">24/7 (no calendar)</option>
              {hours.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
            </select>
          </Field>
          <Field label="Priority (order)"><input type="number" className={inputCls + ' w-full'} value={form.order_index} onChange={(e) => set('order_index', e.target.value)} /></Field>
          <Field label="Active">
            <label className="flex h-[38px] items-center gap-2 text-sm text-gray-600 dark:text-white/70">
              <input type="checkbox" checked={form.is_active} onChange={(e) => set('is_active', e.target.checked)} className="h-4 w-4 rounded accent-primary-600" /> Enabled
            </label>
          </Field>
        </div>

        {/* Targets */}
        <Section title="Targets" onAdd={() => set('targets', [...form.targets, { metric: metricOptions[0]?.[0] ?? 'resolution', priority: '*', target_minutes: 480, warning_pct: 80 }])}>
          {entityCaps && (
            <p className="text-xs text-gray-400">
              A {ENTITY_LABEL[form.entity_type]?.toLowerCase()} is measured on {entityCaps.metrics.map(metricName).join(' and ')}.
              Minutes count in business hours from the calendar above. Warn at 75–80% so somebody can still act.
            </p>
          )}
          {unsupportedTargets.length > 0 && (
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:bg-amber-500/10 dark:text-amber-200">
              {unsupportedTargets.length} target(s) use a metric this entity is not measured on and will be rejected on save. Change or remove them.
            </p>
          )}
          {form.targets.map((t, i) => (
            <div key={i} className="flex items-center gap-2">
              <select className={inputCls} value={t.metric} onChange={(e) => updateRow('targets', i, { metric: e.target.value })}>
                {metricOptions.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                {entityCaps && !entityCaps.metrics.includes(t.metric) && (
                  <option value={t.metric} disabled>{metricName(t.metric)} — not measured for {ENTITY_LABEL[form.entity_type]?.toLowerCase()}</option>
                )}
              </select>
              <select className={inputCls} value={t.priority} onChange={(e) => updateRow('targets', i, { priority: e.target.value })}>
                {prio.map((p) => <option key={p} value={p}>{PRIORITY_LABEL(p)}</option>)}
              </select>
              <div className="flex items-center gap-1"><input type="number" className={inputCls + ' w-20'} value={t.target_minutes} onChange={(e) => updateRow('targets', i, { target_minutes: e.target.value })} /><span className="text-xs text-gray-400">min</span></div>
              <div className="flex items-center gap-1"><input type="number" className={inputCls + ' w-16'} value={t.warning_pct} onChange={(e) => updateRow('targets', i, { warning_pct: e.target.value })} /><span className="text-xs text-gray-400">% warn</span></div>
              <button onClick={() => removeRow('targets', i)} className="ml-auto rounded-lg p-1.5 text-gray-400 hover:bg-rose-50 hover:text-rose-500 dark:hover:bg-rose-500/10"><Trash2 className="h-4 w-4" /></button>
            </div>
          ))}
        </Section>

        {/* Escalations */}
        <Section title="Escalations" onAdd={() => set('escalations', [...form.escalations, { metric: '*', trigger: 'breach', action: 'notify_manager' }])}>
          {form.escalations.map((e, i) => (
            <div key={i} className="flex items-center gap-2">
              <select className={inputCls} value={e.metric} onChange={(ev) => updateRow('escalations', i, { metric: ev.target.value })}>
                <option value="*">Any metric</option>
                {metricOptions.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
              <select className={inputCls} value={e.trigger} onChange={(ev) => updateRow('escalations', i, { trigger: ev.target.value })}>
                {TRIGGERS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
              <select className={inputCls + ' flex-1'} value={e.action} onChange={(ev) => updateRow('escalations', i, { action: ev.target.value })}>
                {ACTIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
              <button onClick={() => removeRow('escalations', i)} className="rounded-lg p-1.5 text-gray-400 hover:bg-rose-50 hover:text-rose-500 dark:hover:bg-rose-500/10"><Trash2 className="h-4 w-4" /></button>
            </div>
          ))}
        </Section>

        {/* Conditions */}
        <Section title="Match conditions (optional — all must match)" onAdd={() => set('conditions', [...form.conditions, { field: '', op: 'equals', value: '' }])}>
          {form.conditions.length === 0 && <p className="text-xs text-gray-400">No conditions — this policy applies to all {ENTITY_LABEL[form.entity_type].toLowerCase()}.</p>}
          {form.conditions.map((c, i) => (
            <div key={i} className="flex items-center gap-2">
              <input className={inputCls + ' w-40'} placeholder="field (e.g. priority)" value={c.field} onChange={(e) => updateRow('conditions', i, { field: e.target.value })} />
              <select className={inputCls} value={c.op} onChange={(e) => updateRow('conditions', i, { op: e.target.value })}>
                {OPS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
              <input className={inputCls + ' flex-1'} placeholder="value" value={c.value} onChange={(e) => updateRow('conditions', i, { value: e.target.value })} />
              <button onClick={() => removeRow('conditions', i)} className="rounded-lg p-1.5 text-gray-400 hover:bg-rose-50 hover:text-rose-500 dark:hover:bg-rose-500/10"><Trash2 className="h-4 w-4" /></button>
            </div>
          ))}
        </Section>
      </div>

      <ModalFooter onClose={onClose} onSave={() => save.mutate()} saving={save.isPending} disabled={!form.name || form.targets.length === 0} />
    </Modal>
  );
}

/* ── Business hours modal ──────────────────────────────────────────────── */
function HoursModal({ cal, onClose, onSaved }) {
  const isEdit = !!cal.id;
  const initDays = {};
  for (const [k] of DAYS) {
    const iv = cal.weekly?.[k]?.[0];
    initDays[k] = { on: !!(cal.weekly?.[k]?.length), start: iv?.[0] || '09:00', end: iv?.[1] || '17:00' };
  }
  const [form, setForm] = useState({
    name: cal.name || '', timezone_label: cal.timezone_label || 'UTC',
    utc_offset_minutes: cal.utc_offset_minutes ?? 0, is_default: cal.is_default ?? false,
    days: initDays, holidays: (cal.holidays || []).join(', '),
  });
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const setDay = (k, patch) => setForm((f) => ({ ...f, days: { ...f.days, [k]: { ...f.days[k], ...patch } } }));

  const save = useMutation({
    mutationFn: () => {
      const weekly = {};
      for (const [k] of DAYS) if (form.days[k].on) weekly[k] = [[form.days[k].start, form.days[k].end]];
      const holidays = form.holidays.split(',').map((s) => s.trim()).filter(Boolean);
      const payload = { name: form.name, timezone_label: form.timezone_label, utc_offset_minutes: Number(form.utc_offset_minutes), is_default: form.is_default, weekly, holidays };
      return isEdit ? slaService.updateBusinessHours(cal.id, payload) : slaService.createBusinessHours(payload);
    },
    onSuccess: onSaved,
  });

  return (
    <Modal open size="lg" icon={CalendarClock} title={isEdit ? 'Edit calendar' : 'New business-hours calendar'} onClose={onClose}>
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Name"><input className={inputCls + ' w-full'} value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="Business Hours (Mon–Fri)" /></Field>
          <Field label="Timezone label"><input className={inputCls + ' w-full'} value={form.timezone_label} onChange={(e) => set('timezone_label', e.target.value)} placeholder="IST, EST, UTC…" /></Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="UTC offset (minutes)"><input type="number" className={inputCls + ' w-full'} value={form.utc_offset_minutes} onChange={(e) => set('utc_offset_minutes', e.target.value)} placeholder="e.g. 330 for +5:30" /></Field>
          <Field label="Default calendar">
            <label className="flex h-[38px] items-center gap-2 text-sm text-gray-600 dark:text-white/70">
              <input type="checkbox" checked={form.is_default} onChange={(e) => set('is_default', e.target.checked)} className="h-4 w-4 rounded accent-primary-600" /> Use as default
            </label>
          </Field>
        </div>
        <Field label="Working hours">
          <div className="space-y-1.5">
            {DAYS.map(([k, l]) => (
              <div key={k} className="flex items-center gap-3">
                <label className="flex w-20 items-center gap-2 text-sm text-gray-600 dark:text-white/70">
                  <input type="checkbox" checked={form.days[k].on} onChange={(e) => setDay(k, { on: e.target.checked })} className="h-4 w-4 rounded accent-primary-600" /> {l}
                </label>
                <input type="time" disabled={!form.days[k].on} className={inputCls + ' disabled:opacity-40'} value={form.days[k].start} onChange={(e) => setDay(k, { start: e.target.value })} />
                <span className="text-gray-400">–</span>
                <input type="time" disabled={!form.days[k].on} className={inputCls + ' disabled:opacity-40'} value={form.days[k].end} onChange={(e) => setDay(k, { end: e.target.value })} />
              </div>
            ))}
          </div>
        </Field>
        <Field label="Holidays (comma-separated YYYY-MM-DD)">
          <input className={inputCls + ' w-full'} value={form.holidays} onChange={(e) => set('holidays', e.target.value)} placeholder="2026-12-25, 2027-01-01" />
        </Field>
      </div>
      <ModalFooter onClose={onClose} onSave={() => save.mutate()} saving={save.isPending} disabled={!form.name} />
    </Modal>
  );
}

/* ── Modal footer chrome (uses the shared <Modal> for the dialog shell) ──── */
function ModalFooter({ onClose, onSave, saving, disabled }) {
  return (
    <div className="mt-5 flex justify-end gap-2 border-t border-gray-200 pt-4 dark:border-white/10">
      <button onClick={onClose} className="rounded-lg px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 dark:text-white/60 dark:hover:bg-white/5">Cancel</button>
      <button onClick={onSave} disabled={saving || disabled} className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-on-primary hover:bg-primary-700 disabled:opacity-40">{saving ? 'Saving…' : 'Save'}</button>
    </div>
  );
}
function Field({ label, children }) {
  return <label className="block"><span className="mb-1 block text-xs font-medium text-gray-500 dark:text-white/50">{label}</span>{children}</label>;
}
function Section({ title, onAdd, children }) {
  return (
    <div className="rounded-xl border border-gray-200 p-3 dark:border-white/10">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wide text-gray-400">{title}</span>
        <button onClick={onAdd} className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-primary-600 hover:bg-primary-50 dark:text-primary-300 dark:hover:bg-primary-500/10"><Plus className="h-3.5 w-3.5" /> Add</button>
      </div>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

/* ── Record (any object) clock mapping ─────────────────────────────────── */
// A record SLA times a Builder object's records. Its pipeline stages say when
// first response is still due, when the record counts as resolved and when the
// timers are cancelled; the server rejects stage names the pipeline lacks.
function RecordClockConfig({ objectId, config, onObject, onConfig, disabled }) {
  const { data } = useQuery({
    queryKey: ['pipelines', objectId],
    queryFn: () => builderService.getPipelines(objectId),
    enabled: !!objectId,
  });
  const stages = (data?.data ?? []).flatMap((p) => p.stages ?? []);
  const toggle = (key, name) => {
    const cur = new Set(config[key] ?? []);
    if (cur.has(name)) cur.delete(name); else cur.add(name);
    onConfig({ ...config, [key]: [...cur] });
  };
  const group = (key, label, hint) => (
    <Field label={label}>
      <div className="flex flex-wrap gap-1.5">
        {stages.map((st) => {
          const on = (config[key] ?? []).includes(st.name);
          return (
            <button key={`${key}:${st.id}`} type="button" onClick={() => toggle(key, st.name)}
              className={'rounded-full border px-2.5 py-1 text-xs ' + (on ? 'border-primary-600 bg-primary-600 text-on-primary' : 'border-gray-200 text-gray-600 dark:border-white/10 dark:text-white/60')}>
              {st.label}
            </button>
          );
        })}
        {!stages.length && <span className="text-xs text-gray-400">Pick an object with a pipeline.</span>}
      </div>
      <p className="mt-1 text-[11px] text-gray-400">{hint}</p>
    </Field>
  );
  return (
    <div className="space-y-3 rounded-xl border border-gray-200 p-3 dark:border-white/10">
      <ObjectPicker label="Object" value={objectId} onChange={onObject} disabled={disabled} required />
      {group('first_response_stages', 'First response is due while in', 'Leave empty to treat “no stage yet” as awaiting first response.')}
      {group('closed_stages', 'Resolved when it reaches', 'At least one is required — otherwise resolution never stops.')}
      {group('canceled_stages', 'Cancel the timers in', 'e.g. Withdrawn, Declined.')}
      <Field label="Priority field (optional)">
        <input className={inputCls + ' w-full'} value={config.dimension_field || ''} onChange={(e) => onConfig({ ...config, dimension_field: e.target.value })}
          placeholder="API name, e.g. priority — targets can then differ per value" />
      </Field>
    </div>
  );
}
