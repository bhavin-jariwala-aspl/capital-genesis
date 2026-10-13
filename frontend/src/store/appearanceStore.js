import { create } from 'zustand';
import { settingsService } from '../services/settings.service';
import {
  applyAppearance, resolveAppearance, APPEARANCE_DEFAULTS, chartSeries, applyDocumentChrome,
  saveBrandingSnapshot, readBrandingSnapshot, clearAppearance, DENSITY_FONT_SIZE,
} from '../utils/appearance';
import { useThemeStore } from './themeStore';
import { useAuthStore } from './authStore';

/**
 * Appearance store — the tenant's live look-and-feel.
 *
 *   load()          fetch effective settings after login and apply them
 *   preview(patch)  apply an unsaved patch (the Appearance Studio's live preview)
 *   commit(values)  apply saved values (after PUT /settings)
 *   reset()         drop the preview, re-apply the last saved values
 *
 * Dark mode: the tenant's default `appearance.mode` wins the first time a user
 * signs in on a device; after that the user's own choice (persisted by
 * themeStore) is respected — unless the admin disabled the toggle, in which
 * case the tenant mode always applies. The same shape applies to the user's
 * density and motion overrides via `allow_user_density`.
 */
export const useAppearanceStore = create((set, get) => ({
  saved:   resolveAppearance({}),
  current: resolveAppearance({}),
  loaded:  false,
  previewing: false,
  /** Set while signed out: the remembered workspace whose brand the sign-in page wears. */
  preLogin: null,

  /**
   * Signed out: wear the last remembered workspace brand (so the sign-in page
   * shows the client's logo and colours), then refresh it from the public
   * branding endpoint in case an admin changed it since. Falls back to the
   * product defaults when nothing is remembered.
   */
  async applyPreLoginBranding() {
    const snap = readBrandingSnapshot();
    if (!snap) {
      clearAppearance();
      set({ preLogin: null, current: resolveAppearance({}), saved: resolveAppearance({}) });
      applyDocumentChrome(resolveAppearance({}));
      return null;
    }
    const resolved = applyAppearance(snap.values);
    set({ preLogin: { tenant_id: snap.tenant_id }, current: resolved, saved: resolved });
    get().applyMode(resolved);
    applyDocumentChrome(resolved);
    if (snap.tenant_id) {
      try {
        const res = await settingsService.getPublicBranding(snap.tenant_id);
        const fresh = res?.data ?? res;
        if (fresh && typeof fresh === 'object') {
          const next = applyAppearance({ ...snap.values, ...fresh });
          set({ current: next, saved: next });
          applyDocumentChrome(next);
          saveBrandingSnapshot(next, snap.tenant_id);
        }
      } catch { /* offline or workspace gone — keep the remembered brand */ }
    }
    return get().current;
  },

  async load() {
    try {
      const res = await settingsService.getEffective();
      const values = res?.data ?? res ?? {};
      get().commit(values);
    } catch {
      // Keep defaults — the app must render even if settings are unreachable.
      applyAppearance(APPEARANCE_DEFAULTS);
      get().applyUserPrefs(resolveAppearance({}));
    } finally {
      set({ loaded: true });
    }
  },

  commit(values) {
    const resolved = applyAppearance(values);
    set({ saved: resolved, current: resolved, previewing: false });
    get().applyMode(resolved);
    get().applyUserPrefs(resolved);
    applyDocumentChrome(resolved);
    // Remember the brand so the sign-in page wears it before the next login.
    saveBrandingSnapshot(resolved, useAuthStore.getState().employee?.tenant_id ?? null);
  },

  preview(patch) {
    const merged = { ...get().saved, ...patch };
    const resolved = applyAppearance(merged);
    set({ current: resolved, previewing: true });
    if (patch['appearance.mode'] !== undefined) get().applyMode(resolved, { force: true });
    // While previewing, show exactly what the admin configured (no personal overrides).
    applyDocumentChrome(resolved);
  },

  reset() {
    const resolved = applyAppearance(get().saved);
    set({ current: resolved, previewing: false });
    get().applyMode(resolved);
    get().applyUserPrefs(resolved);
    applyDocumentChrome(resolved);
  },

  /** Decide light/dark from the tenant default and the user's own choice. */
  applyMode(appearance, { force = false } = {}) {
    const theme = useThemeStore.getState();
    const mode = appearance['appearance.mode'];
    const allowToggle = appearance['appearance.allow_user_mode_toggle'] !== false;
    const systemDark = typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-color-scheme: dark)').matches;
    const tenantDark = mode === 'dark' || (mode === 'system' && systemDark);
    if (force || !allowToggle || !theme.userChose) {
      theme.setDark(tenantDark, { user: false });
    } else if (theme.mode === 'system') {
      theme.setDark(systemDark, { user: false });
    }
  },

  /** Layer the user's density / motion preferences over the tenant values where allowed. */
  applyUserPrefs(appearance = get().current) {
    if (typeof document === 'undefined') return;
    const theme = useThemeStore.getState();
    const el = document.documentElement;
    if (appearance['appearance.allow_user_density'] !== false && theme.density && DENSITY_FONT_SIZE[theme.density]) {
      el.style.setProperty('--base-font-size', DENSITY_FONT_SIZE[theme.density]);
      el.dataset.density = theme.density;
    }
    if (theme.motion && ['full', 'subtle', 'reduced'].includes(theme.motion)) {
      el.dataset.motion = theme.motion;
    }
  },

  /** Series colours for charts under the current appearance. */
  chartSeries(isDark) {
    return chartSeries(get().current, isDark);
  },
}));

// Re-apply personal overrides whenever the user changes them in the Personalize panel.
useThemeStore.subscribe((s, prev) => {
  if (s.density !== prev.density || s.motion !== prev.motion) {
    const store = useAppearanceStore.getState();
    if (!store.previewing) { applyAppearance(store.current); store.applyUserPrefs(store.current); }
  }
});
