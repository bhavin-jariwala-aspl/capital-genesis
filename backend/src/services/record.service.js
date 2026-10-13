'use strict';

const { NotFoundError, AuthorizationError, ValidationError } = require('../utils/errors');
const { Decimal } = require('@prisma/client/runtime/library');
const { ROLE_LEVEL, ADMIN_THRESHOLD, MANAGER_THRESHOLD } = require('../middleware/authenticate');
const { getTenantId } = require('../middleware/tenant-scope');
const { logger } = require('./logging.service');
const { leadScoreGrade } = require('../utils/lead-grade');
const { validateValues } = require('./validation-engine');

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
  INSURANCE_OBJECTS,
  toTypedValue,
  fromTypedRow,
} = require('./crm-storage-map');

/**
 * RecordService — CRUD for UiRecord rows.
 * Records are thin anchors for activities, tasks, and audit_logs.
 * CRM field values are stored in the crm_* relational tables, not here.
 * Writes audit_logs on create / update / stage-change / delete.
 */
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
  constructor(prisma, eventBus = null, permService = null, assignService = null, scoringService = null) {
    this.db         = prisma;
    this.eventBus   = eventBus;
    this.perm       = permService;
    this.assignSvc  = assignService;
    this.scoringSvc = scoringService;
    // Per-key lock map for auto-number generation (RC-04).
    // Serialises concurrent createRecord calls for the same field so they
    // never compute the same next value.
    this.#autoNumLocks = new Map();
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

  // Hydrate a single record: attach CRM entity fields as `data`.
  // Merges EAV custom fields with CRM entity data (non-null CRM wins),
  // consistent with #hydrateMany behavior.
  async #hydrateCrm(record) {
    const full = await this.db.record.findUnique({
      where:   { id: record.id },
      include: {
        crm_lead:        true,
        crm_lead_intake: true,
        crm_contact:     true,
        crm_account:     true,
        crm_opportunity: true,
        crm_case:        true,
        product:         true,
        quote:           true,
        email_template:  true,
      },
    });
    if (!full) return record;

    // Always load EAV fields — forms may use a mix of CRM + custom fields
    const eavRows = await this.db.recordFieldValue.findMany({
      where: { record_id: record.id },
    });
    const eav = Object.fromEntries(
      eavRows.map(r => [r.field_name, RecordService.#readTypedValue(r)]),
    );

    const entity = full.crm_lead ?? full.crm_lead_intake ?? full.crm_contact ?? full.crm_account
                ?? full.crm_opportunity ?? full.crm_case ?? full.product ?? full.quote
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
    if (this.db.quote?.findMany) {
      optionalQueries.push(this.db.quote.findMany({ where: { record_id: { in: ids } } }));
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

    const [leads, contacts, accounts, opportunities, cases, eavRows, products, quotes, emailTemplates, leadIntakes] = await Promise.all([
      ...coreQueries,
      ...optionalQueries,
    ]);
    const crmByRecordId = new Map();
    const entitySets = [
      [leads, 'lead'], [contacts, 'contact'], [accounts, 'account'],
      [opportunities, 'opportunity'], [cases, 'case'],
      [leadIntakes, 'lead_intake'],
      [products, null], [quotes, null], [emailTemplates, null],
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
    //  - EAV fields provide the base (custom / insurance-specific values)
    //  - CRM canonical fields take precedence ONLY when non-null
    // This ensures records with a first-class CRM entity ALSO surface any
    // additional form-saved EAV fields (e.g. date_of_birth, smoker_status)
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
  async #assertValid(objectId, values, { partial, recordId }) {
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

    // Insurance domain objects — bridge to domain tables + save all to EAV
    if (INSURANCE_OBJECTS.has(obj.name)) {
      logger?.info?.('[RecordService] Insurance bridge triggered', { recordId, objectName: obj.name, fieldCount: Object.keys(crmData).length });
      // Save EAV and sync to insurance domain — run sequentially so both complete
      const results = await Promise.allSettled([
        this.#upsertCustomFieldValues(recordId, crmData, objectId, tenantId),
        this.#syncInsuranceDomain(recordId, obj.name, crmData, tenantId),
      ]);
      for (const [i, r] of results.entries()) {
        if (r.status === 'rejected') {
          logger?.error?.(`[RecordService] Insurance bridge step ${i} failed`, { recordId, error: r.reason?.message });
        }
      }
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

  // ── Insurance domain bridge ──────────────────────────────────────────────
  // When a CRM module record (application, policy, etc.) is created/updated,
  // sync key fields to the corresponding insurance domain table so the
  // INSURANCE section (Applications, Policies, etc.) stays in sync.

  async #syncInsuranceDomain(recordId, objectName, data, tenantId) {
    try {
      logger?.info?.('[RecordService] Insurance domain sync', { recordId, objectName, tenantId, fieldCount: Object.keys(data).length });
      if (objectName === 'application') {
        await this.#syncInsuranceApplication(recordId, data, tenantId);
      }
      // Future: policy, claim, etc. can be added here
    } catch (err) {
      logger?.warn?.('[RecordService] Insurance domain sync failed', {
        recordId, objectName, error: err.message,
      });
    }
  }

  async #syncInsuranceApplication(recordId, data, tenantId) {
    // ── Resolve or create CrmContact from applicant details ────────────
    // Note: we do NOT pre-read the existing application here to avoid
    // the RC-06 findUnique→create gap; upsert below handles that atomically.
    const firstName = data.wiz_first_name || data.first_name || '';
    const lastName  = data.wiz_last_name  || data.last_name  || '';
    const email     = data.wiz_email      || data.email      || '';
    const phone     = data.wiz_phone      || data.phone      || '';
    const dob       = data.wiz_dob || data.wiz_date_of_birth || data.date_of_birth || null;

    let contactId = null;
    if (email || (firstName && lastName)) {
      // Try to find existing contact by email first, then by name
      let contact = null;
      if (email) {
        contact = await this.db.crmContact.findFirst({
          where: { email, tenant_id: tenantId },
        });
      }
      if (!contact && firstName && lastName) {
        contact = await this.db.crmContact.findFirst({
          where: { first_name: firstName, last_name: lastName, tenant_id: tenantId },
        });
      }
      if (!contact) {
        // RC-05 fix: catch unique constraint violation from a concurrent create
        // for the same contact and fall back to a lookup.
        try {
          contact = await this.db.crmContact.create({
            data: {
              first_name: firstName,
              last_name:  lastName,
              email:      email || null,
              phone:      phone || null,
              birthdate:  dob ? new Date(dob) : null,
              tenant_id:  tenantId,
            },
          });
        } catch (err) {
          if (err.code === 'P2002') {
            // Another concurrent request just created this contact — find it
            contact = email
              ? await this.db.crmContact.findFirst({ where: { email, tenant_id: tenantId } })
              : await this.db.crmContact.findFirst({ where: { first_name: firstName, last_name: lastName, tenant_id: tenantId } });
          } else {
            throw err;
          }
        }
      } else if (dob && !contact.birthdate) {
        // Update existing contact with DOB if missing
        await this.db.crmContact.update({
          where: { id: contact.id },
          data: { birthdate: new Date(dob) },
        });
      }
      contactId = contact?.id ?? null;
    }

    const appData = {
      product_type:      data.product_type || data.wiz_product_type || 'term_life',
      product_name:      data.product_name || data.wiz_product_name || null,
      coverage_amount:   Number(data.coverage_amount || data.wiz_coverage_amount) || 0,
      premium_amount:    Number(data.premium || data.premium_amount) || null,
      age:               Number(data.age || data.wiz_age) || null,
      gender:            data.gender || data.wiz_gender || null,
      date_of_birth:     dob ? new Date(dob) : null,
      is_smoker:         data.smoker_status === 'current' || data.wiz_smoker_status === 'current' || false,
      health_class:      data.health_class || data.wiz_health_class || null,
      term_years:        Number(data.term_years || data.wiz_term_years) || null,
      payment_frequency: data.payment_frequency || data.wiz_payment_frequency || null,
      notes:             data.notes || null,
      status:            data.status || 'submitted',
      submitted_at:      data.submitted_date ? new Date(data.submitted_date) : new Date(),
      contact_id:        contactId,
    };

    // RC-06 fix: replace findUnique→create/update with an atomic upsert on record_id.
    const appNumber = data.application_number
      || `APP-${new Date().getFullYear()}-${String(Date.now()).slice(-6)}`;

    // Build selective update (don't overwrite non-empty fields with empty values)
    const updateData = {};
    for (const [k, v] of Object.entries(appData)) {
      if (v != null && v !== '' && v !== 0) updateData[k] = v;
    }

    await this.db.insuranceApplication.upsert({
      where:  { record_id: Number(recordId) },
      create: {
        record_id:  Number(recordId),
        app_number: appNumber,
        ...appData,
        created_by: data.created_by || null,
        tenant_id:  tenantId,
      },
      update: updateData,
    });
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

      // Serialise concurrent auto-number generation for this field (RC-04).
      // The lock ensures only one request reads the current max and writes
      // the next value at a time within this process.
      const lockKey = `${tenantId ?? 0}:${objectId}:${field.name}`;
      await this.#withAutoNumLock(lockKey, async () => {
        const where = { field_name: field.name, str_value: { startsWith: searchPrefix } };
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
        crmData[field.name] = `${searchPrefix}${String(nextNum).padStart(3, '0')}`;
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
    const entries = Object.entries(fieldData);
    const CHUNK = 5;

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
   * Verify the viewer is allowed to access a specific record.
   * Throws NotFoundError (not AuthorizationError) to avoid leaking record existence
   * to users who have no permission to see it.
   * Pass a pre-loaded record object to avoid an extra DB round-trip.
   */
  async #assertAccess(recordOrId, viewer) {
    if (!viewer) return;
    const { role, employee_id } = viewer;
    const level = viewer.role_level ?? ROLE_LEVEL[role] ?? 0;
    if (level <= ADMIN_THRESHOLD) return;

    const record = (recordOrId && typeof recordOrId === 'object')
      ? recordOrId
      : await this.db.record.findUnique({
          where:  { id: Number(recordOrId) },
          select: { id: true, created_by: true, assigned_to: true },
        });
    if (!record) throw new NotFoundError('Record');

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
    // Legacy: a standalone lead_score object (removed from new seeds) is served
    // read-only from the LeadScore table. Kept for tenants that still have it.
    if (obj?.name === 'lead_score') {
      return this.#getLeadScoreRecords(Number(objectId), stageId, viewer);
    }

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
    const hydrated = await this.#hydrateMany(records);
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
    const hydrated = await this.#hydrateCrm(record);
    if (record.object?.name === 'lead_intake') {
      const [withScore] = await this.#attachLeadScores([hydrated]);
      return withScore;
    }
    return hydrated;
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

  /**
   * Build read-only "records" for the lead_score object from the LeadScore
   * table. Each score is mapped to the object's field shape (lead_name, email,
   * company, total_score, grade, scored_at, scoring_details) and, when the
   * object has a grade pipeline, placed in the matching grade column.
   */
  async #getLeadScoreRecords(objectId, stageId, viewer) {
    const tenantId = Number(viewer?.tenant_id) || getTenantId();
    const [scores, stages] = await Promise.all([
      this.db.leadScore.findMany({
        where: tenantId ? { tenant_id: tenantId } : {},
        orderBy: { total_score: 'desc' },
        include: {
          lead:        { select: { first_name: true, last_name: true, email: true, company: true } },
          lead_intake: { select: { first_name: true, last_name: true, email: true, company: true } },
        },
      }),
      this.db.uiPipelineStage.findMany({
        where: { pipeline: { object_id: Number(objectId) } },
        select: { id: true, name: true, label: true, color: true },
      }),
    ]);

    const stageByName = Object.fromEntries(stages.map(s => [s.name, s]));
    const gradeStageName = { A: 'grade_a', B: 'grade_b', C: 'grade_c', D: 'grade_d', F: 'grade_f' };

    let records = scores.map((s) => {
      const grade = leadScoreGrade(s.total_score);
      const stage = stageByName[gradeStageName[grade]] ?? null;
      // Scores may reference a Lead (crm_lead_intake) or a legacy Prospect (crm_leads).
      const entity = s.lead_intake ?? s.lead;
      const name = [entity?.first_name, entity?.last_name].filter(Boolean).join(' ');
      return {
        id: s.id,
        object_id: Number(objectId),
        pipeline_stage_id: stage?.id ?? null,
        pipeline_stage: stage
          ? { id: stage.id, label: stage.label, color: stage.color, name: stage.name }
          : null,
        created_at: s.calculated_at,
        _readonly: true,
        data: {
          lead_name:       name || (entity?.email ?? '—'),
          email:           entity?.email ?? null,
          company:         entity?.company ?? null,
          total_score:     s.total_score,
          grade,
          scored_at:       s.calculated_at,
          scoring_details: RecordService.#summarizeScoringDetails(s.scoring_details),
        },
      };
    });

    if (stageId != null && stageId !== '') {
      records = records.filter(r => r.pipeline_stage_id === Number(stageId));
    }
    return records;
  }

  /** Render the LeadScore.scoring_details JSON into a readable summary string. */
  static #summarizeScoringDetails(details) {
    if (!details || typeof details !== 'object') return null;
    const rules = Array.isArray(details.rules) ? details.rules : [];
    if (!rules.length) return 'No scoring rules matched.';
    return rules
      .map(r => `${r.rule_name ?? r.field ?? 'Rule'}: ${r.points >= 0 ? '+' : ''}${r.points} pts`)
      .join('\n');
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
    // A draft (e.g. Quote → Apply Now, completed later in the wizard) is checked
    // like a patch: submitted values must be valid, absent ones may come later.
    await this.#assertValid(objectId, crmData ?? {}, { partial: draft, recordId: null });
    // ── Auto-number generation for fields with auto_number config ─────────
    if (crmData) {
      await this.#generateAutoNumbers(objectId, crmData, tenantId);
    }
    const record = await this.db.record.create({
      data: {
        object_id:         Number(objectId),
        pipeline_stage_id: stageId ? Number(stageId) : null,
        created_by:        createdBy ?? null,
        assigned_to:       assignedTo ?? null,
        tenant_id:         tenantId,
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
    return this.#hydrateCrm(record);
  }

  async updateRecord(id, updatedBy, viewer, assignedTo = undefined, crmData = null) {
    const existing = await this.db.record.findUnique({ where: { id: Number(id) } });
    if (!existing) throw new NotFoundError('Record');
    await this.#assertAccess(existing, viewer);
    await this.#assertObjectEditPermission(existing.object_id, viewer);

    const updatePayload = {};
    if (assignedTo !== undefined) updatePayload.assigned_to = assignedTo ?? null;
    const tenantId = Number(viewer?.tenant_id) || existing.tenant_id || getTenantId();

    // Only the submitted fields are validated on update (a partial patch must
    // not fail because an untouched required field is missing from the body).
    if (crmData) await this.#assertValid(existing.object_id, crmData, { partial: true, recordId: Number(id) });

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
    return this.#hydrateCrm(updated);
  }

  async updateRecordStage(id, stageId, updatedBy, viewer) {
    const existing = await this.db.record.findUnique({ where: { id: Number(id) } });
    if (!existing) throw new NotFoundError('Record');
    await this.#assertAccess(existing, viewer);
    await this.#assertObjectEditPermission(existing.object_id, viewer);
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
