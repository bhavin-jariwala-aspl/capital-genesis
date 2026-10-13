'use strict';

const crypto = require('crypto');
const { tenantContext, getTenantId } = require('../middleware/tenant-scope');

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

/**
 * DocumentSignatureService — native, self-contained e-signature.
 *
 * Authenticated callers create/list/cancel requests (tenant context present).
 * The PUBLIC signing surface (resolveByToken / recordView / sign / decline) is
 * hit by unauthenticated signers via an unguessable per-signatory token, so it
 * runs without tenant context: lookups are by unique token and writes stamp
 * tenant_id explicitly. When the final signer completes, a signature
 * certificate Document is generated inside the request's tenant context.
 */
class DocumentSignatureService {
  /**
   * @param {import('@prisma/client').PrismaClient} prisma
   * @param {import('./document.service')} [documentService] for certificate generation
   */
  constructor(prisma, documentService = null) {
    this.db = prisma;
    this.documents = documentService;
  }

  // ── Authenticated management ────────────────────────────────────────────────

  async createRequest(documentId, { title = null, message = null, ordered = false, expiresInDays = null, signers = [], createdBy = null } = {}) {
    const doc = await this.db.document.findFirst({ where: { id: Number(documentId), deleted_at: null } });
    if (!doc) throw Object.assign(new Error('Document not found'), { statusCode: 404 });

    const clean = (Array.isArray(signers) ? signers : [])
      .map((s, i) => ({ name: String(s.name ?? '').trim(), email: String(s.email ?? '').trim(), order_index: i }))
      .filter(s => s.name && s.email);
    if (clean.length === 0) throw Object.assign(new Error('At least one signer (name + email) is required'), { statusCode: 400 });

    const expires_at = expiresInDays != null && Number(expiresInDays) > 0
      ? new Date(Date.now() + Number(expiresInDays) * 24 * 60 * 60 * 1000)
      : null;

    // The tenant-scope extension injects tenant_id into the top-level row only;
    // nested `signatories.create` rows must carry tenant_id explicitly (their
    // tenant_id is NOT NULL). Fall back to the document's tenant.
    const tenantId = getTenantId() ?? doc.tenant_id;

    const request = await this.db.documentSignatureRequest.create({
      data: {
        document_id: doc.id,
        title, message,
        ordered: Boolean(ordered),
        expires_at,
        created_by: createdBy != null ? String(createdBy) : null,
        signatories: {
          create: clean.map(s => ({
            name: s.name,
            email: s.email,
            order_index: s.order_index,
            token: crypto.randomBytes(24).toString('base64url'),
            tenant_id: tenantId,
          })),
        },
      },
      include: { signatories: { orderBy: { order_index: 'asc' } } },
    });
    return request;
  }

  listRequests(documentId) {
    return this.db.documentSignatureRequest.findMany({
      where: { document_id: Number(documentId) },
      orderBy: { created_at: 'desc' },
      include: { signatories: { orderBy: { order_index: 'asc' } } },
    });
  }

  getRequest(id) {
    return this.db.documentSignatureRequest.findFirst({
      where: { id: Number(id) },
      include: { signatories: { orderBy: { order_index: 'asc' } } },
    });
  }

  async cancelRequest(id) {
    return this.db.documentSignatureRequest.update({
      where: { id: Number(id) },
      data: { status: 'cancelled' },
    });
  }

  // ── Public (unauthenticated) signing surface ────────────────────────────────

  /** Resolve a signatory + its request + document by public token, or null. */
  async resolveByToken(token) {
    if (!token) return null;
    const signatory = await this.db.documentSignatory.findFirst({ where: { token: String(token) } });
    if (!signatory) return null;
    const request = await this.db.documentSignatureRequest.findFirst({ where: { id: signatory.request_id } });
    if (!request) return null;
    if (['completed', 'cancelled', 'declined', 'expired'].includes(request.status)) return null;
    if (request.expires_at && request.expires_at.getTime() < Date.now()) return null;
    const document = await this.db.document.findFirst({ where: { id: request.document_id, deleted_at: null } });
    if (!document) return null;
    return { signatory, request, document };
  }

  /** Mark a signatory as having opened the request (first view only). */
  async recordView(signatory, ip) {
    if (signatory.status !== 'pending') return;
    await this.db.documentSignatory.update({
      where: { id: signatory.id },
      data: { status: 'viewed', viewed_at: new Date(), viewer_ip: ip ? String(ip).slice(0, 64) : null },
    });
  }

  /**
   * Apply a signature. Enforces signing order when the request is `ordered`.
   * Completes the request (and generates the certificate) when it is the last
   * outstanding signer.
   */
  async sign(resolved, { type = 'typed', data = '', ip = null } = {}) {
    const { signatory, request } = resolved;
    if (signatory.status === 'signed') throw Object.assign(new Error('Already signed'), { statusCode: 409 });
    if (signatory.status === 'declined') throw Object.assign(new Error('This request was declined'), { statusCode: 409 });
    if (!data) throw Object.assign(new Error('A signature is required'), { statusCode: 400 });

    if (request.ordered) {
      const earlier = await this.db.documentSignatory.findMany({
        where: { request_id: request.id, order_index: { lt: signatory.order_index } },
      });
      if (earlier.some(s => s.status !== 'signed')) {
        throw Object.assign(new Error('Waiting on an earlier signer'), { statusCode: 409 });
      }
    }

    await this.db.documentSignatory.update({
      where: { id: signatory.id },
      data: {
        status: 'signed',
        signature_type: type === 'drawn' ? 'drawn' : 'typed',
        signature_data: String(data).slice(0, 500_000),
        signed_at: new Date(),
        viewer_ip: ip ? String(ip).slice(0, 64) : signatory.viewer_ip,
      },
    });

    const remaining = await this.db.documentSignatory.count({
      where: { request_id: request.id, status: { not: 'signed' } },
    });
    if (remaining === 0) await this.#complete(request);
    return { signed: true, completed: remaining === 0 };
  }

  async decline(resolved, { reason = null, ip = null } = {}) {
    const { signatory, request } = resolved;
    await this.db.documentSignatory.update({
      where: { id: signatory.id },
      data: { status: 'declined', decline_reason: reason ? String(reason) : null, viewer_ip: ip ? String(ip).slice(0, 64) : signatory.viewer_ip },
    });
    await this.db.documentSignatureRequest.update({ where: { id: request.id }, data: { status: 'declined' } });
    return { declined: true };
  }

  // ── Completion + certificate ────────────────────────────────────────────────

  async #complete(request) {
    // Atomically claim completion so two concurrent final signers can't both
    // pass the `remaining === 0` check and each generate a certificate. Only the
    // update that actually flips a still-open request to `completed` proceeds;
    // any loser sees count 0 and returns without duplicating work.
    const claim = await this.db.documentSignatureRequest.updateMany({
      where: { id: request.id, status: { notIn: ['completed', 'cancelled', 'declined', 'expired'] } },
      data: { status: 'completed', completed_at: new Date() },
    });
    if (claim.count === 0) return;

    if (!this.documents) return;

    // Generate the signature certificate inside the request's tenant context so
    // every query in DocumentService.upload is correctly tenant-scoped even
    // though the completing HTTP request is public (no ambient tenant).
    const certificateDocId = await tenantContext.run({ tenantId: request.tenant_id }, async () => {
      const full = await this.db.documentSignatureRequest.findFirst({
        where: { id: request.id },
        include: { signatories: { orderBy: { order_index: 'asc' } }, document: true },
      });
      const html = this.#certificateHtml(full);
      const base = String(full.document?.original_filename || 'document').replace(/\.[a-z0-9]+$/i, '');
      const doc = await this.documents.upload({
        tenantId: request.tenant_id,
        buffer: Buffer.from(html, 'utf8'),
        filename: `${base}-signature-certificate.html`,
        mimeType: 'text/html',
        entityType: 'document',
        entityId: request.document_id,
        category: 'signature_certificate',
        description: `Signature certificate for "${full.document?.original_filename}"`,
      });
      return doc.id;
    });

    await this.db.documentSignatureRequest.update({
      where: { id: request.id },
      data: { certificate_doc_id: certificateDocId },
    });
  }

  #certificateHtml(request) {
    const rows = (request.signatories || []).map(s => {
      const sig = s.signature_type === 'drawn' && s.signature_data
        ? `<img src="${s.signature_data}" alt="signature" style="height:48px"/>`
        : `<span style="font-family:cursive;font-size:22px">${escapeHtml(s.signature_data || '')}</span>`;
      return `<tr>
        <td>${escapeHtml(s.name)}<br><small>${escapeHtml(s.email)}</small></td>
        <td>${sig}</td>
        <td>${escapeHtml(s.status)}</td>
        <td>${s.signed_at ? new Date(s.signed_at).toISOString() : '—'}</td>
        <td>${escapeHtml(s.viewer_ip || '—')}</td>
      </tr>`;
    }).join('');

    return `<!doctype html><html><head><meta charset="utf-8"><title>Signature Certificate</title>
<style>
 body{font-family:Arial,Helvetica,sans-serif;color:#1f2937;margin:40px}
 h1{font-size:20px} .meta{color:#6b7280;font-size:13px;margin-bottom:24px}
 table{width:100%;border-collapse:collapse;font-size:13px}
 th,td{border:1px solid #e5e7eb;padding:8px 10px;text-align:left;vertical-align:top}
 th{background:#f9fafb} .foot{margin-top:24px;color:#9ca3af;font-size:11px}
</style></head><body>
 <h1>Signature Certificate</h1>
 <div class="meta">
   <div><strong>Document:</strong> ${escapeHtml(request.document?.original_filename || '')}</div>
   ${request.title ? `<div><strong>Title:</strong> ${escapeHtml(request.title)}</div>` : ''}
   <div><strong>Completed:</strong> ${new Date().toISOString()}</div>
 </div>
 <table><thead><tr><th>Signer</th><th>Signature</th><th>Status</th><th>Signed at (UTC)</th><th>IP</th></tr></thead>
 <tbody>${rows}</tbody></table>
 <p class="foot">Generated by Genesis CRM Document Management — native e-signature. This certificate records the signing audit trail.</p>
</body></html>`;
  }
}

module.exports = DocumentSignatureService;
