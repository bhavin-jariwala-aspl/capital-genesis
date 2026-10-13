import clsx from 'clsx';

/**
 * PageHeader — a modern, widget-ized page title block.
 *
 * A gradient icon chip + title + optional subtitle, with an actions slot on
 * the right and a soft aurora wash. Drop it at the top of any page for a
 * consistent, engaging header without bespoke markup.
 *
 * Props:
 *   icon      — a lucide icon component (optional)
 *   title     — string | node
 *   subtitle  — string | node (optional)
 *   actions   — node rendered on the right (buttons, etc.)
 *   eyebrow   — small uppercase label above the title (optional)
 *   className — extra classes on the wrapper
 */
export default function PageHeader({ icon: Icon, title, subtitle, actions, eyebrow, className }) {
  return (
    <div className={clsx('widget widget-accent aurora-wash px-5 py-4 sm:px-6 sm:py-5 mb-6 animate-slide-up', className)}>
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3.5 min-w-0">
          {Icon && (
            <span className="icon-chip h-11 w-11">
              <Icon className="h-5 w-5" />
            </span>
          )}
          <div className="min-w-0">
            {eyebrow && <p className="widget-title mb-0.5">{eyebrow}</p>}
            <h1 className="text-xl sm:text-2xl font-display font-bold tracking-tight text-gray-900 dark:text-white truncate">
              {title}
            </h1>
            {subtitle && (
              <p className="text-sm text-gray-500 dark:text-white/50 mt-0.5 truncate">{subtitle}</p>
            )}
          </div>
        </div>
        {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
      </div>
    </div>
  );
}
