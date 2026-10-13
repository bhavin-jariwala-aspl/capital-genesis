import { useState } from 'react';
import { Plus, Trash2, Layers, ChevronDown, ChevronRight } from 'lucide-react';
import clsx from 'clsx';

const input = 'rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-sm text-gray-900 focus:border-primary-500 focus:outline-none dark:border-white/10 dark:bg-white/5 dark:text-white';

/**
 * GroupingEditor — "how should the rows be grouped?"
 *
 * A grouping is a field, optionally bucketed:
 *   • dates get a period (by day / week / month / quarter / year)
 *   • numbers and picklists can be grouped into *named bands* ("Under 10k",
 *     "10k–50k") so a chart shows business categories instead of hundreds of
 *     distinct values. This is the "bucket field" idea from Salesforce, without
 *     needing an admin to create a custom field for it.
 */
export default function GroupingEditor({ groups, fields, vocabulary, max = 1, onChange }) {
  const periods = vocabulary?.periods ?? [];
  const groupable = fields.filter((f) => f.group !== false);

  const update = (i, patch) => onChange(groups.map((g, idx) => (idx === i ? { ...g, ...patch } : g)));
  const remove = (i) => onChange(groups.filter((_, idx) => idx !== i));
  const add = () => onChange([...groups, { field: groupable[0]?.key, period: '' }]);

  return (
    <div className="space-y-2">
      {groups.length === 0 && (
        <p className="text-xs text-gray-400">
          Pick a field to group by — the chart gets one bar or slice per value.
        </p>
      )}

      {groups.map((g, i) => {
        const field = fields.find((f) => f.key === g.field);
        return (
          <GroupRow
            key={i}
            index={i}
            group={g}
            field={field}
            groupable={groupable}
            periods={periods}
            isSecond={i === 1}
            onChange={(patch) => update(i, patch)}
            onRemove={() => remove(i)}
          />
        );
      })}

      {groups.length < max && (
        <button
          type="button"
          onClick={add}
          className="flex items-center gap-1 rounded px-1.5 py-0.5 text-xs font-medium text-primary-600 hover:bg-primary-50 dark:text-primary-300 dark:hover:bg-primary-500/10"
        >
          <Plus className="h-3.5 w-3.5" />
          {groups.length === 0 ? 'Add grouping' : 'Add second grouping'}
        </button>
      )}
    </div>
  );
}

function GroupRow({ index, group, field, groupable, periods, isSecond, onChange, onRemove }) {
  const [showBuckets, setShowBuckets] = useState(!!group.buckets?.length);
  const canBucket = field && ['number', 'currency', 'percent', 'enum', 'string'].includes(field.type);

  return (
    <div className="space-y-1.5 rounded-lg border border-gray-100 p-1.5 dark:border-white/5">
      <div className="flex items-center gap-1.5">
        {isSecond && (
          <span className="shrink-0 rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-500 dark:bg-white/10 dark:text-white/50">
            then by
          </span>
        )}
        <select
          className={clsx(input, 'min-w-0 flex-1')}
          value={group.field || ''}
          onChange={(e) => onChange({ field: e.target.value, period: '', buckets: undefined })}
        >
          {groupable.map((f) => (
            <option key={f.key} value={f.key}>{f.label}</option>
          ))}
        </select>

        {field?.type === 'date' && (
          <select className={clsx(input, 'shrink-0')} value={group.period || ''} onChange={(e) => onChange({ period: e.target.value })}>
            {periods.map((p) => (
              <option key={p.key} value={p.key}>{p.label}</option>
            ))}
          </select>
        )}

        <button
          type="button"
          onClick={onRemove}
          aria-label="Remove grouping"
          className="rounded p-1.5 text-gray-400 hover:bg-rose-50 hover:text-rose-500 dark:hover:bg-rose-500/10"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>

      {canBucket && (
        <button
          type="button"
          onClick={() => setShowBuckets((v) => !v)}
          className="flex items-center gap-1 text-[11px] font-medium text-gray-500 hover:text-primary-600 dark:text-white/50"
        >
          {showBuckets ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
          <Layers className="h-3 w-3" />
          Group values into bands
          {group.buckets?.length ? (
            <span className="rounded-full bg-primary-500/10 px-1.5 text-[10px] text-primary-600 dark:text-primary-300">
              {group.buckets.length}
            </span>
          ) : null}
        </button>
      )}

      {showBuckets && canBucket && (
        <BucketEditor
          field={field}
          buckets={group.buckets ?? []}
          otherLabel={group.other_label}
          onChange={(patch) => onChange(patch)}
        />
      )}
      {index === 0 && field?.hint && <p className="px-0.5 text-[10px] text-gray-400">{field.hint}</p>}
    </div>
  );
}

/**
 * Named value bands. Numeric fields get from/to ranges (upper bound exclusive, so
 * adjacent bands can share a number without double-counting); picklists get a
 * multi-select of the values that belong in each band.
 */
function BucketEditor({ field, buckets, otherLabel, onChange }) {
  const isNumeric = ['number', 'currency', 'percent'].includes(field.type);

  const setBuckets = (next) => onChange({ buckets: next.length ? next : undefined });
  const update = (i, patch) => setBuckets(buckets.map((b, idx) => (idx === i ? { ...b, ...patch } : b)));
  const remove = (i) => setBuckets(buckets.filter((_, idx) => idx !== i));
  const add = () =>
    setBuckets([...buckets, isNumeric ? { label: '', min: '', max: '' } : { label: '', values: [] }]);

  return (
    <div className="space-y-1.5 rounded-lg bg-gray-50 p-2 dark:bg-white/[0.03]">
      {buckets.length === 0 && (
        <p className="text-[10px] text-gray-400">
          {isNumeric
            ? 'Add a band, e.g. “Under 10k” with no lower bound and 10000 as the upper bound.'
            : 'Add a band and tick which values belong in it.'}
        </p>
      )}

      {buckets.map((b, i) => (
        <div key={i} className="space-y-1 rounded-md border border-gray-200 bg-white p-1.5 dark:border-white/10 dark:bg-white/5">
          <div className="flex items-center gap-1.5">
            <input
              className={clsx(input, 'min-w-0 flex-1 text-xs')}
              value={b.label ?? ''}
              placeholder="Band name, e.g. Large deals"
              onChange={(e) => update(i, { label: e.target.value })}
            />
            <button
              type="button"
              onClick={() => remove(i)}
              aria-label="Remove band"
              className="rounded p-1 text-gray-400 hover:bg-rose-50 hover:text-rose-500 dark:hover:bg-rose-500/10"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>

          {isNumeric ? (
            <div className="flex items-center gap-1.5">
              <input
                className={clsx(input, 'min-w-0 flex-1 text-xs')}
                type="number"
                value={b.min ?? ''}
                placeholder="From (any)"
                onChange={(e) => update(i, { min: e.target.value })}
              />
              <span className="text-[10px] text-gray-400">up to</span>
              <input
                className={clsx(input, 'min-w-0 flex-1 text-xs')}
                type="number"
                value={b.max ?? ''}
                placeholder="To (any)"
                onChange={(e) => update(i, { max: e.target.value })}
              />
            </div>
          ) : (
            <div className="flex flex-wrap gap-1">
              {(field.options ?? []).map((o) => {
                const on = (b.values ?? []).includes(o);
                return (
                  <button
                    key={o}
                    type="button"
                    onClick={() =>
                      update(i, {
                        values: on ? (b.values ?? []).filter((v) => v !== o) : [...(b.values ?? []), o],
                      })
                    }
                    className={clsx(
                      'rounded-full px-2 py-0.5 text-[10px] font-medium capitalize transition',
                      on
                        ? 'bg-primary-600 text-on-primary'
                        : 'bg-gray-100 text-gray-500 hover:bg-gray-200 dark:bg-white/10 dark:text-white/50',
                    )}
                  >
                    {String(o).replace(/_/g, ' ')}
                  </button>
                );
              })}
              {!field.options?.length && (
                <input
                  className={clsx(input, 'w-full text-xs')}
                  value={(b.values ?? []).join(', ')}
                  placeholder="Values in this band, separated by commas"
                  onChange={(e) => update(i, { values: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) })}
                />
              )}
            </div>
          )}
        </div>
      ))}

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={add}
          className="flex items-center gap-1 text-[11px] font-medium text-primary-600 hover:underline dark:text-primary-300"
        >
          <Plus className="h-3 w-3" /> Add band
        </button>
        {buckets.length > 0 && (
          <input
            className={clsx(input, 'ml-auto w-40 text-[11px]')}
            value={otherLabel ?? ''}
            placeholder="Everything else: “Other”"
            onChange={(e) => onChange({ other_label: e.target.value || undefined })}
          />
        )}
      </div>
    </div>
  );
}
