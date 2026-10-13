'use strict';

/** Durable job queue (PRD E-03): retry with back-off, dead-lettering, dedupe, leases. */

const JobQueue = require('../src/services/job-queue.service');
const { backoff } = JobQueue;

/** A tiny in-memory stand-in for prisma.jobQueue. */
function memoryDb() {
  const rows = [];
  let id = 0;
  const match = (r, where = {}) => Object.entries(where).every(([k, v]) => {
    if (v && typeof v === 'object' && !(v instanceof Date)) {
      if ('in' in v) return v.in.includes(r[k]);
      if ('lte' in v) return r[k] <= v.lte;
      if ('lt' in v) return r[k] < v.lt;
    }
    return r[k] === v;
  });
  const apply = (r, data) => {
    for (const [k, v] of Object.entries(data)) r[k] = v && typeof v === 'object' && 'increment' in v ? r[k] + v.increment : v;
  };
  return {
    rows,
    jobQueue: {
      create: async ({ data }) => { const r = { id: ++id, locked_at: null, last_error: null, ...data }; rows.push(r); return r; },
      findFirst: async ({ where }) => rows.find((r) => match(r, where)) ?? null,
      findMany: async ({ where, take }) => rows.filter((r) => match(r, where)).slice(0, take).map((r) => ({ ...r })),
      updateMany: async ({ where, data }) => { const hit = rows.filter((r) => match(r, where)); hit.forEach((r) => apply(r, data)); return { count: hit.length }; },
      update: async ({ where, data }) => { const r = rows.find((x) => x.id === where.id); apply(r, data); return r; },
      groupBy: async () => Object.entries(rows.reduce((a, r) => ({ ...a, [r.status]: (a[r.status] ?? 0) + 1 }), {})).map(([status, n]) => ({ status, _count: { _all: n } })),
    },
  };
}

describe('JobQueue', () => {
  let clock;
  const make = (db) => new JobQueue(db, { now: () => clock });
  beforeEach(() => { clock = Date.parse('2026-10-14T08:00:00Z'); });

  it('runs a due job once and marks it done', async () => {
    const db = memoryDb();
    const seen = [];
    const q = make(db).register('ping', async (p) => { seen.push(p.n); });
    await q.enqueue('ping', { n: 1 }, { tenantId: 6 });
    expect(await q.work()).toEqual({ done: 1, retried: 0, dead: 0 });
    expect(await q.work()).toEqual({ done: 0, retried: 0, dead: 0 });
    expect(seen).toEqual([1]);
    expect(await q.stats()).toEqual({ done: 1 });
  });

  it('retries with back-off and parks the job as dead after max attempts', async () => {
    const db = memoryDb();
    const q = make(db).register('flaky', async () => { throw new Error('gateway timeout'); });
    await q.enqueue('flaky', {}, { maxAttempts: 3 });
    expect((await q.work()).retried).toBe(1);
    expect((await q.work()).retried).toBe(0); // not due yet
    clock += backoff(1);
    expect((await q.work()).retried).toBe(1);
    clock += backoff(2);
    expect(await q.work()).toEqual({ done: 0, retried: 0, dead: 1 });
    expect(db.rows[0]).toMatchObject({ status: 'dead', attempts: 3, last_error: 'gateway timeout' });
    expect(await q.retry(db.rows[0].id)).toBe(true);
    expect(db.rows[0]).toMatchObject({ status: 'queued', attempts: 0 });
  });

  it('gives up at once on a permanent error', async () => {
    const db = memoryDb();
    const q = make(db).register('bad', async () => { throw Object.assign(new Error('not found'), { permanent: true }); });
    await q.enqueue('bad', {});
    expect((await q.work()).dead).toBe(1);
  });

  it('deduplicates pending jobs by key', async () => {
    const db = memoryDb();
    const q = make(db).register('x', async () => {});
    const a = await q.enqueue('x', {}, { dedupeKey: 'k1' });
    const b = await q.enqueue('x', {}, { dedupeKey: 'k1' });
    expect(b.id).toBe(a.id);
    expect(db.rows).toHaveLength(1);
  });

  it('reclaims a job whose worker died mid-run', async () => {
    const db = memoryDb();
    const q = make(db).register('x', async () => {});
    await q.enqueue('x', {});
    Object.assign(db.rows[0], { status: 'running', locked_at: new Date(clock) });
    expect((await q.work()).done).toBe(0);
    clock += 11 * 60 * 1000;
    expect((await q.work()).done).toBe(1);
  });

  it('refuses an unknown job type', async () => {
    await expect(make(memoryDb()).enqueue('nope', {})).rejects.toThrow(/no handler/);
  });

  it('caps back-off at one hour', () => {
    expect(backoff(1)).toBe(30_000);
    expect(backoff(20)).toBe(3_600_000);
  });
});
