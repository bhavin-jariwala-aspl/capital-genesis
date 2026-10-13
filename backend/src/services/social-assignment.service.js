'use strict';

const { getTenantId } = require('../middleware/tenant-scope');
const { NotFoundError, ValidationError } = require('../utils/errors');
const { PLATFORMS } = require('../connectors/social');
const AssignmentService = require('./assignment.service');

/**
 * SocialAssignmentService — configurable routing for INBOUND social
 * conversations (mentions / DMs / comments) across every channel.
 *
 * Mirrors the record AssignmentService strategies, scoped by social
 * `platform` instead of a UiObject:
 *
 *   fixed         — always a specific employee
 *   round_robin   — cycle a pool (cursor persisted inline on the rule)
 *   load_balanced — pool member with the fewest OPEN mentions
 *   rule_based    — evaluate conditions over the mention's own fields
 *                   (platform, sentiment, mention_type, response_priority,
 *                    follower_count, influence_score, …); on match, use
 *                   assignee_id or load-balance across the pool
 *
 * Rules are evaluated in order_index ASC. A rule whose `platform` is null
 * applies to every channel; otherwise it only applies to that platform.
 * When no active rule produces an assignee, the caller falls back to the
 * default managed-by-team routing in SocialMediaService.
 *
 * The operator semantics for rule_based conditions and the load-balanced
 * selection are reused from AssignmentService so the policy lives in one place.
 */
const VALID_RULE_TYPES = ['fixed', 'round_robin', 'rule_based', 'load_balanced'];
// One platform list for the whole social suite — the connector registry owns it.
const VALID_PLATFORMS  = PLATFORMS;
const parseBool = v => v === 'true' || v === true;

class SocialAssignmentService {
  /** @param {import('@prisma/client').PrismaClient} prisma */
  constructor(prisma) {
    this.db = prisma;
    this.assignment = new AssignmentService(prisma);
  }

  // ── CRUD ──────────────────────────────────────────────────────────────────

  async getRules(filters = {}) {
    const where = {};
    if (filters.platform) where.platform = filters.platform;
    if (filters.is_active !== undefined) where.is_active = parseBool(filters.is_active);
    return this.db.socialAssignmentRule.findMany({
      where,
      orderBy: [{ order_index: 'asc' }, { id: 'asc' }],
    });
  }

  async getRule(id) {
    const rule = await this.db.socialAssignmentRule.findUnique({ where: { id } });
    if (!rule) throw new NotFoundError('Social assignment rule');
    return rule;
  }

  async createRule(data) {
    this.#validate(data, { partial: false });
    return this.db.socialAssignmentRule.create({
      data: {
        platform:    data.platform ?? null,
        name:        data.name,
        rule_type:   data.rule_type,
        conditions:  data.conditions  ?? null,
        assignee_id: data.assignee_id ?? null,
        pool_ids:    data.pool_ids    ?? null,
        fallback_id: data.fallback_id ?? null,
        order_index: data.order_index ?? 0,
        is_active:   parseBool(data.is_active ?? true),
        created_by:  data.created_by ?? null,
        tenant_id:   data.tenant_id ?? getTenantId(),
      },
    });
  }

  async updateRule(id, data) {
    await this.getRule(id);
    this.#validate(data, { partial: true });
    const { id: _id, tenant_id: _t, created_by: _cb, created_at: _ca, updated_at: _ua, last_index: _li, ...rest } = data;
    if (rest.is_active !== undefined) rest.is_active = parseBool(rest.is_active);
    return this.db.socialAssignmentRule.update({ where: { id }, data: rest });
  }

  async deleteRule(id) {
    await this.getRule(id);
    return this.db.socialAssignmentRule.delete({ where: { id } });
  }

  /** Reorder rules in one transaction (order they appear = their order_index). */
  async reorderRules(orderedIds) {
    if (!Array.isArray(orderedIds)) throw new ValidationError('orderedIds must be an array');
    const updates = orderedIds.map((id, idx) =>
      this.db.socialAssignmentRule.update({ where: { id: Number(id) }, data: { order_index: idx } }),
    );
    return this.db.$transaction(updates);
  }

  // ── Routing ───────────────────────────────────────────────────────────────

  /**
   * Active rules for a tenant that apply to `platform` (a rule with a null
   * platform applies to all channels), ordered by precedence.
   * @returns {Promise<object[]>}
   */
  async activeRulesFor(tenantId, platform) {
    return this.db.socialAssignmentRule.findMany({
      where: {
        tenant_id: tenantId,
        is_active: true,
        OR: [{ platform: null }, { platform }],
      },
      orderBy: [{ order_index: 'asc' }, { id: 'asc' }],
    });
  }

  /**
   * Resolve an assignee for one mention from an ordered rule list. Returns the
   * first rule that yields an employee, else the last rule's fallback, else
   * null. Mutates `load` (employee → open-item count) so a batch stays
   * balanced across successive calls.
   *
   * @param {object[]} rules ordered active rules
   * @param {{ mentionData: object, load?: Record<string,number> }} ctx
   * @returns {Promise<string|null>}
   */
  async route(rules, { mentionData, load = {} }) {
    let lastFallback = null;
    for (const rule of rules) {
      if (rule.fallback_id) lastFallback = rule.fallback_id;
      const assignee = await this.#select(rule, mentionData, load);
      if (assignee) {
        load[assignee] = (load[assignee] ?? 0) + 1;
        return assignee;
      }
    }
    if (lastFallback) {
      load[lastFallback] = (load[lastFallback] ?? 0) + 1;
      return lastFallback;
    }
    return null;
  }

  async #select(rule, mentionData, load) {
    const pool = Array.isArray(rule.pool_ids) ? rule.pool_ids : [];
    switch (rule.rule_type) {
      case 'fixed':
        return rule.assignee_id ?? null;

      case 'load_balanced':
        return this.assignment.leastLoaded(pool, load) ?? rule.fallback_id ?? null;

      case 'round_robin':
        return this.#roundRobin(rule, pool);

      case 'rule_based': {
        if (!this.assignment.matchesConditions(rule.conditions ?? [], mentionData)) return null;
        if (rule.assignee_id) return rule.assignee_id;
        if (pool.length) return this.assignment.leastLoaded(pool, load);
        return null;
      }

      default:
        return null;
    }
  }

  /**
   * Round-robin over the rule's pool using the inline `last_index` cursor.
   * Locks the rule row FOR UPDATE so concurrent ticks advance the cursor
   * safely (mirrors AssignmentService.#roundRobin).
   */
  async #roundRobin(rule, pool) {
    if (!pool.length) return rule.fallback_id ?? null;
    return this.db.$transaction(async (tx) => {
      const rows = await tx.$queryRaw`
        SELECT last_index FROM social_assignment_rules WHERE id = ${rule.id} FOR UPDATE
      `;
      const current = Number(rows?.[0]?.last_index ?? rule.last_index ?? 0);
      const nextIndex = (current + 1) % pool.length;
      await tx.socialAssignmentRule.update({
        where: { id: rule.id },
        data:  { last_index: nextIndex },
      });
      return pool[nextIndex] ?? null;
    });
  }

  // ── Validation ──────────────────────────────────────────────────────────────

  #validate(data, { partial }) {
    if (data.rule_type !== undefined && !VALID_RULE_TYPES.includes(data.rule_type)) {
      throw new ValidationError(`Invalid rule_type. Must be one of: ${VALID_RULE_TYPES.join(', ')}`);
    }
    if (data.platform != null && !VALID_PLATFORMS.includes(data.platform)) {
      throw new ValidationError(`Invalid platform. Must be null (all) or one of: ${VALID_PLATFORMS.join(', ')}`);
    }
    if (!partial) {
      if (!data.name?.trim()) throw new ValidationError('name is required');
      if (!data.rule_type)    throw new ValidationError('rule_type is required');
    }

    const ruleType = data.rule_type;
    if (ruleType === 'fixed' && !partial && !data.assignee_id) {
      throw new ValidationError('assignee_id is required for a fixed rule');
    }
    if ((ruleType === 'round_robin' || ruleType === 'load_balanced') && !partial) {
      if (!Array.isArray(data.pool_ids) || data.pool_ids.length === 0) {
        throw new ValidationError(`pool_ids (non-empty array) is required for a ${ruleType} rule`);
      }
    }
    if (ruleType === 'rule_based' && !partial) {
      if (!Array.isArray(data.conditions) || data.conditions.length === 0) {
        throw new ValidationError('conditions (non-empty array) is required for a rule_based rule');
      }
    }
  }
}

module.exports = SocialAssignmentService;
