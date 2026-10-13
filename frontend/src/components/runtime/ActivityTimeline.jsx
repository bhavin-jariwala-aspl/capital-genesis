import { useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { activityService } from '../../services/activity.service';
import EmailComposeModal from './EmailComposeModal';
import { Phone, Mail, MessageSquare, Calendar, CheckSquare, Activity, Plus, X, ChevronDown } from 'lucide-react';
import clsx from 'clsx';

const ACTIVITY_TYPES = [
  { value: 'note',    label: 'Note',    icon: MessageSquare, color: 'text-blue-500' },
  { value: 'call',    label: 'Call',    icon: Phone,         color: 'text-green-500' },
  { value: 'email',   label: 'Email',   icon: Mail,          color: 'text-violet-500' },
  { value: 'meeting', label: 'Meeting', icon: Calendar,      color: 'text-orange-500' },
  { value: 'task',    label: 'Task',    icon: CheckSquare,   color: 'text-rose-500' },
  { value: 'other',   label: 'Other',   icon: Activity,      color: 'text-gray-500' },
];

function typeInfo(type) {
  return ACTIVITY_TYPES.find(t => t.value === type) ?? ACTIVITY_TYPES[5];
}

function timeAgo(dateStr) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'Just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function LogForm({ recordId, onDone, onComposeEmail }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({ type: 'note', subject: '', description: '', outcome: '' });
  const [open, setOpen] = useState(false);

  const create = useMutation({
    mutationFn: () => activityService.createActivity(recordId, form),
    onSuccess:  () => {
      qc.invalidateQueries({ queryKey: ['activities', recordId] });
      setForm({ type: 'note', subject: '', description: '', outcome: '' });
      setOpen(false);
      onDone?.();
    },
  });

  const handleClose  = useCallback(() => setOpen(false), []);
  const handleCreate = useCallback(() => create.mutate(), [create]);

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 text-sm text-primary-600 hover:text-primary-700 font-medium py-2"
      >
        <Plus className="w-4 h-4" /> Log Activity
      </button>
    );
  }

  return (
    <div className="rounded-xl border border-gray-200 dark:border-white/10 bg-gray-50 dark:bg-white/5 p-4 space-y-3 mb-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-gray-700 dark:text-white/80">Log Activity</p>
        <button onClick={handleClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-white/60">
          <X className="w-4 h-4" />
        </button>
      </div>
      {/* Type pills — clicking Email opens the compose modal */}
      <div className="flex flex-wrap gap-1.5">
        {ACTIVITY_TYPES.map(t => (
          <button
            key={t.value}
            onClick={() => {
              if (t.value === 'email') {
                onComposeEmail?.();
                return;
              }
              setForm(f => ({ ...f, type: t.value }));
            }}
            className={clsx(
              'flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium border transition-colors',
              form.type === t.value
                ? 'bg-primary-600 border-primary-600 text-on-primary'
                : 'border-gray-200 dark:border-white/10 text-gray-600 dark:text-white/60 hover:border-primary-400',
            )}
          >
            <t.icon className="w-3 h-3" />
            {t.label}
          </button>
        ))}
      </div>
      <input
        className="form-input w-full text-sm"
        placeholder="Subject *"
        value={form.subject}
        onChange={e => setForm(f => ({ ...f, subject: e.target.value }))}
      />
      <textarea
        rows={2}
        className="form-input w-full text-sm resize-none"
        placeholder="Description (optional)"
        value={form.description}
        onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
      />
      {(form.type === 'call' || form.type === 'meeting') && (
        <input
          className="form-input w-full text-sm"
          placeholder="Outcome"
          value={form.outcome}
          onChange={e => setForm(f => ({ ...f, outcome: e.target.value }))}
        />
      )}
      <div className="flex items-center justify-end gap-2 pt-1">
        <button onClick={handleClose} className="text-sm text-gray-500 hover:text-gray-700 dark:text-white/50 dark:hover:text-white/80">
          Cancel
        </button>
        <button
          disabled={!form.subject.trim() || create.isPending}
          onClick={handleCreate}
          className="px-3 py-1.5 rounded-lg bg-primary-600 text-on-primary text-sm font-medium hover:bg-primary-700 disabled:opacity-50 transition-colors"
        >
          {create.isPending ? 'Saving…' : 'Save'}
        </button>
      </div>
    </div>
  );
}

/**
 * ActivityTimeline — shows activity feed for a record.
 *
 * When the user clicks the "Email" pill in the Log Activity form, the
 * EmailComposeModal opens with template selection, variable auto-fill
 * from the record's data, and send capability.
 *
 * @param {number}  recordId        – the CRM record ID
 * @param {number}  [objectId]      – UiObject ID (filters templates to this object)
 * @param {string}  [relatedType]   – entity type (lead, contact, account, etc.)
 * @param {Object}  [recordData]    – record field data for auto-populating template variables
 * @param {string}  [defaultToEmail] – pre-fill recipient email (e.g. contact's email)
 */
export default function ActivityTimeline({ recordId, objectId, relatedType, recordData, defaultToEmail }) {
  const qc = useQueryClient();
  const [showAll, setShowAll]       = useState(false);
  const [emailOpen, setEmailOpen]   = useState(false);

  const { data, isLoading } = useQuery({
    queryKey:  ['activities', recordId],
    queryFn:   () => activityService.getActivities(recordId).then(r => r.data ?? []),
    enabled:   !!recordId,
    staleTime: 30_000,
  });

  const del = useMutation({
    mutationFn: (id) => activityService.deleteActivity(id),
    onSuccess:  () => qc.invalidateQueries({ queryKey: ['activities', recordId] }),
  });

  const activities = data ?? [];
  const visible    = showAll ? activities : activities.slice(0, 5);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-700 dark:text-white/80">Activity Timeline</h3>
        {activities.length > 5 && (
          <button
            onClick={() => setShowAll(s => !s)}
            className="flex items-center gap-1 text-xs text-primary-600 hover:text-primary-700"
          >
            {showAll ? 'Show less' : `See all ${activities.length}`}
            <ChevronDown className={clsx('w-3 h-3 transition-transform', showAll && 'rotate-180')} />
          </button>
        )}
      </div>

      <LogForm recordId={recordId} onComposeEmail={() => setEmailOpen(true)} />

      {/* Email compose modal — opens when Email pill is clicked */}
      <EmailComposeModal
        open={emailOpen}
        onClose={() => setEmailOpen(false)}
        recordId={recordId}
        objectId={objectId}
        relatedType={relatedType}
        recordData={recordData ?? {}}
        defaultTo={defaultToEmail ?? ''}
      />

      {isLoading ? (
        <p className="text-xs text-gray-400 py-4 text-center">Loading…</p>
      ) : visible.length === 0 ? (
        <p className="text-xs text-gray-400 py-4 text-center">No activities yet — log one above.</p>
      ) : (
        <div className="relative space-y-4">
          {/* vertical line */}
          <div className="absolute left-[15px] top-0 bottom-0 w-px bg-gray-200 dark:bg-white/10" />
          {visible.map(act => {
            const ti = typeInfo(act.type);
            return (
              <div key={act.id} className="relative flex gap-3 pl-8">
                {/* icon bubble */}
                <div className={clsx(
                  'absolute left-0 flex items-center justify-center w-[30px] h-[30px] rounded-full bg-white dark:bg-night-3 border border-gray-200 dark:border-white/10 z-10',
                  ti.color,
                )}>
                  <ti.icon className="w-3.5 h-3.5" />
                </div>

                <div className="flex-1 min-w-0 bg-white dark:bg-white/5 rounded-lg border border-gray-100 dark:border-white/10 p-3 group">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-800 dark:text-white/90 truncate">{act.subject}</p>
                      {act.description && (
                        <p className="text-xs text-gray-500 dark:text-white/50 mt-0.5 line-clamp-2">{act.description}</p>
                      )}
                      {act.outcome && (
                        <p className="text-xs text-primary-600 dark:text-primary-400 mt-0.5">Outcome: {act.outcome}</p>
                      )}
                    </div>
                    <button
                      onClick={() => del.mutate(act.id)}
                      className="shrink-0 opacity-0 group-hover:opacity-100 text-gray-300 hover:text-red-500 transition-all"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <div className="flex items-center gap-2 mt-2">
                    <span className="text-[10px] text-gray-400 dark:text-white/30">
                      {act.employee?.employee_name ?? 'Unknown'}
                    </span>
                    <span className="text-[10px] text-gray-300 dark:text-white/20">·</span>
                    <span className="text-[10px] text-gray-400 dark:text-white/30">{timeAgo(act.created_at)}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
