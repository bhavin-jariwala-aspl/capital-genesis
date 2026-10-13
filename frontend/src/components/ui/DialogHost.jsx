import { useEffect, useId, useRef, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, CheckCircle2, Info, ShieldAlert, XCircle } from 'lucide-react';
import clsx from 'clsx';
import { getDialogs, settleDialog, subscribeDialogs } from '../../utils/dialog';
import Button from './Button';

/**
 * DialogHost — renders the dialog queue fed by `utils/dialog`.
 *
 * Mounted exactly once, at the app root. Every `showError()` / `confirmDialog()`
 * / `promptDialog()` call anywhere in the tree lands here as a modal that speaks
 * the same visual language as <Modal>: blurred scrim, rounded elevated panel,
 * a tone-coloured accent ribbon and icon chip, bottom sheet on small screens.
 * Dialogs stack, so a confirm raised from inside a modal renders above it.
 */

const TONES = {
  info: {
    Icon: Info,
    ribbon: 'bg-gradient-to-r from-primary-500 via-accent-500 to-sky2-400',
    chip: 'bg-gradient-to-br from-primary-500 via-mid to-accent-500 shadow-primary',
    halo: 'bg-primary-500/20',
    button: 'primary',
  },
  success: {
    Icon: CheckCircle2,
    ribbon: 'bg-gradient-to-r from-emerald-400 via-teal-400 to-sky2-400',
    chip: 'bg-gradient-to-br from-emerald-500 to-teal-600 shadow-[0_8px_22px_-4px_rgba(16,185,129,0.45)]',
    halo: 'bg-emerald-500/20',
    button: 'primary',
  },
  warning: {
    Icon: AlertTriangle,
    ribbon: 'bg-gradient-to-r from-amber-400 via-orange-400 to-rose-400',
    chip: 'bg-gradient-to-br from-amber-500 to-orange-600 shadow-[0_8px_22px_-4px_rgba(245,158,11,0.45)]',
    halo: 'bg-amber-500/20',
    button: 'warning',
  },
  error: {
    Icon: XCircle,
    ribbon: 'bg-gradient-to-r from-rose-500 via-red-500 to-orange-400',
    chip: 'bg-gradient-to-br from-red-500 to-rose-600 shadow-[0_8px_22px_-4px_rgba(244,63,94,0.45)]',
    halo: 'bg-rose-500/20',
    button: 'danger',
  },
  danger: {
    Icon: ShieldAlert,
    ribbon: 'bg-gradient-to-r from-rose-500 via-red-500 to-orange-400',
    chip: 'bg-gradient-to-br from-red-500 to-rose-600 shadow-[0_8px_22px_-4px_rgba(244,63,94,0.45)]',
    halo: 'bg-rose-500/20',
    button: 'danger',
  },
};

function DialogCard({ dialog, index, isTop }) {
  const { id, kind, title, message, details, confirmLabel, cancelLabel } = dialog;
  const tone = TONES[dialog.tone] || TONES.info;
  const { Icon } = tone;
  const titleId = useId();
  const scrimRef = useRef(null);
  const inputRef = useRef(null);
  const confirmRef = useRef(null);
  const [value, setValue] = useState(dialog.defaultValue ?? '');

  const isAlert = kind === 'alert';
  const cancelValue = kind === 'prompt' ? null : false;

  const close = (result) => settleDialog(id, result);

  // ESC dismisses — as a cancel for confirm/prompt, as an acknowledgement for
  // alerts. Only the topmost dialog listens, and it claims the key during the
  // capture phase so a <Modal> underneath doesn't close along with it.
  useEffect(() => {
    if (!isTop) return undefined;
    const handler = (e) => {
      if (e.key !== 'Escape') return;
      e.stopImmediatePropagation();
      close(isAlert ? true : cancelValue);
    };
    window.addEventListener('keydown', handler, true);
    return () => window.removeEventListener('keydown', handler, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, isAlert, isTop]);

  // Land focus on the field for prompts, on the primary action otherwise.
  useEffect(() => {
    const target = kind === 'prompt' ? inputRef.current : confirmRef.current;
    target?.focus();
    if (kind === 'prompt') inputRef.current?.select();
  }, [kind]);

  return createPortal(
    <div
      ref={scrimRef}
      className="fixed inset-0 flex items-end sm:items-center justify-center p-0 sm:p-4
                 bg-gray-950/45 dark:bg-black/70 backdrop-blur-md animate-fade-in motion-reduce:animate-none"
      style={{ zIndex: 60 + index }}
      onMouseDown={(e) => { if (e.target === scrimRef.current) close(isAlert ? true : cancelValue); }}
      role="alertdialog"
      aria-modal="true"
      aria-labelledby={titleId}
    >
      <div
        className="relative w-full max-w-md flex flex-col max-h-[92vh] overflow-hidden
                   bg-white dark:bg-night-2 border border-gray-200/70 dark:border-white/[0.08]
                   rounded-t-3xl sm:rounded-3xl shadow-elevated
                   animate-slide-up motion-reduce:animate-none"
      >
        <div className={clsx('h-1 w-full shrink-0', tone.ribbon)} />

        <div className="relative aurora-wash px-6 pt-6 pb-5 overflow-y-auto">
          <div className="flex flex-col items-center text-center sm:flex-row sm:items-start sm:text-left gap-4">
            <span className="relative shrink-0">
              <span className={clsx('absolute inset-0 rounded-2xl blur-lg', tone.halo)} aria-hidden="true" />
              <span className={clsx(
                'relative inline-flex h-12 w-12 items-center justify-center rounded-2xl text-white',
                tone.chip,
              )}>
                <Icon className="h-6 w-6" />
              </span>
            </span>

            <div className="min-w-0 flex-1">
              <h2 id={titleId} className="font-display text-lg font-bold tracking-tight text-gray-900 dark:text-gray-50">
                {title}
              </h2>
              {message && (
                <p className="mt-1.5 text-sm leading-relaxed text-gray-600 dark:text-gray-300 whitespace-pre-line break-words">
                  {message}
                </p>
              )}
              {details && (
                <p className="mt-2 rounded-xl bg-gray-50 dark:bg-white/[0.04] px-3 py-2 font-mono text-xs
                              text-gray-500 dark:text-gray-400 whitespace-pre-line break-words">
                  {details}
                </p>
              )}

              {kind === 'prompt' && (
                <input
                  ref={inputRef}
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); close(value.trim()); } }}
                  placeholder={dialog.placeholder}
                  className="mt-3 w-full rounded-xl border border-gray-200 dark:border-white/10
                             bg-white dark:bg-white/[0.04] px-3 py-2 text-sm text-gray-900 dark:text-gray-100
                             placeholder:text-gray-400 focus:outline-none focus:ring-4 focus:ring-primary-500/15
                             focus:border-primary-400 transition-all"
                />
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 px-6 py-4 shrink-0
                        border-t border-gray-100 dark:border-white/[0.07]
                        bg-gray-50/70 dark:bg-white/[0.02]">
          {kind !== 'alert' && (
            <Button variant="outline" onClick={() => close(cancelValue)}>{cancelLabel}</Button>
          )}
          <Button
            ref={confirmRef}
            variant={tone.button}
            onClick={() => close(kind === 'prompt' ? value.trim() : true)}
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

export default function DialogHost() {
  const dialogs = useSyncExternalStore(subscribeDialogs, getDialogs, getDialogs);

  // Lock background scrolling for as long as anything is queued.
  useEffect(() => {
    if (dialogs.length === 0) return undefined;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [dialogs.length]);

  if (dialogs.length === 0 || typeof document === 'undefined') return null;
  return dialogs.map((dialog, i) => (
    <DialogCard key={dialog.id} dialog={dialog} index={i} isTop={i === dialogs.length - 1} />
  ));
}
