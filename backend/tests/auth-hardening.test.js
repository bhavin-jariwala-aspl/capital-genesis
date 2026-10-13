'use strict';

/**
 * Session hardening (PRD E-01 / E-02): TOTP, MFA sign-in, rotating refresh
 * tokens with reuse detection, and access-token revocation.
 */

process.env.FIELD_ENCRYPTION_KEY = 'c'.repeat(64);

const bcrypt = require('bcryptjs');
const { totp, verifyTotp, generateSecret, recoveryCodes, hashRecovery, base32Encode } = require('../src/utils/totp');
const { isRevoked, markRevoked, _reset } = require('../src/services/session-revocation');
const { encrypt } = require('../src/services/field-protection');
const AuthService = require('../src/services/auth.service');

describe('TOTP (RFC 6238)', () => {
  // RFC 6238 appendix B test secret "12345678901234567890" (SHA-1), last 6 digits.
  const secret = base32Encode(Buffer.from('12345678901234567890'));
  it.each([[59, '287082'], [1111111109, '081804'], [1234567890, '005924'], [2000000000, '279037']])('at %ss gives %s', (t, code) => {
    expect(totp(secret, t * 1000)).toBe(code);
  });
  it('accepts the adjacent step and rejects others', () => {
    const s = generateSecret();
    const now = Date.now();
    expect(verifyTotp(s, totp(s, now - 30000), now)).toBe(true);
    expect(verifyTotp(s, totp(s, now - 120000), now)).toBe(false);
    expect(verifyTotp(s, 'abcdef', now)).toBe(false);
  });
  it('issues ten single-use recovery codes, hashed independent of formatting', () => {
    const { codes, hashes } = recoveryCodes();
    expect(codes).toHaveLength(10);
    expect(hashRecovery(codes[0].toLowerCase().replace('-', ''))).toBe(hashes[0]);
  });
});

describe('access-token revocation', () => {
  beforeEach(() => _reset());
  const prisma = (row) => ({ employee: { findUnique: jest.fn().mockResolvedValue(row) } });

  it('rejects tokens issued before tokens_valid_after, accepts later ones', async () => {
    const after = new Date('2026-10-14T10:00:00Z');
    const db = prisma({ tokens_valid_after: after, is_active: true });
    expect(await isRevoked(db, { employee_id: 'E1', iat: after.getTime() / 1000 - 60 })).toBe(true);
    _reset();
    expect(await isRevoked(db, { employee_id: 'E1', iat: after.getTime() / 1000 + 5 })).toBe(false);
  });
  it('treats a deactivated or missing employee as revoked', async () => {
    expect(await isRevoked(prisma({ tokens_valid_after: null, is_active: false }), { employee_id: 'E2', iat: 1 })).toBe(true);
    _reset();
    expect(await isRevoked(prisma(null), { employee_id: 'E3', iat: 1 })).toBe(true);
  });
  it('applies a local revocation immediately', async () => {
    markRevoked('E4', Date.now());
    expect(await isRevoked(prisma({ tokens_valid_after: null, is_active: true }), { employee_id: 'E4', iat: Math.floor(Date.now() / 1000) - 10 })).toBe(true);
  });
});

describe('AuthService sessions and MFA', () => {
  const jwt = {
    sign: jest.fn((payload) => `jwt.${Buffer.from(JSON.stringify(payload)).toString('base64url')}`),
    verify: jest.fn((t) => JSON.parse(Buffer.from(String(t).slice(4), 'base64url').toString())),
  };
  let hashed;
  beforeAll(async () => { hashed = await bcrypt.hash('Secret123!', 4); });

  function db(employee, { tokens = [] } = {}) {
    const store = [...tokens];
    return {
      employee: {
        findUnique: jest.fn().mockResolvedValue(employee),
        update: jest.fn(async ({ data }) => Object.assign(employee, data)),
      },
      role: { findFirst: jest.fn().mockResolvedValue({ level: 5 }) },
      securityPolicy: { findMany: jest.fn().mockResolvedValue([]) },
      authRefreshToken: {
        create: jest.fn(async ({ data }) => { const row = { id: store.length + 1, created_at: new Date(), revoked_at: null, ...data }; store.push(row); return row; }),
        findUnique: jest.fn(async ({ where }) => store.find((r) => r.token_hash === where.token_hash) ?? null),
        update: jest.fn(async ({ where, data }) => Object.assign(store.find((r) => r.id === where.id), data)),
        updateMany: jest.fn(async ({ where, data }) => { store.filter((r) => (!where.family || r.family === where.family) && (!where.employee_id || r.employee_id === where.employee_id) && r.revoked_at === null).forEach((r) => Object.assign(r, data)); return { count: 1 }; }),
      },
      tenant: { findUnique: jest.fn().mockResolvedValue(null) },
      _store: store,
    };
  }
  const emp = (extra = {}) => ({ employee_id: 'E1', employee_name: 'A', role: 'user', password: hashed, is_active: true, tenant_id: null, mfa_enabled: false, ...extra });

  it('rotates refresh tokens and revokes the family when an old one is reused', async () => {
    const d = db(emp());
    const svc = new AuthService(d, jwt);
    const s1 = await svc.login('E1', 'Secret123!');
    expect(s1.refresh_token).toBeTruthy();
    const s2 = await svc.refresh(s1.refresh_token);
    expect(s2.refresh_token).not.toBe(s1.refresh_token);
    await expect(svc.refresh(s1.refresh_token)).rejects.toThrow(/sign in again/);
    // Reuse of a rotated token killed the live one too.
    await expect(svc.refresh(s2.refresh_token)).rejects.toThrow(/sign in again/);
  });

  it('refuses refresh tokens issued before a revocation', async () => {
    const e = emp();
    const d = db(e);
    const svc = new AuthService(d, jwt);
    const s1 = await svc.login('E1', 'Secret123!');
    await svc.revokeAll('E1');
    await expect(svc.refresh(s1.refresh_token)).rejects.toThrow(/sign in again/);
  });

  it('asks for a second factor instead of issuing a session when MFA is on', async () => {
    const secret = generateSecret();
    const e = emp({ mfa_enabled: true, mfa_secret: encrypt(secret), mfa_recovery: [hashRecovery('ABCDE-12345')] });
    const svc = new AuthService(db(e), jwt);
    const first = await svc.login('E1', 'Secret123!');
    expect(first.token).toBeUndefined();
    expect(first.mfa_required).toBe(true);
    await expect(svc.verifyMfa(first.mfa_token, '000000')).rejects.toThrow(/Invalid code/);
    const ok = await svc.verifyMfa(first.mfa_token, totp(secret));
    expect(ok.token).toBeTruthy();
    // A recovery code works once.
    const again = await svc.login('E1', 'Secret123!');
    await expect(svc.verifyMfa(again.mfa_token, 'abcde12345')).resolves.toHaveProperty('token');
    await expect(svc.verifyMfa(again.mfa_token, 'abcde12345')).rejects.toThrow(/Invalid code/);
  });

  it('never lets an MFA challenge token act as a session', async () => {
    const { authenticate } = require('../src/middleware/authenticate');
    const req = { headers: { authorization: 'Bearer x' }, server: { jwt: { verify: () => ({ purpose: 'mfa', sub: 'E1' }) } } };
    await expect(authenticate(req)).rejects.toThrow(/Invalid or expired token/);
  });
});
