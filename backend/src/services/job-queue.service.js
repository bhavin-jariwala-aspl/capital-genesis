'use strict';

const { tenantContext, getTenantId } = require('../middleware/tenant-scope');
const { logger } = require('./logging.service');

/**
 * Durable job queue (PRD E-03) — outbound work that must survive a failure or
 * a restart: integration calls (screening, MCIB, LMS, TA, OMS, FX dealing),
 * SMS and similar. Jobs live in the `job_queue` table, so they need nothing
 * beyond the database the CRM already runs on, and any number of API pods can
 * work the queue: each job is claimed with an atomic status flip.
 *
 *   enqueue(type, payload, { delayMs, maxAttempts, dedupeKey })
 *   work()  — run due jobs; failures retry with exponential back-off
 *             (30 s, 1 m, 2 m … capped at 1 h) until `max_attempts`, then the
 *             job is parked as `dead` for an administrator to inspect / retry.
 *
 * Handlers are registered by type; each runs inside the job's tenant.
 * A job claimed by a pod that died is released after LEASE_MS.
 */

const LEASE_MS = 10 * 60 * 1000;
const BASE_BACKOFF_MS = 30 * 1000;
const MAX_BACKOFF_MS = 60 * 60 * 1000;

const backoff = (attempt) => Math.min(MAX_BACKOFF_MS, BASE_BACKOFF_MS * 2 ** Math.max(0, attempt - 1));

class JobQueue {
  constructor(prisma, { now = () => Date.now() } = {}) {
    this.db = prisma;
    this.now = now;
    this.handlers = new Map();
  }

  /** Register the handler for a job type: async (payload, job) => result. */
  register(type, handler) {
    this.handlers.set(type, handler);
    return this;
  }

  /**
   * Queue a job. A `dedupeKey` makes it idempotent: a second enqueue with the
   * same key while the first is still pending returns the existing job.
   */
  async enqueue(type, payload, { delayMs = 0, maxAttempts = 6, dedupeKey = null, tenantId } = {}) {
    if (!this.handlers.has(type)) throw new Error(`JobQueue: no handler for '${type}'`);
    const data = {
      type, payload: payload ?? {}, status: 'queued', attempts: 0, max_attempts: maxAttempts,
      run_after: new Date(this.now() + delayMs), dedupe_key: dedupeKey ? String(dedupeKey).slice(0, 191) : null,
      tenant_id: tenantId ?? getTenantId() ?? null,
    };
    if (dedupeKey) {
      const existing = await this.db.jobQueue.findFirst({ where: { dedupe_key: data.dedupe_key, status: { in: ['queued', 'running'] } } });
      if (existing) return existing;
    }
    return this.db.jobQueue.create({ data });
  }

  /** Run due jobs once. Returns { done, retried, dead }. */
  async work({ batchSize = 50 } = {}) {
    const now = new Date(this.now());
    // Release leases held by a pod that stopped mid-job.
    await this.db.jobQueue.updateMany({
      where: { status: 'running', locked_at: { lt: new Date(this.now() - LEASE_MS) } },
      data: { status: 'queued', locked_at: null },
    });
    const due = await this.db.jobQueue.findMany({
      where: { status: 'queued', run_after: { lte: now } },
      orderBy: { run_after: 'asc' }, take: batchSize,
    });
    const tally = { done: 0, retried: 0, dead: 0 };
    for (const job of due) {
      const claim = await this.db.jobQueue.updateMany({
        where: { id: job.id, status: 'queued' },
        data: { status: 'running', locked_at: now, attempts: { increment: 1 } },
      });
      if (claim.count !== 1) continue;
      const attempt = job.attempts + 1;
      try {
        const handler = this.handlers.get(job.type);
        if (!handler) throw Object.assign(new Error(`no handler for '${job.type}'`), { permanent: true });
        await tenantContext.run({ tenantId: job.tenant_id ?? null }, () => handler(job.payload ?? {}, { ...job, attempts: attempt }));
        await this.db.jobQueue.update({ where: { id: job.id }, data: { status: 'done', locked_at: null, last_error: null } });
        tally.done += 1;
      } catch (err) {
        const dead = err?.permanent || attempt >= job.max_attempts;
        await this.db.jobQueue.update({
          where: { id: job.id },
          data: {
            status: dead ? 'dead' : 'queued', locked_at: null,
            last_error: String(err?.message ?? err).slice(0, 2000),
            ...(dead ? {} : { run_after: new Date(this.now() + backoff(attempt)) }),
          },
        });
        if (dead) {
          tally.dead += 1;
          logger.warn(`[JobQueue] job ${job.id} (${job.type}) gave up after ${attempt} attempt(s): ${err?.message}`);
        } else {
          tally.retried += 1;
        }
      }
    }
    return tally;
  }

  /** Counts by status, for /health and the admin view. */
  async stats() {
    const rows = await this.db.jobQueue.groupBy({ by: ['status'], _count: { _all: true } });
    return Object.fromEntries(rows.map((r) => [r.status, r._count._all]));
  }

  /** Put a dead job back in the queue (administrator action). */
  async retry(id) {
    const r = await this.db.jobQueue.updateMany({
      where: { id: Number(id), status: 'dead' },
      data: { status: 'queued', attempts: 0, run_after: new Date(this.now()), last_error: null },
    });
    return r.count === 1;
  }
}

module.exports = JobQueue;
module.exports.backoff = backoff;
