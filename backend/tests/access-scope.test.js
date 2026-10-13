'use strict';

/**
 * Business-unit scope and information barriers — the leak tests.
 *
 * A barrier leak exposes price-sensitive information, so these pin the rules
 * at the service layer: who sees a zoned record, that admins are bound by
 * barriers, that units restrict non-admins only, and that a database failure
 * fails closed rather than open.
 */

const AccessScopeService = require('../src/services/access-scope.service');
const { NotFoundError } = require('../src/utils/errors');

const USER    = { employee_id: 'RM1',  role: 'user',  role_level: 5 };
const ADMIN   = { employee_id: 'ADM1', role: 'admin', role_level: 3 };
const COMPLY  = { employee_id: 'CMP1', role: 'compliance_officer', role_level: 5 };

// The scope cache is shared process-wide (so invalidation reaches every route
// plugin); clear it between cases that reuse the same employee ids.
beforeEach(() => new AccessScopeService({}).invalidate());

function db({ units = {}, zones = {}, overrides = [], objects = {}, bus = {}, zoneCodes = {} } = {}) {
  return {
    employeeBusinessUnit: { findMany: jest.fn(async ({ where }) => (units[where.employee_id] ?? []).map((id) => ({ business_unit_id: id }))) },
    barrierMember: { findMany: jest.fn(async ({ where }) => (zones[where.employee_id] ?? []).map((id) => ({ zone_id: id }))) },
    operationalPermission: { findFirst: jest.fn(async ({ where }) => (overrides.includes(where.role_name) ? { id: 1 } : null)) },
    uiObject: { findUnique: jest.fn(async ({ where }) => ({ config: objects[where.id] ?? null })) },
    businessUnit: { findFirst: jest.fn(async ({ where }) => (bus[where.code] ? { id: bus[where.code] } : null)) },
    barrierZone: { findFirst: jest.fn(async ({ where }) => (zoneCodes[where.code] ? { id: zoneCodes[where.code] } : null)) },
  };
}

describe('AccessScopeService — who sees what', () => {
  it('hides every zoned record from someone outside the zone', async () => {
    const svc = new AccessScopeService(db());
    const scope = await svc.forViewer(USER);
    expect(svc.canSee(scope, { barrier_zone_id: 7 })).toBe(false);
    expect(svc.canSee(scope, { barrier_zone_id: null })).toBe(true);
    expect(svc.whereFor(scope)).toEqual({ AND: [{ barrier_zone_id: null }] });
  });

  it('binds admins to barriers too — administering the CRM is not a reason to read deals', async () => {
    const svc = new AccessScopeService(db());
    const scope = await svc.forViewer(ADMIN);
    expect(svc.canSee(scope, { barrier_zone_id: 7 })).toBe(false);
    expect(scope.buIds).toBeNull(); // …but business units do not restrict admins
  });

  it('lets zone members and barrier-override roles in', async () => {
    const svc = new AccessScopeService(db({ zones: { RM1: [7] }, overrides: ['compliance_officer'] }));
    const member = await svc.forViewer(USER);
    expect(svc.canSee(member, { barrier_zone_id: 7 })).toBe(true);
    expect(svc.canSee(member, { barrier_zone_id: 8 })).toBe(false);
    const compliance = await svc.forViewer(COMPLY);
    expect(svc.canSee(compliance, { barrier_zone_id: 8 })).toBe(true);
    expect(svc.whereFor(compliance)).toEqual({});
  });

  it('asks only for unexpired memberships, so a lapsed wall-crossing stops working', async () => {
    const d = db();
    await new AccessScopeService(d).forViewer(USER);
    const where = d.barrierMember.findMany.mock.calls[0][0].where;
    expect(where.OR).toEqual([{ valid_to: null }, { valid_to: { gt: expect.any(Date) } }]);
  });

  it('restricts a non-admin with unit memberships to those units plus unit-less records', async () => {
    const svc = new AccessScopeService(db({ units: { RM1: [1, 2] } }));
    const scope = await svc.forViewer(USER);
    expect(svc.canSee(scope, { business_unit_id: 2 })).toBe(true);
    expect(svc.canSee(scope, { business_unit_id: 3 })).toBe(false);
    expect(svc.canSee(scope, { business_unit_id: null })).toBe(true);
    expect(svc.whereFor(scope).AND[0]).toEqual({ OR: [{ business_unit_id: null }, { business_unit_id: { in: [1, 2] } }] });
  });

  it('leaves an employee with no unit memberships unrestricted by unit', async () => {
    const svc = new AccessScopeService(db());
    expect((await svc.forViewer(USER)).buIds).toBeNull();
  });

  it('treats a system context (no viewer) as unrestricted', async () => {
    const svc = new AccessScopeService(db());
    expect(svc.whereFor(await svc.forViewer(null))).toEqual({});
  });

  it('fails closed when the membership query errors', async () => {
    const d = db();
    d.employeeBusinessUnit.findMany.mockRejectedValue(new Error('db down'));
    await expect(new AccessScopeService(d).forViewer(USER)).rejects.toThrow('db down');
  });
});

describe('AccessScopeService — stamping records from object config', () => {
  it('resolves the unit from a code field and the zone from object default', async () => {
    const svc = new AccessScopeService(db({
      objects: { 5: { business_unit_field: 'business_unit', barrier_zone: 'ADV_PRIVATE' } },
      bus: { LND: 11 }, zoneCodes: { ADV_PRIVATE: 21 },
    }));
    expect(await svc.stampFor(5, { business_unit: 'LND' })).toEqual({ business_unit_id: 11, barrier_zone_id: 21 });
  });

  it('touches nothing for an object with no segmentation config', async () => {
    const svc = new AccessScopeService(db());
    expect(await svc.stampFor(9, { business_unit: 'LND' })).toEqual({});
  });
});

describe('RecordService — barrier enforcement on reads', () => {
  const RecordService = require('../src/services/record.service');

  it('answers 404 (not 403) for a zoned record outside the viewer\'s zones, even for an admin', async () => {
    const prisma = {
      record: { findUnique: jest.fn(async () => ({ id: 1, object_id: 2, created_by: 'X', assigned_to: null, deleted_at: null, barrier_zone_id: 7, business_unit_id: null, object: { name: 'advisory_mandate' } })) },
    };
    const svc = new RecordService(prisma, null, null, null, null, new AccessScopeService(db()));
    await expect(svc.getRecord(1, ADMIN)).rejects.toBeInstanceOf(NotFoundError);
  });

  it('adds the barrier filter to list queries', async () => {
    const prisma = {
      uiObject: { findUnique: jest.fn(async () => ({ name: 'advisory_mandate' })) },
      record: { findMany: jest.fn(async () => []) },
    };
    const svc = new RecordService(prisma, null, null, null, null, new AccessScopeService(db()));
    await svc.getRecords(2, null, ADMIN);
    expect(prisma.record.findMany.mock.calls[0][0].where).toMatchObject({ AND: [{ barrier_zone_id: null }] });
  });
});
