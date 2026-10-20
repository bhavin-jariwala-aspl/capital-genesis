'use strict';

/**
 * POST /api/builder/push-notifications — recipient resolution.
 *
 * `Employee.role` is the role's name as plain text. The "By Role" target used
 * to filter `role: { name: { in } }`, a relation filter Prisma rejects on a
 * string column, so every role send failed. The stub below rejects that shape
 * the way Prisma does.
 */

jest.mock('../src/middleware/authenticate', () => {
  const actual = jest.requireActual('../src/middleware/authenticate');
  const asAdmin = async (req) => { req.user = { employee_id: 'GCADMIN', role: 'admin', role_level: 3, tenant_id: 7 }; };
  return { ...actual, authenticate: asAdmin, requireAdmin: asAdmin };
});

const mockBroadcast = jest.fn().mockResolvedValue(undefined);
jest.mock('../src/services/notification.service', () => jest.fn().mockImplementation(() => ({ broadcastNotification: mockBroadcast })));

const Fastify = require('fastify');
const builderRoutes = require('../src/routes/builder/index');

const STAFF = [
  { employee_id: 'GCRM1', role: 'rm', is_active: true },
  { employee_id: 'GCRM2', role: 'rm', is_active: true },
  { employee_id: 'GCCOMP1', role: 'compliance_officer', is_active: true },
  { employee_id: 'GCOLD', role: 'rm', is_active: false },
];

function makePrisma() {
  const matches = (e, where) => {
    if (where.is_active !== undefined && e.is_active !== where.is_active) return false;
    if (where.role !== undefined) {
      if (typeof where.role === 'object' && !('in' in where.role)) {
        throw new Error('Invalid `prisma.employee.findMany()` invocation: Argument `role`: Invalid value provided. Expected String or StringFilter');
      }
      if (!where.role.in.includes(e.role)) return false;
    }
    if (where.employee_id?.in && !where.employee_id.in.includes(e.employee_id)) return false;
    return true;
  };
  return {
    employee: { findMany: jest.fn(async ({ where }) => STAFF.filter((e) => matches(e, where)).map(({ employee_id }) => ({ employee_id }))) },
    pushNotificationLog: { create: jest.fn(async ({ data }) => ({ id: 1, ...data })), findMany: jest.fn(async () => []) },
  };
}

async function send(body) {
  const prisma = makePrisma();
  const app = Fastify();
  app.decorate('prisma', prisma);
  app.decorate('redis', null);
  app.decorate('eventBus', { emit: () => {}, on: () => {}, subscribe: () => {}, publish: async () => {} });
  app.decorate('workflowEngine', {});
  app.decorate('integrationService', {});
  await app.register(builderRoutes, { prefix: '/api/builder' });
  const res = await app.inject({ method: 'POST', url: '/api/builder/push-notifications', payload: body });
  await app.close();
  return { res, prisma };
}

beforeEach(() => mockBroadcast.mockClear());

describe('push notification recipients', () => {
  it('sends to every active holder of the chosen roles', async () => {
    const { res } = await send({ title: 'Rates change', target_type: 'role', target_value: ['rm', 'compliance_officer'] });
    expect(res.statusCode).toBeLessThan(300);
    expect(mockBroadcast.mock.calls[0][0].sort()).toEqual(['GCCOMP1', 'GCRM1', 'GCRM2']);
    expect(res.json().data.recipient_count).toBe(3);
  });

  it('says so when a role has no active holder, instead of logging an empty send', async () => {
    const { res, prisma } = await send({ title: 'x', target_type: 'role', target_value: ['fx_dealer'] });
    expect(res.statusCode).toBe(422);
    expect(prisma.pushNotificationLog.create).not.toHaveBeenCalled();
  });

  it('only sends to active staff of the workspace when employees are picked', async () => {
    const { res } = await send({ title: 'x', target_type: 'employee', target_value: ['GCRM1', 'GCOLD', 'NOBODY'] });
    expect(res.statusCode).toBeLessThan(300);
    expect(mockBroadcast.mock.calls[0][0]).toEqual(['GCRM1']);
  });
});
