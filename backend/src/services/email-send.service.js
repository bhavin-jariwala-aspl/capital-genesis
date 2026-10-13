'use strict';

const nodemailer = require('nodemailer');
const config     = require('../config');
const { logger } = require('./logging.service');
const { ValidationError } = require('../utils/errors');

/**
 * EmailSendService — Handles actual email delivery via SMTP / transactional provider.
 *
 * Integrates with EmailTemplateService for template rendering and logs every
 * send attempt to the email_logs table so analytics stay accurate.
 */
class EmailSendService {
  /**
   * @param {import('@prisma/client').PrismaClient} prisma
   * @param {import('./email-template.service')} templateService
   */
  constructor(prisma, templateService) {
    this.db       = prisma;
    this.tplSvc   = templateService;
    this.transport = this.#createTransport();
  }

  // ── Transport setup ────────────────────────────────────────────────────────

  #createTransport() {
    const smtpHost = process.env.SMTP_HOST;
    const smtpPort = parseInt(process.env.SMTP_PORT || '587', 10);
    const smtpUser = process.env.SMTP_USER;
    const smtpPass = process.env.SMTP_PASS;

    // If SMTP is not configured, use a preview-only JSON transport that logs
    // the message payload instead of actually sending.  This lets the system
    // work in development / demo environments without a mail server.
    if (!smtpHost) {
      logger.info?.('[email] SMTP not configured — using preview-only mode (emails will be logged, not sent)');
      return {
        sendMail: async (mailOptions) => {
          logger.info?.('[email] Preview-mode send:', {
            to:      mailOptions.to,
            subject: mailOptions.subject,
          });
          return { messageId: `preview-${Date.now()}@genesis-crm`, preview: true };
        },
      };
    }

    return nodemailer.createTransport({
      host:   smtpHost,
      port:   smtpPort,
      secure: smtpPort === 465,
      auth:   smtpUser ? { user: smtpUser, pass: smtpPass } : undefined,
    });
  }

  // ── Core send method ───────────────────────────────────────────────────────

  /**
   * Send an email using a template.
   *
   * @param {Object}  opts
   * @param {number}  opts.template_id    – EmailTemplate ID to render
   * @param {Object}  opts.variables      – Key-value pairs for template substitution
   * @param {string}  opts.to_email       – Recipient email address
   * @param {string}  [opts.from_email]   – Sender (defaults to SMTP_FROM env)
   * @param {string[]} [opts.cc_emails]   – CC recipients
   * @param {string[]} [opts.bcc_emails]  – BCC recipients
   * @param {number}  [opts.related_record_id] – CRM record this email relates to
   * @param {string}  [opts.related_type]      – Entity type (lead, contact, etc.)
   * @param {string}  [opts.sent_by]           – Employee ID of the sender
   * @returns {Promise<Object>} The created EmailLog entry
   */
  async sendWithTemplate({
    template_id,
    variables = {},
    to_email,
    from_email,
    cc_emails,
    bcc_emails,
    related_record_id,
    related_type,
    sent_by,
  }) {
    // ── Validate inputs ──────────────────────────────────────────────────────
    if (!template_id) throw new ValidationError('template_id is required');
    if (!to_email)    throw new ValidationError('to_email is required');

    // Basic email format check
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(to_email)) {
      throw new ValidationError('Invalid to_email format');
    }

    // ── Render template ──────────────────────────────────────────────────────
    // countUsage: this is the real send path, so it should bump usage analytics.
    const rendered = await this.tplSvc.renderTemplate(template_id, variables, { countUsage: true });

    const sender = from_email || process.env.SMTP_FROM || 'noreply@genesis-crm.local';

    // ── Send via transport ───────────────────────────────────────────────────
    let status = 'sent';
    let bounceReason = null;

    try {
      await this.transport.sendMail({
        from:    sender,
        to:      to_email,
        cc:      cc_emails?.length  ? cc_emails.join(', ')  : undefined,
        bcc:     bcc_emails?.length ? bcc_emails.join(', ') : undefined,
        subject: rendered.subject,
        html:    rendered.body_html  || undefined,
        text:    rendered.body_text  || rendered.subject,
      });
    } catch (err) {
      status = 'bounced';
      bounceReason = err.message;
      logger.error?.('[email] Send failed:', { to_email, error: err.message });
    }

    // ── Log to email_logs ────────────────────────────────────────────────────
    const emailLog = await this.db.emailLog.create({
      data: {
        template_id:       template_id,
        related_record_id: related_record_id ? Number(related_record_id) : null,
        related_type:      related_type || null,
        to_email,
        from_email:        sender,
        cc_emails:         cc_emails?.length  ? cc_emails  : undefined,
        bcc_emails:        bcc_emails?.length ? bcc_emails : undefined,
        subject:           rendered.subject,
        body_html:         rendered.body_html || null,
        body_text:         rendered.body_text || null,
        status,
        bounce_reason:     bounceReason,
        sent_by:           sent_by || null,
        sent_at:           new Date(),
      },
    });

    return {
      ...emailLog,
      template_name: rendered.template_name,
    };
  }

  // ── Send raw email (no template) ───────────────────────────────────────────

  /**
   * Send a one-off email without a template.
   */
  async sendRaw({
    to_email,
    from_email,
    cc_emails,
    bcc_emails,
    subject,
    body_html,
    body_text,
    related_record_id,
    related_type,
    sent_by,
    attachments = [],   // [{ filename, content: Buffer|string, encoding?, contentType? }]
  }) {
    if (!to_email) throw new ValidationError('to_email is required');
    if (!subject)  throw new ValidationError('subject is required');

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(to_email)) {
      throw new ValidationError('Invalid to_email format');
    }

    const sender = from_email || process.env.SMTP_FROM || 'noreply@genesis-crm.local';

    let status = 'sent';
    let bounceReason = null;

    try {
      await this.transport.sendMail({
        from:        sender,
        to:          to_email,
        cc:          cc_emails?.length  ? cc_emails.join(', ')  : undefined,
        bcc:         bcc_emails?.length ? bcc_emails.join(', ') : undefined,
        subject,
        html:        body_html || undefined,
        text:        body_text || subject,
        attachments: attachments.length ? attachments : undefined,
      });
    } catch (err) {
      status = 'bounced';
      bounceReason = err.message;
      logger.error?.('[email] Raw send failed:', { to_email, error: err.message });
    }

    const emailLog = await this.db.emailLog.create({
      data: {
        template_id:       null,
        related_record_id: related_record_id ? Number(related_record_id) : null,
        related_type:      related_type || null,
        to_email,
        from_email:        sender,
        cc_emails:         cc_emails?.length  ? cc_emails  : undefined,
        bcc_emails:        bcc_emails?.length ? bcc_emails : undefined,
        subject,
        body_html:         body_html || null,
        body_text:         body_text || null,
        status,
        bounce_reason:     bounceReason,
        sent_by:           sent_by || null,
        sent_at:           new Date(),
      },
    });

    return emailLog;
  }

  // ── Variable resolution ─────────────────────────────────────────────────────

  /**
   * Given a template and a record ID, load the record's CRM entity data and
   * map it onto the template's variables.
   *
   * This is the server-side source of truth for "which record field fills which
   * {{variable}}".  The frontend can call this before sending to pre-populate
   * the variable fields so the user can review and edit.
   *
   * Returns: { variables: { var_name: resolved_value, ... }, to_email: string|null }
   */
  async resolveVariablesForRecord(templateId, recordId) {
    const template = await this.tplSvc.getTemplate(templateId);
    if (!template) throw new Error('Template not found');

    // Use stored variables, or re-extract from content if stored list is empty
    // (handles templates created before the extraction regex was fixed)
    let tplVars = Array.isArray(template.variables) && template.variables.length
      ? template.variables
      : [];
    if (!tplVars.length) {
      const regex = /{{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*}}/g;
      const varSet = new Set();
      for (const content of [template.subject, template.body_html, template.body_text]) {
        if (!content) continue;
        let match;
        while ((match = regex.exec(content)) !== null) varSet.add(match[1]);
      }
      tplVars = [...varSet];
    }

    // Load all CRM entity data attached to the record, including relations
    // that carry names we need (contact on quote, account on case, etc.)
    const record = await this.db.record.findUnique({
      where:   { id: Number(recordId) },
      include: {
        crm_lead:        true,
        crm_contact:     { include: { account: { select: { name: true } } } },
        crm_account:     true,
        crm_opportunity: { include: {
          account: { select: { name: true } },
          contact: { select: { first_name: true, last_name: true, email: true } },
        }},
        crm_case:        { include: {
          account: { select: { name: true } },
          contact: { select: { first_name: true, last_name: true, email: true } },
        }},
        product:         true,
        quote:           { include: {
          contact: { select: { first_name: true, last_name: true, email: true } },
          account: { select: { name: true } },
        }},
      },
    });

    if (!record) throw new Error('Record not found');

    // Merge all CRM entity fields into one flat object
    const entity = record.crm_lead ?? record.crm_contact ?? record.crm_account
                ?? record.crm_opportunity ?? record.crm_case
                ?? record.product ?? record.quote;

    const data = entity ? { ...entity } : {};

    // Flatten related entity names into data for alias resolution
    // e.g. Quote.contact.first_name → data.contact_first_name, data.contact_name
    const related = entity?.contact ?? entity?.account ?? null;
    if (entity?.contact) {
      const c = entity.contact;
      if (c.first_name) data._contact_first = c.first_name;
      if (c.last_name)  data._contact_last  = c.last_name;
      if (!data.contact_name) data.contact_name = [c.first_name, c.last_name].filter(Boolean).join(' ');
      if (!data.email && c.email) data.email = c.email;
    }
    if (entity?.account) {
      if (!data.company_name) data.company_name = entity.account.name;
      if (!data.company)      data.company      = entity.account.name;
    }

    // Preserve the entity's own ID for case_number etc. before stripping
    const entityId = entity?.id ?? null;

    // Remove internal columns
    delete data.id;
    delete data.record_id;
    delete data.owner_id;
    delete data.created_by;
    delete data.created_at;
    delete data.updated_at;
    delete data.external_id;

    // Load the sender (record owner) for sender_name / sender_email
    const ownerRow = entity?.owner_id
      ? await this.db.employee.findUnique({
          where:  { employee_id: entity.owner_id },
          select: { employee_name: true, email: true },
        })
      : null;

    // Alias map: template variable name -> candidate record field names
    // "fieldA+fieldB" joins two fields with a space.
    // Special keys starting with "$" are resolved from context (not entity fields).
    const ALIAS_MAP = {
      // ── Name composites ──
      contact_name:   ['contact_name', 'first_name+last_name', 'name'],
      full_name:      ['first_name+last_name', 'name', 'contact_name'],
      // ── Company ──
      company_name:   ['company_name', 'company', 'account_name', 'name'],
      company:        ['company', 'company_name', 'account_name'],
      // ── Product ──
      product_name:   ['product_name', 'name'],
      product_url:    ['product_url', 'website', 'image_url'],
      // ── Quote ──
      quote_number:   ['quote_number'],
      total_amount:   ['total_amount', 'grand_total', 'amount', 'unit_price'],
      valid_until:    ['valid_until', 'expiry_date'],
      // ── Case ──
      case_number:    ['case_number', '$entity_id'],
      case_subject:   ['subject', 'case_subject'],
      case_priority:  ['priority', 'case_priority'],
      case_status:    ['status', 'case_status'],
      update_message: ['resolution', 'description'],
      // ── Sender (logged-in user / record owner) ──
      sender_name:    ['$owner_name'],
      sender_email:   ['$owner_email'],
      // ── Misc ──
      help_center_url:['help_center_url', 'website'],
    };

    const resolved = {};
    for (const varName of tplVars) {
      // 1. Direct match on entity field
      if (data[varName] != null && data[varName] !== '') {
        resolved[varName] = String(data[varName]);
        continue;
      }

      // 2. Alias lookup
      const aliases = ALIAS_MAP[varName];
      let found = false;
      if (aliases) {
        for (const alias of aliases) {
          // Special context values
          if (alias === '$owner_name' && ownerRow?.employee_name) {
            resolved[varName] = ownerRow.employee_name; found = true; break;
          }
          if (alias === '$owner_email' && ownerRow?.email) {
            resolved[varName] = ownerRow.email; found = true; break;
          }
          if (alias === '$entity_id' && entityId != null) {
            resolved[varName] = String(entityId); found = true; break;
          }
          // Composite: "first_name+last_name"
          if (alias.includes('+')) {
            const parts = alias.split('+').map(p => data[p.trim()]).filter(Boolean);
            if (parts.length) { resolved[varName] = parts.join(' '); found = true; break; }
          } else if (data[alias] != null && data[alias] !== '') {
            resolved[varName] = String(data[alias]); found = true; break;
          }
        }
      }
      if (found) continue;

      // 3. Strip common prefixes (e.g. "case_status" -> "status")
      const stripped = varName.replace(/^(contact|account|lead|case|product)_/, '');
      if (stripped !== varName && data[stripped] != null && data[stripped] !== '') {
        resolved[varName] = String(data[stripped]);
        continue;
      }

      // 4. Leave empty for user to fill
      resolved[varName] = '';
    }

    // Also resolve recipient email
    const toEmail = data.email || data.contact_email || null;

    return { variables: resolved, to_email: toEmail };
  }

  // ── Email log queries ──────────────────────────────────────────────────────

  /**
   * Get email history for a specific CRM record.
   */
  async getEmailsForRecord(recordId) {
    return this.db.emailLog.findMany({
      where:   { related_record_id: Number(recordId) },
      orderBy: { sent_at: 'desc' },
      take:    50,
      include: {
        template: { select: { id: true, name: true, category: true } },
      },
    });
  }
}

module.exports = EmailSendService;
