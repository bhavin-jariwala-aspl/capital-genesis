'use strict';

/** Client & introducer portal (PRD M23): separate token realm, one-time codes, upload checks. */

const PortalService = require('../src/services/portal.service');
const { signToken, verifyToken } = PortalService;

describe('portal tokens', () => {
  it('round-trips and carries the realm', () => {
    const t = signToken({ tenant_id: 6, realm_kind: 'client', subject_id: 42 });
    expect(t.startsWith('gp1.')).toBe(true);
    expect(verifyToken(t)).toMatchObject({ tenant_id: 6, realm_kind: 'client', subject_id: 42, realm: 'portal' });
  });
  it('rejects tampering, other formats and expired tokens', () => {
    const t = signToken({ tenant_id: 6, realm_kind: 'client', subject_id: 42 });
    const [p, body, sig] = t.split('.');
    const forged = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(body, 'base64url')), subject_id: 43 })).toString('base64url');
    expect(verifyToken(`${p}.${forged}.${sig}`)).toBeNull();
    expect(verifyToken('eyJhbGciOiJIUzI1NiJ9.e30.x')).toBeNull(); // a staff-style JWT
    expect(verifyToken(null)).toBeNull();
    jest.useFakeTimers().setSystemTime(Date.now() + 9 * 60 * 60 * 1000);
    expect(verifyToken(t)).toBeNull();
    jest.useRealTimers();
  });
});

describe('portal sign-in codes', () => {
  const tenant = { id: 6, name: 'Genesis Capital' };
  const db = (known) => ({
    uiObject: { findFirst: jest.fn().mockResolvedValue({ id: 1 }) },
    recordFieldValue: { findFirst: jest.fn().mockResolvedValue(known ? { record_id: 42 } : null) },
    emailTemplate: { findFirst: jest.fn().mockResolvedValue(null) },
  });

  it('answers the same way for unknown emails and never reveals a code for them', async () => {
    const out = await new PortalService(db(false)).requestCode(tenant, 'client', 'nobody@example.mu');
    expect(out).toEqual({ sent: true, message: expect.any(String) });
  });

  it('accepts the right code once and locks after five wrong attempts', async () => {
    const svc = new PortalService(db(true));
    const { dev_code: code } = await svc.requestCode(tenant, 'client', 'Anne@Example.mu');
    expect(code).toMatch(/^\d{6}$/);
    const wrong = code === '000000' ? '111111' : '000000';
    await expect(svc.verifyCode(tenant, 'client', 'anne@example.mu', wrong)).rejects.toThrow(/Incorrect/);
    const { token } = await svc.verifyCode(tenant, 'client', 'anne@example.mu', code);
    expect(verifyToken(token)).toMatchObject({ subject_id: 42, realm_kind: 'client' });
    await expect(svc.verifyCode(tenant, 'client', 'anne@example.mu', code)).rejects.toThrow(/expired/); // single use

    const { dev_code: again } = await svc.requestCode(tenant, 'client', 'anne@example.mu');
    for (let i = 0; i < 5; i += 1) await expect(svc.verifyCode(tenant, 'client', 'anne@example.mu', again === '000000' ? '111111' : '000000')).rejects.toThrow(/Incorrect/);
    await expect(svc.verifyCode(tenant, 'client', 'anne@example.mu', again)).rejects.toThrow(/Too many/);
  });

  it('refuses an unknown realm', async () => {
    await expect(new PortalService(db(true)).requestCode(tenant, 'staff', 'a@b.mu')).rejects.toThrow(/Unknown portal/);
  });
});

describe('portal uploads', () => {
  const session = { tenant_id: 6, realm_kind: 'client', subject_id: 42 };
  const make = () => {
    const docs = { upload: jest.fn().mockResolvedValue({ id: 9 }) };
    const svc = new PortalService({
      uiObject: { findMany: jest.fn().mockResolvedValue([{ id: 3, name: 'service_request', label: 'Request', config: { portal: { client: { title: 'Requests', link: 'party', fields: ['subject'], uploads: true } } }, fields: [{ name: 'subject', label: 'Subject', field_type: 'text', config: {} }] }]) },
      record: { findUnique: jest.fn().mockResolvedValue({ id: 77, object_id: 3, deleted_at: null, object: { name: 'service_request' } }) },
      recordFieldValue: { findFirst: jest.fn().mockResolvedValue({ id: 1 }) },
    }, { documentService: docs });
    return { svc, docs };
  };
  const b64 = (buf) => Buffer.from(buf).toString('base64');

  it('stores a real PDF against the client\'s own record', async () => {
    const { svc, docs } = make();
    await expect(svc.upload(session, 77, { filename: 'id.pdf', mime_type: 'application/pdf', data: b64('%PDF-1.7 test') })).resolves.toEqual({ id: 9, duplicate: false });
    expect(docs.upload).toHaveBeenCalledWith(expect.objectContaining({ entityId: 77, uploadedBy: 'portal:c:42' }));
  });

  it('refuses content that does not match the declared type', async () => {
    const { svc, docs } = make();
    await expect(svc.upload(session, 77, { filename: 'id.pdf', mime_type: 'application/pdf', data: b64('<html><script>alert(1)</script>') })).rejects.toThrow(/does not match/);
    await expect(svc.upload(session, 77, { filename: 'x.png', mime_type: 'image/png', data: b64('MZ\x90\x00') })).rejects.toThrow(/does not match/);
    await expect(svc.upload(session, 77, { filename: 'x.exe', mime_type: 'application/x-msdownload', data: b64('MZ') })).rejects.toThrow(/PDF, JPEG or PNG/);
    expect(docs.upload).not.toHaveBeenCalled();
  });
});
