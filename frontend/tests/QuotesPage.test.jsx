import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import QuotesPage from '../src/pages/runtime/QuotesPage';

// Mock services
vi.mock('../src/services/metadata.service', () => ({
  runtimeService: {
    getQuotes: vi.fn(),
    getQuote: vi.fn(),
    createQuote: vi.fn(),
    updateQuote: vi.fn(),
    deleteQuote: vi.fn(),
    submitQuote: vi.fn(),
    approveQuote: vi.fn(),
    rejectQuote: vi.fn(),
    getRecords: vi.fn(),
    getProducts: vi.fn(),
    addLineItem: vi.fn(),
    updateLineItem: vi.fn(),
    deleteLineItem: vi.fn(),
  },
}));

// Mock DataTable to simplify rendering
vi.mock('../src/components/ui/DataTable', () => ({
  default: ({ data, columns, emptyText }) => (
    <div data-testid="data-table">
      {data.length === 0
        ? <div>{emptyText}</div>
        : data.map((row, i) => (
            <div key={i} data-testid={`row-${i}`}>
              {columns.map((col, j) => (
                <span key={j}>{col.cell ? col.cell({ row: { original: row } }) : null}</span>
              ))}
            </div>
          ))
      }
    </div>
  ),
}));

import { runtimeService } from '../src/services/metadata.service';

const mockQuotes = [
  {
    id: 1, quote_number: 'QUO-2026-0001', name: 'Enterprise Deal',
    status: 'draft', total_amount: '15000.00', valid_until: '2026-06-01T00:00:00Z',
    line_items: [
      { id: 10, name: 'Widget Pro', quantity: '5', unit_price: '2000.00', discount: '0', line_total: '10000.00', product_id: 1 },
      { id: 11, name: 'Support Plan', quantity: '1', unit_price: '5000.00', discount: '0', line_total: '5000.00', product_id: null },
    ],
  },
  {
    id: 2, quote_number: 'QUO-2026-0002', name: 'Small Biz',
    status: 'sent', total_amount: '500.00', valid_until: null,
    line_items: [],
  },
];

const mockQuoteDetail = {
  ...mockQuotes[0],
  subtotal: '15000.00',
  discount_amount: '0.00',
  tax_amount: '1200.00',
  total_amount: '16200.00',
};

const mockProducts = [
  { id: 1, name: 'Widget Pro', sku: 'WP-001', unit_price: '2000.00' },
  { id: 2, name: 'Widget Basic', sku: 'WB-001', unit_price: '500.00' },
];

function renderQuotesPage() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: 0, gcTime: 0 },
      mutations: { retry: false },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <QuotesPage />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe('QuotesPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    runtimeService.getQuotes.mockResolvedValue({ data: mockQuotes });
    runtimeService.getQuote.mockResolvedValue({ data: mockQuoteDetail });
    runtimeService.getRecords.mockResolvedValue({ data: [] });
    runtimeService.getProducts.mockResolvedValue({ data: mockProducts });
    runtimeService.addLineItem.mockResolvedValue({ data: { id: 99 } });
  });

  it('renders quote list with stats', async () => {
    renderQuotesPage();

    await waitFor(() => {
      expect(screen.getByText('Quotes')).toBeInTheDocument();
    });

    // Stats should show counts
    await waitFor(() => {
      expect(screen.getByText('Draft')).toBeInTheDocument();
      expect(screen.getByText('Sent')).toBeInTheDocument();
    });
  });

  it('renders Create Quote button', async () => {
    renderQuotesPage();

    await waitFor(() => {
      expect(screen.getByText('Create Quote')).toBeInTheDocument();
    });
  });

  it('shows quote detail with line items when clicking a quote', async () => {
    renderQuotesPage();

    // Wait for quotes to load
    await waitFor(() => {
      expect(screen.getByText('QUO-2026-0001')).toBeInTheDocument();
    });

    // Click the quote number to open detail
    fireEvent.click(screen.getByText('QUO-2026-0001'));

    // Wait for detail view to load
    await waitFor(() => {
      expect(screen.getByText('Line Items (2)')).toBeInTheDocument();
    });

    // Line items should be visible
    expect(screen.getByText('Widget Pro')).toBeInTheDocument();
    expect(screen.getByText('Support Plan')).toBeInTheDocument();
  });

  it('shows Add Item button in detail view for draft quotes', async () => {
    renderQuotesPage();

    await waitFor(() => {
      expect(screen.getByText('QUO-2026-0001')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('QUO-2026-0001'));

    await waitFor(() => {
      expect(screen.getByText('Add Item')).toBeInTheDocument();
    });
  });

  it('shows summary cards in quote detail', async () => {
    renderQuotesPage();

    await waitFor(() => {
      expect(screen.getByText('QUO-2026-0001')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('QUO-2026-0001'));

    await waitFor(() => {
      expect(screen.getByText('Subtotal')).toBeInTheDocument();
      expect(screen.getByText('Tax')).toBeInTheDocument();
      expect(screen.getByText('Total')).toBeInTheDocument();
    });
  });

  it('shows empty state for quotes list when no quotes exist', async () => {
    runtimeService.getQuotes.mockResolvedValue({ data: [] });
    renderQuotesPage();

    await waitFor(() => {
      expect(screen.getByText('No quotes yet. Create your first quote to get started.')).toBeInTheDocument();
    });
  });

  it('shows Back button in detail view', async () => {
    renderQuotesPage();

    await waitFor(() => {
      expect(screen.getByText('QUO-2026-0001')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('QUO-2026-0001'));

    await waitFor(() => {
      expect(screen.getByText('Back')).toBeInTheDocument();
    });
  });
});
