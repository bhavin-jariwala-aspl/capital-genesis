'use strict';

const { stripLive } = require('./helpers/strip-live');

jest.mock('@prisma/client');

const ReportService = require('../src/services/report.service');
const ReportLibraryService = require('../src/services/report-library.service');
const ReportScheduleService = require('../src/services/report-schedule.service');

/**
 * Regression tests for defects found reviewing the reporting feature.
 *
 * Grouped by the failure they prevent rather than by module, because several of
 * them are the *same* class of mistake in different places: a permissive default
 * where a restrictive one was required.
 */

// ── helpers ────────────────────────────────────────────────────────────────

const OPPS = [
  { id: 1, amount: 100, stage: 'proposal', owner_id: 'E1', close_date: new Date('2026-03-05') },
  { id: 2, amount: 300, stage: 'closed_won', owner_id: 'E2', close_date: new Date('2026-03-31') },
];

function enginePrisma(rows = OPPS) {
  const delegate = { findMany: jest.fn().mockResolvedValue(rows) };
  return { crmOpportunity: delegate, __d: delegate };
}
const whereOf = (prisma, call = 0) => stripLive(prisma.__d.findMany.mock.calls[call][0].where);

function libPrisma(over = {}) {
  return {
    employeeHierarchy: { findMany: jest.fn().mockResolvedValue([]) },
    customReport: { findMany: jest.fn().mockResolvedValue([]), groupBy: jest.fn().mockResolvedValue([]), updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
    reportFavorite: { findMany: jest.fn().mockResolvedValue([]) },
    reportFolder: { findMany: jest.fn().mockResolvedValue([]) },
    ...over,
  };
}

// ── Data scope must never fail open ────────────────────────────────────────

describe('data scope fails closed', () => {
  it('ignores an unrecognised scope instead of applying none', async () => {
    // A value matching neither 'me' nor 'team' used to reach the engine, where it
    // matched no branch and so applied no owner filter at all — every record.
    const svc = new ReportLibraryService(libPrisma());
    const ctx = await svc.resolveScope({ employeeId: 'E1', role_level: 5 }, 'sneaky');
    expect(ctx.scope).toBe('me');
  });

  it.each([['all'], ['team'], ['ALL'], [''], [null], [undefined], [{}]])(
    'clamps a level-5 user asking for %p down to their own records',
    async (requested) => {
      const svc = new ReportLibraryService(libPrisma());
      expect((await svc.resolveScope({ employeeId: 'E1', role_level: 5 }, requested)).scope).toBe('me');
    },
  );

  it('restricts a team scope with an empty hierarchy to the caller, not everyone', async () => {
    const prisma = enginePrisma();
    await new ReportService(prisma).run(
      { source: 'opportunities', viz: 'table' },
      { scope: 'team', employeeId: 'E1', teamIds: [] },
    );
    expect(whereOf(prisma)).toEqual({ AND: [{ owner_id: { in: ['E1'] } }] });
  });

  it('includes the caller in their own team scope', async () => {
    const prisma = enginePrisma();
    await new ReportService(prisma).run(
      { source: 'opportunities', viz: 'table' },
      { scope: 'team', employeeId: 'E1', teamIds: ['E3'] },
    );
    expect(whereOf(prisma).AND[0].owner_id.in.sort()).toEqual(['E1', 'E3']);
  });

  it('matches nothing rather than everything when the caller is unknown', async () => {
    const prisma = enginePrisma();
    await new ReportService(prisma).run({ source: 'opportunities', viz: 'table' }, { scope: 'me' });
    expect(whereOf(prisma)).toEqual({ AND: [{ owner_id: { in: [] } }] });
  });

  it('ANDs the scope on instead of overwriting a filter on the same field', async () => {
    // The scope used to be assigned to where[ownerField], silently replacing a
    // user's own filter on Owner — widening the result beyond what they asked for.
    const prisma = enginePrisma();
    await new ReportService(prisma).run(
      { source: 'opportunities', viz: 'table', filters: [{ field: 'owner_id', op: 'equals', value: 'E9' }] },
      { scope: 'team', employeeId: 'E1', teamIds: ['E1', 'E2'] },
    );
    const where = whereOf(prisma);
    expect(where.owner_id).toBe('E9');                       // the user's filter survives
    expect(where.AND).toEqual([{ owner_id: { in: ['E1', 'E2'] } }]); // scope added alongside
  });

  it('applies no owner clause for an admin-level "all" scope', async () => {
    const prisma = enginePrisma();
    await new ReportService(prisma).run({ source: 'opportunities', viz: 'table' }, { scope: 'all' });
    expect(whereOf(prisma)).toEqual({});
  });

  it('scopes drill-down the same way as the report itself', async () => {
    const prisma = enginePrisma();
    await new ReportService(prisma).runDrilldown(
      { source: 'opportunities', group_by: [{ field: 'stage' }] },
      { stage: 'proposal' },
      { scope: 'me', employeeId: 'E1' },
    );
    expect(JSON.stringify(whereOf(prisma))).toContain('"owner_id":{"in":["E1"]}');
  });
});

// ── Scheduled delivery ────────────────────────────────────────────────────

describe('scheduled delivery scope', () => {
  /**
   * The scope is private, so it is asserted where it actually matters: the context
   * handed to the report engine when the subscription is delivered.
   */
  function harness({ employee, role }) {
    const reports = {
      run: jest.fn().mockResolvedValue({
        columns: [{ key: 'm0', label: 'Count', type: 'number' }],
        rows: [{ m0: 1 }], summary: null, comparison: null,
        meta: { row_count: 1, executed_ms: 1, generated_at: new Date().toISOString() },
      }),
      toHtml: () => '<html></html>', toCsv: () => 'Count\n1', toXlsx: () => Buffer.from('x'),
    };
    const prisma = {
      reportSubscription: { findUnique: jest.fn(), update: jest.fn().mockResolvedValue({}) },
      employee: { findUnique: jest.fn().mockResolvedValue(employee) },
      role: { findFirst: jest.fn().mockResolvedValue(role) },
      employeeHierarchy: { findMany: jest.fn().mockResolvedValue([]) },
      reportExecution: { create: jest.fn().mockResolvedValue({}) },
    };
    const svc = new ReportScheduleService(prisma, reports, { sendRaw: jest.fn().mockResolvedValue({ status: 'sent' }) });
    const scopeFor = async (scope) => {
      prisma.reportSubscription.findUnique.mockResolvedValue({
        id: 1, report_id: 5, employee_id: employee?.employee_id ?? 'GONE', scope,
        format: 'inline', recipients: [], is_active: true, frequency: 'daily', hour: 8,
        report: { id: 5, name: 'R', description: null, data_source: { source: 'opportunities' } },
      });
      await svc.deliver(1);
      return reports.run.mock.calls.at(-1)[1];
    };
    return { scopeFor, prisma };
  }

  it('keeps an admin owner on "all" (threshold was hard-coded one level too strict)', async () => {
    const { scopeFor } = harness({ employee: { employee_id: 'A1', role: 'admin', email: 'a@x.com' }, role: { level: 3 } });
    expect((await scopeFor('all')).scope).toBe('all');
  });

  it('clamps a manager owner to team and a user owner to me', async () => {
    const mgr = harness({ employee: { employee_id: 'M1', role: 'manager', email: 'm@x.com' }, role: { level: 4 } });
    expect((await mgr.scopeFor('all')).scope).toBe('team');
    const usr = harness({ employee: { employee_id: 'U1', role: 'user', email: 'u@x.com' }, role: { level: 5 } });
    expect((await usr.scopeFor('all')).scope).toBe('me');
  });

  it('does not look up a role — or widen scope — when the owner is missing', async () => {
    const { scopeFor, prisma } = harness({ employee: null, role: { level: 1 } });
    const ctx = await scopeFor('all');
    // `findFirst({ name: undefined })` would drop the filter and return an
    // arbitrary (possibly platform-admin) role.
    expect(prisma.role.findFirst).not.toHaveBeenCalled();
    expect(ctx.scope).toBe('me');
  });

  it('treats an unrecognised subscription scope as the widest the role allows, then clamps', async () => {
    const { scopeFor } = harness({ employee: { employee_id: 'U1', role: 'user', email: 'u@x.com' }, role: { level: 5 } });
    expect((await scopeFor('nonsense')).scope).toBe('me');
  });
});

describe('scheduled delivery reporting', () => {
  /** A report service stub that returns a trivial result. */
  const reports = {
    run: jest.fn().mockResolvedValue({
      columns: [{ key: 'm0', label: 'Count', type: 'number' }],
      rows: [{ m0: 1 }], summary: null, comparison: null,
      meta: { row_count: 1, executed_ms: 1, generated_at: new Date().toISOString() },
    }),
    toHtml: () => '<html></html>',
    toCsv: () => 'Count\n1',
    toXlsx: () => Buffer.from('x'),
  };

  function harness(sendResult) {
    const prisma = {
      reportSubscription: {
        findUnique: jest.fn().mockResolvedValue({
          id: 1, report_id: 5, employee_id: 'U1', scope: 'me', format: 'inline',
          recipients: [], is_active: true, frequency: 'daily', hour: 8,
          report: { id: 5, name: 'R', description: null, data_source: { source: 'opportunities' } },
        }),
        update: jest.fn().mockResolvedValue({}),
      },
      employee: { findUnique: jest.fn().mockResolvedValue({ employee_id: 'U1', role: 'user', email: 'u1@x.com' }) },
      role: { findFirst: jest.fn().mockResolvedValue({ level: 5 }) },
      employeeHierarchy: { findMany: jest.fn().mockResolvedValue([]) },
      reportExecution: { create: jest.fn().mockResolvedValue({}) },
    };
    const email = { sendRaw: jest.fn().mockResolvedValue(sendResult) };
    return [new ReportScheduleService(prisma, reports, email), prisma];
  }

  it('does not count a bounced message as sent', async () => {
    // sendRaw resolves even when SMTP rejects — it records the failure on the log.
    const [svc, prisma] = harness({ status: 'bounced', bounce_reason: 'mailbox full' });
    const res = await svc.deliver(1);
    expect(res.sent).toBe(0);
    expect(prisma.reportSubscription.update.mock.calls[0][0].data.last_status).toBe('error');
  });

  it('counts a genuinely sent message', async () => {
    const [svc, prisma] = harness({ status: 'sent' });
    const res = await svc.deliver(1);
    expect(res.sent).toBe(1);
    expect(prisma.reportSubscription.update.mock.calls[0][0].data.last_status).toBe('sent');
  });
});

// ── Folder ownership ──────────────────────────────────────────────────────

describe('folder ownership', () => {
  const folder = { id: 1, created_by: 'E1', parent_id: null, color: 'indigo' };
  const svc = () => new ReportLibraryService(libPrisma({
    reportFolder: { findUnique: jest.fn().mockResolvedValue(folder), updateMany: jest.fn(), delete: jest.fn(), update: jest.fn().mockResolvedValue(folder) },
  }));

  it('stops a different user renaming someone else’s folder', async () => {
    await expect(svc().updateFolder(1, { name: 'x' }, { employeeId: 'E9', role_level: 5 })).rejects.toThrow();
  });

  it('stops a different user deleting someone else’s folder', async () => {
    await expect(svc().deleteFolder(1, { employeeId: 'E9', role_level: 5 })).rejects.toThrow();
  });

  it('lets the creator and an admin manage it', async () => {
    await expect(svc().updateFolder(1, { name: 'x' }, { employeeId: 'E1', role_level: 5 })).resolves.toBeDefined();
    await expect(svc().updateFolder(1, { name: 'x' }, { employeeId: 'E0', role_level: 3 })).resolves.toBeDefined();
  });
});

// ── Correctness of the numbers ────────────────────────────────────────────

describe('date windows', () => {
  it('includes records on the final day of a "between" range', async () => {
    // `between` cast the end date to midnight, dropping everything during that day.
    const prisma = enginePrisma();
    await new ReportService(prisma).run({
      source: 'opportunities', viz: 'table',
      filters: [{ field: 'close_date', op: 'between', value: ['2026-03-01', '2026-03-31'] }],
    });
    const clause = whereOf(prisma).close_date;
    // 2026-03-31T23:59 must be inside the window.
    const endOfDay = new Date('2026-03-31T23:59:00');
    const upper = clause.lt ?? clause.lte;
    expect(upper.getTime()).toBeGreaterThan(endOfDay.getTime());
  });
});

describe('totals cover the whole report', () => {
  it('totals every row, not just the ones left after the row limit', async () => {
    const rows = Array.from({ length: 10 }, (_, i) => ({ id: i + 1, amount: 10, stage: 's', owner_id: 'E1' }));
    const res = await new ReportService(enginePrisma(rows)).run({
      source: 'opportunities', viz: 'table', columns: ['amount'], limit: 3, totals: true,
    }, { scope: 'all' });
    expect(res.rows).toHaveLength(3);
    expect(res.summary.grand.amount).toBe(100); // all ten rows
  });
});

describe('comparison filter composition', () => {
  it('ANDs the prior-period window on even when the report filter is an OR group', async () => {
    // Appending the derived window to an OR node made it an *alternative*, so the
    // comparison aggregated records the report itself excluded.
    const rows = [
      { id: 1, amount: 100, stage: 'proposal', close_date: new Date('2026-03-10'), owner_id: 'E1' },
      { id: 2, amount: 200, stage: 'closed_won', close_date: new Date('2025-03-10'), owner_id: 'E1' },
    ];
    const prisma = enginePrisma(rows);
    await new ReportService(prisma).run({
      source: 'opportunities', viz: 'line',
      group_by: [{ field: 'close_date', period: 'month' }],
      metrics: [{ agg: 'sum', field: 'amount' }],
      filters: { logic: 'OR', conditions: [
        { field: 'stage', op: 'equals', value: 'proposal' },
        { field: 'stage', op: 'equals', value: 'closed_won' },
      ] },
      compare: 'previous_year',
    }, { scope: 'all' });

    // Second call is the prior window: the date must be a required AND term.
    const priorWhere = stripLive(prisma.__d.findMany.mock.calls[1][0].where);
    const json = JSON.stringify(priorWhere);
    expect(json).toContain('close_date');
    expect(priorWhere.OR).toBeUndefined();
    expect(Array.isArray(priorWhere.AND)).toBe(true);
  });
});

describe('field value pick-list', () => {
  it('asks the database to group, so a dominant value cannot truncate the list', async () => {
    // findMany({ distinct }) dedupes in memory on MySQL, so `take: 200` could
    // return 200 identical rows and yield a one-entry pick-list.
    const prisma = {
      crmOpportunity: {
        groupBy: jest.fn().mockResolvedValue([{ type: 'new_business' }, { type: 'renewal' }]),
        findMany: jest.fn(),
      },
    };
    const values = await new ReportService(prisma).getFieldValues('opportunities', 'type');
    expect(prisma.crmOpportunity.groupBy).toHaveBeenCalled();
    expect(prisma.crmOpportunity.findMany).not.toHaveBeenCalled();
    expect(values).toEqual(['new_business', 'renewal']);
  });

  it('returns the declared options without querying for a picklist field', async () => {
    const prisma = { crmOpportunity: { groupBy: jest.fn(), findMany: jest.fn() } };
    const values = await new ReportService(prisma).getFieldValues('opportunities', 'stage');
    expect(values).toContain('closed_won');
    expect(prisma.crmOpportunity.groupBy).not.toHaveBeenCalled();
  });
});
