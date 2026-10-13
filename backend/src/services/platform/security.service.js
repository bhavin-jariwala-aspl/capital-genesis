'use strict';

const crypto  = require('crypto');
const bcrypt  = require('bcryptjs');
const { BaseRepository } = require('../../utils/repository');
const { NotFoundError, ValidationError } = require('../../utils/errors');

class SecurityService extends BaseRepository {
  constructor(prisma) {
    super(prisma, 'securityPolicy');
  }

  // ── Security Policies ─────────────────────────────────────

  async getGlobalPolicy() {
    const policy = await this.db.securityPolicy.findFirst({
      where: { tenant_id: null, is_active: true },
    });
    return policy || this.#defaultPolicy();
  }

  async getTenantPolicy(tenantId) {
    const policy = await this.db.securityPolicy.findFirst({
      where: { tenant_id: Number(tenantId), is_active: true },
    });
    // Fall back to global policy
    return policy || this.getGlobalPolicy();
  }

  async upsertPolicy(data) {
    const { tenant_id, ...policyData } = data;
    const where = tenant_id
      ? { tenant_id: Number(tenant_id), is_active: true }
      : { tenant_id: null, is_active: true };

    const existing = await this.db.securityPolicy.findFirst({ where });

    if (existing) {
      return this.db.securityPolicy.update({
        where: { id: existing.id },
        data: policyData,
      });
    }

    return this.db.securityPolicy.create({
      data: { tenant_id: tenant_id ? Number(tenant_id) : null, ...policyData },
    });
  }

  async listPolicies() {
    return this.db.securityPolicy.findMany({
      where: { is_active: true },
      orderBy: { tenant_id: 'asc' },
    });
  }

  // ── Password Management ───────────────────────────────────

  async forcePasswordReset(employeeId, adminId) {
    const employee = await this.db.employee.findUnique({ where: { employee_id: employeeId } });
    if (!employee) throw new NotFoundError('Employee');

    // Generate a temporary password
    const tempPassword = this.#generateTempPassword();
    const hashed = await bcrypt.hash(tempPassword, 12);

    await this.db.employee.update({
      where: { employee_id: employeeId },
      data: { password: hashed },
    });

    return { employee_id: employeeId, temp_password: tempPassword };
  }

  async bulkForcePasswordReset(employeeIds, adminId) {
    const results = [];
    for (const id of employeeIds) {
      try {
        const result = await this.forcePasswordReset(id, adminId);
        results.push({ ...result, success: true });
      } catch (err) {
        results.push({ employee_id: id, success: false, error: err.message });
      }
    }
    return results;
  }

  // ── Session Management ────────────────────────────────────

  async getActiveSessions() {
    // Return active employees as proxy for sessions
    // In production this would query a session store (Redis)
    const employees = await this.db.employee.findMany({
      where: { is_active: true },
      select: {
        employee_id: true,
        employee_name: true,
        role: true,
        email: true,
        updated_at: true,
      },
      orderBy: { updated_at: 'desc' },
      take: 100,
    });

    return employees;
  }

  async deactivateUser(employeeId, adminId) {
    const employee = await this.db.employee.findUnique({ where: { employee_id: employeeId } });
    if (!employee) throw new NotFoundError('Employee');
    if (employee.role === 'platform_admin') {
      throw new ValidationError('Cannot deactivate a platform admin');
    }

    return this.db.employee.update({
      where: { employee_id: employeeId },
      data: { is_active: false },
    });
  }

  async reactivateUser(employeeId) {
    const employee = await this.db.employee.findUnique({ where: { employee_id: employeeId } });
    if (!employee) throw new NotFoundError('Employee');

    return this.db.employee.update({
      where: { employee_id: employeeId },
      data: { is_active: true },
    });
  }

  // ── API Rate Limits ───────────────────────────────────────

  async listRateLimits() {
    return this.db.apiRateLimit.findMany({
      where: { is_active: true },
      orderBy: { created_at: 'desc' },
    });
  }

  async upsertRateLimit(data) {
    if (data.id) {
      return this.db.apiRateLimit.update({
        where: { id: Number(data.id) },
        data,
      });
    }
    return this.db.apiRateLimit.create({ data });
  }

  async deleteRateLimit(id) {
    return this.db.apiRateLimit.delete({ where: { id: Number(id) } });
  }

  // ── Data Export ───────────────────────────────────────────

  async requestDataExport(data) {
    return this.db.dataExportRequest.create({ data });
  }

  async listDataExports({ tenantId, status, page = 1, limit = 20 } = {}) {
    const where = {};
    if (tenantId) where.tenant_id = Number(tenantId);
    if (status) where.status = status;

    const skip = (page - 1) * limit;
    const take = Math.min(limit, 100);

    const [data, total] = await Promise.all([
      this.db.dataExportRequest.findMany({ where, orderBy: { created_at: 'desc' }, skip, take }),
      this.db.dataExportRequest.count({ where }),
    ]);

    return { data, pagination: { total, page, limit: take, pages: Math.ceil(total / take) } };
  }

  async updateExportStatus(id, status, extra = {}) {
    return this.db.dataExportRequest.update({
      where: { id: Number(id) },
      data: { status, ...extra },
    });
  }

  // ── Impersonation Logs ────────────────────────────────────

  async logImpersonation(data) {
    return this.db.impersonationLog.create({ data });
  }

  async listImpersonationLogs({ page = 1, limit = 20, adminId } = {}) {
    const where = {};
    if (adminId) where.admin_id = adminId;

    const skip = (page - 1) * limit;
    const take = Math.min(limit, 100);

    const [data, total] = await Promise.all([
      this.db.impersonationLog.findMany({ where, orderBy: { started_at: 'desc' }, skip, take }),
      this.db.impersonationLog.count({ where }),
    ]);

    return { data, pagination: { total, page, limit: take, pages: Math.ceil(total / take) } };
  }

  async endImpersonation(id, actionsTaken) {
    return this.db.impersonationLog.update({
      where: { id: Number(id) },
      data: { ended_at: new Date(), actions_taken: actionsTaken },
    });
  }

  // ── Private helpers ───────────────────────────────────────

  #defaultPolicy() {
    return {
      id: null,
      tenant_id: null,
      require_mfa: false,
      password_min_length: 8,
      password_require_upper: true,
      password_require_number: true,
      password_require_special: false,
      password_expiry_days: 0,
      max_login_attempts: 5,
      lockout_duration_min: 30,
      session_timeout_min: 480,
      ip_allowlist: null,
      ip_blocklist: null,
      allowed_domains: null,
      force_password_reset: false,
    };
  }

  #generateTempPassword() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$';
    let password = '';
    for (let i = 0; i < 16; i++) {
      password += chars[crypto.randomInt(chars.length)];
    }
    return password;
  }
}

module.exports = SecurityService;
