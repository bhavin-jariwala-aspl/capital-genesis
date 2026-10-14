import { CheckCircle2, Circle, ChevronRight } from 'lucide-react';
import clsx from 'clsx';

/**
 * StatusStepper — a generic, reusable status pipeline/stepper component.
 *
 * Renders an ordered list of status stages with visual indicators showing
 * which stages are completed, which is current, and which are upcoming.
 *
 * Can be used anywhere a status workflow exists (cases, deals,
 * orders, documents, etc.) and is fully metadata-driven.
 *
 * Props:
 *   stages       — array of { value, label, color? } (ordered)
 *   currentValue — the current status value (string)
 *   onChange     — optional (value) => void callback when a stage is clicked
 *   size         — 'sm' | 'md' | 'lg' (default 'md')
 *   variant      — 'bar' | 'pills' | 'steps' (default 'bar')
 *   showCounts   — optional { [value]: number } to show counts per stage
 *   className    — additional classes
 */
export default function StatusStepper({
  stages = [],
  currentValue,
  onChange,
  size = 'md',
  variant = 'bar',
  showCounts,
  subLabels,        // optional { [value]: string } — small text under each step (e.g. date/time reached)
  className,
}) {
  if (!stages.length) return null;

  const currentIdx = stages.findIndex(s => s.value === currentValue);

  if (variant === 'pills') {
    return (
      <div className={clsx('flex flex-wrap gap-2', className)}>
        {stages.map((stage, i) => {
          const isActive = stage.value === currentValue;
          const isPast = i < currentIdx;
          return (
            <button
              key={stage.value}
              type="button"
              onClick={() => onChange?.(stage.value)}
              disabled={!onChange}
              className={clsx(
                'inline-flex items-center gap-1.5 rounded-full border px-3 font-medium transition-all',
                size === 'sm' ? 'py-1 text-[10px]' : size === 'lg' ? 'py-2 text-sm' : 'py-1.5 text-xs',
                isActive
                  ? 'border-transparent text-white shadow-sm'
                  : isPast
                    ? 'border-gray-200 dark:border-white/10 bg-gray-50 dark:bg-white/5 text-gray-500 dark:text-white/50'
                    : 'border-gray-200 dark:border-white/10 bg-white dark:bg-white/[0.02] text-gray-400 dark:text-white/30',
                onChange && 'cursor-pointer hover:shadow-sm',
                !onChange && 'cursor-default',
              )}
              style={isActive ? { backgroundColor: stage.color || 'rgb(var(--pc-500))' } : undefined}
            >
              {isPast && <CheckCircle2 className="h-3 w-3" />}
              {isActive && <Circle className="h-3 w-3 fill-current" />}
              {stage.label}
              {showCounts?.[stage.value] != null && (
                <span className={clsx(
                  'ml-1 rounded-full px-1.5 font-bold',
                  isActive ? 'bg-white/20' : 'bg-gray-100 dark:bg-white/10 text-gray-500 dark:text-white/50',
                )}>
                  {showCounts[stage.value]}
                </span>
              )}
            </button>
          );
        })}
      </div>
    );
  }

  if (variant === 'steps') {
    return (
      <div className={clsx('flex items-center', className)}>
        {stages.map((stage, i) => {
          const isActive = stage.value === currentValue;
          const isPast = i < currentIdx;
          const isLast = i === stages.length - 1;
          return (
            <div key={stage.value} className="flex items-center">
              <button
                type="button"
                onClick={() => onChange?.(stage.value)}
                disabled={!onChange}
                className={clsx(
                  'flex items-center gap-2 transition-all',
                  onChange && 'cursor-pointer',
                  !onChange && 'cursor-default',
                )}
              >
                <div
                  className={clsx(
                    'flex items-center justify-center rounded-full border-2 font-bold transition-all',
                    size === 'sm' ? 'h-6 w-6 text-[10px]' : size === 'lg' ? 'h-10 w-10 text-sm' : 'h-8 w-8 text-xs',
                    isActive
                      ? 'border-transparent text-white shadow-sm'
                      : isPast
                        ? 'border-transparent bg-green-100 dark:bg-green-500/20 text-green-600 dark:text-green-400'
                        : 'border-gray-200 dark:border-white/15 bg-white dark:bg-white/5 text-gray-400 dark:text-white/30',
                  )}
                  style={isActive ? { backgroundColor: stage.color || 'rgb(var(--pc-500))', borderColor: stage.color || 'rgb(var(--pc-500))' } : undefined}
                >
                  {isPast ? <CheckCircle2 className={size === 'sm' ? 'h-3 w-3' : 'h-4 w-4'} /> : i + 1}
                </div>
                <span className="flex flex-col items-start leading-tight">
                  <span className={clsx(
                    'font-medium whitespace-nowrap',
                    size === 'sm' ? 'text-[10px]' : size === 'lg' ? 'text-sm' : 'text-xs',
                    isActive ? 'text-gray-900 dark:text-white' : 'text-gray-500 dark:text-white/50',
                  )}>
                    {stage.label}
                  </span>
                  {subLabels?.[stage.value] && (
                    <span className="mt-0.5 text-[10px] whitespace-nowrap text-gray-400 dark:text-white/40">
                      {subLabels[stage.value]}
                    </span>
                  )}
                </span>
              </button>
              {!isLast && (
                <ChevronRight className={clsx(
                  'mx-2 text-gray-300 dark:text-white/15 shrink-0',
                  size === 'sm' ? 'h-3 w-3' : 'h-4 w-4',
                )} />
              )}
            </div>
          );
        })}
      </div>
    );
  }

  // Default: 'bar' variant — horizontal bar showing distribution
  const total = showCounts ? Object.values(showCounts).reduce((a, b) => a + b, 0) : 0;
  return (
    <div className={clsx('space-y-2', className)}>
      {/* Progress bar */}
      <div className="flex h-2 rounded-full overflow-hidden bg-gray-100 dark:bg-white/10">
        {stages.map((stage) => {
          const count = showCounts?.[stage.value] || 0;
          const pct = total > 0 ? (count / total) * 100 : 100 / stages.length;
          return (
            <div
              key={stage.value}
              className="transition-all duration-300"
              style={{
                width: `${pct}%`,
                backgroundColor: stage.color || 'rgb(var(--pc-500))',
                opacity: stage.value === currentValue ? 1 : 0.4,
              }}
            />
          );
        })}
      </div>
      {/* Labels */}
      <div className="flex flex-wrap gap-3">
        {stages.map((stage) => {
          const isActive = stage.value === currentValue;
          return (
            <button
              key={stage.value}
              type="button"
              onClick={() => onChange?.(stage.value)}
              disabled={!onChange}
              className={clsx(
                'flex items-center gap-1.5 transition-all',
                onChange && 'cursor-pointer hover:opacity-80',
                !onChange && 'cursor-default',
              )}
            >
              <div
                className="h-2.5 w-2.5 rounded-full shrink-0"
                style={{ backgroundColor: stage.color || 'rgb(var(--pc-500))', opacity: isActive ? 1 : 0.4 }}
              />
              <span className={clsx(
                'text-xs font-medium',
                isActive ? 'text-gray-900 dark:text-white' : 'text-gray-500 dark:text-white/50',
              )}>
                {stage.label}
              </span>
              {showCounts?.[stage.value] != null && (
                <span className="text-xs text-gray-400 dark:text-white/30">
                  ({showCounts[stage.value]})
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
