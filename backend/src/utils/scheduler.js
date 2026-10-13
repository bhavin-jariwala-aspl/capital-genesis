'use strict';

/**
 * Background scheduler primitives.
 *
 * Every rule-based automation in Genesis that is not triggered by a request
 * (workflow sweeps, SLA reconciliation, reminder firing, report delivery,
 * social publishing and sync) runs on a fixed interval inside the API
 * process. Before this module each loop hand-rolled the same four things in
 * `app.js`: a `setTimeout` start offset, a `setInterval`, an "is a previous
 * tick still running?" guard, and error logging. Five copies of that had
 * already drifted (two loops lacked the overlap guard entirely).
 *
 * `createScheduler` owns those concerns once, and the `SchedulerRegistry`
 * gives operations a single place to see what is running: the `/health`
 * endpoint reports each loop's last run, duration, result and error, which is
 * how Salesforce's "Scheduled Jobs" and HubSpot's workflow health views expose
 * the same information.
 *
 * Multi-pod safety is deliberately NOT solved here — it belongs to each job,
 * which claims its own rows atomically (see `runScheduled` in the workflow
 * engine or `sweepDue` in the reminder service). The scheduler only guarantees
 * that one process never runs the same job concurrently with itself.
 */

/**
 * @typedef {object} SchedulerOptions
 * @property {string}   name           Stable identifier, e.g. 'workflow'.
 * @property {number}   intervalMs     Time between the start of consecutive ticks.
 * @property {() => Promise<unknown>} run  The job. Its resolved value is kept as `last_result`.
 * @property {number}   [startDelayMs] Delay before the first tick (staggers loops at boot). Default 0.
 * @property {boolean}  [runImmediately] Run once as soon as the start delay elapses (before waiting a full interval). Default true.
 * @property {{ error?: Function, info?: Function }} [log] Logger; defaults to console.
 * @property {() => number} [now] Clock, injectable for tests.
 */

/**
 * Create one interval-driven job.
 *
 * @param {SchedulerOptions} opts
 */
function createScheduler(opts) {
  const {
    name,
    intervalMs,
    run,
    startDelayMs = 0,
    runImmediately = true,
    log = console,
    now = () => Date.now(),
  } = opts;

  if (!name) throw new TypeError('scheduler needs a name');
  if (!Number.isFinite(intervalMs) || intervalMs <= 0) throw new TypeError(`scheduler ${name}: intervalMs must be > 0`);
  if (typeof run !== 'function') throw new TypeError(`scheduler ${name}: run must be a function`);

  let startTimer = null;
  let interval = null;
  let inFlight = null;

  const state = {
    name,
    interval_ms:      intervalMs,
    running:          false,
    runs:             0,
    skipped_overlaps: 0,
    failures:         0,
    last_started_at:  null,
    last_finished_at: null,
    last_duration_ms: null,
    last_error:       null,
    last_result:      null,
  };

  /**
   * Execute one tick. Returns the job's result, or `undefined` when a previous
   * tick was still running (the tick is skipped rather than queued — a slow
   * job must never build a backlog that exhausts the connection pool).
   */
  async function tick() {
    if (inFlight) {
      state.skipped_overlaps += 1;
      return undefined;
    }
    const startedAt = now();
    state.running = true;
    state.last_started_at = new Date(startedAt).toISOString();
    state.runs += 1;

    inFlight = (async () => {
      try {
        const result = await run();
        state.last_error = null;
        state.last_result = summarise(result);
        return result;
      } catch (err) {
        state.failures += 1;
        state.last_error = err?.message ?? String(err);
        log.error?.({ err }, `[${name}] scheduler error`);
        return undefined;
      } finally {
        const finishedAt = now();
        state.running = false;
        state.last_finished_at = new Date(finishedAt).toISOString();
        state.last_duration_ms = finishedAt - startedAt;
        inFlight = null;
      }
    })();
    return inFlight;
  }

  function start() {
    if (startTimer || interval) return;
    startTimer = setTimeout(() => {
      startTimer = null;
      if (runImmediately) tick();
      interval = setInterval(tick, intervalMs);
      if (typeof interval.unref === 'function') interval.unref();
    }, startDelayMs);
    if (typeof startTimer.unref === 'function') startTimer.unref();
  }

  function stop() {
    if (startTimer) { clearTimeout(startTimer); startTimer = null; }
    if (interval)   { clearInterval(interval);  interval = null; }
  }

  return {
    name,
    start,
    stop,
    tick,
    /** A snapshot safe to serialise into a health payload. */
    status: () => ({ ...state }),
  };
}

/**
 * Keep `last_result` small: a scheduler result is for a health check, not an
 * audit log. Arrays collapse to their length; objects are kept as-is only when
 * they are flat and short.
 */
function summarise(result) {
  if (result == null) return null;
  if (Array.isArray(result)) return { count: result.length };
  if (typeof result === 'object') {
    const entries = Object.entries(result).slice(0, 12);
    return Object.fromEntries(entries.map(([k, v]) => [k, typeof v === 'object' && v !== null ? '[…]' : v]));
  }
  return result;
}

/** Holds every scheduler in the process so they can be started/stopped together. */
class SchedulerRegistry {
  constructor() {
    /** @type {Map<string, ReturnType<typeof createScheduler>>} */
    this._jobs = new Map();
  }

  /** @param {SchedulerOptions} opts */
  add(opts) {
    if (this._jobs.has(opts.name)) throw new Error(`scheduler "${opts.name}" is already registered`);
    const job = createScheduler(opts);
    this._jobs.set(opts.name, job);
    return job;
  }

  get(name) {
    return this._jobs.get(name) ?? null;
  }

  startAll() {
    for (const job of this._jobs.values()) job.start();
  }

  stopAll() {
    for (const job of this._jobs.values()) job.stop();
  }

  /** @returns {Record<string, ReturnType<ReturnType<typeof createScheduler>['status']>>} */
  statuses() {
    return Object.fromEntries([...this._jobs.values()].map((j) => [j.name, j.status()]));
  }
}

module.exports = { createScheduler, SchedulerRegistry };
