'use strict';

const { AuthenticationError, AuthorizationError } = require('../utils/errors');
const { tenantContext } = require('./tenant-scope');
const { assertTenantUsable } = require('./tenant-lifecycle');
const CurrencyService = require('../services/currency.service');

/**
 * Fastify preHandler — verifies the JWT and attaches the user to the request.
 *
 * It also installs the request's tenant (and currency profile) in
 * AsyncLocalStorage so the Prisma tenant-scope extension and the synchronous
 * money formatters can read them anywhere downstream.
 *
 * ⚠️ This function must not `await` anything before `enterWith()`.
 *
 * `AsyncLocalStorage.enterWith()` binds the store to the async resource that is
 * executing *right now*. Called synchronously inside the hook, that resource is
 * Fastify's request lifecycle, which the route handler shares — so the store
 * propagates. Called after an `await`, it binds to the continuation promise's
 * own child resource, which Fastify discards when the hook resolves: the
 * handler then reads `null`, the Prisma extension skips scoping, and every
 * query runs unscoped. That was the state of the app for months (hardening
 * follow-up #1); the reporting and social routes worked around it with a
 * per-route `tenantContext.run` wrapper. `tests/authenticate-tenant-context.test.js`
 * exercises the real hook through Fastify to keep this invariant.
 *
 * Awaiting *after* `enterWith()` is fine — the store is bound by then — which
 * is where the tenant-lifecycle gate runs.
 *
 * Usage: fastify.addHook('preHandler', authenticate)
 *   or per-route: { preHandler: [authenticate] }
 */
async function authenticate(request) {
  const token = extractBearerToken(request);
  if (!token) throw new AuthenticationError('Authentication required');

  let decoded;
  try {
    // Synchronous verify (no callback) — keeps us on the request's async resource.
    decoded = request.server.jwt.verify(token);
  } catch {
    throw new AuthenticationError('Invalid or expired token');
  }
  request.user = decoded;

  if (decoded?.tenant_id) {
    tenantContext.enterWith({ tenantId: decoded.tenant_id });
    enterCurrencyContext(request, decoded.tenant_id);
    // Suspended / cancelled / deleted / expired-trial workspaces stop here,
    // so revoking access does not wait for every issued token to expire.
    await assertTenantUsable(request.server?.prisma, decoded.tenant_id);
  }
}

/** `Authorization: Bearer <token>` — the only credential carrier the API accepts. */
function extractBearerToken(request) {
  const header = request.headers?.authorization;
  if (!header || typeof header !== 'string') return null;
  const [scheme, token] = header.split(' ');
  if (!/^Bearer$/i.test(scheme) || !token) return null;
  return token.trim();
}

/**
 * Install the tenant's currency profile for the rest of this request.
 *
 * Money is formatted synchronously deep inside PDF templates and report
 * exports, so those call sites read the profile from AsyncLocalStorage rather
 * than receiving it as an argument. Doing it here — the one place the tenant
 * becomes known — means every authenticated code path is currency-correct
 * without touching individual routes.
 *
 * Like the tenant store above this must happen synchronously, so it can only
 * install a profile that is already memoised. On a cache miss it starts the
 * lookup in the background (the next request finds it) and this request's
 * formatters fall back to USD. `app.js` warms every tenant's profile at boot so
 * the miss is confined to a tenant created after startup or a just-expired TTL.
 */
function enterCurrencyContext(request, tenantId) {
  const prisma = request.server?.prisma;
  const cached = CurrencyService.peek(tenantId);
  if (cached) {
    CurrencyService.currencyContext.enterWith(cached);
    return;
  }
  if (prisma) new CurrencyService(prisma).getProfile(tenantId).catch(() => {});
}

/**
 * INVERTED level system — lower number = more powerful.
 *
 * Level 1 → platform_admin (system-wide, reserved)
 * Level 2 → super_admin (full tenant access)
 * Level 3 → admin (configure system)
 * Level 4 → manager (team/hierarchy scoped)
 * Level 5 → user (own records only)
 * Level 6+ → custom tenant roles (unlimited nesting)
 *
 * Comparison: userLevel <= threshold means "user has at least this access".
 *
 * ── Why the built-in ladder is frozen ───────────────────────────────────────
 * `ROLE_LEVEL` is a process-wide map hydrated from the `roles` table at boot,
 * and `roles` is tenant-scoped: any tenant may name a role whatever it likes.
 * The authorization gates used to derive their threshold from that same map
 * (`requireRole('admin')` → `ROLE_LEVEL['admin']`), so one tenant creating a
 * role literally called `admin` at level 7 moved the admin bar to 7 for *every*
 * tenant in the deployment — and a role called `platform_admin` at level 2
 * handed platform-console access to every level-2 user everywhere.
 *
 * So the ladder the gates compare against is a frozen constant that no row can
 * touch, and `ROLE_LEVEL` (still used as a best-effort name→level hint when a
 * token predates `role_level`) only ever absorbs *system* roles — rows with
 * `tenant_id = NULL` — and never overwrites a built-in name.
 */
const BUILTIN_ROLE_LEVEL = Object.freeze({
  platform_admin:    1,
  super_admin:       2,
  admin:             3,
  manager:           4,
  uw_manager:        4,   // same authority level as manager (team-scoped)
  user:              5,
  senior_underwriter:5,   // same authority level as user (own records)
  underwriter:       6,   // lowest — standard UW within binding limits
});

/** Best-effort name→level hints. Built-ins are authoritative and immutable. */
const ROLE_LEVEL = { ...BUILTIN_ROLE_LEVEL };

const NO_ACCESS_LEVEL             = 999;
const PLATFORM_ADMIN_THRESHOLD    = BUILTIN_ROLE_LEVEL.platform_admin; // 1
const ADMIN_THRESHOLD             = BUILTIN_ROLE_LEVEL.admin;          // 3
const MANAGER_THRESHOLD           = BUILTIN_ROLE_LEVEL.manager;        // 4

/**
 * The only role name allowed to hold level 1. Everything else is clamped to 2
 * or weaker by {@link resolveRoleLevel}, so a tenant-scoped row can never mint
 * platform authority.
 */
const PLATFORM_ADMIN_ROLE = 'platform_admin';

/**
 * Settle a user's authority level.
 *
 * Order: the level on the role row → the built-in ladder → no access. The old
 * code spelled the last step `?? 1`, i.e. *a role we cannot resolve is treated
 * as the most powerful role in the system*. Every freshly provisioned tenant
 * hit that path (its `roles` rows did not exist yet), so its first admin signed
 * in holding `role_level: 1` and could read the platform console — and every
 * other tenant's data with it. Unknown roles now fail closed.
 *
 * @param {string|null|undefined} roleName
 * @param {number|null|undefined} dbLevel level from the matched `roles` row
 * @returns {number} 1 only for the reserved platform role; otherwise >= 2
 */
function resolveRoleLevel(roleName, dbLevel) {
  const raw = Number.isFinite(dbLevel) ? Number(dbLevel)
    : (BUILTIN_ROLE_LEVEL[roleName] ?? NO_ACCESS_LEVEL);
  if (roleName === PLATFORM_ADMIN_ROLE) return raw;
  // A tenant role may not claim platform authority, whatever its row says.
  return Math.max(raw, BUILTIN_ROLE_LEVEL.super_admin);
}

/** The authority level to enforce for `request.user`, failing closed. */
function levelOf(user) {
  const claimed = user?.role_level;
  const level = Number.isFinite(claimed) ? Number(claimed)
    : (ROLE_LEVEL[user?.role] ?? NO_ACCESS_LEVEL);
  // A token may carry `role_level: 1`; only the reserved role may act on it.
  if (level <= PLATFORM_ADMIN_THRESHOLD && user?.role !== PLATFORM_ADMIN_ROLE) {
    return BUILTIN_ROLE_LEVEL.super_admin;
  }
  return level;
}

/**
 * Absorb custom SYSTEM roles (tenant_id = NULL) into the name→level hints.
 * Must be called once after Prisma is connected.
 *
 * Tenant-scoped rows are deliberately ignored: they are per-tenant by
 * definition and this map is per-process (see the note on ROLE_LEVEL).
 * Built-in names are never overwritten.
 *
 * @param {import('@prisma/client').PrismaClient} prisma
 */
async function initRoleLevel(prisma) {
  try {
    const rows = await prisma.role.findMany({
      where:  { is_active: true, tenant_id: null },
      select: { name: true, level: true },
    });
    for (const row of rows) {
      if (row.name in BUILTIN_ROLE_LEVEL) continue;
      ROLE_LEVEL[row.name] = row.level;
    }
  } catch (err) {
    // Non-fatal — static defaults remain in place
    console.warn('[auth] initRoleLevel failed, using static defaults:', err.message);
  }
}

/**
 * Require that the user's level is at least as powerful as `minRole`'s.
 * Lower level = more access. Level 1 (platform_admin) can access everything.
 *
 * `minRole` must be a built-in role name: the threshold comes from the frozen
 * ladder, never from the mutable hints map, so no tenant-authored row can move
 * one of these gates.
 */
function requireRole(minRole) {
  const targetLevel = BUILTIN_ROLE_LEVEL[minRole];
  if (targetLevel === undefined) {
    throw new Error(`requireRole: "${minRole}" is not a built-in role — gates may only use ${Object.keys(BUILTIN_ROLE_LEVEL).join(', ')}`);
  }
  return async function checkRole(request) {
    await authenticate(request);
    if (levelOf(request.user) > targetLevel) {
      throw new AuthorizationError(`Requires ${minRole} role or higher`);
    }
  };
}

/**
 * Restrict builder routes to admin/super_admin only (level <= 3).
 */
const requireAdmin = requireRole('admin');

/**
 * Restrict platform routes to the reserved platform_admin role.
 *
 * Belt-and-braces on top of `requireRole('platform_admin')`: the console is the
 * one place where a mistake is cross-tenant, so it also insists on the role
 * *name*. `levelOf` already refuses to honour level 1 for any other role.
 */
const requirePlatformAdmin = (function buildPlatformGate() {
  const byLevel = requireRole(PLATFORM_ADMIN_ROLE);
  return async function checkPlatformAdmin(request) {
    await byLevel(request);
    if (request.user?.role !== PLATFORM_ADMIN_ROLE) {
      throw new AuthorizationError('Requires platform_admin role or higher');
    }
  };
})();

module.exports = {
  authenticate,
  extractBearerToken,
  requireRole,
  requireAdmin,
  requirePlatformAdmin,
  resolveRoleLevel,
  levelOf,
  ROLE_LEVEL,
  BUILTIN_ROLE_LEVEL,
  NO_ACCESS_LEVEL,
  PLATFORM_ADMIN_ROLE,
  PLATFORM_ADMIN_THRESHOLD,
  ADMIN_THRESHOLD,
  MANAGER_THRESHOLD,
  initRoleLevel,
};
