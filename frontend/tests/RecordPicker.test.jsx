import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

vi.mock('../src/services/metadata.service', () => ({
  runtimeService: { searchLookup: vi.fn() },
}));

import RecordPicker from '../src/components/ui/RecordPicker';
import { runtimeService } from '../src/services/metadata.service';

function renderPicker(props) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={qc}>
      <RecordPicker targetObject="party" onChange={() => {}} label="Client" {...props} />
    </QueryClientProvider>,
  );
}

describe('RecordPicker — the saved value\'s title', () => {
  it('shows the title the server resolves', async () => {
    runtimeService.searchLookup.mockResolvedValue({ data: [{ id: 7, label: 'Anne Lagesse' }] });
    renderPicker({ value: 7 });
    expect(await screen.findByText('Anne Lagesse')).toBeInTheDocument();
  });

  it('falls back to the title saved on the record when the viewer cannot search that client', async () => {
    runtimeService.searchLookup.mockResolvedValue({ data: [] });
    renderPicker({ value: 3080, knownLabels: { 3080: 'Anil Sookun' } });
    await waitFor(() => expect(runtimeService.searchLookup).toHaveBeenCalled());
    expect(await screen.findByText('Anil Sookun')).toBeInTheDocument();
    expect(screen.queryByText('#3080')).not.toBeInTheDocument();
  });

  it('shows the id only when no title is known at all', async () => {
    runtimeService.searchLookup.mockResolvedValue({ data: [] });
    renderPicker({ value: 12 });
    expect(await screen.findByText('#12')).toBeInTheDocument();
  });
});
