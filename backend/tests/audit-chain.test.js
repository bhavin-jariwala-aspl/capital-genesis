'use strict';

const AuditChainService = require('../src/services/audit-chain.service');
const SegmentationService = require('../src/services/segmentation.service');
const { AuthorizationError } = require('../src/utils/errors');

/** In-memory audit_chain_events with the two queries the service makes. */
function chainDb() {
  const rows = [];
  const tx = {
    auditChainEvent: {
      findFirst: async ({ where }) => rows.filter((r) => r.tenant_id === where.tenant_id).sort((a, b) => b.seq - a.seq)[0] ?? null,
      create: async ({ data }) => { const row = { id: rows.length + 1, ...data }; rows.push(row); return row; },
      findMany: async ({ where }) => rows.filter((r) => r.tenant_id === where.tenant_id).sort((a, b) => a.seq - b.seq),
    },
  };
  return { rows, db: { ...tx, $transaction: async (fn) => fn(tx) } };
}

describe('AuditChainService — tamper evidence', () => {
  async function seeded() {
    const { rows, db } = chainDb();
    const svc = new AuditChainService(db);
    for (let i = 0; i < 4; i++) {
      await svc.append({ tenantId: 7, entityType: 'barrier_zone', entityId: 1, action: `step${i}`, actor: 'CMP1', payload: { n: i } });
    }
    return { rows, svc };
  }

  it('chains each event to the previous one and verifies clean', async () => {
    const { rows, svc } = await seeded();
    expect(rows.map((r) => r.seq)).toEqual([1, 2, 3, 4]);
    expect(rows[1].prev_hash).toBe(rows[0].hash);
    expect(await svc.verify(7)).toEqual({ ok: true, events: 4, broken_at: null, reason: null });
  });

  it('detects an edited payload at the edited event', async () => {
    const { rows, svc } = await seeded();
    rows[2].payload = { n: 999 };
    expect(await svc.verify(7)).toMatchObject({ ok: false, broken_at: 3, reason: 'content altered' });
  });

  it('detects a deleted event', async () => {
    const { rows, svc } = await seeded();
    rows.splice(1, 1);
    expect(await svc.verify(7)).toMatchObject({ ok: false, broken_at: 2 });
  });

  it('never throws into the caller when the store fails', async () => {
    const svc = new AuditChainService({ auditChainEvent: { create: jest.fn() }, $transaction: async () => { throw new Error('down'); } });
    await expect(svc.append({ tenantId: 7, entityType: 'x', action: 'y' })).resolves.toBeNull();
  });
});

describe('SegmentationService — wall-crossings', () => {
  function segDb({ crossing, member = null }) {
    const calls = { upsert: [], update: [] };
    const db = {
      wallCrossing: {
        findUnique: async () => crossing,
        update: async ({ data }) => { calls.update.push(data); return { ...crossing, ...data }; },
      },
      barrierMember: {
        findUnique: async () => member,
        upsert: async (args) => { calls.upsert.push(args); return {}; },
      },
    };
    return { db, calls };
  }
  const audit = { append: jest.fn(async () => null) };

  it('refuses to let the requester approve their own crossing', async () => {
    const { db } = segDb({ crossing: { id: 1, status: 'pending', requested_by: 'RM1', zone_id: 3, employee_id: 'RM1' } });
    await expect(new SegmentationService(db, null, audit).decideCrossing(1, { approve: true }, 'RM1'))
      .rejects.toBeInstanceOf(AuthorizationError);
  });

  it('grants time-bound membership on approval and audits it', async () => {
    const { db, calls } = segDb({ crossing: { id: 1, status: 'pending', requested_by: 'RM1', zone_id: 3, employee_id: 'RM1' } });
    await new SegmentationService(db, null, audit).decideCrossing(1, { approve: true, validDays: 10 }, 'CMP1');
    const grant = calls.upsert[0].create;
    expect(grant).toMatchObject({ zone_id: 3, employee_id: 'RM1', source: 'wall_crossing' });
    expect(grant.valid_to.getTime() - Date.now()).toBeGreaterThan(9 * 86_400_000);
    expect(audit.append).toHaveBeenCalledWith(expect.objectContaining({ entityType: 'wall_crossing', action: 'approve', actor: 'CMP1' }));
  });

  it('does not put an expiry on someone who is already a standing member', async () => {
    const { db, calls } = segDb({
      crossing: { id: 1, status: 'pending', requested_by: 'RM1', zone_id: 3, employee_id: 'ADV1' },
      member: { source: 'member', valid_to: null },
    });
    await new SegmentationService(db, null, audit).decideCrossing(1, { approve: true }, 'CMP1');
    expect(calls.upsert).toEqual([]);
  });
});
