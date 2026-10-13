import { Navigate, Outlet } from 'react-router-dom';
import { useAuthStore } from '../../store/authStore';

/**
 * Route guard by authority level.
 *
 * ── Why level, not name ─────────────────────────────────────────────────────
 * This used to test `roles.includes(employee.role)` — a name check. Roles are
 * tenant-defined, so a tenant's custom `regional_admin` at level 3 was turned
 * away from `/builder` here while the server's `requireAdmin` (which compares
 * levels) would have admitted it. The two guards disagreed, and the client was
 * the wrong one.
 *
 * `minLevel` is the most junior level admitted (lower = more senior, so
 * `minLevel={3}` admits admins and above). `roles` is still accepted for
 * callers that pass names, and resolves to the most permissive level among
 * them, so existing usages keep their meaning.
 */
const LEVEL_OF_NAME = { platform_admin: 1, super_admin: 2, admin: 3, manager: 4, user: 5 };

export default function ProtectedRoute({ roles, minLevel }) {
  const { token, employee } = useAuthStore();
  if (!token) return <Navigate to="/login" replace />;

  const required = minLevel ?? (roles?.length
    ? Math.max(...roles.map((r) => LEVEL_OF_NAME[r] ?? 0))
    : null);

  if (required != null) {
    const level = Number.isFinite(employee?.role_level)
      ? Number(employee.role_level)
      : (LEVEL_OF_NAME[employee?.role] ?? Infinity);
    if (level > required) return <Navigate to="/" replace />;
  }

  return <Outlet />;
}
