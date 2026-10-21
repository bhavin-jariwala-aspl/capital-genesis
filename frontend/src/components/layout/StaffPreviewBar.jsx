import { useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { ArrowLeft, Eye, X } from 'lucide-react';
import { useAuthStore } from '../../store/authStore';
import { publicPage } from '../../utils/publicPages';

/**
 * Shown on a public page (/site/:slug, /portal/:slug) only to a signed-in staff
 * member of that same workspace — the "you are previewing" bar of Shopify or
 * HubSpot. It says what the page is and who sees it, and leads back to the CRM,
 * because these pages carry no CRM chrome and otherwise look like a dead end.
 * Visitors and clients never see it. Floating, so it does not shift the layout.
 */
export default function StaffPreviewBar({ pageKey, slug }) {
  const tenantSlug = useAuthStore((s) => (s.token ? s.employee?.tenant_slug : null));
  const [hidden, setHidden] = useState(false);
  const page = publicPage(pageKey);
  if (hidden || !page || !tenantSlug || tenantSlug !== slug) return null;

  return (
    <div role="status" className="fixed inset-x-0 bottom-4 z-50 flex justify-center px-4 pointer-events-none">
      <div className="pointer-events-auto flex max-w-full items-center gap-3 rounded-full bg-gray-900/90 py-1.5 pl-4 pr-1.5 text-sm text-white shadow-lg backdrop-blur">
        <Eye className="h-4 w-4 shrink-0 text-white/60" />
        <span className="min-w-0 truncate">
          <strong className="font-semibold">{page.label}</strong>
          <span className="hidden text-white/60 sm:inline"> · {page.audience}</span>
        </span>
        <Link to="/web-forms" className="inline-flex shrink-0 items-center gap-1 rounded-full bg-white/15 px-3 py-1 font-medium hover:bg-white/25">
          <ArrowLeft className="h-3.5 w-3.5" />Back to CRM
        </Link>
        <button type="button" onClick={() => setHidden(true)} className="shrink-0 rounded-full p-1 text-white/60 hover:bg-white/10 hover:text-white" aria-label="Hide preview bar">
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

/** /site and /portal with no workspace: a signed-in user means their own. */
export function OwnWorkspaceRedirect({ pageKey }) {
  const token = useAuthStore((s) => s.token);
  const slug = useAuthStore((s) => s.employee?.tenant_slug);
  if (token && slug) return <Navigate to={`/${pageKey}/${slug}`} replace />;
  // Signed out, or a platform admin with no workspace of their own.
  return <Navigate to={token ? '/' : '/login'} replace />;
}
