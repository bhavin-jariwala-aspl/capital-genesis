'use strict';

const DocumentSignatureService = require('../src/services/document-signature.service');

/**
 * Stateful in-memory mock of the Prisma delegates the service touches.
 * `signatories` and `requests` are plain arrays we mutate to assert flow.
 */
function makePrisma({ doc = { id: 1, original_filename: 'contract.pdf', deleted_at: null, tenant_id: 3 }, requests = [], signatories = [] } = {}) {
  let reqAuto = requests.reduce((m, r) => Math.max(m, r.id), 0);
  return {
    _requests: requests,
    _signatories: signatories,
    document: { findFirst: jest.fn(async ({ where }) => (where.id === doc.id ? { ...doc } : null)) },
    documentSignatureRequest: {
      create: jest.fn(async ({ data }) => {
        const r = { id: ++reqAuto, status: data.status ?? 'sent', ordered: !!data.ordered, tenant_id: 3, document_id: data.document_id, expires_at: data.expires_at ?? null, title: data.title ?? null };
        requests.push(r);
        (data.signatories?.create ?? []).forEach((s, i) => signatories.push({ id: signatories.length + 1, request_id: r.id, status: 'pending', order_index: s.order_index ?? i, token: s.token, name: s.name, email: s.email, tenant_id: s.tenant_id }));
        return { ...r, signatories: signatories.filter(s => s.request_id === r.id) };
      }),
      findFirst: jest.fn(async ({ where }) => {
        const r = requests.find(x => x.id === where.id);
        return r ? { ...r, signatories: signatories.filter(s => s.request_id === r.id), document: doc } : null;
      }),
      findMany: jest.fn(async () => requests),
      update: jest.fn(async ({ where, data }) => { const r = requests.find(x => x.id === where.id); Object.assign(r, data); return r; }),
      updateMany: jest.fn(async ({ where, data }) => {
        const matched = requests.filter(r => r.id === where.id && (!where.status?.notIn || !where.status.notIn.includes(r.status)));
        matched.forEach(r => Object.assign(r, data));
        return { count: matched.length };
      }),
    },
    documentSignatory: {
      findFirst: jest.fn(async ({ where }) => signatories.find(s => s.token === where.token) ?? null),
      findMany:  jest.fn(async ({ where }) => signatories.filter(s => s.request_id === where.request_id && (where.order_index?.lt === undefined || s.order_index < where.order_index.lt))),
      count:     jest.fn(async ({ where }) => signatories.filter(s => s.request_id === where.request_id && s.status !== 'signed').length),
      update:    jest.fn(async ({ where, data }) => { const s = signatories.find(x => x.id === where.id); Object.assign(s, data); return s; }),
    },
  };
}

describe('DocumentSignatureService', () => {
  test('createRequest validates the document and requires signers', async () => {
    const svc = new DocumentSignatureService(makePrisma());
    await expect(svc.createRequest(999, { signers: [{ name: 'A', email: 'a@x.com' }] })).rejects.toThrow(/Document not found/);
    await expect(svc.createRequest(1, { signers: [] })).rejects.toThrow(/At least one signer/);
  });

  test('createRequest mints a unique token per signer', async () => {
    const svc = new DocumentSignatureService(makePrisma());
    const req = await svc.createRequest(1, { signers: [{ name: 'A', email: 'a@x.com' }, { name: 'B', email: 'b@x.com' }] });
    const tokens = req.signatories.map(s => s.token);
    expect(new Set(tokens).size).toBe(2);
    expect(tokens[0].length).toBeGreaterThanOrEqual(24);
  });

  test('createRequest stamps tenant_id on each nested signatory (regression: nested creates are not auto-scoped)', async () => {
    const svc = new DocumentSignatureService(makePrisma()); // doc.tenant_id = 3
    const req = await svc.createRequest(1, { signers: [{ name: 'A', email: 'a@x.com' }, { name: 'B', email: 'b@x.com' }] });
    expect(req.signatories.every(s => s.tenant_id === 3)).toBe(true);
  });

  test('resolveByToken rejects cancelled and expired requests', async () => {
    const cancelled = new DocumentSignatureService(makePrisma({
      requests: [{ id: 1, status: 'cancelled', document_id: 1 }],
      signatories: [{ id: 1, request_id: 1, token: 't', status: 'pending' }],
    }));
    expect(await cancelled.resolveByToken('t')).toBeNull();

    const expired = new DocumentSignatureService(makePrisma({
      requests: [{ id: 1, status: 'sent', document_id: 1, expires_at: new Date(Date.now() - 1000) }],
      signatories: [{ id: 1, request_id: 1, token: 't', status: 'pending' }],
    }));
    expect(await expired.resolveByToken('t')).toBeNull();
  });

  test('single-signer sign completes the request and generates a certificate', async () => {
    const uploads = [];
    const documents = { upload: jest.fn(async (p) => { uploads.push(p); return { id: 77 }; }) };
    const db = makePrisma({
      requests: [{ id: 1, status: 'sent', document_id: 1, ordered: false, tenant_id: 3, expires_at: null, title: 'NDA' }],
      signatories: [{ id: 1, request_id: 1, token: 't', status: 'viewed', order_index: 0, name: 'Ada', email: 'ada@x.com' }],
    });
    const svc = new DocumentSignatureService(db, documents);
    const resolved = await svc.resolveByToken('t');
    const res = await svc.sign(resolved, { type: 'typed', data: 'Ada Lovelace', ip: '9.9.9.9' });

    expect(res).toEqual({ signed: true, completed: true });
    expect(db._signatories[0].status).toBe('signed');
    expect(documents.upload).toHaveBeenCalledTimes(1);           // certificate generated
    expect(uploads[0].category).toBe('signature_certificate');
    expect(uploads[0].tenantId).toBe(3);                          // stamped from the request tenant
    expect(db._requests[0].status).toBe('completed');
    expect(db._requests[0].certificate_doc_id).toBe(77);
  });

  test('ordered request blocks a later signer until earlier ones sign', async () => {
    const db = makePrisma({
      requests: [{ id: 1, status: 'sent', document_id: 1, ordered: true, tenant_id: 3, expires_at: null }],
      signatories: [
        { id: 1, request_id: 1, token: 't1', status: 'pending', order_index: 0, name: 'First', email: 'f@x.com' },
        { id: 2, request_id: 1, token: 't2', status: 'pending', order_index: 1, name: 'Second', email: 's@x.com' },
      ],
    });
    const svc = new DocumentSignatureService(db, { upload: jest.fn() });
    const second = await svc.resolveByToken('t2');
    await expect(svc.sign(second, { type: 'typed', data: 'Second' })).rejects.toThrow(/earlier signer/);
  });

  test('decline marks the signatory and the request declined', async () => {
    const db = makePrisma({
      requests: [{ id: 1, status: 'sent', document_id: 1, tenant_id: 3, expires_at: null }],
      signatories: [{ id: 1, request_id: 1, token: 't', status: 'viewed', order_index: 0, name: 'A', email: 'a@x.com' }],
    });
    const svc = new DocumentSignatureService(db, { upload: jest.fn() });
    const resolved = await svc.resolveByToken('t');
    await svc.decline(resolved, { reason: 'Not authorised' });
    expect(db._signatories[0].status).toBe('declined');
    expect(db._requests[0].status).toBe('declined');
  });
});
