'use strict';

const DocumentShareService = require('../src/services/document-share.service');

function makePrisma({ doc = { id: 1, original_filename: 'a.pdf', deleted_at: null }, link = null } = {}) {
  const created = {};
  const events = [];
  return {
    _events: events,
    document: {
      findFirst: jest.fn(async ({ where }) => (where.id === doc.id ? doc : null)),
    },
    documentShareLink: {
      create:   jest.fn(async ({ data }) => ({ id: 10, view_count: 0, is_active: true, tenant_id: 3, ...data })),
      findFirst: jest.fn(async () => link),
      findMany: jest.fn(async () => (link ? [link] : [])),
      update:   jest.fn(async ({ where, data }) => { Object.assign(created, { id: where.id, data }); return { id: where.id, ...data }; }),
    },
    documentViewEvent: {
      create:   jest.fn(async ({ data }) => { const e = { id: events.length + 1, ...data }; events.push(e); return e; }),
      groupBy:  jest.fn(async () => [{ event_type: 'view', _count: { _all: 2 } }, { event_type: 'download', _count: { _all: 1 } }]),
      findMany: jest.fn(async () => events),
    },
    _updateSpy: () => created,
  };
}

describe('DocumentShareService', () => {
  test('createLink mints a token and honours an expiry window', async () => {
    const db = makePrisma();
    const svc = new DocumentShareService(db);
    const link = await svc.createLink(1, { expiresInDays: 7, allowDownload: false, createdBy: 'E1' });
    expect(link.token).toEqual(expect.any(String));
    expect(link.token.length).toBeGreaterThanOrEqual(24);
    expect(link.allow_download).toBe(false);
    expect(link.expires_at.getTime()).toBeGreaterThan(Date.now());
  });

  test('createLink rejects a missing document', async () => {
    const svc = new DocumentShareService(makePrisma());
    await expect(svc.createLink(999, {})).rejects.toThrow(/Document not found/);
  });

  test('resolveByToken rejects revoked and expired links', async () => {
    const revoked = new DocumentShareService(makePrisma({ link: { id: 10, is_active: false, document_id: 1 } }));
    expect(await revoked.resolveByToken('t')).toBeNull();

    const expired = new DocumentShareService(makePrisma({
      link: { id: 10, is_active: true, document_id: 1, expires_at: new Date(Date.now() - 1000) },
    }));
    expect(await expired.resolveByToken('t')).toBeNull();
  });

  test('resolveByToken returns link + document for a live token', async () => {
    const svc = new DocumentShareService(makePrisma({
      link: { id: 10, is_active: true, document_id: 1, expires_at: null, tenant_id: 3 },
    }));
    const res = await svc.resolveByToken('t');
    expect(res.document.original_filename).toBe('a.pdf');
  });

  test('recordEvent stamps tenant_id from the link and bumps views', async () => {
    const db = makePrisma();
    const svc = new DocumentShareService(db);
    await svc.recordEvent({ id: 10, document_id: 1, tenant_id: 3 }, { type: 'view', ip: '1.2.3.4' });
    expect(db._events[0].tenant_id).toBe(3);          // explicit — no tenant context on public routes
    expect(db._events[0].event_type).toBe('view');
    expect(db.documentShareLink.update).toHaveBeenCalled(); // counter bump on view
  });

  test('recordEvent does not bump the view counter on a download', async () => {
    const db = makePrisma();
    const svc = new DocumentShareService(db);
    await svc.recordEvent({ id: 10, document_id: 1, tenant_id: 3 }, { type: 'download' });
    expect(db._events[0].event_type).toBe('download');
    expect(db.documentShareLink.update).not.toHaveBeenCalled();
  });

  test('getAnalytics aggregates views/downloads and link counts', async () => {
    const svc = new DocumentShareService(makePrisma({
      link: { id: 10, is_active: true, document_id: 1 },
    }));
    const a = await svc.getAnalytics(1);
    expect(a.total_views).toBe(2);
    expect(a.total_downloads).toBe(1);
    expect(a.active_links).toBe(1);
    expect(a.total_links).toBe(1);
  });
});
