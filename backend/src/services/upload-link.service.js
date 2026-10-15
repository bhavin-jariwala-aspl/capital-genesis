'use strict';

const crypto = require('crypto');
const { NotFoundError, ValidationError } = require('../utils/errors');
const DocumentChecklistService = require('./document-checklist.service');

/**
 * Secure client upload links (PRD DOC-FR-04, LOAN-FR-07, KYC-FR-07).
 *
 * A link lets a client send the documents a record still needs without
 * signing in: `/upload/<token>`. The token is signed (HMAC-SHA256, its own key)
 * over the tenant, the record, an optional checklist and an expiry, so it
 * cannot be altered or reused for another record, and it stops working when
 * it expires or the record is deleted. Nothing is stored for a link, so
 * issuing one needs no table.
 *
 *   token = "gul1." + base64url(JSON{ t, r, c?, e }) + "." + base64url(hmac)
 *
 * Files are limited to PDF, JPEG and PNG, checked by content, up to 10 MB, and
 * only into categories on the record's checklist. There is no antivirus scan
 * in this build; content checks stand in for it.
 */

const PREFIX = 'gul1';
const DEFAULT_DAYS = 14;
const MAX_DAYS = 60;
const secret = () => crypto.createHash('sha256').update(`genesis-upload|${process.env.UPLOAD_LINK_SECRET || process.env.JWT_SECRET || 'dev'}`).digest();
const b64 = (buf) => Buffer.from(buf).toString('base64url');

const MAGIC = {
  'application/pdf': (b) => b.subarray(0, 5).toString('latin1') === '%PDF-',
  'image/jpeg': (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  'image/png': (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
};

function sign(payload) {
  const body = b64(JSON.stringify(payload));
  return `${PREFIX}.${body}.${b64(crypto.createHmac('sha256', secret()).update(body).digest())}`;
}

/** The payload of a valid, unexpired token, or null. */
function verify(token) {
  const parts = String(token ?? '').split('.');
  if (parts.length !== 3 || parts[0] !== PREFIX) return null;
  const want = Buffer.from(b64(crypto.createHmac('sha256', secret()).update(parts[1]).digest()));
  const got = Buffer.from(parts[2]);
  if (want.length !== got.length || !crypto.timingSafeEqual(want, got)) return null;
  let p;
  try { p = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8')); } catch { return null; }
  if (!Number.isInteger(p?.t) || !Number.isInteger(p?.r) || !Number.isFinite(p?.e) || p.e * 1000 < Date.now()) return null;
  return p;
}

const appBase = () => (process.env.APP_URL || 'http://localhost:5173').replace(/\/+$/, '');

class UploadLinkService {
  /**
   * @param {import('@prisma/client').PrismaClient} prisma tenant-scoped client
   * @param {{ documentService?: object }} deps
   */
  constructor(prisma, { documentService = null } = {}) {
    this.db = prisma;
    this.docs = documentService;
    this.checklists = new DocumentChecklistService(prisma);
  }

  /** A signed link for a record (default 14 days, at most 60). */
  static linkFor({ tenantId, recordId, checklistId = null, days = DEFAULT_DAYS, base = null }) {
    const d = Math.min(Math.max(Number(days) || DEFAULT_DAYS, 1), MAX_DAYS);
    const e = Math.floor(Date.now() / 1000) + d * 86400;
    const token = sign({ t: Number(tenantId), r: Number(recordId), ...(checklistId ? { c: Number(checklistId) } : {}), e });
    return { url: `${(base || appBase()).replace(/\/+$/, '')}/upload/${token}`, token, expires_at: new Date(e * 1000).toISOString() };
  }

  /** Issue a link for a record the caller can see (route checks access). */
  async create(recordId, { tenantId, checklistId = null, days, base } = {}) {
    const status = await this.checklists.forRecord(recordId, { checklistId });
    if (!status.checklists.length) throw new ValidationError('This record has no document checklist');
    return { ...UploadLinkService.linkFor({ tenantId: tenantId ?? status.record.tenant_id, recordId, checklistId, days, base }), outstanding: status.outstanding };
  }

  /** What the client's upload page shows. Runs in the token's tenant. */
  async describe(payload) {
    const status = await this.checklists.forRecord(payload.r, { checklistId: payload.c ?? null });
    if (Number(status.record.tenant_id) !== Number(payload.t)) throw new NotFoundError('Link');
    const tenant = await Promise.resolve(this.db.tenant?.findUnique?.({ where: { id: payload.t }, select: { name: true } })).catch(() => null);
    return {
      tenant_id: payload.t,
      workspace: tenant?.name ?? null,
      reference: status.record.title,
      what: status.record.object_label,
      expires_at: new Date(payload.e * 1000).toISOString(),
      outstanding: status.outstanding,
      // The client sees what is needed and whether it arrived — not file names
      // uploaded by staff.
      items: status.checklists.flatMap((c) => c.items).map((i) => ({ label: i.label, category: i.category, required: i.required, received: i.received })),
    };
  }

  /** Store a client's file against the record, in a category the checklist asks for. */
  async upload(payload, { filename, mime_type, data, category }) {
    const info = await this.describe(payload);
    if (!info.items.some((i) => i.category === category)) throw new ValidationError('Choose one of the requested documents');
    if (!filename || !data) throw new ValidationError('Choose a file to upload');
    if (!MAGIC[mime_type]) throw new ValidationError('Upload a PDF, JPEG or PNG');
    const buffer = Buffer.from(String(data), 'base64');
    if (buffer.length > 10 * 1024 * 1024) throw new ValidationError('Files must be under 10 MB');
    if (!MAGIC[mime_type](buffer)) throw new ValidationError('The file content does not match its type — upload a PDF, JPEG or PNG');
    const rec = await this.db.record.findUnique({ where: { id: payload.r }, select: { object: { select: { name: true } } } });
    const doc = await this.docs.upload({
      tenantId: payload.t, buffer, filename: String(filename).slice(0, 200), mimeType: mime_type,
      entityType: rec.object.name, entityId: payload.r, category, status: 'uploaded',
      uploadedBy: null, description: 'Uploaded by the client through a secure upload link',
    });
    const after = await this.describe(payload);
    return { id: doc.id, duplicate: Boolean(doc.duplicate), outstanding: after.outstanding };
  }
}

module.exports = UploadLinkService;
module.exports.sign = sign;
module.exports.verify = verify;
module.exports.DEFAULT_DAYS = DEFAULT_DAYS;
