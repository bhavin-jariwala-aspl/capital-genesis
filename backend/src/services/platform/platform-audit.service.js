'use strict';

const { BaseRepository } = require('../../utils/repository');

class PlatformAuditService extends BaseRepository {
  constructor(prisma) {
    super(prisma, 'platformAuditLog');
  }

  /**
   * Log a platform admin action.
   */
  async log({ adminId, action, targetType, targetId, details, ip, userAgent }) {
    return this.db.platformAuditLog.create({
      data: {
        admin_id: adminId,
        action,
        target_type: targetType || null,
        target_id: targetId ? String(targetId) : null,
        details: details || null,
        ip_address: ip || null,
        user_agent: userAgent || null,
      },
    });
  }

  /**
   * Query audit logs with filtering and pagination.
   */
  async list({ page = 1, limit = 50, adminId, action, targetType, targetId, from, to } = {}) {
    const where = {};
    if (adminId) where.admin_id = adminId;
    if (action) where.action = { contains: action };
    if (targetType) where.target_type = targetType;
    if (targetId) where.target_id = String(targetId);
    if (from || to) {
      where.created_at = {};
      if (from) where.created_at.gte = new Date(from);
      if (to) where.created_at.lte = new Date(to);
    }

    const skip = (page - 1) * limit;
    const take = Math.min(limit, 200);

    const [data, total] = await Promise.all([
      this.db.platformAuditLog.findMany({
        where,
        orderBy: { created_at: 'desc' },
        skip,
        take,
      }),
      this.db.platformAuditLog.count({ where }),
    ]);

    return { data, pagination: { total, page, limit: take, pages: Math.ceil(total / take) } };
  }

  /**
   * Get recent actions by a specific admin.
   */
  async getAdminActions(adminId, limit = 20) {
    return this.db.platformAuditLog.findMany({
      where: { admin_id: adminId },
      orderBy: { created_at: 'desc' },
      take: limit,
    });
  }

  /**
   * Get all actions related to a specific target.
   */
  async getTargetHistory(targetType, targetId) {
    return this.db.platformAuditLog.findMany({
      where: { target_type: targetType, target_id: String(targetId) },
      orderBy: { created_at: 'desc' },
    });
  }

  /**
   * Get action counts grouped by action type for a time period.
   */
  async getActionStats(from, to) {
    const where = {};
    if (from || to) {
      where.created_at = {};
      if (from) where.created_at.gte = new Date(from);
      if (to) where.created_at.lte = new Date(to);
    }

    return this.db.platformAuditLog.groupBy({
      by: ['action'],
      where,
      _count: true,
      orderBy: { _count: { action: 'desc' } },
    });
  }
}

module.exports = PlatformAuditService;
