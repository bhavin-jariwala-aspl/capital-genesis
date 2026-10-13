'use strict';

const { authenticate } = require('../../middleware/authenticate');
const { ok, created }  = require('../../utils/response');
const DocumentService  = require('../../services/document.service');
const DocumentFolderService = require('../../services/document-folder.service');
const DocumentShareService = require('../../services/document-share.service');
const DocumentTemplateService = require('../../services/document-template.service');
const DocumentSignatureService = require('../../services/document-signature.service');
const preview          = require('../../services/document-preview');
const { getTenantId }  = require('../../middleware/tenant-scope');
const RecordService    = require('../../services/record.service');

const ALLOWED_MIME = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/plain', 'text/csv',
  'image/jpeg', 'image/png', 'image/gif', 'image/webp',
]);

// Content-Disposition builder + preview streaming/gating helpers live in
// document-preview.js.
const { contentDisposition, previewEnabled, sendPreview } = preview;

/** Parse an id-like value to a positive integer, or null if it isn't one. */
function toId(v) {
  if (v === undefined || v === null || v === '') return null;
  const n = Number(v);
  return Number.isInteger(n) ? n : NaN;
}

/**
 * Shape a unified Document row for the generic /api/documents contract.
 * Keeps the legacy field names (`filename`, `related_to_*`) the frontend reads.
 */
function toApiDoc(doc) {
  if (!doc) return doc;
  // Never expose the extracted full-text body (can be ~200 KB/doc) over the API;
  // it exists only to power server-side full-text search.
  const { content_text, ...rest } = doc; // eslint-disable-line no-unused-vars
  return {
    ...rest,
    filename:        rest.original_filename,
    related_to_id:   rest.entity_id,
    related_to_type: rest.entity_type,
  };
}

/**
 * Document routes — file upload, download, list, delete.
 * Mounted at /api/documents. All storage/DB work goes through DocumentService.
 */
module.exports = async function documentRoutes(fastify) {
  const svc = (req) => new DocumentService(fastify.prisma);
  const folderSvc = new DocumentFolderService(fastify.prisma);
  const shareSvc = new DocumentShareService(fastify.prisma);
  const sigSvc = new DocumentSignatureService(fastify.prisma, new DocumentService(fastify.prisma));
  const recSvc = new RecordService(fastify.prisma);

  // ── Record-inherited access ────────────────────────────────────────────────
  // A document attached to a record is exactly as visible as that record —
  // owner/hierarchy scope, business unit and information barrier included —
  // so a deal document behind a barrier cannot be read by guessing its id.
  // Standalone DMS documents (no owning record) keep tenant-wide visibility.
  async function assertRecordAccess(req, recordId) {
    if (recordId == null) return;
    const exists = await fastify.prisma.record.findUnique({ where: { id: Number(recordId) }, select: { id: true } });
    if (!exists) return; // owner is not a runtime record (legacy entity id)
    await recSvc.getRecord(recordId, req.user); // 404s when the viewer may not see it
  }
  const docGuard = async (req) => {
    const doc = await svc(req).get(req.params.id);
    if (doc?.entity_id) await assertRecordAccess(req, doc.entity_id);
  };
  /** A record's merge context: its values, lookup titles and a few basics. */
  function recordMergeContext(rec) {
    const labels = Object.fromEntries(Object.entries(rec.labels ?? {}).map(([k, v]) => [`${k}_label`, v]));
    return { ...rec.data, ...labels, record_id: rec.id, stage: rec.pipeline_stage?.label ?? null, today: new Date().toISOString().slice(0, 10) };
  }

  /** Drop documents whose owning record the viewer cannot see. */
  async function visibleDocs(req, documents) {
    const ids = [...new Set(documents.map((d) => d.entity_id).filter((v) => v != null).map(Number))];
    if (!ids.length) return documents;
    const access = await recSvc.accessWhere(req.user);
    const [records, visible] = await Promise.all([
      fastify.prisma.record.findMany({ where: { id: { in: ids } }, select: { id: true } }),
      fastify.prisma.record.findMany({ where: { id: { in: ids }, ...access }, select: { id: true } }),
    ]);
    const isRecord = new Set(records.map((r) => r.id));
    const ok_ = new Set(visible.map((r) => r.id));
    return documents.filter((d) => d.entity_id == null || !isRecord.has(Number(d.entity_id)) || ok_.has(Number(d.entity_id)));
  }

  // ── Upload ─────────────────────────────────────────────────────────────────
  // POST /api/documents/upload
  // Body (JSON): { filename, mime_type, data (base64), category?, description?,
  //               related_record_id?, related_type? }
  fastify.post('/upload', { preHandler: [authenticate] }, async (req, reply) => {
    const {
      filename, mime_type, data,
      category, description, folder_id,
      related_record_id, related_type,
    } = req.body ?? {};

    if (!filename || !data) {
      return reply.code(400).send({ error: 'filename and data (base64) are required' });
    }
    const mimeType = mime_type || 'application/octet-stream';
    if (!ALLOWED_MIME.has(mimeType)) {
      return reply.code(400).send({ error: `File type ${mimeType} is not allowed` });
    }

    let buffer;
    try { buffer = Buffer.from(data, 'base64'); }
    catch { return reply.code(400).send({ error: 'Invalid base64 data' }); }

    const uploadedBy = req.user?.employee_id ?? req.user?.employeeId;

    const entityId = toId(related_record_id);
    const folderId = toId(folder_id);
    if (Number.isNaN(entityId) || Number.isNaN(folderId)) {
      return reply.code(400).send({ error: 'related_record_id and folder_id must be integers' });
    }

    await assertRecordAccess(req, entityId);
    const doc = await svc(req).upload({
      tenantId:    getTenantId(),
      buffer,
      filename,
      mimeType,
      entityType:  related_type || null,
      entityId,
      category:    category || null,
      folderId,
      description: description || null,
      uploadedBy,
    });

    // Audit-trail entry on the parent record's timeline (best-effort).
    if (doc.entity_id && uploadedBy && !doc.duplicate) {
      fastify.prisma.auditLog.create({
        data: {
          record_id:   Number(doc.entity_id),
          employee_id: String(uploadedBy),
          action:      'document_create',
          changes:     { summary: `Uploaded document: ${doc.original_filename}`, entity_type: 'document', entity_id: doc.id },
        },
      }).catch(() => { /* never let audit failure break the upload */ });
    }

    return reply.code(201).send(ok(toApiDoc(doc)));
  });

  // ── List / filter ──────────────────────────────────────────────────────────
  // GET /api/documents?related_record_id=X&related_type=lead&category=contract
  fastify.get('/', { preHandler: [authenticate] }, async (req, reply) => {
    const { related_record_id, related_type, category, folder_id, search, limit, offset } = req.query;

    // Coerce numeric params up front and 400 on garbage, so a non-numeric id/limit
    // can't reach Prisma as NaN and surface as an opaque 500.
    const recordId = toId(related_record_id);
    const lim = limit  ? toId(limit)  : 50;
    const off = offset ? toId(offset) : 0;
    // folder_id="" / "null" narrows to unfiled documents; omit for all folders.
    const filterFolder = folder_id !== undefined && folder_id !== 'null';
    const folderVal = folder_id === '' ? null : toId(folder_id);
    if (Number.isNaN(recordId) || Number.isNaN(lim) || Number.isNaN(off) || (filterFolder && Number.isNaN(folderVal))) {
      return reply.code(400).send({ error: 'related_record_id, folder_id, limit and offset must be integers' });
    }

    await assertRecordAccess(req, recordId);
    const { documents, total } = await svc(req).list({
      entityType: related_type,
      entityId:   recordId,
      category,
      ...(folder_id !== undefined && { folderId: folder_id === '' || folder_id === 'null' ? null : folderVal }),
      search,
      limit:  lim,
      offset: off,
    });
    const visible = await visibleDocs(req, documents);
    return ok({ documents: visible.map(toApiDoc), total: total - (documents.length - visible.length) });
  });

  // ── Folders ──────────────────────────────────────────────────────────────────
  // GET /api/documents/folders — flat, path-ordered folder tree
  fastify.get('/folders', { preHandler: [authenticate] }, async () => {
    return ok(await folderSvc.listFolders());
  });
  fastify.post('/folders', { preHandler: [authenticate] }, async (req, reply) => {
    const createdBy = req.user?.employee_id ?? req.user?.employeeId;
    const { name, parent_id } = req.body ?? {};
    return reply.code(201).send(created(await folderSvc.createFolder({ name, parentId: parent_id, createdBy })));
  });
  fastify.put('/folders/:id', { preHandler: [authenticate] }, async (req) => {
    const { name, parent_id } = req.body ?? {};
    return ok(await folderSvc.updateFolder(req.params.id, { name, parentId: parent_id }));
  });
  fastify.delete('/folders/:id', { preHandler: [authenticate] }, async (req, reply) => {
    const folder = await folderSvc.deleteFolder(req.params.id);
    if (!folder) return reply.code(404).send({ error: 'Folder not found' });
    return reply.code(204).send();
  });

  // ── Get single ─────────────────────────────────────────────────────────────
  fastify.get('/:id', { preHandler: [authenticate, docGuard] }, async (req, reply) => {
    const doc = await svc(req).get(req.params.id);
    if (!doc) return reply.code(404).send({ error: 'Document not found' });
    return ok(toApiDoc(doc));
  });

  // ── Download ───────────────────────────────────────────────────────────────
  fastify.get('/:id/download', { preHandler: [authenticate, docGuard] }, async (req, reply) => {
    const service = svc(req);
    const doc = await service.get(req.params.id);
    if (!doc) return reply.code(404).send({ error: 'Document not found' });

    try {
      const { stream, mimeType, filename } = await service.openStream(doc);
      return reply
        .header('Content-Type', mimeType)
        .header('Content-Disposition', contentDisposition(filename))
        .send(stream);
    } catch {
      return reply.code(404).send({ error: 'File not found in storage' });
    }
  });

  // ── Preview ────────────────────────────────────────────────────────────────
  // GET /api/documents/:id/preview — render the file inline (no attachment).
  fastify.get('/:id/preview', { preHandler: [authenticate, docGuard] }, async (req, reply) => {
    if (!(await previewEnabled(fastify.prisma, getTenantId(req)))) {
      return reply.code(403).send({ error: 'Document preview is disabled' });
    }
    const service = svc(req);
    const doc = await service.get(req.params.id);
    if (!doc) return reply.code(404).send({ error: 'Document not found' });
    return sendPreview(reply, service, doc);
  });

  // ── Update metadata ────────────────────────────────────────────────────────
  fastify.put('/:id', { preHandler: [authenticate, docGuard] }, async (req) => {
    return ok(toApiDoc(await svc(req).updateMetadata(req.params.id, req.body ?? {})));
  });

  // ── Delete ─────────────────────────────────────────────────────────────────
  fastify.delete('/:id', { preHandler: [authenticate, docGuard] }, async (req, reply) => {
    const doc = await svc(req).remove(req.params.id);
    if (!doc) return reply.code(404).send({ error: 'Document not found' });

    const actor = req.user?.employee_id ?? req.user?.employeeId;
    if (doc.entity_id && actor) {
      fastify.prisma.auditLog.create({
        data: {
          record_id:   Number(doc.entity_id),
          employee_id: String(actor),
          action:      'document_delete',
          changes:     { summary: `Deleted document: ${doc.original_filename}`, entity_type: 'document', entity_id: doc.id },
        },
      }).catch(() => { /* never let audit failure break the delete */ });
    }

    return reply.code(204).send();
  });

  // ── Documents for a record ─────────────────────────────────────────────────
  // GET /api/documents/record/:recordId
  fastify.get('/record/:recordId', { preHandler: [authenticate] }, async (req, reply) => {
    const recordId = toId(req.params.recordId);
    if (recordId == null || Number.isNaN(recordId)) {
      return reply.code(400).send({ error: 'recordId must be an integer' });
    }
    await assertRecordAccess(req, recordId);
    const { documents } = await svc(req).list({ entityId: recordId, limit: 200 });
    return ok(documents.map(toApiDoc));
  });

  // ── E-signature: request management (authenticated) ─────────────────────────
  fastify.post('/:id/signature-requests', { preHandler: [authenticate, docGuard] }, async (req, reply) => {
    const createdBy = req.user?.employee_id ?? req.user?.employeeId;
    const { title, message, ordered, expires_in_days, signers } = req.body ?? {};
    const request = await sigSvc.createRequest(req.params.id, {
      title, message, ordered: !!ordered, expiresInDays: expires_in_days, signers, createdBy,
    });
    return reply.code(201).send(created(request));
  });

  fastify.get('/:id/signature-requests', { preHandler: [authenticate, docGuard] }, async (req) => {
    return ok(await sigSvc.listRequests(req.params.id));
  });

  fastify.delete('/signature-requests/:reqId', { preHandler: [authenticate] }, async (req) => {
    return ok(await sigSvc.cancelRequest(req.params.reqId));
  });

  // ── E-signature: public signing surface (unauthenticated, token-based) ───────
  fastify.get('/sign/:token', async (req, reply) => {
    const resolved = await sigSvc.resolveByToken(req.params.token);
    if (!resolved) return reply.code(404).send({ error: 'Signing link not found, completed, or expired' });
    await sigSvc.recordView(resolved.signatory, req.ip).catch(() => {});
    const { signatory, request, document } = resolved;
    return ok({
      signatory: { name: signatory.name, email: signatory.email, status: signatory.status },
      request:   { title: request.title, message: request.message, ordered: request.ordered },
      document:  { filename: document.original_filename, mime_type: document.mime_type, file_size: document.file_size },
      // Whether it's this signer's turn (order enforcement is checked again on submit).
      can_sign: signatory.status !== 'signed' && signatory.status !== 'declined',
    });
  });

  // Stream the document under review for a signer
  fastify.get('/sign/:token/document', async (req, reply) => {
    const resolved = await sigSvc.resolveByToken(req.params.token);
    if (!resolved) return reply.code(404).send({ error: 'Signing link not found' });
    try {
      const { stream, mimeType, filename } = await svc(req).openStream(resolved.document);
      return reply
        .header('Content-Type', mimeType)
        .header('Content-Disposition', contentDisposition(filename, 'inline'))
        .send(stream);
    } catch {
      return reply.code(404).send({ error: 'File not found in storage' });
    }
  });

  fastify.post('/sign/:token', async (req, reply) => {
    const resolved = await sigSvc.resolveByToken(req.params.token);
    if (!resolved) return reply.code(404).send({ error: 'Signing link not found or expired' });
    const { type, data } = req.body ?? {};
    const result = await sigSvc.sign(resolved, { type, data, ip: req.ip });
    return ok(result);
  });

  fastify.post('/sign/:token/decline', async (req, reply) => {
    const resolved = await sigSvc.resolveByToken(req.params.token);
    if (!resolved) return reply.code(404).send({ error: 'Signing link not found or expired' });
    const result = await sigSvc.decline(resolved, { reason: req.body?.reason, ip: req.ip });
    return ok(result);
  });

  // ── Merge templates → generated documents ───────────────────────────────────
  // POST /api/documents/templates/:id/preview — render without storing
  fastify.post('/templates/:id/preview', { preHandler: [authenticate] }, async (req) => {
    const tplSvc = new DocumentTemplateService(fastify.prisma);
    return ok(await tplSvc.preview(req.params.id, req.body?.data ?? {}));
  });

  // POST /api/documents/templates/:id/render — render + store as a Document
  fastify.post('/templates/:id/render', { preHandler: [authenticate] }, async (req, reply) => {
    const uploadedBy = req.user?.employee_id ?? req.user?.employeeId;
    const tplSvc = new DocumentTemplateService(fastify.prisma, svc(req));
    const { data, filename, entity_type, entity_id, folder_id } = req.body ?? {};
    // Rendering for a record merges that record's own values (and its lookup
    // titles under `<field>_label`) under anything the caller passes.
    let context = data ?? {};
    if (entity_id != null) {
      await assertRecordAccess(req, entity_id);
      const rec = await recSvc.getRecord(entity_id, req.user).catch(() => null);
      if (rec) context = { ...recordMergeContext(rec), ...context };
    }
    const doc = await tplSvc.render(req.params.id, {
      data: context,
      filename,
      entityType: entity_type ?? null,
      entityId: entity_id != null ? Number(entity_id) : null,
      folderId: folder_id != null && folder_id !== '' ? Number(folder_id) : null,
      uploadedBy,
    });
    return reply.code(201).send(created(toApiDoc(doc)));
  });

  // ── Share links + engagement analytics ─────────────────────────────────────

  // POST /api/documents/:id/share — mint a public share link
  fastify.post('/:id/share', { preHandler: [authenticate, docGuard] }, async (req, reply) => {
    const { expires_in_days, allow_download } = req.body ?? {};
    const createdBy = req.user?.employee_id ?? req.user?.employeeId;
    const link = await shareSvc.createLink(req.params.id, {
      expiresInDays: expires_in_days,
      allowDownload: allow_download !== false,
      createdBy,
    });
    return reply.code(201).send(created(link));
  });

  // GET /api/documents/:id/shares — list a document's share links
  fastify.get('/:id/shares', { preHandler: [authenticate, docGuard] }, async (req) => {
    return ok(await shareSvc.listLinks(req.params.id));
  });

  // DELETE /api/documents/shares/:linkId — revoke a share link
  fastify.delete('/shares/:linkId', { preHandler: [authenticate] }, async (req) => {
    return ok(await shareSvc.revokeLink(req.params.linkId));
  });

  // GET /api/documents/:id/analytics — aggregated engagement
  fastify.get('/:id/analytics', { preHandler: [authenticate, docGuard] }, async (req) => {
    return ok(await shareSvc.getAnalytics(req.params.id));
  });

  // ── Public (unauthenticated) share access — records engagement ──────────────
  // GET /api/documents/public/:token — document metadata for a public link
  fastify.get('/public/:token', async (req, reply) => {
    const resolved = await shareSvc.resolveByToken(req.params.token);
    if (!resolved) return reply.code(404).send({ error: 'Link not found or expired' });
    await shareSvc.recordEvent(resolved.link, {
      type: 'view',
      ip: req.ip,
      userAgent: req.headers['user-agent'],
      referrer: req.headers['referer'] || req.headers['referrer'],
    }).catch(() => { /* never fail the view on a tracking hiccup */ });
    const d = resolved.document;
    return ok({
      filename: d.original_filename,
      mime_type: d.mime_type,
      file_size: d.file_size,
      allow_download: resolved.link.allow_download,
      // Whether the tenant exposes the in-app Preview button; the public page
      // reads this to show/hide its own Preview button (BUILDER > Document
      // Management → Show Document Preview Button).
      allow_preview: await previewEnabled(fastify.prisma, resolved.link.tenant_id),
    });
  });

  // GET /api/documents/public/:token/preview — render a shared file inline.
  // Usable directly as an <iframe src>: unauthenticated, and converted/text
  // responses are served with Content-Security-Policy: sandbox.
  fastify.get('/public/:token/preview', async (req, reply) => {
    const resolved = await shareSvc.resolveByToken(req.params.token);
    if (!resolved) return reply.code(404).send({ error: 'Link not found or expired' });
    if (!(await previewEnabled(fastify.prisma, resolved.link.tenant_id))) {
      return reply.code(403).send({ error: 'Document preview is disabled' });
    }
    await shareSvc.recordEvent(resolved.link, {
      type: 'view',
      ip: req.ip,
      userAgent: req.headers['user-agent'],
      referrer: req.headers['referer'] || req.headers['referrer'],
    }).catch(() => {});
    return sendPreview(reply, svc(req), resolved.document);
  });

  // GET /api/documents/public/:token/download — stream the file for a public link
  fastify.get('/public/:token/download', async (req, reply) => {
    const resolved = await shareSvc.resolveByToken(req.params.token);
    if (!resolved) return reply.code(404).send({ error: 'Link not found or expired' });
    if (!resolved.link.allow_download) return reply.code(403).send({ error: 'Downloads are disabled for this link' });

    await shareSvc.recordEvent(resolved.link, {
      type: 'download',
      ip: req.ip,
      userAgent: req.headers['user-agent'],
      referrer: req.headers['referer'] || req.headers['referrer'],
    }).catch(() => {});

    try {
      const { stream, mimeType, filename } = await svc(req).openStream(resolved.document);
      return reply
        .header('Content-Type', mimeType)
        .header('Content-Disposition', contentDisposition(filename))
        .send(stream);
    } catch {
      return reply.code(404).send({ error: 'File not found in storage' });
    }
  });
};
