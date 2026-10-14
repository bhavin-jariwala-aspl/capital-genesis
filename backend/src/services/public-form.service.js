'use strict';

const crypto = require('crypto');
const { tenantContext } = require('../middleware/tenant-scope');
const { NotFoundError, ValidationError } = require('../utils/errors');

/**
 * Public forms — web-to-record intake for any Builder form.
 *
 * An admin publishes a form (an enquiry form, a loan calculator, an investor
 * questionnaire) and gets an unguessable key. The website renders the form from
 * `GET /api/public/forms/:key` and posts to the same URL; the submission
 * becomes a record of the form's object through the normal record path, so
 * formulas, validations, business-unit stamping, assignment rules, SLA timers
 * and on_create workflows (acknowledgement emails, routing) all run exactly as
 * for a record an employee typed in. Nothing about intake is hard-coded.
 *
 * Guard rails, because this is the one unauthenticated write in the product:
 *   - only fields laid out on the form (plus declared capture fields such as
 *     utm_source / page_url) are accepted — everything else is dropped;
 *   - an optional consent field must be ticked;
 *   - a honeypot field (`_hp`) must stay empty;
 *   - per-IP and per-form rate limits (route layer);
 *   - optional reCAPTCHA when RECAPTCHA_SECRET is set and the form asks for it.
 *
 * `ui_forms.config.public`:
 *   { enabled, success_message, consent_field, consent_text_version,
 *     capture_fields: [...], result_fields: [...], stage, captcha, channel }
 */

const CAPTURE_DEFAULTS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'page_url', 'referrer', 'language'];

class PublicFormService {
  /**
   * @param {import('@prisma/client').PrismaClient} prisma tenant-scoped client
   * @param {import('./record.service')} recordService
   */
  constructor(prisma, recordService) {
    this.db = prisma;
    this.records = recordService;
  }

  static newKey() {
    return crypto.randomBytes(24).toString('hex');
  }

  /** Publish (or re-key) a form. Admin, inside the tenant's request context. */
  async publish(formId, settings = {}, { rotate = false } = {}) {
    const form = await this.db.uiForm.findUnique({ where: { id: Number(formId) }, select: { id: true, config: true, public_key: true } });
    if (!form) throw new NotFoundError('Form');
    const cfg = { ...(form.config ?? {}) };
    cfg.public = { ...(cfg.public ?? {}), ...settings, enabled: true };
    return this.db.uiForm.update({
      where: { id: form.id },
      data:  { config: cfg, public_key: rotate || !form.public_key ? PublicFormService.newKey() : form.public_key },
      select: { id: true, public_key: true, config: true },
    });
  }

  async unpublish(formId) {
    const form = await this.db.uiForm.findUnique({ where: { id: Number(formId) }, select: { id: true, config: true } });
    if (!form) throw new NotFoundError('Form');
    const cfg = { ...(form.config ?? {}), public: { ...(form.config?.public ?? {}), enabled: false } };
    return this.db.uiForm.update({ where: { id: form.id }, data: { config: cfg, public_key: null }, select: { id: true } });
  }

  /** Resolve a key to its live form (no tenant context: the key is global). */
  async #resolve(key) {
    if (!/^[a-f0-9]{48}$/.test(String(key ?? ''))) throw new NotFoundError('Form');
    const form = await this.db.uiForm.findUnique({
      where:   { public_key: String(key) },
      include: {
        object: { select: { id: true, name: true, label: true, is_active: true } },
        field_layouts: {
          where:   { is_visible: true },
          orderBy: { order_index: 'asc' },
          include: { field: { select: { id: true, name: true, label: true, field_type: true, data_type: true, is_required: true, options: true, placeholder: true, help_text: true, default_value: true, config: true, is_active: true } } },
        },
      },
    });
    if (!form || !form.is_active || !form.config?.public?.enabled || !form.object?.is_active) throw new NotFoundError('Form');
    return form;
  }

  /** What the website needs to render the form. Never exposes internal ids beyond the field list. */
  async describe(key) {
    const form = await this.#resolve(key);
    const cfg = form.config.public;
    return {
      // Which workspace's public branding (theme, logo) the page should wear.
      tenant_id:   form.tenant_id,
      title:       form.label,
      description: form.description ?? null,
      columns:     form.columns,
      consent_field: cfg.consent_field ?? null,
      captcha:     Boolean(cfg.captcha && process.env.RECAPTCHA_SITE_KEY),
      captcha_site_key: cfg.captcha ? (process.env.RECAPTCHA_SITE_KEY ?? null) : null,
      fields: form.field_layouts
        .filter((l) => l.field?.is_active && !['formula', 'auto_number', 'lookup', 'status_tracker'].includes(l.field.field_type))
        .map((l) => ({
          name: l.field.name, label: l.field.label, type: l.field.field_type, required: l.field.is_required,
          options: l.field.options ?? null, placeholder: l.field.placeholder ?? null, help: l.field.help_text ?? null,
          default: l.field.default_value ?? null, row: l.row, col: l.col, col_span: l.col_span,
        })),
    };
  }

  /**
   * Turn a submission into a record. Runs inside the form's tenant context so
   * every downstream read and write is scoped to that tenant.
   */
  async submit(key, body = {}, { verifyCaptcha = null } = {}) {
    const form = await this.#resolve(key);
    const cfg = form.config.public;
    const data = body.data && typeof body.data === 'object' ? body.data : {};

    if (body._hp) throw new ValidationError('Submission rejected');
    if (cfg.captcha && process.env.RECAPTCHA_SECRET && verifyCaptcha) {
      const okCaptcha = await verifyCaptcha(body.captcha_token);
      if (!okCaptcha) throw new ValidationError('Please complete the captcha');
    }

    const formFields = form.field_layouts.filter((l) => l.field?.is_active).map((l) => l.field);
    const allowed = new Set(formFields.filter((f) => !['formula', 'auto_number', 'status_tracker'].includes(f.field_type)).map((f) => f.name));
    const capture = new Set([...(cfg.capture_fields ?? []), ...CAPTURE_DEFAULTS]);

    const objectFields = await this.db.uiField.findMany({ where: { object_id: form.object.id, is_active: true }, select: { name: true } });
    const exists = new Set(objectFields.map((f) => f.name));

    const values = {};
    for (const [k, v] of Object.entries(data)) if (allowed.has(k)) values[k] = typeof v === 'string' ? v.slice(0, 5000) : v;
    // Attribution and context the website passes alongside the answers,
    // kept only where the object has a field to hold it.
    for (const [k, v] of Object.entries({ ...(body.utm ?? {}), page_url: body.page_url, referrer: body.referrer, language: body.language })) {
      if (v != null && v !== '' && capture.has(k) && exists.has(k)) values[k] = String(v).slice(0, 500);
    }
    if (cfg.consent_field) {
      const c = values[cfg.consent_field];
      if (!(c === true || c === 'true' || c === 1 || c === '1' || c === 'yes')) {
        throw new ValidationError('Please give your consent so we can contact you');
      }
      if (exists.has('consent_timestamp')) values.consent_timestamp = new Date().toISOString();
      if (cfg.consent_text_version && exists.has('consent_text_version')) values.consent_text_version = cfg.consent_text_version;
    }
    if (exists.has('channel') && values.channel == null) values.channel = cfg.channel ?? 'web_form';

    let stageId = null;
    if (cfg.stage) {
      const stage = await this.db.uiPipelineStage.findFirst({ where: { name: String(cfg.stage), pipeline: { object_id: form.object.id } }, select: { id: true } });
      stageId = stage?.id ?? null;
    }

    const record = await tenantContext.run({ tenantId: form.tenant_id }, () =>
      this.records.createRecord(form.object.id, stageId, null, null, { tenant_id: form.tenant_id }, values));

    const reference = Object.values(record?.data ?? {}).find((v) => typeof v === 'string' && /^[A-Z]{2,6}-\d{4}-\d+$/.test(v)) ?? null;
    // `result_fields` lets the website show what the CRM computed — a loan
    // calculator's indicative EMI, a questionnaire's model portfolio.
    const results = Object.fromEntries((cfg.result_fields ?? []).map((f) => [f, record?.data?.[f] ?? null]));
    return { message: cfg.success_message || 'Thank you — we will be in touch shortly.', reference, ...(Object.keys(results).length ? { results } : {}) };
  }
}

module.exports = PublicFormService;
module.exports.CAPTURE_DEFAULTS = CAPTURE_DEFAULTS;
