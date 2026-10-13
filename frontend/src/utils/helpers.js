/**
 * Shared UI helpers — validation rules, field state, and value formatting.
 */
import { formatCurrency as currencyFormat } from './currency';
import { currencyOptions } from '../store/currencyStore';

/**
 * Convert field validations into react-hook-form register options.
 */
export function buildValidationRules(field) {
  const rules = {};
  // Admin rules that need a function (cross-field, lists, dates). react-hook-form
  // passes (value, formValues) to each validator, which is how the *_field rules
  // read their sibling.
  const extra = [];

  // Always enforce required when is_required is true
  if (field.is_required) {
    rules.required = `${field.label || 'This field'} is required`;
  }

  for (const v of field.validations || []) {
    switch (v.validation_type) {
      case 'required':
        rules.required = v.error_message || `${field.label} is required`;
        break;
      case 'minLength':
        rules.minLength = { value: Number(v.value), message: v.error_message };
        break;
      case 'maxLength':
        rules.maxLength = { value: Number(v.value), message: v.error_message };
        break;
      case 'min':
        rules.min = { value: Number(v.value), message: v.error_message };
        break;
      case 'max':
        rules.max = { value: Number(v.value), message: v.error_message };
        break;
      case 'pattern':
        rules.pattern = { value: new RegExp(v.value), message: v.error_message };
        break;
      case 'email':
        rules.pattern = rules.pattern || { value: /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/, message: v.error_message || 'Enter a valid email address' };
        break;
      case 'url':
        rules.pattern = rules.pattern || { value: /^https?:\/\/.+/i, message: v.error_message || 'URL must start with http:// or https://' };
        break;
      case 'phone':
        rules.pattern = rules.pattern || { value: /^[+]?[\d\s\-()]{7,20}$/, message: v.error_message || 'Enter a valid phone number' };
        break;
      case 'integer':
        extra.push((val) => (val === '' || val == null || Number.isInteger(Number(val))) || v.error_message || 'Must be a whole number');
        break;
      case 'positive':
        extra.push((val) => (val === '' || val == null || Number(val) > 0) || v.error_message || 'Must be greater than zero');
        break;
      case 'non_negative':
        extra.push((val) => (val === '' || val == null || Number(val) >= 0) || v.error_message || 'Cannot be negative');
        break;
      case 'in': case 'not_in': {
        const list = String(v.value ?? '').split(',').map((x) => x.trim()).filter(Boolean);
        extra.push((val) => {
          if (val === '' || val == null || (Array.isArray(val) && !val.length)) return true;
          const vals = (Array.isArray(val) ? val : [val]).map(String);
          const inside = vals.every((x) => list.includes(x));
          if (v.validation_type === 'in') return inside || v.error_message || `Must be one of: ${list.join(', ')}`;
          return !vals.some((x) => list.includes(x)) || v.error_message || `Cannot be one of: ${list.join(', ')}`;
        });
        break;
      }
      case 'min_date': case 'max_date': {
        const bound = v.value === 'today' ? new Date(new Date().toDateString()) : new Date(v.value);
        extra.push((val) => {
          if (!val || Number.isNaN(bound.getTime())) return true;
          const d = new Date(val); if (Number.isNaN(d.getTime())) return 'Enter a valid date';
          const day = (x) => Date.UTC(x.getUTCFullYear(), x.getUTCMonth(), x.getUTCDate());
          if (v.validation_type === 'min_date' && day(d) < day(bound)) return v.error_message || `Date cannot be before ${v.value}`;
          if (v.validation_type === 'max_date' && day(d) > day(bound)) return v.error_message || `Date cannot be after ${v.value}`;
          return true;
        });
        break;
      }
      case 'equals_field': case 'not_equals_field': {
        const other = v.value;
        extra.push((val, all) => {
          if (val === '' || val == null) return true;
          const same = String(val) === String(all?.[other] ?? '');
          return (v.validation_type === 'equals_field' ? same : !same) || v.error_message || (v.validation_type === 'equals_field' ? `Must match ${other}` : `Must differ from ${other}`);
        });
        break;
      }
      case 'gt_field': case 'gte_field': case 'lt_field': case 'lte_field': {
        const other = v.value;
        const isDate = ['date', 'datetime'].includes(field.field_type);
        extra.push((val, all) => {
          const o = all?.[other];
          if (val === '' || val == null || o === '' || o == null) return true;
          const [a, b] = isDate ? [new Date(val).getTime(), new Date(o).getTime()] : [Number(val), Number(o)];
          if (Number.isNaN(a) || Number.isNaN(b)) return v.error_message || `Cannot compare with ${other}`;
          const ok = { gt_field: a > b, gte_field: a >= b, lt_field: a < b, lte_field: a <= b }[v.validation_type];
          const word = { gt_field: 'greater than', gte_field: 'at least', lt_field: 'less than', lte_field: 'at most' }[v.validation_type];
          return ok || v.error_message || `Must be ${word} ${other}`;
        });
        break;
      }
      case 'requires_field': {
        const other = v.value;
        extra.push((val, all) => {
          if (val === '' || val == null) return true;
          const o = all?.[other];
          return (o !== '' && o != null) || v.error_message || `${other} is required when ${field.label} is set`;
        });
        break;
      }
      case 'unique':
        // Server-side only (needs the database); the API reports it inline.
        break;
      case 'custom':
        rules.validate = (value) => {
          try {
            // Admin-defined custom validator. Dangerous browser globals are shadowed
            // to reduce XSS attack surface (CWE-94). Only trusted admins may set these.
            // eslint-disable-next-line no-new-func
            const fn = new Function(
              'value',
              'window', 'document', 'fetch', 'XMLHttpRequest',
              'localStorage', 'sessionStorage', 'indexedDB', 'navigator', 'location',
              `'use strict';\nreturn (${v.value})`,
            );
            return fn(value,
              undefined, undefined, undefined, undefined,
              undefined, undefined, undefined, undefined, undefined,
            ) === true || v.error_message;
          } catch {
            return v.error_message || 'Validation failed';
          }
        };
        break;
    }
  }

  // ── Auto-sanitization validators based on field_type ──
  // These enforce strict input correctness so wrong values are actively discouraged.
  const ft = field.field_type;

  // Preserve any existing custom validator function by wrapping it into an object
  if (typeof rules.validate === 'function') {
    const existingFn = rules.validate;
    rules.validate = { _custom: existingFn };
  }
  if (!rules.validate) rules.validate = {};
  const v = rules.validate;
  extra.forEach((fn, i) => { v[`rule${i}`] = fn; });

  // Strip leading/trailing whitespace for text fields
  if (['text', 'textarea', 'email', 'phone', 'url'].includes(ft)) {
    v.noLeadingTrailingSpaces = (val) => {
      if (!val || typeof val !== 'string') return true;
      return val === val.trim() || 'Remove leading or trailing spaces';
    };
  }

  // Email: strict RFC-like pattern
  if (ft === 'email' && !rules.pattern) {
    rules.pattern = { value: /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/, message: 'Enter a valid email address (e.g. name@example.com)' };
  }

  // Phone: digits, spaces, dashes, parens, plus sign, 7-20 chars
  if (ft === 'phone' && !rules.pattern) {
    rules.pattern = { value: /^[+]?[\d\s\-()]{7,20}$/, message: 'Enter a valid phone number (7-20 digits)' };
  }

  // URL: must start with http(s)
  if (ft === 'url' && !rules.pattern) {
    rules.pattern = { value: /^https?:\/\/.+/, message: 'URL must start with http:// or https://' };
  }

  // Number/currency/percentage: must be a valid number
  if (['number', 'currency', 'percentage'].includes(ft)) {
    v.isNumber = (val) => {
      if (val === '' || val === null || val === undefined) return true;
      return !isNaN(Number(val)) || 'Enter a valid number';
    };
  }

  // Currency: no negative unless explicitly allowed
  if (ft === 'currency') {
    v.nonNegative = (val) => {
      if (val === '' || val === null || val === undefined) return true;
      return Number(val) >= 0 || 'Amount cannot be negative';
    };
  }

  // Percentage: 0-100 range
  if (ft === 'percentage') {
    v.percentRange = (val) => {
      if (val === '' || val === null || val === undefined) return true;
      const n = Number(val);
      return (n >= 0 && n <= 100) || 'Percentage must be between 0 and 100';
    };
  }

  // Date: must not be in the far future (100 years) for reasonable inputs
  if (ft === 'date' || ft === 'datetime') {
    v.reasonableDate = (val) => {
      if (!val) return true;
      const d = new Date(val);
      if (isNaN(d.getTime())) return 'Enter a valid date';
      const farFuture = new Date();
      farFuture.setFullYear(farFuture.getFullYear() + 100);
      const farPast = new Date('1900-01-01');
      if (d > farFuture) return 'Date is too far in the future';
      if (d < farPast) return 'Date is too far in the past';
      return true;
    };
  }

  // SSN pattern (if field name suggests it)
  if (field.name?.includes('ssn') || field.name?.includes('social_security')) {
    v.ssnFormat = (val) => {
      if (!val) return true;
      return /^\d{3}-?\d{2}-?\d{4}$/.test(val) || 'Enter a valid SSN (XXX-XX-XXXX)';
    };
  }

  // Prevent script injection in all text fields
  if (['text', 'textarea', 'rich_text'].includes(ft)) {
    v.noScriptInjection = (val) => {
      if (!val || typeof val !== 'string') return true;
      const dangerous = /<script|javascript:|on\w+\s*=/i;
      return !dangerous.test(val) || 'Input contains disallowed characters';
    };
  }

  if (Object.keys(v).length > 0) rules.validate = v;

  return rules;
}

/**
 * Evaluate a field dependency condition against current form values.
 * Returns true if the condition is met.
 */
function evaluateCondition(dep, formValues) {
  const sourceFieldName = dep.source_field?.name;
  if (!sourceFieldName) return false;

  const sourceValue = formValues[sourceFieldName];

  switch (dep.condition_type) {
    case 'equals':       return String(sourceValue) === String(dep.condition_value);
    case 'not_equals':   return String(sourceValue) !== String(dep.condition_value);
    case 'contains':     return String(sourceValue || '').includes(dep.condition_value || '');
    case 'not_contains': return !String(sourceValue || '').includes(dep.condition_value || '');
    case 'gt':           return Number(sourceValue) > Number(dep.condition_value);
    case 'lt':           return Number(sourceValue) < Number(dep.condition_value);
    case 'gte':          return Number(sourceValue) >= Number(dep.condition_value);
    case 'lte':          return Number(sourceValue) <= Number(dep.condition_value);
    case 'in': {
      const allowed = (dep.condition_value || '').split(',').map((s) => s.trim());
      return allowed.includes(String(sourceValue));
    }
    case 'not_in': {
      const excluded = (dep.condition_value || '').split(',').map((s) => s.trim());
      return !excluded.includes(String(sourceValue));
    }
    case 'is_empty':     return sourceValue === null || sourceValue === undefined || sourceValue === '';
    case 'is_not_empty': return sourceValue !== null && sourceValue !== undefined && sourceValue !== '';
    default:             return false;
  }
}

/**
 * Given all dependencies and current form values, return a map of
 * { fieldName: { visible, disabled, required } }
 */
export function computeFieldStates(dependencies, formValues, allFields) {
  const states = {};

  // Initialize all fields as visible/enabled/not-forced-required
  for (const field of allFields) {
    states[field.name] = { visible: true, disabled: false, required: field.is_required };
  }

  for (const dep of dependencies) {
    const targetName = dep.target_field?.name;
    if (!targetName) continue;
    if (!states[targetName]) states[targetName] = { visible: true, disabled: false, required: false };

    const condMet = evaluateCondition(dep, formValues);
    if (!condMet) continue;

    switch (dep.action_type) {
      case 'show':      states[targetName].visible  = true;  break;
      case 'hide':      states[targetName].visible  = false; break;
      case 'enable':    states[targetName].disabled = false; break;
      case 'disable':   states[targetName].disabled = true;  break;
      case 'require':   states[targetName].required = true;  break;
      case 'unrequire': states[targetName].required = false; break;
    }
  }

  return states;
}

/**
 * Format a number as currency.
 *
 * `currency` and `locale` default to the tenant's active choice
 * (BUILDER > Settings > Localization) rather than to USD/en-US; pass them
 * explicitly only to render an amount in a currency other than the tenant's.
 */
export function formatCurrency(value, currency, locale) {
  if (value === null || value === undefined || value === '') return '';
  const active = currencyOptions();
  return currencyFormat(value, {
    ...active,
    ...(currency ? { code: currency } : {}),
    ...(locale ? { locale } : {}),
    fallback: '',
  });
}

/** Truncate text */
export function truncate(str, max = 60) {
  if (!str) return '';
  return str.length > max ? str.slice(0, max) + '…' : str;
}

/** Capitalize first letter */
export function capitalize(str) {
  if (!str) return '';
  return str[0].toUpperCase() + str.slice(1);
}

/** Debounce a function */
export function debounce(fn, delay = 300) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), delay);
  };
}

/** Generate a unique ID */
export function uid() {
  return Math.random().toString(36).slice(2, 10);
}
