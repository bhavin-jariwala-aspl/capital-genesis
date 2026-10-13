'use strict';

jest.mock('@prisma/client');

const ReportScheduleService = require('../src/services/report-schedule.service');
const {
  nextRunAt, describeSchedule, normalizeRecipients, normalizeAlert, alertOf, evaluateAlert,
} = require('../src/services/report-schedule.service');

const result = ({ grand = { m0: 120 }, rows = [{ g: 'a', m0: 70 }, { g: 'b', m0: 50 }], columns } = {}) => ({
  columns: columns || [{ key: 'g', label: 'Stage', type: 'string', dimension: true }, { key: 'm0', label: 'Pipeline', type: 'currency' }],
  rows,
  summary: grand ? { grand } : null,
  meta: { row_count: rows.length, executed_ms: 1 },
});

describe('hourly schedules', () => {
  it('fires at the top of the next hour, ignoring the hour-of-day setting', () => {
    const next = nextRunAt({ frequency: 'hourly', hour: 8 }, new Date(2026, 7, 17, 10, 42));
    expect(next).toEqual(new Date(2026, 7, 17, 11, 0, 0, 0));
    expect(describeSchedule({ frequency: 'hourly' })).toBe('Every hour');
  });
});

describe('alert shape', () => {
  it('validates an alert from the UI into the stored shape', () => {
    expect(normalizeAlert({ measure: 'm0', op: 'gt', value: '1000', only_on_change: 1 }))
      .toEqual({ measure: 'm0', op: 'gt', value: 1000, label: null, only_on_change: true });
    expect(normalizeAlert({ op: 'changed', measure: 'weird' }).measure).toBe('row_count');
    expect(normalizeAlert(null)).toBeNull();
    expect(normalizeAlert({ measure: 'm0' })).toBeNull();
  });

  it('rejects an unknown comparison or a missing number', () => {
    expect(() => normalizeAlert({ measure: 'm0', op: 'near', value: 1 })).toThrow(/alert\.op/);
    expect(() => normalizeAlert({ measure: 'm0', op: 'gt', value: 'lots' })).toThrow(/number/);
  });

  it('reads emails from both the legacy array and the { emails, alert } object', () => {
    expect(normalizeRecipients(['a@b.com'])).toEqual(['a@b.com']);
    expect(normalizeRecipients({ emails: ['a@b.com', 'bad'], alert: { op: 'gt' } })).toEqual(['a@b.com']);
    expect(alertOf({ recipients: ['a@b.com'] })).toBeNull();
    expect(alertOf({ recipients: { emails: [], alert: { op: 'gt', measure: 'm0', value: 1 } } })).toEqual({ op: 'gt', measure: 'm0', value: 1 });
  });

  it('stores a plain array when there is no alert, and the object when there is', async () => {
    const svc = new ReportScheduleService({
      customReport: { findUnique: jest.fn().mockResolvedValue({ id: 1 }), update: jest.fn().mockResolvedValue({}) },
      reportSubscription: { create: jest.fn(async ({ data }) => data), count: jest.fn().mockResolvedValue(1) },
    }, {}, {});
    const plain = await svc.create(1, { frequency: 'daily', recipients: 'x@y.com' }, 'E1');
    expect(plain.recipients).toEqual(['x@y.com']);
    const withAlert = await svc.create(1, { frequency: 'hourly', recipients: 'x@y.com', alert: { measure: 'row_count', op: 'gte', value: 5 } }, 'E1');
    expect(withAlert.recipients).toEqual({ emails: ['x@y.com'], alert: { measure: 'row_count', op: 'gte', value: 5, label: null, only_on_change: false } });
    expect(withAlert.day_of_week).toBeNull();
  });

  it('keeps the alert baseline across an unrelated edit, and drops it when the alert is removed', async () => {
    const existing = {
      id: 9, report_id: 1, frequency: 'daily', hour: 8, format: 'xlsx', scope: 'all', is_active: true,
      recipients: { emails: ['x@y.com'], alert: { measure: 'm0', op: 'gt', value: 100, label: null, only_on_change: false, state: { last_value: 120, last_met: true } } },
    };
    const db = {
      reportSubscription: { findUnique: jest.fn().mockResolvedValue(existing), update: jest.fn(async ({ data }) => data), count: jest.fn().mockResolvedValue(1) },
      customReport: { update: jest.fn().mockResolvedValue({}) },
    };
    const svc = new ReportScheduleService(db, {}, {});
    const paused = await svc.update(9, { is_active: false });
    expect(paused.recipients.alert.state).toEqual({ last_value: 120, last_met: true });
    const removed = await svc.update(9, { alert: null });
    expect(removed.recipients).toEqual(['x@y.com']);
  });
});

describe('evaluateAlert', () => {
  it('reads the grand total of the watched measure and compares it', () => {
    const out = evaluateAlert({ measure: 'm0', op: 'gt', value: 100 }, result());
    expect(out).toMatchObject({ met: true, value: 120, label: 'Pipeline' });
    expect(out.description).toBe('Pipeline is 120, is greater than 100');
    expect(evaluateAlert({ measure: 'm0', op: 'lt', value: 100 }, result()).met).toBe(false);
  });

  it('falls back to the single KPI row, then to the column sum, when there is no total', () => {
    expect(evaluateAlert({ measure: 'm0', op: 'gte', value: 42 }, result({ grand: null, rows: [{ m0: 42 }] })).value).toBe(42);
    expect(evaluateAlert({ measure: 'm0', op: 'gte', value: 1 }, result({ grand: null })).value).toBe(120);
  });

  it('watches the row count as an exception report would', () => {
    const out = evaluateAlert({ measure: 'row_count', op: 'gte', value: 2 }, result());
    expect(out).toMatchObject({ met: true, value: 2, label: 'Number of rows' });
  });

  it('"has changed" only fires once there is a baseline, and reports the previous value', () => {
    expect(evaluateAlert({ measure: 'm0', op: 'changed' }, result()).met).toBe(false);
    const out = evaluateAlert({ measure: 'm0', op: 'changed', state: { last_value: 100 } }, result());
    expect(out.met).toBe(true);
    expect(out.description).toBe('Pipeline is now 120 (was 100)');
    expect(evaluateAlert({ measure: 'm0', op: 'changed', state: { last_value: 120 } }, result()).met).toBe(false);
  });

  it('"only on change" suppresses a repeat while the threshold stays met', () => {
    const alert = { measure: 'm0', op: 'gt', value: 100, only_on_change: true };
    expect(evaluateAlert(alert, result()).met).toBe(true);
    expect(evaluateAlert({ ...alert, state: { last_met: true } }, result()).met).toBe(false);
    expect(evaluateAlert({ ...alert, state: { last_met: false } }, result()).met).toBe(true);
  });

  it('never fires on a missing value', () => {
    const out = evaluateAlert({ measure: 'm0', op: 'lt', value: 100 }, result({ grand: { m0: null }, rows: [] }));
    expect(out.met).toBe(false);
    expect(out.description).toContain('no value');
  });
});

describe('delivery under an alert', () => {
  function harness({ alert, rows = [{ g: 'a', m0: 70 }], grand = { m0: 70 } } = {}) {
    const sub = {
      id: 5, tenant_id: 1, employee_id: 'E1', scope: 'all', frequency: 'hourly', hour: 8, format: 'inline', is_active: true,
      recipients: alert ? { emails: [], alert } : [],
      report: { id: 1, name: 'Pipeline', data_source: { source: 'opportunities' }, cached_result: null },
    };
    const db = {
      reportSubscription: { findUnique: jest.fn().mockResolvedValue(sub), update: jest.fn().mockResolvedValue({}) },
      reportExecution: { create: jest.fn().mockResolvedValue({}) },
      customReport: { update: jest.fn().mockResolvedValue({}) },
      notification: { create: jest.fn().mockResolvedValue({}) },
      employee: { findUnique: jest.fn().mockResolvedValue({ employee_id: 'E1', role: 'admin', email: 'e1@x.com' }) },
      role: { findFirst: jest.fn().mockResolvedValue({ level: 1 }) },
    };
    const reports = {
      run: jest.fn().mockResolvedValue(result({ rows, grand })),
      toHtml: () => '<p>x</p>', toCsv: () => 'a,b', toXlsx: () => Buffer.from(''),
    };
    const email = { sendRaw: jest.fn().mockResolvedValue({ status: 'sent' }) };
    return { svc: new ReportScheduleService(db, reports, email), db, email, sub };
  }

  it('runs the report but sends nothing when the condition is not met, and records why', async () => {
    const { svc, db, email } = harness({ alert: { measure: 'm0', op: 'gt', value: 100 } });
    const out = await svc.deliver(5);
    expect(out).toMatchObject({ sent: 0, skipped: true, reason: 'condition-not-met' });
    expect(email.sendRaw).not.toHaveBeenCalled();
    const statusUpdate = db.reportSubscription.update.mock.calls.find((c) => c[0].data.last_status);
    expect(statusUpdate[0].data).toMatchObject({ last_status: 'skipped', last_error: expect.stringContaining('not met') });
    expect(statusUpdate[0].data.next_run_at).toBeInstanceOf(Date);
    expect(db.reportExecution.create.mock.calls[0][0].data.status).toBe('skipped');
    // The snapshot is still recorded — the report did run.
    expect(db.customReport.update).toHaveBeenCalled();
  });

  it('emails with an alert subject and raises an in-app notification when the condition holds', async () => {
    const { svc, db, email } = harness({ alert: { measure: 'm0', op: 'gt', value: 50 } });
    const out = await svc.deliver(5);
    expect(out.sent).toBe(1);
    expect(email.sendRaw.mock.calls[0][0].subject).toMatch(/^⚠ Pipeline: Pipeline is 70, is greater than 50/);
    expect(db.notification.create.mock.calls[0][0].data).toMatchObject({ employee_id: 'E1', type: 'report_alert', link: '/reports?opened=1' });
  });

  it('remembers the value it saw so the next check has a baseline', async () => {
    const { svc, db } = harness({ alert: { measure: 'm0', op: 'changed' } });
    await svc.deliver(5);
    const baseline = db.reportSubscription.update.mock.calls.find((c) => c[0].data.recipients);
    expect(baseline[0].data.recipients.alert.state).toMatchObject({ last_value: 70, last_met: false });
  });

  it('"Send now" ignores the condition so a user can test the delivery', async () => {
    const { svc, email } = harness({ alert: { measure: 'm0', op: 'gt', value: 100 } });
    const out = await svc.deliver(5, { force: true });
    expect(out.sent).toBe(1);
    expect(email.sendRaw).toHaveBeenCalled();
  });

  it('behaves exactly as before for a subscription without an alert', async () => {
    const { svc, email, db } = harness();
    const out = await svc.deliver(5);
    expect(out.sent).toBe(1);
    expect(out.alert).toBeNull();
    expect(email.sendRaw.mock.calls[0][0].subject).toMatch(/^Pipeline — /);
    expect(db.notification.create).not.toHaveBeenCalled();
  });
});
