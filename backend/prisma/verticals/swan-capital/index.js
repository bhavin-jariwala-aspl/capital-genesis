'use strict';

/**
 * SWAN Capital Solutions — the financial-services vertical pack.
 *
 * Implements the PRD in docs/SWAN-CAPITAL/SWAN_Capital_CRM_PRD.md (Phase 0
 * platform foundations + Phase 1 MVP, with Phase 2 objects as foundations)
 * entirely as Builder metadata. Install with:
 *
 *   node scripts/install-vertical.js swan-capital --create-tenant [--demo]
 *
 * Everything installed is editable in the Builder afterwards.
 */

const modules = require('./modules');
const automation = require('./automation');
const content = require('./content');
const masters = require('./masters');

module.exports = {
  key: 'swan-capital',
  tenant: {
    name: 'SWAN Capital Solutions', slug: 'swan-capital', plan: 'enterprise', industry: 'finance',
    timezone: 'Indian/Mauritius', locale: 'en', max_users: 200,
    metadata: { vertical: 'swan-capital', base_currency: 'MUR', languages: ['en', 'fr'] },
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
  workflows: automation.workflows,
  assignmentRules: automation.assignmentRules,
  businessHours: automation.businessHours,
  slaPolicies: automation.slaPolicies,
  permissions: automation.permissions,
  masterData: masters.masterData,
  dashboards: content.dashboards,
  publicForms: content.publicForms,
  demo: masters.demo,
};
