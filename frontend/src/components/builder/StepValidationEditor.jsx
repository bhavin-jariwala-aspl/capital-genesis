import { useQuery } from '@tanstack/react-query';
import { runtimeService } from '../../services/metadata.service';
import { VALIDATION_OPS, opValueKind } from '../../utils/wizardValidation';
import { Plus, Trash2, ShieldCheck } from 'lucide-react';

const ctrlCls = 'block w-full rounded-lg border border-gray-300 dark:border-white/10 bg-white dark:bg-white/5 px-2.5 py-1.5 text-xs text-gray-900 dark:text-white/80 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500';

/**
 * StepValidationEditor — friendly, structured rule builder for a wizard step.
 * Replaces raw JSON editing. Rules are stored on `step.config.validation` and
 * enforced at runtime by WizardRenderer via utils/wizardValidation.
 *
 * Props:
 *   value    — { block_on_invalid, rules: [{ field, op, value, message }] }
 *   onChange — (nextValidation) => void
 *   formId   — linked form id; used to offer a field-name dropdown
 */
export default function StepValidationEditor({ value, onChange, formId }) {
  const validation = {
    block_on_invalid: value?.block_on_invalid !== false,
    rules: Array.isArray(value?.rules) ? value.rules : [],
  };

  // Load the linked form so we can offer real field names instead of free text
  const { data } = useQuery({
    queryKey: ['runtime-form', formId],
    queryFn:  () => runtimeService.getForm(formId),
    enabled:  !!formId,
  });
  const fieldOptions = (data?.data?.field_layouts || [])
    .map(fl => fl.field)
    .filter(f => f && f.field_type !== 'heading')
    .map(f => ({ value: f.name, label: f.label || f.name }));

  const emit = (next) => onChange?.(next);
  const setRule = (i, patch) => emit({ ...validation, rules: validation.rules.map((r, idx) => idx === i ? { ...r, ...patch } : r) });
  const addRule = () => emit({ ...validation, rules: [...validation.rules, { field: fieldOptions[0]?.value || '', op: 'required', value: '', message: '' }] });
  const removeRule = (i) => emit({ ...validation, rules: validation.rules.filter((_, idx) => idx !== i) });

  const FieldPicker = ({ val, onPick, placeholder }) => (
    fieldOptions.length ? (
      <select className={ctrlCls} value={val || ''} onChange={e => onPick(e.target.value)}>
        <option value="">{placeholder || '— field —'}</option>
        {fieldOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    ) : (
      <input className={ctrlCls} value={val || ''} onChange={e => onPick(e.target.value)} placeholder={placeholder || 'field_name'} />
    )
  );

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <ShieldCheck className="w-4 h-4 text-primary-500" />
        <h4 className="text-sm font-semibold text-gray-800 dark:text-white/80">Validation Rules</h4>
      </div>

      {/* Block-on-invalid toggle */}
      <label className="flex items-center gap-2.5 p-2.5 rounded-lg bg-gray-50 dark:bg-white/[0.03] border border-gray-200 dark:border-white/10 cursor-pointer">
        <input
          type="checkbox"
          className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
          checked={validation.block_on_invalid}
          onChange={e => emit({ ...validation, block_on_invalid: e.target.checked })}
        />
        <span className="text-xs text-gray-700 dark:text-white/70">
          Block <strong>Continue</strong> until every rule on this step passes
        </span>
      </label>

      {/* Rules */}
      <div className="space-y-2">
        {validation.rules.length === 0 && (
          <p className="text-xs text-gray-400 dark:text-white/30 italic py-2">
            No rules yet. Add rules to guard this step beyond the form&apos;s own field validation
            (e.g. cross-field checks, ranges, patterns).
          </p>
        )}

        {validation.rules.map((rule, i) => {
          const kind = opValueKind(rule.op);
          return (
            <div key={i} className="p-2.5 rounded-lg border border-gray-200 dark:border-white/10 bg-white dark:bg-white/[0.02] space-y-2">
              <div className="grid grid-cols-[1fr_1fr_auto] gap-2">
                <FieldPicker val={rule.field} onPick={v => setRule(i, { field: v })} placeholder="— field —" />
                <select className={ctrlCls} value={rule.op} onChange={e => setRule(i, { op: e.target.value, value: '' })}>
                  {VALIDATION_OPS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
                <button
                  type="button"
                  onClick={() => removeRule(i)}
                  className="p-1.5 rounded hover:bg-red-50 dark:hover:bg-red-500/10 text-gray-400 hover:text-red-500 transition-colors"
                  aria-label="Remove rule"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>

              {/* Value input varies by op */}
              {kind !== 'none' && (
                kind === 'field'
                  ? <FieldPicker val={rule.value} onPick={v => setRule(i, { value: v })} placeholder="— compare with field —" />
                  : <input
                      className={ctrlCls}
                      type={kind === 'number' ? 'number' : 'text'}
                      value={rule.value ?? ''}
                      onChange={e => setRule(i, { value: e.target.value })}
                      placeholder={kind === 'number' ? 'value' : kind === 'text' ? 'value / pattern' : 'value'}
                    />
              )}

              <input
                className={ctrlCls}
                value={rule.message ?? ''}
                onChange={e => setRule(i, { message: e.target.value })}
                placeholder="Custom error message (optional)"
              />
            </div>
          );
        })}
      </div>

      <button
        type="button"
        onClick={addRule}
        className="flex items-center gap-1.5 text-xs font-medium text-primary-600 dark:text-primary-300 hover:text-primary-700 transition-colors"
      >
        <Plus className="w-3.5 h-3.5" /> Add rule
      </button>
    </div>
  );
}
