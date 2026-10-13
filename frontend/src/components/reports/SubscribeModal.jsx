import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Mail, Trash2, Send, Plus, CheckCircle2, AlertCircle, Clock, BellRing } from 'lucide-react';
import clsx from 'clsx';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import Spinner from '../ui/Spinner';
import { reportService } from '../../services/report.service';

const input = 'w-full rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-sm text-gray-900 focus:border-primary-500 focus:outline-none dark:border-white/10 dark:bg-white/5 dark:text-white';

const blank = {
  frequency: 'weekly',
  day_of_week: 1,
  day_of_month: 1,
  hour: 8,
  format: 'xlsx',
  recipients: '',
  scope: 'all',
  subject: '',
  message: '',
  is_active: true,
  alert: null,
};

/** The measures a threshold alert can watch: each numeric column, plus the row count. */
function alertMeasures(result) {
  const cols = (result?.columns ?? []).filter((c) => !c.dimension && ['number', 'currency', 'percent'].includes(c.type));
  return [...cols.map((c) => ({ key: c.key, label: c.label })), { key: 'row_count', label: 'Number of rows' }];
}

/**
 * SubscribeModal — "email me this report every…".
 *
 * The whole point is that a business user sets this up alone, so:
 *   • every field is a dropdown, and the schedule is echoed back in a sentence
 *   • "Send now" proves it works immediately instead of waiting for the schedule
 *   • the delivery is scoped to the *recipient's* own visibility, which the
 *     footer states plainly so nobody assumes they're emailing more than they see
 *   • "Only send when…" turns a schedule into an exception report: the report still
 *     runs on time, but the email only goes out when a total crosses a threshold
 *
 * `result` (the report's current result) supplies the measures an alert may watch.
 */
export default function SubscribeModal({ report, schedule, result = null, onClose }) {
  const qc = useQueryClient();
  const [draft, setDraft] = useState(null);
  const [feedback, setFeedback] = useState(null);

  const { data, isPending } = useQuery({
    queryKey: ['report-subscriptions', report.id],
    queryFn: () => reportService.listSubscriptions(report.id),
  });
  const subscriptions = data?.data ?? data ?? [];

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['report-subscriptions', report.id] });
    qc.invalidateQueries({ queryKey: ['reports'] });
  };

  const createMut = useMutation({
    mutationFn: (body) => reportService.createSubscription(report.id, body),
    onSuccess: () => { setDraft(null); invalidate(); },
  });
  const updateMut = useMutation({
    mutationFn: ({ id, body }) => reportService.updateSubscription(id, body),
    onSuccess: invalidate,
  });
  const deleteMut = useMutation({
    mutationFn: (id) => reportService.deleteSubscription(id),
    onSuccess: invalidate,
  });
  const sendMut = useMutation({
    mutationFn: (id) => reportService.sendSubscriptionNow(id),
    onSuccess: (res) => {
      const r = res?.data ?? res;
      setFeedback(r?.skipped
        ? (r.reason === 'condition-not-met'
          ? `Nothing was sent — ${r.alert?.description || 'the alert condition was not met'}.`
          : 'Nothing was sent — no valid recipient email address was found.')
        : `Sent to ${r?.sent ?? 0} recipient${r?.sent === 1 ? '' : 's'}.${r?.alert ? ` (${r.alert.description})` : ''}`);
      invalidate();
    },
    onError: (e) => setFeedback(e?.response?.data?.error?.message || 'Could not send the email.'),
  });

  return (
    <Modal
      isOpen
      onClose={onClose}
      size="lg"
      icon={Mail}
      eyebrow="Scheduled delivery"
      title={`Email “${report.name}”`}
      subtitle="Genesis will run the report and email it on the schedule you choose."
      footer={
        <div className="flex items-center justify-between gap-2">
          <span className="text-[11px] text-gray-400">
            Each recipient gets the report; the numbers are limited to what you are allowed to see.
          </span>
          <Button variant="ghost" size="sm" onClick={onClose}>Done</Button>
        </div>
      }
    >
      <div className="space-y-3">
        {feedback && (
          <div className="flex items-start gap-2 rounded-lg bg-primary-50 px-3 py-2 text-xs text-primary-700 dark:bg-primary-500/10 dark:text-primary-300">
            <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {feedback}
          </div>
        )}

        {isPending ? (
          <div className="flex justify-center py-8"><Spinner /></div>
        ) : (
          <>
            {subscriptions.map((s) => (
              <SubscriptionRow
                key={s.id}
                sub={s}
                schedule={schedule}
                onToggle={(is_active) => updateMut.mutate({ id: s.id, body: { is_active } })}
                onDelete={() => deleteMut.mutate(s.id)}
                onSendNow={() => { setFeedback(null); sendMut.mutate(s.id); }}
                sending={sendMut.isPending && sendMut.variables === s.id}
              />
            ))}

            {subscriptions.length === 0 && !draft && (
              <p className="py-2 text-sm text-gray-500 dark:text-white/50">
                No schedule yet. Add one to have this report land in your inbox automatically.
              </p>
            )}
          </>
        )}

        {draft ? (
          <ScheduleForm
            draft={draft}
            schedule={schedule}
            measures={alertMeasures(result)}
            onChange={(patch) => setDraft({ ...draft, ...patch })}
            onCancel={() => setDraft(null)}
            onSave={() => createMut.mutate(draft)}
            saving={createMut.isPending}
            error={createMut.error?.response?.data?.error?.message}
          />
        ) : (
          <button
            type="button"
            onClick={() => setDraft({ ...blank })}
            className="flex items-center gap-1.5 rounded-lg border border-dashed border-gray-300 px-3 py-2 text-sm font-medium text-primary-600 hover:bg-primary-50 dark:border-white/15 dark:text-primary-300 dark:hover:bg-primary-500/10"
          >
            <Plus className="h-4 w-4" /> Add a schedule
          </button>
        )}
      </div>
    </Modal>
  );
}

function SubscriptionRow({ sub, schedule, onToggle, onDelete, onSendNow, sending }) {
  return (
    <div className="rounded-xl border border-gray-200 p-3 dark:border-white/10">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-medium text-gray-900 dark:text-white">{describe(sub, schedule)}</p>
          <p className="mt-0.5 text-[11px] text-gray-500 dark:text-white/45">
            {formatLabel(sub.format, schedule)} · {scopeLabel(sub.scope)}
            {emailsOf(sub).length ? ` · also to ${emailsOf(sub).length} other${emailsOf(sub).length === 1 ? '' : 's'}` : ''}
          </p>
          {alertOf(sub) && (
            <p className="mt-1 flex items-center gap-1 text-[11px] font-medium text-amber-700 dark:text-amber-300">
              <BellRing className="h-3 w-3" /> Only when {describeAlert(alertOf(sub), schedule)}
              {alertOf(sub).state?.last_value !== undefined && alertOf(sub).state?.last_value !== null && (
                <span className="font-normal text-gray-400"> · last seen {Number(alertOf(sub).state.last_value).toLocaleString()}</span>
              )}
            </p>
          )}
          <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[11px]">
            {sub.next_run_at && sub.is_active && (
              <span className="flex items-center gap-1 text-gray-400">
                <Clock className="h-3 w-3" /> next {new Date(sub.next_run_at).toLocaleString()}
              </span>
            )}
            {sub.last_status === 'sent' && (
              <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                <CheckCircle2 className="h-3 w-3" /> last sent {new Date(sub.last_sent_at).toLocaleDateString()}
              </span>
            )}
            {sub.last_status === 'error' && (
              <span className="flex items-center gap-1 text-rose-600 dark:text-rose-400" title={sub.last_error}>
                <AlertCircle className="h-3 w-3" /> last attempt failed
              </span>
            )}
            {sub.last_status === 'skipped' && (
              <span className="flex items-center gap-1 text-gray-400" title={sub.last_error}>
                <Clock className="h-3 w-3" /> last check: not sent
              </span>
            )}
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={onSendNow}
            disabled={sending}
            title="Send it to me right now"
            className="rounded-lg border border-gray-200 p-1.5 text-gray-500 hover:bg-gray-50 disabled:opacity-40 dark:border-white/10 dark:text-white/60 dark:hover:bg-white/5"
          >
            {sending ? <Spinner size="sm" /> : <Send className="h-3.5 w-3.5" />}
          </button>
          <button
            type="button"
            onClick={() => onToggle(!sub.is_active)}
            className={clsx(
              'rounded-lg px-2 py-1 text-[11px] font-medium transition',
              sub.is_active
                ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                : 'bg-gray-100 text-gray-500 dark:bg-white/10 dark:text-white/50',
            )}
          >
            {sub.is_active ? 'On' : 'Paused'}
          </button>
          <button
            type="button"
            onClick={onDelete}
            aria-label="Delete schedule"
            className="rounded-lg p-1.5 text-gray-400 hover:bg-rose-50 hover:text-rose-500 dark:hover:bg-rose-500/10"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}

function ScheduleForm({ draft, schedule, measures = [], onChange, onCancel, onSave, saving, error }) {
  const frequencies = schedule?.frequencies ?? [];
  const formats = schedule?.formats ?? [];
  const hours = schedule?.hours ?? [];
  const days = schedule?.days_of_week ?? [];
  const alertOps = schedule?.alert_ops ?? [];
  const alert = draft.alert;
  const alertOp = alertOps.find((o) => o.key === alert?.op);

  return (
    <div className="space-y-2.5 rounded-xl border border-primary-200 bg-primary-50/50 p-3 dark:border-primary-500/20 dark:bg-primary-500/[0.06]">
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-gray-500">How often</span>
          <select className={input} value={draft.frequency} onChange={(e) => onChange({ frequency: e.target.value })}>
            {frequencies.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
          </select>
        </label>

        {draft.frequency === 'weekly' && (
          <label className="block">
            <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-gray-500">On</span>
            <select className={input} value={draft.day_of_week} onChange={(e) => onChange({ day_of_week: Number(e.target.value) })}>
              {days.map((d) => <option key={d.key} value={d.key}>{d.label}</option>)}
            </select>
          </label>
        )}

        {draft.frequency === 'monthly' && (
          <label className="block">
            <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-gray-500">Day of month</span>
            <select className={input} value={draft.day_of_month} onChange={(e) => onChange({ day_of_month: Number(e.target.value) })}>
              {Array.from({ length: 28 }, (_, i) => i + 1).map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
          </label>
        )}

        {draft.frequency !== 'hourly' && (
          <label className="block">
            <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-gray-500">At</span>
            <select className={input} value={draft.hour} onChange={(e) => onChange({ hour: Number(e.target.value) })}>
              {hours.map((h) => <option key={h.key} value={h.key}>{h.label}</option>)}
            </select>
          </label>
        )}

        <label className="block">
          <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-gray-500">Send as</span>
          <select className={input} value={draft.format} onChange={(e) => onChange({ format: e.target.value })}>
            {formats.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
          </select>
        </label>
      </div>

      <label className="block">
        <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-gray-500">Also send to (optional)</span>
        <input
          className={input}
          value={draft.recipients}
          placeholder="colleague@example.com, manager@example.com"
          onChange={(e) => onChange({ recipients: e.target.value })}
        />
        <span className="mt-0.5 block text-[10px] text-gray-400">You always receive it. Separate extra addresses with commas.</span>
      </label>

      {/* Threshold alert */}
      <div className="rounded-lg border border-amber-200 bg-amber-50/60 p-2.5 dark:border-amber-500/20 dark:bg-amber-500/[0.06]">
        <label className="flex items-center gap-2 text-sm text-gray-800 dark:text-white/80">
          <input
            type="checkbox"
            className="h-4 w-4 rounded accent-amber-600"
            checked={!!alert}
            onChange={(e) => onChange({ alert: e.target.checked ? { measure: measures[0]?.key ?? 'row_count', op: 'gt', value: '', only_on_change: true } : null })}
          />
          <BellRing className="h-3.5 w-3.5 text-amber-600" />
          <span className="font-medium">Only send when…</span>
          <span className="text-[11px] text-gray-500 dark:text-white/45">the report runs on schedule; the email goes out only if this holds</span>
        </label>
        {alert && (
          <div className="mt-2 space-y-2">
            <div className="grid gap-2 sm:grid-cols-3">
              <select className={input} value={alert.measure} onChange={(e) => onChange({ alert: { ...alert, measure: e.target.value } })} aria-label="Alert measure">
                {measures.map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}
              </select>
              <select className={input} value={alert.op} onChange={(e) => onChange({ alert: { ...alert, op: e.target.value } })} aria-label="Alert comparison">
                {alertOps.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
              </select>
              {!alertOp?.no_value && (
                <input
                  className={input}
                  type="number"
                  placeholder="Value"
                  value={alert.value ?? ''}
                  onChange={(e) => onChange({ alert: { ...alert, value: e.target.value } })}
                  aria-label="Alert value"
                />
              )}
            </div>
            <label className="flex items-center gap-2 text-[11px] text-gray-600 dark:text-white/60">
              <input type="checkbox" className="h-3.5 w-3.5 rounded accent-amber-600" checked={!!alert.only_on_change} onChange={(e) => onChange({ alert: { ...alert, only_on_change: e.target.checked } })} />
              Email once when it starts being true, not every time it is checked
            </label>
          </div>
        )}
      </div>

      <label className="block">
        <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-gray-500">Note in the email (optional)</span>
        <input className={input} value={draft.message} placeholder="e.g. Monday pipeline review numbers" onChange={(e) => onChange({ message: e.target.value })} />
      </label>

      <p className="rounded-lg bg-white px-2.5 py-1.5 text-[11px] text-gray-600 dark:bg-white/5 dark:text-white/60">
        <strong className="font-semibold">{describe(draft, schedule)}</strong> — {formatLabel(draft.format, schedule).toLowerCase()}
        {alert && <> — <strong className="font-semibold text-amber-700 dark:text-amber-300">only when {describeAlert({ ...alert, label: measures.find((m) => m.key === alert.measure)?.label }, schedule)}</strong></>}
      </p>

      {error && <p className="text-[11px] text-rose-600 dark:text-rose-400">{error}</p>}

      <div className="flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={onCancel}>Cancel</Button>
        <Button variant="primary" size="sm" loading={saving} onClick={onSave}>Save schedule</Button>
      </div>
    </div>
  );
}

// ── labels ─────────────────────────────────────────────────────────────────

/** A subscription with an alert stores `{ emails, alert }`; a plain one stores an array. */
const emailsOf = (sub) => (Array.isArray(sub.recipients) ? sub.recipients : sub.recipients?.emails ?? []);
const alertOf = (sub) => (sub.recipients && !Array.isArray(sub.recipients) ? sub.recipients.alert ?? null : null);

function describeAlert(alert, schedule) {
  const op = (schedule?.alert_ops ?? []).find((o) => o.key === alert.op);
  const what = alert.label || (alert.measure === 'row_count' ? 'the number of rows' : 'the total');
  return `${what} ${op?.label || alert.op}${op?.no_value ? '' : ` ${alert.value ?? '…'}`}`;
}

function describe(sub, schedule) {
  const hour = schedule?.hours?.find((h) => h.key === Number(sub.hour))?.label ?? `${sub.hour}:00`;
  switch (sub.frequency) {
    case 'hourly':   return 'Every hour';
    case 'daily':    return `Every day at ${hour}`;
    case 'weekdays': return `Every weekday at ${hour}`;
    case 'weekly':   return `Every ${schedule?.days_of_week?.find((d) => d.key === Number(sub.day_of_week))?.label ?? 'week'} at ${hour}`;
    case 'monthly':  return `Day ${sub.day_of_month} of each month at ${hour}`;
    default:         return `At ${hour}`;
  }
}

const formatLabel = (format, schedule) =>
  schedule?.formats?.find((f) => f.key === format)?.label ?? format;

const scopeLabel = (scope) =>
  ({ me: 'My records', team: 'My team’s records', all: 'All records' }[scope] || 'All records');
