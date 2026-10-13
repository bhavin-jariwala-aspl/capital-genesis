import { create } from 'zustand';

/**
 * EntityStore — in-memory store for entity records with optimistic updates.
 * React Query remains the sync engine; this store provides instant reads
 * and optimistic mutations so the UI feels immediate.
 */
export const useEntityStore = create((set, get) => ({
  // ── State ───────────────────────────────────────────────
  records:      {},   // Keyed by objectId → Record[]
  lastFetched:  {},   // Keyed by objectId → timestamp
  pendingOps:   [],   // Optimistic operations awaiting server confirmation

  // ── Queries ─────────────────────────────────────────────

  /** Get records for an object (instant from cache) */
  getRecords: (objectId) => get().records[objectId] ?? [],

  /** Get a single record by ID across all objects */
  getRecord: (recordId) => {
    for (const recs of Object.values(get().records)) {
      const found = recs.find(r => r.id === recordId || r.id === Number(recordId));
      if (found) return found;
    }
    return null;
  },

  /** Check if records for an object need refresh */
  needsRefresh: (objectId, maxAgeMs = 30_000) => {
    const fetched = get().lastFetched[objectId];
    if (!fetched) return true;
    return Date.now() - fetched > maxAgeMs;
  },

  // ── Mutations ───────────────────────────────────────────

  /** Set records from server response (replaces cache) */
  setRecords: (objectId, records) => {
    set((s) => ({
      records:     { ...s.records, [objectId]: records },
      lastFetched: { ...s.lastFetched, [objectId]: Date.now() },
    }));
  },

  /** Add a record optimistically (before server confirms) */
  addOptimisticRecord: (objectId, tempRecord) => {
    const tempId = tempRecord._tempId || `temp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const record = { ...tempRecord, id: tempId, _isOptimistic: true, _tempId: tempId };
    set((s) => ({
      records: {
        ...s.records,
        [objectId]: [record, ...(s.records[objectId] || [])],
      },
      pendingOps: [...s.pendingOps, { type: 'create', objectId, tempId }],
    }));
    return tempId;
  },

  /** Replace an optimistic record with the server-confirmed one */
  confirmOptimisticRecord: (objectId, tempId, serverRecord) => {
    set((s) => ({
      records: {
        ...s.records,
        [objectId]: (s.records[objectId] || []).map(r =>
          r._tempId === tempId ? { ...serverRecord, _isOptimistic: false } : r
        ),
      },
      pendingOps: s.pendingOps.filter(op => op.tempId !== tempId),
    }));
  },

  /** Remove a failed optimistic record */
  rollbackOptimisticRecord: (objectId, tempId) => {
    set((s) => ({
      records: {
        ...s.records,
        [objectId]: (s.records[objectId] || []).filter(r => r._tempId !== tempId),
      },
      pendingOps: s.pendingOps.filter(op => op.tempId !== tempId),
    }));
  },

  /** Update a record optimistically */
  updateOptimisticRecord: (objectId, recordId, patch) => {
    set((s) => ({
      records: {
        ...s.records,
        [objectId]: (s.records[objectId] || []).map(r =>
          (r.id === recordId || r.id === Number(recordId))
            ? { ...r, data: { ...r.data, ...patch }, _previousData: r.data }
            : r
        ),
      },
    }));
  },

  /** Rollback a failed optimistic update */
  rollbackOptimisticUpdate: (objectId, recordId) => {
    set((s) => ({
      records: {
        ...s.records,
        [objectId]: (s.records[objectId] || []).map(r => {
          if ((r.id === recordId || r.id === Number(recordId)) && r._previousData) {
            const { _previousData, ...rest } = r;
            return { ...rest, data: _previousData };
          }
          return r;
        }),
      },
    }));
  },

  /** Remove a record from local cache */
  removeRecord: (objectId, recordId) => {
    set((s) => ({
      records: {
        ...s.records,
        [objectId]: (s.records[objectId] || []).filter(r =>
          r.id !== recordId && r.id !== Number(recordId)
        ),
      },
    }));
  },

  /** Clear all entity records (e.g. on logout) */
  clearAll: () => set({ records: {}, lastFetched: {}, pendingOps: [] }),
}));
