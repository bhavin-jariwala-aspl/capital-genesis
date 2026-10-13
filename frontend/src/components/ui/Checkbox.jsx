import { forwardRef } from 'react';
import clsx from 'clsx';

const Checkbox = forwardRef(function Checkbox(
  { label, error, help, className, wrapperClass, ...props },
  ref,
) {
  return (
    <div className={clsx('flex flex-col gap-1', wrapperClass)}>
      <label className="flex items-center gap-2 cursor-pointer select-none">
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
        {label && <span className="text-sm text-gray-700 dark:text-gray-300">{label}</span>}
      </label>
      {error && <p className="form-error">{error}</p>}
      {help && !error && <p className="form-help">{help}</p>}
    </div>
  );
});

export default Checkbox;
