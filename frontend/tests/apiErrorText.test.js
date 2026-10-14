import { describe, it, expect } from 'vitest';
import { apiErrorText } from '../src/utils/record';

describe('apiErrorText', () => {
  it('reads the message out of the API error object (a refused Kanban move)', () => {
    const err = { response: { data: { success: false, error: { code: 'VALIDATION_ERROR', message: 'Complete LMS reference before moving to Booked', details: [] } } } };
    expect(apiErrorText(err)).toBe('Complete LMS reference before moving to Booked');
  });
  it('accepts a plain string error, a network error, or nothing', () => {
    expect(apiErrorText({ response: { data: { error: 'Nope' } } })).toBe('Nope');
    expect(apiErrorText({ message: 'Network Error' })).toBe('Network Error');
    expect(apiErrorText(undefined, 'Could not move this record.')).toBe('Could not move this record.');
  });
});
