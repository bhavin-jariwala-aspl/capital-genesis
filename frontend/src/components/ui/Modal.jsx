import { useEffect, useRef, useId } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import clsx from 'clsx';

const SIZES = {
  sm:  'max-w-sm',
  md:  'max-w-lg',
  lg:  'max-w-2xl',
  xl:  'max-w-4xl',
  full:'max-w-[95vw]',
};

/**
 * Modal — the shared dialog surface for the whole app.
 *
 * A contemporary, "widget-language" dialog: a blurred scrim, a rounded panel with
 * a brand accent ribbon, an aurora-washed header (optional gradient icon chip,
 * eyebrow, title, subtitle), a scroll-contained body, and a tinted footer. On
 * small screens it becomes a bottom sheet. Motion is subtle and respects
 * `prefers-reduced-motion`.
 *
 * Backwards compatible — existing callers pass `title` / `children` / `footer` /
 * `size` / `onClose` and get the new look for free. New optional props:
 *   - icon     : a lucide icon component, shown in a gradient chip
 *   - eyebrow  : small uppercase label above the title
 *   - subtitle : muted line under the title
 *   - accent   : show the top gradient ribbon (default true)
 *   - hideClose: hide the × button
 */
export default function Modal({
  open,
  isOpen,
  onClose,
  title,
  eyebrow,
  subtitle,
  icon: Icon,
  children,
  footer,
  size = 'md',
  accent = true,
  hideClose = false,
  closeOnBackdrop = true,
  className,
}) {
  const visible = open ?? isOpen;
  const overlayRef = useRef(null);
  const titleId = useId();

  // ESC key to close
  useEffect(() => {
    if (!visible) return undefined;
    const handler = (e) => { if (e.key === 'Escape') onClose?.(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [visible, onClose]);

  // Prevent body scroll while open (restore the prior value, not a hard-coded '')
  useEffect(() => {
    if (!visible) return undefined;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [visible]);

  if (!visible || typeof document === 'undefined') return null;

  const hasHeader = title || eyebrow || Icon || (!hideClose && onClose);

  // Render into <body> via a portal so the fixed scrim is positioned against the
  // viewport — never trapped inside a page ancestor that has a transform/filter
  // (which would leave the header/sidebar uncovered). Guarantees full-height cover.
  return createPortal(
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4
                 bg-gray-950/45 dark:bg-black/70 backdrop-blur-md animate-fade-in motion-reduce:animate-none"
      onClick={(e) => { if (closeOnBackdrop && e.target === overlayRef.current) onClose?.(); }}
      role="dialog"
      aria-modal="true"
      aria-labelledby={title ? titleId : undefined}
    >
      <div
        className={clsx(
          'relative w-full flex flex-col max-h-[92vh] overflow-hidden',
          'bg-white dark:bg-night-2 border border-gray-200/70 dark:border-white/[0.08]',
          'rounded-t-3xl sm:rounded-3xl shadow-elevated',
          'animate-slide-up motion-reduce:animate-none',
          SIZES[size] || size,
          className,
        )}
      >
        {/* Brand accent ribbon */}
        {accent && (
          <div className="h-1 w-full shrink-0 bg-gradient-to-r from-primary-500 via-accent-500 to-sky2-400" />
        )}

        {/* Header */}
        {hasHeader && (
          <div className="relative flex items-start gap-3 px-6 pt-5 pb-4 shrink-0
                          border-b border-gray-100 dark:border-white/[0.07] aurora-wash">
            {Icon && (
              <span className="icon-chip h-10 w-10 mt-0.5">
                <Icon className="h-5 w-5" />
              </span>
            )}
            {(title || eyebrow || subtitle) && (
              <div className="min-w-0 flex-1">
                {eyebrow && <p className="widget-title mb-0.5">{eyebrow}</p>}
                {title && (
                  <h2 id={titleId} className="font-display text-lg font-bold tracking-tight text-gray-900 dark:text-gray-50">
                    {title}
                  </h2>
                )}
                {subtitle && <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">{subtitle}</p>}
              </div>
            )}
            {!hideClose && onClose && (
              <button
                onClick={onClose}
                aria-label="Close"
                className="ml-auto -mr-1.5 -mt-1 shrink-0 p-2 rounded-full text-gray-400
                           hover:text-gray-700 dark:hover:text-gray-100
                           hover:bg-gray-100 dark:hover:bg-white/10
                           hover:rotate-90 focus:outline-none focus:ring-4 focus:ring-primary-500/15
                           transition-all duration-200 motion-reduce:transition-none motion-reduce:hover:rotate-0"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        )}

        {/* Body */}
        <div className="overflow-y-auto flex-1 px-6 py-5">{children}</div>

        {/* Footer */}
        {footer && (
          <div className="flex items-center justify-end gap-2 px-6 py-4 shrink-0
                          border-t border-gray-100 dark:border-white/[0.07]
                          bg-gray-50/70 dark:bg-white/[0.02]">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
