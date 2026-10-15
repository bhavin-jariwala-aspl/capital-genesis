import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Search, X, Link2 } from 'lucide-react';
import clsx from 'clsx';
import { runtimeService } from '../../services/metadata.service';

/**
 * RecordPicker — the input for a `lookup` field.
 *
 * Searches records of `targetObject` by title (scoped server-side to what the
 * user may see) and stores the chosen record's id. The current value's title is
 * resolved on mount, so an edit form shows a name, not a number.
 */
export default function RecordPicker({ targetObject, value, onChange, label, error, help, disabled, placeholder, id, knownLabels }) {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [debounced, setDebounced] = useState('');
  const box = useRef(null);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(q), 250);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    const close = (e) => { if (box.current && !box.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  const current = useQuery({
    queryKey: ['lookup-label', targetObject, value],
    queryFn: () => runtimeService.searchLookup(targetObject, null, value),
    enabled: !!targetObject && value !== null && value !== undefined && value !== '',
    staleTime: 300_000,
  });
  const results = useQuery({
    queryKey: ['lookup-search', targetObject, debounced],
    queryFn: () => runtimeService.searchLookup(targetObject, debounced),
    enabled: !!targetObject && open,
    staleTime: 30_000,
  });

  // The saved record already carries the title of the record it points to
  // (`knownLabels`), which a viewer may not be able to search for themselves —
  // e.g. a Loans executive editing a request for an RM's client.
  const selectedLabel = (current.data?.data ?? [])[0]?.label ?? knownLabels?.[String(value)] ?? (value ? `#${value}` : '');
  const options = results.data?.data ?? [];

  return (
    <div className="flex flex-col gap-1.5" ref={box}>
      {label && <label htmlFor={id} className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">{label}</label>}
      <div className="relative">
        {value && !open ? (
          <div className={clsx('flex items-center gap-2 rounded-lg border px-3 py-2 text-sm bg-white dark:bg-white/5',
            error ? 'border-red-400' : 'border-gray-300 dark:border-white/10')}>
            <Link2 className="h-4 w-4 text-primary-500 shrink-0" />
            <button type="button" id={id} className="flex-1 text-left truncate text-gray-900 dark:text-white" disabled={disabled} onClick={() => setOpen(true)}>
              {selectedLabel}
            </button>
            {!disabled && (
              <button type="button" aria-label="Clear" onClick={() => onChange(null)} className="text-gray-400 hover:text-gray-600">
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        ) : (
          <div className={clsx('flex items-center gap-2 rounded-lg border px-3 py-2 bg-white dark:bg-white/5',
            error ? 'border-red-400' : 'border-gray-300 dark:border-white/10')}>
            <Search className="h-4 w-4 text-gray-400 shrink-0" />
            <input
              id={id}
              className="flex-1 bg-transparent text-sm outline-none text-gray-900 dark:text-white"
              placeholder={placeholder || 'Search…'}
              value={q}
              disabled={disabled}
              onFocus={() => setOpen(true)}
              onChange={(e) => { setQ(e.target.value); setOpen(true); }}
            />
          </div>
        )}
        {open && !disabled && (
          <ul className="absolute z-30 mt-1 max-h-60 w-full overflow-auto rounded-lg border border-gray-200 bg-white shadow-lg dark:border-white/10 dark:bg-night-2">
            {results.isLoading && <li className="px-3 py-2 text-sm text-gray-400">Searching…</li>}
            {!results.isLoading && options.length === 0 && <li className="px-3 py-2 text-sm text-gray-400">No matches</li>}
            {options.map((o) => (
              <li key={o.id}>
                <button type="button" className="w-full px-3 py-2 text-left text-sm hover:bg-primary-50 dark:hover:bg-white/5"
                  onClick={() => { onChange(o.id); setOpen(false); setQ(''); }}>
                  {o.label}
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
