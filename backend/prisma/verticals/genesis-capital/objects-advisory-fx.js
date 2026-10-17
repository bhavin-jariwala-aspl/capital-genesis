'use strict';

/**
 * Genesis Capital — corporate advisory deal management behind the ADV_PRIVATE
 * information barrier (M12) and the forex desk (M13).
 *
 * Every advisory child record inherits the barrier through
 * `config.barrier_zone`, so deal teams, insider lists, investor books and
 * deliverables are invisible to the public side exactly like the mandate.
 */

const { o, CURRENCIES } = require('./options');
const { helpers: { F, SEL, LK, FX, AUTO, LIST, EXPR, stage } } = require('./objects');

const PRIVATE = { business_unit_field: 'business_unit', barrier_zone: 'ADV_PRIVATE' };
const ADV = FX('business_unit', 'Business unit', "'ADV'", { type: 'string' });
const FXBU = FX('business_unit', 'Business unit', "'FX'", { type: 'string' });

// ── Advisory ─────────────────────────────────────────────────────────────────

const conflictCheck = {
  name: 'conflict_check',
  label: 'Conflict Check',
  plural_label: 'Conflict Checks',
  icon: 'SearchCheck',
  description: 'Before engagement: matches against the party master, relationships across every Genesis entity, open mandates and the restricted list; Compliance clears or declines.',
  config: { title_field: 'name', ...PRIVATE },
  fields: [
    AUTO('check_no', 'Check No.', 'CC-'),
    LK('advisory_mandate', 'Mandate', 'advisory_mandate', { required: true, config: { show_in_list: true } }),
    FX('client', 'Client', 'advisory_mandate.client', { type: 'number', detail: false }),
    FX('counterparty', 'Counterparty', 'advisory_mandate.counterparty', { type: 'number', detail: false }),
    FX('client_relationships', 'Client: Genesis relationships', 'advisory_mandate.client.relationships'),
    FX('counterparty_relationships', 'Counterparty: Genesis relationships', 'COALESCE(advisory_mandate.counterparty.relationships, 0)', LIST),
    FX('counterparty_loans_mur', 'Counterparty: loans outstanding (MUR)', 'COALESCE(advisory_mandate.counterparty.loan_exposure_mur, 0)', { format: 'currency' }),
    FX('counterparty_mandates', 'Counterparty: is an advisory client', "IF(ISBLANK(LOOKUP('advisory_mandate', 'client', counterparty, 'id')), 0, 1)", { help: 'Evaluated inside the advisory barrier; never surfaced on the public-side party record.' }),
    // Shown to Compliance as a label, not the list's stored code.
    FX('restricted_match', 'Restricted / watch list', "CASE(COALESCE(LOOKUP('restricted_list_entry', 'issuer', advisory_mandate.counterparty.display_name, 'list_type'), COALESCE(LOOKUP('restricted_list_entry', 'issuer', advisory_mandate.client.display_name, 'list_type'), 'clear')), 'restricted', 'On the restricted list', 'watch', 'On the watch list', 'Clear')", { type: 'string', list: true }),
    FX('matches', 'Potential conflicts found', "IF(counterparty_relationships > 0, 1, 0) + IF(counterparty_mandates > 0, 1, 0) + IF(restricted_match != 'Clear', 1, 0)", LIST),
    F('staff_declarations', 'Staff declarations / other matches', 'textarea'),
    SEL('decision', 'Compliance decision', o([['pending', 'Pending'], ['cleared', 'Cleared', '#10b981'], ['managed', 'Cleared with controls', '#f59e0b'], ['declined', 'Declined', '#ef4444']]), { default: 'pending', config: { show_in_list: true } }),
    F('controls', 'Controls / rationale', 'textarea', { validations: [EXPR("decision != 'managed' OR NOT(ISBLANK(controls))", 'Describe the controls for a conflict cleared with controls')] }),
    F('decided_by', 'Decided by', 'text', { config: { always_disabled: true } }),
    F('decided_on', 'Decided on', 'date', { config: { always_disabled: true } }),
    ADV,
    FX('name', 'Conflict check', "CONCAT(advisory_mandate.code_name, ' · ', check_no)", { type: 'string' }),
  ],
  forms: [{ name: 'conflict_check_create', label: 'Run conflict check', fields: ['advisory_mandate', 'decision', { field: 'staff_declarations', span: 2 }, { field: 'controls', span: 2 }] }],
  pipeline: {
    name: 'conflict_check_flow', label: 'Conflict check',
    stages: [stage('requested', 'Requested', '#6366f1'), stage('under_review', 'Compliance review', '#f59e0b'), stage('decided', 'Decided', '#10b981', { entry_rule: { expression: "decision != 'pending'", message: 'Record Compliance\'s decision first.' } })],
  },
};

const dealTeamMember = {
  name: 'deal_team_member',
  label: 'Deal Team Member',
  plural_label: 'Deal Teams',
  icon: 'Users2',
  description: 'Staff on a mandate. Adding a member also adds them to the insider list.',
  config: { title_field: 'name', ...PRIVATE },
  fields: [
    LK('advisory_mandate', 'Mandate', 'advisory_mandate', { required: true, config: { show_in_list: true } }),
    F('employee_id', 'Employee id', 'text', { required: true, config: { show_in_list: true } }),
    F('employee_name', 'Name', 'text', LIST),
    SEL('deal_role', 'Role', o([['lead', 'Lead advisor'], ['analyst', 'Analyst'], ['reviewer', 'Reviewer'], ['compliance', 'Compliance']]), LIST),
    F('added_on', 'Added on', 'date', { required: true }),
    F('insider_added', 'On the insider list', 'checkbox', { config: { always_disabled: true } }),
    ADV,
    FX('name', 'Member', "CONCAT(advisory_mandate.code_name, ' · ', COALESCE(employee_name, employee_id))", { type: 'string' }),
  ],
  forms: [{ name: 'deal_team_member_create', label: 'Add to deal team', fields: ['advisory_mandate', 'employee_id', 'employee_name', 'deal_role', 'added_on'] }],
};

const insiderListEntry = {
  name: 'insider_list_entry',
  label: 'Insider',
  plural_label: 'Insider Lists',
  icon: 'Eye',
  description: 'Everyone who received inside information, with date, time and reason — exportable for the regulator.',
  config: { title_field: 'name', ...PRIVATE },
  fields: [
    LK('advisory_mandate', 'Mandate', 'advisory_mandate', { required: true, config: { show_in_list: true } }),
    F('person', 'Person', 'text', { required: true, config: { show_in_list: true } }),
    SEL('person_type', 'Type', o([['staff', 'Genesis staff'], ['wall_crossed', 'Wall-crossed staff'], ['client', 'Client personnel'], ['adviser', 'External adviser'], ['investor', 'Investor (wall-crossed)']]), { required: true, config: { show_in_list: true } }),
    F('organisation', 'Organisation'),
    F('received_at', 'Received inside information at', 'text', { required: true, placeholder: 'YYYY-MM-DD HH:MM', config: { show_in_list: true } }),
    F('reason', 'Reason', 'textarea', { required: true }),
    F('ceased_at', 'Ceased to be an insider at', 'text'),
    ADV,
    FX('name', 'Insider', "CONCAT(advisory_mandate.code_name, ' · ', person)", { type: 'string' }),
  ],
  forms: [{ name: 'insider_list_entry_create', label: 'Add insider', fields: ['advisory_mandate', 'person', 'person_type', 'organisation', 'received_at', 'ceased_at', { field: 'reason', span: 2 }] }],
};

const investorTarget = {
  name: 'investor_target',
  label: 'Investor Target',
  plural_label: 'Investor Bookbuilding',
  icon: 'Target',
  description: 'Investor universe for a raise: targeting, NDA, IM distribution, indications, commitments and allocations.',
  config: { title_field: 'name', ...PRIVATE },
  fields: [
    LK('advisory_mandate', 'Mandate', 'advisory_mandate', { required: true, config: { show_in_list: true } }),
    LK('investor', 'Investor', 'party', { required: true, config: { show_in_list: true } }),
    SEL('investor_type', 'Investor type', o([['pension_fund', 'Pension fund'], ['insurer', 'Insurer'], ['fund', 'Investment fund'], ['bank', 'Bank'], ['hnwi', 'HNWI'], ['corporate', 'Corporate']]), LIST),
    SEL('nda_status', 'NDA', o([['not_sent', 'Not sent'], ['sent', 'Sent'], ['signed', 'Signed', '#10b981'], ['declined', 'Declined', '#ef4444']]), { default: 'not_sent', config: { show_in_list: true } }),
    F('im_shared_on', 'IM shared on', 'date'),
    F('im_views', 'IM views (share-link analytics)', 'integer'),
    F('ioi_amount', 'Indication of interest (MUR)', 'currency', { config: { show_in_list: true }, validations: [EXPR("nda_status = 'signed'", 'Take an indication only after the NDA is signed')] }),
    F('commitment', 'Commitment (MUR)', 'currency', LIST),
    F('allocation', 'Allocation (MUR)', 'currency', LIST),
    ADV,
    FX('name', 'Target', "CONCAT(advisory_mandate.code_name, ' · ', investor.display_name)", { type: 'string' }),
  ],
  forms: [{ name: 'investor_target_create', label: 'Add investor', fields: ['advisory_mandate', 'investor', 'investor_type', 'nda_status', 'im_shared_on', 'im_views', 'ioi_amount', 'commitment', 'allocation'] }],
  pipeline: {
    name: 'bookbuilding', label: 'Bookbuilding',
    stages: [
      stage('targeted', 'Targeted', '#94a3b8'), stage('nda', 'NDA', '#6366f1', { required_fields: ['nda_status'] }),
      // One rule, so the NDA — the reason for the gate — is what the user is told first.
      stage('im_shared', 'IM shared', '#3b82f6', { entry_rule: { expression: "nda_status = 'signed' AND NOT(ISBLANK(im_shared_on))", message: 'Share the IM only after the NDA is signed — then record the date it was shared.' } }),
      stage('ioi', 'Indication', '#f59e0b', { required_fields: ['ioi_amount'] }),
      stage('committed', 'Committed', '#10b981', { required_fields: ['commitment'] }),
      stage('allocated', 'Allocated', '#15803d', { required_fields: ['allocation'] }),
      stage('declined', 'Declined', '#ef4444'),
    ],
  },
};

const advisoryDeliverable = {
  name: 'advisory_deliverable',
  label: 'Deliverable',
  plural_label: 'Deliverables & Milestones',
  icon: 'FileText',
  description: 'Valuation reports, business plans, models — version-controlled on the Docs tab with review and approval; milestones trigger fee invoicing.',
  config: { title_field: 'name', ...PRIVATE },
  fields: [
    LK('advisory_mandate', 'Mandate', 'advisory_mandate', { required: true, config: { show_in_list: true } }),
    F('title', 'Deliverable / milestone', 'text', { required: true, config: { show_in_list: true } }),
    SEL('deliverable_type', 'Type', o([['valuation_report', 'Valuation report'], ['business_plan', 'Business plan'], ['financial_model', 'Financial model'], ['information_memorandum', 'Information memorandum'], ['market_research', 'Market research'], ['board_paper', 'Board paper'], ['milestone', 'Fee milestone']]), LIST),
    F('due_date', 'Due', 'date', LIST),
    F('version', 'Version', 'text', { default: 'v1' }),
    F('reviewer', 'Reviewer (employee id)'),
    F('milestone_fee', 'Milestone fee (MUR)', 'currency'),
    F('invoice_raised', 'Invoice raised', 'checkbox', { config: { always_disabled: true } }),
    ADV,
    FX('name', 'Deliverable', "CONCAT(advisory_mandate.code_name, ' · ', title)", { type: 'string' }),
  ],
  forms: [{ name: 'advisory_deliverable_create', label: 'Add deliverable', fields: ['advisory_mandate', 'title', 'deliverable_type', 'due_date', 'version', 'reviewer', 'milestone_fee'] }],
  pipeline: {
    name: 'deliverable_flow', label: 'Deliverable',
    stages: [stage('drafting', 'Drafting', '#94a3b8'), stage('in_review', 'In review', '#f59e0b'), stage('approved', 'Approved', '#6366f1', { required_fields: ['reviewer'] }), stage('delivered', 'Delivered to client', '#10b981')],
  },
};

const timeEntry = {
  name: 'time_entry',
  label: 'Time Entry',
  plural_label: 'Time & Effort',
  icon: 'Timer',
  description: 'Hours per mandate for profitability analysis.',
  config: { title_field: 'name', ...PRIVATE },
  fields: [
    LK('advisory_mandate', 'Mandate', 'advisory_mandate', { required: true, config: { show_in_list: true } }),
    F('employee_id', 'Employee', 'text', { required: true, config: { show_in_list: true } }),
    F('work_date', 'Date', 'date', { required: true, config: { show_in_list: true } }),
    F('hours', 'Hours', 'decimal', { required: true, config: { show_in_list: true }, validations: [{ type: 'positive', message: 'Hours must be positive' }, { type: 'max', value: 16, message: 'At most 16 hours a day' }] }),
    F('activity', 'Activity'),
    F('rate', 'Internal rate (MUR / hour)', 'currency', { default: '4500' }),
    FX('cost', 'Cost (MUR)', 'hours * COALESCE(rate, 0)', { format: 'currency', precision: 2, list: true }),
    ADV,
    FX('name', 'Time', "CONCAT(advisory_mandate.code_name, ' · ', employee_id, ' · ', work_date)", { type: 'string' }),
  ],
  forms: [{ name: 'time_entry_create', label: 'Log time', fields: ['advisory_mandate', 'employee_id', 'work_date', 'hours', 'activity', 'rate'] }],
};

const dealCredential = {
  name: 'deal_credential',
  label: 'Credential',
  plural_label: 'Tombstones & Credentials',
  icon: 'Award',
  description: 'Closed-deal tombstones for future pitches. Public once the deal is announced — no barrier.',
  config: { title_field: 'headline', business_unit_field: 'business_unit' },
  fields: [
    F('headline', 'Tombstone headline', 'text', { required: true, config: { show_in_list: true } }),
    SEL('service_line', 'Service line', o([['fund_raising', 'Fund raising'], ['valuation', 'Valuation & business plan'], ['restructuring', 'Corporate restructuring']]), LIST),
    F('sector', 'Sector', 'text', LIST),
    F('deal_value', 'Deal value (MUR)', 'currency', LIST),
    F('closed_on', 'Closed', 'date', LIST),
    F('public', 'Publicly announced', 'checkbox', { default: 'true' }),
    F('summary', 'Summary', 'textarea'),
    ADV,
  ],
  forms: [{ name: 'deal_credential_create', label: 'Credential', fields: ['headline', 'service_line', 'sector', 'deal_value', 'closed_on', 'public', { field: 'summary', span: 2 }] }],
};

// ── Forex ────────────────────────────────────────────────────────────────────

const fxQuote = {
  name: 'fx_quote',
  label: 'FX Quote',
  plural_label: 'FX Quotes',
  icon: 'MessageSquareQuote',
  description: 'Client asks, dealer quotes, client accepts — with a time-stamped audit for best execution (FX-FR-03).',
  config: { title_field: 'name', business_unit_field: 'business_unit' },
  fields: [
    AUTO('quote_no', 'Quote No.', 'FXQ-'),
    LK('party', 'Client', 'party', { required: true, config: { show_in_list: true } }),
    LK('fx_profile', 'FX profile', 'fx_profile'),
    SEL('product', 'Product', o([['spot', 'Spot'], ['forward', 'Forward'], ['swap', 'Swap']]), { required: true, config: { show_in_list: true } }),
    SEL('side', 'Client buys / sells', o([['buys', 'Buys foreign currency'], ['sells', 'Sells foreign currency']]), { required: true }),
    SEL('currency_code', 'Currency', CURRENCIES.filter((c) => c.value !== 'MUR'), { required: true, config: { show_in_list: true } }),
    F('amount', 'Amount (foreign)', 'currency', { required: true, config: { show_in_list: true, currency_field: 'currency_code' } }),
    F('value_date', 'Value date', 'date'),
    F('requested_at', 'Requested at', 'text', { required: true, placeholder: 'YYYY-MM-DD HH:MM', default: '{{now}}' }),
    F('quoted_rate', 'Quoted rate (MUR per unit)', 'decimal', LIST),
    F('quoted_at', 'Quoted at', 'text'),
    F('responded_at', 'Client responded at', 'text'),
    FX('board_rate', 'Board rate at the time', "IF(side = 'buys', LOOKUP('fx_rate', 'currency_code', currency_code, 'sell_tt', 'rate_date'), LOOKUP('fx_rate', 'currency_code', currency_code, 'buy_tt', 'rate_date'))", { precision: 4 }),
    FX('improvement_vs_board', 'Improvement vs board (MUR)', "IF(ISBLANK(quoted_rate), null, IF(side = 'buys', (board_rate - quoted_rate) * amount, (quoted_rate - board_rate) * amount))", { format: 'currency', precision: 2 }),
    FX('amount_mur', 'Amount (MUR)', 'amount * COALESCE(quoted_rate, board_rate)', { format: 'currency', precision: 2 }),
    FXBU,
    FX('name', 'Quote', "CONCAT(quote_no, ' · ', LABEL(side), ' ', currency_code, ' ', amount)", { type: 'string' }),
  ],
  forms: [{ name: 'fx_quote_create', label: 'Quote request', fields: ['party', 'fx_profile', 'product', 'side', 'currency_code', 'amount', 'value_date', 'requested_at', 'quoted_rate', 'quoted_at', 'responded_at'] }],
  pipeline: {
    name: 'fx_quote_flow', label: 'Quote',
    stages: [
      stage('requested', 'Requested', '#6366f1'), stage('quoted', 'Quoted', '#3b82f6', { required_fields: ['quoted_rate', 'quoted_at'] }),
      stage('accepted', 'Accepted', '#10b981', { required_fields: ['responded_at'] }), stage('rejected', 'Rejected', '#ef4444'), stage('expired', 'Expired', '#64748b'),
    ],
  },
};

const fxDeal = {
  name: 'fx_deal',
  label: 'FX Deal',
  plural_label: 'FX Deals',
  icon: 'ArrowLeftRight',
  description: 'Deal hand-off with the dealing-system reference; forwards feed the maturity calendar; BoM purpose codes for regulatory reporting (FX-FR-03/05/06).',
  config: { title_field: 'name', business_unit_field: 'business_unit' },
  fields: [
    AUTO('deal_no', 'Deal No.', 'FXD-'),
    LK('party', 'Client', 'party', { required: true, config: { show_in_list: true } }),
    LK('fx_profile', 'FX profile', 'fx_profile'),
    LK('fx_quote', 'From quote', 'fx_quote'),
    SEL('product', 'Product', o([['spot', 'Spot'], ['forward', 'Forward'], ['swap', 'Swap']]), { required: true, config: { show_in_list: true } }),
    SEL('side', 'Client buys / sells', o([['buys', 'Buys foreign currency'], ['sells', 'Sells foreign currency']]), { required: true }),
    SEL('currency_code', 'Currency', CURRENCIES.filter((c) => c.value !== 'MUR'), { required: true, config: { show_in_list: true } }),
    F('amount', 'Amount (foreign)', 'currency', { required: true, config: { currency_field: 'currency_code' } }),
    F('deal_rate', 'Deal rate', 'decimal', { required: true }),
    F('trade_date', 'Trade date', 'date', { required: true, config: { show_in_list: true } }),
    F('value_date', 'Value / maturity date', 'date', LIST),
    F('dealing_reference', 'Dealing-system reference', 'text', LIST),
    SEL('purpose_code', 'BoM purpose code', o([['IMP', 'Imports of goods'], ['EXP', 'Exports of goods'], ['EDU', 'Education'], ['PRO', 'Property abroad'], ['INV', 'Investment'], ['TRV', 'Travel'], ['OTH', 'Other']]), LIST),
    F('settled', 'Settled', 'checkbox', LIST),
    F('rollover_offered', 'Roll-over offered', 'checkbox', { config: { always_disabled: true } }),
    FX('party_email', 'Client email', 'party.email', { type: 'string' }),
    FX('preferred_language', 'Language', "COALESCE(party.preferred_language, 'en')", { type: 'string' }),
    FX('amount_mur', 'Amount (MUR)', 'amount * deal_rate', { format: 'currency', precision: 2, list: true }),
    FX('mid_rate', 'Mid rate', "LOOKUP('fx_rate', 'currency_code', currency_code, 'rate_to_mur', 'rate_date')", { precision: 4 }),
    // The quote's board rate and improvement travel with the deal it books (best-execution evidence).
    FX('board_rate', 'Board rate at the time', 'fx_quote.board_rate', { precision: 4 }),
    FX('improvement_vs_board', 'Improvement vs board (MUR)', 'fx_quote.improvement_vs_board', { format: 'currency', precision: 2 }),
    FX('spread_income', 'Spread income (MUR)', "IF(side = 'buys', (deal_rate - mid_rate) * amount, (mid_rate - deal_rate) * amount)", { format: 'currency', precision: 2, list: true }),
    FX('open_forward', 'Open forward', "product != 'spot' AND NOT(settled)", { type: 'boolean', format: 'checkbox' }),
    FX('days_to_value', 'Days to value date', 'IF(ISBLANK(value_date), null, DAYS_BETWEEN(TODAY(), value_date))'),
    FXBU,
    FX('name', 'Deal', "CONCAT(deal_no, ' · ', LABEL(product), ' ', currency_code, ' ', amount)", { type: 'string' }),
  ],
  forms: [{ name: 'fx_deal_create', label: 'Record deal', fields: ['party', 'fx_profile', 'fx_quote', 'product', 'side', 'currency_code', 'amount', 'deal_rate', 'trade_date', 'value_date', 'dealing_reference', 'purpose_code', 'settled'] }],
};

const fxRateAlert = {
  name: 'fx_rate_alert',
  label: 'Rate Alert',
  plural_label: 'FX Rate Alerts',
  icon: 'BellRing',
  description: 'Client-requested target-rate alerts, checked against the rate board and sent when hit (FX-FR-04).',
  config: { title_field: 'name', business_unit_field: 'business_unit' },
  fields: [
    LK('party', 'Client', 'party', { required: true, config: { show_in_list: true } }),
    SEL('currency_code', 'Currency', CURRENCIES.filter((c) => c.value !== 'MUR'), { required: true, config: { show_in_list: true } }),
    SEL('direction', 'Alert when the rate', o([['below', 'falls to or below'], ['above', 'rises to or above']]), { required: true }),
    F('target_rate', 'Target rate (MUR per unit)', 'decimal', { required: true, config: { show_in_list: true } }),
    SEL('channel', 'Notify by', o([['email', 'Email'], ['sms', 'SMS']]), { default: 'email' }),
    F('expires_on', 'Expires on', 'date'),
    FX('current_rate', 'Current board rate', "LOOKUP('fx_rate', 'currency_code', currency_code, 'rate_to_mur', 'rate_date')", { precision: 4, list: true }),
    FX('hit', 'Target hit', "IF(direction = 'below', current_rate <= target_rate, current_rate >= target_rate)", { type: 'boolean', format: 'checkbox', list: true }),
    F('triggered_on', 'Triggered on', 'date', { config: { always_disabled: true } }),
    F('converted_to_deal', 'Converted to a deal', 'checkbox'),
    FX('party_email', 'Client email', 'party.email', { type: 'string' }),
    FX('preferred_language', 'Language', "COALESCE(party.preferred_language, 'en')", { type: 'string' }),
    FX('party_mobile', 'Client mobile', 'party.mobile', { type: 'string' }),
    FXBU,
    FX('name', 'Alert', "CONCAT(currency_code, ' ', LABEL(direction), ' ', target_rate, ' · ', party.display_name)", { type: 'string' }),
  ],
  forms: [{ name: 'fx_rate_alert_create', label: 'Rate alert', fields: ['party', 'currency_code', 'direction', 'target_rate', 'channel', 'expires_on', 'converted_to_deal'] }],
  pipeline: {
    name: 'fx_alert_flow', label: 'Alert',
    stages: [stage('active', 'Active', '#6366f1'), stage('triggered', 'Triggered', '#10b981'), stage('expired', 'Expired', '#64748b')],
  },
};

module.exports = {
  conflictCheck, dealTeamMember, insiderListEntry, investorTarget, advisoryDeliverable, timeEntry, dealCredential,
  fxQuote, fxDeal, fxRateAlert,
};
