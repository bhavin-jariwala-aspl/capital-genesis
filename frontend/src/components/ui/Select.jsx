import { forwardRef, useId } from 'react';
import clsx from 'clsx';

/**
 * Custom Select component.
 * options: [{ value, label, color? }] or string[]
 *
 * Label and control are paired with `htmlFor`/`id` for the same reasons as
 * `Input` — see the note there.
 */
const Select = forwardRef(function Select(
  { label, error, help, required, options = [], placeholder, className, wrapperClass, id, ...props },
  ref,
) {
  const generatedId = useId();
  const selectId = id ?? generatedId;
  const helpId = `${selectId}-help`;
  const describedBy = [props['aria-describedby'], (error || help) ? helpId : null].filter(Boolean).join(' ') || undefined;
  const normalizedOptions = options.map((o) =>
    typeof o === 'string' ? { value: o, label: o } : o,
  );

  return (
    <div className={clsx('group flex flex-col gap-1.5', wrapperClass)}>
      {label && (
        <label htmlFor={selectId} className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 group-focus-within:text-primary-600 dark:group-focus-within:text-primary-400 transition-colors">
          {label}
          {required && <span className="ml-0.5 text-red-500">*</span>}
        </label>
      )}
      <div className="relative">
        <select
          ref={ref}
          id={selectId}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          className={clsx(
            'form-input appearance-none pr-9',
            error && 'form-input-error',
            className,
          )}
          {...props}
        >
          {placeholder && <option value="">{placeholder}</option>}
          {normalizedOptions.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500">
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </span>
      </div>
      {error && <p id={helpId} className="form-error">{error}</p>}
      {help && !error && <p id={helpId} className="form-help">{help}</p>}
    </div>
  );
});

export default Select;
