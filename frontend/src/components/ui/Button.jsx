import { forwardRef } from 'react';
import clsx from 'clsx';

/**
 * Button — the one button.
 *
 * `primary` is styled by the `.btn-primary` class in index.css so the tenant's
 * "Button style" setting (gradient / solid / soft) restyles every primary
 * action at once. The other variants are tokenised through primary and gray
 * and therefore already follow the brand and neutral tone.
 */
const VARIANTS = {
  primary:
    'btn-primary focus:ring-primary-500',
  secondary:
    'bg-white/90 text-primary-700 border border-primary-100 shadow-xs ' +
    'hover:bg-primary-50 hover:border-primary-200 focus:ring-primary-500 ' +
    'dark:bg-white/10 dark:text-gray-300 dark:border-white/20 dark:hover:bg-white/15 dark:hover:border-white/30',
  outline:
    'bg-transparent text-gray-700 border border-gray-300 ' +
    'hover:bg-gray-50 hover:border-gray-400 focus:ring-primary-500 ' +
    'dark:text-gray-300 dark:border-white/20 dark:hover:bg-white/5',
  danger:
    'bg-gradient-to-r from-red-600 to-rose-600 text-white shadow-sm ' +
    'hover:from-red-500 hover:to-rose-500 focus:ring-red-500 active:scale-[0.98]',
  warning:
    'bg-gradient-to-r from-amber-500 to-orange-500 text-white shadow-sm ' +
    'hover:from-amber-400 hover:to-orange-400 focus:ring-amber-500 active:scale-[0.98]',
  ghost:
    'bg-transparent text-gray-500 hover:bg-gray-100/80 hover:text-gray-700 focus:ring-gray-400 ' +
    'dark:text-gray-400 dark:hover:bg-white/10 dark:hover:text-gray-200',
  glass:
    'bg-white/15 text-white border border-white/25 backdrop-blur-sm shadow-sm ' +
    'hover:bg-white/25 hover:border-white/40 focus:ring-white/40 active:scale-[0.98]',
  link:
    'bg-transparent text-primary-600 hover:text-primary-700 underline-offset-2 hover:underline p-0 h-auto shadow-none',
};

const SIZES = {
  xs:   'h-7  px-2.5 text-xs gap-1    rounded-lg',
  sm:   'h-8  px-3   text-sm gap-1.5  rounded-lg',
  md:   'h-9  px-4   text-sm gap-2    rounded-xl',
  lg:   'h-10 px-5   text-sm gap-2    rounded-xl',
  xl:   'h-11 px-6   text-base gap-2  rounded-xl',
  icon: 'h-9  w-9  p-0 text-sm        rounded-xl',
};

const Button = forwardRef(function Button(
  { children, variant = 'primary', size = 'md', loading = false, className, ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      className={clsx(
        'inline-flex items-center justify-center font-medium',
        'transition-all duration-150 ease-spring focus:outline-none focus:ring-2 focus:ring-offset-1',
        'disabled:cursor-not-allowed disabled:opacity-50 select-none',
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
      disabled={loading || props.disabled}
      {...props}
    >
      {loading && (
        <svg className="animate-spin h-3.5 w-3.5 shrink-0" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
      )}
      {children}
    </button>
  );
});

export default Button;
