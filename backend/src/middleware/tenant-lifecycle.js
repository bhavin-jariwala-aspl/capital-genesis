'use strict';

const { AuthorizationError } = require('../utils/errors');

/**
 * Tenant lifecycle gate.
 *
 * `Tenant.status` was purely decorative: the platform admin could suspend a
 * tenant (and the admin guide promised "all users lose access"), yet nothing
 * consulted the flag on the request path. Every already-issued JWT kept
 * working, and a non-paying or deleted tenant carried on using the product
 * until its tokens expired. Trials were the same story — `trial_ends_at` was
 * written at creation and never read again.
 *
 * This module is the single place that decides whether a tenant may transact.
 * `authenticate()` calls it on every authenticated request and `AuthService`
 * calls it at sign-in, so both the "no new sessions" and the "existing
 * sessions stop" halves are covered.
 *
 * Statuses are read through a short-TTL memo so the check costs one query per
 * tenant per {@link STATUS_TTL_MS} rather than one per request. A suspension
 * therefore takes effect within the TTL, which is the trade we want: a
 * suspend/reactivate is rare, a request is not. `invalidate()` lets the
 * platform routes drop the memo the moment they change a status, so the
 * console stays truthful.
 */

// How long a tenant's status is trusted without re-reading it.
const STATUS_TTL_MS = 30_000;

// Statuses that revoke access outright.
const BLOCKED_STATUS = Object.freeze({
  suspended: 'This workspace is suspended. Contact your platform administrator.',
  cancelled: 'This workspace has been cancelled. Contact your platform administrator.',
  deleted:   'This workspace is no longer available.',
});

/** tenantId → { at: epochMs, tenant: { status, trial_ends_at } | null } */
const memo = new Map();

/** Forget a tenant's cached status (call after suspend/reactivate/delete/restore). */
function invalidate(tenantId) {
  if (tenantId == null) memo.clear();
  else memo.delete(Number(tenantId));
}

/** A prisma client we can actually ask about tenants (tests pass stubs). */
function canQuery(prisma) {
  return typeof prisma?.tenant?.findUnique === 'function';
}

/**
 * Read a tenant's lifecycle fields, memoised.
 * Returns null when the tenant row is missing or unreadable.
 */
async function readStatus(prisma, tenantId) {
  const id = Number(tenantId);
  const hit = memo.get(id);
  if (hit && Date.now() - hit.at < STATUS_TTL_MS) return hit.tenant;

  let tenant = null;
  try {
    tenant = await prisma.tenant.findUnique({
      where:  { id },
      select: { id: true, status: true, trial_ends_at: true },
    });
  } catch {
    // A database blip must not lock every tenant out of the product; the
    // request that follows will fail on its own if the database is really
    // down. Cache nothing so the next request retries.
    return undefined;
  }
  memo.set(id, { at: Date.now(), tenant });
  return tenant;
}

/**
 * Why this tenant may not transact, or null when it may.
 * Pure — exported so the reason table is testable without a database.
 */
function blockReason(tenant, now = Date.now()) {
  if (!tenant) return 'This workspace is no longer available.';
  if (BLOCKED_STATUS[tenant.status]) return BLOCKED_STATUS[tenant.status];
  if (tenant.status === 'trial' && tenant.trial_ends_at
      && new Date(tenant.trial_ends_at).getTime() < now) {
    return 'This workspace\'s trial has ended. Upgrade the plan to continue.';
  }
  return null;
}

/**
 * Throw {@link AuthorizationError} when `tenantId` may not transact.
 * No-ops for platform admins (no tenant) and for clients that cannot query.
 */
async function assertTenantUsable(prisma, tenantId) {
  if (tenantId == null || !canQuery(prisma)) return;
  const tenant = await readStatus(prisma, tenantId);
  if (tenant === undefined) return; // unreadable — see readStatus
  const reason = blockReason(tenant);
  if (reason) throw new AuthorizationError(reason);
}

module.exports = {
  assertTenantUsable,
  blockReason,
  invalidate,
  BLOCKED_STATUS,
  STATUS_TTL_MS,
  __memo: memo,
};
