'use strict';

/**
 * Genesis Capital — investments: wealth reviews and AUM snapshots (M09), the fund
 * and share-class master, NAV history, holdings, campaigns and distributions
 * (M10), and securities order intake, indications of interest and research
 * distribution (M11). PMS / transfer agent / OMS stay the systems of record:
 * AUM, NAV and holdings here are synced snapshots (ADR-04).
 */

const { o, CURRENCIES } = require('./options');
const { helpers: { F, SEL, LK, FX, AUTO, LIST, EXPR, stage } } = require('./objects');

const toMur = (amountExpr, ccyExpr) =>
  `IF(${ccyExpr} = 'MUR', ${amountExpr}, ${amountExpr} * LOOKUP('fx_rate', 'currency_code', ${ccyExpr}, 'rate_to_mur', 'rate_date'))`;

// ── Wealth ───────────────────────────────────────────────────────────────────

const mandateReview = {
  name: 'mandate_review',
  label: 'Mandate Review',
  plural_label: 'Mandate Reviews',
  icon: 'CalendarCheck',
  description: 'Review cycle per mandate with a preparation pack, suitability check and minutes (WLT-FR-04).',
  config: { title_field: 'name', business_unit_field: 'business_unit' },
  fields: [
    LK('wealth_mandate', 'Mandate', 'wealth_mandate', { required: true, config: { show_in_list: true } }),
    F('due_date', 'Due', 'date', { required: true, config: { show_in_list: true } }),
    F('held_on', 'Held on', 'date', LIST),
    SEL('review_type', 'Type', o([['quarterly', 'Quarterly'], ['semi_annual', 'Semi-annual'], ['annual', 'Annual'], ['ad_hoc', 'Ad hoc']]), { default: 'annual' }),
    FX('aum_at_review', 'AUM at preparation', 'wealth_mandate.aum', { format: 'currency', precision: 2 }),
    FX('ytd_performance', 'YTD performance %', 'wealth_mandate.ytd_return_pct', { precision: 2 }),
    F('suitability_confirmed', 'Profile and suitability re-confirmed', 'checkbox'),
    F('minutes', 'Minutes', 'textarea'),
    SEL('outcome', 'Outcome', o([['no_change', 'No change'], ['rebalance', 'Rebalance'], ['model_change', 'Model portfolio change'], ['top_up', 'Top-up agreed'], ['withdrawal', 'Withdrawal'], ['at_risk', 'Client at risk', '#ef4444']]), LIST),
    FX('overdue', 'Overdue', 'ISBLANK(held_on) AND due_date < TODAY()', { type: 'boolean', format: 'checkbox', list: true }),
    FX('open', 'Open', 'ISBLANK(held_on)', { type: 'boolean', format: 'checkbox' }),
    FX('business_unit', 'Business unit', "'WLT'", { type: 'string' }),
    FX('name', 'Review', "CONCAT(wealth_mandate.mandate_no, ' · ', due_date)", { type: 'string' }),
  ],
  forms: [{ name: 'mandate_review_create', label: 'Review', fields: ['wealth_mandate', 'review_type', 'due_date', 'held_on', 'suitability_confirmed', 'outcome', { field: 'minutes', span: 2 }] }],
  pipeline: {
    name: 'mandate_review_flow', label: 'Review',
    stages: [
      stage('scheduled', 'Scheduled', '#94a3b8'), stage('pack_prepared', 'Pack prepared', '#6366f1'),
      stage('held', 'Meeting held', '#3b82f6', { required_fields: ['held_on'] }),
      stage('completed', 'Completed', '#10b981', { required_fields: ['outcome', 'minutes'], entry_rule: { expression: 'suitability_confirmed', message: 'Re-confirm the client\'s profile and suitability before closing the review.' } }),
    ],
  },
};

const aumSnapshot = {
  name: 'aum_snapshot',
  label: 'AUM Snapshot',
  plural_label: 'AUM Snapshots',
  icon: 'BarChart3',
  description: 'Month-end market value by asset class, performance and flows from the PMS (WLT-FR-03).',
  config: { title_field: 'name', business_unit_field: 'business_unit' },
  fields: [
    LK('wealth_mandate', 'Mandate', 'wealth_mandate', { required: true, config: { show_in_list: true } }),
    F('as_of', 'As of', 'date', { required: true, config: { show_in_list: true } }),
    F('market_value', 'Market value (base ccy)', 'currency', LIST),
    F('equities', 'Equities', 'currency'),
    F('bonds', 'Bonds', 'currency'),
    F('cash', 'Cash', 'currency'),
    F('alternatives', 'Alternatives', 'currency'),
    F('net_flows', 'Net flows in month', 'currency', { config: { show_in_list: true, allow_negative: true }, help: 'Top-ups minus withdrawals; negative when money left the mandate.' }),
    F('mtd_return_pct', 'MTD %', 'decimal'),
    F('ytd_return_pct', 'YTD %', 'decimal', LIST),
    F('since_inception_pct', 'Since inception %', 'decimal'),
    FX('base_currency', 'Base currency', 'wealth_mandate.base_currency', { type: 'string' }),
    FX('market_value_mur', 'Market value (MUR)', toMur('market_value', 'base_currency'), { format: 'currency', precision: 2 }),
    FX('business_unit', 'Business unit', "'WLT'", { type: 'string' }),
    FX('name', 'Snapshot', "CONCAT(wealth_mandate.mandate_no, ' @ ', as_of)", { type: 'string' }),
  ],
  forms: [{ name: 'aum_snapshot_create', label: 'AUM snapshot', columns: 3, fields: ['wealth_mandate', 'as_of', 'market_value', 'equities', 'bonds', 'cash', 'alternatives', 'net_flows', 'mtd_return_pct', 'ytd_return_pct', 'since_inception_pct'] }],
};

const saacDecision = {
  name: 'saac_decision',
  label: 'SAAC Decision',
  plural_label: 'SAAC Decisions',
  icon: 'Gavel',
  description: 'Strategic Asset Allocation Committee decisions and their impact on model portfolios (WLT-FR-06).',
  config: { title_field: 'title' },
  fields: [
    F('title', 'Decision', 'text', { required: true, config: { show_in_list: true } }),
    F('meeting_date', 'Meeting date', 'date', { required: true, config: { show_in_list: true } }),
    SEL('affected_models', 'Model portfolios affected', o([['A', 'A'], ['B', 'B'], ['C', 'C'], ['D', 'D'], ['E', 'E'], ['all', 'All']]), LIST),
    F('rationale', 'Rationale', 'textarea', { required: true }),
    F('allocation_change', 'Allocation change', 'textarea'),
    F('client_communication_sent', 'Client communication sent', 'checkbox', LIST),
  ],
  forms: [{ name: 'saac_decision_create', label: 'SAAC decision', fields: ['title', 'meeting_date', 'affected_models', 'client_communication_sent', { field: 'rationale', span: 2 }, { field: 'allocation_change', span: 2 }] }],
};

// ── Funds ────────────────────────────────────────────────────────────────────

const fund = {
  name: 'fund',
  label: 'Fund',
  plural_label: 'Funds',
  icon: 'Landmark',
  description: 'Genesis Global Funds fund master (FND-FR-01).',
  config: { title_field: 'name' },
  fields: [
    F('code', 'Code', 'text', { required: true, unique: true, config: { show_in_list: true } }),
    F('name', 'Fund', 'text', { required: true, config: { show_in_list: true } }),
    SEL('asset_class', 'Asset class', o([['money_market', 'Money market'], ['fixed_income', 'Fixed income'], ['equity', 'Equity'], ['multi_asset', 'Multi-asset'], ['private_equity', 'Private equity'], ['fixed_maturity', 'Fixed maturity bond']]), LIST),
    SEL('horizon', 'Investment horizon', o([['short', 'Short term'], ['medium', 'Medium term'], ['long', 'Long term'], ['alternative', 'Alternative']]), LIST),
    F('isin', 'ISIN'),
    SEL('base_currency', 'Base currency', CURRENCIES),
    F('benchmark', 'Benchmark'),
    F('objective', 'Objective', 'textarea'),
    F('structure', 'Structure & holdings', 'textarea'),
    F('distribution', 'Distributions'),
    F('redemption', 'Dealing & redemption'),
    F('target_investors', 'Target investors'),
    F('launch_date', 'Launch date', 'date'),
    F('maturity_date', 'Maturity date', 'date'),
    F('prospectus_url', 'Prospectus', 'url'),
    F('product_page', 'Product page', 'url'),
    FX('share_classes', 'Share classes', "COUNT_RELATED('fund_share_class', 'fund')", LIST),
    FX('aum_mur', 'Fund AUM held by clients (MUR)', "SUM_RELATED('fund_holding', 'fund', 'value_mur')", { format: 'currency', list: true }),
    FX('investors', 'Investors', "COUNT_RELATED('fund_holding', 'fund')"),
  ],
  forms: [{ name: 'fund_create', label: 'Fund', fields: ['code', 'name', 'isin', 'asset_class', 'horizon', 'base_currency', 'benchmark', 'launch_date', 'maturity_date', 'distribution', 'redemption', 'target_investors', { field: 'objective', span: 2 }, { field: 'structure', span: 2 }, 'prospectus_url', 'product_page'] }],
};

const fundShareClass = {
  name: 'fund_share_class',
  label: 'Share Class',
  plural_label: 'Fund Share Classes',
  icon: 'Layers',
  description: 'Class, currency, ISIN, risk rating, minimum, fees, dealing and cut-off; latest NAV from the TA (FND-FR-01, FND-FR-03).',
  config: { title_field: 'name' },
  fields: [
    F('class_code', 'Class code', 'text', { required: true, unique: true, config: { show_in_list: true } }),
    LK('fund', 'Fund', 'fund', { required: true, config: { show_in_list: true } }),
    F('class_name', 'Class', 'text', { required: true }),
    SEL('currency_code', 'Currency', CURRENCIES, { required: true, config: { show_in_list: true } }),
    F('isin', 'ISIN / internal code'),
    F('risk_rating', 'Risk rating (1–5)', 'integer', { validations: [{ type: 'min', value: 1, message: '1–5' }, { type: 'max', value: 5, message: '1–5' }], config: { show_in_list: true } }),
    F('min_investment', 'Minimum investment', 'currency'),
    F('additional_investment', 'Additional investment (minimum)', 'currency'),
    F('entry_fee_pct', 'Entry fee %', 'percent'),
    F('exit_fee_pct', 'Exit fee %', 'percent'),
    F('management_fee_pct', 'Management fee % p.a.', 'percent'),
    SEL('dealing_frequency', 'Dealing', o([['daily', 'Daily'], ['weekly', 'Weekly'], ['monthly', 'Monthly'], ['quarterly', 'Quarterly'], ['closed', 'Closed-ended']]), { default: 'daily' }),
    F('cut_off_time', 'Cut-off time', 'text', { placeholder: '12:00 Mauritius time' }),
    F('distribution_policy', 'Distributes income', 'checkbox'),
    F('factsheet_url', 'Factsheet', 'url'),
    FX('latest_nav', 'Latest NAV', "LOOKUP('nav_history', 'share_class', id, 'nav', 'nav_date')", { precision: 4, list: true }),
    FX('latest_nav_date', 'NAV date', "LOOKUP('nav_history', 'share_class', id, 'nav_date', 'nav_date')", { type: 'date', format: 'date' }),
    FX('product_code', 'Product code', 'fund.code', { type: 'string' }),
    FX('name', 'Share class', "CONCAT(fund.name, ' — ', class_name, ' (', currency_code, ')')", { type: 'string' }),
  ],
  forms: [{ name: 'fund_share_class_create', label: 'Share class', fields: ['fund', 'class_code', 'class_name', 'currency_code', 'isin', 'risk_rating', 'min_investment', 'additional_investment', 'entry_fee_pct', 'exit_fee_pct', 'management_fee_pct', 'dealing_frequency', 'cut_off_time', 'distribution_policy', 'factsheet_url'] }],
};

const navHistory = {
  name: 'nav_history',
  label: 'NAV',
  plural_label: 'NAV History',
  icon: 'LineChart',
  description: 'Net asset value per share class per dealing date, synced from the transfer agent (FND-FR-03).',
  config: { title_field: 'name' },
  fields: [
    LK('share_class', 'Share class', 'fund_share_class', { required: true, config: { show_in_list: true } }),
    F('nav_date', 'NAV date', 'date', { required: true, config: { show_in_list: true } }),
    F('nav', 'NAV per unit', 'decimal', { required: true, config: { show_in_list: true }, validations: [{ type: 'positive', message: 'A NAV must be above zero' }] }),
    FX('fund', 'Fund', 'share_class.fund.name', { type: 'string' }),
    FX('name', 'NAV', "CONCAT(share_class.class_code, ' @ ', nav_date, ': ', nav)", { type: 'string' }),
  ],
  forms: [{ name: 'nav_history_create', label: 'NAV', fields: ['share_class', 'nav_date', 'nav'] }],
};

const fundHolding = {
  name: 'fund_holding',
  label: 'Fund Holding',
  plural_label: 'Fund Holdings',
  icon: 'Wallet',
  description: 'Units held per investor per share class, valued at the latest NAV (FND-FR-03).',
  config: { title_field: 'name', business_unit_field: 'business_unit' },
  fields: [
    LK('party', 'Investor', 'party', { required: true, config: { show_in_list: true } }),
    LK('share_class', 'Share class', 'fund_share_class', { required: true, config: { show_in_list: true } }),
    F('units', 'Units', 'decimal', { required: true, config: { show_in_list: true } }),
    F('book_cost', 'Book cost', 'currency'),
    F('as_of', 'As of', 'date'),
    F('pledged', 'Pledged to Genesis Life (loan security)', 'checkbox', LIST),
    F('maturity_nba_raised', 'Maturity proposal raised', 'checkbox', { config: { always_disabled: true } }),
    FX('fund', 'Fund', 'share_class.fund', { type: 'number' }),
    FX('nav', 'NAV', 'share_class.latest_nav', { precision: 4 }),
    FX('currency_code', 'Currency', 'share_class.currency_code', { type: 'string' }),
    FX('value', 'Value', 'units * nav', { format: 'currency', precision: 2, list: true }),
    FX('value_mur', 'Value (MUR)', toMur('value', 'currency_code'), { format: 'currency', precision: 2, list: true }),
    FX('unrealised_gain', 'Unrealised gain', 'IF(ISBLANK(book_cost), null, value - book_cost)', { format: 'currency', precision: 2 }),
    FX('product_code', 'Product', 'share_class.fund.code', { type: 'string' }),
    FX('maturity_date', 'Fund maturity', 'share_class.fund.maturity_date', { type: 'date', format: 'date' }),
    FX('business_unit', 'Business unit', "'FND'", { type: 'string' }),
    FX('name', 'Holding', "CONCAT(party.display_name, ' · ', share_class.class_code)", { type: 'string' }),
  ],
  forms: [{ name: 'fund_holding_create', label: 'Holding', fields: ['party', 'share_class', 'units', 'book_cost', 'as_of', 'pledged'] }],
};

const fundCampaign = {
  name: 'fund_campaign',
  label: 'Fund Campaign',
  plural_label: 'Fund Campaigns',
  icon: 'Megaphone',
  description: 'Subscription window, target raise, allocation tracking and maturity plan — e.g. the Fixed Maturity Bond 2029 (FND-FR-04).',
  config: { title_field: 'name', business_unit_field: 'business_unit' },
  fields: [
    F('name', 'Campaign', 'text', { required: true, config: { show_in_list: true } }),
    LK('share_class', 'Share class', 'fund_share_class', { required: true }),
    F('window_opens', 'Subscription opens', 'date', LIST),
    F('window_closes', 'Subscription closes', 'date', LIST),
    F('target_raise', 'Target raise (MUR)', 'currency', LIST),
    FX('raised', 'Subscribed (MUR)', "SUM_RELATED('fund_order', 'fund_campaign', 'amount_mur', 'order_type', 'subscription')", { format: 'currency', list: true }),
    FX('progress_pct', 'Progress %', 'IF(COALESCE(target_raise, 0) > 0, raised / target_raise * 100, null)', { format: 'percent', precision: 1, list: true }),
    FX('investors', 'Investors', "COUNT_RELATED('fund_order', 'fund_campaign')"),
    F('maturity_plan', 'Maturity communication plan', 'textarea'),
    FX('business_unit', 'Business unit', "'FND'", { type: 'string' }),
  ],
  forms: [{ name: 'fund_campaign_create', label: 'Fund campaign', fields: ['name', 'share_class', 'window_opens', 'window_closes', 'target_raise', { field: 'maturity_plan', span: 2 }] }],
  pipeline: {
    name: 'fund_campaign_flow', label: 'Campaign',
    stages: [stage('planned', 'Planned', '#94a3b8'), stage('open', 'Window open', '#10b981'), stage('allocating', 'Allocating', '#6366f1'), stage('closed', 'Closed', '#64748b')],
  },
};

const distributionNotice = {
  name: 'distribution_notice',
  label: 'Distribution Notice',
  plural_label: 'Dividend & Distribution Notices',
  icon: 'Bell',
  description: 'Dividend and distribution notices to unitholders (FND-FR-06).',
  config: { title_field: 'name' },
  fields: [
    LK('share_class', 'Share class', 'fund_share_class', { required: true, config: { show_in_list: true } }),
    F('record_date', 'Record date', 'date', { required: true, config: { show_in_list: true } }),
    F('payment_date', 'Payment date', 'date', LIST),
    F('amount_per_unit', 'Amount per unit', 'decimal', LIST),
    F('notice_text', 'Notice', 'textarea'),
    F('published', 'Published (News & Media)', 'checkbox', LIST),
    FX('unitholders', 'Unitholders to notify', 'share_class.fund.investors'),
    FX('name', 'Notice', "CONCAT(share_class.class_code, ' · ', record_date)", { type: 'string' }),
  ],
  forms: [{ name: 'distribution_notice_create', label: 'Distribution notice', fields: ['share_class', 'record_date', 'payment_date', 'amount_per_unit', 'published', { field: 'notice_text', span: 2 }] }],
};

// ── Securities ───────────────────────────────────────────────────────────────

const clientOrder = {
  name: 'client_order',
  label: 'Client Order',
  plural_label: 'Order Intake Log',
  icon: 'ScrollText',
  description: 'Time-stamped phone / email instructions handed to the OMS, checked against the restricted list (SEC-FR-03, CMP-FR-03).',
  config: { title_field: 'name', business_unit_field: 'business_unit' },
  fields: [
    AUTO('order_ref', 'Order ref.', 'OL-'),
    LK('securities_account', 'Account', 'securities_account', { required: true, config: { show_in_list: true } }),
    F('instrument', 'Instrument', 'text', { required: true, config: { show_in_list: true }, validations: [EXPR("restricted_hit != 'restricted'", 'This issuer is on the restricted list — the order cannot be taken (CMP-FR-03)')] }),
    SEL('market', 'Market', o([['sem', 'SEM'], ['dem', 'DEM'], ['international', 'International']]), { default: 'sem' }),
    SEL('side', 'Side', o([['buy', 'Buy', '#10b981'], ['sell', 'Sell', '#ef4444']]), { required: true, config: { show_in_list: true } }),
    F('quantity', 'Quantity', 'decimal', { required: true, config: { show_in_list: true } }),
    SEL('price_type', 'Price', o([['market', 'At market'], ['limit', 'Limit']]), { default: 'limit' }),
    F('limit_price', 'Limit price', 'decimal'),
    SEL('channel', 'Received by', o([['phone', 'Phone'], ['email', 'Email'], ['walk_in', 'In person']]), { default: 'phone' }),
    F('received_at', 'Received at', 'text', { required: true, placeholder: 'YYYY-MM-DD HH:MM' }),
    F('recording_ref', 'Voice recording reference'),
    F('oms_reference', 'OMS reference', 'text', LIST),
    F('executed_price', 'Executed price', 'decimal'),
    FX('consideration', 'Consideration', 'quantity * COALESCE(executed_price, limit_price)', { format: 'currency', precision: 2, list: true }),
    FX('brokerage', 'Brokerage (est. 1%)', 'consideration * 0.01', { format: 'currency', precision: 2 }),
    FX('restricted_hit', 'Restricted list', "COALESCE(LOOKUP('restricted_list_entry', 'issuer', instrument, 'list_type'), 'clear')", { type: 'string' }),
    FX('party', 'Client', 'securities_account.party', { type: 'number' }),
    FX('business_unit', 'Business unit', "'SEC'", { type: 'string' }),
    FX('name', 'Order', "CONCAT(side, ' ', quantity, ' ', instrument)", { type: 'string' }),
  ],
  dependencies: [{ source: 'price_type', target: 'limit_price', condition: 'equals', value: 'limit', action: 'show' }],
  forms: [{ name: 'client_order_create', label: 'Log an instruction', fields: ['securities_account', 'instrument', 'market', 'side', 'quantity', 'price_type', 'limit_price', 'channel', 'received_at', 'recording_ref', 'oms_reference', 'executed_price'] }],
  pipeline: {
    name: 'client_order_flow', label: 'Order',
    stages: [
      stage('received', 'Received', '#6366f1'), stage('sent_to_oms', 'Sent to OMS', '#8b5cf6'),
      stage('executed', 'Executed', '#10b981', { required_fields: ['oms_reference', 'executed_price'] }),
      stage('cancelled', 'Cancelled', '#64748b'), stage('rejected', 'Rejected', '#ef4444'),
    ],
  },
};

const ioiEntry = {
  name: 'ioi_entry',
  label: 'Indication of Interest',
  plural_label: 'IPO / Bond Book',
  icon: 'HandCoins',
  description: 'Investor indications of interest for underwritten issues (SEC-FR-04). Shared with advisory bookbuilding through the investor target, subject to barrier rules.',
  config: { title_field: 'name', business_unit_field: 'business_unit' },
  fields: [
    F('issue_name', 'Issue', 'text', { required: true, config: { show_in_list: true } }),
    LK('party', 'Investor', 'party', { required: true, config: { show_in_list: true } }),
    SEL('instrument', 'Instrument', o([['equity', 'Shares (IPO)'], ['bond', 'Bond'], ['notes', 'Notes']]), LIST),
    F('indicated_amount', 'Indicated (MUR)', 'currency', LIST),
    F('allocated_amount', 'Allocated (MUR)', 'currency', LIST),
    F('indicated_on', 'Indicated on', 'date'),
    FX('business_unit', 'Business unit', "'SEC'", { type: 'string' }),
    FX('name', 'IOI', "CONCAT(issue_name, ' · ', party.display_name)", { type: 'string' }),
  ],
  forms: [{ name: 'ioi_entry_create', label: 'Indication of interest', fields: ['issue_name', 'party', 'instrument', 'indicated_amount', 'allocated_amount', 'indicated_on'] }],
};

const researchPublication = {
  name: 'research_publication',
  label: 'Research & Market Note',
  plural_label: 'Research & Market Statistics',
  icon: 'Newspaper',
  description: 'Weekly market highlights, market statistics and research, distributed to opted-in subscribers (SEC-FR-05, MKT-FR-04).',
  config: { title_field: 'title' },
  fields: [
    F('title', 'Title', 'text', { required: true, config: { show_in_list: true } }),
    SEL('publication_type', 'Type', o([['weekly_highlights', 'Weekly market highlights'], ['market_statistics', 'Market statistics'], ['research', 'Research note'], ['notice', 'Notice / press']]), { required: true, config: { show_in_list: true } }),
    F('published_on', 'Published on', 'date', { required: true, config: { show_in_list: true } }),
    F('summary', 'Summary', 'textarea'),
    F('sem_index', 'SEMDEX close', 'decimal'),
    F('sem_change_pct', 'SEMDEX change %', 'decimal'),
    F('sent', 'Distributed', 'checkbox', LIST),
    F('opens', 'Opens', 'integer'),
  ],
  forms: [{ name: 'research_publication_create', label: 'Publication', fields: ['title', 'publication_type', 'published_on', 'sem_index', 'sem_change_pct', 'sent', 'opens', { field: 'summary', span: 2 }] }],
};

module.exports = {
  mandateReview, aumSnapshot, saacDecision,
  fund, fundShareClass, navHistory, fundHolding, fundCampaign, distributionNotice,
  clientOrder, ioiEntry, researchPublication,
  toMur,
};
