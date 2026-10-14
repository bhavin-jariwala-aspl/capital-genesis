'use strict';

/**
 * Genesis Capital — the financial-services vertical pack.
 *
 * Implements docs/GENESIS-CAPITAL/GENESIS_Capital_CRM_PRD.md — all 25 modules and
 * every product on genesis-capital.demo — entirely as Builder metadata. Install with:
 *
 *   node scripts/install-vertical.js genesis-capital --create-tenant [--demo]
 *
 * Everything installed is editable in the Builder afterwards.
 */

const modules = require('./modules');
const automation = require('./automation');
const content = require('./content-phase2');
const masters = require('./masters');
const phase2 = require('./automation-phase2');
const platformDemo = require('./demo-platform');

// Record visibility (view_scope). Relationship managers and loans executives
// work their own book; every other desk — credit, operations, compliance,
// portfolio and fund management, dealing, advisory, marketing, management and
// audit — sees all records of the objects it is granted, within its business
// units and barrier zones. Reference data (products, funds, rates, campaigns…)
// is visible to everyone who can view it.
const OWN_BOOK = new Set(['rm', 'loans_executive']);
const REFERENCE = new Set([
  'financial_product', 'product_routing', 'plr_rate', 'country', 'fx_rate', 'model_portfolio', 'kyc_risk_factor',
  'collateral_type', 'approval_matrix', 'service_catalogue', 'reason_code', 'fund', 'fund_share_class', 'nav_history',
  'fund_campaign', 'distribution_notice', 'research_publication', 'saac_decision', 'plr_change_event', 'campaign',
  'segment', 'marketing_event', 'introducer', 'client_group', 'restricted_list_entry',
]);
function withViewScope(perms) {
  const out = [];
  for (const p of perms) {
    if (!p.can_view) { out.push(p); continue; }
    const roles = [].concat(p.roles ?? p.role);
    if (REFERENCE.has(p.object)) { out.push({ ...p, roles, view_scope: 'all' }); continue; }
    const own = roles.filter((r) => OWN_BOOK.has(r));
    const wide = roles.filter((r) => !OWN_BOOK.has(r));
    if (own.length) out.push({ ...p, roles: own });
    if (wide.length) out.push({ ...p, roles: wide, view_scope: 'all' });
  }
  return out;
}

module.exports = {
  key: 'genesis-capital',
  tenant: {
    name: 'Genesis Capital', slug: 'genesis-capital', plan: 'enterprise', industry: 'finance',
    timezone: 'Indian/Mauritius', locale: 'en', max_users: 200,
    metadata: { vertical: 'genesis-capital', base_currency: 'MUR', languages: ['en', 'fr'] },
  },
  businessUnits: masters.businessUnits,
  barrierZones: masters.barrierZones,
  roles: masters.roles,
  operationalPermissions: masters.operationalPermissions,
  staff: masters.staff,
  modules,
  wizards: content.wizards,
  documentCategories: content.documentCategories,
  documentChecklists: content.documentChecklists,
  documentTemplates: content.documentTemplates,
  emailTemplates: content.emailTemplates,
  integrations: phase2.integrations,
  workflows: [...automation.workflows, ...phase2.workflows],
  assignmentRules: [...automation.assignmentRules, ...phase2.assignmentRules],
  businessHours: automation.businessHours,
  slaPolicies: [...automation.slaPolicies, ...phase2.slaPolicies],
  permissions: withViewScope([...automation.permissions, ...phase2.permissions]),
  masterData: masters.masterData,
  dashboards: content.dashboards,
  publicForms: content.publicForms,
  demo: masters.demo,
  platformDemo,
  referenceObjects: [...REFERENCE],
};
