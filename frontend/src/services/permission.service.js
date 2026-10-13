import api from './api';

/**
 * Permission service — frontend API calls for the builder permission panels.
 */

// ── Metadata entity permissions ──────────────────────────────────────────────

/**
 * Fetch all role permissions for a metadata entity.
 * Returns { entity_type, entity_id, permissions: [...], roles: [...] }
 */
export async function getEntityPermissions(entityType, entityId) {
  const res = await api.get(`/builder/permissions/${entityType}/${entityId}`);
  return res.data;
}

/**
 * Save permissions for a metadata entity.
 * @param {string} entityType  module | object | field | form | pipeline | wizard
 * @param {number} entityId
 * @param {Array<{role_name, can_view, can_edit}>} permissions
 */
export async function saveEntityPermissions(entityType, entityId, permissions) {
  const res = await api.put(`/builder/permissions/${entityType}/${entityId}`, { permissions });
  return res.data;
}

// ── Operational permissions ──────────────────────────────────────────────────

/**
 * Fetch all operational permissions (optionally filtered by entity_type).
 * Returns { permissions, defaults, merged }
 */
export async function getOperationalPermissions(entityType) {
  const params = entityType ? { entity_type: entityType } : {};
  const res    = await api.get('/builder/permissions/operational', { params });
  return res.data;
}

/**
 * Save an operational permission for a specific role + entity type.
 * @param {string} entityType  task | activity
 * @param {string} roleName
 * @param {{ view_scope, create_scope, edit_scope, delete_scope, assign_scope }} scopes
 */
export async function saveOperationalPermission(entityType, roleName, scopes) {
  const res = await api.put(
    `/builder/permissions/operational/${entityType}/${roleName}`,
    scopes,
  );
  return res.data;
}
