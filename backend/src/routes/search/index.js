'use strict';

const { authenticate } = require('../../middleware/authenticate');
const SearchService    = require('../../services/search.service');
const { ok }           = require('../../utils/response');

module.exports = async function searchRoutes(fastify) {
  const svc = new SearchService(fastify.prisma);

  // GET /api/search?q=query&limit=20
  fastify.get('/', { preHandler: [authenticate] }, async (req) => {
    const { q = '', limit = '20' } = req.query;
    if (!q.trim()) return ok([]);
    return ok(await svc.search(q.trim(), { limit: Math.min(parseInt(limit, 10) || 20, 50), viewer: req.user }));
  });
};
