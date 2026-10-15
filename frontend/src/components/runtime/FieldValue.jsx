import { useState } from 'react';
import clsx from 'clsx';
import { CheckCircle2, XCircle, Link2, Eye, Lock } from 'lucide-react';
import { runtimeService } from '../../services/metadata.service';
import { showError } from '../../utils/dialog';
import Badge from '../ui/Badge';
import { statusVariant, optionLabel } from '../../utils/metadata-helpers';
import { fmtDate, fmtDateTime, fmtCurrency, fmtPct } from '../../utils/formatters';
import { formatCurrency } from '../../utils/currency';
import { currencyOptions } from '../../store/currencyStore';

/**
 * FieldValue — one field's value, rendered from its metadata.
 *
 * The single place list cells, the record panel and related lists format a
 * value, driven entirely by `field_type` / `options` / `config` — so a field an
 * admin adds in the Builder displays correctly everywhere with no per-object or
 * per-field-name code.
 *
 *   lookup   → the linked record's title (`labels[field]` from the API)
 *   formula  → formatted by `config.format` (currency | percent | number | date)
 *   select   → coloured badge from the option colour
 */

/** Format a numeric value, falling back to the raw string when it isn't a number. */
function fmtNumeric(value, formatter) {
  const num = Number(value);
  return Number.isFinite(num) ? formatter(num) : String(value);
}

/** Coerce a stored multi-select value into an array (arrays, JSON strings, CSV). */
export function toArray(value) {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) return parsed;
    } catch { /* not JSON — fall through */ }
    return value.split(',').map((v) => v.trim()).filter(Boolean);
  }
  return [];
}

export function hasValue(v) {
  if (v === null || v === undefined || v === '') return false;
  if (Array.isArray(v) && v.length === 0) return false;
  return true;
}

/**
 * The ISO code a money field is denominated in on this record, when the field
 * declares one with `config.currency_field` (e.g. a USD fund order's amount
 * follows the order's `currency_code`). Undefined → the tenant's currency.
 */
export function recordCurrency(field, data) {
  const src = field?.config?.currency_field;
  const code = src && data ? data[src] : null;
  return typeof code === 'string' && /^[A-Z]{3}$/.test(code) ? code : undefined;
}

/** Whole-unit money in `code`, or in the tenant's currency when no code is given. */
export function fmtMoney(n, code) {
  return code ? formatCurrency(n, { ...currencyOptions(), code, decimals: 0 }) : fmtCurrency(n);
}

/** The effective display type: a formula shows as the format it declares. */
function displayType(field) {
  const type = field.field_type ?? field.type;
  if (type === 'formula') {
    const f = field.config?.format;
    if (f === 'currency' || f === 'percent' || f === 'date' || f === 'number' || f === 'checkbox') return f;
    return field.data_type === 'number' ? 'number' : 'text';
  }
  return type;
}

/**
 * A personal-data value the API sent masked. "Reveal" (shown only when the API
 * says the viewer's role may view personal data) asks the server for the real
 * value — allowed only on records the viewer may open, and audited.
 */
function MaskedValue({ field, value, recordId, compact }) {
  const [revealed, setRevealed] = useState(null);
  const [busy, setBusy] = useState(false);
  if (revealed !== null) return <FieldValue field={field} value={revealed} compact={compact} />;
  const reveal = async (e) => {
    e.stopPropagation();
    setBusy(true);
    try {
      const res = await runtimeService.revealField(recordId, field.name);
      setRevealed(res?.data?.value ?? res?.value ?? '');
    } catch (err) {
      showError(err?.response?.data?.error?.message ?? 'Could not reveal this value');
    } finally { setBusy(false); }
  };
  return (
    <span className="inline-flex items-center gap-1.5 text-sm text-gray-500 dark:text-white/50"
      title={recordId ? 'Personal data — masked until you reveal it' : 'Personal data — masked for your role'}>
      <Lock className="h-3 w-3 shrink-0" aria-hidden />
      <span className="font-mono">{String(value)}</span>
      {recordId && (
        <button type="button" onClick={reveal} disabled={busy} className="inline-flex items-center gap-0.5 text-xs text-primary-600 hover:underline disabled:opacity-50" title="Reveal (this is audited)">
          <Eye className="h-3 w-3" /> Reveal
        </button>
      )}
    </span>
  );
}

export default function FieldValue({ field, value, label = null, compact = false, masked = false, recordId = null, currency }) {
  if (masked && hasValue(value)) return <MaskedValue field={field} value={value} recordId={recordId} compact={compact} />;
  const type = displayType(field);
  const options = field.options ?? [];
  const text = compact ? 'text-sm' : 'text-sm';

  if (!hasValue(value)) return <span className="text-gray-400">—</span>;

  if (type === 'lookup') {
    return (
      <span className={clsx(text, 'inline-flex items-center gap-1 font-medium text-gray-900 dark:text-white/90')}>
        <Link2 className="h-3.5 w-3.5 text-primary-400 shrink-0" />
        {label ?? `#${value}`}
      </span>
    );
  }

  // Any field with an option list (e.g. a formula returning a unit code) shows the option's label.
  if (type !== 'select' && type !== 'radio' && type !== 'multi_select' && options.length && !Array.isArray(value)
    && options.some((o) => String(typeof o === 'object' ? o?.value : o) === String(value))) {
    return <span className={clsx(text, 'font-medium text-gray-900 dark:text-white/90')}>{optionLabel(value, options)}</span>;
  }

  if (type === 'select' || type === 'radio' || field.name === 'status') {
    if (options.length) return <Badge variant={statusVariant(value, options)} dot>{optionLabel(value, options)}</Badge>;
    return <span className={clsx(text, 'font-medium text-gray-900 dark:text-white/90')}>{String(value)}</span>;
  }

  if (type === 'multi_select') {
    return (
      <div className="flex flex-wrap gap-1">
        {toArray(value).map((v) => <Badge key={v} variant={statusVariant(v, options)}>{optionLabel(v, options)}</Badge>)}
      </div>
    );
  }

  if (type === 'checkbox' || typeof value === 'boolean') {
    const on = value === true || value === 'true' || value === 1;
    return (
      <span className={clsx(text, 'inline-flex items-center gap-1 font-medium', on ? 'text-emerald-600 dark:text-emerald-400' : 'text-gray-400 dark:text-white/40')}>
        {on ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
        {on ? 'Yes' : 'No'}
      </span>
    );
  }

  if (type === 'currency') {
    return <span className={clsx(text, 'font-semibold text-gray-900 dark:text-white/90')}>{fmtNumeric(value, (n) => fmtMoney(n, currency))}</span>;
  }
  // A field's `config.precision` is the most decimals it shows (6.15 with precision 3 → "6.15%", not "6.2%").
  const precision = field.config?.precision !== undefined && field.config?.precision !== '' && Number.isFinite(Number(field.config?.precision))
    ? Math.max(0, Math.min(10, Number(field.config.precision))) : null;
  if (type === 'percent' || type === 'percentage') {
    const pct = precision === null ? fmtPct
      : (n) => `${n.toLocaleString('en-US', { minimumFractionDigits: Math.min(1, precision), maximumFractionDigits: precision })}%`;
    return <span className={clsx(text, 'font-medium text-gray-900 dark:text-white/90')}>{fmtNumeric(value, pct)}</span>;
  }
  if (type === 'number' || type === 'integer' || type === 'decimal' || type === 'rating') {
    const num = precision === null ? (n) => n.toLocaleString() : (n) => n.toLocaleString(undefined, { maximumFractionDigits: precision });
    return <span className={clsx(text, 'font-medium text-gray-900 dark:text-white/90')}>{fmtNumeric(value, num)}</span>;
  }
  if (type === 'datetime') return <span className={clsx(text, 'text-gray-700 dark:text-white/70')}>{fmtDateTime(value)}</span>;
  if (type === 'date') return <span className={clsx(text, 'text-gray-700 dark:text-white/70')}>{fmtDate(value)}</span>;
  if (type === 'email') return <a href={`mailto:${value}`} className={clsx(text, 'text-primary-600 dark:text-primary-400 hover:underline break-all')}>{value}</a>;
  if (type === 'phone') return <a href={`tel:${value}`} className={clsx(text, 'text-primary-600 dark:text-primary-400 hover:underline')}>{value}</a>;
  if (type === 'url') return <a href={value} target="_blank" rel="noreferrer" className={clsx(text, 'text-primary-600 dark:text-primary-400 hover:underline break-all')}>{value}</a>;
  if (type === 'color') {
    return (
      <span className={clsx(text, 'inline-flex items-center gap-1.5 text-gray-700 dark:text-white/70')}>
        <span className="h-4 w-4 rounded-full ring-1 ring-black/10" style={{ background: value }} />
        {value}
      </span>
    );
  }
  // A machine timestamp kept in a text field (e.g. when consent was captured) reads as a date and time.
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})$/.test(value)) {
    return <span className={clsx(text, 'text-gray-700 dark:text-white/70')}>{fmtDateTime(value)}</span>;
  }
  return (
    <span className={clsx(text, 'text-gray-700 dark:text-white/80 break-words', compact ? 'line-clamp-2' : 'whitespace-pre-wrap')}>
      {String(value)}
    </span>
  );
}
