'use strict';

const https = require('https');
const { ok } = require('../../utils/response');
const { RateLimitedError } = require('../../utils/errors');
const { RateLimiter, clientIp } = require('../../utils/rate-limit');
const PublicFormService = require('../../services/public-form.service');
const RecordService = require('../../services/record.service');
const AssignmentService = require('../../services/assignment.service');

/**
 * /api/public — unauthenticated website intake.
 *
 *   GET  /forms/:key   render description of a published form
 *   POST /forms/:key   submit it → a record of the form's object
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

  fastify.get('/forms/:key', { schema: { params: keyParams } }, async (req) => ok(await svc.describe(req.params.key)));

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
        },
        additionalProperties: false,
      },
    },
  }, async (req, reply) => {
    reply.code(201);
    return ok(await svc.submit(req.params.key, req.body, { verifyCaptcha: verifyRecaptcha }));
  });
};
