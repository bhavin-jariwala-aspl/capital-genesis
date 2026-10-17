'use strict';

/**
 * Genesis Capital — growth and relationship objects: households and contact
 * points (M02), cross-sell opportunities and next-best actions (M14), the RM
 * workbench's meeting notes and targets (M15), marketing campaigns, events,
 * subscriptions and segments (M18), introducers and commissions (M19), and
 * revenue attribution and fee invoicing (M20).
 */

const { o, BUSINESS_UNITS, PRODUCTS, CURRENCIES, CHANNELS } = require('./options');
const { KYC_STATUS, helpers: { F, SEL, LK, FX, AUTO, LIST, EXPR, stage, showWhen } } = require('./objects');

const toMur = (amount) => `IF(ISBLANK(currency_code) OR currency_code = 'MUR', ${amount}, ${amount} * LOOKUP('fx_rate', 'currency_code', currency_code, 'rate_to_mur', 'rate_date'))`;

// ── Client 360 extras ────────────────────────────────────────────────────────

const clientGroup = {
  name: 'client_group',
  label: 'Client Group',
  plural_label: 'Households & Groups',
  icon: 'Home',
  description: 'Households, family offices and corporate groups with aggregated relationship value and group lending exposure.',
  config: { title_field: 'name' },
  fields: [
    AUTO('group_no', 'Group No.', 'CG-'),
    F('name', 'Group', 'text', { required: true, config: { show_in_list: true } }),
    SEL('group_type', 'Type', o([['household', 'Household'], ['family_office', 'Family office'], ['corporate_group', 'Corporate group']]), { required: true, config: { show_in_list: true } }),
    F('primary_rm', 'Lead RM (employee id)'),
    F('group_limit', 'Group lending limit (MUR)', 'currency'),
    FX('members', 'Members', "COUNT_RELATED('party', 'client_group')", LIST),
    FX('group_value_mur', 'Aggregated relationship value (MUR)', "SUM_RELATED('party', 'client_group', 'total_relationship_value')", { format: 'currency', list: true }),
    FX('facility_exposure_mur', 'Group facility exposure (MUR)', "SUM_RELATED('credit_facility', 'borrower_group', 'amount_mur')", { format: 'currency' }),
    FX('limit_headroom_mur', 'Limit headroom (MUR)', 'IF(ISBLANK(group_limit), null, group_limit - facility_exposure_mur)', { format: 'currency' }),
  ],
  forms: [{ name: 'client_group_create', label: 'Client group', fields: ['name', 'group_type', 'primary_rm', 'group_limit'] }],
};

const contactPoint = {
  name: 'contact_point',
  label: 'Contact Point',
  plural_label: 'Addresses & Phones',
  icon: 'MapPin',
  description: 'Several addresses and phones per client, with verification status and the preferred one.',
  config: { title_field: 'name' },
  fields: [
    LK('party', 'Party', 'party', { required: true, config: { show_in_list: true } }),
    SEL('point_type', 'Type', o([['residential', 'Residential address'], ['correspondence', 'Correspondence address'], ['registered', 'Registered office'], ['mobile', 'Mobile'], ['landline', 'Landline'], ['work_email', 'Work email']]), { required: true, config: { show_in_list: true } }),
    F('value', 'Address / number', 'textarea', { required: true }),
    F('verified', 'Verified', 'checkbox', LIST),
    F('verified_on', 'Verified on', 'date'),
    F('preferred', 'Preferred', 'checkbox', LIST),
    FX('name', 'Contact point', "CONCAT(LABEL(point_type), ': ', value)", { type: 'string' }),
  ],
  forms: [{ name: 'contact_point_create', label: 'Add contact point', fields: ['party', 'point_type', { field: 'value', span: 2 }, 'verified', 'verified_on', 'preferred'] }],
};

// ── Cross-sell ───────────────────────────────────────────────────────────────

const opportunity = {
  name: 'fs_opportunity',
  label: 'Opportunity',
  plural_label: 'Opportunities',
  icon: 'Sparkles',
  description: 'Unified opportunity per BU and product with probability, forecast category and MUR value.',
  config: { title_field: 'name', business_unit_field: 'business_unit' },
  fields: [
    AUTO('opportunity_no', 'Opportunity No.', 'OPP-'),
    LK('party', 'Client', 'party', { required: true, config: { show_in_list: true } }),
    SEL('business_unit', 'Business unit', BUSINESS_UNITS, { required: true, config: { show_in_list: true } }),
    SEL('product_code', 'Product', PRODUCTS, { required: true, config: { show_in_list: true } }),
    F('amount', 'Amount', 'currency', { required: true }),
    SEL('currency_code', 'Currency', CURRENCIES, { default: 'MUR' }),
    F('probability', 'Probability %', 'percent', { default: '25' }),
    F('expected_close', 'Expected close', 'date', LIST),
    SEL('forecast_category', 'Forecast', o([['pipeline', 'Pipeline'], ['best_case', 'Best case'], ['commit', 'Commit'], ['closed', 'Closed']]), { default: 'pipeline', config: { show_in_list: true } }),
    F('owner_rm', 'Owner RM', 'text', { config: { employee: true } }),
    F('referrer_rm', 'Referrer RM (split credit)', 'text', { config: { employee: true } }),
    F('split_pct', 'Referrer credit %', 'percent', { default: '0' }),
    LK('nba_suggestion', 'From next-best action', 'nba_suggestion'),
    SEL('loss_reason', 'Loss reason', o([['price', 'Price'], ['competitor', 'Competitor'], ['timing', 'Timing'], ['no_need', 'No need'], ['not_eligible', 'Not eligible']])),
    FX('amount_mur', 'Amount (MUR)', toMur('amount'), { format: 'currency', precision: 2, list: true }),
    FX('weighted_mur', 'Weighted (MUR)', 'amount_mur * COALESCE(probability, 0) / 100', { format: 'currency', precision: 2 }),
    FX('name', 'Opportunity', "CONCAT(party.display_name, ' · ', LABEL(product_code))", { type: 'string' }),
  ],
  forms: [{ name: 'fs_opportunity_create', label: 'Opportunity', fields: ['party', 'business_unit', 'product_code', 'amount', 'currency_code', 'probability', 'expected_close', 'forecast_category', 'owner_rm', 'referrer_rm', 'split_pct', 'nba_suggestion', 'loss_reason'] }],
  pipeline: {
    name: 'fs_opportunity_flow', label: 'Opportunity',
    stages: [
      stage('identified', 'Identified', '#94a3b8'), stage('qualified', 'Qualified', '#6366f1'), stage('proposal', 'Proposal', '#3b82f6'),
      stage('negotiation', 'Negotiation', '#f59e0b'), stage('won', 'Won', '#10b981'), stage('lost', 'Lost', '#ef4444', { required_fields: ['loss_reason'] }),
    ],
  },
};

const nbaSuggestion = {
  name: 'nba_suggestion',
  label: 'Next-Best Action',
  plural_label: 'Next-Best Actions',
  icon: 'Lightbulb',
  description: 'Suggestions raised by the next-best-action rules (Builder workflows), worked by the RM.',
  config: { title_field: 'name', business_unit_field: 'business_unit' },
  fields: [
    LK('party', 'Client', 'party', { required: true, config: { show_in_list: true } }),
    SEL('rule', 'Rule', o([
      ['ibl_for_fund_holder', 'Fund holder without a loan → Investment-Backed Loan'],
      ['wealth_for_borrower', 'Real-estate borrower → Wealth / Money Market'],
      ['fx_for_corporate', 'Corporate with foreign-currency revenue → FX hedging'],
      ['fmb_reinvestment', 'FMB 2029 holder near maturity → reinvestment'],
      ['wealth_discovery_hnw', 'HNW with a personal loan only → Wealth discovery'],
      ['maturity_retention', 'Loan nearing maturity → retention / new need'],
      ['dormant_reactivation', 'Dormant trading account → reactivation'],
    ]), { required: true, config: { show_in_list: true } }),
    SEL('business_unit', 'For business unit', BUSINESS_UNITS, { required: true, config: { show_in_list: true } }),
    SEL('product_code', 'Suggested product', PRODUCTS),
    F('reason', 'Why', 'textarea'),
    SEL('status', 'Status', o([['open', 'Open', '#6366f1'], ['accepted', 'Accepted — opportunity opened', '#10b981'], ['dismissed', 'Dismissed', '#64748b']]), { default: 'open', config: { show_in_list: true } }),
    F('dismiss_reason', 'Dismiss reason'),
    FX('rule_status', 'Rule · status', "CONCAT(rule, '|', status)", { type: 'string', detail: false }),
    FX('name', 'Suggestion', "CONCAT(party.display_name, ' · ', LABEL(rule))", { type: 'string' }),
  ],
  dependencies: showWhen('status', 'dismissed', ['dismiss_reason']),
  forms: [{ name: 'nba_suggestion_create', label: 'Next-best action', fields: ['party', 'rule', 'business_unit', 'product_code', 'status', 'dismiss_reason', { field: 'reason', span: 2 }] }],
};

const meetingNote = {
  name: 'meeting_note',
  label: 'Meeting Note',
  plural_label: 'Meeting Notes',
  icon: 'NotebookPen',
  description: 'Structured notes for discovery, review and credit visits; feeds the RM workbench and team views.',
  config: { title_field: 'name', business_unit_field: 'business_unit' },
  fields: [
    LK('party', 'Client', 'party', { required: true, config: { show_in_list: true } }),
    SEL('template', 'Template', o([['discovery', 'Discovery meeting'], ['review', 'Review meeting'], ['credit_visit', 'Credit visit'], ['call', 'Call note'], ['event', 'Event follow-up']]), { required: true, config: { show_in_list: true } }),
    SEL('business_unit', 'Business unit', BUSINESS_UNITS, LIST),
    F('meeting_date', 'Date', 'date', { required: true, config: { show_in_list: true } }),
    F('meeting_time', 'Time', 'text', { placeholder: '10:30' }),
    SEL('location', 'Where', o([['office', 'Genesis Centre'], ['client', 'Client premises'], ['video', 'Video call'], ['phone', 'Phone']])),
    F('attendees', 'Attendees'),
    F('objectives', 'Objectives / needs discussed', 'textarea'),
    F('outcomes', 'Outcomes', 'textarea'),
    F('next_steps', 'Next steps', 'textarea'),
    F('follow_up_date', 'Follow up by', 'date'),
    F('rm', 'RM', 'text', { config: { show_in_list: true, employee: true } }),
    FX('name', 'Note', "CONCAT(LABEL(template), ' · ', party.display_name, ' · ', meeting_date)", { type: 'string' }),
  ],
  forms: [{ name: 'meeting_note_create', label: 'Meeting note', fields: ['party', 'template', 'business_unit', 'meeting_date', 'meeting_time', 'location', 'attendees', 'rm', { field: 'objectives', span: 2 }, { field: 'outcomes', span: 2 }, { field: 'next_steps', span: 2 }, 'follow_up_date'] }],
};

const rmTarget = {
  name: 'rm_target',
  label: 'RM Target',
  plural_label: 'RM Targets & Quotas',
  icon: 'Trophy',
  description: 'Quarterly targets per RM and BU in MUR, measured against won opportunities and revenue.',
  config: { title_field: 'name', business_unit_field: 'business_unit' },
  fields: [
    F('rm', 'RM (employee id)', 'text', { required: true, config: { show_in_list: true, employee: true } }),
    SEL('business_unit', 'Business unit', BUSINESS_UNITS, { required: true, config: { show_in_list: true } }),
    F('period', 'Quarter', 'text', { required: true, placeholder: '2026-Q4', config: { show_in_list: true } }),
    F('new_business_target', 'New business target (MUR)', 'currency', LIST),
    F('revenue_target', 'Revenue target (MUR)', 'currency', LIST),
    F('meetings_target', 'Meetings target', 'integer'),
    F('achieved_new_business', 'Achieved new business (MUR)', 'currency'),
    F('achieved_revenue', 'Achieved revenue (MUR)', 'currency'),
    FX('attainment_pct', 'Attainment %', 'IF(COALESCE(new_business_target, 0) > 0, achieved_new_business / new_business_target * 100, null)', { format: 'percent', precision: 1, list: true }),
    FX('name', 'Target', "CONCAT(rm, ' · ', LABEL(business_unit), ' · ', period)", { type: 'string' }),
  ],
  forms: [{ name: 'rm_target_create', label: 'Target', fields: ['rm', 'business_unit', 'period', 'new_business_target', 'revenue_target', 'meetings_target', 'achieved_new_business', 'achieved_revenue'] }],
};

// ── Marketing & consent ─────────────────────────────────────────────────────

const campaign = {
  name: 'campaign',
  label: 'Campaign',
  plural_label: 'Campaigns',
  icon: 'Megaphone',
  description: 'Objective, audience, budget, channels and ROI — attributed enquiries, loans and revenue. Compliance signs a campaign off before it goes live.',
  config: { title_field: 'name', business_unit_field: 'business_unit' },
  fields: [
    AUTO('campaign_no', 'Campaign No.', 'CMPN-'),
    F('name', 'Campaign', 'text', { required: true, config: { show_in_list: true } }),
    SEL('objective', 'Objective', o([['acquisition', 'Acquisition'], ['cross_sell', 'Cross-sell'], ['retention', 'Retention'], ['awareness', 'Awareness'], ['event', 'Event']]), LIST),
    SEL('business_unit', 'Business unit', BUSINESS_UNITS, LIST),
    SEL('product_code', 'Product', PRODUCTS),
    F('channels', 'Channels', 'multi_select', { options: o([['email', 'Email'], ['sms', 'SMS'], ['social', 'Social'], ['print', 'Print'], ['event', 'Event'], ['web', 'Website']]) }),
    LK('segment', 'Audience segment', 'segment'),
    F('budget', 'Budget (MUR)', 'currency', LIST),
    F('actual_cost', 'Actual cost (MUR)', 'currency'),
    F('start_date', 'Starts', 'date', LIST),
    F('end_date', 'Ends', 'date'),
    F('content', 'Message / content', 'textarea'),
    F('utm_code', 'Tracking code', 'text', { placeholder: 'e.g. first-home-2026', help: 'Put it in website links as utm_campaign=… — web enquiries that carry it are attributed to this campaign.' }),
    SEL('compliance_decision', 'Compliance sign-off', o([['pending', 'Pending', '#f59e0b'], ['approved', 'Approved', '#10b981'], ['returned', 'Returned', '#ef4444']]), { config: { always_disabled: true, show_in_list: true }, help: 'Recorded by the Compliance sign-off in Approvals when the campaign is moved to Compliance review.' }),
    FX('members', 'Audience', "COUNT_RELATED('campaign_member', 'campaign')", LIST),
    FX('responses', 'Responses', "COUNT_RELATED('campaign_member', 'campaign', 'responded', 'true')"),
    FX('enquiries', 'Attributed enquiries', "COUNT_RELATED('enquiry', 'campaign')", LIST),
    FX('loans_attributed_mur', 'Attributed loans (MUR)', "SUM_RELATED('loan_application', 'campaign', 'loan_amount_mur')", { format: 'currency' }),
    FX('revenue_attributed', 'Attributed revenue (MUR)', "SUM_RELATED('revenue_entry', 'campaign', 'amount_mur')", { format: 'currency', list: true }),
    FX('roi_pct', 'ROI %', 'IF(COALESCE(actual_cost, budget, 0) > 0, (revenue_attributed - COALESCE(actual_cost, budget)) / COALESCE(actual_cost, budget) * 100, null)', { format: 'percent', precision: 1, list: true }),
  ],
  forms: [{ name: 'campaign_create', label: 'Campaign', fields: ['name', 'objective', 'business_unit', 'product_code', 'channels', 'segment', 'budget', 'actual_cost', 'start_date', 'end_date', 'utm_code', { field: 'content', span: 2 }] }],
  // A campaign is a financial promotion: Compliance signs it off before it goes out (FSC). Moving it to Compliance
  // review sends the sign-off to Approvals; the decision moves it to Approved or back to Planning.
  pipeline: {
    name: 'campaign_flow', label: 'Campaign',
    stages: [
      stage('planning', 'Planning', '#94a3b8'),
      stage('compliance_review', 'Compliance review', '#f59e0b', { required_fields: ['segment', 'budget', 'start_date', 'end_date', 'content'] }),
      stage('approved', 'Approved', '#6366f1', { entry_rule: { expression: "compliance_decision = 'approved'", message: 'Compliance signs off a campaign before it is approved — move it to Compliance review.' } }),
      stage('live', 'Live', '#10b981', { entry_rule: { expression: "compliance_decision = 'approved'", message: 'Only a campaign Compliance has signed off can go live.' } }),
      stage('completed', 'Completed', '#3b82f6'),
      stage('cancelled', 'Cancelled', '#64748b'),
    ],
  },
};

const campaignMember = {
  name: 'campaign_member',
  label: 'Campaign Member',
  plural_label: 'Campaign Members',
  icon: 'UserCheck',
  description: 'Audience with suppression applied: no marketing without consent, to do-not-contact clients or clients with an open complaint.',
  config: { title_field: 'name' },
  fields: [
    LK('campaign', 'Campaign', 'campaign', { required: true, config: { show_in_list: true } }),
    LK('party', 'Party', 'party', {
      required: true, config: { show_in_list: true },
      validations: [EXPR('NOT(party.marketing_suppressed)', 'This client is suppressed from marketing (no consent, do-not-contact or open complaint)')],
    }),
    SEL('channel', 'Channel', o([['email', 'Email'], ['sms', 'SMS'], ['phone', 'Phone'], ['post', 'Post']]), { default: 'email' }),
    F('sent_on', 'Sent on', 'date'),
    F('opened', 'Opened', 'checkbox', LIST),
    F('clicked', 'Clicked', 'checkbox'),
    F('responded', 'Responded', 'checkbox', LIST),
    F('unsubscribed', 'Unsubscribed', 'checkbox'),
    FX('name', 'Member', "CONCAT(campaign.name, ' · ', party.display_name)", { type: 'string' }),
  ],
  forms: [{ name: 'campaign_member_create', label: 'Add member', fields: ['campaign', 'party', 'channel', 'sent_on', 'opened', 'clicked', 'responded', 'unsubscribed'] }],
};

const segment = {
  name: 'segment',
  label: 'Segment',
  plural_label: 'Segments',
  icon: 'Filter',
  description: 'Dynamic audiences defined by filters over the client master. Build the matching list with the report builder on the same criteria.',
  config: { title_field: 'name' },
  fields: [
    F('name', 'Segment', 'text', { required: true, config: { show_in_list: true } }),
    F('description', 'Who is in it', 'textarea'),
    SEL('base_object', 'Based on', o([['party', 'Parties'], ['fund_holding', 'Fund holders'], ['loan_account', 'Borrowers'], ['wealth_mandate', 'Wealth clients']]), { default: 'party' }),
    F('criteria', 'Criteria (filter expression)', 'textarea', { help: "e.g. segment IN ('hnw','uhnw') AND aum_mur = 0" }),
    F('estimated_size', 'Estimated size', 'integer', LIST),
    FX('campaigns', 'Campaigns using it', "COUNT_RELATED('campaign', 'segment')", LIST),
  ],
  forms: [{ name: 'segment_create', label: 'Segment', fields: ['name', 'base_object', 'estimated_size', { field: 'description', span: 2 }, { field: 'criteria', span: 2 }] }],
};

const marketingEvent = {
  name: 'marketing_event',
  label: 'Event',
  plural_label: 'Events & Seminars',
  icon: 'CalendarDays',
  description: 'Seminars and investor briefings with registration, attendance and follow-up by the guest\'s RM.',
  config: { title_field: 'name', business_unit_field: 'business_unit' },
  fields: [
    F('name', 'Event', 'text', { required: true, config: { show_in_list: true } }),
    SEL('business_unit', 'Business unit', BUSINESS_UNITS, LIST),
    LK('campaign', 'Campaign', 'campaign'),
    F('event_date', 'Date', 'date', { required: true, config: { show_in_list: true } }),
    F('venue', 'Venue'),
    F('capacity', 'Capacity', 'integer'),
    FX('registered', 'Registered', "COUNT_RELATED('event_registration', 'marketing_event')", LIST),
    FX('attended', 'Attended', "COUNT_RELATED('event_registration', 'marketing_event', 'attended', 'true')", LIST),
    FX('attendance_pct', 'Attendance %', 'IF(registered > 0, attended / registered * 100, null)', { format: 'percent', precision: 0 }),
  ],
  forms: [{ name: 'marketing_event_create', label: 'Event', fields: ['name', 'business_unit', 'campaign', 'event_date', 'venue', 'capacity'] }],
};

const eventRegistration = {
  name: 'event_registration',
  label: 'Registration',
  plural_label: 'Event Registrations',
  icon: 'Ticket',
  description: 'Who registered, who attended, and the follow-up task.',
  config: { title_field: 'name' },
  fields: [
    LK('marketing_event', 'Event', 'marketing_event', { required: true, config: { show_in_list: true } }),
    LK('party', 'Guest', 'party', { required: true, config: { show_in_list: true } }),
    F('registered_on', 'Registered on', 'date'),
    F('attended', 'Attended', 'checkbox', LIST),
    F('follow_up_done', 'Follow-up done', 'checkbox', LIST),
    FX('guest_rm', "Guest's RM", 'party.primary_rm', { type: 'string', help: 'The relationship manager told to follow up an attendee.' }),
    FX('name', 'Registration', "CONCAT(marketing_event.name, ' · ', party.display_name)", { type: 'string' }),
  ],
  forms: [{ name: 'event_registration_create', label: 'Register guest', fields: ['marketing_event', 'party', 'registered_on', 'attended', 'follow_up_done'] }],
};

const subscription = {
  name: 'subscription',
  label: 'Subscription',
  plural_label: 'Newsletter & Research Subscriptions',
  icon: 'Rss',
  description: 'Opt-in per publication (weekly highlights, market statistics, research, notices). Send to subscribers skips anyone suppressed from marketing.',
  config: { title_field: 'name' },
  fields: [
    LK('party', 'Subscriber', 'party', { required: true, config: { show_in_list: true } }),
    SEL('topic', 'Publication', o([['weekly_highlights', 'Weekly market highlights'], ['market_statistics', 'Market statistics'], ['research', 'Research notes'], ['notice', 'Notices & press'], ['fund_factsheets', 'Fund factsheets']]), { required: true, config: { show_in_list: true } }),
    SEL('status', 'Status', o([['subscribed', 'Subscribed', '#10b981'], ['unsubscribed', 'Unsubscribed', '#64748b']]), { default: 'subscribed', config: { show_in_list: true } }),
    F('subscribed_on', 'Since', 'date'),
    SEL('source', 'Source', CHANNELS),
    FX('name', 'Subscription', "CONCAT(LABEL(topic), ' · ', party.display_name)", { type: 'string' }),
  ],
  forms: [{ name: 'subscription_create', label: 'Subscription', fields: ['party', 'topic', 'status', 'subscribed_on', 'source'] }],
};

// ── Introducers ──────────────────────────────────────────────────────────────

const introducer = {
  name: 'introducer',
  label: 'Introducer',
  plural_label: 'Introducers & Partners',
  icon: 'Handshake',
  description: 'Introducer onboarding: KYC, agreement, allowed products and commission plan. Includes Genesis insurance agents.',
  // Portal sign-in is for active introducers only: an applicant or a suspended partner cannot submit referrals.
  config: { title_field: 'name', portal_signin_stages: ['active'] },
  fields: [
    AUTO('introducer_no', 'Introducer No.', 'INT-'),
    FX('name', 'Introducer', 'party.display_name', { type: 'string', list: true }),
    LK('party', 'Party', 'party', { required: true }),
    SEL('introducer_type', 'Type', o([['broker', 'Independent broker'], ['agent', 'Genesis insurance agent'], ['professional', 'Professional (notary, accountant)'], ['client', 'Existing client'], ['corporate', 'Corporate partner']]), { required: true, config: { show_in_list: true } }),
    F('agreement_signed_on', 'Agreement signed', 'date'),
    F('agreement_expires_on', 'Agreement expires', 'date'),
    F('allowed_products', 'Allowed products', 'multi_select', { options: PRODUCTS }),
    F('commission_pct', 'Commission % of funded / disbursed volume', 'percent', { config: { show_in_list: true, precision: 2 } }),
    F('clawback_months', 'Clawback period (months)', 'integer', { default: '12' }),
    F('protection_days', 'Attribution protection window (days)', 'integer', { default: '90' }),
    F('portal_email', 'Portal login email', 'email'),
    { ...FX('kyc_status', 'KYC', 'party.kyc_status', { type: 'string', list: true }), options: KYC_STATUS },
    FX('referrals', 'Referrals', "COUNT_RELATED('introducer_referral', 'introducer')", LIST),
    // A clawed-back commission is no longer earned.
    FX('commission_earned', 'Commission earned (MUR)', "COALESCE(SUM_RELATED('commission_entry', 'introducer', 'amount'), 0) - COALESCE(SUM_RELATED('commission_entry', 'introducer', 'amount', 'status', 'clawed_back'), 0)", { format: 'currency', list: true }),
  ],
  forms: [{ name: 'introducer_create', label: 'Introducer', fields: ['party', 'introducer_type', 'agreement_signed_on', 'agreement_expires_on', 'allowed_products', 'commission_pct', 'clawback_months', 'protection_days', 'portal_email'] }],
  pipeline: {
    name: 'introducer_onboarding', label: 'Onboarding',
    stages: [
      stage('applied', 'Applied', '#94a3b8'), stage('kyc', 'KYC', '#6366f1'),
      stage('agreement', 'Agreement', '#3b82f6', { required_fields: ['agreement_signed_on', 'commission_pct'] }),
      stage('active', 'Active', '#10b981', { entry_rule: { expression: "kyc_status = 'approved'", message: 'Activate an introducer only after KYC approval.' } }),
      stage('suspended', 'Suspended', '#ef4444'),
    ],
  },
};

const introducerReferral = {
  name: 'introducer_referral',
  label: 'Introducer Referral',
  plural_label: 'Introducer Referrals',
  icon: 'Send',
  description: 'Referrals submitted by introducers (portal or unique link) with the attribution protection window.',
  config: { title_field: 'name' },
  fields: [
    AUTO('referral_no', 'Referral No.', 'IR-'),
    LK('introducer', 'Introducer', 'introducer', { required: true, config: { show_in_list: true } }),
    F('prospect_first_name', 'Prospect first name', 'text', { required: true }),
    F('prospect_last_name', 'Prospect last name', 'text', { required: true }),
    FX('prospect_name', 'Prospect', "CONCAT(prospect_first_name, ' ', prospect_last_name)", { type: 'string', list: true }),
    F('prospect_email', 'Prospect email', 'email'),
    F('prospect_mobile', 'Prospect mobile', 'phone'),
    SEL('product_code', 'Product', PRODUCTS, { required: true, config: { show_in_list: true } }),
    F('estimated_amount', 'Estimated amount (MUR)', 'currency'),
    F('submitted_on', 'Submitted on', 'date', { required: true }),
    F('client_consented', 'Prospect consented to share status with the introducer', 'checkbox'),
    LK('enquiry', 'Enquiry created', 'enquiry', { config: { always_disabled: true } }),
    F('funded_amount', 'Funded / disbursed (MUR)', 'currency', LIST),
    FX('protected_until', 'Attribution protected until', 'ADD_DAYS(submitted_on, COALESCE(introducer.protection_days, 90))', { type: 'date', format: 'date', list: true }),
    FX('commission_due', 'Commission due (MUR)', 'COALESCE(funded_amount, 0) * COALESCE(introducer.commission_pct, 0) / 100', { format: 'currency', precision: 2 }),
    FX('name', 'Referral', "CONCAT(referral_no, ' · ', prospect_name)", { type: 'string' }),
  ],
  forms: [{ name: 'introducer_referral_create', label: 'Submit referral', fields: ['introducer', 'prospect_first_name', 'prospect_last_name', 'prospect_email', 'prospect_mobile', 'product_code', 'estimated_amount', 'submitted_on', 'client_consented', 'funded_amount'] }],
  pipeline: {
    name: 'introducer_referral_flow', label: 'Referral',
    stages: [
      stage('submitted', 'Submitted', '#6366f1'), stage('accepted', 'Accepted', '#3b82f6'), stage('in_progress', 'In progress', '#f59e0b'),
      stage('funded', 'Funded / disbursed', '#10b981', { required_fields: ['funded_amount'] }), stage('lost', 'Lost', '#ef4444'),
    ],
  },
};

const commissionEntry = {
  name: 'commission_entry',
  label: 'Commission',
  plural_label: 'Commissions',
  icon: 'Coins',
  description: 'Introducer commission on funded or disbursed volume with clawback.',
  config: { title_field: 'name' },
  fields: [
    LK('introducer', 'Introducer', 'introducer', { required: true, config: { show_in_list: true } }),
    LK('introducer_referral', 'Referral', 'introducer_referral'),
    F('period', 'Period', 'text', { required: true, placeholder: '2026-10', config: { show_in_list: true } }),
    F('base_amount', 'Funded volume (MUR)', 'currency'),
    F('amount', 'Commission (MUR)', 'currency', { required: true, config: { show_in_list: true } }),
    SEL('status', 'Status', o([['accrued', 'Accrued'], ['approved', 'Approved'], ['paid', 'Paid', '#10b981'], ['clawed_back', 'Clawed back', '#ef4444']]), { default: 'accrued', config: { show_in_list: true } }),
    F('paid_on', 'Paid on', 'date'),
    FX('name', 'Commission', "CONCAT(introducer.name, ' · ', period)", { type: 'string' }),
  ],
  forms: [{ name: 'commission_entry_create', label: 'Commission', fields: ['introducer', 'introducer_referral', 'period', 'base_amount', 'amount', 'status', 'paid_on'] }],
};

// ── Revenue ──────────────────────────────────────────────────────────────────

const revenueEntry = {
  name: 'revenue_entry',
  label: 'Revenue',
  plural_label: 'Revenue Ledger',
  icon: 'Receipt',
  description: 'Revenue lines by party, RM, BU and product with split credit for referrals. Interest income is an LMS summary only.',
  config: { title_field: 'name', business_unit_field: 'business_unit' },
  fields: [
    LK('party', 'Client', 'party', { config: { show_in_list: true } }),
    SEL('business_unit', 'Business unit', BUSINESS_UNITS, { required: true, config: { show_in_list: true } }),
    SEL('product_code', 'Product', PRODUCTS),
    SEL('revenue_type', 'Type', o([
      ['arrangement_fee', 'Loan arrangement / processing fee'], ['interest_income', 'Interest income (LMS summary)'], ['management_fee', 'Management fee'],
      ['performance_fee', 'Performance fee'], ['brokerage', 'Brokerage'], ['advisory_retainer', 'Advisory retainer'], ['success_fee', 'Advisory success fee'], ['fx_spread', 'FX spread income'],
    ]), { required: true, config: { show_in_list: true } }),
    F('amount', 'Amount', 'currency', { required: true }),
    SEL('currency_code', 'Currency', CURRENCIES, { default: 'MUR' }),
    F('period', 'Period (month)', 'text', { required: true, placeholder: '2026-10', config: { show_in_list: true } }),
    F('booked_on', 'Booked on', 'date'),
    F('rm', 'RM credited', 'text', { config: { show_in_list: true, employee: true } }),
    F('referrer_rm', 'Referrer RM (split credit)', 'text', { config: { employee: true } }),
    F('referrer_split_pct', 'Referrer split %', 'percent', { default: '0' }),
    LK('campaign', 'Campaign', 'campaign'),
    F('finance_amount', 'Finance figure (reconciliation)', 'currency'),
    // Where the line came from: posted by Finance, or raised by a workflow from the source business (REV-FR-03).
    SEL('source', 'Source', o([['manual', 'Posted by Finance'], ['fx_deal', 'FX deal (automatic)'], ['fee_invoice', 'Fee invoice paid (automatic)']]), { default: 'manual', config: { show_in_list: true } }),
    LK('fx_deal', 'FX deal', 'fx_deal'),
    LK('fee_invoice', 'Fee invoice', 'fee_invoice'),
    FX('amount_mur', 'Amount (MUR)', toMur('amount'), { format: 'currency', precision: 2, list: true }),
    FX('rm_credit_mur', 'RM credit (MUR)', 'amount_mur * (100 - COALESCE(referrer_split_pct, 0)) / 100', { format: 'currency', precision: 2 }),
    FX('referrer_credit_mur', 'Referrer credit (MUR)', 'amount_mur * COALESCE(referrer_split_pct, 0) / 100', { format: 'currency', precision: 2 }),
    FX('variance', 'Variance vs finance', 'IF(ISBLANK(finance_amount), null, amount - finance_amount)', { format: 'currency', precision: 2 }),
    FX('reconciliation', 'Reconciliation', "IF(ISBLANK(finance_amount), 'Awaiting finance figure', IF(ABS(amount - finance_amount) < 1, 'Reconciled', 'Variance to investigate'))", { type: 'string', list: true }),
    FX('name', 'Revenue', "CONCAT(LABEL(business_unit), ' · ', LABEL(revenue_type), ' · ', period)", { type: 'string' }),
  ],
  forms: [{ name: 'revenue_entry_create', label: 'Revenue line', fields: ['party', 'business_unit', 'product_code', 'revenue_type', 'amount', 'currency_code', 'period', 'booked_on', 'rm', 'referrer_rm', 'referrer_split_pct', 'campaign', 'finance_amount'] }],
};

const feeInvoice = {
  name: 'fee_invoice',
  label: 'Fee Invoice',
  plural_label: 'Fee Invoices',
  icon: 'FileSpreadsheet',
  description: 'Advisory retainers, milestone and success fees, with the invoice status from accounting.',
  config: { title_field: 'name', business_unit_field: 'business_unit', barrier_zone: 'ADV_PRIVATE' },
  fields: [
    AUTO('invoice_no', 'Invoice No.', 'INV-'),
    LK('advisory_mandate', 'Mandate', 'advisory_mandate', { required: true, config: { show_in_list: true } }),
    LK('advisory_deliverable', 'Milestone', 'advisory_deliverable'),
    SEL('fee_type', 'Fee', o([['retainer', 'Retainer'], ['milestone', 'Milestone'], ['success', 'Success fee'], ['expenses', 'Expenses']]), { required: true, config: { show_in_list: true } }),
    F('amount', 'Amount (MUR)', 'currency', { required: true, config: { show_in_list: true } }),
    F('issued_on', 'Issued on', 'date', LIST),
    F('due_on', 'Due on', 'date'),
    SEL('status', 'Status', o([['draft', 'Draft'], ['sent_to_accounting', 'Sent to accounting'], ['issued', 'Issued'], ['paid', 'Paid', '#10b981'], ['overdue', 'Overdue', '#ef4444']]), { default: 'draft', config: { show_in_list: true } }),
    F('revenue_posted', 'Revenue posted to the ledger', 'checkbox', { config: { always_disabled: true } }),
    FX('business_unit', 'Business unit', "'ADV'", { type: 'string' }),
    FX('name', 'Invoice', "CONCAT(invoice_no, ' · ', advisory_mandate.code_name)", { type: 'string' }),
  ],
  forms: [{ name: 'fee_invoice_create', label: 'Fee invoice', fields: ['advisory_mandate', 'advisory_deliverable', 'fee_type', 'amount', 'issued_on', 'due_on', 'status'] }],
};

module.exports = {
  clientGroup, contactPoint, opportunity, nbaSuggestion, meetingNote, rmTarget,
  campaign, campaignMember, segment, marketingEvent, eventRegistration, subscription,
  introducer, introducerReferral, commissionEntry, revenueEntry, feeInvoice,
};
