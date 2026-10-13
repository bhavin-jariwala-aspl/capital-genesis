'use strict';

/**
 * Shared option lists for the SWAN Capital pack. Plain Builder option arrays
 * ({ value, label, color? }) — editable in the Builder after install.
 */

const o = (pairs) => pairs.map(([value, label, color]) => ({ value, label, ...(color ? { color } : {}) }));

const BUSINESS_UNITS = o([
  ['LND', 'Lending (Swan Life Ltd)'],
  ['WLT', 'Wealth (Swan Wealth Managers)'],
  ['FND', 'Funds (Swan Global Funds)'],
  ['SEC', 'Securities (Swan CMB Securities)'],
  ['ADV', 'Corporate Advisory (Swan Corporate Advisors)'],
  ['FX', 'Forex (Swan Forex)'],
]);

const PRODUCTS = o([
  ['LND-RE', 'Real Estate Loan'],
  ['LND-PL', 'Personal Loan'],
  ['LND-IBL', 'Investment-Backed Loan'],
  ['LND-COM', 'Commercial Financing'],
  ['WLT-DPM', 'Wealth Management'],
  ['FND-MMF', 'Money Market Fund'],
  ['FND-INC', 'Income Fund'],
  ['FND-FEQ', 'Foreign Equity Fund'],
  ['FND-EME', 'Emerging Markets Equity Fund'],
  ['FND-GPE', 'Global Private Equity Fund'],
  ['FND-FMB29', 'Fixed Maturity Bond 2029'],
  ['SEC-TRD', 'Trading Solutions'],
  ['SEC-LOC', 'Local Investments (SEM)'],
  ['SEC-INT', 'International Offering'],
  ['SEC-MKT', 'Market Statistics & Research'],
  ['ADV-FR', 'Fund Raising'],
  ['ADV-VAL', 'Valuation & Business Plan'],
  ['ADV-RES', 'Corporate Restructuring'],
  ['FX-GEN', 'Swan Forex'],
  ['FX-SPOT', 'Forex Spot'],
  ['FX-FWD', 'Forward Transactions'],
  ['FX-SWAP', 'Forex Swap'],
]);

const RETAIL_LOAN_PRODUCTS = PRODUCTS.filter((p) => ['LND-RE', 'LND-PL', 'LND-IBL'].includes(p.value));

const CURRENCIES = o([['MUR', 'MUR'], ['USD', 'USD'], ['EUR', 'EUR'], ['GBP', 'GBP'], ['ZAR', 'ZAR'], ['AUD', 'AUD'], ['JPY', 'JPY'], ['CAD', 'CAD'], ['CHF', 'CHF']]);

const LANGUAGES = o([['en', 'English'], ['fr', 'Français']]);

const COUNTRIES = o([
  ['MU', 'Mauritius'], ['SC', 'Seychelles'], ['KM', 'Comoros'], ['ZM', 'Zambia'], ['RW', 'Rwanda'],
  ['ZA', 'South Africa'], ['RE', 'Réunion'], ['MG', 'Madagascar'], ['FR', 'France'], ['GB', 'United Kingdom'],
  ['IN', 'India'], ['AE', 'United Arab Emirates'], ['US', 'United States'], ['CN', 'China'],
  ['IR', 'Iran'], ['KP', 'North Korea'], ['MM', 'Myanmar'], ['OTHER', 'Other'],
]);

const SEGMENTS = o([
  ['retail', 'Retail', '#3b82f6'], ['affluent', 'Affluent', '#6366f1'], ['hnw', 'HNW', '#10b981'],
  ['uhnw', 'UHNW', '#059669'], ['corporate', 'Corporate', '#f59e0b'], ['institutional', 'Institutional', '#8b5cf6'],
]);

const CHANNELS = o([
  ['web_form', 'Website form'], ['calculator', 'Loan calculator'], ['questionnaire', 'Investor questionnaire'],
  ['phone', 'Phone'], ['email', 'Email'], ['walk_in', 'Walk-in'], ['event', 'Event'], ['referral', 'Referral'],
  ['introducer', 'Introducer'], ['social', 'Social media'],
]);

const LOW_MED_HIGH = o([['low', 'Low', '#10b981'], ['medium', 'Medium', '#f59e0b'], ['high', 'High', '#ef4444']]);

module.exports = {
  o, BUSINESS_UNITS, PRODUCTS, RETAIL_LOAN_PRODUCTS, CURRENCIES, LANGUAGES, COUNTRIES, SEGMENTS, CHANNELS, LOW_MED_HIGH,
};
