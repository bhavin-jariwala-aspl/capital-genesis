'use strict';

const { ROLE_LEVEL, NO_ACCESS_LEVEL, resolveRoleLevel } = require('../middleware/authenticate');

/**
 * Resolve a role name to its authority level for the current tenant.
 *
 * ── Why this exists ─────────────────────────────────────────────────────────
 * The authorization hardening in September 2026 stopped `initRoleLevel` from
 * absorbing every tenant's `roles` rows into the process-wide `ROLE_LEVEL`
 * map — that map is per-process and role names are tenant-chosen, so one
 * tenant naming a role `admin` at level 7 had been moving the admin bar for
 * every other tenant. Correct, and necessary.
 *
 * But five call sites still resolved a role's level from that map with no
 * other source: the admin-bypass checks in `PermissionService` and
 * `MetadataService`, and the operational-scope defaults. A tenant's *custom*
 * role — a `regional_manager` at level 4, a `regional_admin` at level 3 —
 * used to be in the map (cross-tenant, but present) and now was not, so it
 * resolved to `NO_ACCESS_LEVEL`. The visible effect: a custom manager-level
 * role that relied on the default scopes dropped from `hierarchy` to `own`
 * overnight, and a custom admin-level role lost its admin bypass. A
 * regression introduced by the fix.
 *
 * The right source was always the tenant's own `roles` table. This resolver
 * reads it — the tenant-scope extension narrows the query to "my rows OR the
 * shared system rows" — and falls back to the built-in ladder, then to no
 * access, exactly as sign-in does. A short memo keeps it to one query per
 * (tenant, role) per {@link TTL_MS}, since these checks run on hot paths.
 *
 * `DashboardService` had grown its own private copy of this logic; it now
 * uses this one, so the three consumers cannot disagree.
 */

/** How long a resolved level is trusted before it is re-read. */
const TTL_MS = 30_000;

/** `${tenantId}:${roleName}` → { at, level } */
const memo = new Map();

/** Forget cached levels — all of them, or one tenant's. Call after a role edit. */
function invalidateRoleLevels(tenantId) {
  if (tenantId == null) { memo.clear(); return; }
  const prefix = `${Number(tenantId)}:`;
  for (const key of memo.keys()) if (key.startsWith(prefix)) memo.delete(key);
}

/**
 * @param {import('@prisma/client').PrismaClient} prisma tenant-scope-extended client
 * @param {string|null|undefined} roleName
 * @param {number|null|undefined} tenantId used only to key the memo; the read
 *        itself is scoped by the extension
 * @returns {Promise<number>} the level, or NO_ACCESS_LEVEL when it cannot be placed
 */
async function roleLevelFor(prisma, roleName, tenantId) {
  if (!roleName) return NO_ACCESS_LEVEL;

  const key = `${Number(tenantId) || 0}:${roleName}`;
  const hit = memo.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.level;

  let level;
  try {
    // Tenant row first, then the shared system row — the same order sign-in
    // uses, so a tenant that overrides a built-in role's level sees the same
    // answer at every check.
    const row = await prisma.role.findFirst({
      where:  { name: roleName, is_active: true },
      select: { level: true, tenant_id: true },
      orderBy: { tenant_id: 'desc' }, // a tenant row (non-null) sorts above the system row (null)
    });
    level = resolveRoleLevel(roleName, row?.level);
  } catch {
    // A database error must not turn a permission check into a 500. The
    // built-in ladder covers every shipped role; an unknown custom role fails
    // closed. Nothing is cached, so the next check retries.
    return roleName in ROLE_LEVEL ? resolveRoleLevel(roleName, ROLE_LEVEL[roleName]) : NO_ACCESS_LEVEL;
  }

  memo.set(key, { at: Date.now(), level });
  return level;
}

/**
 * The level to enforce for a viewer object.
 *
 * Prefers the tenant's live `roles` row over the `role_level` claim on the
 * token, because the row is the truth and a token outlives a role edit. The
 * claim is the fallback for callers that hand us a viewer without a client.
 */
async function viewerLevel(prisma, viewer) {
  if (!viewer) return NO_ACCESS_LEVEL;
  if (prisma && viewer.role) return roleLevelFor(prisma, viewer.role, viewer.tenant_id);
  const claimed = viewer.role_level;
  return Number.isFinite(claimed) ? Number(claimed) : NO_ACCESS_LEVEL;
}

module.exports = { roleLevelFor, viewerLevel, invalidateRoleLevels, TTL_MS };
