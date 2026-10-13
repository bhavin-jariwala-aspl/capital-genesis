'use strict';

const { tenantContext } = require('../middleware/tenant-scope');
const { NotFoundError } = require('../utils/errors');

/**
 * Public data feeds (PRD I-02) — read-only JSON a tenant's website can show:
 * fund NAVs, the FX rate board, the current lending rate. A feed is Builder
 * configuration on an object:
 *
 *   config.public_feed = {
 *     name:      'fx-rates',                 // URL name, unique in the tenant
 *     fields:    ['currency_code', 'buy_tt'],// the only fields ever exposed
 *     latest_by: { group: 'currency_code', order: 'rate_date' },  // optional: newest row per group
 *     sort:      { field: 'currency_code', dir: 'asc' },          // optional
 *     limit:     100,                                             // optional, ≤ 500
 *   }
 *
 *   GET /api/public/feeds/:workspace/:name
 *
 * Fields marked PII or encrypted are never published, even when listed.
 * Feeds read the typed EAV store, so they apply to Builder (custom) objects.
 */

const CACHE_MS = 60 * 1000;
const NAME = /^[a-z0-9][a-z0-9-]{0,59}$/;

const dateOnly = (d) => (d instanceof Date ? d.toISOString().slice(0, 10) : d);

function valueOf(row, type) {
  if (row.num_value != null) return row.num_value;
  if (row.bool_value != null) return row.bool_value;
  if (row.date_value != null) return type === 'datetime' ? row.date_value.toISOString() : dateOnly(row.date_value);
  if (row.json_value != null) return row.json_value;
  if (row.str_value == null) return null;
  if (['number', 'decimal', 'currency', 'percent', 'integer'].includes(type) && row.str_value !== '' && Number.isFinite(Number(row.str_value))) return Number(row.str_value);
  if (type === 'checkbox' || type === 'boolean') return row.str_value === 'true';
  return row.str_value;
}

const compare = (a, b) => {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  return a < b ? -1 : a > b ? 1 : 0;
};

class PublicFeedService {
  constructor(prisma, { now = () => Date.now() } = {}) {
    this.db = prisma;
    this.now = now;
    this.cache = new Map();
  }

  /** The feed's rows (cached for a minute). */
  async feed(slug, name) {
    if (!NAME.test(String(name ?? ''))) throw new NotFoundError('Feed');
    const key = `${slug}|${name}`;
    const hit = this.cache.get(key);
    if (hit && hit.until > this.now()) return hit.value;

    const tenant = await this.db.tenant.findUnique({ where: { slug: String(slug) }, select: { id: true, status: true } });
    if (!tenant || tenant.status !== 'active') throw new NotFoundError('Feed');
    const value = await tenantContext.run({ tenantId: tenant.id }, () => this.#build(name));
    this.cache.set(key, { until: this.now() + CACHE_MS, value });
    return value;
  }

  async #build(name) {
    const objects = await this.db.uiObject.findMany({ where: { is_active: true }, select: { id: true, name: true, config: true } });
    const obj = objects.find((o) => o.config?.public_feed?.name === name);
    if (!obj) throw new NotFoundError('Feed');
    const spec = obj.config.public_feed;

    const defs = await this.db.uiField.findMany({ where: { object_id: obj.id, name: { in: [].concat(spec.fields ?? []) } }, select: { name: true, field_type: true, config: true } });
    // Never publish personal or encrypted data, whatever the configuration says.
    const fields = defs.filter((f) => !f.config?.pii && !f.config?.encrypt);
    const typeOf = Object.fromEntries(fields.map((f) => [f.name, f.field_type]));
    const names = fields.map((f) => f.name);
    if (!names.length) return { feed: name, updated_at: new Date(this.now()).toISOString(), items: [] };

    const extra = [spec.latest_by?.group, spec.latest_by?.order, spec.sort?.field].filter((n) => n && !names.includes(n));
    const values = await this.db.recordFieldValue.findMany({
      where: { field_name: { in: [...names, ...extra] }, record: { object_id: obj.id, deleted_at: null } },
      select: { record_id: true, field_name: true, str_value: true, num_value: true, bool_value: true, date_value: true, json_value: true },
    });
    const byRecord = new Map();
    for (const v of values) {
      if (!byRecord.has(v.record_id)) byRecord.set(v.record_id, {});
      byRecord.get(v.record_id)[v.field_name] = valueOf(v, typeOf[v.field_name]);
    }
    let rows = [...byRecord.values()];

    if (spec.latest_by?.group && spec.latest_by?.order) {
      const { group, order } = spec.latest_by;
      const best = new Map();
      for (const r of rows) {
        const g = r[group];
        if (g == null) continue;
        if (!best.has(g) || compare(r[order], best.get(g)[order]) > 0) best.set(g, r);
      }
      rows = [...best.values()];
    }
    if (spec.sort?.field) {
      const dir = spec.sort.dir === 'desc' ? -1 : 1;
      rows.sort((a, b) => dir * compare(a[spec.sort.field], b[spec.sort.field]));
    }
    rows = rows.slice(0, Math.min(Number(spec.limit) || 100, 500));
    const items = rows.map((r) => Object.fromEntries(names.map((n) => [n, r[n] ?? null])));
    return { feed: name, updated_at: new Date(this.now()).toISOString(), items };
  }
}

module.exports = PublicFeedService;
