import { Check, AlertTriangle } from 'lucide-react';
import clsx from 'clsx';

/**
 * WizardStepper — modern, metadata-driven progress navigation for wizards.
 *
 * Desktop (lg+): a vertical rail with a gradient progress spine, glowing
 * current node and check/alert states (Stripe / Linear onboarding feel).
 * Mobile: a compact segmented progress bar with a shimmering active segment
 * (Typeform / Apple-checkout feel). Both are driven purely from `steps`.
 *
 * Props:
 *   steps          — [{ id, label, description }] in display order
 *   currentStep    — active step index
 *   validatedSteps — { [idx]: true } steps the user has completed
 *   errorSteps     — { [idx]: true } steps that currently have blocking errors
 *   onStepClick    — (idx) => void; called for reachable (completed/current) steps
 */
export default function WizardStepper({
  steps = [],
  currentStep = 0,
  validatedSteps = {},
  errorSteps = {},
  onStepClick,
}) {
  if (!steps.length) return null;

  const statusOf = (idx) => {
    if (errorSteps[idx]) return 'error';
    if (validatedSteps[idx]) return 'done';
    if (idx === currentStep) return 'current';
    return 'upcoming';
  };
  const reachable = (idx) => idx <= currentStep || validatedSteps[idx];

  const completedCount = steps.reduce((n, _s, i) => n + (validatedSteps[i] ? 1 : 0), 0);
  const progressPct = Math.round(((currentStep) / Math.max(steps.length - 1, 1)) * 100);
  const doneFrac = steps.length ? completedCount / steps.length : 0;

  // Gradient progress ring geometry
  const RING_R = 26;
  const RING_C = 2 * Math.PI * RING_R;
  const ringOffset = RING_C * (1 - progressPct / 100);

  return (
    <>
      {/* ───────────── Desktop: vertical rail ───────────── */}
      <nav className="hidden lg:block" aria-label="Progress">
        <div className="relative overflow-hidden rounded-2xl border border-white/60 dark:border-white/[0.06] bg-white/55 dark:bg-white/[0.03] backdrop-blur-xl p-4 xl:p-5 shadow-soft dark:shadow-none">
          {/* Soft aurora wash so the widget feels crafted, not boxed */}
          <div className="pointer-events-none absolute -top-12 -right-8 h-28 w-28 rounded-full bg-accent-400/15 blur-3xl" aria-hidden="true" />
          <div className="pointer-events-none absolute -bottom-12 -left-8 h-28 w-28 rounded-full bg-primary-400/15 blur-3xl" aria-hidden="true" />

          {/* ── Header: compact gradient progress ring ── */}
          <div className="relative flex items-center gap-3 mb-3.5">
            <div className="relative h-11 w-11 shrink-0">
              <svg viewBox="0 0 60 60" className="h-11 w-11 -rotate-90">
                <circle cx="30" cy="30" r={RING_R} fill="none" strokeWidth="6"
                  className="stroke-gray-200/70 dark:stroke-white/10" />
                <circle cx="30" cy="30" r={RING_R} fill="none" strokeWidth="6" strokeLinecap="round"
                  stroke="url(#wiz-ring-grad)" strokeDasharray={RING_C} strokeDashoffset={ringOffset}
                  className="transition-all duration-700 ease-out" />
                <defs>
                  <linearGradient id="wiz-ring-grad" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0%" style={{ stopColor: 'rgb(var(--pc-500))' }} />
                    <stop offset="55%" style={{ stopColor: 'rgb(var(--gc-mid))' }} />
                    <stop offset="100%" style={{ stopColor: 'rgb(var(--ac-500))' }} />
                  </linearGradient>
                </defs>
              </svg>
              <span className="absolute inset-0 flex items-center justify-center text-[11px] font-bold text-gray-900 dark:text-white">
                {progressPct}%
              </span>
            </div>
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-primary-500/80 dark:text-primary-300/70">
                Progress
              </p>
              <p className="text-sm font-bold text-gray-900 dark:text-white leading-tight">
                Step {currentStep + 1} <span className="text-gray-400 dark:text-white/40 font-semibold">of {steps.length}</span>
              </p>
            </div>
          </div>

          <div className="h-px bg-gradient-to-r from-primary-200/70 via-accent-200/40 to-transparent dark:from-white/10 dark:via-white/5 mb-3.5" aria-hidden="true" />

          <ol className="relative">
            {/* Spine (track) */}
            <span
              className="absolute left-[15px] top-3 bottom-3 w-0.5 rounded-full bg-gray-200/80 dark:bg-white/10"
              aria-hidden="true"
            />
            {/* Spine (filled) */}
            <span
              className="absolute left-[15px] top-3 w-0.5 rounded-full bg-gradient-to-b from-primary-500 via-accent-500 to-primary-500 transition-all duration-500 ease-out"
              style={{ height: `calc((100% - 1.5rem) * ${doneFrac})` }}
              aria-hidden="true"
            />

            {steps.map((step, idx) => {
              const status = statusOf(idx);
              const canClick = reachable(idx) && onStepClick && idx !== currentStep;
              return (
                <li key={step.id ?? idx} className="relative flex gap-2.5 pb-3.5 last:pb-0">
                  <button
                    type="button"
                    onClick={() => canClick && onStepClick(idx)}
                    disabled={!canClick}
                    aria-current={status === 'current' ? 'step' : undefined}
                    className={clsx(
                      'relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold transition-all duration-300',
                      canClick && 'cursor-pointer hover:scale-110',
                      !canClick && 'cursor-default',
                      status === 'done' && 'bg-gradient-to-br from-primary-500 to-accent-500 text-on-primary shadow-primary',
                      status === 'current' && 'bg-white dark:bg-night-2 text-primary-600 dark:text-primary-300 ring-2 ring-primary-500 shadow-glow',
                      status === 'error' && 'bg-red-500 text-white shadow-[0_6px_16px_-4px_rgba(239,68,68,0.6)]',
                      status === 'upcoming' && 'bg-gray-100 dark:bg-white/[0.06] text-gray-400 dark:text-white/30',
                    )}
                  >
                    {status === 'done' && <Check className="h-4 w-4" strokeWidth={3} />}
                    {status === 'error' && <AlertTriangle className="h-4 w-4" />}
                    {status === 'current' && (
                      <span className="absolute inset-0 rounded-full ring-2 ring-primary-400/50 animate-ping" aria-hidden="true" />
                    )}
                    {(status === 'current' || status === 'upcoming') && <span className="relative">{idx + 1}</span>}
                  </button>

                  <button
                    type="button"
                    onClick={() => canClick && onStepClick(idx)}
                    disabled={!canClick}
                    className={clsx(
                      'flex min-h-[2rem] flex-col items-start justify-center -ml-0.5 rounded-lg px-2.5 py-1 text-left transition-all duration-300',
                      status === 'current' && 'bg-gradient-to-r from-primary-50/90 to-transparent dark:from-primary-500/[0.14] dark:to-transparent ring-1 ring-primary-100/70 dark:ring-primary-500/20',
                      canClick && status !== 'current' && 'cursor-pointer hover:bg-gray-100/50 dark:hover:bg-white/[0.04]',
                      !canClick && 'cursor-default',
                    )}
                  >
                    <span className={clsx(
                      'text-[13px] font-semibold leading-snug transition-colors',
                      status === 'current' ? 'text-gray-900 dark:text-white'
                        : status === 'error' ? 'text-red-600 dark:text-red-400'
                        : status === 'done' ? 'text-gray-700 dark:text-white/70'
                        : 'text-gray-400 dark:text-white/30',
                    )}>
                      {step.label || `Step ${idx + 1}`}
                    </span>
                    {step.description && status === 'current' && (
                      <span className="mt-0.5 text-[11px] leading-snug text-gray-400 dark:text-white/30 line-clamp-1">
                        {step.description}
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
          </ol>
        </div>
      </nav>

      {/* ───────────── Mobile: segmented bar ───────────── */}
      <div className="lg:hidden">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-semibold text-gray-900 dark:text-white">
            {steps[currentStep]?.label || `Step ${currentStep + 1}`}
          </span>
          <span className="text-xs font-medium text-primary-600 dark:text-primary-300">
            {currentStep + 1} / {steps.length}
          </span>
        </div>
        <div className="flex gap-1.5" role="progressbar" aria-valuenow={currentStep + 1} aria-valuemin={1} aria-valuemax={steps.length}>
          {steps.map((step, idx) => {
            const status = statusOf(idx);
            return (
              <button
                key={step.id ?? idx}
                type="button"
                onClick={() => reachable(idx) && onStepClick?.(idx)}
                disabled={!reachable(idx)}
                aria-label={step.label}
                className={clsx(
                  'h-1.5 flex-1 overflow-hidden rounded-full transition-colors duration-300',
                  status === 'done' && 'bg-gradient-to-r from-primary-500 to-accent-500',
                  status === 'current' && 'bg-primary-500/25',
                  status === 'error' && 'bg-red-500',
                  status === 'upcoming' && 'bg-gray-200 dark:bg-white/10',
                )}
              >
                {status === 'current' && (
                  <span className="block h-full w-2/3 rounded-full bg-gradient-to-r from-primary-500 to-accent-500 animate-shimmer bg-[length:500px_100%]" />
                )}
              </button>
            );
          })}
        </div>
        {progressPct >= 0 && (
          <p className="mt-1.5 text-[11px] text-gray-400 dark:text-white/30">
            {progressPct}% there
          </p>
        )}
      </div>
    </>
  );
}
