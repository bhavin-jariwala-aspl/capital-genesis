'use strict';

const { logger } = require('./logging.service');
const { leadScoreGrade } = require('../utils/lead-grade');

/** Fields included when returning lead data alongside scores */
const LEAD_SUMMARY_SELECT = {
  id: true, first_name: true, last_name: true,
  email: true, company: true, lead_status: true,
};

/**
 * LeadScoringService — Automated lead qualification and prioritization.
 *
 * Implements rule-based scoring engine with demographic, behavioral,
 * and engagement scoring. Supports dynamic score calculation and analytics.
 *
 * Scoring is based on actual CrmLead fields:
 *   first_name, last_name, company, email, phone, mobile, job_title,
 *   lead_source, lead_status, rating, industry, annual_revenue, website
 */
class LeadScoringService {
  /** @param {import('@prisma/client').PrismaClient} prisma */
  constructor(prisma) {
    this.db = prisma;
  }

  // ── SCORING RULES MANAGEMENT ───────────────────────────────────────────────

  async createScoringRule(data, createdBy, tenantId) {
    return this.db.leadScoringRule.create({
      data: {
        name: data.name,
        description: data.description ?? null,
        rule_type: data.rule_type,
        field_name: data.field_name,
        operator: data.operator,
        field_value: data.field_value ?? null,
        points: data.points,
        is_active: data.is_active ?? true,
        order_index: data.order_index ?? 0,
        created_by: createdBy ?? null,
        tenant_id: tenantId,
      },
    });
  }

  async updateScoringRule(id, data) {
    return this.db.leadScoringRule.update({
      where: { id: Number(id) },
      data: {
        ...(data.name !== undefined && { name: data.name }),
        ...(data.description !== undefined && { description: data.description }),
        ...(data.rule_type !== undefined && { rule_type: data.rule_type }),
        ...(data.field_name !== undefined && { field_name: data.field_name }),
        ...(data.operator !== undefined && { operator: data.operator }),
        ...(data.field_value !== undefined && { field_value: data.field_value }),
        ...(data.points !== undefined && { points: data.points }),
        ...(data.is_active !== undefined && { is_active: data.is_active }),
        ...(data.order_index !== undefined && { order_index: data.order_index }),
      },
    });
  }

  // `isActive` undefined → return ALL rules (active + inactive) so the builder
  // can show and reactivate soft-deactivated rules. Pass true/false to filter.
  async getScoringRules({ ruleType, isActive } = {}) {
    return this.db.leadScoringRule.findMany({
      where: {
        ...(ruleType && { rule_type: ruleType }),
        ...(isActive !== undefined && { is_active: isActive }),
      },
      orderBy: [
        { rule_type: 'asc' },
        { order_index: 'asc' },
        { points: 'desc' },
      ],
    });
  }

  async deleteScoringRule(id) {
    return this.db.$transaction(async (tx) => {
      // Check if rule has been used in scoring
      const scoresUsingRule = await tx.leadScore.findFirst({
        where: {
          scoring_details: {
            path: '$.rules[*].rule_id',
            array_contains: Number(id),
          },
        },
      });

      if (scoresUsingRule) {
        // Soft delete by deactivating
        return tx.leadScoringRule.update({
          where: { id: Number(id) },
          data: { is_active: false },
        });
      }

      // Hard delete if never used
      await tx.leadScoringRule.delete({ where: { id: Number(id) } });
      return { id: Number(id), deleted: true };
    });
  }

  // ── LEAD SCORING ──────────────────────────────────────────────────────────

  async scoreLead(leadId, tenantId, recalculate = false) {
    const numericLeadId = parseInt(leadId);
    if (isNaN(numericLeadId) || numericLeadId <= 0) {
      throw new Error('Invalid lead ID');
    }

    return this.db.$transaction(async (tx) => {
      // Get lead from relational table — only actual CrmLead fields
      const lead = await tx.crmLead.findUnique({
        where: { id: numericLeadId },
        select: {
          id: true,
          first_name: true,
          last_name: true,
          email: true,
          company: true,
          phone: true,
          job_title: true,
          lead_status: true,
          lead_source: true,
          industry: true,
          annual_revenue: true,
          rating: true,
          website: true,
          created_at: true,
        },
      });

      if (!lead) {
        throw new Error('Lead not found');
      }

      // Check for existing score
      const existingScore = await tx.leadScore.findFirst({
        where:   { lead_id: numericLeadId },
        orderBy: { calculated_at: 'desc' },
      });

      if (existingScore && !recalculate) {
        return existingScore;
      }

      // Get active scoring rules
      const rules = await tx.leadScoringRule.findMany({
        where: { is_active: true },
        orderBy: { order_index: 'asc' },
      });

      // Calculate score using lead data directly
      const scoreResult = this.#calculateScore(lead, rules);

      // Update or create score record
      if (existingScore) {
        return tx.leadScore.update({
          where: { id: existingScore.id },
          data: {
            total_score: scoreResult.totalScore,
            scoring_details: scoreResult.breakdown,
            calculated_at: new Date(),
          },
        });
      } else {
        return tx.leadScore.create({
          data: {
            lead_id: numericLeadId,
            total_score: scoreResult.totalScore,
            scoring_details: scoreResult.breakdown,
            tenant_id: tenantId,
          },
        });
      }
    });
  }

  /**
   * Score a raw Lead (crm_lead_intake) — the primary scoring target. Mirrors
   * scoreLead but reads/writes against the lead-intake entity. Reuses the same
   * rule-evaluation core, so the same LeadScoringRule set applies.
   */
  async scoreLeadIntake(intakeId, tenantId, recalculate = false) {
    const numericId = parseInt(intakeId);
    if (isNaN(numericId) || numericId <= 0) {
      throw new Error('Invalid lead ID');
    }

    return this.db.$transaction(async (tx) => {
      const lead = await tx.crmLeadIntake.findUnique({
        where: { id: numericId },
        select: {
          id: true,
          first_name: true,
          last_name: true,
          email: true,
          company: true,
          phone: true,
          job_title: true,
          lead_status: true,
          lead_source: true,
          industry: true,
          annual_revenue: true,
          rating: true,
          website: true,
          created_at: true,
        },
      });

      if (!lead) {
        throw new Error('Lead not found');
      }

      const existingScore = await tx.leadScore.findFirst({
        where:   { lead_intake_id: numericId },
        orderBy: { calculated_at: 'desc' },
      });

      if (existingScore && !recalculate) {
        return existingScore;
      }

      const rules = await tx.leadScoringRule.findMany({
        where: { is_active: true },
        orderBy: { order_index: 'asc' },
      });

      const scoreResult = this.#calculateScore(lead, rules);

      if (existingScore) {
        return tx.leadScore.update({
          where: { id: existingScore.id },
          data: {
            total_score: scoreResult.totalScore,
            scoring_details: scoreResult.breakdown,
            calculated_at: new Date(),
          },
        });
      } else {
        return tx.leadScore.create({
          data: {
            lead_intake_id: numericId,
            total_score: scoreResult.totalScore,
            scoring_details: scoreResult.breakdown,
            tenant_id: tenantId,
          },
        });
      }
    });
  }

  async bulkScoreLeads(tenantId, limit = 100, offset = 0) {
    const leads = await this.db.crmLead.findMany({
      select: { id: true },
      take: limit,
      skip: offset,
      orderBy: { created_at: 'desc' },
    });

    const BATCH_SIZE = 10;
    const results = [];

    for (let i = 0; i < leads.length; i += BATCH_SIZE) {
      const batch = leads.slice(i, i + BATCH_SIZE);
      const batchResults = await Promise.all(
        batch.map(async (lead) => {
          try {
            const score = await this.scoreLead(lead.id, tenantId, true);
            return { lead_id: lead.id, total_score: score.total_score, status: 'success' };
          } catch (error) {
            return { lead_id: lead.id, error: error.message, status: 'failed' };
          }
        }),
      );
      results.push(...batchResults);
    }

    return results;
  }

  async bulkScoreLeadIntakes(tenantId, limit = 100, offset = 0) {
    const leads = await this.db.crmLeadIntake.findMany({
      select: { id: true },
      take: limit,
      skip: offset,
      orderBy: { created_at: 'desc' },
    });

    const BATCH_SIZE = 10;
    const results = [];

    for (let i = 0; i < leads.length; i += BATCH_SIZE) {
      const batch = leads.slice(i, i + BATCH_SIZE);
      const batchResults = await Promise.all(
        batch.map(async (lead) => {
          try {
            const score = await this.scoreLeadIntake(lead.id, tenantId, true);
            return { lead_id: lead.id, total_score: score.total_score, status: 'success' };
          } catch (error) {
            return { lead_id: lead.id, error: error.message, status: 'failed' };
          }
        }),
      );
      results.push(...batchResults);
    }

    return results;
  }

  #calculateScore(leadData, rules) {
    const appliedRules = [];
    let totalScore = 0;

    for (const rule of rules) {
      if (this.#evaluateRule(rule, leadData)) {
        appliedRules.push({
          rule_id: rule.id,
          rule_name: rule.name,
          rule_type: rule.rule_type,
          points: rule.points,
          field: rule.field_name,
          matched_value: leadData[rule.field_name],
        });
        totalScore += rule.points;
      }
    }

    return {
      totalScore: Math.max(0, totalScore),
      breakdown: {
        rules: appliedRules,
        total_rules_applied: appliedRules.length,
        demographic_score: this.#getScoreByType(appliedRules, 'demographic'),
        behavioral_score: this.#getScoreByType(appliedRules, 'behavioral'),
        engagement_score: this.#getScoreByType(appliedRules, 'engagement'),
      },
    };
  }

  #evaluateRule(rule, leadData) {
    const fieldValue = leadData[rule.field_name];
    const ruleValue = rule.field_value;

    // Handle null/undefined values
    if (fieldValue === null || fieldValue === undefined) {
      return rule.operator === 'is_empty';
    }

    switch (rule.operator) {
      case 'equals':
        return String(fieldValue) === String(ruleValue);

      case 'not_equals':
        return String(fieldValue) !== String(ruleValue);

      case 'contains':
        return String(fieldValue).toLowerCase().includes(String(ruleValue).toLowerCase());

      case 'not_contains':
        return !String(fieldValue).toLowerCase().includes(String(ruleValue).toLowerCase());

      case 'starts_with':
        return String(fieldValue).toLowerCase().startsWith(String(ruleValue).toLowerCase());

      case 'ends_with':
        return String(fieldValue).toLowerCase().endsWith(String(ruleValue).toLowerCase());

      case 'greater_than':
        return Number(fieldValue) > Number(ruleValue);

      case 'less_than':
        return Number(fieldValue) < Number(ruleValue);

      case 'greater_equal':
        return Number(fieldValue) >= Number(ruleValue);

      case 'less_equal':
        return Number(fieldValue) <= Number(ruleValue);

      case 'is_empty':
        return !fieldValue || fieldValue === '';

      case 'is_not_empty':
        return fieldValue && fieldValue !== '';

      case 'in_list': {
        const listValues = String(ruleValue).split(',').map(v => v.trim());
        return listValues.includes(String(fieldValue));
      }

      case 'not_in_list': {
        const notInValues = String(ruleValue).split(',').map(v => v.trim());
        return !notInValues.includes(String(fieldValue));
      }

      default:
        return false;
    }
  }

  #getScoreByType(appliedRules, ruleType) {
    return appliedRules
      .filter(rule => rule.rule_type === ruleType)
      .reduce((sum, rule) => sum + rule.points, 0);
  }

  // ── QUERYING SCORED LEADS ──────────────────────────────────────────────────

  async getLeadScore(leadId, tenantId) {
    const score = await this.db.leadScore.findFirst({
      where: { lead_id: Number(leadId) },
      include: {
        lead: { select: LEAD_SUMMARY_SELECT },
        lead_intake: { select: LEAD_SUMMARY_SELECT },
      },
    });

    if (!score) {
      return this.scoreLead(leadId, tenantId);
    }

    return score;
  }

  async getTopScoredLeads(limit = 50) {
    return this.db.leadScore.findMany({
      orderBy: { total_score: 'desc' },
      take: limit,
      include: {
        lead: { select: LEAD_SUMMARY_SELECT },
        lead_intake: { select: LEAD_SUMMARY_SELECT },
      },
    });
  }

  async getScoreDistribution() {
    const scores = await this.db.leadScore.findMany({
      select: { total_score: true },
    });

    const distribution = { A: 0, B: 0, C: 0, D: 0, F: 0 };

    scores.forEach(({ total_score }) => {
      distribution[leadScoreGrade(total_score)]++;
    });

    return Object.entries(distribution).map(([grade, count]) => ({
      grade,
      count,
      percentage: scores.length > 0 ? Math.round((count / scores.length) * 100) : 0,
    }));
  }

  async getLeadsByScoreRange(minScore = 0, maxScore = 100) {
    return this.db.leadScore.findMany({
      where: { total_score: { gte: minScore, lte: maxScore } },
      orderBy: { total_score: 'desc' },
      include: {
        lead: { select: LEAD_SUMMARY_SELECT },
        lead_intake: { select: LEAD_SUMMARY_SELECT },
      },
    });
  }

  // ── DEFAULT SCORING RULES ──────────────────────────────────────────────────

  /**
   * The starter scoring model for a life-insurance agency.
   *
   * ── Why these replaced the previous set ─────────────────────────────────────
   * The old defaults were generic B2B-SaaS rules that did not fit this product
   * and, in two cases, could not work at all:
   *
   *   - "Senior Job Title" and "Manager Job Title" used `contains` with a
   *     comma-separated list (`'VP, Director, Chief, President, Owner, Founder'`).
   *     `contains` is a single substring test, so it asked whether the job title
   *     contained that entire literal string. Neither rule could ever match a
   *     real record — they awarded 20 and 10 points to nobody.
   *   - "Target Industry" scored `Technology, Software, Finance, Healthcare,
   *     Manufacturing`: a B2B firmographic list, meaningless for individual and
   *     family life cover.
   *   - "Has Website" scored a company attribute on a consumer prospect.
   *   - Annual revenue and rating were filed as `behavioral`, which they are
   *     not — one is a financial attribute, the other a human judgement.
   *
   * Every rule below matches the values this product actually stores
   * (`lead_source`: web | referral | partner | seminar | social_media |
   * cold_call; `lead_status`: new | contacted | qualified | unqualified |
   * converted; `rating`: hot | warm | cold) and uses an operator whose
   * semantics suit the field: `in_list` for exact enumerated values,
   * `contains` only for genuine substring tests.
   *
   * ── The model ───────────────────────────────────────────────────────────────
   * Three groups, kept separate on purpose. A single blended number cannot
   * distinguish a perfect-fit prospect who is cold from a poor-fit prospect who
   * is keen, and those two need opposite treatment:
   *
   *   demographic — who they are, and whether they can afford cover
   *   behavioral  — where they came from and how far they have moved
   *   engagement  — whether we can actually reach them
   *
   * Two rules carry negative points. That is deliberate: in a model where every
   * rule adds, every lead eventually scores highly and the ranking stops
   * meaning anything. Disqualifiers are what keep the distribution honest.
   *
   * `annual_revenue` is read as the prospect's annual household income — the
   * figure life cover is actually sized and underwritten against. The bands
   * below are starting points; an agency should re-weight them against its own
   * conversion data after a month, which is what the Builder guidance says.
   */
  async setupDefaultRules(createdBy, tenantId) {
    const defaultRules = [
      // ── Demographic — who they are, and what they can afford ─────────────
      {
        name: 'Income supports permanent cover',
        description: 'Household income above 150k — the band where whole-life and IUL become affordable.',
        rule_type: 'demographic',
        field_name: 'annual_revenue',
        operator: 'greater_than',
        field_value: '150000',
        points: 20,
      },
      {
        name: 'Income supports term cover',
        description: 'Household income above 75k — comfortably term-affordable.',
        rule_type: 'demographic',
        field_name: 'annual_revenue',
        operator: 'greater_than',
        field_value: '75000',
        points: 10,
      },
      {
        name: 'Employment on file',
        description: 'A stated occupation is what income verification and the occupational risk class are built on.',
        rule_type: 'demographic',
        field_name: 'job_title',
        operator: 'is_not_empty',
        field_value: null,
        points: 5,
      },

      // ── Behavioral — where they came from, and how far they have moved ────
      {
        name: 'Referred or introduced',
        description: 'Referrals and partner introductions convert far better than any other source in insurance distribution.',
        rule_type: 'behavioral',
        field_name: 'lead_source',
        operator: 'in_list',
        field_value: 'referral,partner',
        points: 25,
      },
      {
        name: 'Asked us first',
        description: 'Inbound web enquiry or seminar attendance — the prospect initiated contact.',
        rule_type: 'behavioral',
        field_name: 'lead_source',
        operator: 'in_list',
        field_value: 'web,seminar',
        points: 15,
      },
      {
        name: 'Cold outbound',
        description: 'Cold-called and untargeted social leads convert poorly. Scored down so they do not outrank warm enquiries on contactability alone.',
        rule_type: 'behavioral',
        field_name: 'lead_source',
        operator: 'in_list',
        field_value: 'cold_call,social_media',
        points: -10,
      },
      {
        name: 'Needs analysis started',
        description: 'Contacted or qualified — someone has had a real conversation.',
        rule_type: 'behavioral',
        field_name: 'lead_status',
        operator: 'in_list',
        field_value: 'contacted,qualified',
        points: 15,
      },
      {
        name: 'Ruled out',
        description: 'Explicitly unqualified. Kept in the model rather than deleted so the reason stays visible on the score breakdown.',
        rule_type: 'behavioral',
        field_name: 'lead_status',
        operator: 'equals',
        field_value: 'unqualified',
        points: -30,
      },
      {
        name: 'Agent rates it hot',
        description: 'The producer\'s own read. Weighted below the source and status rules on purpose — this is a judgement, not an observation, and a model that leans on it mostly scores the salesperson.',
        rule_type: 'behavioral',
        field_name: 'rating',
        operator: 'equals',
        field_value: 'hot',
        points: 15,
      },

      // ── Engagement — can we actually reach them ──────────────────────────
      {
        name: 'Reachable by phone',
        description: 'Life cover is sold in conversation, and a needs analysis is a phone call. Scored above email for that reason.',
        rule_type: 'engagement',
        field_name: 'phone',
        operator: 'is_not_empty',
        field_value: null,
        points: 15,
      },
      {
        name: 'Reachable by email',
        description: 'Needed for illustrations, applications and e-signature.',
        rule_type: 'engagement',
        field_name: 'email',
        operator: 'is_not_empty',
        field_value: null,
        points: 10,
      },
    ];

    const createdRules = [];
    for (const ruleData of defaultRules) {
      try {
        const rule = await this.createScoringRule(ruleData, createdBy, tenantId);
        createdRules.push(rule);
      } catch (error) {
        logger.warn('Failed to create default scoring rule', {
          rule_name: ruleData.name,
          error: error.message,
        });
      }
    }

    return createdRules;
  }

  // ── ANALYTICS ───────────────────────────────────────────────────────────────

  async getScoringAnalytics() {
    const [scoreStats, ruleEffectiveness] = await Promise.all([
      this.db.leadScore.aggregate({
        _count: { id: true },
        _avg: { total_score: true },
        _max: { total_score: true },
        _min: { total_score: true },
      }),
      this.db.leadScoringRule.findMany({
        where: { is_active: true },
        select: { id: true, name: true, points: true, rule_type: true },
      }),
    ]);

    return {
      total_scored: scoreStats._count.id,
      average_score: scoreStats._avg.total_score ? Math.round(scoreStats._avg.total_score * 100) / 100 : 0,
      highest_score: scoreStats._max.total_score || 0,
      lowest_score: scoreStats._min.total_score || 0,
      active_rules: ruleEffectiveness.length,
      score_distribution: await this.getScoreDistribution(),
    };
  }
}

module.exports = LeadScoringService;
