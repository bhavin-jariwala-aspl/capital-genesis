'use strict';

const { ADMIN_THRESHOLD, ROLE_LEVEL } = require('../middleware/authenticate');

/**
 * Access scope — business-unit (legal entity) scope and information barriers.
 *
 * Two layers on top of the owner/hierarchy scope RecordService already applies:
 *
 *  1. **Business unit.** A record may belong to a business unit
 *     (`records.business_unit_id`). An employee with business-unit memberships
 *     sees records of those units plus records with no unit (group-level data
 *     such as a client's party record). An employee with no memberships, and any
 *     admin, is unrestricted — so tenants that never define a unit behave
 *     exactly as before.
 *
 *  2. **Information barrier.** A record may sit in a barrier zone
 *     (`records.barrier_zone_id`, e.g. advisory deals holding price-sensitive
 *     information). Only the zone's members — standing members or approved,
 *     unexpired wall-crossings — and roles granted the `barrier_override`
 *     operational permission (Compliance) can see it. Unlike the business-unit
 *     layer this applies to admins too: administering the CRM is not a reason
 *     to read inside information.
 *
 * Both layers are enforced where records are read (RecordService list/get/
 * bulk, related lists, lookups, search, object analytics), never only in the UI.
 *
 * Which unit and zone a record lands in is configured on the object
 * (`ui_objects.config`), so it is Builder data:
 *   business_unit_field  — name of a field holding a business-unit code
 *   barrier_zone         — zone code applied to every record of the object
 *   barrier_zone_field   — name of a field holding a zone code (overrides)
 */

const CACHE_TTL_MS = 30_000;
// One cache for every instance: route plugins each build their own service, and
// a membership change must reach all of them. Employee ids are platform-unique.
const CACHE = new Map();

class AccessScopeService {
  /** @param {import('@prisma/client').PrismaClient} prisma tenant-scoped client */
  constructor(prisma) {
    this.db = prisma;
    this.cache = CACHE;
  }

  /** Forget cached scopes (call after membership or permission changes). */
  invalidate(employeeId = null) {
    if (employeeId) this.cache.delete(String(employeeId));
    else this.cache.clear();
  }

  /**
   * The viewer's scope. `null` viewer (system/workflow context) is unrestricted.
   * @returns {Promise<{ unrestricted: boolean, buIds: number[]|null, zoneIds: number[], override: boolean }>}
   */
  async forViewer(viewer) {
    if (!viewer?.employee_id) return { unrestricted: true, buIds: null, zoneIds: [], override: true };
    const key = String(viewer.employee_id);
    const hit = this.cache.get(key);
    if (hit && hit.expires > Date.now()) return hit.scope;

    const level = viewer.role_level ?? ROLE_LEVEL[viewer.role] ?? 999;
    const now = new Date();
    const [units, zones, override] = await Promise.all([
      level <= ADMIN_THRESHOLD
        ? Promise.resolve(null)
        : this.#query('employeeBusinessUnit', 'findMany', { where: { employee_id: key }, select: { business_unit_id: true } }),
      this.#query('barrierMember', 'findMany', {
        where:  { employee_id: key, OR: [{ valid_to: null }, { valid_to: { gt: now } }] },
        select: { zone_id: true },
      }),
      this.#query('operationalPermission', 'findFirst', {
        where:  { entity_type: 'barrier_override', role_name: viewer.role, view_scope: { not: 'none' } },
        select: { id: true },
      }),
    ]);

    const buIds = units && units.length ? units.map((u) => u.business_unit_id) : null;
    const scope = {
      unrestricted: false,
      buIds,
      zoneIds: (zones ?? []).map((z) => z.zone_id),
      override: Boolean(override),
    };
    this.cache.set(key, { scope, expires: Date.now() + CACHE_TTL_MS });
    return scope;
  }

  /** Prisma `where` fragment for `records` rows; `{}` when nothing applies. */
  whereFor(scope) {
    if (!scope || scope.unrestricted) return {};
    const and = [];
    if (scope.buIds) and.push({ OR: [{ business_unit_id: null }, { business_unit_id: { in: scope.buIds } }] });
    if (!scope.override) {
      and.push(scope.zoneIds.length
        ? { OR: [{ barrier_zone_id: null }, { barrier_zone_id: { in: scope.zoneIds } }] }
        : { barrier_zone_id: null });
    }
    return and.length ? { AND: and } : {};
  }

  /** Can this scope see a record row (needs business_unit_id / barrier_zone_id)? */
  canSee(scope, record) {
    if (!scope || scope.unrestricted || !record) return true;
    const bu = record.business_unit_id ?? null;
    const zone = record.barrier_zone_id ?? null;
    if (scope.buIds && bu !== null && !scope.buIds.includes(bu)) return false;
    if (!scope.override && zone !== null && !scope.zoneIds.includes(zone)) return false;
    return true;
  }

  /**
   * Work out the business unit and barrier zone a record of `objectId` belongs
   * to from the object's config and the record's values. Returns only the keys
   * the object configures, so an unconfigured object never clears a column.
   */
  async stampFor(objectId, values = {}) {
    const obj = await this.#query('uiObject', 'findUnique', { where: { id: Number(objectId) }, select: { config: true } });
    const cfg = obj?.config ?? {};
    const out = {};
    if (cfg.business_unit_field && Object.prototype.hasOwnProperty.call(values, cfg.business_unit_field)) {
      const code = values[cfg.business_unit_field];
      out.business_unit_id = code ? await this.#idByCode('businessUnit', code) : null;
    }
    const zoneCode = (cfg.barrier_zone_field && values[cfg.barrier_zone_field]) || cfg.barrier_zone || null;
    if (zoneCode || cfg.barrier_zone_field) {
      if (zoneCode) out.barrier_zone_id = await this.#idByCode('barrierZone', zoneCode);
      else if (Object.prototype.hasOwnProperty.call(values, cfg.barrier_zone_field)) out.barrier_zone_id = null;
    }
    return out;
  }

  async #idByCode(model, code) {
    const row = await this.#query(model, 'findFirst', { where: { code: String(code) }, select: { id: true } });
    return row?.id ?? null;
  }

  // A client without the model (a unit-test double, a build predating the
  // migration) means "feature not in use" → null. A real query error is NOT
  // swallowed: treating it as "no memberships" would fail open on business
  // units, so it propagates and the request fails closed.
  async #query(model, method, args) {
    const delegate = this.db?.[model];
    if (!delegate || typeof delegate[method] !== 'function') return null;
    return delegate[method](args);
  }
}

module.exports = AccessScopeService;
