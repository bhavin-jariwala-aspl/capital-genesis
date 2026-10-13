/**
 * wizardValidation — shared metadata-driven validation for wizard steps.
 *
 * A step stores its rules in `step.config.validation`:
 *   {
 *     block_on_invalid: true,           // block "Next" until all rules pass (default true)
 *     rules: [
 *       { field, op, value?, message? }
 *     ]
 *   }
 *
 * The SAME op catalogue drives the Builder's rule editor and the runtime
 * evaluator, so what an admin configures is exactly what end-users get.
 */

/** Op catalogue — single source of truth for the builder UI and the evaluator. */
export const VALIDATION_OPS = [
  { value: 'required',      label: 'Is required',              value_kind: 'none'   },
  { value: 'min',           label: 'Minimum (number ≥)',       value_kind: 'number' },
  { value: 'max',           label: 'Maximum (number ≤)',       value_kind: 'number' },
  { value: 'min_length',    label: 'Min length (characters)',  value_kind: 'number' },
  { value: 'max_length',    label: 'Max length (characters)',  value_kind: 'number' },
  { value: 'regex',         label: 'Matches pattern (regex)',  value_kind: 'text'   },
  { value: 'equals',        label: 'Equals value',             value_kind: 'text'   },
  { value: 'matches_field', label: 'Must match another field', value_kind: 'field'  },
  { value: 'after_field',   label: 'Date after another field', value_kind: 'field'  },
  { value: 'before_field',  label: 'Date before another field',value_kind: 'field'  },
  { value: 'gt_field',      label: 'Greater than field',       value_kind: 'field'  },
  { value: 'lt_field',      label: 'Less than field',          value_kind: 'field'  },
];

/** How each op wants its `value` rendered/collected in the builder. */
export function opValueKind(op) {
  return VALIDATION_OPS.find(o => o.value === op)?.value_kind ?? 'text';
}

/** Read the validation config off a step, tolerating missing/partial shapes. */
export function getStepValidation(step) {
  const v = step?.config?.validation;
  if (!v || typeof v !== 'object') return { block_on_invalid: true, rules: [] };
  return {
    block_on_invalid: v.block_on_invalid !== false,
    rules: Array.isArray(v.rules) ? v.rules : [],
  };
}

const isEmpty = (v) => v === undefined || v === null || v === '';

function labelForField(field, fieldMeta) {
  const meta = fieldMeta?.find?.(f => (f.field_name ?? f.name) === field);
  return meta?.label || field;
}

function defaultMessage(rule, fieldMeta) {
  const name = labelForField(rule.field, fieldMeta);
  switch (rule.op) {
    case 'required':      return `${name} is required.`;
    case 'min':           return `${name} must be at least ${rule.value}.`;
    case 'max':           return `${name} must be at most ${rule.value}.`;
    case 'min_length':    return `${name} must be at least ${rule.value} characters.`;
    case 'max_length':    return `${name} must be at most ${rule.value} characters.`;
    case 'regex':         return `${name} is not in the expected format.`;
    case 'equals':        return `${name} must equal “${rule.value}”.`;
    case 'matches_field': return `${name} must match ${labelForField(rule.value, fieldMeta)}.`;
    case 'after_field':   return `${name} must be after ${labelForField(rule.value, fieldMeta)}.`;
    case 'before_field':  return `${name} must be before ${labelForField(rule.value, fieldMeta)}.`;
    case 'gt_field':      return `${name} must be greater than ${labelForField(rule.value, fieldMeta)}.`;
    case 'lt_field':      return `${name} must be less than ${labelForField(rule.value, fieldMeta)}.`;
    default:              return `${name} is invalid.`;
  }
}

/**
 * Evaluate a single rule against the merged form data.
 * Value-constraint ops pass when the field is empty (that's `required`'s job),
 * so admins can combine "required" + "min" without double-flagging blanks.
 */
function passesRule(rule, data) {
  const v = data?.[rule.field];
  const other = (f) => data?.[f];
  switch (rule.op) {
    case 'required':      return !isEmpty(v);
    case 'min':           return isEmpty(v) || Number(v) >= Number(rule.value);
    case 'max':           return isEmpty(v) || Number(v) <= Number(rule.value);
    case 'min_length':    return isEmpty(v) || String(v).length >= Number(rule.value);
    case 'max_length':    return isEmpty(v) || String(v).length <= Number(rule.value);
    case 'regex':
      if (isEmpty(v)) return true;
      try { return new RegExp(rule.value).test(String(v)); } catch { return true; }
    case 'equals':        return isEmpty(v) || String(v) === String(rule.value);
    case 'matches_field': return isEmpty(v) || String(v) === String(other(rule.value) ?? '');
    case 'after_field':   return isEmpty(v) || isEmpty(other(rule.value)) || new Date(v) >  new Date(other(rule.value));
    case 'before_field':  return isEmpty(v) || isEmpty(other(rule.value)) || new Date(v) <  new Date(other(rule.value));
    case 'gt_field':      return isEmpty(v) || isEmpty(other(rule.value)) || Number(v)    >  Number(other(rule.value));
    case 'lt_field':      return isEmpty(v) || isEmpty(other(rule.value)) || Number(v)    <  Number(other(rule.value));
    default:              return true;
  }
}

/**
 * Evaluate all step rules against `data` (merged form values across steps for
 * cross-field rules). Returns [{ field, message }] for every failing rule.
 *
 * @param validation  result of getStepValidation(step)
 * @param data        merged { fieldName: value }
 * @param fieldMeta   optional [{ field_name/name, label }] for friendlier messages
 */
export function evaluateStepRules(validation, data, fieldMeta) {
  const rules = validation?.rules || [];
  const errors = [];
  for (const rule of rules) {
    if (!rule?.field || !rule?.op) continue;
    if (!passesRule(rule, data || {})) {
      errors.push({ field: rule.field, message: rule.message?.trim() || defaultMessage(rule, fieldMeta) });
    }
  }
  return errors;
}
