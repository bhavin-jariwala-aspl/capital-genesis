'use strict';

/**
 * Calendar feed — `/api/calendar` (PRD RM-FR-03).
 *   GET /subscription        signed-in user's private feed URL
 *   GET /feed/:token.ics     the iCalendar feed (no sign-in; the token is the key)
 */

const { authenticate } = require('../../middleware/authenticate');
const CalendarFeedService = require('../../services/calendar-feed.service');
const { parseToken } = require('../../services/calendar-feed.service');
const { tenantContext } = require('../../middleware/tenant-scope');
const { RateLimiter } = require('../../utils/rate-limit');
const { RateLimitedError, NotFoundError } = require('../../utils/errors');
const { ok } = require('../../utils/response');

module.exports = async function calendarRoutes(fastify) {
  const svc = new CalendarFeedService(fastify.prisma);
  const limiter = fastify.rateLimiter ?? new RateLimiter({ redis: fastify.redis ?? null, log: fastify.log });

  fastify.get('/subscription', { preHandler: [authenticate] }, async (req) => {
    const sub = await svc.subscription(req.user.employee_id ?? req.user.employeeId);
    if (!sub) throw new NotFoundError('Employee not found');
    return ok(sub);
  });

  fastify.get('/feed/:file', {
    schema: { params: { type: 'object', required: ['file'], properties: { file: { type: 'string', maxLength: 120, pattern: '^gcal1\\.[A-Za-z0-9_.-]+\\.ics$' } } } },
  }, async (req, reply) => {
    const r = await limiter.hit(`calendar:${req.ip}`, { max: 120, windowSec: 60 * 60 });
    if (r.limited) throw new RateLimitedError('Too many requests', r.retryAfterSec);
    const parsed = parseToken(req.params.file.replace(/\.ics$/, ''));
    // One answer for every failure, so the URL reveals nothing about which part was wrong.
    if (!parsed) throw new NotFoundError('Calendar not found');
    const body = await tenantContext.run({ tenantId: parsed.tenantId }, async () => {
      const emp = await svc.resolve(parsed);
      return emp ? svc.ics(emp) : null;
    });
    if (!body) throw new NotFoundError('Calendar not found');
    return reply
      .header('Content-Type', 'text/calendar; charset=utf-8')
      .header('Cache-Control', 'private, max-age=300')
      .header('Content-Disposition', 'inline; filename="genesis-crm.ics"')
      .send(body);
  });
};
