'use strict';

jest.mock('@prisma/client');

const DashboardService = require('../src/services/dashboard.service');

function makeCache() {
  return {
    remember: jest.fn((key, fn) => fn()),
    key:      jest.fn((...p) => p.join(':')),
    del:      jest.fn().mockResolvedValue(undefined),
  };
}

function makePrisma() {
  const pipeline = { id: 7, name: 'sales', label: 'Sales', object_id: 3, config: {} };
  return {
    uiPipeline: {
      create:     jest.fn().mockResolvedValue(pipeline),
      findUnique: jest.fn().mockResolvedValue(pipeline),
      update:     jest.fn().mockResolvedValue(pipeline),
      delete:     jest.fn().mockResolvedValue(pipeline),
    },
    uiPipelineStage: { createMany: jest.fn(), deleteMany: jest.fn(), update: jest.fn(), create: jest.fn() },
    auditLog:        { create: jest.fn().mockResolvedValue({}), findMany: jest.fn().mockResolvedValue([]) },
    $transaction:    jest.fn().mockResolvedValue([]),
  };
}

function makeSvc() {
  const prisma = makePrisma();
  // getPipeline() re-reads via findUnique(include) — return a plain object.
  prisma.uiPipeline.findUnique.mockResolvedValue({ id: 7, name: 'sales', label: 'Sales', object_id: 3, config: {}, stages: [], object: {} });
  return { svc: new DashboardService(prisma, makeCache()), prisma };
}

describe('DashboardService — pipeline config audit', () => {
  it('audits pipeline.create with the actor', async () => {
    const { svc, prisma } = makeSvc();
    await svc.createPipeline({ name: 'sales', label: 'Sales', object_id: 3, stages: [] }, 'EMP-1');
    expect(prisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({
        entity_type: 'pipeline', entity_id: 7, employee_id: 'EMP-1', action: 'pipeline.create',
      }) }),
    );
  });

  it('audits pipeline.update on updatePipelineWithStages', async () => {
    const { svc, prisma } = makeSvc();
    await svc.updatePipelineWithStages(7, { label: 'Sales 2', stages: [], config: { delete_mode: 'hard' } }, 'EMP-2');
    expect(prisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({
        entity_type: 'pipeline', entity_id: 7, employee_id: 'EMP-2', action: 'pipeline.update',
      }) }),
    );
  });

  it('audits pipeline.delete BEFORE removing the row', async () => {
    const { svc, prisma } = makeSvc();
    await svc.deletePipeline(7, 'EMP-3');
    expect(prisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({
        entity_type: 'pipeline', entity_id: 7, employee_id: 'EMP-3', action: 'pipeline.delete',
      }) }),
    );
    // audit ran before delete
    const auditOrder = prisma.auditLog.create.mock.invocationCallOrder[0];
    const deleteOrder = prisma.uiPipeline.delete.mock.invocationCallOrder[0];
    expect(auditOrder).toBeLessThan(deleteOrder);
  });

  it('does not audit when no actor is supplied (system/internal call)', async () => {
    const { svc, prisma } = makeSvc();
    await svc.createPipeline({ name: 'x', label: 'X', object_id: 3, stages: [] });
    expect(prisma.auditLog.create).not.toHaveBeenCalled();
  });

  it('getPipelineAudit queries the pipeline entity trail newest-first', async () => {
    const { svc, prisma } = makeSvc();
    await svc.getPipelineAudit(7);
    expect(prisma.auditLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where:   { entity_type: 'pipeline', entity_id: 7 },
        orderBy: { created_at: 'desc' },
      }),
    );
  });
});
