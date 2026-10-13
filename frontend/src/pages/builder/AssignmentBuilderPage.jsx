import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2, Save, UserCheck, RefreshCw, Filter, Scale, Users, FlaskConical, Check, X, ChevronRight, Loader2 } from 'lucide-react';
import { builderService } from '../../services/builder.service';
import PageHeader from '../../components/ui/PageHeader';
import BuilderGuide from '../../components/builder/BuilderGuide';
import ObjectPicker, { useAllObjects } from '../../components/ui/ObjectPicker';
import { EmployeePicker, EmployeeMultiPicker, useEmployeeMap } from '../../components/ui/EmployeePicker';
import Button from '../../components/ui/Button';

const RULE_TYPES = [
  { value: 'fixed',         label: 'Fixed',         Icon: UserCheck, desc: 'Always assign to one person',   color: 'blue' },
  { value: 'round_robin',   label: 'Round Robin',   Icon: RefreshCw, desc: 'Cycle through a pool of reps',  color: 'green' },
  { value: 'rule_based',    label: 'Rule Based',    Icon: Filter,    desc: 'Match conditions to assign',    color: 'purple' },
  { value: 'load_balanced', label: 'Load Balanced', Icon: Scale,     desc: 'Fewest open records wins',      color: 'orange' },
];

const OPERATORS = [
  'equals', 'not_equals', 'contains', 'starts_with', 'ends_with',
  'gt', 'gte', 'lt', 'lte', 'in', 'not_in', 'is_empty', 'is_not_empty',
];

const emptyRule = () => ({
  name: '',
  rule_type: 'fixed',
  object_id: '',
  assignee_id: '',
  pool_ids: [],
  fallback_id: '',
  conditions: [],
  order_index: 0,
  is_active: true,
});

const emptyCondition = () => ({ field: '', operator: 'equals', value: '' });

function ConditionsEditor({ conditions, onChange }) {
  const list   = Array.isArray(conditions) ? conditions : [];
  const add    = () => onChange([...list, emptyCondition()]);
  const remove = (i) => onChange(list.filter((_, idx) => idx !== i));
  const update = (i, key, val) =>
    onChange(list.map((c, idx) => idx === i ? { ...c, [key]: val } : c));

  return (
    <div className="space-y-2">
      {list.map((c, i) => (
        <div key={i} className="flex items-center gap-2">
          <input
            className="form-input flex-1 text-sm"
            placeholder="field_name"
            value={c.field}
            onChange={(e) => update(i, 'field', e.target.value)}
          />
          <select
            className="form-input w-36 text-sm"
            value={c.operator}
            onChange={(e) => update(i, 'operator', e.target.value)}
          >
            {OPERATORS.map(o => <option key={o} value={o}>{o}</option>)}
          </select>
          <input
            className="form-input flex-1 text-sm"
            placeholder="value"
            value={c.value ?? ''}
            onChange={(e) => update(i, 'value', e.target.value)}
          />
          <button onClick={() => remove(i)} className="text-red-400 hover:text-red-600 p-1 rounded-lg hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors">
            <Trash2 size={14} />
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={add}
        className="text-xs text-primary-600 hover:text-primary-800 font-medium flex items-center gap-1 mt-1"
      >
        <Plus size={12} /> Add condition
      </button>
    </div>
  );
}

function RuleForm({ rule, onSave, onCancel }) {
  const [form, setForm] = useState(() => {
    const base = { ...emptyRule(), ...rule };
    // Normalise array fields: a DB/API value of null would otherwise override
    // the empty-array defaults (spread copies null; it doesn't fall back).
    if (!Array.isArray(base.pool_ids))   base.pool_ids = [];
    if (!Array.isArray(base.conditions)) base.conditions = [];
    return base;
  });
  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));

  const handleSave = () => {
    onSave({ ...form, object_id: Number(form.object_id) || undefined });
  };

  const COLORS = {
    blue:   'border-blue-300 dark:border-blue-500/30 bg-blue-50 dark:bg-blue-500/10 text-blue-700 dark:text-blue-300 ring-blue-200 dark:ring-blue-500/30',
    green:  'border-green-300 dark:border-green-500/30 bg-green-50 dark:bg-green-500/10 text-green-700 dark:text-green-300 ring-green-200 dark:ring-green-500/30',
    purple: 'border-purple-300 dark:border-purple-500/30 bg-purple-50 dark:bg-purple-500/10 text-purple-700 dark:text-purple-300 ring-purple-200 dark:ring-purple-500/30',
    orange: 'border-orange-300 dark:border-orange-500/30 bg-orange-50 dark:bg-orange-500/10 text-orange-700 dark:text-orange-300 ring-orange-200 dark:ring-orange-500/30',
  };

  return (
    <div className="border border-primary-200 dark:border-primary-500/30 rounded-2xl p-5 bg-primary-50/30 dark:bg-primary-500/10 space-y-5">
      {/* Name + Object */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="form-label">Rule Name</label>
          <input className="form-input" value={form.name} onChange={e => set('name', e.target.value)} placeholder="e.g. Enterprise Lead Rule" />
        </div>
        <div>
          <ObjectPicker
            label="Object"
            required
            value={String(form.object_id)}
            onChange={v => set('object_id', v)}
            placeholder="Choose an object…"
          />
        </div>
      </div>

      {/* Rule type cards */}
      <div>
        <label className="form-label">Rule Type</label>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-1">
          {RULE_TYPES.map(rt => {
            const Icon = rt.Icon;
            const active = form.rule_type === rt.value;
            const colors = COLORS[rt.color];
            return (
              <button
                key={rt.value}
                type="button"
                onClick={() => set('rule_type', rt.value)}
                className={`relative text-left p-3 rounded-xl border-2 transition-all
                  ${active ? `${colors} ring-2` : 'border-gray-200 dark:border-white/10 bg-white dark:bg-night-2 text-gray-600 dark:text-gray-400 hover:border-gray-300 dark:hover:border-white/20 hover:bg-gray-50 dark:hover:bg-white/5'}`}
              >
                <Icon size={16} className={`mb-1.5 ${active ? '' : 'text-gray-400'}`} />
                <p className="text-xs font-semibold">{rt.label}</p>
                <p className={`text-xs mt-0.5 leading-tight ${active ? 'opacity-80' : 'text-gray-400'}`}>{rt.desc}</p>
              </button>
            );
          })}
        </div>
      </div>

      {/* Assignee / Pool fields */}
      {form.rule_type === 'fixed' && (
        <div>
          <EmployeePicker
            label="Assignee"
            value={form.assignee_id}
            onChange={v => set('assignee_id', v)}
            help="This person will be assigned every matching record."
          />
        </div>
      )}

      {(form.rule_type === 'round_robin' || form.rule_type === 'load_balanced') && (
        <div>
          <EmployeeMultiPicker
            label="Pool Members"
            value={form.pool_ids}
            onChange={v => set('pool_ids', v)}
            help="Records are distributed across these team members."
          />
        </div>
      )}

      {form.rule_type === 'rule_based' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <EmployeePicker
              label="Assignee (when conditions match)"
              value={form.assignee_id}
              onChange={v => set('assignee_id', v)}
              help="Leave blank to rotate through the pool instead."
            />
            {/* The engine rotates through a pool when a rule_based rule matches
                and names no assignee. The picker was hidden for this type, so
                that path could not be configured from here. */}
            <EmployeeMultiPicker
              label="Or rotate through a pool"
              value={form.pool_ids}
              onChange={v => set('pool_ids', v)}
              help="Used only when no assignee is named. Round-robin, per rule."
            />
          </div>
          <div>
            <label className="form-label">Conditions <span className="font-normal text-gray-400">(all must match)</span></label>
            <div className="mt-1.5">
              <ConditionsEditor conditions={form.conditions} onChange={(c) => set('conditions', c)} />
            </div>
          </div>
        </div>
      )}

      {/* Fallback + order + active */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <EmployeePicker
            label="Fallback Assignee"
            value={form.fallback_id}
            onChange={v => set('fallback_id', v)}
            help="Used if no rule matches."
          />
        </div>
        <div>
          <label className="form-label">Order Index</label>
          <input
            className="form-input"
            type="number"
            value={form.order_index}
            onChange={e => set('order_index', Number(e.target.value))}
            placeholder="0"
          />
        </div>
      </div>
      <label className="flex items-center gap-2.5 cursor-pointer select-none">
        <input
          type="checkbox"
          checked={form.is_active}
          onChange={e => set('is_active', e.target.checked)}
          className="rounded border-gray-300 text-primary-600"
        />
        <span className="text-sm text-gray-700 dark:text-gray-300 font-medium">Active</span>
        <span className="text-xs text-gray-400">Rule will be evaluated on new records</span>
      </label>

      <div className="flex gap-2 justify-end pt-1">
        <Button variant="secondary" onClick={onCancel}>Cancel</Button>
        <Button onClick={handleSave}>
          <Save size={14} /> Save Rule
        </Button>
      </div>
    </div>
  );
}

const OUTCOME_STYLE = {
  matched:  'text-emerald-700 bg-emerald-50 dark:bg-emerald-500/15 dark:text-emerald-300',
  no_match: 'text-gray-600 bg-gray-100 dark:bg-white/10 dark:text-gray-300',
  skipped:  'text-gray-400 bg-gray-50 dark:bg-white/5 dark:text-gray-500',
};

/**
 * "Who would get this record?" — a dry run of the rules for one object.
 *
 * Routing rules fail quietly: a rule that never matches, a pool with nobody
 * active in it, a catch-all placed above the specific rules. The list view
 * cannot show any of that, because the answer depends on the record. So the
 * simulator takes a record (an existing id, or field values typed in) and
 * shows every rule in evaluation order with the outcome and the reason, then
 * the decision. Nothing is written and no rotation is advanced — it is safe to
 * run as often as you like while tuning.
 */
function RuleSimulator({ objectId, getEmployeeName, getObjectLabel }) {
  const [mode, setMode] = useState('record');
  const [recordId, setRecordId] = useState('');
  const [fieldsText, setFieldsText] = useState('{\n  "lead_source": "referral",\n  "annual_revenue": 120000\n}');
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  const run = useMutation({
    mutationFn: (body) => builderService.explainAssignment(body),
    onSuccess: (res) => { setResult(res?.data ?? res); setError(null); },
    onError: (e) => { setError(e?.response?.data?.error?.message || e?.response?.data?.message || e.message); setResult(null); },
  });

  const submit = () => {
    if (!objectId) return;
    if (mode === 'record') {
      if (!recordId) { setError('Enter a record id'); return; }
      run.mutate({ object_id: Number(objectId), record_id: Number(recordId) });
    } else {
      let fields;
      try { fields = JSON.parse(fieldsText); } catch (e) { setError(`Field values must be a JSON object — ${e.message}`); return; }
      run.mutate({ object_id: Number(objectId), fields });
    }
  };

  if (!objectId) {
    return (
      <div className="rounded-2xl border border-dashed border-gray-200 p-5 text-center text-xs text-gray-400 dark:border-white/10">
        <FlaskConical className="mx-auto mb-2 h-5 w-5" />
        Pick an object above to test its rules against a record.
      </div>
    );
  }

  const decision = result?.decision;

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-white/[0.07] dark:bg-night-2">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="flex items-center gap-2 text-sm font-semibold text-gray-800 dark:text-white/80">
            <FlaskConical className="h-4 w-4 text-primary-500" /> Test these rules
          </h3>
          <p className="mt-0.5 text-xs text-gray-400">
            See which rule would win for a {getObjectLabel(objectId).toLowerCase()} record, and why. Nothing is assigned.
          </p>
        </div>
        <div className="inline-flex rounded-lg border border-gray-200 bg-gray-50 p-0.5 dark:border-white/10 dark:bg-white/5">
          {[['record', 'Existing record'], ['fields', 'Field values']].map(([k, l]) => (
            <button key={k} type="button" onClick={() => setMode(k)} aria-pressed={mode === k}
              className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${mode === k ? 'bg-white text-gray-800 shadow-sm dark:bg-white/15 dark:text-white' : 'text-gray-500 hover:text-gray-800 dark:text-gray-400'}`}>
              {l}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-start">
        {mode === 'record' ? (
          <input className="form-input sm:w-56" type="number" min="1" placeholder="Record id" value={recordId} onChange={(e) => setRecordId(e.target.value)} />
        ) : (
          <textarea className="form-input flex-1 font-mono text-xs" rows={4} value={fieldsText} onChange={(e) => setFieldsText(e.target.value)} />
        )}
        <Button onClick={submit} disabled={run.isPending}>
          {run.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <FlaskConical className="h-4 w-4" />} Run
        </Button>
      </div>
      {error && <p className="mt-2 text-xs text-red-500">{error}</p>}

      {result && (
        <div className="mt-5 space-y-4">
          <div className={`flex items-start gap-3 rounded-xl p-3 ${decision?.assignee ? 'bg-emerald-50 dark:bg-emerald-500/10' : 'bg-amber-50 dark:bg-amber-500/10'}`}>
            {decision?.assignee
              ? <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
              : <X className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />}
            <div className="text-sm">
              {decision?.assignee ? (
                <>
                  <span className="font-semibold text-gray-900 dark:text-white">{getEmployeeName(decision.assignee)}</span>
                  <span className="text-gray-600 dark:text-gray-300"> would be assigned</span>
                  <span className="text-gray-400"> · via {decision.method.replace('_', ' ')}{decision.rule_id ? '' : ' (no rule matched)'}</span>
                </>
              ) : (
                <span className="text-gray-700 dark:text-gray-200">
                  <strong>Nobody would be assigned.</strong> No rule matched and no fallback is set — this record would sit unowned.
                </span>
              )}
            </div>
          </div>

          <ol className="space-y-1.5">
            {result.trace.map((t) => (
              <li key={t.rule_id} className="rounded-xl border border-gray-100 px-3 py-2 dark:border-white/[0.06]">
                <div className="flex flex-wrap items-center gap-2">
                  <ChevronRight className="h-3 w-3 text-gray-300" />
                  <span className="text-sm font-medium text-gray-800 dark:text-white/80">{t.name || `Rule #${t.rule_id}`}</span>
                  <span className="text-[11px] text-gray-400">{t.rule_type.replace('_', ' ')} · order {t.order_index}</span>
                  <span className={`ml-auto rounded-full px-2 py-0.5 text-[11px] font-medium ${OUTCOME_STYLE[t.outcome] ?? OUTCOME_STYLE.skipped}`}>
                    {t.outcome.replace('_', ' ')}
                  </span>
                </div>
                <p className="mt-0.5 pl-5 text-xs text-gray-500 dark:text-gray-400">{t.reason}</p>
                {t.failed_conditions?.length > 0 && (
                  <ul className="mt-1 pl-5 text-[11px] text-gray-400">
                    {t.failed_conditions.map((c, i) => (
                      <li key={i}><code>{c.field}</code> {c.operator} <code>{String(c.value ?? '')}</code> — actual: <code>{String(c.actual ?? '∅')}</code></li>
                    ))}
                  </ul>
                )}
                {t.load?.length > 0 && (
                  <p className="mt-1 pl-5 text-[11px] text-gray-400">
                    Open load: {t.load.map((l) => `${getEmployeeName(l.employee_id)} ${l.open}`).join(' · ')}
                  </p>
                )}
                {t.dropped_inactive?.length > 0 && (
                  <p className="mt-1 pl-5 text-[11px] text-amber-600 dark:text-amber-400">
                    Skipped (deactivated): {t.dropped_inactive.map(getEmployeeName).join(', ')}
                  </p>
                )}
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}

export default function AssignmentBuilderPage() {
  const [objectIdFilter, setObjectIdFilter] = useState('');
  const [showForm, setShowForm]             = useState(false);
  const [editing, setEditing]               = useState(null);
  const qc = useQueryClient();

  const { objects } = useAllObjects();
  const employeeMap = useEmployeeMap();

  const { data, isLoading } = useQuery({
    queryKey: ['assignment-rules', objectIdFilter],
    queryFn:  () => builderService.getAssignmentRules(objectIdFilter || undefined),
  });
  const rules = data?.data ?? [];

  const createMut = useMutation({
    mutationFn: (d) => builderService.createAssignmentRule(d),
    onSuccess:  () => { qc.invalidateQueries({ queryKey: ['assignment-rules'] }); setShowForm(false); },
  });

  const updateMut = useMutation({
    mutationFn: ({ id, ...d }) => builderService.updateAssignmentRule(id, d),
    onSuccess:  () => { qc.invalidateQueries({ queryKey: ['assignment-rules'] }); setEditing(null); },
  });

  const deleteMut = useMutation({
    mutationFn: (id) => builderService.deleteAssignmentRule(id),
    onSuccess:  () => qc.invalidateQueries({ queryKey: ['assignment-rules'] }),
  });

  const handleSave = (form) => {
    if (editing) {
      updateMut.mutate({ id: editing.id, ...form });
    } else {
      createMut.mutate(form);
    }
  };

  const getObjectLabel = (id) => {
    const obj = objects.find(o => String(o.id) === String(id));
    return obj?.label || obj?.name || `Object #${id}`;
  };

  const getEmployeeName = (id) => employeeMap.get(String(id)) || String(id || '—');

  const RULE_TYPE_META = Object.fromEntries(RULE_TYPES.map(rt => [rt.value, rt]));

  return (
    <div className="max-w-4xl mx-auto py-8 px-4 space-y-6">
      {/* Header */}
      <PageHeader
        icon={Users}
        eyebrow="Builder"
        title="Assignment Rules"
        subtitle="Configure how new records are automatically assigned. Rules are evaluated in order — first match wins."
        className="!mb-0"
        actions={(
          <Button onClick={() => { setEditing(null); setShowForm(true); }} className="shrink-0">
            <Plus size={15} /> New Rule
          </Button>
        )}
      />

      <BuilderGuide section="/builder/assignment" />

      {/* Filter */}
      <div>
        <ObjectPicker
          value={objectIdFilter}
          onChange={setObjectIdFilter}
          placeholder="All objects"
          label="Filter by object"
          wrapperClass="max-w-xs"
        />
      </div>

      <RuleSimulator objectId={objectIdFilter} getEmployeeName={getEmployeeName} getObjectLabel={getObjectLabel} />

      {/* New rule form */}
      {showForm && !editing && (
        <RuleForm onSave={handleSave} onCancel={() => setShowForm(false)} />
      )}

      {/* Rules list */}
      {isLoading ? (
        <p className="text-sm text-gray-400 py-4">Loading…</p>
      ) : rules.length === 0 ? (
        <div className="text-center py-20 bg-white dark:bg-night-2 rounded-2xl border border-gray-200 dark:border-white/[0.07]">
          <div className="w-14 h-14 rounded-2xl bg-violet-50 dark:bg-violet-500/10 border border-violet-100 dark:border-violet-500/20 flex items-center justify-center mx-auto mb-4">
            <Users className="w-6 h-6 text-violet-400" />
          </div>
          <p className="text-sm font-medium text-gray-600 dark:text-gray-400">No assignment rules yet</p>
          <p className="text-xs text-gray-400 mt-1">Click &ldquo;New Rule&rdquo; to get started</p>
        </div>
      ) : (
        <div className="space-y-2">
          {rules.map((rule) => (
            <div key={rule.id}>
              {editing?.id === rule.id ? (
                <RuleForm
                  rule={editing}
                  onSave={handleSave}
                  onCancel={() => setEditing(null)}
                />
              ) : (
                <div className="border border-gray-200 dark:border-white/[0.07] rounded-2xl p-4 flex items-center gap-3 hover:border-gray-300 dark:hover:border-white/[0.12] bg-white dark:bg-night-2 hover:shadow-sm transition-all">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-gray-800 dark:text-white/80 text-sm">{rule.name || `Rule #${rule.id}`}</span>
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${rule.is_active ? 'bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-400' : 'bg-gray-100 dark:bg-white/10 text-gray-500'}`}>
                        {rule.is_active ? 'Active' : 'Inactive'}
                      </span>
                      {RULE_TYPE_META[rule.rule_type] && (() => {
                        const meta = RULE_TYPE_META[rule.rule_type];
                        const Icon = meta.Icon;
                        return (
                          <span className="px-2 py-0.5 rounded-full text-xs bg-primary-50 dark:bg-primary-500/10 text-primary-600 dark:text-primary-400 border border-primary-100 dark:border-primary-500/20 flex items-center gap-1">
                            <Icon size={10} /> {meta.label}
                          </span>
                        );
                      })()}
                    </div>
                    <p className="text-xs text-gray-400 mt-1 flex items-center gap-2 flex-wrap">
                      <span>{getObjectLabel(rule.object_id)}</span>
                      <span className="text-gray-200">·</span>
                      <span>Order {rule.order_index}</span>
                      {rule.assignee_id && (
                        <>
                          <span className="text-gray-200">·</span>
                          <span>Assigns to {getEmployeeName(rule.assignee_id)}</span>
                        </>
                      )}
                      {rule.pool_ids?.length > 0 && (
                        <>
                          <span className="text-gray-200">·</span>
                          <span>Pool: {rule.pool_ids.map(id => getEmployeeName(id)).join(', ')}</span>
                        </>
                      )}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => setEditing(rule)}
                      className="text-xs text-primary-600 dark:text-primary-400 hover:text-primary-800 dark:hover:text-primary-300 px-2.5 py-1.5 rounded-lg hover:bg-primary-50 dark:hover:bg-primary-500/10 transition-colors font-medium"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => deleteMut.mutate(rule.id)}
                      className="text-red-400 hover:text-red-600 p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
