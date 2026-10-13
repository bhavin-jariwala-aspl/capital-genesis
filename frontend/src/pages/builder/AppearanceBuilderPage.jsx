import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Palette, RotateCcw, Save, Sun, Moon, Monitor, Check, Sparkles, Upload, Download, Wand2, Paintbrush,
  Building2, LayoutTemplate, Type, LogIn, BarChart3, Wind, SunMoon, Laptop, Smartphone, AlertTriangle,
  CheckCircle2, Search, Bell, LayoutDashboard, Users, TrendingUp, Contrast,
} from 'lucide-react';
import clsx from 'clsx';
import Button from '../../components/ui/Button';
import Badge from '../../components/ui/Badge';
import Input from '../../components/ui/Input';
import Alert from '../../components/ui/Alert';
import BuilderGuide from '../../components/builder/BuilderGuide';
import Toggle from '../../components/ui/Toggle';
import BrandLogo from '../../components/ui/BrandLogo';
import BrandAssetUploader from '../../components/builder/BrandAssetUploader';
import { settingsService } from '../../services/settings.service';
import { useAppearanceStore } from '../../store/appearanceStore';
import { useThemeStore } from '../../store/themeStore';
import {
  APPEARANCE_KEYS, COLOR_PRESETS, THEME_PRESETS, RADIUS_SCALES, DENSITY_FONT_SIZE, FONT_STACKS, CHART_PALETTES,
  NEUTRALS, DARK_SURFACES, SIDEBAR_WIDTHS, resolveAppearance, chartSeries, hexToRgb, matchPreset, applyPreset,
  exportTheme, importTheme, harmonies, contrastRatio, prefersLightText, buildPalette, rgbToHex, gradientMid,
} from '../../utils/appearance';

/**
 * Appearance Studio — everything about how the product looks, for everyone.
 *
 * Every control edits a draft; the draft is applied to the page immediately
 * (the whole app is the preview — colours, radius, density, fonts, surfaces
 * are CSS variables and data attributes), and Save persists it through the
 * settings API for every user of the tenant. Brand assets upload on the spot.
 * Reset drops the draft and re-applies what is saved.
 */

const LABELS = {
  radius:  { sharp: 'Sharp', soft: 'Soft', rounded: 'Rounded', pill: 'Continuous' },
  density: { compact: 'Compact', comfortable: 'Comfortable', spacious: 'Spacious' },
  font:    { inter: 'Inter', cupertino: 'San Francisco', system: 'System UI', geometric: 'Plus Jakarta', humanist: 'Source Sans', serif: 'Source Serif' },
  heading_font: { match: 'Same as body' },
  background: { aurora: 'Aurora glow', plain: 'Plain', tinted: 'Brand tint', mesh: 'Mesh gradient' },
  sidebar_style: { light: 'Light', dark: 'Dark', brand: 'Brand colour', glass: 'Frosted glass' },
  sidebar_width: { compact: 'Compact', regular: 'Regular', wide: 'Wide' },
  nav_active_style: { gradient: 'Gradient pill', pill: 'Tinted pill', line: 'Leading line' },
  surface_style: { glass: 'Glass', flat: 'Flat', elevated: 'Elevated' },
  button_style: { gradient: 'Gradient', solid: 'Solid', soft: 'Soft tint' },
  motion: { full: 'Full', subtle: 'Subtle', reduced: 'Reduced' },
  neutral: { cool: 'Cool grey', slate: 'Slate', warm: 'Warm stone', graphite: 'Graphite' },
  dark_surface: { midnight: 'Midnight', graphite: 'Graphite', oled: 'OLED black' },
  chart_palette: { vivid: 'Vivid', brand: 'Brand', pastel: 'Pastel', mono: 'Monochrome', ocean: 'Ocean', warm: 'Warm', cupertino: 'System' },
  logo_display: { mark_and_name: 'Mark + name', logo_only: 'Logo only', name_only: 'Name only' },
  login_layout: { split: 'Split panel', centered: 'Centered card', cover: 'Full-bleed cover' },
  mode: { light: 'Light', dark: 'Dark', system: 'Follow device' },
};
const label = (key, v) => LABELS[key]?.[v] ?? LABELS.font?.[v] ?? v;

const SECTIONS = [
  { id: 'themes',     label: 'Themes',        icon: Wand2,          hint: 'Start from a complete look' },
  { id: 'colors',     label: 'Colours',       icon: Paintbrush,     hint: 'Brand, accent and neutrals' },
  { id: 'branding',   label: 'Branding',      icon: Building2,      hint: 'Name, logo, icon, favicon' },
  { id: 'layout',     label: 'Layout & shape', icon: LayoutTemplate, hint: 'Corners, density, surfaces, navigation' },
  { id: 'type',       label: 'Typography',    icon: Type,           hint: 'Body and heading typefaces' },
  { id: 'mode',       label: 'Light & dark',  icon: SunMoon,        hint: 'Defaults and what users may change' },
  { id: 'login',      label: 'Sign-in page',  icon: LogIn,          hint: 'Layout, tagline, artwork' },
  { id: 'charts',     label: 'Charts',        icon: BarChart3,      hint: 'Series colours everywhere' },
  { id: 'motion',     label: 'Motion',        icon: Wind,           hint: 'Animation intensity' },
];

// ── Small building blocks ────────────────────────────────────────────────────

function Group({ title, hint, children, className }) {
  return (
    <section className={clsx('space-y-2', className)}>
      {(title || hint) && (
        <div className="px-1">
          {title && <h3 className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">{title}</h3>}
          {hint && <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{hint}</p>}
        </div>
      )}
      <div className="ios-list">{children}</div>
    </section>
  );
}

function Row({ title, sub, children, stack = false }) {
  return (
    <div className={clsx('ios-row', stack && 'flex-col items-stretch gap-2.5')}>
      <div className="min-w-0">
        <p className="ios-row-title">{title}</p>
        {sub && <p className="ios-row-sub">{sub}</p>}
      </div>
      <div className={clsx('shrink-0', stack ? 'w-full' : 'max-w-[60%]')}>{children}</div>
    </div>
  );
}

function Seg({ value, options, onChange, render, ariaLabel, className }) {
  return (
    <div className={clsx('seg flex-wrap', className)} role="group" aria-label={ariaLabel}>
      {options.map((opt) => (
        <button key={opt} type="button" className="seg-btn" aria-pressed={value === opt} onClick={() => onChange(opt)}>
          {render ? render(opt) : opt}
        </button>
      ))}
    </div>
  );
}

/** Tile picker — for options that deserve a visual (surfaces, nav, login layout…). */
function Tiles({ value, options, onChange, render, cols = 3 }) {
  return (
    <div className={clsx('grid gap-2', cols === 2 ? 'grid-cols-2' : cols === 4 ? 'grid-cols-2 sm:grid-cols-4' : 'grid-cols-2 sm:grid-cols-3')}>
      {options.map((opt) => {
        const active = value === opt;
        return (
          <button key={opt} type="button" onClick={() => onChange(opt)} aria-pressed={active}
            className={clsx('relative rounded-xl border p-2.5 text-left transition-all pressable',
              active ? 'border-primary-500 ring-2 ring-primary-500/20 bg-primary-50/50 dark:bg-primary-500/10' : 'border-gray-200 dark:border-white/10 hover:border-primary-300')}>
            {render(opt, active)}
            {active && <span className="absolute top-2 right-2 h-4 w-4 rounded-full bg-primary-600 text-on-primary inline-flex items-center justify-center"><Check className="h-2.5 w-2.5" /></span>}
          </button>
        );
      })}
    </div>
  );
}

function ColorField({ label: text, value, onChange, contrastAgainst }) {
  const [t, setT] = useState(value);
  useEffect(() => { setT(value); }, [value]);
  const valid = !!hexToRgb(t);
  const ratio = contrastAgainst && valid ? contrastRatio(t, contrastAgainst) : null;
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-sm font-medium text-gray-800 dark:text-gray-200">{text}</label>
      <div className="flex items-center gap-2">
        <label className="relative h-10 w-10 rounded-xl overflow-hidden border border-black/10 dark:border-white/10 cursor-pointer shadow-xs shrink-0" style={{ background: valid ? t : '#000' }} aria-label={`${text} picker`}>
          <input type="color" value={valid ? t : '#000000'} onChange={(e) => { setT(e.target.value); onChange(e.target.value); }} className="absolute inset-0 opacity-0 cursor-pointer" />
        </label>
        <input className={clsx('form-input font-mono text-sm w-32 py-2', !valid && 'form-input-error')} value={t}
          onChange={(e) => { let v = e.target.value.trim(); if (v && !v.startsWith('#')) v = `#${v}`; setT(v); if (hexToRgb(v)) onChange(v.toLowerCase()); }}
          placeholder="#4f46e5" spellCheck={false} />
        {ratio && (
          <span className={clsx('inline-flex items-center gap-1 text-[11px] font-medium rounded-full px-2 py-0.5',
            ratio >= 4.5 ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300' : ratio >= 3 ? 'bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300' : 'bg-red-50 text-red-700 dark:bg-red-500/15 dark:text-red-300')}
            title="Contrast of button text on this colour (WCAG)">
            <Contrast className="h-3 w-3" /> {ratio.toFixed(1)}:1 {ratio >= 4.5 ? 'AA' : ratio >= 3 ? 'AA large' : 'Low'}
          </span>
        )}
      </div>
      {!valid && <p className="form-error">Enter a 6-digit hex colour</p>}
    </div>
  );
}

/** Miniature of a theme preset, painted from its own values (not the live CSS). */
function PresetThumb({ preset, active }) {
  const v = preset.values;
  const p = buildPalette(v['organization.primary_color']);
  const a = buildPalette(v['appearance.accent_color']);
  const dark = v['appearance.mode'] === 'dark';
  const surf = DARK_SURFACES[v['appearance.dark_surface']];
  const n = NEUTRALS[v['appearance.neutral']];
  const canvas = dark ? `rgb(${surf[0]})` : `rgb(${n[50]})`;
  const panel = dark ? `rgb(${surf[2]})` : '#fff';
  const side = v['appearance.sidebar_style'] === 'brand' ? rgbToHex(p[700])
    : v['appearance.sidebar_style'] === 'dark' || dark ? `rgb(${surf[1]})` : '#fff';
  const r = { sharp: 3, soft: 5, rounded: 7, pill: 10 }[v['appearance.radius']];
  const grad = v['appearance.button_style'] === 'gradient';
  const prim = rgbToHex(p[500]), acc = rgbToHex(a[500]);
  return (
    <div className={clsx('rounded-xl overflow-hidden border', active ? 'border-primary-500' : 'border-black/5 dark:border-white/10')} style={{ background: canvas }}>
      <div className="flex h-[92px]">
        <div className="w-[26%] p-1.5 space-y-1" style={{ background: side }}>
          <div className="h-2 w-2 rounded-sm" style={{ background: grad ? `linear-gradient(135deg, ${prim}, ${acc})` : prim }} />
          {[0, 1, 2].map((i) => <div key={i} className="h-1 rounded-full" style={{ background: i === 0 ? (grad ? `linear-gradient(90deg, ${prim}, ${acc})` : `${prim}cc`) : dark || v['appearance.sidebar_style'] !== 'light' ? 'rgba(255,255,255,0.25)' : `rgb(${n[200]})` }} />)}
        </div>
        <div className="flex-1 p-1.5 space-y-1.5">
          <div className="flex gap-1">
            {[0, 1, 2].map((i) => <div key={i} className="flex-1 h-5" style={{ background: panel, borderRadius: r, boxShadow: '0 0 0 0.5px rgba(0,0,0,0.06)' }} />)}
          </div>
          <div className="flex gap-1">
            <div className="flex-1 h-9 p-1 flex items-end gap-0.5" style={{ background: panel, borderRadius: r }}>
              {[40, 70, 55, 90, 65].map((h, i) => <div key={i} className="flex-1 rounded-sm" style={{ height: `${h}%`, background: i % 2 ? acc : prim }} />)}
            </div>
            <div className="w-[38%] h-9 p-1 flex flex-col justify-between" style={{ background: panel, borderRadius: r }}>
              <div className="h-1 w-3/4 rounded-full" style={{ background: `rgb(${n[300]})` }} />
              <div className="h-2.5 w-full rounded" style={{ borderRadius: r / 2, background: grad ? `linear-gradient(90deg, ${prim}, ${acc})` : prim }} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Live previews — a miniature workspace and a miniature sign-in page, built
 * from the same classes the product uses so every setting shows up. Because
 * the preview `aside` carries `data-sidebar-root`, the sidebar/nav settings
 * paint it exactly like the real one.
 */
function WorkspacePreview({ draft, isDark }) {
  const series = chartSeries(draft, isDark);
  const bars = [62, 88, 45, 74, 96, 58, 70];
  return (
    <div className="relative rounded-2xl overflow-hidden border border-black/5 dark:border-white/10 shadow-hig" style={{ height: 320 }}>
      <div className="absolute inset-0 bg-gray-50 dark:bg-night-0" />
      <div className="absolute inset-0 flex">
        <aside data-sidebar-root className="w-[34%] shrink-0 flex flex-col border-r border-primary-100/70 bg-gradient-to-b from-white via-primary-50/40 to-accent-50/30 text-gray-700 dark:from-night-1 dark:via-night-1 dark:to-night-1 dark:text-white dark:border-white/[0.06]">
          <div className="px-2.5 h-9 flex items-center border-b border-primary-100/70 dark:border-white/[0.06]">
            <BrandLogo size="sm" appearance={draft} onDark={['dark', 'brand'].includes(draft['appearance.sidebar_style'])} nameClass="text-[11px]" />
          </div>
          <div className="p-1.5 space-y-0.5 text-[10px]">
            <p className="sb-muted px-2 pt-1 text-[8px] font-bold uppercase tracking-widest text-gray-400 dark:text-white/50">Workspace</p>
            {[['Dashboard', LayoutDashboard, true], ['Leads', TrendingUp, false], ['Contacts', Users, false], ['Reports', BarChart3, false]].map(([t, I, act]) => (
              <div key={t} className={clsx('sb-item relative flex items-center gap-2 px-2 py-1.5 rounded-xl', act && 'sb-item-active',
                act ? 'bg-gradient-to-r from-primary-500 via-mid to-accent-500 text-on-primary font-semibold shadow-primary dark:from-white/[0.09] dark:via-white/[0.09] dark:to-white/[0.09] dark:shadow-none' : 'text-gray-600 dark:text-white/80')}>
                <I className="h-3 w-3" /><span>{t}</span>{act && <span className="sb-dot ml-auto h-1 w-1 rounded-full bg-white/90" />}
              </div>
            ))}
          </div>
        </aside>
        <div className="flex-1 flex flex-col min-w-0">
          <div className="material h-9 shrink-0 border-b flex items-center justify-between px-3">
            <div className="flex items-center gap-1.5 text-[10px] text-gray-400"><Search className="h-3 w-3" /> Search</div>
            <div className="flex items-center gap-2 text-gray-400"><Bell className="h-3 w-3" /><span className="h-5 w-5 rounded-full bg-gradient-to-br from-primary-500 to-accent-500" /></div>
          </div>
          <div className="p-3 space-y-2.5 overflow-hidden">
            <div className="flex items-center justify-between">
              <div>
                <p className="widget-title text-[8px]">Dashboard</p>
                <p className="font-display font-bold text-[13px] text-gray-900 dark:text-white leading-tight">Good morning</p>
              </div>
              <div className="flex gap-1.5">
                <button type="button" className="btn-primary rounded-lg px-2.5 py-1 text-[10px] font-medium">New record</button>
                <span className="inline-flex items-center rounded-lg px-2 py-1 text-[10px] border border-gray-300 text-gray-600 dark:text-gray-300 dark:border-white/20">Export</span>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {[['Pipeline', '$1.2M'], ['Won', '68%'], ['Open', '142']].map(([k, v], i) => (
                <div key={k} className="widget widget-pad !p-2.5">
                  <p className="widget-title text-[7px]">{k}</p>
                  <p className="widget-value text-[13px] mt-0.5">{v}</p>
                  <div className="mt-1.5 h-1 rounded-full bg-gray-100 dark:bg-white/10 overflow-hidden"><div className="h-full rounded-full" style={{ width: `${[72, 68, 45][i]}%`, background: series[i] }} /></div>
                </div>
              ))}
            </div>
            <div className="grid grid-cols-5 gap-2">
              <div className="col-span-3 widget !p-2.5">
                <p className="widget-title text-[7px] mb-1.5">Revenue by month</p>
                <div className="flex items-end gap-1 h-14">
                  {bars.map((h, i) => <div key={i} className="flex-1 rounded-t" style={{ height: `${h}%`, background: series[i % series.length] }} />)}
                </div>
              </div>
              <div className="col-span-2 widget !p-2.5 space-y-1.5">
                <p className="widget-title text-[7px]">Recent</p>
                {[['Acme Ltd', 'success', 'Won'], ['Globex', 'warning', 'Review'], ['Initech', 'primary', 'New']].map(([n, tone, s]) => (
                  <div key={n} className="flex items-center justify-between text-[9px] text-gray-700 dark:text-gray-200">
                    <span className="truncate">{n}</span><Badge variant={tone} className="!px-1.5 !py-0 !text-[7px]">{s}</Badge>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function LoginPreview({ draft }) {
  const layout = draft['appearance.login_layout'];
  const name = draft['appearance.app_name'];
  const art = draft['appearance.login_image_url'];
  const Form = ({ compact }) => (
    <div className={clsx('space-y-1.5', compact ? 'w-[82%]' : 'w-full')}>
      <div className="h-1.5 w-1/3 rounded bg-gray-200 dark:bg-white/15" />
      <div className="h-5 rounded-lg border border-primary-100 bg-white/70 dark:bg-white/5 dark:border-white/10" />
      <div className="h-5 rounded-lg border border-primary-100 bg-white/70 dark:bg-white/5 dark:border-white/10" />
      <div className="btn-primary h-5 rounded-lg" />
    </div>
  );
  const Brand = () => (
    <div className="absolute inset-0 bg-gradient-to-br from-primary-600 via-mid to-accent-600">
      {art && <img src={art} alt="" className="absolute inset-0 h-full w-full object-cover opacity-50 mix-blend-luminosity" />}
      <div className="absolute -top-8 -right-8 h-24 w-24 rounded-full bg-accent-400/40 blur-2xl" />
    </div>
  );
  return (
    <div className="relative rounded-2xl overflow-hidden border border-black/5 dark:border-white/10 shadow-hig bg-white dark:bg-night-1" style={{ height: 320 }}>
      {layout === 'split' && (
        <div className="absolute inset-0 flex">
          <div className="relative w-[45%] p-4 flex flex-col justify-between text-white">
            <Brand />
            <div className="relative z-10"><BrandLogo size="sm" appearance={draft} onDark nameClass="text-[11px]" /></div>
            <p className="relative z-10 font-display font-bold text-[13px] leading-snug">{draft['appearance.login_tagline']}</p>
            <p className="relative z-10 text-[8px] text-white/60">© {new Date().getFullYear()} {name}</p>
          </div>
          <div className="flex-1 flex flex-col items-center justify-center p-5">
            <p className="font-display font-bold text-[13px] text-gray-900 dark:text-white self-start mb-3">Welcome back</p>
            <Form />
          </div>
        </div>
      )}
      {layout === 'centered' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center p-5 bg-gray-50 dark:bg-night-0">
          <BrandLogo size="lg" appearance={draft} showName={false} />
          <p className="font-display font-bold text-[13px] text-gray-900 dark:text-white mt-2">{name}</p>
          <p className="text-[8px] text-gray-500 mb-3">{draft['appearance.login_tagline']}</p>
          <div className="card p-3 w-[70%]"><Form /></div>
        </div>
      )}
      {layout === 'cover' && (
        <div className="absolute inset-0 flex items-center justify-center p-5">
          <Brand />
          <div className="relative z-10 grid grid-cols-2 gap-4 w-full items-center">
            <div className="text-white">
              <BrandLogo size="sm" appearance={draft} onDark nameClass="text-[11px]" />
              <p className="font-display font-bold text-[14px] leading-snug mt-3">{draft['appearance.login_tagline']}</p>
            </div>
            <div className="rounded-2xl p-3 bg-white/85 dark:bg-night-2/85 backdrop-blur border border-white/40"><Form /></div>
          </div>
        </div>
      )}
      {draft['appearance.show_powered_by'] !== false && <p className="absolute bottom-1.5 right-2.5 text-[7px] text-gray-400 dark:text-white/40">Powered by Genesis</p>}
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function AppearanceBuilderPage() {
  const qc = useQueryClient();
  const store = useAppearanceStore();
  const isDark = useThemeStore((s) => s.isDark);
  const [draft, setDraft] = useState(null);
  const [message, setMessage] = useState(null);
  const [section, setSection] = useState('themes');
  const [previewTab, setPreviewTab] = useState('workspace');
  const importRef = useRef(null);

  const { data, isLoading, isError } = useQuery({ queryKey: ['app-settings'], queryFn: () => settingsService.get() });
  const savedValues = useMemo(() => resolveAppearance(data?.data?.values ?? {}), [data]);

  // Start the draft from what is saved, once loaded.
  useEffect(() => { if (data && !draft) setDraft(savedValues); }, [data, savedValues, draft]);

  // Leaving the page discards an unsaved preview.
  useEffect(() => () => { if (useAppearanceStore.getState().previewing) useAppearanceStore.getState().reset(); }, []);

  const preview = (next) => { setDraft(next); store.preview(next); };
  const set = (key, value) => preview({ ...draft, [key]: value, 'appearance.theme_preset': matchPreset({ ...draft, [key]: value })?.id ?? 'custom' });
  const setMany = (patch) => { const next = { ...draft, ...patch }; preview({ ...next, 'appearance.theme_preset': matchPreset(next)?.id ?? 'custom' }); };

  const saveMut = useMutation({
    mutationFn: (values) => settingsService.update(Object.fromEntries(APPEARANCE_KEYS.map((k) => [k, values[k]]))),
    onSuccess: (res) => {
      const values = res?.data?.values ?? draft;
      store.commit(values);
      qc.invalidateQueries({ queryKey: ['app-settings'] });
      setMessage({ tone: 'success', text: 'Saved. Everyone in your organization gets this look on their next page load.' });
    },
    onError: (err) => setMessage({ tone: 'error', text: err?.response?.data?.error?.message || 'Could not save appearance.' }),
  });

  const dirty = draft && APPEARANCE_KEYS.some((k) => String(draft[k]) !== String(savedValues[k]));
  const reset = () => { setDraft(savedValues); store.reset(); setMessage(null); };
  const restoreDefaults = () => preview(resolveAppearance({ 'appearance.app_name': draft['appearance.app_name'], 'organization.logo_url': draft['organization.logo_url'], 'appearance.logo_dark_url': draft['appearance.logo_dark_url'], 'appearance.icon_url': draft['appearance.icon_url'], 'appearance.favicon_url': draft['appearance.favicon_url'] }));

  // Uploads persist immediately; fold the fresh server values into both draft and baseline.
  const onAsset = (key) => (url, serverValues) => {
    const next = { ...draft, [key]: url };
    setDraft(next);
    if (serverValues) {
      qc.setQueryData(['app-settings'], (old) => old ? { ...old, data: { ...old.data, values: serverValues } } : old);
      store.commit({ ...serverValues, ...Object.fromEntries(APPEARANCE_KEYS.filter((k) => String(next[k]) !== String(serverValues[k])).map((k) => [k, next[k]])) });
      if (dirty) store.preview(next);
    } else {
      store.preview(next);
    }
  };

  const doExport = () => {
    const file = exportTheme(draft, { name: matchPreset(draft)?.name });
    const blob = new Blob([JSON.stringify(file, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${(draft['appearance.app_name'] || 'genesis').toLowerCase().replace(/[^a-z0-9]+/g, '-')}-theme.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };
  const doImport = async (file) => {
    if (!file) return;
    try {
      const { name, values } = importTheme(await file.text());
      setMany(values);
      setMessage({ tone: 'info', text: `Imported “${name}”. Preview it, then Save to apply for everyone.` });
    } catch (err) {
      setMessage({ tone: 'error', text: err.message || 'That is not a Genesis theme file.' });
    }
  };

  if (isLoading || !draft) return <div className="p-10 text-sm text-gray-500">Loading appearance…</div>;
  if (isError) return <div className="p-10"><Alert variant="error">Could not load settings.</Alert></div>;

  const current = matchPreset(draft);
  const primary = draft['organization.primary_color'];
  const onPrimary = prefersLightText(primary) ? '#ffffff' : '#111827';

  return (
    <div className="min-h-full px-4 py-6 sm:px-6 lg:px-8 pb-28">
      <div className="max-w-[88rem] mx-auto">
        {/* Header — Apple-style large title */}
        <div className="flex flex-wrap items-end justify-between gap-4 mb-6 animate-slide-up">
          <div className="flex items-center gap-4">
            <span className="icon-chip h-12 w-12 rounded-2xl"><Palette className="h-6 w-6" /></span>
            <div>
              <p className="widget-title">Builder · Configure</p>
              <h1 className="large-title">Appearance Studio</h1>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                Make {draft['appearance.app_name'] || 'the workspace'} look like your company. Everything previews live across the whole app.
                {current ? <> Current theme: <strong className="text-gray-700 dark:text-gray-200">{current.name}</strong>.</> : <> Current theme: <strong className="text-gray-700 dark:text-gray-200">Custom</strong>.</>}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <input ref={importRef} type="file" accept="application/json,.json" className="hidden" onChange={(e) => { doImport(e.target.files?.[0]); e.target.value = ''; }} />
            <Button variant="outline" size="sm" onClick={() => importRef.current?.click()}><Upload className="w-4 h-4" /> Import</Button>
            <Button variant="outline" size="sm" onClick={doExport}><Download className="w-4 h-4" /> Export</Button>
            <Button variant="outline" size="sm" onClick={restoreDefaults}><Sparkles className="w-4 h-4" /> Product defaults</Button>
          </div>
        </div>

        {message && <Alert variant={message.tone} className="mb-4" onClose={() => setMessage(null)}>{message.text}</Alert>}

        <BuilderGuide section="/builder/appearance" />

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Section rail */}
          <nav className="lg:col-span-3 xl:col-span-2" aria-label="Appearance sections">
            <div className="ios-list lg:sticky lg:top-4">
              {SECTIONS.map(({ id, label: text, icon: Icon, hint }) => (
                <button key={id} type="button" onClick={() => setSection(id)} aria-current={section === id ? 'page' : undefined}
                  className={clsx('ios-row w-full text-left !py-2.5 transition-colors pressable',
                    section === id ? 'bg-primary-500/10' : 'hover:bg-gray-50 dark:hover:bg-white/[0.04]')}>
                  <span className="flex items-center gap-3 min-w-0">
                    <span className={clsx('h-7 w-7 rounded-lg inline-flex items-center justify-center shrink-0', section === id ? 'bg-primary-600 text-on-primary' : 'bg-gray-100 text-gray-500 dark:bg-white/10 dark:text-gray-300')}><Icon className="h-3.5 w-3.5" /></span>
                    <span className="min-w-0">
                      <span className={clsx('block text-sm leading-tight', section === id ? 'font-semibold text-primary-700 dark:text-primary-200' : 'font-medium text-gray-800 dark:text-gray-200')}>{text}</span>
                      <span className="block text-[11px] text-gray-400 truncate">{hint}</span>
                    </span>
                  </span>
                </button>
              ))}
            </div>
          </nav>

          {/* Content */}
          <div className="lg:col-span-5 xl:col-span-6 space-y-6 animate-fade-in" key={section}>
            {section === 'themes' && (
              <>
                <Group title="Theme gallery" hint="A theme sets every look setting at once — colours, shape, surfaces, type, navigation and the sign-in layout. Your name and logos stay.">
                  <div className="p-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {THEME_PRESETS.map((p) => {
                      const active = current?.id === p.id;
                      return (
                        <button key={p.id} type="button" onClick={() => preview(applyPreset(draft, p.id))}
                          className={clsx('text-left rounded-2xl p-2 border transition-all pressable', active ? 'border-primary-500 ring-2 ring-primary-500/20' : 'border-transparent hover:border-gray-200 dark:hover:border-white/10')}>
                          <PresetThumb preset={p} active={active} />
                          <div className="flex items-center justify-between mt-2 px-1">
                            <div>
                              <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">{p.name}</p>
                              <p className="text-[11px] text-gray-500 dark:text-gray-400 leading-snug">{p.tagline}</p>
                            </div>
                            {active && <CheckCircle2 className="h-4 w-4 text-primary-600 shrink-0" />}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </Group>
                <Group title="Share this look" hint="Export the look as a file to reuse it in another workspace, or import one you were sent. Names and logos are never included.">
                  <Row title="Theme file" sub={current ? `Exports “${current.name}”` : 'Exports your custom theme'}>
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" onClick={() => importRef.current?.click()}><Upload className="w-3.5 h-3.5" /> Import</Button>
                      <Button variant="secondary" size="sm" onClick={doExport}><Download className="w-3.5 h-3.5" /> Export</Button>
                    </div>
                  </Row>
                </Group>
              </>
            )}

            {section === 'colors' && (
              <>
                <Group title="Brand colours" hint="Primary drives buttons, links, focus rings, active navigation and every tinted surface. Accent ends every gradient and highlight. Pairs below are tuned so the sweep between them stays in one family.">
                  <div className="p-4 space-y-4">
                    <div className="flex flex-wrap gap-2">
                      {COLOR_PRESETS.map((p) => {
                        const active = p.primary === draft['organization.primary_color'] && p.accent === draft['appearance.accent_color'];
                        return (
                          <button key={p.name} type="button" onClick={() => setMany({ 'organization.primary_color': p.primary, 'appearance.accent_color': p.accent })}
                            className={clsx('inline-flex items-center gap-2 pl-1.5 pr-3 py-1.5 rounded-full border text-xs transition-all pressable',
                              active ? 'border-primary-500 bg-primary-50 dark:bg-primary-500/10' : 'border-gray-200 dark:border-white/10 hover:border-primary-300')}>
                            <span className="h-5 w-9 rounded-full ring-1 ring-black/5" style={{ background: `linear-gradient(90deg, ${p.primary}, ${rgbToHex(gradientMid(p.primary, p.accent)[500])}, ${p.accent})` }} />
                            {p.name}
                            {active && <Check className="w-3 h-3 text-primary-600" />}
                          </button>
                        );
                      })}
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <ColorField label="Primary colour" value={draft['organization.primary_color']} onChange={(v) => set('organization.primary_color', v)} contrastAgainst={onPrimary} />
                      <ColorField label="Accent colour" value={draft['appearance.accent_color']} onChange={(v) => set('appearance.accent_color', v)} />
                    </div>
                    <div>
                      <p className="text-xs font-medium text-gray-500 mb-1.5">Accents that pair with your primary</p>
                      <div className="flex flex-wrap gap-2">
                        {harmonies(primary).map((h) => (
                          <button key={h.name} type="button" onClick={() => set('appearance.accent_color', h.hex)} title={h.hex}
                            className="inline-flex items-center gap-2 pl-1.5 pr-2.5 py-1 rounded-full border border-gray-200 dark:border-white/10 hover:border-primary-300 text-[11px] text-gray-600 dark:text-gray-300 pressable">
                            <span className="h-4 w-4 rounded-full" style={{ background: h.hex }} /> {h.name}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="space-y-2">
                      <p className="text-xs font-medium text-gray-500">How the brand renders</p>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="rounded-xl border border-gray-200 bg-white p-2.5 space-y-2">
                          <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Light mode</p>
                          <div className="grid grid-cols-11 gap-0.5">
                            {[50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950].map((sh) => <span key={sh} className="h-5 rounded-sm" style={{ background: `rgb(var(--p-${sh}))` }} title={`primary-${sh}`} />)}
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="rounded-lg px-2.5 py-1 text-[10px] font-medium" style={{ background: `linear-gradient(90deg, rgb(var(--p-600)), rgb(var(--g-mid-600)), rgb(var(--a-600)))`, color: 'rgb(var(--on-primary))' }}>Save changes</span>
                            <span className="rounded-lg px-2.5 py-1 text-[10px] font-medium" style={{ background: 'rgb(var(--p-600))', color: 'rgb(var(--on-primary))' }}>Solid</span>
                            <span className="text-[10px] font-medium" style={{ color: 'rgb(var(--p-600))' }}>Link text</span>
                          </div>
                        </div>
                        <div className="rounded-xl border border-white/10 p-2.5 space-y-2" style={{ background: 'rgb(var(--s-2))' }}>
                          <p className="text-[10px] font-semibold uppercase tracking-wider text-white/40">Dark mode</p>
                          <div className="grid grid-cols-11 gap-0.5">
                            {[50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950].map((sh) => <span key={sh} className="h-5 rounded-sm" style={{ background: `rgb(var(--pd-${sh}))` }} title={`primary-${sh} (dark)`} />)}
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="rounded-lg px-2.5 py-1 text-[10px] font-medium" style={{ background: `linear-gradient(90deg, rgb(var(--pd-600)), rgb(var(--gd-mid-600)), rgb(var(--ad-600)))`, color: 'rgb(var(--on-primary-dark))' }}>Save changes</span>
                            <span className="rounded-lg px-2.5 py-1 text-[10px] font-medium" style={{ background: 'rgb(var(--pd-600))', color: 'rgb(var(--on-primary-dark))' }}>Solid</span>
                            <span className="text-[10px] font-medium" style={{ color: 'rgb(var(--pd-500))' }}>Link text</span>
                          </div>
                        </div>
                      </div>
                      <div className="rounded-xl overflow-hidden h-6 flex text-[9px] font-semibold text-white">
                        <span className="flex-1 flex items-center justify-center" style={{ background: 'rgb(var(--p-500))', color: 'rgb(var(--on-primary))' }}>Primary</span>
                        <span className="flex-1 flex items-center justify-center" style={{ background: 'rgb(var(--g-mid))' }}>Gradient middle</span>
                        <span className="flex-1 flex items-center justify-center" style={{ background: 'rgb(var(--a-500))', color: 'rgb(var(--on-accent))' }}>Accent</span>
                      </div>
                      <p className="text-[11px] text-gray-400">Dark mode lifts the brand a step so links and buttons keep contrast on dark surfaces. The gradient middle is derived from both colours, so every sweep reads as one brand.</p>
                    </div>
                  </div>
                </Group>
                <Group title="Neutral tone" hint="The grey behind text, borders and dividers. Graphite is Apple's near-achromatic system grey.">
                  <div className="p-3">
                    <Tiles value={draft['appearance.neutral']} options={Object.keys(NEUTRALS)} cols={4} onChange={(v) => set('appearance.neutral', v)}
                      render={(o) => (
                        <div>
                          <div className="flex gap-0.5 mb-2">{[100, 300, 500, 700, 900].map((s) => <span key={s} className="h-5 flex-1 rounded-sm" style={{ background: `rgb(${NEUTRALS[o][s]})` }} />)}</div>
                          <span className="text-xs font-medium text-gray-700 dark:text-gray-300">{label('neutral', o)}</span>
                        </div>
                      )} />
                  </div>
                </Group>
              </>
            )}

            {section === 'branding' && (
              <>
                <Group title="Identity" hint="Shown in the sidebar, browser tab, sign-in page and emails.">
                  <Row title="Application name" stack>
                    <Input value={draft['appearance.app_name']} maxLength={60} onChange={(e) => set('appearance.app_name', e.target.value)} placeholder="Acme Assurance" />
                  </Row>
                  <Row title="Logo display" sub="How the mark and name appear in the sidebar">
                    <Seg value={draft['appearance.logo_display']} options={Object.keys(LABELS.logo_display)} onChange={(v) => set('appearance.logo_display', v)} render={(o) => label('logo_display', o)} />
                  </Row>
                  <Row title="“Powered by Genesis”" sub="A small credit on the sign-in page">
                    <Toggle checked={draft['appearance.show_powered_by'] !== false} onChange={(v) => set('appearance.show_powered_by', v)} />
                  </Row>
                </Group>
                <Group title="Logos" hint="Uploads save instantly and replace the generated monogram. SVG or transparent PNG works best; a dark variant keeps you legible on dark surfaces.">
                  <div className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-5">
                    <BrandAssetUploader kind="logo" label="Logo" hint="On light surfaces" value={draft['organization.logo_url']} onChange={onAsset('organization.logo_url')} surface="light" />
                    <BrandAssetUploader kind="logo_dark" label="Logo for dark surfaces" hint="Dark mode, dark or brand sidebar" value={draft['appearance.logo_dark_url']} onChange={onAsset('appearance.logo_dark_url')} surface={draft['appearance.sidebar_style'] === 'brand' ? 'brand' : 'dark'} />
                    <div className="flex gap-5">
                      <BrandAssetUploader kind="icon" label="App icon" hint="Square mark" value={draft['appearance.icon_url']} onChange={onAsset('appearance.icon_url')} shape="square" />
                      <BrandAssetUploader kind="favicon" label="Favicon" hint="Browser tab" value={draft['appearance.favicon_url']} onChange={onAsset('appearance.favicon_url')} shape="square" />
                    </div>
                    <div className="rounded-2xl border border-gray-200 dark:border-white/10 p-3 space-y-2">
                      <p className="text-xs font-medium text-gray-500">How it reads</p>
                      <div className="rounded-xl bg-white border border-gray-100 p-3"><BrandLogo size="md" appearance={draft} /></div>
                      <div className="rounded-xl bg-night-1 p-3"><BrandLogo size="md" appearance={draft} onDark /></div>
                      <div className="rounded-xl p-3 bg-gradient-to-r from-primary-700 to-primary-800"><BrandLogo size="md" appearance={draft} onDark /></div>
                    </div>
                  </div>
                </Group>
              </>
            )}

            {section === 'layout' && (
              <>
                <Group title="Shape & density" hint="Corner radius applies to cards, inputs, buttons and dialogs. Density scales the whole interface.">
                  <Row title="Corner radius" sub="“Continuous” mirrors Apple's larger, smoother corners">
                    <Seg value={draft['appearance.radius']} options={Object.keys(RADIUS_SCALES)} onChange={(v) => set('appearance.radius', v)}
                      render={(o) => <span className="inline-flex items-center gap-1.5"><span className="h-3.5 w-3.5 border-2 border-current" style={{ borderRadius: RADIUS_SCALES[o].lg }} />{label('radius', o)}</span>} />
                  </Row>
                  <Row title="Density" sub="Base text size for everyone">
                    <Seg value={draft['appearance.density']} options={Object.keys(DENSITY_FONT_SIZE)} onChange={(v) => set('appearance.density', v)} render={(o) => label('density', o)} />
                  </Row>
                </Group>
                <Group title="Surfaces & controls">
                  <Row title="Surface style" sub="Glass is translucent and blurred; flat is quiet for dense data work; elevated is Apple's raised card" stack>
                    <Tiles value={draft['appearance.surface_style']} options={['glass', 'flat', 'elevated']} onChange={(v) => set('appearance.surface_style', v)}
                      render={(o) => (
                        <div>
                          <div className="h-12 rounded-lg mb-2 relative overflow-hidden bg-gradient-to-br from-primary-100 to-accent-100 dark:from-primary-500/20 dark:to-accent-500/20">
                            <div className={clsx('absolute inset-x-2 top-2 bottom-2 rounded-md',
                              o === 'glass' ? 'bg-white/60 backdrop-blur border border-white/70' : o === 'flat' ? 'bg-white border border-black/10' : 'bg-white shadow-hig-lg')} />
                          </div>
                          <span className="text-xs font-medium text-gray-700 dark:text-gray-300">{label('surface_style', o)}</span>
                        </div>
                      )} />
                  </Row>
                  <Row title="Primary buttons" stack>
                    <Tiles value={draft['appearance.button_style']} options={['gradient', 'solid', 'soft']} onChange={(v) => set('appearance.button_style', v)}
                      render={(o) => (
                        <div>
                          <div className={clsx('h-8 rounded-lg mb-2 flex items-center justify-center text-[11px] font-medium',
                            o === 'gradient' ? 'bg-gradient-to-r from-primary-600 via-mid to-accent-600 text-on-primary' : o === 'solid' ? 'bg-primary-600 text-on-primary' : 'bg-primary-100 text-primary-700')}>Save changes</div>
                          <span className="text-xs font-medium text-gray-700 dark:text-gray-300">{label('button_style', o)}</span>
                        </div>
                      )} />
                  </Row>
                </Group>
                <Group title="Navigation & background">
                  <Row title="Sidebar" stack>
                    <Seg value={draft['appearance.sidebar_style']} options={Object.keys(LABELS.sidebar_style)} onChange={(v) => set('appearance.sidebar_style', v)} render={(o) => label('sidebar_style', o)} />
                  </Row>
                  <Row title="Sidebar width">
                    <Seg value={draft['appearance.sidebar_width']} options={Object.keys(SIDEBAR_WIDTHS)} onChange={(v) => set('appearance.sidebar_width', v)} render={(o) => `${label('sidebar_width', o)} · ${SIDEBAR_WIDTHS[o]}`} />
                  </Row>
                  <Row title="Active item" sub="How the current page is marked in the sidebar" stack>
                    <Tiles value={draft['appearance.nav_active_style']} options={['gradient', 'pill', 'line']} onChange={(v) => set('appearance.nav_active_style', v)}
                      render={(o) => (
                        <div>
                          <div className="relative h-7 rounded-lg mb-2 flex items-center px-2 text-[10px] font-medium overflow-hidden bg-gray-50 dark:bg-white/5">
                            {o === 'gradient' && <span className="absolute inset-0.5 rounded-md bg-gradient-to-r from-primary-500 via-mid to-accent-500" />}
                            {o === 'pill' && <span className="absolute inset-0.5 rounded-md bg-primary-500/15" />}
                            {o === 'line' && <span className="absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-full bg-primary-500" />}
                            <span className={clsx('relative', o === 'gradient' ? 'text-white' : 'text-primary-700 dark:text-primary-200')}>Dashboard</span>
                          </div>
                          <span className="text-xs font-medium text-gray-700 dark:text-gray-300">{label('nav_active_style', o)}</span>
                        </div>
                      )} />
                  </Row>
                  <Row title="Page background" stack>
                    <Tiles value={draft['appearance.background']} options={['aurora', 'mesh', 'tinted', 'plain']} cols={4} onChange={(v) => set('appearance.background', v)}
                      render={(o) => (
                        <div>
                          <div className={clsx('h-10 rounded-lg mb-2 border border-black/5',
                            o === 'aurora' ? 'bg-[radial-gradient(60%_80%_at_10%_0%,rgb(var(--pc-500)/0.35),transparent),radial-gradient(60%_80%_at_100%_0%,rgb(var(--ac-500)/0.3),transparent)] bg-gray-50'
                              : o === 'mesh' ? 'bg-[radial-gradient(at_20%_20%,rgb(var(--pc-400)/0.5),transparent_50%),radial-gradient(at_80%_30%,rgb(var(--ac-400)/0.45),transparent_50%),radial-gradient(at_60%_90%,rgba(34,211,238,0.35),transparent_50%)] bg-gray-50'
                              : o === 'tinted' ? 'bg-primary-50' : 'bg-gray-50')} />
                          <span className="text-xs font-medium text-gray-700 dark:text-gray-300">{label('background', o)}</span>
                        </div>
                      )} />
                  </Row>
                </Group>
              </>
            )}

            {section === 'type' && (
              <Group title="Typography" hint="“San Francisco” uses Apple's system font on Apple devices and falls back to the platform font elsewhere. Other faces load with the app.">
                <Row title="Body typeface" stack>
                  <Tiles value={draft['appearance.font']} options={Object.keys(FONT_STACKS)} onChange={(v) => set('appearance.font', v)}
                    render={(o) => (
                      <div style={{ fontFamily: FONT_STACKS[o] }}>
                        <p className="text-xl text-gray-900 dark:text-white leading-none mb-1.5">Aa</p>
                        <p className="text-xs font-medium text-gray-700 dark:text-gray-300">{label('font', o)}</p>
                      </div>
                    )} />
                </Row>
                <Row title="Heading typeface" stack>
                  <Seg value={draft['appearance.heading_font']} options={['match', ...Object.keys(FONT_STACKS)]} onChange={(v) => set('appearance.heading_font', v)}
                    render={(o) => <span style={{ fontFamily: o === 'match' ? undefined : FONT_STACKS[o] }}>{label('heading_font', o)}</span>} />
                </Row>
                <div className="ios-row flex-col items-stretch gap-1">
                  <p className="font-display text-2xl font-bold tracking-tight text-gray-900 dark:text-white">The quick brown fox jumps over the lazy dog</p>
                  <p className="text-sm text-gray-600 dark:text-gray-300">Body copy at the current density: 0123456789 · Renewal due 14 Sep · $1,240.00</p>
                  <p className="text-xs text-gray-400">Captions and help text sit one step smaller.</p>
                </div>
              </Group>
            )}

            {section === 'mode' && (
              <>
                <Group title="Light & dark" hint="The default for new sign-ins. Users may still switch unless you turn the toggle off.">
                  <Row title="Default mode">
                    <Seg value={draft['appearance.mode']} options={['light', 'dark', 'system']} onChange={(v) => set('appearance.mode', v)}
                      render={(o) => <span className="inline-flex items-center gap-1.5">{o === 'light' ? <Sun className="w-3.5 h-3.5" /> : o === 'dark' ? <Moon className="w-3.5 h-3.5" /> : <Monitor className="w-3.5 h-3.5" />}{label('mode', o)}</span>} />
                  </Row>
                  <Row title="Dark surfaces" sub="Midnight is tinted navy; Graphite is Apple's layered grey; OLED sits on true black" stack>
                    <Tiles value={draft['appearance.dark_surface']} options={Object.keys(DARK_SURFACES)} onChange={(v) => set('appearance.dark_surface', v)}
                      render={(o) => (
                        <div>
                          <div className="h-10 rounded-lg mb-2 p-1.5 flex gap-1" style={{ background: `rgb(${DARK_SURFACES[o][0]})` }}>
                            <span className="flex-1 rounded" style={{ background: `rgb(${DARK_SURFACES[o][1]})` }} />
                            <span className="flex-1 rounded" style={{ background: `rgb(${DARK_SURFACES[o][2]})` }} />
                            <span className="flex-1 rounded" style={{ background: `rgb(${DARK_SURFACES[o][3]})` }} />
                          </div>
                          <span className="text-xs font-medium text-gray-700 dark:text-gray-300">{label('dark_surface', o)}</span>
                        </div>
                      )} />
                  </Row>
                </Group>
                <Group title="What people may personalize" hint="Each person adjusts these from the Personalize menu in the header, on their own device only.">
                  <Row title="Switch light / dark" sub="Off pins everyone to your default mode">
                    <Toggle checked={draft['appearance.allow_user_mode_toggle'] !== false} onChange={(v) => set('appearance.allow_user_mode_toggle', v)} />
                  </Row>
                  <Row title="Choose text size" sub="Small / default / large, like iOS Dynamic Type">
                    <Toggle checked={draft['appearance.allow_user_density'] !== false} onChange={(v) => set('appearance.allow_user_density', v)} />
                  </Row>
                </Group>
              </>
            )}

            {section === 'login' && (
              <>
                <Group title="Sign-in page" hint="Staff see this before they sign in. It wears the brand of the last workspace used on that device.">
                  <Row title="Layout" stack>
                    <Tiles value={draft['appearance.login_layout']} options={['split', 'centered', 'cover']} onChange={(v) => set('appearance.login_layout', v)}
                      render={(o) => (
                        <div>
                          <div className="h-12 rounded-lg mb-2 relative overflow-hidden bg-gray-100 dark:bg-white/5 border border-black/5">
                            {o === 'split' && <><span className="absolute inset-y-0 left-0 w-[45%] bg-gradient-to-br from-primary-500 to-accent-500" /><span className="absolute right-3 top-3 bottom-3 w-[35%] rounded bg-white dark:bg-white/20" /></>}
                            {o === 'centered' && <span className="absolute left-1/2 top-2 bottom-2 w-[40%] -translate-x-1/2 rounded bg-white dark:bg-white/20 shadow" />}
                            {o === 'cover' && <><span className="absolute inset-0 bg-gradient-to-br from-primary-600 to-accent-600" /><span className="absolute right-3 top-2 bottom-2 w-[35%] rounded bg-white/80" /></>}
                          </div>
                          <span className="text-xs font-medium text-gray-700 dark:text-gray-300">{label('login_layout', o)}</span>
                        </div>
                      )} />
                  </Row>
                  <Row title="Tagline" stack>
                    <Input value={draft['appearance.login_tagline']} maxLength={120} onChange={(e) => set('appearance.login_tagline', e.target.value)} help="A comma splits it into two lines; the second line gets the gradient." />
                  </Row>
                  <Row title="Footer note" stack>
                    <Input value={draft['appearance.login_footer'] || ''} maxLength={160} onChange={(e) => set('appearance.login_footer', e.target.value)} placeholder="Authorised staff only · support@company.com" />
                  </Row>
                </Group>
                <Group title="Artwork" hint="An optional photo or illustration behind the brand panel (split and cover layouts). It is tinted with your primary colour.">
                  <div className="p-4">
                    <BrandAssetUploader kind="login_image" label="Sign-in artwork" hint="JPEG, PNG or WebP up to 4 MB — landscape works best" value={draft['appearance.login_image_url']} onChange={onAsset('appearance.login_image_url')} surface="brand" />
                  </div>
                </Group>
              </>
            )}

            {section === 'charts' && (
              <Group title="Chart palette" hint="The series colours every dashboard and report chart uses. “Brand” derives the palette from your colours; “System” is Apple's.">
                <div className="p-3 grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {['vivid', 'brand', 'cupertino', ...Object.keys(CHART_PALETTES).filter((k) => !['vivid', 'cupertino'].includes(k))].map((name) => {
                    const colors = chartSeries({ ...draft, 'appearance.chart_palette': name }, isDark);
                    const active = draft['appearance.chart_palette'] === name;
                    return (
                      <button key={name} type="button" onClick={() => set('appearance.chart_palette', name)} aria-pressed={active}
                        className={clsx('rounded-xl border p-3 text-left transition-all pressable', active ? 'border-primary-500 ring-2 ring-primary-500/20 bg-primary-50/50 dark:bg-primary-500/10' : 'border-gray-200 dark:border-white/10 hover:border-primary-300')}>
                        <div className="flex items-end gap-1 h-10 mb-2">{colors.slice(0, 8).map((c, i) => <span key={c} className="flex-1 rounded-sm" style={{ background: c, height: `${45 + ((i * 37) % 55)}%` }} />)}</div>
                        <span className="text-xs font-medium text-gray-700 dark:text-gray-300">{label('chart_palette', name)}</span>
                      </button>
                    );
                  })}
                </div>
              </Group>
            )}

            {section === 'motion' && (
              <Group title="Motion" hint="Full uses spring-like transitions and hover lift. Subtle shortens them. Reduced removes animation for everyone — people can also pick this for themselves.">
                <div className="p-3">
                  <Tiles value={draft['appearance.motion']} options={['full', 'subtle', 'reduced']} onChange={(v) => set('appearance.motion', v)}
                    render={(o) => (
                      <div>
                        <div className="h-10 rounded-lg mb-2 bg-gray-50 dark:bg-white/5 flex items-center px-3 gap-1.5">
                          {[0, 1, 2].map((i) => <span key={i} className="h-2.5 w-2.5 rounded-full bg-primary-500" style={{ opacity: o === 'reduced' ? 1 : 1 - i * 0.3, transform: o === 'full' ? `translateY(${i * -3}px)` : 'none' }} />)}
                        </div>
                        <span className="text-xs font-medium text-gray-700 dark:text-gray-300">{label('motion', o)}</span>
                      </div>
                    )} />
                </div>
              </Group>
            )}
          </div>

          {/* Live preview */}
          <aside className="lg:col-span-4 xl:col-span-4">
            <div className="lg:sticky lg:top-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="seg">
                  <button type="button" className="seg-btn" aria-pressed={previewTab === 'workspace'} onClick={() => setPreviewTab('workspace')}><Laptop className="h-3.5 w-3.5" /> Workspace</button>
                  <button type="button" className="seg-btn" aria-pressed={previewTab === 'login'} onClick={() => setPreviewTab('login')}><Smartphone className="h-3.5 w-3.5" /> Sign-in</button>
                </div>
                <Badge variant="primary" dot>live</Badge>
              </div>
              {previewTab === 'workspace' ? <WorkspacePreview draft={draft} isDark={isDark} /> : <LoginPreview draft={draft} />}
              <div className="ios-list text-xs">
                <div className="ios-row !py-2"><span className="text-gray-500">Theme</span><span className="font-medium text-gray-800 dark:text-gray-200">{current?.name ?? 'Custom'}</span></div>
                <div className="ios-row !py-2"><span className="text-gray-500">Radius · density</span><span className="font-medium text-gray-800 dark:text-gray-200">{RADIUS_SCALES[draft['appearance.radius']]['2xl']} · {DENSITY_FONT_SIZE[draft['appearance.density']]}</span></div>
                <div className="ios-row !py-2"><span className="text-gray-500">Type</span><span className="font-medium text-gray-800 dark:text-gray-200" style={{ fontFamily: FONT_STACKS[draft['appearance.font']] }}>{label('font', draft['appearance.font'])}</span></div>
                <div className="ios-row !py-2"><span className="text-gray-500">Button text contrast</span>
                  <span className={clsx('inline-flex items-center gap-1 font-medium', contrastRatio(primary, onPrimary) >= 4.5 ? 'text-emerald-600' : 'text-amber-600')}>
                    {contrastRatio(primary, onPrimary) >= 4.5 ? <CheckCircle2 className="h-3.5 w-3.5" /> : <AlertTriangle className="h-3.5 w-3.5" />}
                    {contrastRatio(primary, onPrimary).toFixed(1)}:1
                  </span>
                </div>
              </div>
              <p className="text-[11px] text-gray-400 dark:text-gray-500 px-1">The whole app is the preview — open any page while editing. Nothing reaches your team until you Save.</p>
            </div>
          </aside>
        </div>
      </div>

      {/* Unsaved-changes bar (Apple-style floating action) */}
      <div className={clsx('fixed inset-x-0 bottom-5 z-40 flex justify-center px-4 pointer-events-none transition-all duration-300 ease-spring',
        dirty ? 'translate-y-0 opacity-100' : 'translate-y-6 opacity-0')} aria-hidden={!dirty}>
        <div className="popover pointer-events-auto flex items-center gap-3 pl-4 pr-2 py-2 !rounded-2xl">
          <span className="h-2 w-2 rounded-full bg-amber-500 animate-pulse" />
          <p className="text-sm text-gray-700 dark:text-gray-200">Previewing unsaved changes{current ? ` · ${current.name}` : ' · Custom'}</p>
          <div className="h-5 w-px bg-gray-200 dark:bg-white/10" />
          <Button variant="ghost" size="sm" onClick={reset} disabled={!dirty}><RotateCcw className="w-3.5 h-3.5" /> Discard</Button>
          <Button size="sm" onClick={() => saveMut.mutate(draft)} loading={saveMut.isPending} disabled={!dirty}><Save className="w-3.5 h-3.5" /> Save for everyone</Button>
        </div>
      </div>
    </div>
  );
}
