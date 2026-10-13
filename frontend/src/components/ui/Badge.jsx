import clsx from 'clsx';

const VARIANTS = {
  default: 'bg-gray-100 text-gray-600 ring-1 ring-gray-200/60 dark:bg-gray-800 dark:text-gray-300 dark:ring-gray-700/60',
  primary: 'bg-primary-50 text-primary-600 ring-1 ring-primary-200/60 dark:bg-primary-500/20 dark:text-primary-400 dark:ring-primary-500/30',
  success: 'bg-emerald-50 text-emerald-600 ring-1 ring-emerald-200/60 dark:bg-emerald-500/20 dark:text-emerald-400 dark:ring-emerald-500/30',
  warning: 'bg-amber-50 text-amber-600 ring-1 ring-amber-200/60 dark:bg-amber-500/20 dark:text-amber-400 dark:ring-amber-500/30',
  danger:  'bg-red-50 text-red-600 ring-1 ring-red-200/60 dark:bg-red-500/20 dark:text-red-400 dark:ring-red-500/30',
  info:    'bg-blue-50 text-blue-600 ring-1 ring-blue-200/60 dark:bg-blue-500/20 dark:text-blue-400 dark:ring-blue-500/30',
  purple:  'bg-purple-50 text-purple-600 ring-1 ring-purple-200/60 dark:bg-purple-500/20 dark:text-purple-400 dark:ring-purple-500/30',
};

const DOT_COLORS = {
  default: 'bg-gray-400',
  primary: 'bg-primary-500',
  success: 'bg-emerald-500',
  warning: 'bg-amber-500',
  danger:  'bg-red-500',
  info:    'bg-blue-500',
  purple:  'bg-purple-500',
};

export default function Badge({ children, variant = 'default', dot = false, className }) {
  return (
    <span className={clsx('badge', VARIANTS[variant] ?? VARIANTS.default, className)}>
      {dot && <span className={clsx('h-1.5 w-1.5 rounded-full shrink-0', DOT_COLORS[variant] ?? DOT_COLORS.default)} />}
      {children}
    </span>
  );
}
