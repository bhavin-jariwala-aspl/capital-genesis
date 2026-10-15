'use strict';

/**
 * SearchService — unit tests.
 *
 * Covers:
 *   1. CRM relational search (leads, contacts, accounts, opportunities, cases)
 *   2. Custom-object search via RecordFieldValue.field_name + str_value
 *   3. Owner/visibility filtering (admin=all, manager=hierarchy, user=own)
 *   4. Short-query rejection
 *   5. Result shape and limits
 */

const SearchService = require('../src/services/search.service');

// ── Mock helpers ──────────────────────────────────────────────────────────────

function makeSearchDb({
  leads = [],
  contacts = [],
  accounts = [],
  opps = [],
  cases = [],
  objects = [],
  searchableFields = [],
  fieldValues = [],
  hierarchyRows = [],
} = {}) {
  return {
    crmLead:        { findMany: jest.fn().mockResolvedValue(leads) },
    crmContact:     { findMany: jest.fn().mockResolvedValue(contacts) },
    crmAccount:     { findMany: jest.fn().mockResolvedValue(accounts) },
    crmOpportunity: { findMany: jest.fn().mockResolvedValue(opps) },
    crmCase:        { findMany: jest.fn().mockResolvedValue(cases) },
    uiObject:       { findMany: jest.fn().mockResolvedValue(objects) },
    uiField:        { findMany: jest.fn().mockResolvedValue(searchableFields) },
    recordFieldValue: { findMany: jest.fn().mockResolvedValue(fieldValues) },
    employeeHierarchy: { findMany: jest.fn().mockResolvedValue(hierarchyRows) },
  };
}

const adminViewer   = { employee_id: 'ADMIN', role: 'admin', role_level: 1 };
const managerViewer = { employee_id: 'MGR01', role: 'manager', role_level: 4 };
const userViewer    = { employee_id: 'USR01', role: 'user', role_level: 5 };

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('SearchService — basic behavior', () => {
  it('rejects queries shorter than 2 characters', async () => {
    const svc = new SearchService(makeSearchDb());
    expect(await svc.search('', {})).toEqual([]);
    expect(await svc.search('a', {})).toEqual([]);
    expect(await svc.search(' ', {})).toEqual([]);
  });

  it('returns CRM relational results with correct shape', async () => {
    const db = makeSearchDb({
      leads: [{ id: 1, first_name: 'Jane', last_name: 'Doe', email: 'jane@acme.com', company: 'Acme', record_id: 100, owner_id: 'USR01' }],
      objects: [{ id: 10, name: 'lead', label: 'Lead', module: { id: 1, label: 'Sales' } }],
    });
    const svc = new SearchService(db);

    const results = await svc.search('jane', { viewer: adminViewer });

    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      id: 1,
      record_id: 100,
      title: 'Jane Doe',
      subtitle: 'jane@acme.com',
      crm_type: 'lead',
      object_id: 10,
      object_label: 'Lead',
      module_id: 1,
      module_label: 'Sales',
    });
  });

  it('searches across all five CRM entity types', async () => {
    const db = makeSearchDb({
      leads:    [{ id: 1, first_name: 'Test', last_name: 'Lead', email: '', record_id: 10, owner_id: 'A' }],
      contacts: [{ id: 2, first_name: 'Test', last_name: 'Contact', email: '', record_id: 20, owner_id: 'A' }],
      accounts: [{ id: 3, name: 'Test Account', email: '', record_id: 30, owner_id: 'A' }],
      opps:     [{ id: 4, name: 'Test Opp', stage: 'new', record_id: 40, owner_id: 'A' }],
      cases:    [{ id: 5, subject: 'Test Case', status: 'open', record_id: 50, owner_id: 'A' }],
      objects: [
        { id: 10, name: 'lead',        label: 'Lead',        module: { id: 1, label: 'Sales' } },
        { id: 20, name: 'contact',     label: 'Contact',     module: { id: 1, label: 'Sales' } },
        { id: 30, name: 'account',     label: 'Account',     module: { id: 1, label: 'Sales' } },
        { id: 40, name: 'opportunity', label: 'Opportunity', module: { id: 1, label: 'Sales' } },
        { id: 50, name: 'case',        label: 'Case',        module: { id: 2, label: 'Support' } },
      ],
    });
    const svc = new SearchService(db);

    const results = await svc.search('test', { viewer: adminViewer });
    expect(results).toHaveLength(5);
    expect(results.map(r => r.crm_type)).toEqual(['lead', 'contact', 'account', 'opportunity', 'case']);
  });

  it('respects limit parameter', async () => {
    const many = Array.from({ length: 50 }, (_, i) => ({
      id: i, first_name: 'Test', last_name: `L${i}`, email: '', record_id: i, owner_id: 'A',
    }));
    const db = makeSearchDb({ leads: many, objects: [] });
    const svc = new SearchService(db);

    const results = await svc.search('test', { limit: 5, viewer: adminViewer });
    expect(results.length).toBeLessThanOrEqual(5);
  });
});

describe('SearchService — custom object search', () => {
  it('queries RecordFieldValue using field_name, not field_id', async () => {
    const db = makeSearchDb({
      searchableFields: [
        { id: 100, name: 'ticket_number', object: { id: 7, name: 'support_ticket', label: 'Support Ticket', module: { id: 2, label: 'Support' } } },
        { id: 101, name: 'description',   object: { id: 7, name: 'support_ticket', label: 'Support Ticket', module: { id: 2, label: 'Support' } } },
      ],
      fieldValues: [
        { record_id: 500, field_name: 'ticket_number', str_value: 'TK-broken-widget', record: { id: 500 } },
      ],
      objects: [],
    });
    const svc = new SearchService(db);

    await svc.search('broken', { viewer: adminViewer });

    // The critical assertion: RecordFieldValue is queried with field_name (strings), not field_id (ints)
    const rfvCall = db.recordFieldValue.findMany.mock.calls[0][0];
    expect(rfvCall.where).toHaveProperty('field_name');
    expect(rfvCall.where.field_name).toEqual({ in: ['ticket_number', 'description'] });
    expect(rfvCall.where).not.toHaveProperty('field_id');

    // Select should include field_name, not field_id
    expect(rfvCall.select).toHaveProperty('field_name');
    expect(rfvCall.select).not.toHaveProperty('field_id');
    // Should NOT select 'field' relation (doesn't exist on RecordFieldValue)
    expect(rfvCall.select).not.toHaveProperty('field');
  });

  it('returns custom-object hits with correct result shape', async () => {
    const db = makeSearchDb({
      searchableFields: [
        { id: 100, name: 'asset_name', object: { id: 8, name: 'asset', label: 'Asset', module: { id: 3, label: 'Inventory' } } },
      ],
      fieldValues: [
        { record_id: 600, field_name: 'asset_name', str_value: 'Server Rack A1', record: { id: 600 } },
      ],
      objects: [],
    });
    const svc = new SearchService(db);

    const results = await svc.search('server', { viewer: adminViewer });
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      id: 600,
      record_id: 600,
      title: 'Server Rack A1',
      subtitle: 'Asset',
      crm_type: null,
      object_id: 8,
      object_label: 'Asset',
      module_id: 3,
      module_label: 'Inventory',
    });
  });

  it('titles a hit with the record name, labels the matched field and ranks the closest title first', async () => {
    const party = { id: 9, name: 'party', label: 'Party', config: { title_field: 'display_name' }, module: { id: 2, label: 'Clients' } };
    const rel = { id: 10, name: 'party_relationship', label: 'Party Relationship', config: { title_field: 'name' }, module: { id: 2, label: 'Clients' } };
    const db = makeSearchDb({
      searchableFields: [
        { id: 1, name: 'email', label: 'Email', object: party },
        { id: 2, name: 'display_name', label: 'Name', object: party },
        { id: 3, name: 'name', label: 'Relationship', object: rel },
      ],
    });
    const hits = {
      9: [{ record_id: 70, field_name: 'email', str_value: 'vikash@example.mu' }],
      10: [{ record_id: 71, field_name: 'name', str_value: 'Vikash Ramdhony — Power of attorney of — Patricia Jhurry' }],
    };
    db.recordFieldValue.findMany = jest.fn(async ({ where }) => {
      if (where.record?.object_id) return hits[where.record.object_id] ?? [];
      return [
        { record_id: 70, field_name: 'display_name', str_value: 'Vikash Ramdhony' },
        { record_id: 71, field_name: 'name', str_value: 'Vikash Ramdhony — Power of attorney of — Patricia Jhurry' },
      ];
    });
    const results = await new SearchService(db).search('vikash', { viewer: adminViewer });
    expect(results.map((r) => r.title)).toEqual(['Vikash Ramdhony', 'Vikash Ramdhony — Power of attorney of — Patricia Jhurry']);
    expect(results[0].subtitle).toBe('Party · Email: vikash@example.mu');
  });

  it('uses the record service visibility rule and hides objects the role may not view', async () => {
    const db = makeSearchDb({
      searchableFields: [
        { id: 1, name: 'name', label: 'Name', object: { id: 5, name: 'product', label: 'Product', config: {}, module: { id: 1, label: 'Products' } } },
        { id: 2, name: 'name', label: 'Name', object: { id: 6, name: 'str_report', label: 'STR', config: {}, module: { id: 1, label: 'Compliance' } } },
      ],
      fieldValues: [{ record_id: 1, field_name: 'name', str_value: 'Real Estate Loan' }],
    });
    const access = { accessWhere: jest.fn().mockResolvedValue({ OR: [{ object_id: { in: [5] } }] }) };
    const perms = { getEffectiveUiPermission: jest.fn(async (_t, id) => ({ can_view: id === 5 })) };
    await new SearchService(db, null, access, perms).search('real', { viewer: userViewer });
    expect(access.accessWhere).toHaveBeenCalledWith(userViewer);
    const queried = db.recordFieldValue.findMany.mock.calls.filter(([a]) => a.where.record?.object_id).map(([a]) => a.where.record.object_id);
    expect(queried).toEqual([5]);
    expect(db.recordFieldValue.findMany.mock.calls[0][0].where.record.OR).toEqual([{ object_id: { in: [5] } }]);
  });

  it('skips custom search when no searchable fields exist', async () => {
    const db = makeSearchDb({ searchableFields: [], objects: [] });
    const svc = new SearchService(db);

    const results = await svc.search('anything', { viewer: adminViewer });
    expect(db.recordFieldValue.findMany).not.toHaveBeenCalled();
    expect(results).toEqual([]);
  });
});

describe('SearchService — owner/visibility filtering', () => {
  it('admin sees all records (no owner filter)', async () => {
    const db = makeSearchDb({
      leads: [{ id: 1, first_name: 'Test', last_name: 'L', email: '', record_id: 10, owner_id: 'OTHER' }],
      objects: [],
    });
    const svc = new SearchService(db);

    await svc.search('test', { viewer: adminViewer });

    // Admin: no owner_id filter on CRM query
    const leadCall = db.crmLead.findMany.mock.calls[0][0];
    expect(leadCall.where).not.toHaveProperty('owner_id');
  });

  it('user only sees own records', async () => {
    const db = makeSearchDb({
      leads: [],
      objects: [],
    });
    const svc = new SearchService(db);

    await svc.search('test', { viewer: userViewer });

    const leadCall = db.crmLead.findMany.mock.calls[0][0];
    expect(leadCall.where.owner_id).toEqual({ in: ['USR01'] });
  });

  it('manager sees own + hierarchy reports', async () => {
    const db = makeSearchDb({
      leads: [],
      objects: [],
      hierarchyRows: [{ descendant_id: 'REP01' }, { descendant_id: 'REP02' }],
    });
    const svc = new SearchService(db);

    await svc.search('test', { viewer: managerViewer });

    const leadCall = db.crmLead.findMany.mock.calls[0][0];
    expect(leadCall.where.owner_id).toEqual({ in: ['MGR01', 'REP01', 'REP02'] });
  });

  it('custom-object search applies record owner filter for non-admin', async () => {
    const db = makeSearchDb({
      searchableFields: [
        { id: 10, name: 'item_name', object: { id: 7, name: 'item', label: 'Item', module: null } },
      ],
      fieldValues: [],
      objects: [],
    });
    const svc = new SearchService(db);

    await svc.search('test', { viewer: userViewer });

    const rfvCall = db.recordFieldValue.findMany.mock.calls[0][0];
    expect(rfvCall.where.record.OR).toEqual([
      { created_by: { in: ['USR01'] } },
      { assigned_to: { in: ['USR01'] } },
    ]);
  });
});
