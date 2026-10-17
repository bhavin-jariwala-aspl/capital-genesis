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
  /**
   * @param {object} [recordSvc] RecordService — when given, Builder objects are
   *   forecast from their own records (read with the viewer's access scope).
   */
  constructor(prisma, recordSvc = null) {
    this.db        = prisma;
    this.crmSvc    = new CrmService(prisma);
    this.recordSvc = recordSvc;
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
  async computeForecast(objectId, options = {}, viewer = null) {
    const { assigned_to } = options;

    // Builder objects (e.g. a pack's fs_opportunity) keep their values on the
    // record, not in crm_opportunities: forecast them from their own records.
    const obj = await this.#builderObject(objectId);
    if (obj) {
      return this.#recordForecast(obj, options, viewer, assigned_to ? { owners: [assigned_to] } : {});
    }

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
  async getTeamForecast(managerId, objectId, options = {}, viewer = null) {
    const descendants = await this.db.employeeHierarchy.findMany({
      where:  { ancestor_id: managerId },
      select: { descendant_id: true },
    });
    const reportIds = descendants.map(d => d.descendant_id);
    if (!reportIds.length) {
      return { manager_id: managerId, team_size: 0, total_pipeline: 0, weighted_forecast: 0, by_employee: [] };
    }

    const obj = await this.#builderObject(objectId);
    if (obj) {
      const f = await this.#recordForecast(obj, options, viewer, { owners: reportIds });
      return {
        manager_id: managerId, team_size: reportIds.length,
        total_pipeline: f.total_pipeline, weighted_forecast: f.weighted_forecast, by_employee: f.by_employee,
      };
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

  // ── Builder-object forecast ───────────────────────────────────────────────

  /**
   * The object to forecast from its own records, or null for the legacy
   * crm_opportunities path (the CRM `opportunity` object, an unknown id, or no
   * record service to read records through).
   */
  async #builderObject(objectId) {
    if (!this.recordSvc || !objectId || typeof this.db.uiObject?.findUnique !== 'function') return null;
    const obj = await this.db.uiObject.findUnique({
      where: { id: Number(objectId) }, select: { id: true, name: true, config: true },
    }).catch(() => null);
    if (!obj || obj.name === 'opportunity') return null;
    return obj;
  }

  /**
   * Which field plays each forecast role. `object.config.forecast` wins
   * ({ amount_field, probability_field, close_field, owner_field, category_field }),
   * then the request's `value_field`, then conventional names, then the field type.
   */
  static resolveRoles(fields, config = {}, options = {}) {
    const byName = new Map(fields.map((f) => [f.name, f]));
    const fc = config?.forecast ?? {};
    const pick = (explicit, names, type) => {
      for (const n of [explicit, ...names]) if (n && byName.has(n)) return n;
      return type ? (fields.find((f) => (Array.isArray(type) ? type : [type]).includes(f.field_type))?.name ?? null) : null;
    };
    return {
      // A base-currency amount (amount_mur, amount_base…) adds up across currencies; the raw amount may not.
      amount: pick(fc.amount_field, [
        ...fields.map((f) => f.name).filter((n) => /^amount_(base|[a-z]{3})$/.test(n) && !['amount_due', 'amount_paid'].includes(n)),
        options.value_field, 'amount', 'deal_value', 'value', 'expected_value',
      ], 'currency'),
      probability: pick(fc.probability_field, ['probability', 'win_probability', 'probability_pct'], null),
      close: pick(fc.close_field, ['expected_close', 'close_date', 'expected_close_date', 'expected_close_on'], null),
      owner: pick(fc.owner_field, ['owner_rm', 'owner_id', 'owner'], null),
      category: pick(fc.category_field, ['forecast_category'], null),
    };
  }

  async #recordForecast(obj, options, viewer, { owners } = {}) {
    const fields = await this.db.uiField.findMany({
      where: { object_id: obj.id, is_active: true }, select: { name: true, field_type: true, label: true },
    });
    const roles = ForecastService.resolveRoles(fields, obj.config ?? {}, options);
    // Weights from the object's stages (config.forecast_weight); closed stages are not pipeline.
    const stages = await this.db.uiPipelineStage.findMany({
      where: { pipeline: { object_id: obj.id } }, select: { id: true, name: true, label: true, config: true },
    }).catch(() => []);
    const stageById = new Map((stages ?? []).map((s) => [s.id, s]));
    const { isTerminalStage } = require('./assignment.service');

    // Read through the record service so the viewer's access scope applies.
    const records = await this.recordSvc.getRecords(obj.id, null, viewer, {});
    const from = options.from ? new Date(options.from).getTime() : null;
    const to   = options.to   ? new Date(options.to).getTime()   : null;
    const ownerSet = owners?.length ? new Set(owners.map(String)) : null;
    const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };

    let totalPipeline = 0;
    let weightedForecast = 0;
    const byStage = {};
    const byOwner = {};
    const byCategory = {};
    let count = 0;
    for (const r of records) {
      const data = r.data ?? {};
      const stage = stageById.get(r.pipeline_stage_id) ?? r.pipeline_stage ?? null;
      if (stage && isTerminalStage(stage)) continue;
      if (roles.category && String(data[roles.category] ?? '') === 'closed') continue;
      const owner = (roles.owner && data[roles.owner]) || r.assigned_to || 'unassigned';
      if (ownerSet && !ownerSet.has(String(owner))) continue;
      if ((from != null || to != null) && roles.close) {
        const t = data[roles.close] ? new Date(data[roles.close]).getTime() : NaN;
        if (Number.isNaN(t) || (from != null && t < from) || (to != null && t > to)) continue;
      }
      const amount = roles.amount ? num(data[roles.amount]) : 0;
      const stageWeight = typeof stage?.config?.forecast_weight === 'number' ? stage.config.forecast_weight : null;
      const weight = stageWeight ?? (roles.probability && data[roles.probability] != null && data[roles.probability] !== ''
        ? Math.max(0, Math.min(1, num(data[roles.probability]) / 100)) : 0);
      const wValue = amount * weight;
      count += 1;
      totalPipeline += amount;
      weightedForecast += wValue;

      const sk = stage?.label ?? stage?.name ?? 'Unassigned';
      if (!byStage[sk]) byStage[sk] = { stage: sk, count: 0, amount: 0, weighted: 0, weight: stageWeight };
      byStage[sk].count += 1; byStage[sk].amount += amount; byStage[sk].weighted += wValue;
      // A stage without a fixed weight shows the average probability of its deals.
      if (stageWeight == null) byStage[sk].weight = byStage[sk].amount > 0 ? byStage[sk].weighted / byStage[sk].amount : weight;

      const ok = String(owner);
      if (!byOwner[ok]) byOwner[ok] = { owner_id: ok, count: 0, amount: 0, weighted: 0 };
      byOwner[ok].count += 1; byOwner[ok].amount += amount; byOwner[ok].weighted += wValue;

      if (roles.category) {
        const ck = String(data[roles.category] ?? 'none');
        if (!byCategory[ck]) byCategory[ck] = { category: ck, count: 0, amount: 0, weighted: 0 };
        byCategory[ck].count += 1; byCategory[ck].amount += amount; byCategory[ck].weighted += wValue;
      }
    }
    const round = (o) => ({ ...o, amount: +o.amount.toFixed(2), weighted: +o.weighted.toFixed(2) });
    const order = new Map((stages ?? []).map((s, i) => [s.label ?? s.name, i]));
    return {
      total_pipeline:    +totalPipeline.toFixed(2),
      weighted_forecast: +weightedForecast.toFixed(2),
      record_count:      count,
      by_stage:          Object.values(byStage).sort((a, b) => (order.get(a.stage) ?? 99) - (order.get(b.stage) ?? 99)).map(round),
      by_employee:       Object.values(byOwner).sort((a, b) => b.amount - a.amount).map(round),
      by_category:       Object.values(byCategory).map(round),
      value_field:       roles.amount,
      value_label:       fields.find((f) => f.name === roles.amount)?.label ?? null,
      fields:            roles,
    };
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  #validatePeriodType(type) {
    const VALID = ['monthly', 'quarterly', 'annual'];
    if (!VALID.includes(type)) throw new Error(`Invalid period_type: ${type}`);
  }
}

module.exports = ForecastService;
