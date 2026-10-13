'use strict';

const { logger } = require('./logging.service');
const { INDUSTRY_TEMPLATES } = require('./industry-templates');
const { getTenantId } = require('../middleware/tenant-scope');

/**
 * EmailTemplateService — Email template management for standardized communications.
 * 
 * Handles template CRUD, variable replacement, and usage tracking.
 * Supports HTML and plain text formats with multi-language capabilities.
 */
class EmailTemplateService {
  /** @param {import('@prisma/client').PrismaClient} prisma */
  constructor(prisma) {
    this.db = prisma;
    this._templateObjectId = null;
  }

  // ── Object ID cache ───────────────────────────────────────────────────────

  async #getTemplateObjectId() {
    if (this._templateObjectId) return this._templateObjectId;
    const obj = await this.db.uiObject.findFirst({
      where: { name: 'email_template' },
      select: { id: true },
    });
    this._templateObjectId = obj?.id;
    return this._templateObjectId;
  }

  // ── CREATE ─────────────────────────────────────────────────────────────────

  async createTemplate(data, createdBy) {
    const objectId = await this.#getTemplateObjectId();
    const tenantId = getTenantId();

    return this.db.$transaction(async (tx) => {
      // Create anchor record
      const record = objectId
        ? await tx.record.create({
            data: {
              object_id: objectId,
              created_by: createdBy ?? null,
              assigned_to: createdBy ?? null,
              tenant_id: tenantId,
            },
          })
        : null;

      // Parse variables from content
      const variables = this.#extractVariables(data.subject, data.body_html, data.body_text);

      // Create email template
      const template = await tx.emailTemplate.create({
        data: {
          name: data.name,
          category: data.category ?? null,
          object_id: data.object_id ? Number(data.object_id) : null,
          subject: data.subject,
          body_html: data.body_html ?? null,
          body_text: data.body_text ?? null,
          variables: variables.length > 0 ? variables : null,
          is_active: data.is_active ?? true,
          language: data.language ?? 'en',
          usage_count: 0,
          record_id: record?.id ?? null,
          created_by: createdBy ?? null,
          tenant_id: tenantId,
        },
      });

      return { ...template, record: record ?? undefined };
    }, { timeout: 30000 });
  }

  // ── READ ───────────────────────────────────────────────────────────────────

  async getTemplate(id) {
    const templateId = parseInt(id);
    if (isNaN(templateId) || templateId <= 0) {
      throw new Error('Invalid template ID');
    }

    const template = await this.db.emailTemplate.findUnique({
      where: { id: templateId },
      include: {
        record: true,
        object: { select: { id: true, name: true, label: true, module_id: true, module: { select: { id: true, label: true } } } },
        email_logs: {
          take: 10,
          orderBy: { sent_at: 'desc' },
          select: {
            id: true,
            to_email: true,
            status: true,
            sent_at: true,
            opened_at: true,
          },
        },
      },
    });

    // If variables are empty (template created before regex fix), re-extract on read
    if (template && (!Array.isArray(template.variables) || !template.variables.length)) {
      const extracted = this.#extractVariables(template.subject, template.body_html, template.body_text);
      if (extracted.length) {
        template.variables = extracted;
        // Persist the fix so this only happens once
        this.db.emailTemplate.update({
          where: { id: templateId },
          data:  { variables: extracted },
        }).catch(() => {});
      }
    }

    return template;
  }

  async listTemplates({
    category,
    objectId,
    isActive, // undefined → all (active + inactive); pass true/false to filter
    language,
    search,
    limit = 50,
    offset = 0,
    orderBy = { name: 'asc' },
  } = {}) {
    const where = {
      ...(category && { category }),
      ...(objectId && { object_id: Number(objectId) }),
      ...(isActive !== undefined && { is_active: isActive }),
      ...(language && { language }),
      ...(search && {
        OR: [
          { name: { contains: search } },
          { subject: { contains: search } },
          { body_text: { contains: search } },
        ],
      }),
    };

    const [templates, total] = await Promise.all([
      this.db.emailTemplate.findMany({
        where,
        orderBy,
        take: limit,
        skip: offset,
        select: {
          id: true,
          name: true,
          category: true,
          object_id: true,
          subject: true,
          language: true,
          is_active: true,
          usage_count: true,
          variables: true,
          created_at: true,
          updated_at: true,
          object: { select: { id: true, name: true, label: true, module_id: true, module: { select: { id: true, label: true } } } },
        },
      }),
      this.db.emailTemplate.count({ where }),
    ]);

    return { templates, total, limit, offset };
  }

  async getTemplatesByCategory() {
    return this.db.emailTemplate.groupBy({
      by: ['category'],
      where: { is_active: true },
      _count: { id: true },
      _avg: { usage_count: true },
      orderBy: { category: 'asc' },
    });
  }

  // ── UPDATE ─────────────────────────────────────────────────────────────────

  async updateTemplate(id, data, updatedBy) {
    const updateData = {
      ...(data.name !== undefined && { name: data.name }),
      ...(data.category !== undefined && { category: data.category }),
      ...(data.object_id !== undefined && { object_id: data.object_id ? Number(data.object_id) : null }),
      ...(data.subject !== undefined && { subject: data.subject }),
      ...(data.body_html !== undefined && { body_html: data.body_html }),
      ...(data.body_text !== undefined && { body_text: data.body_text }),
      ...(data.is_active !== undefined && { is_active: data.is_active }),
      ...(data.language !== undefined && { language: data.language }),
      updated_at: new Date(),
    };

    // Re-extract variables if content changed
    if (data.subject !== undefined || data.body_html !== undefined || data.body_text !== undefined) {
      const current = await this.db.emailTemplate.findUnique({
        where: { id: Number(id) },
        select: { subject: true, body_html: true, body_text: true },
      });

      const variables = this.#extractVariables(
        data.subject ?? current.subject,
        data.body_html ?? current.body_html,
        data.body_text ?? current.body_text
      );

      updateData.variables = variables.length > 0 ? variables : null;
    }

    return this.db.emailTemplate.update({
      where: { id: Number(id) },
      data: updateData,
      include: { record: true },
    });
  }

  // ── DELETE ─────────────────────────────────────────────────────────────────

  async deleteTemplate(id) {
    return this.db.$transaction(async (tx) => {
      // Check if template has been used
      const emailLogs = await tx.emailLog.count({
        where: { template_id: Number(id) },
      });

      if (emailLogs > 0) {
        // Soft delete by deactivating instead of hard delete
        return tx.emailTemplate.update({
          where: { id: Number(id) },
          data: { is_active: false, updated_at: new Date() },
        });
      }

      // Hard delete if never used
      await tx.emailTemplate.delete({ where: { id: Number(id) } });
      return { id: Number(id), deleted: true };
    });
  }

  // ── TEMPLATE PROCESSING ────────────────────────────────────────────────────

  // countUsage defaults to false so PREVIEW/render calls don't inflate analytics.
  // Only the actual send path passes { countUsage: true }.
  async renderTemplate(templateId, variables = {}, { countUsage = false } = {}) {
    const template = await this.getTemplate(templateId);
    if (!template) {
      throw new Error('Template not found');
    }

    if (!template.is_active) {
      throw new Error('Template is not active');
    }

    const rendered = {
      subject: this.#replaceVariables(template.subject, variables),
      body_html: template.body_html ? this.#replaceVariables(template.body_html, variables) : null,
      body_text: template.body_text ? this.#replaceVariables(template.body_text, variables) : null,
      template_id: template.id,
      template_name: template.name,
    };

    if (countUsage) {
      await this.#incrementUsageCount(templateId);
    }

    return rendered;
  }

  async renderTemplateByName(name, variables = {}) {
    const template = await this.db.emailTemplate.findFirst({
      where: { name, is_active: true },
    });

    if (!template) {
      throw new Error(`Template '${name}' not found or inactive`);
    }

    return this.renderTemplate(template.id, variables);
  }

  #replaceVariables(content, variables) {
    if (!content) return content;
    
    let result = content;
    
    // Replace {{variable}} patterns
    Object.keys(variables).forEach(key => {
      const regex = new RegExp(`{{\\s*${key}\\s*}}`, 'g');
      const value = variables[key] ?? '';
      result = result.replace(regex, String(value));
    });

    // Remove unmatched {{variables}}
    result = result.replace(/{{[^}]+}}/g, '');

    return result;
  }

  #extractVariables(...contents) {
    const variables = new Set();
    const regex = /{{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*}}/g;

    contents.forEach(content => {
      if (content) {
        let match;
        while ((match = regex.exec(content)) !== null) {
          variables.add(match[1]);
        }
      }
    });

    return Array.from(variables);
  }

  async #incrementUsageCount(templateId) {
    await this.db.emailTemplate.update({
      where: { id: Number(templateId) },
      data: { usage_count: { increment: 1 } },
    });
  }

  // ── PREDEFINED TEMPLATES ───────────────────────────────────────────────────

  async createDefaultTemplates(createdBy) {
    // Resolve object IDs so default templates are scoped to the right objects
    const objects = await this.db.uiObject.findMany({
      where: { name: { in: ['prospect', 'client'] } },
      select: { id: true, name: true },
    });
    const objMap = Object.fromEntries(objects.map(o => [o.name, o.id]));

    // Shared email wrapper — inline CSS for email client compatibility
    const wrap = (bannerColor, bannerIcon, content) => `
<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#f4f4f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f7;">
    <tr><td align="center" style="padding:32px 16px;">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.06);">
        <!-- Banner -->
        <tr><td style="background:linear-gradient(135deg,${bannerColor});padding:32px 40px;text-align:center;">
          <div style="font-size:40px;margin-bottom:8px;">${bannerIcon}</div>
          <h1 style="margin:0;color:#ffffff;font-size:22px;font-weight:700;letter-spacing:-0.3px;">{{company_name}}</h1>
        </td></tr>
        <!-- Content -->
        <tr><td style="padding:32px 40px;">
          ${content}
        </td></tr>
        <!-- Footer -->
        <tr><td style="padding:24px 40px;background-color:#f9fafb;border-top:1px solid #e5e7eb;text-align:center;">
          <p style="margin:0;font-size:12px;color:#9ca3af;">This email was sent by {{company_name}}. If you have questions, reply directly to this email.</p>
          <p style="margin:8px 0 0;font-size:11px;color:#d1d5db;">Sent via Genesis CRM</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;

    const defaultTemplates = [
      {
        name: 'Prospect Follow-up',
        category: 'sales',
        object_id: objMap['prospect'] ?? null,
        subject: 'Thank you for your interest, {{first_name}}',
        body_html: wrap('#6366f1,#8b5cf6', '&#128640;', `
          <h2 style="margin:0 0 16px;color:#111827;font-size:20px;">Hi {{first_name}},</h2>
          <p style="margin:0 0 16px;color:#374151;font-size:15px;line-height:1.6;">
            Thank you for your interest in our <strong>{{product_name}}</strong>. I wanted to follow up on our recent conversation about {{company}}.
          </p>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:20px 0;background:#f0f0ff;border-radius:8px;">
            <tr><td style="padding:20px;">
              <p style="margin:0 0 8px;font-size:14px;font-weight:600;color:#4f46e5;">Here's how we can help:</p>
              <table role="presentation" cellpadding="0" cellspacing="0">
                <tr><td style="padding:4px 0;font-size:14px;color:#374151;">&#10003;&ensp;Reduce operational costs by up to 30%</td></tr>
                <tr><td style="padding:4px 0;font-size:14px;color:#374151;">&#10003;&ensp;Streamline your sales pipeline</td></tr>
                <tr><td style="padding:4px 0;font-size:14px;color:#374151;">&#10003;&ensp;Scale with automated workflows</td></tr>
              </table>
            </td></tr>
          </table>
          <p style="margin:0 0 24px;color:#374151;font-size:15px;line-height:1.6;">
            Would you be available for a <strong>15-minute call</strong> this week to discuss your specific needs?
          </p>
          <table role="presentation" cellpadding="0" cellspacing="0">
            <tr><td style="background:#6366f1;border-radius:8px;padding:12px 28px;">
              <a href="mailto:{{sender_email}}" style="color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;">Schedule a Call</a>
            </td></tr>
          </table>
          <p style="margin:24px 0 0;color:#6b7280;font-size:14px;">Best regards,<br><strong>{{sender_name}}</strong></p>
        `),
        body_text: `Hi {{first_name}},

Thank you for your interest in our {{product_name}}. I wanted to follow up on our recent conversation about {{company}}.

Here's how we can help:
- Reduce operational costs by up to 30%
- Streamline your sales pipeline
- Scale with automated workflows

Would you be available for a 15-minute call this week?

Best regards,
{{sender_name}}`,
      },
      {
        name: 'Welcome New Client',
        category: 'onboarding',
        object_id: objMap['client'] ?? null,
        subject: 'Welcome to {{company_name}}, {{first_name}}!',
        body_html: wrap('#16a34a,#22c55e', '&#127881;', `
          <h2 style="margin:0 0 16px;color:#111827;font-size:20px;">Welcome aboard, {{first_name}}!</h2>
          <p style="margin:0 0 20px;color:#374151;font-size:15px;line-height:1.6;">
            We're thrilled to have you as part of the <strong>{{company_name}}</strong> family. Your account is being set up and here's what to expect:
          </p>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 24px;">
            <tr>
              <td width="60" valign="top" style="padding:8px 0;">
                <div style="width:40px;height:40px;border-radius:50%;background:#dcfce7;text-align:center;line-height:40px;font-size:18px;">1</div>
              </td>
              <td valign="top" style="padding:12px 0 12px 8px;">
                <p style="margin:0;font-size:14px;font-weight:600;color:#111827;">Account Setup</p>
                <p style="margin:4px 0 0;font-size:13px;color:#6b7280;">Completed within 24 hours</p>
              </td>
            </tr>
            <tr>
              <td width="60" valign="top" style="padding:8px 0;">
                <div style="width:40px;height:40px;border-radius:50%;background:#dcfce7;text-align:center;line-height:40px;font-size:18px;">2</div>
              </td>
              <td valign="top" style="padding:12px 0 12px 8px;">
                <p style="margin:0;font-size:14px;font-weight:600;color:#111827;">Login Credentials</p>
                <p style="margin:4px 0 0;font-size:13px;color:#6b7280;">Sent via secure email</p>
              </td>
            </tr>
            <tr>
              <td width="60" valign="top" style="padding:8px 0;">
                <div style="width:40px;height:40px;border-radius:50%;background:#dcfce7;text-align:center;line-height:40px;font-size:18px;">3</div>
              </td>
              <td valign="top" style="padding:12px 0 12px 8px;">
                <p style="margin:0;font-size:14px;font-weight:600;color:#111827;">Onboarding Call</p>
                <p style="margin:4px 0 0;font-size:13px;color:#6b7280;">Our team contacts you within 48 hours</p>
              </td>
            </tr>
          </table>
          <table role="presentation" cellpadding="0" cellspacing="0">
            <tr><td style="background:#16a34a;border-radius:8px;padding:12px 28px;">
              <a href="{{help_center_url}}" style="color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;">Visit Help Center</a>
            </td></tr>
          </table>
        `),
        body_text: `Welcome aboard, {{first_name}}!

We're thrilled to have you as part of {{company_name}}.

What's next:
1. Account Setup — completed within 24 hours
2. Login Credentials — sent via secure email
3. Onboarding Call — our team contacts you within 48 hours

Visit our Help Center: {{help_center_url}}`,
      },
    ];

    const createdTemplates = [];
    for (const templateData of defaultTemplates) {
      try {
        const template = await this.createTemplate(templateData, createdBy);
        createdTemplates.push(template);
      } catch (error) {
        logger.template(templateData.name, 'creation failed', { error: error.message });
      }
    }

    return createdTemplates;
  }

  // ── ANALYTICS ───────────────────────────────────────────────────────────────

  async getTemplateAnalytics(templateId) {
    const [template, emailStats] = await Promise.all([
      this.db.emailTemplate.findUnique({
        where: { id: Number(templateId) },
        select: { name: true, usage_count: true, created_at: true },
      }),
      this.db.emailLog.groupBy({
        by: ['status'],
        where: { template_id: Number(templateId) },
        _count: { id: true },
      }),
    ]);

    if (!template) return null;

    const stats = emailStats.reduce((acc, stat) => {
      acc[stat.status] = stat._count.id;
      return acc;
    }, {});

    const totalSent = Object.values(stats).reduce((sum, count) => sum + count, 0);
    const openRate = stats.delivered && stats.opened 
      ? (stats.opened / stats.delivered) * 100 
      : 0;

    return {
      template_name: template.name,
      usage_count: template.usage_count,
      created_at: template.created_at,
      email_stats: stats,
      total_sent: totalSent,
      open_rate: Math.round(openRate * 100) / 100,
    };
  }

  async getMostUsedTemplates(limit = 10) {
    return this.db.emailTemplate.findMany({
      where: { is_active: true },
      orderBy: { usage_count: 'desc' },
      take: limit,
      select: {
        id: true,
        name: true,
        category: true,
        usage_count: true,
        created_at: true,
      },
    });
  }

  // ── INDUSTRY TEMPLATE PROVISIONING ─────────────────────────────────────────

  /**
   * Provision industry-specific email templates for a tenant.
   * Called during tenant admin provisioning to seed relevant templates.
   *
   * @param {string} industry - Industry key (e.g. 'technology', 'healthcare')
   * @param {string} createdBy - Employee ID of the admin
   * @returns {Promise<Array>} Created templates
   */
  async createIndustryTemplates(industry, createdBy) {
    const templates = INDUSTRY_TEMPLATES[industry] || INDUSTRY_TEMPLATES['other'];
    if (!templates || templates.length === 0) return [];

    // Resolve object names to IDs
    const objectNames = [...new Set(templates.map(t => t.object_name).filter(Boolean))];
    const objects = await this.db.uiObject.findMany({
      where: { name: { in: objectNames } },
      select: { id: true, name: true },
    });
    const objMap = Object.fromEntries(objects.map(o => [o.name, o.id]));

    const created = [];
    for (const tpl of templates) {
      try {
        const templateData = {
          name: tpl.name,
          category: tpl.category,
          object_id: objMap[tpl.object_name] ?? null,
          subject: tpl.subject,
          body_html: tpl.body_html,
          body_text: tpl.body_text,
        };
        const result = await this.createTemplate(templateData, createdBy);
        created.push(result);
      } catch (error) {
        logger.template(tpl.name, 'creation failed', { error: error.message });
      }
    }

    return created;
  }
}

module.exports = EmailTemplateService;