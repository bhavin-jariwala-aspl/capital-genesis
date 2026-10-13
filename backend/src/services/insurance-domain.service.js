'use strict';

const { logger } = require('./logging.service');

/**
 * Coerce a required date from the first non-empty candidate. Empty string / null
 * / undefined are skipped (so `''` never becomes `new Date('')` = Invalid Date,
 * and `null` never becomes the 1970 epoch). Throws a 400 if none is a valid date.
 */
function firstValidDate(candidates, fieldName) {
  for (const c of candidates) {
    if (c === undefined || c === null || c === '') continue;
    const d = new Date(c);
    if (!Number.isNaN(d.getTime())) return d;
  }
  throw Object.assign(new Error(`${fieldName} is required and must be a valid date`), { statusCode: 400 });
}

/**
 * InsuranceDomainService — First-class insurance CRM/AMS operations.
 *
 * Covers the full insurance operating model:
 *   carrier / product catalogue
 *   policy lifecycle (pending → active → lapsed / matured / surrendered)
 *   application → underwriting → policy issuance
 *   claim filing and timeline
 *   commission tracking
 *
 * Reuses the existing CRM platform for:
 *   activities, tasks, documents, email, workflows, audit logs, assignments
 *
 * Tenant isolation is enforced on every query via tenant_id.
 */
class InsuranceDomainService {
  /**
   * @param {import('@prisma/client').PrismaClient} prisma
   */
  constructor(prisma) {
    this.db = prisma;
  }

  // ── private helpers ───────────────────────────────────────────────────────

  /**
   * Generate a sequence-like number for policies / apps / claims / UW cases.
   * Format: PREFIX-YYYY-NNNNNN  (e.g. POL-2026-000042)
   * Uses MAX(id)+1 per prefix — good enough for an AMS, not for high-frequency trading.
   */
  /**
   * Retry wrapper — on a Prisma P2002 unique-constraint violation (concurrent
   * sequence collision) the entire transaction is retried with a fresh seq scan.
   */
  async #withRetry(fn, maxAttempts = 5) {
    let lastErr;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        return await fn();
      } catch (err) {
        if (err.code === 'P2002' && attempt < maxAttempts - 1) {
          // Exponential backoff: 100-200ms, 200-400ms, 400-800ms, 800-1600ms
          const base = 100 * Math.pow(2, attempt);
          await new Promise(r => setTimeout(r, base + Math.random() * base));
          lastErr = err;
          continue;
        }
        throw err;
      }
    }
    throw lastErr;
  }

  /**
   * Sequence generator — uses raw SQL with a locking read to avoid the
   * REPEATABLE READ phantom-read problem that caused duplicate sequence
   * numbers under concurrent transactions.
   *
   * The table-name mapping converts Prisma model names to actual DB table
   * names so the raw query works.
   */
  static #TABLE_MAP = {
    insuranceApplication: 'insurance_applications',
    insurancePolicy:      'insurance_policies',
    underwritingCase:     'underwriting_cases',
    insuranceClaim:       'insurance_claims',
    commissionEntry:      'commission_entries',
    policyEndorsement:    'policy_endorsements',
    policyInvoice:        'policy_invoices',
    commissionStatement:  'commission_statements',
  };

  async #nextSeq(prefix, modelName, field, tx, tenantId) {
    // Use raw SQL with FOR UPDATE inside the transaction to get an exclusive
    // lock on the max row.  This avoids the REPEATABLE READ snapshot isolation
    // problem where concurrent transactions read the same max value.
    //
    // The raw query bypasses the tenant-scope Prisma extension, so tenant
    // isolation MUST be enforced explicitly here — otherwise one tenant's max
    // determines another tenant's next number and cross-tenant issuance
    // contends on the same FOR UPDATE rows.
    const tableName = InsuranceDomainService.#TABLE_MAP[modelName] ?? modelName;
    const columnName = field;
    const year = new Date().getFullYear();
    const likePattern = `${prefix}-${year}-%`;

    const rows = tenantId != null
      ? await tx.$queryRawUnsafe(
          `SELECT ${columnName} FROM ${tableName} WHERE tenant_id = ? AND ${columnName} LIKE ? ORDER BY ${columnName} DESC LIMIT 1 FOR UPDATE`,
          tenantId, likePattern,
        )
      : await tx.$queryRawUnsafe(
          `SELECT ${columnName} FROM ${tableName} WHERE ${columnName} LIKE ? ORDER BY ${columnName} DESC LIMIT 1 FOR UPDATE`,
          likePattern,
        );

    let seq = 1;
    if (rows.length > 0 && rows[0][columnName]) {
      const match = rows[0][columnName].match(/-(\d+)$/);
      if (match) seq = parseInt(match[1], 10) + 1;
    }
    return `${prefix}-${year}-${String(seq).padStart(6, '0')}`;
  }

  /** Record a policy status change in history + write an Activity on the record */
  async #policyStatusChange(tx, policy, newStatus, reason, changedBy, tenantId) {
    await tx.insurancePolicyStatusHistory.create({
      data: {
        policy_id:   policy.id,
        from_status: policy.status,
        to_status:   newStatus,
        reason:      reason ?? null,
        changed_by:  changedBy ?? null,
        tenant_id:   tenantId,
      },
    });

    if (policy.record_id) {
      await tx.activity.create({
        data: {
          record_id:   policy.record_id,
          employee_id: changedBy ?? 'SYSTEM',
          type:        'note',
          subject:     `Policy status: ${policy.status} → ${newStatus}`,
          description: reason ?? `Status changed to ${newStatus}`,
          tenant_id:   tenantId,
        },
      }).catch((err) => {
        logger?.warn?.('[InsuranceDomain] Activity creation failed for policy status change', { policyId: policy.id, error: err.message });
      });
    }
  }

  /**
   * Sync a CRM record's pipeline_stage_id when the insurance domain status changes.
   * Looks up the pipeline stage by name for the record's object, then updates.
   * Runs fire-and-forget — pipeline sync failures should not block domain operations.
   */
  async #syncPipelineStage(tx, recordId, statusName) {
    if (!recordId || !statusName) return;
    try {
      const record = await tx.record.findUnique({ where: { id: recordId }, select: { object_id: true } });
      if (!record) return;
      const stage = await tx.uiPipelineStage.findFirst({
        where: {
          name: statusName,
          pipeline: { object_id: record.object_id },
        },
        select: { id: true },
      });
      if (stage) {
        await tx.record.update({ where: { id: recordId }, data: { pipeline_stage_id: stage.id } });
      }
    } catch (err) {
      logger?.warn?.('[InsuranceDomain] Pipeline stage sync failed', { recordId, statusName, error: err.message });
    }
  }

  /**
   * Create a CRM Record anchor + EAV field values for an insurance domain entity.
   * This ensures the entity appears in the metadata-driven module list views.
   */
  async #createRecordWithEav(tx, objectName, fields, createdBy, assignedTo, tenantId) {
    try {
      const obj = await tx.uiObject.findFirst({ where: { name: objectName }, select: { id: true } });
      if (!obj) return null;
      // Find the pipeline stage matching the status field (if any)
      let stageId = null;
      if (fields.status) {
        const stage = await tx.uiPipelineStage.findFirst({
          where: { name: fields.status, pipeline: { object_id: obj.id } },
          select: { id: true },
        });
        stageId = stage?.id ?? null;
      }
      const record = await tx.record.create({
        data: {
          object_id: obj.id,
          created_by: createdBy ?? null,
          assigned_to: assignedTo ?? createdBy ?? null,
          pipeline_stage_id: stageId,
          tenant_id: tenantId,
        },
      });
      // Write EAV rows for all provided fields
      const eavRows = [];
      for (const [name, val] of Object.entries(fields)) {
        if (val == null) continue;
        const row = { record_id: record.id, field_name: name, tenant_id: tenantId };
        if (typeof val === 'number')      { row.num_value = val; row.str_value = String(val); }
        else if (typeof val === 'boolean') { row.bool_value = val; row.str_value = String(val); }
        else                               { row.str_value = String(val); }
        eavRows.push(row);
      }
      if (eavRows.length) {
        await tx.recordFieldValue.createMany({ data: eavRows, skipDuplicates: true });
      }
      return record;
    } catch (err) {
      logger?.warn?.('[InsuranceDomain] Record+EAV creation failed', { objectName, error: err.message });
      return null;
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // CARRIERS
  // ══════════════════════════════════════════════════════════════════════════

  async listCarriers(tenantId, { isActive } = {}) {
    const where = { tenant_id: tenantId };
    if (isActive !== undefined) where.is_active = isActive;
    return this.db.insuranceCarrier.findMany({
      where,
      include: { carrier_products: { where: { is_active: true }, orderBy: { name: 'asc' } } },
      orderBy: { name: 'asc' },
    });
  }

  async getCarrier(id, tenantId) {
    const carrier = await this.db.insuranceCarrier.findFirst({
      where: { id, tenant_id: tenantId },
      include: { carrier_products: { orderBy: { name: 'asc' } } },
    });
    if (!carrier) throw Object.assign(new Error('Carrier not found'), { statusCode: 404 });
    return carrier;
  }

  async createCarrier(data, tenantId) {
    const { name, code, naic_code, am_best_rating, carrier_type, phone, email, website, created_by } = data;
    return this.db.insuranceCarrier.create({
      data: {
        name, code, naic_code, am_best_rating, carrier_type: carrier_type ?? 'life',
        phone, email, website,
        created_by: created_by ?? null,
        tenant_id:  tenantId,
      },
    });
  }

  async updateCarrier(id, data, tenantId) {
    const exists = await this.db.insuranceCarrier.findFirst({ where: { id, tenant_id: tenantId } });
    if (!exists) throw Object.assign(new Error('Carrier not found'), { statusCode: 404 });
    const { name, code, naic_code, am_best_rating, carrier_type, phone, email, website, is_active } = data;
    return this.db.insuranceCarrier.update({
      where: { id },
      data: { name, code, naic_code, am_best_rating, carrier_type, phone, email, website, is_active },
    });
  }

  // ══════════════════════════════════════════════════════════════════════════
  // CARRIER PRODUCTS
  // ══════════════════════════════════════════════════════════════════════════

  async listCarrierProducts(tenantId, { carrierId, productType, isActive } = {}) {
    const where = { tenant_id: tenantId };
    if (carrierId)    where.carrier_id   = carrierId;
    if (productType)  where.product_type = productType;
    if (isActive !== undefined) where.is_active = isActive;
    return this.db.carrierProduct.findMany({
      where,
      include: { carrier: { select: { id: true, name: true, code: true } } },
      orderBy: [{ carrier_id: 'asc' }, { name: 'asc' }],
    });
  }

  async createCarrierProduct(data, tenantId) {
    const { carrier_id, product_type, name, plan_code, description, min_coverage, max_coverage, min_age, max_age } = data;
    return this.db.carrierProduct.create({
      data: { carrier_id, product_type, name, plan_code, description, min_coverage, max_coverage, min_age, max_age, tenant_id: tenantId },
    });
  }

  // ══════════════════════════════════════════════════════════════════════════
  // POLICIES
  // ══════════════════════════════════════════════════════════════════════════

  async listPolicies(tenantId, { status, contactId, agentId, carrierId, renewalBefore, search, limit = 50, offset = 0 } = {}) {
    const where = { tenant_id: tenantId };
    if (status)        where.status     = status;
    if (contactId)     where.contact_id = contactId;
    if (agentId)       where.agent_id   = agentId;
    if (carrierId)     where.carrier_id = carrierId;
    if (renewalBefore) where.renewal_due_date = { lte: new Date(renewalBefore) };
    if (search) {
      where.policy_number = { contains: search };
    }

    const [policies, total] = await Promise.all([
      this.db.insurancePolicy.findMany({
        where,
        include: {
          carrier:   { select: { id: true, name: true, code: true } },
          contact:   { select: { id: true, first_name: true, last_name: true, email: true, phone: true } },
          agent:     { select: { employee_id: true, employee_name: true } },
          beneficiaries: { where: { is_active: true }, orderBy: { beneficiary_type: 'asc' } },
        },
        orderBy: { created_at: 'desc' },
        take: limit,
        skip: offset,
      }),
      this.db.insurancePolicy.count({ where }),
    ]);
    return { policies, total, limit, offset };
  }

  async getPolicy(id, tenantId) {
    const policy = await this.db.insurancePolicy.findFirst({
      where: { id, tenant_id: tenantId },
      include: {
        carrier:         { select: { id: true, name: true, code: true, am_best_rating: true } },
        carrier_product: true,
        contact:         { select: { id: true, first_name: true, last_name: true, email: true, phone: true } },
        account:         { select: { id: true, name: true } },
        agent:           { select: { employee_id: true, employee_name: true, email: true } },
        application:     { select: { id: true, app_number: true, status: true } },
        beneficiaries:   { where: { is_active: true }, orderBy: [{ beneficiary_type: 'asc' }, { allocation_pct: 'desc' }] },
        status_history:  { orderBy: { created_at: 'desc' }, take: 20 },
        claims:          { select: { id: true, claim_number: true, claim_type: true, status: true, amount: true, filed_at: true }, orderBy: { filed_at: 'desc' } },
        commissions:     { select: { id: true, agent_id: true, commission_amount: true, status: true, commission_period: true }, orderBy: { created_at: 'desc' } },
      },
    });
    if (!policy) throw Object.assign(new Error('Policy not found'), { statusCode: 404 });
    return policy;
  }

  async createPolicy(data, tenantId, actorId) {
    const {
      carrier_id, carrier_product_id, contact_id, account_id, agent_id,
      product_type, product_name, coverage_amount, premium_amount, premium_frequency,
      effective_date, expiry_date, renewal_due_date, death_benefit, notes,
      beneficiaries = [],
    } = data;

    return this.#withRetry(() => this.db.$transaction(async (tx) => {
      const policy_number = await this.#nextSeq('POL', 'insurancePolicy', 'policy_number', tx, tenantId);
      const policy = await tx.insurancePolicy.create({
        data: {
          policy_number,
          carrier_id:         carrier_id ?? null,
          carrier_product_id: carrier_product_id ?? null,
          contact_id:         contact_id ?? null,
          account_id:         account_id ?? null,
          agent_id:           agent_id ?? null,
          product_type,
          product_name:       product_name ?? null,
          coverage_amount:    Number(coverage_amount),
          premium_amount:     Number(premium_amount),
          premium_frequency:  premium_frequency ?? 'monthly',
          status:             'active',
          effective_date:     new Date(effective_date),
          expiry_date:        expiry_date  ? new Date(expiry_date)  : null,
          renewal_due_date:   renewal_due_date ? new Date(renewal_due_date) : null,
          death_benefit:      death_benefit ? Number(death_benefit) : null,
          notes:              notes ?? null,
          created_by:         actorId ?? null,
          tenant_id:          tenantId,
        },
      });

      // Write initial status history
      await tx.insurancePolicyStatusHistory.create({
        data: {
          policy_id:   policy.id,
          from_status: null,
          to_status:   'active',
          reason:      'Policy issued',
          changed_by:  actorId ?? null,
          tenant_id:   tenantId,
        },
      });

      // Write beneficiaries
      for (const b of beneficiaries) {
        await tx.insurancePolicyBeneficiary.create({
          data: {
            policy_id:        policy.id,
            name:             b.name,
            relationship:     b.relationship ?? null,
            beneficiary_type: b.beneficiary_type ?? 'primary',
            allocation_pct:   b.allocation_pct ?? 100,
            contact_id:       b.contact_id ?? null,
            date_of_birth:    b.date_of_birth ? new Date(b.date_of_birth) : null,
            tenant_id:        tenantId,
          },
        });
      }

      return policy;
    }));
  }

  async updatePolicy(id, data, tenantId, actorId) {
    const existing = await this.db.insurancePolicy.findFirst({ where: { id, tenant_id: tenantId } });
    if (!existing) throw Object.assign(new Error('Policy not found'), { statusCode: 404 });

    const { status, reason, ...rest } = data;
    const updateData = {};

    const allowedScalar = [
      'carrier_id', 'carrier_product_id', 'contact_id', 'account_id', 'agent_id',
      'product_type', 'product_name', 'coverage_amount', 'premium_amount', 'premium_frequency',
      'effective_date', 'expiry_date', 'renewal_due_date', 'surrender_value', 'death_benefit',
      'last_payment_date', 'notes',
    ];
    for (const key of allowedScalar) {
      if (rest[key] !== undefined) updateData[key] = rest[key];
    }

    return this.db.$transaction(async (tx) => {
      if (status && status !== existing.status) {
        updateData.status    = status;
        updateData.is_lapsed = status === 'lapsed';
        if (status === 'lapsed')      updateData.lapsed_at    = new Date();
        if (status === 'active' && existing.status === 'lapsed') updateData.reinstated_at = new Date();
        await this.#policyStatusChange(tx, existing, status, reason, actorId, tenantId);
      }

      return tx.insurancePolicy.update({
        where: { id },
        data:  updateData,
      });
    });
  }

  async deletePolicy(id, tenantId) {
    const existing = await this.db.insurancePolicy.findFirst({ where: { id, tenant_id: tenantId } });
    if (!existing) throw Object.assign(new Error('Policy not found'), { statusCode: 404 });
    return this.db.insurancePolicy.delete({ where: { id } });
  }

  // ── beneficiaries ─────────────────────────────────────────────────────────

  async upsertBeneficiaries(policyId, beneficiaries, tenantId) {
    const policy = await this.db.insurancePolicy.findFirst({ where: { id: policyId, tenant_id: tenantId } });
    if (!policy) throw Object.assign(new Error('Policy not found'), { statusCode: 404 });

    return this.db.$transaction(async (tx) => {
      // Soft-deactivate existing
      await tx.insurancePolicyBeneficiary.updateMany({
        where: { policy_id: policyId, tenant_id: tenantId },
        data:  { is_active: false },
      });
      // Create new
      const created = [];
      for (const b of beneficiaries) {
        created.push(await tx.insurancePolicyBeneficiary.create({
          data: {
            policy_id:        policyId,
            name:             b.name,
            relationship:     b.relationship ?? null,
            beneficiary_type: b.beneficiary_type ?? 'primary',
            allocation_pct:   b.allocation_pct ?? 100,
            contact_id:       b.contact_id ?? null,
            date_of_birth:    b.date_of_birth ? new Date(b.date_of_birth) : null,
            tenant_id:        tenantId,
          },
        }));
      }
      return created;
    });
  }

  // ══════════════════════════════════════════════════════════════════════════
  // APPLICATIONS
  // ══════════════════════════════════════════════════════════════════════════

  async listApplications(tenantId, { status, contactId, agentId, carrierId, search, limit = 50, offset = 0 } = {}) {
    const where = { tenant_id: tenantId };
    if (status)    where.status     = status;
    if (contactId) where.contact_id = contactId;
    if (agentId)   where.agent_id   = agentId;
    if (carrierId) where.carrier_id = carrierId;
    if (search)    where.app_number = { contains: search };

    const [applications, total] = await Promise.all([
      this.db.insuranceApplication.findMany({
        where,
        include: {
          carrier: { select: { id: true, name: true, code: true } },
          contact: { select: { id: true, first_name: true, last_name: true, email: true, phone: true } },
          agent:   { select: { employee_id: true, employee_name: true } },
          underwriting_case: { select: { id: true, case_number: true, status: true, risk_class: true } },
          policy:  { select: { id: true, policy_number: true, status: true } },
        },
        orderBy: { created_at: 'desc' },
        take: limit,
        skip: offset,
      }),
      this.db.insuranceApplication.count({ where }),
    ]);
    return { applications, total, limit, offset };
  }

  async getApplication(id, tenantId) {
    const app = await this.db.insuranceApplication.findFirst({
      where: { id, tenant_id: tenantId },
      include: {
        carrier:          { select: { id: true, name: true, code: true } },
        carrier_product:  true,
        contact:          { select: { id: true, first_name: true, last_name: true, email: true, phone: true } },
        account:          { select: { id: true, name: true } },
        agent:            { select: { employee_id: true, employee_name: true, email: true } },
        underwriting_case: {
          include: {
            requirements:          { orderBy: { created_at: 'asc' } },
            underwriter_employee:  { select: { employee_id: true, employee_name: true } },
          },
        },
        policy:      { select: { id: true, policy_number: true, status: true, effective_date: true } },
        commissions: { select: { id: true, agent_id: true, commission_amount: true, status: true } },
      },
    });
    if (!app) throw Object.assign(new Error('Application not found'), { statusCode: 404 });
    return app;
  }

  async createApplication(data, tenantId, actorId) {
    const {
      contact_id, account_id, agent_id, carrier_id, carrier_product_id,
      product_type, product_name, coverage_amount, premium_amount,
      age, gender, is_smoker, height_in, weight_lbs, notes,
    } = data;

    return this.#withRetry(() => this.db.$transaction(async (tx) => {
      const app_number = await this.#nextSeq('APP', 'insuranceApplication', 'app_number', tx, tenantId);
      return tx.insuranceApplication.create({
        data: {
          app_number,
          contact_id:         contact_id ?? null,
          account_id:         account_id ?? null,
          agent_id:           agent_id ?? null,
          carrier_id:         carrier_id ?? null,
          carrier_product_id: carrier_product_id ?? null,
          product_type,
          product_name:       product_name ?? null,
          coverage_amount:    Number(coverage_amount),
          premium_amount:     premium_amount ? Number(premium_amount) : null,
          age:                age ?? null,
          gender:             gender ?? null,
          is_smoker:          is_smoker ?? false,
          height_in:          height_in ?? null,
          weight_lbs:         weight_lbs ?? null,
          notes:              notes ?? null,
          created_by:         actorId ?? null,
          tenant_id:          tenantId,
        },
      });
    }));
  }

  async updateApplication(id, data, tenantId) {
    const existing = await this.db.insuranceApplication.findFirst({ where: { id, tenant_id: tenantId } });
    if (!existing) throw Object.assign(new Error('Application not found'), { statusCode: 404 });

    const allowed = [
      'contact_id', 'account_id', 'agent_id', 'carrier_id', 'carrier_product_id',
      'product_type', 'product_name', 'coverage_amount', 'premium_amount',
      'status', 'age', 'gender', 'is_smoker', 'height_in', 'weight_lbs', 'notes',
    ];
    const updateData = {};
    for (const key of allowed) {
      if (data[key] !== undefined) updateData[key] = data[key];
    }
    return this.db.insuranceApplication.update({ where: { id }, data: updateData });
  }

  /** Convert application to an underwriting case */
  async convertToUnderwriting(appId, uwData, tenantId, actorId) {
    const app = await this.db.insuranceApplication.findFirst({ where: { id: appId, tenant_id: tenantId } });
    if (!app) throw Object.assign(new Error('Application not found'), { statusCode: 404 });
    // Check for existing UW case via separate query (app is fetched without include)
    const existingUW = await this.db.underwritingCase.count({ where: { application_id: appId } });
    if (existingUW > 0) throw Object.assign(new Error('Underwriting case already exists for this application'), { statusCode: 409 });

    // Guard: must be in a state that allows UW
    const convertibleStatuses = ['submitted', 'under_review'];
    if (!convertibleStatuses.includes(app.status)) {
      throw Object.assign(new Error(`Cannot create underwriting case from application in status "${app.status}"`), { statusCode: 422 });
    }

    return this.#withRetry(() => this.db.$transaction(async (tx) => {
      // Re-check inside transaction to prevent duplicate from concurrent requests
      const alreadyExists = await tx.underwritingCase.findFirst({
        where: { application_id: appId },
        select: { id: true, case_number: true },
      });
      if (alreadyExists) return alreadyExists;

      const case_number = await this.#nextSeq('UW', 'underwritingCase', 'case_number', tx, tenantId);
      const uwCase = await tx.underwritingCase.create({
        data: {
          case_number,
          application_id:       appId,
          assigned_underwriter: uwData?.assigned_underwriter ?? null,
          status:               'pending',
          bmi:                  uwData?.bmi ?? null,
          blood_pressure:       uwData?.blood_pressure ?? null,
          cholesterol:          uwData?.cholesterol ?? null,
          medical_conditions:   uwData?.medical_conditions ?? null,
          medications:          uwData?.medications ?? null,
          family_history:       uwData?.family_history ?? null,
          tenant_id:            tenantId,
        },
      });

      await tx.insuranceApplication.update({
        where: { id: appId },
        data:  { status: 'under_review' },
      });

      // Sync CRM pipeline stage
      if (app.record_id) await this.#syncPipelineStage(tx, app.record_id, 'under_review');

      // Create CRM Record + EAV for the underwriting case so it shows in the UW module
      await this.#createRecordWithEav(tx, 'underwriting_case', {
        case_number:          uwCase.case_number,
        applicant_name:       `Application ${app.app_number}`,
        product_type:         app.product_type ?? '',
        coverage_amount:      Number(app.coverage_amount ?? 0),
        risk_class:           'standard',
        status:               'pending',
        assigned_underwriter: uwData?.assigned_underwriter ?? '',
        medical_history:      uwData?.medical_conditions ?? '',
        risk_factors:         [uwData?.blood_pressure, uwData?.bmi ? `BMI: ${uwData.bmi}` : ''].filter(Boolean).join('; ') || '',
        decision:             '',
        notes:                '',
      }, actorId, uwData?.assigned_underwriter ?? actorId, tenantId);

      return uwCase;
    }));
  }

  /** Issue a policy from an approved application */
  async issuePolicy(appId, policyData, tenantId, actorId) {
    const app = await this.db.insuranceApplication.findFirst({
      where:   { id: appId, tenant_id: tenantId },
      include: { underwriting_case: true, policy: true },
    });
    if (!app) throw Object.assign(new Error('Application not found'), { statusCode: 404 });
    if (app.policy) throw Object.assign(new Error('Policy already issued for this application'), { statusCode: 409 });
    if (app.status !== 'approved') throw Object.assign(new Error('Application must be approved before issuing a policy'), { statusCode: 422 });

    return this.#withRetry(() => this.db.$transaction(async (tx) => {
      const policy_number = await this.#nextSeq('POL', 'insurancePolicy', 'policy_number', tx, tenantId);
      const policy = await tx.insurancePolicy.create({
        data: {
          policy_number,
          application_id:    appId,
          carrier_id:        app.carrier_id ?? policyData?.carrier_id ?? null,
          carrier_product_id: app.carrier_product_id ?? policyData?.carrier_product_id ?? null,
          contact_id:        app.contact_id ?? null,
          account_id:        app.account_id ?? null,
          agent_id:          app.agent_id ?? null,
          product_type:      app.product_type,
          product_name:      app.product_name ?? null,
          coverage_amount:   Number(app.coverage_amount),
          premium_amount:    Number(app.premium_amount ?? policyData?.premium_amount ?? 0),
          premium_frequency: policyData?.premium_frequency ?? 'monthly',
          status:            'active',
          effective_date:    policyData?.effective_date ? new Date(policyData.effective_date) : new Date(),
          expiry_date:       policyData?.expiry_date ? new Date(policyData.expiry_date) : null,
          renewal_due_date:  policyData?.renewal_due_date ? new Date(policyData.renewal_due_date) : null,
          death_benefit:     policyData?.death_benefit ? Number(policyData.death_benefit) : Number(app.coverage_amount),
          notes:             policyData?.notes ?? null,
          created_by:        actorId ?? null,
          tenant_id:         tenantId,
        },
      });

      // Write initial status history
      await tx.insurancePolicyStatusHistory.create({
        data: {
          policy_id:   policy.id,
          from_status: null,
          to_status:   'active',
          reason:      `Issued from application ${app.app_number}`,
          changed_by:  actorId ?? null,
          tenant_id:   tenantId,
        },
      });

      // Update application status to issued + sync pipeline stage
      await tx.insuranceApplication.update({
        where: { id: appId },
        data:  { status: 'issued' },
      });
      if (app.record_id) await this.#syncPipelineStage(tx, app.record_id, 'issued');

      // Create CRM Record + EAV for the policy so it shows in the Policies module
      const effectiveDateStr = policy.effective_date ? policy.effective_date.toISOString().slice(0, 10) : '';
      const premiumMonthly = policy.premium_frequency === 'monthly' ? Number(policy.premium_amount) : Math.round(Number(policy.premium_amount) / 12);
      const premiumAnnual = policy.premium_frequency === 'annual' ? Number(policy.premium_amount) : Number(policy.premium_amount) * 12;
      const policyRecord = await this.#createRecordWithEav(tx, 'policy', {
        policy_number:    policy.policy_number,
        policyholder:     'Policyholder', // Will be enriched if contact data available
        product_type:     policy.product_type ?? '',
        coverage_amount:  Number(policy.coverage_amount),
        premium_monthly:  premiumMonthly,
        premium_annual:   premiumAnnual,
        status:           'active',
        effective_date:   effectiveDateStr,
        expiry_date:      policy.expiry_date ? policy.expiry_date.toISOString().slice(0, 10) : '',
        beneficiary:      '',
        payment_method:   'bank_draft',
        cash_value:       0,
        notes:            policy.notes ?? `Issued from application ${app.app_number}`,
      }, actorId, app.agent_id ?? actorId, tenantId);

      // Link the policy record_id back to the InsurancePolicy
      if (policyRecord) {
        await tx.insurancePolicy.update({
          where: { id: policy.id },
          data: { record_id: policyRecord.id },
        });
        // Enrich policyholder name from contact if available
        if (app.contact_id) {
          const contact = await tx.crmContact.findUnique({
            where: { id: app.contact_id },
            select: { first_name: true, last_name: true },
          });
          if (contact) {
            const name = `${contact.first_name ?? ''} ${contact.last_name ?? ''}`.trim();
            await tx.recordFieldValue.upsert({
              where: { record_id_field_name: { record_id: policyRecord.id, field_name: 'policyholder' } },
              update: { str_value: name },
              create: { record_id: policyRecord.id, field_name: 'policyholder', str_value: name, tenant_id: tenantId },
            });
          }
        }
      }

      // Write commission entry if agent set
      if (app.agent_id && app.premium_amount) {
        const rate = 45; // default commission rate — can be overridden
        const commissionAmount = Number(app.premium_amount) * (rate / 100);
        const commission = await tx.commissionEntry.create({
          data: {
            agent_id:          app.agent_id,
            policy_id:         policy.id,
            application_id:    appId,
            carrier_id:        app.carrier_id ?? null,
            product_type:      app.product_type,
            source_premium:    Number(app.premium_amount),
            commission_rate:   rate,
            commission_amount: commissionAmount,
            commission_period: new Date().toISOString().slice(0, 7),
            status:            'pending',
            created_by:        actorId ?? null,
            tenant_id:         tenantId,
          },
        }).catch((err) => {
          logger?.warn?.('[InsuranceDomain] Auto-commission creation failed for policy issuance', { appId, error: err.message });
          return null;
        });

        // Create CRM Record + EAV for the commission so it shows in Commissions module
        if (commission) {
          // Look up agent name
          const agent = await tx.employee.findUnique({
            where: { employee_id: app.agent_id },
            select: { employee_name: true },
          }).catch(() => null);
          await this.#createRecordWithEav(tx, 'commission', {
            agent_name:        agent?.employee_name ?? app.agent_id,
            policy_number:     policy.policy_number,
            product_type:      app.product_type ?? '',
            premium_amount:    Number(app.premium_amount),
            commission_rate:   rate,
            commission_amount: commissionAmount,
            status:            'pending',
            period:            new Date().toISOString().slice(0, 7),
            notes:             `Auto-generated from policy ${policy.policy_number}`,
          }, actorId, app.agent_id, tenantId);
        }
      }

      return policy;
    }));
  }

  // ══════════════════════════════════════════════════════════════════════════
  // UNDERWRITING CASES
  // ══════════════════════════════════════════════════════════════════════════

  async listUnderwritingCases(tenantId, { status, riskClass, underwriterId, search, limit = 50, offset = 0 } = {}) {
    const where = { tenant_id: tenantId };
    if (status)        where.status               = status;
    if (riskClass)     where.risk_class           = riskClass;
    if (underwriterId) where.assigned_underwriter = underwriterId;
    if (search)        where.case_number          = { contains: search };

    const [cases, total] = await Promise.all([
      this.db.underwritingCase.findMany({
        where,
        include: {
          application:          { select: { id: true, app_number: true, product_type: true, coverage_amount: true, age: true, is_smoker: true } },
          underwriter_employee: { select: { employee_id: true, employee_name: true } },
          requirements:         { orderBy: { created_at: 'asc' } },
        },
        orderBy: { created_at: 'desc' },
        take: limit,
        skip: offset,
      }),
      this.db.underwritingCase.count({ where }),
    ]);
    return { cases, total, limit, offset };
  }

  async getUnderwritingCase(id, tenantId) {
    const uwCase = await this.db.underwritingCase.findFirst({
      where:   { id, tenant_id: tenantId },
      include: {
        application:          { include: { contact: { select: { id: true, first_name: true, last_name: true, email: true } }, carrier: { select: { id: true, name: true } } } },
        underwriter_employee: { select: { employee_id: true, employee_name: true, email: true } },
        requirements:         { orderBy: { created_at: 'asc' } },
      },
    });
    if (!uwCase) throw Object.assign(new Error('Underwriting case not found'), { statusCode: 404 });
    return uwCase;
  }

  async updateUnderwritingCase(id, data, tenantId, actorId) {
    const existing = await this.db.underwritingCase.findFirst({ where: { id, tenant_id: tenantId } });
    if (!existing) throw Object.assign(new Error('Underwriting case not found'), { statusCode: 404 });

    const allowed = [
      'assigned_underwriter', 'status', 'risk_class', 'bmi', 'blood_pressure',
      'cholesterol', 'medical_conditions', 'medications', 'family_history', 'decision_notes',
    ];
    const updateData = {};
    for (const key of allowed) {
      if (data[key] !== undefined) updateData[key] = data[key];
    }
    if (data.status && ['approved', 'declined', 'referred'].includes(data.status)) {
      updateData.decided_at = new Date();
    }

    // Use transaction to ensure UW decision + application status update are atomic
    return this.db.$transaction(async (tx) => {
      const updatedCase = await tx.underwritingCase.update({ where: { id }, data: updateData });

      // If UW decision made, propagate to application status + pipeline stage
      if (data.status === 'approved' || data.status === 'declined') {
        const appStatus = data.status;
        await tx.insuranceApplication.update({
          where: { id: existing.application_id },
          data:  { status: appStatus },
        });
        // Sync CRM pipeline stage for the application record
        const app = await tx.insuranceApplication.findUnique({
          where: { id: existing.application_id },
          select: { record_id: true },
        });
        if (app?.record_id) await this.#syncPipelineStage(tx, app.record_id, appStatus);
      }

      return updatedCase;
    });
  }

  // ── UW requirements ───────────────────────────────────────────────────────

  async addRequirement(caseId, reqData, tenantId) {
    const uwCase = await this.db.underwritingCase.findFirst({ where: { id: caseId, tenant_id: tenantId } });
    if (!uwCase) throw Object.assign(new Error('Underwriting case not found'), { statusCode: 404 });

    const { description, requirement_type, due_date, notes } = reqData;
    return this.db.underwritingRequirement.create({
      data: {
        case_id:          caseId,
        description,
        requirement_type: requirement_type ?? 'other',
        status:           'pending',
        due_date:         due_date ? new Date(due_date) : null,
        notes:            notes ?? null,
        tenant_id:        tenantId,
      },
    });
  }

  async updateRequirement(reqId, data, tenantId) {
    const req = await this.db.underwritingRequirement.findFirst({ where: { id: reqId, tenant_id: tenantId } });
    if (!req) throw Object.assign(new Error('Requirement not found'), { statusCode: 404 });

    const { status, notes, received_at } = data;
    return this.db.underwritingRequirement.update({
      where: { id: reqId },
      data: {
        status:      status ?? req.status,
        notes:       notes ?? req.notes,
        received_at: received_at ? new Date(received_at) : (status === 'received' ? new Date() : req.received_at),
      },
    });
  }

  // ══════════════════════════════════════════════════════════════════════════
  // CLAIMS
  // ══════════════════════════════════════════════════════════════════════════

  async listClaims(tenantId, { status, claimType, policyId, adjusterId, search, limit = 50, offset = 0 } = {}) {
    const where = { tenant_id: tenantId };
    if (status)     where.status     = status;
    if (claimType)  where.claim_type = claimType;
    if (policyId)   where.policy_id  = policyId;
    if (adjusterId) where.adjuster_id = adjusterId;
    if (search)     where.claim_number = { contains: search };

    const [claims, total] = await Promise.all([
      this.db.insuranceClaim.findMany({
        where,
        include: {
          policy:   { select: { id: true, policy_number: true, product_type: true } },
          contact:  { select: { id: true, first_name: true, last_name: true, email: true, phone: true } },
          adjuster: { select: { employee_id: true, employee_name: true } },
          events:   { orderBy: { created_at: 'asc' } },
        },
        orderBy: { filed_at: 'desc' },
        take: limit,
        skip: offset,
      }),
      this.db.insuranceClaim.count({ where }),
    ]);
    return { claims, total, limit, offset };
  }

  async getClaim(id, tenantId) {
    const claim = await this.db.insuranceClaim.findFirst({
      where:   { id, tenant_id: tenantId },
      include: {
        policy:   { include: { carrier: { select: { id: true, name: true } }, contact: { select: { id: true, first_name: true, last_name: true } } } },
        contact:  { select: { id: true, first_name: true, last_name: true, email: true, phone: true } },
        adjuster: { select: { employee_id: true, employee_name: true, email: true } },
        events:   { orderBy: { created_at: 'asc' } },
      },
    });
    if (!claim) throw Object.assign(new Error('Claim not found'), { statusCode: 404 });
    return claim;
  }

  async createClaim(data, tenantId, actorId) {
    const { policy_id, contact_id, claim_type, amount, priority, adjuster_id, description } = data;

    // Verify policy exists in tenant
    const policy = await this.db.insurancePolicy.findFirst({ where: { id: policy_id, tenant_id: tenantId } });
    if (!policy) throw Object.assign(new Error('Policy not found'), { statusCode: 404 });

    return this.#withRetry(() => this.db.$transaction(async (tx) => {
      const claim_number = await this.#nextSeq('CLM', 'insuranceClaim', 'claim_number', tx, tenantId);
      const claim = await tx.insuranceClaim.create({
        data: {
          claim_number,
          policy_id:   policy_id,
          contact_id:  contact_id ?? null,
          claim_type:  claim_type ?? 'other',
          amount:      Number(amount),
          status:      'filed',
          priority:    priority ?? 'medium',
          adjuster_id: adjuster_id ?? null,
          description: description ?? null,
          created_by:  actorId ?? null,
          tenant_id:   tenantId,
        },
      });

      // Write initial timeline event
      await tx.claimEvent.create({
        data: {
          claim_id:    claim.id,
          event_type:  'filed',
          description: `Claim filed for ${claim_type ?? 'loss'}`,
          created_by:  actorId ?? null,
          tenant_id:   tenantId,
        },
      });

      return claim;
    }));
  }

  async updateClaim(id, data, tenantId, actorId) {
    const existing = await this.db.insuranceClaim.findFirst({ where: { id, tenant_id: tenantId } });
    if (!existing) throw Object.assign(new Error('Claim not found'), { statusCode: 404 });

    const allowed = ['status', 'priority', 'adjuster_id', 'description', 'paid_at', 'paid_amount', 'denial_reason'];
    const updateData = {};
    for (const key of allowed) {
      if (data[key] !== undefined) updateData[key] = data[key];
    }
    if (data.status === 'paid' && !existing.paid_at) {
      updateData.paid_at     = new Date();
      updateData.paid_amount = data.paid_amount ? Number(data.paid_amount) : Number(existing.amount);
    }

    return this.db.$transaction(async (tx) => {
      const updated = await tx.insuranceClaim.update({ where: { id }, data: updateData });
      // Auto-add timeline event for status change
      if (data.status && data.status !== existing.status) {
        await tx.claimEvent.create({
          data: {
            claim_id:    id,
            event_type:  'decision',
            description: `Status changed from ${existing.status} to ${data.status}${data.denial_reason ? ': ' + data.denial_reason : ''}`,
            created_by:  actorId ?? null,
            tenant_id:   tenantId,
          },
        });
        // Sync CRM pipeline stage
        if (existing.record_id) await this.#syncPipelineStage(tx, existing.record_id, data.status);
      }
      return updated;
    });
  }

  async addClaimEvent(claimId, eventData, tenantId, actorId) {
    const claim = await this.db.insuranceClaim.findFirst({ where: { id: claimId, tenant_id: tenantId } });
    if (!claim) throw Object.assign(new Error('Claim not found'), { statusCode: 404 });
    return this.db.claimEvent.create({
      data: {
        claim_id:    claimId,
        event_type:  eventData.event_type ?? 'note',
        description: eventData.description,
        created_by:  actorId ?? null,
        tenant_id:   tenantId,
      },
    });
  }

  // ══════════════════════════════════════════════════════════════════════════
  // COMMISSIONS
  // ══════════════════════════════════════════════════════════════════════════

  async listCommissions(tenantId, { agentId, status, period, policyId, commissionType, search, limit = 100, offset = 0 } = {}) {
    const where = { tenant_id: tenantId };
    if (agentId)  where.agent_id   = agentId;
    if (status)   where.status     = status;
    if (period)   where.commission_period = period;
    if (policyId) where.policy_id  = policyId;
    if (commissionType) where.product_type = commissionType;
    if (search) {
      where.OR = [
        { policy: { policy_number: { contains: search } } },
        { agent: { employee_name: { contains: search } } },
      ];
    }

    const [entries, total] = await Promise.all([
      this.db.commissionEntry.findMany({
        where,
        include: {
          agent:       { select: { employee_id: true, employee_name: true } },
          split_agent: { select: { employee_id: true, employee_name: true } },
          policy:      { select: { id: true, policy_number: true, product_type: true } },
          application: { select: { id: true, app_number: true } },
          carrier:     { select: { id: true, name: true } },
        },
        orderBy: [{ commission_period: 'desc' }, { created_at: 'desc' }],
        take: limit,
        skip: offset,
      }),
      this.db.commissionEntry.count({ where }),
    ]);
    return { entries, total, limit, offset };
  }

  async createCommission(data, tenantId, actorId) {
    const {
      agent_id, policy_id, application_id, carrier_id, product_type,
      source_premium, commission_rate, commission_amount, commission_period,
      split_agent_id, split_percent, notes,
    } = data;
    return this.db.commissionEntry.create({
      data: {
        agent_id,
        policy_id:          policy_id ?? null,
        application_id:     application_id ?? null,
        carrier_id:         carrier_id ?? null,
        product_type,
        source_premium:     Number(source_premium),
        commission_rate:    Number(commission_rate),
        commission_amount:  commission_amount ? Number(commission_amount) : Number(source_premium) * (Number(commission_rate) / 100),
        commission_period:  commission_period ?? new Date().toISOString().slice(0, 7),
        status:             'pending',
        split_agent_id:     split_agent_id ?? null,
        split_percent:      split_percent ? Number(split_percent) : null,
        notes:              notes ?? null,
        created_by:         actorId ?? null,
        tenant_id:          tenantId,
      },
    });
  }

  async updateCommissionStatus(id, status, reason, tenantId, actorId) {
    const entry = await this.db.commissionEntry.findFirst({ where: { id, tenant_id: tenantId } });
    if (!entry) throw Object.assign(new Error('Commission entry not found'), { statusCode: 404 });

    const updateData = { status };
    if (status === 'paid')        updateData.paid_at          = new Date();
    if (status === 'clawed_back') updateData.clawback_reason  = reason ?? null;
    return this.db.commissionEntry.update({ where: { id }, data: updateData });
  }

  async getCommissionSummary(tenantId, { agentId, period } = {}) {
    const where = { tenant_id: tenantId };
    if (agentId) where.agent_id = agentId;
    if (period)  where.commission_period = period;

    const rows = await this.db.commissionEntry.findMany({
      where,
      select: { agent_id: true, status: true, commission_amount: true, commission_period: true },
    });

    const summary = {};
    for (const r of rows) {
      const key = r.agent_id;
      if (!summary[key]) summary[key] = { agent_id: key, paid: 0, pending: 0, clawed_back: 0, total: 0 };
      const amt = Number(r.commission_amount);
      summary[key][r.status] = (summary[key][r.status] ?? 0) + amt;
      if (r.status !== 'clawed_back') summary[key].total += amt;
    }
    return Object.values(summary);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // P1 — COMPLIANCE & SUBMISSION PACK
  // ══════════════════════════════════════════════════════════════════════════

  async createComplianceArtifact(data, tenantId, actorId) {
    return this.db.complianceArtifact.create({
      data: {
        artifact_type:  data.artifact_type,
        contact_id:     data.contact_id ?? null,
        application_id: data.application_id ?? null,
        policy_id:      data.policy_id ?? null,
        document_id:    data.document_id ?? null,
        status:         data.status ?? 'pending',
        expires_at:     data.expires_at ? new Date(data.expires_at) : null,
        retention_until: data.retention_until ? new Date(data.retention_until) : null,
        metadata:       data.metadata ?? null,
        notes:          data.notes ?? null,
        created_by:     actorId ?? null,
        tenant_id:      tenantId,
      },
    });
  }

  async listComplianceArtifacts(tenantId, { contactId, applicationId, policyId, status, artifactType, limit = 50, offset = 0 } = {}) {
    const where = { tenant_id: tenantId };
    if (contactId)     where.contact_id     = contactId;
    if (applicationId) where.application_id = applicationId;
    if (policyId)      where.policy_id      = policyId;
    if (status)        where.status         = status;
    if (artifactType)  where.artifact_type  = artifactType;

    const [artifacts, total] = await Promise.all([
      this.db.complianceArtifact.findMany({
        where, orderBy: { created_at: 'desc' }, take: limit, skip: offset,
        include: {
          contact:     { select: { id: true, first_name: true, last_name: true } },
          application: { select: { id: true, app_number: true } },
          policy:      { select: { id: true, policy_number: true } },
          document:    { select: { id: true, filename: true } },
        },
      }),
      this.db.complianceArtifact.count({ where }),
    ]);
    return { artifacts, total, limit, offset };
  }

  async updateComplianceArtifact(id, data, tenantId) {
    const existing = await this.db.complianceArtifact.findFirst({ where: { id, tenant_id: tenantId } });
    if (!existing) throw Object.assign(new Error('Compliance artifact not found'), { statusCode: 404 });

    const allowed = ['status', 'completed_at', 'signed_by', 'signature_ip', 'expires_at', 'retention_until', 'document_id', 'metadata', 'notes'];
    const updateData = {};
    for (const key of allowed) {
      if (data[key] !== undefined) updateData[key] = data[key];
    }
    if (data.status === 'completed' && !updateData.completed_at) {
      updateData.completed_at = new Date();
    }
    return this.db.complianceArtifact.update({ where: { id }, data: updateData });
  }

  async createSubmissionChecklist(applicationId, items, tenantId) {
    const app = await this.db.insuranceApplication.findFirst({ where: { id: applicationId, tenant_id: tenantId } });
    if (!app) throw Object.assign(new Error('Application not found'), { statusCode: 404 });

    const rows = items.map(item => ({
      application_id: applicationId,
      item_name:      item.item_name,
      item_type:      item.item_type ?? 'document',
      is_required:    item.is_required !== false,
      status:         item.status ?? 'pending',
      notes:          item.notes ?? null,
      tenant_id:      tenantId,
    }));
    await this.db.submissionChecklist.createMany({ data: rows });
    return this.getSubmissionChecklist(applicationId, tenantId);
  }

  async getSubmissionChecklist(applicationId, tenantId) {
    return this.db.submissionChecklist.findMany({
      where: { application_id: applicationId, tenant_id: tenantId },
      include: { document: { select: { id: true, filename: true } } },
      orderBy: { created_at: 'asc' },
    });
  }

  async updateChecklistItem(id, data, tenantId) {
    const existing = await this.db.submissionChecklist.findFirst({ where: { id, tenant_id: tenantId } });
    if (!existing) throw Object.assign(new Error('Checklist item not found'), { statusCode: 404 });

    const updateData = {};
    if (data.status !== undefined) updateData.status = data.status;
    if (data.document_id !== undefined) updateData.document_id = data.document_id;
    if (data.notes !== undefined) updateData.notes = data.notes;
    if (data.status === 'received') updateData.received_at = new Date();
    if (data.status === 'waived') {
      updateData.waived_by = data.waived_by ?? null;
      updateData.waived_reason = data.waived_reason ?? null;
    }
    return this.db.submissionChecklist.update({ where: { id }, data: updateData });
  }

  async getSubmissionReadiness(applicationId, tenantId) {
    const items = await this.db.submissionChecklist.findMany({
      where: { application_id: applicationId, tenant_id: tenantId },
    });
    const required = items.filter(i => i.is_required);
    const completed = required.filter(i => ['received', 'waived', 'na'].includes(i.status));
    return {
      total: items.length,
      required: required.length,
      completed: completed.length,
      pending: required.length - completed.length,
      ready: completed.length >= required.length,
    };
  }

  // ══════════════════════════════════════════════════════════════════════════
  // P2 — POLICY SERVICING & BILLING
  // ══════════════════════════════════════════════════════════════════════════

  // ── Endorsements ─────────────────────────────────────────────────────────

  async createEndorsement(data, tenantId, actorId) {
    const policy = await this.db.insurancePolicy.findFirst({ where: { id: data.policy_id, tenant_id: tenantId } });
    if (!policy) throw Object.assign(new Error('Policy not found'), { statusCode: 404 });

    return this.#withRetry(() => this.db.$transaction(async (tx) => {
      const endorsementRef = await this.#nextSeq('END', 'policyEndorsement', 'endorsement_ref', tx, tenantId);
      return tx.policyEndorsement.create({
        data: {
          endorsement_ref: endorsementRef,
          policy_id:       data.policy_id,
          endorsement_type: data.endorsement_type,
          description:     data.description,
          effective_date:  new Date(data.effective_date),
          old_values:      data.old_values ?? null,
          new_values:      data.new_values ?? null,
          premium_impact:  data.premium_impact != null ? Number(data.premium_impact) : null,
          notes:           data.notes ?? null,
          created_by:      actorId ?? null,
          tenant_id:       tenantId,
        },
      });
    }));
  }

  async listEndorsements(tenantId, { policyId, status, limit = 50, offset = 0 } = {}) {
    const where = { tenant_id: tenantId };
    if (policyId) where.policy_id = policyId;
    if (status)   where.status = status;

    const [endorsements, total] = await Promise.all([
      this.db.policyEndorsement.findMany({
        where, orderBy: { created_at: 'desc' }, take: limit, skip: offset,
        include: {
          policy: { select: { id: true, policy_number: true } },
          approver: { select: { employee_id: true, employee_name: true } },
        },
      }),
      this.db.policyEndorsement.count({ where }),
    ]);
    return { endorsements, total, limit, offset };
  }

  async approveEndorsement(id, tenantId, actorId) {
    const existing = await this.db.policyEndorsement.findFirst({ where: { id, tenant_id: tenantId } });
    if (!existing) throw Object.assign(new Error('Endorsement not found'), { statusCode: 404 });
    if (existing.status !== 'pending') throw Object.assign(new Error('Endorsement is not pending'), { statusCode: 422 });

    return this.db.policyEndorsement.update({
      where: { id },
      data: { status: 'approved', approved_by: actorId ?? null },
    });
  }

  async applyEndorsement(id, tenantId, actorId) {
    const existing = await this.db.policyEndorsement.findFirst({
      where: { id, tenant_id: tenantId },
      include: { policy: true },
    });
    if (!existing) throw Object.assign(new Error('Endorsement not found'), { statusCode: 404 });
    if (existing.status !== 'approved') throw Object.assign(new Error('Endorsement must be approved before applying'), { statusCode: 422 });

    return this.db.$transaction(async (tx) => {
      // Apply the endorsement changes to the policy if new_values provided
      if (existing.new_values && typeof existing.new_values === 'object') {
        const allowedPolicyFields = ['coverage_amount', 'premium_amount', 'death_benefit', 'premium_frequency'];
        const policyUpdates = {};
        for (const [k, v] of Object.entries(existing.new_values)) {
          if (allowedPolicyFields.includes(k) && v != null) {
            policyUpdates[k] = ['coverage_amount', 'premium_amount', 'death_benefit'].includes(k) ? Number(v) : v;
          }
        }
        if (Object.keys(policyUpdates).length) {
          await tx.insurancePolicy.update({ where: { id: existing.policy_id }, data: policyUpdates });
        }
      }

      // Record premium impact in status history
      if (existing.premium_impact) {
        await this.#policyStatusChange(tx, existing.policy, existing.policy.status,
          `Endorsement ${existing.endorsement_ref} applied: ${existing.description}`, actorId, tenantId);
      }

      return tx.policyEndorsement.update({
        where: { id },
        data: { status: 'applied', applied_at: new Date() },
      });
    });
  }

  // ── Renewal Tasks ────────────────────────────────────────────────────────

  async createRenewalTask(data, tenantId) {
    const policy = await this.db.insurancePolicy.findFirst({ where: { id: data.policy_id, tenant_id: tenantId } });
    if (!policy) throw Object.assign(new Error('Policy not found'), { statusCode: 404 });

    return this.db.renewalTask.create({
      data: {
        policy_id:       data.policy_id,
        agent_id:        data.agent_id ?? policy.agent_id ?? null,
        renewal_date:    firstValidDate([data.renewal_date, policy.renewal_due_date], 'renewal_date'),
        renewal_premium: data.renewal_premium != null ? Number(data.renewal_premium) : null,
        notes:           data.notes ?? null,
        tenant_id:       tenantId,
      },
    });
  }

  async listRenewalTasks(tenantId, { agentId, status, renewalBefore, limit = 50, offset = 0 } = {}) {
    const where = { tenant_id: tenantId };
    if (agentId) where.agent_id = agentId;
    if (status)  where.status = status;
    if (renewalBefore) where.renewal_date = { lte: new Date(renewalBefore) };

    const [tasks, total] = await Promise.all([
      this.db.renewalTask.findMany({
        where, orderBy: { renewal_date: 'asc' }, take: limit, skip: offset,
        include: {
          policy: { select: { id: true, policy_number: true, product_type: true, coverage_amount: true, premium_amount: true, contact_id: true, contact: { select: { first_name: true, last_name: true } } } },
          agent: { select: { employee_id: true, employee_name: true } },
        },
      }),
      this.db.renewalTask.count({ where }),
    ]);
    return { tasks, total, limit, offset };
  }

  async updateRenewalTask(id, data, tenantId) {
    const existing = await this.db.renewalTask.findFirst({ where: { id, tenant_id: tenantId } });
    if (!existing) throw Object.assign(new Error('Renewal task not found'), { statusCode: 404 });

    const allowed = ['status', 'outreach_count', 'last_contacted', 'renewal_premium', 'notes'];
    const updateData = {};
    for (const key of allowed) {
      if (data[key] !== undefined) updateData[key] = data[key];
    }
    if (data.last_contacted) updateData.last_contacted = new Date(data.last_contacted);
    return this.db.renewalTask.update({ where: { id }, data: updateData });
  }

  // ── Billing ──────────────────────────────────────────────────────────────

  async createBillingSchedule(policyId, data, tenantId) {
    const policy = await this.db.insurancePolicy.findFirst({ where: { id: policyId, tenant_id: tenantId } });
    if (!policy) throw Object.assign(new Error('Policy not found'), { statusCode: 404 });

    return this.db.billingSchedule.create({
      data: {
        policy_id:         policyId,
        frequency:         data.frequency ?? policy.premium_frequency,
        amount_due:        Number(data.amount_due ?? policy.premium_amount),
        next_due_date:     firstValidDate([data.next_due_date, policy.renewal_due_date, policy.effective_date], 'next_due_date'),
        auto_pay:          data.auto_pay ?? false,
        grace_period_days: data.grace_period_days ?? 31,
        tenant_id:         tenantId,
      },
    });
  }

  async generateInvoice(billingScheduleId, tenantId) {
    const schedule = await this.db.billingSchedule.findFirst({
      where: { id: billingScheduleId, tenant_id: tenantId },
    });
    if (!schedule) throw Object.assign(new Error('Billing schedule not found'), { statusCode: 404 });

    return this.#withRetry(() => this.db.$transaction(async (tx) => {
      const invoiceNumber = await this.#nextSeq('INV', 'policyInvoice', 'invoice_number', tx, tenantId);
      return tx.policyInvoice.create({
        data: {
          invoice_number:      invoiceNumber,
          billing_schedule_id: billingScheduleId,
          policy_id:           schedule.policy_id,
          amount:              Number(schedule.amount_due),
          due_date:            schedule.next_due_date,
          tenant_id:           tenantId,
        },
      });
    }));
  }

  async recordPayment(invoiceId, data, tenantId, actorId) {
    const invoice = await this.db.policyInvoice.findFirst({ where: { id: invoiceId, tenant_id: tenantId } });
    if (!invoice) throw Object.assign(new Error('Invoice not found'), { statusCode: 404 });

    return this.db.$transaction(async (tx) => {
      const payment = await tx.policyPayment.create({
        data: {
          invoice_id:     invoiceId,
          payment_ref:    data.payment_ref ?? null,
          amount:         Number(data.amount ?? invoice.amount),
          payment_method: data.payment_method ?? null,
          payment_date:   data.payment_date ? new Date(data.payment_date) : new Date(),
          notes:          data.notes ?? null,
          created_by:     actorId ?? null,
          tenant_id:      tenantId,
        },
      });

      // Mark invoice as paid
      await tx.policyInvoice.update({
        where: { id: invoiceId },
        data: { status: 'paid', paid_at: new Date() },
      });

      // Update policy last payment date
      await tx.insurancePolicy.update({
        where: { id: invoice.policy_id },
        data: { last_payment_date: new Date() },
      });

      return payment;
    });
  }

  async getBillingHistory(policyId, tenantId) {
    const schedule = await this.db.billingSchedule.findFirst({
      where: { policy_id: policyId, tenant_id: tenantId },
    });
    const invoices = await this.db.policyInvoice.findMany({
      where: { policy_id: policyId, tenant_id: tenantId },
      include: { payments: true },
      orderBy: { due_date: 'desc' },
    });
    return { schedule, invoices };
  }

  // ══════════════════════════════════════════════════════════════════════════
  // P3 — CLAIMS OPS (reserves, payment events, fraud flags, adjuster queue)
  // ══════════════════════════════════════════════════════════════════════════

  async setReserve(claimId, data, tenantId, actorId) {
    const claim = await this.db.insuranceClaim.findFirst({ where: { id: claimId, tenant_id: tenantId } });
    if (!claim) throw Object.assign(new Error('Claim not found'), { statusCode: 404 });

    const existingReserves = await this.db.claimReserve.findMany({
      where: { claim_id: claimId }, orderBy: { created_at: 'desc' },
    });
    const currentTotal = existingReserves.length > 0 ? Number(existingReserves[0].running_total) : 0;
    const newAmount = Number(data.amount);
    const reserveType = existingReserves.length === 0 ? 'initial' : 'adjustment';
    const runningTotal = reserveType === 'initial' ? newAmount : currentTotal + newAmount;

    return this.db.$transaction(async (tx) => {
      const reserve = await tx.claimReserve.create({
        data: {
          claim_id:      claimId,
          reserve_type:  reserveType,
          amount:        newAmount,
          running_total: runningTotal,
          reason:        data.reason ?? null,
          created_by:    actorId ?? null,
          tenant_id:     tenantId,
        },
      });

      // Update claim reserve_amount
      await tx.insuranceClaim.update({
        where: { id: claimId },
        data: { reserve_amount: runningTotal },
      });

      // Add timeline event
      await tx.claimEvent.create({
        data: {
          claim_id:    claimId,
          event_type:  reserveType === 'initial' ? 'reserve_set' : 'reserve_adjusted',
          description: `Reserve ${reserveType}: $${newAmount.toLocaleString()} (total: $${runningTotal.toLocaleString()})${data.reason ? ` — ${data.reason}` : ''}`,
          created_by:  actorId ?? null,
          tenant_id:   tenantId,
        },
      });

      return reserve;
    });
  }

  async recordClaimPayment(claimId, data, tenantId, actorId) {
    const claim = await this.db.insuranceClaim.findFirst({ where: { id: claimId, tenant_id: tenantId } });
    if (!claim) throw Object.assign(new Error('Claim not found'), { statusCode: 404 });

    return this.db.$transaction(async (tx) => {
      const payment = await tx.claimPaymentEvent.create({
        data: {
          claim_id:      claimId,
          payment_type:  data.payment_type ?? 'partial',
          amount:        Number(data.amount),
          payee_name:    data.payee_name ?? null,
          payment_ref:   data.payment_ref ?? null,
          payment_date:  data.payment_date ? new Date(data.payment_date) : new Date(),
          notes:         data.notes ?? null,
          created_by:    actorId ?? null,
          tenant_id:     tenantId,
        },
      });

      // Sum all payments
      const allPayments = await tx.claimPaymentEvent.findMany({ where: { claim_id: claimId } });
      const totalPaid = allPayments.reduce((sum, p) => sum + Number(p.amount), 0);

      // Update claim paid_amount
      await tx.insuranceClaim.update({
        where: { id: claimId },
        data: { paid_amount: totalPaid },
      });

      // Add timeline event
      await tx.claimEvent.create({
        data: {
          claim_id:    claimId,
          event_type:  'payment_issued',
          description: `Payment of $${Number(data.amount).toLocaleString()} (${data.payment_type ?? 'partial'}) to ${data.payee_name ?? 'claimant'}`,
          created_by:  actorId ?? null,
          tenant_id:   tenantId,
        },
      });

      return payment;
    });
  }

  async flagFraud(claimId, isFraud, tenantId, actorId) {
    const claim = await this.db.insuranceClaim.findFirst({ where: { id: claimId, tenant_id: tenantId } });
    if (!claim) throw Object.assign(new Error('Claim not found'), { statusCode: 404 });

    await this.db.claimEvent.create({
      data: {
        claim_id:    claimId,
        event_type:  'fraud_flagged',
        description: isFraud ? 'Claim flagged for potential fraud investigation' : 'Fraud flag removed from claim',
        created_by:  actorId ?? null,
        tenant_id:   tenantId,
      },
    });

    return this.db.insuranceClaim.update({
      where: { id: claimId },
      data: { is_fraud_flagged: isFraud },
    });
  }

  async getAdjusterWorkQueue(adjusterId, tenantId) {
    const claims = await this.db.insuranceClaim.findMany({
      where: {
        adjuster_id: adjusterId,
        tenant_id: tenantId,
        status: { in: ['fnol', 'filed', 'under_investigation', 'approved'] },
      },
      include: {
        policy: { select: { id: true, policy_number: true, coverage_amount: true } },
        contact: { select: { id: true, first_name: true, last_name: true } },
        reserves: { orderBy: { created_at: 'desc' }, take: 1 },
        payment_events: true,
      },
      orderBy: [{ priority: 'asc' }, { filed_at: 'asc' }],
    });

    return claims.map(c => ({
      ...c,
      total_reserved: c.reserves[0]?.running_total ?? 0,
      total_paid: c.payment_events.reduce((s, p) => s + Number(p.amount), 0),
    }));
  }

  // ══════════════════════════════════════════════════════════════════════════
  // P4 — PRODUCER / CARRIER OPS
  // ══════════════════════════════════════════════════════════════════════════

  async createAppointment(data, tenantId) {
    return this.db.producerAppointment.create({
      data: {
        agent_id:           data.agent_id,
        carrier_id:         data.carrier_id,
        state_code:         data.state_code,
        license_number:     data.license_number ?? null,
        license_type:       data.license_type ?? null,
        appointment_status: data.appointment_status ?? 'active',
        appointed_at:       data.appointed_at ? new Date(data.appointed_at) : null,
        expires_at:         data.expires_at ? new Date(data.expires_at) : null,
        notes:              data.notes ?? null,
        tenant_id:          tenantId,
      },
    });
  }

  async listAppointments(tenantId, { agentId, carrierId, stateCode, status, limit = 50, offset = 0 } = {}) {
    const where = { tenant_id: tenantId };
    if (agentId)   where.agent_id           = agentId;
    if (carrierId) where.carrier_id         = carrierId;
    if (stateCode) where.state_code         = stateCode;
    if (status)    where.appointment_status = status;

    const [appointments, total] = await Promise.all([
      this.db.producerAppointment.findMany({
        where, orderBy: { created_at: 'desc' }, take: limit, skip: offset,
        include: {
          agent: { select: { employee_id: true, employee_name: true } },
          carrier: { select: { id: true, name: true, code: true } },
        },
      }),
      this.db.producerAppointment.count({ where }),
    ]);
    return { appointments, total, limit, offset };
  }

  async updateAppointment(id, data, tenantId) {
    const existing = await this.db.producerAppointment.findFirst({ where: { id, tenant_id: tenantId } });
    if (!existing) throw Object.assign(new Error('Appointment not found'), { statusCode: 404 });

    const allowed = ['appointment_status', 'license_number', 'license_type', 'expires_at', 'terminated_at', 'notes'];
    const updateData = {};
    for (const key of allowed) {
      if (data[key] !== undefined) {
        updateData[key] = ['expires_at', 'terminated_at'].includes(key) && data[key]
          ? new Date(data[key]) : data[key];
      }
    }
    if (data.appointment_status === 'terminated') {
      updateData.terminated_at = new Date();
    }
    return this.db.producerAppointment.update({ where: { id }, data: updateData });
  }

  async createCommissionStatement(data, tenantId, actorId) {
    return this.#withRetry(() => this.db.$transaction(async (tx) => {
      const statementRef = await this.#nextSeq('CST', 'commissionStatement', 'statement_ref', tx, tenantId);
      return tx.commissionStatement.create({
        data: {
          statement_ref:    statementRef,
          carrier_id:       data.carrier_id,
          statement_period: data.statement_period,
          received_date:    new Date(data.received_date),
          total_expected:   Number(data.total_expected ?? 0),
          total_actual:     Number(data.total_actual ?? 0),
          variance:         Number(data.total_actual ?? 0) - Number(data.total_expected ?? 0),
          notes:            data.notes ?? null,
          created_by:       actorId ?? null,
          tenant_id:        tenantId,
        },
      });
    }));
  }

  async listCommissionStatements(tenantId, { carrierId, period, status, limit = 50, offset = 0 } = {}) {
    const where = { tenant_id: tenantId };
    if (carrierId) where.carrier_id       = carrierId;
    if (period)    where.statement_period = period;
    if (status)    where.status           = status;

    const [statements, total] = await Promise.all([
      this.db.commissionStatement.findMany({
        where, orderBy: { received_date: 'desc' }, take: limit, skip: offset,
        include: { carrier: { select: { id: true, name: true, code: true } } },
      }),
      this.db.commissionStatement.count({ where }),
    ]);
    return { statements, total, limit, offset };
  }

  async reconcileStatement(id, tenantId, actorId) {
    const statement = await this.db.commissionStatement.findFirst({ where: { id, tenant_id: tenantId } });
    if (!statement) throw Object.assign(new Error('Statement not found'), { statusCode: 404 });

    // Match commission entries for this carrier/period
    const entries = await this.db.commissionEntry.findMany({
      where: {
        carrier_id: statement.carrier_id,
        commission_period: statement.statement_period,
        tenant_id: tenantId,
      },
    });

    const totalExpected = entries.reduce((s, e) => s + Number(e.commission_amount), 0);

    return this.db.commissionStatement.update({
      where: { id },
      data: {
        total_expected: totalExpected,
        variance:       Number(statement.total_actual) - totalExpected,
        status:         'reconciled',
        reconciled_at:  new Date(),
        reconciled_by:  actorId ?? null,
      },
    });
  }

  async getCommissionVarianceReport(tenantId, { period, carrierId } = {}) {
    const where = { tenant_id: tenantId };
    if (period)    where.commission_period = period;
    if (carrierId) where.carrier_id = carrierId;

    const entries = await this.db.commissionEntry.findMany({
      where,
      include: {
        agent: { select: { employee_id: true, employee_name: true } },
        policy: { select: { id: true, policy_number: true } },
        carrier: { select: { id: true, name: true } },
      },
    });

    return entries.map(e => ({
      ...e,
      expected: Number(e.expected_amount ?? e.commission_amount),
      actual: Number(e.commission_amount),
      variance: Number(e.variance ?? 0),
    }));
  }

  // ══════════════════════════════════════════════════════════════════════════
  // P5 — AGENT WORKBENCH (aggregate query)
  // ══════════════════════════════════════════════════════════════════════════

  async getAgentWorkbench(agentId, tenantId) {
    const now = new Date();
    const thirtyDays = new Date(now.getTime() + 30 * 86400000);
    const ninetyDays = new Date(now.getTime() + 90 * 86400000);

    const [renewals30, renewals90, compliancePending, renewalTasks] = await Promise.all([
      this.db.renewalTask.count({
        where: { agent_id: agentId, tenant_id: tenantId, status: 'upcoming', renewal_date: { lte: thirtyDays } },
      }),
      this.db.renewalTask.findMany({
        where: { agent_id: agentId, tenant_id: tenantId, status: { in: ['upcoming', 'in_progress'] }, renewal_date: { lte: ninetyDays } },
        include: {
          policy: {
            select: { id: true, policy_number: true, product_type: true, coverage_amount: true, premium_amount: true,
              contact: { select: { id: true, first_name: true, last_name: true, email: true } } },
          },
        },
        orderBy: { renewal_date: 'asc' },
        take: 50,
      }),
      this.db.complianceArtifact.findMany({
        where: { tenant_id: tenantId, status: 'pending', created_by: agentId },
        include: {
          contact: { select: { id: true, first_name: true, last_name: true } },
          application: { select: { id: true, app_number: true } },
          policy: { select: { id: true, policy_number: true } },
        },
        orderBy: { created_at: 'asc' },
        take: 50,
      }),
    ]);

    const complianceOverdue = compliancePending.filter(a => a.expires_at && new Date(a.expires_at) < now).length;

    return {
      stats: {
        renewals_due_30d: renewals30,
        renewals_due_90d: renewals90.length,
        compliance_pending: compliancePending.length,
        compliance_overdue: complianceOverdue,
      },
      renewals: renewalTasks,
      compliance: compliancePending,
    };
  }
}

module.exports = InsuranceDomainService;
