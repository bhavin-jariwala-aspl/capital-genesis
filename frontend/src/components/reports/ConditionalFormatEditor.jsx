import { Plus, Trash2, Palette } from 'lucide-react';
import clsx from 'clsx';
import { FORMAT_COLORS, FORMAT_RULE_OPS, isNumericType } from '../../utils/report';

const input = 'rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-sm text-gray-900 focus:border-primary-500 focus:outline-none dark:border-white/10 dark:bg-white/5 dark:text-white';

/**
 * ConditionalFormatEditor — "colour this cell when…".
 *
 * Rules apply to the *result* columns, so the picker lists whatever the current
 * configuration produces (including calculated measures). Rules are evaluated
 * top-down with first-match-wins, which is why the list order is meaningful and
 * shown explicitly.
 */
export default function ConditionalFormatEditor({ rules = [], columns = [], onChange }) {
  const targets = columns.filter((c) => isNumericType(c.type));

  const update = (i, patch) => onChange(rules.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  const remove = (i) => onChange(rules.filter((_, idx) => idx !== i));
  const add = () =>
    onChange([...rules, { column: targets[0]?.key, op: 'gte', value: '', color: 'green' }]);

  if (!targets.length) {
    return (
      <p className="text-xs text-gray-400">
        Add a numeric column or measure first — colour rules apply to numbers.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {rules.length === 0 && (
        <p className="text-xs text-gray-400">
          No colour rules. Add one to highlight, say, deals over $100k in green.
        </p>
      )}

      {rules.map((r, i) => (
        <div key={i} className="space-y-1.5 rounded-lg border border-gray-100 p-1.5 dark:border-white/5">
          <div className="flex items-center gap-1.5">
            {rules.length > 1 && (
              <span className="w-4 shrink-0 text-[10px] font-medium text-gray-400">{i + 1}</span>
            )}
            <select className={clsx(input, 'min-w-0 flex-1')} value={r.column || ''} onChange={(e) => update(i, { column: e.target.value })}>
              {targets.map((c) => (
                <option key={c.key} value={c.key}>{c.label}</option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => remove(i)}
              aria-label="Remove colour rule"
              className="rounded p-1.5 text-gray-400 hover:bg-rose-50 hover:text-rose-500 dark:hover:bg-rose-500/10"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>

          <div className="flex items-center gap-1.5">
            <select className={clsx(input, 'shrink-0')} value={r.op} onChange={(e) => update(i, { op: e.target.value })}>
              {FORMAT_RULE_OPS.map((o) => (
                <option key={o.key} value={o.key}>{o.label}</option>
              ))}
            </select>
            {r.op !== 'is_empty' && (
              <input
                className={clsx(input, 'min-w-0 flex-1')}
                type="number"
                value={r.value ?? ''}
                placeholder="Value"
                onChange={(e) => update(i, { value: e.target.value })}
              />
            )}
            {r.op === 'between' && (
              <>
                <span className="text-[10px] text-gray-400">and</span>
                <input
                  className={clsx(input, 'min-w-0 flex-1')}
                  type="number"
                  value={r.value2 ?? ''}
                  onChange={(e) => update(i, { value2: e.target.value })}
                />
              </>
            )}
          </div>

          <div className="flex items-center gap-1.5">
            <Palette className="h-3.5 w-3.5 shrink-0 text-gray-400" />
            {FORMAT_COLORS.map((c) => (
              <button
                key={c.key}
                type="button"
                title={c.label}
                aria-label={c.label}
                onClick={() => update(i, { color: c.key })}
                className={clsx(
                  'h-5 w-5 rounded-full ring-offset-1 transition dark:ring-offset-[#0d1117]',
                  c.dot,
                  r.color === c.key ? 'ring-2 ring-gray-900 dark:ring-white' : 'opacity-60 hover:opacity-100',
                )}
              />
            ))}
            <span className={clsx('ml-auto rounded px-2 py-0.5 text-[11px] font-medium', FORMAT_COLORS.find((c) => c.key === r.color)?.cell)}>
              Preview
            </span>
          </div>
        </div>
      ))}

      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={add}
          className="flex items-center gap-1 rounded px-1.5 py-0.5 text-xs font-medium text-primary-600 hover:bg-primary-50 dark:text-primary-300 dark:hover:bg-primary-500/10"
        >
          <Plus className="h-3.5 w-3.5" /> Add colour rule
        </button>
        {rules.length > 1 && (
          <span className="text-[10px] text-gray-400">First matching rule wins</span>
        )}
      </div>
    </div>
  );
}
