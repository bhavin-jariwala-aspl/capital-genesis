'use strict';

const { RecordCompute } = require('../src/services/record-compute');

/**
 * A tiny in-memory EAV store: objects by name, records with object_id, and
 * typed field rows — enough to exercise lookups, effective dates and roll-ups.
 */
function store() {
  const objects = { plr_rate: 1, product: 2, loan: 3, party: 4 };
  const records = [
    { id: 101, object_id: 1 }, { id: 102, object_id: 1 }, { id: 103, object_id: 1 },
    { id: 201, object_id: 2 },
    { id: 301, object_id: 3 }, { id: 302, object_id: 3 }, { id: 303, object_id: 3 },
    { id: 401, object_id: 4 },
  ];
  const rows = [
    // PLR history: the future-dated row must be ignored.
    { record_id: 101, field_name: 'rate', num_value: 6.5, str_value: '6.5' },
    { record_id: 101, field_name: 'effective_from', str_value: '2025-01-01' },
    { record_id: 102, field_name: 'rate', num_value: 6.825, str_value: '6.825' },
    { record_id: 102, field_name: 'effective_from', str_value: '2026-03-01' },
    { record_id: 103, field_name: 'rate', num_value: 9.9, str_value: '9.9' },
    { record_id: 103, field_name: 'effective_from', str_value: '2999-01-01' },
    { record_id: 201, field_name: 'code', str_value: 'LND-RE' },
    { record_id: 201, field_name: 'margin', num_value: -0.675, str_value: '-0.675' },
    // Loans linked to party 401 through the `party` lookup.
    { record_id: 301, field_name: 'party', num_value: 401, str_value: '401' },
    { record_id: 301, field_name: 'amount', num_value: 1000, str_value: '1000' },
    { record_id: 301, field_name: 'status', str_value: 'active' },
    { record_id: 302, field_name: 'party', num_value: 401, str_value: '401' },
    { record_id: 302, field_name: 'amount', num_value: 500, str_value: '500' },
    { record_id: 302, field_name: 'status', str_value: 'closed' },
    { record_id: 303, field_name: 'party', num_value: 999, str_value: '999' },
    { record_id: 303, field_name: 'amount', num_value: 7, str_value: '7' },
  ];
  const objOf = (rid) => records.find((r) => r.id === rid)?.object_id;
  const db = {
    uiObject: { findFirst: async ({ where }) => (objects[where.name] ? { id: objects[where.name] } : null) },
    uiField: { findMany: async () => [] },
    record: { findMany: async ({ where }) => records.filter((r) => r.object_id === where.object_id).map((r) => ({ id: r.id })) },
    recordFieldValue: {
      findMany: async ({ where }) => rows.filter((r) =>
        (!where.field_name || r.field_name === where.field_name)
        && (where.str_value === undefined || r.str_value === where.str_value)
        && (!where.record_id || where.record_id.in.includes(r.record_id))
        && (!where.record || objOf(r.record_id) === where.record.object_id)),
      findUnique: async ({ where }) => rows.find((r) => r.record_id === where.record_id_field_name.record_id && r.field_name === where.record_id_field_name.field_name) ?? null,
    },
  };
  const data = { 401: { date_of_birth: '1980-01-01', name: 'Jane' } };
  return new RecordCompute(db, async (id) => data[id] ?? null);
}

describe('RecordCompute — formulas over records', () => {
  it('evaluates formula fields in order, so later ones see earlier results', async () => {
    const rc = store();
    const values = { amount: 1000000, tenure_months: 120, product_code: 'LND-RE' };
    const fields = [
      { name: 'rate', config: { expression: "LATEST('plr_rate', 'rate', 'effective_from') + LOOKUP('product', 'code', product_code, 'margin')", precision: 3 } },
      { name: 'emi', config: { expression: 'PMT(rate / 1200, tenure_months, amount)' } },
    ];
    expect(await rc.applyFormulas(1, values, null, fields)).toEqual(['rate', 'emi']);
    expect(values.rate).toBe(6.15);          // in-effect PLR 6.825 − 0.675, future row ignored
    expect(values.emi).toBeCloseTo(11177.53, 2);
  });

  it('follows a lookup path to the linked record', async () => {
    const rc = store();
    const values = { party: 401, tenure_months: 360 };
    const fields = [{ name: 'age_at_maturity', config: { expression: "AGE(party.date_of_birth, '2026-01-01') + tenure_months / 12" } }];
    await rc.applyFormulas(3, values, null, fields);
    expect(values.age_at_maturity).toBe(76);
  });

  it('rolls up children that point at this record, optionally filtered', async () => {
    const rc = store();
    const values = {};
    const fields = [
      { name: 'loans', config: { expression: "COUNT_RELATED('loan', 'party')" } },
      { name: 'active_exposure', config: { expression: "SUM_RELATED('loan', 'party', 'amount', 'status', 'active')" } },
    ];
    await rc.applyFormulas(4, values, 401, fields);
    expect(values.loans).toBe(2);
    expect(values.active_exposure).toBe(1000);
  });

  it('turns a broken formula into an empty value rather than a failed save', async () => {
    const rc = store();
    const values = {};
    await rc.applyFormulas(1, values, null, [{ name: 'x', config: { expression: 'NOPE(1)' } }]);
    expect(values.x).toBeNull();
  });
});

describe('RecordCompute — expression validation rules', () => {
  const field = (rule) => [{ name: 'tenure_months', label: 'Tenure', validations: [{ validation_type: 'expression', ...rule }] }];

  it('fails the field whose rule evaluates false, with the admin message', async () => {
    const rc = store();
    const { errors } = await rc.expressionErrors(
      field({ value: "AGE(party.date_of_birth, '2026-01-01') + tenure_months / 12 <= 65", error_message: 'Loan must end by age 65' }),
      { party: 401, tenure_months: 360 },
    );
    expect(errors).toEqual([{ field: 'tenure_months', message: 'Loan must end by age 65' }]);
  });

  it('passes when the rule holds and skips while the field is blank', async () => {
    const rc = store();
    expect((await rc.expressionErrors(field({ value: 'tenure_months <= 360' }), { tenure_months: 120 })).errors).toEqual([]);
    expect((await rc.expressionErrors(field({ value: 'false' }), {})).errors).toEqual([]);
  });

  it('reports an unparseable rule as a configuration warning, not a user error', async () => {
    const rc = store();
    const res = await rc.expressionErrors(field({ value: '((' }), { tenure_months: 1 });
    expect(res.errors).toEqual([]);
    expect(res.warnings[0]).toMatch(/formula rule is invalid/);
  });
});
