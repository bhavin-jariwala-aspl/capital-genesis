import { useState, useMemo, useEffect, useRef } from 'react';
import { ChevronDown, ChevronUp, ChevronsUpDown, Search, ChevronLeft, ChevronRight, Inbox } from 'lucide-react';
import { clsx } from 'clsx';
import EmptyState from './EmptyState';

/**
 * Resolve a column's raw value from a row. Metadata records nest their field
 * values under `row.data` (top-level keys are id/pipeline_stage/…), while
 * other flat rows keep them top-level. A column may also supply
 * an explicit `accessor(row)`. Trying `row.data[key]` first and falling back to
 * `row[key]` makes search + sort work for BOTH shapes — previously they read
 * only `row[key]`, so search and sort silently did nothing on every module grid.
 */
function cellValue(col, row) {
  if (typeof col.accessor === 'function') return col.accessor(row);
  const nested = row?.data?.[col.key];
  return nested !== undefined ? nested : row?.[col.key];
}

/**
 * DataTable — feature-rich HTML table.
 * columns: [{ key, label, render?, sortable?, width?, accessor? }]
 * data:    any[]
 * onFilter(rows|null, search) — called when the search changes the visible rows (null = no search).
 * defaultSort — { key, dir } the table starts sorted by (the user can still re-sort); none keeps `data` order.
 */
export default function DataTable({
  columns = [],
  data = [],
  loading = false,
  searchable = true,
  paginate = true,
  pageSize = 10,
  onRowClick,
  emptyText = 'No records found',
  emptyMessage,
  emptyIcon = Inbox,
  emptyAction,
  title,
  subtitle,
  icon: HeadIcon,
  actions,
  onFilter,
  defaultSort,
  frame = true,
  className,
}) {
  const [search, setSearch]     = useState('');
  const [sortKey, setSortKey]   = useState(defaultSort?.key ?? null);
  const [sortDir, setSortDir]   = useState(defaultSort?.dir === 'desc' ? 'desc' : 'asc');
  const [page, setPage]         = useState(1);

  const filtered = useMemo(() => {
    // Every word must match some column, so "Forex 2026-09" narrows to one entity in one month.
    const terms = search.toLowerCase().split(/\s+/).filter(Boolean);
    if (!terms.length) return data;
    return data.filter((row) => {
      const texts = columns.map((col) => {
        // `searchText(row)` lets a column also match what it displays (a picklist label, a lookup's title).
        const val = typeof col.searchText === 'function' ? `${cellValue(col, row) ?? ''} ${col.searchText(row) ?? ''}` : cellValue(col, row);
        return String(val ?? '').toLowerCase();
      });
      return terms.every((t) => texts.some((x) => x.includes(t)));
    });
  }, [data, search, columns]);

  // Tell the page which rows the search left (its record count and Export follow the table).
  // Only when the result changes: the page re-renders on it, and its `data`/`columns` may be new arrays each render.
  const lastFilter = useRef('');
  useEffect(() => {
    if (!onFilter) return;
    const q = search.trim();
    const key = q ? `${q}|${filtered.map((r) => r?.id ?? '').join(',')}` : '';
    if (lastFilter.current === key) return;
    lastFilter.current = key;
    onFilter(q ? filtered : null, q);
  }, [filtered, search, onFilter]);

  const sorted = useMemo(() => {
    if (!sortKey) return filtered;
    // A default sort may name a field that is not a visible column.
    const sortCol = columns.find((c) => c.key === sortKey) ?? { key: sortKey };
    return [...filtered].sort((a, b) => {
      const av = cellValue(sortCol, a) ?? '';
      const bv = cellValue(sortCol, b) ?? '';
      const cmp = String(av).localeCompare(String(bv), undefined, { numeric: true });
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [filtered, sortKey, sortDir, columns]);

  const totalPages = paginate ? Math.max(1, Math.ceil(sorted.length / pageSize)) : 1;

  // Clamp the current page when the data set shrinks (external filter, bulk
  // delete, etc.). Without this the user can be stranded on an empty page.
  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const paged = paginate ? sorted.slice((page - 1) * pageSize, page * pageSize) : sorted;

  const toggleSort = (key) => {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(key); setSortDir('asc'); }
  };

  const SortIcon = ({ col }) => {
    if (!col.sortable) return null;
    if (sortKey !== col.key) return <ChevronsUpDown className="h-3 w-3 opacity-30" />;
    return sortDir === 'asc'
      ? <ChevronUp className="h-3 w-3 text-primary-500" />
      : <ChevronDown className="h-3 w-3 text-primary-500" />;
  };

  const showHeader = title || HeadIcon || actions || searchable;

  return (
    <div className={clsx(frame && 'widget', className)}>
      {showHeader && (
        <div className="flex items-center justify-between gap-3 flex-wrap px-4 sm:px-5 py-3.5 border-b border-gray-100/80 dark:border-white/[0.06] aurora-wash">
          <div className="flex items-center gap-3 min-w-0">
            {HeadIcon && (
              <span className="icon-chip h-9 w-9">
                <HeadIcon className="h-4 w-4" />
              </span>
            )}
            {(title || subtitle) && (
              <div className="min-w-0">
                {title && <h3 className="text-sm font-bold text-gray-900 dark:text-white truncate">{title}</h3>}
                {subtitle && <p className="text-xs text-gray-400 dark:text-white/40 truncate">{subtitle}</p>}
              </div>
            )}
          </div>
          <div className="flex items-center gap-2">
            {searchable && (
              <div className="relative w-44 sm:w-56">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search…"
                  value={search}
                  onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                  className="form-input h-9 pl-9 py-1.5 text-sm"
                />
              </div>
            )}
            {actions}
          </div>
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="min-w-full">
          <thead>
            <tr className="border-b border-gray-100 dark:border-white/[0.07]">
              {columns.map((col) => (
                <th
                  key={col.key}
                  onClick={() => col.sortable && toggleSort(col.key)}
                  style={{ width: col.width }}
                  className={clsx(
                    'px-5 py-3 text-left text-[11px] font-semibold text-gray-400 uppercase tracking-widest whitespace-nowrap bg-gray-50/60 dark:bg-white/5',
                    col.sortable && 'cursor-pointer hover:text-gray-600 dark:hover:text-gray-200 select-none',
                  )}
                >
                  <span className="flex items-center gap-1.5">
                    {col.label}
                    <SortIcon col={col} />
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={columns.length} className="px-5 py-10 text-center">
                  <div className="flex justify-center">
                    <svg className="animate-spin h-5 w-5 text-primary-400" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-20" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                  </div>
                </td>
              </tr>
            ) : paged.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="p-0">
                  <EmptyState
                    icon={emptyIcon}
                    title={emptyText}
                    message={emptyMessage ?? (search ? 'No matches for your search — try a different term.' : undefined)}
                    action={!search ? emptyAction : undefined}
                    compact
                  />
                </td>
              </tr>
            ) : (
              paged.map((row, i) => (
                <tr
                  key={row.id ?? i}
                  onClick={() => onRowClick?.(row)}
                  className={clsx(
                    'border-b border-gray-50 dark:border-white/[0.04] last:border-0 transition-colors duration-100',
                    onRowClick && 'cursor-pointer hover:bg-gray-50/70 dark:hover:bg-white/5',
                  )}
                >
                  {columns.map((col) => (
                    <td key={col.key} className="px-5 py-3.5 text-sm text-gray-700 dark:text-gray-300 whitespace-nowrap">
                      {col.render ? col.render(cellValue(col, row), row) : (cellValue(col, row) ?? '—')}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {paginate && totalPages > 1 && (
        <div className="flex items-center justify-between text-xs text-gray-400 px-4 sm:px-5 py-3 border-t border-gray-100/80 dark:border-white/[0.06]">
          <span className="font-medium">{sorted.length} records</span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </button>
            <span className="px-2 font-medium text-gray-500">Page {page} of {totalPages}</span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

