'use strict';

/**
 * Typed EAV serialisation: a blank number input is "no value", never zero
 * (an unanswered CSAT rating must not be stored as a score of 0).
 */

const { toTypedValue, fromTypedRow } = require('../src/services/crm-storage-map');

describe('toTypedValue — numbers', () => {
  it('stores a real number in num_value', () => {
    expect(toTypedValue('4', 'number')).toEqual({ str_value: '4', num_value: 4 });
    expect(toTypedValue(0, 'number')).toEqual({ str_value: '0', num_value: 0 });
    expect(toTypedValue('0', 'number')).toEqual({ str_value: '0', num_value: 0 });
  });

  it('stores a blank input as no number', () => {
    expect(toTypedValue('', 'number')).toEqual({ str_value: '', num_value: null });
    expect(toTypedValue('  ', 'number').num_value).toBeNull();
    expect(fromTypedRow(toTypedValue('', 'number'))).toBe('');
  });

  it('keeps non-numeric text out of num_value', () => {
    expect(toTypedValue('abc', 'number').num_value).toBeNull();
  });
});

describe('toTypedValue — clearing a value', () => {
  it('clears every typed column so the old lookup id / date / flag is not read back', () => {
    const cleared = toTypedValue(null, 'number');
    expect(cleared).toEqual({ str_value: null, num_value: null, bool_value: null, date_value: null });
    // An existing row { num_value: 5413 } updated with `cleared` reads back as empty.
    expect(fromTypedRow({ str_value: '5413', num_value: 5413, ...cleared })).toBeNull();
    expect(fromTypedRow({ date_value: new Date(), ...toTypedValue(undefined, 'date') })).toBeNull();
  });
});
