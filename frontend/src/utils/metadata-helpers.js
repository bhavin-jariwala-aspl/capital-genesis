/**
 * Shared helpers for metadata-driven pages.
 * Used by pages that load field definitions from the Module > Object > Fields system.
 */

/** Map metadata field color to Badge variant */
const COLOR_TO_VARIANT = {
  '#f59e0b': 'warning',
  '#3b82f6': 'info',
  '#8b5cf6': 'purple',
  '#6366f1': 'purple',
  '#10b981': 'success',
  '#ef4444': 'danger',
  '#6b7280': 'default',
  '#1f2937': 'default',
};

/** Resolve a Badge variant from a status value using the field's metadata options */
export function statusVariant(statusValue, statusOptions) {
  const opt = statusOptions.find((o) => o.value === statusValue);
  return COLOR_TO_VARIANT[opt?.color] ?? 'default';
}

/** Resolve a display label from a value in an options array */
export function optionLabel(value, options) {
  return options.find((o) => o.value === value)?.label ?? value;
}
