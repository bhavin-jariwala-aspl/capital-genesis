import { describe, it, expect } from 'vitest';
import { recordTitle, initials } from '../src/utils/record';

describe('recordTitle', () => {
  it("uses the object's title field when it has a value", () => {
    expect(recordTitle({ lms_account_no: 'LMS-100202', name: 'other' }, 'lms_account_no')).toBe('LMS-100202');
  });
  it('falls back to the usual name fields', () => {
    expect(recordTitle({ lms_account_no: '', name: 'PLR change' }, 'lms_account_no')).toBe('PLR change');
    expect(recordTitle({ first_name: 'Anjali', last_name: 'Ramgoolam' })).toBe('Anjali Ramgoolam');
    expect(recordTitle({}, 'lms_account_no')).toBeNull();
  });
});

describe('initials', () => {
  it('uses only letters and digits of words', () => {
    expect(initials('Forex (Genesis Capital)')).toBe('FG');
    expect(initials('Priya Ramdin')).toBe('PR');
    expect(initials('— 2026 plan')).toBe('2P');
    expect(initials('((')).toBe('?');
    expect(initials('')).toBe('?');
  });
});
