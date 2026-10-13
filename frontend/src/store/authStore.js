import { create } from 'zustand';
import { storageUtils } from '../utils/common';
import { useMetadataStore } from './metadataStore';
import { useEntityStore } from './entityStore';

const TOKEN_KEY = 'genesis_token';
const EMPLOYEE_KEY = 'genesis_employee';
const REFRESH_KEY = 'genesis_refresh';

/**
 * "Remember me" controls where the session is persisted:
 *   • checked   → localStorage  (survives closing the browser)
 *   • unchecked → sessionStorage (cleared when the tab/browser closes)
 * On startup we read from whichever store holds the session (local first).
 */
const readPersisted = (key) =>
  storageUtils.local.get(key) ?? storageUtils.session.get(key);

const clearPersisted = (key) => {
  storageUtils.local.remove(key);
  storageUtils.session.remove(key);
};

/**
 * Resolve a role predicate: use the numeric role_level when present, otherwise
 * fall back to matching the role name (legacy tokens without a level).
 */
const checkRole = (emp, levelPred, roles) =>
  emp?.role_level != null ? levelPred(emp.role_level) : roles.includes(emp?.role);

/**
 * Inverted level system — lower number = more powerful.
 * Level 1: platform_admin | Level 2: super_admin | Level 3: admin
 * Level 4: manager | Level 5: user | Level 6+: custom
 */
export const useAuthStore = create(
  (set, get) => ({
    token: readPersisted(TOKEN_KEY),
    employee: readPersisted(EMPLOYEE_KEY),
    refreshToken: readPersisted(REFRESH_KEY),

    setAuth: (token, employee, remember = true, refreshToken = null) => {
      set({ token, employee, refreshToken });
      // Persist to the chosen store and clear the other so no stale copy lingers.
      const store = remember ? storageUtils.local : storageUtils.session;
      const other = remember ? storageUtils.session : storageUtils.local;
      store.set(TOKEN_KEY, token);
      store.set(EMPLOYEE_KEY, employee);
      if (refreshToken) store.set(REFRESH_KEY, refreshToken); else store.remove(REFRESH_KEY);
      other.remove(TOKEN_KEY);
      other.remove(EMPLOYEE_KEY);
      other.remove(REFRESH_KEY);
    },

    /** A refreshed session: new access + refresh token, same persistence choice. */
    setTokens: (token, refreshToken) => {
      set({ token, refreshToken });
      const store = storageUtils.local.get(TOKEN_KEY) != null ? storageUtils.local : storageUtils.session;
      store.set(TOKEN_KEY, token);
      if (refreshToken) store.set(REFRESH_KEY, refreshToken);
    },

    logout: () => {
      // End the server-side session too (best effort; the token may have expired).
      const { token, refreshToken } = get();
      if (token) {
        fetch('/api/auth/logout', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify(refreshToken ? { refresh_token: refreshToken } : {}),
          keepalive: true,
        }).catch(() => {});
      }
      set({ token: null, employee: null, refreshToken: null });
      clearPersisted(TOKEN_KEY);
      clearPersisted(EMPLOYEE_KEY);
      clearPersisted(REFRESH_KEY);
      // Clear cached metadata and entity data on logout
      useMetadataStore.getState().clearMetadata();
      useEntityStore.getState().clearAll();
      window.location.href = '/login';
    },

    isAuthenticated: () => {
      const { token } = get();
      return !!token;
    },

    // Role predicates — prefer the numeric role_level, falling back to the role
    // name for tokens issued before levels existed. `levelPred` tests the level;
    // `roles` is the equivalent set of role names for the fallback path.
    isAdmin:         () => checkRole(get().employee, (l) => l <= 3, ['platform_admin', 'super_admin', 'admin']),
    isSuperAdmin:    () => checkRole(get().employee, (l) => l <= 2, ['platform_admin', 'super_admin']),
    isPlatformAdmin: () => checkRole(get().employee, (l) => l <= 1, ['platform_admin']),
    isManager:       () => checkRole(get().employee, (l) => l === 4, ['manager']),
    isUser:          () => checkRole(get().employee, (l) => l >= 5, ['user']),

    getTenantId: () => {
      return get().employee?.tenant_id ?? null;
    },
  })
);
