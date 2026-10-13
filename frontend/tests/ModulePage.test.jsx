import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import ModulePage from '../src/pages/runtime/ModulePage';

// Mock services
vi.mock('../src/services/metadata.service', () => ({
  runtimeService: {
    getModule: vi.fn(),
    getObject: vi.fn(),
    getPipeline: vi.fn(),
    getWizards: vi.fn(),
    getRecords: vi.fn(),
  },
}));

// Mock components to avoid complex dependencies
vi.mock('../src/components/ui/Pipeline', () => ({
  default: () => <div>Pipeline Component</div>,
}));

vi.mock('../src/components/ui/DataTable', () => ({
  default: ({ emptyText }) => <div>{emptyText || 'DataTable Component'}</div>,
}));

vi.mock('../src/components/runtime/ActivityTimeline', () => ({
  default: () => <div>Activity Timeline</div>,
}));

vi.mock('../src/components/runtime/TaskPanel', () => ({
  default: () => <div>Task Panel</div>,
}));

import { runtimeService } from '../src/services/metadata.service';

const mockModuleData = {
  data: {
    id: 1,
    label: 'Sales',
    objects: [
      { id: 1, name: 'lead', label: 'Lead' },
      { id: 2, name: 'opportunity', label: 'Opportunity' },
      { id: 3, name: 'product', label: 'Product' },
      { id: 4, name: 'quote', label: 'Quote' },
      { id: 5, name: 'call_log', label: 'Call Log' },
    ],
  },
};

const mockObjectData = {
  data: {
    id: 1,
    fields: [
      { name: 'name', label: 'Name' },
      { name: 'email', label: 'Email' },
    ],
    pipelines: [],
  },
};

function renderModulePage(moduleId = '1', objectId = '1') {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        staleTime: 0,
        gcTime: 0,
      },
      mutations: { retry: false },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[`/module/${moduleId}/object/${objectId}`]}>
        <Routes>
          <Route path="/module/:moduleId/object/:objectId" element={<ModulePage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe('ModulePage', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    runtimeService.getModule.mockReset();
    runtimeService.getObject.mockReset();
    runtimeService.getPipeline.mockReset();
    runtimeService.getWizards.mockReset();
    runtimeService.getRecords.mockReset();

    // Setup successful mock responses
    runtimeService.getModule.mockImplementation(() => Promise.resolve(mockModuleData));
    runtimeService.getObject.mockImplementation(() => Promise.resolve(mockObjectData));
    runtimeService.getPipeline.mockImplementation(() => Promise.resolve({ data: null }));
    runtimeService.getWizards.mockImplementation(() => Promise.resolve({ data: [] }));
    runtimeService.getRecords.mockImplementation(() => Promise.resolve({ data: [] }));
  });

  it('renders object tabs when multiple objects exist', async () => {
    renderModulePage();

    // Wait for module data to load
    await waitFor(() => {
      expect(screen.queryByText('Module not found.')).not.toBeInTheDocument();
    }, { timeout: 3000 });

    // Wait for tabs to render
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Lead' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Opportunity' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Product' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Quote' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Call Log' })).toBeInTheDocument();
    });
  });

  it('highlights the active object tab', async () => {
    renderModulePage('1', '2'); // Select 'opportunity' object

    await waitFor(() => {
      expect(screen.queryByText('Module not found.')).not.toBeInTheDocument();
    });

    await waitFor(() => {
      const leadTab = screen.getByRole('button', { name: 'Lead' });
      const opportunityTab = screen.getByRole('button', { name: 'Opportunity' });

      // Active tab uses the indigo→violet gradient treatment; inactive tabs are muted grey.
      expect(opportunityTab).toHaveClass('from-primary-500', 'to-mid', 'text-on-primary');
      expect(leadTab).not.toHaveClass('from-primary-500');
      expect(leadTab).toHaveClass('text-gray-500');
    });
  });

  it('does not render tabs when only one object exists', async () => {
    const singleObjectModule = {
      data: {
        ...mockModuleData.data,
        objects: [{ id: 1, name: 'lead', label: 'Lead' }],
      },
    };
    runtimeService.getModule.mockResolvedValue(singleObjectModule);

    renderModulePage();

    await waitFor(() => {
      expect(screen.queryByText('Module not found.')).not.toBeInTheDocument();
    });

    await waitFor(() => {
      // Should not find tab buttons when only one object
      expect(screen.queryByRole('button', { name: 'Lead' })).not.toBeInTheDocument();
    });
  });

  it('renders module label in header', async () => {
    renderModulePage();

    await waitFor(() => {
      expect(screen.queryByText('Module not found.')).not.toBeInTheDocument();
    });

    await waitFor(() => {
      // "Lead" appears in both the tab and the h1 header
      const matches = screen.getAllByText('Lead');
      expect(matches.length).toBeGreaterThanOrEqual(1);
      // Verify there's an h1 containing the object label
      const h1 = matches.find(el => el.tagName === 'H1');
      expect(h1).toBeDefined();
    });
  });

  it('shows loading spinner initially', async () => {
    // Simulate slow loading
    runtimeService.getModule.mockImplementation(
      () => new Promise(resolve => setTimeout(() => resolve(mockModuleData), 100))
    );

    renderModulePage();

    // Should show loading state before data loads
    expect(screen.getByTestId('spinner')).toBeInTheDocument();

    // Wait for loading to complete
    await waitFor(() => {
      expect(screen.queryByTestId('spinner')).not.toBeInTheDocument();
    });
  });
});
