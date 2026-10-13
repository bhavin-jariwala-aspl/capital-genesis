'use strict';

/**
 * The feature catalogue — the closed vocabulary of things a plan can include.
 *
 * ── Why this file exists ────────────────────────────────────────────────────
 * There were two unrelated notions of "feature" in the platform, and neither
 * did anything:
 *
 *   - `subscription_plans.features` held free text: `['basic_crm',
 *     'email_templates', 'workflow_automation', ...]`. Nothing read the column,
 *     nothing validated it, and the plan editor had no field for it, so its
 *     only possible value was whatever `prisma/seed.js` wrote once.
 *   - `feature_flags.name` held a different, non-overlapping set:
 *     `underwriting_workflow`, `ai_underwriting`, `advanced_workflows`,
 *     `policy_analytics`, `api_v2`, `dark_mode`. `FeatureFlagService.isEnabled`
 *     resolved override -> rollout -> global default and **never consulted the
 *     plan**, so a flag in the `premium` category was not gated behind a paid
 *     plan at all, despite the admin guide saying it was.
 *
 * The two sets shared not one key, so "which features does this customer have?"
 * had no answer anywhere in the system.
 *
 * This catalogue is the single vocabulary both sides now speak. A plan's
 * `features` array must contain keys from here (validated on write), a feature
 * flag may name a key from here to add rollout control on top, and
 * `EntitlementService` resolves the two into one answer per tenant.
 *
 * ── Why a code catalogue rather than a table ─────────────────────────────────
 * A feature key is referenced by application code (`requireFeature('quotes')`),
 * so it is code, not data: a key that exists in a table but in no branch does
 * nothing, and a key a branch expects but no row defines fails silently. Keys
 * live here, next to the code that reads them; what each *customer* gets is
 * data, and lives in `subscription_plans.features` and
 * `tenant_feature_overrides`.
 *
 * Adding a feature: add an entry here, add it to the tiers that should include
 * it, and reference the key from the code that gates on it. Removing one: drop
 * the code branch first, then the entry — `tests/feature-catalogue.test.js`
 * checks that every plan tier references only live keys.
 */

/**
 * Plan tiers, cheapest first. `rank` is what makes "this feature needs
 * Professional or above" expressible and comparable.
 *
 * These names match `subscription_plans.name` and `tenants.plan`.
 */
const PLAN_TIERS = Object.freeze([
  { name: 'free',         label: 'Free',         rank: 0 },
  { name: 'starter',      label: 'Starter',      rank: 1 },
  { name: 'professional', label: 'Professional', rank: 2 },
  { name: 'enterprise',   label: 'Enterprise',   rank: 3 },
]);

const PLAN_RANK = Object.freeze(Object.fromEntries(PLAN_TIERS.map((t) => [t.name, t.rank])));

/**
 * Feature groups, in the order the console shows them. Grouping is what turns
 * a flat list of thirty toggles into something an operator can scan.
 */
const FEATURE_GROUPS = Object.freeze([
  { key: 'core',        label: 'Core CRM',        description: 'Records, pipelines and day-to-day selling' },
  { key: 'insurance',   label: 'Insurance',       description: 'Quoting, underwriting, policy administration and claims' },
  { key: 'automation',  label: 'Automation',      description: 'Workflows, assignment, scoring and service levels' },
  { key: 'analytics',   label: 'Analytics',       description: 'Reporting, dashboards and forecasting' },
  { key: 'engagement',  label: 'Engagement',      description: 'Email, social and notifications' },
  { key: 'documents',   label: 'Documents',       description: 'Document management, templates and e-signature' },
  { key: 'platform',    label: 'Platform',        description: 'Extensibility, integrations and administration' },
  { key: 'governance',  label: 'Security & governance', description: 'Access control, audit and compliance' },
]);

/**
 * One entry per feature.
 *
 * - `key`         — the identifier code gates on. Stable forever once shipped.
 * - `min_plan`    — the cheapest tier that includes it by default. This is what
 *                   generates each plan's feature set, so a new plan tier
 *                   inherits the right features without anyone editing lists.
 * - `flag`        — true when the feature also warrants a `feature_flags` row,
 *                   i.e. it is something we want to roll out gradually or kill
 *                   remotely, not merely sell. Most features do not.
 * - `core`        — always on, for every plan, and not switchable. Without this
 *                   an operator can revoke the product itself.
 * - `legacy`      — a `feature_flags.name` that already exists in deployed
 *                   databases and in code call sites, from before the catalogue.
 *                   Resolution accepts it as an alias so live rows and existing
 *                   `isEnabled('underwriting_workflow')` calls keep working
 *                   without a data migration against production. New code
 *                   should use the catalogue key.
 */
const FEATURES = Object.freeze([
  // ── Core CRM ────────────────────────────────────────────────────────────
  f('crm_records',        'Records & objects',        'core', 'free', { core: true,
    description: 'Leads, contacts, accounts, opportunities and cases — the metadata-driven record engine.' }),
  f('crm_pipelines',      'Pipelines & stages',       'core', 'free', {
    description: 'Kanban pipelines with stage automation hooks.' }),
  f('crm_import_export',  'Import & export',          'core', 'starter', {
    description: 'CSV import with column mapping, and record export.' }),
  f('crm_custom_objects', 'Custom objects & fields',  'core', 'professional', {
    description: 'Define new objects and fields in the Builder beyond the shipped catalogue.' }),
  f('crm_territories',    'Territories & quotas',     'core', 'professional', {
    description: 'Region and branch hierarchies with per-agent quota tracking.' }),

  // ── Insurance ───────────────────────────────────────────────────────────
  f('ins_quoting',        'Quoting & illustrations',  'insurance', 'starter', {
    description: 'Premium calculation, quote scenarios and comparison illustrations.' }),
  f('ins_policy_admin',   'Policy administration',    'insurance', 'starter', {
    description: 'Policy issuance, endorsements, renewals, billing schedules and invoices.' }),
  f('ins_underwriting',   'Underwriting workflow',    'insurance', 'professional', { flag: true, legacy: 'underwriting_workflow',
    description: 'Dedicated underwriting review queue with requirements and decisions. When off, agent submission is final and policies issue directly.' }),
  f('ins_claims',         'Claims management',        'insurance', 'professional', {
    description: 'Claim intake, reserves, adjustments and payment events.' }),
  f('ins_commissions',    'Commissions',              'insurance', 'professional', {
    description: 'Commission entries, splits and producer statements.' }),
  f('ins_carrier_feeds',  'Carrier rate feeds',       'insurance', 'enterprise', { flag: true,
    description: 'Live carrier rating adapters instead of local rate tables.' }),
  f('ins_ai_underwriting','AI risk assessment',       'insurance', 'enterprise', { flag: true, legacy: 'ai_underwriting',
    description: 'Model-assisted risk scoring and underwriting recommendations.' }),

  // ── Automation ──────────────────────────────────────────────────────────
  f('auto_workflows',     'Workflows',                'automation', 'starter', {
    description: 'Trigger-based automation over records and stages.' }),
  f('auto_approvals',     'Multi-step approvals',     'automation', 'professional', { flag: true, legacy: 'advanced_workflows',
    description: 'Branching approval chains with delegation and escalation.' }),
  f('auto_assignment',    'Assignment rules',         'automation', 'professional', {
    description: 'Round-robin, load-balanced and condition-based record routing.' }),
  f('auto_lead_scoring',  'Lead scoring',             'automation', 'professional', {
    description: 'Rule-based demographic and behavioural scoring.' }),
  f('auto_sla',           'SLA engine',               'automation', 'professional', {
    description: 'First-response and resolution timers with breach escalation.' }),

  // ── Analytics ───────────────────────────────────────────────────────────
  f('analytics_dashboards','Dashboards',              'analytics', 'free', {
    description: 'Widget dashboards over the analytics datasets.' }),
  f('analytics_reports',  'Report builder',           'analytics', 'starter', {
    description: 'Self-service reports with filters, grouping and exports.' }),
  f('analytics_scheduled','Scheduled reports & alerts','analytics', 'professional', {
    description: 'Email delivery on a schedule, with threshold alerts.' }),
  f('analytics_forecast', 'Forecasting',              'analytics', 'professional', {
    description: 'Pipeline-weighted revenue forecasting against quota.' }),
  f('analytics_ai_ask',   'Ask Genesis (AI reports)', 'analytics', 'enterprise', { flag: true,
    description: 'Natural-language report building on a local model.' }),
  f('analytics_policy',   'Policy portfolio analytics','analytics', 'professional', { flag: true, legacy: 'policy_analytics',
    description: 'In-force book analytics: persistency, lapse risk and exposure concentration.' }),

  // ── Engagement ──────────────────────────────────────────────────────────
  f('eng_email',          'Email & templates',        'engagement', 'free', {
    description: 'Templated outbound email with merge fields and send logging.' }),
  f('eng_social',         'Social media',             'engagement', 'professional', {
    description: 'Scheduled publishing, inbox routing and listening keywords.' }),
  f('eng_push',           'Push notifications',       'engagement', 'professional', {
    description: 'Browser and device push for assignments and breaches.' }),

  // ── Documents ───────────────────────────────────────────────────────────
  f('docs_management',    'Document management',      'documents', 'starter', {
    description: 'Folders, categories, versioning and checklists.' }),
  f('docs_templates',     'Document templates',       'documents', 'professional', {
    description: 'Merge-field document generation to PDF and HTML.' }),
  f('docs_esign',         'E-signature',              'documents', 'professional', {
    description: 'Signature requests with per-signatory tracking.' }),

  // ── Platform ────────────────────────────────────────────────────────────
  f('plat_api',           'REST API access',          'platform', 'professional', {
    description: 'Programmatic access with per-plan rate limits.' }),
  f('plat_integrations',  'Integrations & webhooks',  'platform', 'professional', {
    description: 'Inbound and outbound integrations with delivery health.' }),
  f('plat_appearance',    'Appearance & branding',     'platform', 'starter', {
    description: 'Theme, logo and pre-login branding for the workspace.' }),
  f('plat_api_v2',        'API v2',                   'platform', 'enterprise', { flag: true, legacy: 'api_v2',
    description: 'Next-generation API surface, in gradual rollout.' }),

  // ── Security & governance ───────────────────────────────────────────────
  f('gov_audit',          'Audit trail',              'governance', 'starter', {
    description: 'Per-record change history and actor attribution.' }),
  f('gov_permissions',    'Granular permissions',     'governance', 'professional', {
    description: 'Metadata and operational permissions per role.' }),
  f('gov_sso',            'SSO',                      'governance', 'enterprise', {
    description: 'Single sign-on against the customer identity provider.' }),
  f('gov_data_export',    'Data export & residency',  'governance', 'enterprise', {
    description: 'Full-tenant export requests for backup and GDPR.' }),
]);

/** Build one catalogue entry, keeping the list above readable. */
function f(key, label, group, minPlan, extra = {}) {
  return Object.freeze({
    key,
    label,
    group,
    min_plan: minPlan,
    flag: Boolean(extra.flag),
    core: Boolean(extra.core),
    legacy: extra.legacy ?? null,
    description: extra.description ?? '',
  });
}

const BY_KEY = Object.freeze(Object.fromEntries(FEATURES.map((x) => [x.key, x])));

/**
 * Pre-catalogue `feature_flags.name` values, mapped to their catalogue key.
 * Lets deployed rows and existing `isEnabled('underwriting_workflow')` call
 * sites resolve without a migration against a live database.
 */
const LEGACY_ALIASES = Object.freeze(Object.fromEntries(
  FEATURES.filter((x) => x.legacy).map((x) => [x.legacy, x.key]),
));

/** Every valid feature key. */
const FEATURE_KEYS = Object.freeze(FEATURES.map((x) => x.key));

/** Features that are always on and cannot be revoked. */
const CORE_FEATURE_KEYS = Object.freeze(FEATURES.filter((x) => x.core).map((x) => x.key));

/** Features that warrant a `feature_flags` row for rollout control. */
const FLAGGED_FEATURE_KEYS = Object.freeze(FEATURES.filter((x) => x.flag).map((x) => x.key));

/** The catalogue key for `key`, accepting a legacy flag name. Null if unknown. */
function canonicalKey(key) {
  if (Object.prototype.hasOwnProperty.call(BY_KEY, key)) return key;
  return LEGACY_ALIASES[key] ?? null;
}

/** A catalogue entry, or undefined. Accepts a legacy flag name. */
function getFeature(key) {
  const canonical = canonicalKey(key);
  return canonical ? BY_KEY[canonical] : undefined;
}

/** Is this a key the catalogue knows (or a legacy alias of one)? */
function isFeatureKey(key) {
  return canonicalKey(key) !== null;
}

/** The rank of a plan name, or -1 for a plan the catalogue does not rank. */
function planRank(planName) {
  return PLAN_RANK[planName] ?? -1;
}

/**
 * The features a plan includes by default, derived from `min_plan`.
 *
 * This is what makes the tiers coherent without anyone hand-maintaining four
 * overlapping lists: Professional automatically includes everything Starter
 * has, because inclusion is a rank comparison rather than a copied array.
 *
 * A plan the catalogue does not rank (a custom tier an operator created) gets
 * only the core features by default; the operator then picks the rest
 * explicitly, which is the honest behaviour — we cannot guess where an unranked
 * tier sits.
 */
function defaultFeaturesForPlan(planName) {
  const rank = planRank(planName);
  if (rank < 0) return [...CORE_FEATURE_KEYS];
  return FEATURES.filter((x) => planRank(x.min_plan) <= rank).map((x) => x.key);
}

/**
 * Keep only keys the catalogue knows, plus every core feature, de-duplicated
 * and in catalogue order.
 *
 * Order matters only for display, but a stable order means a plan's stored
 * array does not churn every time it is saved.
 */
function normaliseFeatureList(keys) {
  const given = (Array.isArray(keys) ? keys : []).map(canonicalKey).filter(Boolean);
  const wanted = new Set([...given, ...CORE_FEATURE_KEYS]);
  return FEATURE_KEYS.filter((k) => wanted.has(k));
}

/** Keys in `keys` that the catalogue does not know. */
function unknownFeatureKeys(keys) {
  return (Array.isArray(keys) ? keys : []).filter((k) => !isFeatureKey(k));
}

/**
 * Is this stored `features` array a curated list, or pre-catalogue junk?
 *
 * `subscription_plans.features` predates the catalogue and held free text
 * (`'basic_crm'`, `'workflow_automation'`, …) that matches no key and no legacy
 * alias. A list of those normalises to the core features alone — so treating
 * any non-empty array as authoritative made every deployed plan, Enterprise
 * included, sell exactly one feature. Every module, every insurance route and
 * most of the Builder vanished for tenants whose rows had never been re-saved.
 *
 * One recognisable key is enough to call it curated: no legacy name collides
 * with a catalogue key (every key carries a `crm_`/`ins_`/`auto_`/… prefix), so
 * a partial match means somebody edited the plan with the current editor and
 * their intent must be honoured. Zero recognisable keys means nobody has
 * touched it since the catalogue existed, and the tier default is the honest
 * reading.
 *
 * @param {unknown} features the stored column value
 * @returns {boolean} true when at least one entry is a key we understand
 */
function hasCuratedFeatures(features) {
  return Array.isArray(features) && features.some(isFeatureKey);
}

/**
 * The catalogue as the console consumes it: groups, each with its features, and
 * which plan tiers include each one.
 */
function catalogueForConsole() {
  return {
    plans: PLAN_TIERS,
    groups: FEATURE_GROUPS.map((g) => ({
      ...g,
      features: FEATURES.filter((x) => x.group === g.key).map((x) => ({
        ...x,
        included_in: PLAN_TIERS.filter((t) => t.rank >= planRank(x.min_plan)).map((t) => t.name),
      })),
    })),
  };
}

module.exports = {
  LEGACY_ALIASES,
  canonicalKey,
  PLAN_TIERS,
  PLAN_RANK,
  FEATURE_GROUPS,
  FEATURES,
  FEATURE_KEYS,
  CORE_FEATURE_KEYS,
  FLAGGED_FEATURE_KEYS,
  getFeature,
  isFeatureKey,
  planRank,
  defaultFeaturesForPlan,
  normaliseFeatureList,
  unknownFeatureKeys,
  hasCuratedFeatures,
  catalogueForConsole,
};
