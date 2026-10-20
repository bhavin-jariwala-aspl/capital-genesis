'use strict';

/**
 * Builder ▸ Permissions ▸ Record Permissions — scopes on business records.
 *
 * The tab used to save `operational_permissions` rows (entity_type 'record')
 * that nothing read. They are now enforced, but only where an admin set one:
 * a role without a row keeps the level-based behaviour, so existing
 * workspaces (none of which had rows) are unaffected.
 */

const RecordService = require('../src/services/record.service');
const { NotFoundError, AuthorizationError } = require('../src/utils/errors');

const openScope = { forViewer: async () => ({}), canSee: () => true, whereFor: () => ({}), stampFor: async () => ({}) };
const userV = (id = 'E1', role = 'credit_analyst') => ({ role, role_level: 5, employee_id: id, tenant_id: 7 });
const managerV = (id = 'M1') => ({ role: 'loans_manager', role_level: 4, employee_id: id, tenant_id: 7 });

function makeSvc({ row = null, record = null, hierarchy = [], wide = [] } = {}) {
  RecordService.clearRecordScopeCache();
  const db = {
    operationalPermission: { findFirst: jest.fn(async ({ where }) => (where.entity_type === 'record' ? row : null)) },
    uiPermission: { findMany: jest.fn(async () => wide.map((entity_id) => ({ entity_id }))) },
    employeeHierarchy: { findMany: jest.fn(async ({ where }) => hierarchy.filter((h) => h.ancestor_id === where.ancestor_id && (where.depth === 1 ? h.depth === 1 : h.depth > 0))) },
    record: { findUnique: jest.fn(async () => record), findMany: jest.fn(async () => []) },
  };
  return { svc: new RecordService(db, null, null, null, null, openScope), db };
}

const row = (scopes) => ({ entity_type: 'record', role_name: 'credit_analyst', view_scope: 'own', create_scope: 'own', edit_scope: 'own', delete_scope: 'own', assign_scope: 'none', ...scopes });

describe('record view scope', () => {
  it('leaves a role without a Record Permissions row exactly as before', async () => {
    const { svc } = makeSvc();
    expect(await svc.accessWhere(userV('E1'))).toEqual({ OR: [{ created_by: 'E1' }, { assigned_to: 'E1' }] });
  });

  it('"all" lets a desk role see every record', async () => {
    const { svc } = makeSvc({ row: row({ view_scope: 'all' }) });
    expect(await svc.accessWhere(userV('E1'))).toEqual({});
  });

  it('"team" covers the viewer and direct reports only', async () => {
    const hierarchy = [{ ancestor_id: 'E1', descendant_id: 'E2', depth: 1 }, { ancestor_id: 'E1', descendant_id: 'E3', depth: 2 }];
    const { svc } = makeSvc({ row: row({ view_scope: 'team' }), hierarchy });
    expect(await svc.accessWhere(userV('E1'))).toEqual({ OR: [{ created_by: { in: ['E1', 'E2'] } }, { assigned_to: { in: ['E1', 'E2'] } }] });
  });

  it('"none" hides records, except objects the role sees in full', async () => {
    expect(await makeSvc({ row: row({ view_scope: 'none' }) }).svc.accessWhere(userV())).toEqual({ id: { in: [] } });
    // (another role name: object "all records" scopes are cached per role)
    expect(await makeSvc({ row: row({ view_scope: 'none' }), wide: [12] }).svc.accessWhere(userV('E1', 'back_office'))).toEqual({ OR: [{ object_id: { in: [12] } }] });
  });

  it('narrows a manager below the level default when set', async () => {
    const { svc } = makeSvc({ row: { ...row({ view_scope: 'own' }), role_name: 'loans_manager' } });
    expect(await svc.accessWhere(managerV('M1'))).toEqual({ OR: [{ created_by: { in: ['M1'] } }, { assigned_to: { in: ['M1'] } }] });
  });

  it('applies to opening a single record too', async () => {
    const { svc } = makeSvc({ row: row({ view_scope: 'own' }), record: { id: 5, object_id: 3, created_by: 'E9', assigned_to: 'E9', deleted_at: null } });
    await expect(svc.getRecord(5, userV('E1'))).rejects.toThrow(NotFoundError);
  });
});

describe('record action scopes', () => {
  const someoneElses = { id: 5, object_id: 12, created_by: 'E9', assigned_to: 'E9', deleted_at: null, tenant_id: 7 };

  it('"edit own" lets a role read every record but change only its own', async () => {
    // view via the object's "all records" scope; edit limited by the record row.
    const { svc } = makeSvc({ row: row({ view_scope: 'own', edit_scope: 'own' }), record: someoneElses, wide: [12] });
    const analyst = userV('E1', 'credit_reviewer');
    await expect(svc.updateRecord(5, 'E1', analyst, undefined, { note: 'x' })).rejects.toThrow(/only edit your own records/);
    await expect(svc.updateRecordStage(5, 2, 'E1', analyst)).rejects.toThrow(AuthorizationError);
  });

  it('refuses delete when delete_scope is none', async () => {
    const { svc } = makeSvc({ row: row({ view_scope: 'all', delete_scope: 'none' }), record: someoneElses });
    await expect(svc.deleteRecord(5, 'E1', userV('E1'))).rejects.toThrow(/may not delete records/);
  });

  it('refuses reassigning without assign scope, but allows an edit that keeps the owner', async () => {
    const own = { ...someoneElses, created_by: 'E1', assigned_to: 'E1' };
    const { svc } = makeSvc({ row: row({ view_scope: 'all', edit_scope: 'all', assign_scope: 'none' }), record: own });
    await expect(svc.updateRecord(5, 'E1', userV('E1'), 'E2', null)).rejects.toThrow(/may not assign records/);
  });

  it('refuses create when create_scope is none', async () => {
    const { svc } = makeSvc({ row: row({ create_scope: 'none' }) });
    await expect(svc.createRecord(3, null, 'E1', null, userV('E1'), { name: 'x' })).rejects.toThrow(/may not create records/);
  });

  it('never restricts an admin', async () => {
    const { svc } = makeSvc({ row: { ...row({ view_scope: 'none' }), role_name: 'admin' } });
    expect(await svc.accessWhere({ role: 'admin', role_level: 3, employee_id: 'A1', tenant_id: 7 })).toEqual({});
  });
});
