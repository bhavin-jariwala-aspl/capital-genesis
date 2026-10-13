'use strict';

/**
 * Validation engine — the single place field-level rules are evaluated.
 *
 * Every `UiField` carries `is_required`, a `field_type`, and zero or more
 * `UiValidation` rows (`validation_type`, `value`, `error_message`). Until
 * September 2026 those rows were only compiled into react-hook-form rules in
 * the browser; the API accepted whatever it was sent (ROADMAP P0 #1). This
 * module is shared by `RecordService` (create/update) and mirrored by the
 * frontend's `buildValidationRules`, so a rule an admin adds in the Form
 * Builder is enforced identically on both sides.
 *
 * Rule vocabulary (`validation_type` → `value`):
 *
 *   required          —                      value must be present
 *   min / max         — number               numeric bounds (inclusive)
 *   minLength /
 *   maxLength         — integer              string length bounds
 *   pattern           — regex source          must match (anchored as written)
 *   email / url / phone —                    format checks (also implied by field_type)
 *   integer           —                      whole number
 *   positive          —                      > 0
 *   non_negative      —                      >= 0
 *   in / not_in       — "a,b,c"              allowed / forbidden values
 *   min_date /
 *   max_date          — ISO date or "today"  date bounds (inclusive, day precision)
 *   equals_field      — other field name     must equal that field's value
 *   not_equals_field  — other field name     must differ from that field's value
 *   gt_field / gte_field /
 *   lt_field / lte_field — other field name  numeric/date comparison to another field
 *   requires_field    — other field name     if this has a value, that one must too
 *   unique            —                      no other live record has this value (RecordService)
 *   expression        — formula              must evaluate true (RecordService, formula engine)
 *   custom            — retired browser JS   inert; never executed anywhere
 *
 * A rule whose `value` cannot be parsed (bad regex, non-numeric bound) is
 * reported as a configuration problem rather than silently passing or failing
 * every record, so a typo in the builder is caught the first time it is used.
 */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const URL_RE   = /^https?:\/\/.+/i;
const PHONE_RE = /^[+]?[\d\s\-()]{7,20}$/;

const isBlank = (v) =>
  v === undefined || v === null || v === '' ||
  (Array.isArray(v) && v.length === 0) ||
  (typeof v === 'string' && v.trim() === '');

const toNumber = (v) => {
  if (v === '' || v === null || v === undefined || typeof v === 'boolean') return NaN;
  const n = typeof v === 'number' ? v : Number(String(v).replace(/,/g, ''));
  return Number.isFinite(n) ? n : NaN;
};

const toDate = (v) => {
  if (v === 'today') { const d = new Date(); d.setHours(0, 0, 0, 0); return d; }
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v;
  if (isBlank(v)) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
};

const dayOf = (d) => Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());

const splitList = (v) => (Array.isArray(v) ? v : String(v ?? '').split(','))
  .map((s) => String(s).trim()).filter((s) => s !== '');

/** Field types whose value is a number. */
const NUMERIC_TYPES = new Set(['number', 'integer', 'decimal', 'currency', 'percentage', 'percent', 'rating']);
/** Field types whose value is a date. */
const DATE_TYPES = new Set(['date', 'datetime']);
/** Types that hold no data and are never validated. */
const DISPLAY_TYPES = new Set(['heading', 'divider', 'status_tracker']);

/** Rules that compare against another field. */
const CROSS_FIELD_RULES = new Set([
  'equals_field', 'not_equals_field', 'gt_field', 'gte_field', 'lt_field', 'lte_field', 'requires_field',
]);

/** Every rule the engine knows. Exposed for the builder and for docs. */
const RULE_TYPES = [
  'required', 'min', 'max', 'minLength', 'maxLength', 'pattern',
  'email', 'url', 'phone', 'integer', 'positive', 'non_negative',
  'in', 'not_in', 'min_date', 'max_date',
  ...CROSS_FIELD_RULES, 'unique', 'expression',
];

/**
 * Evaluate one rule against a value.
 *
 * @returns {{ ok: true } | { ok: false, message: string } | { ok: false, config: string }}
 *   `config` marks a mis-configured rule (bad regex, non-numeric bound…).
 */
function evaluateRule(rule, value, allValues = {}, field = {}) {
  const type = rule.validation_type;
  const raw  = rule.value;
  const fail = (fallback) => ({ ok: false, message: rule.error_message || fallback });
  const misconfigured = (why) => ({ ok: false, config: `${field.label || field.name || 'Field'}: ${type} rule ${why}` });

  if (type === 'required') return isBlank(value) ? fail(`${field.label || 'This field'} is required`) : { ok: true };
  // `expression` is async (formula language, may read other records), so
  // RecordService evaluates it after this pass. `custom` is the retired
  // browser-JS rule: it is inert everywhere, so legacy rows never block a save.
  if (type === 'expression' || type === 'custom') return { ok: true };
  if (type === 'unique') return { ok: true };  // needs the database — RecordService handles it

  // Every other rule is skipped for blank values; `required` decides presence.
  if (isBlank(value)) {
    if (type === 'requires_field') return { ok: true };
    return { ok: true };
  }

  switch (type) {
    case 'min': case 'max': {
      const bound = toNumber(raw);
      if (Number.isNaN(bound)) return misconfigured('needs a numeric value');
      const n = toNumber(value);
      if (Number.isNaN(n)) return fail('Enter a valid number');
      if (type === 'min' && n < bound) return fail(`Must be at least ${bound}`);
      if (type === 'max' && n > bound) return fail(`Must be at most ${bound}`);
      return { ok: true };
    }
    case 'minLength': case 'maxLength': {
      const bound = parseInt(raw, 10);
      if (!Number.isInteger(bound) || bound < 0) return misconfigured('needs a whole-number length');
      const len = Array.isArray(value) ? value.length : String(value).length;
      if (type === 'minLength' && len < bound) return fail(`Must be at least ${bound} characters`);
      if (type === 'maxLength' && len > bound) return fail(`Must be at most ${bound} characters`);
      return { ok: true };
    }
    case 'pattern': {
      let re;
      try { re = new RegExp(String(raw ?? '')); } catch { return misconfigured('has an invalid regular expression'); }
      return re.test(String(value)) ? { ok: true } : fail('Value does not match the required format');
    }
    case 'email': return EMAIL_RE.test(String(value).trim()) ? { ok: true } : fail('Enter a valid email address');
    case 'url':   return URL_RE.test(String(value).trim())   ? { ok: true } : fail('URL must start with http:// or https://');
    case 'phone': return PHONE_RE.test(String(value).trim()) ? { ok: true } : fail('Enter a valid phone number');
    case 'integer': {
      const n = toNumber(value);
      return Number.isInteger(n) ? { ok: true } : fail('Must be a whole number');
    }
    case 'positive': {
      const n = toNumber(value);
      return !Number.isNaN(n) && n > 0 ? { ok: true } : fail('Must be greater than zero');
    }
    case 'non_negative': {
      const n = toNumber(value);
      return !Number.isNaN(n) && n >= 0 ? { ok: true } : fail('Cannot be negative');
    }
    case 'in': case 'not_in': {
      const list = splitList(raw);
      if (!list.length) return misconfigured('needs a comma-separated list of values');
      const values = Array.isArray(value) ? value.map(String) : [String(value)];
      const inside = values.every((v) => list.includes(v));
      if (type === 'in' && !inside) return fail(`Must be one of: ${list.join(', ')}`);
      if (type === 'not_in' && values.some((v) => list.includes(v))) return fail(`Cannot be one of: ${list.join(', ')}`);
      return { ok: true };
    }
    case 'min_date': case 'max_date': {
      const bound = toDate(raw);
      if (!bound) return misconfigured('needs an ISO date or "today"');
      const d = toDate(value);
      if (!d) return fail('Enter a valid date');
      if (type === 'min_date' && dayOf(d) < dayOf(bound)) return fail(`Date cannot be before ${raw === 'today' ? 'today' : bound.toISOString().slice(0, 10)}`);
      if (type === 'max_date' && dayOf(d) > dayOf(bound)) return fail(`Date cannot be after ${raw === 'today' ? 'today' : bound.toISOString().slice(0, 10)}`);
      return { ok: true };
    }
    case 'equals_field': case 'not_equals_field': {
      if (!raw) return misconfigured('needs the name of another field');
      const other = allValues[raw];
      const same = String(value ?? '') === String(other ?? '');
      if (type === 'equals_field' && !same) return fail(`Must match ${raw}`);
      if (type === 'not_equals_field' && same) return fail(`Must differ from ${raw}`);
      return { ok: true };
    }
    case 'gt_field': case 'gte_field': case 'lt_field': case 'lte_field': {
      if (!raw) return misconfigured('needs the name of another field');
      const other = allValues[raw];
      if (isBlank(other)) return { ok: true }; // nothing to compare against yet
      const [a, b] = DATE_TYPES.has(field.field_type)
        ? [toDate(value)?.getTime(), toDate(other)?.getTime()]
        : [toNumber(value), toNumber(other)];
      if (a === undefined || b === undefined || Number.isNaN(a) || Number.isNaN(b)) return fail(`Cannot compare with ${raw}`);
      const cmp = { gt_field: a > b, gte_field: a >= b, lt_field: a < b, lte_field: a <= b }[type];
      const word = { gt_field: 'greater than', gte_field: 'at least', lt_field: 'less than', lte_field: 'at most' }[type];
      return cmp ? { ok: true } : fail(`Must be ${word} ${raw}`);
    }
    case 'requires_field': {
      if (!raw) return misconfigured('needs the name of another field');
      return isBlank(allValues[raw]) ? fail(`${raw} is required when ${field.label || field.name} is set`) : { ok: true };
    }
    default:
      return misconfigured('is not a known validation type');
  }
}

/**
 * Format checks implied by the field type itself, applied even when the admin
 * added no explicit rule. Mirrors the browser's auto-validators so the server
 * never accepts what the form would have refused.
 */
function implicitRules(field) {
  const ft = field.field_type;
  const rules = [];
  if (ft === 'email') rules.push({ validation_type: 'email' });
  if (ft === 'url')   rules.push({ validation_type: 'url' });
  if (ft === 'phone') rules.push({ validation_type: 'phone' });
  if (ft === 'percentage' || ft === 'percent') {
    rules.push({ validation_type: 'min', value: '0', error_message: 'Percentage must be between 0 and 100' });
    rules.push({ validation_type: 'max', value: '100', error_message: 'Percentage must be between 0 and 100' });
  }
  if (ft === 'currency' && field.config?.allow_negative !== true) {
    rules.push({ validation_type: 'non_negative', error_message: 'Amount cannot be negative' });
  }
  if (ft === 'integer') rules.push({ validation_type: 'integer' });
  if (ft === 'rating') {
    rules.push({ validation_type: 'min', value: '0' });
    rules.push({ validation_type: 'max', value: String(field.config?.max ?? 5), error_message: `Rating must be at most ${field.config?.max ?? 5}` });
  }
  if (NUMERIC_TYPES.has(ft)) rules.unshift({ validation_type: '__numeric' });
  if (DATE_TYPES.has(ft))    rules.unshift({ validation_type: '__date' });
  if (['select', 'radio'].includes(ft) && Array.isArray(field.options) && field.options.length && field.config?.allow_other !== true) {
    const allowed = field.options.map((o) => (typeof o === 'string' ? o : o.value)).filter((v) => v !== undefined && v !== null);
    if (allowed.length) rules.push({ validation_type: 'in', value: allowed, error_message: 'Choose one of the listed options' });
  }
  if (ft === 'multi_select' && Array.isArray(field.options) && field.options.length && field.config?.allow_other !== true) {
    const allowed = field.options.map((o) => (typeof o === 'string' ? o : o.value)).filter((v) => v !== undefined && v !== null);
    if (allowed.length) rules.push({ validation_type: 'in', value: allowed, error_message: 'Choose only listed options' });
  }
  return rules;
}

/** Type coercion checks that precede every other rule. */
function typeCheck(kind, value, field) {
  if (isBlank(value)) return { ok: true };
  if (kind === '__numeric') {
    return Number.isNaN(toNumber(value)) ? { ok: false, message: `${field.label || 'Value'} must be a number` } : { ok: true };
  }
  if (kind === '__date') {
    return toDate(value) ? { ok: true } : { ok: false, message: `${field.label || 'Value'} must be a valid date` };
  }
  return { ok: true };
}

/**
 * Validate a map of submitted values against an object's fields.
 *
 * @param {Array<object>} fields  UiField rows (with `validations` included)
 * @param {Record<string, unknown>} values  submitted field map (field name → value)
 * @param {{ partial?: boolean }} [opts]  partial=true (update): only fields present in
 *   `values` are checked, and `required` applies only to keys that were sent.
 * @returns {{ errors: Array<{ field: string, message: string }>, warnings: string[] }}
 */
function validateValues(fields, values = {}, { partial = false } = {}) {
  const errors = [];
  const warnings = [];
  const seen = new Set();

  for (const field of fields) {
    if (!field || field.is_active === false || DISPLAY_TYPES.has(field.field_type)) continue;
    const name = field.name;
    const present = Object.prototype.hasOwnProperty.call(values, name);
    if (partial && !present) continue;
    const value = values[name];

    const push = (message) => {
      if (seen.has(`${name}:${message}`)) return;
      seen.add(`${name}:${message}`);
      errors.push({ field: name, message });
    };

    // 1. Presence — is_required, or an explicit `required` rule.
    const requiredRule = (field.validations ?? []).find((r) => r.validation_type === 'required');
    if ((field.is_required || requiredRule) && isBlank(value)) {
      push(requiredRule?.error_message || `${field.label || name} is required`);
      continue; // nothing else to check on a blank required value
    }
    if (isBlank(value)) continue;

    // 2. Type coercion and format implied by field_type.
    let typeFailed = false;
    for (const rule of implicitRules(field)) {
      const res = rule.validation_type.startsWith('__')
        ? typeCheck(rule.validation_type, value, field)
        : evaluateRule(rule, value, values, field);
      if (!res.ok) {
        if (res.message) { push(res.message); typeFailed = rule.validation_type.startsWith('__'); }
        if (typeFailed) break;
      }
    }
    if (typeFailed) continue;

    // 3. Admin-authored rules, in order.
    for (const rule of (field.validations ?? []).slice().sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0))) {
      if (rule.validation_type === 'required') continue;
      const res = evaluateRule(rule, value, values, field);
      if (res.ok) continue;
      if (res.config) { warnings.push(res.config); continue; }
      push(res.message);
    }
  }

  return { errors, warnings };
}

module.exports = {
  validateValues,
  evaluateRule,
  implicitRules,
  RULE_TYPES,
  CROSS_FIELD_RULES,
  isBlank,
  toNumber,
  toDate,
};
