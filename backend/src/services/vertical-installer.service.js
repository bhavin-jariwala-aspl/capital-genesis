'use strict';

const { isEncrypted, decrypt } = require('./field-protection');

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
   * The SLA window per tracked object: the shortest first-response and
   * resolution targets (business minutes) across the object's policies.
   * @returns {Map<string, {first: number|null, resolution: number|null}>}
   */
  static slaWindows(policies = []) {
    const out = new Map();
    for (const p of policies) {
      if (!p?.object) continue;
      const w = out.get(p.object) ?? { first: null, resolution: null };
      for (const t of p.targets ?? []) {
        const key = t.metric === 'first_response' ? 'first' : t.metric === 'resolution' ? 'resolution' : null;
        const mins = Number(t.minutes ?? t.target_minutes);
        if (key && Number.isFinite(mins) && mins > 0) w[key] = w[key] == null ? mins : Math.min(w[key], mins);
      }
      out.set(p.object, w);
    }
    return out;
  }

  /**
   * @param {import('@prisma/client').PrismaClient} prisma tenant-scoped client
   * @param {{ tenantId: number, log?: Function, demo?: boolean, password?: string }} opts
   */
  constructor(prisma, { tenantId, log = () => {}, demo = false, password = null, recompute = null, resetPasswords = false, skipRecords = false } = {}) {
    this.db = prisma;
    this.tenantId = tenantId;
    this.log = log;
    this.demo = demo;
    this.password = password;
    this.recompute = recompute;
    this.resetPasswords = resetPasswords;
    this.skipRecords = skipRecords;
    // Records are written after all metadata, so metadata reads made by the
    // record service (field lists, object config, stages) can be memoised for
    // the run — each one is a remote round trip, several per record.
    this.records = new RecordService(memoizeMetadataReads(prisma));
    this.ids = { module: {}, object: {}, field: {}, form: {}, stage: {} };
    this.summary = {};
    this.unchanged = {};
    this.touched = new Set();
    this.formulaChanged = new Set();
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
    await step('settings', () => this.#settings(pack.settings ?? {}));
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
    this.objectDefs = Object.fromEntries((pack.modules ?? []).flatMap((m) => m.objects ?? []).map((o) => [o.name, o]));
    // --recompute: treat these objects' formulas as changed, so every record is recomputed.
    if (this.recompute) {
      const withFormulas = Object.values(this.objectDefs).filter((o) => (o.fields ?? []).some((f) => (f.field_type ?? f.type) === 'formula')).map((o) => o.name);
      for (const n of this.recompute === true ? withFormulas : this.recompute) this.formulaChanged.add(n);
    }
    if (!this.skipRecords) await step('master data', () => this.#recordSets(pack.masterData ?? []));
    if (this.demo && !this.skipRecords) await step('demo records', () => this.#recordSets(pack.demo ?? []));
    if (this.demo) await step('demo ownership', () => this.#ownership(pack));
    if (this.demo) await step('demo history', () => this.#history(pack.demo ?? [], VerticalInstaller.slaWindows(pack.slaPolicies ?? [])));
    if (this.demo) await step('demo approvals', () => this.#pendingApprovals());
    if (this.demo && typeof pack.platformDemo === 'function') await step('demo activity, documents & access', () => this.#platformDemo(pack.platformDemo));
    await step('recompute roll-ups', () => this.#recomputePass(pack.modules ?? []));
    return { summary: this.summary, unchanged: this.unchanged, credentials, publicForms };
  }

  /**
   * Workspace settings (currency, time zone, date format, app name…) through
   * SettingsService, so they are validated and the currency cache is dropped.
   * Only keys whose value differs are written.
   */
  async #settings(wanted) {
    const keys = Object.keys(wanted ?? {});
    if (!keys.length) return;
    const SettingsService = require('./settings.service');
    const svc = new SettingsService(this.db);
    const current = await svc.getEffective(this.tenantId);
    const patch = Object.fromEntries(keys.filter((k) => String(current[k] ?? '') !== String(wanted[k] ?? '')).map((k) => [k, wanted[k]]));
    if (!Object.keys(patch).length) { this.#skip('settings', keys.length); return; }
    await svc.updateSettings(this.tenantId, null, patch);
    this.#count('settings', Object.keys(patch).length);
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

  /**
   * Like #sync, but new rows are inserted with one createMany and read back
   * with `refetch` — on a remote database a single-row create costs a whole
   * transaction (BEGIN/INSERT/SELECT/COMMIT ≈ 1.3 s), so batching matters.
   */
  async #syncBatch(model, kind, existing, items, keyOf, dataOf, createExtra, refetch) {
    const byKey = new Map(existing.map((r) => [keyOf(r), r]));
    const out = new Map();
    const fresh = [];
    const changed = [];
    for (const item of items) {
      const key = keyOf(item);
      const data = dataOf(item);
      const cur = byKey.get(key);
      if (!cur) { fresh.push({ ...createExtra(item), ...data }); continue; }
      if (!matches(cur, data)) changed.push({ key, id: cur.id, data }); else { out.set(key, cur); this.#skip(kind); }
    }
    // Updates are independent rows: run them concurrently (each is several round trips to a remote DB).
    await pool(changed, 8, async ({ key, id, data }) => {
      out.set(key, await this.db[model].update({ where: { id }, data }));
      this.#count(kind);
    });
    if (fresh.length) {
      await this.db[model].createMany({ data: fresh });
      this.#count(kind, fresh.length);
      for (const row of await refetch()) { const k = keyOf(row); if (!out.has(k)) out.set(k, row); }
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
      } else {
        // Profile fields follow the pack; the role and password never change here.
        const data = {};
        if (s.employee_name && emp.employee_name !== s.employee_name) data.employee_name = s.employee_name;
        if (s.email && emp.email !== s.email) data.email = s.email;
        if (this.resetPasswords && this.password) {
          data.password = await bcrypt.hash(this.password, 12);
          data.tokens_valid_after = new Date();
          issued.push({ employee_id: s.employee_id, role: s.role, password: this.password });
        }
        if (Object.keys(data).length) { emp = await this.db.employee.update({ where: { employee_id: s.employee_id }, data }); this.#count('staff_updated'); } else this.#skip('staff');
      }
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
      (m) => ({ label: m.label, description: m.description ?? null, icon: m.icon ?? null, color: m.color ?? null, category: m.category ?? 'crm', order_index: m.order_index ?? 0, is_active: true, config: m.config ?? null }),
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

    await this.#fields(row.id, obj.name, obj.fields ?? []);
    const existingForms = new Map((this.pre.formsByObject.get(row.id) ?? []).map((f) => [f.name, f]));
    for (const form of obj.forms ?? []) await this.#form(row.id, obj.name, form, existingForms.get(form.name));
    if (obj.pipeline) {
      const pipe = (this.pre.pipelinesByObject.get(row.id) ?? []).find((p) => p.name === obj.pipeline.name);
      await this.#pipeline(row.id, obj.name, obj.pipeline, pipe);
    }
  }

  /** An object's fields (batched) and the validation rules the pack owns for them. */
  async #fields(objectId, objectName, fields) {
    // A new or edited formula leaves existing records with stale (or no) values;
    // mark the object so the recompute pass revisits all of its records.
    const before = new Map((this.pre.fieldsByObject.get(objectId) ?? []).map((f) => [f.name, f.config?.expression ?? null]));
    if (fields.some((f) => (f.field_type ?? f.type) === 'formula' && before.get(f.name) !== (f.config?.expression ?? null))) {
      this.formulaChanged.add(objectName);
    }
    const rows = await this.#syncBatch('uiField', 'fields', this.pre.fieldsByObject.get(objectId) ?? [], fields.map((f, i) => ({ ...f, _order: f.order ?? i + 1 })),
      (f) => f.name,
      (f) => ({
        label: f.label, field_type: f.field_type ?? f.type, data_type: f.data_type ?? DATA_TYPE[f.type] ?? 'string',
        is_required: Boolean(f.required ?? f.is_required), is_unique: Boolean(f.unique ?? f.is_unique), placeholder: f.placeholder ?? null,
        help_text: f.help ?? f.help_text ?? null, default_value: f.default ?? f.default_value ?? null, options: f.options ?? null,
        config: f.config ?? {}, order_index: f._order ?? f.order_index, is_active: true,
      }),
      (f) => ({ object_id: objectId, name: f.name }),
      () => this.db.uiField.findMany({ where: { object_id: objectId } }));
    for (const f of fields) this.ids.field[objectName][f.name] = rows.get(f.name).id;

    // Validations: the pack owns each field's rule list; replace only lists that differ.
    const stale = [];
    const fresh = [];
    for (const f of fields) {
      const id = rows.get(f.name).id;
      const want = (f.validations ?? []).map((v, i) => ({ validation_type: v.type, value: v.value != null ? String(v.value) : null, error_message: v.message ?? '', order_index: i + 1 }));
      const have = (this.pre.validationsByField.get(id) ?? []).map((v) => ({ validation_type: v.validation_type, value: v.value ?? null, error_message: v.error_message ?? '', order_index: v.order_index }));
      if (same(want, have)) continue;
      stale.push(id);
      fresh.push(...want.map((v) => ({ field_id: id, ...v })));
    }
    if (stale.length) await this.db.uiValidation.deleteMany({ where: { field_id: { in: stale } } });
    if (fresh.length) { await this.db.uiValidation.createMany({ data: fresh }); this.#count('validations', fresh.length); }
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
    const stages = await this.#syncBatch('uiPipelineStage', 'stages', cur?.stages ?? [], p.stages.map((st, i) => ({ ...st, _order: i + 1 })),
      (s) => s.name,
      (s) => ({ label: s.label, color: s.color ?? '#6366f1', order_index: s._order ?? s.order_index, config: s.config ?? null }),
      (s) => ({ pipeline_id: row.id, name: s.name }),
      () => this.db.uiPipelineStage.findMany({ where: { pipeline_id: row.id } }));
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
      // Steps in one batch, then resolve keys through their (unique) order_index.
      await this.db.uiWorkflowStep.createMany({ data: steps.map((s) => ({ workflow_id: wf.id, name: s.name, step_type: s.step_type, order_index: s.order_index, config: s.config })) });
      const created = await this.db.uiWorkflowStep.findMany({ where: { workflow_id: wf.id }, select: { id: true, order_index: true } });
      const idByOrder = new Map(created.map((r) => [r.order_index, r.id]));
      const idByKey = Object.fromEntries(steps.map((s) => [s.key, idByOrder.get(s.order_index)]));
      await Promise.all(steps.map((s) => {
        const data = {};
        if (s.on_true) data.on_true_id = idByKey[s.on_true];
        if (s.on_false) data.on_false_id = idByKey[s.on_false];
        return Object.keys(data).length ? this.db.uiWorkflowStep.update({ where: { id: idByKey[s.key] }, data }) : null;
      }));
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
      // A changed policy is updated in place: deleting it would cascade to its
      // live timers (sla_instances) and restart every clock from the record's
      // creation. Only duplicates of the same name are removed.
      let policy;
      if (old.length) {
        policy = await this.db.slaPolicy.update({ where: { id: old[0].id }, data: head });
        if (old.length > 1) await this.db.slaPolicy.deleteMany({ where: { id: { in: old.slice(1).map((o) => o.id) } } });
        await this.db.slaTarget.deleteMany({ where: { policy_id: policy.id } });
        await this.db.slaEscalation.deleteMany({ where: { policy_id: policy.id } });
      } else {
        policy = await this.db.slaPolicy.create({ data: head });
      }
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
      for (const role of [].concat(p.roles ?? p.role)) items.push({ objectId, role, can_view: Boolean(p.can_view), can_edit: Boolean(p.can_edit), view_scope: p.view_scope ?? null });
    }
    if (!items.length) return;
    // A pack may grant the same object/role twice (e.g. a base list and an
    // extension): merge, the most permissive grant wins.
    const merged = new Map();
    for (const it of items) {
      const k = `${it.objectId}|${it.role}`;
      const cur = merged.get(k);
      merged.set(k, cur ? { ...cur, can_view: cur.can_view || it.can_view, can_edit: cur.can_edit || it.can_edit, view_scope: cur.view_scope === 'all' || it.view_scope === 'all' ? 'all' : (cur.view_scope ?? it.view_scope) } : it);
    }
    items.length = 0;
    items.push(...merged.values());
    const existing = await this.db.uiPermission.findMany({ where: { entity_type: 'object' } });
    await this.#syncBatch('uiPermission', 'object_permissions', existing, items,
      (x) => `${x.entity_id ?? x.objectId}|${x.role_name ?? x.role}`,
      (x) => ({ can_view: x.can_view, can_edit: x.can_edit, view_scope: x.view_scope ?? null }),
      (x) => ({ entity_type: 'object', entity_id: x.objectId, role_name: x.role }),
      () => this.db.uiPermission.findMany({ where: { entity_type: 'object' } }));
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
        // Encrypted fields are stored as ciphertext: compare the plain value.
        const plain = (x) => (isEncrypted(x) ? decrypt(x) : x);
        const changed = Object.entries(values).some(([f, v]) => plain(cur.values[f]) !== storedString(v));
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
        const names = this.#withStaleUpstream([].concat(set.recompute));
        await this.#recomputeObjects(names);
        this.log(`      recompute ${names.join(', ')} (${((Date.now() - t) / 1000).toFixed(1)}s)`);
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
    if (!this.touched.size && !this.formulaChanged.size && !deferred.length) return;
    const objs = Object.fromEntries(mods.flatMap((m) => m.objects ?? []).map((o) => [o.name, o]));
    const deps = formulaDependencies(objs);
    // Closure: objects depending (transitively) on something written now, or
    // whose formulas changed in this run.
    const dirty = new Set([...this.touched, ...this.formulaChanged]);
    let grew = true;
    while (grew) {
      grew = false;
      for (const [name, ds] of deps) {
        if (!dirty.has(name) && [...ds].some((d) => dirty.has(d))) { dirty.add(name); grew = true; }
      }
    }
    // An object is revisited when it reads another object, or when its own
    // formulas changed (or were named with --recompute) — even if they only
    // read its own fields, existing records still hold the old results.
    const order = topoOrder([...dirty].filter((n) => deps.get(n)?.size || this.formulaChanged.has(n)), deps);
    await this.#recomputeObjects(order);
    this.records.takeDeferredParents();
  }

  /**
   * A checkpoint's objects, preceded (in dependency order) by the objects they
   * read whose formulas changed in this run, so a roll-up such as "marketing
   * consent" never reads a key its source records have not computed yet.
   */
  #withStaleUpstream(names) {
    const objs = this.objectDefs ?? {};
    const deps = formulaDependencies(objs);
    const upstream = new Set();
    const visit = (n) => { for (const d of deps.get(n) ?? []) if (!upstream.has(d)) { upstream.add(d); visit(d); } };
    names.forEach(visit);
    const stale = [...upstream].filter((n) => this.formulaChanged.has(n) && !names.includes(n));
    return [...topoOrder(stale, deps), ...names];
  }

  /**
   * Status history for back-dated demo records: a stage timeline from
   * `_created` to the record's current stage, and a matching updated_at, so the
   * record's timeline, stage-ageing reports and SLA outcomes look like a year
   * of real use. Records that already have history keep it — except open work
   * on an SLA-tracked object that has aged out of a believable window, whose
   * timeline is rebased (see below).
   *
   * SLA realism: open work on an SLA-tracked object is placed inside its SLA
   * window (most on track, some at risk, a few breached by hours or days — not
   * a year), and its timers are restarted from the record's new creation time.
   * Timers are otherwise anchored when the record is first loaded, i.e. on the
   * pack's back-dated `_created`, which is what made open demo enquiries read
   * "343d over". `slaWindows` maps object → { first, resolution } (shortest
   * target minutes across the object's policies).
   */
  async #history(sets, slaWindows = new Map()) {
    const EXIT = new Set(['declined', 'withdrawn', 'lapsed', 'rejected', 'disqualified', 'abandoned', 'cancelled', 'canceled', 'lost', 'dismissed', 'refused', 'nurture', 'on_hold', 'exited', 'dormant', 'closed_no_filing']);
    const DAY = 86400000;
    const HOUR = 3600000;
    const hash = (str) => { let h = 2166136261; for (const c of String(str)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return (h >>> 0) / 4294967295; };
    const now = Date.now();
    // The SLA window as calendar time: business minutes → working days (8h) → calendar days (×7/5).
    const slaWindow = (object, awaitingFirst) => {
      const w = slaWindows.get?.(object);
      const mins = w ? ((awaitingFirst ? w.first : w.resolution) ?? w.resolution ?? w.first) : null;
      return mins ? Math.max(HOUR, (mins / 480) * 1.4 * DAY) : null;
    };
    // Where in its window an open demo item sits: ~65% on track, ~20% at risk, ~15% breached (by up to half the window).
    const placeIn = (win, h, h2) => Math.max(30 * 60000, win * (h2 < 0.65 ? 0.1 + 0.6 * h : h2 < 0.85 ? 0.78 + 0.18 * h : 1.05 + 0.5 * h));
    // Out of place: past its window and well beyond where it should sit (so a demo item meant to be
    // breached stays put until it drifts, and re-running the installer does not keep moving it).
    const stale = (age, win, h, h2) => age > win && age > placeIn(win, h, h2) * 1.25;
    const retimed = new Set();
    let written = 0;
    for (const set of sets) {
      if (!set.object || !Array.isArray(set.records) || !set.records.some((r) => r._created)) continue;
      const objectId = this.ids.object[set.object];
      const stages = objectId ? await this.db.uiPipelineStage.findMany({ where: { pipeline: { object_id: objectId } }, orderBy: { order_index: 'asc' }, select: { id: true, name: true, label: true } }) : [];
      const keys = [].concat(set.key ?? 'ext_ref');
      const cache = await this.#cache(set.object);
      const rows = [];
      for (const raw of set.records) {
        if (!raw._created) continue;
        const keyVals = await this.#resolveRefs(Object.fromEntries(keys.map((k) => [k, raw[k]]))).catch(() => null);
        const id = keyVals ? await this.#findByKey(set.object, keyVals).catch(() => null) : null;
        if (id) rows.push({ id, raw, stageId: cache.byId.get(id)?.stage ?? null });
      }
      if (!rows.length) continue;
      const have = new Set((await this.db.statusEvent.findMany({ where: { record_id: { in: rows.map((r) => r.id) } }, select: { record_id: true }, distinct: ['record_id'] })).map((e) => e.record_id));
      const events = [];
      const stamps = [];
      const moved = [];
      const tracked = slaWindows.has(set.object);
      const anchors = tracked
        ? new Map((await this.db.record.findMany({ where: { id: { in: rows.map((r) => r.id) } }, select: { id: true, created_at: true, updated_at: true } })).map((r) => [r.id, r]))
        : new Map();
      const timers = tracked && this.db.slaInstance?.findMany
        ? await this.db.slaInstance.findMany({ where: { entity_type: 'record', entity_id: { in: rows.map((r) => r.id) } }, select: { entity_id: true, started_at: true } })
        : [];
      const rebase = [];
      for (const { id, raw, stageId } of rows) {
        let created = new Date(`${raw._created}T09:00:00.000Z`).getTime();
        const current = stages.find((st) => st.id === stageId);
        const normal = stages.filter((st) => !EXIT.has(st.name));
        let path = [];
        if (current) {
          if (EXIT.has(current.name)) path = [...normal.slice(0, Math.max(1, Math.floor(normal.length / 3))), current];
          else path = normal.slice(0, normal.findIndex((st) => st.id === current.id) + 1);
          if (!path.length) path = [current];
        }
        const terminal = current && (EXIT.has(current.name) || current.id === normal[normal.length - 1]?.id);
        const h = hash(`${set.object}|${raw.ext_ref ?? id}`);
        const h2 = hash(`${raw.ext_ref ?? id}|2`);
        const win = tracked && !terminal ? slaWindow(set.object, path.length <= 1) : null;
        if (have.has(id)) {
          // Already has a timeline: rebase open SLA work that has aged out of its window,
          // and restart timers still anchored on an earlier creation date.
          if (!win) continue;
          const rec = anchors.get(id);
          if (!rec) continue;
          const createdAt = new Date(rec.created_at).getTime();
          if (stale(now - createdAt, win, h, h2)) rebase.push({ id, from: createdAt, to: now - placeIn(win, h, h2), updated: rec.updated_at });
          else if (timers.some((t) => t.entity_id === id && Math.abs(new Date(t.started_at).getTime() - createdAt) > 60000)) retimed.add(id);
          continue;
        }
        // Open work on an SLA-tracked object sits inside its SLA window; a months-old open enquiry is not a believable demo.
        if (win && stale(now - created, win, h, h2)) {
          created = now - placeIn(win, h, h2);
          moved.push({ id, created });
        } else if (!terminal && tracked && !win && now - created > 21 * DAY) {
          created = now - Math.floor((1 + 12 * h) * DAY);
          moved.push({ id, created });
        }
        const age = Math.max(Date.now() - created, HOUR);
        // First response within hours for most records; closing within days.
        const firstGap = Math.min(age * 0.5, (h2 < 0.85 ? 0.5 + 2.5 * h : 5 + 25 * h) * HOUR);
        const span = terminal ? Math.min(age * 0.9, (h2 < 0.85 ? 2 + 6 * h : 10 + 15 * h) * DAY) : Math.min(age * 0.8, Math.max(firstGap, age * (0.3 + 0.5 * h)));
        const times = path.map((_, i) => (i === 0 ? created : i === 1 ? created + firstGap : created + firstGap + ((span - firstGap) * (i - 1)) / Math.max(1, path.length - 2)));
        path.forEach((st, i) => events.push({
          record_id: id, status: st.name, title: st.label, event_type: 'milestone',
          occurred_at: new Date(Math.min(times[i], Date.now() - 60000)), changed_by: raw._owner ?? null, tenant_id: this.tenantId,
        }));
        stamps.push({ id, at: new Date(Math.min(times[times.length - 1] ?? created, Date.now() - 60000)) });
      }
      if (events.length) { await this.db.statusEvent.createMany({ data: events }); written += events.length; }
      const createdAt = new Map(moved.map((m) => [m.id, new Date(m.created)]));
      await pool(stamps, RECORD_CONCURRENCY, ({ id, at }) => this.db.record.update({ where: { id }, data: { updated_at: at, ...(createdAt.has(id) ? { created_at: createdAt.get(id) } : {}) } }));
      if (stamps.length) this.#count(`history.${set.object}`, stamps.length);
      for (const m of moved) retimed.add(m.id);
      // Rebase: the whole timeline is mapped linearly from [old created, now] onto
      // [new created, now], so stage order and today's real changes are kept.
      await pool(rebase, RECORD_CONCURRENCY, async ({ id, from, to, updated }) => {
        const span = Math.max(1, now - from);
        const map = (t) => new Date(Math.min(now - 60000, Math.max(to, to + ((new Date(t).getTime() - from) * (now - to)) / span)));
        const evs = await this.db.statusEvent.findMany({ where: { record_id: id }, select: { id: true, occurred_at: true } });
        for (const e of evs) await this.db.statusEvent.update({ where: { id: e.id }, data: { occurred_at: map(e.occurred_at) } });
        await this.db.record.update({ where: { id }, data: { created_at: new Date(to), updated_at: map(updated) } });
        retimed.add(id);
      });
      if (rebase.length) this.#count(`history_rebased.${set.object}`, rebase.length);
    }
    if (written) this.log(`      ${written} status events written`);
    await this.#restartSlaTimers([...retimed]);
  }

  /**
   * Start these records' SLA timers again from their (new) creation time: the
   * old timers are dropped and the SLA service builds them as it would for a
   * record created then — met from the status history, at risk or breached
   * against the clock, without firing escalations.
   */
  async #restartSlaTimers(ids) {
    if (!ids.length || !this.db.slaInstance?.deleteMany) return;
    const SlaService = require('./sla.service');
    const sla = new SlaService(this.db, { error: () => {}, warn: () => {}, info: () => {} });
    await this.db.slaInstance.deleteMany({ where: { entity_type: 'record', entity_id: { in: ids } } });
    await pool(ids, 4, (id) => sla.reconcileRecord(id).catch(() => false));
    this.#count('sla_timers_restarted', ids.length);
  }

  /**
   * Owners for demo records loaded without one: the pack's assignment rules
   * route them (as they would a live record), then anything still unowned
   * takes the owner of the record it belongs to (party, application, mandate…).
   * Reference data stays unowned — it is visible through view_scope.
   */
  async #ownership(pack) {
    const AssignmentService = require('./assignment.service');
    const assign = new AssignmentService(this.db);
    const reference = new Set(pack.referenceObjects ?? []);
    let n = 0;
    for (const name of new Set((pack.assignmentRules ?? []).map((r) => r.object))) {
      const objectId = this.ids.object[name];
      if (!objectId) continue;
      const recs = await this.db.record.findMany({ where: { object_id: objectId, assigned_to: null, deleted_at: null }, select: { id: true } });
      await pool(recs, 4, async (r) => { const who = await assign.assign(objectId, r.id, {}).catch(() => null); if (who) n += 1; });
    }
    for (let pass = 0; pass < 2; pass += 1) {
      for (const [name, def] of Object.entries(this.objectDefs ?? {})) {
        const objectId = this.ids.object[name];
        if (!objectId || reference.has(name)) continue;
        const lookups = (def.fields ?? []).filter((f) => f.type === 'lookup' && f.config?.target_object && !reference.has(f.config.target_object)).map((f) => f.name);
        if (!lookups.length) continue;
        const recs = await this.db.record.findMany({ where: { object_id: objectId, assigned_to: null, deleted_at: null }, select: { id: true } });
        if (!recs.length) continue;
        const vals = await this.db.recordFieldValue.findMany({ where: { record_id: { in: recs.map((r) => r.id) }, field_name: { in: lookups } }, select: { record_id: true, field_name: true, str_value: true } });
        const parentIds = [...new Set(vals.map((v) => Number(v.str_value)).filter((x) => Number.isInteger(x) && x > 0))];
        const parents = parentIds.length ? await this.db.record.findMany({ where: { id: { in: parentIds }, assigned_to: { not: null } }, select: { id: true, assigned_to: true } }) : [];
        const ownerOf = new Map(parents.map((p) => [p.id, p.assigned_to]));
        const updates = [];
        for (const r of recs) {
          for (const lk of lookups) {
            const v = vals.find((x) => x.record_id === r.id && x.field_name === lk);
            const o = v && ownerOf.get(Number(v.str_value));
            if (o) { updates.push({ id: r.id, o }); break; }
          }
        }
        await pool(updates, RECORD_CONCURRENCY, ({ id, o }) => this.db.record.update({ where: { id }, data: { assigned_to: o } }));
        n += updates.length;
      }
    }
    if (n) this.#count('owners_assigned', n);
  }

  /**
   * Activities, tasks, reminders, documents (with review status, share links
   * and e-signature requests), wall-crossings and the audit-chain baseline for
   * a demo tenant. The pack supplies `platformDemo(ctx)`, which reads the live
   * records and returns plain items; everything is written through the same
   * services the application uses and is idempotent by natural key.
   */
  async #platformDemo(build) {
    const recCache = {};
    const ctx = {
      now: Date.now(),
      records: async (name) => {
        if (recCache[name]) return recCache[name];
        const objectId = this.ids.object[name];
        if (!objectId) return (recCache[name] = []);
        const rows = await this.db.record.findMany({ where: { object_id: objectId, deleted_at: null }, select: { id: true, assigned_to: true, created_at: true, updated_at: true, pipeline_stage: { select: { name: true } } } });
        const vals = rows.length ? await this.db.recordFieldValue.findMany({ where: { record_id: { in: rows.map((r) => r.id) } }, select: { record_id: true, field_name: true, str_value: true } }) : [];
        const byId = new Map(rows.map((r) => [r.id, { id: r.id, owner: r.assigned_to, created_at: r.created_at, updated_at: r.updated_at, stage: r.pipeline_stage?.name ?? null, v: {} }]));
        for (const v of vals) { const r = byId.get(v.record_id); if (r) r.v[v.field_name] = v.str_value; }
        return (recCache[name] = [...byId.values()]);
      },
    };
    const items = await build(ctx);
    const T = this.tenantId;
    const of = (kind) => items.filter((i) => i.kind === kind);

    // Activities
    const acts = of('activity');
    if (acts.length) {
      const have = new Set((await this.db.activity.findMany({ where: { record_id: { in: [...new Set(acts.map((a) => a.record_id))] } }, select: { record_id: true, subject: true } })).map((a) => `${a.record_id}|${a.subject}`));
      const fresh = acts.filter((a) => !have.has(`${a.record_id}|${a.subject}`));
      if (fresh.length) await this.db.activity.createMany({ data: fresh.map(({ kind, ...a }) => ({ ...a, tenant_id: T })) });
      this.#count('activities', fresh.length);
    }
    // Tasks
    const tasks = of('task');
    if (tasks.length) {
      const have = new Set((await this.db.task.findMany({ where: { assigned_to: { in: [...new Set(tasks.map((t) => t.assigned_to))] } }, select: { record_id: true, title: true } })).map((t) => `${t.record_id}|${t.title}`));
      const fresh = tasks.filter((t) => !have.has(`${t.record_id}|${t.title}`));
      if (fresh.length) await this.db.task.createMany({ data: fresh.map(({ kind, ...t }) => ({ ...t, tenant_id: T })) });
      this.#count('tasks', fresh.length);
    }
    // Reminders
    const rems = of('reminder');
    if (rems.length) {
      const have = new Set((await this.db.reminder.findMany({ where: { employee_id: { in: [...new Set(rems.map((r) => r.employee_id))] } }, select: { employee_id: true, title: true } })).map((r) => `${r.employee_id}|${r.title}`));
      const fresh = rems.filter((r) => !have.has(`${r.employee_id}|${r.title}`));
      if (fresh.length) await this.db.reminder.createMany({ data: fresh.map(({ kind, ...r }) => ({ ...r, tenant_id: T })) });
      this.#count('reminders', fresh.length);
    }

    // Documents (PDF), then review status, share links and signatures.
    const docs = of('document');
    const docId = new Map();
    if (docs.length) {
      const DocumentService = require('./document.service');
      const { renderPdf } = require('../utils/pdf');
      const ds = new DocumentService(this.db);
      const existing = await this.db.document.findMany({ where: { entity_id: { in: [...new Set(docs.map((d) => d.entity_id))] }, deleted_at: null }, select: { id: true, entity_id: true, original_filename: true } });
      for (const e of existing) docId.set(`${e.entity_id}|${e.original_filename}`, e.id);
      const fresh = docs.filter((d) => !docId.has(`${d.entity_id}|${d.filename}`));
      await pool(fresh, 4, async (d) => {
        const buffer = renderPdf(d.pdf);
        const doc = await ds.upload({
          tenantId: T, buffer, filename: d.filename, mimeType: 'application/pdf', entityType: d.entity_type, entityId: d.entity_id,
          category: d.category, description: d.description ?? null, uploadedBy: d.uploaded_by ?? null, status: d.status ?? 'uploaded',
        });
        const extra = {};
        if (d.uploaded_at) extra.uploaded_at = d.uploaded_at;
        if (d.reviewed_by) { extra.reviewed_by = d.reviewed_by; extra.reviewed_at = d.reviewed_at ?? d.uploaded_at ?? new Date(); }
        if (d.rejection_reason) extra.rejection_reason = d.rejection_reason;
        if (Object.keys(extra).length) await this.db.document.update({ where: { id: doc.id }, data: extra });
        docId.set(`${d.entity_id}|${d.filename}`, doc.id);
      });
      this.#count('documents', fresh.length);
    }
    const DocumentShareService = require('./document-share.service');
    const shares = of('share').filter((s) => docId.has(s.doc));
    if (shares.length) {
      const svc = new DocumentShareService(this.db);
      const linked = new Set((await this.db.documentShareLink.findMany({ where: { document_id: { in: shares.map((s) => docId.get(s.doc)) } }, select: { document_id: true } })).map((l) => l.document_id));
      for (const s of shares) {
        const id = docId.get(s.doc);
        if (linked.has(id)) continue;
        const link = await svc.createLink(id, { expiresInDays: s.expiresInDays ?? 30, allowDownload: s.allowDownload ?? true, createdBy: s.created_by ?? null });
        for (let i = 0; i < (s.views ?? 0); i += 1) await svc.recordEvent(link, { type: i % 3 === 2 ? 'download' : 'view', durationSecs: 30 + ((i * 47) % 300) }).catch(() => {});
        this.#count('share_links');
      }
    }
    const sigs = of('signature').filter((s) => docId.has(s.doc));
    if (sigs.length) {
      const DocumentSignatureService = require('./document-signature.service');
      const DocumentService = require('./document.service');
      const svc = new DocumentSignatureService(this.db, new DocumentService(this.db));
      const have = new Set((await this.db.documentSignatureRequest.findMany({ where: { document_id: { in: sigs.map((s) => docId.get(s.doc)) } }, select: { document_id: true } })).map((r) => r.document_id));
      for (const s of sigs) {
        const id = docId.get(s.doc);
        if (have.has(id)) continue;
        const req = await svc.createRequest(id, { title: s.title, message: s.message ?? null, ordered: false, expiresInDays: 30, signers: s.signers, createdBy: s.created_by ?? null });
        const signatories = await this.db.documentSignatory.findMany({ where: { request_id: req.id }, orderBy: { order_index: 'asc' } });
        for (const sg of signatories.slice(0, s.signed ?? 0)) {
          const resolved = await svc.resolveByToken(sg.token);
          if (resolved) { await svc.recordView(resolved.signatory, null); await svc.sign(await svc.resolveByToken(sg.token), { type: 'typed', data: sg.name }).catch(() => {}); }
        }
        this.#count('signature_requests');
      }
    }

    // Wall-crossings through the segmentation service (four eyes, audited).
    const crossings = of('crossing');
    if (crossings.length) {
      const SegmentationService = require('./segmentation.service');
      const seg = new SegmentationService(this.db);
      const zones = Object.fromEntries((await this.db.barrierZone.findMany({ select: { id: true, code: true } })).map((z) => [z.code, z.id]));
      const have = new Set((await this.db.wallCrossing.findMany({ select: { zone_id: true, employee_id: true, reason: true } })).map((c) => `${c.zone_id}|${c.employee_id}|${c.reason}`));
      for (const c of crossings) {
        const zoneId = zones[c.zone];
        if (!zoneId || have.has(`${zoneId}|${c.employee_id}|${c.reason}`)) continue;
        const x = await seg.requestCrossing({ zoneId, employeeId: c.employee_id, reason: c.reason }, c.requested_by);
        if (c.decision) await seg.decideCrossing(x.id, { approve: c.decision === 'approve', validDays: c.valid_days ?? 30 }, c.decided_by);
        this.#count('wall_crossings');
      }
    }

    // Audit-chain baseline: the access set-up the installer created directly.
    const baseline = of('chain');
    if (baseline.length) {
      const AuditChainService = require('./audit-chain.service');
      const chain = new AuditChainService(this.db);
      const already = await this.db.auditChainEvent.count({ where: { action: 'baseline' } });
      if (!already) {
        for (const e of baseline) await chain.append({ entityType: e.entity_type, entityId: e.entity_id ?? null, action: 'baseline', actor: e.actor ?? null, payload: e.payload ?? null, sensitivity: e.sensitivity ?? 'sensitive', tenantId: T });
        this.#count('audit_chain_baseline', baseline.length);
      }
    }
  }

  /**
   * Demo records were loaded straight into their stages, so stage-triggered
   * approval workflows never ran for them. Run each one for the records
   * already in its stage, so approvers find real requests in their inbox.
   */
  async #pendingApprovals() {
    const WorkflowEngineService = require('./workflow.service');
    const engine = new WorkflowEngineService(this.db);
    engine.setRecordService?.(this.records);
    const wfs = await this.db.uiWorkflow.findMany({ where: { trigger_type: 'field_changed', is_active: true }, include: { steps: { orderBy: { order_index: 'asc' } } } });
    let n = 0;
    for (const wf of wfs) {
      if (wf.trigger_config?.field !== 'pipeline_stage_id' || !wf.steps.some((st) => st.step_type === 'approval')) continue;
      const gate = wf.steps.find((st) => st.step_type === 'condition');
      if (gate?.config?.field !== 'stage' || gate.config.operator !== 'eq') continue;
      const recs = await this.db.record.findMany({ where: { object_id: wf.object_id, deleted_at: null, pipeline_stage: { name: String(gate.config.value) } }, select: { id: true, object_id: true, assigned_to: true, created_by: true, tenant_id: true } });
      if (!recs.length) continue;
      const done = new Set((await this.db.workflowPendingStep.findMany({ where: { workflow_id: wf.id, record_id: { in: recs.map((r) => r.id) } }, select: { record_id: true } })).map((p) => p.record_id));
      for (const r of recs) {
        if (done.has(r.id)) continue;
        await engine.manualRun(wf.id, r, r.assigned_to ?? r.created_by ?? null).catch(() => {});
        n += 1;
      }
    }
    if (n) this.#count('approval_requests', n);
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
