import { useEffect, useState } from 'react';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import Select from '../ui/Select';
import { apiErrorText } from '../../utils/record';

const IN_USE_PREFIX = 'Values still in use: ';

/**
 * The picklist values a field save was refused for, from the API's 400:
 * `Values still in use: "dormant" (3 records), "closed" (1 record). Choose…`
 * → [{ value: 'dormant', count: 3 }, { value: 'closed', count: 1 }].
 * Returns null for any other error.
 */
export function parseValuesInUse(err) {
  const msg = typeof err === 'string' ? err : apiErrorText(err, '');
  if (!msg.startsWith(IN_USE_PREFIX)) return null;
  const out = [];
  for (const m of msg.slice(IN_USE_PREFIX.length).matchAll(/"(.*?)" \((\d+) records?\)/g)) {
    out.push({ value: m[1], count: Number(m[2]) });
  }
  return out.length ? out : null;
}

/** Option values of a field (`['a']` or `[{ value, label }]`) as Select options. */
export function optionChoices(options) {
  return (Array.isArray(options) ? options : [])
    .map((o) => (typeof o === 'string' ? { value: o, label: o } : { value: String(o?.value ?? ''), label: o?.label || String(o?.value ?? '') }))
    .filter((o) => o.value !== '');
}

/**
 * Removing a picklist value that records still hold is refused by the API
 * until each such value is mapped to a remaining one. This asks for that
 * mapping, per field: `conflicts` is
 * [{ key, label, values: [{ value, count }], options: [{ value, label }] }]
 * and `onConfirm` gets { [key]: { [removedValue]: remainingValue } }, which the
 * caller resends as each field's `option_replacements`.
 */
export default function OptionReplacementDialog({ conflicts, onCancel, onConfirm, saving = false, error = null }) {
  const [choices, setChoices] = useState({});
  useEffect(() => { setChoices({}); }, [conflicts]);

  const open = !!conflicts?.length;
  const complete = open && conflicts.every((c) => c.values.every((v) => choices[c.key]?.[v.value]));
  const pick = (key, value, to) => setChoices((prev) => ({ ...prev, [key]: { ...prev[key], [value]: to } }));

  return (
    <Modal
      isOpen={open}
      onClose={onCancel}
      title="Replace values still in use"
      size="md"
      footer={(
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onCancel}>Cancel</Button>
          <Button disabled={!complete} loading={saving} onClick={() => onConfirm(choices)}>Replace and save</Button>
        </div>
      )}
    >
      <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
        Records still hold the values you removed. Choose the value each one moves to; those records are updated when the field is saved.
      </p>
      {error && <p className="mb-3 text-sm text-red-600 dark:text-red-400">{error}</p>}
      <div className="space-y-5">
        {(conflicts ?? []).map((c) => (
          <div key={c.key}>
            {conflicts.length > 1 && <p className="text-sm font-semibold text-gray-800 dark:text-gray-200 mb-2">{c.label}</p>}
            <div className="space-y-3">
              {c.values.map((v) => (
                <div key={v.value} className="grid grid-cols-2 items-end gap-3">
                  <div className="text-sm">
                    <span className="font-medium text-gray-800 dark:text-gray-200">&ldquo;{v.value}&rdquo;</span>
                    <span className="block text-xs text-gray-500">{v.count} record{v.count === 1 ? '' : 's'}</span>
                  </div>
                  <Select
                    aria-label={`Replacement for ${v.value}`}
                    placeholder="Move to…"
                    options={c.options}
                    value={choices[c.key]?.[v.value] ?? ''}
                    onChange={(e) => pick(c.key, v.value, e.target.value)}
                  />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </Modal>
  );
}
