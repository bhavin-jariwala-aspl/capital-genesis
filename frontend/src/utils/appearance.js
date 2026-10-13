/**
 * Appearance engine — turns the tenant's "Appearance & Branding" settings into
 * CSS custom properties and data attributes on <html>.
 *
 * Tailwind's `primary`, `accent` and `gray` palettes, the dark-mode `night`
 * surfaces, the border-radius scale, the sidebar width and both font stacks are
 * expressed as CSS variables (see tailwind.config.js and index.css), so every
 * `bg-primary-600`, `text-gray-500`, `dark:bg-night-2`, `rounded-xl` or
 * `font-display` in the codebase follows whatever is applied here. Nothing
 * re-renders; the browser repaints.
 *
 * Shade generation: a single brand hex is expanded into a 50–950 palette using
 * HSL — lighter shades keep the hue and drift toward white, darker shades
 * toward black, saturation is eased so very light shades do not look neon.
 * Indigo reproduces Tailwind's own ramp within a couple of points, and any
 * other brand colour gets a coherent ramp.
 */

export const APPEARANCE_DEFAULTS = {
  'organization.primary_color': '#6366f1',
  'organization.logo_url': '',
  'appearance.app_name': 'Genesis CRM',
  'appearance.theme_preset': 'genesis',
  'appearance.logo_dark_url': '',
  'appearance.icon_url': '',
  'appearance.favicon_url': '',
  'appearance.logo_display': 'mark_and_name',
  'appearance.accent_color': '#d946ef',
  'appearance.neutral': 'cool',
  'appearance.mode': 'light',
  'appearance.dark_surface': 'midnight',
  'appearance.allow_user_mode_toggle': true,
  'appearance.allow_user_density': true,
  'appearance.radius': 'rounded',
  'appearance.density': 'comfortable',
  'appearance.surface_style': 'glass',
  'appearance.button_style': 'gradient',
  'appearance.motion': 'full',
  'appearance.font': 'inter',
  'appearance.heading_font': 'geometric',
  'appearance.background': 'aurora',
  'appearance.sidebar_style': 'light',
  'appearance.sidebar_width': 'regular',
  'appearance.nav_active_style': 'gradient',
  'appearance.chart_palette': 'vivid',
  'appearance.login_layout': 'split',
  'appearance.login_image_url': '',
  'appearance.login_tagline': 'Your business, beautifully managed.',
  'appearance.login_footer': '',
  'appearance.show_powered_by': true,
};

/** Keys the Appearance Studio saves (everything above). */
export const APPEARANCE_KEYS = Object.keys(APPEARANCE_DEFAULTS);

/** Keys that describe the *look* (used by presets and export); identity/logo keys are excluded. */
export const THEME_KEYS = APPEARANCE_KEYS.filter((k) => ![
  'organization.logo_url', 'appearance.app_name', 'appearance.theme_preset', 'appearance.logo_dark_url',
  'appearance.icon_url', 'appearance.favicon_url', 'appearance.logo_display', 'appearance.login_image_url',
  'appearance.login_tagline', 'appearance.login_footer', 'appearance.show_powered_by',
  'appearance.allow_user_mode_toggle', 'appearance.allow_user_density',
].includes(k));

/** Named brand colour pairs shown in the Colours section. */
export const COLOR_PRESETS = [
  { name: 'Indigo',   primary: '#6366f1', accent: '#d946ef' },
  { name: 'Cupertino', primary: '#007aff', accent: '#5856d6' },
  { name: 'Ocean',    primary: '#0369a1', accent: '#0d9488' },
  { name: 'Emerald',  primary: '#059669', accent: '#84cc16' },
  { name: 'Ruby',     primary: '#dc2626', accent: '#f97316' },
  { name: 'Amber',    primary: '#d97706', accent: '#dc2626' },
  { name: 'Royal',    primary: '#6d28d9', accent: '#db2777' },
  { name: 'Graphite', primary: '#1c1c1e', accent: '#0a84ff' },
  { name: 'Slate',    primary: '#334155', accent: '#0ea5e9' },
  { name: 'Teal',     primary: '#0d9488', accent: '#f59e0b' },
  { name: 'Rose',     primary: '#e11d48', accent: '#f97316' },
  { name: 'Forest',   primary: '#15803d', accent: '#d97706' },
  { name: 'Plum',     primary: '#9d174d', accent: '#7c3aed' },
  { name: 'Copper',   primary: '#b45309', accent: '#0f766e' },
];

/**
 * Complete looks. A preset sets every THEME_KEY at once (identity and logos
 * are left alone), so one click moves the whole product to a coherent design
 * language. Each is designed as a pair: the light and dark renderings both hold.
 */
export const THEME_PRESETS = [
  {
    id: 'genesis', name: 'Genesis', tagline: 'Vivid indigo, glass surfaces, aurora glow.',
    values: {
      'organization.primary_color': '#6366f1', 'appearance.accent_color': '#d946ef', 'appearance.neutral': 'cool',
      'appearance.mode': 'light', 'appearance.dark_surface': 'midnight', 'appearance.radius': 'rounded',
      'appearance.density': 'comfortable', 'appearance.surface_style': 'glass', 'appearance.button_style': 'gradient',
      'appearance.motion': 'full', 'appearance.font': 'inter', 'appearance.heading_font': 'geometric',
      'appearance.background': 'aurora', 'appearance.sidebar_style': 'light', 'appearance.sidebar_width': 'regular',
      'appearance.nav_active_style': 'gradient', 'appearance.chart_palette': 'vivid', 'appearance.login_layout': 'split',
    },
  },
  {
    id: 'cupertino', name: 'Cupertino', tagline: 'System blue, SF-style type, frosted glass, continuous corners.',
    values: {
      'organization.primary_color': '#007aff', 'appearance.accent_color': '#5856d6', 'appearance.neutral': 'graphite',
      'appearance.mode': 'system', 'appearance.dark_surface': 'graphite', 'appearance.radius': 'pill',
      'appearance.density': 'comfortable', 'appearance.surface_style': 'glass', 'appearance.button_style': 'solid',
      'appearance.motion': 'full', 'appearance.font': 'cupertino', 'appearance.heading_font': 'match',
      'appearance.background': 'plain', 'appearance.sidebar_style': 'glass', 'appearance.sidebar_width': 'regular',
      'appearance.nav_active_style': 'pill', 'appearance.chart_palette': 'cupertino', 'appearance.login_layout': 'centered',
    },
  },
  {
    id: 'graphite', name: 'Graphite', tagline: 'Monochrome executive look with a single blue highlight.',
    values: {
      'organization.primary_color': '#1c1c1e', 'appearance.accent_color': '#0a84ff', 'appearance.neutral': 'graphite',
      'appearance.mode': 'light', 'appearance.dark_surface': 'graphite', 'appearance.radius': 'soft',
      'appearance.density': 'compact', 'appearance.surface_style': 'flat', 'appearance.button_style': 'solid',
      'appearance.motion': 'subtle', 'appearance.font': 'cupertino', 'appearance.heading_font': 'match',
      'appearance.background': 'plain', 'appearance.sidebar_style': 'dark', 'appearance.sidebar_width': 'compact',
      'appearance.nav_active_style': 'line', 'appearance.chart_palette': 'mono', 'appearance.login_layout': 'centered',
    },
  },
  {
    id: 'midnight', name: 'Midnight', tagline: 'Dark by default. Violet on deep navy, OLED-friendly.',
    values: {
      'organization.primary_color': '#8b5cf6', 'appearance.accent_color': '#22d3ee', 'appearance.neutral': 'slate',
      'appearance.mode': 'dark', 'appearance.dark_surface': 'oled', 'appearance.radius': 'rounded',
      'appearance.density': 'comfortable', 'appearance.surface_style': 'elevated', 'appearance.button_style': 'gradient',
      'appearance.motion': 'full', 'appearance.font': 'inter', 'appearance.heading_font': 'geometric',
      'appearance.background': 'aurora', 'appearance.sidebar_style': 'dark', 'appearance.sidebar_width': 'regular',
      'appearance.nav_active_style': 'pill', 'appearance.chart_palette': 'ocean', 'appearance.login_layout': 'cover',
    },
  },
  {
    id: 'ocean', name: 'Ocean', tagline: 'Calm sky blue and teal, soft surfaces, spacious.',
    values: {
      'organization.primary_color': '#0369a1', 'appearance.accent_color': '#0d9488', 'appearance.neutral': 'slate',
      'appearance.mode': 'light', 'appearance.dark_surface': 'midnight', 'appearance.radius': 'rounded',
      'appearance.density': 'spacious', 'appearance.surface_style': 'glass', 'appearance.button_style': 'soft',
      'appearance.motion': 'full', 'appearance.font': 'humanist', 'appearance.heading_font': 'geometric',
      'appearance.background': 'mesh', 'appearance.sidebar_style': 'glass', 'appearance.sidebar_width': 'wide',
      'appearance.nav_active_style': 'pill', 'appearance.chart_palette': 'ocean', 'appearance.login_layout': 'split',
    },
  },
  {
    id: 'forest', name: 'Forest', tagline: 'Deep green with gold, warm neutrals, print-like serif headings.',
    values: {
      'organization.primary_color': '#15803d', 'appearance.accent_color': '#d97706', 'appearance.neutral': 'warm',
      'appearance.mode': 'light', 'appearance.dark_surface': 'graphite', 'appearance.radius': 'soft',
      'appearance.density': 'comfortable', 'appearance.surface_style': 'flat', 'appearance.button_style': 'solid',
      'appearance.motion': 'subtle', 'appearance.font': 'humanist', 'appearance.heading_font': 'serif',
      'appearance.background': 'tinted', 'appearance.sidebar_style': 'brand', 'appearance.sidebar_width': 'regular',
      'appearance.nav_active_style': 'line', 'appearance.chart_palette': 'warm', 'appearance.login_layout': 'split',
    },
  },
  {
    id: 'sunset', name: 'Sunset', tagline: 'Energetic coral and amber gradients for sales floors.',
    values: {
      'organization.primary_color': '#e11d48', 'appearance.accent_color': '#f97316', 'appearance.neutral': 'warm',
      'appearance.mode': 'light', 'appearance.dark_surface': 'midnight', 'appearance.radius': 'pill',
      'appearance.density': 'comfortable', 'appearance.surface_style': 'elevated', 'appearance.button_style': 'gradient',
      'appearance.motion': 'full', 'appearance.font': 'geometric', 'appearance.heading_font': 'match',
      'appearance.background': 'mesh', 'appearance.sidebar_style': 'light', 'appearance.sidebar_width': 'regular',
      'appearance.nav_active_style': 'gradient', 'appearance.chart_palette': 'warm', 'appearance.login_layout': 'cover',
    },
  },
  {
    id: 'royal', name: 'Royal', tagline: 'Regal violet on brand sidebar, sharp corners, dense.',
    values: {
      'organization.primary_color': '#6d28d9', 'appearance.accent_color': '#db2777', 'appearance.neutral': 'cool',
      'appearance.mode': 'light', 'appearance.dark_surface': 'midnight', 'appearance.radius': 'sharp',
      'appearance.density': 'compact', 'appearance.surface_style': 'flat', 'appearance.button_style': 'solid',
      'appearance.motion': 'subtle', 'appearance.font': 'inter', 'appearance.heading_font': 'geometric',
      'appearance.background': 'plain', 'appearance.sidebar_style': 'brand', 'appearance.sidebar_width': 'compact',
      'appearance.nav_active_style': 'line', 'appearance.chart_palette': 'brand', 'appearance.login_layout': 'split',
    },
  },
];

export const RADIUS_SCALES = {
  sharp:   { sm: '3px', md: '4px',  lg: '6px',  xl: '8px',  '2xl': '10px', '3xl': '12px' },
  soft:    { sm: '4px', md: '6px',  lg: '8px',  xl: '10px', '2xl': '12px', '3xl': '16px' },
  rounded: { sm: '4px', md: '6px',  lg: '8px',  xl: '12px', '2xl': '16px', '3xl': '24px' }, // Tailwind defaults
  pill:    { sm: '6px', md: '10px', lg: '14px', xl: '18px', '2xl': '24px', '3xl': '32px' },
};

export const DENSITY_FONT_SIZE = { compact: '14.5px', comfortable: '16px', spacious: '17px' };

export const SIDEBAR_WIDTHS = { compact: '200px', regular: '232px', wide: '264px' };

export const FONT_STACKS = {
  inter:     '"Inter", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
  // Apple's own stack: SF Pro on Apple platforms, Segoe/Roboto elsewhere.
  cupertino: '-apple-system, BlinkMacSystemFont, "SF Pro Text", "SF Pro Display", "Helvetica Neue", "Inter", "Segoe UI", Roboto, sans-serif',
  system:    'system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
  geometric: '"Plus Jakarta Sans", "Inter", system-ui, sans-serif',
  humanist:  '"Source Sans 3", "Segoe UI", system-ui, sans-serif',
  serif:     '"Source Serif 4", Georgia, "Times New Roman", serif',
};

/**
 * Neutral (grey) ramps as "r g b" triplets for --n-50…950. `cool` is Tailwind's
 * gray (the historical default), `slate` is bluer, `warm` is stone, `graphite`
 * is Apple's near-achromatic system grey.
 */
export const NEUTRALS = {
  cool: { 50: '249 250 251', 100: '243 244 246', 200: '229 231 235', 300: '209 213 219', 400: '156 163 175', 500: '107 114 128', 600: '75 85 99', 700: '55 65 81', 800: '31 41 55', 900: '17 24 39', 950: '3 7 18' },
  slate: { 50: '248 250 252', 100: '241 245 249', 200: '226 232 240', 300: '203 213 225', 400: '148 163 184', 500: '100 116 139', 600: '71 85 105', 700: '51 65 85', 800: '30 41 59', 900: '15 23 42', 950: '2 6 23' },
  warm: { 50: '250 250 249', 100: '245 245 244', 200: '231 229 228', 300: '214 211 209', 400: '168 162 158', 500: '120 113 108', 600: '87 83 78', 700: '68 64 60', 800: '41 37 36', 900: '28 25 23', 950: '12 10 9' },
  graphite: { 50: '250 250 250', 100: '244 244 245', 200: '229 229 234', 300: '209 209 214', 400: '158 158 163', 500: '110 110 115', 600: '78 78 83', 700: '58 58 60', 800: '44 44 46', 900: '28 28 30', 950: '10 10 12' },
};

/**
 * Dark-mode surface stacks for --s-0…3 (canvas, chrome, panel, raised).
 * `midnight` is the historical indigo-tinted navy, `graphite` is Apple's
 * layered system grey, `oled` sits on true black for OLED displays.
 */
export const DARK_SURFACES = {
  midnight: { 0: '10 9 20',  1: '13 12 30', 2: '20 19 39', 3: '30 30 46' },
  graphite: { 0: '0 0 0',    1: '28 28 30', 2: '28 28 30', 3: '44 44 46' },
  oled:     { 0: '0 0 0',    1: '8 8 12',   2: '16 16 22', 3: '26 26 34' },
};

/**
 * Categorical chart palettes. Each is colour-blind checked in light and dark;
 * `brand` is derived at apply-time from the tenant's primary and accent.
 */
export const CHART_PALETTES = {
  vivid:  { light: ['#6366f1', '#14b8a6', '#f59e0b', '#a855f7', '#22c55e', '#ef4444', '#0ea5e9', '#f97316'],
            dark:  ['#818cf8', '#2dd4bf', '#fbbf24', '#c084fc', '#4ade80', '#f87171', '#38bdf8', '#fb923c'] },
  pastel: { light: ['#a5b4fc', '#99f6e4', '#fde68a', '#e9d5ff', '#bbf7d0', '#fecaca', '#bae6fd', '#fed7aa'],
            dark:  ['#c7d2fe', '#ccfbf1', '#fef3c7', '#f3e8ff', '#dcfce7', '#fee2e2', '#e0f2fe', '#ffedd5'] },
  mono:   { light: ['#312e81', '#4338ca', '#4f46e5', '#6366f1', '#818cf8', '#a5b4fc', '#c7d2fe', '#e0e7ff'],
            dark:  ['#e0e7ff', '#c7d2fe', '#a5b4fc', '#818cf8', '#6366f1', '#4f46e5', '#4338ca', '#3730a3'] },
  ocean:  { light: ['#0369a1', '#0891b2', '#0d9488', '#059669', '#2563eb', '#7c3aed', '#0284c7', '#14b8a6'],
            dark:  ['#38bdf8', '#22d3ee', '#2dd4bf', '#34d399', '#60a5fa', '#a78bfa', '#7dd3fc', '#5eead4'] },
  warm:   { light: ['#dc2626', '#ea580c', '#d97706', '#ca8a04', '#be185d', '#9333ea', '#f43f5e', '#f59e0b'],
            dark:  ['#f87171', '#fb923c', '#fbbf24', '#facc15', '#f472b6', '#c084fc', '#fb7185', '#fcd34d'] },
  // Apple's system colours (light / dark variants from the HIG).
  cupertino: { light: ['#007aff', '#34c759', '#ff9500', '#af52de', '#ff3b30', '#5ac8fa', '#ffcc00', '#ff2d55'],
               dark:  ['#0a84ff', '#30d158', '#ff9f0a', '#bf5af2', '#ff453a', '#64d2ff', '#ffd60a', '#ff375f'] },
};

// ── Colour maths ──────────────────────────────────────────────────────────────

export function hexToRgb(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex ?? '').trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

export function rgbToHex({ r, g, b }) {
  const h = (v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
  return `#${h(r)}${h(g)}${h(b)}`;
}

export function rgbToHsl({ r, g, b }) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
  else if (max === g) h = ((b - r) / d + 2) / 6;
  else h = ((r - g) / d + 4) / 6;
  return { h, s, l };
}

export function hslToRgb({ h, s, l }) {
  if (s === 0) { const v = l * 255; return { r: v, g: v, b: v }; }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const f = (t) => {
    if (t < 0) t += 1; if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  return { r: f(h + 1 / 3) * 255, g: f(h) * 255, b: f(h - 1 / 3) * 255 };
}

const SHADES = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950];
// Target lightness per shade (Tailwind's own ramps sit close to these).
const SHADE_L = { 50: 0.97, 100: 0.94, 200: 0.87, 300: 0.78, 400: 0.68, 500: 0.58, 600: 0.5, 700: 0.42, 800: 0.34, 900: 0.27, 950: 0.17 };

// Dark-mode targets: the action shades sit brighter so brand text, links,
// focus rings and buttons keep contrast on dark surfaces — the same shift
// Apple makes between its light and dark system colours (#007aff → #0a84ff).
const SHADE_L_DARK = { 50: 0.96, 100: 0.92, 200: 0.85, 300: 0.78, 400: 0.72, 500: 0.66, 600: 0.58, 700: 0.50, 800: 0.38, 900: 0.28, 950: 0.16 };

/**
 * Expand one brand colour into an 11-step palette. The supplied colour is
 * pinned to the 500 slot unless it is already dark, in which case it becomes
 * 600 so hover/active states stay visibly darker. Very dark brands (L < 0.2,
 * e.g. graphite) pin to 800 so the tints above them stay usable.
 *
 * With `{ dark: true }` the ramp is rebuilt for dark surfaces: every action
 * shade (50–700) is at least a step lighter than its light-mode counterpart and
 * never below the dark targets, with saturation eased so lifted colours do not
 * turn neon against near-black. 800–950 stay deep for tinted dark surfaces.
 * @returns {Record<number, {r,g,b}>}
 */
export function buildPalette(hex, { dark = false } = {}) {
  const rgb = hexToRgb(hex) ?? hexToRgb(APPEARANCE_DEFAULTS['organization.primary_color']);
  const base = rgbToHsl(rgb);
  const anchor = base.l < 0.2 ? 800 : base.l < 0.45 ? 600 : 500;
  const light = {};
  for (const shade of SHADES) {
    if (shade === anchor) { light[shade] = rgb; continue; }
    const targetL = SHADE_L[shade];
    // Ease saturation toward the ends so the lightest shades are not garish
    // and the darkest do not turn muddy.
    const distance = Math.abs(shade - anchor) / 900;
    const s = shade < anchor
      ? base.s * (1 - distance * 0.35)
      : Math.min(1, base.s * (1 + distance * 0.15));
    light[shade] = hslToRgb({ h: base.h, s, l: targetL });
  }
  if (!dark) return light;
  const out = {};
  for (const shade of SHADES) {
    const lightL = rgbToHsl(light[shade]).l;
    const l = shade <= 700 ? Math.max(SHADE_L_DARK[shade], Math.min(0.97, lightL + 0.06)) : SHADE_L_DARK[shade];
    const lifted = Math.max(0, l - lightL);
    const s = Math.max(0, Math.min(1, base.s * (1 - lifted * 0.5)));
    out[shade] = hslToRgb({ h: base.h, s, l });
  }
  return out;
}

/**
 * The colour half-way between primary and accent (shortest way round the hue
 * wheel) — the middle stop of every brand gradient. Deriving it means a green
 * + gold brand gets an olive-gold sweep instead of the fixed violet that used
 * to sit in the middle of every gradient.
 * @returns {{ 500: {r,g,b}, 600: {r,g,b} }}
 */
export function gradientMid(primaryHex, accentHex, { dark = false } = {}) {
  const p = rgbToHsl(hexToRgb(primaryHex) ?? hexToRgb(APPEARANCE_DEFAULTS['organization.primary_color']));
  const a = rgbToHsl(hexToRgb(accentHex) ?? hexToRgb(APPEARANCE_DEFAULTS['appearance.accent_color']));
  // Achromatic partners contribute no hue — follow the coloured one.
  const pH = p.s < 0.08 ? a.h : p.h, aH = a.s < 0.08 ? p.h : a.h;
  let d = aH - pH; if (d > 0.5) d -= 1; if (d < -0.5) d += 1;
  const h = (pH + d / 2 + 1) % 1;
  // Kept calmer than either end so the sweep reads as one brand, not a rainbow.
  const s = Math.min(0.62, (p.s + a.s) / 2);
  const l = Math.max(0.42, Math.min(0.6, (p.l + a.l) / 2)) + (dark ? 0.08 : 0);
  return { 500: hslToRgb({ h, s, l }), 600: hslToRgb({ h, s, l: l - 0.08 }) };
}

const triplet = ({ r, g, b }) => `${Math.round(r)} ${Math.round(g)} ${Math.round(b)}`;

/** Relative luminance → is white text readable on this colour? */
export function prefersLightText(hex) {
  const c = hexToRgb(hex);
  if (!c) return true;
  const lin = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
  const L = 0.2126 * lin(c.r) + 0.7152 * lin(c.g) + 0.0722 * lin(c.b);
  return L < 0.45;
}

/** WCAG contrast ratio between two hex colours (1–21). */
export function contrastRatio(hexA, hexB) {
  const lum = (hex) => {
    const c = hexToRgb(hex); if (!c) return 0;
    const lin = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
    return 0.2126 * lin(c.r) + 0.7152 * lin(c.g) + 0.0722 * lin(c.b);
  };
  const a = lum(hexA), b = lum(hexB);
  const [hi, lo] = a > b ? [a, b] : [b, a];
  return (hi + 0.05) / (lo + 0.05);
}

/** Colour harmonies for the accent picker — complementary, triadic, analogous, split. */
export function harmonies(primaryHex) {
  const rgb = hexToRgb(primaryHex);
  if (!rgb) return [];
  const base = rgbToHsl(rgb);
  const spin = (deg) => rgbToHex(hslToRgb({ h: (base.h + deg / 360 + 1) % 1, s: Math.min(1, Math.max(0.45, base.s)), l: Math.min(0.62, Math.max(0.45, base.l)) }));
  return [
    { name: 'Complementary', hex: spin(180) },
    { name: 'Triadic',       hex: spin(120) },
    { name: 'Split',         hex: spin(150) },
    { name: 'Analogous',     hex: spin(35) },
    { name: 'Analogous −',   hex: spin(-35) },
  ];
}

// ── Apply ─────────────────────────────────────────────────────────────────────

const ENUMS = {
  'appearance.radius':        RADIUS_SCALES,
  'appearance.density':       DENSITY_FONT_SIZE,
  'appearance.font':          FONT_STACKS,
  'appearance.heading_font':  { match: 1, ...FONT_STACKS },
  'appearance.neutral':       NEUTRALS,
  'appearance.dark_surface':  DARK_SURFACES,
  'appearance.sidebar_width': SIDEBAR_WIDTHS,
  'appearance.chart_palette': { brand: 1, ...CHART_PALETTES },
  'appearance.surface_style': { glass: 1, flat: 1, elevated: 1 },
  'appearance.button_style':  { gradient: 1, solid: 1, soft: 1 },
  'appearance.motion':        { full: 1, subtle: 1, reduced: 1 },
  'appearance.background':    { aurora: 1, plain: 1, tinted: 1, mesh: 1 },
  'appearance.sidebar_style': { light: 1, dark: 1, brand: 1, glass: 1 },
  'appearance.nav_active_style': { gradient: 1, pill: 1, line: 1 },
  'appearance.logo_display':  { mark_and_name: 1, logo_only: 1, name_only: 1 },
  'appearance.login_layout':  { split: 1, centered: 1, cover: 1 },
  'appearance.mode':          { light: 1, dark: 1, system: 1 },
};

/** Normalise a flat settings map (missing or invalid keys → defaults). */
export function resolveAppearance(values = {}) {
  const out = { ...APPEARANCE_DEFAULTS };
  for (const k of APPEARANCE_KEYS) {
    const v = values[k];
    if (v !== undefined && v !== null && v !== '') out[k] = v;
  }
  if (!hexToRgb(out['organization.primary_color'])) out['organization.primary_color'] = APPEARANCE_DEFAULTS['organization.primary_color'];
  if (!hexToRgb(out['appearance.accent_color']))    out['appearance.accent_color']    = APPEARANCE_DEFAULTS['appearance.accent_color'];
  for (const [key, allowed] of Object.entries(ENUMS)) {
    if (!allowed[out[key]]) out[key] = APPEARANCE_DEFAULTS[key];
  }
  for (const k of ['appearance.allow_user_mode_toggle', 'appearance.allow_user_density', 'appearance.show_powered_by']) {
    out[k] = out[k] !== false && out[k] !== 'false';
  }
  return out;
}

/** The series colours a chart should use under the current appearance. */
export function chartSeries(appearance, isDark) {
  const name = appearance['appearance.chart_palette'];
  if (name === 'brand') {
    const p = buildPalette(appearance['organization.primary_color']);
    const a = buildPalette(appearance['appearance.accent_color']);
    const pick = (pal, shade) => rgbToHex(pal[shade]);
    return isDark
      ? [pick(p, 400), pick(a, 400), '#2dd4bf', '#fbbf24', pick(p, 300), pick(a, 300), '#4ade80', '#38bdf8']
      : [pick(p, 500), pick(a, 500), '#14b8a6', '#f59e0b', pick(p, 700), pick(a, 700), '#22c55e', '#0ea5e9'];
  }
  const pal = CHART_PALETTES[name] ?? CHART_PALETTES.vivid;
  return isDark ? pal.dark : pal.light;
}

/** Which preset (if any) the given values match exactly on every THEME_KEY. */
export function matchPreset(values) {
  const a = resolveAppearance(values);
  return THEME_PRESETS.find((p) => THEME_KEYS.every((k) => String(p.values[k] ?? APPEARANCE_DEFAULTS[k]) === String(a[k]))) ?? null;
}

/** Apply a preset over existing values, keeping identity and logos. */
export function applyPreset(values, presetId) {
  const preset = THEME_PRESETS.find((p) => p.id === presetId);
  if (!preset) return { ...values };
  return { ...values, ...preset.values, 'appearance.theme_preset': preset.id };
}

/**
 * Write the appearance onto <html>. Idempotent; safe to call on every change.
 * @param {Record<string, any>} values flat settings ("group.key" → value)
 * @param {{ root?: HTMLElement }} [opts]
 * @returns the resolved appearance
 */
export function applyAppearance(values, { root } = {}) {
  const a = resolveAppearance(values);
  const el = root ?? (typeof document !== 'undefined' ? document.documentElement : null);
  if (!el) return a;
  const st = el.style;

  const primaryHex = a['organization.primary_color'], accentHex = a['appearance.accent_color'];
  const primary = buildPalette(primaryHex), primaryDark = buildPalette(primaryHex, { dark: true });
  const accent  = buildPalette(accentHex),  accentDark  = buildPalette(accentHex,  { dark: true });
  const neutral = NEUTRALS[a['appearance.neutral']];
  for (const shade of SHADES) {
    st.setProperty(`--p-${shade}`,  triplet(primary[shade]));
    st.setProperty(`--pd-${shade}`, triplet(primaryDark[shade]));
    st.setProperty(`--a-${shade}`,  triplet(accent[shade]));
    st.setProperty(`--ad-${shade}`, triplet(accentDark[shade]));
    st.setProperty(`--n-${shade}`,  neutral[shade]);
  }
  // Text on the primary colour, judged against the shade buttons actually use in each mode.
  st.setProperty('--on-primary',      prefersLightText(rgbToHex(primary[600]))     ? '255 255 255' : '17 24 39');
  st.setProperty('--on-primary-dark', prefersLightText(rgbToHex(primaryDark[600])) ? '255 255 255' : '17 24 39');
  st.setProperty('--on-accent',       prefersLightText(rgbToHex(accent[600]))      ? '255 255 255' : '17 24 39');
  const mid = gradientMid(primaryHex, accentHex), midDark = gradientMid(primaryHex, accentHex, { dark: true });
  st.setProperty('--g-mid', triplet(mid[500]));   st.setProperty('--g-mid-600', triplet(mid[600]));
  st.setProperty('--gd-mid', triplet(midDark[500])); st.setProperty('--gd-mid-600', triplet(midDark[600]));

  const surfaces = DARK_SURFACES[a['appearance.dark_surface']];
  for (const k of [0, 1, 2, 3]) st.setProperty(`--s-${k}`, surfaces[k]);

  const radius = RADIUS_SCALES[a['appearance.radius']];
  for (const [k, v] of Object.entries(radius)) st.setProperty(`--radius-${k}`, v);

  st.setProperty('--base-font-size', DENSITY_FONT_SIZE[a['appearance.density']]);
  st.setProperty('--font-sans', FONT_STACKS[a['appearance.font']]);
  const heading = a['appearance.heading_font'] === 'match' ? a['appearance.font'] : a['appearance.heading_font'];
  st.setProperty('--font-display', FONT_STACKS[heading]);
  st.setProperty('--sidebar-w', SIDEBAR_WIDTHS[a['appearance.sidebar_width']]);

  el.dataset.background = a['appearance.background'];
  el.dataset.sidebar    = a['appearance.sidebar_style'];
  el.dataset.density    = a['appearance.density'];
  el.dataset.surface    = a['appearance.surface_style'];
  el.dataset.buttons    = a['appearance.button_style'];
  el.dataset.motion     = a['appearance.motion'];
  el.dataset.nav        = a['appearance.nav_active_style'];
  el.dataset.font       = a['appearance.font'];
  return a;
}

const MANAGED_DATA = ['background', 'sidebar', 'density', 'surface', 'buttons', 'motion', 'nav', 'font'];

/** Remove everything applyAppearance set (used when logging out). */
export function clearAppearance(root) {
  const el = root ?? (typeof document !== 'undefined' ? document.documentElement : null);
  if (!el) return;
  for (const shade of SHADES) {
    for (const pre of ['--p-', '--pd-', '--a-', '--ad-', '--n-']) el.style.removeProperty(`${pre}${shade}`);
  }
  for (const k of [0, 1, 2, 3]) el.style.removeProperty(`--s-${k}`);
  for (const k of ['--on-primary', '--on-primary-dark', '--on-accent', '--g-mid', '--g-mid-600', '--gd-mid', '--gd-mid-600',
    '--base-font-size', '--font-sans', '--font-display', '--sidebar-w',
    '--radius-sm', '--radius-md', '--radius-lg', '--radius-xl', '--radius-2xl', '--radius-3xl']) el.style.removeProperty(k);
  for (const d of MANAGED_DATA) delete el.dataset[d];
}

// ── Document chrome (tab title, favicon) ─────────────────────────────────────

/** A brand-coloured monogram as an SVG data URL — the favicon when none is uploaded. */
export function monogramDataUrl(appearance) {
  const a = resolveAppearance(appearance);
  const letter = (a['appearance.app_name'] || 'G').trim().charAt(0).toUpperCase() || 'G';
  const p = a['organization.primary_color'], ac = a['appearance.accent_color'];
  const fg = prefersLightText(p) ? '#ffffff' : '#111827';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${p}"/><stop offset="1" stop-color="${ac}"/></linearGradient></defs><rect width="64" height="64" rx="16" fill="url(#g)"/><text x="32" y="42" font-family="-apple-system,Inter,Arial,sans-serif" font-weight="700" font-size="34" text-anchor="middle" fill="${fg}">${letter}</text></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

/** Point the browser tab at the tenant: title + favicon. */
export function applyDocumentChrome(appearance, doc = typeof document !== 'undefined' ? document : null) {
  if (!doc) return;
  const a = resolveAppearance(appearance);
  doc.title = a['appearance.app_name'] || 'Genesis CRM';
  let link = doc.querySelector('link[rel="icon"]');
  if (!link) { link = doc.createElement('link'); link.rel = 'icon'; doc.head.appendChild(link); }
  const href = a['appearance.favicon_url'] || a['appearance.icon_url'] || monogramDataUrl(a);
  if (link.getAttribute('href') !== href) link.setAttribute('href', href);
  link.type = href.endsWith('.ico') ? 'image/x-icon' : href.startsWith('data:image/svg') || href.endsWith('.svg') ? 'image/svg+xml' : 'image/png';
}

// ── Pre-login branding snapshot ──────────────────────────────────────────────

export const BRANDING_SNAPSHOT_KEY = 'genesis-branding';

/** Remember the signed-in tenant's brand so the sign-in page can wear it next time. */
export function saveBrandingSnapshot(values, tenantId, storage = typeof localStorage !== 'undefined' ? localStorage : null) {
  if (!storage) return;
  try {
    const a = resolveAppearance(values);
    storage.setItem(BRANDING_SNAPSHOT_KEY, JSON.stringify({ tenant_id: tenantId ?? null, saved_at: Date.now(), values: a }));
  } catch { /* storage may be unavailable */ }
}

export function readBrandingSnapshot(storage = typeof localStorage !== 'undefined' ? localStorage : null) {
  if (!storage) return null;
  try {
    const raw = storage.getItem(BRANDING_SNAPSHOT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || !parsed.values) return null;
    return { tenant_id: parsed.tenant_id ?? null, saved_at: parsed.saved_at ?? 0, values: resolveAppearance(parsed.values) };
  } catch { return null; }
}

export function clearBrandingSnapshot(storage = typeof localStorage !== 'undefined' ? localStorage : null) {
  try { storage?.removeItem(BRANDING_SNAPSHOT_KEY); } catch { /* ignore */ }
}

// ── Export / import ──────────────────────────────────────────────────────────

export const THEME_FILE_VERSION = 1;

/** Serialise the look (THEME_KEYS only — no logos or names) for sharing between workspaces. */
export function exportTheme(values, { name } = {}) {
  const a = resolveAppearance(values);
  const theme = {};
  for (const k of THEME_KEYS) theme[k] = a[k];
  return { genesis_theme: THEME_FILE_VERSION, name: name || matchPreset(a)?.name || 'Custom theme', exported_at: new Date().toISOString(), theme };
}

/**
 * Parse a theme file. Unknown keys are dropped, bad values fall back to the
 * defaults via resolveAppearance. Throws on anything that is not a theme file.
 */
export function importTheme(json) {
  const data = typeof json === 'string' ? JSON.parse(json) : json;
  if (!data || typeof data !== 'object' || !data.theme || typeof data.theme !== 'object') {
    throw new Error('Not a Genesis theme file');
  }
  if (Number(data.genesis_theme) > THEME_FILE_VERSION) throw new Error('This theme was exported by a newer version');
  const picked = {};
  for (const k of THEME_KEYS) if (k in data.theme) picked[k] = data.theme[k];
  const resolved = resolveAppearance(picked);
  const out = {};
  for (const k of THEME_KEYS) out[k] = resolved[k];
  return { name: data.name || 'Imported theme', values: out };
}
