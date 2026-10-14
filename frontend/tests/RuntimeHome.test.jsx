import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

vi.mock('../src/services/metadata.service', () => ({
  runtimeService: { getDashboards: vi.fn(), getDashboard: vi.fn() },
}));
vi.mock('../src/components/runtime/DashboardRenderer', () => ({ default: ({ dashboard }) => <div>board:{dashboard?.label}</div> }));
vi.mock('../src/components/runtime/SlaRadiator', () => ({ default: () => null }));
vi.mock('../src/store/authStore', () => ({ useAuthStore: (sel) => sel({ isAdmin: () => false, employee: { employee_name: 'Priya Ramdin' } }) }));

import RuntimeHome from '../src/pages/runtime/RuntimeHome';
import { runtimeService } from '../src/services/metadata.service';

const BOARDS = [{ id: 28, label: 'Group Executive' }, { id: 42, label: 'My Workbench' }];
const renderAt = (path) => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}><MemoryRouter initialEntries={[path]}><RuntimeHome /></MemoryRouter></QueryClientProvider>);
};

describe('RuntimeHome ?dashboard=', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    runtimeService.getDashboards.mockResolvedValue({ data: BOARDS });
    runtimeService.getDashboard.mockImplementation(async (id) => ({ data: BOARDS.find((b) => b.id === Number(id)) }));
  });

  it('opens the board named in the link', async () => {
    renderAt('/?dashboard=42');
    await waitFor(() => expect(runtimeService.getDashboard).toHaveBeenCalledWith(42));
  });

  it('falls back to the first board for an unknown or hidden id', async () => {
    renderAt('/?dashboard=999');
    await waitFor(() => expect(runtimeService.getDashboard).toHaveBeenCalledWith(28));
    expect(runtimeService.getDashboard).not.toHaveBeenCalledWith(999);
  });
});
