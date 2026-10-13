import { useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { reminderService } from '../../services/reminder.service';
import { Bell, BellRing, CheckCircle2, Clock, Flag, Plus, X, ChevronDown } from 'lucide-react';
import clsx from 'clsx';

const PRIORITY_META = {
  low:    { label: 'Low',    color: 'text-gray-400  bg-gray-50   dark:bg-white/5' },
  normal: { label: 'Normal', color: 'text-blue-500  bg-blue-50   dark:bg-blue-950/30' },
  high:   { label: 'High',   color: 'text-orange-500 bg-orange-50 dark:bg-orange-950/30' },
  urgent: { label: 'Urgent', color: 'text-red-500   bg-red-50    dark:bg-red-950/30' },
};

// Quick presets, mirroring the one-click reminder times in Salesforce/HubSpot/Pipedrive.
function presetIso(kind) {
  const d = new Date();
  if (kind === '1h')       d.setHours(d.getHours() + 1);
  else if (kind === 'tomorrow') { d.setDate(d.getDate() + 1); d.setHours(9, 0, 0, 0); }
  else if (kind === 'nextweek') { d.setDate(d.getDate() + 7); d.setHours(9, 0, 0, 0); }
  // format for datetime-local (local time, no seconds/zone)
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fmtWhen(date) {
  const d = new Date(date);
  const now = new Date();
  const opts = { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' };
  const label = d.toLocaleString(undefined, opts);
  return d < now ? { text: `Overdue · ${label}`, overdue: true } : { text: label, overdue: false };
}

function AddReminderForm({ recordId, onDone }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ title: '', remind_at: presetIso('1h'), priority: 'normal', note: '' });

  const create = useMutation({
    mutationFn: () => reminderService.createReminder({
      ...form,
      record_id: recordId,
      remind_at: new Date(form.remind_at).toISOString(),
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['reminders', recordId] });
      qc.invalidateQueries({ queryKey: ['my-reminders'] });
      setForm({ title: '', remind_at: presetIso('1h'), priority: 'normal', note: '' });
      setOpen(false);
      onDone?.();
    },
  });

  const handleClose  = useCallback(() => setOpen(false), []);
  const handleCreate = useCallback(() => create.mutate(), [create]);

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="flex items-center gap-2 text-sm text-primary-600 hover:text-primary-700 font-medium py-2">
        <Plus className="w-4 h-4" /> Add Reminder
      </button>
    );
  }

  return (
    <div className="rounded-xl border border-gray-200 dark:border-white/10 bg-gray-50 dark:bg-white/5 p-4 space-y-3 mb-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-gray-700 dark:text-white/80">New Reminder</p>
        <button onClick={handleClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-white/60">
          <X className="w-4 h-4" />
        </button>
      </div>
      <input
        className="form-input w-full text-sm"
        placeholder="Remind me to… *"
        value={form.title}
        onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
      />
      <div className="grid grid-cols-2 gap-3">
        <input
          type="datetime-local"
          className="form-input text-sm"
          value={form.remind_at}
          onChange={e => setForm(f => ({ ...f, remind_at: e.target.value }))}
        />
        <select
          className="form-input text-sm"
          value={form.priority}
          onChange={e => setForm(f => ({ ...f, priority: e.target.value }))}
        >
          {Object.entries(PRIORITY_META).map(([v, m]) => (
            <option key={v} value={v}>{m.label}</option>
          ))}
        </select>
      </div>
      <div className="flex items-center gap-1.5 flex-wrap">
        {[['1h', 'In 1 hour'], ['tomorrow', 'Tomorrow 9am'], ['nextweek', 'Next week']].map(([k, label]) => (
          <button
            key={k}
            onClick={() => setForm(f => ({ ...f, remind_at: presetIso(k) }))}
            className="text-[11px] px-2 py-1 rounded-full bg-white dark:bg-white/10 border border-gray-200 dark:border-white/10 text-gray-500 dark:text-white/60 hover:border-primary-400 hover:text-primary-600"
          >
            {label}
          </button>
        ))}
      </div>
      <textarea
        className="form-input w-full text-sm"
        rows={2}
        placeholder="Note (optional)"
        value={form.note}
        onChange={e => setForm(f => ({ ...f, note: e.target.value }))}
      />
      <div className="flex items-center justify-end gap-2 pt-1">
        <button onClick={handleClose} className="text-sm text-gray-500 hover:text-gray-700 dark:text-white/50 dark:hover:text-white/80">Cancel</button>
        <button
          disabled={!form.title.trim() || !form.remind_at || create.isPending}
          onClick={handleCreate}
          className="px-3 py-1.5 rounded-lg bg-primary-600 text-on-primary text-sm font-medium hover:bg-primary-700 disabled:opacity-50 transition-colors"
        >
          {create.isPending ? 'Saving…' : 'Set Reminder'}
        </button>
      </div>
    </div>
  );
}

function ReminderRow({ reminder, onComplete, onSnooze, onDismiss, onDelete }) {
  const [snoozeOpen, setSnoozeOpen] = useState(false);
  const closed = ['done', 'dismissed', 'cancelled'].includes(reminder.status);
  const pm = PRIORITY_META[reminder.priority] ?? PRIORITY_META.normal;
  const when = fmtWhen(reminder.remind_at);
  const RingIcon = when.overdue && !closed ? BellRing : Bell;
  return (
    <div className="flex items-start gap-3 py-2.5 group border-b border-gray-100 dark:border-white/5 last:border-0">
      <button
        onClick={() => onComplete(reminder.id)}
        disabled={closed}
        title="Mark done"
        className={clsx('mt-0.5 shrink-0 transition-colors', reminder.status === 'done' ? 'text-green-500' : 'text-gray-300 hover:text-green-500', closed && 'cursor-default')}
      >
        {reminder.status === 'done' ? <CheckCircle2 className="w-4 h-4" /> : <RingIcon className={clsx('w-4 h-4', when.overdue && !closed && 'text-red-500')} />}
      </button>
      <div className="flex-1 min-w-0">
        <p className={clsx('text-sm leading-tight', closed && 'line-through text-gray-400 dark:text-white/30', !closed && 'text-gray-800 dark:text-white/90')}>
          {reminder.title}
        </p>
        {reminder.note && <p className="text-[11px] text-gray-400 dark:text-white/30 mt-0.5 line-clamp-2">{reminder.note}</p>}
        <div className="flex items-center gap-2 mt-1 flex-wrap">
          <span className={clsx('text-[10px] flex items-center gap-0.5', when.overdue && !closed ? 'text-red-500 font-medium' : 'text-gray-400 dark:text-white/30')}>
            <Clock className="w-2.5 h-2.5" /> {when.text}
          </span>
          <span className={clsx('text-[10px] font-medium px-1.5 py-0.5 rounded-full', pm.color)}>
            <Flag className="w-2.5 h-2.5 inline mr-0.5" />{pm.label}
          </span>
          {reminder.employee && (
            <span className="text-[10px] text-gray-400 dark:text-white/30">{reminder.employee.employee_name}</span>
          )}
        </div>
      </div>
      {!closed && (
        <div className="shrink-0 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all relative">
          <button onClick={() => setSnoozeOpen(o => !o)} title="Snooze" className="text-gray-300 hover:text-primary-500">
            <Clock className="w-3.5 h-3.5" />
          </button>
          {snoozeOpen && (
            <div className="absolute right-0 top-5 z-10 w-32 rounded-lg border border-gray-200 dark:border-white/10 bg-white dark:bg-night-3 shadow-lg py-1">
              {[['1 hour', 60], ['Tomorrow', 60 * 24], ['Next week', 60 * 24 * 7]].map(([label, minutes]) => (
                <button
                  key={label}
                  onClick={() => { onSnooze(reminder.id, minutes); setSnoozeOpen(false); }}
                  className="block w-full text-left px-3 py-1.5 text-xs text-gray-600 dark:text-white/70 hover:bg-gray-50 dark:hover:bg-white/5"
                >
                  {label}
                </button>
              ))}
            </div>
          )}
          <button onClick={() => onDismiss(reminder.id)} title="Dismiss" className="text-gray-300 hover:text-gray-500">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
      {closed && (
        <button onClick={() => onDelete(reminder.id)} title="Delete" className="shrink-0 opacity-0 group-hover:opacity-100 text-gray-300 hover:text-red-500 transition-all">
          <X className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
}

export default function ReminderPanel({ recordId }) {
  const qc = useQueryClient();
  const [showClosed, setShowClosed] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['reminders', recordId],
    queryFn:  () => reminderService.getReminders({ record_id: recordId }).then(r => r.data ?? []),
    enabled:  !!recordId,
    staleTime: 30_000,
  });

  const invalidate = useCallback(() => {
    qc.invalidateQueries({ queryKey: ['reminders', recordId] });
    qc.invalidateQueries({ queryKey: ['my-reminders'] });
  }, [qc, recordId]);

  const complete = useMutation({ mutationFn: (id) => reminderService.completeReminder(id), onSuccess: invalidate });
  const dismiss  = useMutation({ mutationFn: (id) => reminderService.dismissReminder(id),  onSuccess: invalidate });
  const del      = useMutation({ mutationFn: (id) => reminderService.deleteReminder(id),    onSuccess: invalidate });
  const snooze   = useMutation({ mutationFn: ({ id, minutes }) => reminderService.snoozeReminder(id, { minutes }), onSuccess: invalidate });

  const reminders = data ?? [];
  const openList  = reminders.filter(r => ['pending', 'notified'].includes(r.status));
  const closed    = reminders.filter(r => ['done', 'dismissed', 'cancelled'].includes(r.status));

  const handlers = {
    onComplete: (id) => complete.mutate(id),
    onDismiss:  (id) => dismiss.mutate(id),
    onDelete:   (id) => del.mutate(id),
    onSnooze:   (id, minutes) => snooze.mutate({ id, minutes }),
  };

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold text-gray-700 dark:text-white/80">Reminders</h3>
      <AddReminderForm recordId={recordId} />

      {isLoading ? (
        <p className="text-xs text-gray-400 text-center py-4">Loading…</p>
      ) : openList.length === 0 && closed.length === 0 ? (
        <p className="text-xs text-gray-400 text-center py-4">No reminders yet — set one above and you&apos;ll get a notification when it&apos;s due.</p>
      ) : (
        <>
          {openList.map(r => <ReminderRow key={r.id} reminder={r} {...handlers} />)}
          {closed.length > 0 && (
            <button
              onClick={() => setShowClosed(s => !s)}
              className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600 dark:hover:text-white/60 mt-2"
            >
              <ChevronDown className={clsx('w-3 h-3 transition-transform', showClosed && 'rotate-180')} />
              {showClosed ? 'Hide' : 'Show'} {closed.length} completed/dismissed
            </button>
          )}
          {showClosed && closed.map(r => <ReminderRow key={r.id} reminder={r} {...handlers} />)}
        </>
      )}
    </div>
  );
}
