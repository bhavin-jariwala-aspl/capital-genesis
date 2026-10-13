'use strict';

/**
 * Feature entitlements — plan, flag, override.
 *
 * Before this existed, `subscription_plans.features` held free text nothing
 * read and `feature_flags.name` held a disjoint set, so "does this customer
 * have feature X?" had no answer. The tests that matter are about the
 * *resolution order*, because getting it wrong in either direction is a real
 * commercial bug: too permissive gives away paid functionality, too strict
 * makes the operator's escape hatch useless.
 */

const EntitlementService = require('../src/services/platform/entitlement.service');
const { SOURCE, invalidate } = EntitlementService;
const SubscriptionService = require('../src/services/platform/subscription.service');
const FeatureFlagService = require('../src/services/platform/feature-flag.service');
const C = require('../src/services/platform/feature-catalogue');

// ── Fixtures ────────────────────────────────────────────────────────────────

/**
 * A Prisma double covering only what the entitlement engine asks for.
 * `flags` and `overrides` are keyed by catalogue key for readability; the
 * double maps them onto the flag_id join the schema actually uses.
 */
function fakeDb({ tenants = [], plans = [], flags = {}, overrides = {} } = {}) {
  const flagRows = Object.entries(flags).map(([name, f], i) => ({
    id: i + 1, name, label: name, is_enabled: true, rollout_percent: 100, ...f,
  }));
  const flagByName = new Map(flagRows.map((f) => [f.name, f]));
  // An override needs a flag row to hang off, so create one on demand.
  const overrideRows = Object.entries(overrides).map(([name, is_enabled]) => {
    let flag = flagByName.get(name);
    if (!flag) {
      flag = { id: flagRows.length + 1, name, label: name, is_enabled: true, rollout_percent: 100 };
      flagRows.push(flag);
      flagByName.set(name, flag);
    }
    return { tenant_id: tenants[0]?.id, flag_id: flag.id, is_enabled, flag: { name } };
  });

  const writes = { overrides: [], deletes: [], flags: [] };
  const db = {
    tenant: {
      findUnique: async ({ where }) => tenants.find((t) => t.id === Number(where.id)) ?? null,
      groupBy: async () => [],
      count: async () => tenants.length,
    },
    subscriptionPlan: {
      findUnique: async ({ where }) => plans.find((p) => (where.name ? p.name === where.name : p.id === Number(where.id))) ?? null,
      findMany: async () => plans,
      create: async ({ data }) => ({ id: 99, ...data }),
      update: async ({ where, data }) => ({ ...plans.find((p) => p.id === Number(where.id)), ...data }),
      delete: async () => ({}),
    },
    featureFlag: {
      findMany: async () => flagRows.map((f) => ({ ...f })),
      findUnique: async ({ where }) => {
        const hit = where.name ? flagByName.get(where.name) : flagRows.find((f) => f.id === Number(where.id));
        return hit ? { ...hit } : null;
      },
      create: async ({ data }) => {
        const row = { id: flagRows.length + 1, rollout_percent: 100, is_enabled: true, ...data };
        flagRows.push(row); flagByName.set(row.name, row); writes.flags.push(data);
        return row;
      },
      update: async ({ where, data }) => {
        const row = flagRows.find((f) => f.id === Number(where.id));
        Object.assign(row, data);
        return { ...row };
      },
      delete: async ({ where }) => ({ id: Number(where.id) }),
    },
    tenantFeatureOverride: {
      findMany: async ({ where }) => overrideRows.filter((o) => o.tenant_id === Number(where.tenant_id)),
      upsert: async ({ where, create, update }) => {
        const key = where.tenant_id_flag_id;
        const existing = overrideRows.find((o) => o.tenant_id === key.tenant_id && o.flag_id === key.flag_id);
        const flagName = flagRows.find((f) => f.id === key.flag_id)?.name;
        if (existing) Object.assign(existing, update);
        else overrideRows.push({ ...create, flag: { name: flagName } });
        writes.overrides.push(create ?? update);
        return { ...(existing ?? create) };
      },
      deleteMany: async ({ where }) => {
        const before = overrideRows.length;
        for (let i = overrideRows.length - 1; i >= 0; i--) {
          const o = overrideRows[i];
          if (o.tenant_id === Number(where.tenant_id) && o.flag_id === Number(where.flag_id)) overrideRows.splice(i, 1);
        }
        writes.deletes.push(where);
        return { count: before - overrideRows.length };
      },
    },
  };
  return { db, writes, flagRows, overrideRows };
}

/** A tenant on `plan`, with the plan row carrying the catalogue default set. */
function setup({ plan = 'professional', id = 4, flags = {}, overrides = {}, planFeatures } = {}) {
  const fixture = fakeDb({
    tenants: [{ id, name: 'Acme', slug: 'acme', plan, status: 'active' }],
    plans: C.PLAN_TIERS.map((t, i) => ({
      id: i + 1, name: t.name, label: t.label,
      features: t.name === plan && planFeatures ? planFeatures : C.defaultFeaturesForPlan(t.name),
      max_users: 10, max_storage_mb: 1, max_api_calls: 1, max_records: 1, max_workflows: 1, max_dashboards: 1,
      price_monthly: 0, price_annual: 0, currency: 'USD', trial_days: 0, is_active: true, order_index: i,
    })),
    flags, overrides,
  });
  return { ...fixture, svc: new EntitlementService(fixture.db), id };
}

beforeEach(() => invalidate());

// ── The catalogue ───────────────────────────────────────────────────────────

describe('the feature catalogue', () => {
  it('has a unique, stable key per feature', () => {
    expect(new Set(C.FEATURE_KEYS).size).toBe(C.FEATURE_KEYS.length);
    for (const key of C.FEATURE_KEYS) expect(key).toMatch(/^[a-z][a-z0-9_]*$/);
  });

  it('places every feature in a declared group', () => {
    const groups = new Set(C.FEATURE_GROUPS.map((g) => g.key));
    for (const feature of C.FEATURES) expect(groups.has(feature.group)).toBe(true);
  });

  it('gives every feature a rankable min_plan', () => {
    for (const feature of C.FEATURES) expect(C.planRank(feature.min_plan)).toBeGreaterThanOrEqual(0);
  });

  it('makes each tier a strict superset of the one below', () => {
    // This is the property that stops the tiers becoming incoherent as features
    // are added, and it holds by construction because inclusion is a rank
    // comparison rather than four copied arrays.
    for (let i = 1; i < C.PLAN_TIERS.length; i++) {
      const lower = new Set(C.defaultFeaturesForPlan(C.PLAN_TIERS[i - 1].name));
      const upper = new Set(C.defaultFeaturesForPlan(C.PLAN_TIERS[i].name));
      for (const key of lower) expect(upper.has(key)).toBe(true);
      expect(upper.size).toBeGreaterThan(lower.size);
    }
  });

  it('includes core features in every tier, including the free one', () => {
    for (const tier of C.PLAN_TIERS) {
      const set = new Set(C.defaultFeaturesForPlan(tier.name));
      for (const key of C.CORE_FEATURE_KEYS) expect(set.has(key)).toBe(true);
    }
  });

  it('gives an unranked custom tier only the core features', () => {
    // We cannot guess where a bespoke tier sits, so it starts minimal and the
    // operator picks explicitly rather than silently inheriting Enterprise.
    expect(C.defaultFeaturesForPlan('bespoke')).toEqual([...C.CORE_FEATURE_KEYS]);
  });

  it('resolves legacy flag names to their catalogue key', () => {
    // Deployed `feature_flags` rows and existing call sites predate the
    // catalogue; they must keep working without a migration.
    expect(C.canonicalKey('underwriting_workflow')).toBe('ins_underwriting');
    expect(C.canonicalKey('ins_underwriting')).toBe('ins_underwriting');
    expect(C.canonicalKey('dark_mode')).toBeNull();
    for (const [legacy, key] of Object.entries(C.LEGACY_ALIASES)) {
      expect(C.FEATURE_KEYS).toContain(key);
      expect(C.FEATURE_KEYS).not.toContain(legacy);
    }
  });

  it('normalises a list by dropping unknowns, canonicalising and adding core', () => {
    expect(C.normaliseFeatureList(['underwriting_workflow', 'nonsense']))
      .toEqual(['crm_records', 'ins_underwriting']);
  });

  it('reports unknown keys for validation', () => {
    expect(C.unknownFeatureKeys(['ins_quoting', 'basic_crm'])).toEqual(['basic_crm']);
  });
});

// ── Resolution order ────────────────────────────────────────────────────────

describe('the plan decides what was sold', () => {
  it('enables a feature the plan includes', async () => {
    const { svc, id } = setup({ plan: 'professional' });
    const map = await svc.resolve(id);
    expect(map.ins_claims).toMatchObject({ enabled: true, source: SOURCE.PLAN, in_plan: true });
  });

  it('disables a feature above the plan, and says which tier it needs', async () => {
    const { svc, id } = setup({ plan: 'starter' });
    const map = await svc.resolve(id);
    expect(map.ins_claims).toMatchObject({ enabled: false, source: SOURCE.PLAN_EXCLUDED, in_plan: false });
    expect(map.ins_claims.reason).toMatch(/professional/);
  });

  it('gates the free tier down to the basics', async () => {
    const { svc, id } = setup({ plan: 'free' });
    const map = await svc.resolve(id);
    expect(map.crm_records.enabled).toBe(true);
    expect(map.ins_quoting.enabled).toBe(false);
    expect(map.gov_sso.enabled).toBe(false);
  });

  it('honours an explicitly curated plan list over the tier default', async () => {
    // An operator selling a bespoke bundle must be able to; the tier default is
    // a starting point, not a cage.
    const { svc, id } = setup({ plan: 'free', planFeatures: ['crm_records', 'gov_sso'] });
    const map = await svc.resolve(id);
    expect(map.gov_sso.enabled).toBe(true);
    expect(map.crm_pipelines.enabled).toBe(false);
  });

  it('falls back to the tier default when the plan row has no list', async () => {
    // Every plan created before the catalogue is in this state. Treating it as
    // "sells nothing" would break every existing tenant.
    const { db } = fakeDb({
      tenants: [{ id: 4, plan: 'professional' }],
      plans: [{ id: 1, name: 'professional', features: null }],
    });
    const map = await new EntitlementService(db).resolve(4);
    expect(map.ins_claims.enabled).toBe(true);
    expect(map.gov_sso.enabled).toBe(false);
  });

  it('turns everything but core off for a tenant that does not exist', async () => {
    const { svc } = setup();
    const map = await svc.resolve(9999);
    expect(map.crm_records.enabled).toBe(true);
    expect(map.ins_quoting.enabled).toBe(false);
    expect(map.ins_quoting.reason).toMatch(/not found/i);
  });

  it('is safe with no tenant in context', async () => {
    const { svc } = setup();
    for (const bad of [null, undefined, 0, 'x']) {
      const map = await svc.resolve(bad);
      expect(map.ins_quoting.enabled).toBe(false);
    }
  });
});

describe('a flag can withhold a sold feature, never grant an unsold one', () => {
  it('withholds a plan feature whose flag is globally off', async () => {
    const { svc, id } = setup({ plan: 'enterprise', flags: { ins_underwriting: { is_enabled: false, rollout_percent: 0 } } });
    const map = await svc.resolve(id);
    expect(map.ins_underwriting).toMatchObject({ enabled: false, source: SOURCE.FLAG_DISABLED, in_plan: true });
  });

  it('cannot grant a feature the plan excludes, however the flag is set', async () => {
    // The safety property: switching a flag on platform-wide must never hand
    // paid functionality to a free tenant.
    const { svc, id } = setup({
      plan: 'free',
      flags: { ins_underwriting: { is_enabled: true, rollout_percent: 100 } },
    });
    const map = await svc.resolve(id);
    expect(map.ins_underwriting).toMatchObject({ enabled: false, source: SOURCE.PLAN_EXCLUDED });
  });

  it('splits a partial rollout by tenant id and says which side we are on', async () => {
    const flags = { ins_underwriting: { is_enabled: true, rollout_percent: 50 } };
    const inCohort = setup({ id: 10, plan: 'enterprise', flags });   // 10 % 100 = 10 < 50
    const outside  = setup({ id: 70, plan: 'enterprise', flags });   // 70 % 100 = 70 >= 50

    const a = (await inCohort.svc.resolve(10)).ins_underwriting;
    invalidate();
    const b = (await outside.svc.resolve(70)).ins_underwriting;

    expect(a).toMatchObject({ enabled: true, source: SOURCE.FLAG_ROLLOUT });
    expect(a.reason).toMatch(/in the cohort/);
    expect(b).toMatchObject({ enabled: false, source: SOURCE.FLAG_ROLLOUT });
    expect(b.reason).toMatch(/outside the cohort/);
  });

  it('ignores a flag row whose name is not a catalogue feature', async () => {
    // `dark_mode` was such a row: it looked like a gate and gated nothing.
    const { svc, id } = setup({ plan: 'enterprise', flags: { dark_mode: { is_enabled: false, rollout_percent: 0 } } });
    const map = await svc.resolve(id);
    expect(map.dark_mode).toBeUndefined();
    expect(map.ins_underwriting.enabled).toBe(true);
  });

  it('leaves unflagged plan features alone', async () => {
    const { svc, id } = setup({ plan: 'professional' });
    const map = await svc.resolve(id);
    // ins_claims has no flag, so the plan is the whole answer.
    expect(map.ins_claims).toMatchObject({ enabled: true, source: SOURCE.PLAN });
  });
});

describe('a tenant override is the deliberate exception', () => {
  it('grants a feature the plan excludes — the pilot case', async () => {
    const { svc, id } = setup({ plan: 'starter', overrides: { ins_underwriting: true } });
    const map = await svc.resolve(id);
    expect(map.ins_underwriting).toMatchObject({
      enabled: true, source: SOURCE.TENANT_OVERRIDE, in_plan: false, override: true,
    });
    expect(map.ins_underwriting.reason).toMatch(/not in plan/i);
  });

  it('revokes a feature the plan includes', async () => {
    const { svc, id } = setup({ plan: 'enterprise', overrides: { ins_claims: false } });
    const map = await svc.resolve(id);
    expect(map.ins_claims).toMatchObject({ enabled: false, source: SOURCE.TENANT_OVERRIDE, in_plan: true });
  });

  it('beats a flag that is switched off platform-wide', async () => {
    const { svc, id } = setup({
      plan: 'enterprise',
      flags: { ins_underwriting: { is_enabled: false, rollout_percent: 0 } },
      overrides: { ins_underwriting: true },
    });
    const map = await svc.resolve(id);
    expect(map.ins_underwriting).toMatchObject({ enabled: true, source: SOURCE.TENANT_OVERRIDE });
  });

  it('beats being outside a rollout cohort', async () => {
    const { svc } = setup({
      id: 70, plan: 'enterprise',
      flags: { ins_underwriting: { is_enabled: true, rollout_percent: 50 } },
      overrides: { ins_underwriting: true },
    });
    const map = await svc.resolve(70);
    expect(map.ins_underwriting).toMatchObject({ enabled: true, source: SOURCE.TENANT_OVERRIDE });
  });
});

describe('core features', () => {
  it('are on regardless of plan, flag or override', async () => {
    const coreKey = C.CORE_FEATURE_KEYS[0];
    const { svc, id } = setup({
      plan: 'free',
      flags: { [coreKey]: { is_enabled: false, rollout_percent: 0 } },
      overrides: { [coreKey]: false },
    });
    const map = await svc.resolve(id);
    expect(map[coreKey]).toMatchObject({ enabled: true, source: SOURCE.CORE });
  });

  it('cannot be overridden through the API', async () => {
    const { svc, id } = setup();
    await expect(svc.setOverride(id, C.CORE_FEATURE_KEYS[0], false))
      .rejects.toThrow(/core product/i);
  });
});

describe('setOverride', () => {
  it('grants, then clears back to the plan answer', async () => {
    const { svc, id } = setup({ plan: 'starter' });
    expect((await svc.resolve(id)).ins_claims.enabled).toBe(false);

    const granted = await svc.setOverride(id, 'ins_claims', true, 'PLATFORM01');
    expect(granted).toMatchObject({ enabled: true, source: SOURCE.TENANT_OVERRIDE });

    const cleared = await svc.setOverride(id, 'ins_claims', null, 'PLATFORM01');
    expect(cleared).toMatchObject({ enabled: false, source: SOURCE.PLAN_EXCLUDED, override: null });
  });

  it('creates the flag row an override needs, fully enabled so it decides nothing', async () => {
    // The schema hangs an override off a flag_id, and most catalogue features
    // have no flag row. One created on demand must not change the answer for
    // any other tenant.
    const { svc, id, writes } = setup({ plan: 'professional' });
    await svc.setOverride(id, 'ins_claims', false, 'PLATFORM01');
    expect(writes.flags).toHaveLength(1);
    expect(writes.flags[0]).toMatchObject({ name: 'ins_claims', is_enabled: true, rollout_percent: 100 });
  });

  it('rejects an unknown feature and a non-boolean state', async () => {
    const { svc, id } = setup();
    await expect(svc.setOverride(id, 'nope', true)).rejects.toThrow(/Unknown feature/);
    await expect(svc.setOverride(id, 'ins_claims', 'yes')).rejects.toThrow(/true, false, or null/);
  });

  it('rejects a tenant that does not exist', async () => {
    const { svc } = setup();
    await expect(svc.setOverride(9999, 'ins_claims', true)).rejects.toThrow(/not found/i);
  });

  it('applies a group of changes in one call', async () => {
    const { svc, id } = setup({ plan: 'free' });
    const result = await svc.setOverrides(id, { ins_quoting: true, ins_claims: true }, 'PLATFORM01');
    expect(result.ins_quoting.enabled).toBe(true);
    expect(result.ins_claims.enabled).toBe(true);
  });

  it('rejects a bulk call naming an unknown feature, before writing anything', async () => {
    const { svc, id, writes } = setup();
    await expect(svc.setOverrides(id, { ins_quoting: true, bogus: true })).rejects.toThrow(/Unknown feature/);
    expect(writes.overrides).toHaveLength(0);
    await expect(svc.setOverrides(id, {})).rejects.toThrow(/No feature changes/);
  });
});

describe('memoisation', () => {
  it('resolves once per tenant per TTL rather than per query', async () => {
    const { db, svc, id } = setup();
    let reads = 0;
    const original = db.featureFlag.findMany;
    db.featureFlag.findMany = async (...args) => { reads++; return original(...args); };
    for (let i = 0; i < 5; i++) await svc.isEnabled('ins_claims', id);
    expect(reads).toBe(1);
  });

  it('re-resolves once invalidated, so a console change bites immediately', async () => {
    const { svc, id } = setup({ plan: 'starter' });
    expect(await svc.isEnabled('ins_claims', id)).toBe(false);
    await svc.setOverride(id, 'ins_claims', true);       // invalidates internally
    expect(await svc.isEnabled('ins_claims', id)).toBe(true);
  });

  it('keeps tenants in separate slots', async () => {
    const a = setup({ id: 4, plan: 'free' });
    const b = setup({ id: 5, plan: 'enterprise' });
    expect(await a.svc.isEnabled('gov_sso', 4)).toBe(false);
    expect(await b.svc.isEnabled('gov_sso', 5)).toBe(true);
  });

  it('has a TTL short enough to be operationally honest', () => {
    expect(EntitlementService.TTL_MS).toBeLessThanOrEqual(60_000);
  });
});

describe('isEnabled / enabledKeys', () => {
  it('answers a single feature', async () => {
    const { svc, id } = setup({ plan: 'professional' });
    expect(await svc.isEnabled('ins_claims', id)).toBe(true);
    expect(await svc.isEnabled('gov_sso', id)).toBe(false);
  });

  it('is false for a key the catalogue does not know', async () => {
    const { svc, id } = setup({ plan: 'enterprise' });
    expect(await svc.isEnabled('made_up', id)).toBe(false);
  });

  it('lists the enabled keys in catalogue order', async () => {
    const { svc, id } = setup({ plan: 'starter' });
    const keys = await svc.enabledKeys(id);
    expect(keys).toEqual(C.FEATURE_KEYS.filter((k) => keys.includes(k)));
    expect(keys).toContain('ins_quoting');
    expect(keys).not.toContain('gov_sso');
  });
});

describe('FeatureFlagService.isEnabled — the existing call sites', () => {
  it('resolves the legacy underwriting flag name through the plan', async () => {
    // `routes/insurance` and `routes/runtime` call isEnabled('underwriting_workflow').
    // They were plan-blind; they now inherit the plan gate unchanged.
    const pro = setup({ id: 4, plan: 'professional' });
    expect(await new FeatureFlagService(pro.db).isEnabled('underwriting_workflow', 4)).toBe(true);

    invalidate();
    const free = setup({ id: 4, plan: 'free' });
    expect(await new FeatureFlagService(free.db).isEnabled('underwriting_workflow', 4)).toBe(false);
  });

  it('falls back to the flag row for a bespoke non-catalogue kill-switch', async () => {
    const { db } = fakeDb({
      tenants: [{ id: 4, plan: 'enterprise' }],
      plans: [{ id: 1, name: 'enterprise', features: C.defaultFeaturesForPlan('enterprise') }],
      flags: { maintenance_banner: { is_enabled: true, rollout_percent: 100 } },
    });
    expect(await new FeatureFlagService(db).isEnabled('maintenance_banner', 4)).toBe(true);
  });

  it('is false for a flag that does not exist at all', async () => {
    const { db } = fakeDb({ tenants: [{ id: 4, plan: 'free' }], plans: [] });
    expect(await new FeatureFlagService(db).isEnabled('absent', 4)).toBe(false);
  });
});

describe('tenantMatrix — the console view', () => {
  it('groups every catalogue feature with its resolved state and a summary', async () => {
    const { svc, id } = setup({ plan: 'starter', overrides: { ins_claims: true, crm_pipelines: false } });
    const matrix = await svc.tenantMatrix(id);

    expect(matrix.tenant).toMatchObject({ id, slug: 'acme' });
    expect(matrix.plan).toMatchObject({ name: 'starter' });
    expect(matrix.groups.map((g) => g.key)).toEqual(C.FEATURE_GROUPS.map((g) => g.key));

    const flat = matrix.groups.flatMap((g) => g.features);
    expect(flat).toHaveLength(C.FEATURE_KEYS.length);
    for (const f of flat) expect(f.state).toBeTruthy();

    expect(matrix.summary).toMatchObject({ total: C.FEATURE_KEYS.length, granted: 1, revoked: 1 });
    expect(matrix.summary.enabled).toBeGreaterThan(0);
  });

  it('tells each feature which tiers include it, so upsell is visible', async () => {
    const { svc, id } = setup({ plan: 'free' });
    const matrix = await svc.tenantMatrix(id);
    const sso = matrix.groups.flatMap((g) => g.features).find((f) => f.key === 'gov_sso');
    expect(sso.included_in).toEqual(['enterprise']);
    expect(sso.state.enabled).toBe(false);
  });

  it('rejects a tenant that does not exist', async () => {
    const { svc } = setup();
    await expect(svc.tenantMatrix(9999)).rejects.toThrow(/not found/i);
  });
});

// ── Plans ───────────────────────────────────────────────────────────────────

describe('SubscriptionService — plans own their feature list', () => {
  const planRows = () => C.PLAN_TIERS.map((t, i) => ({
    id: i + 1, name: t.name, label: t.label, features: C.defaultFeaturesForPlan(t.name),
    max_users: 5, price_monthly: 0, price_annual: 0, trial_days: 0, order_index: i, is_active: true,
  }));

  it('rejects a feature key outside the catalogue', async () => {
    // The old free-text column accepted 'basic_crm', which matched nothing.
    const { db } = fakeDb({ plans: planRows() });
    const svc = new SubscriptionService(db);
    await expect(svc.update(1, { features: ['basic_crm'] })).rejects.toThrow(/Unknown feature key/);
    await expect(svc.update(1, { features: 'nope' })).rejects.toThrow(/must be an array/);
  });

  it('accepts catalogue keys, canonicalises legacy names and re-adds core', async () => {
    const { db } = fakeDb({ plans: planRows() });
    const plan = await new SubscriptionService(db).update(1, { features: ['underwriting_workflow'] });
    expect(plan.features).toEqual(['crm_records', 'ins_underwriting']);
  });

  it('defaults a new plan to its tier feature set rather than nothing', async () => {
    const { db } = fakeDb({ plans: [] });
    const plan = await new SubscriptionService(db).create({ name: 'starter', label: 'Starter' });
    expect(plan.features).toEqual(C.defaultFeaturesForPlan('starter'));
  });

  it('refuses to rename a plan, because tenants reference the name', async () => {
    const { db } = fakeDb({ plans: planRows() });
    await expect(new SubscriptionService(db).update(1, { name: 'renamed' }))
      .rejects.toThrow(/cannot be changed/);
  });

  it('rejects nonsense limits and prices', async () => {
    const { db } = fakeDb({ plans: planRows() });
    const svc = new SubscriptionService(db);
    await expect(svc.update(1, { max_users: -1 })).rejects.toThrow(/non-negative/);
    await expect(svc.update(1, { max_users: 2.5 })).rejects.toThrow(/non-negative/);
    await expect(svc.update(1, { price_monthly: -5 })).rejects.toThrow(/zero or more/);
    await expect(svc.update(1, { trial_days: 400 })).rejects.toThrow(/between 0 and 365/);
  });

  it('requires a name and a label on create', async () => {
    const { db } = fakeDb({ plans: [] });
    const svc = new SubscriptionService(db);
    await expect(svc.create({ label: 'X' })).rejects.toThrow(/name is required/);
    await expect(svc.create({ name: 'x', label: '' })).rejects.toThrow(/label is required/);
  });

  it('fills in features for a plan row that has none', async () => {
    const { db } = fakeDb({ plans: [{ id: 1, name: 'professional', label: 'Pro', features: null }] });
    const [plan] = await new SubscriptionService(db).list();
    expect(plan.features).toEqual(C.defaultFeaturesForPlan('professional'));
    expect(plan.features_explicit).toBe(false);
  });

  it('builds a comparison grid of tiers against the catalogue', async () => {
    const { db } = fakeDb({ plans: planRows() });
    const cmp = await new SubscriptionService(db).compare();
    expect(cmp.plans.map((p) => p.name)).toEqual(C.PLAN_TIERS.map((t) => t.name));
    expect(cmp.groups.length).toBe(C.FEATURE_GROUPS.length);
    // Feature counts must climb with the tier.
    const counts = cmp.plans.map((p) => p.feature_count);
    expect([...counts].sort((a, b) => a - b)).toEqual(counts);
  });
});

// ── Pre-catalogue plan rows ─────────────────────────────────────────────────

describe('a plan row written before the catalogue existed', () => {
  /**
   * The exact strings the previous `prisma/seed.js` wrote into
   * `subscription_plans.features`. Not one is a catalogue key or a legacy
   * alias, so they normalise away entirely.
   */
  const LEGACY = {
    free:         ['basic_crm', 'email_templates'],
    starter:      ['basic_crm', 'email_templates', 'workflow_automation', 'pipeline_management', 'import_export'],
    professional: ['basic_crm', 'email_templates', 'workflow_automation', 'pipeline_management', 'import_export',
                   'api_access', 'reports', 'lead_scoring', 'forecasting'],
    enterprise:   ['basic_crm', 'email_templates', 'workflow_automation', 'pipeline_management', 'import_export',
                   'api_access', 'reports', 'lead_scoring', 'forecasting', 'custom_objects',
                   'advanced_security', 'sso', 'audit_logs', 'dedicated_support'],
  };

  it('is not mistaken for a curated list', () => {
    const curated = Object.fromEntries(
      Object.entries(LEGACY).map(([tier, list]) => [tier, C.hasCuratedFeatures(list)]),
    );
    expect(curated).toEqual({ free: false, starter: false, professional: false, enterprise: false });
    // The old rule was `stored.length > 0`, which every one of these passes —
    // which is exactly why it was the wrong rule.
    for (const list of Object.values(LEGACY)) expect(list.length).toBeGreaterThan(0);
  });

  it('falls back to the tier default rather than selling the core alone', async () => {
    // The regression: honouring the list made an Enterprise tenant entitled to
    // exactly one feature out of thirty-seven, which removed every insurance
    // module, the whole of the automation Builder, reports, SLA and documents.
    const resolved = {};
    const expected = {};
    for (const [tier, list] of Object.entries(LEGACY)) {
      invalidate();
      const { db } = fakeDb({
        tenants: [{ id: 4, plan: tier, status: 'active' }],
        plans: [{ id: 1, name: tier, features: list }],
      });
      resolved[tier] = await new EntitlementService(db).enabledKeys(4);
      expected[tier] = C.defaultFeaturesForPlan(tier);
    }
    expect(resolved).toEqual(expected);
    // Enterprise is the case that made the defect visible: one feature, not 37.
    expect(resolved.enterprise).toHaveLength(C.FEATURE_KEYS.length);
  });

  it('gives an Enterprise tenant every insurance feature again', async () => {
    const { db } = fakeDb({
      tenants: [{ id: 4, plan: 'enterprise', status: 'active' }],
      plans: [{ id: 1, name: 'enterprise', features: LEGACY.enterprise }],
    });
    const map = await new EntitlementService(db).resolve(4);
    const keys = ['ins_quoting', 'ins_policy_admin', 'ins_underwriting', 'ins_claims',
      'ins_commissions', 'auto_workflows', 'auto_sla', 'analytics_reports', 'docs_management', 'gov_sso'];
    const disabled = keys.filter((k) => !map[k].enabled);
    expect(disabled).toEqual([]);
  });

  it('still honours a genuinely curated list, including a deliberately narrow one', async () => {
    // One recognisable key means somebody edited the plan with the current
    // editor, and their intent wins — even when it sells less than the tier.
    const narrow = setup({ plan: 'enterprise', planFeatures: ['crm_records', 'ins_quoting'] });
    const map = await narrow.svc.resolve(narrow.id);
    expect(map.ins_quoting.enabled).toBe(true);
    expect(map.ins_claims.enabled).toBe(false);
  });

  it('honours a half-migrated list, since no legacy name collides with a key', async () => {
    invalidate();
    const { db } = fakeDb({
      tenants: [{ id: 4, plan: 'starter', status: 'active' }],
      plans: [{ id: 1, name: 'starter', features: ['basic_crm', 'ins_underwriting'] }],
    });
    const keys = await new EntitlementService(db).enabledKeys(4);
    expect(keys).toEqual(['crm_records', 'ins_underwriting']);
  });

  it('is reported as not explicit, so the console shows the tier-default badge', async () => {
    const { db } = fakeDb({
      plans: [
        { id: 1, name: 'enterprise', label: 'Enterprise', features: LEGACY.enterprise },
        { id: 2, name: 'starter', label: 'Starter', features: ['ins_quoting'] },
      ],
    });
    const [legacyPlan, curatedPlan] = await new SubscriptionService(db).list();
    expect(legacyPlan.features_explicit).toBe(false);
    expect(legacyPlan.features).toEqual(C.defaultFeaturesForPlan('enterprise'));
    expect(curatedPlan.features_explicit).toBe(true);
  });
});
