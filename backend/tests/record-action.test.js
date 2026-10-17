'use strict';

const { actionAvailable, actionInputs, pickInputs } = require('../src/utils/record-action');

describe('record actions — show_when and inputs', () => {
  test('no rule: always available', () => {
    expect(actionAvailable({}, { status: 'x' })).toBe(true);
    expect(actionAvailable(null, null)).toBe(true);
  });

  test('eq / neq / in / nin', () => {
    const eq = { show_when: { field: 'status', op: 'eq', value: 'open' } };
    expect(actionAvailable(eq, { status: 'open' })).toBe(true);
    expect(actionAvailable(eq, { status: 'accepted' })).toBe(false);
    expect(actionAvailable(eq, {})).toBe(false);
    expect(actionAvailable({ show_when: { field: 'status', op: 'neq', value: 'open' } }, { status: 'open' })).toBe(false);
    expect(actionAvailable({ show_when: { field: 's', op: 'in', value: 'a, b' } }, { s: 'b' })).toBe(true);
    expect(actionAvailable({ show_when: { field: 's', op: 'nin', value: ['a', 'b'] } }, { s: 'b' })).toBe(false);
  });

  test('an unknown operator fails closed', () => {
    expect(actionAvailable({ show_when: { field: 's', op: 'like', value: 'a' } }, { s: 'a' })).toBe(false);
  });

  test('inputs: required by default, undeclared keys ignored', () => {
    const tc = { inputs: [{ field: 'dismiss_reason', label: 'Why?' }, { field: 'note', required: false }, { label: 'no field' }] };
    expect(actionInputs(tc).map((i) => i.field)).toEqual(['dismiss_reason', 'note']);
    expect(pickInputs(tc, {})).toEqual({ values: {}, missing: ['Why?'] });
    expect(pickInputs(tc, { dismiss_reason: '  ', status: 'won' }).missing).toEqual(['Why?']);
    expect(pickInputs(tc, { dismiss_reason: ' Not now ', status: 'won' })).toEqual({ values: { dismiss_reason: 'Not now' }, missing: [] });
  });
});
