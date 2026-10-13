import { useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { taskService } from '../../services/task.service';
import { CheckCircle2, Circle, Flag, Plus, X, Calendar, ChevronDown } from 'lucide-react';
import clsx from 'clsx';

const PRIORITY_META = {
  low:    { label: 'Low',    color: 'text-gray-400  bg-gray-50   dark:bg-white/5' },
  normal: { label: 'Normal', color: 'text-blue-500  bg-blue-50   dark:bg-blue-950/30' },
  high:   { label: 'High',   color: 'text-orange-500 bg-orange-50 dark:bg-orange-950/30' },
  urgent: { label: 'Urgent', color: 'text-red-500   bg-red-50    dark:bg-red-950/30' },
};

const STATUS_META = {
  open:        { label: 'Open',        done: false },
  in_progress: { label: 'In Progress', done: false },
  completed:   { label: 'Done',        done: true  },
  cancelled:   { label: 'Cancelled',   done: true  },
};

function fmt(date) {
  if (!date) return '';
  const d = new Date(date);
  const now = new Date();
  if (d < now) return `Overdue: ${d.toLocaleDateString()}`;
  return d.toLocaleDateString();
}

function AddTaskForm({ recordId, onDone }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ title: '', priority: 'normal', due_date: '', description: '' });

  const create = useMutation({
    mutationFn: () => taskService.createTask({ ...form, record_id: recordId, due_date: form.due_date || undefined }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tasks', recordId] });
      setForm({ title: '', priority: 'normal', due_date: '', description: '' });
      setOpen(false);
      onDone?.();
    },
  });

  const handleClose  = useCallback(() => setOpen(false), []);
  const handleCreate = useCallback(() => create.mutate(), [create]);

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="flex items-center gap-2 text-sm text-primary-600 hover:text-primary-700 font-medium py-2">
        <Plus className="w-4 h-4" /> Add Task
      </button>
    );
  }

  return (
    <div className="rounded-xl border border-gray-200 dark:border-white/10 bg-gray-50 dark:bg-white/5 p-4 space-y-3 mb-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-gray-700 dark:text-white/80">New Task</p>
        <button onClick={handleClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-white/60">
          <X className="w-4 h-4" />
        </button>
      </div>
      <input
        className="form-input w-full text-sm"
        placeholder="Task title *"
        value={form.title}
        onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
      />
      <div className="grid grid-cols-2 gap-3">
        <select
          className="form-input text-sm"
          value={form.priority}
          onChange={e => setForm(f => ({ ...f, priority: e.target.value }))}
        >
          {Object.entries(PRIORITY_META).map(([v, m]) => (
            <option key={v} value={v}>{m.label}</option>
          ))}
        </select>
        <input
          type="date"
          className="form-input text-sm"
          value={form.due_date}
          onChange={e => setForm(f => ({ ...f, due_date: e.target.value }))}
        />
      </div>
      <div className="flex items-center justify-end gap-2 pt-1">
        <button onClick={handleClose} className="text-sm text-gray-500 hover:text-gray-700 dark:text-white/50 dark:hover:text-white/80">Cancel</button>
        <button
          disabled={!form.title.trim() || create.isPending}
          onClick={handleCreate}
          className="px-3 py-1.5 rounded-lg bg-primary-600 text-on-primary text-sm font-medium hover:bg-primary-700 disabled:opacity-50 transition-colors"
        >
          {create.isPending ? 'Saving…' : 'Save'}
        </button>
      </div>
    </div>
  );
}

export default function TaskPanel({ recordId }) {
  const qc = useQueryClient();
  const [showDone, setShowDone] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['tasks', recordId],
    queryFn:  () => taskService.getTasks({ record_id: recordId }).then(r => r.data ?? []),
    enabled:  !!recordId,
    staleTime: 30_000,
  });

  const update = useMutation({
    mutationFn: ({ id, patch }) => taskService.updateTask(id, patch),
    onSuccess:  () => qc.invalidateQueries({ queryKey: ['tasks', recordId] }),
  });

  const del = useMutation({
    mutationFn: (id) => taskService.deleteTask(id),
    onSuccess:  () => qc.invalidateQueries({ queryKey: ['tasks', recordId] }),
  });

  const tasks = data ?? [];
  const open  = tasks.filter(t => !STATUS_META[t.status]?.done);
  const done  = tasks.filter(t => STATUS_META[t.status]?.done);

  const TaskRow = ({ task }) => {
    const isDone = STATUS_META[task.status]?.done;
    const pm = PRIORITY_META[task.priority] ?? PRIORITY_META.normal;
    const isOverdue = task.due_date && !isDone && new Date(task.due_date) < new Date();
    return (
      <div className="flex items-start gap-3 py-2.5 group border-b border-gray-100 dark:border-white/5 last:border-0">
        <button
          onClick={() => update.mutate({ id: task.id, patch: { status: isDone ? 'open' : 'completed' } })}
          className={clsx('mt-0.5 shrink-0 transition-colors', isDone ? 'text-green-500' : 'text-gray-300 hover:text-primary-500')}
        >
          {isDone ? <CheckCircle2 className="w-4 h-4" /> : <Circle className="w-4 h-4" />}
        </button>
        <div className="flex-1 min-w-0">
          <p className={clsx('text-sm leading-tight', isDone && 'line-through text-gray-400 dark:text-white/30', !isDone && 'text-gray-800 dark:text-white/90')}>
            {task.title}
          </p>
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            <span className={clsx('text-[10px] font-medium px-1.5 py-0.5 rounded-full', pm.color)}>
              <Flag className="w-2.5 h-2.5 inline mr-0.5" />
              {pm.label}
            </span>
            {task.due_date && (
              <span className={clsx('text-[10px] flex items-center gap-0.5', isOverdue ? 'text-red-500' : 'text-gray-400 dark:text-white/30')}>
                <Calendar className="w-2.5 h-2.5" /> {fmt(task.due_date)}
              </span>
            )}
            {task.assignee && (
              <span className="text-[10px] text-gray-400 dark:text-white/30">{task.assignee.employee_name}</span>
            )}
          </div>
        </div>
        <button
          onClick={() => del.mutate(task.id)}
          className="shrink-0 opacity-0 group-hover:opacity-100 text-gray-300 hover:text-red-500 transition-all"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    );
  };

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold text-gray-700 dark:text-white/80">Tasks</h3>
      <AddTaskForm recordId={recordId} />

      {isLoading ? (
        <p className="text-xs text-gray-400 text-center py-4">Loading…</p>
      ) : open.length === 0 && done.length === 0 ? (
        <p className="text-xs text-gray-400 text-center py-4">No tasks yet — add one above.</p>
      ) : (
        <>
          {open.map(t => <TaskRow key={t.id} task={t} />)}
          {done.length > 0 && (
            <button
              onClick={() => setShowDone(s => !s)}
              className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600 dark:hover:text-white/60 mt-2"
            >
              <ChevronDown className={clsx('w-3 h-3 transition-transform', showDone && 'rotate-180')} />
              {showDone ? 'Hide' : 'Show'} {done.length} completed
            </button>
          )}
          {showDone && done.map(t => <TaskRow key={t.id} task={t} />)}
        </>
      )}
    </div>
  );
}
