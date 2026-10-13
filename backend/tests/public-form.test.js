'use strict';

const PublicFormService = require('../src/services/public-form.service');
const { NotFoundError, ValidationError } = require('../src/utils/errors');

const KEY = 'a'.repeat(48);

function setup({ enabled = true, publicCfg = {}, objectFields = ['first_name', 'email', 'product', 'consent_marketing', 'utm_source', 'page_url', 'channel', 'consent_timestamp', 'internal_score'] } = {}) {
  const layouts = ['first_name', 'email', 'product', 'consent_marketing'].map((name, i) => ({
    row: i, col: 0, col_span: 1,
    field: { id: i + 1, name, label: name, field_type: name === 'consent_marketing' ? 'checkbox' : 'text', is_required: false, is_active: true },
  }));
  const db = {
    uiForm: {
      findUnique: jest.fn(async () => ({
        id: 3, label: 'Get in touch', columns: 2, is_active: true, tenant_id: 42,
        config: { public: { enabled, ...publicCfg } },
        object: { id: 9, name: 'enquiry', label: 'Enquiry', is_active: true },
        field_layouts: layouts,
      })),
    },
    uiField: { findMany: jest.fn(async () => objectFields.map((name) => ({ name }))) },
    uiPipelineStage: { findFirst: jest.fn(async () => ({ id: 77 })) },
  };
  const records = { createRecord: jest.fn(async () => ({ id: 500, data: { enquiry_no: 'ENQ-2026-000123' } })) };
  return { svc: new PublicFormService(db, records), db, records };
}

describe('PublicFormService — intake', () => {
  it('creates a record from laid-out fields only, in the form\'s tenant', async () => {
    const { svc, records } = setup();
    const res = await svc.submit(KEY, { data: { first_name: 'Ana', email: 'ana@x.mu', internal_score: 999, is_admin: true } });
    const [objectId, stageId, createdBy, assignee, viewer, values] = records.createRecord.mock.calls[0];
    expect([objectId, stageId, createdBy, assignee]).toEqual([9, null, null, null]);
    expect(viewer).toEqual({ tenant_id: 42 });
    expect(values).toEqual({ first_name: 'Ana', email: 'ana@x.mu', channel: 'web_form' });
    expect(res).toEqual({ message: expect.any(String), reference: 'ENQ-2026-000123' });
  });

  it('keeps attribution only where the object has a field for it', async () => {
    const { svc, records } = setup();
    await svc.submit(KEY, { data: { first_name: 'Ana' }, utm: { utm_source: 'google', utm_medium: 'cpc' }, page_url: 'https://site/loans?prod=LND-RE' });
    const values = records.createRecord.mock.calls[0][5];
    expect(values.utm_source).toBe('google');
    expect(values.page_url).toBe('https://site/loans?prod=LND-RE');
    expect(values.utm_medium).toBeUndefined();
  });

  it('requires the consent box when the form declares one, and stamps when it was given', async () => {
    const { svc, records } = setup({ publicCfg: { consent_field: 'consent_marketing' } });
    await expect(svc.submit(KEY, { data: { first_name: 'Ana' } })).rejects.toBeInstanceOf(ValidationError);
    await svc.submit(KEY, { data: { first_name: 'Ana', consent_marketing: true } });
    expect(records.createRecord.mock.calls[0][5].consent_timestamp).toEqual(expect.any(String));
  });

  it('rejects a filled honeypot without creating anything', async () => {
    const { svc, records } = setup();
    await expect(svc.submit(KEY, { data: { first_name: 'Bot' }, _hp: 'x' })).rejects.toBeInstanceOf(ValidationError);
    expect(records.createRecord).not.toHaveBeenCalled();
  });

  it('places the record in the configured starting stage', async () => {
    const { svc, records } = setup({ publicCfg: { stage: 'new' } });
    await svc.submit(KEY, { data: { first_name: 'Ana' } });
    expect(records.createRecord.mock.calls[0][1]).toBe(77);
  });

  it('treats an unpublished form or a malformed key as not found', async () => {
    const { svc } = setup({ enabled: false });
    await expect(svc.submit(KEY, { data: {} })).rejects.toBeInstanceOf(NotFoundError);
    await expect(svc.describe('not-a-key')).rejects.toBeInstanceOf(NotFoundError);
  });

  it('describes only renderable fields', async () => {
    const { svc } = setup();
    const d = await svc.describe(KEY);
    expect(d.fields.map((f) => f.name)).toEqual(['first_name', 'email', 'product', 'consent_marketing']);
    expect(d.title).toBe('Get in touch');
  });
});
