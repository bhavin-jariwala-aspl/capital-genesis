/**
 * Shared formatting utilities used across runtime pages.
 * Centralised here to avoid duplicate definitions.
 */
import { formatCurrency } from './currency';
import { currencyOptions } from '../store/currencyStore';

/**
 * Format a number in the tenant's currency (no decimals).
 *
 * Reads the active currency at call time rather than closing over it, so every
 * existing `fmtCurrency(n)` call site follows BUILDER > Settings > Localization
 * with no change. Components that must re-render the instant an admin switches
 * currency should also subscribe via `useCurrency()`.
 */
export const fmtCurrency = (n) =>
  formatCurrency(n, { ...currencyOptions(), decimals: 0 });

/** Format a number in the tenant's currency, keeping the currency's minor units. */
export const fmtCurrencyPrecise = (n) =>
  formatCurrency(n, currencyOptions());

/** Compact money for chart axes and stat tiles — "$1.2M". */
export const fmtCurrencyCompact = (n) =>
  formatCurrency(n, { ...currencyOptions(), compact: true });

/** Format a date string to "Apr 6, 2026" style */
export const fmtDate = (d) =>
  d
    ? new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
    : '—';

/** Format a date+time string to "Apr 6, 2026, 02:30 PM" style */
export const fmtDateTime = (d) =>
  d
    ? new Date(d).toLocaleString('en-US', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
    : '—';

/** Format a percentage number */
export const fmtPct = (n) =>
  n != null ? `${Number(n).toFixed(1)}%` : '—';

/** Format file size in bytes to human-readable string */
export function formatSize(bytes) {
  if (!bytes) return '—';
  const n = Number(bytes);
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}
