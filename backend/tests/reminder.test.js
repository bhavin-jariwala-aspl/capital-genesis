'use strict';

/**
 * ReminderService — unit tests (all DB calls mocked).
 * Covers: create validation, role-scoped visibility, snooze re-arm, and the
 * due-sweep atomic claim → notification behaviour.
 */

const ReminderService = require('../src/services/reminder.service');
const { ValidationError, NotFoundError } = require('../src/utils/errors');

function viewer(role, id) {
  return { role, employee_id: id, employeeId: id };
}

function makePrisma(overrides = {}) {
  return {
    reminder: {
      findUnique: jest.fn(),
      findMany:   jest.fn().mockResolvedValue([]),
      create:     jest.fn(async ({ data, include }) => ({ id: 1, ...data })),
      update:     jest.fn(async ({ data }) => ({ id: 1, ...data })),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      delete:     jest.fn().mockResolvedValue({ id: 1 }),
    },
    notification:      { create: jest.fn().mockResolvedValue({ id: 99 }) },
    employeeHierarchy: { findMany: jest.fn().mockResolvedValue([]) },
    auditLog:          { create: jest.fn().mockResolvedValue({}) },
    ...overrides,
  };
}

describe('ReminderService.create', () => {
  it('rejects a missing title', async () => {
    const svc = new ReminderService(makePrisma());
    await expect(svc.create('E1', { remind_at: '2026-08-01T10:00:00Z' }, viewer('user', 'E1')))
      .rejects.toThrow(ValidationError);
  });

  it('rejects an invalid remind_at', async () => {
    const svc = new ReminderService(makePrisma());
    await expect(svc.create('E1', { title: 'Call back', remind_at: 'not-a-date' }, viewer('user', 'E1')))
      .rejects.toThrow(/valid remind_at/);
  });

  it('creates a pending reminder targeting the creator by default', async () => {
    const db = makePrisma();
    const svc = new ReminderService(db);
    const r = await svc.create('E1', { title: 'Follow up', remind_at: '2026-08-01T10:00:00Z' }, viewer('user', 'E1'));
    expect(db.reminder.create).toHaveBeenCalled();
    expect(r.employee_id).toBe('E1');
    expect(r.status).toBe('pending');
  });

  it('blocks a user from assigning a reminder outside their scope', async () => {
    const db = makePrisma(); // no hierarchy → user sees only self
    const svc = new ReminderService(db);
    await expect(
      svc.create('E1', { title: 'x', remind_at: '2026-08-01T10:00:00Z', employee_id: 'E2' }, viewer('user', 'E1')),
    ).rejects.toThrow(/cannot assign/);
  });

  it('lets an admin assign a reminder to anyone', async () => {
    const db = makePrisma();
    const svc = new ReminderService(db);
    const r = await svc.create('A1', { title: 'x', remind_at: '2026-08-01T10:00:00Z', employee_id: 'E2' }, viewer('admin', 'A1'));
    expect(r.employee_id).toBe('E2');
  });
});

describe('ReminderService access control', () => {
  it('hides a reminder a user does not own', async () => {
    const db = makePrisma();
    db.reminder.findUnique.mockResolvedValue({ id: 5, employee_id: 'E2', created_by: 'E2', record_id: null });
    const svc = new ReminderService(db);
    await expect(svc.complete(5, viewer('user', 'E1'))).rejects.toThrow(NotFoundError);
  });

  it('allows the owner to complete their reminder', async () => {
    const db = makePrisma();
    db.reminder.findUnique.mockResolvedValue({ id: 5, employee_id: 'E1', created_by: 'E1', record_id: null, status: 'pending' });
    const svc = new ReminderService(db);
    const r = await svc.complete(5, viewer('user', 'E1'));
    expect(r.status).toBe('done');
    expect(r.completed_at).toBeInstanceOf(Date);
  });
});

describe('ReminderService.snooze', () => {
  it('reschedules by minutes and re-arms to pending', async () => {
    const db = makePrisma();
    db.reminder.findUnique.mockResolvedValue({ id: 7, employee_id: 'E1', created_by: 'E1', status: 'notified' });
    const svc = new ReminderService(db);
    const r = await svc.snooze(7, { minutes: 60 }, viewer('user', 'E1'));
    expect(r.status).toBe('pending');
    expect(r.notified_at).toBeNull();
    expect(r.remind_at).toBeInstanceOf(Date);
  });

  it('requires remind_at or minutes', async () => {
    const db = makePrisma();
    db.reminder.findUnique.mockResolvedValue({ id: 7, employee_id: 'E1', created_by: 'E1' });
    const svc = new ReminderService(db);
    await expect(svc.snooze(7, {}, viewer('user', 'E1'))).rejects.toThrow(ValidationError);
  });
});

describe('ReminderService.sweepDue', () => {
  it('claims each due reminder atomically and creates a tenant-scoped notification', async () => {
    const due = [
      { id: 1, employee_id: 'E1', title: 'A', note: null, record_id: 10, tenant_id: 3 },
      { id: 2, employee_id: 'E2', title: 'B', note: 'hi', record_id: null, tenant_id: 4 },
    ];
    const db = makePrisma();
    db.reminder.findMany.mockResolvedValue(due);
    const svc = new ReminderService(db);
    const fired = await svc.sweepDue(new Date());
    expect(fired).toBe(2);
    // atomic claim used (updateMany with status guard), once per reminder
    expect(db.reminder.updateMany).toHaveBeenCalledTimes(2);
    // notifications carry explicit tenant_id (sweep runs outside request ALS)
    expect(db.notification.create).toHaveBeenCalledTimes(2);
    const first = db.notification.create.mock.calls[0][0].data;
    expect(first).toMatchObject({ employee_id: 'E1', type: 'reminder', tenant_id: 3, link: '/reminders?record=10' });
  });

  it('does not notify when the atomic claim is lost to another pod', async () => {
    const db = makePrisma();
    db.reminder.findMany.mockResolvedValue([{ id: 1, employee_id: 'E1', title: 'A', tenant_id: 3, record_id: null }]);
    db.reminder.updateMany.mockResolvedValue({ count: 0 }); // someone else claimed it
    const svc = new ReminderService(db);
    const fired = await svc.sweepDue(new Date());
    expect(fired).toBe(0);
    expect(db.notification.create).not.toHaveBeenCalled();
  });
});
