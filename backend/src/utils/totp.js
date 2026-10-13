'use strict';

const crypto = require('crypto');

/**
 * Time-based one-time passwords (RFC 6238 / RFC 4226) for staff MFA — the
 * codes any authenticator app (Microsoft / Google Authenticator, 1Password,
 * Authy) produces. SHA-1, 30-second step, 6 digits, ±1 step for clock drift.
 */

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function base32Encode(buf) {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) { out += ALPHABET[(value >>> (bits - 5)) & 31]; bits -= 5; }
  }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

function base32Decode(str) {
  const clean = String(str).toUpperCase().replace(/[^A-Z2-7]/g, '');
  let bits = 0;
  let value = 0;
  const out = [];
  for (const ch of clean) {
    value = (value << 5) | ALPHABET.indexOf(ch);
    bits += 5;
    if (bits >= 8) { out.push((value >>> (bits - 8)) & 255); bits -= 8; }
  }
  return Buffer.from(out);
}

/** A new 160-bit secret, base32 encoded. */
const generateSecret = () => base32Encode(crypto.randomBytes(20));

function hotp(secret, counter) {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(BigInt(counter));
  const mac = crypto.createHmac('sha1', base32Decode(secret)).update(buf).digest();
  const offset = mac[mac.length - 1] & 0xf;
  const code = ((mac[offset] & 0x7f) << 24) | (mac[offset + 1] << 16) | (mac[offset + 2] << 8) | mac[offset + 3];
  return String(code % 1_000_000).padStart(6, '0');
}

const step = (at = Date.now()) => Math.floor(at / 1000 / 30);

/** The current code (for tests and for showing during setup in development). */
const totp = (secret, at = Date.now()) => hotp(secret, step(at));

/** Constant-time check of a 6-digit code against the current step ±1. */
function verifyTotp(secret, code, at = Date.now()) {
  if (!/^\d{6}$/.test(String(code ?? ''))) return false;
  const want = Buffer.from(String(code));
  let ok = false;
  for (const delta of [-1, 0, 1]) {
    const got = Buffer.from(hotp(secret, step(at) + delta));
    if (crypto.timingSafeEqual(got, want)) ok = true;
  }
  return ok;
}

/** otpauth:// URI for enrolment (authenticator apps scan or open it). */
const otpauthUri = (secret, account, issuer = 'Genesis CRM') =>
  `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(account)}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;

/** Ten single-use recovery codes, and their hashes for storage. */
function recoveryCodes() {
  const codes = Array.from({ length: 10 }, () => crypto.randomBytes(5).toString('hex').toUpperCase().replace(/(.{5})/, '$1-'));
  return { codes, hashes: codes.map(hashRecovery) };
}
const hashRecovery = (code) => crypto.createHash('sha256').update(String(code).toUpperCase().replace(/[^A-Z0-9]/g, '')).digest('hex');

module.exports = { generateSecret, totp, verifyTotp, otpauthUri, recoveryCodes, hashRecovery, base32Encode, base32Decode };
