'use strict';

const { getTenantId } = require('../middleware/tenant-scope');

/**
 * Merge a template body against a context object.
 * Supports {{path}} and dot-paths {{contact.first_name}}. Missing values render
 * as an empty string. This is intentionally logic-free (no conditionals/loops)
 * — a safe, predictable substitution over trusted admin-authored templates.
 */
function mergeTemplate(body, data = {}) {
  return String(body ?? '').replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, path) => {
    const val = path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), data);
    return val == null ? '' : String(val);
  });
}

/** Distinct {{placeholder}} tokens used in a template body. */
function extractPlaceholders(body) {
  const set = new Set();
  const re = /\{\{\s*([\w.]+)\s*\}\}/g;
  let m;
  while ((m = re.exec(String(body ?? '')))) set.add(m[1]);
  return [...set];
}

/**
 * DocumentTemplateService — admin-managed merge templates + rendering.
 *
 * Rendering merges a context into the template body and (for render()) stores
 * the result as a first-class Document via DocumentService, so generated files
 * are versioned, searchable and shareable like any other document.
 */
class DocumentTemplateService {
  /**
   * @param {import('@prisma/client').PrismaClient} prisma
   * @param {import('./document.service')} [documentService] injected for render()
   */
  constructor(prisma, documentService = null) {
    this.db = prisma;
    this.documents = documentService;
  }

  // ── CRUD ─────────────────────────────────────────────────────────────────────

  listTemplates({ entityType, includeInactive = false } = {}) {
    return this.db.documentTemplate.findMany({
      where: {
        ...(includeInactive ? {} : { is_active: true }),
        ...(entityType && { entity_type: entityType }),
      },
      orderBy: [{ name: 'asc' }],
    });
  }

  getTemplate(id) {
    return this.db.documentTemplate.findFirst({ where: { id: Number(id) } });
  }

  async createTemplate(body = {}) {
    const data = this.#data(body);
    if (!data.name) throw Object.assign(new Error('name is required'), { statusCode: 400 });
    if (!data.body) throw Object.assign(new Error('body is required'), { statusCode: 400 });
    return this.db.documentTemplate.create({ data });
  }

  updateTemplate(id, body) {
    return this.db.documentTemplate.update({ where: { id: Number(id) }, data: this.#data(body, { partial: true }) });
  }

  deleteTemplate(id) {
    return this.db.documentTemplate.delete({ where: { id: Number(id) } });
  }

  #data(body = {}, { partial = false } = {}) {
    const out = {};
    const set = (k, v) => { if (!partial || v !== undefined) out[k] = v; };
    if (body.name !== undefined) set('name', String(body.name).trim());
    if (body.body !== undefined) set('body', String(body.body));
    set('description', body.description ?? null);
    set('entity_type', body.entity_type ?? null);
    if (body.format !== undefined) set('format', body.format === 'text' ? 'text' : 'html');
    set('output_category', body.output_category ?? null);
    set('is_active', body.is_active != null ? Boolean(body.is_active) : undefined);
    return Object.fromEntries(Object.entries(out).filter(([, v]) => v !== undefined));
  }

  // ── Render ───────────────────────────────────────────────────────────────────

  /** Merge a template against `data` and return the rendered string (no storage). */
  async preview(templateId, data = {}) {
    const tpl = await this.getTemplate(templateId);
    if (!tpl) throw Object.assign(new Error('Template not found'), { statusCode: 404 });
    return { format: tpl.format, content: mergeTemplate(tpl.body, data), placeholders: extractPlaceholders(tpl.body) };
  }

  /**
   * Render a template and store the result as a Document.
   * @param {number} templateId
   * @param {object} p
   * @param {object} [p.data]        merge context
   * @param {string} [p.filename]    output filename (defaults from template name)
   * @param {string} [p.entityType]  owner entity for the generated document
   * @param {number} [p.entityId]
   * @param {number} [p.folderId]
   * @param {string|number} [p.uploadedBy]
   */
  async render(templateId, { data = {}, filename, entityType = null, entityId = null, folderId = null, uploadedBy = null } = {}) {
    if (!this.documents) throw new Error('DocumentTemplateService.render requires a DocumentService');
    const tpl = await this.getTemplate(templateId);
    if (!tpl) throw Object.assign(new Error('Template not found'), { statusCode: 404 });

    const content = mergeTemplate(tpl.body, data);
    const isHtml = tpl.format !== 'text';
    const ext = isHtml ? 'html' : 'txt';
    const mimeType = isHtml ? 'text/html' : 'text/plain';
    const safeBase = String(filename || tpl.name || 'document').replace(/\.[a-z0-9]+$/i, '');
    const outName = `${safeBase}.${ext}`;

    return this.documents.upload({
      tenantId: getTenantId(),
      buffer: Buffer.from(content, 'utf8'),
      filename: outName,
      mimeType,
      entityType,
      entityId,
      folderId,
      category: tpl.output_category || 'generated',
      description: `Generated from template "${tpl.name}"`,
      uploadedBy,
    });
  }
}

module.exports = DocumentTemplateService;
module.exports.mergeTemplate = mergeTemplate;
module.exports.extractPlaceholders = extractPlaceholders;
