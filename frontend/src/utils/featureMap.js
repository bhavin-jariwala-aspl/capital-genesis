/**
 * Which plan feature each client route and navigation entry belongs to.
 *
 * Mirrors the server: `MODULE_FEATURE` in `routes/runtime` gates the
 * metadata-driven modules (the server already drops those from bootstrap, so
 * they never reach the sidebar), and `requireFeature()` gates the API. This
 * file covers the parts only the client knows about — the bespoke pages, the
 * tools, and the Builder sections — so a locked
 * feature is hidden from navigation and explained on direct navigation rather
 * than rendered and then refused.
 *
 * A route not listed here is not gated by plan. Keep this in step with the
 * catalogue in `backend/src/services/platform/feature-catalogue.js`.
 */

/** Human labels, for the locked-feature page. Kept short; the reason comes from the server. */
export const FEATURE_LABEL = {
  auto_workflows:     'Workflows',
  auto_assignment:    'Assignment rules',
  auto_lead_scoring:  'Lead scoring',
  auto_sla:           'SLA engine',
  analytics_reports:  'Report builder',
  analytics_forecast: 'Forecasting',
  eng_social:         'Social media',
  eng_push:           'Push notifications',
  docs_management:    'Document management',
  plat_integrations:  'Integrations & webhooks',
  plat_appearance:    'Appearance & branding',
  crm_import_export:  'Import & export',
};

/** Route prefix → feature key. Longest prefix wins. */
export const ROUTE_FEATURE = [
  ['/documents',               'docs_management'],
  ['/sla',                     'auto_sla'],
  ['/social-media',            'eng_social'],
  ['/reports',                 'analytics_reports'],
  ['/forecast',                'analytics_forecast'],
  ['/import',                  'crm_import_export'],
  ['/builder/workflow',        'auto_workflows'],
  ['/builder/assignment',      'auto_assignment'],
  ['/builder/lead-scoring',    'auto_lead_scoring'],
  ['/builder/sla',             'auto_sla'],
  ['/builder/integrations',    'plat_integrations'],
  ['/builder/integration-health', 'plat_integrations'],
  ['/builder/social-media',    'eng_social'],
  ['/builder/push-notifications', 'eng_push'],
  ['/builder/documents',       'docs_management'],
  ['/builder/appearance',      'plat_appearance'],
];

const SORTED = [...ROUTE_FEATURE].sort((a, b) => b[0].length - a[0].length);

/** The feature a path needs, or null when it is not plan-gated. */
export function featureForPath(pathname) {
  const path = String(pathname ?? '');
  const hit = SORTED.find(([prefix]) => path === prefix || path.startsWith(`${prefix}/`));
  return hit ? hit[1] : null;
}
