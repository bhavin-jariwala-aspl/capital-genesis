'use strict';

// Allow JSON serialization of Prisma BigInt fields (e.g. Document.file_size).
// Without this, JSON.stringify throws "Do not know how to serialize a BigInt"
// and any response containing such a field returns HTTP 500. Byte sizes / ids
// are well within Number's safe-integer range, so emit them as numbers.
if (typeof BigInt.prototype.toJSON !== 'function') {
  // eslint-disable-next-line no-extend-native
  BigInt.prototype.toJSON = function toJSON() {
    return Number(this);
  };
}

const Fastify        = require('fastify');
const { PrismaClient } = require('@prisma/client');
const config         = require('./config');

// ── Plugins ──────────────────────────────────────────────
const corsPlugin  = require('./plugins/cors');
const jwtPlugin   = require('./plugins/jwt');
const redisPlugin = require('./plugins/redis');

// ── Routes ───────────────────────────────────────────────
const authRoutes          = require('./routes/auth/index');
const metadataRoutes      = require('./routes/metadata/index');
const builderRoutes       = require('./routes/builder/index');
const runtimeRoutes       = require('./routes/runtime/index');
const activitiesRoutes    = require('./routes/activities/index');
const tasksRoutes         = require('./routes/tasks/index');
const remindersRoutes     = require('./routes/reminders/index');
const notificationsRoutes = require('./routes/notifications/index');
const searchRoutes        = require('./routes/search/index');
const integrationsRoutes  = require('./routes/integration-inbound/index');
const emailRoutes         = require('./routes/email/index');
const documentRoutes      = require('./routes/documents/index');
const platformRoutes      = require('./routes/platform/index');
const socialMediaRoutes   = require('./routes/social-media/index');
const leadScoringRoutes   = require('./routes/lead-scoring/index');
const settingsRoutes      = require('./routes/settings/index');
const slaRoutes           = require('./routes/sla/index');
const reportRoutes        = require('./routes/reports/index');
const analyticsRoutes     = require('./routes/analytics/index');
const aiReportRoutes      = require('./routes/ai-reports/index');
const accessRoutes        = require('./routes/access/index');
const publicRoutes        = require('./routes/public/index');
const portalRoutes        = require('./routes/portal/index');
const calendarRoutes      = require('./routes/calendar/index');

// ── Workflow engine & Social media ────────────────────────
const WorkflowEngineService = require('./services/workflow.service');
const IntegrationService    = require('./services/integration.service');
const { DomainEventBus }    = require('./services/events.service');
const SlaService            = require('./services/sla.service');
const SocialMediaService    = require('./services/social-media.service');
const ReminderService       = require('./services/reminder.service');
const ReportService         = require('./services/report.service');
const ReportScheduleService = require('./services/report-schedule.service');
const EmailSendService      = require('./services/email-send.service');
const EmailTemplateService  = require('./services/email-template.service');
const CrmService            = require('./services/crm.service');
const RecordService         = require('./services/record.service');
const AssignmentService     = require('./services/assignment.service');
const CurrencyService       = require('./services/currency.service');
const { RateLimiter }       = require('./utils/rate-limit');
const { SchedulerRegistry } = require('./utils/scheduler');
const { initRoleLevel }     = require('./middleware/authenticate');
const { applyTenantMiddleware } = require('./middleware/tenant-scope');



async function buildApp() {
  const fastify = Fastify({
    logger: config.isDev
      ? { level: 'info' }
      : { level: 'warn' },
    bodyLimit: 50 * 1024 * 1024, // 50 MB — accommodates base64-encoded 25 MB file uploads
  });

  // ── Prisma ────────────────────────────────────────────
  // Append connection-pool tuning params to avoid exhaustion under load.
  // connection_limit caps simultaneous connections; pool_timeout gives
  // each query up to 30 s to acquire a slot before failing.
  const rawDbUrl = process.env.DATABASE_URL ?? '';
  const dbUrlObj = new URL(rawDbUrl);
  if (!dbUrlObj.searchParams.has('connection_limit')) dbUrlObj.searchParams.set('connection_limit', '30');
  if (!dbUrlObj.searchParams.has('pool_timeout'))     dbUrlObj.searchParams.set('pool_timeout', '45');
  let prisma = new PrismaClient({
    log:         config.isDev ? ['warn', 'error'] : ['error'],
    datasources: { db: { url: dbUrlObj.toString() } },
    transactionOptions: { timeout: 30000 },  // 30s for remote RDS latency
  });

  // Retry database connection with exponential backoff so transient network
  // issues (VPN reconnects, RDS wake-ups, DNS propagation) don't crash the
  // server on startup.
  const MAX_RETRIES    = 5;
  const BASE_DELAY_MS  = 2000;
  let dbConnected      = false;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      await prisma.$connect();
      dbConnected = true;
      fastify.log.info(`Database connected (attempt ${attempt}/${MAX_RETRIES})`);
      break;
    } catch (err) {
      const delay = BASE_DELAY_MS * Math.pow(2, attempt - 1); // 2s, 4s, 8s, 16s, 32s
      fastify.log.warn(
        `Database connection failed (attempt ${attempt}/${MAX_RETRIES}): ${err.message}. ` +
        (attempt < MAX_RETRIES ? `Retrying in ${delay / 1000}s…` : 'Starting in degraded mode.'),
      );
      if (attempt < MAX_RETRIES) {
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  if (dbConnected) {
    try {
      await initRoleLevel(prisma);
    } catch (err) {
      fastify.log.warn(`Role-level initialization failed: ${err.message}. Will retry on first request.`);
    }
    // Memoise every tenant's currency profile so the authenticate hook can
    // install it synchronously on the very first request (see authenticate.js).
    try {
      const warmed = await new CurrencyService(prisma).warmAll();
      fastify.log.info(`Currency profiles warmed for ${warmed} tenant(s)`);
    } catch (err) {
      fastify.log.warn(`Currency warm-up failed: ${err.message}`);
    }
  }

  // ── Multi-tenancy middleware (guarded against double-apply) ──
  if (!prisma._tenantMiddlewareApplied) {
    prisma = applyTenantMiddleware(prisma);
    prisma._tenantMiddlewareApplied = true;
  }

  fastify.decorate('prisma', prisma);
  fastify.decorate('dbConnected', dbConnected);
  fastify.addHook('onClose', async () => prisma.$disconnect());

  // ── Per-request tenant context ──────────────────────────────────────────
  // Tenant isolation is enforced entirely through AsyncLocalStorage: the
  // authenticate preHandler calls tenantContext.enterWith({ tenantId }) and the
  // Prisma extension reads it via getTenantId(). Each request runs in its own
  // async context, so there is no shared state to reset and no cross-request
  // leak surface. Public routes (e.g. POST /auth/login) never set a tenant, so
  // getTenantId() returns null → unscoped, exactly as login requires.

  // ── Event backbone + workflow engine + integrations ──────────────────────
  // A single in-process event bus decouples domain-event production (the
  // workflow engine's trigger points) from consumption (workflow automations
  // AND external webhook integrations). This is what makes integrations a
  // first-class, event-driven part of the app rather than a stand-alone module.
  const eventBus = new DomainEventBus();
  fastify.decorate('eventBus', eventBus);

  const workflowEngine   = new WorkflowEngineService(prisma, { eventBus });
  const integrationService = new IntegrationService(prisma, { eventBus, workflowEngine });
  // Cross-wire: workflow webhook steps deliver through IntegrationService;
  // inbound webhooks bridge back into the workflow engine.
  workflowEngine.setIntegrationService(integrationService);
  // create_record steps go through the same record path as the API, so the
  // new record gets formulas, unit/barrier stamping, assignment and events.
  workflowEngine.setRecordService(new RecordService(prisma, eventBus, null, new AssignmentService(prisma)));

  // Durable job queue (PRD E-03): failed integration / SMS calls retry with
  // back-off from the `job_queue` table instead of being lost.
  const JobQueue = require('./services/job-queue.service');
  const jobQueue = new JobQueue(prisma).register('integration.call', async (p) => {
    let log;
    try {
      log = await integrationService.executeByName(p.integration, p.body ?? {});
    } catch (err) {
      if (/not found|not active|No connector|unknown provider/i.test(err.message)) err.permanent = true;
      throw err;
    }
    if (p.field_map && p.record_id) await workflowEngine.applyFieldMap(p.record_id, p.field_map, log?.response_body);
  });
  workflowEngine.setJobQueue(jobQueue);
  fastify.decorate('jobQueue', jobQueue);

  fastify.decorate('workflowEngine', workflowEngine);
  fastify.decorate('integrationService', integrationService);

  // ── Social media service (decorated so routes and schedulers share it) ───
  // Publishes `social.*` events on the bus and converts mentions to leads
  // through the same CrmService the runtime routes use.
  const socialMediaSvc = new SocialMediaService(prisma, {
    eventBus,
    crmService: new CrmService(prisma, eventBus),
  });
  fastify.decorate('socialMediaService', socialMediaSvc);

  // ── SLA engine (decorated so routes can trigger a manual reconcile) ───────
  const slaService = new SlaService(prisma, fastify.log);
  fastify.decorate('slaService', slaService);
  // Timers start (and stop) when the record changes, not only at the next sweep.
  const slaNow = (_e, p) => { const id = p?.record?.id; if (id) slaService.reconcileRecord(id).catch((err) => fastify.log.warn({ err }, '[sla] record refresh failed')); };
  eventBus.subscribe('record.created', slaNow);
  eventBus.subscribe('record.field_changed', slaNow);

  // ── Reminder engine (due-sweep turns reminders into notifications) ────────
  const reminderService = new ReminderService(prisma, eventBus);
  fastify.decorate('reminderService', reminderService);

  // ── Scheduled report delivery (emails saved reports on a recurring schedule) ──
  const reportScheduleService = new ReportScheduleService(
    prisma,
    new ReportService(prisma),
    new EmailSendService(prisma, new EmailTemplateService(prisma)),
  );
  fastify.decorate('reportScheduleService', reportScheduleService);

  // ── Background schedulers ─────────────────────────────────────────────────
  // Every rule-based automation that is not request-driven runs here on a
  // fixed interval. `SchedulerRegistry` owns the overlap guard, error logging
  // and per-loop status (surfaced on /health); each job claims its own rows
  // atomically so several pods can run the same loop safely. Start offsets are
  // staggered so the loops do not all hit the database at boot.
  const schedulers = new SchedulerRegistry();
  fastify.decorate('schedulers', schedulers);

  // Runs due scheduled workflows and resumes delayed steps.
  schedulers.add({
    name: 'workflow', intervalMs: 60_000, startDelayMs: 0, runImmediately: false, log: fastify.log,
    run: () => workflowEngine.runScheduled(),
  });
  // Recomputes SLA timers, flags at-risk/breached, escalates.
  schedulers.add({
    name: 'sla', intervalMs: 60_000, startDelayMs: 15_000, log: fastify.log,
    run: () => slaService.reconcile(),
  });
  // Publishes social posts whose scheduled time has passed.
  schedulers.add({
    name: 'social-publish', intervalMs: 60_000, startDelayMs: 10_000, log: fastify.log,
    run: () => socialMediaSvc.publishDue(),
  });
  // Syncs each social account that is due under its own sync_frequency:
  // token refresh, profile metrics, mentions (routed to the team), engagement.
  schedulers.add({
    name: 'social-sync', intervalMs: 300_000, startDelayMs: 30_000, runImmediately: false, log: fastify.log,
    run: () => socialMediaSvc.runSyncCycle(),
  });
  // Fires due reminders as in-app notifications.
  schedulers.add({
    name: 'reminder', intervalMs: 60_000, startDelayMs: 45_000, log: fastify.log,
    run: () => reminderService.sweepDue(),
  });
  // Emails saved reports whose subscription is due.
  schedulers.add({
    name: 'report-schedule', intervalMs: 60_000, startDelayMs: 20_000, log: fastify.log,
    run: async () => {
      const r = await reportScheduleService.sweepDue();
      if (r.sent) fastify.log.info(r, '[report-schedule] delivered');
      return r;
    },
  });

  // Once a day, recompute formulas that read the date (TODAY / NOW / AGE) so
  // flags like "review due" and "days to maturity" stay true on records
  // nobody edits. Checks hourly; does the work once per day.
  const FormulaRefreshService = require('./services/formula-refresh.service');
  const formulaRefresh = new FormulaRefreshService(prisma, new RecordService(prisma));
  schedulers.add({
    name: 'formula-refresh', intervalMs: 3_600_000, startDelayMs: 300_000, log: fastify.log,
    run: () => formulaRefresh.run(),
  });

  schedulers.add({
    name: 'job-queue', intervalMs: 15_000, startDelayMs: 20_000, log: fastify.log,
    run: () => jobQueue.work(),
  });

  fastify.addHook('onReady', async () => schedulers.startAll());
  fastify.addHook('onClose', async () => schedulers.stopAll());

  // ── Security headers ─────────────────────────────────────────────────────
  // The API serves JSON only, so a strict baseline costs nothing: no MIME
  // sniffing, never framed, minimal referrer leakage, no browser features, and
  // HSTS once TLS terminates in front of us (production only, so a plain-HTTP
  // dev server is not pinned). Equivalent to the parts of `helmet` that apply
  // to an API, without the dependency.
  fastify.addHook('onSend', async (request, reply) => {
    reply.header('X-Content-Type-Options', 'nosniff');
    reply.header('X-Frame-Options', 'DENY');
    reply.header('Referrer-Policy', 'no-referrer');
    reply.header('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    reply.header('Cross-Origin-Opener-Policy', 'same-origin');
    reply.header('Cross-Origin-Resource-Policy', 'same-site');
    if (config.isProd) reply.header('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  });

  // ── Plugins ───────────────────────────────────────────
  await fastify.register(corsPlugin);
  await fastify.register(jwtPlugin);
  await fastify.register(redisPlugin);

  // Shared limiter for the public auth endpoints (Redis-backed when available,
  // per-process otherwise). Decorated so tests and other routes can reuse it.
  fastify.decorate('rateLimiter', new RateLimiter({ redis: fastify.redis ?? null, log: fastify.log }));

  // ── Health check ───────────────────────────────────────
  fastify.get('/health', async (req, reply) => {
    let dbStatus = 'disconnected';
    try {
      await prisma.$queryRaw`SELECT 1`;
      dbStatus = 'connected';
    } catch {
      dbStatus = 'unreachable';
    }

    const healthy = dbStatus === 'connected';
    const payload = {
      status:   healthy ? 'ok' : 'degraded',
      ts:       new Date().toISOString(),
      env:      config.env,
      services: {
        database: dbStatus,
        // Optional — the app runs without it; shown so an operator can tell
        // "no cache" apart from "cache down".
        redis: fastify.redisStatus ? fastify.redisStatus() : 'unavailable',
      },
      // Per-loop status of the background schedulers: last run, duration,
      // result summary and last error — the operator's view of automation.
      schedulers: schedulers.statuses(),
      // Durable job queue depth by status (queued / running / done / dead).
      job_queue: dbStatus === 'connected' ? await jobQueue.stats().catch(() => 'unavailable') : 'unavailable',
    };

    return reply.code(healthy ? 200 : 503).send(payload);
  });

  // ── API Routes ─────────────────────────────────────────
  fastify.register(authRoutes,          { prefix: '/api/auth' });
  fastify.register(metadataRoutes,      { prefix: '/api/metadata' });
  fastify.register(builderRoutes,       { prefix: '/api/builder' });
  fastify.register(runtimeRoutes,       { prefix: '/api/runtime' });
  fastify.register(activitiesRoutes,    { prefix: '/api/activities' });
  fastify.register(tasksRoutes,         { prefix: '/api/tasks' });
  fastify.register(remindersRoutes,     { prefix: '/api/reminders' });
  fastify.register(notificationsRoutes, { prefix: '/api/notifications' });
  fastify.register(searchRoutes,        { prefix: '/api/search' });
  fastify.register(integrationsRoutes,  { prefix: '/api/integrations' });
  fastify.register(emailRoutes,          { prefix: '/api/email' });
  fastify.register(documentRoutes,       { prefix: '/api/documents' });
  fastify.register(platformRoutes,       { prefix: '/api/platform' });
  fastify.register(socialMediaRoutes,    { prefix: '/api/social-media' });
  fastify.register(leadScoringRoutes,   { prefix: '/api/lead-scoring' });
  fastify.register(settingsRoutes,      { prefix: '/api/settings' });
  fastify.register(slaRoutes,           { prefix: '/api/sla' });
  fastify.register(reportRoutes,        { prefix: '/api/reports' });
  fastify.register(analyticsRoutes,     { prefix: '/api/analytics' });
  fastify.register(aiReportRoutes,      { prefix: '/api/ai-reports' });
  fastify.register(accessRoutes,        { prefix: '/api/access' });
  // Unauthenticated website intake (published web forms) and the client /
  // introducer portal, which has its own sign-in realm.
  fastify.register(publicRoutes,        { prefix: '/api/public' });
  fastify.register(portalRoutes,        { prefix: '/api/portal' });
  fastify.register(calendarRoutes,      { prefix: '/api/calendar' });

  // ── Global error handler ────────────────────────────────
  fastify.setErrorHandler((error, request, reply) => {
    // Known operational errors. A ValidationError may carry `details`
    // ([{ field, message }]) so forms can highlight the offending fields; a
    // rate-limit error carries `retryAfterSec`, surfaced as Retry-After.
    if (error.isOperational) {
      // 4xx responses are otherwise invisible in the access log ("statusCode":400
      // with no reason) — record why, at info level so it never pages anyone.
      if (error.statusCode < 500) {
        request.log.info({ code: error.code, reason: error.message, details: error.details }, 'request rejected');
      }
      if (error.retryAfterSec) reply.header('Retry-After', String(error.retryAfterSec));
      return reply.code(error.statusCode).send({
        success: false,
        error:   {
          code:    error.code,
          message: error.message,
          ...(Array.isArray(error.details) && error.details.length ? { details: error.details } : {}),
        },
      });
    }

    // Fastify validation errors
    if (error.validation) {
      return reply.code(400).send({
        success: false,
        error:   { code: 'VALIDATION_ERROR', message: error.message, details: error.validation },
      });
    }

    // Prisma connection / server-reach errors (P1001 = can't reach, P1002 = timed out, P1003 = db does not exist)
    if (['P1001', 'P1002', 'P1003', 'P1008', 'P1017'].includes(error.code)
        || error.constructor?.name === 'PrismaClientInitializationError') {
      fastify.log.error({ err: error }, 'Database connectivity error');
      return reply.code(503).send({
        success: false,
        error:   { code: 'DATABASE_UNAVAILABLE', message: 'Database is currently unreachable. Please try again shortly.' },
      });
    }

    // Prisma unique constraint violation
    if (error.code === 'P2002') {
      return reply.code(409).send({
        success: false,
        error:   { code: 'CONFLICT_ERROR', message: 'A record with these values already exists' },
      });
    }

    // Prisma not found
    if (error.code === 'P2025') {
      return reply.code(404).send({
        success: false,
        error:   { code: 'NOT_FOUND', message: 'Record not found' },
      });
    }

    // @fastify/jwt errors
    if (error.statusCode === 401) {
      return reply.code(401).send({
        success: false,
        error:   { code: 'AUTHENTICATION_ERROR', message: error.message },
      });
    }

    // Any error carrying an explicit 4xx status — e.g. `requireFields` (400) or
    // route handlers that throw `{ statusCode, message }` — is a client error and
    // must be surfaced as-is, not masked as a generic 500.
    if (typeof error.statusCode === 'number' && error.statusCode >= 400 && error.statusCode < 500) {
      return reply.code(error.statusCode).send({
        success: false,
        error:   { code: error.code || 'REQUEST_ERROR', message: error.message || 'Request error' },
      });
    }

    fastify.log.error(error);
    return reply.code(500).send({
      success: false,
      error:   { code: 'INTERNAL_ERROR', message: config.isDev ? error.message : 'Internal server error' },
    });
  });

  return fastify;
}

module.exports = { buildApp };
