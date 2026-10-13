'use strict';

/**
 * Demo seeder for the `status_tracker` fieldtype.
 *
 * Wires a configured Status Tracker field onto each target object's form(s) and
 * seeds a realistic Amazon/UPS-style timeline on one existing record per object,
 * so the component can be seen end-to-end.
 *
 * Idempotent: safe to run multiple times.
 *
 *   node prisma/seed-status-tracker.js
 */
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

function at(daysAgo, hour) {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  d.setHours(hour, 0, 0, 0);
  return d;
}

// ── Demo targets ────────────────────────────────────────────────────────────
const TARGETS = [
  {
    object_name: 'claim',
    field_name:  'claim_status_timeline',
    title:       'Claim Tracking',
    // Happy-path milestones for the stepper (a subset of the pipeline stages, in order)
    milestones: [
      { value: 'filed',               label: 'Filed',               color: '#6366f1' },
      { value: 'under_investigation', label: 'Under Investigation', color: '#f59e0b' },
      { value: 'approved',            label: 'Approved',            color: '#10b981' },
      { value: 'paid',                label: 'Paid',                color: '#0ea5e9' },
      { value: 'closed',              label: 'Closed',              color: '#64748b' },
    ],
    timeline: [
      { status: 'filed',               event_type: 'milestone', title: 'Claim Filed',             location: 'Online Portal',         description: 'Claim submitted by the policyholder and assigned a reference number.', daysAgo: 9, hour: 9 },
      { status: 'filed',               event_type: 'note',      title: 'Documents Received',      location: 'Claims Intake, Mumbai', description: 'Hospital bills and discharge summary received and attached.',          daysAgo: 8, hour: 14 },
      { status: 'under_investigation', event_type: 'milestone', title: 'Under Investigation',     location: 'Underwriting, Pune',    description: 'Assigned to investigator R. Mehta for verification.',                   daysAgo: 7, hour: 11 },
      { status: 'under_investigation', event_type: 'scan',      title: 'Field Verification Done', location: 'Apollo Hospital, Pune', description: 'Treatment and admission dates verified with the provider.',             daysAgo: 4, hour: 16 },
      { status: 'approved',            event_type: 'milestone', title: 'Claim Approved',          location: 'Claims HQ',             description: 'Approved for ₹1,85,000 after deductible.',                               daysAgo: 2, hour: 10 },
      { status: 'paid',                event_type: 'milestone', title: 'Payout Initiated',        location: 'Finance, Bangalore',    description: 'NEFT transfer initiated to the registered bank account.',                daysAgo: 1, hour: 13 },
      { status: 'paid',                event_type: 'note',      title: 'Payment Settled',         location: 'HDFC Bank',             description: 'Settlement confirmed — UTR ref shared with the customer.',               daysAgo: 0, hour: 9 },
    ],
  },
  {
    object_name: 'application',
    field_name:  'application_status_timeline',
    title:       'Application Tracking',
    milestones: [
      { value: 'submitted',       label: 'Submitted',       color: '#6366f1' },
      { value: 'under_review',    label: 'Under Review',    color: '#f59e0b' },
      { value: 'pending_medical', label: 'Pending Medical', color: '#a855f7' },
      { value: 'approved',        label: 'Approved',        color: '#10b981' },
      { value: 'issued',          label: 'Issued',          color: '#0ea5e9' },
    ],
    timeline: [
      { status: 'submitted',       event_type: 'milestone', title: 'Application Submitted',  location: 'Agent Portal',          description: 'New business application captured and assigned an application number.', daysAgo: 12, hour: 10 },
      { status: 'submitted',       event_type: 'note',      title: 'KYC Documents Received', location: 'New Business, Mumbai',   description: 'ID proof, address proof and income proof verified.',                    daysAgo: 11, hour: 15 },
      { status: 'under_review',    event_type: 'milestone', title: 'Under Review',           location: 'Underwriting Desk',     description: 'Assigned to underwriter S. Iyer for risk assessment.',                  daysAgo: 9,  hour: 11 },
      { status: 'pending_medical', event_type: 'milestone', title: 'Medical Exam Scheduled', location: 'Metropolis Labs, Pune', description: 'Tele-MER and blood profile scheduled for the applicant.',               daysAgo: 7,  hour: 9 },
      { status: 'pending_medical', event_type: 'scan',      title: 'Medical Report Received', location: 'Underwriting Desk',     description: 'Reports within acceptable limits — no adverse findings.',               daysAgo: 4,  hour: 17 },
      { status: 'approved',        event_type: 'milestone', title: 'Application Approved',    location: 'Underwriting HQ',       description: 'Approved at standard rates with no loading.',                           daysAgo: 2,  hour: 12 },
      { status: 'issued',          event_type: 'milestone', title: 'Policy Issued',           location: 'Policy Servicing',      description: 'Policy document generated and emailed to the customer.',                daysAgo: 0,  hour: 10 },
    ],
  },
];

async function seedTarget(t) {
  const obj = await prisma.uiObject.findFirst({ where: { name: t.object_name } });
  if (!obj) { console.log(`⚠ Object "${t.object_name}" not found — skipping.`); return; }
  const tenant_id = obj.tenant_id;

  // Prefer the colors actually configured on the pipeline, fall back to defaults.
  const pipeline = await prisma.uiPipeline.findFirst({ where: { object_id: obj.id }, include: { stages: true } });
  const colorByName = Object.fromEntries((pipeline?.stages || []).map(s => [s.name, s.color]));
  const stages = t.milestones.map(m => ({ ...m, color: colorByName[m.value] || m.color }));

  // 1. Upsert the status_tracker field on the object
  let field = await prisma.uiField.findFirst({ where: { object_id: obj.id, name: t.field_name } });
  const fieldData = {
    label:         t.title,
    field_type:    'status_tracker',
    data_type:     'none',
    is_required:   false,
    is_searchable: false,
    is_sortable:   false,
    order_index:   999,
    help_text:     `Live timeline of this ${t.object_name}, updated as it moves through the pipeline.`,
    config:        { stages, variant: 'steps', title: t.title },
  };
  if (field) {
    field = await prisma.uiField.update({ where: { id: field.id }, data: fieldData });
    console.log(`↻ [${t.object_name}] Updated field #${field.id} (${t.field_name})`);
  } else {
    field = await prisma.uiField.create({ data: { ...fieldData, object_id: obj.id, name: t.field_name, tenant_id } });
    console.log(`＋ [${t.object_name}] Created field #${field.id} (${t.field_name})`);
  }

  // 2. Attach it to every form of the object (full width, at the bottom)
  const forms = await prisma.uiForm.findMany({ where: { object_id: obj.id } });
  for (const form of forms) {
    const fullSpan = form.columns || 2;       // normaliseFormMeta scales this to the 12-col grid
    await prisma.uiFormFieldLayout.upsert({
      where:  { form_id_field_id: { form_id: form.id, field_id: field.id } },
      update: { row: 99, col: 0, col_span: fullSpan, order_index: 999, is_visible: true },
      create: { form_id: form.id, field_id: field.id, row: 99, col: 0, col_span: fullSpan, order_index: 999, is_visible: true, tenant_id },
    });
  }
  console.log(`🔗 [${t.object_name}] Linked field to ${forms.length} form(s)`);

  // 3. Seed a demo timeline on EVERY record, scaled to each record's current
  //    pipeline stage so the tracker looks realistic (events only up to the
  //    stage the record has actually reached). Records with no/unknown stage
  //    get the full timeline so the demo always shows data.
  const records = await prisma.record.findMany({
    where:   { object_id: obj.id },
    include: { pipeline_stage: { select: { name: true } } },
    orderBy: { id: 'asc' },
  });
  if (!records.length) { console.log(`⚠ [${t.object_name}] No records found — skipping timeline events.`); return; }

  const milestoneOrder = t.milestones.map(m => m.value);
  let seededRecords = 0, seededEvents = 0;
  for (const rec of records) {
    const stageName = rec.pipeline_stage?.name;
    const cutoff = milestoneOrder.indexOf(stageName);        // -1 if unknown stage
    // Keep timeline events whose status is at/below the record's current stage.
    const events = t.timeline.filter(e => {
      const idx = milestoneOrder.indexOf(e.status);
      return cutoff < 0 ? true : (idx >= 0 && idx <= cutoff);
    });
    const chosen = events.length ? events : [t.timeline[0]];  // always at least one

    await prisma.statusEvent.deleteMany({ where: { record_id: rec.id } });
    await prisma.statusEvent.createMany({
      data: chosen.map(e => ({
        record_id:   rec.id,
        status:      e.status,
        title:       e.title,
        description: e.description,
        location:    e.location,
        event_type:  e.event_type,
        occurred_at: at(e.daysAgo, e.hour),
        tenant_id,
      })),
    });
    seededRecords++; seededEvents += chosen.length;
  }
  console.log(`🕓 [${t.object_name}] Seeded ${seededEvents} events across ${seededRecords} record(s) (ids: ${records.map(r => r.id).join(', ')})`);
}

async function main() {
  for (const t of TARGETS) await seedTarget(t);
  console.log('\n✅ Status Tracker demo seeded.');
}

main()
  .catch((e) => { console.error('Seed failed:', e.message); process.exit(1); })
  .finally(() => prisma.$disconnect());
