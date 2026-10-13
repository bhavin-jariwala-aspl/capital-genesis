import { useCallback, useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { BookOpen, ChevronDown, Compass, Lightbulb, TriangleAlert } from 'lucide-react';
import clsx from 'clsx';
import { guideFor } from '../../utils/builderGuides';

/**
 * The guidance panel every Builder section shows above its form.
 *
 * ── What it replaces ────────────────────────────────────────────────────────
 * One section (Workflows) had a bespoke 100-line explanatory panel; the other
 * nineteen had nothing. This renders the same four-part guide for all of them
 * from `utils/builderGuides.js`, so the content is consistent, testable, and
 * added by writing an entry rather than a component.
 *
 * ── Why it collapses, and remembers ─────────────────────────────────────────
 * Guidance is invaluable the first time and noise the fiftieth. It opens by
 * default so a new admin cannot miss it, and the choice to collapse is
 * remembered per section in `localStorage` — an experienced admin collapses
 * each section once and never sees it again, while it stays available for the
 * next person. Collapsing it for everyone by default would make it useless;
 * forcing it open forever would make it resented.
 *
 * Storage is best-effort: a private window or blocked site data throws on
 * access, so every read and write is guarded and the panel simply defaults to
 * open.
 */

const STORAGE_PREFIX = 'genesis_guide_collapsed:';

function readCollapsed(key) {
  try {
    return window.localStorage.getItem(STORAGE_PREFIX + key) === '1';
  } catch {
    return false;
  }
}

function writeCollapsed(key, collapsed) {
  try {
    if (collapsed) window.localStorage.setItem(STORAGE_PREFIX + key, '1');
    else window.localStorage.removeItem(STORAGE_PREFIX + key);
  } catch {
    /* no persistence available — the panel still works for this session */
  }
}

/** One labelled list of guidance lines. */
function Section({ icon: Icon, label, tone, items }) {
  if (!items?.length) return null;
  return (
    <div>
      <p className={clsx('mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider', tone)}>
        <Icon className="h-3 w-3" />
        {label}
      </p>
      <ul className="space-y-1">
        {items.map((line) => (
          <li key={line} className="flex gap-1.5 text-xs leading-snug text-gray-600 dark:text-gray-300">
            <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-gray-300 dark:bg-white/25" />
            <span>{line}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * @param {object} props
 * @param {string} [props.section] route key to look up; defaults to the current path
 * @param {string} [props.className]
 */
export default function BuilderGuide({ section, className }) {
  const { pathname } = useLocation();
  const guide = guideFor(section ?? pathname);
  const key = guide?.key;

  const [collapsed, setCollapsed] = useState(() => (key ? readCollapsed(key) : false));

  // Re-read when navigating between sections — each remembers its own state.
  useEffect(() => { if (key) setCollapsed(readCollapsed(key)); }, [key]);

  const toggle = useCallback(() => {
    setCollapsed((prev) => {
      const next = !prev;
      if (key) writeCollapsed(key, next);
      return next;
    });
  }, [key]);

  // A section with no guide renders nothing rather than an empty box.
  if (!guide) return null;

  return (
    <section
      className={clsx(
        'mb-5 overflow-hidden rounded-2xl border border-primary-100 bg-primary-50/60',
        'dark:border-primary-500/20 dark:bg-primary-500/10',
        className,
      )}
      aria-label="How to configure this section"
    >
      <button
        type="button"
        onClick={toggle}
        aria-expanded={!collapsed}
        className="flex w-full items-start gap-3 px-4 py-3 text-left"
      >
        <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-white/70 dark:bg-white/10">
          <BookOpen className="h-3.5 w-3.5 text-primary-500 dark:text-primary-300" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold text-primary-900 dark:text-primary-100">
            {guide.what}
          </span>
          {collapsed && (guide.standards?.length || guide.pitfalls?.length) && (
            <span className="mt-0.5 block text-xs text-primary-600 dark:text-primary-300/70">
              Setup guidance and common pitfalls
            </span>
          )}
        </span>
        <ChevronDown
          className={clsx(
            'mt-0.5 h-4 w-4 shrink-0 text-primary-400 transition-transform duration-200',
            collapsed && '-rotate-90',
          )}
        />
      </button>

      {!collapsed && (
        <div className="space-y-4 border-t border-primary-100 px-4 py-4 dark:border-primary-500/20">
          {guide.when && (
            <div>
              <p className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-primary-700 dark:text-primary-300">
                <Compass className="h-3 w-3" />
                When to use this
              </p>
              <p className="text-xs leading-snug text-gray-600 dark:text-gray-300">{guide.when}</p>
            </div>
          )}

          <Section
            icon={Lightbulb}
            label="How this is normally set up"
            tone="text-emerald-700 dark:text-emerald-400"
            items={guide.standards}
          />

          <Section
            icon={TriangleAlert}
            label="Watch out for"
            tone="text-amber-700 dark:text-amber-400"
            items={guide.pitfalls}
          />
        </div>
      )}
    </section>
  );
}
