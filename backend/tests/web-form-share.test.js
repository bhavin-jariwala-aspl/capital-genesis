'use strict';

const WebFormShareService = require('../src/services/web-form-share.service');

const FORMS = [
  {
    id: 4, label: 'Loan calculator', description: null, public_key: 'b'.repeat(48), is_active: true,
    config: { public: { enabled: true, channel: 'calculator', field_options: { product_code: ['LND-RE'] } } },
    object: { name: 'enquiry', label: 'Enquiry', is_active: true },
    field_layouts: [{ field: { name: 'product_code', field_type: 'select', is_active: true, options: [{ value: 'LND-RE', label: 'Real Estate Loan' }, { value: 'FX-SWAP', label: 'Forex Swap' }] } }],
  },
  { id: 5, label: 'Draft', public_key: 'c'.repeat(48), is_active: true, config: { public: { enabled: false } }, object: { name: 'enquiry', is_active: true }, field_layouts: [] },
];

function make() {
  const sendRaw = jest.fn(async () => ({ id: 77, status: 'sent' }));
  const db = { uiForm: { findMany: jest.fn(async () => FORMS) } };
  return { svc: new WebFormShareService(db, { sendRaw }), sendRaw };
}

describe('WebFormShareService', () => {
  it('lists only published forms, with the products each one offers', async () => {
    const list = await make().svc.list();
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ id: 4, title: 'Loan calculator', object: 'Enquiry', path: `/f/${'b'.repeat(48)}` });
    expect(list[0].products).toEqual([{ value: 'LND-RE', label: 'Real Estate Loan' }]);
  });

  it('builds a tagged link and refuses a product the form does not offer', async () => {
    const { svc } = make();
    const { url } = await svc.link(4, { base: 'https://crm.example.mu', prod: 'LND-RE' });
    expect(url).toBe(`https://crm.example.mu/f/${'b'.repeat(48)}?prod=LND-RE&utm_source=crm&utm_medium=link&utm_campaign=form_share`);
    await expect(svc.link(4, { base: 'https://x', prod: 'FX-SWAP' })).rejects.toThrow(/does not offer/);
    await expect(svc.link(5, { base: 'https://x' })).rejects.toThrow(/Web form/);
  });

  it('emails the link in the chosen language, escaping what the user typed', async () => {
    const { svc, sendRaw } = make();
    const res = await svc.send(4, {
      to: 'client@example.mu', name: 'Anne <b>', prod: 'LND-RE', message: 'As discussed <script>x</script>', language: 'fr',
      base: 'https://crm.example.mu', workspace: 'Genesis Capital', sender: { id: 'GCRM1', name: 'Priya Ramdin' },
    });
    expect(res).toMatchObject({ status: 'sent', email_log_id: 77 });
    const mail = sendRaw.mock.calls[0][0];
    expect(mail.to_email).toBe('client@example.mu');
    expect(mail.subject).toBe('Genesis Capital — Loan calculator — Real Estate Loan');
    expect(mail.body_html).toContain('Ouvrir le formulaire');
    expect(mail.body_html).toContain('utm_medium=email');
    expect(mail.body_html).not.toContain('<script>');
    expect(mail.body_html).toContain('Anne &lt;b&gt;');
    expect(mail.related_type).toBe('web_form');
  });

  it('rejects a bad address before sending', async () => {
    const { svc, sendRaw } = make();
    await expect(svc.send(4, { to: 'not-an-email', base: 'https://x' })).rejects.toThrow(/valid email/);
    expect(sendRaw).not.toHaveBeenCalled();
  });
});
