'use strict';

const { authenticate } = require('../../middleware/authenticate');
const { tenantContext } = require('../../middleware/tenant-scope');
const AiReportingService = require('../../services/ai-reporting.service');
const ReportService = require('../../services/report.service');
const ReportLibraryService = require('../../services/report-library.service');
const { enrichRunContext } = require('../../services/report-run-context');
const { ok } = require('../../utils/response');
const { ValidationError } = require('../../utils/errors');

/**
 * AI reporting routes — mounted at /api/ai-reports.
 *
 * Available to every authenticated user, like the rest of reporting; what an
 * answer can *show* is clamped to the caller's data scope exactly as a
 * hand-built report is. Nothing here bypasses ReportService.
 */
module.exports = async function aiReportRoutes(fastify) {
  const P = fastify.prisma;
  const reports = new ReportService(P);
  const library = new ReportLibraryService(P);
  const ai = new AiReportingService(P, { reports, rateLimiter: fastify.rateLimiter ?? null });
  fastify.decorate('aiReportingService', ai);

  const viewer = (req) => ({ employeeId: req.user.employeeId, role: req.user.role, role_level: req.user.role_level });

  const on = (method, url, handler) =>
    fastify[method](url, { preHandler: [authenticate] }, async function scoped(req, reply) {
      const tenantId = req.user?.tenant_id ?? null;
      if (tenantId === null) return handler.call(this, req, reply);
      return tenantContext.run({ tenantId }, () => handler.call(this, req, reply));
    });

  const runCtx = async (req, scope) => enrichRunContext(P, await library.resolveScope(viewer(req), scope));

  /** Feature flag + provider health. Cheap; the UI calls it to decide whether to show Ask. */
  on('get', '/status', async () => ok(await ai.status()));

  /** Starter prompts, zero LLM cost. */
  on('get', '/suggestions', async () => ok(ai.suggestions()));

  /** Natural language in; plan + data + visualization + narrative out. */
  on('post', '/ask', async (req, reply) => {
    const body = req.body || {};
    const ctx = await runCtx(req, body.scope);
    try {
      const out = await ai.ask({
        message: body.message,
        history: body.history,
        force_viz: body.options?.force_viz ?? null,
        want_summary: body.options?.want_summary !== false,
      }, ctx);
      return ok(out, { meta: { scope: ctx.scope } });
    } catch (err) {
      if (err.statusCode === 429) { reply.header('Retry-After', String(err.retryAfter || 60)); reply.code(429); }
      throw err;
    }
  });

  /** "Explain this report" — a grounded narrative for a result the viewer already has. */
  on('post', '/explain', async (req) => {
    const body = req.body || {};
    if (!body.result) throw new ValidationError('result is required');
    const ctx = await runCtx(req, body.scope);
    return ok(await ai.explain({ title: body.title, result: body.result }, ctx));
  });
};
