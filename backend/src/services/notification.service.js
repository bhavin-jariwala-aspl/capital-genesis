'use strict';

class NotificationService {
  constructor(prisma) { this.db = prisma; }

  async getNotifications(employeeId, { unreadOnly = false } = {}) {
    const where = { employee_id: employeeId };
    if (unreadOnly) where.is_read = false;
    return this.db.notification.findMany({
      where,
      orderBy: { created_at: 'desc' },
      take: 50,
    });
  }

  async getUnreadCount(employeeId) {
    return this.db.notification.count({ where: { employee_id: employeeId, is_read: false } });
  }

  async markRead(ids, employeeId) {
    return this.db.notification.updateMany({
      where: { id: { in: ids.map(Number) }, employee_id: employeeId },
      data:  { is_read: true },
    });
  }

  async markAllRead(employeeId) {
    return this.db.notification.updateMany({
      where: { employee_id: employeeId, is_read: false },
      data:  { is_read: true },
    });
  }

  async createNotification(employeeId, { type, title, body, link }) {
    return this.db.notification.create({
      data: { employee_id: employeeId, type, title, body: body ?? null, link: link ?? null },
    });
  }

  /** Broadcast a notification to multiple employees */
  async broadcastNotification(employeeIds, payload) {
    return this.db.notification.createMany({
      data: employeeIds.map(id => ({ employee_id: id, ...payload })),
    });
  }
}

module.exports = NotificationService;
