'use strict';

/**
 * Genesis Capital vertical pack — static consistency.
 *
 * The pack is configuration, and configuration fails silently: a workflow
 * condition on a misspelt field never matches, an SLA on an unknown stage
 * never stops, a dashboard on a missing field shows zero. These tests resolve
 * every reference in the pack against the pack itself, so a typo fails here
 * rather than as an inert automation in a regulated process.
 */

const pack = require('../prisma/verticals/genesis-capital');
const { check, references } = require('../src/services/formula');

const objects = Object.fromEntries(pack.modules.flatMap((m) => m.objects).map((o) => [o.name, o]));
const fieldsOf = (name) => new Set((objects[name]?.fields ?? []).map((f) => f.name));
const stagesOf = (name) => new Set((objects[name]?.pipeline?.stages ?? []).map((s) => s.name));
const roles = new Set([...pack.roles.map((r) => r.name), 'super_admin', 'admin', 'manager', 'user']);
const WORKFLOW_CONTEXT = new Set(['id', 'stage', 'today', 'record_id', 'assigned_to', 'pipeline_stage_id', 'created_by']);
const FUNCTIONS_WITH_STRING_OBJECTS = /(LOOKUP|LATEST|COUNT_RELATED|SUM_RELATED)\(\s*'(\w+)'/g;

describe('Genesis pack — objects', () => {
  it('uses unique object and field names', () => {
    const names = pack.modules.flatMap((m) => m.objects).map((o) => o.name);
    expect(new Set(names).size).toBe(names.length);
    for (const o of Object.values(objects)) {
      const f = o.fields.map((x) => x.name);
      expect({ object: o.name, dupes: f.filter((n, i) => f.indexOf(n) !== i) }).toEqual({ object: o.name, dupes: [] });
    }
  });

  it('gives every object a title field that exists', () => {
    for (const o of Object.values(objects)) {
      expect({ o: o.name, ok: fieldsOf(o.name).has(o.config?.title_field) }).toEqual({ o: o.name, ok: true });
    }
  });

  it('points every lookup at an object in the pack', () => {
    for (const o of Object.values(objects)) {
      for (const f of o.fields.filter((x) => x.type === 'lookup')) {
        expect({ field: `${o.name}.${f.name}`, target: objects[f.config.target_object] ? 'ok' : f.config.target_object }).toEqual({ field: `${o.name}.${f.name}`, target: 'ok' });
      }
    }
  });

  it('writes formulas, rules and stage gates that parse and read real fields', () => {
    const problems = [];
    const checkExpr = (where, objectName, expression) => {
      const err = check(expression);
      if (err) { problems.push(`${where}: ${err}`); return; }
      for (const ref of references(expression)) {
        if (ref === 'id' || ref === 'null') continue;
        if (!fieldsOf(objectName).has(ref)) problems.push(`${where}: unknown field ${ref}`);
      }
      for (const m of expression.matchAll(FUNCTIONS_WITH_STRING_OBJECTS)) {
        if (!objects[m[2]]) problems.push(`${where}: unknown object ${m[2]}`);
      }
    };
    for (const o of Object.values(objects)) {
      for (const f of o.fields) {
        if (f.type === 'formula') checkExpr(`${o.name}.${f.name}`, o.name, f.config.expression);
        for (const v of f.validations ?? []) if (v.type === 'expression') checkExpr(`${o.name}.${f.name} rule`, o.name, v.value);
      }
      for (const st of o.pipeline?.stages ?? []) {
        if (st.config?.entry_rule) checkExpr(`${o.name} stage ${st.name}`, o.name, st.config.entry_rule.expression);
        for (const rf of st.config?.required_fields ?? []) if (!fieldsOf(o.name).has(rf)) problems.push(`${o.name} stage ${st.name}: unknown required field ${rf}`);
      }
      const sync = o.pipeline?.config?.status_field;
      if (sync) {
        const field = o.fields.find((f) => f.name === sync.field);
        const values = new Set((field?.options ?? []).map((x) => x.value));
        if (!field) problems.push(`${o.name} status_field: unknown field ${sync.field}`);
        for (const [stageName, value] of Object.entries(sync.map ?? {})) {
          if (!stagesOf(o.name).has(stageName)) problems.push(`${o.name} status_field: unknown stage ${stageName}`);
          if (field && !values.has(value)) problems.push(`${o.name} status_field: ${sync.field} has no option ${value}`);
        }
      }
    }
    expect(problems).toEqual([]);
  });

  it('lays out only fields the object has, and segments only on fields it has', () => {
    const problems = [];
    for (const o of Object.values(objects)) {
      for (const form of o.forms ?? []) {
        for (const e of form.fields) {
          const n = typeof e === 'string' ? e : e.field;
          if (!fieldsOf(o.name).has(n)) problems.push(`${form.name}: ${n}`);
        }
      }
      for (const d of o.dependencies ?? []) {
        if (!fieldsOf(o.name).has(d.source) || !fieldsOf(o.name).has(d.target)) problems.push(`${o.name} dependency ${d.source}→${d.target}`);
      }
      for (const key of ['business_unit_field', 'barrier_zone_field']) {
        if (o.config?.[key] && !fieldsOf(o.name).has(o.config[key])) problems.push(`${o.name} ${key}`);
      }
      if (o.config?.barrier_zone && !pack.barrierZones.some((z) => z.code === o.config.barrier_zone)) problems.push(`${o.name} zone`);
    }
    expect(problems).toEqual([]);
  });
});

describe('Genesis pack — automation', () => {
  it('references real fields, stages, objects, roles and templates in every workflow', () => {
    const problems = [];
    const emailNames = new Set(pack.emailTemplates.map((t) => t.name));
    const docNames = new Set(pack.documentTemplates.map((t) => t.name));
    for (const wf of pack.workflows) {
      const own = fieldsOf(wf.object);
      const keys = new Set(wf.steps.map((s) => s.key));
      for (const s of wf.steps) {
        const c = s.config ?? {};
        const at = `${wf.name}/${s.key}`;
        if (s.on_true && !keys.has(s.on_true)) problems.push(`${at}: on_true ${s.on_true}`);
        if (s.on_false && !keys.has(s.on_false)) problems.push(`${at}: on_false ${s.on_false}`);
        if (s.step_type === 'condition') {
          if (c.operator === 'expression') {
            if (check(c.value)) problems.push(`${at}: ${check(c.value)}`);
            for (const r of references(c.value)) if (!own.has(r) && !WORKFLOW_CONTEXT.has(r)) problems.push(`${at}: unknown field ${r}`);
          } else if (!own.has(c.field) && !WORKFLOW_CONTEXT.has(c.field)) problems.push(`${at}: unknown field ${c.field}`);
          if (c.field === 'stage' && !stagesOf(wf.object).has(c.value)) problems.push(`${at}: unknown stage ${c.value}`);
        }
        if (s.step_type === 'action') {
          if (c.field === 'stage') { if (!stagesOf(wf.object).has(c.value)) problems.push(`${at}: unknown stage ${c.value}`); }
          else if (String(c.field).includes('.')) {
            // Write-through: `lookup.field` on the linked record.
            const [head, tail] = String(c.field).split('.');
            const lk = objects[wf.object].fields.find((f) => f.name === head);
            if (lk?.type !== 'lookup') problems.push(`${at}: ${head} is not a lookup`);
            else if (!fieldsOf(lk.config.target_object).has(tail)) problems.push(`${at}: ${lk.config.target_object} has no ${tail}`);
          } else if (!own.has(c.field) && !['assigned_to', 'pipeline_stage_id'].includes(c.field)) problems.push(`${at}: unknown field ${c.field}`);
        }
        if (s.step_type === 'integration') {
          if (!(pack.integrations ?? []).some((i) => i.name === c.integration)) problems.push(`${at}: integration ${c.integration}`);
          for (const f of Object.keys(c.field_map ?? {})) if (!own.has(f)) problems.push(`${at}: field_map ${f}`);
        }
        if (s.step_type === 'create_record') {
          if (!objects[c.object]) { problems.push(`${at}: unknown object ${c.object}`); continue; }
          const target = fieldsOf(c.object);
          for (const f of Object.keys(c.fields)) if (!target.has(f)) problems.push(`${at}: ${c.object} has no ${f}`);
          for (const v of Object.values(c.fields)) for (const m of String(v).matchAll(/\{\{(\w+)\}\}/g)) if (!own.has(m[1]) && !WORKFLOW_CONTEXT.has(m[1])) problems.push(`${at}: placeholder ${m[1]}`);
          if (c.link_field && !target.has(c.link_field)) problems.push(`${at}: link_field ${c.link_field}`);
          if (c.store_as && !own.has(c.store_as)) problems.push(`${at}: store_as ${c.store_as}`);
          if (c.stage && !stagesOf(c.object).has(c.stage)) problems.push(`${at}: stage ${c.stage}`);
        }
        if (s.step_type === 'approval' || s.step_type === 'notification') {
          if (c.role && !roles.has(c.role)) problems.push(`${at}: role ${c.role}`);
          if (c.field && !own.has(c.field) && !WORKFLOW_CONTEXT.has(c.field)) problems.push(`${at}: recipient field ${c.field}`);
        }
        if (s.step_type === 'approval' && !c.exclude_actor) problems.push(`${at}: approval without maker-checker`);
        if (s.step_type === 'send_email') {
          if (!emailNames.has(c.template)) problems.push(`${at}: email template ${c.template}`);
          if (c.to_field && !own.has(c.to_field)) problems.push(`${at}: to_field ${c.to_field}`);
          if (c.language_field && !own.has(c.language_field)) problems.push(`${at}: language_field ${c.language_field}`);
        }
        if (s.step_type === 'generate_document' && !docNames.has(c.template)) problems.push(`${at}: document template ${c.template}`);
      }
    }
    expect(problems).toEqual([]);
  });

  it('pairs every English email template with a French one', () => {
    const names = new Set(pack.emailTemplates.map((t) => t.name));
    for (const t of pack.emailTemplates.filter((x) => x.language === 'en')) expect(names.has(`${t.name}_fr`)).toBe(true);
  });

  it('routes and times only on real fields and stages', () => {
    const problems = [];
    const staff = new Set(pack.staff.map((s) => s.employee_id));
    for (const r of pack.assignmentRules) {
      for (const c of r.conditions ?? []) if (!fieldsOf(r.object).has(c.field)) problems.push(`${r.name}: ${c.field}`);
      for (const e of [...(r.pool ?? []), r.fallback].filter(Boolean)) if (!staff.has(e)) problems.push(`${r.name}: employee ${e}`);
    }
    for (const p of pack.slaPolicies) {
      const st = stagesOf(p.object);
      for (const n of [...(p.config.first_response_stages ?? []), ...(p.config.closed_stages ?? []), ...(p.config.canceled_stages ?? []), ...(p.pause_stages ?? [])]) if (!st.has(n)) problems.push(`${p.name}: stage ${n}`);
      if (!(p.config.closed_stages ?? []).length) problems.push(`${p.name}: no closed stage`);
      for (const c of p.conditions ?? []) if (!fieldsOf(p.object).has(c.field)) problems.push(`${p.name}: condition ${c.field}`);
      if (p.config.dimension_field && !fieldsOf(p.object).has(p.config.dimension_field)) problems.push(`${p.name}: dimension`);
    }
    for (const p of pack.permissions) {
      if (!objects[p.object]) problems.push(`permission object ${p.object}`);
      for (const r of [].concat(p.roles)) if (!roles.has(r)) problems.push(`permission role ${r}`);
    }
    expect(problems).toEqual([]);
  });

  it('never creates a custom role at admin level or above', () => {
    for (const r of pack.roles) expect(r.level).toBeGreaterThanOrEqual(4);
  });
});

describe('Genesis pack — content', () => {
  it('builds wizards, dashboards and public forms from real fields and forms', () => {
    const problems = [];
    for (const w of pack.wizards) for (const s of w.steps) for (const e of s.fields) { const f = typeof e === 'string' ? e : e.field; if (!fieldsOf(w.object).has(f)) problems.push(`${w.name}/${s.name}: ${f}`); }
    for (const d of pack.dashboards) {
      for (const w of d.widgets) {
        const o = w.data.object;
        if (!objects[o]) { problems.push(`${d.name}: object ${o}`); continue; }
        if (w.data.field && !fieldsOf(o).has(w.data.field)) problems.push(`${d.name}/${w.title}: field ${w.data.field}`);
        if (w.data.group_by && !['stage', 'created_month'].includes(w.data.group_by) && !fieldsOf(o).has(w.data.group_by)) problems.push(`${d.name}/${w.title}: group_by ${w.data.group_by}`);
        for (const f of w.data.filters ?? []) if (f.field !== 'stage' && !fieldsOf(o).has(f.field)) problems.push(`${d.name}/${w.title}: filter ${f.field}`);
      }
    }
    expect(pack.dashboards.filter((d) => d.is_default)).toHaveLength(1);
    const forms = new Map(Object.values(objects).flatMap((o) => (o.forms ?? []).map((f) => [f.name, o.name])));
    for (const pf of pack.publicForms) {
      if (!forms.has(pf.form)) { problems.push(`public form ${pf.form}`); continue; }
      const own = fieldsOf(forms.get(pf.form));
      for (const f of [pf.settings.consent_field, ...(pf.settings.result_fields ?? [])].filter(Boolean)) if (!own.has(f)) problems.push(`${pf.form}: ${f}`);
      for (const [f, allowed] of Object.entries(pf.settings.field_options ?? {})) {
        const def = objects[forms.get(pf.form)]?.fields.find((x) => x.name === f);
        const values = new Set((def?.options ?? []).map((o) => o.value));
        if (!def) problems.push(`${pf.form}: field_options ${f}`);
        else for (const v of allowed) if (!values.has(v)) problems.push(`${pf.form}: ${f} has no option ${v}`);
      }
    }
    expect(problems).toEqual([]);
  });

  it('files document checklists under known categories', () => {
    const codes = new Set(pack.documentCategories.map((c) => c.code));
    for (const l of pack.documentChecklists) for (const i of l.items) expect(codes.has(i.category_code)).toBe(true);
  });

  it('seeds master data the formulas depend on', () => {
    const md = Object.fromEntries(pack.masterData.map((m) => [m.object, m.records]));
    expect(md.plr_rate.length).toBeGreaterThan(0);
    const routed = new Set(md.product_routing.map((r) => r.product_code));
    for (const p of md.financial_product) expect(routed.has(p.code)).toBe(true);
    for (const m of pack.masterData) for (const r of m.records) for (const k of Object.keys(r)) if (!k.startsWith('_')) expect(`${m.object}.${fieldsOf(m.object).has(k) ? 'ok' : k}`).toBe(`${m.object}.ok`);
  });
});

describe('Genesis pack — deep references', () => {
  const { compile } = require('../src/services/formula');
  const fieldDef = (o, n) => objects[o]?.fields.find((f) => f.name === n);
  // The object a field's value points at: a lookup, or a formula that is a
  // pure path through lookups (e.g. `share_class.fund`).
  const targetOf = (o, n, depth = 0) => {
    const f = fieldDef(o, n);
    if (!f || depth > 4) return null;
    if (f.type === 'lookup') return f.config.target_object;
    if (f.type === 'formula' && /^[a-z_][\w.]*$/i.test(f.config.expression)) return pathEnd(o, f.config.expression, depth + 1, true);
    return null;
  };
  const pathEnd = (o, path, depth = 0, wantTarget = false, problems = null, where = '') => {
    const segs = path.split('.');
    let cur = o;
    for (let i = 0; i < segs.length; i += 1) {
      if (!fieldDef(cur, segs[i])) { problems?.push(`${where}: ${cur} has no ${segs[i]} (in ${path})`); return null; }
      if (i < segs.length - 1) {
        const t = targetOf(cur, segs[i], depth);
        if (!t) { problems?.push(`${where}: ${cur}.${segs[i]} is not a lookup (in ${path})`); return null; }
        cur = t;
      } else if (wantTarget) return targetOf(cur, segs[i], depth);
    }
    return null;
  };

  it('resolves every dotted path and every LOOKUP / related-object field', () => {
    const problems = [];
    for (const o of Object.values(objects)) {
      for (const f of o.fields) {
        if (f.type !== 'formula') continue;
        (function walk(n) {
          if (!n) return;
          if (n.k === 'ref' && n.name.includes('.')) pathEnd(o.name, n.name, 0, false, problems, `${o.name}.${f.name}`);
          if (n.k === 'call') {
            const fn = String(n.name).toUpperCase();
            const lit = (i) => (n.args?.[i]?.k === 'lit' ? n.args[i].v : undefined);
            const idx = { LOOKUP: [1, 3, 4], LATEST: [1, 2], COUNT_RELATED: [1, 2], SUM_RELATED: [1, 2, 3] }[fn];
            if (idx && objects[lit(0)]) {
              for (const i of idx) { const v = lit(i); if (typeof v === 'string' && v !== 'id' && !fieldDef(lit(0), v)) problems.push(`${o.name}.${f.name}: ${fn}(${lit(0)}) has no ${v}`); }
            }
            (n.args ?? []).forEach(walk);
          }
          if (n.k === 'bin') { walk(n.l); walk(n.r); }
          if (n.k === 'neg' || n.k === 'not') walk(n.e);
        }(compile(f.config.expression)));
      }
    }
    expect(problems).toEqual([]);
  });

  it('builds demo data from real fields, options and earlier references', () => {
    const problems = [];
    const seen = {};
    for (const set of [...pack.masterData, ...pack.demo]) {
      if (set.recompute) { for (const n of [].concat(set.recompute)) if (!objects[n]) problems.push(`recompute ${n}`); continue; }
      const o = objects[set.object];
      if (!o) { problems.push(`unknown object ${set.object}`); continue; }
      seen[set.object] = seen[set.object] ?? new Set();
      for (const r of set.records) {
        for (const [k, v] of Object.entries(r)) {
          if (k.startsWith('_')) continue;
          const f = fieldDef(set.object, k);
          if (!f) { problems.push(`${set.object}: unknown field ${k}`); continue; }
          if (f.type === 'formula') problems.push(`${set.object}: writes formula ${k}`);
          if (f.type === 'select' && v != null && !f.options.some((x) => x.value === v)) problems.push(`${set.object}.${k}: '${v}' is not an option`);
          if (typeof v === 'string' && v.startsWith('@')) {
            const m = /^@(\w+):(\w+)=(.+)$/.exec(v);
            if (!m || f.type !== 'lookup' || f.config.target_object !== m[1]) problems.push(`${set.object}.${k}: bad reference ${v}`);
            else if (!seen[m[1]]?.has(`${m[2]}=${m[3]}`)) problems.push(`${set.object}.${k}: ${v} is not defined earlier`);
          }
        }
        for (const [k, v] of Object.entries(r)) if (!k.startsWith('_') && v != null) seen[set.object].add(`${k}=${v}`);
        if (r._stage && !stagesOf(set.object).has(r._stage)) problems.push(`${set.object}: stage ${r._stage}`);
      }
    }
    expect(problems).toEqual([]);
  });

  it('keys every demo row uniquely by ext_ref', () => {
    for (const set of pack.demo.filter((x) => !x.recompute)) {
      const keys = set.records.map((r) => r.ext_ref);
      expect({ object: set.object, missing: keys.filter((k) => !k).length, dupes: keys.filter((k, i) => keys.indexOf(k) !== i) }).toEqual({ object: set.object, missing: 0, dupes: [] });
    }
  });

  it('fills every template placeholder from a field of the template\'s object', () => {
    const problems = [];
    // Values the email step adds itself (upload_link: a signed client upload link).
    // first_name / display_name: added per recipient by the email_list step.
    const ctx = new Set(['today', 'id', 'stage', 'record_id', 'upload_link', 'first_name', 'display_name']);
    const scan = (where, object, text) => {
      for (const m of String(text ?? '').matchAll(/\{\{(\w+)\}\}/g)) if (!ctx.has(m[1]) && !fieldDef(object, m[1])) problems.push(`${where}: {{${m[1]}}}`);
    };
    for (const t of pack.emailTemplates) if (t.object) for (const part of [t.subject, t.body_html, t.body_text]) scan(`email ${t.name}`, t.object, part);
    for (const t of pack.documentTemplates) if (t.entity_type) scan(`document ${t.name}`, t.entity_type, t.body);
    expect([...new Set(problems)]).toEqual([]);
  });

  it('exposes only real fields on the portal, linked through a lookup', () => {
    const problems = [];
    for (const o of Object.values(objects)) {
      for (const [realm, cfg] of Object.entries(o.config?.portal ?? {})) {
        const at = `${o.name}.portal.${realm}`;
        const link = fieldDef(o.name, cfg.link);
        if (link?.type !== 'lookup') problems.push(`${at}: link ${cfg.link} is not a lookup`);
        else if (link.config.target_object !== (realm === 'client' ? 'party' : 'introducer')) problems.push(`${at}: link points at ${link.config.target_object}`);
        for (const f of [...(cfg.fields ?? []), ...(cfg.create?.fields ?? []), ...Object.keys(cfg.create?.defaults ?? {})]) if (!fieldDef(o.name, f)) problems.push(`${at}: ${f}`);
        for (const [f, target] of Object.entries(cfg.create?.lookups ?? {})) if (fieldDef(o.name, f)?.config?.target_object !== target) problems.push(`${at}: lookup ${f}`);
        if (cfg.create?.stage && !stagesOf(o.name).has(cfg.create.stage)) problems.push(`${at}: stage ${cfg.create.stage}`);
        if (cfg.consent_gate && !fieldDef(o.name, cfg.consent_gate)) problems.push(`${at}: consent_gate`);
        for (const a of cfg.row_actions ?? []) {
          const t = objects[a.object];
          if (!t?.config?.portal?.[realm]?.link) { problems.push(`${at}: action ${a.key} targets ${a.object}, not a ${realm} section`); continue; }
          for (const f of [...(a.fields ?? []), ...Object.keys(a.defaults ?? {}), ...Object.keys(a.prefill ?? {})]) if (!fieldDef(a.object, f)) problems.push(`${at}: action ${a.key} field ${f}`);
          for (const f of Object.values(a.prefill ?? {})) if (!fieldDef(o.name, f)) problems.push(`${at}: action ${a.key} prefill from ${f}`);
          if (a.stage && !stagesOf(a.object).has(a.stage)) problems.push(`${at}: action ${a.key} stage ${a.stage}`);
        }
      }
    }
    expect(problems).toEqual([]);
  });

  it('installs a sandbox integration for every system a workflow calls', () => {
    const { SIMULATOR_PROVIDERS } = require('../src/services/integration-simulators');
    for (const i of pack.integrations) expect(SIMULATOR_PROVIDERS).toContain(i.config.provider);
  });
});
