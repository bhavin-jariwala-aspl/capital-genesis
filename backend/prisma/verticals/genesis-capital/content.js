'use strict';

/**
 * Genesis Capital — communications, documents, wizards, dashboards and public
 * forms. Templates are business-owned content (Builder ▸ Email Templates /
 * Document Management); each `_fr` template is the French variant the
 * send_email step picks when the record's language is `fr` (PRD X-02).
 */

// ── Email templates (EN / FR) ─────────────────────────────────────────────────
const wrap = (body) => `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.55;color:#1f2937;max-width:620px">
${body}
<p style="color:#6b7280;font-size:12px;margin-top:24px">Genesis Capital — Think. Multiply.<br>
Genesis Centre, 10 Intendance Street, Port Louis, Mauritius · info@genesis-capital.demo</p></div>`;

const pair = (name, category, object, en, fr) => [
  { name, category, object, language: 'en', subject: en.subject, body_html: wrap(en.html), body_text: en.text },
  { name: `${name}_fr`, category, object, language: 'fr', subject: fr.subject, body_html: wrap(fr.html), body_text: fr.text },
];

const emailTemplates = [
  ...pair('enquiry_ack', 'sales', 'enquiry',
    {
      subject: 'We received your enquiry — {{enquiry_no}}',
      html: '<p>Dear {{first_name}},</p><p>Thank you for contacting Genesis Capital about <strong>{{product_code}}</strong>. Your reference is <strong>{{enquiry_no}}</strong>.</p><p>A specialist from the right team will contact you within four business hours.</p>',
      text: 'Dear {{first_name}}, thank you for your enquiry ({{enquiry_no}}). A specialist will contact you within four business hours.',
    },
    {
      subject: 'Nous avons bien reçu votre demande — {{enquiry_no}}',
      html: '<p>Bonjour {{first_name}},</p><p>Merci d\'avoir contacté Genesis Capital au sujet de <strong>{{product_code}}</strong>. Votre référence est <strong>{{enquiry_no}}</strong>.</p><p>Un spécialiste de l\'équipe concernée vous contactera sous quatre heures ouvrables.</p>',
      text: 'Bonjour {{first_name}}, merci pour votre demande ({{enquiry_no}}). Un spécialiste vous contactera sous quatre heures ouvrables.',
    }),
  ...pair('loan_document_request', 'service', 'loan_application',
    {
      subject: 'Documents needed for your loan application {{application_no}}',
      html: '<p>Dear client,</p><p>To assess application <strong>{{application_no}}</strong> we need: identity document, proof of address (under 3 months), last 3 payslips or audited accounts, 6 months of bank statements, and — for property loans — the title deed and valuation report.</p><p>Your relationship manager will send a secure upload link.</p>',
      text: 'Documents needed for {{application_no}}: ID, proof of address, payslips or accounts, 6 months of bank statements, title deed and valuation (property loans).',
    },
    {
      subject: 'Documents requis pour votre demande de prêt {{application_no}}',
      html: '<p>Madame, Monsieur,</p><p>Pour étudier la demande <strong>{{application_no}}</strong>, nous avons besoin : pièce d\'identité, justificatif de domicile (moins de 3 mois), 3 dernières fiches de paie ou comptes audités, 6 mois de relevés bancaires et, pour un prêt immobilier, l\'acte de propriété et le rapport d\'évaluation.</p><p>Votre conseiller vous enverra un lien de dépôt sécurisé.</p>',
      text: 'Documents requis pour {{application_no}} : pièce d\'identité, justificatif de domicile, fiches de paie ou comptes, 6 mois de relevés, acte et évaluation (prêt immobilier).',
    }),
  ...pair('loan_offer', 'sales', 'loan_application',
    {
      subject: 'Your loan offer {{application_no}}',
      html: '<p>Dear client,</p><p>We are pleased to offer <strong>MUR {{loan_amount_mur}}</strong> over {{tenure_months}} months at <strong>{{interest_rate}}%</strong> (Genesis PLR {{plr_rate}}% {{margin}}), a monthly instalment of <strong>MUR {{emi}}</strong>.</p><p>The offer is valid until {{offer_valid_until}}. Your relationship manager will send it for electronic signature.</p>',
      text: 'Loan offer {{application_no}}: MUR {{loan_amount_mur}}, {{tenure_months}} months, {{interest_rate}}%, instalment MUR {{emi}}. Valid until {{offer_valid_until}}.',
    },
    {
      subject: 'Votre offre de prêt {{application_no}}',
      html: '<p>Madame, Monsieur,</p><p>Nous avons le plaisir de vous proposer <strong>MUR {{loan_amount_mur}}</strong> sur {{tenure_months}} mois au taux de <strong>{{interest_rate}} %</strong>, soit une mensualité de <strong>MUR {{emi}}</strong>.</p><p>L\'offre est valable jusqu\'au {{offer_valid_until}}. Votre conseiller vous l\'enverra pour signature électronique.</p>',
      text: 'Offre {{application_no}} : MUR {{loan_amount_mur}}, {{tenure_months}} mois, {{interest_rate}} %, mensualité MUR {{emi}}. Valable jusqu\'au {{offer_valid_until}}.',
    }),
  ...pair('loan_decline', 'service', 'loan_application',
    {
      subject: 'Your loan application {{application_no}}',
      html: '<p>Dear client,</p><p>After careful review we are unable to approve application <strong>{{application_no}}</strong> at this time. You may apply again from {{reapply_after}}. Your relationship manager is available to discuss alternatives.</p>',
      text: 'We are unable to approve application {{application_no}} at this time. You may re-apply from {{reapply_after}}.',
    },
    {
      subject: 'Votre demande de prêt {{application_no}}',
      html: '<p>Madame, Monsieur,</p><p>Après étude attentive, nous ne sommes pas en mesure d\'approuver la demande <strong>{{application_no}}</strong> pour le moment. Une nouvelle demande est possible à partir du {{reapply_after}}. Votre conseiller reste à votre disposition.</p>',
      text: 'Nous ne pouvons approuver la demande {{application_no}} pour le moment. Nouvelle demande possible à partir du {{reapply_after}}.',
    }),
  ...pair('complaint_ack', 'service', 'service_request',
    {
      subject: 'We have received your complaint — {{request_no}}',
      html: '<p>Dear client,</p><p>We have registered your complaint under reference <strong>{{request_no}}</strong>. We will investigate and send our final response within 15 business days. If you are not satisfied with our response you may refer the matter to the Ombudsperson for Financial Services.</p>',
      text: 'Complaint {{request_no}} registered. Final response within 15 business days. You may refer the matter to the Ombudsperson for Financial Services.',
    },
    {
      subject: 'Nous avons bien reçu votre réclamation — {{request_no}}',
      html: '<p>Madame, Monsieur,</p><p>Votre réclamation est enregistrée sous la référence <strong>{{request_no}}</strong>. Nous vous adresserons notre réponse définitive sous 15 jours ouvrables. En cas de désaccord, vous pourrez saisir l\'Ombudsperson for Financial Services.</p>',
      text: 'Réclamation {{request_no}} enregistrée. Réponse définitive sous 15 jours ouvrables.',
    }),
  ...pair('service_ack', 'service', 'service_request',
    {
      subject: 'Your request {{request_no}}',
      html: '<p>Dear client,</p><p>We have received your request (<strong>{{request_no}}</strong>) and will keep you informed of its progress.</p>',
      text: 'We received your request {{request_no}} and will keep you informed.',
    },
    {
      subject: 'Votre demande {{request_no}}',
      html: '<p>Madame, Monsieur,</p><p>Nous avons bien reçu votre demande (<strong>{{request_no}}</strong>) et vous tiendrons informé(e) de son avancement.</p>',
      text: 'Nous avons bien reçu votre demande {{request_no}}.',
    }),
  ...pair('kyc_refresh_request', 'compliance', 'party',
    {
      subject: 'Please update your identity document',
      html: '<p>Dear {{first_name}},</p><p>Our records show your identity document expires on {{id_expiry_date}}. Regulations require us to keep it current — please send a copy of your new document to your relationship manager.</p>',
      text: 'Your identity document expires on {{id_expiry_date}}. Please send a copy of your new document to your relationship manager.',
    },
    {
      subject: 'Merci de mettre à jour votre pièce d\'identité',
      html: '<p>Bonjour {{first_name}},</p><p>Votre pièce d\'identité expire le {{id_expiry_date}}. La réglementation nous impose de la tenir à jour : merci d\'en transmettre une copie à votre conseiller.</p>',
      text: 'Votre pièce d\'identité expire le {{id_expiry_date}}. Merci d\'en transmettre une copie à votre conseiller.',
    }),
];

// ── Document taxonomy (PRD DOC-FR-01/02) ──────────────────────────────────────
const SEVEN_YEARS = 7 * 365;
const PDF_IMG = ['application/pdf', 'image/jpeg', 'image/png'];
const OFFICE = [...PDF_IMG, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'];
const cat = (code, label, color, extra = {}) => ({ code, label, color, retention_days: SEVEN_YEARS, allowed_mime: PDF_IMG, max_file_mb: 15, ...extra });
const documentCategories = [
  cat('kyc_id', 'KYC — identity', 'red', { review_required: true, is_required: true, description: 'Passport / NIC. Retained 7 years after the relationship ends (AML).' }),
  cat('proof_of_address', 'Proof of address', 'orange', { review_required: true, description: 'Under 3 months old.' }),
  cat('source_of_funds', 'Source of funds / wealth', 'amber', { review_required: true, allowed_mime: OFFICE }),
  cat('corporate_docs', 'Corporate documents', 'yellow', { review_required: true, allowed_mime: OFFICE, description: 'Incorporation, constitution, registers, UBO declarations, board resolution.' }),
  cat('financial_statements', 'Financial statements', 'lime', { allowed_mime: OFFICE }),
  cat('bank_statements', 'Bank statements', 'green', { allowed_mime: OFFICE }),
  cat('property_title', 'Property & title', 'emerald'),
  cat('valuation', 'Valuation report', 'teal'),
  cat('insurance', 'Insurance (assigned policies)', 'cyan'),
  cat('offer_letters', 'Offer & facility letters', 'sky', { allowed_mime: OFFICE }),
  cat('security_docs', 'Security documents', 'blue'),
  cat('mandates_ips', 'Mandates & IPS', 'indigo', { allowed_mime: OFFICE }),
  cat('fund_forms', 'Fund forms', 'violet'),
  cat('account_agreements', 'Account agreements', 'purple'),
  cat('engagement_letters', 'Engagement letters', 'fuchsia', { allowed_mime: OFFICE }),
  cat('deal_documents', 'Deal documents (barrier-protected)', 'pink', { allowed_mime: OFFICE, description: 'Attach to an Advisory Mandate: visible only inside the ADV_PRIVATE barrier.' }),
  cat('correspondence', 'Correspondence', 'slate', { allowed_mime: OFFICE }),
  cat('complaints', 'Complaints', 'rose', { allowed_mime: OFFICE }),
  cat('generated', 'Generated letters', 'gray', { allowed_mime: ['text/html', 'text/plain', 'application/pdf'] }),
];

const item = (category_code, label, required = true) => ({ category_code, label, required });
const documentChecklists = [
  { entity_type: 'kyc_case', label: 'Individual KYC pack', items: [item('kyc_id', 'Passport or NIC'), item('proof_of_address', 'Proof of address (< 3 months)'), item('source_of_funds', 'Source of funds evidence')] },
  { entity_type: 'kyc_case', label: 'Corporate KYC pack', items: [item('corporate_docs', 'Certificate of incorporation & constitution'), item('corporate_docs', 'Register of directors & shareholders'), item('corporate_docs', 'UBO declarations'), item('corporate_docs', 'Board resolution'), item('kyc_id', 'ID of directors & UBOs')] },
  { entity_type: 'loan_application', label: 'Real estate loan', items: [item('kyc_id', 'Applicant ID'), item('proof_of_address', 'Proof of address'), item('bank_statements', '6 months of bank statements'), item('financial_statements', 'Payslips or audited accounts'), item('property_title', 'Title deed / sale agreement'), item('valuation', 'Valuation report'), item('insurance', 'Life & building insurance assignment')] },
  { entity_type: 'loan_application', label: 'Personal loan', items: [item('kyc_id', 'Applicant ID'), item('proof_of_address', 'Proof of address'), item('bank_statements', '6 months of bank statements'), item('financial_statements', 'Payslips or audited accounts'), item('property_title', 'Title deed for the fixed charge')] },
];

// ── Merge templates (PRD DOC-FR-03) ───────────────────────────────────────────
const letter = (body) => `<div style="font-family:Georgia,serif;font-size:14px;line-height:1.6;max-width:680px">
<p style="text-align:right">Port Louis, {{today}}</p>${body}
<p>Yours faithfully,<br><br>Genesis Life Ltd — Loans business line<br><small>Regulated by the Financial Services Commission (FSC IS10000013)</small></p></div>`;
const documentTemplates = [
  {
    name: 'loan_offer_letter', entity_type: 'loan_application', output_category: 'offer_letters', description: 'Retail loan offer — e-signed by all borrowers and guarantors.',
    body: letter(`<h2>Offer of facility — {{application_no}}</h2>
<p>Borrower: <strong>{{party_name}}</strong></p>
<table style="border-collapse:collapse" cellpadding="6">
<tr><td>Product</td><td>{{product_code}} — {{purpose}}</td></tr>
<tr><td>Amount</td><td>{{currency_code}} {{loan_amount}} (MUR {{loan_amount_mur}})</td></tr>
<tr><td>Tenure</td><td>{{tenure_months}} months ({{repayment_type}})</td></tr>
<tr><td>Interest rate</td><td>{{interest_rate}}% variable — Genesis PLR ({{plr_rate}}%) {{margin}}%</td></tr>
<tr><td>Monthly instalment</td><td>MUR {{emi}}</td></tr>
<tr><td>Security</td><td>First-rank fixed charge; life and building insurance assigned to Genesis Life Ltd (property loans); pledge of investments (investment-backed loans)</td></tr>
<tr><td>Conditions</td><td>{{conditions}}</td></tr>
<tr><td>Valid until</td><td>{{offer_valid_until}}</td></tr></table>
<p>The rate is linked to the Genesis PLR and changes when the PLR changes; you will be notified of every change.</p>`),
  },
  {
    name: 'loan_decline_letter', entity_type: 'loan_application', output_category: 'generated', description: 'Compliant decline letter with the re-application date.',
    body: letter(`<h2>Your application {{application_no}}</h2><p>Dear {{party_name}},</p>
<p>Thank you for applying. After careful assessment we are unable to approve your application at this time. You may submit a new application from <strong>{{reapply_after}}</strong>.</p>
<p>Under the Data Protection Act 2017 you may ask what information we used. Your relationship manager will gladly discuss alternatives.</p>`),
  },
  {
    name: 'plr_change_notice', entity_type: 'loan_application', output_category: 'correspondence', description: 'Notice of a Genesis PLR change to a variable-rate borrower (SERV-FR-02).',
    body: letter('<h2>Change in the Genesis Prime Lending Rate</h2><p>Dear {{party_name}},</p><p>The Genesis PLR is now <strong>{{plr_rate}}%</strong>. The rate on loan {{application_no}} becomes <strong>{{interest_rate}}%</strong>, and your monthly instalment <strong>MUR {{emi}}</strong>.</p>'),
  },
  {
    name: 'kyc_refresh_letter', entity_type: 'party', output_category: 'correspondence', description: 'KYC refresh request.',
    body: letter('<h2>Updating your records</h2><p>Dear {{display_name}},</p><p>To comply with our anti-money-laundering obligations we must keep your records current. Please provide an updated identity document and proof of address.</p>'),
  },
  {
    name: 'engagement_letter', entity_type: 'advisory_mandate', output_category: 'engagement_letters', description: 'Advisory engagement letter (referenced by project code name).',
    body: '<div style="font-family:Georgia,serif;font-size:14px;line-height:1.6;max-width:680px"><h2>Engagement letter — Project {{code_name}}</h2><p>Service line: {{service_line}}. Retainer MUR {{retainer_fee}}; success fee {{success_fee_pct}}% of the transaction value.</p><p>Genesis Corporate Advisors Ltd (FSC IZ19000019)</p></div>',
  },
];

// ── Wizards (PRD LEAD-FR-05 qualification, M04 questionnaire) ────────────────
const wizards = [
  {
    object: 'loan_application', name: 'genesis_real_estate_application', label: 'Real Estate Loan Application',
    description: 'Applicant and product → income → property → review.', submit_label: 'Submit application', success_message: 'Application captured. Eligibility and pricing are calculated on the record.',
    steps: [
      { name: 'applicant', label: 'Applicant & product', fields: ['party', 'co_borrower', 'guarantor', 'product_code', 'purpose', 'loan_amount', 'currency_code', 'tenure_months', 'repayment_type', 'moratorium_months'] },
      { name: 'income', label: 'Income & obligations', fields: ['employment_type', 'monthly_income', 'existing_obligations', 'mcib_consent'] },
      { name: 'property', label: 'Property', fields: ['property_value'] },
    ],
  },
  {
    object: 'risk_profile', name: 'genesis_investor_questionnaire', label: 'Investor Questionnaire',
    description: 'Scores the client to a model portfolio A–E.', submit_label: 'Calculate my profile', success_message: 'Profile saved — the model portfolio is on the record.',
    steps: [
      { name: 'about', label: 'About the investor', fields: ['party', 'profiled_on', 'age', 'client_classification'] },
      { name: 'horizon', label: 'Horizon & objectives', fields: ['time_horizon', 'objective', 'liquidity_needs'] },
      { name: 'attitude', label: 'Attitude to risk', fields: ['risk_tolerance', 'knowledge', 'net_worth', 'esg_preference'] },
    ],
  },
  {
    object: 'enquiry', name: 'genesis_wealth_qualification', label: 'Wealth enquiry — qualify',
    description: 'Investable assets and horizon for a wealth or fund enquiry.', submit_label: 'Save enquiry',
    steps: [
      { name: 'contact', label: 'Contact', fields: ['first_name', 'last_name', 'email', 'mobile', 'preferred_language', 'channel'] },
      { name: 'need', label: 'Need', fields: ['product_code', 'investable_assets', 'investment_horizon', 'currency_code', 'message'] },
    ],
  },
  {
    object: 'enquiry', name: 'genesis_advisory_qualification', label: 'Advisory enquiry — qualify',
    description: 'Company, revenue and the advisory need.', submit_label: 'Save enquiry',
    steps: [
      { name: 'contact', label: 'Contact', fields: ['party_type', 'company', 'first_name', 'last_name', 'email', 'mobile', 'channel'] },
      { name: 'need', label: 'Need', fields: ['product_code', 'advisory_need', 'company_revenue', 'message'] },
    ],
  },
  {
    object: 'enquiry', name: 'genesis_fx_qualification', label: 'Forex enquiry — qualify',
    description: 'Currency pair, monthly volume and purpose.', submit_label: 'Save enquiry',
    steps: [
      { name: 'contact', label: 'Contact', fields: ['party_type', 'company', 'first_name', 'last_name', 'email', 'mobile', 'channel'] },
      { name: 'need', label: 'FX need', fields: ['product_code', 'fx_currency_pair', 'fx_monthly_volume', 'fx_purpose', 'message'] },
    ],
  },
];

// ── Dashboards (PRD M22, built on object analytics) ──────────────────────────
const W = (type, title, size, data, extra = {}) => ({ type, title, size, data, ...extra });
const CUR = { appearance: { format: 'currency_compact' } };
const dashboards = [
  {
    name: 'genesis_group_executive', label: 'Group Executive', is_default: true,
    description: 'New business, pipeline and service across all six entities (RPT-01, RPT-02).',
    widgets: [
      W('metric', 'Open enquiries', 'kpi', { object: 'enquiry', filters: [{ field: 'stage', op: 'in', value: 'new,contacted,qualified' }] }),
      W('metric', 'Loan pipeline (MUR)', 'kpi', { object: 'loan_application', metric: 'sum', field: 'loan_amount_mur', filters: [{ field: 'stage', op: 'nin', value: 'disbursed,declined,withdrawn,lapsed' }] }),
      W('metric', 'Loans disbursed (MUR)', 'kpi', { object: 'loan_application', metric: 'sum', field: 'loan_amount_mur', filters: [{ field: 'outcome', op: 'eq', value: 'disbursed' }] }),
      W('metric', 'Open complaints', 'kpi', { object: 'service_request', filters: [{ field: 'request_type', op: 'eq', value: 'complaint' }, { field: 'stage', op: 'nin', value: 'resolved,closed' }] }),
      W('chart', 'Enquiries by entity', 'half', { object: 'enquiry', group_by: 'business_unit' }, { chart: 'bar' }),
      W('chart', 'Enquiry funnel', 'half', { object: 'enquiry', group_by: 'stage' }, { chart: 'funnel' }),
      W('chart', 'Enquiries by channel', 'half', { object: 'enquiry', group_by: 'channel' }, { chart: 'donut' }),
      W('chart', 'Enquiries per month', 'half', { object: 'enquiry', group_by: 'created_month' }, { chart: 'line' }),
      W('chart', 'Relationships by entity', 'half', { object: 'client_relationship', group_by: 'business_unit' }, { chart: 'bar' }),
      W('chart', 'Clients by segment', 'half', { object: 'party', group_by: 'segment' }, { chart: 'pie' }),
    ],
  },
  {
    name: 'genesis_lending', label: 'Lending', description: 'Origination pipeline, product mix and outcomes (RPT-03).',
    widgets: [
      W('metric', 'Applications in progress', 'kpi', { object: 'loan_application', filters: [{ field: 'stage', op: 'nin', value: 'disbursed,declined,withdrawn,lapsed' }] }),
      W('metric', 'Average DSR %', 'kpi', { object: 'loan_application', metric: 'avg', field: 'dsr' }),
      W('metric', 'Average LTV %', 'kpi', { object: 'loan_application', metric: 'avg', field: 'ltv' }),
      W('metric', 'Referred to credit with exceptions', 'kpi', { object: 'loan_application', filters: [{ field: 'eligibility', op: 'eq', value: 'refer' }] }),
      W('chart', 'Pipeline value by stage (MUR)', 'full', { object: 'loan_application', metric: 'sum', field: 'loan_amount_mur', group_by: 'stage' }, { chart: 'bar', ...CUR }),
      W('chart', 'Applications by product', 'half', { object: 'loan_application', group_by: 'product_code' }, { chart: 'donut' }),
      W('chart', 'Decline reasons', 'half', { object: 'loan_application', group_by: 'decline_reason', filters: [{ field: 'credit_decision', op: 'eq', value: 'declined' }] }, { chart: 'bar' }),
    ],
  },
  {
    name: 'genesis_compliance', label: 'Compliance',
    description: 'KYC status, risk distribution, reviews due, complaints and consents (RPT-09). Numbers respect each viewer\'s access scope.',
    widgets: [
      W('metric', 'KYC awaiting approval', 'kpi', { object: 'kyc_case', filters: [{ field: 'stage', op: 'eq', value: 'pending_approval' }] }),
      W('metric', 'Reviews due (30 days)', 'kpi', { object: 'kyc_case', filters: [{ field: 'review_due', op: 'eq', value: 'true' }] }),
      W('metric', 'High-risk clients', 'kpi', { object: 'kyc_case', filters: [{ field: 'risk_rating', op: 'eq', value: 'high' }, { field: 'kyc_outcome', op: 'eq', value: 'approved' }] }),
      W('metric', 'Screening matches open', 'kpi', { object: 'kyc_case', filters: [{ field: 'screening_result', op: 'in', value: 'potential_match,true_match' }, { field: 'stage', op: 'nin', value: 'approved,rejected' }] }),
      W('chart', 'KYC cases by stage', 'half', { object: 'kyc_case', group_by: 'stage' }, { chart: 'funnel' }),
      W('chart', 'Risk rating distribution', 'half', { object: 'kyc_case', group_by: 'risk_rating' }, { chart: 'pie' }),
      W('chart', 'Complaints by category', 'half', { object: 'service_request', group_by: 'complaint_category', filters: [{ field: 'request_type', op: 'eq', value: 'complaint' }] }, { chart: 'bar' }),
      W('chart', 'Consents by purpose', 'half', { object: 'consent_record', group_by: 'purpose', filters: [{ field: 'status', op: 'eq', value: 'granted' }] }, { chart: 'bar' }),
    ],
  },
];

// ── Public web forms (PRD I-01, LEAD-FR-01/10/11) ────────────────────────────
// The calculators price loans only, so they offer only the loan products.
const LOAN_CODES = ['LND-RE', 'LND-PL', 'LND-IBL', 'LND-COM'];
const publicForms = [
  { form: 'enquiry_web', settings: { success_message: 'Thank you — a Genesis specialist will contact you within four business hours.', consent_field: 'consent_marketing', consent_text_version: '2026-10-v1', stage: 'new', channel: 'web_form' } },
  { form: 'enquiry_calculator', settings: { field_options: { product_code: LOAN_CODES }, success_message: 'Here is your indicative monthly instalment. A loans specialist will be in touch.', consent_field: 'consent_marketing', consent_text_version: '2026-10-v1', stage: 'new', channel: 'calculator', result_fields: ['indicative_rate', 'indicative_emi'] } },
  { form: 'risk_profile_web', settings: { success_message: 'Thank you — your investor profile is below. A wealth adviser will contact you.', result_fields: ['model_portfolio', 'risk_profile_label'] } },
];

module.exports = { emailTemplates, documentCategories, documentChecklists, documentTemplates, wizards, dashboards, publicForms };
