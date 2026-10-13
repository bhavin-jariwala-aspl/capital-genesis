'use strict';

const config = require('../config');
const { getStorage, buildDocumentKey, hashBuffer } = require('./storage');
const DocumentConfigService = require('./document-config.service');
const { extractText } = require('./document-text');
const { getTenantId } = require('../middleware/tenant-scope');

/**
 * DocumentService — the single entry point for all document management.
 *
 * Every document in the system (generic CRM attachments, standalone DMS
 * uploads, auto-archived reports, generated templates) is a row
 * in the unified `documents` table with its bytes stored via the shared
 * StorageProvider under one canonical, tenant-first key scheme. No route talks
 * to `fs` or builds storage paths directly.
 *
 * Design guarantees:
 *   - Atomic create: bytes are written first, then the DB row; if the row
 *     fails the blob is removed, so an orphan row can never exist.
 *   - Atomic delete: soft-delete (deleted_at) in the DB, then best-effort blob
 *     removal; `purgeDeleted()` sweeps any blob a crash left behind.
 *   - Integrity + dedup: SHA-256 per file; a re-upload of identical bytes to
 *     the same owner returns the existing document instead of duplicating.
 *   - Versioning: uploading a new file for an existing (owner, filename)
 *     supersedes the prior version.
 */
class DocumentService {
  /**
   * @param {import('@prisma/client').PrismaClient} prisma  tenant-scoped client
   * @param {import('./storage/StorageProvider').StorageProvider} [storage]
   */
  constructor(prisma, storage = getStorage()) {
    this.db = prisma;
    this.storage = storage;
    this.docConfig = new DocumentConfigService(prisma);
  }

  // ── CREATE ─────────────────────────────────────────────────────────────────

  /**
   * Store a file and create its document row atomically.
   *
   * @param {object} p
   * @param {number} p.tenantId
   * @param {Buffer} p.buffer
   * @param {string} p.filename           original filename
   * @param {string} [p.mimeType]
   * @param {string} [p.entityType]        lead|contact|account|case|…
   * @param {number} [p.entityId]          owning record id (generic)
   * @param {number} [p.recordId]          runtime records.id bridge (unique)
   * @param {string} [p.category]
   * @param {string} [p.description]
   * @param {string} [p.notes]
   * @param {boolean}[p.isPublic]
   * @param {string} [p.status]
   * @param {string|number} [p.uploadedBy]
   * @param {string} [p.refPrefix]         document_ref prefix (e.g. app_number)
   * @returns {Promise<object>} the document row (+ `duplicate: true` if deduped)
   */
  async upload(p) {
    const {
      tenantId, buffer, filename, mimeType,
      entityType = null, entityId = null, recordId = null,
      category = null, folderId = null, description = null, notes = null,
      isPublic = false, status = 'uploaded', uploadedBy = null, refPrefix = null,
    } = p;

    if (!Buffer.isBuffer(buffer)) {
      throw Object.assign(new Error('File buffer is required'), { statusCode: 400 });
    }
    if (buffer.length > config.storage.maxFileSize) {
      throw Object.assign(
        new Error(`File exceeds the ${Math.round(config.storage.maxFileSize / 1024 / 1024)} MB size limit`),
        { statusCode: 400 },
      );
    }
    if (!filename) {
      throw Object.assign(new Error('filename is required'), { statusCode: 400 });
    }

    // Per-category policy (Document Management builder). When the tenant has
    // configured this category, enforce its MIME allow-list / size cap and
    // route review-required uploads into "under_review". Unconfigured
    // categories fall through to the global defaults above.
    let effectiveStatus = status;
    const policy = await this.docConfig.resolveCategoryPolicy(category).catch(() => null);
    if (policy) {
      if (policy.allowedMime && mimeType && !policy.allowedMime.includes(mimeType)) {
        throw Object.assign(
          new Error(`File type ${mimeType} is not allowed for the "${category}" category`),
          { statusCode: 400 },
        );
      }
      if (policy.maxBytes != null && buffer.length > policy.maxBytes) {
        throw Object.assign(
          new Error(`File exceeds the ${Math.round(policy.maxBytes / 1024 / 1024)} MB limit for the "${category}" category`),
          { statusCode: 400 },
        );
      }
      if (policy.reviewRequired && status === 'uploaded') {
        effectiveStatus = 'under_review';
      }
    }

    const fileHash = hashBuffer(buffer);

    // Dedup: identical bytes for the same owner → return existing document.
    const ownerWhere = this.#ownerWhere({ entityType, entityId, folderId });
    const existing = await this.db.document.findFirst({
      where: { file_hash: fileHash, deleted_at: null, ...ownerWhere },
    });
    if (existing) return { ...existing, duplicate: true };

    // Versioning: supersede the latest live version of the same logical file.
    const prior = await this.db.document.findFirst({
      where: { original_filename: filename, deleted_at: null, ...ownerWhere },
      orderBy: { version: 'desc' },
    });
    const version = prior ? prior.version + 1 : 1;

    const key = buildDocumentKey({ tenantId, entityType, entityId, category, filename });
    await this.storage.put(key, buffer);

    // Best-effort text extraction for full-text search (never blocks the upload).
    const contentText = await extractText(buffer, mimeType).catch(() => null);

    try {
      const doc = await this.db.document.create({
        data: {
          document_ref: await this.#nextRef(refPrefix ?? entityType ?? 'GEN', { entityType, entityId, folderId }),
          entity_type: entityType,
          entity_id: entityId,
          record_id: recordId,
          original_filename: filename,
          stored_key: key,
          file_size: buffer.length,
          mime_type: mimeType ?? 'application/octet-stream',
          file_hash: fileHash,
          category,
          folder_id: folderId != null ? Number(folderId) : null,
          content_text: contentText,
          description,
          notes,
          is_public: isPublic,
          version,
          status: effectiveStatus,
          uploaded_by: uploadedBy != null ? String(uploadedBy) : null,
          uploaded_at: new Date(),
          tenant_id: tenantId,
        },
      });
      return doc;
    } catch (err) {
      // Compensating action: never leave a blob without a row.
      await this.storage.delete(key).catch(() => {});
      throw err;
    }
  }

  // ── READ ─────────────────────────────────────────────────────────────────

  async get(id) {
    return this.db.document.findFirst({ where: { id: Number(id), deleted_at: null } });
  }

  /** Look up by the runtime records.id bridge. */
  async getByRecordId(recordId) {
    return this.db.document.findFirst({ where: { record_id: Number(recordId), deleted_at: null } });
  }

  async list({ entityType, entityId, category, status, folderId, search, limit = 50, offset = 0 } = {}) {
    // Full-text content matches (pdf/docx/txt bodies) come from the FULLTEXT
    // index via a raw query; merged with LIKE matches on filename/ref/description
    // so a search hits both metadata and document contents.
    const contentIds = search ? await this.#fullTextIds(search) : null;

    const where = {
      deleted_at: null,
      ...(entityType && { entity_type: entityType }),
      ...(entityId != null && { entity_id: Number(entityId) }),
      ...(category && { category }),
      ...(status && { status }),
      ...(folderId !== undefined && { folder_id: folderId != null ? Number(folderId) : null }),
      ...(search && {
        OR: [
          { original_filename: { contains: search } },
          { description: { contains: search } },
          { document_ref: { contains: search } },
          ...(contentIds && contentIds.length ? [{ id: { in: contentIds } }] : []),
        ],
      }),
    };
    const [documents, total] = await Promise.all([
      // Omit the (potentially large) extracted full-text from list payloads.
      this.db.document.findMany({ where, omit: { content_text: true }, orderBy: { created_at: 'desc' }, take: Number(limit), skip: Number(offset) }),
      this.db.document.count({ where }),
    ]);
    return { documents, total };
  }

  /** Open a download stream for a document. */
  async openStream(doc) {
    return {
      stream: await this.storage.getStream(doc.stored_key),
      mimeType: doc.mime_type || 'application/octet-stream',
      filename: doc.original_filename,
      size: doc.file_size,
    };
  }

  /** Read a document's bytes fully into memory (for in-process conversion/preview). */
  async readBuffer(doc) {
    return this.storage.get(doc.stored_key);
  }

  // ── UPDATE ─────────────────────────────────────────────────────────────────

  async updateMetadata(id, data) {
    const update = {
      ...(data.filename !== undefined && { original_filename: data.filename }),
      ...(data.category !== undefined && { category: data.category }),
      ...(data.folder_id !== undefined && { folder_id: data.folder_id != null && data.folder_id !== '' ? Number(data.folder_id) : null }),
      ...(data.description !== undefined && { description: data.description }),
      ...(data.notes !== undefined && { notes: data.notes }),
      ...(data.entity_type !== undefined && { entity_type: data.entity_type }),
      ...(data.entity_id !== undefined && { entity_id: data.entity_id != null ? Number(data.entity_id) : null }),
      ...(data.is_public !== undefined && { is_public: Boolean(data.is_public) }),
    };
    return this.db.document.update({ where: { id: Number(id) }, data: update });
  }

  /** Review decision (approve / reject / waive). */
  async review(id, { status, reviewedBy, rejectionReason }) {
    return this.db.document.update({
      where: { id: Number(id) },
      data: {
        status,
        reviewed_by: reviewedBy != null ? String(reviewedBy) : null,
        reviewed_at: new Date(),
        rejection_reason: rejectionReason ?? null,
      },
    });
  }

  // ── DELETE ─────────────────────────────────────────────────────────────────

  /**
   * Soft-delete: mark the row deleted, then best-effort remove the blob. The
   * row is the source of truth, so a crash before blob removal is harmless —
   * `purgeDeleted()` reclaims the storage later.
   */
  async remove(id) {
    const doc = await this.db.document.findFirst({ where: { id: Number(id), deleted_at: null } });
    if (!doc) return null;
    await this.db.document.update({ where: { id: doc.id }, data: { deleted_at: new Date(), status: 'deleted' } });
    await this.storage.delete(doc.stored_key).catch(() => {});
    return doc;
  }

  /** Background GC — hard-delete rows soft-deleted before `cutoff` and drop blobs. */
  async purgeDeleted(cutoff) {
    const stale = await this.db.document.findMany({
      where: { deleted_at: { lt: cutoff } },
      select: { id: true, stored_key: true },
    });
    for (const d of stale) {
      await this.storage.delete(d.stored_key).catch(() => {});
      await this.db.document.delete({ where: { id: d.id } }).catch(() => {});
    }
    return stale.length;
  }

  // ── INTERNAL ─────────────────────────────────────────────────────────────

  /**
   * IDs of documents whose extracted content matches `search`, via the MySQL
   * FULLTEXT index. Raw queries bypass the tenant-scope Prisma extension, so
   * tenant_id is filtered explicitly here. Returns [] when there is no tenant
   * context or the term is too short for the index to match.
   */
  async #fullTextIds(search) {
    const tenantId = getTenantId();
    if (tenantId == null || !search || String(search).trim().length < 2) return [];
    try {
      const rows = await this.db.$queryRaw`
        SELECT id FROM documents
        WHERE tenant_id = ${tenantId}
          AND deleted_at IS NULL
          AND MATCH(original_filename, description, content_text)
              AGAINST (${String(search)} IN NATURAL LANGUAGE MODE)
        LIMIT 500`;
      return rows.map(r => Number(r.id));
    } catch {
      return []; // never let a search-index hiccup break listing
    }
  }

  #ownerWhere({ entityType, entityId, folderId }) {
    if (entityType && entityId != null) return { entity_type: entityType, entity_id: Number(entityId) };
    // Owner-less (standalone-DMS) uploads have no owning record — the normal case
    // for a plain folder upload. Scope dedup/versioning/ref-numbering to the target
    // folder so unrelated files elsewhere in the tenant are never treated as
    // duplicates of, or versions of, one another. `folder_id: null` = the Unfiled bucket.
    return { entity_type: null, entity_id: null, folder_id: folderId != null ? Number(folderId) : null };
  }

  /** Generate the next per-owner document reference, e.g. DOC-CONTACT-003. */
  async #nextRef(prefix, owner) {
    const where = this.#ownerWhere(owner);
    const count = Object.keys(where).length
      ? await this.db.document.count({ where })
      : await this.db.document.count();
    const safePrefix = String(prefix || 'GEN').replace(/[^a-zA-Z0-9_-]/g, '').toUpperCase() || 'GEN';
    return `DOC-${safePrefix}-${String(count + 1).padStart(3, '0')}`;
  }
}

module.exports = DocumentService;
