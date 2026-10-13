import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import * as Icons from 'lucide-react';
import { FilePlus2, Search, Sparkles } from 'lucide-react';
import clsx from 'clsx';
import { reportService } from '../../services/report.service';
import Spinner from '../ui/Spinner';

/**
 * TemplateGallery — the first screen of "New report".
 *
 * Handing a non-technical user a blank builder is the single biggest reason
 * self-service reporting stalls, so the default path is: pick the question you
 * want answered, then adjust. Each card states the business question rather than
 * the configuration, and "Start from scratch" is always available.
 */
export default function TemplateGallery({ onPick, onBlank }) {
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('all');

  const { data, isPending } = useQuery({
    queryKey: ['report-templates'],
    queryFn: reportService.getTemplates,
    staleTime: Infinity,
  });
  const templates = useMemo(() => data?.data ?? data ?? [], [data]);

  const categories = useMemo(() => {
    const seen = new Map();
    for (const t of templates) if (!seen.has(t.category)) seen.set(t.category, t.category_label || t.category);
    return [['all', 'All'], ...seen.entries()];
  }, [templates]);

  const filtered = templates.filter((t) => {
    if (category !== 'all' && t.category !== category) return false;
    if (!search.trim()) return true;
    const term = search.toLowerCase();
    return `${t.name} ${t.question}`.toLowerCase().includes(term);
  });

  return (
    <div className="mx-auto max-w-5xl space-y-5 p-6">
      <div className="text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-primary-500 to-mid-600 text-on-primary">
          <Sparkles className="h-6 w-6" />
        </div>
        <h1 className="mt-3 text-xl font-semibold text-gray-900 dark:text-white">What would you like to find out?</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-white/50">
          Start from a ready-made report and change anything you like — or build one from scratch.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-gray-400" />
          <input
            className="w-full rounded-lg border border-gray-200 bg-white py-2 pl-8 pr-3 text-sm text-gray-900 focus:border-primary-500 focus:outline-none dark:border-white/10 dark:bg-white/5 dark:text-white"
            placeholder="Search — try “win rate”, “premium”, “overdue”…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <button
          type="button"
          onClick={onBlank}
          className="flex shrink-0 items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 dark:border-white/10 dark:text-white/70 dark:hover:bg-white/5"
        >
          <FilePlus2 className="h-4 w-4" /> Start from scratch
        </button>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {categories.map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setCategory(key)}
            className={clsx(
              'rounded-full px-3 py-1 text-xs font-medium transition',
              category === key
                ? 'bg-primary-600 text-on-primary'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-white/10 dark:text-white/60 dark:hover:bg-white/[0.15]',
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {isPending ? (
        <div className="flex justify-center py-16"><Spinner /></div>
      ) : filtered.length === 0 ? (
        <div className="py-14 text-center">
          <p className="text-sm text-gray-500 dark:text-white/60">Nothing matches “{search}”.</p>
          <button type="button" onClick={onBlank} className="mt-2 text-sm font-medium text-primary-600 hover:underline">
            Build it from scratch instead
          </button>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((t) => {
            const Icon = Icons[t.icon] ?? Icons.BarChart3;
            return (
              <button
                key={t.key}
                type="button"
                onClick={() => onPick(t)}
                className="group flex flex-col rounded-2xl border border-gray-200 bg-white p-4 text-left transition hover:border-primary-300 hover:shadow-md dark:border-white/10 dark:bg-[#161b22] dark:hover:border-primary-500/40"
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary-500/10 text-primary-500">
                    <Icon className="h-5 w-5" />
                  </span>
                  <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium capitalize text-gray-500 dark:bg-white/10 dark:text-white/50">
                    {t.category_label || t.category}
                  </span>
                </div>
                <p className="mt-2.5 text-sm font-semibold text-gray-900 dark:text-white">{t.name}</p>
                <p className="mt-1 text-xs leading-relaxed text-gray-500 dark:text-white/50">{t.question}</p>
                <span className="mt-3 text-[11px] font-medium text-primary-600 opacity-0 transition group-hover:opacity-100 dark:text-primary-300">
                  Open and edit →
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
