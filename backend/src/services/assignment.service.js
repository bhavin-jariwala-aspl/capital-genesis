'use strict';

const { typedValue } = require('./record-compute');
const { getTenantId } = require('../middleware/tenant-scope');

/**
 * AssignmentService — configurable record assignment engine.
 *
 * Rule evaluation order (within an object, by order_index ASC):
 *   1. rule_based  — evaluates condition array; ALL conditions must match
 *   2. fixed       — always assigns to a specific employee
 *   3. round_robin — cycles through a pool of employees in order
 *   4. load_balanced — assigns to the pool member carrying the fewest OPEN records
 *
 * If no rule matches, falls back to:
 *   a. The last matching rule's fallback_id
 *   b. null (no assignment)
 *
 * Assignment decisions are written to assignment_logs for auditability.
 */
const parseBool = v => v === 'true' || v === true;

/**
 * Stage names that conventionally mean "this record is finished".
 *
 * Mirrors `isConversionStage` in routes/runtime: an explicit metadata flag
 * (`config.is_closed`) wins, so a tenant can rename or relocate its terminal
 * lanes in the Builder, and these names are the fallback for the stages the
 * shipped pipelines use.
 */
const TERMINAL_STAGE_NAMES = new Set([
  'closed', 'closed_won', 'closed_lost', 'won', 'lost',
  'converted', 'cancelled', 'canceled', 'rejected', 'completed', 'resolved',
]);

/** Is this pipeline stage a terminal one — i.e. the work is no longer open? */
function isTerminalStage(stage) {
  if (!stage) return false;
  if (stage.config && stage.config.is_closed === true) return true;
  return TERMINAL_STAGE_NAMES.has(String(stage.name ?? '').toLowerCase());
}

/**
 * Coerce a pool into a clean array of distinct, non-empty employee ids.
 *
 * The column is JSON, so a pool could arrive as a comma-joined string from a
 * form, or carry blanks and duplicates. A duplicate in a round-robin pool
 * silently doubles that person's share of the work, which is the one thing a
 * round-robin exists to prevent.
 */
function normalisePool(value) {
  const raw = Array.isArray(value) ? value : String(value ?? '').split(',');
  return [...new Set(raw.map((v) => String(v ?? '').trim()).filter(Boolean))];
}

class AssignmentService {
  /** @param {import('@prisma/client').PrismaClient} prisma */
  constructor(prisma) {
    this.db = prisma;
  }

  // ── Public API ────────────────────────────────────────────────────────────

  /**
   * Evaluate all active rules for an object and return the matched assignee_id.
   * If an assignee is found, writes an AssignmentLog entry and updates record.assigned_to.
   *
   * @param {number}  objectId   UiObject.id
   * @param {number}  recordId   Record.id (must already exist)
   * @returns {string|null}      employee_id of the assigned employee, or null
   */
  async assign(objectId, recordId) {
    const rules = await this.db.assignmentRule.findMany({
      where:   { object_id: objectId, is_active: true },
      orderBy: { order_index: 'asc' },
    });
    if (!rules.length) return null;

    // Load CRM entity fields for rule_based condition evaluation.
    const fields = await this.#loadCrmFields(recordId);

    let lastFallback = null;

    for (const rule of rules) {
      if (rule.fallback_id) lastFallback = rule.fallback_id;

      const assignee = await this.#evaluateRule(rule, fields);
      if (assignee) {
        await this.#applyAssignment(recordId, objectId, rule.id, assignee, rule.rule_type);
        return assignee;
      }
    }

    // No rule matched — use the last fallback if any
    if (lastFallback) {
      await this.#applyAssignment(recordId, objectId, null, lastFallback, 'fallback');
      return lastFallback;
    }

    return null;
  }

  /**
   * Explain what `assign()` would do for a record, without doing it.
   *
   * The Builder's "who would get this?" simulator calls this. Every rule is
   * evaluated in order and reported — matched or not, and why — so an admin can
   * see not only the answer but the rule that produced it and the ones it
   * skipped. That is the difference between a routing table you can debug and
   * one you can only trust.
   *
   * Nothing is written: no `assigned_to`, no assignment log, and round-robin
   * state is *peeked* rather than advanced, so simulating does not steal a
   * turn from the next real record.
   *
   * @param {number} objectId
   * @param {{ recordId?: number, fields?: object }} input  an existing record,
   *        or field values to test a hypothetical one
   */
  async explain(objectId, { recordId = null, fields = null } = {}) {
    const rules = await this.db.assignmentRule.findMany({
      where:   { object_id: Number(objectId), is_active: true },
      orderBy: { order_index: 'asc' },
    });

    const data = fields ?? (recordId ? await this.#loadCrmFields(Number(recordId)) : {});
    const trace = [];
    let decision = null;
    let lastFallback = null;

    for (const rule of rules) {
      if (rule.fallback_id) lastFallback = rule.fallback_id;
      const entry = { rule_id: rule.id, name: rule.name, rule_type: rule.rule_type, order_index: rule.order_index };

      if (decision) { trace.push({ ...entry, outcome: 'skipped', reason: 'An earlier rule already matched' }); continue; }

      const eligible = await this.#eligiblePool(rule);
      const dropped  = normalisePool(rule.pool_ids).filter((id) => !eligible.includes(id));

      switch (rule.rule_type) {
        case 'fixed':
          decision = { assignee: rule.assignee_id, method: 'fixed', rule_id: rule.id };
          trace.push({ ...entry, outcome: 'matched', reason: `Always assigns to ${rule.assignee_id}` });
          break;

        case 'rule_based': {
          const conditions = rule.conditions ?? [];
          if (!conditions.length) {
            trace.push({ ...entry, outcome: 'no_match', reason: 'No conditions — a rule_based rule with none never matches' });
            break;
          }
          const failed = conditions.filter((c) => !this.#evaluateCondition(c, data));
          if (failed.length) {
            trace.push({
              ...entry, outcome: 'no_match',
              reason: `${failed.length} of ${conditions.length} condition(s) failed`,
              failed_conditions: failed.map((c) => ({ ...c, actual: data?.[c.field] ?? null })),
            });
            break;
          }
          if (rule.assignee_id) {
            decision = { assignee: rule.assignee_id, method: 'rule_based', rule_id: rule.id };
            trace.push({ ...entry, outcome: 'matched', reason: 'All conditions matched; named assignee' });
          } else if (eligible.length) {
            const next = await this.#peekRoundRobin(rule, eligible);
            decision = { assignee: next, method: 'rule_based', rule_id: rule.id };
            trace.push({ ...entry, outcome: 'matched', reason: `All conditions matched; next in pool rotation`, dropped_inactive: dropped });
          } else {
            trace.push({ ...entry, outcome: 'no_match', reason: 'Conditions matched but no assignee and no eligible pool', dropped_inactive: dropped });
          }
          break;
        }

        case 'round_robin':
          if (!eligible.length) {
            trace.push({ ...entry, outcome: 'no_match', reason: 'No eligible pool member', dropped_inactive: dropped });
            break;
          }
          decision = { assignee: await this.#peekRoundRobin(rule, eligible), method: 'round_robin', rule_id: rule.id };
          trace.push({ ...entry, outcome: 'matched', reason: `Next in rotation of ${eligible.length}`, dropped_inactive: dropped });
          break;

        case 'load_balanced': {
          if (!eligible.length) {
            trace.push({ ...entry, outcome: 'no_match', reason: 'No eligible pool member', dropped_inactive: dropped });
            break;
          }
          const load = await this.#openLoad(rule, eligible);
          const pick = this.leastLoaded(eligible, load);
          decision = { assignee: pick, method: 'load_balanced', rule_id: rule.id };
          trace.push({
            ...entry, outcome: 'matched',
            reason: `Fewest open records`,
            load: eligible.map((id) => ({ employee_id: id, open: load[id] ?? 0 })),
            dropped_inactive: dropped,
          });
          break;
        }

        default:
          trace.push({ ...entry, outcome: 'no_match', reason: `Unknown rule type ${rule.rule_type}` });
      }
    }

    if (!decision && lastFallback) {
      decision = { assignee: lastFallback, method: 'fallback', rule_id: null };
    }

    return {
      object_id: Number(objectId),
      input:     recordId ? { record_id: Number(recordId) } : { fields: data },
      decision:  decision ?? { assignee: null, method: 'none', rule_id: null },
      rules_evaluated: rules.length,
      trace,
    };
  }

  /** The next round-robin pick, without advancing the cursor. */
  async #peekRoundRobin(rule, eligible) {
    const state = await this.db.roundRobinState.findUnique({ where: { rule_id: rule.id } }).catch(() => null);
    const current = Number(state?.last_index ?? 0);
    return eligible[(current + 1) % eligible.length] ?? null;
  }

  /** Open-record load per pool member, as `#loadBalanced` counts it. */
  async #openLoad(rule, pool) {
    const terminalStageIds = await this.#terminalStageIds(rule.object_id);
    const grouped = await this.db.record.groupBy({
      by:    ['assigned_to'],
      where: {
        assigned_to: { in: pool },
        object_id:   rule.object_id,
        deleted_at:  null,
        ...(terminalStageIds.length
          ? { OR: [{ pipeline_stage_id: null }, { pipeline_stage_id: { notIn: terminalStageIds } }] }
          : {}),
      },
      _count: { id: true },
    });
    return Object.fromEntries(grouped.map((g) => [g.assigned_to, g._count.id]));
  }

  // ── Rule CRUD ─────────────────────────────────────────────────────────────

  async getRules(objectId) {
    return this.db.assignmentRule.findMany({
      where:   objectId ? { object_id: Number(objectId) } : {},
      orderBy: [{ object_id: 'asc' }, { order_index: 'asc' }],
    });
  }

  async getRule(id) {
    return this.db.assignmentRule.findUnique({ where: { id } });
  }

  async createRule(data) {
    const { object_id, name, rule_type, conditions, assignee_id, pool_ids, fallback_id, order_index } = data;
    this.#validateRuleType(rule_type);
    return this.db.assignmentRule.create({
      data: {
        object_id: Number(object_id),
        name,
        rule_type,
        conditions:  conditions  ?? null,
        assignee_id: assignee_id ?? null,
        pool_ids:    pool_ids ? normalisePool(pool_ids) : null,
        fallback_id: fallback_id ?? null,
        order_index: order_index ?? 0,
        is_active:   parseBool(data.is_active ?? true),
        tenant_id:   getTenantId(),
      },
    });
  }

  async updateRule(id, data) {
    if (data.rule_type) this.#validateRuleType(data.rule_type);
    // `update` is a const binding from the rest pattern, so the previous
    // `update = { ...update, is_active }` threw `TypeError: Assignment to
    // constant variable` — every activate/deactivate of a rule answered 500.
    // Mutate the property instead of rebinding the object.
    const { object_id: _oid, created_by: _cb, created_at: _ca, id: _id, updated_at: _ua, ...update } = data;
    if (update.is_active !== undefined) update.is_active = parseBool(update.is_active);
    if (update.pool_ids !== undefined) update.pool_ids = normalisePool(update.pool_ids);
    return this.db.assignmentRule.update({ where: { id: Number(id) }, data: update });
  }

  async deleteRule(id) {
    return this.db.assignmentRule.delete({ where: { id } });
  }

  /** Reorder multiple rules for an object in one transaction */
  async reorderRules(objectId, orderedIds) {
    const updates = orderedIds.map((id, idx) =>
      this.db.assignmentRule.update({ where: { id }, data: { order_index: idx } }),
    );
    return this.db.$transaction(updates);
  }

  // ── Logs ─────────────────────────────────────────────────────────────────

  async getLogs(filters = {}) {
    const where = {};
    if (filters.record_id) where.record_id = Number(filters.record_id);
    if (filters.object_id) where.object_id = Number(filters.object_id);
    return this.db.assignmentLog.findMany({
      where,
      orderBy: { created_at: 'desc' },
      take:    filters.limit ? Number(filters.limit) : 50,
    });
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  /**
   * Load CRM entity fields for a record as a flat key-value map.
   * Returns {} if the record has no linked CRM entity (non-CRM objects).
   */
  async #loadCrmFields(recordId) {
    if (!recordId) return {};
    try {
      const full = await this.db.record.findUnique({
        where:   { id: Number(recordId) },
        include: {
          crm_lead:        true,
          crm_lead_intake: true,
          crm_contact:     true,
          crm_account:     true,
          crm_opportunity: true,
          crm_case:        true,
        },
      });
      if (!full) return {};
      // Custom-object fields (and CRM overflow fields) live in the typed field
      // table. Reading only the crm_* row made every rule_based condition on a
      // Builder object silently fail and fall through to the fallback.
      const rows = typeof this.db.recordFieldValue?.findMany === 'function'
        ? await this.db.recordFieldValue.findMany({ where: { record_id: Number(recordId) } })
        : [];
      const data = Object.fromEntries(rows.map((r) => [r.field_name, typedValue(r)]));
      const entity = full.crm_lead ?? full.crm_lead_intake ?? full.crm_contact ?? full.crm_account
                  ?? full.crm_opportunity ?? full.crm_case;
      if (entity) {
        const { id: _id, record_id: _rid, created_at: _ca, updated_at: _ua, ...fields } = entity;
        for (const [k, v] of Object.entries(fields)) if (v !== null && v !== undefined) data[k] = v;
      }
      return data;
    } catch {
      return {};
    }
  }

  /**
   * Evaluate a single rule against the record's data.
   * Returns the assignee_id string if the rule matched, null otherwise.
   */
  async #evaluateRule(rule, recordData) {
    switch (rule.rule_type) {
      case 'fixed':
        return rule.assignee_id ?? null;

      case 'round_robin':
        return this.#roundRobin(rule);

      case 'rule_based': {
        const conditions = rule.conditions ?? [];
        if (!conditions.length) return null;
        const allMatch = conditions.every(c => this.#evaluateCondition(c, recordData));
        if (!allMatch) return null;
        // rule_based + matched: use assignee_id if set, else round_robin from pool
        if (rule.assignee_id) return rule.assignee_id;
        return this.#roundRobin(rule);
      }

      case 'load_balanced':
        return this.#loadBalanced(rule);

      default:
        return null;
    }
  }

  /**
   * Public, reusable condition matcher: returns true when EVERY condition in
   * `conditions` matches `data` (AND semantics, same as rule_based records).
   * An empty/missing condition list never matches. Exposed so other routers
   * (e.g. social media mention routing) share the exact operator semantics.
   *
   * @param {Array<{field,operator,value}>} conditions
   * @param {Record<string,unknown>} data
   * @returns {boolean}
   */
  matchesConditions(conditions, data) {
    if (!Array.isArray(conditions) || conditions.length === 0) return false;
    return conditions.every(c => this.#evaluateCondition(c, data));
  }

  /**
   * Evaluate a single condition against the record's CRM field values.
   * Supported operators: equals | not_equals | contains | starts_with | ends_with |
   *                      gt | gte | lt | lte | in | not_in | is_empty | is_not_empty
   */
  #evaluateCondition({ field, operator, value }, recordData) {
    const fieldVal = recordData?.[field];
    switch (operator) {
      case 'equals':       return String(fieldVal ?? '') === String(value ?? '');
      case 'not_equals':   return String(fieldVal ?? '') !== String(value ?? '');
      case 'contains':     return String(fieldVal ?? '').includes(String(value ?? ''));
      case 'starts_with':  return String(fieldVal ?? '').startsWith(String(value ?? ''));
      case 'ends_with':    return String(fieldVal ?? '').endsWith(String(value ?? ''));
      case 'gt':           return Number(fieldVal) > Number(value);
      case 'gte':          return Number(fieldVal) >= Number(value);
      case 'lt':           return Number(fieldVal) < Number(value);
      case 'lte':          return Number(fieldVal) <= Number(value);
      case 'in': {
        const list = Array.isArray(value) ? value : String(value).split(',');
        return list.map(v => String(v).trim()).includes(String(fieldVal ?? ''));
      }
      case 'not_in': {
        const list = Array.isArray(value) ? value : String(value).split(',');
        return !list.map(v => String(v).trim()).includes(String(fieldVal ?? ''));
      }
      case 'is_empty':     return fieldVal === null || fieldVal === undefined || String(fieldVal).trim() === '';
      case 'is_not_empty': return fieldVal !== null && fieldVal !== undefined && String(fieldVal).trim() !== '';
      default:             return false;
    }
  }

  /**
   * The members of a rule's pool who can actually receive work.
   *
   * Neither strategy used to check this, so a deactivated employee stayed in
   * the rotation and kept being handed records they can no longer sign in to
   * see — work that is silently lost until somebody notices the queue. Every
   * major CRM filters assignment targets on active status for exactly this
   * reason.
   *
   * Order is preserved, because round-robin fairness and the load-balancer's
   * tie-break both depend on the pool's declared order.
   */
  async #eligiblePool(rule) {
    const pool = normalisePool(rule.pool_ids);
    if (!pool.length) return [];
    const active = await this.db.employee.findMany({
      where:  { employee_id: { in: pool }, is_active: true },
      select: { employee_id: true },
    });
    const allowed = new Set(active.map((e) => e.employee_id));
    return pool.filter((id) => allowed.has(id));
  }

  /** Round-robin assignment using persistent RoundRobinState keyed per rule */
  async #roundRobin(rule) {
    const pool = await this.#eligiblePool(rule);
    if (!pool.length) return rule.fallback_id ?? null;

    const tenantId = getTenantId() ?? rule.tenant_id;

    return this.db.$transaction(async (tx) => {
      // Ensure the state row exists before locking it
      await tx.roundRobinState.upsert({
        where:  { rule_id: rule.id },
        create: { rule_id: rule.id, pool_ids: pool, last_index: 0, tenant_id: tenantId },
        update: {},
      });

      // Lock the row with SELECT FOR UPDATE so concurrent transactions
      // must wait for this one to commit before reading last_index.
      const rows = await tx.$queryRaw`
        SELECT last_index FROM round_robin_states WHERE rule_id = ${rule.id} FOR UPDATE
      `;
      const currentIndex = Number(rows[0]?.last_index ?? 0);
      const nextIndex    = (currentIndex + 1) % pool.length;

      await tx.roundRobinState.update({
        where: { rule_id: rule.id },
        data:  { last_index: nextIndex, pool_ids: pool },
      });

      return pool[nextIndex] ?? null;
    });
  }

  /**
   * Load-balanced: assign to the pool member carrying the fewest OPEN records
   * of this rule's object.
   *
   * Three things this counts that the previous version got wrong, each of which
   * broke the strategy rather than merely skewing it:
   *
   *  - **Closed work was counted.** Load was `every record ever assigned`, so a
   *    rep who has closed 400 deals looked 400 times busier than a new hire
   *    with an empty desk. The balance never recovered: whoever joined most
   *    recently received everything until they caught up on lifetime volume.
   *    Load balancing means current workload, so terminal stages are excluded.
   *  - **Deleted records were counted.** Trashed records still carry
   *    `assigned_to`, so clearing a rep's desk into the bin left their load
   *    unchanged.
   *  - **Every object was counted together.** A rule routes one object; its
   *    pool's capacity for that object is what matters, and mixing in unrelated
   *    objects made two rules on the same pool disagree about who is busiest.
   */
  async #loadBalanced(rule) {
    const pool = await this.#eligiblePool(rule);
    if (!pool.length) return rule.fallback_id ?? null;
    const loadByEmployee = await this.#openLoad(rule, pool);
    return this.leastLoaded(pool, loadByEmployee) ?? rule.fallback_id ?? null;
  }

  /** Pipeline-stage ids for `objectId` that mean the record is finished. */
  async #terminalStageIds(objectId) {
    if (!objectId) return [];
    const stages = await this.db.uiPipelineStage.findMany({
      where:  { pipeline: { object_id: Number(objectId) } },
      select: { id: true, name: true, config: true },
    });
    return stages.filter(isTerminalStage).map((s) => s.id);
  }

  /**
   * Pure load-balanced selection — no DB access. Returns the employee in
   * `pool` carrying the lowest current load, ties broken by pool order
   * (so the result is deterministic). Returns null for an empty pool.
   *
   * Shared by record assignment (#loadBalanced) and by other inbound-routing
   * callers (e.g. social media mentions) so the "fewest open items wins"
   * policy lives in one place.
   *
   * @param {string[]} pool             candidate employee_ids, in priority order
   * @param {Record<string,number>} loadByEmployee  employee_id → open item count
   * @returns {string|null}
   */
  leastLoaded(pool = [], loadByEmployee = {}) {
    if (!Array.isArray(pool) || pool.length === 0) return null;
    const counts = pool.map((empId) => ({ empId, count: loadByEmployee[empId] ?? 0 }));
    counts.sort((a, b) => a.count - b.count); // stable: equal counts keep pool order
    return counts[0]?.empId ?? null;
  }

  /** Write assignment decision back to the record and log it */
  async #applyAssignment(recordId, objectId, ruleId, assigneeId, method) {
    const tenantId = getTenantId();
    await Promise.all([
      this.db.record.update({
        where: { id: recordId },
        data:  { assigned_to: assigneeId },
      }),
      this.db.assignmentLog.create({
        data: {
          record_id:   recordId,
          object_id:   objectId,
          rule_id:     ruleId ?? null,
          assigned_to: assigneeId,
          method,
          ...(tenantId ? { tenant_id: tenantId } : {}),
        },
      }),
    ]);
  }

  #validateRuleType(type) {
    const VALID = ['fixed', 'round_robin', 'rule_based', 'load_balanced'];
    if (!VALID.includes(type)) throw new Error(`Invalid rule_type: ${type}`);
  }
}

module.exports = AssignmentService;
module.exports.isTerminalStage = isTerminalStage;
module.exports.normalisePool = normalisePool;
module.exports.TERMINAL_STAGE_NAMES = TERMINAL_STAGE_NAMES;
