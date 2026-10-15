import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

vi.mock('../src/services/webForms.service', () => ({ webFormsService: { list: vi.fn(), link: vi.fn(), send: vi.fn() } }));
import { webFormsService } from '../src/services/webForms.service';
import WebFormsPage from '../src/pages/runtime/WebFormsPage';

const FORMS = [
  { id: 222, title: 'Get in touch', description: 'Ask about any of our services.', object: 'Enquiry', path: '/f/a', channel: 'web_form',
    products: [{ value: 'LND-RE', label: 'Real Estate Loan' }, { value: 'FND-INC', label: 'Income Fund' }] },
  { id: 227, title: 'Request a call-back', description: null, object: 'Web Event', path: '/f/b', channel: 'web_form', products: [],
    experts: [{ value: 'GCFX1', label: 'Deepak Mungur' }] },
];

const renderPage = () => render(
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <MemoryRouter><WebFormsPage /></MemoryRouter>
  </QueryClientProvider>,
);

describe('WebFormsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    webFormsService.list.mockResolvedValue({ data: FORMS });
    webFormsService.link.mockResolvedValue({ data: { url: 'http://localhost:5173/f/a?prod=FND-INC&utm_source=crm' } });
    webFormsService.send.mockResolvedValue({ data: { status: 'sent' } });
    Object.assign(navigator, { clipboard: { writeText: vi.fn().mockResolvedValue() } });
  });

  it('lists every published form with its actions', async () => {
    renderPage();
    expect(await screen.findByText('Get in touch')).toBeTruthy();
    expect(screen.getByText('Request a call-back')).toBeTruthy();
    expect(screen.getByText('2 published forms. Answers become records in the CRM and are routed to the right team.')).toBeTruthy();
    expect(screen.getAllByRole('button', { name: /Email to client/ })).toHaveLength(2);
    expect(screen.getAllByRole('button', { name: /Copy link/ })).toHaveLength(2);
  });

  it('copies a link with the chosen product preselected', async () => {
    renderPage();
    const card = (await screen.findByText('Get in touch')).closest('.card');
    fireEvent.change(within(card).getByRole('combobox'), { target: { value: 'FND-INC' } });
    fireEvent.click(within(card).getByRole('button', { name: /Copy link/ }));
    await waitFor(() => expect(navigator.clipboard.writeText).toHaveBeenCalledWith('http://localhost:5173/f/a?prod=FND-INC&utm_source=crm'));
    expect(webFormsService.link).toHaveBeenCalledWith(222, 'FND-INC', null);
    expect(await within(card).findByText('Copied')).toBeTruthy();
  });

  it('emails the form to a client', async () => {
    renderPage();
    const card = (await screen.findByText('Request a call-back')).closest('.card');
    fireEvent.click(within(card).getByRole('button', { name: /Email to client/ }));
    fireEvent.change(await screen.findByLabelText(/Client email/), { target: { value: 'anne@example.mu' } });
    fireEvent.change(screen.getByLabelText(/Client name/), { target: { value: 'Anne' } });
    fireEvent.click(screen.getByRole('button', { name: /^Send$/ }));
    await waitFor(() => expect(webFormsService.send).toHaveBeenCalledWith(227, { to: 'anne@example.mu', name: 'Anne', prod: null, language: 'en', message: null }));
    expect(await screen.findByText('Sent to anne@example.mu')).toBeTruthy();
  });

  it('addresses a call-back link to a chosen expert', async () => {
    renderPage();
    const card = (await screen.findByText('Request a call-back')).closest('.card');
    fireEvent.change(within(card).getByRole('combobox'), { target: { value: 'GCFX1' } });
    fireEvent.click(within(card).getByRole('button', { name: /Copy link/ }));
    await waitFor(() => expect(webFormsService.link).toHaveBeenCalledWith(227, null, 'GCFX1'));
  });
});
