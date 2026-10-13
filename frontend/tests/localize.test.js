import { describe, it, expect } from 'vitest';
import { localizeMetadata } from '../src/utils/localize';

const sample = () => ({
  modules: [{ label: 'Clients', config: { label_fr: 'Clients' }, objects: [{ label: 'Party', plural_label: 'Parties', config: { label_fr: 'Tiers', plural_label_fr: 'Tiers' } }] }],
  fields: [{ label: 'Gender', config: {}, options: [{ value: 'm', label: 'Male', label_fr: 'Homme' }, { value: 'x', label: 'MUR' }] }],
  stages: [{ label: 'Approved', config: { label_fr: 'Approuvé' } }],
});

describe('localizeMetadata', () => {
  it('uses French labels where present and leaves the rest', () => {
    const d = localizeMetadata(sample(), 'fr');
    expect(d.modules[0].objects[0].label).toBe('Tiers');
    expect(d.modules[0].objects[0].plural_label).toBe('Tiers');
    expect(d.fields[0].label).toBe('Gender');
    expect(d.fields[0].options.map((o) => o.label)).toEqual(['Homme', 'MUR']);
    expect(d.stages[0].label).toBe('Approuvé');
  });
  it('is a no-op in English and for non-objects', () => {
    expect(localizeMetadata(sample(), 'en').stages[0].label).toBe('Approved');
    expect(localizeMetadata(null, 'fr')).toBeNull();
    expect(localizeMetadata('x', 'fr')).toBe('x');
  });
  it('copes with shared references', () => {
    const opt = { label: 'Yes', label_fr: 'Oui' };
    const d = localizeMetadata({ a: [opt], b: [opt] }, 'fr');
    expect(d.b[0].label).toBe('Oui');
  });
});
