import { describe, it, expect } from 'vitest';
import { builderDefaults } from '../src/utils/fieldDefaults';

describe('builderDefaults', () => {
  it('pre-fills a new form with the Builder default of each field, typed like the server does', () => {
    const out = builderDefaults([
      { field_name: 'scope', field_type: 'select', default_value: 'group' },
      { name: 'quorum', field_type: 'integer', default_value: '1' },
      { name: 'listed', field_type: 'checkbox', default_value: 'true' },
      { name: 'notes', field_type: 'text', default_value: null },
      { name: 'blank', field_type: 'text', default_value: '' },
      { name: 'score', field_type: 'formula', default_value: '5' },
      { name: 'kyc_no', field_type: 'auto_number', default_value: 'KYC-' },
    ]);
    expect(out).toEqual({ scope: 'group', quorum: 1, listed: true });
  });

  it('resolves {{today}} and skips other placeholders', () => {
    const out = builderDefaults([
      { name: 'opened_on', field_type: 'date', default_value: '{{today}}' },
      { name: 'owner', field_type: 'text', default_value: '{{user}}' },
    ]);
    expect(out.opened_on).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(out).not.toHaveProperty('owner');
  });
});
