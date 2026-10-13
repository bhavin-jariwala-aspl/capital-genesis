'use strict';

const { authenticate, levelOf, MANAGER_THRESHOLD } = require('../../middleware/authenticate');
const TaskService      = require('../../services/task.service');
const { ok }          = require('../../utils/response');

module.exports = async function taskRoutes(fastify) {
  const svc = new TaskService(fastify.prisma);

  // GET /api/tasks?record_id=X&employee_id=Y&status=Z
  // Non-admins can only filter by their own employee_id or leave it unset (returns tasks for a record)
  fastify.get('/', { preHandler: [authenticate] }, async (req) => {
    const { record_id, employee_id, status } = req.query;
    const viewerId   = req.user.employee_id ?? req.user.employeeId;
    // Lower level = more authority, so "elevated" is <=, not >=. Spelled the
    // other way round this let every level-5 user ask for a colleague's tasks
    // while locking admins (level 3) out of the filter; the service-side scope
    // filter was the only thing keeping the rows honest.
    const isElevated = levelOf(req.user) <= MANAGER_THRESHOLD;
    // Prevent non-elevated users from peeking at another employee's tasks
    const effectiveEmployeeId = employee_id
      ? (isElevated ? employee_id : viewerId)
      : undefined;
    return ok(await svc.getTasks({ recordId: record_id, employeeId: effectiveEmployeeId, status }, req.user));
  });

  // GET /api/tasks/my  — tasks assigned to the current user
  fastify.get('/my', { preHandler: [authenticate] }, async (req) => {
    const viewerId = req.user.employee_id ?? req.user.employeeId;
    return ok(await svc.getTasks({ employeeId: viewerId }, req.user));
  });

  // POST /api/tasks
  fastify.post('/', { preHandler: [authenticate] }, async (req, reply) => {
    const creatorId = req.user.employee_id ?? req.user.employeeId;
    const task = await svc.createTask(creatorId, req.body ?? {}, req.user);
    return reply.code(201).send(ok(task));
  });

  // PUT /api/tasks/:id
  fastify.put('/:id', { preHandler: [authenticate] }, async (req) => {
    return ok(await svc.updateTask(req.params.id, req.body ?? {}, req.user));
  });

  // DELETE /api/tasks/:id
  fastify.delete('/:id', { preHandler: [authenticate] }, async (req, reply) => {
    await svc.deleteTask(req.params.id, req.user);
    return reply.code(204).send();
  });
};
