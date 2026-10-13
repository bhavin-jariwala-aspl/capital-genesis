import { Plus, Trash2, Sigma, Calculator } from 'lucide-react';
import clsx from 'clsx';

const input = 'rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-sm text-gray-900 focus:border-primary-500 focus:outline-none dark:border-white/10 dark:bg-white/5 dark:text-white';

/**
 * MeasureEditor — "what do you want to measure?"
 *
 * Two kinds of measure:
 *   • an aggregation of a field ("Sum of Premium")
 *   • a calculated measure combining two earlier measures ("Claims paid as a % of
 *     Premium") — assembled from two dropdowns and an operation, never typed as a
 *     formula string. That keeps loss ratios, win rates and averages reachable
 *     without a formula language, and means there is nothing to parse or escape.
 *
 * Either kind can then be *shown as* a table calculation — running total, % of
 * total, rank, change from the previous row, moving average — chosen from a
 * dropdown, the way Tableau's "quick table calculations" work.
 */
export default function MeasureEditor({ metrics, fields, vocabulary, onChange }) {
  const aggregations = vocabulary?.aggregations ?? [];
  const formulaOps = vocabulary?.formula_ops ?? [];
  const calculations = vocabulary?.calculations ?? [];
  const numericFields = fields.filter((f) => f.agg);

  const update = (i, patch) => onChange(metrics.map((m, idx) => (idx === i ? { ...m, ...patch } : m)));
  const remove = (i) => onChange(metrics.filter((_, idx) => idx !== i));

  const addAggregation = () =>
    onChange([...metrics, { agg: numericFields.length ? 'sum' : 'count', field: numericFields[0]?.key, label: '' }]);

  const addFormula = () =>
    onChange([
      ...metrics,
      { agg: 'formula', label: '', formula: { op: 'divide', a: 'm0', b: metrics.length > 1 ? 'm1' : 'm0' } },
    ]);

  /** Only measures defined *before* this one may be referenced, so no cycles. */
  const referenceable = (index) =>
    metrics.slice(0, index).map((m, i) => ({ key: `m${i}`, label: m.label || describeMetric(m, fields, aggregations, formulaOps) }));

  return (
    <div className="space-y-2">
      {metrics.length === 0 && (
        <p className="text-xs text-gray-400">Add at least one measure — for example “Number of records”.</p>
      )}

      {metrics.map((m, i) => {
        const isFormula = m.agg === 'formula' || !!m.formula;
        const refs = referenceable(i);
        return (
          <div key={i} className="space-y-1.5 rounded-lg border border-gray-100 p-1.5 dark:border-white/5">
            <div className="flex items-center gap-1.5">
              <span
                className={clsx(
                  'flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-[10px] font-bold',
                  isFormula
                    ? 'bg-violet-500/10 text-violet-500'
                    : 'bg-primary-500/10 text-primary-500',
                )}
                title={isFormula ? 'Calculated measure' : 'Aggregation'}
              >
                {isFormula ? <Calculator className="h-3.5 w-3.5" /> : <Sigma className="h-3.5 w-3.5" />}
              </span>

              {isFormula ? (
                <FormulaRow
                  formula={m.formula || {}}
                  refs={refs}
                  ops={formulaOps}
                  onChange={(formula) => update(i, { formula })}
                />
              ) : (
                <>
                  <select className={clsx(input, 'shrink-0')} value={m.agg || 'count'} onChange={(e) => update(i, { agg: e.target.value })}>
                    {aggregations.map((a) => (
                      <option key={a.key} value={a.key}>{a.label}</option>
                    ))}
                  </select>
                  {aggregations.find((a) => a.key === (m.agg || 'count'))?.needs_field && (
                    <select
                      className={clsx(input, 'min-w-0 flex-1')}
                      value={m.field || ''}
                      onChange={(e) => update(i, { field: e.target.value })}
                    >
                      <option value="">Choose a field…</option>
                      {(aggregations.find((a) => a.key === m.agg)?.numeric ? numericFields : fields).map((f) => (
                        <option key={f.key} value={f.key}>{f.label}</option>
                      ))}
                    </select>
                  )}
                </>
              )}

              <button
                type="button"
                onClick={() => remove(i)}
                aria-label="Remove measure"
                className="rounded p-1.5 text-gray-400 hover:bg-rose-50 hover:text-rose-500 dark:hover:bg-rose-500/10"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>

            <div className="flex items-center gap-1.5">
              <input
                className={clsx(input, 'min-w-0 flex-1 text-xs')}
                value={m.label ?? ''}
                placeholder={`Column heading (defaults to “${describeMetric(m, fields, aggregations, formulaOps)}”)`}
                onChange={(e) => update(i, { label: e.target.value })}
              />
              {calculations.length > 0 && (
                <select
                  className={clsx(input, 'shrink-0 text-xs')}
                  value={m.calc ?? ''}
                  title="Show as — a running total, a share of the total, a rank or a change from the previous row"
                  aria-label="Show as"
                  onChange={(e) => update(i, { calc: e.target.value || undefined })}
                >
                  {calculations.map((c) => (
                    <option key={c.key} value={c.key}>{c.key ? `Show as: ${c.label}` : 'Show as: plain value'}</option>
                  ))}
                </select>
              )}
            </div>

            {isFormula && refs.length === 0 && (
              <p className="text-[10px] text-amber-600 dark:text-amber-400">
                A calculated measure needs a measure above it to work with. Add one first, then drag this one below it.
              </p>
            )}
          </div>
        );
      })}

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={addAggregation}
          className="flex items-center gap-1 rounded px-1.5 py-0.5 text-xs font-medium text-primary-600 hover:bg-primary-50 dark:text-primary-300 dark:hover:bg-primary-500/10"
        >
          <Plus className="h-3.5 w-3.5" /> Add measure
        </button>
        <button
          type="button"
          onClick={addFormula}
          disabled={metrics.length === 0}
          title="Combine two measures — a ratio, a percentage, a difference"
          className="flex items-center gap-1 rounded px-1.5 py-0.5 text-xs font-medium text-violet-600 hover:bg-violet-50 disabled:opacity-40 dark:text-violet-300 dark:hover:bg-violet-500/10"
        >
          <Plus className="h-3.5 w-3.5" /> Add calculation
        </button>
      </div>
    </div>
  );
}

function FormulaRow({ formula, refs, ops, onChange }) {
  const op = ops.find((o) => o.key === formula.op) ?? ops[0];
  const needsB = op?.key !== 'percent_of_total';

  return (
    <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
      <select className={clsx(input, 'min-w-0 flex-1')} value={formula.a ?? ''} onChange={(e) => onChange({ ...formula, a: e.target.value })}>
        <option value="">Choose a measure…</option>
        {refs.map((r) => (
          <option key={r.key} value={r.key}>{r.label}</option>
        ))}
      </select>
      <select className={clsx(input, 'shrink-0')} value={op?.key} onChange={(e) => onChange({ ...formula, op: e.target.value })}>
        {ops.map((o) => (
          <option key={o.key} value={o.key}>{o.label}</option>
        ))}
      </select>
      {needsB && (
        <select className={clsx(input, 'min-w-0 flex-1')} value={formula.b ?? ''} onChange={(e) => onChange({ ...formula, b: e.target.value })}>
          <option value="">Choose a measure…</option>
          {refs.map((r) => (
            <option key={r.key} value={r.key}>{r.label}</option>
          ))}
        </select>
      )}
    </div>
  );
}

/** The default column heading, matching how the engine names an unlabelled measure. */
function describeMetric(m, fields, aggregations, formulaOps) {
  if (m.agg === 'formula' || m.formula) {
    const op = formulaOps?.find((o) => o.key === m.formula?.op);
    return op ? op.label.replace('A', 'measure').replace('B', 'measure') : 'Calculation';
  }
  if (!m.agg || m.agg === 'count') return 'Number of records';
  const agg = aggregations?.find((a) => a.key === m.agg);
  const field = fields.find((f) => f.key === m.field);
  return `${agg?.label || m.agg} ${field?.label || m.field || ''}`.trim();
}
