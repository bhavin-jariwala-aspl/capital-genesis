import { useQuery } from '@tanstack/react-query';
import { metadataService } from '../../services/metadata.service';
import clsx from 'clsx';

/**
 * ObjectPicker — grouped <select> over all active modules + their objects.
 *
 * value:    object id (string or number) — or the object name with valueKey="name"
 * onChange: (value: string) => void
 */
export default function ObjectPicker({
  value,
  onChange,
  label,
  placeholder = 'Select an object…',
  error,
  help,
  required,
  wrapperClass,
  className,
  disabled,
  valueKey = 'id',
}) {
  const { data, isLoading } = useQuery({
    queryKey: ['meta-modules'],
    queryFn:  () => metadataService.getModules(),
    staleTime: 5 * 60 * 1000,
  });
  const modules = data?.data ?? [];

  return (
    <div className={clsx('flex flex-col gap-1', wrapperClass)}>
      {label && (
        <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
          {label}
          {required && <span className="ml-0.5 text-red-500">*</span>}
        </label>
      )}
      <div className="relative">
        <select
          value={value ?? ''}
          onChange={e => onChange(e.target.value)}
          disabled={isLoading || disabled}
          className={clsx('form-input appearance-none pr-9', error && 'form-input-error', className)}
        >
          <option value="">
            {isLoading ? 'Loading objects…' : placeholder}
          </option>
          {modules.map(mod => (
            <optgroup key={mod.id} label={mod.label || mod.name}>
              {(mod.objects || []).map(obj => (
                <option key={obj.id} value={obj[valueKey]}>
                  {obj.label || obj.name}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500">
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </span>
      </div>
      {error  && <p className="form-error">{error}</p>}
      {help && !error && <p className="form-help">{help}</p>}
    </div>
  );
}

/**
 * useAllObjects — flat list of all objects across all modules.
 * Returns { objects, modules, isLoading } where `objects` each have a `module` back-reference.
 */
export function useAllObjects() {
  const { data, isLoading } = useQuery({
    queryKey:  ['meta-modules'],
    queryFn:   () => metadataService.getModules(),
    staleTime: 5 * 60 * 1000,
  });
  const modules = data?.data ?? [];
  const objects = modules.flatMap(mod =>
    (mod.objects || []).map(obj => ({ ...obj, module: mod }))
  );
  return { objects, modules, isLoading };
}
