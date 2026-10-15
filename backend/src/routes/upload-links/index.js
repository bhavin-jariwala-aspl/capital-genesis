'use strict';

/**
 * Document checklists and secure client upload links — `/api/upload-links`.
 *
 * Staff (signed in, on a record they can open):
 *   GET  /records/:id/checklist     what the record's checklist still needs
 *   POST /records/:id               issue a link { days?, checklist_id?, email?: { to, name?, language? } }
 *
 * Client (no sign-in; the signed token is the key, see UploadLinkService):
 *   GET  /:token                    what is requested and what has arrived
 *   POST /:token                    upload one file { filename, mime_type, data (base64), category }
 */

const { authenticate } = require('../../middleware/authenticate');
const { tenantContext } = require('../../middleware/tenant-scope');
const RecordService = require('../../services/record.service');
const AssignmentService = require('../../services/assignment.service');
const DocumentService = require('../../services/document.service');
const DocumentChecklistService = require('../../services/document-checklist.service');
const UploadLinkService = require('../../services/upload-link.service');
const { verify } = require('../../services/upload-link.service');
const EmailSendService = require('../../services/email-send.service');
const EmailTemplateService = require('../../services/email-template.service');
const { esc } = require('../../services/web-form-share.service');
const { RateLimiter, clientIp } = require('../../utils/rate-limit');
const { RateLimitedError, NotFoundError, ValidationError } = require('../../utils/errors');
const { ok } = require('../../utils/response');

/** Where links point: APP_URL, else the browser's origin, else this host. */
function appBase(req) {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/+$/, '');
  const origin = req.headers.origin;
  if (origin && /^https?:\/\/[^/\s]+$/.test(origin)) return origin;
  return `${req.headers['x-forwarded-proto'] || req.protocol || 'http'}://${req.headers['x-forwarded-host'] || req.headers.host}`;
}

const TEXT = {
  en: { subject: (ref) => `Documents for ${ref}`, hello: (n) => (n ? `Dear ${n},` : 'Hello,'), body: (ref) => `Please use the secure link below to send us the documents we still need for ${ref}. You can upload them one at a time, from your phone or computer.`, button: 'Upload documents', until: (d) => `The link works until ${d}.`, close: 'Kind regards,' },
  fr: { subject: (ref) => `Documents pour ${ref}`, hello: (n) => (n ? `Bonjour ${n},` : 'Bonjour,'), body: (ref) => `Merci d'utiliser le lien sécurisé ci-dessous pour nous envoyer les documents qui nous manquent pour ${ref}. Vous pouvez les envoyer un par un, depuis votre téléphone ou votre ordinateur.`, button: 'Envoyer les documents', until: (d) => `Le lien est valable jusqu'au ${d}.`, close: 'Cordialement,' },
};

const idParams = { type: 'object', required: ['id'], properties: { id: { type: 'integer', minimum: 1 } } };
const tokenParams = { type: 'object', required: ['token'], properties: { token: { type: 'string', maxLength: 400, pattern: '^gul1\\.[A-Za-z0-9_-]+\\.[A-Za-z0-9_-]+$' } } };

module.exports = async function uploadLinkRoutes(fastify) {
  const records = new RecordService(fastify.prisma, fastify.eventBus, null, new AssignmentService(fastify.prisma));
  const svc = () => new UploadLinkService(fastify.prisma, { documentService: new DocumentService(fastify.prisma) });
  const limiter = fastify.rateLimiter ?? new RateLimiter({ redis: fastify.redis ?? null, log: fastify.log });
  const hit = async (key, rule) => {
    const r = await limiter.hit(key, rule);
    if (r.limited) throw new RateLimitedError('Too many requests. Please try again later.', r.retryAfterSec);
  };

  // ── Staff ────────────────────────────────────────────────────────────────
  fastify.get('/records/:id/checklist', { preHandler: [authenticate], schema: { params: idParams } }, async (req) => {
    await records.getRecord(req.params.id, req.user); // 404 / 403 unless the user may open it
    return ok(await new DocumentChecklistService(fastify.prisma).forRecord(req.params.id));
  });

  fastify.post('/records/:id', {
    preHandler: [authenticate],
    schema: {
      params: idParams,
      body: {
        type: ['object', 'null'], additionalProperties: false,
        properties: {
          days: { type: 'integer', minimum: 1, maximum: 60 },
          checklist_id: { type: ['integer', 'null'], minimum: 1 },
          email: {
            type: 'object', required: ['to'], additionalProperties: false,
            properties: { to: { type: 'string', maxLength: 200 }, name: { type: ['string', 'null'], maxLength: 120 }, language: { type: 'string', enum: ['en', 'fr'] } },
          },
        },
      },
    },
  }, async (req) => {
    await records.getRecord(req.params.id, req.user);
    const b = req.body ?? {};
    const link = await svc().create(req.params.id, { tenantId: req.user.tenant_id, checklistId: b.checklist_id ?? null, days: b.days, base: appBase(req) });
    if (!b.email) return ok(link);

    const who = req.user.employeeId ?? req.user.employee_id;
    await hit(`upload-link-send:${who}`, { max: 30, windowSec: 60 * 60 });
    const to = String(b.email.to).trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) throw new ValidationError('Enter a valid email address');
    const status = await new DocumentChecklistService(fastify.prisma).forRecord(req.params.id);
    const t = TEXT[b.email.language] ?? TEXT.en;
    const tenant = await fastify.prisma.tenant.findUnique({ where: { id: req.user.tenant_id }, select: { name: true } }).catch(() => null);
    const until = new Date(link.expires_at).toISOString().slice(0, 10);
    const ref = status.record.title;
    const html = `<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.55;color:#1f2937;max-width:560px">
<p>${esc(t.hello(b.email.name))}</p><p>${esc(t.body(ref))}</p>
<p style="margin:28px 0"><a href="${esc(link.url)}" style="background:#4f46e5;color:#fff;text-decoration:none;padding:12px 22px;border-radius:10px;font-weight:600;display:inline-block">${esc(t.button)}</a></p>
<p style="font-size:13px;color:#6b7280">${esc(t.until(until))}<br><a href="${esc(link.url)}" style="color:#4f46e5;word-break:break-all">${esc(link.url)}</a></p>
<p>${esc(t.close)}<br>${esc(req.user.employeeName ?? '')}${tenant?.name ? `<br>${esc(tenant.name)}` : ''}</p></div>`;
    const log = await new EmailSendService(fastify.prisma, new EmailTemplateService(fastify.prisma)).sendRaw({
      to_email: to, subject: tenant?.name ? `${tenant.name} — ${t.subject(ref)}` : t.subject(ref), body_html: html,
      body_text: [t.hello(b.email.name), t.body(ref), link.url, t.until(until)].join('\n\n'),
      related_record_id: req.params.id, related_type: 'record', sent_by: who,
    });
    return ok({ ...link, email: { to, status: log?.status ?? 'sent' } });
  });

  // ── Client ───────────────────────────────────────────────────────────────
  const inTokenTenant = (handler) => async (req, reply) => {
    const payload = verify(req.params.token);
    if (!payload) throw new NotFoundError('This upload link is invalid or has expired');
    return tenantContext.run({ tenantId: payload.t }, () => handler(req, reply, payload));
  };

  fastify.get('/:token', { schema: { params: tokenParams } }, inTokenTenant(async (req, _reply, payload) => {
    await hit(`upload-link:${clientIp(req)}`, { max: 120, windowSec: 10 * 60 });
    return ok(await svc().describe(payload));
  }));

  fastify.post('/:token', {
    bodyLimit: 15 * 1024 * 1024, // a 10 MB file, base64-encoded
    schema: {
      params: tokenParams,
      body: {
        type: 'object', required: ['filename', 'mime_type', 'data', 'category'], additionalProperties: false,
        properties: {
          filename: { type: 'string', maxLength: 200 }, mime_type: { type: 'string', maxLength: 60 },
          data: { type: 'string', maxLength: 15 * 1024 * 1024 }, category: { type: 'string', maxLength: 100 },
        },
      },
    },
  }, inTokenTenant(async (req, reply, payload) => {
    await hit(`upload-link-post:${clientIp(req)}`, { max: 30, windowSec: 10 * 60 });
    reply.code(201);
    return ok(await svc().upload(payload, req.body));
  }));
};
