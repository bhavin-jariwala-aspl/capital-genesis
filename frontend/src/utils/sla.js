/**
 * Shared SLA presentation helpers — live countdowns and status theming.
 * Status colours are semantic (red = breach, amber = at-risk, green = on-track)
 * so they read instantly on an information radiator, layered on the app's
 * indigo brand for neutral chrome.
 */

export const SLA_STATUS = {
  breached:  { label: 'Breached',  text: 'text-rose-600 dark:text-rose-300',    bg: 'bg-rose-500/10',    ring: 'text-rose-500',    dot: 'bg-rose-500',    solid: 'bg-rose-500' },
  at_risk:   { label: 'At risk',   text: 'text-amber-600 dark:text-amber-300',  bg: 'bg-amber-500/10',   ring: 'text-amber-500',   dot: 'bg-amber-500',   solid: 'bg-amber-500' },
  on_track:  { label: 'On track',  text: 'text-emerald-600 dark:text-emerald-300', bg: 'bg-emerald-500/10', ring: 'text-emerald-500', dot: 'bg-emerald-500', solid: 'bg-emerald-500' },
  met:       { label: 'Met',       text: 'text-emerald-600 dark:text-emerald-300', bg: 'bg-emerald-500/10', ring: 'text-emerald-500', dot: 'bg-emerald-500', solid: 'bg-emerald-500' },
  met_late:  { label: 'Met late',  text: 'text-amber-600 dark:text-amber-300',  bg: 'bg-amber-500/10',   ring: 'text-amber-500',   dot: 'bg-amber-500',   solid: 'bg-amber-500' },
  paused:    { label: 'Paused',    text: 'text-slate-500 dark:text-white/50',   bg: 'bg-slate-500/10',   ring: 'text-slate-400',   dot: 'bg-slate-400',   solid: 'bg-slate-400' },
};

/** Live status of an open timer given the current time. */
export function timerState(timer, nowMs = Date.now()) {
  if (timer.status === 'paused') return 'paused';
  const due = new Date(timer.due_at).getTime();
  const warn = new Date(timer.warning_at).getTime();
  if (timer.status === 'breached' || timer.breached || nowMs > due) return 'breached';
  if (nowMs >= warn) return 'at_risk';
  return 'on_track';
}

/** Compact duration like "2h 14m", "3d 1h", "45m", "8s". */
function formatDuration(ms) {
  const s = Math.floor(Math.abs(ms) / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${sec}s`;
  return `${sec}s`;
}

/** Countdown text + overdue flag for a due date. */
export function countdown(dueIso, nowMs = Date.now()) {
  const ms = new Date(dueIso).getTime() - nowMs;
  const overdue = ms < 0;
  return { ms, overdue, text: overdue ? `${formatDuration(ms)} over` : formatDuration(ms) };
}

/** Fraction of the SLA window elapsed (0→1+), for progress meters. */
export function elapsedFraction(timer, nowMs = Date.now()) {
  const start = new Date(timer.started_at).getTime();
  const due = new Date(timer.due_at).getTime();
  if (due <= start) return 1;
  return Math.max(0, Math.min(1.25, (nowMs - start) / (due - start)));
}

export const PRIORITY_LABEL = (p) => (p === '*' ? 'Default' : String(p).replace(/_/g, ' '));
export const ENTITY_LABEL = { case: 'Cases', lead: 'Leads', task: 'Tasks', record: 'Records of an object' };
export const ENTITY_SINGULAR = { case: 'Case', lead: 'Lead', task: 'Task', record: 'Record' };
