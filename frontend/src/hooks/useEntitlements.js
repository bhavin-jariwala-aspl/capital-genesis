import { useCallback, useMemo } from 'react';
import { useMetadataStore } from '../store/metadataStore';
import { useAuthStore } from '../store/authStore';

/**
 * What this workspace's plan lets it use.
 *
 * ── Why the client needs this at all ────────────────────────────────────────
 * The server is the authority — every gated route checks the plan — but a
 * product that shows you a Forecasting page and then refuses it is worse than one
 * that never showed it. Entitlements arrive with the bootstrap payload, so
 * every screen has them from the first render with no extra round-trip, and
 * the sidebar, the route guards and the feature-locked pages all read from one
 * place.
 *
 * ── Fail-open on the client, fail-closed on the server ──────────────────────
 * Until bootstrap has run (or if it failed) there is no list, and this hook
 * reports every feature as available. Hiding half the product because a
 * metadata sync is slow would be a worse experience than a 403 the server
 * will produce anyway. The server never fails open.
 *
 * Platform admins have no tenant and therefore no plan; they see everything.
 */
export function useEntitlements() {
  const entitlements = useMetadataStore((s) => s.entitlements);
  const isPlatformAdmin = useAuthStore((s) => s.isPlatformAdmin);

  const loaded = Boolean(entitlements?.features);
  const set = useMemo(() => new Set(entitlements?.features ?? []), [entitlements]);
  const bypass = !loaded || isPlatformAdmin();

  /** Is `featureKey` available? Unknown/absent lists are treated as available. */
  const has = useCallback((featureKey) => {
    if (!featureKey || bypass) return true;
    return set.has(featureKey);
  }, [bypass, set]);

  /** Why a feature is locked, when the server said. */
  const reasonFor = useCallback((featureKey) => entitlements?.locked?.[featureKey] ?? null, [entitlements]);

  return { loaded, plan: entitlements?.plan ?? null, has, reasonFor, features: set };
}
