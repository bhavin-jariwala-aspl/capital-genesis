'use strict';

/**
 * Access-token revocation (PRD E-01). An employee's `tokens_valid_after`
 * marks the instant before which every issued token is void — set on
 * deactivation, password change, password reset and "sign out everywhere".
 *
 * The middleware checks it on every request through a short in-process cache,
 * so revocation takes effect within VALID_AFTER_TTL_MS without a query per
 * request. Shared by the authenticate middleware and AuthService.
 */

const VALID_AFTER_TTL_MS = 30_000;
const cache = new Map(); // employee id → { after: ms|null, at }

/** Record a revocation immediately in this process (other pods follow within the TTL). */
function markRevoked(employeeId, at = Date.now()) {
  cache.set(String(employeeId), { after: at, at: Date.now() });
}

/**
 * Whether a decoded access token has been revoked. A deactivated employee's
 * tokens are always revoked. A database error fails open for this check only —
 * the token's signature and expiry still apply.
 */
async function isRevoked(prisma, decoded) {
  const id = decoded?.employee_id ?? decoded?.sub;
  if (!id || !decoded?.iat || typeof prisma?.employee?.findUnique !== 'function') return false;
  let hit = cache.get(String(id));
  if (!hit || Date.now() - hit.at > VALID_AFTER_TTL_MS) {
    const row = await prisma.employee.findUnique({ where: { employee_id: String(id) }, select: { tokens_valid_after: true, is_active: true } }).catch(() => undefined);
    if (row === undefined) return false;
    const after = !row || row.is_active === false ? Number.MAX_SAFE_INTEGER : (row.tokens_valid_after ? row.tokens_valid_after.getTime() : null);
    hit = { after, at: Date.now() };
    cache.set(String(id), hit);
  }
  // `iat` has whole-second precision: a token from the revocation's own second counts as before it.
  return hit.after != null && decoded.iat * 1000 < hit.after + 1000;
}

function _reset() { cache.clear(); }

module.exports = { isRevoked, markRevoked, _reset, VALID_AFTER_TTL_MS };
