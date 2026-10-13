'use strict';

const { injectTenantScope } = require('../src/middleware/tenant-scope');

/**
 * A scoped update must not be able to re-home a row. The WHERE is pinned to
 * the caller's tenant, but several services spread a request body into
 * `data`, so a body carrying `tenant_id` used to move one of the caller's own
 * rows into another tenant.
 */
describe('tenant scope — writes cannot move rows between tenants', () => {
  it('pins data.tenant_id on update and updateMany', () => {
    const a = injectTenantScope('update', { where: { id: 1 }, data: { label: 'x', tenant_id: 99 } }, 7);
    expect(a.data.tenant_id).toBe(7);
    expect(a.where.tenant_id).toBe(7);
    const b = injectTenantScope('updateMany', { where: {}, data: { tenant_id: 99 } }, 7);
    expect(b.data.tenant_id).toBe(7);
  });

  it('pins the update branch of an upsert', () => {
    const a = injectTenantScope('upsert', { where: { id: 1 }, create: { tenant_id: 99 }, update: { tenant_id: 99 } }, 7);
    expect(a.create.tenant_id).toBe(7);
    expect(a.update.tenant_id).toBe(7);
  });

  it('leaves an update that does not mention tenant_id alone', () => {
    const a = injectTenantScope('update', { where: { id: 1 }, data: { label: 'x' } }, 7);
    expect(a.data).toEqual({ label: 'x' });
  });
});
