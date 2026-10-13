import { useEffect, useCallback } from 'react';
import { useMetadataStore } from '../store/metadataStore';
import { useAuthStore } from '../store/authStore';
import { runtimeService } from '../services/metadata.service';

/**
 * useBootstrap — loads all UI metadata into MetadataStore on login / app start.
 *
 * Triggers on:
 *  - First mount when authenticated and store is empty or stale
 *  - Token change (login)
 *  - Manual refresh via returned `refresh` function
 *
 * Returns { syncing, syncError, refresh }
 */
export function useBootstrap() {
  const token  = useAuthStore((s) => s.token);
  const {
    isStale,
    syncing,
    syncError,
    setSyncing,
    setSyncError,
    setBootstrapData,
    clearMetadata,
    lastSyncedAt,
  } = useMetadataStore();

  const runBootstrap = useCallback(async () => {
    if (!token) return;
    if (syncing) return; // Prevent double-fire

    setSyncing(true);
    try {
      const result = await runtimeService.bootstrap();
      const payload = result?.data ?? result;
      setBootstrapData(payload);
    } catch (err) {
      setSyncError(err?.response?.data?.message ?? err?.message ?? 'Bootstrap failed');
    }
  }, [token, syncing, setSyncing, setSyncError, setBootstrapData]);

  // Auto-bootstrap on mount if stale or empty
  useEffect(() => {
    if (!token) {
      clearMetadata();
      return;
    }
    if (isStale()) {
      runBootstrap();
    }
  }, [token]); // eslint-disable-line react-hooks/exhaustive-deps

  // Background refresh every 30 minutes
  useEffect(() => {
    if (!token) return;
    const interval = setInterval(() => {
      if (isStale()) {
        runBootstrap();
      }
    }, 5 * 60 * 1000); // Check every 5 min

    return () => clearInterval(interval);
  }, [token]); // eslint-disable-line react-hooks/exhaustive-deps

  return {
    syncing,
    syncError,
    lastSyncedAt,
    refresh: runBootstrap,
  };
}
