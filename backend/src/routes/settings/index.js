'use strict';

const { authenticate, requireAdmin } = require('../../middleware/authenticate');
const { ok } = require('../../utils/response');
const { RateLimiter, clientIp } = require('../../utils/rate-limit');
const SettingsService = require('../../services/settings.service');
const BrandingService = require('../../services/branding.service');

/** Public branding endpoints: generous, but not unbounded. */
const PUBLIC_LIMIT = { max: 120, windowSec: 60 };

/**
 * Application settings routes — mounted at /api/settings.
 *
 * GET  /            → schema + effective values (any authenticated user; the
 *                     app needs localization/branding to render for everyone).
 * PUT  /            → update settings (admin only).
 * GET  /effective   → flat effective values, for programmatic consumers.
 *
 * Branding (see services/branding.service.js):
 * POST   /branding/assets            → upload a logo / icon / favicon / artwork (admin)
 * DELETE /branding/assets/:kind      → remove one (admin)
 * GET    /branding/public/:tenantId  → the tenant's appearance for the sign-in page (public)
 * GET    /branding/:tenantId/:file   → the stored asset bytes (public, immutable)
 */
module.exports = async function settingsRoutes(fastify) {
  const svc = () => new SettingsService(fastify.prisma);
  const branding = () => new BrandingService(fastify.prisma);
  const tenantId = (req) => req.user?.tenant_id;
  const actorId  = (req) => req.user?.employee_id ?? req.user?.sub ?? 'SYSTEM';
  const limiter = fastify.rateLimiter ?? new RateLimiter({ redis: fastify.redis ?? null, log: fastify.log });
  const throttle = async (req, reply) => {
    const r = await limiter.hit(`branding:ip:${clientIp(req)}`, PUBLIC_LIMIT);
    if (r.limited) return reply.code(429).header('Retry-After', String(r.retryAfterSec)).send({ success: false, error: { message: 'Too many requests' } });
    return undefined;
  };

  fastify.get('/', { preHandler: [authenticate] }, async (req) => {
    return ok(await svc().getSettings(tenantId(req)));
  });

  fastify.get('/effective', { preHandler: [authenticate] }, async (req) => {
    return ok(await svc().getEffective(tenantId(req)));
  });

  fastify.put('/', { preHandler: [authenticate, requireAdmin] }, async (req) => {
    const patch = req.body?.values ?? req.body ?? {};
    return ok(await svc().updateSettings(tenantId(req), actorId(req), patch));
  });

  // ── Branding assets ────────────────────────────────────────────────────────

  fastify.post('/branding/assets', { preHandler: [authenticate, requireAdmin] }, async (req) => {
    const { kind, mime_type, mimeType, data, filename } = req.body ?? {};
    return ok(await branding().uploadAsset(tenantId(req), actorId(req), {
      kind, mimeType: mime_type ?? mimeType, data, filename,
    }));
  });

  fastify.delete('/branding/assets/:kind', { preHandler: [authenticate, requireAdmin] }, async (req) => {
    return ok(await branding().removeAsset(tenantId(req), actorId(req), req.params.kind));
  });

  fastify.get('/branding/public/:tenantId', async (req, reply) => {
    const limited = await throttle(req, reply);
    if (limited !== undefined) return limited;
    reply.header('Cache-Control', 'public, max-age=60');
    return ok(await branding().publicBranding(req.params.tenantId));
  });

  fastify.get('/branding/:tenantId/:file', async (req, reply) => {
    const limited = await throttle(req, reply);
    if (limited !== undefined) return limited;
    const { stream, mimeType } = await branding().openAsset(req.params.tenantId, req.params.file);
    return reply
      .header('Content-Type', mimeType)
      .header('Cache-Control', 'public, max-age=31536000, immutable')
      .header('X-Content-Type-Options', 'nosniff')
      .send(stream);
  });
};
