'use strict';

const { authenticate } = require('../../middleware/authenticate');
const ReminderService  = require('../../services/reminder.service');
const { ok }           = require('../../utils/response');

module.exports = async function reminderRoutes(fastify) {
  const svc = new ReminderService(fastify.prisma, fastify.eventBus);

  // GET /api/reminders?record_id=X&status=Y&scope=open
  fastify.get('/', { preHandler: [authenticate] }, async (req) => {
    const { record_id, status, scope } = req.query;
    return ok(await svc.list({ recordId: record_id, status, scope }, req.user));
  });

  // GET /api/reminders/my?scope=open  — reminders targeting the current user (agenda feed)
  fastify.get('/my', { preHandler: [authenticate] }, async (req) => {
    const viewerId = req.user.employee_id ?? req.user.employeeId;
    return ok(await svc.listMine(viewerId, { scope: req.query.scope ?? 'open' }));
  });

  // POST /api/reminders
  fastify.post('/', { preHandler: [authenticate] }, async (req, reply) => {
    const creatorId = req.user.employee_id ?? req.user.employeeId;
    const reminder = await svc.create(creatorId, req.body ?? {}, req.user);
    return reply.code(201).send(ok(reminder));
  });

  // PUT /api/reminders/:id
  fastify.put('/:id', { preHandler: [authenticate] }, async (req) => {
    return ok(await svc.update(req.params.id, req.body ?? {}, req.user));
  });

  // POST /api/reminders/:id/snooze  { minutes } or { remind_at }
  fastify.post('/:id/snooze', { preHandler: [authenticate] }, async (req) => {
    return ok(await svc.snooze(req.params.id, req.body ?? {}, req.user));
  });

  // POST /api/reminders/:id/complete
  fastify.post('/:id/complete', { preHandler: [authenticate] }, async (req) => {
    return ok(await svc.complete(req.params.id, req.user));
  });

  // POST /api/reminders/:id/dismiss
  fastify.post('/:id/dismiss', { preHandler: [authenticate] }, async (req) => {
    return ok(await svc.dismiss(req.params.id, req.user));
  });

  // DELETE /api/reminders/:id
  fastify.delete('/:id', { preHandler: [authenticate] }, async (req, reply) => {
    await svc.remove(req.params.id, req.user);
    return reply.code(204).send();
  });
};
