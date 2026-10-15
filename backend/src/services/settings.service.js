'use strict';

const { ValidationError } = require('../utils/errors');
const { currencyCodes, currencyOptionLabels, NUMBER_FORMATS } = require('../utils/currency');

/**
 * SettingsService — application-wide (organization) settings.
 *
 * Settings are the system of record for how a tenant's Genesis workspace
 * behaves: organization profile & branding, localization, business hours,
 * security policy, notification defaults, and document policy.
 *
 * Storage is split by nature:
 *   - "profile" settings map to first-class columns on the `tenants` row
 *     (name, industry, logo_url, primary_color, billing_email, timezone,
 *     locale) — these are structured tenant attributes.
 *   - everything else is a typed key/value pair in `tenant_configs`
 *     (`config_key` = "{group}.{key}", `config_value` = stringified value).
 *
 * The SCHEMA below is the single source of truth: it drives validation, type
 * coercion, defaults, and the settings UI (the frontend renders generically
 * from the same schema returned by GET /api/settings).
 *
 * NOTE: `Tenant` and `TenantConfig` are GLOBAL models (not auto-scoped by the
 * tenant Prisma middleware), so every query here filters by tenant_id
 * explicitly.
 */

/** Setting groups. `source: 'tenant'` → tenants column; else tenant_configs. */
const SCHEMA = [
  {
    key: 'organization',
    label: 'Organization',
    icon: 'Building2',
    description: 'Company identity and branding used across the workspace.',
    settings: [
      { key: 'company_name',  label: 'Company Name',  type: 'text',  source: 'tenant', column: 'name' },
      { key: 'industry',      label: 'Industry',      type: 'select', source: 'tenant', column: 'industry',
        options: ['technology', 'healthcare', 'finance', 'insurance', 'retail', 'manufacturing', 'education', 'real_estate', 'media', 'hospitality', 'professional_services', 'other'] },
      { key: 'logo_url',      label: 'Logo URL',      type: 'url',   source: 'tenant', column: 'logo_url' },
      { key: 'primary_color', label: 'Primary Color', type: 'color', source: 'tenant', column: 'primary_color', default: '#6366f1' },
      { key: 'billing_email', label: 'Billing Email', type: 'email', source: 'tenant', column: 'billing_email' },
    ],
  },
  {
    key: 'appearance',
    label: 'Appearance & Branding',
    icon: 'Palette',
    description: 'How the application looks for everyone in this organization — theme, colours, shape, density, typography, branding and the sign-in page. Applied live, no redeploy. Edited in Builder → Appearance Studio.',
    settings: [
      // ── Identity ──────────────────────────────────────────────────────
      { key: 'app_name',       label: 'Application Name',     type: 'text',  default: 'Genesis CRM' },
      { key: 'theme_preset',   label: 'Theme Preset',         type: 'text',  default: 'genesis',
        help: 'Name of the last preset applied in the Appearance Studio; "custom" once any knob is changed.' },
      { key: 'logo_dark_url',  label: 'Logo (dark surfaces)', type: 'url',
        help: 'Optional variant shown on dark backgrounds (dark mode, dark/brand sidebar).' },
      { key: 'icon_url',       label: 'App Icon (square mark)', type: 'url',
        help: 'Square mark used where a wordmark does not fit (collapsed sidebar, avatars, browser tab).' },
      { key: 'favicon_url',    label: 'Favicon',              type: 'url' },
      { key: 'logo_display',   label: 'Logo Display',         type: 'select', default: 'mark_and_name',
        options: ['mark_and_name', 'logo_only', 'name_only'] },
      // ── Colour ────────────────────────────────────────────────────────
      { key: 'accent_color',   label: 'Accent Color',         type: 'color',  default: '#d946ef' },
      { key: 'neutral',        label: 'Neutral Tone',         type: 'select', default: 'cool',
        options: ['cool', 'slate', 'warm', 'graphite'],
        help: 'The grey ramp behind text, borders and dividers.' },
      { key: 'mode',           label: 'Default Mode',         type: 'select', default: 'light',
        options: ['light', 'dark', 'system'] },
      { key: 'dark_surface',   label: 'Dark Mode Surfaces',   type: 'select', default: 'midnight',
        options: ['midnight', 'graphite', 'oled'] },
      { key: 'allow_user_mode_toggle', label: 'Let Users Switch Light/Dark', type: 'boolean', default: true },
      { key: 'allow_user_density',     label: 'Let Users Choose Text Size',  type: 'boolean', default: true },
      // ── Shape, surfaces & motion ──────────────────────────────────────
      { key: 'radius',         label: 'Corner Radius',        type: 'select', default: 'rounded',
        options: ['sharp', 'soft', 'rounded', 'pill'] },
      { key: 'density',        label: 'Density',              type: 'select', default: 'comfortable',
        options: ['compact', 'comfortable', 'spacious'] },
      { key: 'surface_style',  label: 'Surface Style',        type: 'select', default: 'glass',
        options: ['glass', 'flat', 'elevated'] },
      { key: 'button_style',   label: 'Button Style',         type: 'select', default: 'gradient',
        options: ['gradient', 'solid', 'soft'] },
      { key: 'motion',         label: 'Motion',               type: 'select', default: 'full',
        options: ['full', 'subtle', 'reduced'] },
      // ── Typography ────────────────────────────────────────────────────
      { key: 'font',           label: 'Typeface',             type: 'select', default: 'inter',
        options: ['inter', 'cupertino', 'system', 'geometric', 'humanist', 'serif'] },
      { key: 'heading_font',   label: 'Heading Typeface',     type: 'select', default: 'geometric',
        options: ['match', 'inter', 'cupertino', 'system', 'geometric', 'humanist', 'serif'] },
      // ── Navigation ────────────────────────────────────────────────────
      { key: 'background',     label: 'Background Style',     type: 'select', default: 'aurora',
        options: ['aurora', 'plain', 'tinted', 'mesh'] },
      { key: 'sidebar_style',  label: 'Sidebar Style',        type: 'select', default: 'light',
        options: ['light', 'dark', 'brand', 'glass'] },
      { key: 'sidebar_width',  label: 'Sidebar Width',        type: 'select', default: 'regular',
        options: ['compact', 'regular', 'wide'] },
      { key: 'nav_active_style', label: 'Active Navigation Style', type: 'select', default: 'gradient',
        options: ['gradient', 'pill', 'line'] },
      // ── Charts ────────────────────────────────────────────────────────
      { key: 'chart_palette',  label: 'Chart Palette',        type: 'select', default: 'vivid',
        options: ['vivid', 'brand', 'pastel', 'mono', 'ocean', 'warm', 'cupertino'] },
      // ── Sign-in page ──────────────────────────────────────────────────
      { key: 'login_layout',   label: 'Sign-in Layout',       type: 'select', default: 'split',
        options: ['split', 'centered', 'cover'] },
      { key: 'login_image_url', label: 'Sign-in Artwork',     type: 'url',
        help: 'Optional photo or illustration for the sign-in page brand panel.' },
      { key: 'login_tagline',  label: 'Login Tagline',        type: 'text',   default: 'Your business, beautifully managed.' },
      { key: 'login_footer',   label: 'Login Footer Note',    type: 'text',
        help: 'e.g. "Authorised staff only" or a support contact.' },
      { key: 'show_powered_by', label: 'Show "Powered by Genesis"', type: 'boolean', default: true },
    ],
  },
  {
    key: 'localization',
    label: 'Localization',
    icon: 'Globe',
    description: 'Regional formatting applied to dates, numbers, and currency.',
    settings: [
      { key: 'timezone',    label: 'Time Zone',     type: 'text',   source: 'tenant', column: 'timezone', default: 'UTC' },
      { key: 'locale',      label: 'Language',      type: 'select', source: 'tenant', column: 'locale', default: 'en',
        options: ['en', 'es', 'fr', 'de', 'pt', 'hi', 'zh', 'ja', 'ar'] },
      // Options come from the ISO 4217 registry in utils/currency.js so the
      // picker, the validator, and every formatter agree on one list.
      { key: 'currency',    label: 'Currency',      type: 'select', default: 'USD',
        options: currencyCodes(), option_labels: currencyOptionLabels(),
        help: 'Display currency for every amount shown in the workspace.' },
      { key: 'date_format', label: 'Date Format',   type: 'select', default: 'MM/DD/YYYY',
        options: ['MM/DD/YYYY', 'DD/MM/YYYY', 'YYYY-MM-DD', 'DD-MMM-YYYY'] },
      { key: 'number_format', label: 'Number Format', type: 'select', default: '1,234.56',
        options: Object.keys(NUMBER_FORMATS) },
      { key: 'fiscal_year_start_month', label: 'Fiscal Year Start Month', type: 'number', default: 1, min: 1, max: 12 },
    ],
  },
  {
    key: 'business',
    label: 'Business Hours',
    icon: 'Clock',
    description: 'Working schedule used for SLAs, assignments, and reporting.',
    settings: [
      { key: 'week_start', label: 'Week Starts On', type: 'select', default: 'monday',
        options: ['sunday', 'monday'] },
      { key: 'work_start', label: 'Work Day Start', type: 'text', default: '09:00' },
      { key: 'work_end',   label: 'Work Day End',   type: 'text', default: '17:00' },
      { key: 'working_days', label: 'Working Days', type: 'text', default: 'Mon,Tue,Wed,Thu,Fri' },
    ],
  },
  {
    key: 'home',
    label: 'Home Page',
    icon: 'LayoutDashboard',
    description: 'The dashboard each role sees first after signing in. Roles not listed get the default dashboard.',
    settings: [
      { key: 'dashboards_by_role', label: 'Home Dashboard by Role', type: 'text', default: '', max_length: 2000,
        pattern: /^\s*[a-z0-9_]+\s*:\s*[a-z0-9_]+\s*(,\s*[a-z0-9_]+\s*:\s*[a-z0-9_]+\s*)*$/,
        pattern_help: 'use role:dashboard_name pairs separated by commas, e.g. rm:genesis_rm_workbench, coo:genesis_group_executive',
        help: 'Comma-separated role:dashboard_name pairs, e.g. rm:genesis_rm_workbench, credit_analyst:genesis_lending' },
    ],
  },
  {
    key: 'security',
    label: 'Security',
    icon: 'Shield',
    description: 'Authentication and session policy for all users in the workspace.',
    settings: [
      { key: 'session_timeout_minutes', label: 'Session Timeout (minutes)', type: 'number', default: 480, min: 5, max: 10080 },
      { key: 'password_min_length',     label: 'Minimum Password Length',   type: 'number', default: 8,   min: 6, max: 128 },
      { key: 'password_expiry_days',    label: 'Password Expiry (days, 0 = never)', type: 'number', default: 0, min: 0, max: 3650 },
      { key: 'require_mfa',             label: 'Require Two-Factor Auth',    type: 'boolean', default: false },
    ],
  },
  {
    key: 'notifications',
    label: 'Notifications',
    icon: 'Bell',
    description: 'Default notification behaviour for the workspace.',
    settings: [
      { key: 'email_enabled',       label: 'Email Notifications',        type: 'boolean', default: true },
      { key: 'notify_on_assignment', label: 'Notify on Record Assignment', type: 'boolean', default: true },
      { key: 'daily_digest',        label: 'Daily Digest Email',         type: 'boolean', default: false },
    ],
  },
  {
    key: 'documents',
    label: 'Documents',
    icon: 'FolderOpen',
    description: 'Policy for the Document Management System.',
    settings: [
      { key: 'max_upload_mb',       label: 'Max Upload Size (MB)',        type: 'number', default: 25, min: 1, max: 500 },
      { key: 'retention_days',      label: 'Retention After Delete (days, 0 = keep)', type: 'number', default: 30, min: 0, max: 3650 },
      { key: 'allow_public_sharing', label: 'Allow Public Document Links', type: 'boolean', default: false },
      { key: 'show_preview_button', label: 'Show Document Preview Button', type: 'boolean', default: true },
    ],
  },
];

/** Tenant columns this service is allowed to read/write. */
const TENANT_COLUMNS = SCHEMA
  .flatMap(g => g.settings)
  .filter(s => s.source === 'tenant')
  .map(s => s.column);

class SettingsService {
  /** @param {import('@prisma/client').PrismaClient} prisma */
  constructor(prisma) {
    this.db = prisma;
  }

  /** The schema (for the UI to render from). Static metadata, no tenant data. */
  static get schema() { return SCHEMA; }

  #configKey(groupKey, settingKey) { return `${groupKey}.${settingKey}`; }

  /** Coerce a raw value to a setting's declared type. */
  #coerce(setting, raw) {
    if (raw === undefined || raw === null || raw === '') {
      return setting.default ?? null;
    }
    switch (setting.type) {
      case 'boolean':
        return raw === true || raw === 'true' || raw === 1 || raw === '1';
      case 'number': {
        const n = Number(raw);
        return Number.isFinite(n) ? n : (setting.default ?? null);
      }
      default:
        return String(raw);
    }
  }

  /** Validate an incoming value; returns the storage-ready value or throws. */
  #validate(setting, value) {
    const coerced = this.#coerce(setting, value);
    if (coerced === null) return null;
    if (setting.type === 'select' && setting.options && !setting.options.includes(coerced)) {
      throw new ValidationError(`Invalid value for ${setting.key}: ${coerced}`);
    }
    if (setting.type === 'number') {
      if (setting.min !== undefined && coerced < setting.min) throw new ValidationError(`${setting.key} must be ≥ ${setting.min}`);
      if (setting.max !== undefined && coerced > setting.max) throw new ValidationError(`${setting.key} must be ≤ ${setting.max}`);
    }
    if (setting.type === 'email' && coerced && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(coerced)) {
      throw new ValidationError(`${setting.key} must be a valid email address`);
    }
    if (setting.type === 'color' && coerced && !/^#[0-9a-fA-F]{6}$/.test(coerced)) {
      throw new ValidationError(`${setting.key} must be a hex colour like #4f46e5`);
    }
    if (setting.type === 'url' && coerced) {
      // Absolute http(s) or a same-origin path (branding assets are served
      // from /api/settings/branding/…). Anything else — javascript:, data:,
      // protocol-relative — is rejected so a stored URL can never be a vector.
      if (coerced.length > 2000 || !/^(https?:\/\/[^\s]+|\/[^\s/][^\s]*)$/i.test(coerced)) {
        throw new ValidationError(`${setting.key} must be an http(s) URL or a same-origin path`);
      }
    }
    const maxLength = setting.max_length ?? 200;
    if (setting.type === 'text' && typeof coerced === 'string' && coerced.length > maxLength) {
      throw new ValidationError(`${setting.key} must be ${maxLength} characters or fewer`);
    }
    if (setting.pattern && typeof coerced === 'string' && coerced && !setting.pattern.test(coerced)) {
      throw new ValidationError(`${setting.key}: ${setting.pattern_help || 'invalid format'}`);
    }
    return coerced;
  }

  /**
   * Read all settings for a tenant, merged with defaults.
   * @returns {Promise<{ schema: typeof SCHEMA, values: Record<string, any> }>}
   */
  async getSettings(tenantId) {
    const tid = Number(tenantId);
    const [tenant, configs] = await Promise.all([
      this.db.tenant.findUnique({
        where: { id: tid },
        select: TENANT_COLUMNS.reduce((sel, col) => ({ ...sel, [col]: true }), {}),
      }),
      this.db.tenantConfig.findMany({ where: { tenant_id: tid } }),
    ]);
    const configMap = new Map(configs.map(c => [c.config_key, c.config_value]));

    const values = {};
    for (const group of SCHEMA) {
      for (const s of group.settings) {
        const raw = s.source === 'tenant'
          ? tenant?.[s.column]
          : configMap.get(this.#configKey(group.key, s.key));
        values[`${group.key}.${s.key}`] = this.#coerce(s, raw);
      }
    }
    return { schema: SCHEMA, values };
  }

  /** Flat effective settings keyed by "group.key" — for app-wide consumers. */
  async getEffective(tenantId) {
    const { values } = await this.getSettings(tenantId);
    return values;
  }

  /**
   * Apply a patch of settings. Only keys present in the patch are changed.
   * @param {number} tenantId
   * @param {string} adminId
   * @param {Record<string, any>} patch  keys are "group.key"
   */
  async updateSettings(tenantId, adminId, patch = {}) {
    const tid = Number(tenantId);
    const tenantUpdate = {};
    const configWrites = [];

    for (const group of SCHEMA) {
      for (const s of group.settings) {
        const flatKey = `${group.key}.${s.key}`;
        if (!(flatKey in patch)) continue;
        const value = this.#validate(s, patch[flatKey]);
        if (s.source === 'tenant') {
          tenantUpdate[s.column] = value;
        } else {
          configWrites.push({ key: this.#configKey(group.key, s.key), value });
        }
      }
    }

    await this.db.$transaction([
      ...(Object.keys(tenantUpdate).length
        ? [this.db.tenant.update({ where: { id: tid }, data: tenantUpdate })]
        : []),
      ...configWrites.map(w =>
        this.db.tenantConfig.upsert({
          where:  { tenant_id_config_key: { tenant_id: tid, config_key: w.key } },
          create: { tenant_id: tid, config_key: w.key, config_value: w.value === null ? null : String(w.value), updated_by: adminId },
          update: { config_value: w.value === null ? null : String(w.value), updated_by: adminId },
        }),
      ),
    ]);

    // Localization drives every money render (see CurrencyService); drop the
    // memoised profile so an admin's save is visible on the next request
    // instead of after the cache TTL.
    if (Object.keys(patch).some(k => k.startsWith('localization.'))) {
      require('./currency.service').invalidate(tid);
      // The report engine memoises the fiscal-year start for the same reason.
      require('./report-run-context').invalidateRunContext(tid);
    }

    return this.getSettings(tid);
  }
}

module.exports = SettingsService;
