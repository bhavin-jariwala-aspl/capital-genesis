#!/usr/bin/env node
'use strict';

/**
 * Find — and with --apply, delete — empty, inconsistent and duplicate data that
 * would surface in a demo: trashed or blank records, duplicate records, blank or
 * stray field values, documents whose file is gone, metadata shells (forms with
 * no fields, workflows with no steps, …) and rows left by deleted tenants.
 *
 *   node scripts/data-hygiene.js            # report only
 *   node scripts/data-hygiene.js --apply    # delete what the report lists
 *   node scripts/data-hygiene.js --verbose  # also print sample ids / names
 *
 * Checks marked "review" are reported but never deleted: they may be deliberate.
 */

const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env'), quiet: true });

const { PrismaClient, Prisma } = require('@prisma/client');

const APPLY = process.argv.includes('--apply');
const VERBOSE = process.argv.includes('--verbose');
const UPLOADS = path.join(__dirname, '..', 'uploads');

// Records whose data lives in a bridge table rather than in field values.
const BRIDGES = ['crm_leads', 'crm_lead_intake', 'crm_contacts', 'crm_accounts', 'crm_opportunities', 'crm_cases', 'products', 'email_templates', 'documents'];
const HAS_VALUE = "(v.str_value IS NOT NULL AND TRIM(v.str_value) <> '') OR v.num_value IS NOT NULL OR v.bool_value IS NOT NULL OR v.date_value IS NOT NULL OR (v.json_value IS NOT NULL AND JSON_TYPE(v.json_value) <> 'NULL' AND CAST(v.json_value AS CHAR) NOT IN ('[]', '{}', '\"\"'))";

const ids = (rows, key = 'id') => rows.map((r) => (typeof r[key] === 'bigint' ? r[key] : Number(r[key])));

async function main() {
  const db = new PrismaClient();
  const q = (sql, ...p) => db.$queryRawUnsafe(sql, ...p);
  const report = [];
  const add = (key, label, table, rows, { review = false, sample = null, after = null } = {}) => {
    report.push({ key, label, table, ids: ids(rows), review, sample: sample ?? rows.slice(0, 5), after });
  };

  try {
    const tenants = ids(await q('SELECT id FROM tenants'));
    const live = tenants.length ? tenants.join(',') : '0';

    // ── Rows owned by tenants that no longer exist ─────────────────────────
    const tenantTables = Prisma.dmmf.datamodel.models
      .filter((m) => m.fields.some((f) => f.name === 'tenant_id'))
      .map((m) => m.dbName || m.name);
    const orphanTenantRows = {};
    for (const t of tenantTables) {
      const [{ n }] = await q(`SELECT COUNT(*) n FROM \`${t}\` WHERE tenant_id IS NOT NULL AND tenant_id NOT IN (${live})`);
      if (Number(n)) orphanTenantRows[t] = Number(n);
    }
    const orphanDirs = fs.existsSync(UPLOADS)
      ? fs.readdirSync(UPLOADS).filter((d) => /^\d+$/.test(d) && !tenants.includes(Number(d)))
      : [];

    // ── Records ─────────────────────────────────────────────────────────────
    add('trashed_records', 'Records in the trash (soft-deleted)', 'records',
      await q('SELECT id, object_id FROM records WHERE deleted_at IS NOT NULL'));

    const bridged = BRIDGES.map((b) => `SELECT record_id FROM \`${b}\` WHERE record_id IS NOT NULL`).join(' UNION ');
    add('empty_records', 'Records with no data at all', 'records', await q(`
      SELECT r.id, o.name AS object FROM records r JOIN ui_objects o ON o.id = r.object_id
      WHERE r.deleted_at IS NULL AND r.id NOT IN (${bridged})
        AND NOT EXISTS (SELECT 1 FROM record_field_values v WHERE v.record_id = r.id AND (${HAS_VALUE}))`));

    // Title: config.title_field, else the first preferred/text field (as RecordService.titleFieldFor).
    const objects = await q('SELECT id, name, config FROM ui_objects');
    const fields = await q('SELECT object_id, name, field_type, is_active, order_index FROM ui_fields ORDER BY order_index');
    const titleOf = new Map();
    for (const o of objects) {
      const cfg = typeof o.config === 'string' ? JSON.parse(o.config || '{}') : (o.config ?? {});
      const fs_ = fields.filter((f) => f.object_id === o.id && f.is_active);
      const pref = ['display_name', 'name', 'full_name', 'title', 'subject', 'code', 'reference'].find((p) => fs_.some((f) => f.name === p));
      titleOf.set(o.id, cfg.title_field ?? pref ?? fs_.find((f) => ['text', 'auto_number', 'email'].includes(f.field_type))?.name ?? null);
    }

    const values = await q(`SELECT v.record_id, v.field_name, v.str_value, v.num_value, v.bool_value, v.date_value, v.json_value, r.object_id
      FROM record_field_values v JOIN records r ON r.id = v.record_id WHERE r.deleted_at IS NULL`);
    const byRecord = new Map();
    for (const v of values) {
      if (!byRecord.has(v.record_id)) byRecord.set(v.record_id, { object_id: v.object_id, vals: {} });
      const val = v.str_value ?? v.num_value ?? v.bool_value ?? (v.date_value ? v.date_value.toISOString() : null) ?? (v.json_value == null ? null : JSON.stringify(v.json_value));
      if (val !== null && String(val).trim() !== '') byRecord.get(v.record_id).vals[v.field_name] = String(val);
    }

    const untitled = [];
    for (const [id, r] of byRecord) {
      const t = titleOf.get(r.object_id);
      if (t && !r.vals[t]) untitled.push({ id, object: objects.find((o) => o.id === r.object_id)?.name, title_field: t });
    }
    add('untitled_records', 'Records whose title field is empty (they list as "#id")', 'records', untitled);

    // Duplicates: same object and same ext_ref, or identical content once
    // auto-numbers and ext_ref are ignored. The oldest record is kept.
    const autoFields = new Set(fields.filter((f) => f.field_type === 'auto_number').map((f) => `${f.object_id}|${f.name}`));
    const seenRef = new Map(); const seenBody = new Map(); const dupRef = []; const dupBody = [];
    for (const [id, r] of [...byRecord].sort((a, b) => a[0] - b[0])) {
      const obj = objects.find((o) => o.id === r.object_id)?.name;
      if (r.vals.ext_ref) {
        const k = `${r.object_id}|${r.vals.ext_ref}`;
        if (seenRef.has(k)) dupRef.push({ id, object: obj, ext_ref: r.vals.ext_ref, kept: seenRef.get(k) }); else seenRef.set(k, id);
      }
      const body = Object.entries(r.vals).filter(([f]) => f !== 'ext_ref' && !autoFields.has(`${r.object_id}|${f}`)).sort().map(([f, v]) => `${f}=${v}`).join('\u0001');
      if (!body) continue;
      const k = `${r.object_id}|${body}`;
      if (seenBody.has(k)) dupBody.push({ id, object: obj, kept: seenBody.get(k) }); else seenBody.set(k, id);
    }
    const dupRefIds = new Set(dupRef.map((d) => d.id));
    add('duplicate_ext_ref', 'Duplicate records (same object and ext_ref)', 'records', dupRef);
    add('duplicate_content', 'Duplicate records (identical content)', 'records', dupBody.filter((d) => !dupRefIds.has(d.id)));

    const titleGroups = new Map();
    for (const [id, r] of byRecord) {
      const t = titleOf.get(r.object_id); const v = t && r.vals[t];
      if (!v) continue;
      const k = `${r.object_id}|${v.toLowerCase()}`;
      titleGroups.set(k, [...(titleGroups.get(k) ?? []), id]);
    }
    const sameTitle = [...titleGroups].filter(([, l]) => l.length > 1).map(([k, l]) => ({ id: l[1], object: objects.find((o) => o.id === Number(k.split('|')[0]))?.name, title: k.split('|').slice(1).join('|'), records: l }));
    add('same_title', 'Records sharing a title within an object', 'records', sameTitle, { review: true });

    // ── Field values ────────────────────────────────────────────────────────
    add('blank_values', 'Blank field values (no value in any column)', 'record_field_values',
      await q(`SELECT v.id FROM record_field_values v WHERE NOT (${HAS_VALUE})`));
    add('stray_values', 'Field values for fields that do not exist on the record\'s object', 'record_field_values', await q(`
      SELECT v.id, v.field_name, o.name AS object FROM record_field_values v
      JOIN records r ON r.id = v.record_id JOIN ui_objects o ON o.id = r.object_id
      WHERE NOT EXISTS (SELECT 1 FROM ui_fields f WHERE f.object_id = r.object_id AND f.name = v.field_name)
        AND v.field_name <> 'ext_ref'`), { review: true });

    add('dangling_lookups', 'Lookup values pointing at a record that is gone or trashed', 'record_field_values', await q(`
      SELECT v.id, v.field_name, o.name AS object FROM record_field_values v
      JOIN records r ON r.id = v.record_id JOIN ui_objects o ON o.id = r.object_id
      JOIN ui_fields f ON f.object_id = r.object_id AND f.name = v.field_name AND f.field_type = 'lookup'
      LEFT JOIN records t ON t.id = COALESCE(v.num_value, IF(v.str_value REGEXP '^[0-9]+$', CAST(v.str_value AS UNSIGNED), NULL))
      WHERE r.deleted_at IS NULL AND (v.num_value IS NOT NULL OR v.str_value REGEXP '^[0-9]+$')
        AND (t.id IS NULL OR t.deleted_at IS NOT NULL)`));

    // ── Documents ───────────────────────────────────────────────────────────
    add('trashed_documents', 'Documents in the trash', 'documents',
      await q('SELECT id, stored_key, original_filename FROM documents WHERE deleted_at IS NOT NULL'));
    const docs = await q('SELECT id, stored_key, original_filename, entity_id FROM documents WHERE deleted_at IS NULL');
    if ((process.env.STORAGE_DRIVER || 'local') === 'local') {
      add('missing_files', 'Documents whose file is missing from storage', 'documents',
        docs.filter((d) => !fs.existsSync(path.join(UPLOADS, d.stored_key))));
    }
    // A signature certificate hangs off its signed document (entity_type
    // 'document'); everything else hangs off a record.
    add('orphan_documents', 'Documents attached to a record or document that is gone or trashed', 'documents', await q(`
      SELECT d.id, d.original_filename FROM documents d
      LEFT JOIN records r ON d.entity_type <> 'document' AND r.id = d.entity_id
      LEFT JOIN documents p ON d.entity_type = 'document' AND p.id = d.entity_id
      WHERE d.deleted_at IS NULL AND d.entity_id IS NOT NULL
        AND IF(d.entity_type = 'document', p.id IS NULL OR p.deleted_at IS NOT NULL, r.id IS NULL OR r.deleted_at IS NOT NULL)`));
    add('orphan_tasks', 'Tasks on trashed records', 'tasks',
      await q('SELECT t.id, t.title FROM tasks t JOIN records r ON r.id = t.record_id WHERE r.deleted_at IS NOT NULL'));
    add('orphan_notifications', 'Notifications linking to a record that is gone or trashed', 'notifications', await q(`
      SELECT n.id, n.link FROM notifications n
      LEFT JOIN records r ON r.id = CAST(REGEXP_SUBSTR(n.link, '[0-9]+$') AS UNSIGNED)
      WHERE n.link REGEXP '/records?/[0-9]+$' AND (r.id IS NULL OR r.deleted_at IS NOT NULL)`));

    // ── Metadata shells ─────────────────────────────────────────────────────
    add('empty_objects', 'Objects with no active fields and no records', 'ui_objects', await q(`
      SELECT o.id, o.name FROM ui_objects o
      WHERE NOT EXISTS (SELECT 1 FROM ui_fields f WHERE f.object_id = o.id AND f.is_active = 1)
        AND NOT EXISTS (SELECT 1 FROM records r WHERE r.object_id = o.id)`));
    add('empty_forms', 'Forms with no fields on them', 'ui_forms',
      await q('SELECT f.id, f.name FROM ui_forms f WHERE NOT EXISTS (SELECT 1 FROM ui_form_field_layouts l WHERE l.form_id = f.id)'));
    add('empty_workflows', 'Workflows with no steps', 'ui_workflows',
      await q('SELECT w.id, w.name FROM ui_workflows w WHERE NOT EXISTS (SELECT 1 FROM ui_workflow_steps s WHERE s.workflow_id = w.id)'));
    add('empty_pipelines', 'Pipelines with no stages', 'ui_pipelines',
      await q('SELECT p.id, p.name FROM ui_pipelines p WHERE NOT EXISTS (SELECT 1 FROM ui_pipeline_stages s WHERE s.pipeline_id = p.id)'));
    add('empty_dashboards', 'Dashboards with no active widgets', 'ui_dashboards',
      await q('SELECT d.id, d.name FROM ui_dashboards d WHERE NOT EXISTS (SELECT 1 FROM ui_dashboard_widgets w WHERE w.dashboard_id = d.id AND w.is_active = 1)'));
    add('empty_modules', 'Modules with no active objects', 'ui_modules',
      await q('SELECT m.id, m.name FROM ui_modules m WHERE NOT EXISTS (SELECT 1 FROM ui_objects o WHERE o.module_id = m.id AND o.is_active = 1)'));
    const dupBy = (table, cols) => q(`SELECT t.id, t.name FROM \`${table}\` t JOIN \`${table}\` k ON ${cols.map((c) => `k.${c} <=> t.${c}`).join(' AND ')} AND k.id < t.id GROUP BY t.id, t.name`);
    add('duplicate_dashboards', 'Duplicate dashboards (same name)', 'ui_dashboards', await dupBy('ui_dashboards', ['tenant_id', 'name']));
    add('duplicate_reports', 'Duplicate saved reports (same name)', 'custom_reports', await dupBy('custom_reports', ['tenant_id', 'name']));
    add('duplicate_workflows', 'Duplicate workflows (same object and name)', 'ui_workflows', await dupBy('ui_workflows', ['tenant_id', 'object_id', 'name']));
    add('duplicate_email_templates', 'Duplicate email templates (same name and language)', 'email_templates', await dupBy('email_templates', ['tenant_id', 'name', 'language']));

    // ── Housekeeping ────────────────────────────────────────────────────────
    add('dead_refresh_tokens', 'Expired or revoked refresh tokens', 'auth_refresh_tokens',
      await q('SELECT id FROM auth_refresh_tokens WHERE revoked_at IS NOT NULL OR expires_at < NOW()'));
    add('finished_jobs', 'Finished background jobs', 'job_queue',
      await q("SELECT id FROM job_queue WHERE status IN ('done', 'completed', 'succeeded')"));

    // ── Report ──────────────────────────────────────────────────────────────
    console.log(`\n${APPLY ? '🧹 Cleaning' : '🔎 Data hygiene report'} — tenants ${live}\n`);
    console.log('Rows owned by deleted tenants:', Object.keys(orphanTenantRows).length ? orphanTenantRows : 'none');
    console.log('Upload folders of deleted tenants:', orphanDirs.length ? orphanDirs.join(', ') : 'none');
    for (const r of report) {
      if (!r.ids.length) continue;
      console.log(`${r.review ? '  review ' : '  delete '} ${String(r.ids.length).padStart(6)}  ${r.label}`);
      if (VERBOSE) console.log('           ', JSON.stringify(r.sample, (k, v) => (typeof v === 'bigint' ? Number(v) : v)).slice(0, 600));
    }
    const clean = report.filter((r) => r.ids.length && !r.review);
    if (!clean.length && !Object.keys(orphanTenantRows).length && !orphanDirs.length) { console.log('\n✅ Nothing to clean.'); return; }
    if (!APPLY) { console.log('\nNothing deleted — re-run with --apply.'); return; }

    // ── Apply ───────────────────────────────────────────────────────────────
    if (Object.keys(orphanTenantRows).length) {
      await db.$transaction(async (tx) => {
        await tx.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS = 0');
        for (const t of Object.keys(orphanTenantRows)) await tx.$executeRawUnsafe(`DELETE FROM \`${t}\` WHERE tenant_id IS NOT NULL AND tenant_id NOT IN (${live})`);
        await tx.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS = 1');
      }, { timeout: 600000, maxWait: 60000 });
    }
    for (const d of orphanDirs) fs.rmSync(path.join(UPLOADS, d), { recursive: true, force: true });

    // Tasks and documents only null their record link on delete, so they go
    // first; field values, activities, history and reminders cascade.
    const order = ['orphan_tasks', 'orphan_notifications', 'trashed_documents', 'missing_files', 'orphan_documents', 'blank_values', 'dangling_lookups',
      'trashed_records', 'empty_records', 'untitled_records', 'duplicate_ext_ref', 'duplicate_content',
      'empty_forms', 'empty_workflows', 'empty_pipelines', 'empty_dashboards', 'empty_objects', 'empty_modules',
      'duplicate_dashboards', 'duplicate_reports', 'duplicate_workflows', 'duplicate_email_templates',
      'dead_refresh_tokens', 'finished_jobs'];
    const recordIds = new Set(clean.filter((r) => r.table === 'records').flatMap((r) => r.ids));
    if (recordIds.size) {
      const list = [...recordIds];
      for (let i = 0; i < list.length; i += 500) {
        const chunk = list.slice(i, i + 500).join(',');
        await db.$executeRawUnsafe(`DELETE FROM tasks WHERE record_id IN (${chunk})`);
        const files = await q(`SELECT id, stored_key FROM documents WHERE entity_id IN (${chunk}) OR record_id IN (${chunk})`);
        for (const f of files) fs.rmSync(path.join(UPLOADS, f.stored_key), { force: true });
        if (files.length) await db.$executeRawUnsafe(`DELETE FROM documents WHERE id IN (${files.map((f) => f.id).join(',')})`);
      }
    }
    for (const key of order) {
      const r = clean.find((x) => x.key === key);
      if (!r) continue;
      if (r.table === 'documents') for (const s of r.sample.length === r.ids.length ? r.sample : await q(`SELECT stored_key FROM documents WHERE id IN (${r.ids.join(',')})`)) if (s.stored_key) fs.rmSync(path.join(UPLOADS, s.stored_key), { force: true });
      for (let i = 0; i < r.ids.length; i += 500) {
        await db.$executeRawUnsafe(`DELETE FROM \`${r.table}\` WHERE id IN (${r.ids.slice(i, i + 500).join(',')})`);
      }
      console.log(`   ✓ ${r.label}: ${r.ids.length}`);
    }
    console.log('\n✅ Done. Restart the backend (or flush Redis) so cached metadata is dropped.');
  } finally {
    await db.$disconnect();
  }
}

main().catch((err) => {
  console.error('❌', err.message);
  process.exit(1);
});
