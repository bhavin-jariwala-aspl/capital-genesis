'use strict';

const { authenticate }       = require('../../middleware/authenticate');
const EmailTemplateService   = require('../../services/email-template.service');
const EmailSendService       = require('../../services/email-send.service');
const ActivityService        = require('../../services/activity.service');
const MetadataService        = require('../../services/metadata.service');
const CacheService           = require('../../services/cache.service');
const { ok }                 = require('../../utils/response');
const { htmlToPdf }          = require('../../utils/html-to-pdf');

/**
 * Email routes — template CRUD, rendering, sending, and email history.
 *
 * Mounted at /api/email
 */
module.exports = async function emailRoutes(fastify) {
  const tplSvc  = new EmailTemplateService(fastify.prisma);
  const sendSvc = new EmailSendService(fastify.prisma, tplSvc);
  const actSvc  = new ActivityService(fastify.prisma);
  const cache   = new CacheService(fastify.redis);
  const metaSvc = new MetadataService(fastify.prisma, cache);

  // ── Template CRUD ──────────────────────────────────────────────────────────

  // GET /api/email/templates
  fastify.get('/templates', { preHandler: [authenticate] }, async (req) => {
    const { category, object_id, is_active, language, search, limit, offset, order_by } = req.query;
    return ok(await tplSvc.listTemplates({
      category,
      objectId: object_id || undefined,
      isActive: is_active !== undefined ? is_active === 'true' : undefined,
      language,
      search,
      limit:   limit  ? Number(limit)  : undefined,
      offset:  offset ? Number(offset) : undefined,
      orderBy: order_by ? JSON.parse(order_by) : undefined,
    }));
  });

  // GET /api/email/templates/categories — grouped by category
  fastify.get('/templates/categories', { preHandler: [authenticate] }, async () => {
    return ok(await tplSvc.getTemplatesByCategory());
  });

  // GET /api/email/templates/top — most used templates
  fastify.get('/templates/top', { preHandler: [authenticate] }, async (req) => {
    const limit = req.query.limit ? Number(req.query.limit) : 10;
    return ok(await tplSvc.getMostUsedTemplates(limit));
  });

  // GET /api/email/templates/:id
  fastify.get('/templates/:id', { preHandler: [authenticate] }, async (req, reply) => {
    const template = await tplSvc.getTemplate(req.params.id);
    if (!template) return reply.code(404).send({ error: 'Template not found' });
    return ok(template);
  });

  // POST /api/email/templates
  fastify.post('/templates', { preHandler: [authenticate] }, async (req, reply) => {
    const createdBy = req.user?.employee_id ?? req.user?.employeeId;
    const template  = await tplSvc.createTemplate(req.body ?? {}, createdBy);
    return reply.code(201).send(ok(template));
  });

  // PUT /api/email/templates/:id
  fastify.put('/templates/:id', { preHandler: [authenticate] }, async (req) => {
    const updatedBy = req.user?.employee_id ?? req.user?.employeeId;
    return ok(await tplSvc.updateTemplate(req.params.id, req.body ?? {}, updatedBy));
  });

  // DELETE /api/email/templates/:id
  fastify.delete('/templates/:id', { preHandler: [authenticate] }, async (req, reply) => {
    const result = await tplSvc.deleteTemplate(req.params.id);
    return ok(result);
  });

  // ── Available fields for template variable insertion ────────────────────────

  // GET /api/email/templates/fields/:objectId
  // Returns the list of fields (name + label) available for a given object,
  // plus common system-level variables (sender_name, etc.).
  // The frontend uses this to let users pick variables from a friendly list
  // instead of typing raw {{column_name}} placeholders.
  fastify.get('/templates/fields/:objectId', { preHandler: [authenticate] }, async (req) => {
    const objectId = Number(req.params.objectId);
    const fields = await metaSvc.getFields(objectId);

    // Map to a simple { name, label } list, excluding internal-only fields
    const EXCLUDED = new Set([
      'id', 'record_id', 'owner_id', 'created_by', 'created_at', 'updated_at', 'external_id',
    ]);

    const fieldList = fields
      .filter(f => !EXCLUDED.has(f.name))
      .map(f => ({ name: f.name, label: f.label || f.name }));

    // Add common system-level variables that aren't tied to a specific field
    const systemVars = [
      { name: 'sender_name',     label: 'Sender Name' },
      { name: 'sender_email',    label: 'Sender Email' },
      { name: 'company_name',    label: 'Company Name' },
      { name: 'help_center_url', label: 'Help Center URL' },
    ];

    return ok({ fields: fieldList, system_variables: systemVars });
  });

  // ── Template rendering (preview without sending) ───────────────────────────

  // POST /api/email/templates/:id/render
  // Body: { variables: { first_name: "John", ... } }
  fastify.post('/templates/:id/render', { preHandler: [authenticate] }, async (req) => {
    const { variables = {} } = req.body ?? {};
    return ok(await tplSvc.renderTemplate(Number(req.params.id), variables));
  });

  // GET /api/email/templates/:id/analytics
  fastify.get('/templates/:id/analytics', { preHandler: [authenticate] }, async (req, reply) => {
    const analytics = await tplSvc.getTemplateAnalytics(req.params.id);
    if (!analytics) return reply.code(404).send({ error: 'Template not found' });
    return ok(analytics);
  });

  // ── Resolve variables from record data ───────────────────────────────────────

  // GET /api/email/templates/:id/resolve/:recordId
  // Returns auto-resolved variable values by mapping the template's {{variables}}
  // to the CRM record's field data. Also returns the record's email for the "To" field.
  fastify.get('/templates/:id/resolve/:recordId', { preHandler: [authenticate] }, async (req, reply) => {
    try {
      const result = await sendSvc.resolveVariablesForRecord(
        Number(req.params.id),
        Number(req.params.recordId),
      );
      return ok(result);
    } catch (err) {
      return reply.code(404).send({ error: err.message });
    }
  });

  // ── Send email ─────────────────────────────────────────────────────────────

  // POST /api/email/send
  // Body: { template_id, variables, to_email, cc_emails, bcc_emails,
  //         related_record_id, related_type, log_activity }
  //
  // This is the primary endpoint used from ANY module/record to send an email.
  // It renders the template, dispatches the email, creates an EmailLog,
  // and optionally logs an Activity against the related record.
  fastify.post('/send', { preHandler: [authenticate] }, async (req, reply) => {
    const {
      template_id,
      variables      = {},
      to_email,
      from_email,
      cc_emails,
      bcc_emails,
      related_record_id,
      related_type,
      log_activity = true,
    } = req.body ?? {};

    const sentBy = req.user?.employee_id ?? req.user?.employeeId;

    // Send the email (renders template + dispatches + creates EmailLog)
    const emailLog = await sendSvc.sendWithTemplate({
      template_id,
      variables,
      to_email,
      from_email,
      cc_emails,
      bcc_emails,
      related_record_id,
      related_type,
      sent_by: sentBy,
    });

    // Optionally create an Activity entry so the email shows in the record's timeline
    let activity = null;
    if (log_activity && related_record_id) {
      try {
        activity = await actSvc.createActivity(
          related_record_id,
          sentBy,
          {
            type:        'email',
            subject:     `Email sent: ${emailLog.subject}`,
            description: `Sent to ${to_email}${emailLog.template_name ? ` using template "${emailLog.template_name}"` : ''}`,
          },
          req.user,
        );
      } catch {
        // Activity logging is best-effort — don't fail the send
      }
    }

    return reply.code(201).send(ok({ email_log: emailLog, activity }));
  });

  // POST /api/email/send-raw
  // Body: { to_email, subject, body_html, body_text, cc_emails, bcc_emails,
  //         related_record_id, related_type, log_activity }
  //
  // Send a one-off email without a template.
  fastify.post('/send-raw', { preHandler: [authenticate] }, async (req, reply) => {
    const {
      to_email,
      from_email,
      subject,
      body_html,
      body_text,
      cc_emails,
      bcc_emails,
      related_record_id,
      related_type,
      log_activity = true,
    } = req.body ?? {};

    const sentBy = req.user?.employee_id ?? req.user?.employeeId;

    const emailLog = await sendSvc.sendRaw({
      to_email,
      from_email,
      subject,
      body_html,
      body_text,
      cc_emails,
      bcc_emails,
      related_record_id,
      related_type,
      sent_by: sentBy,
    });

    let activity = null;
    if (log_activity && related_record_id) {
      try {
        activity = await actSvc.createActivity(
          related_record_id,
          sentBy,
          {
            type:        'email',
            subject:     `Email sent: ${subject}`,
            description: `Sent to ${to_email}`,
          },
          req.user,
        );
      } catch {
        // best-effort
      }
    }

    return reply.code(201).send(ok({ email_log: emailLog, activity }));
  });

  // ── Email history for a record ─────────────────────────────────────────────

  // POST /api/email/send-with-pdf
  // Body: { to_email, subject, body_html, body_text?, cc_emails?, bcc_emails?,
  //         pdf_html, pdf_filename?, extra_attachments?, related_record_id?,
  //         related_type?, log_activity? }
  //
  // Converts pdf_html to a real PDF attachment using Chrome headless, then sends
  // the email with the PDF attached. Falls back to sending the HTML inline if
  // Chrome is unavailable.
  // extra_attachments: [{ filename, content_base64, content_type }]
  fastify.post('/send-with-pdf', { preHandler: [authenticate] }, async (req, reply) => {
    const {
      to_email,
      from_email,
      subject,
      body_html,
      body_text,
      cc_emails,
      bcc_emails,
      pdf_html,
      pdf_filename       = 'document.pdf',
      extra_attachments  = [],
      related_record_id,
      related_type,
      log_activity       = true,
    } = req.body ?? {};

    if (!to_email) return reply.code(400).send({ success: false, error: { message: 'to_email is required' } });
    if (!subject)  return reply.code(400).send({ success: false, error: { message: 'subject is required' } });
    if (!pdf_html) return reply.code(400).send({ success: false, error: { message: 'pdf_html is required' } });

    const sentBy = req.user?.employee_id ?? req.user?.employeeId;

    // Attempt Chrome-based PDF conversion
    const pdfBuffer = await htmlToPdf(pdf_html);

    const attachments = pdfBuffer
      ? [{ filename: pdf_filename, content: pdfBuffer, contentType: 'application/pdf' }]
      : [];

    // Append any extra files the user dragged into the viewer
    if (Array.isArray(extra_attachments)) {
      for (const ea of extra_attachments) {
        if (!ea?.content_base64 || !ea?.filename) continue;
        attachments.push({
          filename:    ea.filename,
          content:     Buffer.from(ea.content_base64, 'base64'),
          contentType: ea.content_type || 'application/octet-stream',
        });
      }
    }

    // If Chrome unavailable, embed the HTML inline as fallback
    const emailHtml = body_html || (pdfBuffer ? undefined : pdf_html);

    const emailLog = await sendSvc.sendRaw({
      to_email,
      from_email,
      subject,
      body_html:  emailHtml,
      body_text,
      cc_emails,
      bcc_emails,
      related_record_id,
      related_type,
      sent_by:    sentBy,
      attachments,
    });

    let activity = null;
    if (log_activity && related_record_id) {
      try {
        activity = await actSvc.createActivity(
          related_record_id,
          sentBy,
          {
            type:        'email',
            subject:     `Email sent: ${subject}`,
            description: `Sent to ${to_email} with PDF attachment`,
          },
          req.user,
        );
      } catch { /* best-effort */ }
    }

    return reply.code(201).send(ok({
      email_log:    emailLog,
      activity,
      pdf_attached: !!pdfBuffer,
    }));
  });

  // GET /api/email/record/:recordId
  // Returns all emails sent in the context of a CRM record.
  fastify.get('/record/:recordId', { preHandler: [authenticate] }, async (req) => {
    return ok(await sendSvc.getEmailsForRecord(req.params.recordId));
  });

};
