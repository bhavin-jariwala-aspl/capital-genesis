'use strict';

const { authenticate } = require('../../middleware/authenticate');
const AnalyticsService = require('../../services/analytics.service');
const { ok } = require('../../utils/response');

/**
 * Analytics routes — mounted at /api/analytics.
 *
 * These are the endpoints dashboard widgets read from instead of carrying
 * static JSON. Every dataset is computed from the caller's own tenant data
 * (the Prisma tenant-scope extension applies to all reads inside the service).
 */
module.exports = async function analyticsRoutes(fastify) {
  const svc = new AnalyticsService(fastify.prisma);

  // GET /api/analytics/datasets — catalog powering the builder's dataset picker
  fastify.get('/datasets', { preHandler: [authenticate] }, async () => ok(svc.getCatalog()));

  // GET /api/analytics/data/:key — the rows/metric for one dataset
  fastify.get('/data/:key', { preHandler: [authenticate] }, async (req) => {
    const { data, meta } = await svc.getData(req.params.key);
    return ok(data, { meta });
  });
};
