'use strict';

/**
 * Genesis Capital — the financial-services vertical pack.
 *
 * Implements docs/genesis-capital/product-requirements.md — all 25 modules and
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
  // Workspace settings: amounts show in Mauritian rupees, dates day-first, and
  // the app is named for the workspace rather than the platform.
  settings: {
    'localization.currency': 'MUR',
    'localization.timezone': 'Indian/Mauritius',
    'localization.date_format': 'DD/MM/YYYY',
    'appearance.app_name': 'Genesis Capital',
    // Each desk lands on its own dashboard (user guide §1 "Your home page").
    'home.dashboards_by_role': [
      'rm:genesis_rm_workbench', 'bu_head:genesis_lead_funnel',
      'loans_executive:genesis_lending', 'loans_manager:genesis_lending', 'credit_analyst:genesis_lending',
      'credit_committee:genesis_lending', 'operations_checker:genesis_loan_book',
      'portfolio_manager:genesis_wealth', 'trader:genesis_securities', 'corporate_advisor:genesis_advisory',
      'fx_dealer:genesis_forex', 'marketing:genesis_marketing', 'compliance_officer:genesis_compliance',
      'mlro:genesis_compliance', 'auditor:genesis_regulatory', 'coo:genesis_group_executive',
    ].join(', '),
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
