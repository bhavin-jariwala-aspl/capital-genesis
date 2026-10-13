'use strict';

jest.mock('@prisma/client');

const ReportService = require('../src/services/report.service');
const { getField, allFields, relationSelect, rollupsFor, MAX_RELATION_HOPS } = require('../src/services/report-registry');

/**
 * The join model: curated multi-hop to-one paths, and parent→children roll-ups.
 *
 * The property that matters most here is the absence of **fan-out**. An
 * `accounts ⋈ opportunities` join would count an account's annual revenue once
 * per deal; these tests pin the arithmetic that proves roll-ups do not.
 */

// ── fixtures ───────────────────────────────────────────────────────────────

const ACCOUNTS = [
  { id: 1, annual_revenue: 1200, account_type: 'customer', industry: 'Tech',
    owner: { employee_name: 'Ann', branch: { branch_name: 'HQ' }, region: { region_name: 'West' } } },
  { id: 2, annual_revenue: 800, account_type: 'customer', industry: 'Retail',
    owner: { employee_name: 'Bob', branch: { branch_name: 'NY' }, region: { region_name: 'East' } } },
  { id: 3, annual_revenue: 400, account_type: 'customer', industry: 'Tech',
    owner: { employee_name: 'Ann', branch: { branch_name: 'HQ' }, region: { region_name: 'West' } } },
];

// Account 1 has THREE opportunities — the fan-out trap.
const OPPORTUNITIES = [
  { account_id: 1, amount: 100 },
  { account_id: 1, amount: 150 },
  { account_id: 1, amount: 50 },
  { account_id: 2, amount: 700 },
];

function accountPrisma({ accounts = ACCOUNTS, opportunities = OPPORTUNITIES } = {}) {
  const oppGroupBy = jest.fn(async ({ by, where }) => {
    const ids = where[by[0]].in;
    const acc = new Map();
    for (const o of opportunities.filter((x) => ids.includes(x.account_id))) {
      const g = acc.get(o.account_id) ?? { account_id: o.account_id, _sum: { amount: 0 }, _count: { _all: 0 } };
      g._sum.amount += o.amount;
      g._count._all += 1;
      acc.set(o.account_id, g);
    }
    return [...acc.values()];
  });
  return {
    crmAccount: { findMany: jest.fn().mockResolvedValue(accounts) },
    crmOpportunity: { groupBy: oppGroupBy },
    __oppGroupBy: oppGroupBy,
  };
}

const run = (prisma, config) =>
  new ReportService(prisma).run({ source: 'accounts', ...config }, { scope: 'all' });

// ── Registry resolution ────────────────────────────────────────────────────

describe('multi-hop path resolution', () => {
  it('resolves a two-hop to-one path and labels it without a redundant leaf', () => {
    const f = getField('accounts', 'owner.branch.branch_name');
    expect(f).toMatchObject({ kind: 'related', path: ['owner', 'branch'], leaf: 'branch_name' });
    // `primary` collapses "Owner ▸ Branch ▸ Name" to "Owner ▸ Branch".
    expect(f.label).toBe('Owner ▸ Branch');
  });

  it('keeps the leaf label at a single hop, so existing labels are unchanged', () => {
    expect(getField('accounts', 'owner.employee_name').label).toBe('Owner ▸ Name');
  });

  it('unlocks deals-by-the-contact\'s-account, which one hop could not express', () => {
    expect(getField('opportunities', 'contact.account.name')).toMatchObject({ path: ['contact', 'account'] });
  });

  it('refuses a path deeper than the engine will resolve', () => {
    expect(MAX_RELATION_HOPS).toBe(2);
    expect(getField('accounts', 'owner.branch.region.region_name')).toBeNull();
  });

  it('refuses an unknown hop rather than guessing', () => {
    expect(getField('accounts', 'owner.nonsense.x')).toBeNull();
    expect(getField('accounts', 'nonsense.employee_name')).toBeNull();
  });

  it('merges overlapping paths into one nested select', () => {
    expect(relationSelect('opportunities', ['contact.account.name', 'contact.title', 'owner.branch.branch_name']))
      .toEqual({
        contact: { select: { account: { select: { name: true } }, title: true } },
        owner: { select: { branch: { select: { branch_name: true } } } },
      });
  });

  it('offers territory by name and no longer by raw id', () => {
    const labels = allFields('accounts').map((f) => f.label);
    expect(labels).toContain('Owner ▸ Branch');
    expect(labels).toContain('Owner ▸ Region');
    expect(labels).not.toContain('Owner ▸ Branch (id)');
  });

  it('still resolves the retired id fields, so saved reports keep running', () => {
    expect(getField('accounts', 'owner.branch_id')).toMatchObject({ hidden: true, kind: 'related' });
  });
});

describe('roll-up resolution', () => {
  it('exposes a count and the declared aggregates as measures', () => {
    expect(getField('accounts', 'opportunities.$count')).toMatchObject({
      kind: 'rollup', agg: true, group: false, filterable: false, label: 'Opportunities ▸ Number of',
    });
    expect(getField('accounts', 'opportunities.amount')).toMatchObject({
      kind: 'rollup', rollup: 'sum', type: 'currency', label: 'Opportunities ▸ Total deal value',
    });
  });

  it('never offers a roll-up as a grouping', () => {
    const rollups = allFields('accounts').filter((f) => f.kind === 'rollup');
    expect(rollups.length).toBeGreaterThan(0);
    expect(rollups.every((f) => f.group === false)).toBe(true);
  });

  it('collects the descriptors a config needs, keyed by collection', () => {
    const needed = rollupsFor('accounts', ['opportunities.$count', 'opportunities.amount', 'annual_revenue']);
    expect([...needed.keys()]).toEqual(['opportunities']);
    expect(needed.get('opportunities').fields).toHaveLength(2);
  });
});

// ── Query construction ─────────────────────────────────────────────────────

describe('query construction', () => {
  it('nests a filter on a two-hop path all the way down', async () => {
    const prisma = accountPrisma();
    await run(prisma, {
      viz: 'table',
      filters: [{ field: 'owner.branch.branch_name', op: 'equals', value: 'HQ' }],
    });
    expect(prisma.crmAccount.findMany.mock.calls[0][0].where)
      .toEqual({ owner: { branch: { branch_name: 'HQ' } } });
  });

  it('selects only the nested columns the config touches', async () => {
    const prisma = accountPrisma();
    await run(prisma, {
      viz: 'bar',
      group_by: [{ field: 'owner.region.region_name' }],
      metrics: [{ agg: 'sum', field: 'annual_revenue' }],
    });
    expect(prisma.crmAccount.findMany.mock.calls[0][0].select).toEqual({
      id: true,
      annual_revenue: true,
      owner: { select: { region: { select: { region_name: true } } } },
    });
  });

  it('does not query the child table when no roll-up is referenced', async () => {
    const prisma = accountPrisma();
    await run(prisma, { viz: 'table', columns: ['annual_revenue'] });
    expect(prisma.__oppGroupBy).not.toHaveBeenCalled();
  });

  it('reads children with one grouped aggregate keyed on the foreign key', async () => {
    const prisma = accountPrisma();
    await run(prisma, { viz: 'table', columns: ['annual_revenue', 'opportunities.amount'] });
    expect(prisma.__oppGroupBy).toHaveBeenCalledTimes(1);
    const args = prisma.__oppGroupBy.mock.calls[0][0];
    expect(args.by).toEqual(['account_id']);
    expect(args.where).toEqual({ account_id: { in: [1, 2, 3] } });
    expect(args._sum).toEqual({ amount: true });
  });

  it('chunks the parent id list rather than emitting one enormous IN', async () => {
    const many = Array.from({ length: 2500 }, (_, i) => ({ id: i + 1, annual_revenue: 1 }));
    const prisma = accountPrisma({ accounts: many, opportunities: [] });
    await run(prisma, { viz: 'table', columns: ['annual_revenue', 'opportunities.$count'] });
    expect(prisma.__oppGroupBy).toHaveBeenCalledTimes(3); // 1000 + 1000 + 500
    const sizes = prisma.__oppGroupBy.mock.calls.map((c) => c[0].where.account_id.in.length);
    expect(sizes).toEqual([1000, 1000, 500]);
  });

  it('skips the child query entirely when the parent set is empty', async () => {
    const prisma = accountPrisma({ accounts: [] });
    await run(prisma, { viz: 'table', columns: ['opportunities.$count'] });
    expect(prisma.__oppGroupBy).not.toHaveBeenCalled();
  });
});

// ── The arithmetic that proves there is no fan-out ─────────────────────────

describe('roll-ups do not inflate the parent measures', () => {
  it('counts an account\'s revenue once, however many deals it has', async () => {
    const res = await run(accountPrisma(), {
      viz: 'table',
      group_by: [{ field: 'industry' }],
      metrics: [
        { agg: 'sum', field: 'annual_revenue', label: 'Revenue' },
        { agg: 'sum', field: 'opportunities.amount', label: 'Deal value' },
      ],
      totals: true,
    });
    const tech = res.rows.find((r) => r.industry === 'Tech');
    // Account 1 (1200, three deals) + account 3 (400, none). A join would give 1200×3 + 400 = 4000.
    expect(tech.m0).toBe(1600);
    expect(tech.m1).toBe(300);
    expect(res.summary.grand.m0).toBe(2400); // 1200 + 800 + 400, not 4000
  });

  it('computes a truthful ratio from the two sides', async () => {
    const res = await run(accountPrisma(), {
      viz: 'table',
      group_by: [{ field: 'industry' }],
      metrics: [
        { agg: 'sum', field: 'annual_revenue' },
        { agg: 'sum', field: 'opportunities.amount' },
        { agg: 'formula', formula: { op: 'percent_of', a: 'm1', b: 'm0' } },
      ],
    });
    expect(res.rows.find((r) => r.industry === 'Tech').m2).toBeCloseTo(18.8, 1);
    expect(res.rows.find((r) => r.industry === 'Retail').m2).toBeCloseTo(87.5, 1);
  });

  it('reports zero — not null — for a parent with no children', async () => {
    const res = await run(accountPrisma(), {
      viz: 'table',
      columns: ['annual_revenue', 'opportunities.$count', 'opportunities.amount'],
    });
    const noDeals = res.rows.find((r) => r.annual_revenue === 400);
    expect(noDeals['opportunities.$count']).toBe(0);
    expect(noDeals['opportunities.amount']).toBe(0);
  });

  it('groups by a two-hop dimension and totals correctly', async () => {
    const res = await run(accountPrisma(), {
      viz: 'bar',
      group_by: [{ field: 'owner.region.region_name' }],
      metrics: [{ agg: 'sum', field: 'annual_revenue' }],
      totals: true,
    });
    expect(res.columns[0].label).toBe('Owner ▸ Region');
    expect(Object.fromEntries(res.rows.map((r) => [r['owner.region.region_name'], r.m0])))
      .toEqual({ West: 1600, East: 800 });
    expect(res.summary.grand.m0).toBe(2400);
  });

  it('can average a roll-up across parents', async () => {
    const res = await run(accountPrisma(), {
      viz: 'kpi',
      metrics: [{ agg: 'avg', field: 'opportunities.$count', label: 'Deals per account' }],
    });
    expect(res.rows[0].m0).toBeCloseTo(4 / 3, 2); // 3 + 1 + 0 deals over 3 accounts
  });
});

// ── The public catalogue ───────────────────────────────────────────────────

describe('the field catalogue sent to the builder', () => {
  const sources = new ReportService({}).getSources();
  const accounts = sources.find((s) => s.key === 'accounts');

  it('never exposes how a value is reached', () => {
    // The resolved field carries the relation path and, for a roll-up, the child
    // Prisma model and foreign key. None of that is the browser's business.
    const json = JSON.stringify(sources);
    for (const internal of ['"model"', '"fk"', '"path"', '"leaf"', '"primary"', '"source"']) {
      expect(json).not.toContain(internal);
    }
  });

  it('still carries everything the builder needs to render a field', () => {
    const f = accounts.fields.find((x) => x.key === 'opportunities.amount');
    expect(f).toEqual({
      key: 'opportunities.amount',
      label: 'Opportunities ▸ Total deal value',
      type: 'currency',
      kind: 'rollup',
      agg: true,
      group: false,
      filterable: false,
      relation_label: 'Opportunities',
    });
  });

  it('advertises the relations and roll-up collections available', () => {
    expect(accounts.relations.map((r) => r.via)).toContain('owner');
    expect(accounts.rollups.map((r) => r.via)).toEqual(['opportunities', 'cases']);
  });

  it('omits retired fields from the catalogue', () => {
    expect(accounts.fields.some((f) => f.key === 'owner.branch_id')).toBe(false);
  });
});

// ── Guard rails ────────────────────────────────────────────────────────────

describe('guard rails', () => {
  it('explains that a roll-up cannot be used as a filter', async () => {
    const res = await run(accountPrisma(), {
      viz: 'table',
      columns: ['annual_revenue'],
      filters: [{ field: 'opportunities.amount', op: 'gt', value: 100 }],
    });
    expect(res.meta.warnings.join(' ')).toMatch(/cannot be used as a filter/i);
  });

  it('does not let a roll-up condition silently narrow the query', async () => {
    const prisma = accountPrisma();
    await run(prisma, {
      viz: 'table',
      columns: ['annual_revenue'],
      filters: [{ field: 'opportunities.amount', op: 'gt', value: 100 }],
    });
    expect(prisma.crmAccount.findMany.mock.calls[0][0].where).toEqual({});
  });

  it('degrades gracefully when the child delegate is unavailable', async () => {
    const prisma = accountPrisma();
    delete prisma.crmOpportunity;
    const res = await run(prisma, { viz: 'table', columns: ['annual_revenue', 'opportunities.$count'] });
    expect(res.meta.warnings.join(' ')).toMatch(/unavailable/i);
    expect(res.rows).toHaveLength(3);
  });

  it('offers no pick-list for related or roll-up fields', async () => {
    const svc = new ReportService(accountPrisma());
    expect(await svc.getFieldValues('accounts', 'owner.branch.branch_name')).toEqual([]);
    expect(await svc.getFieldValues('accounts', 'opportunities.amount')).toEqual([]);
  });

  it('drills down through a two-hop dimension', async () => {
    const prisma = accountPrisma();
    await new ReportService(prisma).runDrilldown(
      { source: 'accounts', group_by: [{ field: 'owner.region.region_name' }] },
      { 'owner.region.region_name': 'West' },
      { scope: 'all' },
    );
    // AND[0] is the report's own (here empty) filter; the replayed bucket follows it.
    const { where } = prisma.crmAccount.findMany.mock.calls[0][0];
    expect(where.AND).toContainEqual({ owner: { region: { region_name: 'West' } } });
  });
});
