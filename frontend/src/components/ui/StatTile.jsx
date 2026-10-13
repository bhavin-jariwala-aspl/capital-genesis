import clsx from 'clsx';
import { TrendingUp, TrendingDown } from 'lucide-react';

/**
 * StatTile — a compact, snappy KPI widget.
 *
 * Props:
 *   icon      — lucide icon component (optional)
 *   label     — metric name
 *   value     — metric value (string | number | node)
 *   delta     — optional { value: number, suffix?: string } trend chip
 *   sub       — optional muted caption under the value (alternative to delta)
 *   tone      — accent colour: 'primary' | 'accent' | 'sky' | 'emerald' | 'amber' | 'rose'
 *   onClick   — makes the tile interactive (adds hover lift)
 *   className — extra classes
 */
const TONES = {
  primary: 'from-primary-500 to-primary-600',
  accent:  'from-accent-500 to-accent-600',
  sky:     'from-sky2-400 to-sky2-600',
  emerald: 'from-emerald-500 to-teal-600',
  amber:   'from-amber-400 to-orange-500',
  rose:    'from-rose-500 to-red-600',
};

/** Map a legacy Tailwind colour name (indigo/green/blue/…) to a StatTile tone. */
const COLOR_TO_TONE = { indigo: 'primary', green: 'emerald', blue: 'sky', amber: 'amber', red: 'rose', purple: 'accent' };
export const toneForColor = (color) => COLOR_TO_TONE[color] || 'primary';

export default function StatTile({ icon: Icon, label, value, delta, sub, tone = 'primary', onClick, className }) {
  const up = delta && Number(delta.value) >= 0;
  return (
    <div
      onClick={onClick}
      className={clsx('widget widget-pad', onClick && 'widget-hover', 'animate-slide-up', className)}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="widget-title truncate">{label}</p>
          <p className="widget-value mt-1.5">{value}</p>
        </div>
        {Icon && (
          <span className={clsx('inline-flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br text-white shadow-sm shrink-0', TONES[tone] || TONES.primary)}>
            <Icon className="h-5 w-5" />
          </span>
        )}
      </div>
      {delta == null && sub && (
        <p className="mt-2 text-xs text-gray-400 dark:text-white/30 truncate">{sub}</p>
      )}
      {delta != null && (
        <div className="mt-3 flex items-center gap-1.5">
          <span className={clsx(
            'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold',
            up ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400'
               : 'bg-rose-50 text-rose-600 dark:bg-rose-500/10 dark:text-rose-400',
          )}>
            {up ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
            {Math.abs(Number(delta.value))}{delta.suffix ?? '%'}
          </span>
          <span className="text-xs text-gray-400 dark:text-white/30">vs last period</span>
        </div>
      )}
    </div>
  );
}
