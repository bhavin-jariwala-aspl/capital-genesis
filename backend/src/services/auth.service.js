'use strict';

const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { AuthenticationError, NotFoundError, ValidationError } = require('../utils/errors');
const { BaseRepository } = require('../utils/repository');
const { resolveRoleLevel } = require('../middleware/authenticate');
const { assertTenantUsable } = require('../middleware/tenant-lifecycle');

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

  async login(employeeId, password) {
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

    return {
      token,
      employee: {
        employee_id:   employee.employee_id,
        employee_name: employee.employee_name,
        role:          employee.role,
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

    const { password: _pwd, ...rest } = employee;
    return rest;
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

    return { message: 'Password changed successfully' };
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

    return { message: 'Password has been reset successfully. You can now sign in.' };
  }
}

module.exports = AuthService;
