import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import ObjectPicker from '../src/components/ui/ObjectPicker';

// Mock metadataService to avoid real HTTP calls
vi.mock('../src/services/metadata.service', () => ({
  metadataService: {
    getModules: vi.fn(),
  },
}));

import { metadataService } from '../src/services/metadata.service';

const MOCK_MODULES = [
  {
    id: 1,
    name: 'sales',
    label: 'Sales',
    objects: [
      { id: 10, name: 'lead',    label: 'Lead' },
      { id: 11, name: 'contact', label: 'Contact' },
    ],
  },
  {
    id: 2,
    name: 'support',
    label: 'Support',
    objects: [
      { id: 20, name: 'case', label: 'Case' },
    ],
  },
];

function makeClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

function renderPicker(props = {}) {
  metadataService.getModules.mockResolvedValue({ data: MOCK_MODULES });
  const client = makeClient();
  return render(
    <QueryClientProvider client={client}>
      <ObjectPicker onChange={vi.fn()} {...props} />
    </QueryClientProvider>,
  );
}

describe('ObjectPicker', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows loading placeholder initially', () => {
    metadataService.getModules.mockReturnValue(new Promise(() => {})); // never resolves
    const client = makeClient();
    render(
      <QueryClientProvider client={client}>
        <ObjectPicker onChange={vi.fn()} />
      </QueryClientProvider>,
    );
    expect(screen.getByRole('combobox')).toHaveDisplayValue('Loading objects…');
  });

  it('renders module optgroups and object options after fetch', async () => {
    renderPicker();
    // Wait for options to appear
    expect(await screen.findByRole('option', { name: 'Lead' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Contact' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Case' })).toBeInTheDocument();
  });

  it('calls onChange when an option is selected', async () => {
    const onChange = vi.fn();
    renderPicker({ onChange });
    await screen.findByRole('option', { name: 'Lead' });
    await userEvent.selectOptions(screen.getByRole('combobox'), '10');
    expect(onChange).toHaveBeenCalledWith('10');
  });

  it('renders label with required asterisk when required=true', async () => {
    renderPicker({ label: 'Object', required: true });
    await screen.findByRole('option', { name: 'Lead' });
    expect(screen.getByText('*')).toBeInTheDocument();
  });

  it('renders error message when error prop provided', async () => {
    renderPicker({ error: 'Required field' });
    await screen.findByRole('option', { name: 'Lead' });
    expect(screen.getByText('Required field')).toBeInTheDocument();
  });

  it('is disabled when disabled=true', async () => {
    renderPicker({ disabled: true });
    await screen.findByRole('option', { name: 'Lead' });
    expect(screen.getByRole('combobox')).toBeDisabled();
  });
});
