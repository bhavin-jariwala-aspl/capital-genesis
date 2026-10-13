'use strict';

const { NotFoundError, ValidationError } = require('../utils/errors');
const { NO_ACCESS_LEVEL, ADMIN_THRESHOLD } = require('../middleware/authenticate');
const { roleLevelFor } = require('./role-level');
const { logger }       = require('./logging.service');

const parseBool = v => v === 'true' || v === true;

/**
 * Trigger types the workflow engine dispatches per object, and therefore the
 * ones that need an object to be bound to.
 *
 * `WorkflowEngineService.trigger()` and `.triggerFieldChanged()` both query
 * `where: { object_id, trigger_type, is_active }`, so a workflow with no
 * `object_id` matches no event — ever. The Builder's create form had no object
 * field at all, which meant every record-triggered workflow built through the
 * UI was inert on save with nothing to indicate it. `scheduled` (swept by the
 * scheduler across all objects) and `manual` (invoked by id) are the two that
 * legitimately need no binding.
 */
const OBJECT_BOUND_TRIGGERS = Object.freeze(['on_create', 'on_update', 'on_delete', 'field_changed']);

/** Every trigger type the engine understands. */
const WORKFLOW_TRIGGERS = Object.freeze([...OBJECT_BOUND_TRIGGERS, 'scheduled', 'manual']);

/**
 * Refuse a workflow the engine could never fire.
 *
 * Saving one is strictly worse than rejecting it: the author believes the
 * automation is live, and nothing in the product says otherwise.
 */
function assertWorkflowTriggerable(wf) {
  const trigger = wf?.trigger_type;
  if (trigger && !WORKFLOW_TRIGGERS.includes(trigger)) {
    throw new ValidationError(`trigger_type must be one of: ${WORKFLOW_TRIGGERS.join(', ')}`);
  }
  if (OBJECT_BOUND_TRIGGERS.includes(trigger) && !wf.object_id) {
    throw new ValidationError(
      `A "${trigger}" workflow must be bound to an object — that is how the engine finds it when a record changes. `
      + 'Pick an object, or use the "scheduled" or "manual" trigger instead.',
    );
  }
}

/**
 * Whitelist writable columns for a wizard step, dropping unknown keys
 * (e.g. legacy `validation_rules`, the nested `form` relation, timestamps)
 * that would otherwise make Prisma reject the write. Step validation now
 * lives on `config.validation`.
 */
const pickWizardStepFields = (data = {}) => {
  const out = {};
  if (data.name        !== undefined) out.name        = data.name;
  if (data.label       !== undefined) out.label       = data.label;
  if (data.description !== undefined) out.description  = data.description;
  if (data.form_id     !== undefined) out.form_id      = data.form_id === null ? null : Number(data.form_id);
  if (data.order_index !== undefined) out.order_index  = data.order_index;
  if (data.config      !== undefined) out.config       = data.config;
  return out;
};

class DashboardService {
  constructor(prisma, cache) {
    this.db    = prisma;
    this.cache = cache;
  }

  /**
   * A role's level for this tenant, via the shared resolver — see
   * services/role-level.js. Returns null for a name that resolves to no access,
   * which `canSeeDashboard` treats as a dangling `min_role`.
   */
  async #roleLevel(roleName) {
    if (!roleName) return null;
    const level = await roleLevelFor(this.db, roleName, null);
    return level >= NO_ACCESS_LEVEL ? null : level;
  }

  /**
   * Can a viewer at `viewerLevel` see a dashboard gated on `minRole`?
   *
   * ── The comparison used to be the wrong way round ─────────────────────────
   * Levels are inverted (1 = platform admin, 5 = ordinary user), and the schema
   * defines `min_role` as the LEAST powerful role admitted: "'manager' =
   * manager + admin + super_admin only". So a viewer is admitted when their
   * level is at least as powerful as the bar — `viewerLevel <= minLevel`.
   *
   * The code asked `minLevel <= viewerLevel`, which inverts the gate: a board
   * restricted to managers (4) was hidden from admins (3) and super admins (2)
   * and shown to every ordinary user (5) instead. That is
   * not just a display quirk — `min_role` is the only restriction on a
   * dashboard with no explicit `UiPermission` row, which is the default for
   * anything built by hand.
   *
   * A `min_role` naming a role that no longer exists is treated as
   * admin-and-above: a dangling restriction must never widen access, but the
   * board still has to be reachable by someone who can repair it.
   */
  static canSeeDashboard(viewerLevel, minLevel) {
    if (minLevel == null) return viewerLevel <= ADMIN_THRESHOLD;
    return viewerLevel <= minLevel;
  }

  /**
   * Return dashboards visible to the given role.
   *   viewerRole = undefined/null  → builder/admin context: return all active dashboards
   *   viewerRole = a role name     → filter by `min_role`
   *
   * An unresolvable viewer role gets NO_ACCESS_LEVEL rather than level 1: an
   * unrecognised viewer used to be treated as a platform admin.
   */
  async getDashboards(viewerRole) {
    if (!viewerRole) {
      // Builder or unauthenticated admin context — return everything
      return this.cache.remember(
        this.cache.key('dashboards', 'all'),
        () => this.db.uiDashboard.findMany({
          where:   { is_active: true },
          orderBy: { created_at: 'asc' },
        }),
      );
    }

    const cacheKey = this.cache.key('dashboards', 'role', viewerRole);

    return this.cache.remember(cacheKey, async () => {
      const viewerLevel = (await this.#roleLevel(viewerRole)) ?? NO_ACCESS_LEVEL;
      const all = await this.db.uiDashboard.findMany({
        where:   { is_active: true },
        orderBy: { created_at: 'asc' },
      });
      const gated = all.filter((d) => d.min_role !== null);
      const levels = new Map(await Promise.all(
        [...new Set(gated.map((d) => d.min_role))].map(async (n) => [n, await this.#roleLevel(n)]),
      ));
      return all.filter(
        (d) => d.min_role === null || DashboardService.canSeeDashboard(viewerLevel, levels.get(d.min_role)),
      );
    });
  }

  /** Whether `viewerRole` may open the dashboard gated on `minRole`. */
  async canViewDashboard(viewerRole, minRole) {
    if (!minRole) return true;
    const viewerLevel = (await this.#roleLevel(viewerRole)) ?? NO_ACCESS_LEVEL;
    return DashboardService.canSeeDashboard(viewerLevel, await this.#roleLevel(minRole));
  }

  async getDashboard(id) {
    return this.cache.remember(
      this.cache.key('dashboard', id),
      async () => {
        const dash = await this.db.uiDashboard.findUnique({
          where:   { id },
          include: {
            widgets: {
              where:   { is_active: true },
              orderBy: { order_index: 'asc' },
              include: { chart: true },
            },
          },
        });
        if (!dash) throw new NotFoundError('Dashboard');
        return dash;
      },
    );
  }

  async createDashboard(data) {
    const { widgets, ...dashData } = data;
    if (dashData.is_active !== undefined) dashData.is_active = parseBool(dashData.is_active);
    const dash = await this.db.uiDashboard.create({ data: dashData });
    if (widgets?.length) {
      await this.db.uiDashboardWidget.createMany({
        data: widgets.map((w) => ({ ...w, dashboard_id: dash.id })),
      });
    }
    await this.cache.invalidateDashboard(dash.id);
    return this.getDashboard(dash.id);
  }

  async updateDashboard(id, data) {
    const { widgets: _widgets, id: _id, created_at, updated_at, ...dashData } = data;
    if (dashData.is_active !== undefined) dashData.is_active = parseBool(dashData.is_active);
    const dash = await this.db.uiDashboard.update({ where: { id }, data: dashData });
    await this.cache.invalidateDashboard(id);
    return dash;
  }

  async deleteDashboard(id) {
    await this.db.uiDashboard.delete({ where: { id } });
    await this.cache.invalidateDashboard(id);
  }

  // ── Widget management ───────────────────────────────────

  async addWidget(dashboardId, data) {
    const widget = await this.db.uiDashboardWidget.create({
      data:    { ...data, dashboard_id: dashboardId },
      include: { chart: true },
    });
    await this.cache.invalidateDashboard(dashboardId);
    return widget;
  }

  async updateWidget(widgetId, data) {
    const { id: _id, created_at, updated_at, dashboard_id, chart, ...widgetData } = data;
    if (widgetData.is_active !== undefined) widgetData.is_active = parseBool(widgetData.is_active);
    const widget = await this.db.uiDashboardWidget.update({
      where:   { id: widgetId },
      data:    widgetData,
      include: { chart: true },
    });
    await this.cache.invalidateDashboard(widget.dashboard_id);
    return widget;
  }

  async deleteWidget(widgetId) {
    const widget = await this.db.uiDashboardWidget.findUnique({ where: { id: widgetId } });
    if (!widget) throw new NotFoundError('Widget');
    await this.db.uiDashboardWidget.delete({ where: { id: widgetId } });
    await this.cache.invalidateDashboard(widget.dashboard_id);
  }

  /** Bulk-update widget positions (after drag-and-drop rearrangement) */
  async updateWidgetPositions(positions) {
    // positions: [{ id, x, y, w, h }, ...]
    const updates = positions.map(({ id, x, y, w, h }) =>
      this.db.uiDashboardWidget.update({ where: { id }, data: { x, y, w, h } }),
    );
    await Promise.all(updates);
    // Invalidate dashboards that contain these widgets
    const widgets = await this.db.uiDashboardWidget.findMany({
      where:  { id: { in: positions.map((p) => p.id) } },
      select: { dashboard_id: true },
    });
    const dashIds = [...new Set(widgets.map((w) => w.dashboard_id))];
    // Invalidations are independent — run them concurrently.
    await Promise.all(dashIds.map((dashId) => this.cache.invalidateDashboard(dashId)));
  }

  // ── Chart management ────────────────────────────────────

  async getCharts() {
    return this.db.uiChart.findMany({
      where:   { is_active: true },
      orderBy: { created_at: 'asc' },
    });
  }

  async getChart(id) {
    const chart = await this.db.uiChart.findUnique({ where: { id } });
    if (!chart) throw new NotFoundError('Chart');
    return chart;
  }

  async createChart(data) {
    return this.db.uiChart.create({ data });
  }

  async updateChart(id, data) {
    const { id: _id, created_at, updated_at, ...chartData } = data;
    const chart = await this.db.uiChart.update({ where: { id }, data: chartData });
    // Invalidate any dashboard that uses this chart
    await this.cache.delPattern('dashboard:*');
    return chart;
  }

  async deleteChart(id) {
    await this.db.uiChart.delete({ where: { id } });
    await this.cache.delPattern('dashboard:*');
  }

  // ── Pipeline management ─────────────────────────────────

  async getPipelines(objectId) {
    const where = objectId
      ? { object_id: objectId, is_active: true }
      : {};
    const cached = objectId
      ? await this.cache.remember(
          this.cache.key('pipeline', 'object', objectId),
          () => this.db.uiPipeline.findMany({
            where,
            include: {
              stages: { orderBy: { order_index: 'asc' } },
              object: { include: { module: true } },
            },
          }),
        )
      : await this.db.uiPipeline.findMany({
          where,
          include: {
            stages: { orderBy: { order_index: 'asc' } },
            object: { include: { module: true } },
          },
          orderBy: { created_at: 'asc' },
        });
    return cached;
  }

  async getPipeline(id) {
    const pipeline = await this.db.uiPipeline.findUnique({
      where:   { id },
      include: {
        stages: { orderBy: { order_index: 'asc' } },
        object: { include: { module: true } },
      },
    });
    if (!pipeline) throw new NotFoundError('Pipeline');
    return pipeline;
  }

  /**
   * Write a durable audit entry for a pipeline-config action (create/update/
   * delete). Uses the generic AuditLog with entity_type='pipeline' (no record_id).
   * Fire-and-forget; tenant_id is injected by the tenant middleware on create.
   */
  #auditPipeline(action, pipelineId, actorId, changes = null) {
    if (!actorId) return Promise.resolve();
    return this.db.auditLog.create({
      data: {
        entity_type: 'pipeline',
        entity_id:   pipelineId,
        employee_id: String(actorId),
        action,
        changes,
      },
    }).catch(err => logger?.warn?.('[DashboardService] pipeline audit write failed', { action, pipelineId, error: err.message }));
  }

  /** Read the audit trail for a single pipeline, newest first (with actor names). */
  async getPipelineAudit(id, limit = 100) {
    return this.db.auditLog.findMany({
      where:   { entity_type: 'pipeline', entity_id: Number(id) },
      orderBy: { created_at: 'desc' },
      take:    Math.min(Number(limit) || 100, 500),
      include: { employee: { select: { employee_id: true, employee_name: true } } },
    });
  }

  async createPipeline(data, actorId = null) {
    const { stages, ...pipeData } = data;
    if (pipeData.is_active !== undefined) pipeData.is_active = parseBool(pipeData.is_active);
    const pipeline = await this.db.uiPipeline.create({ data: pipeData });
    if (stages?.length) {
      await this.db.uiPipelineStage.createMany({
        data: stages.map((s) => ({ ...s, pipeline_id: pipeline.id })),
      });
    }
    await this.#auditPipeline('pipeline.create', pipeline.id, actorId, {
      name: pipeline.name, label: pipeline.label, object_id: pipeline.object_id,
      stage_count: stages?.length ?? 0,
    });
    await this.cache.del(this.cache.key('pipeline', 'object', pipeline.object_id));
    return this.getPipeline(pipeline.id);
  }

  async updatePipeline(id, data, actorId = null) {
    const existing = await this.db.uiPipeline.findUnique({ where: { id } });
    if (!existing) throw new NotFoundError('Pipeline');
    const { stages, object, object_id, id: _id, created_at, updated_at, ...scalar } = data;
    if (scalar.is_active !== undefined) scalar.is_active = parseBool(scalar.is_active);
    await this.db.uiPipeline.update({ where: { id }, data: scalar });
    await this.#auditPipeline('pipeline.update', id, actorId, { fields: Object.keys(scalar) });
    await this.cache.del(this.cache.key('pipeline', 'object', existing.object_id));
    return this.getPipeline(id);
  }

  async updatePipelineWithStages(id, data, actorId = null) {
    const existing = await this.db.uiPipeline.findUnique({ where: { id } });
    if (!existing) throw new NotFoundError('Pipeline');
    const { stages = [], object, object_id, id: _id, created_at, updated_at, ...scalar } = data;
    if (scalar.is_active !== undefined) scalar.is_active = parseBool(scalar.is_active);

    // Update pipeline scalar fields
    await this.db.uiPipeline.update({ where: { id }, data: scalar });

    // Sync stages: upsert existing (by id) + create new + delete removed
    const incomingIds = stages.filter(s => s.id).map(s => s.id);
    // Delete stages not in the incoming list
    await this.db.uiPipelineStage.deleteMany({
      where: { pipeline_id: id, id: { notIn: incomingIds } },
    });
    // Upsert / create
    await this.db.$transaction(
      stages.map((stage) => {
        const { id: stageId, ...stageData } = stage;
        if (stageId) {
          return this.db.uiPipelineStage.update({ where: { id: stageId }, data: stageData });
        }
        return this.db.uiPipelineStage.create({ data: { ...stageData, pipeline_id: id } });
      }),
    );

    await this.#auditPipeline('pipeline.update', id, actorId, {
      fields: Object.keys(scalar), stage_count: stages.length,
      delete_mode: scalar.config?.delete_mode,
    });
    await this.cache.del(this.cache.key('pipeline', 'object', existing.object_id));
    return this.getPipeline(id);
  }

  async deletePipeline(id, actorId = null) {
    const existing = await this.db.uiPipeline.findUnique({ where: { id } });
    if (!existing) throw new NotFoundError('Pipeline');
    // Audit before the delete (entity_id is not an FK, so the entry persists).
    await this.#auditPipeline('pipeline.delete', id, actorId, {
      name: existing.name, label: existing.label, object_id: existing.object_id,
    });
    await this.db.uiPipeline.delete({ where: { id } });
    await this.cache.del(this.cache.key('pipeline', 'object', existing.object_id));
  }

  // ── Workflow management ─────────────────────────────────

  async getWorkflows(objectId) {
    const workflows = await this.db.uiWorkflow.findMany({
      where:   objectId ? { object_id: objectId } : {},
      include: { steps: { orderBy: { order_index: 'asc' } } },
      orderBy: { created_at: 'asc' },
    });
    return workflows.map(wf => ({
      ...wf,
      steps: wf.steps.map(s => ({ ...s, label: s.label ?? s.name })),
    }));
  }

  async getWorkflow(id) {
    const wf = await this.db.uiWorkflow.findUnique({
      where:   { id },
      include: { steps: { orderBy: { order_index: 'asc' } } },
    });
    if (!wf) throw new NotFoundError('Workflow');
    return { ...wf, steps: wf.steps.map(s => ({ ...s, label: s.label ?? s.name })) };
  }

  async createWorkflow(data) {
    const { steps, id: _id, created_at, updated_at, last_run_at, ...wfData } = data;
    // Ensure required fields have values: label defaults to name; trigger_type required
    const normalized = {
      ...wfData,
      label:        wfData.label        || wfData.name,
      trigger_type: wfData.trigger_type || wfData.trigger_event || 'manual',
      ...(wfData.object_id !== undefined && wfData.object_id !== null && wfData.object_id !== ''
        ? { object_id: Number(wfData.object_id) } : {}),
      ...(wfData.is_active !== undefined && { is_active: parseBool(wfData.is_active) }),
    };
    assertWorkflowTriggerable(normalized);
    const wf = await this.db.uiWorkflow.create({ data: normalized });
    if (steps?.length) {
      await this.db.uiWorkflowStep.createMany({
        data: steps.map(({ id: _sid, workflow_id: _wid, created_at: _ca, ...s }) => ({ ...s, workflow_id: wf.id })),
      });
    }
    return this.getWorkflow(wf.id);
  }

  async updateWorkflow(id, data) {
    const { id: _id, created_at, updated_at, steps, ...wfData } = data;
    if (wfData.is_active !== undefined) wfData.is_active = parseBool(wfData.is_active);
    if (wfData.object_id !== undefined) {
      wfData.object_id = wfData.object_id === null || wfData.object_id === '' ? null : Number(wfData.object_id);
    }
    // Validate against the merged row: a caller may be changing only the
    // trigger, leaving an existing object binding in place (or vice versa).
    const current = await this.db.uiWorkflow.findUnique({
      where:  { id: Number(id) },
      select: { trigger_type: true, object_id: true },
    });
    assertWorkflowTriggerable({ ...current, ...wfData });
    const wf = await this.db.uiWorkflow.update({ where: { id }, data: wfData });
    return wf;
  }

  async deleteWorkflow(id) {
    await this.db.uiWorkflow.delete({ where: { id } });
  }

  async addWorkflowStep(workflowId, data) {
    const { label, ...rest } = data;
    const step = await this.db.uiWorkflowStep.create({ data: { ...rest, name: label ?? rest.name, workflow_id: workflowId } });
    return { ...step, label: step.label ?? step.name };
  }

  async updateWorkflowStep(id, data) {
    const { workflow_id, id: _id, label, created_at, updated_at, ...rest } = data;
    const update = { ...rest };
    if (label !== undefined) update.name = label;
    const step = await this.db.uiWorkflowStep.update({ where: { id }, data: update });
    return { ...step, label: step.label ?? step.name };
  }

  async deleteWorkflowStep(id) {
    await this.db.uiWorkflowStep.delete({ where: { id } });
  }

  // ── Wizard management ────────────────────────────────────

  async getWizards(objectId) {
    return this.db.uiWizard.findMany({
      where:   objectId ? { object_id: objectId, is_active: true } : { is_active: true },
      include: {
        steps: { orderBy: { order_index: 'asc' }, include: { form: true } },
        object: { include: { module: true } },
      },
    });
  }

  async getWizard(id) {
    const wizard = await this.db.uiWizard.findUnique({
      where:   { id },
      include: {
        steps: { orderBy: { order_index: 'asc' }, include: { form: true } },
        object: { include: { module: true } },
      },
    });
    if (!wizard) throw new NotFoundError('Wizard');
    return wizard;
  }

  async createWizard(data) {
    const { object_id, steps, ...rest } = data;
    // Whitelist only writable scalar fields
    const scalar = {
      ...(rest.name            !== undefined && { name:            rest.name }),
      ...(rest.label           !== undefined && { label:           rest.label }),
      ...(rest.description     !== undefined && { description:     rest.description }),
      ...(rest.submit_label    !== undefined && { submit_label:    rest.submit_label }),
      ...(rest.success_message !== undefined && { success_message: rest.success_message }),
      ...(rest.is_active       !== undefined && { is_active:       parseBool(rest.is_active) }),
    };
    const objectRelation = object_id
      ? { object: { connect: { id: Number(object_id) } } }
      : {};
    const wizard = await this.db.uiWizard.create({ data: { ...scalar, ...objectRelation } });
    if (steps?.length) {
      await this.db.uiWizardStep.createMany({
        data: steps.map((s) => ({ ...s, wizard_id: wizard.id })),
      });
    }
    return this.getWizard(wizard.id);
  }

  async updateWizard(id, data) {
    const { object_id, ...rest } = data;
    // Whitelist only writable scalar fields
    const scalar = {
      ...(rest.name            !== undefined && { name:            rest.name }),
      ...(rest.label           !== undefined && { label:           rest.label }),
      ...(rest.description     !== undefined && { description:     rest.description }),
      ...(rest.submit_label    !== undefined && { submit_label:    rest.submit_label }),
      ...(rest.success_message !== undefined && { success_message: rest.success_message }),
      ...(rest.is_active       !== undefined && { is_active:       parseBool(rest.is_active) }),
    };
    // Use Prisma relation connect/disconnect for object association
    const objectRelation = object_id
      ? { object: { connect: { id: Number(object_id) } } }
      : { object: { disconnect: true } };
    await this.db.uiWizard.update({ where: { id }, data: { ...scalar, ...objectRelation } });
    return this.getWizard(id);
  }

  async deleteWizard(id) {
    await this.db.uiWizard.delete({ where: { id } });
  }

  // ── Wizard step management ────────────────────────────────

  async addWizardStep(wizardId, data) {
    const fields = pickWizardStepFields(data);
    const maxOrder = await this.db.uiWizardStep.aggregate({
      where: { wizard_id: wizardId },
      _max: { order_index: true },
    });
    const nextOrder = data.order_index ?? (maxOrder._max.order_index ?? 0) + 1;
    const step = await this.db.uiWizardStep.create({
      data: { ...fields, wizard_id: wizardId, order_index: nextOrder },
      include: { form: true },
    });
    return step;
  }

  async updateWizardStep(id, data) {
    const step = await this.db.uiWizardStep.update({
      where: { id },
      data: pickWizardStepFields(data),
      include: { form: true },
    });
    return step;
  }

  async deleteWizardStep(id) {
    await this.db.uiWizardStep.delete({ where: { id } });
  }

  async reorderWizardSteps(wizardId, steps) {
    await Promise.all(
      steps.map(({ id, order_index }) =>
        this.db.uiWizardStep.update({ where: { id }, data: { order_index } })
      )
    );
    return this.getWizard(wizardId);
  }
}

module.exports = DashboardService;
module.exports.WORKFLOW_TRIGGERS = WORKFLOW_TRIGGERS;
module.exports.OBJECT_BOUND_TRIGGERS = OBJECT_BOUND_TRIGGERS;
module.exports.assertWorkflowTriggerable = assertWorkflowTriggerable;
