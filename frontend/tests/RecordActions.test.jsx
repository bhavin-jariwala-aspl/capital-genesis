import { describe, it, expect } from 'vitest';
import { actionAvailable } from '../src/components/runtime/RecordActions';

describe('RecordActions — show_when', () => {
  it('shows an action with no rule on every record', () => {
    expect(actionAvailable({}, { status: 'accepted' })).toBe(true);
  });
  it('limits an action to matching records', () => {
    const accept = { show_when: { field: 'status', op: 'eq', value: 'open' } };
    expect(actionAvailable(accept, { status: 'open' })).toBe(true);
    expect(actionAvailable(accept, { status: 'dismissed' })).toBe(false);
    expect(actionAvailable({ show_when: { field: 's', op: 'in', value: 'a,b' } }, { s: 'b' })).toBe(true);
  });
  it('fails closed on an unknown operator', () => {
    expect(actionAvailable({ show_when: { field: 's', op: 'like', value: 'a' } }, { s: 'a' })).toBe(false);
  });
});
