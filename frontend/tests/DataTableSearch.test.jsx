import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import DataTable from '../src/components/ui/DataTable';

describe('DataTable search', () => {
  it('matches the text a column displays, not only the stored value', () => {
    const label = { FND: 'Funds (Genesis Global Funds)', LND: 'Lending (Genesis Life Ltd)' };
    const columns = [
      { key: 'name', label: 'Name' },
      { key: 'business_unit', label: 'Unit', render: (v) => label[v], searchText: (row) => label[row.data.business_unit] },
    ];
    const data = [
      { id: 1, data: { name: 'Income Fund', business_unit: 'FND' } },
      { id: 2, data: { name: 'Real Estate Loan', business_unit: 'LND' } },
    ];
    render(<DataTable columns={columns} data={data} />);
    fireEvent.change(screen.getByPlaceholderText('Search…'), { target: { value: 'global funds' } });
    expect(screen.queryByText('Income Fund')).toBeTruthy();
    expect(screen.queryByText('Real Estate Loan')).toBeNull();
  });
});
