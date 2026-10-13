#!/usr/bin/env node
'use strict';

/**
 * Encrypt values stored before a field was marked `config.encrypt` (PRD
 * DATA-FR-02). Every Builder field with `config.encrypt: true` is visited and
 * its plaintext EAV values are rewritten as `enc:v1:` ciphertext. Values that
 * are already encrypted are skipped, so the script is safe to run repeatedly.
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
    if (!fields.length) { console.log('No fields are marked for encryption.'); return; }
    let total = 0;
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
    console.log(apply ? `Encrypted ${total} value(s).` : `${total} value(s) would be encrypted. Re-run with --apply to write them.`);
  } finally {
    await db.$disconnect();
  }
}

main().catch((err) => { console.error(`❌ ${err.message}`); process.exit(1); });
