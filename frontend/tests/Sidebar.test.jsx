import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const authState = { admin: false };
vi.mock('../src/store/authStore', () => ({
  useAuthStore: () => ({
    employee: { employee_name: 'Test User', role: authState.admin ? 'admin' : 'user' },
    isAdmin: () => authState.admin,
    isPlatformAdmin: () => false,
  }),
}));

vi.mock('../src/services/metadata.service', () => ({
  runtimeService: { getModules: vi.fn() },
}));

import Sidebar from '../src/components/layout/Sidebar';
import { runtimeService } from '../src/services/metadata.service';

const MODULES = [
  { id: 1, label: 'Leads',    icon: 'TrendingUp', color: 'blue',   category: 'crm' },
  { id: 2, label: 'Accounts', icon: 'Building2',  color: 'indigo', category: 'crm' },
];

function renderSidebar() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: 0, gcTime: 0 } },
  });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <Sidebar open onClose={vi.fn()} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('Sidebar', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authState.admin = false;
    runtimeService.getModules.mockResolvedValue({ data: MODULES });
  });

  it('groups metadata modules by category (memoised modules → modulesByCategory)', async () => {
    renderSidebar();
    // Module links render from the grouped, memoised list…
    expect(await screen.findByText('Leads')).toBeInTheDocument();
    expect(screen.getByText('Accounts')).toBeInTheDocument();
    // …under their category section header (Modules), proving the grouping ran.
    expect(screen.getByText('Modules')).toBeInTheDocument();
  });

  it('gives a category it does not know its own section, titled from the key', async () => {
    runtimeService.getModules.mockResolvedValue({
      data: [...MODULES, { id: 3, label: 'Loan Applications', icon: 'FileText', color: 'indigo', category: 'retail_lending' }],
    });
    renderSidebar();
    expect(await screen.findByText('Loan Applications')).toBeInTheDocument();
    expect(screen.getByText('Retail Lending')).toBeInTheDocument();
  });

  /**
   * Reports is the one authoring surface that must reach every user: the client
   * requirement is that non-technical staff configure reports unaided. Filing it
   * under Builder would hide it, because that whole section is admin-gated.
   */
  it('shows Reports under Tools to a NON-admin user', async () => {
    renderSidebar();
    expect(await screen.findByText('Tools')).toBeInTheDocument();
    const reports = screen.getAllByText('Reports');
    expect(reports).toHaveLength(1);
    expect(reports[0].closest('a')).toHaveAttribute('href', '/reports');
  });

  it('hides the whole Builder section from a non-admin', async () => {
    renderSidebar();
    await screen.findByText('Leads');
    expect(screen.queryByText('Builder')).not.toBeInTheDocument();
    expect(screen.queryByText('Dashboard Builder')).not.toBeInTheDocument();
  });

  it('still offers Reports to a non-admin even though Builder is hidden', async () => {
    renderSidebar();
    await screen.findByText('Leads');
    expect(screen.queryByText('Builder')).not.toBeInTheDocument();
    expect(screen.getByText('Reports')).toBeInTheDocument();
  });

  it('gives an admin a Builder shortcut to the same Reports area', async () => {
    authState.admin = true;
    renderSidebar();
    // The Builder section is collapsed unless the route is already under /builder.
    fireEvent.click(await screen.findByText('Builder'));

    // Tools entry plus the Builder signpost — both point at the one shared page,
    // so there is no second implementation to keep in sync.
    const reports = screen.getAllByText('Reports');
    expect(reports.length).toBeGreaterThanOrEqual(2);
    for (const node of reports) {
      expect(node.closest('a')).toHaveAttribute('href', '/reports');
    }
  });

  it('does not put report authoring behind the admin-only /builder routes', async () => {
    authState.admin = true;
    renderSidebar();
    fireEvent.click(await screen.findByText('Builder'));
    // The signpost must target the shared page, never a /builder/* path — those are
    // wrapped in ProtectedRoute and would 403 for the users this feature is for.
    for (const node of screen.getAllByText('Reports')) {
      expect(node.closest('a').getAttribute('href')).not.toMatch(/^\/builder/);
    }
  });
});
