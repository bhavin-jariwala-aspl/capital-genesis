/**
 * Genesis CRM — Database Seed
 *
 * Rebuilds a database from empty: the platform layer (system role, plans,
 * feature flags, security policy, rate limits, announcement), then the
 * Genesis Capital workspace from its vertical pack (prisma/verticals/genesis-capital),
 * then the platform administrator.
 *
 *   node prisma/seed.js                 # local database, with demo records
 *   node prisma/seed.js --no-demo       # metadata and staff only
 *   node prisma/seed.js --allow-remote  # required when DATABASE_URL is not local
 *
 * ⚠️  Every table is emptied first. The script refuses a non-local DATABASE_URL
 * unless --allow-remote (or SEED_ALLOW_REMOTE=1) is given, and it only runs when
 * executed directly — requiring it does nothing.
 *
 * A demo install over a remote database takes 40–60 minutes; a local one a few.
 */
'use strict';

const path   = require('path');
const bcrypt = require('bcryptjs');
const Redis  = require('ioredis');
require('dotenv').config({ path: path.join(__dirname, '..', '.env'), quiet: true });

const { PrismaClient, Prisma } = require('@prisma/client');

const PACK = 'genesis-capital';
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', 'mysql', 'db', 'host.docker.internal']);

// ─── Redis cache flush ─────────────────────────────────────────────────────────
async function flushRedisCache() {
  let redis;
  try {
    redis = process.env.REDIS_URL
      ? new Redis(process.env.REDIS_URL, { maxRetriesPerRequest: 1, connectTimeout: 3000, lazyConnect: true })
      : new Redis({
        host: process.env.REDIS_HOST || 'localhost',
        port: Number(process.env.REDIS_PORT) || 6379,
        password: process.env.REDIS_PASSWORD || undefined,
        db: Number(process.env.REDIS_DB) || 0,
        maxRetriesPerRequest: 1, connectTimeout: 3000, lazyConnect: true,
      });
    await redis.connect();
    let cursor = '0';
    let deleted = 0;
    do {
      const [next, keys] = await redis.scan(cursor, 'MATCH', 'genesis:*', 'COUNT', 100);
      cursor = next;
      if (keys.length) { await redis.del(...keys); deleted += keys.length; }
    } while (cursor !== '0');
    console.log(`✅ Redis cache flushed (${deleted} keys removed)`);
  } catch (e) {
    console.log('⚠️  Redis flush skipped:', e.message);
  } finally {
    try { if (redis) redis.disconnect(); } catch (_) { /* already closed */ }
  }
}

// ─── Empty every table ─────────────────────────────────────────────────────────
// The table list comes from the Prisma schema, so a new model is cleared without
// editing this file (a hand-kept list had fallen 30 tables behind the schema and
// left rows that broke the platform-wide unique employee and branch codes).
async function clearDatabase(prisma) {
  console.log('🧹 Clearing database...');
  const tables = Prisma.dmmf.datamodel.models.map((m) => m.dbName || m.name);
  // One connection, so the FK bypass applies to every delete.
  await prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS = 0');
    for (const t of tables) await tx.$executeRawUnsafe(`DELETE FROM \`${t}\``);
    await tx.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS = 1');
  }, { timeout: 600000, maxWait: 60000 });
  console.log(`✅ Database cleared (${tables.length} tables)`);
}

// ─── Platform layer ────────────────────────────────────────────────────────────
async function seedPlatform(prisma) {
  await prisma.role.create({
    data: { name: 'platform_admin', label: 'Platform Administrator', description: 'SaaS platform-level super administrator', level: 1, tenant_id: null },
  });

  // Plan feature lists come from the catalogue's `min_plan` derivation, so
  // Professional is always a superset of Starter and a new catalogue entry lands
  // in the right tiers automatically.
  const { FEATURES, defaultFeaturesForPlan } = require('../src/services/platform/feature-catalogue');
  const planDefs = [
    { name: 'free',         label: 'Free',         description: 'Evaluate Genesis with a single-office team',                   price_monthly: 0,   price_annual: 0,    max_users: 3,   max_storage_mb: 100,   max_api_calls: 1000,   max_records: 1000,   max_workflows: 1,   max_dashboards: 1,   trial_days: 0,  order_index: 1 },
    { name: 'starter',      label: 'Starter',      description: 'Pipelines, workflows and reports for a small team',           price_monthly: 29,  price_annual: 290,  max_users: 10,  max_storage_mb: 1000,  max_api_calls: 10000,  max_records: 10000,  max_workflows: 5,   max_dashboards: 3,   trial_days: 14, order_index: 2 },
    { name: 'professional', label: 'Professional', description: 'Assignment, scoring, SLAs and automation for a growing team', price_monthly: 79,  price_annual: 790,  max_users: 50,  max_storage_mb: 5000,  max_api_calls: 50000,  max_records: 100000, max_workflows: 25,  max_dashboards: 10,  trial_days: 14, order_index: 3 },
    { name: 'enterprise',   label: 'Enterprise',   description: 'The full platform, with SSO, API v2 and AI assistance',       price_monthly: 199, price_annual: 1990, max_users: 999, max_storage_mb: 50000, max_api_calls: 500000, max_records: 999999, max_workflows: 999, max_dashboards: 999, trial_days: 30, order_index: 4 },
  ];
  for (const def of planDefs) {
    await prisma.subscriptionPlan.create({ data: { ...def, features: defaultFeaturesForPlan(def.name) } });
  }

  // A flag adds rollout control on top of a plan entitlement, so only catalogue
  // entries marked `flag: true` get a row. The pre-catalogue name is kept where
  // deployed rows and call sites already use it (`advanced_workflows`).
  const flagDefs = FEATURES.filter((x) => x.flag).map((x) => ({
    name:            x.legacy ?? x.key,
    label:           x.label,
    description:     x.description,
    category:        x.min_plan === 'enterprise' ? 'premium' : 'general',
    is_enabled:      true,
    rollout_percent: 100,
    created_by:      'PLATFORM01',
  }));
  // API v2 is genuinely mid-rollout — the one flag whose row is not a no-op.
  const apiV2 = flagDefs.find((f) => f.name === 'api_v2');
  if (apiV2) Object.assign(apiV2, { is_enabled: false, rollout_percent: 10, category: 'beta' });
  for (const def of flagDefs) await prisma.featureFlag.create({ data: def });

  await prisma.securityPolicy.create({
    data: {
      tenant_id: null, require_mfa: false, password_min_length: 8, password_require_upper: true,
      password_require_number: true, password_require_special: false, password_expiry_days: 0,
      max_login_attempts: 5, lockout_duration_min: 30, session_timeout_min: 480, updated_by: 'PLATFORM01',
    },
  });

  await prisma.apiRateLimit.createMany({
    data: [
      { name: 'Free Plan Default',         plan_name: 'free',         requests_per_minute: 20,  requests_per_hour: 200,   requests_per_day: 1000,   burst_limit: 30  },
      { name: 'Starter Plan Default',      plan_name: 'starter',      requests_per_minute: 60,  requests_per_hour: 1000,  requests_per_day: 10000,  burst_limit: 100 },
      { name: 'Professional Plan Default', plan_name: 'professional', requests_per_minute: 120, requests_per_hour: 5000,  requests_per_day: 50000,  burst_limit: 200 },
      { name: 'Enterprise Plan Default',   plan_name: 'enterprise',   requests_per_minute: 300, requests_per_hour: 20000, requests_per_day: 500000, burst_limit: 500 },
    ],
  });

  await prisma.systemAnnouncement.create({
    data: {
      title: 'Welcome to Genesis Capital',
      message: 'Your CRM is ready. Every module, workflow and dashboard is Builder metadata you can change.',
      severity: 'info', type: 'banner', target: 'all', is_active: true, is_dismissible: true,
      active_from: new Date(), created_by: 'PLATFORM01',
    },
  });
  console.log(`✅ Platform: role · ${planDefs.length} plans · ${flagDefs.length} feature flags · security policy · rate limits · announcement`);
}

// The platform administrator signs in through a tenant like everyone else; it
// lives in the Genesis Capital workspace's head office.
async function seedPlatformAdmin(prisma, tenantId) {
  const branch = await prisma.branch.findFirst({ where: { tenant_id: tenantId }, orderBy: { branch_id: 'asc' } });
  await prisma.employee.create({
    data: {
      employee_id: 'PLATFORM01', employee_name: 'Platform Super Admin', role: 'platform_admin',
      email: 'platform@genesis-capital.demo', password: await bcrypt.hash(process.env.SEED_PLATFORM_PASSWORD || 'Platform@123', 12),
      branch_id: branch?.branch_id ?? null, region_id: branch?.region_id ?? null, tenant_id: tenantId,
    },
  });
  await prisma.employeeHierarchy.create({ data: { ancestor_id: 'PLATFORM01', descendant_id: 'PLATFORM01', depth: 0, tenant_id: tenantId } });
  console.log('✅ Platform administrator PLATFORM01 created');
}

async function main() {
  const host = new URL(process.env.DATABASE_URL).hostname;
  if (!LOCAL_HOSTS.has(host) && !process.argv.includes('--allow-remote') && process.env.SEED_ALLOW_REMOTE !== '1') {
    throw new Error(`DATABASE_URL points at ${host}, not a local database. The seed empties every table — re-run with --allow-remote if that is intended.`);
  }
  const demo = !process.argv.includes('--no-demo');
  const staffPassword = process.env.SEED_STAFF_PASSWORD || 'GenesisDemo#2026';

  console.log('🌱 Seeding Genesis CRM database...\n');
  const prisma = new PrismaClient();
  try {
    await clearDatabase(prisma);
    await flushRedisCache();
    await seedPlatform(prisma);
  } finally {
    await prisma.$disconnect();
  }

  const { installVertical } = require('../scripts/install-vertical');
  const { tenant } = await installVertical(PACK, { createTenant: true, demo, password: staffPassword });

  const db = new PrismaClient();
  try {
    await seedPlatformAdmin(db, tenant.id);
  } finally {
    await db.$disconnect();
  }

  console.log('\n══════════════════════════════════════════════════════');
  console.log(`🎉  Seed complete — workspace #${tenant.id} ${tenant.slug}${demo ? ' with demo data' : ''}`);
  console.log('  Platform console:  PLATFORM01 / Platform@123 (SEED_PLATFORM_PASSWORD)');
  console.log(`  Workspace admin:   GCADMIN    / ${staffPassword} (SEED_STAFF_PASSWORD)`);
  console.log('  All 22 staff accounts: docs/genesis-capital/implementation.md §0');
  console.log('  Restart the backend so it drops cached data.');
  console.log('══════════════════════════════════════════════════════');
}

module.exports = { clearDatabase, seedPlatform, seedPlatformAdmin };

if (require.main === module) {
  main().catch((e) => { console.error('❌ Seed failed:', e.message); process.exit(1); });
}
