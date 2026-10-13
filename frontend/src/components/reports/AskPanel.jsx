import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Sparkles, Send, Save, AlertTriangle, MessageCircleQuestion, ShieldOff, Table, BarChart3, LineChart, PieChart, Gauge, Grid3x3, Eraser, ArrowLeft, CornerDownLeft } from 'lucide-react';
import clsx from 'clsx';
import { reportService } from '../../services/report.service';
import ReportResult from '../runtime/ReportResult';
import Spinner from '../ui/Spinner';

const VIZ_ICON = { table: Table, bar: BarChart3, line: LineChart, area: LineChart, pie: PieChart, donut: PieChart, funnel: BarChart3, kpi: Gauge, pivot: Grid3x3 };
const MAX_HISTORY = 4;

/**
 * AskPanel — "ask a question, get a report".
 *
 * A conversation with the AI planner. Each answer is a *real report*: the model
 * produced a report config (never SQL), the server validated it against the
 * same closed vocabulary the builder uses, clamped it to the user's data scope
 * and ran it through the ordinary engine. So every answer can be drilled into,
 * re-drawn as another chart type, and saved as a normal report with one click.
 *
 * What the panel shows for each turn depends on the server's `status`:
 *   success / no_data  → interpretation, chart or table, narrative, follow-ups
 *   clarify            → a question with options the user can click
 *   refused            → why, in one sentence
 *   llm_unavailable    → how to get the model running
 *
 * Navigation is one level deep, so the back arrow always means "up one":
 * from a conversation it returns to the Ask landing page (the starter
 * questions), keeping the conversation so it can be reopened; from the landing
 * page it leaves Ask for the report library. Nothing is discarded on the way —
 * "Start over" is the separate, explicit control for that.
 */
export default function AskPanel({ scope = 'all', onBack }) {
  const navigate = useNavigate();
  const [turns, setTurns] = useState([]);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  // Show the starter screen even when a conversation exists, so "back" has
  // somewhere to go without throwing the conversation away.
  const [landing, setLanding] = useState(false);
  const endRef = useRef(null);

  const { data: statusData } = useQuery({ queryKey: ['ai-status'], queryFn: reportService.aiStatus, staleTime: 60_000 });
  const status = statusData?.data ?? statusData ?? null;
  const { data: suggData } = useQuery({ queryKey: ['ai-suggestions'], queryFn: reportService.aiSuggestions, staleTime: Infinity });
  const suggestions = suggData?.data ?? suggData ?? [];

  const showLanding = landing || turns.length === 0;
  const canResume = landing && turns.length > 0;

  useEffect(() => { if (!showLanding) endRef.current?.scrollIntoView?.({ behavior: 'smooth' }); }, [turns.length, busy, showLanding]);

  /** Up one level: a conversation goes back to the landing page, the landing page leaves Ask. */
  const goBack = () => {
    if (!showLanding) setLanding(true);
    else onBack?.();
  };

  const send = async (message) => {
    const q = String(message || '').trim();
    if (!q || busy) return;
    setText('');
    setBusy(true);
    setLanding(false);
    // Previous successful turns give the planner context for follow-ups ("only the top 3").
    const history = turns.filter((t) => t.answer?.query?.config).slice(-MAX_HISTORY).map((t) => ({ message: t.question, config: t.answer.query.config }));
    const turn = { id: Date.now(), question: q, answer: null, error: null };
    setTurns((ts) => [...ts, turn]);
    try {
      const res = await reportService.ask(q, { history, scope, want_summary: true });
      // The service already unwraps the API envelope; the answer itself carries a
      // `data` field (the report rows), so the usual `res.data ?? res` fallback
      // would pick the rows and lose the status — which rendered nothing at all.
      const answer = unwrapAnswer(res);
      setTurns((ts) => ts.map((t) => (t.id === turn.id ? { ...t, answer, viz: answer?.visualization?.type } : t)));
    } catch (e) {
      const msg = e?.response?.data?.error?.message || e?.message || 'Something went wrong.';
      setTurns((ts) => ts.map((t) => (t.id === turn.id ? { ...t, error: msg } : t)));
    } finally {
      setBusy(false);
    }
  };

  const saveAsReport = (turn) => {
    const a = turn.answer;
    navigate('/reports/new', {
      state: {
        draft: {
          config: { ...a.query.config, viz: turn.viz || a.visualization?.type || a.query.config.viz },
          name: a.interpretation?.title || turn.question.slice(0, 80),
          description: a.interpretation?.description || turn.question,
        },
      },
    });
  };

  if (status && !status.enabled) {
    return (
      <Empty icon={ShieldOff} title="Ask is not enabled on this server">
        Set <code className="rounded bg-gray-100 px-1 dark:bg-white/10">AI_REPORTING_ENABLED=true</code> and point <code className="rounded bg-gray-100 px-1 dark:bg-white/10">LLM_*</code> at a model server (Ollama by default). Nothing else changes — the builder works without it.
      </Empty>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-3 border-b border-gray-200 px-6 py-4 dark:border-white/10">
        {(!showLanding || onBack) && (
          <button
            type="button"
            onClick={goBack}
            title={showLanding ? 'Back to reports' : 'Back to Ask Genesis'}
            aria-label={showLanding ? 'Back to reports' : 'Back to Ask Genesis'}
            className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-white/10 dark:hover:text-white/70"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
        )}
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 to-fuchsia-600 text-white">
          <Sparkles className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="text-lg font-semibold text-gray-900 dark:text-white">Ask Genesis</h1>
          <p className="text-xs text-gray-500 dark:text-white/50">
            Describe the report you want in plain English. You only ever see data you are allowed to see.
          </p>
        </div>
        {status && (
          <span
            className={clsx('flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium', status.ok ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' : 'bg-amber-500/10 text-amber-600 dark:text-amber-300')}
            title={status.reason || `${status.provider} · ${status.model}`}
          >
            <span className={clsx('h-1.5 w-1.5 rounded-full', status.ok ? 'bg-emerald-500' : 'bg-amber-500')} />
            {status.ok ? `${status.model} ready` : 'model offline'}
          </span>
        )}
        {turns.length > 0 && (
          <button
            type="button"
            onClick={() => { setTurns([]); setLanding(false); }}
            title="Start over — clear this conversation"
            aria-label="Start over"
            className="rounded-lg border border-gray-200 p-2 text-gray-400 hover:bg-gray-50 dark:border-white/10 dark:hover:bg-white/5"
          >
            <Eraser className="h-4 w-4" />
          </button>
        )}
      </div>

      <div className="flex-1 overflow-auto bg-gray-50 p-6 dark:bg-[#0d1117]">
        {showLanding && (
          <div className="mx-auto max-w-2xl">
            {canResume && (
              <div className="mb-5 flex justify-center">
                <button
                  type="button"
                  onClick={() => setLanding(false)}
                  className="flex items-center gap-1.5 rounded-full border border-primary-200 bg-white px-3 py-1.5 text-xs font-medium text-primary-700 hover:bg-primary-50 dark:border-primary-500/30 dark:bg-white/5 dark:text-primary-300 dark:hover:bg-primary-500/10"
                >
                  <CornerDownLeft className="h-3.5 w-3.5" />
                  Back to your last answer
                </button>
              </div>
            )}
            <p className="mb-3 text-center text-sm text-gray-500 dark:text-white/50">Try one of these, or ask your own question.</p>
            <div className="flex flex-wrap justify-center gap-2">
              {suggestions.slice(0, 9).map((s) => (
                <button key={s} type="button" onClick={() => send(s)} className="rounded-full border border-gray-200 bg-white px-3 py-1.5 text-xs text-gray-700 hover:border-primary-300 hover:text-primary-700 dark:border-white/10 dark:bg-white/5 dark:text-white/70">
                  {s}
                </button>
              ))}
            </div>
            {status && !status.ok && (
              <p className="mt-6 flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:bg-amber-500/10 dark:text-amber-200">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {status.reason || 'The model is not reachable right now.'}
              </p>
            )}
          </div>
        )}

        <div className={clsx('mx-auto max-w-5xl space-y-4', showLanding && 'hidden')}>
          {turns.map((t) => (
            <Turn key={t.id} turn={t} onPick={send} onViz={(viz) => setTurns((ts) => ts.map((x) => (x.id === t.id ? { ...x, viz } : x)))} onSave={() => saveAsReport(t)} scope={scope} />
          ))}
          {busy && (
            <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-white/50"><Spinner size="sm" /> Thinking… planning the report, running it, then checking the numbers.</div>
          )}
          <div ref={endRef} />
        </div>
      </div>

      <form
        onSubmit={(e) => { e.preventDefault(); send(text); }}
        className="border-t border-gray-200 bg-white p-4 dark:border-white/10 dark:bg-[#161b22]"
      >
        <div className="mx-auto flex max-w-5xl items-center gap-2">
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            disabled={busy}
            placeholder={showLanding ? 'e.g. Top 5 owners by won revenue this fiscal year' : 'Refine it — "only the top 5", "by month instead", "compare with last year"…'}
            className="min-w-0 flex-1 rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm text-gray-900 focus:border-primary-500 focus:outline-none dark:border-white/10 dark:bg-white/5 dark:text-white"
            aria-label="Ask a question"
          />
          <button type="submit" disabled={busy || !text.trim()} className="flex items-center gap-1.5 rounded-xl bg-primary-600 px-4 py-2.5 text-sm font-medium text-on-primary hover:bg-primary-700 disabled:opacity-40">
            <Send className="h-4 w-4" /> Ask
          </button>
        </div>
      </form>
    </div>
  );
}

/** An Ask answer is recognised by its `status`; anything else is still an envelope. */
export function unwrapAnswer(res) {
  if (res && typeof res.status === 'string') return res;
  if (res?.data && typeof res.data.status === 'string') return res.data;
  return res ?? null;
}

function Turn({ turn, onPick, onViz, onSave, scope }) {
  const a = turn.answer;
  return (
    <div className="space-y-2">
      <div className="flex justify-end">
        <p className="max-w-xl rounded-2xl rounded-br-sm bg-primary-600 px-4 py-2 text-sm text-on-primary">{turn.question}</p>
      </div>

      {turn.error && <Bubble tone="error"><AlertTriangle className="h-4 w-4 shrink-0" /> {turn.error}</Bubble>}
      {!a && !turn.error && null}

      {a?.status === 'clarify' && (
        <Bubble tone="ask">
          <div>
            <p className="flex items-center gap-1.5 text-sm font-medium"><MessageCircleQuestion className="h-4 w-4" /> {a.clarification?.question}</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {(a.clarification?.options || []).map((o) => (
                <button key={o} type="button" onClick={() => onPick(o)} className="rounded-full border border-primary-300 bg-white px-3 py-1 text-xs text-primary-700 hover:bg-primary-50 dark:border-primary-500/40 dark:bg-transparent dark:text-primary-200">{o}</button>
              ))}
            </div>
          </div>
        </Bubble>
      )}
      {a?.status === 'plan_invalid' && (
        <Bubble tone="ask">
          <div>
            <p className="text-sm">{a.clarification?.question}</p>
            {a.plan_errors?.length > 0 && <ul className="mt-1 list-disc pl-4 text-xs opacity-80">{a.plan_errors.slice(0, 3).map((e) => <li key={e}>{e}</li>)}</ul>}
          </div>
        </Bubble>
      )}
      {a?.status === 'refused' && <Bubble tone="muted"><ShieldOff className="h-4 w-4 shrink-0" /> {a.refusal}</Bubble>}
      {a?.status === 'chitchat' && <Bubble tone="muted">{a.reply}</Bubble>}
      {['llm_unavailable', 'execution_error', 'disabled'].includes(a?.status) && <Bubble tone="error"><AlertTriangle className="h-4 w-4 shrink-0" /> {a.reply}</Bubble>}

      {(a?.status === 'success' || a?.status === 'no_data') && (
        <div className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-white/10 dark:bg-[#161b22]">
          <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-gray-900 dark:text-white">{a.interpretation?.title || 'Report'}</p>
              {a.interpretation?.description && <p className="text-xs text-gray-500 dark:text-white/50">{a.interpretation.description}</p>}
              {a.interpretation?.assumptions?.length > 0 && (
                <p className="mt-1 text-[11px] text-gray-400">Assumed: {a.interpretation.assumptions.join(' ')}</p>
              )}
            </div>
            <div className="flex items-center gap-1.5">
              <div className="flex rounded-lg border border-gray-200 p-0.5 dark:border-white/10" title="Show as">
                {[a.visualization?.type, ...(a.visualization?.alternatives || [])].filter(Boolean).slice(0, 5).map((v) => {
                  const Icon = VIZ_ICON[v] || Table;
                  const on = (turn.viz || a.visualization?.type) === v;
                  return (
                    <button key={v} type="button" onClick={() => onViz(v)} title={v} aria-label={`Show as ${v}`} className={clsx('rounded-md p-1.5', on ? 'bg-primary-600 text-on-primary' : 'text-gray-500 hover:bg-gray-100 dark:text-white/60 dark:hover:bg-white/10')}>
                      <Icon className="h-3.5 w-3.5" />
                    </button>
                  );
                })}
              </div>
              <button type="button" onClick={onSave} className="flex items-center gap-1 rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 dark:border-white/10 dark:text-white/70 dark:hover:bg-white/5">
                <Save className="h-3.5 w-3.5" /> Save as report
              </button>
            </div>
          </div>

          <ReportResult
            result={{ ...a.data, meta: { ...a.metadata, drilldown: !!a.data?.columns?.some((c) => c.dimension), grouped: true, warnings: a.metadata?.warnings || [] } }}
            viz={turn.viz || a.visualization?.type || 'table'}
            height={300}
            config={a.query?.config}
            scope={scope}
          />

          {a.narrative && (
            <p className="mt-3 rounded-lg border border-violet-200 bg-violet-50 px-3 py-2 text-sm leading-relaxed text-violet-900 dark:border-violet-500/20 dark:bg-violet-500/10 dark:text-violet-100">
              <Sparkles className="mr-1 inline h-3.5 w-3.5 align-text-top text-violet-500" /> {a.narrative}
            </p>
          )}
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {(a.suggestions || []).map((s) => (
              <button key={s} type="button" onClick={() => onPick(s)} className="rounded-full border border-gray-200 px-2.5 py-1 text-[11px] text-gray-600 hover:border-primary-300 hover:text-primary-700 dark:border-white/10 dark:text-white/60">{s}</button>
            ))}
            {a.timings?.total !== undefined && <span className="ml-auto text-[10px] text-gray-400">{(a.timings.total / 1000).toFixed(1)}s · {a.model?.name}</span>}
          </div>
        </div>
      )}
    </div>
  );
}

function Bubble({ tone, children }) {
  return (
    <div className={clsx(
      'flex max-w-2xl items-start gap-2 rounded-2xl rounded-bl-sm px-4 py-2.5 text-sm',
      tone === 'error' && 'bg-rose-50 text-rose-700 dark:bg-rose-500/10 dark:text-rose-300',
      tone === 'ask' && 'bg-primary-50 text-primary-900 dark:bg-primary-500/10 dark:text-primary-100',
      tone === 'muted' && 'bg-white text-gray-700 dark:bg-white/5 dark:text-white/70',
    )}>
      {children}
    </div>
  );
}

function Empty({ icon: Icon, title, children }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 p-16 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gray-100 text-gray-400 dark:bg-white/10"><Icon className="h-7 w-7" /></div>
      <p className="text-sm font-medium text-gray-700 dark:text-white/70">{title}</p>
      <p className="max-w-md text-xs text-gray-400">{children}</p>
    </div>
  );
}
