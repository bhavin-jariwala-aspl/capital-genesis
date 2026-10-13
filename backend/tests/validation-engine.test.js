'use strict';

/**
 * Validation engine — the shared rule evaluator RecordService enforces on
 * every create/update (and the browser mirrors in buildValidationRules).
 */

const { validateValues, evaluateRule, RULE_TYPES } = require('../src/services/validation-engine');

const field = (over = {}) => ({ name: 'amount', label: 'Amount', field_type: 'number', is_required: false, is_active: true, validations: [], ...over });
const rule = (validation_type, value, error_message) => ({ validation_type, value, error_message });

describe('validateValues — presence', () => {
  it('enforces is_required and an explicit required rule (custom message wins)', () => {
    const fields = [
      field({ name: 'a', label: 'A', is_required: true }),
      field({ name: 'b', label: 'B', validations: [rule('required', null, 'B is mandatory')] }),
    ];
    const { errors } = validateValues(fields, { a: '', b: '   ' });
    expect(errors).toEqual([
      { field: 'a', message: 'A is required' },
      { field: 'b', message: 'B is mandatory' },
    ]);
  });

  it('treats empty arrays as blank and ignores display-only fields', () => {
    const fields = [
      field({ name: 'tags', field_type: 'multi_select', is_required: true, options: ['x'] }),
      field({ name: 'h', field_type: 'heading', is_required: true }),
    ];
    expect(validateValues(fields, { tags: [] }).errors).toHaveLength(1);
  });

  it('partial mode checks only the keys that were sent', () => {
    const fields = [field({ name: 'a', is_required: true }), field({ name: 'b', is_required: true })];
    expect(validateValues(fields, { b: 5 }, { partial: true }).errors).toEqual([]);
    expect(validateValues(fields, { a: '' }, { partial: true }).errors).toHaveLength(1);
  });
});

describe('validateValues — implied by field type', () => {
  it('rejects a non-number in a numeric field and stops there', () => {
    const { errors } = validateValues([field({ validations: [rule('min', '10')] })], { amount: 'abc' });
    expect(errors).toEqual([{ field: 'amount', message: 'Amount must be a number' }]);
  });

  it('checks email, url, phone, percentage, currency sign and select options', () => {
    const fields = [
      field({ name: 'e', field_type: 'email' }),
      field({ name: 'u', field_type: 'url' }),
      field({ name: 'p', field_type: 'phone' }),
      field({ name: 'pct', field_type: 'percentage' }),
      field({ name: 'cur', field_type: 'currency' }),
      field({ name: 'sel', field_type: 'select', options: [{ value: 'a', label: 'A' }, { value: 'b', label: 'B' }] }),
    ];
    const { errors } = validateValues(fields, { e: 'nope', u: 'ftp://x', p: '12', pct: 140, cur: -5, sel: 'z' });
    expect(errors.map((e) => e.field).sort()).toEqual(['cur', 'e', 'p', 'pct', 'sel', 'u']);
    expect(validateValues(fields, { e: 'a@b.co', u: 'https://x.y', p: '+1 555 000 0000', pct: 50, cur: 0, sel: 'b' }).errors).toEqual([]);
  });

  it('lets a currency go negative when the field allows it', () => {
    const f = field({ name: 'cur', field_type: 'currency', config: { allow_negative: true } });
    expect(validateValues([f], { cur: -5 }).errors).toEqual([]);
  });

  it('accepts a date and rejects garbage', () => {
    const f = field({ name: 'd', field_type: 'date' });
    expect(validateValues([f], { d: '2026-01-01' }).errors).toEqual([]);
    expect(validateValues([f], { d: 'not a date' }).errors[0].message).toMatch(/valid date/);
  });
});

describe('evaluateRule — admin rules', () => {
  const f = field();
  const ok = (r, v, all) => expect(evaluateRule(r, v, all, f)).toEqual({ ok: true });
  const bad = (r, v, all, re) => {
    const res = evaluateRule(r, v, all, f);
    expect(res.ok).toBe(false);
    if (re) expect(res.message).toMatch(re);
  };

  it('min/max and minLength/maxLength', () => {
    ok(rule('min', '10'), 10); bad(rule('min', '10'), 9, {}, /at least 10/);
    ok(rule('max', '10'), 10); bad(rule('max', '10'), 11, {}, /at most 10/);
    ok(rule('minLength', '3'), 'abc'); bad(rule('minLength', '3'), 'ab', {}, /3 characters/);
    ok(rule('maxLength', '3'), 'abc'); bad(rule('maxLength', '3'), 'abcd');
  });

  it('pattern, integer, positive, non_negative', () => {
    ok(rule('pattern', '^[A-Z]{3}$'), 'ABC'); bad(rule('pattern', '^[A-Z]{3}$'), 'abc');
    ok(rule('integer'), '42'); bad(rule('integer'), 4.2, {}, /whole number/);
    ok(rule('positive'), 1); bad(rule('positive'), 0);
    ok(rule('non_negative'), 0); bad(rule('non_negative'), -1);
  });

  it('in / not_in accept a comma list and arrays', () => {
    ok(rule('in', 'a, b'), 'b'); bad(rule('in', 'a,b'), 'c', {}, /one of: a, b/);
    ok(rule('not_in', 'x'), 'y'); bad(rule('not_in', 'x,y'), ['y']);
  });

  it('min_date / max_date understand "today"', () => {
    const past = '2000-01-01', future = '2999-01-01';
    ok(rule('min_date', 'today'), future); bad(rule('min_date', 'today'), past, {}, /before today/);
    ok(rule('max_date', 'today'), past);   bad(rule('max_date', 'today'), future, {}, /after today/);
  });

  it('cross-field rules read the sibling value', () => {
    ok(rule('equals_field', 'other'), 'x', { other: 'x' });
    bad(rule('equals_field', 'other'), 'x', { other: 'y' }, /match other/);
    ok(rule('not_equals_field', 'other'), 'x', { other: 'y' });
    ok(rule('gte_field', 'floor'), 10, { floor: 10 });
    bad(rule('lt_field', 'cap'), 10, { cap: 5 }, /less than cap/);
    ok(rule('gt_field', 'cap'), 10, { cap: '' }); // nothing to compare yet
    bad(rule('requires_field', 'other'), 'x', { other: '' }, /other is required/);
  });

  it('compares dates on date fields', () => {
    const df = field({ field_type: 'date' });
    expect(evaluateRule(rule('gt_field', 'start'), '2026-02-01', { start: '2026-01-01' }, df)).toEqual({ ok: true });
    expect(evaluateRule(rule('gt_field', 'start'), '2026-01-01', { start: '2026-02-01' }, df).ok).toBe(false);
  });

  it('never executes custom JS and defers unique to the service', () => {
    ok(rule('custom', 'value === 1'), 2);
    ok(rule('unique'), 'anything');
  });

  it('reports a mis-configured rule as config, not as a user error', () => {
    expect(evaluateRule(rule('pattern', '('), 'x', {}, f)).toMatchObject({ ok: false, config: expect.stringContaining('invalid regular expression') });
    expect(evaluateRule(rule('min', 'ten'), 5, {}, f)).toMatchObject({ ok: false, config: expect.stringContaining('numeric') });
    expect(evaluateRule(rule('wat'), 5, {}, f)).toMatchObject({ ok: false, config: expect.stringContaining('not a known') });
  });

  it('surfaces config problems as warnings from validateValues and still applies the rest', () => {
    const fields = [field({ validations: [rule('pattern', '('), rule('max', '5', 'Too big')] })];
    const { errors, warnings } = validateValues(fields, { amount: 9 });
    expect(warnings).toHaveLength(1);
    expect(errors).toEqual([{ field: 'amount', message: 'Too big' }]);
  });

  it('exposes the full rule vocabulary', () => {
    expect(RULE_TYPES).toEqual(expect.arrayContaining(['required', 'pattern', 'min_date', 'gt_field', 'unique', 'expression']));
  });
});
