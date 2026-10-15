import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';

vi.mock('../src/services/metadata.service', () => ({ metadataService: { revealField: vi.fn() } }));
import FieldValue, { recordCurrency } from '../src/components/runtime/FieldValue';
import CurrencyInput from '../src/components/ui/CurrencyInput';

describe('FieldValue — money in the record\'s own currency', () => {
  const amount = { name: 'amount', field_type: 'currency', config: { currency_field: 'currency_code' } };

  it('reads the code from the field named by config.currency_field', () => {
    expect(recordCurrency(amount, { currency_code: 'USD' })).toBe('USD');
    expect(recordCurrency(amount, { currency_code: '' })).toBeUndefined();
    expect(recordCurrency({ name: 'amount_mur', field_type: 'currency', config: {} }, { currency_code: 'USD' })).toBeUndefined();
  });

  it('shows a USD amount in USD, not in the tenant currency', () => {
    render(<FieldValue field={amount} value={60000} currency="USD" />);
    expect(screen.getByText(/(US)?\$60,000/)).toBeTruthy();
  });
});

describe('CurrencyInput — currency not known yet', () => {
  it('shows the given currency\'s symbol, or none with hideSymbol', () => {
    const { container, rerender } = render(<CurrencyInput id="amount" value={5} currency="USD" onChange={() => {}} />);
    expect(container.textContent).toContain('$');
    rerender(<CurrencyInput id="amount" value={5} hideSymbol onChange={() => {}} />);
    expect(container.querySelector('span')).toBeNull();
  });
});
