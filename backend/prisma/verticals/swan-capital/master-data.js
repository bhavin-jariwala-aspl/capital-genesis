'use strict';

/**
 * SWAN Capital — configuration master data (PRD §2.2, M24). Every value is an
 * ordinary record, editable under Masters after install. Product terms are as
 * published on swancapitalsolutions.com (October 2026) and must be confirmed
 * with SWAN before go-live.
 */

const today = new Date().toISOString().slice(0, 10);

// ── Product catalogue: every product and service on the website ─────────────
const P = (code, name, name_fr, business_unit, category, risk_rating, extra = {}) => ({ code, name, name_fr, business_unit, category, risk_rating, active: true, ...extra });
const products = [
  // Financing solutions — Swan Life Ltd (loans business line)
  P('LND-RE', 'Real Estate Loan', 'Prêt immobilier', 'LND', 'lending', 2, { margin: -0.675, min_amount: 0, max_tenure_months: 360, max_ltv: 100,
    description: 'Acquire a residential property, buy a construction lot, renovate, or invest in real estate. Up to 100% of the project cost, up to 30 years (ending by age 65), variable from 6.15% (Swan PLR 6.825% − 0.675%). First-rank fixed charge; life and building insurance assigned to Swan Life Ltd. Moratorium and interest-only options.' }),
  P('LND-PL', 'Personal Loan', 'Prêt personnel', 'LND', 'lending', 2, { margin: 0.175, min_amount: 500000, max_tenure_months: 120, max_ltv: 100,
    description: 'Extra cash, car, wedding, education, travel — even a yacht. From MUR 500,000, up to 10 years (ending by age 65), from 7.00% (Swan PLR + 0.175%). First-rank fixed charge on property.' }),
  P('LND-IBL', 'Investment-Backed Loan', 'Prêt adossé à des placements', 'LND', 'lending', 2, { margin: -0.175, min_amount: 0, max_tenure_months: 120, max_ltv: 70,
    description: 'Liquidity without selling investments, for existing clients. Pledge of Swan Global Funds units (Income, Foreign Equity, Emerging Markets Equity) or a Swan Securities portfolio. Up to 10 years, from 6.65% (Swan PLR − 0.175%).' }),
  P('LND-COM', 'Commercial Financing', 'Financement commercial', 'LND', 'lending', 3, { margin: 0.5,
    description: 'Bespoke corporate lending and refinancing for short- and long-term cash-flow needs, assessed by a relationship manager and a dedicated team.' }),
  // Investment solutions — wealth
  P('WLT-DPM', 'Wealth Management', 'Gestion de patrimoine', 'WLT', 'wealth', 3,
    { description: 'Discretionary portfolio management: tailored portfolios across equities, fixed income, multi-asset, alternatives and liquidity; asset allocation, sustainable investment and risk management; ETFs (iShares, Vanguard, SPDR, Xtrackers, Invesco), funds (BlackRock, JP Morgan, Goldman Sachs, AXA, Threadneedle, Janus) and rated bonds; monthly reports and regular reviews.' }),
  // Investment funds — Swan Global Funds Ltd
  P('FND-MMF', 'Money Market Fund (Short Term Investment Solutions)', 'Fonds monétaire', 'FND', 'funds', 1, { description: 'Short-term income and capital preservation in USD, MUR and EUR share classes.' }),
  P('FND-INC', 'Income Fund (Medium Term Investment Solutions)', 'Fonds de revenu', 'FND', 'funds', 2, { description: 'Secure and stable investment with regular income.' }),
  P('FND-FEQ', 'Foreign Equity Fund (Long Term Investment Solutions)', 'Fonds actions internationales', 'FND', 'funds', 4, { description: 'Long-term capital growth through international equities; 10-year track record.' }),
  P('FND-EME', 'Emerging Markets Equity Fund (Long Term Investment Solutions)', 'Fonds actions marchés émergents', 'FND', 'funds', 5, { description: 'Long-term growth from emerging-market equities.' }),
  P('FND-GPE', 'Global Private Equity Fund (Alternative Investment Solutions)', 'Fonds de capital-investissement', 'FND', 'funds', 5, { description: 'Alternative investment in global private equity — professional / sophisticated investors.' }),
  P('FND-FMB29', 'Fixed Maturity Bond 2029', 'Obligation à échéance fixe 2029', 'FND', 'funds', 2, { description: 'Fixed-maturity income product maturing in 2029.' }),
  // Trading solutions — Swan CMB Securities Ltd
  P('SEC-TRD', 'Trading Solutions', 'Solutions de négociation', 'SEC', 'securities', 4, { description: 'Research analysts and portfolio advisors servicing retail and corporate clients.' }),
  P('SEC-LOC', 'Local Investments (SEM)', 'Investissements locaux (SEM)', 'SEC', 'securities', 4, { description: 'Buy and sell shares on the Stock Exchange of Mauritius; CDS securities account opening; research and portfolio advisory; execution by trading specialists; back-office settlement.' }),
  P('SEC-INT', 'International Offering', 'Offre internationale', 'SEC', 'securities', 4, { description: 'International shares, mutual funds and ETFs on the Swan Securities trading platform; custody; trading, custodian and entry fees; accounts pre-funded in hard currency.' }),
  P('SEC-MKT', 'Market Statistics & Research', 'Statistiques de marché', 'SEC', 'securities', 1, { description: 'Market statistics, weekly highlights and research distribution.' }),
  // Corporate advisory — Swan Corporate Advisors Ltd
  P('ADV-FR', 'Fund Raising', 'Levée de fonds', 'ADV', 'advisory', null, { description: 'Capital raising; unsecured debt, bond and share offers; access to a wide range of investors; end-to-end management of the raise.' }),
  P('ADV-VAL', 'Valuation & Business Plan', 'Évaluation et plan d\'affaires', 'ADV', 'advisory', null, { description: 'PPA, IP valuation, mark-to-market, ESOP, tax valuations, dispute advisory, M&A / IPO valuation reports, transaction valuation, business planning, market research.' }),
  P('ADV-RES', 'Corporate Restructuring Advisory', 'Conseil en restructuration', 'ADV', 'advisory', null, { description: 'Company formation / liquidation, re-capitalisation and re-organisation, financial viability and business plans, crisis stabilisation, turnaround strategies.' }),
  // Forex — Swan Forex Ltd
  P('FX-GEN', 'Swan Forex', 'Swan Forex', 'FX', 'fx', 2, { description: 'Corporate and individual forex solutions — talk to our Forexpert.' }),
  P('FX-SPOT', 'Forex Spot', 'Change au comptant', 'FX', 'fx', 2, { description: 'Spot foreign exchange in AUD, EUR, GBP, JPY, USD, ZAR, CAD, CHF and others.' }),
  P('FX-FWD', 'Forward Transactions', 'Opérations à terme', 'FX', 'fx', 3, { description: 'Forward contracts to fix a future exchange rate.' }),
  P('FX-SWAP', 'Forex Swap', 'Swap de change', 'FX', 'fx', 3, { description: 'FX swaps with a customer-centric approach.' }),
];

// Website "I am interested in" labels → product, entity and queue (Appendix A).
// The duplicate trading labels on today's form are de-duplicated here.
const routing = [
  ['Real Estate Loan', 'LND-RE', 'LND', 'Retail Loans'], ['Personal Loan', 'LND-PL', 'LND', 'Retail Loans'],
  ['Investment Backed Loans', 'LND-IBL', 'LND', 'Retail Loans (notify existing RM)'], ['Commercial', 'LND-COM', 'LND', 'Commercial Lending'],
  ['Wealth Management', 'WLT-DPM', 'WLT', 'Wealth RMs'],
  ['Short Term Investment Solutions', 'FND-MMF', 'FND', 'Fund Sales'], ['Medium Term Investment Solutions', 'FND-INC', 'FND', 'Fund Sales'],
  ['Long Term Investment Solutions', 'FND-FEQ', 'FND', 'Fund Sales'], ['Emerging Markets Equity Fund', 'FND-EME', 'FND', 'Fund Sales'],
  ['Alternative Investment Solutions', 'FND-GPE', 'FND', 'Fund Sales'], ['Fixed Maturity Bond (Maturity: 2029)', 'FND-FMB29', 'FND', 'Fund Sales'],
  ['Trading Solutions', 'SEC-TRD', 'SEC', 'Securities Desk'], ['Local Investments', 'SEC-LOC', 'SEC', 'Securities Desk'],
  ['International Offering', 'SEC-INT', 'SEC', 'Securities Desk'], ['Market Statistics', 'SEC-MKT', 'SEC', 'Research'],
  ['Fund Raising', 'ADV-FR', 'ADV', 'Advisory (private side)'], ['Valuation & Business Plan', 'ADV-VAL', 'ADV', 'Advisory'],
  ['Corporate Restructuring Advisory', 'ADV-RES', 'ADV', 'Advisory'],
  ['Swan Forex', 'FX-GEN', 'FX', 'Forex Desk'], ['Forex Spot', 'FX-SPOT', 'FX', 'Forex Desk'], ['Forwarding transactions', 'FX-FWD', 'FX', 'Forex Desk'], ['Forex Swap', 'FX-SWAP', 'FX', 'Forex Desk'],
].map(([website_label, product_code, business_unit, queue]) => ({ website_label, prod_param: website_label, product_code, business_unit, queue, first_contact_hours: 4 }));

const countries = [
  ['MU', 'Mauritius', 'none', 5], ['SC', 'Seychelles', 'none', 10], ['KM', 'Comoros', 'none', 15], ['ZM', 'Zambia', 'none', 15],
  ['RW', 'Rwanda', 'none', 12], ['ZA', 'South Africa', 'grey', 25], ['RE', 'Réunion', 'none', 5], ['MG', 'Madagascar', 'none', 15],
  ['FR', 'France', 'none', 5], ['GB', 'United Kingdom', 'none', 5], ['IN', 'India', 'none', 10], ['AE', 'United Arab Emirates', 'none', 15],
  ['US', 'United States', 'none', 5], ['CN', 'China', 'none', 10], ['IR', 'Iran', 'black', 40], ['KP', 'North Korea', 'black', 40],
  ['MM', 'Myanmar', 'black', 40], ['OTHER', 'Other', 'none', 15],
].map(([iso_code, name, fatf_status, risk_score]) => ({ iso_code, name, fatf_status, risk_score, sanctioned: ['IR', 'KP'].includes(iso_code) }));

// Indicative TT rates published on the website, 13 October 2026.
const fxBoard = [
  ['MUR', 1, 1, 1], ['USD', 47.855, 47.15, 48.56], ['EUR', 53.43, 52.64, 54.22], ['GBP', 63.205, 62.27, 64.14], ['ZAR', 3.015, 2.92, 3.11],
  ['AUD', 34.515, 33.61, 35.42], ['JPY', 0.30155, 0.2971, 0.306], ['CAD', 35.14, 34.30, 35.98], ['CHF', 57.265, 56.42, 58.11],
].map(([currency_code, rate_to_mur, buy_tt, sell_tt]) => ({ currency_code, rate_to_mur, buy_tt, sell_tt, rate_date: '2026-10-13' }));

const modelPortfolios = [
  ['A', 'Conservative', 1, 10, 60, 30, 0, 'Capital preservation; mostly bonds and money market.'],
  ['B', 'Moderately conservative', 2, 30, 50, 15, 5, 'Income with modest growth.'],
  ['C', 'Balanced', 3, 50, 35, 5, 10, 'Balanced growth and income.'],
  ['D', 'Growth', 4, 70, 20, 0, 10, 'Long-term growth; accepts volatility.'],
  ['E', 'Aggressive', 5, 85, 5, 0, 10, 'Maximum long-term growth.'],
].map(([code, name, risk_level, equity_pct, bond_pct, cash_pct, alternatives_pct, description]) => ({ code, name, risk_level, equity_pct, bond_pct, cash_pct, alternatives_pct, description }));

// KYC risk factors (model v1) — read by the KYC risk-score formula.
const riskFactors = [
  ['pep', 'pep', 'PEP', 30],
  ['product_low', 'product', 'low', 0], ['product_medium', 'product', 'medium', 10], ['product_high', 'product', 'high', 20],
  ['channel_face_to_face', 'channel', 'face to face', 0], ['channel_non_face_to_face', 'channel', 'non face to face', 10],
  ['occupation_low', 'occupation', 'low', 0], ['occupation_medium', 'occupation', 'medium', 7], ['occupation_high', 'occupation', 'high', 15],
  ['ownership_simple', 'ownership', 'simple', 0], ['ownership_layered', 'ownership', 'layered', 8], ['ownership_complex', 'ownership', 'complex / opaque', 15],
  ['activity_low', 'activity', 'low', 0], ['activity_medium', 'activity', 'medium', 5], ['activity_high', 'activity', 'high', 10],
].map(([code, factor, value, score]) => ({ code, factor, value, score, model_version: 'v1', effective_from: '2026-01-01' }));

const collateralTypes = [
  ['residential', 'Residential property', 0, 36, 85, 95, 100], ['land', 'Land / construction lot', 10, 36, 80, 90, 100],
  ['commercial', 'Commercial property', 15, 24, 75, 85, 95], ['fund_units', 'Fund units', 30, 1, 75, 80, 90],
  ['securities', 'Securities portfolio', 40, 1, 75, 80, 90], ['cash', 'Cash deposit', 0, 12, 95, 98, 100], ['guarantee', 'Guarantee', 50, 12, 80, 90, 100],
].map(([code, label, haircut_pct, revaluation_months, ltv_warning_pct, ltv_margin_call_pct, ltv_liquidation_pct]) => ({ code, label, haircut_pct, revaluation_months, ltv_warning_pct, ltv_margin_call_pct, ltv_liquidation_pct }));

const approvalBands = [
  ['LND|5M', 'LND', 5000000, 'loans_manager', 'Loans Manager', 1],
  ['LND|20M', 'LND', 20000000, 'credit_committee', 'Credit Committee', 2],
  ['LND|MAX', 'LND', 999999999999, 'board_credit_committee', 'Board Credit Committee', 3],
  ['LND|RATE', 'LND', 999999999999, 'loans_manager', 'Loans Manager (rate override ≤ 0.25 pts)', 1],
  ['FND|ORDER', 'FND', 999999999999, 'operations_checker', 'Operations checker', 1],
].map(([band_key, business_unit, max_amount, approver_role, approver_label, quorum]) => ({ band_key, business_unit, max_amount, approver_role, approver_label, quorum, exception_type: band_key.endsWith('RATE') ? 'rate_override' : 'none' }));

const catalogue = [
  ['address_change', 'Address change', 'ALL', 16, false], ['statement_request', 'Statement request', 'ALL', 16, false],
  ['early_settlement_quote', 'Early settlement quote', 'LND', 24, false], ['partial_prepayment', 'Partial prepayment', 'LND', 40, true],
  ['tenure_change', 'Tenure change', 'LND', 80, true], ['moratorium_request', 'Moratorium request', 'LND', 80, true],
  ['redemption', 'Fund redemption', 'FND', 16, true], ['top_up', 'Top-up', 'WLT', 16, false], ['fx_settlement_query', 'FX settlement query', 'FX', 8, false],
  ['certificate_of_balance', 'Certificate of balance', 'LND', 24, false], ['title_release', 'Release of title deeds', 'LND', 80, true],
  ['complaint', 'Complaint', 'ALL', 120, false], ['other', 'Other', 'ALL', 40, false],
].map(([request_type, label, business_unit, sla_hours, requires_approval]) => ({ request_type, label, business_unit, sla_hours, requires_approval }));

const reasons = [
  ['LD-NONEED', 'lead_disqualification', 'No current need', 'Pas de besoin actuel'], ['LD-NOTELIG', 'lead_disqualification', 'Not eligible', 'Non éligible'],
  ['LD-DUP', 'lead_disqualification', 'Duplicate', 'Doublon'], ['LD-UNREACH', 'lead_disqualification', 'Unreachable', 'Injoignable'],
  ['LN-AFF', 'loan_decline', 'Affordability', 'Capacité de remboursement'], ['LN-CREDIT', 'loan_decline', 'Credit history', 'Historique de crédit'],
  ['LN-SEC', 'loan_decline', 'Insufficient security', 'Garantie insuffisante'], ['LN-AGE', 'loan_decline', 'Age / tenure', 'Âge / durée'],
  ['MD-PERF', 'mandate_loss', 'Performance', 'Performance'], ['MD-FEES', 'mandate_loss', 'Fees', 'Frais'], ['MD-RELOC', 'mandate_loss', 'Client relocated', 'Client relocalisé'],
  ['AC-REQ', 'account_closure', 'Client request', 'Demande du client'], ['AC-DORM', 'account_closure', 'Dormant', 'Inactif'],
  ['RC-PROC', 'complaint_root_cause', 'Process', 'Processus'], ['RC-PEOPLE', 'complaint_root_cause', 'People', 'Personnel'], ['RC-SYS', 'complaint_root_cause', 'System', 'Système'],
].map(([code, reason_type, label, label_fr]) => ({ code, reason_type, label, label_fr }));

// Fund master and share classes (classes priced by NAV history in the demo set).
const funds = [
  ['MMF', 'Swan Money Market Fund', 'money_market', 'short', '2008-03-01', null, 'Short-term income and capital preservation.'],
  ['INC', 'Swan Income Fund', 'fixed_income', 'medium', '2006-10-01', null, 'Regular income from a diversified bond portfolio.'],
  ['FEQ', 'Swan Foreign Equity Fund', 'equity', 'long', '2014-01-15', null, 'Long-term growth through international equities.'],
  ['EME', 'Swan Emerging Markets Equity Fund', 'equity', 'long', '2016-06-01', null, 'Long-term growth from emerging-market equities.'],
  ['GPE', 'Swan Global Private Equity Fund', 'private_equity', 'alternative', '2019-09-01', null, 'Diversified global private-equity exposure.'],
  ['FMB29', 'Swan Fixed Maturity Bond 2029', 'fixed_maturity', 'medium', '2024-07-01', '2029-06-30', 'Fixed-maturity income product; capital returned in 2029.'],
].map(([code, name, asset_class, horizon, launch_date, maturity_date, objective]) => ({ code: `FND-${code}`, name, asset_class, horizon, launch_date, maturity_date, objective }));

const shareClasses = [
  ['MMF-USD', 'FND-MMF', 'USD class', 'USD', 1, 1000, 0, 0, 0.5, 'daily', true], ['MMF-MUR', 'FND-MMF', 'MUR class', 'MUR', 1, 25000, 0, 0, 0.5, 'daily', true],
  ['MMF-EUR', 'FND-MMF', 'EUR class', 'EUR', 1, 1000, 0, 0, 0.5, 'daily', true], ['INC-MUR', 'FND-INC', 'Class A', 'MUR', 2, 25000, 1, 0, 1.0, 'daily', true],
  ['FEQ-USD', 'FND-FEQ', 'Class A', 'USD', 4, 2000, 2, 0, 1.5, 'daily', false], ['FEQ-MUR', 'FND-FEQ', 'Class B', 'MUR', 4, 50000, 2, 0, 1.5, 'daily', false],
  ['EME-USD', 'FND-EME', 'Class A', 'USD', 5, 2000, 2, 0, 1.75, 'weekly', false], ['GPE-USD', 'FND-GPE', 'Class A', 'USD', 5, 100000, 3, 2, 2.0, 'monthly', false],
  ['FMB29-MUR', 'FND-FMB29', 'Series 1', 'MUR', 2, 100000, 0, 1, 0.75, 'closed', true],
].map(([class_code, fund, class_name, currency_code, risk_rating, min_investment, entry_fee_pct, exit_fee_pct, management_fee_pct, dealing_frequency, distribution_policy]) => ({
  class_code, fund: `@fund:code=${fund}`, class_name, currency_code, risk_rating, min_investment, entry_fee_pct, exit_fee_pct, management_fee_pct, dealing_frequency,
  distribution_policy, cut_off_time: '12:00 Mauritius time', isin: `MU-SGF-${class_code}`,
}));

module.exports = [
  { object: 'financial_product', key: 'code', records: products },
  { object: 'product_routing', key: 'product_code', records: routing },
  { object: 'plr_rate', key: 'effective_from', records: [
    { rate: 7.0, effective_from: '2025-01-01', approved_by: 'ALCO' },
    { rate: 6.825, effective_from: '2026-01-01', approved_by: 'ALCO' },
  ] },
  { object: 'country', key: 'iso_code', records: countries },
  { object: 'fx_rate', key: ['currency_code', 'rate_date'], records: fxBoard },
  { object: 'model_portfolio', key: 'code', records: modelPortfolios },
  { object: 'kyc_risk_factor', key: 'code', records: riskFactors },
  { object: 'collateral_type', key: 'code', records: collateralTypes },
  { object: 'approval_matrix', key: 'band_key', records: approvalBands },
  { object: 'service_catalogue', key: 'request_type', records: catalogue },
  { object: 'reason_code', key: 'code', records: reasons },
  { object: 'fund', key: 'code', records: funds },
  { object: 'fund_share_class', key: 'class_code', records: shareClasses },
];
module.exports.today = today;
