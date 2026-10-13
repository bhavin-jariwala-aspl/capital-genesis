'use strict';

const crypto = require('crypto');
const { getTenantId } = require('../middleware/tenant-scope');
const { logger } = require('./logging.service');

/**
 * Tamper-evident audit trail.
 *
 * `audit_logs` is an ordinary table: anyone with database write access can
 * edit or delete a row and nothing would show it. Regulated events — barrier
 * membership, wall-crossings, permission and access-scope changes, reveals of
 * sensitive records — are additionally appended here, to a per-tenant chain in
 * which each event's SHA-256 covers its own content *and the previous event's
 * hash*. Altering, inserting or deleting any event breaks every hash after it,
 * which `verify()` reports with the first broken sequence number.
 *
 * Appends are serialised per tenant inside a transaction that reads the chain
 * head, so two concurrent writers cannot both claim the same `seq` (the
 * `(tenant_id, seq)` unique key backs that up).
 */

const GENESIS = '0'.repeat(64);

/** Stable JSON: object keys sorted, so the same content always hashes alike. */
function canonical(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value ?? null);
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value instanceof Date) return JSON.stringify(value.toISOString());
  return `{${Object.keys(value).sort().map((k) => `${JSON.stringify(k)}:${canonical(value[k])}`).join(',')}}`;
}

function hashOf(event, prevHash) {
  const body = canonical({
    seq: event.seq,
    tenant_id: event.tenant_id,
    entity_type: event.entity_type,
    entity_id: event.entity_id ?? null,
    action: event.action,
    actor: event.actor ?? null,
    sensitivity: event.sensitivity ?? 'normal',
    payload: event.payload ?? null,
    created_at: event.created_at instanceof Date ? event.created_at.toISOString() : event.created_at,
  });
  return crypto.createHash('sha256').update(`${prevHash}|${body}`).digest('hex');
}

class AuditChainService {
  /** @param {import('@prisma/client').PrismaClient} prisma */
  constructor(prisma) {
    this.db = prisma;
  }

  /**
   * Append one event. Never throws into the caller's request: a failed audit
   * append is logged loudly instead, because refusing a business action over
   * an audit hiccup would be worse than a logged gap.
   */
  async append({ entityType, entityId = null, action, actor = null, payload = null, sensitivity = 'normal', tenantId = null }) {
    const tid = Number(tenantId ?? getTenantId());
    if (!tid || typeof this.db.auditChainEvent?.create !== 'function') return null;
    try {
      return await this.db.$transaction(async (tx) => {
        const head = await tx.auditChainEvent.findFirst({
          where: { tenant_id: tid }, orderBy: { seq: 'desc' }, select: { seq: true, hash: true },
        });
        const event = {
          seq: (head?.seq ?? 0) + 1,
          tenant_id: tid,
          entity_type: String(entityType),
          entity_id: entityId != null ? String(entityId) : null,
          action: String(action),
          actor: actor ?? null,
          sensitivity,
          payload,
          created_at: new Date(),
        };
        const prev = head?.hash ?? GENESIS;
        return tx.auditChainEvent.create({ data: { ...event, prev_hash: prev, hash: hashOf(event, prev) } });
      });
    } catch (err) {
      logger?.error?.('[AuditChain] append failed — audit gap', { entityType, action, error: err.message });
      return null;
    }
  }

  /**
   * Recompute the chain for a tenant.
   * @returns {Promise<{ ok: boolean, events: number, broken_at: number|null, reason: string|null }>}
   */
  async verify(tenantId = null) {
    const tid = Number(tenantId ?? getTenantId());
    const events = await this.db.auditChainEvent.findMany({ where: { tenant_id: tid }, orderBy: { seq: 'asc' } });
    let prev = GENESIS;
    for (let i = 0; i < events.length; i++) {
      const e = events[i];
      if (e.seq !== i + 1) return { ok: false, events: events.length, broken_at: i + 1, reason: 'sequence gap — an event was removed' };
      if (e.prev_hash !== prev) return { ok: false, events: events.length, broken_at: e.seq, reason: 'previous-hash mismatch' };
      if (hashOf(e, prev) !== e.hash) return { ok: false, events: events.length, broken_at: e.seq, reason: 'content altered' };
      prev = e.hash;
    }
    return { ok: true, events: events.length, broken_at: null, reason: null };
  }

  async list({ entityType, entityId, limit = 100, offset = 0 } = {}) {
    return this.db.auditChainEvent.findMany({
      where: {
        ...(entityType ? { entity_type: entityType } : {}),
        ...(entityId != null ? { entity_id: String(entityId) } : {}),
      },
      orderBy: { seq: 'desc' },
      take: Math.min(Number(limit) || 100, 500),
      skip: Number(offset) || 0,
    });
  }
}

module.exports = AuditChainService;
module.exports.hashOf = hashOf;
module.exports.GENESIS = GENESIS;
