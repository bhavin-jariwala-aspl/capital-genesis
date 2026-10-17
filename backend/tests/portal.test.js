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

  it('lets an introducer sign in only from the configured stages (active, not applied or suspended)', async () => {
    const d = {
      ...db(true),
      uiObject: { findFirst: jest.fn().mockResolvedValue({ id: 1 }), findUnique: jest.fn().mockResolvedValue({ config: { portal_signin_stages: ['active'] } }) },
    };
    await new PortalService(d).requestCode(tenant, 'introducer', 'partner@example.mu');
    expect(d.recordFieldValue.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ field_name: 'portal_email', record: expect.objectContaining({ pipeline_stage: { name: { in: ['active'] } } }) }),
    }));
    d.uiObject.findUnique.mockResolvedValue({ config: {} });
    d.recordFieldValue.findFirst.mockClear();
    await new PortalService(d).requestCode(tenant, 'introducer', 'partner@example.mu');
    expect(d.recordFieldValue.findFirst.mock.calls[0][0].where.record).not.toHaveProperty('pipeline_stage');
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

describe('portal row actions (Redeem on a fund holding)', () => {
  const session = { tenant_id: 7, realm_kind: 'client', subject_id: 42 };
  const redeem = { key: 'redeem', label: 'Redeem', object: 'fund_order', fields: ['units', 'amount'], prefill: { share_class: 'share_class' }, defaults: { order_type: 'redemption' }, stage: 'captured' };
  const objects = [
    { id: 1, name: 'fund_holding', label: 'Holding', config: { portal: { client: { title: 'Fund holdings', link: 'party', fields: ['share_class'], row_actions: [redeem] } } },
      fields: [{ name: 'share_class', label: 'Share class', field_type: 'lookup', config: {} }] },
    { id: 2, name: 'fund_order', label: 'Order', config: { portal: { client: { title: 'Fund orders', link: 'party', fields: ['order_type'] } } },
      fields: ['units', 'amount', 'order_type', 'share_class'].map((n) => ({ name: n, label: n, field_type: n === 'order_type' ? 'select' : 'decimal', config: {} })) },
  ];
  const make = (owns = true) => {
    const records = { createRecord: jest.fn().mockResolvedValue({ id: 900 }) };
    const db = {
      uiObject: {
        findMany: jest.fn().mockResolvedValue(objects),
        findUnique: jest.fn(async ({ where }) => objects.find((o) => o.id === where.id)),
      },
      uiPipelineStage: { findFirst: jest.fn().mockResolvedValue({ id: 55 }) },
      recordFieldValue: {
        findFirst: jest.fn().mockResolvedValue(owns ? { record_id: 300 } : null),
        findMany: jest.fn().mockResolvedValue([{ record_id: 300, field_name: 'share_class', str_value: '17', num_value: null }]),
      },
    };
    return { svc: new PortalService(db, { recordService: records }), records, db };
  };

  it('lists the action on the holding section with the target object\'s fields', async () => {
    const views = await make().svc.views('client');
    expect(views.find((v) => v.object === 'fund_holding').row_actions).toEqual([
      expect.objectContaining({ key: 'redeem', label: 'Redeem', object: 'fund_order', fields: [expect.objectContaining({ name: 'units' }), expect.objectContaining({ name: 'amount' })] }),
    ]);
  });

  it('creates a redemption for the row\'s share class, ignoring an order type or share class in the request', async () => {
    const { svc, records } = make();
    await expect(svc.act(session, 'fund_holding', 300, 'redeem', { units: 10, order_type: 'subscription', share_class: 99 })).resolves.toEqual({ id: 900, object: 'fund_order' });
    expect(records.createRecord).toHaveBeenCalledWith(2, 55, expect.any(String), null, null, { units: 10, share_class: '17', order_type: 'redemption', party: 42 });
  });

  it('refuses someone else\'s holding and unknown actions', async () => {
    await expect(make(false).svc.act(session, 'fund_holding', 300, 'redeem', { units: 1 })).rejects.toThrow(/Record/);
    await expect(make().svc.act(session, 'fund_holding', 300, 'switch', {})).rejects.toThrow(/Action/);
  });
});
