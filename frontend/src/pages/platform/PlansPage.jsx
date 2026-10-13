import { Fragment, useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { platformService } from '../../services/platform.service';
import {
  Check, CreditCard, Info, LayoutGrid, Minus, Pencil, Plus,
  RotateCcw, Table2, Trash2, Users,
} from 'lucide-react';
import PageHeader from '../../components/ui/PageHeader';
import Modal from '../../components/ui/Modal';
import Input from '../../components/ui/Input';
import Button from '../../components/ui/Button';
import Badge from '../../components/ui/Badge';
import { showError, showSuccess, confirmDialog } from '../../utils/dialog';

/**
 * Subscription plans, and what each one sells.
 *
 * ── What changed, and why it mattered ───────────────────────────────────────
 * The plan editor had fields for prices, trial length and six numeric limits —
 * and none for features. `subscription_plans.features` could therefore only
 * ever hold what `prisma/seed.js` wrote once: free text (`'basic_crm'`,
 * `'workflow_automation'`) that matched no feature flag and no code path. A
 * plan priced tiers; it did not gate anything.
 *
 * So this page now edits the thing that decides what a customer gets:
 *
 *   - **A feature matrix in the editor**, grouped, with the catalogue's own
 *     default for the tier one click away. Picking features is the point of a
 *     plan, so it is not buried behind a second screen.
 *   - **A comparison view**, tiers across the top and the catalogue down the
 *     side, because "is Professional actually a superset of Starter?" is
 *     unanswerable from four separate cards and is the single most common way
 *     a price book goes wrong.
 *   - **Tenant counts per plan**, so an operator can see what a change will
 *     affect before making it.
 */

const LIMIT_FIELDS = [
  ['max_users',      'Users',          Users],
  ['max_storage_mb', 'Storage (MB)',   null],
  ['max_api_calls',  'API calls / mo', null],
  ['max_records',    'Records',        null],
  ['max_workflows',  'Workflows',      null],
  ['max_dashboards', 'Dashboards',     null],
];

const BLANK = {
  name: '', label: '', description: '', price_monthly: 0, price_annual: 0,
  max_users: 5, max_storage_mb: 500, max_api_calls: 10000, max_records: 10000,
  max_workflows: 5, max_dashboards: 3, trial_days: 14, order_index: 0,
  features: null, // null = "not touched"; the server keeps the tier default
};

const TIER_VARIANT = {
  free: 'default', starter: 'info', professional: 'purple', enterprise: 'primary',
};

/**
 * The feature picker inside the plan editor.
 *
 * Group-level select-all matters here: Enterprise differs from Professional by
 * whole groups, and ticking thirty boxes one at a time is how a price book ends
 * up subtly wrong.
 */
function FeaturePicker({ catalogue, selected, onChange, onReset, planName }) {
  const chosen = useMemo(() => new Set(selected ?? []), [selected]);

  const toggle = (key) => {
    const next = new Set(chosen);
    if (next.has(key)) next.delete(key); else next.add(key);
    onChange([...next]);
  };

  const toggleGroup = (group, on) => {
    const next = new Set(chosen);
    for (const f of group.features) {
      if (f.core) continue; // always included; the server re-adds it anyway
      if (on) next.add(f.key); else next.delete(f.key);
    }
    onChange([...next]);
  };

  if (!catalogue) return <p className="py-4 text-xs text-gray-400">Loading the feature catalogue…</p>;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-gray-500 dark:text-gray-400">
          <strong className="text-gray-700 dark:text-gray-200">{chosen.size}</strong> feature(s) included
        </p>
        <Button variant="outline" size="sm" onClick={onReset} type="button">
          <RotateCcw className="h-3 w-3" /> Use the standard set for this tier
        </Button>
      </div>

      {catalogue.groups.map((group) => {
        const selectable = group.features.filter((f) => !f.core);
        const allOn = selectable.length > 0 && selectable.every((f) => chosen.has(f.key));
        return (
          <section key={group.key} className="overflow-hidden rounded-xl border border-gray-200 dark:border-white/10">
            <header className="flex items-center justify-between gap-2 border-b border-gray-200 bg-gray-50/70 px-3 py-2 dark:border-white/10 dark:bg-white/[0.03]">
              <h4 className="text-[11px] font-semibold uppercase tracking-wider text-gray-600 dark:text-gray-300">
                {group.label}
              </h4>
              {selectable.length > 0 && (
                <button
                  type="button"
                  onClick={() => toggleGroup(group, !allOn)}
                  className="text-[11px] font-medium text-primary-600 hover:underline dark:text-primary-400"
                >
                  {allOn ? 'Clear group' : 'Select group'}
                </button>
              )}
            </header>
            <ul className="divide-y divide-gray-100 dark:divide-white/[0.06]">
              {group.features.map((f) => {
                const id = `feat-${f.key}`;
                const standard = planName ? f.included_in.includes(planName) : false;
                return (
                  <li key={f.key} className="flex items-start gap-2.5 px-3 py-2">
                    <input
                      id={id} type="checkbox"
                      checked={f.core || chosen.has(f.key)}
                      disabled={f.core}
                      onChange={() => toggle(f.key)}
                      className="mt-0.5 h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500 disabled:opacity-50 dark:border-white/20 dark:bg-white/5"
                    />
                    <label htmlFor={id} className="min-w-0 flex-1 cursor-pointer">
                      <span className="flex flex-wrap items-center gap-1.5">
                        <span className="text-sm text-gray-800 dark:text-gray-200">{f.label}</span>
                        {f.core && <Badge variant="default">always on</Badge>}
                        {!f.core && standard && <Badge variant="success">standard here</Badge>}
                        {!f.core && !standard && (
                          <Badge variant="default" className="capitalize">from {f.min_plan}</Badge>
                        )}
                      </span>
                      <span className="block text-[11px] text-gray-400 dark:text-gray-500">{f.description}</span>
                    </label>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

/** Tiers across the top, catalogue down the side. */
function ComparisonGrid({ comparison }) {
  if (!comparison) return <p className="py-6 text-center text-sm text-gray-400">Loading comparison…</p>;
  const { plans, groups } = comparison;
  const has = (plan, key) => plan.features.includes(key);

  return (
    <div className="overflow-hidden rounded-xl border border-gray-200 bg-white dark:border-white/[0.06] dark:bg-white/[0.04]">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 dark:border-white/[0.06]">
              <th className="sticky left-0 bg-white px-4 py-3 text-left text-xs font-semibold uppercase text-gray-500 dark:bg-night-2 dark:text-white/50">
                Feature
              </th>
              {plans.map((p) => (
                <th key={p.name} className="px-4 py-3 text-center text-xs font-semibold uppercase text-gray-500 dark:text-white/50">
                  <span className="block text-sm normal-case text-gray-900 dark:text-white">{p.label}</span>
                  <span className="block font-normal normal-case text-gray-400">
                    ${Number(p.price_monthly)}/mo · {p.feature_count} features
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-white/[0.04]">
            {groups.map((group) => (
              // A keyed Fragment, not `<>`: a shorthand fragment cannot carry a
              // key, and each group emits a header row plus its feature rows.
              <Fragment key={group.key}>
                <tr className="bg-gray-50/70 dark:bg-white/[0.03]">
                  <td colSpan={plans.length + 1} className="px-4 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-white/50">
                    {group.label}
                  </td>
                </tr>
                {group.features.map((f) => (
                  <tr key={f.key} className="hover:bg-gray-50 dark:hover:bg-white/[0.02]">
                    <td className="sticky left-0 bg-white px-4 py-2 dark:bg-night-2">
                      <span className="text-gray-800 dark:text-gray-200">{f.label}</span>
                      {f.core && <Badge variant="default" className="ml-2">always on</Badge>}
                    </td>
                    {plans.map((p) => (
                      <td key={p.name} className="px-4 py-2 text-center">
                        {has(p, f.key)
                          ? <Check className="mx-auto h-4 w-4 text-emerald-500" aria-label="Included" />
                          : <Minus className="mx-auto h-4 w-4 text-gray-300 dark:text-white/20" aria-label="Not included" />}
                      </td>
                    ))}
                  </tr>
                ))}
              </Fragment>
            ))}
            <tr className="border-t-2 border-gray-200 bg-gray-50/70 dark:border-white/10 dark:bg-white/[0.03]">
              <td colSpan={plans.length + 1} className="px-4 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-white/50">
                Limits
              </td>
            </tr>
            {[['users', 'Users'], ['storage_mb', 'Storage (MB)'], ['api_calls', 'API calls / mo'],
              ['records', 'Records'], ['workflows', 'Workflows'], ['dashboards', 'Dashboards']].map(([key, label]) => (
              <tr key={key} className="hover:bg-gray-50 dark:hover:bg-white/[0.02]">
                <td className="sticky left-0 bg-white px-4 py-2 text-gray-800 dark:bg-night-2 dark:text-gray-200">{label}</td>
                {plans.map((p) => (
                  <td key={p.name} className="px-4 py-2 text-center text-gray-600 dark:text-white/70">
                    {Number(p.limits[key]).toLocaleString()}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function PlansPage() {
  const qc = useQueryClient();
  const [view, setView] = useState('cards');
  const [editing, setEditing] = useState(null); // { id? } — null when closed
  const [form, setForm] = useState(BLANK);

  const { data: plansRes } = useQuery({ queryKey: ['platform-plans'], queryFn: platformService.listPlans, staleTime: 60_000 });
  const { data: catalogueRes } = useQuery({ queryKey: ['platform-feature-catalogue'], queryFn: platformService.getFeatureCatalogue, staleTime: 60 * 60_000 });
  const { data: compareRes } = useQuery({
    queryKey: ['platform-plans-compare'],
    queryFn: platformService.comparePlans,
    staleTime: 60_000,
    enabled: view === 'compare',
  });

  const plans = plansRes?.data || [];
  const catalogue = catalogueRes?.data;

  const onErr = (e) => showError(e?.response?.data?.error?.message || e?.message || 'Operation failed');
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['platform-plans'] });
    qc.invalidateQueries({ queryKey: ['platform-plans-compare'] });
    // A plan's features decide every tenant on it, so their resolved
    // entitlements are stale now too.
    qc.invalidateQueries({ queryKey: ['platform-tenant-features'] });
  };

  const close = () => { setEditing(null); setForm(BLANK); };
  const createMut = useMutation({ mutationFn: (d) => platformService.createPlan(d), onSuccess: () => { invalidate(); close(); }, onError: onErr });
  const updateMut = useMutation({ mutationFn: ({ id, ...d }) => platformService.updatePlan(id, d), onSuccess: () => { invalidate(); close(); }, onError: onErr });
  const deleteMut = useMutation({ mutationFn: (id) => platformService.deletePlan(id), onSuccess: invalidate, onError: onErr });
  const resetMut = useMutation({
    mutationFn: (id) => platformService.resetPlanFeatures(id),
    onSuccess: (res) => { invalidate(); showSuccess(`Reset to the standard ${res?.data?.features?.length ?? 0} features for this tier`); },
    onError: onErr,
  });

  const openEdit = (plan) => {
    setForm({
      name: plan.name, label: plan.label, description: plan.description || '',
      price_monthly: Number(plan.price_monthly), price_annual: Number(plan.price_annual),
      max_users: plan.max_users, max_storage_mb: plan.max_storage_mb,
      max_api_calls: plan.max_api_calls, max_records: plan.max_records,
      max_workflows: plan.max_workflows, max_dashboards: plan.max_dashboards,
      trial_days: plan.trial_days, order_index: plan.order_index,
      features: plan.features ?? [],
    });
    setEditing({ id: plan.id });
  };

  const openCreate = () => { setForm(BLANK); setEditing({}); };
  const set = (field, value) => setForm((prev) => ({ ...prev, [field]: value }));

  /** Reset the picker to the catalogue's default for this tier, without saving. */
  const resetPickerToTier = () => {
    const tierDefault = (catalogue?.groups ?? [])
      .flatMap((g) => g.features)
      .filter((f) => f.included_in.includes(form.name))
      .map((f) => f.key);
    set('features', tierDefault);
  };

  const save = () => {
    const payload = { ...form };
    // `null` means the operator never opened the picker; let the server keep
    // whatever the plan already sells rather than clearing it.
    if (payload.features === null) delete payload.features;
    if (editing?.id) updateMut.mutate({ id: editing.id, ...payload });
    else createMut.mutate(payload);
  };

  return (
    <div className="mx-auto max-w-[1400px] space-y-6 p-6">
      <PageHeader
        icon={CreditCard}
        eyebrow="Platform"
        title="Subscription Plans"
        subtitle="What each tier costs, what it limits, and which features it sells."
        className="!mb-0"
        actions={(
          <div className="flex shrink-0 items-center gap-2">
            <div className="inline-flex rounded-lg border border-gray-200 bg-gray-50 p-0.5 dark:border-white/10 dark:bg-white/5">
              {[['cards', 'Cards', LayoutGrid], ['compare', 'Compare', Table2]].map(([key, label, Icon]) => (
                <button
                  key={key} type="button" onClick={() => setView(key)} aria-pressed={view === key}
                  className={`flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors ${
                    view === key
                      ? 'bg-white text-gray-800 shadow-sm dark:bg-white/15 dark:text-white'
                      : 'text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-white'}`}
                >
                  <Icon className="h-3.5 w-3.5" /> {label}
                </button>
              ))}
            </div>
            <Button onClick={openCreate} className="whitespace-nowrap">
              <Plus className="h-4 w-4" /> New plan
            </Button>
          </div>
        )}
      />

      <p className="flex items-start gap-2 rounded-xl bg-primary-50/60 p-3 text-xs text-primary-900 dark:bg-primary-500/10 dark:text-primary-200">
        <Info className="mt-0.5 h-4 w-4 shrink-0" />
        <span>
          A plan&rsquo;s feature list is the entitlement every tenant on it inherits. A tenant can be
          granted or revoked individual features as an exception — see <strong>Features</strong> on a
          tenant row. A feature flag sits on top of the plan for gradual rollout, and can only ever
          withhold a feature, never sell one.
        </span>
      </p>

      {/* Editor */}
      <Modal
        open={Boolean(editing)}
        onClose={close}
        size="xl"
        icon={CreditCard}
        eyebrow="Plan"
        title={editing?.id ? `Edit ${form.label || form.name}` : 'Create plan'}
        subtitle="Pricing and limits, then the features this tier sells."
        footer={(
          <div className="flex items-center justify-end gap-2">
            <Button variant="ghost" onClick={close}>Cancel</Button>
            <Button
              onClick={save}
              loading={createMut.isPending || updateMut.isPending}
              disabled={!form.name || !form.label}
            >
              {editing?.id ? 'Save plan' : 'Create plan'}
            </Button>
          </div>
        )}
      >
        <div className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              label="Name (slug)" required value={form.name} disabled={Boolean(editing?.id)}
              onChange={(e) => set('name', e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
              help={editing?.id ? 'Fixed — tenants reference this name.' : 'free, starter, professional, enterprise, or your own.'}
            />
            <Input label="Display label" required value={form.label} onChange={(e) => set('label', e.target.value)} />
          </div>
          <Input label="Description" value={form.description} onChange={(e) => set('description', e.target.value)} />

          <div className="grid gap-4 sm:grid-cols-3">
            <Input label="Monthly price" type="number" min="0" value={form.price_monthly} onChange={(e) => set('price_monthly', Number(e.target.value))} prefix="$" />
            <Input label="Annual price" type="number" min="0" value={form.price_annual} onChange={(e) => set('price_annual', Number(e.target.value))} prefix="$" />
            <Input label="Trial days" type="number" min="0" max="365" value={form.trial_days} onChange={(e) => set('trial_days', Number(e.target.value))} />
          </div>

          <fieldset className="rounded-xl border border-gray-200 p-4 dark:border-white/10">
            <legend className="px-1 text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Limits</legend>
            <div className="grid gap-4 sm:grid-cols-3">
              {LIMIT_FIELDS.map(([field, label]) => (
                <Input
                  key={field} label={label} type="number" min="0" value={form[field]}
                  onChange={(e) => set(field, Number(e.target.value))}
                />
              ))}
            </div>
          </fieldset>

          <fieldset className="rounded-xl border border-gray-200 p-4 dark:border-white/10">
            <legend className="px-1 text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
              Features included
            </legend>
            <FeaturePicker
              catalogue={catalogue}
              planName={form.name}
              selected={form.features ?? []}
              onChange={(keys) => set('features', keys)}
              onReset={resetPickerToTier}
            />
          </fieldset>
        </div>
      </Modal>

      {view === 'compare' ? (
        <ComparisonGrid comparison={compareRes?.data} />
      ) : (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {plans.map((plan) => (
            <div key={plan.id} className="flex flex-col rounded-xl border border-gray-200 bg-white p-5 dark:border-white/[0.06] dark:bg-white/[0.04]">
              <div className="mb-3 flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <h3 className="truncate text-lg font-bold text-gray-900 dark:text-white">{plan.label}</h3>
                  <Badge variant={TIER_VARIANT[plan.name] ?? 'default'} className="mt-1 capitalize">{plan.name}</Badge>
                </div>
                <div className="flex shrink-0 gap-1">
                  <button onClick={() => openEdit(plan)} title="Edit plan"
                    className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 dark:hover:bg-white/5">
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={async () => {
                      if (await confirmDialog({
                        title: `Reset ${plan.label} features`,
                        message: 'The plan will sell exactly the standard set for its tier. Any hand-picked additions or removals are discarded.',
                        confirmLabel: 'Reset features',
                      })) resetMut.mutate(plan.id);
                    }}
                    title="Reset features to the tier default"
                    className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 dark:hover:bg-white/5"
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={async () => {
                      if (await confirmDialog({
                        title: `Delete ${plan.label}`,
                        message: plan.tenant_count > 0
                          ? `${plan.tenant_count} tenant(s) are on this plan — deleting it will be refused until they are moved.`
                          : 'The plan will no longer be available to assign to tenants.',
                        confirmLabel: 'Delete plan',
                        tone: 'danger',
                      })) deleteMut.mutate(plan.id);
                    }}
                    title="Delete plan"
                    className="rounded-lg p-1.5 text-red-400 hover:bg-red-100 dark:hover:bg-red-500/20"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>

              <p className="text-2xl font-bold text-gray-900 dark:text-white">
                ${Number(plan.price_monthly)}<span className="text-sm font-normal text-gray-400">/mo</span>
              </p>
              <p className="mb-3 text-xs text-gray-400">
                ${Number(plan.price_annual)}/yr · {plan.trial_days}d trial
              </p>
              {plan.description && <p className="mb-3 text-xs text-gray-500 dark:text-white/50">{plan.description}</p>}

              <div className="mb-3 flex flex-wrap items-center gap-2">
                <Badge variant="primary">{plan.features?.length ?? 0} features</Badge>
                <Badge variant={plan.tenant_count > 0 ? 'info' : 'default'} className="gap-1">
                  <Users className="h-2.5 w-2.5" />
                  {plan.tenant_count} tenant{plan.tenant_count === 1 ? '' : 's'}
                </Badge>
                {!plan.features_explicit && (
                  <Badge variant="warning" title="No explicit list stored — showing the catalogue default for this tier">
                    tier default
                  </Badge>
                )}
              </div>

              <div className="flex-1 space-y-1.5 text-xs text-gray-600 dark:text-white/60">
                {LIMIT_FIELDS.map(([field, label]) => (
                  <div key={field} className="flex items-center gap-1.5">
                    <Check className="h-3 w-3 shrink-0 text-green-500" />
                    <span>{Number(plan[field]).toLocaleString()} {label.replace(/ \(MB\)/, ' MB').toLowerCase()}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
          {plans.length === 0 && (
            <div className="col-span-full py-12 text-center text-gray-400">No plans configured</div>
          )}
        </div>
      )}
    </div>
  );
}
