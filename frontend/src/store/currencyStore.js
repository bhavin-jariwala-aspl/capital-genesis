import { useMemo } from 'react';
import { create } from 'zustand';
import { getCurrency, DEFAULT_CURRENCY } from '../utils/currency';
import { settingsService } from '../services/settings.service';

/**
 * currencyStore — the tenant's active display currency.
 *
 * Sourced from BUILDER > Settings > Localization (`localization.currency`,
 * `localization.locale`, `localization.number_format`). Loaded once at app
 * start by `App.jsx`, and pushed again by the settings page the moment an
 * admin saves, so the whole UI reformats without a reload.
 *
 * Read it two ways:
 *   - `useCurrencyStore(s => s.code)` in a component — re-renders on change.
 *   - `useCurrencyStore.getState()` from a plain function — this is what
 *     `utils/formatters.js` does, which is why `fmtCurrency(n)` stays a simple
 *     synchronous call at ~40 existing call sites.
 *
 * NOTE: this is a *display* currency, not a transaction currency. Amounts are
 * stored as entered and never converted. See docs/developer-guide/engines/currency.md.
 */

/** Shape the three raw setting values into the state the formatters need. */
function resolve(values = {}) {
  const cur = getCurrency(values['localization.currency'] ?? DEFAULT_CURRENCY);
  return {
    code:         cur.code,
    symbol:       cur.symbol,
    name:         cur.name,
    decimals:     cur.decimals,
    locale:       values['localization.locale'] || 'en-US',
    numberFormat: values['localization.number_format'] || '1,234.56',
  };
}

const INITIAL = resolve();

export const useCurrencyStore = create((set, get) => ({
  ...INITIAL,
  loaded: false,

  /**
   * Formatting options for `utils/currency.js#formatCurrency`.
   * Kept as a getter rather than stored state so there is exactly one place
   * that decides what a "current currency" means.
   */
  options: () => {
    const { code, locale, numberFormat } = get();
    return { code, locale, numberFormat };
  },

  /** Apply a settings payload (the flat "group.key" map). */
  applySettings: (values) => set({ ...resolve(values), loaded: true }),

  /** Set the currency directly — used by tests and by preview surfaces. */
  setCurrency: (code) => set({ ...getCurrency(code) }),

  /**
   * Fetch the tenant's localization settings and apply them.
   * Never rejects: on failure the store keeps the USD defaults so the UI still
   * renders amounts rather than blanking them out.
   */
  initCurrency: async ({ attempts = 3, waitMs = 2000 } = {}) => {
    // A busy or restarting server must not leave every amount in USD for the
    // whole session: retry a few times before settling on the defaults.
    for (let i = 1; i <= attempts; i += 1) {
      try {
        const res = await settingsService.getEffective();
        get().applySettings(res?.data ?? res ?? {});
        return;
      } catch {
        if (i < attempts) await new Promise((r) => setTimeout(r, waitMs * i));
      }
    }
    set({ loaded: true });
  },
}));

/**
 * The active currency, for components that should re-render when it changes.
 *
 * Selects primitives and memoises the object: a selector that built a fresh
 * object each call would give useSyncExternalStore a new snapshot every render.
 *
 * @returns {{code:string,symbol:string,name:string,decimals:number,locale:string,numberFormat:string}}
 */
export function useCurrency() {
  const code         = useCurrencyStore((s) => s.code);
  const symbol       = useCurrencyStore((s) => s.symbol);
  const name         = useCurrencyStore((s) => s.name);
  const decimals     = useCurrencyStore((s) => s.decimals);
  const locale       = useCurrencyStore((s) => s.locale);
  const numberFormat = useCurrencyStore((s) => s.numberFormat);
  return useMemo(
    () => ({ code, symbol, name, decimals, locale, numberFormat }),
    [code, symbol, name, decimals, locale, numberFormat],
  );
}

/** Active formatting options, readable from non-React code. */
export const currencyOptions = () => useCurrencyStore.getState().options();
