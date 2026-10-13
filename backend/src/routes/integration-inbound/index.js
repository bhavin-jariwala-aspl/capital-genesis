'use strict';

const crypto = require('node:crypto');
const IntegrationService = require('../../services/integration.service');
const { logger } = require('../../services/logging.service');
const { ok }     = require('../../utils/response');

/**
 * Inbound webhook routes — public (no JWT) endpoints that let external systems
 * push data into Genesis CRM.
 *
 * POST /api/integrations/inbound/:name
 *   Routes inbound payloads to the named `inbound_webhook` integration.
 *   HMAC-SHA256 signature (X-Signature-256) is verified when the integration
 *   has `config.secret` set.
 *
 * Hardening (all fail-open if Redis is unavailable, except the body cap):
 *   - Per-request body cap (rejects >1 MB before buffering the whole payload).
 *   - Redis sliding-window rate limit per (integration, client IP).
 *   - Idempotency / replay defence: a request fingerprint (the signature, or a
 *     hash of the raw body, or a caller-supplied Idempotency-Key) is recorded in
 *     Redis with a TTL; a repeat within the window is acknowledged (200) but not
 *     re-processed — so a replayed capture or a sender retry can't duplicate
 *     side effects.
 */
const MAX_INBOUND_BYTES = 1_000_000;   // 1 MB
const RATE_LIMIT_MAX     = 120;        // requests
const RATE_LIMIT_WINDOW  = 60;         // seconds
const IDEMPOTENCY_TTL    = 24 * 3600;  // seconds

module.exports = async function integrationInboundRoutes(fastify) {
  const integSvc = fastify.integrationService ?? new IntegrationService(fastify.prisma);
  const redis    = fastify.redis ?? null;

  /**
   * Capture the exact raw body bytes BEFORE the JSON parser runs (so HMAC works
   * regardless of the sender's serialisation), while enforcing a hard size cap
   * so an unauthenticated caller can't force unbounded in-memory buffering.
   */
  fastify.addHook('preParsing', async (req, _reply, payload) => {
    // Fast reject when the sender declares an oversize Content-Length.
    const declared = Number(req.headers['content-length'] ?? 0);
    if (declared && declared > MAX_INBOUND_BYTES) {
      const e = new Error('Payload too large'); e.statusCode = 413; throw e;
    }
    const chunks = [];
    let size = 0;
    for await (const chunk of payload) {
      const buf = typeof chunk === 'string' ? Buffer.from(chunk) : chunk;
      size += buf.length;
      if (size > MAX_INBOUND_BYTES) {
        const e = new Error('Payload too large'); e.statusCode = 413; throw e;
      }
      chunks.push(buf);
    }
    const raw = Buffer.concat(chunks);
    req.rawBody = raw.toString('utf-8');

    const { Readable } = require('node:stream');
    const repacked = new Readable({ read() {} });
    repacked.push(raw);
    repacked.push(null);
    return repacked;
  });

  // ── Rate limit: sliding-ish fixed window per (integration name, client IP) ──
  const rateLimited = async (name, ip) => {
    if (!redis) return false; // fail-open when Redis is down
    try {
      const key = `wh:rl:${name}:${ip}`;
      const n   = await redis.incr(key);
      if (n === 1) await redis.expire(key, RATE_LIMIT_WINDOW);
      return n > RATE_LIMIT_MAX;
    } catch (err) {
      logger?.warn?.('[inbound-webhook] rate-limit check failed (fail-open)', { error: err.message });
      return false;
    }
  };

  // ── Idempotency: record the fingerprint; return true if it's a replay/dup ──
  const isDuplicate = async (name, fingerprint) => {
    if (!redis || !fingerprint) return false;
    try {
      // SET key 1 NX EX ttl → null when the key already exists (duplicate).
      const set = await redis.set(`wh:idem:${name}:${fingerprint}`, '1', 'EX', IDEMPOTENCY_TTL, 'NX');
      return set === null;
    } catch (err) {
      logger?.warn?.('[inbound-webhook] idempotency check failed (fail-open)', { error: err.message });
      return false;
    }
  };

  /**
   * POST /api/integrations/inbound/:name — receive an inbound webhook.
   * 200 ok · 200 { duplicate } on replay · 401 bad signature · 413 too large ·
   * 429 rate limited · 400 other errors.
   */
  fastify.post('/inbound/:name', { bodyLimit: MAX_INBOUND_BYTES }, async (req, reply) => {
    const { name }  = req.params;
    const rawBody   = req.rawBody ?? JSON.stringify(req.body ?? {});
    const signature = req.headers['x-signature-256'] ?? null;
    const ip        = req.ip;

    // 1. Rate limit
    if (await rateLimited(name, ip)) {
      return reply.code(429).send({ success: false, error: { message: 'Rate limit exceeded' } });
    }

    // 2. Idempotency / replay defence — prefer a caller-supplied key, else the
    //    signature, else a hash of the raw body.
    const idemHeader  = req.headers['idempotency-key'] ?? req.headers['x-idempotency-key'] ?? null;
    const fingerprint = idemHeader
      ? crypto.createHash('sha256').update(String(idemHeader)).digest('hex')
      : signature
        ? crypto.createHash('sha256').update(String(signature)).digest('hex')
        : crypto.createHash('sha256').update(rawBody).digest('hex');
    if (await isDuplicate(name, fingerprint)) {
      return reply.code(200).send(ok({ duplicate: true, status: 'ignored' }));
    }

    // 3. Verify + process
    try {
      const log = await integSvc.receiveInbound(name, req.body ?? {}, { rawBody, signature });
      return reply.code(200).send(ok({ log_id: log.id, status: log.status }));
    } catch (err) {
      const isSignatureError = /signature/i.test(err.message ?? '');
      return reply
        .code(isSignatureError ? 401 : 400)
        .send({ success: false, error: { message: err.message } });
    }
  });
};
