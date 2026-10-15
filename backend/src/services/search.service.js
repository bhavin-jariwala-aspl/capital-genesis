'use strict';

const { ROLE_LEVEL, ADMIN_THRESHOLD, MANAGER_THRESHOLD } = require('../middleware/authenticate');

/**
 * SearchService — searches across CRM relational tables AND custom objects.
 *
 * CRM entities (lead, contact, account, opportunity, case):
 *   Queried via Prisma against their first-class relational tables.
 *
 * Custom objects:
 *   Queried via RecordFieldValue.str_value (always populated as a reliable
 *   fallback in the typed EAV model) restricted to UiField.is_searchable=true
 *   fields.  Owner filtering uses Record.created_by / Record.assigned_to.
 *
 * Ownership filtering:
 *   super_admin / admin → all records
 *   manager             → own + direct/indirect reports
 *   user                → own + assigned
 */
const AccessScopeService = require('./access-scope.service');

class SearchService {
  /**
   * @param {object} [recordAccess] RecordService — when given, custom-object hits use
   *   the same visibility rule as record lists (own book, desk-wide objects, unit
   *   scope, barriers), so search finds exactly what the viewer could open.
   * @param {object} [permissions] PermissionService — hides objects the role may not view.
   */
  constructor(prisma, accessScope = null, recordAccess = null, permissions = null) {
    this.db = prisma;
    this.scope = accessScope ?? new AccessScopeService(prisma);
    this.recordAccess = recordAccess;
    this.permissions = permissions;
  }

  async search(query, { limit = 20, viewer } = {}) {
    if (!query || query.trim().length < 2) return [];

    const q = query.trim().toLowerCase();

    // ── Owner IDs for restriction ────────────────────────────────────────────
    const viewerLevel = viewer ? (viewer.role_level ?? ROLE_LEVEL[viewer.role] ?? Number.POSITIVE_INFINITY) : 0;
    let ownerIds = null; // null = no restriction
    if (viewer && viewerLevel > MANAGER_THRESHOLD) {
      ownerIds = [viewer.employee_id];
    } else if (viewer && viewerLevel > ADMIN_THRESHOLD) {
      const rows = await this.db.employeeHierarchy.findMany({
        where:  { ancestor_id: viewer.employee_id, depth: { gt: 0 } },
        select: { descendant_id: true },
      });
      ownerIds = [viewer.employee_id, ...rows.map(r => r.descendant_id)];
    }

    const ownerFilter = ownerIds
      ? { owner_id: { in: ownerIds } }
      : {};

    // Owner filter for Record-anchored rows (custom objects use created_by / assigned_to)
    // plus business-unit scope and information barriers — search must never
    // surface a record the viewer could not open.
    const recordOwnerFilter = this.recordAccess && viewer
      ? await this.recordAccess.accessWhere(viewer)
      : {
        ...(ownerIds ? { OR: [{ created_by: { in: ownerIds } }, { assigned_to: { in: ownerIds } }] } : {}),
        ...this.scope.whereFor(await this.scope.forViewer(viewer)),
      };

    // ── Fan out search across all five CRM entity tables ─────────────────────
    const contains = { contains: q };

    const [leads, contacts, accounts, opps, cases, customHits] = await Promise.all([
      this.db.crmLead.findMany({
        where: {
          ...ownerFilter,
          OR: [{ first_name: contains }, { last_name: contains }, { email: contains }, { company: contains }],
        },
        select: { id: true, first_name: true, last_name: true, email: true, company: true, record_id: true, owner_id: true },
        take: limit,
      }),
      this.db.crmContact.findMany({
        where: {
          ...ownerFilter,
          OR: [{ first_name: contains }, { last_name: contains }, { email: contains }],
        },
        select: { id: true, first_name: true, last_name: true, email: true, record_id: true, owner_id: true },
        take: limit,
      }),
      this.db.crmAccount.findMany({
        where: { ...ownerFilter, name: contains },
        select: { id: true, name: true, email: true, record_id: true, owner_id: true },
        take: limit,
      }),
      this.db.crmOpportunity.findMany({
        where: { ...ownerFilter, name: contains },
        select: { id: true, name: true, stage: true, record_id: true, owner_id: true },
        take: limit,
      }),
      this.db.crmCase.findMany({
        where: {
          ...ownerFilter,
          OR: [{ subject: contains }, { contact_email: contains }],
        },
        select: { id: true, subject: true, status: true, record_id: true, owner_id: true },
        take: limit,
      }),
      // Search custom (non-CRM) objects via typed EAV field values
      this.#searchCustomObjects(q, recordOwnerFilter, limit, viewer),
    ]);

    // ── Load CRM object/module metadata once ────────────────────────────────
    const objects = await this.db.uiObject.findMany({
      where:   { name: { in: ['lead', 'contact', 'account', 'opportunity', 'case'] } },
      select:  { id: true, name: true, label: true, module: { select: { id: true, label: true } } },
    });
    const objectByName = Object.fromEntries(objects.map(o => [o.name, o]));

    const results = [];

    const push = (type, row, title, subtitle) => {
      if (results.length >= limit) return;
      const obj = objectByName[type];
      results.push({
        id:             row.id,
        record_id:      row.record_id ?? null,
        title:          String(title),
        subtitle:       String(subtitle ?? ''),
        crm_type:       type,
        object_id:      obj?.id ?? null,
        object_label:   obj?.label ?? type,
        module_id:      obj?.module?.id ?? null,
        module_label:   obj?.module?.label ?? '',
      });
    };

    for (const r of leads)    push('lead',        r, `${r.first_name} ${r.last_name}`.trim(), r.email ?? r.company ?? '');
    for (const r of contacts) push('contact',     r, `${r.first_name} ${r.last_name}`.trim(), r.email ?? '');
    for (const r of accounts) push('account',     r, r.name, r.email ?? '');
    for (const r of opps)     push('opportunity', r, r.name, r.stage ?? '');
    for (const r of cases)    push('case',        r, r.subject, r.status ?? '');

    // Append custom-object results (already shaped as result items)
    for (const hit of customHits) {
      if (results.length >= limit) break;
      results.push(hit);
    }

    return results.slice(0, limit);
  }

  // ── Custom object search ─────────────────────────────────────────────────

  /**
   * Search custom (non-CRM) objects via RecordFieldValue.str_value LIKE %q%.
   *
   * Only fields where UiField.is_searchable=true are matched.
   * Owner filtering is applied via Record.created_by / Record.assigned_to.
   * Each record appears at most once in the results (distinct by record_id).
   */
  async #searchCustomObjects(q, recordOwnerFilter, limit, viewer = null) {
    const CRM_NAMES = ['lead', 'contact', 'account', 'opportunity', 'case'];

    // Load searchable fields for non-CRM objects only
    const searchableFields = await this.db.uiField.findMany({
      where: {
        is_searchable: true,
        is_active:     true,
        object: { name: { notIn: CRM_NAMES } },
      },
      select: {
        id:     true,
        name:   true,
        label:  true,
        object: {
          select: {
            id: true, name: true, label: true, config: true,
            module: { select: { id: true, label: true } },
          },
        },
      },
    });

    if (!searchableFields.length) return [];

    // Group searchable field names by object.id
    const fieldsByObject = new Map();
    for (const f of searchableFields) {
      const oid = f.object.id;
      if (!fieldsByObject.has(oid)) {
        fieldsByObject.set(oid, { object: f.object, fieldNames: [], labels: {} });
      }
      fieldsByObject.get(oid).fieldNames.push(f.name);
      fieldsByObject.get(oid).labels[f.name] = f.label || f.name;
    }

    // Objects the role may not open never appear in search.
    let groups = [...fieldsByObject.values()];
    if (this.permissions && viewer?.role) {
      const allowed = await Promise.all(groups.map((g) => this.permissions
        .getEffectiveUiPermission('object', g.object.id, viewer.role, viewer.tenant_id ?? null)
        .then((p) => p?.can_view !== false).catch(() => true)));
      groups = groups.filter((_, i) => allowed[i]);
    }

    const hits = [];
    await Promise.all(
      groups.map(async ({ object, fieldNames, labels }) => {
        const rows = await this.db.recordFieldValue.findMany({
          where: {
            field_name: { in: fieldNames },
            str_value:  { contains: q },
            record: { object_id: object.id, deleted_at: null, ...recordOwnerFilter },
          },
          select: { record_id: true, field_name: true, str_value: true },
          take:     limit,
          distinct: ['record_id'],
        });
        for (const h of rows) hits.push({ ...h, object, label: labels[h.field_name] });
      }),
    );
    if (!hits.length) return [];

    // Show each record under its own title, not the fragment that matched.
    const titleFields = [...new Set(['name', 'display_name', 'title', ...hits.map((h) => h.object.config?.title_field).filter(Boolean)])];
    const titleRows = await this.db.recordFieldValue.findMany({
      where:  { record_id: { in: hits.map((h) => h.record_id) }, field_name: { in: titleFields } },
      select: { record_id: true, field_name: true, str_value: true },
    });
    const titleOf = (h) => {
      const own = h.object.config?.title_field;
      const rows = titleRows.filter((r) => r.record_id === h.record_id && r.str_value);
      return (own && rows.find((r) => r.field_name === own)?.str_value) || rows[0]?.str_value || h.str_value || `${h.object.label} record`;
    };

    // Rank by how well the record's own title matches (exact, prefix, word
    // start, elsewhere), then shorter titles first — so the client "Vikash
    // Ramdhony" comes before "Vikash Ramdhony · Fund Holding".
    const ranked = hits.map((h) => {
      const title = titleOf(h);
      const t = title.toLowerCase();
      const score = t === q ? 0 : t.startsWith(q) ? 1 : t.split(/[^a-z0-9]+/).some((w) => w.startsWith(q)) ? 2 : t.includes(q) ? 3 : 4;
      return { h, title, score };
    }).sort((a, b) => a.score - b.score || a.title.length - b.title.length);

    return ranked.slice(0, limit).map(({ h, title }) => ({
      id:           h.record_id,
      record_id:    h.record_id,
      title,
      subtitle:     title.toLowerCase().includes(String(h.str_value ?? '').toLowerCase()) ? h.object.label : `${h.object.label} · ${h.label}: ${h.str_value}`,
      crm_type:     null,
      object_id:    h.object.id,
      object_label: h.object.label,
      module_id:    h.object.module?.id ?? null,
      module_label: h.object.module?.label ?? '',
    }));
  }
}

module.exports = SearchService;
