import { describe, it, expect, vi } from 'vitest';
import { useState } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// Searching answers at once; resolving the title of a chosen id never answers
// (a slow server) — the picker must still show the name, not "#id".
vi.mock('../src/services/metadata.service', () => ({
  runtimeService: {
    searchLookup: vi.fn((obj, q, id) => (id != null
      ? new Promise(() => {})
      : Promise.resolve({ data: [{ id: 3083, label: 'Corinne Henry' }] }))),
  },
}));
import RecordPicker from '../src/components/ui/RecordPicker';

function Host() {
  const [v, setV] = useState(null);
  return <RecordPicker id="party" targetObject="party" value={v} onChange={setV} />;
}

describe('RecordPicker', () => {
  it('shows the picked record\'s name while its title is still loading', async () => {
    render(<QueryClientProvider client={new QueryClient()}><Host /></QueryClientProvider>);
    fireEvent.focus(screen.getByRole('textbox'));
    fireEvent.click(await screen.findByRole('button', { name: 'Corinne Henry' }));
    expect(screen.getByRole('button', { name: 'Corinne Henry' })).toBeTruthy();
    expect(screen.queryByText('#3083')).toBeNull();
  });
});
