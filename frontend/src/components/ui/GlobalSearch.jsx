import { useState, useRef, useEffect, useCallback } from 'react';
import { Search, X, ArrowRight } from 'lucide-react';
import { searchService } from '../../services/search.service';
import { useNavigate } from 'react-router-dom';

function useDebounce(value, delay) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

export default function GlobalSearch() {
  const [query, setQuery]     = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [focused, setFocused] = useState(false);
  const [active, setActive]   = useState(-1);
  const inputRef = useRef(null);
  const wrapRef  = useRef(null);
  const navigate = useNavigate();
  const debounced = useDebounce(query, 300);

  // ── Search on debounced value ────────────────────────────────────────────
  useEffect(() => {
    if (!debounced.trim()) { setResults([]); return; }
    setLoading(true);
    setActive(-1);
    searchService.search(debounced)
      .then(r => setResults(r.data?.data ?? []))
      .catch(() => setResults([]))
      .finally(() => setLoading(false));
  }, [debounced]);

  // ── Close on outside click ───────────────────────────────────────────────
  useEffect(() => {
    const handler = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setFocused(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // ── Keyboard navigation ───────────────────────────────────────────────────
  const goTo = useCallback((item) => {
    navigate(`/module/${item.module_id}/object/${item.object_id}/edit/${item.id}`);
    setQuery('');
    setResults([]);
    setFocused(false);
  }, [navigate]);

  const handleKey = useCallback((e) => {
    if (!results.length) return;
    if (e.key === 'ArrowDown')  { e.preventDefault(); setActive(a => Math.min(a + 1, results.length - 1)); }
    if (e.key === 'ArrowUp')    { e.preventDefault(); setActive(a => Math.max(a - 1, 0)); }
    if (e.key === 'Enter' && active >= 0) { goTo(results[active]); }
    if (e.key === 'Escape')     { setFocused(false); setQuery(''); }
  }, [results, active, goTo]);

  const open = focused && (loading || results.length > 0 || (query.trim().length > 0));

  return (
    <div ref={wrapRef} className="relative hidden sm:block">
      <div className="relative flex items-center">
        <Search className="absolute left-3 w-3.5 h-3.5 text-gray-400 dark:text-white/30 pointer-events-none" />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={e => setQuery(e.target.value)}
          onFocus={() => setFocused(true)}
          onKeyDown={handleKey}
          placeholder="Search records…"
          className="w-52 lg:w-64 pl-9 pr-8 py-1.5 text-sm rounded-lg bg-gray-100 dark:bg-white/10 border border-transparent focus:border-primary-400 dark:focus:border-primary-500 focus:bg-white dark:focus:bg-white/10 text-gray-700 dark:text-white/80 placeholder:text-gray-400 dark:placeholder:text-white/30 outline-none transition-all"
        />
        {query && (
          <button
            onClick={() => { setQuery(''); setResults([]); inputRef.current?.focus(); }}
            className="absolute right-2.5 text-gray-400 hover:text-gray-600 dark:hover:text-white/60"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {open && (
        <div className="absolute top-full mt-2 left-0 w-80 rounded-xl shadow-xl border border-gray-200 dark:border-white/10 bg-white dark:bg-night-3 z-50 overflow-hidden">
          {loading ? (
            <p className="text-xs text-gray-400 text-center py-6">Searching…</p>
          ) : results.length === 0 ? (
            <p className="text-xs text-gray-400 text-center py-6">No results for &ldquo;{query}&rdquo;</p>
          ) : (
            <ul className="max-h-72 overflow-y-auto py-1">
              {results.map((item, idx) => (
                <li key={item.id}>
                  <button
                    onMouseEnter={() => setActive(idx)}
                    onClick={() => goTo(item)}
                    className={`w-full text-left px-4 py-2.5 flex items-center justify-between gap-3 transition-colors ${
                      idx === active ? 'bg-primary-50 dark:bg-primary-950/30' : 'hover:bg-gray-50 dark:hover:bg-white/5'
                    }`}
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-800 dark:text-white/90 truncate">{item.title}</p>
                      <p className="text-xs text-gray-400 dark:text-white/35 truncate">
                        {item.module_label} › {item.object_label}
                        {item.pipeline_stage && ` · ${item.pipeline_stage}`}
                      </p>
                    </div>
                    {idx === active && <ArrowRight className="w-3.5 h-3.5 text-primary-500 shrink-0" />}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
