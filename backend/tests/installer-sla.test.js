'use strict';

jest.mock('@prisma/client');

const VerticalInstaller = require('../src/services/vertical-installer.service');

/**
 * A pack's SLA policy that changed is updated in place: recreating it used to
 * delete the policy, which cascades to its live timers (sla_instances), so a
 * reinstall restarted every open record's clock.
 */
function fakeDb(existingPolicies) {
  const calls = [];
  const model = (name, overrides = {}) => new Proxy({}, {
    get: (_, method) => overrides[method] ?? (async (args) => {
      calls.push({ model: name, method, args });
      if (method === 'findMany') return [];
      if (method === 'count') return 0;
      if (method === 'create' || method === 'update' || method === 'upsert') return { id: 99, ...(args?.data ?? {}) };
      if (method === 'createMany' || method === 'deleteMany' || method === 'updateMany') return { count: 0 };
      return null;
    }),
  });
  const db = new Proxy({}, {
    get: (_, name) => {
      if (name === '$transaction') return async (x) => (Array.isArray(x) ? Promise.all(x) : x(db));
      if (name === 'slaPolicy') {
        return model('slaPolicy', {
          findMany: async () => existingPolicies,
          update: async (args) => { calls.push({ model: 'slaPolicy', method: 'update', args }); return { id: args.where.id }; },
          create: async (args) => { calls.push({ model: 'slaPolicy', method: 'create', args }); return { id: 500 }; },
          deleteMany: async (args) => { calls.push({ model: 'slaPolicy', method: 'deleteMany', args }); return { count: 1 }; },
        });
      }
      if (typeof name !== 'string' || name.startsWith('$')) return undefined;
      return model(name);
    },
  });
  return { db, calls };
}

const policy = { name: 'Enquiry — speed to lead', object: 'enquiry', config: {}, targets: [{ metric: 'first_response', minutes: 240 }, { metric: 'resolution', minutes: 4800 }] };

async function installSla(existing) {
  const { db, calls } = fakeDb(existing);
  const inst = new VerticalInstaller(db, { tenantId: 7 });
  inst.ids.object.enquiry = 163;
  await inst.install({ slaPolicies: [policy] }).catch((e) => { throw e; });
  return calls.filter((c) => c.model.startsWith('sla'));
}

describe('installer — SLA policies', () => {
  it('updates a changed policy in place, keeping its id (and so its timers)', async () => {
    const existing = [{ id: 47, name: policy.name, entity_type: 'record', object_id: 163, config: {}, conditions: [], pause_statuses: [], business_hours_id: null, order_index: 0, is_active: true, description: null,
      targets: [{ metric: 'first_response', priority: '*', target_minutes: 120, warning_pct: 75 }], escalations: [] }];
    const calls = await installSla(existing);
    expect(calls.find((c) => c.model === 'slaPolicy' && c.method === 'update')?.args.where.id).toBe(47);
    expect(calls.some((c) => c.model === 'slaPolicy' && (c.method === 'create' || c.method === 'deleteMany'))).toBe(false);
    const targets = calls.find((c) => c.model === 'slaTarget' && c.method === 'createMany');
    expect(targets.args.data.every((t) => t.policy_id === 47)).toBe(true);
    expect(calls.some((c) => c.model === 'slaTarget' && c.method === 'deleteMany' && c.args.where.policy_id === 47)).toBe(true);
  });

  it('creates a policy that does not exist yet', async () => {
    const calls = await installSla([]);
    expect(calls.some((c) => c.model === 'slaPolicy' && c.method === 'create')).toBe(true);
  });
});

describe('installer — SLA windows for demo realism', () => {
  it('takes the shortest first-response and resolution target per object', () => {
    const w = VerticalInstaller.slaWindows([
      policy,
      { name: 'Other', object: 'enquiry', targets: [{ metric: 'resolution', minutes: 2400 }] },
      { name: 'Loans', object: 'loan_application', targets: [{ metric: 'resolution', minutes: 9600 }] },
    ]);
    expect(w.get('enquiry')).toEqual({ first: 240, resolution: 2400 });
    expect(w.get('loan_application')).toEqual({ first: null, resolution: 9600 });
    expect(w.has('party')).toBe(false);
  });
});
