'use strict';

const { authenticate, MANAGER_THRESHOLD } = require('../../middleware/authenticate');
const MetadataService        = require('../../services/metadata.service');
const DashboardService       = require('../../services/dashboard.service');
const RecordService          = require('../../services/record.service');
const CacheService           = require('../../services/cache.service');
const PermissionService      = require('../../services/permission.service');
const AssignmentService      = require('../../services/assignment.service');
const ForecastService        = require('../../services/forecast.service');
const ImportService          = require('../../services/import.service');
const CrmService             = require('../../services/crm.service');
const ProductService         = require('../../services/product.service');
const LeadScoringService     = require('../../services/lead-scoring.service');
const { ok }                 = require('../../utils/response');
// `@fastify/sensible` is not part of this deployment, so the `httpErrors`
// decorator does not exist: the `return ...badRequest(msg)` guards that used to
// stand here threw a TypeError and every missing-parameter request answered 500
// instead of 400. Throwing the app's own operational errors runs them through
// the error handler in app.js, which maps them properly.
const { ValidationError, NotFoundError } = require('../../utils/errors');
const EntitlementService = require('../../services/platform/entitlement.service');
const { FEATURE_KEYS } = require('../../services/platform/feature-catalogue');

/**
 * Copy a converted record's typed EAV values onto the record it became.
 *
 * Only fields the target object actually defines are copied, so conversion
 * works for any pair of objects without a hand-maintained field map; values
 * for fields the target lacks are left behind on the source. `client_since`
 * is stamped with today's date when the target defines it and nothing set it.
 */
async function copyEavToRecord(prisma, sourceRecordId, targetRecordId, tenantId) {
  const target = await prisma.record.findUnique({ where: { id: Number(targetRecordId) }, select: { object_id: true } });
  if (!target) return 0;
  const [sourceEav, fields] = await Promise.all([
    prisma.recordFieldValue.findMany({ where: { record_id: Number(sourceRecordId) } }),
    prisma.uiField.findMany({ where: { object_id: target.object_id, is_active: true }, select: { name: true } }),
  ]);
  const allowed = new Set(fields.map((f) => f.name));
  const rows = sourceEav
    .filter((r) => allowed.has(r.field_name))
    .map((r) => ({
      record_id: Number(targetRecordId), field_name: r.field_name,
      str_value: r.str_value, num_value: r.num_value, bool_value: r.bool_value,
      date_value: r.date_value, json_value: r.json_value, tenant_id: tenantId,
    }));
  if (allowed.has('client_since') && !rows.some((r) => r.field_name === 'client_since')) {
    rows.push({ record_id: Number(targetRecordId), field_name: 'client_since', str_value: new Date().toISOString().slice(0, 10), tenant_id: tenantId });
  }
  if (rows.length) await prisma.recordFieldValue.createMany({ data: rows, skipDuplicates: true });
  return rows.length;
}

/** The enabled feature keys for this request's tenant (all, for platform admins). */
async function entitledKeys(fastify, req) {
  const tenantId = req.user?.tenant_id;
  if (!tenantId || req.user?.role === 'platform_admin') return new Set(FEATURE_KEYS);
  const svc = fastify.entitlementService ?? (fastify.entitlementService = new EntitlementService(fastify.prisma));
  return new Set(await svc.enabledKeys(tenantId));
}

/**
 * A pipeline stage triggers lead/prospect conversion when it is explicitly
 * flagged in metadata (`config.is_conversion_stage`) or is the conventionally
 * named "converted" stage. The metadata flag lets a tenant rename or relocate
 * the conversion lane via the Builder without breaking the automation.
 */
function isConversionStage(stage) {
  if (!stage) return false;
  if (stage.config && stage.config.is_conversion_stage === true) return true;
  return stage.name === 'converted';
}

/**
 * Runtime routes — returns fully resolved metadata for the frontend runtime renderer.
 * These endpoints are heavily cached (Redis TTL = 1 hour).
 */
/** The plan name a tenant is on. The token carries only the tenant id. */
async function planOf(prisma, tenantId) {
  if (!tenantId || typeof prisma?.tenant?.findUnique !== 'function') return null;
  const t = await prisma.tenant.findUnique({ where: { id: Number(tenantId) }, select: { plan: true } }).catch(() => null);
  return t?.plan ?? null;
}

module.exports = async function runtimeRoutes(fastify) {
  const cache       = new CacheService(fastify.redis);
  const meta        = new MetadataService(fastify.prisma, cache);
  const dashSvc     = new DashboardService(fastify.prisma, cache);
  const wfEngine    = fastify.workflowEngine;
  const permSvc     = new PermissionService(fastify.prisma);
  const assignSvc   = new AssignmentService(fastify.prisma);
  const forecastSvc = new ForecastService(fastify.prisma);
  const importSvc   = new ImportService(fastify.prisma);
  const crmSvc      = new CrmService(fastify.prisma, fastify.eventBus);
  const productSvc  = new ProductService(fastify.prisma);
  const scoringSvc  = new LeadScoringService(fastify.prisma);
  // RecordService/CrmService produce record.* domain events onto the shared bus;
  // the workflow engine and IntegrationService consume them independently.
  const recSvc      = new RecordService(fastify.prisma, fastify.eventBus, permSvc, assignSvc, scoringSvc);

  // ── Bootstrap — single request loads all metadata for the frontend cache ──
  // GET /api/runtime/bootstrap
  // Returns { modules, objects, forms, wizards, pipelines, resolvedNames }
  fastify.get('/bootstrap', { preHandler: [authenticate] }, async (req) => {
    const roleName = req.user?.role;
    const tenantId = req.user?.tenant_id;

    // 1. Load all modules, filtered by role
    const keys = await entitledKeys(fastify, req);
    const allModules = await meta.getModules();
    const filteredModules = await permSvc.filterMetadataByRole(allModules, 'module', roleName, tenantId);
    const modules = await Promise.all(
      filteredModules.map(async (mod) => {
        const filteredObjects = await permSvc.filterMetadataByRole(
          mod.objects || [], 'object', roleName, tenantId,
        );
        return { ...mod, objects: filteredObjects };
      }),
    );

    // 2. Collect all object IDs and load full object data (with fields, pipelines)
    const objectIds = [];
    for (const mod of modules) {
      for (const obj of (mod.objects || [])) {
        objectIds.push(obj.id);
      }
    }

    const objects = {};
    const resolvedNames = {};

    await Promise.all(objectIds.map(async (objId) => {
      const obj = await meta.getObject(objId);
      const objPerm = await permSvc.getEffectiveUiPermission('object', objId, roleName, tenantId);
      if (!objPerm.can_view) return;

      const filteredFields = await permSvc.filterMetadataByRole(
        obj.fields || [], 'field', roleName, tenantId,
      );
      const pipelines = await dashSvc.getPipelines(objId);
      const forms = await meta.getForms(objId);
      objects[objId] = {
        ...obj,
        fields: filteredFields,
        pipelines,
        forms,
        _can_edit: objPerm.can_edit,
      };

      // Resolve name → IDs mapping
      if (obj.name) {
        const pipeline = pipelines[0];
        const firstStage = pipeline
          ? await fastify.prisma.uiPipelineStage.findFirst({
              where: { pipeline_id: pipeline.id },
              orderBy: { order_index: 'asc' },
              select: { id: true },
            })
          : null;
        const wizard = await fastify.prisma.uiWizard.findFirst({
          where: { object_id: objId, is_active: true },
          select: { id: true },
        });
        resolvedNames[obj.name] = {
          object_id:      objId,
          module_id:      obj.module_id,
          first_stage_id: firstStage?.id ?? null,
          pipeline_id:    pipeline?.id ?? null,
          wizard_id:      wizard?.id ?? null,
        };
      }
    }));

    // 3. Load all forms with full field_layouts and dependencies
    const forms = {};
    const formIds = new Set();
    for (const obj of Object.values(objects)) {
      for (const f of (obj.forms || [])) {
        formIds.add(f.id);
      }
    }

    await Promise.all([...formIds].map(async (formId) => {
      try {
        const form = await meta.getFormForViewer(formId, roleName);
        const deps = await meta.getDependenciesForForm(formId);
        if (form) {
          forms[formId] = { ...form, dependencies: deps };
        }
      } catch {
        // Skip forms that fail to load (e.g. deleted)
      }
    }));

    // 4. Load all wizards
    const wizards = {};
    const allWizards = await dashSvc.getWizards();
    const filteredWizards = await permSvc.filterMetadataByRole(allWizards, 'wizard', roleName, tenantId);
    for (const wiz of filteredWizards) {
      const full = await dashSvc.getWizard(wiz.id);
      wizards[wiz.id] = full;
    }

    // 5. Load all pipelines
    const pipelinesMap = {};
    for (const obj of Object.values(objects)) {
      for (const p of (obj.pipelines || [])) {
        if (!pipelinesMap[p.id]) {
          const full = await dashSvc.getPipeline(p.id);
          pipelinesMap[p.id] = full;
        }
      }
    }

    return ok({
      modules,
      objects,
      forms,
      wizards,
      pipelines: pipelinesMap,
      resolvedNames,
      // What the client may show. Sent with bootstrap so every screen has it
      // from the first render, rather than a second round-trip per page.
      entitlements: { plan: await planOf(fastify.prisma, req.user?.tenant_id), features: [...keys] },
    });
  });

  // GET /api/runtime/modules — all active modules visible to the viewer's role
  fastify.get('/modules', { preHandler: [authenticate] }, async (req) => {
    const modules  = await meta.getModules();
    const roleName = req.user?.role;
    // Filter modules and their nested objects by role permissions
    const tenantId = req.user?.tenant_id;
    const filtered = await permSvc.filterMetadataByRole(modules, 'module', roleName, tenantId);
    // For each retained module, filter its objects too
    const result = await Promise.all(
      filtered.map(async (mod) => {
        const filteredObjects = await permSvc.filterMetadataByRole(
          mod.objects || [], 'object', roleName, tenantId,
        );
        return { ...mod, objects: filteredObjects };
      }),
    );
    return ok(result);
  });

  // GET /api/runtime/module/:id — full module with permission-filtered objects
  fastify.get('/module/:id', { preHandler: [authenticate] }, async (req, reply) => {
    const module   = await meta.getModule(Number(req.params.id));
    const roleName = req.user?.role;
    const tenantId = req.user?.tenant_id;
    const perm     = await permSvc.getEffectiveUiPermission('module', Number(req.params.id), roleName, tenantId);
    if (!perm.can_view) return reply.code(404).send({ error: 'Not found' });
    const filteredObjects = await permSvc.filterMetadataByRole(
      module.objects || [], 'object', roleName, tenantId,
    );
    return ok({ ...module, objects: filteredObjects, _can_edit: perm.can_edit });
  });

  // GET /api/runtime/object/:id — full object with permission-filtered fields
  fastify.get('/object/:id', { preHandler: [authenticate] }, async (req, reply) => {
    const obj      = await meta.getObject(Number(req.params.id));
    const roleName = req.user?.role;
    const tenantId = req.user?.tenant_id;
    // Check object-level view permission
    const objPerm  = await permSvc.getEffectiveUiPermission('object', Number(req.params.id), roleName, tenantId);
    if (!objPerm.can_view) return reply.code(404).send({ error: 'Not found' });
    // Filter fields by role permissions
    const filteredFields = await permSvc.filterMetadataByRole(
      obj.fields || [], 'field', roleName, tenantId,
    );
    // Attach pipelines
    const pipelines = await dashSvc.getPipelines(obj.id);
    return ok({ ...obj, fields: filteredFields, pipelines, _can_edit: objPerm.can_edit });
  });

  // GET /api/runtime/form/:id — role-filtered form metadata
  fastify.get('/form/:id', { preHandler: [authenticate] }, async (req) => {
    const roleName = req.user?.role;
    const form     = await meta.getFormForViewer(Number(req.params.id), roleName);
    const deps     = await meta.getDependenciesForForm(Number(req.params.id));
    return ok({ ...form, dependencies: deps });
  });

  // GET /api/runtime/dashboard/:id — dashboard with widgets, unified permission check
  fastify.get('/dashboard/:id', { preHandler: [authenticate] }, async (req, reply) => {
    const id       = Number(req.params.id);
    const roleName = req.user?.role;
    const dash     = await dashSvc.getDashboard(id);
    // 1. UiPermission check (new unified model)
    const tenantId = req.user?.tenant_id;
    const uiPerm = await permSvc.getEffectiveUiPermission('dashboard', id, roleName, tenantId);
    if (!uiPerm.can_view) return reply.code(404).send({ error: 'Not found' });
    // 2. Legacy min_role compatibility fallback (only checked if no explicit
    //    UiPermission row). The comparison lives in DashboardService so the
    //    single-dashboard gate and the list filter cannot disagree — they used
    //    to share the same inverted test, admitting the roles it should have
    //    excluded. See DashboardService.canSeeDashboard.
    if (dash.min_role && !(await dashSvc.canViewDashboard(roleName, dash.min_role))) {
      return reply.code(404).send({ error: 'Not found' });
    }
    return ok({ ...dash, _can_edit: uiPerm.can_edit });
  });

  // GET /api/runtime/dashboards — list all dashboards visible to the current user's role
  fastify.get('/dashboards', { preHandler: [authenticate] }, async (req) => {
    const roleName = req.user?.role;
    const tenantId = req.user?.tenant_id;
    const all      = await dashSvc.getDashboards();
    const filtered = await permSvc.filterMetadataByRole(all, 'dashboard', roleName, tenantId);
    // Secondary min_role filter for rows that have no explicit UiPermission row yet
    const visible = await Promise.all(filtered.map((d) => dashSvc.canViewDashboard(roleName, d.min_role)));
    const list = filtered.filter((_, i) => visible[i]);
    // The role's home dashboard (Settings ▸ Home Page), else the default one.
    const homeName = await dashSvc.homeDashboardName(tenantId, roleName);
    const home = list.find((d) => homeName && d.name === homeName) ?? list.find((d) => d.is_default) ?? list[0];
    return ok(list.map((d) => ({ ...d, is_home: d === home })));
  });

  // GET /api/runtime/wizards — list wizards (optionally filtered by object_id), role-filtered
  fastify.get('/wizards', { preHandler: [authenticate] }, async (req) => {
    const { object_id } = req.query;
    const roleName = req.user?.role;
    const tenantId = req.user?.tenant_id;
    const all = await dashSvc.getWizards(object_id ? Number(object_id) : undefined);
    const filtered = await permSvc.filterMetadataByRole(all, 'wizard', roleName, tenantId);
    return ok(filtered);
  });

  // GET /api/runtime/wizard/:id — wizard with all step forms, role-checked
  fastify.get('/wizard/:id', { preHandler: [authenticate] }, async (req, reply) => {
    const id       = Number(req.params.id);
    const roleName = req.user?.role;
    const tenantId = req.user?.tenant_id;
    const perm     = await permSvc.getEffectiveUiPermission('wizard', id, roleName, tenantId);
    if (!perm.can_view) return reply.code(404).send({ error: 'Not found' });
    const wizard = await dashSvc.getWizard(id);
    return ok({ ...wizard, _can_edit: perm.can_edit });
  });

  // GET /api/runtime/pipeline/:id — pipeline with stages, role-checked
  fastify.get('/pipeline/:id', { preHandler: [authenticate] }, async (req, reply) => {
    const id       = Number(req.params.id);
    const roleName = req.user?.role;
    const tenantId = req.user?.tenant_id;
    const perm     = await permSvc.getEffectiveUiPermission('pipeline', id, roleName, tenantId);
    if (!perm.can_view) return reply.code(404).send({ error: 'Not found' });
    const pipeline = await dashSvc.getPipeline(id);
    return ok({ ...pipeline, _can_edit: perm.can_edit });
  });

  // ── Resolve IDs by name (avoids hardcoding auto-increment IDs) ──────────
  // GET /api/runtime/resolve?object=application
  // Returns { object_id, module_id, first_stage_id, wizard_id }
  fastify.get('/resolve', { preHandler: [authenticate] }, async (req, reply) => {
    const name = req.query.object;
    if (!name) throw new ValidationError('object name is required');
    const obj = await fastify.prisma.uiObject.findFirst({
      where: { name },
      select: { id: true, module_id: true },
    });
    if (!obj) return reply.code(404).send({ error: `Object '${name}' not found` });
    const pipeline = await fastify.prisma.uiPipeline.findFirst({
      where: { object_id: obj.id },
      include: { stages: { orderBy: { order_index: 'asc' }, take: 1, select: { id: true, name: true } } },
    });
    const wizard = await fastify.prisma.uiWizard.findFirst({
      where: { object_id: obj.id, is_active: true },
      select: { id: true },
    });
    return ok({
      object_id:      obj.id,
      module_id:      obj.module_id,
      first_stage_id: pipeline?.stages[0]?.id ?? null,
      pipeline_id:    pipeline?.id ?? null,
      wizard_id:      wizard?.id ?? null,
    });
  });

  // ── Records ─────────────────────────────────────────────────────────────────

  // GET /api/runtime/records?object_id=X[&stage_id=Y][&limit=N&offset=M]
  // limit/offset are optional; when omitted a server-side safety cap applies.
  fastify.get('/records', { preHandler: [authenticate] }, async (req) => {
    const { object_id, stage_id, limit, offset } = req.query;
    if (!object_id) throw new ValidationError('object_id is required');
    const opts = {};
    if (limit != null)  opts.limit  = limit;
    if (offset != null) opts.offset = offset;
    return ok(await recSvc.getRecords(object_id, stage_id, req.user, opts));
  });

  // GET /api/runtime/records/:id
  fastify.get('/records/:id', { preHandler: [authenticate] }, async (req) => {
    return ok(await recSvc.getRecord(req.params.id, req.user));
  });

  // POST /api/runtime/records/:id/reveal — unmask one personal-data field.
  // Only on a record the viewer may open; every reveal goes to the audit chain.
  fastify.post('/records/:id/reveal', {
    preHandler: [authenticate],
    schema: {
      params: { type: 'object', required: ['id'], properties: { id: { type: 'integer', minimum: 1 } } },
      body: { type: 'object', required: ['field'], properties: { field: { type: 'string', maxLength: 100, pattern: '^[a-z_][a-z0-9_]*$' } }, additionalProperties: false },
    },
  }, async (req) => ok(await recSvc.revealField(req.params.id, req.body.field, req.user)));

  // GET /api/runtime/records/:id/related — records pointing here via lookups
  fastify.get('/records/:id/related', { preHandler: [authenticate] }, async (req) => {
    return ok(await recSvc.relatedRecords(req.params.id, req.user));
  });

  // GET /api/runtime/lookup/:objectName?q= — record picker for a lookup field
  fastify.get('/lookup/:objectName', { preHandler: [authenticate] }, async (req) => {
    const obj = await fastify.prisma.uiObject.findFirst({
      where: { name: String(req.params.objectName), is_active: true }, select: { id: true },
    });
    if (!obj) throw new NotFoundError('Object');
    return ok(await recSvc.searchLookup(obj.id, req.query?.q ?? '', req.user, req.query?.limit, req.query?.id));
  });

  // GET /api/runtime/objects/:id/actions — the object's record actions: every
  // active manual workflow on it, rendered as a button on the record panel.
  fastify.get('/objects/:id/actions', { preHandler: [authenticate] }, async (req) => {
    const rows = await fastify.prisma.uiWorkflow.findMany({
      where:   { object_id: Number(req.params.id), trigger_type: 'manual', is_active: true },
      select:  { id: true, name: true, label: true, description: true },
      orderBy: { id: 'asc' },
    });
    return ok(rows);
  });

  // POST /api/runtime/records/:id/actions/:workflowId — run a record action.
  // The caller must be able to edit the record, and the workflow must be a
  // manual workflow of the record's own object.
  fastify.post('/records/:id/actions/:workflowId', { preHandler: [authenticate] }, async (req) => {
    const record = await recSvc.getRecord(req.params.id, req.user);           // access + barrier check
    await recSvc.assertCanEdit(record.object_id, req.user);
    const wf = await fastify.prisma.uiWorkflow.findUnique({
      where: { id: Number(req.params.workflowId) }, select: { id: true, object_id: true, trigger_type: true, is_active: true, label: true },
    });
    if (!wf || !wf.is_active || wf.trigger_type !== 'manual' || wf.object_id !== record.object_id) {
      throw new NotFoundError('Action');
    }
    const anchor = await fastify.prisma.record.findUnique({ where: { id: record.id } });
    const log = await wfEngine.manualRun(wf.id, anchor, req.user?.employee_id);
    const failed = log.find((l) => l.error);
    return ok({ action: wf.label, steps: log.length, error: failed?.error ?? null, log });
  });

  // POST /api/runtime/records
  fastify.post('/records', { preHandler: [authenticate] }, async (req, reply) => {
    const { object_id: rawObjectId, stage_id, assigned_to, data: crmData, draft } = req.body ?? {};
    if (!rawObjectId) throw new ValidationError('object_id is required');
    // Coerce to integer to prevent XSS / injection via unsanitised string (CWE-79)
    const object_id = Number.isInteger(rawObjectId) ? rawObjectId : parseInt(rawObjectId, 10);
    if (!Number.isFinite(object_id) || object_id <= 0) throw new ValidationError('object_id must be a positive integer');
    const record = await recSvc.createRecord(object_id, stage_id, req.user?.employee_id, assigned_to ?? null, req.user, crmData ?? null, { draft: draft === true });
    return reply.status(201).send(ok(record));
  });

  // PUT /api/runtime/records/:id
  fastify.put('/records/:id', { preHandler: [authenticate] }, async (req) => {
    const { assigned_to, data: crmData } = req.body ?? {};
    return ok(await recSvc.updateRecord(req.params.id, req.user?.employee_id, req.user, assigned_to, crmData ?? null));
  });

  // PATCH /api/runtime/records/:id/stage
  // Handles pipeline stage changes AND triggers conversion automation.
  // When a record is dragged to a specific pipeline stage (Kanban), this
  // endpoint auto-triggers the corresponding business action:
  //   Prospect:    "converted"          → auto-convert lead to client
  //   Lead intake: "converted"          → auto-qualify lead to prospect
  fastify.patch('/records/:id/stage', { preHandler: [authenticate] }, async (req, reply) => {
    const { stage_id } = req.body ?? {};
    const recordId = Number(req.params.id);

    // Gate: dragging a Prospect to the "Converted" lane triggers conversion to a
    // Client. Block that move until all required Prospect fields are filled
    // (required-field enforcement, as in the top-5 CRMs). Checked BEFORE the move
    // so the card doesn't land in "Converted" without actually converting.
    if (stage_id) {
      const targetStage = await fastify.prisma.uiPipelineStage.findUnique({
        where: { id: Number(stage_id) }, select: { name: true, config: true },
      });
      // A stage triggers conversion if it is flagged in metadata
      // (`config.is_conversion_stage`) OR is the conventionally-named
      // "converted" stage — so a tenant can rename/relocate the stage without
      // breaking conversion.
      if (isConversionStage(targetStage)) {
        const rec = await fastify.prisma.record.findUnique({
          where: { id: recordId }, select: { object: { select: { name: true } } },
        });
        if (rec?.object?.name === 'prospect' || rec?.object?.name === 'lead') {
          const missing = await recSvc.getMissingRequiredFields(recordId);
          if (missing.length) {
            return reply.code(400).send({ error: `Complete all required fields before converting: ${missing.join(', ')}`, missing_fields: missing });
          }
        }
      }
    }

    const updated = await recSvc.updateRecordStage(recordId, stage_id ?? null, req.user?.employee_id, req.user);

    // ── Pipeline automation: resolve stage name & object name ──────────
    const automation = { action: null };
    if (updated.pipeline_stage?.name) {
      const stageName = updated.pipeline_stage.name;
      const obj = await fastify.prisma.uiObject.findUnique({
        where: { id: updated.object_id }, select: { name: true },
      });
      const objectName = obj?.name;
      const actorId = req.user?.employee_id;

      const stageIsConversion = isConversionStage(updated.pipeline_stage);

      try {
        // ── PROSPECT: dragged to a conversion stage → auto-convert lead ──────
        if ((objectName === 'prospect' || objectName === 'lead') && stageIsConversion) {
          const lead = await fastify.prisma.crmLead.findUnique({ where: { record_id: recordId } });
          if (lead && !lead.is_converted) {
            const result = await crmSvc.convertLead(lead.id, {
              create_account: true, create_contact: true,
              create_opportunity: false,
            }, actorId);
            try {
              if (result.contact?.record_id) await copyEavToRecord(fastify.prisma, recordId, result.contact.record_id, result.contact.tenant_id);
            } catch (err) { fastify.log.warn({ err }, '[stage-auto] EAV copy failed'); }
            automation.action = 'lead_converted';
            automation.contactRecordId = result.contact?.record_id ?? null;
          }
        }

        // ── LEAD (intake): dragged to a conversion stage → auto-convert to Prospect ──
        if (objectName === 'lead_intake' && stageIsConversion) {
          const intake = await fastify.prisma.crmLeadIntake.findUnique({ where: { record_id: recordId } });
          if (intake && !intake.is_converted) {
            const result = await crmSvc.convertLeadToProspect(intake.id, {}, actorId);
            automation.action = 'lead_qualified';
            automation.prospectRecordId = result.prospectRecordId ?? null;
          }
        }

      } catch (err) {
        fastify.log.warn({ err, recordId, stageName, objectName }, '[stage-auto] Automation failed (stage still updated)');
        automation.error = err.message;
      }
    }

    return ok({ ...updated, automation });
  });

  // DELETE /api/runtime/records/:id
  // Delete mode (soft → Trash / hard → permanent) is resolved per-record from
  // its object's pipeline (`config.delete_mode`) inside RecordService.
  fastify.delete('/records/:id', { preHandler: [authenticate] }, async (req, reply) => {
    await recSvc.deleteRecord(req.params.id, req.user?.employee_id, req.user);
    return reply.status(204).send();
  });

  // POST /api/runtime/records/bulk-delete
  fastify.post('/records/bulk-delete', { preHandler: [authenticate] }, async (req, reply) => {
    const { ids = [] } = req.body ?? {};
    if (!ids.length) return reply.code(400).send({ error: 'ids required' });
    return ok(await recSvc.bulkDelete(ids, req.user?.employee_id, req.user));
  });

  // POST /api/runtime/records/bulk-stage
  fastify.post('/records/bulk-stage', { preHandler: [authenticate] }, async (req) => {
    const { ids = [], stage_id } = req.body ?? {};
    return ok(await recSvc.bulkUpdateStage(ids, stage_id, req.user?.employee_id, req.user));
  });

  const idsBody = { type: 'array', minItems: 1, maxItems: 1000, items: { type: 'integer', minimum: 1 } };
  const idParam = { type: 'object', required: ['id'], properties: { id: { type: 'integer', minimum: 1 } } };

  // POST /api/runtime/records/bulk-assign — reassign many records (RM exit, X-09)
  fastify.post('/records/bulk-assign', {
    preHandler: [authenticate],
    schema: { body: { type: 'object', required: ['ids', 'assigned_to'], properties: { ids: idsBody, assigned_to: { type: ['string', 'null'], maxLength: 20 } }, additionalProperties: false } },
  }, async (req) => ok(await recSvc.bulkAssign(req.body.ids, req.body.assigned_to, req.user?.employee_id, req.user)));

  // POST /api/runtime/records/:id/merge — merge this duplicate into another record (C360-FR-08)
  fastify.post('/records/:id/merge', {
    preHandler: [authenticate],
    schema: { params: idParam, body: { type: 'object', required: ['into'], properties: { into: { type: 'integer', minimum: 1 } }, additionalProperties: false } },
  }, async (req) => ok(await recSvc.mergeRecords(req.params.id, req.body.into, req.user)));

  // POST /api/runtime/records/:id/unmerge — reverse a merge within 30 days
  fastify.post('/records/:id/unmerge', { preHandler: [authenticate], schema: { params: idParam } },
    async (req) => ok(await recSvc.unmergeRecord(req.params.id, req.user)));

  // GET /api/runtime/records/export?object_id=X
  fastify.get('/records/export', { preHandler: [authenticate] }, async (req, reply) => {
    const { object_id } = req.query;
    if (!object_id) return reply.code(400).send({ error: 'object_id is required' });
    const csv = await recSvc.exportRecordsCsv(object_id, req.user);
    return reply
      .header('Content-Type', 'text/csv')
      .header('Content-Disposition', `attachment; filename="records-${object_id}-${Date.now()}.csv"`)
      .send(csv);
  });

  // GET /api/runtime/records/:id/audit
  fastify.get('/records/:id/audit', { preHandler: [authenticate] }, async (req) => {
    // Assert the viewer can see this record before exposing its audit trail
    const rec = await recSvc.getRecord(req.params.id, req.user);
    const logs = await fastify.prisma.auditLog.findMany({
      where:   { record_id: Number(req.params.id) },
      orderBy: { created_at: 'desc' },
      take: 50,
      include: { employee: { select: { employee_id: true, employee_name: true } } },
    });
    // Personal-data reveals live in the tamper-evident audit chain; the user
    // guide promises them on the record's Audit tab, so merge them in.
    const reveals = await fastify.prisma.auditChainEvent.findMany({
      where:   { tenant_id: Number(rec.tenant_id ?? req.user.tenant_id), entity_type: 'pii.reveal', entity_id: String(req.params.id) },
      orderBy: { created_at: 'desc' },
      take: 50,
    }).catch(() => []);
    if (!reveals.length) return ok(logs);
    const actors = [...new Set(reveals.map((e) => e.actor).filter(Boolean))];
    const [emps, flds] = await Promise.all([
      fastify.prisma.employee.findMany({ where: { employee_id: { in: actors } }, select: { employee_id: true, employee_name: true } }),
      fastify.prisma.uiField.findMany({ where: { object_id: Number(rec.object_id) }, select: { name: true, label: true } }),
    ]);
    const empBy = new Map(emps.map((e) => [e.employee_id, e]));
    const labelBy = new Map(flds.map((f) => [f.name, f.label]));
    const revealRows = reveals.map((e) => ({
      id: `chain-${e.id}`, record_id: Number(req.params.id), action: 'pii_reveal', employee_id: e.actor, created_at: e.created_at,
      employee: empBy.get(e.actor) ?? { employee_id: e.actor, employee_name: e.actor },
      changes: { summary: `Revealed ${labelBy.get(e.payload?.field) ?? e.payload?.field ?? 'personal data'} (personal data — audited)` },
    }));
    return ok([...logs, ...revealRows].sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, 50));
  });

  // ── Status timeline (status_tracker fieldtype) ─────────────────────────────

  // GET /api/runtime/records/:id/status-events
  // Returns the record's status timeline, newest first (Amazon/UPS-style tracker).
  fastify.get('/records/:id/status-events', { preHandler: [authenticate] }, async (req) => {
    return ok(await recSvc.listStatusEvents(req.params.id, req.user));
  });

  // POST /api/runtime/records/:id/status-events
  // body: { status, title?, description?, location?, event_type?, occurred_at? }
  fastify.post('/records/:id/status-events', { preHandler: [authenticate] }, async (req, reply) => {
    const { status } = req.body ?? {};
    if (!status) return reply.code(400).send({ error: 'status is required' });
    return ok(await recSvc.addStatusEvent(req.params.id, req.body, req.user));
  });

  // ── Workflow approvals ──────────────────────────────────────────────────────

  // POST /api/runtime/workflows/approval/:token
  // body: { action: 'approve' | 'reject' }
  // Resolves a pending approval step. Any authenticated employee can act on a
  // token they received via the notification link.
  fastify.post('/workflows/approval/:token', {
    preHandler: [authenticate],
    schema: { body: { type: 'object', required: ['action'], properties: { action: { type: 'string', enum: ['approve', 'reject'] }, comment: { type: 'string', maxLength: 1000 } } } },
  }, async (req) => {
    const { token } = req.params;
    const { action, comment } = req.body ?? {};
    const actingEmployeeId = req.user.employee_id ?? req.user.employeeId;
    try {
      return ok(await wfEngine.processApproval(token, action === 'approve', actingEmployeeId, comment ?? null));
    } catch (err) {
      // Business outcomes, not server faults: unknown token, not an approver, already decided.
      if (/not found|Not authorised|already resolved/i.test(err.message)) throw new ValidationError(err.message);
      throw err;
    }
  });

  // GET /api/runtime/workflows/approvals?scope=mine|all|decided — the Approvals inbox.
  // `all` (every pending request in the workspace) is for managers and administrators.
  fastify.get('/workflows/approvals', {
    preHandler: [authenticate],
    schema: { querystring: { type: 'object', properties: { scope: { type: 'string', enum: ['mine', 'all', 'decided'] } } } },
  }, async (req) => {
    const scope = req.query.scope ?? 'mine';
    const me = req.user.employee_id ?? req.user.employeeId;
    if (scope === 'all') {
      const lvl = Number(req.user.role_level);
      if (!(Number.isFinite(lvl) && lvl <= MANAGER_THRESHOLD)) throw new ValidationError('Only managers can see every pending approval');
    }
    return ok(await wfEngine.listApprovals(me, { scope }));
  });

  // ── Forecast ─────────────────────────────────────────────────────────────

  // GET /api/runtime/forecast?object_id=X[&value_field=amount&assigned_to=EMP-1]
  fastify.get('/forecast', { preHandler: [authenticate] }, async (req) => {
    const { object_id, ...opts } = req.query;
    if (!object_id) throw new ValidationError('object_id is required');
    return ok(await forecastSvc.computeForecast(Number(object_id), opts));
  });

  // GET /api/runtime/forecast/team?manager_id=X&object_id=Y
  fastify.get('/forecast/team', { preHandler: [authenticate] }, async (req) => {
    const { manager_id, object_id, ...opts } = req.query;
    if (!manager_id) throw new ValidationError('manager_id is required');
    if (!object_id)  throw new ValidationError('object_id is required');
    return ok(await forecastSvc.getTeamForecast(manager_id, Number(object_id), opts));
  });

  // ── Import ───────────────────────────────────────────────────────────────

  // GET /api/runtime/import/jobs?object_id=X
  fastify.get('/import/jobs', { preHandler: [authenticate] }, async (req) => {
    return ok(await importSvc.listJobs(req.query.object_id));
  });

  // GET /api/runtime/import/jobs/:id
  fastify.get('/import/jobs/:id', { preHandler: [authenticate] }, async (req) => {
    return ok(await importSvc.getJob(Number(req.params.id)));
  });

  // POST /api/runtime/import/jobs — create a new import job
  // Body: { object_id, filename }
  fastify.post('/import/jobs', { preHandler: [authenticate] }, async (req, reply) => {
    const { object_id, filename } = req.body ?? {};
    if (!object_id) throw new ValidationError('object_id is required');
    const job = await importSvc.createJob({
      object_id,
      filename: filename ?? 'upload.csv',
      created_by: req.user?.employee_id ?? req.user?.employeeId,
    });
    reply.code(201);
    return ok(job);
  });

  // POST /api/runtime/import/jobs/:id/preview
  // Multipart: field "file" (CSV buffer), field "field_mapping" (JSON), field "dedupe_keys" (JSON array), field "strategy"
  fastify.post('/import/jobs/:id/preview', { preHandler: [authenticate] }, async (req, reply) => {
    const jobId = Number(req.params.id);
    // Fastify's raw body (content-type: application/json with base64 csv_data, or raw CSV)
    // Accept both JSON body { csv_data: '<base64>', field_mapping, dedupe_keys, strategy }
    // and raw text/csv body with query param field_mapping etc.
    const { csv_data, field_mapping = {}, dedupe_keys = [], strategy = 'skip' } = req.body ?? {};
    if (!csv_data) return reply.code(400).send({ error: 'csv_data (base64) is required' });
    const buffer = Buffer.from(csv_data, 'base64');
    const result = await importSvc.previewImport(jobId, buffer, field_mapping, dedupe_keys, strategy);
    return ok(result);
  });

  // POST /api/runtime/import/jobs/:id/execute
  // Body: { csv_data: '<base64>' }
  fastify.post('/import/jobs/:id/execute', { preHandler: [authenticate] }, async (req) => {
    const jobId = Number(req.params.id);
    const { csv_data } = req.body ?? {};
    if (!csv_data) throw new ValidationError('csv_data (base64) is required');
    const buffer = Buffer.from(csv_data, 'base64');
    return ok(await importSvc.executeImport(jobId, buffer));
  });

  // ── Assignment trigger (for manual re-assign) ─────────────────────────────

  // POST /api/runtime/records/:id/assign — re-trigger assignment engine
  fastify.post('/records/:id/assign', { preHandler: [authenticate] }, async (req) => {
    // recSvc.getRecord enforces role/ownership access — throws NotFoundError for
    // records the caller cannot see, preventing unauthorized re-assignment.
    const record = await recSvc.getRecord(Number(req.params.id), req.user);
    // CRM fields are loaded internally by AssignmentService.assign() via #loadCrmFields
    const assigneeId = await assignSvc.assign(record.object_id, record.id);
    return ok({ record_id: record.id, assigned_to: assigneeId });
  });

  // ── CRM Relational API ────────────────────────────────────────────────────
  // These endpoints create / read / update first-class CRM entities via
  // CrmService. All field data lives in crm_* relational tables — records is a
  // thin anchor row only.

  // ── Leads ─────────────────────────────────────────────────────────────────

  fastify.get('/crm/leads', { preHandler: [authenticate] }, async (req) => {
    return ok(await crmSvc.listLeads(req.query));
  });

  fastify.get('/crm/leads/:id', { preHandler: [authenticate] }, async (req, reply) => {
    const lead = await crmSvc.getLead(req.params.id);
    if (!lead) return reply.code(404).send({ error: 'Not found' });
    return ok(lead);
  });

  fastify.post('/crm/leads', { preHandler: [authenticate] }, async (req, reply) => {
    const { assigned_to, ...data } = req.body ?? {};
    const lead = await crmSvc.createLead(data, assigned_to ?? req.user?.employee_id, req.user?.employee_id);
    return reply.status(201).send(ok(lead));
  });

  fastify.put('/crm/leads/:id', { preHandler: [authenticate] }, async (req) => {
    return ok(await crmSvc.updateLead(req.params.id, req.body ?? {}, req.user?.employee_id));
  });

  // POST /api/runtime/crm/leads/:id/convert  (by CRM lead ID)
  // Body: { create_account, account_id, account_name, create_contact,
  //         create_opportunity, opportunity_name, opportunity_amount, close_date, notes }
  fastify.post('/crm/leads/:id/convert', { preHandler: [authenticate] }, async (req, reply) => {
    const leadId = Number(req.params.id);
    if (!Number.isFinite(leadId) || leadId <= 0) {
      return reply.code(400).send({ error: 'Invalid lead id' });
    }
    // Gate: a Prospect must be complete (all required fields filled) before it
    // can convert to a Client — matches required-field enforcement in the top-5 CRMs.
    const leadRow = await fastify.prisma.crmLead.findUnique({ where: { id: leadId }, select: { record_id: true } });
    if (leadRow?.record_id) {
      const missing = await recSvc.getMissingRequiredFields(leadRow.record_id);
      if (missing.length) {
        return reply.code(400).send({ error: `Complete all required fields before converting: ${missing.join(', ')}`, missing_fields: missing });
      }
    }
    const result = await crmSvc.convertLead(leadId, req.body ?? {}, req.user?.employee_id);
    return reply.status(201).send(ok(result));
  });

  // POST /api/runtime/records/:id/convert-lead  (by record ID — UI-friendly)
  // Looks up the CRM lead linked to this record and converts it.
  // If no crm_leads row exists (record was created via form → EAV only),
  // creates one from the EAV data first, then converts.
  fastify.post('/records/:id/convert-lead', { preHandler: [authenticate] }, async (req, reply) => {
    const recordId = Number(req.params.id);
    if (!Number.isFinite(recordId) || recordId <= 0) {
      return reply.code(400).send({ error: 'Invalid record id' });
    }
    let lead = await fastify.prisma.crmLead.findUnique({ where: { record_id: recordId } });

    // If no CRM lead row exists, create one from EAV field values
    if (!lead) {
      const record = await fastify.prisma.record.findUnique({ where: { id: recordId } });
      if (!record) return reply.code(404).send({ error: 'Record not found' });
      const eavRows = await fastify.prisma.recordFieldValue.findMany({ where: { record_id: recordId } });
      const eav = Object.fromEntries(eavRows.map(r => [r.field_name, r.str_value]));
      if (!eav.first_name && !eav.last_name) {
        return reply.code(400).send({ error: 'Record has no name fields — cannot create lead' });
      }
      lead = await fastify.prisma.crmLead.create({
        data: {
          record_id:    recordId,
          first_name:   eav.first_name ?? '',
          last_name:    eav.last_name ?? '',
          email:        eav.email ?? null,
          phone:        eav.phone ?? null,
          mobile:       eav.mobile ?? null,
          company:      eav.company ?? null,
          lead_source:  eav.lead_source ?? null,
          lead_status:  eav.lead_status ?? 'new',
          rating:       eav.rating ?? null,
          description:  eav.notes ?? eav.description ?? null,
          owner_id:     record.assigned_to ?? record.created_by ?? null,
          created_by:   record.created_by ?? null,
          tenant_id:    record.tenant_id,
        },
      });
    }

    if (lead.is_converted) return reply.code(409).send({ error: 'Lead has already been converted' });
    // Gate: block conversion until all required Prospect fields are filled
    // (required-field enforcement, as in Salesforce/Zoho/HubSpot/Dynamics/Pipedrive).
    const missing = await recSvc.getMissingRequiredFields(recordId);
    if (missing.length) {
      return reply.code(400).send({ error: `Complete all required fields before converting: ${missing.join(', ')}`, missing_fields: missing });
    }
    const result = await crmSvc.convertLead(lead.id, req.body ?? {}, req.user?.employee_id);

    // Carry the prospect's form values over to the new client record.
    try {
      if (result.contact?.record_id) {
        await copyEavToRecord(fastify.prisma, recordId, result.contact.record_id, result.contact.tenant_id ?? result.account?.tenant_id);
      }
    } catch (err) {
      fastify.log.warn({ err, recordId }, '[convert-lead] EAV copy failed');
    }

    return reply.status(201).send(ok(result));
  });

  // POST /api/runtime/records/:id/convert-to-prospect  (by record ID)
  // Converts a raw Lead (crm_lead_intake) into a Prospect (crm_leads).
  // If no intake row exists yet (record created via form → EAV only), one is
  // built from the EAV data first, then converted.
  fastify.post('/records/:id/convert-to-prospect', { preHandler: [authenticate] }, async (req, reply) => {
    const recordId = Number(req.params.id);
    if (!Number.isFinite(recordId) || recordId <= 0) {
      return reply.code(400).send({ error: 'Invalid record id' });
    }
    let intake = await fastify.prisma.crmLeadIntake.findUnique({ where: { record_id: recordId } });

    if (!intake) {
      const record = await fastify.prisma.record.findUnique({ where: { id: recordId } });
      if (!record) return reply.code(404).send({ error: 'Record not found' });
      const eavRows = await fastify.prisma.recordFieldValue.findMany({ where: { record_id: recordId } });
      const eav = Object.fromEntries(eavRows.map(r => [r.field_name, r.str_value]));
      if (!eav.first_name && !eav.last_name) {
        return reply.code(400).send({ error: 'Record has no name fields — cannot create lead' });
      }
      intake = await fastify.prisma.crmLeadIntake.create({
        data: {
          record_id:   recordId,
          first_name:  eav.first_name ?? '',
          last_name:   eav.last_name ?? '',
          email:       eav.email ?? null,
          phone:       eav.phone ?? null,
          mobile:      eav.mobile ?? null,
          company:     eav.company ?? null,
          job_title:   eav.job_title ?? null,
          lead_source: eav.lead_source ?? null,
          lead_status: eav.lead_status ?? 'new',
          rating:      eav.rating ?? null,
          industry:    eav.industry ?? null,
          website:     eav.website ?? null,
          description: eav.notes ?? eav.description ?? null,
          owner_id:    record.assigned_to ?? record.created_by ?? null,
          created_by:  record.created_by ?? null,
          tenant_id:   record.tenant_id,
        },
      });
    }

    if (intake.is_converted) return reply.code(409).send({ error: 'Lead has already been converted' });
    const result = await crmSvc.convertLeadToProspect(intake.id, req.body ?? {}, req.user?.employee_id);
    return reply.status(201).send(ok(result));
  });

  // ── Contacts ──────────────────────────────────────────────────────────────

  fastify.get('/crm/contacts', { preHandler: [authenticate] }, async (req) => {
    return ok(await crmSvc.listContacts(req.query));
  });

  fastify.get('/crm/contacts/:id', { preHandler: [authenticate] }, async (req, reply) => {
    const contact = await crmSvc.getContact(req.params.id);
    if (!contact) return reply.code(404).send({ error: 'Not found' });
    return ok(contact);
  });

  fastify.post('/crm/contacts', { preHandler: [authenticate] }, async (req, reply) => {
    const { assigned_to, ...data } = req.body ?? {};
    const contact = await crmSvc.createContact(data, assigned_to ?? req.user?.employee_id, req.user?.employee_id);
    return reply.status(201).send(ok(contact));
  });

  fastify.put('/crm/contacts/:id', { preHandler: [authenticate] }, async (req) => {
    return ok(await crmSvc.updateContact(req.params.id, req.body ?? {}, req.user?.employee_id));
  });

  // ── Accounts ──────────────────────────────────────────────────────────────

  fastify.get('/crm/accounts', { preHandler: [authenticate] }, async (req) => {
    return ok(await crmSvc.listAccounts(req.query));
  });

  fastify.get('/crm/accounts/:id', { preHandler: [authenticate] }, async (req, reply) => {
    const account = await crmSvc.getAccount(req.params.id);
    if (!account) return reply.code(404).send({ error: 'Not found' });
    return ok(account);
  });

  fastify.post('/crm/accounts', { preHandler: [authenticate] }, async (req, reply) => {
    const { assigned_to, ...data } = req.body ?? {};
    const account = await crmSvc.createAccount(data, assigned_to ?? req.user?.employee_id, req.user?.employee_id);
    return reply.status(201).send(ok(account));
  });

  fastify.put('/crm/accounts/:id', { preHandler: [authenticate] }, async (req) => {
    return ok(await crmSvc.updateAccount(req.params.id, req.body ?? {}, req.user?.employee_id));
  });

  // ── Opportunities ─────────────────────────────────────────────────────────

  fastify.get('/crm/opportunities', { preHandler: [authenticate] }, async (req) => {
    return ok(await crmSvc.listOpportunities(req.query));
  });

  fastify.get('/crm/opportunities/:id', { preHandler: [authenticate] }, async (req) => {
    const opp = await crmSvc.getOpportunity(req.params.id);
    if (!opp) throw new NotFoundError('Opportunity');
    return ok(opp);
  });

  fastify.post('/crm/opportunities', { preHandler: [authenticate] }, async (req, reply) => {
    const { assigned_to, ...data } = req.body ?? {};
    const opp = await crmSvc.createOpportunity(data, assigned_to ?? req.user?.employee_id, req.user?.employee_id);
    return reply.status(201).send(ok(opp));
  });

  fastify.put('/crm/opportunities/:id', { preHandler: [authenticate] }, async (req) => {
    return ok(await crmSvc.updateOpportunity(req.params.id, req.body ?? {}, req.user?.employee_id));
  });

  // GET /api/runtime/crm/forecast — SQL-based relational forecast
  // Faster than the generic /forecast endpoint when opportunities are migrated.
  fastify.get('/crm/forecast', { preHandler: [authenticate] }, async (req) => {
    return ok(await crmSvc.computeRelationalForecast(req.query));
  });

  // ── Cases ─────────────────────────────────────────────────────────────────

  fastify.get('/crm/cases', { preHandler: [authenticate] }, async (req) => {
    return ok(await crmSvc.listCases(req.query));
  });

  fastify.get('/crm/cases/:id', { preHandler: [authenticate] }, async (req, reply) => {
    const crmCase = await crmSvc.getCase(req.params.id);
    if (!crmCase) return reply.code(404).send({ error: 'Not found' });
    return ok(crmCase);
  });

  fastify.post('/crm/cases', { preHandler: [authenticate] }, async (req, reply) => {
    const { assigned_to, ...data } = req.body ?? {};
    const crmCase = await crmSvc.createCase(data, assigned_to ?? req.user?.employee_id, req.user?.employee_id);
    return reply.status(201).send(ok(crmCase));
  });

  fastify.put('/crm/cases/:id', { preHandler: [authenticate] }, async (req) => {
    return ok(await crmSvc.updateCase(req.params.id, req.body ?? {}, req.user?.employee_id));
  });

  // ── Associations ──────────────────────────────────────────────────────────

  // GET /api/runtime/crm/associations?from_type=lead&from_id=1[&to_type=contact]
  fastify.get('/crm/associations', { preHandler: [authenticate] }, async (req) => {
    return ok(await crmSvc.getAssociations(req.query));
  });

  // POST /api/runtime/crm/associations
  // Body: { from_type, from_id, to_type, to_id, assoc_type }
  fastify.post('/crm/associations', { preHandler: [authenticate] }, async (req, reply) => {
    const { from_type, from_id, to_type, to_id, assoc_type } = req.body ?? {};
    if (!from_type || !from_id || !to_type || !to_id || !assoc_type) {
      return reply.code(400).send({ error: 'from_type, from_id, to_type, to_id, assoc_type are required' });
    }
    const assoc = await crmSvc.createAssociation({
      from_type, from_id, to_type, to_id, assoc_type,
      created_by: req.user?.employee_id,
    });
    return reply.status(201).send(ok(assoc));
  });

  fastify.delete('/crm/associations/:id', { preHandler: [authenticate] }, async (req, reply) => {
    await crmSvc.deleteAssociation(req.params.id);
    return reply.status(204).send();
  });

  // ── Products ──────────────────────────────────────────────────────────────

  fastify.get('/products', { preHandler: [authenticate] }, async (req) => {
    return ok(await productSvc.getProducts(req.query));
  });

  fastify.get('/products/:id', { preHandler: [authenticate] }, async (req, reply) => {
    const product = await productSvc.getProduct(req.params.id);
    if (!product) return reply.code(404).send({ error: 'Product not found' });
    return ok(product);
  });

  fastify.post('/products', { preHandler: [authenticate] }, async (req, reply) => {
    const product = await productSvc.createProduct(req.body ?? {}, req.user?.employee_id);
    return reply.status(201).send(ok(product));
  });

  fastify.put('/products/:id', { preHandler: [authenticate] }, async (req) => {
    return ok(await productSvc.updateProduct(req.params.id, req.body ?? {}));
  });

  fastify.delete('/products/:id', { preHandler: [authenticate] }, async (req, reply) => {
    await productSvc.deleteProduct(req.params.id);
    return reply.status(204).send();
  });

  // ── System Announcements (visible to all authenticated users) ─
  const AnnouncementService = require('../../services/platform/announcement.service');
  const announceSvc = new AnnouncementService(fastify.prisma);

  fastify.get('/announcements', { preHandler: [authenticate] }, async (req) => {
    const role = req.user?.role || 'user';
    const announcements = await announceSvc.getActiveForUser(role);
    return ok(announcements);
  });
};
