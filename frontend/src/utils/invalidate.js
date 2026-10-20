/**
 * Cache invalidation shared by every screen that changes records or metadata.
 *
 * The QueryClient keeps data fresh for 5 minutes and does not refetch on
 * window focus, so a key a mutation forgets stays wrong on screen. Keys are
 * invalidated by PREFIX: ids are strings in some keys and numbers in others,
 * and a save on one object changes roll-ups, lookups and dashboards elsewhere.
 * Only queries that are mounted refetch; the rest are marked stale.
 */
import { useMetadataStore } from '../store/metadataStore';
import { runtimeService } from '../services/metadata.service';

// Everything a record write can change, on this record or on others.
const RECORD_KEYS = [
  ['runtime-records'],        // every object's list (parent roll-up columns too)
  ['runtime-record'],         // single records, String or Number ids
  ['related'],
  ['audit'],
  ['status-events'],
  ['activities'],
  ['tasks'],
  ['lookup-label'],
  ['lookup-search'],
  ['widget-data'],
  ['runtime-dashboard'],
  ['report-run'],
  ['forecast'],
  ['approvals'],
  ['records-trash'],
  ['lead-score-distribution'],
  ['lead-score-analytics'],
  ['lead-score-top'],
  ['portal-list'],
  ['sla-dashboard'],
];

// What server workflows (run after the response is sent) usually change.
const AUTOMATION_KEYS = [
  ['runtime-records'],
  ['runtime-record'],
  ['related'],
  ['activities'],
  ['status-events'],
];

const AUTOMATION_DELAY_MS = 1800;
let automationTimer = null;

/**
 * Invalidate every query a record create/update/delete/restore can affect.
 * The optional `{ recordId, objectId }` scope documents the call site only:
 * the prefixes already cover every object and record. A second, delayed pass
 * picks up what fire-and-forget workflows wrote after the save returned (a
 * burst of saves shares one pass).
 */
export function invalidateRecordData(qc, _scope = {}) {
  if (!qc) return;
  for (const queryKey of RECORD_KEYS) qc.invalidateQueries({ queryKey });
  if (automationTimer) clearTimeout(automationTimer);
  automationTimer = setTimeout(() => {
    automationTimer = null;
    for (const queryKey of AUTOMATION_KEYS) qc.invalidateQueries({ queryKey });
  }, AUTOMATION_DELAY_MS);
}

// Runtime metadata the builders change: modules, objects, fields, forms,
// pipelines, wizards, dashboards, actions.
const METADATA_KEYS = [
  ['runtime-modules'],
  ['runtime-module'],
  ['runtime-object'],
  ['runtime-form'],
  ['forms'],
  ['runtime-pipeline'],
  ['runtime-wizards'],
  ['wizard'],
  ['runtime-dashboards'],
  ['runtime-dashboard'],
  ['record-actions'],
  ['import-fields'],
  ['template-fields'],
  ['metadata-objects-all'],
  ['meta-modules'],
];

/**
 * After a Builder save: invalidate runtime metadata queries and reload the
 * persisted MetadataStore, which runtime pages read before any query (it would
 * otherwise serve the old module/object/form/wizard for up to 30 minutes).
 * `reloadStore: false` skips the reload for metadata the store does not hold
 * (dashboards).
 */
export function invalidateMetadata(qc, { reloadStore = true } = {}) {
  if (qc) for (const queryKey of METADATA_KEYS) qc.invalidateQueries({ queryKey });
  if (!reloadStore) return Promise.resolve();
  const store = useMetadataStore.getState();
  return runtimeService.bootstrap()
    .then((result) => store.setBootstrapData(result?.data ?? result))
    // A failed reload must not keep serving the old cache: mark it stale so
    // pages fall back to their queries and the next bootstrap refills it.
    .catch(() => store.clearMetadata());
}
