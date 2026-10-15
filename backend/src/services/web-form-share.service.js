'use strict';

const { NotFoundError, ValidationError } = require('../utils/errors');

/**
 * Web forms for staff — the published public forms (`/f/<key>`) listed in the
 * app, with share links and an "email this form to a client" action.
 *
 * Only forms that are published (`config.public.enabled` and a key) appear.
 * Links carry UTM tags (`utm_source=crm`, `utm_medium=email|link`), which the
 * public form stores on the record it creates, so an enquiry that came from a
 * shared link can be told apart from one that came in through the website.
 *
 * Runs with the request's tenant-scoped Prisma client: a user only ever sees
 * and sends their own workspace's forms.
 */

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const TEXT = {
  en: {
    greeting: (name) => (name ? `Dear ${name},` : 'Hello,'),
    intro: (title) => `Please use the secure link below to complete our ${title} form. It only takes a few minutes.`,
    button: 'Open the form',
    fallback: 'If the button does not work, copy this link into your browser:',
    closing: 'Kind regards,',
  },
  fr: {
    greeting: (name) => (name ? `Bonjour ${name},` : 'Bonjour,'),
    intro: (title) => `Merci d'utiliser le lien sécurisé ci-dessous pour remplir notre formulaire « ${title} ». Cela ne prend que quelques minutes.`,
    button: 'Ouvrir le formulaire',
    fallback: 'Si le bouton ne fonctionne pas, copiez ce lien dans votre navigateur :',
    closing: 'Cordialement,',
  },
};

class WebFormShareService {
  /**
   * @param {import('@prisma/client').PrismaClient} prisma tenant-scoped client
   * @param {import('./email-send.service')} emailSender
   */
  constructor(prisma, emailSender = null) {
    this.db = prisma;
    this.email = emailSender;
  }

  /** Published forms of the workspace, with what a share needs. */
  async list() {
    const forms = await this.db.uiForm.findMany({
      where: { public_key: { not: null }, is_active: true },
      include: {
        object: { select: { name: true, label: true, is_active: true } },
        field_layouts: { where: { is_visible: true }, include: { field: { select: { name: true, field_type: true, options: true, is_active: true } } } },
      },
      orderBy: { label: 'asc' },
    });
    // Staff a "Talk to …" link may name, for forms that allow it (name and id only).
    const roles = [...new Set(forms.flatMap((f) => (Array.isArray(f.config?.public?.expert_roles) ? f.config.public.expert_roles : [])))];
    const staff = roles.length && typeof this.db.employee?.findMany === 'function'
      ? await this.db.employee.findMany({ where: { is_active: true, role: { in: roles } }, select: { employee_id: true, employee_name: true, role: true }, orderBy: { employee_name: 'asc' } })
      : [];
    return forms
      .filter((f) => f.config?.public?.enabled && f.object?.is_active !== false)
      .map((f) => {
        const pub = f.config.public;
        const fields = f.field_layouts.filter((l) => l.field?.is_active);
        const product = fields.find((l) => l.field.name === 'product_code' && Array.isArray(l.field.options))?.field;
        const allow = pub.field_options?.product_code;
        const products = product
          ? product.options.filter((o) => !Array.isArray(allow) || allow.includes(o.value)).map((o) => ({ value: o.value, label: o.label ?? o.value }))
          : [];
        return {
          id: f.id,
          key: f.public_key,
          title: f.label,
          description: f.description ?? null,
          object: f.object?.label ?? f.object?.name ?? null,
          path: `/f/${f.public_key}`,
          field_count: fields.length,
          products,
          channel: pub.channel ?? null,
          expert_roles: Array.isArray(pub.expert_roles) ? pub.expert_roles : [],
          experts: Array.isArray(pub.expert_roles)
            ? staff.filter((e) => pub.expert_roles.includes(e.role)).map((e) => ({ value: e.employee_id, label: e.employee_name }))
            : [],
          success_message: pub.success_message ?? null,
        };
      });
  }

  /** The shareable URL for a form, optionally preselecting a product. */
  static url(base, key, { prod = null, expert = null, medium = 'link' } = {}) {
    const u = new URL(`/f/${key}`, base);
    if (prod) u.searchParams.set('prod', prod);
    if (expert) u.searchParams.set('expert', expert);
    u.searchParams.set('utm_source', 'crm');
    u.searchParams.set('utm_medium', medium);
    u.searchParams.set('utm_campaign', 'form_share');
    return u.toString();
  }

  /** A staff member the form may route to (its `expert_roles`), or null. */
  async #expert(form, id) {
    if (!id) return null;
    if (!form.expert_roles.length) throw new ValidationError('This form cannot be addressed to a person');
    const emp = await this.db.employee.findFirst({ where: { employee_id: String(id), is_active: true, role: { in: form.expert_roles } }, select: { employee_id: true } });
    if (!emp) throw new ValidationError('That person cannot receive this form');
    return emp.employee_id;
  }

  async #form(formId) {
    const form = (await this.list()).find((f) => f.id === Number(formId));
    if (!form) throw new NotFoundError('Web form');
    return form;
  }

  /** A link to copy, with the product checked against what the form offers. */
  async link(formId, { base, prod = null, expert = null } = {}) {
    const form = await this.#form(formId);
    if (prod && !form.products.some((p) => p.value === prod)) throw new ValidationError('This form does not offer that product');
    const who = await this.#expert(form, expert);
    return { url: WebFormShareService.url(base, form.key, { prod, expert: who, medium: 'link' }) };
  }

  /**
   * Email a form link to a client. The email is logged like any other
   * outbound email (Email logs), against the record when one is given.
   */
  async send(formId, { to, name = null, prod = null, expert = null, message = null, language = 'en', base, sender, workspace = null, recordId = null }) {
    const email = String(to ?? '').trim();
    if (!EMAIL.test(email)) throw new ValidationError('Enter a valid email address');
    const form = await this.#form(formId);
    if (prod && !form.products.some((p) => p.value === prod)) throw new ValidationError('This form does not offer that product');
    if (!this.email) throw new ValidationError('Email is not available');

    const t = TEXT[language] ?? TEXT.en;
    const url = WebFormShareService.url(base, form.key, { prod, expert: await this.#expert(form, expert), medium: 'email' });
    const product = prod ? form.products.find((p) => p.value === prod)?.label : null;
    const title = product ? `${form.title} — ${product}` : form.title;
    const from = workspace ? `${workspace}` : 'our team';
    const note = message ? String(message).slice(0, 2000) : null;

    const html = `<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.55;color:#1f2937;max-width:560px">
<p>${esc(t.greeting(name))}</p>
${note ? `<p>${esc(note).replace(/\n/g, '<br>')}</p>` : ''}
<p>${esc(t.intro(title))}</p>
<p style="margin:28px 0"><a href="${esc(url)}" style="background:#4f46e5;color:#ffffff;text-decoration:none;padding:12px 22px;border-radius:10px;font-weight:600;display:inline-block">${esc(t.button)}</a></p>
<p style="font-size:13px;color:#6b7280">${esc(t.fallback)}<br><a href="${esc(url)}" style="color:#4f46e5;word-break:break-all">${esc(url)}</a></p>
<p>${esc(t.closing)}<br>${esc(sender?.name ?? from)}${workspace ? `<br>${esc(workspace)}` : ''}</p>
</div>`;
    const text = [t.greeting(name), note, t.intro(title), url, '', t.closing, sender?.name ?? from, workspace].filter((x) => x !== null && x !== undefined).join('\n');

    const log = await this.email.sendRaw({
      to_email: email,
      subject: workspace ? `${workspace} — ${title}` : title,
      body_html: html,
      body_text: text,
      related_record_id: recordId ?? null,
      related_type: 'web_form',
      sent_by: sender?.id ?? null,
    });
    return { url, status: log?.status ?? 'sent', email_log_id: log?.id ?? null };
  }
}

module.exports = WebFormShareService;
module.exports.esc = esc;
