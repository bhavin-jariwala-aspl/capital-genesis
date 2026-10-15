'use strict';

const { RecordCompute } = require('../src/services/record-compute');
const { evaluate } = require('../src/services/formula');
const DashboardService = require('../src/services/dashboard.service');
const AuthService = require('../src/services/auth.service');

describe('LABEL() formula function', () => {
  // Object 1 (service_request) has a picklist and a lookup to object 2 (party), which has its own picklist.
  const fields = {
    '1:request_type': { options: [{ value: 'statement_request', label: 'Statement request' }, { value: 'complaint', label: 'Complaint' }], config: {} },
    '1:party': { options: null, config: { target_object: 'party' } },
    '2:segment': { options: [{ value: 'hnw', label: 'High net worth' }], config: {} },
  };
  const db = {
    uiObject: { findFirst: async ({ where }) => (where.name === 'party' ? { id: 2 } : null) },
    uiField: { findFirst: async ({ where }) => fields[`${where.object_id}:${where.name}`] ?? null },
    recordFieldValue: { findUnique: async () => null },
  };
  const compute = new RecordCompute(db, async (id) => (id === 7 ? { segment: 'hnw', display_name: 'Danielle Emamally' } : null));

  it('returns the option label of a picklist field', async () => {
    const values = { request_type: 'statement_request', party: 7 };
    const ctx = compute.context(values, null, 1);
    expect(await evaluate("CONCAT(LABEL(request_type), ' · ', party.display_name)", ctx)).toBe('Statement request · Danielle Emamally');
  });

  it('follows a lookup to the target object', async () => {
    const ctx = compute.context({ party: 7 }, null, 1);
    expect(await evaluate('LABEL(party.segment)', ctx)).toBe('High net worth');
  });

  it('falls back to the stored value, and stays blank when blank', async () => {
    expect(await evaluate('LABEL(request_type)', compute.context({ request_type: 'unknown_code' }, null, 1))).toBe('unknown_code');
    expect(await evaluate('LABEL(request_type)', compute.context({}, null, 1))).toBeNull();
    // Without a field context (plain evaluate) it degrades to the value.
    expect(await evaluate('LABEL(x)', { values: { x: 'abc' } })).toBe('abc');
  });

  it('is applied when formulas are computed for an object', async () => {
    const values = { request_type: 'complaint', party: 7 };
    await compute.applyFormulas(1, values, null, [{ name: 'name', config: { expression: "CONCAT(LABEL(request_type), ' · ', party.display_name)" } }]);
    expect(values.name).toBe('Complaint · Danielle Emamally');
  });
});

describe('home dashboard by role', () => {
  it('parses "role:dashboard" pairs', () => {
    expect(DashboardService.parseHomeMap('rm:genesis_rm_workbench, coo : genesis_group_executive,,bad')).toEqual({
      rm: 'genesis_rm_workbench', coo: 'genesis_group_executive',
    });
    expect(DashboardService.parseHomeMap(null)).toEqual({});
  });

  it('reads the workspace setting for the role', async () => {
    const svc = Object.create(DashboardService.prototype);
    svc.db = { tenantConfig: { findUnique: async () => ({ config_value: 'rm:genesis_rm_workbench' }) } };
    expect(await svc.homeDashboardName(7, 'rm')).toBe('genesis_rm_workbench');
    expect(await svc.homeDashboardName(7, 'trader')).toBeNull();
  });
});

describe('GET /auth/me profile', () => {
  it('never returns secrets and includes the role label', async () => {
    const emp = {
      employee_id: 'GCRM1', employee_name: 'Priya Ramdin', role: 'rm', email: 'rm1@x.demo', tenant_id: 7, is_active: true,
      password: 'hash', mfa_secret: 'SECRET', mfa_recovery: ['a'], reset_token: 'tok', reset_token_expires: new Date(), mfa_enabled: true,
    };
    const db = {
      employee: { findUnique: async () => emp },
      role: { findFirst: async ({ where }) => (where.tenant_id === 7 ? { label: 'Relationship Manager' } : null) },
    };
    const svc = new AuthService(db, { sign: () => 't' });
    const p = await svc.getProfile('GCRM1');
    for (const k of ['password', 'mfa_secret', 'mfa_recovery', 'reset_token', 'reset_token_expires']) expect(p).not.toHaveProperty(k);
    expect(p.role_label).toBe('Relationship Manager');
    expect(p.mfa_enabled).toBe(true);
  });
});
