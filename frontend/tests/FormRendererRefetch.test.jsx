import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import FormRenderer from '../src/components/runtime/FormRenderer';

const formMeta = {
  id: 1, name: 'dsr', columns: 2, dependencies: [],
  fields: [
    { field_name: 'response', name: 'response', label: 'Response', field_type: 'text', col_span: 6, row: 0, col: 0, position: 0 },
    { field_name: 'details', name: 'details', label: 'Details', field_type: 'text', col_span: 6, row: 0, col: 1, position: 1 },
  ],
};

describe('FormRenderer — a background refetch of the record', () => {
  it('keeps what the user typed and refreshes the untouched fields', async () => {
    const { rerender } = render(<FormRenderer formMeta={formMeta} defaultValues={{ response: '', details: 'old' }} onSubmit={() => {}} />);
    const response = document.getElementById('response');
    await waitFor(() => expect(document.getElementById('details').value).toBe('old'));
    fireEvent.change(response, { target: { value: 'Data copy sent' } });
    rerender(<FormRenderer formMeta={formMeta} defaultValues={{ response: '', details: 'new' }} onSubmit={() => {}} />);
    await waitFor(() => expect(document.getElementById('details').value).toBe('new'));
    expect(response.value).toBe('Data copy sent');
    expect(screen.getByText('Response')).toBeTruthy();
  });
});
