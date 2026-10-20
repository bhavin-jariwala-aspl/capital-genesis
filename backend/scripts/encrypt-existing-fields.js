#!/usr/bin/env node
'use strict';

/**
 * Encrypt values stored in plain text before encryption applied to them:
 *   - record values of every Builder field marked `config.encrypt` (PRD DATA-FR-02);
 *   - social-media account tokens (`access_token`, `refresh_token`), which the
 *     API has written encrypted since October 2026.
 * Values that are already encrypted are skipped, so the script is safe to run
 * repeatedly.
 *
 *   node scripts/encrypt-existing-fields.js            # dry run: counts only
 *   node scripts/encrypt-existing-fields.js --apply    # write the ciphertext
 *
 * Uses the same key as the API: FIELD_ENCRYPTION_KEY, or the key derived from
 * JWT_SECRET when it is unset — run it with the API's environment.
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env'), quiet: true });

const { PrismaClient } = require('@prisma/client');
const { encrypt, isEncrypted } = require('../src/services/field-protection');

const apply = process.argv.includes('--apply');

async function main() {
  console.log(process.env.FIELD_ENCRYPTION_KEY ? 'Key: FIELD_ENCRYPTION_KEY' : 'Key: derived from JWT_SECRET (FIELD_ENCRYPTION_KEY is not set)');
  const db = new PrismaClient();
  try {
    const fields = (await db.uiField.findMany({ select: { id: true, name: true, object_id: true, config: true } }))
      .filter((f) => f.config && f.config.encrypt === true);
    let total = 0;
    if (!fields.length) console.log('No fields are marked for encryption.');
    for (const f of fields) {
      const rows = await db.recordFieldValue.findMany({
        where: { field_name: f.name, str_value: { not: null }, record: { object_id: f.object_id } },
        select: { id: true, str_value: true },
      });
      const plain = rows.filter((r) => r.str_value !== '' && !isEncrypted(r.str_value));
      total += plain.length;
      console.log(`  object ${f.object_id} · ${f.name}: ${plain.length} plaintext of ${rows.length}`);
      if (!apply) continue;
      for (const r of plain) {
        // Guarded write: only replace the exact plaintext we read.
        await db.recordFieldValue.updateMany({ where: { id: r.id, str_value: r.str_value }, data: { str_value: encrypt(r.str_value) } });
      }
    }

    // Social-media credentials (all tenants — this runs without a tenant context).
    const accounts = await db.socialMediaAccount.findMany({ select: { id: true, access_token: true, refresh_token: true } });
    let tokens = 0;
    for (const a of accounts) {
      const data = {};
      for (const k of ['access_token', 'refresh_token']) if (a[k] && !isEncrypted(a[k])) data[k] = encrypt(a[k]);
      if (!Object.keys(data).length) continue;
      tokens += Object.keys(data).length;
      if (apply) {
        // Guarded write: only replace the exact values we read.
        await db.socialMediaAccount.updateMany({ where: { id: a.id, access_token: a.access_token, refresh_token: a.refresh_token }, data });
      }
    }
    console.log(`  social-media accounts: ${tokens} plaintext token(s) across ${accounts.length} account(s)`);
    total += tokens;

    console.log(apply ? `Encrypted ${total} value(s).` : `${total} value(s) would be encrypted. Re-run with --apply to write them.`);
  } finally {
    await db.$disconnect();
  }
}

main().catch((err) => { console.error(`❌ ${err.message}`); process.exit(1); });
