'use strict';

const Fastify = require('fastify');
const SegmentationService = require('../src/services/segmentation.service');
const pack = require('../prisma/verticals/genesis-capital/masters');

describe('wall-crossing decisions', () => {
  function service(crossing) {
    const db = {
      wallCrossing: {
        findUnique: jest.fn().mockResolvedValue(crossing),
        update: jest.fn(async ({ data }) => ({ ...crossing, ...data })),
      },
      barrierMember: { findUnique: jest.fn().mockResolvedValue(null), upsert: jest.fn().mockResolvedValue({}) },
    };
    const scope = { invalidate: jest.fn() };
    const audit = { append: jest.fn().mockResolvedValue({}) };
    return { svc: new SegmentationService(db, scope, audit), db };
  }

  it('refuses an approval by the requester (maker-checker)', async () => {
    const { svc } = service({ id: 1, status: 'pending', requested_by: 'GCFX1', employee_id: 'GCFX1', zone_id: 2 });
    await expect(svc.decideCrossing(1, { approve: true }, 'GCFX1')).rejects.toThrow(/person who requested/);
  });

  it('refuses approving a crossing that brings the approver over the wall', async () => {
    const { svc } = service({ id: 2, status: 'pending', requested_by: 'GCTRD1', employee_id: 'GCCOMP1', zone_id: 2 });
    await expect(svc.decideCrossing(2, { approve: true }, 'GCCOMP1')).rejects.toThrow(/yourself/);
  });

  it('lets Compliance approve someone else\'s crossing for a limited time', async () => {
    const { svc, db } = service({ id: 3, status: 'pending', requested_by: 'GCTRD1', employee_id: 'GCTRD1', zone_id: 2 });
    const out = await svc.decideCrossing(3, { approve: true, validDays: 14 }, 'GCCOMP1');
    expect(out.status).toBe('approved');
    expect(db.barrierMember.upsert).toHaveBeenCalled();
  });

  it('the pack lets Compliance and the MLRO decide crossings, and only the MLRO sees past the walls', () => {
    const decide = pack.operationalPermissions.filter((p) => p.entity_type === 'wall_crossing_decide').map((p) => p.role_name).sort();
    const override = pack.operationalPermissions.filter((p) => p.entity_type === 'barrier_override').map((p) => p.role_name);
    expect(decide).toEqual(['compliance_officer', 'mlro']);
    expect(override).toEqual(['mlro']);
  });
});

describe('access routes: who may decide crossings', () => {
  async function app(role, { grant = false, override = false } = {}) {
    jest.resetModules();
    jest.doMock('../src/middleware/authenticate', () => {
      const real = jest.requireActual('../src/middleware/authenticate');
      return { ...real, authenticate: async (req) => { req.user = { employee_id: 'U1', role, role_level: 5, tenant_id: 7 }; } };
    });
    jest.doMock('../src/services/access-scope.service', () => jest.fn().mockImplementation(() => ({
      forViewer: async () => ({ override, zoneIds: [], buIds: null, unrestricted: false }), invalidate: () => {},
    })));
    jest.doMock('../src/services/segmentation.service', () => jest.fn().mockImplementation(() => ({
      listCrossings: async () => [{ id: 1 }],
    })));
    jest.doMock('../src/services/audit-chain.service', () => jest.fn().mockImplementation(() => ({})));
    const routes = require('../src/routes/access');
    const f = Fastify();
    f.decorate('prisma', { operationalPermission: { findFirst: async ({ where }) => (grant && where.entity_type === 'wall_crossing_decide' ? { id: 1 } : null) } });
    f.setErrorHandler((err, _req, reply) => reply.code(err.statusCode ?? (err.name === 'AuthorizationError' ? 403 : 500)).send({ error: err.message }));
    await f.register(routes, { prefix: '/access' });
    return f;
  }
  afterEach(() => jest.dontMock('../src/middleware/authenticate'));

  it('a role holding wall_crossing_decide can list crossings', async () => {
    const f = await app('compliance_officer', { grant: true });
    const r = await f.inject({ method: 'GET', url: '/access/wall-crossings' });
    expect(r.statusCode).toBe(200);
  });

  it('a role without it is refused', async () => {
    const f = await app('trader');
    const r = await f.inject({ method: 'GET', url: '/access/wall-crossings' });
    expect(r.statusCode).toBe(403);
  });
});
