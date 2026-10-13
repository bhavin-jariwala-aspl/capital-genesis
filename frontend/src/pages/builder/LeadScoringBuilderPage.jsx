import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Star, Plus, Edit, Trash2, Zap, Users, TrendingUp, AlertTriangle } from 'lucide-react';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import Select from '../../components/ui/Select';
import Badge from '../../components/ui/Badge';
import Modal from '../../components/ui/Modal';
import Spinner from '../../components/ui/Spinner';
import PageHeader from '../../components/ui/PageHeader';
import BuilderGuide from '../../components/builder/BuilderGuide';
import api from '../../services/api';

const wrap = (p) => p.then(r => ({ data: r.data?.data ?? r.data }));

const scoringApi = {
  getRules:     ()           => wrap(api.get('/lead-scoring/rules')),
  createRule:   (data)       => wrap(api.post('/lead-scoring/rules', data)),
  updateRule:   (id, data)   => wrap(api.put(`/lead-scoring/rules/${id}`, data)),
  deleteRule:   (id)         => api.delete(`/lead-scoring/rules/${id}`),
  setupDefaults: ()          => wrap(api.post('/lead-scoring/rules/setup-defaults')),
};

const RULE_TYPES = [
  { value: 'demographic', label: 'Demographic' },
  { value: 'behavioral',  label: 'Behavioral' },
  { value: 'engagement',  label: 'Engagement' },
];

/**
 * Every operator the scoring engine implements.
 *
 * Five of these (starts_with, ends_with, greater_equal, less_equal,
 * not_in_list) were implemented in `LeadScoringService.#evaluateRule` but
 * missing from this list, so they could not be chosen — a rule could only use
 * nine of the fourteen the engine understands.
 */
const OPERATORS = [
  { value: 'equals',        label: 'equals' },
  { value: 'not_equals',    label: 'does not equal' },
  { value: 'contains',      label: 'contains' },
  { value: 'not_contains',  label: 'does not contain' },
  { value: 'starts_with',   label: 'starts with' },
  { value: 'ends_with',     label: 'ends with' },
  { value: 'greater_than',  label: 'is greater than' },
  { value: 'greater_equal', label: 'is greater than or equal to' },
  { value: 'less_than',     label: 'is less than' },
  { value: 'less_equal',    label: 'is less than or equal to' },
  { value: 'in_list',       label: 'is one of (comma-separated)' },
  { value: 'not_in_list',   label: 'is not one of (comma-separated)' },
  { value: 'is_empty',      label: 'is empty' },
  { value: 'is_not_empty',  label: 'is not empty' },
];

/**
 * Operators that test the field itself, so asking for a value would mislead.
 * `is_empty` is also the only operator that can match a null field — the engine
 * short-circuits there.
 */
const VALUELESS_OPERATORS = new Set(['is_empty', 'is_not_empty']);

const OPERATOR_LABEL = Object.fromEntries(OPERATORS.map((o) => [o.value, o.label]));

/** Operators that compare numerically, so a non-numeric value never matches. */
const NUMERIC_OPERATORS = new Set(['greater_than', 'greater_equal', 'less_than', 'less_equal']);

const LEAD_FIELDS = [
  { value: 'job_title',      label: 'Job Title' },
  { value: 'industry',       label: 'Industry' },
  { value: 'company',        label: 'Company' },
  { value: 'email',          label: 'Email' },
  { value: 'phone',          label: 'Phone' },
  { value: 'website',        label: 'Website' },
  { value: 'lead_source',    label: 'Lead Source' },
  { value: 'lead_status',    label: 'Lead Status' },
  { value: 'rating',         label: 'Rating' },
  { value: 'annual_revenue', label: 'Annual Revenue' },
];

const TYPE_COLORS = {
  demographic: { bg: 'bg-blue-50',    text: 'text-blue-700',    icon: Users },
  behavioral:  { bg: 'bg-purple-50',  text: 'text-purple-700',  icon: TrendingUp },
  engagement:  { bg: 'bg-emerald-50', text: 'text-emerald-700', icon: Zap },
};

const emptyRule = () => ({
  name: '', description: '', rule_type: 'demographic', field_name: '',
  operator: 'equals', field_value: '', points: '10', is_active: true,
});

export default function LeadScoringBuilderPage() {
  const qc = useQueryClient();
  const [modalOpen, setModalOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [form, setForm] = useState(emptyRule());
  const valueless = VALUELESS_OPERATORS.has(form.operator);
  const numeric = NUMERIC_OPERATORS.has(form.operator);
  const listy = form.operator === 'in_list' || form.operator === 'not_in_list';

  const { data: rules = [], isLoading } = useQuery({
    queryKey: ['scoring-rules'],
    queryFn: () => scoringApi.getRules().then(r => r.data || []),
  });

  const createMut = useMutation({
    mutationFn: d => scoringApi.createRule(d),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['scoring-rules'] }); closeModal(); },
  });
  const updateMut = useMutation({
    mutationFn: ({ id, data }) => scoringApi.updateRule(id, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['scoring-rules'] }); closeModal(); },
  });
  const deleteMut = useMutation({
    mutationFn: id => scoringApi.deleteRule(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['scoring-rules'] }); setDeleteTarget(null); },
  });
  const setupMut = useMutation({
    mutationFn: () => scoringApi.setupDefaults(),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['scoring-rules'] }),
  });

  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));
  const openCreate = () => { setForm(emptyRule()); setModalOpen(true); };
  const openEdit = (r) => {
    setForm({ _isEdit: true, _id: r.id, name: r.name, description: r.description || '',
      rule_type: r.rule_type, field_name: r.field_name, operator: r.operator,
      field_value: r.field_value || '', points: String(r.points), is_active: r.is_active });
    setModalOpen(true);
  };
  const closeModal = () => { setModalOpen(false); setForm(emptyRule()); };

  const handleSubmit = () => {
    const { _isEdit, _id, ...fields } = form;
    const payload = { ...fields, points: parseInt(fields.points) || 0 };
    if (_isEdit) updateMut.mutate({ id: _id, data: payload });
    else createMut.mutate(payload);
  };

  const saving = createMut.isPending || updateMut.isPending;

  return (
    <div className="min-h-full bg-surface px-4 py-8">
      <div className="mx-auto max-w-4xl space-y-6">
        {/* Header */}
        <PageHeader
          icon={Star}
          eyebrow="Builder"
          title="Lead Scoring Rules"
          subtitle="Configure rules that automatically score and qualify leads."
          className="!mb-0"
          actions={(
            <>
              {rules.length === 0 && (
                <Button variant="secondary" size="md" onClick={() => setupMut.mutate()} loading={setupMut.isPending}>
                  <Zap className="h-4 w-4" /> Setup Defaults
                </Button>
              )}
              <Button variant="primary" size="md" onClick={openCreate} className="shrink-0">
                <Plus className="h-4 w-4" /> New Rule
              </Button>
            </>
          )}
        />

      <BuilderGuide section="/builder/lead-scoring" />

        {/* Rule-type counts */}
        <div className="widget widget-pad grid grid-cols-3 divide-x divide-gray-100 dark:divide-white/[0.07] text-center">
          {RULE_TYPES.map(t => {
            const count = rules.filter(r => r.rule_type === t.value).length;
            return (
              <div key={t.value} className="px-4">
                <p className="text-xs text-gray-500">{t.label}</p>
                <p className="text-lg font-bold text-gray-800 dark:text-gray-200">{count}</p>
              </div>
            );
          })}
        </div>

        {/* Rules list */}
        <div className="card overflow-hidden">
          {isLoading ? (
            <div className="flex justify-center py-16"><Spinner size="lg" /></div>
          ) : rules.length === 0 ? (
            <div className="px-5 py-16 text-center text-sm text-gray-400">
              No scoring rules yet. Click &ldquo;Setup Defaults&rdquo; for a starter set, or create your own.
            </div>
          ) : (
            <div className="divide-y divide-gray-50 dark:divide-white/[0.04]">
              {rules.map(r => {
                const tc = TYPE_COLORS[r.rule_type] || TYPE_COLORS.demographic;
                const Icon = tc.icon;
                return (
                  <div key={r.id} className="flex items-center gap-4 px-5 py-3 hover:bg-gray-50/50 dark:hover:bg-white/[0.02]">
                    <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${tc.bg}`}>
                      <Icon className={`h-3.5 w-3.5 ${tc.text}`} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{r.name}</p>
                      <p className="text-xs text-gray-400">
                        {r.field_name} {OPERATOR_LABEL[r.operator] ?? r.operator} {r.field_value ? `"${r.field_value}"` : ''}
                      </p>
                    </div>
                    <Badge variant={r.points > 0 ? 'success' : 'danger'}>
                      {r.points > 0 ? '+' : ''}{r.points} pts
                    </Badge>
                    {!r.is_active && <Badge variant="default">Inactive</Badge>}
                    <div className="flex items-center gap-1">
                      <Button variant="ghost" size="xs" onClick={() => openEdit(r)}><Edit className="h-3 w-3" /></Button>
                      <Button variant="ghost" size="xs" className="text-red-400 hover:text-red-600" onClick={() => setDeleteTarget(r)}><Trash2 className="h-3 w-3" /></Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Create / Edit Modal */}
      <Modal open={modalOpen} onClose={closeModal} title={form._isEdit ? 'Edit Rule' : 'New Scoring Rule'} size="md">
        <div className="space-y-4">
          <Input label="Rule Name" required value={form.name} onChange={e => set('name', e.target.value)} placeholder="Senior Job Title" />
          <Input label="Description" value={form.description} onChange={e => set('description', e.target.value)} placeholder="Optional description" />
          <div className="grid grid-cols-2 gap-4">
            <Select label="Rule Type" options={RULE_TYPES} value={form.rule_type} onChange={e => set('rule_type', e.target.value)} />
            <Select label="Lead Field" options={LEAD_FIELDS} value={form.field_name} onChange={e => set('field_name', e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Select
              label="Operator" options={OPERATORS}
              value={form.operator} onChange={e => set('operator', e.target.value)}
            />
            {/* An operator that tests the field itself takes no value — showing
                the box invites a value that is then silently ignored. */}
            {valueless ? (
              <div className="flex flex-col justify-end pb-2">
                <p className="text-xs text-gray-400">
                  &ldquo;{OPERATOR_LABEL[form.operator]}&rdquo; tests the field itself — no value needed.
                </p>
              </div>
            ) : (
              <Input
                label="Value"
                value={form.field_value}
                onChange={e => set('field_value', e.target.value)}
                placeholder={numeric ? '50000' : 'VP, Director, Chief'}
                error={numeric && form.field_value !== '' && Number.isNaN(Number(form.field_value))
                  ? 'This operator compares numbers — a non-numeric value never matches.'
                  : undefined}
                help={listy ? 'Comma-separated. Matching is exact per item, so mind the spacing.' : undefined}
              />
            )}
          </div>
          <Input
            label="Points" type="number"
            value={form.points} onChange={e => set('points', e.target.value)}
            help="Negative points are how you disqualify — a model where every rule adds will eventually rate every lead highly."
          />
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={closeModal} disabled={saving}>Cancel</Button>
            <Button variant="primary" onClick={handleSubmit} loading={saving} disabled={!form.name || !form.field_name}>
              {form._isEdit ? 'Save Changes' : 'Create Rule'}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Delete Modal */}
      <Modal open={!!deleteTarget} onClose={() => setDeleteTarget(null)} title="Delete Rule" size="sm">
        <div className="space-y-4">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-red-50 dark:bg-red-500/10">
              <AlertTriangle className="h-5 w-5 text-red-500" />
            </div>
            <div>
              <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                Delete rule &ldquo;{deleteTarget?.name}&rdquo;?
              </p>
              <p className="mt-1 text-sm text-gray-500">Rules used in existing scores will be deactivated instead of deleted.</p>
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setDeleteTarget(null)}>Cancel</Button>
            <Button variant="danger" onClick={() => deleteMut.mutate(deleteTarget.id)} loading={deleteMut.isPending}>Delete</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
