'use strict';

const { authenticate }    = require('../../middleware/authenticate');
const NotificationService = require('../../services/notification.service');
const RequestUtils        = require('../../utils/requestUtils');
const { ok }              = require('../../utils/response');

module.exports = async function notificationRoutes(fastify) {
  const svc = new NotificationService(fastify.prisma);

  // GET /api/notifications
  fastify.get('/', { preHandler: [authenticate] }, async (req) => {
    const { unread_only } = req.query;
    const userId = RequestUtils.getUserId(req);
    return ok(await svc.getNotifications(userId, { unreadOnly: unread_only === 'true' }));
  });

  // GET /api/notifications/count
  fastify.get('/count', { preHandler: [authenticate] }, async (req) => {
    const userId = RequestUtils.getUserId(req);
    return ok({ count: await svc.getUnreadCount(userId) });
  });

  // PATCH /api/notifications/read
  fastify.patch('/read', { preHandler: [authenticate] }, async (req) => {
    const { ids = [] } = req.body ?? {};
    const userId = RequestUtils.getUserId(req);
    await svc.markRead(ids, userId);
    return ok({ success: true });
  });

  // PATCH /api/notifications/read-all
  fastify.patch('/read-all', { preHandler: [authenticate] }, async (req) => {
    const userId = RequestUtils.getUserId(req);
    await svc.markAllRead(userId);
    return ok({ success: true });
  });
};
