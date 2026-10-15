'use strict';

const { authenticate } = require('../../middleware/authenticate');
const SearchService    = require('../../services/search.service');
const RecordService    = require('../../services/record.service');
const PermissionService = require('../../services/permission.service');
const { ok }           = require('../../utils/response');

module.exports = async function searchRoutes(fastify) {
  const permissions = new PermissionService(fastify.prisma);
  const svc = new SearchService(fastify.prisma, null, new RecordService(fastify.prisma, null, permissions), permissions);

  // GET /api/search?q=query&limit=20
  fastify.get('/', { preHandler: [authenticate] }, async (req) => {
    const { q = '', limit = '20' } = req.query;
    if (!q.trim()) return ok([]);
    return ok(await svc.search(q.trim(), { limit: Math.min(parseInt(limit, 10) || 20, 50), viewer: req.user }));
  });
};
