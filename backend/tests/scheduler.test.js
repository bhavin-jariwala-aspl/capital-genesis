'use strict';

/**
 * Scheduler primitives — the interval/guard/status wrapper every background
 * automation loop (workflow, SLA, reminders, report delivery, social publish
 * and sync) is registered through in app.js.
 */

const { createScheduler, SchedulerRegistry } = require('../src/utils/scheduler');

const silent = { error: jest.fn(), info: jest.fn() };

describe('createScheduler', () => {
  beforeEach(() => { jest.useFakeTimers(); silent.error.mockClear(); });
  afterEach(() => jest.useRealTimers());

  it('validates its options', () => {
    expect(() => createScheduler({ intervalMs: 10, run: () => {} })).toThrow(/name/);
    expect(() => createScheduler({ name: 'x', intervalMs: 0, run: () => {} })).toThrow(/intervalMs/);
    expect(() => createScheduler({ name: 'x', intervalMs: 10 })).toThrow(/run/);
  });

  it('waits the start delay, runs immediately, then on every interval', async () => {
    const run = jest.fn().mockResolvedValue({ done: 1 });
    const job = createScheduler({ name: 'j', intervalMs: 1000, startDelayMs: 500, run, log: silent });
    job.start();

    expect(run).not.toHaveBeenCalled();
    await jest.advanceTimersByTimeAsync(500);
    expect(run).toHaveBeenCalledTimes(1);
    await jest.advanceTimersByTimeAsync(2000);
    expect(run).toHaveBeenCalledTimes(3);

    const s = job.status();
    expect(s.runs).toBe(3);
    expect(s.last_result).toEqual({ done: 1 });
    expect(s.last_error).toBeNull();
    expect(s.running).toBe(false);
    job.stop();
    await jest.advanceTimersByTimeAsync(5000);
    expect(run).toHaveBeenCalledTimes(3); // stopped
  });

  it('runImmediately:false defers the first run by one interval', async () => {
    const run = jest.fn().mockResolvedValue(null);
    const job = createScheduler({ name: 'j', intervalMs: 1000, startDelayMs: 0, runImmediately: false, run, log: silent });
    job.start();
    await jest.advanceTimersByTimeAsync(999);
    expect(run).not.toHaveBeenCalled();
    await jest.advanceTimersByTimeAsync(1);
    expect(run).toHaveBeenCalledTimes(1);
    job.stop();
  });

  it('never overlaps itself: a slow tick makes the next tick a recorded skip', async () => {
    let release;
    const run = jest.fn(() => new Promise((r) => { release = r; }));
    const job = createScheduler({ name: 'slow', intervalMs: 100, run, log: silent });
    job.start();
    await jest.advanceTimersByTimeAsync(0);      // first tick starts and hangs
    await jest.advanceTimersByTimeAsync(250);    // two more intervals elapse
    expect(run).toHaveBeenCalledTimes(1);
    expect(job.status().skipped_overlaps).toBe(2);
    expect(job.status().running).toBe(true);

    release('ok');
    await jest.advanceTimersByTimeAsync(0);
    expect(job.status().running).toBe(false);
    await jest.advanceTimersByTimeAsync(100);
    expect(run).toHaveBeenCalledTimes(2);        // resumes once free
    job.stop();
  });

  it('captures a failure without stopping the loop', async () => {
    const run = jest.fn()
      .mockRejectedValueOnce(new Error('db down'))
      .mockResolvedValue([1, 2, 3]);
    const job = createScheduler({ name: 'flaky', intervalMs: 100, run, log: silent });
    job.start();
    await jest.advanceTimersByTimeAsync(0);
    expect(job.status().failures).toBe(1);
    expect(job.status().last_error).toBe('db down');
    expect(silent.error).toHaveBeenCalled();

    await jest.advanceTimersByTimeAsync(100);
    const s = job.status();
    expect(s.runs).toBe(2);
    expect(s.last_error).toBeNull();               // cleared by the good run
    expect(s.last_result).toEqual({ count: 3 });   // arrays summarised to a count
    job.stop();
  });

  it('tick() can be invoked directly and returns the job result', async () => {
    const job = createScheduler({ name: 'direct', intervalMs: 100, run: async () => 'r', log: silent });
    await expect(job.tick()).resolves.toBe('r');
    expect(job.status().runs).toBe(1);
  });
});

describe('SchedulerRegistry', () => {
  it('registers, reports and stops jobs by name', () => {
    jest.useFakeTimers();
    const reg = new SchedulerRegistry();
    reg.add({ name: 'a', intervalMs: 100, run: async () => 1, log: silent });
    reg.add({ name: 'b', intervalMs: 100, run: async () => 2, log: silent });
    expect(() => reg.add({ name: 'a', intervalMs: 100, run: async () => 1 })).toThrow(/already registered/);
    expect(reg.get('a')).not.toBeNull();
    expect(reg.get('zzz')).toBeNull();

    reg.startAll();
    const statuses = reg.statuses();
    expect(Object.keys(statuses).sort()).toEqual(['a', 'b']);
    expect(statuses.a.interval_ms).toBe(100);
    reg.stopAll();
    jest.useRealTimers();
  });
});
