'use strict';

const DocumentFolderService = require('../src/services/document-folder.service');
const { extractText } = require('../src/services/document-text');

/** In-memory documentFolder store that mimics the Prisma delegate surface used. */
function makePrisma(seed = []) {
  let auto = seed.reduce((m, f) => Math.max(m, f.id), 0);
  const rows = [...seed];
  const db = {
    _rows: rows,
    // Interactive transactions hand the callback a client with the same
    // delegate surface; the double is the client itself, which is enough to
    // exercise the ordering the service relies on.
    $transaction: jest.fn(async (fn) => fn(db)),
    documentFolder: {
      findFirst: jest.fn(async ({ where }) => rows.find(r => r.id === where.id) ?? null),
      findMany:  jest.fn(async ({ where } = {}) => {
        if (where?.path?.startsWith) return rows.filter(r => r.path.startsWith(where.path.startsWith));
        return [...rows].sort((a, b) => a.path.localeCompare(b.path));
      }),
      create: jest.fn(async ({ data }) => { const row = { id: ++auto, ...data }; rows.push(row); return row; }),
      update: jest.fn(async ({ where, data }) => { const r = rows.find(x => x.id === where.id); Object.assign(r, data); return r; }),
      delete: jest.fn(async ({ where }) => { const i = rows.findIndex(x => x.id === where.id); return rows.splice(i, 1)[0]; }),
    },
  };
  return db;
}

describe('DocumentFolderService', () => {
  test('createFolder materialises the path from its parent', async () => {
    const db = makePrisma();
    const svc = new DocumentFolderService(db);
    const root = await svc.createFolder({ name: 'Contracts' });
    expect(root.path).toBe('/Contracts');
    const child = await svc.createFolder({ name: '2026', parentId: root.id });
    expect(child.path).toBe('/Contracts/2026');
  });

  test('createFolder rejects an unknown parent', async () => {
    const svc = new DocumentFolderService(makePrisma());
    await expect(svc.createFolder({ name: 'x', parentId: 999 })).rejects.toThrow(/Parent folder not found/);
  });

  test('renaming a folder re-materialises descendant paths', async () => {
    const db = makePrisma([
      { id: 1, name: 'Contracts', parent_id: null, path: '/Contracts' },
      { id: 2, name: '2026', parent_id: 1, path: '/Contracts/2026' },
      { id: 3, name: 'Q1', parent_id: 2, path: '/Contracts/2026/Q1' },
    ]);
    const svc = new DocumentFolderService(db);
    await svc.updateFolder(1, { name: 'Agreements' });
    expect(db._rows.find(r => r.id === 1).path).toBe('/Agreements');
    expect(db._rows.find(r => r.id === 2).path).toBe('/Agreements/2026');
    expect(db._rows.find(r => r.id === 3).path).toBe('/Agreements/2026/Q1');
  });

  test('a folder cannot be moved into its own descendant', async () => {
    const db = makePrisma([
      { id: 1, name: 'A', parent_id: null, path: '/A' },
      { id: 2, name: 'B', parent_id: 1, path: '/A/B' },
    ]);
    const svc = new DocumentFolderService(db);
    await expect(svc.updateFolder(1, { parentId: 2 })).rejects.toThrow(/own descendant/);
  });

  test('a folder cannot be its own parent', async () => {
    const db = makePrisma([{ id: 1, name: 'A', parent_id: null, path: '/A' }]);
    const svc = new DocumentFolderService(db);
    await expect(svc.updateFolder(1, { parentId: 1 })).rejects.toThrow(/its own parent/);
  });

  test('a name with path separators is sanitised so it cannot inject fake levels', async () => {
    const svc = new DocumentFolderService(makePrisma());
    const created = await svc.createFolder({ name: 'Q1/2026\\secret' });
    // Separators collapse to a single space; the path stays a single level.
    expect(created.name).toBe('Q1 2026 secret');
    expect(created.path).toBe('/Q1 2026 secret');
  });

  test('a name that is only separators/whitespace is rejected', async () => {
    const svc = new DocumentFolderService(makePrisma());
    await expect(svc.createFolder({ name: ' // ' })).rejects.toThrow(/name is required/);
  });
});

describe('document text extraction', () => {
  test('extracts and normalises plain text', async () => {
    expect(await extractText(Buffer.from('Hello   world\n\ttab'), 'text/plain')).toBe('Hello world tab');
  });
  test('returns null for non-extractable types', async () => {
    expect(await extractText(Buffer.from([0, 1, 2]), 'image/png')).toBeNull();
  });
  test('returns null for an empty buffer', async () => {
    expect(await extractText(Buffer.alloc(0), 'text/plain')).toBeNull();
  });
});
