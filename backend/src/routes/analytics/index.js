'use strict';

const { authenticate } = require('../../middleware/authenticate');
const AnalyticsService = require('../../services/analytics.service');
const ObjectAnalyticsService = require('../../services/object-analytics.service');
const RecordService = require('../../services/record.service');
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
  const objectSvc = new ObjectAnalyticsService(fastify.prisma, new RecordService(fastify.prisma));

  // GET /api/analytics/datasets — catalog powering the builder's dataset picker
  fastify.get('/datasets', { preHandler: [authenticate] }, async () => ok(svc.getCatalog()));

  // GET /api/analytics/data/:key — the rows/metric for one dataset
  fastify.get('/data/:key', { preHandler: [authenticate] }, async (req) => {
    const { data, meta } = await svc.getData(req.params.key);
    return ok(data, { meta });
  });

  // POST /api/analytics/object — a series or metric over any Builder object,
  // scoped to the records the caller can see (see ObjectAnalyticsService).
  fastify.post('/object', {
    preHandler: [authenticate],
    schema: {
      body: {
        type: 'object', required: ['object'],
        properties: {
          object: { type: 'string', maxLength: 100 }, metric: { type: 'string' }, field: { type: 'string', maxLength: 100 },
          group_by: { type: ['string', 'null'], maxLength: 100 }, limit: { type: 'integer', minimum: 1, maximum: 100 },
          label: { type: 'string', maxLength: 150 },
          filters: { type: 'array', maxItems: 20, items: { type: 'object', required: ['field', 'op'], properties: { field: { type: 'string' }, op: { type: 'string' }, value: {} } } },
        },
      },
    },
  }, async (req) => {
    const { data, meta } = await objectSvc.run(req.body, req.user);
    return ok(data, { meta });
  });
};
