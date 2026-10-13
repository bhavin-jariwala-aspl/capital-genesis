'use strict';

/**
 * Auth service — unit tests for JWT payload shape and login flow.
 * Prisma is mocked; no real DB needed.
 */

const bcrypt      = require('bcryptjs');
const AuthService = require('../src/services/auth.service');

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeEmployee(overrides = {}) {
  return {
    employee_id:   'E001',
    employee_name: 'Alice',
    email:         'alice@example.com',
    role:          'user',
    // bcrypt hash assigned in beforeAll; placeholder until then
    passwordHash:  null,
    is_active:     true,
    branch_id:     1,
    region_id:     1,
    branch: { branch_id: 1, branch_name: 'HQ' },
    region: { region_id: 1, region_name: 'North' },
    ...overrides,
  };
}

function makePrisma(employee) {
  return {
    employee: {
      findUnique: jest.fn().mockResolvedValue(employee),
    },
    role: {
      findFirst: jest.fn().mockResolvedValue({ level: 5 }),
    },
  };
}

function makeJwt() {
  return { sign: jest.fn((payload) => JSON.stringify(payload)) };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('AuthService', () => {
  // Allow overriding the test password via env var to avoid hardcoding (CWE-798)
  const PASSWORD = process.env.TEST_AUTH_PASSWORD || 'Secret123!';
  let hashedPassword;

  beforeAll(async () => {
    hashedPassword = await bcrypt.hash(PASSWORD, 10);
  });

  describe('login', () => {
    it('throws when employee is not found', async () => {
      const svc = new AuthService(makePrisma(null), makeJwt());
      await expect(svc.login('E999', 'any')).rejects.toThrow();
    });

    it('throws when employee is inactive', async () => {
      const emp = makeEmployee({ password: hashedPassword, is_active: false });
      const svc = new AuthService(makePrisma(emp), makeJwt());
      await expect(svc.login('E001', PASSWORD)).rejects.toThrow();
    });

    it('throws on wrong password', async () => {
      const emp = makeEmployee({ password: hashedPassword });
      const svc = new AuthService(makePrisma(emp), makeJwt());
      await expect(svc.login('E001', 'WRONG_PASS')).rejects.toThrow();
    });

    it('returns token and employee on correct credentials', async () => {
      const emp = makeEmployee({ password: hashedPassword });
      const svc = new AuthService(makePrisma(emp), makeJwt());
      const result = await svc.login('E001', PASSWORD);
      expect(result).toHaveProperty('token');
      expect(result).toHaveProperty('employee');
    });

    it('JWT payload includes both employeeId and employee_id alias', async () => {
      const emp = makeEmployee({ password: hashedPassword });
      const jwt = makeJwt();
      const svc = new AuthService(makePrisma(emp), jwt);
      await svc.login('E001', PASSWORD);
      // jwt.sign mock returns JSON.stringify(payload) — parse it to inspect
      const payload = JSON.parse(jwt.sign.mock.results[0].value);
      expect(payload.employeeId).toBe('E001');
      expect(payload.employee_id).toBe('E001');
      expect(payload.sub).toBe('E001');
    });
  });
});
