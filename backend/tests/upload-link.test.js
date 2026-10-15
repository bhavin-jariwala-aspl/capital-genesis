'use strict';

const DocumentChecklistService = require('../src/services/document-checklist.service');
const UploadLinkService = require('../src/services/upload-link.service');
const { sign, verify } = UploadLinkService;

const CHECKLISTS = [
  { id: 1, label: 'Real estate loan', items: [{ category_code: 'kyc_id', label: 'Applicant ID', required: true }, { category_code: 'valuation', label: 'Valuation report', required: true }] },
  { id: 2, label: 'Personal loan', items: [{ category_code: 'kyc_id', label: 'Applicant ID', required: true }, { category_code: 'bank_statements', label: 'Bank statements', required: true }] },
];

function db({ docs = [], product = 'LND-RE' } = {}) {
  return {
    tenant: { findUnique: jest.fn(async () => ({ name: 'Genesis Capital' })) },
    record: { findUnique: jest.fn(async () => ({ id: 50, object_id: 9, tenant_id: 7, deleted_at: null, object: { name: 'loan_application', label: 'Loan Application', config: { title_field: 'application_no' } } })) },
    recordFieldValue: { findMany: jest.fn(async () => [{ field_name: 'product_code', str_value: product }, { field_name: 'application_no', str_value: 'LA-2026-000050' }]) },
    uiField: { findMany: jest.fn(async () => [{ name: 'product_code', field_type: 'select', options: [{ value: 'LND-RE', label: 'Real Estate Loan' }, { value: 'LND-PL', label: 'Personal Loan' }] }]) },
    uiDocumentChecklist: { findMany: jest.fn(async () => CHECKLISTS) },
    uiDocumentCategory: { findMany: jest.fn(async () => [{ code: 'kyc_id', label: 'KYC — identity' }, { code: 'valuation', label: 'Valuation' }, { code: 'bank_statements', label: 'Bank statements' }]) },
    document: { findMany: jest.fn(async () => docs) },
  };
}

describe('DocumentChecklistService', () => {
  it('picks the checklist matching the record\'s product and marks what has arrived', async () => {
    const s = await new DocumentChecklistService(db({ docs: [{ id: 3, original_filename: 'id.pdf', category: 'kyc_id', status: 'approved', created_at: new Date() }] })).forRecord(50);
    expect(s.record.title).toBe('LA-2026-000050');
    expect(s.checklists.map((c) => c.label)).toEqual(['Real estate loan']);
    expect(s.checklists[0].items.map((i) => [i.label, i.received])).toEqual([['Applicant ID', true], ['Valuation report', false]]);
    expect(s.outstanding).toBe(1);
  });

  it('does not count a rejected document as received', async () => {
    const s = await new DocumentChecklistService(db({ docs: [{ id: 4, original_filename: 'id.pdf', category: 'kyc_id', status: 'rejected', created_at: new Date() }] })).forRecord(50);
    expect(s.checklists[0].items[0]).toMatchObject({ label: 'Applicant ID', received: false });
    expect(s.outstanding).toBe(2);
  });

  it('switches checklist with the product', async () => {
    const s = await new DocumentChecklistService(db({ product: 'LND-PL' })).forRecord(50);
    expect(s.checklists.map((c) => c.label)).toEqual(['Personal loan']);
  });

  it('shows a product the checklist its applications use, read-only', async () => {
    const product = {
      ...db(),
      record: { findUnique: jest.fn(async () => ({ id: 2900, object_id: 156, tenant_id: 7, deleted_at: null, object: { name: 'financial_product', label: 'Product', config: { title_field: 'name', checklist_field: 'document_checklist' } } })) },
      recordFieldValue: { findMany: jest.fn(async () => [{ field_name: 'name', str_value: 'Real Estate Loan' }, { field_name: 'document_checklist', str_value: 'Real estate loan' }]) },
      uiField: { findMany: jest.fn(async () => []) },
      uiDocumentChecklist: {
        count: jest.fn(async () => 0),
        findMany: jest.fn(async () => CHECKLISTS.map((c) => ({ ...c, entity_type: 'loan_application' }))),
      },
    };
    const s = await new DocumentChecklistService(product).forRecord(2900);
    expect(s.reference).toBe(true);
    expect(s.outstanding).toBe(0);
    expect(s.checklists).toHaveLength(1);
    expect(s.checklists[0]).toMatchObject({ label: 'Real estate loan', applies_to: 'loan_application' });
    expect(s.checklists[0].items.map((i) => i.label)).toEqual(['Applicant ID', 'Valuation report']);
  });
});

describe('DocumentChecklistService.choose', () => {
  const packs = [{ id: 1, label: 'Individual KYC pack' }, { id: 2, label: 'Corporate KYC pack' }];
  it('picks the KYC pack for the party type, an organisation getting the corporate pack', async () => {
    const kyc = (partyType) => ({
      ...db(),
      record: { findUnique: jest.fn(async () => ({ id: 60, object_id: 228, tenant_id: 7, deleted_at: null, object: { name: 'kyc_case', label: 'KYC Case', config: { title_field: 'name' } } })) },
      recordFieldValue: { findMany: jest.fn(async () => [{ field_name: 'party_type', str_value: partyType }, { field_name: 'name', str_value: 'KYC · Trading Ltd' }]) },
      uiField: { findMany: jest.fn(async () => [{ name: 'party_type', field_type: 'formula', options: null }, { name: 'name', field_type: 'formula', options: null }]) },
      uiDocumentChecklist: { findMany: jest.fn(async () => packs.map((p) => ({ ...p, items: [] }))) },
    });
    expect((await new DocumentChecklistService(kyc('individual')).forRecord(60)).checklists.map((c) => c.label)).toEqual(['Individual KYC pack']);
    expect((await new DocumentChecklistService(kyc('organisation')).forRecord(60)).checklists.map((c) => c.label)).toEqual(['Corporate KYC pack']);
  });
});

describe('upload link tokens', () => {
  it('round-trips, and rejects tampering and expiry', () => {
    const { token } = UploadLinkService.linkFor({ tenantId: 7, recordId: 50, base: 'https://crm.example.mu' });
    expect(verify(token)).toMatchObject({ t: 7, r: 50 });
    const [p, body, sig] = token.split('.');
    const forged = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(body, 'base64url')), r: 51 })).toString('base64url');
    expect(verify(`${p}.${forged}.${sig}`)).toBeNull();
    expect(verify(sign({ t: 7, r: 50, e: Math.floor(Date.now() / 1000) - 10 }))).toBeNull();
    expect(verify('eyJhbGciOiJIUzI1NiJ9.e30.x')).toBeNull();
  });

  it('caps the lifetime at 60 days and builds the URL from the base', () => {
    const l = UploadLinkService.linkFor({ tenantId: 7, recordId: 50, days: 365, base: 'https://crm.example.mu/' });
    expect(l.url.startsWith('https://crm.example.mu/upload/gul1.')).toBe(true);
    expect(new Date(l.expires_at).getTime() - Date.now()).toBeLessThanOrEqual(60 * 86400 * 1000 + 1000);
  });
});

describe('UploadLinkService', () => {
  const payload = { t: 7, r: 50, e: Math.floor(Date.now() / 1000) + 3600 };
  const pdf = Buffer.from('%PDF-1.7 specimen').toString('base64');

  it('describes what is requested without exposing file names', async () => {
    const d = await new UploadLinkService(db({ docs: [{ id: 3, original_filename: 'secret.pdf', category: 'kyc_id', status: 'uploaded', created_at: new Date() }] })).describe(payload);
    expect(d).toMatchObject({ workspace: 'Genesis Capital', reference: 'LA-2026-000050', outstanding: 1 });
    expect(d.items).toEqual([
      { label: 'Applicant ID', category: 'kyc_id', required: true, received: true },
      { label: 'Valuation report', category: 'valuation', required: true, received: false },
    ]);
    expect(JSON.stringify(d)).not.toContain('secret.pdf');
  });

  it('refuses a link for another workspace\'s record', async () => {
    await expect(new UploadLinkService(db()).describe({ ...payload, t: 8 })).rejects.toThrow(/Link/);
  });

  it('stores an upload against the record in a requested category only, checking the content', async () => {
    const docs = { upload: jest.fn(async () => ({ id: 99 })) };
    const svc = new UploadLinkService(db(), { documentService: docs });
    await expect(svc.upload(payload, { filename: 'v.pdf', mime_type: 'application/pdf', data: pdf, category: 'tax_self_cert' })).rejects.toThrow(/requested documents/);
    await expect(svc.upload(payload, { filename: 'v.pdf', mime_type: 'application/pdf', data: Buffer.from('<html>').toString('base64'), category: 'valuation' })).rejects.toThrow(/does not match/);
    await expect(svc.upload(payload, { filename: 'v.exe', mime_type: 'application/x-msdownload', data: pdf, category: 'valuation' })).rejects.toThrow(/PDF, JPEG or PNG/);
    const r = await svc.upload(payload, { filename: 'valuation.pdf', mime_type: 'application/pdf', data: pdf, category: 'valuation' });
    expect(r.id).toBe(99);
    expect(docs.upload).toHaveBeenCalledWith(expect.objectContaining({ tenantId: 7, entityType: 'loan_application', entityId: 50, category: 'valuation' }));
  });
});
