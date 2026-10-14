import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const api = {
  workspace: vi.fn(), me: vi.fn(), views: vi.fn(), list: vi.fn(), options: vi.fn(),
  create: vi.fn(), act: vi.fn(), documents: vi.fn(), messages: vi.fn(),
};
vi.mock('../src/services/portal.service', () => ({
  portalClient: () => api,
  portalToken: { get: () => 'gp1.token', set: vi.fn(), clear: vi.fn() },
}));

import PortalPage from '../src/pages/portal/PortalPage';

const HOLDINGS = {
  object: 'fund_holding', title: 'Fund holdings', link: 'party', uploads: false, create: null,
  fields: [{ name: 'share_class', label: 'Share class', field_type: 'lookup', config: {} }, { name: 'units', label: 'Units', field_type: 'decimal', config: {} }],
  row_actions: [{ key: 'redeem', label: 'Redeem', object: 'fund_order', fields: [{ name: 'units', label: 'Units', field_type: 'decimal', config: {} }] }],
};
const ORDERS = {
  object: 'fund_order', title: 'Fund orders', link: 'party', uploads: false, row_actions: [],
  fields: [{ name: 'order_no', label: 'Order No.', field_type: 'auto_number', config: {} }],
  create: { label: 'Invest', fields: [{ name: 'amount', label: 'Amount', field_type: 'currency', config: {} }], lookups: {} },
};

function renderPortal() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/portal/genesis-capital']}>
        <Routes><Route path="/portal/:slug" element={<PortalPage />} /></Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('PortalPage — fund holdings and orders', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.workspace.mockResolvedValue({ name: 'Genesis Capital' });
    api.me.mockResolvedValue({ kind: 'client', name: 'Vikash' });
    api.views.mockResolvedValue([HOLDINGS, ORDERS]);
    api.list.mockImplementation(async (object) => (object === 'fund_holding'
      ? { records: [{ id: 300, data: { share_class: 17, units: 120 }, labels: { share_class: 'Genesis Income Fund — A' } }] }
      : { records: [{ id: 400, data: { order_no: 'FO-0001' }, labels: {} }] }));
    api.documents.mockResolvedValue([]);
    api.messages.mockResolvedValue([]);
    api.act.mockResolvedValue({ id: 900, object: 'fund_order' });
  });

  it('puts Redeem on each holding and only "Invest" on the orders section', async () => {
    renderPortal();
    const holdings = (await screen.findByText('Fund holdings')).closest('section');
    const orders = screen.getByText('Fund orders').closest('section');
    await within(holdings).findByText('Genesis Income Fund — A');
    expect(within(holdings).getByRole('button', { name: 'Redeem' })).toBeTruthy();
    await within(orders).findByText('FO-0001');
    expect(within(orders).queryByRole('button', { name: 'Redeem' })).toBeNull();
    expect(within(orders).getByRole('button', { name: /Invest/ }).textContent.trim()).toBe('Invest');
  });

  it('redeems the chosen holding through its row action', async () => {
    renderPortal();
    const holdings = (await screen.findByText('Fund holdings')).closest('section');
    fireEvent.click(await within(holdings).findByRole('button', { name: 'Redeem' }));
    expect(await screen.findByText('Redeem — Genesis Income Fund — A')).toBeTruthy();
    fireEvent.change(screen.getAllByLabelText('Units').at(-1), { target: { value: '25' } });
    fireEvent.click(screen.getByRole('button', { name: 'Submit' }));
    await waitFor(() => expect(api.act).toHaveBeenCalledWith('fund_holding', 300, 'redeem', { units: 25 }));
  });
});
