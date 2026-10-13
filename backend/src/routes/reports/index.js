'use strict';

const { authenticate } = require('../../middleware/authenticate');
const { tenantContext } = require('../../middleware/tenant-scope');
const ReportService = require('../../services/report.service');
const ReportLibraryService = require('../../services/report-library.service');
const ReportScheduleService = require('../../services/report-schedule.service');
const EmailSendService = require('../../services/email-send.service');
const EmailTemplateService = require('../../services/email-template.service');
const { getTemplates, getTemplate } = require('../../services/report-templates');
const { recordSnapshot, listSnapshots } = require('../../services/report-snapshots');
const { enrichRunContext } = require('../../services/report-run-context');
const { ok } = require('../../utils/response');
const { ValidationError, NotFoundError } = require('../../utils/errors');

const VIZ_TO_TYPE = {
  table: 'table', bar: 'chart', line: 'chart', area: 'chart', pie: 'chart',
  donut: 'chart', funnel: 'chart', kpi: 'summary', pivot: 'pivot',
};
const EXPORT_FORMATS = ['csv', 'xlsx'];

/**
 * Reporting routes — mounted at /api/reports.
 *
 * Every authenticated user can build, save, share and schedule reports; nothing
 * here needs an admin. What a report can *show* is still clamped to the caller's
 * own data scope (me / team / all) by ReportLibraryService.resolveScope, so
 * self-service authoring never becomes a way to see more data.
 */
module.exports = async function reportRoutes(fastify) {
  const P = fastify.prisma;
  const svc = new ReportService(P);
  const library = new ReportLibraryService(P);
  const schedules = new ReportScheduleService(
    P, svc, new EmailSendService(P, new EmailTemplateService(P)),
  );

  const viewer = (req) => ({
    employeeId: req.user.employeeId,
    role: req.user.role,
    role_level: req.user.role_level,
  });

  /**
   * Everything a run needs beyond the config: the caller's data scope, the
   * tenant's fiscal calendar, answers to prompted filters and any dashboard-level
   * (global) filters. `params` and `global` may arrive as JSON strings on a GET.
   */
  const runCtx = async (req, { scope, params, global } = {}) => {
    const base = await library.resolveScope(viewer(req), scope);
    const ctx = await enrichRunContext(P, base);
    const p = parseJson(params);
    const g = parseJson(global);
    if (p && typeof p === 'object') ctx.params = p;
    if (g && typeof g === 'object') ctx.global = g;
    return ctx;
  };

  const numericId = (raw, what = 'id') => {
    const n = Number(raw);
    if (!Number.isInteger(n) || n <= 0) throw new ValidationError(`${what} must be a positive integer`);
    return n;
  };

  /**
   * Register a route whose handler runs inside the caller's tenant context.
   *
   * `authenticate` calls `tenantContext.enterWith()` *after* awaiting the JWT
   * verification, so the store lands in a child async context that Fastify then
   * discards: by the time a handler runs, `getTenantId()` is null and the Prisma
   * tenant-scope extension skips scoping altogether — reads come back unscoped
   * and creates are rejected for a missing `tenant_id`. Re-entering the context
   * with `run()` around the handler itself does propagate, because there is no
   * intervening hook boundary.
   *
   * Deliberately local to reporting: making `authenticate` verify the JWT
   * synchronously would fix every route at once, but would also start filtering
   * queries that currently run unscoped across the whole app, so that belongs in
   * its own change.
   */
  const on = (method, url, handler) =>
    fastify[method](url, { preHandler: [authenticate] }, async function scoped(req, reply) {
      const tenantId = req.user?.tenant_id ?? null;
      if (tenantId === null) return handler.call(this, req, reply);
      return tenantContext.run({ tenantId }, () => handler.call(this, req, reply));
    });

  const loadForView = async (req) => {
    const report = await P.customReport.findUnique({ where: { id: numericId(req.params.id) } });
    if (!report) throw new NotFoundError('Report');
    await library.assertCanView(report, viewer(req));
    return report;
  };

  const loadForEdit = async (req) => {
    const report = await P.customReport.findUnique({ where: { id: numericId(req.params.id) } });
    if (!report) throw new NotFoundError('Report');
    library.assertCanEdit(report, viewer(req));
    return report;
  };

  // ── Builder metadata (drives every dropdown; no free-text anywhere) ───────

  on('get','/sources', async () => ok(svc.getSources()));

  on('get','/vocabulary', async () => ok({
    ...svc.getVocabulary(),
    ...library.getOptions(),
    schedule: schedules.getOptions(),
    visualizations: [
      { key: 'table', label: 'Table',       description: 'A list of records or grouped rows.', icon: 'Table' },
      { key: 'bar',   label: 'Bar chart',   description: 'Compare a measure across categories.', icon: 'BarChart3', needs_group: true },
      { key: 'line',  label: 'Line chart',  description: 'Show a trend over time.', icon: 'LineChart', needs_group: true },
      { key: 'area',  label: 'Area chart',  description: 'A trend with the volume filled in.', icon: 'AreaChart', needs_group: true },
      { key: 'pie',   label: 'Pie chart',   description: 'Show each category as a share of the whole.', icon: 'PieChart', needs_group: true },
      { key: 'donut', label: 'Donut chart', description: 'Like a pie, with the total in the middle.', icon: 'PieChart', needs_group: true },
      { key: 'funnel', label: 'Funnel',     description: 'Show drop-off through ordered stages.', icon: 'Filter', needs_group: true },
      { key: 'kpi',   label: 'Number tiles', description: 'One big number per measure.', icon: 'Gauge' },
      { key: 'pivot', label: 'Matrix',      description: 'Cross-tabulate two groupings.', icon: 'Grid3x3', needs_group: 2 },
    ],
  }));

  /** Starter gallery — a working report the user can open and adjust. */
  on('get','/templates', async () => ok(getTemplates()));

  on('get','/templates/:key', async (req) => {
    const tpl = getTemplate(req.params.key);
    if (!tpl) throw new NotFoundError('Report template');
    return ok(tpl);
  });

  /**
   * The values a field actually holds, so the filter UI can offer a pick-list
   * instead of asking a non-technical user to type an exact value.
   */
  on('get','/field-values', async (req) => {
    const { source, field } = req.query;
    if (!source || !field) throw new ValidationError('source and field are required');
    return ok(await svc.getFieldValues(source, field));
  });

  // ── Folders ──────────────────────────────────────────────────────────────

  on('get','/folders', async () => ok(await library.listFolders()));

  on('post','/folders', async (req, reply) => {
    reply.code(201);
    return ok(await library.createFolder(req.body || {}, req.user.employeeId));
  });

  on('put','/folders/:id', async (req) =>
    ok(await library.updateFolder(numericId(req.params.id), req.body || {}, viewer(req))));

  on('delete','/folders/:id', async (req) => {
    await library.deleteFolder(numericId(req.params.id), viewer(req));
    return ok({ deleted: true });
  });

  // ── Saved reports ────────────────────────────────────────────────────────

  on('get','/', async (req) => {
    const { folder_id, search, favorites, mine } = req.query;
    const reports = await library.visibleReports(viewer(req), {
      folderId: folder_id === undefined ? undefined : (folder_id === 'none' ? null : folder_id),
      search,
      favoritesOnly: favorites === 'true' || favorites === '1',
      mineOnly: mine === 'true' || mine === '1',
    });
    return ok(reports.map(toApi));
  });

  /** Subscriptions the caller owns, across every report. */
  on('get','/my-subscriptions', async (req) =>
    ok(await schedules.listForEmployee(req.user.employeeId)));

  on('get','/:id', async (req) => ok(toApi(await loadForView(req))));

  on('post','/', async (req, reply) => {
    const data = serialize(req.body, library);
    const r = await P.customReport.create({
      data: { ...data, created_by: req.user.employeeId },
    });
    reply.code(201);
    return ok(toApi(r));
  });

  on('put','/:id', async (req) => {
    const existing = await loadForEdit(req);
    const data = serialize(req.body, library);
    const r = await P.customReport.update({ where: { id: existing.id }, data });
    return ok(toApi(r));
  });

  on('delete','/:id', async (req) => {
    const existing = await loadForEdit(req);
    await P.customReport.delete({ where: { id: existing.id } });
    return ok({ deleted: true });
  });

  /** "Save as a copy" — the safe way for a user to adapt someone else's report. */
  on('post','/:id/duplicate', async (req, reply) => {
    const source = await loadForView(req);
    const copy = await P.customReport.create({
      data: {
        name: `${source.name} (copy)`.slice(0, 255),
        description: source.description,
        report_type: source.report_type,
        category: source.category,
        data_source: source.data_source,
        fields: source.fields,
        filters: source.filters,
        grouping: source.grouping,
        sorting: source.sorting,
        chart_config: source.chart_config,
        folder_id: source.folder_id,
        visibility: 'private',
        shared_with: [],
        is_shared: false,
        created_by: req.user.employeeId,
      },
    });
    reply.code(201);
    return ok(toApi(copy));
  });

  on('post','/:id/favorite', async (req) => {
    const report = await loadForView(req);
    const on = req.body?.on === undefined ? true : !!req.body.on;
    return ok(await library.setFavorite(report.id, req.user.employeeId, on));
  });

  // ── Running ──────────────────────────────────────────────────────────────

  /** Ad-hoc run — the builder's live preview. */
  on('post','/run', async (req) => {
    const config = req.body?.config || req.body;
    if (!config?.source) throw new ValidationError('Pick something to report on first.');
    const ctx = await runCtx(req, req.body || {});
    return ok(await svc.run(config, ctx), { meta: { scope: ctx.scope } });
  });

  /** Run a saved report, logging the execution and recording a trend snapshot. */
  on('post','/:id/run', async (req) => {
    const report = await loadForView(req);
    const config = { ...report.data_source, ...(req.body?.overrides || {}) };
    const ctx = await runCtx(req, req.body || {});

    let result;
    let status = 'success';
    let errorMessage = null;
    try {
      result = await svc.run(config, ctx);
    } catch (e) {
      status = 'error';
      errorMessage = e.message;
    }

    await P.reportExecution.create({
      data: {
        report_id: report.id,
        executed_by: req.user.employeeId,
        execution_time: result?.meta?.executed_ms ?? 0,
        status,
        result_rows: result?.meta?.row_count ?? null,
        error_message: errorMessage,
        filters_used: {
          scope: ctx.scope, overrides: req.body?.overrides ?? null,
          params: ctx.params ?? null, global: ctx.global ?? null,
        },
      },
    }).catch(() => {});

    if (status !== 'success') throw new ValidationError(errorMessage);

    // The headline numbers of this run join the report's trend history (one entry
    // per scope per day, bounded) and stamp last_run_at. Not the whole result —
    // that used to be written here, 20,000 rows at a time, and never read back.
    // A run with prompted answers or dashboard filters is not the report's own
    // number, so it is not recorded as its history.
    if (!ctx.params && !ctx.global && !req.body?.overrides) {
      await recordSnapshot(P, report, result, ctx.scope)
        || await P.customReport.update({ where: { id: report.id }, data: { last_run_at: new Date() } }).catch(() => {});
    }
    return ok(result, { meta: { scope: ctx.scope } });
  });

  /** The report's own headline numbers over time — see report-snapshots.js. */
  on('get','/:id/snapshots', async (req) => {
    const report = await loadForView(req);
    const ctx = await library.resolveScope(viewer(req), req.query.scope);
    return ok(listSnapshots(report, ctx.scope));
  });

  /**
   * A saved report reshaped for a dashboard widget. This is what makes the
   * dashboard builder self-service: any report a business user can build becomes
   * a chart, KPI tile or list on a dashboard, with no developer-authored dataset.
   */
  on('get','/:id/data', async (req) => {
    const report = await loadForView(req);
    const config = report.data_source || {};
    // Dashboard-level filters arrive as plain query params so a widget URL stays
    // readable: ?date_range=this_quarter or ?date_range=2026-01-01,2026-03-31.
    const global = globalFromQuery(req.query);
    const ctx = await runCtx(req, { scope: req.query.scope, params: req.query.params, global });
    const result = await svc.run(config, ctx);
    const shape = req.query.shape || defaultShape(config);
    return ok(toWidgetShape(result, shape), {
      meta: {
        shape,
        report: { id: report.id, name: report.name, viz: config.viz || 'table' },
        row_count: result.meta.row_count,
        generated_at: result.meta.generated_at,
        warnings: result.meta.warnings,
      },
    });
  });

  /** The records behind a chart bar / matrix cell. */
  on('post','/drilldown', async (req) => {
    const config = req.body?.config;
    if (!config?.source) throw new ValidationError('config.source is required');
    const ctx = await runCtx(req, req.body || {});
    return ok(await svc.runDrilldown(config, req.body?.keys || {}, ctx));
  });

  on('post','/:id/drilldown', async (req) => {
    const report = await loadForView(req);
    const ctx = await runCtx(req, req.body || {});
    return ok(await svc.runDrilldown(report.data_source || {}, req.body?.keys || {}, ctx));
  });

  on('get','/:id/history', async (req) => {
    const report = await loadForView(req);
    return ok(await P.reportExecution.findMany({
      where: { report_id: report.id },
      orderBy: { executed_at: 'desc' },
      take: 25,
    }));
  });

  // ── Export ───────────────────────────────────────────────────────────────

  on('post','/export', async (req, reply) => {
    const config = req.body?.config || req.body;
    if (!config?.source) throw new ValidationError('config.source is required');
    const ctx = await runCtx(req, req.body || {});
    const result = await svc.run(config, ctx);
    return sendExport(reply, svc, result, req.body?.format, req.body?.name || config.source);
  });

  on('post','/:id/export', async (req, reply) => {
    const report = await loadForView(req);
    const ctx = await runCtx(req, req.body || {});
    const result = await svc.run(report.data_source || {}, ctx);
    return sendExport(reply, svc, result, req.body?.format, report.name);
  });

  /**
   * Print-ready HTML. The browser's own "Save as PDF" turns this into a PDF that
   * matches what the user sees, which is why no headless-browser dependency is
   * pulled in just to render one.
   */
  on('get','/:id/print', async (req, reply) => {
    const report = await loadForView(req);
    const ctx = await runCtx(req, { scope: req.query.scope, params: req.query.params });
    const result = await svc.run(report.data_source || {}, ctx);
    reply.header('Content-Type', 'text/html; charset=utf-8');
    return reply.send(svc.toHtml(result, {
      name: report.name,
      description: report.description,
      subtitle: scopeLabel(ctx.scope),
    }));
  });

  // ── Scheduled delivery ───────────────────────────────────────────────────

  on('get','/:id/subscriptions', async (req) => {
    const report = await loadForView(req);
    return ok(await schedules.list(report.id));
  });

  on('post','/:id/subscriptions', async (req, reply) => {
    const report = await loadForView(req);
    reply.code(201);
    return ok(await schedules.create(report.id, req.body || {}, req.user.employeeId));
  });

  on('put','/subscriptions/:subId', async (req) => {
    await assertOwnsSubscription(P, library, req, numericId(req.params.subId, 'subId'));
    return ok(await schedules.update(numericId(req.params.subId, 'subId'), req.body || {}));
  });

  on('delete','/subscriptions/:subId', async (req) => {
    await assertOwnsSubscription(P, library, req, numericId(req.params.subId, 'subId'));
    await schedules.remove(numericId(req.params.subId, 'subId'));
    return ok({ deleted: true });
  });

  /** "Send me one now" — lets a user confirm a schedule works immediately. */
  on('post','/subscriptions/:subId/send-now', async (req) => {
    const subId = numericId(req.params.subId, 'subId');
    await assertOwnsSubscription(P, library, req, subId);
    // A manual send is a test of the delivery, so an alert condition is not applied.
    return ok(await schedules.deliver(subId, { actorId: req.user.employeeId, force: true }));
  });
};

// ── helpers ─────────────────────────────────────────────────────────────────

/** A user may manage their own subscriptions; admins may manage any. */
async function assertOwnsSubscription(P, library, req, subId) {
  const sub = await P.reportSubscription.findUnique({ where: { id: subId }, include: { report: true } });
  if (!sub) throw new NotFoundError('Subscription');
  if (sub.employee_id !== req.user.employeeId) {
    library.assertCanEdit(sub.report, {
      employeeId: req.user.employeeId, role: req.user.role, role_level: req.user.role_level,
    });
  }
  return sub;
}

function serialize(body, library) {
  const { name, description, category, config = {} } = body || {};
  if (!name || !String(name).trim()) throw new ValidationError('Give the report a name before saving.');
  if (!config.source) throw new ValidationError('Pick something to report on before saving.');

  return {
    name: String(name).trim().slice(0, 255),
    description: description ? String(description) : null,
    report_type: VIZ_TO_TYPE[config.viz] || 'table',
    category: category || 'custom',
    data_source: config,
    // These mirrored columns keep the report readable in SQL and are what the
    // list/index queries filter on; `data_source` stays the single source of truth.
    fields: config.columns || config.metrics || [],
    filters: config.filters || [],
    grouping: config.group_by || [],
    sorting: config.sort || [],
    chart_config: {
      viz: config.viz || 'table',
      limit: config.limit || null,
      totals: !!config.totals,
      compare: config.compare || null,
      format_rules: config.format_rules || [],
    },
    ...library.serializeSharing(body),
  };
}

function toApi(r) {
  return {
    id: r.id,
    name: r.name,
    description: r.description,
    report_type: r.report_type,
    category: r.category,
    config: r.data_source,
    folder_id: r.folder_id,
    folder: r.folder ?? null,
    visibility: r.visibility || (r.is_shared ? 'everyone' : 'private'),
    shared_with: r.shared_with || [],
    is_favorite: r.is_favorite ?? false,
    is_scheduled: r.is_scheduled,
    created_by: r.created_by,
    created_at: r.created_at,
    updated_at: r.updated_at,
    last_run_at: r.last_run_at,
  };
}

/** Which widget shape a report naturally produces, when the caller doesn't say. */
function defaultShape(config) {
  const viz = config.viz || 'table';
  if (viz === 'kpi') return 'metric';
  if (viz === 'table' || viz === 'pivot') return 'rows';
  return 'series';
}

/**
 * Reshape a report result for a dashboard widget. The widget stores no axis keys
 * of its own — `meta` tells the renderer which column is the category and which
 * are the measures, so a user never types a field name into a widget.
 */
function toWidgetShape(result, shape) {
  const dims = result.columns.filter((c) => c.dimension);
  const measures = result.columns.filter((c) => !c.dimension);

  if (shape === 'metric') {
    const row = result.rows[0] || {};
    const first = measures[0];
    const grand = result.summary?.grand;
    // When the engine supplied a grand total it is the honest headline number —
    // *including* when that total is null (a distinct count cannot be combined
    // from buckets). Falling back to the first bucket there would present one
    // group's number as if it were the total.
    const headline = (m) => (grand && m && m.key in grand ? grand[m.key] : (m ? row[m.key] ?? null : null));
    const value = headline(first);
    const cmp = result.comparison?.rows?.[0];
    const deltaPct = first && cmp ? cmp[`${first.key}__delta_pct`] : null;

    return {
      value,
      label: first?.label ?? null,
      type: first?.type ?? 'number',
      change: deltaPct === null || deltaPct === undefined ? null : `${deltaPct > 0 ? '+' : ''}${deltaPct}%`,
      trend: deltaPct === null || deltaPct === undefined ? 'flat' : deltaPct > 0 ? 'up' : deltaPct < 0 ? 'down' : 'flat',
      tiles: measures.map((m) => ({
        key: m.key,
        label: m.label,
        type: m.type,
        value: headline(m),
      })),
    };
  }

  if (shape === 'rows') {
    return {
      rows: result.rows,
      columns: result.columns,
      summary: result.summary ?? null,
    };
  }

  // series
  return {
    rows: result.rows,
    xKey: dims[0]?.key ?? null,
    xLabel: dims[0]?.label ?? null,
    series: measures.map((m) => ({ key: m.key, label: m.label, type: m.type })),
    columns: result.columns,
    comparison: result.comparison ?? null,
  };
}

async function sendExport(reply, svc, result, format, name) {
  const fmt = EXPORT_FORMATS.includes(format) ? format : 'csv';
  const filename = `${safeFilename(name)}-${new Date().toISOString().slice(0, 10)}`;

  if (fmt === 'xlsx') {
    reply.header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    reply.header('Content-Disposition', `attachment; filename="${filename}.xlsx"`);
    return reply.send(svc.toXlsx(result, name));
  }
  reply.header('Content-Type', 'text/csv; charset=utf-8');
  reply.header('Content-Disposition', `attachment; filename="${filename}.csv"`);
  return reply.send(svc.toCsv(result));
}

/** A query/body value that may be a JSON string, an object, or absent. */
function parseJson(v) {
  if (v === undefined || v === null || v === '') return null;
  if (typeof v === 'object') return v;
  try { return JSON.parse(String(v)); } catch { return null; }
}

/** Dashboard-level filters from a widget's query string. */
function globalFromQuery(q = {}) {
  const out = {};
  if (q.date_range) {
    const raw = String(q.date_range);
    out.date_range = raw.includes(',') ? raw.split(',').map((x) => x.trim()).slice(0, 2) : raw;
  }
  if (q.owner) out.owner = String(q.owner).includes(',') ? String(q.owner).split(',').map((x) => x.trim()) : String(q.owner);
  return Object.keys(out).length ? out : null;
}

/** Strip anything that could break out of the Content-Disposition header. */
const safeFilename = (name) =>
  String(name || 'report').replace(/[^a-z0-9 _-]/gi, '').trim().replace(/\s+/g, '-').slice(0, 60) || 'report';

const scopeLabel = (scope) =>
  ({ me: 'My records', team: 'My team’s records', all: 'All records' }[scope] || 'All records');
