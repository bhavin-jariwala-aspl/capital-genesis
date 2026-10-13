'use strict';

const { authenticate } = require('../../middleware/authenticate');
const ActivityService  = require('../../services/activity.service');
const { ok }           = require('../../utils/response');
const { ValidationError } = require('../../utils/errors');

module.exports = async function activityRoutes(fastify) {
  const svc = new ActivityService(fastify.prisma);

  // GET /api/activities?record_id=X
  fastify.get('/', { preHandler: [authenticate] }, async (req) => {
    const { record_id } = req.query;
    if (!record_id) throw new ValidationError('record_id required');
    return ok(await svc.getActivities(record_id, req.user));
  });

  // POST /api/activities
  fastify.post('/', { preHandler: [authenticate] }, async (req, reply) => {
    const { record_id, ...data } = req.body ?? {};
    if (!record_id) return reply.code(400).send({ error: 'record_id required' });
    const actorId = req.user.employee_id ?? req.user.employeeId;
    const activity = await svc.createActivity(record_id, actorId, data, req.user);
    return reply.code(201).send(ok(activity));
  });

  // PUT /api/activities/:id
  fastify.put('/:id', { preHandler: [authenticate] }, async (req) => {
    return ok(await svc.updateActivity(req.params.id, req.body ?? {}, req.user));
  });

  // DELETE /api/activities/:id
  fastify.delete('/:id', { preHandler: [authenticate] }, async (req, reply) => {
    await svc.deleteActivity(req.params.id, req.user);
    return reply.code(204).send();
  });
};
