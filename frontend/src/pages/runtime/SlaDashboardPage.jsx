import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  ShieldCheck, Flame, AlertTriangle, CheckCircle2, Activity, Clock,
  RefreshCw, Settings2, Users, User, Globe, Gauge as GaugeIcon,
} from 'lucide-react';
import clsx from 'clsx';
import { slaService } from '../../services/sla.service';
import { useAuthStore } from '../../store/authStore';
import { useNow } from '../../hooks/useNow';
import {
  SLA_STATUS, timerState, countdown, elapsedFraction,
  PRIORITY_LABEL, ENTITY_LABEL, ENTITY_SINGULAR,
} from '../../utils/sla';

function Gauge({ value }) {
  const pct = value == null ? 0 : Math.max(0, Math.min(100, value));
  const r = 52, c = 2 * Math.PI * r;
  const color = value == null ? 'text-gray-300 dark:text-white/15'
    : pct >= 90 ? 'text-emerald-500' : pct >= 75 ? 'text-amber-500' : 'text-rose-500';
  return (
    <div className="relative flex h-36 w-36 items-center justify-center">
      <svg className="h-full w-full -rotate-90" viewBox="0 0 120 120">
        <circle cx="60" cy="60" r={r} strokeWidth="10" className="stroke-gray-100 dark:stroke-white/10" fill="none" />
        <circle cx="60" cy="60" r={r} strokeWidth="10" fill="none" strokeLinecap="round"
          className={clsx('transition-all duration-700', color)} stroke="currentColor"
          strokeDasharray={c} strokeDashoffset={c - (pct / 100) * c} />
      </svg>
      <div className="absolute flex flex-col items-center">
        <span className="text-3xl font-bold text-gray-900 dark:text-white">{value == null ? '—' : `${Math.round(pct)}%`}</span>
        <span className="text-[10px] font-medium uppercase tracking-wide text-gray-400">on-time</span>
      </div>
    </div>
  );
}

function StatCard({ icon: Icon, label, value, tone, sub }) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-white/10 dark:bg-[#161b22]">
      <div className="flex items-center gap-2">
        <span className={clsx('flex h-8 w-8 items-center justify-center rounded-lg', tone?.bg || 'bg-primary-500/10', tone?.text || 'text-primary-500')}>
          <Icon className="h-4 w-4" />
        </span>
        <span className="text-xs font-medium text-gray-500 dark:text-white/50">{label}</span>
      </div>
      <div className="mt-2 text-2xl font-bold text-gray-900 dark:text-white">{value}</div>
      {sub && <div className="text-[11px] text-gray-400">{sub}</div>}
    </div>
  );
}

function BarRow({ label, total, at_risk, breached }) {
  const ok = Math.max(0, total - at_risk - breached);
  const seg = (n, cls) => n > 0 && <div className={clsx('h-full', cls)} style={{ width: `${(n / total) * 100}%` }} />;
  return (
    <div className="flex items-center gap-3">
      <span className="w-24 shrink-0 truncate text-xs font-medium capitalize text-gray-600 dark:text-white/70">{label}</span>
      <div className="flex h-2.5 flex-1 overflow-hidden rounded-full bg-gray-100 dark:bg-white/5">
        {seg(breached, 'bg-rose-500')}{seg(at_risk, 'bg-amber-500')}{seg(ok, 'bg-emerald-500')}
      </div>
      <span className="w-8 shrink-0 text-right text-xs font-semibold text-gray-500 dark:text-white/60">{total}</span>
    </div>
  );
}

function TimerRow({ timer, now }) {
  const state = timerState(timer, now);
  const tone = SLA_STATUS[state];
  const cd = countdown(timer.due_at, now);
  const frac = elapsedFraction(timer, now);
  return (
    <Link to="/sla" className="grid grid-cols-12 items-center gap-2 px-4 py-3 transition hover:bg-gray-50 dark:hover:bg-white/[0.03]">
      <div className="col-span-5 flex min-w-0 items-center gap-2.5">
        <span className={clsx('h-8 w-1.5 shrink-0 rounded-full', tone.solid)} />
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-gray-900 dark:text-white">{timer.label}</p>
          <p className="truncate text-[11px] text-gray-400">
            <span className="rounded bg-gray-100 px-1.5 py-0.5 font-medium dark:bg-white/10">{ENTITY_SINGULAR[timer.entity_type]}</span>
            {' '}{timer.metric_label}{timer.sub ? ` · ${timer.sub}` : ''}
          </p>
        </div>
      </div>
      <div className="col-span-2 hidden text-xs capitalize text-gray-500 dark:text-white/60 sm:block">{PRIORITY_LABEL(timer.priority)}</div>
      <div className="col-span-2 hidden truncate text-xs text-gray-500 dark:text-white/60 md:block">{timer.owner_name || '—'}</div>
      <div className="col-span-3 flex items-center justify-end gap-2 sm:col-span-3">
        <div className="hidden h-1.5 w-20 overflow-hidden rounded-full bg-gray-100 dark:bg-white/10 lg:block">
          <div className={clsx('h-full rounded-full', tone.solid)} style={{ width: `${Math.min(100, frac * 100)}%` }} />
        </div>
        <span className={clsx('flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-bold tabular-nums', tone.bg, tone.text)}>
          <Clock className="h-3 w-3" />{cd.text}
        </span>
      </div>
    </Link>
  );
}

const SCOPES = [
  { key: 'me', label: 'My SLAs', icon: User, minLevel: 99 },
  { key: 'team', label: 'My team', icon: Users, minLevel: 4 },
  { key: 'all', label: 'Everyone', icon: Globe, minLevel: 3 },
];

export default function SlaDashboardPage() {
  const employee = useAuthStore((s) => s.employee);
  const isAdmin = useAuthStore((s) => s.isAdmin());
  const level = employee?.role_level ?? 5;
  const now = useNow(1000);
  const [scope, setScope] = useState('me');
  const [filter, setFilter] = useState('open'); // open | breached | at_risk

  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ['sla-dashboard', scope],
    queryFn: () => slaService.getDashboard(scope),
    refetchInterval: 30_000,
  });
  const d = data?.data ?? data;
  const s = d?.summary;
  const timers = useMemo(() => d?.timers ?? [], [d]);

  const filtered = useMemo(() => {
    const open = timers.filter((t) => t.status !== 'met');
    if (filter === 'breached') return open.filter((t) => timerState(t, now) === 'breached');
    if (filter === 'at_risk') return open.filter((t) => timerState(t, now) === 'at_risk');
    return open;
  }, [timers, filter, now]);

  const availableScopes = SCOPES.filter((sc) => level <= sc.minLevel);
  const isEmpty = !s || (s.active === 0 && s.completed === 0 && timers.length === 0);

  return (
    <div className="h-full overflow-auto bg-gray-50 dark:bg-[#0d1117]">
      {/* Header */}
      <div className="sticky top-0 z-10 border-b border-gray-200 bg-white/80 px-6 py-4 backdrop-blur dark:border-white/10 dark:bg-[#161b22]/80">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-primary-500 to-mid-600 text-on-primary">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-lg font-semibold text-gray-900 dark:text-white">SLA Board</h1>
              <p className="text-xs text-gray-500 dark:text-white/50">Live service-level tracking across cases, leads &amp; tasks</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {availableScopes.length > 1 && (
              <div className="flex rounded-lg border border-gray-200 p-0.5 dark:border-white/10">
                {availableScopes.map((sc) => (
                  <button key={sc.key} onClick={() => setScope(sc.key)}
                    className={clsx('flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition',
                      scope === sc.key ? 'bg-primary-600 text-on-primary' : 'text-gray-500 hover:bg-gray-100 dark:text-white/60 dark:hover:bg-white/10')}>
                    <sc.icon className="h-4 w-4" />{sc.label}
                  </button>
                ))}
              </div>
            )}
            <button onClick={() => refetch()} title="Refresh"
              className="rounded-lg border border-gray-200 p-2 text-gray-500 hover:bg-gray-50 dark:border-white/10 dark:text-white/60 dark:hover:bg-white/5">
              <RefreshCw className={clsx('h-4 w-4', isFetching && 'animate-spin')} />
            </button>
            {isAdmin && (
              <Link to="/builder/sla" className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 dark:border-white/10 dark:text-white/70 dark:hover:bg-white/5">
                <Settings2 className="h-4 w-4" /> Configure
              </Link>
            )}
          </div>
        </div>
      </div>

      {isLoading ? (
        <div className="grid gap-4 p-6 md:grid-cols-3">
          {[...Array(6)].map((_, i) => <div key={i} className="h-28 animate-pulse rounded-2xl bg-gray-100 dark:bg-white/5" />)}
        </div>
      ) : isEmpty ? (
        <div className="flex flex-col items-center justify-center gap-3 p-20 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary-500/10 text-primary-500"><ShieldCheck className="h-7 w-7" /></div>
          <p className="text-sm font-medium text-gray-700 dark:text-white/70">No SLA timers yet for this view.</p>
          <p className="max-w-sm text-xs text-gray-400">
            SLAs attach to open cases, leads and tasks once policies are configured.
            {isAdmin ? ' Define your first policy to begin tracking.' : ' Your administrator can set these up.'}
          </p>
          {isAdmin && <Link to="/builder/sla" className="mt-1 rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-on-primary hover:bg-primary-700">Configure SLAs</Link>}
        </div>
      ) : (
        <div className="space-y-4 p-6">
          {/* KPI row */}
          <div className="grid gap-4 lg:grid-cols-[auto_1fr]">
            <div className="flex items-center gap-5 rounded-2xl border border-gray-200 bg-white p-5 dark:border-white/10 dark:bg-[#161b22]">
              <Gauge value={s.compliance} />
              <div>
                <p className="text-sm font-semibold text-gray-900 dark:text-white">On-time compliance</p>
                <p className="text-xs text-gray-400">{s.met_on_time} on time · {s.met_late} late of {s.completed} completed</p>
                <div className="mt-3 flex gap-4 text-xs">
                  <span className="flex items-center gap-1.5 text-gray-500 dark:text-white/60"><span className="h-2 w-2 rounded-full bg-emerald-500" /> {s.met_on_time} met</span>
                  <span className="flex items-center gap-1.5 text-gray-500 dark:text-white/60"><span className="h-2 w-2 rounded-full bg-amber-500" /> {s.met_late} late</span>
                </div>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <StatCard icon={Activity}     label="Active"   value={s.active}   tone={{ bg: 'bg-primary-500/10', text: 'text-primary-500' }} sub="open timers" />
              <StatCard icon={CheckCircle2} label="On track" value={s.on_track} tone={SLA_STATUS.on_track} />
              <StatCard icon={AlertTriangle} label="At risk"  value={s.at_risk}  tone={SLA_STATUS.at_risk} />
              <StatCard icon={Flame}        label="Breached" value={s.breached} tone={SLA_STATUS.breached} sub="needs action" />
            </div>
          </div>

          {/* Breakdown */}
          <div className="grid gap-4 md:grid-cols-3">
            <BreakdownCard title="By priority" icon={GaugeIcon}
              rows={Object.entries(d.breakdown.by_priority).map(([k, v]) => ({ label: PRIORITY_LABEL(k), ...v }))} />
            <BreakdownCard title="By record type" icon={Activity}
              rows={Object.entries(d.breakdown.by_entity).map(([k, v]) => ({ label: ENTITY_LABEL[k] || k, ...v }))} />
            <BreakdownCard title="By policy" icon={ShieldCheck}
              rows={(d.breakdown.by_policy || []).map((p) => ({ label: p.name, ...p }))} />
          </div>

          {/* Live timers */}
          <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-white/10 dark:bg-[#161b22]">
            <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3 dark:border-white/10">
              <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Live timers</h2>
              <div className="flex rounded-lg border border-gray-200 p-0.5 text-xs dark:border-white/10">
                {[['open', 'Open'], ['at_risk', 'At risk'], ['breached', 'Breached']].map(([k, l]) => (
                  <button key={k} onClick={() => setFilter(k)}
                    className={clsx('rounded-md px-2.5 py-1 font-medium transition',
                      filter === k ? 'bg-primary-600 text-on-primary' : 'text-gray-500 hover:bg-gray-100 dark:text-white/60 dark:hover:bg-white/10')}>
                    {l}
                  </button>
                ))}
              </div>
            </div>
            <div className="hidden grid-cols-12 gap-2 border-b border-gray-100 px-4 py-2 text-[11px] font-medium uppercase tracking-wide text-gray-400 dark:border-white/5 sm:grid">
              <span className="col-span-5">Record</span>
              <span className="col-span-2">Priority</span>
              <span className="col-span-2 hidden md:block">Owner</span>
              <span className="col-span-3 text-right">Time remaining</span>
            </div>
            <div className="divide-y divide-gray-100 dark:divide-white/5">
              {filtered.length === 0 ? (
                <div className="flex items-center gap-2 px-4 py-8 text-sm text-emerald-600 dark:text-emerald-300">
                  <CheckCircle2 className="h-4 w-4" /> Nothing here — no {filter === 'open' ? 'open' : filter.replace('_', ' ')} SLAs in this view.
                </div>
              ) : (
                filtered.map((t) => <TimerRow key={t.id} timer={t} now={now} />)
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function BreakdownCard({ title, icon: Icon, rows }) {
  const sorted = [...rows].sort((a, b) => (b.breached - a.breached) || (b.total - a.total));
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-white/10 dark:bg-[#161b22]">
      <div className="mb-3 flex items-center gap-2">
        <Icon className="h-4 w-4 text-primary-500" />
        <h3 className="text-sm font-semibold text-gray-900 dark:text-white">{title}</h3>
      </div>
      <div className="space-y-2.5">
        {sorted.length === 0 ? <p className="text-xs text-gray-400">No data.</p>
          : sorted.map((r, i) => <BarRow key={i} {...r} />)}
      </div>
    </div>
  );
}
