import { forwardRef } from 'react';
import clsx from 'clsx';

/**
 * Checkbox. `stacked` puts the label above the box in the form-field label
 * style (Input, Select…), so a yes/no field lines up with the fields beside it
 * on a record form; without it the label sits inline after the box.
 */
const Checkbox = forwardRef(function Checkbox(
  { label, error, help, className, wrapperClass, stacked = false, ...props },
  ref,
) {
  const box = (
    <input
      ref={ref}
      type="checkbox"
      className={clsx(
        'h-4 w-4 rounded border-gray-300 dark:border-gray-600 text-primary-600',
        'focus:ring-primary-500 focus:ring-offset-0',
        className,
      )}
      {...props}
    />
  );
  if (stacked) {
    return (
      <div className={clsx('group flex flex-col gap-1.5', wrapperClass)}>
        {label && <label htmlFor={props.id} className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 group-focus-within:text-primary-600 dark:group-focus-within:text-primary-400 transition-colors">{label}</label>}
        <div className="flex h-[42px] items-center">{box}</div>
        {error && <p className="form-error">{error}</p>}
        {help && !error && <p className="form-help">{help}</p>}
      </div>
    );
  }
  return (
    <div className={clsx('flex flex-col gap-1', wrapperClass)}>
      <label className="flex items-center gap-2 cursor-pointer select-none">
        {box}
        {label && <span className="text-sm text-gray-700 dark:text-gray-300">{label}</span>}
      </label>
      {error && <p className="form-error">{error}</p>}
      {help && !error && <p className="form-help">{help}</p>}
    </div>
  );
});

export default Checkbox;
