'use strict';

const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const RecordService = require('./record.service');
const { typedValue } = require('./record-compute');
const { compile } = require('./formula');

/**
 * Vertical installer — applies a "vertical pack" (an industry configuration
 * expressed purely as Builder metadata) to one tenant.
 *
 * A pack is data: business units, barrier zones, roles, modules, objects,
 * fields, forms, validations, dependencies, pipelines, wizards, workflows,
 * assignment rules, SLA policies, document categories/checklists/templates,
 * email templates, dashboards, public forms, permissions, integrations and
 * master/demo records. The installer only knows how to write each kind of
 * Builder row — nothing in it is specific to any industry — so everything it
 * installs is editable afterwards in the Builder exactly as if an admin had
 * clicked it together.
 *
 * Idempotent and incremental: every kind is loaded once, rows are matched by
 * their natural key (module name, object name, field name, stage name,
 * workflow name, template name, record key …) and only rows whose content
 * differs are written. Re-running an unchanged pack is therefore a handful of
 * reads, which matters on a remote database where every round trip costs
 * ~200 ms. Rows the pack does not mention are never touched, so tenant
 * customisations survive a re-install.
 *
 * Records are created through RecordService (formulas, stamping, roll-ups)
 * with bounded concurrency; a record whose values already match is skipped.
 *
 * Must run inside `tenantContext.run({ tenantId }, …)` with a tenant-scoped
 * client, so every read and write is confined to the target tenant.
 */

const DATA_TYPE = {
  number: 'number', integer: 'number', decimal: 'number', currency: 'number', percent: 'number',
  percentage: 'number', rating: 'number', lookup: 'number',
  date: 'date', datetime: 'date', checkbox: 'boolean', multi_select: 'array',
};

const SIZES = { kpi: { w: 3, h: 2 }, third: { w: 4, h: 4 }, half: { w: 6, h: 4 }, full: { w: 12, h: 4 } };
const RECORD_CONCURRENCY = 8;

/** Stable JSON for comparisons (key order independent). */
function canon(v) {
  if (Array.isArray(v)) return `[${v.map(canon).join(',')}]`;
  if (v && typeof v === 'object' && !(v instanceof Date)) {
    return `{${Object.keys(v).filter((k) => v[k] !== undefined).sort().map((k) => `${JSON.stringify(k)}:${canon(v[k])}`).join(',')}}`;
  }
  if (v instanceof Date) return JSON.stringify(v.toISOString());
  return JSON.stringify(v ?? null);
}
const same = (a, b) => canon(a) === canon(b);

/** True when every key in `want` equals the row's value (Decimal/Date tolerant). */
function matches(row, want) {
  for (const [k, v] of Object.entries(want)) {
    const cur = row[k];
    if (v !== null && typeof v === 'object') { if (!same(cur, v)) return false; continue; }
    if (cur instanceof Date || (cur && typeof cur === 'object' && typeof cur.toNumber === 'function')) {
      if (String(cur instanceof Date ? cur.toISOString() : cur.toNumber()) !== String(v)) return false;
      continue;
    }
    if ((cur ?? null) !== (v ?? null)) return false;
  }
  return true;
}

/** Run `fn` over `items` with at most `n` in flight; rejects on the first failure. */
async function pool(items, n, fn) {
  let i = 0;
  const workers = Array.from({ length: Math.min(n, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++;
      await fn(items[idx], idx);
    }
  });
  await Promise.all(workers);
}

/** How a value is stored in record_field_values.str_value, for change detection. */
function storedString(v) {
  // Mirrors toTypedValue in crm-storage-map: str_value is String(value).
  return v === null || v === undefined ? null : String(v);
}

class VerticalInstaller {
  /**
   * @param {import('@prisma/client').PrismaClient} prisma tenant-scoped client
   * @param {{ tenantId: number, log?: Function, demo?: boolean, password?: string }} opts
   */
  constructor(prisma, { tenantId, log = () => {}, demo = false, password = null } = {}) {
    this.db = prisma;
    this.tenantId = tenantId;
    this.log = log;
    this.demo = demo;
    this.password = password;
    // Records are written after all metadata, so metadata reads made by the
    // record service (field lists, object config, stages) can be memoised for
    // the run — each one is a remote round trip, several per record.
    this.records = new RecordService(memoizeMetadataReads(prisma));
    this.ids = { module: {}, object: {}, field: {}, form: {}, stage: {} };
    this.summary = {};
    this.unchanged = {};
    // record cache: objectName → { byId: Map<id, {values, stage}>, loaded }
    this.recCache = {};
  }

  #count(kind, n = 1) {
    this.summary[kind] = (this.summary[kind] ?? 0) + n;
  }

  #skip(kind, n = 1) {
    this.unchanged[kind] = (this.unchanged[kind] ?? 0) + n;
  }

  async install(pack) {
    const step = async (label, fn) => {
      const t = Date.now();
      const out = await fn();
      this.log(`   · ${label} (${((Date.now() - t) / 1000).toFixed(1)}s)`);
      return out;
    };
    await step('business units', () => this.#businessUnits(pack.businessUnits ?? []));
    await step('barrier zones', () => this.#zones(pack.barrierZones ?? []));
    await step('roles', () => this.#roles(pack.roles ?? []));
    await step('operational permissions', () => this.#operationalPermissions(pack.operationalPermissions ?? []));
    const credentials = await step('staff', () => this.#staff(pack.staff ?? []));
    await step('modules, objects, fields, forms, pipelines', () => this.#modules(pack.modules ?? []));
    await step('field dependencies', () => this.#dependencies(pack.modules ?? []));
    await step('wizards', () => this.#wizards(pack.wizards ?? []));
    await step('document categories', () => this.#documentCategories(pack.documentCategories ?? []));
    await step('document checklists', () => this.#documentChecklists(pack.documentChecklists ?? []));
    await step('document templates', () => this.#documentTemplates(pack.documentTemplates ?? []));
    await step('email templates', () => this.#emailTemplates(pack.emailTemplates ?? []));
    await step('integrations', () => this.#integrations(pack.integrations ?? []));
    await step('workflows', () => this.#workflows(pack.workflows ?? []));
    await step('assignment rules', () => this.#assignmentRules(pack.assignmentRules ?? []));
    await step('SLA', () => this.#sla(pack.businessHours, pack.slaPolicies ?? []));
    await step('object permissions', () => this.#permissions(pack.permissions ?? []));
    await step('dashboards', () => this.#dashboards(pack.dashboards ?? []));
    const publicForms = await step('public forms', () => this.#publicForms(pack.publicForms ?? []));
    // Records: parents are refreshed once at the end, in dependency order,
    // rather than once per child (and racing between concurrent children).
    this.records.deferParentRefresh();
    this.touched = new Set();
    await step('master data', () => this.#recordSets(pack.masterData ?? []));
    if (this.demo) await step('demo records', () => this.#recordSets(pack.demo ?? []));
    await step('recompute roll-ups', () => this.#recomputePass(pack.modules ?? []));
    return { summary: this.summary, unchanged: this.unchanged, credentials, publicForms };
  }

  // ── Generic keyed upsert over a preloaded list ───────────────────────────

  /**
   * Upsert `items` into `model`. `existing` is the preloaded row list, `keyOf`
   * gives the natural key of a row or an item, `dataOf` the writable columns.
   * Returns Map<key, row>.
   */
  async #sync(model, kind, existing, items, keyOf, dataOf, createExtra = () => ({})) {
    const byKey = new Map(existing.map((r) => [keyOf(r), r]));
    const out = new Map();
    for (const item of items) {
      const key = keyOf(item);
      const data = dataOf(item);
      const cur = byKey.get(key);
      let row;
      if (!cur) row = await this.db[model].create({ data: { ...createExtra(item), ...data } });
      else if (!matches(cur, data)) row = await this.db[model].update({ where: { id: cur.id }, data });
      else { row = cur; this.#skip(kind); out.set(key, row); continue; }
      this.#count(kind);
      out.set(key, row);
    }
    return out;
  }

  // ── Organisation & access ────────────────────────────────────────────────

  async #businessUnits(units) {
    await this.#sync('businessUnit', 'business_units', await this.db.businessUnit.findMany(), units,
      (u) => u.code,
      (u) => ({ name: u.name, legal_name: u.legal_name ?? null, regulator: u.regulator ?? null, licence: u.licence ?? null, base_currency: u.base_currency ?? null, is_active: true, config: u.config ?? null }),
      (u) => ({ code: u.code }));
  }

  async #zones(zones) {
    await this.#sync('barrierZone', 'barrier_zones', await this.db.barrierZone.findMany(), zones,
      (z) => z.code,
      (z) => ({ name: z.name, description: z.description ?? null, is_active: true }),
      (z) => ({ code: z.code }));
  }

  async #roles(roles) {
    for (const r of roles) {
      // Custom roles only: the built-in ladder is frozen and owned by the platform.
      if (Number(r.level) <= 3) throw new Error(`Role ${r.name}: a custom role must sit at level 4 or below (got ${r.level})`);
    }
    const existing = await this.db.role.findMany({ where: { tenant_id: this.tenantId } });
    await this.#sync('role', 'roles', existing, roles,
      (r) => r.name,
      (r) => ({ label: r.label, description: r.description ?? null, level: Number(r.level), is_active: true }),
      (r) => ({ name: r.name }));
  }

  async #operationalPermissions(perms) {
    const existing = await this.db.operationalPermission.findMany();
    await this.#sync('operationalPermission', 'operational_permissions', existing, perms,
      (p) => `${p.entity_type}|${p.role_name}`,
      (p) => ({
        view_scope: p.view_scope ?? 'own', create_scope: p.create_scope ?? 'own', edit_scope: p.edit_scope ?? 'own',
        delete_scope: p.delete_scope ?? 'none', assign_scope: p.assign_scope ?? 'none',
      }),
      (p) => ({ entity_type: p.entity_type, role_name: p.role_name }));
  }

  /**
   * Staff accounts. Existing employees are never modified (and their password
   * never reset); new ones get the installer password, or a random one that is
   * returned once so it can be handed over and changed.
   */
  async #staff(staff) {
    const issued = [];
    if (!staff.length) return issued;
    const branch = await this.db.branch.findFirst({ select: { branch_id: true, region_id: true } });
    const ids = staff.map((s) => s.employee_id);
    const [emps, units, zones, ebu, members, links] = await Promise.all([
      this.db.employee.findMany({ where: { employee_id: { in: ids } } }),
      this.db.businessUnit.findMany({ select: { id: true, code: true } }),
      this.db.barrierZone.findMany({ select: { id: true, code: true } }),
      this.db.employeeBusinessUnit.findMany({ where: { employee_id: { in: ids } } }),
      this.db.barrierMember.findMany({ where: { employee_id: { in: ids } } }),
      this.db.employeeHierarchy.findMany({ where: { descendant_id: { in: ids } } }),
    ]);
    const empById = new Map(emps.map((e) => [e.employee_id, e]));
    const unitId = Object.fromEntries(units.map((u) => [u.code, u.id]));
    const zoneId = Object.fromEntries(zones.map((z) => [z.code, z.id]));
    const hasUnit = new Set(ebu.map((r) => `${r.employee_id}|${r.business_unit_id}`));
    const hasZone = new Set(members.map((r) => `${r.employee_id}|${r.zone_id}`));
    const hasLink = new Set(links.map((r) => `${r.ancestor_id}|${r.descendant_id}`));

    for (const s of staff) {
      let emp = empById.get(s.employee_id);
      if (emp && emp.tenant_id && emp.tenant_id !== this.tenantId) {
        throw new Error(`Employee ${s.employee_id} already exists in another tenant — employee ids are platform-unique`);
      }
      if (!emp) {
        const password = this.password || `Sw-${crypto.randomBytes(6).toString('base64url')}`;
        emp = await this.db.employee.create({
          data: {
            employee_id: s.employee_id, employee_name: s.employee_name, role: s.role, email: s.email ?? null,
            password: await bcrypt.hash(password, 12),
            branch_id: branch?.branch_id ?? null, region_id: branch?.region_id ?? null,
          },
        });
        await this.db.employeeHierarchy.create({ data: { ancestor_id: emp.employee_id, descendant_id: emp.employee_id, depth: 0 } }).catch(() => {});
        issued.push({ employee_id: s.employee_id, role: s.role, password });
        this.#count('staff_created');
      } else this.#skip('staff');
      for (const [i, code] of (s.business_units ?? []).entries()) {
        const bu = unitId[code];
        if (!bu || hasUnit.has(`${emp.employee_id}|${bu}`)) continue;
        await this.db.employeeBusinessUnit.create({ data: { employee_id: emp.employee_id, business_unit_id: bu, is_primary: i === 0 } });
      }
      for (const code of s.zones ?? []) {
        const z = zoneId[code];
        if (!z || hasZone.has(`${emp.employee_id}|${z}`)) continue;
        await this.db.barrierMember.create({ data: { zone_id: z, employee_id: emp.employee_id, source: 'member' } });
      }
    }
    // Reporting lines: `manager` names the line manager's employee id.
    for (const s of staff) {
      if (!s.manager || hasLink.has(`${s.manager}|${s.employee_id}`)) continue;
      await this.db.employeeHierarchy.create({ data: { ancestor_id: s.manager, descendant_id: s.employee_id, depth: 1 } }).catch(() => {});
    }
    return issued;
  }

  // ── Modules, objects, fields, forms, pipelines ───────────────────────────

  async #modules(mods) {
    const [modules, objects, fields, validations, forms, pipelines] = await Promise.all([
      this.db.uiModule.findMany(),
      this.db.uiObject.findMany(),
      this.db.uiField.findMany(),
      this.db.uiValidation.findMany({ orderBy: { order_index: 'asc' } }),
      this.db.uiForm.findMany({ include: { field_layouts: { orderBy: { order_index: 'asc' } } } }),
      this.db.uiPipeline.findMany({ include: { stages: true } }),
    ]);
    this.pre = {
      fieldsByObject: groupBy(fields, (f) => f.object_id),
      validationsByField: groupBy(validations, (v) => v.field_id),
      formsByObject: groupBy(forms, (f) => f.object_id),
      pipelinesByObject: groupBy(pipelines, (p) => p.object_id),
    };

    const modRows = await this.#sync('uiModule', 'modules', modules, mods,
      (m) => m.name,
      (m) => ({ label: m.label, description: m.description ?? null, icon: m.icon ?? null, color: m.color ?? null, category: m.category ?? 'crm', order_index: m.order_index ?? 0, is_active: true }),
      (m) => ({ name: m.name }));
    const objByName = new Map(objects.map((o) => [o.name, o]));
    for (const mod of mods) {
      const moduleId = modRows.get(mod.name).id;
      this.ids.module[mod.name] = moduleId;
      for (const [i, obj] of (mod.objects ?? []).entries()) await this.#object(moduleId, obj, i + 1, objByName.get(obj.name));
    }
  }

  async #object(moduleId, obj, order, cur) {
    const data = {
      module_id: moduleId, label: obj.label, plural_label: obj.plural_label ?? null, description: obj.description ?? null,
      icon: obj.icon ?? null, order_index: order, is_active: true, config: obj.config ?? null,
    };
    let row = cur;
    if (!row) { row = await this.db.uiObject.create({ data: { name: obj.name, ...data } }); this.#count('objects'); }
    else if (!matches(row, data)) { row = await this.db.uiObject.update({ where: { id: row.id }, data }); this.#count('objects'); }
    else this.#skip('objects');
    this.ids.object[obj.name] = row.id;
    this.ids.field[obj.name] = {};

    const existingFields = new Map((this.pre.fieldsByObject.get(row.id) ?? []).map((f) => [f.name, f]));
    for (const [i, f] of (obj.fields ?? []).entries()) await this.#field(row.id, obj.name, f, i + 1, existingFields.get(f.name));
    const existingForms = new Map((this.pre.formsByObject.get(row.id) ?? []).map((f) => [f.name, f]));
    for (const form of obj.forms ?? []) await this.#form(row.id, obj.name, form, existingForms.get(form.name));
    if (obj.pipeline) {
      const pipe = (this.pre.pipelinesByObject.get(row.id) ?? []).find((p) => p.name === obj.pipeline.name);
      await this.#pipeline(row.id, obj.name, obj.pipeline, pipe);
    }
  }

  async #field(objectId, objectName, f, order, cur) {
    const data = {
      label: f.label, field_type: f.type, data_type: f.data_type ?? DATA_TYPE[f.type] ?? 'string',
      is_required: Boolean(f.required), is_unique: Boolean(f.unique), placeholder: f.placeholder ?? null,
      help_text: f.help ?? null, default_value: f.default ?? null, options: f.options ?? null,
      config: f.config ?? {}, order_index: f.order ?? order, is_active: true,
    };
    let row = cur;
    if (!row) { row = await this.db.uiField.create({ data: { object_id: objectId, name: f.name, ...data } }); this.#count('fields'); }
    else if (!matches(row, data)) { row = await this.db.uiField.update({ where: { id: row.id }, data }); this.#count('fields'); }
    else this.#skip('fields');
    this.ids.field[objectName][f.name] = row.id;

    // Validations: the pack owns this field's rule list.
    const want = (f.validations ?? []).map((v, i) => ({ validation_type: v.type, value: v.value != null ? String(v.value) : null, error_message: v.message ?? '', order_index: i + 1 }));
    const have = (this.pre.validationsByField.get(row.id) ?? []).map((v) => ({ validation_type: v.validation_type, value: v.value ?? null, error_message: v.error_message ?? '', order_index: v.order_index }));
    if (same(want, have)) return;
    await this.db.uiValidation.deleteMany({ where: { field_id: row.id } });
    if (want.length) {
      await this.db.uiValidation.createMany({ data: want.map((v) => ({ field_id: row.id, ...v })) });
      this.#count('validations', want.length);
    }
  }

  async #form(objectId, objectName, form, cur) {
    const data = { label: form.label, description: form.description ?? null, form_type: form.form_type ?? 'create', columns: form.columns ?? 2, is_active: true };
    let row = cur;
    if (!row) { row = await this.db.uiForm.create({ data: { object_id: objectId, name: form.name, ...data } }); this.#count('forms'); }
    else if (!matches(row, data)) { row = await this.db.uiForm.update({ where: { id: row.id }, data }); this.#count('forms'); }
    else this.#skip('forms');
    this.ids.form[form.name] = row.id;

    const cols = form.columns ?? 2;
    let r = 0;
    let c = 0;
    const layouts = [];
    for (const [i, entry] of (form.fields ?? []).entries()) {
      const name = typeof entry === 'string' ? entry : entry.field;
      const span = Math.min(typeof entry === 'string' ? 1 : (entry.span ?? 1), cols);
      const fieldId = this.ids.field[objectName]?.[name];
      if (!fieldId) throw new Error(`Form ${form.name}: unknown field ${objectName}.${name}`);
      if (c + span > cols) { r += 1; c = 0; }
      layouts.push({ field_id: fieldId, row: r, col: c, col_span: span, order_index: i + 1, is_visible: true });
      c += span;
      if (c >= cols) { r += 1; c = 0; }
    }
    const have = (cur?.field_layouts ?? []).map((l) => ({ field_id: l.field_id, row: l.row, col: l.col, col_span: l.col_span, order_index: l.order_index, is_visible: l.is_visible }));
    if (cur && same(have, layouts)) return;
    await this.db.uiFormFieldLayout.deleteMany({ where: { form_id: row.id } });
    if (layouts.length) await this.db.uiFormFieldLayout.createMany({ data: layouts.map((l) => ({ form_id: row.id, ...l })) });
  }

  async #pipeline(objectId, objectName, p, cur) {
    const data = { label: p.label, description: p.description ?? null, config: p.config ?? null, is_active: true };
    let row = cur;
    if (!row) { row = await this.db.uiPipeline.create({ data: { object_id: objectId, name: p.name, ...data } }); this.#count('pipelines'); }
    else if (!matches(row, data)) { row = await this.db.uiPipeline.update({ where: { id: row.id }, data }); this.#count('pipelines'); }
    const stages = await this.#sync('uiPipelineStage', 'stages', cur?.stages ?? [], p.stages.map((st, i) => ({ ...st, _order: i + 1 })),
      (s) => s.name,
      (s) => ({ label: s.label, color: s.color ?? '#6366f1', order_index: s._order, config: s.config ?? null }),
      (s) => ({ pipeline_id: row.id, name: s.name }));
    this.ids.stage[objectName] = Object.fromEntries([...stages].map(([k, v]) => [k, v.id]));
  }

  async #dependencies(mods) {
    const objs = mods.flatMap((m) => m.objects ?? []);
    const allTargets = objs.flatMap((o) => (o.dependencies ?? []).map((d) => this.ids.field[o.name]?.[d.target]).filter(Boolean));
    const existing = allTargets.length
      ? await this.db.uiFieldDependency.findMany({ where: { target_field_id: { in: [...new Set(allTargets)] } } })
      : [];
    const byTarget = groupBy(existing, (d) => d.target_field_id);
    for (const obj of objs) {
      const fids = this.ids.field[obj.name] ?? {};
      const deps = obj.dependencies ?? [];
      const want = deps.map((d) => {
        if (!fids[d.source] || !fids[d.target]) throw new Error(`Dependency ${obj.name}: ${d.source} → ${d.target} names an unknown field`);
        return {
          source_field_id: fids[d.source], target_field_id: fids[d.target],
          condition_type: d.condition ?? 'equals', condition_value: d.value != null ? String(d.value) : null,
          action_type: d.action ?? 'show', action_value: d.action_value ?? null,
        };
      });
      const targets = [...new Set(want.map((w) => w.target_field_id))];
      const have = targets.flatMap((t) => (byTarget.get(t) ?? []).map((d) => ({
        source_field_id: d.source_field_id, target_field_id: d.target_field_id, condition_type: d.condition_type,
        condition_value: d.condition_value ?? null, action_type: d.action_type, action_value: d.action_value ?? null,
      })));
      const sortKey = (x) => canon(x);
      if (same(want.map(sortKey).sort(), have.map(sortKey).sort())) { this.#skip('dependencies', want.length); continue; }
      if (targets.length) await this.db.uiFieldDependency.deleteMany({ where: { target_field_id: { in: targets } } });
      if (want.length) await this.db.uiFieldDependency.createMany({ data: want });
      this.#count('dependencies', want.length);
    }
  }

  // ── Wizards ───────────────────────────────────────────────────────────────

  async #wizards(wizards) {
    if (!wizards.length) return;
    const [existing, steps] = await Promise.all([
      this.db.uiWizard.findMany(),
      this.db.uiWizardStep.findMany({ orderBy: { order_index: 'asc' } }),
    ]);
    const byName = new Map(existing.map((w) => [w.name, w]));
    const stepsByWizard = groupBy(steps, (s) => s.wizard_id);
    const forms = groupBy(await this.db.uiForm.findMany({ where: { form_type: 'wizard_step' }, include: { field_layouts: { orderBy: { order_index: 'asc' } } } }), (f) => f.object_id);
    for (const w of wizards) {
      const objectId = this.ids.object[w.object];
      if (!objectId) throw new Error(`Wizard ${w.name}: unknown object ${w.object}`);
      const data = { object_id: objectId, label: w.label, description: w.description ?? null, submit_label: w.submit_label ?? null, success_message: w.success_message ?? null, is_active: true };
      let row = byName.get(w.name);
      if (!row) row = await this.db.uiWizard.create({ data: { name: w.name, ...data } });
      else if (!matches(row, data)) row = await this.db.uiWizard.update({ where: { id: row.id }, data });
      const objForms = new Map((forms.get(objectId) ?? []).map((f) => [f.name, f]));
      const wantSteps = [];
      for (const [i, st] of w.steps.entries()) {
        const formName = `${w.name}__${st.name}`;
        await this.#form(objectId, w.object, { name: formName, label: st.label, form_type: 'wizard_step', columns: st.columns ?? 2, fields: st.fields }, objForms.get(formName));
        wantSteps.push({ form_id: this.ids.form[formName], name: st.name, label: st.label, description: st.description ?? null, order_index: i + 1 });
      }
      const haveSteps = (stepsByWizard.get(row.id) ?? []).map((s) => ({ form_id: s.form_id, name: s.name, label: s.label, description: s.description ?? null, order_index: s.order_index }));
      if (!same(wantSteps, haveSteps)) {
        await this.db.uiWizardStep.deleteMany({ where: { wizard_id: row.id } });
        await this.db.uiWizardStep.createMany({ data: wantSteps.map((s) => ({ wizard_id: row.id, ...s })) });
        this.#count('wizards');
      } else this.#skip('wizards');
    }
  }

  // ── Documents & communications ───────────────────────────────────────────

  async #documentCategories(cats) {
    await this.#sync('uiDocumentCategory', 'document_categories', await this.db.uiDocumentCategory.findMany(), cats.map((c, i) => ({ ...c, _order: i + 1 })),
      (c) => c.code,
      (c) => ({
        label: c.label, description: c.description ?? null, allowed_mime: c.allowed_mime ?? null, max_file_mb: c.max_file_mb ?? null,
        retention_days: c.retention_days ?? null, review_required: Boolean(c.review_required), is_required: Boolean(c.is_required),
        color: c.color ?? 'blue', order_index: c._order, is_active: true, config: c.config ?? null,
      }),
      (c) => ({ code: c.code }));
  }

  async #documentChecklists(lists) {
    await this.#sync('uiDocumentChecklist', 'document_checklists', await this.db.uiDocumentChecklist.findMany(), lists.map((l, i) => ({ ...l, _order: i + 1 })),
      (l) => `${l.entity_type}|${l.label}`,
      (l) => ({ description: l.description ?? null, items: l.items, is_active: true, order_index: l._order }),
      (l) => ({ entity_type: l.entity_type, label: l.label }));
  }

  async #documentTemplates(tpls) {
    await this.#sync('documentTemplate', 'document_templates', await this.db.documentTemplate.findMany(), tpls,
      (t) => t.name,
      (t) => ({ description: t.description ?? null, entity_type: t.entity_type ?? null, body: t.body, format: t.format ?? 'html', output_category: t.output_category ?? null, is_active: true }),
      (t) => ({ name: t.name }));
  }

  async #emailTemplates(tpls) {
    await this.#sync('emailTemplate', 'email_templates', await this.db.emailTemplate.findMany(), tpls,
      (t) => t.name,
      (t) => ({
        object_id: t.object ? (this.ids.object[t.object] ?? null) : null, category: t.category ?? null, subject: t.subject,
        body_html: t.body_html ?? null, body_text: t.body_text ?? null, language: t.language ?? 'en', is_active: true,
      }),
      (t) => ({ name: t.name }));
  }

  /** Registered integrations (connectors) the pack's workflows call by name. */
  async #integrations(defs) {
    if (!defs.length) return;
    await this.#sync('integration', 'integrations', await this.db.integration.findMany(), defs,
      (d) => d.name,
      (d) => ({ label: d.label, type: d.type, config: d.config ?? {}, is_active: d.is_active ?? true }),
      (d) => ({ name: d.name }));
  }

  // ── Automation ────────────────────────────────────────────────────────────

  async #workflows(defs) {
    if (!defs.length) return;
    const existing = await this.db.uiWorkflow.findMany({ where: { name: { in: defs.map((d) => d.name) } }, include: { steps: { orderBy: { order_index: 'asc' } } } });
    const byName = groupBy(existing, (w) => w.name);
    for (const def of defs) {
      const objectId = this.ids.object[def.object];
      if (!objectId) throw new Error(`Workflow ${def.name}: unknown object ${def.object}`);
      const steps = def.steps.map((step, i) => {
        let config = { ...(step.config ?? {}) };
        if (step.step_type === 'create_record' || step.step_type === 'update_related') {
          if (config.object) {
            const target = this.ids.object[config.object];
            if (!target) throw new Error(`Workflow ${def.name}: ${step.step_type} target ${config.object} unknown`);
            const { object: _o, ...rest } = config;
            config = { ...rest, object_id: target };
          }
        }
        return { key: step.key, name: step.name, step_type: step.step_type, order_index: i + 1, config, on_true: step.on_true ?? null, on_false: step.on_false ?? null };
      });
      for (const s of steps) {
        for (const link of [s.on_true, s.on_false]) {
          if (link && !steps.some((x) => x.key === link)) throw new Error(`Workflow ${def.name}: step ${s.key} links to unknown ${link}`);
        }
      }
      const head = { object_id: objectId, label: def.label, description: def.description ?? null, trigger_type: def.trigger_type, trigger_config: def.trigger_config ?? {}, is_active: def.is_active ?? true };
      const old = byName.get(def.name) ?? [];
      if (old.length === 1 && matches(old[0], head) && same(signature(old[0].steps), signature(steps))) { this.#skip('workflows'); continue; }
      if (old.length) {
        const ids = old.map((o) => o.id);
        await this.db.workflowPendingStep.deleteMany({ where: { workflow_id: { in: ids } } }).catch(() => {});
        await this.db.uiWorkflowStep.deleteMany({ where: { workflow_id: { in: ids } } });
        await this.db.uiWorkflow.deleteMany({ where: { id: { in: ids } } });
      }
      const wf = await this.db.uiWorkflow.create({ data: { name: def.name, ...head } });
      const idByKey = {};
      for (const s of steps) {
        const row = await this.db.uiWorkflowStep.create({ data: { workflow_id: wf.id, name: s.name, step_type: s.step_type, order_index: s.order_index, config: s.config } });
        idByKey[s.key] = row.id;
      }
      for (const s of steps) {
        const data = {};
        if (s.on_true) data.on_true_id = idByKey[s.on_true];
        if (s.on_false) data.on_false_id = idByKey[s.on_false];
        if (Object.keys(data).length) await this.db.uiWorkflowStep.update({ where: { id: idByKey[s.key] }, data });
      }
      this.#count('workflows');
    }
  }

  async #assignmentRules(rules) {
    if (!rules.length) return;
    const existing = await this.db.assignmentRule.findMany();
    for (const r of rules) {
      const objectId = this.ids.object[r.object];
      if (!objectId) throw new Error(`Assignment rule ${r.name}: unknown object ${r.object}`);
      const data = {
        object_id: objectId, name: r.name, rule_type: r.rule_type, conditions: r.conditions ?? null,
        assignee_id: r.assignee ?? null, pool_ids: r.pool ?? null, fallback_id: r.fallback ?? null,
        order_index: r.order_index ?? 1, is_active: true,
      };
      const old = existing.filter((x) => x.object_id === objectId && x.name === r.name);
      if (old.length === 1 && matches(old[0], data)) { this.#skip('assignment_rules'); continue; }
      if (old.length) {
        await this.db.roundRobinState.deleteMany({ where: { rule_id: { in: old.map((o) => o.id) } } }).catch(() => {});
        await this.db.assignmentRule.deleteMany({ where: { id: { in: old.map((o) => o.id) } } });
      }
      const rule = await this.db.assignmentRule.create({ data });
      if (r.rule_type === 'round_robin' && r.pool?.length) {
        await this.db.roundRobinState.create({ data: { rule_id: rule.id, pool_ids: r.pool, last_index: 0 } }).catch(() => {});
      }
      this.#count('assignment_rules');
    }
  }

  async #sla(hours, policies) {
    let hoursId = null;
    if (hours) {
      const rows = await this.#sync('slaBusinessHours', 'business_hours', await this.db.slaBusinessHours.findMany(), [hours],
        (h) => h.name,
        (h) => ({ timezone_label: h.timezone_label, utc_offset_minutes: h.utc_offset_minutes, weekly: h.weekly, holidays: h.holidays ?? [], is_default: Boolean(h.is_default), is_active: true }),
        (h) => ({ name: h.name }));
      hoursId = rows.get(hours.name).id;
    }
    if (!policies.length) return;
    const existing = await this.db.slaPolicy.findMany({ where: { name: { in: policies.map((p) => p.name) } }, include: { targets: true, escalations: true } });
    for (const [i, p] of policies.entries()) {
      const objectId = this.ids.object[p.object];
      if (!objectId) throw new Error(`SLA ${p.name}: unknown object ${p.object}`);
      const stages = this.ids.stage[p.object] ?? {};
      for (const name of [...(p.config.first_response_stages ?? []), ...(p.config.closed_stages ?? []), ...(p.config.canceled_stages ?? [])]) {
        if (!stages[name]) throw new Error(`SLA ${p.name}: ${p.object} has no stage ${name}`);
      }
      const head = {
        name: p.name, description: p.description ?? null, entity_type: 'record', object_id: objectId, config: p.config,
        conditions: p.conditions ?? [], pause_statuses: p.pause_stages ?? [], business_hours_id: hoursId,
        order_index: p.order_index ?? i, is_active: true,
      };
      const targets = p.targets.map((t) => ({ metric: t.metric, priority: t.priority ?? '*', target_minutes: t.minutes, warning_pct: t.warning_pct ?? 75 }));
      const escalations = (p.escalations ?? []).map((e, j) => ({ metric: e.metric ?? '*', trigger: e.trigger, action: e.action, config: e.config ?? null, order_index: j }));
      const old = existing.filter((x) => x.name === p.name);
      if (old.length === 1 && matches(old[0], head)
        && same(old[0].targets.map((t) => ({ metric: t.metric, priority: t.priority, target_minutes: t.target_minutes, warning_pct: t.warning_pct })), targets)
        && same(old[0].escalations.map((e) => ({ metric: e.metric, trigger: e.trigger, action: e.action, config: e.config ?? null, order_index: e.order_index })), escalations)) {
        this.#skip('sla_policies');
        continue;
      }
      if (old.length) await this.db.slaPolicy.deleteMany({ where: { id: { in: old.map((o) => o.id) } } });
      const policy = await this.db.slaPolicy.create({ data: head });
      await this.db.slaTarget.createMany({ data: targets.map((t) => ({ policy_id: policy.id, ...t })) });
      if (escalations.length) await this.db.slaEscalation.createMany({ data: escalations.map((e) => ({ policy_id: policy.id, ...e })) });
      this.#count('sla_policies');
    }
  }

  async #permissions(perms) {
    const items = [];
    for (const p of perms) {
      const objectId = this.ids.object[p.object];
      if (!objectId) throw new Error(`Permission: unknown object ${p.object}`);
      for (const role of [].concat(p.roles ?? p.role)) items.push({ objectId, role, can_view: Boolean(p.can_view), can_edit: Boolean(p.can_edit) });
    }
    if (!items.length) return;
    const existing = await this.db.uiPermission.findMany({ where: { entity_type: 'object' } });
    await this.#sync('uiPermission', 'object_permissions', existing, items,
      (x) => `${x.entity_id ?? x.objectId}|${x.role_name ?? x.role}`,
      (x) => ({ can_view: x.can_view, can_edit: x.can_edit }),
      (x) => ({ entity_type: 'object', entity_id: x.objectId, role_name: x.role }));
  }

  // ── Records (master data and demo) ───────────────────────────────────────

  /** Load every live record of an object with its stored values, once. */
  async #cache(objectName) {
    if (this.recCache[objectName]) return this.recCache[objectName];
    const objectId = this.ids.object[objectName];
    if (!objectId) throw new Error(`Records: unknown object ${objectName}`);
    const recs = await this.db.record.findMany({ where: { object_id: objectId, deleted_at: null }, select: { id: true, pipeline_stage_id: true } });
    const byId = new Map(recs.map((r) => [r.id, { values: {}, stage: r.pipeline_stage_id }]));
    if (recs.length) {
      const vals = await this.db.recordFieldValue.findMany({
        where: { record: { object_id: objectId, deleted_at: null } },
        select: { record_id: true, field_name: true, str_value: true },
      });
      for (const v of vals) byId.get(v.record_id)?.values && (byId.get(v.record_id).values[v.field_name] = v.str_value);
    }
    this.recCache[objectName] = { byId };
    return this.recCache[objectName];
  }

  async #findByKey(objectName, match) {
    const { byId } = await this.#cache(objectName);
    const pairs = Object.entries(match);
    if (pairs.some(([, v]) => v === undefined || v === null || v === '')) return null;
    for (const [id, rec] of byId) {
      if (pairs.every(([f, v]) => rec.values[f] === storedString(v))) return id;
    }
    return null;
  }

  /** Resolve `@object:field=value` references in a row. */
  async #resolveRefs(values) {
    for (const [k, v] of Object.entries(values)) {
      if (typeof v !== 'string' || !v.startsWith('@')) continue;
      const m = /^@(\w+):(\w+)=(.+)$/.exec(v);
      if (!m) throw new Error(`Bad reference ${v}`);
      values[k] = await this.#findByKey(m[1], { [m[2]]: m[3] });
      if (!values[k]) throw new Error(`Reference ${v} matched no record`);
    }
    return values;
  }

  /**
   * Upsert records keyed by `key` — a field name or an array of them (a
   * composite key). Values starting with `@` reference another record:
   * `@party:email=ana@x.mu` → that party's id. `_stage` names the pipeline
   * stage, `_owner` the assignee.
   */
  async #upsertRecords(objectName, key, rows, { owner = null } = {}) {
    const keys = [].concat(key);
    const objectId = this.ids.object[objectName];
    if (!objectId) throw new Error(`Records: unknown object ${objectName}`);
    const cache = await this.#cache(objectName);
    const viewer = { tenant_id: this.tenantId };
    // A set that references its own object must run in order.
    const selfRef = rows.some((r) => Object.values(r).some((v) => typeof v === 'string' && v.startsWith(`@${objectName}:`)));

    const work = async (raw) => {
      const { _stage, _owner, _created, ...input } = raw;
      const values = await this.#resolveRefs({ ...input });
      const stageId = _stage ? this.ids.stage[objectName]?.[_stage] : null;
      if (_stage && !stageId) throw new Error(`Records: ${objectName} has no stage ${_stage}`);
      const existing = await this.#findByKey(objectName, Object.fromEntries(keys.map((k) => [k, values[k]])));
      if (existing) {
        const cur = cache.byId.get(existing);
        const changed = Object.entries(values).some(([f, v]) => cur.values[f] !== storedString(v));
        if (changed) { await this.records.updateRecord(existing, null, null, undefined, values); this.touched.add(objectName); }
        if (stageId && cur.stage !== stageId) await this.db.record.update({ where: { id: existing }, data: { pipeline_stage_id: stageId } });
        if (!changed && (!stageId || cur.stage === stageId)) { this.#skip(`records.${objectName}`); return; }
        for (const [f, v] of Object.entries(values)) cur.values[f] = storedString(v);
        if (stageId) cur.stage = stageId;
      } else {
        const created = await this.records.createRecord(objectId, stageId, _owner ?? owner, _owner ?? owner, viewer, values, { draft: true });
        // Backdated demo history (created_at drives "per month" charts).
        if (_created) await this.db.record.update({ where: { id: created.id }, data: { created_at: new Date(`${_created}T09:00:00.000Z`) } });
        cache.byId.set(created.id, { values: Object.fromEntries(Object.entries(values).map(([f, v]) => [f, storedString(v)])), stage: stageId });
        this.touched.add(objectName);
      }
      this.#count(`records.${objectName}`);
    };

    if (selfRef) { for (const r of rows) await work(r); return; }
    // Keys must be unique inside a set, or two workers would both create.
    await pool(rows, RECORD_CONCURRENCY, work);
  }

  async #recordSets(sets) {
    for (const set of sets) {
      // A checkpoint: bring roll-ups up to date before later sets validate
      // against them (e.g. a fund order needs the investor's KYC approved).
      if (set.recompute) {
        const t = Date.now();
        await this.#recomputeObjects([].concat(set.recompute));
        this.log(`      recompute ${[].concat(set.recompute).join(', ')} (${((Date.now() - t) / 1000).toFixed(1)}s)`);
        continue;
      }
      const t = Date.now();
      await this.#upsertRecords(set.object, set.key, set.records, { owner: set.owner ?? null });
      this.log(`      ${set.object}: ${set.records.length} rows (${((Date.now() - t) / 1000).toFixed(1)}s)`);
    }
  }

  /**
   * Recompute formula roll-ups after a bulk load. An object needs it when its
   * formulas read another object (LOOKUP / LATEST / COUNT_RELATED /
   * SUM_RELATED, or a dotted path through a lookup) that this run wrote.
   * Objects are processed dependencies-first; a dependency cycle (party ↔
   * loan account) is simply run twice.
   */
  async #recomputePass(mods) {
    const deferred = this.records.takeDeferredParents();
    if (!this.touched.size && !deferred.length) return;
    const objs = Object.fromEntries(mods.flatMap((m) => m.objects ?? []).map((o) => [o.name, o]));
    const deps = formulaDependencies(objs);
    // Closure: objects depending (transitively) on something written now.
    const dirty = new Set(this.touched);
    let grew = true;
    while (grew) {
      grew = false;
      for (const [name, ds] of deps) {
        if (!dirty.has(name) && [...ds].some((d) => dirty.has(d))) { dirty.add(name); grew = true; }
      }
    }
    const order = topoOrder([...dirty].filter((n) => deps.get(n)?.size), deps);
    await this.#recomputeObjects(order);
    this.records.takeDeferredParents();
  }

  /** Recompute every record of each named object, in the order given. */
  async #recomputeObjects(names) {
    for (const name of names) {
      const objectId = this.ids.object[name];
      if (!objectId) continue;
      const recs = await this.db.record.findMany({ where: { object_id: objectId, deleted_at: null }, select: { id: true } });
      let changed = 0;
      await pool(recs, RECORD_CONCURRENCY, async (r) => { if (await this.records.recompute(r.id)) changed += 1; });
      this.records.takeDeferredParents();
      this.records.deferParentRefresh();
      if (changed) this.#count(`recomputed.${name}`, changed);
    }
  }

  // ── Dashboards & public forms ────────────────────────────────────────────

  async #dashboards(boards) {
    if (!boards.length) return;
    const existing = await this.db.uiDashboard.findMany({ where: { name: { in: boards.map((b) => b.name) } }, include: { widgets: { orderBy: { order_index: 'asc' } } } });
    for (const b of boards) {
      const head = { label: b.label, description: b.description ?? null, min_role: b.min_role ?? null, is_default: Boolean(b.is_default), is_active: true };
      let x = 0;
      let y = 0;
      let rowH = 0;
      const widgets = b.widgets.map((w, i) => {
        const { w: width, h } = SIZES[w.size] ?? SIZES.half;
        if (x + width > 12) { x = 0; y += rowH; rowH = 0; }
        const pos = { x, y, w: width, h };
        x += width;
        rowH = Math.max(rowH, h);
        const isMetric = w.type === 'metric';
        return {
          widget_type: w.type, title: w.title, ...pos, order_index: i + 1, is_active: true,
          data_source: { type: 'object', ...w.data },
          config: isMetric
            ? { valueKey: 'value', ...(w.config ?? {}) }
            : { chart_type: w.chart ?? 'bar', xAxisKey: 'name', yAxisKey: 'value', appearance: w.appearance ?? {}, ...(w.config ?? {}) },
        };
      });
      const old = existing.filter((d) => d.name === b.name);
      const pick = (wd) => ({ widget_type: wd.widget_type, title: wd.title, x: wd.x, y: wd.y, w: wd.w, h: wd.h, order_index: wd.order_index, is_active: wd.is_active, data_source: wd.data_source, config: wd.config });
      if (old.length === 1 && matches(old[0], head) && same(old[0].widgets.map(pick), widgets)) { this.#skip('dashboards'); continue; }
      if (old.length) {
        await this.db.uiDashboardWidget.deleteMany({ where: { dashboard_id: { in: old.map((o) => o.id) } } });
        await this.db.uiDashboard.deleteMany({ where: { id: { in: old.map((o) => o.id) } } });
      }
      if (b.is_default) await this.db.uiDashboard.updateMany({ where: { is_default: true }, data: { is_default: false } });
      const dash = await this.db.uiDashboard.create({ data: { name: b.name, ...head } });
      await this.db.uiDashboardWidget.createMany({ data: widgets.map((w) => ({ dashboard_id: dash.id, ...w })) });
      this.#count('dashboards');
    }
  }

  async #publicForms(defs) {
    const out = [];
    const PublicFormService = require('./public-form.service');
    const svc = new PublicFormService(this.db, this.records);
    const forms = defs.length ? await this.db.uiForm.findMany({ where: { id: { in: defs.map((d) => this.ids.form[d.form]).filter(Boolean) } }, select: { id: true, config: true, public_key: true } }) : [];
    const byId = new Map(forms.map((f) => [f.id, f]));
    for (const d of defs) {
      const formId = this.ids.form[d.form];
      if (!formId) throw new Error(`Public form: unknown form ${d.form}`);
      const cur = byId.get(formId);
      const want = { ...(cur?.config?.public ?? {}), ...(d.settings ?? {}), enabled: true };
      let key = cur?.public_key;
      if (!key || !same(cur?.config?.public ?? {}, want)) {
        key = (await svc.publish(formId, d.settings ?? {})).public_key;
        this.#count('public_forms');
      } else this.#skip('public_forms');
      out.push({ form: d.form, key, path: `/f/${key}` });
    }
    return out;
  }
}

const MEMO_MODELS = new Set(['uiField', 'uiObject', 'uiPipeline', 'uiPipelineStage', 'uiValidation', 'businessUnit', 'barrierZone', 'uiModule']);
const MEMO_OPS = new Set(['findMany', 'findFirst', 'findUnique']);

/**
 * A view of the client whose metadata reads are memoised by arguments. Only
 * for phases that do not change metadata (the records phase of an install).
 */
function memoizeMetadataReads(client) {
  const memo = new Map();
  return new Proxy(client, {
    get(target, model) {
      const delegate = target[model];
      if (typeof delegate === 'function') return delegate.bind(target);
      if (!MEMO_MODELS.has(model) || !delegate) return delegate;
      return new Proxy(delegate, {
        get(d, op) {
          const fn = d[op];
          if (!MEMO_OPS.has(op) || typeof fn !== 'function') return typeof fn === 'function' ? fn.bind(d) : fn;
          return (args) => {
            const key = `${model}.${op}:${canon(args ?? {})}`;
            if (!memo.has(key)) memo.set(key, fn.call(d, args).catch((e) => { memo.delete(key); throw e; }));
            return memo.get(key);
          };
        },
      });
    },
  });
}

/**
 * object name → Set of other objects its formulas read: literal object names
 * in LOOKUP / LATEST / COUNT_RELATED / SUM_RELATED, and the targets of dotted
 * paths through lookup fields.
 */
function formulaDependencies(objs) {
  const fieldMap = (o) => Object.fromEntries((o.fields ?? []).map((f) => [f.name, f]));
  const targetOf = (o, name, depth = 0) => {
    const f = fieldMap(o)[name];
    if (!f || depth > 4) return null;
    if (f.type === 'lookup') return f.config?.target_object ?? null;
    const e = f.config?.expression;
    if (f.type === 'formula' && /^[a-z_][\w.]*$/i.test(e ?? '')) return pathTarget(o, e, depth + 1);
    return null;
  };
  const pathTarget = (o, path, depth = 0) => {
    let cur = o;
    for (const seg of path.split('.')) {
      const t = targetOf(cur, seg, depth);
      if (!t || !objs[t]) return null;
      cur = objs[t];
    }
    return cur.name;
  };
  const out = new Map();
  for (const o of Object.values(objs)) {
    const ds = new Set();
    for (const f of o.fields ?? []) {
      const e = f.config?.expression;
      if (f.type !== 'formula' || !e) continue;
      let ast;
      try { ast = compile(e); } catch { continue; }
      (function walk(n) {
        if (!n) return;
        if (n.k === 'ref' && n.name.includes('.')) {
          let cur = o;
          for (const seg of n.name.split('.').slice(0, -1)) {
            const t = targetOf(cur, seg);
            if (!t || !objs[t]) break;
            ds.add(t);
            cur = objs[t];
          }
        }
        if (n.k === 'call') {
          if (['LOOKUP', 'LATEST', 'COUNT_RELATED', 'SUM_RELATED'].includes(String(n.name).toUpperCase()) && n.args?.[0]?.k === 'lit' && objs[n.args[0].v]) ds.add(n.args[0].v);
          (n.args ?? []).forEach(walk);
        }
        if (n.k === 'bin') { walk(n.l); walk(n.r); }
        if (n.k === 'neg' || n.k === 'not') walk(n.e);
      }(ast));
    }
    out.set(o.name, ds);
  }
  return out;
}

/** Dependencies first; members of a cycle appear twice so both see each other. */
function topoOrder(names, deps) {
  const wanted = new Set(names);
  const order = [];
  const state = new Map();
  const cyclic = new Set();
  const visit = (n, stack) => {
    if (state.get(n) === 2) return;
    if (state.get(n) === 1) { stack.slice(stack.indexOf(n)).forEach((x) => cyclic.add(x)); return; }
    state.set(n, 1);
    for (const d of deps.get(n) ?? []) if (wanted.has(d) && d !== n) visit(d, [...stack, n]);
    state.set(n, 2);
    order.push(n);
  };
  for (const n of names) visit(n, []);
  return [...order, ...order.filter((n) => cyclic.has(n))];
}

function groupBy(rows, keyFn) {
  const m = new Map();
  for (const r of rows) {
    const k = keyFn(r);
    if (!m.has(k)) m.set(k, []);
    m.get(k).push(r);
  }
  return m;
}

/** Comparable shape of a workflow's steps (links by position, not id). */
function signature(steps) {
  const keyOfId = new Map(steps.map((s, i) => [s.id ?? s.key, i]));
  return steps.map((s) => ({
    name: s.name, step_type: s.step_type, order_index: s.order_index, config: s.config,
    on_true: s.on_true_id != null ? keyOfId.get(s.on_true_id) : (s.on_true != null ? keyOfId.get(s.on_true) : null),
    on_false: s.on_false_id != null ? keyOfId.get(s.on_false_id) : (s.on_false != null ? keyOfId.get(s.on_false) : null),
  }));
}

module.exports = VerticalInstaller;
module.exports.typedValue = typedValue;
module.exports._internal = { canon, matches, storedString, pool, formulaDependencies, topoOrder };
