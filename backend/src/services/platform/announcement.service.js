'use strict';

const { BaseRepository } = require('../../utils/repository');
const { NotFoundError } = require('../../utils/errors');

class AnnouncementService extends BaseRepository {
  constructor(prisma) {
    super(prisma, 'systemAnnouncement');
  }

  async list({ page = 1, limit = 20, severity, activeOnly } = {}) {
    const where = {};
    if (severity) where.severity = severity;
    if (activeOnly) {
      where.is_active = true;
      where.active_from = { lte: new Date() };
      where.OR = [
        { active_to: null },
        { active_to: { gte: new Date() } },
      ];
    }

    const skip = (page - 1) * limit;
    const take = Math.min(limit, 100);

    const [data, total] = await Promise.all([
      this.db.systemAnnouncement.findMany({ where, orderBy: { created_at: 'desc' }, skip, take }),
      this.db.systemAnnouncement.count({ where }),
    ]);

    return { data, pagination: { total, page, limit: take, pages: Math.ceil(total / take) } };
  }

  async getById(id) {
    const announcement = await this.db.systemAnnouncement.findUnique({ where: { id: Number(id) } });
    if (!announcement) throw new NotFoundError('Announcement');
    return announcement;
  }

  async create(data) {
    return this.db.systemAnnouncement.create({ data });
  }

  async update(id, data) {
    await this.getById(id);
    return this.db.systemAnnouncement.update({ where: { id: Number(id) }, data });
  }

  async delete(id) {
    await this.getById(id);
    return this.db.systemAnnouncement.delete({ where: { id: Number(id) } });
  }

  async activate(id) {
    await this.getById(id);
    return this.db.systemAnnouncement.update({
      where: { id: Number(id) },
      data: { is_active: true },
    });
  }

  async deactivate(id) {
    await this.getById(id);
    return this.db.systemAnnouncement.update({
      where: { id: Number(id) },
      data: { is_active: false },
    });
  }

  /**
   * Get active announcements visible to a user.
   * Called from runtime — not a platform admin route.
   */
  async getActiveForUser(role) {
    const now = new Date();
    const where = {
      is_active: true,
      active_from: { lte: now },
      OR: [
        { active_to: null },
        { active_to: { gte: now } },
      ],
    };

    const announcements = await this.db.systemAnnouncement.findMany({
      where,
      orderBy: { severity: 'desc' },
    });

    return announcements.filter(a => {
      if (a.target === 'all') return true;
      if (a.target === 'admins') return ['admin', 'super_admin', 'platform_admin'].includes(role);
      return false;
    });
  }
}

module.exports = AnnouncementService;
