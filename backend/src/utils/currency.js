'use strict';

/**
 * Currency registry & formatting — the single source of truth for how money
 * is rendered anywhere on the server (PDF templates, report exports, emails).
 *
 * The tenant picks ONE display currency in BUILDER > Settings > Localization
 * (`localization.currency`). Nothing here reads the database: this module is
 * pure. `CurrencyService` resolves the tenant's choice and hands it in.
 *
 * `frontend/src/utils/currency.js` is the mirror of this file. The two are kept
 * deliberately identical (backend/ and frontend/ are separate npm packages with
 * no shared workspace) — change one, change the other.
 */

/**
 * ISO 4217 currencies offered to tenants.
 *   code     — ISO 4217 alphabetic code, also the stored setting value
 *   name     — display name for the settings picker
 *   symbol   — short glyph for compact surfaces (input prefixes, chart axes)
 *   decimals — ISO minor units; drives rounding, not just display
 */
const CURRENCIES = [
  { code: 'USD', name: 'US Dollar',            symbol: '$',   decimals: 2 },
  { code: 'EUR', name: 'Euro',                 symbol: '€',   decimals: 2 },
  { code: 'GBP', name: 'British Pound',        symbol: '£',   decimals: 2 },
  { code: 'INR', name: 'Indian Rupee',         symbol: '₹',   decimals: 2 },
  { code: 'JPY', name: 'Japanese Yen',         symbol: '¥',   decimals: 0 },
  { code: 'CNY', name: 'Chinese Yuan',         symbol: '¥',   decimals: 2 },
  { code: 'CHF', name: 'Swiss Franc',          symbol: 'CHF', decimals: 2 },
  { code: 'CAD', name: 'Canadian Dollar',      symbol: 'CA$', decimals: 2 },
  { code: 'AUD', name: 'Australian Dollar',    symbol: 'A$',  decimals: 2 },
  { code: 'NZD', name: 'New Zealand Dollar',   symbol: 'NZ$', decimals: 2 },
  { code: 'SGD', name: 'Singapore Dollar',     symbol: 'S$',  decimals: 2 },
  { code: 'HKD', name: 'Hong Kong Dollar',     symbol: 'HK$', decimals: 2 },
  { code: 'AED', name: 'UAE Dirham',           symbol: 'د.إ', decimals: 2 },
  { code: 'SAR', name: 'Saudi Riyal',          symbol: '﷼',   decimals: 2 },
  { code: 'QAR', name: 'Qatari Riyal',         symbol: '﷼',   decimals: 2 },
  { code: 'KWD', name: 'Kuwaiti Dinar',        symbol: 'د.ك', decimals: 3 },
  { code: 'BHD', name: 'Bahraini Dinar',       symbol: '.د.ب',decimals: 3 },
  { code: 'OMR', name: 'Omani Rial',           symbol: '﷼',   decimals: 3 },
  { code: 'JOD', name: 'Jordanian Dinar',      symbol: 'د.ا', decimals: 3 },
  { code: 'ZAR', name: 'South African Rand',   symbol: 'R',   decimals: 2 },
  { code: 'NGN', name: 'Nigerian Naira',       symbol: '₦',   decimals: 2 },
  { code: 'KES', name: 'Kenyan Shilling',      symbol: 'KSh', decimals: 2 },
  { code: 'EGP', name: 'Egyptian Pound',       symbol: 'E£',  decimals: 2 },
  { code: 'BRL', name: 'Brazilian Real',       symbol: 'R$',  decimals: 2 },
  { code: 'MXN', name: 'Mexican Peso',         symbol: 'MX$', decimals: 2 },
  { code: 'ARS', name: 'Argentine Peso',       symbol: 'AR$', decimals: 2 },
  { code: 'CLP', name: 'Chilean Peso',         symbol: 'CLP', decimals: 0 },
  { code: 'COP', name: 'Colombian Peso',       symbol: 'COL$',decimals: 2 },
  { code: 'SEK', name: 'Swedish Krona',        symbol: 'kr',  decimals: 2 },
  { code: 'NOK', name: 'Norwegian Krone',      symbol: 'kr',  decimals: 2 },
  { code: 'DKK', name: 'Danish Krone',         symbol: 'kr',  decimals: 2 },
  { code: 'PLN', name: 'Polish Zloty',         symbol: 'zł',  decimals: 2 },
  { code: 'CZK', name: 'Czech Koruna',         symbol: 'Kč',  decimals: 2 },
  { code: 'HUF', name: 'Hungarian Forint',     symbol: 'Ft',  decimals: 2 },
  { code: 'TRY', name: 'Turkish Lira',         symbol: '₺',   decimals: 2 },
  { code: 'ILS', name: 'Israeli Shekel',       symbol: '₪',   decimals: 2 },
  { code: 'RUB', name: 'Russian Ruble',        symbol: '₽',   decimals: 2 },
  { code: 'KRW', name: 'South Korean Won',     symbol: '₩',   decimals: 0 },
  { code: 'THB', name: 'Thai Baht',            symbol: '฿',   decimals: 2 },
  { code: 'IDR', name: 'Indonesian Rupiah',    symbol: 'Rp',  decimals: 2 },
  { code: 'MYR', name: 'Malaysian Ringgit',    symbol: 'RM',  decimals: 2 },
  { code: 'PHP', name: 'Philippine Peso',      symbol: '₱',   decimals: 2 },
  { code: 'VND', name: 'Vietnamese Dong',      symbol: '₫',   decimals: 0 },
  { code: 'PKR', name: 'Pakistani Rupee',      symbol: '₨',   decimals: 2 },
  { code: 'BDT', name: 'Bangladeshi Taka',     symbol: '৳',   decimals: 2 },
  { code: 'LKR', name: 'Sri Lankan Rupee',     symbol: 'Rs',  decimals: 2 },
  { code: 'MUR', name: 'Mauritian Rupee',      symbol: 'Rs',  decimals: 2 },
];

const BY_CODE = new Map(CURRENCIES.map((c) => [c.code, c]));

/** Fallback used whenever a tenant has not chosen (or has an unknown) currency. */
const DEFAULT_CURRENCY = 'USD';

/**
 * Separator pairs behind the `localization.number_format` setting.
 * Applied AFTER Intl formatting so the tenant's chosen grouping always wins,
 * regardless of what the language locale would have produced on its own.
 */
const NUMBER_FORMATS = {
  '1,234.56': { group: ',',        decimal: '.' },
  '1.234,56': { group: '.',        decimal: ',' },
  '1 234.56': { group: ' ',   decimal: '.' },
};

/** @returns {{code:string,name:string,symbol:string,decimals:number}} */
function getCurrency(code) {
  return BY_CODE.get(String(code || '').toUpperCase()) || BY_CODE.get(DEFAULT_CURRENCY);
}

/** ISO codes, for the settings dropdown and for validation. */
function currencyCodes() {
  return CURRENCIES.map((c) => c.code);
}

/** `{ USD: 'USD — US Dollar ($)' }`, for a readable settings dropdown. */
function currencyOptionLabels() {
  return Object.fromEntries(CURRENCIES.map((c) => [c.code, `${c.code} — ${c.name} (${c.symbol})`]));
}

/** Language tag Intl should format with. Falls back to en-US. */
function toIntlLocale(locale) {
  const l = String(locale || '').trim();
  if (!l) return 'en-US';
  try {
    // Throws on a malformed tag; normalises "en" → "en".
    return Intl.NumberFormat.supportedLocalesOf([l]).length ? l : 'en-US';
  } catch {
    return 'en-US';
  }
}

/**
 * Rewrite Intl's group/decimal separators to match `number_format`.
 * Done on parts (not a string replace) so a decimal point is never mistaken
 * for a group separator, and vice versa.
 */
function applyNumberFormat(parts, numberFormat) {
  const sep = NUMBER_FORMATS[numberFormat];
  if (!sep) return parts.map((p) => p.value).join('');
  return parts
    .map((p) => {
      if (p.type === 'group')   return sep.group;
      if (p.type === 'decimal') return sep.decimal;
      return p.value;
    })
    .join('');
}

/**
 * Format an amount in the tenant's display currency.
 *
 * @param {number|string|null|undefined} value
 * @param {object} [opts]
 * @param {string} [opts.code]          ISO 4217 code (default USD)
 * @param {string} [opts.locale]        BCP-47 language tag (default en-US)
 * @param {string} [opts.numberFormat]  one of NUMBER_FORMATS' keys
 * @param {number} [opts.decimals]      override the currency's minor units
 * @param {boolean} [opts.compact]      render 1.2M / 3.4K instead of full digits
 * @param {string} [opts.fallback]      returned when value is null/NaN (default '—')
 * @returns {string}
 */
function formatCurrency(value, opts = {}) {
  const { code, locale, numberFormat, decimals, compact = false, fallback = '—' } = opts;

  if (value === null || value === undefined || value === '') return fallback;
  const num = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(num)) return fallback;

  const cur = getCurrency(code);
  const digits = decimals ?? cur.decimals;

  const config = {
    style: 'currency',
    currency: cur.code,
    minimumFractionDigits: compact ? 0 : digits,
    maximumFractionDigits: compact ? 1 : digits,
    ...(compact ? { notation: 'compact', compactDisplay: 'short' } : {}),
  };

  try {
    const parts = new Intl.NumberFormat(toIntlLocale(locale), config).formatToParts(num);
    return applyNumberFormat(parts, numberFormat);
  } catch {
    // Unknown code for this ICU build — degrade to "CODE 1,234.56" rather than throw.
    return `${cur.code} ${num.toFixed(digits)}`;
  }
}

/** Round to the currency's minor units — use before persisting a computed amount. */
function roundToCurrency(value, code) {
  const num = Number(value);
  if (!Number.isFinite(num)) return null;
  const f = 10 ** getCurrency(code).decimals;
  return Math.round(num * f) / f;
}

module.exports = {
  CURRENCIES,
  DEFAULT_CURRENCY,
  NUMBER_FORMATS,
  getCurrency,
  currencyCodes,
  currencyOptionLabels,
  formatCurrency,
  roundToCurrency,
};
