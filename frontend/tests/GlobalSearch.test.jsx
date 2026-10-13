import React from 'react';
import { render, screen, waitFor, act, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import GlobalSearch from '../src/components/ui/GlobalSearch';

// Mock navigation and search service
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, useNavigate: () => vi.fn() };
});

vi.mock('../src/services/search.service', () => ({
  searchService: {
    search: vi.fn(),
  },
}));

import { searchService } from '../src/services/search.service';

const MOCK_RESULTS = [
  {
    id: 1, record_id: 101, title: 'Acme Corp', subtitle: 'acme@example.com',
    crm_type: 'account', object_id: 3, object_label: 'Account',
    module_id: 1, module_label: 'Sales',
  },
  {
    id: 2, record_id: 102, title: 'Bob Smith', subtitle: 'bob@example.com',
    crm_type: 'contact', object_id: 4, object_label: 'Contact',
    module_id: 1, module_label: 'Sales',
  },
];

function renderSearch() {
  return render(
    <MemoryRouter>
      <GlobalSearch />
    </MemoryRouter>,
  );
}

describe('GlobalSearch', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Real timers used intentionally — vi.useFakeTimers() blocks RTL's waitFor()
    // which polls with setTimeout internally.
  });

  it('renders the search input', () => {
    renderSearch();
    expect(screen.getByRole('textbox')).toBeInTheDocument();
  });

  it('does not show results dropdown initially', () => {
    renderSearch();
    expect(screen.queryByText('Acme Corp')).not.toBeInTheDocument();
  });

  it('shows results after debounce when search returns data', async () => {
    searchService.search.mockResolvedValue({ data: { data: MOCK_RESULTS } });
    renderSearch();

    const input = screen.getByRole('textbox');
    // Must focus first — dropdown only opens when focused=true
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'Acme' } });

    // waitFor polls until results appear (debounce fires after 300ms)
    await waitFor(
      () => expect(screen.getByText('Acme Corp')).toBeInTheDocument(),
      { timeout: 1000 },
    );
    expect(screen.getByText('Bob Smith')).toBeInTheDocument();
    expect(searchService.search).toHaveBeenCalledWith('Acme');
  });

  it('clears results when query is cleared', async () => {
    searchService.search.mockResolvedValue({ data: { data: MOCK_RESULTS } });
    renderSearch();

    const input = screen.getByRole('textbox');
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'Acme' } });
    await waitFor(() => expect(screen.getByText('Acme Corp')).toBeInTheDocument(), { timeout: 1000 });

    fireEvent.change(input, { target: { value: '' } });
    await waitFor(() => {
      expect(screen.queryByText('Acme Corp')).not.toBeInTheDocument();
    }, { timeout: 1000 });
  });

  it('does not call search for empty query', async () => {
    searchService.search.mockResolvedValue({ data: { data: [] } });
    renderSearch();

    fireEvent.change(screen.getByRole('textbox'), { target: { value: '' } });
    // Small pause to ensure any erroneous call would have fired
    await new Promise(r => setTimeout(r, 50));
    expect(searchService.search).not.toHaveBeenCalled();
  });
});
