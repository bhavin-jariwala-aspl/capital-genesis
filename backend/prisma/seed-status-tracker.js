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
    object_name: 'prospect',
    field_name:  'prospect_status_timeline',
    title:       'Prospect Journey',
    // Happy-path milestones for the stepper (a subset of the pipeline stages, in order)
    milestones: [
      { value: 'new',       label: 'New',       color: '#6366f1' },
      { value: 'contacted', label: 'Contacted', color: '#3b82f6' },
      { value: 'qualified', label: 'Qualified', color: '#10b981' },
      { value: 'converted', label: 'Converted', color: '#8b5cf6' },
    ],
    timeline: [
      { status: 'new',       event_type: 'milestone', title: 'Prospect Created',     location: 'Website Form',      description: 'Inbound enquiry captured and assigned to an owner.',              daysAgo: 9, hour: 9 },
      { status: 'contacted', event_type: 'milestone', title: 'First Contact',        location: 'Phone',             description: 'Intro call completed; needs and budget discussed.',               daysAgo: 7, hour: 11 },
      { status: 'contacted', event_type: 'note',      title: 'Follow-up Email Sent', location: 'Email',             description: 'Sent a summary of the call and a brochure.',                     daysAgo: 6, hour: 15 },
      { status: 'qualified', event_type: 'milestone', title: 'Qualified',            location: 'Sales Review',      description: 'Fits the target profile; meeting booked with the decision maker.', daysAgo: 3, hour: 10 },
      { status: 'converted', event_type: 'milestone', title: 'Converted to Client',  location: 'CRM',               description: 'Contact and account created from the prospect.',                 daysAgo: 0, hour: 12 },
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
