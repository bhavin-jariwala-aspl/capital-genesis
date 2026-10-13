import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Star, ChevronDown, TrendingUp } from 'lucide-react';
import { runtimeService } from '../../services/runtime.service';

// A–F grade colors (mirrors the Leads list/card badges).
const GRADE_COLORS = { A: '#10b981', B: '#3b82f6', C: '#f59e0b', D: '#f97316', F: '#ef4444' };
const GRADES = ['A', 'B', 'C', 'D', 'F'];

function gradeFor(score) {
  if (score >= 80) return 'A';
  if (score >= 60) return 'B';
  if (score >= 40) return 'C';
  if (score >= 20) return 'D';
  return 'F';
}

/**
 * Read-only lead-scoring analytics for the Leads module: grade distribution +
 * top-scoring leads + headline KPIs. Data is live from the scoring engine
 * (/api/lead-scoring/*). Renders nothing until there is at least one score.
 */
export default function LeadScoringInsights() {
  const [open, setOpen] = useState(true);

  const { data: distribution = [] } = useQuery({
    queryKey: ['lead-score-distribution'],
    queryFn:  () => runtimeService.getLeadScoreDistribution().then(r => r.data || []),
    staleTime: 60_000,
  });
  const { data: analytics } = useQuery({
    queryKey: ['lead-score-analytics'],
    queryFn:  () => runtimeService.getLeadScoreAnalytics().then(r => r.data || null),
    staleTime: 60_000,
  });
  const { data: topLeads = [] } = useQuery({
    queryKey: ['lead-score-top'],
    queryFn:  () => runtimeService.getTopLeadScores(5).then(r => r.data || []),
    staleTime: 60_000,
  });

  const totalScored = analytics?.total_scored ?? distribution.reduce((s, g) => s + (g.count || 0), 0);
  if (!totalScored) return null;   // nothing scored yet — stay out of the way

  const byGrade = Object.fromEntries(distribution.map(g => [g.grade, g]));
  const maxCount = Math.max(1, ...distribution.map(g => g.count || 0));

  return (
    <div className="mb-4 rounded-2xl border border-gray-200 dark:border-white/10 bg-white dark:bg-night-2 overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-2.5 px-4 py-3 text-left hover:bg-gray-50/60 dark:hover:bg-white/[0.02] transition-colors"
      >
        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-50 dark:bg-amber-500/10">
          <Star className="h-4 w-4 text-amber-500" />
        </div>
        <span className="text-sm font-semibold text-gray-800 dark:text-gray-100">Lead Scoring Insights</span>
        <span className="text-xs text-gray-400">
          {totalScored} scored · avg {analytics?.average_score ?? 0} · high {analytics?.highest_score ?? 0}
        </span>
        <ChevronDown className={`ml-auto h-4 w-4 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 px-4 pb-4 pt-1">
          {/* Grade distribution */}
          <div>
            <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">Grade distribution</p>
            <div className="space-y-1.5">
              {GRADES.map(g => {
                const count = byGrade[g]?.count || 0;
                const pct   = byGrade[g]?.percentage ?? 0;
                return (
                  <div key={g} className="flex items-center gap-2">
                    <span
                      className="inline-flex items-center justify-center w-5 h-5 rounded-full text-[11px] font-bold text-white shrink-0"
                      style={{ background: GRADE_COLORS[g] }}
                    >{g}</span>
                    <div className="flex-1 h-2.5 rounded-full bg-gray-100 dark:bg-white/5 overflow-hidden">
                      <div className="h-full rounded-full" style={{ width: `${(count / maxCount) * 100}%`, background: GRADE_COLORS[g] }} />
                    </div>
                    <span className="text-xs text-gray-500 dark:text-gray-400 w-16 text-right shrink-0">{count} · {pct}%</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Top-scoring leads */}
          <div>
            <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2 flex items-center gap-1">
              <TrendingUp className="h-3.5 w-3.5" /> Top-scoring leads
            </p>
            <div className="space-y-1">
              {topLeads.length === 0 && <p className="text-xs text-gray-400">No scored leads yet.</p>}
              {topLeads.map((s) => {
                const e = s.lead_intake ?? s.lead ?? {};
                const name = [e.first_name, e.last_name].filter(Boolean).join(' ') || e.email || `Lead #${s.id}`;
                const grade = gradeFor(s.total_score);
                return (
                  <div key={s.id} className="flex items-center gap-2 text-sm py-1">
                    <span
                      className="inline-flex items-center justify-center w-5 h-5 rounded-full text-[11px] font-bold text-white shrink-0"
                      style={{ background: GRADE_COLORS[grade] }}
                    >{grade}</span>
                    <span className="truncate text-gray-700 dark:text-gray-300 flex-1">{name}</span>
                    {e.company && <span className="text-xs text-gray-400 truncate hidden sm:inline">{e.company}</span>}
                    <span className="text-xs font-semibold text-gray-800 dark:text-gray-200 shrink-0">{s.total_score}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
