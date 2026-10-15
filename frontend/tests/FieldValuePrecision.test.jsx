import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';

vi.mock('../src/services/metadata.service', () => ({ metadataService: { revealField: vi.fn() } }));
import FieldValue from '../src/components/runtime/FieldValue';

describe('FieldValue — decimals', () => {
  it('shows a percent formula with up to its declared precision', () => {
    const f = { name: 'rate_from', field_type: 'formula', config: { format: 'percent', precision: 3 } };
    render(<FieldValue field={f} value={6.15} />);
    expect(screen.getByText('6.15%')).toBeTruthy();
  });

  it('keeps one decimal for a percent without a precision', () => {
    render(<FieldValue field={{ name: 'ltv', field_type: 'percent' }} value={80} />);
    expect(screen.getByText('80.0%')).toBeTruthy();
  });

  it('shows an ISO timestamp kept in a text field as a date and time', () => {
    render(<FieldValue field={{ name: 'consent_timestamp', field_type: 'text' }} value="2026-10-15T15:39:16.878Z" />);
    expect(screen.queryByText('2026-10-15T15:39:16.878Z')).toBeNull();
    expect(screen.getByText(/Oct 15, 2026/)).toBeTruthy();
  });

  it('shows a number formula with up to its declared precision', () => {
    const f = { name: 'board_rate', field_type: 'formula', data_type: 'number', config: { precision: 4 } };
    render(<FieldValue field={f} value={45.12345} />);
    expect(screen.getByText(/45\.1235|45,1235/)).toBeTruthy();
  });
});
