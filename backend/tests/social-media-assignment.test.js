'use strict';

jest.mock('@prisma/client');

const AssignmentService  = require('../src/services/assignment.service');
const SocialMediaService = require('../src/services/social-media.service');

// ── AssignmentService.leastLoaded (pure selection) ──────────────────────────

describe('AssignmentService.leastLoaded', () => {
  const svc = new AssignmentService({});

  it('returns null for an empty pool', () => {
    expect(svc.leastLoaded([], {})).toBeNull();
    expect(svc.leastLoaded(undefined, {})).toBeNull();
  });

  it('picks the employee with the fewest open items', () => {
    expect(svc.leastLoaded(['A', 'B', 'C'], { A: 5, B: 2, C: 9 })).toBe('B');
  });

  it('treats missing employees as zero load', () => {
    expect(svc.leastLoaded(['A', 'B'], { A: 3 })).toBe('B');
  });

  it('breaks ties by pool order (deterministic)', () => {
    expect(svc.leastLoaded(['A', 'B', 'C'], { A: 1, B: 1, C: 1 })).toBe('A');
  });
});

// ── Inbound mention routing (all channels) ──────────────────────────────────

function makePrisma({ managers, employees, load, rules = [] }) {
  let mentionId = 0;
  const updates = [];
  const db = {
    _updates: updates,
    socialMediaAccount: {
      findMany: jest.fn().mockResolvedValue(managers),
    },
    employee: {
      findMany: jest.fn().mockResolvedValue(employees),
    },
    socialMediaMention: {
      findFirst: jest.fn().mockResolvedValue(null),
      create:  jest.fn(async ({ data }) => ({ id: ++mentionId, ...data })),
      groupBy: jest.fn().mockResolvedValue(load),
      update:  jest.fn(async (args) => { updates.push(args); return args; }),
    },
    socialAssignmentRule: {
      findMany: jest.fn().mockResolvedValue(rules),
      update:   jest.fn(async (args) => args),
    },
    // Ingest now matches listening keywords and notifies assignees.
    socialListeningKeyword: { findMany: jest.fn().mockResolvedValue([]) },
    notification:           { create:   jest.fn().mockResolvedValue({}) },
  };
  db.$transaction = jest.fn(fn => (typeof fn === 'function' ? fn(db) : Promise.all(fn)));
  db.$queryRaw = jest.fn(async () => [{ last_index: 0 }]);
  return db;
}

const ACCOUNT = { id: 1, platform: 'instagram', tenant_id: 7, managed_by: 'E1', last_sync_at: new Date() };

describe('SocialMediaService inbound mention routing', () => {
  async function runPull(svc, db, mentions) {
    // Stub the connector + account lookup that pullMentions depends on.
    jest.spyOn(svc, 'getAccount').mockResolvedValue(ACCOUNT);
    const { getConnector } = require('../src/connectors/social');
    jest.spyOn(require('../src/connectors/social'), 'getConnector');
    // Replace getMentions on whatever connector is returned.
    const connector = getConnector(ACCOUNT.platform);
    jest.spyOn(connector, 'getMentions').mockResolvedValue(mentions);
    db.socialMediaAccount.update = jest.fn().mockResolvedValue({});
    return svc.pullMentions(ACCOUNT.id);
  }

  it('assigns a response-required mention to the least-loaded team member', async () => {
    const db = makePrisma({
      managers:  [{ managed_by: 'E1' }, { managed_by: 'E2' }],
      employees: [{ employee_id: 'E1' }, { employee_id: 'E2' }],
      load:      [{ assigned_to: 'E1', _count: { id: 3 } }, { assigned_to: 'E2', _count: { id: 1 } }],
    });
    const svc = new SocialMediaService(db);
    const res = await runPull(svc, db, [
      { content: 'help!', author_name: 'X', sentiment: 'negative', requires_response: true },
    ]);

    expect(res.mentions_created).toBe(1);
    expect(res.mentions_assigned).toBe(1);
    expect(db._updates[0].data.assigned_to).toBe('E2'); // E2 less loaded
  });

  it('spreads a batch across the team rather than piling onto one rep', async () => {
    const db = makePrisma({
      managers:  [{ managed_by: 'E1' }, { managed_by: 'E2' }],
      employees: [{ employee_id: 'E1' }, { employee_id: 'E2' }],
      load:      [],
    });
    const svc = new SocialMediaService(db);
    const res = await runPull(svc, db, [
      { content: 'a', author_name: 'X', requires_response: true },
      { content: 'b', author_name: 'Y', requires_response: true },
    ]);

    expect(res.mentions_assigned).toBe(2);
    const assignees = db._updates.map(u => u.data.assigned_to).sort();
    expect(assignees).toEqual(['E1', 'E2']);
  });

  it('does not assign mentions that do not require a response', async () => {
    const db = makePrisma({
      managers:  [{ managed_by: 'E1' }],
      employees: [{ employee_id: 'E1' }],
      load:      [],
    });
    const svc = new SocialMediaService(db);
    const res = await runPull(svc, db, [
      { content: 'nice post', author_name: 'X', requires_response: false },
    ]);

    expect(res.mentions_created).toBe(1);
    expect(res.mentions_assigned).toBe(0);
    expect(db._updates).toHaveLength(0);
  });

  it('configured assignment rules override the default managed-by routing', async () => {
    // A fixed rule sends everything to ESC; the default would have picked E1/E2.
    const db = makePrisma({
      managers:  [{ managed_by: 'E1' }, { managed_by: 'E2' }],
      employees: [{ employee_id: 'E1' }, { employee_id: 'E2' }],
      load:      [],
      rules:     [{ id: 1, rule_type: 'fixed', assignee_id: 'ESC', platform: null }],
    });
    const svc = new SocialMediaService(db);
    const res = await runPull(svc, db, [
      { content: 'angry', author_name: 'X', sentiment: 'negative', requires_response: true },
    ]);

    expect(res.mentions_assigned).toBe(1);
    expect(db._updates[0].data.assigned_to).toBe('ESC');
  });

  it('leaves mentions unassigned when no social team is configured', async () => {
    const db = makePrisma({ managers: [], employees: [], load: [] });
    const account = { ...ACCOUNT, managed_by: null };
    const svc = new SocialMediaService(db);
    jest.spyOn(svc, 'getAccount').mockResolvedValue(account);
    const { getConnector } = require('../src/connectors/social');
    const connector = getConnector(account.platform);
    jest.spyOn(connector, 'getMentions').mockResolvedValue([
      { content: 'help', author_name: 'X', requires_response: true },
    ]);
    db.socialMediaAccount.update = jest.fn().mockResolvedValue({});

    const res = await svc.pullMentions(account.id);
    expect(res.mentions_created).toBe(1);
    expect(res.mentions_assigned).toBe(0);
    expect(db._updates).toHaveLength(0);
  });
});
