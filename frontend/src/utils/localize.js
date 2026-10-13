/**
 * Swap metadata labels for their French versions in a runtime response.
 * A node with `label` takes `config.label_fr` (modules, objects, fields,
 * pipelines, stages) or `label_fr` (select options); `plural_label` takes
 * `config.plural_label_fr`. Anything without a translation is left as is.
 */
export function localizeMetadata(data, lang) {
  if (lang !== 'fr' || data == null || typeof data !== 'object') return data;
  const seen = new WeakSet();
  const walk = (node) => {
    if (node == null || typeof node !== 'object' || seen.has(node)) return;
    seen.add(node);
    if (Array.isArray(node)) { node.forEach(walk); return; }
    const cfg = node.config && typeof node.config === 'object' ? node.config : null;
    if (typeof node.label === 'string') {
      const fr = cfg?.label_fr ?? node.label_fr;
      if (typeof fr === 'string' && fr) node.label = fr;
    }
    if (typeof node.plural_label === 'string' && typeof cfg?.plural_label_fr === 'string' && cfg.plural_label_fr) {
      node.plural_label = cfg.plural_label_fr;
    }
    for (const value of Object.values(node)) if (value && typeof value === 'object') walk(value);
  };
  walk(data);
  return data;
}
