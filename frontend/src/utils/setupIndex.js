/**
 * The configuration index — one searchable list of every place you can
 * configure something.
 *
 * ── Why ─────────────────────────────────────────────────────────────────────
 * Configuration is spread over three surfaces that do not know about each
 * other: the Builder (~20 pages behind a collapsed sidebar group with its own
 * local search), the Platform console (8 more, behind a different collapsed
 * group, visible only to a platform admin), and Settings. Finding "where do I
 * change the SLA calendar?" meant knowing which of the three owned it and
 * expanding the right group first. The Builder's existing search only filtered
 * the Builder, so it could never answer a question whose answer was in
 * Settings.
 *
 * Every serious admin console solves this with one keyboard-first finder —
 * Salesforce Setup's Quick Find, HubSpot's settings search, Zoho's setup
 * search, the Power Platform admin search. This is that: a flat index with
 * keywords, filtered in memory, opened with Cmd/Ctrl-K.
 *
 * ── Why a hand-written index rather than derived from the router ─────────────
 * A route knows its path and nothing else. What makes a finder useful is the
 * vocabulary the *user* brings — someone looking for "picklist" wants Modules &
 * Objects, someone typing "SSO" or "2FA" wants Security, "dedupe" wants
 * Assignment Rules. Those synonyms have to be written down, so they live here
 * next to the destination they serve. Keep them in mind when adding an entry:
 * the label is what we call it, `keywords` is what everyone else calls it.
 */

/** Which surface an entry belongs to, and who can see it. */
export const SETUP_AREAS = Object.freeze({
  builder:  { label: 'Builder',  requires: 'admin' },
  platform: { label: 'Platform', requires: 'platform' },
  settings: { label: 'Settings', requires: 'admin' },
  tools:    { label: 'Tools',    requires: 'any' },
});

/**
 * @typedef {object} SetupEntry
 * @property {string} to        route
 * @property {string} label     what we call it
 * @property {string} area      key of SETUP_AREAS
 * @property {string} [group]   sub-heading within the area
 * @property {string} [description] one line on what you do there
 * @property {string[]} [keywords]  what everyone else calls it
 */

/** @type {SetupEntry[]} */
export const SETUP_INDEX = [
  // ── Builder ▸ Configure ───────────────────────────────────────────────────
  { to: '/builder/modules', label: 'Modules & Objects', area: 'builder', group: 'Configure',
    description: 'Create objects, add fields, set picklists and layouts',
    keywords: ['field', 'fields', 'picklist', 'dropdown', 'custom object', 'schema', 'entity', 'column', 'metadata'] },
  { to: '/builder/appearance', label: 'Appearance Studio', area: 'builder', group: 'Configure',
    description: 'Theme, brand colour, logo, dark mode and the sign-in page',
    keywords: ['theme', 'branding', 'brand', 'logo', 'colour', 'color', 'dark mode', 'favicon', 'white label', 'css'] },
  { to: '/builder/form', label: 'Form Builder', area: 'builder', group: 'Configure',
    description: 'Arrange fields into create and edit forms',
    keywords: ['form', 'layout', 'required', 'validation', 'field order', 'sections'] },
  { to: '/builder/dashboard', label: 'Dashboard Builder', area: 'builder', group: 'Configure',
    description: 'Compose widget dashboards and pick charts',
    keywords: ['dashboard', 'widget', 'chart', 'kpi', 'tile', 'graph', 'analytics'] },
  { to: '/builder/pipeline', label: 'Pipeline Builder', area: 'builder', group: 'Configure',
    description: 'Define pipeline stages and conversion points',
    keywords: ['pipeline', 'stage', 'kanban', 'funnel', 'status', 'deal stage'] },
  { to: '/builder/wizard', label: 'Wizards', area: 'builder', group: 'Configure',
    description: 'Multi-step guided data capture',
    keywords: ['wizard', 'steps', 'guided', 'intake', 'multi-step'] },
  { to: '/builder/documents', label: 'Document Management', area: 'builder', group: 'Configure',
    description: 'Document categories, checklists and templates',
    keywords: ['document', 'file', 'category', 'checklist', 'attachment', 'upload', 'retention'] },

  // ── Builder ▸ Automate ────────────────────────────────────────────────────
  { to: '/builder/workflow', label: 'Workflows', area: 'builder', group: 'Automate',
    description: 'Trigger-based automation over records and stages',
    keywords: ['workflow', 'automation', 'trigger', 'rule', 'action', 'if then', 'approval'] },
  { to: '/builder/assignment', label: 'Assignment Rules', area: 'builder', group: 'Automate',
    description: 'Route new records to the right owner',
    keywords: ['assignment', 'routing', 'round robin', 'owner', 'lead routing', 'queue', 'distribute'] },
  { to: '/builder/lead-scoring', label: 'Lead Scoring Rules', area: 'builder', group: 'Automate',
    description: 'Score leads on demographics and behaviour',
    keywords: ['scoring', 'score', 'lead quality', 'grade', 'points', 'mql'] },
  { to: '/builder/sla', label: 'SLA Engine', area: 'builder', group: 'Automate',
    description: 'Response and resolution targets, calendars and escalation',
    keywords: ['sla', 'escalation', 'breach', 'business hours', 'calendar', 'response time', 'holiday', 'timer'] },

  // ── Builder ▸ Connect ─────────────────────────────────────────────────────
  { to: '/builder/integrations', label: 'Integrations', area: 'builder', group: 'Connect',
    description: 'Inbound and outbound integrations and webhooks',
    keywords: ['integration', 'webhook', 'api', 'connector', 'zapier', 'endpoint', 'secret'] },
  { to: '/builder/integration-health', label: 'Integration Health', area: 'builder', group: 'Connect',
    description: 'Delivery success, retries and failures',
    keywords: ['health', 'logs', 'retry', 'failure', 'delivery', 'monitoring', 'errors'] },
  { to: '/builder/email-templates', label: 'Email Templates', area: 'builder', group: 'Connect',
    description: 'Templated outbound email with merge fields',
    keywords: ['email', 'template', 'merge field', 'smtp', 'mail', 'signature', 'html email'] },
  { to: '/builder/social-media', label: 'Social Media Setup', area: 'builder', group: 'Connect',
    description: 'Connect accounts, routing rules and listening keywords',
    keywords: ['social', 'facebook', 'instagram', 'linkedin', 'whatsapp', 'oauth', 'publishing'] },
  { to: '/builder/push-notifications', label: 'Push Notifications', area: 'builder', group: 'Connect',
    description: 'Browser and device push',
    keywords: ['push', 'notification', 'alert', 'mobile', 'browser'] },

  // ── Builder ▸ Manage ──────────────────────────────────────────────────────
  { to: '/builder/permissions', label: 'Permissions', area: 'builder', group: 'Manage',
    description: 'Per-role view and edit access to metadata and records',
    keywords: ['permission', 'access', 'role access', 'visibility', 'sharing', 'scope', 'field level security'] },
  { to: '/builder/employees', label: 'Employees', area: 'builder', group: 'Manage',
    description: 'Add users, set roles and reporting lines',
    keywords: ['user', 'users', 'employee', 'staff', 'account', 'invite', 'deactivate', 'password'] },
  { to: '/builder/org-chart', label: 'Org Chart', area: 'builder', group: 'Manage',
    description: 'The reporting hierarchy, visually',
    keywords: ['org chart', 'hierarchy', 'reporting line', 'manager', 'team', 'structure'] },
  { to: '/builder/roles', label: 'Roles & Levels', area: 'builder', group: 'Manage',
    description: 'Create roles and set their authority level',
    keywords: ['role', 'level', 'seniority', 'admin', 'manager', 'custom role'] },

  // ── Platform console ──────────────────────────────────────────────────────
  { to: '/platform', label: 'Platform Dashboard', area: 'platform',
    description: 'Tenant, revenue and system-health overview',
    keywords: ['overview', 'health', 'metrics', 'mrr', 'status'] },
  { to: '/platform/tenants', label: 'Tenants', area: 'platform',
    description: 'Create workspaces, track setup, suspend and delete',
    keywords: ['tenant', 'workspace', 'customer', 'organisation', 'organization', 'onboard', 'provision', 'suspend', 'trial'] },
  { to: '/platform/plans', label: 'Subscription Plans', area: 'platform',
    description: 'Pricing tiers, limits and the features each one sells',
    keywords: ['plan', 'pricing', 'price', 'tier', 'billing', 'subscription', 'limits', 'quota', 'entitlement', 'feature'] },
  { to: '/platform/feature-flags', label: 'Feature Flags', area: 'platform',
    description: 'Gradual rollout and remote kill-switches',
    keywords: ['flag', 'rollout', 'beta', 'toggle', 'kill switch', 'experiment', 'feature'] },
  { to: '/platform/announcements', label: 'Announcements', area: 'platform',
    description: 'Banners and alerts pushed to every workspace',
    keywords: ['announcement', 'banner', 'broadcast', 'maintenance notice', 'message'] },
  { to: '/platform/analytics', label: 'Platform Analytics', area: 'platform',
    description: 'Growth, feature usage, revenue and churn',
    keywords: ['analytics', 'growth', 'churn', 'revenue', 'usage', 'mrr', 'arr', 'retention'] },
  { to: '/platform/security', label: 'Platform Security', area: 'platform',
    description: 'Password and session policy, rate limits, data exports',
    keywords: ['security', 'password policy', 'session', 'mfa', '2fa', 'sso', 'rate limit', 'gdpr', 'export', 'lockout'] },
  { to: '/platform/audit-log', label: 'Platform Audit Log', area: 'platform',
    description: 'Every platform-admin action, immutably recorded',
    keywords: ['audit', 'log', 'history', 'who changed', 'trail', 'compliance'] },

  // ── Settings & shared tools ───────────────────────────────────────────────
  { to: '/settings', label: 'Workspace Settings', area: 'settings',
    description: 'Currency, locale, date format, fiscal year and notifications',
    keywords: ['settings', 'currency', 'locale', 'language', 'timezone', 'date format', 'fiscal year', 'number format', 'preferences'] },
  { to: '/reports', label: 'Reports', area: 'tools',
    description: 'Build, schedule and share reports',
    keywords: ['report', 'export', 'csv', 'schedule', 'subscription', 'alert', 'saved report'] },
  { to: '/sla', label: 'SLA Board', area: 'tools',
    description: 'Live timers, at-risk and breached work',
    keywords: ['sla board', 'timer', 'breach', 'at risk', 'queue'] },
];

/** Can this viewer reach `entry`? */
function visibleTo(entry, { isAdmin, isPlatformAdmin }) {
  const requires = SETUP_AREAS[entry.area]?.requires ?? 'admin';
  if (requires === 'any') return true;
  if (requires === 'platform') return Boolean(isPlatformAdmin);
  return Boolean(isAdmin || isPlatformAdmin);
}

/** The entries this viewer may see, unfiltered by query. */
export function visibleSetupEntries({ isAdmin, isPlatformAdmin }) {
  return SETUP_INDEX.filter((e) => visibleTo(e, { isAdmin, isPlatformAdmin }));
}

/**
 * Rank one entry against a query. Higher is better; 0 means "no match".
 *
 * The weighting is what makes the finder feel right rather than merely
 * correct: an exact label match must beat a keyword match, and a label
 * *prefix* must beat a label substring, or typing "roles" surfaces
 * "Assignment Rules" above "Roles & Levels".
 */
export function scoreEntry(entry, query) {
  const q = query.trim().toLowerCase();
  if (!q) return 1;

  const label = entry.label.toLowerCase();
  if (label === q) return 100;
  if (label.startsWith(q)) return 80;

  // Match on a word boundary inside the label before falling back to anywhere.
  if (label.split(/\s+/).some((w) => w.startsWith(q))) return 60;
  if (label.includes(q)) return 40;

  for (const keyword of entry.keywords ?? []) {
    const k = keyword.toLowerCase();
    if (k === q) return 50;
    if (k.startsWith(q)) return 30;
    if (k.includes(q)) return 20;
  }

  if ((entry.description ?? '').toLowerCase().includes(q)) return 10;
  if ((entry.group ?? '').toLowerCase().includes(q)) return 5;
  return 0;
}

/**
 * Search the index for this viewer.
 *
 * @param {string} query
 * @param {{ isAdmin?: boolean, isPlatformAdmin?: boolean, limit?: number }} opts
 * @returns {SetupEntry[]} best first
 */
export function searchSetup(query, { isAdmin, isPlatformAdmin, limit = 12 } = {}) {
  const scored = visibleSetupEntries({ isAdmin, isPlatformAdmin })
    .map((entry) => ({ entry, score: scoreEntry(entry, query) }))
    .filter((x) => x.score > 0);

  scored.sort((a, b) => b.score - a.score || a.entry.label.localeCompare(b.entry.label));
  return scored.slice(0, limit).map((x) => x.entry);
}
