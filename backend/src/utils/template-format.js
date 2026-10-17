'use strict';

/**
 * Values for an email / message template, formatted the way people read them:
 * amounts with thousands separators and the workspace currency's decimals
 * ("39,834.26", not "39834.26"), other numbers grouped to their field
 * precision, and dates in the workspace date format ("17/10/2026").
 *
 * The currency code itself is not added: templates already write it ("MUR
 * {{amount}}"), and a record may carry its own currency next to the amount.
 * Integer, percent and text fields are left as stored.
 */

const { NUMBER_FORMATS } = require('./currency');

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "2026-10-17" / Date → the workspace date format (DD/MM/YYYY, MM/DD/YYYY, YYYY-MM-DD, DD-MMM-YYYY). */
function formatDate(value, dateFormat = 'YYYY-MM-DD') {
  if (value === null || value === undefined || value === '') return '';
  let y; let m; let d;
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return '';
    [y, m, d] = [value.getUTCFullYear(), value.getUTCMonth() + 1, value.getUTCDate()];
  } else {
    const hit = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value));
    if (!hit) return value;
    [y, m, d] = [Number(hit[1]), Number(hit[2]), Number(hit[3])];
  }
  const DD = String(d).padStart(2, '0');
  const MM = String(m).padStart(2, '0');
  switch (dateFormat) {
    case 'DD/MM/YYYY':  return `${DD}/${MM}/${y}`;
    case 'MM/DD/YYYY':  return `${MM}/${DD}/${y}`;
    case 'DD-MMM-YYYY': return `${DD}-${MONTHS[m - 1]}-${y}`;
    default:            return `${y}-${MM}-${DD}`;
  }
}

/** 39834.26 → "39,834.26" with the workspace's separators. */
function formatNumber(value, { minDigits = 0, maxDigits = 2, numberFormat = '1,234.56' } = {}) {
  const n = typeof value === 'number' ? value : Number(String(value));
  if (!Number.isFinite(n)) return value;
  const parts = new Intl.NumberFormat('en-US', { minimumFractionDigits: minDigits, maximumFractionDigits: Math.max(minDigits, maxDigits) }).formatToParts(n);
  const sep = NUMBER_FORMATS[numberFormat] ?? NUMBER_FORMATS['1,234.56'];
  return parts.map((p) => (p.type === 'group' ? sep.group : p.type === 'decimal' ? sep.decimal : p.value)).join('');
}

const kindOf = (f) => {
  const type = f.field_type;
  const fmt = f.config?.format;
  if (type === 'currency' || (type === 'formula' && fmt === 'currency')) return 'currency';
  if (type === 'date' || (type === 'formula' && (fmt === 'date' || f.config?.type === 'date'))) return 'date';
  if (type === 'datetime') return 'date';
  if (['decimal', 'number'].includes(type) || (type === 'formula' && (['number', 'decimal'].includes(fmt) || (!fmt && Number.isInteger(f.config?.precision))))) return 'number';
  return null;
};

/**
 * @param {Record<string, any>} values  the record's values
 * @param {Array<{name, field_type, config}>} fields  the object's field metadata
 * @param {{ decimals?: number, numberFormat?: string, dateFormat?: string }} locale
 */
function formatTemplateValues(values, fields = [], { decimals = 2, numberFormat = '1,234.56', dateFormat = 'YYYY-MM-DD' } = {}) {
  const byName = new Map(fields.map((f) => [f.name, f]));
  const out = {};
  for (const [k, v] of Object.entries(values ?? {})) {
    const f = byName.get(k);
    const kind = f ? kindOf(f) : null;
    if (v === null || v === undefined || v === '') { out[k] = v; continue; }
    if (kind === 'date' || v instanceof Date) { out[k] = formatDate(v, dateFormat); continue; }
    const precision = Number.isInteger(f?.config?.precision) ? f.config.precision : null;
    if (kind === 'currency') {
      const digits = precision ?? decimals;
      out[k] = formatNumber(v, { minDigits: digits, maxDigits: digits, numberFormat });
    } else if (kind === 'number') {
      out[k] = formatNumber(v, { minDigits: 0, maxDigits: precision ?? 4, numberFormat });
    } else {
      out[k] = v;
    }
  }
  return out;
}

module.exports = { formatTemplateValues, formatDate, formatNumber };
