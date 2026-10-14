'use strict';

/** Public data feeds (PRD I-02): only listed, non-personal fields; latest per group; cached. */

const PublicFeedService = require('../src/services/public-feed.service');

function db() {
  const d = (s) => new Date(`${s}T00:00:00Z`);
  const rows = [
    [1, 'currency_code', { str_value: 'USD' }], [1, 'buy_tt', { num_value: 45.1 }], [1, 'rate_date', { date_value: d('2026-10-12') }],
    [2, 'currency_code', { str_value: 'USD' }], [2, 'buy_tt', { num_value: 45.4 }], [2, 'rate_date', { date_value: d('2026-10-13') }],
    [3, 'currency_code', { str_value: 'EUR' }], [3, 'buy_tt', { num_value: 49.9 }], [3, 'rate_date', { date_value: d('2026-10-13') }],
    [1, 'dealer_note', { str_value: 'secret' }],
  ].map(([record_id, field_name, v]) => ({ record_id, field_name, str_value: null, num_value: null, bool_value: null, date_value: null, json_value: null, ...v }));
  return {
    tenant: { findUnique: jest.fn().mockResolvedValue({ id: 6, status: 'active' }) },
    uiObject: { findMany: jest.fn().mockResolvedValue([{ id: 9, name: 'fx_rate', config: { public_feed: { name: 'fx-rates', fields: ['currency_code', 'buy_tt', 'rate_date', 'dealer_note'], latest_by: { group: 'currency_code', order: 'rate_date' }, sort: { field: 'currency_code' } } } }]) },
    uiField: { findMany: jest.fn().mockResolvedValue([
      { name: 'currency_code', field_type: 'select', config: {} }, { name: 'buy_tt', field_type: 'decimal', config: {} },
      { name: 'rate_date', field_type: 'date', config: {} }, { name: 'dealer_note', field_type: 'text', config: { pii: true } },
    ]) },
    recordFieldValue: { findMany: jest.fn(async ({ where }) => rows.filter((r) => where.field_name.in.includes(r.field_name))) },
  };
}

describe('PublicFeedService', () => {
  it('returns the newest row per group, sorted, without personal fields', async () => {
    const svc = new PublicFeedService(db());
    const out = await svc.feed('genesis-capital', 'fx-rates');
    expect(out.items).toEqual([
      { currency_code: 'EUR', buy_tt: 49.9, rate_date: '2026-10-13' },
      { currency_code: 'USD', buy_tt: 45.4, rate_date: '2026-10-13' },
    ]);
  });
  it('caches for a minute and 404s unknown feeds or workspaces', async () => {
    const d = db();
    let now = 0;
    const svc = new PublicFeedService(d, { now: () => now });
    await svc.feed('genesis-capital', 'fx-rates');
    await svc.feed('genesis-capital', 'fx-rates');
    expect(d.recordFieldValue.findMany).toHaveBeenCalledTimes(1);
    now = 61_000;
    await svc.feed('genesis-capital', 'fx-rates');
    expect(d.recordFieldValue.findMany).toHaveBeenCalledTimes(2);
    await expect(svc.feed('genesis-capital', 'nope')).rejects.toThrow(/Feed/);
    await expect(svc.feed('genesis-capital', '../x')).rejects.toThrow(/Feed/);
    d.tenant.findUnique.mockResolvedValue(null);
    await expect(new PublicFeedService(d).feed('other', 'fx-rates')).rejects.toThrow(/Feed/);
  });
});
