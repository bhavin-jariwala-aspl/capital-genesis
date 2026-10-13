'use strict';

jest.mock('@prisma/client');

const ReportScheduleService = require('../src/services/report-schedule.service');
const { nextRunAt, describeSchedule, normalizeRecipients } = require('../src/services/report-schedule.service');

// Monday 17 Aug 2026, 10:00 local.
const MONDAY_10AM = new Date(2026, 7, 17, 10, 0, 0, 0);

describe('schedule maths', () => {
  it('rolls a daily schedule to tomorrow once today’s slot has passed', () => {
    const next = nextRunAt({ frequency: 'daily', hour: 8 }, MONDAY_10AM);
    expect(next.getDate()).toBe(18);
    expect(next.getHours()).toBe(8);
  });

  it('keeps a daily schedule today when the slot is still ahead', () => {
    const next = nextRunAt({ frequency: 'daily', hour: 17 }, MONDAY_10AM);
    expect(next.getDate()).toBe(17);
    expect(next.getHours()).toBe(17);
  });

  it('skips the weekend for a weekdays-only schedule', () => {
    const friday = new Date(2026, 7, 21, 12, 0, 0, 0);
    const next = nextRunAt({ frequency: 'weekdays', hour: 9 }, friday);
    expect(next.getDay()).toBe(1); // Monday
    expect(next.getDate()).toBe(24);
  });

  it('lands a weekly schedule on the chosen weekday', () => {
    const next = nextRunAt({ frequency: 'weekly', day_of_week: 4, hour: 8 }, MONDAY_10AM);
    expect(next.getDay()).toBe(4);
    expect(next.getDate()).toBe(20);
  });

  it('rolls a monthly schedule into next month when the day has passed', () => {
    const next = nextRunAt({ frequency: 'monthly', day_of_month: 1, hour: 7 }, MONDAY_10AM);
    expect(next.getMonth()).toBe(8); // September
    expect(next.getDate()).toBe(1);
  });

  it('clamps an out-of-range hour and day rather than producing an invalid date', () => {
    const next = nextRunAt({ frequency: 'monthly', day_of_month: 99, hour: 99 }, MONDAY_10AM);
    expect(next.getHours()).toBe(23);
    expect(next.getDate()).toBe(28);
  });

  it('describes a schedule in words a business user can check', () => {
    expect(describeSchedule({ frequency: 'weekly', day_of_week: 1, hour: 8 })).toBe('Every Monday at 8:00 AM');
    expect(describeSchedule({ frequency: 'daily', hour: 13 })).toBe('Every day at 1:00 PM');
    expect(describeSchedule({ frequency: 'weekdays', hour: 12 })).toBe('Every weekday at 12:00 PM');
    expect(describeSchedule({ frequency: 'monthly', day_of_month: 5, hour: 0 })).toBe('Day 5 of each month at 12:00 AM');
  });
});

describe('recipient handling', () => {
  it('accepts a comma, semicolon or space separated list and drops invalid entries', () => {
    expect(normalizeRecipients('a@b.com; c@d.com, not-an-email  e@f.org'))
      .toEqual(['a@b.com', 'c@d.com', 'e@f.org']);
  });

  it('de-duplicates case-insensitively', () => {
    expect(normalizeRecipients(['A@B.com', 'a@b.com'])).toEqual(['a@b.com']);
  });

  it('caps the list so one subscription cannot be turned into a mailing blast', () => {
    const many = Array.from({ length: 60 }, (_, i) => `u${i}@x.com`);
    expect(normalizeRecipients(many)).toHaveLength(25);
  });
});

describe('ReportScheduleService — validation', () => {
  const svc = () => new ReportScheduleService({}, {}, {});

  it('rejects a frequency that is not on the dropdown', async () => {
    const s = svc();
    await expect(s.update(1, { frequency: 'fortnightly' })).rejects.toThrow();
  });

  it('offers only frequencies and formats the UI can render', () => {
    const opts = svc().getOptions();
    expect(opts.frequencies.map((f) => f.key)).toEqual(['hourly', 'daily', 'weekdays', 'weekly', 'monthly']);
    expect(opts.formats.map((f) => f.key)).toEqual(['inline', 'xlsx', 'csv']);
    expect(opts.alert_ops.map((o) => o.key)).toContain('gt');
    expect(opts.hours).toHaveLength(24);
    expect(opts.days_of_week[0]).toEqual({ key: 0, label: 'Sunday' });
  });
});

describe('ReportScheduleService — sweep', () => {
  function makePrisma(due) {
    return {
      reportSubscription: {
        findMany: jest.fn().mockResolvedValue(due),
        // Simulate another pod having already claimed the row.
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
        update: jest.fn().mockResolvedValue({}),
        findUnique: jest.fn().mockResolvedValue(null),
      },
    };
  }

  it('does nothing when no subscription is due', async () => {
    const prisma = makePrisma([]);
    const res = await new ReportScheduleService(prisma, {}, {}).sweepDue();
    expect(res).toEqual({ claimed: 0, sent: 0 });
    expect(prisma.reportSubscription.updateMany).not.toHaveBeenCalled();
  });

  it('skips a subscription another pod already claimed', async () => {
    const prisma = makePrisma([{ id: 7, tenant_id: 1, next_run_at: new Date() }]);
    const res = await new ReportScheduleService(prisma, {}, {}).sweepDue();
    expect(prisma.reportSubscription.updateMany).toHaveBeenCalledTimes(1);
    expect(res.claimed).toBe(0);
  });

  it('claims on the exact next_run_at it read, so the claim cannot race', async () => {
    const when = new Date('2026-08-17T08:00:00Z');
    const prisma = makePrisma([{ id: 7, tenant_id: 1, next_run_at: when }]);
    await new ReportScheduleService(prisma, {}, {}).sweepDue();
    expect(prisma.reportSubscription.updateMany).toHaveBeenCalledWith({
      where: { id: 7, next_run_at: when },
      data: { next_run_at: null },
    });
  });

  it('only looks at active subscriptions whose time has come', async () => {
    const prisma = makePrisma([]);
    await new ReportScheduleService(prisma, {}, {}).sweepDue();
    const { where } = prisma.reportSubscription.findMany.mock.calls[0][0];
    expect(where.is_active).toBe(true);
    expect(where.next_run_at.lte).toBeInstanceOf(Date);
    expect(where.next_run_at.not).toBeNull();
  });
});
