'use strict';

const { authenticate, requireAdmin } = require('../../middleware/authenticate');
const DashboardService      = require('../../services/dashboard.service');
const WorkflowEngineService = require('../../services/workflow.service');
const CacheService          = require('../../services/cache.service');
const PermissionService     = require('../../services/permission.service');
const AssignmentService     = require('../../services/assignment.service');
const IntegrationService    = require('../../services/integration.service');
const ForecastService       = require('../../services/forecast.service');
const NotificationService   = require('../../services/notification.service');
const RecordService         = require('../../services/record.service');
const DocumentConfigService = require('../../services/document-config.service');
const DocumentTemplateService = require('../../services/document-template.service');
const RequestUtils          = require('../../utils/requestUtils');
const { ok, created }       = require('../../utils/response');
const { ValidationError }   = require('../../utils/errors');
const { requireFeature }    = require('../../middleware/require-feature');

/**
 * Metadata entities that can carry per-role view/edit rows. Named once so the
 * read and write routes cannot drift apart.
 */
const UI_PERMISSION_ENTITY_TYPES = ['module', 'object', 'field', 'form', 'pipeline', 'wizard', 'dashboard', 'workflow'];

module.exports = async function builderRoutes(fastify) {
  const cache       = new CacheService(fastify.redis);
  const svc         = new DashboardService(fastify.prisma, cache);
  const permSvc     = new PermissionService(fastify.prisma);
  const assignSvc   = new AssignmentService(fastify.prisma);
  // Reuse the singleton wired to the event bus + workflow engine in app.js.
  const integSvc    = fastify.integrationService ?? new IntegrationService(fastify.prisma);
  const forecastSvc = new ForecastService(fastify.prisma);
  const recordSvc   = new RecordService(fastify.prisma, fastify.eventBus);
  const docCfg      = new DocumentConfigService(fastify.prisma);
  const docTpl      = new DocumentTemplateService(fastify.prisma);
  // Reuse the engine already registered on fastify (shares Prisma connection)
  const wfEngine    = fastify.workflowEngine ?? new WorkflowEngineService(fastify.prisma);

  // ── DASHBOARDS ────────────────────────────────────────────

  // Builder context: admins always see ALL dashboards regardless of min_role
  fastify.get('/dashboards', { preHandler: [authenticate] }, async () => {
    return ok(await svc.getDashboards());
  });

  // GET /builder/roles — role list for the "Visible to" dropdown in builder UIs
  fastify.get('/roles', { preHandler: [authenticate] }, async () => {
    const roles = await fastify.prisma.role.findMany({
      where:   { is_active: true },
      orderBy: { id: 'asc' },
      select:  { name: true, label: true, level: true },
    });
    return ok(roles);
  });

  fastify.get('/dashboards/:id', { preHandler: [authenticate] }, async (req) => {
    return ok(await svc.getDashboard(Number(req.params.id)));
  });

  fastify.post('/dashboards', { preHandler: [requireAdmin] }, async (req, reply) => {
    reply.code(201);
    return created(await svc.createDashboard({ ...req.body, created_by: req.user.employeeId }));
  });

  fastify.put('/dashboards/:id', { preHandler: [requireAdmin] }, async (req) => {
    return ok(await svc.updateDashboard(Number(req.params.id), req.body));
  });

  fastify.delete('/dashboards/:id', { preHandler: [requireAdmin] }, async (req, reply) => {
    await svc.deleteDashboard(Number(req.params.id));
    reply.code(204).send();
  });

  // ── WIDGETS ──────────────────────────────────────────────

  fastify.post('/dashboards/:id/widgets', { preHandler: [requireAdmin] }, async (req, reply) => {
    reply.code(201);
    return created(await svc.addWidget(Number(req.params.id), req.body));
  });

  fastify.put('/widgets/:id', { preHandler: [requireAdmin] }, async (req) => {
    return ok(await svc.updateWidget(Number(req.params.id), req.body));
  });

  fastify.delete('/widgets/:id', { preHandler: [requireAdmin] }, async (req, reply) => {
    await svc.deleteWidget(Number(req.params.id));
    reply.code(204).send();
  });

  // PUT /builder/widget-positions — bulk update positions after DnD
  fastify.put('/widget-positions', { preHandler: [requireAdmin] }, async (req) => {
    await svc.updateWidgetPositions(req.body.positions);
    return ok({ updated: true });
  });

  // ── CHARTS ───────────────────────────────────────────────

  fastify.get('/charts', { preHandler: [authenticate] }, async () => {
    return ok(await svc.getCharts());
  });

  fastify.get('/charts/:id', { preHandler: [authenticate] }, async (req) => {
    return ok(await svc.getChart(Number(req.params.id)));
  });

  fastify.post('/charts', { preHandler: [requireAdmin] }, async (req, reply) => {
    reply.code(201);
    return created(await svc.createChart(req.body));
  });

  fastify.put('/charts/:id', { preHandler: [requireAdmin] }, async (req) => {
    return ok(await svc.updateChart(Number(req.params.id), req.body));
  });

  fastify.delete('/charts/:id', { preHandler: [requireAdmin] }, async (req, reply) => {
    await svc.deleteChart(Number(req.params.id));
    reply.code(204).send();
  });

  // ── PIPELINES ─────────────────────────────────────────────

  fastify.get('/pipelines', { preHandler: [authenticate] }, async (req) => {
    return ok(await svc.getPipelines(req.query.object_id ? Number(req.query.object_id) : undefined));
  });

  fastify.get('/pipelines/:id', { preHandler: [authenticate] }, async (req) => {
    return ok(await svc.getPipeline(Number(req.params.id)));
  });

  fastify.post('/pipelines', { preHandler: [requireAdmin] }, async (req, reply) => {
    reply.code(201);
    const actorId = req.user?.employee_id ?? req.user?.employeeId ?? null;
    return created(await svc.createPipeline(req.body, actorId));
  });

  fastify.put('/pipelines/:id', { preHandler: [requireAdmin] }, async (req) => {
    const actorId = req.user?.employee_id ?? req.user?.employeeId ?? null;
    return ok(await svc.updatePipelineWithStages(Number(req.params.id), req.body, actorId));
  });

  fastify.delete('/pipelines/:id', { preHandler: [requireAdmin] }, async (req, reply) => {
    const actorId = req.user?.employee_id ?? req.user?.employeeId ?? null;
    await svc.deletePipeline(Number(req.params.id), actorId);
    reply.code(204).send();
  });

  // GET /builder/pipelines/:id/audit — the pipeline's config change history (admin)
  fastify.get('/pipelines/:id/audit', { preHandler: [requireAdmin] }, async (req) => {
    return ok(await svc.getPipelineAudit(Number(req.params.id), req.query.limit));
  });

  // ── DOCUMENT MANAGEMENT BUILDER ────────────────────────────
  // Tenant-configurable DMS: categories (with per-category MIME / size /
  // retention / review policy) and required-document checklists per entity.
  // Reads are open to any authenticated user (the standalone Documents module
  // consumes them); mutations are admin-only.

  // Categories
  fastify.get('/document-categories', { preHandler: [authenticate] }, async (req) => {
    return ok(await docCfg.listCategories({ includeInactive: req.query.all === 'true' }));
  });
  fastify.get('/document-categories/:id', { preHandler: [authenticate] }, async (req) => {
    return ok(await docCfg.getCategory(Number(req.params.id)));
  });
  fastify.post('/document-categories', { preHandler: [requireAdmin] }, async (req, reply) => {
    return created(await docCfg.createCategory(req.body ?? {}));
  });
  fastify.put('/document-categories/:id', { preHandler: [requireAdmin] }, async (req) => {
    return ok(await docCfg.updateCategory(Number(req.params.id), req.body ?? {}));
  });
  fastify.delete('/document-categories/:id', { preHandler: [requireAdmin] }, async (req, reply) => {
    await docCfg.deleteCategory(Number(req.params.id));
    return reply.code(204).send();
  });

  // Checklists
  fastify.get('/document-checklists', { preHandler: [authenticate] }, async (req) => {
    return ok(await docCfg.listChecklists({ entityType: req.query.entity_type }));
  });
  fastify.get('/document-checklists/:id', { preHandler: [authenticate] }, async (req) => {
    return ok(await docCfg.getChecklist(Number(req.params.id)));
  });
  fastify.post('/document-checklists', { preHandler: [requireAdmin] }, async (req, reply) => {
    return created(await docCfg.createChecklist(req.body ?? {}));
  });
  fastify.put('/document-checklists/:id', { preHandler: [requireAdmin] }, async (req) => {
    return ok(await docCfg.updateChecklist(Number(req.params.id), req.body ?? {}));
  });
  fastify.delete('/document-checklists/:id', { preHandler: [requireAdmin] }, async (req, reply) => {
    await docCfg.deleteChecklist(Number(req.params.id));
    return reply.code(204).send();
  });

  // Document merge templates
  fastify.get('/document-templates', { preHandler: [authenticate] }, async (req) => {
    return ok(await docTpl.listTemplates({ entityType: req.query.entity_type, includeInactive: req.query.all === 'true' }));
  });
  fastify.get('/document-templates/:id', { preHandler: [authenticate] }, async (req) => {
    return ok(await docTpl.getTemplate(Number(req.params.id)));
  });
  fastify.post('/document-templates', { preHandler: [requireAdmin] }, async (req, reply) => {
    return created(await docTpl.createTemplate(req.body ?? {}));
  });
  fastify.put('/document-templates/:id', { preHandler: [requireAdmin] }, async (req) => {
    return ok(await docTpl.updateTemplate(Number(req.params.id), req.body ?? {}));
  });
  fastify.delete('/document-templates/:id', { preHandler: [requireAdmin] }, async (req, reply) => {
    await docTpl.deleteTemplate(Number(req.params.id));
    return reply.code(204).send();
  });

  // ── TRASH (admin-only record recovery) ─────────────────────
  // Records that users soft-deleted (when the tenant's delete mode is 'soft')
  // land here. End users never see this — it's the admin's recovery bin.

  // GET /builder/trash/records?object_id= — list soft-deleted records (hydrated)
  fastify.get('/trash/records', { preHandler: [requireAdmin] }, async (req) => {
    const objectId = req.query.object_id ? Number(req.query.object_id) : undefined;
    const records  = await recordSvc.getTrashedRecords({ objectId });
    return ok(records);
  });

  // POST /builder/trash/records/:id/restore — restore a record to its live list
  fastify.post('/trash/records/:id/restore', { preHandler: [requireAdmin] }, async (req) => {
    const actorId = req.user?.employee_id ?? req.user?.employeeId ?? null;
    return ok(await recordSvc.restoreRecord(Number(req.params.id), actorId));
  });

  // DELETE /builder/trash/records/:id — permanently delete a trashed record (204)
  fastify.delete('/trash/records/:id', { preHandler: [requireAdmin] }, async (req, reply) => {
    const actorId = req.user?.employee_id ?? req.user?.employeeId ?? null;
    await recordSvc.purgeRecord(Number(req.params.id), actorId);
    reply.code(204).send();
  });

  // ── WORKFLOWS ────────────────────────────────────────────

  fastify.get('/workflows', { preHandler: [authenticate] }, async (req) => {
    return ok(await svc.getWorkflows(req.query.object_id ? Number(req.query.object_id) : undefined));
  });

  fastify.get('/workflows/:id', { preHandler: [authenticate] }, async (req) => {
    return ok(await svc.getWorkflow(Number(req.params.id)));
  });

  fastify.post('/workflows', { preHandler: [requireAdmin, requireFeature('auto_workflows')] }, async (req, reply) => {
    reply.code(201);
    return created(await svc.createWorkflow(req.body));
  });

  fastify.put('/workflows/:id', { preHandler: [requireAdmin, requireFeature('auto_workflows')] }, async (req) => {
    return ok(await svc.updateWorkflow(Number(req.params.id), req.body));
  });

  fastify.delete('/workflows/:id', { preHandler: [requireAdmin] }, async (req, reply) => {
    await svc.deleteWorkflow(Number(req.params.id));
    reply.code(204).send();
  });

  // POST /builder/workflows/:id/run — manually execute a workflow for testing
  // Body (optional): { record_id: 123 }  — supply a record for field-level steps
  fastify.post('/workflows/:id/run', { preHandler: [requireAdmin, requireFeature('auto_workflows')] }, async (req) => {
    const { record_id } = req.body ?? {};
    let record = null;
    if (record_id) {
      record = await fastify.prisma.record.findUnique({ where: { id: Number(record_id) } });
    }
    const log = await wfEngine.manualRun(Number(req.params.id), record, req.user?.employee_id);
    return ok({ workflow_id: Number(req.params.id), steps_executed: log.length, log });
  });

  // ── WORKFLOW STEPS ────────────────────────────────────────

  fastify.post('/workflows/:id/steps', { preHandler: [requireAdmin, requireFeature('auto_workflows')] }, async (req, reply) => {
    reply.code(201);
    return created(await svc.addWorkflowStep(Number(req.params.id), req.body));
  });

  fastify.put('/workflow-steps/:id', { preHandler: [requireAdmin] }, async (req) => {
    return ok(await svc.updateWorkflowStep(Number(req.params.id), req.body));
  });

  fastify.delete('/workflow-steps/:id', { preHandler: [requireAdmin] }, async (req, reply) => {
    await svc.deleteWorkflowStep(Number(req.params.id));
    reply.code(204).send();
  });

  // ── WIZARDS ──────────────────────────────────────────────

  fastify.get('/wizards', { preHandler: [authenticate] }, async (req) => {
    return ok(await svc.getWizards(req.query.object_id ? Number(req.query.object_id) : undefined));
  });

  fastify.get('/wizards/:id', { preHandler: [authenticate] }, async (req) => {
    return ok(await svc.getWizard(Number(req.params.id)));
  });

  fastify.post('/wizards', { preHandler: [requireAdmin] }, async (req, reply) => {
    reply.code(201);
    return created(await svc.createWizard(req.body));
  });

  fastify.put('/wizards/:id', { preHandler: [requireAdmin] }, async (req) => {
    return ok(await svc.updateWizard(Number(req.params.id), req.body));
  });

  fastify.delete('/wizards/:id', { preHandler: [requireAdmin] }, async (req, reply) => {
    await svc.deleteWizard(Number(req.params.id));
    reply.code(204).send();
  });

  // ── WIZARD STEPS ─────────────────────────────────────────

  fastify.post('/wizards/:id/steps', { preHandler: [requireAdmin] }, async (req, reply) => {
    reply.code(201);
    return created(await svc.addWizardStep(Number(req.params.id), req.body));
  });

  fastify.put('/wizard-steps/:id', { preHandler: [requireAdmin] }, async (req) => {
    return ok(await svc.updateWizardStep(Number(req.params.id), req.body));
  });

  fastify.delete('/wizard-steps/:id', { preHandler: [requireAdmin] }, async (req, reply) => {
    await svc.deleteWizardStep(Number(req.params.id));
    reply.code(204).send();
  });

  fastify.put('/wizards/:id/reorder', { preHandler: [requireAdmin] }, async (req) => {
    return ok(await svc.reorderWizardSteps(Number(req.params.id), req.body.steps));
  });

  // ── METADATA ENTITY PERMISSIONS ──────────────────────────────────────────
  // entity_type: module | object | field | form | pipeline | wizard

  /**
   * GET /builder/permissions/:entityType/:entityId
   * Returns all role permission rows for this entity.
   * Also returns the full role list so the UI can show roles with no explicit row.
   */
  fastify.get('/permissions/:entityType/:entityId', { preHandler: [authenticate] }, async (req) => {
    const { entityType, entityId } = req.params;
    const [permissions, roles] = await Promise.all([
      permSvc.getEntityPermissions(entityType, Number(entityId), req.user?.tenant_id),
      fastify.prisma.role.findMany({
        where:   { is_active: true },
        orderBy: { id: 'asc' },
        select:  { name: true, label: true, level: true },
      }),
    ]);
    return ok({ entity_type: entityType, entity_id: Number(entityId), permissions, roles });
  });

  /**
   * PUT /builder/permissions/:entityType/:entityId
   * Body: { permissions: [{ role_name, can_view, can_edit }] }
   * Upserts all provided role-permission rows for the entity.
   * Admin-only.
   */
  fastify.put('/permissions/:entityType/:entityId', { preHandler: [requireAdmin] }, async (req) => {
    const { entityType, entityId } = req.params;
    const { permissions = [] } = req.body ?? {};
    const actorId = req.user?.employee_id ?? req.user?.employeeId;

    if (!UI_PERMISSION_ENTITY_TYPES.includes(entityType)) {
      throw new ValidationError(`Invalid entity_type: ${entityType}. Expected one of: ${UI_PERMISSION_ENTITY_TYPES.join(', ')}.`);
    }

    const result = await permSvc.setEntityPermissions(
      entityType, Number(entityId), permissions, actorId, req.user?.tenant_id,
    );
    return ok({ updated: result.length, permissions: result });
  });

  // ── OPERATIONAL PERMISSIONS ──────────────────────────────────────────────
  // entity_type: task | activity

  /**
   * GET /builder/permissions/operational
   * Query: ?entity_type=task (optional filter)
   * Returns all operational permissions, plus defaults for roles without explicit rows.
   */
  fastify.get('/permissions/operational', { preHandler: [authenticate] }, async (req) => {
    const { entity_type } = req.query;
    const [permissions, roles] = await Promise.all([
      permSvc.getAllOperationalPermissions(entity_type),
      fastify.prisma.role.findMany({
        where:   { is_active: true },
        orderBy: { id: 'asc' },
        select:  { name: true, label: true, level: true },
      }),
    ]);
    // Merge defaults so the UI can always show a complete picture
    const { defaultPermsForLevel } = require('../../services/permission.service');
    const merged = {};
    for (const et of (entity_type ? [entity_type] : ['task', 'activity'])) {
      merged[et] = {};
      for (const role of roles) {
        const explicit = permissions.find(
          p => p.entity_type === et && p.role_name === role.name,
        );
        merged[et][role.name] = explicit ?? {
          entity_type:  et,
          role_name:    role.name,
          ...defaultPermsForLevel(role.level ?? 1),
          _is_default:  true,
        };
      }
    }
    return ok({ permissions, roles, merged });
  });

  /**
   * PUT /builder/permissions/operational/:entityType/:roleName
   * Body: { view_scope, create_scope, edit_scope, delete_scope, assign_scope }
   * Admin-only.
   */
  fastify.put('/permissions/operational/:entityType/:roleName', { preHandler: [requireAdmin] }, async (req) => {
    const { entityType, roleName } = req.params;
    const actorId = req.user?.employee_id ?? req.user?.employeeId;

    const VALID_ENTITY_TYPES = ['task', 'activity', 'record'];
    if (!VALID_ENTITY_TYPES.includes(entityType)) {
      throw new ValidationError(`Invalid entity_type: ${entityType}`);
    }

    const result = await permSvc.setOperationalPermission(
      entityType, roleName, req.body ?? {}, actorId,
    );
    return ok(result);
  });

  // ── ASSIGNMENT RULES ──────────────────────────────────────────────────────

  fastify.get('/assignment-rules', { preHandler: [authenticate] }, async (req) => {
    return ok(await assignSvc.getRules(req.query.object_id));
  });

  fastify.get('/assignment-rules/:id', { preHandler: [authenticate] }, async (req) => {
    return ok(await assignSvc.getRule(Number(req.params.id)));
  });

  fastify.post('/assignment-rules', { preHandler: [requireAdmin, requireFeature('auto_assignment')] }, async (req, reply) => {
    reply.code(201);
    return created(await assignSvc.createRule(req.body));
  });

  fastify.put('/assignment-rules/:id', { preHandler: [requireAdmin, requireFeature('auto_assignment')] }, async (req) => {
    return ok(await assignSvc.updateRule(Number(req.params.id), req.body));
  });

  fastify.delete('/assignment-rules/:id', { preHandler: [requireAdmin] }, async (req, reply) => {
    await assignSvc.deleteRule(Number(req.params.id));
    reply.code(204).send();
  });

  // PUT /builder/assignment-rules/reorder — bulk reorder for an object
  fastify.put('/assignment-rules/reorder', { preHandler: [requireAdmin] }, async (req) => {
    const { object_id, ordered_ids } = req.body ?? {};
    return ok(await assignSvc.reorderRules(Number(object_id), ordered_ids ?? []));
  });

  /**
   * POST /builder/assignment-rules/explain — who would get this record?
   *
   * Body: `{ object_id, record_id? , fields? }`. A dry run of `assign()`: every
   * active rule for the object is evaluated in order and reported, and the
   * decision is returned without writing anything or advancing a rotation.
   * This is the simulator behind the Builder's "Test these rules" panel.
   */
  fastify.post('/assignment-rules/explain', { preHandler: [requireAdmin] }, async (req) => {
    const { object_id, record_id, fields } = req.body ?? {};
    if (!object_id) throw new ValidationError('object_id is required');
    if (!record_id && !fields) throw new ValidationError('Give a record_id to test an existing record, or fields to test a hypothetical one');
    return ok(await assignSvc.explain(Number(object_id), { recordId: record_id ?? null, fields: fields ?? null }));
  });

  // GET /builder/assignment-logs?record_id=X&object_id=Y
  fastify.get('/assignment-logs', { preHandler: [authenticate] }, async (req) => {
    return ok(await assignSvc.getLogs(req.query));
  });

  // ── QUOTAS ────────────────────────────────────────────────────────────────

  fastify.get('/quotas', { preHandler: [authenticate] }, async (req) => {
    return ok(await forecastSvc.getQuotas(req.query));
  });

  fastify.post('/quotas', { preHandler: [requireAdmin] }, async (req, reply) => {
    reply.code(201);
    return created(await forecastSvc.setQuota(req.body));
  });

  fastify.delete('/quotas/:id', { preHandler: [requireAdmin] }, async (req, reply) => {
    await forecastSvc.deleteQuota(Number(req.params.id));
    reply.code(204).send();
  });

  // ── INTEGRATIONS ─────────────────────────────────────────────────────────

  // Integration reads are admin-only: the rows carry signing secrets
  // (`config.secret`) and outbound auth headers (`config.headers`), which must
  // not be exposed to non-admin users. Writes are already requireAdmin.
  fastify.get('/integrations', { preHandler: [requireAdmin] }, async () => {
    return ok(await integSvc.listIntegrations());
  });

  // Metadata-driven event catalog for the subscription picker: generic
  // record.* events + a per-object variant for every active object.
  fastify.get('/integrations/event-catalog', { preHandler: [requireAdmin] }, async () => {
    return ok(await integSvc.getEventCatalog());
  });

  fastify.get('/integrations/:id', { preHandler: [requireAdmin] }, async (req) => {
    return ok(await integSvc.getIntegration(Number(req.params.id)));
  });

  fastify.post('/integrations', { preHandler: [requireAdmin] }, async (req, reply) => {
    reply.code(201);
    return created(await integSvc.createIntegration(req.body));
  });

  fastify.put('/integrations/:id', { preHandler: [requireAdmin] }, async (req) => {
    return ok(await integSvc.updateIntegration(Number(req.params.id), req.body));
  });

  fastify.delete('/integrations/:id', { preHandler: [requireAdmin] }, async (req, reply) => {
    await integSvc.deleteIntegration(Number(req.params.id));
    reply.code(204).send();
  });

  // POST /builder/integrations/:id/toggle — activate or deactivate
  fastify.post('/integrations/:id/toggle', { preHandler: [requireAdmin] }, async (req) => {
    const { is_active } = req.body ?? {};
    return ok(await integSvc.toggleIntegration(Number(req.params.id), Boolean(is_active)));
  });

  // POST /builder/integrations/:id/test — fire a test payload
  fastify.post('/integrations/:id/test', { preHandler: [requireAdmin] }, async (req) => {
    const result = await integSvc.executeIntegration(Number(req.params.id), req.body ?? { _test: true });
    return ok(result);
  });

  // GET /builder/integrations/:id/logs
  fastify.get('/integrations/:id/logs', { preHandler: [requireAdmin] }, async (req) => {
    return ok(await integSvc.getIntegrationLogs(Number(req.params.id), req.query.limit));
  });

  // GET /builder/integrations/:id/stats — execution health summary
  fastify.get('/integrations/:id/stats', { preHandler: [requireAdmin] }, async (req) => {
    return ok(await integSvc.getIntegrationStats(Number(req.params.id)));
  });

  // POST /builder/integrations/logs/:logId/retry — re-run a failed execution
  fastify.post('/integrations/logs/:logId/retry', { preHandler: [requireAdmin] }, async (req) => {
    return ok(await integSvc.retryIntegration(Number(req.params.logId)));
  });

  // ── PUSH NOTIFICATIONS ────────────────────────────────────────
  const notifSvc = new NotificationService(fastify.prisma);

  // GET /builder/push-notifications — history of sent push notifications
  fastify.get('/push-notifications', { preHandler: [requireAdmin] }, async () => {
    const logs = await fastify.prisma.pushNotificationLog.findMany({
      orderBy: { created_at: 'desc' },
      take: 100,
    });
    return ok(logs);
  });

  // POST /builder/push-notifications — send ad-hoc push notification
  fastify.post('/push-notifications', { preHandler: [requireAdmin] }, async (req, reply) => {
    const { title, body, link, target_type, target_value } = req.body ?? {};
    const sentBy = RequestUtils.getUserId(req);

    // Use real HTTP status codes — returning a plain { statusCode } object
    // serializes as a 200 and the UI reports a false success.
    if (!title?.trim()) return reply.code(400).send({ error: 'title is required' });
    if (!['all', 'role', 'employee'].includes(target_type)) {
      return reply.code(400).send({ error: 'target_type must be all, role, or employee' });
    }

    // Resolve recipient employee IDs
    let employees;
    if (target_type === 'all') {
      employees = await fastify.prisma.employee.findMany({
        where: { is_active: true },
        select: { employee_id: true },
      });
    } else if (target_type === 'role') {
      const roles = Array.isArray(target_value) ? target_value : [target_value];
      employees = await fastify.prisma.employee.findMany({
        where: { is_active: true, role: { name: { in: roles } } },
        select: { employee_id: true },
      });
    } else {
      // target_type === 'employee'
      const ids = Array.isArray(target_value) ? target_value : [target_value];
      employees = ids.map(id => ({ employee_id: id }));
    }

    const recipientIds = employees.map(e => e.employee_id);

    // No recipients resolved (e.g. a role/employee target that matches no active
    // user) — tell the caller instead of logging a phantom "sent" with 0 recipients.
    if (!recipientIds.length) {
      return reply.code(422).send({ error: 'No active recipients matched the selected target.' });
    }

    await notifSvc.broadcastNotification(recipientIds, {
      type:  'system',
      title: title.trim(),
      body:  body?.trim() || null,
      link:  link?.trim() || null,
    });

    // Log the push notification
    const log = await fastify.prisma.pushNotificationLog.create({
      data: {
        title:           title.trim(),
        body:            body?.trim() || null,
        link:            link?.trim() || null,
        target_type,
        target_value:    target_value ?? null,
        recipient_count: recipientIds.length,
        sent_by:         sentBy,
      },
    });

    return created(log);
  });
};
