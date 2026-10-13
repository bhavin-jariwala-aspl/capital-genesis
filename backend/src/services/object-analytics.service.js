'use strict';

const { ValidationError, NotFoundError } = require('../utils/errors');
const { typedValue } = require('./record-compute');

/**
 * Object analytics — dashboard numbers over any metadata object.
 *
 * Built-in analytics datasets are code (one function per chart) and report
 * sources are Prisma models, so neither can see an object an admin created in
 * the Builder. This turns a small declarative spec — stored on the dashboard
 * widget as its `data_source` — into a series or a single metric:
 *
 *   { type: 'object', object: 'loan_application',
 *     metric: 'count' | 'sum' | 'avg' | 'min' | 'max', field?: 'amount',
 *     group_by?: 'stage' | 'created_month' | '<field name>',
 *     filters?: [{ field, op, value }], limit?: 12 }
 *
 * Every read is scoped by the viewer's record access (owner/hierarchy, business
 * unit, information barrier), so a dashboard can never show a number built
 * from records the viewer could not open.
 */

const MAX_RECORDS = 20_000;
const CHUNK = 1_000;
const METRICS = new Set(['count', 'sum', 'avg', 'min', 'max']);
const OPS = new Set(['eq', 'neq', 'in', 'nin', 'gt', 'gte', 'lt', 'lte', 'contains', 'empty', 'notempty']);

function matches(actual, op, expected) {
  const blank = actual === null || actual === undefined || actual === '';
  const list = () => (Array.isArray(expected) ? expected : String(expected ?? '').split(',').map((v) => v.trim())).map((v) => String(v).toLowerCase());
  switch (op) {
    case 'eq': return String(actual ?? '').toLowerCase() === String(expected ?? '').toLowerCase();
    case 'neq': return String(actual ?? '').toLowerCase() !== String(expected ?? '').toLowerCase();
    case 'in': return list().includes(String(actual ?? '').toLowerCase());
    case 'nin': return !list().includes(String(actual ?? '').toLowerCase());
    case 'gt': return !blank && Number(actual) > Number(expected);
    case 'gte': return !blank && Number(actual) >= Number(expected);
    case 'lt': return !blank && Number(actual) < Number(expected);
    case 'lte': return !blank && Number(actual) <= Number(expected);
    case 'contains': return String(actual ?? '').toLowerCase().includes(String(expected ?? '').toLowerCase());
    case 'empty': return blank;
    case 'notempty': return !blank;
    default: return false;
  }
}

class ObjectAnalyticsService {
  /**
   * @param {import('@prisma/client').PrismaClient} prisma tenant-scoped client
   * @param {{ accessWhere: (viewer) => Promise<object> }} recordService
   */
  constructor(prisma, recordService) {
    this.db = prisma;
    this.records = recordService;
  }

  validate(spec = {}) {
    if (!spec.object) throw new ValidationError('object is required');
    const metric = spec.metric ?? 'count';
    if (!METRICS.has(metric)) throw new ValidationError(`metric must be one of ${[...METRICS].join(', ')}`);
    if (metric !== 'count' && !spec.field) throw new ValidationError(`${metric} needs a field`);
    for (const f of spec.filters ?? []) {
      if (!f?.field || !OPS.has(f.op)) throw new ValidationError(`Invalid filter ${JSON.stringify(f)}`);
    }
    return metric;
  }

  async run(spec, viewer) {
    const metric = this.validate(spec);
    const obj = await this.db.uiObject.findFirst({ where: { name: String(spec.object) }, select: { id: true, label: true } });
    if (!obj) throw new NotFoundError('Object');

    const access = await this.records.accessWhere(viewer);
    const anchors = await this.db.record.findMany({
      where:  { object_id: obj.id, deleted_at: null, ...access },
      select: { id: true, created_at: true, pipeline_stage: { select: { name: true, label: true, order_index: true } } },
      take:   MAX_RECORDS,
    });

    const groupBy = spec.group_by || null;
    const wanted = new Set((spec.filters ?? []).map((f) => f.field).filter((f) => f !== 'stage'));
    if (spec.field) wanted.add(spec.field);
    if (groupBy && groupBy !== 'stage' && groupBy !== 'created_month') wanted.add(groupBy);

    const values = new Map(anchors.map((a) => [a.id, {}]));
    if (wanted.size && anchors.length) {
      for (let i = 0; i < anchors.length; i += CHUNK) {
        const ids = anchors.slice(i, i + CHUNK).map((a) => a.id);
        const rows = await this.db.recordFieldValue.findMany({ where: { record_id: { in: ids }, field_name: { in: [...wanted] } } });
        for (const r of rows) values.get(r.record_id)[r.field_name] = typedValue(r);
      }
    }

    const optionLabels = await this.#optionLabels(obj.id, groupBy);
    // `stage` filters on the pipeline stage's API name.
    const valueOf = (a, field) => (field === 'stage' ? (a.pipeline_stage?.name ?? null) : values.get(a.id)[field]);
    const kept = anchors.filter((a) => (spec.filters ?? []).every((f) => matches(valueOf(a, f.field), f.op, f.value)));

    const keyOf = (a) => {
      if (groupBy === 'stage') return { key: a.pipeline_stage?.name ?? '—', label: a.pipeline_stage?.label ?? 'No stage', order: a.pipeline_stage?.order_index ?? 999 };
      if (groupBy === 'created_month') { const k = a.created_at.toISOString().slice(0, 7); return { key: k, label: k, order: k }; }
      const raw = values.get(a.id)[groupBy];
      const k = raw === null || raw === undefined || raw === '' ? '—' : String(raw);
      return { key: k, label: optionLabels.get(k) ?? (k === '—' ? 'Not set' : k), order: k };
    };

    const agg = (list) => {
      if (metric === 'count') return list.length;
      const nums = list.map((a) => Number(values.get(a.id)[spec.field])).filter((n) => Number.isFinite(n));
      if (!nums.length) return 0;
      if (metric === 'sum') return round(nums.reduce((s, n) => s + n, 0));
      if (metric === 'avg') return round(nums.reduce((s, n) => s + n, 0) / nums.length);
      return metric === 'min' ? Math.min(...nums) : Math.max(...nums);
    };

    if (!groupBy) {
      return { data: { value: agg(kept), label: spec.label ?? obj.label }, meta: { shape: 'metric', records: kept.length } };
    }

    const groups = new Map();
    for (const a of kept) {
      const k = keyOf(a);
      if (!groups.has(k.key)) groups.set(k.key, { ...k, items: [] });
      groups.get(k.key).items.push(a);
    }
    let rows = [...groups.values()].map((g) => ({ name: g.label, key: g.key, value: agg(g.items), _order: g.order }));
    rows.sort((x, y) => (groupBy === 'stage' || groupBy === 'created_month'
      ? (x._order > y._order ? 1 : x._order < y._order ? -1 : 0)
      : y.value - x.value));
    if (spec.limit) rows = rows.slice(0, Math.max(1, Number(spec.limit)));
    rows = rows.map(({ _order, ...r }) => r);
    return {
      data: rows,
      meta: { shape: 'series', xKey: 'name', series: [{ key: 'value', label: metric === 'count' ? 'Count' : `${metric} of ${spec.field}` }], records: kept.length },
    };
  }

  /** Option value → label for a select field, so groups read as the UI does. */
  async #optionLabels(objectId, fieldName) {
    if (!fieldName || fieldName === 'stage' || fieldName === 'created_month') return new Map();
    const f = await this.db.uiField.findFirst({ where: { object_id: objectId, name: fieldName }, select: { options: true } });
    const opts = Array.isArray(f?.options) ? f.options : [];
    return new Map(opts.map((o) => (typeof o === 'string' ? [o, o] : [String(o.value), o.label ?? String(o.value)])));
  }
}

function round(n) {
  return Math.round(n * 100) / 100;
}

module.exports = ObjectAnalyticsService;
module.exports.matches = matches;
