import { forwardRef, useId } from 'react';
import clsx from 'clsx';

/**
 * Input — the shared text field.
 *
 * The label is tied to the control with `htmlFor`/`id`. Without that pairing a
 * screen reader announces an unlabelled edit box, clicking the label does not
 * focus the field, and `error`/`help` text is read as unrelated prose — so the
 * ids are generated here rather than being every caller's job. An explicit
 * `id` still wins, for the rare caller that manages its own.
 */
const Input = forwardRef(function Input(
  { label, error, help, required, prefix, suffix, className, wrapperClass, id, ...props },
  ref,
) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const helpId = `${inputId}-help`;
  const describedBy = [props['aria-describedby'], (error || help) ? helpId : null].filter(Boolean).join(' ') || undefined;

  return (
    <div className={clsx('group flex flex-col gap-1.5', wrapperClass)}>
      {label && (
        <label htmlFor={inputId} className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 group-focus-within:text-primary-600 dark:group-focus-within:text-primary-400 transition-colors">
          {label}
          {required && <span className="ml-0.5 text-red-500">*</span>}
        </label>
      )}
      <div className="relative flex items-center">
        {prefix && (
          <span className="absolute left-3 text-gray-400 dark:text-gray-500 select-none">{prefix}</span>
        )}
        <input
          ref={ref}
          id={inputId}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          className={clsx(
            'form-input',
            prefix && 'pl-8',
            suffix && 'pr-8',
            error && 'form-input-error',
            className,
          )}
          {...props}
        />
        {suffix && (
          <span className="absolute right-3 text-gray-400 dark:text-gray-500 select-none">{suffix}</span>
        )}
      </div>
      {error && <p id={helpId} className="form-error">{error}</p>}
      {help && !error && <p id={helpId} className="form-help">{help}</p>}
    </div>
  );
});

export default Input;
