'use strict';

const { tenantContext } = require('../middleware/tenant-scope');
const { logger } = require('./logging.service');

/**
 * Daily refresh of time-dependent formulas.
 *
 * Formula fields are computed when a record is saved, which is exactly right
 * for most of them — but a formula that reads the date (`TODAY()`, `NOW()`,
 * `AGE(…)`) goes stale on a record nobody edits: "review due within 30 days",
 * "ID expires soon", "days to maturity", "overdue". Once a day this recomputes
 * every record of every object that has such a formula, writing only values
 * that actually changed (and, through the record service, the parents whose
 * roll-ups depend on them).
 *
 * Safe on several pods: a duplicate run rewrites nothing, because unchanged
 * values are skipped.
 */

const TIME_DEPENDENT = /\b(TODAY|NOW|AGE)\s*\(/i;

class FormulaRefreshService {
  /**
   * @param {import('@prisma/client').PrismaClient} prisma tenant-scoped client
   * @param {import('./record.service')} recordService
   */
  constructor(prisma, recordService, { concurrency = 4 } = {}) {
    this.db = prisma;
    this.records = recordService;
    this.concurrency = concurrency;
    this.lastDay = null;
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

  /** Run once per calendar day (UTC) unless forced. */
  async run({ force = false } = {}) {
    const day = new Date().toISOString().slice(0, 10);
    if (!force && this.lastDay === day) return { skipped: true };
    this.lastDay = day;
    const started = Date.now();
    let records = 0;
    let changed = 0;
    for (const [tenantId, objectIds] of await this.timeDependentObjects()) {
      await tenantContext.run({ tenantId }, async () => {
        for (const objectId of objectIds) {
          const recs = await this.db.record.findMany({ where: { object_id: objectId, deleted_at: null }, select: { id: true } });
          let i = 0;
          const workers = Array.from({ length: Math.min(this.concurrency, recs.length) }, async () => {
            while (i < recs.length) {
              const r = recs[i++];
              records += 1;
              try {
                if (await this.records.recompute(r.id)) changed += 1;
              } catch (err) {
                logger?.warn?.('[formula-refresh] recompute failed', { recordId: r.id, error: err.message });
              }
            }
          });
          await Promise.all(workers);
        }
      });
    }
    return { day, records, changed, ms: Date.now() - started };
  }
}

module.exports = FormulaRefreshService;
module.exports.TIME_DEPENDENT = TIME_DEPENDENT;
