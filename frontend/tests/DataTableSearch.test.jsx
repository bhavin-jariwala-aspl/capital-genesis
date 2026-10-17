import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import DataTable from '../src/components/ui/DataTable';

const rows = [
  { id: 1, data: { bu: 'FX', period: '2026-09' } },
  { id: 2, data: { bu: 'FX', period: '2026-10' } },
  { id: 3, data: { bu: 'ADV', period: '2026-09' } },
];
const columns = [
  { key: 'bu', label: 'Unit', searchText: (r) => ({ FX: 'Forex (Genesis Forex)', ADV: 'Corporate Advisory' }[r.data.bu]) },
  { key: 'period', label: 'Period' },
];

describe('DataTable search', () => {
  it('requires every word to match some column and reports the rows left', () => {
    const onFilter = vi.fn();
    render(<DataTable columns={columns} data={rows} onFilter={onFilter} />);
    expect(onFilter).not.toHaveBeenCalled(); // nothing to report until the user searches
    fireEvent.change(screen.getByPlaceholderText('Search…'), { target: { value: 'forex 2026-09' } });
    const [left, search] = onFilter.mock.calls.at(-1);
    expect(left.map((r) => r.id)).toEqual([1]);
    expect(search).toBe('forex 2026-09');
    expect(screen.getAllByRole('row')).toHaveLength(2); // header + one row
  });
});
