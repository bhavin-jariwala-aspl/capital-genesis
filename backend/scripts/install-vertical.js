#!/usr/bin/env node
'use strict';

/**
 * Install a vertical pack (an industry configuration made of Builder metadata)
 * into one tenant.
 *
 *   node scripts/install-vertical.js genesis-capital --create-tenant           # create + install
 *   node scripts/install-vertical.js genesis-capital --tenant genesis-capital     # re-install (idempotent)
 *   node scripts/install-vertical.js genesis-capital --tenant 12 --demo        # include demo records
 *   node scripts/install-vertical.js genesis-capital --dry-run                 # validate the pack only
 *
 * Options
 *   --tenant <id|slug>   target tenant (default: the pack's own slug)
 *   --create-tenant      create the tenant from the pack if it does not exist,
 *                        then run the onboarding steps it needs (role ladder,
 *                        office) — not the generic CRM metadata clone
 *   --demo               also install the pack's demo records
 *   --password <pw>      password for staff accounts created now (otherwise a
 *                        random one per account, printed once)
 *   --skip-records       with --demo: skip master data and demo records (already
 *                        loaded) and run only the ownership, history and
 *                        demo-activity steps
 *   --reset-passwords    with --password: set that password on every pack staff
 *                        account that already exists (demo environments only)
 *   --recompute[=a,b]    recompute every record's formulas for the named objects
 *                        (or all objects with formulas) — repairs values left
 *                        stale by earlier runs or manual edits
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

/**
 * Install `packName` into a tenant. Used by the CLI below and by prisma/seed.js.
 * Returns the installer result plus the tenant it ran against.
 */
async function installVertical(packName, opts = {}) {
  const pack = require(path.join(__dirname, '..', 'prisma', 'verticals', packName));
  const log = opts.log ?? ((m) => console.log(m));
  const counts = Object.fromEntries(Object.entries(pack).filter(([, v]) => Array.isArray(v)).map(([k, v]) => [k, v.length]));
  log(`📦 ${pack.key}: ${JSON.stringify(counts)}`);
  if (opts.dryRun) {
    log(`Dry run — pack loaded; run \`npx jest tests/${packName}-pack.test.js\` for the full consistency check.`);
    return null;
  }

  // A bulk load over a remote database can wait longer than Prisma's default
  // 10 s for a pooled connection when the database is busy; allow for that.
  const url = new URL(process.env.DATABASE_URL);
  if (!url.searchParams.has('pool_timeout')) url.searchParams.set('pool_timeout', '120');
  const raw = new PrismaClient({ datasources: { db: { url: url.toString() } } });
  // A long install over a remote database can outlive a network blip: retry
  // connection-level errors (unreachable, closed, pool timeout) with back-off.
  const TRANSIENT = new Set(['P1001', 'P1002', 'P1017', 'P2024']);
  const resilient = raw.$extends({
    query: {
      $allOperations: async ({ args, query, operation, model }) => {
        for (let attempt = 0; ; attempt += 1) {
          try { return await query(args); } catch (err) {
            if (!TRANSIENT.has(err?.code) || attempt >= 6) throw err;
            const wait = Math.min(60000, 2000 * 2 ** attempt);
            console.warn(`   ↻ ${model ?? ''}.${operation}: ${err.code}, retrying in ${wait / 1000}s`);
            await new Promise((ok) => setTimeout(ok, wait));
          }
        }
      },
    },
  });
  const prisma = applyTenantMiddleware(resilient);
  try {
    const target = opts.tenant ?? pack.tenant.slug;
    let tenant = /^\d+$/.test(String(target))
      ? await raw.tenant.findUnique({ where: { id: Number(target) } })
      : await raw.tenant.findUnique({ where: { slug: target } });

    if (!tenant) {
      if (!opts.createTenant) throw new Error(`Tenant ${target} not found — pass --create-tenant to create it`);
      tenant = await new TenantService(raw).create({ ...pack.tenant, status: 'active' });
      await raw.tenant.update({ where: { id: tenant.id }, data: { status: 'active', trial_ends_at: null, metadata: pack.tenant.metadata ?? null, timezone: pack.tenant.timezone ?? 'UTC' } });
      log(`🏢 created tenant #${tenant.id} ${tenant.slug}`);
      // The vertical replaces the generic CRM catalogue, so only the
      // structural onboarding steps run here.
      const prov = await new TenantProvisioningService(prisma).provision(tenant.id, { only: ['roles', 'org'] });
      for (const s of prov.steps ?? []) log(`   · ${s.title ?? s.key}: ${s.status ?? ''} ${s.detail ?? ''}`);
    }
    log(`▶ installing ${pack.key} into tenant #${tenant.id} (${tenant.slug})${opts.demo ? ' with demo data' : ''}`);

    const started = Date.now();
    const result = await tenantContext.run({ tenantId: tenant.id }, () =>
      new VerticalInstaller(prisma, {
        tenantId: tenant.id,
        demo: Boolean(opts.demo),
        password: opts.password ?? process.env.VERTICAL_STAFF_PASSWORD ?? null,
        resetPasswords: Boolean(opts.resetPasswords),
        skipRecords: Boolean(opts.skipRecords),
        recompute: opts.recompute ?? null,
        log,
      }).install(pack));

    log(`✅ installed in ${((Date.now() - started) / 1000).toFixed(0)}s — written: ${JSON.stringify(result.summary)}`);
    if (Object.keys(result.unchanged ?? {}).length) log(`   unchanged (skipped): ${JSON.stringify(result.unchanged)}`);
    if (result.publicForms.length) {
      log('🌐 public forms:');
      for (const f of result.publicForms) log(`   ${f.form}: ${f.path}`);
    }
    if (result.credentials.length) {
      log('🔑 staff accounts created (passwords shown once — change them on first login):');
      for (const c of result.credentials) log(`   ${c.employee_id.padEnd(10)} ${c.role.padEnd(24)} ${c.password}`);
    }
    return { ...result, tenant };
  } finally {
    await raw.$disconnect();
  }
}

function cliOptions(argv) {
  const value = (name) => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : undefined; };
  const recompute = argv.find((a) => a === '--recompute' || a.startsWith('--recompute='));
  return {
    tenant: value('--tenant'),
    createTenant: argv.includes('--create-tenant'),
    demo: argv.includes('--demo'),
    password: value('--password'),
    resetPasswords: argv.includes('--reset-passwords'),
    skipRecords: argv.includes('--skip-records'),
    dryRun: argv.includes('--dry-run'),
    recompute: !recompute ? null
      : recompute.includes('=') ? recompute.split('=')[1].split(',').map((x) => x.trim()).filter(Boolean) : true,
  };
}

module.exports = { installVertical };

if (require.main === module) {
  const packName = process.argv[2];
  if (!packName || packName.startsWith('--')) {
    console.error('Usage: node scripts/install-vertical.js <pack> [--tenant <id|slug>] [--create-tenant] [--demo] [--password <pw>] [--dry-run]');
    process.exit(1);
  }
  installVertical(packName, cliOptions(process.argv)).catch((err) => {
    console.error('❌', err.message);
    process.exit(1);
  });
}
