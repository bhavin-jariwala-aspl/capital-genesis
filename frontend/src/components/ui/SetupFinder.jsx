import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { Command, CornerDownLeft, Search, Settings2 } from 'lucide-react';
import clsx from 'clsx';
import { useAuthStore } from '../../store/authStore';
import { SETUP_AREAS, searchSetup, visibleSetupEntries } from '../../utils/setupIndex';

/**
 * Quick Find for configuration — one keyboard-first finder over every
 * configurable destination.
 *
 * ── The problem ─────────────────────────────────────────────────────────────
 * Configuration lives on three surfaces that do not know about each other: the
 * Builder (twenty-odd pages inside a collapsed sidebar group), the Platform
 * console (eight more, in a different collapsed group), and Settings. The
 * Builder had a search box, but it only filtered the Builder — so a question
 * whose answer was in Settings or the console could not be answered by
 * searching, only by already knowing. Meanwhile every mainstream admin console
 * (Salesforce Quick Find, HubSpot settings search, Zoho setup search) makes
 * this one box.
 *
 * ── Design notes ────────────────────────────────────────────────────────────
 * Opened with Cmd/Ctrl-K, which is where people's hands already go. It matches
 * against *synonyms* rather than page titles, so "picklist", "SSO", "dedupe"
 * and "business hours" all land somewhere useful — see `utils/setupIndex.js`.
 * Results are grouped by surface so the answer also teaches where the thing
 * lives, which a flat list does not. Entries a viewer cannot reach are never
 * indexed, so this is not a map of the admin console for non-admins.
 */
export default function SetupFinder() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef(null);
  const navigate = useNavigate();
  const { isAdmin, isPlatformAdmin } = useAuthStore();

  const perms = useMemo(
    () => ({ isAdmin: isAdmin(), isPlatformAdmin: isPlatformAdmin() }),
    [isAdmin, isPlatformAdmin],
  );

  // Nothing to find if the viewer can configure nothing.
  const available = useMemo(() => visibleSetupEntries(perms), [perms]);

  const results = useMemo(
    () => (available.length ? searchSetup(query, perms) : []),
    [query, perms, available.length],
  );

  const close = useCallback(() => { setOpen(false); setQuery(''); setActive(0); }, []);

  const go = useCallback((entry) => {
    if (!entry) return;
    navigate(entry.to);
    close();
  }, [navigate, close]);

  // ── Cmd/Ctrl-K to open, anywhere ──────────────────────────────────────────
  useEffect(() => {
    if (!available.length) return undefined;
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [available.length]);

  useEffect(() => { setActive(0); }, [query]);
  useEffect(() => { if (open) inputRef.current?.focus(); }, [open]);

  if (!available.length) return null;

  const onKeyDown = (e) => {
    if (e.key === 'Escape') { e.preventDefault(); close(); return; }
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(a + 1, results.length - 1)); }
    if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
    if (e.key === 'Enter') { e.preventDefault(); go(results[active]); }
  };

  // Group in result order, so the best match's surface appears first.
  const grouped = [];
  for (const entry of results) {
    let bucket = grouped.find((g) => g.area === entry.area);
    if (!bucket) { bucket = { area: entry.area, entries: [] }; grouped.push(bucket); }
    bucket.entries.push(entry);
  }
  const indexOf = (entry) => results.indexOf(entry);

  return (
    <>
      {/* Trigger */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="Find a setting (Cmd/Ctrl-K)"
        className="hidden items-center gap-2 rounded-lg border border-gray-200 bg-white/70 px-2.5 py-1.5 text-xs text-gray-500 transition-colors hover:border-gray-300 hover:text-gray-700 md:flex dark:border-white/10 dark:bg-white/5 dark:text-white/50 dark:hover:border-white/20 dark:hover:text-white/80"
      >
        <Settings2 className="h-3.5 w-3.5" />
        <span>Find a setting</span>
        <kbd className="ml-1 flex items-center gap-0.5 rounded border border-gray-200 px-1 py-px font-sans text-[10px] text-gray-400 dark:border-white/15 dark:text-white/40">
          <Command className="h-2.5 w-2.5" />K
        </kbd>
      </button>

      {open && createPortal(
        <div
          className="fixed inset-0 z-[60] flex items-start justify-center bg-gray-950/40 p-4 pt-[10vh] backdrop-blur-sm dark:bg-black/60"
          onClick={close}
          role="presentation"
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Find a setting"
            className="w-full max-w-xl overflow-hidden rounded-2xl border border-gray-200/70 bg-white shadow-elevated dark:border-white/[0.08] dark:bg-night-2"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-2.5 border-b border-gray-100 px-4 dark:border-white/[0.06]">
              <Search className="h-4 w-4 shrink-0 text-gray-400" />
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={onKeyDown}
                placeholder="Search settings — try &ldquo;picklist&rdquo;, &ldquo;SLA calendar&rdquo;, &ldquo;plan&rdquo;, &ldquo;SSO&rdquo;"
                className="w-full bg-transparent py-3.5 text-sm text-gray-900 outline-none placeholder:text-gray-400 dark:text-white dark:placeholder:text-white/30"
                aria-autocomplete="list"
                aria-controls="setup-finder-results"
              />
              <kbd className="hidden shrink-0 rounded border border-gray-200 px-1.5 py-0.5 font-sans text-[10px] text-gray-400 sm:block dark:border-white/15 dark:text-white/40">
                esc
              </kbd>
            </div>

            <ul id="setup-finder-results" role="listbox" className="max-h-[55vh] overflow-y-auto py-1.5">
              {grouped.map((bucket) => (
                <li key={bucket.area}>
                  <p className="px-4 pb-0.5 pt-2 text-[10px] font-bold uppercase tracking-[0.1em] text-gray-400 dark:text-white/30">
                    {SETUP_AREAS[bucket.area]?.label ?? bucket.area}
                  </p>
                  <ul>
                    {bucket.entries.map((entry) => {
                      const i = indexOf(entry);
                      const selected = i === active;
                      return (
                        <li key={entry.to} role="option" aria-selected={selected}>
                          <button
                            type="button"
                            onMouseEnter={() => setActive(i)}
                            onClick={() => go(entry)}
                            className={clsx(
                              'flex w-full items-center gap-3 px-4 py-2 text-left transition-colors',
                              selected ? 'bg-primary-50 dark:bg-white/[0.07]' : 'hover:bg-gray-50 dark:hover:bg-white/[0.04]',
                            )}
                          >
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-sm font-medium text-gray-900 dark:text-white">
                                {entry.label}
                                {entry.group && (
                                  <span className="ml-2 text-[11px] font-normal text-gray-400">{entry.group}</span>
                                )}
                              </span>
                              {entry.description && (
                                <span className="block truncate text-xs text-gray-500 dark:text-white/40">
                                  {entry.description}
                                </span>
                              )}
                            </span>
                            {selected && <CornerDownLeft className="h-3.5 w-3.5 shrink-0 text-gray-400" />}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </li>
              ))}

              {results.length === 0 && (
                <li className="px-4 py-8 text-center text-sm text-gray-400">
                  Nothing matches &ldquo;{query}&rdquo;.
                </li>
              )}
            </ul>

            <div className="flex items-center justify-between border-t border-gray-100 px-4 py-2 text-[11px] text-gray-400 dark:border-white/[0.06] dark:text-white/30">
              <span>{results.length} of {available.length} settings</span>
              <span className="hidden sm:inline">&uarr;&darr; to move · &crarr; to open</span>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
