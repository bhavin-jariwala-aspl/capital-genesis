'use strict';

const { tenantContext } = require('../middleware/tenant-scope');
const CurrencyService = require('./currency.service');
const { ADMIN_THRESHOLD, MANAGER_THRESHOLD } = require('../middleware/authenticate');
const { ValidationError, NotFoundError } = require('../utils/errors');
const { logger } = require('./logging.service');
const { recordSnapshot } = require('./report-snapshots');
const { enrichRunContext } = require('./report-run-context');

const FREQUENCIES = [
  { key: 'hourly',   label: 'Every hour' },
  { key: 'daily',    label: 'Every day' },
  { key: 'weekdays', label: 'Every weekday (Mon–Fri)' },
  { key: 'weekly',   label: 'Every week' },
  { key: 'monthly',  label: 'Every month' },
];
const FORMATS = [
  { key: 'inline', label: 'In the email body' },
  { key: 'xlsx',   label: 'Excel attachment' },
  { key: 'csv',    label: 'CSV attachment' },
];
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_RECIPIENTS = 25;

/**
 * Threshold alerts — "only send when…". A subscription may carry a condition on
 * one measure's grand total (or the row count); the report is then run on the
 * schedule but only *delivered* when the condition holds. This is what turns a
 * scheduled report into an exception report: "email me when overdue tasks pass
 * 20", "tell me if pipeline drops below 1M".
 */
const ALERT_OPS = [
  { key: 'gt',         label: 'is greater than' },
  { key: 'gte',        label: 'is at least' },
  { key: 'lt',         label: 'is less than' },
  { key: 'lte',        label: 'is at most' },
  { key: 'equals',     label: 'is exactly' },
  { key: 'not_equals', label: 'is not' },
  { key: 'changed',    label: 'has changed since the last check', no_value: true },
];

/**
 * ReportScheduleService — recurring emailed report delivery.
 *
 * This is the piece that lets a business user say "email me the pipeline every
 * Monday at 8am" without asking anyone technical: they pick a frequency from a
 * dropdown and the sweeper does the rest. It mirrors Salesforce report
 * subscriptions, HubSpot scheduled reports and Zoho's schedule dialog.
 *
 * `sweepDue()` is run on an interval by the app. It claims each due subscription
 * atomically (`updateMany` guarded on the row it read) so running several pods
 * cannot double-send, then executes the report inside that subscription's tenant
 * context and emails the result.
 */
class ReportScheduleService {
  /**
   * @param prisma   Prisma client
   * @param reportSvc  ReportService, used to run the report
   * @param emailSvc   EmailSendService, used to deliver it
   */
  constructor(prisma, reportSvc, emailSvc) {
    this.db = prisma;
    this.reports = reportSvc;
    this.email = emailSvc;
  }

  static get FREQUENCIES() { return FREQUENCIES; }
  static get FORMATS() { return FORMATS; }
  static get ALERT_OPS() { return ALERT_OPS; }

  getOptions() {
    return {
      frequencies: FREQUENCIES,
      formats: FORMATS,
      alert_ops: ALERT_OPS,
      days_of_week: DAY_NAMES.map((label, key) => ({ key, label })),
      hours: Array.from({ length: 24 }, (_, h) => ({
        key: h,
        label: `${((h + 11) % 12) + 1}:00 ${h < 12 ? 'AM' : 'PM'}`,
      })),
    };
  }

  // ── CRUD ─────────────────────────────────────────────────────────────────

  async list(reportId) {
    return this.db.reportSubscription.findMany({
      where: { report_id: Number(reportId) },
      orderBy: { created_at: 'asc' },
    });
  }

  /** Every subscription an employee owns, across reports — the "my schedules" view. */
  async listForEmployee(employeeId) {
    return this.db.reportSubscription.findMany({
      where: { employee_id: String(employeeId) },
      orderBy: { next_run_at: 'asc' },
      include: { report: { select: { id: true, name: true, category: true } } },
    });
  }

  async create(reportId, body, employeeId) {
    const report = await this.db.customReport.findUnique({ where: { id: Number(reportId) } });
    if (!report) throw new NotFoundError('Report');

    const data = this.#validate(body);
    const sub = await this.db.reportSubscription.create({
      data: {
        ...data,
        report_id: Number(reportId),
        employee_id: String(employeeId),
        next_run_at: nextRunAt(data),
      },
    });
    await this.#syncScheduledFlag(Number(reportId));
    return sub;
  }

  async update(id, body) {
    const existing = await this.db.reportSubscription.findUnique({ where: { id: Number(id) } });
    if (!existing) throw new NotFoundError('Subscription');

    const data = this.#validate({ ...existing, ...body });
    const sub = await this.db.reportSubscription.update({
      where: { id: Number(id) },
      data: { ...data, next_run_at: data.is_active ? nextRunAt(data) : null },
    });
    await this.#syncScheduledFlag(existing.report_id);
    return sub;
  }

  async remove(id) {
    const existing = await this.db.reportSubscription.findUnique({ where: { id: Number(id) } });
    if (!existing) throw new NotFoundError('Subscription');
    await this.db.reportSubscription.delete({ where: { id: Number(id) } });
    await this.#syncScheduledFlag(existing.report_id);
  }

  #validate(body) {
    const frequency = String(body.frequency || 'weekly');
    if (!FREQUENCIES.some((f) => f.key === frequency)) {
      throw new ValidationError(`frequency must be one of: ${FREQUENCIES.map((f) => f.key).join(', ')}`);
    }
    const format = String(body.format || 'xlsx');
    if (!FORMATS.some((f) => f.key === format)) {
      throw new ValidationError(`format must be one of: ${FORMATS.map((f) => f.key).join(', ')}`);
    }

    const hour = Number.isFinite(Number(body.hour)) ? Math.min(23, Math.max(0, Number(body.hour))) : 8;
    const emails = normalizeRecipients(body.recipients);
    // The alert may arrive as its own field (the UI) or already folded into the
    // recipients blob (an existing row being re-validated on update).
    const alert = normalizeAlert(body.alert !== undefined ? body.alert : alertOf(body));
    // Alert state (last value seen) survives an edit unless the alert itself changed.
    const priorState = alertOf(body)?.state;
    const alertWithState = alert && priorState && sameAlert(alert, alertOf(body)) ? { ...alert, state: priorState } : alert;

    return {
      frequency,
      format,
      hour,
      day_of_week: frequency === 'weekly' ? clamp(body.day_of_week, 0, 6, 1) : null,
      day_of_month: frequency === 'monthly' ? clamp(body.day_of_month, 1, 28, 1) : null,
      // Plain array when there is no alert, so older readers keep working.
      recipients: alertWithState ? { emails, alert: alertWithState } : emails,
      scope: ['me', 'team', 'all'].includes(body.scope) ? body.scope : 'all',
      subject: body.subject ? String(body.subject).slice(0, 255) : null,
      message: body.message ? String(body.message) : null,
      is_active: body.is_active === undefined ? true : !!body.is_active,
    };
  }

  /** Keep `custom_reports.is_scheduled` in step so the list can show a badge. */
  async #syncScheduledFlag(reportId) {
    const active = await this.db.reportSubscription.count({
      where: { report_id: reportId, is_active: true },
    });
    await this.db.customReport
      .update({ where: { id: reportId }, data: { is_scheduled: active > 0 } })
      .catch(() => {});
  }

  // ── Delivery ─────────────────────────────────────────────────────────────

  /**
   * Run one subscription and email it. Used by the sweeper and by the
   * "Send now" button, which is how a user verifies a schedule works without
   * waiting a week for it to fire.
   */
  async deliver(subscriptionId, { actorId = null, force = false } = {}) {
    const sub = await this.db.reportSubscription.findUnique({
      where: { id: Number(subscriptionId) },
      include: { report: true },
    });
    if (!sub) throw new NotFoundError('Subscription');
    return this.#send(sub, { actorId, force });
  }

  async #send(sub, { actorId = null, force = false } = {}) {
    const report = sub.report;
    const config = report.data_source || {};

    const scopeCtx = await enrichRunContext(this.db, await this.#scopeFor(sub), sub.tenant_id);
    const result = await this.reports.run(config, scopeCtx);
    await recordSnapshot(this.db, report, result, scopeCtx.scope);

    // ── Threshold alert: run always, deliver only when the condition holds ──
    const alert = alertOf(sub);
    let alertOutcome = null;
    if (alert) {
      alertOutcome = evaluateAlert(alert, result);
      await this.#rememberAlertValue(sub, alert, alertOutcome);
      // "Send now" from the UI is a test of the delivery, so it ignores the condition.
      if (!alertOutcome.met && !force) {
        await this.db.reportSubscription.update({
          where: { id: sub.id },
          data: {
            last_sent_at: new Date(),
            last_status: 'skipped',
            last_error: `Condition not met — ${alertOutcome.description}.`,
            next_run_at: sub.is_active ? nextRunAt(sub) : null,
          },
        });
        await this.#logExecution(report, result, { status: 'skipped', sub, alert: alertOutcome });
        return { sent: 0, skipped: true, reason: 'condition-not-met', alert: alertOutcome };
      }
    }

    const recipients = await this.#resolveRecipients(sub);
    if (!recipients.length) {
      await this.db.reportSubscription.update({
        where: { id: sub.id },
        data: { last_status: 'skipped', last_error: 'No valid recipient email address.', last_sent_at: new Date() },
      });
      return { sent: 0, skipped: true, reason: 'no-recipients' };
    }

    const alertLine = alertOutcome?.met ? `Alert: ${alertOutcome.description}` : null;
    const subtitle = [alertLine, describe(sub), scopeLabel(sub.scope)].filter(Boolean).join(' · ');
    const html = this.reports.toHtml(result, {
      name: report.name,
      description: sub.message || report.description,
      subtitle,
    });
    const subject = sub.subject
      || (alertLine ? `⚠ ${report.name}: ${alertOutcome.description}` : `${report.name} — ${new Date().toLocaleDateString('en-US')}`);

    const attachments = [];
    if (sub.format === 'xlsx') {
      attachments.push({
        filename: `${safeFilename(report.name)}.xlsx`,
        content: this.reports.toXlsx(result, report.name),
        contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
    } else if (sub.format === 'csv') {
      attachments.push({
        filename: `${safeFilename(report.name)}.csv`,
        content: this.reports.toCsv(result),
        contentType: 'text/csv; charset=utf-8',
      });
    }

    let sent = 0;
    let lastError = null;
    for (const to of recipients) {
      try {
        // sendRaw does not throw when the SMTP transport rejects the message — it
        // records the failure on the email log and returns it. Trusting the absence
        // of an exception would report a bounced delivery as "sent".
        const log = await this.email.sendRaw({
          to_email: to,
          subject,
          body_html: html,
          body_text: `${report.name}\n\n${this.reports.toCsv(result)}`,
          related_type: 'report',
          sent_by: actorId || sub.employee_id,
          attachments,
        });
        if (log && log.status !== 'sent') {
          lastError = log.bounce_reason || 'The email could not be delivered.';
          logger?.warn?.('[report-schedule] delivery bounced', { subscription: sub.id, to, error: lastError });
          continue;
        }
        sent += 1;
      } catch (err) {
        lastError = err.message;
        logger?.warn?.('[report-schedule] delivery failed', { subscription: sub.id, to, error: err.message });
      }
    }

    await this.db.reportSubscription.update({
      where: { id: sub.id },
      data: {
        last_sent_at: new Date(),
        last_status: sent > 0 ? 'sent' : 'error',
        last_error: sent > 0 ? null : lastError,
        next_run_at: sub.is_active ? nextRunAt(sub) : null,
      },
    });

    await this.#logExecution(report, result, {
      status: sent > 0 ? 'success' : 'error', error: sent > 0 ? null : lastError, sub, alert: alertOutcome,
    });

    // An alert that fired also lands in the owner's in-app notifications, so it is
    // seen even by someone who does not live in their inbox.
    if (alertOutcome?.met) {
      await this.db.notification.create({
        data: {
          employee_id: sub.employee_id,
          type: 'report_alert',
          title: `${report.name}: ${alertOutcome.description}`,
          body: `The report "${report.name}" met its alert condition and was emailed to ${sent} recipient${sent === 1 ? '' : 's'}.`,
          link: `/reports?opened=${report.id}`,
        },
      }).catch(() => {});
    }

    return { sent, recipients: recipients.length, rows: result.meta.row_count, alert: alertOutcome };
  }

  async #logExecution(report, result, { status, error = null, sub, alert }) {
    await this.db.reportExecution.create({
      data: {
        report_id: report.id,
        executed_by: null, // scheduled run
        execution_time: result.meta.executed_ms,
        status,
        result_rows: result.meta.row_count,
        error_message: error,
        filters_used: {
          scheduled: true, subscription_id: sub.id, scope: sub.scope,
          ...(alert ? { alert: { value: alert.value, met: alert.met } } : {}),
        },
      },
    }).catch(() => {});
  }

  /** Keep the last value seen so "has changed" and "only on change" have a baseline. */
  async #rememberAlertValue(sub, alert, outcome) {
    const emails = normalizeRecipients(sub.recipients);
    const next = { emails, alert: { ...alert, state: { last_value: outcome.value ?? null, last_met: outcome.met, at: new Date().toISOString() } } };
    await this.db.reportSubscription.update({ where: { id: sub.id }, data: { recipients: next } }).catch(() => {});
  }

  /**
   * Data scope for a scheduled run. The subscription owner's role decides what
   * they may see — a schedule can never widen someone's visibility.
   */
  async #scopeFor(sub) {
    const owner = await this.db.employee.findUnique({
      where: { employee_id: sub.employee_id },
      select: { employee_id: true, role: true },
    });
    // A missing owner or role must fail closed. `findFirst({ name: undefined })`
    // would drop the condition and hand back an arbitrary role — potentially the
    // most privileged one — so the lookup is skipped unless there is a role name.
    const role = owner?.role
      ? await this.db.role.findFirst({ where: { name: owner.role }, select: { level: true } }).catch(() => null)
      : null;
    const level = role?.level ?? 99;

    let scope = ['me', 'team', 'all'].includes(sub.scope) ? sub.scope : 'all';
    if (scope === 'all' && level > ADMIN_THRESHOLD) scope = 'team';
    if (scope === 'team' && level > MANAGER_THRESHOLD) scope = 'me';

    let teamIds;
    if (scope === 'team') {
      const rows = await this.db.employeeHierarchy.findMany({
        where: { ancestor_id: sub.employee_id, depth: { gte: 0 } },
        select: { descendant_id: true },
      });
      teamIds = rows.map((r) => r.descendant_id);
    }
    return { scope, employeeId: sub.employee_id, teamIds };
  }

  async #resolveRecipients(sub) {
    const out = new Set();
    const owner = await this.db.employee.findUnique({
      where: { employee_id: sub.employee_id },
      select: { email: true },
    });
    if (owner?.email && EMAIL_RE.test(owner.email)) out.add(owner.email);
    for (const e of normalizeRecipients(sub.recipients)) out.add(e);
    return [...out].slice(0, MAX_RECIPIENTS);
  }

  // ── Sweeper ──────────────────────────────────────────────────────────────

  /**
   * Send every subscription whose next_run_at has passed. Each is claimed with a
   * guarded `updateMany` before the (slow) report run, so a second pod picking up
   * the same row finds nothing to claim and skips it.
   */
  async sweepDue({ limit = 25 } = {}) {
    const now = new Date();
    const due = await this.db.reportSubscription.findMany({
      where: { is_active: true, next_run_at: { not: null, lte: now } },
      select: { id: true, tenant_id: true, next_run_at: true },
      orderBy: { next_run_at: 'asc' },
      take: limit,
    });
    if (!due.length) return { claimed: 0, sent: 0 };

    let claimed = 0;
    let sent = 0;
    for (const row of due) {
      // Atomic claim: park next_run_at so no other pod can pick this row up.
      const { count } = await this.db.reportSubscription.updateMany({
        where: { id: row.id, next_run_at: row.next_run_at },
        data: { next_run_at: null },
      });
      if (count === 0) continue;
      claimed += 1;

      try {
        // A scheduled run has no request, so the tenant must be established here
        // or the Prisma tenant-scope extension would see no tenant at all. The
        // currency context is nested inside it for the same reason: the emailed
        // HTML formats money synchronously and would otherwise default to USD.
        const res = await tenantContext.run({ tenantId: row.tenant_id }, () =>
          new CurrencyService(this.db).withProfile(row.tenant_id, () => this.deliver(row.id)),
        );
        sent += res.sent || 0;
      } catch (err) {
        logger?.error?.('[report-schedule] sweep failed', { subscription: row.id, error: err.message });
        const sub = await this.db.reportSubscription.findUnique({ where: { id: row.id } }).catch(() => null);
        await this.db.reportSubscription.update({
          where: { id: row.id },
          data: {
            last_status: 'error',
            last_error: err.message,
            last_sent_at: new Date(),
            // Reschedule regardless, so one bad run cannot silently kill a schedule.
            next_run_at: sub ? nextRunAt(sub) : null,
          },
        }).catch(() => {});
      }
    }
    return { claimed, sent };
  }
}

// ── helpers ─────────────────────────────────────────────────────────────────

const clamp = (v, lo, hi, fallback) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, Math.trunc(n))) : fallback;
};

function normalizeRecipients(raw) {
  // `{ emails, alert }` is the shape a subscription with an alert stores.
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) raw = raw.emails ?? [];
  const list = Array.isArray(raw)
    ? raw
    : String(raw ?? '').split(/[,;\s]+/);
  return [...new Set(list.map((e) => String(e).trim().toLowerCase()).filter((e) => EMAIL_RE.test(e)))]
    .slice(0, MAX_RECIPIENTS);
}

/** The alert a subscription carries, if any — `recipients` is `{ emails, alert }` then. */
function alertOf(sub) {
  const r = sub?.recipients;
  return r && typeof r === 'object' && !Array.isArray(r) && r.alert && typeof r.alert === 'object' ? r.alert : null;
}

/** Validate an alert from the UI into the stored shape, or null when there is none. */
function normalizeAlert(raw) {
  if (!raw || typeof raw !== 'object' || !raw.op) return null;
  const op = ALERT_OPS.find((o) => o.key === raw.op);
  if (!op) throw new ValidationError(`alert.op must be one of: ${ALERT_OPS.map((o) => o.key).join(', ')}`);
  const measure = /^(m\d+|row_count)$/.test(String(raw.measure || '')) ? String(raw.measure) : 'row_count';
  const value = op.no_value ? null : Number(raw.value);
  if (!op.no_value && !Number.isFinite(value)) throw new ValidationError('Give the alert a number to compare against.');
  return {
    measure,
    op: op.key,
    value,
    label: raw.label ? String(raw.label).slice(0, 120) : null,
    only_on_change: !!raw.only_on_change,
  };
}

const sameAlert = (a, b) => !!a && !!b && a.measure === b.measure && a.op === b.op && a.value === b.value && a.only_on_change === b.only_on_change;

/**
 * Decide whether a run meets its alert. The headline number is the measure's grand
 * total when the report has totals, else the single KPI row, else the column sum.
 */
function evaluateAlert(alert, result) {
  const label = alert.label
    || (alert.measure === 'row_count' ? 'Number of rows' : result.columns?.find((c) => c.key === alert.measure)?.label || alert.measure);
  let value;
  if (alert.measure === 'row_count') value = result.meta?.row_count ?? result.rows?.length ?? 0;
  else if (result.summary?.grand && alert.measure in result.summary.grand) value = result.summary.grand[alert.measure];
  else if (result.rows?.length === 1) value = result.rows[0][alert.measure];
  else value = (result.rows || []).reduce((a, r) => a + (Number(r[alert.measure]) || 0), 0);
  value = value === null || value === undefined ? null : Number(value);

  const last = alert.state?.last_value ?? null;
  let met;
  switch (alert.op) {
    case 'gt':         met = value !== null && value > alert.value; break;
    case 'gte':        met = value !== null && value >= alert.value; break;
    case 'lt':         met = value !== null && value < alert.value; break;
    case 'lte':        met = value !== null && value <= alert.value; break;
    case 'equals':     met = value !== null && value === alert.value; break;
    case 'not_equals': met = value !== null && value !== alert.value; break;
    case 'changed':    met = alert.state ? value !== last : false; break; // first run only sets the baseline
    default:           met = false;
  }
  // "Only on change" suppresses repeats: a threshold that was already met at the
  // previous check does not email again until it stops being met and re-triggers.
  if (met && alert.only_on_change && alert.state?.last_met === true && alert.op !== 'changed') met = false;

  const opLabel = ALERT_OPS.find((o) => o.key === alert.op)?.label || alert.op;
  const shown = value === null ? 'no value' : Number.isInteger(value) ? value.toLocaleString('en-US') : value.toLocaleString('en-US', { maximumFractionDigits: 2 });
  const description = alert.op === 'changed'
    ? `${label} is now ${shown}${last !== null ? ` (was ${last})` : ''}`
    : `${label} is ${shown}, ${met ? '' : 'not '}${opLabel} ${alert.value}`;
  return { met, value, label, description: description.replace(/\s+/g, ' ').trim() };
}

/** The next firing time strictly after `from`, in server local time. */
function nextRunAt(sub, from = new Date()) {
  const hour = clamp(sub.hour, 0, 23, 8);
  const at = (d) => { const x = new Date(d); x.setHours(hour, 0, 0, 0); return x; };
  const addDays = (d, n) => new Date(d.getTime() + n * 86400000);

  if (sub.frequency === 'hourly') {
    const next = new Date(from);
    next.setMinutes(0, 0, 0);
    next.setHours(next.getHours() + 1);
    return next;
  }

  let next = at(from);
  if (next <= from) next = at(addDays(next, 1));

  switch (sub.frequency) {
    case 'daily':
      return next;
    case 'weekdays':
      while (next.getDay() === 0 || next.getDay() === 6) next = at(addDays(next, 1));
      return next;
    case 'weekly': {
      const want = clamp(sub.day_of_week, 0, 6, 1);
      while (next.getDay() !== want) next = at(addDays(next, 1));
      return next;
    }
    case 'monthly': {
      const want = clamp(sub.day_of_month, 1, 28, 1);
      const candidate = at(new Date(next.getFullYear(), next.getMonth(), want));
      return candidate > from ? candidate : at(new Date(next.getFullYear(), next.getMonth() + 1, want));
    }
    default:
      return next;
  }
}

/** Plain-English rendering of a schedule, shown in the UI and the email footer. */
function describe(sub) {
  const hour = clamp(sub.hour, 0, 23, 8);
  const time = `${((hour + 11) % 12) + 1}:00 ${hour < 12 ? 'AM' : 'PM'}`;
  switch (sub.frequency) {
    case 'hourly':   return 'Every hour';
    case 'daily':    return `Every day at ${time}`;
    case 'weekdays': return `Every weekday at ${time}`;
    case 'weekly':   return `Every ${DAY_NAMES[clamp(sub.day_of_week, 0, 6, 1)]} at ${time}`;
    case 'monthly':  return `Day ${clamp(sub.day_of_month, 1, 28, 1)} of each month at ${time}`;
    default:         return `At ${time}`;
  }
}

const scopeLabel = (scope) =>
  ({ me: 'My records', team: 'My team’s records', all: 'All records' }[scope] || 'All records');

const safeFilename = (name) =>
  String(name || 'report').replace(/[^a-z0-9 _-]/gi, '').trim().replace(/\s+/g, '-').slice(0, 60) || 'report';

module.exports = ReportScheduleService;
module.exports.nextRunAt = nextRunAt;
module.exports.describeSchedule = describe;
module.exports.normalizeRecipients = normalizeRecipients;
module.exports.alertOf = alertOf;
module.exports.normalizeAlert = normalizeAlert;
module.exports.evaluateAlert = evaluateAlert;
