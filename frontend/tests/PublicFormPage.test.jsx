import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

vi.mock('../src/services/api', () => ({ default: { get: vi.fn(), post: vi.fn() } }));
vi.mock('../src/hooks/useWorkspaceBranding', () => ({ useWorkspaceBranding: () => {} }));

import api from '../src/services/api';
import PublicFormPage, { formatResult } from '../src/pages/PublicFormPage';

const LOANS = [{ value: 'LND-RE', label: 'Real Estate Loan' }, { value: 'LND-PL', label: 'Personal Loan' }];
const CALC = {
  tenant_id: 7, workspace: 'Genesis Capital', title: 'Loan calculator', columns: 2, consent_field: null,
  fields: [
    { name: 'product_code', label: 'Product', type: 'select', required: true, options: LOANS },
    { name: 'amount', label: 'Amount', type: 'currency', required: true },
  ],
};
const ENQUIRY = {
  ...CALC, title: 'Get in touch', consent_field: 'consent_marketing',
  fields: [
    { name: 'product_code', label: 'I am interested in', type: 'select', required: true, options: [...LOANS, ...Array.from({ length: 8 }, (_, i) => ({ value: `P${i}`, label: `Product ${i}` }))] },
    { name: 'estimated_amount', label: 'Amount', type: 'currency' },
    { name: 'currency_code', label: 'Currency', type: 'select', default: 'MUR', options: [{ value: 'MUR', label: 'MUR' }, { value: 'USD', label: 'USD' }] },
    { name: 'message', label: 'Message', type: 'textarea' },
    { name: 'first_name', label: 'First name', type: 'text', required: true },
    { name: 'last_name', label: 'Last name', type: 'text', required: true },
    { name: 'email', label: 'Email', type: 'email', required: true },
    { name: 'consent_marketing', label: 'I agree to be contacted', type: 'checkbox' },
  ],
};

const renderAt = (path) => render(<MemoryRouter initialEntries={[path]}><Routes><Route path="/f/:key" element={<PublicFormPage />} /></Routes></MemoryRouter>);
const KEY = 'a'.repeat(48);

describe('PublicFormPage', () => {
  beforeEach(() => { vi.clearAllMocks(); window.history.replaceState({}, '', '/'); });

  it('shows the workspace, short picklists as option cards, and no steps for a short form', async () => {
    api.get.mockResolvedValue({ data: { data: CALC } });
    renderAt(`/f/${KEY}`);
    expect(await screen.findByRole('heading', { name: 'Loan calculator' })).toBeTruthy();
    expect(screen.getAllByText('Genesis Capital').length).toBeGreaterThan(0);
    expect(screen.getByRole('radio', { name: 'Real Estate Loan' })).toBeTruthy();
    expect(screen.queryByText(/Step 1 of/)).toBeNull();
    expect(screen.getByRole('button', { name: /Send request/ })).toBeTruthy();
  });

  it('splits a long form into two steps, keeps defaults, and does not advance past missing answers', async () => {
    api.get.mockResolvedValue({ data: { data: ENQUIRY } });
    renderAt(`/f/${KEY}`);
    expect(await screen.findByText('Step 1 of 2')).toBeTruthy();
    await waitFor(() => expect(screen.getByRole('radio', { name: 'MUR' }).checked).toBe(true));
    fireEvent.click(screen.getByRole('button', { name: /Continue/ }));
    await waitFor(() => expect(screen.getByText('Step 1 of 2')).toBeTruthy()); // product is required
    fireEvent.change(screen.getByLabelText(/I am interested in/), { target: { value: 'LND-RE' } });
    fireEvent.click(screen.getByRole('button', { name: /Continue/ }));
    expect(await screen.findByText('Step 2 of 2')).toBeTruthy();
    expect(screen.getByText('I agree to be contacted')).toBeTruthy();
  });

  it('preselects the product named in ?prod= and shows it in the brand panel', async () => {
    window.history.replaceState({}, '', '/?prod=LND-PL');
    api.get.mockResolvedValue({ data: { data: ENQUIRY } });
    renderAt(`/f/${KEY}`);
    await screen.findByText('Step 1 of 2');
    expect(screen.getAllByText('Personal Loan').length).toBeGreaterThan(1); // chip + option
    await waitFor(() => expect(screen.getByLabelText(/I am interested in/).value).toBe('LND-PL'));
  });

  it('shows the confirmation with labelled, formatted results', async () => {
    api.get.mockResolvedValue({ data: { data: CALC } });
    api.post.mockResolvedValue({ data: { data: {
      message: 'Here is your indicative instalment.', reference: 'ENQ-2026-000200',
      results: { indicative_emi: 23456.4, indicative_rate: 6.65 },
      result_fields: [{ name: 'indicative_emi', label: 'Monthly instalment', format: 'currency', precision: 0 }, { name: 'indicative_rate', label: 'Indicative rate %', format: null, precision: 2 }],
    } } });
    renderAt(`/f/${KEY}`);
    fireEvent.click(await screen.findByRole('radio', { name: 'Real Estate Loan' }));
    fireEvent.change(screen.getByLabelText(/Amount/), { target: { value: '5000000' } });
    fireEvent.click(screen.getByRole('button', { name: /Send request/ }));
    expect(await screen.findByText('Monthly instalment')).toBeTruthy();
    expect(screen.getByText(formatResult(23456.4, { precision: 0 }))).toBeTruthy();
    expect(screen.getByText('6.65%')).toBeTruthy();
    expect(screen.getByText('ENQ-2026-000200')).toBeTruthy();
  });
});

describe('formatResult', () => {
  it('formats numbers, percentages and text', () => {
    expect(formatResult(null)).toBe('—');
    expect(formatResult(6.825, { label: 'Rate %', precision: 3 })).toBe('6.825%');
    expect(formatResult('balanced_growth')).toBe('balanced growth');
  });
});
