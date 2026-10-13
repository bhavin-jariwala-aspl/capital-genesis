import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ShieldCheck, AlertTriangle, Flame, CheckCircle2, ArrowRight, Clock } from 'lucide-react';
import clsx from 'clsx';
import { slaService } from '../../services/sla.service';
import { useNow } from '../../hooks/useNow';
import { SLA_STATUS, timerState, countdown, PRIORITY_LABEL, ENTITY_SINGULAR } from '../../utils/sla';

/** Circular on-time-compliance gauge. */
function Gauge({ value, danger }) {
  const pct = value == null ? 0 : Math.max(0, Math.min(100, value));
  const r = 34, c = 2 * Math.PI * r;
  const color = value == null ? 'text-gray-300 dark:text-white/15'
    : pct >= 90 ? 'text-emerald-500' : pct >= 75 ? 'text-amber-500' : 'text-rose-500';
  return (
    <div className="relative flex h-[92px] w-[92px] shrink-0 items-center justify-center">
      <svg className="h-full w-full -rotate-90" viewBox="0 0 80 80">
        <circle cx="40" cy="40" r={r} strokeWidth="7" className="stroke-gray-100 dark:stroke-white/10" fill="none" />
        <circle
          cx="40" cy="40" r={r} strokeWidth="7" fill="none" strokeLinecap="round"
          className={clsx('transition-all duration-700', color)}
          stroke="currentColor"
          strokeDasharray={c}
          strokeDashoffset={c - (pct / 100) * c}
        />
      </svg>
      <div className="absolute flex flex-col items-center">
        <span className="text-xl font-bold text-gray-900 dark:text-white">{value == null ? '—' : `${Math.round(pct)}%`}</span>
        <span className="text-[9px] font-medium uppercase tracking-wide text-gray-400">on time</span>
      </div>
      {danger > 0 && (
        <span className="absolute -right-1 -top-1 flex h-5 min-w-[20px] items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white ring-2 ring-white dark:ring-[#161b22]">
          {danger}
        </span>
      )}
    </div>
  );
}

function Counter({ icon: Icon, count, label, tone, pulse }) {
  return (
    <Link
      to="/sla"
      className={clsx(
        'group flex items-center gap-2.5 rounded-xl border px-3 py-2 transition hover:shadow-sm',
        tone.bg, 'border-transparent hover:border-current',
      )}
    >
      <span className={clsx('relative flex h-8 w-8 items-center justify-center rounded-lg', tone.solid, 'text-white')}>
        <Icon className="h-4 w-4" />
        {pulse && count > 0 && <span className={clsx('absolute inset-0 animate-ping rounded-lg opacity-40', tone.solid)} />}
      </span>
      <div className="leading-tight">
        <div className={clsx('text-lg font-bold', tone.text)}>{count}</div>
        <div className="text-[11px] font-medium text-gray-500 dark:text-white/50">{label}</div>
      </div>
    </Link>
  );
}

function UrgentChip({ timer, now }) {
  const state = timerState(timer, now);
  const tone = SLA_STATUS[state];
  const cd = countdown(timer.due_at, now);
  return (
    <Link
      to="/sla"
      className="flex min-w-[180px] shrink-0 items-center gap-2.5 rounded-xl border border-gray-200 bg-white px-3 py-2 transition hover:border-gray-300 hover:shadow-sm dark:border-white/10 dark:bg-white/[0.03] dark:hover:border-white/20"
    >
      <span className={clsx('h-8 w-1 shrink-0 rounded-full', tone.solid)} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-semibold text-gray-900 dark:text-white">{timer.label}</p>
        <p className="truncate text-[10px] text-gray-400">{ENTITY_SINGULAR[timer.entity_type]} · {timer.metric_label}</p>
      </div>
      <div className="text-right">
        <div className={clsx('flex items-center gap-1 text-xs font-bold tabular-nums', tone.text)}>
          <Clock className="h-3 w-3" />{cd.text}
        </div>
        <div className="text-[9px] uppercase tracking-wide text-gray-400">{PRIORITY_LABEL(timer.priority)}</div>
      </div>
    </Link>
  );
}

export default function SlaRadiator() {
  const now = useNow(1000);

  const { data, isLoading } = useQuery({
    queryKey: ['sla-dashboard', 'me'],
    queryFn: () => slaService.getDashboard('me'),
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
  });

  const d = data?.data ?? data;
  const s = d?.summary;
  const timers = d?.timers ?? [];

  if (isLoading) {
    return <div className="mx-6 mt-4 h-[124px] animate-pulse rounded-2xl border border-gray-200 bg-gray-50 dark:border-white/10 dark:bg-white/5" />;
  }

  // When there are no SLAs yet, show nothing on the Dashboard. Setup lives in
  // the left sidebar under Builder → Automate → "SLA Engine".
  const isEmpty = !s || (s.active === 0 && s.completed === 0 && timers.length === 0);
  if (isEmpty) return null;

  const urgent = timers.filter((t) => t.status !== 'met').slice(0, 4);

  return (
    <div className="relative mx-6 mt-4 overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-white/10 dark:bg-[#161b22]">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-primary-500/[0.07] to-transparent" />
      <div className="relative p-4">
        {/* Header */}
        <div className="mb-3 flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-primary-500" />
          <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Service Levels</h2>
          <span className="flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-600 dark:text-emerald-300">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" /> live
          </span>
          <Link to="/sla" className="ml-auto flex items-center gap-1 text-xs font-medium text-primary-600 hover:text-primary-700 dark:text-primary-300">
            SLA board <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>

        <div className="flex flex-col gap-4 lg:flex-row lg:items-center">
          {/* Gauge + counters */}
          <div className="flex items-center gap-4">
            <Gauge value={s.compliance} danger={s.breached} />
            <div className="grid grid-cols-3 gap-2">
              <Counter icon={Flame}        count={s.breached}  label="Breached" tone={SLA_STATUS.breached} pulse />
              <Counter icon={AlertTriangle} count={s.at_risk}   label="At risk"  tone={SLA_STATUS.at_risk} />
              <Counter icon={CheckCircle2}  count={s.on_track}  label="On track" tone={SLA_STATUS.on_track} />
            </div>
          </div>

          {/* Urgent countdowns */}
          <div className="min-w-0 flex-1">
            {urgent.length > 0 ? (
              <div className="flex gap-2 overflow-x-auto pb-1">
                {urgent.map((t) => <UrgentChip key={t.id} timer={t} now={now} />)}
              </div>
            ) : (
              <div className="flex items-center gap-2 rounded-xl bg-emerald-500/5 px-4 py-3 text-sm text-emerald-700 dark:text-emerald-300">
                <CheckCircle2 className="h-4 w-4" /> All of your SLAs are on track. Nice work.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
