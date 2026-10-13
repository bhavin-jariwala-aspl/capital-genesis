#!/usr/bin/env node
'use strict';

/**
 * Replace Builder ▸ Workflows with the benchmarked CRM workflow catalogue.
 *
 * Run standalone against a live tenant:
 *     node scripts/seed-crm-workflows.js              # replace all workflows
 *     node scripts/seed-crm-workflows.js --dry-run    # show what would change
 *     node scripts/seed-crm-workflows.js --keep       # add without deleting
 *     node scripts/seed-crm-workflows.js --tenant 4   # target one tenant
 *
 * It is also imported by prisma/seed.js so `npm run db:seed` produces the same
 * suite — the catalogue itself lives in prisma/crm-workflows.js.
 */

const path = require('path');
const { WORKFLOWS, SUPPORTING_FIELDS } = require(path.join(__dirname, '..', 'prisma', 'crm-workflows'));

/**
 * Resolve `{{@manager}}`-style actor placeholders inside a step config.
 * Done on the serialised config so nested objects are covered in one pass.
 */
function resolvePlaceholders(config, actors) {
  if (config == null) return config;
  let json = JSON.stringify(config);
  for (const [token, employeeId] of Object.entries(actors)) {
    json = json.split(token).join(employeeId ?? '');
  }
  return JSON.parse(json);
}

/**
 * Create (or top up) the metadata fields the approval workflows write to, so
 * an approval outcome shows on the record instead of only in automation state.
 * Existing fields are left untouched.
 */
async function ensureSupportingFields(prisma, objectIds, log) {
  let created = 0;
  for (const spec of SUPPORTING_FIELDS) {
    for (const objectName of spec.objects) {
      const objectId = objectIds[objectName];
      if (!objectId) continue;
      const existing = await prisma.uiField.findFirst({
        where:  { object_id: objectId, name: spec.field.name },
        select: { id: true },
      });
      if (existing) continue;
      const last = await prisma.uiField.findFirst({
        where:   { object_id: objectId },
        orderBy: { order_index: 'desc' },
        select:  { order_index: true },
      });
      await prisma.uiField.create({
        data: { ...spec.field, object_id: objectId, order_index: (last?.order_index ?? 0) + 1 },
      });
      created++;
      log(`   + field ${objectName}.${spec.field.name}`);
    }
  }
  return created;
}

/**
 * Build one workflow and its steps.
 *
 * Steps are created first (so every row has an id), then a second pass writes
 * the on_true_id / on_false_id links, because a link can point forwards or
 * backwards in the chain.
 */
async function createWorkflow(prisma, def, objectIds, actors, log) {
  const objectId = objectIds[def.object];
  if (!objectId) {
    log(`   ⚠ skipped ${def.name} — object "${def.object}" not found in this tenant`);
    return null;
  }

  const workflow = await prisma.uiWorkflow.create({
    data: {
      object_id:      objectId,
      name:           def.name,
      label:          def.label,
      // The benchmark line is kept on the record so an admin opening the
      // workflow in the Builder can see which industry pattern it implements.
      description:    `${def.description}\n\nBenchmarked against: ${def.benchmark}`,
      trigger_type:   def.trigger_type,
      trigger_config: def.trigger_config ?? {},
      is_active:      true,
    },
  });

  const idByKey = {};
  for (const [i, step] of def.steps.entries()) {
    let config = resolvePlaceholders(step.config ?? {}, actors);
    // create_record steps reference their target by object name; resolve it to
    // the tenant's own object id so the catalogue stays portable.
    if (step.step_type === 'create_record' && config.object) {
      const targetId = objectIds[config.object];
      if (!targetId) {
        log(`   ⚠ ${def.name}: create_record target "${config.object}" not found — step left unconfigured`);
      }
      const { object: _o, ...rest } = config;
      config = { ...rest, object_id: targetId ?? null };
    }
    const row = await prisma.uiWorkflowStep.create({
      data: {
        workflow_id: workflow.id,
        name:        step.name,
        step_type:   step.step_type,
        order_index: i + 1,
        config,
      },
    });
    idByKey[step.key] = row.id;
  }

  for (const step of def.steps) {
    const data = {};
    if (step.on_true)  data.on_true_id  = idByKey[step.on_true]  ?? null;
    if (step.on_false) data.on_false_id = idByKey[step.on_false] ?? null;
    if (Object.keys(data).length) {
      await prisma.uiWorkflowStep.update({ where: { id: idByKey[step.key] }, data });
    }
  }

  log(`   ✅ ${def.label} — ${def.steps.length} steps [${def.trigger_type}]`);
  return workflow;
}

/**
 * Apply the catalogue to the tenant currently in scope.
 *
 * @param {import('@prisma/client').PrismaClient} prisma – tenant-scoped client
 * @param {{ purge?: boolean, log?: Function }} opts
 *        purge – delete every existing workflow first (default true)
 */
async function applyCrmWorkflows(prisma, { purge = true, log = console.log } = {}) {
  const objects = await prisma.uiObject.findMany({ select: { id: true, name: true } });
  const objectIds = Object.fromEntries(objects.map(o => [o.name, o.id]));

  // Resolve actor placeholders against real employees in this tenant.
  const manager = await prisma.employee.findFirst({
    where:   { role: 'manager', is_active: true },
    select:  { employee_id: true },
    orderBy: { employee_id: 'asc' },
  });
  const actors = { '{{@manager}}': manager?.employee_id ?? null };
  if (!manager) log('   ⚠ no active employee with role "manager" — re-routing steps will be left blank');

  const fieldsCreated = await ensureSupportingFields(prisma, objectIds, log);

  let deleted = 0;
  if (purge) {
    // Steps and paused executions cascade from ui_workflows.
    const { count } = await prisma.uiWorkflow.deleteMany({});
    deleted = count;
    log(`   🗑  deleted ${deleted} existing workflow${deleted === 1 ? '' : 's'}`);
  }

  let created = 0;
  for (const def of WORKFLOWS) {
    const wf = await createWorkflow(prisma, def, objectIds, actors, log);
    if (wf) created++;
  }

  return { deleted, created, fieldsCreated, skipped: WORKFLOWS.length - created };
}

// ── CLI ──────────────────────────────────────────────────────────────────────

async function main() {
  require('dotenv').config();
  const { PrismaClient } = require('@prisma/client');
  const { applyTenantMiddleware, tenantContext } = require('../src/middleware/tenant-scope');

  const args     = process.argv.slice(2);
  const dryRun   = args.includes('--dry-run');
  const keep     = args.includes('--keep');
  const tenantAt = args.indexOf('--tenant');
  const wantedTenant = tenantAt >= 0 ? Number(args[tenantAt + 1]) : null;

  let prisma = new PrismaClient();

  const tenants = await prisma.tenant.findMany({ select: { id: true, name: true }, orderBy: { id: 'asc' } });
  const targets = wantedTenant ? tenants.filter(t => t.id === wantedTenant) : tenants;
  if (!targets.length) {
    console.error(`No tenant matched${wantedTenant ? ` id ${wantedTenant}` : ''}.`);
    process.exit(1);
  }

  if (dryRun) {
    for (const t of targets) {
      const existing = await prisma.uiWorkflow.findMany({
        where:  { tenant_id: t.id },
        select: { id: true, name: true, label: true, _count: { select: { steps: true } } },
        orderBy: { id: 'asc' },
      });
      console.log(`\nTenant ${t.id} — ${t.name}`);
      console.log(`  would DELETE ${existing.length} workflow(s):`);
      existing.forEach(w => console.log(`    - #${w.id} ${w.name} (${w._count.steps} steps)`));
      console.log(`  would CREATE ${WORKFLOWS.length} workflow(s):`);
      WORKFLOWS.forEach(w => console.log(`    + ${w.name} → ${w.object} [${w.trigger_type}] (${w.steps.length} steps)`));
    }
    await prisma.$disconnect();
    return;
  }

  prisma = applyTenantMiddleware(prisma);

  for (const t of targets) {
    console.log(`\n▶ Tenant ${t.id} — ${t.name}`);
    const summary = await tenantContext.run({ tenantId: t.id }, () =>
      applyCrmWorkflows(prisma, { purge: !keep }),
    );
    console.log(`   → deleted ${summary.deleted}, created ${summary.created}, skipped ${summary.skipped}, new fields ${summary.fieldsCreated}`);
  }

  await prisma.$disconnect();
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

module.exports = { applyCrmWorkflows };
