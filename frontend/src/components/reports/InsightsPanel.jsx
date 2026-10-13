import { useState } from 'react';
import { Lightbulb, AlertTriangle, Info, Sparkles, ChevronDown, ChevronRight } from 'lucide-react';
import clsx from 'clsx';

const SEVERITY = {
  warn:   { Icon: AlertTriangle, cls: 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-200' },
  notice: { Icon: Lightbulb,     cls: 'border-primary-200 bg-primary-50 text-primary-800 dark:border-primary-500/20 dark:bg-primary-500/10 dark:text-primary-200' },
  info:   { Icon: Info,          cls: 'border-gray-200 bg-white text-gray-700 dark:border-white/10 dark:bg-white/5 dark:text-white/70' },
};

/**
 * InsightsPanel — what the numbers say, in sentences.
 *
 * The insights themselves are computed by the engine from the result (leaders,
 * concentration, outliers, trend, movers), so every sentence is reproducible and
 * every number in it is on screen. An optional "Explain" action asks the AI
 * layer for a fuller narrative; that narrative is grounded on the same result and
 * is checked numeral-by-numeral before it is shown.
 */
export default function InsightsPanel({ insights = [], narrative = null, onExplain, explaining = false, aiAvailable = false, defaultOpen = true }) {
  const [open, setOpen] = useState(defaultOpen);
  if (!insights.length && !narrative && !aiAvailable) return null;

  return (
    <div className="mt-4 rounded-xl border border-gray-200 dark:border-white/10">
      <div className="flex items-center justify-between gap-2 px-3 py-2">
        <button type="button" onClick={() => setOpen((o) => !o)} className="flex items-center gap-1.5 text-xs font-semibold text-gray-700 dark:text-white/80">
          {open ? <ChevronDown className="h-3.5 w-3.5 text-gray-400" /> : <ChevronRight className="h-3.5 w-3.5 text-gray-400" />}
          <Lightbulb className="h-3.5 w-3.5 text-amber-500" /> What stands out
          {insights.length > 0 && <span className="rounded-full bg-gray-100 px-1.5 text-[10px] text-gray-500 dark:bg-white/10 dark:text-white/50">{insights.length}</span>}
        </button>
        {aiAvailable && onExplain && (
          <button
            type="button"
            onClick={onExplain}
            disabled={explaining}
            title="Ask the AI to explain this report in plain English. Every number it uses is checked against the table."
            className="flex items-center gap-1 rounded-lg border border-violet-200 px-2 py-1 text-[11px] font-medium text-violet-700 hover:bg-violet-50 disabled:opacity-50 dark:border-violet-500/30 dark:text-violet-300 dark:hover:bg-violet-500/10"
          >
            <Sparkles className={clsx('h-3 w-3', explaining && 'animate-pulse')} /> {explaining ? 'Explaining…' : 'Explain'}
          </button>
        )}
      </div>

      {open && (
        <div className="space-y-1.5 border-t border-gray-100 p-3 dark:border-white/5">
          {narrative && (
            <p className="rounded-lg border border-violet-200 bg-violet-50 px-3 py-2 text-sm leading-relaxed text-violet-900 dark:border-violet-500/20 dark:bg-violet-500/10 dark:text-violet-100">
              <Sparkles className="mr-1 inline h-3.5 w-3.5 align-text-top text-violet-500" />
              {narrative.text}
              {narrative.grounded === false && (
                <span className="mt-1 block text-[10px] text-violet-500">Shown from the computed findings — the AI&apos;s wording did not pass the numbers check.</span>
              )}
            </p>
          )}
          {insights.map((i, idx) => {
            const { Icon, cls } = SEVERITY[i.severity] || SEVERITY.info;
            return (
              <div key={`${i.kind}-${idx}`} className={clsx('flex items-start gap-2 rounded-lg border px-3 py-2', cls)}>
                <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <div className="min-w-0">
                  <p className="text-sm font-medium">{i.title}</p>
                  {i.detail && <p className="text-xs opacity-80">{i.detail}</p>}
                </div>
              </div>
            );
          })}
          {!insights.length && !narrative && (
            <p className="text-xs text-gray-400">Nothing notable — the values are evenly spread.</p>
          )}
        </div>
      )}
    </div>
  );
}
