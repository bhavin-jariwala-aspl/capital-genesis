'use strict';

/**
 * SWAN Capital — lending beyond the application itself: applicants, credit
 * conditions, offer scenarios, staged disbursements (M05), commercial lending
 * with facilities, financial spreading and covenants (M06), the collateral
 * register's links, valuations and margin calls (M07), and the loan servicing
 * view — LMS snapshots, PLR change management and collections lite (M08).
 *
 * The LMS stays the system of record (ADR-04): loan accounts here are synced
 * snapshots the CRM services from, never books it keeps.
 */

const { o, BUSINESS_UNITS, CURRENCIES, LOW_MED_HIGH } = require('./options');
const { helpers: { F, SEL, LK, FX, H, AUTO, LIST, EXPR, stage, showWhen } } = require('./objects');

const MUR = (field, label = 'Amount (MUR)') => FX(`${field}_mur`, label,
  `IF(ISBLANK(currency_code) OR currency_code = 'MUR', ${field}, ${field} * LOOKUP('fx_rate', 'currency_code', currency_code, 'rate_to_mur', 'rate_date'))`,
  { format: 'currency', precision: 2, list: true });

// ── Retail lending detail ────────────────────────────────────────────────────

const loanApplicant = {
  name: 'loan_applicant',
  label: 'Applicant',
  plural_label: 'Applicants & Guarantors',
  icon: 'UserPlus',
  description: 'Every borrower, co-borrower and guarantor on an application, with their income and obligations (LOAN-FR-01, LOAN-FR-05).',
  config: { title_field: 'name', business_unit_field: 'business_unit' },
  fields: [
    LK('loan_application', 'Application', 'loan_application', { required: true, config: { show_in_list: true } }),
    LK('party', 'Party', 'party', { required: true, config: { show_in_list: true } }),
    SEL('role', 'Role', o([['primary', 'Primary borrower'], ['co_borrower', 'Co-borrower'], ['guarantor', 'Guarantor']]), { required: true, config: { show_in_list: true } }),
    SEL('relationship', 'Relationship to primary', o([['self', 'Self'], ['spouse', 'Spouse'], ['parent', 'Parent'], ['child', 'Child'], ['business_partner', 'Business partner'], ['other', 'Other']])),
    SEL('employment_type', 'Employment', o([['salaried', 'Salaried'], ['self_employed', 'Self-employed'], ['retired', 'Retired']])),
    F('employer', 'Employer / business'),
    F('monthly_income', 'Net monthly income (MUR)', 'currency', { config: { pii: true } }),
    F('rental_income', 'Rental income (MUR / month)', 'currency'),
    F('existing_obligations', 'Existing repayments (MUR / month)', 'currency'),
    SEL('mcib_rating', 'MCIB credit report', o([['clean', 'Clean', '#10b981'], ['minor', 'Minor arrears', '#f59e0b'], ['adverse', 'Adverse', '#ef4444'], ['not_pulled', 'Not pulled']]), { default: 'not_pulled' }),
    F('mcib_pulled_on', 'MCIB pulled on', 'date'),
    F('signed_offer', 'Signed the offer', 'checkbox'),
    FX('applicant_age', 'Age', 'AGE(party.date_of_birth)'),
    FX('business_unit', 'Business unit', "'LND'", { type: 'string' }),
    FX('name', 'Applicant', "CONCAT(party.display_name, ' · ', role)", { type: 'string' }),
  ],
  forms: [{ name: 'loan_applicant_create', label: 'Add applicant', fields: ['loan_application', 'party', 'role', 'relationship', 'employment_type', 'employer', 'monthly_income', 'rental_income', 'existing_obligations', 'mcib_rating', 'mcib_pulled_on', 'signed_offer'] }],
};

const creditCondition = {
  name: 'credit_condition',
  label: 'Credit Condition',
  plural_label: 'Credit Conditions',
  icon: 'ListChecks',
  description: 'Conditions precedent and subsequent set at approval and tracked to satisfaction (LOAN-FR-08).',
  config: { title_field: 'condition', business_unit_field: 'business_unit' },
  fields: [
    LK('loan_application', 'Application', 'loan_application', LIST),
    LK('credit_facility', 'Commercial facility', 'credit_facility', LIST),
    SEL('condition_type', 'Type', o([['cp', 'Condition precedent'], ['cs', 'Condition subsequent'], ['covenant', 'Undertaking']]), { required: true, config: { show_in_list: true } }),
    F('condition', 'Condition', 'text', { required: true, config: { show_in_list: true } }),
    SEL('status', 'Status', o([['open', 'Open', '#f59e0b'], ['satisfied', 'Satisfied', '#10b981'], ['waived', 'Waived', '#64748b']]), { default: 'open', config: { show_in_list: true } }),
    F('due_date', 'Due by', 'date', LIST),
    F('satisfied_on', 'Satisfied on', 'date'),
    F('waiver_reason', 'Waiver reason', 'textarea', { validations: [EXPR("status = 'waived'", 'Only a waived condition has a waiver reason')] }),
    FX('business_unit', 'Business unit', "'LND'", { type: 'string' }),
  ],
  dependencies: showWhen('status', 'waived', ['waiver_reason']),
  forms: [{ name: 'credit_condition_create', label: 'Add condition', fields: ['loan_application', 'credit_facility', 'condition_type', 'status', { field: 'condition', span: 2 }, 'due_date', 'satisfied_on', { field: 'waiver_reason', span: 2 }] }],
};

const loanOffer = {
  name: 'loan_offer',
  label: 'Offer Scenario',
  plural_label: 'Offer Scenarios',
  icon: 'Calculator',
  description: 'Side-by-side offer scenarios — tenure vs instalment vs total interest — with the chosen one becoming the offer (LOAN-FR-04, LOAN-FR-03).',
  config: { title_field: 'name', business_unit_field: 'business_unit' },
  fields: [
    AUTO('offer_no', 'Offer No.', 'OF-'),
    LK('loan_application', 'Application', 'loan_application', { required: true, config: { show_in_list: true } }),
    F('scenario', 'Scenario', 'text', { required: true, config: { show_in_list: true }, placeholder: 'e.g. 20 years amortising' }),
    F('amount', 'Amount (MUR)', 'currency', { required: true, config: { show_in_list: true } }),
    F('tenure_months', 'Tenure (months)', 'integer', { required: true, config: { show_in_list: true } }),
    F('spread_override', 'Discretionary spread change (% pts)', 'decimal', { help: 'Needs the approval matrix\'s rate-override authority.' }),
    F('arrangement_fee_pct', 'Arrangement fee %', 'percent'),
    FX('plr', 'Swan PLR %', "LATEST('plr_rate', 'rate', 'effective_from')", { precision: 3 }),
    FX('margin', 'Product margin %', 'loan_application.margin', { precision: 3 }),
    FX('rate', 'Rate %', 'plr + margin + COALESCE(spread_override, 0)', { precision: 3, list: true }),
    FX('emi', 'Monthly instalment', 'PMT(rate / 1200, tenure_months, amount)', { format: 'currency', precision: 2, list: true }),
    FX('total_interest', 'Total interest', 'emi * tenure_months - amount', { format: 'currency', precision: 2, list: true }),
    FX('fees', 'Arrangement fee (MUR)', 'amount * COALESCE(arrangement_fee_pct, 0) / 100', { format: 'currency', precision: 2 }),
    F('selected', 'Selected for the offer letter', 'checkbox', LIST),
    F('valid_until', 'Valid until', 'date'),
    F('signed_on', 'Signed on', 'date'),
    FX('business_unit', 'Business unit', "'LND'", { type: 'string' }),
    FX('name', 'Scenario', "CONCAT(scenario, ' · ', rate, '%')", { type: 'string' }),
  ],
  forms: [{ name: 'loan_offer_create', label: 'Add scenario', fields: ['loan_application', 'scenario', 'amount', 'tenure_months', 'spread_override', 'arrangement_fee_pct', 'selected', 'valid_until', 'signed_on'] }],
};

const disbursement = {
  name: 'disbursement',
  label: 'Disbursement',
  plural_label: 'Disbursements',
  icon: 'Banknote',
  description: 'Single or staged disbursements (construction / renovation) with stage certificates, maker-checker and the LMS booking reference (LOAN-FR-12).',
  config: { title_field: 'name', business_unit_field: 'business_unit' },
  fields: [
    AUTO('disbursement_no', 'Disbursement No.', 'DB-'),
    LK('loan_application', 'Application', 'loan_application', LIST),
    LK('credit_facility', 'Commercial facility', 'credit_facility'),
    F('tranche_no', 'Tranche', 'integer', { required: true, default: '1', config: { show_in_list: true } }),
    F('amount', 'Amount (MUR)', 'currency', { required: true, config: { show_in_list: true } }),
    F('stage_certificate', 'Stage / architect certificate received', 'checkbox'),
    F('conditions_met', 'Conditions precedent met', 'checkbox'),
    F('maker', 'Requested by', 'text', { config: { always_disabled: true } }),
    F('checker', 'Authorised by', 'text', { config: { always_disabled: true } }),
    F('lms_reference', 'LMS booking reference', 'text', LIST),
    F('value_date', 'Value date', 'date', LIST),
    SEL('status', 'Status', o([['requested', 'Requested'], ['authorised', 'Authorised'], ['booked', 'Booked', '#10b981'], ['rejected', 'Rejected', '#ef4444']]), { default: 'requested', config: { show_in_list: true } }),
    FX('business_unit', 'Business unit', "'LND'", { type: 'string' }),
    FX('name', 'Disbursement', "CONCAT(COALESCE(loan_application.application_no, credit_facility.facility_no), ' · tranche ', tranche_no)", { type: 'string' }),
  ],
  forms: [{ name: 'disbursement_create', label: 'Request disbursement', fields: ['loan_application', 'credit_facility', 'tranche_no', 'amount', 'value_date', 'stage_certificate', 'conditions_met'] }],
  pipeline: {
    name: 'disbursement_flow', label: 'Disbursement',
    stages: [
      stage('requested', 'Requested', '#6366f1'),
      stage('checking', 'Checker review', '#f59e0b', { entry_rule: { expression: 'conditions_met', message: 'All conditions precedent must be met before a disbursement is checked.' } }),
      stage('sent_to_lms', 'Sent to LMS', '#8b5cf6'),
      stage('booked', 'Booked', '#10b981', { required_fields: ['lms_reference', 'value_date'] }),
      stage('rejected', 'Rejected', '#ef4444'),
    ],
  },
};

// ── Commercial lending ───────────────────────────────────────────────────────

const creditFacility = {
  name: 'credit_facility',
  label: 'Credit Facility',
  plural_label: 'Commercial Facilities',
  icon: 'Building2',
  description: 'RM-led corporate lending: facility structure, pricing, security package, credit memo and annual review (PRD M06).',
  config: { title_field: 'name', business_unit_field: 'business_unit' },
  fields: [
    AUTO('facility_no', 'Facility No.', 'CF-'),
    LK('borrower', 'Borrower', 'party', { required: true, config: { show_in_list: true } }),
    LK('borrower_group', 'Borrower group', 'client_group'),
    SEL('facility_type', 'Facility', o([['term_loan', 'Term loan'], ['refinancing', 'Refinancing'], ['revolving', 'Revolving / working capital'], ['bridge', 'Bridge'], ['overdraft', 'Overdraft line']]), { required: true, config: { show_in_list: true } }),
    F('tranche', 'Tranche / sub-limit', 'text'),
    F('amount', 'Amount', 'currency', { required: true }),
    SEL('currency_code', 'Currency', CURRENCIES, { default: 'MUR' }),
    F('purpose', 'Purpose', 'textarea', { required: true }),
    F('tenor_months', 'Tenor (months)', 'integer', { required: true }),
    F('margin', 'Margin over PLR (% pts)', 'decimal'),
    F('arrangement_fee_pct', 'Arrangement fee %', 'percent'),
    F('commitment_fee_pct', 'Commitment fee %', 'percent'),
    F('expiry_date', 'Facility expiry / review date', 'date', LIST),

    H('h_memo', 'Credit memo'),
    F('company_background', 'Company background & management', 'textarea'),
    F('swot', 'SWOT', 'textarea'),
    F('projections', 'Projections & key assumptions', 'textarea'),
    F('security_package', 'Security package', 'textarea'),
    F('recommendation', 'Recommendation', 'textarea'),
    SEL('risk_grade', 'Internal risk grade', o([['1', '1 — Excellent'], ['2', '2 — Strong'], ['3', '3 — Satisfactory'], ['4', '4 — Watch'], ['5', '5 — Substandard']]), LIST),

    H('h_calc', 'Analysis (calculated)'),
    MUR('amount'),
    FX('interest_rate', 'Interest rate %', "LATEST('plr_rate', 'rate', 'effective_from') + COALESCE(margin, 0)", { precision: 3 }),
    FX('dscr', 'DSCR (latest year)', "LOOKUP('financial_spread', 'credit_facility', id, 'dscr', 'period_end')", { precision: 2, list: true }),
    FX('leverage', 'Net debt / EBITDA', "LOOKUP('financial_spread', 'credit_facility', id, 'net_debt_to_ebitda', 'period_end')", { precision: 2 }),
    FX('group_exposure_mur', 'Group exposure (MUR)', "IF(ISBLANK(borrower_group), amount_mur, SUM_RELATED_GROUP)", { format: 'currency', precision: 2 }),
    FX('covenants_breached', 'Covenants in breach', "COUNT_RELATED('covenant_test', 'credit_facility', 'result', 'breach')", LIST),
    FX('days_to_review', 'Days to annual review', 'IF(ISBLANK(expiry_date), null, DAYS_BETWEEN(TODAY(), expiry_date))'),
    F('renewal_opened', 'Renewal opened', 'checkbox', { config: { always_disabled: true } }),
    SEL('credit_decision', 'Credit decision', o([['approved', 'Approved', '#10b981'], ['declined', 'Declined', '#ef4444']]), { config: { always_disabled: true } }),
    FX('approval_level', 'Approval authority', "IF(amount_mur <= 5000000, 'Loans Manager', IF(amount_mur <= 20000000, 'Credit Committee', 'Board Credit Committee'))", { type: 'string' }),
    FX('business_unit', 'Business unit', "'LND'", { type: 'string' }),
    FX('name', 'Facility', "CONCAT(borrower.display_name, ' · ', facility_type)", { type: 'string' }),
  ],
  forms: [
    { name: 'credit_facility_create', label: 'New facility', fields: ['borrower', 'borrower_group', 'facility_type', 'tranche', 'amount', 'currency_code', 'tenor_months', 'margin', 'arrangement_fee_pct', 'commitment_fee_pct', 'expiry_date', { field: 'purpose', span: 2 }] },
    { name: 'credit_facility_memo', label: 'Credit memo', fields: ['risk_grade', { field: 'company_background', span: 2 }, { field: 'swot', span: 2 }, { field: 'projections', span: 2 }, { field: 'security_package', span: 2 }, { field: 'recommendation', span: 2 }] },
  ],
  pipeline: {
    name: 'commercial_lending', label: 'Commercial lending',
    stages: [
      stage('origination', 'Origination', '#94a3b8'),
      stage('rm_assessment', 'RM assessment', '#6366f1'),
      stage('credit_memo', 'Credit memo', '#3b82f6', { required_fields: ['company_background', 'security_package'] }),
      stage('credit_approval', 'Credit approval', '#8b5cf6', { required_fields: ['recommendation', 'risk_grade'] }),
      stage('term_sheet', 'Term sheet / offer', '#14b8a6', { entry_rule: { expression: "credit_decision = 'approved'", message: 'Only an approved facility gets a term sheet.' } }),
      stage('security_perfection', 'Security perfection', '#22c55e'),
      stage('active', 'Active', '#10b981', { entry_rule: { expression: "borrower.kyc_status = 'approved'", message: 'Activate only for a borrower with approved KYC (KYC-FR-11).' } }),
      stage('annual_review', 'Annual review', '#f59e0b'),
      stage('closed', 'Closed', '#64748b'),
      stage('declined', 'Declined', '#ef4444'),
    ],
  },
};
// Group exposure sums every facility of every party in the borrower's group.
creditFacility.fields.find((f) => f.name === 'group_exposure_mur').config.expression = "IF(ISBLANK(borrower_group), amount_mur, borrower_group.facility_exposure_mur)";

const financialSpread = {
  name: 'financial_spread',
  label: 'Financial Spread',
  plural_label: 'Financial Spreading',
  icon: 'Table',
  description: 'Three to five years of P&L and balance sheet per facility, with DSCR, leverage, gearing and interest cover (COM-FR-03). Import from Excel with the CSV importer.',
  config: { title_field: 'name', business_unit_field: 'business_unit' },
  fields: [
    LK('credit_facility', 'Facility', 'credit_facility', { required: true, config: { show_in_list: true } }),
    F('period_end', 'Financial year end', 'date', { required: true, config: { show_in_list: true } }),
    SEL('basis', 'Basis', o([['audited', 'Audited'], ['management', 'Management accounts'], ['projected', 'Projection']]), { default: 'audited' }),
    H('h_pl', 'Profit & loss (MUR)'),
    F('revenue', 'Revenue', 'currency', LIST),
    F('ebitda', 'EBITDA', 'currency', LIST),
    F('depreciation', 'Depreciation & amortisation', 'currency'),
    F('interest_expense', 'Interest expense', 'currency'),
    F('tax', 'Tax', 'currency'),
    F('net_profit', 'Net profit', 'currency'),
    H('h_bs', 'Balance sheet (MUR)'),
    F('total_assets', 'Total assets', 'currency'),
    F('total_debt', 'Total debt', 'currency'),
    F('cash', 'Cash', 'currency'),
    F('equity', 'Shareholders\' equity', 'currency'),
    F('annual_debt_service', 'Annual debt service (principal + interest)', 'currency'),
    H('h_ratios', 'Ratios (calculated)'),
    FX('ebitda_margin', 'EBITDA margin %', 'IF(COALESCE(revenue, 0) > 0, ebitda / revenue * 100, null)', { format: 'percent', precision: 1 }),
    FX('dscr', 'DSCR', 'IF(COALESCE(annual_debt_service, 0) > 0, (ebitda - COALESCE(tax, 0)) / annual_debt_service, null)', { precision: 2, list: true }),
    FX('net_debt_to_ebitda', 'Net debt / EBITDA', 'IF(COALESCE(ebitda, 0) > 0, (COALESCE(total_debt, 0) - COALESCE(cash, 0)) / ebitda, null)', { precision: 2, list: true }),
    FX('gearing', 'Gearing (debt / equity)', 'IF(COALESCE(equity, 0) > 0, total_debt / equity, null)', { precision: 2 }),
    FX('interest_cover', 'Interest cover', 'IF(COALESCE(interest_expense, 0) > 0, ebitda / interest_expense, null)', { precision: 2 }),
    FX('business_unit', 'Business unit', "'LND'", { type: 'string' }),
    FX('name', 'Spread', "CONCAT(credit_facility.facility_no, ' · FY ', YEAR(period_end))", { type: 'string' }),
  ],
  forms: [{ name: 'financial_spread_create', label: 'Add a year', columns: 3, fields: ['credit_facility', 'period_end', 'basis', 'revenue', 'ebitda', 'depreciation', 'interest_expense', 'tax', 'net_profit', 'total_assets', 'total_debt', 'cash', 'equity', 'annual_debt_service'] }],
};

const covenant = {
  name: 'covenant',
  label: 'Covenant',
  plural_label: 'Covenants',
  icon: 'FileCheck2',
  description: 'Financial and information covenants with their test schedule (COM-FR-04/05).',
  config: { title_field: 'name', business_unit_field: 'business_unit' },
  fields: [
    LK('credit_facility', 'Facility', 'credit_facility', { required: true, config: { show_in_list: true } }),
    SEL('covenant_type', 'Type', o([['financial', 'Financial'], ['information', 'Information'], ['negative_pledge', 'Negative pledge'], ['other', 'Other']]), { required: true }),
    SEL('metric', 'Metric', o([['dscr', 'DSCR ≥'], ['net_debt_to_ebitda', 'Net debt / EBITDA ≤'], ['gearing', 'Gearing ≤'], ['interest_cover', 'Interest cover ≥'], ['audited_accounts', 'Audited accounts within 120 days'], ['insurance', 'Insurance in force']]), LIST),
    F('threshold', 'Threshold', 'decimal', LIST),
    SEL('frequency', 'Test frequency', o([['quarterly', 'Quarterly'], ['semi_annual', 'Semi-annual'], ['annual', 'Annual']]), { default: 'annual' }),
    F('next_test_date', 'Next test date', 'date', LIST),
    FX('last_result', 'Last result', "LOOKUP('covenant_test', 'covenant', id, 'result', 'test_date')", { type: 'string', list: true }),
    FX('business_unit', 'Business unit', "'LND'", { type: 'string' }),
    FX('name', 'Covenant', "CONCAT(credit_facility.facility_no, ' · ', metric, ' ', threshold)", { type: 'string' }),
  ],
  forms: [{ name: 'covenant_create', label: 'Add covenant', fields: ['credit_facility', 'covenant_type', 'metric', 'threshold', 'frequency', 'next_test_date'] }],
};

const covenantTest = {
  name: 'covenant_test',
  label: 'Covenant Test',
  plural_label: 'Covenant Tests',
  icon: 'ClipboardCheck',
  description: 'Each test date: compliance certificate, actual value, result, and the breach / waiver workflow (COM-FR-05).',
  config: { title_field: 'name', business_unit_field: 'business_unit' },
  fields: [
    LK('covenant', 'Covenant', 'covenant', { required: true, config: { show_in_list: true } }),
    LK('credit_facility', 'Facility', 'credit_facility'),
    F('test_date', 'Test date', 'date', { required: true, config: { show_in_list: true } }),
    F('certificate_received', 'Compliance certificate received', 'checkbox'),
    F('actual_value', 'Actual value', 'decimal', LIST),
    FX('metric', 'Metric', 'covenant.metric', { type: 'string' }),
    FX('threshold', 'Threshold', 'covenant.threshold'),
    FX('result', 'Result',
      "IF(ISBLANK(actual_value), 'pending', IF(IN(metric, 'dscr', 'interest_cover'), IF(actual_value >= threshold, 'pass', 'breach'), IF(IN(metric, 'net_debt_to_ebitda', 'gearing'), IF(actual_value <= threshold, 'pass', 'breach'), IF(certificate_received, 'pass', 'breach'))))",
      { type: 'string', list: true }),
    SEL('waiver', 'Waiver', o([['none', 'None'], ['requested', 'Requested'], ['granted', 'Granted', '#10b981'], ['refused', 'Refused', '#ef4444']]), { default: 'none' }),
    F('waiver_terms', 'Waiver terms / remedy', 'textarea'),
    FX('business_unit', 'Business unit', "'LND'", { type: 'string' }),
    FX('name', 'Test', "CONCAT(covenant.name, ' @ ', test_date)", { type: 'string' }),
  ],
  forms: [{ name: 'covenant_test_create', label: 'Record a test', fields: ['covenant', 'credit_facility', 'test_date', 'certificate_received', 'actual_value', 'waiver', { field: 'waiver_terms', span: 2 }] }],
};

// ── Collateral ───────────────────────────────────────────────────────────────

const collateralLink = {
  name: 'collateral_link',
  label: 'Collateral Allocation',
  plural_label: 'Collateral Allocations',
  icon: 'Link2',
  description: 'Many-to-many allocation of collateral to loans and facilities with the allocated value (COLL-FR-02).',
  config: { title_field: 'name', business_unit_field: 'business_unit' },
  fields: [
    LK('collateral', 'Collateral', 'collateral', { required: true, config: { show_in_list: true } }),
    LK('loan_application', 'Retail loan', 'loan_application', LIST),
    LK('credit_facility', 'Commercial facility', 'credit_facility', LIST),
    F('allocated_value', 'Allocated value (MUR)', 'currency', { required: true, config: { show_in_list: true } }),
    FX('business_unit', 'Business unit', "'LND'", { type: 'string' }),
    FX('name', 'Allocation', "CONCAT(collateral.description, ' → ', COALESCE(loan_application.application_no, credit_facility.facility_no))", { type: 'string' }),
  ],
  forms: [{ name: 'collateral_link_create', label: 'Allocate collateral', fields: ['collateral', 'loan_application', 'credit_facility', 'allocated_value'] }],
};

const collateralValuation = {
  name: 'collateral_valuation',
  label: 'Valuation',
  plural_label: 'Collateral Valuations',
  icon: 'Ruler',
  description: 'Valuation history; the revaluation scheduler raises a task when one falls due (COLL-FR-03).',
  config: { title_field: 'name', business_unit_field: 'business_unit' },
  fields: [
    LK('collateral', 'Collateral', 'collateral', { required: true, config: { show_in_list: true } }),
    F('valuation_date', 'Valuation date', 'date', { required: true, config: { show_in_list: true } }),
    F('market_value', 'Market value (MUR)', 'currency', { required: true, config: { show_in_list: true } }),
    F('forced_sale_value', 'Forced-sale value (MUR)', 'currency'),
    F('valuer', 'Valuer', 'text', LIST),
    SEL('method', 'Method', o([['full', 'Full inspection'], ['desktop', 'Desktop'], ['market', 'Market price (securities / units)']])),
    FX('business_unit', 'Business unit', "'LND'", { type: 'string' }),
    FX('name', 'Valuation', "CONCAT(collateral.collateral_no, ' @ ', valuation_date)", { type: 'string' }),
  ],
  forms: [{ name: 'collateral_valuation_create', label: 'Record valuation', fields: ['collateral', 'valuation_date', 'market_value', 'forced_sale_value', 'valuer', 'method'] }],
};

const marginCall = {
  name: 'margin_call',
  label: 'Margin Call',
  plural_label: 'Margin Calls',
  icon: 'Siren',
  description: 'Investment-backed loans whose LTV crossed the margin-call threshold — client notified, cure tracked (COLL-FR-04).',
  config: { title_field: 'name', business_unit_field: 'business_unit' },
  fields: [
    AUTO('call_no', 'Call No.', 'MC-'),
    LK('loan_application', 'Loan', 'loan_application', { required: true, config: { show_in_list: true } }),
    LK('party', 'Borrower', 'party', LIST),
    F('ltv_at_call', 'LTV at call %', 'percent', LIST),
    F('shortfall', 'Shortfall (MUR)', 'currency', LIST),
    F('call_date', 'Call date', 'date', { required: true }),
    F('cure_by', 'Cure by', 'date'),
    SEL('cure', 'Cure', o([['top_up', 'Additional collateral'], ['repayment', 'Partial repayment'], ['liquidation', 'Liquidation of pledged assets'], ['none', 'None yet']]), { default: 'none' }),
    FX('business_unit', 'Business unit', "'LND'", { type: 'string' }),
    FX('party_email', 'Borrower email', 'party.email', { type: 'string' }),
    FX('preferred_language', 'Language', "COALESCE(party.preferred_language, 'en')", { type: 'string' }),
    FX('name', 'Margin call', "CONCAT(loan_application.application_no, ' · ', call_date)", { type: 'string' }),
  ],
  forms: [{ name: 'margin_call_create', label: 'Margin call', fields: ['loan_application', 'party', 'ltv_at_call', 'shortfall', 'call_date', 'cure_by', 'cure'] }],
  pipeline: {
    name: 'margin_call_flow', label: 'Margin call',
    stages: [
      stage('issued', 'Issued', '#f59e0b'), stage('client_contacted', 'Client contacted', '#3b82f6'),
      stage('cured', 'Cured', '#10b981'), stage('liquidation', 'Liquidation', '#ef4444'),
    ],
  },
};

// ── Servicing ────────────────────────────────────────────────────────────────

const loanAccount = {
  name: 'loan_account',
  label: 'Loan Account',
  plural_label: 'Loan Book (LMS view)',
  icon: 'BookOpen',
  description: 'Daily snapshot from the LMS — outstanding, rate, next instalment, arrears and maturity (SERV-FR-01). The LMS is the system of record.',
  config: { title_field: 'lms_account_no', business_unit_field: 'business_unit' },
  fields: [
    F('lms_account_no', 'LMS account no.', 'text', { required: true, unique: true, config: { show_in_list: true } }),
    LK('party', 'Borrower', 'party', { required: true, config: { show_in_list: true } }),
    LK('loan_application', 'Origination', 'loan_application'),
    SEL('product_code', 'Product', o([['LND-RE', 'Real Estate Loan'], ['LND-PL', 'Personal Loan'], ['LND-IBL', 'Investment-Backed Loan'], ['LND-COM', 'Commercial']]), LIST),
    SEL('currency_code', 'Currency', CURRENCIES, { default: 'MUR' }),
    F('original_amount', 'Original amount', 'currency'),
    F('outstanding', 'Outstanding principal', 'currency'),
    F('rate_type', 'Variable (PLR-linked)', 'checkbox', { default: 'true' }),
    F('margin', 'Margin vs PLR (% pts)', 'decimal'),
    FX('current_rate', 'Current rate %', "IF(rate_type, LATEST('plr_rate', 'rate', 'effective_from') + COALESCE(margin, 0), fixed_rate)", { precision: 3, list: true }),
    F('fixed_rate', 'Fixed rate %', 'decimal'),
    F('instalment', 'Monthly instalment', 'currency'),
    F('next_instalment_date', 'Next instalment', 'date'),
    F('arrears_days', 'Days in arrears', 'integer', LIST),
    FX('arrears_bucket', 'Arrears bucket', "IF(COALESCE(arrears_days, 0) = 0, 'current', IF(arrears_days <= 30, '1-30', IF(arrears_days <= 60, '31-60', IF(arrears_days <= 90, '61-90', '90+'))))", { type: 'string', list: true }),
    F('arrears_amount', 'Arrears amount', 'currency'),
    F('maturity_date', 'Maturity', 'date', LIST),
    FX('months_to_maturity', 'Months to maturity', 'IF(ISBLANK(maturity_date), null, MONTHS_BETWEEN(TODAY(), maturity_date))'),
    F('collateral_value', 'Collateral value (MUR)', 'currency'),
    FX('ltv', 'Current LTV %', 'IF(COALESCE(collateral_value, 0) > 0, outstanding_mur / collateral_value * 100, null)', { format: 'percent', precision: 1, list: true }),
    FX('ltv_band', 'LTV band', "IF(ISBLANK(ltv), 'n/a', IF(ltv <= 60, '≤ 60%', IF(ltv <= 80, '60–80%', IF(ltv <= 100, '80–100%', '> 100%'))))", { type: 'string' }),
    FX('ltv_status', 'LTV status (investment-backed)', "IF(product_code != 'LND-IBL' OR ISBLANK(ltv), 'n/a', IF(ltv >= 90, 'liquidation', IF(ltv >= 80, 'margin_call', IF(ltv >= 75, 'warning', 'ok'))))", { type: 'string' }),
    SEL('status', 'Status', o([['active', 'Active', '#10b981'], ['arrears', 'In arrears', '#f59e0b'], ['restructured', 'Restructured', '#8b5cf6'], ['settled', 'Settled', '#64748b'], ['written_off', 'Written off', '#ef4444']]), { default: 'active', config: { show_in_list: true } }),
    F('synced_at', 'Synced from LMS', 'date'),
    F('promise_to_pay_date', 'Promise to pay by', 'date'),
    F('margin_call_open', 'Margin call open', 'checkbox', { config: { always_disabled: true } }),
    F('renewal_opened', 'Maturity opportunity opened', 'checkbox', { config: { always_disabled: true } }),
    MUR('outstanding', 'Outstanding (MUR)'),
    FX('party_email', 'Borrower email', 'party.email', { type: 'string' }),
    FX('preferred_language', 'Language', "COALESCE(party.preferred_language, 'en')", { type: 'string' }),
    FX('business_unit', 'Business unit', "'LND'", { type: 'string' }),
  ],
  forms: [{ name: 'loan_account_create', label: 'Loan account', fields: ['lms_account_no', 'party', 'loan_application', 'product_code', 'currency_code', 'original_amount', 'outstanding', 'rate_type', 'margin', 'fixed_rate', 'instalment', 'next_instalment_date', 'arrears_days', 'arrears_amount', 'maturity_date', 'collateral_value', 'status', 'synced_at', 'promise_to_pay_date'] }],
};

const plrChangeEvent = {
  name: 'plr_change_event',
  label: 'PLR Change',
  plural_label: 'PLR Change Campaigns',
  icon: 'TrendingUp',
  description: 'Each PLR change: the affected variable-rate book, personalised notices and their delivery log (SERV-FR-02).',
  config: { title_field: 'name', business_unit_field: 'business_unit' },
  fields: [
    AUTO('plr_change_no', 'Change No.', 'PLR-'),
    F('old_rate', 'Old PLR %', 'decimal', { required: true, config: { show_in_list: true } }),
    F('new_rate', 'New PLR %', 'decimal', { required: true, config: { show_in_list: true } }),
    F('effective_from', 'Effective from', 'date', { required: true, config: { show_in_list: true } }),
    F('approved_by', 'Approved by (ALCO)'),
    FX('change_bps', 'Change (bps)', 'ROUND((new_rate - old_rate) * 100, 0)', LIST),
    FX('notices', 'Notices', "COUNT_RELATED('plr_notification', 'plr_change_event')", LIST),
    FX('delivered', 'Delivered', "COUNT_RELATED('plr_notification', 'plr_change_event', 'status', 'delivered')"),
    FX('business_unit', 'Business unit', "'LND'", { type: 'string' }),
    FX('name', 'PLR change', "CONCAT('PLR ', old_rate, '% → ', new_rate, '% from ', effective_from)", { type: 'string' }),
  ],
  forms: [{ name: 'plr_change_event_create', label: 'Record a PLR change', fields: ['old_rate', 'new_rate', 'effective_from', 'approved_by'] }],
  pipeline: {
    name: 'plr_change_flow', label: 'PLR change',
    stages: [
      stage('draft', 'Draft', '#94a3b8'), stage('approved', 'Approved', '#6366f1', { required_fields: ['approved_by'] }),
      stage('notices_generated', 'Notices generated', '#8b5cf6'), stage('distributed', 'Distributed', '#10b981'),
    ],
  },
};

const plrNotification = {
  name: 'plr_notification',
  label: 'PLR Notice',
  plural_label: 'PLR Notices',
  icon: 'MailCheck',
  description: 'One personalised notice per affected loan, with old and new instalment and the delivery status.',
  config: { title_field: 'name', business_unit_field: 'business_unit' },
  fields: [
    LK('plr_change_event', 'PLR change', 'plr_change_event', { required: true, config: { show_in_list: true } }),
    LK('loan_account', 'Loan account', 'loan_account', { required: true, config: { show_in_list: true } }),
    FX('party_name', 'Borrower', 'loan_account.party.display_name', { type: 'string', list: true }),
    FX('party_email', 'Borrower email', 'loan_account.party.email', { type: 'string' }),
    FX('preferred_language', 'Language', "COALESCE(loan_account.party.preferred_language, 'en')", { type: 'string' }),
    F('old_instalment', 'Old instalment', 'currency'),
    F('new_instalment', 'New instalment', 'currency'),
    FX('instalment_change', 'Change', 'new_instalment - old_instalment', { format: 'currency', precision: 2, list: true }),
    SEL('channel', 'Channel', o([['email', 'Email'], ['post', 'Post'], ['portal', 'Portal']]), { default: 'email' }),
    SEL('status', 'Delivery', o([['pending', 'Pending'], ['sent', 'Sent'], ['delivered', 'Delivered', '#10b981'], ['bounced', 'Bounced', '#ef4444']]), { default: 'pending', config: { show_in_list: true } }),
    F('sent_on', 'Sent on', 'date'),
    FX('business_unit', 'Business unit', "'LND'", { type: 'string' }),
    FX('name', 'Notice', "CONCAT(loan_account.lms_account_no, ' · ', plr_change_event.plr_change_no)", { type: 'string' }),
  ],
  forms: [{ name: 'plr_notification_create', label: 'PLR notice', fields: ['plr_change_event', 'loan_account', 'old_instalment', 'new_instalment', 'channel', 'status', 'sent_on'] }],
};

const collectionAction = {
  name: 'collection_action',
  label: 'Collections Action',
  plural_label: 'Collections (early warning)',
  icon: 'PhoneCall',
  description: 'Arrears follow-up: calls, promises to pay, escalation (SERV-FR-04).',
  config: { title_field: 'name', business_unit_field: 'business_unit' },
  fields: [
    LK('loan_account', 'Loan account', 'loan_account', { required: true, config: { show_in_list: true } }),
    FX('arrears_bucket', 'Bucket', 'loan_account.arrears_bucket', { type: 'string', list: true }),
    SEL('action', 'Action', o([['call', 'Call'], ['sms', 'SMS reminder'], ['letter', 'Demand letter'], ['visit', 'Visit'], ['escalate', 'Escalate to legal']]), { required: true, config: { show_in_list: true } }),
    F('action_date', 'Date', 'date', { required: true }),
    SEL('outcome', 'Outcome', o([['ptp', 'Promise to pay'], ['paid', 'Paid', '#10b981'], ['no_contact', 'No contact'], ['dispute', 'Dispute'], ['refused', 'Refused', '#ef4444']]), LIST),
    F('ptp_amount', 'Promised amount', 'currency'),
    F('ptp_date', 'Promised by', 'date'),
    F('notes', 'Notes', 'textarea'),
    FX('business_unit', 'Business unit', "'LND'", { type: 'string' }),
    FX('name', 'Action', "CONCAT(loan_account.lms_account_no, ' · ', action, ' · ', action_date)", { type: 'string' }),
  ],
  dependencies: showWhen('outcome', 'ptp', ['ptp_amount', 'ptp_date']),
  forms: [{ name: 'collection_action_create', label: 'Log collections action', fields: ['loan_account', 'action', 'action_date', 'outcome', 'ptp_amount', 'ptp_date', { field: 'notes', span: 2 }] }],
};

module.exports = {
  loanApplicant, creditCondition, loanOffer, disbursement,
  creditFacility, financialSpread, covenant, covenantTest,
  collateralLink, collateralValuation, marginCall,
  loanAccount, plrChangeEvent, plrNotification, collectionAction,
  MUR,
};
// Silence unused-import lint for shared helpers kept for future objects.
void BUSINESS_UNITS; void LOW_MED_HIGH;
