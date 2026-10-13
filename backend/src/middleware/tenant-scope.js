'use strict';

const { AsyncLocalStorage } = require('node:async_hooks');

/**
 * Prisma Middleware for Multi-Tenant Row-Level Isolation
 *
 * Uses Node.js AsyncLocalStorage for request-scoped tenant context,
 * eliminating the race condition of a shared mutable property.
 *
 * Usage:
 *   tenantContext.run({ tenantId: 1 }, callback) — sets tenant for the request
 *   tenantContext.run({ tenantId: null }, callback) — bypass (platform admin)
 */

// ── Request-scoped tenant storage (safe for concurrent requests) ─────────
const tenantContext = new AsyncLocalStorage();

// Models that should NOT be tenant-filtered. Everything here either has no
// `tenant_id` column at all (Tenant, SubscriptionPlan, FeatureFlag,
// PlatformAuditLog, SystemAnnouncement, CarrierAdapterConfig) or is platform
// control-plane data whose callers filter the tenant explicitly.
// `tests/tenant-scope-coverage.test.js` asserts against the Prisma DMMF that
// every model outside this set carries a `tenant_id` column, so a new model
// cannot silently break scoped queries.
const GLOBAL_MODELS = new Set([
  'Tenant',
  'TenantConfig',
  'TenantUsage',
  'SubscriptionPlan',
  'FeatureFlag',
  'TenantFeatureOverride',
  'PlatformAuditLog',
  'SystemAnnouncement',
  'ImpersonationLog',
  'ApiRateLimit',
  'SecurityPolicy',
  'DataExportRequest',
  'CarrierAdapterConfig',
]);

// Models with a NULLABLE tenant_id where `null` means "system-wide row shared
// by every tenant" (system roles such as admin/manager/user). A scoped read
// must see the tenant's own rows AND the shared ones; a scoped create still
// stamps the tenant so a tenant admin cannot mint a system-wide row.
const SHARED_NULLABLE_MODELS = new Set(['Role']);

// Prisma actions that read/filter data
const READ_ACTIONS = new Set([
  'findFirst',
  'findFirstOrThrow',
  'findMany',
  'count',
  'aggregate',
  'groupBy',
]);

// Prisma actions that mutate with a WHERE clause
const WRITE_WITH_WHERE_ACTIONS = new Set([
  'update',
  'updateMany',
  'delete',
  'deleteMany',
  'upsert',
]);

// Prisma actions that create data
const CREATE_ACTIONS = new Set([
  'create',
  'createMany',
]);

/**
 * Get the current tenant ID from AsyncLocalStorage.
 * Returns null if no context is set (platform admin / startup / public route).
 */
function getTenantId() {
  const store = tenantContext.getStore();
  return store?.tenantId ?? null;
}

/**
 * Inject tenant_id into query args based on the operation type.
 * Pure helper — no Prisma dependency.
 */
function injectTenantScope(action, args, tenantId, { shared = false } = {}) {
  args = args || {};

  // ── READ operations: inject tenant_id into WHERE ─────────────────────
  if (READ_ACTIONS.has(action)) {
    args.where = args.where || {};
    if (shared) {
      // Own rows OR system rows, ANDed with whatever the caller asked for.
      // A caller that explicitly asked for `tenant_id: null` (system rows only)
      // keeps that narrower filter.
      if (args.where.tenant_id === undefined) {
        args.where = { AND: [args.where, { OR: [{ tenant_id: tenantId }, { tenant_id: null }] }] };
      } else if (args.where.tenant_id !== null) {
        args.where.tenant_id = tenantId;
      }
    } else {
      args.where.tenant_id = tenantId;
    }
  }

  // ── WRITE with WHERE: inject tenant_id into WHERE ────────────────────
  if (WRITE_WITH_WHERE_ACTIONS.has(action)) {
    if (action === 'upsert') {
      args.where = args.where || {};
      args.where.tenant_id = tenantId;
      if (args.create) {
        args.create.tenant_id = tenantId;
      }
    } else {
      args.where = args.where || {};
      args.where.tenant_id = tenantId;
    }
  }

  // ── CREATE operations: inject tenant_id into data ────────────────────
  if (CREATE_ACTIONS.has(action)) {
    if (action === 'createMany') {
      if (Array.isArray(args.data)) {
        args.data = args.data.map(d => ({
          ...d,
          tenant_id: tenantId,
        }));
      }
    } else {
      args.data = args.data || {};
      args.data.tenant_id = tenantId;
    }
  }

  return args;
}

/**
 * Apply the tenant-scoping Prisma extension.
 * Uses Prisma Client extensions ($extends) instead of the removed $use middleware.
 *
 * IMPORTANT: $extends returns a NEW client instance — the caller must use
 * the returned value.
 *
 * @param {import('@prisma/client').PrismaClient} prisma
 * @returns {import('@prisma/client').PrismaClient} extended prisma client
 */
function applyTenantMiddleware(prisma) {
  // Tenant context comes SOLELY from AsyncLocalStorage. On Node 18+/Fastify 5,
  // `enterWith()` set in the authenticate preHandler propagates reliably to the
  // route handler and stays isolated across concurrent requests (proven in
  // tests/tenant-als-propagation.test.js). The previous shared-instance
  // `_requestTenantId` fallback was therefore both unnecessary and unsafe (a
  // singleton mutated by every request could cross-scope concurrent requests),
  // and has been removed.
  return prisma.$extends({
    query: {
      $allOperations: async ({ model, operation, args, query }) => {
        const tenantId = getTenantId();

        // Skip if no tenant context (platform admin, startup, or unauthenticated)
        if (tenantId == null) return query(args);

        // Skip global models
        if (GLOBAL_MODELS.has(model)) return query(args);
        const shared = SHARED_NULLABLE_MODELS.has(model);

        // ── findUnique / findUniqueOrThrow — verify tenant ownership after fetch
        if (operation === 'findUnique' || operation === 'findUniqueOrThrow') {
          const result = await query(args);
          if (result && result.tenant_id !== undefined && result.tenant_id !== tenantId
              && !(shared && result.tenant_id === null)) {
            return null;
          }
          return result;
        }

        args = injectTenantScope(operation, args, tenantId, { shared });
        return query(args);
      },
    },
  });
}

/**
 * Wrap a Fastify route handler so it runs inside the caller's tenant context.
 *
 * `authenticate()` now installs the tenant context synchronously, so every
 * authenticated handler already runs scoped. This wrapper remains as a
 * belt-and-braces guard for route groups whose data is especially sensitive
 * (reporting, social): it re-enters the caller's tenant explicitly, so a future
 * change that reintroduces an `await` before `enterWith()` in the auth hook
 * cannot silently unscope them. Cheap — `AsyncLocalStorage.run` is a frame push.
 *
 * Platform-admin requests (no `tenant_id` on the token) run unscoped, exactly
 * as before.
 *
 * @template T
 * @param {(req: import('fastify').FastifyRequest, reply: import('fastify').FastifyReply) => T} handler
 * @returns {(req, reply) => T}
 */
function scopedHandler(handler) {
  return function scoped(req, reply) {
    const tenantId = req.user?.tenant_id ?? null;
    if (tenantId === null) return handler.call(this, req, reply);
    return tenantContext.run({ tenantId }, () => handler.call(this, req, reply));
  };
}

module.exports = {
  applyTenantMiddleware, tenantContext, getTenantId, scopedHandler, injectTenantScope,
  GLOBAL_MODELS, SHARED_NULLABLE_MODELS,
};
