'use strict';

const path = require('path');
const crypto = require('crypto');
const config = require('../../config');
const { LocalStorageProvider } = require('./LocalStorageProvider');

/**
 * Storage layer entry point.
 *
 * Exposes a single shared StorageProvider instance (selected by config) plus
 * the helpers used to build canonical, tenant-first storage keys. Every route
 * or service that touches document bytes should import from here rather than
 * calling `fs` directly.
 */

let _provider = null;

/** @returns {import('./StorageProvider').StorageProvider} the shared provider */
function getStorage() {
  if (_provider) return _provider;
  switch (config.storage.driver) {
    case 'local':
      _provider = new LocalStorageProvider({ root: config.storage.root });
      break;
    case 's3': {
      // Required lazily so the AWS SDK is only loaded when the s3 driver is used.
      // Also handles S3-compatible stores (MinIO, Cloudflare R2, Backblaze B2,
      // DigitalOcean Spaces, Wasabi) via config.storage.s3.endpoint.
      const { S3StorageProvider } = require('./S3StorageProvider');
      _provider = new S3StorageProvider(config.storage.s3);
      break;
    }
    case 'azure': {
      const { AzureBlobStorageProvider } = require('./AzureBlobStorageProvider');
      _provider = new AzureBlobStorageProvider(config.storage.azure);
      break;
    }
    case 'gcs': {
      const { GcsStorageProvider } = require('./GcsStorageProvider');
      _provider = new GcsStorageProvider(config.storage.gcs);
      break;
    }
    default:
      throw new Error(`Unknown storage driver: ${config.storage.driver}`);
  }
  return _provider;
}

// ── Key building ────────────────────────────────────────────────────────────

/** Make a path segment safe: alphanumerics, dash, underscore only. */
function safeSegment(value, fallback = 'unknown') {
  const s = String(value ?? '').replace(/[^a-zA-Z0-9_-]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '');
  return s.length ? s.slice(0, 120) : fallback;
}

/** Sanitise a user filename, preserving the extension. */
function safeFilename(original) {
  const ext = path.extname(String(original ?? '')).slice(0, 20);
  const base = path.basename(String(original ?? ''), ext)
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 100) || 'file';
  return `${base}${ext}`;
}

/**
 * Build the canonical, tenant-first storage key for a document. Tenant is
 * always the top-level segment so tenant IDs can never collide with a
 * year-partition or any other dimension.
 *
 *   {tenant_id}/{entity_type}/{entity_id}/{category}/{uuid}_{filename}
 *
 * @param {object} p
 * @param {number|string} p.tenantId
 * @param {string} [p.entityType]  e.g. lead|contact|application|policy
 * @param {number|string} [p.entityId]
 * @param {string} [p.category]    e.g. contract|proof_of_income|reports
 * @param {string} p.filename      original filename (only used for the leaf)
 * @returns {string} relative storage key (POSIX separators)
 */
function buildDocumentKey({ tenantId, entityType, entityId, category, filename }) {
  const uid = crypto.randomBytes(8).toString('hex');
  const leaf = `${uid}_${safeFilename(filename)}`;
  return [
    safeSegment(tenantId, 'unknown_tenant'),
    safeSegment(entityType, 'general'),
    safeSegment(entityId, 'none'),
    safeSegment(category, 'other'),
    leaf,
  ].join('/');
}

/** SHA-256 hex digest — integrity verification & dedup. */
function hashBuffer(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

module.exports = {
  getStorage,
  buildDocumentKey,
  safeFilename,
  safeSegment,
  hashBuffer,
};
