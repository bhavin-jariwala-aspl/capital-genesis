'use strict';

/**
 * GET /api/runtime/bootstrap reads all metadata in batched queries (one per
 * kind) instead of several queries per object and per form. The payload must
 * be exactly what the per-object version returned — checked here against that
 * version (kept below as `legacyBootstrap`) on a fixture with hidden objects,
 * hidden fields, several pipelines, forms and wizards.
 */

jest.mock('../src/middleware/authenticate', () => {
  const actual = jest.requireActual('../src/middleware/authenticate');
  return {
    ...actual,
    authenticate: async (req) => { req.user = JSON.parse(req.headers['x-test-user']); },
  };
});

const Fastify = require('fastify');
const runtimeRoutes = require('../src/routes/runtime/index');
const MetadataService = require('../src/services/metadata.service');
const DashboardService = require('../src/services/dashboard.service');
const PermissionService = require('../src/services/permission.service');
const CacheService = require('../src/services/cache.service');

// ── Fixture ────────────────────────────────────────────────────────────────
const field = (id, object_id, name, order_index) => ({ id, object_id, name, label: name, field_type: 'text', is_active: true, order_index, config: {} });
const mod = { id: 1, name: 'lending', label: 'Lending', is_active: true, order_index: 0 };
const objects = [
  { id: 10, module_id: 1, name: 'loan', label: 'Loan', is_active: true, order_index: 0, fields: [field(100, 10, 'amount', 0), field(101, 10, 'secret', 1), field(102, 10, 'tenure', 2)] },
  { id: 11, module_id: 1, name: 'party', label: 'Party', is_active: true, order_index: 1, fields: [field(110, 11, 'name', 0)] },
  { id: 12, module_id: 1, name: 'hidden_obj', label: 'Hidden', is_active: true, order_index: 2, fields: [field(120, 12, 'x', 0)] },
  { id: 13, module_id: 1, name: 'no_pipeline', label: 'No pipeline', is_active: true, order_index: 3, fields: [] },
];
const stagesOf = { 1: [{ id: 3, pipeline_id: 1, name: 'b', order_index: 1 }, { id: 2, pipeline_id: 1, name: 'a', order_index: 0 }], 2: [{ id: 5, pipeline_id: 2, name: 'p', order_index: 0 }], 3: [] };
const pipelines = [
  { id: 1, object_id: 10, name: 'loan_flow', is_active: true, created_at: new Date('2026-01-01') },
  { id: 3, object_id: 10, name: 'loan_flow_2', is_active: true, created_at: new Date('2026-01-03') },
  { id: 2, object_id: 11, name: 'party_flow', is_active: true, created_at: new Date('2026-01-02') },
];
const forms = [
  { id: 21, object_id: 10, name: 'loan_b', is_active: true, created_at: new Date('2026-02-02') },
  { id: 20, object_id: 10, name: 'loan_a', is_active: true, created_at: new Date('2026-02-01') },
  { id: 22, object_id: 11, name: 'party', is_active: true, created_at: new Date('2026-02-03') },
  { id: 23, object_id: 12, name: 'hidden', is_active: true, created_at: new Date('2026-02-04') },
];
const wizards = [
  { id: 31, object_id: 10, name: 'loan_wiz2', is_active: true },
  { id: 30, object_id: 10, name: 'loan_wiz', is_active: true },
  { id: 32, object_id: 11, name: 'party_wiz', is_active: true },
];
const perms = [
  { entity_type: 'object', entity_id: 12, role_name: 'rm', tenant_id: 7, can_view: false, can_edit: false },
  { entity_type: 'object', entity_id: 10, role_name: 'rm', tenant_id: 7, can_view: true, can_edit: true },
  { entity_type: 'field', entity_id: 101, role_name: 'rm', tenant_id: 7, can_view: false, can_edit: false },
  { entity_type: 'field', entity_id: 102, role_name: 'rm', tenant_id: 7, can_view: true, can_edit: false },
  { entity_type: 'wizard', entity_id: 31, role_name: 'rm', tenant_id: 7, can_view: false, can_edit: false },
];

const inIds = (v, x) => (v && typeof v === 'object' && 'in' in v ? v.in.includes(x) : v === undefined || v === x);
const pipelineFull = (p) => ({
  ...p,
  stages: [...stagesOf[p.id]].sort((a, b) => a.order_index - b.order_index),
  object: { ...objects.find((o) => o.id === p.object_id), fields: undefined, module: mod },
});
const sortBy = (rows, orderBy) => {
  const keys = [].concat(orderBy ?? []).flatMap((o) => Object.entries(o));
  return [...rows].sort((a, b) => {
    for (const [k, dir] of keys) {
      const d = (a[k] > b[k] ? 1 : a[k] < b[k] ? -1 : 0) * (dir === 'desc' ? -1 : 1);
      if (d) return d;
    }
    return 0;
  });
};

function makePrisma() {
  const calls = {};
  const track = (name, fn) => async (args) => { calls[name] = (calls[name] ?? 0) + 1; return fn(args ?? {}); };
  const prisma = {
    uiModule: { findMany: track('uiModule.findMany', async () => [{ ...mod, objects: objects.map(({ fields: _f, ...o }) => o) }]) },
    uiObject: {
      findUnique: track('uiObject.findUnique', async ({ where }) => {
        const o = objects.find((x) => x.id === where.id);
        return o ? { ...o, module: mod } : null;
      }),
    },
    uiPermission: {
      findUnique: track('uiPermission.findUnique', async ({ where }) => {
        const k = where.entity_type_entity_id_role_name_tenant_id;
        return perms.find((p) => p.entity_type === k.entity_type && p.entity_id === k.entity_id && p.role_name === k.role_name && p.tenant_id === k.tenant_id) ?? null;
      }),
      findMany: track('uiPermission.findMany', async ({ where }) => perms.filter((p) => p.entity_type === where.entity_type
        && p.role_name === where.role_name && inIds(where.entity_id, p.entity_id) && (where.tenant_id === undefined || p.tenant_id === where.tenant_id))),
    },
    uiPipeline: {
      findMany: track('uiPipeline.findMany', async ({ where = {}, orderBy }) => sortBy(pipelines.filter((p) => inIds(where.object_id, p.object_id) && inIds(where.id, p.id)), orderBy).map(pipelineFull)),
      findUnique: track('uiPipeline.findUnique', async ({ where }) => { const p = pipelines.find((x) => x.id === where.id); return p ? pipelineFull(p) : null; }),
    },
    uiPipelineStage: {
      findFirst: track('uiPipelineStage.findFirst', async ({ where }) => { const s = sortBy(stagesOf[where.pipeline_id] ?? [], { order_index: 'asc' })[0]; return s ? { id: s.id } : null; }),
      findMany: track('uiPipelineStage.findMany', async ({ where, orderBy }) => sortBy(Object.values(stagesOf).flat().filter((s) => inIds(where.pipeline_id, s.pipeline_id)), orderBy).map((s) => ({ id: s.id, pipeline_id: s.pipeline_id }))),
    },
    uiForm: {
      findMany: track('uiForm.findMany', async ({ where, orderBy }) => sortBy(forms.filter((f) => inIds(where.object_id, f.object_id) && f.is_active), orderBy)),
      findUnique: track('uiForm.findUnique', async ({ where }) => {
        const f = forms.find((x) => x.id === where.id);
        if (!f) return null;
        const obj = objects.find((o) => o.id === f.object_id);
        return { ...f, object: obj, field_layouts: obj.fields.map((fl, i) => ({ id: f.id * 100 + i, form_id: f.id, field_id: fl.id, row: i, col: 0, order_index: i, field: { ...fl, validations: [], dependencies_as_source: [], dependencies_as_target: [] } })) };
      }),
    },
    uiWizard: {
      // No orderBy: MySQL returns the lowest id (primary-key order), as the batched read does.
      findFirst: track('uiWizard.findFirst', async ({ where }) => { const w = sortBy(wizards, { id: 'asc' }).find((x) => x.object_id === where.object_id && x.is_active); return w ? { id: w.id } : null; }),
      findMany: track('uiWizard.findMany', async ({ where = {}, orderBy, select }) => {
        const rows = sortBy(wizards.filter((w) => inIds(where.object_id, w.object_id) && w.is_active), orderBy);
        if (select) return rows.map((w) => ({ id: w.id, object_id: w.object_id }));
        return rows.map((w) => ({ ...w, steps: [], object: { ...objects.find((o) => o.id === w.object_id), module: mod } }));
      }),
      findUnique: track('uiWizard.findUnique', async ({ where }) => { const w = wizards.find((x) => x.id === where.id); return w ? { ...w, steps: [], object: { ...objects.find((o) => o.id === w.object_id), module: mod } } : null; }),
    },
    role: { findFirst: track('role.findFirst', async ({ where }) => ({ admin: { level: 3 }, rm: { level: 5 } })[where.name] ?? null) },
    tenant: { findUnique: async () => ({ plan: 'enterprise' }) },
  };
  return { prisma, calls };
}

/** The per-object bootstrap this route used before batching (payload reference). */
async function legacyBootstrap(prisma, user) {
  const cache = new CacheService(null);
  const meta = new MetadataService(prisma, cache);
  const dashSvc = new DashboardService(prisma, cache);
  const permSvc = new PermissionService(prisma);
  const roleName = user.role; const tenantId = user.tenant_id;
  const filteredModules = await permSvc.filterMetadataByRole(await meta.getModules(), 'module', roleName, tenantId);
  const modules = await Promise.all(filteredModules.map(async (m) => ({ ...m, objects: await permSvc.filterMetadataByRole(m.objects || [], 'object', roleName, tenantId) })));
  const objectIds = modules.flatMap((m) => (m.objects || []).map((o) => o.id));
  const objs = {}; const resolvedNames = {};
  await Promise.all(objectIds.map(async (objId) => {
    const obj = await meta.getObject(objId);
    const objPerm = await permSvc.getEffectiveUiPermission('object', objId, roleName, tenantId);
    if (!objPerm.can_view) return;
    const filteredFields = await permSvc.filterMetadataByRole(obj.fields || [], 'field', roleName, tenantId);
    const pls = await dashSvc.getPipelines(objId);
    const fms = await meta.getForms(objId);
    objs[objId] = { ...obj, fields: filteredFields, pipelines: pls, forms: fms, _can_edit: objPerm.can_edit };
    if (obj.name) {
      const pipeline = pls[0];
      const firstStage = pipeline ? await prisma.uiPipelineStage.findFirst({ where: { pipeline_id: pipeline.id }, orderBy: { order_index: 'asc' }, select: { id: true } }) : null;
      const wizard = await prisma.uiWizard.findFirst({ where: { object_id: objId, is_active: true }, select: { id: true } });
      resolvedNames[obj.name] = { object_id: objId, module_id: obj.module_id, first_stage_id: firstStage?.id ?? null, pipeline_id: pipeline?.id ?? null, wizard_id: wizard?.id ?? null };
    }
  }));
  const formsOut = {};
  const formIds = new Set(Object.values(objs).flatMap((o) => (o.forms || []).map((f) => f.id)));
  await Promise.all([...formIds].map(async (formId) => {
    const form = await meta.getFormForViewer(formId, roleName);
    const deps = await meta.getDependenciesForForm(formId);
    if (form) formsOut[formId] = { ...form, dependencies: deps };
  }));
  const wizardsOut = {};
  for (const wiz of await permSvc.filterMetadataByRole(await dashSvc.getWizards(), 'wizard', roleName, tenantId)) wizardsOut[wiz.id] = await dashSvc.getWizard(wiz.id);
  const pipelinesMap = {};
  for (const obj of Object.values(objs)) for (const p of (obj.pipelines || [])) if (!pipelinesMap[p.id]) pipelinesMap[p.id] = await dashSvc.getPipeline(p.id);
  return { modules, objects: objs, forms: formsOut, wizards: wizardsOut, pipelines: pipelinesMap, resolvedNames };
}

async function callRoute(prisma, user) {
  const app = Fastify();
  app.decorate('prisma', prisma);
  app.decorate('redis', null);
  app.decorate('eventBus', { emit: () => {}, on: () => {} });
  app.decorate('workflowEngine', {});
  app.decorate('entitlementService', { enabledKeys: async () => ['analytics_forecast'] });
  await app.register(runtimeRoutes, { prefix: '/api/runtime' });
  const res = await app.inject({ method: 'GET', url: '/api/runtime/bootstrap', headers: { 'x-test-user': JSON.stringify(user) } });
  await app.close();
  expect(res.statusCode).toBe(200);
  return JSON.parse(res.body).data;
}

const json = (x) => JSON.parse(JSON.stringify(x));

describe('runtime bootstrap — batched, same payload', () => {
  for (const user of [
    { employee_id: 'RM1', role: 'rm', role_level: 5, tenant_id: 7 },
    { employee_id: 'ADM', role: 'admin', role_level: 3, tenant_id: 7 },
  ]) {
    it(`returns exactly the per-object payload (${user.role})`, async () => {
      const legacy = await legacyBootstrap(makePrisma().prisma, user);
      const { prisma, calls } = makePrisma();
      const body = await callRoute(prisma, user);
      const { entitlements, ...rest } = body;
      expect(rest).toEqual(json(legacy));
      expect(entitlements).toEqual({ plan: 'enterprise', features: ['analytics_forecast'] });
      // One query per kind, not one per object / form / wizard / pipeline.
      expect(calls['uiForm.findMany']).toBe(1);
      expect(calls['uiWizard.findFirst']).toBeUndefined();
      expect(calls['uiPipelineStage.findFirst']).toBeUndefined();
      expect(calls['uiPipeline.findUnique']).toBeUndefined();
      expect(calls['uiWizard.findUnique']).toBeUndefined();
      expect(calls['uiPermission.findUnique']).toBeUndefined();
    });
  }

  it('hides what the role may not see', async () => {
    const body = await callRoute(makePrisma().prisma, { employee_id: 'RM1', role: 'rm', role_level: 5, tenant_id: 7 });
    expect(Object.keys(body.objects)).toEqual(['10', '11', '13']);
    expect(body.objects[10].fields.map((f) => f.name)).toEqual(['amount', 'tenure']);
    expect(body.objects[10]._can_edit).toBe(true);
    expect(body.objects[11]._can_edit).toBe(false);
    expect(body.resolvedNames.loan).toEqual({ object_id: 10, module_id: 1, first_stage_id: 2, pipeline_id: 1, wizard_id: 30 });
    expect(body.resolvedNames.no_pipeline).toEqual({ object_id: 13, module_id: 1, first_stage_id: null, pipeline_id: null, wizard_id: null });
    expect(Object.keys(body.wizards)).toEqual(['30', '32']);
    expect(body.forms[20].field_layouts.map((fl) => fl.field.name)).toEqual(['amount', 'tenure']);
    expect(body.forms[20].field_layouts[1].field.config.always_disabled).toBe(true);
    expect(body.forms[23]).toBeUndefined();
  });
});
