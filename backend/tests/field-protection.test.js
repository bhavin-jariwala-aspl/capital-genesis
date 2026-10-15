'use strict';

/**
 * Personal-data protection (PRD X-08, E-16): encryption at rest for fields
 * flagged `encrypt`, masking for fields flagged `pii` unless the viewer holds
 * the view-PII permission, an audited reveal, and a guard that a masked value
 * sent back by a form never overwrites the real one.
 */

process.env.FIELD_ENCRYPTION_KEY = 'a'.repeat(64);

const { encrypt, decrypt, mask, isEncrypted, _resetKey } = require('../src/services/field-protection');
const { fromTypedRow } = require('../src/services/crm-storage-map');

describe('field encryption', () => {
  beforeEach(() => _resetKey());

  it('round-trips and is non-deterministic', () => {
    const a = encrypt('R1204845400123');
    const b = encrypt('R1204845400123');
    expect(isEncrypted(a)).toBe(true);
    expect(a).not.toBe(b);
    expect(decrypt(a)).toBe('R1204845400123');
  });

  it('decrypts transparently wherever a typed value is read', () => {
    expect(fromTypedRow({ str_value: encrypt('P12345678') })).toBe('P12345678');
    expect(fromTypedRow({ str_value: 'plain' })).toBe('plain');
  });

  it('never shows ciphertext when the key is wrong or the value was tampered with', () => {
    const v = encrypt('secret');
    process.env.FIELD_ENCRYPTION_KEY = 'b'.repeat(64);
    _resetKey();
    expect(decrypt(v)).toBe('[encrypted]');
    process.env.FIELD_ENCRYPTION_KEY = 'a'.repeat(64);
    _resetKey();
    expect(decrypt(`${v.slice(0, -4)}AAAA`)).toBe('[encrypted]');
  });

  it('leaves empty and already-encrypted values alone', () => {
    expect(encrypt('')).toBe('');
    expect(encrypt(null)).toBe(null);
    const v = encrypt('x1234');
    expect(encrypt(v)).toBe(v);
  });
});

describe('masking', () => {
  it('keeps only the last four characters', () => {
    expect(mask('R1204845400123')).toBe('••••••••0123');
    expect(mask('123')).toBe('••••');
    expect(mask(185000)).toBe('••••••');
    expect(mask(null)).toBe(null);
  });
});

describe('RecordService — masking, reveal and the save guard', () => {
  const RecordService = require('../src/services/record.service');
  const record = { id: 7, object_id: 3, deleted_at: null, created_by: 'U1', assigned_to: 'U1', business_unit_id: null, barrier_zone_id: null, tenant_id: 1 };
  const fields = [{ name: 'id_number', config: { pii: true } }, { name: 'email', config: {} }];

  function db({ piiRole = false } = {}) {
    const appended = [];
    const d = {
      record: { findUnique: jest.fn().mockResolvedValue(record), update: jest.fn().mockResolvedValue(record) },
      uiField: { findMany: jest.fn().mockResolvedValue(fields) },
      uiObject: { findUnique: jest.fn().mockResolvedValue({ name: 'party', config: {} }) },
      recordFieldValue: { findUnique: jest.fn().mockResolvedValue({ str_value: encrypt('R1204845400123') }), findMany: jest.fn().mockResolvedValue([]) },
      operationalPermission: { findFirst: jest.fn().mockResolvedValue(piiRole ? { id: 1 } : null) },
      auditChainEvent: { create: jest.fn() },
      $transaction: jest.fn(async (fn) => { appended.push(true); return fn({ auditChainEvent: { findFirst: jest.fn().mockResolvedValue(null), create: jest.fn().mockResolvedValue({ id: 1 }) } }); }),
    };
    return { d, appended };
  }
  const user = (role) => ({ role, role_level: role === 'admin' ? 3 : 5, employee_id: 'U1', tenant_id: 1 });

  it('lets admins and view-PII roles reveal personal data, and no one else', async () => {
    expect(await new RecordService(db().d).canViewPii(user('admin'))).toBe(true);
    expect(await new RecordService(db({ piiRole: true }).d).canViewPii(user('compliance_officer'))).toBe(true);
    expect(await new RecordService(db().d).canViewPii(user('rm_masked'))).toBe(false);
    expect(await new RecordService(db().d).canViewPii(null)).toBe(true);
  });

  it('reveals a protected field to a view-PII role and writes it to the audit chain', async () => {
    const { d, appended } = db({ piiRole: true });
    const svc = new RecordService(d);
    const out = await svc.revealField(7, 'id_number', user('compliance_reveal'));
    expect(out).toEqual({ field: 'id_number', value: 'R1204845400123' });
    expect(appended.length).toBe(1);
  });

  it('refuses a reveal to a role without the view-PII permission, and audits nothing', async () => {
    const { d, appended } = db();
    await expect(new RecordService(d).revealField(7, 'id_number', user('rm_noreveal'))).rejects.toThrow(/may not view personal data/);
    expect(appended.length).toBe(0);
  });

  it('masks on screen for everyone; only view-PII roles get can_reveal; exports stay unmasked for them', async () => {
    const rows = [{ id: 7, data: { id_number: 'R1204845400123', income_band: 'gt_3m', email: 'a@example.com' } }];
    const flds = [...fields, { name: 'income_band', field_type: 'select', config: { pii: true } }];
    const mk = (piiRole) => { const { d } = db({ piiRole }); d.uiField.findMany.mockResolvedValue(flds); return new RecordService(d); };
    const rm = await mk(false)._maskForTest(3, rows, user('rm_list'));
    expect(rm[0].data.id_number).toBe('••••••••0123');
    expect(rm[0].data.income_band).toBe('••••••');
    expect(rm[0].data.email).toBe('a@example.com');
    expect(rm[0].can_reveal).toBe(false);
    const co = await mk(true)._maskForTest(3, rows, user('compliance_list'));
    expect(co[0].masked).toEqual(['id_number', 'income_band']);
    expect(co[0].can_reveal).toBe(true);
    const exp = await mk(true)._maskForTest(3, rows, user('compliance_exp'), { onDemand: false });
    expect(exp[0].data.id_number).toBe('R1204845400123');
  });

  it('refuses to "reveal" a field that is not protected', async () => {
    await expect(new RecordService(db().d).revealField(7, 'email', user('rm_x'))).rejects.toThrow(/not a protected field/);
  });
});
