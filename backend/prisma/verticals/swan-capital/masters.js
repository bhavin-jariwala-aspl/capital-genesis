'use strict';

/**
 * SWAN Capital — organisation, access model and master data.
 * Rates and limits are as published in October 2026 (PRD §2.2) and must be
 * confirmed with SWAN; every value is an ordinary record editable under
 * Masters after install.
 */

const businessUnits = [
  { code: 'LND', name: 'Lending', legal_name: 'Swan Life Ltd (Loans business line)', regulator: 'Financial Services Commission', licence: 'FSC IS10000013', base_currency: 'MUR', config: { address: 'Swan Centre, 10 Intendance Street, Port Louis, Mauritius' } },
  { code: 'WLT', name: 'Wealth', legal_name: 'Swan Wealth Managers Ltd', regulator: 'Financial Services Commission', licence: 'FSC IX09000018 · CM12000023 · DF09000007', base_currency: 'MUR', config: { address: 'Swan Centre, 10 Intendance Street, Port Louis, Mauritius' } },
  { code: 'FND', name: 'Funds', legal_name: 'Swan Global Funds Ltd', regulator: 'Financial Services Commission', licence: 'FSC CI11000044', base_currency: 'MUR', config: { address: 'Swan Centre, 10 Intendance Street, Port Louis, Mauritius' } },
  { code: 'SEC', name: 'Securities', legal_name: 'Swan CMB Securities Ltd', regulator: 'Financial Services Commission', licence: 'FSC IP16000002', base_currency: 'MUR', config: { address: 'Swan Centre, 10 Intendance Street, Port Louis, Mauritius' } },
  { code: 'ADV', name: 'Corporate Advisory', legal_name: 'Swan Corporate Advisors Ltd', regulator: 'Financial Services Commission', licence: 'FSC IZ19000019', base_currency: 'MUR', config: { address: 'Swan Centre, 10 Intendance Street, Port Louis, Mauritius' } },
  { code: 'FX', name: 'Forex', legal_name: 'Swan Forex Ltd', regulator: 'Bank of Mauritius', licence: 'FX Dealer Licence No. 03', base_currency: 'MUR', config: { address: 'Swan Centre, 10 Intendance Street, Port Louis, Mauritius' } },
];

const barrierZones = [
  { code: 'ADV_PRIVATE', name: 'Advisory — private side', description: 'Advisory mandates and deal documents holding price-sensitive information (PRD CMP-FR-01). Public side (Securities, Wealth) must wall-cross to see them.' },
  { code: 'MLRO_STR', name: 'STR register', description: 'Suspicious transaction reports — the MLRO only ("no tipping off").' },
  { code: 'COMPLIANCE_ONLY', name: 'Compliance only', description: 'Watch-list entries, screening hits, personal-dealing requests and other Compliance-only records.' },
  { code: 'VIP_CLIENTS', name: 'VIP / sensitive clients', description: 'Parties flagged VIP (staff, PEPs, public figures, board members) — visible only to named users (C360-FR-10).' },
];

// Custom roles sit at the user (5) or manager (4) level of the frozen ladder.
const roles = [
  { name: 'rm', label: 'Relationship Manager', level: 5 },
  { name: 'loans_executive', label: 'Loans Executive', level: 5 },
  { name: 'credit_analyst', label: 'Credit Analyst', level: 5 },
  { name: 'loans_manager', label: 'Manager — Loans & Fixed Income', level: 4 },
  { name: 'credit_committee', label: 'Credit Committee Member', level: 4 },
  { name: 'board_credit_committee', label: 'Board Credit Committee Member', level: 4 },
  { name: 'portfolio_manager', label: 'Portfolio / Fund Manager', level: 5 },
  { name: 'trader', label: 'Trader', level: 5 },
  { name: 'corporate_advisor', label: 'Corporate Advisor', level: 5 },
  { name: 'fx_dealer', label: 'Forex Dealer', level: 5 },
  { name: 'compliance_officer', label: 'Compliance Officer', level: 5 },
  { name: 'mlro', label: 'MLRO', level: 5, description: 'Money Laundering Reporting Officer — sees inside every information barrier.' },
  { name: 'operations_checker', label: 'Operations (checker)', level: 5 },
  { name: 'coo', label: 'COO / Executive', level: 4 },
  { name: 'bu_head', label: 'Business Unit Head', level: 4 },
  { name: 'marketing', label: 'Marketing', level: 5 },
  { name: 'auditor', label: 'Read-only Auditor', level: 5 },
];

const operationalPermissions = [
  // Only the MLRO sees across every barrier; Compliance officers are members
  // of the zones they police (see staff), not a blanket override.
  { entity_type: 'barrier_override', role_name: 'mlro', view_scope: 'all', create_scope: 'none', edit_scope: 'none', delete_scope: 'none', assign_scope: 'none' },
  // Unmasked personal data (ID numbers, income) — everyone else sees it masked
  // and reveals it on click, each reveal audited (PRD X-08).
  ...['compliance_officer', 'mlro', 'credit_analyst', 'operations_checker'].map((role_name) => (
    { entity_type: 'view_pii', role_name, view_scope: 'all', create_scope: 'none', edit_scope: 'none', delete_scope: 'none', assign_scope: 'none' })),
];

// Demo staff. Ids are platform-unique; passwords are issued at install time.
const staff = [
  { employee_id: 'SWADMIN', employee_name: 'Kevin Lam', title: 'CRM Administrator', role: 'super_admin', email: 'crm.admin@swan-capital.demo' },
  { employee_id: 'SWCOO', employee_name: 'Anjali Gopee', title: 'Chief Operating Officer', role: 'coo', email: 'coo@swan-capital.demo', zones: ['VIP_CLIENTS'] },
  { employee_id: 'SWRM1', employee_name: 'Priya Ramdin', title: 'Relationship Manager', role: 'rm', email: 'rm1@swan-capital.demo', business_units: ['WLT', 'LND', 'FND'], manager: 'SWCOO' },
  { employee_id: 'SWLMGR', employee_name: 'Rajiv Doorgakant', title: 'Manager, Loans & Fixed Income', role: 'loans_manager', email: 'loans.manager@swan-capital.demo', business_units: ['LND'], manager: 'SWCOO' },
  { employee_id: 'SWLOAN1', employee_name: 'Sophie Lagesse', title: 'Loans Executive 1', role: 'loans_executive', email: 'loans1@swan-capital.demo', business_units: ['LND'], manager: 'SWLMGR' },
  { employee_id: 'SWLOAN2', employee_name: 'Yash Bholah', title: 'Loans Executive 2', role: 'loans_executive', email: 'loans2@swan-capital.demo', business_units: ['LND'], manager: 'SWLMGR' },
  { employee_id: 'SWCRED1', employee_name: 'Nadia Peerbux', title: 'Credit Analyst', role: 'credit_analyst', email: 'credit@swan-capital.demo', business_units: ['LND'], manager: 'SWLMGR' },
  { employee_id: 'SWCC1', employee_name: 'Jean-Marc Desvaux', title: 'Credit Committee Member', role: 'credit_committee', email: 'cc@swan-capital.demo', business_units: ['LND'] },
  { employee_id: 'SWOPS1', employee_name: 'Ritesh Seewoo', title: 'Operations Checker', role: 'operations_checker', email: 'ops@swan-capital.demo', business_units: ['LND', 'FND'] },
  { employee_id: 'SWPM1', employee_name: 'Laurent Koenig', title: 'Portfolio Manager', role: 'portfolio_manager', email: 'pm@swan-capital.demo', business_units: ['WLT', 'FND'], manager: 'SWCOO' },
  { employee_id: 'SWTRD1', employee_name: 'Arvind Ramsurrun', title: 'Trader', role: 'trader', email: 'trader@swan-capital.demo', business_units: ['SEC'] },
  { employee_id: 'SWADV1', employee_name: 'Camille Rivalland', title: 'Corporate Advisor', role: 'corporate_advisor', email: 'advisor@swan-capital.demo', business_units: ['ADV'], zones: ['ADV_PRIVATE'] },
  { employee_id: 'SWFX1', employee_name: 'Deepak Mungur', title: 'Forex Dealer', role: 'fx_dealer', email: 'fx@swan-capital.demo', business_units: ['FX'] },
  { employee_id: 'SWCOMP1', employee_name: 'Fatima Hossenbux', title: 'Compliance Officer', role: 'compliance_officer', email: 'compliance@swan-capital.demo', zones: ['ADV_PRIVATE', 'COMPLIANCE_ONLY'] },
  { employee_id: 'SWMLRO', employee_name: 'Olivier Maurel', title: 'MLRO', role: 'mlro', email: 'mlro@swan-capital.demo', zones: ['MLRO_STR', 'ADV_PRIVATE', 'COMPLIANCE_ONLY', 'VIP_CLIENTS'] },
  { employee_id: 'SWRM2', employee_name: 'Natasha Appadoo', title: 'Senior Relationship Manager', role: 'rm', email: 'rm2@swan-capital.demo', business_units: ['WLT', 'FND', 'SEC'], manager: 'SWCOO', zones: ['VIP_CLIENTS'] },
  { employee_id: 'SWRM3', employee_name: 'Bruno Chan', title: 'Relationship Manager (Corporate)', role: 'rm', email: 'rm3@swan-capital.demo', business_units: ['LND', 'FX'], manager: 'SWCOO' },
  { employee_id: 'SWPM2', employee_name: 'Vanessa Ah-Kee', title: 'Fund Manager', role: 'portfolio_manager', email: 'pm2@swan-capital.demo', business_units: ['FND'], manager: 'SWCOO' },
  { employee_id: 'SWADV2', employee_name: 'Ryan Pillay', title: 'Advisory Analyst', role: 'corporate_advisor', email: 'advisor2@swan-capital.demo', business_units: ['ADV'], zones: ['ADV_PRIVATE'] },
  { employee_id: 'SWBDH', employee_name: 'Shalini Ramtohul', title: 'Head of BD & Strategic Partnerships', role: 'bu_head', email: 'bd.head@swan-capital.demo', manager: 'SWCOO' },
  { employee_id: 'SWMKT1', employee_name: 'Emilie Fanchette', title: 'Marketing Executive', role: 'marketing', email: 'marketing@swan-capital.demo', manager: 'SWBDH' },
  { employee_id: 'SWAUD1', employee_name: 'Karim Joomun', title: 'Internal Auditor', role: 'auditor', email: 'audit@swan-capital.demo' },
];

const masterData = require('./master-data');
const demo = require('./demo');

module.exports = { businessUnits, barrierZones, roles, operationalPermissions, staff, masterData, demo };
