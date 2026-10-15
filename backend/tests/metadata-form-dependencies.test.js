'use strict';

jest.mock('@prisma/client');

const MetadataService = require('../src/services/metadata.service');

describe('MetadataService.getDependenciesForForm', () => {
  it('reads the dependencies from the cached form, with source and target names, without querying', async () => {
    const dep = { id: 1, source_field_id: 10, target_field_id: 11, condition_type: 'equals', condition_value: 'moratorium', action_type: 'show' };
    const outside = { id: 2, source_field_id: 99, target_field_id: 11, condition_type: 'equals', condition_value: 'x', action_type: 'show' };
    const form = {
      id: 5,
      field_layouts: [
        { field_id: 10, field: { id: 10, name: 'repayment_type', label: 'Repayment', dependencies_as_target: [] } },
        { field_id: 11, field: { id: 11, name: 'moratorium_months', label: 'Moratorium', dependencies_as_target: [dep, outside] } },
      ],
    };
    const db = { uiFormFieldLayout: { findMany: jest.fn() }, uiFieldDependency: { findMany: jest.fn() } };
    const cache = { key: (...k) => k.join(':'), remember: jest.fn(async () => form) };
    const svc = new MetadataService(db, cache);
    const deps = await svc.getDependenciesForForm(5);
    expect(deps).toEqual([{ ...dep, source_field: { id: 10, name: 'repayment_type', label: 'Repayment' }, target_field: { id: 11, name: 'moratorium_months', label: 'Moratorium' } }]);
    expect(db.uiFieldDependency.findMany).not.toHaveBeenCalled();
  });
});
