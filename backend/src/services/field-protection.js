'use strict';

const crypto = require('crypto');
const { logger } = require('./logging.service');

/**
 * Field-level protection for personal data (PRD X-08, E-16, DOC-FR-06).
 *
 *   encrypt — a field whose UiField.config.encrypt is true is stored
 *             AES-256-GCM encrypted in record_field_values.str_value as
 *             `enc:v1:<iv>:<tag>:<ciphertext>` (base64url). Reads decrypt it
 *             transparently wherever a typed value is read, because the value
 *             describes itself — no read path needs the field's config.
 *   mask    — a field whose config.pii is true is masked in API responses for
 *             viewers without the "view PII" permission; revealing it is an
 *             explicit, audited action.
 *
 * Key: FIELD_ENCRYPTION_KEY (32 bytes as 64 hex chars or base64). Without it,
 * a key is derived from JWT_SECRET so development works, with a warning —
 * production must set its own key and keep it in the secrets manager.
 */

const PREFIX = 'enc:v1:';
let cachedKey = null;

function key() {
  if (cachedKey) return cachedKey;
  const raw = process.env.FIELD_ENCRYPTION_KEY;
  if (raw) {
    const buf = /^[0-9a-f]{64}$/i.test(raw) ? Buffer.from(raw, 'hex') : Buffer.from(raw, 'base64');
    if (buf.length !== 32) throw new Error('FIELD_ENCRYPTION_KEY must be 32 bytes (64 hex chars or base64)');
    cachedKey = buf;
  } else {
    logger?.warn?.('[field-protection] FIELD_ENCRYPTION_KEY is not set — deriving a key from JWT_SECRET. Set a dedicated key in production.');
    cachedKey = crypto.createHash('sha256').update(`genesis-field-key|${process.env.JWT_SECRET ?? 'dev'}`).digest();
  }
  return cachedKey;
}

const isEncrypted = (v) => typeof v === 'string' && v.startsWith(PREFIX);

function encrypt(plain) {
  if (plain == null || plain === '' || isEncrypted(plain)) return plain;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key(), iv);
  const ct = Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final()]);
  return `${PREFIX}${iv.toString('base64url')}:${cipher.getAuthTag().toString('base64url')}:${ct.toString('base64url')}`;
}

function decrypt(value) {
  if (!isEncrypted(value)) return value;
  try {
    const [iv, tag, ct] = value.slice(PREFIX.length).split(':');
    const decipher = crypto.createDecipheriv('aes-256-gcm', key(), Buffer.from(iv, 'base64url'));
    decipher.setAuthTag(Buffer.from(tag, 'base64url'));
    return Buffer.concat([decipher.update(Buffer.from(ct, 'base64url')), decipher.final()]).toString('utf8');
  } catch {
    // Wrong key or tampered value: never fall back to showing ciphertext.
    return '[encrypted]';
  }
}

/** Mask a value for display: keep the last four characters of text. */
function mask(value) {
  if (value == null || value === '') return value;
  if (typeof value === 'number') return '••••••';
  const s = String(value);
  return s.length <= 4 ? '••••' : `${'•'.repeat(Math.min(8, s.length - 4))}${s.slice(-4)}`;
}

/** For tests: forget the cached key (e.g. after changing the env). */
function _resetKey() { cachedKey = null; }

module.exports = { encrypt, decrypt, mask, isEncrypted, _resetKey, PREFIX };
