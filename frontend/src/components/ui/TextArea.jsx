import { forwardRef, useId } from 'react';
import clsx from 'clsx';

/** Label and control are paired with `htmlFor`/`id` — see the note on `Input`. */
const TextArea = forwardRef(function TextArea(
  { label, error, help, required, rows = 3, className, wrapperClass, id, ...props },
  ref,
) {
  const generatedId = useId();
  const textAreaId = id ?? generatedId;
  const helpId = `${textAreaId}-help`;
  const describedBy = [props['aria-describedby'], (error || help) ? helpId : null].filter(Boolean).join(' ') || undefined;
  return (
    <div className={clsx('group flex flex-col gap-1.5', wrapperClass)}>
      {label && (
        <label htmlFor={textAreaId} className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 group-focus-within:text-primary-600 dark:group-focus-within:text-primary-400 transition-colors">
          {label}
          {required && <span className="ml-0.5 text-red-500">*</span>}
        </label>
      )}
      <textarea
        ref={ref}
        id={textAreaId}
        rows={rows}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        className={clsx(
          'form-input resize-y min-h-[80px]',
          error && 'form-input-error',
          className,
        )}
        {...props}
      />
      {error && <p id={helpId} className="form-error">{error}</p>}
      {help && !error && <p id={helpId} className="form-help">{help}</p>}
    </div>
  );
});

export default TextArea;
