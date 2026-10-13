'use strict';

/**
 * setup-sla-demo.js — non-destructive: sets up a few working SLAs on the
 * current database without clearing anything.
 *
 *   node scripts/setup-sla-demo.js
 *
 * It ensures a business-hours calendar and a full set of policies exist
 * (completing any policy that has no targets), optionally creates a handful of
 * sample support cases when none exist, then runs the real SLA engine twice so
 * timers materialise across on-track / at-risk / breached / met / met-late.
 */

require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const { applyTenantMiddleware, tenantContext } = require('../src/middleware/tenant-scope');
const SlaService = require('../src/services/sla.service');

const WEEKLY_9_5 = {
  mon: [['09:00', '17:00']], tue: [['09:00', '17:00']], wed: [['09:00', '17:00']],
  thu: [['09:00', '17:00']], fri: [['09:00', '17:00']],
};

const POLICY_SPECS = [
  {
    name: 'Critical / Priority Case SLA', entity_type: 'case', order_index: 0,
    description: 'Tighter response & resolution targets for high-value cases',
    conditions: [{ field: 'priority', op: 'in', value: 'critical,high' }],
    targets: [
      { metric: 'first_response', priority: 'critical', target_minutes: 30 },
      { metric: 'first_response', priority: 'high', target_minutes: 120 },
      { metric: 'resolution', priority: 'critical', target_minutes: 240 },
      { metric: 'resolution', priority: 'high', target_minutes: 480 },
    ],
    escalations: [
      { metric: '*', trigger: 'warning', action: 'notify_owner' },
      { metric: '*', trigger: 'breach', action: 'notify_manager' },
      { metric: 'resolution', trigger: 'breach', action: 'raise_priority' },
    ],
  },
  {
    name: 'Standard Case SLA', entity_type: 'case', order_index: 1,
    description: 'Default response & resolution for all other cases',
    targets: [
      { metric: 'first_response', priority: '*', target_minutes: 480 },
      { metric: 'resolution', priority: '*', target_minutes: 2880 },
    ],
    escalations: [
      { metric: '*', trigger: 'warning', action: 'notify_owner' },
      { metric: '*', trigger: 'breach', action: 'notify_manager' },
    ],
  },
  {
    name: 'Speed-to-Lead', entity_type: 'lead', order_index: 0,
    description: 'Contact new leads quickly — hotter leads get tighter windows',
    targets: [
      { metric: 'first_response', priority: 'hot', target_minutes: 15 },
      { metric: 'first_response', priority: 'warm', target_minutes: 60 },
      { metric: 'first_response', priority: '*', target_minutes: 240 },
    ],
    escalations: [
      { metric: 'first_response', trigger: 'warning', action: 'notify_owner' },
      { metric: 'first_response', trigger: 'breach', action: 'notify_manager' },
    ],
  },
  {
    name: 'Task Due SLA', entity_type: 'task', order_index: 0,
    description: 'Complete tasks by their due date',
    targets: [
      { metric: 'resolution', priority: 'urgent', target_minutes: 60 },
      { metric: 'resolution', priority: 'high', target_minutes: 240 },
      { metric: 'resolution', priority: '*', target_minutes: 480 },
    ],
    escalations: [
      { metric: 'resolution', trigger: 'warning', action: 'notify_owner' },
      { metric: 'resolution', trigger: 'breach', action: 'notify_manager' },
    ],
  },
];

async function main() {
  let prisma = new PrismaClient();
  if (!prisma._tenantMiddlewareApplied) {
    prisma = applyTenantMiddleware(prisma);
    prisma._tenantMiddlewareApplied = true;
  }
  await prisma.$connect();

  const tenant = await prisma.tenant.findFirst({ select: { id: true, name: true } });
  if (!tenant) throw new Error('No tenant found.');
  const T = tenant.id;
  console.log(`▶ Tenant: ${tenant.name} (#${T})`);

  await tenantContext.run({ tenantId: T }, async () => {
    // 1) Business hours ------------------------------------------------------
    let cal = await prisma.slaBusinessHours.findFirst({ where: { is_default: true } })
      || await prisma.slaBusinessHours.findFirst();
    if (!cal) {
      cal = await prisma.slaBusinessHours.create({
        data: { name: 'Business Hours (Mon–Fri 9–5)', timezone_label: 'UTC', utc_offset_minutes: 0, weekly: WEEKLY_9_5, holidays: [], is_default: true },
      });
      console.log('✓ Created default business-hours calendar');
    } else {
      console.log(`✓ Using business-hours calendar "${cal.name}"`);
    }

    // 2) Policies (create missing; complete any with no targets) -------------
    for (const spec of POLICY_SPECS) {
      let policy = await prisma.slaPolicy.findFirst({ where: { name: spec.name, entity_type: spec.entity_type } });
      if (!policy) {
        policy = await prisma.slaPolicy.create({
          data: {
            name: spec.name, description: spec.description, entity_type: spec.entity_type,
            order_index: spec.order_index, is_active: true,
            conditions: spec.conditions || undefined, business_hours_id: cal.id,
          },
        });
        console.log(`✓ Created policy "${spec.name}"`);
      }
      const targetCount = await prisma.slaTarget.count({ where: { policy_id: policy.id } });
      if (targetCount === 0) {
        await prisma.slaTarget.createMany({ data: spec.targets.map((t) => ({ policy_id: policy.id, metric: t.metric, priority: t.priority || '*', target_minutes: t.target_minutes, warning_pct: 80 })) });
        await prisma.slaEscalation.createMany({ data: spec.escalations.map((e, i) => ({ policy_id: policy.id, metric: e.metric || '*', trigger: e.trigger, action: e.action, order_index: i })) });
        await prisma.slaPolicy.update({ where: { id: policy.id }, data: { business_hours_id: policy.business_hours_id || cal.id, is_active: true } });
        console.log(`  ↳ added ${spec.targets.length} targets + ${spec.escalations.length} escalations to "${spec.name}"`);
      }
    }

    // 3) Sample cases (only if there are none, to avoid duplicates) ----------
    const caseCount = await prisma.crmCase.count();
    if (caseCount === 0) {
      const emps = await prisma.employee.findMany({ where: { is_active: true }, select: { employee_id: true }, take: 3, orderBy: { employee_id: 'asc' } });
      const own = (i) => emps[i % emps.length]?.employee_id || null;
      const now = new Date();
      const hAgo = (h) => new Date(now.getTime() - h * 3_600_000);
      const dAgo = (d) => new Date(now.getTime() - d * 86_400_000);
      const defs = [
        { subject: 'Billing discrepancy on policy POL-2026-00012', priority: 'critical', status: 'new',         type: 'billing',   origin: 'email', owner_id: own(0), created_at: dAgo(5) },
        { subject: 'Cannot access customer portal',                priority: 'high',     status: 'new',         type: 'technical', origin: 'web',   owner_id: own(1), created_at: hAgo(2) },
        { subject: 'Claim status inquiry — CLM-2026-001',          priority: 'medium',   status: 'in_progress', type: 'claim',     origin: 'phone', owner_id: own(0), created_at: dAgo(1) },
        { subject: 'Policy document request',                      priority: 'high',     status: 'new',         type: 'service',   origin: 'email', owner_id: own(1), created_at: hAgo(1.5), __resolve: 'Sent policy PDF to the client.' },
        { subject: 'Complaint about price increase',               priority: 'critical', status: 'in_progress', type: 'complaint', origin: 'phone', owner_id: own(2), created_at: dAgo(6), __resolve: 'Explained the rate change; client retained.' },
        { subject: 'Address update request',                       priority: 'low',      status: 'new',         type: 'service',   origin: 'web',   owner_id: own(1), created_at: hAgo(0.5) },
      ];
      const created = await Promise.all(defs.map(({ __resolve, ...c }) => prisma.crmCase.create({ data: c })));
      console.log(`✓ Created ${created.length} sample support cases`);

      const engine = new SlaService(prisma);
      await engine.reconcile();                          // pass 1 — start timers
      await Promise.all(defs.map((d, i) => (d.__resolve
        ? prisma.crmCase.update({ where: { id: created[i].id }, data: { status: 'resolved', resolution: d.__resolve } })
        : null)).filter(Boolean));
      await engine.reconcile();                          // pass 2 — settle completions
    } else {
      console.log(`✓ ${caseCount} cases already exist — skipping sample cases`);
      await new SlaService(prisma).reconcile();
    }

    // 4) Report --------------------------------------------------------------
    const [total, breached, met, running, paused] = await Promise.all([
      prisma.slaInstance.count(),
      prisma.slaInstance.count({ where: { status: 'breached' } }),
      prisma.slaInstance.count({ where: { status: 'met' } }),
      prisma.slaInstance.count({ where: { status: 'running' } }),
      prisma.slaInstance.count({ where: { status: 'paused' } }),
    ]);
    console.log(`\n✅ SLA timers: ${total} total — ${running} running · ${breached} breached · ${met} met · ${paused} paused`);
  });

  await prisma.$disconnect();
}

main().catch((e) => { console.error('❌ setup failed:', e); process.exit(1); });
