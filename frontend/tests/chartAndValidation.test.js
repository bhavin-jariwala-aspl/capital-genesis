import { describe, it, expect } from 'vitest';
import { applySeriesTransforms, makeValueFormatter, resolveChartAppearance, appearanceCapabilities } from '../src/utils/chart';
import { buildValidationRules } from '../src/utils/helpers';

describe('chart transforms', () => {
  const rows = [
    { name: 'A', value: 5, other: 1 }, { name: 'B', value: 20, other: 2 },
    { name: 'C', value: 10, other: 3 }, { name: 'D', value: 1, other: 4 },
  ];

  it('sorts by the first series', () => {
    expect(applySeriesTransforms(rows, { sort: 'desc' }).map((r) => r.name)).toEqual(['B', 'C', 'A', 'D']);
    expect(applySeriesTransforms(rows, { sort: 'asc' }).map((r) => r.name)).toEqual(['D', 'A', 'C', 'B']);
  });

  it('keeps the top N and folds the remainder into one Other row per series', () => {
    const out = applySeriesTransforms(rows, { topN: 2 }, 'name', ['value', 'other']);
    expect(out.map((r) => r.name)).toEqual(['B', 'C', 'Other (2)']);
    expect(out[2]).toMatchObject({ value: 6, other: 5, __other: true });
    expect(applySeriesTransforms(rows, { topN: 10 })).toHaveLength(4);
  });

  it('formats numbers, compact, currency and whole percentages', () => {
    expect(makeValueFormatter({ format: 'number', decimals: 1 }, 'en-US')(1234.56)).toBe('1,234.6');
    expect(makeValueFormatter({ format: 'compact' }, 'en-US')(1500000)).toBe('1.5M');
    expect(makeValueFormatter({ format: 'currency', currency: 'EUR', decimals: 0 }, 'en-US')(99)).toBe('€99');
    expect(makeValueFormatter({ format: 'currency_compact', currency: 'USD' }, 'en-US')(2750000)).toBe('$2.8M');
    expect(makeValueFormatter({ format: 'percent', decimals: 0 }, 'en-US')(42)).toBe('42%');
    expect(makeValueFormatter({}, 'en-US')('n/a')).toBe('n/a');
    expect(makeValueFormatter({}, 'en-US')(null)).toBe('');
  });

  it('resolves and clamps appearance config', () => {
    const a = resolveChartAppearance({ appearance: { decimals: 9, topN: '3', goal: '80', colors: ['#ff0000', 'red'] } });
    expect(a).toMatchObject({ decimals: 4, topN: 3, goal: 80, colors: ['#ff0000'], legend: 'auto' });
    expect(resolveChartAppearance({}).goal).toBeNull();
  });

  it('knows which controls apply per chart type', () => {
    expect(appearanceCapabilities('pie')).toMatchObject({ axes: false, goal: false, sortTopN: true, dataLabels: true });
    expect(appearanceCapabilities('line')).toMatchObject({ axes: true, goal: true, smooth: true, stacked: false });
  });
});

describe('buildValidationRules mirrors the server vocabulary', () => {
  const field = (over) => ({ name: 'x', label: 'X', field_type: 'number', validations: [], ...over });
  const run = (rules, value, all = {}) => {
    for (const fn of Object.values(rules.validate ?? {})) {
      const r = fn(value, all);
      if (r !== true) return r;
    }
    return true;
  };

  it('compares against another field', () => {
    const rules = buildValidationRules(field({ validations: [{ validation_type: 'gte_field', value: 'floor', error_message: 'Below floor' }] }));
    expect(run(rules, 5, { floor: 10 })).toBe('Below floor');
    expect(run(rules, 10, { floor: 10 })).toBe(true);
    expect(run(rules, 5, { floor: '' })).toBe(true);
  });

  it('enforces lists, dates and formats', () => {
    const inRules = buildValidationRules(field({ field_type: 'text', validations: [{ validation_type: 'in', value: 'a, b' }] }));
    expect(run(inRules, 'c')).toMatch(/one of: a, b/);
    expect(run(inRules, 'b')).toBe(true);

    const dateRules = buildValidationRules(field({ field_type: 'date', validations: [{ validation_type: 'min_date', value: 'today' }] }));
    expect(run(dateRules, '2000-01-01')).toMatch(/before today/);
    expect(run(dateRules, '2050-01-01')).toBe(true);

    const emailRules = buildValidationRules(field({ field_type: 'text', validations: [{ validation_type: 'email' }] }));
    expect(emailRules.pattern.value.test('a@b.co')).toBe(true);
    expect(emailRules.pattern.value.test('nope')).toBe(false);
  });

  it('requires a sibling when set, and treats unique as server-side', () => {
    const rules = buildValidationRules(field({ field_type: 'text', validations: [{ validation_type: 'requires_field', value: 'y' }, { validation_type: 'unique' }] }));
    expect(run(rules, 'set', { y: '' })).toMatch(/y is required/);
    expect(run(rules, 'set', { y: 'ok' })).toBe(true);
    expect(run(rules, '', { y: '' })).toBe(true);
  });
});
