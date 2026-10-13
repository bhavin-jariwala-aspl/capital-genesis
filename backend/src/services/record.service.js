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
/** Which `Record` relation holds an object's first-class entity row. */
const ENTITY_RELATION = {
  lead: 'crm_lead', prospect: 'crm_lead', lead_intake: 'crm_lead_intake', contact: 'crm_contact',
  account: 'crm_account', opportunity: 'crm_opportunity', case: 'crm_case',
  product: 'product', email_template: 'email_template',
};

/** object id → API name (see #objectName). */
const OBJECT_NAMES = new Map();

/** Highest auto-number handed out per sequence in this process (see #generateAutoNumbers). */
const ISSUED_AUTO_NUMBERS = new Map();

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
      const lookups = await this.db.uiField.findMany({
        where:  { object_id: Number(objectId), is_active: true, field_type: 'lookup' },
        select: { name: true },
      });
      const parentIds = [...new Set(lookups.map((f) => Number(values?.[f.name])).filter((n) => Number.isInteger(n) && n > 0))];
      // Bulk loads (vertical installs, imports) collect parents and recompute
      // them once at the end instead of once per child.
      if (this.deferredParents) { for (const pid of parentIds) this.deferredParents.add(pid); return; }
      for (const pid of parentIds) {
        const parent = await this.db.record.findUnique({ where: { id: pid }, select: { id: true, object_id: true, deleted_at: true, tenant_id: true } });
        if (!parent || parent.deleted_at) continue;
        const formulas = await this.compute.formulaFields(parent.object_id);
        if (!formulas.length) continue;
        const data = { ...(await this.#loadData(pid)) };
        const changed = await this.#writeChangedFormulas(parent, data, formulas);
        // Roll-ups of roll-ups (household ← party ← holding) follow one more level.
        if (changed && depth < 2) await this.#refreshParents(parent.object_id, data, depth + 1);
      }
    } catch (err) {
      logger?.warn?.('[RecordService] parent formula refresh failed', { objectId, error: err.message });
    }
  }

  /** Recompute a record's formulas and write only the values that changed. Returns whether any did. */
  async #writeChangedFormulas(rec, data, formulas) {
    const before = { ...data };
    const names = await this.compute.applyFormulas(rec.object_id, data, rec.id, formulas);
    const changed = names.filter((n) => String(before[n] ?? '') !== String(data[n] ?? ''));
    if (changed.length) {
      await this.#upsertCustomFieldValues(rec.id, Object.fromEntries(changed.map((n) => [n, data[n]])), rec.object_id, rec.tenant_id);
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
    }
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
      select: { name: true, data_type: true },
    });
    return new Map(fields.map(f => [f.name, f.data_type ?? 'string']));
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
            ...RecordService._typedValuePublic(value, typeMap.get(fieldName) ?? 'string'),
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
        const dataType = typeMap.get(fieldName) ?? 'string';
        const typed    = RecordService._typedValuePublic(value, dataType);
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
    const level = viewer.role_level ?? ROLE_LEVEL[role] ?? 0;
    if (level <= ADMIN_THRESHOLD) return {};
    if (level <= MANAGER_THRESHOLD) {
      const rows = await this.db.employeeHierarchy.findMany({
        where:  { ancestor_id: employee_id, depth: { gt: 0 } },
        select: { descendant_id: true },
      });
      const ids = [employee_id, ...rows.map(r => r.descendant_id)];
      return { created_by: { in: ids } };
    }
    // user — own records + records explicitly assigned to them
    return { OR: [{ created_by: employee_id }, { assigned_to: employee_id }] };
  }

  /**
   * Re-evaluate a record's formula fields (and its parents' roll-ups) after
   * something other than this service changed it — a workflow action, an
   * update_related step. Writes straight to the typed field table; no events.
   */
  async recompute(recordId) {
    const rec = await this.db.record.findUnique({ where: { id: Number(recordId) }, select: { id: true, object_id: true, tenant_id: true, deleted_at: true } });
    if (!rec || rec.deleted_at) return;
    const formulas = await this.compute.formulaFields(rec.object_id).catch(() => []);
    const data = { ...(await this.#loadData(rec.id)) };
    const changed = formulas.length ? await this.#writeChangedFormulas(rec, data, formulas) : false;
    if (changed || !formulas.length) await this.#refreshParents(rec.object_id, data);
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
    const level = viewer.role_level ?? ROLE_LEVEL[role] ?? 0;

    const record = (recordOrId && typeof recordOrId === 'object')
      ? recordOrId
      : await this.db.record.findUnique({
          where:  { id: Number(recordOrId) },
          select: { id: true, created_by: true, assigned_to: true, business_unit_id: true, barrier_zone_id: true },
        });
    if (!record) throw new NotFoundError('Record');
    // Unit and barrier scope apply to every role (barriers bind admins too).
    if (!this.scope.canSee(await this.scope.forViewer(viewer), record)) throw new NotFoundError('Record');
    if (level <= ADMIN_THRESHOLD) return;

    if (level <= MANAGER_THRESHOLD) {
      const rows = await this.db.employeeHierarchy.findMany({
        where:  { ancestor_id: employee_id, depth: { gte: 0 } },
        select: { descendant_id: true },
      });
      const allowed = new Set(rows.map(r => r.descendant_id));
      if (!allowed.has(record.created_by)) throw new NotFoundError('Record');
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
    const hydrated = await this.#attachLookupLabels(Number(objectId), await this.#hydrateMany(records));
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
    const [hydrated] = await this.#attachLookupLabels(record.object_id, [await this.#hydrateCrm(record)]);
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

  async #attachLookupLabels(objectId, records) {
    if (!records.length) return records;
    const lookups = await this.#lookupFields(objectId);
    if (!lookups.length) return records;
    const labelsByField = new Map();
    for (const lf of lookups) {
      const ids = [...new Set(records.map((r) => Number(r.data?.[lf.name])).filter((n) => Number.isInteger(n) && n > 0))];
      labelsByField.set(lf.name, await this.#titlesFor(lf.targetObjectId, ids));
    }
    return records.map((r) => {
      const labels = {};
      for (const [field, titles] of labelsByField) {
        const id = Number(r.data?.[field]);
        if (Number.isInteger(id) && id > 0) labels[field] = titles.get(id) ?? `#${id}`;
      }
      return Object.keys(labels).length ? { ...r, labels } : r;
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
      select: { name: true, label: true, object: { select: { id: true, name: true, label: true, plural_label: true, module_id: true } } },
    });
    const access = await this.#ownerFilter(viewer);
    const out = [];
    for (const f of incoming) {
      const where = {
        field_name: f.name,
        str_value:  String(record.id),
        record:     { object_id: f.object.id, deleted_at: null, ...access },
      };
      const [rows, total] = await Promise.all([
        this.db.recordFieldValue.findMany({ where, select: { record_id: true }, take: perRelation, orderBy: { record_id: 'desc' } }),
        this.db.recordFieldValue.count({ where }),
      ]);
      const ids = rows.map((r) => r.record_id);
      const [titles, anchors] = await Promise.all([
        this.#titlesFor(f.object.id, ids),
        this.db.record.findMany({
          where:  { id: { in: ids } },
          select: { id: true, created_at: true, pipeline_stage: { select: { label: true, color: true } } },
        }),
      ]);
      const anchorById = new Map(anchors.map((a) => [a.id, a]));
      out.push({
        object: f.object,
        field:  { name: f.name, label: f.label },
        total,
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
    if (crmData) await this.compute.applyFormulas(objectId, crmData, null);
    await this.#assertValid(objectId, crmData ?? {}, { partial: draft, recordId: null });
    // ── Auto-number generation for fields with auto_number config ─────────
    if (crmData) {
      await this.#generateAutoNumbers(objectId, crmData, tenantId);
    }
    const stamp = crmData ? await this.scope.stampFor(objectId, crmData) : {};
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
    if (!assignedTo && this.assignSvc) {
      this.assignSvc.assign(Number(objectId), record.id, {}).catch(() => {});
    }
    // ── Emit domain event: record.created ─────────────────────────────────
    this.#emit('record.created', { objectId, record, actorId: createdBy });
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

    const updatePayload = crmData ? await this.scope.stampFor(existing.object_id, crmData) : {};
    if (assignedTo !== undefined) updatePayload.assigned_to = assignedTo ?? null;
    const tenantId = Number(viewer?.tenant_id) || existing.tenant_id || getTenantId();

    // Only the submitted fields are validated on update (a partial patch must
    // not fail because an untouched required field is missing from the body).
    if (crmData) {
      // Formulas and formula rules see the stored record overlaid with this
      // patch. Loaded only when the object actually has either, so a plain
      // update costs no extra read.
      let merged = null;
      const getMerged = async () => (merged ??= { ...(await this.#loadData(id)), ...crmData });
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
    // ── Re-score leads/prospects when their CRM data changes ──────────────
    if (crmData) this.#maybeScoreLead(Number(id), existing.object_id, tenantId);
    if (crmData) await this.#refreshParents(existing.object_id, crmData);
    return this.#hydrateCrm(updated);
  }

  /**
   * Stage gates — Builder-configured conditions for entering a stage:
   *   stage.config.required_fields  fields that must be filled
   *   stage.config.entry_rule       { expression, message } — a formula that
   *                                 must be true (e.g. "KYC approved and
   *                                 security perfected" before disbursement)
   * Enforced here, so Kanban drags, API calls, bulk moves and workflow moves
   * all obey the same rule.
   */
  async #assertStageGate(recordId, stageId) {
    if (!stageId || typeof this.db.uiPipelineStage?.findUnique !== 'function') return;
    const stage = await this.db.uiPipelineStage.findUnique({ where: { id: Number(stageId) }, select: { label: true, config: true } });
    const cfg = stage?.config ?? {};
    const required = Array.isArray(cfg.required_fields) ? cfg.required_fields : [];
    if (!required.length && !cfg.entry_rule?.expression) return;
    const data = (await this.#loadData(recordId)) ?? {};
    const blank = (v) => v === null || v === undefined || v === '' || (Array.isArray(v) && !v.length);
    const missing = required.filter((f) => blank(data[f]));
    if (missing.length) {
      const err = new ValidationError(`Complete ${missing.join(', ')} before moving to ${stage.label}`);
      err.details = missing.map((f) => ({ field: f, message: `Required for ${stage.label}` }));
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

  async updateRecordStage(id, stageId, updatedBy, viewer) {
    const existing = await this.db.record.findUnique({ where: { id: Number(id) } });
    if (!existing) throw new NotFoundError('Record');
    await this.#assertAccess(existing, viewer);
    await this.#assertObjectEditPermission(existing.object_id, viewer);
    if (stageId && Number(stageId) !== existing.pipeline_stage_id) await this.#assertStageGate(existing.id, stageId);
    const tenantId = Number(viewer?.tenant_id) || existing.tenant_id || getTenantId();
    const updated = await this.db.record.update({
      where: { id: Number(id) },
      data:  { pipeline_stage_id: stageId ? Number(stageId) : null },
      // config included so callers can read metadata flags (e.g. is_conversion_stage)
      // instead of matching hardcoded stage names.
      include: { pipeline_stage: { select: { id: true, label: true, color: true, name: true, config: true } } },
    });
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
      changed:  { pipeline_stage_id: { old: existing.pipeline_stage_id, new: stageId ?? null } },
      actorId:  updatedBy,
    });
    return updated;
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
    if (mode === 'hard') {
      return this.db.record.delete({ where: { id: Number(id) } });
    }
    return this.db.record.update({
      where: { id: Number(id) },
      data:  { deleted_at: new Date(), deleted_by: deletedBy ?? null },
    });
  }

  // ── Bulk operations ────────────────────────────────────────────────────────

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

    if (softIds.length) {
      await this.db.record.updateMany({
        where: { id: { in: softIds } },
        data:  { deleted_at: new Date(), deleted_by: deletedBy ?? null },
      });
    }
    if (hardIds.length) {
      await this.db.record.deleteMany({ where: { id: { in: hardIds } } });
    }
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
    for (const rid of numIds) await this.#assertStageGate(rid, stageId);
    // Fetch existing records for workflow triggers
    const existingRecords = await this.db.record.findMany({
      where: { id: { in: numIds } },
      select: { id: true, object_id: true, pipeline_stage_id: true },
    });
    await this.db.record.updateMany({
      where: { id: { in: numIds } },
      data:  { pipeline_stage_id: stageId ? Number(stageId) : null },
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
    // Emit domain events for each record
    for (const rec of existingRecords) {
      const updated = { ...rec, pipeline_stage_id: stageId ? Number(stageId) : null };
      this.#emit('record.updated', { objectId: rec.object_id, record: updated, actorId: updatedBy });
      this.#emit('record.field_changed', {
        objectId: rec.object_id,
        record:   updated,
        changed:  { pipeline_stage_id: { old: rec.pipeline_stage_id, new: stageId ?? null } },
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

  async exportRecordsCsv(objectId, viewer) {
    const ownerWhere = await this.#ownerFilter(viewer);
    const anchors = await this.db.record.findMany({
      where:   { object_id: Number(objectId), deleted_at: null, ...ownerWhere },
      orderBy: { created_at: 'desc' },
      include: { pipeline_stage: { select: { label: true } } },
      take:    EXPORT_MAX_ROWS,
    });
    if (!anchors.length) return 'id,stage,assigned_to,created_by,created_at\r\n';

    const hydrated = await this.#hydrateMany(anchors);
    // Collect all CRM field keys present across all records
    const crmKeys = [...new Set(hydrated.flatMap(r => Object.keys(r.data ?? {})))];
    const headers = ['id', 'stage', 'assigned_to', 'created_by', 'created_at', ...crmKeys];
    const rows = hydrated.map(r => {
      const base = [
        r.id,
        r.pipeline_stage?.label ?? '',
        r.assigned_to ?? '',
        r.created_by ?? '',
        r.created_at.toISOString(),
      ];
      const crmVals = crmKeys.map(k => {
        const v = r.data?.[k];
        return v == null ? '' : String(v).replace(/,/g, ';'); // escape commas
      });
      return [...base, ...crmVals].join(',');
    });

    return [headers.join(','), ...rows].join('\r\n');
  }
}

module.exports = RecordService;
