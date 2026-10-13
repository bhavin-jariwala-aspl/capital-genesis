import { Link, Outlet, useLocation } from 'react-router-dom';
import { ArrowUpRight, Lock, Sparkles } from 'lucide-react';
import { useEntitlements } from '../../hooks/useEntitlements';
import { useAuthStore } from '../../store/authStore';
import { FEATURE_LABEL, featureForPath } from '../../utils/featureMap';

/**
 * The page a user lands on when their plan does not include a feature.
 *
 * ── Why a page and not a redirect ───────────────────────────────────────────
 * A redirect to home teaches nothing: the user typed or clicked a link, and
 * silently ending up elsewhere reads as a bug. This says what the feature is,
 * that it exists, which plan sells it, and — for an admin — where to go about
 * it. That turns a dead end into the one moment a plan upgrade is actually
 * relevant, which is how every mature SaaS product handles a locked feature.
 *
 * It is deliberately calm. No countdown, no modal, no "unlock now" button in
 * red. A person who hit this by accident should be able to go back in one
 * click and not feel sold to.
 */
export function LockedFeature({ featureKey }) {
  const { reasonFor, plan } = useEntitlements();
  const isAdmin = useAuthStore((s) => s.isAdmin)();
  const info = reasonFor(featureKey);
  const label = FEATURE_LABEL[featureKey] ?? featureKey;

  return (
    <div className="mx-auto flex max-w-lg flex-col items-center px-6 py-20 text-center">
      <span className="mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary-50 text-primary-500 dark:bg-primary-500/15 dark:text-primary-300">
        <Lock className="h-6 w-6" />
      </span>
      <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-white/40">
        Not in your plan
      </p>
      <h1 className="mt-1 text-xl font-semibold text-gray-900 dark:text-white">{label}</h1>
      <p className="mt-3 text-sm leading-relaxed text-gray-600 dark:text-gray-300">
        {info?.reason
          ? info.reason
          : `${label} is not included in the ${plan ?? 'current'} plan for this workspace.`}
      </p>

      <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
        <Link
          to="/"
          className="rounded-xl border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-white/15 dark:text-gray-200 dark:hover:bg-white/5"
        >
          Back to dashboard
        </Link>
        {isAdmin && (
          <a
            href="mailto:?subject=Genesis%20CRM%20plan%20upgrade"
            className="inline-flex items-center gap-1.5 rounded-xl bg-primary-600 px-4 py-2 text-sm font-medium text-on-primary hover:bg-primary-700"
          >
            <Sparkles className="h-4 w-4" /> Ask about upgrading <ArrowUpRight className="h-3.5 w-3.5" />
          </a>
        )}
      </div>

      {isAdmin && (
        <p className="mt-6 max-w-sm text-xs text-gray-400 dark:text-white/30">
          Your platform administrator can change the workspace plan, or grant this feature on its own
          for a pilot, from Platform ▸ Tenants ▸ Features.
        </p>
      )}
    </div>
  );
}

/**
 * Route guard: renders the child routes when the plan allows the feature,
 * otherwise the locked-feature page.
 *
 * With no `feature` prop it infers one from the path via `featureForPath`, so
 * a single `<FeatureGate />` element can wrap a whole block of routes and each
 * child is gated on its own feature. The server still enforces every gate;
 * this only stops the product showing something it will then refuse.
 */
export default function FeatureGate({ feature }) {
  const { pathname } = useLocation();
  const { has } = useEntitlements();
  const key = feature ?? featureForPath(pathname);
  if (key && !has(key)) return <LockedFeature featureKey={key} />;
  return <Outlet />;
}
