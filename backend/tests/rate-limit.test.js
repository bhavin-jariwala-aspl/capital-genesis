'use strict';

const { RateLimiter, MemoryStore, AUTH_LIMITS, clientIp } = require('../src/utils/rate-limit');

const silent = { warn: jest.fn() };

describe('MemoryStore', () => {
  it('counts within a window and expires after it', async () => {
    const s = new MemoryStore();
    let now = 1_000_000;
    expect(await s.incr('k', 60, now)).toBe(1);
    expect(await s.incr('k', 60, now + 1000)).toBe(2);
    expect(await s.ttl('k', now + 1000)).toBe(59);
    expect(await s.incr('k', 60, now + 61_000)).toBe(1); // new window
    await s.reset('k');
    expect(await s.ttl('k', now)).toBe(0);
  });
});

describe('RateLimiter', () => {
  it('limits after max attempts and reports a retry hint', async () => {
    const rl = new RateLimiter({ log: silent });
    const rule = { max: 2, windowSec: 60 };
    expect(await rl.hit('a', rule)).toMatchObject({ limited: false, remaining: 1 });
    expect(await rl.hit('a', rule)).toMatchObject({ limited: false, remaining: 0 });
    const third = await rl.hit('a', rule);
    expect(third.limited).toBe(true);
    expect(third.retryAfterSec).toBeGreaterThan(0);
    await rl.reset('a');
    expect(await rl.hit('a', rule)).toMatchObject({ limited: false });
  });

  it('uses Redis when ready, and falls back to memory when Redis throws', async () => {
    const redis = {
      status: 'ready',
      incr: jest.fn().mockResolvedValue(1),
      expire: jest.fn().mockResolvedValue(1),
      ttl: jest.fn().mockResolvedValue(30),
      del: jest.fn().mockResolvedValue(1),
    };
    const rl = new RateLimiter({ redis, log: silent });
    await rl.hit('k', { max: 5, windowSec: 60 });
    expect(redis.incr).toHaveBeenCalledWith('rl:k');
    expect(redis.expire).toHaveBeenCalledWith('rl:k', 60);

    redis.incr.mockRejectedValueOnce(new Error('ECONNRESET'));
    const r = await rl.hit('k', { max: 1, windowSec: 60 });
    expect(r.limited).toBe(false);         // memory took over (its first hit)
    expect(silent.warn).toHaveBeenCalled();
  });

  it('skips Redis that is not connected', async () => {
    const redis = { status: 'reconnecting', incr: jest.fn() };
    const rl = new RateLimiter({ redis, log: silent });
    await rl.hit('k', { max: 5, windowSec: 60 });
    expect(redis.incr).not.toHaveBeenCalled();
  });

  it('ships sane defaults for the auth endpoints', () => {
    expect(AUTH_LIMITS.loginAccount.max).toBeLessThanOrEqual(10);
    expect(AUTH_LIMITS.loginIp.max).toBeGreaterThan(AUTH_LIMITS.loginAccount.max);
  });

  it('reads the first X-Forwarded-For hop', () => {
    expect(clientIp({ headers: { 'x-forwarded-for': '1.2.3.4, 10.0.0.1' }, ip: '10.0.0.1' })).toBe('1.2.3.4');
    expect(clientIp({ headers: {}, ip: '9.9.9.9' })).toBe('9.9.9.9');
  });
});

describe('RateLimiter.peek — failure-only counters', () => {
  it('reports the state without recording an attempt', async () => {
    const rl = new RateLimiter({ log: silent });
    const rule = { max: 2, windowSec: 60 };
    expect(await rl.peek('f', rule)).toMatchObject({ limited: false, retryAfterSec: 0 });
    expect(await rl.peek('f', rule)).toMatchObject({ limited: false });
    await rl.hit('f', rule);
    expect(await rl.peek('f', rule)).toMatchObject({ limited: false });
    await rl.hit('f', rule);
    const s = await rl.peek('f', rule);
    expect(s.limited).toBe(true);
    expect(s.retryAfterSec).toBeGreaterThan(0);
  });
});
