'use strict';

const AssignmentService = require('../src/services/assignment.service');

/**
 * rule_based assignment on a Builder (custom) object.
 *
 * The engine used to read conditions only from the crm_* entity row, so on a
 * custom object every condition saw nothing, every rule_based rule failed, and
 * all records fell through to the fallback — routing silently inert.
 */
describe('AssignmentService — rule_based on a custom object', () => {
  function db() {
    return {
      assignmentRule: {
        findMany: jest.fn(async () => [
          { id: 1, rule_type: 'rule_based', conditions: [{ field: 'business_unit', operator: 'equals', value: 'LND' }], assignee_id: 'LOANS1', fallback_id: 'ADMIN1', order_index: 1 },
          { id: 2, rule_type: 'rule_based', conditions: [{ field: 'business_unit', operator: 'equals', value: 'WLT' }], assignee_id: 'WEALTH1', order_index: 2 },
        ]),
      },
      record: {
        findUnique: jest.fn(async () => ({ id: 10, crm_lead: null, crm_lead_intake: null, crm_contact: null, crm_account: null, crm_opportunity: null, crm_case: null })),
        update: jest.fn(async () => ({})),
      },
      recordFieldValue: { findMany: jest.fn(async () => [{ field_name: 'business_unit', str_value: 'WLT' }]) },
      assignmentLog: { create: jest.fn(async () => ({})) },
      uiPipelineStage: { findMany: jest.fn(async () => []) },
      employee: { findMany: jest.fn(async () => [{ employee_id: 'WEALTH1', is_active: true }]), findUnique: jest.fn(async () => ({ is_active: true })) },
    };
  }

  it('routes on a typed field value instead of falling through to the fallback', async () => {
    const d = db();
    const assignee = await new AssignmentService(d).assign(5, 10);
    expect(assignee).toBe('WEALTH1');
    expect(d.record.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ assigned_to: 'WEALTH1' }) }));
  });
});

describe('AssignmentService — people who have left', () => {
  function db(inactive) {
    return {
      assignmentRule: {
        findMany: jest.fn(async () => [
          { id: 1, rule_type: 'fixed', assignee_id: 'LEFT1', fallback_id: 'ADMIN1', order_index: 1 },
          { id: 2, rule_type: 'fixed', assignee_id: 'RM2', order_index: 2 },
        ]),
      },
      record: {
        findUnique: jest.fn(async () => ({ id: 10, crm_lead: null, crm_lead_intake: null, crm_contact: null, crm_account: null, crm_opportunity: null, crm_case: null })),
        update: jest.fn(async () => ({})),
      },
      recordFieldValue: { findMany: jest.fn(async () => []) },
      assignmentLog: { create: jest.fn(async () => ({})) },
      uiPipelineStage: { findMany: jest.fn(async () => []) },
      employee: {
        findMany: jest.fn(async () => []),
        findUnique: jest.fn(async ({ where }) => ({ is_active: !inactive.includes(where.employee_id) })),
      },
    };
  }

  it('a fixed rule naming a deactivated employee is passed over', async () => {
    expect(await new AssignmentService(db(['LEFT1'])).assign(5, 10)).toBe('RM2');
  });

  it('a deactivated fallback is never used — the record stays unassigned for a manager to route', async () => {
    expect(await new AssignmentService(db(['LEFT1', 'RM2', 'ADMIN1'])).assign(5, 10)).toBeNull();
  });
});
