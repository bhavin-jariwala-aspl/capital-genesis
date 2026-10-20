'use strict';

const { NotFoundError, AuthorizationError, ValidationError } = require('../utils/errors');
const { Decimal } = require('@prisma/client/runtime/library');
const { ROLE_LEVEL, ADMIN_THRESHOLD, MANAGER_THRESHOLD } = require('../middleware/authenticate');
const { getTenantId } = require('../middleware/tenant-scope');
const { logger } = require('./logging.service');
const { leadScoreGrade } = require('../utils/lead-grade');
const { validateValues } = require('./validation-engine');
const { RecordCompute } = require('./record-compute');
const AccessScopeService = require('./access-scope.service');

// ── List-query bounds ─────────────────────────────────────────────────────────
// The record list and CSV export used to be fully unbounded findMany() calls,
// so a large object could load hundreds of thousands of rows into one response
// (latency, memory pressure, potential OOM/DoS). These caps bound the worst case
// while `getRecords` also accepts explicit limit/offset for real pagination.
const DEFAULT_PAGE_SIZE = 100;
const MAX_PAGE_SIZE     = 500;    // hard ceiling for an explicit paginated request
const LIST_SAFETY_CAP   = 5_000;  // DoS guard when a caller requests no explicit limit
const EXPORT_MAX_ROWS   = 50_000; // ceiling for a single CSV export

function _clampTake(value, fallback, max) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.min(Math.floor(n), max);
}

// Lead-score grade banding is shared with LeadScoringService via the
// ../utils/lead-grade single source of truth (tenant-overridable bands),
// imported above as leadScoreGrade.

// ── Field-storage maps ────────────────────────────────────────────────────────
// Where each object's field data lives (first-class CRM table vs typed EAV),
// the writable-column allowlists, and the form↔column alias maps. Shared with
// WorkflowEngineService so automations resolve fields exactly as the API does.
const {
  CRM_FIELDS,
  FIELD_ALIAS,
  REVERSE_ALIAS,
  MODEL_MAP,
  toTypedValue,
  fromTypedRow,
} = require('./crm-storage-map');

/**
 * RecordService — CRUD for UiRecord rows.
 * Records are thin anchors for activities, tasks, and audit_logs.
 * CRM field values are stored in the crm_* relational tables, not here.
 * Writes audit_logs on create / update / stage-change / delete.
 */
const { encrypt: encryptField, mask: maskValue } = require('./field-protection');
const { references } = require('./formula');

/** Which `Record` relation holds an object's first-class entity row. */
const ENTITY_RELATION = {
  lead: 'crm_lead', prospect: 'crm_lead', lead_intake: 'crm_lead_intake', contact: 'crm_contact',
  account: 'crm_account', opportunity: 'crm_opportunity', case: 'crm_case',
  product: 'product', email_template: 'email_template',
};

/** tenant:role → { ok, at } — whether a role may see personal data unmasked. */
const PII_CACHE = new Map();

/** object id → API name (see #objectName). */
const OBJECT_NAMES = new Map();

/** Highest auto-number handed out per sequence in this process (see #generateAutoNumbers). */
const ISSUED_AUTO_NUMBERS = new Map();

/** Roles' wide-visibility objects, cached briefly per tenant and role. */
const WIDE_SCOPE = new Map();

/** Per-object field defaults, cached briefly (metadata changes rarely). */
const FIELD_DEFAULTS = new Map();

/** object name → lookups on other objects whose formulas read through them (see #refreshChildren), cached briefly. */
const CHILD_READERS = new Map();

class RecordService {
  /**
   * @param {import('@prisma/client').PrismaClient} prisma
   * @param {import('./events.service').DomainEventBus|null} eventBus  Optional — domain-event backbone.
   *   RecordService is the *producer* of `record.*` domain events; the workflow engine and IntegrationService
   *   are independent subscribers. (This replaces the former direct workflow-engine dependency.)
   * @param {import('./permission.service')|null}  permService     Optional — enforces object-level edit access
   * @param {import('./assignment.service')|null}  assignService   Optional — auto-assigns new records
   * @param {import('./lead-scoring.service')|null} scoringService Optional — auto-scores new/updated leads
   */
  constructor(prisma, eventBus = null, permService = null, assignService = null, scoringService = null, accessScope = null) {
    this.db         = prisma;
    this.eventBus   = eventBus;
    this.perm       = permService;
    this.assignSvc  = assignService;
    this.scoringSvc = scoringService;
    // Per-key lock map for auto-number generation (RC-04).
    // Serialises concurrent createRecord calls for the same field so they
    // never compute the same next value.
    this.#autoNumLocks = new Map();
    // Formula fields + formula-language validation rules.
    this.compute = new RecordCompute(prisma, (id) => this.#loadData(id));
    // Business-unit scope + information barriers (layered on owner scope).
    this.scope = accessScope ?? new AccessScopeService(prisma);
  }

  /** The hydrated `data` map of a live record, or null. */
  async #loadData(recordId) {
    const rec = await this.db.record.findUnique({
      where:  { id: Number(recordId) },
      select: { id: true, object_id: true, deleted_at: true, object: { select: { name: true } } },
    });
    if (!rec || rec.deleted_at) return null;
    const hydrated = await this.#hydrateCrm(rec);
    return hydrated?.data ?? null;
  }

  /**
   * Recompute the formula fields of the records this one points at through
   * lookup fields, so a parent's roll-ups (SUM_RELATED / COUNT_RELATED) follow
   * a change in its children. One level up, written straight to the typed
   * field table without re-emitting events, so it cannot loop.
   */
  async #refreshParents(objectId, values, depth = 0) {
    try {
      const parentIds = await this.#parentIdsOf(objectId, values);
      await this.#refreshParentIds(objectId, parentIds, depth);
    } catch (err) {
      logger?.warn?.('[RecordService] parent formula refresh failed', { objectId, error: err.message });
    }
  }

  /** The record ids `values` points at through the object's lookup fields. */
  async #parentIdsOf(objectId, values) {
    const lookups = await this.db.uiField.findMany({
      where:  { object_id: Number(objectId), is_active: true, field_type: 'lookup' },
      select: { name: true },
    });
    return [...new Set(lookups.map((f) => Number(values?.[f.name])).filter((n) => Number.isInteger(n) && n > 0))];
  }

  async #refreshParentIds(objectId, parentIds, depth = 0) {
    try {
      // Bulk loads (vertical installs, imports) collect parents and recompute
      // them once at the end instead of once per child.
      if (this.deferredParents) { for (const pid of parentIds) this.deferredParents.add(pid); return; }
      const childName = parentIds.length ? await this.#objectName(objectId) : null;
      for (const pid of parentIds) {
        const parent = await this.db.record.findUnique({ where: { id: pid }, select: { id: true, object_id: true, deleted_at: true, tenant_id: true } });
        if (!parent || parent.deleted_at) continue;
        // Only the parent's roll-ups over this child (and the formulas built on
        // them) can change: a party has ~25 formulas, and recomputing all of them
        // for every address, consent or relationship saved made each save slow.
        const all = await this.compute.formulaFields(parent.object_id);
        const formulas = childName ? RecordService.formulasDependingOn(all, childName) : all;
        if (!formulas.length) continue;
        const data = { ...(await this.#loadData(pid)) };
        const changed = await this.#writeChangedFormulas(parent, data, formulas);
        // Roll-ups of roll-ups (household ← party ← holding) follow one more level.
        if (changed && depth < 2) await this.#refreshParents(parent.object_id, data, depth + 1);
        // …and the parent's other children that read the changed value (an approved
        // KYC case → the party's KYC status → each loan application's `party.kyc_status`).
        if (changed && depth === 0) await this.#refreshChildren(parent.object_id, pid);
      }
    } catch (err) {
      logger?.warn?.('[RecordService] parent formula refresh failed', { objectId, error: err.message });
    }
  }

  /**
   * The formulas of `formulas` that read records of `objectName` (a roll-up such
   * as COUNT_RELATED('consent_record', …) names the object as a quoted string),
   * plus every formula that reads one of those, transitively — in their order.
   */
  static formulasDependingOn(formulas, objectName) {
    const names = [`'${objectName}'`, `"${objectName}"`]; // object names are snake_case identifiers
    const hit = new Set(formulas.filter((f) => names.some((n) => String(f.config?.expression ?? '').includes(n))).map((f) => f.name));
    if (!hit.size) return [];
    const reads = new Map(formulas.map((f) => {
      try { return [f.name, references(String(f.config?.expression ?? ''))]; } catch { return [f.name, []]; }
    }));
    for (let grew = true; grew;) {
      grew = false;
      for (const f of formulas) {
        if (!hit.has(f.name) && reads.get(f.name).some((n) => hit.has(n))) { hit.add(f.name); grew = true; }
      }
    }
    return formulas.filter((f) => hit.has(f.name));
  }

  /**
   * Recompute the formulas of records that point at this one through a lookup
   * and read its fields (`party.kyc_status`, `party.date_of_birth`), so a child
   * follows a change on its parent instead of keeping the value it had when it
   * was last saved. One level down; writes only changed values, no events.
   */
  async #refreshChildren(objectId, recordId) {
    try {
      if (this.deferredParents || typeof this.db.recordFieldValue?.findMany !== 'function') return;
      const name = await this.#objectName(objectId);
      if (!name) return;
      const key = `${getTenantId() ?? ''}:${name}`;
      let readers = CHILD_READERS.get(key);
      if (!readers || readers.until < Date.now()) {
        const lookups = await this.db.uiField.findMany({
          where:  { is_active: true, field_type: 'lookup', config: { path: '$.target_object', equals: name } },
          select: { name: true, object_id: true },
        });
        const list = [];
        for (const lk of lookups) {
          const formulas = await this.compute.formulaFields(lk.object_id);
          const reads = new RegExp(`\\b${lk.name}\\.[A-Za-z_]`);
          if (formulas.some((f) => reads.test(String(f.config?.expression ?? '')))) list.push({ ...lk, formulas });
        }
        readers = { until: Date.now() + 60_000, list };
        CHILD_READERS.set(key, readers);
      }
      for (const lk of readers.list) {
        const formulas = lk.formulas;
        const rows = await this.db.recordFieldValue.findMany({
          where:  { field_name: lk.name, num_value: Number(recordId), record: { object_id: lk.object_id, deleted_at: null } },
          select: { record_id: true },
          take:   500,
        });
        for (const { record_id: childId } of rows) {
          const child = await this.db.record.findUnique({ where: { id: childId }, select: { id: true, object_id: true, tenant_id: true, deleted_at: true } });
          if (!child || child.deleted_at) continue;
          const data = { ...(await this.#loadData(childId)) };
          const changed = await this.#writeChangedFormulas(child, data, formulas);
          if (changed) await this.#refreshParents(child.object_id, data, 2);
        }
      }
    } catch (err) {
      logger?.warn?.('[RecordService] child formula refresh failed', { objectId, error: err.message });
    }
  }

  /** Recompute a record's formulas and write only the values that changed. Returns whether any did. */
  async #writeChangedFormulas(rec, data, formulas) {
    const before = { ...data };
    const names = await this.compute.applyFormulas(rec.object_id, data, rec.id, formulas);
    const changed = names.filter((n) => String(before[n] ?? '') !== String(data[n] ?? ''));
    if (changed.length) {
      await this.#upsertCustomFieldValues(rec.id, Object.fromEntries(changed.map((n) => [n, data[n]])), rec.object_id, rec.tenant_id);
      // A derived value moved without its record being saved (a pledge revalued →
      // the loan's LTV). Published under its own name so only the workflows that
      // opt in (`trigger_config.derived`) react — never webhooks or SLA clocks.
      if (this.eventBus && !this.deferredParents) {
        const row = await this.db.record.findUnique({
          where:  { id: Number(rec.id) },
          select: { id: true, object_id: true, tenant_id: true, assigned_to: true, created_by: true, pipeline_stage_id: true },
        }).catch(() => null);
        const diff = Object.fromEntries(changed.map((n) => [n, { old: before[n] ?? null, new: data[n] ?? null }]));
        this.#emit('record.derived_changed', { objectId: rec.object_id, record: row ?? rec, changed: diff, actorId: null });
      }
    }
    return changed.length > 0;
  }

  /** Start collecting parent refreshes instead of running them (bulk loads). */
  deferParentRefresh() {
    this.deferredParents = new Set();
  }

  /** Stop deferring; returns the parent record ids that were collected. */
  takeDeferredParents() {
    const ids = this.deferredParents ? [...this.deferredParents] : [];
    this.deferredParents = null;
    return ids;
  }

  // In-process lock map: key = "<tenantId>:<objectId>:<fieldName>"
  #autoNumLocks;

  /** Serialise access to a shared auto-number key within this process. */
  async #withAutoNumLock(key, fn) {
    while (this.#autoNumLocks.has(key)) {
      await this.#autoNumLocks.get(key);
    }
    let resolve;
    const p = new Promise(r => { resolve = r; });
    this.#autoNumLocks.set(key, p);
    try {
      return await fn();
    } finally {
      this.#autoNumLocks.delete(key);
      resolve();
    }
  }

  /**
   * Verify the viewer's role has can_edit=true on the parent object.
   * Skipped when no PermissionService is injected (e.g. in unit tests).
   */
  async #assertObjectEditPermission(objectId, viewer) {
    if (!this.perm || !viewer) return;
    const p = await this.perm.getEffectiveUiPermission('object', Number(objectId), viewer.role, viewer.tenant_id);
    if (!p.can_edit) {
      throw new AuthorizationError(
        `Your role (${viewer.role}) does not have edit permission on this object`,
      );
    }
  }

  /**
   * Fire-and-forget lead scoring. When a raw Lead (`lead_intake`) record is
   * created or updated, (re)run the LeadScoringService against its
   * CrmLeadIntake so the LeadScore table stays current. Scoring targets Leads
   * (not Prospects) — it prioritizes which inbound lead to qualify next. No-op
   * when scoring isn't wired, the object isn't `lead_intake`, or the CRM entity
   * hasn't been persisted yet.
   */
  async #maybeScoreLead(recordId, objectId, tenantId) {
    if (!this.scoringSvc) return;
    try {
      const obj = await this.db.uiObject.findUnique({
        where: { id: Number(objectId) }, select: { name: true },
      });
      if (!obj || obj.name !== 'lead_intake') return;

      const intake = await this.db.crmLeadIntake.findUnique({
        where: { record_id: Number(recordId) }, select: { id: true },
      });
      if (!intake) return;

      await this.scoringSvc.scoreLeadIntake(intake.id, tenantId, true);
    } catch (err) {
      logger?.warn?.('[RecordService] lead auto-scoring failed', {
        recordId, objectId, error: err.message,
      });
    }
  }

  // ── Internal helpers ────────────────────────────────────────────────────

  #audit(recordId, employeeId, action, changes = null, tenantId = null) {
    if (!employeeId) return Promise.resolve();
    const tid = tenantId || getTenantId();
    return this.db.auditLog.create({
      data: {
        record_id: recordId == null ? null : Number(recordId),
        employee_id: String(employeeId),
        action,
        changes,
        ...(tid ? { tenant_id: tid } : {}),
      },
    }).catch((err) => {
      logger?.warn?.('[RecordService] Audit log write failed', { recordId, action, error: err.message });
    });
  }

  /**
   * Write one audit row per record for a bulk action — a single createMany so a
   * large bulk operation stays cheap. Fire-and-forget (never blocks the caller).
   * `rows` = [{ record_id, changes }].
   */
  #auditBulk(rows, employeeId, action, tenantId = null) {
    if (!employeeId || !rows.length) return Promise.resolve();
    const tid = tenantId || getTenantId();
    return this.db.auditLog.createMany({
      data: rows.map(r => ({
        record_id: r.record_id == null ? null : Number(r.record_id),
        employee_id: String(employeeId),
        action,
        changes: r.changes ?? null,
        ...(tid ? { tenant_id: tid } : {}),
      })),
    }).catch((err) => {
      logger?.warn?.('[RecordService] Bulk audit write failed', { action, count: rows.length, error: err.message });
    });
  }

  // Strip internal columns before exposing CRM fields as the `data` envelope.
  // Also applies reverse aliases so DB column names are exposed as the form
  // field names the frontend expects (e.g. birthdate → date_of_birth).
  static #stripCrmMeta(entity, objectName = null) {
    if (!entity) return null;
    const {
      id: _id, record_id: _rid, owner_id: _oid,
      created_by: _cb, created_at: _ca, updated_at: _ua,
      external_id: _ext,
      ...fields
    } = entity;
    // Convert Decimal to plain number for JSON serialisation
    for (const [k, v] of Object.entries(fields)) {
      if (v instanceof Decimal) fields[k] = Number(v);
    }
    // Apply reverse aliases: expose DB column under the form field name
    const reverseMap = objectName ? (REVERSE_ALIAS[objectName] ?? {}) : {};
    for (const [dbCol, formName] of Object.entries(reverseMap)) {
      if (dbCol in fields) {
        fields[formName] = fields[dbCol];
      }
    }
    return fields;
  }

  /** An object's API name, memoised per process (ids never change name). */
  async #objectName(objectId) {
    if (objectId == null) return null;
    const key = Number(objectId);
    if (OBJECT_NAMES.has(key)) return OBJECT_NAMES.get(key);
    if (typeof this.db.uiObject?.findUnique !== 'function') return null;
    const row = await this.db.uiObject.findUnique({ where: { id: key }, select: { name: true } }).catch(() => null);
    if (row?.name) OBJECT_NAMES.set(key, row.name);
    return row?.name ?? null;
  }

  // Hydrate a single record: attach CRM entity fields as `data`.
  // Merges EAV custom fields with CRM entity data (non-null CRM wins),
  // consistent with #hydrateMany behavior.
  async #hydrateCrm(record) {
    // Include only the entity relation this object can have. Each included
    // relation is a separate query, so including all eight for every record
    // (the old behaviour) cost seconds per read against a remote database,
    // and a custom object never has any of them.
    const objectName = record.object?.name ?? await this.#objectName(record.object_id);
    const relation = objectName == null ? null : ENTITY_RELATION[objectName];
    const include = objectName == null
      ? Object.fromEntries(Object.values(ENTITY_RELATION).map((r) => [r, true]))
      : (relation ? { [relation]: true } : undefined);
    // Always load EAV fields — forms may use a mix of CRM + custom fields
    const [full, eavRows] = await Promise.all([
      this.db.record.findUnique({ where: { id: record.id }, ...(include ? { include } : {}) }),
      this.db.recordFieldValue.findMany({ where: { record_id: record.id } }),
    ]);
    if (!full) return record;
    const eav = Object.fromEntries(
      eavRows.map(r => [r.field_name, RecordService.#readTypedValue(r)]),
    );

    const entity = full.crm_lead ?? full.crm_lead_intake ?? full.crm_contact ?? full.crm_account
                ?? full.crm_opportunity ?? full.crm_case ?? full.product
                ?? full.email_template;
    if (entity) {
      // Determine object name for reverse alias mapping
      const objName = full.crm_lead ? (record.object?.name === 'prospect' ? 'prospect' : 'lead')
        : full.crm_lead_intake ? 'lead_intake'
        : full.crm_contact ? 'contact'
        : full.crm_account ? 'account'
        : full.crm_opportunity ? 'opportunity'
        : full.crm_case ? 'case'
        : null;
      const crm = RecordService.#stripCrmMeta(entity, objName) ?? {};
      // Non-null CRM fields take precedence over EAV
      const crmNonNull = {};
      for (const [k, v] of Object.entries(crm)) {
        if (v != null && v !== '') crmNonNull[k] = v;
      }
      return { ...record, data: { ...eav, ...crmNonNull } };
    }
    // No first-class CRM entity — return EAV data only
    return { ...record, data: eav };
  }

  // Batch hydrate a list of records — 5 parallel queries instead of N × 5.
  // Records that have no CRM entity are covered by the EAV query.
  async #hydrateMany(records) {
    if (!records.length) return records;
    const ids = records.map(r => r.id);
    
    // Core CRM entities that are always present
    const coreQueries = [
      this.db.crmLead.findMany({ where: { record_id: { in: ids } } }),
      this.db.crmContact.findMany({ where: { record_id: { in: ids } } }),
      this.db.crmAccount.findMany({ where: { record_id: { in: ids } } }),
      this.db.crmOpportunity.findMany({ where: { record_id: { in: ids } } }),
      this.db.crmCase.findMany({ where: { record_id: { in: ids } } }),
      this.db.recordFieldValue.findMany({ where: { record_id: { in: ids } } }),
    ];
    
    // Optional entities that may not exist in all environments
    const optionalQueries = [];
    if (this.db.product?.findMany) {
      optionalQueries.push(this.db.product.findMany({ where: { record_id: { in: ids } } }));
    } else {
      optionalQueries.push(Promise.resolve([]));
    }
    if (this.db.emailTemplate?.findMany) {
      optionalQueries.push(this.db.emailTemplate.findMany({ where: { record_id: { in: ids } } }));
    } else {
      optionalQueries.push(Promise.resolve([]));
    }
    if (this.db.crmLeadIntake?.findMany) {
      optionalQueries.push(this.db.crmLeadIntake.findMany({ where: { record_id: { in: ids } } }));
    } else {
      optionalQueries.push(Promise.resolve([]));
    }

    const [leads, contacts, accounts, opportunities, cases, eavRows, products, emailTemplates, leadIntakes] = await Promise.all([
      ...coreQueries,
      ...optionalQueries,
    ]);
    const crmByRecordId = new Map();
    const entitySets = [
      [leads, 'lead'], [contacts, 'contact'], [accounts, 'account'],
      [opportunities, 'opportunity'], [cases, 'case'],
      [leadIntakes, 'lead_intake'],
      [products, null], [emailTemplates, null],
    ];
    for (const [entityList, objName] of entitySets) {
      for (const entity of entityList) {
        if (!crmByRecordId.has(entity.record_id)) {
          crmByRecordId.set(entity.record_id, RecordService.#stripCrmMeta(entity, objName));
        }
      }
    }
    // Build typed EAV data map for records without a first-class CRM entity
    const eavByRecordId = new Map();
    for (const row of eavRows) {
      if (!eavByRecordId.has(row.record_id)) eavByRecordId.set(row.record_id, {});
      eavByRecordId.get(row.record_id)[row.field_name] = RecordService.#readTypedValue(row);
    }
    // Merge CRM denormalized fields with EAV fields so that:
    //  - EAV fields provide the base (custom-field values)
    //  - CRM canonical fields take precedence ONLY when non-null
    // This ensures records with a first-class CRM entity ALSO surface any
    // additional form-saved EAV fields (e.g. date_of_birth, occupation)
    // without null CRM columns wiping out valid EAV data.
    return records.map(r => {
      const eav = eavByRecordId.get(r.id) ?? {};
      const crm = crmByRecordId.get(r.id) ?? {};
      // Only apply CRM fields that have actual values (non-null, non-empty)
      const crmNonNull = {};
      for (const [k, v] of Object.entries(crm)) {
        if (v != null && v !== '') crmNonNull[k] = v;
      }
      return { ...r, data: { ...eav, ...crmNonNull } };
    });
  }

  // Upsert CRM entity fields for a record.
  // Determines the target crm_* table from the object's name.
  // For non-CRM / custom objects, routes to EAV field-value storage.
  /**
   * Enforce the object's field rules on a submitted value map.
   *
   * Loads the active fields (with their `UiValidation` rows) and runs the shared
   * validation engine; auto-number fields are exempt because the server fills
   * them in. `unique` rules and `is_unique` fields are then checked against the
   * database for objects stored in the typed field-value table or a CRM table.
   * Throws a `ValidationError` whose `details` lists every failing field so the
   * form can show them inline; mis-configured rules are logged, not enforced.
   */
  async #assertValid(objectId, values, { partial, recordId, merged = null }) {
    let fields;
    try {
      fields = await this.db.uiField.findMany({
        where:   { object_id: Number(objectId), is_active: true },
        include: { validations: { orderBy: { order_index: 'asc' } } },
      });
    } catch (err) {
      logger?.warn?.('[RecordService] validation field load failed — skipping', { objectId, error: err.message });
      return;
    }
    if (!fields?.length) return;

    // Server-filled fields are exempt. `config.auto_number` counts as well as the
    // auto_number type: a required text field carrying an auto_number config is
    // only filled by #generateAutoNumbers, which runs after this check.
    const checkable = fields.filter((f) => f.field_type !== 'auto_number' && !f.config?.auto_number
      && f.field_type !== 'formula' && !f.config?.computed);
    const { errors, warnings } = validateValues(checkable, values, { partial });
    // Formula-language rules see the whole record (stored values plus this
    // submission), since they usually relate several fields.
    if (checkable.some((f) => (f.validations ?? []).some((v) => v.validation_type === 'expression'))) {
      const all = typeof merged === 'function' ? await merged() : (merged ?? values);
      const expr = await this.compute.expressionErrors(checkable, all, recordId);
      for (const e of expr.errors) if (!errors.some((x) => x.field === e.field)) errors.push(e);
      warnings.push(...expr.warnings);
    }
    for (const w of warnings) logger?.warn?.(`[RecordService] validation rule ignored: ${w}`, { objectId });

    // Uniqueness — needs the database, so it lives here rather than in the engine.
    const uniqueFields = checkable.filter((f) =>
      (f.is_unique || (f.validations ?? []).some((v) => v.validation_type === 'unique'))
      && Object.prototype.hasOwnProperty.call(values, f.name)
      && values[f.name] !== null && values[f.name] !== undefined && values[f.name] !== '');
    if (uniqueFields.length) {
      const obj = await this.db.uiObject.findUnique({ where: { id: Number(objectId) }, select: { name: true } }).catch(() => null);
      for (const f of uniqueFields) {
        if (errors.some((e) => e.field === f.name)) continue;
        const dup = await this.#hasDuplicate(obj?.name, Number(objectId), f, values[f.name], recordId);
        if (dup) {
          const rule = (f.validations ?? []).find((v) => v.validation_type === 'unique');
          errors.push({ field: f.name, message: rule?.error_message || `${f.label || f.name} must be unique — another record already has this value` });
        }
      }
    }

    if (errors.length) {
      const err = new ValidationError(errors.length === 1 ? errors[0].message : `${errors.length} fields need attention`);
      err.details = errors;
      throw err;
    }
  }

  /** Does another live record of this object already hold `value` in field `f`? */
  async #hasDuplicate(objectName, objectId, f, value, excludeRecordId) {
    try {
      const crmModel = objectName && CRM_FIELDS[objectName] ? MODEL_MAP[objectName] : null;
      const column = crmModel ? (FIELD_ALIAS[objectName]?.[f.name] ?? f.name) : null;
      if (crmModel && CRM_FIELDS[objectName].has(column) && this.db[crmModel]?.findFirst) {
        const row = await this.db[crmModel].findFirst({
          where: {
            [column]: value,
            ...(excludeRecordId ? { record_id: { not: excludeRecordId } } : {}),
          },
          select: { id: true },
        });
        return !!row;
      }
      if (!this.db.recordFieldValue?.findFirst) return false;
      const typed = RecordService._typedValuePublic(value, f.data_type ?? 'string');
      const valueWhere = Object.fromEntries(Object.entries(typed).filter(([, v]) => v !== null && v !== undefined));
      if (!Object.keys(valueWhere).length) return false;
      const row = await this.db.recordFieldValue.findFirst({
        where: {
          field_name: f.name,
          ...valueWhere,
          record: { object_id: objectId, deleted_at: null },
          ...(excludeRecordId ? { record_id: { not: excludeRecordId } } : {}),
        },
        select: { id: true },
      });
      return !!row;
    } catch (err) {
      logger?.warn?.('[RecordService] uniqueness check failed — allowing write', { field: f.name, error: err.message });
      return false;
    }
  }

  async #upsertCrmEntity(recordId, objectId, crmData, tenantId = null) {
    if (!crmData || !Object.keys(crmData).length) {
      logger?.warn?.('[RecordService] #upsertCrmEntity: no crmData', { recordId, objectId });
      return;
    }
    const obj = await this.db.uiObject.findUnique({
      where: { id: Number(objectId) }, select: { name: true },
    });
    if (!obj) {
      logger?.warn?.('[RecordService] #upsertCrmEntity: object not found', { objectId });
      return;
    }

    const allowedFields = CRM_FIELDS[obj.name];
    if (!allowedFields) {
      // Non-CRM custom object — persist field values in the typed EAV table.
      return this.#upsertCustomFieldValues(recordId, crmData, objectId, tenantId);
    }

    const model = MODEL_MAP[obj.name];
    if (!model) return;

    // Apply canonical aliases: translate legacy/form field names to DB column names
    const aliases = FIELD_ALIAS[obj.name] ?? {};

    // Filter to allowed DB fields; apply aliases; coerce special types.
    const safeData = {};
    for (const [k, v] of Object.entries(crmData)) {
      const dbKey = aliases[k] ?? k; // translate alias if present
      if (!allowedFields.has(dbKey) || v === undefined) continue;
      if ((dbKey === 'annual_revenue' || dbKey === 'amount') && v !== null) {
        safeData[dbKey] = new Decimal(v);
      } else if (dbKey === 'employee_count' && v !== null) {
        safeData[dbKey] = Number(v);
      } else if (dbKey === 'probability' && v !== null) {
        safeData[dbKey] = Number(v);
      } else if (dbKey === 'close_date' && v) {
        const d = new Date(v);
        if (!isNaN(d.getTime())) safeData[dbKey] = d;
      } else if (dbKey === 'birthdate' && v) {
        const d = new Date(v);
        if (!isNaN(d.getTime())) safeData[dbKey] = d;
      } else {
        safeData[dbKey] = v;
      }
    }
    // Collect overflow fields (not in CRM allowlist) for EAV storage.
    // Must be computed BEFORE the early return so non-CRM fields are never lost.
    const overflowData = {};
    for (const [k, v] of Object.entries(crmData)) {
      const dbKey = aliases[k] ?? k;
      if (!allowedFields.has(dbKey) && v !== undefined) overflowData[k] = v;
    }

    // If no CRM-writable fields, skip the CRM upsert but still persist overflow to EAV.
    if (!Object.keys(safeData).length) {
      if (Object.keys(overflowData).length) {
        await this.#upsertCustomFieldValues(recordId, overflowData, objectId, tenantId);
      }
      return;
    }

    // Save CRM entity + overflow fields to EAV in parallel
    // Use upsert to atomically handle the create-or-update: replaces the
    // non-atomic findUnique → conditional create/update pattern (RC-03).
    await Promise.all([
      this.db[model].upsert({
        where:  { record_id: Number(recordId) },
        create: { ...safeData, record_id: Number(recordId), ...(tenantId ? { tenant_id: tenantId } : {}) },
        update: safeData,
      }),
      Object.keys(overflowData).length
        ? this.#upsertCustomFieldValues(recordId, overflowData, objectId, tenantId)
        : null,
    ]);
  }

  // ── Auto-number generation ───────────────────────────────────────────────

  /**
   * For any field with config.auto_number, generate the next sequential value
   * and inject it into crmData (mutates in place). Skips if a value is already provided.
   */
  async #generateAutoNumbers(objectId, crmData, tenantId) {
    const fields = await this.db.uiField.findMany({
      where: { object_id: Number(objectId), is_active: true },
      select: { name: true, config: true },
    });
    let issued = 0;
    for (const field of fields) {
      const autoNum = field.config?.auto_number;
      if (!autoNum || crmData[field.name]) continue;

      const prefix = autoNum.prefix || '';
      const year = new Date().getFullYear();
      const searchPrefix = `${prefix}${year}-`;
      // Width from the format's trailing N run (YYYY-NNNNNN → 6), minimum 3.
      // Fixed width keeps the string ordering below numeric: with unpadded
      // growth, "…-1000" sorted below "…-999" and numbers were reissued.
      const width = Math.max(3, (/(N+)\s*$/.exec(String(autoNum.format ?? '')) ?? [, 'NNN'])[1].length);

      // Serialise concurrent auto-number generation for this field (RC-04).
      // The lock ensures only one request reads the current max and writes
      // the next value at a time within this process.
      const lockKey = `${tenantId ?? 0}:${objectId}:${field.name}`;
      await this.#withAutoNumLock(lockKey, async () => {
        // Scoped to this object: two objects with a same-named field used to
        // share (and collide on) one sequence.
        const where = { field_name: field.name, str_value: { startsWith: searchPrefix }, record: { object_id: Number(objectId) } };
        if (tenantId) where.tenant_id = tenantId;
        const last = await this.db.recordFieldValue.findFirst({
          where,
          orderBy: { str_value: 'desc' },
          select:  { str_value: true },
        });

        let nextNum = 1;
        if (last?.str_value) {
          const match = last.str_value.match(/-(\d+)$/);
          if (match) nextNum = parseInt(match[1], 10) + 1;
        }
        // The number is only persisted later in the create, so a concurrent
        // create in this process could read the same max. Never reissue a
        // number this process has already handed out for the sequence.
        const seqKey = `${lockKey}:${searchPrefix}`;
        nextNum = Math.max(nextNum, (ISSUED_AUTO_NUMBERS.get(seqKey) ?? 0) + 1);
        ISSUED_AUTO_NUMBERS.set(seqKey, nextNum);
        crmData[field.name] = `${searchPrefix}${String(nextNum).padStart(width, '0')}`;
      });
      issued += 1;
    }
    return issued;
  }

  // ── Custom object (typed EAV) helpers ────────────────────────────────────

  /**
   * Resolve the UiField.data_type for each field in a custom object.
   * Returns a Map<fieldName, data_type> for quick lookup.
   * Falls back to 'string' for any field not found in metadata.
   */
  async #getFieldTypeMap(objectId) {
    const fields = await this.db.uiField.findMany({
      where:  { object_id: Number(objectId), is_active: true },
      select: { name: true, data_type: true, config: true },
    });
    const map = new Map(fields.map(f => [f.name, f.data_type ?? 'string']));
    // Fields stored encrypted (personal data, PRD E-16) — see field-protection.
    map.encrypted = new Set(fields.filter((f) => f.config?.encrypt).map((f) => f.name));
    return map;
  }

  /** Typed column values for one field, encrypting it when configured to. */
  static #storedValue(typeMap, fieldName, value) {
    if (typeMap.encrypted?.has(fieldName) && value != null && value !== '') {
      return { str_value: encryptField(String(value)) };
    }
    return RecordService._typedValuePublic(value, typeMap.get(fieldName) ?? 'string');
  }

  /**
   * Map a raw value to the correct typed column object.
   * str_value is ALWAYS populated as a reliable fallback for backward compat.
   */
  static #typedValue(value, dataType) {
    return RecordService._typedValuePublic(value, dataType);
  }

  /**
   * Public alias of #typedValue for use by ImportService and other services
   * that need to write typed EAV rows without instantiating RecordService.
   */
  static _typedValuePublic(value, dataType) {
    return toTypedValue(value, dataType);
  }

  /**
   * Reconstruct the canonical JS value for a RecordFieldValue row.
   * Prefers the most specific typed column; falls back to str_value.
   */
  static #readTypedValue(row) {
    return fromTypedRow(row);
  }

  // Persist field values for a custom / non-CRM object via the typed EAV table.
  // One row per field.  Each upsert is individually atomic at the DB level,
  // so no wrapping transaction is needed — avoids both timeout and deadlock
  // issues that occur with sequential-in-transaction or delete+createMany.
  // Processes in chunks of 5 to avoid exhausting the connection pool.
  async #upsertCustomFieldValues(recordId, fieldData, objectId = null, tenantId = null) {
    if (!fieldData || !Object.keys(fieldData).length) return;
    const typeMap = objectId
      ? await this.#getFieldTypeMap(objectId)
      : new Map();

    const rid = Number(recordId);
    let entries = Object.entries(fieldData);
    const CHUNK = 5;

    // Fields the record does not have yet are inserted in one statement; only
    // existing ones are updated row by row. A new record therefore costs two
    // round trips instead of one upsert (select + write) per field.
    const rfv = this.db.recordFieldValue;
    if (typeof rfv.createMany === 'function' && typeof rfv.findMany === 'function') {
      const present = new Set((await rfv.findMany({ where: { record_id: rid }, select: { field_name: true } }) ?? []).map((r) => r.field_name));
      const fresh = entries.filter(([name]) => !present.has(name));
      if (fresh.length) {
        await rfv.createMany({
          data: fresh.map(([fieldName, value]) => ({
            record_id: rid, field_name: fieldName,
            ...RecordService.#storedValue(typeMap, fieldName, value),
            ...(tenantId ? { tenant_id: tenantId } : {}),
          })),
          skipDuplicates: true,
        });
        entries = entries.filter(([name]) => present.has(name));
      }
    }

    for (let i = 0; i < entries.length; i += CHUNK) {
      const batch = entries.slice(i, i + CHUNK);
      await Promise.all(batch.map(([fieldName, value]) => {
        const typed    = RecordService.#storedValue(typeMap, fieldName, value);
        const createData = { record_id: rid, field_name: fieldName, ...typed };
        if (tenantId) createData.tenant_id = tenantId;
        return this.db.recordFieldValue.upsert({
          where:  { record_id_field_name: { record_id: rid, field_name: fieldName } },
          create: createData,
          update: typed,
        });
      }));
    }
  }

  // Read EAV rows for a single custom-object record → reconstruct as `data`.
  async #hydrateCustom(record) {
    const rows = await this.db.recordFieldValue.findMany({
      where: { record_id: record.id },
    });
    const data = Object.fromEntries(
      rows.map(r => [r.field_name, RecordService.#readTypedValue(r)]),
    );
    return { ...record, data };
  }

  /**
   * Build a Prisma `where` filter restricting records to what the viewer may see.
   *   super_admin / admin  → all records (no filter)
   *   manager              → own records + all direct/indirect reports' records
   *   user                 → own records only
   */
  async #ownerFilter(viewer) {
    if (!viewer) return {};
    const scopeWhere = this.scope.whereFor(await this.scope.forViewer(viewer));
    return { ...(await this.#ownerOnlyFilter(viewer)), ...scopeWhere };
  }

  /** The owner / hierarchy part of #ownerFilter, before unit and barrier scope. */
  async #ownerOnlyFilter(viewer) {
    const { role, employee_id } = viewer;
    const level = viewer.role_level ?? ROLE_LEVEL[role] ?? Number.POSITIVE_INFINITY; // unknown level = least privilege, never admin
    if (level <= ADMIN_THRESHOLD) return {};
    let own;
    if (level <= MANAGER_THRESHOLD) {
      // Managers: records their team created or owns.
      const ids = await this.#teamIds(employee_id);
      own = [{ created_by: { in: ids } }, { assigned_to: { in: ids } }];
    } else {
      // user — own records + records explicitly assigned to them
      own = [{ created_by: employee_id }, { assigned_to: employee_id }];
    }
    // Objects whose permission gives this role every record (back-office desks).
    const wide = await this.#wideObjectIds(role);
    return { OR: [...own, ...(wide.length ? [{ object_id: { in: wide } }] : [])] };
  }

  async #teamIds(employeeId) {
    const rows = await this.db.employeeHierarchy.findMany({
      where:  { ancestor_id: employeeId, depth: { gt: 0 } },
      select: { descendant_id: true },
    });
    return [employeeId, ...rows.map((r) => r.descendant_id)];
  }

  /** Object ids where the role's object permission has view_scope 'all' (cached briefly). */
  async #wideObjectIds(role) {
    const key = `${getTenantId() ?? ''}|${role}`;
    const hit = WIDE_SCOPE.get(key);
    if (hit && hit.until > Date.now()) return hit.ids;
    if (!this.db.uiPermission?.findMany) return [];
    const rows = await this.db.uiPermission.findMany({
      where: { entity_type: 'object', role_name: String(role ?? ''), view_scope: 'all', can_view: true },
      select: { entity_id: true },
    }).catch(() => []);
    const ids = rows.map((r) => r.entity_id);
    WIDE_SCOPE.set(key, { until: Date.now() + 30_000, ids });
    return ids;
  }

  /**
   * Re-evaluate a record's formula fields (and its parents' roll-ups) after
   * something other than this service changed it — a workflow action, an
   * update_related step. Writes straight to the typed field table; no events.
   */
  async recompute(recordId, { propagate = false } = {}) {
    const rec = await this.db.record.findUnique({ where: { id: Number(recordId) }, select: { id: true, object_id: true, tenant_id: true, deleted_at: true } });
    if (!rec || rec.deleted_at) return;
    const formulas = await this.compute.formulaFields(rec.object_id).catch(() => []);
    const data = { ...(await this.#loadData(rec.id)) };
    const changed = formulas.length ? await this.#writeChangedFormulas(rec, data, formulas) : false;
    // `propagate`: a stored (non-formula) value was written behind this service's
    // back — a workflow setting a status a parent's roll-up filters on, or a
    // restore from the Trash — so parents and readers follow even when none of
    // the record's own formulas moved.
    if (changed || propagate || !formulas.length) await this.#refreshParents(rec.object_id, data);
    if (changed || propagate) await this.#refreshChildren(rec.object_id, rec.id);
    return changed;
  }

  /** Throw unless the viewer may edit records of this object. */
  async assertCanEdit(objectId, viewer) {
    return this.#assertObjectEditPermission(objectId, viewer);
  }

  /** Public form of the viewer's record filter, for related lists / lookups / analytics. */
  async accessWhere(viewer) {
    return this.#ownerFilter(viewer);
  }

  /**
   * Verify the viewer is allowed to access a specific record.
   * Throws NotFoundError (not AuthorizationError) to avoid leaking record existence
   * to users who have no permission to see it.
   * Pass a pre-loaded record object to avoid an extra DB round-trip.
   */
  async #assertAccess(recordOrId, viewer) {
    if (!viewer) return;
    const { role, employee_id } = viewer;
    const level = viewer.role_level ?? ROLE_LEVEL[role] ?? Number.POSITIVE_INFINITY; // unknown level = least privilege, never admin

    const record = (recordOrId && typeof recordOrId === 'object')
      ? recordOrId
      : await this.db.record.findUnique({
          where:  { id: Number(recordOrId) },
          select: { id: true, object_id: true, created_by: true, assigned_to: true, business_unit_id: true, barrier_zone_id: true },
        });
    if (!record) throw new NotFoundError('Record');
    // Unit and barrier scope apply to every role (barriers bind admins too).
    if (!this.scope.canSee(await this.scope.forViewer(viewer), record)) throw new NotFoundError('Record');
    if (level <= ADMIN_THRESHOLD) return;
    if (record.object_id != null && (await this.#wideObjectIds(role)).includes(Number(record.object_id))) return;

    if (level <= MANAGER_THRESHOLD) {
      const allowed = new Set(await this.#teamIds(employee_id));
      if (!allowed.has(record.created_by) && !allowed.has(record.assigned_to)) throw new NotFoundError('Record');
      return;
    }

    // user — own or assigned records
    if (record.created_by !== employee_id && record.assigned_to !== employee_id) {
      throw new NotFoundError('Record');
    }
  }

  /**
   * From a list of record IDs return only those the viewer may access.
   * Used for bulk operations so users cannot affect records they don't own.
   */
  async #filterAccessibleIds(ids, viewer) {
    const ownerWhere = await this.#ownerFilter(viewer);
    const rows = await this.db.record.findMany({
      where:  { id: { in: ids }, deleted_at: null, ...ownerWhere },
      select: { id: true },
    });
    return rows.map(r => r.id);
  }

  // ── Queries ──────────────────────────────────────────────────────────────

  async getRecords(objectId, stageId, viewer, opts = {}) {
    const obj = await this.db.uiObject.findUnique({
      where: { id: Number(objectId) }, select: { name: true },
    });
    const ownerWhere = await this.#ownerFilter(viewer);
    // deleted_at: null → trashed (soft-deleted) records are never shown to users.
    const where = { object_id: Number(objectId), deleted_at: null, ...ownerWhere };
    if (stageId != null && stageId !== '') {
      const sid = Number(stageId);
      if (!Number.isNaN(sid)) where.pipeline_stage_id = sid;
    }
    // Bound the query. An explicit `limit` enables real server-side pagination
    // (capped at MAX_PAGE_SIZE); with no limit we still apply a safety cap so a
    // pathological object can't stream unbounded rows into one response.
    const hasExplicitLimit = opts.limit != null;
    const take = hasExplicitLimit
      ? _clampTake(opts.limit, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE)
      : LIST_SAFETY_CAP;
    const skip = Math.max(0, Number(opts.offset) || 0);
    const records = await this.db.record.findMany({
      where,
      orderBy: { created_at: 'desc' },
      include: { pipeline_stage: { select: { id: true, label: true, color: true, name: true } } },
      take,
      skip,
    });
    if (!hasExplicitLimit && records.length === LIST_SAFETY_CAP) {
      logger.warn(
        `getRecords hit LIST_SAFETY_CAP (${LIST_SAFETY_CAP}) for object ${objectId}; ` +
        'clients should paginate with limit/offset.',
      );
    }
    const hydrated = await this.#maskPii(Number(objectId), await this.#attachLookupLabels(Number(objectId), await this.#hydrateMany(records)), viewer);
    // Leads carry their scoring result inline (score + grade columns).
    if (obj?.name === 'lead_intake') return this.#attachLeadScores(hydrated);
    return hydrated;
  }

  async getRecord(id, viewer) {
    const record = await this.db.record.findUnique({
      where: { id: Number(id) },
      include: {
        pipeline_stage: { select: { id: true, label: true, color: true, name: true } },
        object: { select: { name: true } },
      },
    });
    if (!record || record.deleted_at) throw new NotFoundError('Record');
    await this.#assertAccess(record, viewer);
    await this.#auditView(record, viewer);
    const [hydrated] = await this.#maskPii(record.object_id, await this.#attachLookupLabels(record.object_id, [await this.#hydrateCrm(record)]), viewer);
    if (record.object?.name === 'lead_intake') {
      const [withScore] = await this.#attachLeadScores([hydrated]);
      return withScore;
    }
    return hydrated;
  }

  // ── Lookup (reference) fields ─────────────────────────────────────────────
  // A `lookup` field stores the id of a record of `config.target_object`. The
  // list/detail payloads carry `labels[field]` (the linked record's title) so
  // the UI never shows a bare id, and every lookup implies a related list on
  // the target record — no per-object code or page needed.

  /** Name of the field used as a record's title for an object. */
  async titleFieldFor(objectId) {
    const obj = await this.db.uiObject.findUnique({ where: { id: Number(objectId) }, select: { config: true } }).catch(() => null);
    if (obj?.config?.title_field) return obj.config.title_field;
    const fields = await this.db.uiField.findMany({
      where:   { object_id: Number(objectId), is_active: true },
      select:  { name: true, field_type: true },
      orderBy: { order_index: 'asc' },
    }).catch(() => []);
    const preferred = ['display_name', 'name', 'full_name', 'title', 'subject', 'code', 'reference'];
    for (const p of preferred) if (fields.some((f) => f.name === p)) return p;
    return fields.find((f) => ['text', 'auto_number', 'email'].includes(f.field_type))?.name ?? null;
  }

  /** id → title for records of one object (EAV-stored titles). */
  async #titlesFor(objectId, ids) {
    if (!ids.length) return new Map();
    const titleField = await this.titleFieldFor(objectId);
    if (!titleField) return new Map();
    const rows = await this.db.recordFieldValue.findMany({
      where:  { record_id: { in: ids }, field_name: titleField },
      select: { record_id: true, str_value: true },
    });
    return new Map(rows.map((r) => [r.record_id, r.str_value]));
  }

  /** Lookup fields of an object with their resolved target object id. */
  async #lookupFields(objectId) {
    if (typeof this.db.uiField?.findMany !== 'function') return [];
    const fields = await this.db.uiField.findMany({
      where:  { object_id: Number(objectId), is_active: true, field_type: 'lookup' },
      select: { name: true, config: true },
    }).catch(() => []);
    if (!fields?.length) return [];
    const names = [...new Set(fields.map((f) => f.config?.target_object).filter(Boolean))];
    const targets = await this.db.uiObject.findMany({ where: { name: { in: names } }, select: { id: true, name: true } });
    const idByName = new Map(targets.map((t) => [t.name, t.id]));
    return fields
      .map((f) => ({ name: f.name, targetObjectId: idByName.get(f.config?.target_object) ?? null }))
      .filter((f) => f.targetObjectId);
  }

  /**
   * Text fields that hold a staff member's employee id (`config.employee`):
   * the payload carries the person's name in `labels[field]`, so lists and the
   * record panel never show a bare id such as "GCRM1".
   */
  async #employeeFields(objectId) {
    if (typeof this.db.uiField?.findMany !== 'function') return [];
    const fields = await this.db.uiField.findMany({
      where:  { object_id: Number(objectId), is_active: true, field_type: { not: 'lookup' } },
      select: { name: true, config: true },
    }).catch(() => []);
    return (fields ?? []).filter((f) => f.config?.employee).map((f) => f.name);
  }

  async #employeeNames(ids) {
    if (!ids.length || typeof this.db.employee?.findMany !== 'function') return new Map();
    const rows = await this.db.employee.findMany({ where: { employee_id: { in: ids } }, select: { employee_id: true, employee_name: true } }).catch(() => []);
    return new Map((rows ?? []).filter((e) => e.employee_name).map((e) => [e.employee_id, e.employee_name]));
  }

  async #attachLookupLabels(objectId, records) {
    if (!records.length) return records;
    const [lookups, staffFields] = await Promise.all([this.#lookupFields(objectId), this.#employeeFields(objectId)]);
    if (!lookups.length && !staffFields.length) return records;
    const labelsByField = new Map();
    for (const lf of lookups) {
      const ids = [...new Set(records.map((r) => Number(r.data?.[lf.name])).filter((n) => Number.isInteger(n) && n > 0))];
      labelsByField.set(lf.name, await this.#titlesFor(lf.targetObjectId, ids));
    }
    const staffIds = [...new Set(records.flatMap((r) => staffFields.map((f) => r.data?.[f])).filter((v) => typeof v === 'string' && v))];
    const names = await this.#employeeNames(staffIds);
    return records.map((r) => {
      const labels = {};
      for (const [field, titles] of labelsByField) {
        const id = Number(r.data?.[field]);
        if (Number.isInteger(id) && id > 0) labels[field] = titles.get(id) ?? `#${id}`;
      }
      for (const f of staffFields) {
        const name = names.get(r.data?.[f]);
        if (name) labels[f] = name;
      }
      return Object.keys(labels).length ? { ...r, labels: { ...(r.labels ?? {}), ...labels } } : r;
    });
  }

  /**
   * Records of an object for a lookup picker, filtered by title and scoped to
   * what the viewer may see. `q` empty → the most recent records.
   */
  async searchLookup(objectId, q, viewer, limit = 20, id = null) {
    const titleField = await this.titleFieldFor(objectId);
    const access = await this.#ownerFilter(viewer);
    const take = Math.min(Math.max(Number(limit) || 20, 1), 50);
    let ids;
    if (id) {
      // Resolve one known id (a form re-opening a saved lookup value).
      const row = await this.db.record.findFirst({ where: { id: Number(id), object_id: Number(objectId), deleted_at: null, ...access }, select: { id: true } });
      ids = row ? [row.id] : [];
    } else if (q && titleField) {
      const rows = await this.db.recordFieldValue.findMany({
        where:  { field_name: titleField, str_value: { contains: String(q) }, record: { object_id: Number(objectId), deleted_at: null, ...access } },
        select: { record_id: true },
        take,
      });
      ids = rows.map((r) => r.record_id);
    } else {
      const rows = await this.db.record.findMany({
        where:   { object_id: Number(objectId), deleted_at: null, ...access },
        select:  { id: true },
        orderBy: { created_at: 'desc' },
        take,
      });
      ids = rows.map((r) => r.id);
    }
    const titles = await this.#titlesFor(Number(objectId), ids);
    return ids.map((id) => ({ id, label: titles.get(id) ?? `#${id}` }));
  }

  /**
   * Every record that points at this one through a lookup field, grouped by
   * the object and field it came through — the record's related lists.
   */
  async relatedRecords(recordId, viewer, perRelation = 25) {
    const record = await this.db.record.findUnique({
      where:   { id: Number(recordId) },
      include: { object: { select: { name: true } } },
    });
    if (!record || record.deleted_at) throw new NotFoundError('Record');
    await this.#assertAccess(record, viewer);

    const incoming = await this.db.uiField.findMany({
      where:  { is_active: true, field_type: 'lookup', config: { path: '$.target_object', equals: record.object.name } },
      select: { name: true, label: true, object: { select: { id: true, name: true, label: true, plural_label: true, module_id: true, config: true } } },
    });
    const access = await this.#ownerFilter(viewer);
    const filtered = Object.keys(access).length > 0;
    const out = [];
    for (const f of incoming) {
      const where = {
        field_name: f.name,
        str_value:  String(record.id),
        record:     { object_id: f.object.id, deleted_at: null, ...access },
      };
      // Records hidden from this viewer (other business units, information
      // barriers) are counted so Client 360 can say "Restricted — contact
      // Compliance" instead of implying there are none (C360-FR-06). Objects
      // whose very existence is confidential (an STR: no tipping off) set
      // `config.conceal_existence` and are never counted.
      const conceal = Boolean(f.object.config?.conceal_existence);
      const [rows, total, all] = await Promise.all([
        this.db.recordFieldValue.findMany({ where, select: { record_id: true }, take: perRelation, orderBy: { record_id: 'desc' } }),
        this.db.recordFieldValue.count({ where }),
        filtered && !conceal
          ? this.db.recordFieldValue.count({ where: { ...where, record: { object_id: f.object.id, deleted_at: null } } })
          : null,
      ]);
      if (conceal && !total) continue;
      const ids = rows.map((r) => r.record_id);
      const [titles, anchors] = await Promise.all([
        this.#titlesFor(f.object.id, ids),
        this.db.record.findMany({
          where:  { id: { in: ids } },
          select: { id: true, created_at: true, pipeline_stage: { select: { label: true, color: true } } },
        }),
      ]);
      const anchorById = new Map(anchors.map((a) => [a.id, a]));
      const { config: _cfg, ...object } = f.object;
      out.push({
        object,
        field:  { name: f.name, label: f.label },
        total,
        restricted: all == null ? 0 : Math.max(0, all - total),
        records: ids.map((id) => ({
          id,
          label:      titles.get(id) ?? `#${id}`,
          stage:      anchorById.get(id)?.pipeline_stage ?? null,
          created_at: anchorById.get(id)?.created_at ?? null,
        })),
      });
    }
    return out;
  }

  /**
   * Return the labels of any REQUIRED fields on a record's object that are still
   * empty. Used to gate conversion (Prospect → Client) until the record is
   * complete — the same required-field enforcement the top-5 CRMs apply on
   * lead/prospect conversion. Computed/read-only (`always_disabled`) required
   * fields are skipped since the user can't fill them.
   */
  async getMissingRequiredFields(recordId) {
    const rec = await this.db.record.findUnique({
      where:  { id: Number(recordId) },
      select: { id: true, object_id: true, object: { select: { name: true } } },
    });
    if (!rec) return [];
    const required = await this.db.uiField.findMany({
      where:   { object_id: rec.object_id, is_required: true, is_active: true },
      select:  { name: true, label: true, config: true },
      orderBy: { order_index: 'asc' },
    });
    if (!required.length) return [];

    const hydrated = await this.#hydrateCrm({ id: rec.id, object_id: rec.object_id, object: rec.object });
    const data = hydrated?.data ?? {};
    const isEmpty = (v) => v === null || v === undefined || v === '' || (Array.isArray(v) && v.length === 0);
    return required
      .filter(f => !f.config?.always_disabled)
      .filter(f => isEmpty(data[f.name]))
      .map(f => f.label || f.name);
  }

  /**
   * Merge each Lead's latest score + A–F grade (from the lead_scores table)
   * into its record.data, so the Leads module shows scoring inline instead of
   * needing a separate module. Read-only — the values are engine-owned.
   */
  async #attachLeadScores(records) {
    if (!records.length) return records;
    const recordIds = records.map(r => r.id);
    const scores = await this.db.leadScore.findMany({
      where:   { lead_intake: { record_id: { in: recordIds } } },
      select:  { total_score: true, lead_intake: { select: { record_id: true } } },
      orderBy: { calculated_at: 'asc' },   // newest wins if a lead ever has >1 score row
    });
    const scoreByRecordId = new Map(scores.map(s => [s.lead_intake.record_id, s.total_score]));
    return records.map((r) => {
      const total = scoreByRecordId.get(r.id);
      if (total == null) return r;
      return { ...r, data: { ...r.data, score: total, grade: leadScoreGrade(total) } };
    });
  }

  // ── Mutations ─────────────────────────────────────────────────────────────

  /** Fill fields the payload leaves out with their Builder default value. */
  async #withDefaults(objectId, data) {
    const key = Number(objectId);
    let defs = FIELD_DEFAULTS.get(key);
    if (!defs || defs.until < Date.now()) {
      const rows = await this.db.uiField.findMany({
        where: { object_id: key, is_active: true, default_value: { not: null } },
        select: { name: true, field_type: true, default_value: true },
      }).catch(() => []);
      defs = { until: Date.now() + 60_000, rows: rows.filter((f) => f.default_value !== '' && !['formula', 'auto_number', 'heading'].includes(f.field_type)) };
      FIELD_DEFAULTS.set(key, defs);
    }
    if (!defs.rows.length) return data;
    const out = { ...(data ?? {}) };
    for (const f of defs.rows) {
      if (out[f.name] !== undefined) continue;
      const raw = String(f.default_value);
      if (raw === '{{today}}') out[f.name] = new Date().toISOString().slice(0, 10);
      else if (raw === '{{now}}') out[f.name] = new Date().toISOString().slice(0, 16).replace('T', ' ');
      else if (['checkbox', 'boolean', 'toggle'].includes(f.field_type)) out[f.name] = ['true', '1', 'yes'].includes(raw.toLowerCase());
      else if (['number', 'integer', 'decimal', 'currency', 'percent', 'percentage'].includes(f.field_type) && Number.isFinite(Number(raw))) out[f.name] = Number(raw);
      else out[f.name] = raw;
    }
    return out;
  }

  async createRecord(objectId, stageId, createdBy, assignedTo = null, viewer = null, crmData = null, { draft = false } = {}) {
    await this.#assertObjectEditPermission(objectId, viewer);
    // Resolve tenant �� explicit from JWT, or fall back to AsyncLocalStorage middleware
    const tenantId = Number(viewer?.tenant_id) || getTenantId();
    if (!tenantId) {
      throw new AuthorizationError('No tenant context — please log in again');
    }
    // ── Server-side validation (is_required, field-type formats, admin rules) ──
    // Runs before anything is written so a rejected submission leaves no trace.
    // A draft (a record started in one step and completed later in a wizard) is
    // checked like a patch: submitted values must be valid, absent ones may come later.
    // Builder defaults apply to every create path (website forms, workflows,
    // imports, the API), not only to forms rendered in the browser.
    crmData = await this.#withDefaults(objectId, crmData);
    if (crmData) await this.compute.applyFormulas(objectId, crmData, null);
    await this.#assertValid(objectId, crmData ?? {}, { partial: draft, recordId: null });
    // ── Auto-number generation for fields with auto_number config ─────────
    if (crmData) {
      // A formula may read the new number (a title "DSR-2026-000006 · Access · …"):
      // formulas ran before the number existed, so run them again once it does.
      if (await this.#generateAutoNumbers(objectId, crmData, tenantId)) await this.compute.applyFormulas(objectId, crmData, null);
    }
    const stamp = crmData ? await this.scope.stampFor(objectId, crmData) : {};
    // A record of an object with a pipeline starts in its first stage when the caller names none (a wizard,
    // the table view's New button, an import) — otherwise it sits in no board column and no stage gate or
    // stage-change automation can ever reach it.
    if (!stageId) stageId = await this.#firstStageId(objectId);
    const record = await this.db.record.create({
      data: {
        object_id:         Number(objectId),
        pipeline_stage_id: stageId ? Number(stageId) : null,
        created_by:        createdBy ?? null,
        assigned_to:       assignedTo ?? null,
        tenant_id:         tenantId,
        ...stamp,
      },
      include: { pipeline_stage: { select: { id: true, label: true, color: true, name: true } } },
    });
    // Persist CRM entity fields (lead, contact, opportunity, etc.) if provided
    if (crmData) await this.#upsertCrmEntity(record.id, objectId, crmData, tenantId);
    // Audit + auto-assign fire-and-forget (don't block the response)
    this.#audit(record.id, createdBy, 'create', null, tenantId);
    // ── Auto-assign if no explicit assignee and assignment engine is wired ─────
    // ── Emit domain event: record.created ─────────────────────────────────
    // After routing has settled (still without blocking the response): an
    // on-create workflow that reassigns the record (an existing client's
    // enquiry to their RM, a referral to its receiving RM) must not race the
    // assignment rules — whichever wrote last used to win.
    const routed = !assignedTo && this.assignSvc
      ? this.assignSvc.assign(Number(objectId), record.id, {}).catch(() => null)
      : Promise.resolve(null);
    routed.then((who) => this.#emit('record.created', { objectId, record: who ? { ...record, assigned_to: who } : record, actorId: createdBy }));
    // ── Auto-score leads/prospects (fire-and-forget) ──────────────────────
    if (crmData) this.#maybeScoreLead(record.id, objectId, tenantId);
    // A new child changes its parents' roll-ups.
    if (crmData) await this.#refreshParents(objectId, crmData);
    return this.#hydrateCrm(record);
  }

  async updateRecord(id, updatedBy, viewer, assignedTo = undefined, crmData = null) {
    const existing = await this.db.record.findUnique({ where: { id: Number(id) } });
    if (!existing) throw new NotFoundError('Record');
    await this.#assertAccess(existing, viewer);
    await this.#assertObjectEditPermission(existing.object_id, viewer);

    // A form opened by a viewer who sees personal data masked sends the mask
    // back unchanged — never let "••••0123" overwrite the real value.
    if (crmData) {
      for (const f of await this.#piiFields(existing.object_id)) {
        if (typeof crmData[f] === 'string' && crmData[f].includes('•')) delete crmData[f];
      }
    }

    const updatePayload = crmData ? await this.scope.stampFor(existing.object_id, crmData) : {};
    if (assignedTo !== undefined) updatePayload.assigned_to = assignedTo ?? null;
    if (updatedBy) updatePayload.updated_by = String(updatedBy).slice(0, 100);
    const tenantId = Number(viewer?.tenant_id) || existing.tenant_id || getTenantId();

    // Only the submitted fields are validated on update (a partial patch must
    // not fail because an untouched required field is missing from the body).
    // The stored values before this patch: field-change workflows need to know
    // what actually changed, and formulas read the record overlaid with the patch.
    const before = crmData ? ((await this.#loadData(id)) ?? {}) : {};
    if (crmData) {
      let merged = null;
      const getMerged = async () => (merged ??= { ...before, ...crmData });
      const formulas = await this.compute.formulaFields(existing.object_id).catch(() => []);
      if (formulas?.length) {
        const values = await getMerged();
        const computed = await this.compute.applyFormulas(existing.object_id, values, Number(id), formulas);
        for (const name of computed) crmData[name] = values[name];
      }
      await this.#assertValid(existing.object_id, crmData, { partial: true, recordId: Number(id), merged: getMerged });
    }

    // Run record update + CRM entity upsert in parallel where possible
    const [updated] = await Promise.all([
      this.db.record.update({
        where: { id: Number(id) },
        data:  updatePayload,
        include: { pipeline_stage: { select: { id: true, label: true, color: true, name: true } } },
      }),
      crmData ? this.#upsertCrmEntity(Number(id), existing.object_id, crmData, tenantId) : null,
    ]);
    // Audit + workflow fire-and-forget (don't block the response)
    this.#audit(id, updatedBy, 'update', null, tenantId);
    this.#emit('record.updated', { objectId: updated.object_id, record: updated, actorId: updatedBy });
    // Field-change workflows (e.g. "decision changed") fire for the fields this patch changed.
    if (crmData) {
      const norm = (v) => (v instanceof Date ? v.toISOString().slice(0, 10) : v === null || v === undefined ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v));
      const changed = {};
      for (const [k, v] of Object.entries(crmData)) {
        if (norm(before[k]) !== norm(v)) changed[k] = { old: before[k] ?? null, new: v ?? null };
      }
      if (Object.keys(changed).length) this.#emit('record.field_changed', { objectId: updated.object_id, record: updated, changed, actorId: updatedBy });
    }
    // ── Re-score leads/prospects when their CRM data changes ──────────────
    if (crmData) this.#maybeScoreLead(Number(id), existing.object_id, tenantId);
    // A partial patch (one field edited inline, or through the API) still has
    // parents: their lookups are in the stored values, not in the patch.
    if (crmData) await this.#refreshParents(existing.object_id, { ...before, ...crmData });
    // A lookup moved to another parent (a holding re-linked to another client):
    // the parent it left must drop it from its roll-ups too.
    if (crmData) {
      const left = Object.fromEntries(Object.keys(crmData)
        .filter((k) => before[k] != null && before[k] !== '' && String(before[k]) !== String(crmData[k] ?? ''))
        .map((k) => [k, before[k]]));
      if (Object.keys(left).length) await this.#refreshParents(existing.object_id, left);
    }
    // Children that read this record's fields through a lookup follow the change.
    if (crmData) await this.#refreshChildren(existing.object_id, Number(id));
    return this.#hydrateCrm(updated);
  }

  /**
   * Stage gates — Builder-configured conditions for entering a stage:
   *   stage.config.required_fields  fields that must be filled
   *   stage.config.entry_rule       { expression, message } — a formula that
   *                                 must be true (e.g. "KYC approved and
   *                                 security perfected" before disbursement)
   *   stage.config.four_eyes        true | { field?, message? } — maker-checker:
   *                                 the person moving the record here must not
   *                                 be its creator, and `field` (e.g. "Approved
   *                                 by") must not name the creator either
   * Enforced here, so Kanban drags, API calls, bulk moves and workflow moves
   * all obey the same rule (four eyes applies to a person's move; a workflow
   * move carries no actor).
   */
  async #assertStageGate(recordId, stageId, actorId = null) {
    if (!stageId || typeof this.db.uiPipelineStage?.findUnique !== 'function') return;
    const stage = await this.db.uiPipelineStage.findUnique({ where: { id: Number(stageId) }, select: { label: true, config: true } });
    const cfg = stage?.config ?? {};
    const required = Array.isArray(cfg.required_fields) ? cfg.required_fields : [];
    if (!required.length && !cfg.entry_rule?.expression && !cfg.four_eyes) return;
    const data = (await this.#loadData(recordId)) ?? {};
    if (cfg.four_eyes) await this.#assertFourEyes(recordId, stage, cfg.four_eyes === true ? {} : cfg.four_eyes, data, actorId);
    const blank = (v) => v === null || v === undefined || v === '' || (Array.isArray(v) && !v.length);
    const missing = required.filter((f) => blank(data[f]));
    if (missing.length) {
      // Say it in the user's words: field labels, not column names.
      const rec = await this.db.record.findUnique({ where: { id: Number(recordId) }, select: { object_id: true } }).catch(() => null);
      const rows = rec && typeof this.db.uiField?.findMany === 'function'
        ? await this.db.uiField.findMany({ where: { object_id: rec.object_id, name: { in: missing } }, select: { name: true, label: true } }).catch(() => [])
        : [];
      const label = (f) => rows.find((r) => r.name === f)?.label ?? f;
      const err = new ValidationError(`Fill in ${missing.map((f) => `“${label(f)}”`).join(', ')} before moving to ${stage.label}`);
      err.details = missing.map((f) => ({ field: f, label: label(f), message: `Required for ${stage.label}` }));
      throw err;
    }
    if (cfg.entry_rule?.expression) {
      const { evaluate, truthy } = require('./formula');
      let ok;
      try {
        ok = truthy(await evaluate(cfg.entry_rule.expression, this.compute.context({ ...data }, Number(recordId))));
      } catch (e) {
        logger?.warn?.('[RecordService] stage entry rule failed to evaluate — blocking', { stageId, error: e.message });
        ok = false;
      }
      if (!ok) throw new ValidationError(cfg.entry_rule.message || `This record does not meet the conditions for ${stage.label}`);
    }
  }

  /** Maker-checker on a stage: the creator can neither make the move nor be named as the approver. */
  async #assertFourEyes(recordId, stage, rule, data, actorId) {
    const rec = await this.db.record.findUnique({ where: { id: Number(recordId) }, select: { created_by: true } }).catch(() => null);
    const creator = rec?.created_by ? String(rec.created_by) : null;
    if (!creator) return;
    const message = rule.message || `Four eyes: someone other than the person who created this record must move it to ${stage.label}.`;
    if (actorId && String(actorId) === creator) {
      // Nothing on the record can fix this — someone else has to make the move.
      const err = new ValidationError(message);
      err.code = 'FOUR_EYES';
      throw err;
    }
    if (rule.field && data[rule.field] != null && data[rule.field] !== '') {
      const named = String(data[rule.field]).trim().toLowerCase();
      const emp = typeof this.db.employee?.findUnique === 'function'
        ? await this.db.employee.findUnique({ where: { employee_id: creator }, select: { employee_name: true } }).catch(() => null)
        : null;
      const name = emp?.employee_name ? String(emp.employee_name).trim().toLowerCase() : null;
      if (named === creator.toLowerCase() || (name && named.includes(name))) {
        const err = new ValidationError(rule.message || `Four eyes: the approver cannot be the person who created this record (${emp?.employee_name ?? creator}).`);
        err.details = [{ field: rule.field, message: 'Must be someone other than the creator' }];
        throw err;
      }
    }
  }

  async updateRecordStage(id, stageId, updatedBy, viewer) {
    const existing = await this.db.record.findUnique({ where: { id: Number(id) } });
    if (!existing) throw new NotFoundError('Record');
    await this.#assertAccess(existing, viewer);
    await this.#assertObjectEditPermission(existing.object_id, viewer);
    if (stageId && Number(stageId) !== existing.pipeline_stage_id) await this.#assertStageGate(existing.id, stageId, updatedBy ?? viewer?.employee_id ?? null);
    const tenantId = Number(viewer?.tenant_id) || existing.tenant_id || getTenantId();
    const updated = await this.db.record.update({
      where: { id: Number(id) },
      data:  { pipeline_stage_id: stageId ? Number(stageId) : null, ...(updatedBy ? { updated_by: String(updatedBy).slice(0, 100) } : {}) },
      // config included so callers can read metadata flags (e.g. is_conversion_stage)
      // instead of matching hardcoded stage names.
      include: { pipeline_stage: { select: { id: true, label: true, color: true, name: true, config: true } } },
    });
    // A pipeline may mirror its stage into a status picklist
    // (`config.status_field: { field, map: { stage_name: value } }`), so a move —
    // a Kanban drag, a bulk change or the API — never leaves the two disagreeing.
    const statusSync = await this.#syncStatusField(updated, tenantId);
    // The mirrored status is a stored value: formulas reading it, the parents'
    // roll-ups filtered on it and the children that read it all follow the move.
    if (statusSync) await this.recompute(updated.id, { propagate: true }).catch(() => {});
    // Audit + workflow fire-and-forget
    this.#audit(id, updatedBy, 'stage_change', {
      old_stage: existing.pipeline_stage_id,
      new_stage: stageId ?? null,
    }, tenantId);
    // Append a timeline event so the `status_tracker` field auto-populates as a
    // record moves through its pipeline (fire-and-forget — never blocks the move).
    if (updated.pipeline_stage) {
      this.#recordStatusEvent(id, {
        status:     updated.pipeline_stage.name,
        title:      updated.pipeline_stage.label,
        event_type: 'milestone',
        changed_by: updatedBy,
      }, tenantId);
    }
    this.#emit('record.updated', { objectId: updated.object_id, record: updated, actorId: updatedBy });
    this.#emit('record.field_changed', {
      objectId: updated.object_id,
      record:   updated,
      changed:  { pipeline_stage_id: { old: existing.pipeline_stage_id, new: stageId ?? null }, ...(statusSync ?? {}) },
      actorId:  updatedBy,
    });
    return updated;
  }

  /** Write the pipeline's mirrored status field for the record's new stage. Returns the change, or null. */
  async #syncStatusField(record, tenantId) {
    const stage = record.pipeline_stage;
    if (!stage?.name || typeof this.db.uiPipelineStage?.findUnique !== 'function') return null;
    const row = await this.db.uiPipelineStage.findUnique({ where: { id: stage.id }, select: { pipeline: { select: { config: true } } } }).catch(() => null);
    const sync = row?.pipeline?.config?.status_field;
    const value = sync?.field ? sync.map?.[stage.name] : undefined;
    if (value === undefined) return null;
    const before = (await this.#loadData(record.id))?.[sync.field];
    if (String(before ?? '') === String(value ?? '')) return null;
    await this.#upsertCustomFieldValues(record.id, { [sync.field]: value }, record.object_id, tenantId);
    return { [sync.field]: { old: before ?? null, new: value } };
  }

  // ── Status timeline events (status_tracker fieldtype) ──────────────────────

  /** Fire-and-forget insert of a single timeline event. Never throws. */
  #recordStatusEvent(recordId, data, tenantId = null) {
    const tid = tenantId || getTenantId();
    return this.db.statusEvent.create({
      data: {
        record_id:   Number(recordId),
        status:      String(data.status ?? '').slice(0, 60),
        title:       data.title ?? null,
        description: data.description ?? null,
        location:    data.location ?? null,
        event_type:  data.event_type ?? 'milestone',
        ...(data.occurred_at ? { occurred_at: new Date(data.occurred_at) } : {}),
        changed_by:  data.changed_by ? String(data.changed_by) : null,
        ...(tid ? { tenant_id: tid } : {}),
      },
    }).catch((err) => {
      logger?.warn?.('[RecordService] Status event write failed', { recordId, error: err.message });
    });
  }

  /**
   * Return a record's status timeline, newest first, with the actor's name
   * resolved for display. Asserts the viewer may see the record first.
   */
  async listStatusEvents(id, viewer) {
    const existing = await this.db.record.findUnique({ where: { id: Number(id) } });
    if (!existing) throw new NotFoundError('Record');
    await this.#assertAccess(existing, viewer);

    const events = await this.db.statusEvent.findMany({
      where:   { record_id: Number(id) },
      orderBy: { occurred_at: 'desc' },
      take: 100,
    });

    // Resolve employee names in one query (changed_by is a plain column, not a FK relation)
    const ids = [...new Set(events.map(e => e.changed_by).filter(Boolean))];
    const employees = ids.length
      ? await this.db.employee.findMany({
          where:  { employee_id: { in: ids } },
          select: { employee_id: true, employee_name: true },
        })
      : [];
    const nameById = Object.fromEntries(employees.map(e => [e.employee_id, e.employee_name]));

    return events.map(e => ({ ...e, changed_by_name: e.changed_by ? (nameById[e.changed_by] ?? null) : null }));
  }

  /** Manually append a timeline event to a record (requires object edit permission). */
  async addStatusEvent(id, data, viewer) {
    const existing = await this.db.record.findUnique({ where: { id: Number(id) } });
    if (!existing) throw new NotFoundError('Record');
    await this.#assertAccess(existing, viewer);
    await this.#assertObjectEditPermission(existing.object_id, viewer);
    const tenantId = Number(viewer?.tenant_id) || existing.tenant_id || getTenantId();
    return this.#recordStatusEvent(id, {
      ...data,
      changed_by: data.changed_by ?? viewer?.employee_id ?? null,
    }, tenantId);
  }

  /** The first stage of the object's (first) pipeline, or null when it has none. */
  async #firstStageId(objectId) {
    const stage = await this.db.uiPipelineStage?.findFirst({
      where:   { pipeline: { object_id: Number(objectId) } },
      orderBy: [{ pipeline_id: 'asc' }, { order_index: 'asc' }],
      select:  { id: true },
    }).catch(() => null);
    return stage?.id ?? null;
  }

  /**
   * Resolve the delete mode for an object from its pipeline's per-pipeline
   * `config.delete_mode` (set via the Pipeline Builder toggle). Defaults to
   * 'soft' when the object has no pipeline or no explicit mode. Admins configure
   * this per pipeline; end users never see it.
   * @returns {Promise<'soft'|'hard'>}
   */
  async #resolvePipelineDeleteMode(objectId) {
    const pipeline = await this.db.uiPipeline.findFirst({
      where:   { object_id: Number(objectId) },
      orderBy: { created_at: 'asc' },
      select:  { config: true },
    });
    return pipeline?.config?.delete_mode === 'hard' ? 'hard' : 'soft';
  }

  /**
   * Delete a record. In 'soft' mode the record is moved to the Trash — hidden
   * from every user but retained in the DB and recoverable by an admin. In
   * 'hard' mode it is permanently removed. From the deleting user's perspective
   * the record simply disappears either way; they never see the mode. The mode
   * comes from the object's pipeline (`config.delete_mode`); pass `opts.mode` to
   * override (used by tests / internal callers).
   * @param {number} id
   * @param {string} deletedBy
   * @param {object} viewer
   * @param {{ mode?: 'soft'|'hard' }} [opts]
   */
  async deleteRecord(id, deletedBy, viewer, opts = {}) {
    const existing = await this.db.record.findUnique({ where: { id: Number(id) } });
    if (!existing || existing.deleted_at) throw new NotFoundError('Record');
    await this.#assertAccess(existing, viewer);
    await this.#assertObjectEditPermission(existing.object_id, viewer);
    const mode = opts.mode ?? await this.#resolvePipelineDeleteMode(existing.object_id);
    const tenantId = Number(viewer?.tenant_id) || existing.tenant_id || getTenantId();
    // ── Emit domain event: record.deleted (before delete so data is accessible) ──
    this.#emit('record.deleted', { objectId: existing.object_id, record: existing, actorId: deletedBy });
    // Audit the delete with its mode. Record id/object are kept in `changes` so
    // the entry stays meaningful even after a hard delete nulls record_id.
    await this.#audit(id, deletedBy, 'delete',
      { mode, record_id: Number(id), object_id: existing.object_id }, tenantId);
    // The parents' roll-ups over this record (a loan's security value over its
    // collateral, a collateral's market value over its latest valuation) must
    // drop it: read the lookups before the row goes, refresh after.
    const values = await this.#loadData(id).catch(() => null);
    const result = mode === 'hard'
      ? await this.db.record.delete({ where: { id: Number(id) } })
      : await this.db.record.update({
        where: { id: Number(id) },
        data:  { deleted_at: new Date(), deleted_by: deletedBy ?? null },
      });
    if (values) await this.#refreshParents(existing.object_id, values);
    // Records that read this one through a lookup (`party.kyc_status`) no longer
    // see it (a trashed record resolves to nothing).
    await this.#refreshChildren(existing.object_id, Number(id));
    return result;
  }

  // ── Bulk operations ────────────────────────────────────────────────────────

  /**
   * For records about to leave (or re-enter) the live set: the parents each
   * object's records point at, de-duplicated so a parent shared by many of
   * them is recomputed once. Objects without lookup fields cost one query.
   */
  async #linksOf(recs) {
    const byObject = new Map();
    for (const r of recs) {
      if (!byObject.has(r.object_id)) byObject.set(r.object_id, { parents: new Set(), ids: [] });
      byObject.get(r.object_id).ids.push(r.id);
    }
    try {
      for (const [objectId, entry] of byObject) {
        const lookups = await this.db.uiField.findMany({
          where:  { object_id: Number(objectId), is_active: true, field_type: 'lookup' },
          select: { name: true },
        });
        if (!lookups.length) continue;
        for (const id of entry.ids) {
          const values = await this.#loadData(id).catch(() => null);
          for (const f of lookups) {
            const pid = Number(values?.[f.name]);
            if (Number.isInteger(pid) && pid > 0) entry.parents.add(pid);
          }
        }
      }
    } catch (err) {
      logger?.warn?.('[RecordService] reading lookups before a bulk change failed', { error: err.message });
    }
    return byObject;
  }

  /** Recompute what `#linksOf` collected: the parents' roll-ups, then each record's readers. */
  async #refreshLinks(byObject) {
    for (const [objectId, { parents, ids }] of byObject) {
      if (parents.size) await this.#refreshParentIds(objectId, [...parents]);
      for (const id of ids.slice(0, 200)) await this.#refreshChildren(objectId, id);
    }
  }

  async bulkDelete(ids, deletedBy, viewer, opts = {}) {
    const numIds = await this.#filterAccessibleIds(ids.map(Number), viewer);
    if (!numIds.length) return { deleted: 0 };

    // Resolve mode per record from its object's pipeline (cached per object so a
    // typical single-object bulk delete does exactly one pipeline lookup), then
    // partition into soft vs hard so each is a single write.
    const recs = await this.db.record.findMany({
      where: { id: { in: numIds } }, select: { id: true, object_id: true },
    });
    const modeByObject = new Map();
    const resolve = async (oid) => {
      if (!modeByObject.has(oid)) modeByObject.set(oid, opts.mode ?? await this.#resolvePipelineDeleteMode(oid));
      return modeByObject.get(oid);
    };
    const softIds = [], hardIds = [];
    for (const r of recs) ((await resolve(r.object_id)) === 'hard' ? hardIds : softIds).push(r.id);

    // Audit every record BEFORE the writes (so hard-delete rows still exist for
    // the FK); each carries its mode + object so the trail survives a hard delete.
    const softSet = new Set(softIds);
    await this.#auditBulk(
      recs.map(r => ({
        record_id: r.id,
        changes:   { mode: softSet.has(r.id) ? 'soft' : 'hard', record_id: r.id, object_id: r.object_id, bulk: true },
      })),
      deletedBy, 'delete',
    );

    // As for a single delete: read where each record points before it goes, so
    // the parents' roll-ups (and the readers of these records) drop them after.
    const links = await this.#linksOf(recs);

    if (softIds.length) {
      await this.db.record.updateMany({
        where: { id: { in: softIds } },
        data:  { deleted_at: new Date(), deleted_by: deletedBy ?? null },
      });
    }
    if (hardIds.length) {
      await this.db.record.deleteMany({ where: { id: { in: hardIds } } });
    }
    await this.#refreshLinks(links);
    // Notify downstream (workflows / integrations) per deleted record.
    for (const r of recs) {
      this.#emit('record.deleted', { objectId: r.object_id, record: { id: r.id }, actorId: deletedBy });
    }
    return { deleted: numIds.length };
  }

  // ── Trash (admin-only recovery) ─────────────────────────────────────────────

  /**
   * List soft-deleted records, hydrated with their CRM/EAV data so the admin
   * Trash UI can show a meaningful summary. Optionally filtered by object.
   * Admin-only — enforced at the route layer.
   * @param {{ objectId?: number, limit?: number }} [opts]
   */
  async getTrashedRecords({ objectId, limit = 500 } = {}) {
    const where = { deleted_at: { not: null } };
    if (objectId != null && objectId !== '') where.object_id = Number(objectId);
    const records = await this.db.record.findMany({
      where,
      orderBy: { deleted_at: 'desc' },
      take:    _clampTake(limit, 500, 2000),
      include: {
        pipeline_stage: { select: { id: true, label: true, color: true } },
        object:         { select: { id: true, name: true, label: true } },
      },
    });
    return this.#hydrateMany(records);
  }

  /** Count of trashed records, optionally per object — for Trash badges/filters. */
  async countTrashedRecords(objectId) {
    const where = { deleted_at: { not: null } };
    if (objectId != null && objectId !== '') where.object_id = Number(objectId);
    return this.db.record.count({ where });
  }

  /** Restore a soft-deleted record back into its object's live list. Admin-only. */
  async restoreRecord(id, restoredBy = null) {
    const existing = await this.db.record.findUnique({ where: { id: Number(id) } });
    if (!existing) throw new NotFoundError('Record');
    if (!existing.deleted_at) throw new ValidationError('Record is not in the Trash');
    const restored = await this.db.record.update({
      where: { id: Number(id) },
      data:  { deleted_at: null, deleted_by: null },
    });
    await this.#audit(id, restoredBy, 'restore', { object_id: existing.object_id }, existing.tenant_id);
    // Back in the live set: its own formulas catch up with what changed while it
    // was trashed, its parents count it again, and its readers see it again.
    await this.recompute(Number(id), { propagate: true }).catch(() => {});
    this.#emit('record.updated', { objectId: existing.object_id, record: restored, actorId: restoredBy });
    return restored;
  }

  /**
   * Permanently delete a record from the Trash. Guards against purging a live
   * record — it must be trashed first, keeping permanent loss behind two steps.
   * Admin-only.
   */
  async purgeRecord(id, purgedBy = null) {
    const existing = await this.db.record.findUnique({ where: { id: Number(id) } });
    if (!existing) throw new NotFoundError('Record');
    if (!existing.deleted_at) throw new ValidationError('Record must be in the Trash before it can be permanently deleted');
    // Audit BEFORE deletion; the FK is SET NULL, so this entry survives with its
    // record id preserved in `changes` for traceability.
    await this.#audit(id, purgedBy, 'purge', { record_id: Number(id), object_id: existing.object_id }, existing.tenant_id);
    await this.db.record.delete({ where: { id: Number(id) } });
    return { id: Number(id), purged: true };
  }

  async bulkUpdateStage(ids, stageId, updatedBy, viewer) {
    const numIds = await this.#filterAccessibleIds(ids.map(Number), viewer);
    if (!numIds.length) return { updated: 0 };
    // Every record must pass the target stage's gate; a bulk move is all-or-nothing.
    for (const rid of numIds) await this.#assertStageGate(rid, stageId, updatedBy ?? viewer?.employee_id ?? null);
    // Fetch existing records for workflow triggers
    const existingRecords = await this.db.record.findMany({
      where: { id: { in: numIds } },
      select: { id: true, object_id: true, pipeline_stage_id: true, tenant_id: true },
    });
    await this.db.record.updateMany({
      where: { id: { in: numIds } },
      data:  { pipeline_stage_id: stageId ? Number(stageId) : null, ...(updatedBy ? { updated_by: String(updatedBy).slice(0, 100) } : {}) },
    });
    // Audit each stage change (bulk pipeline move).
    const newStage = stageId ? Number(stageId) : null;
    await this.#auditBulk(
      existingRecords.map(rec => ({
        record_id: rec.id,
        changes:   { pipeline_stage_id: { old: rec.pipeline_stage_id, new: newStage }, bulk: true },
      })),
      updatedBy, 'stage_change',
    );
    // A bulk move must leave each record exactly as a single move would: the
    // pipeline's mirrored status field, the status timeline and whatever reads
    // the status (formulas, parents' roll-ups) follow the new stage.
    const stage = newStage && typeof this.db.uiPipelineStage?.findUnique === 'function'
      ? await this.db.uiPipelineStage.findUnique({ where: { id: newStage }, select: { id: true, label: true, color: true, name: true } }).catch(() => null)
      : null;
    for (const rec of existingRecords) {
      const updated = { ...rec, pipeline_stage_id: newStage, pipeline_stage: stage };
      const moved = rec.pipeline_stage_id !== newStage;
      const tenantId = rec.tenant_id || Number(viewer?.tenant_id) || getTenantId();
      const statusSync = moved && stage ? await this.#syncStatusField(updated, tenantId).catch(() => null) : null;
      if (statusSync) await this.recompute(rec.id, { propagate: true }).catch(() => {});
      if (moved && stage) {
        this.#recordStatusEvent(rec.id, { status: stage.name, title: stage.label, event_type: 'milestone', changed_by: updatedBy }, tenantId);
      }
      this.#emit('record.updated', { objectId: rec.object_id, record: updated, actorId: updatedBy });
      this.#emit('record.field_changed', {
        objectId: rec.object_id,
        record:   updated,
        changed:  { pipeline_stage_id: { old: rec.pipeline_stage_id, new: stageId ?? null }, ...(statusSync ?? {}) },
        actorId:  updatedBy,
      });
    }
    return { updated: numIds.length };
  }

  // ── Domain events ────────────────────────────────────────────────────────────

  /**
   * Publish a `record.*` domain event onto the shared bus. Fire-and-forget and
   * fully non-blocking: consumers (workflow engine, integrations) run
   * independently and their failures never affect the originating request.
   * No-ops when no bus is wired (e.g. bulk import paths).
   */
  #emit(event, payload) {
    this.eventBus?.publish(event, payload).catch(() => {});
  }

  // ── CSV export ─────────────────────────────────────────────────────────────

  // ── Bulk reassign, merge and unmerge (PRD X-09, C360-FR-08) ─────────────

  /** Managers and administrators only (an RM leaving, a duplicate client). */
  #assertManager(viewer, what) {
    if (!viewer) return;
    const level = viewer.role_level ?? ROLE_LEVEL[viewer.role];
    if (!(Number.isFinite(level) && level <= MANAGER_THRESHOLD)) throw new AuthorizationError(`Only managers and administrators can ${what}`);
  }

  /** Reassign many records to one owner (e.g. when an RM leaves). */
  async bulkAssign(ids, assignedTo, updatedBy, viewer) {
    this.#assertManager(viewer, 'reassign records in bulk');
    const numIds = await this.#filterAccessibleIds((ids ?? []).map(Number), viewer);
    if (!numIds.length) return { updated: 0 };
    const owner = assignedTo ? await this.db.employee.findUnique({ where: { employee_id: String(assignedTo) }, select: { employee_id: true, is_active: true } }) : null;
    if (assignedTo && (!owner || owner.is_active === false)) throw new ValidationError('The new owner is not an active employee');
    const existing = await this.db.record.findMany({ where: { id: { in: numIds } }, select: { id: true, object_id: true, assigned_to: true } });
    await this.db.record.updateMany({ where: { id: { in: numIds } }, data: { assigned_to: assignedTo ? String(assignedTo) : null, ...(updatedBy ? { updated_by: String(updatedBy).slice(0, 100) } : {}) } });
    await this.#auditBulk(existing.map((r) => ({ record_id: r.id, changes: { assigned_to: { old: r.assigned_to, new: assignedTo ?? null }, bulk: true } })), updatedBy, 'reassign');
    for (const r of existing) this.#emit('record.updated', { objectId: r.object_id, record: { ...r, assigned_to: assignedTo ?? null }, actorId: updatedBy });
    return { updated: numIds.length };
  }

  /** Lookup fields (anywhere) that point at records of this object. */
  async #incomingLookupFields(objectName) {
    const rows = await this.db.uiField.findMany({
      where: { is_active: true, field_type: 'lookup', config: { path: '$.target_object', equals: objectName } }, select: { name: true },
    });
    return [...new Set(rows.map((r) => r.name))];
  }

  /**
   * Merge a duplicate into the surviving record: blank fields on the survivor
   * are filled from the duplicate, every lookup pointing at the duplicate is
   * re-pointed, and the duplicate goes to the Trash. The full change set is
   * written to the audit chain, which is what makes unmerge possible.
   */
  async mergeRecords(sourceId, targetId, viewer) {
    this.#assertManager(viewer, 'merge records');
    if (Number(sourceId) === Number(targetId)) throw new ValidationError('A record cannot be merged into itself');
    const [src, tgt] = await Promise.all([sourceId, targetId].map((id) => this.db.record.findUnique({ where: { id: Number(id) }, include: { object: { select: { name: true } } } })));
    if (!src || src.deleted_at || !tgt || tgt.deleted_at) throw new NotFoundError('Record');
    await this.#assertAccess(src, viewer);
    await this.#assertAccess(tgt, viewer);
    if (src.object_id !== tgt.object_id) throw new ValidationError('Only records of the same object can be merged');
    await this.#assertObjectEditPermission(src.object_id, viewer);

    const [srcData, tgtData, fields] = await Promise.all([
      this.#loadData(src.id), this.#loadData(tgt.id),
      this.db.uiField.findMany({ where: { object_id: src.object_id, is_active: true }, select: { name: true, field_type: true, config: true } }),
    ]);
    const writable = fields.filter((f) => !['formula', 'heading'].includes(f.field_type) && !f.config?.auto_number && f.name !== 'ext_ref');
    const filled = {};
    for (const f of writable) {
      const v = srcData?.[f.name];
      const cur = tgtData?.[f.name];
      if ((cur == null || cur === '') && v != null && v !== '') filled[f.name] = v instanceof Date ? v.toISOString().slice(0, 10) : v;
    }
    if (Object.keys(filled).length) await this.#upsertCustomFieldValues(tgt.id, filled, tgt.object_id, tgt.tenant_id);

    const names = await this.#incomingLookupFields(src.object.name);
    const pointing = names.length
      ? await this.db.recordFieldValue.findMany({ where: { field_name: { in: names }, str_value: String(src.id) }, select: { id: true, record_id: true } })
      : [];
    if (pointing.length) {
      await this.db.recordFieldValue.updateMany({ where: { id: { in: pointing.map((r) => r.id) } }, data: { str_value: String(tgt.id), num_value: tgt.id } });
    }
    // The duplicate's history and work move with it: one client, one timeline.
    const moved = await this.#moveRelated(src.id, tgt.id, src.object.name);
    const actor = viewer?.employee_id ?? null;
    await this.db.record.update({ where: { id: src.id }, data: { deleted_at: new Date(), deleted_by: actor } });
    await this.#chain().append({
      entityType: 'record.merge', entityId: src.id, action: 'merge', actor, sensitivity: 'sensitive', tenantId: src.tenant_id,
      payload: { source: src.id, target: tgt.id, object_id: src.object_id, repointed: pointing.map((r) => r.id), filled: Object.keys(filled), moved },
    });
    // The duplicate has left the live set: its timers stop and on-delete automation runs.
    this.#emit('record.deleted', { objectId: src.object_id, record: src, actorId: actor, merged_into: tgt.id });
    // The duplicate's own parents stop counting it (it is in the Trash now)…
    await this.#refreshParents(src.object_id, srcData ?? {});
    // …while the survivor and everything now pointing at it recompute.
    await this.recompute(tgt.id, { propagate: true }).catch(() => {});
    for (const rid of [...new Set(pointing.map((r) => r.record_id))].slice(0, 200)) await this.recompute(rid).catch(() => {});
    return { merged: src.id, into: tgt.id, repointed: pointing.length, filled: Object.keys(filled), moved: Object.fromEntries(Object.entries(moved).map(([k, v]) => [k, v.length])) };
  }

  /**
   * Re-home what hangs off a record (activities, tasks, reminders, documents,
   * emails) onto another. Returns the moved ids per kind so an unmerge can put
   * back exactly those — and nothing added to the survivor since.
   */
  async #moveRelated(fromId, toId, objectName) {
    const kinds = [
      ['activity', { record_id: fromId }, { record_id: toId }],
      ['task', { record_id: fromId }, { record_id: toId }],
      ['reminder', { record_id: fromId }, { record_id: toId }],
      ['document', { entity_type: objectName, entity_id: fromId }, { entity_id: toId }],
      ['emailLog', { related_record_id: fromId }, { related_record_id: toId }],
    ];
    const moved = {};
    for (const [model, where, data] of kinds) {
      if (typeof this.db[model]?.findMany !== 'function') continue;
      try {
        const ids = (await this.db[model].findMany({ where, select: { id: true } })).map((r) => r.id);
        if (ids.length) await this.db[model].updateMany({ where: { id: { in: ids } }, data });
        moved[model] = ids;
      } catch (err) {
        logger?.warn?.('[RecordService] moving related items failed', { model, fromId, toId, error: err.message });
      }
    }
    return moved;
  }

  /** Reverse a merge within 30 days, from the change set on the audit chain. */
  async unmergeRecord(sourceId, viewer) {
    this.#assertManager(viewer, 'unmerge records');
    const evt = await this.db.auditChainEvent.findFirst({ where: { entity_type: 'record.merge', entity_id: String(sourceId) }, orderBy: { seq: 'desc' } });
    if (!evt) throw new NotFoundError('Merge');
    if (Date.now() - new Date(evt.created_at).getTime() > 30 * 86400000) throw new ValidationError('Merges can be reversed only within 30 days');
    const undone = await this.db.auditChainEvent.findFirst({ where: { entity_type: 'record.unmerge', entity_id: String(sourceId), seq: { gt: evt.seq } } });
    if (undone) throw new ValidationError('This merge has already been reversed');
    const { source, target, repointed = [], filled = [], moved = {}, object_id: objectId } = evt.payload ?? {};
    const tgt = await this.db.record.findUnique({ where: { id: Number(target) } });
    if (!tgt) throw new NotFoundError('Record');
    await this.#assertAccess(tgt, viewer);
    await this.db.record.update({ where: { id: Number(source) }, data: { deleted_at: null, deleted_by: null } });
    let repointedRecords = [];
    if (repointed.length) {
      repointedRecords = (await this.db.recordFieldValue.findMany({ where: { id: { in: repointed }, str_value: String(target) }, select: { record_id: true } })).map((r) => r.record_id);
      await this.db.recordFieldValue.updateMany({ where: { id: { in: repointed }, str_value: String(target) }, data: { str_value: String(source), num_value: Number(source) } });
    }
    // Activities, tasks, reminders, documents and emails the merge carried over go back.
    const back = { activity: { record_id: Number(source) }, task: { record_id: Number(source) }, reminder: { record_id: Number(source) }, document: { entity_id: Number(source) }, emailLog: { related_record_id: Number(source) } };
    for (const [model, ids] of Object.entries(moved)) {
      if (ids?.length && back[model] && typeof this.db[model]?.updateMany === 'function') {
        await this.db[model].updateMany({ where: { id: { in: ids } }, data: back[model] }).catch(() => {});
      }
    }
    if (objectId) this.#emit('record.updated', { objectId, record: { id: Number(source), tenant_id: tgt.tenant_id }, actorId: viewer?.employee_id ?? null });
    // Clear the fields the merge filled on the survivor, if still unchanged.
    const [srcData, tgtData] = await Promise.all([this.#loadData(Number(source)), this.#loadData(Number(target))]);
    const clear = filled.filter((f) => String(srcData?.[f] ?? '') === String(tgtData?.[f] ?? ''));
    if (clear.length) await this.db.recordFieldValue.deleteMany({ where: { record_id: Number(target), field_name: { in: clear } } });
    await this.#chain().append({ entityType: 'record.unmerge', entityId: source, action: 'unmerge', actor: viewer?.employee_id ?? null, sensitivity: 'sensitive', tenantId: tgt.tenant_id, payload: { source, target, restored: repointed.length, cleared: clear } });
    await this.recompute(Number(target), { propagate: true }).catch(() => {});
    await this.recompute(Number(source), { propagate: true }).catch(() => {});
    for (const rid of [...new Set(repointedRecords)].slice(0, 200)) await this.recompute(rid).catch(() => {});
    return { restored: Number(source), repointed: repointed.length, cleared: clear };
  }

  // ── Personal data: masking, audited reveal, view audit (PRD X-08, CMP-FR-07) ─

  /** Names of an object's fields flagged `config.pii`. */
  async #piiFields(objectId) {
    return (await this.#piiFieldDefs(objectId)).map((f) => f.name);
  }

  /** An object's fields flagged `config.pii`, with their type. */
  async #piiFieldDefs(objectId) {
    if (typeof this.db.uiField?.findMany !== 'function') return [];
    const fields = await this.db.uiField.findMany({ where: { object_id: Number(objectId), is_active: true }, select: { name: true, field_type: true, config: true } }).catch(() => []);
    return (fields ?? []).filter((f) => f.config?.pii);
  }

  /**
   * Whether the viewer sees personal data unmasked: admin-tier roles, and roles
   * holding the `view_pii` operational permission. Internal callers (no
   * viewer — workflows, formulas, integrations) always see real values.
   */
  async canViewPii(viewer) {
    if (!viewer) return true;
    const level = viewer.role_level ?? ROLE_LEVEL[viewer.role];
    if (Number.isFinite(level) && level <= ADMIN_THRESHOLD) return true;
    const key = `${viewer.tenant_id ?? getTenantId()}:${viewer.role}`;
    const hit = PII_CACHE.get(key);
    if (hit && hit.at > Date.now() - 30_000) return hit.ok;
    if (typeof this.db.operationalPermission?.findFirst !== 'function') return false;
    const row = await this.db.operationalPermission.findFirst({ where: { entity_type: 'view_pii', role_name: viewer.role, view_scope: { not: 'none' } }, select: { id: true } });
    PII_CACHE.set(key, { ok: Boolean(row), at: Date.now() });
    return Boolean(row);
  }

  /**
   * Replace PII values with masks and list the masked fields. Screens show
   * personal data masked to everyone; viewers holding the permission get
   * `can_reveal` and unmask a value on demand, which is audited (user guide
   * §3 "Personal data"). With `onDemand: false` (exports) holders get the
   * real values. A coded value (picklist) is masked whole — its last four
   * characters are a fragment of a code, not a hint.
   */
  async #maskPii(objectId, records, viewer, { onDemand = true } = {}) {
    if (!viewer || !records?.length) return records;
    const pii = await this.#piiFieldDefs(objectId);
    if (!pii.length) return records;
    const canReveal = await this.canViewPii(viewer);
    if (canReveal && !onDemand) return records;
    return records.map((r) => {
      if (!r?.data) return r;
      const data = { ...r.data };
      const masked = [];
      for (const f of pii) {
        const v = data[f.name];
        if (v == null || v === '') continue;
        data[f.name] = ['select', 'radio', 'multi_select'].includes(f.field_type) ? '••••••' : maskValue(v);
        masked.push(f.name);
      }
      return masked.length ? { ...r, data, masked, can_reveal: canReveal } : r;
    });
  }

  /** Test seam for the private masking step. */
  _maskForTest(objectId, records, viewer, opts) { return this.#maskPii(objectId, records, viewer, opts); }

  /**
   * Reveal one masked field. Allowed only to viewers holding the view-PII
   * permission, on a record they may open; every reveal is written to the
   * tamper-evident audit chain.
   */
  async revealField(recordId, fieldName, viewer) {
    const record = await this.db.record.findUnique({ where: { id: Number(recordId) }, select: { id: true, object_id: true, tenant_id: true, deleted_at: true, created_by: true, assigned_to: true, business_unit_id: true, barrier_zone_id: true } });
    if (!record || record.deleted_at) throw new NotFoundError('Record');
    await this.#assertAccess(record, viewer);
    const pii = await this.#piiFields(record.object_id);
    if (!pii.includes(String(fieldName))) throw new ValidationError(`${fieldName} is not a protected field`);
    if (!(await this.canViewPii(viewer))) throw new AuthorizationError('Your role may not view personal data — ask Compliance');
    const row = await this.db.recordFieldValue.findUnique({ where: { record_id_field_name: { record_id: record.id, field_name: String(fieldName) } } }).catch(() => null);
    await this.#chain().append({ entityType: 'pii.reveal', entityId: record.id, action: 'reveal', actor: viewer?.employee_id ?? null, sensitivity: 'sensitive', payload: { field: String(fieldName), object_id: record.object_id }, tenantId: record.tenant_id });
    return { field: String(fieldName), value: row ? RecordService.#readTypedValue(row) : null };
  }

  /**
   * Record that a sensitive record was viewed (CMP-FR-07): anything behind an
   * information barrier, and objects whose config sets `audit_views`.
   */
  async #auditView(record, viewer) {
    if (!viewer) return;
    try {
      let sensitive = Boolean(record.barrier_zone_id);
      if (!sensitive && typeof this.db.uiObject?.findUnique === 'function') {
        const obj = await this.db.uiObject.findUnique({ where: { id: record.object_id }, select: { config: true } }).catch(() => null);
        sensitive = Boolean(obj?.config?.audit_views);
      }
      if (sensitive) await this.#chain().append({ entityType: 'record.view', entityId: record.id, action: 'view', actor: viewer.employee_id ?? null, sensitivity: 'sensitive', payload: { object_id: record.object_id }, tenantId: record.tenant_id });
    } catch { /* auditing never blocks a read */ }
  }

  /** The tamper-evident audit chain (lazily constructed). */
  #chain() {
    if (!this.auditChain) {
      const AuditChainService = require('./audit-chain.service');
      this.auditChain = new AuditChainService(this.db);
    }
    return this.auditChain;
  }

  /**
   * The object's records as CSV, in the words the user sees: field labels as
   * headers, picklist labels, linked records' titles and staff names rather
   * than stored codes and ids (an incentive export read in Excel). `ids`
   * limits the export to the rows the user filtered the table down to; the
   * viewer's scope still applies to every row.
   */
  async exportRecordsCsv(objectId, viewer, { ids } = {}) {
    const ownerWhere = await this.#ownerFilter(viewer);
    const only = Array.isArray(ids) ? ids.map(Number).filter((n) => Number.isInteger(n) && n > 0) : null;
    const anchors = await this.db.record.findMany({
      where:   { object_id: Number(objectId), deleted_at: null, ...ownerWhere, ...(only ? { id: { in: only } } : {}) },
      orderBy: { created_at: 'desc' },
      include: { pipeline_stage: { select: { label: true } } },
      take:    EXPORT_MAX_ROWS,
    });
    // Owner and creator by name, not employee id.
    const people = await this.#employeeNames([...new Set(anchors.flatMap((r) => [r.assigned_to, r.created_by]).filter((v) => typeof v === 'string' && v))]);
    const person = (id) => (id ? people.get(id) ?? id : '');
    const base = [['ID', (r) => r.id], ['Stage', (r) => r.pipeline_stage?.label ?? ''], ['Owner', (r) => person(r.assigned_to)],
      ['Created by', (r) => person(r.created_by)], ['Created at', (r) => r.created_at?.toISOString?.() ?? '']];
    if (!anchors.length) return base.map(([h]) => h).join(',') + '\r\n';

    const hydrated = await this.#maskPii(Number(objectId),
      await this.#attachLookupLabels(Number(objectId), await this.#hydrateMany(anchors)), viewer, { onDemand: false });
    const defs = typeof this.db.uiField?.findMany === 'function'
      ? await this.db.uiField.findMany({
        where:   { object_id: Number(objectId), is_active: true },
        select:  { name: true, label: true, field_type: true, options: true },
        orderBy: { order_index: 'asc' },
      }).catch(() => []) : [];
    const byName = new Map((defs ?? []).filter((f) => f.field_type !== 'heading').map((f) => [f.name, f]));
    // Fields in their Builder order, then any stored value without a field definition.
    const present = new Set(hydrated.flatMap((r) => Object.keys(r.data ?? {})));
    const keys = [...[...byName.keys()].filter((k) => present.has(k)), ...[...present].filter((k) => !byName.has(k))];

    const optionLabel = (f, v) => (Array.isArray(f?.options) ? f.options.find((o) => String(o.value) === String(v))?.label : null) ?? v;
    const show = (r, k) => {
      const v = r.data?.[k];
      if (v == null || v === '') return '';
      if (r.labels?.[k]) return r.labels[k];
      const f = byName.get(k);
      if (Array.isArray(v)) return v.map((x) => optionLabel(f, x)).join('; ');
      if (f?.options?.length) return optionLabel(f, v);
      if (v instanceof Date) return f?.field_type === 'date' ? v.toISOString().slice(0, 10) : v.toISOString();
      if (f?.field_type === 'date' && /^\d{4}-\d{2}-\d{2}T00:00:00(\.000)?Z$/.test(String(v))) return String(v).slice(0, 10);
      return typeof v === 'object' ? JSON.stringify(v) : v;
    };
    const cell = (v) => { const t = String(v ?? ''); return /[",\r\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t; };
    const headers = [...base.map(([h]) => h), ...keys.map((k) => byName.get(k)?.label ?? k)];
    const rows = hydrated.map((r) => [...base.map(([, get]) => get(r)), ...keys.map((k) => show(r, k))].map(cell).join(','));
    return [headers.map(cell).join(','), ...rows].join('\r\n');
  }
}

/**
 * Forget the per-process metadata memos (object names, field defaults, PII
 * flags, which objects read which) — the Builder calls this on every field or
 * object write so a change applies at once, not when a TTL runs out.
 */
RecordService.clearMetadataCaches = () => {
  for (const m of [OBJECT_NAMES, FIELD_DEFAULTS, CHILD_READERS, PII_CACHE]) m.clear();
};

module.exports = RecordService;
