'use strict';

const DocumentTemplateService = require('../src/services/document-template.service');
const { mergeTemplate, extractPlaceholders } = require('../src/services/document-template.service');

describe('merge engine', () => {
  test('substitutes flat and dot-path placeholders', () => {
    const out = mergeTemplate('Hi {{name}}, from {{org.city}}.', { name: 'Ada', org: { city: 'London' } });
    expect(out).toBe('Hi Ada, from London.');
  });
  test('missing values render as empty string', () => {
    expect(mergeTemplate('X{{a.b.c}}Y', {})).toBe('XY');
  });
  test('extractPlaceholders returns distinct tokens', () => {
    expect(extractPlaceholders('{{a}} {{b.c}} {{a}}').sort()).toEqual(['a', 'b.c']);
  });
});

function makePrisma(tpl) {
  return {
    documentTemplate: {
      findFirst: jest.fn(async () => tpl),
      findMany:  jest.fn(async () => (tpl ? [tpl] : [])),
      create:    jest.fn(async ({ data }) => ({ id: 1, ...data })),
      update:    jest.fn(async ({ data }) => ({ id: 1, ...data })),
      delete:    jest.fn(async () => ({ id: 1 })),
    },
  };
}

describe('DocumentTemplateService', () => {
  const tpl = { id: 1, name: 'Welcome', body: '<p>Hello {{contact.first_name}}</p>', format: 'html', output_category: 'letters' };

  test('createTemplate requires name and body', async () => {
    const svc = new DocumentTemplateService(makePrisma());
    await expect(svc.createTemplate({ name: 'x' })).rejects.toThrow(/body is required/);
    await expect(svc.createTemplate({ body: 'x' })).rejects.toThrow(/name is required/);
  });

  test('preview merges without storing', async () => {
    const svc = new DocumentTemplateService(makePrisma(tpl));
    const res = await svc.preview(1, { contact: { first_name: 'Sam' } });
    expect(res.content).toBe('<p>Hello Sam</p>');
    expect(res.format).toBe('html');
    expect(res.placeholders).toEqual(['contact.first_name']);
  });

  test('render stores the merged output as a document via DocumentService', async () => {
    const uploads = [];
    const documents = { upload: jest.fn(async (p) => { uploads.push(p); return { id: 9, original_filename: p.filename }; }) };
    const svc = new DocumentTemplateService(makePrisma(tpl), documents);
    const doc = await svc.render(1, { data: { contact: { first_name: 'Sam' } }, entityType: 'contact', entityId: 5 });

    expect(documents.upload).toHaveBeenCalledTimes(1);
    const up = uploads[0];
    expect(up.filename).toBe('Welcome.html');
    expect(up.mimeType).toBe('text/html');
    expect(up.category).toBe('letters');
    expect(up.entityType).toBe('contact');
    expect(up.buffer.toString('utf8')).toBe('<p>Hello Sam</p>');
    expect(doc.id).toBe(9);
  });

  test('render throws without a DocumentService', async () => {
    const svc = new DocumentTemplateService(makePrisma(tpl));
    await expect(svc.render(1, {})).rejects.toThrow(/requires a DocumentService/);
  });
});
