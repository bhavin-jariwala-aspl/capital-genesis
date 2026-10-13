'use strict';

/**
 * Map a caller's relative storage key to a full object key under an optional
 * bucket/container prefix — shared by every object-store provider (S3, Azure,
 * GCS) so key handling and path-traversal defence are identical across them.
 *
 * @param {string} prefix  optional key prefix (leading/trailing slashes ignored)
 * @param {string} key     relative storage key (POSIX-style)
 * @returns {string} the object key to use in the bucket/container
 */
function toObjectKey(prefix, key) {
  if (typeof key !== 'string' || key.length === 0) {
    throw Object.assign(new Error('Invalid storage key'), { statusCode: 400 });
  }
  const rel = key.replace(/\\/g, '/').replace(/^\/+/, '');
  // Keys are always flat, relative, namespaced paths — never traversal.
  if (rel.split('/').includes('..')) {
    throw Object.assign(new Error('Invalid storage key'), { statusCode: 400 });
  }
  const p = String(prefix || '').replace(/^\/+/, '').replace(/\/+$/, '');
  return p ? `${p}/${rel}` : rel;
}

module.exports = { toObjectKey };
