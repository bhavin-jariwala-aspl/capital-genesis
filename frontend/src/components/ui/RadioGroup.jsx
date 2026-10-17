import { forwardRef } from 'react';
import clsx from 'clsx';

/**
 * RadioGroup component.
 * options: [{ value, label }]
 */
const RadioGroup = forwardRef(function RadioGroup(
  { label, error, help, required, options = [], value, onChange, name, className, wrapperClass },
  ref,
) {
  return (
    <div className={clsx('group flex flex-col gap-1.5', wrapperClass)}>
      {label && (
        <label className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 group-focus-within:text-primary-600 dark:group-focus-within:text-primary-400 transition-colors">
          {label}
          {required && <span className="ml-0.5 text-red-500">*</span>}
        </label>
      )}
      <div className={clsx('flex flex-wrap gap-x-4 gap-y-2', className)}>
        {options.map((o) => {
          const opt = typeof o === 'string' ? { value: o, label: o } : o;
          return (
            <label key={opt.value} className="flex items-center gap-2 cursor-pointer select-none">
              <input
                ref={ref}
                type="radio"
                name={name}
                value={opt.value}
                checked={value === opt.value}
                onChange={() => onChange?.(opt.value)}
                className="h-4 w-4 border-gray-300 dark:border-gray-600 text-primary-600 focus:ring-primary-500 focus:ring-offset-0"
              />
              <span className="text-sm text-gray-700 dark:text-gray-300">{opt.label}</span>
            </label>
          );
        })}
      </div>
      {error && <p className="form-error">{error}</p>}
      {help && !error && <p className="form-help">{help}</p>}
    </div>
  );
});

export default RadioGroup;
