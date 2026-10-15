'use strict';

const crypto = require('crypto');

/**
 * Open tracking for distribution emails (PRD MKT-FR-04).
 *
 * Each email carries a 1×1 image whose URL holds a signed token naming the
 * tenant, the record the email was about, the recipient (as a hash) and the
 * record field that counts opens. Loading the image stamps `opened_at` on that
 * email's log row and refreshes the count on the record. Nothing about the
 * recipient is readable from the URL.
 */

const PREFIX = 'geo1';
const secret = () => crypto.createHash('sha256').update(`genesis-email-open|${process.env.JWT_SECRET || 'dev'}`).digest();
const b64 = (buf) => Buffer.from(buf).toString('base64url');
const hashEmail = (email) => crypto.createHash('sha256').update(String(email).trim().toLowerCase()).digest('hex').slice(0, 24);

function signOpen({ tenantId, recordId, email, field }) {
  const body = b64(JSON.stringify({ t: Number(tenantId), r: Number(recordId), h: hashEmail(email), f: field ?? null }));
  return `${PREFIX}.${body}.${b64(crypto.createHmac('sha256', secret()).update(body).digest())}`;
}

function verifyOpen(token) {
  const parts = String(token ?? '').split('.');
  if (parts.length !== 3 || parts[0] !== PREFIX) return null;
  const want = Buffer.from(b64(crypto.createHmac('sha256', secret()).update(parts[1]).digest()));
  const got = Buffer.from(parts[2]);
  if (want.length !== got.length || !crypto.timingSafeEqual(want, got)) return null;
  try {
    const p = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
    return Number.isInteger(p?.t) && Number.isInteger(p?.r) && typeof p?.h === 'string' ? p : null;
  } catch { return null; }
}

/** The tracking image for one recipient. */
function pixel({ base, tenantId, recordId, email, field }) {
  const url = `${String(base).replace(/\/+$/, '')}/api/public/email-open/${signOpen({ tenantId, recordId, email, field })}.gif`;
  return `<img src="${url}" width="1" height="1" alt="" style="display:block;border:0;width:1px;height:1px">`;
}

/**
 * Record an open: stamp the first matching unopened log and refresh the
 * record's open count. Idempotent — a second load changes nothing.
 * @param {import('@prisma/client').PrismaClient} prisma tenant-scoped client
 */
async function recordOpen(prisma, p) {
  const logs = await prisma.emailLog.findMany({
    where: { related_record_id: p.r, related_type: { startsWith: 'distribution' }, opened_at: null },
    select: { id: true, to_email: true }, take: 2000,
  });
  const mine = logs.find((l) => hashEmail(l.to_email) === p.h);
  if (!mine) return false;
  await prisma.emailLog.update({ where: { id: mine.id }, data: { opened_at: new Date() } });
  if (p.f && /^[a-z_][a-z0-9_]{0,99}$/.test(p.f)) {
    const opens = await prisma.emailLog.count({ where: { related_record_id: p.r, related_type: `distribution:${p.f}`, opened_at: { not: null } } });
    await prisma.recordFieldValue.upsert({
      where: { record_id_field_name: { record_id: p.r, field_name: p.f } },
      create: { record_id: p.r, field_name: p.f, num_value: opens, tenant_id: p.t },
      update: { num_value: opens },
    });
  }
  return true;
}

/** A transparent 1×1 GIF. */
const GIF = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');

module.exports = { signOpen, verifyOpen, pixel, recordOpen, hashEmail, GIF };
