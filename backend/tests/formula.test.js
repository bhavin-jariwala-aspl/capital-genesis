'use strict';

const { evaluate, check, references } = require('../src/services/formula');

const ev = (expr, values = {}, extra = {}) => evaluate(expr, { values, ...extra });

describe('formula engine — language', () => {
  it('does arithmetic with precedence and parentheses', async () => {
    expect(await ev('1 + 2 * 3')).toBe(7);
    expect(await ev('(1 + 2) * 3')).toBe(9);
    expect(await ev('2 ^ 3 ^ 2')).toBe(512); // right-associative
    expect(await ev('-amount + 10', { amount: 4 })).toBe(6);
  });

  it('reads fields and propagates blanks instead of inventing numbers', async () => {
    expect(await ev('amount * 2', { amount: '21' })).toBe(42);
    expect(await ev('amount * 2', {})).toBeNull();
    expect(await ev('amount / 0', { amount: 5 })).toBeNull();
  });

  it('compares numbers, text and dates sensibly', async () => {
    expect(await ev('age <= 65', { age: 65 })).toBe(true);
    expect(await ev("status = 'Approved'", { status: 'approved' })).toBe(true);
    expect(await ev("status <> 'approved'", { status: 'declined' })).toBe(true);
    expect(await ev("d > '2026-01-01'", { d: '2026-05-01' })).toBe(true);
  });

  it('supports AND/OR/NOT in both spellings, short-circuiting', async () => {
    expect(await ev('a > 1 AND b < 5', { a: 2, b: 3 })).toBe(true);
    expect(await ev('a > 1 && NOT (b < 5)', { a: 2, b: 3 })).toBe(false);
    expect(await ev('a > 1 || missing_fn_never_called()', { a: 2 })).toBe(true);
  });

  it('accepts AND(…) / OR(…) in function form too', async () => {
    expect(await ev('AND(a > 1, b < 5, c)', { a: 2, b: 3, c: true })).toBe(true);
    expect(await ev('OR(a > 9, b > 9)', { a: 2, b: 3 })).toBe(false);
    expect(await ev('IF(AND(x, NOT(y)), 1, 0)', { x: true, y: false })).toBe(1);
  });

  it('only evaluates the branch IF takes', async () => {
    expect(await ev("IF(amount >= 500000, 'large', 'small')", { amount: 600000 })).toBe('large');
    expect(await ev('IF(false, NOPE(), 1)')).toBe(1);
  });

  it('rejects anything outside the language instead of executing it', async () => {
    await expect(ev('process.exit(1)')).rejects.toThrow(/Unknown function/);
    await expect(ev('constructor.constructor("return 1")()')).rejects.toThrow();
    await expect(ev('1 +')).rejects.toThrow();
    await expect(ev('a; b')).rejects.toThrow(/Unexpected character/);
  });
});

describe('formula engine — functions', () => {
  it('computes a loan instalment with PMT (EMI)', async () => {
    // 1,000,000 at 7% p.a. over 120 months ≈ 11,610.85
    expect(await ev('PMT(rate / 1200, months, amount)', { rate: 7, months: 120, amount: 1000000 })).toBeCloseTo(11610.85, 1);
    expect(await ev('PMT(0, 10, 1000)')).toBe(100);
  });

  it('computes ages and date arithmetic', async () => {
    expect(await ev("AGE('1990-06-15', '2026-06-14')")).toBe(35);
    expect(await ev("AGE('1990-06-15', '2026-06-15')")).toBe(36);
    expect(await ev("ADD_MONTHS('2026-01-31', 1)")).toMatch(/^2026-03-0[23]$|^2026-02-28$/);
    expect(await ev("YEARS_BETWEEN('2020-01-01', '2026-01-01')")).toBe(6);
    // Age at maturity: current age plus tenure in whole years.
    expect(await ev("AGE(dob, '2026-01-01') + tenure_months / 12", { dob: '1980-01-01', tenure_months: 240 })).toBe(66);
  });

  it('maps bands with CASE and membership with IN', async () => {
    expect(await ev("CASE(risk, 'high', 1, 'medium', 3, 5)", { risk: 'medium' })).toBe(3);
    expect(await ev("CASE(risk, 'high', 1, 'medium', 3, 5)", { risk: 'low' })).toBe(5);
    expect(await ev("IN(country, 'IR', 'KP', 'MM')", { country: 'kp' })).toBe(true);
  });

  it('writes a date field as YYYY-MM-DD in CONCAT and TEXT', async () => {
    const d = new Date('2026-01-01T00:00:00.000Z');
    expect(await ev("CONCAT('PLR ', rate, '% from ', effective_from)", { rate: 6.825, effective_from: d })).toBe('PLR 6.825% from 2026-01-01');
    expect(await ev('TEXT(effective_from)', { effective_from: d })).toBe('2026-01-01');
  });

  it('delegates LOOKUP / LATEST / SUM_RELATED to the context', async () => {
    const lookup = jest.fn(async ({ object, returnField }) => (object === 'plr_rate' && returnField === 'rate' ? 6.825 : 0.5));
    const related = jest.fn(async ({ agg }) => (agg === 'count' ? 3 : 1500));
    expect(await ev("LATEST('plr_rate', 'rate', 'effective_from') - 0.675", {}, { lookup })).toBeCloseTo(6.15);
    expect(await ev("LOOKUP('product', 'code', 'LND-RE', 'margin')", {}, { lookup })).toBe(0.5);
    expect(lookup).toHaveBeenCalledWith(expect.objectContaining({ object: 'product', matchField: 'code', matchValue: 'LND-RE' }));
    expect(await ev("SUM_RELATED('loan', 'party', 'amount') + COUNT_RELATED('loan', 'party')", {}, { related })).toBe(1503);
  });

  it('returns null for cross-record functions when no capability is supplied', async () => {
    expect(await ev("LOOKUP('x', 'a', 1, 'b')")).toBeNull();
  });
});

describe('formula engine — builder helpers', () => {
  it('check() reports syntax and unknown-function errors, null when valid', () => {
    expect(check('PMT(r, n, pv)')).toBeNull();
    expect(check('FOO(1)')).toMatch(/Unknown function FOO/);
    expect(check('(1 + ')).toBeTruthy();
  });

  it('references() lists the fields a formula reads', () => {
    expect(references('IF(party.age > 60, amount * rate, 0)').sort()).toEqual(['amount', 'party', 'rate']);
  });
});

describe('formula engine — date arguments are never modified', () => {
  it('ADD_YEARS / ADD_MONTHS / ADD_DAYS leave a Date field value unchanged', async () => {
    const values = { date_of_birth: new Date('1985-07-27T00:00:00.000Z') };
    expect(await ev('ADD_YEARS(date_of_birth, 42)', values)).toBe('2027-07-27');
    await ev('ADD_MONTHS(date_of_birth, 3)', values);
    await ev('ADD_DAYS(date_of_birth, 10)', values);
    expect(values.date_of_birth.toISOString()).toBe('1985-07-27T00:00:00.000Z');
    expect(await ev('AGE(date_of_birth) >= 18', values)).toBe(true);
  });
});
