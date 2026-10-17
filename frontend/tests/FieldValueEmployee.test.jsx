import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';

vi.mock('../src/services/metadata.service', () => ({ metadataService: { revealField: vi.fn() } }));
import FieldValue from '../src/components/runtime/FieldValue';

describe('FieldValue — staff-id fields', () => {
  const f = { name: 'owner_rm', field_type: 'text', config: { employee: true } };
  it('shows the person\'s name the API sends as the label', () => {
    render(<FieldValue field={f} value="GCRM1" label="Priya Ramdin" />);
    expect(screen.getByText('Priya Ramdin')).toBeTruthy();
    expect(screen.queryByText('GCRM1')).toBeNull();
  });
  it('falls back to the id when no name is known', () => {
    render(<FieldValue field={f} value="GCX9" />);
    expect(screen.getByText('GCX9')).toBeTruthy();
  });
});
