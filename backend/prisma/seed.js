/**
 * Genesis Life Insurance CRM — Database Seed
 * 13 modules (crm/insurance) · 13 objects · ~150 fields ·
 * validations · custom functions · field dependencies · forms ·
 * 9 pipelines · 5-step wizard · dashboard · 18 workflows ·
 * full demo data with EAV for all modules
 *
 * Run: node prisma/seed.js   (from /backend directory)
 */
'use strict';

const { PrismaClient } = require('@prisma/client');
const bcrypt           = require('bcryptjs');
const Redis            = require('ioredis');
try { require('dotenv').config(); } catch (_) {}

let prisma = new PrismaClient({
  datasources: { db: { url: process.env.DATABASE_URL } },
  // Keep pool small to avoid overwhelming remote RDS
  // and set generous timeouts for slow connections
});

// ─── Redis cache flush ─────────────────────────────────────────────────────────
async function flushRedisCache() {
  let redis;
  try {
    const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
    redis = new Redis(redisUrl, { maxRetriesPerRequest: 1, connectTimeout: 3000, lazyConnect: true });
    await redis.connect();
    let cursor = '0';
    let deleted = 0;
    let iterations = 0;
    const MAX_SCAN_ITERATIONS = 10000;
    do {
      const [next, keys] = await redis.scan(cursor, 'MATCH', 'genesis:*', 'COUNT', 100);
      cursor = next;
      if (keys.length) { await redis.del(...keys); deleted += keys.length; }
      if (++iterations >= MAX_SCAN_ITERATIONS) {
        console.log(`⚠️  Redis scan reached ${MAX_SCAN_ITERATIONS} iterations, stopping`);
        break;
      }
    } while (cursor !== '0');
    console.log(`✅ Redis cache flushed (${deleted} keys removed)`);
    await redis.disconnect();
  } catch (e) {
    console.log('⚠️  Redis flush skipped:', e.message);
    try { if (redis) await redis.disconnect(); } catch (_) {}
  }
}

async function clearDatabase() {
  console.log('🧹 Clearing database...');
  try {
    // Use raw DELETE so FK_CHECKS bypass runs on the SAME connection as the delete
    const tables = [
      // SLA engine tables (children before parents)
      'sla_instances', 'sla_targets', 'sla_escalations', 'sla_policies', 'sla_business_hours',
      // Reporting tables (children before parent)
      'report_executions', 'report_subscriptions', 'custom_reports',
      // Assignment & workflow tables
      'assignment_logs', 'round_robin_states', 'assignment_rules',
      'workflow_pending_steps',
      // Permission tables
      'ui_permissions', 'operational_permissions',
      // Record field values
      'record_field_values',
      // Quotas, imports, integrations
      'quotas', 'import_jobs', 'integration_logs', 'integrations',
      // Social media tables
      'competitor_social_activities', 'social_listening_keywords',
      'social_media_leads', 'social_media_engagements', 'social_media_mentions',
      'social_media_posts', 'social_media_campaigns', 'social_media_accounts',
      // Platform admin tables
      'data_export_requests', 'impersonation_logs', 'api_rate_limits', 'security_policies',
      'system_announcements', 'platform_audit_logs',
      'tenant_feature_overrides', 'feature_flags', 'subscription_plans',
      'tenant_usage', 'tenant_configs', 'tenants',
      // CRM & operational tables
      'quote_line_items', 'quotes',
      // Insurance domain tables
      'commission_entries', 'claim_events', 'insurance_claims', 'insurance_policy_status_history',
      'insurance_policy_beneficiaries', 'insurance_policies', 'underwriting_requirements',
      'underwriting_cases', 'insurance_applications', 'carrier_adapter_configs', 'carrier_products', 'insurance_carriers',
      'email_logs', 'email_templates', 'documents',
      'lead_scores', 'lead_scoring_rules', 'products',
      'crm_associations', 'crm_lead_conversions',
      'crm_cases', 'crm_opportunities', 'crm_leads', 'crm_contacts', 'crm_accounts',
      'activities', 'tasks', 'notifications', 'audit_logs',
      'records', 'ui_form_field_layouts', 'ui_wizard_steps', 'ui_workflow_steps',
      'ui_pipeline_stages', 'ui_dashboard_widgets', 'ui_field_dependencies',
      'ui_validations', 'ui_charts', 'ui_dashboards',
      'ui_forms', 'ui_fields', 'ui_pages', 'ui_wizards', 'ui_workflows',
      'ui_pipelines', 'ui_objects', 'ui_modules',
      'employee_hierarchy', 'employees', 'roles', 'branches', 'regions',
    ];
    const existingRows = await prisma.$queryRawUnsafe(
      `SELECT table_name AS table_name FROM information_schema.tables WHERE table_schema = DATABASE()`
    );
    const existingTables = new Set(existingRows.map((row) => row.table_name));

    await prisma.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS = 0');
    let skippedMissingTables = 0;
    for (const t of tables) {
      if (!existingTables.has(t)) {
        skippedMissingTables += 1;
        continue;
      }
      await prisma.$executeRawUnsafe(`DELETE FROM \`${t}\``);
    }
    await prisma.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS = 1');

    if (skippedMissingTables > 0) {
      console.log(`⚠️  Skipped ${skippedMissingTables} missing tables while clearing`);
    }
    console.log('✅ Database cleared');
  } catch (e) {
    console.error('❌ Failed to clear database:', e);
    throw e;
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Run promises in batches to avoid overwhelming the DB connection pool */
async function batchRun(items, fn, batchSize = 5) {
  const results = [];
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    const batchResults = await Promise.all(batch.map(fn));
    results.push(...batchResults);
  }
  return results;
}

async function createFields(objectId, defs) {
  const fields = await batchRun(defs, def =>
    prisma.uiField.create({ data: { object_id: objectId, ...def } })
  );
  return Object.fromEntries(fields.map((f, i) => [defs[i].name, f]));
}

async function createForm(objectId, formData, layouts, fieldMap) {
  const form = await prisma.uiForm.create({ data: { object_id: objectId, ...formData } });
  await batchRun(layouts, entry => {
    const field = fieldMap[entry.field_name];
    if (!field) { console.warn(`  ⚠ field '${entry.field_name}' not found, skipping`); return Promise.resolve(); }
    return prisma.uiFormFieldLayout.create({
      data: { form_id: form.id, field_id: field.id, row: entry.row, col: entry.col, col_span: entry.col_span ?? 1, order_index: entry.order_index },
    });
  });
  return form;
}

// ─── Shared option sets ───────────────────────────────────────────────────────
const LEAD_SOURCE_OPTIONS = [
  { value: 'referral',          label: 'Client Referral'     },
  { value: 'seminar',           label: 'Seminar/Workshop'    },
  { value: 'web',               label: 'Website Inquiry'     },
  { value: 'cold_call',         label: 'Cold Call'           },
  { value: 'mailer',            label: 'Direct Mail'         },
  { value: 'social_media',      label: 'Social Media'        },
  { value: 'partner',           label: 'Partner/Broker'      },
  { value: 'walk_in',           label: 'Walk-In'             },
  { value: 'other',             label: 'Other'               },
];

const PRODUCT_TYPE_OPTIONS = [
  { value: 'term_life',         label: 'Term Life'           },
  { value: 'whole_life',        label: 'Whole Life'          },
  { value: 'universal_life',    label: 'Universal Life'      },
  { value: 'variable_life',     label: 'Variable Life'       },
  { value: 'indexed_universal', label: 'Indexed Universal Life' },
  { value: 'final_expense',     label: 'Final Expense'       },
  { value: 'group_life',        label: 'Group Life'          },
  { value: 'annuity',           label: 'Annuity'             },
];

const RATING_OPTIONS = [
  { value: 'hot',  label: 'Hot',  color: '#ef4444' },
  { value: 'warm', label: 'Warm', color: '#f59e0b' },
  { value: 'cold', label: 'Cold', color: '#6b7280' },
];

const GENDER_OPTIONS = [
  { value: 'male',   label: 'Male'   },
  { value: 'female', label: 'Female' },
  { value: 'other',  label: 'Other'  },
];

const SMOKER_STATUS_OPTIONS = [
  { value: 'never',   label: 'Never Smoked' },
  { value: 'former',  label: 'Former Smoker' },
  { value: 'current', label: 'Current Smoker' },
];

const HEALTH_CLASS_OPTIONS = [
  { value: 'preferred_plus',  label: 'Preferred Plus',  color: '#10b981' },
  { value: 'preferred',       label: 'Preferred',       color: '#3b82f6' },
  { value: 'standard_plus',   label: 'Standard Plus',   color: '#6366f1' },
  { value: 'standard',        label: 'Standard',        color: '#f59e0b' },
  { value: 'substandard',     label: 'Substandard',     color: '#ef4444' },
];

const MARITAL_STATUS_OPTIONS = [
  { value: 'single',   label: 'Single'   },
  { value: 'married',  label: 'Married'  },
  { value: 'divorced', label: 'Divorced' },
  { value: 'widowed',  label: 'Widowed'  },
];

const PAYMENT_METHOD_OPTIONS = [
  { value: 'bank_draft',   label: 'Bank Draft (ACH)' },
  { value: 'credit_card',  label: 'Credit Card'      },
  { value: 'check',        label: 'Check'            },
  { value: 'payroll',      label: 'Payroll Deduction' },
];

const PAYMENT_FREQUENCY_OPTIONS = [
  { value: 'monthly',     label: 'Monthly'     },
  { value: 'quarterly',   label: 'Quarterly'   },
  { value: 'semi_annual', label: 'Semi-Annual' },
  { value: 'annual',      label: 'Annual'      },
];

async function main() {
  console.log('🌱 Seeding Genesis Life Insurance CRM database...\n');
  await clearDatabase();
  await flushRedisCache();
  console.log('');

  // ── Default Tenant ──────────────────────────────────────────────────────────
  const defaultTenant = await prisma.tenant.upsert({
    where:  { slug: 'genesis-life-demo' },
    update: {},
    create: {
      name: 'Genesis Life Insurance Demo',
      slug: 'genesis-life-demo',
      domain: 'demo.genesislife.local',
      industry: 'life_insurance',
      plan: 'enterprise',
      status: 'active',
      max_users: 999,
      max_storage_mb: 50000,
      max_api_calls: 500000,
      billing_email: 'billing@genesislife.local',
      timezone: 'America/New_York',
      locale: 'en',
      created_by: 'PLATFORM01',
      metadata: { demo: true, notes: 'Default tenant for life insurance demo/development purposes' },
    },
  });
  const T = defaultTenant.id;

  // Apply tenant-scoping middleware so all subsequent creates auto-get tenant_id = T.
  const { applyTenantMiddleware, tenantContext } = require('../src/middleware/tenant-scope');
  if (!prisma._tenantMiddlewareApplied) {
    prisma = applyTenantMiddleware(prisma);
    prisma._tenantMiddlewareApplied = true;
  }

  // ── System role (no tenant — platform_admin is global) ────────────────────
  // Created BEFORE tenant context so it gets tenant_id = null
  const platformAdminRole = await prisma.role.create({
    data: { name: 'platform_admin', label: 'Platform Administrator', description: 'SaaS platform-level super administrator', level: 1, tenant_id: null },
  });

  // ── Tenant-scoped roles ───────────────────────────────────────────────────
  tenantContext.enterWith({ tenantId: T });

  const roleDefs = [
    { name: 'super_admin',        label: 'Super Administrator',  description: 'Full system access; can configure and manage everything',                    level: 2 },
    { name: 'admin',              label: 'Administrator',        description: 'Administrative access; can manage modules and users',                        level: 3 },
    { name: 'manager',            label: 'Manager',              description: 'Can view and manage records of direct/indirect reports',                     level: 4 },
    { name: 'user',               label: 'User',                 description: 'Standard user; can only access own records',                                level: 5 },
    // Underwriting team roles — cannot sell, can only underwrite
    { name: 'uw_manager',         label: 'UW Manager',           description: 'Chief underwriter; can decide all cases, manage UW team, override limits',  level: 4 },
    { name: 'senior_underwriter', label: 'Senior Underwriter',   description: 'Complex cases, higher coverage limits, impaired-risk assessments',          level: 5 },
    { name: 'underwriter',        label: 'Underwriter',          description: 'Standard underwriting; low-risk cases within binding authority limits',      level: 6 },
  ];
  const roles = { platform_admin: platformAdminRole };
  for (const def of roleDefs) {
    roles[def.name] = await prisma.role.create({ data: def });
  }
  console.log('✅ Roles created (platform_admin · super_admin · admin · manager · user · uw_manager · senior_underwriter · underwriter)');
  console.log('✅ Default Tenant created (Genesis Life Insurance Demo — Enterprise plan)');

  // ── Regions ────────────────────────────────────────────────────────────────
  const regionWest = await prisma.region.create({ data: { region_name: 'West Region', region_code: 'WEST', tenant_id: T } });
  const regionEast = await prisma.region.create({ data: { region_name: 'East Region', region_code: 'EAST', tenant_id: T } });
  console.log('✅ Regions created');

  // ── Branches (Insurance Agency Offices) ────────────────────────────────────
  const branchHQ = await prisma.branch.create({
    data: { branch_name: 'Main Agency Office', branch_code: 'HQ', region_id: regionWest.region_id, address: '100 Insurance Plaza, San Francisco, CA 94105' },
  });
  const branchNY = await prisma.branch.create({
    data: { branch_name: 'East Coast Agency Office', branch_code: 'NYC', region_id: regionEast.region_id, address: '500 Park Ave, Suite 200, New York, NY 10022' },
  });
  console.log('✅ Agency Offices created');

  // ── Employees (Insurance Agent Roles) ─────────────────────────────────────
  const platformPwd = await bcrypt.hash(process.env.SEED_PLATFORM_PASSWORD || 'Platform@123', 12);
  const adminPwd = await bcrypt.hash(process.env.SEED_ADMIN_PASSWORD   || 'Admin@123',   12);
  const mgrPwd   = await bcrypt.hash(process.env.SEED_MANAGER_PASSWORD || 'Manager@123', 12);
  const usrPwd   = await bcrypt.hash(process.env.SEED_USER_PASSWORD    || 'User@123',    12);

  const uwPwd    = await bcrypt.hash(process.env.SEED_UW_PASSWORD     || 'Underwriter@123', 12);

  const platform = await prisma.employee.create({ data: { employee_id: 'PLATFORM01', employee_name: 'Platform Super Admin',  role: 'platform_admin',    email: 'platform@genesislife.local',        phone: '+1-800-000-0000', password: platformPwd, branch_id: branchHQ.branch_id, region_id: regionWest.region_id } });
  const admin    = await prisma.employee.create({ data: { employee_id: 'ADMIN001',   employee_name: 'Agency Owner',          role: 'super_admin',       email: 'owner@genesislife.local',           phone: '+1-800-000-0001', password: adminPwd, branch_id: branchHQ.branch_id, region_id: regionWest.region_id } });
  const manager1 = await prisma.employee.create({ data: { employee_id: 'MGR001',     employee_name: 'Sales Manager',         role: 'manager',           email: 'sales.manager@genesislife.local',   password: mgrPwd,   branch_id: branchHQ.branch_id, region_id: regionWest.region_id } });
  const user1    = await prisma.employee.create({ data: { employee_id: 'USR001',     employee_name: 'Senior Agent',          role: 'user',              email: 'senior.agent@genesislife.local',    password: usrPwd,   branch_id: branchHQ.branch_id, region_id: regionWest.region_id } });
  const user2    = await prisma.employee.create({ data: { employee_id: 'USR002',     employee_name: 'Agent',                 role: 'user',              email: 'agent@genesislife.local',            password: usrPwd,   branch_id: branchNY.branch_id, region_id: regionEast.region_id } });
  // Underwriting team — cannot sell, can only underwrite
  const uwMgr    = await prisma.employee.create({ data: { employee_id: 'UWMGR001',  employee_name: 'Chief Underwriter',     role: 'uw_manager',        email: 'chief.uw@genesislife.local',        password: uwPwd,    branch_id: branchHQ.branch_id, region_id: regionWest.region_id } });
  const srUw     = await prisma.employee.create({ data: { employee_id: 'SRUW001',   employee_name: 'Senior Underwriter',    role: 'senior_underwriter', email: 'senior.uw@genesislife.local',      password: uwPwd,    branch_id: branchHQ.branch_id, region_id: regionWest.region_id } });
  const uw1      = await prisma.employee.create({ data: { employee_id: 'UW001',     employee_name: 'Underwriter',           role: 'underwriter',       email: 'underwriter@genesislife.local',     password: uwPwd,    branch_id: branchNY.branch_id, region_id: regionEast.region_id } });
  console.log('✅ Employees created (Platform · Owner · Manager · 2 Agents · Chief UW · Senior UW · Underwriter)');

  for (const e of [
    { ancestor_id: platform.employee_id, descendant_id: platform.employee_id, depth: 0},
    { ancestor_id: admin.employee_id,    descendant_id: admin.employee_id,    depth: 0},
    { ancestor_id: manager1.employee_id, descendant_id: manager1.employee_id, depth: 0},
    { ancestor_id: user1.employee_id,    descendant_id: user1.employee_id,    depth: 0},
    { ancestor_id: user2.employee_id,    descendant_id: user2.employee_id,    depth: 0},
    { ancestor_id: platform.employee_id, descendant_id: admin.employee_id,    depth: 1},
    { ancestor_id: platform.employee_id, descendant_id: manager1.employee_id, depth: 2},
    { ancestor_id: platform.employee_id, descendant_id: user1.employee_id,    depth: 3},
    { ancestor_id: platform.employee_id, descendant_id: user2.employee_id,    depth: 3},
    { ancestor_id: admin.employee_id,    descendant_id: manager1.employee_id, depth: 1},
    { ancestor_id: admin.employee_id,    descendant_id: user1.employee_id,    depth: 2},
    { ancestor_id: admin.employee_id,    descendant_id: user2.employee_id,    depth: 2},
    { ancestor_id: manager1.employee_id, descendant_id: user1.employee_id,    depth: 1},
    { ancestor_id: manager1.employee_id, descendant_id: user2.employee_id,    depth: 1},
    // UW team hierarchy: uwMgr → srUw → uw1
    { ancestor_id: uwMgr.employee_id,   descendant_id: uwMgr.employee_id,   depth: 0},
    { ancestor_id: srUw.employee_id,    descendant_id: srUw.employee_id,    depth: 0},
    { ancestor_id: uw1.employee_id,     descendant_id: uw1.employee_id,     depth: 0},
    { ancestor_id: uwMgr.employee_id,   descendant_id: srUw.employee_id,    depth: 1},
    { ancestor_id: uwMgr.employee_id,   descendant_id: uw1.employee_id,     depth: 2},
    { ancestor_id: srUw.employee_id,    descendant_id: uw1.employee_id,     depth: 1},
    // admin → UW team
    { ancestor_id: admin.employee_id,   descendant_id: uwMgr.employee_id,   depth: 1},
    { ancestor_id: admin.employee_id,   descendant_id: srUw.employee_id,    depth: 2},
    { ancestor_id: admin.employee_id,   descendant_id: uw1.employee_id,     depth: 3},
  ]) await prisma.employeeHierarchy.create({ data: e });
  console.log('✅ Employee hierarchy seeded\n');

  // ══════════════════════════════════════════════════════════════════════════════
  // MODULES — Life Insurance CRM
  // ══════════════════════════════════════════════════════════════════════════════
  const leadsModule         = await prisma.uiModule.create({ data: { name: 'leads',         label: 'Leads',         description: 'Raw inbound leads — qualify and convert to prospects', icon: 'UserPlus',    color: 'sky',    category: 'crm',       order_index: 0 } });
  const prospectsModule     = await prisma.uiModule.create({ data: { name: 'prospects',     label: 'Prospects',     description: 'Manage insurance prospects and leads',            icon: 'Users',          color: 'blue',   category: 'crm',       order_index: 1 } });
  const clientsModule      = await prisma.uiModule.create({ data: { name: 'clients',       label: 'Clients',       description: 'Manage policyholders and client relationships',   icon: 'Heart',          color: 'indigo', category: 'crm',       order_index: 2 } });
  const quotesModule       = await prisma.uiModule.create({ data: { name: 'quotes',        label: 'Quotes',        description: 'Insurance quotes and premium calculations',       icon: 'DollarSign',     color: 'green',  category: 'insurance', order_index: 3 } });
  const applicationsModule = await prisma.uiModule.create({ data: { name: 'applications',  label: 'Applications',  description: 'Life insurance applications and processing',      icon: 'FileText',       color: 'amber',  category: 'insurance', order_index: 4 } });
  const policiesModule     = await prisma.uiModule.create({ data: { name: 'policies',      label: 'Policies',      description: 'Active policies and policy management',           icon: 'Shield',         color: 'teal',   category: 'insurance', order_index: 5 } });
  const claimsModule       = await prisma.uiModule.create({ data: { name: 'claims',        label: 'Claims',        description: 'Insurance claims processing and management',      icon: 'AlertTriangle',  color: 'red',    category: 'insurance', order_index: 6 } });
  const underwritingModule = await prisma.uiModule.create({ data: { name: 'underwriting',  label: 'Underwriting',  description: 'Risk assessment and underwriting cases',          icon: 'Activity',       color: 'purple', category: 'insurance', order_index: 7 } });
  const commissionsModule  = await prisma.uiModule.create({ data: { name: 'commissions',   label: 'Commissions',   description: 'Agent commissions and compensation tracking',     icon: 'CreditCard',     color: 'amber',  category: 'insurance', order_index: 8 } });
  const declarationsModule = await prisma.uiModule.create({ data: { name: 'declarations',  label: 'Declarations',  description: 'Client declaration acceptance and regulatory disclosures', icon: 'FileText',  color: 'teal',   category: 'insurance', order_index: 9 } });
  const docCollectionModule= await prisma.uiModule.create({ data: { name: 'document_collection', label: 'Document Collection', description: 'Application document capture and verification', icon: 'FileText', color: 'blue',   category: 'insurance', order_index: 10 } });
  // Application-wide settings are handled by the dedicated Settings module
  // (frontend /settings + /api/settings), not a metadata-driven UI module.
  // ── Tier 1 metadata-driven modules (formerly hardcoded pages) ──
  const productsModule     = await prisma.uiModule.create({ data: { name: 'products',      label: 'Products',      description: 'Product catalog — pricing, SKUs, and availability',   icon: 'Package',        color: 'green',  category: 'crm',       order_index: 12 } });
  console.log('✅ Modules created (13 total: Leads · Prospects · Clients · Quotes · Applications · Policies · Claims · Underwriting · Commissions · Declarations · Document Collection · Settings · Products)\n');

  // ══════════════════════════════════════════════════════════════════════════════
  // OBJECT 0 — LEAD  (module: Leads, internal name `lead_intake`)
  // Raw/unqualified inbound. "Convert to Prospect" creates a crm_leads row.
  // ══════════════════════════════════════════════════════════════════════════════
  const leadObject = await prisma.uiObject.create({
    data: { module_id: leadsModule.id, name: 'lead_intake', label: 'Lead', plural_label: 'Leads', description: 'Raw inbound lead — qualify to convert into a Prospect', icon: 'UserPlus', order_index: 1 },
  });

  const leadFields = await createFields(leadObject.id, [
    { name: 'first_name',   label: 'First Name',   field_type: 'text',     data_type: 'string', is_required: true,  order_index: 1, config: { show_in_list: true } },
    { name: 'last_name',    label: 'Last Name',    field_type: 'text',     data_type: 'string', is_required: true,  order_index: 2, config: { show_in_list: true } },
    { name: 'email',        label: 'Email',        field_type: 'email',    data_type: 'string', is_required: false, order_index: 3, placeholder: 'john@example.com', config: { show_in_list: true } },
    { name: 'phone',        label: 'Phone',        field_type: 'phone',    data_type: 'string', is_required: false, order_index: 4, placeholder: '+1 555-000-0000' },
    { name: 'mobile',       label: 'Mobile',       field_type: 'phone',    data_type: 'string', is_required: false, order_index: 5 },
    { name: 'company',      label: 'Company',      field_type: 'text',     data_type: 'string', is_required: false, order_index: 6, config: { show_in_list: true } },
    { name: 'job_title',    label: 'Job Title',    field_type: 'text',     data_type: 'string', is_required: false, order_index: 7 },
    { name: 'industry',     label: 'Industry',     field_type: 'text',     data_type: 'string', is_required: false, order_index: 8 },
    { name: 'annual_income',label: 'Annual Income',field_type: 'currency', data_type: 'number', is_required: false, order_index: 9, config: { currency: 'USD' } },
    { name: 'website',      label: 'Website',      field_type: 'text',     data_type: 'string', is_required: false, order_index: 10 },
    { name: 'lead_source',  label: 'Lead Source',  field_type: 'select',   data_type: 'string', is_required: false, order_index: 11, options: LEAD_SOURCE_OPTIONS, config: { show_in_list: true } },
    {
      name: 'lead_status', label: 'Status', field_type: 'select', data_type: 'string', is_required: true, order_index: 12, default_value: 'new', config: { show_in_list: true },
      options: [
        { value: 'new',       label: 'New',       color: '#6366f1' },
        { value: 'contacted', label: 'Contacted', color: '#3b82f6' },
        { value: 'qualified', label: 'Qualified', color: '#10b981' },
        { value: 'converted', label: 'Converted', color: '#8b5cf6' },
      ],
    },
    { name: 'rating',       label: 'Rating',       field_type: 'select',   data_type: 'string', is_required: false, order_index: 13, options: RATING_OPTIONS },
    { name: 'notes',        label: 'Notes',        field_type: 'textarea', data_type: 'string', is_required: false, order_index: 14 },
    // Read-only, engine-populated scoring fields (values injected from lead_scores at read time).
    { name: 'score',        label: 'Score',        field_type: 'number',   data_type: 'number', is_required: false, order_index: 15, config: { always_disabled: true, show_in_list: true }, help_text: 'Auto-calculated by the lead scoring engine' },
    {
      name: 'grade', label: 'Grade', field_type: 'select', data_type: 'string', is_required: false, order_index: 16, config: { always_disabled: true, show_in_list: true },
      options: [
        { value: 'A', label: 'A — Hot',      color: '#10b981' },
        { value: 'B', label: 'B — Warm',     color: '#3b82f6' },
        { value: 'C', label: 'C — Moderate', color: '#f59e0b' },
        { value: 'D', label: 'D — Cool',     color: '#f97316' },
        { value: 'F', label: 'F — Cold',     color: '#ef4444' },
      ],
    },
  ]);

  await prisma.uiValidation.createMany({ data: [
    { field_id: leadFields['email'].id,      validation_type: 'pattern',   value: '^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$',   error_message: 'Please enter a valid email address',       order_index: 1 },
    { field_id: leadFields['phone'].id,      validation_type: 'pattern',   value: '^[\\+]?[\\d\\s\\-\\(\\)]{7,20}$', error_message: 'Please enter a valid phone number',        order_index: 1 },
    { field_id: leadFields['first_name'].id, validation_type: 'minLength', value: '2',                                error_message: 'First name must be at least 2 characters', order_index: 1 },
    { field_id: leadFields['last_name'].id,  validation_type: 'minLength', value: '2',                                error_message: 'Last name must be at least 2 characters',  order_index: 1 },
  ]});

  await createForm(leadObject.id,
    { name: 'lead_create', label: 'New Lead', form_type: 'create', columns: 2 },
    [
      { field_name: 'first_name',    row: 0, col: 0, col_span: 1, order_index: 1 },
      { field_name: 'last_name',     row: 0, col: 1, col_span: 1, order_index: 2 },
      { field_name: 'email',         row: 1, col: 0, col_span: 1, order_index: 3 },
      { field_name: 'phone',         row: 1, col: 1, col_span: 1, order_index: 4 },
      { field_name: 'mobile',        row: 2, col: 0, col_span: 1, order_index: 5 },
      { field_name: 'company',       row: 2, col: 1, col_span: 1, order_index: 6 },
      { field_name: 'job_title',     row: 3, col: 0, col_span: 1, order_index: 7 },
      { field_name: 'industry',      row: 3, col: 1, col_span: 1, order_index: 8 },
      { field_name: 'annual_income', row: 4, col: 0, col_span: 1, order_index: 9 },
      { field_name: 'website',       row: 4, col: 1, col_span: 1, order_index: 10 },
      { field_name: 'lead_source',   row: 5, col: 0, col_span: 1, order_index: 11 },
      { field_name: 'lead_status',   row: 5, col: 1, col_span: 1, order_index: 12 },
      { field_name: 'rating',        row: 6, col: 0, col_span: 1, order_index: 13 },
      { field_name: 'notes',         row: 7, col: 0, col_span: 2, order_index: 14 },
    ], leadFields);
  console.log('✅ Lead: 16 fields (score + grade read-only) · 4 validations · form');

  // ══════════════════════════════════════════════════════════════════════════════
  // OBJECT 1 — PROSPECT  (module: Prospects)
  // ══════════════════════════════════════════════════════════════════════════════
  const prospectObject = await prisma.uiObject.create({
    data: { module_id: prospectsModule.id, name: 'prospect', label: 'Prospect', plural_label: 'Prospects', description: 'Potential insurance client / unqualified lead', icon: 'UserPlus', order_index: 1 },
  });

  const prospectFields = await createFields(prospectObject.id, [
    { name: 'first_name',        label: 'First Name',        field_type: 'text',     data_type: 'string',  is_required: true,  order_index: 1 },
    { name: 'last_name',         label: 'Last Name',         field_type: 'text',     data_type: 'string',  is_required: true,  order_index: 2 },
    { name: 'full_name',         label: 'Full Name',         field_type: 'text',     data_type: 'string',  is_required: false, order_index: 3, help_text: 'Auto-calculated from first + last name', config: { computed: { fn: 'calc_full_name', trigger_fields: ['first_name', 'last_name'], trigger_event: 'on_change' } } },
    { name: 'email',             label: 'Email',             field_type: 'email',    data_type: 'string',  is_required: true,  order_index: 4, placeholder: 'john@example.com' },
    { name: 'phone',             label: 'Phone',             field_type: 'phone',    data_type: 'string',  is_required: false, order_index: 5, placeholder: '+1 555-000-0000' },
    { name: 'mobile',            label: 'Mobile',            field_type: 'phone',    data_type: 'string',  is_required: false, order_index: 6 },
    { name: 'date_of_birth',     label: 'Date of Birth',     field_type: 'date',     data_type: 'date',    is_required: false, order_index: 7 },
    { name: 'age',               label: 'Age',               field_type: 'number',   data_type: 'number',  is_required: false, order_index: 8, config: { always_disabled: true, computed: { fn: 'calc_age', trigger_fields: ['date_of_birth'], trigger_event: 'on_change' } } },
    { name: 'gender',            label: 'Gender',            field_type: 'select',   data_type: 'string',  is_required: false, order_index: 9, options: GENDER_OPTIONS },
    { name: 'smoker_status',     label: 'Smoker Status',     field_type: 'select',   data_type: 'string',  is_required: false, order_index: 10, options: SMOKER_STATUS_OPTIONS },
    { name: 'occupation',        label: 'Occupation',        field_type: 'text',     data_type: 'string',  is_required: false, order_index: 11 },
    { name: 'annual_income',     label: 'Annual Income',     field_type: 'currency', data_type: 'number',  is_required: false, order_index: 12, config: { currency: 'USD' } },
    { name: 'lead_source',       label: 'Lead Source',       field_type: 'select',   data_type: 'string',  is_required: false, order_index: 13, options: LEAD_SOURCE_OPTIONS },
    {
      name: 'lead_status', label: 'Status', field_type: 'select', data_type: 'string', is_required: true, order_index: 14, default_value: 'new',
      options: [
        { value: 'new',         label: 'New',           color: '#6366f1' },
        { value: 'contacted',   label: 'Contacted',     color: '#3b82f6' },
        { value: 'qualified',   label: 'Qualified',     color: '#10b981' },
        { value: 'unqualified', label: 'Unqualified',   color: '#ef4444' },
        { value: 'converted',   label: 'Converted',     color: '#8b5cf6' },
      ],
    },
    { name: 'rating',            label: 'Rating',            field_type: 'select',   data_type: 'string',  is_required: false, order_index: 15, options: RATING_OPTIONS },
    { name: 'preferred_product', label: 'Preferred Product', field_type: 'select',   data_type: 'string',  is_required: false, order_index: 16, options: PRODUCT_TYPE_OPTIONS },
    { name: 'coverage_interest', label: 'Coverage Interest', field_type: 'currency', data_type: 'number',  is_required: false, order_index: 17, config: { currency: 'USD' }, help_text: 'Desired coverage amount' },
    { name: 'health_notes',      label: 'Health Notes',      field_type: 'textarea', data_type: 'string',  is_required: false, order_index: 18, help_text: 'Visible when smoker status is Current' },
    { name: 'notes',             label: 'Notes',             field_type: 'textarea', data_type: 'string',  is_required: false, order_index: 19 },
  ]);

  await prisma.uiValidation.createMany({ data: [
    { field_id: prospectFields['email'].id,            validation_type: 'pattern',   value: '^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$',   error_message: 'Please enter a valid email address',            order_index: 1 },
    { field_id: prospectFields['phone'].id,            validation_type: 'pattern',   value: '^[\\+]?[\\d\\s\\-\\(\\)]{7,20}$', error_message: 'Please enter a valid phone number',             order_index: 1 },
    { field_id: prospectFields['mobile'].id,           validation_type: 'pattern',   value: '^[\\+]?[\\d\\s\\-\\(\\)]{7,20}$', error_message: 'Please enter a valid mobile number',            order_index: 1 },
    { field_id: prospectFields['annual_income'].id,    validation_type: 'min',       value: '0',                                error_message: 'Annual income cannot be negative',              order_index: 1 },
    { field_id: prospectFields['coverage_interest'].id,validation_type: 'min',       value: '0',                                error_message: 'Coverage amount cannot be negative',            order_index: 1 },
    { field_id: prospectFields['first_name'].id,       validation_type: 'minLength', value: '2',                                error_message: 'First name must be at least 2 characters',      order_index: 1 },
    { field_id: prospectFields['last_name'].id,        validation_type: 'minLength', value: '2',                                error_message: 'Last name must be at least 2 characters',       order_index: 1 },
    { field_id: prospectFields['age'].id,              validation_type: 'min',       value: '18',                               error_message: 'Prospect must be at least 18 years old',        order_index: 1 },
    { field_id: prospectFields['age'].id,              validation_type: 'max',       value: '85',                               error_message: 'Prospect cannot be older than 85',              order_index: 2 },
  ]});

  // Dependency: smoker_status = current → show health_notes
  await prisma.uiFieldDependency.create({ data: {
    source_field_id: prospectFields['smoker_status'].id,
    target_field_id: prospectFields['health_notes'].id,
    condition_type:  'equals',
    condition_value: 'current',
    action_type:     'show',
  }});

  const prospectCreateForm = await createForm(prospectObject.id,
    { name: 'prospect_create', label: 'New Prospect', form_type: 'create', columns: 2 },
    [
      { field_name: 'first_name',        row: 0, col: 0, col_span: 1, order_index: 1 },
      { field_name: 'last_name',         row: 0, col: 1, col_span: 1, order_index: 2 },
      { field_name: 'full_name',         row: 1, col: 0, col_span: 2, order_index: 3 },
      { field_name: 'email',             row: 2, col: 0, col_span: 1, order_index: 4 },
      { field_name: 'phone',             row: 2, col: 1, col_span: 1, order_index: 5 },
      { field_name: 'mobile',            row: 3, col: 0, col_span: 1, order_index: 6 },
      { field_name: 'date_of_birth',     row: 3, col: 1, col_span: 1, order_index: 7 },
      { field_name: 'age',               row: 4, col: 0, col_span: 1, order_index: 8 },
      { field_name: 'gender',            row: 4, col: 1, col_span: 1, order_index: 9 },
      { field_name: 'smoker_status',     row: 5, col: 0, col_span: 1, order_index: 10 },
      { field_name: 'occupation',        row: 5, col: 1, col_span: 1, order_index: 11 },
      { field_name: 'annual_income',     row: 6, col: 0, col_span: 1, order_index: 12 },
      { field_name: 'lead_source',       row: 6, col: 1, col_span: 1, order_index: 13 },
      { field_name: 'lead_status',       row: 7, col: 0, col_span: 1, order_index: 14 },
      { field_name: 'rating',            row: 7, col: 1, col_span: 1, order_index: 15 },
      { field_name: 'preferred_product', row: 8, col: 0, col_span: 1, order_index: 16 },
      { field_name: 'coverage_interest', row: 8, col: 1, col_span: 1, order_index: 17 },
      { field_name: 'health_notes',      row: 9, col: 0, col_span: 2, order_index: 18 },
      { field_name: 'notes',             row: 10, col: 0, col_span: 2, order_index: 19 },
    ], prospectFields);
  console.log('✅ Prospect: 19 fields · 9 validations · 1 custom fn · 1 dep · form');

  // ══════════════════════════════════════════════════════════════════════════════
  // OBJECT 2 — CLIENT  (module: Clients)
  // ══════════════════════════════════════════════════════════════════════════════
  const clientObject = await prisma.uiObject.create({
    data: { module_id: clientsModule.id, name: 'client', label: 'Client', plural_label: 'Clients', description: 'Active insurance client / policyholder', icon: 'Heart', order_index: 1 },
  });

  const clientFields = await createFields(clientObject.id, [
    { name: 'first_name',              label: 'First Name',              field_type: 'text',     data_type: 'string',  is_required: true,  order_index: 1 },
    { name: 'last_name',               label: 'Last Name',              field_type: 'text',     data_type: 'string',  is_required: true,  order_index: 2 },
    { name: 'email',                   label: 'Email',                  field_type: 'email',    data_type: 'string',  is_required: true,  order_index: 3, placeholder: 'client@example.com' },
    { name: 'phone',                   label: 'Phone',                  field_type: 'phone',    data_type: 'string',  is_required: false, order_index: 4 },
    { name: 'date_of_birth',           label: 'Date of Birth',          field_type: 'date',     data_type: 'date',    is_required: true,  order_index: 5 },
    { name: 'age',                     label: 'Age',                    field_type: 'number',   data_type: 'number',  is_required: false, order_index: 6, config: { always_disabled: true, computed: { fn: 'calc_age', trigger_fields: ['date_of_birth'], trigger_event: 'on_change' } } },
    { name: 'gender',                  label: 'Gender',                 field_type: 'select',   data_type: 'string',  is_required: false, order_index: 7, options: GENDER_OPTIONS },
    { name: 'ssn',                     label: 'SSN',                    field_type: 'text',     data_type: 'string',  is_required: false, order_index: 8, placeholder: 'XXX-XX-XXXX', help_text: 'Social Security Number (encrypted)' },
    { name: 'smoker_status',           label: 'Smoker Status',          field_type: 'select',   data_type: 'string',  is_required: false, order_index: 9, options: SMOKER_STATUS_OPTIONS },
    { name: 'health_class',            label: 'Health Class',           field_type: 'select',   data_type: 'string',  is_required: false, order_index: 10, options: HEALTH_CLASS_OPTIONS },
    { name: 'occupation',              label: 'Occupation',             field_type: 'text',     data_type: 'string',  is_required: false, order_index: 11 },
    { name: 'employer',                label: 'Employer',               field_type: 'text',     data_type: 'string',  is_required: false, order_index: 12 },
    { name: 'annual_income',           label: 'Annual Income',          field_type: 'currency', data_type: 'number',  is_required: false, order_index: 13, config: { currency: 'USD' } },
    { name: 'marital_status',          label: 'Marital Status',         field_type: 'select',   data_type: 'string',  is_required: false, order_index: 14, options: MARITAL_STATUS_OPTIONS },
    { name: 'num_dependents',          label: 'Number of Dependents',   field_type: 'number',   data_type: 'number',  is_required: false, order_index: 15, default_value: '0' },
    { name: 'beneficiary_name',        label: 'Primary Beneficiary',    field_type: 'text',     data_type: 'string',  is_required: false, order_index: 16 },
    { name: 'beneficiary_relationship',label: 'Beneficiary Relationship', field_type: 'select', data_type: 'string',  is_required: false, order_index: 17,
      options: [
        { value: 'spouse',  label: 'Spouse'  }, { value: 'child',   label: 'Child'   },
        { value: 'parent',  label: 'Parent'  }, { value: 'sibling', label: 'Sibling' },
        { value: 'trust',   label: 'Trust'   }, { value: 'estate',  label: 'Estate'  },
        { value: 'other',   label: 'Other'   },
      ],
    },
    { name: 'address_street',          label: 'Street Address',         field_type: 'text',     data_type: 'string',  is_required: false, order_index: 18 },
    { name: 'address_city',            label: 'City',                   field_type: 'text',     data_type: 'string',  is_required: false, order_index: 19 },
    { name: 'address_state',           label: 'State',                  field_type: 'text',     data_type: 'string',  is_required: false, order_index: 20 },
    { name: 'address_zip',             label: 'ZIP Code',              field_type: 'text',     data_type: 'string',  is_required: false, order_index: 21 },
    { name: 'client_since',            label: 'Client Since',           field_type: 'date',     data_type: 'date',    is_required: false, order_index: 22 },
    { name: 'notes',                   label: 'Notes',                  field_type: 'textarea', data_type: 'string',  is_required: false, order_index: 23 },
  ]);

  await prisma.uiValidation.createMany({ data: [
    { field_id: clientFields['email'].id,          validation_type: 'pattern',   value: '^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$',   error_message: 'Please enter a valid email address',      order_index: 1 },
    { field_id: clientFields['phone'].id,          validation_type: 'pattern',   value: '^[\\+]?[\\d\\s\\-\\(\\)]{7,20}$', error_message: 'Please enter a valid phone number',       order_index: 1 },
    { field_id: clientFields['ssn'].id,            validation_type: 'pattern',   value: '^\\d{3}-\\d{2}-\\d{4}$',           error_message: 'SSN must be in format XXX-XX-XXXX',       order_index: 1 },
    { field_id: clientFields['annual_income'].id,  validation_type: 'min',       value: '0',                                error_message: 'Annual income cannot be negative',         order_index: 1 },
    { field_id: clientFields['num_dependents'].id, validation_type: 'min',       value: '0',                                error_message: 'Dependents cannot be negative',            order_index: 1 },
    { field_id: clientFields['age'].id,            validation_type: 'min',       value: '18',                               error_message: 'Client must be at least 18 years old',     order_index: 1 },
    { field_id: clientFields['age'].id,            validation_type: 'max',       value: '100',                              error_message: 'Age cannot exceed 100',                    order_index: 2 },
    { field_id: clientFields['first_name'].id,     validation_type: 'minLength', value: '2',                                error_message: 'First name must be at least 2 characters', order_index: 1 },
    { field_id: clientFields['last_name'].id,      validation_type: 'minLength', value: '2',                                error_message: 'Last name must be at least 2 characters',  order_index: 1 },
    { field_id: clientFields['address_zip'].id,    validation_type: 'pattern',   value: '^\\d{5}(-\\d{4})?$',              error_message: 'ZIP code must be 5 or 9 digits',          order_index: 1 },
  ]});

  const clientCreateForm = await createForm(clientObject.id,
    { name: 'client_create', label: 'New Client', form_type: 'create', columns: 2 },
    [
      { field_name: 'first_name',              row: 0, col: 0, col_span: 1, order_index: 1 },
      { field_name: 'last_name',               row: 0, col: 1, col_span: 1, order_index: 2 },
      { field_name: 'email',                   row: 1, col: 0, col_span: 1, order_index: 3 },
      { field_name: 'phone',                   row: 1, col: 1, col_span: 1, order_index: 4 },
      { field_name: 'date_of_birth',           row: 2, col: 0, col_span: 1, order_index: 5 },
      { field_name: 'age',                     row: 2, col: 1, col_span: 1, order_index: 6 },
      { field_name: 'gender',                  row: 3, col: 0, col_span: 1, order_index: 7 },
      { field_name: 'ssn',                     row: 3, col: 1, col_span: 1, order_index: 8 },
      { field_name: 'smoker_status',           row: 4, col: 0, col_span: 1, order_index: 9 },
      { field_name: 'health_class',            row: 4, col: 1, col_span: 1, order_index: 10 },
      { field_name: 'occupation',              row: 5, col: 0, col_span: 1, order_index: 11 },
      { field_name: 'employer',                row: 5, col: 1, col_span: 1, order_index: 12 },
      { field_name: 'annual_income',           row: 6, col: 0, col_span: 1, order_index: 13 },
      { field_name: 'marital_status',          row: 6, col: 1, col_span: 1, order_index: 14 },
      { field_name: 'num_dependents',          row: 7, col: 0, col_span: 1, order_index: 15 },
      { field_name: 'beneficiary_name',        row: 7, col: 1, col_span: 1, order_index: 16 },
      { field_name: 'beneficiary_relationship',row: 8, col: 0, col_span: 1, order_index: 17 },
      { field_name: 'client_since',            row: 8, col: 1, col_span: 1, order_index: 18 },
      { field_name: 'address_street',          row: 9, col: 0, col_span: 2, order_index: 19 },
      { field_name: 'address_city',            row: 10, col: 0, col_span: 1, order_index: 20 },
      { field_name: 'address_state',           row: 10, col: 1, col_span: 1, order_index: 21 },
      { field_name: 'address_zip',             row: 11, col: 0, col_span: 1, order_index: 22 },
      { field_name: 'notes',                   row: 12, col: 0, col_span: 2, order_index: 23 },
    ], clientFields);
  console.log('✅ Client: 23 fields · 10 validations · 1 custom fn · form');

  // ══════════════════════════════════════════════════════════════════════════════
  // OBJECT 3 — QUOTE  (module: Quotes)
  // ══════════════════════════════════════════════════════════════════════════════
  const quoteObject = await prisma.uiObject.create({
    data: { module_id: quotesModule.id, name: 'quote', label: 'Quote', plural_label: 'Quotes', description: 'Insurance premium quote for a client', icon: 'DollarSign', order_index: 1 },
  });

  const quoteFields = await createFields(quoteObject.id, [
    { name: 'quote_number',       label: 'Quote Number',       field_type: 'text',     data_type: 'string',  is_required: true,  order_index: 1, config: { auto_number: { prefix: 'QT-', format: 'YYYY-NNN' } } },
    { name: 'client_name',        label: 'Client Name',        field_type: 'text',     data_type: 'string',  is_required: true,  order_index: 2 },
    { name: 'product_type',       label: 'Product Type',       field_type: 'select',   data_type: 'string',  is_required: true,  order_index: 3, options: PRODUCT_TYPE_OPTIONS },
    { name: 'coverage_amount',    label: 'Coverage Amount',    field_type: 'currency', data_type: 'number',  is_required: true,  order_index: 4, config: { currency: 'USD' } },
    { name: 'term_years',         label: 'Term (Years)',       field_type: 'number',   data_type: 'number',  is_required: false, order_index: 5, help_text: 'Applicable for term life products' },
    { name: 'monthly_premium',    label: 'Monthly Premium',    field_type: 'currency', data_type: 'number',  is_required: false, order_index: 6, config: { currency: 'USD' } },
    { name: 'annual_premium',     label: 'Annual Premium',     field_type: 'currency', data_type: 'number',  is_required: false, order_index: 7, config: { currency: 'USD' } },
    {
      name: 'status', label: 'Status', field_type: 'select', data_type: 'string', is_required: true, order_index: 8, default_value: 'draft',
      options: [
        { value: 'draft',     label: 'Draft',     color: '#6b7280' },
        { value: 'presented', label: 'Presented',  color: '#3b82f6' },
        { value: 'accepted',  label: 'Accepted',  color: '#10b981' },
        { value: 'declined',  label: 'Declined',  color: '#ef4444' },
        { value: 'expired',   label: 'Expired',   color: '#f59e0b' },
      ],
    },
    { name: 'valid_until',        label: 'Valid Until',        field_type: 'date',     data_type: 'date',    is_required: false, order_index: 9 },
    { name: 'riders',             label: 'Riders',            field_type: 'textarea', data_type: 'string',  is_required: false, order_index: 10, help_text: 'Additional riders (waiver of premium, accidental death, etc.)' },
    { name: 'underwriting_class', label: 'Underwriting Class', field_type: 'select',  data_type: 'string',  is_required: false, order_index: 11, options: HEALTH_CLASS_OPTIONS },
    { name: 'notes',              label: 'Notes',              field_type: 'textarea', data_type: 'string',  is_required: false, order_index: 12 },
  ]);

  await prisma.uiValidation.createMany({ data: [
    { field_id: quoteFields['coverage_amount'].id, validation_type: 'min', value: '10000',  error_message: 'Coverage amount must be at least $10,000',  order_index: 1 },
    { field_id: quoteFields['monthly_premium'].id, validation_type: 'min', value: '0',      error_message: 'Premium cannot be negative',                order_index: 1 },
    { field_id: quoteFields['annual_premium'].id,  validation_type: 'min', value: '0',      error_message: 'Premium cannot be negative',                order_index: 1 },
    { field_id: quoteFields['term_years'].id,      validation_type: 'min', value: '1',      error_message: 'Term must be at least 1 year',              order_index: 1 },
    { field_id: quoteFields['term_years'].id,      validation_type: 'max', value: '40',     error_message: 'Term cannot exceed 40 years',               order_index: 2 },
    { field_id: quoteFields['client_name'].id,     validation_type: 'minLength', value: '2', error_message: 'Client name is too short',                 order_index: 1 },
  ]});

  const quoteCreateForm = await createForm(quoteObject.id,
    { name: 'quote_create', label: 'New Quote', form_type: 'create', columns: 2 },
    [
      { field_name: 'quote_number',       row: 0, col: 0, col_span: 1, order_index: 1 },
      { field_name: 'client_name',        row: 0, col: 1, col_span: 1, order_index: 2 },
      { field_name: 'product_type',       row: 1, col: 0, col_span: 1, order_index: 3 },
      { field_name: 'coverage_amount',    row: 1, col: 1, col_span: 1, order_index: 4 },
      { field_name: 'term_years',         row: 2, col: 0, col_span: 1, order_index: 5 },
      { field_name: 'underwriting_class', row: 2, col: 1, col_span: 1, order_index: 6 },
      { field_name: 'monthly_premium',    row: 3, col: 0, col_span: 1, order_index: 7 },
      { field_name: 'annual_premium',     row: 3, col: 1, col_span: 1, order_index: 8 },
      { field_name: 'status',             row: 4, col: 0, col_span: 1, order_index: 9 },
      { field_name: 'valid_until',        row: 4, col: 1, col_span: 1, order_index: 10 },
      { field_name: 'riders',             row: 5, col: 0, col_span: 2, order_index: 11 },
      { field_name: 'notes',              row: 6, col: 0, col_span: 2, order_index: 12 },
    ], quoteFields);
  console.log('✅ Quote: 12 fields · 6 validations · form');

  // ══════════════════════════════════════════════════════════════════════════════
  // OBJECT 4 — APPLICATION  (module: Applications)
  // ══════════════════════════════════════════════════════════════════════════════
  const applicationObject = await prisma.uiObject.create({
    data: { module_id: applicationsModule.id, name: 'application', label: 'Application', plural_label: 'Applications', description: 'Life insurance application for underwriting', icon: 'FileText', order_index: 1 },
  });

  const appFields = await createFields(applicationObject.id, [
    { name: 'application_number',  label: 'Application Number',  field_type: 'text',     data_type: 'string',  is_required: true,  order_index: 1, config: { auto_number: { prefix: 'APP-', format: 'YYYY-NNN' }, show_in_list: true } },
    { name: 'applicant_name',      label: 'Applicant Name',      field_type: 'text',     data_type: 'string',  is_required: true,  order_index: 2, config: { show_in_list: true } },
    { name: 'product_type',        label: 'Product Type',        field_type: 'select',   data_type: 'string',  is_required: true,  order_index: 3, options: PRODUCT_TYPE_OPTIONS, config: { show_in_list: true } },
    { name: 'coverage_amount',     label: 'Coverage Amount',     field_type: 'currency', data_type: 'number',  is_required: true,  order_index: 4, config: { currency: 'USD', show_in_list: true } },
    { name: 'premium',             label: 'Premium',             field_type: 'currency', data_type: 'number',  is_required: false, order_index: 5, config: { currency: 'USD' } },
    {
      name: 'status', label: 'Status', field_type: 'select', data_type: 'string', is_required: true, order_index: 6, default_value: 'submitted', config: { show_in_list: true },
      options: [
        { value: 'submitted',       label: 'Submitted',       color: '#6366f1' },
        { value: 'under_review',    label: 'Under Review',    color: '#3b82f6' },
        { value: 'pending_medical', label: 'Pending Medical', color: '#f59e0b' },
        { value: 'approved',        label: 'Approved',        color: '#10b981' },
        { value: 'declined',        label: 'Declined',        color: '#ef4444' },
        { value: 'withdrawn',       label: 'Withdrawn',       color: '#6b7280' },
        { value: 'issued',          label: 'Issued',          color: '#8b5cf6' },
      ],
    },
    { name: 'submitted_date',      label: 'Submitted Date',      field_type: 'date',     data_type: 'date',    is_required: false, order_index: 7, config: { show_in_list: true } },
    { name: 'underwriter',         label: 'Underwriter',         field_type: 'text',     data_type: 'string',  is_required: false, order_index: 8 },
    { name: 'medical_exam_date',   label: 'Medical Exam Date',   field_type: 'date',     data_type: 'date',    is_required: false, order_index: 9 },
    {
      name: 'medical_exam_status', label: 'Medical Exam Status', field_type: 'select', data_type: 'string', is_required: false, order_index: 10,
      options: [
        { value: 'not_required', label: 'Not Required', color: '#6b7280' },
        { value: 'scheduled',    label: 'Scheduled',    color: '#3b82f6' },
        { value: 'completed',    label: 'Completed',    color: '#10b981' },
        { value: 'failed',       label: 'Failed',       color: '#ef4444' },
      ],
    },
    { name: 'decision_date',       label: 'Decision Date',       field_type: 'date',     data_type: 'date',    is_required: false, order_index: 11 },
    { name: 'decision_notes',      label: 'Decision Notes',      field_type: 'textarea', data_type: 'string',  is_required: false, order_index: 12 },
  ]);

  await prisma.uiValidation.createMany({ data: [
    { field_id: appFields['coverage_amount'].id, validation_type: 'min',       value: '10000', error_message: 'Coverage must be at least $10,000',          order_index: 1 },
    { field_id: appFields['premium'].id,         validation_type: 'min',       value: '0',     error_message: 'Premium cannot be negative',                 order_index: 1 },
    { field_id: appFields['applicant_name'].id,  validation_type: 'minLength', value: '2',     error_message: 'Applicant name must be at least 2 characters', order_index: 1 },
  ]});

  const appCreateForm = await createForm(applicationObject.id,
    { name: 'application_create', label: 'New Application', form_type: 'create', columns: 2 },
    [
      { field_name: 'application_number', row: 0, col: 0, col_span: 1, order_index: 1 },
      { field_name: 'applicant_name',     row: 0, col: 1, col_span: 1, order_index: 2 },
      { field_name: 'product_type',       row: 1, col: 0, col_span: 1, order_index: 3 },
      { field_name: 'coverage_amount',    row: 1, col: 1, col_span: 1, order_index: 4 },
      { field_name: 'premium',            row: 2, col: 0, col_span: 1, order_index: 5 },
      { field_name: 'status',             row: 2, col: 1, col_span: 1, order_index: 6 },
      { field_name: 'submitted_date',     row: 3, col: 0, col_span: 1, order_index: 7 },
      { field_name: 'underwriter',        row: 3, col: 1, col_span: 1, order_index: 8 },
      { field_name: 'medical_exam_date',  row: 4, col: 0, col_span: 1, order_index: 9 },
      { field_name: 'medical_exam_status',row: 4, col: 1, col_span: 1, order_index: 10 },
      { field_name: 'decision_date',      row: 5, col: 0, col_span: 1, order_index: 11 },
      { field_name: 'decision_notes',     row: 5, col: 1, col_span: 1, order_index: 12 },
    ], appFields);
  console.log('✅ Application: 12 fields · 3 validations · form');

  // ══════════════════════════════════════════════════════════════════════════════
  // OBJECT 5 — POLICY  (module: Policies)
  // ══════════════════════════════════════════════════════════════════════════════
  const policyObject = await prisma.uiObject.create({
    data: { module_id: policiesModule.id, name: 'policy', label: 'Policy', plural_label: 'Policies', description: 'Active life insurance policy', icon: 'Shield', order_index: 1 },
  });

  const policyFields = await createFields(policyObject.id, [
    { name: 'policy_number',    label: 'Policy Number',     field_type: 'text',     data_type: 'string',  is_required: true,  order_index: 1, config: { auto_number: { prefix: 'POL-', format: 'YYYY-NNNNN' }, show_in_list: true } },
    { name: 'policyholder',     label: 'Policyholder',      field_type: 'text',     data_type: 'string',  is_required: true,  order_index: 2, config: { show_in_list: true } },
    { name: 'product_type',     label: 'Product Type',      field_type: 'select',   data_type: 'string',  is_required: true,  order_index: 3, options: PRODUCT_TYPE_OPTIONS, config: { show_in_list: true } },
    { name: 'coverage_amount',  label: 'Coverage Amount',   field_type: 'currency', data_type: 'number',  is_required: true,  order_index: 4, config: { currency: 'USD', show_in_list: true } },
    { name: 'premium_monthly',  label: 'Monthly Premium',   field_type: 'currency', data_type: 'number',  is_required: false, order_index: 5, config: { currency: 'USD', show_in_list: true } },
    { name: 'premium_annual',   label: 'Annual Premium',    field_type: 'currency', data_type: 'number',  is_required: false, order_index: 6, config: { currency: 'USD' } },
    {
      name: 'status', label: 'Status', field_type: 'select', data_type: 'string', is_required: true, order_index: 7, default_value: 'active', config: { show_in_list: true },
      options: [
        { value: 'pending',     label: 'Pending',      color: '#8b5cf6' },
        { value: 'active',      label: 'Active',      color: '#10b981' },
        { value: 'lapsed',      label: 'Lapsed',      color: '#f59e0b' },
        { value: 'surrendered', label: 'Surrendered',  color: '#ef4444' },
        { value: 'matured',     label: 'Matured',      color: '#3b82f6' },
        { value: 'cancelled',   label: 'Cancelled',    color: '#6b7280' },
      ],
    },
    { name: 'effective_date',   label: 'Effective Date',    field_type: 'date',     data_type: 'date',    is_required: true,  order_index: 8 },
    { name: 'expiry_date',      label: 'Expiry Date',       field_type: 'date',     data_type: 'date',    is_required: false, order_index: 9 },
    { name: 'beneficiary',      label: 'Beneficiary',       field_type: 'text',     data_type: 'string',  is_required: false, order_index: 10 },
    { name: 'payment_method',   label: 'Payment Method',    field_type: 'select',   data_type: 'string',  is_required: false, order_index: 11, options: PAYMENT_METHOD_OPTIONS },
    { name: 'next_payment_date',label: 'Next Payment Date', field_type: 'date',     data_type: 'date',    is_required: false, order_index: 12 },
    { name: 'cash_value',       label: 'Cash Value',        field_type: 'currency', data_type: 'number',  is_required: false, order_index: 13, config: { currency: 'USD' }, help_text: 'Applicable for whole/universal life policies' },
    { name: 'notes',            label: 'Notes',             field_type: 'textarea', data_type: 'string',  is_required: false, order_index: 14 },
  ]);

  await prisma.uiValidation.createMany({ data: [
    { field_id: policyFields['coverage_amount'].id, validation_type: 'min', value: '10000', error_message: 'Coverage must be at least $10,000',     order_index: 1 },
    { field_id: policyFields['premium_monthly'].id, validation_type: 'min', value: '0',     error_message: 'Monthly premium cannot be negative',    order_index: 1 },
    { field_id: policyFields['premium_annual'].id,  validation_type: 'min', value: '0',     error_message: 'Annual premium cannot be negative',     order_index: 1 },
    { field_id: policyFields['cash_value'].id,      validation_type: 'min', value: '0',     error_message: 'Cash value cannot be negative',         order_index: 1 },
    { field_id: policyFields['policyholder'].id,    validation_type: 'minLength', value: '2', error_message: 'Policyholder name is too short',      order_index: 1 },
  ]});

  const policyCreateForm = await createForm(policyObject.id,
    { name: 'policy_create', label: 'New Policy', form_type: 'create', columns: 2 },
    [
      { field_name: 'policy_number',    row: 0, col: 0, col_span: 1, order_index: 1 },
      { field_name: 'policyholder',     row: 0, col: 1, col_span: 1, order_index: 2 },
      { field_name: 'product_type',     row: 1, col: 0, col_span: 1, order_index: 3 },
      { field_name: 'coverage_amount',  row: 1, col: 1, col_span: 1, order_index: 4 },
      { field_name: 'premium_monthly',  row: 2, col: 0, col_span: 1, order_index: 5 },
      { field_name: 'premium_annual',   row: 2, col: 1, col_span: 1, order_index: 6 },
      { field_name: 'status',           row: 3, col: 0, col_span: 1, order_index: 7 },
      { field_name: 'effective_date',   row: 3, col: 1, col_span: 1, order_index: 8 },
      { field_name: 'expiry_date',      row: 4, col: 0, col_span: 1, order_index: 9 },
      { field_name: 'beneficiary',      row: 4, col: 1, col_span: 1, order_index: 10 },
      { field_name: 'payment_method',   row: 5, col: 0, col_span: 1, order_index: 11 },
      { field_name: 'next_payment_date',row: 5, col: 1, col_span: 1, order_index: 12 },
      { field_name: 'cash_value',       row: 6, col: 0, col_span: 1, order_index: 13 },
      { field_name: 'notes',            row: 7, col: 0, col_span: 2, order_index: 14 },
    ], policyFields);
  console.log('✅ Policy: 14 fields · 5 validations · form');

  // ══════════════════════════════════════════════════════════════════════════════
  // OBJECT 6 — CLAIM  (module: Claims)
  // ══════════════════════════════════════════════════════════════════════════════
  const claimObject = await prisma.uiObject.create({
    data: { module_id: claimsModule.id, name: 'claim', label: 'Claim', plural_label: 'Claims', description: 'Insurance claim filed against a policy', icon: 'AlertTriangle', order_index: 1 },
  });

  const claimFields = await createFields(claimObject.id, [
    { name: 'claim_number',       label: 'Claim Number',       field_type: 'text',     data_type: 'string',  is_required: true,  order_index: 1, config: { auto_number: { prefix: 'CLM-', format: 'YYYY-NNN' }, show_in_list: true } },
    { name: 'policy_number',      label: 'Policy Number',      field_type: 'text',     data_type: 'string',  is_required: true,  order_index: 2, config: { show_in_list: true } },
    { name: 'claimant_name',      label: 'Claimant Name',      field_type: 'text',     data_type: 'string',  is_required: true,  order_index: 3, config: { show_in_list: true } },
    {
      name: 'claim_type', label: 'Claim Type', field_type: 'select', data_type: 'string', is_required: true, order_index: 4, config: { show_in_list: true },
      options: [
        { value: 'death',            label: 'Death Benefit',     color: '#1f2937' },
        { value: 'disability',       label: 'Disability',        color: '#6366f1' },
        { value: 'critical_illness', label: 'Critical Illness',  color: '#f59e0b' },
        { value: 'accidental',       label: 'Accidental',        color: '#ef4444' },
      ],
    },
    { name: 'claim_amount',        label: 'Claim Amount',        field_type: 'currency', data_type: 'number',  is_required: true,  order_index: 5, config: { currency: 'USD', show_in_list: true } },
    {
      name: 'status', label: 'Status', field_type: 'select', data_type: 'string', is_required: true, order_index: 6, default_value: 'filed', config: { show_in_list: true },
      options: [
        { value: 'filed',              label: 'Filed',              color: '#6366f1' },
        { value: 'under_investigation',label: 'Under Investigation',color: '#f59e0b' },
        { value: 'approved',           label: 'Approved',           color: '#10b981' },
        { value: 'denied',             label: 'Denied',             color: '#ef4444' },
        { value: 'paid',               label: 'Paid',               color: '#3b82f6' },
        { value: 'closed',             label: 'Closed',             color: '#6b7280' },
      ],
    },
    { name: 'filed_date',          label: 'Filed Date',          field_type: 'date',     data_type: 'date',    is_required: true,  order_index: 7, config: { show_in_list: true } },
    { name: 'decision_date',       label: 'Decision Date',       field_type: 'date',     data_type: 'date',    is_required: false, order_index: 8 },
    { name: 'settlement_amount',   label: 'Settlement Amount',   field_type: 'currency', data_type: 'number',  is_required: false, order_index: 9, config: { currency: 'USD' } },
    { name: 'adjuster',            label: 'Claims Adjuster',     field_type: 'text',     data_type: 'string',  is_required: false, order_index: 10 },
    { name: 'documents_received',  label: 'Documents Received',  field_type: 'checkbox', data_type: 'boolean', is_required: false, order_index: 11, default_value: 'false' },
    { name: 'notes',               label: 'Notes',               field_type: 'textarea', data_type: 'string',  is_required: false, order_index: 12 },
  ]);

  await prisma.uiValidation.createMany({ data: [
    { field_id: claimFields['claim_amount'].id,      validation_type: 'min',       value: '0', error_message: 'Claim amount cannot be negative',         order_index: 1 },
    { field_id: claimFields['settlement_amount'].id,  validation_type: 'min',       value: '0', error_message: 'Settlement amount cannot be negative',    order_index: 1 },
    { field_id: claimFields['claimant_name'].id,     validation_type: 'minLength', value: '2', error_message: 'Claimant name must be at least 2 chars',  order_index: 1 },
  ]});

  const claimCreateForm = await createForm(claimObject.id,
    { name: 'claim_create', label: 'New Claim', form_type: 'create', columns: 2 },
    [
      { field_name: 'claim_number',       row: 0, col: 0, col_span: 1, order_index: 1 },
      { field_name: 'policy_number',      row: 0, col: 1, col_span: 1, order_index: 2 },
      { field_name: 'claimant_name',      row: 1, col: 0, col_span: 1, order_index: 3 },
      { field_name: 'claim_type',         row: 1, col: 1, col_span: 1, order_index: 4 },
      { field_name: 'claim_amount',       row: 2, col: 0, col_span: 1, order_index: 5 },
      { field_name: 'status',             row: 2, col: 1, col_span: 1, order_index: 6 },
      { field_name: 'filed_date',         row: 3, col: 0, col_span: 1, order_index: 7 },
      { field_name: 'decision_date',      row: 3, col: 1, col_span: 1, order_index: 8 },
      { field_name: 'settlement_amount',  row: 4, col: 0, col_span: 1, order_index: 9 },
      { field_name: 'adjuster',           row: 4, col: 1, col_span: 1, order_index: 10 },
      { field_name: 'documents_received', row: 5, col: 0, col_span: 1, order_index: 11 },
      { field_name: 'notes',              row: 6, col: 0, col_span: 2, order_index: 12 },
    ], claimFields);
  console.log('✅ Claim: 12 fields · 3 validations · form');

  // ══════════════════════════════════════════════════════════════════════════════
  // OBJECT 7 — UNDERWRITING CASE  (module: Underwriting)
  // ══════════════════════════════════════════════════════════════════════════════
  const underwritingObject = await prisma.uiObject.create({
    data: { module_id: underwritingModule.id, name: 'underwriting_case', label: 'Underwriting Case', plural_label: 'Underwriting Cases', description: 'Risk assessment and underwriting decision', icon: 'Activity', order_index: 1 },
  });

  const uwFields = await createFields(underwritingObject.id, [
    { name: 'case_number',          label: 'Case Number',          field_type: 'text',     data_type: 'string',  is_required: true,  order_index: 1, config: { auto_number: { prefix: 'UW-', format: 'YYYY-NNN' }, show_in_list: true } },
    { name: 'applicant_name',       label: 'Applicant Name',       field_type: 'text',     data_type: 'string',  is_required: true,  order_index: 2, config: { show_in_list: true } },
    { name: 'product_type',         label: 'Product Type',         field_type: 'select',   data_type: 'string',  is_required: true,  order_index: 3, options: PRODUCT_TYPE_OPTIONS, config: { show_in_list: true } },
    { name: 'coverage_amount',      label: 'Coverage Amount',      field_type: 'currency', data_type: 'number',  is_required: true,  order_index: 4, config: { currency: 'USD', show_in_list: true } },
    { name: 'risk_class',           label: 'Risk Class',           field_type: 'select',   data_type: 'string',  is_required: false, order_index: 5, options: HEALTH_CLASS_OPTIONS, config: { show_in_list: true } },
    {
      name: 'status', label: 'Status', field_type: 'select', data_type: 'string', is_required: true, order_index: 6, default_value: 'pending', config: { show_in_list: true },
      options: [
        { value: 'pending',     label: 'Pending',     color: '#6b7280' },
        { value: 'in_progress', label: 'In Progress', color: '#3b82f6' },
        { value: 'approved',    label: 'Approved',    color: '#10b981' },
        { value: 'declined',    label: 'Declined',    color: '#ef4444' },
        { value: 'referred',    label: 'Referred',    color: '#f59e0b' },
      ],
    },
    { name: 'assigned_underwriter', label: 'Assigned Underwriter', field_type: 'text',     data_type: 'string',  is_required: false, order_index: 7 },
    { name: 'medical_history',      label: 'Medical History',      field_type: 'textarea', data_type: 'string',  is_required: false, order_index: 8 },
    { name: 'risk_factors',         label: 'Risk Factors',         field_type: 'textarea', data_type: 'string',  is_required: false, order_index: 9 },
    { name: 'decision',             label: 'Decision',             field_type: 'textarea', data_type: 'string',  is_required: false, order_index: 10 },
    { name: 'decision_date',        label: 'Decision Date',        field_type: 'date',     data_type: 'date',    is_required: false, order_index: 11 },
    { name: 'notes',                label: 'Notes',                field_type: 'textarea', data_type: 'string',  is_required: false, order_index: 12 },
  ]);

  await prisma.uiValidation.createMany({ data: [
    { field_id: uwFields['coverage_amount'].id, validation_type: 'min',       value: '10000', error_message: 'Coverage must be at least $10,000',            order_index: 1 },
    { field_id: uwFields['applicant_name'].id,  validation_type: 'minLength', value: '2',     error_message: 'Applicant name must be at least 2 characters', order_index: 1 },
  ]});

  const uwCreateForm = await createForm(underwritingObject.id,
    { name: 'underwriting_create', label: 'New Underwriting Case', form_type: 'create', columns: 2 },
    [
      { field_name: 'case_number',          row: 0, col: 0, col_span: 1, order_index: 1 },
      { field_name: 'applicant_name',       row: 0, col: 1, col_span: 1, order_index: 2 },
      { field_name: 'product_type',         row: 1, col: 0, col_span: 1, order_index: 3 },
      { field_name: 'coverage_amount',      row: 1, col: 1, col_span: 1, order_index: 4 },
      { field_name: 'risk_class',           row: 2, col: 0, col_span: 1, order_index: 5 },
      { field_name: 'status',               row: 2, col: 1, col_span: 1, order_index: 6 },
      { field_name: 'assigned_underwriter', row: 3, col: 0, col_span: 1, order_index: 7 },
      { field_name: 'decision_date',        row: 3, col: 1, col_span: 1, order_index: 8 },
      { field_name: 'medical_history',      row: 4, col: 0, col_span: 2, order_index: 9 },
      { field_name: 'risk_factors',         row: 5, col: 0, col_span: 2, order_index: 10 },
      { field_name: 'decision',             row: 6, col: 0, col_span: 2, order_index: 11 },
      { field_name: 'notes',                row: 7, col: 0, col_span: 2, order_index: 12 },
    ], uwFields);
  console.log('✅ Underwriting Case: 12 fields · 2 validations · form');

  // ══════════════════════════════════════════════════════════════════════════════
  // OBJECT 8 — COMMISSION  (module: Commissions)
  // ══════════════════════════════════════════════════════════════════════════════
  const commissionObject = await prisma.uiObject.create({
    data: { module_id: commissionsModule.id, name: 'commission', label: 'Commission', plural_label: 'Commissions', description: 'Agent commission tracking and payment', icon: 'CreditCard', order_index: 1 },
  });

  const commFields = await createFields(commissionObject.id, [
    { name: 'agent_name',        label: 'Agent Name',        field_type: 'text',     data_type: 'string',  is_required: true,  order_index: 1, config: { show_in_list: true } },
    { name: 'policy_number',     label: 'Policy Number',     field_type: 'text',     data_type: 'string',  is_required: true,  order_index: 2, config: { show_in_list: true } },
    { name: 'product_type',      label: 'Product Type',      field_type: 'select',   data_type: 'string',  is_required: false, order_index: 3, options: PRODUCT_TYPE_OPTIONS, config: { show_in_list: true } },
    { name: 'premium_amount',    label: 'Premium Amount',    field_type: 'currency', data_type: 'number',  is_required: false, order_index: 4, config: { currency: 'USD', show_in_list: true } },
    { name: 'commission_rate',   label: 'Commission Rate %', field_type: 'number',   data_type: 'number',  is_required: false, order_index: 5, config: { show_in_list: true } },
    { name: 'commission_amount', label: 'Commission Amount', field_type: 'currency', data_type: 'number',  is_required: false, order_index: 6, config: { currency: 'USD', show_in_list: true } },
    {
      name: 'status', label: 'Status', field_type: 'select', data_type: 'string', is_required: true, order_index: 7, default_value: 'pending', config: { show_in_list: true },
      options: [
        { value: 'pending',     label: 'Pending',     color: '#f59e0b' },
        { value: 'paid',        label: 'Paid',        color: '#10b981' },
        { value: 'clawed_back', label: 'Clawed Back',  color: '#ef4444' },
      ],
    },
    { name: 'payment_date',      label: 'Payment Date',      field_type: 'date',     data_type: 'date',    is_required: false, order_index: 8 },
    { name: 'period',            label: 'Period',            field_type: 'text',     data_type: 'string',  is_required: false, order_index: 9, placeholder: 'e.g. 2026-Q1' },
    { name: 'notes',             label: 'Notes',             field_type: 'textarea', data_type: 'string',  is_required: false, order_index: 10 },
  ]);

  await prisma.uiValidation.createMany({ data: [
    { field_id: commFields['premium_amount'].id,    validation_type: 'min', value: '0',   error_message: 'Premium cannot be negative',            order_index: 1 },
    { field_id: commFields['commission_amount'].id,  validation_type: 'min', value: '0',   error_message: 'Commission cannot be negative',         order_index: 1 },
    { field_id: commFields['commission_rate'].id,   validation_type: 'min', value: '0',   error_message: 'Commission rate cannot be negative',     order_index: 1 },
    { field_id: commFields['commission_rate'].id,   validation_type: 'max', value: '100', error_message: 'Commission rate cannot exceed 100%',     order_index: 2 },
    { field_id: commFields['agent_name'].id,        validation_type: 'minLength', value: '2', error_message: 'Agent name is too short',            order_index: 1 },
  ]});

  const commCreateForm = await createForm(commissionObject.id,
    { name: 'commission_create', label: 'New Commission', form_type: 'create', columns: 2 },
    [
      { field_name: 'agent_name',        row: 0, col: 0, col_span: 1, order_index: 1 },
      { field_name: 'policy_number',     row: 0, col: 1, col_span: 1, order_index: 2 },
      { field_name: 'product_type',      row: 1, col: 0, col_span: 1, order_index: 3 },
      { field_name: 'premium_amount',    row: 1, col: 1, col_span: 1, order_index: 4 },
      { field_name: 'commission_rate',   row: 2, col: 0, col_span: 1, order_index: 5 },
      { field_name: 'commission_amount', row: 2, col: 1, col_span: 1, order_index: 6 },
      { field_name: 'status',            row: 3, col: 0, col_span: 1, order_index: 7 },
      { field_name: 'payment_date',      row: 3, col: 1, col_span: 1, order_index: 8 },
      { field_name: 'period',            row: 4, col: 0, col_span: 1, order_index: 9 },
      { field_name: 'notes',             row: 5, col: 0, col_span: 2, order_index: 10 },
    ], commFields);
  console.log('✅ Commission: 10 fields · 5 validations · form');

  // ══════════════════════════════════════════════════════════════════════════════
  // PRODUCT OBJECT — (module: Products) — formerly hardcoded ProductsPage
  // ══════════════════════════════════════════════════════════════════════════════
  const productObject = await prisma.uiObject.create({
    data: { module_id: productsModule.id, name: 'product', label: 'Product', plural_label: 'Products', description: 'Product catalog item', icon: 'Package', order_index: 1 },
  });

  const productFields = await createFields(productObject.id, [
    { name: 'name',        label: 'Product Name', field_type: 'text',     data_type: 'string',  is_required: true,  order_index: 1, placeholder: 'Premium Widget' },
    { name: 'sku',         label: 'SKU',          field_type: 'text',     data_type: 'string',  is_required: false, order_index: 2, placeholder: 'SKU-001', config: { show_in_list: true } },
    { name: 'unit_price',  label: 'Price',        field_type: 'currency', data_type: 'number',  is_required: false, order_index: 3, config: { currency: 'USD', show_in_list: true } },
    { name: 'cost_price',  label: 'Cost',         field_type: 'currency', data_type: 'number',  is_required: false, order_index: 4, config: { currency: 'USD' } },
    { name: 'category',    label: 'Category',     field_type: 'select',   data_type: 'string',  is_required: false, order_index: 5, config: { show_in_list: true },
      options: [
        { value: 'electronics', label: 'Electronics' },
        { value: 'software',    label: 'Software' },
        { value: 'services',    label: 'Services' },
        { value: 'hardware',    label: 'Hardware' },
        { value: 'other',       label: 'Other' },
      ],
    },
    { name: 'description', label: 'Description',  field_type: 'textarea', data_type: 'string',  is_required: false, order_index: 6 },
    {
      name: 'is_active', label: 'Status', field_type: 'select', data_type: 'string', is_required: true, order_index: 7, default_value: 'active', config: { show_in_list: true },
      options: [
        { value: 'active',   label: 'Active',   color: '#22c55e' },
        { value: 'inactive', label: 'Inactive', color: '#6b7280' },
      ],
    },
    { name: 'margin',      label: 'Margin (%)',   field_type: 'auto_calculate', data_type: 'number', is_required: false, order_index: 8,
      config: { always_disabled: true, show_in_list: true, computed: { fn: 'calc_margin', trigger_fields: ['unit_price', 'cost_price'], trigger_event: 'on_change' } },
    },
  ]);

  await prisma.uiValidation.createMany({ data: [
    { field_id: productFields.name.id, validation_type: 'required', value: 'true', error_message: 'Product name is required' },
    { field_id: productFields.name.id, validation_type: 'maxLength', value: '200', error_message: 'Name must be 200 characters or less' },
  ]});

  await createForm(productObject.id,
    { name: 'product_form', label: 'Product Form', form_type: 'create', columns: 2 },
    [
      { field_name: 'name',        row: 0, col: 0, col_span: 1, order_index: 1 },
      { field_name: 'sku',         row: 0, col: 1, col_span: 1, order_index: 2 },
      { field_name: 'unit_price',  row: 1, col: 0, col_span: 1, order_index: 3 },
      { field_name: 'cost_price',  row: 1, col: 1, col_span: 1, order_index: 4 },
      { field_name: 'category',    row: 2, col: 0, col_span: 1, order_index: 5 },
      { field_name: 'is_active',   row: 2, col: 1, col_span: 1, order_index: 6 },
      { field_name: 'description', row: 3, col: 0, col_span: 2, order_index: 7 },
    ], productFields);

  console.log('✅ Product: 8 fields · 2 validations · form (metadata-driven)');

  // Lead scoring is surfaced on the Leads module itself (read-only `score` +
  // `grade` fields injected from lead_scores at read time) — there is no
  // separate "Lead Scoring" results module. Scoring rules are configured in the
  // Builder (Lead Scoring Rules); the engine writes to the lead_scores table.

  // ══════════════════════════════════════════════════════════════════════════════
  // COMPUTED FIELD FUNCTION — calc_margin
  // ══════════════════════════════════════════════════════════════════════════════
  // The calc_margin function is used by the Product margin field.
  // It's registered in the fieldFunctions utility on the frontend.

  // ══════════════════════════════════════════════════════════════════════════════
  // 5-STEP LIFE INSURANCE APPLICATION WIZARD
  // ══════════════════════════════════════════════════════════════════════════════

  // Step 1 fields: Personal Information
  const wizStep1Fields = await createFields(applicationObject.id, [
    { name: 'wiz_first_name',  label: 'First Name',       field_type: 'text',   data_type: 'string', is_required: true,  order_index: 101 },
    { name: 'wiz_last_name',   label: 'Last Name',        field_type: 'text',   data_type: 'string', is_required: true,  order_index: 102 },
    { name: 'wiz_email',       label: 'Email',            field_type: 'email',  data_type: 'string', is_required: true,  order_index: 103, placeholder: 'applicant@example.com' },
    { name: 'wiz_phone',       label: 'Phone',            field_type: 'phone',  data_type: 'string', is_required: true,  order_index: 104 },
    { name: 'wiz_dob',         label: 'Date of Birth',    field_type: 'date',   data_type: 'date',   is_required: true,  order_index: 105 },
    { name: 'wiz_gender',      label: 'Gender',           field_type: 'select', data_type: 'string', is_required: true,  order_index: 106, options: GENDER_OPTIONS },
    { name: 'wiz_ssn',         label: 'Social Security Number', field_type: 'text', data_type: 'string', is_required: true, order_index: 107, placeholder: 'XXX-XX-XXXX' },
  ]);
  const wizStep1Form = await createForm(applicationObject.id,
    { name: 'wiz_personal_info', label: 'Personal Information', form_type: 'create', columns: 2 },
    [
      { field_name: 'wiz_first_name', row: 0, col: 0, col_span: 1, order_index: 1 },
      { field_name: 'wiz_last_name',  row: 0, col: 1, col_span: 1, order_index: 2 },
      { field_name: 'wiz_email',      row: 1, col: 0, col_span: 1, order_index: 3 },
      { field_name: 'wiz_phone',      row: 1, col: 1, col_span: 1, order_index: 4 },
      { field_name: 'wiz_dob',        row: 2, col: 0, col_span: 1, order_index: 5 },
      { field_name: 'wiz_gender',     row: 2, col: 1, col_span: 1, order_index: 6 },
      { field_name: 'wiz_ssn',        row: 3, col: 0, col_span: 2, order_index: 7 },
    ], wizStep1Fields);

  // Step 2 fields: Health & Lifestyle
  const wizStep2Fields = await createFields(applicationObject.id, [
    { name: 'wiz_smoker_status',     label: 'Smoker Status',       field_type: 'select',   data_type: 'string', is_required: true,  order_index: 201, options: SMOKER_STATUS_OPTIONS },
    { name: 'wiz_health_class',      label: 'Health Classification', field_type: 'select', data_type: 'string', is_required: false, order_index: 202, options: HEALTH_CLASS_OPTIONS },
    { name: 'wiz_height',            label: 'Height (inches)',     field_type: 'number',   data_type: 'number', is_required: false, order_index: 203 },
    { name: 'wiz_weight',            label: 'Weight (lbs)',        field_type: 'number',   data_type: 'number', is_required: false, order_index: 204 },
    { name: 'wiz_medical_conditions',label: 'Medical Conditions',  field_type: 'textarea', data_type: 'string', is_required: false, order_index: 205, help_text: 'List any existing medical conditions' },
    { name: 'wiz_medications',       label: 'Current Medications', field_type: 'textarea', data_type: 'string', is_required: false, order_index: 206 },
    { name: 'wiz_family_history',    label: 'Family Medical History', field_type: 'textarea', data_type: 'string', is_required: false, order_index: 207, help_text: 'Relevant family medical history (parents, siblings)' },
  ]);
  const wizStep2Form = await createForm(applicationObject.id,
    { name: 'wiz_health_lifestyle', label: 'Health & Lifestyle', form_type: 'create', columns: 2 },
    [
      { field_name: 'wiz_smoker_status',      row: 0, col: 0, col_span: 1, order_index: 1 },
      { field_name: 'wiz_health_class',       row: 0, col: 1, col_span: 1, order_index: 2 },
      { field_name: 'wiz_height',             row: 1, col: 0, col_span: 1, order_index: 3 },
      { field_name: 'wiz_weight',             row: 1, col: 1, col_span: 1, order_index: 4 },
      { field_name: 'wiz_medical_conditions', row: 2, col: 0, col_span: 2, order_index: 5 },
      { field_name: 'wiz_medications',        row: 3, col: 0, col_span: 2, order_index: 6 },
      { field_name: 'wiz_family_history',     row: 4, col: 0, col_span: 2, order_index: 7 },
    ], wizStep2Fields);

  // Step 3 fields: Coverage Selection
  const wizStep3Fields = await createFields(applicationObject.id, [
    { name: 'wiz_product_type',       label: 'Product Type',       field_type: 'select',   data_type: 'string', is_required: true,  order_index: 301, options: PRODUCT_TYPE_OPTIONS },
    { name: 'wiz_coverage_amount',    label: 'Coverage Amount',    field_type: 'currency', data_type: 'number', is_required: true,  order_index: 302, config: { currency: 'USD' } },
    { name: 'wiz_term_years',         label: 'Term (Years)',       field_type: 'number',   data_type: 'number', is_required: false, order_index: 303 },
    { name: 'wiz_riders',             label: 'Riders',            field_type: 'textarea', data_type: 'string', is_required: false, order_index: 304, help_text: 'Waiver of premium, accidental death benefit, child rider, etc.' },
    { name: 'wiz_payment_frequency',  label: 'Payment Frequency', field_type: 'select',   data_type: 'string', is_required: true,  order_index: 305, options: PAYMENT_FREQUENCY_OPTIONS },
  ]);
  const wizStep3Form = await createForm(applicationObject.id,
    { name: 'wiz_coverage_selection', label: 'Coverage Selection', form_type: 'create', columns: 2 },
    [
      { field_name: 'wiz_product_type',      row: 0, col: 0, col_span: 1, order_index: 1 },
      { field_name: 'wiz_coverage_amount',   row: 0, col: 1, col_span: 1, order_index: 2 },
      { field_name: 'wiz_term_years',        row: 1, col: 0, col_span: 1, order_index: 3 },
      { field_name: 'wiz_payment_frequency', row: 1, col: 1, col_span: 1, order_index: 4 },
      { field_name: 'wiz_riders',            row: 2, col: 0, col_span: 2, order_index: 5 },
    ], wizStep3Fields);

  // Step 4 fields: Beneficiary & Financial
  const wizStep4Fields = await createFields(applicationObject.id, [
    { name: 'wiz_beneficiary_name',         label: 'Beneficiary Name',         field_type: 'text',     data_type: 'string', is_required: true,  order_index: 401 },
    { name: 'wiz_beneficiary_relationship', label: 'Beneficiary Relationship', field_type: 'select',   data_type: 'string', is_required: true,  order_index: 402,
      options: [
        { value: 'spouse', label: 'Spouse' }, { value: 'child', label: 'Child' },
        { value: 'parent', label: 'Parent' }, { value: 'sibling', label: 'Sibling' },
        { value: 'trust',  label: 'Trust'  }, { value: 'estate', label: 'Estate' },
        { value: 'other',  label: 'Other'  },
      ],
    },
    { name: 'wiz_annual_income',        label: 'Annual Income',        field_type: 'currency', data_type: 'number', is_required: false, order_index: 403, config: { currency: 'USD' } },
    { name: 'wiz_existing_coverage',    label: 'Existing Coverage',    field_type: 'currency', data_type: 'number', is_required: false, order_index: 404, config: { currency: 'USD' }, help_text: 'Total existing life insurance coverage' },
    { name: 'wiz_replacement_policy',   label: 'Replacing Existing Policy?', field_type: 'checkbox', data_type: 'boolean', is_required: false, order_index: 405, default_value: 'false' },
  ]);
  const wizStep4Form = await createForm(applicationObject.id,
    { name: 'wiz_beneficiary_financial', label: 'Beneficiary & Financial', form_type: 'create', columns: 2 },
    [
      { field_name: 'wiz_beneficiary_name',         row: 0, col: 0, col_span: 1, order_index: 1 },
      { field_name: 'wiz_beneficiary_relationship', row: 0, col: 1, col_span: 1, order_index: 2 },
      { field_name: 'wiz_annual_income',            row: 1, col: 0, col_span: 1, order_index: 3 },
      { field_name: 'wiz_existing_coverage',        row: 1, col: 1, col_span: 1, order_index: 4 },
      { field_name: 'wiz_replacement_policy',       row: 2, col: 0, col_span: 2, order_index: 5 },
    ], wizStep4Fields);

  // Step 5 fields: Review & Submit
  const wizStep5Fields = await createFields(applicationObject.id, [
    { name: 'wiz_ack_truthful',   label: 'I confirm all information is truthful and accurate', field_type: 'checkbox', data_type: 'boolean', is_required: true, order_index: 501, default_value: 'false' },
    { name: 'wiz_ack_terms',      label: 'I agree to the terms and conditions',               field_type: 'checkbox', data_type: 'boolean', is_required: true, order_index: 502, default_value: 'false' },
    { name: 'wiz_ack_hipaa',      label: 'I authorize release of medical information (HIPAA)', field_type: 'checkbox', data_type: 'boolean', is_required: true, order_index: 503, default_value: 'false' },
    { name: 'wiz_signature_date', label: 'Signature Date',  field_type: 'date',     data_type: 'date',    is_required: true, order_index: 504 },
    { name: 'wiz_agent_notes',    label: 'Agent Notes',     field_type: 'textarea', data_type: 'string',  is_required: false, order_index: 505 },
  ]);
  const wizStep5Form = await createForm(applicationObject.id,
    { name: 'wiz_review_submit', label: 'Review & Submit', form_type: 'create', columns: 2 },
    [
      { field_name: 'wiz_ack_truthful',   row: 0, col: 0, col_span: 2, order_index: 1 },
      { field_name: 'wiz_ack_terms',      row: 1, col: 0, col_span: 2, order_index: 2 },
      { field_name: 'wiz_ack_hipaa',      row: 2, col: 0, col_span: 2, order_index: 3 },
      { field_name: 'wiz_signature_date', row: 3, col: 0, col_span: 1, order_index: 4 },
      { field_name: 'wiz_agent_notes',    row: 4, col: 0, col_span: 2, order_index: 5 },
    ], wizStep5Fields);

  const appWizard = await prisma.uiWizard.create({
    data: {
      object_id:       applicationObject.id,
      name:            'life_insurance_application',
      label:           'Life Insurance Application',
      description:     'Complete life insurance application process: Personal Info → Health → Coverage → Beneficiary → Review',
      submit_label:    'Submit Application',
      success_message: 'Application submitted successfully! It will be reviewed by an underwriter.',
    },
  });

  await prisma.uiWizardStep.createMany({ data: [
    { wizard_id: appWizard.id, form_id: wizStep1Form.id, name: 'personal_info',        label: 'Personal Information',  description: 'Applicant personal details and identification',              order_index: 1 },
    { wizard_id: appWizard.id, form_id: wizStep2Form.id, name: 'health_lifestyle',     label: 'Health & Lifestyle',    description: 'Health history, medications, and lifestyle factors',          order_index: 2 },
    { wizard_id: appWizard.id, form_id: wizStep3Form.id, name: 'coverage_selection',   label: 'Coverage Selection',    description: 'Choose product type, coverage amount, and riders',           order_index: 3 },
    { wizard_id: appWizard.id, form_id: wizStep4Form.id, name: 'beneficiary_financial',label: 'Beneficiary & Financial', description: 'Beneficiary designation and financial information',         order_index: 4 },
    { wizard_id: appWizard.id, form_id: wizStep5Form.id, name: 'review_submit',        label: 'Review & Submit',       description: 'Review all information, sign acknowledgments, and submit',   order_index: 5 },
  ]});
  console.log('✅ Wizard: Life Insurance Application (5 steps: Personal → Health → Coverage → Beneficiary → Review)\n');

  // ══════════════════════════════════════════════════════════════════════════════
  // DASHBOARDS — the demo boards, from the catalogue in prisma/crm-dashboards.js
  // ══════════════════════════════════════════════════════════════════════════════
  // Installed through the same script the standalone command uses
  // (scripts/seed-dashboards.js), so `npm run db:seed` and
  // `node scripts/seed-dashboards.js` can never produce different dashboards.
  const { applyDashboards } = require('../scripts/seed-dashboards');
  const dashSummary = await applyDashboards(prisma, {
    createdBy: admin.employee_id,
    log: (msg) => console.log(msg),
  });
  console.log(`✅ Dashboards: ${dashSummary.created} boards · ${dashSummary.widgets} widgets · ${dashSummary.charts} library charts`);

  // ══════════════════════════════════════════════════════════════════════════════
  // PIPELINES
  // ══════════════════════════════════════════════════════════════════════════════

  // — Quote Pipeline —
  const quotePipeline = await prisma.uiPipeline.create({
    data: { object_id: quoteObject.id, name: 'quote_pipeline', label: 'Quote Pipeline', description: 'Track insurance quote progression' },
  });
  const [qsDraft, qsPresented, qsAccepted, qsDeclined, qsExpired] = await Promise.all([
    prisma.uiPipelineStage.create({ data: { pipeline_id: quotePipeline.id, name: 'draft',     label: 'Draft',     color: '#6b7280', order_index: 1 } }),
    prisma.uiPipelineStage.create({ data: { pipeline_id: quotePipeline.id, name: 'presented', label: 'Presented', color: '#3b82f6', order_index: 2 } }),
    prisma.uiPipelineStage.create({ data: { pipeline_id: quotePipeline.id, name: 'accepted',  label: 'Accepted',  color: '#10b981', order_index: 3 } }),
    prisma.uiPipelineStage.create({ data: { pipeline_id: quotePipeline.id, name: 'declined',  label: 'Declined',  color: '#ef4444', order_index: 4 } }),
    prisma.uiPipelineStage.create({ data: { pipeline_id: quotePipeline.id, name: 'expired',   label: 'Expired',   color: '#f59e0b', order_index: 5 } }),
  ]);
  console.log('✅ Quote Pipeline: 5 stages');

  // — Application Pipeline —
  const appPipeline = await prisma.uiPipeline.create({
    data: { object_id: applicationObject.id, name: 'application_pipeline', label: 'Application Pipeline', description: 'Track insurance application processing' },
  });
  const [asSubmitted, asUnderReview, asPendingMedical, asApproved, asDeclined, asIssued] = await Promise.all([
    prisma.uiPipelineStage.create({ data: { pipeline_id: appPipeline.id, name: 'submitted',       label: 'Submitted',       color: '#6366f1', order_index: 1 } }),
    prisma.uiPipelineStage.create({ data: { pipeline_id: appPipeline.id, name: 'under_review',    label: 'Under Review',    color: '#3b82f6', order_index: 2 } }),
    prisma.uiPipelineStage.create({ data: { pipeline_id: appPipeline.id, name: 'pending_medical', label: 'Pending Medical', color: '#f59e0b', order_index: 3 } }),
    prisma.uiPipelineStage.create({ data: { pipeline_id: appPipeline.id, name: 'approved',        label: 'Approved',        color: '#10b981', order_index: 4 } }),
    prisma.uiPipelineStage.create({ data: { pipeline_id: appPipeline.id, name: 'declined',        label: 'Declined',        color: '#ef4444', order_index: 5 } }),
    prisma.uiPipelineStage.create({ data: { pipeline_id: appPipeline.id, name: 'issued',          label: 'Issued',          color: '#8b5cf6', order_index: 6 } }),
  ]);
  console.log('✅ Application Pipeline: 6 stages (submitted → under_review → pending_medical → approved → declined → issued)');

  // — Claims Pipeline —
  const claimPipeline = await prisma.uiPipeline.create({
    data: { object_id: claimObject.id, name: 'claims_pipeline', label: 'Claims Pipeline', description: 'Track insurance claim processing' },
  });
  const [csFiled, csUnderInvestigation, csApproved, csDenied, csPaid, csClosed] = await Promise.all([
    prisma.uiPipelineStage.create({ data: { pipeline_id: claimPipeline.id, name: 'filed',              label: 'Filed',              color: '#6366f1', order_index: 1 } }),
    prisma.uiPipelineStage.create({ data: { pipeline_id: claimPipeline.id, name: 'under_investigation',label: 'Under Investigation',color: '#f59e0b', order_index: 2 } }),
    prisma.uiPipelineStage.create({ data: { pipeline_id: claimPipeline.id, name: 'approved',           label: 'Approved',           color: '#10b981', order_index: 3 } }),
    prisma.uiPipelineStage.create({ data: { pipeline_id: claimPipeline.id, name: 'denied',             label: 'Denied',             color: '#ef4444', order_index: 4 } }),
    prisma.uiPipelineStage.create({ data: { pipeline_id: claimPipeline.id, name: 'paid',               label: 'Paid',               color: '#3b82f6', order_index: 5 } }),
    prisma.uiPipelineStage.create({ data: { pipeline_id: claimPipeline.id, name: 'closed',             label: 'Closed',             color: '#6b7280', order_index: 6 } }),
  ]);
  console.log('✅ Claims Pipeline: 6 stages (filed → under_investigation → approved → denied → paid → closed)');

  // ══════════════════════════════════════════════════════════════════════════════
  // OBJECT — DECLARATION  (module: Declarations)
  // ══════════════════════════════════════════════════════════════════════════════
  const declarationObject = await prisma.uiObject.create({
    data: { module_id: declarationsModule.id, name: 'declaration', label: 'Declaration', plural_label: 'Declarations', description: 'Client declaration acceptance for regulatory compliance', icon: 'FileText', order_index: 1 },
  });

  const declFields = await createFields(declarationObject.id, [
    { name: 'declaration_number',  label: 'Declaration #',     field_type: 'text',     data_type: 'string',  is_required: true,  order_index: 1,  config: { auto_number: { prefix: 'DCL-', format: 'YYYY-NNN' }, show_in_list: true } },
    {
      name: 'declaration_type', label: 'Declaration Type', field_type: 'select', data_type: 'string', is_required: true, order_index: 2, config: { show_in_list: true },
      options: [
        { value: 'hipaa_authorization',     label: 'HIPAA Authorization' },
        { value: 'aml_acknowledgment',      label: 'AML Acknowledgment' },
        { value: 'replacement_disclosure',  label: 'Replacement Policy Disclosure' },
        { value: 'suitability_statement',   label: 'Suitability Statement' },
        { value: 'privacy_notice',          label: 'Privacy Notice (GLBA)' },
        { value: 'producer_disclosure',     label: 'Producer/Agent Disclosure' },
        { value: 'e_delivery_consent',      label: 'Electronic Delivery Consent' },
        { value: 'fraud_warning',           label: 'Fraud Warning Statement' },
        { value: 'good_health_statement',   label: 'Statement of Good Health' },
        { value: 'beneficiary_designation', label: 'Beneficiary Designation' },
        { value: 'premium_authorization',   label: 'Premium Payment Authorization' },
        { value: 'mib_authorization',       label: 'MIB Authorization' },
      ],
    },
    { name: 'applicant_name',     label: 'Applicant',         field_type: 'text',     data_type: 'string',  is_required: true,  order_index: 3,  config: { show_in_list: true } },
    { name: 'app_number',         label: 'Application #',     field_type: 'text',     data_type: 'string',  is_required: false, order_index: 4,  config: { show_in_list: true } },
    {
      name: 'status', label: 'Status', field_type: 'select', data_type: 'string', is_required: true, order_index: 5, default_value: 'pending', config: { show_in_list: true },
      options: [
        { value: 'pending',  label: 'Pending',  color: '#f59e0b' },
        { value: 'sent',     label: 'Sent',     color: '#3b82f6' },
        { value: 'viewed',   label: 'Viewed',   color: '#8b5cf6' },
        { value: 'accepted', label: 'Accepted', color: '#10b981' },
        { value: 'declined', label: 'Declined', color: '#ef4444' },
        { value: 'expired',  label: 'Expired',  color: '#6b7280' },
      ],
    },
    {
      name: 'delivery_method', label: 'Delivery Method', field_type: 'select', data_type: 'string', is_required: false, order_index: 6,
      options: [
        { value: 'email',     label: 'Email' },
        { value: 'sms',       label: 'SMS' },
        { value: 'portal',    label: 'Client Portal' },
        { value: 'in_person', label: 'In-Person' },
      ],
    },
    { name: 'sent_at',            label: 'Sent Date',         field_type: 'datetime', data_type: 'date',    is_required: false, order_index: 7,  config: { show_in_list: true } },
    { name: 'viewed_at',          label: 'Viewed Date',       field_type: 'datetime', data_type: 'date',    is_required: false, order_index: 8 },
    { name: 'accepted_at',        label: 'Accepted Date',     field_type: 'datetime', data_type: 'date',    is_required: false, order_index: 9,  config: { show_in_list: true } },
    { name: 'signed_by',          label: 'Signed By',         field_type: 'text',     data_type: 'string',  is_required: false, order_index: 10 },
    { name: 'ip_address',         label: 'IP Address',        field_type: 'text',     data_type: 'string',  is_required: false, order_index: 11 },
    { name: 'signature_hash',     label: 'Signature Hash',    field_type: 'text',     data_type: 'string',  is_required: false, order_index: 12 },
    { name: 'content',            label: 'Declaration Text',  field_type: 'textarea', data_type: 'string',  is_required: false, order_index: 13 },
    { name: 'notes',              label: 'Notes',             field_type: 'textarea', data_type: 'string',  is_required: false, order_index: 14 },
  ]);

  await createForm(declarationObject.id,
    { name: 'declaration_create', label: 'Send Declaration', form_type: 'create', columns: 2 },
    [
      { field_name: 'declaration_number',  row: 0, col: 0, col_span: 1, order_index: 1 },
      { field_name: 'declaration_type',    row: 0, col: 1, col_span: 1, order_index: 2 },
      { field_name: 'applicant_name',      row: 1, col: 0, col_span: 1, order_index: 3 },
      { field_name: 'app_number',          row: 1, col: 1, col_span: 1, order_index: 4 },
      { field_name: 'delivery_method',     row: 2, col: 0, col_span: 1, order_index: 5 },
      { field_name: 'status',              row: 2, col: 1, col_span: 1, order_index: 6 },
      { field_name: 'content',             row: 3, col: 0, col_span: 2, order_index: 7 },
      { field_name: 'notes',               row: 4, col: 0, col_span: 2, order_index: 8 },
    ], declFields);

  // — Declaration Pipeline —
  const declPipeline = await prisma.uiPipeline.create({
    data: { object_id: declarationObject.id, name: 'declaration_pipeline', label: 'Declaration Pipeline', description: 'Track declaration acceptance workflow' },
  });
  await Promise.all([
    prisma.uiPipelineStage.create({ data: { pipeline_id: declPipeline.id, name: 'pending',  label: 'Pending',  color: '#f59e0b', order_index: 1 } }),
    prisma.uiPipelineStage.create({ data: { pipeline_id: declPipeline.id, name: 'sent',     label: 'Sent',     color: '#3b82f6', order_index: 2 } }),
    prisma.uiPipelineStage.create({ data: { pipeline_id: declPipeline.id, name: 'viewed',   label: 'Viewed',   color: '#8b5cf6', order_index: 3 } }),
    prisma.uiPipelineStage.create({ data: { pipeline_id: declPipeline.id, name: 'accepted', label: 'Accepted', color: '#10b981', order_index: 4 } }),
    prisma.uiPipelineStage.create({ data: { pipeline_id: declPipeline.id, name: 'declined', label: 'Declined', color: '#ef4444', order_index: 5 } }),
    prisma.uiPipelineStage.create({ data: { pipeline_id: declPipeline.id, name: 'expired',  label: 'Expired',  color: '#6b7280', order_index: 6 } }),
  ]);
  console.log('✅ Declaration Object: 14 fields, create form, pipeline (pending → sent → viewed → accepted/declined/expired)');

  // ══════════════════════════════════════════════════════════════════════════════
  // OBJECT — APPLICATION DOCUMENT  (module: Document Collection)
  // ══════════════════════════════════════════════════════════════════════════════
  const appDocObject = await prisma.uiObject.create({
    data: { module_id: docCollectionModule.id, name: 'application_document', label: 'Application Document', plural_label: 'Application Documents', description: 'Documents required for application processing and policy issuance', icon: 'FileText', order_index: 1 },
  });

  const docFields = await createFields(appDocObject.id, [
    { name: 'document_number',   label: 'Document #',      field_type: 'text',     data_type: 'string',  is_required: true,  order_index: 1,  config: { auto_number: { prefix: 'DOC-', format: 'YYYY-NNN' }, show_in_list: true } },
    { name: 'filename',          label: 'Filename',         field_type: 'text',     data_type: 'string',  is_required: true,  order_index: 2,  config: { show_in_list: true } },
    {
      name: 'category', label: 'Category', field_type: 'select', data_type: 'string', is_required: true, order_index: 3, config: { show_in_list: true },
      options: [
        { value: 'government_id',        label: 'Government-Issued Photo ID' },
        { value: 'proof_of_income',      label: 'Proof of Income' },
        { value: 'medical_records',      label: 'Medical Records / APS' },
        { value: 'application_form',     label: 'Signed Application (ACORD)' },
        { value: 'beneficiary_form',     label: 'Beneficiary Designation Form' },
        { value: 'payment_authorization',label: 'Payment Authorization / EFT' },
        { value: 'existing_policy',      label: 'Existing Policy Documentation' },
        { value: 'trust_documents',      label: 'Trust Documents' },
        { value: 'power_of_attorney',    label: 'Power of Attorney' },
        { value: 'lab_results',          label: 'Lab / Paramedical Results' },
        { value: 'financial_statement',  label: 'Financial Justification' },
        { value: 'driving_record',       label: 'Motor Vehicle Report (MVR)' },
        { value: 'inspection_report',    label: 'Inspection Report' },
        { value: 'other',                label: 'Other Supporting Document' },
      ],
    },
    { name: 'applicant_name',    label: 'Applicant',        field_type: 'text',     data_type: 'string',  is_required: true,  order_index: 4,  config: { show_in_list: true } },
    { name: 'app_number',        label: 'Application #',    field_type: 'text',     data_type: 'string',  is_required: false, order_index: 5,  config: { show_in_list: true } },
    {
      name: 'status', label: 'Status', field_type: 'select', data_type: 'string', is_required: true, order_index: 6, default_value: 'pending', config: { show_in_list: true },
      options: [
        { value: 'required',     label: 'Required',     color: '#ef4444' },
        { value: 'pending',      label: 'Pending',      color: '#f59e0b' },
        { value: 'uploaded',     label: 'Uploaded',      color: '#3b82f6' },
        { value: 'under_review', label: 'Under Review',  color: '#8b5cf6' },
        { value: 'approved',     label: 'Approved',      color: '#10b981' },
        { value: 'rejected',     label: 'Rejected',      color: '#ef4444' },
        { value: 'waived',       label: 'Waived',        color: '#6b7280' },
      ],
    },
    { name: 'mime_type',         label: 'File Type',        field_type: 'text',     data_type: 'string',  is_required: false, order_index: 7 },
    { name: 'file_size',         label: 'File Size',        field_type: 'number',   data_type: 'number',  is_required: false, order_index: 8 },
    { name: 'uploaded_at',       label: 'Upload Date',      field_type: 'datetime', data_type: 'date',    is_required: false, order_index: 9,  config: { show_in_list: true } },
    { name: 'uploaded_by',       label: 'Uploaded By',      field_type: 'text',     data_type: 'string',  is_required: false, order_index: 10 },
    { name: 'reviewed_by',       label: 'Reviewed By',      field_type: 'text',     data_type: 'string',  is_required: false, order_index: 11 },
    { name: 'reviewed_at',       label: 'Review Date',      field_type: 'datetime', data_type: 'date',    is_required: false, order_index: 12 },
    { name: 'rejection_reason',  label: 'Rejection Reason', field_type: 'textarea', data_type: 'string',  is_required: false, order_index: 13 },
    { name: 'notes',             label: 'Notes',            field_type: 'textarea', data_type: 'string',  is_required: false, order_index: 14 },
  ]);

  await createForm(appDocObject.id,
    { name: 'app_document_create', label: 'Upload Document', form_type: 'create', columns: 2 },
    [
      { field_name: 'document_number',  row: 0, col: 0, col_span: 1, order_index: 1 },
      { field_name: 'filename',         row: 0, col: 1, col_span: 1, order_index: 2 },
      { field_name: 'category',         row: 1, col: 0, col_span: 1, order_index: 3 },
      { field_name: 'applicant_name',   row: 1, col: 1, col_span: 1, order_index: 4 },
      { field_name: 'app_number',       row: 2, col: 0, col_span: 1, order_index: 5 },
      { field_name: 'status',           row: 2, col: 1, col_span: 1, order_index: 6 },
      { field_name: 'notes',            row: 3, col: 0, col_span: 2, order_index: 7 },
    ], docFields);

  // — Document Collection Pipeline —
  const docPipeline = await prisma.uiPipeline.create({
    data: { object_id: appDocObject.id, name: 'document_pipeline', label: 'Document Pipeline', description: 'Track document collection and verification' },
  });
  await Promise.all([
    prisma.uiPipelineStage.create({ data: { pipeline_id: docPipeline.id, name: 'required',     label: 'Required',     color: '#ef4444', order_index: 1 } }),
    prisma.uiPipelineStage.create({ data: { pipeline_id: docPipeline.id, name: 'pending',      label: 'Pending',      color: '#f59e0b', order_index: 2 } }),
    prisma.uiPipelineStage.create({ data: { pipeline_id: docPipeline.id, name: 'uploaded',     label: 'Uploaded',     color: '#3b82f6', order_index: 3 } }),
    prisma.uiPipelineStage.create({ data: { pipeline_id: docPipeline.id, name: 'under_review', label: 'Under Review', color: '#8b5cf6', order_index: 4 } }),
    prisma.uiPipelineStage.create({ data: { pipeline_id: docPipeline.id, name: 'approved',     label: 'Approved',     color: '#10b981', order_index: 5 } }),
    prisma.uiPipelineStage.create({ data: { pipeline_id: docPipeline.id, name: 'rejected',     label: 'Rejected',     color: '#ef4444', order_index: 6 } }),
    prisma.uiPipelineStage.create({ data: { pipeline_id: docPipeline.id, name: 'waived',       label: 'Waived',       color: '#6b7280', order_index: 7 } }),
  ]);
  console.log('✅ Application Document Object: 14 fields, create form, pipeline (required → pending → uploaded → under_review → approved/rejected/waived)');

  // — Policy Pipeline —
  const policyPipeline = await prisma.uiPipeline.create({
    data: { object_id: policyObject.id, name: 'policy_pipeline', label: 'Policy Pipeline', description: 'Track policy lifecycle' },
  });
  const [ppPending, ppActive, ppLapsed, ppSurrendered, ppMatured, ppCancelled] = await Promise.all([
    prisma.uiPipelineStage.create({ data: { pipeline_id: policyPipeline.id, name: 'pending',     label: 'Pending',     color: '#8b5cf6', order_index: 1 } }),
    prisma.uiPipelineStage.create({ data: { pipeline_id: policyPipeline.id, name: 'active',      label: 'Active',      color: '#10b981', order_index: 2 } }),
    prisma.uiPipelineStage.create({ data: { pipeline_id: policyPipeline.id, name: 'lapsed',      label: 'Lapsed',      color: '#f59e0b', order_index: 3 } }),
    prisma.uiPipelineStage.create({ data: { pipeline_id: policyPipeline.id, name: 'surrendered', label: 'Surrendered', color: '#ef4444', order_index: 4 } }),
    prisma.uiPipelineStage.create({ data: { pipeline_id: policyPipeline.id, name: 'matured',     label: 'Matured',     color: '#3b82f6', order_index: 5 } }),
    prisma.uiPipelineStage.create({ data: { pipeline_id: policyPipeline.id, name: 'cancelled',   label: 'Cancelled',   color: '#6b7280', order_index: 6 } }),
  ]);
  console.log('✅ Policy Pipeline: 6 stages (pending → active → lapsed → surrendered → matured → cancelled)');

  // — Underwriting Pipeline —
  const uwPipeline = await prisma.uiPipeline.create({
    data: { object_id: underwritingObject.id, name: 'underwriting_pipeline', label: 'Underwriting Pipeline', description: 'Track underwriting case progression' },
  });
  const [uwpPending, uwpInProgress, uwpApproved, uwpDeclined, uwpReferred] = await Promise.all([
    prisma.uiPipelineStage.create({ data: { pipeline_id: uwPipeline.id, name: 'pending',     label: 'Pending',     color: '#6b7280', order_index: 1 } }),
    prisma.uiPipelineStage.create({ data: { pipeline_id: uwPipeline.id, name: 'in_progress', label: 'In Progress', color: '#3b82f6', order_index: 2 } }),
    prisma.uiPipelineStage.create({ data: { pipeline_id: uwPipeline.id, name: 'approved',    label: 'Approved',    color: '#10b981', order_index: 3 } }),
    prisma.uiPipelineStage.create({ data: { pipeline_id: uwPipeline.id, name: 'declined',    label: 'Declined',    color: '#ef4444', order_index: 4 } }),
    prisma.uiPipelineStage.create({ data: { pipeline_id: uwPipeline.id, name: 'referred',    label: 'Referred',    color: '#f59e0b', order_index: 5 } }),
  ]);
  console.log('✅ Underwriting Pipeline: 5 stages (pending → in_progress → approved → declined → referred)');

  // — Commission Pipeline —
  const commPipeline = await prisma.uiPipeline.create({
    data: { object_id: commissionObject.id, name: 'commission_pipeline', label: 'Commission Pipeline', description: 'Track commission payment status' },
  });
  await Promise.all([
    prisma.uiPipelineStage.create({ data: { pipeline_id: commPipeline.id, name: 'pending',     label: 'Pending',     color: '#f59e0b', order_index: 1 } }),
    prisma.uiPipelineStage.create({ data: { pipeline_id: commPipeline.id, name: 'approved',    label: 'Approved',    color: '#3b82f6', order_index: 2 } }),
    prisma.uiPipelineStage.create({ data: { pipeline_id: commPipeline.id, name: 'paid',        label: 'Paid',        color: '#10b981', order_index: 3 } }),
    prisma.uiPipelineStage.create({ data: { pipeline_id: commPipeline.id, name: 'clawed_back', label: 'Clawed Back', color: '#ef4444', order_index: 4 } }),
  ]);
  console.log('✅ Commission Pipeline: 4 stages (pending → approved → paid → clawed_back)');

  // — Prospect Pipeline (for kanban view) —
  const prospectPipeline = await prisma.uiPipeline.create({
    data: { object_id: prospectObject.id, name: 'prospect_pipeline', label: 'Prospect Pipeline', description: 'Track prospect progression' },
  });
  const [psNew, psContacted, psQualified, psUnqualified, psConverted] = await Promise.all([
    prisma.uiPipelineStage.create({ data: { pipeline_id: prospectPipeline.id, name: 'new',         label: 'New',         color: '#6366f1', order_index: 1 } }),
    prisma.uiPipelineStage.create({ data: { pipeline_id: prospectPipeline.id, name: 'contacted',   label: 'Contacted',   color: '#3b82f6', order_index: 2 } }),
    prisma.uiPipelineStage.create({ data: { pipeline_id: prospectPipeline.id, name: 'qualified',   label: 'Qualified',   color: '#10b981', order_index: 3 } }),
    prisma.uiPipelineStage.create({ data: { pipeline_id: prospectPipeline.id, name: 'unqualified', label: 'Unqualified', color: '#ef4444', order_index: 4 } }),
    prisma.uiPipelineStage.create({ data: { pipeline_id: prospectPipeline.id, name: 'converted',   label: 'Converted',   color: '#8b5cf6', order_index: 5 } }),
  ]);
  console.log('✅ Prospect Pipeline: 5 stages\n');

  // — Lead Pipeline (qualification funnel; drag to "Converted" auto-creates a Prospect) —
  const leadPipeline = await prisma.uiPipeline.create({
    data: { object_id: leadObject.id, name: 'lead_intake_pipeline', label: 'Lead Pipeline', description: 'Qualify inbound leads' },
  });
  const [lsNew, lsContacted, lsQualified, lsLeadConverted] = await Promise.all([
    prisma.uiPipelineStage.create({ data: { pipeline_id: leadPipeline.id, name: 'new',       label: 'New',       color: '#6366f1', order_index: 1 } }),
    prisma.uiPipelineStage.create({ data: { pipeline_id: leadPipeline.id, name: 'contacted', label: 'Contacted', color: '#3b82f6', order_index: 2 } }),
    prisma.uiPipelineStage.create({ data: { pipeline_id: leadPipeline.id, name: 'qualified', label: 'Qualified', color: '#10b981', order_index: 3 } }),
    prisma.uiPipelineStage.create({ data: { pipeline_id: leadPipeline.id, name: 'converted', label: 'Converted', color: '#8b5cf6', order_index: 4 } }),
  ]);
  console.log('✅ Lead Pipeline: 4 stages\n');

  // ══════════════════════════════════════════════════════════════════════════════
  // WORKFLOWS
  // ══════════════════════════════════════════════════════════════════════════════
  // The catalogue lives in prisma/crm-workflows.js and is applied by
  // scripts/seed-crm-workflows.js, so `npm run db:seed` and the standalone
  // script always install the identical suite. Each definition names the
  // Salesforce / HubSpot / Zoho / Dynamics 365 / Pipedrive pattern it implements.
  const { applyCrmWorkflows } = require('../scripts/seed-crm-workflows');
  const wfSummary = await applyCrmWorkflows(prisma, {
    purge: false, // ui_workflows was already truncated at the top of this seed
    log:   (msg) => console.log(msg),
  });
  console.log(`\u2705 Workflows: ${wfSummary.created} created (${wfSummary.skipped} skipped)\n`);

  // ══════════════════════════════════════════════════════════════════════════════
  // ASSIGNMENT RULES
  // ══════════════════════════════════════════════════════════════════════════════

  // Rule 1: Application — round-robin to agents
  const rrAppRule = await prisma.assignmentRule.create({ data: {
    object_id:   applicationObject.id,
    name:        'Application Round-Robin',
    rule_type:   'round_robin',
    pool_ids:    [user1.employee_id, user2.employee_id, manager1.employee_id],
    fallback_id: admin.employee_id,
    order_index: 1,
    is_active:   true,
    created_by:  admin.employee_id,
  }});
  await prisma.roundRobinState.create({ data: {
    rule_id:    rrAppRule.id,
    pool_ids:   [user1.employee_id, user2.employee_id, manager1.employee_id],
    last_index: 0,
  }});

  // Rule 2: Claim — critical claims to manager, others round-robin
  await prisma.assignmentRule.create({ data: {
    object_id:   claimObject.id,
    name:        'Death/Critical Claims → Manager',
    rule_type:   'rule_based',
    conditions:  [{ field: 'claim_type', operator: 'in', value: ['death', 'critical_illness'] }],
    assignee_id: manager1.employee_id,
    fallback_id: admin.employee_id,
    order_index: 1,
    is_active:   true,
    created_by:  admin.employee_id,
  }});

  const rrClaimRule = await prisma.assignmentRule.create({ data: {
    object_id:   claimObject.id,
    name:        'Default Claim Round-Robin',
    rule_type:   'round_robin',
    pool_ids:    [user1.employee_id, user2.employee_id],
    fallback_id: manager1.employee_id,
    order_index: 2,
    is_active:   true,
    created_by:  admin.employee_id,
  }});
  await prisma.roundRobinState.create({ data: {
    rule_id:    rrClaimRule.id,
    pool_ids:   [user1.employee_id, user2.employee_id],
    last_index: 0,
  }});

  // Rule 3: Prospect — round-robin
  const rrProspectRule = await prisma.assignmentRule.create({ data: {
    object_id:   prospectObject.id,
    name:        'Prospect Round-Robin',
    rule_type:   'round_robin',
    pool_ids:    [user1.employee_id, user2.employee_id, manager1.employee_id],
    fallback_id: admin.employee_id,
    order_index: 1,
    is_active:   true,
    created_by:  admin.employee_id,
  }});
  await prisma.roundRobinState.create({ data: {
    rule_id:    rrProspectRule.id,
    pool_ids:   [user1.employee_id, user2.employee_id, manager1.employee_id],
    last_index: 0,
  }});

  console.log('✅ Assignment Rules: 4 rules (Application: round_robin, Claim: rule_based + round_robin, Prospect: round_robin)');

  // ══════════════════════════════════════════════════════════════════════════════
  // DEMO CRM RECORDS — Life Insurance context
  // ══════════════════════════════════════════════════════════════════════════════

  // ── Prospect/Lead Records ─────────────────────────────────────────────────
  const prospectAnchorDefs = [
    { pipeline_stage_id: psNew.id,         assigned_to: user1.employee_id },
    { pipeline_stage_id: psNew.id,         assigned_to: user2.employee_id },
    { pipeline_stage_id: psContacted.id,   assigned_to: user1.employee_id },
    { pipeline_stage_id: psQualified.id,   assigned_to: manager1.employee_id },
    { pipeline_stage_id: psConverted.id,   assigned_to: user1.employee_id },
  ];
  const prospectAnchorRecords = await Promise.all(
    prospectAnchorDefs.map(def =>
      prisma.record.create({ data: { object_id: prospectObject.id, ...def, created_by: admin.employee_id } })
    )
  );

  const leadDefs = [
    { first_name: 'Robert',  last_name: 'Thompson', email: 'robert.thompson@email.com', phone: '+1-415-555-0101', company: 'Self-employed', job_title: 'Contractor',        lead_source: 'web',      lead_status: 'new',       rating: 'hot',  industry: 'other',      annual_revenue: 95000,  description: 'Interested in $500K term life policy. Has two young children and recently bought a home.' },
    { first_name: 'Maria',   last_name: 'Garcia',   email: 'maria.garcia@email.com',    phone: '+1-212-555-0202', company: 'N/A',           job_title: 'Marketing Manager', lead_source: 'referral', lead_status: 'new',       rating: 'warm', industry: 'technology', annual_revenue: 82000,  description: 'Referred by existing client James Wilson. Looking for whole life with investment component.' },
    { first_name: 'David',   last_name: 'Park',     email: 'david.park@email.com',      phone: '+1-312-555-0303', company: 'Park Medical',  job_title: 'Physician',         lead_source: 'seminar',  lead_status: 'contacted', rating: 'hot',  industry: 'healthcare', annual_revenue: 280000, description: 'Attended retirement planning seminar. Interested in universal life and annuity products.' },
    { first_name: 'Sarah',   last_name: 'Johnson',  email: 'sarah.johnson@email.com',   phone: '+1-617-555-0404', company: 'TechStart LLC', job_title: 'CEO',               lead_source: 'partner',  lead_status: 'qualified', rating: 'hot',  industry: 'technology', annual_revenue: 350000, description: 'Business owner needs key-person insurance and personal term life. High-value prospect.' },
    { first_name: 'James',   last_name: 'Wilson',   email: 'james.wilson@email.com',    phone: '+1-646-555-0505', company: 'Wilson & Co.',  job_title: 'Attorney',          lead_source: 'cold_call',lead_status: 'converted', rating: 'hot',  industry: 'other',      annual_revenue: 220000, description: 'Converted to client. Purchased $1M term life and whole life policy.', is_converted: true },
  ];

  const crmLeads = await Promise.all(
    leadDefs.map((def, i) =>
      prisma.crmLead.create({
        data: { ...def, record_id: prospectAnchorRecords[i].id, owner_id: prospectAnchorRecords[i].assigned_to, created_by: admin.employee_id },
      })
    )
  );
  console.log(`✅ CRM Leads: ${crmLeads.length} prospect leads seeded`);

  // ── Raw Lead (intake) Records ─────────────────────────────────────────────
  const leadIntakeAnchorDefs = [
    { pipeline_stage_id: lsNew.id,       assigned_to: user1.employee_id },
    { pipeline_stage_id: lsNew.id,       assigned_to: user2.employee_id },
    { pipeline_stage_id: lsContacted.id, assigned_to: user1.employee_id },
    { pipeline_stage_id: lsQualified.id, assigned_to: manager1.employee_id },
  ];
  const leadIntakeAnchorRecords = await Promise.all(
    leadIntakeAnchorDefs.map(def =>
      prisma.record.create({ data: { object_id: leadObject.id, ...def, created_by: admin.employee_id } })
    )
  );
  const leadIntakeDefs = [
    { first_name: 'Olivia', last_name: 'Bennett', email: 'olivia.bennett@email.com', phone: '+1-503-555-0611', company: 'Freelance',        job_title: 'Designer',       lead_source: 'web',      lead_status: 'new',       rating: 'warm', industry: 'creative' },
    { first_name: 'Ethan',  last_name: 'Nguyen',  email: 'ethan.nguyen@email.com',   phone: '+1-408-555-0712', company: 'Nguyen Ventures', job_title: 'Founder',        lead_source: 'social_media', lead_status: 'new',   rating: 'hot',  industry: 'technology' },
    { first_name: 'Priya',  last_name: 'Sharma',  email: 'priya.sharma@email.com',   phone: '+1-732-555-0813', company: 'Sharma Dental',   job_title: 'Dentist',        lead_source: 'referral', lead_status: 'contacted', rating: 'warm', industry: 'healthcare' },
    { first_name: 'Marcus', last_name: 'Lee',     email: 'marcus.lee@email.com',     phone: '+1-206-555-0914', company: 'BuildRight',      job_title: 'Project Manager',lead_source: 'seminar',  lead_status: 'qualified', rating: 'hot',  industry: 'construction' },
  ];
  const crmLeadIntakes = await Promise.all(
    leadIntakeDefs.map((def, i) =>
      prisma.crmLeadIntake.create({
        data: { ...def, record_id: leadIntakeAnchorRecords[i].id, owner_id: leadIntakeAnchorRecords[i].assigned_to, created_by: admin.employee_id },
      })
    )
  );
  console.log(`✅ Lead intake: ${crmLeadIntakes.length} raw leads seeded`);

  // ── CRM Accounts (Insurance context — agencies/companies) ─────────────────
  // Accounts are CRM relationship entities (company/household), NOT individual
  // clients. Use the prospect object as anchor so they don't appear in the
  // Client list (which expects contact-shaped data).
  const accountRecords = await Promise.all([
    prisma.record.create({ data: { object_id: prospectObject.id, created_by: admin.employee_id, assigned_to: user1.employee_id } }),
    prisma.record.create({ data: { object_id: prospectObject.id, created_by: admin.employee_id, assigned_to: manager1.employee_id } }),
    prisma.record.create({ data: { object_id: prospectObject.id, created_by: admin.employee_id, assigned_to: user2.employee_id } }),
  ]);

  const accDefs = [
    { name: 'Wilson & Co. Law Firm',  industry: 'other',      annual_revenue: 2200000, phone: '+1-646-555-0505', website: 'https://wilsonlaw.com' },
    { name: 'Park Medical Group',     industry: 'healthcare', annual_revenue: 5500000, phone: '+1-312-555-0303', website: 'https://parkmedical.com' },
    { name: 'TechStart LLC',          industry: 'technology', annual_revenue: 1800000, phone: '+1-617-555-0404', website: 'https://techstartllc.com' },
  ];

  const accounts = await Promise.all(
    accDefs.map((def, i) =>
      prisma.crmAccount.create({
        data: { ...def, record_id: accountRecords[i].id, owner_id: accountRecords[i].assigned_to, created_by: admin.employee_id },
      })
    )
  );
  console.log(`✅ CRM Accounts: ${accounts.length} accounts seeded`);

  // ── CRM Contacts ──────────────────────────────────────────────────────────
  const contactRecords = await Promise.all([
    prisma.record.create({ data: { object_id: clientObject.id, created_by: admin.employee_id, assigned_to: user1.employee_id } }),
    prisma.record.create({ data: { object_id: clientObject.id, created_by: admin.employee_id, assigned_to: manager1.employee_id } }),
    prisma.record.create({ data: { object_id: clientObject.id, created_by: admin.employee_id, assigned_to: user2.employee_id } }),
    prisma.record.create({ data: { object_id: clientObject.id, created_by: admin.employee_id, assigned_to: user1.employee_id } }),
    prisma.record.create({ data: { object_id: clientObject.id, created_by: admin.employee_id, assigned_to: manager1.employee_id } }),
  ]);

  const contactDefs = [
    { first_name: 'James',   last_name: 'Wilson',   email: 'james.wilson@email.com',    phone: '+1-646-555-0505', title: 'Attorney',          account_id: accounts[0].id },
    { first_name: 'David',   last_name: 'Park',     email: 'david.park@email.com',      phone: '+1-312-555-0303', title: 'Physician',         account_id: accounts[1].id },
    { first_name: 'Sarah',   last_name: 'Johnson',  email: 'sarah.johnson@email.com',   phone: '+1-617-555-0404', title: 'CEO',               account_id: accounts[2].id },
    { first_name: 'Lisa',    last_name: 'Chen',     email: 'lisa.chen@email.com',        phone: '+1-408-555-0606', title: 'Financial Planner' },
    { first_name: 'Michael', last_name: 'Brown',    email: 'michael.brown@email.com',   phone: '+1-503-555-0707', title: 'Business Owner' },
  ];

  const contacts = await Promise.all(
    contactDefs.map((def, i) =>
      prisma.crmContact.create({
        data: { ...def, record_id: contactRecords[i].id, owner_id: contactRecords[i].assigned_to, created_by: admin.employee_id },
      })
    )
  );
  console.log(`✅ CRM Contacts: ${contacts.length} contacts seeded`);

  // ── Client EAV: insurance-specific fields for each contact ────────────────
  // These populate fields defined in clientObject that are NOT native CRM columns
  // (smoker_status, health_class, annual_income, marital_status, num_dependents,
  //  beneficiary_name, occupation, address_*, etc.)
  const clientEavDefs = [
    // contacts[0] — James Wilson (attorney, $1M term)
    { record_id: contactRecords[0].id, fields: {
        first_name: 'James',          last_name: 'Wilson',          email: 'james.wilson@email.com',
        phone: '+1-646-555-0505',     date_of_birth: '1985-06-20', age: 40,
        gender: 'male',               ssn: '***-**-1234',          smoker_status: 'never',
        health_class: 'preferred_plus', occupation: 'Attorney',     employer: 'Wilson & Co.',
        annual_income: 280000,        marital_status: 'married',   num_dependents: 2,
        beneficiary_name: 'Emily Wilson', beneficiary_relationship: 'spouse',
        address_street: '245 Park Ave', address_city: 'New York',  address_state: 'NY',
        address_zip: '10167',         client_since: '2025-09-01',  notes: 'High-value client with multiple policies.',
    }},
    // contacts[1] — David Park (physician, UL)
    { record_id: contactRecords[1].id, fields: {
        first_name: 'David',          last_name: 'Park',           email: 'david.park@email.com',
        phone: '+1-312-555-0303',     date_of_birth: '1979-11-04', age: 46,
        gender: 'male',               smoker_status: 'never',      health_class: 'preferred',
        occupation: 'Physician',      employer: 'Park Medical Group', annual_income: 420000,
        marital_status: 'married',    num_dependents: 3,           beneficiary_name: 'Anna Park',
        beneficiary_relationship: 'spouse', address_street: '875 N. Michigan Ave',
        address_city: 'Chicago',      address_state: 'IL',         address_zip: '60611',
        client_since: '2025-11-15',   notes: 'Physician with high income. Interested in wealth accumulation.',
    }},
    // contacts[2] — Sarah Johnson (CEO, whole life)
    { record_id: contactRecords[2].id, fields: {
        first_name: 'Sarah',          last_name: 'Johnson',        email: 'sarah.johnson@email.com',
        phone: '+1-617-555-0404',     date_of_birth: '1990-03-29', age: 35,
        gender: 'female',             smoker_status: 'never',      health_class: 'standard',
        occupation: 'CEO',            employer: 'TechStart LLC',   annual_income: 195000,
        marital_status: 'single',     num_dependents: 0,           beneficiary_name: 'Thomas Johnson',
        beneficiary_relationship: 'parent', address_street: '500 Boylston St',
        address_city: 'Boston',       address_state: 'MA',         address_zip: '02116',
        client_since: '2026-01-10',   notes: 'Business owner needing key-person coverage.',
    }},
    // contacts[3] — Lisa Chen (financial planner)
    { record_id: contactRecords[3].id, fields: {
        first_name: 'Lisa',           last_name: 'Chen',           email: 'lisa.chen@email.com',
        phone: '+1-408-555-0606',     date_of_birth: '1988-07-14', age: 37,
        gender: 'female',             smoker_status: 'never',      health_class: 'preferred',
        occupation: 'Financial Planner', employer: 'Independent',  annual_income: 135000,
        marital_status: 'married',    num_dependents: 1,           beneficiary_name: 'Kevin Chen',
        beneficiary_relationship: 'spouse', address_street: '3000 El Camino Real',
        address_city: 'Palo Alto',    address_state: 'CA',         address_zip: '94306',
        client_since: '2026-02-03',   notes: 'Referral from existing client network.',
    }},
    // contacts[4] — Michael Brown (business owner)
    { record_id: contactRecords[4].id, fields: {
        first_name: 'Michael',        last_name: 'Brown',          email: 'michael.brown@email.com',
        phone: '+1-503-555-0707',     date_of_birth: '1975-10-22', age: 50,
        gender: 'male',               smoker_status: 'former',     health_class: 'standard',
        occupation: 'Business Owner', employer: 'Brown Enterprises', annual_income: 310000,
        marital_status: 'divorced',   num_dependents: 2,           beneficiary_name: 'Olivia Brown',
        beneficiary_relationship: 'child', address_street: '1234 NW Burnside St',
        address_city: 'Portland',     address_state: 'OR',         address_zip: '97209',
        client_since: '2025-12-20',   notes: 'Former smoker — rated substandard initially, reclassified after 3 years.',
    }},
  ];

  for (const { record_id, fields } of clientEavDefs) {
    const eavRows = [];
    for (const [field_name, val] of Object.entries(fields)) {
      const row = { record_id, field_name, tenant_id: T };
      if (typeof val === 'number') { row.num_value = val; }
      else if (typeof val === 'boolean') { row.bool_value = val; }
      else { row.str_value = String(val); }
      eavRows.push(row);
    }
    await prisma.recordFieldValue.createMany({ data: eavRows, skipDuplicates: true });
  }
  console.log('✅ Client EAV fields seeded: 5 contacts × insurance profile fields');
  const oppRecords = await Promise.all([
    prisma.record.create({ data: { object_id: applicationObject.id, created_by: admin.employee_id, assigned_to: user1.employee_id } }),
    prisma.record.create({ data: { object_id: applicationObject.id, created_by: admin.employee_id, assigned_to: manager1.employee_id } }),
    prisma.record.create({ data: { object_id: applicationObject.id, created_by: admin.employee_id, assigned_to: user2.employee_id } }),
  ]);

  const oppDefs = [
    { name: 'Wilson $1M Term + Whole Life',    amount: 45000, stage: 'closed_won', probability: 100, is_closed: true, is_won: true, close_date: new Date('2026-03-01'), account_id: accounts[0].id, contact_id: contacts[0].id, lead_source: 'cold_call' },
    { name: 'Park Medical Group Coverage',     amount: 85000, stage: 'proposal',   probability: 60,  is_closed: false, is_won: false, close_date: new Date('2026-05-15'), account_id: accounts[1].id, contact_id: contacts[1].id, lead_source: 'seminar' },
    { name: 'TechStart Key-Person Insurance',  amount: 32000, stage: 'qualification', probability: 35, is_closed: false, is_won: false, close_date: new Date('2026-06-01'), account_id: accounts[2].id, contact_id: contacts[2].id, lead_source: 'partner' },
  ];

  const opportunities = await Promise.all(
    oppDefs.map((def, i) =>
      prisma.crmOpportunity.create({
        data: { ...def, record_id: oppRecords[i].id, owner_id: oppRecords[i].assigned_to, created_by: admin.employee_id },
      })
    )
  );
  console.log(`✅ CRM Opportunities: ${opportunities.length} insurance opportunities seeded`);

  // ── Quotes ────────────────────────────────────────────────────────────────
  const quoteRecords = await Promise.all([
    prisma.record.create({ data: { object_id: quoteObject.id, created_by: admin.employee_id, assigned_to: user1.employee_id } }),
    prisma.record.create({ data: { object_id: quoteObject.id, created_by: admin.employee_id, assigned_to: user2.employee_id } }),
    prisma.record.create({ data: { object_id: quoteObject.id, created_by: admin.employee_id, assigned_to: manager1.employee_id } }),
  ]);

  const quoteDefs = [
    {
      quote_number: 'Q-2026-0001',
      name: 'Robert Thompson Term Life Quote',
      status: 'presented',
      valid_until: new Date('2026-06-30'),
      subtotal: 1980,
      discount_amount: 80,
      tax_amount: 0,
      total_amount: 1900,
      notes: 'Preferred non-smoker class. Includes accidental rider.',
      opportunity_id: opportunities[0].id,
      account_id: accounts[0].id,
      contact_id: contacts[0].id,
    },
    {
      quote_number: 'Q-2026-0002',
      name: 'Park Medical Universal Life Quote',
      status: 'draft',
      valid_until: new Date('2026-07-15'),
      subtotal: 3840,
      discount_amount: 0,
      tax_amount: 0,
      total_amount: 3840,
      notes: 'Includes waiver of premium rider.',
      opportunity_id: opportunities[1].id,
      account_id: accounts[1].id,
      contact_id: contacts[1].id,
    },
    {
      quote_number: 'Q-2026-0003',
      name: 'TechStart Key Person Coverage Quote',
      status: 'accepted',
      valid_until: new Date('2026-08-01'),
      subtotal: 2520,
      discount_amount: 120,
      tax_amount: 0,
      total_amount: 2400,
      notes: 'Corporate-owned policy with annual billing.',
      opportunity_id: opportunities[2].id,
      account_id: accounts[2].id,
      contact_id: contacts[2].id,
    },
  ];

  const quotes = await Promise.all(
    quoteDefs.map((def, i) =>
      prisma.quote.create({
        data: {
          ...def,
          record_id: quoteRecords[i].id,
          owner_id: quoteRecords[i].assigned_to,
          created_by: admin.employee_id,
        },
      })
    )
  );

  await prisma.quoteLineItem.createMany({
    data: [
      { quote_id: quotes[0].id, name: 'Term Life Base Plan', description: '20-year term life', quantity: 1, unit_price: 1500, discount: 0, line_total: 1500, order_index: 1 },
      { quote_id: quotes[0].id, name: 'Accidental Death Rider', description: 'Additional accidental coverage', quantity: 1, unit_price: 480, discount: 0, line_total: 480, order_index: 2 },
      { quote_id: quotes[1].id, name: 'Universal Life Base Plan', description: 'Flexible premium UL product', quantity: 1, unit_price: 3600, discount: 0, line_total: 3600, order_index: 1 },
      { quote_id: quotes[1].id, name: 'Waiver of Premium Rider', description: 'Premium waiver on disability', quantity: 1, unit_price: 240, discount: 0, line_total: 240, order_index: 2 },
      { quote_id: quotes[2].id, name: 'Key Person Term Policy', description: 'Key person term coverage', quantity: 1, unit_price: 2400, discount: 5, line_total: 2280, order_index: 1 },
      { quote_id: quotes[2].id, name: 'Business Continuation Rider', description: 'Business continuity support rider', quantity: 1, unit_price: 240, discount: 0, line_total: 240, order_index: 2 },
    ],
  });
  console.log(`✅ Quotes seeded: ${quotes.length} quotes with line items`);

  // ── Insurance Domain: carriers, products, applications, policies, claims ──
  const carriers = await Promise.all([
    prisma.insuranceCarrier.create({
      data: {
        name: 'Guardian Life Assurance',
        code: 'GLA',
        naic_code: '64246',
        am_best_rating: 'A++',
        carrier_type: 'life',
        phone: '+1-800-555-1100',
        email: 'broker-support@guardianlife.example',
        website: 'https://guardianlife.example',
        created_by: admin.employee_id,
      },
    }),
    prisma.insuranceCarrier.create({
      data: {
        name: 'Summit National Life',
        code: 'SNL',
        naic_code: '70132',
        am_best_rating: 'A',
        carrier_type: 'life',
        phone: '+1-800-555-2200',
        email: 'agency@summlife.example',
        website: 'https://summlife.example',
        created_by: admin.employee_id,
      },
    }),
  ]);

  const carrierProducts = await Promise.all([
    prisma.carrierProduct.create({
      data: {
        carrier_id: carriers[0].id,
        product_type: 'term_life',
        name: 'Guardian SecureTerm 20',
        plan_code: 'GST20',
        min_coverage: 100000,
        max_coverage: 2000000,
        min_age: 18,
        max_age: 65,
      },
    }),
    prisma.carrierProduct.create({
      data: {
        carrier_id: carriers[0].id,
        product_type: 'whole_life',
        name: 'Guardian Wealth Whole Life',
        plan_code: 'GWWL',
        min_coverage: 50000,
        max_coverage: 1500000,
        min_age: 0,
        max_age: 80,
      },
    }),
    prisma.carrierProduct.create({
      data: {
        carrier_id: carriers[1].id,
        product_type: 'universal_life',
        name: 'Summit Flex Universal Life',
        plan_code: 'SFUL',
        min_coverage: 250000,
        max_coverage: 5000000,
        min_age: 18,
        max_age: 75,
      },
    }),
  ]);
  console.log(`✅ Insurance Carriers/Products seeded: ${carriers.length} carriers, ${carrierProducts.length} products`);

  const insuranceAppRecords = await Promise.all([
    prisma.record.create({ data: { object_id: applicationObject.id, created_by: admin.employee_id, assigned_to: user1.employee_id } }),
    prisma.record.create({ data: { object_id: applicationObject.id, created_by: admin.employee_id, assigned_to: user2.employee_id } }),
    prisma.record.create({ data: { object_id: applicationObject.id, created_by: admin.employee_id, assigned_to: manager1.employee_id } }),
  ]);

  const insuranceApps = await Promise.all([
    prisma.insuranceApplication.create({
      data: {
        record_id: insuranceAppRecords[0].id,
        app_number: 'APP-2026-0001',
        contact_id: contacts[0].id,
        account_id: accounts[0].id,
        agent_id: user1.employee_id,
        carrier_id: carriers[0].id,
        carrier_product_id: carrierProducts[0].id,
        product_type: 'term_life',
        product_name: carrierProducts[0].name,
        coverage_amount: 1000000,
        premium_amount: 1900,
        status: 'approved',
        submitted_at: new Date('2026-03-05'),
        age: 39,
        date_of_birth: new Date('1987-04-15'),
        gender: 'male',
        is_smoker: false,
        health_class: 'preferred',
        term_years: 20,
        payment_frequency: 'monthly',
        height_in: 71,
        weight_lbs: 185,
        notes: 'Clean MIB and attending physician statement received.',
        created_by: admin.employee_id,
      },
    }),
    prisma.insuranceApplication.create({
      data: {
        record_id: insuranceAppRecords[1].id,
        app_number: 'APP-2026-0002',
        contact_id: contacts[1].id,
        account_id: accounts[1].id,
        agent_id: user2.employee_id,
        carrier_id: carriers[1].id,
        carrier_product_id: carrierProducts[2].id,
        product_type: 'universal_life',
        product_name: carrierProducts[2].name,
        coverage_amount: 2000000,
        premium_amount: 3840,
        status: 'under_review',
        submitted_at: new Date('2026-03-12'),
        age: 46,
        date_of_birth: new Date('1980-01-22'),
        gender: 'male',
        is_smoker: false,
        health_class: 'standard_plus',
        payment_frequency: 'annual',
        height_in: 70,
        weight_lbs: 192,
        notes: 'Awaiting liver panel and ECG results.',
        created_by: admin.employee_id,
      },
    }),
    prisma.insuranceApplication.create({
      data: {
        record_id: insuranceAppRecords[2].id,
        app_number: 'APP-2026-0003',
        contact_id: contacts[2].id,
        account_id: accounts[2].id,
        agent_id: manager1.employee_id,
        carrier_id: carriers[0].id,
        carrier_product_id: carrierProducts[1].id,
        product_type: 'whole_life',
        product_name: carrierProducts[1].name,
        coverage_amount: 750000,
        premium_amount: 2400,
        status: 'submitted',
        submitted_at: new Date('2026-03-20'),
        age: 35,
        date_of_birth: new Date('1991-07-10'),
        gender: 'female',
        is_smoker: false,
        health_class: 'preferred_plus',
        payment_frequency: 'semi_annual',
        height_in: 66,
        weight_lbs: 140,
        notes: 'Financial documents uploaded; pending underwriting assignment.',
        created_by: admin.employee_id,
      },
    }),
  ]);
  console.log(`✅ Insurance Applications seeded: ${insuranceApps.length} applications`);

  const uwCases = await Promise.all([
    // UW-0001: Wilson $1M Term — approved by Senior UW, preferred class
    prisma.underwritingCase.create({
      data: {
        case_number: 'UW-2026-0001',
        application_id: insuranceApps[0].id,
        assigned_underwriter: srUw.employee_id,
        status: 'approved',
        risk_class: 'preferred',
        bmi: 25.8,
        blood_pressure: '118/76',
        cholesterol: 178,
        medical_conditions: 'None disclosed',
        medications: 'None',
        family_history: 'No early cardiac mortality',
        decision_notes: 'Approved at standard premium with preferred class. Clean labs, no family history. Straightforward case.',
        decided_at: new Date('2026-03-18T10:30:00Z'),
      },
    }),
    // UW-0002: Park UL — in progress, mild hypertension flagged by Underwriter
    prisma.underwritingCase.create({
      data: {
        case_number: 'UW-2026-0002',
        application_id: insuranceApps[1].id,
        assigned_underwriter: uw1.employee_id,
        status: 'in_progress',
        risk_class: 'standard',
        bmi: 27.6,
        blood_pressure: '126/82',
        cholesterol: 204,
        medical_conditions: 'Mild hypertension — controlled with medication',
        medications: 'Amlodipine 5mg daily',
        family_history: 'Father with CAD at 64',
        decision_notes: 'Awaiting APS from Dr. Lee and repeat lipid panel. BP well-controlled per records.',
      },
    }),
    // UW-0003: Johnson Whole Life — pending, assigned to Underwriter
    prisma.underwritingCase.create({
      data: {
        case_number: 'UW-2026-0003',
        application_id: insuranceApps[2].id,
        assigned_underwriter: uw1.employee_id,
        status: 'pending',
        risk_class: 'standard',
        bmi: 22.6,
        blood_pressure: '112/70',
        cholesterol: 170,
        medical_conditions: 'None disclosed',
        medications: 'None',
        family_history: 'No known hereditary concerns',
      },
    }),
  ]);

  await prisma.underwritingRequirement.createMany({
    data: [
      // UW-0001 requirements (all received — case approved)
      { case_id: uwCases[0].id, description: 'Paramedical exam — blood draw, vitals, urinalysis', requirement_type: 'medical_exam', status: 'received', received_at: new Date('2026-03-11T14:00:00Z') },
      { case_id: uwCases[0].id, description: 'Attending physician statement from Dr. Adams', requirement_type: 'attending_physician', status: 'received', received_at: new Date('2026-03-14T09:00:00Z') },
      { case_id: uwCases[0].id, description: 'MIB database check', requirement_type: 'records', status: 'received', received_at: new Date('2026-03-10T08:00:00Z') },
      // UW-0002 requirements (mixed — case in progress)
      { case_id: uwCases[1].id, description: 'Comprehensive metabolic panel — liver and renal function', requirement_type: 'lab_work', status: 'pending', due_date: new Date('2026-04-10') },
      { case_id: uwCases[1].id, description: 'Prescription history from pharmacy benefit manager', requirement_type: 'records', status: 'received', received_at: new Date('2026-03-22T13:20:00Z') },
      { case_id: uwCases[1].id, description: 'APS from Dr. Lee (primary care) — hypertension mgmt records', requirement_type: 'attending_physician', status: 'pending', due_date: new Date('2026-04-15') },
      { case_id: uwCases[1].id, description: 'Tele-interview — lifestyle and occupation questions', requirement_type: 'other', status: 'received', received_at: new Date('2026-03-25T11:00:00Z'), notes: 'Completed. No adverse findings.' },
      // UW-0003 requirements (all pending — case just received)
      { case_id: uwCases[2].id, description: 'Identity and income verification documents', requirement_type: 'records', status: 'pending', due_date: new Date('2026-04-05') },
      { case_id: uwCases[2].id, description: 'Paramedical exam — standard panel', requirement_type: 'medical_exam', status: 'pending', due_date: new Date('2026-04-08') },
    ],
  });
  console.log(`✅ Underwriting Cases seeded: ${uwCases.length} cases with requirements`);

  const policyRecords = await Promise.all([
    prisma.record.create({ data: { object_id: policyObject.id, created_by: admin.employee_id, assigned_to: user1.employee_id } }),
    prisma.record.create({ data: { object_id: policyObject.id, created_by: admin.employee_id, assigned_to: manager1.employee_id } }),
  ]);

  const policies = await Promise.all([
    prisma.insurancePolicy.create({
      data: {
        record_id: policyRecords[0].id,
        policy_number: 'POL-2026-00012',
        carrier_id: carriers[0].id,
        carrier_product_id: carrierProducts[0].id,
        contact_id: contacts[0].id,
        account_id: accounts[0].id,
        agent_id: user1.employee_id,
        application_id: insuranceApps[0].id,
        product_type: 'term_life',
        product_name: carrierProducts[0].name,
        coverage_amount: 1000000,
        premium_amount: 1900,
        premium_frequency: 'annual',
        status: 'active',
        effective_date: new Date('2026-04-01'),
        expiry_date: new Date('2046-04-01'),
        renewal_due_date: new Date('2027-03-15'),
        death_benefit: 1000000,
        last_payment_date: new Date('2026-04-01'),
        notes: 'Issued after preferred underwriting decision.',
        created_by: admin.employee_id,
      },
    }),
    prisma.insurancePolicy.create({
      data: {
        record_id: policyRecords[1].id,
        policy_number: 'POL-2026-00013',
        carrier_id: carriers[1].id,
        carrier_product_id: carrierProducts[2].id,
        contact_id: contacts[1].id,
        account_id: accounts[1].id,
        agent_id: user2.employee_id,
        product_type: 'universal_life',
        product_name: carrierProducts[2].name,
        coverage_amount: 2000000,
        premium_amount: 3840,
        premium_frequency: 'annual',
        status: 'pending',
        effective_date: new Date('2026-05-01'),
        renewal_due_date: new Date('2027-04-01'),
        death_benefit: 2000000,
        notes: 'Conditional issue pending final lab review.',
        created_by: admin.employee_id,
      },
    }),
  ]);

  await prisma.insurancePolicyBeneficiary.createMany({
    data: [
      { policy_id: policies[0].id, name: 'Emily Thompson', relationship: 'spouse', beneficiary_type: 'primary', allocation_pct: 70, date_of_birth: new Date('1990-06-14') },
      { policy_id: policies[0].id, name: 'Noah Thompson', relationship: 'child', beneficiary_type: 'contingent', allocation_pct: 30, date_of_birth: new Date('2018-09-08') },
      { policy_id: policies[1].id, name: 'Park Family Trust', relationship: 'trust', beneficiary_type: 'primary', allocation_pct: 100 },
    ],
  });

  await prisma.insurancePolicyStatusHistory.createMany({
    data: [
      { policy_id: policies[0].id, from_status: 'pending', to_status: 'active', reason: 'Policy issued after underwriting approval', changed_by: manager1.employee_id },
      { policy_id: policies[1].id, from_status: null, to_status: 'pending', reason: 'Awaiting final underwriting disposition', changed_by: manager1.employee_id },
    ],
  });
  console.log(`✅ Insurance Policies seeded: ${policies.length} policies with beneficiaries/history`);

  const claimRecords = await Promise.all([
    prisma.record.create({ data: { object_id: claimObject.id, created_by: admin.employee_id, assigned_to: manager1.employee_id } }),
    prisma.record.create({ data: { object_id: claimObject.id, created_by: admin.employee_id, assigned_to: user2.employee_id } }),
  ]);

  const claims = await Promise.all([
    prisma.insuranceClaim.create({
      data: {
        record_id: claimRecords[0].id,
        claim_number: 'CLM-2026-0001',
        policy_id: policies[0].id,
        contact_id: contacts[0].id,
        claim_type: 'death',
        amount: 500000,
        status: 'under_investigation',
        priority: 'high',
        adjuster_id: manager1.employee_id,
        filed_at: new Date('2026-04-12T09:15:00Z'),
        description: 'Initial death benefit claim packet received from spouse.',
        created_by: admin.employee_id,
      },
    }),
    prisma.insuranceClaim.create({
      data: {
        record_id: claimRecords[1].id,
        claim_number: 'CLM-2026-0002',
        policy_id: policies[1].id,
        contact_id: contacts[1].id,
        claim_type: 'critical_illness',
        amount: 150000,
        status: 'filed',
        priority: 'medium',
        adjuster_id: user2.employee_id,
        filed_at: new Date('2026-04-20T11:30:00Z'),
        description: 'Critical illness claim awaiting physician statement.',
        created_by: admin.employee_id,
      },
    }),
  ]);

  await prisma.claimEvent.createMany({
    data: [
      { claim_id: claims[0].id, event_type: 'filed', description: 'Claim filed and acknowledgment sent to claimant', created_by: user1.employee_id },
      { claim_id: claims[0].id, event_type: 'document_received', description: 'Death certificate and policy documents received', created_by: manager1.employee_id },
      { claim_id: claims[1].id, event_type: 'filed', description: 'Claim intake completed and adjuster assigned', created_by: user2.employee_id },
      { claim_id: claims[1].id, event_type: 'note', description: 'Requested specialist report from treating hospital', created_by: user2.employee_id },
    ],
  });
  console.log(`✅ Insurance Claims seeded: ${claims.length} claims with timeline events`);

  const commissionPeriod = new Date().toISOString().slice(0, 7);
  await prisma.commissionEntry.createMany({
    data: [
      {
        agent_id: user1.employee_id,
        policy_id: policies[0].id,
        application_id: insuranceApps[0].id,
        carrier_id: carriers[0].id,
        product_type: 'term_life',
        source_premium: 1900,
        commission_rate: 55,
        commission_amount: 1045,
        commission_period: commissionPeriod,
        status: 'paid',
        paid_at: new Date('2026-04-25T12:00:00Z'),
        split_agent_id: manager1.employee_id,
        split_percent: 10,
        notes: 'First-year commission paid with manager override split.',
        created_by: admin.employee_id,
      },
      {
        agent_id: user2.employee_id,
        application_id: insuranceApps[1].id,
        carrier_id: carriers[1].id,
        product_type: 'universal_life',
        source_premium: 3840,
        commission_rate: 35,
        commission_amount: 1344,
        commission_period: commissionPeriod,
        status: 'pending',
        notes: 'Advance commission to release after final underwriting decision.',
        created_by: admin.employee_id,
      },
      {
        agent_id: manager1.employee_id,
        application_id: insuranceApps[2].id,
        carrier_id: carriers[0].id,
        product_type: 'whole_life',
        source_premium: 2400,
        commission_rate: 40,
        commission_amount: 960,
        commission_period: commissionPeriod,
        status: 'pending',
        notes: 'Manager-owned book of business pending issue.',
        created_by: admin.employee_id,
      },
    ],
  });
  console.log('✅ Commission Entries seeded: 3 entries');

  // ── Additional Insurance Records (more realistic volume) ──────────────────
  // 5 more applications with varying statuses
  const extraAppRecords = await Promise.all([
    prisma.record.create({ data: { object_id: applicationObject.id, created_by: admin.employee_id, assigned_to: user1.employee_id } }),
    prisma.record.create({ data: { object_id: applicationObject.id, created_by: admin.employee_id, assigned_to: user2.employee_id } }),
    prisma.record.create({ data: { object_id: applicationObject.id, created_by: admin.employee_id, assigned_to: manager1.employee_id } }),
    prisma.record.create({ data: { object_id: applicationObject.id, created_by: admin.employee_id, assigned_to: user1.employee_id } }),
    prisma.record.create({ data: { object_id: applicationObject.id, created_by: admin.employee_id, assigned_to: user2.employee_id } }),
  ]);

  const extraApps = await Promise.all([
    prisma.insuranceApplication.create({ data: {
      record_id: extraAppRecords[0].id, app_number: 'APP-2026-0004',
      contact_id: contacts[2].id, account_id: accounts[2].id, agent_id: user1.employee_id,
      carrier_id: carriers[0].id, carrier_product_id: carrierProducts[1].id,
      product_type: 'whole_life', product_name: carrierProducts[1].name,
      coverage_amount: 500000, premium_amount: 3200, status: 'pending_medical',
      submitted_at: new Date('2026-03-28'), age: 35, date_of_birth: new Date('1991-06-18'),
      gender: 'female', is_smoker: false, health_class: 'standard',
      payment_frequency: 'quarterly',
      height_in: 65, weight_lbs: 130, notes: 'APS ordered from primary care physician.',
      created_by: admin.employee_id,
    }}),
    prisma.insuranceApplication.create({ data: {
      record_id: extraAppRecords[1].id, app_number: 'APP-2026-0005',
      contact_id: contacts[3].id, agent_id: user2.employee_id,
      carrier_id: carriers[1].id, carrier_product_id: carrierProducts[2].id,
      product_type: 'universal_life', product_name: carrierProducts[2].name,
      coverage_amount: 750000, premium_amount: 2100, status: 'submitted',
      submitted_at: new Date('2026-04-01'), age: 37, date_of_birth: new Date('1989-02-14'),
      gender: 'female', is_smoker: false, health_class: 'preferred',
      payment_frequency: 'monthly',
      height_in: 64, weight_lbs: 125, notes: 'New application from financial-planner referral.',
      created_by: admin.employee_id,
    }}),
    prisma.insuranceApplication.create({ data: {
      record_id: extraAppRecords[2].id, app_number: 'APP-2026-0006',
      contact_id: contacts[4].id, agent_id: manager1.employee_id,
      carrier_id: carriers[0].id, carrier_product_id: carrierProducts[0].id,
      product_type: 'term_life', product_name: carrierProducts[0].name,
      coverage_amount: 2000000, premium_amount: 4800, status: 'under_review',
      submitted_at: new Date('2026-04-02'), age: 50, date_of_birth: new Date('1976-08-30'),
      gender: 'male', is_smoker: false, health_class: 'standard',
      term_years: 15, payment_frequency: 'annual',
      height_in: 72, weight_lbs: 210, notes: 'Business owner key-person application. Elevated BMI noted.',
      created_by: admin.employee_id,
    }}),
    prisma.insuranceApplication.create({ data: {
      record_id: extraAppRecords[3].id, app_number: 'APP-2026-0007',
      contact_id: contacts[1].id, account_id: accounts[1].id, agent_id: user1.employee_id,
      carrier_id: carriers[1].id, carrier_product_id: carrierProducts[2].id,
      product_type: 'universal_life', product_name: carrierProducts[2].name,
      coverage_amount: 3000000, premium_amount: 9600, status: 'declined',
      submitted_at: new Date('2026-02-18'), age: 46, date_of_birth: new Date('1980-01-22'),
      gender: 'male', is_smoker: false, health_class: 'substandard',
      payment_frequency: 'monthly',
      height_in: 70, weight_lbs: 195, notes: 'Declined due to elevated liver enzymes found on labs.',
      created_by: admin.employee_id,
    }}),
    prisma.insuranceApplication.create({ data: {
      record_id: extraAppRecords[4].id, app_number: 'APP-2026-0008',
      contact_id: contacts[0].id, account_id: accounts[0].id, agent_id: user2.employee_id,
      carrier_id: carriers[0].id, carrier_product_id: carrierProducts[1].id,
      product_type: 'whole_life', product_name: carrierProducts[1].name,
      coverage_amount: 250000, premium_amount: 1850, status: 'approved',
      submitted_at: new Date('2026-03-10'), age: 39, date_of_birth: new Date('1987-04-15'),
      gender: 'male', is_smoker: false, health_class: 'preferred_plus',
      payment_frequency: 'semi_annual',
      height_in: 71, weight_lbs: 183, notes: 'Supplemental whole life policy. Clean application.',
      created_by: admin.employee_id,
    }}),
  ]);
  console.log(`✅ Additional Insurance Applications seeded: ${extraApps.length} more applications`);

  // ── Additional UW cases for extra applications ──────────────────────────
  const extraUwCases = await Promise.all([
    // UW-0004: Johnson Whole Life (APP-0004) — pending_medical, assigned to Senior UW
    prisma.underwritingCase.create({ data: {
      case_number: 'UW-2026-0004',
      application_id: extraApps[0].id,
      assigned_underwriter: srUw.employee_id,
      status: 'in_progress',
      risk_class: 'standard',
      bmi: 21.7,
      blood_pressure: '115/72',
      cholesterol: 185,
      medical_conditions: 'None — healthy 35-year-old female',
      medications: 'Oral contraceptives only',
      family_history: 'Mother with breast cancer at 58 — requires additional review',
      decision_notes: 'Family history of cancer warrants APS review. Otherwise clean profile.',
    }}),
    // UW-0005: Chen Universal Life (APP-0005) — referred to UW Manager (high coverage)
    prisma.underwritingCase.create({ data: {
      case_number: 'UW-2026-0005',
      application_id: extraApps[1].id,
      assigned_underwriter: uwMgr.employee_id,
      status: 'referred',
      risk_class: 'preferred',
      bmi: 20.1,
      blood_pressure: '108/68',
      cholesterol: 162,
      medical_conditions: 'None',
      medications: 'None',
      family_history: 'No known issues',
      decision_notes: 'Referred to reinsurer — $750K UL exceeds junior UW binding authority. Clean risk profile, expect approval.',
    }}),
    // UW-0006: Brown Term $2M (APP-0006) — under review, elevated BMI
    prisma.underwritingCase.create({ data: {
      case_number: 'UW-2026-0006',
      application_id: extraApps[2].id,
      assigned_underwriter: srUw.employee_id,
      status: 'in_progress',
      risk_class: 'substandard',
      bmi: 29.2,
      blood_pressure: '134/86',
      cholesterol: 228,
      medical_conditions: 'Borderline obesity, elevated BP and cholesterol',
      medications: 'Atorvastatin 20mg, Lisinopril 10mg',
      family_history: 'Father with MI at 55',
      decision_notes: 'Multiple risk factors. May rate +50% or table 4. Awaiting stress test and full APS.',
    }}),
    // UW-0007: Park $3M UL (APP-0007) — declined by Chief UW
    prisma.underwritingCase.create({ data: {
      case_number: 'UW-2026-0007',
      application_id: extraApps[3].id,
      assigned_underwriter: uwMgr.employee_id,
      status: 'declined',
      risk_class: 'decline',
      bmi: 27.9,
      blood_pressure: '142/92',
      cholesterol: 260,
      medical_conditions: 'Elevated liver enzymes (ALT 3× normal), uncontrolled hypertension',
      medications: 'Multiple BP medications with poor compliance',
      family_history: 'Father with stroke at 52, mother with diabetes',
      decision_notes: 'Declined — liver function abnormality with hypertension and poor medication compliance. Recommend reapplication after 12 months with improved labs.',
      decided_at: new Date('2026-03-25T14:00:00Z'),
    }}),
    // UW-0008: Wilson Whole Life $250K (APP-0008) — approved by Underwriter (clean case)
    prisma.underwritingCase.create({ data: {
      case_number: 'UW-2026-0008',
      application_id: extraApps[4].id,
      assigned_underwriter: uw1.employee_id,
      status: 'approved',
      risk_class: 'preferred_plus',
      bmi: 24.5,
      blood_pressure: '112/72',
      cholesterol: 165,
      medical_conditions: 'None',
      medications: 'Multivitamin only',
      family_history: 'No known hereditary concerns',
      decision_notes: 'Excellent health profile. Approved preferred plus — lowest rate band. All requirements received and clean.',
      decided_at: new Date('2026-03-28T09:15:00Z'),
    }}),
  ]);

  await prisma.underwritingRequirement.createMany({
    data: [
      // UW-0004 requirements
      { case_id: extraUwCases[0].id, description: 'APS from Dr. Rivera — family cancer history review',   requirement_type: 'attending_physician', status: 'pending',  due_date: new Date('2026-04-12') },
      { case_id: extraUwCases[0].id, description: 'Mammogram results (preventive screening)',              requirement_type: 'medical_exam',        status: 'pending',  due_date: new Date('2026-04-15') },
      { case_id: extraUwCases[0].id, description: 'Standard paramedical exam',                             requirement_type: 'medical_exam',        status: 'received', received_at: new Date('2026-04-01T10:00:00Z') },
      // UW-0005 requirements (referred — reinsurer review)
      { case_id: extraUwCases[1].id, description: 'Reinsurer facultative application submitted',           requirement_type: 'other',               status: 'pending',  due_date: new Date('2026-04-20'), notes: 'Submitted to Munich Re for $750K UL' },
      { case_id: extraUwCases[1].id, description: 'Financial justification — income verification',         requirement_type: 'inspection',          status: 'received', received_at: new Date('2026-04-03T16:00:00Z') },
      // UW-0006 requirements (multiple risk factors)
      { case_id: extraUwCases[2].id, description: 'Cardiac stress test (treadmill)',                       requirement_type: 'medical_exam',        status: 'pending',  due_date: new Date('2026-04-18') },
      { case_id: extraUwCases[2].id, description: 'APS from Dr. Patel — BP and cholesterol management',   requirement_type: 'attending_physician', status: 'pending',  due_date: new Date('2026-04-20') },
      { case_id: extraUwCases[2].id, description: 'Prescription history — verify medication compliance',   requirement_type: 'records',             status: 'received', received_at: new Date('2026-04-04T09:30:00Z') },
      { case_id: extraUwCases[2].id, description: 'Financial inspection — $2M coverage justification',     requirement_type: 'inspection',          status: 'received', received_at: new Date('2026-04-02T14:00:00Z') },
      // UW-0007 requirements (declined — all received before decline)
      { case_id: extraUwCases[3].id, description: 'Comprehensive metabolic panel with liver enzymes',      requirement_type: 'lab_work',            status: 'received', received_at: new Date('2026-03-05T11:00:00Z'), notes: 'ALT 142 U/L (normal <40). Flagged.' },
      { case_id: extraUwCases[3].id, description: 'APS from Dr. Kim — hypertension treatment history',    requirement_type: 'attending_physician', status: 'received', received_at: new Date('2026-03-12T10:00:00Z'), notes: 'Poor medication adherence documented.' },
      { case_id: extraUwCases[3].id, description: 'Paramedical exam',                                      requirement_type: 'medical_exam',        status: 'received', received_at: new Date('2026-03-02T14:00:00Z') },
      // UW-0008 requirements (all clean — approved quickly)
      { case_id: extraUwCases[4].id, description: 'Paramedical exam — standard panel',                     requirement_type: 'medical_exam',        status: 'received', received_at: new Date('2026-03-20T10:00:00Z') },
      { case_id: extraUwCases[4].id, description: 'MIB check',                                             requirement_type: 'records',             status: 'received', received_at: new Date('2026-03-18T08:00:00Z'), notes: 'No prior hits.' },
    ],
  });
  console.log(`✅ Additional UW Cases seeded: ${extraUwCases.length} cases with requirements`);

  // 3 more policies
  const extraPolicyRecords = await Promise.all([
    prisma.record.create({ data: { object_id: policyObject.id, created_by: admin.employee_id, assigned_to: manager1.employee_id } }),
    prisma.record.create({ data: { object_id: policyObject.id, created_by: admin.employee_id, assigned_to: user2.employee_id } }),
    prisma.record.create({ data: { object_id: policyObject.id, created_by: admin.employee_id, assigned_to: user1.employee_id } }),
  ]);
  const extraPolicies = await Promise.all([
    prisma.insurancePolicy.create({ data: {
      record_id: extraPolicyRecords[0].id, policy_number: 'POL-2026-00014',
      carrier_id: carriers[0].id, carrier_product_id: carrierProducts[1].id,
      contact_id: contacts[2].id, account_id: accounts[2].id, agent_id: manager1.employee_id,
      product_type: 'whole_life', product_name: 'Guardian SecureLife WL',
      coverage_amount: 500000, premium_amount: 3200, premium_frequency: 'annual',
      status: 'pending', effective_date: new Date('2026-05-15'),
      renewal_due_date: new Date('2027-05-15'), death_benefit: 500000,
      notes: 'Conditional issue pending paramedical results.',
      created_by: admin.employee_id,
    }}),
    prisma.insurancePolicy.create({ data: {
      record_id: extraPolicyRecords[1].id, policy_number: 'POL-2026-00015',
      carrier_id: carriers[1].id, carrier_product_id: carrierProducts[2].id,
      contact_id: contacts[3].id, agent_id: user2.employee_id,
      product_type: 'universal_life', product_name: 'Summit Flex Universal Life',
      coverage_amount: 750000, premium_amount: 2100, premium_frequency: 'monthly',
      status: 'active', effective_date: new Date('2026-03-01'),
      renewal_due_date: new Date('2027-02-28'), death_benefit: 750000,
      last_payment_date: new Date('2026-04-01'),
      notes: 'Issued at standard. Flexible premium in force.',
      created_by: admin.employee_id,
    }}),
    prisma.insurancePolicy.create({ data: {
      record_id: extraPolicyRecords[2].id, policy_number: 'POL-2026-00016',
      carrier_id: carriers[0].id, carrier_product_id: carrierProducts[0].id,
      contact_id: contacts[0].id, account_id: accounts[0].id, agent_id: user1.employee_id,
      product_type: 'term_life', product_name: 'Guardian SecureTerm 20',
      coverage_amount: 250000, premium_amount: 1850, premium_frequency: 'annual',
      status: 'active', effective_date: new Date('2026-04-05'),
      expiry_date: new Date('2046-04-05'), renewal_due_date: new Date('2027-04-01'),
      death_benefit: 250000, last_payment_date: new Date('2026-04-05'),
      notes: 'Supplemental term policy stacked on existing UL.',
      created_by: admin.employee_id,
    }}),
  ]);
  await prisma.insurancePolicyBeneficiary.createMany({ data: [
    { policy_id: extraPolicies[0].id, name: 'Sarah Johnson Trust', relationship: 'trust', beneficiary_type: 'primary', allocation_pct: 100, is_active: true },
    { policy_id: extraPolicies[1].id, name: 'Kevin Chen', relationship: 'spouse', beneficiary_type: 'primary', allocation_pct: 80, is_active: true },
    { policy_id: extraPolicies[1].id, name: 'Chen Family Trust', relationship: 'trust', beneficiary_type: 'contingent', allocation_pct: 20, is_active: true },
    { policy_id: extraPolicies[2].id, name: 'Emily Wilson', relationship: 'spouse', beneficiary_type: 'primary', allocation_pct: 100, is_active: true },
  ]});
  console.log(`✅ Additional Insurance Policies seeded: ${extraPolicies.length} more policies`);

  // 3 more claims
  const extraClaimRecords = await Promise.all([
    prisma.record.create({ data: { object_id: claimObject.id, created_by: admin.employee_id, assigned_to: manager1.employee_id } }),
    prisma.record.create({ data: { object_id: claimObject.id, created_by: admin.employee_id, assigned_to: user1.employee_id } }),
    prisma.record.create({ data: { object_id: claimObject.id, created_by: admin.employee_id, assigned_to: user2.employee_id } }),
  ]);
  const extraClaims = await Promise.all([
    prisma.insuranceClaim.create({ data: {
      record_id: extraClaimRecords[0].id, claim_number: 'CLM-2026-0003',
      policy_id: extraPolicies[1].id, contact_id: contacts[3].id,
      claim_type: 'disability', amount: 75000, status: 'approved',
      priority: 'medium', adjuster_id: manager1.employee_id,
      filed_at: new Date('2026-03-15T10:00:00Z'),
      description: 'Short-term disability claim. Medical documentation complete.',
      created_by: admin.employee_id,
    }}),
    prisma.insuranceClaim.create({ data: {
      record_id: extraClaimRecords[1].id, claim_number: 'CLM-2026-0004',
      policy_id: extraPolicies[0].id, contact_id: contacts[2].id,
      claim_type: 'disability', amount: 9600, status: 'filed',
      priority: 'low', adjuster_id: user1.employee_id,
      filed_at: new Date('2026-04-18T14:30:00Z'),
      description: 'Disability claim filed due to temporary disability. Premium waiver requested.',
      created_by: admin.employee_id,
    }}),
    prisma.insuranceClaim.create({ data: {
      record_id: extraClaimRecords[2].id, claim_number: 'CLM-2026-0005',
      policy_id: extraPolicies[2].id, contact_id: contacts[0].id,
      claim_type: 'death', amount: 250000, status: 'paid',
      priority: 'high', adjuster_id: user2.employee_id,
      filed_at: new Date('2026-02-10T09:00:00Z'),
      description: 'Death benefit claim — beneficiary verified, payment processed.',
      paid_at: new Date('2026-03-01T12:00:00Z'), paid_amount: 250000,
      created_by: admin.employee_id,
    }}),
  ]);
  await prisma.claimEvent.createMany({ data: [
    { claim_id: extraClaims[0].id, event_type: 'approved', description: 'Claim approved after medical review', created_by: manager1.employee_id },
    { claim_id: extraClaims[0].id, event_type: 'payment_issued', description: 'Payment of $75,000 issued to claimant', created_by: manager1.employee_id },
    { claim_id: extraClaims[1].id, event_type: 'filed', description: 'Claim received and assigned to adjuster', created_by: user1.employee_id },
    { claim_id: extraClaims[2].id, event_type: 'filed', description: 'Claim filed by beneficiary', created_by: user1.employee_id },
    { claim_id: extraClaims[2].id, event_type: 'document_received', description: 'Death certificate and beneficiary ID verified', created_by: user2.employee_id },
    { claim_id: extraClaims[2].id, event_type: 'payment_issued', description: 'Full death benefit of $250,000 wired to beneficiary', created_by: user2.employee_id },
  ]});
  console.log(`✅ Additional Insurance Claims seeded: ${extraClaims.length} more claims`);

  // 5 more commission entries across agents and policies
  await prisma.commissionEntry.createMany({ data: [
    {
      agent_id: user1.employee_id, policy_id: extraPolicies[2].id,
      carrier_id: carriers[0].id, product_type: 'term_life',
      source_premium: 1850, commission_rate: 55, commission_amount: 1017.50,
      commission_period: commissionPeriod, status: 'paid',
      paid_at: new Date('2026-04-10T10:00:00Z'),
      notes: 'First-year commission on supplemental term policy.', created_by: admin.employee_id,
    },
    {
      agent_id: user2.employee_id, policy_id: extraPolicies[1].id,
      carrier_id: carriers[1].id, product_type: 'universal_life',
      source_premium: 2100, commission_rate: 35, commission_amount: 735,
      commission_period: commissionPeriod, status: 'approved',
      notes: 'Commission approved, awaiting month-end batch.', created_by: admin.employee_id,
    },
    {
      agent_id: manager1.employee_id, policy_id: extraPolicies[0].id,
      carrier_id: carriers[0].id, product_type: 'whole_life',
      source_premium: 3200, commission_rate: 40, commission_amount: 1280,
      commission_period: commissionPeriod, status: 'pending',
      notes: 'Conditional issue — pending final paramedical clearance.', created_by: admin.employee_id,
    },
    {
      agent_id: user1.employee_id, policy_id: policies[1 /* UL */]?.id ?? extraPolicies[1].id,
      carrier_id: carriers[1].id, product_type: 'universal_life',
      source_premium: 3840, commission_rate: 20, commission_amount: 768,
      commission_period: commissionPeriod, status: 'paid',
      paid_at: new Date('2026-04-20T09:00:00Z'),
      split_agent_id: manager1.employee_id, split_percent: 10,
      notes: 'Renewal year 2 commission with manager split.', created_by: admin.employee_id,
    },
    {
      agent_id: manager1.employee_id, application_id: extraApps[2].id,
      carrier_id: carriers[0].id, product_type: 'term_life',
      source_premium: 4800, commission_rate: 50, commission_amount: 2400,
      commission_period: commissionPeriod, status: 'pending',
      notes: 'Key-person term — commission held pending issue.', created_by: admin.employee_id,
    },
  ]});
  console.log('✅ Additional Commission Entries seeded: 5 more entries (8 total)');

  // ── Declaration Demo Records ─────────────────────────────────────────────
  const declRecords = await Promise.all([
    prisma.record.create({ data: { object_id: declarationObject.id, created_by: admin.employee_id, assigned_to: user1.employee_id } }),
    prisma.record.create({ data: { object_id: declarationObject.id, created_by: admin.employee_id, assigned_to: user2.employee_id } }),
    prisma.record.create({ data: { object_id: declarationObject.id, created_by: admin.employee_id, assigned_to: user1.employee_id } }),
    prisma.record.create({ data: { object_id: declarationObject.id, created_by: admin.employee_id, assigned_to: manager1.employee_id } }),
    prisma.record.create({ data: { object_id: declarationObject.id, created_by: admin.employee_id, assigned_to: user2.employee_id } }),
  ]);
  console.log(`✅ Declaration records seeded: ${declRecords.length} records`);

  // ── Document Collection Demo Records ───────────────────────────────────
  const docRecords = await Promise.all([
    prisma.record.create({ data: { object_id: appDocObject.id, created_by: admin.employee_id, assigned_to: user1.employee_id } }),
    prisma.record.create({ data: { object_id: appDocObject.id, created_by: admin.employee_id, assigned_to: user2.employee_id } }),
    prisma.record.create({ data: { object_id: appDocObject.id, created_by: admin.employee_id, assigned_to: manager1.employee_id } }),
    prisma.record.create({ data: { object_id: appDocObject.id, created_by: admin.employee_id, assigned_to: user1.employee_id } }),
    prisma.record.create({ data: { object_id: appDocObject.id, created_by: admin.employee_id, assigned_to: user2.employee_id } }),
    prisma.record.create({ data: { object_id: appDocObject.id, created_by: admin.employee_id, assigned_to: manager1.employee_id } }),
  ]);
  console.log(`✅ Document Collection records seeded: ${docRecords.length} records`);

  // ── Seed EAV field values for insurance metadata-driven records ────────────
  // The CRM list/table views use record_field_values to populate data columns.
  // Without this, the ModulePage tables show "--" for every field.
  async function seedEav(defs) {
    const rows = [];
    for (const { record_id, fields } of defs) {
      for (const [field_name, val] of Object.entries(fields)) {
        if (val == null) continue;
        const row = { record_id, field_name, tenant_id: T };
        if (typeof val === 'number')      { row.num_value = val; row.str_value = String(val); }
        else if (typeof val === 'boolean') { row.bool_value = val; row.str_value = String(val); }
        else                               { row.str_value = String(val); }
        rows.push(row);
      }
    }
    if (rows.length) await prisma.recordFieldValue.createMany({ data: rows, skipDuplicates: true });
  }

  // Application records — match ALL form fields in application create form
  const allAppRecords = [...insuranceAppRecords, ...extraAppRecords];
  const allApps = [...insuranceApps, ...extraApps];
  const appMedicalStatuses = ['completed', 'completed', 'not_required', 'scheduled', 'not_required', 'not_required', 'completed', 'completed'];
  const appMedicalDates = ['2026-03-10', '2026-03-18', '', '2026-04-05', '', '', '2026-02-25', '2026-03-08'];
  const appDecisionDates = ['2026-03-18', '', '', '', '', '', '2026-03-05', '2026-03-15'];
  await seedEav(allApps.map((app, i) => ({
    record_id: allAppRecords[i].id,
    fields: {
      application_number: app.app_number,
      applicant_name: `${contacts.find(c => c.id === app.contact_id)?.first_name ?? ''} ${contacts.find(c => c.id === app.contact_id)?.last_name ?? ''}`.trim() || 'Unknown',
      product_type: app.product_type ?? '',
      coverage_amount: Number(app.coverage_amount),
      premium: Number(app.premium_amount ?? 0),
      status: app.status,
      submitted_date: app.submitted_at ? app.submitted_at.toISOString().slice(0, 10) : '',
      underwriter: app.agent_id ?? '',
      medical_exam_date: appMedicalDates[i] || null,
      medical_exam_status: appMedicalStatuses[i] || 'not_required',
      decision_date: appDecisionDates[i] || null,
      decision_notes: app.notes ?? '',
    },
  })));
  console.log(`✅ Application EAV fields seeded: ${allApps.length} records`);

  // Policy records — match ALL form fields in policy create form
  const allPolicyRecords = [...policyRecords, ...extraPolicyRecords];
  const allPolicies = [...policies, ...extraPolicies];
  const policyBeneficiaryNames = ['Emily Thompson', 'Park Family Trust', 'Sarah Johnson Trust', 'Kevin Chen', 'Emily Wilson'];
  const policyPaymentMethods = ['bank_draft', 'bank_draft', 'check', 'bank_draft', 'bank_draft'];
  const policyCashValues = [0, 45000, 12000, 8500, 0]; // term=0, UL/WL have cash value
  await seedEav(allPolicies.map((pol, i) => ({
    record_id: allPolicyRecords[i].id,
    fields: {
      policy_number: pol.policy_number,
      policyholder: `${contacts.find(c => c.id === pol.contact_id)?.first_name ?? ''} ${contacts.find(c => c.id === pol.contact_id)?.last_name ?? ''}`.trim() || 'Unknown',
      product_type: pol.product_type ?? '',
      coverage_amount: Number(pol.coverage_amount),
      premium_monthly: pol.premium_frequency === 'monthly' ? Number(pol.premium_amount) : Math.round(Number(pol.premium_amount) / 12),
      premium_annual: pol.premium_frequency === 'annual' ? Number(pol.premium_amount) : Number(pol.premium_amount) * 12,
      status: pol.status,
      effective_date: pol.effective_date ? pol.effective_date.toISOString().slice(0, 10) : '',
      expiry_date: pol.expiry_date ? pol.expiry_date.toISOString().slice(0, 10) : '',
      beneficiary: policyBeneficiaryNames[i] ?? '',
      payment_method: policyPaymentMethods[i] ?? 'bank_draft',
      next_payment_date: pol.renewal_due_date ? pol.renewal_due_date.toISOString().slice(0, 10) : '',
      cash_value: policyCashValues[i] ?? 0,
      notes: pol.notes ?? '',
    },
  })));
  console.log(`✅ Policy EAV fields seeded: ${allPolicies.length} records`);

  // Claim records — match ALL form fields in claim create form
  const allClaimRecords = [...claimRecords, ...extraClaimRecords];
  const allClaims = [...claims, ...extraClaims];
  const claimDecisionDates = ['', '', '2026-03-25', '', '2026-02-28'];
  const claimDocsReceived = [true, false, true, false, true];
  await seedEav(allClaims.map((claim, i) => ({
    record_id: allClaimRecords[i].id,
    fields: {
      claim_number: claim.claim_number,
      policy_number: allPolicies.find(p => p.id === claim.policy_id)?.policy_number ?? '',
      claimant_name: `${contacts.find(c => c.id === claim.contact_id)?.first_name ?? ''} ${contacts.find(c => c.id === claim.contact_id)?.last_name ?? ''}`.trim() || 'Unknown',
      claim_type: claim.claim_type ?? '',
      claim_amount: Number(claim.amount),
      status: claim.status,
      filed_date: claim.filed_at ? claim.filed_at.toISOString().slice(0, 10) : '',
      decision_date: claimDecisionDates[i] || null,
      settlement_amount: claim.paid_amount ? Number(claim.paid_amount) : null,
      adjuster: claim.adjuster_id ?? '',
      documents_received: claimDocsReceived[i],
      notes: claim.description ?? '',
    },
  })));
  console.log(`✅ Claim EAV fields seeded: ${allClaims.length} records`);

  // Prospect EAV — ALL form fields need EAV rows so list views display data
  // instead of "--". Includes both CRM-native fields and custom form fields.
  await seedEav(crmLeads.map((lead, i) => ({
    record_id: prospectAnchorRecords[i].id,
    fields: {
      first_name: lead.first_name,
      last_name: lead.last_name,
      full_name: `${lead.first_name} ${lead.last_name}`,
      email: lead.email,
      phone: lead.phone ?? '',
      mobile: '',
      date_of_birth: ['1987-03-15', '1992-08-22', '1979-11-04', '1990-03-29', '1986-07-10'][i],
      age: [39, 33, 46, 35, 39][i],
      gender: ['male', 'female', 'male', 'female', 'male'][i],
      smoker_status: 'never',
      occupation: lead.job_title ?? '',
      annual_income: lead.annual_revenue ? Number(lead.annual_revenue) : 0,
      lead_source: lead.lead_source ?? '',
      lead_status: lead.lead_status ?? 'new',
      rating: lead.rating ?? '',
      preferred_product: ['term_life', 'whole_life', 'universal_life', 'term_life', 'whole_life'][i] ?? 'term_life',
      coverage_interest: [500000, 250000, 2000000, 1000000, 1000000][i] ?? 0,
      health_notes: lead.description ?? '',
      notes: '',
    },
  })));
  console.log(`✅ Prospect EAV fields seeded: ${crmLeads.length} records`);

  // Quote EAV — ALL form fields need EAV for display in metadata-driven list views.
  const quoteRiders = [
    'Accidental Death Rider',
    'Waiver of Premium Rider',
    'Business Continuation Rider',
  ];
  const quoteUwClasses = ['preferred_plus', 'standard', 'preferred'];
  await seedEav(quotes.map((q, i) => ({
    record_id: quoteRecords[i].id,
    fields: {
      quote_number: q.quote_number,
      client_name: q.name?.split(' Quote')[0] ?? '',
      product_type: ['term_life', 'universal_life', 'term_life'][i],
      coverage_amount: [1000000, 2000000, 500000][i],
      term_years: [20, 0, 20][i] || null,
      monthly_premium: Math.round(Number(q.total_amount) / 12),
      annual_premium: Number(q.total_amount),
      status: q.status,
      valid_until: q.valid_until?.toISOString().slice(0, 10) ?? '',
      riders: quoteRiders[i] ?? '',
      underwriting_class: quoteUwClasses[i] ?? 'standard',
      notes: q.notes ?? '',
    },
  })));
  console.log(`✅ Quote EAV fields seeded: ${quotes.length} records`);

  // Declaration EAV — populate all form fields so list views show data
  const declEavDefs = [
    { declaration_number: 'DCL-2026-0001', declaration_type: 'hipaa_authorization',    applicant_name: 'James Wilson',   app_number: 'APP-2026-0001', status: 'accepted', delivery_method: 'email',     sent_at: '2026-03-06T10:00:00', viewed_at: '2026-03-06T14:22:00', accepted_at: '2026-03-06T14:30:00', signed_by: 'James Wilson',   ip_address: '72.45.123.8',    notes: '' },
    { declaration_number: 'DCL-2026-0002', declaration_type: 'replacement_disclosure', applicant_name: 'David Park',     app_number: 'APP-2026-0002', status: 'sent',     delivery_method: 'portal',    sent_at: '2026-03-13T09:00:00', viewed_at: '',                    accepted_at: '',                   signed_by: '',               ip_address: '',                notes: 'Awaiting client review.' },
    { declaration_number: 'DCL-2026-0003', declaration_type: 'suitability_statement',  applicant_name: 'Sarah Johnson',  app_number: 'APP-2026-0003', status: 'accepted', delivery_method: 'in_person',  sent_at: '2026-03-21T11:00:00', viewed_at: '2026-03-21T11:05:00', accepted_at: '2026-03-21T11:15:00', signed_by: 'Sarah Johnson',  ip_address: '192.168.1.50',   notes: 'Signed in office during application meeting.' },
    { declaration_number: 'DCL-2026-0004', declaration_type: 'privacy_notice',         applicant_name: 'James Wilson',   app_number: 'APP-2026-0001', status: 'accepted', delivery_method: 'email',     sent_at: '2026-03-06T10:00:00', viewed_at: '2026-03-06T14:35:00', accepted_at: '2026-03-06T14:36:00', signed_by: 'James Wilson',   ip_address: '72.45.123.8',    notes: '' },
    { declaration_number: 'DCL-2026-0005', declaration_type: 'fraud_warning',          applicant_name: 'Lisa Chen',      app_number: 'APP-2026-0005', status: 'pending',  delivery_method: 'email',     sent_at: '',                     viewed_at: '',                    accepted_at: '',                   signed_by: '',               ip_address: '',                notes: 'Queued for delivery.' },
  ];
  await seedEav(declEavDefs.map((d, i) => ({
    record_id: declRecords[i].id,
    fields: { ...d, content: '', signature_hash: '' },
  })));
  console.log(`✅ Declaration EAV fields seeded: ${declEavDefs.length} records`);

  // Document Collection EAV — populate all form fields so list views show data
  const docEavDefs = [
    { document_number: 'DOC-2026-0001', filename: 'wilson_drivers_license.pdf',  category: 'government_id',        applicant_name: 'James Wilson',   app_number: 'APP-2026-0001', status: 'approved',     mime_type: 'application/pdf', file_size: 245000,  uploaded_at: '2026-03-07T09:15:00', uploaded_by: user1.employee_id, reviewed_by: manager1.employee_id, reviewed_at: '2026-03-08T10:00:00', rejection_reason: '', notes: '' },
    { document_number: 'DOC-2026-0002', filename: 'wilson_w2_2025.pdf',          category: 'proof_of_income',      applicant_name: 'James Wilson',   app_number: 'APP-2026-0001', status: 'approved',     mime_type: 'application/pdf', file_size: 182000,  uploaded_at: '2026-03-07T09:20:00', uploaded_by: user1.employee_id, reviewed_by: manager1.employee_id, reviewed_at: '2026-03-08T10:05:00', rejection_reason: '', notes: '' },
    { document_number: 'DOC-2026-0003', filename: 'park_medical_records.pdf',    category: 'medical_records',      applicant_name: 'David Park',     app_number: 'APP-2026-0002', status: 'under_review', mime_type: 'application/pdf', file_size: 1520000, uploaded_at: '2026-03-15T14:00:00', uploaded_by: user2.employee_id, reviewed_by: '',                    reviewed_at: '',                    rejection_reason: '', notes: 'APS from Dr. Lee included.' },
    { document_number: 'DOC-2026-0004', filename: 'johnson_trust_docs.pdf',      category: 'trust_documents',      applicant_name: 'Sarah Johnson',  app_number: 'APP-2026-0003', status: 'uploaded',     mime_type: 'application/pdf', file_size: 890000,  uploaded_at: '2026-03-22T16:30:00', uploaded_by: manager1.employee_id, reviewed_by: '',                 reviewed_at: '',                    rejection_reason: '', notes: 'TechStart LLC trust agreement.' },
    { document_number: 'DOC-2026-0005', filename: 'chen_income_verification.pdf',category: 'financial_statement',  applicant_name: 'Lisa Chen',      app_number: 'APP-2026-0005', status: 'pending',      mime_type: 'application/pdf', file_size: 0,       uploaded_at: '',                     uploaded_by: '',                   reviewed_by: '',                    reviewed_at: '',                    rejection_reason: '', notes: 'Requested via email.' },
    { document_number: 'DOC-2026-0006', filename: 'brown_lab_results.pdf',       category: 'lab_results',          applicant_name: 'Michael Brown',  app_number: 'APP-2026-0006', status: 'rejected',     mime_type: 'application/pdf', file_size: 340000,  uploaded_at: '2026-04-05T11:00:00', uploaded_by: user2.employee_id, reviewed_by: srUw.employee_id,      reviewed_at: '2026-04-06T09:00:00', rejection_reason: 'Illegible scan — please reupload at higher resolution.', notes: '' },
  ];
  await seedEav(docEavDefs.map((d, i) => ({
    record_id: docRecords[i].id,
    fields: d,
  })));
  console.log(`✅ Document Collection EAV fields seeded: ${docEavDefs.length} records`);

  // Opportunity-backed application records (oppRecords) — these 3 records
  // use crm_opportunity as their CRM entity, but the application form
  // expects ALL application-specific fields. Add complete EAV so they show in lists.
  const oppProductTypes = ['term_life', 'universal_life', 'term_life'];
  const oppPremiums = [45000, 85000, 32000];
  await seedEav(opportunities.map((opp, i) => ({
    record_id: oppRecords[i].id,
    fields: {
      application_number: `OPP-${opp.name?.slice(0, 20) ?? i}`,
      applicant_name: opp.name ?? 'Unknown',
      product_type: oppProductTypes[i],
      coverage_amount: Number(opp.amount ?? 0),
      premium: oppPremiums[i],
      status: opp.stage === 'closed_won' ? 'issued' : 'submitted',
      submitted_date: opp.close_date ? opp.close_date.toISOString().slice(0, 10) : '',
      underwriter: '',
      medical_exam_date: null,
      medical_exam_status: 'not_required',
      decision_date: opp.is_closed ? opp.close_date.toISOString().slice(0, 10) : null,
      decision_notes: opp.is_won ? 'Approved and issued.' : '',
    },
  })));
  console.log(`✅ Opportunity-as-Application EAV fields seeded: ${opportunities.length} records`);

  // Underwriting case record anchors + EAV
  const uwRecords = await Promise.all(
    uwCases.map(uw =>
      prisma.record.create({ data: {
        object_id: underwritingObject.id,
        created_by: admin.employee_id,
        assigned_to: uw.assigned_underwriter ?? manager1.employee_id,
      }})
    )
  );
  await seedEav(uwCases.map((uw, i) => {
    const relatedApp = allApps.find(a => a.id === uw.application_id);
    const relatedContact = relatedApp ? contacts.find(c => c.id === relatedApp.contact_id) : null;
    return {
      record_id: uwRecords[i].id,
      fields: {
        case_number: uw.case_number,
        applicant_name: relatedContact ? `${relatedContact.first_name} ${relatedContact.last_name}` : (relatedApp?.product_name ?? 'Unknown'),
        product_type: relatedApp?.product_type ?? '',
        coverage_amount: Number(relatedApp?.coverage_amount ?? 0),
        risk_class: uw.risk_class ?? 'standard',
        status: uw.status,
        assigned_underwriter: uw.assigned_underwriter ?? '',
        medical_history: uw.medical_conditions ?? 'None disclosed',
        risk_factors: [
          uw.blood_pressure ? `BP: ${uw.blood_pressure}` : '',
          uw.bmi ? `BMI: ${uw.bmi}` : '',
          uw.cholesterol ? `Cholesterol: ${uw.cholesterol}` : '',
          uw.family_history ?? '',
        ].filter(Boolean).join('; ') || 'None',
        decision: uw.decision_notes ?? '',
        decision_date: uw.decided_at ? uw.decided_at.toISOString().slice(0, 10) : null,
        notes: uw.decision_notes ?? '',
      },
    };
  }));
  // Extra UW case record anchors + EAV
  const extraUwRecords = await Promise.all(
    extraUwCases.map(uw =>
      prisma.record.create({ data: {
        object_id: underwritingObject.id,
        created_by: admin.employee_id,
        assigned_to: uw.assigned_underwriter ?? uwMgr.employee_id,
      }})
    )
  );
  await seedEav(extraUwCases.map((uw, i) => {
    const relatedApp = allApps.find(a => a.id === uw.application_id);
    const relatedContact = relatedApp ? contacts.find(c => c.id === relatedApp.contact_id) : null;
    return {
      record_id: extraUwRecords[i].id,
      fields: {
        case_number: uw.case_number,
        applicant_name: relatedContact ? `${relatedContact.first_name} ${relatedContact.last_name}` : (relatedApp?.product_name ?? 'Unknown'),
        product_type: relatedApp?.product_type ?? '',
        coverage_amount: Number(relatedApp?.coverage_amount ?? 0),
        risk_class: uw.risk_class ?? 'standard',
        status: uw.status,
        assigned_underwriter: uw.assigned_underwriter ?? '',
        medical_history: uw.medical_conditions ?? 'None disclosed',
        risk_factors: [
          uw.blood_pressure ? `BP: ${uw.blood_pressure}` : '',
          uw.bmi ? `BMI: ${uw.bmi}` : '',
          uw.cholesterol ? `Cholesterol: ${uw.cholesterol}` : '',
          uw.family_history ?? '',
        ].filter(Boolean).join('; ') || 'None',
        decision: uw.decision_notes ?? '',
        decision_date: uw.decided_at ? uw.decided_at.toISOString().slice(0, 10) : null,
        notes: uw.decision_notes ?? '',
      },
    };
  }));
  console.log(`✅ Underwriting Case EAV fields seeded: ${uwCases.length + extraUwCases.length} total records`);

  // Commission record anchors + EAV
  const allCommissions = await prisma.commissionEntry.findMany({ take: 8 });
  const commRecords = await Promise.all(
    allCommissions.map(c =>
      prisma.record.create({ data: {
        object_id: commissionObject.id,
        created_by: admin.employee_id,
        assigned_to: c.agent_id,
      }})
    )
  );
  // Map employee IDs to display names for commission agent_name
  const employeeNameMap = {
    [user1.employee_id]: user1.employee_name,
    [user2.employee_id]: user2.employee_name,
    [manager1.employee_id]: manager1.employee_name,
    [admin.employee_id]: admin.employee_name,
  };
  await seedEav(allCommissions.map((c, i) => ({
    record_id: commRecords[i].id,
    fields: {
      agent_name: employeeNameMap[c.agent_id] ?? c.agent_id,
      policy_number: allPolicies.find(p => p.id === c.policy_id)?.policy_number ?? '',
      product_type: c.product_type ?? '',
      premium_amount: Number(c.source_premium),
      commission_rate: Number(c.commission_rate),
      commission_amount: Number(c.commission_amount),
      status: c.status,
      payment_date: c.paid_at ? c.paid_at.toISOString().slice(0, 10) : null,
      period: c.commission_period ?? '',
      notes: c.notes ?? '',
    },
  })));
  console.log(`✅ Commission EAV fields seeded: ${allCommissions.length} records`);

  const leadJames = crmLeads[4]; // James Wilson — converted
  await prisma.crmLeadConversion.create({
    data: { lead_id: leadJames.id, account_id: accounts[0].id, contact_id: contacts[0].id, opportunity_id: opportunities[0].id, converted_by: user1.employee_id },
  });
  console.log('✅ CRM Lead Conversion: 1 conversion record seeded');

  // ── Activities ────────────────────────────────────────────────────────────
  const [rec1, rec2, rec3] = prospectAnchorRecords;
  const activityDefs = [
    { record_id: rec1.id, employee_id: user1.employee_id, type: 'call',  subject: 'Initial consultation with Robert Thompson', description: 'Discussed family situation: married, 2 kids under 5, new mortgage. Needs $500K term life minimum. Scheduled follow-up to review quote.', outcome: 'Positive — follow-up scheduled' },
    { record_id: rec2.id, employee_id: user2.employee_id, type: 'email', subject: 'Sent whole life illustration to Maria Garcia', description: 'Emailed whole life policy illustration with cash value projections and premium schedule. Highlighted guaranteed death benefit and tax-deferred growth.' },
    { record_id: rec3.id, employee_id: user1.employee_id, type: 'meeting', subject: 'Needs analysis meeting with Dr. Park', description: '45-minute needs analysis. High income ($280K), minimal existing coverage. Recommended $2M universal life + supplemental disability. Running illustrations.', outcome: 'Very positive — requesting formal proposal' },
  ];
  await Promise.all(activityDefs.map(a => prisma.activity.create({ data: a })));
  console.log(`✅ Activities seeded: ${activityDefs.length} entries`);

  // ── Tasks ─────────────────────────────────────────────────────────────────
  const now = new Date();
  const daysFromNow = (d) => new Date(now.getTime() + d * 86_400_000);
  const taskDefs = [
    { record_id: rec1.id, assigned_to: user1.employee_id, created_by: admin.employee_id, title: 'Prepare $500K term life quote for Robert Thompson',       priority: 'high',   status: 'open',        due_date: daysFromNow(2) },
    { record_id: rec2.id, assigned_to: user2.employee_id, created_by: admin.employee_id, title: 'Follow up with Maria Garcia on whole life illustration',  priority: 'normal', status: 'open',        due_date: daysFromNow(3) },
    { record_id: rec3.id, assigned_to: user1.employee_id, created_by: admin.employee_id, title: 'Send universal life proposal to Dr. David Park',          priority: 'urgent', status: 'in_progress', due_date: daysFromNow(1) },
  ];
  await Promise.all(taskDefs.map(t => prisma.task.create({ data: t })));
  console.log(`✅ Tasks seeded: ${taskDefs.length} tasks`);

  // ── SLA Engine: business hours, policies, sample cases & live timers ───────
  console.log('\n⏱️  Seeding SLA engine...');
  const hoursAgo = (h) => new Date(now.getTime() - h * 3_600_000);
  const daysAgo  = (d) => new Date(now.getTime() - d * 86_400_000);

  const bizHours = await prisma.slaBusinessHours.create({
    data: {
      name: 'Business Hours (Mon–Fri 9–5)', timezone_label: 'UTC', utc_offset_minutes: 0,
      weekly: { mon: [['09:00', '17:00']], tue: [['09:00', '17:00']], wed: [['09:00', '17:00']], thu: [['09:00', '17:00']], fri: [['09:00', '17:00']] },
      holidays: [], is_default: true,
    },
  });

  const makeSlaPolicy = async (spec) => {
    const p = await prisma.slaPolicy.create({
      data: {
        name: spec.name, description: spec.description || null, entity_type: spec.entity_type,
        order_index: spec.order_index || 0, is_active: true,
        conditions: spec.conditions || null, business_hours_id: bizHours.id,
      },
    });
    await prisma.slaTarget.createMany({ data: spec.targets.map(t => ({ policy_id: p.id, metric: t.metric, priority: t.priority || '*', target_minutes: t.target_minutes, warning_pct: t.warning_pct || 80 })) });
    await prisma.slaEscalation.createMany({ data: spec.escalations.map((e, i) => ({ policy_id: p.id, metric: e.metric || '*', trigger: e.trigger, action: e.action, order_index: i })) });
    return p;
  };

  await makeSlaPolicy({
    name: 'Critical / Priority Case SLA', entity_type: 'case', order_index: 0,
    description: 'Tighter response & resolution targets for high-value cases',
    conditions: [{ field: 'priority', op: 'in', value: 'critical,high' }],
    targets: [
      { metric: 'first_response', priority: 'critical', target_minutes: 30 },
      { metric: 'first_response', priority: 'high',     target_minutes: 120 },
      { metric: 'resolution',     priority: 'critical', target_minutes: 240 },
      { metric: 'resolution',     priority: 'high',     target_minutes: 480 },
    ],
    escalations: [
      { metric: '*',          trigger: 'warning', action: 'notify_owner' },
      { metric: '*',          trigger: 'breach',  action: 'notify_manager' },
      { metric: 'resolution', trigger: 'breach',  action: 'raise_priority' },
    ],
  });
  await makeSlaPolicy({
    name: 'Standard Case SLA', entity_type: 'case', order_index: 1,
    description: 'Default response & resolution for all other cases',
    targets: [
      { metric: 'first_response', priority: '*', target_minutes: 480 },
      { metric: 'resolution',     priority: '*', target_minutes: 2880 },
    ],
    escalations: [
      { metric: '*', trigger: 'warning', action: 'notify_owner' },
      { metric: '*', trigger: 'breach',  action: 'notify_manager' },
    ],
  });
  await makeSlaPolicy({
    name: 'Speed-to-Lead', entity_type: 'lead', order_index: 0,
    description: 'Contact new leads quickly — hotter leads get tighter windows',
    targets: [
      { metric: 'first_response', priority: 'hot',  target_minutes: 15 },
      { metric: 'first_response', priority: 'warm', target_minutes: 60 },
      { metric: 'first_response', priority: '*',    target_minutes: 240 },
    ],
    escalations: [
      { metric: 'first_response', trigger: 'warning', action: 'notify_owner' },
      { metric: 'first_response', trigger: 'breach',  action: 'notify_manager' },
    ],
  });
  await makeSlaPolicy({
    name: 'Task Due SLA', entity_type: 'task', order_index: 0,
    description: 'Complete tasks by their due date',
    targets: [
      { metric: 'resolution', priority: 'urgent', target_minutes: 60 },
      { metric: 'resolution', priority: 'high',   target_minutes: 240 },
      { metric: 'resolution', priority: '*',      target_minutes: 480 },
    ],
    escalations: [
      { metric: 'resolution', trigger: 'warning', action: 'notify_owner' },
      { metric: 'resolution', trigger: 'breach',  action: 'notify_manager' },
    ],
  });
  console.log('✅ SLA policies: 4 (2 case · 1 lead · 1 task) + business-hours calendar');

  // Sample support cases spanning every SLA state. The two "recently handled"
  // cases (marked with __resolve) start OPEN so the engine can time them, then
  // get resolved and re-reconciled — producing genuine met-on-time / met-late
  // history (and a real compliance %) instead of empty gauges.
  const caseDefs = [
    { subject: 'Billing discrepancy on policy POL-2026-00012', priority: 'critical', status: 'new',         type: 'billing',   origin: 'email', owner_id: user1.employee_id,    created_at: daysAgo(5) },
    { subject: 'Cannot access customer portal',                priority: 'high',     status: 'new',         type: 'technical', origin: 'web',   owner_id: user2.employee_id,    created_at: hoursAgo(2) },
    { subject: 'Claim status inquiry — CLM-2026-001',          priority: 'medium',   status: 'in_progress', type: 'claim',     origin: 'phone', owner_id: user1.employee_id,    created_at: daysAgo(1) },
    { subject: 'Policy document request',                      priority: 'high',     status: 'new',         type: 'service',   origin: 'email', owner_id: user2.employee_id,    created_at: hoursAgo(1.5), __resolve: 'Sent policy PDF to the client.' },
    { subject: 'Complaint about premium increase',             priority: 'critical', status: 'in_progress', type: 'complaint', origin: 'phone', owner_id: manager1.employee_id, created_at: daysAgo(6), __resolve: 'Explained the rate change; client retained.' },
    { subject: 'Address update request',                       priority: 'low',      status: 'new',         type: 'service',   origin: 'web',   owner_id: user2.employee_id,    created_at: hoursAgo(0.5) },
  ];
  const createdCases = await Promise.all(caseDefs.map(({ __resolve, ...c }) => prisma.crmCase.create({ data: c })));
  console.log(`✅ Sample support cases: ${createdCases.length}`);

  // Materialise live timers using the real engine (business-hours aware).
  const SlaService = require('../src/services/sla.service');
  const slaEngine = new SlaService(prisma);
  await slaEngine.reconcile();                                     // pass 1 — start every timer
  await Promise.all(
    caseDefs
      .map((def, i) => (def.__resolve
        ? prisma.crmCase.update({ where: { id: createdCases[i].id }, data: { status: 'resolved', resolution: def.__resolve } })
        : null))
      .filter(Boolean),
  );
  await slaEngine.reconcile();                                     // pass 2 — settle completions (met / met-late)
  const [timerTotal, timerBreached, timerMet] = await Promise.all([
    prisma.slaInstance.count(),
    prisma.slaInstance.count({ where: { status: 'breached' } }),
    prisma.slaInstance.count({ where: { status: 'met' } }),
  ]);
  console.log(`✅ SLA timers materialised: ${timerTotal} across cases · leads · tasks (${timerBreached} breached · ${timerMet} met)`);

  // ── Reporting: sample configurable reports ────────────────────────────────
  const VIZ_TYPE = { table: 'table', bar: 'chart', line: 'chart', pie: 'chart', kpi: 'summary', pivot: 'pivot' };
  const reportSamples = [
    { name: 'Pipeline by Stage', category: 'sales', description: 'Open opportunity value across pipeline stages', config: { source: 'opportunities', viz: 'bar', group_by: [{ field: 'stage' }], metrics: [{ agg: 'sum', field: 'amount', label: 'Total value' }, { agg: 'count', label: 'Deals' }] } },
    { name: 'Leads by Source', category: 'sales', description: 'Where leads come from', config: { source: 'leads', viz: 'pie', group_by: [{ field: 'lead_source' }], metrics: [{ agg: 'count', label: 'Leads' }] } },
    { name: 'Cases by Priority', category: 'support', description: 'Support case load by priority', config: { source: 'cases', viz: 'pie', group_by: [{ field: 'priority' }], metrics: [{ agg: 'count', label: 'Cases' }] } },
    { name: 'SLA Breaches by Record Type', category: 'support', description: 'Where SLAs are being missed', config: { source: 'sla', viz: 'bar', group_by: [{ field: 'entity_type' }], metrics: [{ agg: 'count', label: 'Timers' }], filters: [{ field: 'status', op: 'equals', value: 'breached' }] } },
    { name: 'Premium by Product', category: 'insurance', description: 'In-force premium by product type', config: { source: 'policies', viz: 'bar', group_by: [{ field: 'product_type' }], metrics: [{ agg: 'sum', field: 'premium_amount', label: 'Premium' }] } },
    { name: 'Commission Summary', category: 'finance', description: 'Headline commission numbers', config: { source: 'commissions', viz: 'kpi', metrics: [{ agg: 'sum', field: 'commission_amount', label: 'Total commission' }, { agg: 'avg', field: 'commission_rate', label: 'Avg rate' }, { agg: 'count', label: 'Entries' }] } },
    { name: 'All Leads', category: 'sales', description: 'Full lead list', config: { source: 'leads', viz: 'table', columns: ['first_name', 'last_name', 'company', 'lead_status', 'rating', 'lead_source'], sort: [{ key: 'last_name', dir: 'asc' }], limit: 200 } },
  ];
  await Promise.all(reportSamples.map(s => prisma.customReport.create({
    data: {
      name: s.name, description: s.description, category: s.category,
      report_type: VIZ_TYPE[s.config.viz] || 'table', data_source: s.config,
      fields: s.config.columns || s.config.metrics || [], filters: s.config.filters || [],
      grouping: s.config.group_by || [], sorting: s.config.sort || [],
      chart_config: { viz: s.config.viz, limit: s.config.limit || null },
      is_shared: true, shared_with: [], created_by: admin.employee_id,
    },
  })));
  console.log(`✅ Sample reports seeded: ${reportSamples.length}`);

  // ── Notifications ─────────────────────────────────────────────────────────
  const notifDefs = [
    { employee_id: user1.employee_id,    type: 'task_due',        title: 'Quote due tomorrow',                body: '"Prepare $500K term life quote for Robert Thompson" is due in 24 hours.' },
    { employee_id: user1.employee_id,    type: 'record_assigned', title: 'New application assigned',          body: 'Application APP-2026-003 for Sarah Johnson ($1M term life) has been assigned to you.' },
    { employee_id: manager1.employee_id, type: 'system',          title: 'New claim filed',                   body: 'Claim CLM-2026-001 filed against policy POL-2026-00012. Death benefit claim for $500,000.' },
    { employee_id: admin.employee_id,    type: 'system',          title: 'Welcome to Genesis Life Insurance CRM!', body: 'Your agency CRM has been set up with demo data. Explore Prospects, Policies, and Claims modules.' },
  ];
  await Promise.all(notifDefs.map(n => prisma.notification.create({ data: n })));
  console.log(`✅ Notifications seeded: ${notifDefs.length} entries`);

  // ── Audit Logs ────────────────────────────────────────────────────────────
  await Promise.all(
    prospectAnchorRecords.map(r =>
      prisma.auditLog.create({ data: { record_id: r.id, employee_id: admin.employee_id, action: 'create' } })
    )
  );
  console.log('✅ Audit logs seeded: 5 entries');

  // ── Demo Email Templates ──────────────────────────────────────────────────
  try {
    const EmailTemplateService = require('../src/services/email-template.service');
    const emailTplSvc = new EmailTemplateService(prisma);
    const demoTemplates = await emailTplSvc.createDefaultTemplates(admin.employee_id);
    console.log(`✅ Demo Email Templates: ${demoTemplates.length} templates seeded`);
  } catch (e) {
    console.log('⚠️  Email templates skipped:', e.message);
  }

  // ══════════════════════════════════════════════════════════════════════════════
  // PLATFORM ADMINISTRATION
  // ══════════════════════════════════════════════════════════════════════════════

  // Plan feature lists come from the catalogue's `min_plan` derivation rather
  // than four hand-maintained arrays, so Professional is guaranteed to be a
  // superset of Starter and a new catalogue entry lands in the right tiers
  // automatically. The previous literal lists ('basic_crm', 'workflow_automation',
  // ...) matched no feature flag and no code path, so they gated nothing.
  const { defaultFeaturesForPlan } = require('../src/services/platform/feature-catalogue');

  const planDefs = [
    { name: 'free',         label: 'Free',         description: 'Evaluate Genesis with a single-office team',                   price_monthly: 0,   price_annual: 0,    max_users: 3,   max_storage_mb: 100,   max_api_calls: 1000,   max_records: 1000,   max_workflows: 1,   max_dashboards: 1,   trial_days: 0,  order_index: 1 },
    { name: 'starter',      label: 'Starter',      description: 'Quoting and policy admin for a small agency',                  price_monthly: 29,  price_annual: 290,  max_users: 10,  max_storage_mb: 1000,  max_api_calls: 10000,  max_records: 10000,  max_workflows: 5,   max_dashboards: 3,   trial_days: 14, order_index: 2 },
    { name: 'professional', label: 'Professional', description: 'Underwriting, claims and automation for a growing agency',      price_monthly: 79,  price_annual: 790,  max_users: 50,  max_storage_mb: 5000,  max_api_calls: 50000,  max_records: 100000, max_workflows: 25,  max_dashboards: 10,  trial_days: 14, order_index: 3 },
    { name: 'enterprise',   label: 'Enterprise',   description: 'The full platform, with SSO, carrier feeds and AI assistance',  price_monthly: 199, price_annual: 1990, max_users: 999, max_storage_mb: 50000, max_api_calls: 500000, max_records: 999999, max_workflows: 999, max_dashboards: 999, trial_days: 30, order_index: 4 },
  ].map(def => ({ ...def, features: defaultFeaturesForPlan(def.name) }));
  for (const def of planDefs) {
    await prisma.subscriptionPlan.create({ data: def });
  }
  console.log('✅ Subscription Plans created (Free · Starter · Professional · Enterprise)');

  // A feature flag now adds *rollout control* on top of a plan entitlement, so
  // its `name` must be a catalogue key (or a legacy alias of one) to control
  // anything. Only catalogue entries marked `flag: true` get a row — a flag for
  // a feature we are not rolling out gradually is a switch nobody will ever
  // touch. `dark_mode` is dropped: it was never a sellable feature, it is a
  // per-user appearance preference, and it gated nothing.
  const { FEATURES } = require('../src/services/platform/feature-catalogue');
  const flagDefs = FEATURES.filter(x => x.flag).map(x => ({
    // Keep the pre-catalogue name where deployed rows and code call sites
    // already use it (`underwriting_workflow`), so nothing needs migrating.
    name:            x.legacy ?? x.key,
    label:           x.label,
    description:     x.description,
    category:        x.min_plan === 'enterprise' ? 'premium' : 'general',
    // Shipped and fully rolled out unless we deliberately say otherwise; the
    // plan is what decides who has bought it.
    is_enabled:      true,
    rollout_percent: 100,
    created_by:      platform.employee_id,
  }));
  // API v2 is genuinely mid-rollout — the one flag whose row is not a no-op.
  const apiV2 = flagDefs.find(f => f.name === 'api_v2');
  if (apiV2) { apiV2.is_enabled = false; apiV2.rollout_percent = 10; apiV2.category = 'beta'; }
  for (const def of flagDefs) {
    await prisma.featureFlag.create({ data: def });
  }
  console.log(`✅ Feature Flags created (${flagDefs.length} rollout-controlled features)`);

  // Temporarily disable tenant scoping for platform-level seeding
  tenantContext.enterWith({ tenantId: null });

  await prisma.tenantConfig.createMany({
    data: [
      { tenant_id: defaultTenant.id, config_key: 'branding_logo',               config_value: '/logo.svg',  updated_by: platform.employee_id },
      { tenant_id: defaultTenant.id, config_key: 'default_currency',            config_value: 'USD',        updated_by: platform.employee_id },
      { tenant_id: defaultTenant.id, config_key: 'date_format',                 config_value: 'MM/DD/YYYY', updated_by: platform.employee_id },
      { tenant_id: defaultTenant.id, config_key: 'enable_email_notifications',  config_value: 'true',       updated_by: platform.employee_id },
    ],
  });

  const currentMonth = new Date().toISOString().slice(0, 7);
  await prisma.tenantUsage.createMany({
    data: [
      { tenant_id: defaultTenant.id, metric: 'api_calls',    value: 2100,  period: currentMonth, period_type: 'monthly' },
      { tenant_id: defaultTenant.id, metric: 'active_users', value: 4,     period: currentMonth, period_type: 'monthly' },
      { tenant_id: defaultTenant.id, metric: 'storage_mb',   value: 85.3,  period: currentMonth, period_type: 'monthly' },
      { tenant_id: defaultTenant.id, metric: 'records',      value: 120,   period: currentMonth, period_type: 'monthly' },
    ],
  });
  console.log('✅ Default Tenant Config & Usage seeded');

  await prisma.systemAnnouncement.create({
    data: {
      title: 'Welcome to Genesis Life Insurance CRM',
      message: 'Your Life Insurance CRM has been successfully deployed. Explore Prospects, Clients, Quotes, Applications, Policies, Claims, Underwriting, and Commissions modules. Use the Builder to customize forms and workflows.',
      severity: 'info',
      type: 'banner',
      target: 'all',
      is_active: true,
      is_dismissible: true,
      active_from: new Date(),
      created_by: platform.employee_id,
    },
  });
  console.log('✅ System Announcement created');

  await prisma.securityPolicy.create({
    data: {
      tenant_id: null,
      require_mfa: false,
      password_min_length: 8,
      password_require_upper: true,
      password_require_number: true,
      password_require_special: false,
      password_expiry_days: 0,
      max_login_attempts: 5,
      lockout_duration_min: 30,
      session_timeout_min: 480,
      updated_by: platform.employee_id,
    },
  });
  console.log('✅ Default Security Policy created');

  await prisma.apiRateLimit.createMany({
    data: [
      { name: 'Free Plan Default',         plan_name: 'free',          requests_per_minute: 20,  requests_per_hour: 200,   requests_per_day: 1000,   burst_limit: 30  },
      { name: 'Starter Plan Default',      plan_name: 'starter',       requests_per_minute: 60,  requests_per_hour: 1000,  requests_per_day: 10000,  burst_limit: 100 },
      { name: 'Professional Plan Default', plan_name: 'professional',  requests_per_minute: 120, requests_per_hour: 5000,  requests_per_day: 50000,  burst_limit: 200 },
      { name: 'Enterprise Plan Default',   plan_name: 'enterprise',    requests_per_minute: 300, requests_per_hour: 20000, requests_per_day: 500000, burst_limit: 500 },
    ],
  });
  console.log('✅ API Rate Limits created\n');

  // ══════════════════════════════════════════════════════════════════════════════
  // UI PERMISSIONS — grant manager + user full access on all seeded objects
  // Without explicit rows the permission service falls back to can_edit=false
  // (secure default), which blocks record creation for non-admin users.
  // ══════════════════════════════════════════════════════════════════════════════
  const seedObjects = [
    prospectObject, clientObject, quoteObject, applicationObject,
    policyObject, claimObject, underwritingObject, commissionObject,
    declarationObject, appDocObject,
  ];

  // ── Agent / operational roles: full access to all objects ────────────────
  const agentRoles = ['manager', 'user'];
  const uiPermRows = [];
  for (const obj of seedObjects) {
    for (const roleName of agentRoles) {
      uiPermRows.push({
        entity_type: 'object',
        entity_id:   obj.id,
        role_name:   roleName,
        tenant_id:   T,
        can_view:    true,
        can_edit:    true,
      });
    }
  }

  // ── Underwriting roles: restricted to UW-related objects only ────────────
  // Underwriters CANNOT sell — no access to prospects, quotes, commissions, settings.
  // They CAN view applications and policies (read-only) for context.
  const uwRoles = ['uw_manager', 'senior_underwriter', 'underwriter'];
  const uwFullAccess   = [underwritingObject, appDocObject];                      // full view + edit
  const uwViewOnly     = [applicationObject, policyObject, claimObject, clientObject]; // view only, no edit
  const uwNoAccess     = [prospectObject, quoteObject, commissionObject, declarationObject]; // no access

  for (const roleName of uwRoles) {
    for (const obj of uwFullAccess) {
      uiPermRows.push({ entity_type: 'object', entity_id: obj.id, role_name: roleName, tenant_id: T, can_view: true, can_edit: true });
    }
    for (const obj of uwViewOnly) {
      uiPermRows.push({ entity_type: 'object', entity_id: obj.id, role_name: roleName, tenant_id: T, can_view: true, can_edit: false });
    }
    for (const obj of uwNoAccess) {
      uiPermRows.push({ entity_type: 'object', entity_id: obj.id, role_name: roleName, tenant_id: T, can_view: false, can_edit: false });
    }
  }

  await prisma.uiPermission.createMany({ data: uiPermRows, skipDuplicates: true });
  console.log(`✅ UI Permissions seeded (${uiPermRows.length} rows: agent roles + underwriter roles)\n`);

  // ══════════════════════════════════════════════════════════════════════════════
  // UNDERWRITER OPERATIONAL PERMISSION
  // Grant the 'admin' role full underwriting decision authority.
  // Other roles require an explicit row to be added by a platform_admin.
  // ══════════════════════════════════════════════════════════════════════════════
  // Grant UW decision authority to admin and all underwriter roles.
  // Agent roles (manager, user) are intentionally excluded — they cannot make UW decisions.
  const uwDecisionRoles = [
    { role: 'admin',              view: 'all', create: 'all', edit: 'all', delete: 'all', assign: 'all'  },
    { role: 'uw_manager',         view: 'all', create: 'all', edit: 'all', delete: 'all', assign: 'all'  },
    { role: 'senior_underwriter', view: 'all', create: 'all', edit: 'all', delete: 'none', assign: 'none' },
    { role: 'underwriter',        view: 'all', create: 'all', edit: 'own', delete: 'none', assign: 'none' },
  ];
  for (const r of uwDecisionRoles) {
    await prisma.operationalPermission.upsert({
      where: { entity_type_role_name_tenant_id: { entity_type: 'underwriting', role_name: r.role, tenant_id: T } },
      create: { entity_type: 'underwriting', role_name: r.role, view_scope: r.view, create_scope: r.create, edit_scope: r.edit, delete_scope: r.delete, assign_scope: r.assign, tenant_id: T },
      update: {},
    });
  }
  console.log('✅ Underwriter Operational Permissions seeded (admin · uw_manager · senior_underwriter · underwriter)\n');

  // ══════════════════════════════════════════════════════════════════════════════
  // SUMMARY
  // ══════════════════════════════════════════════════════════════════════════════
  console.log('══════════════════════════════════════════════════════');
  console.log('🎉  Seed complete — Life Insurance CRM!');
  console.log('');
  console.log('  Modules (11) — grouped by sidebar category:');
  console.log('    CRM       : Prospects · Clients');
  console.log('    Insurance : Quotes · Applications · Policies · Claims ·');
  console.log('                Underwriting · Commissions · Declarations · Document Collection');
  console.log('    Settings  : Settings');
  console.log('');
  console.log('  Objects (11): Prospect · Client · Quote · Application · Policy ·');
  console.log('                Claim · Underwriting Case · Commission ·');
  console.log('                Declaration · Application Document · Settings');
  console.log('');
  console.log('  Pipelines (9):');
  console.log('    Quote (5) · Application (6) · Claims (6) · Policy (6) ·');
  console.log('    Underwriting (5) · Commission (4) · Declaration (6) ·');
  console.log('    Document (7) · Prospect (5)');
  console.log('');
  console.log('  Wizards  : Life Insurance Application (5 steps) · Settings (1 step)');
  console.log('  Workflows: Application Auto-Assign · Claim Notification · Policy Renewal');
  console.log('  Dashboards: Agency · Sales & Distribution · Claims & Underwriting · Portfolio Analytics');
  console.log('  Assignment Rules: Application · Claim · Prospect');
  console.log('');
  console.log('  Demo Data:');
  console.log('    5 Leads · 5 Contacts · 3 Accounts · 3 Opportunities · 3 Quotes');
  console.log('    2 Carriers · 3 Products · 8 Applications · 8 UW Cases · 5 Policies');
  console.log('    5 Claims · 8 Commissions · 5 Declarations · 6 Documents');
  console.log('    SLA: 4 policies · 1 business-hours calendar · 6 sample cases · live timers');
  console.log('');
  console.log('  EAV Data : All UI fields populated — no "--" entries in list views');
  console.log('  Platform : Plans · Feature Flags · Tenant Config · Security · Rate Limits');
  console.log('');
  console.log('  Logins:');
  console.log('    Platform:   PLATFORM01 / Platform@123');
  console.log('    Owner:      ADMIN001   / Admin@123');
  console.log('    Manager:    MGR001     / Manager@123');
  console.log('    Agent:      USR001     / User@123');
  console.log('    Agent:      USR002     / User@123');
  console.log('    Chief UW:   UWMGR001  / Underwriter@123');
  console.log('    Senior UW:  SRUW001   / Underwriter@123');
  console.log('    Underwriter:UW001     / Underwriter@123');
  console.log('');
  console.log('  ⚠️  Run database migration first: npm run db:migrate');
  console.log('     Then restart the backend (npm run dev) after seeding');
  console.log('     so it picks up fresh data from the database.');
  console.log('══════════════════════════════════════════════════════');
}

main()
  .catch((e) => { console.error('❌ Seed failed:', e); process.exit(1); })
  .finally(() => prisma.$disconnect());
