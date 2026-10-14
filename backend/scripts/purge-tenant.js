#!/usr/bin/env node
'use strict';

/**
 * Permanently delete one or more tenants and every row they own.
 *
 *   node scripts/purge-tenant.js old-demo                 # dry run: counts only
 *   node scripts/purge-tenant.js old-demo 12 --yes        # delete
 *   node scripts/purge-tenant.js old-demo --yes --keep-employee PLATFORM01 --move-to acme
 *
 * The platform's DELETE /tenants/:id is a soft delete (status `deleted`, restorable
 * for 30 days). This script is the hard delete, for demo and test environments.
 * It cannot be undone.
 *
 * Options
 *   --yes                     actually delete (otherwise only counts are printed)
 *   --keep-employee <id>      move this employee to the --move-to tenant instead of
 *                             deleting it (repeatable) — use it for the platform admin
 *   --move-to <id|slug>       destination tenant for --keep-employee
 *
 * Every tenant-owned table carries `tenant_id`, so the table list comes from the
 * Prisma schema and a new model is covered without editing this file. Files under
 * uploads/<tenant id>/ are removed too when the local storage driver is in use.
 */

const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env'), quiet: true });

const { PrismaClient, Prisma } = require('@prisma/client');

function argList(name) {
  const out = [];
  process.argv.forEach((a, i) => { if (a === name && process.argv[i + 1]) out.push(process.argv[i + 1]); });
  return out;
}

const tenantTables = () => Prisma.dmmf.datamodel.models
  .filter((m) => m.fields.some((f) => f.name === 'tenant_id'))
  .map((m) => m.dbName || m.name);

async function findTenant(db, ref) {
  return /^\d+$/.test(ref)
    ? db.tenant.findUnique({ where: { id: Number(ref) } })
    : db.tenant.findUnique({ where: { slug: ref } });
}

async function main() {
  const flagValues = new Set([...argList('--keep-employee'), ...argList('--move-to')]);
  const refs = process.argv.slice(2).filter((a) => !a.startsWith('--') && !flagValues.has(a));
  if (!refs.length) {
    console.error('Usage: node scripts/purge-tenant.js <id|slug>... [--yes] [--keep-employee <id> --move-to <id|slug>]');
    process.exit(1);
  }
  const execute = process.argv.includes('--yes');
  const keep = argList('--keep-employee');
  const db = new PrismaClient();
  try {
    const tenants = [];
    for (const ref of refs) {
      const t = await findTenant(db, ref);
      if (!t) throw new Error(`Tenant ${ref} not found`);
      tenants.push(t);
    }
    const ids = tenants.map((t) => t.id);
    let dest = null;
    if (keep.length) {
      const moveTo = argList('--move-to')[0];
      if (!moveTo) throw new Error('--keep-employee needs --move-to');
      dest = await findTenant(db, moveTo);
      if (!dest) throw new Error(`Tenant ${moveTo} not found`);
      if (ids.includes(dest.id)) throw new Error('--move-to cannot be a tenant being purged');
    }

    console.log(`${execute ? '🗑  Purging' : '🔎 Dry run for'}: ${tenants.map((t) => `#${t.id} ${t.slug} (${t.name})`).join(', ')}`);
    const list = ids.join(',');
    const counts = {};
    for (const table of tenantTables()) {
      const [{ n }] = await db.$queryRawUnsafe(`SELECT COUNT(*) AS n FROM \`${table}\` WHERE tenant_id IN (${list})`);
      if (Number(n)) counts[table] = Number(n);
    }
    console.log(counts);
    if (keep.length) console.log(`   keeping ${keep.join(', ')} → tenant #${dest.id} ${dest.slug}`);
    if (!execute) { console.log('Nothing deleted — pass --yes to purge.'); return; }

    await db.$transaction(async (tx) => {
      for (const employeeId of keep) {
        // Branch and region belong to the purged tenant; the hierarchy self-row
        // moves with the employee so hierarchy lookups still resolve.
        const branch = await tx.branch.findFirst({ where: { tenant_id: dest.id }, orderBy: { branch_id: 'asc' } });
        const moved = await tx.$executeRawUnsafe(
          `UPDATE employees SET tenant_id = ?, branch_id = ?, region_id = ? WHERE employee_id = ? AND tenant_id IN (${list})`,
          dest.id, branch?.branch_id ?? null, branch?.region_id ?? null, employeeId,
        );
        if (!moved) throw new Error(`Employee ${employeeId} is not in a purged tenant`);
        await tx.$executeRawUnsafe(
          'DELETE FROM employee_hierarchy WHERE (ancestor_id = ? OR descendant_id = ?) AND ancestor_id <> descendant_id',
          employeeId, employeeId,
        );
        await tx.$executeRawUnsafe('UPDATE employee_hierarchy SET tenant_id = ? WHERE ancestor_id = ? AND descendant_id = ?', dest.id, employeeId, employeeId);
        await tx.$executeRawUnsafe(`DELETE FROM auth_refresh_tokens WHERE employee_id = ? AND tenant_id IN (${list})`, employeeId);
        console.log(`   ↪ kept ${employeeId} → tenant #${dest.id}`);
      }
      // Same connection as the deletes, so the FK bypass applies to them.
      await tx.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS = 0');
      for (const table of Object.keys(counts)) {
        await tx.$executeRawUnsafe(`DELETE FROM \`${table}\` WHERE tenant_id IN (${list})`);
      }
      await tx.$executeRawUnsafe(`DELETE FROM impersonation_logs WHERE target_tenant_id IN (${list})`);
      await tx.$executeRawUnsafe(`DELETE FROM platform_audit_logs WHERE target_type = 'tenant' AND target_id IN (${ids.map((i) => `'${i}'`).join(',')})`);
      await tx.$executeRawUnsafe(`DELETE FROM tenants WHERE id IN (${list})`);
      await tx.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS = 1');
    }, { timeout: 600000, maxWait: 60000 });

    if ((process.env.STORAGE_DRIVER || 'local') === 'local') {
      const uploads = path.join(__dirname, '..', 'uploads');
      for (const id of ids) fs.rmSync(path.join(uploads, String(id)), { recursive: true, force: true });
    }
    console.log('✅ purged. Restart the backend (or flush Redis) so cached tenant data is dropped.');
  } finally {
    await db.$disconnect();
  }
}

main().catch((err) => {
  console.error('❌', err.message);
  process.exit(1);
});
