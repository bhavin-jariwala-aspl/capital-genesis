import { create } from 'zustand';
import { persist } from 'zustand/middleware';

function applyTheme(isDark) {
  if (typeof document === 'undefined') return;
  document.documentElement.classList.toggle('dark', isDark);
}

const systemDark = () =>
  typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-color-scheme: dark)').matches;

/**
 * Per-user presentation preferences — the "Personalize" panel in the header.
 *
 *   mode      'light' | 'dark' | 'system' | null   (null = follow the organisation)
 *   density   'compact' | 'comfortable' | 'spacious' | null (null = organisation default)
 *   motion    'full' | 'subtle' | 'reduced' | null
 *
 * `userChose` records that this browser's user picked a mode themselves; the
 * appearance store then leaves it alone (when the tenant allows a toggle)
 * instead of re-applying the tenant default on every login. Density and motion
 * overrides are applied by the appearance store on top of the tenant values,
 * and only when the organisation allows them.
 */
export const useThemeStore = create(
  persist(
    (set, get) => ({
      isDark: false,
      userChose: false,
      mode: null,
      density: null,
      motion: null,

      toggleTheme: () => {
        const next = !get().isDark;
        set({ isDark: next, userChose: true, mode: next ? 'dark' : 'light' });
        applyTheme(next);
      },

      /** Programmatic set; `user: false` means "tenant default", not a user choice. */
      setDark: (isDark, { user = true } = {}) => {
        set(user ? { isDark, userChose: true, mode: isDark ? 'dark' : 'light' } : { isDark });
        applyTheme(isDark);
      },

      /** The Personalize panel: light / dark / follow device / follow organisation (null). */
      setMode: (mode) => {
        if (!mode) { set({ mode: null, userChose: false }); return; }
        const isDark = mode === 'system' ? systemDark() : mode === 'dark';
        set({ mode, isDark, userChose: true });
        applyTheme(isDark);
      },

      setDensity: (density) => set({ density: density || null }),
      setMotion:  (motion)  => set({ motion: motion || null }),

      /** Re-evaluate "system" when the OS switches. Returns an unsubscribe. */
      watchSystem: () => {
        if (typeof window === 'undefined' || !window.matchMedia) return () => {};
        const mq = window.matchMedia('(prefers-color-scheme: dark)');
        const onChange = () => { if (get().mode === 'system') get().setMode('system'); };
        mq.addEventListener?.('change', onChange);
        return () => mq.removeEventListener?.('change', onChange);
      },

      initTheme: () => {
        if (get().mode === 'system') { const d = systemDark(); set({ isDark: d }); applyTheme(d); return; }
        applyTheme(get().isDark);
      },
    }),
    {
      name: 'genesis-theme',
      getStorage: () => localStorage,
      onRehydrateStorage: () => (state) => {
        if (state) applyTheme(state.isDark);
      },
    }
  )
);
