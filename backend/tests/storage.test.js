'use strict';

const os = require('os');
const path = require('path');
const fs = require('fs');
const fsp = fs.promises;

const { LocalStorageProvider } = require('../src/services/storage/LocalStorageProvider');
const { S3StorageProvider } = require('../src/services/storage/S3StorageProvider');
const { AzureBlobStorageProvider } = require('../src/services/storage/AzureBlobStorageProvider');
const { GcsStorageProvider } = require('../src/services/storage/GcsStorageProvider');
const { toObjectKey } = require('../src/services/storage/objectKey');
const { buildDocumentKey, safeFilename, safeSegment, hashBuffer } = require('../src/services/storage');

describe('storage key helpers', () => {
  test('buildDocumentKey is tenant-first and slug-safe', () => {
    const key = buildDocumentKey({ tenantId: 12, entityType: 'application', entityId: 5, category: 'proof of income', filename: 'my pay slip.pdf' });
    const parts = key.split('/');
    expect(parts[0]).toBe('12');            // tenant is always the top segment
    expect(parts[1]).toBe('application');
    expect(parts[2]).toBe('5');
    expect(parts[3]).toBe('proof_of_income'); // spaces slugged
    expect(parts[4]).toMatch(/^[a-f0-9]{16}_my_pay_slip\.pdf$/);
  });

  test('safeSegment / safeFilename strip unsafe chars', () => {
    expect(safeSegment('../../etc')).not.toContain('..');
    expect(safeFilename('../../etc/passwd')).toBe('passwd');
    expect(safeFilename('résumé final.PDF')).toMatch(/\.PDF$/);
  });

  test('hashBuffer is a stable sha-256 hex digest', () => {
    expect(hashBuffer(Buffer.from('hello'))).toBe(
      '2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824',
    );
  });
});

describe('LocalStorageProvider', () => {
  let root;
  let store;

  beforeAll(async () => {
    root = await fsp.mkdtemp(path.join(os.tmpdir(), 'genesis-store-'));
    store = new LocalStorageProvider({ root });
  });
  afterAll(async () => { await fsp.rm(root, { recursive: true, force: true }); });

  test('put → get → exists → delete round-trip', async () => {
    const key = '1/lead/7/contract/abc_file.pdf';
    await store.put(key, Buffer.from('payload'));
    expect((await store.get(key)).toString()).toBe('payload');
    expect(await store.exists(key)).toBe(true);
    await store.delete(key);
    expect(await store.exists(key)).toBe(false);
  });

  test('delete is idempotent for a missing key', async () => {
    await expect(store.delete('1/none/none/other/missing.pdf')).resolves.toBeUndefined();
  });

  test('rejects keys that escape the storage root', async () => {
    await expect(store.put('../escape.txt', Buffer.from('x'))).rejects.toThrow(/escapes storage root/);
  });
});

describe('toObjectKey (shared object-store key mapping)', () => {
  test('applies prefix and strips leading slashes', () => {
    expect(toObjectKey('docs/', '/1/lead/7/x.pdf')).toBe('docs/1/lead/7/x.pdf');
    expect(toObjectKey('', '1/lead/7/x.pdf')).toBe('1/lead/7/x.pdf');
    expect(toObjectKey('/a/b/', 'k')).toBe('a/b/k');
  });
  test('rejects traversal and empty keys', () => {
    expect(() => toObjectKey('p', 'a/../b')).toThrow(/Invalid storage key/);
    expect(() => toObjectKey('p', '')).toThrow(/Invalid storage key/);
  });
});

describe('AzureBlobStorageProvider (config guards)', () => {
  test('requires a container', () => {
    expect(() => new AzureBlobStorageProvider({})).toThrow(/requires a container/);
  });
  test('reports a helpful error when the SDK is not installed', () => {
    // @azure/storage-blob is intentionally NOT a dependency; the driver is
    // drop-in (install SDK + set env) — so constructing it should say so.
    expect(() => new AzureBlobStorageProvider({ container: 'c' })).toThrow(/@azure\/storage-blob/);
  });
});

describe('GcsStorageProvider (config guards)', () => {
  test('requires a bucket', () => {
    expect(() => new GcsStorageProvider({})).toThrow(/requires a bucket/);
  });
  test('reports a helpful error when the SDK is not installed', () => {
    expect(() => new GcsStorageProvider({ bucket: 'b' })).toThrow(/@google-cloud\/storage/);
  });
});

describe('S3StorageProvider', () => {
  // Stub the AWS command classes + client so no network/credentials are needed.
  function makeS3() {
    const s3 = new S3StorageProvider({ bucket: 'bucket', region: 'us-east-2', prefix: 'docs/', accessKeyId: 'a', secretAccessKey: 'b' });
    const sent = [];
    s3.client = { send: async (cmd) => { sent.push(cmd); return cmd._result ?? {}; } };
    s3._S3 = {
      PutObjectCommand:    class { constructor(i) { this.input = i; } },
      GetObjectCommand:    class { constructor(i) { this.input = i; this._result = { Body: (async function* () { yield Buffer.from('data'); })() }; } },
      DeleteObjectCommand: class { constructor(i) { this.input = i; } },
      HeadObjectCommand:   class { constructor(i) { this.input = i; } },
    };
    return { s3, sent };
  }

  test('requires a bucket', () => {
    expect(() => new S3StorageProvider({})).toThrow(/requires a bucket/);
  });

  test('put prepends the configured prefix to the object key', async () => {
    const { s3, sent } = makeS3();
    await s3.put('1/lead/7/contract/x.pdf', Buffer.from('hi'));
    expect(sent[0].input.Bucket).toBe('bucket');
    expect(sent[0].input.Key).toBe('docs/1/lead/7/contract/x.pdf');
    expect(sent[0].input.ContentLength).toBe(2);
  });

  test('get collects the streamed body into a Buffer', async () => {
    const { s3 } = makeS3();
    expect((await s3.get('1/lead/7/contract/x.pdf')).toString()).toBe('data');
  });

  test('rejects traversal keys', async () => {
    const { s3 } = makeS3();
    await expect(s3.put('1/../../secret', Buffer.from('x'))).rejects.toThrow(/Invalid storage key/);
  });

  test('delete swallows a 404 (idempotent)', async () => {
    const { s3 } = makeS3();
    s3.client = { send: async () => { throw Object.assign(new Error('nope'), { $metadata: { httpStatusCode: 404 } }); } };
    await expect(s3.delete('1/lead/7/contract/x.pdf')).resolves.toBeUndefined();
  });
});
