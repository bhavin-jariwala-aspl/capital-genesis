import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Sun, Moon, Monitor, SunMoon, Type, Wind, Palette, RotateCcw } from 'lucide-react';
import clsx from 'clsx';
import { useThemeStore } from '../../store/themeStore';
import { useAppearanceStore } from '../../store/appearanceStore';
import { useAuthStore } from '../../store/authStore';

/**
 * Personalize — the per-user appearance panel in the header.
 *
 * The organisation sets the look for everyone in the Appearance Studio; this
 * panel lets each person adjust what Apple exposes per user — light/dark,
 * text size and motion — within what the organisation allows. Choices persist
 * in this browser only (themeStore). Admins get a shortcut to the Studio.
 */
function Seg({ value, options, onChange, label }) {
  return (
    <div className="seg w-full" role="group" aria-label={label}>
      {options.map((o) => (
        <button key={o.value} type="button" className="seg-btn flex-1" aria-pressed={value === o.value} onClick={() => onChange(o.value)}>
          {o.icon && <o.icon className="h-3.5 w-3.5" />}
          {o.label}
        </button>
      ))}
    </div>
  );
}

function Row({ icon: Icon, title, sub, children }) {
  return (
    <div className="px-4 py-3">
      <div className="flex items-center gap-2 mb-2">
        <span className="h-6 w-6 rounded-lg bg-primary-500/10 text-primary-600 dark:text-primary-300 inline-flex items-center justify-center"><Icon className="h-3.5 w-3.5" /></span>
        <div>
          <p className="text-sm font-medium text-gray-900 dark:text-gray-100 leading-tight">{title}</p>
          {sub && <p className="text-[11px] text-gray-500 dark:text-gray-400 leading-tight">{sub}</p>}
        </div>
      </div>
      {children}
    </div>
  );
}

export default function PersonalizePanel() {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const theme = useThemeStore();
  const appearance = useAppearanceStore((s) => s.current);
  const isAdmin = useAuthStore((s) => s.isAdmin?.() ?? false);

  const allowMode    = appearance['appearance.allow_user_mode_toggle'] !== false;
  const allowDensity = appearance['appearance.allow_user_density'] !== false;

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    const onKey  = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [open]);

  const modeValue = theme.userChose ? (theme.mode ?? (theme.isDark ? 'dark' : 'light')) : 'org';
  const hasOverrides = theme.userChose || theme.density || theme.motion;
  const resetAll = () => { theme.setMode(null); theme.setDensity(null); theme.setMotion(null); useAppearanceStore.getState().reset(); };

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label="Personalize appearance"
        title="Personalize appearance"
        className={clsx('p-1.5 rounded-lg transition-colors pressable',
          open ? 'bg-primary-500/10 text-primary-600 dark:text-primary-300' : 'text-gray-400 dark:text-white/40 hover:text-gray-600 dark:hover:text-white/70 hover:bg-gray-100 dark:hover:bg-white/10')}
      >
        {theme.isDark ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
      </button>

      {open && (
        <div role="dialog" aria-label="Personalize appearance" className="popover absolute right-0 top-full mt-2 w-[19.5rem] z-50">
          <div className="px-4 pt-3.5 pb-2 flex items-center justify-between">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-primary-500/80 dark:text-primary-300/70">Personalize</p>
              <p className="text-sm font-semibold text-gray-900 dark:text-white">How {appearance['appearance.app_name']} looks for you</p>
            </div>
            <span className="icon-chip h-8 w-8"><SunMoon className="h-4 w-4" /></span>
          </div>

          <div className="hairline-t">
            {allowMode ? (
              <Row icon={SunMoon} title="Appearance" sub="Light, dark, or follow your device">
                <Seg label="Appearance" value={modeValue} onChange={(v) => theme.setMode(v === 'org' ? null : v)}
                  options={[
                    { value: 'light',  label: 'Light', icon: Sun },
                    { value: 'dark',   label: 'Dark',  icon: Moon },
                    { value: 'system', label: 'Auto',  icon: Monitor },
                  ]} />
              </Row>
            ) : (
              <Row icon={SunMoon} title="Appearance" sub="Your organization sets light or dark for everyone." />
            )}

            {allowDensity && (
              <Row icon={Type} title="Text size" sub="Scales the whole interface">
                <Seg label="Text size" value={theme.density ?? 'org'} onChange={(v) => theme.setDensity(v === 'org' ? null : v)}
                  options={[
                    { value: 'compact',     label: 'Small' },
                    { value: 'comfortable', label: 'Default' },
                    { value: 'spacious',    label: 'Large' },
                  ]} />
              </Row>
            )}

            <Row icon={Wind} title="Motion" sub="Animations and transitions">
              <Seg label="Motion" value={theme.motion ?? 'org'} onChange={(v) => theme.setMotion(v === 'org' ? null : v)}
                options={[
                  { value: 'full',    label: 'Full' },
                  { value: 'subtle',  label: 'Subtle' },
                  { value: 'reduced', label: 'Reduced' },
                ]} />
            </Row>
          </div>

          <div className="hairline-t px-4 py-2.5 flex items-center justify-between gap-2 bg-gray-50/60 dark:bg-white/[0.03]">
            <button type="button" onClick={resetAll} disabled={!hasOverrides}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-white disabled:opacity-40 transition-colors">
              <RotateCcw className="h-3 w-3" /> Use organization defaults
            </button>
            {isAdmin && (
              <Link to="/builder/appearance" onClick={() => setOpen(false)}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary-600 hover:text-primary-700 dark:text-primary-300">
                <Palette className="h-3 w-3" /> Customize for everyone
              </Link>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
