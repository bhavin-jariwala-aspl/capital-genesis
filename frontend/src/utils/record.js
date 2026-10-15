/**
 * Shared record-display helpers.
 * Used by list/card/pipeline views and the 360° detail view so a record's
 * title, initials and accent colour are derived identically everywhere.
 */

/** Derive a human display title from a record's data blob. */
export function recordTitle(data) {
  return (
    data?.full_name ||
    `${data?.first_name || ''} ${data?.last_name || ''}`.trim() ||
    data?.client_name ||
    data?.case_number ||
    data?.name ||
    data?.title ||
    data?.label ||
    data?.subject ||
    null
  );
}

/** Derive initials (up to 2 chars) from a title string. */
export function initials(title) {
  if (!title) return '?';
  return title
    .split(' ')
    .filter(Boolean)
    .map((w) => w[0].toUpperCase())
    .slice(0, 2)
    .join('');
}

/** Stable avatar gradients, picked deterministically from a record id. */
const GRADIENTS = [
  'from-primary-500 to-mid-600',
  'from-blue-500 to-cyan-500',
  'from-emerald-500 to-teal-600',
  'from-orange-500 to-pink-600',
  'from-rose-500 to-red-600',
  'from-amber-500 to-orange-500',
  'from-teal-500 to-emerald-600',
  'from-violet-600 to-purple-700',
];

export function gradientFor(id) {
  return GRADIENTS[Number(id) % GRADIENTS.length];
}

/**
 * A readable message from a failed API call. The API's `error` is an object
 * ({ code, message, details }) — rendering it as-is crashed React.
 */
export function apiErrorText(err, fallback = 'Something went wrong.') {
  const e = err?.response?.data?.error;
  return (typeof e === 'string' ? e : e?.message) || err?.response?.data?.message || err?.message || fallback;
}

/** Field names a refused stage move asked for (a stage gate's `details`). */
export function gateFields(err) {
  const details = err?.response?.data?.error?.details;
  return Array.isArray(details) ? [...new Set(details.map((d) => d?.field).filter(Boolean))] : [];
}

/**
 * A form that also carries the fields a stage gate needs. A gate may require a
 * field the object's usual form does not show (e.g. a disqualification reason);
 * those are added, required, at the top so the gate can be met from the form.
 * `toEntry(field, i)` turns an object field into a form entry.
 */
export function withNeededFields(formMeta, objectFields, needed, toEntry) {
  if (!formMeta || !needed?.length) return formMeta;
  const have = new Set((formMeta.fields || []).map((f) => f.field_name ?? f.name));
  const extra = (objectFields || []).filter((f) => needed.includes(f.name) && !have.has(f.name));
  if (!extra.length) return formMeta;
  const added = extra.map((f, i) => ({ ...toEntry(f, i), position: -1000 + i, is_required: true }));
  return { ...formMeta, fields: [...added, ...(formMeta.fields || [])] };
}
