import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { BUILDER_GUIDES, GUIDE_KEYS, guideFor } from '../src/utils/builderGuides';
import BuilderGuide from '../src/components/builder/BuilderGuide';
import {
  STEP_SCHEMAS, STEP_TYPE_KEYS, CONDITION_OPERATORS, VALUELESS_OPERATORS,
  parseStepConfig, validateStepConfig,
} from '../src/utils/workflowStepSchema';

// Every route the Builder sidebar links to. A section without guidance is a
// section that drops an admin into a form with no explanation, which is what
// this registry exists to prevent.
const BUILDER_ROUTES = [
  '/builder/modules', '/builder/appearance', '/builder/form', '/builder/dashboard',
  '/builder/pipeline', '/builder/wizard', '/builder/documents',
  '/builder/workflow', '/builder/assignment', '/builder/lead-scoring', '/builder/sla',
  '/builder/integrations', '/builder/integration-health', '/builder/email-templates',
  '/builder/social-media', '/builder/push-notifications',
  '/builder/permissions', '/builder/employees', '/builder/org-chart', '/builder/roles',
];

describe('the guide registry', () => {
  it('covers every Builder section', () => {
    const missing = BUILDER_ROUTES.filter((r) => !BUILDER_GUIDES[r]);
    expect(missing).toEqual([]);
  });

  it('has no guide for a route that does not exist', () => {
    // Guidance for a dead route is guidance nobody will ever read.
    const stray = GUIDE_KEYS.filter((k) => k.startsWith('/builder/') && !BUILDER_ROUTES.includes(k));
    expect(stray).toEqual([]);
  });

  it('states what every section is for, in a real sentence', () => {
    for (const [key, g] of Object.entries(BUILDER_GUIDES)) {
      expect(g.what, key).toBeTruthy();
      expect(g.what.length, key).toBeGreaterThan(40);
      expect(g.what.trim().endsWith('.'), key).toBe(true);
    }
  });

  it('gives every section practice notes or pitfalls — never an empty shell', () => {
    for (const [key, g] of Object.entries(BUILDER_GUIDES)) {
      const lines = (g.standards?.length ?? 0) + (g.pitfalls?.length ?? 0);
      expect(lines, `${key} has no guidance lines`).toBeGreaterThanOrEqual(2);
    }
  });

  it('gives the four AUTOMATE sections full treatment', () => {
    // These are the ones where a misconfiguration is silent, so they carry the
    // "when to use this instead" note as well.
    for (const key of ['/builder/workflow', '/builder/assignment', '/builder/lead-scoring', '/builder/sla']) {
      const g = BUILDER_GUIDES[key];
      expect(g.when, key).toBeTruthy();
      expect(g.standards.length, key).toBeGreaterThanOrEqual(4);
      expect(g.pitfalls.length, key).toBeGreaterThanOrEqual(3);
    }
  });

  it('writes concrete lines, not filler', () => {
    const filler = /best practice|as needed|as appropriate|etc\.$|and so on/i;
    for (const [key, g] of Object.entries(BUILDER_GUIDES)) {
      for (const line of [...(g.standards ?? []), ...(g.pitfalls ?? [])]) {
        expect(filler.test(line), `${key}: "${line}"`).toBe(false);
        expect(line.length, `${key}: "${line}"`).toBeGreaterThan(30);
      }
    }
  });
});

describe('guideFor', () => {
  it('matches a section exactly', () => {
    expect(guideFor('/builder/sla').key).toBe('/builder/sla');
  });

  it('gives a detail route its section guide', () => {
    // The advice is about the section, not the record being edited.
    expect(guideFor('/builder/form/12').key).toBe('/builder/form');
    expect(guideFor('/builder/dashboard/new').key).toBe('/builder/dashboard');
  });

  it('does not match a different section that shares a word prefix', () => {
    expect(guideFor('/builder/integration-health').key).toBe('/builder/integration-health');
  });

  it('returns null for a route with no guide', () => {
    expect(guideFor('/builder/trash')).toBeNull();
    expect(guideFor('/reports')).toBeNull();
    expect(guideFor(undefined)).toBeNull();
  });
});

describe('BuilderGuide', () => {
  const renderAt = (section) => render(
    <MemoryRouter><BuilderGuide section={section} /></MemoryRouter>,
  );

  beforeEach(() => { try { window.localStorage.clear(); } catch { /* ignore */ } });

  it('opens by default so a first-time admin cannot miss it', () => {
    renderAt('/builder/assignment');
    expect(screen.getByText(BUILDER_GUIDES['/builder/assignment'].what)).toBeInTheDocument();
    expect(screen.getByText('How this is normally set up')).toBeInTheDocument();
    expect(screen.getByText('Watch out for')).toBeInTheDocument();
  });

  it('collapses, and remembers that choice for the section', () => {
    const { unmount } = renderAt('/builder/sla');
    fireEvent.click(screen.getByRole('button', { expanded: true }));
    expect(screen.queryByText('Watch out for')).not.toBeInTheDocument();
    unmount();

    // An experienced admin collapses each section once and should not see it
    // open again on the next visit.
    renderAt('/builder/sla');
    expect(screen.queryByText('Watch out for')).not.toBeInTheDocument();
  });

  it('remembers per section, not globally', () => {
    const { unmount } = renderAt('/builder/sla');
    fireEvent.click(screen.getByRole('button', { expanded: true }));
    unmount();

    renderAt('/builder/workflow');
    expect(screen.getByText('Watch out for')).toBeInTheDocument();
  });

  it('renders nothing for a section with no guide', () => {
    const { container } = renderAt('/builder/trash');
    expect(container).toBeEmptyDOMElement();
  });

  it('shows the "when to use" note where one exists', () => {
    renderAt('/builder/workflow');
    expect(screen.getByText('When to use this')).toBeInTheDocument();
  });
});

// ── Workflow step config ────────────────────────────────────────────────────

describe('the workflow step schema', () => {
  it('covers every step type the canvas offers', () => {
    for (const type of ['trigger', 'condition', 'action', 'notification', 'delay',
      'approval', 'webhook', 'integration', 'create_record', 'update_related']) {
      expect(STEP_TYPE_KEYS).toContain(type);
    }
  });

  it('explains and gives a practice note for each type', () => {
    for (const [type, schema] of Object.entries(STEP_SCHEMAS)) {
      expect(schema.summary, type).toBeTruthy();
      expect(schema.standard.length, type).toBeGreaterThan(60);
      expect(schema.example, type).toBeDefined();
    }
  });

  it('ships an example that satisfies its own required fields', () => {
    // An example that would not save is worse than none.
    for (const type of STEP_TYPE_KEYS) {
      const { missing } = validateStepConfig(type, STEP_SCHEMAS[type].example);
      expect(missing, type).toEqual([]);
    }
  });

  it('marks required only the keys the engine cannot act without', () => {
    expect(STEP_SCHEMAS.action.fields.filter((f) => f.required).map((f) => f.key)).toEqual(['field', 'value']);
    expect(STEP_SCHEMAS.create_record.fields.filter((f) => f.required).map((f) => f.key)).toEqual(['object_id', 'fields']);
    expect(STEP_SCHEMAS.update_related.fields.filter((f) => f.required).map((f) => f.key))
      .toEqual(['object_id', 'link_field', 'field', 'value']);
  });

  it('offers every operator the engine implements', () => {
    const engineOps = ['eq', 'neq', 'in', 'nin', 'gt', 'lt', 'gte', 'lte', 'contains',
      'empty', 'notempty', 'before_today', 'after_today', 'today', 'date_within_days', 'date_overdue'];
    const offered = CONDITION_OPERATORS.map((o) => o.value);
    for (const op of engineOps) expect(offered).toContain(op);
  });
});

describe('parseStepConfig', () => {
  it('reports why invalid JSON failed, rather than discarding it', () => {
    // The regression: `catch { config = {} }` silently threw the author's work
    // away and saved an empty step that did nothing.
    const result = parseStepConfig('{ "field": }');
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/Invalid JSON/);
    expect(result.value).toBeUndefined();
  });

  it('accepts an empty editor as an empty config', () => {
    expect(parseStepConfig('')).toEqual({ ok: true, value: {} });
    expect(parseStepConfig('   ')).toEqual({ ok: true, value: {} });
    expect(parseStepConfig(null)).toEqual({ ok: true, value: {} });
  });

  it('passes an already-parsed object straight through', () => {
    expect(parseStepConfig({ field: 'x' })).toEqual({ ok: true, value: { field: 'x' } });
  });

  it('rejects valid JSON that is not an object', () => {
    for (const raw of ['"text"', '42', '[1,2]', 'null']) {
      expect(parseStepConfig(raw).ok, raw).toBe(false);
    }
  });
});

describe('validateStepConfig', () => {
  it('blocks a step that cannot act, naming what is missing', () => {
    expect(validateStepConfig('action', {}).missing).toEqual(['Field to set', 'New value']);
    expect(validateStepConfig('action', { field: 'status', value: 'open' }).missing).toEqual([]);
  });

  it('treats blank strings and empty objects as absent', () => {
    expect(validateStepConfig('action', { field: '  ', value: '' }).missing).toHaveLength(2);
    expect(validateStepConfig('create_record', { object_id: 5, fields: {} }).missing).toEqual(['Field values']);
  });

  it('warns when a step has no recipient it could ever resolve', () => {
    const { warnings } = validateStepConfig('notification', { title: 'Hi' });
    expect(warnings[0]).toMatch(/at least one recipient/);
  });

  it('warns that an approval with no approver waits forever', () => {
    expect(validateStepConfig('approval', { title: 'Approve?' }).warnings[0]).toMatch(/never be completed/);
  });

  it('warns that a webhook needs an integration or a URL', () => {
    expect(validateStepConfig('webhook', {}).warnings[0]).toMatch(/integration name or a URL/);
    expect(validateStepConfig('webhook', { integration: 'slack' }).warnings).toEqual([]);
  });

  it('flags a value given to an operator that ignores it', () => {
    const { warnings } = validateStepConfig('condition', { field: 'x', operator: 'notempty', value: 'y' });
    expect(warnings[0]).toMatch(/ignores Value/);
    for (const op of VALUELESS_OPERATORS) {
      expect(validateStepConfig('condition', { field: 'x', operator: op }).warnings).toEqual([]);
    }
  });

  it('never blocks on a warning', () => {
    // Advisory problems must not stop an author saving a work in progress.
    expect(validateStepConfig('notification', { title: 'Hi' }).missing).toEqual([]);
  });

  it('is silent for an unknown step type rather than throwing', () => {
    expect(validateStepConfig('made_up', {})).toEqual({ missing: [], warnings: [] });
  });
});
