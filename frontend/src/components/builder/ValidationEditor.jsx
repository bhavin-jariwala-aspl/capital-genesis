import { Plus, Trash2, Info, ServerCog } from 'lucide-react';
import { VALIDATION_TYPES, VALIDATION_GROUPS } from '../../utils/constants';
import Input from '../ui/Input';
import Button from '../ui/Button';

/**
 * ValidationEditor — configure validation rules for a field.
 *
 * Every rule here is enforced twice: instantly in the browser while typing,
 * and again by the API when the record is saved (the `validation-engine` on
 * the server evaluates the same rows). The one exception is "Custom JS", which
 * only runs in the browser and is flagged as such.
 *
 * Props:
 *   validations  — UiValidation[]  ({ validation_type, value, error_message, order_index })
 *   onChange(validations)
 *   allFields    — other fields on the form (for the "compare with field" rules)
 *   fieldType    — the field's type, used to suggest relevant rules first
 */

const TYPE_RELEVANCE = {
  number: ['Number', 'Compare'], currency: ['Number', 'Compare'], percentage: ['Number', 'Compare'], rating: ['Number'],
  date: ['Date', 'Compare'], datetime: ['Date', 'Compare'],
  text: ['Text'], textarea: ['Text'], email: ['Text'], phone: ['Text'], url: ['Text'],
  select: ['Text'], multi_select: ['Text'], radio: ['Text'],
};

const defaultMessage = (meta, fieldLabel) => {
  switch (meta.type) {
    case 'required': return `${fieldLabel || 'This field'} is required`;
    case 'unique':   return `${fieldLabel || 'This value'} must be unique`;
    default:         return '';
  }
};

export default function ValidationEditor({ validations = [], onChange, allFields = [], fieldType, fieldLabel }) {
  const relevant = new Set(TYPE_RELEVANCE[fieldType] ?? []);
  const groups = [...VALIDATION_GROUPS].sort((a, b) => Number(relevant.has(b)) - Number(relevant.has(a)));

  const addValidation = () => {
    const meta = VALIDATION_TYPES[0];
    onChange([...validations, { validation_type: meta.type, value: '', error_message: defaultMessage(meta, fieldLabel), order_index: validations.length }]);
  };

  const updateValidation = (index, updates) => {
    onChange(validations.map((v, i) => {
      if (i !== index) return v;
      const next = { ...v, ...updates };
      if (updates.validation_type) {
        const meta = VALIDATION_TYPES.find((t) => t.type === updates.validation_type);
        // Changing the rule type resets a value that no longer applies and offers a sensible message.
        next.value = meta?.hasValue ? (meta.hasValue === 'field' ? '' : v.value) : '';
        if (!v.error_message || v.error_message === defaultMessage(VALIDATION_TYPES.find((t) => t.type === v.validation_type) ?? {}, fieldLabel)) {
          next.error_message = defaultMessage(meta ?? {}, fieldLabel);
        }
      }
      return next;
    }));
  };

  const removeValidation = (index) => onChange(validations.filter((_, i) => i !== index));

  const otherFields = allFields
    .map((f) => f.field ?? f)
    .filter((f) => f && f.name && !['heading', 'divider', 'status_tracker'].includes(f.field_type));

  return (
    <div className="space-y-2">
      <p className="flex items-start gap-1.5 text-[11px] leading-relaxed text-gray-500 dark:text-white/50">
        <ServerCog className="mt-0.5 h-3 w-3 shrink-0" />
        Rules are checked live in the form and again by the server on save.
      </p>

      {validations.map((v, i) => {
        const meta = VALIDATION_TYPES.find((t) => t.type === v.validation_type) ?? VALIDATION_TYPES[0];
        return (
          <div key={i} className="flex flex-col gap-2 p-3 bg-gray-50 dark:bg-white/[0.04] rounded-lg border border-gray-200 dark:border-white/[0.08]">
            <div className="flex items-center gap-2">
              <select
                className="form-input text-xs flex-1"
                value={v.validation_type}
                onChange={(e) => updateValidation(i, { validation_type: e.target.value })}
              >
                {groups.map((g) => (
                  <optgroup key={g} label={relevant.has(g) ? `${g} · suggested` : g}>
                    {VALIDATION_TYPES.filter((t) => t.group === g).map((t) => (
                      <option key={t.type} value={t.type}>{t.label}</option>
                    ))}
                  </optgroup>
                ))}
              </select>
              <button onClick={() => removeValidation(i)} className="p-1.5 text-gray-400 hover:text-red-500 shrink-0" aria-label="Remove rule">
                <Trash2 className="h-4 w-4" />
              </button>
            </div>

            {meta.hasValue === 'field' && (
              <select className="form-input text-xs" value={v.value || ''} onChange={(e) => updateValidation(i, { value: e.target.value })}>
                <option value="">{meta.valueLabel || 'Other field'}…</option>
                {otherFields.map((f) => <option key={f.name} value={f.name}>{f.label} ({f.name})</option>)}
              </select>
            )}
            {meta.hasValue === true && (
              <Input
                type={meta.inputType || 'text'}
                placeholder={meta.valueLabel || 'Value'}
                value={v.value ?? ''}
                onChange={(e) => updateValidation(i, { value: e.target.value })}
                className="text-xs"
              />
            )}

            <Input
              placeholder="Error message shown to the user"
              value={v.error_message || ''}
              onChange={(e) => updateValidation(i, { error_message: e.target.value })}
              className="text-xs"
            />

            {meta.hint && (
              <p className={`flex items-start gap-1 text-[11px] leading-relaxed ${meta.type === 'custom' ? 'text-amber-600 dark:text-amber-400' : 'text-gray-400'}`}>
                <Info className="mt-0.5 h-3 w-3 shrink-0" /> {meta.hint}
              </p>
            )}
          </div>
        );
      })}

      <Button variant="ghost" size="sm" onClick={addValidation} className="w-full border border-dashed border-gray-300">
        <Plus className="h-3.5 w-3.5" />
        Add Validation Rule
      </Button>
    </div>
  );
}
