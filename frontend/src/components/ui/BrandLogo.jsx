import clsx from 'clsx';
import { useAppearanceStore } from '../../store/appearanceStore';
import { useThemeStore } from '../../store/themeStore';

/**
 * BrandLogo — the tenant's identity, everywhere it appears.
 *
 * Honours the Appearance settings: uploaded logo (with a dark-surface variant),
 * the square app icon, the display mode (mark + name / logo only / name only),
 * and the generated monogram when nothing is uploaded. Pass `onDark` when the
 * logo sits on a dark or brand-coloured surface regardless of the mode.
 *
 * Props:
 *   size      — 'sm' | 'md' | 'lg' | 'xl'   (mark height)
 *   onDark    — force the dark-surface variant (brand panel, dark sidebar)
 *   nameClass — extra classes for the wordmark text
 *   appearance — override the store (the Studio preview passes its draft)
 */
const MARK = { sm: 'h-7 w-7 text-xs', md: 'h-8 w-8 text-sm', lg: 'h-10 w-10 text-base', xl: 'h-14 w-14 text-2xl' };
const WORD = { sm: 'text-sm', md: 'text-[15px]', lg: 'text-lg', xl: 'text-2xl' };
const IMG_H = { sm: 'h-7', md: 'h-8', lg: 'h-10', xl: 'h-14' };

export default function BrandLogo({ size = 'md', onDark = false, className, nameClass, appearance, showName }) {
  const stored = useAppearanceStore((s) => s.current);
  const brandReady = useAppearanceStore((s) => s.brandReady);
  const isDark = useThemeStore((s) => s.isDark);
  const a = appearance ?? stored;

  // The workspace brand is not known yet (first visit, settings loading): a
  // neutral placeholder rather than the product default, which would flash.
  if (!appearance && !brandReady) {
    return (
      <span className={clsx('inline-flex items-center gap-2.5 min-w-0', className)} aria-hidden="true" data-brand-placeholder>
        <span className={clsx('rounded-xl animate-pulse', onDark ? 'bg-white/20' : 'bg-gray-200 dark:bg-white/10', MARK[size].split(' ').slice(0, 2).join(' '))} />
        {showName !== false && <span className={clsx('h-3 w-24 rounded animate-pulse', onDark ? 'bg-white/20' : 'bg-gray-200 dark:bg-white/10')} />}
      </span>
    );
  }

  const name = a['appearance.app_name'] || 'Genesis CRM';
  const display = a['appearance.logo_display'] || 'mark_and_name';
  const dark = onDark || isDark;
  const logo = (dark && a['appearance.logo_dark_url']) || a['organization.logo_url'] || '';
  const icon = a['appearance.icon_url'] || '';
  const wantName = showName ?? display !== 'logo_only';
  const letter = name.trim().charAt(0).toUpperCase() || 'G';

  const monogram = (
    <span className={clsx('icon-chip font-display font-bold rounded-xl', MARK[size])} aria-hidden="true">
      <span style={{ color: 'rgb(var(--on-primary))' }}>{letter}</span>
    </span>
  );

  // Logo-only: the uploaded wordmark carries the whole identity.
  if (display === 'logo_only' && logo) {
    return <img src={logo} alt={name} className={clsx(IMG_H[size], 'w-auto max-w-[160px] object-contain', className)} />;
  }

  const mark = icon
    ? <img src={icon} alt="" className={clsx(MARK[size].split(' ').slice(0, 2).join(' '), 'rounded-xl object-contain shrink-0')} />
    : (display !== 'name_only' && logo)
      ? <img src={logo} alt="" className={clsx(IMG_H[size], 'w-auto max-w-[120px] object-contain shrink-0')} />
      : display === 'name_only' ? null : monogram;

  return (
    <span className={clsx('inline-flex items-center gap-2.5 min-w-0', className)}>
      {mark}
      {wantName && (
        <span className={clsx('font-display font-bold tracking-[-0.01em] truncate', WORD[size],
          onDark ? 'text-white' : 'text-gradient dark:text-white dark:[-webkit-text-fill-color:currentColor]', nameClass)} title={name}>
          {name}
        </span>
      )}
    </span>
  );
}
