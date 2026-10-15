'use strict';

const https = require('https');
const { ok } = require('../../utils/response');
const { RateLimitedError, NotFoundError } = require('../../utils/errors');
const { RateLimiter, clientIp } = require('../../utils/rate-limit');
const PublicFormService = require('../../services/public-form.service');
const RecordService = require('../../services/record.service');
const AssignmentService = require('../../services/assignment.service');
const PublicFeedService = require('../../services/public-feed.service');
const WebFormShareService = require('../../services/web-form-share.service');
const { tenantContext } = require('../../middleware/tenant-scope');
const { verifyOpen, recordOpen, GIF } = require('../../services/email-tracking');

/**
 * /api/public — unauthenticated website intake.
 *
 *   GET  /forms/:key   render description of a published form
 *   POST /forms/:key   submit it → a record of the form's object
 *   GET  /feeds/:workspace/:name   read-only data feed (NAVs, FX board, PLR)
 *
 * The record goes through the full record path (validation, formulas,
 * business-unit stamping, assignment, events → workflows / SLA), so every
 * downstream behaviour is Builder configuration, not intake code.
 */

const LIMITS = {
  ip:   { max: 20,  windowSec: 10 * 60 },   // one visitor
  form: { max: 600, windowSec: 10 * 60 },   // one form, all visitors (spray guard)
};

/** reCAPTCHA v2/v3 server-side check; only used when RECAPTCHA_SECRET is set. */
function verifyRecaptcha(token) {
  const secret = process.env.RECAPTCHA_SECRET;
  if (!secret) return Promise.resolve(true);
  if (!token) return Promise.resolve(false);
  const body = new URLSearchParams({ secret, response: String(token) }).toString();
  return new Promise((resolve) => {
    const req = https.request('https://www.google.com/recaptcha/api/siteverify', {
      method: 'POST', timeout: 5000,
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(body) },
    }, (res) => {
      let raw = '';
      res.on('data', (c) => { raw += c; });
      res.on('end', () => {
        try {
          const json = JSON.parse(raw);
          resolve(Boolean(json.success) && (json.score === undefined || json.score >= 0.5));
        } catch { resolve(false); }
      });
    });
    req.on('error', () => resolve(false));
    req.on('timeout', () => { req.destroy(); resolve(false); });
    req.end(body);
  });
}

module.exports = async function publicRoutes(fastify) {
  const records = new RecordService(fastify.prisma, fastify.eventBus, null, new AssignmentService(fastify.prisma));
  const svc = new PublicFormService(fastify.prisma, records);
  const limiter = fastify.rateLimiter ?? new RateLimiter({ redis: fastify.redis ?? null, log: fastify.log });

  const keyParams = { type: 'object', required: ['key'], properties: { key: { type: 'string', pattern: '^[a-f0-9]{48}$' } } };

  async function enforce(req) {
    for (const [k, rule] of [[`pub:ip:${clientIp(req)}`, LIMITS.ip], [`pub:form:${req.params.key}`, LIMITS.form]]) {
      const r = await limiter.hit(k, rule);
      if (r.limited) throw new RateLimitedError('Too many submissions. Please try again later.', r.retryAfterSec);
    }
  }

  fastify.get('/forms/:key', {
    schema: { params: keyParams, querystring: { type: 'object', properties: { expert: { type: 'string', maxLength: 20, pattern: '^[A-Za-z0-9_-]*$' } } } },
  }, async (req) => ok(await svc.describe(req.params.key, { expert: req.query?.expert || null })));

  // Open tracking for distribution emails: a 1×1 image whose signed name says
  // which email was opened (see services/email-tracking.js). Always answers the
  // image, whatever the token, so it reveals nothing.
  fastify.get('/email-open/:file', {
    schema: { params: { type: 'object', required: ['file'], properties: { file: { type: 'string', maxLength: 400, pattern: '^geo1\\.[A-Za-z0-9_-]+\\.[A-Za-z0-9_-]+\\.gif$' } } } },
  }, async (req, reply) => {
    const p = verifyOpen(req.params.file.replace(/\.gif$/, ''));
    if (p) {
      const r = await limiter.hit(`pub:open:${clientIp(req)}`, { max: 600, windowSec: 10 * 60 });
      if (!r.limited) await tenantContext.run({ tenantId: p.t }, () => recordOpen(fastify.prisma, p)).catch(() => {});
    }
    return reply.header('Content-Type', 'image/gif').header('Cache-Control', 'no-store, max-age=0').send(GIF);
  });

  // The workspace's published forms (title, description, link) — for its website
  // and the website preview page. Only what /f/<key> shows anyway.
  fastify.get('/workspaces/:slug/forms', {
    schema: { params: { type: 'object', required: ['slug'], properties: { slug: { type: 'string', pattern: '^[a-z0-9-]{2,100}$' } } } },
  }, async (req, reply) => {
    const r = await limiter.hit(`pub:wsforms:${clientIp(req)}`, { max: 120, windowSec: 10 * 60 });
    if (r.limited) throw new RateLimitedError('Too many requests. Please try again later.', r.retryAfterSec);
    const tenant = await fastify.prisma.tenant.findUnique({ where: { slug: req.params.slug }, select: { id: true, name: true, status: true } });
    if (!tenant || tenant.status !== 'active') throw new NotFoundError('Workspace');
    const forms = await tenantContext.run({ tenantId: tenant.id }, () => new WebFormShareService(fastify.prisma).list());
    reply.header('Cache-Control', 'public, max-age=300');
    return ok({
      workspace: tenant.name, tenant_id: tenant.id,
      forms: forms.map((f) => ({ title: f.title, description: f.description, path: f.path, channel: f.channel, products: f.products })),
    });
  });

  // Website data feeds (PRD I-02): public, cacheable, any origin may read them.
  const feeds = new PublicFeedService(fastify.prisma);
  fastify.get('/feeds/:slug/:name', {
    schema: { params: { type: 'object', required: ['slug', 'name'], properties: { slug: { type: 'string', pattern: '^[a-z0-9-]{2,100}$' }, name: { type: 'string', pattern: '^[a-z0-9][a-z0-9-]{0,59}$' } } } },
  }, async (req, reply) => {
    const r = await limiter.hit(`pub:feed:${clientIp(req)}`, { max: 300, windowSec: 10 * 60 });
    if (r.limited) throw new RateLimitedError('Too many requests. Please try again later.', r.retryAfterSec);
    const data = await feeds.feed(req.params.slug, req.params.name);
    reply.header('Cache-Control', 'public, max-age=300').header('Access-Control-Allow-Origin', '*');
    return ok(data);
  });

  fastify.post('/forms/:key', {
    preHandler: [enforce],
    bodyLimit: 64 * 1024,
    schema: {
      params: keyParams,
      body: {
        type: 'object',
        required: ['data'],
        properties: {
          data: { type: 'object', maxProperties: 100 },
          utm: { type: 'object', maxProperties: 10, additionalProperties: { type: 'string', maxLength: 300 } },
          page_url: { type: 'string', maxLength: 1000 },
          referrer: { type: 'string', maxLength: 1000 },
          language: { type: 'string', maxLength: 10 },
          captcha_token: { type: 'string', maxLength: 4000 },
          _hp: { type: 'string', maxLength: 200 },
          expert: { type: 'string', maxLength: 20, pattern: '^[A-Za-z0-9_-]*$' },
        },
        additionalProperties: false,
      },
    },
  }, async (req, reply) => {
    reply.code(201);
    return ok(await svc.submit(req.params.key, req.body, { verifyCaptcha: verifyRecaptcha }));
  });
};
