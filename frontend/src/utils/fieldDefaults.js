/**
 * Builder default values for a new record's form.
 *
 * The server fills absent fields with their default on save, but the person
 * filling the form should see those values (and be able to change them) instead
 * of an empty "Select..." — mirrors `#withDefaults` in record.service.js.
 */
const NO_DEFAULT = new Set(['formula', 'auto_number', 'heading', 'lookup', 'file', 'image']);
const NUMERIC = new Set(['number', 'integer', 'decimal', 'currency', 'percent', 'percentage']);

export function builderDefaults(fields = []) {
  const out = {};
  for (const f of fields) {
    const name = f?.field_name ?? f?.name;
    const raw = f?.default_value;
    if (!name || raw == null || raw === '' || NO_DEFAULT.has(f.field_type)) continue;
    const s = String(raw);
    if (s === '{{today}}') out[name] = new Date().toISOString().slice(0, 10);
    else if (s.includes('{{')) continue;
    else if (['checkbox', 'boolean', 'toggle'].includes(f.field_type)) out[name] = ['true', '1', 'yes'].includes(s.toLowerCase());
    else if (NUMERIC.has(f.field_type) && Number.isFinite(Number(s))) out[name] = Number(s);
    else if (f.field_type === 'multi_select') continue;
    else out[name] = s;
  }
  return out;
}
