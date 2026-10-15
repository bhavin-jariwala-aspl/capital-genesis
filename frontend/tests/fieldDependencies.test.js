import { describe, it, expect } from 'vitest';
import { computeFieldStates } from '../src/utils/helpers';

const fields = [{ name: 'repayment_type' }, { name: 'moratorium_months' }, { name: 'notes' }];
const dep = (action_type, value = 'moratorium') => ({
  source_field: { name: 'repayment_type' }, target_field: { name: 'moratorium_months' },
  condition_type: 'equals', condition_value: value, action_type,
});

describe('computeFieldStates', () => {
  it('keeps a "show" target hidden until its condition is met', () => {
    expect(computeFieldStates([dep('show')], { repayment_type: 'amortising' }, fields).moratorium_months.visible).toBe(false);
    expect(computeFieldStates([dep('show')], {}, fields).moratorium_months.visible).toBe(false);
    expect(computeFieldStates([dep('show')], { repayment_type: 'moratorium' }, fields).moratorium_months.visible).toBe(true);
    expect(computeFieldStates([dep('show')], {}, fields).notes.visible).toBe(true);
  });

  it('keeps an "enable" target read-only until its condition is met', () => {
    expect(computeFieldStates([dep('enable')], {}, fields).moratorium_months.disabled).toBe(true);
    expect(computeFieldStates([dep('enable')], { repayment_type: 'moratorium' }, fields).moratorium_months.disabled).toBe(false);
  });

  it('"hide" only hides when its condition is met', () => {
    expect(computeFieldStates([dep('hide')], {}, fields).moratorium_months.visible).toBe(true);
    expect(computeFieldStates([dep('hide')], { repayment_type: 'moratorium' }, fields).moratorium_months.visible).toBe(false);
  });
});
