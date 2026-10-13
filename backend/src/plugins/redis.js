'use strict';

const fp  = require('fastify-plugin');
const Redis = require('ioredis');
const config = require('../config');

/**
 * Optional Redis client, decorated as `fastify.redis`.
 *
 * Redis is a nice-to-have here (metadata cache, shared rate-limit counters,
 * webhook idempotency); every consumer falls back when it is absent. The client
 * is therefore tuned so that a machine *without* Redis is quiet and fast:
 *
 *   • reconnects back off exponentially (2 s → 60 s) instead of hammering the
 *     port every two seconds forever;
 *   • the offline queue is disabled, so a command issued while disconnected
 *     fails at once rather than waiting for the next reconnect attempt —
 *     consumers already guard on `status === 'ready'` or catch the error;
 *   • the outage is logged once, and once more when Redis comes back, rather
 *     than on every failed attempt.
 *
 * `fastify.redisStatus()` reports `connected | unavailable` for /health.
 */
const MAX_BACKOFF_MS = 60_000;

module.exports = fp(async function redisPlugin(fastify) {
  const client = new Redis({
    host:           config.redis.host,
    port:           config.redis.port,
    password:       config.redis.password || undefined,
    db:             config.redis.db,
    lazyConnect:    true,
    enableReadyCheck: false,
    enableOfflineQueue: false,
    maxRetriesPerRequest: 0,
    connectTimeout: 3000,
    retryStrategy: (times) => Math.min(2000 * 2 ** Math.min(times - 1, 5), MAX_BACKOFF_MS),
  });

  let down = false;
  const where = `${config.redis.host}:${config.redis.port}`;

  client.on('error', (err) => {
    if (down) {
      fastify.log.debug({ err: err.message }, 'Redis still unavailable');
      return;
    }
    down = true;
    fastify.log.warn(
      { err: err.message },
      `Redis not reachable at ${where} — running without cache; reconnecting with backoff (quietly)`,
    );
  });

  client.on('ready', () => {
    if (down) fastify.log.info('✅ Redis reconnected — cache and shared rate limiting re-enabled');
    down = false;
  });

  try {
    await client.connect();
    await client.ping();
    fastify.log.info('✅ Redis connected');
  } catch {
    // The 'error' listener above has already said so, once.
  }

  fastify.decorate('redis', client);
  fastify.decorate('redisStatus', () => (client.status === 'ready' ? 'connected' : 'unavailable'));

  fastify.addHook('onClose', async () => {
    client.disconnect();
  });
});
