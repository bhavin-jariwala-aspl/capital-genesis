import clsx from 'clsx';
import { AlertCircle, CheckCircle, Info, AlertTriangle, X } from 'lucide-react';

const ICONS = {
  info:    Info,
  success: CheckCircle,
  warning: AlertTriangle,
  error:   AlertCircle,
};

const STYLES = {
  info:    'bg-blue-50/80 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 border-l-2 border-blue-400 dark:border-blue-500 ring-1 ring-blue-100 dark:ring-blue-800/40',
  success: 'bg-emerald-50/80 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300 border-l-2 border-emerald-400 dark:border-emerald-500 ring-1 ring-emerald-100 dark:ring-emerald-800/40',
  warning: 'bg-amber-50/80 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300 border-l-2 border-amber-400 dark:border-amber-500 ring-1 ring-amber-100 dark:ring-amber-800/40',
  error:   'bg-red-50/80 dark:bg-red-900/20 text-red-700 dark:text-red-300 border-l-2 border-red-400 dark:border-red-500 ring-1 ring-red-100 dark:ring-red-800/40',
};

export default function Alert({ type, variant, title, children, onClose, dismissible, onDismiss, className }) {
  // Accept both `type` and `variant` prop names; callers may use either
  const resolvedType = type || variant || 'info';
  const handleClose = onClose || onDismiss;
  const Icon = ICONS[resolvedType] || Info;
  return (
    <div className={clsx('flex gap-3 p-3.5 rounded-xl', STYLES[resolvedType] ?? STYLES.info, className)}>
      <Icon className="h-4.5 w-4.5 shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0">
        {title && <p className="font-semibold text-sm mb-0.5">{title}</p>}
        {children && <p className="text-sm opacity-90 leading-snug">{children}</p>}
      </div>
      {(handleClose || dismissible) && (
        <button onClick={handleClose} className="shrink-0 p-0.5 rounded-md hover:bg-black/5 dark:hover:bg-white/10 transition-colors">
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}
