'use strict';

const crypto = require('crypto');

// Not attached to a record, or attached to one that is not in the Trash.
const LIVE_RECORD = { OR: [{ record_id: null }, { record: { is: { deleted_at: null } } }] };

/**
 * Personal calendar feed (PRD RM-FR-03) — an iCalendar (RFC 5545) URL a user
 * subscribes to from Outlook, Google or Apple Calendar. It lists their
 * scheduled meetings and calls, open tasks with a due date, pending
 * reminders, and dated records they own on any object that opts in, from 30
 * days back to 180 days ahead:
 *
 *   object config.calendar = [
 *     { date_field: 'meeting_date', time_field: 'meeting_time', duration_min: 60, label: 'Meeting' },
 *     { date_field: 'follow_up_date', label: 'Follow up' },
 *   ]
 *
 * `time_field` holds a local "HH:MM" in the tenant's timezone; without it the
 * event is all-day.
 *
 * Calendar apps cannot send a sign-in header, so the URL carries a signed,
 * per-user token. The signature covers `tokens_valid_after`: "sign out
 * everywhere", a password change or deactivation invalidates the link, and
 * the user simply copies a new one.
 */

const PREFIX = 'gcal1';
const DAY = 24 * 60 * 60 * 1000;
const secret = () => crypto.createHash('sha256').update(`genesis-calendar|${process.env.CALENDAR_FEED_SECRET || process.env.JWT_SECRET || 'dev'}`).digest();
const b64 = (s) => Buffer.from(String(s)).toString('base64url');
const sign = (body) => crypto.createHmac('sha256', secret()).update(body).digest('base64url').slice(0, 32);
const epoch = (d) => (d ? new Date(d).getTime() : 0);

/** The feed token for an employee row (needs employee_id, tenant_id, tokens_valid_after). */
function feedToken(emp) {
  const body = `${b64(emp.employee_id)}.${emp.tenant_id ?? 0}`;
  return `${PREFIX}.${body}.${sign(`${body}.${epoch(emp.tokens_valid_after)}`)}`;
}

/** Parse a token without trusting it: { employeeId, tenantId, body, sig } or null. */
function parseToken(token) {
  const m = /^gcal1\.([A-Za-z0-9_-]{1,40})\.(\d{1,10})\.([A-Za-z0-9_-]{32})$/.exec(String(token ?? ''));
  if (!m) return null;
  return { employeeId: Buffer.from(m[1], 'base64url').toString(), tenantId: Number(m[2]) || null, body: `${m[1]}.${m[2]}`, sig: m[3] };
}

/** Check a parsed token against the employee's current revocation point. */
function tokenMatches(parsed, emp) {
  if (!parsed || !emp || emp.is_active === false) return false;
  const want = Buffer.from(sign(`${parsed.body}.${epoch(emp.tokens_valid_after)}`));
  const got = Buffer.from(parsed.sig);
  return want.length === got.length && crypto.timingSafeEqual(want, got);
}

// ── iCalendar text ─────────────────────────────────────────────────────────

/** Milliseconds the zone is ahead of UTC at instant `ts`. */
function tzOffsetMs(ts, tz) {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }).formatToParts(new Date(ts));
  const get = (t) => Number(parts.find((p) => p.type === t).value);
  return Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second')) - ts;
}

/** A local date + "HH:MM" in `tz` as a UTC Date (null when the time is unusable). */
function zonedToUtc(date, time, tz) {
  const m = /^(\d{1,2}):(\d{2})/.exec(String(time ?? '').trim());
  if (!m) return null;
  const d = new Date(date);
  const guess = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), Number(m[1]), Number(m[2]));
  try { return new Date(guess - tzOffsetMs(guess, tz || 'UTC')); } catch { return new Date(guess); }
}

const esc = (s) => String(s ?? '').replace(/\\/g, '\\\\').replace(/\r?\n/g, '\\n').replace(/([,;])/g, '\\$1');
const stamp = (d) => new Date(d).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
const dateOnly = (d) => new Date(d).toISOString().slice(0, 10).replace(/-/g, '');

/** Fold content lines at 75 octets (RFC 5545 §3.1). */
function fold(line) {
  const bytes = Buffer.from(line);
  if (bytes.length <= 75) return line;
  const out = [];
  let start = 0;
  let limit = 75;
  while (start < bytes.length) {
    let end = Math.min(start + limit, bytes.length);
    // Do not split a UTF-8 sequence.
    while (end < bytes.length && (bytes[end] & 0xc0) === 0x80) end--;
    out.push(bytes.subarray(start, end).toString());
    start = end;
    limit = 74; // continuation lines start with a space
  }
  return out.join('\r\n ');
}

function event({ uid, start, end, allDay, summary, description, status }) {
  const lines = ['BEGIN:VEVENT', `UID:${uid}`, `DTSTAMP:${stamp(Date.now())}`];
  if (allDay) {
    lines.push(`DTSTART;VALUE=DATE:${dateOnly(start)}`, `DTEND;VALUE=DATE:${dateOnly(new Date(start).getTime() + DAY)}`);
  } else {
    lines.push(`DTSTART:${stamp(start)}`, `DTEND:${stamp(end ?? new Date(start).getTime() + 30 * 60 * 1000)}`);
  }
  lines.push(`SUMMARY:${esc(summary)}`);
  if (description) lines.push(`DESCRIPTION:${esc(description)}`);
  if (status) lines.push(`STATUS:${status}`);
  lines.push('END:VEVENT');
  return lines;
}

function render(name, items) {
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Genesis CRM//Calendar feed//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    `X-WR-CALNAME:${esc(name)}`, 'X-PUBLISHED-TTL:PT1H', 'REFRESH-INTERVAL;VALUE=DURATION:PT1H'];
  for (const it of items) lines.push(...event(it));
  lines.push('END:VCALENDAR');
  return `${lines.map(fold).join('\r\n')}\r\n`;
}

class CalendarFeedService {
  constructor(prisma) { this.db = prisma; }

  /** Feed URL path for the signed-in user. */
  async subscription(employeeId) {
    const emp = await this.db.employee.findUnique({ where: { employee_id: employeeId }, select: { employee_id: true, tenant_id: true, tokens_valid_after: true } });
    if (!emp) return null;
    return { path: `/api/calendar/feed/${feedToken(emp)}.ics` };
  }

  /** Verify a feed token; returns the employee or null. Run inside the token's tenant. */
  async resolve(parsed) {
    if (!parsed) return null;
    const emp = await this.db.employee.findUnique({
      where: { employee_id: parsed.employeeId },
      select: { employee_id: true, employee_name: true, tenant_id: true, tokens_valid_after: true, is_active: true },
    });
    if (!emp || (emp.tenant_id ?? null) !== (parsed.tenantId ?? null)) return null;
    return tokenMatches(parsed, emp) ? emp : null;
  }

  /** The calendar body for one employee. */
  async ics(emp, now = Date.now()) {
    const from = new Date(now - 30 * DAY);
    const to = new Date(now + 180 * DAY);
    const [activities, tasks, reminders] = await Promise.all([
      this.db.activity.findMany({
        where: { employee_id: emp.employee_id, scheduled_at: { gte: from, lte: to }, record: { deleted_at: null } },
        select: { id: true, type: true, subject: true, description: true, scheduled_at: true, duration_min: true, completed_at: true },
        orderBy: { scheduled_at: 'asc' }, take: 1000,
      }),
      this.db.task.findMany({
        where: { assigned_to: emp.employee_id, due_date: { gte: from, lte: to }, status: { notIn: ['completed', 'cancelled'] }, ...LIVE_RECORD },
        select: { id: true, title: true, description: true, due_date: true },
        orderBy: { due_date: 'asc' }, take: 1000,
      }),
      this.db.reminder.findMany({
        where: { employee_id: emp.employee_id, remind_at: { gte: from, lte: to }, status: { in: ['pending', 'notified'] }, ...LIVE_RECORD },
        select: { id: true, title: true, remind_at: true },
        orderBy: { remind_at: 'asc' }, take: 1000,
      }),
    ]);
    const items = [
      ...(await this.#recordEvents(emp, from, to)),
      ...activities.map((a) => ({
        uid: `activity-${a.id}@genesis-crm`, start: a.scheduled_at,
        end: new Date(a.scheduled_at).getTime() + (a.duration_min || 30) * 60 * 1000,
        summary: a.subject, description: a.description, status: a.completed_at ? 'CONFIRMED' : 'TENTATIVE',
      })),
      ...tasks.map((t) => ({ uid: `task-${t.id}@genesis-crm`, start: t.due_date, allDay: true, summary: `Task: ${t.title}`, description: t.description })),
      ...reminders.map((r) => ({ uid: `reminder-${r.id}@genesis-crm`, start: r.remind_at, end: new Date(r.remind_at).getTime() + 15 * 60 * 1000, summary: `Reminder: ${r.title}` })),
    ];
    return render(`Genesis CRM — ${emp.employee_name ?? emp.employee_id}`, items);
  }

  /** Dated records the employee owns on objects with `config.calendar`. */
  async #recordEvents(emp, from, to) {
    const objects = (await this.db.uiObject.findMany({ where: { is_active: true }, select: { id: true, name: true, label: true, config: true } }))
      .filter((o) => Array.isArray(o.config?.calendar) && o.config.calendar.length);
    if (!objects.length) return [];
    const tenant = emp.tenant_id ? await this.db.tenant.findUnique({ where: { id: emp.tenant_id }, select: { timezone: true } }).catch(() => null) : null;
    const tz = tenant?.timezone || 'UTC';
    const out = [];
    for (const o of objects) {
      for (const spec of o.config.calendar.slice(0, 5)) {
        if (!spec?.date_field) continue;
        const dated = await this.db.recordFieldValue.findMany({
          where: { field_name: spec.date_field, date_value: { gte: from, lte: to }, record: { object_id: o.id, assigned_to: emp.employee_id, deleted_at: null } },
          select: { record_id: true, date_value: true }, take: 500,
        });
        if (!dated.length) continue;
        const ids = dated.map((d) => d.record_id);
        const extra = [o.config.title_field, spec.time_field].filter(Boolean);
        const vals = extra.length ? await this.db.recordFieldValue.findMany({ where: { record_id: { in: ids }, field_name: { in: extra } }, select: { record_id: true, field_name: true, str_value: true } }) : [];
        const get = (id, f) => vals.find((v) => v.record_id === id && v.field_name === f)?.str_value ?? null;
        for (const d of dated) {
          const title = get(d.record_id, o.config.title_field) || `${o.label} #${d.record_id}`;
          const summary = `${spec.label ? `${spec.label}: ` : `${o.label}: `}${title}`;
          const start = spec.time_field ? zonedToUtc(d.date_value, get(d.record_id, spec.time_field), tz) : null;
          out.push(start
            ? { uid: `record-${d.record_id}-${spec.date_field}@genesis-crm`, start, end: start.getTime() + (Number(spec.duration_min) || 60) * 60 * 1000, summary }
            : { uid: `record-${d.record_id}-${spec.date_field}@genesis-crm`, start: d.date_value, allDay: true, summary });
        }
      }
    }
    return out;
  }
}

module.exports = CalendarFeedService;
module.exports.zonedToUtc = zonedToUtc;
module.exports.feedToken = feedToken;
module.exports.parseToken = parseToken;
module.exports.render = render;
module.exports.fold = fold;
