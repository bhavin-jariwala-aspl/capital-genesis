import { describe, it, expect } from 'vitest';
import {
  buildPalette, rgbToHex, hexToRgb, resolveAppearance, applyAppearance, clearAppearance,
  chartSeries, prefersLightText, APPEARANCE_DEFAULTS, rgbToHsl,
} from '../src/utils/appearance';

describe('appearance palette maths', () => {
  it('round-trips hex ↔ rgb', () => {
    expect(rgbToHex(hexToRgb('#6366f1'))).toBe('#6366f1');
    expect(hexToRgb('nope')).toBeNull();
  });

  it('builds an 11-step ramp anchored on the brand colour, light to dark', () => {
    const pal = buildPalette('#6366f1');
    expect(Object.keys(pal)).toHaveLength(11);
    expect(rgbToHex(pal[500])).toBe('#6366f1');
    const lum = (c) => c.r + c.g + c.b;
    expect(lum(pal[50])).toBeGreaterThan(lum(pal[500]));
    expect(lum(pal[500])).toBeGreaterThan(lum(pal[900]));
    // Close to Tailwind's own indigo-100 / indigo-800 (generated, so allow a little drift)
    expect(rgbToHex(pal[100])).toMatch(/^#[d-f][0-9a-f][d-f][0-9a-f]f[0-9a-f]$/i);
  });

  it('anchors a dark brand colour on the 600 slot so hover states stay darker', () => {
    const pal = buildPalette('#334155');
    expect(rgbToHex(pal[600])).toBe('#334155');
  });

  it('picks readable text for the primary colour', () => {
    expect(prefersLightText('#4f46e5')).toBe(true);
    expect(prefersLightText('#fde68a')).toBe(false);
  });
});

describe('resolveAppearance', () => {
  it('fills defaults and rejects bad values', () => {
    const a = resolveAppearance({ 'organization.primary_color': 'red', 'appearance.radius': 'weird', 'appearance.density': 'compact' });
    expect(a['organization.primary_color']).toBe(APPEARANCE_DEFAULTS['organization.primary_color']);
    expect(a['appearance.radius']).toBe('rounded');
    expect(a['appearance.density']).toBe('compact');
    expect(a['appearance.app_name']).toBe('Genesis CRM');
  });
});

describe('applyAppearance', () => {
  it('writes palette variables, radius, density, font and data attributes onto the root', () => {
    const root = document.createElement('html');
    applyAppearance({
      'organization.primary_color': '#059669', 'appearance.radius': 'pill', 'appearance.density': 'compact',
      'appearance.font': 'serif', 'appearance.background': 'plain', 'appearance.sidebar_style': 'brand',
    }, { root });
    // #059669 is dark (L≈0.30) so it anchors at 600; 500 is generated lighter.
    expect(root.style.getPropertyValue('--p-600')).toBe('5 150 105');
    expect(root.style.getPropertyValue('--p-500')).not.toBe('');
    expect(root.style.getPropertyValue('--radius-2xl')).toBe('24px');
    expect(root.style.getPropertyValue('--base-font-size')).toBe('14.5px');
    expect(root.style.getPropertyValue('--font-sans')).toContain('Serif');
    expect(root.dataset.background).toBe('plain');
    expect(root.dataset.sidebar).toBe('brand');

    clearAppearance(root);
    expect(root.style.getPropertyValue('--p-500')).toBe('');
    expect(root.dataset.background).toBeUndefined();
  });
});

describe('chartSeries', () => {
  it('returns a named palette per mode and derives "brand" from the tenant colours', () => {
    const a = resolveAppearance({ 'appearance.chart_palette': 'ocean' });
    expect(chartSeries(a, false)).toHaveLength(8);
    expect(chartSeries(a, false)).not.toEqual(chartSeries(a, true));
    const brand = chartSeries(resolveAppearance({ 'appearance.chart_palette': 'brand', 'organization.primary_color': '#dc2626' }), false);
    expect(brand[0]).toBe('#dc2626');
  });
});

// ── Appearance Studio additions (Sept 2026) ──────────────────────────────────
import {
  THEME_PRESETS, THEME_KEYS, APPEARANCE_KEYS, NEUTRALS, DARK_SURFACES, matchPreset, applyPreset as applyThemePreset,
  exportTheme, importTheme, saveBrandingSnapshot, readBrandingSnapshot, clearBrandingSnapshot, applyDocumentChrome,
  monogramDataUrl, contrastRatio, harmonies,
} from '../src/utils/appearance';

describe('theme presets', () => {
  it('every preset sets every theme key to a valid value and round-trips through matchPreset', () => {
    for (const p of THEME_PRESETS) {
      for (const k of THEME_KEYS) expect(p.values[k], `${p.id} missing ${k}`).toBeDefined();
      const resolved = resolveAppearance(p.values);
      for (const k of THEME_KEYS) expect(String(resolved[k]), `${p.id} ${k} was rejected`).toBe(String(p.values[k]));
      expect(matchPreset(p.values)?.id).toBe(p.id);
    }
  });

  it('applyPreset keeps identity (name, logos) and stamps theme_preset; any change makes it custom', () => {
    const base = { 'appearance.app_name': 'Acme', 'organization.logo_url': '/api/settings/branding/1/logo_x.png' };
    const next = applyThemePreset(base, 'cupertino');
    expect(next['appearance.app_name']).toBe('Acme');
    expect(next['organization.logo_url']).toBe(base['organization.logo_url']);
    expect(next['appearance.theme_preset']).toBe('cupertino');
    expect(next['appearance.font']).toBe('cupertino');
    expect(matchPreset({ ...next, 'appearance.radius': 'sharp' })).toBeNull();
    expect(applyThemePreset(base, 'nope')).toEqual(base);
  });
});

describe('applyAppearance — neutrals, surfaces, fonts, data attributes', () => {
  it('writes the neutral ramp, dark surfaces, heading font, sidebar width and the new data attributes', () => {
    const root = document.createElement('html');
    applyAppearance({
      'appearance.neutral': 'graphite', 'appearance.dark_surface': 'oled', 'appearance.font': 'cupertino',
      'appearance.heading_font': 'match', 'appearance.sidebar_width': 'wide', 'appearance.surface_style': 'flat',
      'appearance.button_style': 'solid', 'appearance.motion': 'reduced', 'appearance.nav_active_style': 'line',
    }, { root });
    expect(root.style.getPropertyValue('--n-500')).toBe(NEUTRALS.graphite[500]);
    expect(root.style.getPropertyValue('--s-0')).toBe(DARK_SURFACES.oled[0]);
    expect(root.style.getPropertyValue('--font-display')).toContain('SF Pro');
    expect(root.style.getPropertyValue('--sidebar-w')).toBe('264px');
    expect(root.style.getPropertyValue('--radius-sm')).toBe('4px');
    expect(root.dataset.surface).toBe('flat');
    expect(root.dataset.buttons).toBe('solid');
    expect(root.dataset.motion).toBe('reduced');
    expect(root.dataset.nav).toBe('line');
    expect(root.dataset.font).toBe('cupertino');
    clearAppearance(root);
    expect(root.style.getPropertyValue('--n-500')).toBe('');
    expect(root.style.getPropertyValue('--s-0')).toBe('');
    expect(root.dataset.surface).toBeUndefined();
  });

  it('a very dark brand anchors on 800 so its tints stay usable', () => {
    const pal = buildPalette('#1c1c1e');
    expect(rgbToHex(pal[800])).toBe('#1c1c1e');
    expect(pal[500].r + pal[500].g + pal[500].b).toBeGreaterThan(pal[800].r + pal[800].g + pal[800].b);
  });

  it('rejects unknown enum values for the new knobs and coerces boolean strings', () => {
    const a = resolveAppearance({ 'appearance.neutral': 'neon', 'appearance.surface_style': 'wet', 'appearance.login_layout': 'x', 'appearance.allow_user_density': 'false' });
    expect(a['appearance.neutral']).toBe('cool');
    expect(a['appearance.surface_style']).toBe('glass');
    expect(a['appearance.login_layout']).toBe('split');
    expect(a['appearance.allow_user_density']).toBe(false);
  });
});

describe('theme export / import', () => {
  it('exports only look keys and imports them back, dropping junk', () => {
    const file = exportTheme({ 'organization.primary_color': '#0284c7', 'appearance.app_name': 'Acme', 'organization.logo_url': 'https://x/l.png' });
    expect(file.genesis_theme).toBe(1);
    expect(file.theme['organization.primary_color']).toBe('#0284c7');
    expect(file.theme['appearance.app_name']).toBeUndefined();
    expect(file.theme['organization.logo_url']).toBeUndefined();
    const back = importTheme(JSON.stringify({ ...file, theme: { ...file.theme, 'appearance.radius': 'bogus', 'security.require_mfa': true } }));
    expect(back.values['organization.primary_color']).toBe('#0284c7');
    expect(back.values['appearance.radius']).toBe('rounded');
    expect(back.values['security.require_mfa']).toBeUndefined();
    expect(Object.keys(back.values).sort()).toEqual([...THEME_KEYS].sort());
  });

  it('refuses non-theme files and newer versions', () => {
    expect(() => importTheme('{"hello":1}')).toThrow(/not a genesis theme/i);
    expect(() => importTheme({ genesis_theme: 99, theme: {} })).toThrow(/newer/);
  });
});

describe('pre-login branding snapshot and document chrome', () => {
  it('remembers the tenant brand in storage and reads it back resolved', () => {
    const mem = new Map();
    const storage = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, v), removeItem: (k) => mem.delete(k) };
    saveBrandingSnapshot({ 'appearance.app_name': 'Acme Assurance', 'organization.primary_color': '#dc2626', 'appearance.radius': 'weird' }, 42, storage);
    const snap = readBrandingSnapshot(storage);
    expect(snap.tenant_id).toBe(42);
    expect(snap.values['appearance.app_name']).toBe('Acme Assurance');
    expect(snap.values['organization.primary_color']).toBe('#dc2626');
    expect(snap.values['appearance.radius']).toBe('rounded');
    clearBrandingSnapshot(storage);
    expect(readBrandingSnapshot(storage)).toBeNull();
    storage.setItem('genesis-branding', 'not json');
    expect(readBrandingSnapshot(storage)).toBeNull();
  });

  it('sets the tab title and a favicon (uploaded, icon, or generated monogram)', () => {
    const doc = document.implementation.createHTMLDocument('x');
    applyDocumentChrome({ 'appearance.app_name': 'Acme Assurance' }, doc);
    expect(doc.title).toBe('Acme Assurance');
    const link = doc.querySelector('link[rel="icon"]');
    expect(link.getAttribute('href')).toMatch(/^data:image\/svg\+xml/);
    expect(decodeURIComponent(link.getAttribute('href'))).toContain('>A<');
    applyDocumentChrome({ 'appearance.favicon_url': '/api/settings/branding/1/favicon_abcdef0123456789.ico' }, doc);
    expect(doc.querySelector('link[rel="icon"]').getAttribute('href')).toMatch(/favicon_/);
    expect(doc.querySelector('link[rel="icon"]').type).toBe('image/x-icon');
    expect(monogramDataUrl({ 'organization.primary_color': '#ffffff' })).toContain(encodeURIComponent('#111827'));
  });
});

describe('colour helpers', () => {
  it('contrastRatio and harmonies behave', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 0);
    expect(contrastRatio('#6366f1', '#ffffff')).toBeGreaterThan(3);
    const h = harmonies('#6366f1');
    expect(h).toHaveLength(5);
    for (const x of h) expect(hexToRgb(x.hex)).not.toBeNull();
    expect(harmonies('nope')).toEqual([]);
  });

  it('APPEARANCE_KEYS covers every default and THEME_KEYS is a strict subset without identity keys', () => {
    expect(APPEARANCE_KEYS).toEqual(Object.keys(APPEARANCE_DEFAULTS));
    expect(THEME_KEYS).not.toContain('appearance.app_name');
    expect(THEME_KEYS).not.toContain('organization.logo_url');
    expect(THEME_KEYS).toContain('organization.primary_color');
  });
});

// ── Colour combinations (dark ramps, gradient mid, on-colour text) ───────────
import { gradientMid } from '../src/utils/appearance';

describe('dark-mode brand ramp', () => {
  const lum = (c) => rgbToHsl(c).l;
  it('lifts every action shade above its light-mode counterpart and keeps deep shades deep', () => {
    for (const hex of ['#6366f1', '#15803d', '#1c1c1e', '#e11d48', '#007aff', '#d97706']) {
      const light = buildPalette(hex), dark = buildPalette(hex, { dark: true });
      for (const sh of [300, 400, 500, 600, 700]) expect(lum(dark[sh]), `${hex} ${sh}`).toBeGreaterThan(lum(light[sh]) + 0.04);
      expect(lum(dark[500])).toBeGreaterThanOrEqual(0.62);
      expect(lum(dark[900])).toBeLessThan(0.35);
      // hue is preserved (achromatic brands stay grey)
      const hL = rgbToHsl(light[500]), hD = rgbToHsl(dark[500]);
      if (hL.s > 0.1) expect(Math.abs(hL.h - hD.h)).toBeLessThan(0.02); else expect(hD.s).toBeLessThan(0.1);
    }
  });

  it('indigo in dark mode lands near Tailwind indigo-400, the conventional dark accent', () => {
    const dark = buildPalette('#6366f1', { dark: true });
    const { r, g, b } = dark[500];
    expect(Math.abs(r - 0x81) + Math.abs(g - 0x8c) + Math.abs(b - 0xf8)).toBeLessThan(40);
  });
});

describe('gradientMid', () => {
  it('sits between the two hues the short way round and stays calm', () => {
    const h = (c) => rgbToHsl(c).h * 360;
    const mid = gradientMid('#6366f1', '#d946ef')[500];      // indigo 239° → fuchsia 292° ⇒ violet ~265°
    expect(h(mid)).toBeGreaterThan(250); expect(h(mid)).toBeLessThan(280);
    const wrap = gradientMid('#e11d48', '#f97316')[500];     // rose 347° → orange 25° ⇒ red ~6°, not cyan
    expect(h(wrap) < 30 || h(wrap) > 340).toBe(true);
    expect(rgbToHsl(gradientMid("#15803d", "#d97706")[500]).s).toBeLessThanOrEqual(0.625);
    // an achromatic partner follows the coloured one's hue
    expect(Math.abs(h(gradientMid('#1c1c1e', '#0a84ff')[500]) - h(hexToRgb('#0a84ff')))).toBeLessThan(5);
    expect(rgbToHsl(gradientMid('#6366f1', '#d946ef', { dark: true })[500]).l).toBeGreaterThan(rgbToHsl(mid).l);
  });
});

describe('applyAppearance — dark ramps and gradient tokens', () => {
  it('writes light and dark ramps, mode-aware on-colour text and the gradient mid', () => {
    const root = document.createElement('html');
    applyAppearance({ 'organization.primary_color': '#fde68a', 'appearance.accent_color': '#0369a1' }, { root });
    expect(root.style.getPropertyValue('--pd-500')).not.toBe('');
    expect(root.style.getPropertyValue('--pd-500')).not.toBe(root.style.getPropertyValue('--p-500'));
    expect(root.style.getPropertyValue('--ad-600')).not.toBe('');
    expect(root.style.getPropertyValue('--g-mid')).toMatch(/^\d+ \d+ \d+$/);
    expect(root.style.getPropertyValue('--gd-mid-600')).toMatch(/^\d+ \d+ \d+$/);
    // pale yellow brand → dark text on buttons in both modes; deep blue accent → white text
    expect(root.style.getPropertyValue('--on-primary')).toBe('17 24 39');
    expect(root.style.getPropertyValue('--on-primary-dark')).toBe('17 24 39');
    expect(root.style.getPropertyValue('--on-accent')).toBe('255 255 255');
    clearAppearance(root);
    for (const k of ['--pd-500', '--ad-600', '--g-mid', '--gd-mid-600', '--on-primary-dark', '--on-accent']) expect(root.style.getPropertyValue(k)).toBe('');
  });
});
