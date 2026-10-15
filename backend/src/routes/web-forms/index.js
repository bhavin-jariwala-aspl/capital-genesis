'use strict';

/**
 * Web forms — `/api/web-forms` (any signed-in staff member).
 *   GET  /                  the workspace's published forms
 *   POST /:id/link          a shareable link   { prod? }
 *   POST /:id/send          email the link     { to, name?, prod?, message?, language?, record_id? }
 */

const { authenticate } = require('../../middleware/authenticate');
const WebFormShareService = require('../../services/web-form-share.service');
const EmailTemplateService = require('../../services/email-template.service');
const EmailSendService = require('../../services/email-send.service');
const { RateLimiter } = require('../../utils/rate-limit');
const { RateLimitedError } = require('../../utils/errors');
const { ok } = require('../../utils/response');

/** Where the form links point: APP_URL, else the browser's origin, else this host. */
function appBase(req) {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/+$/, '');
  const origin = req.headers.origin;
  if (origin && /^https?:\/\/[^/\s]+$/.test(origin)) return origin;
  const proto = req.headers['x-forwarded-proto'] || req.protocol || 'http';
  return `${proto}://${req.headers['x-forwarded-host'] || req.headers.host}`;
}

const idParams = { type: 'object', required: ['id'], properties: { id: { type: 'integer', minimum: 1 } } };
const prod = { type: ['string', 'null'], maxLength: 40, pattern: '^[A-Za-z0-9_-]*$' };
const expert = { type: ['string', 'null'], maxLength: 20, pattern: '^[A-Za-z0-9_-]*$' };

module.exports = async function webFormRoutes(fastify) {
  const svc = () => new WebFormShareService(fastify.prisma, new EmailSendService(fastify.prisma, new EmailTemplateService(fastify.prisma)));
  const limiter = fastify.rateLimiter ?? new RateLimiter({ redis: fastify.redis ?? null, log: fastify.log });

  fastify.get('/', { preHandler: [authenticate] }, async () => ok(await svc().list()));

  fastify.post('/:id/link', {
    preHandler: [authenticate],
    schema: { params: idParams, body: { type: ['object', 'null'], additionalProperties: false, properties: { prod, expert } } },
  }, async (req) => ok(await svc().link(req.params.id, { base: appBase(req), prod: req.body?.prod || null, expert: req.body?.expert || null })));

  fastify.post('/:id/send', {
    preHandler: [authenticate],
    schema: {
      params: idParams,
      body: {
        type: 'object', required: ['to'], additionalProperties: false,
        properties: {
          to: { type: 'string', maxLength: 200 },
          name: { type: ['string', 'null'], maxLength: 120 },
          prod,
          expert,
          message: { type: ['string', 'null'], maxLength: 2000 },
          language: { type: 'string', enum: ['en', 'fr'] },
          record_id: { type: ['integer', 'null'], minimum: 1 },
        },
      },
    },
  }, async (req) => {
    // A user can share forms all day, but not turn the CRM into a bulk mailer.
    const who = req.user.employeeId ?? req.user.employee_id;
    const r = await limiter.hit(`webform-send:${who}`, { max: 30, windowSec: 60 * 60 });
    if (r.limited) throw new RateLimitedError('You have sent many forms in the last hour. Please try again later.', r.retryAfterSec);
    const tenant = req.user.tenant_id
      ? await fastify.prisma.tenant.findUnique({ where: { id: req.user.tenant_id }, select: { name: true } }).catch(() => null)
      : null;
    const b = req.body;
    return ok(await svc().send(req.params.id, {
      to: b.to, name: b.name || null, prod: b.prod || null, expert: b.expert || null, message: b.message || null, language: b.language ?? 'en',
      recordId: b.record_id ?? null, base: appBase(req), workspace: tenant?.name ?? null,
      sender: { id: who, name: req.user.employeeName ?? null },
    }));
  });
};
