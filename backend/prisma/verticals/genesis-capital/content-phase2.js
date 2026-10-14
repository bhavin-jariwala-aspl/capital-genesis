'use strict';

/**
 * Genesis Capital — content for the full PRD scope: bilingual email templates,
 * the remaining merge templates (DOC-FR-03), document categories and
 * checklists, qualification / onboarding wizards, the management dashboards
 * RPT-01…RPT-12 plus the RM workbench, and the public web forms (I-01).
 *
 * Dashboards use the object-analytics data source, so every number respects
 * the viewer's access: owner scope, business unit and information barriers
 * (RPT-FR-01) — an advisory widget shows nothing to the public side.
 */

const base = require('./content');

// ── Email templates (EN / FR) ────────────────────────────────────────────────
const wrap = (body) => `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.55;color:#1f2937;max-width:620px">
${body}
<p style="color:#6b7280;font-size:12px;margin-top:24px">Genesis Capital — Think. Multiply.<br>
Genesis Centre, 10 Intendance Street, Port Louis, Mauritius · info@genesis-capital.demo</p></div>`;
const pair = (name, category, object, en, fr) => [
  { name, category, object, language: 'en', subject: en.subject, body_html: wrap(en.html), body_text: en.text },
  { name: `${name}_fr`, category, object, language: 'fr', subject: fr.subject, body_html: wrap(fr.html), body_text: fr.text },
];

const emailTemplates = [
  ...pair('loan_status_update', 'service', 'loan_application',
    { subject: 'Update on your loan application {{application_no}}', html: '<p>Dear {{party_name}},</p><p>Your application <strong>{{application_no}}</strong> has moved to <strong>{{stage}}</strong>. Your loans executive will contact you if anything else is needed.</p>', text: 'Application {{application_no}} is now at {{stage}}.' },
    { subject: 'Point sur votre demande de prêt {{application_no}}', html: '<p>Bonjour {{party_name}},</p><p>Votre demande <strong>{{application_no}}</strong> est passée à l\'étape <strong>{{stage}}</strong>. Votre conseiller vous contactera si d\'autres éléments sont nécessaires.</p>', text: 'La demande {{application_no}} est à l\'étape {{stage}}.' }),
  ...pair('margin_call', 'compliance', 'margin_call',
    { subject: 'Margin call on your investment-backed loan', html: '<p>Dear client,</p><p>The value of the investments pledged for your loan has fallen and the loan-to-value is now <strong>{{ltv_at_call}}%</strong>. Please restore cover by <strong>{{cure_by}}</strong> by adding collateral or making a partial repayment (shortfall MUR {{shortfall}}). Your relationship manager will call you.</p>', text: 'Margin call: LTV {{ltv_at_call}}%. Restore cover by {{cure_by}} (shortfall MUR {{shortfall}}).' },
    { subject: 'Appel de marge sur votre prêt adossé à des placements', html: '<p>Madame, Monsieur,</p><p>La valeur des placements nantis a baissé et le ratio prêt/valeur atteint <strong>{{ltv_at_call}} %</strong>. Merci de rétablir la couverture avant le <strong>{{cure_by}}</strong> par un complément de garantie ou un remboursement partiel (insuffisance : MUR {{shortfall}}).</p>', text: 'Appel de marge : ratio {{ltv_at_call}} %. Couverture à rétablir avant le {{cure_by}}.' }),
  ...pair('plr_change', 'service', 'loan_account',
    { subject: 'Change in the Genesis Prime Lending Rate', html: '<p>Dear client,</p><p>The Genesis PLR has changed. From the effective date the rate on your loan <strong>{{lms_account_no}}</strong> is <strong>{{current_rate}}%</strong> and your monthly instalment <strong>MUR {{instalment}}</strong>.</p>', text: 'Genesis PLR change: loan {{lms_account_no}} now {{current_rate}}%, instalment MUR {{instalment}}.' },
    { subject: 'Modification du taux préférentiel Genesis (PLR)', html: '<p>Madame, Monsieur,</p><p>Le PLR Genesis a été modifié. À compter de la date d\'effet, le taux de votre prêt <strong>{{lms_account_no}}</strong> est de <strong>{{current_rate}} %</strong> et votre mensualité de <strong>MUR {{instalment}}</strong>.</p>', text: 'PLR Genesis modifié : prêt {{lms_account_no}} à {{current_rate}} %, mensualité MUR {{instalment}}.' }),
  ...pair('fund_order_confirmation', 'service', 'fund_order',
    { subject: 'Your fund order {{order_no}} is confirmed', html: '<p>Dear investor,</p><p>Your <strong>{{order_type}}</strong> in <strong>{{fund_code}}</strong> for {{currency_code}} {{amount}} has been accepted by the transfer agent (reference {{ta_reference}}). Units are allotted at the NAV of the dealing date.</p>', text: 'Fund order {{order_no}} confirmed — TA reference {{ta_reference}}.' },
    { subject: 'Votre ordre {{order_no}} est confirmé', html: '<p>Madame, Monsieur,</p><p>Votre <strong>{{order_type}}</strong> sur <strong>{{fund_code}}</strong> pour {{currency_code}} {{amount}} a été accepté par l\'agent de transfert (référence {{ta_reference}}).</p>', text: 'Ordre {{order_no}} confirmé — référence {{ta_reference}}.' }),
  ...pair('fx_rate_alert', 'sales', 'fx_rate_alert',
    { subject: 'Your {{currency_code}} rate alert has been reached', html: '<p>Dear client,</p><p>The {{currency_code}}/MUR rate is now <strong>{{current_rate}}</strong>, reaching your target of {{target_rate}}. Call our Forexpert on 207 3581 to deal.</p>', text: '{{currency_code}}/MUR is {{current_rate}} — your target {{target_rate}} is reached.' },
    { subject: 'Votre alerte de change {{currency_code}} est atteinte', html: '<p>Madame, Monsieur,</p><p>Le cours {{currency_code}}/MUR est de <strong>{{current_rate}}</strong> et atteint votre objectif de {{target_rate}}. Appelez notre Forexpert au 207 3581.</p>', text: 'Cours {{currency_code}}/MUR : {{current_rate}} — objectif {{target_rate}} atteint.' }),
  ...pair('fx_forward_maturity', 'service', 'fx_deal',
    { subject: 'Your forward contract {{deal_no}} matures soon', html: '<p>Dear client,</p><p>Forward <strong>{{deal_no}}</strong> ({{currency_code}} {{amount}} at {{deal_rate}}) settles on <strong>{{value_date}}</strong>. Please ensure funds are in place, or ask us about rolling it over.</p>', text: 'Forward {{deal_no}} settles on {{value_date}}.' },
    { subject: 'Votre contrat à terme {{deal_no}} arrive à échéance', html: '<p>Madame, Monsieur,</p><p>Le contrat <strong>{{deal_no}}</strong> ({{currency_code}} {{amount}} à {{deal_rate}}) sera réglé le <strong>{{value_date}}</strong>. Merci de prévoir les fonds ou de nous consulter pour une prorogation.</p>', text: 'Contrat {{deal_no}} réglé le {{value_date}}.' }),
  ...pair('csat_survey', 'service', 'service_request',
    { subject: 'How did we do? — {{request_no}}', html: '<p>Dear client,</p><p>Your request <strong>{{request_no}}</strong> has been resolved. On a scale of 1 to 5, how satisfied are you, and how likely are you to recommend Genesis Capital (0–10)? Simply reply to this email.</p>', text: 'Request {{request_no}} resolved. Rate us 1–5 and tell us how likely you are to recommend us (0–10).' },
    { subject: 'Votre avis compte — {{request_no}}', html: '<p>Madame, Monsieur,</p><p>Votre demande <strong>{{request_no}}</strong> est traitée. Sur une échelle de 1 à 5, êtes-vous satisfait(e), et recommanderiez-vous Genesis Capital (0–10) ? Répondez simplement à ce courriel.</p>', text: 'Demande {{request_no}} traitée. Notez-nous de 1 à 5 et de 0 à 10.' }),
  // Portal sign-in code (generic: no object; variables come from the portal).
  { name: 'portal_login_code', category: 'security', language: 'en', subject: 'Your Genesis portal sign-in code: {{code}}',
    body_html: wrap('<p>Your one-time sign-in code for {{workspace}} is:</p><p style="font-size:24px;font-weight:bold;letter-spacing:4px">{{code}}</p><p>It expires in 10 minutes. If you did not ask for it, ignore this email.</p>'),
    body_text: 'Your sign-in code is {{code}} (valid 10 minutes).' },
  { name: 'portal_login_code_fr', category: 'security', language: 'fr', subject: 'Votre code de connexion Genesis : {{code}}',
    body_html: wrap('<p>Votre code de connexion à usage unique pour {{workspace}} est :</p><p style="font-size:24px;font-weight:bold;letter-spacing:4px">{{code}}</p><p>Il expire dans 10 minutes.</p>'),
    body_text: 'Votre code de connexion est {{code}} (valable 10 minutes).' },
  ...pair('callback_ack', 'sales', 'web_event',
    { subject: 'We will call you back', html: '<p>Dear {{first_name}},</p><p>Thank you — a specialist will call you on {{mobile}} ({{preferred_time}}).</p>', text: 'A specialist will call you back on {{mobile}}.' },
    { subject: 'Nous vous rappelons', html: '<p>Bonjour {{first_name}},</p><p>Merci — un spécialiste vous appellera au {{mobile}} ({{preferred_time}}).</p>', text: 'Un spécialiste vous rappellera au {{mobile}}.' }),
  ...pair('newsletter_welcome', 'marketing', 'web_event',
    { subject: 'Welcome to Genesis market insights', html: '<p>Dear {{first_name}},</p><p>You are now subscribed to our {{topic}}. You can unsubscribe at any time from any issue.</p>', text: 'You are subscribed to {{topic}}.' },
    { subject: 'Bienvenue — analyses de marché Genesis', html: '<p>Bonjour {{first_name}},</p><p>Vous êtes abonné(e) à : {{topic}}. Désinscription possible à tout moment.</p>', text: 'Abonnement confirmé : {{topic}}.' }),
];

// ── Document categories & checklists ─────────────────────────────────────────
const SEVEN_YEARS = 7 * 365;
const OFFICE = ['application/pdf', 'image/jpeg', 'image/png', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'];
const documentCategories = [
  { code: 'tax_self_cert', label: 'FATCA / CRS self-certification', color: 'red', retention_days: SEVEN_YEARS, allowed_mime: OFFICE, max_file_mb: 10, review_required: true },
  { code: 'credit_bureau', label: 'MCIB credit report', color: 'orange', retention_days: SEVEN_YEARS, allowed_mime: OFFICE, max_file_mb: 10, description: 'Pulled with the applicant\'s consent (LOAN-FR-06).' },
  { code: 'covenant_certificates', label: 'Compliance certificates', color: 'lime', retention_days: SEVEN_YEARS, allowed_mime: OFFICE, max_file_mb: 15 },
  { code: 'client_reports', label: 'Monthly client reports', color: 'indigo', retention_days: SEVEN_YEARS, allowed_mime: OFFICE, max_file_mb: 25, description: 'PMS-generated reports distributed by secure link (WLT-FR-05).' },
  { code: 'fund_documents', label: 'Prospectus & factsheets', color: 'violet', retention_days: SEVEN_YEARS, allowed_mime: OFFICE, max_file_mb: 25 },
  { code: 'nda', label: 'Non-disclosure agreements', color: 'pink', retention_days: SEVEN_YEARS, allowed_mime: OFFICE, max_file_mb: 10, description: 'Attach to the investor target or mandate — barrier-protected.' },
  { code: 'insider_lists', label: 'Insider list exports', color: 'rose', retention_days: SEVEN_YEARS, allowed_mime: OFFICE, max_file_mb: 10 },
  { code: 'dpa_requests', label: 'Data subject request evidence', color: 'slate', retention_days: SEVEN_YEARS, allowed_mime: OFFICE, max_file_mb: 10 },
  // Behind the MLRO_STR wall with its record; never shown on the portal (no tipping-off).
  { code: 'str_documents', label: 'Suspicious transaction reports', color: 'red', retention_days: SEVEN_YEARS, allowed_mime: OFFICE, max_file_mb: 10 },
];
const item = (category_code, label, required = true) => ({ category_code, label, required });
const documentChecklists = [
  { entity_type: 'loan_application', label: 'Investment-backed loan', items: [item('kyc_id', 'Applicant ID'), item('fund_forms', 'Pledge instruction to the transfer agent / custodian'), item('bank_statements', '3 months of bank statements')] },
  { entity_type: 'credit_facility', label: 'Commercial facility', items: [item('corporate_docs', 'Certificate of incorporation & constitution'), item('financial_statements', '3 years of audited accounts'), item('financial_statements', 'Management accounts (YTD)'), item('corporate_docs', 'Board resolution to borrow'), item('valuation', 'Valuation of security'), item('insurance', 'Insurance of security assigned')] },
  { entity_type: 'securities_account', label: 'Trading account opening', items: [item('kyc_id', 'ID'), item('proof_of_address', 'Proof of address'), item('account_agreements', 'Signed account agreement'), item('tax_self_cert', 'FATCA / CRS self-certification')] },
  { entity_type: 'fund_order', label: 'Fund subscription', items: [item('fund_forms', 'Signed subscription form'), item('bank_statements', 'Proof of payment'), item('fund_documents', 'Acknowledged prospectus / KIID', false)] },
  { entity_type: 'wealth_mandate', label: 'Discretionary mandate', items: [item('mandates_ips', 'Signed mandate agreement'), item('mandates_ips', 'Investment Policy Statement'), item('tax_self_cert', 'FATCA / CRS self-certification')] },
  { entity_type: 'advisory_mandate', label: 'Advisory engagement', items: [item('engagement_letters', 'Signed engagement letter'), item('nda', 'NDA with the client'), item('deal_documents', 'Conflict-check clearance')] },
  { entity_type: 'introducer', label: 'Introducer onboarding', items: [item('kyc_id', 'ID / incorporation documents'), item('account_agreements', 'Signed introducer agreement')] },
];

// ── Merge templates (DOC-FR-03) ──────────────────────────────────────────────
const letter = (entity, licence, body) => `<div style="font-family:Georgia,serif;font-size:14px;line-height:1.6;max-width:680px">
<p style="text-align:right">Port Louis, {{today}}</p>${body}
<p>Yours faithfully,<br><br>${entity}<br><small>${licence}</small></p></div>`;
const documentTemplates = [
  { name: 'enquiry_acknowledgement_letter', entity_type: 'enquiry', output_category: 'correspondence', description: 'Written acknowledgement of an enquiry.',
    body: letter('Genesis Capital', 'Think. Multiply.', '<h2>Your enquiry {{enquiry_no}}</h2><p>Dear {{display_name}},</p><p>Thank you for your interest in {{product_code}}. A specialist from the right Genesis entity will contact you shortly.</p>') },
  { name: 'loan_document_request_letter', entity_type: 'loan_application', output_category: 'correspondence', description: 'Document request with the product checklist.',
    body: letter('Genesis Life Ltd — Loans business line', 'Regulated by the Financial Services Commission (FSC IS10000013)', '<h2>Documents required — {{application_no}}</h2><p>Dear {{party_name}},</p><p>Please provide: identity document; proof of address (less than three months old); last three payslips or audited accounts; six months of bank statements; and, for property loans, the title deed or sale agreement and a valuation report.</p>') },
  { name: 'margin_call_notice', entity_type: 'margin_call', output_category: 'correspondence', description: 'Margin call notice for an investment-backed loan.',
    body: letter('Genesis Life Ltd — Loans business line', 'Regulated by the Financial Services Commission (FSC IS10000013)', '<h2>Margin call {{call_no}}</h2><p>The loan-to-value on your investment-backed loan has reached <strong>{{ltv_at_call}}%</strong>. Please restore cover by <strong>{{cure_by}}</strong> by pledging additional investments or making a partial repayment (shortfall MUR {{shortfall}}). If cover is not restored, the pledged assets may be realised under the pledge agreement.</p>') },
  { name: 'commercial_term_sheet', entity_type: 'credit_facility', output_category: 'offer_letters', description: 'Indicative term sheet for a commercial facility.',
    body: letter('Genesis Life Ltd — Loans business line', 'Regulated by the Financial Services Commission (FSC IS10000013)', `<h2>Term sheet — {{facility_no}}</h2><table cellpadding="6" style="border-collapse:collapse">
<tr><td>Borrower</td><td>{{name}}</td></tr><tr><td>Facility</td><td>{{facility_type}} {{tranche}}</td></tr><tr><td>Amount</td><td>{{currency_code}} {{amount}}</td></tr>
<tr><td>Tenor</td><td>{{tenor_months}} months</td></tr><tr><td>Pricing</td><td>Genesis PLR + {{margin}}% ({{interest_rate}}%)</td></tr>
<tr><td>Fees</td><td>Arrangement {{arrangement_fee_pct}}%; commitment {{commitment_fee_pct}}%</td></tr><tr><td>Security</td><td>{{security_package}}</td></tr>
<tr><td>Covenants</td><td>Minimum DSCR, maximum net debt / EBITDA, audited accounts within 120 days</td></tr></table>`) },
  { name: 'mandate_agreement', entity_type: 'wealth_mandate', output_category: 'mandates_ips', description: 'Discretionary portfolio management agreement.',
    body: letter('Genesis Wealth Managers Ltd', 'FSC licences IX09000018 · CM12000023 · DF09000007', '<h2>Portfolio management agreement — {{mandate_no}}</h2><p>Client: <strong>{{name}}</strong>. Mandate: {{mandate_type}}; model portfolio {{model_portfolio}}; base currency {{base_currency}}; benchmark {{benchmark}}; custodian {{custodian}}.</p><p>Fees: management {{management_fee_pct}}% p.a. (minimum {{minimum_fee}}); performance fee {{performance_fee_pct}}%. Restrictions: {{esg_restrictions}}.</p><p>Reviews: {{review_frequency}}; monthly reports by secure link.</p>') },
  { name: 'investment_policy_statement', entity_type: 'wealth_mandate', output_category: 'mandates_ips', description: 'Investment Policy Statement (IPS).',
    body: letter('Genesis Wealth Managers Ltd', 'FSC licences IX09000018 · CM12000023 · DF09000007', '<h2>Investment Policy Statement — {{mandate_no}}</h2><p>Objective and risk profile follow model portfolio <strong>{{model_portfolio}}</strong>. Strategic allocation as per the model; rebalancing within ±5% bands. Benchmark: {{benchmark}}. Constraints: {{esg_restrictions}}. Liquidity and reporting as agreed at the review cycle ({{review_frequency}}).</p>') },
  { name: 'nda', entity_type: 'investor_target', output_category: 'nda', description: 'Mutual non-disclosure agreement for a raise (referenced by code name).',
    body: letter('Genesis Corporate Advisors Ltd', 'FSC IZ19000019', '<h2>Non-disclosure agreement — {{name}}</h2><p>The recipient will keep confidential all information about the transaction, use it only to evaluate the opportunity, and acknowledges it may constitute inside information under the Securities Act 2005.</p>') },
  { name: 'security_discharge', entity_type: 'collateral', output_category: 'security_docs', description: 'Release of security on loan closure (COLL-FR-06).',
    body: letter('Genesis Life Ltd — Loans business line', 'Regulated by the Financial Services Commission (FSC IS10000013)', '<h2>Release of security — {{collateral_no}}</h2><p>We confirm that the security over <strong>{{description}}</strong> (title {{title_reference}}) is released following full repayment.</p>') },
  { name: 'kyc_refresh_request_letter', entity_type: 'kyc_case', output_category: 'correspondence', description: 'Periodic KYC refresh request.',
    body: letter('Genesis Capital', 'Think. Multiply.', '<h2>Updating your records</h2><p>Dear {{party_name}},</p><p>As part of our periodic review we ask you to confirm your details and provide an up-to-date identity document and proof of address.</p>') },
];

// ── Wizards (onboarding & qualification) ─────────────────────────────────────
const wizards = [
  { object: 'credit_facility', name: 'genesis_commercial_application', label: 'Commercial facility request', submit_label: 'Submit to credit', success_message: 'Facility request created — complete the credit memo next.',
    steps: [
      { name: 'borrower', label: 'Borrower & need', fields: ['borrower', 'borrower_group', 'facility_type', { field: 'purpose', span: 2 }] },
      { name: 'terms', label: 'Amount & terms', fields: ['amount', 'currency_code', 'tenor_months', 'margin', 'arrangement_fee_pct', 'commitment_fee_pct', 'expiry_date'] },
    ] },
  { object: 'fund_order', name: 'genesis_fund_subscription', label: 'Fund subscription', submit_label: 'Capture order', success_message: 'Order captured — an operations checker will authorise it.',
    steps: [
      { name: 'investor', label: 'Investor & fund', fields: ['party', 'share_class', 'order_type', 'fund_campaign'] },
      { name: 'amount', label: 'Amount & payment', fields: ['amount', 'units', 'cut_off_date', 'payment_proof_received'] },
      { name: 'suitability', label: 'Suitability', fields: [{ field: 'suitability_override', span: 2 }, 'client_acknowledged'] },
    ] },
  { object: 'securities_account', name: 'genesis_trading_account', label: 'Trading account opening', submit_label: 'Open account', success_message: 'Account request created.',
    steps: [
      { name: 'client', label: 'Client & account', fields: ['party', 'account_type', 'markets'] },
      { name: 'settlement', label: 'Custody & settlement', fields: ['custodian', 'settlement_bank', { field: 'authorised_instructors', span: 2 }] },
      { name: 'controls', label: 'Controls', fields: ['trading_limit', 'appropriateness_ok', 'agreement_signed'] },
    ] },
  { object: 'fx_profile', name: 'genesis_fx_onboarding', label: 'Forex client onboarding', submit_label: 'Create profile', success_message: 'FX profile created.',
    steps: [
      { name: 'need', label: 'FX need', fields: ['party', 'purpose', 'monthly_volume', 'currency_pairs'] },
      { name: 'limits', label: 'Products & limits', fields: ['approved_products', 'settlement_limit', { field: 'settlement_accounts', span: 2 }] },
    ] },
  { object: 'introducer', name: 'genesis_introducer_onboarding', label: 'Introducer onboarding', submit_label: 'Create introducer', success_message: 'Introducer created — complete KYC to activate.',
    steps: [
      { name: 'who', label: 'Introducer', fields: ['party', 'introducer_type', 'portal_email'] },
      { name: 'agreement', label: 'Agreement & commission', fields: ['agreement_signed_on', 'agreement_expires_on', 'allowed_products', 'commission_pct', 'clawback_months', 'protection_days'] },
    ] },
  { object: 'wealth_mandate', name: 'genesis_mandate_onboarding', label: 'Wealth mandate', submit_label: 'Create mandate', success_message: 'Mandate created — generate the agreement and IPS from the Docs tab.',
    steps: [
      { name: 'client', label: 'Client & profile', fields: ['party', 'risk_profile', 'mandate_type'] },
      { name: 'terms', label: 'Terms', fields: ['base_currency', 'benchmark', 'custodian', 'portfolio_manager', 'review_frequency', 'management_fee_pct', 'performance_fee_pct', 'minimum_fee', { field: 'esg_restrictions', span: 2 }] },
    ] },
];

// ── Dashboards (RPT-01…RPT-12, RM workbench) ─────────────────────────────────
const W = (type, title, size, data, extra = {}) => ({ type, title, size, data, ...extra });
const CUR = { appearance: { format: 'currency_compact' } };
const OPEN_LOAN = [{ field: 'stage', op: 'nin', value: 'disbursed,declined,withdrawn,lapsed' }];

const dashboards = [
  {
    name: 'genesis_group_executive', label: 'Group Executive', is_default: true,
    description: 'New business, assets, loan book, revenue and cross-sell across all six entities (RPT-01).',
    widgets: [
      W('metric', 'Total relationship value (MUR)', 'kpi', { object: 'party', metric: 'sum', field: 'total_relationship_value' }, { config: { format: 'currency_compact' } }),
      W('metric', 'Wealth AUM (MUR)', 'kpi', { object: 'wealth_mandate', metric: 'sum', field: 'aum_mur' }, { config: { format: 'currency_compact' } }),
      W('metric', 'Fund holdings (MUR)', 'kpi', { object: 'fund_holding', metric: 'sum', field: 'value_mur' }, { config: { format: 'currency_compact' } }),
      W('metric', 'Loan book (MUR)', 'kpi', { object: 'loan_account', metric: 'sum', field: 'outstanding_mur' }, { config: { format: 'currency_compact' } }),
      W('chart', 'Revenue by entity (MUR, 12 months)', 'half', { object: 'revenue_entry', metric: 'sum', field: 'amount_mur', group_by: 'business_unit' }, { chart: 'bar', ...CUR }),
      W('chart', 'Revenue by month (MUR)', 'half', { object: 'revenue_entry', metric: 'sum', field: 'amount_mur', group_by: 'period' }, { chart: 'area', ...CUR }),
      W('chart', 'Loans disbursed by month (MUR)', 'half', { object: 'loan_application', metric: 'sum', field: 'loan_amount_mur', group_by: 'created_month', filters: [{ field: 'outcome', op: 'eq', value: 'disbursed' }] }, { chart: 'bar', ...CUR }),
      W('chart', 'FX volume by month (MUR)', 'half', { object: 'fx_deal', metric: 'sum', field: 'amount_mur', group_by: 'created_month' }, { chart: 'line', ...CUR }),
      W('chart', 'Relationships by entity', 'half', { object: 'client_relationship', group_by: 'business_unit' }, { chart: 'bar' }),
      W('chart', 'Clients by segment', 'half', { object: 'party', group_by: 'segment' }, { chart: 'donut' }),
      W('chart', 'Products held per client', 'half', { object: 'party', group_by: 'products_held' }, { chart: 'bar' }),
      W('chart', 'Cross-sell opportunities by entity (MUR)', 'half', { object: 'fs_opportunity', metric: 'sum', field: 'weighted_mur', group_by: 'business_unit', filters: [{ field: 'stage', op: 'nin', value: 'won,lost' }] }, { chart: 'bar', ...CUR }),
    ],
  },
  {
    name: 'genesis_lead_funnel', label: 'Lead Funnel',
    description: 'Enquiries by channel, product and entity; conversion and calculator sessions (RPT-02).',
    widgets: [
      W('metric', 'Open enquiries', 'kpi', { object: 'enquiry', filters: [{ field: 'stage', op: 'in', value: 'new,contacted,qualified' }] }),
      W('metric', 'Converted', 'kpi', { object: 'enquiry', filters: [{ field: 'stage', op: 'eq', value: 'converted' }] }),
      W('metric', 'Grade A leads open', 'kpi', { object: 'enquiry', filters: [{ field: 'grade', op: 'eq', value: 'A' }, { field: 'stage', op: 'in', value: 'new,contacted,qualified' }] }),
      W('metric', 'Calculator sessions', 'kpi', { object: 'web_event', filters: [{ field: 'event_type', op: 'eq', value: 'calculator' }] }),
      W('chart', 'Enquiry funnel', 'half', { object: 'enquiry', group_by: 'stage' }, { chart: 'funnel' }),
      W('chart', 'Enquiries by entity', 'half', { object: 'enquiry', group_by: 'business_unit' }, { chart: 'bar' }),
      W('chart', 'Enquiries by channel', 'half', { object: 'enquiry', group_by: 'channel' }, { chart: 'donut' }),
      W('chart', 'Enquiries per month', 'half', { object: 'enquiry', group_by: 'created_month' }, { chart: 'line' }),
      W('chart', 'Enquiries by product', 'full', { object: 'enquiry', group_by: 'product_code' }, { chart: 'bar' }),
      W('chart', 'Disqualification reasons', 'half', { object: 'enquiry', group_by: 'disqualify_reason', filters: [{ field: 'stage', op: 'eq', value: 'disqualified' }] }, { chart: 'pie' }),
      W('chart', 'Lead grades (open)', 'half', { object: 'enquiry', group_by: 'grade', filters: [{ field: 'stage', op: 'in', value: 'new,contacted,qualified' }] }, { chart: 'bar' }),
    ],
  },
  {
    name: 'genesis_lending', label: 'Lending Pipeline',
    description: 'Origination pipeline, approvals, decline reasons and PLR exposure (RPT-03).',
    widgets: [
      W('metric', 'Applications in progress', 'kpi', { object: 'loan_application', filters: OPEN_LOAN }),
      W('metric', 'Pipeline value (MUR)', 'kpi', { object: 'loan_application', metric: 'sum', field: 'loan_amount_mur', filters: OPEN_LOAN }, { config: { format: 'currency_compact' } }),
      W('metric', 'Average DSR %', 'kpi', { object: 'loan_application', metric: 'avg', field: 'dsr' }),
      W('metric', 'Referred with exceptions', 'kpi', { object: 'loan_application', filters: [{ field: 'eligibility', op: 'eq', value: 'refer' }, ...OPEN_LOAN] }),
      W('chart', 'Pipeline value by stage (MUR)', 'full', { object: 'loan_application', metric: 'sum', field: 'loan_amount_mur', group_by: 'stage' }, { chart: 'bar', ...CUR }),
      W('chart', 'Applications by product', 'third', { object: 'loan_application', group_by: 'product_code' }, { chart: 'donut' }),
      W('chart', 'Credit decisions', 'third', { object: 'loan_application', group_by: 'credit_decision' }, { chart: 'pie' }),
      W('chart', 'Decline reasons', 'third', { object: 'loan_application', group_by: 'decline_reason', filters: [{ field: 'credit_decision', op: 'eq', value: 'declined' }] }, { chart: 'bar' }),
      W('chart', 'Approval authority (open)', 'half', { object: 'loan_application', group_by: 'approval_level', filters: OPEN_LOAN }, { chart: 'bar' }),
      W('chart', 'Disbursements by tranche status', 'half', { object: 'disbursement', group_by: 'status' }, { chart: 'bar' }),
    ],
  },
  {
    name: 'genesis_loan_book', label: 'Loan Book',
    description: 'Loan book from the LMS snapshot by product, LTV band, arrears bucket and maturity (RPT-04).',
    widgets: [
      W('metric', 'Accounts', 'kpi', { object: 'loan_account' }),
      W('metric', 'Outstanding (MUR)', 'kpi', { object: 'loan_account', metric: 'sum', field: 'outstanding_mur' }, { config: { format: 'currency_compact' } }),
      W('metric', 'In arrears', 'kpi', { object: 'loan_account', filters: [{ field: 'arrears_days', op: 'gt', value: 0 }] }),
      W('metric', 'Arrears amount (MUR)', 'kpi', { object: 'loan_account', metric: 'sum', field: 'arrears_amount' }, { config: { format: 'currency_compact' } }),
      W('chart', 'Outstanding by product (MUR)', 'half', { object: 'loan_account', metric: 'sum', field: 'outstanding_mur', group_by: 'product_code' }, { chart: 'donut', ...CUR }),
      W('chart', 'Arrears buckets', 'half', { object: 'loan_account', group_by: 'arrears_bucket' }, { chart: 'bar' }),
      W('chart', 'LTV bands', 'half', { object: 'loan_account', group_by: 'ltv_band' }, { chart: 'bar' }),
      W('chart', 'PLR-linked vs fixed (MUR)', 'half', { object: 'loan_account', metric: 'sum', field: 'outstanding_mur', group_by: 'rate_type' }, { chart: 'pie', ...CUR }),
      W('chart', 'Commercial facilities by stage (MUR)', 'half', { object: 'credit_facility', metric: 'sum', field: 'amount_mur', group_by: 'stage' }, { chart: 'bar', ...CUR }),
      W('chart', 'Collections outcomes', 'half', { object: 'collection_action', group_by: 'outcome' }, { chart: 'pie' }),
    ],
  },
  {
    name: 'genesis_wealth', label: 'Wealth',
    description: 'AUM and flows, mandates by stage, reviews completed vs due, suitability exceptions (RPT-05).',
    widgets: [
      W('metric', 'Active mandates', 'kpi', { object: 'wealth_mandate', filters: [{ field: 'stage', op: 'eq', value: 'active' }] }),
      W('metric', 'AUM (MUR)', 'kpi', { object: 'wealth_mandate', metric: 'sum', field: 'aum_mur' }, { config: { format: 'currency_compact' } }),
      W('metric', 'Reviews overdue', 'kpi', { object: 'mandate_review', filters: [{ field: 'overdue', op: 'eq', value: 'true' }] }),
      W('metric', 'Attrition risk', 'kpi', { object: 'wealth_mandate', filters: [{ field: 'attrition_risk', op: 'eq', value: 'true' }] }),
      W('chart', 'AUM by model portfolio (MUR)', 'half', { object: 'wealth_mandate', metric: 'sum', field: 'aum_mur', group_by: 'model_portfolio' }, { chart: 'bar', ...CUR }),
      W('chart', 'Mandate pipeline', 'half', { object: 'wealth_mandate', group_by: 'stage' }, { chart: 'funnel' }),
      W('chart', 'Net flows by month', 'half', { object: 'aum_snapshot', metric: 'sum', field: 'net_flows', group_by: 'as_of' }, { chart: 'bar' }),
      W('chart', 'Reviews by status', 'half', { object: 'mandate_review', group_by: 'stage' }, { chart: 'pie' }),
      W('chart', 'Suitability mismatches (overridden)', 'half', { object: 'suitability_record', group_by: 'mismatch' }, { chart: 'pie' }),
      W('chart', 'Risk profiles by model', 'half', { object: 'risk_profile', group_by: 'model_portfolio' }, { chart: 'bar' }),
    ],
  },
  {
    name: 'genesis_funds', label: 'Investment Funds',
    description: 'Subscriptions and redemptions by fund, investor concentration and the FMB 2029 campaign (RPT-06).',
    widgets: [
      W('metric', 'Holdings value (MUR)', 'kpi', { object: 'fund_holding', metric: 'sum', field: 'value_mur' }, { config: { format: 'currency_compact' } }),
      W('metric', 'Investors', 'kpi', { object: 'fund_holding' }),
      W('metric', 'Orders awaiting TA', 'kpi', { object: 'fund_order', filters: [{ field: 'stage', op: 'in', value: 'captured,checked,submitted_to_ta' }] }),
      W('metric', 'FMB 2029 S2 progress %', 'kpi', { object: 'fund_campaign', metric: 'max', field: 'progress_pct', filters: [{ field: 'stage', op: 'eq', value: 'open' }] }),
      W('chart', 'Holdings by fund (MUR)', 'half', { object: 'fund_holding', metric: 'sum', field: 'value_mur', group_by: 'product_code' }, { chart: 'donut', ...CUR }),
      W('chart', 'Subscriptions vs redemptions', 'half', { object: 'fund_order', metric: 'sum', field: 'amount_mur', group_by: 'order_type' }, { chart: 'bar', ...CUR }),
      W('chart', 'Orders by fund', 'half', { object: 'fund_order', group_by: 'fund_code' }, { chart: 'bar' }),
      W('chart', 'Orders per month', 'half', { object: 'fund_order', group_by: 'created_month' }, { chart: 'line' }),
      W('chart', 'Campaign raise (MUR)', 'full', { object: 'fund_campaign', metric: 'sum', field: 'raised', group_by: 'name' }, { chart: 'bar', ...CUR }),
    ],
  },
  {
    name: 'genesis_securities', label: 'Trading',
    description: 'Accounts, order intake and research distribution (M11).',
    widgets: [
      W('metric', 'Active accounts', 'kpi', { object: 'securities_account', filters: [{ field: 'stage', op: 'eq', value: 'active' }] }),
      W('metric', 'Portfolio value (MUR)', 'kpi', { object: 'securities_account', metric: 'sum', field: 'portfolio_value_mur' }, { config: { format: 'currency_compact' } }),
      W('metric', 'Orders executed', 'kpi', { object: 'client_order', filters: [{ field: 'stage', op: 'eq', value: 'executed' }] }),
      W('metric', 'Dormant accounts', 'kpi', { object: 'securities_account', filters: [{ field: 'dormant', op: 'eq', value: 'true' }] }),
      W('chart', 'Orders by market', 'half', { object: 'client_order', group_by: 'market' }, { chart: 'donut' }),
      W('chart', 'Consideration by month (MUR)', 'half', { object: 'client_order', metric: 'sum', field: 'consideration', group_by: 'created_month' }, { chart: 'bar', ...CUR }),
      W('chart', 'IPO / bond book by issue (MUR)', 'full', { object: 'ioi_entry', metric: 'sum', field: 'indicated_amount', group_by: 'issue_name' }, { chart: 'bar', ...CUR }),
    ],
  },
  {
    name: 'genesis_advisory', label: 'Corporate Advisory',
    description: 'Mandates by stage and service line, weighted fee pipeline, bookbuilding. Barrier-aware: the public side sees nothing (RPT-07).',
    widgets: [
      W('metric', 'Live mandates', 'kpi', { object: 'advisory_mandate', filters: [{ field: 'stage', op: 'nin', value: 'completed,abandoned' }] }),
      W('metric', 'Weighted fee pipeline (MUR)', 'kpi', { object: 'advisory_mandate', metric: 'sum', field: 'weighted_fee', filters: [{ field: 'stage', op: 'nin', value: 'completed,abandoned' }] }, { config: { format: 'currency_compact' } }),
      W('metric', 'Commitments (MUR)', 'kpi', { object: 'investor_target', metric: 'sum', field: 'commitment' }, { config: { format: 'currency_compact' } }),
      W('metric', 'Fees invoiced (MUR)', 'kpi', { object: 'fee_invoice', metric: 'sum', field: 'amount' }, { config: { format: 'currency_compact' } }),
      W('chart', 'Mandates by stage', 'half', { object: 'advisory_mandate', group_by: 'stage' }, { chart: 'funnel' }),
      W('chart', 'Mandates by service line', 'half', { object: 'advisory_mandate', group_by: 'service_line' }, { chart: 'donut' }),
      W('chart', 'Bookbuilding by stage', 'half', { object: 'investor_target', group_by: 'stage' }, { chart: 'bar' }),
      W('chart', 'Hours by mandate', 'half', { object: 'time_entry', metric: 'sum', field: 'hours', group_by: 'advisory_mandate' }, { chart: 'bar' }),
    ],
  },
  {
    name: 'genesis_forex', label: 'Forex Desk',
    description: 'Client activity, top clients, forward book and rate alerts (RPT-08).',
    widgets: [
      W('metric', 'Deals (12 months)', 'kpi', { object: 'fx_deal' }),
      W('metric', 'Volume (MUR)', 'kpi', { object: 'fx_deal', metric: 'sum', field: 'amount_mur' }, { config: { format: 'currency_compact' } }),
      W('metric', 'Spread income (MUR)', 'kpi', { object: 'fx_deal', metric: 'sum', field: 'spread_income' }, { config: { format: 'currency_compact' } }),
      W('metric', 'Open forwards', 'kpi', { object: 'fx_deal', filters: [{ field: 'open_forward', op: 'eq', value: 'true' }] }),
      W('chart', 'Volume by currency (MUR)', 'half', { object: 'fx_deal', metric: 'sum', field: 'amount_mur', group_by: 'currency_code' }, { chart: 'donut', ...CUR }),
      W('chart', 'Volume by month (MUR)', 'half', { object: 'fx_deal', metric: 'sum', field: 'amount_mur', group_by: 'created_month' }, { chart: 'bar', ...CUR }),
      W('chart', 'Top clients (MUR)', 'half', { object: 'fx_deal', metric: 'sum', field: 'amount_mur', group_by: 'party' }, { chart: 'bar', ...CUR }),
      W('chart', 'Deals by product', 'half', { object: 'fx_deal', group_by: 'product' }, { chart: 'pie' }),
      W('chart', 'Quote outcomes', 'half', { object: 'fx_quote', group_by: 'stage' }, { chart: 'bar' }),
      W('chart', 'Rate alerts', 'half', { object: 'fx_rate_alert', group_by: 'stage' }, { chart: 'pie' }),
    ],
  },
  {
    name: 'genesis_compliance', label: 'Compliance',
    description: 'KYC status, risk distribution, overdue reviews, screening hits, complaints and consents (RPT-09, CMP-FR-06). STRs appear only for the MLRO.',
    widgets: [
      W('metric', 'KYC awaiting approval', 'kpi', { object: 'kyc_case', filters: [{ field: 'stage', op: 'eq', value: 'pending_approval' }] }),
      W('metric', 'Reviews due (30 days)', 'kpi', { object: 'kyc_case', filters: [{ field: 'review_due', op: 'eq', value: 'true' }] }),
      W('metric', 'Screening hits pending', 'kpi', { object: 'screening_hit', filters: [{ field: 'disposition', op: 'eq', value: 'pending' }] }),
      W('metric', 'Open STRs (MLRO only)', 'kpi', { object: 'str_report', filters: [{ field: 'stage', op: 'in', value: 'raised,under_review' }] }),
      W('chart', 'KYC cases by stage', 'half', { object: 'kyc_case', group_by: 'stage' }, { chart: 'funnel' }),
      W('chart', 'Risk rating distribution', 'half', { object: 'kyc_case', group_by: 'risk_rating', filters: [{ field: 'kyc_outcome', op: 'eq', value: 'approved' }] }, { chart: 'pie' }),
      W('chart', 'Complaints by category', 'half', { object: 'service_request', group_by: 'complaint_category', filters: [{ field: 'request_type', op: 'eq', value: 'complaint' }] }, { chart: 'bar' }),
      W('chart', 'Consents by purpose (granted)', 'half', { object: 'consent_record', group_by: 'purpose', filters: [{ field: 'status', op: 'eq', value: 'granted' }] }, { chart: 'bar' }),
      W('chart', 'Data subject requests', 'half', { object: 'data_subject_request', group_by: 'stage' }, { chart: 'bar' }),
      W('chart', 'Conflict checks', 'half', { object: 'conflict_register', group_by: 'decision' }, { chart: 'pie' }),
    ],
  },
  {
    name: 'genesis_service', label: 'Service & Complaints',
    description: 'Request volumes, complaint ageing, root causes and satisfaction (SR-FR-04, SR-FR-05).',
    widgets: [
      W('metric', 'Open requests', 'kpi', { object: 'service_request', filters: [{ field: 'stage', op: 'nin', value: 'resolved,closed' }] }),
      W('metric', 'Open complaints', 'kpi', { object: 'service_request', filters: [{ field: 'complaint_open', op: 'eq', value: 'true' }] }),
      W('metric', 'Average CSAT', 'kpi', { object: 'service_request', metric: 'avg', field: 'csat_score' }),
      W('metric', 'Average NPS score', 'kpi', { object: 'service_request', metric: 'avg', field: 'nps_score' }),
      W('chart', 'Requests by type', 'half', { object: 'service_request', group_by: 'request_type' }, { chart: 'bar' }),
      W('chart', 'Requests by entity', 'half', { object: 'service_request', group_by: 'business_unit' }, { chart: 'donut' }),
      W('chart', 'Complaint root causes', 'half', { object: 'service_request', group_by: 'root_cause', filters: [{ field: 'request_type', op: 'eq', value: 'complaint' }] }, { chart: 'pie' }),
      W('chart', 'Requests per month', 'half', { object: 'service_request', group_by: 'created_month' }, { chart: 'line' }),
    ],
  },
  {
    name: 'genesis_rm_league', label: 'RM League Table',
    description: 'Activity, pipeline, revenue and cross-sell by RM (RPT-10, RM-FR-06).',
    widgets: [
      W('chart', 'Meetings by RM', 'half', { object: 'meeting_note', group_by: 'rm' }, { chart: 'bar' }),
      W('chart', 'Revenue credited by RM (MUR)', 'half', { object: 'revenue_entry', metric: 'sum', field: 'rm_credit_mur', group_by: 'rm' }, { chart: 'bar', ...CUR }),
      W('chart', 'Open pipeline by RM (MUR)', 'half', { object: 'fs_opportunity', metric: 'sum', field: 'weighted_mur', group_by: 'owner_rm', filters: [{ field: 'stage', op: 'nin', value: 'won,lost' }] }, { chart: 'bar', ...CUR }),
      W('chart', 'Won opportunities by RM', 'half', { object: 'fs_opportunity', group_by: 'owner_rm', filters: [{ field: 'stage', op: 'eq', value: 'won' }] }, { chart: 'bar' }),
      W('chart', 'Target attainment %', 'full', { object: 'rm_target', metric: 'avg', field: 'attainment_pct', group_by: 'rm' }, { chart: 'bar' }),
    ],
  },
  {
    name: 'genesis_marketing', label: 'Marketing',
    description: 'Campaign ROI, audience engagement, events and subscriptions (RPT-11).',
    widgets: [
      W('metric', 'Live campaigns', 'kpi', { object: 'campaign', filters: [{ field: 'stage', op: 'eq', value: 'live' }] }),
      W('metric', 'Attributed enquiries', 'kpi', { object: 'enquiry', filters: [{ field: 'utm_campaign', op: 'notempty' }] }),
      W('metric', 'Event attendance', 'kpi', { object: 'event_registration', filters: [{ field: 'attended', op: 'eq', value: 'true' }] }),
      W('metric', 'Newsletter subscribers', 'kpi', { object: 'subscription', filters: [{ field: 'status', op: 'eq', value: 'subscribed' }] }),
      W('chart', 'ROI by campaign (%)', 'half', { object: 'campaign', metric: 'avg', field: 'roi_pct', group_by: 'name' }, { chart: 'bar' }),
      W('chart', 'Attributed revenue by campaign (MUR)', 'half', { object: 'campaign', metric: 'sum', field: 'revenue_attributed', group_by: 'name' }, { chart: 'bar', ...CUR }),
      W('chart', 'Engagement (responded)', 'half', { object: 'campaign_member', group_by: 'responded' }, { chart: 'pie' }),
      W('chart', 'Subscriptions by topic', 'half', { object: 'subscription', group_by: 'topic' }, { chart: 'donut' }),
      W('chart', 'Introducer referrals by stage', 'half', { object: 'introducer_referral', group_by: 'stage' }, { chart: 'funnel' }),
      W('chart', 'Commission by status (MUR)', 'half', { object: 'commission_entry', metric: 'sum', field: 'amount', group_by: 'status' }, { chart: 'bar', ...CUR }),
    ],
  },
  {
    name: 'genesis_regulatory', label: 'Regulatory Extracts',
    description: 'Complaints log, FX transactions by BoM purpose code, insider lists and AML statistics (RPT-12, FX-FR-06).',
    widgets: [
      W('metric', 'Complaints (12 months)', 'kpi', { object: 'service_request', filters: [{ field: 'request_type', op: 'eq', value: 'complaint' }] }),
      W('metric', 'Referred to the Ombudsperson', 'kpi', { object: 'service_request', filters: [{ field: 'ombudsperson_referred', op: 'eq', value: 'true' }] }),
      W('metric', 'Insiders recorded', 'kpi', { object: 'insider_list_entry' }),
      W('metric', 'STRs filed (MLRO only)', 'kpi', { object: 'str_report', filters: [{ field: 'stage', op: 'eq', value: 'filed' }] }),
      W('chart', 'FX volume by BoM purpose code (MUR)', 'half', { object: 'fx_deal', metric: 'sum', field: 'amount_mur', group_by: 'purpose_code' }, { chart: 'bar', ...CUR }),
      W('chart', 'Complaints by entity', 'half', { object: 'service_request', group_by: 'business_unit', filters: [{ field: 'request_type', op: 'eq', value: 'complaint' }] }, { chart: 'bar' }),
      W('chart', 'Screening hits by list', 'half', { object: 'screening_hit', group_by: 'list_type' }, { chart: 'pie' }),
      W('chart', 'KYC cases by review type', 'half', { object: 'kyc_case', group_by: 'review_type' }, { chart: 'bar' }),
    ],
  },
  {
    name: 'genesis_rm_workbench', label: 'My Workbench',
    description: 'What to do today: open enquiries, next-best actions, reviews due, KYC in flight and my pipeline (RM-FR-01). Each viewer sees their own book.',
    widgets: [
      W('metric', 'My open enquiries', 'kpi', { object: 'enquiry', filters: [{ field: 'stage', op: 'in', value: 'new,contacted,qualified' }] }),
      W('metric', 'Next-best actions', 'kpi', { object: 'nba_suggestion', filters: [{ field: 'status', op: 'eq', value: 'open' }] }),
      W('metric', 'Mandate reviews open', 'kpi', { object: 'mandate_review', filters: [{ field: 'open', op: 'eq', value: 'true' }] }),
      W('metric', 'KYC in progress', 'kpi', { object: 'kyc_case', filters: [{ field: 'stage', op: 'nin', value: 'approved,rejected' }] }),
      W('chart', 'My pipeline by stage (MUR)', 'half', { object: 'fs_opportunity', metric: 'sum', field: 'amount_mur', group_by: 'stage' }, { chart: 'funnel', ...CUR }),
      W('chart', 'Next-best actions by rule', 'half', { object: 'nba_suggestion', group_by: 'rule', filters: [{ field: 'status', op: 'eq', value: 'open' }] }, { chart: 'bar' }),
      W('chart', 'My meetings per month', 'half', { object: 'meeting_note', group_by: 'created_month' }, { chart: 'line' }),
      W('chart', 'My clients by segment', 'half', { object: 'party', group_by: 'segment' }, { chart: 'donut' }),
    ],
  },
];

// ── Public web forms (I-01) ──────────────────────────────────────────────────
const publicForms = [
  ...base.publicForms,
  { form: 'web_event_calculator', settings: { success_message: 'Your indicative instalment is below. Leave your details on the enquiry form for a personalised offer.', channel: 'calculator', result_fields: ['rate', 'emi'] } },
  { form: 'web_event_newsletter', settings: { success_message: 'You are subscribed — thank you.', consent_field: 'consent_marketing', consent_text_version: '2026-10-v1', channel: 'web_form' } },
  { form: 'web_event_callback', settings: { success_message: 'Thank you — a specialist will call you back.', consent_field: 'consent_marketing', consent_text_version: '2026-10-v1', channel: 'web_form' } },
];

// Categories clients may see and download on the portal (statements, letters).
const PORTAL_VISIBLE = new Set(['offer_letters', 'correspondence', 'generated', 'mandates_ips', 'client_reports', 'fund_documents']);
const withPortal = (cats) => cats.map((c) => (PORTAL_VISIBLE.has(c.code) ? { ...c, config: { ...(c.config ?? {}), portal_visible: true } } : c));

module.exports = {
  emailTemplates: [...base.emailTemplates, ...emailTemplates],
  documentCategories: withPortal([...base.documentCategories, ...documentCategories]),
  documentChecklists: [...base.documentChecklists, ...documentChecklists],
  documentTemplates: [...base.documentTemplates, ...documentTemplates],
  wizards: [...base.wizards, ...wizards],
  dashboards,
  publicForms,
};
