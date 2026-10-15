'use strict';

const { tenantContext } = require('../middleware/tenant-scope');
const { logger } = require('./logging.service');

/**
 * Refresh of formulas whose inputs change without their record being saved.
 *
 * Formula fields are computed when a record is saved, which is exactly right
 * for most of them — but two kinds go stale on a record nobody edits:
 *
 *  - a formula that reads the date (`TODAY()`, `NOW()`, `AGE(…)`): "review due
 *    within 30 days", "ID expires soon", "days to maturity", "overdue"; and
 *    `LATEST(…)` over an effective-dated table, whose answer changes on the day
 *    a future-dated row (a new PLR) comes into effect. Once a day this
 *    recomputes every record of every object that has such a formula.
 *  - a formula that reads a rate table with `LATEST('plr_rate', …)`: when a row
 *    of that table is added, changed or removed, `refreshReadersOf` recomputes
 *    the objects that read it (a product's "Rate from" follows a new PLR).
 *
 * Only values that actually changed are written (and, through the record
 * service, the parents whose roll-ups depend on them). Safe on several pods: a
 * duplicate run rewrites nothing, because unchanged values are skipped.
 */

const TIME_DEPENDENT = /\b(TODAY|NOW|AGE|LATEST)\s*\(/i;
const LATEST_OF = /\bLATEST\s*\(\s*['"]([A-Za-z0-9_]+)['"]/gi;

/** Names of the objects a formula reads with LATEST('<object>', …). */
function latestTargets(expression) {
  const out = new Set();
  for (const m of String(expression ?? '').matchAll(LATEST_OF)) out.add(m[1]);
  return out;
}

class FormulaRefreshService {
  /**
   * @param {import('@prisma/client').PrismaClient} prisma tenant-scoped client
   * @param {import('./record.service')} recordService
   */
  constructor(prisma, recordService, { concurrency = 4, debounceMs = 1500 } = {}) {
    this.db = prisma;
    this.records = recordService;
    this.concurrency = concurrency;
    this.debounceMs = debounceMs;
    this.lastDay = null;
    this.pending = new Map();
  }

  /** Objects (per tenant) whose formulas read the date. */
  async timeDependentObjects() {
    const fields = await this.db.uiField.findMany({
      where:  { field_type: 'formula', is_active: true },
      select: { object_id: true, tenant_id: true, config: true },
    });
    const byTenant = new Map();
    for (const f of fields) {
      if (!TIME_DEPENDENT.test(String(f.config?.expression ?? ''))) continue;
      if (!byTenant.has(f.tenant_id)) byTenant.set(f.tenant_id, new Set());
      byTenant.get(f.tenant_id).add(f.object_id);
    }
    return byTenant;
  }

  /** Recompute every live record of one object (call inside the tenant's context). */
  async #recomputeObject(objectId, tally) {
    const recs = await this.db.record.findMany({ where: { object_id: objectId, deleted_at: null }, select: { id: true } });
    let i = 0;
    const workers = Array.from({ length: Math.min(this.concurrency, recs.length) }, async () => {
      while (i < recs.length) {
        const r = recs[i++];
        tally.records += 1;
        try {
          if (await this.records.recompute(r.id)) tally.changed += 1;
        } catch (err) {
          logger?.warn?.('[formula-refresh] recompute failed', { recordId: r.id, error: err.message });
        }
      }
    });
    await Promise.all(workers);
  }

  /** Run once per calendar day (UTC) unless forced. */
  async run({ force = false } = {}) {
    const day = new Date().toISOString().slice(0, 10);
    if (!force && this.lastDay === day) return { skipped: true };
    this.lastDay = day;
    const started = Date.now();
    const tally = { records: 0, changed: 0 };
    for (const [tenantId, objectIds] of await this.timeDependentObjects()) {
      await tenantContext.run({ tenantId }, async () => {
        for (const objectId of objectIds) await this.#recomputeObject(objectId, tally);
      });
    }
    return { day, ...tally, ms: Date.now() - started };
  }

  /**
   * The objects of a tenant whose formulas read `objectName` with LATEST(…).
   * @returns {Promise<number[]>}
   */
  async readersOf(tenantId, objectName) {
    const fields = await this.db.uiField.findMany({
      where:  { tenant_id: Number(tenantId), field_type: 'formula', is_active: true },
      select: { object_id: true, config: true },
    });
    return [...new Set(fields.filter((f) => latestTargets(f.config?.expression).has(objectName)).map((f) => f.object_id))];
  }

  /** Whether any formula of the tenant reads this object with LATEST(…) — cached for a minute, as every save asks. */
  async #isLatestTarget(tenantId, objectId) {
    this.targets ??= new Map();
    let hit = this.targets.get(tenantId);
    if (!hit || hit.until < Date.now()) {
      const ids = await tenantContext.run({ tenantId }, async () => {
        const fields = await this.db.uiField.findMany({ where: { tenant_id: tenantId, field_type: 'formula', is_active: true }, select: { config: true } });
        const names = new Set();
        for (const f of fields) for (const n of latestTargets(f.config?.expression)) names.add(n);
        if (!names.size) return new Set();
        const objs = await this.db.uiObject.findMany({ where: { tenant_id: tenantId, name: { in: [...names] } }, select: { id: true } });
        return new Set(objs.map((o) => o.id));
      });
      hit = { until: Date.now() + 60_000, ids };
      this.targets.set(tenantId, hit);
    }
    return hit.ids.has(objectId);
  }

  /**
   * A record of `objectId` was saved or deleted: recompute the objects that read
   * its table with LATEST(…). Calls within `debounceMs` are coalesced, so an
   * import of many rows triggers one refresh.
   */
  async refreshReadersOf(tenantId, objectId) {
    if (!tenantId || !objectId) return null;
    if (!(await this.#isLatestTarget(Number(tenantId), Number(objectId)))) return null;
    const key = `${tenantId}:${objectId}`;
    const existing = this.pending.get(key);
    if (existing) return existing.promise;
    let resolve;
    const promise = new Promise((r) => { resolve = r; });
    const timer = setTimeout(async () => {
      this.pending.delete(key);
      const tally = { records: 0, changed: 0 };
      try {
        await tenantContext.run({ tenantId: Number(tenantId) }, async () => {
          const obj = await this.db.uiObject.findFirst({ where: { id: Number(objectId) }, select: { name: true } });
          if (!obj) return;
          const readers = (await this.readersOf(tenantId, obj.name)).filter((id) => id !== Number(objectId));
          for (const id of readers) await this.#recomputeObject(id, tally);
        });
      } catch (err) {
        logger?.warn?.('[formula-refresh] readers refresh failed', { objectId, error: err.message });
      }
      resolve(tally);
    }, this.debounceMs);
    timer.unref?.();
    this.pending.set(key, { promise, timer });
    return promise;
  }
}

module.exports = FormulaRefreshService;
module.exports.TIME_DEPENDENT = TIME_DEPENDENT;
module.exports.latestTargets = latestTargets;
