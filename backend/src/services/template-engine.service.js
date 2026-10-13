'use strict';

const { logger } = require('./logging.service');
const CurrencyService = require('./currency.service');

// ── Formatting helpers ─────────────────────────────────────────────────────

/**
 * Render an amount in the tenant's display currency.
 *
 * The profile is read from the request-scoped currency context, which the
 * insurance template routes install via `CurrencyService.withProfile()`. With
 * no context in scope (a script, a test) this degrades to USD rather than
 * failing — the previous hardcoded behaviour.
 *
 * Missing/invalid values render as a zero amount, as they always have, so a
 * PDF never shows a bare dash where a total belongs.
 */
function currency(value) {
  const profile = CurrencyService.activeProfile();
  const num = value == null ? 0 : (typeof value === 'string' ? parseFloat(value) : Number(value));
  return profile.format(Number.isFinite(num) ? num : 0);
}

function pct(value) {
  if (value == null) return '0.00%';
  const num = typeof value === 'string' ? parseFloat(value) : Number(value);
  if (isNaN(num)) return '0.00%';
  return num.toFixed(2) + '%';
}

function dateStr(value) {
  if (!value) return 'N/A';
  const d = value instanceof Date ? value : new Date(value);
  if (isNaN(d.getTime())) return 'N/A';
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}

function shortDate(value) {
  if (!value) return 'N/A';
  const d = value instanceof Date ? value : new Date(value);
  if (isNaN(d.getTime())) return 'N/A';
  return d.toLocaleDateString('en-US', { year: 'numeric', month: '2-digit', day: '2-digit' });
}

function escapeHtml(text) {
  if (text == null) return '';
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function safe(val, fallback = 'N/A') {
  if (val == null || val === '') return fallback;
  return escapeHtml(String(val));
}

function yesNo(val) {
  if (val === true || val === 'yes' || val === 'Yes' || val === 1) return 'Yes';
  if (val === false || val === 'no' || val === 'No' || val === 0) return 'No';
  return 'N/A';
}

// ── Base styles shared by all rendered documents ───────────────────────────

const BASE_CSS = `
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: 'Segoe UI', -apple-system, BlinkMacSystemFont, Roboto, Helvetica, Arial, sans-serif;
    font-size: 11pt;
    color: #1a1a2e;
    line-height: 1.5;
    background: #ffffff;
  }
  .page { width: 100%; max-width: 8.5in; margin: 0 auto; padding: 0.6in 0.75in; position: relative; }
  .page-break { page-break-after: always; break-after: page; }
  h1 { font-size: 20pt; font-weight: 700; color: #0d1b4a; margin-bottom: 6px; }
  h2 { font-size: 14pt; font-weight: 700; color: #1b2a5e; margin: 20px 0 8px; border-bottom: 2px solid #2563eb; padding-bottom: 4px; }
  h3 { font-size: 12pt; font-weight: 600; color: #334155; margin: 14px 0 6px; }
  p, li { font-size: 10.5pt; color: #374151; line-height: 1.6; }
  table { width: 100%; border-collapse: collapse; margin: 10px 0 16px; }
  th { background-color: #1e3a8a; color: #ffffff; font-weight: 600; font-size: 9.5pt; text-transform: uppercase; letter-spacing: 0.3px; text-align: left; padding: 8px 10px; }
  td { padding: 7px 10px; font-size: 10pt; border-bottom: 1px solid #e5e7eb; }
  tr:nth-child(even) td { background-color: #f8fafc; }
  .kv-table td { border-bottom: 1px solid #f1f5f9; }
  .kv-table td:first-child { font-weight: 600; color: #475569; width: 40%; }
  .kv-table td:last-child { color: #1e293b; }
  .text-right { text-align: right; }
  .text-center { text-align: center; }
  .accent { color: #2563eb; }
  .highlight { background-color: #eff6ff; padding: 12px 16px; border-left: 4px solid #2563eb; border-radius: 4px; margin: 12px 0; }
  .warning { background-color: #fef3c7; padding: 10px 14px; border-left: 4px solid #d97706; border-radius: 4px; margin: 12px 0; font-size: 9.5pt; }
  .disclaimer { font-size: 8.5pt; color: #6b7280; margin-top: 20px; padding-top: 12px; border-top: 1px solid #e5e7eb; line-height: 1.5; }
  .footer { font-size: 8pt; color: #9ca3af; text-align: center; margin-top: 30px; padding-top: 10px; border-top: 1px solid #e5e7eb; }
  .signature-block { margin-top: 30px; display: flex; gap: 60px; }
  .signature-line { border-top: 1px solid #374151; width: 220px; padding-top: 4px; font-size: 9pt; color: #6b7280; margin-top: 40px; }
  .checklist-item { padding: 4px 0; font-size: 10pt; }
  .checklist-box { display: inline-block; width: 14px; height: 14px; border: 1.5px solid #6b7280; border-radius: 2px; margin-right: 8px; vertical-align: middle; }
  .badge { display: inline-block; padding: 2px 10px; border-radius: 12px; font-size: 8.5pt; font-weight: 600; }
  .badge-blue { background: #dbeafe; color: #1e40af; }
  .badge-green { background: #dcfce7; color: #166534; }
  .badge-amber { background: #fef3c7; color: #92400e; }
  .header-bar { background: linear-gradient(135deg, #1e3a8a, #2563eb); color: #ffffff; padding: 24px 30px; border-radius: 6px; margin-bottom: 20px; }
  .header-bar h1 { color: #ffffff; margin: 0; }
  .header-bar .subtitle { color: #bfdbfe; font-size: 10.5pt; margin-top: 4px; }
  .logo-placeholder { font-size: 9pt; color: #93c5fd; margin-bottom: 6px; letter-spacing: 0.5px; text-transform: uppercase; }
  .two-col { display: flex; gap: 24px; }
  .two-col > div { flex: 1; }
  .total-row td { font-weight: 700; border-top: 2px solid #1e3a8a; background-color: #eff6ff !important; }
`;

function wrapDocument(title, bodyHtml) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(title)}</title>
<style>${BASE_CSS}</style>
</head>
<body>
${bodyHtml}
</body>
</html>`;
}

function headerBar(title, subtitle, companyName) {
  return `<div class="header-bar">
  <div class="logo-placeholder">${safe(companyName, '[ Company Logo ]')}</div>
  <h1>${escapeHtml(title)}</h1>
  <div class="subtitle">${escapeHtml(subtitle)}</div>
</div>`;
}

function kvSection(title, pairs) {
  let html = title ? `<h2>${escapeHtml(title)}</h2>` : '';
  html += '<table class="kv-table">';
  for (const [label, value] of pairs) {
    html += `<tr><td>${escapeHtml(label)}</td><td>${value == null ? 'N/A' : escapeHtml(String(value))}</td></tr>`;
  }
  html += '</table>';
  return html;
}

function disclaimerBlock(lines) {
  return `<div class="disclaimer">${lines.map(l => `<p>${escapeHtml(l)}</p>`).join('')}</div>`;
}

function footerBlock(docName, refNum) {
  const now = new Date();
  return `<div class="footer">
  <p>${escapeHtml(docName)} | Ref: ${safe(refNum, '—')} | Generated: ${dateStr(now)}</p>
  <p>This document is confidential and intended solely for the named recipient(s). Unauthorized distribution is prohibited.</p>
</div>`;
}

function signatureSection(signatories) {
  let html = '<h2>Signatures</h2><div class="signature-block">';
  for (const s of signatories) {
    html += `<div><div class="signature-line">${escapeHtml(s.label)}</div><p style="font-size:9pt;color:#9ca3af;margin-top:2px;">Date: _______________</p></div>`;
  }
  html += '</div>';
  return html;
}

// ═══════════════════════════════════════════════════════════════════════════════
// BUILT-IN TEMPLATE DEFINITIONS
// ═══════════════════════════════════════════════════════════════════════════════

const TEMPLATES = {
  QUOTE_SUMMARY: {
    id: 'QUOTE_SUMMARY',
    name: 'Insurance Quote Summary',
    description: 'Professional insurance quote summary with agent information, client details, product specifications, premium breakdown, riders, and payment options.',
    category: 'sales',
    sections: [
      { title: 'Company Header', type: 'header', fields: ['company_name', 'company_address', 'company_phone', 'company_license'] },
      { title: 'Agent Information', type: 'key_value', fields: ['agent_name', 'agent_license', 'agent_phone', 'agent_email', 'agent_office'] },
      { title: 'Client Information', type: 'key_value', fields: ['client_name', 'client_dob', 'client_age', 'client_gender', 'client_address', 'client_phone', 'client_email', 'client_tobacco_status', 'client_health_class'] },
      { title: 'Product Details', type: 'key_value', fields: ['product_name', 'product_type', 'coverage_amount', 'term_length', 'issue_date', 'maturity_date'] },
      { title: 'Premium Breakdown', type: 'table', rows: ['base_premium', 'riders', 'policy_fee', 'discount', 'total_premium'] },
      { title: 'Riders & Add-ons', type: 'table', rows: ['rider_name', 'rider_coverage', 'rider_premium'] },
      { title: 'Payment Options', type: 'table', rows: ['frequency', 'amount', 'annual_total'] },
      { title: 'Important Disclosures', type: 'disclaimer', content: 'regulatory_disclaimers' },
      { title: 'Acceptance', type: 'signature', fields: ['client_signature', 'agent_signature'] },
    ],
    variables: [
      'company_name', 'company_address', 'company_phone', 'company_license',
      'agent_name', 'agent_license', 'agent_phone', 'agent_email', 'agent_office',
      'client_name', 'client_dob', 'client_age', 'client_gender', 'client_address',
      'client_phone', 'client_email', 'client_tobacco_status', 'client_health_class',
      'product_name', 'product_type', 'coverage_amount', 'term_length',
      'base_premium', 'riders', 'policy_fee', 'total_premium',
      'payment_frequency', 'quote_number', 'quote_date', 'valid_until',
    ],
    styling: {
      primaryColor: '#1e3a8a',
      accentColor: '#2563eb',
      fontFamily: 'Segoe UI, Roboto, sans-serif',
      logoPlacement: 'top-left',
    },
  },

  POLICY_ILLUSTRATION: {
    id: 'POLICY_ILLUSTRATION',
    name: 'Policy Illustration',
    description: 'Year-by-year illustration showing premiums paid, cash surrender values, death benefit, and account values for permanent life insurance products.',
    category: 'sales',
    sections: [
      { title: 'Company Header', type: 'header', fields: ['company_name'] },
      { title: 'Illustration Summary', type: 'key_value', fields: ['product_name', 'face_amount', 'planned_premium', 'interest_rate', 'client_name', 'client_age'] },
      { title: 'Guaranteed Values', type: 'table', rows: ['year', 'age', 'annual_premium', 'cumulative_premium', 'cash_value', 'surrender_value', 'death_benefit'] },
      { title: 'Non-Guaranteed Projected Values', type: 'table', rows: ['year', 'age', 'annual_premium', 'projected_cash_value', 'projected_surrender_value', 'projected_death_benefit'] },
      { title: 'Key Milestones', type: 'key_value', fields: ['breakeven_year', 'cash_value_at_65', 'death_benefit_at_65'] },
      { title: 'Assumptions & Disclaimers', type: 'disclaimer', content: 'illustration_disclaimers' },
    ],
    variables: [
      'company_name', 'product_name', 'face_amount', 'planned_premium',
      'interest_rate', 'client_name', 'client_age', 'client_gender',
      'illustration_years', 'guaranteed_values', 'projected_values',
    ],
    styling: {
      primaryColor: '#1e3a8a',
      accentColor: '#059669',
      fontFamily: 'Segoe UI, Roboto, sans-serif',
      logoPlacement: 'top-left',
    },
  },

  APPLICATION_FORM: {
    id: 'APPLICATION_FORM',
    name: 'Insurance Application Form',
    description: 'Pre-filled insurance application with personal information, medical history, beneficiary designations, and payment authorization.',
    category: 'application',
    sections: [
      { title: 'Company Header', type: 'header', fields: ['company_name'] },
      { title: 'Applicant Information', type: 'key_value', fields: ['full_name', 'dob', 'ssn_last4', 'gender', 'marital_status', 'address', 'phone', 'email', 'occupation', 'employer', 'income'] },
      { title: 'Coverage Requested', type: 'key_value', fields: ['product_name', 'coverage_amount', 'term_length', 'premium_mode'] },
      { title: 'Medical History', type: 'checklist', fields: ['heart_disease', 'cancer', 'diabetes', 'respiratory', 'mental_health', 'hospitalization', 'medication', 'tobacco', 'alcohol', 'hazardous_activities'] },
      { title: 'Physician Information', type: 'key_value', fields: ['physician_name', 'physician_phone', 'physician_address', 'last_exam_date'] },
      { title: 'Beneficiary Designation', type: 'table', rows: ['beneficiary_name', 'relationship', 'dob', 'ssn_last4', 'percentage'] },
      { title: 'Contingent Beneficiary', type: 'table', rows: ['beneficiary_name', 'relationship', 'percentage'] },
      { title: 'Existing Insurance', type: 'checklist', fields: ['has_existing_insurance', 'will_replace_existing', 'existing_company', 'existing_policy_number', 'existing_face_amount'] },
      { title: 'Payment Authorization', type: 'key_value', fields: ['payment_method', 'bank_name', 'routing_last4', 'account_last4', 'payment_frequency'] },
      { title: 'Declarations & Signatures', type: 'signature', fields: ['applicant_signature', 'agent_signature', 'witness_signature'] },
    ],
    variables: [
      'full_name', 'dob', 'ssn_last4', 'gender', 'marital_status',
      'address', 'phone', 'email', 'occupation', 'employer', 'income',
      'product_name', 'coverage_amount', 'term_length', 'premium_mode',
      'medical_history', 'beneficiaries', 'contingent_beneficiaries',
      'payment_method', 'bank_name', 'payment_frequency',
    ],
    styling: {
      primaryColor: '#1e3a8a',
      accentColor: '#6366f1',
      fontFamily: 'Segoe UI, Roboto, sans-serif',
      logoPlacement: 'top-center',
    },
  },

  APPLICATION_REPORT: {
    id: 'APPLICATION_REPORT',
    name: 'Application Report',
    description: 'Comprehensive report of a submitted insurance application with applicant details, product information, underwriting status, compliance readiness, and document checklist.',
    category: 'application',
    sections: [
      { title: 'Company Header', type: 'header', fields: ['company_name'] },
      { title: 'Application Summary', type: 'key_value', fields: ['app_number', 'status', 'submitted_at', 'product_type', 'product_name'] },
      { title: 'Applicant Information', type: 'key_value', fields: ['applicant_name', 'email', 'phone', 'age', 'gender', 'dob', 'is_smoker', 'health_class', 'height_in', 'weight_lbs'] },
      { title: 'Coverage Details', type: 'key_value', fields: ['coverage_amount', 'premium_amount', 'term_years', 'payment_frequency', 'carrier_name'] },
      { title: 'Agent Information', type: 'key_value', fields: ['agent_name', 'agent_email'] },
      { title: 'Underwriting Status', type: 'key_value', fields: ['uw_case_number', 'uw_status', 'risk_class', 'uw_requirements'] },
      { title: 'Policy Information', type: 'key_value', fields: ['policy_number', 'policy_status', 'effective_date'] },
      { title: 'Notes', type: 'text', content: 'notes' },
      { title: 'Disclaimers', type: 'disclaimer', content: 'application_report_disclaimers' },
    ],
    variables: [
      'company_name', 'app_number', 'status', 'submitted_at',
      'applicant_name', 'email', 'phone', 'age', 'gender', 'dob',
      'is_smoker', 'health_class', 'height_in', 'weight_lbs',
      'product_type', 'product_name', 'coverage_amount', 'premium_amount',
      'term_years', 'payment_frequency', 'carrier_name',
      'agent_name', 'agent_email',
      'uw_case_number', 'uw_status', 'risk_class', 'uw_requirements',
      'policy_number', 'policy_status', 'effective_date',
      'notes',
    ],
    styling: {
      primaryColor: '#1e3a8a',
      accentColor: '#7c3aed',
      fontFamily: 'Segoe UI, Roboto, sans-serif',
      logoPlacement: 'top-left',
    },
  },

  COVERAGE_COMPARISON: {
    id: 'COVERAGE_COMPARISON',
    name: 'Coverage Comparison Report',
    description: 'Side-by-side comparison of life insurance products including term, whole life, and universal life with premiums, features, and recommendations.',
    category: 'sales',
    sections: [
      { title: 'Company Header', type: 'header', fields: ['company_name'] },
      { title: 'Client Profile', type: 'key_value', fields: ['client_name', 'client_age', 'health_class', 'tobacco_status'] },
      { title: 'Product Comparison Matrix', type: 'table', rows: ['feature', 'product_1', 'product_2', 'product_3'] },
      { title: 'Premium Comparison', type: 'table', rows: ['frequency', 'product_1_premium', 'product_2_premium', 'product_3_premium'] },
      { title: 'Feature Analysis', type: 'text', content: 'feature_analysis' },
      { title: 'Recommendation', type: 'text', content: 'recommendation' },
      { title: 'Disclaimers', type: 'disclaimer', content: 'comparison_disclaimers' },
    ],
    variables: [
      'company_name', 'client_name', 'client_age', 'health_class', 'tobacco_status',
      'quotes', 'recommendation', 'agent_name',
    ],
    styling: {
      primaryColor: '#1e3a8a',
      accentColor: '#0891b2',
      fontFamily: 'Segoe UI, Roboto, sans-serif',
      logoPlacement: 'top-left',
    },
  },

  CLAIMS_FORM: {
    id: 'CLAIMS_FORM',
    name: 'Life Insurance Claims Form',
    description: 'Claims filing form with deceased policyholder information, beneficiary claimant information, cause of death, and required documents checklist.',
    category: 'claims',
    sections: [
      { title: 'Company Header', type: 'header', fields: ['company_name'] },
      { title: 'Claim Information', type: 'key_value', fields: ['claim_number', 'date_filed', 'policy_number'] },
      { title: 'Deceased Policyholder Information', type: 'key_value', fields: ['deceased_name', 'deceased_dob', 'date_of_death', 'place_of_death', 'cause_of_death', 'ssn_last4'] },
      { title: 'Beneficiary / Claimant Information', type: 'key_value', fields: ['claimant_name', 'relationship', 'claimant_address', 'claimant_phone', 'claimant_email', 'claimant_ssn_last4'] },
      { title: 'Policy Details', type: 'key_value', fields: ['policy_number', 'face_amount', 'issue_date', 'last_premium_paid'] },
      { title: 'Required Documents Checklist', type: 'checklist', fields: ['certified_death_certificate', 'claimant_id', 'original_policy', 'completed_claim_form', 'autopsy_report', 'police_report', 'attending_physician_statement', 'beneficiary_designation_change'] },
      { title: 'Payment Election', type: 'key_value', fields: ['payment_method', 'lump_sum_or_installment', 'bank_info'] },
      { title: 'Fraud Warning', type: 'disclaimer', content: 'fraud_warning' },
      { title: 'Claimant Certification', type: 'signature', fields: ['claimant_signature', 'witness_signature'] },
    ],
    variables: [
      'claim_number', 'policy_number', 'deceased_name', 'deceased_dob',
      'date_of_death', 'cause_of_death', 'claimant_name', 'relationship',
      'claimant_address', 'claimant_phone', 'face_amount',
    ],
    styling: {
      primaryColor: '#1e3a8a',
      accentColor: '#dc2626',
      fontFamily: 'Segoe UI, Roboto, sans-serif',
      logoPlacement: 'top-left',
    },
  },

  POLICY_SCHEDULE: {
    id: 'POLICY_SCHEDULE',
    name: 'Policy Schedule',
    description: 'Official policy schedule page summarizing coverage details, premium schedule, riders, beneficiaries, and policy provisions.',
    category: 'policy',
    sections: [
      { title: 'Company Header', type: 'header', fields: ['company_name', 'company_address'] },
      { title: 'Policy Summary', type: 'key_value', fields: ['policy_number', 'product_name', 'issue_date', 'effective_date', 'policy_status'] },
      { title: 'Insured Information', type: 'key_value', fields: ['insured_name', 'insured_dob', 'insured_age', 'insured_gender', 'risk_class'] },
      { title: 'Coverage Details', type: 'key_value', fields: ['face_amount', 'coverage_type', 'term_length', 'maturity_date'] },
      { title: 'Premium Schedule', type: 'table', rows: ['frequency', 'premium_amount', 'next_due_date'] },
      { title: 'Riders & Benefits', type: 'table', rows: ['rider_name', 'coverage_amount', 'premium', 'effective_date'] },
      { title: 'Beneficiary Designation', type: 'table', rows: ['name', 'relationship', 'percentage', 'type'] },
      { title: 'Policy Owner', type: 'key_value', fields: ['owner_name', 'owner_address'] },
      { title: 'Important Provisions', type: 'text', content: 'policy_provisions' },
      { title: 'Regulatory Notices', type: 'disclaimer', content: 'policy_disclaimers' },
    ],
    variables: [
      'company_name', 'policy_number', 'product_name', 'issue_date',
      'insured_name', 'insured_dob', 'face_amount', 'coverage_type',
      'term_length', 'premium_amount', 'premium_frequency', 'riders',
      'beneficiaries', 'owner_name',
    ],
    styling: {
      primaryColor: '#1e3a8a',
      accentColor: '#2563eb',
      fontFamily: 'Segoe UI, Roboto, sans-serif',
      logoPlacement: 'top-center',
    },
  },

  ANNUAL_REVIEW: {
    id: 'ANNUAL_REVIEW',
    name: 'Annual Policy Review Report',
    description: 'Comprehensive annual review showing policy performance, premium history, current values, market comparison, and agent recommendations.',
    category: 'service',
    sections: [
      { title: 'Company Header', type: 'header', fields: ['company_name'] },
      { title: 'Review Summary', type: 'key_value', fields: ['review_date', 'review_period', 'policy_number', 'agent_name'] },
      { title: 'Client Information', type: 'key_value', fields: ['client_name', 'client_age', 'original_issue_date', 'years_in_force'] },
      { title: 'Current Policy Values', type: 'key_value', fields: ['face_amount', 'cash_value', 'surrender_value', 'loan_balance', 'net_death_benefit'] },
      { title: 'Premium History', type: 'table', rows: ['year', 'premiums_paid', 'cumulative_paid'] },
      { title: 'Performance Summary', type: 'key_value', fields: ['credited_interest_rate', 'benchmark_rate', 'cash_value_growth', 'year_over_year_change'] },
      { title: 'Market Comparison', type: 'table', rows: ['metric', 'your_policy', 'market_average', 'top_quartile'] },
      { title: 'Coverage Adequacy Assessment', type: 'text', content: 'coverage_assessment' },
      { title: 'Recommendations', type: 'text', content: 'recommendations' },
      { title: 'Disclaimers', type: 'disclaimer', content: 'review_disclaimers' },
    ],
    variables: [
      'company_name', 'review_date', 'policy_number', 'agent_name',
      'client_name', 'client_age', 'face_amount', 'cash_value',
      'surrender_value', 'loan_balance', 'premium_history',
      'credited_interest_rate', 'market_comparison', 'recommendations',
    ],
    styling: {
      primaryColor: '#1e3a8a',
      accentColor: '#7c3aed',
      fontFamily: 'Segoe UI, Roboto, sans-serif',
      logoPlacement: 'top-left',
    },
  },
};


// ═══════════════════════════════════════════════════════════════════════════════
// TEMPLATE ENGINE SERVICE
// ═══════════════════════════════════════════════════════════════════════════════

class TemplateEngineService {
  /** @param {import('@prisma/client').PrismaClient} prisma */
  constructor(prisma) {
    this.db = prisma;
    this.templates = { ...TEMPLATES };
  }

  // ── Template access ───────────────────────────────────────────────────────

  /**
   * Return all available template definitions.
   * @returns {object[]}
   */
  getTemplates() {
    return Object.values(this.templates).map(t => ({
      id: t.id,
      name: t.name,
      description: t.description,
      category: t.category,
      variableCount: t.variables.length,
      sectionCount: t.sections.length,
    }));
  }

  /**
   * Return a single template definition by ID.
   * @param {string} templateId
   * @returns {object|null}
   */
  getTemplate(templateId) {
    const t = this.templates[templateId];
    if (!t) return null;
    return { ...t };
  }

  // ── Generic render ────────────────────────────────────────────────────────

  /**
   * Merge data into a template and produce a full HTML document string.
   * @param {string} templateId
   * @param {object} data   Key-value map of merge variables and section data
   * @returns {string}       Complete HTML string suitable for PDF rendering
   */
  renderTemplate(templateId, data) {
    const tpl = this.templates[templateId];
    if (!tpl) {
      throw new Error(`Template "${templateId}" not found. Available: ${Object.keys(this.templates).join(', ')}`);
    }

    switch (templateId) {
      case 'QUOTE_SUMMARY':
        return this.#renderQuoteSummaryHtml(data);
      case 'POLICY_ILLUSTRATION':
        return this.#renderIllustrationHtml(data);
      case 'APPLICATION_FORM':
        return this.#renderApplicationFormHtml(data);
      case 'APPLICATION_REPORT':
        return this.#renderApplicationReportHtml(data);
      case 'COVERAGE_COMPARISON':
        return this.#renderComparisonHtml(data);
      case 'CLAIMS_FORM':
        return this.#renderClaimsFormHtml(data);
      case 'POLICY_SCHEDULE':
        return this.#renderPolicyScheduleHtml(data);
      case 'ANNUAL_REVIEW':
        return this.#renderAnnualReviewHtml(data);
      default:
        throw new Error(`No renderer implemented for template "${templateId}".`);
    }
  }

  // ── Convenience methods ───────────────────────────────────────────────────

  /**
   * Render a quote summary from calculation results.
   * @param {object} calculationResult  Premium calculation engine output
   * @param {object} clientInfo         Client/applicant data
   * @param {object} agentInfo          Agent/broker data
   * @returns {string} HTML
   */
  renderQuoteSummary(calculationResult, clientInfo, agentInfo) {
    const c = calculationResult || {};
    const cl = clientInfo || {};
    const ag = agentInfo || {};

    return this.renderTemplate('QUOTE_SUMMARY', {
      company_name: ag.company_name || null,
      company_address: ag.company_address || null,
      company_phone: ag.company_phone || null,
      company_license: ag.company_license || null,
      agent_name: ag.name || ag.agent_name || null,
      agent_license: ag.license_number || ag.agent_license || null,
      agent_phone: ag.phone || ag.agent_phone || null,
      agent_email: ag.email || ag.agent_email || null,
      agent_office: ag.office || ag.agent_office || null,
      client_name: cl.name || `${cl.first_name || ''} ${cl.last_name || ''}`.trim() || null,
      client_dob: cl.dob || cl.date_of_birth || null,
      client_age: cl.age || null,
      client_gender: cl.gender || null,
      client_address: cl.address || null,
      client_phone: cl.phone || null,
      client_email: cl.email || null,
      client_tobacco_status: cl.tobacco_status || cl.smoker_status || null,
      client_health_class: cl.health_class || cl.risk_class || null,
      product_name: c.product_name || null,
      product_type: c.product_type || null,
      coverage_amount: c.coverage_amount || c.face_amount || null,
      term_length: c.term_length || c.term_years || null,
      issue_date: c.issue_date || null,
      maturity_date: c.maturity_date || null,
      base_premium: c.base_premium || null,
      riders: c.riders || [],
      policy_fee: c.policy_fee || null,
      discount: c.discount || null,
      total_premium: c.total_premium || c.premium || null,
      payment_options: c.payment_options || null,
      payment_frequency: c.payment_frequency || 'Annual',
      quote_number: c.quote_number || null,
      quote_date: c.quote_date || new Date(),
      valid_until: c.valid_until || null,
    });
  }

  /**
   * Render a policy illustration from calculation results.
   * @param {object} calculationResult  Illustration engine output
   * @param {object} clientInfo         Client data
   * @returns {string} HTML
   */
  renderIllustration(calculationResult, clientInfo) {
    const c = calculationResult || {};
    const cl = clientInfo || {};

    return this.renderTemplate('POLICY_ILLUSTRATION', {
      company_name: c.company_name || null,
      product_name: c.product_name || null,
      face_amount: c.face_amount || c.coverage_amount || null,
      planned_premium: c.planned_premium || c.annual_premium || null,
      interest_rate: c.interest_rate || c.credited_rate || null,
      client_name: cl.name || `${cl.first_name || ''} ${cl.last_name || ''}`.trim() || null,
      client_age: cl.age || null,
      client_gender: cl.gender || null,
      client_dob: cl.dob || cl.date_of_birth || null,
      guaranteed_values: c.guaranteed_values || c.guaranteed || [],
      projected_values: c.projected_values || c.projected || [],
      illustration_years: c.illustration_years || c.years || 30,
      breakeven_year: c.breakeven_year || null,
      cash_value_at_65: c.cash_value_at_65 || null,
      death_benefit_at_65: c.death_benefit_at_65 || null,
    });
  }

  /**
   * Render a pre-filled application form.
   * @param {object} clientInfo  Client/applicant data
   * @param {object} quoteData   Quote data with coverage info
   * @returns {string} HTML
   */
  renderApplicationForm(clientInfo, quoteData) {
    const cl = clientInfo || {};
    const q = quoteData || {};

    return this.renderTemplate('APPLICATION_FORM', {
      company_name: q.company_name || null,
      full_name: cl.name || `${cl.first_name || ''} ${cl.last_name || ''}`.trim() || null,
      first_name: cl.first_name || null,
      last_name: cl.last_name || null,
      dob: cl.dob || cl.date_of_birth || null,
      ssn_last4: cl.ssn_last4 || null,
      gender: cl.gender || null,
      marital_status: cl.marital_status || null,
      address: cl.address || null,
      phone: cl.phone || null,
      email: cl.email || null,
      occupation: cl.occupation || null,
      employer: cl.employer || null,
      income: cl.income || cl.annual_income || null,
      product_name: q.product_name || null,
      coverage_amount: q.coverage_amount || q.face_amount || null,
      term_length: q.term_length || q.term_years || null,
      premium_mode: q.payment_frequency || q.premium_mode || 'Annual',
      medical_history: cl.medical_history || {},
      physician_name: cl.physician_name || null,
      physician_phone: cl.physician_phone || null,
      physician_address: cl.physician_address || null,
      last_exam_date: cl.last_exam_date || null,
      beneficiaries: cl.beneficiaries || q.beneficiaries || [],
      contingent_beneficiaries: cl.contingent_beneficiaries || q.contingent_beneficiaries || [],
      has_existing_insurance: cl.has_existing_insurance || null,
      will_replace_existing: cl.will_replace_existing || null,
      existing_company: cl.existing_company || null,
      existing_policy_number: cl.existing_policy_number || null,
      existing_face_amount: cl.existing_face_amount || null,
      payment_method: q.payment_method || null,
      bank_name: q.bank_name || null,
      routing_last4: q.routing_last4 || null,
      account_last4: q.account_last4 || null,
      payment_frequency: q.payment_frequency || 'Annual',
    });
  }

  /**
   * Render a filled-in application report from full application data.
   * @param {object} application  Full application object (with relations)
   * @returns {string} HTML
   */
  renderApplicationReport(application) {
    const app = application || {};
    const contact = app.contact || {};
    const agent = app.agent || {};
    const carrier = app.carrier || {};
    const uw = app.underwriting_case || {};
    const policy = app.policy || {};
    const requirements = uw.requirements || [];

    return this.renderTemplate('APPLICATION_REPORT', {
      company_name: carrier.name || null,
      app_number: app.app_number || null,
      status: app.status || null,
      submitted_at: app.submitted_at || app.created_at || null,
      applicant_name: `${contact.first_name || ''} ${contact.last_name || ''}`.trim() || null,
      email: contact.email || null,
      phone: contact.phone || null,
      age: app.age || null,
      gender: app.gender || null,
      dob: app.date_of_birth || null,
      is_smoker: app.is_smoker,
      health_class: app.health_class || null,
      height_in: app.height_in || null,
      weight_lbs: app.weight_lbs || null,
      product_type: app.product_type || null,
      product_name: app.product_name || carrier.name || null,
      coverage_amount: app.coverage_amount || null,
      premium_amount: app.premium_amount || null,
      term_years: app.term_years || null,
      payment_frequency: app.payment_frequency || null,
      carrier_name: carrier.name || null,
      agent_name: agent.employee_name || null,
      agent_email: agent.email || null,
      uw_case_number: uw.case_number || null,
      uw_status: uw.status || null,
      risk_class: uw.risk_class || null,
      uw_requirements: requirements,
      policy_number: policy.policy_number || null,
      policy_status: policy.status || null,
      effective_date: policy.effective_date || null,
      notes: app.notes || null,
    });
  }

  /**
   * Render a side-by-side product comparison report.
   * @param {object[]} quotes       Array of quote/calculation results to compare
   * @param {object}   clientInfo   Client data
   * @returns {string} HTML
   */
  renderComparisonReport(quotes, clientInfo) {
    const cl = clientInfo || {};
    const quoteList = Array.isArray(quotes) ? quotes : [];

    return this.renderTemplate('COVERAGE_COMPARISON', {
      company_name: cl.company_name || (quoteList[0] || {}).company_name || null,
      client_name: cl.name || `${cl.first_name || ''} ${cl.last_name || ''}`.trim() || null,
      client_age: cl.age || null,
      health_class: cl.health_class || cl.risk_class || null,
      tobacco_status: cl.tobacco_status || cl.smoker_status || null,
      quotes: quoteList,
      agent_name: cl.agent_name || null,
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PRIVATE RENDERERS
  // ═══════════════════════════════════════════════════════════════════════════

  // ── QUOTE SUMMARY ─────────────────────────────────────────────────────────

  #renderQuoteSummaryHtml(d) {
    const quoteRef = d.quote_number || `QS-${Date.now()}`;
    const riders = Array.isArray(d.riders) ? d.riders : [];
    const paymentOptions = Array.isArray(d.payment_options) ? d.payment_options : this.#derivePaymentOptions(d.total_premium);

    let body = '<div class="page">';

    // Header
    body += headerBar('Insurance Quote Summary', `Quote #${safe(quoteRef)} | Prepared: ${dateStr(d.quote_date)}`, d.company_name);

    // Agent and Client info side by side
    body += '<div class="two-col">';
    body += '<div>';
    body += kvSection('Agent Information', [
      ['Agent Name', safe(d.agent_name)],
      ['License #', safe(d.agent_license)],
      ['Phone', safe(d.agent_phone)],
      ['Email', safe(d.agent_email)],
      ['Office', safe(d.agent_office)],
    ]);
    body += '</div><div>';
    body += kvSection('Client Information', [
      ['Name', safe(d.client_name)],
      ['Date of Birth', dateStr(d.client_dob)],
      ['Age', safe(d.client_age)],
      ['Gender', safe(d.client_gender)],
      ['Tobacco Status', safe(d.client_tobacco_status)],
      ['Health Class', safe(d.client_health_class)],
    ]);
    body += '</div></div>';

    // Product details
    body += kvSection('Product Details', [
      ['Product', safe(d.product_name)],
      ['Product Type', safe(d.product_type)],
      ['Coverage Amount', currency(d.coverage_amount)],
      ['Term Length', d.term_length ? `${d.term_length} Years` : 'N/A'],
      ['Proposed Issue Date', dateStr(d.issue_date)],
      ['Maturity Date', dateStr(d.maturity_date)],
    ]);

    // Premium breakdown
    body += '<h2>Premium Breakdown</h2>';
    body += '<table>';
    body += '<tr><th>Item</th><th class="text-right">Amount</th></tr>';
    body += `<tr><td>Base Premium</td><td class="text-right">${currency(d.base_premium)}</td></tr>`;
    for (const r of riders) {
      body += `<tr><td>${safe(r.name || r.rider_name)} (Rider)</td><td class="text-right">${currency(r.premium || r.rider_premium)}</td></tr>`;
    }
    if (d.policy_fee) {
      body += `<tr><td>Policy Fee</td><td class="text-right">${currency(d.policy_fee)}</td></tr>`;
    }
    if (d.discount) {
      body += `<tr><td>Discount</td><td class="text-right">-${currency(d.discount)}</td></tr>`;
    }
    body += `<tr class="total-row"><td>Total Annual Premium</td><td class="text-right">${currency(d.total_premium)}</td></tr>`;
    body += '</table>';

    // Riders detail
    if (riders.length > 0) {
      body += '<h2>Riders &amp; Add-ons</h2>';
      body += '<table>';
      body += '<tr><th>Rider</th><th>Coverage</th><th class="text-right">Premium</th></tr>';
      for (const r of riders) {
        body += `<tr>
          <td>${safe(r.name || r.rider_name)}</td>
          <td>${r.coverage ? currency(r.coverage) : safe(r.description)}</td>
          <td class="text-right">${currency(r.premium || r.rider_premium)}</td>
        </tr>`;
      }
      body += '</table>';
    }

    // Payment options
    body += '<h2>Payment Options</h2>';
    body += '<table>';
    body += '<tr><th>Frequency</th><th class="text-right">Payment Amount</th><th class="text-right">Annual Total</th></tr>';
    for (const po of paymentOptions) {
      body += `<tr>
        <td>${safe(po.frequency)}</td>
        <td class="text-right">${currency(po.amount)}</td>
        <td class="text-right">${currency(po.annual_total)}</td>
      </tr>`;
    }
    body += '</table>';

    // Valid until notice
    if (d.valid_until) {
      body += `<div class="highlight"><strong>Quote Valid Until:</strong> ${dateStr(d.valid_until)}. Rates are subject to change after this date and may require re-underwriting.</div>`;
    }

    // Signatures
    body += signatureSection([
      { label: 'Client / Applicant Signature' },
      { label: 'Agent / Producer Signature' },
    ]);

    // Disclaimers
    body += disclaimerBlock([
      'This quote is for illustrative purposes only and does not constitute a contract or guarantee of coverage. Actual premiums may vary based on underwriting results.',
      'Coverage is subject to the terms, conditions, and exclusions of the policy. A complete copy of the policy form is available upon request.',
      'Premiums quoted assume the health classification shown above. Final premiums will be determined upon completion of the underwriting process, which may include a medical examination.',
      'All guarantees are subject to the claims-paying ability of the issuing insurance company.',
      'This document does not constitute legal, tax, or financial advice. Consult with a qualified professional for advice specific to your situation.',
    ]);

    body += footerBlock('Insurance Quote Summary', quoteRef);
    body += '</div>';

    return wrapDocument('Insurance Quote Summary', body);
  }

  // ── POLICY ILLUSTRATION ───────────────────────────────────────────────────

  #renderIllustrationHtml(d) {
    const guaranteed = Array.isArray(d.guaranteed_values) ? d.guaranteed_values : [];
    const projected = Array.isArray(d.projected_values) ? d.projected_values : [];
    const years = d.illustration_years || 30;

    let body = '<div class="page">';

    body += headerBar('Policy Illustration', `${safe(d.product_name)} | Prepared: ${dateStr(new Date())}`, d.company_name);

    body += '<div class="highlight"><strong>Important:</strong> This illustration is not a contract. It shows how the policy <em>may</em> perform based on current assumptions. Actual results will vary.</div>';

    // Summary
    body += '<div class="two-col">';
    body += '<div>';
    body += kvSection('Policy Details', [
      ['Product', safe(d.product_name)],
      ['Face Amount', currency(d.face_amount)],
      ['Planned Annual Premium', currency(d.planned_premium)],
      ['Assumed Interest Rate', d.interest_rate != null ? pct(d.interest_rate) : 'N/A'],
    ]);
    body += '</div><div>';
    body += kvSection('Insured', [
      ['Name', safe(d.client_name)],
      ['Issue Age', safe(d.client_age)],
      ['Gender', safe(d.client_gender)],
      ['Date of Birth', dateStr(d.client_dob)],
    ]);
    body += '</div></div>';

    // Guaranteed values table
    body += '<h2>Guaranteed Values</h2>';
    body += '<table>';
    body += '<tr><th>Year</th><th>Age</th><th class="text-right">Annual Premium</th><th class="text-right">Cumulative Premiums</th><th class="text-right">Cash Value</th><th class="text-right">Surrender Value</th><th class="text-right">Death Benefit</th></tr>';

    if (guaranteed.length > 0) {
      for (const row of guaranteed) {
        body += `<tr>
          <td>${safe(row.year)}</td>
          <td>${safe(row.age)}</td>
          <td class="text-right">${currency(row.annual_premium)}</td>
          <td class="text-right">${currency(row.cumulative_premium)}</td>
          <td class="text-right">${currency(row.cash_value)}</td>
          <td class="text-right">${currency(row.surrender_value)}</td>
          <td class="text-right">${currency(row.death_benefit)}</td>
        </tr>`;
      }
    } else {
      // Generate placeholder rows based on years
      const clientAge = parseInt(d.client_age) || 35;
      const premium = parseFloat(d.planned_premium) || 0;
      const face = parseFloat(d.face_amount) || 0;
      for (let y = 1; y <= years; y++) {
        const cumPremium = premium * y;
        const cashVal = cumPremium * 0.3 * Math.min(y / 10, 1) + (y > 5 ? cumPremium * 0.15 : 0);
        const surrenderVal = Math.max(0, cashVal - (y < 10 ? cumPremium * 0.05 * (10 - y) / 10 : 0));
        body += `<tr>
          <td>${y}</td>
          <td>${clientAge + y}</td>
          <td class="text-right">${currency(premium)}</td>
          <td class="text-right">${currency(cumPremium)}</td>
          <td class="text-right">${currency(cashVal)}</td>
          <td class="text-right">${currency(surrenderVal)}</td>
          <td class="text-right">${currency(face)}</td>
        </tr>`;
      }
    }
    body += '</table>';

    body += '<div class="page-break"></div>';
    body += '</div><div class="page">';

    // Non-guaranteed projected values
    body += headerBar('Policy Illustration (continued)', 'Non-Guaranteed Projected Values', d.company_name);

    body += '<h2>Non-Guaranteed Projected Values</h2>';
    body += '<table>';
    body += '<tr><th>Year</th><th>Age</th><th class="text-right">Annual Premium</th><th class="text-right">Projected Cash Value</th><th class="text-right">Projected Surrender Value</th><th class="text-right">Projected Death Benefit</th></tr>';

    if (projected.length > 0) {
      for (const row of projected) {
        body += `<tr>
          <td>${safe(row.year)}</td>
          <td>${safe(row.age)}</td>
          <td class="text-right">${currency(row.annual_premium)}</td>
          <td class="text-right">${currency(row.projected_cash_value || row.cash_value)}</td>
          <td class="text-right">${currency(row.projected_surrender_value || row.surrender_value)}</td>
          <td class="text-right">${currency(row.projected_death_benefit || row.death_benefit)}</td>
        </tr>`;
      }
    } else {
      const clientAge = parseInt(d.client_age) || 35;
      const premium = parseFloat(d.planned_premium) || 0;
      const face = parseFloat(d.face_amount) || 0;
      const rate = parseFloat(d.interest_rate) || 5;
      for (let y = 1; y <= years; y++) {
        const cumPremium = premium * y;
        const growth = Math.pow(1 + rate / 100, y);
        const projCash = cumPremium * 0.4 * Math.min(y / 8, 1) * growth * 0.6;
        const projSurrender = Math.max(0, projCash - (y < 8 ? projCash * 0.04 * (8 - y) / 8 : 0));
        const projDeath = Math.max(face, face + projCash * 0.1);
        body += `<tr>
          <td>${y}</td>
          <td>${clientAge + y}</td>
          <td class="text-right">${currency(premium)}</td>
          <td class="text-right">${currency(projCash)}</td>
          <td class="text-right">${currency(projSurrender)}</td>
          <td class="text-right">${currency(projDeath)}</td>
        </tr>`;
      }
    }
    body += '</table>';

    // Key milestones
    body += kvSection('Key Milestones', [
      ['Break-Even Year', d.breakeven_year != null ? `Year ${d.breakeven_year}` : 'See illustration values'],
      ['Cash Value at Age 65', d.cash_value_at_65 != null ? currency(d.cash_value_at_65) : 'See table above'],
      ['Death Benefit at Age 65', d.death_benefit_at_65 != null ? currency(d.death_benefit_at_65) : 'See table above'],
    ]);

    // Disclaimers
    body += disclaimerBlock([
      'IMPORTANT: This illustration is not a policy contract. It is provided to help you understand how the policy may perform under the assumptions shown.',
      'The \"Guaranteed\" column reflects values the company contractually guarantees. The \"Non-Guaranteed\" column reflects values based on the current interest crediting rate, which is not guaranteed and may change.',
      'Dividends, if applicable, are not guaranteed and are determined annually by the board of directors based on company performance.',
      'Policy loans and withdrawals will reduce the cash value and death benefit and may cause the policy to lapse if insufficient value remains to cover policy charges.',
      'This illustration assumes premiums are paid on time each year. Failure to pay premiums when due may cause the policy to lapse.',
      'Actual policy values will depend on the actual interest rates credited, cost of insurance charges, and any policy loans or withdrawals.',
      'This illustration complies with the National Association of Insurance Commissioners (NAIC) Life Insurance Illustration Model Regulation.',
    ]);

    body += footerBlock('Policy Illustration', d.policy_number || null);
    body += '</div>';

    return wrapDocument('Policy Illustration', body);
  }

  // ── APPLICATION FORM ──────────────────────────────────────────────────────

  #renderApplicationFormHtml(d) {
    const beneficiaries = Array.isArray(d.beneficiaries) ? d.beneficiaries : [];
    const contingent = Array.isArray(d.contingent_beneficiaries) ? d.contingent_beneficiaries : [];
    const med = d.medical_history || {};

    let body = '<div class="page">';

    body += headerBar('Life Insurance Application', `Application Date: ${dateStr(new Date())}`, d.company_name);

    body += '<div class="warning"><strong>Notice:</strong> Any person who knowingly presents a false or misleading statement in an application for insurance may be committing insurance fraud, which is a crime and may subject such person to criminal and civil penalties.</div>';

    // Section 1: Personal info
    body += '<h2>Section 1: Applicant Information</h2>';
    body += '<div class="two-col"><div>';
    body += kvSection(null, [
      ['Full Legal Name', safe(d.full_name)],
      ['Date of Birth', dateStr(d.dob)],
      ['SSN (Last 4)', d.ssn_last4 ? `***-**-${safe(d.ssn_last4)}` : '___-__-____'],
      ['Gender', safe(d.gender)],
      ['Marital Status', safe(d.marital_status)],
    ]);
    body += '</div><div>';
    body += kvSection(null, [
      ['Address', safe(d.address)],
      ['Phone', safe(d.phone)],
      ['Email', safe(d.email)],
      ['Occupation', safe(d.occupation)],
      ['Employer', safe(d.employer)],
      ['Annual Income', d.income ? currency(d.income) : 'N/A'],
    ]);
    body += '</div></div>';

    // Section 2: Coverage requested
    body += kvSection('Section 2: Coverage Requested', [
      ['Product', safe(d.product_name)],
      ['Coverage Amount', currency(d.coverage_amount)],
      ['Term Length', d.term_length ? `${d.term_length} Years` : 'N/A'],
      ['Premium Mode', safe(d.premium_mode)],
    ]);

    // Section 3: Medical history
    body += '<h2>Section 3: Medical History</h2>';
    body += '<p style="margin-bottom:10px;font-size:10pt;color:#475569;">Please answer the following questions honestly and completely. Failure to disclose material information may result in denial of claims or rescission of the policy.</p>';

    const medQuestions = [
      { key: 'heart_disease', label: 'Have you ever been diagnosed with or treated for any heart or circulatory condition (e.g., heart attack, stroke, high blood pressure, coronary artery disease)?' },
      { key: 'cancer', label: 'Have you ever been diagnosed with or treated for cancer, tumor, or abnormal growth of any kind?' },
      { key: 'diabetes', label: 'Have you ever been diagnosed with or treated for diabetes or elevated blood sugar?' },
      { key: 'respiratory', label: 'Have you ever been diagnosed with or treated for any respiratory condition (e.g., asthma, COPD, emphysema, sleep apnea)?' },
      { key: 'mental_health', label: 'Have you ever been diagnosed with or treated for any mental health condition (e.g., depression, anxiety, bipolar disorder)?' },
      { key: 'hospitalization', label: 'Have you been hospitalized or had surgery in the past 5 years?' },
      { key: 'medication', label: 'Are you currently taking any prescription medications?' },
      { key: 'tobacco', label: 'Have you used any tobacco or nicotine products in the past 12 months (cigarettes, cigars, vaping, chewing tobacco, patches, gum)?' },
      { key: 'alcohol', label: 'Do you consume more than 14 alcoholic drinks per week, or have you ever been treated for alcohol or substance abuse?' },
      { key: 'hazardous_activities', label: 'Do you participate in any hazardous activities (e.g., skydiving, scuba diving, rock climbing, racing, private aviation)?' },
    ];

    body += '<table>';
    body += '<tr><th style="width:60%">Question</th><th class="text-center" style="width:15%">Yes</th><th class="text-center" style="width:15%">No</th><th style="width:10%">Details</th></tr>';
    for (const q of medQuestions) {
      const val = med[q.key];
      const isYes = val === true || val === 'yes';
      const isNo = val === false || val === 'no';
      const yesCheck = isYes ? '&#10003;' : '';
      const noCheck = isNo ? '&#10003;' : '';
      const details = typeof val === 'string' && val !== 'yes' && val !== 'no' ? safe(val) : (med[`${q.key}_details`] ? safe(med[`${q.key}_details`]) : '');
      body += `<tr>
        <td style="font-size:9.5pt;">${q.label}</td>
        <td class="text-center"><span class="checklist-box" style="text-align:center;">${yesCheck}</span></td>
        <td class="text-center"><span class="checklist-box" style="text-align:center;">${noCheck}</span></td>
        <td style="font-size:9pt;">${details}</td>
      </tr>`;
    }
    body += '</table>';

    // Physician info
    body += kvSection('Physician Information', [
      ['Physician Name', safe(d.physician_name)],
      ['Phone', safe(d.physician_phone)],
      ['Address', safe(d.physician_address)],
      ['Date of Last Exam', dateStr(d.last_exam_date)],
    ]);

    body += '<div class="page-break"></div>';
    body += '</div><div class="page">';

    body += headerBar('Life Insurance Application (continued)', 'Beneficiaries, Existing Insurance &amp; Payment', d.company_name);

    // Section 4: Beneficiaries
    body += '<h2>Section 4: Primary Beneficiary Designation</h2>';
    body += '<table>';
    body += '<tr><th>Full Name</th><th>Relationship</th><th>Date of Birth</th><th>SSN (Last 4)</th><th class="text-right">%</th></tr>';
    if (beneficiaries.length > 0) {
      for (const b of beneficiaries) {
        body += `<tr>
          <td>${safe(b.name || b.beneficiary_name)}</td>
          <td>${safe(b.relationship)}</td>
          <td>${dateStr(b.dob || b.date_of_birth)}</td>
          <td>${b.ssn_last4 ? `***-**-${safe(b.ssn_last4)}` : ''}</td>
          <td class="text-right">${b.percentage != null ? b.percentage + '%' : ''}</td>
        </tr>`;
      }
    } else {
      for (let i = 0; i < 3; i++) {
        body += '<tr><td>________________________</td><td>____________</td><td>__________</td><td>___-__-____</td><td class="text-right">____%</td></tr>';
      }
    }
    body += '</table>';

    body += '<h3>Contingent Beneficiary</h3>';
    body += '<table>';
    body += '<tr><th>Full Name</th><th>Relationship</th><th class="text-right">%</th></tr>';
    if (contingent.length > 0) {
      for (const b of contingent) {
        body += `<tr>
          <td>${safe(b.name || b.beneficiary_name)}</td>
          <td>${safe(b.relationship)}</td>
          <td class="text-right">${b.percentage != null ? b.percentage + '%' : ''}</td>
        </tr>`;
      }
    } else {
      for (let i = 0; i < 2; i++) {
        body += '<tr><td>________________________</td><td>____________</td><td class="text-right">____%</td></tr>';
      }
    }
    body += '</table>';

    // Section 5: Existing insurance
    body += '<h2>Section 5: Existing Insurance</h2>';
    body += '<table class="kv-table">';
    body += `<tr><td>Do you currently have any existing life insurance policies?</td><td>${yesNo(d.has_existing_insurance)}</td></tr>`;
    body += `<tr><td>Will this policy replace any existing life insurance?</td><td>${yesNo(d.will_replace_existing)}</td></tr>`;
    body += `<tr><td>Existing Insurance Company</td><td>${safe(d.existing_company)}</td></tr>`;
    body += `<tr><td>Existing Policy Number</td><td>${safe(d.existing_policy_number)}</td></tr>`;
    body += `<tr><td>Existing Face Amount</td><td>${d.existing_face_amount ? currency(d.existing_face_amount) : 'N/A'}</td></tr>`;
    body += '</table>';
    if (d.will_replace_existing === true || d.will_replace_existing === 'yes') {
      body += '<div class="warning"><strong>Replacement Notice:</strong> Because this policy may replace existing coverage, a state-mandated replacement form may be required. Your agent will provide the necessary forms.</div>';
    }

    // Section 6: Payment authorization
    body += kvSection('Section 6: Payment Authorization', [
      ['Payment Method', safe(d.payment_method)],
      ['Bank Name', safe(d.bank_name)],
      ['Routing # (Last 4)', d.routing_last4 ? `****${safe(d.routing_last4)}` : 'N/A'],
      ['Account # (Last 4)', d.account_last4 ? `****${safe(d.account_last4)}` : 'N/A'],
      ['Payment Frequency', safe(d.payment_frequency)],
    ]);

    // Declarations
    body += '<h2>Section 7: Declarations &amp; Authorization</h2>';
    body += '<div style="font-size:9.5pt;color:#374151;line-height:1.7;margin-bottom:16px;">';
    body += '<p style="margin-bottom:8px;">I hereby declare that the information provided in this application is true, correct, and complete to the best of my knowledge and belief. I understand that:</p>';
    body += '<ul style="padding-left:20px;">';
    body += '<li>Any misstatement or omission may result in the denial of a claim or rescission of the policy.</li>';
    body += '<li>The insurance company reserves the right to verify the information provided through medical examinations, medical records, prescription databases, and other investigative means.</li>';
    body += '<li>No insurance coverage will be in effect until the application is approved, the policy is issued, the initial premium is paid, and the policy is delivered while the insured is in the same health condition as described in this application.</li>';
    body += '<li>I authorize any physician, hospital, or other medical provider to release information about my medical history to the insurance company or its representatives for the purpose of evaluating this application.</li>';
    body += '<li>I understand that I have a right to examine the policy for a period of at least 10 days (free-look period) after delivery and may return it for a full refund of premiums paid.</li>';
    body += '</ul></div>';

    body += signatureSection([
      { label: 'Applicant Signature' },
      { label: 'Licensed Agent / Producer' },
      { label: 'Witness' },
    ]);

    body += disclaimerBlock([
      'This application is subject to review and approval by the insurance company underwriting department. Submission of this application does not guarantee coverage.',
      'The applicant should retain a copy of this completed application for their records.',
      'Insurance products are not bank deposits, are not insured by the FDIC or any federal government agency, are not guaranteed by any bank or savings association, and may lose value.',
    ]);

    body += footerBlock('Life Insurance Application', d.application_number || null);
    body += '</div>';

    return wrapDocument('Life Insurance Application', body);
  }

  // ── COVERAGE COMPARISON ───────────────────────────────────────────────────

  #renderComparisonHtml(d) {
    const quotes = Array.isArray(d.quotes) ? d.quotes : [];

    let body = '<div class="page">';

    body += headerBar('Coverage Comparison Report', `Prepared: ${dateStr(new Date())} | Client: ${safe(d.client_name)}`, d.company_name);

    // Client profile
    body += kvSection('Client Profile', [
      ['Name', safe(d.client_name)],
      ['Age', safe(d.client_age)],
      ['Health Classification', safe(d.health_class)],
      ['Tobacco Status', safe(d.tobacco_status)],
    ]);

    if (quotes.length === 0) {
      body += '<div class="highlight">No quotes provided for comparison. Please supply at least two quote results.</div>';
    } else {
      // Product comparison matrix
      const headers = ['Feature', ...quotes.map((q, i) => safe(q.product_name || `Option ${i + 1}`))];
      body += '<h2>Product Comparison</h2>';
      body += '<table>';
      body += '<tr>' + headers.map(h => `<th>${h}</th>`).join('') + '</tr>';

      const features = [
        { label: 'Product Type', key: 'product_type' },
        { label: 'Coverage Amount', key: 'coverage_amount', fmt: currency },
        { label: 'Term Length', key: 'term_length', fmt: v => v ? `${v} Years` : 'Lifetime' },
        { label: 'Annual Premium', key: 'total_premium', fmt: currency },
        { label: 'Monthly Premium', key: 'monthly_premium', fmt: currency, derive: q => (parseFloat(q.total_premium || q.premium || 0) / 12) },
        { label: 'Cash Value Accumulation', key: 'has_cash_value', fmt: yesNo },
        { label: 'Level Premiums', key: 'level_premiums', fmt: yesNo },
        { label: 'Convertible', key: 'convertible', fmt: v => v != null ? yesNo(v) : 'N/A' },
        { label: 'Renewable', key: 'renewable', fmt: v => v != null ? yesNo(v) : 'N/A' },
        { label: 'Waiver of Premium Available', key: 'waiver_of_premium', fmt: v => v != null ? yesNo(v) : 'N/A' },
        { label: 'Accelerated Death Benefit', key: 'accelerated_death_benefit', fmt: v => v != null ? yesNo(v) : 'N/A' },
      ];

      for (const feat of features) {
        body += '<tr>';
        body += `<td style="font-weight:600;">${feat.label}</td>`;
        for (const q of quotes) {
          let val;
          if (feat.derive) {
            val = feat.derive(q);
          } else {
            val = q[feat.key];
          }
          body += `<td>${feat.fmt ? feat.fmt(val) : safe(val)}</td>`;
        }
        body += '</tr>';
      }
      body += '</table>';

      // Premium comparison across frequencies
      body += '<h2>Premium Comparison by Payment Frequency</h2>';
      body += '<table>';
      body += '<tr><th>Frequency</th>' + quotes.map((q, i) => `<th class="text-right">${safe(q.product_name || `Option ${i + 1}`)}</th>`).join('') + '</tr>';

      const frequencies = [
        { label: 'Annual', factor: 1 },
        { label: 'Semi-Annual', factor: 0.52 },
        { label: 'Quarterly', factor: 0.26 },
        { label: 'Monthly', factor: 0.0875 },
      ];

      for (const freq of frequencies) {
        body += '<tr>';
        body += `<td>${freq.label}</td>`;
        for (const q of quotes) {
          const annual = parseFloat(q.total_premium || q.premium || 0);
          const amount = annual * freq.factor;
          body += `<td class="text-right">${currency(amount)}</td>`;
        }
        body += '</tr>';
      }
      // Annual total row
      body += '<tr class="total-row">';
      body += '<td>Annual Total</td>';
      for (const q of quotes) {
        const annual = parseFloat(q.total_premium || q.premium || 0);
        const amounts = frequencies.map(f => annual * f.factor);
        body += `<td class="text-right">${currency(annual)}</td>`;
      }
      body += '</tr>';
      body += '</table>';

      // Cost over time analysis
      body += '<h2>Projected Cost Over Time</h2>';
      body += '<table>';
      body += '<tr><th>Time Period</th>' + quotes.map((q, i) => `<th class="text-right">${safe(q.product_name || `Option ${i + 1}`)}</th>`).join('') + '</tr>';
      const periods = [5, 10, 15, 20, 25, 30];
      for (const yr of periods) {
        body += '<tr>';
        body += `<td>${yr} Years</td>`;
        for (const q of quotes) {
          const annual = parseFloat(q.total_premium || q.premium || 0);
          const term = parseInt(q.term_length || q.term_years) || 99;
          const effectiveYears = Math.min(yr, term);
          body += `<td class="text-right">${currency(annual * effectiveYears)}${yr > term ? ' *' : ''}</td>`;
        }
        body += '</tr>';
      }
      body += '</table>';
      body += '<p style="font-size:8.5pt;color:#6b7280;">* Coverage may expire before this period based on term length. Values reflect premiums paid during the coverage period only.</p>';

      // Feature analysis
      body += '<h2>Analysis</h2>';
      body += '<div style="font-size:10pt;line-height:1.7;color:#374151;">';

      // Auto-generate analysis based on product types
      for (let i = 0; i < quotes.length; i++) {
        const q = quotes[i];
        const name = q.product_name || `Option ${i + 1}`;
        const type = (q.product_type || '').toLowerCase();
        body += `<h3>${safe(name)}</h3>`;

        if (type.includes('term')) {
          body += `<p><span class="badge badge-blue">Term Life</span> ${safe(name)} provides affordable, straightforward death benefit protection for a fixed period of ${q.term_length || 'N/A'} years. This is ideal for covering specific financial obligations such as a mortgage, income replacement during working years, or children's education funding. Premiums are level for the duration of the term. No cash value accumulates, keeping costs low.</p>`;
        } else if (type.includes('whole')) {
          body += `<p><span class="badge badge-green">Whole Life</span> ${safe(name)} provides permanent, lifelong protection with guaranteed cash value accumulation. Premiums are fixed and never increase. The policy builds tax-deferred cash value that can be accessed through loans or withdrawals. This option is suited for estate planning, legacy goals, or lifelong coverage needs.</p>`;
        } else if (type.includes('universal') || type.includes('ul')) {
          body += `<p><span class="badge badge-amber">Universal Life</span> ${safe(name)} offers flexible permanent coverage with adjustable premiums and death benefits. Cash value grows based on credited interest rates. This product provides more flexibility than whole life but requires monitoring to ensure adequate funding. Suitable for those who want permanent coverage with premium payment flexibility.</p>`;
        } else {
          body += `<p>${safe(name)} provides coverage of ${currency(q.coverage_amount || q.face_amount)} with an annual premium of ${currency(q.total_premium || q.premium)}.</p>`;
        }
      }
      body += '</div>';

      // Recommendation
      if (d.recommendation) {
        body += '<h2>Agent Recommendation</h2>';
        body += `<div class="highlight">${escapeHtml(d.recommendation)}</div>`;
      }
    }

    body += disclaimerBlock([
      'This comparison is provided for educational purposes to help you understand the differences between product types. It is not a guarantee of benefits or premiums.',
      'Each product shown is subject to its own policy terms, conditions, limitations, and exclusions. Please review each policy form carefully before making a decision.',
      'Premiums shown are based on the underwriting classification indicated. Actual premiums may vary after the underwriting process is complete.',
      'Cash value projections for permanent products are based on current non-guaranteed interest rates and are not guaranteed.',
      'Past performance of any policy or product is not indicative of future results.',
      'This report was prepared by a licensed insurance agent and does not constitute legal, tax, or investment advice.',
    ]);

    body += footerBlock('Coverage Comparison Report', null);
    body += '</div>';

    return wrapDocument('Coverage Comparison Report', body);
  }

  // ── CLAIMS FORM ───────────────────────────────────────────────────────────

  #renderClaimsFormHtml(d) {
    const claimRef = d.claim_number || `CLM-${Date.now()}`;

    let body = '<div class="page">';

    body += headerBar('Life Insurance Claim Form', `Claim #${safe(claimRef)}`, d.company_name);

    body += '<div class="highlight"><strong>Instructions:</strong> Complete all sections of this form. Attach all required documents listed in the checklist below. Incomplete claims may result in processing delays. Submit the completed form and supporting documents to the address shown above or to your servicing agent.</div>';

    // Claim info
    body += kvSection('Claim Information', [
      ['Claim Number', safe(d.claim_number)],
      ['Date Filed', dateStr(d.date_filed || new Date())],
      ['Policy Number', safe(d.policy_number)],
    ]);

    // Deceased information
    body += kvSection('Deceased Policyholder Information', [
      ['Full Legal Name', safe(d.deceased_name)],
      ['Date of Birth', dateStr(d.deceased_dob)],
      ['Date of Death', dateStr(d.date_of_death)],
      ['Place of Death', safe(d.place_of_death)],
      ['Cause of Death', safe(d.cause_of_death)],
      ['SSN (Last 4)', d.deceased_ssn_last4 ? `***-**-${safe(d.deceased_ssn_last4)}` : '___-__-____'],
    ]);

    // Claimant info
    body += kvSection('Beneficiary / Claimant Information', [
      ['Full Name', safe(d.claimant_name)],
      ['Relationship to Deceased', safe(d.relationship)],
      ['Address', safe(d.claimant_address)],
      ['Phone', safe(d.claimant_phone)],
      ['Email', safe(d.claimant_email)],
      ['SSN (Last 4)', d.claimant_ssn_last4 ? `***-**-${safe(d.claimant_ssn_last4)}` : '___-__-____'],
    ]);

    // Policy details
    body += kvSection('Policy Details', [
      ['Policy Number', safe(d.policy_number)],
      ['Face Amount / Death Benefit', currency(d.face_amount)],
      ['Issue Date', dateStr(d.issue_date)],
      ['Date of Last Premium Payment', dateStr(d.last_premium_paid)],
    ]);

    // Required documents checklist
    body += '<h2>Required Documents Checklist</h2>';
    body += '<p style="font-size:9.5pt;color:#475569;margin-bottom:10px;">Please submit the following documents with your claim. Check each item as it is included.</p>';

    const docItems = [
      { key: 'certified_death_certificate', label: 'Certified Death Certificate (original or certified copy)', required: true },
      { key: 'claimant_id', label: 'Government-issued photo identification of the claimant', required: true },
      { key: 'original_policy', label: 'Original policy document (if available)', required: false },
      { key: 'completed_claim_form', label: 'Completed and signed claim form (this document)', required: true },
      { key: 'autopsy_report', label: 'Autopsy report (if performed)', required: false },
      { key: 'police_report', label: 'Police report (if death was accidental or violent)', required: false },
      { key: 'attending_physician_statement', label: 'Attending Physician Statement (APS)', required: false },
      { key: 'beneficiary_designation_change', label: 'Beneficiary designation change form (if applicable)', required: false },
    ];

    const checklist = d.checklist || {};
    body += '<table>';
    body += '<tr><th style="width:5%"></th><th>Document</th><th style="width:15%">Required</th><th style="width:15%">Included</th></tr>';
    for (const item of docItems) {
      const included = checklist[item.key] === true;
      body += `<tr>
        <td><span class="checklist-box">${included ? '&#10003;' : ''}</span></td>
        <td style="font-size:9.5pt;">${item.label}</td>
        <td class="text-center">${item.required ? '<strong>Yes</strong>' : 'If applicable'}</td>
        <td class="text-center">${included ? 'Yes' : '—'}</td>
      </tr>`;
    }
    body += '</table>';

    // Payment election
    body += kvSection('Payment Election', [
      ['Payment Method', safe(d.payment_method, 'Check')],
      ['Payment Type', safe(d.lump_sum_or_installment, 'Lump Sum')],
      ['Bank Information (if EFT)', safe(d.bank_info)],
    ]);

    // Fraud warning
    body += '<h2>Fraud Warning</h2>';
    body += '<div class="warning" style="font-size:9pt;line-height:1.6;">';
    body += '<p style="margin-bottom:6px;"><strong>IMPORTANT — PLEASE READ CAREFULLY</strong></p>';
    body += '<p style="margin-bottom:6px;">Any person who knowingly and with intent to defraud any insurance company or another person files a statement of claim containing any materially false information, or conceals for the purpose of misleading information concerning any fact material thereto, commits a fraudulent insurance act, which is a crime and subjects such person to criminal and civil penalties.</p>';
    body += '<p style="margin-bottom:6px;"><strong>State-specific notices:</strong></p>';
    body += '<p style="margin-bottom:4px;"><em>California:</em> For your protection, California law requires the following to appear on this form: Any person who knowingly presents a false or fraudulent claim for the payment of a loss is guilty of a crime and may be subject to fines and confinement in state prison.</p>';
    body += '<p style="margin-bottom:4px;"><em>New York:</em> Any person who knowingly and with intent to defraud any insurance company or other person files an application for insurance or statement of claim containing any materially false information, or conceals for the purpose of misleading, information concerning any fact material thereto, commits a fraudulent insurance act, which is a crime, and shall also be subject to a civil penalty not to exceed five thousand dollars and the stated value of the claim for each such violation.</p>';
    body += '<p><em>All other states:</em> Please refer to your state\'s insurance fraud warning provisions.</p>';
    body += '</div>';

    // Certification and signatures
    body += '<h2>Claimant Certification</h2>';
    body += '<div style="font-size:9.5pt;color:#374151;line-height:1.7;margin-bottom:12px;">';
    body += '<p>I certify under penalty of perjury that the information provided in this claim form is true, correct, and complete to the best of my knowledge. I authorize the release of any medical or other information necessary to process this claim. I understand that the insurance company reserves the right to investigate any claim and that providing false information may result in denial of the claim and criminal prosecution.</p>';
    body += '</div>';

    body += signatureSection([
      { label: 'Claimant Signature' },
      { label: 'Witness Signature' },
    ]);

    body += footerBlock('Life Insurance Claim Form', claimRef);
    body += '</div>';

    return wrapDocument('Life Insurance Claim Form', body);
  }

  // ── POLICY SCHEDULE ───────────────────────────────────────────────────────

  #renderPolicyScheduleHtml(d) {
    const riders = Array.isArray(d.riders) ? d.riders : [];
    const beneficiaries = Array.isArray(d.beneficiaries) ? d.beneficiaries : [];

    let body = '<div class="page">';

    body += headerBar('Policy Schedule', `Policy #${safe(d.policy_number)}`, d.company_name);

    // Policy summary
    body += kvSection('Policy Summary', [
      ['Policy Number', safe(d.policy_number)],
      ['Product Name', safe(d.product_name)],
      ['Issue Date', dateStr(d.issue_date)],
      ['Effective Date', dateStr(d.effective_date || d.issue_date)],
      ['Policy Status', `<span class="badge badge-green">${safe(d.policy_status, 'Active')}</span>`],
    ]);

    // Insured
    body += kvSection('Insured Information', [
      ['Insured Name', safe(d.insured_name)],
      ['Date of Birth', dateStr(d.insured_dob)],
      ['Issue Age', safe(d.insured_age)],
      ['Gender', safe(d.insured_gender)],
      ['Risk Classification', safe(d.risk_class)],
    ]);

    // Coverage details
    body += kvSection('Coverage Details', [
      ['Face Amount', currency(d.face_amount)],
      ['Coverage Type', safe(d.coverage_type)],
      ['Term Length', d.term_length ? `${d.term_length} Years` : 'Lifetime'],
      ['Maturity Date', dateStr(d.maturity_date)],
    ]);

    // Premium schedule
    const premiumAmount = parseFloat(d.premium_amount) || 0;
    const freq = d.premium_frequency || 'Annual';
    body += '<h2>Premium Schedule</h2>';
    body += '<table>';
    body += '<tr><th>Frequency</th><th class="text-right">Premium Amount</th><th>Next Due Date</th></tr>';

    const freqMap = {
      Annual: { factor: 1, label: 'Annual' },
      'Semi-Annual': { factor: 0.52, label: 'Semi-Annual' },
      Quarterly: { factor: 0.26, label: 'Quarterly' },
      Monthly: { factor: 0.0875, label: 'Monthly' },
    };

    const selectedFreq = freqMap[freq] || freqMap.Annual;
    body += `<tr class="total-row">
      <td>${selectedFreq.label} (Selected)</td>
      <td class="text-right">${currency(premiumAmount * selectedFreq.factor)}</td>
      <td>${dateStr(d.next_due_date)}</td>
    </tr>`;

    for (const [key, val] of Object.entries(freqMap)) {
      if (key !== freq) {
        body += `<tr>
          <td>${val.label}</td>
          <td class="text-right">${currency(premiumAmount * val.factor)}</td>
          <td>—</td>
        </tr>`;
      }
    }
    body += '</table>';

    // Riders
    body += '<h2>Riders &amp; Supplementary Benefits</h2>';
    if (riders.length > 0) {
      body += '<table>';
      body += '<tr><th>Rider</th><th class="text-right">Coverage</th><th class="text-right">Premium</th><th>Effective Date</th></tr>';
      for (const r of riders) {
        body += `<tr>
          <td>${safe(r.name || r.rider_name)}</td>
          <td class="text-right">${r.coverage || r.coverage_amount ? currency(r.coverage || r.coverage_amount) : 'Included'}</td>
          <td class="text-right">${currency(r.premium)}</td>
          <td>${dateStr(r.effective_date)}</td>
        </tr>`;
      }
      body += '</table>';
    } else {
      body += '<p style="color:#6b7280;font-style:italic;">No riders attached to this policy.</p>';
    }

    // Beneficiaries
    body += '<h2>Beneficiary Designation</h2>';
    if (beneficiaries.length > 0) {
      body += '<table>';
      body += '<tr><th>Name</th><th>Relationship</th><th class="text-right">Percentage</th><th>Type</th></tr>';
      for (const b of beneficiaries) {
        body += `<tr>
          <td>${safe(b.name || b.beneficiary_name)}</td>
          <td>${safe(b.relationship)}</td>
          <td class="text-right">${b.percentage != null ? b.percentage + '%' : 'N/A'}</td>
          <td>${safe(b.type || b.designation_type, 'Primary')}</td>
        </tr>`;
      }
      body += '</table>';
    } else {
      body += '<p style="color:#6b7280;font-style:italic;">No beneficiary designation on file. Please contact your agent to designate beneficiaries.</p>';
    }

    // Policy owner
    body += kvSection('Policy Owner', [
      ['Owner Name', safe(d.owner_name)],
      ['Owner Address', safe(d.owner_address)],
    ]);

    // Important provisions
    body += '<h2>Important Policy Provisions</h2>';
    body += '<div style="font-size:9.5pt;color:#374151;line-height:1.7;">';
    body += '<p style="margin-bottom:8px;"><strong>Grace Period:</strong> A grace period of 31 days is allowed for payment of any premium after the first. The policy remains in force during the grace period. If the insured dies during the grace period, any overdue premium will be deducted from the death benefit.</p>';
    body += '<p style="margin-bottom:8px;"><strong>Contestability Period:</strong> This policy is contestable for a period of two (2) years from the date of issue. During this period, the company may contest the validity of the policy based on material misstatements in the application.</p>';
    body += '<p style="margin-bottom:8px;"><strong>Suicide Exclusion:</strong> If the insured dies by suicide within two (2) years from the date of issue, the company\'s liability is limited to a refund of premiums paid, less any outstanding policy loans.</p>';
    body += '<p style="margin-bottom:8px;"><strong>Reinstatement:</strong> If this policy lapses for nonpayment of premium, it may be reinstated within five (5) years of the date of lapse, subject to evidence of insurability satisfactory to the company and payment of all past-due premiums with interest.</p>';
    body += '<p style="margin-bottom:8px;"><strong>Incontestability:</strong> After this policy has been in force during the lifetime of the insured for two (2) years from the date of issue, it shall become incontestable except for nonpayment of premiums.</p>';
    body += '<p style="margin-bottom:8px;"><strong>Free-Look Period:</strong> You may return this policy within 10 days of receipt for a full refund of premiums paid. During this period, you may examine the policy and, if not satisfied for any reason, return it to the company or your agent.</p>';
    body += '</div>';

    body += disclaimerBlock([
      'This policy schedule is a summary of your coverage and does not modify the terms of the policy contract. In the event of any conflict between this schedule and the policy, the policy will govern.',
      'Please review this schedule carefully and report any errors to your agent or the company within 30 days.',
      'Keep this document with your policy for your records.',
    ]);

    body += footerBlock('Policy Schedule', d.policy_number);
    body += '</div>';

    return wrapDocument('Policy Schedule', body);
  }

  // ── ANNUAL REVIEW ─────────────────────────────────────────────────────────

  #renderAnnualReviewHtml(d) {
    const premiumHistory = Array.isArray(d.premium_history) ? d.premium_history : [];
    const marketComparison = Array.isArray(d.market_comparison) ? d.market_comparison : [];

    let body = '<div class="page">';

    body += headerBar('Annual Policy Review', `Review Date: ${dateStr(d.review_date || new Date())}`, d.company_name);

    // Review summary
    body += '<div class="two-col"><div>';
    body += kvSection('Review Summary', [
      ['Review Period', safe(d.review_period)],
      ['Policy Number', safe(d.policy_number)],
      ['Servicing Agent', safe(d.agent_name)],
    ]);
    body += '</div><div>';
    body += kvSection('Client Information', [
      ['Client Name', safe(d.client_name)],
      ['Current Age', safe(d.client_age)],
      ['Original Issue Date', dateStr(d.original_issue_date)],
      ['Years In Force', safe(d.years_in_force)],
    ]);
    body += '</div></div>';

    // Current policy values
    const netDeath = (parseFloat(d.face_amount) || 0) + (parseFloat(d.cash_value) || 0) - (parseFloat(d.loan_balance) || 0);
    body += kvSection('Current Policy Values', [
      ['Face Amount', currency(d.face_amount)],
      ['Cash Value', currency(d.cash_value)],
      ['Cash Surrender Value', currency(d.surrender_value)],
      ['Outstanding Loan Balance', currency(d.loan_balance || 0)],
      ['Net Death Benefit', d.net_death_benefit ? currency(d.net_death_benefit) : currency(netDeath)],
    ]);

    // Premium history
    body += '<h2>Premium History</h2>';
    if (premiumHistory.length > 0) {
      body += '<table>';
      body += '<tr><th>Year</th><th class="text-right">Premiums Paid</th><th class="text-right">Cumulative Total</th></tr>';
      let cumulative = 0;
      for (const row of premiumHistory) {
        const paid = parseFloat(row.premiums_paid || row.amount || 0);
        cumulative = row.cumulative_paid != null ? parseFloat(row.cumulative_paid) : cumulative + paid;
        body += `<tr>
          <td>${safe(row.year)}</td>
          <td class="text-right">${currency(paid)}</td>
          <td class="text-right">${currency(cumulative)}</td>
        </tr>`;
      }
      body += `<tr class="total-row"><td>Total</td><td class="text-right"></td><td class="text-right">${currency(cumulative)}</td></tr>`;
      body += '</table>';
    } else {
      body += '<p style="color:#6b7280;font-style:italic;">Premium history data not available for this review period.</p>';
    }

    // Performance summary
    body += kvSection('Performance Summary', [
      ['Current Credited Interest Rate', d.credited_interest_rate != null ? pct(d.credited_interest_rate) : 'N/A'],
      ['Benchmark Rate', d.benchmark_rate != null ? pct(d.benchmark_rate) : 'N/A'],
      ['Cash Value Growth (Year)', d.cash_value_growth != null ? pct(d.cash_value_growth) : 'N/A'],
      ['Year-Over-Year Change', d.year_over_year_change != null ? pct(d.year_over_year_change) : 'N/A'],
    ]);

    body += '<div class="page-break"></div>';
    body += '</div><div class="page">';

    body += headerBar('Annual Policy Review (continued)', 'Market Comparison &amp; Recommendations', d.company_name);

    // Market comparison
    body += '<h2>Market Comparison</h2>';
    if (marketComparison.length > 0) {
      body += '<table>';
      body += '<tr><th>Metric</th><th class="text-right">Your Policy</th><th class="text-right">Market Average</th><th class="text-right">Top Quartile</th></tr>';
      for (const row of marketComparison) {
        body += `<tr>
          <td>${safe(row.metric)}</td>
          <td class="text-right">${safe(row.your_policy)}</td>
          <td class="text-right">${safe(row.market_average)}</td>
          <td class="text-right">${safe(row.top_quartile)}</td>
        </tr>`;
      }
      body += '</table>';
    } else {
      // Provide default comparison metrics
      body += '<table>';
      body += '<tr><th>Metric</th><th class="text-right">Your Policy</th><th class="text-right">Market Average</th><th class="text-right">Top Quartile</th></tr>';
      body += `<tr><td>Credited Interest Rate</td><td class="text-right">${d.credited_interest_rate != null ? pct(d.credited_interest_rate) : 'N/A'}</td><td class="text-right">4.25%</td><td class="text-right">5.10%</td></tr>`;
      body += `<tr><td>Cash Value Growth</td><td class="text-right">${d.cash_value_growth != null ? pct(d.cash_value_growth) : 'N/A'}</td><td class="text-right">3.80%</td><td class="text-right">5.50%</td></tr>`;
      body += `<tr><td>Expense Ratio</td><td class="text-right">N/A</td><td class="text-right">1.20%</td><td class="text-right">0.75%</td></tr>`;
      body += '</table>';
      body += '<p style="font-size:8.5pt;color:#6b7280;">Market averages are based on industry benchmarks and are provided for informational purposes only.</p>';
    }

    // Coverage adequacy
    body += '<h2>Coverage Adequacy Assessment</h2>';
    if (d.coverage_assessment) {
      body += `<div class="highlight">${escapeHtml(d.coverage_assessment)}</div>`;
    } else {
      body += '<div style="font-size:10pt;color:#374151;line-height:1.7;">';
      body += '<p style="margin-bottom:8px;">A periodic review of your coverage needs is essential to ensure your policy continues to meet your financial protection goals. The following factors should be considered:</p>';
      body += '<ul style="padding-left:20px;margin-bottom:12px;">';
      body += '<li><strong>Income Replacement:</strong> Does your current death benefit provide adequate income replacement for your dependents (typically 10-12x annual income)?</li>';
      body += '<li><strong>Debt Coverage:</strong> Are outstanding debts (mortgage, loans, credit cards) adequately covered?</li>';
      body += '<li><strong>Education Funding:</strong> Is there sufficient coverage for children\'s education expenses?</li>';
      body += '<li><strong>Final Expenses:</strong> Are funeral, burial, and estate settlement costs accounted for?</li>';
      body += '<li><strong>Life Changes:</strong> Have there been any major life events (marriage, divorce, birth, job change) that affect your coverage needs?</li>';
      body += '</ul>';
      body += '<p>Please discuss any changes in your personal or financial situation with your agent to ensure your coverage remains appropriate.</p>';
      body += '</div>';
    }

    // Recommendations
    body += '<h2>Recommendations</h2>';
    if (d.recommendations) {
      if (Array.isArray(d.recommendations)) {
        body += '<div style="font-size:10pt;line-height:1.7;">';
        for (let i = 0; i < d.recommendations.length; i++) {
          body += `<div class="highlight" style="margin-bottom:8px;"><strong>${i + 1}.</strong> ${escapeHtml(d.recommendations[i])}</div>`;
        }
        body += '</div>';
      } else {
        body += `<div class="highlight">${escapeHtml(d.recommendations)}</div>`;
      }
    } else {
      body += '<div style="font-size:10pt;color:#374151;line-height:1.7;">';
      body += '<p style="margin-bottom:6px;">Based on this review, the following actions are recommended:</p>';
      body += '<ul style="padding-left:20px;">';
      body += '<li>Review and update beneficiary designations to ensure they reflect your current wishes.</li>';
      body += '<li>Evaluate whether your current coverage amount is sufficient given any changes in income, debts, or family situation.</li>';
      body += '<li>Consider additional riders or supplementary coverage if gaps are identified.</li>';
      body += '<li>Schedule a follow-up meeting with your agent to discuss any questions or changes.</li>';
      body += '</ul></div>';
    }

    // Next steps
    body += '<h2>Next Steps</h2>';
    body += '<table class="kv-table">';
    body += `<tr><td>Next Annual Review</td><td>${d.next_review_date ? dateStr(d.next_review_date) : 'Approximately 12 months from this review date'}</td></tr>`;
    body += `<tr><td>Agent Contact</td><td>${safe(d.agent_name)} | ${safe(d.agent_phone)} | ${safe(d.agent_email)}</td></tr>`;
    body += `<tr><td>Customer Service</td><td>${safe(d.customer_service_phone, '1-800-XXX-XXXX')}</td></tr>`;
    body += '</table>';

    body += disclaimerBlock([
      'This annual review is provided for informational purposes only and does not modify the terms of your policy contract.',
      'Market comparison data is based on publicly available industry benchmarks and may not reflect the exact competitive landscape at the time of this review.',
      'Policy values shown are as of the review date and are subject to change based on policy activity, premium payments, and credited interest rates.',
      'Non-guaranteed values are based on current assumptions and are subject to change. Actual results may be higher or lower than those shown.',
      'This review does not constitute legal, tax, or financial advice. Please consult with qualified professionals for advice specific to your situation.',
    ]);

    body += footerBlock('Annual Policy Review', d.policy_number);
    body += '</div>';

    return wrapDocument('Annual Policy Review', body);
  }

  // ── Utility ───────────────────────────────────────────────────────────────

  // ── APPLICATION REPORT ───────────────────────────────────────────────────

  #renderApplicationReportHtml(d) {
    const requirements = Array.isArray(d.uw_requirements) ? d.uw_requirements : [];
    const statusLabel = (s) => s ? s.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) : 'N/A';

    let body = '<div class="page">';

    // Header
    body += headerBar('Application Report', `${safe(d.app_number)} | Status: ${statusLabel(d.status)}`, d.company_name);

    // Application summary
    body += kvSection('Application Summary', [
      ['Application Number', safe(d.app_number)],
      ['Status', `<span class="badge ${d.status === 'approved' || d.status === 'issued' ? 'badge-green' : d.status === 'declined' ? 'badge-amber' : 'badge-blue'}">${statusLabel(d.status)}</span>`],
      ['Date Submitted', dateStr(d.submitted_at)],
      ['Product Type', statusLabel(d.product_type)],
      ['Product Name', safe(d.product_name)],
    ]);

    // Applicant info and coverage side by side
    body += '<div class="two-col">';
    body += '<div>';
    body += kvSection('Applicant Information', [
      ['Name', safe(d.applicant_name)],
      ['Email', safe(d.email)],
      ['Phone', safe(d.phone)],
      ['Date of Birth', dateStr(d.dob)],
      ['Age', safe(d.age)],
      ['Gender', statusLabel(d.gender)],
      ['Smoker', yesNo(d.is_smoker)],
      ['Health Class', statusLabel(d.health_class)],
      ['Height (in)', d.height_in ? `${d.height_in}"` : 'N/A'],
      ['Weight (lbs)', d.weight_lbs ? `${d.weight_lbs} lbs` : 'N/A'],
    ]);
    body += '</div><div>';
    body += kvSection('Coverage Details', [
      ['Coverage Amount', currency(d.coverage_amount)],
      ['Premium Amount', currency(d.premium_amount)],
      ['Term', d.term_years ? `${d.term_years} Years` : 'N/A'],
      ['Payment Frequency', statusLabel(d.payment_frequency)],
      ['Carrier', safe(d.carrier_name)],
    ]);

    // Agent info
    body += kvSection('Agent / Producer', [
      ['Name', safe(d.agent_name)],
      ['Email', safe(d.agent_email)],
    ]);
    body += '</div></div>';

    // Underwriting section
    if (d.uw_case_number) {
      body += kvSection('Underwriting Case', [
        ['Case Number', safe(d.uw_case_number)],
        ['Status', `<span class="badge ${d.uw_status === 'approved' ? 'badge-green' : d.uw_status === 'declined' ? 'badge-amber' : 'badge-blue'}">${statusLabel(d.uw_status)}</span>`],
        ['Risk Class', statusLabel(d.risk_class)],
      ]);

      if (requirements.length > 0) {
        body += '<h3>Underwriting Requirements</h3>';
        body += '<table>';
        body += '<tr><th>Requirement</th><th>Type</th><th>Status</th><th>Due Date</th></tr>';
        for (const req of requirements) {
          body += `<tr>
            <td>${safe(req.description)}</td>
            <td>${statusLabel(req.requirement_type)}</td>
            <td><span class="badge ${req.status === 'received' ? 'badge-green' : req.status === 'waived' ? 'badge-amber' : 'badge-blue'}">${statusLabel(req.status)}</span></td>
            <td>${dateStr(req.due_date)}</td>
          </tr>`;
        }
        body += '</table>';
      }
    }

    // Policy section
    if (d.policy_number) {
      body += kvSection('Issued Policy', [
        ['Policy Number', safe(d.policy_number)],
        ['Status', `<span class="badge badge-green">${statusLabel(d.policy_status)}</span>`],
        ['Effective Date', dateStr(d.effective_date)],
      ]);
    }

    // Notes
    if (d.notes) {
      body += '<h2>Notes</h2>';
      body += `<p>${safe(d.notes)}</p>`;
    }

    // Disclaimers
    body += disclaimerBlock([
      'This application report is generated from system records for informational purposes only. It does not constitute a contract or guarantee of coverage.',
      'All information is subject to verification during the underwriting process. Final terms and conditions are determined by the issued policy.',
      'This document is confidential and intended solely for authorized personnel. Unauthorized distribution is prohibited.',
    ]);

    body += footerBlock('Application Report', d.app_number);
    body += '</div>';

    return wrapDocument('Application Report', body);
  }

  /**
   * Derive standard payment option breakdowns from an annual premium.
   * @param {number|string} annualPremium
   * @returns {object[]}
   */
  #derivePaymentOptions(annualPremium) {
    const annual = parseFloat(annualPremium) || 0;
    return [
      { frequency: 'Annual', amount: annual, annual_total: annual },
      { frequency: 'Semi-Annual', amount: annual * 0.52, annual_total: annual * 0.52 * 2 },
      { frequency: 'Quarterly', amount: annual * 0.26, annual_total: annual * 0.26 * 4 },
      { frequency: 'Monthly (EFT)', amount: annual * 0.0875, annual_total: annual * 0.0875 * 12 },
    ];
  }
}

module.exports = TemplateEngineService;
