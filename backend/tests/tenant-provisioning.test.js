'use strict';

/**
 * Tenant provisioning.
 *
 * The interesting behaviour is the metadata clone: it has to rewrite every
 * foreign key as it copies, drop rows whose parent did not come across, and
 * refuse to run twice. Those are exactly the things a hand-written clone gets
 * wrong, and getting them wrong here means a new tenant whose forms point at
 * another tenant's fields — a cross-tenant data leak dressed as a setup bug.
 *
 * The Prisma double below is deliberately dumb: tables of rows, auto-increment
 * ids, `where` support for the handful of shapes the service actually uses. It
 * is enough to prove the id remapping, and it needs no database.
 */

const TenantProvisioningService = require('../src/services/platform/tenant-provisioning.service');
const { CLONE_PLAN, TENANT_ROLE_SEED, STEPS, keyOf, SLUG_RE, EMPLOYEE_ID_RE } = TenantProvisioningService;
const { BUILTIN_ROLE_LEVEL } = require('../src/middleware/authenticate');
const { getTenantId } = require('../src/middleware/tenant-scope');

// ── A minimal in-memory Prisma ───────────────────────────────────────────────

/** Does `row` satisfy this (very small) subset of Prisma `where` syntax? */
function matches(row, where = {}) {
  return Object.entries(where).every(([key, cond]) => {
    if (key === 'OR') return cond.some((c) => matches(row, c));
    if (cond !== null && typeof cond === 'object' && !(cond instanceof Date)) {
      if ('in' in cond)  return cond.in.includes(row[key]);
      if ('not' in cond) return row[key] !== cond.not;
    }
    return row[key] === cond;
  });
}

function project(row, select) {
  if (!select) return { ...row };
  return Object.fromEntries(Object.keys(select).filter((k) => select[k]).map((k) => [k, row[k]]));
}

function fakePrisma(seed = {}) {
  const tables = new Map();
  const nextId = new Map();
  // `id` is the pk for everything the clone touches; the org tables differ.
  const PK = { region: 'region_id', branch: 'branch_id', employee: 'employee_id' };

  const table = (model) => {
    if (!tables.has(model)) tables.set(model, []);
    return tables.get(model);
  };
  for (const [model, rows] of Object.entries(seed)) tables.set(model, rows.map((r) => ({ ...r })));

  const assignId = (model, row) => {
    const pk = PK[model] ?? 'id';
    if (row[pk] != null) return row;
    const n = (nextId.get(model) ?? 0) + 1;
    nextId.set(model, n);
    return { ...row, [pk]: n };
  };
  // Seeded rows must not have their ids reused by later inserts.
  for (const [model, rows] of tables) {
    const pk = PK[model] ?? 'id';
    const max = Math.max(0, ...rows.map((r) => (typeof r[pk] === 'number' ? r[pk] : 0)));
    nextId.set(model, max);
  }

  /** model.op names whose next call should throw, for the failure-path test. */
  const faults = new Map();

  const handler = {
    get(target, model) {
      if (model === '$transaction') return (fn) => fn(client);  // same store, no rollback
      // Pass the test-only handles straight through; only model names are
      // synthesised below.
      if (typeof model !== 'string' || model.startsWith('$') || model.startsWith('__')) {
        return target[model];
      }
      const guard = (op, fn) => async (...args) => {
        if (faults.get(`${model}.${op}`)) throw new Error(faults.get(`${model}.${op}`));
        return fn(...args);
      };
      return {
        findMany: guard('findMany', async ({ where, select } = {}) => table(model).filter((r) => matches(r, where)).map((r) => project(r, select))),
        findFirst: guard('findFirst', async ({ where, select } = {}) => {
          const hit = table(model).find((r) => matches(r, where));
          return hit ? project(hit, select) : null;
        }),
        findUnique: guard('findUnique', async ({ where, select } = {}) => {
          const hit = table(model).find((r) => matches(r, where));
          return hit ? project(hit, select) : null;
        }),
        count: guard('count', async ({ where } = {}) => table(model).filter((r) => matches(r, where)).length),
        create: guard('create', async ({ data, select }) => {
          const row = assignId(model, data);
          table(model).push(row);
          return project(row, select);
        }),
        createMany: guard('createMany', async ({ data }) => {
          for (const d of data) table(model).push(assignId(model, d));
          return { count: data.length };
        }),
      };
    },
  };
  const base = {
    __tables: tables,
    /** Make `model.op` throw `message` on every call. */
    __fail: (key, message) => faults.set(key, message),
  };
  const client = new Proxy(base, handler);
  return client;
}

// ── A template tenant worth cloning ──────────────────────────────────────────

const TEMPLATE = 1;
const NEW = 2;

/**
 * Two modules, two objects, three fields, a form that lays out two of them, a
 * validation, a pipeline with stages, and a permission row per entity type —
 * enough to exercise every remap shape in the plan.
 */
function templateSeed() {
  return {
    tenant: [
      { id: TEMPLATE, name: 'Template Co', slug: 'genesis-capital', industry: 'technology', status: 'active' },
      { id: NEW, name: 'Acme Corp', slug: 'acme-corp', industry: 'technology', status: 'active' },
    ],
    uiModule: [
      { id: 10, name: 'crm', label: 'CRM', category: 'crm', order_index: 1, is_active: true, tenant_id: TEMPLATE },
      { id: 11, name: 'service', label: 'Service', category: 'crm', order_index: 2, is_active: true, tenant_id: TEMPLATE },
    ],
    uiObject: [
      { id: 20, module_id: 10, name: 'lead', label: 'Lead', order_index: 1, is_active: true, tenant_id: TEMPLATE },
      { id: 21, module_id: 11, name: 'case', label: 'Case', order_index: 1, is_active: true, tenant_id: TEMPLATE },
    ],
    uiField: [
      { id: 30, object_id: 20, name: 'full_name', label: 'Full name', field_type: 'text', data_type: 'string', tenant_id: TEMPLATE },
      { id: 31, object_id: 20, name: 'email', label: 'Email', field_type: 'email', data_type: 'string', tenant_id: TEMPLATE },
      { id: 32, object_id: 21, name: 'case_no', label: 'Case no', field_type: 'text', data_type: 'string', tenant_id: TEMPLATE },
    ],
    uiForm: [
      { id: 40, object_id: 20, name: 'lead_create', label: 'New lead', form_type: 'create', columns: 2, tenant_id: TEMPLATE },
    ],
    uiFormFieldLayout: [
      { id: 50, form_id: 40, field_id: 30, row: 1, col: 1, col_span: 1, order_index: 1, is_visible: true, tenant_id: TEMPLATE },
      { id: 51, form_id: 40, field_id: 31, row: 1, col: 2, col_span: 1, order_index: 2, is_visible: true, tenant_id: TEMPLATE },
    ],
    uiValidation: [
      { id: 60, field_id: 31, validation_type: 'email', error_message: 'Not an email', order_index: 1, tenant_id: TEMPLATE },
    ],
    uiFieldDependency: [
      { id: 65, source_field_id: 30, target_field_id: 31, condition_type: 'not_empty', action_type: 'show', tenant_id: TEMPLATE },
    ],
    uiPage: [
      { id: 70, object_id: 20, name: 'lead_list', label: 'Leads', page_type: 'list', is_active: true, tenant_id: TEMPLATE },
    ],
    uiPipeline: [
      { id: 80, object_id: 20, name: 'lead_pipeline', label: 'Lead pipeline', is_active: true, tenant_id: TEMPLATE },
    ],
    uiPipelineStage: [
      { id: 90, pipeline_id: 80, name: 'new', label: 'New', color: 'blue', order_index: 1, tenant_id: TEMPLATE },
      { id: 91, pipeline_id: 80, name: 'won', label: 'Won', color: 'green', order_index: 2, tenant_id: TEMPLATE },
    ],
    uiWizard: [
      { id: 100, object_id: 20, name: 'lead_wizard', label: 'Capture lead', is_active: true, tenant_id: TEMPLATE },
    ],
    uiWizardStep: [
      { id: 110, wizard_id: 100, form_id: 40, name: 'details', label: 'Details', order_index: 1, tenant_id: TEMPLATE },
    ],
    uiDocumentCategory: [
      { id: 120, code: 'id_proof', label: 'ID proof', review_required: true, is_required: true, color: 'blue', order_index: 1, is_active: true, tenant_id: TEMPLATE },
    ],
    uiDocumentChecklist: [
      { id: 130, entity_type: 'account', label: 'New account', items: [], is_active: true, order_index: 1, tenant_id: TEMPLATE },
    ],
    operationalPermission: [
      { id: 140, entity_type: 'task', role_name: 'manager', tenant_id: TEMPLATE },
    ],
    uiPermission: [
      { id: 150, entity_type: 'module', entity_id: 10, role_name: 'user', can_view: true, can_edit: false, tenant_id: TEMPLATE },
      { id: 151, entity_type: 'field',  entity_id: 32, role_name: 'user', can_view: false, can_edit: false, tenant_id: TEMPLATE },
      // An entity type the plan cannot remap — must be dropped, not copied with
      // the template tenant's id still on it.
      { id: 152, entity_type: 'workflow', entity_id: 999, role_name: 'user', can_view: true, can_edit: true, tenant_id: TEMPLATE },
    ],
    leadScoringRule: [
      { id: 160, name: 'Has email', field_name: 'email', operator: 'not_empty', points: 5, rule_type: 'demographic', is_active: true, order_index: 1, created_by: 'TPL_ADMIN', tenant_id: TEMPLATE },
    ],
    role: [], region: [], branch: [], employee: [], employeeHierarchy: [],
    uiWorkflow: [], uiDashboard: [], slaPolicy: [], emailTemplate: [],
  };
}

/** Provision only the steps the fake client can service (no code installers). */
const CLONE_STEPS = ['roles', 'org', 'metadata'];

function svcFor(seed = templateSeed()) {
  const db = fakePrisma(seed);
  return { db, svc: new TenantProvisioningService(db) };
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('the clone plan', () => {
  it('lists parents before the rows that point at them', () => {
    const seen = new Set();
    for (const spec of CLONE_PLAN) {
      for (const parent of Object.values(spec.remap ?? {})) {
        expect(seen.has(parent)).toBe(true); // else the remap has nothing to read
      }
      for (const parent of Object.values(spec.polymorphic?.byType ?? {})) {
        expect(seen.has(parent)).toBe(true);
      }
      if (spec.key) seen.add(spec.model);
    }
  });

  it('gives every model something later steps can key off, or nothing points at it', () => {
    const pointedAt = new Set(CLONE_PLAN.flatMap((s) => [
      ...Object.values(s.remap ?? {}),
      ...Object.values(s.polymorphic?.byType ?? {}),
    ]));
    for (const spec of CLONE_PLAN) {
      if (pointedAt.has(spec.model)) expect(spec.key?.length).toBeGreaterThan(0);
    }
  });

  it('never copies business data', () => {
    const models = CLONE_PLAN.map((s) => s.model);
    for (const forbidden of ['record', 'crmLead', 'crmContact', 'crmOpportunity', 'document', 'employee', 'customReport']) {
      expect(models).not.toContain(forbidden);
    }
  });
});

describe('keyOf', () => {
  it('is stable and distinguishes rows that differ in any key column', () => {
    expect(keyOf({ object_id: 1, name: 'a' }, ['object_id', 'name'])).toBe(keyOf({ object_id: 1, name: 'a', extra: 9 }, ['object_id', 'name']));
    expect(keyOf({ object_id: 1, name: 'a' }, ['object_id', 'name'])).not.toBe(keyOf({ object_id: 2, name: 'a' }, ['object_id', 'name']));
  });

  it('treats null and missing alike rather than throwing', () => {
    expect(keyOf({ a: null }, ['a'])).toBe(keyOf({}, ['a']));
  });
});

describe('role seeding', () => {
  it('never mints a platform_admin row per tenant', () => {
    expect(TENANT_ROLE_SEED.map((r) => r.name)).not.toContain('platform_admin');
    for (const r of TENANT_ROLE_SEED) expect(r.level).toBeGreaterThanOrEqual(BUILTIN_ROLE_LEVEL.super_admin);
  });

  it('creates the ladder for a tenant that has none', async () => {
    const { db, svc } = svcFor();
    const result = await svc.provision(NEW, { only: ['roles'] });
    expect(result.steps[0].status).toBe('done');
    const roles = db.__tables.get('role').filter((r) => r.tenant_id === NEW);
    expect(roles.map((r) => r.name).sort()).toEqual(TENANT_ROLE_SEED.map((r) => r.name).sort());
    expect(roles.every((r) => r.is_active)).toBe(true);
  });

  it('tops up a partial ladder without duplicating what is there', async () => {
    const seed = templateSeed();
    seed.role = [{ id: 1, name: 'super_admin', label: 'SA', level: 2, is_active: true, tenant_id: NEW }];
    const { db, svc } = svcFor(seed);
    await svc.provision(NEW, { only: ['roles'] });
    const names = db.__tables.get('role').filter((r) => r.tenant_id === NEW).map((r) => r.name);
    expect(names).toHaveLength(TENANT_ROLE_SEED.length);
    expect(names.filter((n) => n === 'super_admin')).toHaveLength(1);
  });

  it('skips a tenant that already has the full ladder', async () => {
    const { svc } = svcFor();
    await svc.provision(NEW, { only: ['roles'] });
    const again = await svc.provision(NEW, { only: ['roles'] });
    expect(again.steps[0].status).toBe('skipped');
  });
});

describe('org units', () => {
  it('creates a region and office whose codes cannot collide across tenants', async () => {
    const { db, svc } = svcFor();
    await svc.provision(NEW, { only: ['org'] });
    const [region] = db.__tables.get('region').filter((r) => r.tenant_id === NEW);
    const [branch] = db.__tables.get('branch').filter((b) => b.tenant_id === NEW);
    // `regions.region_code` / `branches.branch_code` are unique platform-wide,
    // so the codes have to carry the tenant id or tenant #2 fails to provision.
    expect(region.region_code).toContain(String(NEW));
    expect(branch.branch_code).toContain(String(NEW));
    expect(branch.region_id).toBe(region.region_id);
  });

  it('is idempotent', async () => {
    const { db, svc } = svcFor();
    await svc.provision(NEW, { only: ['org'] });
    const again = await svc.provision(NEW, { only: ['org'] });
    expect(again.steps[0].status).toBe('skipped');
    expect(db.__tables.get('branch').filter((b) => b.tenant_id === NEW)).toHaveLength(1);
  });
});

describe('metadata clone', () => {
  let db;
  let rows;

  beforeAll(async () => {
    const fixture = svcFor();
    db = fixture.db;
    await fixture.svc.provision(NEW, { only: ['metadata'], templateTenantId: TEMPLATE });
    rows = (model) => db.__tables.get(model).filter((r) => r.tenant_id === NEW);
  });

  it('copies the metadata tables into the new tenant', () => {
    expect(rows('uiModule')).toHaveLength(2);
    expect(rows('uiObject')).toHaveLength(2);
    expect(rows('uiField')).toHaveLength(3);
    expect(rows('uiForm')).toHaveLength(1);
    expect(rows('uiPipelineStage')).toHaveLength(2);
  });

  it('stamps every copied row with the new tenant', () => {
    for (const spec of CLONE_PLAN) {
      for (const row of db.__tables.get(spec.model)) {
        expect([TEMPLATE, NEW]).toContain(row.tenant_id);
      }
    }
  });

  it('rewrites foreign keys to the new tenant rows, never the template ones', () => {
    const moduleIds = new Set(rows('uiModule').map((m) => m.id));
    const objectIds = new Set(rows('uiObject').map((o) => o.id));
    const fieldIds  = new Set(rows('uiField').map((f) => f.id));
    const formIds   = new Set(rows('uiForm').map((f) => f.id));

    for (const o of rows('uiObject')) expect(moduleIds.has(o.module_id)).toBe(true);
    for (const f of rows('uiField'))  expect(objectIds.has(f.object_id)).toBe(true);
    for (const l of rows('uiFormFieldLayout')) {
      expect(formIds.has(l.form_id)).toBe(true);
      expect(fieldIds.has(l.field_id)).toBe(true);
    }
    for (const v of rows('uiValidation')) expect(fieldIds.has(v.field_id)).toBe(true);
    for (const d of rows('uiFieldDependency')) {
      expect(fieldIds.has(d.source_field_id)).toBe(true);
      expect(fieldIds.has(d.target_field_id)).toBe(true);
    }
    for (const s of rows('uiWizardStep')) expect(formIds.has(s.form_id)).toBe(true);
  });

  it('keeps the shape of the graph, not just the row counts', () => {
    // The lead form must still lay out the lead object's own two fields.
    const leadObject = rows('uiObject').find((o) => o.name === 'lead');
    const form = rows('uiForm').find((f) => f.name === 'lead_create');
    const laidOut = rows('uiFormFieldLayout').filter((l) => l.form_id === form.id);
    const names = laidOut
      .map((l) => rows('uiField').find((f) => f.id === l.field_id))
      .map((f) => `${f.object_id === leadObject.id ? 'lead' : 'other'}.${f.name}`)
      .sort();
    expect(names).toEqual(['lead.email', 'lead.full_name']);
  });

  it('remaps the polymorphic permission rows and drops the ones it cannot place', () => {
    const perms = rows('uiPermission');
    expect(perms).toHaveLength(2); // the `workflow` row is dropped
    const modulePerm = perms.find((p) => p.entity_type === 'module');
    const fieldPerm  = perms.find((p) => p.entity_type === 'field');
    expect(rows('uiModule').map((m) => m.id)).toContain(modulePerm.entity_id);
    expect(rows('uiField').map((f) => f.id)).toContain(fieldPerm.entity_id);
    expect(perms.map((p) => p.entity_type)).not.toContain('workflow');
  });

  it('clears the columns that name a template-tenant employee', () => {
    expect(rows('leadScoringRule')[0].created_by).toBeNull();
  });

  it('leaves the template tenant untouched', () => {
    const template = templateSeed();
    for (const spec of CLONE_PLAN) {
      const before = template[spec.model] ?? [];
      const after = db.__tables.get(spec.model).filter((r) => r.tenant_id === TEMPLATE);
      expect(after).toHaveLength(before.length);
    }
  });
});

describe('metadata clone — guards', () => {
  it('refuses to run a second time rather than duplicating everything', async () => {
    const { db, svc } = svcFor();
    await svc.provision(NEW, { only: ['metadata'], templateTenantId: TEMPLATE });
    const first = db.__tables.get('uiField').filter((f) => f.tenant_id === NEW).length;

    const again = await svc.provision(NEW, { only: ['metadata'], templateTenantId: TEMPLATE });
    expect(again.steps[0].status).toBe('skipped');
    expect(db.__tables.get('uiField').filter((f) => f.tenant_id === NEW)).toHaveLength(first);
  });

  it('skips rather than fails when there is no template to copy', async () => {
    const seed = templateSeed();
    for (const spec of CLONE_PLAN) seed[spec.model] = [];
    seed.tenant = [{ id: NEW, name: 'Acme', slug: 'acme', status: 'active' }];
    const { svc } = svcFor(seed);
    const result = await svc.provision(NEW, { only: ['metadata'] });
    expect(result.steps[0].status).toBe('skipped');
    expect(result.steps[0].detail).toMatch(/no template tenant/i);
    expect(result.ok).toBe(true);
  });

  it('refuses to clone a tenant onto itself', async () => {
    const { svc } = svcFor();
    const result = await svc.provision(TEMPLATE, { only: ['metadata'], templateTenantId: TEMPLATE });
    expect(result.steps[0].status).toBe('skipped');
  });

  it('runs unscoped so it can read one tenant and write another', async () => {
    // If the tenant-scope extension were active the clone's explicit
    // `tenant_id` filters would be ANDed with the ambient tenant and it would
    // copy nothing — or, worse, write rows under the wrong tenant.
    const seen = [];
    const { svc } = svcFor();
    const original = svc.resolveTemplateTenantId.bind(svc);
    svc.resolveTemplateTenantId = async (...args) => { seen.push(getTenantId()); return original(...args); };
    await svc.provision(NEW, { only: ['metadata'], templateTenantId: TEMPLATE });
    expect(seen).toEqual([null]);
  });
});

describe('provision — step selection and reporting', () => {
  it('rejects an unknown step instead of silently doing nothing', async () => {
    const { svc } = svcFor();
    await expect(svc.provision(NEW, { only: ['nope'] })).rejects.toThrow(/Unknown provisioning step/);
  });

  it('rejects a tenant that does not exist', async () => {
    const { svc } = svcFor();
    await expect(svc.provision(9999, { only: ['roles'] })).rejects.toThrow(/not found/i);
  });

  it('skips the admin step unless an admin was supplied', async () => {
    const { svc } = svcFor();
    const result = await svc.provision(NEW, { only: ['roles', 'admin'] });
    expect(result.steps.map((s) => s.key)).toEqual(['roles']);
  });

  it('reports every step in dependency order with a status and a duration', async () => {
    const { svc } = svcFor();
    const result = await svc.provision(NEW, { only: CLONE_STEPS, templateTenantId: TEMPLATE });
    expect(result.steps.map((s) => s.key)).toEqual(CLONE_STEPS);
    for (const step of result.steps) {
      expect(['done', 'skipped', 'failed']).toContain(step.status);
      expect(typeof step.ms).toBe('number');
      expect(step.title).toBeTruthy();
    }
    expect(result.ok).toBe(true);
  });

  it('records a failing step and carries on with the rest', async () => {
    const { db, svc } = svcFor();
    db.__fail('role.createMany', 'deadlock'); // break the first step only
    const result = await svc.provision(NEW, { only: ['roles', 'org'], templateTenantId: TEMPLATE });
    expect(result.ok).toBe(false);
    expect(result.steps.find((s) => s.key === 'roles')).toMatchObject({ status: 'failed', detail: 'deadlock' });
    expect(result.steps.find((s) => s.key === 'org').status).toBe('done');
  });
});

describe('the first administrator', () => {
  const admin = { employee_id: 'ACME_ADM', employee_name: 'Ada Lovelace', email: 'ada@acme.test', password: 'correct horse battery' };

  it('is created as a super_admin with a hierarchy self-row', async () => {
    const { db, svc } = svcFor();
    const result = await svc.provision(NEW, { only: ['roles', 'org', 'admin'], admin });
    expect(result.ok).toBe(true);

    const [emp] = db.__tables.get('employee');
    expect(emp).toMatchObject({ employee_id: 'ACME_ADM', role: 'super_admin', tenant_id: NEW });
    expect(emp.password).not.toBe(admin.password); // hashed
    expect(emp.branch_id).not.toBeNull();          // filed under the office just created
    const hierarchy = db.__tables.get('employeeHierarchy');
    expect(hierarchy).toHaveLength(1);
    expect(hierarchy[0]).toMatchObject({ ancestor_id: 'ACME_ADM', descendant_id: 'ACME_ADM', depth: 0, tenant_id: NEW });
    expect(result.admin.password).toBeUndefined(); // never echoed back
  });

  it('rejects a weak password and a malformed id', async () => {
    const { svc } = svcFor();
    const bad = async (patch) => {
      const r = await svc.provision(NEW, { only: ['admin'], admin: { ...admin, ...patch } });
      return r.steps[0];
    };
    expect((await bad({ password: 'short' }))).toMatchObject({ status: 'failed', detail: expect.stringMatching(/8 characters/) });
    expect((await bad({ employee_id: 'a b' }))).toMatchObject({ status: 'failed', detail: expect.stringMatching(/employee_id/) });
    expect((await bad({ employee_name: '  ' }))).toMatchObject({ status: 'failed', detail: expect.stringMatching(/employee_name/) });
  });

  it('reports a platform-wide id clash as a conflict, not a constraint error', async () => {
    const seed = templateSeed();
    seed.employee = [{ employee_id: 'ACME_ADM', employee_name: 'Someone else', role: 'user', tenant_id: 7 }];
    const { svc } = svcFor(seed);
    const result = await svc.provision(NEW, { only: ['admin'], admin });
    expect(result.steps[0]).toMatchObject({ status: 'failed', detail: expect.stringMatching(/unique across the platform/i) });
  });

  it('leaves an existing admin alone', async () => {
    const seed = templateSeed();
    seed.employee = [{ employee_id: 'EXISTING', employee_name: 'Incumbent', role: 'super_admin', tenant_id: NEW }];
    const { db, svc } = svcFor(seed);
    const result = await svc.provision(NEW, { only: ['admin'], admin });
    expect(result.steps[0]).toMatchObject({ status: 'skipped', detail: expect.stringMatching(/EXISTING/) });
    expect(db.__tables.get('employee')).toHaveLength(1);
  });
});

describe('availability probes', () => {
  it('accepts a free slug and rejects a malformed one', async () => {
    const { svc } = svcFor();
    expect(await svc.checkSlug('brand-new-co')).toMatchObject({ available: true });
    expect(await svc.checkSlug('No Spaces')).toMatchObject({ available: false });
    expect(await svc.checkSlug('-leading')).toMatchObject({ available: false });
    expect(await svc.checkSlug('ab')).toMatchObject({ available: false });
  });

  it('suggests a free variant when the slug is taken', async () => {
    const { svc } = svcFor();
    const result = await svc.checkSlug('acme-corp');
    expect(result.available).toBe(false);
    expect(SLUG_RE.test(result.suggestion)).toBe(true);
    expect(await svc.checkSlug(result.suggestion)).toMatchObject({ available: true });
  });

  it('reports a free admin id and email', async () => {
    const { svc } = svcFor();
    const result = await svc.checkAdminIdentity({ employee_id: 'ACME_ADM', email: 'ada@acme.test', slug: 'acme-corp' });
    expect(result.employee_id).toMatchObject({ available: true });
    expect(result.email).toMatchObject({ available: true });
  });

  it('suggests a workspace-prefixed id when one is taken', async () => {
    const seed = templateSeed();
    seed.employee = [{ employee_id: 'ADMIN001', employee_name: 'Taken', role: 'user', tenant_id: TEMPLATE }];
    const { svc } = svcFor(seed);
    const result = await svc.checkAdminIdentity({ employee_id: 'ADMIN001', slug: 'acme-corp' });
    expect(result.employee_id.available).toBe(false);
    expect(EMPLOYEE_ID_RE.test(result.employee_id.suggestion)).toBe(true);
    expect(result.employee_id.suggestion).not.toBe('ADMIN001');
  });

  it('flags a malformed employee id without touching the database', async () => {
    const { svc } = svcFor();
    const result = await svc.checkAdminIdentity({ employee_id: 'no-lowercase!' });
    expect(result.employee_id).toMatchObject({ available: false, reason: expect.stringMatching(/A-Z/) });
  });
});

describe('readiness', () => {
  it('reports a bare tenant as not ready and lists every missing step', async () => {
    const { svc } = svcFor();
    const r = await svc.readiness(NEW);
    expect(r.ready).toBe(false);
    expect(r.usable).toBe(false);
    expect(r.missing).toEqual(STEPS.map((s) => s.key));
    expect(r.completed).toBe(0);
    expect(r.total).toBe(STEPS.length);
  });

  it('counts only this tenant, never the template', async () => {
    const { svc } = svcFor();
    const r = await svc.readiness(NEW);
    expect(r.steps.find((s) => s.key === 'metadata').done).toBe(false);
    const t = await svc.readiness(TEMPLATE);
    expect(t.steps.find((s) => s.key === 'metadata').done).toBe(true);
  });

  it('calls a tenant usable once roles, metadata and an admin are in place', async () => {
    const { svc } = svcFor();
    await svc.provision(NEW, {
      only:  ['roles', 'org', 'metadata', 'admin'],
      templateTenantId: TEMPLATE,
      admin: { employee_id: 'ACME_ADM', employee_name: 'Ada', password: 'correct horse battery' },
    });
    const r = await svc.readiness(NEW);
    expect(r.usable).toBe(true);
    // Dashboards, automation, SLA and templates still outstanding.
    expect(r.ready).toBe(false);
    expect(r.missing).toEqual(expect.arrayContaining(['dashboards', 'workflows', 'sla']));
  });

  it('rejects a tenant that does not exist', async () => {
    const { svc } = svcFor();
    await expect(svc.readiness(9999)).rejects.toThrow(/not found/i);
  });
});

describe('template resolution', () => {
  it('prefers the explicit id', async () => {
    const { svc } = svcFor();
    expect(await svc.resolveTemplateTenantId(TEMPLATE)).toBe(TEMPLATE);
  });

  it('rejects an explicit id that does not exist', async () => {
    const { svc } = svcFor();
    await expect(svc.resolveTemplateTenantId(4242)).rejects.toThrow(/not found/i);
  });

  it('falls back to the conventional slug', async () => {
    const { svc } = svcFor();
    expect(await svc.resolveTemplateTenantId(undefined, NEW)).toBe(TEMPLATE);
  });

  it('falls back to any tenant that has metadata when the slug is gone', async () => {
    const seed = templateSeed();
    seed.tenant = seed.tenant.map((t) => (t.id === TEMPLATE ? { ...t, slug: 'renamed-demo' } : t));
    const { svc } = svcFor(seed);
    expect(await svc.resolveTemplateTenantId(undefined, NEW)).toBe(TEMPLATE);
  });

  it('never nominates the tenant being provisioned', async () => {
    const seed = templateSeed();
    seed.tenant = [{ id: NEW, name: 'Acme', slug: 'genesis-capital', status: 'active' }];
    for (const spec of CLONE_PLAN) seed[spec.model] = [];
    const { svc } = svcFor(seed);
    expect(await svc.resolveTemplateTenantId(undefined, NEW)).toBeNull();
  });
});
