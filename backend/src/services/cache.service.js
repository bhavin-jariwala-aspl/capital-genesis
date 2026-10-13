'use strict';

/**
 * Cache Service — wraps Redis with graceful fallback.
 * All metadata is namespaced under "genesis:" prefix.
 *
 * Key patterns:
 *   genesis:modules:all
 *   genesis:module:{id}
 *   genesis:objects:module:{moduleId}
 *   genesis:object:{id}
 *   genesis:fields:object:{objectId}
 *   genesis:field:{id}
 *   genesis:form:{id}
 *   genesis:form:full:{id}        (form + field layouts + fields)
 *   genesis:dashboard:{id}
 *   genesis:dashboards:all
 *   genesis:pipeline:object:{objectId}
 */

const config = require('../config');
const { getTenantId } = require('../middleware/tenant-scope');

const PREFIX = config.cache.prefix;
const TTL    = config.cache.ttlMetadata;

class CacheService {
  constructor(redis) {
    this.redis    = redis;
    // RC-16 fix: in-flight promise map for cache stampede prevention.
    // When multiple concurrent requests miss the same key, only one calls
    // the fetcher; the rest await the same promise.
    this._inFlight = new Map();
  }

  /**
   * Live, not a startup snapshot: a Redis that was down when the process
   * started is used as soon as it comes back, and one that goes away stops
   * being asked (the client has no offline queue, so a call while
   * disconnected would reject immediately anyway).
   */
  get enabled() {
    return this.redis?.status === 'ready';
  }

  // Per-tenant key segment. Cached values are derived from tenant-scoped DB
  // queries, so they MUST be namespaced by tenant — otherwise one tenant's
  // result (e.g. an empty module list fetched under the wrong tenant) would be
  // served to every tenant. Falls back to "global" outside request context.
  _tenantSeg() {
    const t = getTenantId();
    return `t${t ?? 'global'}:`;
  }

  key(...parts) {
    return PREFIX + this._tenantSeg() + parts.join(':');
  }

  async get(key) {
    if (!this.enabled) return null;
    try {
      const val = await this.redis.get(key);
      if (!val) return null;
      // Only return structured types (object/array); reject unexpected primitives (CWE-502)
      const parsed = JSON.parse(val);
      return (parsed !== null && typeof parsed === 'object') ? parsed : null;
    } catch {
      return null;
    }
  }

  async set(key, value, ttl = TTL) {
    if (!this.enabled) return;
    try {
      await this.redis.set(key, JSON.stringify(value), 'EX', ttl);
    } catch {
      // Silently fail
    }
  }

  async del(...keys) {
    if (!this.enabled) return;
    try {
      await this.redis.del(...keys);
    } catch {
      // Silently fail
    }
  }

  /** Delete all keys matching a pattern (SCAN-based, safe for large keyspaces) */
  async delPattern(pattern) {
    if (!this.enabled) return;
    try {
      let cursor = '0';
      do {
        const [nextCursor, keys] = await this.redis.scan(cursor, 'MATCH', PREFIX + this._tenantSeg() + pattern, 'COUNT', 100);
        cursor = nextCursor;
        if (keys.length > 0) await this.redis.del(...keys);
      } while (cursor !== '0');
    } catch {
      // Silently fail
    }
  }

  /** Cache-aside helper: try cache, fallback to fetcher fn, then cache result.
   * RC-16 fix: concurrent misses for the same key coalesce into one fetcher
   * call, preventing the thundering-herd / cache stampede problem. */
  async remember(key, fetcher, ttl = TTL) {
    const cached = await this.get(key);
    if (cached !== null) return cached;

    // If another request is already fetching this key, reuse its promise
    if (this._inFlight.has(key)) {
      return this._inFlight.get(key);
    }

    const fetchPromise = fetcher()
      .then(value => {
        this.set(key, value, ttl).catch(() => {});
        return value;
      })
      .finally(() => {
        this._inFlight.delete(key);
      });

    this._inFlight.set(key, fetchPromise);
    return fetchPromise;
  }

  // ── Invalidation helpers ────────────────────────────────

  async invalidateModule(id) {
    await this.del(
      this.key('module', id),
      this.key('modules', 'all'),
    );
  }

  async invalidateObject(id, moduleId) {
    await this.del(
      this.key('object', id),
      this.key('objects', 'module', moduleId),
    );
    if (moduleId) await this.invalidateModule(moduleId);
  }

  async invalidateField(id, objectId) {
    await this.del(
      this.key('field', id),
      this.key('fields', 'object', objectId),
    );
    // Invalidate all forms for this object since field data changed
    await this.delPattern(`form:*`);
  }

  async invalidateForm(id) {
    await this.del(
      this.key('form', id),
      this.key('form', 'full', id),
    );
  }

  async invalidateDashboard(id) {
    await this.del(
      this.key('dashboard', id),
      this.key('dashboards', 'all'),
    );
    // Also clear all role-scoped dashboard list caches
    await this.delPattern('dashboards:role:*');
  }
}

module.exports = CacheService;
