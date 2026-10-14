'use strict';

/** Personal calendar feed (PRD RM-FR-03): signed URL, revocation, iCalendar output. */

const CalendarFeedService = require('../src/services/calendar-feed.service');
const { feedToken, parseToken, fold } = CalendarFeedService;

const emp = (extra = {}) => ({ employee_id: 'GCRM1', employee_name: 'Priya Ramdin', tenant_id: 6, tokens_valid_after: null, is_active: true, ...extra });
const db = (row, data = {}) => ({
  employee: { findUnique: jest.fn().mockResolvedValue(row) },
  activity: { findMany: jest.fn().mockResolvedValue(data.activities ?? []) },
  task: { findMany: jest.fn().mockResolvedValue(data.tasks ?? []) },
  reminder: { findMany: jest.fn().mockResolvedValue(data.reminders ?? []) },
  uiObject: { findMany: jest.fn().mockResolvedValue([]) },
});

describe('calendar feed token', () => {
  it('round-trips for the same employee and tenant', async () => {
    const e = emp();
    const svc = new CalendarFeedService(db(e));
    expect(await svc.resolve(parseToken(feedToken(e)))).toMatchObject({ employee_id: 'GCRM1' });
  });
  it('stops working after sign-out-everywhere or deactivation', async () => {
    const token = parseToken(feedToken(emp()));
    expect(await new CalendarFeedService(db(emp({ tokens_valid_after: new Date() }))).resolve(token)).toBeNull();
    expect(await new CalendarFeedService(db(emp({ is_active: false }))).resolve(token)).toBeNull();
  });
  it('rejects a tampered tenant or signature', async () => {
    const t = feedToken(emp());
    const svc = new CalendarFeedService(db(emp()));
    expect(await svc.resolve(parseToken(t.replace('.6.', '.7.')))).toBeNull();
    expect(await svc.resolve(parseToken(`${t.slice(0, -1)}${t.endsWith('A') ? 'B' : 'A'}`))).toBeNull();
    expect(parseToken('nonsense')).toBeNull();
  });
});

describe('iCalendar output', () => {
  it('lists meetings, tasks and reminders with escaped, folded text', async () => {
    const at = new Date('2026-10-20T06:00:00Z');
    const svc = new CalendarFeedService(db(emp(), {
      activities: [{ id: 1, type: 'meeting', subject: 'Review; Ramdin, family', description: 'Line 1\nLine 2', scheduled_at: at, duration_min: 60, completed_at: null }],
      tasks: [{ id: 2, title: 'Chase valuation report', description: null, due_date: at }],
      reminders: [{ id: 3, title: 'Call back', remind_at: at }],
    }));
    const body = await svc.ics(emp(), at.getTime());
    expect(body.startsWith('BEGIN:VCALENDAR\r\n')).toBe(true);
    expect(body).toContain('SUMMARY:Review\\; Ramdin\\, family');
    expect(body).toContain('DESCRIPTION:Line 1\\nLine 2');
    expect(body).toContain('DTSTART:20261020T060000Z');
    expect(body).toContain('DTEND:20261020T070000Z');
    expect(body).toContain('DTSTART;VALUE=DATE:20261020');
    expect(body).toContain('UID:reminder-3@genesis-crm');
    expect(body.split('\r\n').every((l) => Buffer.byteLength(l) <= 75)).toBe(true);
  });
  it('folds long lines without splitting multi-byte characters', () => {
    const line = `SUMMARY:${'é'.repeat(80)}`;
    const folded = fold(line);
    expect(folded.split('\r\n ').join('')).toBe(line);
    expect(folded.split('\r\n').every((l) => Buffer.byteLength(l) <= 75)).toBe(true);
  });
});

describe('records on the calendar (config.calendar)', () => {
  it('converts a local meeting time in the tenant timezone to UTC', () => {
    // Mauritius is UTC+4 all year.
    expect(CalendarFeedService.zonedToUtc(new Date('2026-07-14T00:00:00Z'), '15:00', 'Indian/Mauritius').toISOString()).toBe('2026-07-14T11:00:00.000Z');
    expect(CalendarFeedService.zonedToUtc(new Date('2026-07-14T00:00:00Z'), 'soon', 'Indian/Mauritius')).toBeNull();
  });

  it('adds owned, dated records from opted-in objects', async () => {
    const day = new Date('2026-10-20T00:00:00Z');
    const d = db(emp());
    d.uiObject = { findMany: jest.fn().mockResolvedValue([
      { id: 5, name: 'meeting_note', label: 'Meeting Note', config: { title_field: 'name', calendar: [{ date_field: 'meeting_date', time_field: 'meeting_time', label: 'Meeting' }, { date_field: 'follow_up_date', label: 'Follow up' }] } },
      { id: 6, name: 'party', label: 'Party', config: {} },
    ]) };
    d.tenant = { findUnique: jest.fn().mockResolvedValue({ timezone: 'Indian/Mauritius' }) };
    d.recordFieldValue = { findMany: jest.fn(async ({ where }) => {
      if (where.field_name === 'meeting_date') return [{ record_id: 70, date_value: day }];
      if (where.field_name === 'follow_up_date') return [{ record_id: 70, date_value: new Date('2026-10-27T00:00:00Z') }];
      return [{ record_id: 70, field_name: 'name', str_value: 'Review · Ramdin' }, { record_id: 70, field_name: 'meeting_time', str_value: '10:30' }];
    }) };
    const body = await new CalendarFeedService(d).ics(emp(), day.getTime());
    expect(body).toContain('SUMMARY:Meeting: Review · Ramdin');
    expect(body).toContain('DTSTART:20261020T063000Z');
    expect(body).toContain('SUMMARY:Follow up: Review · Ramdin');
    expect(body).toContain('DTSTART;VALUE=DATE:20261027');
    // Only the employee's own records are asked for.
    expect(d.recordFieldValue.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ record: expect.objectContaining({ assigned_to: 'GCRM1' }) }) }));
  });
});
