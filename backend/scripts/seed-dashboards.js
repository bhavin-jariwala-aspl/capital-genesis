#!/usr/bin/env node
'use strict';

/**
 * Install the demo dashboards from the catalogue in prisma/crm-dashboards.js.
 *
 * Run standalone against a live tenant:
 *     node scripts/seed-dashboards.js               # replace the catalogue dashboards
 *     node scripts/seed-dashboards.js --dry-run     # show what would change
 *     node scripts/seed-dashboards.js --all         # also delete dashboards not in the catalogue
 *     node scripts/seed-dashboards.js --tenant 4    # target one tenant
 *
 * It is also imported by prisma/seed.js so `npm run db:seed` produces the same
 * boards — mirrors how scripts/seed-crm-workflows.js works.
 *
 * By default only the dashboards the catalogue owns (matched on `name`) are
 * replaced, so anything an admin built themselves survives. `--all` opts into
 * the destructive version.
 */

const path = require('path');
const { DASHBOARDS, buildDashboard } = require(path.join(__dirname, '..', 'prisma', 'crm-dashboards'));
const { DATASETS } = require(path.join(__dirname, '..', 'src', 'services', 'analytics.service'));

const datasetByKey = new Map(DATASETS.map((d) => [d.key, d]));

/**
 * Charts that several dashboards reuse are also saved as `UiChart` rows, so the
 * Dashboard Builder's chart library is not empty and a widget can be linked by
 * `chart_id` instead of carrying inline config. The widgets themselves stay
 * inline — a linked chart that another dashboard edits would change both.
 */
const LIBRARY_CHARTS = [
  ['opportunity_pipeline',     'opportunity-pipeline-by-stage', 'funnel',       { format: 'currency_compact', dataLabels: true }],
  ['leads_by_source',          'leads-by-source',               'donut',        { format: 'integer', dataLabels: true, legend: 'bottom' }],
];

/**
 * Apply the catalogue to the tenant currently in scope.
 *
 * @param {import('@prisma/client').PrismaClient} prisma tenant-scoped client
 * @param {{ purgeAll?: boolean, createdBy?: string|null, log?: Function }} opts
 *        purgeAll – delete every dashboard, not only the catalogue's own
 * @returns {Promise<{ deleted: number, created: number, widgets: number, charts: number }>}
 */
async function applyDashboards(prisma, { purgeAll = false, createdBy = null, log = console.log } = {}) {
  const names = DASHBOARDS.map((d) => d.name);

  // Widgets cascade from ui_dashboards; charts are separate rows.
  const { count: deleted } = await prisma.uiDashboard.deleteMany(
    purgeAll ? {} : { where: { name: { in: names } } },
  );
  if (deleted) log(`   🗑  replaced ${deleted} existing dashboard${deleted === 1 ? '' : 's'}`);

  // ── Chart library ──────────────────────────────────────────────────────────
  let charts = 0;
  for (const [name, datasetKey, chartType, appearance] of LIBRARY_CHARTS) {
    const d = datasetByKey.get(datasetKey);
    if (!d) throw new Error(`Chart library references unknown dataset "${datasetKey}"`);
    const existing = await prisma.uiChart.findFirst({ where: { name }, select: { id: true } });
    const data = {
      name,
      label:       d.label,
      chart_type:  chartType,
      config:      { xAxisKey: d.xKey, yAxisKey: d.yKey, appearance },
      data_source: { type: 'endpoint', dataset: d.key },
      is_active:   true,
    };
    if (existing) await prisma.uiChart.update({ where: { id: existing.id }, data });
    else await prisma.uiChart.create({ data });
    charts++;
  }
  log(`   📊 chart library: ${charts} saved charts`);

  // ── Dashboards ─────────────────────────────────────────────────────────────
  let created = 0;
  let widgets = 0;
  for (const def of DASHBOARDS) {
    const { dashboard, widgets: rows } = buildDashboard(def, datasetByKey);
    const row = await prisma.uiDashboard.create({
      data: { ...dashboard, ...(createdBy ? { created_by: createdBy } : {}) },
    });
    await prisma.uiDashboardWidget.createMany({
      data: rows.map((w) => ({ ...w, dashboard_id: row.id })),
    });
    const charted = rows.filter((w) => w.widget_type === 'chart');
    const types = [...new Set(charted.map((w) => w.config.chart_type))];
    created++;
    widgets += rows.length;
    log(`   ✅ ${row.label} — ${rows.length} widgets (${charted.length} charts: ${types.join(', ')})`);
  }

  return { deleted, created, widgets, charts };
}

/** Every chart type the catalogue puts on a dashboard — used by the CLI summary. */
function chartTypesUsed() {
  const types = new Set();
  for (const dash of DASHBOARDS) {
    for (const w of dash.widgets) {
      const d = datasetByKey.get(w.dataset);
      if (d?.shape === 'series') types.add(w.chart ?? d.chart_type);
    }
  }
  return [...types].sort();
}

// ── CLI ──────────────────────────────────────────────────────────────────────

async function main() {
  require('dotenv').config();
  const { PrismaClient } = require('@prisma/client');
  const { applyTenantMiddleware, tenantContext } = require('../src/middleware/tenant-scope');

  const args     = process.argv.slice(2);
  const dryRun   = args.includes('--dry-run');
  const purgeAll = args.includes('--all');
  const tenantAt = args.indexOf('--tenant');
  const wantedTenant = tenantAt >= 0 ? Number(args[tenantAt + 1]) : null;

  let prisma = new PrismaClient();

  const tenants = await prisma.tenant.findMany({ select: { id: true, name: true }, orderBy: { id: 'asc' } });
  const targets = wantedTenant ? tenants.filter((t) => t.id === wantedTenant) : tenants;
  if (!targets.length) {
    console.error(`No tenant matched${wantedTenant ? ` id ${wantedTenant}` : ''}.`);
    process.exit(1);
  }

  if (dryRun) {
    const names = DASHBOARDS.map((d) => d.name);
    for (const t of targets) {
      const existing = await prisma.uiDashboard.findMany({
        where:   { tenant_id: t.id, ...(purgeAll ? {} : { name: { in: names } }) },
        select:  { id: true, name: true, label: true, _count: { select: { widgets: true } } },
        orderBy: { id: 'asc' },
      });
      console.log(`\nTenant ${t.id} — ${t.name}`);
      console.log(`  would REPLACE ${existing.length} dashboard(s):`);
      existing.forEach((d) => console.log(`    - #${d.id} ${d.name} (${d._count.widgets} widgets)`));
      console.log(`  would CREATE ${DASHBOARDS.length} dashboard(s):`);
      for (const def of DASHBOARDS) {
        const { widgets } = buildDashboard(def, datasetByKey);
        const charted = widgets.filter((w) => w.widget_type === 'chart');
        console.log(`    + ${def.name} — ${widgets.length} widgets (${charted.length} charts) [palette: ${def.palette}]`);
        for (const w of charted) console.log(`        ${w.config.chart_type.padEnd(13)} ${w.title}`);
      }
    }
    console.log(`\n  chart types used: ${chartTypesUsed().join(', ')}`);
    await prisma.$disconnect();
    return;
  }

  prisma = applyTenantMiddleware(prisma);

  for (const t of targets) {
    console.log(`\n▶ Tenant ${t.id} — ${t.name}`);
    const admin = await prisma.employee.findFirst({
      where: { tenant_id: t.id, role: { in: ['admin', 'super_admin'] }, is_active: true },
      select: { employee_id: true },
      orderBy: { employee_id: 'asc' },
    });
    const summary = await tenantContext.run({ tenantId: t.id }, () =>
      applyDashboards(prisma, { purgeAll, createdBy: admin?.employee_id ?? null }),
    );
    console.log(`   → replaced ${summary.deleted}, created ${summary.created} dashboards, ${summary.widgets} widgets, ${summary.charts} library charts`);
  }

  console.log(`\n  chart types used: ${chartTypesUsed().join(', ')}`);
  await prisma.$disconnect();
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

module.exports = { applyDashboards, chartTypesUsed, LIBRARY_CHARTS };
