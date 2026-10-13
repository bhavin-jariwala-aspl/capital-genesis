'use strict';

const { Decimal } = require('@prisma/client/runtime/library');
const { getTenantId } = require('../middleware/tenant-scope');
const { logger } = require('./logging.service');

/**
 * CrmService — first-class relational CRM operations.
 *
 * All CRM field data is stored exclusively in the crm_* relational tables.
 * The records table is used only as a thin anchor so that activities, tasks
 * and audit_logs can reference a record_id.  No JSON data blob is written.
 *
 * Supported entity types: lead | contact | account | opportunity | case
 *
 * When fields change:
 *   1. Audit log entry with old/new values
 *   2. field_changed workflow trigger fires
 *   3. Auto activity log for key status transitions
 */
class CrmService {
  /**
   * @param {import('@prisma/client').PrismaClient} prisma
   * @param {import('./events.service').DomainEventBus|null} eventBus  Domain-event backbone; CrmService
   *   publishes `record.field_changed` after CRM entity updates (workflow engine + integrations subscribe).
   */
  constructor(prisma, eventBus = null) {
    this.db = prisma;
    this.eventBus = eventBus;
    this._objectCache = null; // { lead: id, contact: id, ... }
  }

  // ── Change tracking helpers ────────────────────────────────────────────────

  /**
   * Detect which fields changed between old entity and new update data.
   * Returns { fieldName: { old, new } } for each changed field.
   */
  #detectChanges(oldEntity, updateData) {
    const changes = {};
    for (const [key, newVal] of Object.entries(updateData)) {
      const oldVal = oldEntity[key];
      // Normalize Decimals for comparison
      const oldStr = oldVal instanceof Decimal ? Number(oldVal).toString() : String(oldVal ?? '');
      const newStr = newVal instanceof Decimal ? Number(newVal).toString() : String(newVal ?? '');
      if (oldStr !== newStr) {
        changes[key] = { old: oldVal ?? null, new: newVal ?? null };
      }
    }
    return changes;
  }

  /**
   * After a CRM entity update: audit log + workflow trigger + auto activity.
   */
  async #onFieldsChanged(entityType, recordId, objectId, changes, updatedBy) {
    if (!Object.keys(changes).length) return;

    // Capture the tenant SYNCHRONOUSLY. These writes are fire-and-forget, so by
    // the time the promise runs the request's AsyncLocalStorage tenant context
    // may have unwound — the Prisma hook would then inject a null tenant_id and
    // the (required) column would reject the insert. Passing it explicitly makes
    // the audit/activity trail reliable regardless of async timing.
    const tenantId = getTenantId();

    // 1. Audit log (optional — delegate may not exist in test/alternate contexts)
    if (recordId && this.db.auditLog) {
      this.db.auditLog.create({
        data: {
          record_id:   recordId,
          employee_id: updatedBy ?? 'SYSTEM',
          action:      'update',
          changes,
          ...(tenantId != null ? { tenant_id: tenantId } : {}),
        },
      }).catch((err) => logger.warn(`[CrmService] audit log write failed for record ${recordId}: ${err.message}`));
    }

    // 2. Auto activity for status field changes (optional — same guard)
    const statusField = `${entityType}_status`;
    const statusChange = changes[statusField] ?? changes['status'] ?? changes['lead_status']
                      ?? changes['case_status'];
    if (statusChange && recordId && this.db.activity) {
      this.db.activity.create({
        data: {
          record_id:   recordId,
          employee_id: updatedBy ?? 'SYSTEM',
          type:        'note',
          subject:     `Status changed: ${statusChange.old ?? 'none'} → ${statusChange.new}`,
          description: `${entityType} status updated from "${statusChange.old ?? 'none'}" to "${statusChange.new}"`,
          ...(tenantId != null ? { tenant_id: tenantId } : {}),
        },
      }).catch((err) => logger.warn(`[CrmService] activity write failed for record ${recordId}: ${err.message}`));
    }

    // 3. Emit domain event: record.field_changed (workflow engine + integrations subscribe)
    if (this.eventBus && objectId) {
      const record = { id: recordId, object_id: objectId };
      this.eventBus.publish('record.field_changed', {
        objectId, record, changed: changes, actorId: updatedBy,
      }).catch(() => {});
    }
  }

  // ── Object-ID cache ───────────────────────────────────────────────────────

  async #objectIds() {
    if (this._objectCache) return this._objectCache;
    const rows = await this.db.uiObject.findMany({
      where:  { name: { in: ['lead', 'prospect', 'lead_intake', 'contact', 'client', 'account', 'opportunity', 'case'] } },
      select: { id: true, name: true },
    });
    const cache = Object.fromEntries(rows.map(r => [r.name, r.id]));
    // Alias prospect/client object names → CRM names so convertLead finds the right object IDs
    if (!cache.lead    && cache.prospect) cache.lead    = cache.prospect;
    if (!cache.contact && cache.client)   cache.contact = cache.client;
    // Don't alias account → client — when there's no separate
    // account module, so we skip creating a record anchor for the account.
    // The crm_accounts row is still created (for FK references) but without
    // a record in the client module that would show as a duplicate with "--".
    this._objectCache = cache;
    return this._objectCache;
  }

  // ── LEAD ──────────────────────────────────────────────────────────────────

  async createLead(data, assignedTo, createdBy) {
    const objectIds = await this.#objectIds();
    const objectId  = objectIds['lead'];
    const tenantId  = getTenantId();

    return this.db.$transaction(async (tx) => {
      // Anchor record (no data blob)
      const record = objectId
        ? await tx.record.create({
            data: { object_id: objectId, created_by: createdBy ?? null, assigned_to: assignedTo ?? null, tenant_id: tenantId },
          })
        : null;

      const lead = await tx.crmLead.create({
        data: {
          first_name:     data.first_name     ?? '',
          last_name:      data.last_name      ?? '',
          company:        data.company        ?? null,
          email:          data.email          ?? null,
          phone:          data.phone          ?? null,
          mobile:         data.mobile         ?? null,
          job_title:      data.job_title      ?? null,
          lead_source:    data.lead_source    ?? null,
          lead_status:    data.lead_status    ?? 'new',
          rating:         data.rating         ?? null,
          industry:       data.industry       ?? null,
          annual_revenue: data.annual_revenue != null ? new Decimal(data.annual_revenue) : null,
          website:        data.website        ?? null,
          description:    data.description    ?? null,
          is_converted:   false,
          record_id:      record?.id ?? null,
          owner_id:       assignedTo ?? null,
          created_by:     createdBy ?? null,
          tenant_id:      tenantId,
        },
      });
      return { ...lead, record: record ?? undefined };
    });
  }

  async getLead(id) {
    return this.db.crmLead.findUnique({
      where:   { id: Number(id) },
      include: { owner: { select: { employee_id: true, employee_name: true } }, conversion: true },
    });
  }

  async getLeadByRecordId(recordId) {
    return this.db.crmLead.findUnique({ where: { record_id: Number(recordId) } });
  }

  async updateLead(id, data, updatedBy) {
    const lead = await this.db.crmLead.findUnique({ where: { id: Number(id) } });
    if (!lead) throw new Error(`CrmLead ${id} not found`);

    const updateData = {};
    const scalarFields = ['first_name','last_name','company','email','phone','mobile',
      'job_title','lead_source','lead_status','rating','industry','website','description'];
    for (const f of scalarFields) {
      if (data[f] !== undefined) updateData[f] = data[f];
    }
    if (data.annual_revenue !== undefined) {
      updateData.annual_revenue = data.annual_revenue != null ? new Decimal(data.annual_revenue) : null;
    }
    if (data.owner_id !== undefined) updateData.owner_id = data.owner_id;

    // Detect changes before writing
    const changes = this.#detectChanges(lead, updateData);

    const updated = await this.db.$transaction(async (tx) => {
      const result = await tx.crmLead.update({ where: { id: lead.id }, data: updateData });
      if (lead.record_id && data.owner_id !== undefined) {
        await tx.record.update({ where: { id: lead.record_id }, data: { assigned_to: data.owner_id ?? null } });
      }
      return result;
    });

    // Post-update hooks: audit + activity + workflow
    const objectIds = await this.#objectIds();
    this.#onFieldsChanged('lead', lead.record_id, objectIds['lead'], changes, updatedBy);

    return updated;
  }

  // ── CONTACT ───────────────────────────────────────────────────────────────

  async createContact(data, assignedTo, createdBy) {
    const objectIds = await this.#objectIds();
    const objectId  = objectIds['contact'];
    const tenantId  = getTenantId();

    return this.db.$transaction(async (tx) => {
      const record = objectId
        ? await tx.record.create({
            data: { object_id: objectId, created_by: createdBy ?? null, assigned_to: assignedTo ?? null, tenant_id: tenantId },
          })
        : null;

      const contact = await tx.crmContact.create({
        data: {
          first_name:      data.first_name      ?? '',
          last_name:       data.last_name        ?? '',
          email:           data.email            ?? null,
          phone:           data.phone            ?? null,
          mobile:          data.mobile           ?? null,
          title:           data.title            ?? null,
          department:      data.department       ?? null,
          lead_source:     data.lead_source      ?? null,
          mailing_street:  data.mailing_street   ?? null,
          mailing_city:    data.mailing_city     ?? null,
          mailing_state:   data.mailing_state    ?? null,
          mailing_country: data.mailing_country  ?? null,
          mailing_zip:     data.mailing_zip      ?? null,
          birthdate:       data.birthdate ? new Date(data.birthdate) : null,
          description:     data.description      ?? null,
          do_not_contact:  Boolean(data.do_not_contact),
          record_id:       record?.id ?? null,
          account_id:      data.account_id ? Number(data.account_id) : null,
          owner_id:        assignedTo ?? null,
          created_by:      createdBy ?? null,
          tenant_id:       tenantId,
        },
      });
      return { ...contact, record: record ?? undefined };
    });
  }

  async getContact(id) {
    return this.db.crmContact.findUnique({
      where:   { id: Number(id) },
      include: {
        account: { select: { id: true, name: true } },
        owner:   { select: { employee_id: true, employee_name: true } },
      },
    });
  }

  async updateContact(id, data, updatedBy) {
    const contact = await this.db.crmContact.findUnique({ where: { id: Number(id) } });
    if (!contact) throw new Error(`CrmContact ${id} not found`);

    const updateData = {};
    const scalarFields = ['first_name','last_name','email','phone','mobile','title',
      'department','lead_source','mailing_street','mailing_city','mailing_state',
      'mailing_country','mailing_zip','description'];
    for (const f of scalarFields) {
      if (data[f] !== undefined) updateData[f] = data[f];
    }
    if (data.birthdate !== undefined) updateData.birthdate = data.birthdate ? new Date(data.birthdate) : null;
    if (data.do_not_contact !== undefined) updateData.do_not_contact = Boolean(data.do_not_contact);
    if (data.account_id !== undefined) updateData.account_id = data.account_id ? Number(data.account_id) : null;
    if (data.owner_id !== undefined) updateData.owner_id = data.owner_id;

    const changes = this.#detectChanges(contact, updateData);

    const updated = await this.db.$transaction(async (tx) => {
      const result = await tx.crmContact.update({ where: { id: contact.id }, data: updateData });
      if (contact.record_id && data.owner_id !== undefined) {
        await tx.record.update({ where: { id: contact.record_id }, data: { assigned_to: data.owner_id ?? null } });
      }
      return result;
    });

    const objectIds = await this.#objectIds();
    this.#onFieldsChanged('contact', contact.record_id, objectIds['contact'], changes, updatedBy);
    return updated;
  }

  // ── ACCOUNT ───────────────────────────────────────────────────────────────

  async createAccount(data, assignedTo, createdBy) {
    const objectIds = await this.#objectIds();
    const objectId  = objectIds['account'];
    const tenantId  = getTenantId();

    return this.db.$transaction(async (tx) => {
      const record = objectId
        ? await tx.record.create({
            data: { object_id: objectId, created_by: createdBy ?? null, assigned_to: assignedTo ?? null, tenant_id: tenantId },
          })
        : null;

      const account = await tx.crmAccount.create({
        data: {
          name:            data.name            ?? data.company ?? '',
          website:         data.website         ?? null,
          phone:           data.phone           ?? null,
          email:           data.email           ?? null,
          industry:        data.industry        ?? null,
          account_type:    data.account_type    ?? null,
          annual_revenue:  data.annual_revenue  != null ? new Decimal(data.annual_revenue) : null,
          employee_count:  data.employee_count  != null ? Number(data.employee_count) : null,
          billing_street:  data.billing_street  ?? null,
          billing_city:    data.billing_city    ?? null,
          billing_state:   data.billing_state   ?? null,
          billing_country: data.billing_country ?? null,
          billing_zip:     data.billing_zip     ?? null,
          description:     data.description     ?? null,
          record_id:       record?.id ?? null,
          owner_id:        assignedTo ?? null,
          created_by:      createdBy ?? null,
          tenant_id:       tenantId,
        },
      });
      return { ...account, record: record ?? undefined };
    });
  }

  async getAccount(id) {
    return this.db.crmAccount.findUnique({
      where:   { id: Number(id) },
      include: {
        owner:    { select: { employee_id: true, employee_name: true } },
        contacts: { select: { id: true, first_name: true, last_name: true, email: true } },
      },
    });
  }

  async updateAccount(id, data, updatedBy) {
    const account = await this.db.crmAccount.findUnique({ where: { id: Number(id) } });
    if (!account) throw new Error(`CrmAccount ${id} not found`);

    const updateData = {};
    const scalarFields = ['name','website','phone','email','industry','account_type',
      'billing_street','billing_city','billing_state','billing_country','billing_zip','description'];
    for (const f of scalarFields) {
      if (data[f] !== undefined) updateData[f] = data[f];
    }
    if (data.annual_revenue !== undefined) updateData.annual_revenue = data.annual_revenue != null ? new Decimal(data.annual_revenue) : null;
    if (data.employee_count !== undefined) updateData.employee_count = data.employee_count != null ? Number(data.employee_count) : null;
    if (data.owner_id !== undefined) updateData.owner_id = data.owner_id;

    const changes = this.#detectChanges(account, updateData);

    const updated = await this.db.$transaction(async (tx) => {
      const result = await tx.crmAccount.update({ where: { id: account.id }, data: updateData });
      if (account.record_id && data.owner_id !== undefined) {
        await tx.record.update({ where: { id: account.record_id }, data: { assigned_to: data.owner_id ?? null } });
      }
      return result;
    });

    const objectIds = await this.#objectIds();
    this.#onFieldsChanged('account', account.record_id, objectIds['account'], changes, updatedBy);
    return updated;
  }

  // ── OPPORTUNITY ───────────────────────────────────────────────────────────

  async createOpportunity(data, assignedTo, createdBy) {
    const objectIds = await this.#objectIds();
    const objectId  = objectIds['opportunity'];
    const tenantId  = getTenantId();

    return this.db.$transaction(async (tx) => {
      const record = objectId
        ? await tx.record.create({
            data: { object_id: objectId, created_by: createdBy ?? null, assigned_to: assignedTo ?? null, tenant_id: tenantId },
          })
        : null;

      const opp = await tx.crmOpportunity.create({
        data: {
          name:        data.name        ?? '',
          amount:      data.amount      != null ? new Decimal(data.amount) : null,
          currency:    data.currency    ?? 'USD',
          stage:       data.stage       ?? 'prospecting',
          probability: data.probability != null ? Number(data.probability) : 0,
          close_date:  data.close_date  ? new Date(data.close_date) : null,
          lead_source: data.lead_source ?? null,
          type:        data.type        ?? null,
          next_step:   data.next_step   ?? null,
          description: data.description ?? null,
          is_closed:   Boolean(data.is_closed),
          is_won:      Boolean(data.is_won),
          record_id:   record?.id ?? null,
          account_id:  data.account_id ? Number(data.account_id) : null,
          contact_id:  data.contact_id ? Number(data.contact_id) : null,
          owner_id:    assignedTo ?? null,
          created_by:  createdBy ?? null,
          tenant_id:   tenantId,
        },
      });
      return { ...opp, record: record ?? undefined };
    });
  }

  async getOpportunity(id) {
    return this.db.crmOpportunity.findUnique({
      where:   { id: Number(id) },
      include: {
        account: { select: { id: true, name: true } },
        contact: { select: { id: true, first_name: true, last_name: true } },
        owner:   { select: { employee_id: true, employee_name: true } },
      },
    });
  }

  async updateOpportunity(id, data, updatedBy) {
    const opp = await this.db.crmOpportunity.findUnique({ where: { id: Number(id) } });
    if (!opp) throw new Error(`CrmOpportunity ${id} not found`);

    const updateData = {};
    const scalarFields = ['name','currency','stage','lead_source','type','next_step','description'];
    for (const f of scalarFields) {
      if (data[f] !== undefined) updateData[f] = data[f];
    }
    if (data.amount !== undefined)      updateData.amount      = data.amount != null ? new Decimal(data.amount) : null;
    if (data.probability !== undefined) updateData.probability = Number(data.probability);
    if (data.close_date !== undefined)  updateData.close_date  = data.close_date ? new Date(data.close_date) : null;
    if (data.is_closed !== undefined)   updateData.is_closed   = Boolean(data.is_closed);
    if (data.is_won !== undefined)      updateData.is_won      = Boolean(data.is_won);
    if (data.account_id !== undefined)  updateData.account_id  = data.account_id ? Number(data.account_id) : null;
    if (data.contact_id !== undefined)  updateData.contact_id  = data.contact_id ? Number(data.contact_id) : null;
    if (data.owner_id !== undefined)    updateData.owner_id    = data.owner_id;

    const changes = this.#detectChanges(opp, updateData);

    const updated = await this.db.$transaction(async (tx) => {
      const result = await tx.crmOpportunity.update({ where: { id: opp.id }, data: updateData });
      if (opp.record_id && data.owner_id !== undefined) {
        await tx.record.update({ where: { id: opp.record_id }, data: { assigned_to: data.owner_id ?? null } });
      }
      return result;
    });

    const objectIds = await this.#objectIds();
    this.#onFieldsChanged('opportunity', opp.record_id, objectIds['opportunity'], changes, updatedBy);
    return updated;
  }

  // ── CASE ──────────────────────────────────────────────────────────────────

  async createCase(data, assignedTo, createdBy) {
    const objectIds = await this.#objectIds();
    const objectId  = objectIds['case'];
    const tenantId  = getTenantId();

    return this.db.$transaction(async (tx) => {
      const record = objectId
        ? await tx.record.create({
            data: { object_id: objectId, created_by: createdBy ?? null, assigned_to: assignedTo ?? null, tenant_id: tenantId },
          })
        : null;

      const crmCase = await tx.crmCase.create({
        data: {
          subject:       data.subject       ?? '',
          description:   data.description   ?? null,
          status:        data.status        ?? 'new',
          priority:      data.priority      ?? 'medium',
          type:          data.type          ?? null,
          origin:        data.origin        ?? null,
          contact_email: data.contact_email ?? data.email ?? null,
          contact_name:  data.contact_name  ?? null,
          resolution:    data.resolution    ?? null,
          record_id:     record?.id ?? null,
          account_id:    data.account_id ? Number(data.account_id) : null,
          contact_id:    data.contact_id ? Number(data.contact_id) : null,
          owner_id:      assignedTo ?? null,
          created_by:    createdBy ?? null,
          tenant_id:     tenantId,
        },
      });
      return { ...crmCase, record: record ?? undefined };
    });
  }

  async getCase(id) {
    return this.db.crmCase.findUnique({
      where:   { id: Number(id) },
      include: {
        account: { select: { id: true, name: true } },
        contact: { select: { id: true, first_name: true, last_name: true } },
        owner:   { select: { employee_id: true, employee_name: true } },
      },
    });
  }

  async updateCase(id, data, updatedBy) {
    const crmCase = await this.db.crmCase.findUnique({ where: { id: Number(id) } });
    if (!crmCase) throw new Error(`CrmCase ${id} not found`);

    const updateData = {};
    const scalarFields = ['subject','description','status','priority','type','origin',
      'contact_email','contact_name','resolution'];
    for (const f of scalarFields) {
      if (data[f] !== undefined) updateData[f] = data[f];
    }
    if (data.account_id !== undefined) updateData.account_id = data.account_id ? Number(data.account_id) : null;
    if (data.contact_id !== undefined) updateData.contact_id = data.contact_id ? Number(data.contact_id) : null;
    if (data.owner_id !== undefined)   updateData.owner_id   = data.owner_id;

    const changes = this.#detectChanges(crmCase, updateData);

    const updated = await this.db.$transaction(async (tx) => {
      const result = await tx.crmCase.update({ where: { id: crmCase.id }, data: updateData });
      if (crmCase.record_id && data.owner_id !== undefined) {
        await tx.record.update({ where: { id: crmCase.record_id }, data: { assigned_to: data.owner_id ?? null } });
      }
      return result;
    });

    const objectIds = await this.#objectIds();
    this.#onFieldsChanged('case', crmCase.record_id, objectIds['case'], changes, updatedBy);
    return updated;
  }

  // ── LEAD CONVERSION ───────────────────────────────────────────────────────

  /**
   * Convert a lead into Account + Contact + Opportunity (each optional).
   *
   * conversionData shape:
   *   create_account      boolean  (default true)
   *   account_id          number   use existing account instead of creating
   *   create_contact      boolean  (default true)
   *   create_opportunity  boolean  (default false)
   *   opportunity_name    string   required if create_opportunity=true
   *   opportunity_amount  number
   *   close_date          string   ISO date
   *   notes               string
   *
   * Runs in a single DB transaction.
   * @returns {{ lead, account, contact, opportunity, conversion }}
   */
  async convertLead(leadId, conversionData = {}, convertedBy = null) {
    const lead = await this.db.crmLead.findUnique({ where: { id: Number(leadId) } });
    if (!lead) throw new Error(`CrmLead ${leadId} not found`);
    if (lead.is_converted) throw new Error('Lead has already been converted');

    const objectIds = await this.#objectIds();
    const now = new Date();

    const tenantId = lead.tenant_id;

    return this.db.$transaction(async (tx) => {
      // 1. Mark lead converted
      const updatedLead = await tx.crmLead.update({
        where: { id: lead.id },
        data:  { is_converted: true, converted_at: now, lead_status: 'converted' },
      });

      // Sync prospect pipeline stage to "converted"
      if (lead.record_id) {
        const convertedStage = await tx.uiPipelineStage.findFirst({
          where: { name: 'converted', pipeline: { object_id: objectIds['lead'] ?? objectIds['prospect'] } },
          select: { id: true },
        });
        if (convertedStage) {
          await tx.record.update({ where: { id: lead.record_id }, data: { pipeline_stage_id: convertedStage.id } });
        }
      }

      // 2. Account
      let account = null;
      if (conversionData.account_id) {
        account = await tx.crmAccount.findUnique({ where: { id: Number(conversionData.account_id) } });
      } else if (conversionData.create_account !== false) {
        const accountRecord = objectIds['account']
          ? await tx.record.create({
              data: { object_id: objectIds['account'], created_by: convertedBy ?? null, assigned_to: lead.owner_id ?? null, tenant_id: tenantId },
            })
          : null;
        account = await tx.crmAccount.create({
          data: {
            name:           conversionData.account_name || lead.company || `${lead.first_name} ${lead.last_name}`,
            phone:          lead.phone,
            website:        lead.website,
            industry:       lead.industry,
            annual_revenue: lead.annual_revenue,
            record_id:      accountRecord?.id ?? null,
            owner_id:       lead.owner_id ?? null,
            created_by:     convertedBy ?? null,
            tenant_id:      tenantId,
          },
        });
      }

      // 3. Contact
      let contact = null;
      if (conversionData.create_contact !== false) {
        const contactRecord = objectIds['contact']
          ? await tx.record.create({
              data: { object_id: objectIds['contact'], created_by: convertedBy ?? null, assigned_to: lead.owner_id ?? null, tenant_id: tenantId },
            })
          : null;
        contact = await tx.crmContact.create({
          data: {
            first_name:  lead.first_name,
            last_name:   lead.last_name,
            email:       lead.email,
            phone:       lead.phone,
            mobile:      lead.mobile,
            title:       lead.job_title,
            lead_source: lead.lead_source,
            record_id:   contactRecord?.id ?? null,
            account_id:  account?.id ?? null,
            owner_id:    lead.owner_id ?? null,
            created_by:  convertedBy ?? null,
            tenant_id:   tenantId,
          },
        });
      }

      // 4. Opportunity (optional)
      let opportunity = null;
      if (conversionData.create_opportunity && conversionData.opportunity_name) {
        const oppRecord = objectIds['opportunity']
          ? await tx.record.create({
              data: { object_id: objectIds['opportunity'], created_by: convertedBy ?? null, assigned_to: lead.owner_id ?? null, tenant_id: tenantId },
            })
          : null;
        opportunity = await tx.crmOpportunity.create({
          data: {
            name:        conversionData.opportunity_name,
            amount:      conversionData.opportunity_amount != null ? new Decimal(conversionData.opportunity_amount) : null,
            close_date:  conversionData.close_date ? new Date(conversionData.close_date) : null,
            lead_source: lead.lead_source,
            stage:       'prospecting',
            probability: 10,
            record_id:   oppRecord?.id ?? null,
            account_id:  account?.id ?? null,
            contact_id:  contact?.id ?? null,
            owner_id:    lead.owner_id ?? null,
            created_by:  convertedBy ?? null,
            tenant_id:   tenantId,
          },
        });
      }

      // 5. CrmLeadConversion audit record
      const conversion = await tx.crmLeadConversion.create({
        data: {
          lead_id:        lead.id,
          account_id:     account?.id     ?? null,
          contact_id:     contact?.id     ?? null,
          opportunity_id: opportunity?.id ?? null,
          converted_by:   convertedBy,
          converted_at:   now,
          notes:          conversionData.notes ?? null,
          tenant_id:      tenantId,
        },
      });

      return { lead: updatedLead, account, contact, opportunity, conversion };
    });
  }

  /**
   * Convert a raw Lead (crm_lead_intake) into a Prospect (crm_leads).
   * This is the front half of the lifecycle (Lead → Prospect); the existing
   * convertLead() handles the back half (Prospect → Client). Creates a Prospect
   * record + CrmLead from the intake's data, marks the intake converted, links
   * them via converted_prospect_id, and pushes the intake's pipeline to the
   * "converted" stage.
   */
  async convertLeadToProspect(intakeId, opts = {}, convertedBy = null) {
    const intake = await this.db.crmLeadIntake.findUnique({ where: { id: Number(intakeId) } });
    if (!intake) throw new Error(`CrmLeadIntake ${intakeId} not found`);
    if (intake.is_converted) throw new Error('Lead has already been converted');

    const objectIds = await this.#objectIds();
    const prospectObjectId = objectIds['prospect'] ?? objectIds['lead'];
    if (!prospectObjectId) throw new Error('Prospect object not found — cannot convert lead');

    const now = new Date();
    const tenantId = intake.tenant_id;

    return this.db.$transaction(async (tx) => {
      // 1. Create the Prospect anchor record + CrmLead from the intake data
      const prospectRecord = await tx.record.create({
        data: {
          object_id:   prospectObjectId,
          created_by:  convertedBy ?? null,
          assigned_to: intake.owner_id ?? null,
          tenant_id:   tenantId,
        },
      });
      const prospect = await tx.crmLead.create({
        data: {
          first_name:     intake.first_name,
          last_name:      intake.last_name,
          company:        intake.company,
          email:          intake.email,
          phone:          intake.phone,
          mobile:         intake.mobile,
          job_title:      intake.job_title,
          lead_source:    intake.lead_source,
          lead_status:    'new',
          rating:         intake.rating,
          industry:       intake.industry,
          annual_revenue: intake.annual_revenue,
          website:        intake.website,
          description:    intake.description,
          record_id:      prospectRecord.id,
          owner_id:       intake.owner_id ?? null,
          created_by:     convertedBy ?? null,
          tenant_id:      tenantId,
        },
      });

      // 2. Mark the intake converted + link to the new prospect
      const updatedIntake = await tx.crmLeadIntake.update({
        where: { id: intake.id },
        data:  { is_converted: true, converted_at: now, converted_prospect_id: prospect.id, lead_status: 'converted' },
      });

      // 3. Sync the intake's own pipeline to its "converted" stage
      if (intake.record_id && objectIds['lead_intake']) {
        const convertedStage = await tx.uiPipelineStage.findFirst({
          where:  { name: 'converted', pipeline: { object_id: objectIds['lead_intake'] } },
          select: { id: true },
        });
        if (convertedStage) {
          await tx.record.update({ where: { id: intake.record_id }, data: { pipeline_stage_id: convertedStage.id } });
        }
      }

      return { intake: updatedIntake, prospect, prospectRecordId: prospectRecord.id };
    });
  }

  // ── ASSOCIATIONS ──────────────────────────────────────────────────────────

  async createAssociation({ from_type, from_id, to_type, to_id, assoc_type, created_by }) {
    this.#validateAssocType(from_type);
    this.#validateAssocType(to_type);
    return this.db.crmAssociation.upsert({
      where:  { from_type_from_id_to_type_to_id_assoc_type: { from_type, from_id: Number(from_id), to_type, to_id: Number(to_id), assoc_type } },
      create: { from_type, from_id: Number(from_id), to_type, to_id: Number(to_id), assoc_type, created_by: created_by ?? null },
      update: {},
    });
  }

  async getAssociations({ from_type, from_id, to_type } = {}) {
    const where = {};
    if (from_type) where.from_type = from_type;
    if (from_id)   where.from_id   = Number(from_id);
    if (to_type)   where.to_type   = to_type;
    return this.db.crmAssociation.findMany({ where, orderBy: { created_at: 'desc' } });
  }

  async deleteAssociation(id) {
    return this.db.crmAssociation.delete({ where: { id: Number(id) } });
  }

  // ── SQL-BASED FORECAST AGGREGATION ────────────────────────────────────────

  async computeRelationalForecast(options = {}) {
    const { owner_id, from_close_date, to_close_date, stage } = options;

    const pipelines = await this.db.uiPipeline.findMany({
      where:   { object: { name: 'opportunity' } },
      include: { stages: true },
    });
    const stageWeights = {};
    for (const p of pipelines) {
      for (const s of p.stages ?? []) {
        const w = typeof s.config?.forecast_weight === 'number' ? s.config.forecast_weight : 0;
        stageWeights[s.name] = w;
      }
    }

    const where = { is_closed: false };
    if (owner_id) {
      // Support both a single employee_id string and an array for team forecasts.
      where.owner_id = Array.isArray(owner_id) ? { in: owner_id } : owner_id;
    }
    if (stage)           where.stage      = stage;
    if (from_close_date) where.close_date = { ...(where.close_date ?? {}), gte: new Date(from_close_date) };
    if (to_close_date)   where.close_date = { ...(where.close_date ?? {}), lte: new Date(to_close_date) };

    const opportunities = await this.db.crmOpportunity.findMany({
      where,
      select: { id: true, amount: true, stage: true, owner_id: true, probability: true },
    });

    let totalPipeline    = 0;
    let weightedForecast = 0;
    const byStage        = {};
    const byOwner        = {};

    for (const opp of opportunities) {
      const amount = Number(opp.amount ?? 0);
      const weight = stageWeights[opp.stage] ?? (opp.probability / 100);
      const wValue = amount * weight;

      totalPipeline    += amount;
      weightedForecast += wValue;

      const sk = opp.stage ?? 'unknown';
      if (!byStage[sk]) byStage[sk] = { stage: sk, count: 0, amount: 0, weighted: 0, weight };
      byStage[sk].count    += 1;
      byStage[sk].amount   += amount;
      byStage[sk].weighted += wValue;

      const ok2 = opp.owner_id ?? 'unassigned';
      if (!byOwner[ok2]) byOwner[ok2] = { owner_id: ok2, count: 0, amount: 0, weighted: 0 };
      byOwner[ok2].count    += 1;
      byOwner[ok2].amount   += amount;
      byOwner[ok2].weighted += wValue;
    }

    return {
      total_pipeline:    +totalPipeline.toFixed(2),
      weighted_forecast: +weightedForecast.toFixed(2),
      record_count:      opportunities.length,
      by_stage:          Object.values(byStage),
      by_owner:          Object.values(byOwner),
    };
  }

  // ── STRUCTURED DUPLICATE DETECTION ────────────────────────────────────────

  async detectDuplicatesRelational(crmType, rows, dedupeKeys) {
    if (!dedupeKeys?.length) return { unique: rows, dupes: [] };

    const MODEL = {
      lead:        'crmLead',
      contact:     'crmContact',
      account:     'crmAccount',
      opportunity: 'crmOpportunity',
      case:        'crmCase',
    };
    const model = MODEL[crmType];
    if (!model) return { unique: rows, dupes: [] };

    // ── Fast path: single dedup key ──────────────────────────────────────────
    // Batch all distinct values into one findMany, build a lookup map,
    // then classify rows locally \u2014 avoids N sequential DB round-trips.
    if (dedupeKeys.length === 1) {
      const key    = dedupeKeys[0];
      const values = [...new Set(
        rows.map(r => r[key]).filter(v => v !== undefined && v !== '').map(String),
      )];

      const existing = values.length
        ? await this.db[model].findMany({
            where:  { [key]: { in: values, mode: 'insensitive' } },
            select: { id: true, record_id: true, [key]: true },
          })
        : [];

      // Build case-insensitive lookup map: normalised_value → entity
      const lookup = new Map(existing.map(e => [String(e[key] ?? '').toLowerCase(), e]));

      const unique = [];
      const dupes  = [];
      for (const row of rows) {
        const val = row[key];
        if (val === undefined || val === '') { unique.push(row); continue; }
        const match = lookup.get(String(val).toLowerCase());
        if (match) {
          dupes.push({ row, match_id: match.id, match_record_id: match.record_id });
        } else {
          unique.push(row);
        }
      }
      return { unique, dupes };
    }

    // ── Multi-key path: sequential per-row queries ───────────────────────────
    // Each row's composite condition (AND across multiple keys) is not trivially
    // batched; fall back to one query per row.
    const unique = [];
    const dupes  = [];

    for (const row of rows) {
      const where = {};
      for (const key of dedupeKeys) {
        if (row[key] !== undefined && row[key] !== '') {
          where[key] = { equals: String(row[key]), mode: 'insensitive' };
        }
      }
      if (!Object.keys(where).length) { unique.push(row); continue; }

      const match = await this.db[model].findFirst({ where, select: { id: true, record_id: true } });
      if (match) {
        dupes.push({ row, match_id: match.id, match_record_id: match.record_id });
      } else {
        unique.push(row);
      }
    }

    return { unique, dupes };
  }

  // ── List helpers ──────────────────────────────────────────────────────────

  async listLeads(filters = {}) {
    const where = {};
    if (filters.owner_id)    where.owner_id    = filters.owner_id;
    if (filters.lead_status) where.lead_status = filters.lead_status;
    if (filters.is_converted !== undefined) where.is_converted = Boolean(filters.is_converted);
    return this.db.crmLead.findMany({
      where,
      orderBy: { created_at: 'desc' },
      take:    filters.limit ? Number(filters.limit) : 100,
      include: { owner: { select: { employee_id: true, employee_name: true } } },
    });
  }

  async listContacts(filters = {}) {
    const where = {};
    if (filters.account_id) where.account_id = Number(filters.account_id);
    if (filters.owner_id)   where.owner_id   = filters.owner_id;
    return this.db.crmContact.findMany({
      where,
      orderBy: { created_at: 'desc' },
      take:    filters.limit ? Number(filters.limit) : 100,
      include: { account: { select: { id: true, name: true } } },
    });
  }

  async listAccounts(filters = {}) {
    const where = {};
    if (filters.owner_id) where.owner_id = filters.owner_id;
    return this.db.crmAccount.findMany({
      where,
      orderBy: { created_at: 'desc' },
      take:    filters.limit ? Number(filters.limit) : 100,
    });
  }

  async listOpportunities(filters = {}) {
    const where = {};
    if (filters.account_id) where.account_id = Number(filters.account_id);
    if (filters.owner_id)   where.owner_id   = filters.owner_id;
    if (filters.stage)      where.stage      = filters.stage;
    if (filters.is_closed !== undefined) where.is_closed = Boolean(filters.is_closed);
    return this.db.crmOpportunity.findMany({
      where,
      orderBy: { created_at: 'desc' },
      take:    filters.limit ? Number(filters.limit) : 100,
      include: { account: { select: { id: true, name: true } } },
    });
  }

  async listCases(filters = {}) {
    const where = {};
    if (filters.account_id) where.account_id = Number(filters.account_id);
    if (filters.owner_id)   where.owner_id   = filters.owner_id;
    if (filters.status)     where.status     = filters.status;
    return this.db.crmCase.findMany({
      where,
      orderBy: { created_at: 'desc' },
      take:    filters.limit ? Number(filters.limit) : 100,
    });
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  static #CRM_TYPES = new Set(['lead', 'contact', 'account', 'opportunity', 'case']);

  #validateAssocType(type) {
    if (!CrmService.#CRM_TYPES.has(type)) {
      throw new Error(`Invalid CRM entity type: "${type}". Must be one of: ${[...CrmService.#CRM_TYPES].join(', ')}`);
    }
  }
}

module.exports = CrmService;
