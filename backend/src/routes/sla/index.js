'use strict';

const {
  authenticate, requireAdmin, MANAGER_THRESHOLD, ADMIN_THRESHOLD,
} = require('../../middleware/authenticate');
const SlaService = require('../../services/sla.service');
const { CONDITION_OPS, supportedMetrics, metricsFor } = require('../../services/sla.service');

/** Escalation vocabulary the engine actually implements (see #escalate). */
const ESCALATION_TRIGGERS = Object.freeze(['warning', 'breach']);
const ESCALATION_ACTIONS  = Object.freeze(['notify_owner', 'notify_manager', 'raise_priority', 'create_task']);
const ENTITY_TYPES        = Object.freeze(Object.keys(supportedMetrics));
const { ok } = require('../../utils/response');
const { ValidationError } = require('../../utils/errors');

const WEEKLY_9_5 = {
  mon: [['09:00', '17:00']], tue: [['09:00', '17:00']], wed: [['09:00', '17:00']],
  thu: [['09:00', '17:00']], fri: [['09:00', '17:00']],
};

/**
 * SLA routes — mounted at /api/sla.
 * Config endpoints are admin-only; the dashboard is available to every user
 * (scoped to their own timers unless they are a manager/admin).
 */
module.exports = async function slaRoutes(fastify) {
  const svc = fastify.slaService || new SlaService(fastify.prisma, fastify.log);

  const P = fastify.prisma;
  const include = { targets: true, escalations: true, business_hours: true };

  // ── Dashboard (all authenticated users) ──────────────────────────────────
  fastify.get('/dashboard', { preHandler: [authenticate] }, async (req) => {
    const level = req.user?.role_level ?? 99;
    let scope = req.query.scope || 'me';
    if (scope === 'all' && level > ADMIN_THRESHOLD) scope = 'team';
    if (scope === 'team' && level > MANAGER_THRESHOLD) scope = 'me';
    const data = await svc.getDashboard({ employeeId: req.user.employeeId, scope });
    return ok({ ...data, scope });
  });

  // Manual reconcile — handy for testing / forcing a refresh (admin).
  fastify.post('/reconcile', { preHandler: [requireAdmin] }, async () => {
    const result = await svc.reconcile();
    return ok(result);
  });

  // ── Business-hours calendars (admin) ─────────────────────────────────────
  fastify.get('/business-hours', { preHandler: [authenticate] }, async () =>
    ok(await P.slaBusinessHours.findMany({ orderBy: { name: 'asc' } })));

  fastify.post('/business-hours', { preHandler: [requireAdmin] }, async (req) => {
    const { name, timezone_label, utc_offset_minutes, weekly, holidays, is_default } = req.body || {};
    if (!name) throw new ValidationError('name is required');
    if (is_default) await P.slaBusinessHours.updateMany({ data: { is_default: false } });
    const row = await P.slaBusinessHours.create({
      data: {
        name,
        timezone_label: timezone_label || 'UTC',
        utc_offset_minutes: Number(utc_offset_minutes) || 0,
        weekly: weekly || WEEKLY_9_5,
        holidays: holidays || [],
        is_default: !!is_default,
      },
    });
    return ok(row);
  });

  fastify.put('/business-hours/:id', { preHandler: [requireAdmin] }, async (req) => {
    const id = Number(req.params.id);
    const { name, timezone_label, utc_offset_minutes, weekly, holidays, is_default, is_active } = req.body || {};
    if (is_default) await P.slaBusinessHours.updateMany({ data: { is_default: false } });
    const data = {};
    if (name !== undefined) data.name = name;
    if (timezone_label !== undefined) data.timezone_label = timezone_label;
    if (utc_offset_minutes !== undefined) data.utc_offset_minutes = Number(utc_offset_minutes);
    if (weekly !== undefined) data.weekly = weekly;
    if (holidays !== undefined) data.holidays = holidays;
    if (is_default !== undefined) data.is_default = !!is_default;
    if (is_active !== undefined) data.is_active = !!is_active;
    return ok(await P.slaBusinessHours.update({ where: { id }, data }));
  });

  fastify.delete('/business-hours/:id', { preHandler: [requireAdmin] }, async (req) => {
    await P.slaBusinessHours.delete({ where: { id: Number(req.params.id) } });
    return ok({ deleted: true });
  });

  /**
   * What this engine can actually do — entity types, the metrics each one
   * supports, condition operators, and the escalation vocabulary.
   *
   * The Builder reads this rather than hard-coding its dropdowns. It used to
   * offer both metrics for all three entities, but the reconciler only
   * evaluates the metrics an entity declares, so a resolution target on a lead
   * (or a first-response target on a task) was saved and then silently ignored
   * forever. Serving the matrix means the UI cannot drift from the engine.
   */
  fastify.get('/capabilities', { preHandler: [authenticate] }, async () => ok({
    entities: ENTITY_TYPES.map((type) => ({
      type,
      metrics: supportedMetrics[type],
      priorities: SlaService.ENTITY[type].priorityLadder,
    })),
    metric_labels:        SlaService.METRIC_LABEL,
    condition_operators:  CONDITION_OPS,
    escalation_triggers:  ESCALATION_TRIGGERS,
    escalation_actions:   ESCALATION_ACTIONS,
  }));

  // ── Policies (admin) ─────────────────────────────────────────────────────
  fastify.get('/policies', { preHandler: [authenticate] }, async () =>
    ok(await P.slaPolicy.findMany({ include, orderBy: [{ entity_type: 'asc' }, { order_index: 'asc' }] })));

  fastify.get('/policies/:id', { preHandler: [authenticate] }, async (req) =>
    ok(await P.slaPolicy.findUnique({ where: { id: Number(req.params.id) }, include })));

  fastify.post('/policies', { preHandler: [requireAdmin] }, async (req) => {
    const { name, entity_type } = req.body || {};
    if (!name) throw new ValidationError('name is required');
    if (!ENTITY_TYPES.includes(entity_type)) {
      throw new ValidationError(`entity_type must be one of: ${ENTITY_TYPES.join(' | ')}`);
    }
    assertPolicyShape(entity_type, req.body);
    const policy = await P.slaPolicy.create({ data: buildPolicyData(req.body) });
    await writeChildren(P, policy.id, req.body);
    return ok(await P.slaPolicy.findUnique({ where: { id: policy.id }, include }));
  });

  fastify.put('/policies/:id', { preHandler: [requireAdmin] }, async (req) => {
    const id = Number(req.params.id);
    const existing = await P.slaPolicy.findUnique({ where: { id }, select: { entity_type: true } });
    if (!existing) throw new ValidationError('Policy not found');
    assertPolicyShape(req.body.entity_type ?? existing.entity_type, req.body);
    await P.slaPolicy.update({ where: { id }, data: buildPolicyData(req.body, true) });
    if (req.body.targets || req.body.escalations) {
      await P.slaTarget.deleteMany({ where: { policy_id: id } });
      await P.slaEscalation.deleteMany({ where: { policy_id: id } });
      await writeChildren(P, id, req.body);
    }
    return ok(await P.slaPolicy.findUnique({ where: { id }, include }));
  });

  fastify.delete('/policies/:id', { preHandler: [requireAdmin] }, async (req) => {
    await P.slaPolicy.delete({ where: { id: Number(req.params.id) } });
    return ok({ deleted: true });
  });

  // ── Seed sensible defaults for this tenant (admin) ───────────────────────
  // The policy set itself lives in `seedSlaDefaults` so tenant provisioning can
  // install it at onboarding time without going through HTTP.
  fastify.post('/seed-defaults', { preHandler: [requireAdmin] }, async () => {
    return ok(await seedSlaDefaults(P));
  });
};

// ── helpers ─────────────────────────────────────────────────────────────────

/**
 * Reject a policy the engine could not honour.
 *
 * Every check here corresponds to something that previously saved cleanly and
 * then did nothing: a target on a metric the entity is not measured on, an
 * escalation naming an action the engine has no branch for, a condition using
 * an operator that (before the fail-closed fix) silently matched everything.
 * Telling the author at save time is the whole point — a silently inert SLA is
 * worse than no SLA, because the team believes it is covered.
 */
function assertPolicyShape(entityType, body = {}) {
  const allowed = metricsFor(entityType);
  if (!allowed.length) throw new ValidationError(`Unknown entity_type "${entityType}"`);

  for (const t of body.targets ?? []) {
    if (!allowed.includes(t.metric)) {
      throw new ValidationError(
        `A ${entityType} cannot be measured on "${t.metric}" — this engine tracks ${allowed.join(' and ')} for ${entityType}s.`,
      );
    }
    const mins = Number(t.target_minutes);
    if (!Number.isFinite(mins) || mins <= 0) {
      throw new ValidationError(`target_minutes must be a positive number of minutes (got "${t.target_minutes}")`);
    }
    if (t.warning_pct !== undefined && t.warning_pct !== null && t.warning_pct !== '') {
      const pct = Number(t.warning_pct);
      // 0 would warn at creation; 100 would warn exactly at breach. Neither is
      // an early warning, which is the only thing this field is for.
      if (!Number.isFinite(pct) || pct <= 0 || pct >= 100) {
        throw new ValidationError('warning_pct must be between 1 and 99 — it is how early to warn, as a percentage of the target');
      }
    }
  }

  for (const e of body.escalations ?? []) {
    if (!ESCALATION_TRIGGERS.includes(e.trigger)) {
      throw new ValidationError(`Escalation trigger must be one of: ${ESCALATION_TRIGGERS.join(' | ')}`);
    }
    if (!ESCALATION_ACTIONS.includes(e.action)) {
      throw new ValidationError(`Escalation action must be one of: ${ESCALATION_ACTIONS.join(' | ')}`);
    }
    // '*' means "any metric", which the engine honours.
    if (e.metric && e.metric !== '*' && !allowed.includes(e.metric)) {
      throw new ValidationError(
        `An escalation on a ${entityType} cannot target "${e.metric}" — this engine tracks ${allowed.join(' and ')} for ${entityType}s.`,
      );
    }
  }

  for (const c of body.conditions ?? []) {
    if (!c.field) throw new ValidationError('Every condition needs a field');
    if (!CONDITION_OPS.includes(c.op)) {
      throw new ValidationError(`Condition operator "${c.op}" is not supported. Use one of: ${CONDITION_OPS.join(', ')}.`);
    }
  }
}

function buildPolicyData(body, isUpdate = false) {
  const d = {};
  const f = ['name', 'description', 'entity_type'];
  for (const k of f) if (body[k] !== undefined) d[k] = body[k];
  if (body.is_active !== undefined) d.is_active = !!body.is_active;
  if (body.order_index !== undefined) d.order_index = Number(body.order_index);
  if (body.conditions !== undefined) d.conditions = body.conditions;
  if (body.pause_statuses !== undefined) d.pause_statuses = body.pause_statuses;
  if (body.business_hours_id !== undefined) d.business_hours_id = body.business_hours_id ? Number(body.business_hours_id) : null;
  if (!isUpdate && d.order_index === undefined) d.order_index = 0;
  return d;
}

async function writeChildren(P, policyId, body) {
  const targets = (body.targets || []).map((t) => ({
    policy_id: policyId, metric: t.metric, priority: t.priority || '*',
    target_minutes: Number(t.target_minutes), warning_pct: Number(t.warning_pct) || 80,
  }));
  const escs = (body.escalations || []).map((e, i) => ({
    policy_id: policyId, metric: e.metric || '*', trigger: e.trigger,
    action: e.action, config: e.config || null, order_index: e.order_index ?? i,
  }));
  if (targets.length) await P.slaTarget.createMany({ data: targets });
  if (escs.length) await P.slaEscalation.createMany({ data: escs });
}

async function createPolicy(P, businessHoursId, spec) {
  const policy = await P.slaPolicy.create({
    data: {
      name: spec.name, entity_type: spec.entity_type, order_index: spec.order_index || 0,
      business_hours_id: businessHoursId, is_active: true,
    },
  });
  await writeChildren(P, policy.id, spec);
  return policy;
}

/**
 * Install a starter SLA policy set for the tenant currently in scope.
 *
 * Idempotent: a tenant that already has any policy is left alone, so this is
 * safe to call from `POST /api/sla/seed-defaults`, from tenant provisioning,
 * and from a re-run of either.
 *
 * @param {import('@prisma/client').PrismaClient} P tenant-scoped client
 * @returns {Promise<{ created: boolean, policies: number, message?: string }>}
 */
async function seedSlaDefaults(P) {
  const existing = await P.slaPolicy.count();
  if (existing > 0) return { created: false, policies: 0, message: 'SLA policies already exist' };

  let cal = await P.slaBusinessHours.findFirst({ where: { is_default: true } });
  if (!cal) {
    cal = await P.slaBusinessHours.create({
      data: { name: 'Business Hours (Mon–Fri 9–5)', timezone_label: 'UTC', utc_offset_minutes: 0, weekly: WEEKLY_9_5, holidays: [], is_default: true },
    });
  }

  for (const spec of DEFAULT_POLICIES) await createPolicy(P, cal.id, spec);
  return { created: true, policies: DEFAULT_POLICIES.length };
}

/** The starter policies: one per entity the engine tracks out of the box. */
const DEFAULT_POLICIES = [
  {
    name: 'Standard Case SLA', entity_type: 'case', order_index: 0,
    targets: [
      { metric: 'first_response', priority: 'critical', target_minutes: 60 },
      { metric: 'first_response', priority: 'high', target_minutes: 240 },
      { metric: 'first_response', priority: '*', target_minutes: 480 },
      { metric: 'resolution', priority: 'critical', target_minutes: 480 },
      { metric: 'resolution', priority: 'high', target_minutes: 1440 },
      { metric: 'resolution', priority: '*', target_minutes: 2880 },
    ],
    escalations: [
      { metric: '*', trigger: 'warning', action: 'notify_owner' },
      { metric: '*', trigger: 'breach', action: 'notify_manager' },
      { metric: 'resolution', trigger: 'breach', action: 'raise_priority' },
    ],
  },
  {
    name: 'Speed-to-Lead', entity_type: 'lead', order_index: 0,
    targets: [
      { metric: 'first_response', priority: 'hot', target_minutes: 15 },
      { metric: 'first_response', priority: 'warm', target_minutes: 60 },
      { metric: 'first_response', priority: '*', target_minutes: 240 },
    ],
    escalations: [
      { metric: 'first_response', trigger: 'warning', action: 'notify_owner' },
      { metric: 'first_response', trigger: 'breach', action: 'notify_manager' },
    ],
  },
  {
    name: 'Task Due SLA', entity_type: 'task', order_index: 0,
    targets: [
      { metric: 'resolution', priority: 'urgent', target_minutes: 60 },
      { metric: 'resolution', priority: 'high', target_minutes: 240 },
      { metric: 'resolution', priority: '*', target_minutes: 480 },
    ],
    escalations: [
      { metric: 'resolution', trigger: 'warning', action: 'notify_owner' },
      { metric: 'resolution', trigger: 'breach', action: 'notify_manager' },
    ],
  },
];

module.exports.seedSlaDefaults = seedSlaDefaults;
module.exports.assertPolicyShape = assertPolicyShape;
module.exports.ESCALATION_ACTIONS = ESCALATION_ACTIONS;
module.exports.ESCALATION_TRIGGERS = ESCALATION_TRIGGERS;
module.exports.DEFAULT_POLICIES = DEFAULT_POLICIES;
