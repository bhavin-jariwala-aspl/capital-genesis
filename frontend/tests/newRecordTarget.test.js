import { describe, it, expect } from 'vitest';
import { newRecordTarget, hasStaffCreateForm } from '../src/utils/newRecordTarget';

const formPath = '/module/93/object/187/new';
const wizards = [{ id: 18, name: 'genesis_investor_questionnaire' }];
const staff = { id: 1, form_type: 'create', is_active: true };
const step = { id: 2, form_type: 'wizard_step', is_active: true };
const web = { id: 3, form_type: 'create', is_active: true, config: { public: { enabled: true } } };

describe('newRecordTarget — the object page lists records; "New" opens a form or the wizard', () => {
  it('opens the staff form when the object has one, even if it also has a wizard', () => {
    expect(newRecordTarget({ forms: [staff, step, web], wizards, formPath })).toEqual({ path: formPath, wizard: false });
  });

  it('launches the wizard when a wizard is the only way to create a record', () => {
    expect(newRecordTarget({ forms: [step, web], wizards, formPath })).toEqual({ path: '/wizard/18', wizard: true });
    expect(newRecordTarget({ forms: [], wizards, formPath }).wizard).toBe(true);
  });

  it('keeps the form path without wizards, or while the forms are still loading', () => {
    expect(newRecordTarget({ forms: [step], wizards: [], formPath }).path).toBe(formPath);
    expect(newRecordTarget({ forms: undefined, wizards, formPath }).path).toBe(formPath);
  });

  it('does not count wizard steps, public web forms or inactive forms as staff forms', () => {
    expect(hasStaffCreateForm([step, web, { ...staff, is_active: false }])).toBe(false);
    expect(hasStaffCreateForm([{ ...staff, form_type: 'edit' }])).toBe(true);
  });
});
