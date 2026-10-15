import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';

vi.mock('../src/services/metadata.service', () => ({
  metadataService: {},
  runtimeService: { revealField: vi.fn().mockResolvedValue({ data: { field: 'id_number', value: 'L5403363712681' } }) },
}));
import FieldValue from '../src/components/runtime/FieldValue';
import { runtimeService } from '../src/services/metadata.service';

// Personal data is shown masked to everyone; only a viewer the API marks
// `can_reveal` gets the (audited) Reveal link — the caller passes a recordId then.
describe('FieldValue — masked personal data', () => {
  const field = { name: 'id_number', field_type: 'text', config: { pii: true } };

  it('shows the mask without a Reveal link when the viewer may not reveal', () => {
    render(<FieldValue field={field} value="••••••••6814" masked recordId={null} />);
    expect(screen.getByText('••••••••6814')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Reveal/ })).toBeNull();
  });

  it('offers Reveal when the viewer may reveal, and shows the value the server returns', async () => {
    render(<FieldValue field={field} value="••••••••6814" masked recordId={3067} />);
    fireEvent.click(screen.getByRole('button', { name: /Reveal/ }));
    expect(runtimeService.revealField).toHaveBeenCalledWith(3067, 'id_number');
    expect(await screen.findByText('L5403363712681')).toBeTruthy();
  });
});
