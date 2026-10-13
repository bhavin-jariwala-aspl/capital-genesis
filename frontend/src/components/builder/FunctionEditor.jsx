import Select from '../ui/Select';
import { COMPUTED_FIELD_FUNCTIONS } from '../../utils/fieldFunctions';

const TRIGGER_EVENTS = [
  { value: 'on_change', label: 'On field change' },
  { value: 'on_blur',   label: 'On field blur' },
  { value: 'on_load',   label: 'On form load' },
];

/**
 * FunctionEditor — assign a registered computed-field function to this field.
 *
 * Props:
 *   computed     — field.config.computed (or null/undefined)
 *   allFields    — all fields on the form (for trigger field selection)
 *   currentFieldId
 *   onChange(computed)  — receives updated computed object or null
 */
export default function FunctionEditor({ computed, allFields = [], currentFieldId, onChange }) {
  const enabled = !!computed?.fn;

  const update = (updates) => onChange({ ...(computed || { trigger_event: 'on_change' }), ...updates });

  return (
    <div className="space-y-3">
      <p className="text-xs text-gray-500">
        Assign a registered function that automatically computes this field’s value.
        Function logic lives in code ( <code>fieldFunctions.js</code> ) — safe, versioned, no eval.
      </p>

      <Select
        label="Computed function"
        value={computed?.fn || ''}
        onChange={(e) => {
          if (!e.target.value) { onChange(null); return; }
          update({ fn: e.target.value });
        }}
        options={COMPUTED_FIELD_FUNCTIONS}
        placeholder="None (not computed)"
      />

      {enabled && (
        <>
          <Select
            label="Trigger event"
            value={computed?.trigger_event || 'on_change'}
            onChange={(e) => update({ trigger_event: e.target.value })}
            options={TRIGGER_EVENTS}
          />

          <div>
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300 block mb-1">
              Trigger fields
              <span className="ml-1 text-xs text-gray-400 font-normal">(optional — leave empty to run on any change)</span>
            </label>
            <div className="space-y-1">
              {allFields
                .filter((f) => (f.field?.id || f.field_id) !== currentFieldId)
                .map((f) => {
                  const fId    = String(f.field?.name || f.field_name || '');
                  const fLabel = f.field?.label || f.label || fId;
                  const checked = (computed?.trigger_fields || []).includes(fId);
                  return (
                    <label key={fId} className="flex items-center gap-2 text-xs text-gray-700 dark:text-gray-300 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => {
                          const current = computed?.trigger_fields || [];
                          const next = checked
                            ? current.filter((x) => x !== fId)
                            : [...current, fId];
                          update({ trigger_fields: next });
                        }}
                        className="rounded border-gray-300 dark:border-gray-600"
                      />
                      {fLabel}
                    </label>
                  );
                })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

