import clsx from 'clsx';

/**
 * Card — surface with optional header, body, and footer slots.
 *
 * Props:
 *   title    — header title (string | node)
 *   subtitle — small muted line under the title (optional)
 *   icon     — lucide icon component; renders a gradient chip in the header
 *   actions  — node aligned right in the header
 *   accent   — when true, adds a thin gradient ribbon along the top edge
 *   hover    — when true, lifts on hover (for clickable cards)
 *   noPad    — drop body padding
 */
export default function Card({ title, subtitle, icon: Icon, actions, children, className, bodyClass, noPad = false, accent = false, hover = false }) {
  return (
    <div className={clsx('card', accent && 'widget-accent overflow-hidden', hover && 'widget-hover', className)}>
      {(title || actions || Icon) && (
        <div className="card-header">
          <div className="flex items-center gap-3 min-w-0">
            {Icon && (
              <span className="icon-chip h-9 w-9">
                <Icon className="h-4 w-4" />
              </span>
            )}
            {(title || subtitle) && (
              <div className="min-w-0">
                {title && <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200 truncate">{title}</h3>}
                {subtitle && <p className="text-xs text-gray-400 dark:text-white/40 truncate">{subtitle}</p>}
              </div>
            )}
          </div>
          {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
        </div>
      )}
      <div className={clsx(!noPad && 'card-body', bodyClass)}>{children}</div>
    </div>
  );
}
