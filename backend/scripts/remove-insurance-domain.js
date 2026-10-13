'use strict';

/**
 * One-off data cleanup that accompanies migration
 * `20261013120000_remove_insurance_domain`.
 *
 * The migration drops the insurance domain tables and CRM quotes. What it
 * cannot express is the *metadata* the INSURANCE sidebar section was generated
 * from — `ui_modules` rows with `category = 'insurance'` and everything that
 * hangs off their objects — plus the cross-cutting rows that pointed at the
 * domain (saved reports, dashboards, legacy feature flags, underwriter roles).
 * Many of those foreign keys do not cascade (objects → module, fields/forms →
 * object, pages/wizards → object), so the order below is children first.
 *
 *   node scripts/remove-insurance-domain.js --dry-run   # counts only
 *   node scripts/remove-insurance-domain.js             # delete, in one transaction
 *
 * Afterwards run `node scripts/seed-dashboards.js` to reinstall the catalogue
 * dashboards. Idempotent: a second run finds nothing to delete.
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env'), quiet: true });
const { PrismaClient } = require('@prisma/client');
const { DATASETS } = require('../src/services/analytics.service');
const { getStorage } = require('../src/services/storage');

const REMOVED_ROLES = ['uw_manager', 'senior_underwriter', 'underwriter'];
const REMOVED_FLAGS = ['underwriting_workflow', 'ai_underwriting', 'policy_analytics',
  'ins_quoting', 'ins_policy_admin', 'ins_underwriting', 'ins_claims', 'ins_commissions',
  'ins_carrier_feeds', 'ins_ai_underwriting', 'analytics_policy'];
const REMOVED_REPORT_SOURCES = ['policies', 'claims', 'commissions', 'quotes'];
const REMOVED_DASHBOARDS = ['agency_dashboard', 'claims_underwriting', 'portfolio_analytics'];
const LIVE_DATASETS = new Set(DATASETS.map((d) => d.key));
const PLAN_DESCRIPTIONS = {
  starter:      'Pipelines, workflows and reports for a small team',
  professional: 'Assignment, scoring, SLAs and automation for a growing team',
  enterprise:   'The full platform, with SSO, API v2 and AI assistance',
};

const ids = (rows, key = 'id') => rows.map((r) => r[key]);

async function plan(db) {
  const modules = await db.uiModule.findMany({ where: { category: 'insurance' }, select: { id: true, name: true, tenant_id: true } });
  const moduleIds = ids(modules);
  const objects = await db.uiObject.findMany({ where: { module_id: { in: moduleIds } }, select: { id: true, name: true } });
  const objectIds = ids(objects);
  const objectNames = [...new Set(objects.map((o) => o.name))];
  const byObject = { object_id: { in: objectIds } };

  const fields    = ids(await db.uiField.findMany({ where: byObject, select: { id: true } }));
  const forms     = ids(await db.uiForm.findMany({ where: byObject, select: { id: true } }));
  const pipelines = ids(await db.uiPipeline.findMany({ where: byObject, select: { id: true } }));
  const wizards   = ids(await db.uiWizard.findMany({ where: byObject, select: { id: true } }));
  const workflows = ids(await db.uiWorkflow.findMany({ where: byObject, select: { id: true } }));
  const pages     = ids(await db.uiPage.findMany({ where: byObject, select: { id: true } }));

  const reports = (await db.customReport.findMany({ select: { id: true, data_source: true } }))
    .filter((r) => REMOVED_REPORT_SOURCES.includes(r.data_source?.source));
  const charts = (await db.uiChart.findMany({ select: { id: true, data_source: true, config: true } }))
    .filter((c) => {
      const ds = c.data_source?.dataset ?? c.config?.dataset;
      return ds && !LIVE_DATASETS.has(ds);
    });
  const documents = await db.document.findMany({
    where: { entity_type: { in: objectNames } }, select: { id: true, stored_key: true },
  });

  return {
    modules, moduleIds, objectIds, objectNames, fields, forms, pipelines, wizards, workflows, pages,
    reportIds: ids(reports), chartIds: ids(charts), documents,
  };
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const db = new PrismaClient();
  const p = await plan(db);

  console.log(`Insurance modules: ${p.modules.map((m) => `${m.name}@t${m.tenant_id}`).join(', ') || 'none'}`);
  console.log(`Objects: ${p.objectNames.join(', ') || 'none'}`);
  console.log(`fields ${p.fields.length} · forms ${p.forms.length} · pipelines ${p.pipelines.length} · wizards ${p.wizards.length} · workflows ${p.workflows.length} · pages ${p.pages.length}`);
  console.log(`reports ${p.reportIds.length} · library charts ${p.chartIds.length} · documents ${p.documents.length}`);
  if (dryRun) { await db.$disconnect(); return; }

  const perm = (type, list) => ({ entity_type: type, entity_id: { in: list } });
  const byObject = { object_id: { in: p.objectIds } };
  const counts = await db.$transaction(async (tx) => {
    const c = {};
    const run = async (label, op) => { c[label] = (await op).count; };

    await run('documents',          tx.document.deleteMany({ where: { id: { in: ids(p.documents) } } }));
    await run('ui_permissions',     tx.uiPermission.deleteMany({ where: { OR: [
      perm('module', p.moduleIds), perm('object', p.objectIds), perm('field', p.fields),
      perm('form', p.forms), perm('pipeline', p.pipelines), perm('wizard', p.wizards),
      perm('workflow', p.workflows), perm('page', p.pages),
      { role_name: { in: REMOVED_ROLES } },
    ] } }));
    await run('workflows',          tx.uiWorkflow.deleteMany({ where: { id: { in: p.workflows } } }));
    await run('wizard_steps',       tx.uiWizardStep.deleteMany({ where: { OR: [{ wizard_id: { in: p.wizards } }, { form_id: { in: p.forms } }] } }));
    await run('wizards',            tx.uiWizard.deleteMany({ where: { id: { in: p.wizards } } }));
    await run('pages',              tx.uiPage.deleteMany({ where: { id: { in: p.pages } } }));
    await run('assignment_rules',   tx.assignmentRule.deleteMany({ where: byObject }));
    await run('email_templates',    tx.emailTemplate.deleteMany({ where: byObject }));
    await run('records',            tx.record.deleteMany({ where: byObject }));
    await run('pipelines',          tx.uiPipeline.deleteMany({ where: { id: { in: p.pipelines } } }));
    await run('form_layouts',       tx.uiFormFieldLayout.deleteMany({ where: { OR: [{ form_id: { in: p.forms } }, { field_id: { in: p.fields } }] } }));
    await run('field_dependencies', tx.uiFieldDependency.deleteMany({ where: { OR: [{ source_field_id: { in: p.fields } }, { target_field_id: { in: p.fields } }] } }));
    await run('validations',        tx.uiValidation.deleteMany({ where: { field_id: { in: p.fields } } }));
    await run('forms',              tx.uiForm.deleteMany({ where: { id: { in: p.forms } } }));
    await run('fields',             tx.uiField.deleteMany({ where: { id: { in: p.fields } } }));
    await run('objects',            tx.uiObject.deleteMany({ where: { id: { in: p.objectIds } } }));
    await run('modules',            tx.uiModule.deleteMany({ where: { id: { in: p.moduleIds } } }));

    await run('reports',            tx.customReport.deleteMany({ where: { id: { in: p.reportIds } } }));
    await run('dashboards',         tx.uiDashboard.deleteMany({ where: { name: { in: REMOVED_DASHBOARDS } } }));
    await run('library_charts',     tx.uiChart.deleteMany({ where: { id: { in: p.chartIds } } }));
    await run('document_checklists', tx.uiDocumentChecklist.deleteMany({ where: { entity_type: { in: p.objectNames } } }));
    await run('feature_overrides',  tx.tenantFeatureOverride.deleteMany({ where: { flag: { name: { in: REMOVED_FLAGS } } } }));
    await run('feature_flags',      tx.featureFlag.deleteMany({ where: { name: { in: REMOVED_FLAGS } } }));
    await run('operational_perms',  tx.operationalPermission.deleteMany({ where: { OR: [{ entity_type: 'underwriting' }, { role_name: { in: REMOVED_ROLES } }] } }));
    await run('employees',          tx.employee.deleteMany({ where: { role: { in: REMOVED_ROLES } } }));
    await run('roles',              tx.role.deleteMany({ where: { name: { in: REMOVED_ROLES } } }));
    // Plan blurbs advertised the removed features; keep the console honest.
    for (const [name, description] of Object.entries(PLAN_DESCRIPTIONS)) {
      await run(`plan:${name}`, tx.subscriptionPlan.updateMany({ where: { name }, data: { description } }));
    }
    return c;
  }, { timeout: 120_000, maxWait: 20_000 });

  console.table(counts);

  // Blob cleanup is best-effort and outside the transaction: an orphaned blob
  // costs storage, an orphaned row would be a broken download.
  const storage = getStorage();
  for (const d of p.documents) {
    await storage.delete(d.stored_key).catch((err) => console.warn(`  blob ${d.stored_key}: ${err.message}`));
  }

  await db.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
