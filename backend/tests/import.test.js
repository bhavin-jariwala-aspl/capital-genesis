'use strict';

jest.mock('@prisma/client');

const ImportService = require('../src/services/import.service');

function makePrisma(overrides = {}) {
  const base = {
    importJob: {
      create:   jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      update:   jest.fn(),
    },
    record: {
      create: jest.fn().mockResolvedValue({ id: 99 }),
      update: jest.fn().mockResolvedValue({ id: 50 }),
      findMany: jest.fn().mockResolvedValue([]),
    },
    // EAV table for custom / non-CRM object field values
    recordFieldValue: {
      create: jest.fn().mockResolvedValue({}),
      upsert: jest.fn().mockResolvedValue({}),
      findMany: jest.fn().mockResolvedValue([]),
    },
    // uiObject needed by CrmService.#objectIds() and #resolveCrmType()
    uiObject: {
      findMany:  jest.fn().mockResolvedValue([]),
      findUnique: jest.fn().mockResolvedValue(null), // null = non-CRM object
    },
    // uiField needed by ImportService#createCustomRecord for typed EAV storage
    uiField: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    // CRM table stubs (needed by CrmService constructor path)
    crmLead:        { create: jest.fn(), update: jest.fn(), findFirst: jest.fn().mockResolvedValue(null), findMany: jest.fn().mockResolvedValue([]), findUnique: jest.fn() },
    crmContact:     { create: jest.fn(), update: jest.fn(), findFirst: jest.fn().mockResolvedValue(null), findMany: jest.fn().mockResolvedValue([]), findUnique: jest.fn() },
    crmAccount:     { create: jest.fn(), update: jest.fn(), findFirst: jest.fn().mockResolvedValue(null), findMany: jest.fn().mockResolvedValue([]), findUnique: jest.fn() },
    crmOpportunity: { create: jest.fn(), update: jest.fn(), findFirst: jest.fn().mockResolvedValue(null), findMany: jest.fn().mockResolvedValue([]), findUnique: jest.fn(), count: jest.fn().mockResolvedValue(0) },
    crmCase:        { create: jest.fn(), update: jest.fn(), findFirst: jest.fn().mockResolvedValue(null), findMany: jest.fn().mockResolvedValue([]), findUnique: jest.fn() },
  };
  const merged = { ...base, ...overrides };
  merged.$transaction = jest.fn().mockImplementation(opsOrFn =>
    Array.isArray(opsOrFn) ? Promise.all(opsOrFn) : opsOrFn(merged),
  );
  return merged;
}

// ── CSV parser ─────────────────────────────────────────────────────────────

describe('ImportService.parseCsv', () => {
  const svc = new ImportService(makePrisma());

  it('parses basic CSV', () => {
    const csv = 'name,email,phone\nAlice,alice@ex.com,555-1111\nBob,bob@ex.com,555-2222';
    const { headers, rows } = svc.parseCsv(Buffer.from(csv));
    expect(headers).toEqual(['name', 'email', 'phone']);
    expect(rows).toHaveLength(2);
    expect(rows[0].name).toBe('Alice');
    expect(rows[1].email).toBe('bob@ex.com');
  });

  it('handles quoted fields with commas', () => {
    const csv = 'name,address\n"Smith, John","123 Main St, NY"';
    const { rows } = svc.parseCsv(Buffer.from(csv));
    expect(rows[0].name).toBe('Smith, John');
    expect(rows[0].address).toBe('123 Main St, NY');
  });

  it('handles Windows CRLF line endings', () => {
    const csv = 'a,b\r\n1,2\r\n3,4';
    const { rows } = svc.parseCsv(Buffer.from(csv));
    expect(rows).toHaveLength(2);
    expect(rows[0].a).toBe('1');
  });

  it('returns empty result for empty buffer', () => {
    const { headers, rows } = svc.parseCsv(Buffer.from(''));
    expect(headers).toEqual([]);
    expect(rows).toHaveLength(0);
  });
});

// ── Field mapping ──────────────────────────────────────────────────────────

describe('ImportService.mapFields', () => {
  const svc = new ImportService(makePrisma());

  it('maps CSV columns to target field names', () => {
    const rows = [{ 'First Name': 'Alice', 'Email Address': 'alice@ex.com' }];
    const mapping = { 'First Name': 'name', 'Email Address': 'email' };
    const result = svc.mapFields(rows, mapping);
    expect(result[0]).toEqual({ name: 'Alice', email: 'alice@ex.com' });
  });

  it('omits unmapped columns', () => {
    const rows = [{ a: '1', b: '2', c: '3' }];
    const mapping = { a: 'field_a', c: 'field_c' };
    const result = svc.mapFields(rows, mapping);
    expect(result[0]).toEqual({ field_a: '1', field_c: '3' });
    expect(result[0].b).toBeUndefined();
  });
});

// ── Validation ─────────────────────────────────────────────────────────────

describe('ImportService.validate', () => {
  const svc = new ImportService(makePrisma());

  it('passes non-empty rows', () => {
    const rows = [{ name: 'Alice', email: 'alice@ex.com' }];
    const { valid, errors } = svc.validate(rows, 1);
    expect(valid).toHaveLength(1);
    expect(errors).toHaveLength(0);
  });

  it('rejects completely empty rows', () => {
    const rows = [{ name: '', email: '' }];
    const { valid, errors } = svc.validate(rows, 1);
    expect(valid).toHaveLength(0);
    expect(errors).toHaveLength(1);
    expect(errors[0].reason).toBe('Empty row');
  });
});

// ── Duplicate detection ────────────────────────────────────────────────────

describe('ImportService.detectDuplicates', () => {
  it('returns all rows as unique when no dedupe keys provided', async () => {
    const svc  = new ImportService(makePrisma());
    const rows = [{ name: 'X' }, { name: 'Y' }];
    const { unique, dupes } = await svc.detectDuplicates(rows, [], 1);
    expect(unique).toHaveLength(2);
    expect(dupes).toHaveLength(0);
  });

  it('treats all rows as unique for non-CRM objects (no data column)', async () => {
    const prisma = makePrisma(); // uiObject.findUnique returns null = non-CRM
    const svc    = new ImportService(prisma);
    const rows   = [{ email: 'alice@ex.com' }, { email: 'bob@ex.com' }];
    const { unique, dupes } = await svc.detectDuplicates(rows, ['email'], 99);
    expect(unique).toHaveLength(2);
    expect(dupes).toHaveLength(0);
  });

  it('flags CRM rows that match on email via crmLead.findMany (single-key batch)', async () => {
    const prisma = makePrisma({
      uiObject: {
        findMany:   jest.fn().mockResolvedValue([{ id: 1, name: 'lead' }]),
        findUnique: jest.fn().mockResolvedValue({ name: 'lead' }),
      },
      crmLead: {
        create:     jest.fn(),
        update:     jest.fn(),
        findUnique: jest.fn(),
        findFirst:  jest.fn().mockResolvedValue(null),
        // Single-key batch: findMany returns existing matching entity
        findMany: jest.fn().mockResolvedValue([
          { id: 5, record_id: 42, email: 'alice@ex.com' },
        ]),
      },
    });
    const svc  = new ImportService(prisma);
    const rows = [
      { email: 'alice@ex.com', first_name: 'Alice' },
      { email: 'bob@ex.com',   first_name: 'Bob'   },
    ];
    const { unique, dupes } = await svc.detectDuplicates(rows, ['email'], 1);
    expect(unique).toHaveLength(1);
    expect(unique[0].email).toBe('bob@ex.com');
    expect(dupes).toHaveLength(1);
    expect(dupes[0].match_id).toBe(5);
    expect(dupes[0].match_record_id).toBe(42);
  });
});

// ── Job lifecycle ──────────────────────────────────────────────────────────

describe('ImportService — previewImport', () => {
  it('processes CSV and saves stats to the job', async () => {
    const csv = 'name,email\nAlice,alice@ex.com\nBob,bob@ex.com';
    const prisma = makePrisma();

    prisma.importJob.findUnique.mockResolvedValue({
      id: 1, object_id: 1, status: 'pending',
    });
    prisma.importJob.update.mockResolvedValue({ id: 1 });
    prisma.record.findMany.mockResolvedValue([]); // no duplicates

    const svc    = new ImportService(prisma);
    const result = await svc.previewImport(
      1,
      Buffer.from(csv),
      { name: 'name', email: 'email' },
      ['email'],
      'skip',
    );

    expect(result.stats.total_rows).toBe(2);
    expect(result.stats.valid_rows).toBe(2);
    expect(result.stats.duplicate_rows).toBe(0);
    expect(prisma.importJob.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 1 },
      data:  expect.objectContaining({ status: 'previewing' }),
    }));
  });
});

describe('ImportService — executeImport (skip strategy)', () => {
  it('creates unique rows and skips duplicates for non-CRM objects', async () => {
    const csv    = 'name,email\nAlice,alice@ex.com\nBob,bob@ex.com';
    const prisma = makePrisma();

    prisma.importJob.findUnique.mockResolvedValue({
      id: 2, object_id: 99, status: 'previewing',
      field_mapping: { name: 'name', email: 'email' },
      dedupe_keys:   [],          // no deduplication for non-CRM objects
      strategy:      'skip',
      created_by:    'EMP-1',
    });
    prisma.importJob.update.mockResolvedValue({ id: 2 });
    // non-CRM: thin Record anchors only
    prisma.record.create.mockResolvedValue({ id: 99 });

    const svc    = new ImportService(prisma);
    const result = await svc.executeImport(2, Buffer.from(csv));

    // Both rows are unique (no deduplication), both create thin anchors
    expect(result.created).toBe(2);
    expect(result.skipped).toBe(0);
    expect(prisma.record.create).toHaveBeenCalledTimes(2);
  });
});

describe('ImportService — executeImport (merge strategy)', () => {
  it('merges CRM lead fields via crmLead.update on duplicate match', async () => {
    const csv = 'first_name,email\nAlice Updated,alice@ex.com';
    const prisma = makePrisma({
      uiObject: {
        findMany:   jest.fn().mockResolvedValue([{ id: 3, name: 'lead' }]),
        findUnique: jest.fn().mockResolvedValue({ name: 'lead' }),
      },
      crmLead: {
        create:     jest.fn(),
        update:     jest.fn().mockResolvedValue({ id: 10 }),
        findUnique: jest.fn().mockResolvedValue({ id: 10, record_id: 50, first_name: 'Alice', last_name: 'Smith', email: 'alice@ex.com', lead_status: 'new', is_converted: false, owner_id: 'EMP-1' }),
        findFirst:  jest.fn().mockResolvedValue(null),
        // Single-key batch: findMany returns Alice as a match
        findMany:   jest.fn().mockResolvedValue([{ id: 10, record_id: 50, email: 'alice@ex.com' }]),
      },
    });

    prisma.importJob.findUnique.mockResolvedValue({
      id: 3, object_id: 3, status: 'previewing',
      field_mapping: { first_name: 'first_name', email: 'email' },
      dedupe_keys:   ['email'],
      strategy:      'merge',
      created_by:    'EMP-1',
    });
    prisma.importJob.update.mockResolvedValue({ id: 3 });

    const svc    = new ImportService(prisma);
    const result = await svc.executeImport(3, Buffer.from(csv));

    expect(result.merged).toBe(1);
    expect(result.created).toBe(0);
    expect(prisma.crmLead.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 10 },
    }));
  });

  it('creates new records for rows with no duplicate match during merge', async () => {
    const csv = 'name,email\nBob,bob@ex.com';
    const prisma = makePrisma();

    prisma.importJob.findUnique.mockResolvedValue({
      id: 4, object_id: 1, status: 'previewing',
      field_mapping: { name: 'name', email: 'email' },
      dedupe_keys:   ['email'],
      strategy:      'merge',
      created_by:    'EMP-1',
    });
    prisma.importJob.update.mockResolvedValue({ id: 4 });
    prisma.record.findMany.mockResolvedValue([]); // no existing records
    prisma.record.create.mockResolvedValue({ id: 101 });

    const svc    = new ImportService(prisma);
    const result = await svc.executeImport(4, Buffer.from(csv));

    expect(result.created).toBe(1);
    expect(result.merged).toBe(0);
    expect(prisma.record.create).toHaveBeenCalledTimes(1);
  });
});
