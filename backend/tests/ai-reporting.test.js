'use strict';

jest.mock('@prisma/client');

const AiReportingService = require('../src/services/ai-reporting.service');
const { buildPlanSchema, routeSources, validatePlan, recommendViz, isGrounded, catalogueBlock } = AiReportingService;
const ReportService = require('../src/services/report.service');
const { SOURCES, getField } = require('../src/services/report-registry');
const { METRICS, FIELD_SYNONYMS, SENSITIVE_FIELDS, SOURCE_SEMANTICS } = require('../src/services/report-semantics');
const { StubProvider, createProvider, OllamaProvider, extractJson, LlmError } = require('../src/services/llm/provider');

const vocab = new ReportService(null).getVocabulary();

// ── Semantics integrity ─────────────────────────────────────────────────────

describe('report semantics resolve against the registry', () => {
  it('has semantics for every source', () => {
    expect(Object.keys(SOURCE_SEMANTICS).sort()).toEqual(Object.keys(SOURCES).sort());
    for (const s of Object.values(SOURCE_SEMANTICS)) expect(s.also_known_as.length).toBeGreaterThan(1);
  });

  it('names only fields that exist, for every metric, synonym and denylist entry', () => {
    for (const [key, m] of Object.entries(METRICS)) {
      expect(SOURCES[m.source]).toBeDefined();
      for (const d of m.allowed_dimensions) expect({ metric: key, dim: d, ok: !!getField(m.source, d) }).toEqual({ metric: key, dim: d, ok: true });
      for (const f of m.filters) expect(getField(m.source, f.field)).toBeTruthy();
      for (const mm of m.metrics || [m.metric]) if (mm.field) expect(getField(m.source, mm.field)).toBeTruthy();
      expect(getField(m.source, m.date_field)).toBeTruthy();
    }
    for (const k of [...Object.keys(FIELD_SYNONYMS), ...SENSITIVE_FIELDS]) {
      const [s, ...rest] = k.split('.');
      expect({ key: k, ok: !!getField(s, rest.join('.')) }).toEqual({ key: k, ok: true });
    }
  });

  it('only aggregates fields the registry marks as measures', () => {
    for (const m of Object.values(METRICS)) {
      for (const mm of m.metrics || [m.metric]) {
        if (['sum', 'avg', 'min', 'max'].includes(mm.agg)) expect(getField(m.source, mm.field).agg).toBe(true);
      }
    }
  });
});

// ── Plan schema ─────────────────────────────────────────────────────────────

describe('the ReportPlan schema is derived from the engine vocabulary', () => {
  const schema = buildPlanSchema();
  const cfg = schema.properties.config.properties;

  it('enumerates exactly the registry sources, aggregations and operators', () => {
    expect(cfg.source.enum).toEqual(Object.keys(SOURCES));
    expect(cfg.metrics.items.properties.agg.enum).toEqual(vocab.aggregations.map((a) => a.key));
    expect(cfg.filters.properties.conditions.items.properties.op.enum).toEqual(vocab.operators.map((o) => o.key));
    expect(cfg.metric_refs.items.enum).toEqual(Object.keys(METRICS));
  });

  it('forbids anything outside the contract', () => {
    expect(schema.additionalProperties).toBe(false);
    expect(cfg.filters.properties.conditions.items.additionalProperties).toBe(false);
    expect(cfg.filters.properties.conditions.items.properties.value).toEqual({ type: 'string' });
  });
});

// ── Catalogue selection ─────────────────────────────────────────────────────

describe('source routing', () => {
  it('routes by synonym and label, confidently when one source clearly wins', () => {
    expect(routeSources('top 5 reps by deal value')).toMatchObject({ sources: ['opportunities'], confident: true });
    expect(routeSources('how many open tickets by priority').sources[0]).toBe('cases');
    expect(routeSources('customers by industry with their account value').sources[0]).toBe('accounts');
    expect(routeSources('overdue tasks per assignee').sources[0]).toBe('tasks');
  });

  it('keeps the source already in play for a follow-up', () => {
    expect(routeSources('only the top 3', [{ config: { source: 'activities' } }]).sources).toEqual(['activities']);
  });

  it('falls back to a default pair when nothing matches', () => {
    expect(routeSources('zzzz qqqq')).toEqual({ sources: ['opportunities', 'leads'], confident: false });
  });

  it('never puts a sensitive field or a hidden field in the prompt', () => {
    const block = catalogueBlock(['leads', 'opportunities'], 'leads by email');
    expect(block).not.toMatch(/\bemail\b.*\| string/);
    expect(block).not.toContain('(id)');
    expect(block).toContain('NAMED METRICS');
    expect(block).toContain('won_revenue');
  });
});

// ── Validation ──────────────────────────────────────────────────────────────

describe('validatePlan', () => {
  const plan = (config) => ({ intent: 'report', config });

  it('expands a named metric into its measure and filters, and records the assumption', () => {
    const { errors, config, assumptions } = validatePlan(plan({ source: 'opportunities', viz: 'bar', metric_refs: ['open_pipeline'], group_by: [{ field: 'owner.employee_name' }], sort: [{ key: 'm0', dir: 'desc' }], limit: 5 }), vocab);
    expect(errors).toEqual([]);
    expect(config.metrics).toEqual([{ agg: 'sum', field: 'amount', label: 'Open pipeline' }]);
    expect(config.filters.conditions).toEqual([{ field: 'is_closed', op: 'equals', value: false }]);
    expect(config).toMatchObject({ limit: 5, totals: true, sort: [{ key: 'm0', dir: 'desc' }] });
    expect(assumptions[0]).toMatch(/Open pipeline/);
  });

  it('refuses a metric sliced by a dimension its owner has not sanctioned', () => {
    const { errors } = validatePlan(plan({ source: 'opportunities', metric_refs: ['won_revenue'], group_by: [{ field: 'name' }] }), vocab);
    expect(errors[0]).toMatch(/cannot be grouped by "name"/);
  });

  it('rejects invented fields, non-measures, roll-ups as groupings, bad enum values and sensitive fields, with specific messages', () => {
    const { errors, config } = validatePlan(plan({
      source: 'accounts',
      metrics: [{ agg: 'sum', field: 'profit' }, { agg: 'avg', field: 'name' }],
      group_by: [{ field: 'opportunities.amount' }, { field: 'annual_revenue', period: 'month' }],
      filters: { logic: 'AND', conditions: [{ field: 'account_type', op: 'equals', value: 'won' }, { field: 'owner.email', op: 'contains', value: 'x' }, { field: 'created_at', op: 'date_range', value: 'previous_year' }] },
    }), vocab);
    expect(config).toBeNull();
    expect(errors).toEqual(expect.arrayContaining([
      expect.stringMatching(/"profit" does not exist/),
      expect.stringMatching(/"name" is not a measure/),
      expect.stringMatching(/"opportunities.amount" is measure-only/),
      expect.stringMatching(/Only a date field can have a period/),
      expect.stringMatching(/"account_type" has no value "won"/),
      expect.stringMatching(/"owner.email" is not available/),
      expect.stringMatching(/"previous_year" is not a date preset/),
    ]));
  });

  it('coerces string filter values into what the engine expects', () => {
    const { errors, config } = validatePlan(plan({
      source: 'opportunities', viz: 'table',
      filters: { logic: 'OR', conditions: [
        { field: 'stage', op: 'in', value: 'proposal, negotiation' },
        { field: 'is_won', op: 'equals', value: 'true' },
        { field: 'amount', op: 'between', value: '100,500' },
        { field: 'close_date', op: 'date_range', value: '2026-01-01,2026-03-31' },
        { field: 'name', op: 'is_not_empty', value: '' },
      ] },
    }), vocab);
    expect(errors).toEqual([]);
    expect(config.filters).toEqual({
      logic: 'AND',
      conditions: [{ logic: 'OR', conditions: [
        { field: 'stage', op: 'in', value: ['proposal', 'negotiation'] },
        { field: 'is_won', op: 'equals', value: true },
        { field: 'amount', op: 'between', value: ['100', '500'] },
        { field: 'close_date', op: 'date_range', value: ['2026-01-01', '2026-03-31'] },
        { field: 'name', op: 'is_not_empty', value: null },
      ] }],
    });
  });

  it('gives a grouped report with no measure a record count, and a date grouping a default period', () => {
    const { config } = validatePlan(plan({ source: 'cases', group_by: [{ field: 'created_at' }] }), vocab);
    expect(config.metrics).toEqual([{ agg: 'count', label: 'Number of records' }]);
    expect(config.group_by).toEqual([{ field: 'created_at', period: 'month' }]);
    expect(config.viz).toBe('bar');
  });

  it('rejects an unknown source with the list of valid ones', () => {
    const { errors } = validatePlan(plan({ source: 'invoices' }), vocab);
    expect(errors[0]).toMatch(/Unknown source "invoices"/);
  });

  it('caps the limit and only accepts a sort key that exists', () => {
    const { config, errors } = validatePlan(plan({ source: 'leads', metric_refs: ['new_leads'], group_by: [{ field: 'lead_source' }], sort: [{ key: 'm7', dir: 'desc' }], limit: 5000 }), vocab);
    expect(errors[0]).toMatch(/Sort key "m7"/);
    expect(config).toBeNull();
    const ok = validatePlan(plan({ source: 'leads', metric_refs: ['new_leads'], group_by: [{ field: 'lead_source' }], limit: 5000 }), vocab);
    expect(ok.config.limit).toBe(1000);
  });
});

// ── Chart recommendation ────────────────────────────────────────────────────

describe('recommendViz', () => {
  const dim = (label = 'Stage') => ({ key: 'g', label, type: 'string', dimension: true });
  const m = (k = 'm0') => ({ key: k, label: 'Amount', type: 'currency' });
  const rows = (n) => Array.from({ length: n }, (_, i) => ({ g: `G${i}`, m0: 100 - i }));

  it('follows the result shape', () => {
    expect(recommendViz({}, { columns: [m()], rows: [{ m0: 1 }] }).type).toBe('kpi');
    expect(recommendViz({}, { columns: [dim('Month (by month)'), m()], rows: rows(6) }).type).toBe('line');
    expect(recommendViz({}, { columns: [dim(), m()], rows: rows(6) }).type).toBe('bar');
    expect(recommendViz({}, { columns: [dim(), m()], rows: rows(30) }).type).toBe('table');
    expect(recommendViz({}, { columns: [dim(), dim('Owner'), m()], rows: rows(6) }).type).toBe('pivot');
    expect(recommendViz({}, { columns: [dim(), dim('Owner'), m(), m('m1')], rows: rows(6) }).type).toBe('table');
    expect(recommendViz({}, { columns: [dim(), m()], rows: [] }).type).toBe('table');
  });

  it('draws a funnel only for an ordered stage field with falling values', () => {
    const cfg = { group_by: [{ field: 'stage' }] };
    expect(recommendViz(cfg, { columns: [dim(), m()], rows: rows(5) }).type).toBe('funnel');
    const rising = rows(5).map((r, i) => ({ ...r, m0: i }));
    expect(recommendViz(cfg, { columns: [dim(), m()], rows: rising }).type).toBe('bar');
  });

  it('never shows a comparison as a share of a whole, and honours an explicit request', () => {
    const out = recommendViz({ compare: 'previous_year', metrics: [{ calc: 'percent_of_total' }] }, { columns: [dim(), m()], rows: rows(4) });
    expect(out.type).toBe('bar');
    const forced = recommendViz({}, { columns: [dim(), m()], rows: rows(4) }, 'donut');
    expect(forced).toMatchObject({ type: 'donut', auto_selected: false });
    expect(forced.alternatives).not.toContain('donut');
  });
});

// ── Grounding ───────────────────────────────────────────────────────────────

describe('isGrounded', () => {
  const result = { rows: [{ g: 'West', m0: 102400 }, { g: 'East', m0: 51200 }], summary: { grand: { m0: 153600 } }, meta: { row_count: 2 } };

  it('accepts a narrative whose numbers all appear in the result, with separators, rounding or k/M scaling', () => {
    expect(isGrounded('West led with 102,400 of the 153,600 total across 2 regions; East had 51.2k.', result, [])).toBe(true);
    expect(isGrounded('The total was 0.15M.', result, [])).toBe(true);
  });

  it('rejects an invented number', () => {
    expect(isGrounded('West grew 37% to 102,400.', result, [])).toBe(false);
  });

  it('accepts numbers that come from the computed insights', () => {
    const insights = [{ title: 'West leads with 66.7% of the total', detail: '' }];
    expect(isGrounded('West is 66.7% of the total.', result, insights)).toBe(true);
  });
});

// ── Provider ────────────────────────────────────────────────────────────────

describe('llm provider', () => {
  it('picks the provider from the environment and defaults to Ollama', () => {
    expect(createProvider({}).name).toBe('ollama');
    expect(createProvider({ LLM_PROVIDER: 'stub' }).name).toBe('stub');
    expect(createProvider({ LLM_PROVIDER: 'openai-compatible', LLM_MODEL: 'x' }).name).toBe('openai-compatible');
    expect(new OllamaProvider({ baseUrl: 'http://h:1/', model: 'm' }).baseUrl).toBe('http://h:1');
  });

  it('pulls JSON out of a fenced or chatty reply and fails loudly otherwise', () => {
    expect(extractJson('```json\n{"a":1}\n```')).toEqual({ a: 1 });
    expect(extractJson('Sure! {"a":{"b":2}} hope that helps')).toEqual({ a: { b: 2 } });
    expect(() => extractJson('no json here')).toThrow(LlmError);
    expect(() => extractJson('')).toThrow(/empty/);
  });
});

// ── The service, end to end with a stub model ───────────────────────────────

describe('AiReportingService.ask', () => {
  const OPPORTUNITIES = [
    { id: 1, amount: 1200, is_closed: false, close_date: new Date('2026-04-10'), owner_id: 'E1', owner: { employee_name: 'Ann' } },
    { id: 2, amount: 800, is_closed: false, close_date: new Date('2026-05-10'), owner_id: 'E2', owner: { employee_name: 'Bob' } },
  ];
  function make({ enabled = true, rateLimiter = null } = {}) {
    const prisma = { crmOpportunity: { findMany: jest.fn().mockResolvedValue(OPPORTUNITIES) } };
    const provider = new StubProvider();
    const svc = new AiReportingService(prisma, { provider, reports: new ReportService(prisma), rateLimiter, env: { AI_REPORTING_ENABLED: String(enabled) } });
    return { svc, provider, prisma };
  }
  const ctx = { scope: 'team', employeeId: 'E1', fiscal_year_start_month: 4 };
  const GOOD = { intent: 'report', title: 'Top reps', explanation: 'Value of open deals per rep.', assumptions: ['Pipeline = open deals'], suggestions: ['By month'], config: { source: 'opportunities', viz: 'bar', metric_refs: ['open_pipeline'], group_by: [{ field: 'owner.employee_name' }], sort: [{ key: 'm0', dir: 'desc' }], limit: 5 } };

  it('is inert when the feature flag is off', async () => {
    const { svc, provider } = make({ enabled: false });
    expect(await svc.ask({ message: 'x' }, ctx)).toMatchObject({ status: 'disabled' });
    expect(provider.calls).toHaveLength(0);
    expect(await svc.status()).toMatchObject({ enabled: false, ok: false });
  });

  it('plans, validates, runs through the engine, recommends a chart and narrates from the insights', async () => {
    const { svc, provider } = make();
    provider.queue(GOOD);
    const out = await svc.ask({ message: 'Top 5 reps by pipeline', want_summary: false }, ctx);
    expect(out.status).toBe('success');
    expect(out.query.config.filters.conditions).toEqual([{ field: 'is_closed', op: 'equals', value: false }]);
    expect(out.data.rows.map((r) => r.m0)).toEqual([1200, 800]);
    expect(out.visualization).toMatchObject({ type: 'bar', auto_selected: false });
    expect(out.interpretation).toMatchObject({ title: 'Top reps', confidence: 'high', assumptions: expect.arrayContaining(['Pipeline = open deals']) });
    expect(out.suggestions).toEqual(['By month']);
    expect(typeof out.narrative).toBe('string');
    expect(out.narrative_grounded).toBe(true);
    expect(out.metadata).toMatchObject({ row_count: 2, scope: 'team' });
    // The prompt carried the temporal facts and the catalogue, and the user's question.
    const call = provider.calls[0];
    expect(call.system).toContain('Fiscal year starts in month 4');
    expect(call.system).toContain('SOURCE opportunities');
    expect(call.messages[0].content).toBe('Top 5 reps by pipeline');
    expect(call.schema).toBe(buildPlanSchema());
  });

  it('repairs an invalid plan exactly once, feeding the validator errors back', async () => {
    const { svc, provider } = make();
    provider.queue({ intent: 'report', config: { source: 'opportunities', metrics: [{ agg: 'sum', field: 'profit' }] } }).queue(GOOD);
    const out = await svc.ask({ message: 'profit per rep', want_summary: false }, ctx);
    expect(out.status).toBe('success');
    expect(provider.calls).toHaveLength(2);
    expect(provider.calls[1].messages[2].content).toMatch(/"profit" does not exist/);
  });

  it('gives up after the repair and asks the user instead of guessing a third time', async () => {
    const { svc, provider } = make();
    const bad = { intent: 'report', config: { source: 'opportunities', metrics: [{ agg: 'sum', field: 'profit' }] } };
    provider.queue(bad).queue(bad);
    const out = await svc.ask({ message: 'profit per rep', want_summary: false }, ctx);
    expect(out.status).toBe('plan_invalid');
    expect(out.plan_errors[0]).toMatch(/profit/);
    expect(out.clarification.question).toBeTruthy();
    expect(provider.calls).toHaveLength(2);
  });

  it('passes clarifications, refusals and chit-chat through without running anything', async () => {
    const { svc, provider, prisma } = make();
    provider.queue({ intent: 'clarify', clarification: { question: 'Which sales?', options: ['Won revenue', 'Pipeline'] } });
    expect(await svc.ask({ message: 'show me sales' }, ctx)).toMatchObject({ status: 'clarify', clarification: { question: 'Which sales?', options: ['Won revenue', 'Pipeline'] } });
    provider.queue({ intent: 'refuse', refusal_reason: 'No salary data.' });
    expect(await svc.ask({ message: 'salaries' }, ctx)).toMatchObject({ status: 'refused', refusal: 'No salary data.' });
    provider.queue({ intent: 'chitchat', reply: 'Hello!' });
    expect(await svc.ask({ message: 'hi' }, ctx)).toMatchObject({ status: 'chitchat', reply: 'Hello!' });
    expect(prisma.crmOpportunity.findMany).not.toHaveBeenCalled();
  });

  it('uses the model summary only when every numeral in it is in the result', async () => {
    const { svc, provider } = make();
    provider.queue(GOOD).queueText('Ann leads with 1,200 of the 2,000 total.');
    const ok = await svc.ask({ message: 'x', want_summary: true }, ctx);
    expect(ok.narrative).toBe('Ann leads with 1,200 of the 2,000 total.');
    expect(ok.narrative_grounded).toBe(true);

    provider.queue(GOOD).queueText('Ann grew 45% to 1,200.');
    const bad = await svc.ask({ message: 'x', want_summary: true }, ctx);
    expect(bad.narrative_grounded).toBe(false);
    expect(bad.narrative).not.toContain('45%');
  });

  it('reports a model outage as a status, not an exception', async () => {
    const { svc, provider } = make();
    provider.generateJson = async () => { throw new LlmError('down', { code: 'llm_unavailable' }); };
    const out = await svc.ask({ message: 'x' }, ctx);
    expect(out.status).toBe('llm_unavailable');
    expect(out.reply).toMatch(/not running/);
  });

  it('throttles a chatty user with a 429', async () => {
    const rateLimiter = { hit: jest.fn().mockResolvedValue({ limited: true, remaining: 0, retryAfterSec: 120 }) };
    const { svc } = make({ rateLimiter });
    await expect(svc.ask({ message: 'x' }, ctx)).rejects.toMatchObject({ statusCode: 429, retryAfter: 120 });
    expect(rateLimiter.hit).toHaveBeenCalledWith('ai-ask:E1', expect.objectContaining({ max: expect.any(Number) }));
  });

  it('rejects an empty or oversized question and passes history to the prompt', async () => {
    const { svc, provider } = make();
    await expect(svc.ask({ message: '  ' }, ctx)).rejects.toThrow(/Ask a question/);
    await expect(svc.ask({ message: 'x'.repeat(1001) }, ctx)).rejects.toThrow(/1,000/);
    provider.queue(GOOD);
    await svc.ask({ message: 'only the top 2', want_summary: false, history: [{ message: 'reps by pipeline', config: GOOD.config }] }, ctx);
    expect(provider.calls[0].system).toContain('PREVIOUS TURNS');
    expect(provider.calls[0].system).toContain('reps by pipeline');
  });

  it('explains an existing result, falling back to the computed findings on an outage', async () => {
    const { svc, provider } = make();
    const result = { columns: [{ key: 'g', label: 'Rep', type: 'string', dimension: true }, { key: 'm0', label: 'Pipeline', type: 'currency' }], rows: [{ g: 'Ann', m0: 1200 }, { g: 'Bob', m0: 800 }], summary: { grand: { m0: 2000 } }, meta: { row_count: 2 } };
    provider.queueText('Ann has 1,200 of 2,000.');
    expect(await svc.explain({ title: 'T', result }, ctx)).toMatchObject({ status: 'success', narrative: 'Ann has 1,200 of 2,000.', grounded: true });
    provider.generateText = async () => { throw new LlmError('down', { code: 'llm_timeout' }); };
    const out = await svc.explain({ title: 'T', result }, ctx);
    expect(out.status).toBe('llm_unavailable');
    expect(out.narrative).toMatch(/Ann/);
  });

  it('offers starter suggestions without touching the model', () => {
    const { svc, provider } = make();
    const s = svc.suggestions();
    expect(s.length).toBeGreaterThan(5);
    expect(provider.calls).toHaveLength(0);
  });
});
