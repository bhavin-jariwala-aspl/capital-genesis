'use strict';

/**
 * SWAN Capital — compliance registers beyond KYC (M03, M21), anonymous web
 * events (M01) and the remaining configuration masters (M24): KYC risk
 * factors, collateral types, the approval matrix, the service-request
 * catalogue and reason codes.
 */

const { o, BUSINESS_UNITS, PRODUCTS } = require('./options');
const { helpers: { F, SEL, LK, FX, AUTO, LIST, EXPR, stage, showWhen } } = require('./objects');

// ── Screening & reliance ─────────────────────────────────────────────────────

const screeningHit = {
  name: 'screening_hit',
  label: 'Screening Hit',
  plural_label: 'Screening Hits',
  icon: 'ScanSearch',
  description: 'Sanctions, PEP and adverse-media hits from the screening adapter, triaged as true match, false positive or escalate (KYC-FR-03).',
  config: { title_field: 'name', barrier_zone: 'COMPLIANCE_ONLY', conceal_existence: true },
  fields: [
    LK('kyc_case', 'KYC case', 'kyc_case', { required: true, config: { show_in_list: true } }),
    LK('party', 'Party', 'party', LIST),
    SEL('provider', 'Provider', o([['world_check', 'LSEG World-Check'], ['dow_jones', 'Dow Jones'], ['comply_advantage', 'ComplyAdvantage'], ['lexis_nexis', 'LexisNexis'], ['simulator', 'Sandbox simulator']]), { default: 'simulator' }),
    SEL('list_type', 'List', o([['sanctions', 'Sanctions'], ['pep', 'PEP'], ['adverse_media', 'Adverse media'], ['enforcement', 'Enforcement']]), { required: true, config: { show_in_list: true } }),
    F('matched_name', 'Matched name', 'text', LIST),
    F('match_score', 'Match score %', 'percent', LIST),
    F('source_reference', 'Source reference'),
    SEL('trigger', 'Triggered by', o([['onboarding', 'Onboarding'], ['name_change', 'Name / ID change'], ['batch', 'Daily batch rescreening']]), { default: 'onboarding' }),
    SEL('disposition', 'Disposition', o([['pending', 'Pending', '#f59e0b'], ['false_positive', 'False positive', '#10b981'], ['true_match', 'True match', '#ef4444'], ['escalated', 'Escalated to MLRO', '#8b5cf6']]), { default: 'pending', config: { show_in_list: true } }),
    F('reviewer', 'Reviewer'),
    F('rationale', 'Rationale', 'textarea', { validations: [EXPR("disposition = 'pending' OR NOT(ISBLANK(rationale))", 'Record the rationale for the disposition')] }),
    FX('name', 'Hit', "CONCAT(list_type, ' · ', matched_name)", { type: 'string' }),
  ],
  forms: [{ name: 'screening_hit_create', label: 'Screening hit', fields: ['kyc_case', 'party', 'provider', 'list_type', 'matched_name', 'match_score', 'source_reference', 'trigger', 'disposition', 'reviewer', { field: 'rationale', span: 2 }] }],
};

const kycReliance = {
  name: 'kyc_reliance',
  label: 'KYC Reliance',
  plural_label: 'KYC Reliance Records',
  icon: 'Repeat2',
  description: 'Another SWAN entity relying on an approved group KYC within validity and risk appetite, with the documented reliance (KYC-FR-08).',
  config: { title_field: 'name', business_unit_field: 'relying_business_unit' },
  fields: [
    LK('kyc_case', 'Approved KYC case', 'kyc_case', {
      required: true, config: { show_in_list: true },
      validations: [EXPR("kyc_case.kyc_outcome = 'approved' AND kyc_case.next_review_date >= TODAY()", 'Rely only on an approved KYC that is still within its review date')],
    }),
    SEL('relying_business_unit', 'Relying entity', BUSINESS_UNITS, { required: true, config: { show_in_list: true } }),
    F('relied_on', 'Relied on', 'date', { required: true }),
    F('product_addons', 'Product-specific add-ons completed', 'textarea', { help: 'e.g. suitability for WLT / SEC' }),
    F('approved_by', 'Approved by'),
    FX('risk_rating', 'Risk rating', 'kyc_case.risk_rating', { type: 'string', list: true }),
    FX('within_appetite', 'Within risk appetite', "kyc_case.risk_rating != 'high'", { type: 'boolean', format: 'checkbox', list: true }),
    FX('name', 'Reliance', "CONCAT(kyc_case.name, ' → ', relying_business_unit)", { type: 'string' }),
  ],
  forms: [{ name: 'kyc_reliance_create', label: 'Record reliance', fields: ['kyc_case', 'relying_business_unit', 'relied_on', 'approved_by', { field: 'product_addons', span: 2 }] }],
};

// ── Staff conduct registers ──────────────────────────────────────────────────

const giftRegister = {
  name: 'gift_register',
  label: 'Gift / Hospitality',
  plural_label: 'Gifts & Hospitality Register',
  icon: 'Gift',
  description: 'Gifts and hospitality given or received by staff (CMP-FR-05).',
  config: { title_field: 'name' },
  fields: [
    F('employee_id', 'Employee', 'text', { required: true, config: { show_in_list: true } }),
    SEL('direction', 'Direction', o([['received', 'Received'], ['given', 'Given']]), { required: true, config: { show_in_list: true } }),
    F('counterparty', 'From / to', 'text', { required: true }),
    F('description', 'Description', 'text', { required: true }),
    F('estimated_value', 'Estimated value (MUR)', 'currency', LIST),
    F('event_date', 'Date', 'date', { required: true }),
    FX('needs_approval', 'Above threshold (MUR 5,000)', 'estimated_value > 5000', { type: 'boolean', format: 'checkbox', list: true }),
    SEL('decision', 'Compliance decision', o([['noted', 'Noted'], ['approved', 'Approved', '#10b981'], ['declined', 'Declined / returned', '#ef4444']]), { default: 'noted', config: { show_in_list: true } }),
    FX('name', 'Gift', "CONCAT(employee_id, ' · ', direction, ' · ', description)", { type: 'string' }),
  ],
  forms: [{ name: 'gift_register_create', label: 'Declare gift / hospitality', fields: ['employee_id', 'direction', 'counterparty', 'description', 'estimated_value', 'event_date', 'decision'] }],
};

const paDealing = {
  name: 'pa_dealing',
  label: 'Personal Account Dealing',
  plural_label: 'Personal Dealing Pre-clearance',
  icon: 'UserCog',
  description: 'Staff personal-account dealing pre-clearance, checked against the restricted list (CMP-FR-05).',
  config: { title_field: 'name', barrier_zone: 'COMPLIANCE_ONLY', conceal_existence: true },
  fields: [
    AUTO('request_no', 'Request No.', 'PAD-'),
    F('employee_id', 'Employee', 'text', { required: true, config: { show_in_list: true } }),
    F('security', 'Security / issuer', 'text', { required: true, config: { show_in_list: true } }),
    SEL('side', 'Side', o([['buy', 'Buy'], ['sell', 'Sell']]), { required: true }),
    F('quantity', 'Quantity', 'decimal'),
    F('requested_on', 'Requested on', 'date', { required: true }),
    FX('restricted', 'On the restricted / watch list', "COALESCE(LOOKUP('restricted_list_entry', 'issuer', security, 'list_type'), 'clear')", { type: 'string', list: true }),
    SEL('decision', 'Decision', o([['pending', 'Pending'], ['cleared', 'Cleared (valid 2 business days)', '#10b981'], ['refused', 'Refused', '#ef4444']]), { default: 'pending', config: { show_in_list: true } }),
    F('decided_by', 'Decided by'),
    FX('name', 'Pre-clearance', "CONCAT(request_no, ' · ', employee_id, ' · ', side, ' ', security)", { type: 'string' }),
  ],
  forms: [{ name: 'pa_dealing_create', label: 'Request pre-clearance', fields: ['employee_id', 'security', 'side', 'quantity', 'requested_on', 'decision', 'decided_by'] }],
};

const dataSubjectRequest = {
  name: 'data_subject_request',
  label: 'Data Subject Request',
  plural_label: 'Data Subject Requests (DPA)',
  icon: 'FileLock2',
  description: 'Access, rectification, erasure (subject to AML retention) and portability requests under the Mauritius DPA 2017, with a 30-day SLA (CMP-FR-08).',
  config: { title_field: 'name' },
  fields: [
    AUTO('dsr_no', 'Request No.', 'DSR-'),
    LK('party', 'Data subject', 'party', { required: true, config: { show_in_list: true } }),
    SEL('request_type', 'Right exercised', o([['access', 'Access'], ['rectification', 'Rectification'], ['erasure', 'Erasure'], ['portability', 'Portability'], ['objection', 'Objection / restriction']]), { required: true, config: { show_in_list: true } }),
    F('received_on', 'Received on', 'date', { required: true, config: { show_in_list: true } }),
    F('identity_verified', 'Identity verified', 'checkbox'),
    F('details', 'Details', 'textarea'),
    FX('due_by', 'Respond by (30 days)', 'ADD_DAYS(received_on, 30)', { type: 'date', format: 'date', list: true }),
    FX('days_left', 'Days left', 'IF(NOT(ISBLANK(completed_on)), null, DAYS_BETWEEN(TODAY(), due_by))', LIST),
    F('aml_retention_applies', 'AML retention prevents erasure (7 years)', 'checkbox'),
    F('response', 'Response', 'textarea'),
    F('completed_on', 'Completed on', 'date'),
    FX('name', 'DSR', "CONCAT(dsr_no, ' · ', request_type, ' · ', party.display_name)", { type: 'string' }),
  ],
  dependencies: showWhen('request_type', 'erasure', ['aml_retention_applies']),
  forms: [{ name: 'data_subject_request_create', label: 'Data subject request', fields: ['party', 'request_type', 'received_on', 'identity_verified', 'aml_retention_applies', { field: 'details', span: 2 }, { field: 'response', span: 2 }, 'completed_on'] }],
  pipeline: {
    name: 'dsr_flow', label: 'DSR',
    stages: [
      stage('received', 'Received', '#6366f1'), stage('verifying', 'Verifying identity', '#f59e0b'),
      stage('in_progress', 'In progress', '#3b82f6', { required_fields: ['identity_verified'] }),
      stage('completed', 'Completed', '#10b981', { required_fields: ['response', 'completed_on'] }),
      stage('refused', 'Refused (with reasons)', '#ef4444', { required_fields: ['response'] }),
    ],
  },
};

// ── Web events (anonymous calculator sessions) ───────────────────────────────

const webEvent = {
  name: 'web_event',
  label: 'Web Event',
  plural_label: 'Calculator Sessions',
  icon: 'MousePointerClick',
  description: 'Anonymous loan-calculator sessions kept as web events, matched to an enquiry when the visitor leaves details (LEAD-FR-10).',
  config: { title_field: 'name' },
  fields: [
    SEL('event_type', 'Event', o([['calculator', 'Loan calculator'], ['newsletter_signup', 'Newsletter sign-up'], ['callback_request', 'Call-back request'], ['questionnaire_started', 'Questionnaire started'], ['product_view', 'Product page view']]), { default: 'calculator', config: { show_in_list: true } }),
    F('first_name', 'First name'),
    F('last_name', 'Last name'),
    F('email', 'Email', 'email', LIST),
    F('mobile', 'Mobile', 'phone'),
    SEL('topic', 'Topic', o([['weekly_highlights', 'Weekly market highlights'], ['market_statistics', 'Market statistics'], ['research', 'Research notes'], ['forex', 'Talk to our Forexpert'], ['loans', 'Loans'], ['investments', 'Investments']])),
    F('preferred_time', 'Preferred call-back time', 'text', { placeholder: 'e.g. weekdays after 16:00' }),
    F('consent_marketing', 'I agree to receive SWAN communications', 'checkbox'),
    SEL('product_code', 'Product', PRODUCTS, LIST),
    F('amount', 'Amount', 'currency', LIST),
    F('tenure_months', 'Tenure (months)', 'integer'),
    F('applicant_age', 'Age', 'integer'),
    F('page_url', 'Page', 'url'),
    F('utm_source', 'UTM source'),
    F('utm_campaign', 'UTM campaign'),
    F('session_date', 'Date', 'date'),
    LK('enquiry', 'Converted to enquiry', 'enquiry'),
    FX('rate', 'Indicative rate %', "LATEST('plr_rate', 'rate', 'effective_from') + LOOKUP('financial_product', 'code', product_code, 'margin')", { precision: 3 }),
    FX('emi', 'Indicative instalment', 'IF(ISBLANK(tenure_months), null, PMT(rate / 1200, tenure_months, amount))', { format: 'currency', precision: 2, list: true }),
    FX('converted', 'Converted', 'NOT(ISBLANK(enquiry))', { type: 'boolean', format: 'checkbox', list: true }),
    FX('name', 'Session', "CONCAT(event_type, ' · ', COALESCE(email, product_code), IF(ISBLANK(amount), '', CONCAT(' · ', amount)))", { type: 'string' }),
  ],
  forms: [
    { name: 'web_event_create', label: 'Web event', fields: ['event_type', 'product_code', 'amount', 'tenure_months', 'applicant_age', 'page_url', 'utm_source', 'utm_campaign', 'session_date', 'enquiry'] },
    { name: 'web_event_calculator', label: 'Loan calculator', fields: ['product_code', 'amount', 'tenure_months', 'applicant_age'] },
    { name: 'web_event_newsletter', label: 'Newsletter sign-up', fields: ['first_name', 'last_name', 'email', 'topic', { field: 'consent_marketing', span: 2 }] },
    { name: 'web_event_callback', label: 'Request a call-back', fields: ['first_name', 'last_name', 'mobile', 'email', 'topic', 'preferred_time', { field: 'consent_marketing', span: 2 }] },
  ],
};

// ── Masters ──────────────────────────────────────────────────────────────────

const kycRiskFactor = {
  name: 'kyc_risk_factor',
  label: 'KYC Risk Factor',
  plural_label: 'KYC Risk Factors & Weights',
  icon: 'Weight',
  description: 'Versioned weights read by the KYC risk-score formula (KYC-FR-04). Change a score here and every case recomputes on its next save.',
  config: { title_field: 'code' },
  fields: [
    F('code', 'Code', 'text', { required: true, unique: true, config: { show_in_list: true } }),
    SEL('factor', 'Factor', o([['pep', 'PEP'], ['product', 'Product risk'], ['channel', 'Delivery channel'], ['occupation', 'Occupation / industry'], ['ownership', 'Ownership structure'], ['activity', 'Expected activity']]), { required: true, config: { show_in_list: true } }),
    F('value', 'Value', 'text', LIST),
    F('score', 'Score', 'integer', { required: true, config: { show_in_list: true } }),
    F('model_version', 'Model version', 'text', { default: 'v1', config: { show_in_list: true } }),
    F('effective_from', 'Effective from', 'date'),
  ],
  forms: [{ name: 'kyc_risk_factor_create', label: 'Risk factor', fields: ['code', 'factor', 'value', 'score', 'model_version', 'effective_from'] }],
};

const collateralType = {
  name: 'collateral_type',
  label: 'Collateral Type',
  plural_label: 'Collateral Types & Haircuts',
  icon: 'Percent',
  description: 'Standard haircut and revaluation frequency per collateral type (M24, COLL-FR-03).',
  config: { title_field: 'label' },
  fields: [
    F('code', 'Code', 'text', { required: true, unique: true, config: { show_in_list: true } }),
    F('label', 'Type', 'text', { required: true, config: { show_in_list: true } }),
    F('haircut_pct', 'Haircut %', 'percent', LIST),
    F('revaluation_months', 'Revalue every (months)', 'integer', LIST),
    F('ltv_warning_pct', 'LTV warning %', 'percent'),
    F('ltv_margin_call_pct', 'LTV margin call %', 'percent'),
    F('ltv_liquidation_pct', 'LTV liquidation %', 'percent'),
  ],
  forms: [{ name: 'collateral_type_create', label: 'Collateral type', fields: ['code', 'label', 'haircut_pct', 'revaluation_months', 'ltv_warning_pct', 'ltv_margin_call_pct', 'ltv_liquidation_pct'] }],
};

const approvalMatrix = {
  name: 'approval_matrix',
  label: 'Approval Matrix',
  plural_label: 'Approval Matrices',
  icon: 'GitBranch',
  description: 'BU, product, amount band, exception type, approver role and quorum (M24, LOAN-FR-09). The credit approval workflow reads the band label.',
  config: { title_field: 'band_key' },
  fields: [
    F('band_key', 'Band key', 'text', { required: true, unique: true, config: { show_in_list: true }, help: 'BU|band, e.g. LND|5M' }),
    SEL('business_unit', 'Business unit', BUSINESS_UNITS, { required: true, config: { show_in_list: true } }),
    F('max_amount', 'Up to (MUR)', 'currency', LIST),
    SEL('exception_type', 'Exception type', o([['none', 'Within policy'], ['policy_exception', 'Policy exception'], ['rate_override', 'Rate override']]), { default: 'none' }),
    F('approver_role', 'Approver role', 'text', { required: true, config: { show_in_list: true } }),
    F('approver_label', 'Approver', 'text', LIST),
    F('quorum', 'Quorum', 'integer', { default: '1' }),
  ],
  forms: [{ name: 'approval_matrix_create', label: 'Approval band', fields: ['band_key', 'business_unit', 'max_amount', 'exception_type', 'approver_role', 'approver_label', 'quorum'] }],
};

const serviceCatalogue = {
  name: 'service_catalogue',
  label: 'Service Type',
  plural_label: 'Service Request Catalogue',
  icon: 'BookMarked',
  description: 'Each request type with its BU, SLA, approval need and checklist (SR-FR-01).',
  config: { title_field: 'label' },
  fields: [
    F('request_type', 'Code', 'text', { required: true, unique: true, config: { show_in_list: true } }),
    F('label', 'Request', 'text', { required: true, config: { show_in_list: true } }),
    SEL('business_unit', 'Business unit', [...BUSINESS_UNITS, { value: 'ALL', label: 'All entities' }], LIST),
    F('sla_hours', 'SLA (business hours)', 'integer', LIST),
    F('requires_approval', 'Requires approval', 'checkbox', LIST),
    F('checklist', 'Checklist', 'textarea'),
  ],
  forms: [{ name: 'service_catalogue_create', label: 'Service type', fields: ['request_type', 'label', 'business_unit', 'sla_hours', 'requires_approval', { field: 'checklist', span: 2 }] }],
};

const reasonCode = {
  name: 'reason_code',
  label: 'Reason Code',
  plural_label: 'Reason Codes',
  icon: 'Tags',
  description: 'Lead disqualification, loan decline, mandate loss and account closure reasons (M24).',
  config: { title_field: 'label' },
  fields: [
    F('code', 'Code', 'text', { required: true, unique: true, config: { show_in_list: true } }),
    SEL('reason_type', 'Used for', o([['lead_disqualification', 'Lead disqualification'], ['loan_decline', 'Loan decline'], ['mandate_loss', 'Mandate loss'], ['account_closure', 'Account closure'], ['complaint_root_cause', 'Complaint root cause']]), { required: true, config: { show_in_list: true } }),
    F('label', 'Reason', 'text', { required: true, config: { show_in_list: true } }),
    F('label_fr', 'Reason (FR)'),
  ],
  forms: [{ name: 'reason_code_create', label: 'Reason code', fields: ['code', 'reason_type', 'label', 'label_fr'] }],
};

module.exports = {
  screeningHit, kycReliance, giftRegister, paDealing, dataSubjectRequest, webEvent,
  kycRiskFactor, collateralType, approvalMatrix, serviceCatalogue, reasonCode,
};
