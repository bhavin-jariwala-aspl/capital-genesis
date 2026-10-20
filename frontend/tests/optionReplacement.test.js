import { describe, it, expect } from 'vitest';
import { parseValuesInUse, optionChoices } from '../src/components/builder/OptionReplacementDialog';

const refusal = (message) => ({ response: { status: 400, data: { error: { message } } } });

describe('parseValuesInUse — the API refusing to drop picklist values records hold', () => {
  it('reads each value and its record count', () => {
    const err = refusal('Values still in use: "dormant" (3 records), "closed" (1 record). Choose a replacement for each (option_replacements) or keep the value.');
    expect(parseValuesInUse(err)).toEqual([{ value: 'dormant', count: 3 }, { value: 'closed', count: 1 }]);
  });
  it('ignores any other error', () => {
    expect(parseValuesInUse(refusal('This object already has a field named "x"'))).toBeNull();
    expect(parseValuesInUse(new Error('Network Error'))).toBeNull();
  });
  it('offers the remaining options, string or { value, label }', () => {
    expect(optionChoices(['a', { value: 'b', label: 'Bee' }])).toEqual([{ value: 'a', label: 'a' }, { value: 'b', label: 'Bee' }]);
  });
});
