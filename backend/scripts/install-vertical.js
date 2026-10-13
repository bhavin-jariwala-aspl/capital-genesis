#!/usr/bin/env node
'use strict';

/**
 * Install a vertical pack (an industry configuration made of Builder metadata)
 * into one tenant.
 *
 *   node scripts/install-vertical.js swan-capital --create-tenant           # create + install
 *   node scripts/install-vertical.js swan-capital --tenant swan-capital     # re-install (idempotent)
 *   node scripts/install-vertical.js swan-capital --tenant 12 --demo        # include demo records
 *   node scripts/install-vertical.js swan-capital --dry-run                 # validate the pack only
 *
 * Options
 *   --tenant <id|slug>   target tenant (default: the pack's own slug)
 *   --create-tenant      create the tenant from the pack if it does not exist,
 *                        then run the onboarding steps it needs (role ladder,
 *                        office) — not the generic CRM metadata clone
 *   --demo               also install the pack's demo records
 *   --password <pw>      password for staff accounts created now (otherwise a
 *                        random one per account, printed once)
 *
 * Packs live in prisma/verticals/<name>/. The installer itself is generic
 * (src/services/vertical-installer.service.js).
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env'), quiet: true });

const { PrismaClient } = require('@prisma/client');
const { applyTenantMiddleware, tenantContext } = require('../src/middleware/tenant-scope');
const VerticalInstaller = require('../src/services/vertical-installer.service');
const TenantService = require('../src/services/platform/tenant.service');
const TenantProvisioningService = require('../src/services/platform/tenant-provisioning.service');

function arg(name) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  const packName = process.argv[2];
  if (!packName || packName.startsWith('--')) {
    console.error('Usage: node scripts/install-vertical.js <pack> [--tenant <id|slug>] [--create-tenant] [--demo] [--password <pw>] [--dry-run]');
    process.exit(1);
  }
  const pack = require(path.join(__dirname, '..', 'prisma', 'verticals', packName));
  const counts = Object.fromEntries(Object.entries(pack).filter(([, v]) => Array.isArray(v)).map(([k, v]) => [k, v.length]));
  console.log(`📦 ${pack.key}:`, counts);
  if (process.argv.includes('--dry-run')) {
    console.log('Dry run — pack loaded; run `npx jest tests/swan-pack.test.js` for the full consistency check.');
    return;
  }

  const raw = new PrismaClient();
  const prisma = applyTenantMiddleware(raw);
  try {
    const target = arg('--tenant') ?? pack.tenant.slug;
    let tenant = /^\d+$/.test(target)
      ? await raw.tenant.findUnique({ where: { id: Number(target) } })
      : await raw.tenant.findUnique({ where: { slug: target } });

    if (!tenant) {
      if (!process.argv.includes('--create-tenant')) throw new Error(`Tenant ${target} not found — pass --create-tenant to create it`);
      tenant = await new TenantService(raw).create({ ...pack.tenant, status: 'active' });
      await raw.tenant.update({ where: { id: tenant.id }, data: { status: 'active', trial_ends_at: null, metadata: pack.tenant.metadata ?? null, timezone: pack.tenant.timezone ?? 'UTC' } });
      console.log(`🏢 created tenant #${tenant.id} ${tenant.slug}`);
      // The vertical replaces the generic CRM catalogue, so only the
      // structural onboarding steps run here.
      const prov = await new TenantProvisioningService(prisma).provision(tenant.id, { only: ['roles', 'org'] });
      for (const s of prov.steps ?? []) console.log(`   · ${s.title ?? s.key}: ${s.status ?? ''} ${s.detail ?? ''}`);
    }
    console.log(`▶ installing ${pack.key} into tenant #${tenant.id} (${tenant.slug})${process.argv.includes('--demo') ? ' with demo data' : ''}`);

    const started = Date.now();
    const result = await tenantContext.run({ tenantId: tenant.id }, () =>
      new VerticalInstaller(prisma, {
        tenantId: tenant.id,
        demo: process.argv.includes('--demo'),
        password: arg('--password') ?? process.env.VERTICAL_STAFF_PASSWORD ?? null,
        log: (m) => console.log(m),
      }).install(pack));

    console.log(`✅ installed in ${((Date.now() - started) / 1000).toFixed(0)}s — written:`, result.summary);
    if (Object.keys(result.unchanged ?? {}).length) console.log('   unchanged (skipped):', result.unchanged);
    if (result.publicForms.length) {
      console.log('🌐 public forms:');
      for (const f of result.publicForms) console.log(`   ${f.form}: ${f.path}`);
    }
    if (result.credentials.length) {
      console.log('🔑 staff accounts created (passwords shown once — change them on first login):');
      for (const c of result.credentials) console.log(`   ${c.employee_id.padEnd(10)} ${c.role.padEnd(24)} ${c.password}`);
    }
  } finally {
    await raw.$disconnect();
  }
}

main().catch((err) => {
  console.error('❌', err.message);
  process.exit(1);
});
