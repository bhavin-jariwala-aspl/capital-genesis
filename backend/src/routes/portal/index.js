'use strict';

/**
 * Client & introducer portal API — `/api/portal` (PRD M23, M19).
 *
 * A separate realm from staff: sign-in is a one-time code to the email on the
 * client's (or introducer's) record, the token is a portal token the staff
 * middleware never accepts, and every handler runs inside the token's tenant.
 * What is exposed comes from `config.portal` on Builder objects.
 */

const PortalService = require('../../services/portal.service');
const RecordService = require('../../services/record.service');
const AssignmentService = require('../../services/assignment.service');
const DocumentService = require('../../services/document.service');
const EmailSendService = require('../../services/email-send.service');
const EmailTemplateService = require('../../services/email-template.service');
const NotificationService = require('../../services/notification.service');
const CurrencyService = require('../../services/currency.service');
const { tenantContext } = require('../../middleware/tenant-scope');
const { RateLimiter } = require('../../utils/rate-limit');
const { RateLimitedError, AuthenticationError } = require('../../utils/errors');
const { ok, created } = require('../../utils/response');

const LIMITS = {
  request: { max: 5, windowSec: 15 * 60 },   // codes per email
  ip:      { max: 30, windowSec: 15 * 60 },  // sign-in attempts per IP
};

module.exports = async function portalRoutes(fastify) {
  const records = new RecordService(fastify.prisma, fastify.eventBus, null, new AssignmentService(fastify.prisma));
  const svc = new PortalService(fastify.prisma, {
    recordService: records,
    emailSender: new EmailSendService(fastify.prisma, new EmailTemplateService(fastify.prisma)),
    redis: fastify.redis ?? null,
    documentService: new DocumentService(fastify.prisma),
    notificationService: new NotificationService(fastify.prisma),
  });
  const limiter = fastify.rateLimiter ?? new RateLimiter({ redis: fastify.redis ?? null, log: fastify.log });

  const slugParams = { type: 'object', required: ['slug'], properties: { slug: { type: 'string', pattern: '^[a-z0-9-]{2,100}$' } } };
  const realm = { type: 'string', enum: ['client', 'introducer'] };
  const email = { type: 'string', format: 'email', maxLength: 200 };
  const objectParam = { type: 'string', pattern: '^[a-z_][a-z0-9_]{1,99}$' };

  async function hit(key, rule) {
    const r = await limiter.hit(key, rule);
    if (r.limited) throw new RateLimitedError('Too many attempts. Please try again later.', r.retryAfterSec);
  }

  /** Verify the portal token and run the handler inside its tenant. */
  const session = (handler) => async (req, reply) => {
    const token = String(req.headers.authorization ?? '').replace(/^Bearer\s+/i, '');
    const s = PortalService.verifyToken(token);
    if (!s) throw new AuthenticationError('Please sign in to the portal');
    return tenantContext.run({ tenantId: s.tenant_id }, () => handler(req, reply, s));
  };
  /** Public portal calls resolve the workspace from the URL slug. */
  const workspace = (handler) => async (req, reply) => {
    const tenant = await svc.tenantBySlug(req.params.slug);
    return tenantContext.run({ tenantId: tenant.id }, () => handler(req, reply, tenant));
  };

  // ── Public ────────────────────────────────────────────────────────────────
  fastify.get('/:slug', { schema: { params: slugParams } }, async (req) => {
    const t = await svc.tenantBySlug(req.params.slug);
    // The workspace's display currency, so portal amounts are not shown in the USD default.
    const cur = await tenantContext.run({ tenantId: t.id }, () => new CurrencyService(fastify.prisma).getProfile(t.id));
    return ok({
      tenant_id: t.id, name: t.name, slug: t.slug, logo_url: t.logo_url, primary_color: t.primary_color,
      currency: cur.code, locale: cur.locale, number_format: cur.numberFormat,
    });
  });

  fastify.post('/:slug/login/request', {
    schema: { params: slugParams, body: { type: 'object', required: ['realm', 'email'], properties: { realm, email }, additionalProperties: false } },
  }, workspace(async (req, _reply, tenant) => {
    await hit(`portal:ip:${req.ip}`, LIMITS.ip);
    await hit(`portal:req:${tenant.id}:${String(req.body.email).toLowerCase()}`, LIMITS.request);
    return ok(await svc.requestCode(tenant, req.body.realm, req.body.email));
  }));

  fastify.post('/:slug/login/verify', {
    schema: { params: slugParams, body: { type: 'object', required: ['realm', 'email', 'code'], properties: { realm, email, code: { type: 'string', pattern: '^[0-9]{6}$' } }, additionalProperties: false } },
  }, workspace(async (req, _reply, tenant) => {
    await hit(`portal:ip:${req.ip}`, LIMITS.ip);
    return ok(await svc.verifyCode(tenant, req.body.realm, req.body.email, req.body.code));
  }));

  // ── Signed in ─────────────────────────────────────────────────────────────
  fastify.get('/me', session(async (_req, _reply, s) => ok(await svc.me(s))));
  fastify.get('/views', session(async (_req, _reply, s) => ok(await svc.views(s.realm_kind))));

  fastify.get('/records/:object', { schema: { params: { type: 'object', properties: { object: objectParam } } } },
    session(async (req, _reply, s) => ok(await svc.list(s, req.params.object))));

  fastify.get('/records/:object/options/:field', { schema: { params: { type: 'object', properties: { object: objectParam, field: objectParam } } } },
    session(async (req, _reply, s) => ok(await svc.lookupOptions(s, req.params.object, req.params.field))));

  fastify.post('/records/:object', {
    schema: { params: { type: 'object', properties: { object: objectParam } }, body: { type: 'object', maxProperties: 30, additionalProperties: { type: ['string', 'number', 'boolean', 'null'], maxLength: 5000 } } },
  }, session(async (req, reply, s) => { reply.code(201); return created(await svc.create(s, req.params.object, req.body)); }));

  fastify.post('/records/:object/:id/actions/:action', {
    schema: {
      params: { type: 'object', properties: { object: objectParam, id: { type: 'integer', minimum: 1 }, action: objectParam } },
      body: { type: 'object', maxProperties: 30, additionalProperties: { type: ['string', 'number', 'boolean', 'null'], maxLength: 5000 } },
    },
  }, session(async (req, reply, s) => { reply.code(201); return created(await svc.act(s, req.params.object, req.params.id, req.params.action, req.body)); }));

  fastify.get('/documents', session(async (_req, _reply, s) => ok(await svc.documents(s))));

  fastify.get('/documents/:id/download', { schema: { params: { type: 'object', properties: { id: { type: 'integer', minimum: 1 } } } } },
    session(async (req, reply, s) => {
      const { stream, mimeType, filename } = await svc.openDocument(s, req.params.id);
      return reply.header('Content-Type', mimeType).header('Content-Disposition', `attachment; filename="${String(filename).replace(/[^\w.\- ]/g, '_')}"`).send(stream);
    }));

  fastify.post('/records/:id/documents', {
    bodyLimit: 15 * 1024 * 1024,
    schema: {
      params: { type: 'object', properties: { id: { type: 'integer', minimum: 1 } } },
      body: { type: 'object', required: ['filename', 'mime_type', 'data'], properties: { filename: { type: 'string', maxLength: 200 }, mime_type: { type: 'string', maxLength: 100 }, data: { type: 'string' }, category: { type: ['string', 'null'], maxLength: 100 } }, additionalProperties: false },
    },
  }, session(async (req, reply, s) => { reply.code(201); return created(await svc.upload(s, req.params.id, req.body)); }));

  fastify.get('/messages', session(async (_req, _reply, s) => ok(await svc.messages(s))));
  fastify.post('/messages', {
    schema: { body: { type: 'object', required: ['message'], properties: { message: { type: 'string', minLength: 2, maxLength: 5000 } }, additionalProperties: false } },
  }, session(async (req, reply, s) => { reply.code(201); return created(await svc.message(s, req.body.message)); }));
};
