'use strict';

const { decrypt } = require('./field-protection');

/**
 * Record compute — runs the formula engine against metadata records.
 *
 * Supplies the formula engine (services/formula.js) with what it needs to see
 * the world: the record's own values, dotted paths through lookup fields
 * (`party.date_of_birth`), LOOKUP/LATEST over another object's records (rate
 * tables, product masters, FX rates) and COUNT/SUM over child records.
 *
 * Every read goes through the tenant-scoped Prisma client, so a formula can
 * only ever see its own tenant's records. Lookups are capped and cached per
 * evaluation so a formula that runs on every save stays cheap.
 */

const { evaluate, truthy, isBlank, FormulaError } = require('./formula');

const MAX_LOOKUP_ROWS = 500;

/** Read the single meaningful value out of a record_field_values row. */
function typedValue(row) {
  if (!row) return null;
  if (row.json_value != null) return row.json_value;
  if (row.date_value != null) return row.date_value.toISOString().slice(0, 10);
  if (row.bool_value != null) return row.bool_value;
  if (row.num_value != null) return Number(row.num_value);
  return decrypt(row.str_value ?? null);
}

class RecordCompute {
  /**
   * @param {import('@prisma/client').PrismaClient} db tenant-scoped client
   * @param {(recordId:number) => Promise<object|null>} loadData full `data` of a record
   */
  constructor(db, loadData) {
    this.db = db;
    this.loadData = loadData;
  }

  /** Formula fields of an object in evaluation order. */
  async formulaFields(objectId) {
    return this.db.uiField.findMany({
      where:   { object_id: Number(objectId), is_active: true, field_type: 'formula' },
      select:  { name: true, data_type: true, config: true, order_index: true },
      orderBy: { order_index: 'asc' },
    });
  }

  /** A formula context over `values` (mutated in place as formulas resolve). */
  context(values, recordId = null, ownObjectId = null) {
    const recordCache = new Map();
    const objectCache = new Map();
    const fieldCache = new Map();

    // Field definition by object id + name (options, lookup target).
    const fieldDef = async (oid, name) => {
      const key = `${oid}:${name}`;
      if (!fieldCache.has(key)) {
        fieldCache.set(key, oid ? await this.db.uiField.findFirst({
          where: { object_id: Number(oid), name: String(name) }, select: { options: true, config: true },
        }).catch(() => null) : null);
      }
      return fieldCache.get(key);
    };

    const objectId = async (name) => {
      if (!objectCache.has(name)) {
        const obj = await this.db.uiObject.findFirst({ where: { name: String(name) }, select: { id: true } });
        objectCache.set(name, obj?.id ?? null);
      }
      return objectCache.get(name);
    };

    const recordData = async (id) => {
      const key = Number(id);
      if (!Number.isInteger(key) || key <= 0) return null;
      if (!recordCache.has(key)) recordCache.set(key, await this.loadData(key).catch(() => null));
      return recordCache.get(key);
    };

    const fieldOf = async (rid, field) => {
      const row = await this.db.recordFieldValue.findUnique({
        where: { record_id_field_name: { record_id: rid, field_name: String(field) } },
      }).catch(() => null);
      return typedValue(row);
    };

    return {
      resolve: async (name) => {
        // `id` is the record's own id (null while it is being created) — e.g.
        // LOOKUP('kyc_case', 'party', id, 'status', 'status_date').
        if (name === 'id') return recordId ?? null;
        const [head, ...rest] = String(name).split('.');
        let value = Object.prototype.hasOwnProperty.call(values, head) ? values[head] : null;
        // Each further segment hops through a lookup field to the linked record.
        for (const seg of rest) {
          const data = await recordData(value);
          value = data ? (data[seg] ?? null) : null;
        }
        return value;
      },

      // LABEL(field) / LABEL(party.segment): walk lookup fields to the object
      // that owns the last segment, then map the stored value to its label.
      optionLabel: async (path, value) => {
        const segs = String(path).split('.');
        let oid = ownObjectId;
        for (const seg of segs.slice(0, -1)) {
          const def = await fieldDef(oid, seg);
          oid = def?.config?.target_object ? await objectId(def.config.target_object) : null;
          if (!oid) return null;
        }
        const def = await fieldDef(oid, segs[segs.length - 1]);
        const opts = Array.isArray(def?.options) ? def.options : [];
        const hit = opts.find((o) => (typeof o === 'string' ? o : o?.value) === value);
        return hit ? (typeof hit === 'string' ? hit : hit.label ?? hit.value) : null;
      },

      lookup: async ({ object, matchField, matchValue, returnField, dateField }) => {
        const oid = await objectId(object);
        if (!oid || !returnField) return null;
        let ids;
        if (matchField) {
          if (isBlank(matchValue)) return null;
          const rows = await this.db.recordFieldValue.findMany({
            where:  { field_name: String(matchField), str_value: String(matchValue), record: { object_id: oid, deleted_at: null } },
            select: { record_id: true },
            take:   MAX_LOOKUP_ROWS,
          });
          ids = rows.map((r) => r.record_id);
        } else {
          const rows = await this.db.record.findMany({
            where: { object_id: oid, deleted_at: null }, select: { id: true }, take: MAX_LOOKUP_ROWS,
          });
          ids = rows.map((r) => r.id);
        }
        if (!ids.length) return null;
        let chosen = ids[0];
        if (dateField) {
          // Effective-dated tables: newest row already in effect wins.
          const today = new Date().toISOString().slice(0, 10);
          const dates = await this.db.recordFieldValue.findMany({
            where: { record_id: { in: ids }, field_name: String(dateField) },
          });
          const inEffect = dates
            .map((d) => ({ id: d.record_id, at: String(typedValue(d) ?? '') }))
            .filter((d) => d.at && d.at.slice(0, 10) <= today)
            .sort((a, b) => b.at.localeCompare(a.at));
          if (!inEffect.length) return null;
          chosen = inEffect[0].id;
        }
        // 'id' returns the matched record itself — e.g. find an existing party
        // by email: LOOKUP('party', 'email', email, 'id').
        if (returnField === 'id') return chosen;
        return fieldOf(chosen, returnField);
      },

      related: async ({ object, linkField, agg, field, whereField, whereValue }) => {
        if (!recordId) return agg === 'count' ? 0 : null;
        const oid = await objectId(object);
        if (!oid || !linkField) return agg === 'count' ? 0 : null;
        const links = await this.db.recordFieldValue.findMany({
          where:  { field_name: String(linkField), str_value: String(recordId), record: { object_id: oid, deleted_at: null } },
          select: { record_id: true },
          take:   MAX_LOOKUP_ROWS * 10,
        });
        let ids = links.map((l) => l.record_id);
        if (whereField && ids.length) {
          const rows = await this.db.recordFieldValue.findMany({
            where: { record_id: { in: ids }, field_name: String(whereField) },
          });
          const wanted = String(whereValue ?? '').toLowerCase();
          const keep = new Set(rows.filter((r) => String(typedValue(r) ?? '').toLowerCase() === wanted).map((r) => r.record_id));
          ids = ids.filter((id) => keep.has(id));
        }
        if (agg === 'count') return ids.length;
        if (!field || !ids.length) return 0;
        const rows = await this.db.recordFieldValue.findMany({
          where: { record_id: { in: ids }, field_name: String(field) },
        });
        return rows.reduce((sum, r) => sum + (Number(typedValue(r)) || 0), 0);
      },
    };
  }

  /**
   * Evaluate the object's formula fields over `values`, writing results back
   * into `values` in field order (so a later formula can use an earlier one).
   * A formula that errors yields null rather than blocking the save — the
   * Builder validates formulas when they are written.
   *
   * @returns {Promise<string[]>} names of the fields computed
   */
  async applyFormulas(objectId, values, recordId = null, fields = null) {
    // Like validation, an unreadable field catalogue degrades to "no formulas"
    // rather than failing the save.
    const formulas = fields ?? await this.formulaFields(objectId).catch(() => []);
    if (!formulas?.length) return [];
    const ctx = this.context(values, recordId, objectId);
    const computed = [];
    for (const f of formulas) {
      const expression = f.config?.expression;
      if (!expression) continue;
      let result;
      try {
        result = await evaluate(expression, ctx);
      } catch (err) {
        if (!(err instanceof FormulaError)) throw err;
        result = null;
      }
      if (typeof result === 'number' && f.config?.precision != null) {
        const p = 10 ** Number(f.config.precision);
        result = Math.round(result * p) / p;
      }
      values[f.name] = result;
      computed.push(f.name);
    }
    return computed;
  }

  /**
   * Evaluate `expression` validation rules. A rule is skipped while its field
   * is blank (presence is `required`'s job), matching every other rule type.
   *
   * @returns {Promise<{ errors: {field,message}[], warnings: string[] }>}
   */
  async expressionErrors(fields, values, recordId = null) {
    const errors = [];
    const warnings = [];
    const rules = [];
    for (const f of fields) {
      for (const v of f.validations ?? []) {
        if (v.validation_type === 'expression' && v.value) rules.push({ f, v });
      }
    }
    if (!rules.length) return { errors, warnings };
    const ctx = this.context(values, recordId);
    for (const { f, v } of rules) {
      if (isBlank(values[f.name])) continue;
      try {
        if (!truthy(await evaluate(v.value, ctx))) {
          errors.push({ field: f.name, message: v.error_message || `${f.label || f.name} does not meet its rule` });
        }
      } catch (err) {
        if (!(err instanceof FormulaError)) throw err;
        warnings.push(`${f.label || f.name}: formula rule is invalid (${err.message})`);
      }
    }
    return { errors, warnings };
  }
}

module.exports = { RecordCompute, typedValue };
