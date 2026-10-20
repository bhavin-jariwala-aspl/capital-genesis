import { describe, it, expect } from 'vitest';
import { toForm, toPayload } from '../src/pages/builder/WorkflowBuilderPage';

// The workflow dialog edits trigger_config through named controls. These pin
// the round trip: a "field changed" workflow must keep its field, a scheduled
// one its interval, and keys the form does not show must survive an edit.

describe('workflow trigger form', () => {
  it('saves the field a field-changed workflow watches', () => {
    const body = toPayload({ ...toForm(), name: 'w', trigger_type: 'field_changed', object_id: '7', tc_field: 'stage', tc_derived: true }, null);
    expect(body).toMatchObject({ trigger_type: 'field_changed', object_id: 7, trigger_config: { field: 'stage', derived: true } });
  });

  it('leaves the field filter off for "any field"', () => {
    const body = toPayload({ ...toForm(), name: 'w', trigger_type: 'field_changed', object_id: '7', tc_field: '' }, null);
    expect(body.trigger_config).toBeNull();
  });

  it('turns every + unit into interval_minutes, and back', () => {
    const body = toPayload({ ...toForm(), name: 's', trigger_type: 'scheduled', tc_every: '2', tc_unit: '1440' }, null);
    expect(body).toMatchObject({ object_id: null, trigger_config: { interval_minutes: 2880 } });
    expect(toForm({ id: 1, trigger_type: 'scheduled', trigger_config: { interval_minutes: 2880 } })).toMatchObject({ tc_every: 2, tc_unit: '1440' });
    expect(toForm({ id: 1, trigger_type: 'scheduled', trigger_config: { interval_minutes: 90 } })).toMatchObject({ tc_every: 90, tc_unit: '1' });
  });

  it('binds a per-record sweep to its object', () => {
    const body = toPayload({ ...toForm(), name: 's', trigger_type: 'scheduled', tc_every: '1', tc_unit: '1440', tc_per_record: true, tc_limit: '200', object_id: '4' }, null);
    expect(body).toMatchObject({ object_id: 4, trigger_config: { interval_minutes: 1440, per_record: true, limit: 200 } });
  });

  it('keeps trigger_config keys the form does not edit', () => {
    const row = { id: 9, name: 'm', trigger_type: 'manual', is_active: true, trigger_config: { show_when: { field: 'stage' }, success_message: 'Done' } };
    expect(toPayload(toForm(row), row).trigger_config).toEqual({ show_when: { field: 'stage' }, success_message: 'Done' });
  });

  it('defaults a new workflow to active and keeps an inactive one inactive', () => {
    expect(toForm().is_active).toBe(true);
    expect(toForm({ id: 3, is_active: false }).is_active).toBe(false);
  });
});
