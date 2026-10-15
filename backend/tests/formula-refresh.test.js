'use strict';

const FormulaRefreshService = require('../src/services/formula-refresh.service');
const { latestTargets, TIME_DEPENDENT } = FormulaRefreshService;

describe('formula refresh — LATEST readers', () => {
  it('finds the tables a formula reads with LATEST', () => {
    expect([...latestTargets("IF(ISBLANK(margin), null, LATEST('plr_rate', 'rate', 'effective_from') + margin)")]).toEqual(['plr_rate']);
    expect(latestTargets("LOOKUP('financial_product', 'code', product_code, 'margin')").size).toBe(0);
  });

  it('treats LATEST as date-dependent (a future-dated row comes into effect)', () => {
    expect(TIME_DEPENDENT.test("LATEST('plr_rate', 'rate', 'effective_from')")).toBe(true);
  });

  it('recomputes every record of the objects that read a changed rate table', async () => {
    const db = {
      uiField: { findMany: jest.fn(async () => [
        { object_id: 156, config: { expression: "LATEST('plr_rate', 'rate', 'effective_from') + margin" } },
        { object_id: 300, config: { expression: "LOOKUP('financial_product', 'code', product_code, 'margin')" } },
      ]) },
      uiObject: {
        findMany: jest.fn(async () => [{ id: 238 }]),
        findFirst: jest.fn(async () => ({ name: 'plr_rate' })),
      },
      record: { findMany: jest.fn(async ({ where }) => (where.object_id === 156 ? [{ id: 1 }, { id: 2 }] : [])) },
    };
    const records = { recompute: jest.fn(async (id) => id === 1) };
    const svc = new FormulaRefreshService(db, records, { debounceMs: 5 });

    expect(await svc.refreshReadersOf(7, 999)).toBeNull(); // not a LATEST table: nothing scheduled
    const [a, b] = await Promise.all([svc.refreshReadersOf(7, 238), svc.refreshReadersOf(7, 238)]);
    expect(a).toEqual({ records: 2, changed: 1 });
    expect(b).toBe(a); // coalesced into one run
    expect(records.recompute).toHaveBeenCalledTimes(2);
    expect(db.record.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { object_id: 156, deleted_at: null } }));
  });
});
