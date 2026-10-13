'use strict';

const { NotFoundError } = require('../utils/errors');
const PermissionService = require('./permission.service');
const { ROLE_LEVEL, ADMIN_THRESHOLD, MANAGER_THRESHOLD } = require('../middleware/authenticate');

class TaskService {
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
    const level = viewer.role_level ?? ROLE_LEVEL[role] ?? Number.POSITIVE_INFINITY; // unknown level = least privilege, never admin
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

  async getTasks({ recordId, employeeId, status } = {}, viewer) {
    if (recordId) await this.#assertRecordAccess(Number(recordId), viewer);

    // Build visibility filter from operational permissions
    const scopeFilter = await this.perm.buildViewScopeFilter('task', viewer);
    if (scopeFilter === null) return []; // scope=none → no access

    const where = { ...scopeFilter };
    if (recordId)   where.record_id   = Number(recordId);
    if (employeeId) where.assigned_to = employeeId;
    if (status)     where.status      = status;

    return this.db.task.findMany({
      where,
      orderBy: [{ due_date: 'asc' }, { created_at: 'desc' }],
      include: {
        assignee: { select: { employee_id: true, employee_name: true } },
        creator:  { select: { employee_id: true, employee_name: true } },
        record:   { select: { id: true, object_id: true } },
      },
    });
  }

  async createTask(createdBy, data, viewer) {
    if (data.record_id) await this.#assertRecordAccess(Number(data.record_id), viewer);

    // Check create_scope
    await this.perm.checkOperationalScope('task', 'create', viewer, {
      created_by:  createdBy,
      assigned_to: data.assigned_to ?? createdBy,
    });

    // Check assign_scope when assigning to someone else
    const assignee = data.assigned_to ?? createdBy;
    if (assignee !== createdBy) {
      await this.perm.checkOperationalScope('task', 'assign', viewer, {
        created_by:  createdBy,
        assigned_to: assignee,
      });
    }

    const task = await this.db.task.create({
      data: {
        record_id:   data.record_id ? Number(data.record_id) : null,
        assigned_to: assignee,
        created_by:  createdBy,
        title:       data.title,
        description: data.description ?? null,
        status:      data.status   ?? 'open',
        priority:    data.priority ?? 'normal',
        due_date:    data.due_date ? new Date(data.due_date) : null,
      },
      include: {
        assignee: { select: { employee_id: true, employee_name: true } },
        creator:  { select: { employee_id: true, employee_name: true } },
      },
    });

    await this.#audit(task.record_id, createdBy, 'task_create', {
      summary:     `Added task: ${task.title}`,
      entity_type: 'task',
      entity_id:   task.id,
    });

    return task;
  }

  async updateTask(id, data, viewer) {
    const existing = await this.db.task.findUnique({ where: { id: Number(id) } });
    if (!existing) throw new NotFoundError('Task');

    // Check edit_scope against current task owner
    await this.perm.checkOperationalScope('task', 'edit', viewer, {
      created_by:  existing.created_by,
      assigned_to: existing.assigned_to,
    });

    // If reassigning, also check assign_scope
    if (data.assigned_to !== undefined && data.assigned_to !== existing.assigned_to) {
      const viewerId = viewer.employee_id ?? viewer.employeeId;
      if (data.assigned_to !== viewerId) {
        await this.perm.checkOperationalScope('task', 'assign', viewer, {
          created_by:  existing.created_by,
          assigned_to: data.assigned_to,
        });
      }
    }

    const completedAt = data.status === 'completed' && !existing.completed_at
      ? new Date()
      : (data.status && data.status !== 'completed' ? null : existing.completed_at);

    return this.db.task.update({
      where: { id: Number(id) },
      data:  {
        title:        data.title       !== undefined ? data.title       : existing.title,
        description:  data.description !== undefined ? data.description : existing.description,
        status:       data.status      !== undefined ? data.status      : existing.status,
        priority:     data.priority    !== undefined ? data.priority    : existing.priority,
        assigned_to:  data.assigned_to !== undefined ? data.assigned_to : existing.assigned_to,
        due_date:     data.due_date    !== undefined ? (data.due_date ? new Date(data.due_date) : null) : existing.due_date,
        completed_at: completedAt,
      },
      include: {
        assignee: { select: { employee_id: true, employee_name: true } },
        creator:  { select: { employee_id: true, employee_name: true } },
      },
    });
  }

  async deleteTask(id, viewer) {
    const existing = await this.db.task.findUnique({ where: { id: Number(id) } });
    if (!existing) throw new NotFoundError('Task');

    await this.perm.checkOperationalScope('task', 'delete', viewer, {
      created_by:  existing.created_by,
      assigned_to: existing.assigned_to,
    });

    const result = await this.db.task.delete({ where: { id: Number(id) } });

    await this.#audit(existing.record_id, viewer?.employee_id ?? viewer?.employeeId, 'task_delete', {
      summary:     `Deleted task: ${existing.title}`,
      entity_type: 'task',
      entity_id:   existing.id,
    });

    return result;
  }
}

module.exports = TaskService;
