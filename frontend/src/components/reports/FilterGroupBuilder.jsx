import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Plus, Trash2, CornerDownRight } from 'lucide-react';
import clsx from 'clsx';
import { reportService } from '../../services/report.service';

const MAX_DEPTH = 2;

const input = 'rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-sm text-gray-900 focus:border-primary-500 focus:outline-none dark:border-white/10 dark:bg-white/5 dark:text-white';

/**
 * FilterGroupBuilder — "show me records where…", built entirely from dropdowns.
 *
 * The tree it edits is `{ logic: 'AND'|'OR', conditions: [ condition | group ] }`,
 * the shape the report engine consumes directly. Two design choices matter for a
 * non-technical author:
 *
 *   • AND / OR is a two-button toggle labelled "all of these" / "any of these",
 *     which is how people describe the intent; the boolean word is secondary.
 *   • the value control adapts to the field — a picklist for enums, a live list of
 *     values that actually exist for free-text fields, a preset menu for dates —
 *     so nobody has to know that a status is stored as `closed_won`.
 *   • any condition can be marked "Ask when running", which turns it into a
 *     prompt the viewer answers each time (a parameter); the value set here is
 *     the default, and a blank answer means "any".
 */
export default function FilterGroupBuilder({ source, fields: allPickable, vocabulary, value, onChange, depth = 0 }) {
  const node = normalize(value);
  const operators = vocabulary?.operators ?? [];
  const datePresets = vocabulary?.date_presets ?? [];

  // Roll-up totals ("Opportunities ▸ Total amount") are computed after the rows are read, so
  // the engine cannot filter on them — it would need a HAVING pass. Offering them
  // here would produce a condition that is reported and then dropped.
  const fields = allPickable.filter((f) => f.filterable !== false);

  const set = (patch) => onChange({ ...node, ...patch });
  const setCondition = (i, patch) =>
    set({ conditions: node.conditions.map((c, idx) => (idx === i ? { ...c, ...patch } : c)) });
  const replaceCondition = (i, next) =>
    set({ conditions: node.conditions.map((c, idx) => (idx === i ? next : c)) });
  const removeCondition = (i) => set({ conditions: node.conditions.filter((_, idx) => idx !== i) });

  const addCondition = () =>
    set({ conditions: [...node.conditions, { field: fields[0]?.key, op: 'equals', value: '' }] });
  const addGroup = () =>
    set({
      conditions: [
        ...node.conditions,
        { logic: node.logic === 'AND' ? 'OR' : 'AND', conditions: [{ field: fields[0]?.key, op: 'equals', value: '' }] },
      ],
    });

  return (
    <div
      className={clsx(
        'space-y-2',
        depth > 0 && 'rounded-xl border border-dashed border-gray-200 bg-gray-50/60 p-2.5 dark:border-white/10 dark:bg-white/[0.03]',
      )}
    >
      {node.conditions.length > 1 && (
        <LogicToggle logic={node.logic} onChange={(logic) => set({ logic })} />
      )}

      {node.conditions.length === 0 && (
        <p className="text-xs text-gray-400">
          No conditions — the report includes every record you have access to.
        </p>
      )}

      {node.conditions.map((c, i) => (
        <div key={i} className="flex items-start gap-1.5">
          {i > 0 && (
            <span className="mt-2 w-9 shrink-0 text-[10px] font-semibold uppercase tracking-wide text-primary-500">
              {node.logic === 'OR' ? 'or' : 'and'}
            </span>
          )}
          {i === 0 && node.conditions.length > 1 && <span className="mt-2 w-9 shrink-0" />}

          <div className="min-w-0 flex-1">
            {c.conditions ? (
              <div className="flex items-start gap-1.5">
                <CornerDownRight className="mt-2.5 h-3.5 w-3.5 shrink-0 text-gray-300" />
                <div className="min-w-0 flex-1">
                  <FilterGroupBuilder
                    source={source}
                    fields={fields}
                    vocabulary={vocabulary}
                    value={c}
                    onChange={(next) => replaceCondition(i, next)}
                    depth={depth + 1}
                  />
                </div>
              </div>
            ) : (
              <ConditionRow
                source={source}
                fields={fields}
                operators={operators}
                datePresets={datePresets}
                condition={c}
                onChange={(patch) => setCondition(i, patch)}
              />
            )}
          </div>

          <button
            type="button"
            onClick={() => removeCondition(i)}
            aria-label="Remove condition"
            className="mt-1 rounded p-1.5 text-gray-400 hover:bg-rose-50 hover:text-rose-500 dark:hover:bg-rose-500/10"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      ))}

      <div className="flex items-center gap-2 pt-0.5">
        <button
          type="button"
          onClick={addCondition}
          className="flex items-center gap-1 rounded px-1.5 py-0.5 text-xs font-medium text-primary-600 hover:bg-primary-50 dark:text-primary-300 dark:hover:bg-primary-500/10"
        >
          <Plus className="h-3.5 w-3.5" /> Add condition
        </button>
        {depth < MAX_DEPTH && (
          <button
            type="button"
            onClick={addGroup}
            className="flex items-center gap-1 rounded px-1.5 py-0.5 text-xs font-medium text-gray-500 hover:bg-gray-100 dark:text-white/50 dark:hover:bg-white/5"
            title="A group lets you mix “and” with “or” — for example: stage is Proposal AND (owner is Ann OR owner is Bob)"
          >
            <Plus className="h-3.5 w-3.5" /> Add group
          </button>
        )}
      </div>
    </div>
  );
}

function LogicToggle({ logic, onChange }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-[11px] text-gray-500 dark:text-white/50">Records must match</span>
      <div className="flex rounded-lg border border-gray-200 p-0.5 dark:border-white/10">
        {[['AND', 'all of these'], ['OR', 'any of these']].map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => onChange(key)}
            className={clsx(
              'rounded-md px-2 py-0.5 text-[11px] font-medium transition',
              logic === key
                ? 'bg-primary-600 text-on-primary'
                : 'text-gray-500 hover:bg-gray-100 dark:text-white/60 dark:hover:bg-white/10',
            )}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}

function ConditionRow({ source, fields, operators, datePresets, condition, onChange }) {
  const field = fields.find((f) => f.key === condition.field);
  const applicable = operators.filter((o) => o.types === '*' || o.types.split(',').includes(field?.type));
  const op = applicable.find((o) => o.key === condition.op) ?? applicable[0];

  // Switching field can invalidate the operator (e.g. "contains" on a date).
  const changeField = (key) => {
    const next = fields.find((f) => f.key === key);
    const stillValid = operators.some(
      (o) => o.key === condition.op && (o.types === '*' || o.types.split(',').includes(next?.type)),
    );
    onChange({ field: key, op: stillValid ? condition.op : 'equals', value: '' });
  };

  return (
    <div className="space-y-1.5 rounded-lg border border-gray-100 p-1.5 dark:border-white/5">
      <div className="flex items-center gap-1.5">
        <select className={clsx(input, 'min-w-0 flex-1')} value={condition.field || ''} onChange={(e) => changeField(e.target.value)}>
          {fields.map((f) => (
            <option key={f.key} value={f.key}>{f.label}</option>
          ))}
        </select>
        <select
          className={clsx(input, 'shrink-0')}
          value={op?.key || 'equals'}
          onChange={(e) => onChange({ op: e.target.value, value: '' })}
        >
          {applicable.map((o) => (
            <option key={o.key} value={o.key}>{o.label}</option>
          ))}
        </select>
      </div>

      {field?.hint && <p className="px-0.5 text-[10px] text-gray-400">{field.hint}</p>}

      {!op?.no_value && (
        <ValueControl
          source={source}
          field={field}
          op={op}
          datePresets={datePresets}
          value={condition.value}
          onChange={(value) => onChange({ value })}
        />
      )}

      {/* A prompted condition asks the viewer for its value when the report runs;
          the value above becomes the default. */}
      {!op?.no_value && (
        <div className="flex items-center gap-2 px-0.5">
          <label className="flex items-center gap-1.5 text-[11px] text-gray-500 dark:text-white/50">
            <input
              type="checkbox"
              className="h-3.5 w-3.5 rounded accent-primary-600"
              checked={!!condition.prompt}
              onChange={(e) => onChange({ prompt: e.target.checked || undefined })}
            />
            Ask when running
          </label>
          {condition.prompt && (
            <input
              className={clsx(input, 'min-w-0 flex-1 py-0.5 text-[11px]')}
              value={condition.label ?? ''}
              placeholder={`Prompt label (defaults to “${field?.label ?? condition.field}”)`}
              onChange={(e) => onChange({ label: e.target.value || undefined })}
            />
          )}
        </div>
      )}
    </div>
  );
}

/**
 * The value half of a condition. Which control appears is derived from the field
 * type and the operator — never typed by the user when a pick-list is possible.
 */
function ValueControl({ source, field, op, datePresets, value, onChange }) {
  if (op?.preset) {
    return (
      <select className={clsx(input, 'w-full')} value={value ?? ''} onChange={(e) => onChange(e.target.value)}>
        <option value="">Choose a period…</option>
        {datePresets.map((p) => (
          <option key={p.key} value={p.key}>{p.label}</option>
        ))}
      </select>
    );
  }

  if (op?.pair) {
    const pair = Array.isArray(value) ? value : ['', ''];
    const type = field?.type === 'date' ? 'date' : 'number';
    return (
      <div className="flex items-center gap-1.5">
        <input className={clsx(input, 'min-w-0 flex-1')} type={type} value={pair[0] ?? ''} onChange={(e) => onChange([e.target.value, pair[1]])} />
        <span className="text-xs text-gray-400">and</span>
        <input className={clsx(input, 'min-w-0 flex-1')} type={type} value={pair[1] ?? ''} onChange={(e) => onChange([pair[0], e.target.value])} />
      </div>
    );
  }

  if (field?.type === 'boolean') {
    return (
      <select className={clsx(input, 'w-full')} value={String(value ?? '')} onChange={(e) => onChange(e.target.value === 'true')}>
        <option value="">Choose…</option>
        <option value="true">Yes</option>
        <option value="false">No</option>
      </select>
    );
  }

  if (field?.type === 'date') {
    return <input className={clsx(input, 'w-full')} type="date" value={value ?? ''} onChange={(e) => onChange(e.target.value)} />;
  }

  if (['number', 'currency', 'percent'].includes(field?.type)) {
    return <input className={clsx(input, 'w-full')} type="number" value={value ?? ''} placeholder="Amount" onChange={(e) => onChange(e.target.value)} />;
  }

  return (
    <PickListValue source={source} field={field} multi={!!op?.multi} value={value} onChange={onChange} />
  );
}

/**
 * Text/enum values. Fixed picklists come straight off the field; for everything
 * else the values already in the data are fetched, so a user picks "Referral"
 * from a list rather than guessing how it was spelled.
 */
function PickListValue({ source, field, multi, value, onChange }) {
  const [freeText, setFreeText] = useState(false);
  const hasOptions = !!field?.options?.length;

  const { data, isPending } = useQuery({
    queryKey: ['report-field-values', source, field?.key],
    queryFn: () => reportService.getFieldValues(source, field.key),
    enabled: !!source && !!field?.key && !hasOptions && field?.type === 'string' && !field?.related,
    staleTime: 5 * 60_000,
  });
  const discovered = data?.data ?? data ?? [];
  const options = hasOptions ? field.options : discovered;
  const selected = multi ? (Array.isArray(value) ? value : (value ? String(value).split(',') : [])) : value;

  if (freeText || (!options.length && !isPending)) {
    return (
      <div className="space-y-1">
        <input
          className={clsx(input, 'w-full')}
          value={Array.isArray(value) ? value.join(', ') : (value ?? '')}
          placeholder={multi ? 'Values, separated by commas' : 'Value'}
          onChange={(e) => onChange(multi ? e.target.value.split(',').map((s) => s.trim()) : e.target.value)}
        />
        {options.length > 0 && (
          <button type="button" onClick={() => setFreeText(false)} className="text-[10px] text-primary-500 hover:underline">
            Choose from a list instead
          </button>
        )}
      </div>
    );
  }

  if (multi) {
    return (
      <div className="space-y-1">
        <div className="max-h-36 space-y-0.5 overflow-y-auto rounded-lg border border-gray-100 p-1.5 dark:border-white/5">
          {options.map((o) => (
            <label key={o} className="flex items-center gap-2 rounded px-1 py-0.5 text-sm text-gray-700 hover:bg-gray-50 dark:text-white/70 dark:hover:bg-white/5">
              <input
                type="checkbox"
                className="h-3.5 w-3.5 rounded accent-primary-600"
                checked={selected.includes(o)}
                onChange={() =>
                  onChange(selected.includes(o) ? selected.filter((x) => x !== o) : [...selected, o])
                }
              />
              <span className="capitalize">{String(o).replace(/_/g, ' ')}</span>
            </label>
          ))}
        </div>
        <p className="text-[10px] text-gray-400">{selected.length} selected</p>
      </div>
    );
  }

  return (
    <div className="space-y-1">
      <select className={clsx(input, 'w-full')} value={value ?? ''} onChange={(e) => onChange(e.target.value)}>
        <option value="">{isPending ? 'Loading values…' : 'Choose a value…'}</option>
        {options.map((o) => (
          <option key={o} value={o} className="capitalize">{String(o).replace(/_/g, ' ')}</option>
        ))}
      </select>
      <button type="button" onClick={() => setFreeText(true)} className="text-[10px] text-gray-400 hover:text-primary-500 hover:underline">
        Type a value instead
      </button>
    </div>
  );
}

/**
 * Repair conditions whose operator does not apply to their field.
 *
 * The row would otherwise *display* a valid fallback operator while the config kept
 * the invalid one, and the engine would drop the condition — so the author sees
 * "Owner is Ann" and gets no filtering. Run when a saved report or template is
 * loaded into the builder, never during render.
 */
export function repairFilters(node, fields, operators) {
  if (!operators?.length) return node;
  const applies = (op, type) => op && (op.types === '*' || op.types.split(',').includes(type));

  const fix = (n) => {
    const norm = normalize(n);
    return {
      logic: norm.logic,
      conditions: norm.conditions.map((c) => {
        if (c?.conditions) return fix(c);
        const type = fields.find((f) => f.key === c.field)?.type;
        if (!type) return c;
        if (applies(operators.find((o) => o.key === c.op), type)) return c;
        // Fall back to the operator the UI would have shown, and clear the value —
        // a value entered for the old operator rarely fits the new one.
        const replacement = operators.find((o) => applies(o, type));
        return { ...c, op: replacement?.key ?? 'equals', value: '' };
      }),
    };
  };
  return fix(node);
}

/** Accept the legacy flat array so an older saved report still opens. */
export function normalize(value) {
  if (!value) return { logic: 'AND', conditions: [] };
  if (Array.isArray(value)) return { logic: 'AND', conditions: value };
  return { logic: value.logic === 'OR' ? 'OR' : 'AND', conditions: value.conditions ?? [] };
}

/** How many conditions the tree holds, for the "3 filters" badge in the header. */
export function countConditions(node) {
  const n = normalize(node);
  return n.conditions.reduce((sum, c) => sum + (c.conditions ? countConditions(c) : 1), 0);
}
