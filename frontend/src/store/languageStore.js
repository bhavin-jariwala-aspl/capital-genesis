import { create } from 'zustand';

/**
 * languageStore — the language a user reads the CRM in (PRD X-02 / E-15).
 *
 * Builder metadata can carry French labels (`config.label_fr` on modules,
 * objects, fields, pipelines and stages; `label_fr` on select options). When
 * French is chosen, runtime responses are localised as they arrive (see
 * `utils/localize.js` and the interceptor in `services/api.js`); Builder
 * screens keep reading `/metadata/*`, so labels are always edited in English.
 *
 * The choice is a per-browser convenience; storage can be unavailable, in
 * which case the UI simply stays in English.
 */
const KEY = 'genesis-language';
export const LANGUAGES = [{ code: 'en', label: 'EN', name: 'English' }, { code: 'fr', label: 'FR', name: 'Français' }];

function read() {
  try { return localStorage.getItem(KEY) === 'fr' ? 'fr' : 'en'; } catch { return 'en'; }
}

export const useLanguageStore = create((set) => ({
  lang: read(),
  /** Switch language. Cached metadata is dropped and the page reloads so every screen re-reads its labels. */
  setLang: (lang) => {
    const next = lang === 'fr' ? 'fr' : 'en';
    try {
      localStorage.setItem(KEY, next);
      localStorage.removeItem('genesis-metadata');
    } catch { /* storage unavailable: switch for this page only */ }
    set({ lang: next });
    window.location.reload();
  },
}));
