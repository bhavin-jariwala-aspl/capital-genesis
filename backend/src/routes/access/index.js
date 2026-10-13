'use strict';

const { authenticate, requireAdmin, ADMIN_THRESHOLD, ROLE_LEVEL } = require('../../middleware/authenticate');
const { ok, created } = require('../../utils/response');
const { AuthorizationError } = require('../../utils/errors');
const AccessScopeService = require('../../services/access-scope.service');
const SegmentationService = require('../../services/segmentation.service');
const AuditChainService = require('../../services/audit-chain.service');

/**
 * /api/access — business units, information barriers, wall-crossings and the
 * tamper-evident audit chain.
 *
 * Units are administration (admins). Barriers belong to Compliance: zone
 * membership, insider lists, crossing decisions and the audit chain are open
 * to admins and to any role holding the `barrier_override` operational
 * permission. Any user may *request* a crossing.
 */
module.exports = async function accessRoutes(fastify) {
  const scope = new AccessScopeService(fastify.prisma);
  const audit = new AuditChainService(fastify.prisma);
  const svc = new SegmentationService(fastify.prisma, scope, audit);

  async function requireCompliance(req) {
    const level = req.user?.role_level ?? ROLE_LEVEL[req.user?.role] ?? 999;
    if (level <= ADMIN_THRESHOLD) return;
    const s = await scope.forViewer(req.user);
    if (!s.override) throw new AuthorizationError('Compliance access is required');
  }

  const idSchema = { type: 'object', required: ['id'], properties: { id: { type: 'integer', minimum: 1 } } };
  const unitBody = {
    type: 'object',
    properties: {
      code: { type: 'string', maxLength: 40 }, name: { type: 'string', maxLength: 150 },
      legal_name: { type: ['string', 'null'], maxLength: 200 }, regulator: { type: ['string', 'null'], maxLength: 150 },
      licence: { type: ['string', 'null'], maxLength: 200 }, base_currency: { type: ['string', 'null'], maxLength: 3 },
      is_active: { type: 'boolean' }, config: { type: ['object', 'null'] },
    },
    additionalProperties: false,
  };
  const zoneBody = {
    type: 'object',
    properties: {
      code: { type: 'string', maxLength: 40 }, name: { type: 'string', maxLength: 150 },
      description: { type: ['string', 'null'] }, is_active: { type: 'boolean' },
    },
    additionalProperties: false,
  };

  // ── Business units ────────────────────────────────────────────────────────
  fastify.get('/business-units', { preHandler: [authenticate] }, async () => ok(await svc.listUnits()));
  fastify.post('/business-units', { preHandler: [requireAdmin], schema: { body: unitBody } }, async (req, reply) => {
    reply.code(201);
    return created(await svc.saveUnit(req.body ?? {}, req.user?.employee_id));
  });
  fastify.put('/business-units/:id', { preHandler: [requireAdmin], schema: { params: idSchema, body: unitBody } }, async (req) =>
    ok(await svc.saveUnit(req.body ?? {}, req.user?.employee_id, req.params.id)));
  fastify.put('/business-units/:id/members', {
    preHandler: [requireAdmin],
    schema: {
      params: idSchema,
      body: {
        type: 'object', required: ['employee_ids'],
        properties: { employee_ids: { type: 'array', items: { type: 'string', maxLength: 20 } }, primary_ids: { type: 'array', items: { type: 'string', maxLength: 20 } } },
        additionalProperties: false,
      },
    },
  }, async (req) => ok(await svc.setUnitMembers(req.params.id, req.body.employee_ids, req.user?.employee_id, req.body.primary_ids ?? [])));

  // ── Barrier zones (Compliance) ────────────────────────────────────────────
  // The zone list itself (codes/names) is needed by any user to request a
  // crossing; members are only returned to Compliance.
  fastify.get('/barrier-zones', { preHandler: [authenticate] }, async (req) => {
    const zones = await svc.listZones();
    let compliance = true;
    try { await requireCompliance(req); } catch { compliance = false; }
    return ok(compliance ? zones : zones.map(({ members: _m, ...z }) => z));
  });
  fastify.post('/barrier-zones', { preHandler: [authenticate, requireCompliance], schema: { body: zoneBody } }, async (req, reply) => {
    reply.code(201);
    return created(await svc.saveZone(req.body ?? {}, req.user?.employee_id));
  });
  fastify.put('/barrier-zones/:id', { preHandler: [authenticate, requireCompliance], schema: { params: idSchema, body: zoneBody } }, async (req) =>
    ok(await svc.saveZone(req.body ?? {}, req.user?.employee_id, req.params.id)));
  fastify.post('/barrier-zones/:id/members', {
    preHandler: [authenticate, requireCompliance],
    schema: { params: idSchema, body: { type: 'object', required: ['employee_id'], properties: { employee_id: { type: 'string', maxLength: 20 } }, additionalProperties: false } },
  }, async (req, reply) => {
    reply.code(201);
    return created(await svc.addZoneMember(req.params.id, req.body.employee_id, req.user?.employee_id));
  });
  fastify.delete('/barrier-zones/:id/members/:employeeId', { preHandler: [authenticate, requireCompliance] }, async (req, reply) => {
    await svc.removeZoneMember(Number(req.params.id), req.params.employeeId, req.user?.employee_id);
    reply.code(204).send();
  });
  fastify.get('/barrier-zones/:id/insiders', { preHandler: [authenticate, requireCompliance], schema: { params: idSchema } }, async (req) =>
    ok(await svc.insiders(req.params.id)));

  // ── Wall-crossings ────────────────────────────────────────────────────────
  fastify.post('/wall-crossings', {
    preHandler: [authenticate],
    schema: {
      body: {
        type: 'object', required: ['zone_id', 'reason'],
        properties: { zone_id: { type: 'integer', minimum: 1 }, employee_id: { type: 'string', maxLength: 20 }, reason: { type: 'string', minLength: 5, maxLength: 2000 } },
        additionalProperties: false,
      },
    },
  }, async (req, reply) => {
    reply.code(201);
    return created(await svc.requestCrossing(
      { zoneId: req.body.zone_id, employeeId: req.body.employee_id, reason: req.body.reason },
      req.user?.employee_id,
    ));
  });
  fastify.get('/wall-crossings', { preHandler: [authenticate, requireCompliance] }, async (req) =>
    ok(await svc.listCrossings({ status: req.query?.status })));
  fastify.post('/wall-crossings/:id/decide', {
    preHandler: [authenticate, requireCompliance],
    schema: {
      params: idSchema,
      body: { type: 'object', required: ['approve'], properties: { approve: { type: 'boolean' }, valid_days: { type: 'integer', minimum: 1, maximum: 365 } }, additionalProperties: false },
    },
  }, async (req) => ok(await svc.decideCrossing(req.params.id, { approve: req.body.approve, validDays: req.body.valid_days }, req.user?.employee_id)));

  // ── Tamper-evident audit chain (Compliance) ───────────────────────────────
  fastify.get('/audit-chain', { preHandler: [authenticate, requireCompliance] }, async (req) =>
    ok(await audit.list({ entityType: req.query?.entity_type, entityId: req.query?.entity_id, limit: req.query?.limit, offset: req.query?.offset })));
  fastify.get('/audit-chain/verify', { preHandler: [authenticate, requireCompliance] }, async () => ok(await audit.verify()));
};
