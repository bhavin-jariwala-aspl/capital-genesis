'use strict';

/**
 * Genesis Capital — automation for the full PRD scope (M01–M25) beyond the
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
const sms = (key, name, message, message_fr, extra = {}, links = {}) => ({ key, name, step_type: 'send_sms', config: { integration: 'genesis_sms', message, message_fr, to_field: 'party_mobile', language_field: 'preferred_language', ...extra }, ...links });
const doc = (key, name, template, filename) => ({ key, name, step_type: 'generate_document', config: { template, filename } });
const end = (key = 'end') => cond(key, 'End', 'record_id', 'empty');
/** Run a step once per matching record of another object (`config.for_each`). */
const each = (step, forEach) => ({ ...step, config: { ...step.config, for_each: forEach } });

/** A next-best-action rule: daily per party, deduplicated by rule. */
const nba = (name, label, rule, when, bu, product, reason) => ({
  object: 'party', name, label, description: `Next-best action: ${reason}`, ...DAILY,
  steps: [
    trig('Daily next-best-action sweep'),
    expr('c1', 'Rule matches', `(${when}) AND COUNT_RELATED('nba_suggestion', 'party', 'rule_status', '${rule}|open') = 0 AND COUNT_RELATED('nba_suggestion', 'party', 'rule_status', '${rule}|dismissed') = 0`),
    create('s1', 'Raise the suggestion', 'nba_suggestion', { party: '{{id}}', rule, business_unit: bu, product_code: product, reason, status: 'open' }),
    notify('n1', 'Tell the RM', { field: 'assigned_to', title: 'Next-best action — {{display_name}}', message: reason }),
  ],
});

// FX rate alerts: the client's message, and which alerts a newly published board rate reaches.
const FX_ALERT_SMS = 'Genesis Forex: {{currency_code}} is at {{current_rate}} MUR, your target was {{target_rate}}. Call your dealer to book.';
const FX_ALERT_SMS_FR = 'Genesis Forex : le {{currency_code}} est à {{current_rate}} MUR, votre objectif était {{target_rate}}. Appelez votre cambiste.';
const FX_ALERT_REACHED = "stage = 'active' AND ISBLANK(triggered_on) AND IF(direction = 'below', source_rate_to_mur <= target_rate, source_rate_to_mur >= target_rate)";
const FX_ALERT_STAMPED = "stage = 'active' AND NOT(ISBLANK(triggered_on))";

const workflows = [
  // ── M01 Enquiries ───────────────────────────────────────────────────────────
  {
    object: 'enquiry', name: 'genesis_enquiry_existing_client_rm', label: 'Enquiry — existing clients go to their RM',
    description: 'An enquiry from an existing client is reassigned to the client\'s primary RM.', ...ONCREATE,
    steps: [
      trig('A new enquiry'),
      cond('c1', 'Existing client with an RM', 'existing_rm', 'notempty'),
      set('a1', 'Assign to the primary RM', 'assigned_to', '{{existing_rm}}'),
      notify('n1', 'Tell the RM', { field: 'assigned_to', title: 'Existing client enquiry — {{display_name}}', message: '{{product_code}} · {{message}}' }),
    ],
  },
  {
    object: 'referral', name: 'genesis_referral_to_receiving_rm', label: 'Referral — goes to the receiving RM',
    description: 'A cross-entity referral naming a receiving RM is assigned to that person, so the receiving entity sees it and can accept it within the SLA. Without a name, routing by the receiving entity applies.', ...ONCREATE,
    steps: [
      trig('A new referral'),
      cond('c1', 'Receiving RM named', 'receiving_rm', 'notempty'),
      set('a1', 'Assign to the receiving RM', 'assigned_to', '{{receiving_rm}}'),
      notify('n1', 'Tell the receiving RM', { field: 'assigned_to', title: 'New referral — {{name}}', message: '{{reason}}' }),
    ],
  },
  {
    object: 'introducer_referral', name: 'genesis_introducer_referral_intake', label: 'Introducer referral — create the enquiry',
    description: 'A referral from an introducer becomes an enquiry attributed to the introducer, inside the protection window.', ...ONCREATE,
    steps: [
      trig('A new introducer referral'),
      cond('c1', 'Not linked yet', 'enquiry', 'empty'),
      create('e1', 'Create the enquiry', 'enquiry', {
        first_name: '{{prospect_first_name}}', last_name: '{{prospect_last_name}}', email: '{{prospect_email}}', mobile: '{{prospect_mobile}}',
        product_code: '{{product_code}}', estimated_amount: '{{estimated_amount}}', currency_code: 'MUR', channel: 'introducer', introducer: '{{introducer}}',
        message: 'Referred by an introducer ({{referral_no}}).',
      }, { store_as: 'enquiry', stage: 'new', route: true }),
    ],
  },
  {
    object: 'introducer_referral', name: 'genesis_introducer_commission', label: 'Introducer referral — accrue commission',
    description: 'A funded referral accrues the introducer\'s commission on the funded volume.', ...STAGE,
    steps: [
      trig('Stage change'),
      cond('c1', 'Moved to Funded', 'stage', 'eq', 'funded'),
      create('c2', 'Accrue commission', 'commission_entry', { introducer: '{{introducer}}', introducer_referral: '{{id}}', period: '{{this_month}}', base_amount: '{{funded_amount}}', amount: '{{commission_due}}', status: 'accrued' }),
    ],
  },

  // ── M03 KYC ─────────────────────────────────────────────────────────────────
  {
    object: 'kyc_case', name: 'genesis_kyc_screening', label: 'KYC — sanctions / PEP screening',
    description: 'Entering Screening calls the screening provider and records the result; any hit is logged for triage.', ...STAGE,
    steps: [
      trig('Stage change'),
      cond('c1', 'Moved to Screening', 'stage', 'eq', 'screening'),
      integrate('i1', 'Screen the party', 'genesis_screening', { name: '{{party_name}}', country: '{{party_country}}', pep: '{{pep_flag}}' },
        { screening_result: 'result', screening_reference: 'reference', screening_date: 'screened_on', screening_top_list: 'top_list', screening_top_score: 'top_score' }),
      set('a1', 'Mark screened', 'screening_requested', 'true'),
      expr('c2', 'Potential match?', "screening_result = 'potential_match'"),
      create('h1', 'Log the hit for triage', 'screening_hit', { kyc_case: '{{id}}', party: '{{party}}', provider: 'simulator', list_type: '{{screening_top_list}}', matched_name: '{{party_name}}', match_score: '{{screening_top_score}}', trigger: 'onboarding', disposition: 'pending', source_reference: '{{screening_reference}}' }),
      notify('n1', 'Tell Compliance', { role: 'compliance_officer', title: 'Screening hit — {{party_name}}', message: 'Triage the hit on the KYC case before risk assessment.' }),
    ],
  },
  {
    object: 'kyc_case', name: 'genesis_kyc_batch_rescreen', label: 'KYC — daily batch rescreening',
    description: 'Approved clients are rescreened daily; new matches are logged and Compliance alerted.', ...DAILY,
    steps: [
      trig('Daily rescreening'),
      cond('c1', 'Approved case', 'kyc_outcome', 'eq', 'approved'),
      integrate('i1', 'Rescreen', 'genesis_screening', { name: '{{party_name}}', country: '{{party_country}}', pep: '{{pep_flag}}' }, { screening_reference: 'reference', screening_date: 'screened_on' }),
    ],
  },
  {
    object: 'screening_hit', name: 'genesis_screening_hit_triage', label: 'Screening hit — escalate true matches',
    description: 'A true match or escalation alerts the MLRO and puts the KYC case on hold.', ...changed('disposition'),
    steps: [
      trig('Disposition changed'),
      expr('c1', 'True match or escalated', "IN(disposition, 'true_match', 'escalated')"),
      notify('n1', 'Alert the MLRO', { role: 'mlro', title: 'Screening: {{disposition}} — {{matched_name}}', message: '{{list_type}} hit ({{match_score}}%). {{rationale}}' }),
    ],
  },

  // ── M04 Suitability ─────────────────────────────────────────────────────────
  {
    object: 'party', name: 'genesis_profile_refresh', label: 'Party — risk profile refresh due',
    description: 'A risk profile within 30 days of its two-year validity asks the RM to refresh it.', ...DAILY,
    steps: [
      trig('Daily sweep'),
      expr('c1', 'Profile expires within 30 days', "NOT(ISBLANK(profile_valid_until)) AND DAYS_BETWEEN(TODAY(), profile_valid_until) <= 30 AND NOT(profile_refresh_requested)"),
      set('a1', 'Mark requested', 'profile_refresh_requested', 'true'),
      notify('n1', 'Tell the RM', { field: 'assigned_to', title: 'Risk profile refresh — {{display_name}}', message: 'The investor profile expires {{profile_valid_until}}. Re-run the questionnaire.' }),
    ],
  },
  {
    object: 'party', name: 'genesis_birthday', label: 'Party — birthday reminder',
    description: 'The RM is reminded of a client\'s birthday.', ...DAILY,
    steps: [
      trig('Daily sweep'),
      expr('c1', 'Birthday today', 'NOT(ISBLANK(date_of_birth)) AND DAYS_BETWEEN(TODAY(), next_birthday) = 0'),
      notify('n1', 'Tell the RM', { field: 'assigned_to', title: 'Birthday today — {{display_name}}', message: 'Send your wishes.' }),
    ],
  },

  // ── M05 Retail lending ──────────────────────────────────────────────────────
  {
    object: 'loan_application', name: 'genesis_loan_mcib', label: 'Loan — MCIB credit report',
    description: 'With the applicant\'s consent, capturing the application pulls the MCIB report and stores the score.', ...STAGE,
    steps: [
      trig('Stage change'),
      cond('c1', 'Moved to Application captured', 'stage', 'eq', 'application_captured'),
      cond('c2', 'MCIB consent given', 'mcib_consent', 'eq', 'true'),
      integrate('i1', 'Pull the MCIB report', 'genesis_mcib', { party: '{{party}}', name: '{{party_name}}' }, { mcib_score: 'score', mcib_rating: 'rating', mcib_reference: 'report_reference' }),
    ],
  },
  {
    object: 'loan_application', name: 'genesis_loan_status_update', label: 'Loan — client status updates (EN/FR)',
    description: 'The client is told at each milestone in their language.', ...STAGE,
    steps: [
      trig('Stage change'),
      expr('c1', 'A client-facing milestone', "IN(stage, 'application_captured', 'documents_complete', 'credit_appraisal', 'offer_accepted', 'security_perfection', 'disbursed')"),
      email('m1', 'Status update', 'loan_status_update', { to_field: 'party_email' }),
    ],
  },
  {
    object: 'loan_application', name: 'genesis_loan_cross_sell_offer', label: 'Loan — cross-sell at offer',
    description: 'At offer, a real-estate borrower is referred to Genesis insurance for life and building cover.', ...STAGE,
    steps: [
      trig('Stage change'),
      cond('c1', 'Moved to Offer issued', 'stage', 'eq', 'offer_issued'),
      set('a1', 'Record the PLR priced on', 'plr_at_offer', '{{plr_rate}}'),
      cond('c2', 'Real-estate loan', 'product_code', 'eq', 'LND-RE'),
      create('r1', 'Refer to Genesis insurance', 'referral', { party: '{{party}}', from_business_unit: 'LND', to_business_unit: 'INS', reason: 'Life and building insurance to be assigned to Genesis Life Ltd for {{application_no}}.', estimated_value: '{{loan_amount}}' }, { stage: 'submitted' }),
    ],
  },
  {
    object: 'loan_application', name: 'genesis_loan_book_account', label: 'Loan — book the account view',
    description: 'On disbursement the LMS booking is confirmed and the loan appears in the loan book (I-03 callback, SERV-FR-01).', ...STAGE,
    steps: [
      trig('Stage change'),
      cond('c1', 'Moved to Disbursed', 'stage', 'eq', 'disbursed'),
      create('l1', 'Create the loan account view', 'loan_account', {
        lms_account_no: '{{lms_reference}}', party: '{{party}}', product_code: '{{product_code}}', currency_code: '{{currency_code}}', original_amount: '{{loan_amount}}',
        outstanding: '{{loan_amount}}', rate_type: 'true', margin: '{{margin}}', instalment: '{{emi}}', status: 'active', synced_at: '{{today}}', ext_ref: 'LAC-{{lms_reference}}',
        // The schedule until the next LMS snapshot: first instalment in a month, maturity at the end of the tenure.
        next_instalment_date: { expr: 'ADD_MONTHS(TODAY(), 1)' }, maturity_date: { expr: 'ADD_MONTHS(TODAY(), tenure_months)' },
      }, { link_field: 'loan_application' }),
    ],
  },
  {
    object: 'disbursement', name: 'genesis_disbursement_checker', label: 'Disbursement — maker-checker and LMS booking',
    description: 'A tranche needs a checker other than the requester; once authorised it is booked in the LMS and the reference recorded.', ...STAGE,
    steps: [
      trig('Stage change'),
      cond('c1', 'Moved to Checker review', 'stage', 'eq', 'checking'),
      approval('ap', 'Operations checker', 'operations_checker', 'Disbursement check: {{name}}', 'Tranche {{tranche_no}} · MUR {{amount}}. Conditions met: {{conditions_met}}.', 'ok1', 'no1', { exclude_field: 'created_by' }),
      set('ok1', 'Authorised', 'status', 'authorised'),
      integrate('ok2', 'Book in the LMS', 'genesis_lms', { disbursement_no: '{{disbursement_no}}', amount: '{{amount}}' }, { lms_reference: 'booking_reference', value_date: 'booked_on' }),
      set('ok3', 'Booked', 'status', 'booked'),
      set('ok4', 'Move to Booked', 'stage', 'booked'),
      cond('guard', 'Guard: stop the approved path', 'status', 'eq', 'rejected'),
      set('no1', 'Rejected', 'status', 'rejected'),
      set('no2', 'Move to Rejected', 'stage', 'rejected'),
    ],
  },

  // ── M06 Commercial lending ──────────────────────────────────────────────────
  {
    object: 'credit_facility', name: 'genesis_facility_approval', label: 'Facility — approval matrix',
    description: 'Commercial facilities follow the same amount-banded approval matrix as retail.', ...STAGE,
    steps: [
      trig('Stage change'),
      cond('c1', 'Moved to Credit approval', 'stage', 'eq', 'credit_approval'),
      cond('c2', 'Loans Manager band? (approval matrix)', 'approval_band', 'eq', 'LND|5M', { on_true: 'ap_lm', on_false: 'c3' }),
      cond('c3', 'Credit Committee band? (approval matrix)', 'approval_band', 'eq', 'LND|20M', { on_true: 'ap_cc', on_false: 'ap_bcc' }),
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
    object: 'credit_facility', name: 'genesis_facility_annual_review', label: 'Facility — annual review pipeline',
    description: 'Sixty days before a facility\'s review date it moves to Annual review and the RM is told.', ...DAILY,
    steps: [
      trig('Daily sweep'),
      expr('c1', 'Active and review within 60 days', "stage = 'active' AND NOT(ISBLANK(expiry_date)) AND DAYS_BETWEEN(TODAY(), expiry_date) <= 60 AND NOT(renewal_opened)"),
      set('a1', 'Mark renewal opened', 'renewal_opened', 'true'),
      set('a2', 'Move to Annual review', 'stage', 'annual_review'),
      notify('n1', 'Tell the RM', { field: 'assigned_to', title: 'Annual review due — {{name}}', message: 'Facility {{facility_no}} is due for review on {{expiry_date}}. Request updated financials.' }),
    ],
  },
  {
    object: 'covenant_test', name: 'genesis_covenant_breach', label: 'Covenant — breach alert',
    description: 'A failed covenant test alerts the RM and credit, starting the waiver workflow.', ...ONCREATE,
    steps: [
      trig('A covenant test recorded'),
      cond('c1', 'Breach', 'result', 'eq', 'breach'),
      notify('n1', 'Alert RM and credit', { field: 'assigned_to', notify_actor: true, role: 'loans_manager', title: 'Covenant breach — {{name}}', message: 'Actual {{actual_value}} vs threshold {{threshold}}. Decide on a waiver or remedy.' }),
    ],
  },

  // ── M07 Collateral & M08 servicing ─────────────────────────────────────────
  {
    object: 'collateral', name: 'genesis_collateral_insurance_lapse', label: 'Collateral — insurance lapsing',
    description: 'Thirty days before cover on collateral lapses the RM is told; a lapse is a breach.', ...DAILY,
    steps: [
      trig('Daily sweep'),
      expr('c1', 'Cover lapses in 30 days', 'NOT(ISBLANK(insurance_expiry)) AND DAYS_BETWEEN(TODAY(), insurance_expiry) = 30 AND ISBLANK(released_on)'),
      notify('n1', 'Tell the RM', { field: 'assigned_to', title: 'Insurance lapsing — {{description}}', message: 'Policy {{policy_number}} ({{insurer}}) expires {{insurance_expiry}}. Obtain the renewal and assignment.' }),
    ],
  },
  {
    object: 'collateral', name: 'genesis_collateral_owner_default', label: 'Collateral — owner defaults to the borrower',
    description: 'Collateral registered for a loan application without an owner belongs to the applicant (lending staff need not open the client record to pick them).', ...ONCREATE,
    steps: [
      trig('Collateral registered'),
      expr('c1', 'No owner, linked to a loan', 'ISBLANK(owner) AND NOT(ISBLANK(loan_borrower))'),
      set('a1', 'Owner = the applicant', 'owner', '{{loan_borrower}}'),
    ],
  },
  {
    object: 'collateral', name: 'genesis_collateral_revaluation', label: 'Collateral — revaluation due',
    description: 'Collateral due for revaluation by its type\'s frequency raises a reminder.', ...DAILY,
    steps: [
      trig('Daily sweep'),
      expr('c1', 'Revaluation due today', "NOT(ISBLANK(next_revaluation)) AND DAYS_BETWEEN(TODAY(), next_revaluation) = 0 AND NOT(IN(collateral_type, 'fund_units', 'securities'))"),
      notify('n1', 'Tell the RM', { field: 'assigned_to', title: 'Revaluation due — {{description}}', message: 'Last valued {{last_valued_on}}. Instruct an approved valuer.' }),
    ],
  },
  // The margin call on an investment-backed loan. The LTV lives on the loan
  // application (drawn exposure ÷ registered pledges) and is recalculated the
  // moment a pledge is revalued, so the call is raised then — not at the next
  // daily sweep. `derived` makes the trigger fire on that recalculation.
  ...[
    { name: 'genesis_ibl_margin_call', label: 'Loan — margin call when LTV passes the call level', trigger: { trigger_type: 'field_changed', trigger_config: { field: 'ibl_ltv_status', derived: true } }, t: 'LTV status changed' },
    { name: 'genesis_ltv_monitor', label: 'Loan — daily LTV check (safety net)', trigger: DAILY, t: 'Daily LTV check' },
  ].map(({ name, label, trigger, t }) => ({
    object: 'loan_application', name, label,
    description: 'An investment-backed loan whose LTV reaches the margin-call level of its pledged asset class (Masters ▸ Collateral types) gets a margin call with the shortfall; the client is notified and the loans executive and loans manager alerted.',
    ...trigger,
    steps: [
      trig(t),
      expr('c1', 'Margin call or liquidation level, no call open', "IN(ibl_ltv_status, 'margin_call', 'liquidation') AND NOT(margin_call_open)"),
      create('m1', 'Issue the margin call', 'margin_call', { loan_application: '{{id}}', party: '{{party}}', ltv_at_call: '{{ibl_ltv}}', shortfall: '{{margin_shortfall}}', call_date: '{{today}}', cure: 'none' }, { stage: 'issued' }),
      notify('n1', 'Alert the loans executive and manager', { field: 'assigned_to', role: 'loans_manager', title: 'Margin call — {{application_no}} ({{party_name}})', message: 'LTV {{ibl_ltv}}% passed the call level of {{ltv_call_level}}%. Shortfall MUR {{margin_shortfall}}.' }),
    ],
  })),
  {
    object: 'margin_call', name: 'genesis_margin_call_notice', label: 'Margin call — notify the client',
    description: 'A margin call letter is generated and emailed to the borrower in their language.', ...ONCREATE,
    steps: [
      trig('A new margin call'),
      set('a1', 'Cure within five business days', 'cure_by', '{{cure_deadline}}'),
      doc('d1', 'Generate the margin call notice', 'margin_call_notice', 'Margin call {{call_no}}'),
      email('m1', 'Email the borrower', 'margin_call', { to_field: 'party_email' }),
      sms('s1', 'Text the borrower', 'Genesis: a margin call {{call_no}} has been issued on your investment-backed loan. Please check your email or call your RM.',
        'Genesis : un appel de marge {{call_no}} a été émis sur votre prêt adossé. Consultez vos courriels ou appelez votre chargé.'),
    ],
  },
  // PLR change (SERV-FR-02): approving a campaign generates one personalised notice per variable-rate loan, with the
  // instalment repriced on the remaining term and balance; distributing it emails every notice. The campaign never
  // writes the PLR itself — that is Masters ▸ Genesis PLR History, on the effective date.
  {
    object: 'plr_change_event', name: 'genesis_plr_notices', label: 'PLR change — generate the borrower notices',
    description: 'On approval, every variable-rate, unsettled loan gets a personalised notice with its old and new instalment; the campaign moves to Notices generated.', ...STAGE,
    steps: [
      trig('Stage change'),
      cond('c1', 'Moved to Approved', 'stage', 'eq', 'approved'),
      expr('c2', 'No notices generated yet', "COUNT_RELATED('plr_notification', 'plr_change_event') = 0"),
      each(create('n1', 'A notice for every variable-rate loan', 'plr_notification', {
        plr_change_event: '{{source_id}}', loan_account: '{{id}}', old_instalment: '{{instalment}}', channel: 'email', status: 'pending',
        // Same balance and remaining term, new rate: the LMS instalment scaled by the ratio of the two annuities.
        new_instalment: { expr: 'IF(COALESCE(months_to_maturity, 0) > 0 AND COALESCE(outstanding, 0) > 0 AND COALESCE(instalment, 0) > 0, ROUND(instalment * PMT((source_new_rate + COALESCE(margin, 0)) / 1200, months_to_maturity, outstanding) / PMT((source_old_rate + COALESCE(margin, 0)) / 1200, months_to_maturity, outstanding), 2), instalment)' },
      }), { object: 'loan_account', where: "rate_type AND status != 'settled' AND COALESCE(outstanding, 0) > 0" }),
      set('a1', 'Move to Notices generated', 'stage', 'notices_generated'),
      notify('m1', 'Tell the loans team', { role: 'loans_manager', title: 'PLR notices generated — {{plr_change_no}}', message: '{{name}}: review the notices, then move the campaign to Distributed to send them.' }),
    ],
  },
  {
    object: 'plr_notification', name: 'genesis_plr_notice_letter', label: 'PLR notice — generate the letter',
    description: 'Each notice gets its personalised letter on the Docs tab.', ...ONCREATE,
    steps: [
      trig('A new PLR notice'),
      doc('d1', 'Generate the PLR change letter', 'plr_change_notice', 'PLR change notice {{lms_account_no}}'),
    ],
  },
  {
    object: 'plr_change_event', name: 'genesis_plr_distribute', label: 'PLR change — distribute the notices',
    description: 'Moving a campaign to Distributed emails every pending notice to its borrower in their language and logs the date.', ...STAGE,
    steps: [
      trig('Stage change'),
      cond('c1', 'Moved to Distributed', 'stage', 'eq', 'distributed'),
      each(email('m1', 'Email each notice', 'plr_change', { to_field: 'party_email' }), { object: 'plr_notification', match: { plr_change_event: '{{id}}' }, where: "status = 'pending' AND channel = 'email' AND NOT(ISBLANK(party_email))" }),
      each(set('a1', 'Stamp the sent date', 'sent_on', '{{today}}'), { object: 'plr_notification', match: { plr_change_event: '{{id}}' }, where: "status = 'pending'" }),
      each(set('a2', 'Mark the notices sent', 'status', 'sent'), { object: 'plr_notification', match: { plr_change_event: '{{id}}' }, where: "status = 'pending'" }),
    ],
  },
  {
    object: 'loan_account', name: 'genesis_collections_ews', label: 'Loan — arrears early warning',
    description: 'An account entering arrears opens a collections follow-up for the RM; it closes when the account is current.', ...DAILY,
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
    object: 'collection_action', name: 'genesis_collections_ptp', label: 'Collections — promise to pay on the loan',
    description: 'A promise to pay is written on the loan account, so everyone sees the date it is due.', ...changed('outcome'),
    steps: [
      trig('Outcome changed'),
      cond('c1', 'Promise to pay', 'outcome', 'eq', 'ptp'),
      set('a1', 'Record the date on the loan account', 'loan_account.promise_to_pay_date', '{{ptp_date}}'),
    ],
  },
  {
    object: 'collection_action', name: 'genesis_collections_escalate', label: 'Collections — escalation to legal',
    description: 'Escalating an account to legal alerts the loans manager.', ...ONCREATE,
    steps: [
      trig('A new collections action'),
      cond('c1', 'Escalated to legal', 'action', 'eq', 'escalate'),
      notify('n1', 'Alert the loans manager', { role: 'loans_manager', title: 'Escalated to legal — {{name}}', message: '{{arrears_bucket}} days in arrears. {{notes}}' }),
    ],
  },
  {
    object: 'loan_account', name: 'genesis_instalment_reminder', label: 'Loan — instalment reminder by SMS',
    description: 'Three days before each instalment, active borrowers get a text reminder in their language.', ...DAILY,
    steps: [
      trig('Daily sweep'),
      expr('c1', 'Instalment due in 3 days', "status = 'active' AND NOT(ISBLANK(next_instalment_date)) AND DAYS_BETWEEN(TODAY(), next_instalment_date) = 3"),
      sms('s1', 'Text the borrower', 'Genesis: your instalment of MUR {{instalment}} on loan {{lms_account_no}} is due on {{next_instalment_date}}.',
        'Genesis : votre mensualité de MUR {{instalment}} sur le prêt {{lms_account_no}} est due le {{next_instalment_date}}.'),
    ],
  },
  {
    object: 'loan_account', name: 'genesis_maturity_retention', label: 'Loan — maturity retention',
    description: 'Loans within six months of maturity raise a retention / new-need suggestion.', ...DAILY,
    steps: [
      trig('Daily sweep'),
      expr('c1', 'Matures within 6 months', 'NOT(ISBLANK(months_to_maturity)) AND months_to_maturity <= 6 AND NOT(renewal_opened)'),
      create('s1', 'Raise the suggestion', 'nba_suggestion', { party: '{{party}}', rule: 'maturity_retention', business_unit: 'LND', reason: 'Loan {{lms_account_no}} matures {{maturity_date}} — discuss a new need or reinvestment.', status: 'open' }),
      set('a1', 'Mark raised', 'renewal_opened', 'true'),
    ],
  },

  // ── M09 Wealth ─────────────────────────────────────────────────────────────
  {
    object: 'wealth_mandate', name: 'genesis_mandate_review_scheduler', label: 'Mandate — schedule the review',
    description: 'Fourteen days before a review is due by the mandate\'s cycle, the review is opened with its preparation pack.', ...DAILY,
    steps: [
      trig('Daily sweep'),
      expr('c1', 'Active, review due within 14 days, none open', "stage = 'active' AND NOT(ISBLANK(next_review_due)) AND DAYS_BETWEEN(TODAY(), next_review_due) <= 14 AND COUNT_RELATED('mandate_review', 'wealth_mandate', 'open', 'true') = 0"),
      create('r1', 'Open the review', 'mandate_review', { wealth_mandate: '{{id}}', due_date: '{{next_review_due}}', review_type: '{{review_frequency}}' }, { stage: 'scheduled' }),
      notify('n1', 'Tell the portfolio manager', { field: 'assigned_to', title: 'Review due — {{name}}', message: 'Due {{next_review_due}}. AUM {{aum}} {{base_currency}}, YTD {{ytd_return_pct}}%.' }),
    ],
  },
  {
    object: 'mandate_review', name: 'genesis_mandate_review_invite', label: 'Review — invite the client',
    description: 'A prepared review pack invites the client to the meeting in their language.', ...STAGE,
    steps: [
      trig('Stage change'),
      cond('c1', 'Pack prepared', 'stage', 'eq', 'pack_prepared'),
      notify('n1', 'Tell the portfolio manager', { field: 'assigned_to', title: 'Review pack ready — {{name}}', message: 'Send the invitation and the pack to the client.' }),
    ],
  },
  {
    object: 'wealth_mandate', name: 'genesis_mandate_attrition', label: 'Mandate — attrition risk alert',
    description: 'Declining assets, missed reviews or a complaint raise an RM task once.', ...DAILY,
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
    object: 'saac_decision', name: 'genesis_saac_communication', label: 'SAAC — brief the portfolio managers',
    description: 'A new SAAC decision is pushed to portfolio managers to communicate to affected clients.', ...ONCREATE,
    steps: [trig('A new SAAC decision'), notify('n1', 'Tell portfolio managers', { role: 'portfolio_manager', title: 'SAAC decision — {{title}}', message: 'Models {{affected_models}}: {{allocation_change}}' })],
  },

  // ── M10 Funds ──────────────────────────────────────────────────────────────
  {
    object: 'fund_order', name: 'genesis_fund_order_checker', label: 'Fund order — maker-checker and TA hand-off',
    description: 'Checks complete → an operations checker other than the maker authorises → the order goes to the transfer agent and is confirmed; a subscription books its units to a fund holding.', ...STAGE,
    steps: [
      trig('Stage change'),
      cond('c1', 'Moved to Checks complete', 'stage', 'eq', 'checked'),
      approval('ap', 'Operations checker', 'operations_checker', 'Fund order check: {{name}}', '{{order_no}} · {{amount}} {{currency_code}}. Payment proof: {{payment_proof_received}}.', 'ok1', 'no1', { exclude_field: 'created_by' }),
      set('ok1', 'Send to TA', 'stage', 'submitted_to_ta'),
      integrate('ok2', 'Transfer agent', 'genesis_ta', { order_no: '{{order_no}}', fund: '{{fund_code}}', amount: '{{amount}}', order_type: '{{order_type}}' }, { ta_reference: 'ta_reference' }),
      set('ok3', 'Confirmed', 'stage', 'confirmed'),
      email('ok4', 'Confirm to the investor', 'fund_order_confirmation', { to_field: 'party_email' }),
      cond('ok5', 'A subscription?', 'order_type', 'eq', 'subscription'),
      create('ok6', 'Book the units to the holding', 'fund_holding', { party: '{{party}}', share_class: '{{share_class}}', units: '{{allotted_units}}', book_cost: '{{amount}}', as_of: '{{today}}' }),
      cond('guard', 'Guard: stop the approved path', 'stage', 'eq', 'rejected'),
      set('no1', 'Reject', 'stage', 'rejected'),
    ],
  },
  {
    object: 'fund_holding', name: 'genesis_fmb_maturity', label: 'Funds — FMB 2029 reinvestment',
    description: 'Fixed Maturity Bond holders within six months of maturity get a reinvestment proposal.', ...DAILY,
    steps: [
      trig('Daily sweep'),
      expr('c1', 'FMB maturing within 6 months', "product_code = 'FND-FMB29' AND NOT(ISBLANK(maturity_date)) AND MONTHS_BETWEEN(TODAY(), maturity_date) <= 6 AND NOT(maturity_nba_raised)"),
      create('s1', 'Raise the reinvestment suggestion', 'nba_suggestion', { party: '{{party}}', rule: 'fmb_reinvestment', business_unit: 'FND', product_code: 'FND-INC', reason: 'FMB 2029 matures {{maturity_date}} — propose reinvestment.', status: 'open' }),
      set('a1', 'Mark raised', 'maturity_nba_raised', 'true'),
    ],
  },
  {
    object: 'distribution_notice', name: 'genesis_distribution_publish', label: 'Funds — distribution notice published',
    description: 'Publishing a distribution notice tells the fund team to distribute it to unitholders.', ...changed('published'),
    steps: [trig('Published flag changed'), cond('c1', 'Published', 'published', 'eq', 'true'), notify('n1', 'Tell the fund team', { role: 'portfolio_manager', title: 'Distribution notice published — {{name}}', message: '{{notice_text}}' })],
  },

  // ── M11 Securities ─────────────────────────────────────────────────────────
  {
    object: 'client_order', name: 'genesis_client_order_oms', label: 'Order — hand off to the OMS',
    description: 'Sending an instruction to the OMS records the OMS reference for best-execution evidence.', ...STAGE,
    steps: [
      trig('Stage change'),
      cond('c1', 'Moved to Sent to OMS', 'stage', 'eq', 'sent_to_oms'),
      integrate('i1', 'Send to the OMS', 'genesis_oms', { order_ref: '{{order_ref}}', instrument: '{{instrument}}', quantity: '{{quantity}}', side: '{{side}}' }, { oms_reference: 'oms_reference' }),
    ],
  },
  {
    object: 'securities_account', name: 'genesis_dormant_reactivation', label: 'Securities — dormant account reactivation',
    description: 'Accounts without a trade for 12 months get a reactivation suggestion.', ...DAILY,
    steps: [
      trig('Daily sweep'),
      expr('c1', 'Dormant, no open suggestion', "dormant AND COUNT_RELATED('nba_suggestion', 'party', 'rule_status', 'dormant_reactivation|open') = 0"),
      create('s1', 'Raise the suggestion', 'nba_suggestion', { party: '{{party}}', rule: 'dormant_reactivation', business_unit: 'SEC', product_code: 'SEC-LOC', reason: 'No trade since {{last_trade_date}} — share the latest research and market statistics.', status: 'open' }),
    ],
  },
  {
    object: 'restricted_list_entry', name: 'genesis_restricted_list_alert', label: 'Restricted list — alert the public side',
    description: 'A new restricted-list issuer is announced to traders and portfolio managers; watch-list entries stay with Compliance.', ...ONCREATE,
    steps: [
      trig('A new list entry'),
      cond('c1', 'Restricted list', 'list_type', 'eq', 'restricted'),
      notify('n1', 'Tell traders', { role: 'trader', title: 'Restricted list: {{issuer}}', message: 'No orders or trade ideas until further notice.' }),
      notify('n2', 'Tell portfolio managers', { role: 'portfolio_manager', title: 'Restricted list: {{issuer}}', message: 'No orders or trade ideas until further notice.' }),
    ],
  },

  // ── M12 Advisory ───────────────────────────────────────────────────────────
  {
    object: 'advisory_mandate', name: 'genesis_advisory_conflict_check', label: 'Advisory — open the conflict check',
    description: 'Moving a mandate to Conflict check opens a check for Compliance across the party master, relationships, open mandates and the restricted list.', ...STAGE,
    steps: [
      trig('Stage change'),
      cond('c1', 'Moved to Conflict check', 'stage', 'eq', 'conflict_check'),
      create('k1', 'Open the conflict check', 'conflict_check', { advisory_mandate: '{{id}}', decision: 'pending' }, { stage: 'requested' }),
      notify('n1', 'Tell Compliance', { role: 'compliance_officer', title: 'Conflict check — {{code_name}}', message: 'Review the matches and decide.' }),
    ],
  },
  {
    object: 'conflict_check', name: 'genesis_conflict_decision', label: 'Conflict check — record on the mandate',
    description: 'Compliance\'s decision is written back to the mandate (cleared or declined) and stored as the audit artifact.', ...changed('decision'),
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
    object: 'advisory_mandate', name: 'genesis_advisory_engagement_letter', label: 'Advisory — engagement letter',
    description: 'Entering Engagement generates the engagement letter (by code name) for e-signature.', ...STAGE,
    steps: [trig('Stage change'), cond('c1', 'Moved to Engagement letter', 'stage', 'eq', 'engagement'), doc('d1', 'Generate the engagement letter', 'engagement_letter', 'Engagement letter {{code_name}}')],
  },
  {
    object: 'deal_team_member', name: 'genesis_deal_team_insider', label: 'Deal team — add to the insider list',
    description: 'Every deal-team member is automatically added to the mandate\'s insider list with date, time and reason.', ...ONCREATE,
    steps: [
      trig('A new deal-team member'),
      cond('c1', 'Not yet on the list', 'insider_added', 'empty'),
      create('i1', 'Add to the insider list', 'insider_list_entry', { advisory_mandate: '{{advisory_mandate}}', person: '{{employee_name}}', person_type: 'staff', organisation: 'Genesis Corporate Advisors Ltd', received_at: '{{today}}', reason: 'Deal team ({{deal_role}}).' }),
      set('a1', 'Mark added', 'insider_added', 'true'),
    ],
  },
  {
    object: 'advisory_deliverable', name: 'genesis_milestone_invoice', label: 'Advisory — milestone fee invoice',
    description: 'A delivered fee milestone raises the fee invoice for accounting.', ...STAGE,
    steps: [
      trig('Stage change'),
      cond('c1', 'Delivered', 'stage', 'eq', 'delivered'),
      cond('c2', 'Has a milestone fee', 'milestone_fee', 'notempty'),
      cond('c3', 'Not invoiced', 'invoice_raised', 'empty'),
      create('f1', 'Raise the invoice', 'fee_invoice', { advisory_mandate: '{{advisory_mandate}}', advisory_deliverable: '{{id}}', fee_type: 'milestone', amount: '{{milestone_fee}}', issued_on: '{{today}}', status: 'sent_to_accounting' }),
      set('a1', 'Mark invoiced', 'invoice_raised', 'true'),
    ],
  },
  {
    object: 'fee_invoice', name: 'genesis_fee_invoice_revenue', label: 'Advisory — paid fee to the Revenue Ledger',
    description: 'A paid retainer, milestone or success fee invoice posts the fee to the Revenue Ledger, credited to the advisor and linked to the invoice.', ...changed('status'),
    steps: [
      trig('Status change'),
      expr('c1', 'Paid fee, not yet posted', "status = 'paid' AND fee_type != 'expenses' AND NOT(revenue_posted)"),
      create('r1', 'Post the revenue line', 'revenue_entry', {
        party: { expr: 'advisory_mandate.client' }, business_unit: 'ADV', revenue_type: { expr: "CASE(fee_type, 'success', 'success_fee', 'advisory_retainer')" },
        amount: '{{amount}}', currency_code: 'MUR', period: '{{this_month}}', booked_on: '{{today}}', rm: { expr: 'IF(ISBLANK(assigned_to), created_by, assigned_to)' }, referrer_split_pct: '0',
        source: 'fee_invoice', fee_invoice: '{{id}}',
      }),
      set('a1', 'Mark posted', 'revenue_posted', 'true'),
    ],
  },

  // ── M13 Forex ──────────────────────────────────────────────────────────────
  {
    object: 'fx_quote', name: 'genesis_fx_quote_accepted', label: 'FX quote — book the deal',
    description: 'An accepted quote becomes a deal booked in the dealing system with a time-stamped trail.', ...STAGE,
    steps: [
      trig('Stage change'),
      cond('c1', 'Accepted', 'stage', 'eq', 'accepted'),
      create('d1', 'Create the deal', 'fx_deal', { party: '{{party}}', fx_profile: '{{fx_profile}}', fx_quote: '{{id}}', product: '{{product}}', side: '{{side}}', currency_code: '{{currency_code}}', amount: '{{amount}}', deal_rate: '{{quoted_rate}}', trade_date: '{{today}}', value_date: '{{value_date}}' }),
    ],
  },
  {
    object: 'fx_deal', name: 'genesis_fx_deal_booking', label: 'FX deal — dealing-system reference',
    description: 'A new deal is booked in the dealing system and its reference recorded.', ...ONCREATE,
    steps: [
      trig('A new deal'),
      cond('c1', 'No reference yet', 'dealing_reference', 'empty'),
      integrate('i1', 'Book in the dealing system', 'genesis_fx_dealing', { deal_no: '{{deal_no}}', currency_code: '{{currency_code}}', amount: '{{amount}}' }, { dealing_reference: 'dealing_reference' }),
    ],
  },
  {
    object: 'fx_deal', name: 'genesis_fx_deal_revenue', label: 'FX deal — post the spread income',
    description: 'A new deal posts its spread income over the mid rate to the Revenue Ledger, credited to the dealer and linked to the deal.', ...ONCREATE,
    steps: [
      trig('A new deal'),
      expr('c1', 'Earns a spread', 'COALESCE(spread_income, 0) > 0'),
      create('r1', 'Post the revenue line', 'revenue_entry', {
        party: '{{party}}', business_unit: 'FX', product_code: { expr: "CASE(product, 'forward', 'FX-FWD', 'swap', 'FX-SWAP', 'FX-SPOT')" }, revenue_type: 'fx_spread',
        amount: { expr: 'ROUND(spread_income, 2)' }, currency_code: 'MUR', period: '{{this_month}}', booked_on: '{{today}}', rm: { expr: 'IF(ISBLANK(assigned_to), created_by, assigned_to)' }, referrer_split_pct: '0',
        source: 'fx_deal', fx_deal: '{{id}}',
      }),
    ],
  },
  {
    object: 'fx_rate_alert', name: 'genesis_fx_rate_alert', label: 'FX — rate alerts',
    description: 'Hourly: an alert whose target the board rate has reached is sent to the client and closed.', ...HOURLY,
    steps: [
      trig('Hourly check'),
      cond('c1', 'Active', 'stage', 'eq', 'active'),
      expr('c2', 'Target reached', "IF(direction = 'below', LOOKUP('fx_rate', 'currency_code', currency_code, 'rate_to_mur', 'rate_date') <= target_rate, LOOKUP('fx_rate', 'currency_code', currency_code, 'rate_to_mur', 'rate_date') >= target_rate)"),
      // Stamped first: the write refreshes the alert's current board rate, which the messages quote.
      set('a1', 'Triggered on', 'triggered_on', '{{today}}'),
      cond('ch', 'Client asked for SMS', 'channel', 'eq', 'sms', { on_false: 'm1' }),
      sms('s1', 'Text the client', FX_ALERT_SMS, FX_ALERT_SMS_FR, {}, { on_true: 'a2' }),
      email('m1', 'Tell the client', 'fx_rate_alert', { to_field: 'party_email' }),
      set('a2', 'Move to Triggered', 'stage', 'triggered'),
      notify('n1', 'Tell the dealer', { field: 'assigned_to', title: 'Rate alert hit — {{name}}', message: 'Call the client to deal.' }),
    ],
  },
  {
    object: 'fx_rate', name: 'genesis_fx_rate_alert_board', label: 'FX — rate alerts on a new board rate',
    description: 'Publishing a board rate checks the active alerts in that currency at once: each one reached is sent to the client (email or SMS), closed as Triggered and handed to its dealer.', ...ONCREATE,
    steps: [
      trig('A new board rate'),
      // A back-dated rate (history being filled in) is not today's board.
      expr('c1', 'Today\'s board (not back-dated)', 'DAYS_BETWEEN(TODAY(), rate_date) >= 0'),
      // Stamping refreshes each alert's current rate; the rest of the loop then picks the alerts stamped just now.
      each(set('a1', 'Stamp the alerts reached', 'triggered_on', '{{today}}'), { object: 'fx_rate_alert', match: { currency_code: '{{currency_code}}' }, where: FX_ALERT_REACHED }),
      each(email('m1', 'Email the clients', 'fx_rate_alert', { to_field: 'party_email' }), { object: 'fx_rate_alert', match: { currency_code: '{{currency_code}}' }, where: `${FX_ALERT_STAMPED} AND channel != 'sms' AND NOT(ISBLANK(party_email))` }),
      each(sms('s1', 'Text the clients', FX_ALERT_SMS, FX_ALERT_SMS_FR), { object: 'fx_rate_alert', match: { currency_code: '{{currency_code}}' }, where: `${FX_ALERT_STAMPED} AND channel = 'sms'` }),
      each(notify('n1', 'Tell the dealers', { field: 'assigned_to', title: 'Rate alert hit — {{name}}', message: 'Call the client to deal.' }), { object: 'fx_rate_alert', match: { currency_code: '{{currency_code}}' }, where: FX_ALERT_STAMPED }),
      each(set('a2', 'Move them to Triggered', 'stage', 'triggered'), { object: 'fx_rate_alert', match: { currency_code: '{{currency_code}}' }, where: FX_ALERT_STAMPED }),
    ],
  },
  {
    object: 'fx_deal', name: 'genesis_fx_forward_maturity', label: 'FX — forward maturity reminder',
    description: 'A week before an open forward matures the dealer and client are reminded and a roll-over offered.', ...DAILY,
    steps: [
      trig('Daily sweep'),
      expr('c1', 'Open forward maturing in 7 days', 'open_forward AND days_to_value = 7 AND NOT(rollover_offered)'),
      email('m1', 'Remind the client', 'fx_forward_maturity', { to_field: 'party_email' }),
      set('a1', 'Mark roll-over offered', 'rollover_offered', 'true'),
      notify('n1', 'Tell the dealer', { field: 'assigned_to', title: 'Forward maturing — {{name}}', message: 'Value date {{value_date}}. Offer a roll-over.' }),
    ],
  },
  {
    object: 'fx_deal', name: 'genesis_fx_forward_reminder', label: 'FX — forward maturity on the dealer\'s reminders',
    description: 'Booking a forward or swap puts a reminder for its dealer a week before the value date.', ...ONCREATE,
    steps: [
      trig('A new deal'),
      cond('c1', 'Forward or swap', 'product', 'neq', 'spot'),
      cond('c2', 'Has a value date', 'value_date', 'notempty'),
      { key: 'r1', name: 'Remind the dealer', step_type: 'create_reminder', config: { title: 'Forward maturity — {{deal_no}}', note: 'Value date {{value_date}}: confirm settlement with the client or offer a roll-over.', date_field: 'value_date', offset_days: -7, priority: 'high' } },
    ],
  },

  // ── M14 Cross-sell ─────────────────────────────────────────────────────────
  nba('genesis_nba_ibl', 'NBA — fund holder → Investment-Backed Loan', 'ibl_for_fund_holder',
    'COALESCE(fund_holdings_mur, 0) >= 1000000 AND COALESCE(loan_exposure_mur, 0) = 0', 'LND', 'LND-IBL',
    'Fund holdings above MUR 1m and no loan — liquidity without selling (Investment-Backed Loan).'),
  nba('genesis_nba_wealth_for_borrower', 'NBA — borrower → Wealth / Money Market', 'wealth_for_borrower',
    'COALESCE(loan_exposure_mur, 0) >= 3000000 AND COALESCE(aum_mur, 0) = 0 AND COALESCE(fund_holdings_mur, 0) = 0', 'WLT', 'FND-MMF',
    'Real-estate borrower without investments — park surplus funds in the Money Market Fund or open a wealth account.'),
  nba('genesis_nba_fx_corporate', 'NBA — corporate → FX hedging', 'fx_for_corporate',
    "party_type = 'organisation' AND IN(sector, 'tourism', 'trade', 'manufacturing') AND COUNT_RELATED('fx_profile', 'party') = 0", 'FX', 'FX-FWD',
    'Corporate with foreign-currency revenue or costs — offer forward hedging.'),
  nba('genesis_nba_hnw_discovery', 'NBA — HNW without a mandate → Wealth discovery', 'wealth_discovery_hnw',
    "IN(segment, 'hnw', 'uhnw') AND COALESCE(aum_mur, 0) = 0", 'WLT', 'WLT-DPM',
    'HNW client without a wealth mandate — book a discovery meeting.'),
  {
    object: 'nba_suggestion', name: 'genesis_nba_accept', label: 'NBA — accepted suggestion opens an opportunity',
    description: 'Accepting a suggestion opens the opportunity with the referrer credited.', ...changed('status'),
    steps: [
      trig('Status changed'),
      cond('c1', 'Accepted', 'status', 'eq', 'accepted'),
      create('o1', 'Open the opportunity', 'fs_opportunity', { party: '{{party}}', business_unit: '{{business_unit}}', product_code: '{{product_code}}', amount: '1000000', currency_code: 'MUR', probability: '25', forecast_category: 'pipeline', owner_rm: '{{assigned_to}}', nba_suggestion: '{{id}}' }, { stage: 'identified' }),
    ],
  },
  {
    object: 'fs_opportunity', name: 'genesis_opp_stage_defaults', label: 'Opportunity — stage sets probability and forecast',
    description: 'Each stage sets the default probability and forecast category, so the weighted value follows the deal; the RM can still adjust them.', ...STAGE,
    steps: [
      trig('Stage change'),
      cond('c_identified', 'Identified?', 'stage', 'eq', 'identified', { on_false: 'c_qualified' }),
      set('p_identified', 'Probability 25%', 'probability', 25),
      set('f_identified', 'Forecast: pipeline', 'forecast_category', 'pipeline', { on_true: 'stop' }),
      cond('c_qualified', 'Qualified?', 'stage', 'eq', 'qualified', { on_false: 'c_proposal' }),
      set('p_qualified', 'Probability 40%', 'probability', 40),
      set('f_qualified', 'Forecast: pipeline', 'forecast_category', 'pipeline', { on_true: 'stop' }),
      cond('c_proposal', 'Proposal?', 'stage', 'eq', 'proposal', { on_false: 'c_negotiation' }),
      set('p_proposal', 'Probability 60%', 'probability', 60),
      set('f_proposal', 'Forecast: best_case', 'forecast_category', 'best_case', { on_true: 'stop' }),
      cond('c_negotiation', 'Negotiation?', 'stage', 'eq', 'negotiation', { on_false: 'c_won' }),
      set('p_negotiation', 'Probability 80%', 'probability', 80),
      set('f_negotiation', 'Forecast: commit', 'forecast_category', 'commit', { on_true: 'stop' }),
      cond('c_won', 'Won?', 'stage', 'eq', 'won', { on_false: 'c_lost' }),
      set('p_won', 'Probability 100%', 'probability', 100),
      set('f_won', 'Forecast: closed', 'forecast_category', 'closed', { on_true: 'stop' }),
      cond('c_lost', 'Lost?', 'stage', 'eq', 'lost'),
      set('p_lost', 'Probability 0%', 'probability', 0),
      set('f_lost', 'Forecast: closed', 'forecast_category', 'closed', { on_true: 'stop' }),
      end('stop'),
    ],
  },
  // The Accept and Dismiss buttons on an open suggestion (record actions). The
  // field writes inside a workflow do not re-trigger genesis_nba_accept, so
  // Accept opens the opportunity itself — exactly once.
  {
    object: 'nba_suggestion', name: 'genesis_nba_accept_action', label: 'Accept',
    description: 'Accept the suggestion: opens an opportunity at Identified for the client.',
    trigger_type: 'manual',
    trigger_config: { show_when: { field: 'status', op: 'eq', value: 'open' }, success_message: 'Accepted — an opportunity is open at Identified. It is on the Related tab.' },
    steps: [
      trig('Accept'),
      set('a1', 'Mark accepted', 'status', 'accepted'),
      create('o1', 'Open the opportunity', 'fs_opportunity', { party: '{{party}}', business_unit: '{{business_unit}}', product_code: '{{product_code}}', amount: '1000000', currency_code: 'MUR', probability: '25', forecast_category: 'pipeline', owner_rm: '{{assigned_to}}', nba_suggestion: '{{id}}' }, { stage: 'identified' }),
    ],
  },
  {
    object: 'nba_suggestion', name: 'genesis_nba_dismiss_action', label: 'Dismiss',
    description: 'Dismiss the suggestion with a reason; the rule will not suggest it again for this client.',
    trigger_type: 'manual',
    trigger_config: { show_when: { field: 'status', op: 'eq', value: 'open' }, inputs: [{ field: 'dismiss_reason', label: 'Why are you dismissing it?', required: true, type: 'textarea' }], success_message: 'Dismissed — this rule will not suggest it again for this client.' },
    steps: [trig('Dismiss'), set('a1', 'Mark dismissed', 'status', 'dismissed')],
  },

  // ── M16 Service ────────────────────────────────────────────────────────────
  {
    object: 'service_request', name: 'genesis_service_intake', label: 'Service — stamp and route approvals',
    description: 'Stamps the received date; requests that the catalogue marks as needing approval go to the business-unit head.', ...ONCREATE,
    steps: [
      trig('A new request'),
      cond('c0', 'Received date missing?', 'created_on', 'empty', undefined, { on_false: 'c1' }),
      set('a0', 'Received on', 'created_on', '{{today}}'),
      cond('c1', 'Needs approval?', 'needs_approval', 'eq', 'true'),
      approval('ap', 'Business-unit head', 'bu_head', 'Service approval: {{name}}', '{{request_no}} — {{description}}', 'ok', 'no'),
      notify('ok', 'Approved — tell the owner', { field: 'assigned_to', title: 'Approved — {{name}}', message: 'Proceed with the request.' }),
      cond('guard', 'Guard: stop', 'request_type', 'empty'),
      notify('no', 'Declined — tell the owner', { field: 'assigned_to', title: 'Not approved — {{name}}', message: 'Explain the decision to the client.' }),
    ],
  },
  {
    object: 'service_request', name: 'genesis_service_csat', label: 'Service — satisfaction survey',
    description: 'A resolved request sends the CSAT / NPS survey in the client\'s language.', ...STAGE,
    steps: [trig('Stage change'), cond('c1', 'Resolved', 'stage', 'eq', 'resolved'), email('m1', 'Send the survey', 'csat_survey', { to_field: 'party_email' })],
  },

  // ── M18 Marketing ──────────────────────────────────────────────────────────
  {
    object: 'event_registration', name: 'genesis_event_follow_up', label: 'Event — follow up attendees',
    description: 'An attended registration reminds the RM to follow up.', ...changed('attended'),
    steps: [trig('Attendance recorded'), cond('c1', 'Attended', 'attended', 'eq', 'true'), cond('c2', 'Not followed up', 'follow_up_done', 'empty'), notify('n1', 'Tell the RM', { field: 'guest_rm', title: 'Event follow-up — {{name}}', message: 'Thank the guest and book a meeting.' })],
  },
  {
    object: 'event_registration', name: 'genesis_event_registration_rm', label: 'Event — registration goes to the guest\'s RM',
    description: 'A registration is assigned to the guest\'s relationship manager, who follows the guest up after the event.', ...ONCREATE,
    steps: [trig('A new registration'), cond('c1', 'Guest has an RM', 'guest_rm', 'notempty'), set('a1', 'Assign to the RM', 'assigned_to', '{{guest_rm}}')],
  },
  {
    // A campaign is a financial promotion: Compliance signs it off before it goes out.
    object: 'campaign', name: 'genesis_campaign_signoff', label: 'Campaign — Compliance sign-off',
    description: 'Moving a campaign to Compliance review asks Compliance to sign it off in Approvals; approval moves it to Approved, a return sends it back to Planning.', ...STAGE,
    steps: [
      trig('Stage change'),
      cond('c1', 'Moved to Compliance review', 'stage', 'eq', 'compliance_review'),
      set('p1', 'Sign-off pending', 'compliance_decision', 'pending'),
      approval('ap', 'Compliance sign-off', 'compliance_officer', 'Campaign sign-off: {{name}}', 'Budget MUR {{budget}} · {{start_date}} to {{end_date}} · {{content}}', 'ok1', 'no1'),
      set('ok1', 'Signed off', 'compliance_decision', 'approved'),
      set('ok2', 'Move to Approved', 'stage', 'approved'),
      notify('ok3', 'Tell the owner', { field: 'assigned_to', title: 'Campaign approved — {{name}}', message: 'Compliance signed it off. Move it to Live when it goes out.' }),
      cond('guard', 'Guard: stop the approved path', 'compliance_decision', 'eq', 'returned'),
      set('no1', 'Returned', 'compliance_decision', 'returned'),
      set('no2', 'Back to Planning', 'stage', 'planning'),
      notify('no3', 'Tell the owner', { field: 'assigned_to', title: 'Campaign returned — {{name}}', message: 'Compliance returned the campaign. See the comment in its Audit tab.' }),
    ],
  },
  {
    object: 'enquiry', name: 'genesis_enquiry_campaign_attribution', label: 'Enquiry — attribute to the campaign',
    description: 'A web enquiry whose link carried a campaign\'s tracking code (utm_campaign) is attributed to that campaign, so its enquiries, loans and ROI count it.', ...ONCREATE,
    steps: [
      trig('A new enquiry'),
      cond('c1', 'Not already attributed', 'campaign', 'empty'),
      cond('c2', 'Tracking code matches a campaign', 'tracked_campaign', 'notempty'),
      set('a1', 'Attribute to the campaign', 'campaign', '{{tracked_campaign}}'),
    ],
  },

  // ── Website touchpoints (I-01) ─────────────────────────────────────────────
  {
    object: 'web_event', name: 'genesis_web_callback', label: 'Website — call-back request',
    description: '"Talk to us / Talk to our FX specialist" call-back requests become enquiries routed to the right desk (§2.4).', ...ONCREATE,
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
    // A button on the publication (manual trigger): email it to the subscribers
    // of its topic who still consent, count opens, and mark it distributed.
    object: 'research_publication', name: 'genesis_research_distribute', label: 'Send to subscribers',
    description: 'Emails the publication to subscribers of its topic (EN/FR), skipping anyone without marketing consent; opens are counted on the publication.',
    trigger_type: 'manual',
    steps: [
      trig('Send to subscribers'),
      { key: 'l1', name: 'Email the subscribers', step_type: 'email_list', config: {
        template: 'research_publication', list_object: 'subscription', link_field: 'party',
        match: { topic: '{{publication_type}}' }, active: { status: 'subscribed' },
        language_field: 'preferred_language', suppress_field: 'marketing_suppressed', track_field: 'opens',
      } },
      set('s1', 'Mark distributed', 'sent', true),
    ],
  },
  {
    object: 'web_event', name: 'genesis_web_newsletter', label: 'Website — newsletter sign-up',
    description: 'A newsletter sign-up is welcomed and passed to Marketing.', ...ONCREATE,
    steps: [
      trig('A new web event'),
      cond('c1', 'Newsletter sign-up', 'event_type', 'eq', 'newsletter_signup'),
      email('m1', 'Welcome', 'newsletter_welcome', { to_field: 'email', language_field: undefined }),
      notify('n1', 'Tell Marketing', { role: 'marketing', title: 'Newsletter sign-up — {{email}}', message: 'Topic: {{topic}}. Match to a party and record the subscription.' }),
    ],
  },

  // ── M21 Compliance registers ───────────────────────────────────────────────
  {
    object: 'data_subject_request', name: 'genesis_dsr_intake', label: 'DPA — acknowledge a data subject request',
    description: 'A data subject request is acknowledged and Compliance alerted; the 30-day SLA runs.', ...ONCREATE,
    steps: [
      trig('A new request'),
      notify('n1', 'Tell Compliance', { role: 'compliance_officer', title: 'Data subject request — {{name}}', message: 'Respond by {{due_by}}.' }),
    ],
  },
  {
    object: 'gift_register', name: 'genesis_gift_threshold', label: 'Gifts — above-threshold approval',
    description: 'A gift or hospitality above MUR 5,000 waits for a Compliance decision in Approvals; the decision is written back to the register.', ...ONCREATE,
    steps: [
      trig('A new declaration'),
      cond('c1', 'Above threshold', 'needs_approval', 'eq', 'true'),
      approval('ap', 'Compliance decision', 'compliance_officer', 'Gift above MUR 5,000: {{name}}', 'MUR {{estimated_value}} · {{counterparty}} · {{event_date}}', 'ok1', 'no1'),
      set('ok1', 'Approved', 'decision', 'approved'),
      cond('guard', 'Guard: stop the approved path', 'decision', 'eq', 'declined'),
      set('no1', 'Declined / returned', 'decision', 'declined'),
    ],
  },
  {
    object: 'pa_dealing', name: 'genesis_pa_dealing_check', label: 'Personal dealing — pre-clearance',
    description: 'Requests in a restricted security are refused automatically; others go to Compliance.', ...ONCREATE,
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
  { object: 'fs_opportunity', name: 'Opportunities — by business unit', rule_type: 'rule_based', conditions: [{ field: 'business_unit', operator: 'equals', value: 'LND' }], pool: ['GCLOAN1', 'GCLOAN2'], fallback: 'GCRM1', order_index: 1 },
  { object: 'fs_opportunity', name: 'Opportunities — wealth', rule_type: 'rule_based', conditions: [{ field: 'business_unit', operator: 'equals', value: 'WLT' }], pool: ['GCRM2', 'GCPM1'], fallback: 'GCRM2', order_index: 2 },
  { object: 'credit_facility', name: 'Commercial facilities', rule_type: 'round_robin', pool: ['GCRM3'], fallback: 'GCRM3' },
  { object: 'fx_quote', name: 'FX quotes', rule_type: 'round_robin', pool: ['GCFX1'], fallback: 'GCFX1' },
  // Profiles and rate alerts (often opened by an RM) belong to the desk: the dealer is told when an alert is hit.
  { object: 'fx_profile', name: 'FX client profiles', rule_type: 'round_robin', pool: ['GCFX1'], fallback: 'GCFX1' },
  { object: 'fx_rate_alert', name: 'FX rate alerts', rule_type: 'round_robin', pool: ['GCFX1'], fallback: 'GCFX1' },
  { object: 'fund_order', name: 'Fund orders', rule_type: 'round_robin', pool: ['GCPM2'], fallback: 'GCPM1' },
  { object: 'client_order', name: 'Client orders', rule_type: 'round_robin', pool: ['GCTRD1'], fallback: 'GCTRD1' },
  { object: 'data_subject_request', name: 'Data subject requests', rule_type: 'round_robin', pool: ['GCCOMP1'], fallback: 'GCCOMP1' },
  { object: 'introducer_referral', name: 'Introducer referrals', rule_type: 'round_robin', pool: ['GCBDH'], fallback: 'GCBDH' },
  { object: 'conflict_check', name: 'Conflict checks', rule_type: 'round_robin', pool: ['GCCOMP1'], fallback: 'GCCOMP1' },
  { object: 'margin_call', name: 'Margin calls', rule_type: 'round_robin', pool: ['GCLMGR'], fallback: 'GCLMGR' },
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
    description: 'Compliance decides a conflict check within two business days.',
    config: { first_response_stages: ['requested'], closed_stages: ['decided'] },
    targets: [{ metric: 'first_response', minutes: 4 * H }, { metric: 'resolution', minutes: 2 * 8 * H }],
    escalations: [{ metric: '*', trigger: 'breach', action: 'notify_manager' }],
  },
  {
    name: 'Data subject requests — 30 days', object: 'data_subject_request',
    description: 'Mauritius DPA 2017: respond within one month.',
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
    description: 'From credit memo to decision within 10 business days.',
    config: { first_response_stages: ['origination'], closed_stages: ['active', 'declined', 'closed'] },
    targets: [{ metric: 'first_response', minutes: 2 * 8 * H }, { metric: 'resolution', minutes: 30 * 8 * H, warning_pct: 70 }],
    escalations: [{ metric: '*', trigger: 'breach', action: 'notify_manager' }],
  },
];

// ── Integrations (sandbox simulators; switch type + URL to go live) ─────────
const integrations = [
  ['genesis_screening', 'Sanctions / PEP screening (sandbox)', 'screening'],
  ['genesis_mcib', 'MCIB credit bureau (sandbox)', 'mcib'],
  ['genesis_lms', 'Core loan system (sandbox)', 'lms'],
  ['genesis_ta', 'Transfer agent (sandbox)', 'ta'],
  ['genesis_oms', 'Order management system (sandbox)', 'oms'],
  ['genesis_fx_dealing', 'FX dealing system (sandbox)', 'fx_dealing'],
  ['genesis_sms', 'SMS gateway (sandbox)', 'sms'],
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
  ...perm(['campaign', 'campaign_member', 'segment', 'marketing_event'], [...FRONT, 'coo', 'compliance_officer', 'auditor'], false),
  // The guest's RM follows up an event attendee and records a client's newsletter or research opt-in.
  ...perm(['event_registration', 'subscription'], FRONT, true),
  ...perm(['event_registration', 'subscription'], ['coo', 'compliance_officer', 'auditor'], false),
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
    'financial_product', 'product_routing', 'plr_rate', 'country', 'fx_rate', 'model_portfolio'], ['auditor'], false),
  ...perm(['client_relationship', 'party_relationship', 'consent_record', 'enquiry', 'referral', 'service_request', 'loan_application', 'collateral',
    'risk_profile', 'suitability_record', 'wealth_mandate', 'fund_order', 'securities_account', 'fx_profile', 'restricted_list_entry',
    'financial_product', 'product_routing', 'plr_rate', 'country', 'fx_rate', 'model_portfolio'], ['bu_head'], false),
  // The Head of BD onboards introducers: their party record and the KYC case it needs (flow 15, step A2).
  ...perm(['party', 'kyc_case'], ['bu_head'], true),
  ...perm(['party', 'consent_record', 'enquiry'], ['marketing'], false),
];

module.exports = { workflows, assignmentRules, slaPolicies, permissions, integrations };
