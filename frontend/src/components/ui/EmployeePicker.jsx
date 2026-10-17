import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { authService } from '../../services/auth.service';
import { X, ChevronDown, Search, User } from 'lucide-react';
import clsx from 'clsx';

function useEmployees() {
  return useQuery({
    queryKey: ['employees-picker'],
    queryFn:  () => authService.getEmployees(),
    staleTime: 5 * 60 * 1000,
    retry: false, // Don't retry on 403 (non-admin users)
  });
}

/**
 * EmployeePicker — single-employee selector.
 * Falls back to a plain text input if the employee list isn't accessible (non-admin).
 */
export function EmployeePicker({
  value,
  onChange,
  label,
  placeholder = 'Select employee…',
  error,
  help,
  required,
  wrapperClass,
  disabled,
}) {
  const { data: employees, isLoading, isError } = useEmployees();

  const inner = isError ? (
    <input
      type="text"
      value={value ?? ''}
      onChange={e => onChange(e.target.value)}
      placeholder="Employee ID (e.g. EMP-001)"
      className={clsx('form-input', error && 'form-input-error')}
      disabled={disabled}
    />
  ) : (
    <div className="relative">
      <select
        value={value ?? ''}
        onChange={e => onChange(e.target.value)}
        disabled={isLoading || disabled}
        className={clsx('form-input appearance-none pr-9', error && 'form-input-error')}
      >
        <option value="">
          {isLoading ? 'Loading employees…' : placeholder}
        </option>
        {(employees ?? []).map(emp => (
          <option key={emp.employee_id} value={emp.employee_id}>
            {emp.employee_name} ({emp.employee_id})
          </option>
        ))}
      </select>
      <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500">
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </span>
    </div>
  );

  return (
    <div className={clsx('group flex flex-col gap-1.5', wrapperClass)}>
      {label && (
        <label className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 group-focus-within:text-primary-600 dark:group-focus-within:text-primary-400 transition-colors">
          {label}
          {required && <span className="ml-0.5 text-red-500">*</span>}
        </label>
      )}
      {inner}
      {error  && <p className="form-error">{error}</p>}
      {help && !error && <p className="form-help">{help}</p>}
    </div>
  );
}

/**
 * EmployeeMultiPicker — checkbox dropdown with badge-style display for pool selection.
 * Falls back to space-separated text input if employee list isn't accessible.
 */
export function EmployeeMultiPicker({
  value = [],
  onChange,
  label,
  help,
  wrapperClass,
  placeholder = 'Select pool members…',
}) {
  const { data: employees, isLoading, isError } = useEmployees();
  const [open, setOpen] = useState(false);

  const toggle = (id) =>
    onChange(value.includes(id) ? value.filter(v => v !== id) : [...value, id]);

  const selectedEmps = (employees ?? []).filter(e => value.includes(e.employee_id));

  if (isError) {
    return (
      <div className={clsx('flex flex-col gap-1', wrapperClass)}>
        {label && <label className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 group-focus-within:text-primary-600 dark:group-focus-within:text-primary-400 transition-colors">{label}</label>}
        <input
          type="text"
          value={value.join(' ')}
          onChange={e => onChange(e.target.value.split(/[\s,]+/).filter(Boolean))}
          placeholder="EMP-001 EMP-002 EMP-003"
          className="form-input"
        />
        {help && <p className="form-help">{help}</p>}
      </div>
    );
  }

  return (
    <div className={clsx('flex flex-col gap-1', wrapperClass)}>
      {label && <label className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 group-focus-within:text-primary-600 dark:group-focus-within:text-primary-400 transition-colors">{label}</label>}
      <div className="relative">
        <button
          type="button"
          onClick={() => setOpen(o => !o)}
          className="form-input text-left flex items-center justify-between gap-2 w-full min-h-[42px] h-auto py-2"
        >
          <span className="flex flex-wrap gap-1 flex-1 min-w-0">
            {selectedEmps.length === 0 ? (
              <span className="text-gray-400 text-sm">
                {isLoading ? 'Loading employees…' : placeholder}
              </span>
            ) : (
              selectedEmps.map(emp => (
                <span
                  key={emp.employee_id}
                  className="inline-flex items-center gap-1 bg-primary-50 text-primary-700 dark:bg-primary-500/20 dark:text-primary-400 text-xs px-2 py-0.5 rounded-full border border-primary-200 dark:border-primary-500/30"
                >
                  {emp.employee_name}
                  <button
                    type="button"
                    onClick={e => { e.stopPropagation(); toggle(emp.employee_id); }}
                    className="hover:text-red-500 transition-colors"
                  >
                    <X className="w-2.5 h-2.5" />
                  </button>
                </span>
              ))
            )}
          </span>
          <ChevronDown className={clsx(
            'w-4 h-4 text-gray-400 shrink-0 transition-transform duration-150',
            open && 'rotate-180'
          )} />
        </button>

        {open && (
          <>
            <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
            <div className="absolute z-20 top-full mt-1 left-0 right-0 bg-white dark:bg-night-2 border border-gray-200 dark:border-white/[0.07] rounded-xl shadow-lg py-1 max-h-52 overflow-y-auto">
              {(employees ?? []).length === 0 && (
                <p className="px-3 py-2 text-sm text-gray-400">No employees found</p>
              )}
              {(employees ?? []).map(emp => (
                <label
                  key={emp.employee_id}
                  className="flex items-center gap-2.5 px-3 py-2 hover:bg-gray-50 dark:hover:bg-white/5 cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={value.includes(emp.employee_id)}
                    onChange={() => toggle(emp.employee_id)}
                    className="rounded border-gray-300 text-primary-600"
                  />
                  <span className="text-sm text-gray-700 dark:text-gray-300 flex-1">{emp.employee_name}</span>
                  <span className="text-xs text-gray-400">{emp.employee_id}</span>
                </label>
              ))}
            </div>
          </>
        )}
      </div>
      {help && <p className="form-help">{help}</p>}
    </div>
  );
}

/** The tenant's active staff (id + name) — readable by every signed-in user. */
function useStaff() {
  return useQuery({
    queryKey: ['staff-directory'],
    queryFn:  () => authService.getStaff(),
    staleTime: 5 * 60 * 1000,
    retry: false,
  });
}

/**
 * StaffPicker — the form input for a staff-id text field (`config.employee`,
 * e.g. `owner_rm`). Searches staff by name or ID and stores the employee_id,
 * so nobody has to type "GCRM3". A value that is not in the directory (an
 * inactive person, a legacy free-text value) is kept and shown as-is; if the
 * directory cannot be loaded the field falls back to a plain text input.
 */
export function StaffPicker({ value, onChange, label, error, help, disabled, placeholder, id, knownLabels }) {
  const { data: staff, isLoading, isError } = useStaff();
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const box = useRef(null);

  useEffect(() => {
    const close = (e) => { if (box.current && !box.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  const list = staff ?? [];
  const current = list.find((e) => e.employee_id === value);
  const selectedLabel = current?.employee_name ?? knownLabels?.[String(value)] ?? value ?? '';
  const needle = q.trim().toLowerCase();
  const options = needle
    ? list.filter((e) => e.employee_name?.toLowerCase().includes(needle) || e.employee_id?.toLowerCase().includes(needle))
    : list;
  const labelEl = label && (
    <label htmlFor={id} className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 group-focus-within:text-primary-600 dark:group-focus-within:text-primary-400 transition-colors">{label}</label>
  );
  const frame = clsx('flex items-center gap-2 rounded-lg border px-3 py-2 text-sm bg-white dark:bg-white/5',
    error ? 'border-red-400' : 'border-gray-300 dark:border-white/10');

  if (isError) {
    return (
      <div className="group flex flex-col gap-1.5">
        {labelEl}
        <input id={id} type="text" value={value ?? ''} onChange={(e) => onChange(e.target.value)} disabled={disabled}
          placeholder={placeholder || 'Employee ID'} className={clsx('form-input', error && 'form-input-error')} />
        {error && <p className="form-error">{error}</p>}
        {help && !error && <p className="form-help">{help}</p>}
      </div>
    );
  }

  return (
    <div className="group flex flex-col gap-1.5" ref={box}>
      {labelEl}
      <div className="relative">
        {value && !open ? (
          <div className={frame}>
            <User className="h-4 w-4 text-primary-500 shrink-0" />
            <button type="button" id={id} className="flex-1 text-left truncate text-gray-900 dark:text-white" disabled={disabled} onClick={() => setOpen(true)}>
              {selectedLabel}
            </button>
            {!disabled && (
              <button type="button" aria-label="Clear" onClick={() => onChange('')} className="text-gray-400 hover:text-gray-600">
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        ) : (
          <div className={frame}>
            <Search className="h-4 w-4 text-gray-400 shrink-0" />
            <input
              id={id}
              className="flex-1 bg-transparent text-sm outline-none text-gray-900 dark:text-white"
              placeholder={placeholder || 'Search staff by name…'}
              value={q}
              disabled={disabled}
              autoComplete="off"
              onFocus={() => setOpen(true)}
              onChange={(e) => { setQ(e.target.value); setOpen(true); }}
            />
          </div>
        )}
        {open && !disabled && (
          <ul className="absolute z-30 mt-1 max-h-60 w-full overflow-auto rounded-lg border border-gray-200 bg-white shadow-lg dark:border-white/10 dark:bg-night-2">
            {isLoading && <li className="px-3 py-2 text-sm text-gray-400">Loading staff…</li>}
            {!isLoading && options.length === 0 && <li className="px-3 py-2 text-sm text-gray-400">No matches</li>}
            {options.map((e) => (
              <li key={e.employee_id}>
                <button type="button" className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-primary-50 dark:hover:bg-white/5"
                  onClick={() => { onChange(e.employee_id); setOpen(false); setQ(''); }}>
                  <span className="truncate text-gray-900 dark:text-white">{e.employee_name}</span>
                  <span className="text-xs text-gray-400">{e.employee_id}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      {help && <p className="form-help">{help}</p>}
      {error && <p className="form-error">{error}</p>}
    </div>
  );
}

/** useEmployeeMap — returns a Map<employee_id, employee_name> for quick lookups */
export function useEmployeeMap() {
  // The staff directory is readable by everyone; the full employee list (with
  // inactive staff) only by admins — use it on top when it is available.
  const { data: staff } = useStaff();
  const { data: employees } = useEmployees();
  const rows = [...(Array.isArray(staff) ? staff : staff?.data ?? []), ...(employees ?? [])];
  return new Map(rows.map(e => [e.employee_id, e.employee_name]));
}
