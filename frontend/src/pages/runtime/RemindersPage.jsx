import { useMemo, useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { reminderService } from '../../services/reminder.service';
import { Bell, BellRing, CheckCircle2, Clock, Flag, Plus, X } from 'lucide-react';
import clsx from 'clsx';

const PRIORITY_META = {
  low:    { label: 'Low',    color: 'text-gray-400   bg-gray-50    dark:bg-white/5' },
  normal: { label: 'Normal', color: 'text-blue-500   bg-blue-50    dark:bg-blue-950/30' },
  high:   { label: 'High',   color: 'text-orange-500 bg-orange-50  dark:bg-orange-950/30' },
  urgent: { label: 'Urgent', color: 'text-red-500    bg-red-50     dark:bg-red-950/30' },
};

function startOfDay(d) { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; }

/** Bucket a reminder by its remind_at relative to now. */
function bucketOf(remindAt) {
  const now = new Date();
  const d = new Date(remindAt);
  if (d < now) return 'overdue';
  const today = startOfDay(now);
  const tomorrow = new Date(today); tomorrow.setDate(today.getDate() + 1);
  const weekEnd = new Date(today); weekEnd.setDate(today.getDate() + 7);
  if (d < tomorrow) return 'today';
  const dayAfter = new Date(tomorrow); dayAfter.setDate(tomorrow.getDate() + 1);
  if (d < dayAfter) return 'tomorrow';
  if (d < weekEnd) return 'week';
  return 'later';
}

const BUCKETS = [
  { key: 'overdue',  label: 'Overdue',    tone: 'text-red-500' },
  { key: 'today',    label: 'Today',      tone: 'text-primary-500' },
  { key: 'tomorrow', label: 'Tomorrow',   tone: 'text-gray-500 dark:text-white/50' },
  { key: 'week',     label: 'This Week',  tone: 'text-gray-500 dark:text-white/50' },
  { key: 'later',    label: 'Later',      tone: 'text-gray-400 dark:text-white/40' },
];

function presetIso(kind) {
  const d = new Date();
  if (kind === '1h') d.setHours(d.getHours() + 1);
  else if (kind === 'tomorrow') { d.setDate(d.getDate() + 1); d.setHours(9, 0, 0, 0); }
  else if (kind === 'nextweek') { d.setDate(d.getDate() + 7); d.setHours(9, 0, 0, 0); }
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function RemindersPage() {
  const qc = useQueryClient();
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ title: '', remind_at: presetIso('1h'), priority: 'normal', note: '' });

  const { data, isLoading } = useQuery({
    queryKey: ['my-reminders'],
    queryFn:  () => reminderService.getMyReminders('open').then(r => r.data ?? []),
    staleTime: 15_000,
  });

  const invalidate = useCallback(() => {
    qc.invalidateQueries({ queryKey: ['my-reminders'] });
    qc.invalidateQueries({ queryKey: ['notif-count'] });
    // The record panels' reminder lists (['reminders', recordId]).
    qc.invalidateQueries({ queryKey: ['reminders'] });
  }, [qc]);

  const create   = useMutation({ mutationFn: () => reminderService.createReminder({ ...form, remind_at: new Date(form.remind_at).toISOString() }), onSuccess: () => { invalidate(); setForm({ title: '', remind_at: presetIso('1h'), priority: 'normal', note: '' }); setShowAdd(false); } });
  const complete = useMutation({ mutationFn: (id) => reminderService.completeReminder(id), onSuccess: invalidate });
  const dismiss  = useMutation({ mutationFn: (id) => reminderService.dismissReminder(id),  onSuccess: invalidate });
  const snooze   = useMutation({ mutationFn: ({ id, minutes }) => reminderService.snoozeReminder(id, { minutes }), onSuccess: invalidate });

  const grouped = useMemo(() => {
    const g = {};
    for (const r of (data ?? [])) {
      const b = bucketOf(r.remind_at);
      (g[b] ||= []).push(r);
    }
    return g;
  }, [data]);

  const total = data?.length ?? 0;

  const Row = ({ r }) => {
    const d = new Date(r.remind_at);
    const overdue = d < new Date();
    const pm = PRIORITY_META[r.priority] ?? PRIORITY_META.normal;
    const Icon = overdue ? BellRing : Bell;
    return (
      <div className="flex items-start gap-3 px-4 py-3 group hover:bg-gray-50/70 dark:hover:bg-white/5 rounded-xl transition-colors">
        <button onClick={() => complete.mutate(r.id)} title="Mark done" className="mt-0.5 shrink-0 text-gray-300 hover:text-green-500 transition-colors">
          <CheckCircle2 className="w-5 h-5" />
        </button>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-gray-800 dark:text-white/90 leading-tight">{r.title}</p>
          {r.note && <p className="text-xs text-gray-400 dark:text-white/30 mt-0.5 line-clamp-1">{r.note}</p>}
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            <span className={clsx('text-[11px] flex items-center gap-1', overdue ? 'text-red-500 font-medium' : 'text-gray-400 dark:text-white/40')}>
              <Icon className="w-3 h-3" /> {d.toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
            </span>
            <span className={clsx('text-[10px] font-medium px-1.5 py-0.5 rounded-full', pm.color)}>
              <Flag className="w-2.5 h-2.5 inline mr-0.5" />{pm.label}
            </span>
          </div>
        </div>
        <div className="shrink-0 flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-all">
          <button onClick={() => snooze.mutate({ id: r.id, minutes: 60 })} title="Snooze 1 hour" className="text-gray-300 hover:text-primary-500"><Clock className="w-4 h-4" /></button>
          <button onClick={() => dismiss.mutate(r.id)} title="Dismiss" className="text-gray-300 hover:text-gray-500"><X className="w-4 h-4" /></button>
        </div>
      </div>
    );
  };

  return (
    <div className="max-w-3xl mx-auto px-6 py-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <Bell className="w-5 h-5 text-primary-500" /> My Reminders
          </h1>
          <p className="text-sm text-gray-400 mt-0.5">{total} open reminder{total === 1 ? '' : 's'} · you&apos;ll get a notification when each is due</p>
        </div>
        <button onClick={() => setShowAdd(s => !s)} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-primary-600 text-on-primary text-sm font-medium hover:bg-primary-700 transition-colors">
          <Plus className="w-4 h-4" /> New Reminder
        </button>
      </div>

      {showAdd && (
        <div className="rounded-2xl border border-gray-200 dark:border-white/10 bg-white dark:bg-night-2 p-4 space-y-3 mb-6 shadow-card">
          <input className="form-input w-full text-sm" placeholder="Remind me to… *" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} />
          <div className="grid grid-cols-2 gap-3">
            <input type="datetime-local" className="form-input text-sm" value={form.remind_at} onChange={e => setForm(f => ({ ...f, remind_at: e.target.value }))} />
            <select className="form-input text-sm" value={form.priority} onChange={e => setForm(f => ({ ...f, priority: e.target.value }))}>
              {Object.entries(PRIORITY_META).map(([v, m]) => <option key={v} value={v}>{m.label}</option>)}
            </select>
          </div>
          <div className="flex items-center gap-1.5 flex-wrap">
            {[['1h', 'In 1 hour'], ['tomorrow', 'Tomorrow 9am'], ['nextweek', 'Next week']].map(([k, label]) => (
              <button key={k} onClick={() => setForm(f => ({ ...f, remind_at: presetIso(k) }))} className="text-[11px] px-2 py-1 rounded-full bg-gray-50 dark:bg-white/10 border border-gray-200 dark:border-white/10 text-gray-500 dark:text-white/60 hover:border-primary-400 hover:text-primary-600">{label}</button>
            ))}
          </div>
          <div className="flex items-center justify-end gap-2">
            <button onClick={() => setShowAdd(false)} className="text-sm text-gray-500 hover:text-gray-700 dark:text-white/50">Cancel</button>
            <button disabled={!form.title.trim() || create.isPending} onClick={() => create.mutate()} className="px-3 py-1.5 rounded-lg bg-primary-600 text-on-primary text-sm font-medium hover:bg-primary-700 disabled:opacity-50">
              {create.isPending ? 'Saving…' : 'Set Reminder'}
            </button>
          </div>
        </div>
      )}

      {isLoading ? (
        <p className="text-sm text-gray-400 text-center py-12">Loading…</p>
      ) : total === 0 ? (
        <div className="text-center py-16">
          <Bell className="w-10 h-10 text-gray-200 dark:text-white/10 mx-auto mb-3" />
          <p className="text-sm text-gray-400">No open reminders. Create one above, or set reminders on any Lead, Prospect, or Client.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {BUCKETS.map(b => {
            const items = grouped[b.key];
            if (!items?.length) return null;
            return (
              <div key={b.key}>
                <h2 className={clsx('text-xs font-semibold uppercase tracking-widest mb-1.5 px-4', b.tone)}>{b.label} · {items.length}</h2>
                <div className="rounded-2xl border border-gray-100/80 dark:border-white/[0.07] bg-white dark:bg-night-2 shadow-card divide-y divide-gray-50 dark:divide-white/5">
                  {items.map(r => <Row key={r.id} r={r} />)}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
