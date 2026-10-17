import { render, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { describe, it, expect, vi } from 'vitest';

vi.mock('../src/services/metadata.service', () => ({
  runtimeService: { getRecord: vi.fn(async (id) => ({ data: { id: Number(id), data: { base_currency: 'USD' } } })) },
}));
import { runtimeService } from '../src/services/metadata.service';
import { currencySource } from '../src/utils/currencySource';
import FieldRenderer from '../src/components/runtime/FieldRenderer';

const snapshotFields = [
  { name: 'wealth_mandate', field_type: 'lookup', config: {} },
  { name: 'base_currency', field_type: 'formula', config: { expression: 'wealth_mandate.base_currency' } },
  { name: 'currency_code', field_type: 'select', config: {} },
];

describe('currencySource — where a money field reads its currency on a form', () => {
  it('reads the form\'s own currency field when the form holds it', () => {
    expect(currencySource('currency_code', snapshotFields, ['amount', 'currency_code'])).toEqual({ field: 'currency_code' });
  });
  it('follows a currency copied from a linked record', () => {
    expect(currencySource('base_currency', snapshotFields, ['wealth_mandate', 'market_value']))
      .toEqual({ field: 'base_currency', lookup: 'wealth_mandate', target: 'base_currency' });
  });
  it('has no source for a field without its own currency', () => {
    expect(currencySource(undefined, snapshotFields, [])).toBeNull();
  });
});

function Snapshot({ values }) {
  const { register, control } = useForm({ defaultValues: values });
  const field = { field_name: 'market_value', name: 'market_value', label: 'Market value', field_type: 'currency', config: { currency_field: 'base_currency' } };
  return <FieldRenderer field={field} register={register} control={control} errors={{}}
    currencySource={currencySource('base_currency', snapshotFields, ['wealth_mandate', 'market_value'])} />;
}
const wrap = (ui) => render(<QueryClientProvider client={new QueryClient()}>{ui}</QueryClientProvider>);

describe('Money input on a new record whose currency comes from the linked record', () => {
  it('shows the linked mandate\'s currency (USD), not the tenant\'s', async () => {
    const { container } = wrap(<Snapshot values={{ wealth_mandate: 5805, market_value: 2500000 }} />);
    await waitFor(() => expect(container.textContent).toContain('$'));
    expect(runtimeService.getRecord).toHaveBeenCalledWith(5805);
    expect(container.textContent).not.toMatch(/Rs/);
  });
  it('shows no symbol until a mandate is picked', () => {
    const { container } = wrap(<Snapshot values={{ market_value: 1 }} />);
    expect(container.textContent).not.toMatch(/Rs|\$/);
  });
});
