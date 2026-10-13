'use strict';

/**
 * Tests for InsuranceDomainService:
 *  - createPolicy — generates POL-* number, creates status history, handles beneficiaries
 *  - updatePolicy — status change writes history, timestamps lapsed/reinstated
 *  - createApplication — generates APP-* number
 *  - convertToUnderwriting — creates UW case, updates app status, guards duplicate
 *  - issuePolicy — validates approved status, creates policy + updates app + commission
 *  - updateUnderwritingCase — approved/declined propagates to application
 *  - createClaim — generates CLM-* number, creates initial timeline event
 *  - updateClaim — status change adds event, paid status sets paid_at
 *  - getCommissionSummary — aggregates by agent
 *  - getPolicy / getApplication not found — throws 404
 */

const InsuranceDomainService = require('../src/services/insurance-domain.service');

// ── Prisma mock factory ──────────────────────────────────────────────────────

function makeModel(extra = {}) {
  return {
    create:      jest.fn().mockImplementation(({ data } = {}) => Promise.resolve({ id: 1, ...data })),
    createMany:  jest.fn().mockResolvedValue({ count: 0 }),
    findFirst:   jest.fn().mockResolvedValue(null),
    findUnique:  jest.fn().mockResolvedValue(null),
    findMany:    jest.fn().mockResolvedValue([]),
    update:      jest.fn().mockImplementation(({ data } = {}) => Promise.resolve({ id: 1, ...data })),
    count:       jest.fn().mockResolvedValue(0),
    upsert:      jest.fn().mockImplementation(({ create } = {}) => Promise.resolve({ id: 1, ...create })),
    deleteMany:  jest.fn().mockResolvedValue({ count: 0 }),
    groupBy:     jest.fn().mockResolvedValue([]),
    aggregate:   jest.fn().mockResolvedValue({ _sum: { commission_amount: 0 } }),
    ...extra,
  };
}

function makePrisma(overrides = {}) {
  const mock = {
    insuranceCarrier:              makeModel(),
    carrierProduct:                makeModel(),
    insurancePolicy:               makeModel(),
    insurancePolicyBeneficiary:    makeModel(),
    insurancePolicyStatusHistory:  makeModel(),
    insuranceApplication:          makeModel(),
    underwritingCase:              makeModel(),
    underwritingRequirement:       makeModel(),
    insuranceClaim:                makeModel(),
    claimEvent:                    makeModel(),
    commissionEntry:               makeModel(),
    activity:                      makeModel(),
    record:                        makeModel(),
    employee:                      makeModel(),
    crmContact:                    makeModel(),
    // P0-P4 models
    quoteScenario:                 makeModel(),
    complianceArtifact:            makeModel(),
    submissionChecklist:           makeModel(),
    policyEndorsement:             makeModel(),
    renewalTask:                   makeModel(),
    billingSchedule:               makeModel(),
    policyInvoice:                 makeModel(),
    policyPayment:                 makeModel(),
    claimReserve:                  makeModel(),
    claimPaymentEvent:             makeModel(),
    producerAppointment:           makeModel(),
    commissionStatement:           makeModel(),
    uiObject:                      makeModel(),
    uiPipelineStage:               makeModel(),
    recordFieldValue:              makeModel(),
    ...overrides,
  };
  mock.$transaction = jest.fn().mockImplementation(fn => fn(mock));
  // #nextSeq() locks the latest sequence row with a raw FOR UPDATE query.
  // Default to "no existing rows" so the next number is PREFIX-YEAR-000001.
  mock.$queryRawUnsafe = jest.fn().mockResolvedValue([]);
  return mock;
}

const TENANT = 1;
const ACTOR  = 99;

// ── createPolicy ─────────────────────────────────────────────────────────────

describe('InsuranceDomainService.createPolicy', () => {
  it('generates a POL-* number and creates status history', async () => {
    const prisma = makePrisma({
      insurancePolicy: makeModel({
        count: jest.fn().mockResolvedValue(0),
        create: jest.fn().mockResolvedValue({ id: 10, policy_number: 'POL-2026-000001', status: 'active', contact_id: 5, tenant_id: TENANT }),
        findFirst: jest.fn().mockResolvedValue(null),
      }),
    });
    const svc = new InsuranceDomainService(prisma);
    const result = await svc.createPolicy(
      { carrier_id: 1, contact_id: 5, product_type: 'term_life', coverage_amount: 500000, premium_amount: 1200, premium_frequency: 'monthly', effective_date: new Date() },
      TENANT, ACTOR,
    );

    // policy created
    expect(prisma.insurancePolicy.create).toHaveBeenCalledTimes(1);
    // status history written
    expect(prisma.insurancePolicyStatusHistory.create).toHaveBeenCalledTimes(1);
  });

  it('creates beneficiaries when provided', async () => {
    const prisma = makePrisma({
      insurancePolicy: makeModel({
        count: jest.fn().mockResolvedValue(5),
        create: jest.fn().mockResolvedValue({ id: 10, policy_number: 'POL-2026-000006', status: 'active', contact_id: 5, tenant_id: TENANT }),
        findFirst: jest.fn().mockResolvedValue(null),
      }),
    });
    const svc = new InsuranceDomainService(prisma);
    await svc.createPolicy(
      {
        carrier_id: 1, contact_id: 5, product_type: 'term_life', coverage_amount: 100000, premium_amount: 800,
        beneficiaries: [{ beneficiary_type: 'primary', first_name: 'Bob', last_name: 'Smith', relationship: 'spouse', allocation_pct: 100 }],
      },
      TENANT, ACTOR,
    );
    expect(prisma.insurancePolicyBeneficiary.create).toHaveBeenCalledTimes(1);
  });
});

// ── updatePolicy (status change) ─────────────────────────────────────────────

describe('InsuranceDomainService.updatePolicy', () => {
  it('writes status history when status changes', async () => {
    const existing = { id: 10, policy_number: 'POL-2026-000001', status: 'active', tenant_id: TENANT, contact_id: 5, record_id: 200 };
    const prisma = makePrisma({
      insurancePolicy: makeModel({
        findFirst: jest.fn().mockResolvedValue(existing),
        update: jest.fn().mockResolvedValue({ ...existing, status: 'lapsed' }),
      }),
    });
    const svc = new InsuranceDomainService(prisma);
    await svc.updatePolicy(10, { status: 'lapsed' }, TENANT, ACTOR);

    expect(prisma.insurancePolicyStatusHistory.create).toHaveBeenCalledTimes(1);
    const histArgs = prisma.insurancePolicyStatusHistory.create.mock.calls[0][0].data;
    expect(histArgs.to_status).toBe('lapsed');
    expect(histArgs.from_status).toBe('active');
  });

  it('throws 404 when policy not found', async () => {
    const prisma = makePrisma();
    const svc = new InsuranceDomainService(prisma);
    await expect(svc.updatePolicy(999, { status: 'lapsed' }, TENANT, ACTOR)).rejects.toMatchObject({ statusCode: 404 });
  });
});

// ── createApplication ─────────────────────────────────────────────────────────

describe('InsuranceDomainService.createApplication', () => {
  it('generates an APP-* application number', async () => {
    const prisma = makePrisma({
      insuranceApplication: makeModel({
        count: jest.fn().mockResolvedValue(2),
        create: jest.fn().mockResolvedValue({ id: 5, app_number: 'APP-2026-000003', status: 'submitted', tenant_id: TENANT }),
        findFirst: jest.fn().mockResolvedValue(null),
      }),
    });
    const svc = new InsuranceDomainService(prisma);
    const result = await svc.createApplication(
      { contact_id: 3, product_type: 'whole_life', coverage_amount: 250000 },
      TENANT, ACTOR,
    );
    expect(prisma.insuranceApplication.create).toHaveBeenCalledTimes(1);
    const callData = prisma.insuranceApplication.create.mock.calls[0][0].data;
    expect(callData.app_number).toMatch(/^APP-\d{4}-\d{6}$/);
  });
});

// ── convertToUnderwriting ─────────────────────────────────────────────────────

describe('InsuranceDomainService.convertToUnderwriting', () => {
  it('creates UW case and updates application status', async () => {
    const app = { id: 5, app_number: 'APP-2026-000001', status: 'submitted', tenant_id: TENANT, contact_id: 3, record_id: null };
    const prisma = makePrisma({
      insuranceApplication: makeModel({
        findFirst: jest.fn().mockResolvedValue(app),
        update: jest.fn().mockResolvedValue({ ...app, status: 'under_review' }),
      }),
      underwritingCase: makeModel({
        findFirst: jest.fn().mockResolvedValue(null), // no existing case
        count: jest.fn().mockResolvedValue(0),
        create: jest.fn().mockResolvedValue({ id: 1, application_id: 5, status: 'pending', tenant_id: TENANT }),
      }),
    });
    const svc = new InsuranceDomainService(prisma);
    await svc.convertToUnderwriting(5, {}, TENANT, ACTOR);

    expect(prisma.underwritingCase.create).toHaveBeenCalledTimes(1);
    expect(prisma.insuranceApplication.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'under_review' }) }),
    );
  });

  it('throws 409 when UW case already exists', async () => {
    const app = {
      id: 5,
      app_number: 'APP-2026-000001',
      status: 'under_review',
      tenant_id: TENANT,
      contact_id: 3,
    };
    const prisma = makePrisma({
      insuranceApplication: makeModel({ findFirst: jest.fn().mockResolvedValue(app) }),
      // count returns 1 → an existing UW case exists for this application
      underwritingCase: makeModel({ count: jest.fn().mockResolvedValue(1) }),
    });
    const svc = new InsuranceDomainService(prisma);
    await expect(svc.convertToUnderwriting(5, {}, TENANT, ACTOR)).rejects.toMatchObject({ statusCode: 409 });
  });

  it('throws 404 when application not found', async () => {
    const prisma = makePrisma();
    const svc = new InsuranceDomainService(prisma);
    await expect(svc.convertToUnderwriting(999, {}, TENANT, ACTOR)).rejects.toMatchObject({ statusCode: 404 });
  });
});

// ── issuePolicy ───────────────────────────────────────────────────────────────

describe('InsuranceDomainService.issuePolicy', () => {
  it('creates policy, updates application to issued, creates commission', async () => {
    const app = { id: 5, app_number: 'APP-2026-000001', status: 'approved', tenant_id: TENANT, contact_id: 3, account_id: null, agent_id: 7, carrier_id: 1, product_type: 'term_life', coverage_amount: 300000, premium_amount: 1500, premium_frequency: 'annual', record_id: null };
    const prisma = makePrisma({
      insuranceApplication: makeModel({
        findFirst: jest.fn().mockResolvedValue(app),
        update: jest.fn().mockResolvedValue({ ...app, status: 'issued' }),
      }),
      insurancePolicy: makeModel({
        count: jest.fn().mockResolvedValue(0),
        create: jest.fn().mockResolvedValue({ id: 20, policy_number: 'POL-2026-000001', status: 'active', contact_id: 3, tenant_id: TENANT }),
        findFirst: jest.fn().mockResolvedValue(null),
      }),
    });
    const svc = new InsuranceDomainService(prisma);
    await svc.issuePolicy(5, { effective_date: new Date() }, TENANT, ACTOR);

    expect(prisma.insurancePolicy.create).toHaveBeenCalledTimes(1);
    expect(prisma.insuranceApplication.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'issued' }) }),
    );
    // commission entry created when agent_id is set
    expect(prisma.commissionEntry.create).toHaveBeenCalledTimes(1);
  });

  it('throws 422 when application status is not approved', async () => {
    const app = { id: 5, app_number: 'APP-2026-000001', status: 'submitted', tenant_id: TENANT, contact_id: 3 };
    const prisma = makePrisma({
      insuranceApplication: makeModel({ findFirst: jest.fn().mockResolvedValue(app) }),
    });
    const svc = new InsuranceDomainService(prisma);
    await expect(svc.issuePolicy(5, {}, TENANT, ACTOR)).rejects.toMatchObject({ statusCode: 422 });
  });
});

// ── updateUnderwritingCase ────────────────────────────────────────────────────

describe('InsuranceDomainService.updateUnderwritingCase', () => {
  it('propagates approved status to application', async () => {
    const uwCase = { id: 1, application_id: 5, status: 'pending', tenant_id: TENANT };
    const prisma = makePrisma({
      underwritingCase: makeModel({
        findFirst: jest.fn().mockResolvedValue(uwCase),
        update: jest.fn().mockResolvedValue({ ...uwCase, status: 'approved' }),
      }),
    });
    const svc = new InsuranceDomainService(prisma);
    await svc.updateUnderwritingCase(1, { status: 'approved' }, TENANT, ACTOR);

    expect(prisma.insuranceApplication.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'approved' }) }),
    );
  });

  it('propagates declined status to application', async () => {
    const uwCase = { id: 1, application_id: 5, status: 'pending', tenant_id: TENANT };
    const prisma = makePrisma({
      underwritingCase: makeModel({
        findFirst: jest.fn().mockResolvedValue(uwCase),
        update: jest.fn().mockResolvedValue({ ...uwCase, status: 'declined' }),
      }),
    });
    const svc = new InsuranceDomainService(prisma);
    await svc.updateUnderwritingCase(1, { status: 'declined', decision_notes: 'High risk' }, TENANT, ACTOR);

    expect(prisma.insuranceApplication.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'declined' }) }),
    );
  });
});

// ── createClaim ───────────────────────────────────────────────────────────────

describe('InsuranceDomainService.createClaim', () => {
  it('generates CLM-* number and creates initial timeline event', async () => {
    const prisma = makePrisma({
      insurancePolicy: makeModel({
        findFirst: jest.fn().mockResolvedValue({ id: 10, policy_number: 'POL-2026-000001', tenant_id: TENANT }),
      }),
      insuranceClaim: makeModel({
        count: jest.fn().mockResolvedValue(0),
        create: jest.fn().mockResolvedValue({ id: 8, claim_number: 'CLM-2026-000001', status: 'filed', policy_id: 10, tenant_id: TENANT }),
        findFirst: jest.fn().mockResolvedValue(null),
      }),
    });
    const svc = new InsuranceDomainService(prisma);
    await svc.createClaim({ policy_id: 10, claim_type: 'death', amount: 500000 }, TENANT, ACTOR);

    expect(prisma.insuranceClaim.create).toHaveBeenCalledTimes(1);
    const createData = prisma.insuranceClaim.create.mock.calls[0][0].data;
    expect(createData.claim_number).toMatch(/^CLM-\d{4}-\d{6}$/);
    // initial event created via claimEvent.create
    expect(prisma.claimEvent.create).toHaveBeenCalledTimes(1);
  });
});

// ── updateClaim ───────────────────────────────────────────────────────────────

describe('InsuranceDomainService.updateClaim', () => {
  it('adds timeline event on status change', async () => {
    const claim = { id: 8, claim_number: 'CLM-2026-000001', status: 'filed', policy_id: 10, tenant_id: TENANT };
    const prisma = makePrisma({
      insuranceClaim: makeModel({
        findFirst: jest.fn().mockResolvedValue(claim),
        update: jest.fn().mockResolvedValue({ ...claim, status: 'under_investigation' }),
      }),
    });
    const svc = new InsuranceDomainService(prisma);
    await svc.updateClaim(8, { status: 'under_investigation' }, TENANT, ACTOR);

    expect(prisma.claimEvent.create).toHaveBeenCalledTimes(1);
  });

  it('sets paid_at when status changes to paid', async () => {
    const claim = { id: 8, claim_number: 'CLM-2026-000001', status: 'approved', policy_id: 10, tenant_id: TENANT };
    const prisma = makePrisma({
      insuranceClaim: makeModel({
        findFirst: jest.fn().mockResolvedValue(claim),
        update: jest.fn().mockResolvedValue({ ...claim, status: 'paid' }),
      }),
    });
    const svc = new InsuranceDomainService(prisma);
    await svc.updateClaim(8, { status: 'paid', paid_amount: 500000 }, TENANT, ACTOR);

    const updateData = prisma.insuranceClaim.update.mock.calls[0][0].data;
    expect(updateData.paid_at).toBeDefined();
  });

  it('throws 404 when claim not found', async () => {
    const prisma = makePrisma();
    const svc = new InsuranceDomainService(prisma);
    await expect(svc.updateClaim(999, { status: 'paid' }, TENANT, ACTOR)).rejects.toMatchObject({ statusCode: 404 });
  });
});

// ── getCommissionSummary ──────────────────────────────────────────────────────

describe('InsuranceDomainService.getCommissionSummary', () => {
  it('returns aggregate data', async () => {
    const prisma = makePrisma({
      commissionEntry: makeModel({
        findMany: jest.fn().mockResolvedValue([
          { agent_id: 7, status: 'paid', commission_amount: 5000, commission_period: '2026-04' },
          { agent_id: 7, status: 'pending', commission_amount: 2000, commission_period: '2026-04' },
        ]),
      }),
    });
    const svc = new InsuranceDomainService(prisma);
    const result = await svc.getCommissionSummary(TENANT);

    expect(prisma.commissionEntry.findMany).toHaveBeenCalledTimes(1);
    expect(Array.isArray(result)).toBe(true);
    expect(result[0]).toMatchObject({ agent_id: 7, paid: 5000, pending: 2000, total: 7000 });
  });
});

// ── getPolicy not found ───────────────────────────────────────────────────────

describe('InsuranceDomainService.getPolicy', () => {
  it('throws 404 when policy not found', async () => {
    const prisma = makePrisma();
    const svc = new InsuranceDomainService(prisma);
    await expect(svc.getPolicy(999, TENANT)).rejects.toMatchObject({ statusCode: 404 });
  });
});

// ── getApplication not found ─────────────────────────────────────────────────

describe('InsuranceDomainService.getApplication', () => {
  it('throws 404 when application not found', async () => {
    const prisma = makePrisma();
    const svc = new InsuranceDomainService(prisma);
    await expect(svc.getApplication(999, TENANT)).rejects.toMatchObject({ statusCode: 404 });
  });
});

// ── P1: Compliance ────────────────────────────────────────────────────────────

describe('InsuranceDomainService.createComplianceArtifact', () => {
  it('creates a compliance artifact with correct fields', async () => {
    const prisma = makePrisma({
      complianceArtifact: makeModel({
        create: jest.fn().mockResolvedValue({ id: 1, artifact_type: 'soa', status: 'pending', tenant_id: TENANT }),
      }),
    });
    const svc = new InsuranceDomainService(prisma);
    const result = await svc.createComplianceArtifact({ artifact_type: 'soa', application_id: 5 }, TENANT, ACTOR);
    expect(result.artifact_type).toBe('soa');
    expect(prisma.complianceArtifact.create).toHaveBeenCalled();
  });
});

describe('InsuranceDomainService.getSubmissionReadiness', () => {
  it('returns ready=true when all required items are received', async () => {
    const prisma = makePrisma({
      submissionChecklist: makeModel({
        findMany: jest.fn().mockResolvedValue([
          { id: 1, is_required: true, status: 'received' },
          { id: 2, is_required: true, status: 'waived' },
          { id: 3, is_required: false, status: 'pending' },
        ]),
      }),
    });
    const svc = new InsuranceDomainService(prisma);
    const result = await svc.getSubmissionReadiness(1, TENANT);
    expect(result.ready).toBe(true);
    expect(result.completed).toBe(2);
    expect(result.pending).toBe(0);
  });

  it('returns ready=false when required items are pending', async () => {
    const prisma = makePrisma({
      submissionChecklist: makeModel({
        findMany: jest.fn().mockResolvedValue([
          { id: 1, is_required: true, status: 'received' },
          { id: 2, is_required: true, status: 'pending' },
        ]),
      }),
    });
    const svc = new InsuranceDomainService(prisma);
    const result = await svc.getSubmissionReadiness(1, TENANT);
    expect(result.ready).toBe(false);
    expect(result.pending).toBe(1);
  });
});

// ── P2: Endorsements ──────────────────────────────────────────────────────────

describe('InsuranceDomainService.createEndorsement', () => {
  it('creates an endorsement for a valid policy', async () => {
    const prisma = makePrisma({
      insurancePolicy: makeModel({
        findFirst: jest.fn().mockResolvedValue({ id: 10, tenant_id: TENANT }),
      }),
      policyEndorsement: makeModel({
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: 1, endorsement_ref: 'END-2026-000001', status: 'pending' }),
      }),
    });
    const svc = new InsuranceDomainService(prisma);
    const result = await svc.createEndorsement({
      policy_id: 10, endorsement_type: 'coverage_increase', description: 'Increase coverage', effective_date: '2026-05-01',
    }, TENANT, ACTOR);
    expect(result.endorsement_ref).toMatch(/^END-/);
    expect(result.status).toBe('pending');
  });

  it('throws 404 if policy not found', async () => {
    const prisma = makePrisma();
    const svc = new InsuranceDomainService(prisma);
    await expect(svc.createEndorsement({ policy_id: 999, endorsement_type: 'other', description: 'x', effective_date: '2026-01-01' }, TENANT, ACTOR))
      .rejects.toMatchObject({ statusCode: 404 });
  });
});

// ── P3: Claims reserves ───────────────────────────────────────────────────────

describe('InsuranceDomainService.setReserve', () => {
  it('creates an initial reserve and updates claim', async () => {
    const prisma = makePrisma({
      insuranceClaim: makeModel({
        findFirst: jest.fn().mockResolvedValue({ id: 5, tenant_id: TENANT }),
        update: jest.fn().mockResolvedValue({ id: 5, reserve_amount: 50000 }),
      }),
      claimReserve: makeModel({
        findMany: jest.fn().mockResolvedValue([]), // no existing reserves
        create: jest.fn().mockResolvedValue({ id: 1, reserve_type: 'initial', amount: 50000, running_total: 50000 }),
      }),
      claimEvent: makeModel(),
    });
    const svc = new InsuranceDomainService(prisma);
    const result = await svc.setReserve(5, { amount: 50000, reason: 'Initial reserve' }, TENANT, ACTOR);
    expect(result.reserve_type).toBe('initial');
    expect(result.running_total).toBe(50000);
    expect(prisma.claimEvent.create).toHaveBeenCalled();
  });

  it('creates an adjustment reserve when existing reserves exist', async () => {
    const prisma = makePrisma({
      insuranceClaim: makeModel({
        findFirst: jest.fn().mockResolvedValue({ id: 5, tenant_id: TENANT }),
        update: jest.fn().mockResolvedValue({ id: 5 }),
      }),
      claimReserve: makeModel({
        findMany: jest.fn().mockResolvedValue([{ id: 1, running_total: 50000 }]),
        create: jest.fn().mockResolvedValue({ id: 2, reserve_type: 'adjustment', amount: 10000, running_total: 60000 }),
      }),
      claimEvent: makeModel(),
    });
    const svc = new InsuranceDomainService(prisma);
    const result = await svc.setReserve(5, { amount: 10000 }, TENANT, ACTOR);
    expect(result.reserve_type).toBe('adjustment');
    expect(result.running_total).toBe(60000);
  });
});

describe('InsuranceDomainService.flagFraud', () => {
  it('sets fraud flag and creates timeline event', async () => {
    const prisma = makePrisma({
      insuranceClaim: makeModel({
        findFirst: jest.fn().mockResolvedValue({ id: 5, tenant_id: TENANT }),
        update: jest.fn().mockResolvedValue({ id: 5, is_fraud_flagged: true }),
      }),
      claimEvent: makeModel(),
    });
    const svc = new InsuranceDomainService(prisma);
    const result = await svc.flagFraud(5, true, TENANT, ACTOR);
    expect(result.is_fraud_flagged).toBe(true);
    expect(prisma.claimEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ event_type: 'fraud_flagged' }) }),
    );
  });
});

// ── P4: Producer appointments ─────────────────────────────────────────────────

describe('InsuranceDomainService.createAppointment', () => {
  it('creates a producer appointment', async () => {
    const prisma = makePrisma({
      producerAppointment: makeModel({
        create: jest.fn().mockResolvedValue({ id: 1, agent_id: 'USR001', carrier_id: 1, state_code: 'CA', appointment_status: 'active' }),
      }),
    });
    const svc = new InsuranceDomainService(prisma);
    const result = await svc.createAppointment({ agent_id: 'USR001', carrier_id: 1, state_code: 'CA' }, TENANT);
    expect(result.agent_id).toBe('USR001');
    expect(result.appointment_status).toBe('active');
  });
});

describe('InsuranceDomainService.reconcileStatement', () => {
  it('reconciles a commission statement by matching entries', async () => {
    const prisma = makePrisma({
      commissionStatement: makeModel({
        findFirst: jest.fn().mockResolvedValue({ id: 1, carrier_id: 1, statement_period: '2026-04', total_actual: 5000, tenant_id: TENANT }),
        update: jest.fn().mockResolvedValue({ id: 1, status: 'reconciled', total_expected: 4500, variance: 500 }),
      }),
      commissionEntry: makeModel({
        findMany: jest.fn().mockResolvedValue([
          { commission_amount: 2000 },
          { commission_amount: 2500 },
        ]),
      }),
    });
    const svc = new InsuranceDomainService(prisma);
    const result = await svc.reconcileStatement(1, TENANT, ACTOR);
    expect(result.status).toBe('reconciled');
    expect(prisma.commissionStatement.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'reconciled', total_expected: 4500 }) }),
    );
  });
});

// ── P0: Rating adapter ────────────────────────────────────────────────────────

describe('RatingAdapterRegistry', () => {
  const {
    RatingAdapterRegistry, InternalRatingAdapter, SimulatedCarrierAdapter, CarrierApiAdapter, ADAPTER_STATUS,
  } = require('../src/services/rating-adapter');

  it('returns internal adapter by default', () => {
    const mockEngine = { calculateQuote: jest.fn() };
    const registry = new RatingAdapterRegistry(mockEngine);
    const adapter = registry.getAdapter('UNKNOWN');
    expect(adapter).toBeInstanceOf(InternalRatingAdapter);
  });

  it('returns internal adapter when carrierCode is null/undefined', () => {
    const mockEngine = { calculateQuote: jest.fn() };
    const registry = new RatingAdapterRegistry(mockEngine);
    expect(registry.getAdapter(null)).toBeInstanceOf(InternalRatingAdapter);
    expect(registry.getAdapter(undefined)).toBeInstanceOf(InternalRatingAdapter);
  });

  it('internal adapter delegates to engine.calculateQuote', async () => {
    const mockResult = { premium: { breakdown: { monthly: 100, annual: 1200 } } };
    const mockEngine = { calculateQuote: jest.fn().mockReturnValue(mockResult) };
    const registry = new RatingAdapterRegistry(mockEngine);
    const adapter = registry.getInternal();
    const { quoteResult, rateSource, rateSourceMeta } = await adapter.rate({ product_type: 'term_life' });
    expect(quoteResult).toBe(mockResult);
    expect(rateSource).toBe('internal');
    expect(rateSourceMeta.adapter).toBe('genesis_engine');
    expect(rateSourceMeta.status).toBe(ADAPTER_STATUS.READY);
    expect(mockEngine.calculateQuote).toHaveBeenCalledWith({ product_type: 'term_life' });
  });

  it('registerSimulated creates a simulated carrier adapter', async () => {
    const mockResult = { premium: { breakdown: { monthly: 100, annual: 1200 }, total_annual: 1200 } };
    const mockEngine = { calculateQuote: jest.fn().mockReturnValue(mockResult) };
    const registry = new RatingAdapterRegistry(mockEngine);
    registry.registerSimulated('GLA', {
      name: 'Guardian Life', rateFactor: 0.92, products: ['term_life'], amBestRating: 'A++',
    });

    expect(registry.hasCarrier('GLA')).toBe(true);
    const adapter = registry.getAdapter('GLA');
    expect(adapter).toBeInstanceOf(SimulatedCarrierAdapter);

    const { rateSource, rateSourceMeta } = await adapter.rate({ product_type: 'term_life' });
    expect(rateSource).toBe('simulated');
    expect(rateSourceMeta.carrier_code).toBe('GLA');
    expect(rateSourceMeta.rate_factor).toBe(0.92);
    expect(rateSourceMeta.disclaimer).toBeTruthy();
  });

  it('unconfigured CarrierApiAdapter falls back to internal', async () => {
    const mockResult = { premium: { breakdown: { monthly: 100, annual: 1200 } } };
    const mockEngine = { calculateQuote: jest.fn().mockReturnValue(mockResult) };
    const registry = new RatingAdapterRegistry(mockEngine);
    // Register without API config — should fallback gracefully
    registry.registerCarrierApi('NOCFG', {});

    const adapter = registry.getAdapter('NOCFG');
    expect(adapter).toBeInstanceOf(CarrierApiAdapter);
    expect(adapter.isConfigured).toBe(false);

    const { rateSource, rateSourceMeta } = await adapter.rate({ product_type: 'term_life' });
    expect(rateSource).toBe('internal_fallback');
    expect(rateSourceMeta.fallback_reason).toBe('not_configured');
    expect(rateSourceMeta.status).toBe(ADAPTER_STATUS.UNAVAILABLE);
  });

  it('listAdapters returns metadata for all registered adapters', () => {
    const mockEngine = { calculateQuote: jest.fn() };
    const registry = new RatingAdapterRegistry(mockEngine);
    registry.registerSimulated('GLA', { name: 'Guardian', products: ['term_life'] });
    registry.registerSimulated('SNL', { name: 'Summit', products: ['universal_life'] });

    const adapters = registry.listAdapters();
    expect(adapters).toHaveLength(3); // internal + 2 carriers
    expect(adapters[0].adapter).toBe('genesis_engine');
    expect(adapters.find(a => a.carrierCode === 'GLA')).toBeTruthy();
    expect(adapters.find(a => a.carrierCode === 'SNL')).toBeTruthy();
  });
});

// ── Date coercion (empty string must not become Invalid Date) ────────────────
describe('InsuranceDomainService — date coercion', () => {
  it('createRenewalTask: empty renewal_date falls back to the policy date (no crash)', async () => {
    const prisma = makePrisma();
    prisma.insurancePolicy.findFirst.mockResolvedValue({ id: 5, tenant_id: 1, renewal_due_date: '2027-01-01', agent_id: 'A1' });
    const svc = new InsuranceDomainService(prisma);

    const task = await svc.createRenewalTask({ policy_id: 5, renewal_date: '' }, 1);
    expect(prisma.renewalTask.create).toHaveBeenCalled();
    expect(task.renewal_date).toBeInstanceOf(Date);
    expect(Number.isNaN(task.renewal_date.getTime())).toBe(false);
  });

  it('createRenewalTask: no valid date anywhere → 400, never an Invalid Date write', async () => {
    const prisma = makePrisma();
    prisma.insurancePolicy.findFirst.mockResolvedValue({ id: 5, tenant_id: 1, renewal_due_date: null, agent_id: 'A1' });
    const svc = new InsuranceDomainService(prisma);

    await expect(svc.createRenewalTask({ policy_id: 5, renewal_date: '' }, 1))
      .rejects.toMatchObject({ statusCode: 400 });
    expect(prisma.renewalTask.create).not.toHaveBeenCalled();
  });

  it('createBillingSchedule: empty next_due_date falls back through policy dates', async () => {
    const prisma = makePrisma();
    prisma.insurancePolicy.findFirst.mockResolvedValue({ id: 5, tenant_id: 1, renewal_due_date: null, effective_date: '2026-06-01', premium_frequency: 'monthly', premium_amount: 100 });
    const svc = new InsuranceDomainService(prisma);

    const sched = await svc.createBillingSchedule(5, { next_due_date: '' }, 1);
    expect(sched.next_due_date).toBeInstanceOf(Date);
    expect(Number.isNaN(sched.next_due_date.getTime())).toBe(false);
  });
});
