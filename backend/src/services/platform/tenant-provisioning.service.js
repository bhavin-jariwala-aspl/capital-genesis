'use strict';

const bcrypt = require('bcryptjs');
const { tenantContext } = require('../../middleware/tenant-scope');
const { BUILTIN_ROLE_LEVEL } = require('../../middleware/authenticate');
const { ValidationError, ConflictError, NotFoundError } = require('../../utils/errors');
const EmailTemplateService = require('../email-template.service');

/**
 * Tenant provisioning - turn a `tenants` row into a workspace someone can use.
 *
 * The problem this solves
 * -----------------------
 * Creating a tenant used to insert one row. Everything that makes the product
 * work - the role ladder, an office to file people under, the modules, objects,
 * fields, forms, pages, pipelines and wizards the whole UI is generated from,
 * the dashboards, the automation, the document taxonomy - existed only for the
 * tenant `prisma/seed.js` built. A brand-new tenant's first admin therefore
 * signed in to a CRM with no CRM in it, and the platform admin's only recourse
 * was to run seed scripts by hand. Worse, the missing `roles` rows meant the
 * sign-in role lookup found nothing and the old `?? 1` default handed that
 * admin platform-wide authority (see `resolveRoleLevel`).
 *
 * So onboarding is one operation with a reported outcome per step, and every
 * step is idempotent: re-running it on a half-provisioned tenant finishes the
 * job instead of duplicating it. That is what lets the console offer both
 * "create and set up" and "finish setup", and what makes a failure mid-way
 * recoverable rather than a tenant to delete and start again.
 *
 * Where the content comes from
 * ----------------------------
 * Two sources, deliberately:
 *
 *  - The template tenant. UI metadata is data, not code: it lives only in the
 *    database and an admin edits it in the Builder. Cloning a nominated
 *    template tenant means the platform team curates one workspace and every
 *    new tenant inherits it, instead of a second 3,000-line seed script
 *    drifting away from the first.
 *  - The code catalogues. Workflows (`prisma/crm-workflows.js`) and dashboards
 *    (`prisma/crm-dashboards.js`) already have installers that take a
 *    tenant-scoped client, and their source of truth is code. Provisioning
 *    calls those rather than cloning rows, so a new tenant gets the current
 *    catalogue even if the template tenant's copy has been hand-edited.
 */

// Rows written per `createMany` call. Big enough to keep the round trips down,
// small enough to stay inside the MySQL packet limit on wide metadata rows.
const CHUNK = 500;

// Columns the database owns - never copied from the source row.
const DROPPED_COLUMNS = ['id', 'created_at', 'updated_at', 'tenant_id'];

/**
 * The clone plan, parent-first.
 *
 * `key` names the columns that identify a row within its tenant, and is only
 * needed for tables that later rows point at: after a bulk insert MySQL does
 * not hand back the new ids, so the map from source id to target id is rebuilt
 * by matching on that key. Tables nothing points at (leaves) omit it and are
 * inserted and forgotten.
 *
 * `remap` translates a foreign key through the map of an earlier step.
 * `polymorphic` handles `ui_permissions`, whose `entity_id` means a different
 * table depending on `entity_type`.
 * `nullify` clears columns that name a person: `created_by` holds a template
 * tenant's employee id, which means nothing in the new tenant.
 *
 * What is deliberately absent is as important as what is here. Business data
 * (records, leads, contacts, opportunities, documents, reports, social
 * accounts) is never copied - a new customer gets a configured product, not
 * somebody else's book of business. `assignment_rules` is skipped for a
 * narrower reason: every branch of it points at an employee (`assignee_id`,
 * `pool_ids`, `fallback_id`) and those ids do not exist in the new tenant, so a
 * copy would be silently broken routing rather than a head start.
 */
const CLONE_PLAN = [
  { model: 'uiModule',            label: 'modules',                 key: ['name'] },
  { model: 'uiObject',            label: 'objects',                 key: ['module_id', 'name'], remap: { module_id: 'uiModule' } },
  { model: 'uiField',             label: 'fields',                  key: ['object_id', 'name'], remap: { object_id: 'uiObject' } },
  { model: 'uiForm',              label: 'forms',                   key: ['object_id', 'name'], remap: { object_id: 'uiObject' } },
  { model: 'uiFormFieldLayout',   label: 'form layouts',            remap: { form_id: 'uiForm', field_id: 'uiField' } },
  { model: 'uiValidation',        label: 'field validations',       remap: { field_id: 'uiField' } },
  { model: 'uiFieldDependency',   label: 'field dependencies',      remap: { source_field_id: 'uiField', target_field_id: 'uiField' } },
  { model: 'uiPage',              label: 'pages',                   key: ['name'], remap: { object_id: 'uiObject' } },
  { model: 'uiPipeline',          label: 'pipelines',               key: ['object_id', 'name'], remap: { object_id: 'uiObject' } },
  { model: 'uiPipelineStage',     label: 'pipeline stages',         remap: { pipeline_id: 'uiPipeline' } },
  { model: 'uiWizard',            label: 'wizards',                 key: ['name'], remap: { object_id: 'uiObject' } },
  { model: 'uiWizardStep',        label: 'wizard steps',            remap: { wizard_id: 'uiWizard', form_id: 'uiForm' } },
  { model: 'uiDocumentCategory',  label: 'document categories',     key: ['code'] },
  { model: 'uiDocumentChecklist', label: 'document checklists',     key: ['entity_type', 'label'] },
  { model: 'operationalPermission', label: 'operational permissions' },
  { model: 'leadScoringRule',     label: 'lead-scoring rules',      nullify: ['created_by'] },
  {
    model: 'uiPermission', label: 'metadata permissions',
    polymorphic: {
      idField: 'entity_id', typeField: 'entity_type',
      byType: {
        module: 'uiModule', object: 'uiObject', field: 'uiField',
        form: 'uiForm', pipeline: 'uiPipeline', wizard: 'uiWizard',
      },
    },
  },
];

/**
 * Role names a tenant needs before anyone can sign in, with their level from
 * the frozen ladder. `platform_admin` is excluded on purpose: it is a single
 * system-wide row (`tenant_id: NULL`) and must never be minted per tenant.
 */
const TENANT_ROLE_SEED = [
  ['super_admin',        'Super Administrator', 'Full workspace access; can configure and manage everything'],
  ['admin',              'Administrator',       'Administrative access; can manage modules and users'],
  ['manager',            'Manager',             'Can view and manage records of direct and indirect reports'],
  ['user',               'User',                'Standard user; can only access own records'],
].map(([name, label, description]) => ({ name, label, description, level: BUILTIN_ROLE_LEVEL[name] }));

/** Steps in the order they must run, and what each one is called in the UI. */
const STEPS = Object.freeze([
  { key: 'roles',           title: 'Role ladder' },
  { key: 'org',             title: 'Office and region' },
  { key: 'metadata',        title: 'CRM metadata' },
  { key: 'workflows',       title: 'Automation' },
  { key: 'dashboards',      title: 'Dashboards' },
  { key: 'sla',             title: 'SLA policies' },
  { key: 'email_templates', title: 'Email templates' },
  { key: 'admin',           title: 'First administrator' },
]);

/** `employee_id` / slug shape the console and the API agree on. */
const EMPLOYEE_ID_RE = /^[A-Z0-9_]{3,20}$/;
const SLUG_RE        = /^[a-z0-9](?:[a-z0-9-]{1,98}[a-z0-9])$/;

class TenantProvisioningService {
  /**
   * @param {import('@prisma/client').PrismaClient} prisma tenant-scope-extended client
   * @param {{ log?: { warn: Function, info: Function } }} [opts]
   */
  constructor(prisma, { log } = {}) {
    this.db  = prisma;
    this.log = log ?? null;
  }

  // -- Template tenant -------------------------------------------------------

  /**
   * Which tenant to copy metadata from.
   *
   * An explicit id wins, then `TEMPLATE_TENANT_SLUG` (defaulting to the demo
   * workspace the seed builds), then the oldest tenant that actually has
   * metadata - so a deployment that renamed its demo tenant still works.
   * Returns null when there is nothing to copy, which the metadata step
   * reports as a skip rather than an error.
   */
  async resolveTemplateTenantId(explicitId, excludeTenantId = null) {
    if (explicitId != null && explicitId !== '') {
      const id = Number(explicitId);
      const row = await this.db.tenant.findUnique({ where: { id }, select: { id: true } });
      if (!row) throw new NotFoundError(`Template tenant ${explicitId}`);
      return row.id;
    }

    const slug = process.env.TEMPLATE_TENANT_SLUG || 'genesis-life-demo';
    const bySlug = await this.db.tenant.findUnique({ where: { slug }, select: { id: true } });
    if (bySlug && bySlug.id !== excludeTenantId) return bySlug.id;

    const withMetadata = await this.db.uiModule.findFirst({
      where:   excludeTenantId ? { tenant_id: { not: excludeTenantId } } : {},
      select:  { tenant_id: true },
      orderBy: { tenant_id: 'asc' },
    });
    return withMetadata?.tenant_id ?? null;
  }

  // -- Availability probes (for the wizard's live feedback) ------------------

  /** Whether `slug` is free, plus a suggestion when it is not. */
  async checkSlug(slug) {
    const value = String(slug ?? '').trim().toLowerCase();
    if (!SLUG_RE.test(value)) {
      return {
        slug: value,
        available: false,
        reason: 'Use 3-100 characters: lowercase letters, numbers and hyphens, starting and ending with a letter or number.',
      };
    }
    const taken = await this.db.tenant.findUnique({ where: { slug: value }, select: { id: true } });
    if (!taken) return { slug: value, available: true };
    return { slug: value, available: false, reason: 'Already in use', suggestion: await this.#suggestSlug(value) };
  }

  async #suggestSlug(base) {
    for (let n = 2; n <= 20; n++) {
      const candidate = `${base}-${n}`.slice(0, 100);
      const taken = await this.db.tenant.findUnique({ where: { slug: candidate }, select: { id: true } });
      if (!taken) return candidate;
    }
    return `${base}-${Date.now().toString(36)}`.slice(0, 100);
  }

  /**
   * Whether an admin identity is free.
   *
   * `employees.employee_id` and `employees.email` are unique across the whole
   * deployment rather than per tenant, so "TADMIN001" can only ever exist once
   * platform-wide. The console asks this before submitting so a novice sees the
   * clash (and a suggested alternative) while typing, instead of a 409 after
   * filling in the whole form.
   */
  async checkAdminIdentity({ employee_id: employeeId, email, slug } = {}) {
    const id = String(employeeId ?? '').trim().toUpperCase();
    const out = {};

    if (id) {
      out.employee_id = EMPLOYEE_ID_RE.test(id)
        ? await this.#identityAvailability(id, slug)
        : { value: id, available: false, reason: 'Use 3-20 characters: A-Z, 0-9 or underscore.' };
    }
    if (email) {
      const taken = await this.#unscoped(() => this.db.employee.findFirst({ where: { email }, select: { employee_id: true } }));
      out.email = taken
        ? { value: email, available: false, reason: 'Already registered to another account' }
        : { value: email, available: true };
    }
    return out;
  }

  async #identityAvailability(id, slug) {
    const taken = await this.#unscoped(() => this.db.employee.findFirst({ where: { employee_id: id }, select: { employee_id: true } }));
    if (!taken) return { value: id, available: true };
    return { value: id, available: false, reason: 'Already in use', suggestion: await this.#suggestEmployeeId(id, slug) };
  }

  async #suggestEmployeeId(base, slug) {
    // Prefer a workspace-flavoured prefix - it reads better than "ADMIN0012"
    // and keeps IDs recognisable once a deployment has many tenants.
    const prefix = String(slug ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
    const stems = prefix ? [`${prefix}_${base}`.slice(0, 20), base] : [base];
    for (const stem of stems) {
      for (let n = 1; n <= 50; n++) {
        const candidate = (n === 1 && stem !== base ? stem : `${stem}${n}`).slice(0, 20).toUpperCase();
        if (!EMPLOYEE_ID_RE.test(candidate)) continue;
        const taken = await this.#unscoped(() => this.db.employee.findFirst({ where: { employee_id: candidate }, select: { employee_id: true } }));
        if (!taken) return candidate;
      }
    }
    return null;
  }

  // -- Readiness -------------------------------------------------------------

  /**
   * What this tenant has and what it still needs, one entry per step.
   *
   * Drives the console's setup checklist and the "needs setup" badge, and is
   * what `provision({ only: missing })` acts on.
   */
  async readiness(tenantId) {
    const id = Number(tenantId);
    const tenant = await this.db.tenant.findUnique({
      where:  { id },
      select: { id: true, name: true, slug: true, industry: true, status: true },
    });
    if (!tenant) throw new NotFoundError('Tenant');

    const count = (model, where = {}) => this.db[model].count({ where: { ...where, tenant_id: id } });
    const [roles, regions, branches, modules, objects, fields, workflows, dashboards, slaPolicies, templates, admins, users] =
      await Promise.all([
        count('role'), count('region'), count('branch'),
        count('uiModule'), count('uiObject'), count('uiField'),
        count('uiWorkflow'), count('uiDashboard'), count('slaPolicy'),
        count('emailTemplate'),
        count('employee', { role: { in: ['super_admin', 'admin'] } }),
        count('employee'),
      ]);

    const steps = [
      { key: 'roles',           title: 'Role ladder',         done: roles >= TENANT_ROLE_SEED.length, detail: `${roles} role(s)` },
      { key: 'org',             title: 'Office and region',   done: regions > 0 && branches > 0,      detail: `${regions} region(s), ${branches} office(s)` },
      { key: 'metadata',        title: 'CRM metadata',        done: modules > 0 && objects > 0 && fields > 0, detail: `${modules} module(s), ${objects} object(s), ${fields} field(s)` },
      { key: 'workflows',       title: 'Automation',          done: workflows > 0,                    detail: `${workflows} workflow(s)` },
      { key: 'dashboards',      title: 'Dashboards',          done: dashboards > 0,                   detail: `${dashboards} dashboard(s)` },
      { key: 'sla',             title: 'SLA policies',        done: slaPolicies > 0,                  detail: `${slaPolicies} policy set(s)` },
      { key: 'email_templates', title: 'Email templates',     done: templates > 0,                    detail: `${templates} template(s)` },
      { key: 'admin',           title: 'First administrator', done: admins > 0,                       detail: admins > 0 ? `${admins} admin(s)` : 'none yet' },
    ];

    const missing = steps.filter((s) => !s.done).map((s) => s.key);
    return {
      tenant_id: id,
      tenant:    { name: tenant.name, slug: tenant.slug, industry: tenant.industry, status: tenant.status },
      ready:     missing.length === 0,
      // "Usable" is the narrower question the console badges on: an admin can
      // sign in and see a CRM. Dashboards and SLA are nice-to-have.
      usable:    !missing.includes('roles') && !missing.includes('metadata') && !missing.includes('admin'),
      steps,
      missing,
      users,
      completed: steps.length - missing.length,
      total:     steps.length,
    };
  }

  // -- Provisioning ----------------------------------------------------------

  /**
   * Run the provisioning steps for `tenantId`.
   *
   * @param {number} tenantId
   * @param {object} [opts]
   * @param {string[]} [opts.only]   run just these step keys (default: all)
   * @param {number} [opts.templateTenantId]
   * @param {string} [opts.actorId]  platform admin, recorded on the result
   * @param {object} [opts.admin]    `{ employee_id, employee_name, email, password }`
   * @returns {Promise<{ tenant_id: number, ok: boolean, steps: Array, admin?: object }>}
   */
  async provision(tenantId, { only, templateTenantId, actorId = null, admin = null } = {}) {
    const id = Number(tenantId);
    const tenant = await this.db.tenant.findUnique({ where: { id } });
    if (!tenant) throw new NotFoundError('Tenant');

    const wanted = new Set(only?.length ? only : STEPS.map((s) => s.key));
    const unknown = [...wanted].filter((k) => !STEPS.some((s) => s.key === k));
    if (unknown.length) throw new ValidationError(`Unknown provisioning step(s): ${unknown.join(', ')}`);
    // The first admin is only created when the caller supplied one.
    if (!admin) wanted.delete('admin');

    const report = [];
    let createdAdmin = null;

    // Everything below runs with no tenant in AsyncLocalStorage: the clone has
    // to read the template tenant's rows and write the new tenant's, so it
    // addresses `tenant_id` explicitly instead of letting the scope extension
    // rewrite the queries. Steps that delegate to the catalogue installers
    // re-enter the new tenant's scope around those calls.
    await this.#unscoped(async () => {
      for (const step of STEPS) {
        if (!wanted.has(step.key)) continue;
        const started = Date.now();
        try {
          const result = await this.#runStep(step.key, { id, tenant, templateTenantId, actorId, admin });
          if (step.key === 'admin' && result?.admin) createdAdmin = result.admin;
          report.push({
            key:    step.key,
            title:  step.title,
            status: result?.skipped ? 'skipped' : 'done',
            detail: result?.detail ?? null,
            ms:     Date.now() - started,
          });
        } catch (err) {
          // One failing step must not hide the rest: the console shows which
          // step failed and "Finish setup" retries only what is still missing.
          this.log?.warn?.({ err, tenantId: id, step: step.key }, 'tenant provisioning step failed');
          report.push({ key: step.key, title: step.title, status: 'failed', detail: err.message, ms: Date.now() - started });
        }
      }
    });

    return {
      tenant_id: id,
      ok:        report.every((r) => r.status !== 'failed'),
      steps:     report,
      ...(createdAdmin ? { admin: createdAdmin } : {}),
    };
  }

  #runStep(key, ctx) {
    switch (key) {
      case 'roles':           return this.#ensureRoles(ctx.id);
      case 'org':             return this.#ensureOrgUnits(ctx.id, ctx.tenant);
      case 'metadata':        return this.#cloneMetadata(ctx.id, ctx.templateTenantId);
      case 'workflows':       return this.#installWorkflows(ctx.id);
      case 'dashboards':      return this.#installDashboards(ctx.id);
      case 'sla':             return this.#installSla(ctx.id);
      case 'email_templates': return this.#installEmailTemplates(ctx.id, ctx.tenant);
      case 'admin':           return this.#createFirstAdmin(ctx.id, ctx.admin, ctx.actorId);
      default:                throw new ValidationError(`Unknown provisioning step: ${key}`);
    }
  }

  /** Give the tenant its own copy of the built-in role ladder. */
  async #ensureRoles(tenantId) {
    const existing = await this.db.role.findMany({ where: { tenant_id: tenantId }, select: { name: true } });
    const have = new Set(existing.map((r) => r.name));
    const missing = TENANT_ROLE_SEED.filter((r) => !have.has(r.name));
    if (!missing.length) return { skipped: true, detail: `${have.size} role(s) already present` };

    await this.db.role.createMany({
      data: missing.map((r) => ({ ...r, is_active: true, tenant_id: tenantId })),
      skipDuplicates: true,
    });
    return { detail: `created ${missing.length} role(s): ${missing.map((r) => r.name).join(', ')}` };
  }

  /**
   * A default region and office, so the employee form has something to point at.
   *
   * `regions.region_code` and `branches.branch_code` are unique across the whole
   * deployment (not per tenant), so the codes carry the tenant id. Without that
   * the second tenant to be provisioned would collide on "HQ".
   */
  async #ensureOrgUnits(tenantId, tenant) {
    const [regions, branches] = await Promise.all([
      this.db.region.count({ where: { tenant_id: tenantId } }),
      this.db.branch.count({ where: { tenant_id: tenantId } }),
    ]);
    if (regions > 0 && branches > 0) {
      return { skipped: true, detail: `${regions} region(s), ${branches} office(s) already present` };
    }

    let region = await this.db.region.findFirst({ where: { tenant_id: tenantId }, select: { region_id: true } });
    if (!region) {
      region = await this.db.region.create({
        data:   { region_name: 'Head Office Region', region_code: `T${tenantId}-HQ`, tenant_id: tenantId },
        select: { region_id: true },
      });
    }
    if (branches === 0) {
      await this.db.branch.create({
        data: {
          branch_name: `${tenant.name} - Head Office`,
          branch_code: `T${tenantId}-HQ`,
          region_id:   region.region_id,
          tenant_id:   tenantId,
        },
      });
    }
    return { detail: 'created default region and head office' };
  }

  /**
   * Copy the template tenant's UI metadata, remapping every foreign key.
   *
   * Skipped when the tenant already has modules - this is the step that makes
   * re-running provisioning safe, since a partial clone is far worse than none.
   */
  async #cloneMetadata(tenantId, templateTenantId) {
    const already = await this.db.uiModule.count({ where: { tenant_id: tenantId } });
    if (already > 0) return { skipped: true, detail: `${already} module(s) already present` };

    const fromId = await this.resolveTemplateTenantId(templateTenantId, tenantId);
    if (!fromId) return { skipped: true, detail: 'no template tenant with metadata to copy from' };
    if (fromId === tenantId) return { skipped: true, detail: 'template tenant is this tenant' };

    /** clone-plan model -> Map(sourceId -> targetId) */
    const idMaps = new Map();
    const counts = [];

    for (const spec of CLONE_PLAN) {
      const copied = await this.#cloneTable(spec, fromId, tenantId, idMaps);
      if (copied) counts.push(`${copied} ${spec.label}`);
    }

    return { detail: `copied from tenant ${fromId}: ${counts.join(', ') || 'nothing'}` };
  }

  /** Copy one table according to its {@link CLONE_PLAN} entry. */
  async #cloneTable(spec, fromId, toId, idMaps) {
    const rows = await this.db[spec.model].findMany({ where: { tenant_id: fromId } });
    if (!rows.length) return 0;

    const payloads = [];
    /** target natural key -> source row id, so the read-back can pair them up */
    const keyToSourceId = new Map();

    for (const row of rows) {
      const payload = {};
      for (const [col, value] of Object.entries(row)) {
        if (DROPPED_COLUMNS.includes(col)) continue;
        payload[col] = value;
      }

      for (const col of spec.nullify ?? []) payload[col] = null;

      let usable = true;
      for (const [col, sourceModel] of Object.entries(spec.remap ?? {})) {
        if (row[col] == null) continue; // nullable FK - leave it null
        const mapped = idMaps.get(sourceModel)?.get(row[col]);
        if (mapped == null) { usable = false; break; } // parent was not copied
        payload[col] = mapped;
      }

      if (usable && spec.polymorphic) {
        const { idField, typeField, byType } = spec.polymorphic;
        const sourceModel = byType[row[typeField]];
        const mapped = sourceModel ? idMaps.get(sourceModel)?.get(row[idField]) : null;
        if (mapped == null) usable = false;
        else payload[idField] = mapped;
      }
      if (!usable) continue;

      payload.tenant_id = toId;
      payloads.push(payload);
      if (spec.key) keyToSourceId.set(keyOf(payload, spec.key), row.id);
    }

    if (!payloads.length) return 0;
    for (let i = 0; i < payloads.length; i += CHUNK) {
      await this.db[spec.model].createMany({ data: payloads.slice(i, i + CHUNK), skipDuplicates: true });
    }

    // Bulk inserts do not return ids on MySQL, so rows that later steps point
    // at are read back and paired on their natural key.
    if (spec.key) {
      const created = await this.db[spec.model].findMany({
        where:  { tenant_id: toId },
        select: Object.fromEntries([['id', true], ...spec.key.map((k) => [k, true])]),
      });
      const map = new Map();
      for (const row of created) {
        const sourceId = keyToSourceId.get(keyOf(row, spec.key));
        if (sourceId != null) map.set(sourceId, row.id);
      }
      idMaps.set(spec.model, map);
    }

    return payloads.length;
  }

  /** Install the code-owned workflow catalogue into this tenant. */
  async #installWorkflows(tenantId) {
    const already = await this.db.uiWorkflow.count({ where: { tenant_id: tenantId } });
    if (already > 0) return { skipped: true, detail: `${already} workflow(s) already present` };
    const objects = await this.db.uiObject.count({ where: { tenant_id: tenantId } });
    if (objects === 0) return { skipped: true, detail: 'no objects yet - run the metadata step first' };

    const { applyCrmWorkflows } = require('../../../scripts/seed-crm-workflows');
    const summary = await tenantContext.run({ tenantId }, () =>
      applyCrmWorkflows(this.db, { purge: false, log: () => {} }),
    );
    return { detail: `installed ${summary.created} workflow(s), ${summary.fieldsCreated} supporting field(s)` };
  }

  /** Install the code-owned dashboard catalogue into this tenant. */
  async #installDashboards(tenantId) {
    const already = await this.db.uiDashboard.count({ where: { tenant_id: tenantId } });
    if (already > 0) return { skipped: true, detail: `${already} dashboard(s) already present` };

    const { applyDashboards } = require('../../../scripts/seed-dashboards');
    const admin = await this.db.employee.findFirst({
      where:  { tenant_id: tenantId, role: { in: ['super_admin', 'admin'] } },
      select: { employee_id: true },
    });
    const summary = await tenantContext.run({ tenantId }, () =>
      applyDashboards(this.db, { createdBy: admin?.employee_id ?? null, log: () => {} }),
    );
    return { detail: `installed ${summary.created} dashboard(s), ${summary.widgets} widget(s), ${summary.charts} library chart(s)` };
  }

  /** Starter SLA policies (shared with `POST /api/sla/seed-defaults`). */
  async #installSla(tenantId) {
    const { seedSlaDefaults } = require('../../routes/sla/index');
    const result = await tenantContext.run({ tenantId }, () => seedSlaDefaults(this.db));
    if (!result.created) return { skipped: true, detail: result.message ?? 'already configured' };
    return { detail: `installed ${result.policies} SLA policy set(s)` };
  }

  /** Industry email templates, if the tenant declares an industry. */
  async #installEmailTemplates(tenantId, tenant) {
    if (!tenant.industry) return { skipped: true, detail: 'tenant has no industry set' };
    const already = await this.db.emailTemplate.count({ where: { tenant_id: tenantId } });
    if (already > 0) return { skipped: true, detail: `${already} template(s) already present` };

    const admin = await this.db.employee.findFirst({
      where:  { tenant_id: tenantId, role: { in: ['super_admin', 'admin'] } },
      select: { employee_id: true },
    });
    const svc = new EmailTemplateService(this.db);
    const created = await tenantContext.run({ tenantId }, () =>
      svc.createIndustryTemplates(tenant.industry, admin?.employee_id ?? null),
    );
    return { detail: `installed ${created.length} ${tenant.industry} template(s)` };
  }

  /**
   * Create the tenant's first administrator.
   *
   * Deliberately last: the dashboard and email-template steps stamp
   * `created_by` with an admin when one exists, and an admin created before the
   * role ladder would sign in with an unresolvable role.
   */
  async #createFirstAdmin(tenantId, admin, actorId) {
    const employeeId = String(admin?.employee_id ?? '').trim().toUpperCase();
    const name       = String(admin?.employee_name ?? '').trim();
    const email      = admin?.email ? String(admin.email).trim() : null;
    const password   = admin?.password;

    if (!EMPLOYEE_ID_RE.test(employeeId)) {
      throw new ValidationError('employee_id must be 3-20 characters of A-Z, 0-9 or underscore');
    }
    if (!name) throw new ValidationError('employee_name is required');
    if (!password || String(password).length < 8) throw new ValidationError('password must be at least 8 characters');

    const existingAdmin = await this.db.employee.findFirst({
      where:  { tenant_id: tenantId, role: { in: ['super_admin', 'admin'] } },
      select: { employee_id: true },
    });
    if (existingAdmin) return { skipped: true, detail: `tenant already has an admin (${existingAdmin.employee_id})` };

    // Platform-wide unique columns - checked up front so the caller gets a
    // useful 409 rather than a bare constraint violation.
    const clash = await this.db.employee.findFirst({
      where:  { OR: [{ employee_id: employeeId }, ...(email ? [{ email }] : [])] },
      select: { employee_id: true, email: true },
    });
    if (clash) {
      throw new ConflictError(clash.employee_id === employeeId
        ? `Employee ID "${employeeId}" is already in use. IDs are unique across the platform.`
        : `Email "${email}" is already registered to another account.`);
    }

    const hashed = await bcrypt.hash(password, 12);
    const branch = await this.db.branch.findFirst({
      where:  { tenant_id: tenantId },
      select: { branch_id: true, region_id: true },
    });

    const employee = await this.db.$transaction(async (tx) => {
      const emp = await tx.employee.create({
        data: {
          employee_id:   employeeId,
          employee_name: name,
          email,
          role:          'super_admin',
          password:      hashed,
          branch_id:     branch?.branch_id ?? null,
          region_id:     branch?.region_id ?? null,
          tenant_id:     tenantId,
        },
      });
      // Self-row in the hierarchy closure table - every employee needs one or
      // manager-scoped queries return nothing for them.
      await tx.employeeHierarchy.create({
        data: { ancestor_id: emp.employee_id, descendant_id: emp.employee_id, depth: 0, tenant_id: tenantId },
      });
      return emp;
    });

    const { password: _pw, ...safe } = employee;
    return { detail: `created ${employeeId} as super_admin`, admin: { ...safe, provisioned_by: actorId } };
  }

  // -- internals -------------------------------------------------------------

  /**
   * Run `fn` with no tenant in AsyncLocalStorage.
   *
   * Provisioning is inherently cross-tenant: it reads the template tenant and
   * writes another, and probes columns that are unique platform-wide. Every
   * query inside addresses `tenant_id` explicitly.
   */
  #unscoped(fn) {
    return tenantContext.run({ tenantId: null }, fn);
  }
}

/** Stable string for a row's natural key, used to pair source and target rows. */
function keyOf(row, columns) {
  return columns.map((c) => String(row[c] ?? '')).join(' ');
}

module.exports = TenantProvisioningService;
module.exports.CLONE_PLAN = CLONE_PLAN;
module.exports.STEPS = STEPS;
module.exports.TENANT_ROLE_SEED = TENANT_ROLE_SEED;
module.exports.EMPLOYEE_ID_RE = EMPLOYEE_ID_RE;
module.exports.SLUG_RE = SLUG_RE;
module.exports.keyOf = keyOf;
