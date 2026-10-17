import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { useForm } from 'react-hook-form';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// The staff directory any signed-in user may read (not the admin-only /employees).
vi.mock('../src/services/auth.service', () => ({
  authService: {
    getStaff: vi.fn(() => Promise.resolve([
      { employee_id: 'GCRM1', employee_name: 'Priya Ramdin' },
      { employee_id: 'GCRM3', employee_name: 'Bruno Chan' },
    ])),
    getEmployees: vi.fn(() => Promise.reject(new Error('403'))),
  },
}));
vi.mock('../src/services/metadata.service', () => ({ runtimeService: {} }));
import FieldRenderer from '../src/components/runtime/FieldRenderer';

let submitted;
function Host({ field, defaults = {} }) {
  const { register, control, handleSubmit } = useForm({ defaultValues: defaults });
  return (
    <form onSubmit={handleSubmit((v) => { submitted = v; })}>
      <FieldRenderer field={field} register={register} control={control} errors={{}} />
      <button type="submit">Save</button>
    </form>
  );
}
const wrap = (ui) => render(<QueryClientProvider client={new QueryClient()}>{ui}</QueryClientProvider>);
const ownerRm = { field_name: 'owner_rm', label: 'Owner RM', field_type: 'text', config: { employee: true } };

describe('staff-id fields', () => {
  it('pick a person by name and store the employee id', async () => {
    wrap(<Host field={ownerRm} />);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'bruno' } });
    fireEvent.click(await screen.findByRole('button', { name: /Bruno Chan/ }));
    expect(screen.getByRole('button', { name: 'Owner RM' }).textContent).toBe('Bruno Chan');
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await vi.waitFor(() => expect(submitted).toEqual({ owner_rm: 'GCRM3' }));
  });

  it('show the saved person by name, not the id', async () => {
    wrap(<Host field={ownerRm} defaults={{ owner_rm: 'GCRM1' }} />);
    await vi.waitFor(() => expect(screen.getByRole('button', { name: 'Owner RM' }).textContent).toBe('Priya Ramdin'));
  });

  it('leave plain text fields as text inputs', () => {
    wrap(<Host field={{ field_name: 'note', label: 'Note', field_type: 'text', config: {} }} />);
    expect(screen.getByRole('textbox')).toBeTruthy();
    expect(screen.queryByPlaceholderText(/search staff/i)).toBeNull();
  });
});
