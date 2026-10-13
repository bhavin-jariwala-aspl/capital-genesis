'use strict';

const HierarchyService = require('../src/services/hierarchy.service');
const { getConnector, getConnectorStatus, PLATFORMS } = require('../src/connectors/social');

/**
 * In-memory closure table exposing the delegate surface HierarchyService uses.
 * Query counts are tracked so the N+1 regression can be asserted rather than
 * just described.
 */
function makePrisma(seed = []) {
  const rows = seed.map((r) => ({ ...r }));
  const counts = { findMany: 0, upsert: 0, deleteMany: 0, createMany: 0 };

  const matches = (r, where = {}) => {
    if (where.ancestor_id !== undefined) {
      const a = where.ancestor_id;
      if (a && typeof a === 'object') {
        if (a.notIn && a.notIn.includes(r.ancestor_id)) return false;
        if (a.not !== undefined && r.ancestor_id === a.not) return false;
        if (a.in && !a.in.includes(r.ancestor_id)) return false;
      } else if (r.ancestor_id !== a) return false;
    }
    if (where.descendant_id !== undefined) {
      const d = where.descendant_id;
      if (d && typeof d === 'object') {
        if (d.in && !d.in.includes(r.descendant_id)) return false;
      } else if (r.descendant_id !== d) return false;
    }
    if (where.depth !== undefined) {
      const dp = where.depth;
      if (dp && typeof dp === 'object' && dp.gt !== undefined) { if (!(r.depth > dp.gt)) return false; }
      else if (r.depth !== dp) return false;
    }
    return true;
  };

  const db = {
    _rows: rows,
    _counts: counts,
    $transaction: jest.fn(async (fn) => fn(db)),
    employeeHierarchy: {
      findMany: jest.fn(async ({ where } = {}) => {
        counts.findMany += 1;
        return rows.filter((r) => matches(r, where)).map((r) => ({ ...r }));
      }),
      deleteMany: jest.fn(async ({ where } = {}) => {
        counts.deleteMany += 1;
        for (let i = rows.length - 1; i >= 0; i--) if (matches(rows[i], where)) rows.splice(i, 1);
        return { count: 0 };
      }),
      createMany: jest.fn(async ({ data }) => {
        counts.createMany += 1;
        for (const d of data) {
          if (!rows.some((r) => r.ancestor_id === d.ancestor_id && r.descendant_id === d.descendant_id)) rows.push({ ...d });
        }
        return { count: data.length };
      }),
      upsert: jest.fn(async ({ where, update, create }) => {
        counts.upsert += 1;
        const k = where.ancestor_id_descendant_id;
        const hit = rows.find((r) => r.ancestor_id === k.ancestor_id && r.descendant_id === k.descendant_id);
        if (hit) { Object.assign(hit, update); return hit; }
        rows.push({ ...create });
        return create;
      }),
    },
  };
  return db;
}

/** A closure table for: CEO → MGR → {R1, R2, R3}, plus NEWBOSS at the top. */
function seedOrg() {
  return [
    { ancestor_id: 'CEO', descendant_id: 'CEO', depth: 0 },
    { ancestor_id: 'NEWBOSS', descendant_id: 'NEWBOSS', depth: 0 },
    { ancestor_id: 'CEO', descendant_id: 'NEWBOSS', depth: 1 },
    { ancestor_id: 'MGR', descendant_id: 'MGR', depth: 0 },
    { ancestor_id: 'CEO', descendant_id: 'MGR', depth: 1 },
    ...['R1', 'R2', 'R3'].flatMap((r) => ([
      { ancestor_id: r,     descendant_id: r, depth: 0 },
      { ancestor_id: 'MGR', descendant_id: r, depth: 1 },
      { ancestor_id: 'CEO', descendant_id: r, depth: 2 },
    ])),
  ];
}

describe('HierarchyService.moveEmployee', () => {
  test('re-parents the employee and their whole subtree', async () => {
    const db = makePrisma(seedOrg());
    await new HierarchyService(db).moveEmployee('MGR', 'NEWBOSS');

    const edge = (a, d) => db._rows.find((r) => r.ancestor_id === a && r.descendant_id === d);

    expect(edge('NEWBOSS', 'MGR').depth).toBe(1);
    // Reports stay directly under their manager…
    for (const r of ['R1', 'R2', 'R3']) expect(edge('MGR', r).depth).toBe(1);
    // …and pick up the new ancestor chain at the right distance.
    for (const r of ['R1', 'R2', 'R3']) expect(edge('NEWBOSS', r).depth).toBe(2);
    for (const r of ['R1', 'R2', 'R3']) expect(edge('CEO', r).depth).toBe(3);
    // Self-rows survive.
    expect(edge('MGR', 'MGR').depth).toBe(0);
  });

  test('query count does not scale with team size (the N+1 regression)', async () => {
    const small = makePrisma(seedOrg());
    await new HierarchyService(small).moveEmployee('MGR', 'NEWBOSS');

    // Same shape, but 30 reports instead of 3.
    const many = [
      { ancestor_id: 'CEO', descendant_id: 'CEO', depth: 0 },
      { ancestor_id: 'NEWBOSS', descendant_id: 'NEWBOSS', depth: 0 },
      { ancestor_id: 'CEO', descendant_id: 'NEWBOSS', depth: 1 },
      { ancestor_id: 'MGR', descendant_id: 'MGR', depth: 0 },
      { ancestor_id: 'CEO', descendant_id: 'MGR', depth: 1 },
      ...Array.from({ length: 30 }, (_, i) => `R${i}`).flatMap((r) => ([
        { ancestor_id: r,     descendant_id: r, depth: 0 },
        { ancestor_id: 'MGR', descendant_id: r, depth: 1 },
        { ancestor_id: 'CEO', descendant_id: r, depth: 2 },
      ])),
    ];
    const big = makePrisma(many);
    await new HierarchyService(big).moveEmployee('MGR', 'NEWBOSS');

    // Reads are now loop-invariant: a 10x bigger team must not mean 10x reads.
    expect(big._counts.findMany).toBe(small._counts.findMany);
  });

  test('runs inside a transaction', async () => {
    const db = makePrisma(seedOrg());
    await new HierarchyService(db).moveEmployee('MGR', 'NEWBOSS');
    expect(db.$transaction).toHaveBeenCalledTimes(1);
  });

  test('moving to no parent detaches without touching self-rows', async () => {
    const db = makePrisma(seedOrg());
    await new HierarchyService(db).moveEmployee('MGR', null);

    expect(db._rows.find((r) => r.ancestor_id === 'CEO' && r.descendant_id === 'MGR')).toBeUndefined();
    expect(db._rows.find((r) => r.ancestor_id === 'MGR' && r.descendant_id === 'MGR').depth).toBe(0);
  });
});

describe('social connector registry', () => {
  test('every platform resolves to a usable connector', () => {
    for (const p of PLATFORMS) expect(getConnector(p)).toBeTruthy();
  });

  test('an unknown platform still resolves rather than throwing', () => {
    expect(getConnector('mastodon').name).toBe('simulation');
  });

  test('platform API keys alone never displace the working simulation', () => {
    // The regression: the old registry routed to a throw-only scaffold as soon
    // as these were set, so configuring Meta broke publishing outright.
    process.env.META_APP_ID = 'test-id';
    process.env.META_APP_SECRET = 'test-secret';
    process.env.LINKEDIN_CLIENT_ID = 'test-id';
    process.env.LINKEDIN_CLIENT_SECRET = 'test-secret';
    try {
      for (const p of ['facebook', 'instagram', 'linkedin']) {
        expect(getConnectorStatus()[p].mode).toBe('simulation');
      }
    } finally {
      delete process.env.META_APP_ID; delete process.env.META_APP_SECRET;
      delete process.env.LINKEDIN_CLIENT_ID; delete process.env.LINKEDIN_CLIENT_SECRET;
    }
  });

  test('the simulation connector actually implements the interface', async () => {
    const c = getConnector('facebook');
    const account = { id: 1, platform: 'facebook', account_name: 'Acme' };
    await expect(c.publish(account, { content: 'hello', post_type: 'post' })).resolves.toBeTruthy();
    await expect(c.getProfileMetrics(account)).resolves.toBeTruthy();
  });
});
