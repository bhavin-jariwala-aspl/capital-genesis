'use strict';

/**
 * SWAN Capital — automation for the full PRD scope (M01–M25) beyond the
 * phase-1 flows in automation.js. Every item is ordinary Builder
 * configuration: workflows (Builder ▸ Workflows), assignment rules, SLA
 * policies, object permissions and the sandbox integrations the workflows
 * call (Builder ▸ Integrations).
 *
 * Next-best-action rules (XS-FR-02) are workflows: a daily sweep per party
 * with an `expression` condition and a `create_record` of a suggestion —
 * editable in the Builder like any other rule.
 */

const STAGE = { trigger_type: 'field_changed', trigger_config: { field: 'pipeline_stage_id' } };
const DAILY = { trigger_type: 'scheduled', trigger_config: { interval_minutes: 1440, per_record: true, limit: 5000 } };
const HOURLY = { trigger_type: 'scheduled', trigger_config: { interval_minutes: 60, per_record: true, limit: 2000 } };
const ONCREATE = { trigger_type: 'on_create' };
const changed = (field) => ({ trigger_type: 'field_changed', trigger_config: { field } });

const trig = (description) => ({ key: 't', name: 'Trigger', step_type: 'trigger', config: { description } });
const cond = (key, name, field, operator, value, links = {}) => ({ key, name, step_type: 'condition', config: { field, operator, ...(value !== undefined ? { value } : {}) }, ...links });
const expr = (key, name, expression, links = {}) => ({ key, name, step_type: 'condition', config: { operator: 'expression', value: expression }, ...links });
const set = (key, name, field, value, links = {}) => ({ key, name, step_type: 'action', config: { field, value }, ...links });
const notify = (key, name, config, links = {}) => ({ key, name, step_type: 'notification', config, ...links });
const email = (key, name, template, extra = {}, links = {}) => ({ key, name, step_type: 'send_email', config: { template, language_field: 'preferred_language', ...extra }, ...links });
const create = (key, name, object, fields, extra = {}, links = {}) => ({ key, name, step_type: 'create_record', config: { object, fields, ...extra }, ...links });
const integrate = (key, name, integration, body, field_map, links = {}) => ({ key, name, step_type: 'integration', config: { integration, body, field_map }, ...links });
const approval = (key, name, role, title, message, onApprove, onReject, extra = {}) => ({
  key, name, step_type: 'approval', config: { role, title, message, exclude_actor: true, ...extra }, on_true: onApprove, on_false: onReject,
});
const sms = (key, name, message, message_fr, extra = {}, links = {}) => ({ key, name, step_type: 'send_sms', config: { integration: 'swan_sms', message, message_fr, to_field: 'party_mobile', language_field: 'preferred_language', ...extra }, ...links });
const doc = (key, name, template, filename) => ({ key, name, step_type: 'generate_document', config: { template, filename } });
const end = (key = 'end') => cond(key, 'End', 'record_id', 'empty');

/** A next-best-action rule: daily per party, deduplicated by rule. */
const nba = (name, label, rule, when, bu, product, reason) => ({
  object: 'party', name, label, description: `Next-best action (XS-FR-02): ${reason}`, ...DAILY,
  steps: [
    trig('Daily next-best-action sweep'),
    expr('c1', 'Rule matches', `(${when}) AND COUNT_RELATED('nba_suggestion', 'party', 'rule_status', '${rule}|open') = 0 AND COUNT_RELATED('nba_suggestion', 'party', 'rule_status', '${rule}|dismissed') = 0`),
    create('s1', 'Raise the suggestion', 'nba_suggestion', { party: '{{id}}', rule, business_unit: bu, product_code: product, reason, status: 'open' }),
    notify('n1', 'Tell the RM', { field: 'assigned_to', title: 'Next-best action — {{display_name}}', message: reason }),
  ],
});

const workflows = [
  // ── M01 Enquiries ───────────────────────────────────────────────────────────
  {
    object: 'enquiry', name: 'swan_enquiry_existing_client_rm', label: 'Enquiry — existing clients go to their RM',
    description: 'An enquiry from an existing client is reassigned to the client\'s primary RM (LEAD-FR-04).', ...ONCREATE,
    steps: [
      trig('A new enquiry'),
      cond('c1', 'Existing client with an RM', 'existing_rm', 'notempty'),
      set('a1', 'Assign to the primary RM', 'assigned_to', '{{existing_rm}}'),
      notify('n1', 'Tell the RM', { field: 'assigned_to', title: 'Existing client enquiry — {{display_name}}', message: '{{product_code}} · {{message}}' }),
    ],
  },
  {
    object: 'introducer_referral', name: 'swan_introducer_referral_intake', label: 'Introducer referral — create the enquiry',
    description: 'A referral from an introducer becomes an enquiry attributed to the introducer, inside the protection window (INT-FR-02, LEAD-FR-14).', ...ONCREATE,
    steps: [
      trig('A new introducer referral'),
      cond('c1', 'Not linked yet', 'enquiry', 'empty'),
      create('e1', 'Create the enquiry', 'enquiry', {
        first_name: '{{prospect_first_name}}', last_name: '{{prospect_last_name}}', email: '{{prospect_email}}', mobile: '{{prospect_mobile}}',
        product_code: '{{product_code}}', estimated_amount: '{{estimated_amount}}', currency_code: 'MUR', channel: 'introducer', introducer: '{{introducer}}',
        message: 'Referred by an introducer ({{referral_no}}).',
      }, { store_as: 'enquiry', stage: 'new' }),
    ],
  },
  {
    object: 'introducer_referral', name: 'swan_introducer_commission', label: 'Introducer referral — accrue commission',
    description: 'A funded referral accrues the introducer\'s commission on the funded volume (INT-FR-03).', ...STAGE,
    steps: [
      trig('Stage change'),
      cond('c1', 'Moved to Funded', 'stage', 'eq', 'funded'),
      create('c2', 'Accrue commission', 'commission_entry', { introducer: '{{introducer}}', introducer_referral: '{{id}}', period: '{{today}}', base_amount: '{{funded_amount}}', amount: '{{commission_due}}', status: 'accrued' }),
    ],
  },

  // ── M03 KYC ─────────────────────────────────────────────────────────────────
  {
    object: 'kyc_case', name: 'swan_kyc_screening', label: 'KYC — sanctions / PEP screening',
    description: 'Entering Screening calls the screening provider and records the result; any hit is logged for triage (KYC-FR-03).', ...STAGE,
    steps: [
      trig('Stage change'),
      cond('c1', 'Moved to Screening', 'stage', 'eq', 'screening'),
      integrate('i1', 'Screen the party', 'swan_screening', { name: '{{party_name}}', country: '{{party_country}}', pep: '{{pep_flag}}' },
        { screening_result: 'result', screening_reference: 'reference', screening_date: 'screened_on' }),
      set('a1', 'Mark screened', 'screening_requested', 'true'),
      expr('c2', 'Potential match?', "screening_result = 'potential_match'"),
      create('h1', 'Log the hit for triage', 'screening_hit', { kyc_case: '{{id}}', party: '{{party}}', provider: 'simulator', list_type: 'pep', matched_name: '{{party_name}}', match_score: 85, trigger: 'onboarding', disposition: 'pending', source_reference: '{{screening_reference}}' }),
      notify('n1', 'Tell Compliance', { role: 'compliance_officer', title: 'Screening hit — {{party_name}}', message: 'Triage the hit on the KYC case before risk assessment.' }),
    ],
  },
  {
    object: 'kyc_case', name: 'swan_kyc_batch_rescreen', label: 'KYC — daily batch rescreening',
    description: 'Approved clients are rescreened daily; new matches are logged and Compliance alerted (KYC-FR-03).', ...DAILY,
    steps: [
      trig('Daily rescreening'),
      cond('c1', 'Approved case', 'kyc_outcome', 'eq', 'approved'),
      integrate('i1', 'Rescreen', 'swan_screening', { name: '{{party_name}}', country: '{{party_country}}', pep: '{{pep_flag}}' }, { screening_reference: 'reference', screening_date: 'screened_on' }),
    ],
  },
  {
    object: 'screening_hit', name: 'swan_screening_hit_triage', label: 'Screening hit — escalate true matches',
    description: 'A true match or escalation alerts the MLRO and puts the KYC case on hold (KYC-FR-03, KYC-FR-05).', ...changed('disposition'),
    steps: [
      trig('Disposition changed'),
      expr('c1', 'True match or escalated', "IN(disposition, 'true_match', 'escalated')"),
      notify('n1', 'Alert the MLRO', { role: 'mlro', title: 'Screening: {{disposition}} — {{matched_name}}', message: '{{list_type}} hit ({{match_score}}%). {{rationale}}' }),
    ],
  },

  // ── M04 Suitability ─────────────────────────────────────────────────────────
  {
    object: 'party', name: 'swan_profile_refresh', label: 'Party — risk profile refresh due',
    description: 'A risk profile within 30 days of its two-year validity asks the RM to refresh it (SUIT-FR-05).', ...DAILY,
    steps: [
      trig('Daily sweep'),
      expr('c1', 'Profile expires within 30 days', "NOT(ISBLANK(profile_valid_until)) AND DAYS_BETWEEN(TODAY(), profile_valid_until) <= 30 AND NOT(profile_refresh_requested)"),
      set('a1', 'Mark requested', 'profile_refresh_requested', 'true'),
      notify('n1', 'Tell the RM', { field: 'assigned_to', title: 'Risk profile refresh — {{display_name}}', message: 'The investor profile expires {{profile_valid_until}}. Re-run the questionnaire.' }),
    ],
  },
  {
    object: 'party', name: 'swan_birthday', label: 'Party — birthday reminder',
    description: 'The RM is reminded of a client\'s birthday (RM-FR-01, C360-FR-09).', ...DAILY,
    steps: [
      trig('Daily sweep'),
      expr('c1', 'Birthday today', 'NOT(ISBLANK(date_of_birth)) AND DAYS_BETWEEN(TODAY(), next_birthday) = 0'),
      notify('n1', 'Tell the RM', { field: 'assigned_to', title: 'Birthday today — {{display_name}}', message: 'Send your wishes.' }),
    ],
  },

  // ── M05 Retail lending ──────────────────────────────────────────────────────
  {
    object: 'loan_application', name: 'swan_loan_mcib', label: 'Loan — MCIB credit report',
    description: 'With the applicant\'s consent, capturing the application pulls the MCIB report and stores the score (LOAN-FR-06).', ...STAGE,
    steps: [
      trig('Stage change'),
      cond('c1', 'Moved to Application captured', 'stage', 'eq', 'application_captured'),
      cond('c2', 'MCIB consent given', 'mcib_consent', 'eq', 'true'),
      integrate('i1', 'Pull the MCIB report', 'swan_mcib', { party: '{{party}}', name: '{{party_name}}' }, { mcib_score: 'score', mcib_rating: 'rating', mcib_reference: 'report_reference' }),
    ],
  },
  {
    object: 'loan_application', name: 'swan_loan_status_update', label: 'Loan — client status updates (EN/FR)',
    description: 'The client is told at each milestone in their language (LOAN-FR-13).', ...STAGE,
    steps: [
      trig('Stage change'),
      expr('c1', 'A client-facing milestone', "IN(stage, 'application_captured', 'documents_complete', 'credit_appraisal', 'offer_accepted', 'security_perfection', 'disbursed')"),
      email('m1', 'Status update', 'loan_status_update', { to_field: 'party_email' }),
    ],
  },
  {
    object: 'loan_application', name: 'swan_loan_cross_sell_offer', label: 'Loan — cross-sell at offer',
    description: 'At offer, a real-estate borrower is referred to SWAN insurance for life and building cover (LOAN-FR-17, I-09).', ...STAGE,
    steps: [
      trig('Stage change'),
      cond('c1', 'Moved to Offer issued', 'stage', 'eq', 'offer_issued'),
      set('a1', 'Record the PLR priced on', 'plr_at_offer', '{{plr_rate}}'),
      cond('c2', 'Real-estate loan', 'product_code', 'eq', 'LND-RE'),
      create('r1', 'Refer to SWAN insurance', 'referral', { party: '{{party}}', from_business_unit: 'LND', to_business_unit: 'INS', reason: 'Life and building insurance to be assigned to Swan Life Ltd for {{application_no}}.', estimated_value: '{{loan_amount}}' }, { stage: 'submitted' }),
    ],
  },
  {
    object: 'loan_application', name: 'swan_loan_book_account', label: 'Loan — book the account view',
    description: 'On disbursement the LMS booking is confirmed and the loan appears in the loan book (I-03 callback, SERV-FR-01).', ...STAGE,
    steps: [
      trig('Stage change'),
      cond('c1', 'Moved to Disbursed', 'stage', 'eq', 'disbursed'),
      create('l1', 'Create the loan account view', 'loan_account', {
        lms_account_no: '{{lms_reference}}', party: '{{party}}', product_code: '{{product_code}}', currency_code: '{{currency_code}}', original_amount: '{{loan_amount}}',
        outstanding: '{{loan_amount}}', rate_type: 'true', margin: '{{margin}}', instalment: '{{emi}}', status: 'active', synced_at: '{{today}}', ext_ref: 'LAC-{{lms_reference}}',
      }, { link_field: 'loan_application' }),
    ],
  },
  {
    object: 'disbursement', name: 'swan_disbursement_checker', label: 'Disbursement — maker-checker and LMS booking',
    description: 'A tranche needs a checker other than the requester; once authorised it is booked in the LMS and the reference recorded (LOAN-FR-12, X-05).', ...STAGE,
    steps: [
      trig('Stage change'),
      cond('c1', 'Moved to Checker review', 'stage', 'eq', 'checking'),
      approval('ap', 'Operations checker', 'operations_checker', 'Disbursement check: {{name}}', 'Tranche {{tranche_no}} · MUR {{amount}}. Conditions met: {{conditions_met}}.', 'ok1', 'no1', { exclude_field: 'created_by' }),
      set('ok1', 'Authorised', 'status', 'authorised'),
      integrate('ok2', 'Book in the LMS', 'swan_lms', { disbursement_no: '{{disbursement_no}}', amount: '{{amount}}' }, { lms_reference: 'booking_reference', value_date: 'booked_on' }),
      set('ok3', 'Booked', 'status', 'booked'),
      set('ok4', 'Move to Booked', 'stage', 'booked'),
      cond('guard', 'Guard: stop the approved path', 'status', 'eq', 'rejected'),
      set('no1', 'Rejected', 'status', 'rejected'),
      set('no2', 'Move to Rejected', 'stage', 'rejected'),
    ],
  },

  // ── M06 Commercial lending ──────────────────────────────────────────────────
  {
    object: 'credit_facility', name: 'swan_facility_approval', label: 'Facility — approval matrix',
    description: 'Commercial facilities follow the same amount-banded approval matrix as retail (COM-FR-07, LOAN-FR-09).', ...STAGE,
    steps: [
      trig('Stage change'),
      cond('c1', 'Moved to Credit approval', 'stage', 'eq', 'credit_approval'),
      expr('c2', 'Up to MUR 5m?', 'amount_mur <= 5000000', { on_true: 'ap_lm', on_false: 'c3' }),
      expr('c3', 'Up to MUR 20m?', 'amount_mur <= 20000000', { on_true: 'ap_cc', on_false: 'ap_bcc' }),
      approval('ap_lm', 'Loans Manager', 'loans_manager', 'Facility approval: {{name}}', '{{facility_no}} · MUR {{amount_mur}} · grade {{risk_grade}} · DSCR {{dscr}}.', 'ok1', 'no1'),
      approval('ap_cc', 'Credit Committee', 'credit_committee', 'Credit Committee: {{name}}', '{{facility_no}} · MUR {{amount_mur}} · grade {{risk_grade}} · DSCR {{dscr}}.', 'ok1', 'no1'),
      approval('ap_bcc', 'Board Credit Committee', 'board_credit_committee', 'Board Credit Committee: {{name}}', '{{facility_no}} · MUR {{amount_mur}} · grade {{risk_grade}}.', 'ok1', 'no1'),
      set('ok1', 'Decision approved', 'credit_decision', 'approved'),
      set('ok2', 'Issue the term sheet', 'stage', 'term_sheet'),
      doc('ok3', 'Generate the term sheet', 'commercial_term_sheet', 'Term sheet {{facility_no}}'),
      cond('guard', 'Guard: stop the approved path', 'credit_decision', 'eq', 'declined'),
      set('no1', 'Decision declined', 'credit_decision', 'declined'),
      set('no2', 'Move to Declined', 'stage', 'declined'),
    ],
  },
  {
    object: 'credit_facility', name: 'swan_facility_annual_review', label: 'Facility — annual review pipeline',
    description: 'Sixty days before a facility\'s review date it moves to Annual review and the RM is told (COM-FR-06).', ...DAILY,
    steps: [
      trig('Daily sweep'),
      expr('c1', 'Active and review within 60 days', "stage = 'active' AND NOT(ISBLANK(expiry_date)) AND DAYS_BETWEEN(TODAY(), expiry_date) <= 60 AND NOT(renewal_opened)"),
      set('a1', 'Mark renewal opened', 'renewal_opened', 'true'),
      set('a2', 'Move to Annual review', 'stage', 'annual_review'),
      notify('n1', 'Tell the RM', { field: 'assigned_to', title: 'Annual review due — {{name}}', message: 'Facility {{facility_no}} is due for review on {{expiry_date}}. Request updated financials.' }),
    ],
  },
  {
    object: 'covenant_test', name: 'swan_covenant_breach', label: 'Covenant — breach alert',
    description: 'A failed covenant test alerts the RM and credit, starting the waiver workflow (COM-FR-05).', ...ONCREATE,
    steps: [
      trig('A covenant test recorded'),
      cond('c1', 'Breach', 'result', 'eq', 'breach'),
      notify('n1', 'Alert RM and credit', { field: 'assigned_to', role: 'loans_manager', title: 'Covenant breach — {{name}}', message: 'Actual {{actual_value}} vs threshold {{threshold}}. Decide on a waiver or remedy.' }),
    ],
  },

  // ── M07 Collateral & M08 servicing ─────────────────────────────────────────
  {
    object: 'collateral', name: 'swan_collateral_insurance_lapse', label: 'Collateral — insurance lapsing',
    description: 'Thirty days before cover on collateral lapses the RM is told; a lapse is a breach (COLL-FR-05).', ...DAILY,
    steps: [
      trig('Daily sweep'),
      expr('c1', 'Cover lapses in 30 days', 'NOT(ISBLANK(insurance_expiry)) AND DAYS_BETWEEN(TODAY(), insurance_expiry) = 30 AND ISBLANK(released_on)'),
      notify('n1', 'Tell the RM', { field: 'assigned_to', title: 'Insurance lapsing — {{description}}', message: 'Policy {{policy_number}} ({{insurer}}) expires {{insurance_expiry}}. Obtain the renewal and assignment.' }),
    ],
  },
  {
    object: 'collateral', name: 'swan_collateral_revaluation', label: 'Collateral — revaluation due',
    description: 'Collateral due for revaluation by its type\'s frequency raises a reminder (COLL-FR-03).', ...DAILY,
    steps: [
      trig('Daily sweep'),
      expr('c1', 'Revaluation due today', "NOT(ISBLANK(next_revaluation)) AND DAYS_BETWEEN(TODAY(), next_revaluation) = 0 AND NOT(IN(collateral_type, 'fund_units', 'securities'))"),
      notify('n1', 'Tell the RM', { field: 'assigned_to', title: 'Revaluation due — {{description}}', message: 'Last valued {{valuation_date}}. Instruct an approved valuer.' }),
    ],
  },
  {
    object: 'loan_account', name: 'swan_ltv_monitor', label: 'Loan — LTV monitoring and margin calls',
    description: 'Investment-backed loans whose LTV reaches the margin-call threshold get a margin call, the client is notified and the RM alerted (COLL-FR-04).', ...DAILY,
    steps: [
      trig('Daily LTV check'),
      expr('c1', 'Margin call or liquidation threshold', "IN(ltv_status, 'margin_call', 'liquidation') AND NOT(margin_call_open)"),
      create('m1', 'Issue the margin call', 'margin_call', { loan_application: '{{loan_application}}', party: '{{party}}', ltv_at_call: '{{ltv}}', call_date: '{{today}}', cure: 'none' }, { stage: 'issued' }),
      set('a1', 'Mark margin call open', 'margin_call_open', 'true'),
      notify('n1', 'Alert the RM', { field: 'assigned_to', title: 'Margin call — {{lms_account_no}}', message: 'LTV {{ltv}}% ({{ltv_status}}).' }),
    ],
  },
  {
    object: 'margin_call', name: 'swan_margin_call_notice', label: 'Margin call — notify the client',
    description: 'A margin call letter is generated and emailed to the borrower in their language (DOC-FR-03).', ...ONCREATE,
    steps: [
      trig('A new margin call'),
      doc('d1', 'Generate the margin call notice', 'margin_call_notice', 'Margin call {{call_no}}'),
      email('m1', 'Email the borrower', 'margin_call', { to_field: 'party_email' }),
      sms('s1', 'Text the borrower', 'SWAN: a margin call {{call_no}} has been issued on your investment-backed loan. Please check your email or call your RM.',
        'SWAN : un appel de marge {{call_no}} a été émis sur votre prêt adossé. Consultez vos courriels ou appelez votre chargé.'),
    ],
  },
  {
    object: 'loan_account', name: 'swan_plr_notices', label: 'Loan — PLR change notice',
    description: 'When the Swan PLR changes, every variable-rate account gets a personalised notice and a delivery-log entry (SERV-FR-02).', ...DAILY,
    steps: [
      trig('Daily sweep'),
      expr('c1', 'Variable rate, not yet notified of the latest change', "rate_type AND NOT(ISBLANK(latest_plr_event)) AND COALESCE(notified_plr_event, 0) != latest_plr_event AND status != 'settled'"),
      create('p1', 'Log the notice', 'plr_notification', { plr_change_event: '{{latest_plr_event}}', loan_account: '{{id}}', new_instalment: '{{instalment}}', channel: 'email', status: 'sent', sent_on: '{{today}}' }),
      email('m1', 'Email the notice', 'plr_change', { to_field: 'party_email' }),
      set('a1', 'Mark notified', 'notified_plr_event', '{{latest_plr_event}}'),
    ],
  },
  {
    object: 'loan_account', name: 'swan_collections_ews', label: 'Loan — arrears early warning',
    description: 'An account entering arrears opens a collections follow-up for the RM; it closes when the account is current (SERV-FR-04).', ...DAILY,
    steps: [
      trig('Daily arrears check'),
      expr('c1', 'In arrears with no follow-up', 'COALESCE(arrears_days, 0) > 0 AND NOT(collections_opened)', { on_false: 'c2' }),
      create('a1', 'Open the follow-up', 'collection_action', { loan_account: '{{id}}', action: 'call', action_date: '{{today}}', notes: 'Early warning: {{arrears_days}} days in arrears ({{arrears_bucket}}).' }),
      set('a2', 'Mark follow-up open', 'collections_opened', 'true'),
      notify('a3', 'Tell the RM', { field: 'assigned_to', title: 'Arrears — {{lms_account_no}}', message: '{{arrears_days}} days · MUR {{arrears_amount}}.' }),
      cond('guard', 'Guard: stop', 'collections_opened', 'eq', 'false'),
      expr('c2', 'Back to current', 'COALESCE(arrears_days, 0) = 0 AND collections_opened'),
      set('b1', 'Close the follow-up', 'collections_opened', 'false'),
    ],
  },
  {
    object: 'loan_account', name: 'swan_instalment_reminder', label: 'Loan — instalment reminder by SMS',
    description: 'Three days before each instalment, active borrowers get a text reminder in their language (SERV-FR-03, I-11).', ...DAILY,
    steps: [
      trig('Daily sweep'),
      expr('c1', 'Instalment due in 3 days', "status = 'active' AND NOT(ISBLANK(next_instalment_date)) AND DAYS_BETWEEN(TODAY(), next_instalment_date) = 3"),
      sms('s1', 'Text the borrower', 'SWAN: your instalment of MUR {{instalment}} on loan {{lms_account_no}} is due on {{next_instalment_date}}.',
        'SWAN : votre mensualité de MUR {{instalment}} sur le prêt {{lms_account_no}} est due le {{next_instalment_date}}.'),
    ],
  },
  {
    object: 'loan_account', name: 'swan_maturity_retention', label: 'Loan — maturity retention',
    description: 'Loans within six months of maturity raise a retention / new-need suggestion (SERV-FR-05).', ...DAILY,
    steps: [
      trig('Daily sweep'),
      expr('c1', 'Matures within 6 months', 'NOT(ISBLANK(months_to_maturity)) AND months_to_maturity <= 6 AND NOT(renewal_opened)'),
      create('s1', 'Raise the suggestion', 'nba_suggestion', { party: '{{party}}', rule: 'maturity_retention', business_unit: 'LND', reason: 'Loan {{lms_account_no}} matures {{maturity_date}} — discuss a new need or reinvestment.', status: 'open' }),
      set('a1', 'Mark raised', 'renewal_opened', 'true'),
    ],
  },

  // ── M09 Wealth ─────────────────────────────────────────────────────────────
  {
    object: 'wealth_mandate', name: 'swan_mandate_review_scheduler', label: 'Mandate — schedule the review',
    description: 'Fourteen days before a review is due by the mandate\'s cycle, the review is opened with its preparation pack (WLT-FR-04).', ...DAILY,
    steps: [
      trig('Daily sweep'),
      expr('c1', 'Active, review due within 14 days, none open', "stage = 'active' AND NOT(ISBLANK(next_review_due)) AND DAYS_BETWEEN(TODAY(), next_review_due) <= 14 AND COUNT_RELATED('mandate_review', 'wealth_mandate', 'open', 'true') = 0"),
      create('r1', 'Open the review', 'mandate_review', { wealth_mandate: '{{id}}', due_date: '{{next_review_due}}', review_type: '{{review_frequency}}' }, { stage: 'scheduled' }),
      notify('n1', 'Tell the portfolio manager', { field: 'assigned_to', title: 'Review due — {{name}}', message: 'Due {{next_review_due}}. AUM {{aum}} {{base_currency}}, YTD {{ytd_return_pct}}%.' }),
    ],
  },
  {
    object: 'mandate_review', name: 'swan_mandate_review_invite', label: 'Review — invite the client',
    description: 'A prepared review pack invites the client to the meeting in their language.', ...STAGE,
    steps: [
      trig('Stage change'),
      cond('c1', 'Pack prepared', 'stage', 'eq', 'pack_prepared'),
      notify('n1', 'Tell the portfolio manager', { field: 'assigned_to', title: 'Review pack ready — {{name}}', message: 'Send the invitation and the pack to the client.' }),
    ],
  },
  {
    object: 'wealth_mandate', name: 'swan_mandate_attrition', label: 'Mandate — attrition risk alert',
    description: 'Declining assets, missed reviews or a complaint raise an RM task once (WLT-FR-08).', ...DAILY,
    steps: [
      trig('Daily sweep'),
      expr('c1', 'At risk, not yet alerted', 'attrition_risk AND NOT(attrition_alerted)', { on_false: 'c2' }),
      set('a1', 'Mark alerted', 'attrition_alerted', 'true'),
      notify('a2', 'Tell the RM', { field: 'assigned_to', title: 'Attrition risk — {{name}}', message: 'Overdue reviews {{reviews_overdue}}, net flows {{net_flows_ytd}}. Call the client.' }),
      cond('guard', 'Guard: stop', 'attrition_alerted', 'eq', 'false'),
      expr('c2', 'No longer at risk', 'NOT(attrition_risk) AND attrition_alerted'),
      set('b1', 'Clear the alert', 'attrition_alerted', 'false'),
    ],
  },
  {
    object: 'saac_decision', name: 'swan_saac_communication', label: 'SAAC — brief the portfolio managers',
    description: 'A new SAAC decision is pushed to portfolio managers to communicate to affected clients (WLT-FR-06).', ...ONCREATE,
    steps: [trig('A new SAAC decision'), notify('n1', 'Tell portfolio managers', { role: 'portfolio_manager', title: 'SAAC decision — {{title}}', message: 'Models {{affected_models}}: {{allocation_change}}' })],
  },

  // ── M10 Funds ──────────────────────────────────────────────────────────────
  {
    object: 'fund_order', name: 'swan_fund_order_checker', label: 'Fund order — maker-checker and TA hand-off',
    description: 'Checks complete → an operations checker other than the maker authorises → the order goes to the transfer agent and is confirmed (FND-FR-02).', ...STAGE,
    steps: [
      trig('Stage change'),
      cond('c1', 'Moved to Checks complete', 'stage', 'eq', 'checked'),
      approval('ap', 'Operations checker', 'operations_checker', 'Fund order check: {{name}}', '{{order_no}} · {{amount}} {{currency_code}}. Payment proof: {{payment_proof_received}}.', 'ok1', 'no1', { exclude_field: 'created_by' }),
      set('ok1', 'Send to TA', 'stage', 'submitted_to_ta'),
      integrate('ok2', 'Transfer agent', 'swan_ta', { order_no: '{{order_no}}', fund: '{{fund_code}}', amount: '{{amount}}', order_type: '{{order_type}}' }, { ta_reference: 'ta_reference' }),
      set('ok3', 'Confirmed', 'stage', 'confirmed'),
      email('ok4', 'Confirm to the investor', 'fund_order_confirmation', { to_field: 'party_email' }),
      cond('guard', 'Guard: stop the approved path', 'stage', 'eq', 'rejected'),
      set('no1', 'Reject', 'stage', 'rejected'),
    ],
  },
  {
    object: 'fund_holding', name: 'swan_fmb_maturity', label: 'Funds — FMB 2029 reinvestment',
    description: 'Fixed Maturity Bond holders within six months of maturity get a reinvestment proposal (FND-FR-04, XS-FR-02).', ...DAILY,
    steps: [
      trig('Daily sweep'),
      expr('c1', 'FMB maturing within 6 months', "product_code = 'FND-FMB29' AND NOT(ISBLANK(maturity_date)) AND MONTHS_BETWEEN(TODAY(), maturity_date) <= 6 AND NOT(maturity_nba_raised)"),
      create('s1', 'Raise the reinvestment suggestion', 'nba_suggestion', { party: '{{party}}', rule: 'fmb_reinvestment', business_unit: 'FND', product_code: 'FND-INC', reason: 'FMB 2029 matures {{maturity_date}} — propose reinvestment.', status: 'open' }),
      set('a1', 'Mark raised', 'maturity_nba_raised', 'true'),
    ],
  },
  {
    object: 'distribution_notice', name: 'swan_distribution_publish', label: 'Funds — distribution notice published',
    description: 'Publishing a distribution notice tells the fund team to distribute it to unitholders (FND-FR-06).', ...changed('published'),
    steps: [trig('Published flag changed'), cond('c1', 'Published', 'published', 'eq', 'true'), notify('n1', 'Tell the fund team', { role: 'portfolio_manager', title: 'Distribution notice published — {{name}}', message: '{{notice_text}}' })],
  },

  // ── M11 Securities ─────────────────────────────────────────────────────────
  {
    object: 'client_order', name: 'swan_client_order_oms', label: 'Order — hand off to the OMS',
    description: 'Sending an instruction to the OMS records the OMS reference for best-execution evidence (SEC-FR-03).', ...STAGE,
    steps: [
      trig('Stage change'),
      cond('c1', 'Moved to Sent to OMS', 'stage', 'eq', 'sent_to_oms'),
      integrate('i1', 'Send to the OMS', 'swan_oms', { order_ref: '{{order_ref}}', instrument: '{{instrument}}', quantity: '{{quantity}}', side: '{{side}}' }, { oms_reference: 'oms_reference' }),
    ],
  },
  {
    object: 'securities_account', name: 'swan_dormant_reactivation', label: 'Securities — dormant account reactivation',
    description: 'Accounts without a trade for 12 months get a reactivation suggestion (SEC-FR-06).', ...DAILY,
    steps: [
      trig('Daily sweep'),
      expr('c1', 'Dormant, no open suggestion', "dormant AND COUNT_RELATED('nba_suggestion', 'party', 'rule_status', 'dormant_reactivation|open') = 0"),
      create('s1', 'Raise the suggestion', 'nba_suggestion', { party: '{{party}}', rule: 'dormant_reactivation', business_unit: 'SEC', product_code: 'SEC-LOC', reason: 'No trade since {{last_trade_date}} — share the latest research and market statistics.', status: 'open' }),
    ],
  },
  {
    object: 'restricted_list_entry', name: 'swan_restricted_list_alert', label: 'Restricted list — alert the public side',
    description: 'A new restricted-list issuer is announced to traders and portfolio managers; watch-list entries stay with Compliance (CMP-FR-03).', ...ONCREATE,
    steps: [
      trig('A new list entry'),
      cond('c1', 'Restricted list', 'list_type', 'eq', 'restricted'),
      notify('n1', 'Tell traders', { role: 'trader', title: 'Restricted list: {{issuer}}', message: 'No orders or trade ideas until further notice.' }),
      notify('n2', 'Tell portfolio managers', { role: 'portfolio_manager', title: 'Restricted list: {{issuer}}', message: 'No orders or trade ideas until further notice.' }),
    ],
  },

  // ── M12 Advisory ───────────────────────────────────────────────────────────
  {
    object: 'advisory_mandate', name: 'swan_advisory_conflict_check', label: 'Advisory — open the conflict check',
    description: 'Moving a mandate to Conflict check opens a check for Compliance across the party master, relationships, open mandates and the restricted list (ADV-FR-02).', ...STAGE,
    steps: [
      trig('Stage change'),
      cond('c1', 'Moved to Conflict check', 'stage', 'eq', 'conflict_check'),
      create('k1', 'Open the conflict check', 'conflict_check', { advisory_mandate: '{{id}}', decision: 'pending' }, { stage: 'requested' }),
      notify('n1', 'Tell Compliance', { role: 'compliance_officer', title: 'Conflict check — {{code_name}}', message: 'Review the matches and decide.' }),
    ],
  },
  {
    object: 'conflict_check', name: 'swan_conflict_decision', label: 'Conflict check — record on the mandate',
    description: 'Compliance\'s decision is written back to the mandate (cleared or declined) and stored as the audit artifact (ADV-FR-02).', ...changed('decision'),
    steps: [
      trig('Decision changed'),
      expr('c1', 'Cleared (with or without controls)?', "IN(decision, 'cleared', 'managed')", { on_false: 'c2' }),
      set('a1', 'Mandate: cleared', 'advisory_mandate.conflict_check', 'cleared'),
      set('a2', 'Decided on', 'decided_on', '{{today}}'),
      set('a3', 'Move to Decided', 'stage', 'decided'),
      cond('guard', 'Guard: stop', 'decision', 'eq', 'pending'),
      cond('c2', 'Declined?', 'decision', 'eq', 'declined'),
      set('b1', 'Mandate: declined', 'advisory_mandate.conflict_check', 'declined'),
      set('b2', 'Decided on', 'decided_on', '{{today}}'),
      set('b3', 'Move to Decided', 'stage', 'decided'),
    ],
  },
  {
    object: 'advisory_mandate', name: 'swan_advisory_engagement_letter', label: 'Advisory — engagement letter',
    description: 'Entering Engagement generates the engagement letter (by code name) for e-signature (DOC-FR-03).', ...STAGE,
    steps: [trig('Stage change'), cond('c1', 'Moved to Engagement letter', 'stage', 'eq', 'engagement'), doc('d1', 'Generate the engagement letter', 'engagement_letter', 'Engagement letter {{code_name}}')],
  },
  {
    object: 'deal_team_member', name: 'swan_deal_team_insider', label: 'Deal team — add to the insider list',
    description: 'Every deal-team member is automatically added to the mandate\'s insider list with date, time and reason (ADV-FR-04).', ...ONCREATE,
    steps: [
      trig('A new deal-team member'),
      cond('c1', 'Not yet on the list', 'insider_added', 'empty'),
      create('i1', 'Add to the insider list', 'insider_list_entry', { advisory_mandate: '{{advisory_mandate}}', person: '{{employee_name}}', person_type: 'staff', organisation: 'Swan Corporate Advisors Ltd', received_at: '{{today}}', reason: 'Deal team ({{deal_role}}).' }),
      set('a1', 'Mark added', 'insider_added', 'true'),
    ],
  },
  {
    object: 'advisory_deliverable', name: 'swan_milestone_invoice', label: 'Advisory — milestone fee invoice',
    description: 'A delivered fee milestone raises the fee invoice for accounting (ADV-FR-08, REV-FR-03).', ...STAGE,
    steps: [
      trig('Stage change'),
      cond('c1', 'Delivered', 'stage', 'eq', 'delivered'),
      cond('c2', 'Has a milestone fee', 'milestone_fee', 'notempty'),
      cond('c3', 'Not invoiced', 'invoice_raised', 'empty'),
      create('f1', 'Raise the invoice', 'fee_invoice', { advisory_mandate: '{{advisory_mandate}}', advisory_deliverable: '{{id}}', fee_type: 'milestone', amount: '{{milestone_fee}}', issued_on: '{{today}}', status: 'sent_to_accounting' }),
      set('a1', 'Mark invoiced', 'invoice_raised', 'true'),
    ],
  },

  // ── M13 Forex ──────────────────────────────────────────────────────────────
  {
    object: 'fx_quote', name: 'swan_fx_quote_accepted', label: 'FX quote — book the deal',
    description: 'An accepted quote becomes a deal booked in the dealing system with a time-stamped trail (FX-FR-03).', ...STAGE,
    steps: [
      trig('Stage change'),
      cond('c1', 'Accepted', 'stage', 'eq', 'accepted'),
      create('d1', 'Create the deal', 'fx_deal', { party: '{{party}}', fx_profile: '{{fx_profile}}', fx_quote: '{{id}}', product: '{{product}}', side: '{{side}}', currency_code: '{{currency_code}}', amount: '{{amount}}', deal_rate: '{{quoted_rate}}', trade_date: '{{today}}', value_date: '{{value_date}}' }),
    ],
  },
  {
    object: 'fx_deal', name: 'swan_fx_deal_booking', label: 'FX deal — dealing-system reference',
    description: 'A new deal is booked in the dealing system and its reference recorded (FX-FR-03).', ...ONCREATE,
    steps: [
      trig('A new deal'),
      cond('c1', 'No reference yet', 'dealing_reference', 'empty'),
      integrate('i1', 'Book in the dealing system', 'swan_fx_dealing', { deal_no: '{{deal_no}}', currency_code: '{{currency_code}}', amount: '{{amount}}' }, { dealing_reference: 'dealing_reference' }),
    ],
  },
  {
    object: 'fx_rate_alert', name: 'swan_fx_rate_alert', label: 'FX — rate alerts',
    description: 'Hourly: an alert whose target the board rate has reached is sent to the client and closed (FX-FR-04).', ...HOURLY,
    steps: [
      trig('Hourly check'),
      cond('c1', 'Active', 'stage', 'eq', 'active'),
      expr('c2', 'Target reached', "IF(direction = 'below', LOOKUP('fx_rate', 'currency_code', currency_code, 'rate_to_mur', 'rate_date') <= target_rate, LOOKUP('fx_rate', 'currency_code', currency_code, 'rate_to_mur', 'rate_date') >= target_rate)"),
      cond('ch', 'Client asked for SMS', 'channel', 'eq', 'sms', { on_false: 'm1' }),
      sms('s1', 'Text the client', 'SWAN Forex: {{currency_code}} is at {{current_rate}} MUR, your target was {{target_rate}}. Call your dealer to book.',
        'SWAN Forex : le {{currency_code}} est à {{current_rate}} MUR, votre objectif était {{target_rate}}. Appelez votre cambiste.', {}, { on_true: 'a1' }),
      email('m1', 'Tell the client', 'fx_rate_alert', { to_field: 'party_email' }),
      set('a1', 'Triggered on', 'triggered_on', '{{today}}'),
      set('a2', 'Move to Triggered', 'stage', 'triggered'),
      notify('n1', 'Tell the dealer', { field: 'assigned_to', title: 'Rate alert hit — {{name}}', message: 'Call the client to deal.' }),
    ],
  },
  {
    object: 'fx_deal', name: 'swan_fx_forward_maturity', label: 'FX — forward maturity reminder',
    description: 'A week before an open forward matures the dealer and client are reminded and a roll-over offered (FX-FR-05).', ...DAILY,
    steps: [
      trig('Daily sweep'),
      expr('c1', 'Open forward maturing in 7 days', 'open_forward AND days_to_value = 7 AND NOT(rollover_offered)'),
      email('m1', 'Remind the client', 'fx_forward_maturity', { to_field: 'party_email' }),
      set('a1', 'Mark roll-over offered', 'rollover_offered', 'true'),
      notify('n1', 'Tell the dealer', { field: 'assigned_to', title: 'Forward maturing — {{name}}', message: 'Value date {{value_date}}. Offer a roll-over.' }),
    ],
  },

  // ── M14 Cross-sell ─────────────────────────────────────────────────────────
  nba('swan_nba_ibl', 'NBA — fund holder → Investment-Backed Loan', 'ibl_for_fund_holder',
    'COALESCE(fund_holdings_mur, 0) >= 1000000 AND COALESCE(loan_exposure_mur, 0) = 0', 'LND', 'LND-IBL',
    'Fund holdings above MUR 1m and no loan — liquidity without selling (Investment-Backed Loan).'),
  nba('swan_nba_wealth_for_borrower', 'NBA — borrower → Wealth / Money Market', 'wealth_for_borrower',
    'COALESCE(loan_exposure_mur, 0) >= 3000000 AND COALESCE(aum_mur, 0) = 0 AND COALESCE(fund_holdings_mur, 0) = 0', 'WLT', 'FND-MMF',
    'Real-estate borrower without investments — park surplus funds in the Money Market Fund or open a wealth account.'),
  nba('swan_nba_fx_corporate', 'NBA — corporate → FX hedging', 'fx_for_corporate',
    "party_type = 'organisation' AND IN(sector, 'tourism', 'trade', 'manufacturing') AND COUNT_RELATED('fx_profile', 'party') = 0", 'FX', 'FX-FWD',
    'Corporate with foreign-currency revenue or costs — offer forward hedging.'),
  nba('swan_nba_hnw_discovery', 'NBA — HNW without a mandate → Wealth discovery', 'wealth_discovery_hnw',
    "IN(segment, 'hnw', 'uhnw') AND COALESCE(aum_mur, 0) = 0", 'WLT', 'WLT-DPM',
    'HNW client without a wealth mandate — book a discovery meeting.'),
  {
    object: 'nba_suggestion', name: 'swan_nba_accept', label: 'NBA — accepted suggestion opens an opportunity',
    description: 'Accepting a suggestion opens the opportunity with the referrer credited (XS-FR-01, XS-FR-03).', ...changed('status'),
    steps: [
      trig('Status changed'),
      cond('c1', 'Accepted', 'status', 'eq', 'accepted'),
      create('o1', 'Open the opportunity', 'fs_opportunity', { party: '{{party}}', business_unit: '{{business_unit}}', product_code: '{{product_code}}', amount: '1000000', currency_code: 'MUR', probability: '25', forecast_category: 'pipeline', nba_suggestion: '{{id}}' }, { stage: 'identified' }),
    ],
  },

  // ── M16 Service ────────────────────────────────────────────────────────────
  {
    object: 'service_request', name: 'swan_service_intake', label: 'Service — stamp and route approvals',
    description: 'Stamps the received date; requests that the catalogue marks as needing approval go to the business-unit head (SR-FR-01).', ...ONCREATE,
    steps: [
      trig('A new request'),
      cond('c0', 'Received date missing?', 'created_on', 'empty', undefined, { on_false: 'c1' }),
      set('a0', 'Received on', 'created_on', '{{today}}'),
      cond('c1', 'Needs approval?', 'needs_approval', 'eq', 'true'),
      approval('ap', 'Business-unit head', 'bu_head', 'Service approval: {{name}}', '{{request_type}} for {{party_email}}: {{description}}', 'ok', 'no'),
      notify('ok', 'Approved — tell the owner', { field: 'assigned_to', title: 'Approved — {{name}}', message: 'Proceed with the request.' }),
      cond('guard', 'Guard: stop', 'request_type', 'empty'),
      notify('no', 'Declined — tell the owner', { field: 'assigned_to', title: 'Not approved — {{name}}', message: 'Explain the decision to the client.' }),
    ],
  },
  {
    object: 'service_request', name: 'swan_service_csat', label: 'Service — satisfaction survey',
    description: 'A resolved request sends the CSAT / NPS survey in the client\'s language (SR-FR-05).', ...STAGE,
    steps: [trig('Stage change'), cond('c1', 'Resolved', 'stage', 'eq', 'resolved'), email('m1', 'Send the survey', 'csat_survey', { to_field: 'party_email' })],
  },

  // ── M18 Marketing ──────────────────────────────────────────────────────────
  {
    object: 'event_registration', name: 'swan_event_follow_up', label: 'Event — follow up attendees',
    description: 'An attended registration reminds the RM to follow up (MKT-FR-05).', ...changed('attended'),
    steps: [trig('Attendance recorded'), cond('c1', 'Attended', 'attended', 'eq', 'true'), cond('c2', 'Not followed up', 'follow_up_done', 'empty'), notify('n1', 'Tell the RM', { field: 'assigned_to', title: 'Event follow-up — {{name}}', message: 'Thank the guest and book a meeting.' })],
  },

  // ── Website touchpoints (I-01) ─────────────────────────────────────────────
  {
    object: 'web_event', name: 'swan_web_callback', label: 'Website — call-back request',
    description: '"Talk to us / Talk to our Forexpert" call-back requests become enquiries routed to the right desk (§2.4).', ...ONCREATE,
    steps: [
      trig('A new web event'),
      cond('c1', 'Call-back request', 'event_type', 'eq', 'callback_request'),
      expr('c2', 'Forex?', "topic = 'forex'", { on_true: 'e_fx', on_false: 'c3' }),
      create('e_fx', 'Forex enquiry', 'enquiry', { first_name: '{{first_name}}', last_name: '{{last_name}}', email: '{{email}}', mobile: '{{mobile}}', product_code: 'FX-GEN', channel: 'phone', message: 'Call-back requested ({{preferred_time}}).', consent_marketing: '{{consent_marketing}}' }, { store_as: 'enquiry', stage: 'new' }, { on_true: 'm1' }),
      expr('c3', 'Loans?', "topic = 'loans'", { on_true: 'e_ln', on_false: 'e_inv' }),
      create('e_ln', 'Loans enquiry', 'enquiry', { first_name: '{{first_name}}', last_name: '{{last_name}}', email: '{{email}}', mobile: '{{mobile}}', product_code: 'LND-RE', channel: 'phone', message: 'Call-back requested ({{preferred_time}}).', consent_marketing: '{{consent_marketing}}' }, { store_as: 'enquiry', stage: 'new' }, { on_true: 'm1' }),
      create('e_inv', 'Investments enquiry', 'enquiry', { first_name: '{{first_name}}', last_name: '{{last_name}}', email: '{{email}}', mobile: '{{mobile}}', product_code: 'WLT-DPM', channel: 'phone', message: 'Call-back requested ({{preferred_time}}).', consent_marketing: '{{consent_marketing}}' }, { store_as: 'enquiry', stage: 'new' }),
      email('m1', 'Acknowledge', 'callback_ack', { to_field: 'email', language_field: undefined }),
    ],
  },
  {
    object: 'web_event', name: 'swan_web_newsletter', label: 'Website — newsletter sign-up',
    description: 'A newsletter sign-up is welcomed and passed to Marketing (MKT-FR-04).', ...ONCREATE,
    steps: [
      trig('A new web event'),
      cond('c1', 'Newsletter sign-up', 'event_type', 'eq', 'newsletter_signup'),
      email('m1', 'Welcome', 'newsletter_welcome', { to_field: 'email', language_field: undefined }),
      notify('n1', 'Tell Marketing', { role: 'marketing', title: 'Newsletter sign-up — {{email}}', message: 'Topic: {{topic}}. Match to a party and record the subscription.' }),
    ],
  },

  // ── M21 Compliance registers ───────────────────────────────────────────────
  {
    object: 'data_subject_request', name: 'swan_dsr_intake', label: 'DPA — acknowledge a data subject request',
    description: 'A data subject request is acknowledged and Compliance alerted; the 30-day SLA runs (CMP-FR-08).', ...ONCREATE,
    steps: [
      trig('A new request'),
      notify('n1', 'Tell Compliance', { role: 'compliance_officer', title: 'Data subject request — {{name}}', message: 'Respond by {{due_by}}.' }),
    ],
  },
  {
    object: 'gift_register', name: 'swan_gift_threshold', label: 'Gifts — above-threshold approval',
    description: 'A gift or hospitality above MUR 5,000 goes to Compliance (CMP-FR-05).', ...ONCREATE,
    steps: [trig('A new declaration'), cond('c1', 'Above threshold', 'needs_approval', 'eq', 'true'), notify('n1', 'Tell Compliance', { role: 'compliance_officer', title: 'Gift above threshold — {{name}}', message: 'MUR {{estimated_value}} — decide.' })],
  },
  {
    object: 'pa_dealing', name: 'swan_pa_dealing_check', label: 'Personal dealing — pre-clearance',
    description: 'Requests in a restricted security are refused automatically; others go to Compliance (CMP-FR-05).', ...ONCREATE,
    steps: [
      trig('A new request'),
      expr('c1', 'Restricted security?', "restricted = 'restricted'", { on_false: 'n1' }),
      set('a1', 'Refuse', 'decision', 'refused'),
      cond('guard', 'Guard: stop', 'decision', 'eq', 'pending'),
      notify('n1', 'Tell Compliance', { role: 'compliance_officer', title: 'Pre-clearance — {{name}}', message: 'List status: {{restricted}}.' }),
    ],
  },
];

// ── Assignment ───────────────────────────────────────────────────────────────
const assignmentRules = [
  { object: 'fs_opportunity', name: 'Opportunities — by business unit', rule_type: 'rule_based', conditions: [{ field: 'business_unit', operator: 'equals', value: 'LND' }], pool: ['SWLOAN1', 'SWLOAN2'], fallback: 'SWRM1', order_index: 1 },
  { object: 'fs_opportunity', name: 'Opportunities — wealth', rule_type: 'rule_based', conditions: [{ field: 'business_unit', operator: 'equals', value: 'WLT' }], pool: ['SWRM2', 'SWPM1'], fallback: 'SWRM2', order_index: 2 },
  { object: 'credit_facility', name: 'Commercial facilities', rule_type: 'round_robin', pool: ['SWRM3'], fallback: 'SWRM3' },
  { object: 'fx_quote', name: 'FX quotes', rule_type: 'round_robin', pool: ['SWFX1'], fallback: 'SWFX1' },
  { object: 'fund_order', name: 'Fund orders', rule_type: 'round_robin', pool: ['SWPM2'], fallback: 'SWPM1' },
  { object: 'client_order', name: 'Client orders', rule_type: 'round_robin', pool: ['SWTRD1'], fallback: 'SWTRD1' },
  { object: 'data_subject_request', name: 'Data subject requests', rule_type: 'round_robin', pool: ['SWCOMP1'], fallback: 'SWCOMP1' },
  { object: 'introducer_referral', name: 'Introducer referrals', rule_type: 'round_robin', pool: ['SWBDH'], fallback: 'SWBDH' },
  { object: 'conflict_check', name: 'Conflict checks', rule_type: 'round_robin', pool: ['SWCOMP1'], fallback: 'SWCOMP1' },
  { object: 'margin_call', name: 'Margin calls', rule_type: 'round_robin', pool: ['SWLMGR'], fallback: 'SWLMGR' },
];

// ── SLA (business hours: Mauritius) ─────────────────────────────────────────
const H = 60;
const slaPolicies = [
  {
    name: 'Disbursement — checker turnaround', object: 'disbursement',
    description: 'A disbursement request is checked within one business day and booked within two.',
    config: { first_response_stages: ['requested', 'checking'], closed_stages: ['booked', 'rejected'] },
    targets: [{ metric: 'first_response', minutes: 8 * H }, { metric: 'resolution', minutes: 2 * 8 * H }],
    escalations: [{ metric: '*', trigger: 'breach', action: 'notify_manager' }],
  },
  {
    name: 'Fund orders — before the dealing cut-off', object: 'fund_order',
    description: 'Orders are checked and sent to the transfer agent within half a business day.',
    config: { first_response_stages: ['captured'], closed_stages: ['confirmed', 'rejected'] },
    targets: [{ metric: 'first_response', minutes: 2 * H }, { metric: 'resolution', minutes: 4 * H }],
    escalations: [{ metric: '*', trigger: 'warning', action: 'notify_owner' }],
  },
  {
    name: 'FX quotes — respond fast', object: 'fx_quote',
    description: 'A quote request is answered within 15 business minutes (best execution).',
    config: { first_response_stages: ['requested'], closed_stages: ['accepted', 'rejected', 'expired'] },
    targets: [{ metric: 'first_response', minutes: 15 }, { metric: 'resolution', minutes: 2 * H }],
    escalations: [{ metric: 'first_response', trigger: 'breach', action: 'notify_manager' }],
  },
  {
    name: 'Conflict checks — two business days', object: 'conflict_check',
    description: 'Compliance decides a conflict check within two business days (ADV-FR-02).',
    config: { first_response_stages: ['requested'], closed_stages: ['decided'] },
    targets: [{ metric: 'first_response', minutes: 4 * H }, { metric: 'resolution', minutes: 2 * 8 * H }],
    escalations: [{ metric: '*', trigger: 'breach', action: 'notify_manager' }],
  },
  {
    name: 'Data subject requests — 30 days', object: 'data_subject_request',
    description: 'Mauritius DPA 2017: respond within one month (CMP-FR-08).',
    config: { first_response_stages: ['received'], closed_stages: ['completed', 'refused'] },
    targets: [{ metric: 'first_response', minutes: 2 * 8 * H }, { metric: 'resolution', minutes: 21 * 8 * H, warning_pct: 70 }],
    escalations: [{ metric: '*', trigger: 'warning', action: 'notify_owner' }, { metric: '*', trigger: 'breach', action: 'notify_manager' }],
  },
  {
    name: 'Margin calls — cure window', object: 'margin_call',
    description: 'A margin call is cured within five business days.',
    config: { first_response_stages: ['issued'], closed_stages: ['cured', 'liquidation'] },
    targets: [{ metric: 'first_response', minutes: 4 * H }, { metric: 'resolution', minutes: 5 * 8 * H }],
    escalations: [{ metric: '*', trigger: 'breach', action: 'notify_manager' }],
  },
  {
    name: 'Commercial credit — memo to decision', object: 'credit_facility',
    description: 'From credit memo to decision within 10 business days (COM-FR-07, LOAN-FR-14).',
    config: { first_response_stages: ['origination'], closed_stages: ['active', 'declined', 'closed'] },
    targets: [{ metric: 'first_response', minutes: 2 * 8 * H }, { metric: 'resolution', minutes: 30 * 8 * H, warning_pct: 70 }],
    escalations: [{ metric: '*', trigger: 'breach', action: 'notify_manager' }],
  },
];

// ── Integrations (sandbox simulators; switch type + URL to go live) ─────────
const integrations = [
  ['swan_screening', 'Sanctions / PEP screening (sandbox)', 'screening'],
  ['swan_mcib', 'MCIB credit bureau (sandbox)', 'mcib'],
  ['swan_lms', 'Core loan system (sandbox)', 'lms'],
  ['swan_ta', 'Transfer agent (sandbox)', 'ta'],
  ['swan_oms', 'Order management system (sandbox)', 'oms'],
  ['swan_fx_dealing', 'FX dealing system (sandbox)', 'fx_dealing'],
  ['swan_sms', 'SMS gateway (sandbox)', 'sms'],
].map(([name, label, provider]) => ({ name, label, type: 'simulator', config: { provider }, is_active: true }));

// ── Object permissions for the phase-2/3 objects (PRD §11.3) ────────────────
const FRONT = ['rm', 'loans_executive', 'portfolio_manager', 'trader', 'corporate_advisor', 'fx_dealer'];
const CREDIT = ['credit_analyst', 'loans_manager', 'credit_committee', 'board_credit_committee'];
const CONTROL = ['compliance_officer', 'mlro', 'coo', 'bu_head', 'auditor'];
const ALL = [...FRONT, ...CREDIT, ...CONTROL, 'operations_checker', 'marketing'];
const perm = (objects, roles, can_edit) => objects.map((object) => ({ object, roles, can_view: true, can_edit }));
const permissions = [
  // Client 360 extras
  ...perm(['client_group', 'contact_point'], [...FRONT, 'loans_executive'], true),
  ...perm(['client_group', 'contact_point'], [...CREDIT, ...CONTROL, 'operations_checker', 'marketing'], false),
  ...perm(['web_event'], ['marketing', 'rm', 'loans_executive'], true),
  ...perm(['web_event'], CONTROL, false),
  // Cross-sell & RM workbench
  ...perm(['fs_opportunity', 'nba_suggestion', 'meeting_note'], FRONT, true),
  ...perm(['fs_opportunity', 'nba_suggestion', 'meeting_note'], [...CREDIT, ...CONTROL], false),
  ...perm(['rm_target'], ['coo', 'bu_head'], true),
  ...perm(['rm_target'], [...FRONT, 'auditor'], false),
  // Lending
  ...perm(['loan_applicant', 'credit_condition', 'loan_offer', 'disbursement', 'credit_facility', 'financial_spread', 'covenant', 'covenant_test',
    'collateral_link', 'collateral_valuation', 'margin_call', 'loan_account', 'plr_change_event', 'plr_notification', 'collection_action'],
  ['loans_executive', ...CREDIT, 'operations_checker'], true),
  ...perm(['credit_facility', 'financial_spread', 'covenant', 'covenant_test', 'collateral_link', 'loan_account', 'collection_action'], ['rm'], true),
  ...perm(['loan_applicant', 'credit_condition', 'loan_offer', 'disbursement', 'collateral_valuation', 'margin_call', 'plr_change_event', 'plr_notification'], ['rm', ...CONTROL], false),
  ...perm(['credit_facility', 'financial_spread', 'covenant', 'covenant_test', 'collateral_link', 'loan_account', 'collection_action'], CONTROL, false),
  // Investments
  ...perm(['mandate_review', 'aum_snapshot', 'saac_decision', 'fund', 'fund_share_class', 'nav_history', 'fund_holding', 'fund_campaign', 'distribution_notice'], ['rm', 'portfolio_manager'], true),
  ...perm(['client_order', 'ioi_entry', 'research_publication'], ['trader', 'rm'], true),
  ...perm(['mandate_review', 'aum_snapshot', 'saac_decision', 'fund', 'fund_share_class', 'nav_history', 'fund_holding', 'fund_campaign', 'distribution_notice', 'client_order', 'ioi_entry', 'research_publication'],
    [...CONTROL, 'operations_checker', 'loans_executive', 'credit_analyst'], false),
  // Advisory (private side — the barrier still applies on top of these)
  ...perm(['conflict_check', 'deal_team_member', 'insider_list_entry', 'investor_target', 'advisory_deliverable', 'time_entry', 'fee_invoice'], ['corporate_advisor', 'compliance_officer'], true),
  ...perm(['conflict_check', 'deal_team_member', 'insider_list_entry', 'investor_target', 'advisory_deliverable', 'time_entry', 'fee_invoice'], ['mlro', 'coo', 'auditor'], false),
  ...perm(['deal_credential'], ['corporate_advisor', 'marketing'], true),
  ...perm(['deal_credential'], [...FRONT, ...CONTROL], false),
  // Forex
  ...perm(['fx_quote', 'fx_deal', 'fx_rate_alert'], ['fx_dealer'], true),
  ...perm(['fx_quote', 'fx_deal', 'fx_rate_alert'], ['rm', ...CONTROL], false),
  // Marketing, partners, revenue
  ...perm(['campaign', 'campaign_member', 'segment', 'marketing_event', 'event_registration', 'subscription'], ['marketing', 'bu_head'], true),
  ...perm(['campaign', 'campaign_member', 'segment', 'marketing_event', 'event_registration', 'subscription'], [...FRONT, 'coo', 'compliance_officer', 'auditor'], false),
  ...perm(['introducer', 'introducer_referral', 'commission_entry'], ['bu_head', 'marketing'], true),
  ...perm(['introducer', 'introducer_referral', 'commission_entry'], [...FRONT, ...CONTROL], false),
  ...perm(['revenue_entry'], ['coo', 'bu_head'], true),
  ...perm(['revenue_entry'], [...FRONT, 'auditor', 'compliance_officer'], false),
  // Compliance registers
  ...perm(['screening_hit', 'kyc_reliance', 'gift_register', 'pa_dealing', 'data_subject_request'], ['compliance_officer', 'mlro'], true),
  ...perm(['kyc_reliance', 'data_subject_request'], [...FRONT, 'coo', 'auditor'], false),
  ...perm(['gift_register', 'pa_dealing'], ALL, true),
  // Masters
  ...perm(['kyc_risk_factor', 'collateral_type', 'approval_matrix', 'service_catalogue', 'reason_code'], ['compliance_officer'], true),
  ...perm(['kyc_risk_factor', 'collateral_type', 'approval_matrix', 'service_catalogue', 'reason_code'], ALL, false),
  // New roles on the phase-1 objects
  ...perm(['party', 'client_relationship', 'party_relationship', 'consent_record', 'enquiry', 'referral', 'service_request', 'kyc_case', 'loan_application', 'collateral',
    'risk_profile', 'suitability_record', 'wealth_mandate', 'fund_order', 'securities_account', 'fx_profile', 'restricted_list_entry',
    'financial_product', 'product_routing', 'plr_rate', 'country', 'fx_rate', 'model_portfolio'], ['bu_head', 'auditor'], false),
  ...perm(['party', 'consent_record', 'enquiry'], ['marketing'], false),
];

module.exports = { workflows, assignmentRules, slaPolicies, permissions, integrations };
