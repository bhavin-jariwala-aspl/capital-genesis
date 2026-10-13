'use strict';

/**
 * DocumentConfigService — powers the Document Management builder.
 *
 * Manages the tenant-scoped DMS configuration that the standalone Documents
 * module consumes at runtime:
 *   - UiDocumentCategory  : configurable categories with per-category MIME
 *                           allow-list, size cap, retention and review policy.
 *   - UiDocumentChecklist : required-document checklists per owner entity type.
 *
 * tenant_id is injected automatically by the Prisma tenant-scope extension, so
 * this service never sets or filters it explicitly — every call runs inside an
 * authenticated request's tenant context.
 */
class DocumentConfigService {
  constructor(prisma) {
    this.db = prisma;
  }

  // ── CATEGORIES ──────────────────────────────────────────────────────────────

  listCategories({ includeInactive = false } = {}) {
    return this.db.uiDocumentCategory.findMany({
      where: includeInactive ? {} : { is_active: true },
      orderBy: [{ order_index: 'asc' }, { label: 'asc' }],
    });
  }

  getCategory(id) {
    return this.db.uiDocumentCategory.findFirst({ where: { id: Number(id) } });
  }

  async createCategory(body) {
    const data = this.#categoryData(body);
    if (!data.code) throw Object.assign(new Error('code is required'), { statusCode: 400 });
    if (!data.label) throw Object.assign(new Error('label is required'), { statusCode: 400 });
    return this.db.uiDocumentCategory.create({ data });
  }

  updateCategory(id, body) {
    return this.db.uiDocumentCategory.update({
      where: { id: Number(id) },
      data: this.#categoryData(body, { partial: true }),
    });
  }

  deleteCategory(id) {
    return this.db.uiDocumentCategory.delete({ where: { id: Number(id) } });
  }

  /** Normalise a category payload; on partial updates only defined keys pass through. */
  #categoryData(body = {}, { partial = false } = {}) {
    const out = {};
    const set = (key, val) => { if (!partial || val !== undefined) out[key] = val; };

    if (body.code !== undefined)  set('code', String(body.code).trim().toLowerCase().replace(/[^a-z0-9_]/g, '_'));
    if (body.label !== undefined) set('label', String(body.label).trim());
    set('description', body.description ?? null);
    set('allowed_mime', Array.isArray(body.allowed_mime) ? body.allowed_mime : (body.allowed_mime ?? null));
    set('max_file_mb', body.max_file_mb != null ? Number(body.max_file_mb) : null);
    set('retention_days', body.retention_days != null ? Number(body.retention_days) : null);
    set('review_required', body.review_required != null ? Boolean(body.review_required) : undefined);
    set('is_required', body.is_required != null ? Boolean(body.is_required) : undefined);
    if (body.color !== undefined)       set('color', body.color || '#6366f1');
    if (body.order_index !== undefined) set('order_index', Number(body.order_index) || 0);
    set('is_active', body.is_active != null ? Boolean(body.is_active) : undefined);
    set('config', body.config ?? null);

    // Strip undefined created by the conditional sets above.
    return Object.fromEntries(Object.entries(out).filter(([, v]) => v !== undefined));
  }

  // ── CHECKLISTS ──────────────────────────────────────────────────────────────

  listChecklists({ entityType } = {}) {
    return this.db.uiDocumentChecklist.findMany({
      where: { ...(entityType && { entity_type: entityType }) },
      orderBy: [{ order_index: 'asc' }, { label: 'asc' }],
    });
  }

  getChecklist(id) {
    return this.db.uiDocumentChecklist.findFirst({ where: { id: Number(id) } });
  }

  async createChecklist(body) {
    const data = this.#checklistData(body);
    if (!data.entity_type) throw Object.assign(new Error('entity_type is required'), { statusCode: 400 });
    if (!data.label) throw Object.assign(new Error('label is required'), { statusCode: 400 });
    return this.db.uiDocumentChecklist.create({ data });
  }

  updateChecklist(id, body) {
    return this.db.uiDocumentChecklist.update({
      where: { id: Number(id) },
      data: this.#checklistData(body, { partial: true }),
    });
  }

  deleteChecklist(id) {
    return this.db.uiDocumentChecklist.delete({ where: { id: Number(id) } });
  }

  #checklistData(body = {}, { partial = false } = {}) {
    const out = {};
    const set = (key, val) => { if (!partial || val !== undefined) out[key] = val; };

    if (body.entity_type !== undefined) set('entity_type', String(body.entity_type).trim());
    if (body.label !== undefined)       set('label', String(body.label).trim());
    set('description', body.description ?? null);
    if (body.items !== undefined) {
      const items = Array.isArray(body.items) ? body.items.map(it => ({
        category_code: String(it.category_code ?? '').trim(),
        required: it.required != null ? Boolean(it.required) : true,
        label: it.label ? String(it.label).trim() : undefined,
      })).filter(it => it.category_code) : [];
      out.items = items;
    }
    set('is_active', body.is_active != null ? Boolean(body.is_active) : undefined);
    if (body.order_index !== undefined) set('order_index', Number(body.order_index) || 0);

    return Object.fromEntries(Object.entries(out).filter(([, v]) => v !== undefined));
  }

  // ── RUNTIME CONSUMPTION ──────────────────────────────────────────────────────

  /**
   * Resolve the effective upload policy for a category code. Returns null when
   * the tenant has not configured that category, so callers fall back to the
   * global config in DocumentService.
   *
   * @returns {Promise<null | { allowedMime: string[]|null, maxBytes: number|null, reviewRequired: boolean }>}
   */
  async resolveCategoryPolicy(code) {
    if (!code) return null;
    const cat = await this.db.uiDocumentCategory.findFirst({
      where: { code: String(code), is_active: true },
    });
    if (!cat) return null;
    return {
      allowedMime: Array.isArray(cat.allowed_mime) && cat.allowed_mime.length ? cat.allowed_mime : null,
      maxBytes: cat.max_file_mb != null ? cat.max_file_mb * 1024 * 1024 : null,
      reviewRequired: Boolean(cat.review_required),
    };
  }
}

module.exports = DocumentConfigService;
