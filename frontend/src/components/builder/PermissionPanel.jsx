import { useState, useEffect, useCallback } from 'react';
import { Shield, Save, Loader2, Check, AlertCircle } from 'lucide-react';
import {
  getEntityPermissions,
  saveEntityPermissions,
  getOperationalPermissions,
  saveOperationalPermission,
} from '../../services/permission.service';

const SCOPE_OPTIONS = [
  { value: 'none',      label: 'None (no access)' },
  { value: 'own',       label: 'Own only' },
  { value: 'team',      label: 'Team (direct reports)' },
  { value: 'hierarchy', label: 'Hierarchy (all descendants)' },
  { value: 'all',       label: 'All records' },
];

const ASSIGN_SCOPE_OPTIONS = [
  { value: 'none',      label: 'Cannot assign' },
  { value: 'team',      label: 'Team members only' },
  { value: 'hierarchy', label: 'Hierarchy only' },
  { value: 'all',       label: 'Anyone' },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function ScopeSelect({ value, options, onChange, disabled }) {
  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      disabled={disabled}
      className="text-xs border border-gray-200 dark:border-white/10 rounded px-2 py-1 bg-white dark:bg-white/5 text-gray-700 dark:text-white/70 focus:outline-none focus:ring-1 focus:ring-primary-400 disabled:bg-gray-50 dark:disabled:bg-white/[0.02] disabled:text-gray-400 dark:disabled:text-white/20"
    >
      {options.map(o => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  );
}

// ── Entity Permission Panel ────────────────────────────────────────────────────

/**
 * Shows a role-by-role view/edit permission table for a metadata entity.
 *
 * Props:
 *   entityType  — 'module' | 'object' | 'field' | 'form' | 'pipeline' | 'wizard'
 *   entityId    — integer
 *   className   — optional extra class
 */
export function EntityPermissionPanel({ entityType, entityId, className = '' }) {
  const [data,    setData]    = useState(null);
  const [saving,  setSaving]  = useState(false);
  const [saved,   setSaved]   = useState(false);
  const [error,   setError]   = useState(null);
  const [local,   setLocal]   = useState({});    // { [role_name]: { can_view, can_edit } }

  useEffect(() => {
    if (!entityType || !entityId) return;
    setData(null);
    getEntityPermissions(entityType, entityId)
      .then(res => {
        setData(res.data);
        // Seed local state from DB rows, defaulting to can_view=true, can_edit=false
        const initial = {};
        for (const role of res.data.roles) {
          const existing = res.data.permissions.find(p => p.role_name === role.name);
          initial[role.name] = {
            can_view: existing ? existing.can_view : true,
            can_edit: existing ? existing.can_edit : false,
            view_scope: existing?.view_scope === 'all' ? 'all' : 'own',
          };
        }
        setLocal(initial);
      })
      .catch(e => setError(e?.response?.data?.error?.message ?? e.message));
  }, [entityType, entityId]);

  const toggle = useCallback((roleName, field) => {
    setLocal(prev => {
      const next = { ...prev[roleName] };
      next[field] = !next[field];
      // If hiding (can_view=false), also remove edit
      if (field === 'can_view' && !next.can_view) next.can_edit = false;
      // If granting edit, also ensure view
      if (field === 'can_edit' && next.can_edit) next.can_view = true;
      return { ...prev, [roleName]: next };
    });
    setSaved(false);
  }, []);

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const permissions = Object.entries(local).map(([role_name, p]) => ({
        role_name,
        can_view: p.can_view,
        can_edit: p.can_edit,
        ...(entityType === 'object' ? { view_scope: p.view_scope === 'all' ? 'all' : 'own' } : {}),
      }));
      await saveEntityPermissions(entityType, entityId, permissions);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (e) {
      setError(e?.response?.data?.error?.message ?? e.message);
    } finally {
      setSaving(false);
    }
  };

  if (!entityType || !entityId) {
    return (
      <div className={`text-sm text-gray-400 italic p-3 ${className}`}>
        Save the entity first to configure permissions.
      </div>
    );
  }

  if (!data) {
    if (error) {
      return (
        <div className={`flex items-start gap-2 p-3 bg-red-50 dark:bg-red-500/10 rounded text-xs text-red-600 dark:text-red-400 ${className}`}>
          <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
          {error}
        </div>
      );
    }
    return (
      <div className={`flex items-center gap-2 p-3 text-sm text-gray-500 ${className}`}>
        <Loader2 className="w-4 h-4 animate-spin" />
        Loading permissions…
      </div>
    );
  }

  // Roles at level <= 3 (platform_admin=1, super_admin=2, admin=3) always have full access — locked in the UI.
  // manager (4) and user (5) are configurable.
  const isAdminLocked = (role) => (role.level ?? 0) <= 3;

  return (
    <div className={`space-y-3 ${className}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-sm font-medium text-gray-700 dark:text-white/70">
          <Shield className="w-4 h-4 text-primary-500" />
          Role Permissions
        </div>
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-primary-600 text-on-primary rounded-md hover:bg-primary-700 disabled:opacity-60 transition"
        >
          {saving ? (
            <Loader2 className="w-3 h-3 animate-spin" />
          ) : saved ? (
            <Check className="w-3 h-3" />
          ) : (
            <Save className="w-3 h-3" />
          )}
          {saved ? 'Saved' : 'Save'}
        </button>
      </div>

      {error && (
        <div className="flex items-start gap-2 p-2 bg-red-50 dark:bg-red-500/10 rounded text-xs text-red-600 dark:text-red-400">
          <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
          {error}
        </div>
      )}

      <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-white/[0.07]">
        <table className="w-full text-xs">
          <thead className="bg-gray-50 dark:bg-white/[0.04]">
            <tr>
              <th className="px-3 py-2 text-left font-semibold text-gray-600 dark:text-white/50 w-full">Role</th>
              <th className="px-3 py-2 text-center font-semibold text-gray-600 dark:text-white/50 whitespace-nowrap">Can View</th>
              <th className="px-3 py-2 text-center font-semibold text-gray-600 dark:text-white/50 whitespace-nowrap">Can Edit</th>
              {entityType === 'object' && <th className="px-3 py-2 text-center font-semibold text-gray-600 dark:text-white/50 whitespace-nowrap" title="Which records of this object the role sees">Records</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-white/[0.05]">
            {data.roles.map(role => {
              const locked = isAdminLocked(role);
              const p      = local[role.name] ?? { can_view: true, can_edit: false };
              return (
                <tr key={role.name} className="hover:bg-gray-50 dark:hover:bg-white/[0.03]">
                  <td className="px-3 py-2 text-gray-700 dark:text-white/60">
                    {role.label}
                    {locked && (
                      <span className="ml-1.5 text-gray-400 dark:text-white/20 text-[10px]">(always full access)</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-center">
                    <input
                      type="checkbox"
                      checked={locked ? true : p.can_view}
                      disabled={locked}
                      onChange={() => toggle(role.name, 'can_view')}
                      className="accent-primary-600 cursor-pointer disabled:cursor-not-allowed"
                    />
                  </td>
                  <td className="px-3 py-2 text-center">
                    <input
                      type="checkbox"
                      checked={locked ? true : p.can_edit}
                      disabled={locked || (!locked && !p.can_view)}
                      onChange={() => toggle(role.name, 'can_edit')}
                      className="accent-primary-600 cursor-pointer disabled:cursor-not-allowed"
                    />
                  </td>
                  {entityType === 'object' && (
                    <td className="px-3 py-2 text-center">
                      <select
                        value={locked ? 'all' : p.view_scope ?? 'own'}
                        disabled={locked || !p.can_view}
                        onChange={(e) => { const v = e.target.value; setLocal((prev) => ({ ...prev, [role.name]: { ...prev[role.name], view_scope: v } })); setSaved(false); }}
                        className="rounded border border-gray-200 bg-white px-1 py-0.5 text-xs dark:border-white/10 dark:bg-white/5"
                        aria-label={`Records ${role.label} sees`}
                      >
                        <option value="own">Own &amp; team</option>
                        <option value="all">All</option>
                      </select>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="text-[10px] text-gray-400">
        Admins always have full access. Hiding an entity removes it from the UI for that role.
        Removing edit access makes it read-only.{entityType === 'object' && ' Records: “Own & team” — records the user created or owns (managers: their team’s); “All” — every record, within the user’s business units and barrier zones.'}
      </p>
    </div>
  );
}

// ── Operational Permission Panel ───────────────────────────────────────────────

/**
 * Shows scope-based permission dropdowns for tasks and activities.
 *
 * Props:
 *   entityType — 'task' | 'activity'
 *   className  — optional
 */
export function OperationalPermissionPanel({ entityType, className = '' }) {
  const [data,    setData]    = useState(null);
  const [local,   setLocal]   = useState({});    // { [roleName]: { view_scope, ... } }
  const [saving,  setSaving]  = useState({});    // { [roleName]: bool }
  const [saved,   setSaved]   = useState({});
  const [error,   setError]   = useState(null);

  useEffect(() => {
    if (!entityType) return;
    getOperationalPermissions(entityType)
      .then(res => {
        setData(res.data);
        // Seed local state from merged (which includes defaults for missing rows)
        const init = {};
        const mergedForType = res.data.merged?.[entityType] ?? {};
        for (const [roleName, perm] of Object.entries(mergedForType)) {
          init[roleName] = {
            view_scope:   perm.view_scope,
            create_scope: perm.create_scope,
            edit_scope:   perm.edit_scope,
            delete_scope: perm.delete_scope,
            assign_scope: perm.assign_scope,
          };
        }
        setLocal(init);
      })
      .catch(e => setError(e?.response?.data?.error?.message ?? e.message));
  }, [entityType]);

  const updateScope = useCallback((roleName, field, value) => {
    setLocal(prev => ({
      ...prev,
      [roleName]: { ...prev[roleName], [field]: value },
    }));
    setSaved(prev => ({ ...prev, [roleName]: false }));
  }, []);

  const saveRole = async (roleName) => {
    setSaving(prev => ({ ...prev, [roleName]: true }));
    setError(null);
    try {
      await saveOperationalPermission(entityType, roleName, local[roleName]);
      setSaved(prev => ({ ...prev, [roleName]: true }));
      setTimeout(() => setSaved(prev => ({ ...prev, [roleName]: false })), 2500);
    } catch (e) {
      setError(e?.response?.data?.error?.message ?? e.message);
    } finally {
      setSaving(prev => ({ ...prev, [roleName]: false }));
    }
  };

  if (!data) {
    if (error) {
      return (
        <div className={`flex items-start gap-2 p-3 bg-red-50 rounded text-xs text-red-600 ${className}`}>
          <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
          {error}
        </div>
      );
    }
    return (
      <div className={`flex items-center gap-2 p-3 text-sm text-gray-500 ${className}`}>
        <Loader2 className="w-4 h-4 animate-spin" />
        Loading permissions…
      </div>
    );
  }

  const roles = Object.keys(local);
  const roleLevelMap = Object.fromEntries((data.roles ?? []).map(r => [r.name, r.level]));
  // Information barriers bind every role, admins included, so the override is
  // granted per role and never implied by rank.
  const isOverride = entityType === 'barrier_override' || entityType === 'wall_crossing_decide';
  // Roles at level <= 3 are admin-tier and always have full access — locked in the UI.
  // An unknown level is not admin: never default a missing level to the top of the ladder.
  const isAdminLocked = (roleName) => {
    const level = roleLevelMap[roleName];
    return !isOverride && Number.isFinite(level) && level <= 3;
  };
  const TITLES = { task: 'Task', activity: 'Activity', record: 'Record', barrier_override: 'Information barrier override', wall_crossing_decide: 'Wall-crossing decisions' };

  return (
    <div className={`space-y-3 ${className}`}>
        <div className="flex items-center gap-1.5 text-sm font-medium text-gray-700 dark:text-white/70 mb-1">
        <Shield className="w-4 h-4 text-primary-500" />
        {TITLES[entityType] ?? entityType}{isOverride ? '' : ' Scope Permissions'}
      </div>
      {entityType === 'wall_crossing_decide' && (
        <p className="text-xs text-gray-500 dark:text-white/50">
          Roles ticked here review and decide wall-crossing requests in Tools → Access &amp; Barriers (Compliance). It
          does not let them see inside any barrier, and nobody can approve their own request.
        </p>
      )}
      {entityType === 'barrier_override' && (
        <p className="text-xs text-gray-500 dark:text-white/50">
          Roles ticked here see records inside every barrier zone (Compliance, MLRO). Administrators are bound by
          barriers unless ticked. Prefer zone membership or a time-bound wall-crossing (Tools → Access &amp; Barriers).
        </p>
      )}

      {error && (
        <div className="flex items-start gap-2 p-2 bg-red-50 rounded text-xs text-red-600">
          <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
          {error}
        </div>
      )}

      <div className="space-y-4">
        {roles.map(roleName => {
          const locked = isAdminLocked(roleName);
          const p = local[roleName] ?? {};
          return (
            <div key={roleName} className="border border-gray-200 dark:border-white/[0.07] rounded-lg p-3 bg-gray-50 dark:bg-white/[0.03]">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-gray-700 dark:text-white/70 capitalize">
                  {roleName.replace('_', ' ')}
                  {locked && <span className="ml-1.5 text-gray-400 dark:text-white/30 font-normal">(always full)</span>}
                </span>
                {!locked && (
                  <button
                    onClick={() => saveRole(roleName)}
                    disabled={saving[roleName]}
                    className="flex items-center gap-1 px-2 py-1 text-[10px] font-medium bg-primary-600 text-on-primary rounded hover:bg-primary-700 disabled:opacity-60 transition"
                  >
                    {saving[roleName] ? <Loader2 className="w-2.5 h-2.5 animate-spin" /> :
                      saved[roleName]  ? <Check className="w-2.5 h-2.5" /> :
                      <Save className="w-2.5 h-2.5" />}
                    {saved[roleName] ? 'Saved' : 'Save'}
                  </button>
                )}
              </div>
              {isOverride ? (
                <label className="flex items-center gap-2 text-[11px] text-gray-600 dark:text-white/50">
                  <input
                    type="checkbox"
                    checked={(p.view_scope ?? 'none') !== 'none'}
                    onChange={e => updateScope(roleName, 'view_scope', e.target.checked ? 'all' : 'none')}
                  />
                  Can see inside every barrier
                </label>
              ) : (
              <div className="grid grid-cols-2 gap-2">
                {['view', 'create', 'edit', 'delete'].map(action => (
                  <label key={action} className="flex items-center justify-between gap-2">
                    <span className="text-[11px] text-gray-600 dark:text-white/50 capitalize">{action}</span>
                    <ScopeSelect
                      value={locked ? 'all' : (p[`${action}_scope`] ?? 'own')}
                      options={SCOPE_OPTIONS}
                      disabled={locked}
                      onChange={v => updateScope(roleName, `${action}_scope`, v)}
                    />
                  </label>
                ))}
                <label className="flex items-center justify-between gap-2 col-span-2">
                  <span className="text-[11px] text-gray-600 dark:text-white/50">Assign to</span>
                  <ScopeSelect
                    value={locked ? 'all' : (p.assign_scope ?? 'none')}
                    options={ASSIGN_SCOPE_OPTIONS}
                    disabled={locked}
                    onChange={v => updateScope(roleName, 'assign_scope', v)}
                  />
                </label>
              </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Default export — combined panel ──────────────────────────────────────────

export default function PermissionPanel({ entityType, entityId, mode = 'entity', className = '' }) {
  if (mode === 'operational') {
    return <OperationalPermissionPanel entityType={entityType} className={className} />;
  }
  return <EntityPermissionPanel entityType={entityType} entityId={entityId} className={className} />;
}
