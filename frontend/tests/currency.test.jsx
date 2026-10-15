import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';

import { formatCurrency, getCurrency, currencyCodes } from '../src/utils/currency';
import { useCurrencyStore, currencyOptions } from '../src/store/currencyStore';
import { fmtCurrency, fmtCurrencyPrecise, fmtCurrencyCompact } from '../src/utils/formatters';
import { formatValue } from '../src/utils/report';
import CurrencyInput from '../src/components/ui/CurrencyInput';

/** Put the store in a known state — the app normally does this at bootstrap. */
const setTenantCurrency = (values) => useCurrencyStore.getState().applySettings(values);

/**
 * Intl separates the amount from the symbol with a non-breaking space in most
 * locales. Normalise it so assertions can be written with an ordinary space.
 */
const norm = (s) => s.replace(/[\u00a0\u202f]/g, ' ');

beforeEach(() => setTenantCurrency({ 'localization.currency': 'USD' }));

describe('currency registry (frontend mirror)', () => {
  it('exposes the same shape the backend does', () => {
    expect(getCurrency('inr')).toMatchObject({ code: 'INR', symbol: '₹', decimals: 2 });
    expect(getCurrency('ZZZ').code).toBe('USD');
    expect(currencyCodes()).toContain('AED');
  });

  it('honours ISO minor units', () => {
    expect(formatCurrency(1234.56, { code: 'JPY' })).toBe('¥1,235');
    expect(formatCurrency(1234.5,  { code: 'USD' })).toBe('$1,234.50');
  });
});

describe('currencyStore', () => {
  it('defaults to USD/en-US formatting', () => {
    expect(currencyOptions()).toEqual({ code: 'USD', locale: 'en-US', numberFormat: '1,234.56' });
  });

  it('applies a settings payload', () => {
    setTenantCurrency({
      'localization.currency': 'EUR',
      'localization.locale': 'de',
      'localization.number_format': '1.234,56',
    });
    expect(currencyOptions()).toEqual({ code: 'EUR', locale: 'de', numberFormat: '1.234,56' });
    expect(useCurrencyStore.getState().symbol).toBe('€');
    expect(useCurrencyStore.getState().loaded).toBe(true);
  });

  it('falls back to USD when the stored currency is unknown', () => {
    setTenantCurrency({ 'localization.currency': 'XYZ' });
    expect(currencyOptions().code).toBe('USD');
  });
});

describe('shared formatters follow the tenant currency', () => {
  it('fmtCurrency switches with the store — no reload, no re-import', () => {
    expect(fmtCurrency(1234.5)).toBe('$1,235');

    setTenantCurrency({ 'localization.currency': 'INR', 'localization.locale': 'en-IN' });
    expect(fmtCurrency(1234567)).toBe('₹12,34,567');

    setTenantCurrency({ 'localization.currency': 'JPY' });
    expect(fmtCurrency(1234)).toBe('¥1,234');
  });

  it('fmtCurrencyPrecise keeps the currency minor units', () => {
    setTenantCurrency({ 'localization.currency': 'GBP' });
    expect(fmtCurrencyPrecise(1234.5)).toBe('£1,234.50');
  });

  it('fmtCurrencyCompact abbreviates for tiles and axes', () => {
    expect(fmtCurrencyCompact(1234567)).toBe('$1.2M');
  });

  it('blank values render the shared placeholder', () => {
    expect(fmtCurrency(null)).toBe('—');
    expect(fmtCurrency(undefined)).toBe('—');
  });

  it('report cells use the tenant currency', () => {
    setTenantCurrency({ 'localization.currency': 'EUR', 'localization.locale': 'de' });
    // German locale puts the symbol after the amount…
    expect(norm(formatValue(1500, 'currency'))).toBe('1,500 €');
    // Non-money types are unaffected.
    expect(formatValue(12.34, 'number')).toBe('12.34');
  });

  it('Number Format is an explicit override, not a consequence of Language', () => {
    // Language alone leaves grouping at the Number Format setting's default…
    setTenantCurrency({ 'localization.currency': 'EUR', 'localization.locale': 'de' });
    expect(norm(fmtCurrencyPrecise(1234.5))).toBe('1,234.50 €');

    // …and changing Number Format is what switches the separators.
    setTenantCurrency({
      'localization.currency': 'EUR',
      'localization.locale': 'de',
      'localization.number_format': '1.234,56',
    });
    expect(norm(fmtCurrencyPrecise(1234.5))).toBe('1.234,50 €');
  });
});

describe('CurrencyInput', () => {
  it('shows the tenant currency symbol by default', () => {
    setTenantCurrency({ 'localization.currency': 'INR' });
    render(<CurrencyInput label="Premium" value={1000} onChange={() => {}} />);
    expect(screen.getByText('₹')).toBeInTheDocument();
  });

  it('an explicit currency prop overrides the tenant default', () => {
    setTenantCurrency({ 'localization.currency': 'INR' });
    render(<CurrencyInput label="Premium" currency="GBP" value={1000} onChange={() => {}} />);
    expect(screen.getByText('£')).toBeInTheDocument();
  });

  it('shows the number next to the symbol without repeating the currency', () => {
    setTenantCurrency({ 'localization.currency': 'GBP' });
    render(<CurrencyInput label="Premium" value={1500} onChange={() => {}} />);
    expect(screen.getByRole('textbox')).toHaveValue('1,500.00');
  });

  it('reports the raw number on change, not the formatted string', () => {
    const onChange = vi.fn();
    render(<CurrencyInput label="Premium" value={null} onChange={onChange} />);
    const input = screen.getByRole('textbox');

    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: '2500' } });

    expect(onChange).toHaveBeenCalledWith(2500);
  });

  it('strips the symbol and separators a user pastes in', () => {
    const onChange = vi.fn();
    render(<CurrencyInput label="Premium" value={null} onChange={onChange} />);
    const input = screen.getByRole('textbox');

    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: '$1234.50' } });

    expect(onChange).toHaveBeenCalledWith(1234.5);
  });
});
