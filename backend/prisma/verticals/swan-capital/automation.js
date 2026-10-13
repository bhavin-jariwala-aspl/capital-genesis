'use strict';

/**
 * SWAN Capital — workflows, assignment rules, SLA policies and object
 * permissions. All of it is ordinary Builder configuration: open Builder ▸
 * Workflows / Assignment / SLA / Permissions after install to change it.
 *
 * Workflow conventions used here (see WORKFLOW_ENGINE.md):
 *   - stage-driven flows trigger on `field_changed` of pipeline_stage_id and
 *     gate on `stage eq '<name>'` as their first condition;
 *   - approvals use `exclude_actor` (maker-checker: whoever moved the record
 *     can never approve it);
 *   - an approval's approved branch ends in a guard condition that re-reads
 *     the decision and halts, so it never falls into the rejected branch.
 */

const STAGE = { trigger_type: 'field_changed', trigger_config: { field: 'pipeline_stage_id' } };
const DAILY = { trigger_type: 'scheduled', trigger_config: { interval_minutes: 1440, per_record: true, limit: 2000 } };

const trig = (description) => ({ key: 't', name: 'Trigger', step_type: 'trigger', config: { description } });
const cond = (key, name, field, operator, value, links = {}) => ({ key, name, step_type: 'condition', config: { field, operator, ...(value !== undefined ? { value } : {}) }, ...links });
const expr = (key, name, expression, links = {}) => ({ key, name, step_type: 'condition', config: { operator: 'expression', value: expression }, ...links });
const set = (key, name, field, value, links = {}) => ({ key, name, step_type: 'action', config: { field, value }, ...links });
const notify = (key, name, config, links = {}) => ({ key, name, step_type: 'notification', config, ...links });
const email = (key, name, template, links = {}, extra = {}) => ({ key, name, step_type: 'send_email', config: { template, language_field: 'preferred_language', ...extra }, ...links });
const create = (key, name, object, fields, extra = {}, links = {}) => ({ key, name, step_type: 'create_record', config: { object, fields, ...extra }, ...links });
const approval = (key, name, role, title, message, onApprove, onReject) => ({
  key, name, step_type: 'approval', config: { role, title, message, exclude_actor: true }, on_true: onApprove, on_false: onReject,
});
const doc = (key, name, template, filename) => ({ key, name, step_type: 'generate_document', config: { template, filename } });

const workflows = [
  // ── Enquiries ───────────────────────────────────────────────────────────────
  {
    object: 'enquiry', name: 'swan_enquiry_acknowledgement', label: 'Enquiry — acknowledgement (EN/FR)',
    description: 'Every new enquiry gets an acknowledgement in the enquirer\'s language with product-specific next steps (LEAD-FR-12).',
    trigger_type: 'on_create',
    steps: [
      trig('A new enquiry from any channel'),
      cond('c1', 'Has an email address', 'email', 'notempty'),
      email('m1', 'Send acknowledgement', 'enquiry_ack'),
    ],
  },
  {
    object: 'enquiry', name: 'swan_enquiry_conversion', label: 'Enquiry — convert to Party, relationship, KYC and application',
    description: 'Moving an enquiry to Converted creates (or links) the Party, opens the entity relationship and the KYC case, records consent and — for retail loans — starts the loan application (LEAD-FR-09).',
    ...STAGE,
    steps: [
      trig('Stage change'),
      cond('c1', 'Moved to Converted', 'stage', 'eq', 'converted'),
      cond('c2', 'Not converted before', 'party', 'empty'),
      cond('c3', 'Email already belongs to a party?', 'existing_party', 'notempty', undefined, { on_true: 'a_link', on_false: 'p_new' }),
      set('a_link', 'Link the existing party (no duplicate)', 'party', '{{existing_party}}', { on_true: 'rel' }),
      create('p_new', 'Create the party', 'party', {
        party_type: '{{party_type}}', first_name: '{{first_name}}', last_name: '{{last_name}}', legal_name: '{{company}}',
        email: '{{email}}', mobile: '{{mobile}}', preferred_language: '{{preferred_language}}', country_of_residence: '{{country_of_residence}}',
      }, { store_as: 'party' }),
      create('rel', 'Open the entity relationship', 'client_relationship', { party: '{{party}}', business_unit: '{{business_unit}}', onboarded_on: '{{today}}' }, { stage: 'onboarding' }),
      create('kyc', 'Open the KYC case', 'kyc_case', { party: '{{party}}', business_unit: '{{business_unit}}', review_type: 'onboarding', scope: 'group' }, { stage: 'initiated' }),
      cond('c4', 'Consent given on the enquiry?', 'consent_marketing', 'eq', 'true', { on_false: 'c5' }),
      create('cons', 'Record marketing consent', 'consent_record', {
        party: '{{party}}', purpose: 'marketing', channel: 'all', status: 'granted', source: 'web_form',
        text_version: '{{consent_text_version}}', captured_on: '{{today}}',
      }),
      expr('c5', 'Retail loan product?', "business_unit = 'LND' AND IN(product_code, 'LND-RE', 'LND-PL', 'LND-IBL')"),
      create('loan', 'Start the loan application', 'loan_application', {
        party: '{{party}}', product_code: '{{product_code}}', loan_amount: '{{estimated_amount}}', currency_code: '{{currency_code}}',
        tenure_months: '{{requested_tenure_months}}', purpose: 'other',
      }, { link_field: 'enquiry', stage: 'pre_qualified' }),
      notify('n1', 'Tell the owner', { field: 'assigned_to', title: 'Enquiry converted — {{display_name}}', message: 'Party, relationship, KYC case and (for loans) the application are open.' }),
    ],
  },

  // ── KYC ─────────────────────────────────────────────────────────────────────
  {
    object: 'kyc_case', name: 'swan_kyc_approval', label: 'KYC — risk-based approval (MLRO for high risk)',
    description: 'Pending approval routes high-risk / PEP cases to the MLRO and the rest to Compliance; four eyes, decision recorded and dated (KYC-FR-01, KYC-FR-05).',
    ...STAGE,
    steps: [
      trig('Stage change'),
      cond('c1', 'Moved to Pending approval', 'stage', 'eq', 'pending_approval'),
      expr('c2', 'High risk?', "risk_rating = 'high'", { on_true: 'ap_mlro', on_false: 'ap_comp' }),
      approval('ap_mlro', 'MLRO sign-off', 'mlro', 'KYC approval (high risk): {{name}}', 'Risk score {{risk_score}}, rating {{risk_rating}}. EDD notes: {{edd_notes}}', 'ok1', 'no1'),
      approval('ap_comp', 'Compliance approval', 'compliance_officer', 'KYC approval: {{name}}', 'Risk score {{risk_score}}, rating {{risk_rating}}.', 'ok1', 'no1'),
      set('ok1', 'Outcome approved', 'kyc_outcome', 'approved'),
      set('ok2', 'Decision date', 'decision_date', '{{today}}'),
      set('ok3', 'Move to Approved', 'stage', 'approved'),
      notify('ok4', 'Tell the owner', { field: 'assigned_to', title: 'KYC approved — {{name}}', message: 'Next review {{next_review_date}}.' }),
      cond('guard', 'Guard: stop the approved path', 'kyc_outcome', 'eq', 'rejected'),
      set('no1', 'Outcome rejected', 'kyc_outcome', 'rejected'),
      set('no2', 'Decision date', 'decision_date', '{{today}}'),
      set('no3', 'Move to Rejected', 'stage', 'rejected'),
      notify('no4', 'Tell the owner', { field: 'assigned_to', title: 'KYC rejected — {{name}}', message: 'Do not activate accounts or disburse for this client.' }),
    ],
  },
  {
    object: 'kyc_case', name: 'swan_kyc_periodic_review', label: 'KYC — periodic review scheduler',
    description: 'Daily: approved cases whose review falls due within 30 days (1 / 3 / 5 years by risk) open a periodic review case (KYC-FR-06).',
    ...DAILY,
    steps: [
      trig('Daily sweep'),
      cond('c1', 'Approved case', 'kyc_outcome', 'eq', 'approved'),
      cond('c2', 'Review due within 30 days', 'review_due', 'eq', 'true'),
      cond('c3', 'Review not yet opened', 'review_case_opened', 'empty'),
      create('rv', 'Open the periodic review', 'kyc_case', { party: '{{party}}', scope: '{{scope}}', business_unit: '{{business_unit}}', review_type: 'periodic' }, { stage: 'initiated' }),
      set('a1', 'Mark review opened', 'review_case_opened', 'true'),
      notify('n1', 'Tell the owner and Compliance', { field: 'assigned_to', role: 'compliance_officer', title: 'KYC review due — {{name}}', message: 'A periodic review case was opened; the current approval expires {{next_review_date}}.' }),
    ],
  },
  {
    object: 'party', name: 'swan_id_expiry', label: 'Party — ID document expiring',
    description: 'Thirty days before an ID document expires, the client is asked for a new one and the RM is told (KYC-FR-07).',
    ...DAILY,
    steps: [
      trig('Daily sweep'),
      expr('c1', 'ID expires in 30 days', 'NOT(ISBLANK(id_expiry_date)) AND DAYS_BETWEEN(TODAY(), id_expiry_date) = 30'),
      email('m1', 'Ask the client for a new ID', 'kyc_refresh_request'),
      notify('n1', 'Tell the RM', { field: 'assigned_to', title: 'ID expiring — {{display_name}}', message: 'ID {{id_number}} expires {{id_expiry_date}}. Refresh request sent.' }),
    ],
  },
  {
    object: 'str_report', name: 'swan_str_raised', label: 'STR — alert the MLRO',
    description: 'A new internal STR alerts the MLRO only — no details in the alert, and the record itself sits behind the MLRO barrier (KYC-FR-10).',
    trigger_type: 'on_create',
    steps: [
      trig('A new internal STR'),
      notify('n1', 'Alert the MLRO', { role: 'mlro', title: 'New internal STR raised', message: 'Open the STR register to review.' }),
    ],
  },

  // ── Suitability ─────────────────────────────────────────────────────────────
  {
    object: 'risk_profile', name: 'swan_questionnaire_lead', label: 'Questionnaire — create an enquiry',
    description: 'A website questionnaire with no client attached becomes a Wealth enquiry carrying the provisional profile (LEAD-FR-11).',
    trigger_type: 'on_create',
    steps: [
      trig('A new risk profile'),
      cond('c1', 'No client yet', 'party', 'empty'),
      cond('c2', 'Contact details given', 'email', 'notempty'),
      create('e1', 'Create the enquiry', 'enquiry', {
        first_name: '{{first_name}}', last_name: '{{last_name}}', email: '{{email}}', product_code: 'WLT-DPM',
        channel: 'questionnaire', message: 'Investor questionnaire: model portfolio {{model_portfolio}} ({{risk_profile_label}}).',
      }, { link_field: 'risk_profile', stage: 'new' }),
    ],
  },

  // ── Retail lending ──────────────────────────────────────────────────────────
  {
    object: 'loan_application', name: 'swan_loan_documents', label: 'Loan — request documents',
    description: 'Documents pending sends the client the product checklist (LOAN-FR-07).',
    ...STAGE,
    steps: [
      trig('Stage change'),
      cond('c1', 'Moved to Documents pending', 'stage', 'eq', 'documents_pending'),
      email('m1', 'Send the document checklist', 'loan_document_request', {}, { to_field: 'party_email' }),
      notify('n1', 'Tell the owner', { field: 'assigned_to', title: 'Documents requested — {{name}}', message: 'Track receipt on the Docs tab against the checklist.' }),
    ],
  },
  {
    object: 'loan_application', name: 'swan_loan_credit_approval', label: 'Loan — approval matrix',
    description: 'Credit approval routes by amount: ≤ MUR 5m Loans Manager, ≤ MUR 20m Credit Committee, above that Board Credit Committee. Four eyes; the decision moves the application on (LOAN-FR-09).',
    ...STAGE,
    steps: [
      trig('Stage change'),
      cond('c1', 'Moved to Credit approval', 'stage', 'eq', 'credit_approval'),
      expr('c2', 'Up to MUR 5m?', 'loan_amount_mur <= 5000000', { on_true: 'ap_lm', on_false: 'c3' }),
      expr('c3', 'Up to MUR 20m?', 'loan_amount_mur <= 20000000', { on_true: 'ap_cc', on_false: 'ap_bcc' }),
      approval('ap_lm', 'Loans Manager', 'loans_manager', 'Credit approval: {{name}}', '{{application_no}} · MUR {{loan_amount_mur}} · grade {{risk_grade}} · DSR {{dsr}}% · LTV {{ltv}}%. Analyst: {{analyst_recommendation}}.', 'ok1', 'no1'),
      approval('ap_cc', 'Credit Committee', 'credit_committee', 'Credit Committee: {{name}}', '{{application_no}} · MUR {{loan_amount_mur}} · grade {{risk_grade}}. Analyst: {{analyst_recommendation}}.', 'ok1', 'no1'),
      approval('ap_bcc', 'Board Credit Committee', 'board_credit_committee', 'Board Credit Committee: {{name}}', '{{application_no}} · MUR {{loan_amount_mur}} · grade {{risk_grade}}.', 'ok1', 'no1'),
      set('ok1', 'Decision approved', 'credit_decision', 'approved'),
      set('ok2', 'Decision date', 'decision_date', '{{today}}'),
      set('ok3', 'Issue the offer', 'stage', 'offer_issued'),
      cond('guard', 'Guard: stop the approved path', 'credit_decision', 'eq', 'declined'),
      set('no1', 'Decision declined', 'credit_decision', 'declined'),
      set('no2', 'Decision date', 'decision_date', '{{today}}'),
      set('no3', 'Move to Declined', 'stage', 'declined'),
    ],
  },
  {
    object: 'loan_application', name: 'swan_loan_offer', label: 'Loan — offer letter',
    description: 'Offer issued generates the offer letter on the application and emails the client; the offer lapses after 30 days (LOAN-FR-10).',
    ...STAGE,
    steps: [
      trig('Stage change'),
      cond('c1', 'Moved to Offer issued', 'stage', 'eq', 'offer_issued'),
      set('a1', 'Offer date', 'offer_date', '{{today}}'),
      doc('d1', 'Generate the offer letter', 'loan_offer_letter', 'Offer letter {{application_no}}'),
      email('m1', 'Tell the client', 'loan_offer', {}, { to_field: 'party_email' }),
      notify('n1', 'Tell the owner', { field: 'assigned_to', title: 'Offer issued — {{name}}', message: 'Send the offer letter for e-signature from the Docs tab. Valid until {{offer_valid_until}}.' }),
    ],
  },
  {
    object: 'loan_application', name: 'swan_loan_offer_lapse', label: 'Loan — lapse unaccepted offers',
    description: 'Daily: an offer not accepted by its validity date lapses (LOAN-FR-10).',
    ...DAILY,
    steps: [
      trig('Daily sweep'),
      cond('c1', 'Offer issued', 'stage', 'eq', 'offer_issued'),
      expr('c2', 'Expired and not accepted', 'NOT(offer_accepted) AND offer_valid_until < TODAY()'),
      set('a1', 'Outcome lapsed', 'outcome', 'lapsed'),
      set('a2', 'Move to Lapsed', 'stage', 'lapsed'),
      notify('n1', 'Tell the owner', { field: 'assigned_to', title: 'Offer lapsed — {{name}}', message: 'The offer was not accepted by {{offer_valid_until}}.' }),
    ],
  },
  {
    object: 'loan_application', name: 'swan_loan_disbursement', label: 'Loan — disbursement maker-checker',
    description: 'Ready for disbursement needs a checker other than the maker; on approval the LMS hand-off event is sent (LOAN-FR-12, X-05).',
    ...STAGE,
    steps: [
      trig('Stage change'),
      cond('c1', 'Moved to Ready for disbursement', 'stage', 'eq', 'ready_for_disbursement'),
      approval('ap', 'Operations checker', 'operations_checker', 'Disbursement check: {{name}}', '{{application_no}} · disburse MUR {{disbursement_amount}}. Security complete, KYC {{kyc_status}}.', 'ok1', 'no1'),
      notify('ok1', 'Tell the owner', { field: 'assigned_to', title: 'Disbursement authorised — {{name}}', message: 'Booked in the LMS; the account number is recorded on the application. Move it to Disbursed.' }),
      { key: 'ok2', name: 'LMS hand-off (loan.disbursement_requested)', step_type: 'integration', config: { integration: 'swan_lms', body: { application_no: '{{application_no}}', amount: '{{disbursement_amount}}', currency: '{{currency_code}}', rate: '{{interest_rate}}', tenure_months: '{{tenure_months}}' }, field_map: { lms_reference: 'account_no' } }, on_true: 'end', on_false: 'end' },
      { key: 'no1', name: 'Back to security', step_type: 'action', config: { field: 'stage', value: 'security_perfection' } },
      notify('no2', 'Tell the owner', { field: 'assigned_to', title: 'Disbursement not authorised — {{name}}', message: 'The checker sent it back to Security & insurance.' }),
      cond('end', 'End', 'record_id', 'empty'),
    ],
  },
  {
    object: 'loan_application', name: 'swan_loan_disbursed', label: 'Loan — disbursed: close and cross-sell',
    description: 'Disbursement closes the application and, for larger real-estate loans, refers the client to Wealth (LOAN-FR-17, XS-FR-02).',
    ...STAGE,
    steps: [
      trig('Stage change'),
      cond('c1', 'Moved to Disbursed', 'stage', 'eq', 'disbursed'),
      set('a1', 'Outcome disbursed', 'outcome', 'disbursed'),
      expr('c2', 'Real-estate loan of MUR 5m or more', "product_code = 'LND-RE' AND loan_amount_mur >= 5000000"),
      create('r1', 'Refer to Wealth', 'referral', {
        party: '{{party}}', from_business_unit: 'LND', to_business_unit: 'WLT', product_code: 'WLT-DPM',
        reason: 'Next-best action: real-estate borrower ({{application_no}}) — wealth discovery for surplus funds.',
      }, { stage: 'submitted' }),
    ],
  },
  {
    object: 'loan_application', name: 'swan_loan_declined', label: 'Loan — decline letter',
    description: 'A declined application gets a compliant decline letter with the re-application date (LOAN-FR-15).',
    ...STAGE,
    steps: [
      trig('Stage change'),
      cond('c1', 'Moved to Declined', 'stage', 'eq', 'declined'),
      set('a1', 'Outcome declined', 'outcome', 'declined'),
      doc('d1', 'Generate the decline letter', 'loan_decline_letter', 'Decline letter {{application_no}}'),
      email('m1', 'Tell the client', 'loan_decline', {}, { to_field: 'party_email' }),
    ],
  },

  // ── Service & complaints ────────────────────────────────────────────────────
  {
    object: 'service_request', name: 'swan_service_acknowledgement', label: 'Service — acknowledge (complaints to Compliance)',
    description: 'Every request is acknowledged in the client\'s language; complaints are acknowledged within the regulatory time and flagged to Compliance (SR-FR-03).',
    trigger_type: 'on_create',
    steps: [
      trig('A new request or complaint'),
      cond('c1', 'Is it a complaint?', 'is_complaint', 'eq', 'true', { on_false: 's1' }),
      email('k1', 'Complaint acknowledgement', 'complaint_ack', {}, { to_field: 'party_email' }),
      set('k2', 'Acknowledged on', 'acknowledged_on', '{{today}}'),
      set('k3', 'Move to Acknowledged', 'stage', 'acknowledged'),
      notify('k4', 'Tell Compliance', { role: 'compliance_officer', field: 'assigned_to', title: 'New complaint — {{name}}', message: '{{description}}' }),
      cond('guard', 'Guard: stop the complaint path', 'is_complaint', 'eq', 'false'),
      email('s1', 'Request acknowledgement', 'service_ack', {}, { to_field: 'party_email' }),
      set('s2', 'Acknowledged on', 'acknowledged_on', '{{today}}'),
      set('s3', 'Move to Acknowledged', 'stage', 'acknowledged'),
    ],
  },
];

// Whoever an enquiry or request is routed to: the business unit's team.
const ROUTES = [
  ['LND', ['SWLOAN1', 'SWLOAN2']], ['WLT', ['SWPM1', 'SWRM1']], ['FND', ['SWPM1']],
  ['SEC', ['SWTRD1']], ['ADV', ['SWADV1']], ['FX', ['SWFX1']],
];

const assignmentRules = [
  ...ROUTES.map(([bu, pool], i) => ({
    object: 'enquiry', name: `Route ${bu} enquiries`, rule_type: 'rule_based',
    conditions: [{ field: 'business_unit', operator: 'equals', value: bu }], pool, fallback: 'SWRM1', order_index: i + 1,
  })),
  ...ROUTES.map(([bu, pool], i) => ({
    object: 'service_request', name: `Route ${bu} requests`, rule_type: 'rule_based',
    conditions: [{ field: 'business_unit', operator: 'equals', value: bu }], pool, fallback: 'SWRM1', order_index: i + 1,
  })),
];

const businessHours = {
  name: 'Mauritius business hours', timezone_label: 'Indian/Mauritius (UTC+4)', utc_offset_minutes: 240, is_default: true,
  weekly: {
    mon: [['08:30', '16:45']], tue: [['08:30', '16:45']], wed: [['08:30', '16:45']], thu: [['08:30', '16:45']], fri: [['08:30', '16:45']], sat: [], sun: [],
  },
  // Fixed-date public holidays; movable ones (Thaipoosam Cavadee, Maha
  // Shivaratri, Ugadi, Eid, Ganesh Chaturthi, Divali…) are added by admins each year.
  holidays: ['2026-01-01', '2026-01-02', '2026-02-01', '2026-03-12', '2026-05-01', '2026-11-01', '2026-11-02', '2026-12-25',
    '2027-01-01', '2027-01-02', '2027-02-01', '2027-03-12', '2027-05-01', '2027-11-01', '2027-11-02', '2027-12-25'],
};

const H = 60;
const slaPolicies = [
  {
    name: 'Enquiry — speed to lead', object: 'enquiry',
    description: 'First contact within 4 business hours; resolve (convert or close) within 10 business days (LEAD-FR-07).',
    config: { first_response_stages: ['new'], closed_stages: ['converted', 'disqualified'], canceled_stages: ['nurture'] },
    targets: [{ metric: 'first_response', minutes: 4 * H, warning_pct: 75 }, { metric: 'resolution', minutes: 10 * 8 * H }],
    escalations: [
      { metric: 'first_response', trigger: 'warning', action: 'notify_owner' },
      { metric: 'first_response', trigger: 'breach', action: 'notify_manager' },
      { metric: '*', trigger: 'breach', action: 'create_task' },
    ],
  },
  {
    name: 'Loan — application to decision', object: 'loan_application',
    description: 'Picked up within a business day; credit decision and disbursement inside 20 business days (LOAN-FR-14).',
    config: { first_response_stages: ['enquiry', 'pre_qualified'], closed_stages: ['disbursed', 'declined'], canceled_stages: ['withdrawn', 'lapsed'] },
    targets: [{ metric: 'first_response', minutes: 8 * H }, { metric: 'resolution', minutes: 20 * 8 * H, warning_pct: 70 }],
    escalations: [{ metric: '*', trigger: 'warning', action: 'notify_owner' }, { metric: '*', trigger: 'breach', action: 'notify_manager' }],
  },
  {
    name: 'KYC — onboarding turnaround', object: 'kyc_case',
    description: 'KYC decided within 5 business days of initiation.',
    config: { first_response_stages: ['initiated'], closed_stages: ['approved', 'rejected'], canceled_stages: ['on_hold'] },
    targets: [{ metric: 'first_response', minutes: 8 * H }, { metric: 'resolution', minutes: 5 * 8 * H }],
    escalations: [{ metric: '*', trigger: 'breach', action: 'notify_manager' }],
  },
  {
    name: 'Complaints — FSC register', object: 'service_request', order_index: 0,
    description: 'Complaints: acknowledged within 1 business day, final response within 15 business days (SR-FR-03).',
    conditions: [{ field: 'request_type', op: 'equals', value: 'complaint' }],
    config: { first_response_stages: ['new'], closed_stages: ['resolved', 'closed'], dimension_field: 'priority' },
    pause_stages: ['awaiting_client'],
    targets: [{ metric: 'first_response', minutes: 8 * H }, { metric: 'resolution', minutes: 15 * 8 * H }],
    escalations: [{ metric: '*', trigger: 'warning', action: 'notify_owner' }, { metric: '*', trigger: 'breach', action: 'notify_manager' }, { metric: 'resolution', trigger: 'breach', action: 'create_task' }],
  },
  {
    name: 'Service requests', object: 'service_request', order_index: 1,
    description: 'Requests by priority: critical 1 business day, high 2, medium 5, low 10.',
    config: { first_response_stages: ['new'], closed_stages: ['resolved', 'closed'], dimension_field: 'priority' },
    pause_stages: ['awaiting_client'],
    targets: [
      { metric: 'first_response', minutes: 8 * H },
      { metric: 'resolution', priority: 'critical', minutes: 8 * H },
      { metric: 'resolution', priority: 'high', minutes: 2 * 8 * H },
      { metric: 'resolution', priority: 'medium', minutes: 5 * 8 * H },
      { metric: 'resolution', priority: 'low', minutes: 10 * 8 * H },
    ],
    escalations: [{ metric: '*', trigger: 'breach', action: 'notify_manager' }],
  },
  {
    name: 'Referral — accept within a day', object: 'referral',
    description: 'A cross-entity referral is accepted within one business day (XS-FR-03).',
    config: { first_response_stages: ['submitted'], closed_stages: ['won', 'lost'] },
    targets: [{ metric: 'first_response', minutes: 8 * H }, { metric: 'resolution', minutes: 30 * 8 * H }],
    escalations: [{ metric: 'first_response', trigger: 'breach', action: 'notify_manager' }],
  },
];

// ── Object permissions (PRD §11.3, simplified to object level) ──────────────
const FRONT = ['rm', 'loans_executive', 'portfolio_manager', 'trader', 'corporate_advisor', 'fx_dealer'];
const CREDIT = ['credit_analyst', 'loans_manager', 'credit_committee', 'board_credit_committee'];
const CONTROL = ['compliance_officer', 'mlro', 'coo'];
const ALL = [...FRONT, ...CREDIT, ...CONTROL, 'operations_checker'];

const perm = (objects, roles, can_edit) => objects.map((object) => ({ object, roles, can_view: true, can_edit }));
const permissions = [
  ...perm(['party', 'client_relationship', 'party_relationship', 'consent_record', 'enquiry', 'referral', 'service_request'], [...FRONT, 'loans_executive'], true),
  ...perm(['party', 'client_relationship', 'party_relationship', 'consent_record', 'enquiry', 'referral'], [...CREDIT, ...CONTROL, 'operations_checker'], false),
  ...perm(['service_request'], ['compliance_officer'], true),
  ...perm(['service_request'], ['mlro', 'coo', ...CREDIT, 'operations_checker'], false),
  ...perm(['kyc_case'], [...FRONT, 'compliance_officer', 'mlro'], true),
  ...perm(['kyc_case'], [...CREDIT, 'coo', 'operations_checker'], false),
  // Anyone may raise an STR; the MLRO_STR barrier then hides it from everyone but the MLRO.
  ...perm(['str_report'], ALL, true),
  ...perm(['loan_application', 'collateral'], ['loans_executive', ...CREDIT, 'operations_checker'], true),
  ...perm(['loan_application', 'collateral'], ['rm', ...CONTROL], false),
  ...perm(['risk_profile', 'suitability_record', 'wealth_mandate', 'fund_order', 'securities_account'], ['rm', 'portfolio_manager', 'trader'], true),
  ...perm(['risk_profile', 'suitability_record', 'wealth_mandate', 'fund_order', 'securities_account'], CONTROL, false),
  ...perm(['advisory_mandate', 'conflict_register'], ['corporate_advisor', 'compliance_officer'], true),
  ...perm(['advisory_mandate', 'conflict_register'], ['mlro', 'coo'], false),
  ...perm(['fx_profile'], ['fx_dealer', 'rm'], true),
  ...perm(['fx_profile'], CONTROL, false),
  ...perm(['restricted_list_entry'], ['compliance_officer', 'mlro'], true),
  ...perm(['restricted_list_entry'], [...FRONT, ...CREDIT, 'coo', 'operations_checker'], false),
  ...perm(['financial_product', 'product_routing', 'plr_rate', 'country', 'fx_rate', 'model_portfolio'], ALL, false),
];

module.exports = { workflows, assignmentRules, businessHours, slaPolicies, permissions };
