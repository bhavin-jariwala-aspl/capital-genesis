'use strict';

const { authenticate, requireAdmin } = require('../../middleware/authenticate');
const LeadScoringService = require('../../services/lead-scoring.service');
const { ok } = require('../../utils/response');

module.exports = async function leadScoringRoutes(fastify) {
  const svc = new LeadScoringService(fastify.prisma);

  // ── Scoring Rules (admin) ──────────────────────────────────────────────────

  // GET /api/lead-scoring/rules
  fastify.get('/rules', { preHandler: [authenticate] }, async (req) => {
    const { rule_type, is_active } = req.query;
    const rules = await svc.getScoringRules({
      ruleType: rule_type || undefined,
      isActive: is_active !== undefined ? is_active === 'true' : undefined,
    });
    return ok(rules);
  });

  // POST /api/lead-scoring/rules
  fastify.post('/rules', { preHandler: [requireAdmin] }, async (req, reply) => {
    const tenantId = req.user?.tenant_id;
    const rule = await svc.createScoringRule(req.body, req.user?.employee_id, tenantId);
    return reply.status(201).send(ok(rule));
  });

  // PUT /api/lead-scoring/rules/:id
  fastify.put('/rules/:id', { preHandler: [requireAdmin] }, async (req) => {
    const rule = await svc.updateScoringRule(req.params.id, req.body);
    return ok(rule);
  });

  // DELETE /api/lead-scoring/rules/:id
  fastify.delete('/rules/:id', { preHandler: [requireAdmin] }, async (req) => {
    const result = await svc.deleteScoringRule(req.params.id);
    return ok(result);
  });

  // POST /api/lead-scoring/rules/setup-defaults
  fastify.post('/rules/setup-defaults', { preHandler: [requireAdmin] }, async (req, reply) => {
    const tenantId = req.user?.tenant_id;
    const rules = await svc.setupDefaultRules(req.user?.employee_id, tenantId);
    return reply.status(201).send(ok(rules));
  });

  // ── Lead Scoring ───────────────────────────────────────────────────────────

  // GET /api/lead-scoring/leads/:id/score
  fastify.get('/leads/:id/score', { preHandler: [authenticate] }, async (req) => {
    const tenantId = req.user?.tenant_id;
    const score = await svc.getLeadScore(req.params.id, tenantId);
    return ok(score);
  });

  // POST /api/lead-scoring/leads/:id/score — recalculate
  fastify.post('/leads/:id/score', { preHandler: [authenticate] }, async (req) => {
    const tenantId = req.user?.tenant_id;
    const score = await svc.scoreLead(req.params.id, tenantId, true);
    return ok(score);
  });

  // POST /api/lead-scoring/bulk-score
  fastify.post('/bulk-score', { preHandler: [requireAdmin] }, async (req) => {
    const tenantId = req.user?.tenant_id;
    const { limit = 100, offset = 0 } = req.body ?? {};
    const results = await svc.bulkScoreLeads(tenantId, limit, offset);
    return ok(results);
  });

  // ── Analytics & Rankings ───────────────────────────────────────────────────

  // GET /api/lead-scoring/top
  fastify.get('/top', { preHandler: [authenticate] }, async (req) => {
    const limit = parseInt(req.query.limit) || 50;
    const leads = await svc.getTopScoredLeads(limit);
    return ok(leads);
  });

  // GET /api/lead-scoring/analytics
  fastify.get('/analytics', { preHandler: [authenticate] }, async () => {
    const analytics = await svc.getScoringAnalytics();
    return ok(analytics);
  });

  // GET /api/lead-scoring/distribution
  fastify.get('/distribution', { preHandler: [authenticate] }, async () => {
    const distribution = await svc.getScoreDistribution();
    return ok(distribution);
  });
};
