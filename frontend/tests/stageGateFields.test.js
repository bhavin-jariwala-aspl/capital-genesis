import { describe, it, expect } from 'vitest';
import { gateFields, withNeededFields } from '../src/utils/record';

describe('stage gate → edit form', () => {
  it('reads the fields a refused stage move asked for', () => {
    const err = { response: { data: { error: { message: 'Complete X', details: [{ field: 'disqualify_reason' }, { field: 'disqualify_reason' }, {}] } } } };
    expect(gateFields(err)).toEqual(['disqualify_reason']);
    expect(gateFields({ response: { data: { error: 'x' } } })).toEqual([]);
    expect(gateFields(undefined)).toEqual([]);
  });

  it('adds a needed field the form does not carry, required and on top', () => {
    const form = { id: 1, fields: [{ field_name: 'first_name', position: 0 }, { field_name: 'email', position: 1 }] };
    const objectFields = [{ name: 'first_name' }, { name: 'disqualify_reason', label: 'Disqualification reason' }];
    const out = withNeededFields(form, objectFields, ['disqualify_reason', 'email'], (f) => ({ ...f, field_name: f.name }));
    expect(out.fields.map((f) => f.field_name)).toEqual(['disqualify_reason', 'first_name', 'email']);
    expect(out.fields[0]).toMatchObject({ is_required: true });
    expect(out.fields[0].position).toBeLessThan(0);
  });

  it('leaves the form alone when nothing is missing from it', () => {
    const form = { id: 1, fields: [{ field_name: 'email' }] };
    expect(withNeededFields(form, [{ name: 'email' }], ['email'], (f) => f)).toBe(form);
    expect(withNeededFields(form, [], [], (f) => f)).toBe(form);
    expect(withNeededFields(null, [], ['x'], (f) => f)).toBe(null);
  });
});
