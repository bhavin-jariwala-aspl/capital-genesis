'use strict';

const MetadataService = require('../src/services/metadata.service');

/**
 * Module / object writes take a whitelist. They used to spread the request
 * body into Prisma, so an admin of one tenant could send `tenant_id` and move
 * a module or object into another tenant.
 */
function svc() {
  const db = {
    uiModule: { create: jest.fn(async ({ data }) => data), update: jest.fn(async ({ data }) => data) },
    uiObject: {
      create: jest.fn(async ({ data }) => data),
      update: jest.fn(async ({ data }) => data),
      findUnique: jest.fn(async () => ({ id: 1, module_id: 2 })),
    },
  };
  const cache = { del: jest.fn(), key: (...k) => k.join(':'), invalidateModule: jest.fn(), invalidateObject: jest.fn() };
  return { s: new MetadataService(db, cache), db };
}

describe('MetadataService — writable columns', () => {
  it('drops tenant_id and ids from a module create/update', async () => {
    const { s, db } = svc();
    await s.createModule({ name: 'lending', category: 'lending', tenant_id: 99, id: 5 });
    expect(db.uiModule.create.mock.calls[0][0].data).toEqual({ label: 'lending', name: 'lending', category: 'lending' });
    await s.updateModule(3, { label: 'Lending', tenant_id: 99, created_at: 'x' });
    expect(db.uiModule.update.mock.calls[0][0].data).toEqual({ label: 'Lending' });
  });

  it('keeps object config but never tenant_id', async () => {
    const { s, db } = svc();
    await s.updateObject(1, { label: 'Party', config: { title_field: 'display_name' }, tenant_id: 99, fields: [] });
    expect(db.uiObject.update.mock.calls[0][0].data).toEqual({ label: 'Party', config: { title_field: 'display_name' } });
    await s.createObject({ module_id: '2', name: 'party', is_active: 'true', tenant_id: 99 });
    expect(db.uiObject.create.mock.calls[0][0].data).toEqual({ label: 'party', module_id: 2, name: 'party', is_active: true });
  });
});
