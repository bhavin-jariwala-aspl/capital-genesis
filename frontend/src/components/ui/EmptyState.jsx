import clsx from 'clsx';
import { Inbox } from 'lucide-react';

/**
 * EmptyState — an engaging, encouraging empty placeholder.
 *
 * Instead of a flat "No records found", this shows a soft gradient icon,
 * a friendly title, a nudge, and an optional call-to-action — so empty
 * screens invite the user to act rather than dead-end.
 *
 * Props:
 *   icon    — lucide icon component (defaults to Inbox)
 *   title   — headline
 *   message — supporting line
 *   action  — node (e.g. a Button) rendered below
 *   compact — tighter padding for use inside tables/cards
 */
export default function EmptyState({ icon: Icon = Inbox, title = 'Nothing here yet', message, action, compact = false, className }) {
  return (
    <div className={clsx('flex flex-col items-center justify-center text-center', compact ? 'py-10 px-4' : 'py-16 px-6', className)}>
      <div className="relative mb-4">
        <span className="absolute inset-0 rounded-2xl bg-gradient-to-br from-primary-500 to-accent-500 opacity-20 blur-xl" aria-hidden="true" />
        <span className="relative inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-primary-50 to-accent-50 dark:from-primary-500/15 dark:to-accent-500/10 ring-1 ring-primary-100/70 dark:ring-white/10">
          <Icon className="h-6 w-6 text-primary-500 dark:text-primary-300" />
        </span>
      </div>
      <h3 className="text-sm font-semibold text-gray-800 dark:text-white/80">{title}</h3>
      {message && <p className="mt-1 text-xs text-gray-400 dark:text-white/40 max-w-xs">{message}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
