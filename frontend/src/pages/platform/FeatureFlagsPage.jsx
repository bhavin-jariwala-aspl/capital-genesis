import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { platformService } from '../../services/platform.service';
import { Flag, Info, Plus, ToggleLeft, ToggleRight, Trash2, Percent, TriangleAlert } from 'lucide-react';
import PageHeader from '../../components/ui/PageHeader';
import { showError, confirmDialog } from '../../utils/dialog';

const CATEGORY_BADGE = {
  general:      'bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-400',
  premium:      'bg-purple-100 text-purple-700 dark:bg-purple-500/20 dark:text-purple-400',
  beta:         'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-400',
  experimental: 'bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-400',
};

/**
 * A flag is a *rollout* control, not a price-book control.
 *
 * The page used to present flags as the whole story, which they were not: the
 * `premium` category implied "gated behind paid plans" while nothing consulted
 * the plan at all. Each card now says which catalogue feature it controls and
 * from which tier that feature is sold, and a flag whose name matches no
 * catalogue feature is labelled as controlling nothing sellable — because a
 * switch that gates nothing is worse than no switch.
 */
function FeatureLink({ feature }) {
  if (!feature) {
    return (
      <span
        className="mt-2 inline-flex items-start gap-1.5 rounded-lg bg-amber-50 px-2 py-1 text-[11px] text-amber-800 dark:bg-amber-500/10 dark:text-amber-200"
        title="This flag's name is not a feature in the catalogue, so no plan sells it and no route gates on it through entitlements."
      >
        <TriangleAlert className="mt-px h-3 w-3 shrink-0" />
        Not a catalogue feature - gates nothing sellable
      </span>
    );
  }
  return (
    <span className="mt-2 inline-flex flex-wrap items-center gap-1.5 text-[11px]">
      <span className="rounded-lg bg-primary-50 px-2 py-1 text-primary-800 dark:bg-primary-500/10 dark:text-primary-200">
        Controls <strong>{feature.label}</strong>
      </span>
      <span className="rounded-lg bg-gray-100 px-2 py-1 capitalize text-gray-600 dark:bg-white/5 dark:text-gray-300">
        sold from {feature.min_plan}
      </span>
    </span>
  );
}

export default function FeatureFlagsPage() {
  const qc = useQueryClient();
  const [category, setCategory] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ name: '', label: '', description: '', category: 'general', is_enabled: false, rollout_percent: 0 });
  const [editRollout, setEditRollout] = useState(null);
  const [rolloutValue, setRolloutValue] = useState(0);

  const { data } = useQuery({
    queryKey: ['platform-flags', category],
    queryFn: () => platformService.listFeatureFlags({ category: category || undefined }),
    staleTime: 30_000,
  });

  const flags = data?.data || [];

  const onErr = (e) => showError(e?.response?.data?.error?.message || e?.message || 'Operation failed');
  const invalidate = () => qc.invalidateQueries({ queryKey: ['platform-flags'] });
  const createMut = useMutation({ mutationFn: (d) => platformService.createFeatureFlag(d), onSuccess: () => { invalidate(); setShowCreate(false); setForm({ name: '', label: '', description: '', category: 'general', is_enabled: false, rollout_percent: 0 }); }, onError: onErr });
  const toggleMut = useMutation({ mutationFn: ({ id, enabled }) => platformService.toggleFeatureFlag(id, { enabled }), onSuccess: invalidate, onError: onErr });
  const rolloutMut = useMutation({ mutationFn: ({ id, percent }) => platformService.setFlagRollout(id, { percent }), onSuccess: () => { invalidate(); setEditRollout(null); }, onError: onErr });
  const deleteMut = useMutation({ mutationFn: (id) => platformService.deleteFeatureFlag(id), onSuccess: invalidate, onError: onErr });

  return (
    <div className="p-6 space-y-6 max-w-[1400px] mx-auto">
      <PageHeader
        icon={Flag}
        eyebrow="Platform"
        title="Feature Flags"
        subtitle="Gradual rollout and remote kill-switches. What a customer has bought is set on the plan."
        className="!mb-0"
        actions={(
          <button onClick={() => setShowCreate(true)} className="shrink-0 flex items-center gap-2 px-4 py-2 bg-primary-600 text-on-primary rounded-lg hover:bg-primary-700 text-sm font-medium whitespace-nowrap">
            <Plus className="h-4 w-4" /> New Flag
          </button>
        )}
      />

      <p className="flex items-start gap-2 rounded-xl bg-primary-50/60 p-3 text-xs text-primary-900 dark:bg-primary-500/10 dark:text-primary-200">
        <Info className="mt-0.5 h-4 w-4 shrink-0" />
        <span>
          A flag can only <strong>withhold</strong> a feature a tenant&rsquo;s plan already includes &mdash; it
          can never grant one that was not sold, so switching a flag on platform-wide cannot hand paid
          functionality to a free tenant. Set what a tier sells on <strong>Plans</strong>; make a
          per-customer exception under <strong>Features</strong> on a tenant row.
        </span>
      </p>

      {/* Category filter */}
      <div className="flex gap-2">
        {['', 'general', 'premium', 'beta', 'experimental'].map(c => (
          <button key={c} onClick={() => setCategory(c)}
            className={`px-3 py-1.5 text-xs font-medium rounded-full transition ${category === c ? 'bg-primary-600 text-on-primary' : 'bg-gray-100 dark:bg-white/5 text-gray-600 dark:text-white/50 hover:bg-gray-200 dark:hover:bg-white/10'}`}>
            {c || 'All'}
          </button>
        ))}
      </div>

      {/* Create Modal */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-gray-950/45 dark:bg-black/70 backdrop-blur-md animate-fade-in motion-reduce:animate-none" onClick={() => setShowCreate(false)}>
          <div className="relative w-full max-w-md bg-white dark:bg-night-2 border border-gray-200/70 dark:border-white/[0.08] rounded-t-3xl sm:rounded-3xl p-6 shadow-elevated animate-slide-up motion-reduce:animate-none" onClick={e => e.stopPropagation()}>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Create Feature Flag</h2>
            <div className="space-y-3">
              <input placeholder="Flag name (snake_case)" value={form.name} onChange={e => setForm({ ...form, name: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '') })}
                className="w-full px-3 py-2 border border-gray-200 dark:border-white/10 rounded-lg bg-white dark:bg-white/5 text-sm text-gray-900 dark:text-white" />
              <input placeholder="Display Label" value={form.label} onChange={e => setForm({ ...form, label: e.target.value })}
                className="w-full px-3 py-2 border border-gray-200 dark:border-white/10 rounded-lg bg-white dark:bg-white/5 text-sm text-gray-900 dark:text-white" />
              <textarea placeholder="Description" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} rows={2}
                className="w-full px-3 py-2 border border-gray-200 dark:border-white/10 rounded-lg bg-white dark:bg-white/5 text-sm text-gray-900 dark:text-white" />
              <select value={form.category} onChange={e => setForm({ ...form, category: e.target.value })}
                className="w-full px-3 py-2 border border-gray-200 dark:border-white/10 rounded-lg bg-white dark:bg-white/5 text-sm text-gray-900 dark:text-white">
                <option value="general">General</option><option value="premium">Premium</option>
                <option value="beta">Beta</option><option value="experimental">Experimental</option>
              </select>
            </div>
            <div className="flex justify-end gap-2 mt-5">
              <button onClick={() => setShowCreate(false)} className="px-4 py-2 text-sm text-gray-600 dark:text-white/60 hover:bg-gray-100 dark:hover:bg-white/5 rounded-lg">Cancel</button>
              <button onClick={() => createMut.mutate(form)} disabled={!form.name || !form.label || createMut.isPending} className="px-4 py-2 text-sm bg-primary-600 text-on-primary rounded-lg hover:bg-primary-700 disabled:opacity-50">{createMut.isPending ? 'Creating...' : 'Create'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Flags Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {flags.map(flag => (
          <div key={flag.id} className="bg-white dark:bg-white/[0.04] border border-gray-200 dark:border-white/[0.06] rounded-xl p-5">
            <div className="flex items-start justify-between">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <Flag className="h-4 w-4 text-primary-400 shrink-0" />
                  <h3 className="text-sm font-semibold text-gray-900 dark:text-white truncate">{flag.label}</h3>
                </div>
                <p className="text-xs text-gray-500 dark:text-white/40 mt-0.5 font-mono">{flag.name}</p>
                {flag.description && <p className="text-xs text-gray-500 dark:text-white/50 mt-2 line-clamp-2">{flag.description}</p>}
                <FeatureLink feature={flag.feature} />
              </div>
              <button onClick={() => toggleMut.mutate({ id: flag.id, enabled: !flag.is_enabled })} title={flag.is_enabled ? 'Disable' : 'Enable'}>
                {flag.is_enabled
                  ? <ToggleRight className="h-7 w-7 text-green-500" />
                  : <ToggleLeft className="h-7 w-7 text-gray-300 dark:text-white/20" />}
              </button>
            </div>

            <div className="mt-4 flex items-center gap-2">
              <span className={`text-xs font-medium px-2 py-0.5 rounded-full capitalize ${CATEGORY_BADGE[flag.category] || CATEGORY_BADGE.general}`}>{flag.category}</span>
              {flag._count?.tenant_overrides > 0 && (
                <span className="text-xs text-gray-400 dark:text-white/30">{flag._count.tenant_overrides} override(s)</span>
              )}
            </div>

            <div className="mt-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Percent className="h-3.5 w-3.5 text-gray-400" />
                {editRollout === flag.id ? (
                  <div className="flex items-center gap-1">
                    <input type="number" min={0} max={100} value={rolloutValue} onChange={e => setRolloutValue(Number(e.target.value))}
                      className="w-16 px-2 py-0.5 text-xs border border-gray-200 dark:border-white/10 rounded bg-white dark:bg-white/5 text-gray-900 dark:text-white" />
                    <button onClick={() => rolloutMut.mutate({ id: flag.id, percent: rolloutValue })} className="text-xs text-primary-600 font-medium">Save</button>
                    <button onClick={() => setEditRollout(null)} className="text-xs text-gray-400">Cancel</button>
                  </div>
                ) : (
                  <button onClick={() => { setEditRollout(flag.id); setRolloutValue(flag.rollout_percent); }} className="text-xs text-gray-600 dark:text-white/50 hover:text-primary-600">
                    {flag.rollout_percent}% rollout
                  </button>
                )}
              </div>
              <button onClick={async () => { if (await confirmDialog({ title: 'Delete feature flag', message: `“${flag.name}” will be removed and every tenant falls back to the default behaviour.`, confirmLabel: 'Delete' })) deleteMut.mutate(flag.id); }} className="p-1 rounded hover:bg-red-100 dark:hover:bg-red-500/20 text-red-400">
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        ))}
        {flags.length === 0 && (
          <div className="col-span-full text-center py-12 text-gray-400">No feature flags found</div>
        )}
      </div>
    </div>
  );
}
