import api from './api';
import { apiWrapper } from './apiWrapper';

const { wrap } = apiWrapper;

export const emailService = {
  // ── Templates ───────────────────────────────────────────────────────────────

  getTemplates: (params = {}) =>
    wrap(api.get('/email/templates', { params })),

  getTemplate: (id) =>
    wrap(api.get(`/email/templates/${id}`)),

  getTemplateCategories: () =>
    wrap(api.get('/email/templates/categories')),

  getTopTemplates: (limit = 10) =>
    wrap(api.get('/email/templates/top', { params: { limit } })),

  createTemplate: (data) =>
    wrap(api.post('/email/templates', data)),

  updateTemplate: (id, data) =>
    wrap(api.put(`/email/templates/${id}`, data)),

  deleteTemplate: (id) =>
    api.delete(`/email/templates/${id}`),

  // ── Rendering & preview ─────────────────────────────────────────────────────

  renderTemplate: (id, variables = {}) =>
    wrap(api.post(`/email/templates/${id}/render`, { variables })),

  getTemplateAnalytics: (id) =>
    wrap(api.get(`/email/templates/${id}/analytics`)),

  /** Resolve template variables from a CRM record's data (server-side mapping). */
  resolveVariables: (templateId, recordId) =>
    wrap(api.get(`/email/templates/${templateId}/resolve/${recordId}`)),

  /** Get available fields (name + label) for a given object, for the variable picker. */
  getTemplateFields: (objectId) =>
    wrap(api.get(`/email/templates/fields/${objectId}`)),

  // ── Sending ─────────────────────────────────────────────────────────────────

  /** Send an email using a template. Called from any record's side panel. */
  sendEmail: ({
    template_id,
    variables = {},
    to_email,
    from_email,
    cc_emails,
    bcc_emails,
    related_record_id,
    related_type,
    log_activity = true,
  }) =>
    wrap(api.post('/email/send', {
      template_id,
      variables,
      to_email,
      from_email,
      cc_emails,
      bcc_emails,
      related_record_id,
      related_type,
      log_activity,
    })),

  /** Send a one-off email without a template. */
  sendRawEmail: ({
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
  }) =>
    wrap(api.post('/email/send-raw', {
      to_email,
      from_email,
      subject,
      body_html,
      body_text,
      cc_emails,
      bcc_emails,
      related_record_id,
      related_type,
      log_activity,
    })),

  // ── Email history ───────────────────────────────────────────────────────────

  /** Get all emails sent for a specific CRM record. */
  getEmailsForRecord: (recordId) =>
    wrap(api.get(`/email/record/${recordId}`)),
};
