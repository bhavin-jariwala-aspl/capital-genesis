'use strict';

const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { AuthenticationError, NotFoundError, ValidationError } = require('../utils/errors');
const { BaseRepository } = require('../utils/repository');
const { resolveRoleLevel } = require('../middleware/authenticate');
const { assertTenantUsable } = require('../middleware/tenant-lifecycle');
const { verifyTotp, generateSecret, otpauthUri, recoveryCodes, hashRecovery } = require('../utils/totp');
const { encrypt: encryptField, decrypt: decryptField } = require('./field-protection');

const REFRESH_TTL_MS = Number(process.env.REFRESH_TOKEN_TTL_DAYS || 14) * 86400000;
const MFA_TOKEN_TTL = '5m';
const hashToken = (raw) => crypto.createHash('sha256').update(String(raw)).digest('hex');
const { markRevoked } = require('./session-revocation');

// How long a password-reset link stays valid (ms).
const RESET_TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour

// Hash a raw reset token before it touches the database, so a DB leak can't be
// replayed to reset accounts. The raw token only ever lives in the email link.
const hashResetToken = (raw) => crypto.createHash('sha256').update(raw).digest('hex');

class AuthService extends BaseRepository {
  constructor(prisma, jwt) {
    super(prisma, 'employee');
    this.jwt = jwt;
  }

  async login(employeeId, password, meta = {}) {
    const employee = await this.db.employee.findUnique({
      where: { employee_id: employeeId },
      include: {
        branch:    { select: { branch_id: true, branch_name: true } },
        region:    { select: { region_id: true, region_name: true } },
        // The workspace name, so the client can say *which* workspace a session
        // belongs to. The platform console needs this to label the boundary
        // between platform-wide data and one tenant's own.
        tenant:    { select: { id: true, name: true, slug: true, plan: true } },
      },
    });

    if (!employee || !employee.is_active) {
      throw new AuthenticationError('Invalid credentials');
    }

    const valid = await bcrypt.compare(password, employee.password);
    if (!valid) {
      throw new AuthenticationError('Invalid credentials');
    }

    // A suspended / cancelled / deleted / expired-trial workspace issues no new
    // sessions. Checked after the password so a probe cannot use the error to
    // tell a real account in a suspended tenant from a nonexistent one.
    await assertTenantUsable(this.db, employee.tenant_id);

    // Second factor (PRD E-02): an enrolled user — or anyone under a policy
    // that requires MFA — gets a short-lived challenge token, not a session.
    if (employee.mfa_enabled) {
      return { mfa_required: true, mfa_token: this.#mfaToken(employee) };
    }
    if (await this.#mfaRequired(employee.tenant_id)) {
      return { mfa_setup_required: true, mfa_token: this.#mfaToken(employee) };
    }
    return this.issueSession(employee, meta);
  }

  /** Access token + rotating refresh token + the profile the client keeps. */
  async issueSession(employee, meta = {}, family = null) {
    if (!employee.branch && !employee.tenant) {
      employee = await this.db.employee.findUnique({
        where: { employee_id: employee.employee_id },
        include: { branch: { select: { branch_id: true, branch_name: true } }, region: { select: { region_id: true, region_name: true } }, tenant: { select: { id: true, name: true, slug: true, plan: true } } },
      });
    }
    const roleLevel = await this.resolveEmployeeRoleLevel(employee);

    const payload = {
      sub:           employee.employee_id,
      employeeId:    employee.employee_id,
      employee_id:   employee.employee_id,   // snake_case alias — required by record/task/activity/notification services
      employeeName:  employee.employee_name,
      role:          employee.role,
      role_level:    roleLevel,
      branchId:      employee.branch_id,
      regionId:      employee.region_id,
      tenant_id:     employee.tenant_id ?? null,
    };

    const token = this.jwt.sign(payload);
    const refresh_token = await this.#newRefreshToken(employee, meta, family);

    return {
      token,
      refresh_token,
      mfa_enabled: Boolean(employee.mfa_enabled),
      employee: {
        employee_id:   employee.employee_id,
        employee_name: employee.employee_name,
        role:          employee.role,
        role_label:    await this.resolveRoleLabel(employee),
        role_level:    roleLevel,
        email:         employee.email,
        branch:        employee.branch,
        region:        employee.region,
        tenant_id:     employee.tenant_id ?? null,
        tenant_name:   employee.tenant?.name ?? null,
        tenant_slug:   employee.tenant?.slug ?? null,
        tenant_plan:   employee.tenant?.plan ?? null,
      },
    };
  }

  // ── Sessions: refresh tokens and revocation (PRD E-01) ────────────────────

  async #newRefreshToken(employee, meta = {}, family = null) {
    const raw = crypto.randomBytes(32).toString('base64url');
    await this.db.authRefreshToken.create({
      data: {
        employee_id: employee.employee_id, token_hash: hashToken(raw), family: family ?? crypto.randomBytes(16).toString('hex'),
        expires_at: new Date(Date.now() + REFRESH_TTL_MS), user_agent: meta.userAgent ? String(meta.userAgent).slice(0, 255) : null,
        ip: meta.ip ? String(meta.ip).slice(0, 64) : null, tenant_id: employee.tenant_id ?? null,
      },
    });
    return raw;
  }

  /**
   * Exchange a refresh token for a new session. Tokens rotate: the presented
   * one is revoked and replaced. Presenting an already-rotated token means it
   * was stolen or replayed, so the whole family is revoked.
   */
  async refresh(rawToken, meta = {}) {
    const row = rawToken ? await this.db.authRefreshToken.findUnique({ where: { token_hash: hashToken(rawToken) } }) : null;
    if (!row) throw new AuthenticationError('Session expired — please sign in again');
    if (row.revoked_at) {
      await this.db.authRefreshToken.updateMany({ where: { family: row.family, revoked_at: null }, data: { revoked_at: new Date() } });
      throw new AuthenticationError('Session expired — please sign in again');
    }
    if (row.expires_at < new Date()) throw new AuthenticationError('Session expired — please sign in again');
    const employee = await this.db.employee.findUnique({ where: { employee_id: row.employee_id } });
    if (!employee || !employee.is_active) throw new AuthenticationError('Session expired — please sign in again');
    if (employee.tokens_valid_after && row.created_at < employee.tokens_valid_after) throw new AuthenticationError('Session expired — please sign in again');
    await assertTenantUsable(this.db, employee.tenant_id);
    await this.db.authRefreshToken.update({ where: { id: row.id }, data: { revoked_at: new Date() } });
    return this.issueSession(employee, meta, row.family);
  }

  /** Sign out this device (its refresh-token family), or everywhere. */
  async logout(rawToken, { everywhere = false, employeeId = null } = {}) {
    if (everywhere && employeeId) return this.revokeAll(employeeId);
    const row = rawToken ? await this.db.authRefreshToken.findUnique({ where: { token_hash: hashToken(rawToken) } }) : null;
    if (row) await this.db.authRefreshToken.updateMany({ where: { family: row.family, revoked_at: null }, data: { revoked_at: new Date() } });
    return { signed_out: true };
  }

  /**
   * Invalidate every token the employee holds: access tokens issued before now
   * are rejected by the middleware (within its 30 s cache), refresh tokens are
   * revoked. Used on deactivation, password change and "sign out everywhere".
   */
  async revokeAll(employeeId) {
    const now = new Date();
    await this.db.employee.update({ where: { employee_id: String(employeeId) }, data: { tokens_valid_after: now } });
    await this.db.authRefreshToken.updateMany({ where: { employee_id: String(employeeId), revoked_at: null }, data: { revoked_at: now } });
    markRevoked(employeeId, now.getTime());
    return { signed_out: true, everywhere: true };
  }

  // ── MFA (PRD E-02) ─────────────────────────────────────────────────────────

  #mfaToken(employee) {
    return this.jwt.sign({ purpose: 'mfa', sub: employee.employee_id, tenant_id: employee.tenant_id ?? null }, { expiresIn: MFA_TOKEN_TTL });
  }

  #mfaSubject(mfaToken) {
    let decoded;
    try { decoded = this.jwt.verify(String(mfaToken ?? '')); } catch { decoded = null; }
    if (!decoded || decoded.purpose !== 'mfa') throw new AuthenticationError('Sign-in expired — enter your password again');
    return decoded.sub;
  }

  async #mfaRequired(tenantId) {
    const policies = await this.db.securityPolicy.findMany({ where: { is_active: true, OR: [{ tenant_id: tenantId ?? null }, { tenant_id: null }] }, select: { tenant_id: true, require_mfa: true } }).catch(() => []);
    const own = policies.find((p) => p.tenant_id === tenantId) ?? policies.find((p) => p.tenant_id == null);
    return Boolean(own?.require_mfa);
  }

  /** Second step of sign-in: an authenticator code or a recovery code. */
  async verifyMfa(mfaToken, code, meta = {}) {
    const employee = await this.db.employee.findUnique({ where: { employee_id: this.#mfaSubject(mfaToken) } });
    if (!employee || !employee.is_active || !employee.mfa_enabled || !employee.mfa_secret) throw new AuthenticationError('Invalid code');
    const value = String(code ?? '').trim();
    if (/^\d{6}$/.test(value)) {
      if (!verifyTotp(decryptField(employee.mfa_secret), value)) throw new AuthenticationError('Invalid code');
    } else {
      const hashes = Array.isArray(employee.mfa_recovery) ? employee.mfa_recovery : [];
      const h = hashRecovery(value);
      if (!hashes.includes(h)) throw new AuthenticationError('Invalid code');
      await this.db.employee.update({ where: { employee_id: employee.employee_id }, data: { mfa_recovery: hashes.filter((x) => x !== h) } });
    }
    await assertTenantUsable(this.db, employee.tenant_id);
    return this.issueSession(employee, meta);
  }

  /** Start enrolment: a new secret (stored, not yet active) for the authenticator app. */
  async mfaSetup({ employeeId = null, mfaToken = null } = {}) {
    const id = employeeId ?? this.#mfaSubject(mfaToken);
    const employee = await this.db.employee.findUnique({ where: { employee_id: id } });
    if (!employee) throw new NotFoundError('Employee');
    if (employee.mfa_enabled) throw new ValidationError('Two-factor authentication is already on');
    const secret = generateSecret();
    await this.db.employee.update({ where: { employee_id: id }, data: { mfa_secret: encryptField(secret) } });
    return { secret, otpauth_uri: otpauthUri(secret, employee.email || employee.employee_id) };
  }

  /** Finish enrolment with a first code; returns recovery codes (shown once). */
  async mfaEnable({ employeeId = null, mfaToken = null, code }, meta = {}) {
    const id = employeeId ?? this.#mfaSubject(mfaToken);
    const employee = await this.db.employee.findUnique({ where: { employee_id: id } });
    if (!employee?.mfa_secret) throw new ValidationError('Start the set-up first');
    if (!verifyTotp(decryptField(employee.mfa_secret), code)) throw new ValidationError('That code is not right — check the time on your phone and try again');
    const { codes, hashes } = recoveryCodes();
    await this.db.employee.update({ where: { employee_id: id }, data: { mfa_enabled: true, mfa_recovery: hashes } });
    const out = { enabled: true, recovery_codes: codes };
    // Enrolled during sign-in (policy-required): finish the sign-in too.
    return mfaToken ? { ...out, ...(await this.issueSession({ ...employee, mfa_enabled: true }, meta)) } : out;
  }

  async mfaDisable(employeeId, code) {
    const employee = await this.db.employee.findUnique({ where: { employee_id: employeeId } });
    if (!employee?.mfa_enabled) throw new ValidationError('Two-factor authentication is not on');
    if (await this.#mfaRequired(employee.tenant_id)) throw new ValidationError('Your organisation requires two-factor authentication');
    if (!verifyTotp(decryptField(employee.mfa_secret), code)) throw new ValidationError('That code is not right');
    await this.db.employee.update({ where: { employee_id: employeeId }, data: { mfa_enabled: false, mfa_secret: null, mfa_recovery: null } });
    return { enabled: false };
  }

  /**
   * The authority level to stamp on `employee`'s token.
   *
   * Looks for the tenant's own role row first, then the system row
   * (`tenant_id: NULL`) that every tenant shares. `resolveRoleLevel` settles
   * what happens when neither exists: the built-in ladder, and failing that no
   * access at all. It used to default to `1` — the platform-admin level — so an
   * employee holding a role name with no matching row signed in with
   * cross-tenant platform authority. That was the guaranteed outcome for every
   * newly provisioned tenant, whose `roles` rows did not exist yet.
   */
  async resolveEmployeeRoleLevel(employee) {
    const role = await this.db.role.findFirst({
      where: { name: employee.role, tenant_id: employee.tenant_id },
      select: { level: true },
    }) ?? await this.db.role.findFirst({
      where: { name: employee.role, tenant_id: null },
      select: { level: true },
    });
    return resolveRoleLevel(employee.role, role?.level);
  }

  async getProfile(employeeId) {
    const employee = await this.db.employee.findUnique({
      where: { employee_id: employeeId },
      include: {
        branch: true,
        region: true,
      },
    });

    if (!employee) throw new NotFoundError('Employee');

    // Allow-list: never return the password hash, the MFA secret and recovery
    // codes, or a pending reset token — a stolen access token must not be
    // enough to read them.
    return {
      employee_id:   employee.employee_id,
      employee_name: employee.employee_name,
      role:          employee.role,
      role_label:    await this.resolveRoleLabel(employee),
      email:         employee.email,
      phone:         employee.phone,
      branch_id:     employee.branch_id,
      region_id:     employee.region_id,
      branch:        employee.branch,
      region:        employee.region,
      tenant_id:     employee.tenant_id,
      is_active:     employee.is_active,
      mfa_enabled:   Boolean(employee.mfa_enabled),
      created_at:    employee.created_at,
      updated_at:    employee.updated_at,
    };
  }

  /** The role's display name ("Relationship Manager"), falling back to the role key. */
  async resolveRoleLabel(employee) {
    const role = await this.db.role.findFirst({
      where: { name: employee.role, tenant_id: employee.tenant_id },
      select: { label: true },
    }) ?? await this.db.role.findFirst({
      where: { name: employee.role, tenant_id: null },
      select: { label: true },
    });
    return role?.label || employee.role;
  }

  async changePassword(employeeId, currentPassword, newPassword) {
    const employee = await this.db.employee.findUnique({
      where: { employee_id: employeeId },
    });

    if (!employee) throw new NotFoundError('Employee');

    const valid = await bcrypt.compare(currentPassword, employee.password);
    if (!valid) throw new AuthenticationError('Current password is incorrect');

    const hashed = await bcrypt.hash(newPassword, 12);
    await this.db.employee.update({
      where: { employee_id: employeeId },
      data: { password: hashed },
    });
    // Every other session ends with the old password.
    await this.revokeAll(employeeId);

    return { message: 'Password changed successfully — please sign in again on your other devices.' };
  }

  /**
   * Create a password-reset token for the account matching `identifier`
   * (employee_id or email). Returns { employee, rawToken } when a usable,
   * active account with an email is found, otherwise null.
   *
   * The caller is responsible for emailing the raw token; we never return it
   * anywhere else, and we store only its hash.
   */
  async createResetToken(identifier) {
    if (!identifier || !String(identifier).trim()) return null;
    const value = String(identifier).trim();

    const employee = await this.db.employee.findFirst({
      where: {
        is_active: true,
        OR: [{ employee_id: value }, { email: value }],
      },
    });

    // No account, or account has no email to send to — nothing we can do, but
    // the route still responds generically so existence isn't leaked.
    if (!employee || !employee.email) return null;

    const rawToken = crypto.randomBytes(32).toString('hex');
    await this.db.employee.update({
      where: { employee_id: employee.employee_id },
      data: {
        reset_token: hashResetToken(rawToken),
        reset_token_expires: new Date(Date.now() + RESET_TOKEN_TTL_MS),
      },
    });

    return { employee, rawToken };
  }

  /**
   * Complete a password reset using the raw token from the email link.
   * Validates the token + expiry, sets the new password, and clears the token
   * so it can't be reused.
   */
  async resetPassword(rawToken, newPassword) {
    if (!rawToken) throw new ValidationError('Reset token is required');
    if (!newPassword || newPassword.length < 8) {
      throw new ValidationError('New password must be at least 8 characters');
    }

    const employee = await this.db.employee.findFirst({
      where: {
        reset_token: hashResetToken(rawToken),
        reset_token_expires: { gt: new Date() },
      },
    });

    if (!employee) {
      throw new ValidationError('This reset link is invalid or has expired. Please request a new one.');
    }

    const hashed = await bcrypt.hash(newPassword, 12);
    await this.db.employee.update({
      where: { employee_id: employee.employee_id },
      data: {
        password: hashed,
        reset_token: null,
        reset_token_expires: null,
      },
    });
    await this.revokeAll(employee.employee_id);

    return { message: 'Password has been reset successfully. You can now sign in.' };
  }
}

module.exports = AuthService;
