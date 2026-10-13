'use strict';

jest.mock('@prisma/client');

const ReportService = require('../src/services/report.service');
const { getField, allFields, relationSelect, rollupsFor, MAX_RELATION_HOPS } = require('../src/services/report-registry');

/**
 * The join model: curated multi-hop to-one paths, and parent→children roll-ups.
 *
 * The property that matters most here is the absence of **fan-out**. A
 * `policies ⋈ claims` join would count a policy's premium once per claim; these
 * tests pin the arithmetic that proves roll-ups do not.
 */

// ── fixtures ───────────────────────────────────────────────────────────────

const POLICIES = [
  { id: 1, premium_amount: 1200, status: 'active',
    agent: { employee_name: 'Ann', branch: { branch_name: 'HQ' }, region: { region_name: 'West' } },
    carrier: { name: 'Prudential' } },
  { id: 2, premium_amount: 800, status: 'active',
    agent: { employee_name: 'Bob', branch: { branch_name: 'NY' }, region: { region_name: 'East' } },
    carrier: { name: 'MetLife' } },
  { id: 3, premium_amount: 400, status: 'active',
    agent: { employee_name: 'Ann', branch: { branch_name: 'HQ' }, region: { region_name: 'West' } },
    carrier: { name: 'Prudential' } },
];

// Policy 1 has THREE claims — the fan-out trap.
const CLAIMS = [
  { policy_id: 1, paid_amount: 100 },
  { policy_id: 1, paid_amount: 150 },
  { policy_id: 1, paid_amount: 50 },
  { policy_id: 2, paid_amount: 700 },
];

function policyPrisma({ policies = POLICIES, claims = CLAIMS } = {}) {
  const claimGroupBy = jest.fn(async ({ by, where }) => {
    const ids = where[by[0]].in;
    const acc = new Map();
    for (const c of claims.filter((x) => ids.includes(x.policy_id))) {
      const g = acc.get(c.policy_id) ?? { policy_id: c.policy_id, _sum: { paid_amount: 0, amount: 0 }, _count: { _all: 0 } };
      g._sum.paid_amount += c.paid_amount;
      g._count._all += 1;
      acc.set(c.policy_id, g);
    }
    return [...acc.values()];
  });
  return {
    insurancePolicy: { findMany: jest.fn().mockResolvedValue(policies) },
    insuranceClaim: { groupBy: claimGroupBy },
    __claimGroupBy: claimGroupBy,
  };
}

const run = (prisma, config) =>
  new ReportService(prisma).run({ source: 'policies', ...config }, { scope: 'all' });

// ── Registry resolution ────────────────────────────────────────────────────

describe('multi-hop path resolution', () => {
  it('resolves a two-hop to-one path and labels it without a redundant leaf', () => {
    const f = getField('policies', 'agent.branch.branch_name');
    expect(f).toMatchObject({ kind: 'related', path: ['agent', 'branch'], leaf: 'branch_name' });
    // `primary` collapses "Agent ▸ Branch ▸ Name" to "Agent ▸ Branch".
    expect(f.label).toBe('Agent ▸ Branch');
  });

  it('keeps the leaf label at a single hop, so existing labels are unchanged', () => {
    expect(getField('policies', 'agent.employee_name').label).toBe('Agent ▸ Name');
  });

  it('unlocks loss-ratio-by-carrier, which one hop could not express', () => {
    expect(getField('claims', 'policy.carrier.name')).toMatchObject({ path: ['policy', 'carrier'] });
  });

  it('refuses a path deeper than the engine will resolve', () => {
    expect(MAX_RELATION_HOPS).toBe(2);
    expect(getField('policies', 'agent.branch.region.region_name')).toBeNull();
  });

  it('refuses an unknown hop rather than guessing', () => {
    expect(getField('policies', 'agent.nonsense.x')).toBeNull();
    expect(getField('policies', 'nonsense.employee_name')).toBeNull();
  });

  it('merges overlapping paths into one nested select', () => {
    expect(relationSelect('claims', ['policy.carrier.name', 'policy.product_type', 'adjuster.branch.branch_name']))
      .toEqual({
        policy: { select: { carrier: { select: { name: true } }, product_type: true } },
        adjuster: { select: { branch: { select: { branch_name: true } } } },
      });
  });

  it('offers territory by name and no longer by raw id', () => {
    const labels = allFields('policies').map((f) => f.label);
    expect(labels).toContain('Agent ▸ Branch');
    expect(labels).toContain('Agent ▸ Region');
    expect(labels).not.toContain('Agent ▸ Branch (id)');
  });

  it('still resolves the retired id fields, so saved reports keep running', () => {
    expect(getField('policies', 'agent.branch_id')).toMatchObject({ hidden: true, kind: 'related' });
  });
});

describe('roll-up resolution', () => {
  it('exposes a count and the declared aggregates as measures', () => {
    expect(getField('policies', 'claims.$count')).toMatchObject({
      kind: 'rollup', agg: true, group: false, filterable: false, label: 'Claims ▸ Number of',
    });
    expect(getField('policies', 'claims.paid_amount')).toMatchObject({
      kind: 'rollup', rollup: 'sum', type: 'currency', label: 'Claims ▸ Total paid',
    });
  });

  it('never offers a roll-up as a grouping', () => {
    const rollups = allFields('policies').filter((f) => f.kind === 'rollup');
    expect(rollups.length).toBeGreaterThan(0);
    expect(rollups.every((f) => f.group === false)).toBe(true);
  });

  it('collects the descriptors a config needs, keyed by collection', () => {
    const needed = rollupsFor('policies', ['claims.$count', 'claims.paid_amount', 'premium_amount']);
    expect([...needed.keys()]).toEqual(['claims']);
    expect(needed.get('claims').fields).toHaveLength(2);
  });
});

// ── Query construction ─────────────────────────────────────────────────────

describe('query construction', () => {
  it('nests a filter on a two-hop path all the way down', async () => {
    const prisma = policyPrisma();
    await run(prisma, {
      viz: 'table',
      filters: [{ field: 'agent.branch.branch_name', op: 'equals', value: 'HQ' }],
    });
    expect(prisma.insurancePolicy.findMany.mock.calls[0][0].where)
      .toEqual({ agent: { branch: { branch_name: 'HQ' } } });
  });

  it('selects only the nested columns the config touches', async () => {
    const prisma = policyPrisma();
    await run(prisma, {
      viz: 'bar',
      group_by: [{ field: 'agent.region.region_name' }],
      metrics: [{ agg: 'sum', field: 'premium_amount' }],
    });
    expect(prisma.insurancePolicy.findMany.mock.calls[0][0].select).toEqual({
      id: true,
      premium_amount: true,
      agent: { select: { region: { select: { region_name: true } } } },
    });
  });

  it('does not query the child table when no roll-up is referenced', async () => {
    const prisma = policyPrisma();
    await run(prisma, { viz: 'table', columns: ['premium_amount'] });
    expect(prisma.__claimGroupBy).not.toHaveBeenCalled();
  });

  it('reads children with one grouped aggregate keyed on the foreign key', async () => {
    const prisma = policyPrisma();
    await run(prisma, { viz: 'table', columns: ['premium_amount', 'claims.paid_amount'] });
    expect(prisma.__claimGroupBy).toHaveBeenCalledTimes(1);
    const args = prisma.__claimGroupBy.mock.calls[0][0];
    expect(args.by).toEqual(['policy_id']);
    expect(args.where).toEqual({ policy_id: { in: [1, 2, 3] } });
    expect(args._sum).toEqual({ paid_amount: true });
  });

  it('chunks the parent id list rather than emitting one enormous IN', async () => {
    const many = Array.from({ length: 2500 }, (_, i) => ({ id: i + 1, premium_amount: 1 }));
    const prisma = policyPrisma({ policies: many, claims: [] });
    await run(prisma, { viz: 'table', columns: ['premium_amount', 'claims.$count'] });
    expect(prisma.__claimGroupBy).toHaveBeenCalledTimes(3); // 1000 + 1000 + 500
    const sizes = prisma.__claimGroupBy.mock.calls.map((c) => c[0].where.policy_id.in.length);
    expect(sizes).toEqual([1000, 1000, 500]);
  });

  it('skips the child query entirely when the parent set is empty', async () => {
    const prisma = policyPrisma({ policies: [] });
    await run(prisma, { viz: 'table', columns: ['claims.$count'] });
    expect(prisma.__claimGroupBy).not.toHaveBeenCalled();
  });
});

// ── The arithmetic that proves there is no fan-out ─────────────────────────

describe('roll-ups do not inflate the parent measures', () => {
  it('counts a policy premium once, however many claims it has', async () => {
    const res = await run(policyPrisma(), {
      viz: 'table',
      group_by: [{ field: 'carrier.name' }],
      metrics: [
        { agg: 'sum', field: 'premium_amount', label: 'Premium' },
        { agg: 'sum', field: 'claims.paid_amount', label: 'Claims paid' },
      ],
      totals: true,
    });
    const prudential = res.rows.find((r) => r['carrier.name'] === 'Prudential');
    // Policy 1 (1200, three claims) + policy 3 (400, none). A join would give 1200×3 + 400 = 4000.
    expect(prudential.m0).toBe(1600);
    expect(prudential.m1).toBe(300);
    expect(res.summary.grand.m0).toBe(2400); // 1200 + 800 + 400, not 4000
  });

  it('computes a truthful loss ratio from the two sides', async () => {
    const res = await run(policyPrisma(), {
      viz: 'table',
      group_by: [{ field: 'carrier.name' }],
      metrics: [
        { agg: 'sum', field: 'premium_amount' },
        { agg: 'sum', field: 'claims.paid_amount' },
        { agg: 'formula', formula: { op: 'percent_of', a: 'm1', b: 'm0' } },
      ],
    });
    expect(res.rows.find((r) => r['carrier.name'] === 'Prudential').m2).toBeCloseTo(18.8, 1);
    expect(res.rows.find((r) => r['carrier.name'] === 'MetLife').m2).toBeCloseTo(87.5, 1);
  });

  it('reports zero — not null — for a parent with no children', async () => {
    const res = await run(policyPrisma(), {
      viz: 'table',
      columns: ['premium_amount', 'claims.$count', 'claims.paid_amount'],
    });
    const noClaims = res.rows.find((r) => r.premium_amount === 400);
    expect(noClaims['claims.$count']).toBe(0);
    expect(noClaims['claims.paid_amount']).toBe(0);
  });

  it('groups by a two-hop dimension and totals correctly', async () => {
    const res = await run(policyPrisma(), {
      viz: 'bar',
      group_by: [{ field: 'agent.region.region_name' }],
      metrics: [{ agg: 'sum', field: 'premium_amount' }],
      totals: true,
    });
    expect(res.columns[0].label).toBe('Agent ▸ Region');
    expect(Object.fromEntries(res.rows.map((r) => [r['agent.region.region_name'], r.m0])))
      .toEqual({ West: 1600, East: 800 });
    expect(res.summary.grand.m0).toBe(2400);
  });

  it('can average a roll-up across parents', async () => {
    const res = await run(policyPrisma(), {
      viz: 'kpi',
      metrics: [{ agg: 'avg', field: 'claims.$count', label: 'Claims per policy' }],
    });
    expect(res.rows[0].m0).toBeCloseTo(4 / 3, 2); // 3 + 1 + 0 claims over 3 policies
  });
});

// ── The public catalogue ───────────────────────────────────────────────────

describe('the field catalogue sent to the builder', () => {
  const sources = new ReportService({}).getSources();
  const policies = sources.find((s) => s.key === 'policies');

  it('never exposes how a value is reached', () => {
    // The resolved field carries the relation path and, for a roll-up, the child
    // Prisma model and foreign key. None of that is the browser's business.
    const json = JSON.stringify(sources);
    for (const internal of ['"model"', '"fk"', '"path"', '"leaf"', '"primary"', '"source"']) {
      expect(json).not.toContain(internal);
    }
  });

  it('still carries everything the builder needs to render a field', () => {
    const f = policies.fields.find((x) => x.key === 'claims.paid_amount');
    expect(f).toEqual({
      key: 'claims.paid_amount',
      label: 'Claims ▸ Total paid',
      type: 'currency',
      kind: 'rollup',
      agg: true,
      group: false,
      filterable: false,
      relation_label: 'Claims',
    });
  });

  it('advertises the relations and roll-up collections available', () => {
    expect(policies.relations.map((r) => r.via)).toContain('agent');
    expect(policies.rollups.map((r) => r.via)).toEqual(['claims', 'commissions', 'beneficiaries']);
  });

  it('omits retired fields from the catalogue', () => {
    expect(policies.fields.some((f) => f.key === 'agent.branch_id')).toBe(false);
  });
});

// ── Guard rails ────────────────────────────────────────────────────────────

describe('guard rails', () => {
  it('explains that a roll-up cannot be used as a filter', async () => {
    const res = await run(policyPrisma(), {
      viz: 'table',
      columns: ['premium_amount'],
      filters: [{ field: 'claims.paid_amount', op: 'gt', value: 100 }],
    });
    expect(res.meta.warnings.join(' ')).toMatch(/cannot be used as a filter/i);
  });

  it('does not let a roll-up condition silently narrow the query', async () => {
    const prisma = policyPrisma();
    await run(prisma, {
      viz: 'table',
      columns: ['premium_amount'],
      filters: [{ field: 'claims.paid_amount', op: 'gt', value: 100 }],
    });
    expect(prisma.insurancePolicy.findMany.mock.calls[0][0].where).toEqual({});
  });

  it('degrades gracefully when the child delegate is unavailable', async () => {
    const prisma = policyPrisma();
    delete prisma.insuranceClaim;
    const res = await run(prisma, { viz: 'table', columns: ['premium_amount', 'claims.$count'] });
    expect(res.meta.warnings.join(' ')).toMatch(/unavailable/i);
    expect(res.rows).toHaveLength(3);
  });

  it('offers no pick-list for related or roll-up fields', async () => {
    const svc = new ReportService(policyPrisma());
    expect(await svc.getFieldValues('policies', 'agent.branch.branch_name')).toEqual([]);
    expect(await svc.getFieldValues('policies', 'claims.paid_amount')).toEqual([]);
  });

  it('drills down through a two-hop dimension', async () => {
    const prisma = policyPrisma();
    await new ReportService(prisma).runDrilldown(
      { source: 'policies', group_by: [{ field: 'agent.region.region_name' }] },
      { 'agent.region.region_name': 'West' },
      { scope: 'all' },
    );
    // AND[0] is the report's own (here empty) filter; the replayed bucket follows it.
    const { where } = prisma.insurancePolicy.findMany.mock.calls[0][0];
    expect(where.AND).toContainEqual({ agent: { region: { region_name: 'West' } } });
  });
});
