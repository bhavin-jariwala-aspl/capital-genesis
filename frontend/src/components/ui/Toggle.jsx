import clsx from 'clsx';

/**
 * Modern iOS-style switch. Controlled via `checked` / `onChange(nextBool)`.
 * Optional `label` + `description` render a titled row with the switch on the right.
 *
 *   <Toggle checked={soft} onChange={setSoft} label="Soft delete" description="…" />
 */
export default function Toggle({
  checked = false,
  onChange,
  label,
  description,
  disabled = false,
  size = 'md',
  className,
  id,
}) {
  const dims = size === 'sm'
    ? { track: 'h-5 w-9', knob: 'h-4 w-4', on: 'translate-x-4' }
    : { track: 'h-6 w-11', knob: 'h-5 w-5', on: 'translate-x-5' };

  const sw = (
    <button
      type="button"
      role="switch"
      id={id}
      aria-checked={checked}
      disabled={disabled}
      onClick={() => !disabled && onChange?.(!checked)}
      className={clsx(
        'relative inline-flex shrink-0 items-center rounded-full transition-colors duration-200',
        'focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 dark:focus:ring-offset-night-2',
        dims.track,
        checked ? 'bg-primary-600' : 'bg-gray-300 dark:bg-white/15',
        disabled && 'opacity-50 cursor-not-allowed',
      )}
    >
      <span
        className={clsx(
          'inline-block transform rounded-full bg-white shadow ring-0 transition duration-200',
          dims.knob,
          checked ? dims.on : 'translate-x-0.5',
        )}
      />
    </button>
  );

  if (!label && !description) return <span className={className}>{sw}</span>;

  return (
    <div className={clsx('flex items-center justify-between gap-4', className)}>
      <div className="min-w-0">
        {label && (
          <label htmlFor={id} className="block text-sm font-medium text-gray-800 dark:text-white/80">
            {label}
          </label>
        )}
        {description && (
          <p className="text-[11px] leading-4 text-gray-400">{description}</p>
        )}
      </div>
      {sw}
    </div>
  );
}
