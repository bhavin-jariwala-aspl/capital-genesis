'use strict';

const { formatTemplateValues, formatDate } = require('../src/utils/template-format');

describe('email template values', () => {
  const fields = [
    { name: 'amount', field_type: 'currency', config: {} },
    { name: 'amount_mur', field_type: 'formula', config: { format: 'currency', precision: 2 } },
    { name: 'interest_rate', field_type: 'formula', config: { precision: 3 } },
    { name: 'tenure_months', field_type: 'integer', config: {} },
    { name: 'value_date', field_type: 'date', config: {} },
    { name: 'offer_valid_until', field_type: 'formula', config: { format: 'date' } },
  ];

  it('formats amounts, numbers and dates from the field metadata and workspace settings', () => {
    const out = formatTemplateValues({
      amount: '39834.26', amount_mur: 1250000, interest_rate: 6.825, tenure_months: 240,
      value_date: new Date('2026-10-17T00:00:00Z'), offer_valid_until: '2026-11-16', reference: 'LA-001',
    }, fields, { decimals: 2, numberFormat: '1,234.56', dateFormat: 'DD/MM/YYYY' });
    expect(`MUR ${out.amount}`).toBe('MUR 39,834.26');
    expect(out.amount_mur).toBe('1,250,000.00');
    expect(out.interest_rate).toBe('6.825');
    expect(out.tenure_months).toBe(240);
    expect(out.value_date).toBe('17/10/2026');
    expect(out.offer_valid_until).toBe('16/11/2026');
    expect(out.reference).toBe('LA-001');
  });

  it('follows the workspace number format and currency decimals', () => {
    const out = formatTemplateValues({ amount: 1234.5 }, fields, { decimals: 0, numberFormat: '1.234,56' });
    expect(out.amount).toBe('1.235');
    expect(formatDate('2026-01-05', 'DD-MMM-YYYY')).toBe('05-Jan-2026');
  });
});
