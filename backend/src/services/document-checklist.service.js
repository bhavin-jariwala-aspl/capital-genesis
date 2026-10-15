'use strict';

const { NotFoundError } = require('../utils/errors');

/**
 * Document checklist status for one record — which required documents are in
 * and which are still missing (PRD LOAN-FR-07, DOC-FR-04).
 *
 * Checklists (`ui_document_checklists`) are defined per object. When an object
 * has several (a real-estate, a personal and an investment-backed loan pack),
 * the one whose label best matches the record's own picklist values (its
 * product, its party type) is chosen; with no clear match, all are shown.
 *
 * Used by the record's Docs tab and by client upload links, so both always
 * agree on what is outstanding.
 */

const STOP = new Set(['pack', 'loan', 'loans', 'the', 'and', 'for', 'account', 'opening']);
const words = (s) => String(s ?? '').toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length >= 3 && !STOP.has(w));

const NOT_RECEIVED = new Set(['rejected', 'expired']);

class DocumentChecklistService {
  /** @param {import('@prisma/client').PrismaClient} prisma tenant-scoped client */
  constructor(prisma) {
    this.db = prisma;
  }

  /** The record, its object name and the labels of its picklist values. */
  async #record(recordId) {
    const rec = await this.db.record.findUnique({
      where: { id: Number(recordId) },
      select: { id: true, object_id: true, tenant_id: true, deleted_at: true, object: { select: { name: true, label: true, config: true } } },
    });
    if (!rec || rec.deleted_at) throw new NotFoundError('Record');
    const [values, fields] = await Promise.all([
      this.db.recordFieldValue.findMany({ where: { record_id: rec.id }, select: { field_name: true, str_value: true } }),
      this.db.uiField.findMany({ where: { object_id: rec.object_id, is_active: true }, select: { name: true, field_type: true, options: true } }),
    ]);
    const byName = Object.fromEntries(values.map((v) => [v.field_name, v.str_value]));
    const labels = [];
    for (const f of fields) {
      if (!['select', 'radio'].includes(f.field_type) || !Array.isArray(f.options)) continue;
      const v = byName[f.name];
      const opt = v != null && f.options.find((o) => String(o?.value ?? o) === String(v));
      if (opt) labels.push(String(opt.label ?? opt.value ?? opt));
    }
    const titleField = rec.object?.config?.title_field;
    const title = (titleField && byName[titleField]) || byName.name || byName.display_name || `${rec.object?.label ?? 'Record'} #${rec.id}`;
    return { rec, title, labels, data: byName };
  }

  /** Pick the checklists that apply to a record (see the class comment). */
  static choose(checklists, labels) {
    if (checklists.length <= 1) return checklists;
    const have = new Set(labels.flatMap(words));
    const scored = checklists.map((c) => ({ c, score: words(c.label).filter((w) => have.has(w)).length }));
    const best = Math.max(...scored.map((s) => s.score));
    return best > 0 ? scored.filter((s) => s.score === best).map((s) => s.c) : checklists;
  }

  /**
   * `{ record: { id, object, title }, checklists: [{ id, label, items: [...] }], outstanding }`.
   * Each item: `{ label, category, category_label, required, received, documents: [{ id, filename, status }] }`.
   * A category used by several items (four corporate documents) is satisfied
   * one document per item, in order.
   */
  async forRecord(recordId, { checklistId = null } = {}) {
    const { rec, title, labels } = await this.#record(recordId);
    const objectName = rec.object?.name;
    const [all, categories, docs] = await Promise.all([
      this.db.uiDocumentChecklist.findMany({ where: { entity_type: objectName, is_active: true }, orderBy: { order_index: 'asc' } }),
      this.db.uiDocumentCategory.findMany({ where: { is_active: true }, select: { code: true, label: true, allowed_mime: true, max_file_mb: true } }),
      this.db.document.findMany({
        where: { entity_type: objectName, entity_id: rec.id, deleted_at: null },
        select: { id: true, original_filename: true, category: true, status: true, created_at: true },
        orderBy: { created_at: 'asc' },
      }),
    ]);
    const chosen = checklistId ? all.filter((c) => c.id === Number(checklistId)) : DocumentChecklistService.choose(all, labels);
    const catLabel = Object.fromEntries(categories.map((c) => [c.code, c.label]));
    const pool = {}; // category → documents not yet matched to an item
    // A rejected or expired document does not satisfy an item: the client must send another.
    for (const d of docs) if (!NOT_RECEIVED.has(d.status)) (pool[d.category ?? ''] ??= []).push(d);

    let outstanding = 0;
    const checklists = chosen.map((c) => {
      const used = {};
      const items = (Array.isArray(c.items) ? c.items : []).map((i) => {
        const code = i.category_code;
        const list = pool[code] ?? [];
        const n = used[code] ?? 0;
        const mine = list[n] ? [list[n]] : [];
        used[code] = n + 1;
        // The last item of a category also shows any further uploads.
        const lastOfCategory = c.items.filter((x) => x.category_code === code).length === n + 1;
        const docsForItem = lastOfCategory ? list.slice(n) : mine;
        const received = docsForItem.length > 0;
        if (i.required && !received) outstanding += 1;
        return {
          label: i.label ?? catLabel[code] ?? code, category: code, category_label: catLabel[code] ?? code,
          required: Boolean(i.required), received,
          documents: docsForItem.map((d) => ({ id: d.id, filename: d.original_filename, status: d.status, uploaded_at: d.created_at })),
        };
      });
      return { id: c.id, label: c.label, items };
    });
    return {
      record: { id: rec.id, object: objectName, object_label: rec.object?.label ?? objectName, title, tenant_id: rec.tenant_id },
      checklists,
      outstanding,
      categories: categories.map((c) => ({ code: c.code, label: c.label, allowed_mime: c.allowed_mime ?? null, max_file_mb: c.max_file_mb ?? null })),
    };
  }
}

module.exports = DocumentChecklistService;
