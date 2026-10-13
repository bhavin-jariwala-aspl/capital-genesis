import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

vi.mock('../src/services/metadata.service', () => ({
  runtimeService: { getApprovals: vi.fn(), decideApproval: vi.fn() },
}));
vi.mock('../src/utils/dialog', () => ({ showError: vi.fn(), showSuccess: vi.fn() }));
vi.mock('../src/store/authStore', () => ({
  useAuthStore: (sel) => sel({ isAdmin: () => false, isManager: () => true }),
}));

import ApprovalsPage from '../src/pages/runtime/ApprovalsPage';
import { runtimeService } from '../src/services/metadata.service';

const ITEM = {
  id: 7, token: 'abc123', status: 'pending', title: 'Credit approval: Amélie Dupré · LND-RE', message: 'MUR 4,500,000 · grade B',
  workflow: 'Loan — approval matrix', requested_at: '2026-10-13T09:00:00Z', requested_by_name: 'Nadia Peerbux',
  approvers: [{ id: 'SWLMGR', name: 'Rajiv Doorgakant' }],
  record: { id: 2883, title: 'LA-2026-000032', object: 'Loan Application', link: '/module/1/object/2?record=2883' },
};

function renderPage(path = '/approvals') {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(<QueryClientProvider client={qc}><MemoryRouter initialEntries={[path]}><ApprovalsPage /></MemoryRouter></QueryClientProvider>);
}

describe('ApprovalsPage', () => {
  beforeEach(() => { vi.clearAllMocks(); window.HTMLElement.prototype.scrollIntoView = vi.fn(); });

  it('lists the requests waiting for me with a link to the record', async () => {
    runtimeService.getApprovals.mockResolvedValue({ data: [ITEM] });
    renderPage();
    expect(await screen.findByText(ITEM.title)).toBeTruthy();
    expect(screen.getByText(/Loan Application: LA-2026-000032/).closest('a').getAttribute('href')).toBe(ITEM.record.link);
    expect(runtimeService.getApprovals).toHaveBeenCalledWith('mine');
    expect(screen.getByRole('tab', { name: 'All pending' })).toBeTruthy();
  });

  it('approves with a comment', async () => {
    runtimeService.getApprovals.mockResolvedValue({ data: [ITEM] });
    runtimeService.decideApproval.mockResolvedValue({ data: { status: 'approved' } });
    renderPage();
    await screen.findByText(ITEM.title);
    fireEvent.change(screen.getByPlaceholderText(/Comment/), { target: { value: 'Within policy' } });
    fireEvent.click(screen.getByRole('button', { name: /Approve/ }));
    await waitFor(() => expect(runtimeService.decideApproval).toHaveBeenCalledWith('abc123', 'approve', 'Within policy'));
  });

  it('shows an empty state', async () => {
    runtimeService.getApprovals.mockResolvedValue({ data: [] });
    renderPage();
    expect(await screen.findByText(/Nothing is waiting/)).toBeTruthy();
  });
});
