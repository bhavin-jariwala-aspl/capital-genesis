'use strict';

/**
 * Tenant-scope safety net.
 *
 *  1. Every Prisma model outside GLOBAL_MODELS must carry a `tenant_id` column,
 *     otherwise the extension would inject a filter Prisma rejects and every
 *     scoped query on that model would 500. Checked against the generated
 *     client's DMMF (no database needed).
 *  2. Shared-nullable models (system roles) are read as "mine OR system" and
 *     created as "mine".
 */

const { Prisma } = require('@prisma/client');
const { GLOBAL_MODELS, SHARED_NULLABLE_MODELS, injectTenantScope } = require('../src/middleware/tenant-scope');

describe('GLOBAL_MODELS covers every model without tenant_id', () => {
  const models = Prisma.dmmf.datamodel.models;

  it('lists only real models', () => {
    const names = new Set(models.map((m) => m.name));
    for (const g of GLOBAL_MODELS) expect(names.has(g)).toBe(true);
  });

  it('every non-global model has a tenant_id column', () => {
    const missing = models
      .filter((m) => !GLOBAL_MODELS.has(m.name))
      .filter((m) => !m.fields.some((f) => f.name === 'tenant_id'))
      .map((m) => m.name);
    expect(missing).toEqual([]);
  });

  it('shared-nullable models really have a nullable tenant_id', () => {
    for (const name of SHARED_NULLABLE_MODELS) {
      const m = models.find((x) => x.name === name);
      const f = m.fields.find((x) => x.name === 'tenant_id');
      expect(f.isRequired).toBe(false);
    }
  });
});

describe('injectTenantScope', () => {
  it('scopes reads and writes to the tenant', () => {
    expect(injectTenantScope('findMany', { where: { is_active: true } }, 5).where).toEqual({ is_active: true, tenant_id: 5 });
    expect(injectTenantScope('update', { where: { id: 1 }, data: {} }, 5).where).toEqual({ id: 1, tenant_id: 5 });
    expect(injectTenantScope('create', { data: { name: 'x' } }, 5).data).toEqual({ name: 'x', tenant_id: 5 });
    expect(injectTenantScope('createMany', { data: [{ a: 1 }, { a: 2 }] }, 5).data).toEqual([{ a: 1, tenant_id: 5 }, { a: 2, tenant_id: 5 }]);
  });

  it('reads shared models as "mine OR system" and honours an explicit system-only filter', () => {
    const scoped = injectTenantScope('findMany', { where: { is_active: true } }, 5, { shared: true });
    expect(scoped.where).toEqual({ AND: [{ is_active: true }, { OR: [{ tenant_id: 5 }, { tenant_id: null }] }] });

    const systemOnly = injectTenantScope('findFirst', { where: { name: 'admin', tenant_id: null } }, 5, { shared: true });
    expect(systemOnly.where).toEqual({ name: 'admin', tenant_id: null });

    const other = injectTenantScope('findFirst', { where: { name: 'admin', tenant_id: 9 } }, 5, { shared: true });
    expect(other.where.tenant_id).toBe(5); // cannot read another tenant's rows
  });

  it('creates on shared models still stamp the tenant', () => {
    expect(injectTenantScope('create', { data: { name: 'x' } }, 5, { shared: true }).data.tenant_id).toBe(5);
  });
});
