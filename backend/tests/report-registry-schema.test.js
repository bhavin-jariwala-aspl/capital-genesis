'use strict';

/**
 * Guards the report registry against the *real* Prisma schema.
 *
 * The engine's other tests use a Prisma double, which happily accepts any field
 * name — so a registry entry naming a column that does not exist passes every
 * unit test and then throws at runtime the moment a user picks that field.
 * (A field named after a column the model does not have shipped exactly that way once.)
 *
 * This reads Prisma's own DMMF, so it needs no database.
 */

const { Prisma } = require('@prisma/client');
const { SOURCES, MAX_RELATION_HOPS, allFields, getField } = require('../src/services/report-registry');

const models = new Map(Prisma.dmmf.datamodel.models.map((m) => [m.name, m]));
const byDelegate = new Map(
  [...models.values()].map((m) => [m.name[0].toLowerCase() + m.name.slice(1), m]),
);

const scalarsOf = (model) =>
  new Map(model.fields.filter((f) => f.kind === 'scalar' || f.kind === 'enum').map((f) => [f.name, f]));
const relationsOf = (model) =>
  new Map(model.fields.filter((f) => f.kind === 'object').map((f) => [f.name, f]));

/** Prisma scalar types each registry type may legitimately map onto. */
const TYPE_OK = {
  string: ['String'],
  enum: ['String'],
  number: ['Int', 'Float', 'Decimal', 'BigInt'],
  currency: ['Decimal', 'Float', 'Int'],
  percent: ['Int', 'Float', 'Decimal'],
  date: ['DateTime'],
  boolean: ['Boolean'],
};

/** The Prisma model a field's leaf column actually lives on. */
function modelAtPath(src, field) {
  const start = byDelegate.get(src.model);
  if (field.kind === 'own' || !field.kind) return start;
  if (field.kind === 'rollup') {
    const r = (src.rollups || []).find((x) => x.via === field.via);
    return byDelegate.get(r?.model);
  }
  let model = start;
  for (const hop of field.path || []) {
    const rel = relationsOf(model).get(hop);
    if (!rel) return null;
    model = models.get(rel.type);
  }
  return model;
}

describe.each(Object.values(SOURCES).map((s) => [s.key, s]))('registry source %s', (key, src) => {
  it('maps to a real Prisma model', () => {
    expect(byDelegate.get(src.model)).toBeDefined();
  });

  it('only declares own fields that exist as scalars on that model', () => {
    const scalars = scalarsOf(byDelegate.get(src.model));
    const missing = src.fields.map((f) => f.key).filter((k) => !scalars.has(k));
    expect(missing).toEqual([]);
  });

  it('names real scalars for its date, owner and title fields', () => {
    const scalars = scalarsOf(byDelegate.get(src.model));
    const missing = [src.dateField, src.ownerField, src.titleField]
      .filter(Boolean)
      .filter((k) => !scalars.has(k));
    expect(missing).toEqual([]);
  });

  /**
   * Walk the whole relation tree, not just the first hop. Every hop must be a real
   * **to-one** relation: a to-many hop would multiply rows and silently inflate
   * every measure on the source, which is the defect roll-ups exist to avoid.
   */
  it('only declares relation paths that exist and are to-one at every hop', () => {
    const problems = [];
    const walk = (model, rels, path) => {
      if (!model) return;
      const relations = relationsOf(model);
      for (const rel of rels || []) {
        const here = [...path, rel.via].join('.');
        const r = relations.get(rel.via);
        if (!r) { problems.push(`${here} — not a relation on ${model.name}`); continue; }
        if (r.isList) { problems.push(`${here} — is to-MANY; declare it as a rollup instead`); continue; }
        const target = models.get(r.type);
        const scalars = scalarsOf(target);
        for (const f of rel.fields) {
          if (!scalars.has(f.key)) problems.push(`${here}.${f.key} — not a scalar on ${target.name}`);
        }
        walk(target, rel.relations, [...path, rel.via]);
      }
    };
    walk(byDelegate.get(src.model), src.relations, []);
    expect(problems).toEqual([]);
  });

  it('never nests relation paths deeper than the engine will resolve', () => {
    const tooDeep = [];
    const walk = (rels, depth, path) => {
      for (const rel of rels || []) {
        const here = [...path, rel.via];
        if (depth + 1 > MAX_RELATION_HOPS) tooDeep.push(here.join('.'));
        walk(rel.relations, depth + 1, here);
      }
    };
    walk(src.relations, 0, []);
    expect(tooDeep).toEqual([]);
  });

  it('declares roll-ups against a real to-many relation, model and foreign key', () => {
    const model = byDelegate.get(src.model);
    const relations = relationsOf(model);
    const problems = [];
    for (const r of src.rollups || []) {
      const rel = relations.get(r.via);
      if (!rel) { problems.push(`${r.via} — no such relation on ${model.name}`); continue; }
      // A roll-up only makes sense over a collection; a to-one belongs in `relations`.
      if (!rel.isList) problems.push(`${r.via} — is to-ONE; declare it in relations instead`);

      const child = byDelegate.get(r.model);
      if (!child) { problems.push(`${r.via} — delegate "${r.model}" is not a Prisma model`); continue; }
      if (child.name !== rel.type) problems.push(`${r.via} — model "${r.model}" is not the ${rel.type} the relation points at`);

      const scalars = scalarsOf(child);
      if (!scalars.has(r.fk)) problems.push(`${r.via} — foreign key "${r.fk}" is not a column on ${child.name}`);
      for (const f of r.fields) {
        if (!scalars.has(f.key)) { problems.push(`${r.via}.${f.key} — not a column on ${child.name}`); continue; }
        // Folding many child rows into one parent value needs a stated aggregation.
        if (!['sum', 'avg', 'min', 'max'].includes(f.rollup)) {
          problems.push(`${r.via}.${f.key} — missing or invalid \`rollup\` aggregation`);
        }
        if (!['number', 'currency', 'percent'].includes(f.type)) {
          problems.push(`${r.via}.${f.key} — only numeric fields can be rolled up`);
        }
      }
    }
    expect(problems).toEqual([]);
  });

  it('does not reuse one name for both a relation and a roll-up', () => {
    // Both occupy the same dotted-key namespace, and the roll-up writer would
    // overwrite the selected relation on the row.
    const relNames = new Set((src.relations || []).map((r) => r.via));
    const clashes = (src.rollups || []).map((r) => r.via).filter((v) => relNames.has(v));
    expect(clashes).toEqual([]);
  });

  it('resolves every field it advertises, and advertises nothing hidden', () => {
    const advertised = allFields(src.key);
    const unresolvable = advertised.filter((f) => !getField(src.key, f.key)).map((f) => f.key);
    expect(unresolvable).toEqual([]);
    expect(advertised.filter((f) => f.hidden)).toEqual([]);
  });

  it('keeps retired fields resolvable so saved reports still run', () => {
    const hidden = allFields(src.key, { includeHidden: true }).filter((f) => f.hidden);
    for (const f of hidden) expect(getField(src.key, f.key)).not.toBeNull();
  });

  it('declares a type compatible with the underlying column, at any depth', () => {
    const mismatches = [];
    for (const f of allFields(src.key, { includeHidden: true })) {
      const owner = modelAtPath(src, f);
      const pf = owner?.fields.find((x) => x.name === f.leaf || x.name === f.key);
      if (!pf) continue;
      if (!(TYPE_OK[f.type] || []).includes(pf.type)) {
        mismatches.push(`${f.key}: registry "${f.type}" vs Prisma ${pf.type}`);
      }
    }
    expect(mismatches).toEqual([]);
  });

  it('offers aggregation only on numeric fields', () => {
    const wrong = allFields(src.key)
      .filter((f) => f.agg && !['number', 'currency', 'percent'].includes(f.type))
      .map((f) => f.key);
    expect(wrong).toEqual([]);
  });
});

describe('report templates against the real schema', () => {
  const { getTemplates } = require('../src/services/report-templates');

  it('every template field resolves to a real column', () => {
    const bad = [];
    for (const t of getTemplates()) {
      const src = SOURCES[t.config.source];
      if (!byDelegate.get(src?.model)) { bad.push(`${t.key}: unknown source`); continue; }

      const keys = [];
      for (const g of t.config.group_by || []) keys.push(g.field);
      for (const m of t.config.metrics || []) if (m.field) keys.push(m.field);
      for (const c of t.config.columns || []) if (typeof c === 'string') keys.push(c);
      const walk = (n) => { for (const c of n?.conditions || []) (c.conditions ? walk(c) : keys.push(c.field)); };
      walk(t.config.filters);
      for (const s of t.config.sort || []) if (!/^m\d+$/.test(s.key)) keys.push(s.key);

      for (const k of keys) {
        const f = getField(t.config.source, k);
        if (!f) { bad.push(`${t.key}: "${k}" not in registry`); continue; }
        // `$count` is a computed roll-up, not a column, so there is nothing to check.
        if (f.kind === 'rollup' && f.leaf === '$count') continue;
        const owner = modelAtPath(src, f);
        const column = f.kind === 'own' ? f.key : f.leaf;
        if (!owner || !scalarsOf(owner).has(column)) {
          bad.push(`${t.key}: "${k}" not a column on ${owner?.name ?? '?'}`);
        }
      }
    }
    expect(bad).toEqual([]);
  });
});
