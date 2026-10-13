'use strict';

/**
 * setup-report-samples.js — non-destructive: creates a set of sample reports
 * on the current database if none exist. Safe to re-run (skips when reports
 * already present).
 *
 *   node scripts/setup-report-samples.js
 */

require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const { applyTenantMiddleware, tenantContext } = require('../src/middleware/tenant-scope');
const ReportService = require('../src/services/report.service');

const VIZ_TO_TYPE = { table: 'table', bar: 'chart', line: 'chart', pie: 'chart', kpi: 'summary', pivot: 'pivot' };

const SAMPLES = [
  { name: 'Pipeline by Stage', category: 'sales', description: 'Open opportunity value across pipeline stages',
    config: { source: 'opportunities', viz: 'bar', group_by: [{ field: 'stage' }], metrics: [{ agg: 'sum', field: 'amount', label: 'Total value' }, { agg: 'count', label: 'Deals' }] } },
  { name: 'Leads by Source', category: 'sales', description: 'Where leads come from',
    config: { source: 'leads', viz: 'pie', group_by: [{ field: 'lead_source' }], metrics: [{ agg: 'count', label: 'Leads' }] } },
  { name: 'Leads by Status', category: 'sales', description: 'Lead funnel by status with average revenue',
    config: { source: 'leads', viz: 'bar', group_by: [{ field: 'lead_status' }], metrics: [{ agg: 'count', label: 'Leads' }, { agg: 'avg', field: 'annual_revenue', label: 'Avg revenue' }] } },
  { name: 'Cases by Priority', category: 'support', description: 'Support case load by priority',
    config: { source: 'cases', viz: 'pie', group_by: [{ field: 'priority' }], metrics: [{ agg: 'count', label: 'Cases' }] } },
  { name: 'SLA Breaches by Record Type', category: 'support', description: 'Where SLAs are being missed',
    config: { source: 'sla', viz: 'bar', group_by: [{ field: 'entity_type' }], metrics: [{ agg: 'count', label: 'Timers' }], filters: [{ field: 'status', op: 'equals', value: 'breached' }] } },
  { name: 'Open Tasks by Assignee', category: 'productivity', description: 'Workload of open tasks per person',
    config: { source: 'tasks', viz: 'bar', group_by: [{ field: 'assigned_to' }], metrics: [{ agg: 'count', label: 'Open tasks' }], filters: [{ field: 'status', op: 'in', value: 'open,in_progress' }] } },
  { name: 'Deal Value by Industry', category: 'sales', description: 'Accounts by industry with rolled-up deal value and case count',
    config: { source: 'accounts', viz: 'bar', group_by: [{ field: 'industry' }], metrics: [{ agg: 'sum', field: 'opportunities.amount', label: 'Deal value' }, { agg: 'sum', field: 'cases.$count', label: 'Cases' }] } },
  { name: 'All Leads', category: 'sales', description: 'Full lead list',
    config: { source: 'leads', viz: 'table', columns: ['first_name', 'last_name', 'company', 'lead_status', 'rating', 'lead_source', 'owner_id'], sort: [{ key: 'last_name', dir: 'asc' }], limit: 200 } },
];

async function main() {
  let prisma = applyTenantMiddleware(new PrismaClient());
  await prisma.$connect();
  const tenant = await prisma.tenant.findFirst({ select: { id: true, name: true } });
  if (!tenant) throw new Error('No tenant found');
  console.log(`▶ Tenant: ${tenant.name} (#${tenant.id})`);

  await tenantContext.run({ tenantId: tenant.id }, async () => {
    const existing = await prisma.customReport.count();
    if (existing > 0) { console.log(`✓ ${existing} reports already exist — skipping`); return; }

    const emp = await prisma.employee.findFirst({ where: { is_active: true }, select: { employee_id: true }, orderBy: { employee_id: 'asc' } });
    const createdBy = emp?.employee_id || 'ADMIN001';

    for (const s of SAMPLES) {
      await prisma.customReport.create({
        data: {
          name: s.name, description: s.description, category: s.category,
          report_type: VIZ_TO_TYPE[s.config.viz] || 'table',
          data_source: s.config,
          fields: s.config.columns || s.config.metrics || [],
          filters: s.config.filters || [], grouping: s.config.group_by || [],
          sorting: s.config.sort || [], chart_config: { viz: s.config.viz, limit: s.config.limit || null },
          is_shared: true, shared_with: [], created_by: createdBy,
        },
      });
    }
    console.log(`✓ Created ${SAMPLES.length} sample reports`);

    // Verify one runs end-to-end.
    const svc = new ReportService(prisma);
    const r = await svc.run(SAMPLES[0].config, { scope: 'all' });
    console.log(`✓ Verified "Pipeline by Stage": ${r.rows.length} groups, ${r.meta.executed_ms}ms`);
  });
  await prisma.$disconnect();
}

main().catch((e) => { console.error('❌ failed:', e.message); process.exit(1); });
