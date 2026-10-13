'use strict';

const { NotFoundError, ValidationError } = require('../utils/errors');
const { ROLE_LEVEL, ADMIN_THRESHOLD, MANAGER_THRESHOLD } = require('../middleware/authenticate');
const { logger } = require('./logging.service');

const OPEN_STATUSES = ['pending', 'notified'];
const VALID_STATUS  = new Set(['pending', 'notified', 'done', 'dismissed', 'cancelled']);

/**
 * ReminderService — time-based reminders / follow-ups on CRM records.
 *
 * Reminders are personal: a reminder targets one employee (`employee_id`). When
 * `remind_at` passes, `sweepDue()` (run on an interval by the app) atomically
 * claims each due reminder and creates an in-app Notification, so it surfaces in
 * the notification bell automatically. `snooze` reschedules; `complete`/`dismiss`
 * close it. This mirrors the reminder primitive in Salesforce, HubSpot,
 * Dynamics, Zoho, and Pipedrive.
 */
class ReminderService {
  constructor(prisma, eventBus = null) {
    this.db = prisma;
    this.eventBus = eventBus;
  }

  #reminderInclude = {
    record:   { select: { id: true, object_id: true } },
    employee: { select: { employee_id: true, employee_name: true } },
    creator:  { select: { employee_id: true, employee_name: true } },
  };

  #audit(recordId, employeeId, action, changes) {
    if (!recordId || !employeeId) return Promise.resolve();
    return this.db.auditLog.create({
      data: { record_id: Number(recordId), employee_id: String(employeeId), action, changes },
    }).catch((err) => logger.warn(`[ReminderService] audit failed: ${err.message}`));
  }

  /**
   * The set of employee IDs a viewer may see reminders for.
   * Returns null for admins (= all, no filter). Reminders are personal, so this
   * is enforced directly by role level rather than via operational_permissions.
   */
  async #visibleEmployeeIds(viewer) {
    if (!viewer) return null;
    const level = viewer.role_level ?? ROLE_LEVEL[viewer.role] ?? 0;
    if (level <= ADMIN_THRESHOLD) return null; // admin/super_admin/platform_admin → all
    const viewerId = viewer.employee_id ?? viewer.employeeId;
    if (level <= MANAGER_THRESHOLD) {
      const rows = await this.db.employeeHierarchy.findMany({
        where:  { ancestor_id: viewerId, depth: { gte: 0 } },
        select: { descendant_id: true },
      });
      return rows.map(r => r.descendant_id);
    }
    return [viewerId]; // user → own only
  }

  #scopeWhere(ids) {
    if (ids === null) return {};
    return { OR: [{ employee_id: { in: ids } }, { created_by: { in: ids } }] };
  }

  /** Assert the viewer may act on a specific reminder; returns the reminder. */
  async #assertReminderAccess(id, viewer) {
    const reminder = await this.db.reminder.findUnique({ where: { id: Number(id) } });
    if (!reminder) throw new NotFoundError('Reminder');
    const ids = await this.#visibleEmployeeIds(viewer);
    if (ids !== null) {
      const allowed = new Set(ids);
      if (!allowed.has(reminder.employee_id) && !allowed.has(reminder.created_by)) {
        throw new NotFoundError('Reminder');
      }
    }
    return reminder;
  }

  async list({ recordId, employeeId, status, scope } = {}, viewer) {
    const ids = await this.#visibleEmployeeIds(viewer);
    const where = { ...this.#scopeWhere(ids) };
    if (recordId)   where.record_id = Number(recordId);
    if (employeeId) where.employee_id = employeeId;
    if (status)     where.status = status;
    else if (scope === 'open') where.status = { in: OPEN_STATUSES };
    return this.db.reminder.findMany({
      where,
      orderBy: [{ remind_at: 'asc' }],
      include: this.#reminderInclude,
    });
  }

  /** Reminders targeting the current user — the "My Reminders" agenda feed. */
  async listMine(employeeId, { scope = 'open' } = {}) {
    const where = { employee_id: employeeId };
    if (scope === 'open') where.status = { in: OPEN_STATUSES };
    return this.db.reminder.findMany({
      where,
      orderBy: [{ remind_at: 'asc' }],
      include: this.#reminderInclude,
    });
  }

  async create(createdBy, data, viewer) {
    if (!data.title || !String(data.title).trim()) {
      throw new ValidationError('Reminder title is required');
    }
    if (!data.remind_at || Number.isNaN(new Date(data.remind_at).getTime())) {
      throw new ValidationError('A valid remind_at date/time is required');
    }
    // A manager/user can only assign reminders within their visible scope.
    const target = data.employee_id ?? createdBy;
    if (target !== createdBy) {
      const ids = await this.#visibleEmployeeIds(viewer);
      if (ids !== null && !new Set(ids).has(target)) {
        throw new ValidationError('You cannot assign a reminder to that user');
      }
    }
    const reminder = await this.db.reminder.create({
      data: {
        record_id:   data.record_id ? Number(data.record_id) : null,
        employee_id: target,
        created_by:  createdBy,
        title:       String(data.title).trim(),
        note:        data.note ?? null,
        remind_at:   new Date(data.remind_at),
        priority:    data.priority ?? 'normal',
        status:      'pending',
      },
      include: this.#reminderInclude,
    });
    await this.#audit(reminder.record_id, createdBy, 'reminder_create', {
      summary: `Set reminder: ${reminder.title}`, entity_type: 'reminder', entity_id: reminder.id,
    });
    return reminder;
  }

  async update(id, data, viewer) {
    const existing = await this.#assertReminderAccess(id, viewer);
    const patch = {};
    if (data.title !== undefined)     patch.title = String(data.title).trim();
    if (data.note !== undefined)      patch.note = data.note;
    if (data.priority !== undefined)  patch.priority = data.priority;
    if (data.remind_at !== undefined) {
      if (Number.isNaN(new Date(data.remind_at).getTime())) throw new ValidationError('Invalid remind_at');
      patch.remind_at = new Date(data.remind_at);
      // Editing the time re-arms a reminder that had already fired.
      if (existing.status === 'notified') { patch.status = 'pending'; patch.notified_at = null; }
    }
    if (data.status !== undefined) {
      if (!VALID_STATUS.has(data.status)) throw new ValidationError(`Invalid status: ${data.status}`);
      patch.status = data.status;
      patch.completed_at = data.status === 'done' ? new Date() : null;
    }
    return this.db.reminder.update({ where: { id: Number(id) }, data: patch, include: this.#reminderInclude });
  }

  /** Reschedule a reminder to a new time (or by minutes from now) and re-arm it. */
  async snooze(id, { remind_at, minutes } = {}, viewer) {
    await this.#assertReminderAccess(id, viewer);
    let when;
    if (remind_at) {
      when = new Date(remind_at);
    } else if (minutes) {
      when = new Date(Date.now() + Number(minutes) * 60_000);
    }
    if (!when || Number.isNaN(when.getTime())) throw new ValidationError('Provide remind_at or minutes to snooze');
    return this.db.reminder.update({
      where: { id: Number(id) },
      data:  { remind_at: when, status: 'pending', notified_at: null },
      include: this.#reminderInclude,
    });
  }

  async complete(id, viewer) { return this.update(id, { status: 'done' }, viewer); }
  async dismiss(id, viewer)  { return this.update(id, { status: 'dismissed' }, viewer); }

  async remove(id, viewer) {
    const existing = await this.#assertReminderAccess(id, viewer);
    const result = await this.db.reminder.delete({ where: { id: Number(id) } });
    await this.#audit(existing.record_id, viewer?.employee_id ?? viewer?.employeeId, 'reminder_delete', {
      summary: `Deleted reminder: ${existing.title}`, entity_type: 'reminder', entity_id: existing.id,
    });
    return result;
  }

  /**
   * Fire all reminders whose time has passed. Runs on an interval OUTSIDE any
   * request, so it sees all tenants (the tenant-scope extension is inert without
   * ALS context) and must set `tenant_id` explicitly on the notifications it
   * writes. Each reminder is claimed with an atomic conditional UPDATE so a
   * multi-pod deployment can never double-notify. Returns the number fired.
   */
  async sweepDue(now = new Date(), { batchSize = 500 } = {}) {
    const due = await this.db.reminder.findMany({
      where:   { status: 'pending', remind_at: { lte: now } },
      orderBy: { remind_at: 'asc' },
      take:    batchSize,
    });
    let fired = 0;
    for (const r of due) {
      // Atomic claim: only the pod that flips pending → notified proceeds.
      const claim = await this.db.reminder.updateMany({
        where: { id: r.id, status: 'pending' },
        data:  { status: 'notified', notified_at: now },
      });
      if (claim.count !== 1) continue;
      try {
        const link = r.record_id ? `/reminders?record=${r.record_id}` : '/reminders';
        await this.db.notification.create({
          data: {
            employee_id: r.employee_id,
            type:        'reminder',
            title:       r.title,
            body:        r.note ?? 'Reminder due',
            link,
            tenant_id:   r.tenant_id,
          },
        });
        this.eventBus?.publish?.('reminder.due', { reminder: r }).catch(() => {});
        fired++;
      } catch (err) {
        logger.warn(`[ReminderService] failed to notify reminder ${r.id}: ${err.message}`);
        // Roll the claim back so the next sweep retries it.
        await this.db.reminder.updateMany({
          where: { id: r.id, status: 'notified' },
          data:  { status: 'pending', notified_at: null },
        }).catch(() => {});
      }
    }
    if (fired) logger.info(`[ReminderService] fired ${fired} reminder(s)`);
    return fired;
  }
}

module.exports = ReminderService;
