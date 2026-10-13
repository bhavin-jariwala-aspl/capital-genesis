'use strict';

/**
 * Industry-specific email template definitions.
 *
 * Each industry maps to an array of template descriptors that share the same
 * shape as the `data` argument accepted by EmailTemplateService#createTemplate.
 * The `object_name` field is resolved to an `object_id` at provisioning time.
 *
 * Industries: technology, healthcare, finance, retail, manufacturing,
 *             education, real_estate, media, hospitality,
 *             professional_services, other
 */

// ── Shared HTML email wrapper ───────────────────────────────────────────────
const wrap = (bannerColor, bannerIcon, content) => `
<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#f4f4f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f7;">
    <tr><td align="center" style="padding:32px 16px;">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.06);">
        <tr><td style="background:linear-gradient(135deg,${bannerColor});padding:32px 40px;text-align:center;">
          <div style="font-size:40px;margin-bottom:8px;">${bannerIcon}</div>
          <h1 style="margin:0;color:#ffffff;font-size:22px;font-weight:700;letter-spacing:-0.3px;">{{company_name}}</h1>
        </td></tr>
        <tr><td style="padding:32px 40px;">
          ${content}
        </td></tr>
        <tr><td style="padding:24px 40px;background-color:#f9fafb;border-top:1px solid #e5e7eb;text-align:center;">
          <p style="margin:0;font-size:12px;color:#9ca3af;">This email was sent by {{company_name}}. If you have questions, reply directly to this email.</p>
          <p style="margin:8px 0 0;font-size:11px;color:#d1d5db;">Sent via Genesis CRM</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;

// ── Helper: simple text block with heading ──────────────────────────────────
const h2 = (text) => `<h2 style="margin:0 0 16px;color:#111827;font-size:20px;">${text}</h2>`;
const p  = (text) => `<p style="margin:0 0 16px;color:#374151;font-size:15px;line-height:1.6;">${text}</p>`;
const sign = () => `<p style="margin:24px 0 0;color:#6b7280;font-size:14px;">Best regards,<br><strong>{{sender_name}}</strong></p>`;
const cta = (color, label) => `
  <table role="presentation" cellpadding="0" cellspacing="0" style="margin:16px 0 24px;">
    <tr><td style="background:${color};border-radius:8px;padding:12px 28px;">
      <a href="mailto:{{sender_email}}" style="color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;">${label}</a>
    </td></tr>
  </table>`;
const bullets = (items) => items.map(i => `<tr><td style="padding:4px 0;font-size:14px;color:#374151;">&#10003;&ensp;${i}</td></tr>`).join('');
const bulletBlock = (items) => `
  <table role="presentation" cellpadding="0" cellspacing="0" style="margin:12px 0 16px;">
    ${bullets(items)}
  </table>`;

// ═══════════════════════════════════════════════════════════════════════════════
// TECHNOLOGY / SaaS
// ═══════════════════════════════════════════════════════════════════════════════
const technology = [
  {
    name: 'SaaS Lead Follow-up',
    category: 'sales',
    object_name: 'lead',
    subject: 'Thanks for your interest in {{product_name}}, {{first_name}}',
    body_html: wrap('#6366f1,#8b5cf6', '&#128640;', `
      ${h2('Hi {{first_name}},')}
      ${p('Thank you for checking out <strong>{{product_name}}</strong>. We help companies like {{company}} accelerate their digital transformation.')}
      ${bulletBlock(['14-day free trial with full features', 'SSO & API integrations out of the box', '99.9% uptime SLA', 'Dedicated onboarding engineer'])}
      ${p('Can we schedule a <strong>15-minute demo</strong> to walk you through the platform?')}
      ${cta('#6366f1', 'Book a Demo')}
      ${sign()}
    `),
    body_text: `Hi {{first_name}},\n\nThank you for checking out {{product_name}}. We help companies like {{company}} accelerate their digital transformation.\n\n- 14-day free trial with full features\n- SSO & API integrations out of the box\n- 99.9% uptime SLA\n- Dedicated onboarding engineer\n\nCan we schedule a 15-minute demo?\n\nBest regards,\n{{sender_name}}`,
  },
  {
    name: 'SaaS Quote Proposal',
    category: 'sales',
    object_name: 'quote',
    subject: 'Your {{product_name}} Proposal — Quote #{{quote_number}}',
    body_html: wrap('#0891b2,#06b6d4', '&#128196;', `
      ${h2('Hello {{contact_name}},')}
      ${p('Attached is your customized licensing proposal for <strong>{{product_name}}</strong>.')}
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 24px;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">
        <tr><td style="background:#f0fdfa;padding:14px 20px;border-bottom:1px solid #e5e7eb;">
          <p style="margin:0;font-size:13px;font-weight:700;color:#0e7490;text-transform:uppercase;">Proposal Summary</p>
        </td></tr>
        <tr><td style="padding:12px 20px;border-bottom:1px solid #f3f4f6;font-size:14px;"><strong>Quote #:</strong> {{quote_number}}</td></tr>
        <tr><td style="padding:12px 20px;border-bottom:1px solid #f3f4f6;font-size:14px;"><strong>Annual License:</strong> {{total_amount}}</td></tr>
        <tr><td style="padding:12px 20px;font-size:14px;"><strong>Valid Until:</strong> {{valid_until}}</td></tr>
      </table>
      ${p('This quote includes implementation support and a dedicated success manager. Let me know if you have questions.')}
      ${sign()}
    `),
    body_text: `Hello {{contact_name}},\n\nAttached is your customized licensing proposal for {{product_name}}.\n\nQuote #: {{quote_number}}\nAnnual License: {{total_amount}}\nValid Until: {{valid_until}}\n\nThis includes implementation support and a dedicated success manager.\n\nBest regards,\n{{sender_name}}`,
  },
  {
    name: 'SaaS Welcome & Onboarding',
    category: 'onboarding',
    object_name: 'contact',
    subject: 'Welcome to {{company_name}}, {{first_name}} — let\'s get you started',
    body_html: wrap('#16a34a,#22c55e', '&#127881;', `
      ${h2('Welcome aboard, {{first_name}}!')}
      ${p('Your <strong>{{company_name}}</strong> account is ready. Here\'s what to expect:')}
      ${bulletBlock(['Credentials sent to your inbox', 'Onboarding call scheduled within 24h', 'Access to knowledge base & API docs', 'Slack channel for real-time support'])}
      ${cta('#16a34a', 'Log in to Your Dashboard')}
      ${sign()}
    `),
    body_text: `Welcome aboard, {{first_name}}!\n\nYour {{company_name}} account is ready.\n\n1. Credentials sent to your inbox\n2. Onboarding call scheduled within 24h\n3. Access to knowledge base & API docs\n4. Slack channel for real-time support\n\nBest regards,\n{{sender_name}}`,
  },
  {
    name: 'SaaS Support Ticket Update',
    category: 'support',
    object_name: 'case',
    subject: 'Ticket #{{case_number}} Update — {{case_subject}}',
    body_html: wrap('#ea580c,#f97316', '&#128221;', `
      ${h2('Hello {{contact_name}},')}
      ${p('We have an update on your support ticket:')}
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 20px;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">
        <tr><td style="padding:12px 20px;border-bottom:1px solid #f3f4f6;font-size:14px;"><strong>Ticket #:</strong> {{case_number}}</td></tr>
        <tr><td style="padding:12px 20px;border-bottom:1px solid #f3f4f6;font-size:14px;"><strong>Subject:</strong> {{case_subject}}</td></tr>
        <tr><td style="padding:12px 20px;border-bottom:1px solid #f3f4f6;font-size:14px;"><strong>Priority:</strong> {{case_priority}}</td></tr>
        <tr><td style="padding:12px 20px;font-size:14px;"><strong>Status:</strong> {{case_status}}</td></tr>
      </table>
      <div style="background:#f9fafb;border-radius:8px;padding:16px 20px;margin:0 0 20px;">
        <p style="margin:0 0 6px;font-size:13px;font-weight:600;color:#374151;">Latest Update:</p>
        <p style="margin:0;font-size:14px;color:#374151;line-height:1.6;">{{update_message}}</p>
      </div>
      ${p('Reply to this email if you have further questions.')}
    `),
    body_text: `Hello {{contact_name}},\n\nUpdate on your support ticket:\n\nTicket #: {{case_number}}\nSubject: {{case_subject}}\nPriority: {{case_priority}}\nStatus: {{case_status}}\n\nLatest Update:\n{{update_message}}\n\nReply to this email if you have further questions.`,
  },
  {
    name: 'SaaS Product Announcement',
    category: 'marketing',
    object_name: 'product',
    subject: 'Introducing {{product_name}} — Built for Modern Teams',
    body_html: wrap('#7c3aed,#a855f7', '&#128230;', `
      ${h2('Hi {{contact_name}},')}
      ${p('We\'re excited to introduce <strong>{{product_name}}</strong> — designed to help your team ship faster and collaborate better.')}
      ${bulletBlock(['Cloud-native architecture', 'Enterprise-grade security & compliance', 'RESTful API with 200+ endpoints', 'Real-time analytics dashboard'])}
      ${p('Starting at <strong>{{unit_price}}</strong>/month. Ready to see it in action?')}
      ${cta('#7c3aed', 'Request a Demo')}
      ${sign()}
    `),
    body_text: `Hi {{contact_name}},\n\nIntroducing {{product_name}} — designed to help your team ship faster.\n\n- Cloud-native architecture\n- Enterprise-grade security & compliance\n- RESTful API with 200+ endpoints\n- Real-time analytics dashboard\n\nStarting at {{unit_price}}/month.\n\nBest regards,\n{{sender_name}}`,
  },
];

// ═══════════════════════════════════════════════════════════════════════════════
// HEALTHCARE
// ═══════════════════════════════════════════════════════════════════════════════
const healthcare = [
  {
    name: 'Patient Inquiry Follow-up',
    category: 'sales',
    object_name: 'lead',
    subject: 'Thank you for contacting {{company_name}}, {{first_name}}',
    body_html: wrap('#059669,#10b981', '&#9764;&#65039;', `
      ${h2('Dear {{first_name}},')}
      ${p('Thank you for reaching out to <strong>{{company_name}}</strong>. We understand that choosing a healthcare partner is an important decision.')}
      ${bulletBlock(['HIPAA-compliant patient management', 'Secure electronic health records', 'Telehealth-ready platform', '24/7 patient support portal'])}
      ${p('Our care coordinator will contact you within <strong>24 hours</strong> to discuss your needs and answer any questions.')}
      ${cta('#059669', 'Schedule a Consultation')}
      ${sign()}
    `),
    body_text: `Dear {{first_name}},\n\nThank you for reaching out to {{company_name}}. We understand that choosing a healthcare partner is important.\n\n- HIPAA-compliant patient management\n- Secure electronic health records\n- Telehealth-ready platform\n- 24/7 patient support portal\n\nOur care coordinator will contact you within 24 hours.\n\nBest regards,\n{{sender_name}}`,
  },
  {
    name: 'Healthcare Service Proposal',
    category: 'sales',
    object_name: 'quote',
    subject: 'Service Proposal #{{quote_number}} — {{company_name}}',
    body_html: wrap('#0891b2,#06b6d4', '&#128203;', `
      ${h2('Dear {{contact_name}},')}
      ${p('Please find your customized healthcare service proposal below.')}
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 24px;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">
        <tr><td style="background:#f0fdfa;padding:14px 20px;border-bottom:1px solid #e5e7eb;">
          <p style="margin:0;font-size:13px;font-weight:700;color:#0e7490;text-transform:uppercase;">Proposal Details</p>
        </td></tr>
        <tr><td style="padding:12px 20px;border-bottom:1px solid #f3f4f6;font-size:14px;"><strong>Proposal #:</strong> {{quote_number}}</td></tr>
        <tr><td style="padding:12px 20px;border-bottom:1px solid #f3f4f6;font-size:14px;"><strong>Investment:</strong> {{total_amount}}</td></tr>
        <tr><td style="padding:12px 20px;font-size:14px;"><strong>Valid Until:</strong> {{valid_until}}</td></tr>
      </table>
      ${p('All services are delivered in compliance with HIPAA, HITECH, and applicable state regulations.')}
      ${sign()}
    `),
    body_text: `Dear {{contact_name}},\n\nPlease find your healthcare service proposal below.\n\nProposal #: {{quote_number}}\nInvestment: {{total_amount}}\nValid Until: {{valid_until}}\n\nAll services are HIPAA and HITECH compliant.\n\nBest regards,\n{{sender_name}}`,
  },
  {
    name: 'Patient Welcome Package',
    category: 'onboarding',
    object_name: 'contact',
    subject: 'Welcome to {{company_name}}, {{first_name}}',
    body_html: wrap('#16a34a,#22c55e', '&#127973;', `
      ${h2('Welcome, {{first_name}}!')}
      ${p('We\'re honored to welcome you to <strong>{{company_name}}</strong>. Your health and well-being are our top priority.')}
      ${bulletBlock(['Patient portal access within 24 hours', 'Secure messaging with your care team', 'Online appointment scheduling', 'Electronic prescription management'])}
      ${p('If you have any immediate concerns, please don\'t hesitate to reach out.')}
      ${cta('#16a34a', 'Access Patient Portal')}
      ${sign()}
    `),
    body_text: `Welcome, {{first_name}}!\n\nWe're honored to welcome you to {{company_name}}.\n\n- Patient portal access within 24 hours\n- Secure messaging with your care team\n- Online appointment scheduling\n- Electronic prescription management\n\nBest regards,\n{{sender_name}}`,
  },
  {
    name: 'Patient Case Update',
    category: 'support',
    object_name: 'case',
    subject: 'Case #{{case_number}} — Update on Your Request',
    body_html: wrap('#ea580c,#f97316', '&#128221;', `
      ${h2('Dear {{contact_name}},')}
      ${p('Here is an update regarding your case with {{company_name}}:')}
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 20px;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">
        <tr><td style="padding:12px 20px;border-bottom:1px solid #f3f4f6;font-size:14px;"><strong>Case #:</strong> {{case_number}}</td></tr>
        <tr><td style="padding:12px 20px;border-bottom:1px solid #f3f4f6;font-size:14px;"><strong>Subject:</strong> {{case_subject}}</td></tr>
        <tr><td style="padding:12px 20px;font-size:14px;"><strong>Status:</strong> {{case_status}}</td></tr>
      </table>
      <div style="background:#f9fafb;border-radius:8px;padding:16px 20px;margin:0 0 20px;">
        <p style="margin:0 0 6px;font-size:13px;font-weight:600;color:#374151;">Update:</p>
        <p style="margin:0;font-size:14px;color:#374151;line-height:1.6;">{{update_message}}</p>
      </div>
      ${p('Your health information is handled in strict compliance with HIPAA regulations.')}
    `),
    body_text: `Dear {{contact_name}},\n\nUpdate regarding your case:\n\nCase #: {{case_number}}\nSubject: {{case_subject}}\nStatus: {{case_status}}\n\nUpdate:\n{{update_message}}\n\nYour health information is handled in strict compliance with HIPAA regulations.`,
  },
  {
    name: 'Healthcare Product Overview',
    category: 'marketing',
    object_name: 'product',
    subject: '{{product_name}} — Advancing Patient Care',
    body_html: wrap('#7c3aed,#a855f7', '&#129657;', `
      ${h2('Dear {{contact_name}},')}
      ${p('Learn how <strong>{{product_name}}</strong> is transforming patient outcomes and operational efficiency.')}
      ${bulletBlock(['FDA-cleared / CE-marked technology', 'EHR integration with major platforms', 'Evidence-based clinical workflows', 'HIPAA-compliant data handling'])}
      ${p('Contact our clinical solutions team to learn more.')}
      ${cta('#7c3aed', 'Request Clinical Demo')}
      ${sign()}
    `),
    body_text: `Dear {{contact_name}},\n\nLearn how {{product_name}} is transforming patient outcomes.\n\n- FDA-cleared / CE-marked technology\n- EHR integration with major platforms\n- Evidence-based clinical workflows\n- HIPAA-compliant data handling\n\nBest regards,\n{{sender_name}}`,
  },
];

// ═══════════════════════════════════════════════════════════════════════════════
// FINANCIAL SERVICES
// ═══════════════════════════════════════════════════════════════════════════════
const finance = [
  {
    name: 'Financial Inquiry Follow-up',
    category: 'sales',
    object_name: 'lead',
    subject: 'Re: Your inquiry about {{product_name}}, {{first_name}}',
    body_html: wrap('#1e40af,#3b82f6', '&#127974;', `
      ${h2('Dear {{first_name}},')}
      ${p('Thank you for your interest in our financial services at <strong>{{company_name}}</strong>. We\'re committed to helping you achieve your financial goals.')}
      ${bulletBlock(['Personalized wealth management strategies', 'Regulatory-compliant solutions (SEC/FINRA)', 'Real-time portfolio analytics', 'Dedicated financial advisor'])}
      ${p('I\'d love to schedule a <strong>complimentary consultation</strong> to discuss your financial objectives.')}
      ${cta('#1e40af', 'Schedule Consultation')}
      ${sign()}
    `),
    body_text: `Dear {{first_name}},\n\nThank you for your interest in {{company_name}}.\n\n- Personalized wealth management strategies\n- Regulatory-compliant solutions (SEC/FINRA)\n- Real-time portfolio analytics\n- Dedicated financial advisor\n\nI'd love to schedule a complimentary consultation.\n\nBest regards,\n{{sender_name}}`,
  },
  {
    name: 'Financial Proposal',
    category: 'sales',
    object_name: 'quote',
    subject: 'Investment Proposal #{{quote_number}} — {{company_name}}',
    body_html: wrap('#0891b2,#06b6d4', '&#128176;', `
      ${h2('Dear {{contact_name}},')}
      ${p('Enclosed is your customized financial proposal from <strong>{{company_name}}</strong>.')}
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 24px;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">
        <tr><td style="background:#eff6ff;padding:14px 20px;border-bottom:1px solid #e5e7eb;">
          <p style="margin:0;font-size:13px;font-weight:700;color:#1e40af;text-transform:uppercase;">Proposal Summary</p>
        </td></tr>
        <tr><td style="padding:12px 20px;border-bottom:1px solid #f3f4f6;font-size:14px;"><strong>Reference #:</strong> {{quote_number}}</td></tr>
        <tr><td style="padding:12px 20px;border-bottom:1px solid #f3f4f6;font-size:14px;"><strong>Projected Value:</strong> {{total_amount}}</td></tr>
        <tr><td style="padding:12px 20px;font-size:14px;"><strong>Valid Until:</strong> {{valid_until}}</td></tr>
      </table>
      ${p('This proposal is confidential and intended solely for the named recipient. Past performance does not guarantee future results.')}
      ${sign()}
    `),
    body_text: `Dear {{contact_name}},\n\nEnclosed is your financial proposal.\n\nReference #: {{quote_number}}\nProjected Value: {{total_amount}}\nValid Until: {{valid_until}}\n\nThis proposal is confidential. Past performance does not guarantee future results.\n\nBest regards,\n{{sender_name}}`,
  },
  {
    name: 'Client Welcome — Financial Services',
    category: 'onboarding',
    object_name: 'contact',
    subject: 'Welcome to {{company_name}}, {{first_name}}',
    body_html: wrap('#16a34a,#22c55e', '&#128188;', `
      ${h2('Welcome, {{first_name}}!')}
      ${p('We\'re pleased to welcome you as a valued client of <strong>{{company_name}}</strong>.')}
      ${bulletBlock(['Secure client portal with 2FA', 'Real-time account & portfolio views', 'Encrypted document vault', 'Direct line to your advisor'])}
      ${p('Your financial advisor will reach out within <strong>48 hours</strong> to complete your onboarding.')}
      ${cta('#16a34a', 'Access Client Portal')}
      ${sign()}
    `),
    body_text: `Welcome, {{first_name}}!\n\nWe're pleased to welcome you to {{company_name}}.\n\n- Secure client portal with 2FA\n- Real-time account & portfolio views\n- Encrypted document vault\n- Direct line to your advisor\n\nYour advisor will reach out within 48 hours.\n\nBest regards,\n{{sender_name}}`,
  },
  {
    name: 'Financial Case Update',
    category: 'support',
    object_name: 'case',
    subject: 'Case #{{case_number}} — Status Update',
    body_html: wrap('#ea580c,#f97316', '&#128221;', `
      ${h2('Dear {{contact_name}},')}
      ${p('An update on your service request with <strong>{{company_name}}</strong>:')}
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 20px;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">
        <tr><td style="padding:12px 20px;border-bottom:1px solid #f3f4f6;font-size:14px;"><strong>Case #:</strong> {{case_number}}</td></tr>
        <tr><td style="padding:12px 20px;border-bottom:1px solid #f3f4f6;font-size:14px;"><strong>Subject:</strong> {{case_subject}}</td></tr>
        <tr><td style="padding:12px 20px;font-size:14px;"><strong>Status:</strong> {{case_status}}</td></tr>
      </table>
      <div style="background:#f9fafb;border-radius:8px;padding:16px 20px;margin:0 0 20px;">
        <p style="margin:0;font-size:14px;color:#374151;line-height:1.6;">{{update_message}}</p>
      </div>
      ${p('All communications are transmitted via encrypted channels in compliance with financial industry regulations.')}
    `),
    body_text: `Dear {{contact_name}},\n\nUpdate on your service request:\n\nCase #: {{case_number}}\nSubject: {{case_subject}}\nStatus: {{case_status}}\n\n{{update_message}}\n\nAll communications comply with financial industry regulations.`,
  },
  {
    name: 'Financial Product Overview',
    category: 'marketing',
    object_name: 'product',
    subject: '{{product_name}} — Secure. Compliant. Powerful.',
    body_html: wrap('#7c3aed,#a855f7', '&#128200;', `
      ${h2('Dear {{contact_name}},')}
      ${p('Discover how <strong>{{product_name}}</strong> empowers financial institutions with next-generation tools.')}
      ${bulletBlock(['SOC 2 Type II certified', 'Real-time risk analytics & reporting', 'Regulatory compliance automation', 'Bank-grade encryption (AES-256)'])}
      ${p('See how leading firms are using {{product_name}} to stay ahead.')}
      ${cta('#7c3aed', 'Request a Demo')}
      ${sign()}
    `),
    body_text: `Dear {{contact_name}},\n\nDiscover {{product_name}} for financial institutions.\n\n- SOC 2 Type II certified\n- Real-time risk analytics & reporting\n- Regulatory compliance automation\n- Bank-grade encryption (AES-256)\n\nBest regards,\n{{sender_name}}`,
  },
];

// ═══════════════════════════════════════════════════════════════════════════════
// RETAIL / E-COMMERCE
// ═══════════════════════════════════════════════════════════════════════════════
const retail = [
  {
    name: 'Retail Lead Follow-up',
    category: 'sales',
    object_name: 'lead',
    subject: 'Great news for your store, {{first_name}}!',
    body_html: wrap('#dc2626,#ef4444', '&#128717;', `
      ${h2('Hi {{first_name}},')}
      ${p('Thanks for your interest in <strong>{{product_name}}</strong>! We help retailers like {{company}} boost sales and streamline operations.')}
      ${bulletBlock(['Omnichannel inventory management', 'POS integration & real-time sync', 'Customer loyalty & rewards programs', 'AI-powered demand forecasting'])}
      ${p('Let\'s chat about how we can help grow your business.')}
      ${cta('#dc2626', 'Book a Call')}
      ${sign()}
    `),
    body_text: `Hi {{first_name}},\n\nThanks for your interest in {{product_name}}!\n\n- Omnichannel inventory management\n- POS integration & real-time sync\n- Customer loyalty & rewards programs\n- AI-powered demand forecasting\n\nBest regards,\n{{sender_name}}`,
  },
  {
    name: 'Retail Quote',
    category: 'sales',
    object_name: 'quote',
    subject: 'Quote #{{quote_number}} for {{company_name}}',
    body_html: wrap('#0891b2,#06b6d4', '&#128196;', `
      ${h2('Hi {{contact_name}},')}
      ${p('Here\'s your customized retail solution quote:')}
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 24px;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">
        <tr><td style="padding:12px 20px;border-bottom:1px solid #f3f4f6;font-size:14px;"><strong>Quote #:</strong> {{quote_number}}</td></tr>
        <tr><td style="padding:12px 20px;border-bottom:1px solid #f3f4f6;font-size:14px;"><strong>Total:</strong> {{total_amount}}</td></tr>
        <tr><td style="padding:12px 20px;font-size:14px;"><strong>Valid Until:</strong> {{valid_until}}</td></tr>
      </table>
      ${p('Volume discounts available for multi-location deployments.')}
      ${sign()}
    `),
    body_text: `Hi {{contact_name}},\n\nYour retail solution quote:\n\nQuote #: {{quote_number}}\nTotal: {{total_amount}}\nValid Until: {{valid_until}}\n\nVolume discounts available for multi-location deployments.\n\nBest regards,\n{{sender_name}}`,
  },
  {
    name: 'Retail Partner Welcome',
    category: 'onboarding',
    object_name: 'contact',
    subject: 'Welcome to the {{company_name}} family, {{first_name}}!',
    body_html: wrap('#16a34a,#22c55e', '&#127881;', `
      ${h2('Welcome, {{first_name}}!')}
      ${p('You\'re now part of the <strong>{{company_name}}</strong> network! Here\'s what\'s next:')}
      ${bulletBlock(['Merchant dashboard access within 24h', 'Product catalog setup assistance', 'Payment gateway configuration', 'Marketing toolkit & brand assets'])}
      ${cta('#16a34a', 'Access Merchant Dashboard')}
      ${sign()}
    `),
    body_text: `Welcome, {{first_name}}!\n\nYou're now part of the {{company_name}} network!\n\n- Merchant dashboard access within 24h\n- Product catalog setup assistance\n- Payment gateway configuration\n- Marketing toolkit & brand assets\n\nBest regards,\n{{sender_name}}`,
  },
  {
    name: 'Retail Support Update',
    category: 'support',
    object_name: 'case',
    subject: 'Order Support #{{case_number}} — {{case_subject}}',
    body_html: wrap('#ea580c,#f97316', '&#128230;', `
      ${h2('Hi {{contact_name}},')}
      ${p('Here\'s an update on your support request:')}
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 20px;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">
        <tr><td style="padding:12px 20px;border-bottom:1px solid #f3f4f6;font-size:14px;"><strong>Ticket:</strong> #{{case_number}}</td></tr>
        <tr><td style="padding:12px 20px;border-bottom:1px solid #f3f4f6;font-size:14px;"><strong>Issue:</strong> {{case_subject}}</td></tr>
        <tr><td style="padding:12px 20px;font-size:14px;"><strong>Status:</strong> {{case_status}}</td></tr>
      </table>
      <div style="background:#f9fafb;border-radius:8px;padding:16px 20px;margin:0 0 20px;">
        <p style="margin:0;font-size:14px;color:#374151;">{{update_message}}</p>
      </div>
    `),
    body_text: `Hi {{contact_name}},\n\nUpdate on your support request:\n\nTicket: #{{case_number}}\nIssue: {{case_subject}}\nStatus: {{case_status}}\n\n{{update_message}}`,
  },
  {
    name: 'Retail Product Spotlight',
    category: 'marketing',
    object_name: 'product',
    subject: 'New: {{product_name}} — Drive More Sales',
    body_html: wrap('#7c3aed,#a855f7', '&#11088;', `
      ${h2('Hi {{contact_name}},')}
      ${p('Introducing <strong>{{product_name}}</strong> — built to help retailers increase foot traffic and online conversions.')}
      ${bulletBlock(['Seamless online-to-offline experience', 'Smart inventory replenishment', 'Customer behavior analytics', 'Multi-store management'])}
      ${p('Starting at <strong>{{unit_price}}</strong>/month per location.')}
      ${cta('#7c3aed', 'See Pricing')}
      ${sign()}
    `),
    body_text: `Hi {{contact_name}},\n\nIntroducing {{product_name}} for retailers.\n\n- Seamless online-to-offline experience\n- Smart inventory replenishment\n- Customer behavior analytics\n- Multi-store management\n\nStarting at {{unit_price}}/month per location.\n\nBest regards,\n{{sender_name}}`,
  },
];

// ═══════════════════════════════════════════════════════════════════════════════
// MANUFACTURING
// ═══════════════════════════════════════════════════════════════════════════════
const manufacturing = [
  {
    name: 'Manufacturing Lead Follow-up',
    category: 'sales',
    object_name: 'lead',
    subject: 'Re: Your inquiry about {{product_name}}, {{first_name}}',
    body_html: wrap('#b45309,#d97706', '&#127981;', `
      ${h2('Dear {{first_name}},')}
      ${p('Thank you for contacting <strong>{{company_name}}</strong>. We specialize in solutions that optimize production efficiency and supply chain performance.')}
      ${bulletBlock(['End-to-end supply chain visibility', 'Predictive maintenance & IoT integration', 'Quality control automation', 'Lean manufacturing workflows'])}
      ${p('Our solutions engineer would love to discuss your production challenges.')}
      ${cta('#b45309', 'Schedule a Plant Tour')}
      ${sign()}
    `),
    body_text: `Dear {{first_name}},\n\nThank you for contacting {{company_name}}.\n\n- End-to-end supply chain visibility\n- Predictive maintenance & IoT integration\n- Quality control automation\n- Lean manufacturing workflows\n\nBest regards,\n{{sender_name}}`,
  },
  {
    name: 'Manufacturing Quote',
    category: 'sales',
    object_name: 'quote',
    subject: 'RFQ Response #{{quote_number}} — {{company_name}}',
    body_html: wrap('#0891b2,#06b6d4', '&#128196;', `
      ${h2('Dear {{contact_name}},')}
      ${p('Please review our response to your request for quotation:')}
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 24px;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">
        <tr><td style="padding:12px 20px;border-bottom:1px solid #f3f4f6;font-size:14px;"><strong>RFQ #:</strong> {{quote_number}}</td></tr>
        <tr><td style="padding:12px 20px;border-bottom:1px solid #f3f4f6;font-size:14px;"><strong>Total Value:</strong> {{total_amount}}</td></tr>
        <tr><td style="padding:12px 20px;font-size:14px;"><strong>Valid Until:</strong> {{valid_until}}</td></tr>
      </table>
      ${p('Pricing includes tooling, first-article inspection, and freight to your facility. MOQ and lead time details are in the attached spec sheet.')}
      ${sign()}
    `),
    body_text: `Dear {{contact_name}},\n\nOur RFQ response:\n\nRFQ #: {{quote_number}}\nTotal Value: {{total_amount}}\nValid Until: {{valid_until}}\n\nPricing includes tooling, first-article inspection, and freight.\n\nBest regards,\n{{sender_name}}`,
  },
  {
    name: 'Supplier Welcome',
    category: 'onboarding',
    object_name: 'contact',
    subject: 'Welcome to the {{company_name}} supply network, {{first_name}}',
    body_html: wrap('#16a34a,#22c55e', '&#128295;', `
      ${h2('Welcome, {{first_name}}!')}
      ${p('You are now part of the <strong>{{company_name}}</strong> vendor network.')}
      ${bulletBlock(['Vendor portal access & PO management', 'Quality certification upload', 'Delivery schedule coordination', 'Invoice & payment tracking'])}
      ${cta('#16a34a', 'Access Vendor Portal')}
      ${sign()}
    `),
    body_text: `Welcome, {{first_name}}!\n\nYou are now part of the {{company_name}} vendor network.\n\n- Vendor portal access & PO management\n- Quality certification upload\n- Delivery schedule coordination\n- Invoice & payment tracking\n\nBest regards,\n{{sender_name}}`,
  },
  {
    name: 'Manufacturing Case Update',
    category: 'support',
    object_name: 'case',
    subject: 'Case #{{case_number}} — {{case_subject}}',
    body_html: wrap('#ea580c,#f97316', '&#128221;', `
      ${h2('Dear {{contact_name}},')}
      ${p('Update on your service/quality case:')}
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 20px;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">
        <tr><td style="padding:12px 20px;border-bottom:1px solid #f3f4f6;font-size:14px;"><strong>Case #:</strong> {{case_number}}</td></tr>
        <tr><td style="padding:12px 20px;border-bottom:1px solid #f3f4f6;font-size:14px;"><strong>Issue:</strong> {{case_subject}}</td></tr>
        <tr><td style="padding:12px 20px;font-size:14px;"><strong>Status:</strong> {{case_status}}</td></tr>
      </table>
      <div style="background:#f9fafb;border-radius:8px;padding:16px 20px;margin:0 0 20px;">
        <p style="margin:0;font-size:14px;color:#374151;">{{update_message}}</p>
      </div>
    `),
    body_text: `Dear {{contact_name}},\n\nCase #: {{case_number}}\nIssue: {{case_subject}}\nStatus: {{case_status}}\n\n{{update_message}}`,
  },
  {
    name: 'Industrial Product Sheet',
    category: 'marketing',
    object_name: 'product',
    subject: '{{product_name}} — Industrial-Grade Performance',
    body_html: wrap('#7c3aed,#a855f7', '&#9881;&#65039;', `
      ${h2('Dear {{contact_name}},')}
      ${p('Learn about <strong>{{product_name}}</strong> — engineered for high-volume manufacturing environments.')}
      ${bulletBlock(['ISO 9001 / ISO 14001 certified', 'MES & ERP integration ready', 'Real-time OEE monitoring', 'Predictive maintenance built-in'])}
      ${p('Unit price: <strong>{{unit_price}}</strong>. Volume pricing available.')}
      ${cta('#7c3aed', 'Request Spec Sheet')}
      ${sign()}
    `),
    body_text: `Dear {{contact_name}},\n\n{{product_name}} — for high-volume manufacturing.\n\n- ISO 9001 / ISO 14001 certified\n- MES & ERP integration ready\n- Real-time OEE monitoring\n- Predictive maintenance built-in\n\nUnit price: {{unit_price}}\n\nBest regards,\n{{sender_name}}`,
  },
];

// ═══════════════════════════════════════════════════════════════════════════════
// EDUCATION
// ═══════════════════════════════════════════════════════════════════════════════
const education = [
  {
    name: 'Education Inquiry Follow-up',
    category: 'sales',
    object_name: 'lead',
    subject: 'Thank you for your interest, {{first_name}} — {{company_name}}',
    body_html: wrap('#7c3aed,#8b5cf6', '&#127891;', `
      ${h2('Dear {{first_name}},')}
      ${p('Thank you for exploring what <strong>{{company_name}}</strong> offers. We\'re passionate about empowering educators and institutions.')}
      ${bulletBlock(['LMS integration (Canvas, Blackboard, Moodle)', 'Student lifecycle management', 'Enrollment & admissions automation', 'FERPA-compliant data handling'])}
      ${p('Would you like to see a <strong>live demo</strong> tailored to your institution?')}
      ${cta('#7c3aed', 'Request a Demo')}
      ${sign()}
    `),
    body_text: `Dear {{first_name}},\n\nThank you for exploring {{company_name}}.\n\n- LMS integration\n- Student lifecycle management\n- Enrollment & admissions automation\n- FERPA-compliant data handling\n\nBest regards,\n{{sender_name}}`,
  },
  {
    name: 'Education Proposal',
    category: 'sales',
    object_name: 'quote',
    subject: 'Proposal #{{quote_number}} — {{company_name}} for Education',
    body_html: wrap('#0891b2,#06b6d4', '&#128218;', `
      ${h2('Dear {{contact_name}},')}
      ${p('Here is your institutional licensing proposal:')}
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 24px;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">
        <tr><td style="padding:12px 20px;border-bottom:1px solid #f3f4f6;font-size:14px;"><strong>Proposal #:</strong> {{quote_number}}</td></tr>
        <tr><td style="padding:12px 20px;border-bottom:1px solid #f3f4f6;font-size:14px;"><strong>Annual License:</strong> {{total_amount}}</td></tr>
        <tr><td style="padding:12px 20px;font-size:14px;"><strong>Valid Until:</strong> {{valid_until}}</td></tr>
      </table>
      ${p('Academic pricing and multi-year discounts are reflected in this proposal.')}
      ${sign()}
    `),
    body_text: `Dear {{contact_name}},\n\nInstitutional licensing proposal:\n\nProposal #: {{quote_number}}\nAnnual License: {{total_amount}}\nValid Until: {{valid_until}}\n\nAcademic pricing included.\n\nBest regards,\n{{sender_name}}`,
  },
  {
    name: 'Student/Faculty Welcome',
    category: 'onboarding',
    object_name: 'contact',
    subject: 'Welcome to {{company_name}}, {{first_name}}!',
    body_html: wrap('#16a34a,#22c55e', '&#128640;', `
      ${h2('Welcome, {{first_name}}!')}
      ${p('Your account at <strong>{{company_name}}</strong> is ready. Here\'s how to get started:')}
      ${bulletBlock(['Portal access with institutional SSO', 'Course catalog & enrollment system', 'Library & digital resource access', 'Academic support desk'])}
      ${cta('#16a34a', 'Access Your Portal')}
      ${sign()}
    `),
    body_text: `Welcome, {{first_name}}!\n\n- Portal access with institutional SSO\n- Course catalog & enrollment system\n- Library & digital resource access\n- Academic support desk\n\nBest regards,\n{{sender_name}}`,
  },
  {
    name: 'Education Support Update',
    category: 'support',
    object_name: 'case',
    subject: 'Request #{{case_number}} — {{case_subject}}',
    body_html: wrap('#ea580c,#f97316', '&#128221;', `
      ${h2('Dear {{contact_name}},')}
      ${p('Update on your support request:')}
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 20px;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">
        <tr><td style="padding:12px 20px;border-bottom:1px solid #f3f4f6;font-size:14px;"><strong>Request #:</strong> {{case_number}}</td></tr>
        <tr><td style="padding:12px 20px;border-bottom:1px solid #f3f4f6;font-size:14px;"><strong>Subject:</strong> {{case_subject}}</td></tr>
        <tr><td style="padding:12px 20px;font-size:14px;"><strong>Status:</strong> {{case_status}}</td></tr>
      </table>
      <div style="background:#f9fafb;border-radius:8px;padding:16px 20px;margin:0 0 20px;">
        <p style="margin:0;font-size:14px;color:#374151;">{{update_message}}</p>
      </div>
    `),
    body_text: `Dear {{contact_name}},\n\nRequest #: {{case_number}}\nSubject: {{case_subject}}\nStatus: {{case_status}}\n\n{{update_message}}`,
  },
  {
    name: 'EdTech Product Overview',
    category: 'marketing',
    object_name: 'product',
    subject: '{{product_name}} — Transform Teaching & Learning',
    body_html: wrap('#7c3aed,#a855f7', '&#128187;', `
      ${h2('Dear {{contact_name}},')}
      ${p('Discover how <strong>{{product_name}}</strong> empowers educators and engages students.')}
      ${bulletBlock(['Adaptive learning algorithms', 'Accessibility & WCAG 2.1 AA compliance', 'Analytics for student outcomes', 'FERPA & COPPA compliant'])}
      ${p('Special academic pricing: <strong>{{unit_price}}</strong> per seat/year.')}
      ${cta('#7c3aed', 'Start Free Pilot')}
      ${sign()}
    `),
    body_text: `Dear {{contact_name}},\n\n{{product_name}} — for educators and students.\n\n- Adaptive learning algorithms\n- Accessibility & WCAG 2.1 AA compliance\n- Analytics for student outcomes\n- FERPA & COPPA compliant\n\nAcademic pricing: {{unit_price}} per seat/year.\n\nBest regards,\n{{sender_name}}`,
  },
];

// ═══════════════════════════════════════════════════════════════════════════════
// REAL ESTATE
// ═══════════════════════════════════════════════════════════════════════════════
const real_estate = [
  {
    name: 'Property Inquiry Follow-up',
    category: 'sales',
    object_name: 'lead',
    subject: '{{first_name}}, let\'s find your perfect property',
    body_html: wrap('#0d9488,#14b8a6', '&#127968;', `
      ${h2('Hi {{first_name}},')}
      ${p('Thank you for your inquiry with <strong>{{company_name}}</strong>. I\'d love to help you find the right property.')}
      ${bulletBlock(['Curated property listings matching your criteria', 'Virtual & in-person tour scheduling', 'Market analysis & pricing guidance', 'End-to-end transaction support'])}
      ${p('When would be a good time for a <strong>15-minute call</strong> to discuss what you\'re looking for?')}
      ${cta('#0d9488', 'Schedule a Viewing')}
      ${sign()}
    `),
    body_text: `Hi {{first_name}},\n\nThank you for your inquiry with {{company_name}}.\n\n- Curated property listings\n- Virtual & in-person tours\n- Market analysis & pricing guidance\n- End-to-end transaction support\n\nBest regards,\n{{sender_name}}`,
  },
  {
    name: 'Property Proposal',
    category: 'sales',
    object_name: 'quote',
    subject: 'Proposal #{{quote_number}} — Property Services',
    body_html: wrap('#0891b2,#06b6d4', '&#128196;', `
      ${h2('Dear {{contact_name}},')}
      ${p('Here is your property service/commission proposal:')}
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 24px;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">
        <tr><td style="padding:12px 20px;border-bottom:1px solid #f3f4f6;font-size:14px;"><strong>Proposal #:</strong> {{quote_number}}</td></tr>
        <tr><td style="padding:12px 20px;border-bottom:1px solid #f3f4f6;font-size:14px;"><strong>Estimated Value:</strong> {{total_amount}}</td></tr>
        <tr><td style="padding:12px 20px;font-size:14px;"><strong>Valid Until:</strong> {{valid_until}}</td></tr>
      </table>
      ${sign()}
    `),
    body_text: `Dear {{contact_name}},\n\nProposal #: {{quote_number}}\nEstimated Value: {{total_amount}}\nValid Until: {{valid_until}}\n\nBest regards,\n{{sender_name}}`,
  },
  {
    name: 'New Client Welcome — Real Estate',
    category: 'onboarding',
    object_name: 'contact',
    subject: 'Welcome to {{company_name}}, {{first_name}}!',
    body_html: wrap('#16a34a,#22c55e', '&#128273;', `
      ${h2('Welcome, {{first_name}}!')}
      ${p('Congratulations on taking the next step with <strong>{{company_name}}</strong>!')}
      ${bulletBlock(['Client portal with saved searches & alerts', 'Document signing via secure e-signature', 'Mortgage calculator & pre-approval tools', 'Dedicated agent available 7 days a week'])}
      ${cta('#16a34a', 'Browse Listings')}
      ${sign()}
    `),
    body_text: `Welcome, {{first_name}}!\n\n- Client portal with saved searches\n- Secure e-signature\n- Mortgage calculator\n- Dedicated agent 7 days/week\n\nBest regards,\n{{sender_name}}`,
  },
  {
    name: 'Real Estate Case Update',
    category: 'support',
    object_name: 'case',
    subject: 'Case #{{case_number}} — {{case_subject}}',
    body_html: wrap('#ea580c,#f97316', '&#128221;', `
      ${h2('Dear {{contact_name}},')}
      ${p('An update on your property-related request:')}
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 20px;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">
        <tr><td style="padding:12px 20px;border-bottom:1px solid #f3f4f6;font-size:14px;"><strong>Case #:</strong> {{case_number}}</td></tr>
        <tr><td style="padding:12px 20px;border-bottom:1px solid #f3f4f6;font-size:14px;"><strong>Subject:</strong> {{case_subject}}</td></tr>
        <tr><td style="padding:12px 20px;font-size:14px;"><strong>Status:</strong> {{case_status}}</td></tr>
      </table>
      <div style="background:#f9fafb;border-radius:8px;padding:16px 20px;margin:0 0 20px;">
        <p style="margin:0;font-size:14px;color:#374151;">{{update_message}}</p>
      </div>
    `),
    body_text: `Dear {{contact_name}},\n\nCase #: {{case_number}}\nSubject: {{case_subject}}\nStatus: {{case_status}}\n\n{{update_message}}`,
  },
  {
    name: 'Property Listing Feature',
    category: 'marketing',
    object_name: 'product',
    subject: 'Featured: {{product_name}} — Premium Property',
    body_html: wrap('#7c3aed,#a855f7', '&#127961;&#65039;', `
      ${h2('Dear {{contact_name}},')}
      ${p('We\'re excited to present <strong>{{product_name}}</strong> — a premium listing in our portfolio.')}
      ${bulletBlock(['Prime location with high demand', 'Professional photography & virtual tour', 'Competitive market pricing', 'Flexible financing options available'])}
      ${p('Listed at <strong>{{unit_price}}</strong>. Schedule a private viewing today.')}
      ${cta('#7c3aed', 'Schedule Viewing')}
      ${sign()}
    `),
    body_text: `Dear {{contact_name}},\n\nFeatured: {{product_name}}\n\n- Prime location\n- Professional photography & virtual tour\n- Competitive pricing\n- Flexible financing\n\nListed at {{unit_price}}.\n\nBest regards,\n{{sender_name}}`,
  },
];

// ═══════════════════════════════════════════════════════════════════════════════
// MEDIA & ENTERTAINMENT
// ═══════════════════════════════════════════════════════════════════════════════
const media = [
  {
    name: 'Media Inquiry Follow-up',
    category: 'sales',
    object_name: 'lead',
    subject: 'Let\'s create something amazing, {{first_name}}',
    body_html: wrap('#be185d,#ec4899', '&#127916;', `
      ${h2('Hi {{first_name}},')}
      ${p('Thanks for reaching out to <strong>{{company_name}}</strong>. We help media companies captivate audiences and monetize content.')}
      ${bulletBlock(['Content management & distribution', 'Audience analytics & segmentation', 'Ad revenue optimization', 'Multi-platform publishing'])}
      ${p('Let\'s discuss how we can amplify your reach.')}
      ${cta('#be185d', 'Let\'s Talk')}
      ${sign()}
    `),
    body_text: `Hi {{first_name}},\n\nThanks for reaching out to {{company_name}}.\n\n- Content management & distribution\n- Audience analytics\n- Ad revenue optimization\n- Multi-platform publishing\n\nBest regards,\n{{sender_name}}`,
  },
  {
    name: 'Media Project Proposal',
    category: 'sales',
    object_name: 'quote',
    subject: 'Project Proposal #{{quote_number}} — {{company_name}}',
    body_html: wrap('#0891b2,#06b6d4', '&#128196;', `
      ${h2('Hi {{contact_name}},')}
      ${p('Here\'s the proposal for your media project:')}
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 24px;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">
        <tr><td style="padding:12px 20px;border-bottom:1px solid #f3f4f6;font-size:14px;"><strong>Project #:</strong> {{quote_number}}</td></tr>
        <tr><td style="padding:12px 20px;border-bottom:1px solid #f3f4f6;font-size:14px;"><strong>Budget:</strong> {{total_amount}}</td></tr>
        <tr><td style="padding:12px 20px;font-size:14px;"><strong>Valid Until:</strong> {{valid_until}}</td></tr>
      </table>
      ${sign()}
    `),
    body_text: `Hi {{contact_name}},\n\nProject Proposal:\n\nProject #: {{quote_number}}\nBudget: {{total_amount}}\nValid Until: {{valid_until}}\n\nBest regards,\n{{sender_name}}`,
  },
  {
    name: 'Creator/Partner Welcome',
    category: 'onboarding',
    object_name: 'contact',
    subject: 'Welcome to {{company_name}}, {{first_name}}!',
    body_html: wrap('#16a34a,#22c55e', '&#127775;', `
      ${h2('Welcome, {{first_name}}!')}
      ${p('You\'re now part of the <strong>{{company_name}}</strong> creative network!')}
      ${bulletBlock(['Creator dashboard & content tools', 'Royalty tracking & payouts', 'Collaboration workspace', 'Brand partnership opportunities'])}
      ${cta('#16a34a', 'Open Creator Dashboard')}
      ${sign()}
    `),
    body_text: `Welcome, {{first_name}}!\n\n- Creator dashboard\n- Royalty tracking & payouts\n- Collaboration workspace\n- Brand partnership opportunities\n\nBest regards,\n{{sender_name}}`,
  },
  {
    name: 'Media Support Update',
    category: 'support',
    object_name: 'case',
    subject: 'Ticket #{{case_number}} — {{case_subject}}',
    body_html: wrap('#ea580c,#f97316', '&#128221;', `
      ${h2('Hi {{contact_name}},')}
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 20px;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">
        <tr><td style="padding:12px 20px;border-bottom:1px solid #f3f4f6;font-size:14px;"><strong>Ticket:</strong> #{{case_number}}</td></tr>
        <tr><td style="padding:12px 20px;border-bottom:1px solid #f3f4f6;font-size:14px;"><strong>Subject:</strong> {{case_subject}}</td></tr>
        <tr><td style="padding:12px 20px;font-size:14px;"><strong>Status:</strong> {{case_status}}</td></tr>
      </table>
      <div style="background:#f9fafb;border-radius:8px;padding:16px 20px;margin:0 0 20px;">
        <p style="margin:0;font-size:14px;color:#374151;">{{update_message}}</p>
      </div>
    `),
    body_text: `Hi {{contact_name}},\n\nTicket: #{{case_number}}\nSubject: {{case_subject}}\nStatus: {{case_status}}\n\n{{update_message}}`,
  },
  {
    name: 'Media Platform Feature',
    category: 'marketing',
    object_name: 'product',
    subject: '{{product_name}} — Engage. Monetize. Scale.',
    body_html: wrap('#7c3aed,#a855f7', '&#128253;', `
      ${h2('Hi {{contact_name}},')}
      ${p('Meet <strong>{{product_name}}</strong> — the all-in-one platform for modern media companies.')}
      ${bulletBlock(['AI-powered content recommendations', 'Programmatic ad integration', 'Subscriber management & paywalls', 'Cross-platform analytics'])}
      ${cta('#7c3aed', 'See It in Action')}
      ${sign()}
    `),
    body_text: `Hi {{contact_name}},\n\n{{product_name}} — for modern media companies.\n\n- AI-powered recommendations\n- Programmatic ad integration\n- Subscriber management\n- Cross-platform analytics\n\nBest regards,\n{{sender_name}}`,
  },
];

// ═══════════════════════════════════════════════════════════════════════════════
// HOSPITALITY
// ═══════════════════════════════════════════════════════════════════════════════
const hospitality = [
  {
    name: 'Guest Inquiry Follow-up',
    category: 'sales',
    object_name: 'lead',
    subject: '{{first_name}}, we\'d love to host you at {{company_name}}',
    body_html: wrap('#b45309,#f59e0b', '&#127960;&#65039;', `
      ${h2('Dear {{first_name}},')}
      ${p('Thank you for your interest in <strong>{{company_name}}</strong>. We\'re dedicated to creating exceptional guest experiences.')}
      ${bulletBlock(['Personalized concierge service', 'Premium dining & event venues', 'Loyalty rewards program', 'Flexible booking & cancellation'])}
      ${p('Let us help you plan your perfect stay or event.')}
      ${cta('#b45309', 'Check Availability')}
      ${sign()}
    `),
    body_text: `Dear {{first_name}},\n\nThank you for your interest in {{company_name}}.\n\n- Personalized concierge service\n- Premium dining & event venues\n- Loyalty rewards\n- Flexible booking\n\nBest regards,\n{{sender_name}}`,
  },
  {
    name: 'Hospitality Booking Proposal',
    category: 'sales',
    object_name: 'quote',
    subject: 'Booking Proposal #{{quote_number}} — {{company_name}}',
    body_html: wrap('#0891b2,#06b6d4', '&#128196;', `
      ${h2('Dear {{contact_name}},')}
      ${p('Please find your event/booking proposal below:')}
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 24px;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">
        <tr><td style="padding:12px 20px;border-bottom:1px solid #f3f4f6;font-size:14px;"><strong>Proposal #:</strong> {{quote_number}}</td></tr>
        <tr><td style="padding:12px 20px;border-bottom:1px solid #f3f4f6;font-size:14px;"><strong>Total:</strong> {{total_amount}}</td></tr>
        <tr><td style="padding:12px 20px;font-size:14px;"><strong>Hold Until:</strong> {{valid_until}}</td></tr>
      </table>
      ${p('Rates are subject to availability. Please confirm before the hold date to secure your reservation.')}
      ${sign()}
    `),
    body_text: `Dear {{contact_name}},\n\nBooking Proposal:\n\nProposal #: {{quote_number}}\nTotal: {{total_amount}}\nHold Until: {{valid_until}}\n\nRates subject to availability.\n\nBest regards,\n{{sender_name}}`,
  },
  {
    name: 'Guest Welcome',
    category: 'onboarding',
    object_name: 'contact',
    subject: 'Welcome to {{company_name}}, {{first_name}}!',
    body_html: wrap('#16a34a,#22c55e', '&#127881;', `
      ${h2('Welcome, {{first_name}}!')}
      ${p('We\'re thrilled to have you as part of the <strong>{{company_name}}</strong> family.')}
      ${bulletBlock(['Guest app with mobile check-in', 'Loyalty points & exclusive offers', 'Room service & amenity booking', 'Concierge chat — available 24/7'])}
      ${cta('#16a34a', 'Download Guest App')}
      ${sign()}
    `),
    body_text: `Welcome, {{first_name}}!\n\n- Guest app with mobile check-in\n- Loyalty points & exclusive offers\n- Room service & amenity booking\n- 24/7 concierge chat\n\nBest regards,\n{{sender_name}}`,
  },
  {
    name: 'Hospitality Service Update',
    category: 'support',
    object_name: 'case',
    subject: 'Request #{{case_number}} — {{case_subject}}',
    body_html: wrap('#ea580c,#f97316', '&#128221;', `
      ${h2('Dear {{contact_name}},')}
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 20px;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">
        <tr><td style="padding:12px 20px;border-bottom:1px solid #f3f4f6;font-size:14px;"><strong>Request #:</strong> {{case_number}}</td></tr>
        <tr><td style="padding:12px 20px;border-bottom:1px solid #f3f4f6;font-size:14px;"><strong>Subject:</strong> {{case_subject}}</td></tr>
        <tr><td style="padding:12px 20px;font-size:14px;"><strong>Status:</strong> {{case_status}}</td></tr>
      </table>
      <div style="background:#f9fafb;border-radius:8px;padding:16px 20px;margin:0 0 20px;">
        <p style="margin:0;font-size:14px;color:#374151;">{{update_message}}</p>
      </div>
      ${p('Your satisfaction is our priority. Please don\'t hesitate to reach out.')}
    `),
    body_text: `Dear {{contact_name}},\n\nRequest #: {{case_number}}\nSubject: {{case_subject}}\nStatus: {{case_status}}\n\n{{update_message}}\n\nYour satisfaction is our priority.`,
  },
  {
    name: 'Hospitality Service Spotlight',
    category: 'marketing',
    object_name: 'product',
    subject: '{{product_name}} — Elevate the Guest Experience',
    body_html: wrap('#7c3aed,#a855f7', '&#127863;', `
      ${h2('Dear {{contact_name}},')}
      ${p('Introduce <strong>{{product_name}}</strong> to your property — designed to delight guests and drive revenue.')}
      ${bulletBlock(['Contactless check-in/check-out', 'Dynamic pricing & revenue management', 'Guest feedback & reputation management', 'PMS & OTA integrations'])}
      ${p('Starting at <strong>{{unit_price}}</strong>/room/month.')}
      ${cta('#7c3aed', 'Book a Demo')}
      ${sign()}
    `),
    body_text: `Dear {{contact_name}},\n\n{{product_name}} — designed for hospitality.\n\n- Contactless check-in/out\n- Dynamic pricing\n- Guest feedback management\n- PMS & OTA integrations\n\nStarting at {{unit_price}}/room/month.\n\nBest regards,\n{{sender_name}}`,
  },
];

// ═══════════════════════════════════════════════════════════════════════════════
// PROFESSIONAL SERVICES / CONSULTING
// ═══════════════════════════════════════════════════════════════════════════════
const professional_services = [
  {
    name: 'Consulting Inquiry Follow-up',
    category: 'sales',
    object_name: 'lead',
    subject: '{{first_name}}, let\'s discuss your business goals',
    body_html: wrap('#4338ca,#6366f1', '&#128188;', `
      ${h2('Dear {{first_name}},')}
      ${p('Thank you for considering <strong>{{company_name}}</strong>. We help organizations like {{company}} solve complex business challenges.')}
      ${bulletBlock(['Strategic advisory & transformation', 'Process optimization & change management', 'Technology consulting & integration', 'Measurable ROI with clear deliverables'])}
      ${p('I\'d welcome a <strong>30-minute discovery call</strong> to understand your priorities.')}
      ${cta('#4338ca', 'Book a Discovery Call')}
      ${sign()}
    `),
    body_text: `Dear {{first_name}},\n\nThank you for considering {{company_name}}.\n\n- Strategic advisory & transformation\n- Process optimization\n- Technology consulting\n- Measurable ROI\n\nBest regards,\n{{sender_name}}`,
  },
  {
    name: 'Consulting Engagement Proposal',
    category: 'sales',
    object_name: 'quote',
    subject: 'Engagement Proposal #{{quote_number}} — {{company_name}}',
    body_html: wrap('#0891b2,#06b6d4', '&#128196;', `
      ${h2('Dear {{contact_name}},')}
      ${p('Attached is our engagement proposal outlining scope, timeline, and investment:')}
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 24px;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">
        <tr><td style="padding:12px 20px;border-bottom:1px solid #f3f4f6;font-size:14px;"><strong>Engagement #:</strong> {{quote_number}}</td></tr>
        <tr><td style="padding:12px 20px;border-bottom:1px solid #f3f4f6;font-size:14px;"><strong>Investment:</strong> {{total_amount}}</td></tr>
        <tr><td style="padding:12px 20px;font-size:14px;"><strong>Valid Until:</strong> {{valid_until}}</td></tr>
      </table>
      ${p('This proposal includes all professional fees, travel, and deliverables as outlined in the scope of work.')}
      ${sign()}
    `),
    body_text: `Dear {{contact_name}},\n\nEngagement Proposal:\n\nEngagement #: {{quote_number}}\nInvestment: {{total_amount}}\nValid Until: {{valid_until}}\n\nIncludes all professional fees and deliverables.\n\nBest regards,\n{{sender_name}}`,
  },
  {
    name: 'Client Welcome — Consulting',
    category: 'onboarding',
    object_name: 'contact',
    subject: 'Welcome to {{company_name}}, {{first_name}}',
    body_html: wrap('#16a34a,#22c55e', '&#129309;', `
      ${h2('Welcome, {{first_name}}!')}
      ${p('We\'re excited to begin our engagement with you at <strong>{{company_name}}</strong>.')}
      ${bulletBlock(['Client portal with project dashboard', 'Shared document workspace', 'Weekly progress reports & milestones', 'Direct access to your engagement lead'])}
      ${cta('#16a34a', 'Access Client Portal')}
      ${sign()}
    `),
    body_text: `Welcome, {{first_name}}!\n\n- Client portal with project dashboard\n- Shared document workspace\n- Weekly progress reports\n- Direct access to your engagement lead\n\nBest regards,\n{{sender_name}}`,
  },
  {
    name: 'Consulting Case Update',
    category: 'support',
    object_name: 'case',
    subject: 'Case #{{case_number}} — {{case_subject}}',
    body_html: wrap('#ea580c,#f97316', '&#128221;', `
      ${h2('Dear {{contact_name}},')}
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 20px;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">
        <tr><td style="padding:12px 20px;border-bottom:1px solid #f3f4f6;font-size:14px;"><strong>Case #:</strong> {{case_number}}</td></tr>
        <tr><td style="padding:12px 20px;border-bottom:1px solid #f3f4f6;font-size:14px;"><strong>Subject:</strong> {{case_subject}}</td></tr>
        <tr><td style="padding:12px 20px;font-size:14px;"><strong>Status:</strong> {{case_status}}</td></tr>
      </table>
      <div style="background:#f9fafb;border-radius:8px;padding:16px 20px;margin:0 0 20px;">
        <p style="margin:0;font-size:14px;color:#374151;">{{update_message}}</p>
      </div>
    `),
    body_text: `Dear {{contact_name}},\n\nCase #: {{case_number}}\nSubject: {{case_subject}}\nStatus: {{case_status}}\n\n{{update_message}}`,
  },
  {
    name: 'Consulting Service Overview',
    category: 'marketing',
    object_name: 'product',
    subject: '{{product_name}} — Expert-Led Business Transformation',
    body_html: wrap('#7c3aed,#a855f7', '&#128161;', `
      ${h2('Dear {{contact_name}},')}
      ${p('Our <strong>{{product_name}}</strong> practice helps organizations navigate complex challenges with confidence.')}
      ${bulletBlock(['Proven methodology with 500+ engagements', 'Cross-industry expertise', 'Knowledge transfer & capability building', 'Outcome-based pricing available'])}
      ${p('Engagements start at <strong>{{unit_price}}</strong>. Let\'s explore how we can drive results for your organization.')}
      ${cta('#7c3aed', 'Explore Our Approach')}
      ${sign()}
    `),
    body_text: `Dear {{contact_name}},\n\n{{product_name}} — expert-led transformation.\n\n- 500+ engagements\n- Cross-industry expertise\n- Knowledge transfer\n- Outcome-based pricing\n\nEngagements start at {{unit_price}}.\n\nBest regards,\n{{sender_name}}`,
  },
];

// ═══════════════════════════════════════════════════════════════════════════════
// LIFE INSURANCE
// ═══════════════════════════════════════════════════════════════════════════════
const life_insurance = [
  {
    name: 'New Prospect Welcome',
    category: 'sales',
    object_name: 'lead',
    subject: 'Welcome, {{first_name}} — Let\'s Protect What Matters Most',
    body_html: wrap('#1e3a5f,#2b5f8a', '&#128737;&#65039;', `
      ${h2('Dear {{first_name}},')}
      ${p('Thank you for reaching out to <strong>{{company_name}}</strong>. Taking the first step toward protecting your family\'s financial future is one of the most important decisions you can make.')}
      ${p('My name is {{agent_name}}, and I\'ll be your dedicated insurance advisor. I\'m here to help you find the right coverage tailored to your unique situation.')}
      ${bulletBlock(['Complimentary needs analysis — no obligation', 'Coverage options from top-rated carriers', 'Personalized recommendations based on your goals', 'Transparent pricing with no hidden fees'])}
      ${p('I\'d love to schedule a <strong>30-minute needs analysis appointment</strong> to understand your goals, budget, and family situation so we can find the right protection for you.')}
      ${cta('#1e3a5f', 'Schedule Your Needs Analysis')}
      ${sign()}
    `),
    body_text: `Dear {{first_name}},\n\nThank you for reaching out to {{company_name}}. Taking the first step toward protecting your family's financial future is one of the most important decisions you can make.\n\nMy name is {{agent_name}}, and I'll be your dedicated insurance advisor.\n\n- Complimentary needs analysis — no obligation\n- Coverage options from top-rated carriers\n- Personalized recommendations based on your goals\n- Transparent pricing with no hidden fees\n\nI'd love to schedule a 30-minute needs analysis appointment to understand your goals, budget, and family situation.\n\nBest regards,\n{{sender_name}}`,
  },
  {
    name: 'Needs Analysis Follow-up',
    category: 'sales',
    object_name: 'lead',
    subject: '{{first_name}}, Your Personalized Coverage Recommendations',
    body_html: wrap('#1e3a5f,#2b5f8a', '&#128203;', `
      ${h2('Dear {{first_name}},')}
      ${p('It was a pleasure speaking with you during our initial consultation. Thank you for sharing your goals and concerns — it helps me craft the best possible protection plan for you and your family.')}
      ${p('Based on our conversation, here is a summary of your key needs:')}
      ${bulletBlock(['Income replacement coverage for your family', 'Mortgage and debt protection', 'Education funding for dependents', 'Retirement and legacy planning considerations'])}
      ${p('I\'ve identified several coverage options that align with your budget of <strong>{{premium_amount}}/month</strong> and provide the protection level we discussed. I\'d like to walk you through these options in detail.')}
      ${p('As a next step, I recommend we schedule a <strong>follow-up meeting</strong> to review the specific policy illustrations and help you choose the coverage that fits best.')}
      ${cta('#1e3a5f', 'Schedule Follow-up Meeting')}
      ${sign()}
    `),
    body_text: `Dear {{first_name}},\n\nIt was a pleasure speaking with you during our initial consultation. Thank you for sharing your goals and concerns.\n\nBased on our conversation, here is a summary of your key needs:\n\n- Income replacement coverage for your family\n- Mortgage and debt protection\n- Education funding for dependents\n- Retirement and legacy planning considerations\n\nI've identified several coverage options that align with your budget of {{premium_amount}}/month. As a next step, I recommend we schedule a follow-up meeting to review specific policy illustrations.\n\nBest regards,\n{{sender_name}}`,
  },
  {
    name: 'Quote Presentation',
    category: 'sales',
    object_name: 'quote',
    subject: 'Your Life Insurance Quote — {{coverage_amount}} Coverage',
    body_html: wrap('#1e3a5f,#2b5f8a', '&#128176;', `
      ${h2('Dear {{contact_name}},')}
      ${p('Thank you for the opportunity to prepare this coverage proposal. Below is your personalized life insurance quote based on the needs we discussed.')}
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 24px;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">
        <tr><td style="background:#eef3f8;padding:14px 20px;border-bottom:1px solid #e5e7eb;">
          <p style="margin:0;font-size:13px;font-weight:700;color:#1e3a5f;text-transform:uppercase;">Coverage Proposal Summary</p>
        </td></tr>
        <tr><td style="padding:12px 20px;border-bottom:1px solid #f3f4f6;font-size:14px;"><strong>Quote #:</strong> {{quote_number}}</td></tr>
        <tr><td style="padding:12px 20px;border-bottom:1px solid #f3f4f6;font-size:14px;"><strong>Coverage Amount:</strong> {{coverage_amount}}</td></tr>
        <tr><td style="padding:12px 20px;border-bottom:1px solid #f3f4f6;font-size:14px;"><strong>Policy Type:</strong> {{policy_type}}</td></tr>
        <tr><td style="padding:12px 20px;border-bottom:1px solid #f3f4f6;font-size:14px;"><strong>Monthly Premium:</strong> {{premium_amount}}</td></tr>
        <tr><td style="padding:12px 20px;border-bottom:1px solid #f3f4f6;font-size:14px;"><strong>Term Length:</strong> {{term_length}}</td></tr>
        <tr><td style="padding:12px 20px;font-size:14px;"><strong>Valid Until:</strong> {{valid_until}}</td></tr>
      </table>
      ${p('This quote is based on standard underwriting. Final premium may vary depending on the results of the underwriting process, including medical examination and health history review.')}
      ${p('I\'m available to walk you through this quote and compare it with alternative coverage options. Please don\'t hesitate to reach out.')}
      ${cta('#1e3a5f', 'Discuss This Quote')}
      ${sign()}
    `),
    body_text: `Dear {{contact_name}},\n\nBelow is your personalized life insurance quote:\n\nQuote #: {{quote_number}}\nCoverage Amount: {{coverage_amount}}\nPolicy Type: {{policy_type}}\nMonthly Premium: {{premium_amount}}\nTerm Length: {{term_length}}\nValid Until: {{valid_until}}\n\nThis quote is based on standard underwriting. Final premium may vary depending on the underwriting process.\n\nBest regards,\n{{sender_name}}`,
  },
  {
    name: 'Application Confirmation',
    category: 'onboarding',
    object_name: 'contact',
    subject: '{{first_name}}, Your Life Insurance Application Has Been Received',
    body_html: wrap('#1a6b3c,#228b4a', '&#9989;', `
      ${h2('Dear {{first_name}},')}
      ${p('Great news — we have received your life insurance application for <strong>{{coverage_amount}}</strong> in coverage. Thank you for choosing <strong>{{company_name}}</strong> to protect what matters most.')}
      ${p('Here is what happens next during the underwriting process:')}
      ${bulletBlock(['Application review by our underwriting team (1–2 business days)', 'Medical examination scheduling (if required)', 'Attending Physician Statement (APS) requests as needed', 'Final underwriting decision typically within 4–6 weeks'])}
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 24px;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">
        <tr><td style="background:#eef7f1;padding:14px 20px;border-bottom:1px solid #e5e7eb;">
          <p style="margin:0;font-size:13px;font-weight:700;color:#1a6b3c;text-transform:uppercase;">Application Details</p>
        </td></tr>
        <tr><td style="padding:12px 20px;border-bottom:1px solid #f3f4f6;font-size:14px;"><strong>Application #:</strong> {{application_number}}</td></tr>
        <tr><td style="padding:12px 20px;border-bottom:1px solid #f3f4f6;font-size:14px;"><strong>Coverage Applied For:</strong> {{coverage_amount}}</td></tr>
        <tr><td style="padding:12px 20px;font-size:14px;"><strong>Estimated Premium:</strong> {{premium_amount}}/month</td></tr>
      </table>
      ${p('I will keep you informed at every step of the process. If you have any questions in the meantime, please do not hesitate to reach out.')}
      ${cta('#1a6b3c', 'Contact Your Agent')}
      ${sign()}
    `),
    body_text: `Dear {{first_name}},\n\nWe have received your life insurance application for {{coverage_amount}} in coverage. Thank you for choosing {{company_name}}.\n\nWhat happens next:\n\n- Application review by our underwriting team (1–2 business days)\n- Medical examination scheduling (if required)\n- Attending Physician Statement (APS) requests as needed\n- Final underwriting decision typically within 4–6 weeks\n\nApplication #: {{application_number}}\nCoverage Applied For: {{coverage_amount}}\nEstimated Premium: {{premium_amount}}/month\n\nI will keep you informed at every step.\n\nBest regards,\n{{sender_name}}`,
  },
  {
    name: 'Underwriting Status Update',
    category: 'onboarding',
    object_name: 'contact',
    subject: 'Underwriting Update — Application #{{application_number}}',
    body_html: wrap('#1a6b3c,#228b4a', '&#128196;', `
      ${h2('Dear {{first_name}},')}
      ${p('I wanted to provide you with an update on the status of your life insurance application with <strong>{{company_name}}</strong>.')}
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 24px;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">
        <tr><td style="background:#eef7f1;padding:14px 20px;border-bottom:1px solid #e5e7eb;">
          <p style="margin:0;font-size:13px;font-weight:700;color:#1a6b3c;text-transform:uppercase;">Underwriting Status</p>
        </td></tr>
        <tr><td style="padding:12px 20px;border-bottom:1px solid #f3f4f6;font-size:14px;"><strong>Application #:</strong> {{application_number}}</td></tr>
        <tr><td style="padding:12px 20px;border-bottom:1px solid #f3f4f6;font-size:14px;"><strong>Current Status:</strong> {{underwriting_status}}</td></tr>
        <tr><td style="padding:12px 20px;font-size:14px;"><strong>Estimated Completion:</strong> {{estimated_completion}}</td></tr>
      </table>
      ${p('<strong>Completed steps:</strong>')}
      ${bulletBlock(['Application received and reviewed', 'Medical examination completed', 'Attending Physician Statements (APS) requested from your providers'])}
      ${p('<strong>Pending items:</strong>')}
      ${bulletBlock(['APS records from {{physician_name}}', 'Final underwriting review and risk assessment'])}
      ${p('The underwriting process is progressing as expected. I will notify you as soon as we receive a decision. If the carrier needs any additional information, I will reach out to you directly.')}
      ${cta('#1a6b3c', 'Contact Your Agent')}
      ${sign()}
    `),
    body_text: `Dear {{first_name}},\n\nHere is an update on your life insurance application:\n\nApplication #: {{application_number}}\nCurrent Status: {{underwriting_status}}\nEstimated Completion: {{estimated_completion}}\n\nCompleted steps:\n- Application received and reviewed\n- Medical examination completed\n- APS requested from your providers\n\nPending items:\n- APS records from {{physician_name}}\n- Final underwriting review\n\nThe process is progressing as expected. I will notify you as soon as we receive a decision.\n\nBest regards,\n{{sender_name}}`,
  },
  {
    name: 'Policy Delivery',
    category: 'onboarding',
    object_name: 'contact',
    subject: 'Congratulations, {{first_name}} — Your Life Insurance Policy Is Issued!',
    body_html: wrap('#1a6b3c,#228b4a', '&#127881;', `
      ${h2('Congratulations, {{first_name}}!')}
      ${p('I am pleased to inform you that your life insurance policy has been <strong>approved and issued</strong>. Your coverage with <strong>{{company_name}}</strong> is now active.')}
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 24px;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">
        <tr><td style="background:#eef7f1;padding:14px 20px;border-bottom:1px solid #e5e7eb;">
          <p style="margin:0;font-size:13px;font-weight:700;color:#1a6b3c;text-transform:uppercase;">Policy Details</p>
        </td></tr>
        <tr><td style="padding:12px 20px;border-bottom:1px solid #f3f4f6;font-size:14px;"><strong>Policy Number:</strong> {{policy_number}}</td></tr>
        <tr><td style="padding:12px 20px;border-bottom:1px solid #f3f4f6;font-size:14px;"><strong>Coverage Amount:</strong> {{coverage_amount}}</td></tr>
        <tr><td style="padding:12px 20px;border-bottom:1px solid #f3f4f6;font-size:14px;"><strong>Policy Type:</strong> {{policy_type}}</td></tr>
        <tr><td style="padding:12px 20px;border-bottom:1px solid #f3f4f6;font-size:14px;"><strong>Monthly Premium:</strong> {{premium_amount}}</td></tr>
        <tr><td style="padding:12px 20px;font-size:14px;"><strong>Effective Date:</strong> {{effective_date}}</td></tr>
      </table>
      ${p('<strong>Important — Free-Look Period:</strong> You have a <strong>{{free_look_days}}-day free-look period</strong> beginning from the date you receive your policy. During this time, you may review the policy and return it for a full refund of any premiums paid if you are not completely satisfied.')}
      ${bulletBlock(['Review your policy documents carefully', 'Confirm your beneficiary designations are correct', 'Set up automatic premium payments to avoid lapses', 'Store your policy in a safe, accessible location'])}
      ${p('Welcome to the {{company_name}} family. I am honored to be your agent and am here to assist you whenever you need.')}
      ${cta('#1a6b3c', 'Contact Your Agent')}
      ${sign()}
    `),
    body_text: `Congratulations, {{first_name}}!\n\nYour life insurance policy has been approved and issued. Your coverage is now active.\n\nPolicy Number: {{policy_number}}\nCoverage Amount: {{coverage_amount}}\nPolicy Type: {{policy_type}}\nMonthly Premium: {{premium_amount}}\nEffective Date: {{effective_date}}\n\nImportant — Free-Look Period: You have a {{free_look_days}}-day free-look period to review your policy and return it for a full refund if not satisfied.\n\n- Review your policy documents carefully\n- Confirm your beneficiary designations\n- Set up automatic premium payments\n- Store your policy in a safe location\n\nWelcome to the {{company_name}} family.\n\nBest regards,\n{{sender_name}}`,
  },
  {
    name: 'Annual Policy Review',
    category: 'retention',
    object_name: 'contact',
    subject: '{{first_name}}, It\'s Time for Your Annual Policy Review',
    body_html: wrap('#1e3a5f,#2b5f8a', '&#128197;', `
      ${h2('Dear {{first_name}},')}
      ${p('It has been another year since we last reviewed your life insurance coverage, and I want to make sure your policy continues to meet your needs. Life changes, and your coverage should keep pace.')}
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 24px;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">
        <tr><td style="background:#eef3f8;padding:14px 20px;border-bottom:1px solid #e5e7eb;">
          <p style="margin:0;font-size:13px;font-weight:700;color:#1e3a5f;text-transform:uppercase;">Current Policy Summary</p>
        </td></tr>
        <tr><td style="padding:12px 20px;border-bottom:1px solid #f3f4f6;font-size:14px;"><strong>Policy Number:</strong> {{policy_number}}</td></tr>
        <tr><td style="padding:12px 20px;border-bottom:1px solid #f3f4f6;font-size:14px;"><strong>Coverage Amount:</strong> {{coverage_amount}}</td></tr>
        <tr><td style="padding:12px 20px;font-size:14px;"><strong>Current Premium:</strong> {{premium_amount}}/month</td></tr>
      </table>
      ${p('During our annual review, we will discuss:')}
      ${bulletBlock(['Any life changes — marriage, new child, home purchase, retirement', 'Beneficiary designation updates', 'Whether your current coverage amount is still adequate', 'Opportunities to optimize your premium or add riders', 'Long-term care and supplemental coverage options'])}
      ${p('This complimentary review takes about <strong>20 minutes</strong> and ensures your family\'s protection stays current. I look forward to connecting with you.')}
      ${cta('#1e3a5f', 'Schedule Your Review')}
      ${sign()}
    `),
    body_text: `Dear {{first_name}},\n\nIt's time for your annual life insurance policy review.\n\nPolicy Number: {{policy_number}}\nCoverage Amount: {{coverage_amount}}\nCurrent Premium: {{premium_amount}}/month\n\nDuring our review, we will discuss:\n\n- Any life changes — marriage, new child, home purchase, retirement\n- Beneficiary designation updates\n- Whether your current coverage is still adequate\n- Opportunities to optimize your premium or add riders\n- Long-term care and supplemental coverage options\n\nThis complimentary review takes about 20 minutes.\n\nBest regards,\n{{sender_name}}`,
  },
  {
    name: 'Claims Filing Assistance',
    category: 'support',
    object_name: 'claim',
    subject: 'We Are Here to Help — Claims Filing for Policy #{{policy_number}}',
    body_html: wrap('#1e3a5f,#2b5f8a', '&#128221;', `
      ${h2('Dear {{first_name}},')}
      ${p('On behalf of everyone at <strong>{{company_name}}</strong>, please accept our heartfelt condolences during this difficult time. We are here to support you through every step of the claims process and ensure it is handled with care and efficiency.')}
      ${p('Below is an overview of what to expect and the documents you will need:')}
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 24px;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">
        <tr><td style="background:#eef3f8;padding:14px 20px;border-bottom:1px solid #e5e7eb;">
          <p style="margin:0;font-size:13px;font-weight:700;color:#1e3a5f;text-transform:uppercase;">Claim Details</p>
        </td></tr>
        <tr><td style="padding:12px 20px;border-bottom:1px solid #f3f4f6;font-size:14px;"><strong>Claim #:</strong> {{case_number}}</td></tr>
        <tr><td style="padding:12px 20px;border-bottom:1px solid #f3f4f6;font-size:14px;"><strong>Policy Number:</strong> {{policy_number}}</td></tr>
        <tr><td style="padding:12px 20px;font-size:14px;"><strong>Coverage Amount:</strong> {{coverage_amount}}</td></tr>
      </table>
      ${p('<strong>Required documents:</strong>')}
      ${bulletBlock(['Certified copy of the death certificate', 'Completed claim form (provided by our office)', 'Claimant identification (government-issued photo ID)', 'Policy document (if available)'])}
      ${p('<strong>Claims timeline:</strong>')}
      ${bulletBlock(['Claim submission and acknowledgment — 1–2 business days', 'Carrier review and processing — 10–15 business days', 'Benefit disbursement upon approval — 5–7 business days'])}
      ${p('I will personally guide you through each step. Please do not hesitate to call me directly at any time — there is no question too small.')}
      ${cta('#1e3a5f', 'Contact Your Agent')}
      ${sign()}
    `),
    body_text: `Dear {{first_name}},\n\nPlease accept our heartfelt condolences during this difficult time. We are here to support you through every step of the claims process.\n\nClaim #: {{case_number}}\nPolicy Number: {{policy_number}}\nCoverage Amount: {{coverage_amount}}\n\nRequired documents:\n- Certified copy of the death certificate\n- Completed claim form (provided by our office)\n- Claimant identification (government-issued photo ID)\n- Policy document (if available)\n\nClaims timeline:\n- Claim submission and acknowledgment — 1–2 business days\n- Carrier review and processing — 10–15 business days\n- Benefit disbursement upon approval — 5–7 business days\n\nI will personally guide you through each step. Please do not hesitate to call me directly.\n\nBest regards,\n{{sender_name}}`,
  },
];

// ═══════════════════════════════════════════════════════════════════════════════
// INDUSTRY MAP — exported lookup
// ═══════════════════════════════════════════════════════════════════════════════

const INDUSTRY_TEMPLATES = {
  technology,
  healthcare,
  finance,
  retail,
  manufacturing,
  education,
  real_estate,
  media,
  hospitality,
  professional_services,
  life_insurance,
  // "other" gets the generic technology templates as default
  other: technology,
};

const INDUSTRIES = [
  { value: 'technology',            label: 'Technology / SaaS' },
  { value: 'healthcare',            label: 'Healthcare' },
  { value: 'finance',               label: 'Financial Services' },
  { value: 'retail',                label: 'Retail / E-Commerce' },
  { value: 'manufacturing',         label: 'Manufacturing' },
  { value: 'education',             label: 'Education' },
  { value: 'real_estate',           label: 'Real Estate' },
  { value: 'media',                 label: 'Media & Entertainment' },
  { value: 'hospitality',           label: 'Hospitality' },
  { value: 'professional_services', label: 'Professional Services' },
  { value: 'life_insurance',        label: 'Life Insurance' },
  { value: 'other',                 label: 'Other / General' },
];

module.exports = { INDUSTRY_TEMPLATES, INDUSTRIES };
