import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowUpRight, Ban, Check, CircleSlash, Info, Loader2, Lock,
  RotateCcw, Search, Sparkles, TriangleAlert,
} from 'lucide-react';
import Modal from '../../components/ui/Modal';
import Button from '../../components/ui/Button';
import Badge from '../../components/ui/Badge';
import { platformService } from '../../services/platform.service';
import { showError } from '../../utils/dialog';

/**
 * A tenant's feature entitlements.
 *
 * ── What this replaces ──────────────────────────────────────────────────────
 * Nothing, which was the problem. Per-tenant feature control existed only as an
 * undocumented API call (`POST /feature-flags/:id/tenant-override`) that took a
 * numeric flag id — so granting a customer a feature meant looking up an id by
 * hand and posting JSON. The console showed a global flag list with no notion
 * of who had what, and `subscription_plans.features` was free text nothing read.
 *
 * ── Why it is built as a three-state control ─────────────────────────────────
 * A plain on/off switch cannot express this domain. Three things decide whether
 * a tenant has a feature, and an operator needs to see and set them separately:
 *
 *   Plan default  — what the tenant bought. Changing it means changing the plan.
 *   Granted       — an explicit exception above the plan (a pilot, a goodwill
 *                   grant during a trial).
 *   Revoked       — an explicit exception below it (abuse, a support hold).
 *
 * So each row offers exactly those three, with the plan default always visible
 * as the fallback. "Inherit" is what makes an exception undoable — with a
 * two-state switch, the first click creates an override that can never be
 * removed, and the tenant silently stops tracking its own plan forever.
 *
 * Every row states *why* it resolved the way it did, because "why can this
 * customer not see quoting?" is the question that actually gets asked, and it
 * has four different answers (not sold / switched off / outside a rollout
 * cohort / explicitly revoked) that a coloured dot cannot distinguish.
 */

/** Visual treatment per resolution source, keyed to `EntitlementService.SOURCE`. */
const SOURCE_META = {
  core:            { label: 'Core',     variant: 'default', icon: Lock },
  tenant_override: { label: 'Override', variant: 'purple',  icon: Sparkles },
  flag_rollout:    { label: 'Rollout',  variant: 'warning', icon: TriangleAlert },
  flag_disabled:   { label: 'Off',      variant: 'danger',  icon: CircleSlash },
  plan:            { label: 'In plan',  variant: 'success', icon: Check },
  plan_excluded:   { label: 'Upgrade',  variant: 'info',    icon: ArrowUpRight },
};

/** The three states a row can be put into. `null` means "follow the plan". */
const CHOICES = [
  { value: null,  label: 'Plan default', hint: 'Follow whatever the plan includes' },
  { value: true,  label: 'Granted',      hint: 'On for this workspace, even if the plan excludes it' },
  { value: false, label: 'Revoked',      hint: 'Off for this workspace, even if the plan includes it' },
];

/**
 * A segmented three-way control.
 *
 * Deliberately not a switch: a switch has two positions and this has three, and
 * the third ("stop overriding") is the one an operator most needs and would
 * otherwise have no way to reach.
 */
function OverrideControl({ value, disabled, pending, onChange }) {
  return (
    <div
      role="radiogroup"
      aria-label="Entitlement"
      className="inline-flex shrink-0 rounded-lg border border-gray-200 bg-gray-50 p-0.5 dark:border-white/10 dark:bg-white/5"
    >
      {CHOICES.map((choice) => {
        const selected = value === choice.value;
        return (
          <button
            key={String(choice.value)}
            type="button"
            role="radio"
            aria-checked={selected}
            disabled={disabled || pending}
            title={disabled ? 'Part of the core product — always on' : choice.hint}
            onClick={() => !selected && onChange(choice.value)}
            className={[
              'relative rounded-md px-2 py-1 text-[11px] font-medium transition-colors',
              'disabled:cursor-not-allowed disabled:opacity-50',
              selected
                ? choice.value === true
                  ? 'bg-purple-600 text-white shadow-sm'
                  : choice.value === false
                    ? 'bg-red-600 text-white shadow-sm'
                    : 'bg-white text-gray-800 shadow-sm dark:bg-white/15 dark:text-white'
                : 'text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-white',
            ].join(' ')}
          >
            {pending && selected ? <Loader2 className="h-3 w-3 animate-spin" /> : choice.label}
          </button>
        );
      })}
    </div>
  );
}

/** One feature row: what it is, how it resolved, why, and the control. */
function FeatureRow({ feature, tenantPlan, pending, onChange }) {
  const state = feature.state ?? {};
  const meta = SOURCE_META[state.source] ?? SOURCE_META.plan;
  const Icon = meta.icon;
  const isCore = Boolean(feature.core);

  return (
    <li className="flex flex-wrap items-start gap-3 px-3 py-2.5 hover:bg-gray-50/70 dark:hover:bg-white/[0.02]">
      <span
        className={[
          'mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full',
          state.enabled
            ? 'bg-emerald-100 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-400'
            : 'bg-gray-100 text-gray-400 dark:bg-white/10 dark:text-gray-500',
        ].join(' ')}
        title={state.enabled ? 'Enabled' : 'Not available'}
      >
        {state.enabled ? <Check className="h-3 w-3" /> : <Ban className="h-3 w-3" />}
      </span>

      <div className="min-w-[12rem] flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-sm font-medium text-gray-900 dark:text-white">{feature.label}</span>
          <Badge variant={meta.variant} className="gap-1">
            <Icon className="h-2.5 w-2.5" />
            {meta.label}
          </Badge>
          {!isCore && feature.min_plan !== tenantPlan && !state.in_plan && (
            <Badge variant="default" className="capitalize">needs {feature.min_plan}</Badge>
          )}
        </div>
        <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">{feature.description}</p>
        {state.reason && (
          <p className="mt-0.5 text-[11px] text-gray-400 dark:text-gray-500">{state.reason}</p>
        )}
      </div>

      <OverrideControl
        value={state.override ?? null}
        disabled={isCore}
        pending={pending}
        onChange={(next) => onChange(feature.key, next)}
      />
    </li>
  );
}

/**
 * The Features panel for one tenant.
 *
 * @param {{ tenant: {id: number, name: string}|null, onClose: () => void }} props
 */
export default function TenantFeaturesPanel({ tenant, onClose }) {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [onlyDifferences, setOnlyDifferences] = useState(false);
  const [pendingKey, setPendingKey] = useState(null);

  const { data, isLoading } = useQuery({
    queryKey: ['platform-tenant-features', tenant?.id],
    queryFn: () => platformService.getTenantFeatures(tenant.id),
    enabled: Boolean(tenant?.id),
    staleTime: 15_000,
  });

  const matrix = data?.data;

  const setFeature = useMutation({
    mutationFn: ({ key, enabled }) => platformService.setTenantFeature(tenant.id, key, enabled),
    onMutate: ({ key }) => setPendingKey(key),
    onSettled: () => setPendingKey(null),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['platform-tenant-features', tenant.id] });
      // A feature change can change what the workspace can do, which the
      // readiness checklist and tenant row also report on.
      qc.invalidateQueries({ queryKey: ['platform-tenant-readiness'] });
    },
    onError: (e) => showError(e?.response?.data?.error?.message || e?.message || 'Could not change the feature'),
  });

  const groups = useMemo(() => {
    const raw = matrix?.groups ?? [];
    const q = search.trim().toLowerCase();
    return raw
      .map((g) => ({
        ...g,
        features: g.features.filter((f) => {
          if (onlyDifferences && (f.state?.override ?? null) === null) return false;
          if (!q) return true;
          return `${f.label} ${f.key} ${f.description}`.toLowerCase().includes(q);
        }),
      }))
      .filter((g) => g.features.length > 0);
  }, [matrix, search, onlyDifferences]);

  const summary = matrix?.summary;

  return (
    <Modal
      open={Boolean(tenant)}
      onClose={onClose}
      size="xl"
      icon={Sparkles}
      eyebrow="Entitlements"
      title={`${tenant?.name ?? ''} — features`}
      subtitle={matrix
        ? `On the ${matrix.plan.label} plan. The plan decides what is included; an override is a deliberate exception.`
        : 'Loading…'}
      footer={(
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-gray-500 dark:text-gray-400">
            {summary
              ? `${summary.enabled} of ${summary.total} enabled · ${summary.in_plan} in plan · ${summary.granted} granted · ${summary.revoked} revoked`
              : ''}
          </p>
          <Button variant="ghost" onClick={onClose}>Close</Button>
        </div>
      )}
    >
      {isLoading && (
        <p className="flex items-center justify-center gap-2 py-10 text-sm text-gray-400">
          <Loader2 className="h-4 w-4 animate-spin" /> Resolving entitlements…
        </p>
      )}

      {matrix && (
        <div className="space-y-4">
          {/* How to read this */}
          <div className="flex items-start gap-2 rounded-xl bg-primary-50/60 p-3 text-xs text-primary-900 dark:bg-primary-500/10 dark:text-primary-200">
            <Info className="mt-0.5 h-4 w-4 shrink-0" />
            <p>
              <strong>Plan default</strong> follows the {matrix.plan.label} plan — change it for every
              tenant at once on the Plans page. <strong>Granted</strong> and <strong>Revoked</strong> are
              per-workspace exceptions that override the plan in either direction, for pilots and support
              holds. Core features cannot be switched off.
            </p>
          </div>

          {/* Filters */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-[200px] flex-1">
              <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
              <input
                type="text" placeholder="Search features…" value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full rounded-lg border border-gray-200 bg-white py-1.5 pl-8 pr-3 text-xs text-gray-900 placeholder-gray-400 dark:border-white/10 dark:bg-white/5 dark:text-white"
              />
            </div>
            <button
              type="button"
              onClick={() => setOnlyDifferences((v) => !v)}
              aria-pressed={onlyDifferences}
              className={[
                'flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors',
                onlyDifferences
                  ? 'bg-purple-600 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-white/5 dark:text-gray-300 dark:hover:bg-white/10',
              ].join(' ')}
            >
              <RotateCcw className="h-3 w-3" />
              Exceptions only
              {summary ? ` (${summary.granted + summary.revoked})` : ''}
            </button>
          </div>

          {/* Feature groups */}
          {groups.map((group) => (
            <section key={group.key} className="overflow-hidden rounded-xl border border-gray-200 dark:border-white/10">
              <header className="border-b border-gray-200 bg-gray-50/70 px-3 py-2 dark:border-white/10 dark:bg-white/[0.03]">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-600 dark:text-gray-300">
                  {group.label}
                </h3>
                <p className="text-[11px] text-gray-400 dark:text-gray-500">{group.description}</p>
              </header>
              <ul className="divide-y divide-gray-100 dark:divide-white/[0.06]">
                {group.features.map((feature) => (
                  <FeatureRow
                    key={feature.key}
                    feature={feature}
                    tenantPlan={matrix.plan.name}
                    pending={pendingKey === feature.key}
                    onChange={(key, enabled) => setFeature.mutate({ key, enabled })}
                  />
                ))}
              </ul>
            </section>
          ))}

          {groups.length === 0 && (
            <p className="py-8 text-center text-sm text-gray-400">
              {onlyDifferences ? 'No per-workspace exceptions — everything follows the plan.' : 'No features match.'}
            </p>
          )}
        </div>
      )}
    </Modal>
  );
}
