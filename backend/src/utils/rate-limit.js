'use strict';

/**
 * Fixed-window rate limiter with a Redis backend and an in-process fallback.
 *
 * Used for the public authentication endpoints (login, forgot-password,
 * reset-password), where the threat is credential stuffing and enumeration
 * rather than load. Two keys are checked per attempt — the account being
 * targeted and the caller's IP — so a distributed attack on one account and a
 * single host spraying many accounts are both slowed down.
 *
 * Unlike the inbound-webhook limiter (which fails open so a Redis outage never
 * drops a partner's events), this one **fails closed to the in-memory store**:
 * when Redis is unavailable the counts live in this process. That still stops
 * a single-pod brute force, and degrades to per-pod limits (not no limits) on
 * a multi-pod deployment.
 *
 * Successful logins clear the account's counter so a user who mistypes twice
 * and then succeeds is not left one attempt from lockout.
 */

class MemoryStore {
  constructor() { this.hits = new Map(); }

  /** @returns {Promise<number>} count within the current window */
  async incr(key, windowSec, now = Date.now()) {
    this.sweep(now);
    const cur = this.hits.get(key);
    if (cur && cur.expires > now) { cur.n += 1; return cur.n; }
    this.hits.set(key, { n: 1, expires: now + windowSec * 1000 });
    return 1;
  }

  /** @returns {Promise<number>} count within the current window, without adding to it */
  async get(key, now = Date.now()) {
    const cur = this.hits.get(key);
    return cur && cur.expires > now ? cur.n : 0;
  }

  async ttl(key, now = Date.now()) {
    const cur = this.hits.get(key);
    if (!cur || cur.expires <= now) return 0;
    return Math.ceil((cur.expires - now) / 1000);
  }

  async reset(key) { this.hits.delete(key); }

  /** Drop expired windows; bounded so a spray of keys cannot grow the map forever. */
  sweep(now = Date.now()) {
    if (this.hits.size < 10_000) return;
    for (const [k, v] of this.hits) if (v.expires <= now) this.hits.delete(k);
  }
}

class RedisStore {
  constructor(redis) { this.redis = redis; }

  async incr(key, windowSec) {
    const n = await this.redis.incr(key);
    if (n === 1) await this.redis.expire(key, windowSec);
    return n;
  }

  async get(key) { return Number(await this.redis.get(key)) || 0; }

  async ttl(key) {
    const t = await this.redis.ttl(key);
    return t > 0 ? t : 0;
  }

  async reset(key) { await this.redis.del(key); }
}

/**
 * @typedef {object} LimitRule
 * @property {number} max       attempts allowed per window
 * @property {number} windowSec window length
 */

class RateLimiter {
  /**
   * @param {object} [opts]
   * @param {import('ioredis').Redis|null} [opts.redis]  when given (and connected) counts are shared across pods
   * @param {string} [opts.prefix]
   * @param {{ warn?: Function }} [opts.log]
   */
  constructor({ redis = null, prefix = 'rl:', log = console } = {}) {
    this.redis  = redis;
    this.prefix = prefix;
    this.log    = log;
    this.memory = new MemoryStore();
  }

  #store() {
    // ioredis exposes `status`; anything but 'ready' means commands would queue or fail.
    if (this.redis && (this.redis.status === undefined || this.redis.status === 'ready')) return new RedisStore(this.redis);
    return this.memory;
  }

  /**
   * Record one attempt against `key` and report whether the caller is over the limit.
   * @param {string} key
   * @param {LimitRule} rule
   * @returns {Promise<{ limited: boolean, remaining: number, retryAfterSec: number }>}
   */
  async hit(key, rule) {
    const k = this.prefix + key;
    let store = this.#store();
    let n;
    try {
      n = await store.incr(k, rule.windowSec);
    } catch (err) {
      this.log.warn?.('[rate-limit] store error, using in-memory counts', { error: err.message });
      store = this.memory;
      n = await store.incr(k, rule.windowSec);
    }
    const limited = n > rule.max;
    const retryAfterSec = limited ? await store.ttl(k).catch(() => rule.windowSec) : 0;
    return { limited, remaining: Math.max(0, rule.max - n), retryAfterSec };
  }

  /**
   * Whether `key` is already over the limit, without recording an attempt —
   * for counters that only count failures (checked before, hit after).
   * @returns {Promise<{ limited: boolean, retryAfterSec: number }>}
   */
  async peek(key, rule) {
    const k = this.prefix + key;
    let store = this.#store();
    let n;
    try { n = await store.get(k); } catch { store = this.memory; n = await store.get(k); }
    const limited = n >= rule.max;
    return { limited, retryAfterSec: limited ? await store.ttl(k).catch(() => rule.windowSec) : 0 };
  }

  /** Forget a key — called after a successful login. */
  async reset(key) {
    const k = this.prefix + key;
    await Promise.allSettled([this.#store().reset(k), this.memory.reset(k)]);
  }
}

/** Default rules for the auth endpoints. */
const AUTH_LIMITS = {
  /** per account: 5 failed logins in 15 minutes locks the account for the rest of the window */
  loginAccount: { max: 5,  windowSec: 15 * 60 },
  /** per IP: 30 failed login attempts in 15 minutes (successful sign-ins are not counted: one office shares one IP) */
  loginIp:      { max: 30, windowSec: 15 * 60 },
  /** per IP: 5 password-reset requests per hour */
  forgotIp:     { max: 5,  windowSec: 60 * 60 },
  /** per IP: 10 reset-token submissions per hour */
  resetIp:      { max: 10, windowSec: 60 * 60 },
};

/** Client IP, honouring the first hop of X-Forwarded-For behind a proxy. */
function clientIp(req) {
  const fwd = req.headers?.['x-forwarded-for'];
  if (typeof fwd === 'string' && fwd.trim()) return fwd.split(',')[0].trim();
  return req.ip || 'unknown';
}

module.exports = { RateLimiter, MemoryStore, AUTH_LIMITS, clientIp };
