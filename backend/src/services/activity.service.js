'use strict';

const { NotFoundError } = require('../utils/errors');
const PermissionService = require('./permission.service');
const { ROLE_LEVEL, ADMIN_THRESHOLD, MANAGER_THRESHOLD } = require('../middleware/authenticate');

class ActivityService {
  constructor(prisma) {
    this.db   = prisma;
    this.perm = new PermissionService(prisma);
  }

  /**
   * Best-effort audit-trail entry on the parent record's timeline.
   * tenant_id is injected by the tenant-scope middleware on create.
   */
  #audit(recordId, employeeId, action, changes) {
    if (!recordId || !employeeId) return Promise.resolve();
    return this.db.auditLog.create({
      data: { record_id: Number(recordId), employee_id: String(employeeId), action, changes },
    }).catch(() => { /* never let audit failure break the main operation */ });
  }

  /** Throw NotFoundError when viewer is not allowed to see the parent record. */
  async #assertRecordAccess(recordId, viewer) {
    if (!viewer) return;
    const { role } = viewer;
    const level = viewer.role_level ?? ROLE_LEVEL[role] ?? 0;
    if (level <= ADMIN_THRESHOLD) return;
    const record = await this.db.record.findUnique({
      where:  { id: recordId },
      select: { id: true, created_by: true, assigned_to: true },
    });
    if (!record) throw new NotFoundError('Record');
    const employee_id = viewer.employee_id ?? viewer.employeeId;
    if (level <= MANAGER_THRESHOLD) {
      const rows = await this.db.employeeHierarchy.findMany({
        where:  { ancestor_id: employee_id, depth: { gte: 0 } },
        select: { descendant_id: true },
      });
      const allowed = new Set(rows.map(r => r.descendant_id));
      if (!allowed.has(record.created_by)) throw new NotFoundError('Record');
      return;
    }
    // user — own or assigned records
    if (record.created_by !== employee_id && record.assigned_to !== employee_id) {
      throw new NotFoundError('Record');
    }
  }

  async getActivities(recordId, viewer) {
    await this.#assertRecordAccess(Number(recordId), viewer);
    return this.db.activity.findMany({
      where:   { record_id: Number(recordId) },
      orderBy: { created_at: 'desc' },
      include: { employee: { select: { employee_id: true, employee_name: true } } },
    });
  }

  async createActivity(recordId, employeeId, data, viewer) {
    await this.#assertRecordAccess(Number(recordId), viewer);

    // Check create_scope
    await this.perm.checkOperationalScope('activity', 'create', viewer, {
      created_by:  employeeId,
      assigned_to: employeeId,
    });

    const activity = await this.db.activity.create({
      data: {
        record_id:    Number(recordId),
        employee_id:  employeeId,
        type:         data.type    ?? 'note',
        subject:      data.subject ?? 'Note',
        description:  data.description  ?? null,
        outcome:      data.outcome      ?? null,
        duration_min: data.duration_min ? Number(data.duration_min) : null,
        scheduled_at: data.scheduled_at ? new Date(data.scheduled_at) : null,
        completed_at: data.completed_at ? new Date(data.completed_at) : null,
      },
      include: { employee: { select: { employee_id: true, employee_name: true } } },
    });

    await this.#audit(recordId, employeeId, 'activity_create', {
      summary:     `Logged ${activity.type}: ${activity.subject}`,
      entity_type: 'activity',
      entity_id:   activity.id,
    });

    return activity;
  }

  async updateActivity(id, data, viewer) {
    const existing = await this.db.activity.findUnique({ where: { id: Number(id) } });
    if (!existing) throw new NotFoundError('Activity');

    // Check edit_scope against activity owner
    await this.perm.checkOperationalScope('activity', 'edit', viewer, {
      created_by:  existing.employee_id,
      assigned_to: existing.employee_id,
    });

    return this.db.activity.update({
      where: { id: Number(id) },
      data:  {
        type:         data.type        ?? existing.type,
        subject:      data.subject     ?? existing.subject,
        description:  data.description !== undefined ? data.description  : existing.description,
        outcome:      data.outcome     !== undefined ? data.outcome      : existing.outcome,
        duration_min: data.duration_min !== undefined ? (data.duration_min ? Number(data.duration_min) : null) : existing.duration_min,
        scheduled_at: data.scheduled_at !== undefined ? (data.scheduled_at ? new Date(data.scheduled_at) : null) : existing.scheduled_at,
        completed_at: data.completed_at !== undefined ? (data.completed_at ? new Date(data.completed_at) : null) : existing.completed_at,
      },
      include: { employee: { select: { employee_id: true, employee_name: true } } },
    });
  }

  async deleteActivity(id, viewer) {
    const existing = await this.db.activity.findUnique({ where: { id: Number(id) } });
    if (!existing) throw new NotFoundError('Activity');

    await this.perm.checkOperationalScope('activity', 'delete', viewer, {
      created_by:  existing.employee_id,
      assigned_to: existing.employee_id,
    });

    const result = await this.db.activity.delete({ where: { id: Number(id) } });

    await this.#audit(existing.record_id, viewer?.employee_id ?? viewer?.employeeId, 'activity_delete', {
      summary:     `Deleted ${existing.type}: ${existing.subject}`,
      entity_type: 'activity',
      entity_id:   existing.id,
    });

    return result;
  }
}

module.exports = ActivityService;
