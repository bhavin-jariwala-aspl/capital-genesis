'use strict';

/**
 * Where is a field / object used?
 *
 * Builder metadata refers to fields and objects by their API *name* — formula
 * expressions, stage gates, validation rules, workflow triggers and steps,
 * assignment and scoring rules, dashboard widgets, object settings, lookups in
 * other objects. Renaming or deleting one silently breaks every such reference
 * (a renamed field makes its stage gate unpassable; a deleted lookup makes the
 * parent's roll-ups read zero), so the Builder asks here first and refuses with
 * the list — the way the leading CRMs block deleting a field a formula uses.
 *
 * Matching is textual on purpose (a name as a whole identifier, or as a quoted
 * JSON string), which can over-report a common name but never under-report.
 */

const esc = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const ident = (name) => new RegExp(`(^|[^A-Za-z0-9_.'"])${esc(name)}(?![A-Za-z0-9_])`);
const quoted = (name) => new RegExp(`["']${esc(name)}["']`);
const json = (v) => { try { return JSON.stringify(v ?? null); } catch { return ''; } };

/**
 * @param {object} db tenant-scoped Prisma client
 * @param {{ id:number, name:string, object_id:number }} field
 * @returns {Promise<string[]>} human-readable places that use the field
 */
async function fieldUsages(db, field) {
  const out = [];
  const { name } = field;
  const objectId = Number(field.object_id);
  const own = ident(name);
  const q = quoted(name);
  const obj = await db.uiObject.findUnique({ where: { id: objectId }, select: { name: true, config: true } }).catch(() => null);
  const objectName = obj?.name;

  // Formulas: this object's (`name`), other objects' through a lookup to this
  // object (`party.name`), and roll-ups over this object ('obj', 'name').
  const formulas = await db.uiField.findMany({
    where:  { field_type: 'formula', is_active: true },
    select: { id: true, name: true, label: true, object_id: true, config: true },
  }).catch(() => []);
  const lookupsHere = objectName ? await db.uiField.findMany({
    where:  { field_type: 'lookup', is_active: true, config: { path: '$.target_object', equals: objectName } },
    select: { name: true, object_id: true },
  }).catch(() => []) : [];
  for (const f of formulas) {
    if (f.id === field.id) continue;
    const expr = String(f.config?.expression ?? '');
    const viaLookup = lookupsHere.some((lk) => lk.object_id === f.object_id && expr.includes(`${lk.name}.${name}`));
    const rollup = objectName && quoted(objectName).test(expr) && q.test(expr);
    if ((f.object_id === objectId && own.test(expr)) || viaLookup || rollup) out.push(`formula field "${f.label || f.name}"`);
  }

  // Validation rules of this object's other fields (cross-field and formula rules).
  const rules = await db.uiValidation.findMany({
    where:  { field: { object_id: objectId }, NOT: { field_id: field.id } },
    select: { value: true, field: { select: { name: true, label: true } } },
  }).catch(() => []);
  for (const r of rules) {
    if (r.value === name || own.test(String(r.value ?? ''))) out.push(`validation rule on "${r.field?.label || r.field?.name}"`);
  }

  // Pipeline stage gates and the pipeline's mirrored status field.
  const pipelines = await db.uiPipeline.findMany({
    where:  { object_id: objectId },
    select: { label: true, name: true, config: true, stages: { select: { label: true, config: true } } },
  }).catch(() => []);
  for (const p of pipelines) {
    if (p.config?.status_field?.field === name) out.push(`pipeline "${p.label || p.name}" (status field)`);
    for (const s of p.stages ?? []) {
      const req = Array.isArray(s.config?.required_fields) ? s.config.required_fields : [];
      if (req.includes(name) || own.test(String(s.config?.entry_rule?.expression ?? ''))
        || s.config?.four_eyes?.field === name) out.push(`stage "${s.label}" entry rule`);
    }
  }

  // Object settings that name a field.
  const cfg = obj?.config ?? {};
  for (const key of ['title_field', 'business_unit_field', 'barrier_zone_field']) {
    if (cfg[key] === name) out.push(`object setting "${key}"`);
  }

  // Workflows on this object (trigger fields, conditions, step configs), and
  // other objects' steps that write through a lookup to it (`party.name`).
  const workflows = await db.uiWorkflow.findMany({
    select: { name: true, label: true, object_id: true, trigger_config: true, steps: { select: { config: true } } },
  }).catch(() => []);
  for (const w of workflows) {
    const text = json(w.trigger_config) + json((w.steps ?? []).map((s) => s.config));
    const mine = w.object_id === objectId && (q.test(text) || text.includes(`{{${name}}}`));
    const through = lookupsHere.some((lk) => lk.object_id === w.object_id && text.includes(`${lk.name}.${name}`));
    if (mine || through) out.push(`workflow "${w.label || w.name}"`);
  }

  // Assignment rule conditions on this object.
  const assignment = await db.assignmentRule.findMany({ where: { object_id: objectId }, select: { name: true, conditions: true } }).catch(() => []);
  for (const a of assignment) if (q.test(json(a.conditions))) out.push(`assignment rule "${a.name}"`);

  // Dashboard widgets reading this object.
  if (objectName) {
    const widgets = await db.uiDashboardWidget.findMany({ select: { title: true, data_source: true, config: true } }).catch(() => []);
    for (const w of widgets) {
      const text = json(w.data_source) + json(w.config);
      if (quoted(objectName).test(text) && q.test(text)) out.push(`dashboard widget "${w.title || 'untitled'}"`);
    }
  }

  return [...new Set(out)];
}

/**
 * @param {object} db tenant-scoped Prisma client
 * @param {{ id:number, name:string }} object
 * @returns {Promise<string[]>} places outside the object that use it by name
 */
async function objectUsages(db, object) {
  const out = [];
  const { name } = object;
  const q = quoted(name);
  const lookups = await db.uiField.findMany({
    where:  { field_type: 'lookup', config: { path: '$.target_object', equals: name }, NOT: { object_id: Number(object.id) } },
    select: { name: true, label: true, object: { select: { label: true, name: true } } },
  }).catch(() => []);
  for (const f of lookups) out.push(`lookup "${f.label || f.name}" on ${f.object?.label || f.object?.name}`);
  const formulas = await db.uiField.findMany({
    where:  { field_type: 'formula', NOT: { object_id: Number(object.id) } },
    select: { name: true, label: true, config: true },
  }).catch(() => []);
  for (const f of formulas) if (q.test(String(f.config?.expression ?? ''))) out.push(`formula field "${f.label || f.name}"`);
  const widgets = await db.uiDashboardWidget.findMany({ select: { title: true, data_source: true } }).catch(() => []);
  for (const w of widgets) if (q.test(json(w.data_source))) out.push(`dashboard widget "${w.title || 'untitled'}"`);
  return [...new Set(out)];
}

/** "used by A, B, C and 4 more" */
function describeUsages(list, max = 5) {
  const head = list.slice(0, max).join(', ');
  return list.length > max ? `${head} and ${list.length - max} more` : head;
}

module.exports = { fieldUsages, objectUsages, describeUsages };
