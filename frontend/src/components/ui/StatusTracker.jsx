import { useQuery } from '@tanstack/react-query';
import { MapPin, Clock, CheckCircle2, Circle, AlertTriangle, Package } from 'lucide-react';
import clsx from 'clsx';
import StatusStepper from './StatusStepper';
import { statusEventService } from '../../services/statusEvent.service';

/**
 * StatusTracker — Amazon / UPS / Bluedart-style package-tracking timeline.
 *
 * Renders three layers from a record's status events:
 *   1. Milestone stepper  — the whole lifecycle at a glance (from config.stages)
 *   2. Current-status banner — the latest event, highlighted
 *   3. Dated event timeline — every event, newest first, grouped by day,
 *                              each with time + location + description
 *
 * This is a display-only fieldtype: it never captures input. Events are fed by
 * the backend (auto-appended on pipeline stage changes, or added via the API).
 *
 * Props:
 *   recordId — the record whose timeline to show (null in create mode)
 *   events   — optional pre-loaded events (newest-first). When provided, the
 *              component renders these directly and skips the backend fetch —
 *              useful for sample/demo data or server-rendered timelines.
 *   config   — field.config: { stages?: [{value,label,color}], variant?, title? }
 *   label    — field label (section heading)
 */

const TYPE_ICON = {
  milestone: CheckCircle2,
  scan:      Package,
  note:      Circle,
  exception: AlertTriangle,
};

const TYPE_COLOR = {
  milestone: 'text-green-500',
  scan:      'text-primary-500',
  note:      'text-gray-400',
  exception: 'text-red-500',
};

function fmtDay(dateStr) {
  return new Date(dateStr).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
}
function fmtTime(dateStr) {
  return new Date(dateStr).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}
function fmtShort(dateStr) {
  return new Date(dateStr).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export default function StatusTracker({ recordId, events: eventsProp, config = {}, label }) {
  const stages  = Array.isArray(config.stages) ? config.stages : [];
  const variant = config.variant || 'steps';
  const heading = config.title || label || 'Status Tracker';

  // When events are supplied directly (sample/demo data), skip the backend fetch.
  const useProvided = Array.isArray(eventsProp);

  const { data, isLoading } = useQuery({
    queryKey:  ['status-events', recordId],
    queryFn:   () => statusEventService.getStatusEvents(recordId).then(r => r.data ?? []),
    enabled:   !!recordId && !useProvided,
    staleTime: 30_000,
  });

  const events  = useProvided ? eventsProp : (data ?? []);   // newest-first
  const current = events[0] ?? null;   // most recent event = current status
  const currentValue = current?.status ?? config.current;

  // Date/time each milestone was reached — shown inline under each stepper node
  // (Amazon/UPS-style). Events are newest-first, so overwriting leaves the
  // earliest event per status = when that milestone was first reached.
  const reachedAt = {};
  for (const ev of events) reachedAt[ev.status] = ev.occurred_at;
  const stepSubLabels = {};
  for (const s of stages) {
    if (reachedAt[s.value]) stepSubLabels[s.value] = fmtShort(reachedAt[s.value]);
  }

  // Group events by calendar day for the detailed log
  const groups = [];
  for (const ev of events) {
    const day = fmtDay(ev.occurred_at);
    const last = groups[groups.length - 1];
    if (last && last.day === day) last.items.push(ev);
    else groups.push({ day, items: [ev] });
  }

  return (
    <div className="col-span-full space-y-4">
      {/* Section heading */}
      <div className="flex items-center gap-3">
        <div className="w-1 h-6 rounded-full bg-gradient-to-b from-primary-500 to-mid" />
        <h3 className="text-base font-bold text-gray-800 dark:text-gray-100 tracking-tight">{heading}</h3>
        <div className="flex-1 h-px bg-gradient-to-r from-primary-200/60 to-transparent dark:from-primary-500/20" />
      </div>

      {!recordId && !useProvided ? (
        <p className="text-xs text-gray-400 dark:text-white/30 py-6 text-center rounded-xl border border-dashed border-gray-200 dark:border-white/10">
          The status timeline will appear here once the record is saved.
        </p>
      ) : (
        <>
          {/* 1. Milestone stepper — overflow-x for long lifecycles */}
          {stages.length > 0 && (
            <div className="overflow-x-auto pb-1">
              <StatusStepper stages={stages} currentValue={currentValue} variant={variant} subLabels={stepSubLabels} />
            </div>
          )}

          {/* 2. Current-status banner */}
          {current && (
            <div className="flex items-start gap-3 rounded-xl border border-primary-100 dark:border-primary-500/20 bg-primary-50/60 dark:bg-primary-500/10 p-3">
              <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary-600 text-on-primary">
                <Package className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-gray-900 dark:text-white">
                  {current.title || current.status}
                </p>
                <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-gray-500 dark:text-white/50">
                  <span className="inline-flex items-center gap-1"><Clock className="h-3 w-3" />{fmtDay(current.occurred_at)} · {fmtTime(current.occurred_at)}</span>
                  {current.location && <span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3" />{current.location}</span>}
                </div>
                {current.description && (
                  <p className="mt-1 text-xs text-gray-600 dark:text-white/60">{current.description}</p>
                )}
              </div>
            </div>
          )}

          {/* 3. Dated event timeline */}
          {isLoading ? (
            <p className="text-xs text-gray-400 py-4 text-center">Loading timeline…</p>
          ) : events.length === 0 ? (
            <p className="text-xs text-gray-400 py-4 text-center">No status updates yet.</p>
          ) : (
            <div className="space-y-4">
              {groups.map((g) => (
                <div key={g.day}>
                  <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-gray-400 dark:text-white/30">{g.day}</p>
                  <div className="relative space-y-3">
                    <div className="absolute left-[15px] top-1 bottom-1 w-px bg-gray-200 dark:bg-white/10" />
                    {g.items.map((ev) => {
                      const Icon = TYPE_ICON[ev.event_type] ?? Circle;
                      const color = TYPE_COLOR[ev.event_type] ?? 'text-gray-400';
                      return (
                        <div key={ev.id} className="relative flex gap-3 pl-8">
                          <div className={clsx(
                            'absolute left-0 flex h-[30px] w-[30px] items-center justify-center rounded-full border bg-white dark:bg-night-3 border-gray-200 dark:border-white/10 z-10',
                            color,
                          )}>
                            <Icon className="h-3.5 w-3.5" />
                          </div>
                          <div className="flex-1 min-w-0 rounded-lg border border-gray-100 dark:border-white/10 bg-white dark:bg-white/5 p-3">
                            <div className="flex items-baseline justify-between gap-2">
                              <p className="text-sm font-medium text-gray-800 dark:text-white/90 truncate">{ev.title || ev.status}</p>
                              <span className="shrink-0 text-[11px] text-gray-400 dark:text-white/30">{fmtTime(ev.occurred_at)}</span>
                            </div>
                            {ev.description && (
                              <p className="mt-0.5 text-xs text-gray-500 dark:text-white/50">{ev.description}</p>
                            )}
                            <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-gray-400 dark:text-white/30">
                              {ev.location && <span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3" />{ev.location}</span>}
                              {ev.changed_by_name && <span>by {ev.changed_by_name}</span>}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
