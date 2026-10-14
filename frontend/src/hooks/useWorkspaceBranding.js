import { useEffect } from 'react';
import { useAppearanceStore } from '../store/appearanceStore';

/**
 * Public pages (client portal, website forms, shared documents, signing) wear
 * the theme of the workspace they belong to, as soon as it is known.
 */
export function useWorkspaceBranding(tenantId) {
  const wear = useAppearanceStore((s) => s.wearWorkspace);
  useEffect(() => {
    if (tenantId) wear(tenantId);
  }, [tenantId, wear]);
}
