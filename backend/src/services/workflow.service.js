'use strict';

const crypto = require('crypto');
const { logger } = require('./logging.service');
const { tenantContext } = require('../middleware/tenant-scope');
const IntegrationService = require('./integration.service');
const { evaluate: evaluateFormula, truthy } = require('./formula');
const { encrypt: encryptField } = require('./field-protection');

/** Integration errors that a retry cannot fix (missing / inactive / misconfigured). */
const CONFIG_ERROR = /not found|not active|No connector|unknown provider|CONFIG/i;
const {
  MODEL_MAP,
  CRM_FIELDS,
  FIELD_ALIAS,
  REVERSE_ALIAS,
  RECORD_COLUMNS,
  resolveStorage,
  toTypedValue,
  fromTypedRow,
} = require('./crm-storage-map');

/**
 * WorkflowEngineService — executes workflow automations.
 *
 * Trigger points — the engine is a CONSUMER of the shared DomainEventBus
 * (events.service.js). The record/CRM service layer produces the events:
 *   on_create      — from `record.created`       (published by RecordService.createRecord)
 *   on_update      — from `record.updated`       (published by RecordService.updateRecord/…)
 *   on_delete      — from `record.deleted`       (published by RecordService.deleteRecord, before delete)
 *   field_changed  — from `record.field_changed` (published by RecordService/CrmService)
 *   manual         — direct call via POST /api/builder/workflows/:id/run (not via the bus)
 *   scheduled      — polled every 60 s by the scheduler in app.js (not via the bus).
 *                    With trigger_config.per_record the workflow runs once per
 *                    live record of its object (date-driven sweeps); without it
 *                    it runs once with no record context.
 *
 * IntegrationService subscribes to the same events, so one CRM mutation drives
 * both workflow automations and event-subscribed webhooks.
 *
 * Step types supported:
 *   trigger         — pass-through, validates the event
 *   condition       — branches on on_true_id / on_false_id based on a field comparison
 *   action          — writes a field value to the record in the DB
 *   notification    — creates in-app notification rows for resolved recipients
 *   delay           — persists a WorkflowPendingStep; scheduler resumes when due
 *   approval        — persists a WorkflowPendingStep + notifies approvers; resumed via API token
 *   webhook         — HTTP call to an ad-hoc URL OR a registered integration by name (SSRF-protected)
 *   integration     — invoke a registered integration by name, or publish a custom domain event
 *   create_record   — creates a new record in another object
 *   update_related  — bulk-updates records in another object linked by a field value
 *   create_reminder — schedules a personal reminder relative to a date on the record
 *
 * Any step may carry `config.for_each` to run once per matching record of
 * another object (see #execForEach).
 *
 * Field access is storage-aware. A record's data lives either in a first-class
 * CRM table or in the typed EAV table (record_field_values), and `assigned_to` /
 * `pipeline_stage_id` live on the `records` row itself. #loadFields merges all
 * three for reads and #writeField routes writes to the right one, so condition,
 * action, create_record and update_related steps behave identically on a CRM
 * object and on a custom (EAV-backed) object. See services/crm-storage-map.js.
 */
class WorkflowEngineService {
  // Prevents overlapping scheduler ticks from stacking open DB connections.
  #schedulerRunning = false;

  constructor(prisma, { eventBus = null, integrationService = null } = {}) {
    this.db                 = prisma;
    this.eventBus           = null;
    this.integrationService = integrationService;
    if (eventBus) this.setEventBus(eventBus);
  }

  // ── Dependency wiring (set up once in app.js) ──────────────────────────────

  /**
   * Subscribe the engine to the shared domain event bus. The engine is a pure
   * *consumer*: domain events are produced by the record/CRM service layer, and
   * both this engine and IntegrationService react to them independently. On a
   * `record.*` event the engine runs the workflows whose trigger type matches.
   */
  setEventBus(eventBus) {
    this.eventBus = eventBus;
    eventBus.subscribe('record.created',       (_e, p) => this.trigger('on_create', p.objectId, p.record, p.actorId));
    eventBus.subscribe('record.updated',       (_e, p) => this.trigger('on_update', p.objectId, p.record, p.actorId));
    eventBus.subscribe('record.deleted',       (_e, p) => this.trigger('on_delete', p.objectId, p.record, p.actorId));
    eventBus.subscribe('record.field_changed', (_e, p) => this.triggerFieldChanged(p.objectId, p.record, p.changed ?? {}, p.actorId));
    // Formula values recomputed because a related record changed (roll-ups,
    // lookups through a parent): only `field_changed` workflows that opt in
    // with `trigger_config.derived: true` run on these.
    eventBus.subscribe('record.derived_changed', (_e, p) => this.triggerFieldChanged(p.objectId, p.record, p.changed ?? {}, p.actorId, { derived: true }));
    return this;
  }

  /** IntegrationService used to route the inline `webhook` step's HTTP call
   *  through the app's single outbound-delivery path (SSRF + signing + client). */
  setIntegrationService(integrationService) {
    this.integrationService = integrationService;
    return this;
  }

  /** Durable job queue (PRD E-03): integration and SMS calls that fail are
   *  queued for retry with back-off instead of being lost. */
  setJobQueue(jobQueue) {
    this.jobQueue = jobQueue;
    return this;
  }

  /** Apply an integration step's `field_map` from a provider response — used
   *  by the job queue when a retried call finally succeeds. */
  async applyFieldMap(recordId, fieldMap, responseBody) {
    if (!fieldMap || !responseBody || typeof responseBody !== 'object') return [];
    const record = await this.db.record.findUnique({ where: { id: Number(recordId) }, select: { id: true, object_id: true } });
    if (!record) return [];
    const written = [];
    for (const [recordField, respPath] of Object.entries(fieldMap)) {
      const val = String(respPath).split('.').reduce((o, k) => (o == null ? o : o[k]), responseBody);
      if (val !== undefined) { await this.#writeField(record, recordField, val); written.push(recordField); }
    }
    return written;
  }

  /** Queue a failed integration call for retry; returns the job or null. */
  async #queueRetry(step, record, integration, body, fieldMap, err) {
    if (!this.jobQueue || CONFIG_ERROR.test(String(err?.message ?? ''))) return null;
    try {
      return await this.jobQueue.enqueue('integration.call',
        { integration, body, record_id: record?.id ?? null, field_map: fieldMap ?? null },
        { delayMs: 30_000, dedupeKey: `wfstep:${step.id}:${record?.id ?? ''}`, tenantId: record?.tenant_id });
    } catch {
      return null;
    }
  }

  /** RecordService used by `create_record`, so created records run the full
   *  record path (formulas, validation-free system write, scope stamping,
   *  auto-assignment, record.created event). */
  setRecordService(recordService) {
    this.recordService = recordService;
    return this;
  }

  // ── Public API ───────────────────────────────────────────────────────────

  /**
   * Fire all active workflows matching triggerType for the given objectId.
   * Non-blocking: errors are caught internally so the calling request is never
   * failed by a workflow engine problem.
   */
  async trigger(triggerType, objectId, record, actorId) {
    let workflows;
    try {
      workflows = await this.db.uiWorkflow.findMany({
        where:   { object_id: Number(objectId), trigger_type: triggerType, is_active: true },
        include: { steps: { orderBy: { order_index: 'asc' } } },
      });
    } catch (err) {
      logger.error('Failed to fetch workflows', { error: err.message, objectId, triggerType });
      return;
    }

    for (const wf of workflows) {
      this.#run(wf, record, actorId).catch((err) => {
        logger.workflow(wf.id, 'execution failed', { name: wf.name, error: err.message });
      });
    }
  }

  /**
   * Fire all active `field_changed` workflows for the given objectId.
   * The condition steps can inspect `_changed.<field>` to check old/new values.
   *
   * @param {number} objectId  – UiObject ID
   * @param {Object} record    – the updated record (with id, object_id, etc.)
   * @param {Object} changedFields – { fieldName: { old, new } } map of changed fields
   * @param {string} actorId   – employee ID of the user who made the change
   * @param {{derived?: boolean}} [opts] – `derived`: the values were recomputed
   *   because a related record changed (no save of this record). Only workflows
   *   with `trigger_config.derived: true` run then; they also run on saves.
   */
  async triggerFieldChanged(objectId, record, changedFields, actorId, { derived = false } = {}) {
    let workflows;
    try {
      workflows = await this.db.uiWorkflow.findMany({
        where:   { object_id: Number(objectId), trigger_type: 'field_changed', is_active: true },
        include: { steps: { orderBy: { order_index: 'asc' } } },
      });
    } catch (err) {
      logger.error('Failed to fetch field_changed workflows', { error: err.message, objectId });
      return;
    }

    // Filter workflows whose trigger_config.field matches one of the changed fields
    const matched = workflows.filter(wf => {
      if (derived && wf.trigger_config?.derived !== true) return false;
      const triggerField = wf.trigger_config?.field;
      if (!triggerField) return true; // no field filter → fires on any change
      return changedFields[triggerField] !== undefined;
    });

    // Enrich record with _changed context so condition steps can read old/new values
    const enrichedRecord = { ...record, _changed: changedFields };

    for (const wf of matched) {
      this.#run(wf, enrichedRecord, actorId).catch((err) => {
        logger.workflow(wf.id, 'field_changed execution failed', { name: wf.name, error: err.message });
      });
    }
  }

  /**
   * Manually execute a single workflow by ID.
   * Returns an execution log array — useful for the "Test Run" UI button.
   */
  async manualRun(workflowId, record = null, actorId = null) {
    const wf = await this.db.uiWorkflow.findUnique({
      where:   { id: Number(workflowId) },
      include: { steps: { orderBy: { order_index: 'asc' } } },
    });
    if (!wf) throw new Error(`Workflow ${workflowId} not found`);

    const log = [];
    await this.#run(wf, record, actorId, log);
    return log;
  }

  /**
   * Poll and execute all due scheduled workflows, and resume any delayed pending steps.
   * Call this from a setInterval in app.js every 60 000 ms.
   */
  async runScheduled() {
    if (this.#schedulerRunning) {
      // Previous tick is still executing — skip to avoid connection pool exhaustion.
      return;
    }
    this.#schedulerRunning = true;
    try {
      await this.#runScheduledInner();
    } finally {
      this.#schedulerRunning = false;
    }
  }

  async #runScheduledInner() {
    const now = new Date();

    // ── 1. Tick-based scheduled workflows ──────────────────────────────────
    let workflows;
    try {
      workflows = await this.db.uiWorkflow.findMany({
        where:   { trigger_type: 'scheduled', is_active: true },
        include: { steps: { orderBy: { order_index: 'asc' } } },
      });
    } catch (err) {
      logger.error('[workflow] scheduler fetch failed', { error: err.message });
      return;
    }

    for (const wf of workflows) {
      const cfg        = wf.trigger_config ?? {};
      const intervalMs = (Number(cfg.interval_minutes) || 0) * 60 * 1000;
      if (!intervalMs) continue;

      // RC-09 fix: Atomic conditional UPDATE — only the process that actually
      // advances last_run_at wins.  In a multi-pod deployment two schedulers
      // may pass the in-memory lastRun check at nearly the same time; the DB
      // UPDATE with the WHERE guard ensures exactly one pod fires the workflow.
      try {
        const minLastRun = new Date(now - intervalMs);
        const affected = await this.db.$executeRaw`
          UPDATE ui_workflows
          SET last_run_at = ${now}
          WHERE id = ${wf.id}
            AND (last_run_at IS NULL OR last_run_at < ${minLastRun})
        `;
        if (affected === 0) continue; // Another pod (or tick) already stamped this workflow
      } catch (err) {
        logger.error(`[workflow:${wf.id}] failed to stamp last_run_at`, { error: err.message });
        continue;
      }

      // Scope execution to the workflow's own tenant. Without this the queries
      // inside #run have no tenant context and the middleware would fall back to
      // a stale per-request tenant id — a cross-tenant execution hazard.
      tenantContext.run({ tenantId: wf.tenant_id }, () => {
        this.#runScheduledWorkflow(wf, cfg).catch((err) =>
          logger.error(`[workflow:${wf.id}] scheduled run failed`, { error: err.message }),
        );
      });
    }

    // ── 2. Resume due delay pending steps ──────────────────────────────────
    let duePending;
    try {
      duePending = await this.db.workflowPendingStep.findMany({
        where: {
          resume_after:    { lte: now },
          approval_status: 'pending',
        },
        include: { workflow: { include: { steps: { orderBy: { order_index: 'asc' } } } } },
      });
    } catch (err) {
      logger.error('[workflow] pending-steps fetch failed', { error: err.message });
      return;
    }

    for (const pending of duePending) {
      // RC-11 fix: Atomic conditional UPDATE — only the process that successfully
      // flips approval_status from 'pending' → 'resumed' proceeds to execute.
      // A concurrent pod that fetched the same row will get affected=0 and skip.
      try {
        const affected = await this.db.$executeRaw`
          UPDATE workflow_pending_steps
          SET approval_status = 'resumed'
          WHERE id = ${pending.id} AND approval_status = 'pending'
        `;
        if (affected === 0) continue; // Another pod already resumed this step
      } catch (err) {
        logger.error(`[workflow-pending:${pending.id}] failed to mark resumed`, { error: err.message });
        continue;
      }

      const ordered    = this.#orderSteps(pending.workflow.steps);
      const stepsById  = Object.fromEntries(ordered.map((s) => [s.id, s]));
      const resumeStep = pending.resume_step_id ? (stepsById[pending.resume_step_id] ?? null) : null;
      if (!resumeStep) continue;

      const record = pending.context?.record ?? null;

      // Scope the resumed execution to the owning workflow's tenant (see above).
      tenantContext.run({ tenantId: pending.workflow.tenant_id }, () => {
        this.#runFrom(resumeStep, ordered, record, pending.actor_id).catch((err) =>
          logger.error(`[workflow:${pending.workflow_id}] delayed resume failed`, { error: err.message }),
        );
      });
    }
  }
  // (end #runScheduledInner)

  /**
   * Execute one due scheduled workflow.
   *
   * Two modes, chosen by `trigger_config.per_record`:
   *
   *   per_record: false (default) — the workflow runs ONCE with no record
   *     context. Only steps that need no record (a role-broadcast notification,
   *     a webhook with a static body) do anything useful; condition and action
   *     steps see an empty field map.
   *
   *   per_record: true — the workflow runs once for every live record of its
   *     object, exactly like a Salesforce scheduled-triggered Flow or a Zoho
   *     scheduled rule. This is what makes date-driven sweeps ("leads with
   *     no activity for 7 days", "clients missing contact details") possible,
   *     since the condition step can then read that record's own fields.
   *
   * `trigger_config.limit` caps a per-record sweep (default 500) so a large
   * object cannot turn one scheduler tick into an unbounded run.
   */
  async #runScheduledWorkflow(wf, cfg = {}) {
    if (!cfg.per_record || !wf.object_id) {
      return this.#run(wf, null, null);
    }

    const take = Math.min(Number(cfg.limit) || 500, 5_000);
    const records = await this.db.record.findMany({
      where:   { object_id: Number(wf.object_id), deleted_at: null },
      select:  { id: true, object_id: true, assigned_to: true, created_by: true, pipeline_stage_id: true },
      orderBy: { id: 'asc' },
      take,
    });

    logger.workflow(wf.id, 'scheduled per-record sweep', { name: wf.name, records: records.length });

    // Sequential on purpose: a sweep is a background job, and running hundreds
    // of step chains concurrently would contend with request traffic for the
    // connection pool.
    for (const rec of records) {
      await this.#run(wf, rec, null).catch((err) =>
        logger.error(`[workflow:${wf.id}] per-record run failed for record ${rec.id}`, { error: err.message }),
      );
    }
  }


  /**
   * Process an approval action for a pending approval step.
   * @param {string}  token      The approval_token from the pending step
   * @param {boolean} approved   true → approve (on_true branch); false → reject (on_false branch)
   * @param {string}  actingEmployeeId  The employee_id of the user submitting the decision
   * @returns {{ status, continued, log }}
   */
  /**
   * Approval requests for the inbox. `scope: 'mine'` — waiting for this
   * employee; `'all'` — every pending request in the tenant (managers);
   * `'decided'` — the employee's recent decisions.
   */
  async listApprovals(employeeId, { scope = 'mine', limit = 200 } = {}) {
    const where = { approval_token: { not: null } };
    if (scope === 'decided') where.approval_status = { in: ['approved', 'rejected'] };
    else where.approval_status = 'pending';
    const rows = await this.db.workflowPendingStep.findMany({
      where, orderBy: { created_at: 'desc' }, take: scope === 'decided' ? 500 : 1000,
      include: { workflow: { select: { label: true, object_id: true } } },
    });
    const me = String(employeeId ?? '');
    // A request about a record that has since been moved to the trash cannot be
    // acted on meaningfully — keep it out of the open inbox (history keeps it).
    let trashed = new Set();
    if (scope !== 'decided' && typeof this.db.record?.findMany === 'function') {
      const ids = [...new Set(rows.map((r) => r.record_id).filter(Boolean))];
      if (ids.length) {
        trashed = new Set((await this.db.record.findMany({ where: { id: { in: ids }, deleted_at: { not: null } }, select: { id: true } }).catch(() => [])).map((r) => r.id));
      }
    }
    const mine = rows.filter((r) => !trashed.has(r.record_id)).filter((r) => {
      const c = r.context ?? {};
      if (scope === 'mine') return Array.isArray(c.approver_ids) && c.approver_ids.map(String).includes(me);
      if (scope === 'decided') return String(c.decided_by ?? '') === me;
      return true;
    }).slice(0, limit);
    if (!mine.length) return [];

    // Record titles and where to open them.
    const objectIds = [...new Set(mine.map((r) => r.context?.object_id ?? r.workflow?.object_id).filter(Boolean))];
    const objects = objectIds.length ? await this.db.uiObject.findMany({ where: { id: { in: objectIds } }, select: { id: true, label: true, module_id: true, config: true } }) : [];
    const objById = new Map(objects.map((o) => [o.id, o]));
    const recordIds = mine.map((r) => r.record_id).filter(Boolean);
    const titleFields = [...new Set(objects.map((o) => o.config?.title_field).filter(Boolean))];
    const titles = recordIds.length && titleFields.length ? await this.db.recordFieldValue.findMany({ where: { record_id: { in: recordIds }, field_name: { in: titleFields } }, select: { record_id: true, field_name: true, str_value: true } }) : [];
    const people = [...new Set(mine.flatMap((r) => [r.actor_id, ...(r.context?.approver_ids ?? []), r.context?.decided_by]).filter(Boolean).map(String))];
    const emps = people.length ? await this.db.employee.findMany({ where: { employee_id: { in: people } }, select: { employee_id: true, employee_name: true } }) : [];
    const nameOf = (id) => emps.find((e) => e.employee_id === String(id))?.employee_name ?? id ?? null;

    return mine.map((r) => {
      const c = r.context ?? {};
      const obj = objById.get(c.object_id ?? r.workflow?.object_id);
      const title = obj?.config?.title_field ? titles.find((t) => t.record_id === r.record_id && t.field_name === obj.config.title_field)?.str_value : null;
      return {
        id: r.id, token: r.approval_status === 'pending' ? r.approval_token : null, status: r.approval_status,
        title: c.title ?? r.workflow?.label ?? 'Approval required', message: c.message ?? null, workflow: r.workflow?.label ?? null,
        requested_at: r.created_at, requested_by: r.actor_id, requested_by_name: nameOf(r.actor_id),
        approvers: (c.approver_ids ?? []).map((id) => ({ id, name: nameOf(id) })),
        decided_by: c.decided_by ?? null, decided_by_name: c.decided_by ? nameOf(c.decided_by) : null, decided_at: c.decided_at ?? null, comment: c.comment ?? null,
        record: r.record_id ? { id: r.record_id, title: title ?? `#${r.record_id}`, object: obj?.label ?? null, link: obj ? `/module/${obj.module_id}/object/${obj.id}?record=${r.record_id}` : null } : null,
      };
    });
  }

  async processApproval(token, approved, actingEmployeeId, comment = null) {
    const pending = await this.db.workflowPendingStep.findUnique({
      where:   { approval_token: token },
      include: { workflow: { include: { steps: { orderBy: { order_index: 'asc' } } } } },
    });

    if (!pending) throw new Error('Approval token not found');

    // Approver-bound enforcement: if the step recorded intended approvers,
    // reject any actor who isn't in that list.
    const approverIds = pending.context?.approver_ids;
    if (Array.isArray(approverIds) && approverIds.length > 0 && actingEmployeeId) {
      if (!approverIds.includes(String(actingEmployeeId))) {
        throw new Error('Not authorised to act on this approval');
      }
    }

    const outcome = approved ? 'approved' : 'rejected';

    // RC-10 fix: Atomic conditional UPDATE — only the first request to arrive
    // succeeds in flipping 'pending' → outcome.  A double-click or network
    // retry that arrives concurrently will get affected=0 and we throw the
    // "already resolved" error, preventing the workflow from advancing twice.
    const affected = await this.db.$executeRaw`
      UPDATE workflow_pending_steps
      SET approval_status = ${outcome}
      WHERE id = ${pending.id} AND approval_status = 'pending'
    `;
    if (affected === 0) {
      // Re-read the current status for a meaningful error message
      const current = await this.db.workflowPendingStep.findUnique({
        where:  { id: pending.id },
        select: { approval_status: true },
      });
      throw new Error(`Approval already resolved: ${current?.approval_status ?? 'unknown'}`);
    }

    // Who decided, when, and why — shown in the inbox history and on the audit trail.
    await this.db.workflowPendingStep.update({
      where: { id: pending.id },
      data:  { context: { ...(pending.context ?? {}), decided_by: actingEmployeeId ?? null, decided_at: new Date().toISOString(), comment: comment ? String(comment).slice(0, 1000) : null } },
    }).catch(() => {});
    if (pending.record_id) {
      await this.db.auditLog.create({
        data: { record_id: pending.record_id, employee_id: actingEmployeeId ?? null, action: outcome === 'approved' ? 'approval_approved' : 'approval_rejected', changes: { approval: pending.context?.title ?? null, comment: comment ?? null }, tenant_id: pending.tenant_id },
      }).catch(() => {});
    }

    const nextStepId = approved
      ? pending.resume_step_id
      : (pending.context?.reject_step_id ?? null);

    if (!nextStepId) return { status: outcome, continued: false, log: [] };

    const ordered   = this.#orderSteps(pending.workflow.steps);
    const stepsById = Object.fromEntries(ordered.map((s) => [s.id, s]));
    const startStep = stepsById[nextStepId] ?? null;
    const record    = pending.context?.record ?? null;
    const log       = [];

    if (startStep) {
      await this.#runFrom(startStep, ordered, record, pending.actor_id, log);
    }

    return { status: outcome, continued: !!startStep, log };
  }

  // ── Private: execution core ──────────────────────────────────────────────

  async #run(workflow, record, actorId, log = []) {
    if (!workflow.steps?.length) return;
    const ordered = this.#orderSteps(workflow.steps);
    await this.#runFrom(ordered[0], ordered, record, actorId, log);
  }

  /** Steps sorted by order_index (stable) — the linear execution order. */
  #orderSteps(steps) {
    return [...steps].sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0));
  }

  /**
   * Walk the step chain from startStep, executing each step in order.
   * Branching is driven by explicit step.on_true_id / step.on_false_id when set;
   * otherwise a step falls through to the NEXT step by order_index (the linear
   * flow the Workflow Builder produces — it does not set on_*_id links). A step
   * that throws is logged and does NOT abort the remaining steps.
   */
  async #runFrom(startStep, orderedSteps, record, actorId, log = []) {
    const stepsById = Object.fromEntries(orderedSteps.map((s) => [s.id, s]));
    let current = startStep;
    let depth   = 0;
    const MAX_STEPS = 50; // guard against accidental cycles
    // Cache of CRM fields for the current record — loaded once, invalidated on write.
    const crmCache = { fields: null };

    while (current && depth++ < MAX_STEPS) {
      const idx = orderedSteps.findIndex((s) => s.id === current.id);
      const defaultNextId = idx >= 0 && idx + 1 < orderedSteps.length ? orderedSteps[idx + 1].id : null;
      const logEntry = { step: current.id, name: current.name, type: current.step_type };
      let nextId;
      try {
        nextId = current.config?.for_each
          ? await this.#execForEach(current, record, actorId, logEntry, crmCache, defaultNextId)
          : await this.#execStep(current, record, actorId, logEntry, crmCache, defaultNextId);
      } catch (err) {
        // One bad step must not abort the rest of the workflow. Log it, then
        // continue linearly to the next step.
        logEntry.result = `error: ${err.message}`;
        logEntry.error  = err.message;
        logger.error(`[workflow] step ${current.id} (${current.step_type}) threw`, { error: err.message });
        nextId = defaultNextId;
      }
      logEntry.next = nextId ?? null;
      log.push(logEntry);
      current = nextId ? (stepsById[nextId] ?? null) : null;
    }
  }

  /**
   * Run one step once for every matching record of another object — the
   * "loop" of a Salesforce Flow. A PLR change creates a notice for every
   * variable-rate loan; distributing it emails each of its notices.
   *
   * Config: step.config.for_each = { object, match?: { field: value }, where?, limit? = 2000 }
   *   match — lookup / value filters on the looped records; values may be
   *           {{placeholders}} from this record (e.g. { plr_change_event: '{{id}}' })
   *   where — a formula each looped record must satisfy
   * Inside the loop the step runs on the looped record: {{field}} reads that
   * record and {{source_<field>}} the record the workflow runs on.
   */
  async #execForEach(step, record, actorId, logEntry, crmCache, defaultNextId) {
    const { for_each: fe, ...cfg } = step.config ?? {};
    const target = fe?.object && typeof this.db.uiObject?.findFirst === 'function'
      ? await this.db.uiObject.findFirst({ where: { name: String(fe.object) }, select: { id: true } })
      : null;
    if (!target) {
      logEntry.result = `no-op (for_each object '${fe?.object}' not found)`;
      return step.on_true_id ?? defaultNextId;
    }
    if (!crmCache.fields) crmCache.fields = await this.#loadFields(record);
    const source = Object.fromEntries(Object.entries(crmCache.fields).map(([k, v]) => [`source_${k}`, v]));
    const take = Math.min(Number(fe.limit) || 2000, 5000);
    const where = { object_id: target.id, deleted_at: null };
    const match = Object.entries(fe.match ?? {}).map(([f, v]) => [f, typeof v === 'string' ? this.#interpolate(v, crmCache.fields) : v]);
    if (match.length) {
      const rows = await this.db.recordFieldValue.findMany({
        where:  { field_name: { in: match.map(([f]) => f) }, record: { object_id: target.id, deleted_at: null } },
        select: { record_id: true, field_name: true, str_value: true, num_value: true, bool_value: true },
      });
      const byRecord = new Map();
      for (const r of rows) {
        const v = r.str_value ?? (r.num_value != null ? String(r.num_value) : r.bool_value != null ? String(r.bool_value) : null);
        (byRecord.get(r.record_id) ?? byRecord.set(r.record_id, {}).get(r.record_id))[r.field_name] = v;
      }
      where.id = { in: [...byRecord].filter(([, vals]) => match.every(([f, v]) => String(vals[f] ?? '') === String(v ?? ''))).map(([id]) => id) };
    }
    const looped = await this.db.record.findMany({
      where, orderBy: { id: 'asc' }, take,
      select: { id: true, object_id: true, tenant_id: true, assigned_to: true, created_by: true, pipeline_stage_id: true },
    });
    const inner = { ...step, config: cfg };
    let ran = 0;
    for (const rec of looped) {
      const fields = { ...source, ...(await this.#loadFields(rec)) };
      if (fe.where && !(await this.#evaluateExpression(fe.where, fields, rec.id))) continue;
      // One record that fails must not stop the others.
      try {
        await this.#execStep(inner, rec, actorId, { step: step.id }, { fields }, null);
        ran += 1;
      } catch (err) {
        logger.error(`[workflow] for_each step ${step.id} failed on record ${rec.id}`, { error: err.message });
      }
    }
    logEntry.result = `ran on ${ran} of ${looped.length} ${fe.object} records`;
    return step.on_true_id ?? defaultNextId;
  }

  async #execStep(step, record, actorId, logEntry, crmCache = { fields: null }, defaultNextId = null) {
    const cfg = step.config ?? {};

    switch (step.step_type) {
      // ── Trigger ──────────────────────────────────────────────────────────
      case 'trigger':
        logEntry.result = 'pass';
        return step.on_true_id ?? defaultNextId;

      // ── Condition ────────────────────────────────────────────────────────
      case 'condition': {
        if (!crmCache.fields) crmCache.fields = await this.#loadFields(record);
        const fields  = crmCache.fields;
        let actual;
        // Support _changed context: e.g. field = "lead_status" with source = "new" or "old"
        // Also support dotted notation: "_changed.lead_status.new"
        if (cfg.field?.startsWith('_changed.')) {
          const parts = cfg.field.split('.');
          actual = record?._changed?.[parts[1]]?.[parts[2] ?? 'new'];
        } else if (cfg.source === 'old' && record?._changed?.[cfg.field]) {
          actual = record._changed[cfg.field].old;
        } else if (cfg.source === 'new' && record?._changed?.[cfg.field]) {
          actual = record._changed[cfg.field].new;
        } else {
          // Default: read current value from CRM fields or record struct
          actual = fields[cfg.field] ?? record?.[cfg.field];
        }
        // `expression` gates on a formula over the whole record (with LOOKUP /
        // related roll-ups when the record service is wired), e.g. an
        // approval-matrix band: `amount > 5000000 AND risk_grade != 'A'`.
        const matched = cfg.operator === 'expression'
          ? await this.#evaluateExpression(cfg.value, { ...fields, id: record?.id ?? null }, record?.id ?? null)
          : this.#evaluate(actual, cfg.operator, cfg.value);
        logEntry.result = matched ? 'true' : 'false';
        // Pass → explicit link or fall through to the next step. Fail → explicit
        // false-branch, else stop the chain (a failed gate blocks what follows).
        return matched ? (step.on_true_id ?? defaultNextId) : (step.on_false_id ?? null);
      }

      // ── Action  (field update) ────────────────────────────────────────────
      // Writes cfg.value to cfg.field on the triggering record, routed to
      // whichever store owns that object's data (CRM table, EAV, or the
      // `records` row itself for assigned_to / pipeline_stage_id).
      // cfg.value supports {{field}} interpolation from the current record.
      case 'action': {
        if (record && cfg.field !== undefined && cfg.value !== undefined) {
          if (!crmCache.fields) crmCache.fields = await this.#loadFields(record);
          const value = typeof cfg.value === 'string'
            ? this.#interpolate(cfg.value, crmCache.fields)
            : cfg.value;
          // `lookup.field` writes through a lookup to the linked record — e.g.
          // a conflict check's decision updating its mandate's status.
          let target = record;
          let field = cfg.field;
          if (String(field).includes('.')) {
            const [head, ...rest] = String(field).split('.');
            const linkedId = Number(crmCache.fields[head]);
            target = Number.isInteger(linkedId) && linkedId > 0 ? { id: linkedId } : null;
            field = rest.join('.');
          }
          const written = target ? await this.#writeField(target, field, value) : false;
          crmCache.fields = null; // invalidate — the record was just mutated
          // Formulas (and parents' roll-ups) depending on the field follow it.
          if (written && field !== 'stage' && this.recordService) await this.recordService.recompute(target.id, { propagate: true }).catch(() => {});
          logEntry.result = written
            ? `set ${cfg.field}=${value}`
            : `no-op (could not resolve storage for field '${cfg.field}')`;
        } else {
          logEntry.result = 'no-op (missing field/value or no record context)';
        }
        return step.on_true_id ?? defaultNextId;
      }

      // ── Notification ──────────────────────────────────────────────────────
      case 'notification': {
        const recipients = await this.#resolveRecipients(cfg, record, actorId, crmCache);
        if (recipients.length) {
          if (!crmCache.fields) crmCache.fields = await this.#loadFields(record);
          const fieldCtx = await this.#readable(record, crmCache.fields);
          const title = this.#interpolate(cfg.title   ?? 'Workflow notification', fieldCtx);
          const body  = this.#interpolate(cfg.message ?? '',                      fieldCtx);
          await this.db.notification.createMany({
            data: recipients.map((employeeId) => ({
              employee_id: employeeId,
              type:        'workflow',
              title,
              body:        body || null,
              link:        cfg.link ?? null,
            })),
          });
        }
        logEntry.result = `notified ${recipients.length}`;
        return step.on_true_id ?? defaultNextId;
      }

      // ── Delay ─────────────────────────────────────────────────────────────
      // Persists a WorkflowPendingStep row and halts execution.
      // The 60-second scheduler wakes it up when resume_after is due.
      //
      // Config: { duration: 3, unit: 'hours' }   (units: minutes | hours | days)
      case 'delay': {
        const qty  = Number(cfg.duration ?? cfg.qty ?? 1);
        const unit = String(cfg.unit ?? 'minutes').toLowerCase();
        const MS_PER = { minutes: 60_000, hours: 3_600_000, days: 86_400_000 };
        const ms     = qty * (MS_PER[unit] ?? 60_000);
        const resumeAt = new Date(Date.now() + ms);

        // Resume at the explicit link, else the next linear step.
        const resumeId = step.on_true_id ?? defaultNextId;
        if (resumeId) {
          await this.db.workflowPendingStep.create({
            data: {
              workflow_id:     step.workflow_id,
              resume_step_id:  resumeId,
              record_id:       record?.id ? Number(record.id) : null,
              actor_id:        actorId ?? null,
              context:         { record: record ?? null },
              resume_after:    resumeAt,
              approval_status: 'pending',
            },
          });
          logEntry.result = `paused — resumes at ${resumeAt.toISOString()} (${qty} ${unit})`;
        } else {
          logEntry.result = `delay ${qty} ${unit} — no next step configured`;
        }
        return null; // halt current run; scheduler resumes it
      }

      // ── Approval ──────────────────────────────────────────────────────────
      // Persists a WorkflowPendingStep, notifies the configured approvers with a
      // token link, and halts. The token is resolved via:
      //   POST /api/runtime/workflows/approval/:token  { action: 'approve'|'reject' }
      // Approved  → continues from on_true_id
      // Rejected  → continues from on_false_id (if set)
      //
      // Config: { title, message, employee_id|role|field|notify_actor }
      case 'approval': {
        const token      = crypto.randomBytes(24).toString('hex');
        const recipients = await this.#resolveRecipients(cfg, record, actorId, crmCache);
        if (!crmCache.fields) crmCache.fields = await this.#loadFields(record);
        const readable      = await this.#readable(record, crmCache.fields);
        const approvalTitle = this.#interpolate(cfg.title ?? 'Approval required', readable);
        const approvalBody  = this.#interpolate(cfg.message ?? '', readable);

        await this.db.workflowPendingStep.create({
          data: {
            workflow_id:     step.workflow_id,
            resume_step_id:  step.on_true_id  ?? defaultNextId,
            record_id:       record?.id ? Number(record.id) : null,
            actor_id:        actorId ?? null,
            context: {
              record:          record ?? null,
              reject_step_id:  step.on_false_id ?? null,
              // Persisted so processApproval can verify the acting employee is
              // one of the intended approvers (approver-bound enforcement).
              approver_ids:    recipients,
              // Shown in the Approvals inbox.
              title:           approvalTitle,
              message:         approvalBody || null,
              step_name:       step.name ?? null,
              object_id:       record?.object_id ?? null,
            },
            approval_token:  token,
            approval_status: 'pending',
          },
        });

        if (recipients.length) {
          await this.db.notification.createMany({
            data: recipients.map((employeeId) => ({
              employee_id: employeeId,
              type:        'approval',
              title:       approvalTitle,
              body:        approvalBody || null,
              // Opens the Approvals inbox on this request.
              link:        `/approvals?token=${token}`,
            })),
          });
        } else {
          logger.warn(`[workflow] approval '${step.name}' has no eligible approver; it waits in the administrators' Approvals inbox`);
        }

        logEntry.result = `awaiting approval — token ${token.substring(0, 8)}…`;
        return null; // halt; continued by processApproval()
      }

      // ── Webhook ────────────────────────────────────────────────────────────
      // HTTP POST (default) to an external URL with an interpolated JSON body.
      // SSRF-protected: private IP ranges and loopback are blocked.
      // on_true_id on 2xx; on_false_id (or halt) on non-2xx or network error.
      //
      // Config: { url, method?, headers?, body? }
      //   body: plain object used as JSON payload; {{field}} placeholders are
      //         interpolated from the current record's data values.
      case 'webhook': {
        if (!this.integrationService) {
          logEntry.result = 'webhook skipped — integration delivery not available';
          logEntry.error  = 'IntegrationService not wired into WorkflowEngineService';
          return step.on_false_id ?? null;
        }
        if (!crmCache.fields) crmCache.fields = await this.#loadFields(record);
        const fieldCtx = crmCache.fields;

        // ── Named connection: reuse a registered integration's URL/secret/
        //    headers/retry, and log the call to its health dashboard. This is
        //    the "named credential" pattern (Salesforce), so an endpoint is
        //    configured once and referenced everywhere.
        if (cfg.integration) {
          try {
            const body = this.#interpolatePayload(cfg.body, fieldCtx) ?? { record: fieldCtx };
            const log  = await this.integrationService.executeByName(cfg.integration, body);
            logEntry.result = `webhook via integration '${cfg.integration}' → logged #${log?.id ?? '?'}`;
          } catch (err) {
            logEntry.result = `webhook via integration '${cfg.integration}' failed: ${err.message}`;
            logEntry.error  = err.message;
            return step.on_false_id ?? null;
          }
          return step.on_true_id ?? defaultNextId;
        }

        // ── Ad-hoc URL (no registered integration) ──────────────────────────
        if (!cfg.url) {
          logEntry.result = 'no-op (missing url or integration)';
          return step.on_true_id ?? defaultNextId;
        }
        if (!this.#isSafeWebhookUrl(cfg.url)) {
          logEntry.result = 'blocked — private/loopback URL rejected (SSRF protection)';
          return step.on_false_id ?? null;
        }
        try {
          const rawBody = cfg.body ? JSON.stringify(cfg.body) : JSON.stringify({ record: fieldCtx });
          const bodyStr = this.#interpolate(rawBody, fieldCtx);
          const method  = (cfg.method ?? 'POST').toUpperCase();

          // Route the HTTP call through IntegrationService so every outbound
          // webhook in the app shares one SSRF policy, one signing scheme, and
          // one HTTP client. `deliver()` throws on non-2xx.
          const res = await this.integrationService.deliver({
            url:     cfg.url,
            method,
            headers: cfg.headers ?? {},
            body:    bodyStr,
            secret:  cfg.secret ?? null,
          });
          logEntry.result = `webhook → HTTP ${res.status}`;
        } catch (err) {
          logEntry.result = `webhook failed: ${err.message}`;
          logEntry.error  = err.message;
          return step.on_false_id ?? null;
        }
        return step.on_true_id ?? defaultNextId;
      }

      // ── Integration ────────────────────────────────────────────────────────
      // Explicitly invoke a registered integration, or emit a custom domain
      // event that event-subscribed integrations (and other workflows) react to.
      //
      // Config: { integration: 'name', body?: {} }  — run a named integration
      //     or: { event: 'lead.qualified', data?: {} } — publish a custom event
      case 'integration': {
        if (!crmCache.fields) crmCache.fields = await this.#loadFields(record);
        const fieldCtx = crmCache.fields;

        if (cfg.integration) {
          if (!this.integrationService) {
            logEntry.result = 'integration skipped — IntegrationService not wired';
            logEntry.error  = 'IntegrationService not available';
            return step.on_false_id ?? null;
          }
          try {
            const body = this.#interpolatePayload(cfg.body, fieldCtx) ?? { record: fieldCtx };
            const log  = await this.integrationService.executeByName(cfg.integration, body);
            logEntry.result = `integration '${cfg.integration}' dispatched → log #${log?.id ?? '?'}`;

            // Enrichment write-back (metadata-driven): map values from the
            // provider's response onto the record's own fields.
            //   cfg.field_map = { recordField: 'dotted.path.in.response' }
            if (cfg.field_map && log?.response_body && typeof log.response_body === 'object') {
              const written = [];
              for (const [recordField, respPath] of Object.entries(cfg.field_map)) {
                const val = String(respPath).split('.').reduce((o, k) => (o == null ? o : o[k]), log.response_body);
                if (val !== undefined) { await this.#writeField(record, recordField, val); written.push(recordField); }
              }
              if (written.length) logEntry.result += ` · enriched ${written.join(', ')}`;
            }
          } catch (err) {
            const job = await this.#queueRetry(step, record, cfg.integration, this.#interpolatePayload(cfg.body, fieldCtx) ?? { record: fieldCtx }, cfg.field_map, err);
            logEntry.result = `integration '${cfg.integration}' failed: ${err.message}${job ? ` · queued for retry (job #${job.id})` : ''}`;
            logEntry.error  = err.message;
            return step.on_false_id ?? null;
          }
          return step.on_true_id ?? defaultNextId;
        }

        if (cfg.event && this.eventBus) {
          // Guard against re-entrant loops: refuse to publish the internal
          // `record.*` events that the engine itself subscribes to (publishing
          // `record.updated` here would re-trigger this same workflow forever).
          if (/^record\./i.test(String(cfg.event))) {
            logEntry.result = `blocked — cannot publish reserved event '${cfg.event}' (would re-trigger workflows)`;
            logEntry.error  = 'reserved-event';
            return step.on_false_id ?? defaultNextId;
          }
          const data = this.#interpolatePayload(cfg.data, fieldCtx) ?? fieldCtx;
          this.eventBus.publish(cfg.event, {
            objectId: record?.object_id ?? null,
            record:   data,
            actorId:  actorId ?? null,
          }).catch(() => {});
          logEntry.result = `published event '${cfg.event}'`;
          return step.on_true_id ?? defaultNextId;
        }

        logEntry.result = 'no-op (missing integration or event)';
        return step.on_true_id ?? defaultNextId;
      }

      // ── Create Record ──────────────────────────────────────────────────────
      // Creates a new record in cfg.object_id and populates its fields through
      // the same storage router the API uses: a first-class CRM row for
      // CRM-backed objects, the typed EAV table for everything else, and any
      // overflow fields on a CRM object land in EAV rather than being dropped.
      // cfg.fields values support {{field}} interpolation from the current record.
      //
      // Config: { object_id, fields: {}, assigned_to?, stage_id?,
      //          link_field?, store_as? }
      //   link_field — lookup field on the NEW record set to this record's id
      //                (e.g. a Loan Application's `enquiry`), so it shows in
      //                this record's related list.
      //   store_as   — field on THIS record that receives the new record's id
      //                (e.g. an Enquiry's `party`), linking the other way.
      //   route      — true: leave the new record unassigned so the target
      //                object's assignment rules route it (an introducer's
      //                referral becomes an enquiry for the right desk, not for
      //                the referral's owner). Default: inherit this record's owner.
      // Values support {{field}} and {{id}} (this record's id).
      case 'create_record': {
        if (!cfg.object_id) {
          logEntry.result = 'no-op (missing object_id)';
          return step.on_true_id ?? defaultNextId;
        }
        if (!crmCache.fields) crmCache.fields = await this.#loadFields(record);
        const fieldCtx   = { ...crmCache.fields, id: record?.id ?? '' };
        const entityData = {};
        for (const [k, v] of Object.entries(cfg.fields ?? cfg.data ?? {})) {
          // `{ expr }` — a formula over this record (a repriced instalment).
          if (v && typeof v === 'object' && typeof v.expr === 'string') entityData[k] = await this.#evaluateValue(v.expr, fieldCtx, record?.id ?? null);
          else entityData[k] = typeof v === 'string' ? this.#interpolate(v, fieldCtx) : v;
        }
        if (cfg.link_field && record?.id) entityData[cfg.link_field] = Number(record.id);

        // `stage` names the new record's starting stage by its API name.
        let startStageId = cfg.stage_id ? Number(cfg.stage_id) : null;
        if (!startStageId && cfg.stage) {
          const st = await this.db.uiPipelineStage.findFirst({
            where: { name: String(cfg.stage), pipeline: { object_id: Number(cfg.object_id) } }, select: { id: true },
          });
          startStageId = st?.id ?? null;
        }

        // Preferred path: the full record service. The record is created as a
        // system write in the source record's tenant.
        if (this.recordService) {
          const created = await this.recordService.createRecord(
            Number(cfg.object_id),
            startStageId,
            actorId ?? null,
            cfg.assigned_to ?? (cfg.route ? null : record?.assigned_to) ?? null,
            { tenant_id: record?.tenant_id ?? null },
            entityData,
            { draft: true },
          );
          if (cfg.store_as && record?.id) {
            await this.#writeField(record, cfg.store_as, created.id);
            crmCache.fields = null;
          }
          logEntry.result = `created record #${created.id} in object ${cfg.object_id}`;
          return step.on_true_id ?? defaultNextId;
        }
        // Resolve target object type for storage routing
        const targetObj = await this.db.uiObject.findUnique({
          where: { id: Number(cfg.object_id) }, select: { name: true },
        });
        if (!targetObj) {
          // Target object was deleted after the step was configured — skip
          // cleanly instead of creating a record with a dangling object_id.
          logEntry.result = `no-op (target object ${cfg.object_id} no longer exists)`;
          return step.on_true_id ?? defaultNextId;
        }

        const anchor = await this.db.record.create({
          data: {
            object_id:         Number(cfg.object_id),
            assigned_to:       cfg.assigned_to ?? record?.assigned_to ?? null,
            pipeline_stage_id: cfg.stage_id ? Number(cfg.stage_id) : null,
          },
        });

        const storage = resolveStorage(targetObj.name);
        let eavData   = entityData;
        if (storage.kind === 'crm') {
          const crmData  = {};
          const overflow = {};
          for (const [k, v] of Object.entries(entityData)) {
            const column = storage.aliases[k] ?? k;
            if (storage.fields?.has(column)) crmData[column] = v;
            else overflow[k] = v;
          }
          if (Object.keys(crmData).length) {
            await this.db[storage.model].create({ data: { ...crmData, record_id: anchor.id } });
          }
          eavData = overflow;
        }
        if (Object.keys(eavData).length) {
          await this.#writeEavFields(anchor.id, cfg.object_id, eavData);
        }

        logEntry.result = `created record #${anchor.id} in object ${cfg.object_id}`;
        return step.on_true_id ?? defaultNextId;
      }

      // ── Update Related Records ─────────────────────────────────────────────
      // Finds records in cfg.object_id whose cfg.link_field matches this
      // record's id (or cfg.link_value, interpolated — e.g. link claims to a
      // policy by `policy_number`), then sets cfg.field to cfg.value on each.
      // Works for both CRM-backed and EAV-backed target objects.
      //
      // Config: { object_id, link_field, field, value, link_value? }
      case 'update_related': {
        if (!cfg.object_id || !cfg.link_field || !cfg.field) {
          logEntry.result = 'no-op (missing object_id, link_field, or field)';
          return step.on_true_id ?? defaultNextId;
        }
        if (!crmCache.fields) crmCache.fields = await this.#loadFields(record);
        const fieldCtx  = crmCache.fields;
        const linkValue = cfg.link_value != null
          ? this.#interpolate(String(cfg.link_value), fieldCtx)
          : (record?.id ?? null);
        if (linkValue == null || linkValue === '') {
          logEntry.result = 'no-op (link value resolved empty)';
          return step.on_true_id ?? defaultNextId;
        }
        const newValue = typeof cfg.value === 'string'
          ? this.#interpolate(cfg.value, fieldCtx)
          : cfg.value;

        const targetObj2 = await this.db.uiObject.findUnique({
          where: { id: Number(cfg.object_id) }, select: { name: true },
        });
        if (!targetObj2) {
          logEntry.result = `no-op (target object ${cfg.object_id} no longer exists)`;
          return step.on_true_id ?? defaultNextId;
        }

        const storage2 = resolveStorage(targetObj2.name);
        let updatedCount = 0;

        if (storage2.kind === 'crm') {
          const column = storage2.aliases[cfg.field] ?? cfg.field;
          if (!storage2.fields?.has(column)) {
            logEntry.result = `no-op ('${cfg.field}' is not a writable column on ${targetObj2.name})`;
            return step.on_true_id ?? defaultNextId;
          }
          const linkColumn = storage2.aliases[cfg.link_field] ?? cfg.link_field;
          const relRows = await this.db[storage2.model].findMany({
            where:  { [linkColumn]: /^\d+$/.test(String(linkValue)) ? Number(linkValue) : String(linkValue) },
            select: { id: true },
          });
          await this.db.$transaction(
            relRows.map(r => this.db[storage2.model].update({ where: { id: r.id }, data: { [column]: newValue } })),
          );
          updatedCount = relRows.length;
        } else {
          // EAV-backed object — match on the typed EAV row, then write the
          // target field onto every record that matched.
          const matches = await this.db.recordFieldValue.findMany({
            where: {
              field_name: String(cfg.link_field),
              str_value:  String(linkValue),
              record:     { object_id: Number(cfg.object_id), deleted_at: null },
            },
            select: { record_id: true },
          });
          const recordIds = [...new Set(matches.map(m => m.record_id))];
          for (const rid of recordIds) {
            await this.#writeEavFields(rid, cfg.object_id, { [cfg.field]: newValue });
            if (this.recordService) await this.recordService.recompute(rid, { propagate: true }).catch(() => {});
          }
          updatedCount = recordIds.length;
        }

        logEntry.result = `updated ${updatedCount} related records in object ${cfg.object_id}`;
        return step.on_true_id ?? defaultNextId;
      }

      // ── Send email ────────────────────────────────────────────────────────
      // Sends an email template to an address on the record (or a literal /
      // interpolated `to`). With `language_field`, a template named
      // `<template>_<lang>` (e.g. enquiry_ack_fr) is preferred when it exists,
      // so bilingual communications are templates, not code.
      //
      // Config: { template, to_field? = 'email', to?, language_field? }
      case 'send_email': {
        if (!crmCache.fields) crmCache.fields = await this.#loadFields(record);
        // Template variables: dates as YYYY-MM-DD rather than Date#toString.
        const ctx = Object.fromEntries(Object.entries({ ...crmCache.fields, id: record?.id ?? '' })
          .map(([k, v]) => [k, v instanceof Date ? (Number.isNaN(v.getTime()) ? '' : v.toISOString().slice(0, 10)) : v]));
        // {{upload_link}}: a signed 14-day link where the client sends the
        // documents the record's checklist still needs (DOC-FR-04).
        if (record?.id && record?.tenant_id) {
          const UploadLinkService = require('./upload-link.service');
          ctx.upload_link = UploadLinkService.linkFor({ tenantId: record.tenant_id, recordId: record.id }).url;
        }
        const to = cfg.to ? this.#interpolate(cfg.to, ctx) : ctx[cfg.to_field ?? 'email'];
        if (!to || !cfg.template) {
          logEntry.result = 'no-op (missing template or recipient address)';
          return step.on_true_id ?? defaultNextId;
        }
        const lang = cfg.language_field ? String(ctx[cfg.language_field] ?? '').trim().toLowerCase() : '';
        const names = lang ? [`${cfg.template}_${lang}`, cfg.template] : [cfg.template];
        const candidates = await this.db.emailTemplate.findMany({
          where: { name: { in: names }, is_active: true }, select: { id: true, name: true },
        });
        const tpl = names.map((n) => candidates.find((c) => c.name === n)).find(Boolean);
        if (!tpl) {
          logEntry.result = `no-op (email template '${cfg.template}' not found)`;
          return step.on_true_id ?? defaultNextId;
        }
        if (!this.emailSender) {
          const EmailSendService = require('./email-send.service');
          const EmailTemplateService = require('./email-template.service');
          this.emailSender = new EmailSendService(this.db, new EmailTemplateService(this.db));
        }
        const sent = await this.emailSender.sendWithTemplate({
          template_id: tpl.id, variables: await this.#templateValues(record, ctx), to_email: String(to),
          related_record_id: record?.id ?? null, related_type: 'record', sent_by: actorId ?? null,
        });
        logEntry.result = `email ${sent.status} → ${to} (${tpl.name})`;
        // Show the email on the record's Activity timeline, as a manual send
        // does, so staff can see what the automation told the client.
        const by = actorId ?? record?.created_by ?? record?.assigned_to ?? null;
        if (record?.id && by) {
          await this.db.activity.create({
            data: {
              record_id: record.id, employee_id: String(by), type: 'email',
              subject: `Email sent: ${sent.subject ?? tpl.name}`.slice(0, 200),
              description: `Sent automatically to ${to}${sent.status === 'sent' ? '' : ` (${sent.status})`}`,
              completed_at: new Date(),
            },
          }).catch(() => { /* best-effort, like the manual send */ });
        }
        return step.on_true_id ?? defaultNextId;
      }

      // ── Email a list ──────────────────────────────────────────────────────
      // Sends a template to everyone on a list that matches this record — a
      // research publication to the subscribers of its topic (MKT-FR-04).
      // Recipients come from `list_object` rows that match `match` (values
      // may be {{placeholders}} from this record) and `active`, through their
      // `link_field` lookup (a party). A recipient flagged by `suppress_field`
      // (no consent, do-not-contact) or without an email is skipped, and each
      // person gets one email however many list rows they have. With
      // `track_field`, the email carries an open-tracking image and opens are
      // counted into that field of this record.
      //
      // Config: { template, list_object, link_field, match: {f: v}, active?: {f: v},
      //           email_field? = 'email', language_field?, suppress_field?, track_field?, limit? = 2000 }
      case 'email_list': {
        if (!cfg.template || !cfg.list_object || !cfg.link_field) {
          logEntry.result = 'no-op (missing template, list_object or link_field)';
          return step.on_true_id ?? defaultNextId;
        }
        if (!crmCache.fields) crmCache.fields = await this.#loadFields(record);
        const ctx = Object.fromEntries(Object.entries({ ...crmCache.fields, id: record?.id ?? '' })
          .map(([k, v]) => [k, v instanceof Date ? (Number.isNaN(v.getTime()) ? '' : v.toISOString().slice(0, 10)) : v]));
        const listObj = await this.db.uiObject.findFirst({ where: { name: String(cfg.list_object) }, select: { id: true } });
        if (!listObj) { logEntry.result = `no-op (list object '${cfg.list_object}' not found)`; return step.on_true_id ?? defaultNextId; }
        const want = Object.entries({ ...(cfg.match ?? {}), ...(cfg.active ?? {}) })
          .map(([f, v]) => [f, typeof v === 'string' ? this.#interpolate(v, ctx) : v]);
        const names = [...new Set([cfg.link_field, ...want.map(([f]) => f)])];
        const rows = await this.db.recordFieldValue.findMany({
          where: { field_name: { in: names }, record: { object_id: listObj.id, deleted_at: null } },
          select: { record_id: true, field_name: true, str_value: true, num_value: true, bool_value: true },
          take: (Number(cfg.limit) || 2000) * names.length,
        });
        const byRow = new Map();
        for (const r of rows) {
          const v = r.str_value ?? (r.num_value != null ? String(r.num_value) : r.bool_value != null ? String(r.bool_value) : null);
          (byRow.get(r.record_id) ?? byRow.set(r.record_id, {}).get(r.record_id))[r.field_name] = v;
        }
        const recipients = [...new Set([...byRow.values()]
          .filter((row) => want.every(([f, v]) => String(row[f] ?? '') === String(v ?? '')))
          .map((row) => Number(row[cfg.link_field])).filter((n) => Number.isInteger(n) && n > 0))];
        if (!recipients.length) { logEntry.result = 'no recipients on the list'; return step.on_true_id ?? defaultNextId; }

        const emailField = cfg.email_field ?? 'email';
        const personFields = [...new Set([emailField, 'first_name', 'display_name', cfg.language_field, cfg.suppress_field].filter(Boolean))];
        const pv = await this.db.recordFieldValue.findMany({
          where: { record_id: { in: recipients }, field_name: { in: personFields }, record: { deleted_at: null } },
          select: { record_id: true, field_name: true, str_value: true, bool_value: true, num_value: true },
        });
        const people = new Map();
        for (const r of pv) (people.get(r.record_id) ?? people.set(r.record_id, {}).get(r.record_id))[r.field_name] = r.str_value ?? r.bool_value ?? r.num_value;
        // A suppression formula is computed on read for some objects; the
        // record service resolves it when the stored value is missing.
        const suppressed = async (pid, person) => {
          if (!cfg.suppress_field) return false;
          let v = person[cfg.suppress_field];
          if (v == null && this.recordService?.getRecord) v = (await this.recordService.getRecord(pid).catch(() => null))?.data?.[cfg.suppress_field];
          return v === true || v === 'true' || v === 1 || v === '1';
        };

        const tplNames = await this.db.emailTemplate.findMany({ where: { name: { in: [cfg.template, `${cfg.template}_fr`, `${cfg.template}_en`] }, is_active: true }, select: { id: true, name: true } });
        const pick = (lang) => tplNames.find((t) => t.name === `${cfg.template}_${lang}`) ?? tplNames.find((t) => t.name === cfg.template);
        if (!pick('en')) { logEntry.result = `no-op (email template '${cfg.template}' not found)`; return step.on_true_id ?? defaultNextId; }
        if (!this.emailSender) {
          const EmailSendService = require('./email-send.service');
          const EmailTemplateService = require('./email-template.service');
          this.emailSender = new EmailSendService(this.db, new EmailTemplateService(this.db));
        }
        const tracking = require('./email-tracking');
        // Matching above uses the stored values; the email shows them formatted.
        const vars = await this.#templateValues(record, ctx);
        const base = (process.env.API_URL || process.env.APP_URL || 'http://localhost:5173').replace(/\/+$/, '');
        const tenantId = record?.tenant_id;
        let sent = 0; let skipped = 0;
        for (const pid of recipients) {
          const person = people.get(pid) ?? {};
          const to = person[emailField];
          if (!to || await suppressed(pid, person)) { skipped += 1; continue; }
          const lang = cfg.language_field ? String(person[cfg.language_field] ?? '').toLowerCase() : 'en';
          const tpl = pick(lang) ?? pick('en');
          await this.emailSender.sendWithTemplate({
            template_id: tpl.id, to_email: String(to),
            variables: { ...vars, first_name: person.first_name ?? '', display_name: person.display_name ?? '' },
            related_record_id: record?.id ?? null,
            related_type: cfg.track_field ? `distribution:${cfg.track_field}` : 'distribution',
            sent_by: actorId ?? null,
            append_html: cfg.track_field && tenantId ? tracking.pixel({ base, tenantId, recordId: record.id, email: to, field: cfg.track_field }) : null,
          }).then(() => { sent += 1; }, () => { skipped += 1; });
        }
        logEntry.result = `emailed ${sent} of ${recipients.length} on the list (${skipped} skipped: no email, no consent or failed)`;
        // Opens start at the number already counted (0 on a first send), so the
        // record shows "Opens: 0" rather than nothing until someone reads it.
        if (sent && cfg.track_field && tenantId && /^[a-z_][a-z0-9_]{0,99}$/.test(cfg.track_field) && this.db.emailLog?.count) {
          const opens = await this.db.emailLog.count({ where: { related_record_id: record.id, related_type: `distribution:${cfg.track_field}`, opened_at: { not: null } } });
          await this.db.recordFieldValue.upsert({
            where: { record_id_field_name: { record_id: record.id, field_name: cfg.track_field } },
            create: { record_id: record.id, field_name: cfg.track_field, num_value: opens, tenant_id: tenantId },
            update: { num_value: opens },
          }).catch(() => { /* the count is refreshed again on the first open */ });
        }
        // What the person who pressed the button is told, and what the record's
        // Activity timeline keeps: how many were emailed and how many skipped.
        logEntry.summary = `Emailed to ${sent} subscriber${sent === 1 ? '' : 's'}`
          + (skipped ? ` — ${skipped} skipped (no email address or no marketing consent).` : '.');
        const by = actorId ?? record?.created_by ?? record?.assigned_to ?? null;
        if (record?.id && by && this.db.activity?.create) {
          await this.db.activity.create({
            data: {
              record_id: record.id, employee_id: String(by), type: 'email',
              subject: `Sent to ${sent} subscriber${sent === 1 ? '' : 's'}`.slice(0, 200),
              description: logEntry.summary,
              completed_at: new Date(),
            },
          }).catch(() => { /* best-effort, like a single send */ });
        }
        return step.on_true_id ?? defaultNextId;
      }

      // ── Send SMS ──────────────────────────────────────────────────────────
      // Sends a short text through an SMS integration (Builder ▸ Integrations),
      // so the gateway is swapped by configuration, never by editing workflows.
      // Config: { integration, message, message_<lang>?, to_field?, to?,
      //           language_field?, suppress_field? }
      //   suppress_field — a boolean field (e.g. do_not_contact) that, when
      //                    true, skips the send for marketing messages.
      case 'send_sms': {
        if (!crmCache.fields) crmCache.fields = await this.#loadFields(record);
        const ctx = Object.fromEntries(Object.entries({ ...crmCache.fields, id: record?.id ?? '' })
          .map(([k, v]) => [k, v instanceof Date ? (Number.isNaN(v.getTime()) ? '' : v.toISOString().slice(0, 10)) : v]));
        const yes = (v) => v === true || ['true', '1', 'yes'].includes(String(v ?? '').toLowerCase());
        if (cfg.suppress_field && yes(ctx[cfg.suppress_field])) {
          logEntry.result = `skipped — ${cfg.suppress_field} is set`;
          return step.on_true_id ?? defaultNextId;
        }
        const to = String((cfg.to ? this.#interpolate(cfg.to, ctx) : ctx[cfg.to_field ?? 'mobile']) ?? '').trim();
        const lang = cfg.language_field ? String(ctx[cfg.language_field] ?? '').trim().toLowerCase() : '';
        const text = (lang && cfg[`message_${lang}`]) || cfg.message;
        if (!to || !text || !cfg.integration) {
          logEntry.result = 'no-op (missing integration, message or recipient number)';
          return step.on_true_id ?? defaultNextId;
        }
        if (!this.integrationService) {
          logEntry.result = 'sms skipped — IntegrationService not wired';
          logEntry.error  = 'IntegrationService not available';
          return step.on_false_id ?? null;
        }
        const message = String(this.#interpolate(text, ctx)).slice(0, 480);
        try {
          const log = await this.integrationService.executeByName(cfg.integration, { to, message, record_id: record?.id ?? null });
          logEntry.result = `sms → ${to} via '${cfg.integration}' (log #${log?.id ?? '?'})`;
        } catch (err) {
          const job = await this.#queueRetry(step, record, cfg.integration, { to, message, record_id: record?.id ?? null }, null, err);
          logEntry.result = `sms via '${cfg.integration}' failed: ${err.message}${job ? ` · queued for retry (job #${job.id})` : ''}`;
          logEntry.error  = err.message;
          return step.on_false_id ?? null;
        }
        return step.on_true_id ?? defaultNextId;
      }

      // ── Generate document ─────────────────────────────────────────────────
      // Renders a merge template (offer letter, decline letter, KYC refresh
      // request…) from this record's values and files it on the record, so it
      // appears in the record's Docs tab and can be shared or sent for e-sign.
      //
      // Config: { template, filename? }   (filename supports {{field}})
      case 'generate_document': {
        if (!record?.id || !cfg.template) {
          logEntry.result = 'no-op (missing template or record)';
          return step.on_true_id ?? defaultNextId;
        }
        const tpl = await this.db.documentTemplate.findFirst({ where: { name: String(cfg.template), is_active: true }, select: { id: true, name: true } });
        if (!tpl) {
          logEntry.result = `no-op (document template '${cfg.template}' not found)`;
          return step.on_true_id ?? defaultNextId;
        }
        if (!crmCache.fields) crmCache.fields = await this.#loadFields(record);
        const ctx = { ...(await this.#displayValues(record.object_id, crmCache.fields)), record_id: record.id, today: new Date().toISOString().slice(0, 10) };
        // Letterhead: the legal entity of the record's business unit, when it has one.
        const anchor = await this.db.record.findUnique({ where: { id: Number(record.id) }, select: { business_unit_id: true } }).catch(() => null);
        const unit = anchor?.business_unit_id ? await this.db.businessUnit.findUnique({ where: { id: anchor.business_unit_id }, select: { name: true, legal_name: true, regulator: true, licence: true, config: true } }).catch(() => null) : null;
        if (unit) {
          ctx.letterhead_subtitle = [unit.legal_name || unit.name, unit.config?.address].filter(Boolean).join(' · ');
          ctx.letterhead_footer = [unit.legal_name || unit.name, unit.licence ? `Licensed by the ${unit.regulator || 'regulator'} (${unit.licence})` : null].filter(Boolean).join(' — ');
        }
        ctx.today_long = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
        const DocumentService = require('./document.service');
        const DocumentTemplateService = require('./document-template.service');
        const obj = await this.db.uiObject.findUnique({ where: { id: Number(record.object_id) }, select: { name: true } });
        const doc = await new DocumentTemplateService(this.db, new DocumentService(this.db)).render(tpl.id, {
          data: ctx,
          filename: cfg.filename ? this.#interpolate(cfg.filename, ctx) : undefined,
          entityType: obj?.name ?? null,
          entityId: Number(record.id),
          uploadedBy: actorId ?? null,
        });
        logEntry.result = `generated document #${doc?.id} from '${tpl.name}'`;
        return step.on_true_id ?? defaultNextId;
      }

      // ── Create reminder ───────────────────────────────────────────────────
      // Schedules a personal reminder (the record's Reminders tab and My
      // Reminders) relative to a date on the record — e.g. a forward's value
      // date minus 7 days. A reminder that would already be due is set for now.
      // The same open reminder is never created twice for a record.
      //
      // Config: { title, note?, date_field, offset_days? = 0, employee_field? = 'assigned_to',
      //           employee_id?, priority? = 'normal' }
      case 'create_reminder': {
        if (!record?.id || !cfg.title || !cfg.date_field) {
          logEntry.result = 'no-op (missing title, date_field or record)';
          return step.on_true_id ?? defaultNextId;
        }
        if (!crmCache.fields) crmCache.fields = await this.#loadFields(record);
        const base = crmCache.fields[cfg.date_field];
        const at = base ? new Date(base) : null;
        if (!at || Number.isNaN(at.getTime())) {
          logEntry.result = `no-op (${cfg.date_field} is empty)`;
          return step.on_true_id ?? defaultNextId;
        }
        at.setUTCDate(at.getUTCDate() + (Number(cfg.offset_days) || 0));
        const remindAt = at < new Date() ? new Date() : at;
        const employeeId = cfg.employee_id ?? crmCache.fields[cfg.employee_field ?? 'assigned_to'] ?? actorId ?? null;
        if (!employeeId) {
          logEntry.result = 'no-op (nobody to remind)';
          return step.on_true_id ?? defaultNextId;
        }
        const days = Object.fromEntries(Object.entries(crmCache.fields)
          .map(([k, v]) => [k, v instanceof Date ? (Number.isNaN(v.getTime()) ? '' : v.toISOString().slice(0, 10)) : v]));
        const ctx = await this.#readable(record, days);
        const title = this.#interpolate(String(cfg.title), ctx).slice(0, 200);
        const open = await this.db.reminder.findFirst({ where: { record_id: Number(record.id), title, status: { in: ['pending', 'notified'] } }, select: { id: true } });
        if (open) {
          logEntry.result = `no-op (reminder #${open.id} already open)`;
          return step.on_true_id ?? defaultNextId;
        }
        const reminder = await this.db.reminder.create({
          data: {
            record_id:   Number(record.id),
            employee_id: String(employeeId),
            created_by:  String(actorId ?? employeeId),
            title,
            note:        cfg.note ? this.#interpolate(String(cfg.note), ctx) : null,
            remind_at:   remindAt,
            priority:    ['low', 'normal', 'high', 'urgent'].includes(cfg.priority) ? cfg.priority : 'normal',
            status:      'pending',
            tenant_id:   record.tenant_id ?? tenantContext.getStore()?.tenantId,
          },
        });
        logEntry.result = `created reminder #${reminder.id} for ${employeeId} at ${remindAt.toISOString()}`;
        return step.on_true_id ?? defaultNextId;
      }

      default:
        logEntry.result = `unknown step type: ${step.step_type}`;
        return step.on_true_id ?? defaultNextId;
    }
  }

  // ── Helpers ──────────────────────────────────────────────────────────────

  /**
   * Field values as a reader expects them in a letter: picklist labels instead
   * of codes, grouped amounts with two decimals, dates as YYYY-MM-DD.
   * `<field>_raw` keeps the stored value for templates that need it.
   */
  async #displayValues(objectId, fields) {
    const defs = objectId ? await this.db.uiField.findMany({ where: { object_id: Number(objectId) }, select: { name: true, field_type: true, options: true, config: true } }).catch(() => []) : [];
    const byName = new Map(defs.map((d) => [d.name, d]));
    const out = {};
    for (const [k, v] of Object.entries(fields ?? {})) {
      out[`${k}_raw`] = v;
      const d = byName.get(k);
      const t = d?.field_type;
      const fmt = d?.config?.format;
      if (v == null || v === '') { out[k] = ''; continue; }
      if (v instanceof Date) { out[k] = Number.isNaN(v.getTime()) ? '' : v.toISOString().slice(0, 10); continue; }
      if (['select', 'radio'].includes(t) && Array.isArray(d.options)) {
        const o = d.options.find((x) => (x && typeof x === 'object' ? String(x.value) : String(x)) === String(v));
        out[k] = o && typeof o === 'object' ? (o.label ?? v) : v;
        continue;
      }
      const isMoney = t === 'currency' || fmt === 'currency';
      if ((isMoney || t === 'decimal' || t === 'number' || fmt === 'number') && Number.isFinite(Number(v)) && typeof v !== 'boolean') {
        out[k] = Number(v).toLocaleString('en-US', isMoney ? { minimumFractionDigits: 2, maximumFractionDigits: 2 } : { maximumFractionDigits: 4 });
        continue;
      }
      if (typeof v === 'boolean' || v === 'true' || v === 'false') { out[k] = String(v) === 'true' ? 'Yes' : 'No'; continue; }
      out[k] = v;
    }
    return out;
  }

  /**
   * Resolve notification recipient employee_ids from step config.
   *
   * Supported config keys:
   *   employee_id   — hardcoded recipient
   *   field         — record data field whose value is an employee_id
   *   role          — broadcast to all active employees with this role name
   *   notify_actor  — true → include the user who triggered the workflow
   *   exclude_actor — true → never the user who triggered it (maker-checker)
   *   exclude_field — record field naming someone to leave out (e.g. `maker`)
   */
  async #resolveRecipients(cfg, record, actorId, crmCache = { fields: null }) {
    const ids = new Set();

    if (cfg.employee_id) ids.add(String(cfg.employee_id));
    if (cfg.field) {
      if (!crmCache.fields) crmCache.fields = await this.#loadFields(record);
      const fields = crmCache.fields;
      const val    = fields[cfg.field] ?? record?.[cfg.field];
      if (val) ids.add(String(val));
    }
    if (cfg.notify_actor && actorId) ids.add(String(actorId));

    if (cfg.role) {
      // role is a plain String FK on Employee (not a relation object)
      const employees = await this.db.employee.findMany({
        where:  { role: cfg.role, is_active: true },
        select: { employee_id: true },
      });
      employees.forEach((e) => ids.add(String(e.employee_id)));
    }

    // Maker-checker: the person who triggered the step (and/or whoever a
    // record field names, e.g. `maker`) can never be among its approvers.
    if (cfg.exclude_actor && actorId) ids.delete(String(actorId));
    if (cfg.exclude_field) {
      if (!crmCache.fields) crmCache.fields = await this.#loadFields(record);
      const maker = crmCache.fields[cfg.exclude_field] ?? record?.[cfg.exclude_field];
      if (maker) ids.delete(String(maker));
    }

    return [...ids];
  }

  /** Evaluate a condition against a single field value. */
  #evaluate(actual, operator, expected) {
    const op  = String(operator ?? '').toLowerCase();
    const now = new Date();

    switch (op) {
      case 'eq':
      case '==':            return String(actual ?? '') === String(expected ?? '');
      case 'neq':
      case '!=':            return String(actual ?? '') !== String(expected ?? '');
      case 'in':            return [].concat(expected).map(String).includes(String(actual ?? ''));
      case 'nin':           return ![].concat(expected).map(String).includes(String(actual ?? ''));
      case 'gt':            return Number(actual) >  Number(expected);
      case 'lt':            return Number(actual) <  Number(expected);
      case 'gte':           return Number(actual) >= Number(expected);
      case 'lte':           return Number(actual) <= Number(expected);
      case 'contains':
        return String(actual  ?? '').toLowerCase()
          .includes(String(expected ?? '').toLowerCase());
      case 'empty':         return actual == null || String(actual) === '';
      case 'notempty':      return actual != null  && String(actual) !== '';

      // ── Date-aware operators ──────────────────────────────────────────────
      case 'before_today':
        return actual != null && new Date(actual) < new Date(now.toDateString());
      case 'after_today':
        return actual != null && new Date(actual) > new Date(now.toDateString());
      case 'today':
        return actual != null && new Date(actual).toDateString() === now.toDateString();
      case 'date_within_days': {
        if (actual == null) return false;
        const days = Number(expected ?? 0);
        const diffDays = (new Date(actual) - now) / 86_400_000;
        return diffDays >= 0 && diffDays <= days;
      }
      case 'date_overdue':
        return actual != null && new Date(actual) < now;

      default:              return false;
    }
  }

  /** Replace {{fieldName}} placeholders with values from record data. */
  /** Truthiness of a formula over a record's values; a broken formula is false. */
  async #evaluateExpression(expression, values, recordId) {
    try {
      const ctx = this.recordService?.compute
        ? this.recordService.compute.context(values, recordId)
        : { values };
      return truthy(await evaluateFormula(String(expression ?? ''), ctx));
    } catch (err) {
      logger?.warn?.('[WorkflowEngine] expression condition failed', { error: err.message });
      return false;
    }
  }

  /** The value of a formula over a record's values; a broken formula is null. */
  async #evaluateValue(expression, values, recordId) {
    try {
      const ctx = this.recordService?.compute
        ? this.recordService.compute.context({ ...values }, recordId)
        : { values: { ...values } };
      return (await evaluateFormula(String(expression ?? ''), ctx)) ?? null;
    } catch (err) {
      logger?.warn?.('[WorkflowEngine] value expression failed', { error: err.message });
      return null;
    }
  }

  /**
   * The record's values as people should read them in an approval card or a
   * notification: picklist labels instead of stored codes ("Approve with
   * conditions", not "approve_conditions") and amounts with thousands
   * separators. Integration payloads and field writes keep the raw values.
   */
  async #readable(record, values = {}) {
    const objectId = record?.object_id;
    if (!objectId || typeof this.db.uiField?.findMany !== 'function') return values;
    const fields = await this.db.uiField.findMany({
      where:  { object_id: Number(objectId), is_active: true, field_type: { in: ['select', 'radio', 'multi_select', 'currency', 'formula'] } },
      select: { name: true, field_type: true, options: true, config: true },
    }).catch(() => []);
    const out = { ...values };
    for (const f of fields ?? []) {
      const v = values[f.name];
      if (v === null || v === undefined || v === '') continue;
      if (Array.isArray(f.options) && f.options.length) {
        const label = (x) => f.options.find((o) => String(o?.value ?? o) === String(x))?.label ?? x;
        out[f.name] = Array.isArray(v) ? v.map(label).join(', ') : label(v);
      } else if (f.field_type === 'currency' || f.config?.format === 'currency') {
        const n = Number(v);
        if (Number.isFinite(n)) out[f.name] = n.toLocaleString('en-GB', { maximumFractionDigits: 2 });
      }
    }
    return out;
  }

  /**
   * Template variables for an email: amounts and numbers formatted from the
   * field metadata and the workspace currency ("39,834.26"), dates in the
   * workspace date format. Falls back to the values unchanged.
   */
  async #templateValues(record, values = {}) {
    try {
      const { formatTemplateValues } = require('../utils/template-format');
      const fields = record?.object_id && typeof this.db.uiField?.findMany === 'function'
        ? await this.db.uiField.findMany({
          where:  { object_id: Number(record.object_id), is_active: true, field_type: { in: ['currency', 'decimal', 'number', 'formula', 'date', 'datetime'] } },
          select: { name: true, field_type: true, config: true },
        }).catch(() => [])
        : [];
      let decimals = 2; let numberFormat = '1,234.56'; let dateFormat = 'YYYY-MM-DD';
      if (record?.tenant_id) {
        const CurrencyService = require('./currency.service');
        const profile = await new CurrencyService(this.db).getProfile(record.tenant_id);
        decimals = profile.decimals ?? 2;
        numberFormat = profile.numberFormat ?? numberFormat;
        const row = typeof this.db.tenantConfig?.findUnique === 'function'
          ? await this.db.tenantConfig.findUnique({
            where: { tenant_id_config_key: { tenant_id: Number(record.tenant_id), config_key: 'localization.date_format' } },
          }).catch(() => null)
          : null;
        if (row?.config_value) dateFormat = String(row.config_value);
      }
      return formatTemplateValues(values, fields ?? [], { decimals, numberFormat, dateFormat });
    } catch (err) {
      logger?.warn?.('[WorkflowEngine] template formatting failed — raw values used', { error: err.message });
      return values;
    }
  }

  #interpolate(template, data = {}) {
    return String(template).replace(/\{\{(\w+)\}\}/g, (_, k) => {
      const v = data[k];
      // Dates read back from typed columns are Date objects: show them as
      // YYYY-MM-DD, not "Tue Oct 13 2026 04:00:00 GMT+0400".
      if (v instanceof Date) return Number.isNaN(v.getTime()) ? '' : v.toISOString().slice(0, 10);
      return v ?? '';
    });
  }

  /**
   * Interpolate {{field}} placeholders inside every string value of a config
   * object, returning a fresh object. Returns null when `obj` is nullish so the
   * caller can fall back to a default payload.
   */
  #interpolatePayload(obj, fieldCtx) {
    if (obj == null) return null;
    try {
      return JSON.parse(this.#interpolate(JSON.stringify(obj), fieldCtx));
    } catch {
      return obj;
    }
  }

  /**
   * Decide which store owns a loaded record's field data.
   *
   * The object's `name` is authoritative (that is how the API routes writes).
   * When the object row is unavailable — or names an object with no CRM
   * mapping — fall back to whichever crm_* row the record actually carries, so
   * a record that has a first-class entity is never written to EAV by mistake.
   *
   * @param {Object} full – a `records` row loaded with `object` + all crm_* relations
   * @returns {{ objectName: string|null, storage: Object, entity: Object|null }}
   */
  #resolveRecordStorage(full) {
    const ENTITY_KEYS = [
      ['crm_lead',        'lead'],
      ['crm_lead_intake', 'lead_intake'],
      ['crm_contact',     'contact'],
      ['crm_account',     'account'],
      ['crm_opportunity', 'opportunity'],
      ['crm_case',        'case'],
    ];
    const objectName = full?.object?.name ?? null;
    const byName     = resolveStorage(objectName);
    if (byName.kind === 'crm') {
      const key = ENTITY_KEYS.find(([, name]) => MODEL_MAP[name] === byName.model);
      return { objectName, storage: byName, entity: (key && full?.[key[0]]) || null };
    }
    const present = ENTITY_KEYS.find(([key]) => full?.[key]);
    if (present) {
      return { objectName: present[1], storage: resolveStorage(present[1]), entity: full[present[0]] };
    }
    return { objectName, storage: byName, entity: null };
  }

  /**
   * Load a record's field values as a flat key-value map, whatever storage
   * backs the object.
   *
   * A record's data lives in one of two places (see crm-storage-map.js):
   *   • a first-class CRM table  — `prospect`/`lead_intake`/`contact`/… objects
   *   • the typed EAV table      — `client` and all custom objects
   * Objects with a CRM entity may ALSO carry overflow fields in EAV, so both
   * are read and merged the same way RecordService hydrates a record for the
   * API: EAV first, then non-null CRM columns on top (mapped back through
   * REVERSE_ALIAS so `{{annual_income}}` resolves for a `crm_leads` row).
   *
   * Record-level columns (`assigned_to`, `pipeline_stage_id`) are exposed too,
   * so a condition can gate on ownership or pipeline position.
   *
   * Returns {} when the record cannot be loaded — every caller treats a missing
   * field as "no value", so a workflow degrades to a no-op rather than throwing.
   */
  async #loadFields(record) {
    if (!record?.id) return {};
    const full = await this.db.record.findUnique({
      where:   { id: Number(record.id) },
      include: {
        object:          { select: { name: true } },
        pipeline_stage:  { select: { name: true } },
        field_values:    true,
        crm_lead:        true,
        crm_lead_intake: true,
        crm_contact:     true,
        crm_account:     true,
        crm_opportunity: true,
        crm_case:        true,
      },
    });
    if (!full) return {};

    // ── EAV base ───────────────────────────────────────────────────────────
    const fields = {};
    for (const row of full.field_values ?? []) {
      fields[row.field_name] = fromTypedRow(row);
    }

    // ── CRM entity columns (non-null wins over EAV) ────────────────────────
    const { objectName: objName, entity } = this.#resolveRecordStorage(full);
    if (entity) {
      // Strip internal FK / timestamp columns; expose user-visible ones only.
      const { id: _id, record_id: _rid, tenant_id: _tid,
        created_at: _ca, updated_at: _ua, created_by: _cb, ...cols } = entity;
      const reverse = REVERSE_ALIAS[objName] ?? {};
      for (const [col, val] of Object.entries(cols)) {
        if (val == null || val === '') continue;
        fields[reverse[col] ?? col] = val;
        // Also expose the raw column name so configs written against either
        // vocabulary (`annual_revenue` or `annual_income`) both resolve.
        if (reverse[col]) fields[col] = val;
      }
    }

    // ── Record-level columns ──────────────────────────────────────────────
    fields.assigned_to       = full.assigned_to ?? null;
    fields.pipeline_stage_id = full.pipeline_stage_id ?? null;
    fields.record_id         = full.id;
    fields.id                = full.id;
    fields.created_by        = full.created_by ?? null;
    // Readable context for conditions and {{placeholders}}: the stage by its
    // API name (`stage eq 'offer_issued'`) and today's date (and month, `2026-10`) for stamping.
    fields.stage             = full.pipeline_stage?.name ?? null;
    fields.today             = new Date().toISOString().slice(0, 10);
    fields.this_month        = fields.today.slice(0, 7);

    return fields;
  }

  /**
   * Write a single field on a record, routing to whichever store owns it.
   *
   *   assigned_to / pipeline_stage_id → the `records` anchor row
   *   a CRM-backed object's column    → the crm_* entity row (aliases applied)
   *   anything else                   → the typed EAV table
   *
   * The write goes straight to Prisma rather than through RecordService on
   * purpose: RecordService publishes `record.updated`, which this engine
   * subscribes to, so routing action steps through it would re-trigger the
   * very workflow that is running.
   *
   * @returns {Promise<boolean>} true when a row was actually written.
   */
  async #writeField(record, field, value) {
    if (!record?.id || !field) return false;
    const recordId = Number(record.id);

    // `stage` — move the record to a stage by its API name. Goes through the
    // record service so stage gates, the status timeline and stage events
    // (and so any workflow listening for that stage) all apply.
    if (field === 'stage') {
      const rec = await this.db.record.findUnique({ where: { id: recordId }, select: { object_id: true } });
      const stage = rec && await this.db.uiPipelineStage.findFirst({
        where: { name: String(value), pipeline: { object_id: rec.object_id } }, select: { id: true },
      });
      if (!stage) return false;
      if (this.recordService) await this.recordService.updateRecordStage(recordId, stage.id, null, null);
      else await this.db.record.update({ where: { id: recordId }, data: { pipeline_stage_id: stage.id } });
      return true;
    }

    // ── Record-level columns ──────────────────────────────────────────────
    if (RECORD_COLUMNS.has(field)) {
      // A stage set by id moves the record like `stage` does — gate, mirrored
      // status, timeline and stage events — not by a bare column write.
      if (field === 'pipeline_stage_id' && value != null && value !== '' && this.recordService) {
        await this.recordService.updateRecordStage(recordId, Number(value), null, null);
        return true;
      }
      const data = field === 'pipeline_stage_id'
        ? { pipeline_stage_id: value == null || value === '' ? null : Number(value) }
        : { assigned_to: value == null || value === '' ? null : String(value) };
      await this.db.record.update({ where: { id: recordId }, data });
      return true;
    }

    const full = await this.db.record.findUnique({
      where:   { id: recordId },
      include: {
        object:          { select: { name: true } },
        crm_lead:        { select: { id: true } },
        crm_lead_intake: { select: { id: true } },
        crm_contact:     { select: { id: true } },
        crm_account:     { select: { id: true } },
        crm_opportunity: { select: { id: true } },
        crm_case:        { select: { id: true } },
      },
    });
    if (!full) return false;

    const { storage, entity } = this.#resolveRecordStorage(full);

    // ── First-class CRM column ────────────────────────────────────────────
    if (storage.kind === 'crm') {
      const column = storage.aliases[field] ?? field;
      if (storage.fields?.has(column)) {
        if (!entity) {
          // The object owns this column but the record has no entity row yet
          // (created without CRM data). Writing to EAV instead would shadow the
          // canonical column, so report a no-op rather than diverge.
          logger.warn('[workflow] field write skipped — no CRM entity row for record', {
            recordId, field, object: storage.model,
          });
          return false;
        }
        await this.db[storage.model].update({
          where: { id: entity.id },
          data:  { [column]: value },
        });
        return true;
      }
      // Not a writable CRM column → fall through to EAV so overflow fields are
      // still persisted rather than silently dropped.
    }

    // ── Typed EAV ─────────────────────────────────────────────────────────
    await this.#writeEavFields(recordId, full.object_id, { [field]: value });
    return true;
  }

  /**
   * Upsert one or more field values into the typed EAV table for a record.
   * Each value is serialised into the column matching its UiField data type,
   * so number/date/boolean fields stay queryable instead of degrading to text.
   */
  async #writeEavFields(recordId, objectId, data) {
    const rid = Number(recordId);
    for (const [fieldName, value] of Object.entries(data)) {
      const { dataType, encrypt } = await this.#fieldStorage(objectId, fieldName);
      // An encrypted field (an ID number) is stored the way RecordService stores
      // it — never in clear because an automation, not a form, wrote it.
      const typed    = encrypt && value != null && value !== ''
        ? { str_value: encryptField(String(value)) }
        : toTypedValue(value, dataType);
      await this.db.recordFieldValue.upsert({
        where:  { record_id_field_name: { record_id: rid, field_name: fieldName } },
        create: { record_id: rid, field_name: fieldName, ...typed },
        update: typed,
      });
    }
  }

  /**
   * Look up the UiField data type for an object/field pair so EAV writes land
   * in the right typed column. Falls back to 'string', which is always safe
   * because str_value is populated for every type.
   */
  async #fieldStorage(objectId, fieldName) {
    if (!objectId) return { dataType: 'string', encrypt: false };
    try {
      const field = await this.db.uiField.findFirst({
        where:  { object_id: Number(objectId), name: String(fieldName) },
        select: { data_type: true, field_type: true, config: true },
      });
      return { dataType: field?.data_type ?? 'string', encrypt: Boolean(field?.config?.encrypt) };
    } catch {
      return { dataType: 'string', encrypt: false };
    }
  }

  /**
   * SSRF guard — delegates to IntegrationService so there is exactly ONE
   * outbound-URL policy in the app. Retained for any direct callers/tests.
   */
  #isSafeWebhookUrl(urlString) {
    return IntegrationService.isSafeUrl(urlString);
  }
}

module.exports = WorkflowEngineService;

