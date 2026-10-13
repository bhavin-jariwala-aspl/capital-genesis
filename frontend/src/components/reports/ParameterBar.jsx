import { useEffect, useState } from 'react';
import { SlidersHorizontal, RotateCcw } from 'lucide-react';
import clsx from 'clsx';

const input = 'rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-sm text-gray-900 focus:border-primary-500 focus:outline-none dark:border-white/10 dark:bg-white/5 dark:text-white';

/**
 * ParameterBar — the prompts a report asks its viewer to answer.
 *
 * Built from `result.meta.parameters`, which the engine derives from every filter
 * condition flagged "Ask when running". Each prompt renders the control its
 * field type and operator call for (a period menu, a pick-list, a date pair…),
 * and a blank answer means "any". `values` is the viewer's current answers.
 */
export default function ParameterBar({ parameters = [], values = {}, datePresets = [], onApply }) {
  const [draft, setDraft] = useState(values);
  useEffect(() => { setDraft(values); }, [values]);
  if (!parameters.length) return null;

  const changed = JSON.stringify(draft) !== JSON.stringify(values);
  const hasAnswers = parameters.some((p) => values[p.key] !== undefined);
  const set = (key, v) => setDraft((d) => ({ ...d, [key]: v }));

  return (
    <div className="mb-4 rounded-xl border border-primary-200 bg-primary-50/60 p-3 dark:border-primary-500/20 dark:bg-primary-500/[0.06]">
      <div className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-primary-700 dark:text-primary-300">
        <SlidersHorizontal className="h-3.5 w-3.5" /> This report asks
      </div>
      <div className="flex flex-wrap items-end gap-3">
        {parameters.map((p) => (
          <label key={p.key} className="block min-w-[10rem]">
            <span className="mb-1 block text-[11px] text-gray-600 dark:text-white/60">
              {p.label} <span className="text-gray-400">{p.op_label}</span>
            </span>
            <ParameterControl param={p} value={draft[p.key] !== undefined ? draft[p.key] : p.value} datePresets={datePresets} onChange={(v) => set(p.key, v)} />
          </label>
        ))}
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={!changed}
            onClick={() => onApply(draft)}
            className="rounded-lg bg-primary-600 px-3 py-1.5 text-xs font-medium text-on-primary hover:bg-primary-700 disabled:opacity-40"
          >
            Apply
          </button>
          {(hasAnswers || changed) && (
            <button
              type="button"
              onClick={() => { setDraft({}); onApply({}); }}
              className="flex items-center gap-1 text-[11px] text-gray-500 hover:text-primary-600 dark:text-white/50"
            >
              <RotateCcw className="h-3 w-3" /> Defaults
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function ParameterControl({ param: p, value, datePresets, onChange }) {
  if (p.preset) {
    return (
      <select className={clsx(input, 'w-full')} value={typeof value === 'string' ? value : ''} onChange={(e) => onChange(e.target.value || '')}>
        <option value="">Any time</option>
        {datePresets.map((d) => <option key={d.key} value={d.key}>{d.label}</option>)}
      </select>
    );
  }
  if (p.pair) {
    const pair = Array.isArray(value) ? value : ['', ''];
    const type = p.type === 'date' ? 'date' : 'number';
    return (
      <div className="flex items-center gap-1.5">
        <input className={clsx(input, 'w-32')} type={type} value={pair[0] ?? ''} onChange={(e) => onChange([e.target.value, pair[1] ?? ''])} />
        <span className="text-xs text-gray-400">and</span>
        <input className={clsx(input, 'w-32')} type={type} value={pair[1] ?? ''} onChange={(e) => onChange([pair[0] ?? '', e.target.value])} />
      </div>
    );
  }
  if (p.options) {
    if (p.multi) {
      const list = Array.isArray(value) ? value : (typeof value === 'string' && value ? value.split(',') : []);
      return (
        <div className="flex flex-wrap gap-1">
          {p.options.map((o) => {
            const on = list.includes(o);
            return (
              <button
                key={o}
                type="button"
                onClick={() => onChange(on ? list.filter((x) => x !== o) : [...list, o])}
                className={clsx(
                  'rounded-md border px-2 py-0.5 text-[11px] capitalize transition',
                  on ? 'border-primary-500 bg-primary-600 text-on-primary' : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50 dark:border-white/10 dark:bg-white/5 dark:text-white/60',
                )}
              >
                {String(o).replace(/_/g, ' ')}
              </button>
            );
          })}
        </div>
      );
    }
    return (
      <select className={clsx(input, 'w-full capitalize')} value={value ?? ''} onChange={(e) => onChange(e.target.value)}>
        <option value="">Any</option>
        {p.options.map((o) => <option key={o} value={o}>{String(o).replace(/_/g, ' ')}</option>)}
      </select>
    );
  }
  if (p.type === 'boolean') {
    return (
      <select className={clsx(input, 'w-full')} value={value === true ? 'true' : value === false ? 'false' : ''} onChange={(e) => onChange(e.target.value === '' ? '' : e.target.value === 'true')}>
        <option value="">Any</option>
        <option value="true">Yes</option>
        <option value="false">No</option>
      </select>
    );
  }
  const type = p.type === 'date' ? 'date' : ['number', 'currency', 'percent'].includes(p.type) ? 'number' : 'text';
  return <input className={clsx(input, 'w-full')} type={type} value={value ?? ''} placeholder="Any" onChange={(e) => onChange(e.target.value)} />;
}
