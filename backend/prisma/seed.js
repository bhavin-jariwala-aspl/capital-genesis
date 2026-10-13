/**
 * Genesis CRM — Database Seed
 * 4 CRM modules · objects · fields · validations · custom functions ·
 * field dependencies · forms · pipelines · dashboard · workflows ·
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

const PRODUCT_INTEREST_OPTIONS = [
  { value: 'consulting',   label: 'Consulting'      },
  { value: 'software',     label: 'Software'        },
  { value: 'managed',      label: 'Managed Service' },
  { value: 'training',     label: 'Training'        },
  { value: 'other',        label: 'Other'           },
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

const CONTACT_CHANNEL_OPTIONS = [
  { value: 'email', label: 'Email' },
  { value: 'phone', label: 'Phone' },
  { value: 'sms',   label: 'SMS'   },
];

const SEGMENT_OPTIONS = [
  { value: 'retail',     label: 'Retail',     color: '#3b82f6' },
  { value: 'affluent',   label: 'Affluent',   color: '#6366f1' },
  { value: 'high_value', label: 'High Value', color: '#10b981' },
  { value: 'corporate',  label: 'Corporate',  color: '#f59e0b' },
];

const MARITAL_STATUS_OPTIONS = [
  { value: 'single',   label: 'Single'   },
  { value: 'married',  label: 'Married'  },
  { value: 'divorced', label: 'Divorced' },
  { value: 'widowed',  label: 'Widowed'  },
];

async function main() {
  console.log('🌱 Seeding Genesis CRM database...\n');
  await clearDatabase();
  await flushRedisCache();
  console.log('');

  // ── Default Tenant ──────────────────────────────────────────────────────────
  const defaultTenant = await prisma.tenant.upsert({
    where:  { slug: 'genesis-life-demo' },
    update: {},
    create: {
      name: 'Genesis CRM Demo',
      slug: 'genesis-life-demo',
      domain: 'demo.genesislife.local',
      industry: 'professional_services',
      plan: 'enterprise',
      status: 'active',
      max_users: 999,
      max_storage_mb: 50000,
      max_api_calls: 500000,
      billing_email: 'billing@genesislife.local',
      timezone: 'America/New_York',
      locale: 'en',
      created_by: 'PLATFORM01',
      metadata: { demo: true, notes: 'Default tenant for demo/development purposes' },
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
  ];
  const roles = { platform_admin: platformAdminRole };
  for (const def of roleDefs) {
    roles[def.name] = await prisma.role.create({ data: def });
  }
  console.log('✅ Roles created (platform_admin · super_admin · admin · manager · user)');
  console.log('✅ Default Tenant created (Genesis CRM Demo — Enterprise plan)');

  // ── Regions ────────────────────────────────────────────────────────────────
  const regionWest = await prisma.region.create({ data: { region_name: 'West Region', region_code: 'WEST', tenant_id: T } });
  const regionEast = await prisma.region.create({ data: { region_name: 'East Region', region_code: 'EAST', tenant_id: T } });
  console.log('✅ Regions created');

  // ── Branches (Offices) ─────────────────────────────────────────────────────
  const branchHQ = await prisma.branch.create({
    data: { branch_name: 'Main Agency Office', branch_code: 'HQ', region_id: regionWest.region_id, address: '100 Market Plaza, San Francisco, CA 94105' },
  });
  const branchNY = await prisma.branch.create({
    data: { branch_name: 'East Coast Agency Office', branch_code: 'NYC', region_id: regionEast.region_id, address: '500 Park Ave, Suite 200, New York, NY 10022' },
  });
  console.log('✅ Agency Offices created');

  // ── Employees ──────────────────────────────────────────────────────────────
  const platformPwd = await bcrypt.hash(process.env.SEED_PLATFORM_PASSWORD || 'Platform@123', 12);
  const adminPwd = await bcrypt.hash(process.env.SEED_ADMIN_PASSWORD   || 'Admin@123',   12);
  const mgrPwd   = await bcrypt.hash(process.env.SEED_MANAGER_PASSWORD || 'Manager@123', 12);
  const usrPwd   = await bcrypt.hash(process.env.SEED_USER_PASSWORD    || 'User@123',    12);

  const platform = await prisma.employee.create({ data: { employee_id: 'PLATFORM01', employee_name: 'Platform Super Admin',  role: 'platform_admin',    email: 'platform@genesislife.local',        phone: '+1-800-000-0000', password: platformPwd, branch_id: branchHQ.branch_id, region_id: regionWest.region_id } });
  const admin    = await prisma.employee.create({ data: { employee_id: 'ADMIN001',   employee_name: 'Agency Owner',          role: 'super_admin',       email: 'owner@genesislife.local',           phone: '+1-800-000-0001', password: adminPwd, branch_id: branchHQ.branch_id, region_id: regionWest.region_id } });
  const manager1 = await prisma.employee.create({ data: { employee_id: 'MGR001',     employee_name: 'Sales Manager',         role: 'manager',           email: 'sales.manager@genesislife.local',   password: mgrPwd,   branch_id: branchHQ.branch_id, region_id: regionWest.region_id } });
  const user1    = await prisma.employee.create({ data: { employee_id: 'USR001',     employee_name: 'Senior Agent',          role: 'user',              email: 'senior.agent@genesislife.local',    password: usrPwd,   branch_id: branchHQ.branch_id, region_id: regionWest.region_id } });
  const user2    = await prisma.employee.create({ data: { employee_id: 'USR002',     employee_name: 'Agent',                 role: 'user',              email: 'agent@genesislife.local',            password: usrPwd,   branch_id: branchNY.branch_id, region_id: regionEast.region_id } });
  console.log('✅ Employees created (Platform · Owner · Manager · 2 Agents)');

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
  ]) await prisma.employeeHierarchy.create({ data: e });
  console.log('✅ Employee hierarchy seeded\n');

  // ══════════════════════════════════════════════════════════════════════════════
  // MODULES — CRM
  // ══════════════════════════════════════════════════════════════════════════════
  const leadsModule         = await prisma.uiModule.create({ data: { name: 'leads',         label: 'Leads',         description: 'Raw inbound leads — qualify and convert to prospects', icon: 'UserPlus',    color: 'sky',    category: 'crm',       order_index: 0 } });
  const prospectsModule     = await prisma.uiModule.create({ data: { name: 'prospects',     label: 'Prospects',     description: 'Manage prospects and leads',            icon: 'Users',          color: 'blue',   category: 'crm',       order_index: 1 } });
  const clientsModule      = await prisma.uiModule.create({ data: { name: 'clients',       label: 'Clients',       description: 'Manage clients and relationships',   icon: 'Heart',          color: 'indigo', category: 'crm',       order_index: 2 } });
  // Application-wide settings are handled by the dedicated Settings module
  // (frontend /settings + /api/settings), not a metadata-driven UI module.
  // ── Tier 1 metadata-driven modules (formerly hardcoded pages) ──
  const productsModule     = await prisma.uiModule.create({ data: { name: 'products',      label: 'Products',      description: 'Product catalog — pricing, SKUs, and availability',   icon: 'Package',        color: 'green',  category: 'crm',       order_index: 12 } });
  console.log('✅ Modules created (4 total: Leads · Prospects · Clients · Products)\n');

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
    data: { module_id: prospectsModule.id, name: 'prospect', label: 'Prospect', plural_label: 'Prospects', description: 'Potential client / unqualified lead', icon: 'UserPlus', order_index: 1 },
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
    { name: 'company',           label: 'Company',           field_type: 'text',     data_type: 'string',  is_required: false, order_index: 10 },
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
    { name: 'product_interest',  label: 'Product Interest',  field_type: 'select',   data_type: 'string',  is_required: false, order_index: 16, options: PRODUCT_INTEREST_OPTIONS },
    { name: 'estimated_budget',  label: 'Estimated Budget',  field_type: 'currency', data_type: 'number',  is_required: false, order_index: 17, config: { currency: 'USD' }, help_text: 'Budget the prospect has indicated' },
    { name: 'requirements',      label: 'Requirements',      field_type: 'textarea', data_type: 'string',  is_required: false, order_index: 18, help_text: 'Visible when product interest is Other' },
    { name: 'notes',             label: 'Notes',             field_type: 'textarea', data_type: 'string',  is_required: false, order_index: 19 },
  ]);

  await prisma.uiValidation.createMany({ data: [
    { field_id: prospectFields['email'].id,            validation_type: 'pattern',   value: '^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$',   error_message: 'Please enter a valid email address',            order_index: 1 },
    { field_id: prospectFields['phone'].id,            validation_type: 'pattern',   value: '^[\\+]?[\\d\\s\\-\\(\\)]{7,20}$', error_message: 'Please enter a valid phone number',             order_index: 1 },
    { field_id: prospectFields['mobile'].id,           validation_type: 'pattern',   value: '^[\\+]?[\\d\\s\\-\\(\\)]{7,20}$', error_message: 'Please enter a valid mobile number',            order_index: 1 },
    { field_id: prospectFields['annual_income'].id,    validation_type: 'min',       value: '0',                                error_message: 'Annual income cannot be negative',              order_index: 1 },
    { field_id: prospectFields['estimated_budget'].id, validation_type: 'min',       value: '0',                                error_message: 'Budget cannot be negative',                     order_index: 1 },
    { field_id: prospectFields['first_name'].id,       validation_type: 'minLength', value: '2',                                error_message: 'First name must be at least 2 characters',      order_index: 1 },
    { field_id: prospectFields['last_name'].id,        validation_type: 'minLength', value: '2',                                error_message: 'Last name must be at least 2 characters',       order_index: 1 },
    { field_id: prospectFields['age'].id,              validation_type: 'min',       value: '18',                               error_message: 'Prospect must be at least 18 years old',        order_index: 1 },
    { field_id: prospectFields['age'].id,              validation_type: 'max',       value: '85',                               error_message: 'Prospect cannot be older than 85',              order_index: 2 },
  ]});

  // Dependency: product_interest = other → show requirements
  await prisma.uiFieldDependency.create({ data: {
    source_field_id: prospectFields['product_interest'].id,
    target_field_id: prospectFields['requirements'].id,
    condition_type:  'equals',
    condition_value: 'other',
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
      { field_name: 'company',           row: 5, col: 0, col_span: 1, order_index: 10 },
      { field_name: 'occupation',        row: 5, col: 1, col_span: 1, order_index: 11 },
      { field_name: 'annual_income',     row: 6, col: 0, col_span: 1, order_index: 12 },
      { field_name: 'lead_source',       row: 6, col: 1, col_span: 1, order_index: 13 },
      { field_name: 'lead_status',       row: 7, col: 0, col_span: 1, order_index: 14 },
      { field_name: 'rating',            row: 7, col: 1, col_span: 1, order_index: 15 },
      { field_name: 'product_interest',  row: 8, col: 0, col_span: 1, order_index: 16 },
      { field_name: 'estimated_budget',  row: 8, col: 1, col_span: 1, order_index: 17 },
      { field_name: 'requirements',      row: 9, col: 0, col_span: 2, order_index: 18 },
      { field_name: 'notes',             row: 10, col: 0, col_span: 2, order_index: 19 },
    ], prospectFields);
  console.log('✅ Prospect: 19 fields · 9 validations · 1 custom fn · 1 dep · form');

  // ══════════════════════════════════════════════════════════════════════════════
  // OBJECT 2 — CLIENT  (module: Clients)
  // ══════════════════════════════════════════════════════════════════════════════
  const clientObject = await prisma.uiObject.create({
    data: { module_id: clientsModule.id, name: 'client', label: 'Client', plural_label: 'Clients', description: 'Active client', icon: 'Heart', order_index: 1 },
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
    { name: 'preferred_channel',       label: 'Preferred Channel',      field_type: 'select',   data_type: 'string',  is_required: false, order_index: 9, options: CONTACT_CHANNEL_OPTIONS },
    { name: 'segment',                 label: 'Segment',                field_type: 'select',   data_type: 'string',  is_required: false, order_index: 10, options: SEGMENT_OPTIONS },
    { name: 'occupation',              label: 'Occupation',             field_type: 'text',     data_type: 'string',  is_required: false, order_index: 11 },
    { name: 'employer',                label: 'Employer',               field_type: 'text',     data_type: 'string',  is_required: false, order_index: 12 },
    { name: 'annual_income',           label: 'Annual Income',          field_type: 'currency', data_type: 'number',  is_required: false, order_index: 13, config: { currency: 'USD' } },
    { name: 'marital_status',          label: 'Marital Status',         field_type: 'select',   data_type: 'string',  is_required: false, order_index: 14, options: MARITAL_STATUS_OPTIONS },
    { name: 'num_dependents',          label: 'Number of Dependents',   field_type: 'number',   data_type: 'number',  is_required: false, order_index: 15, default_value: '0' },
    { name: 'emergency_contact',       label: 'Emergency Contact',      field_type: 'text',     data_type: 'string',  is_required: false, order_index: 16 },
    { name: 'emergency_contact_relationship', label: 'Emergency Contact Relationship', field_type: 'select', data_type: 'string',  is_required: false, order_index: 17,
      options: [
        { value: 'spouse',  label: 'Spouse'  }, { value: 'child',   label: 'Child'   },
        { value: 'parent',  label: 'Parent'  }, { value: 'sibling', label: 'Sibling' },
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
      { field_name: 'preferred_channel',       row: 4, col: 0, col_span: 1, order_index: 9 },
      { field_name: 'segment',                 row: 4, col: 1, col_span: 1, order_index: 10 },
      { field_name: 'occupation',              row: 5, col: 0, col_span: 1, order_index: 11 },
      { field_name: 'employer',                row: 5, col: 1, col_span: 1, order_index: 12 },
      { field_name: 'annual_income',           row: 6, col: 0, col_span: 1, order_index: 13 },
      { field_name: 'marital_status',          row: 6, col: 1, col_span: 1, order_index: 14 },
      { field_name: 'num_dependents',          row: 7, col: 0, col_span: 1, order_index: 15 },
      { field_name: 'emergency_contact',       row: 7, col: 1, col_span: 1, order_index: 16 },
      { field_name: 'emergency_contact_relationship', row: 8, col: 0, col_span: 1, order_index: 17 },
      { field_name: 'client_since',            row: 8, col: 1, col_span: 1, order_index: 18 },
      { field_name: 'address_street',          row: 9, col: 0, col_span: 2, order_index: 19 },
      { field_name: 'address_city',            row: 10, col: 0, col_span: 1, order_index: 20 },
      { field_name: 'address_state',           row: 10, col: 1, col_span: 1, order_index: 21 },
      { field_name: 'address_zip',             row: 11, col: 0, col_span: 1, order_index: 22 },
      { field_name: 'notes',                   row: 12, col: 0, col_span: 2, order_index: 23 },
    ], clientFields);
  console.log('✅ Client: 23 fields · 10 validations · 1 custom fn · form');

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

  // Prospect — round-robin
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

  console.log('✅ Assignment Rules: 1 rule (Prospect: round_robin)');

  // ══════════════════════════════════════════════════════════════════════════════
  // DEMO CRM RECORDS
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
    { first_name: 'Robert',  last_name: 'Thompson', email: 'robert.thompson@email.com', phone: '+1-415-555-0101', company: 'Self-employed', job_title: 'Contractor',        lead_source: 'web',      lead_status: 'new',       rating: 'hot',  industry: 'other',      annual_revenue: 95000,  description: 'Small contractor business looking for a managed service. Wants a proposal this month.' },
    { first_name: 'Maria',   last_name: 'Garcia',   email: 'maria.garcia@email.com',    phone: '+1-212-555-0202', company: 'N/A',           job_title: 'Marketing Manager', lead_source: 'referral', lead_status: 'new',       rating: 'warm', industry: 'technology', annual_revenue: 82000,  description: 'Referred by existing client James Wilson. Looking for a consulting engagement.' },
    { first_name: 'David',   last_name: 'Park',     email: 'david.park@email.com',      phone: '+1-312-555-0303', company: 'Park Medical',  job_title: 'Physician',         lead_source: 'seminar',  lead_status: 'contacted', rating: 'hot',  industry: 'healthcare', annual_revenue: 280000, description: 'Attended our planning seminar. Interested in software plus training.' },
    { first_name: 'Sarah',   last_name: 'Johnson',  email: 'sarah.johnson@email.com',   phone: '+1-617-555-0404', company: 'TechStart LLC', job_title: 'CEO',               lead_source: 'partner',  lead_status: 'qualified', rating: 'hot',  industry: 'technology', annual_revenue: 350000, description: 'Business owner needs a multi-year software rollout. High-value prospect.' },
    { first_name: 'James',   last_name: 'Wilson',   email: 'james.wilson@email.com',    phone: '+1-646-555-0505', company: 'Wilson & Co.',  job_title: 'Attorney',          lead_source: 'cold_call',lead_status: 'converted', rating: 'hot',  industry: 'other',      annual_revenue: 220000, description: 'Converted to client. Signed a two-year consulting retainer.', is_converted: true },
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

  // ── CRM Accounts (companies / households) ──────────────────────────────────
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

  // ── Client EAV: profile fields for each contact ───────────────────────────
  // These populate fields defined in clientObject that are NOT native CRM columns
  // (preferred_channel, segment, annual_income, marital_status, num_dependents,
  //  emergency_contact, occupation, address_*, etc.)
  const clientEavDefs = [
    // contacts[0] — James Wilson (attorney)
    { record_id: contactRecords[0].id, fields: {
        first_name: 'James',          last_name: 'Wilson',          email: 'james.wilson@email.com',
        phone: '+1-646-555-0505',     date_of_birth: '1985-06-20', age: 40,
        gender: 'male',               ssn: '***-**-1234',          preferred_channel: 'email',      segment: 'high_value', occupation: 'Attorney',     employer: 'Wilson & Co.',
        annual_income: 280000,        marital_status: 'married',   num_dependents: 2,
        emergency_contact: 'Emily Wilson', emergency_contact_relationship: 'spouse',
        address_street: '245 Park Ave', address_city: 'New York',  address_state: 'NY',
        address_zip: '10167',         client_since: '2025-09-01',  notes: 'High-value client with several active engagements.',
    }},
    // contacts[1] — David Park (physician)
    { record_id: contactRecords[1].id, fields: {
        first_name: 'David',          last_name: 'Park',           email: 'david.park@email.com',
        phone: '+1-312-555-0303',     date_of_birth: '1979-11-04', age: 46,
        gender: 'male',               preferred_channel: 'email',      segment: 'affluent',
        occupation: 'Physician',      employer: 'Park Medical Group', annual_income: 420000,
        marital_status: 'married',    num_dependents: 3,           emergency_contact: 'Anna Park',
        emergency_contact_relationship: 'spouse', address_street: '875 N. Michigan Ave',
        address_city: 'Chicago',      address_state: 'IL',         address_zip: '60611',
        client_since: '2025-11-15',   notes: 'Physician with high income. Interested in long-term planning.',
    }},
    // contacts[2] — Sarah Johnson (CEO)
    { record_id: contactRecords[2].id, fields: {
        first_name: 'Sarah',          last_name: 'Johnson',        email: 'sarah.johnson@email.com',
        phone: '+1-617-555-0404',     date_of_birth: '1990-03-29', age: 35,
        gender: 'female',             preferred_channel: 'email',      segment: 'retail',
        occupation: 'CEO',            employer: 'TechStart LLC',   annual_income: 195000,
        marital_status: 'single',     num_dependents: 0,           emergency_contact: 'Thomas Johnson',
        emergency_contact_relationship: 'parent', address_street: '500 Boylston St',
        address_city: 'Boston',       address_state: 'MA',         address_zip: '02116',
        client_since: '2026-01-10',   notes: 'Business owner scaling a new team.',
    }},
    // contacts[3] — Lisa Chen (financial planner)
    { record_id: contactRecords[3].id, fields: {
        first_name: 'Lisa',           last_name: 'Chen',           email: 'lisa.chen@email.com',
        phone: '+1-408-555-0606',     date_of_birth: '1988-07-14', age: 37,
        gender: 'female',             preferred_channel: 'email',      segment: 'affluent',
        occupation: 'Financial Planner', employer: 'Independent',  annual_income: 135000,
        marital_status: 'married',    num_dependents: 1,           emergency_contact: 'Kevin Chen',
        emergency_contact_relationship: 'spouse', address_street: '3000 El Camino Real',
        address_city: 'Palo Alto',    address_state: 'CA',         address_zip: '94306',
        client_since: '2026-02-03',   notes: 'Referral from existing client network.',
    }},
    // contacts[4] — Michael Brown (business owner)
    { record_id: contactRecords[4].id, fields: {
        first_name: 'Michael',        last_name: 'Brown',          email: 'michael.brown@email.com',
        phone: '+1-503-555-0707',     date_of_birth: '1975-10-22', age: 50,
        gender: 'male',               preferred_channel: 'email',      segment: 'retail',
        occupation: 'Business Owner', employer: 'Brown Enterprises', annual_income: 310000,
        marital_status: 'divorced',   num_dependents: 2,           emergency_contact: 'Olivia Brown',
        emergency_contact_relationship: 'child', address_street: '1234 NW Burnside St',
        address_city: 'Portland',     address_state: 'OR',         address_zip: '97209',
        client_since: '2025-12-20',   notes: 'Long-standing client; prefers quarterly reviews.',
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
  console.log('✅ Client EAV fields seeded: 5 contacts × profile fields');
  const oppOwners = [user1.employee_id, manager1.employee_id, user2.employee_id];

  const oppDefs = [
    { name: 'Wilson Consulting Retainer',     amount: 45000, stage: 'closed_won', probability: 100, is_closed: true, is_won: true, close_date: new Date('2026-03-01'), account_id: accounts[0].id, contact_id: contacts[0].id, lead_source: 'cold_call' },
    { name: 'Park Medical Group Rollout',     amount: 85000, stage: 'proposal',   probability: 60,  is_closed: false, is_won: false, close_date: new Date('2026-05-15'), account_id: accounts[1].id, contact_id: contacts[1].id, lead_source: 'seminar' },
    { name: 'TechStart Training Programme',  amount: 32000, stage: 'qualification', probability: 35, is_closed: false, is_won: false, close_date: new Date('2026-06-01'), account_id: accounts[2].id, contact_id: contacts[2].id, lead_source: 'partner' },
  ];

  const opportunities = await Promise.all(
    oppDefs.map((def, i) =>
      prisma.crmOpportunity.create({
        data: { ...def, owner_id: oppOwners[i], created_by: admin.employee_id },
      })
    )
  );
  console.log(`✅ CRM Opportunities: ${opportunities.length} opportunities seeded`);

  // ── Seed EAV field values for metadata-driven records ──────────────────────
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
      company: lead.company ?? '',
      occupation: lead.job_title ?? '',
      annual_income: lead.annual_revenue ? Number(lead.annual_revenue) : 0,
      lead_source: lead.lead_source ?? '',
      lead_status: lead.lead_status ?? 'new',
      rating: lead.rating ?? '',
      product_interest: ['managed', 'consulting', 'software', 'software', 'consulting'][i] ?? 'other',
      estimated_budget: [50000, 25000, 200000, 100000, 100000][i] ?? 0,
      requirements: lead.description ?? '',
      notes: '',
    },
  })));
  console.log(`✅ Prospect EAV fields seeded: ${crmLeads.length} records`);

  const leadJames = crmLeads[4]; // James Wilson — converted
  await prisma.crmLeadConversion.create({
    data: { lead_id: leadJames.id, account_id: accounts[0].id, contact_id: contacts[0].id, opportunity_id: opportunities[0].id, converted_by: user1.employee_id },
  });
  console.log('✅ CRM Lead Conversion: 1 conversion record seeded');

  // ── Activities ────────────────────────────────────────────────────────────
  const [rec1, rec2, rec3] = prospectAnchorRecords;
  const activityDefs = [
    { record_id: rec1.id, employee_id: user1.employee_id, type: 'call',  subject: 'Initial consultation with Robert Thompson', description: 'Discussed current setup and pain points. Needs a managed service from next quarter. Scheduled follow-up to review the proposal.', outcome: 'Positive — follow-up scheduled' },
    { record_id: rec2.id, employee_id: user2.employee_id, type: 'email', subject: 'Sent consulting proposal to Maria Garcia', description: 'Emailed the consulting proposal with scope, timeline and fee schedule.' },
    { record_id: rec3.id, employee_id: user1.employee_id, type: 'meeting', subject: 'Discovery meeting with Dr. Park', description: '45-minute discovery meeting. Large practice, no current tooling. Recommended software plus a training package. Preparing the proposal.', outcome: 'Very positive — requesting formal proposal' },
  ];
  await Promise.all(activityDefs.map(a => prisma.activity.create({ data: a })));
  console.log(`✅ Activities seeded: ${activityDefs.length} entries`);

  // ── Tasks ─────────────────────────────────────────────────────────────────
  const now = new Date();
  const daysFromNow = (d) => new Date(now.getTime() + d * 86_400_000);
  const taskDefs = [
    { record_id: rec1.id, assigned_to: user1.employee_id, created_by: admin.employee_id, title: 'Prepare managed-service proposal for Robert Thompson',  priority: 'high',   status: 'open',        due_date: daysFromNow(2) },
    { record_id: rec2.id, assigned_to: user2.employee_id, created_by: admin.employee_id, title: 'Follow up with Maria Garcia on consulting proposal',     priority: 'normal', status: 'open',        due_date: daysFromNow(3) },
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
    { subject: 'Complaint about a price increase',                priority: 'critical', status: 'in_progress', type: 'complaint', origin: 'phone', owner_id: manager1.employee_id, created_at: daysAgo(6), __resolve: 'Explained the rate change; client retained.' },
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
    { employee_id: user1.employee_id,    type: 'task_due',        title: 'Task due tomorrow',                 body: '"Prepare managed-service proposal for Robert Thompson" is due in 24 hours.' },
    { employee_id: user1.employee_id,    type: 'record_assigned', title: 'New prospect assigned',             body: 'Prospect Sarah Johnson (TechStart LLC) has been assigned to you.' },
    { employee_id: admin.employee_id,    type: 'system',          title: 'Welcome to Genesis CRM!',           body: 'Your CRM has been set up with demo data. Explore the Leads, Prospects and Clients modules.' },
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
    { name: 'starter',      label: 'Starter',      description: 'Pipelines, workflows and reports for a small team',           price_monthly: 29,  price_annual: 290,  max_users: 10,  max_storage_mb: 1000,  max_api_calls: 10000,  max_records: 10000,  max_workflows: 5,   max_dashboards: 3,   trial_days: 14, order_index: 2 },
    { name: 'professional', label: 'Professional', description: 'Assignment, scoring, SLAs and automation for a growing team', price_monthly: 79,  price_annual: 790,  max_users: 50,  max_storage_mb: 5000,  max_api_calls: 50000,  max_records: 100000, max_workflows: 25,  max_dashboards: 10,  trial_days: 14, order_index: 3 },
    { name: 'enterprise',   label: 'Enterprise',   description: 'The full platform, with SSO, API v2 and AI assistance',       price_monthly: 199, price_annual: 1990, max_users: 999, max_storage_mb: 50000, max_api_calls: 500000, max_records: 999999, max_workflows: 999, max_dashboards: 999, trial_days: 30, order_index: 4 },
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
    // already use it (`advanced_workflows`), so nothing needs migrating.
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
      title: 'Welcome to Genesis CRM',
      message: 'Your CRM has been successfully deployed. Explore the Leads, Prospects and Clients modules, and use the Builder to customise forms and workflows.',
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
  const seedObjects = [prospectObject, clientObject];

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

  await prisma.uiPermission.createMany({ data: uiPermRows, skipDuplicates: true });
  console.log(`✅ UI Permissions seeded (${uiPermRows.length} rows: agent roles)\n`);

  // ══════════════════════════════════════════════════════════════════════════════
  // SUMMARY
  // ══════════════════════════════════════════════════════════════════════════════
  console.log('══════════════════════════════════════════════════════');
  console.log('🎉  Seed complete — Genesis CRM!');
  console.log('');
  console.log('  Modules (4) — CRM: Leads · Prospects · Clients · Products');
  console.log('  Pipelines : Lead (4) · Prospect (5)');
  console.log('  Workflows : lead routing · first-response SLA · qualification handoff ·');
  console.log('              prospect nurture · client data hygiene');
  console.log('  Dashboards: Sales Dashboard');
  console.log('  Assignment Rules: Prospect round-robin');
  console.log('');
  console.log('  Demo Data:');
  console.log('    5 Leads · 5 Contacts · 3 Accounts · 3 Opportunities');
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
  console.log('');
  console.log('  ⚠️  Run database migration first: npm run db:migrate');
  console.log('     Then restart the backend (npm run dev) after seeding');
  console.log('     so it picks up fresh data from the database.');
  console.log('══════════════════════════════════════════════════════');
}

main()
  .catch((e) => { console.error('❌ Seed failed:', e); process.exit(1); })
  .finally(() => prisma.$disconnect());
