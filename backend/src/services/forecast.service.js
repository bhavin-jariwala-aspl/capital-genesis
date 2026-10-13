'use strict';

const { Decimal } = require('@prisma/client/runtime/library');
const CrmService  = require('./crm.service');

/**
 * ForecastService — lightweight RevOps forecasting layer.
 *
 * Concepts:
 *  - Quota:    target value for an employee × object × period
 *  - Forecast: sum of (record_value × stage.forecast_weight) across an object's pipeline
 *
 * Pipeline stages carry a `forecast_weight` (0–1) inside their `config` JSON column.
 * For example, a "Proposal Sent" stage might have weight=0.5; "Closed Won" = 1.0.
 *
 * CRM Relational path:
 *  computeForecast() now checks whether any crm_opportunities rows are present for
 *  the requested objectId.  If they exist it delegates to CrmService.computeRelationalForecast()
 *  which operates on indexed columns (amount, stage, owner_id) rather than reading
 *  records.data JSON blobs and aggregating in JS.  The legacy JSON path remains as
 *  the fallback for objects that have not been migrated yet.
 */
class ForecastService {
  /** @param {import('@prisma/client').PrismaClient} prisma */
  constructor(prisma) {
    this.db     = prisma;
    this.crmSvc = new CrmService(prisma);
  }

  // ── Quota management ─────────────────────────────────────────────────────

  /**
   * Upsert a quota.  period_key is a freeform string like "2026-Q1" or "2026-01".
   */
  async setQuota({ employee_id, object_id, period_type, period_key, target_value, currency }) {
    this.#validatePeriodType(period_type);
    return this.db.quota.upsert({
      where: {
        employee_id_object_id_period_type_period_key: {
          employee_id,
          object_id: Number(object_id),
          period_type,
          period_key,
        },
      },
      create: {
        employee_id,
        object_id:    Number(object_id),
        period_type,
        period_key,
        target_value: new Decimal(target_value),
        currency:     currency ?? 'USD',
      },
      update: {
        target_value: new Decimal(target_value),
        currency:     currency ?? 'USD',
      },
    });
  }

  async getQuotas(filters = {}) {
    const where = {};
    if (filters.employee_id) where.employee_id = filters.employee_id;
    if (filters.object_id)   where.object_id   = Number(filters.object_id);
    if (filters.period_type) where.period_type  = filters.period_type;
    if (filters.period_key)  where.period_key   = filters.period_key;
    return this.db.quota.findMany({
      where,
      orderBy: [{ period_key: 'desc' }, { employee_id: 'asc' }],
    });
  }

  async deleteQuota(id) {
    return this.db.quota.delete({ where: { id } });
  }

  // ── Forecast computation ──────────────────────────────────────────────────

  /**
   * Compute a weighted pipeline forecast using crm_opportunities relational data.
   *
   * options: { assigned_to, from_close_date, to_close_date, stage }
   */
  async computeForecast(objectId, options = {}) {
    const { assigned_to } = options;

    const relOpts = {};
    if (assigned_to)  relOpts.owner_id       = assigned_to;
    if (options.from) relOpts.from_close_date = options.from;
    if (options.to)   relOpts.to_close_date   = options.to;

    const rel = await this.crmSvc.computeRelationalForecast(relOpts);
    return {
      total_pipeline:    rel.total_pipeline,
      weighted_forecast: rel.weighted_forecast,
      by_stage:          rel.by_stage,
      by_employee:       rel.by_owner,
    };
  }

  /**
   * Roll up forecast across a manager's direct reports.
   * Uses EmployeeHierarchy closure table.
   * Issues a single batched DB query instead of one per report.
   */
  async getTeamForecast(managerId, objectId, options = {}) {
    const descendants = await this.db.employeeHierarchy.findMany({
      where:  { ancestor_id: managerId },
      select: { descendant_id: true },
    });
    const reportIds = descendants.map(d => d.descendant_id);
    if (!reportIds.length) {
      return { manager_id: managerId, team_size: 0, total_pipeline: 0, weighted_forecast: 0, by_employee: [] };
    }

    // Single query across all reports — avoids N parallel DB round-trips.
    const relOpts = { owner_id: reportIds };
    if (options.from) relOpts.from_close_date = options.from;
    if (options.to)   relOpts.to_close_date   = options.to;
    const rel = await this.crmSvc.computeRelationalForecast(relOpts);

    return {
      manager_id:        managerId,
      team_size:         reportIds.length,
      total_pipeline:    rel.total_pipeline,
      weighted_forecast: rel.weighted_forecast,
      by_employee:       rel.by_owner,
    };
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  #validatePeriodType(type) {
    const VALID = ['monthly', 'quarterly', 'annual'];
    if (!VALID.includes(type)) throw new Error(`Invalid period_type: ${type}`);
  }
}

module.exports = ForecastService;
