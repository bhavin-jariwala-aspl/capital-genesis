'use strict';

const RecordService = require('../src/services/record.service');
const { ValidationError } = require('../src/utils/errors');

/**
 * Stage gates: a stage's config can require fields or a formula before a
 * record may enter it. Enforced in RecordService so every path — Kanban,
 * API, bulk, workflow — obeys it.
 */
function svc({ stageConfig, data }) {
  const record = { id: 1, object_id: 2, pipeline_stage_id: 10, created_by: 'U', assigned_to: null, tenant_id: 5, deleted_at: null };
  const db = {
    record: {
      findUnique: jest.fn(async ({ select }) => (select?.object ? { ...record, object: { name: 'loan_application' } } : record)),
      update: jest.fn(async ({ data: d }) => ({ ...record, ...d, pipeline_stage: { id: 20, name: 'disbursed', label: 'Disbursed', config: stageConfig } })),
      findMany: jest.fn(async () => [{ id: 1 }]),
      updateMany: jest.fn(async () => ({ count: 1 })),
    },
    uiPipelineStage: { findUnique: jest.fn(async () => ({ label: 'Disbursed', config: stageConfig })) },
    recordFieldValue: { findMany: jest.fn(async () => Object.entries(data).map(([field_name, v]) => ({ field_name, str_value: String(v), bool_value: typeof v === 'boolean' ? v : null }))) },
    auditLog: { create: jest.fn(async () => ({})), createMany: jest.fn(async () => ({})) },
    statusEvent: { create: jest.fn(async () => ({})) },
  };
  return { s: new RecordService(db), db };
}

describe('stage gates', () => {
  it('blocks a move when a required field is empty, naming it', async () => {
    const { s, db } = svc({ stageConfig: { required_fields: ['lms_reference'] }, data: {} });
    await expect(s.updateRecordStage(1, 20, 'U', null)).rejects.toThrow(/lms_reference/);
    expect(db.record.update).not.toHaveBeenCalled();
  });

  it('blocks a move when the entry rule is false, with the admin\'s message', async () => {
    const { s } = svc({
      stageConfig: { entry_rule: { expression: "kyc_status = 'approved' AND security_complete", message: 'KYC must be approved and security perfected' } },
      data: { kyc_status: 'pending', security_complete: true },
    });
    await expect(s.updateRecordStage(1, 20, 'U', null)).rejects.toThrow('KYC must be approved and security perfected');
  });

  it('lets the move through once the rule holds', async () => {
    const { s, db } = svc({
      stageConfig: { entry_rule: { expression: "kyc_status = 'approved' AND security_complete" } },
      data: { kyc_status: 'approved', security_complete: true },
    });
    await s.updateRecordStage(1, 20, 'U', null);
    expect(db.record.update).toHaveBeenCalled();
  });

  it('applies to bulk moves too, all-or-nothing', async () => {
    const { s, db } = svc({ stageConfig: { required_fields: ['lms_reference'] }, data: {} });
    await expect(s.bulkUpdateStage([1], 20, 'U', null)).rejects.toBeInstanceOf(ValidationError);
    expect(db.record.updateMany).not.toHaveBeenCalled();
  });
});

describe('stage moves in the user\'s words, and mirrored status fields', () => {
  function svc2({ stageConfig = {}, pipelineConfig = null, data = {}, labels = [] }) {
    const record = { id: 1, object_id: 2, pipeline_stage_id: 10, created_by: 'U', assigned_to: null, tenant_id: 5, deleted_at: null };
    const db = {
      record: {
        findUnique: jest.fn(async ({ select }) => (select?.object ? { ...record, object: { name: 'disbursement' } } : record)),
        update: jest.fn(async ({ data: d }) => ({ ...record, ...d, pipeline_stage: { id: 20, name: 'sent_to_lms', label: 'Sent to LMS', config: stageConfig } })),
      },
      uiPipelineStage: { findUnique: jest.fn(async ({ select }) => (select?.pipeline ? { pipeline: { config: pipelineConfig } } : { label: 'Booked', config: stageConfig })) },
      uiField: { findMany: jest.fn(async () => labels) },
      recordFieldValue: {
        findMany: jest.fn(async () => Object.entries(data).map(([field_name, v]) => ({ field_name, str_value: String(v) }))),
        createMany: jest.fn(async () => ({ count: 1 })),
        upsert: jest.fn(async () => ({})),
      },
      auditLog: { create: jest.fn(async () => ({})), createMany: jest.fn(async () => ({})) },
      statusEvent: { create: jest.fn(async () => ({})) },
    };
    return { s: new RecordService(db), db };
  }

  it('names missing fields by their label, keeping the field names in the details', async () => {
    const { s } = svc2({ stageConfig: { required_fields: ['lms_reference'] }, labels: [{ name: 'lms_reference', label: 'LMS reference' }] });
    const err = await s.updateRecordStage(1, 20, 'U', null).catch((e) => e);
    expect(err.message).toBe('Complete LMS reference before moving to Booked');
    expect(err.details).toEqual([{ field: 'lms_reference', label: 'LMS reference', message: 'Required for Booked' }]);
  });

  it('updates the status picklist the pipeline mirrors', async () => {
    const { s, db } = svc2({ pipelineConfig: { status_field: { field: 'status', map: { sent_to_lms: 'authorised' } } }, data: { status: 'requested' } });
    await s.updateRecordStage(1, 20, 'U', null);
    expect(db.recordFieldValue.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { record_id_field_name: { record_id: 1, field_name: 'status' } },
    }));
  });

  it('leaves fields alone when the pipeline mirrors nothing', async () => {
    const { s, db } = svc2({ data: { status: 'requested' } });
    await s.updateRecordStage(1, 20, 'U', null);
    expect(db.recordFieldValue.upsert).not.toHaveBeenCalled();
    expect(db.recordFieldValue.createMany).not.toHaveBeenCalled();
  });
});
