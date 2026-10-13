'use strict';

const { AuthorizationError } = require('../utils/errors');
const { ADMIN_THRESHOLD, MANAGER_THRESHOLD } = require('../middleware/authenticate');
const { roleLevelFor } = require('./role-level');

/**
 * Return default operational scopes for a given role level.
 * This replaces the old hardcoded-by-name map so any new role works
 * automatically based on its numeric level.
 *
 * Scope vocabulary:
 *   none      → no access at all
 *   own       → records created_by or assigned_to the viewer
 *   team      → own + direct reports (depth=1 in employee_hierarchy)
 *   hierarchy → own + all descendants at any depth
 *   all       → every record regardless of ownership
 */
function defaultPermsForLevel(level = 1) {
  if (level <= ADMIN_THRESHOLD) {
    return { view_scope: 'all', create_scope: 'all', edit_scope: 'all', delete_scope: 'all', assign_scope: 'all' };
  }
  if (level <= MANAGER_THRESHOLD) {
    return { view_scope: 'hierarchy', create_scope: 'own', edit_scope: 'hierarchy', delete_scope: 'own', assign_scope: 'team' };
  }
  return { view_scope: 'own', create_scope: 'own', edit_scope: 'own', delete_scope: 'own', assign_scope: 'none' };
}


/**
 * PermissionService — single source of truth for all permission logic.
 *
 * Two domains:
 *   1. UI/Metadata permissions  (UiPermission table)
 *      Controls which roles can view vs edit metadata entities
 *      (modules, objects, fields, forms, pipelines, wizards).
 *
 *   2. Operational permissions  (OperationalPermission table)
 *      Controls scope of access for tasks and activities
 *      (view_scope, create_scope, edit_scope, delete_scope, assign_scope).
 */
class PermissionService {
  /** @param {import('@prisma/client').PrismaClient} prisma */
  constructor(prisma) {
    this.db = prisma;
  }

  /** Is this role at or above the admin bar, for this tenant? */
  async #isAdmin(roleName, tenantId) {
    return (await roleLevelFor(this.db, roleName, tenantId)) <= ADMIN_THRESHOLD;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // UI / METADATA PERMISSIONS
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Get the effective view+edit permission for a single role on a metadata entity.
   * Falls back to sensible defaults when no explicit row exists.
   */
  async getEffectiveUiPermission(entityType, entityId, roleName, tenantId) {
    // Admins always have full unrestricted access — never need explicit rows.
    // The level comes from the tenant's own roles table (see services/role-level.js):
    // resolving it from the process-wide map here silently demoted every
    // custom tenant role after that map stopped absorbing tenant rows.
    if (await this.#isAdmin(roleName, tenantId)) {
      return { can_view: true, can_edit: true };
    }

    const perm = await this.db.uiPermission.findUnique({
      where: {
        entity_type_entity_id_role_name_tenant_id: {
          entity_type: entityType,
          entity_id:   entityId,
          role_name:   roleName,
          tenant_id:   tenantId,
        },
      },
    });

    // Explicit row wins
    if (perm) return { can_view: perm.can_view, can_edit: perm.can_edit };

    // Default: view-only when no explicit permission row exists (secure default)
    return { can_view: true, can_edit: false };
  }

  /**
   * Filter an array of metadata entities by the viewer's role.
   * - Entities hidden from the viewer's role (can_view=false) are removed.
   * - Each retained entity receives `_can_edit` — consumed by the frontend.
   *
   * @param {Array}  entities   Raw rows (each must have .id)
   * @param {string} entityType 'module' | 'object' | 'field' | etc.
   * @param {string} roleName
   * @returns {Array} Filtered entities with _can_edit set
   */
  async filterMetadataByRole(entities, entityType, roleName, tenantId) {
    if (!entities?.length) return [];

    // Admins see and can edit everything
    if (await this.#isAdmin(roleName, tenantId)) {
      return entities.map(e => ({ ...e, _can_edit: true }));
    }

    const entityIds = entities.map(e => e.id);
    const perms = await this.db.uiPermission.findMany({
      where: { entity_type: entityType, entity_id: { in: entityIds }, role_name: roleName, tenant_id: tenantId },
    });
    const permMap = Object.fromEntries(perms.map(p => [p.entity_id, p]));

    return entities
      .filter(e => {
        const p = permMap[e.id];
        return p ? p.can_view : true; // default: visible
      })
      .map(e => {
        const p = permMap[e.id];
        return { ...e, _can_edit: p ? p.can_edit : false }; // default: read-only
      });
  }

  /**
   * Get all explicit UiPermission rows for an entity (used by the builder panel).
   */
  async getEntityPermissions(entityType, entityId, tenantId) {
    return this.db.uiPermission.findMany({
      where: { entity_type: entityType, entity_id: entityId, tenant_id: tenantId },
      orderBy: { role_name: 'asc' },
    });
  }

  /**
   * Upsert permissions for multiple roles on a single entity.
   * @param {string} entityType
   * @param {number} entityId
   * @param {Array<{role_name, can_view, can_edit}>} permissions
   * @param {string} actorId — employee who made the change (for updated_by)
   */
  async setEntityPermissions(entityType, entityId, permissions, actorId, tenantId) {
    const results = [];
    for (const p of permissions) {
      // Record visibility applies to objects: 'all' or own/team (null).
      const scope = entityType === 'object' && p.view_scope !== undefined ? (p.view_scope === 'all' ? 'all' : null) : undefined;
      const result = await this.db.uiPermission.upsert({
        where: {
          entity_type_entity_id_role_name_tenant_id: {
            entity_type: entityType,
            entity_id:   entityId,
            role_name:   p.role_name,
            tenant_id:   tenantId,
          },
        },
        create: {
          entity_type: entityType,
          entity_id:   entityId,
          role_name:   p.role_name,
          can_view:    p.can_view  ?? true,
          can_edit:    p.can_edit  ?? false,
          ...(scope !== undefined ? { view_scope: scope } : {}),
          updated_by:  actorId ?? null,
          tenant_id:   tenantId,
        },
        update: {
          can_view:   p.can_view  ?? true,
          can_edit:   p.can_edit  ?? false,
          ...(scope !== undefined ? { view_scope: scope } : {}),
          updated_by: actorId ?? null,
        },
      });
      results.push(result);
    }
    return results;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // OPERATIONAL PERMISSIONS  (tasks / activities)
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Get the effective operational permission for a role.
   * DB entries override the hardcoded defaults.
   */
  async getOperationalPermission(entityType, roleName) {
    // findFirst (not findUnique): the composite unique key now includes
    // tenant_id, and the tenant-scope middleware injects tenant_id into the
    // where clause of read operations — so this stays correctly tenant-scoped.
    const perm = await this.db.operationalPermission.findFirst({
      where: { entity_type: entityType, role_name: roleName },
    });
    if (perm) return perm;
    // Defaults follow the role's real level. A custom `regional_manager` at
    // level 4 with no explicit row gets manager scopes, as it did before the
    // role map became system-only.
    return { ...defaultPermsForLevel(await roleLevelFor(this.db, roleName, perm?.tenant_id)) };
  }

  /**
   * Get all operational permissions for an entity type (builder UI).
   */
  async getAllOperationalPermissions(entityType) {
    return this.db.operationalPermission.findMany({
      where: entityType ? { entity_type: entityType } : {},
      orderBy: [{ entity_type: 'asc' }, { role_name: 'asc' }],
    });
  }

  /**
   * Upsert an operational permission for one role+entity_type.
   */
  async setOperationalPermission(entityType, roleName, scopes, actorId) {
    const allowed = ['none', 'own', 'team', 'hierarchy', 'all'];
    const allowedAssign = ['none', 'team', 'hierarchy', 'all'];
    if (scopes.view_scope   && !allowed.includes(scopes.view_scope))   throw new Error('Invalid view_scope');
    if (scopes.create_scope && !allowed.includes(scopes.create_scope)) throw new Error('Invalid create_scope');
    if (scopes.edit_scope   && !allowed.includes(scopes.edit_scope))   throw new Error('Invalid edit_scope');
    if (scopes.delete_scope && !allowed.includes(scopes.delete_scope)) throw new Error('Invalid delete_scope');
    if (scopes.assign_scope && !allowedAssign.includes(scopes.assign_scope)) throw new Error('Invalid assign_scope');

    // The composite unique key now includes tenant_id, which an upsert `where`
    // can't supply cleanly. Find-then-update/create instead: the tenant-scope
    // middleware injects tenant_id into the find (where) and create (data).
    const existing = await this.db.operationalPermission.findFirst({
      where: { entity_type: entityType, role_name: roleName },
    });
    if (existing) {
      return this.db.operationalPermission.update({
        where: { id: existing.id },
        data:  { ...scopes, updated_by: actorId ?? null },
      });
    }
    return this.db.operationalPermission.create({
      data: { entity_type: entityType, role_name: roleName, ...scopes, updated_by: actorId ?? null },
    });
  }

  /**
   * Check whether the viewer may perform `action` on a task/activity resource.
   *
   * @param {string} entityType 'task' | 'activity'
   * @param {string} action     'view' | 'create' | 'edit' | 'delete' | 'assign'
   * @param {object} viewer     JWT user ({ role, employee_id })
   * @param {object} ownerIds   { created_by, assigned_to } of the resource
   * @throws {AuthorizationError} when the scope does not cover the resource
   */
  async checkOperationalScope(entityType, action, viewer, ownerIds = {}) {
    const roleName = viewer.role;
    const viewerId = viewer.employee_id ?? viewer.employeeId;

    const perm = await this.getOperationalPermission(entityType, roleName);
    const scopeKey = action === 'assign' ? 'assign_scope' : `${action}_scope`;
    const scope = perm[scopeKey] ?? 'none';

    if (scope === 'none') {
      throw new AuthorizationError(
        `Your role (${roleName}) does not have ${action} permission for ${entityType}`,
      );
    }
    if (scope === 'all') return true;

    if (scope === 'own') {
      const isOwner =
        ownerIds.created_by === viewerId || ownerIds.assigned_to === viewerId;
      if (!isOwner) {
        throw new AuthorizationError(
          `You can only ${action} your own ${entityType}s`,
        );
      }
      return true;
    }

    if (scope === 'team') {
      const rows = await this.db.employeeHierarchy.findMany({
        where:  { ancestor_id: viewerId, depth: 1 },
        select: { descendant_id: true },
      });
      const teamIds = new Set([viewerId, ...rows.map(r => r.descendant_id)]);
      const inTeam =
        teamIds.has(ownerIds.created_by) || teamIds.has(ownerIds.assigned_to);
      if (!inTeam) {
        throw new AuthorizationError(
          `You can only ${action} your team's ${entityType}s`,
        );
      }
      return true;
    }

    if (scope === 'hierarchy') {
      const rows = await this.db.employeeHierarchy.findMany({
        where:  { ancestor_id: viewerId, depth: { gte: 0 } },
        select: { descendant_id: true },
      });
      const hierarchyIds = new Set(rows.map(r => r.descendant_id));
      const inHierarchy =
        hierarchyIds.has(ownerIds.created_by) ||
        hierarchyIds.has(ownerIds.assigned_to);
      if (!inHierarchy) {
        throw new AuthorizationError(
          `You can only ${action} ${entityType}s within your hierarchy`,
        );
      }
      return true;
    }

    return false;
  }

  /**
   * Build a Prisma WHERE clause that restricts a task/activity query to records
   * the viewer may see, based on their view_scope.
   * Returns `null` when view_scope='none' (caller should return empty list).
   */
  async buildViewScopeFilter(entityType, viewer) {
    const roleName = viewer.role;
    const viewerId = viewer.employee_id ?? viewer.employeeId;

    const perm  = await this.getOperationalPermission(entityType, roleName);
    const scope = perm.view_scope;

    if (scope === 'none') return null;          // no access
    if (scope === 'all')  return {};            // no filter

    if (scope === 'own') {
      return { OR: [{ created_by: viewerId }, { assigned_to: viewerId }] };
    }

    if (scope === 'team') {
      const rows = await this.db.employeeHierarchy.findMany({
        where:  { ancestor_id: viewerId, depth: 1 },
        select: { descendant_id: true },
      });
      const ids = [viewerId, ...rows.map(r => r.descendant_id)];
      return { OR: [{ created_by: { in: ids } }, { assigned_to: { in: ids } }] };
    }

    if (scope === 'hierarchy') {
      const rows = await this.db.employeeHierarchy.findMany({
        where:  { ancestor_id: viewerId, depth: { gte: 0 } },
        select: { descendant_id: true },
      });
      const ids = rows.map(r => r.descendant_id);
      return { OR: [{ created_by: { in: ids } }, { assigned_to: { in: ids } }] };
    }

    return {};
  }
}

module.exports = PermissionService;
module.exports.defaultPermsForLevel = defaultPermsForLevel;
