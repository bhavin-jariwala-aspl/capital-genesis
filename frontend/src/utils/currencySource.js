/**
 * Where a form reads the currency code of a money field that declares
 * `config.currency_field` (the record field holding the ISO code).
 *
 * - The form holds that field (e.g. a mandate's `base_currency` select): read it there.
 * - The record's currency field is a formula that copies the code from a linked
 *   record (e.g. an AUM snapshot's `base_currency` = `wealth_mandate.base_currency`):
 *   on a new record the formula has not run yet, so read the code from the record
 *   picked in that lookup.
 *
 * Returns null when the field has no currency of its own (the tenant's currency applies),
 * `{ field }` or `{ field, lookup, target }`.
 */
export function currencySource(currencyField, objectFields = [], formFieldNames = []) {
  if (!currencyField) return null;
  if (formFieldNames.includes(currencyField)) return { field: currencyField };
  const def = (objectFields || []).find((f) => f?.name === currencyField);
  const m = /^\s*([a-z_][a-z0-9_]*)\.([a-z_][a-z0-9_]*)\s*$/i.exec(def?.config?.expression || '');
  if (m) return { field: currencyField, lookup: m[1], target: m[2] };
  return { field: currencyField };
}

/** A three-letter ISO code, or undefined. */
export function isoCode(v) {
  return typeof v === 'string' && /^[A-Z]{3}$/.test(v) ? v : undefined;
}
