import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

vi.mock('../src/services/report.service', () => ({
  reportService: {
    aiStatus: vi.fn(),
    aiSuggestions: vi.fn(),
    ask: vi.fn(),
    explain: vi.fn(),
    getVocabulary: vi.fn(),
    listSubscriptions: vi.fn(),
    createSubscription: vi.fn(),
    updateSubscription: vi.fn(),
    deleteSubscription: vi.fn(),
    sendSubscriptionNow: vi.fn(),
    widgetData: vi.fn(),
    drilldown: vi.fn(),
  },
  downloadBlob: vi.fn(),
  openPrintView: vi.fn(),
}));
vi.mock('recharts', async () => {
  const actual = await vi.importActual('recharts');
  return { ...actual, ResponsiveContainer: ({ children }) => <div>{children}</div> };
});

import { reportService as svc } from '../src/services/report.service';
import ParameterBar from '../src/components/reports/ParameterBar';
import InsightsPanel from '../src/components/reports/InsightsPanel';
import TrendStrip, { buildSeries } from '../src/components/reports/TrendStrip';
import AskPanel, { unwrapAnswer } from '../src/components/reports/AskPanel';
import SubscribeModal from '../src/components/reports/SubscribeModal';
import DashboardRenderer from '../src/components/runtime/DashboardRenderer';
import MeasureEditor from '../src/components/reports/MeasureEditor';
import FilterGroupBuilder from '../src/components/reports/FilterGroupBuilder';

function wrap(ui) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 0, gcTime: 0 } } });
  return render(<QueryClientProvider client={qc}><MemoryRouter>{ui}</MemoryRouter></QueryClientProvider>);
}

const DATE_PRESETS = [{ key: 'this_month', label: 'This month' }, { key: 'this_fiscal_year', label: 'This fiscal year' }];

describe('ParameterBar — prompted filters', () => {
  const parameters = [
    { key: 'stage', field: 'stage', label: 'Stage', type: 'enum', op: 'in', op_label: 'is any of', options: ['proposal', 'closed_won'], multi: true, default: ['proposal'], value: ['proposal'] },
    { key: 'close_date', field: 'close_date', label: 'Close date', type: 'date', op: 'date_range', op_label: 'is within', preset: true, default: 'this_month', value: 'this_month' },
  ];

  it('renders one control per prompt and applies the answers', () => {
    const onApply = vi.fn();
    render(<ParameterBar parameters={parameters} values={{}} datePresets={DATE_PRESETS} onApply={onApply} />);
    expect(screen.getByText('This report asks')).toBeInTheDocument();
    expect(screen.getByText('Stage')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'closed won' }));
    fireEvent.change(screen.getByDisplayValue('This month'), { target: { value: 'this_fiscal_year' } });
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));
    expect(onApply).toHaveBeenCalledWith({ stage: ['proposal', 'closed_won'], close_date: 'this_fiscal_year' });
  });

  it('offers a reset to the report defaults once an answer is in play', () => {
    const onApply = vi.fn();
    render(<ParameterBar parameters={parameters} values={{ stage: ['closed_won'] }} datePresets={DATE_PRESETS} onApply={onApply} />);
    fireEvent.click(screen.getByRole('button', { name: /Defaults/ }));
    expect(onApply).toHaveBeenCalledWith({});
  });

  it('renders nothing when the report has no prompts', () => {
    const { container } = render(<ParameterBar parameters={[]} values={{}} onApply={() => {}} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe('InsightsPanel', () => {
  const insights = [
    { kind: 'leader', severity: 'info', title: 'West leads with 60% of revenue', detail: '$600 of $1,000.' },
    { kind: 'data_quality', severity: 'warn', title: '20% has no region', detail: 'Fill it in.' },
  ];

  it('lists the computed findings with their severity', () => {
    render(<InsightsPanel insights={insights} />);
    expect(screen.getByText('West leads with 60% of revenue')).toBeInTheDocument();
    expect(screen.getByText('20% has no region')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
  });

  it('only offers Explain when the AI layer is available, and shows the narrative it returns', () => {
    const { rerender } = render(<InsightsPanel insights={insights} aiAvailable={false} onExplain={() => {}} />);
    expect(screen.queryByRole('button', { name: /Explain/ })).toBeNull();
    const onExplain = vi.fn();
    rerender(<InsightsPanel insights={insights} aiAvailable onExplain={onExplain} narrative={{ text: 'West is the leader.', grounded: false }} />);
    fireEvent.click(screen.getByRole('button', { name: /Explain/ }));
    expect(onExplain).toHaveBeenCalled();
    expect(screen.getByText(/West is the leader\./)).toBeInTheDocument();
    expect(screen.getByText(/did not pass the numbers check/)).toBeInTheDocument();
  });

  it('collapses', () => {
    render(<InsightsPanel insights={insights} />);
    fireEvent.click(screen.getByRole('button', { name: /What stands out/ }));
    expect(screen.queryByText('West leads with 60% of revenue')).toBeNull();
  });
});

describe('TrendStrip', () => {
  const history = {
    columns: [{ key: 'm0', label: 'Pipeline', type: 'currency' }],
    snapshots: [
      { at: '2026-08-01T08:00:00Z', scope: 'all', row_count: 5, grand: { m0: 1000 } },
      { at: '2026-08-15T08:00:00Z', scope: 'all', row_count: 6, grand: { m0: 1200 } },
      { at: '2026-09-01T08:00:00Z', scope: 'all', row_count: 7, grand: { m0: 1500 } },
    ],
    enough: true,
  };

  it('builds one series per measure with the change since the first snapshot', () => {
    const series = buildSeries(history);
    expect(series).toHaveLength(1);
    expect(series[0]).toMatchObject({ key: 'm0', last: 1500, deltaPct: 50 });
    expect(buildSeries({ columns: [], snapshots: [history.snapshots[0]] })).toEqual([]);
  });

  it('falls back to the row count when a report has no measures', () => {
    const rows = buildSeries({ columns: [], snapshots: history.snapshots });
    expect(rows[0]).toMatchObject({ key: 'row_count', last: 7 });
  });

  it('renders the latest value and the delta', () => {
    render(<TrendStrip history={history} />);
    expect(screen.getByText('Over time')).toBeInTheDocument();
    expect(screen.getByText('$1,500')).toBeInTheDocument();
    expect(screen.getByText('+50%')).toBeInTheDocument();
  });
});

describe('AskPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    svc.aiStatus.mockResolvedValue({ data: { enabled: true, ok: true, provider: 'ollama', model: 'llama3.1:8b' } });
    svc.aiSuggestions.mockResolvedValue({ data: ['Top 5 agents by premium', 'Open cases by priority'] });
  });

  it('shows starter questions and sends one, then renders the answer as a report with a narrative', async () => {
    // `reportService.ask` returns the envelope's `data` — i.e. the answer itself,
    // which has its own `data` field. Mock that exact shape: the panel once
    // unwrapped one level too far and rendered nothing.
    svc.ask.mockResolvedValue({
      status: 'success',
      interpretation: { title: 'Top 5 agents', description: 'Premium of active policies per agent.', assumptions: ['Premium = active policies.'], confidence: 'high' },
      query: { kind: 'report_config', config: { source: 'policies', viz: 'bar' } },
      data: { columns: [{ key: 'g', label: 'Agent', type: 'string', dimension: true }, { key: 'm0', label: 'Premium', type: 'currency' }], rows: [{ g: 'Ann', m0: 1200 }], summary: { grand: { m0: 1200 } }, comparison: null, insights: [] },
      visualization: { type: 'bar', auto_selected: true, reason: 'x', alternatives: ['table', 'line'] },
      narrative: 'Ann leads with 1,200.',
      suggestions: ['Compare with last year'],
      metadata: { row_count: 1, warnings: [] },
      timings: { total: 2100 },
      model: { name: 'llama3.1:8b' },
    });
    const { container } = wrap(<AskPanel scope="all" />);
    const chip = await screen.findByRole('button', { name: 'Top 5 agents by premium' });
    fireEvent.click(chip);
    await waitFor(() => expect(svc.ask).toHaveBeenCalledWith('Top 5 agents by premium', expect.objectContaining({ scope: 'all', history: [] })));
    expect(await screen.findByText('Ann leads with 1,200.')).toBeInTheDocument();
    expect(screen.getByText('Top 5 agents')).toBeInTheDocument();
    expect(screen.getByText(/Assumed:/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Save as report/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Compare with last year' })).toBeInTheDocument();
    expect(screen.getByText('llama3.1:8b ready')).toBeInTheDocument();
    // The chart region is rendered (recharts' wrapper is present under the answer card).
    expect(container.querySelector('.recharts-responsive-container, .recharts-wrapper, svg')).not.toBeNull();
    expect(screen.getByRole('button', { name: 'Show as bar' })).toBeInTheDocument();
  });

  it('renders a clarification as clickable options and sends the chosen one with history', async () => {
    svc.ask.mockResolvedValueOnce({ status: 'clarify', clarification: { question: 'Which sales?', options: ['Won revenue', 'Pipeline'] }, suggestions: [] })
      .mockResolvedValueOnce({ status: 'refused', refusal: 'Not available.', suggestions: [] });
    wrap(<AskPanel scope="team" />);
    await screen.findByRole('button', { name: 'Top 5 agents by premium' });
    fireEvent.change(screen.getByLabelText('Ask a question'), { target: { value: 'show me sales' } });
    fireEvent.click(screen.getByRole('button', { name: /Ask$/ }));
    expect(await screen.findByText('Which sales?')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Won revenue' }));
    expect(await screen.findByText('Not available.')).toBeInTheDocument();
    expect(svc.ask).toHaveBeenCalledTimes(2);
  });

  it('goes back one level: a conversation returns to the landing page, the landing page leaves Ask', async () => {
    svc.ask.mockResolvedValue({ status: 'refused', refusal: 'Not available.', suggestions: [] });
    const onBack = vi.fn();
    wrap(<AskPanel scope="all" onBack={onBack} />);

    // On the landing page, back leaves Ask altogether.
    fireEvent.click(await screen.findByRole('button', { name: 'Back to reports' }));
    expect(onBack).toHaveBeenCalledTimes(1);

    // With a conversation, back returns to the starter screen instead.
    fireEvent.click(await screen.findByRole('button', { name: 'Top 5 agents by premium' }));
    expect(await screen.findByText('Not available.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Back to Ask Genesis' }));
    expect(onBack).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Open cases by priority' })).toBeInTheDocument();

    // The conversation is kept, not discarded, and can be reopened.
    fireEvent.click(screen.getByRole('button', { name: /Back to your last answer/ }));
    expect(screen.getByText('Not available.')).toBeInTheDocument();

    // "Start over" is the explicit way to discard it.
    fireEvent.click(screen.getByRole('button', { name: 'Start over' }));
    expect(screen.queryByText('Not available.')).toBeNull();
    expect(screen.queryByRole('button', { name: /Back to your last answer/ })).toBeNull();
  });

  it('never mistakes the answer’s own data block for the envelope', () => {
    const answer = { status: 'success', data: { columns: [], rows: [] } };
    expect(unwrapAnswer(answer)).toBe(answer);
    expect(unwrapAnswer({ data: answer })).toBe(answer);
    expect(unwrapAnswer(null)).toBeNull();
  });

  it('explains how to switch the feature on when the server has it disabled', async () => {
    svc.aiStatus.mockResolvedValue({ data: { enabled: false } });
    wrap(<AskPanel />);
    expect(await screen.findByText('Ask is not enabled on this server')).toBeInTheDocument();
  });
});

describe('SubscribeModal — threshold alerts', () => {
  const schedule = {
    frequencies: [{ key: 'hourly', label: 'Every hour' }, { key: 'daily', label: 'Every day' }, { key: 'weekly', label: 'Every week' }],
    formats: [{ key: 'xlsx', label: 'Excel attachment' }],
    hours: [{ key: 8, label: '8:00 AM' }],
    days_of_week: [{ key: 1, label: 'Monday' }],
    alert_ops: [{ key: 'gt', label: 'is greater than' }, { key: 'changed', label: 'has changed since the last check', no_value: true }],
  };
  const result = { columns: [{ key: 'g', label: 'Stage', type: 'string', dimension: true }, { key: 'm0', label: 'Pipeline', type: 'currency' }], rows: [] };

  beforeEach(() => {
    vi.clearAllMocks();
    svc.listSubscriptions.mockResolvedValue({ data: [
      { id: 1, frequency: 'hourly', hour: 8, format: 'xlsx', scope: 'all', is_active: true, last_status: 'skipped', last_error: 'Condition not met — Pipeline is 70, not is greater than 100.',
        recipients: { emails: ['a@b.com'], alert: { measure: 'm0', op: 'gt', value: 100, label: 'Pipeline', state: { last_value: 70 } } } },
    ] });
    svc.createSubscription.mockResolvedValue({ data: {} });
  });

  it('describes an existing alert subscription and its last check', async () => {
    wrap(<SubscribeModal report={{ id: 1, name: 'Pipeline' }} schedule={schedule} result={result} onClose={() => {}} />);
    expect(await screen.findByText('Every hour')).toBeInTheDocument();
    expect(screen.getByText(/Only when Pipeline is greater than 100/)).toBeInTheDocument();
    expect(screen.getByText(/last seen 70/)).toBeInTheDocument();
    expect(screen.getByText(/last check: not sent/)).toBeInTheDocument();
    expect(screen.getByText(/also to 1 other/)).toBeInTheDocument();
  });

  it('lets a user add an "only send when" condition and sends it as `alert`', async () => {
    wrap(<SubscribeModal report={{ id: 1, name: 'Pipeline' }} schedule={schedule} result={result} onClose={() => {}} />);
    fireEvent.click(await screen.findByRole('button', { name: /Add a schedule/ }));
    fireEvent.change(screen.getByDisplayValue('Every week'), { target: { value: 'hourly' } });
    expect(screen.queryByText('At')).toBeNull();
    fireEvent.click(screen.getByRole('checkbox', { name: /Only send when/ }));
    fireEvent.change(screen.getByLabelText('Alert measure'), { target: { value: 'row_count' } });
    fireEvent.change(screen.getByLabelText('Alert value'), { target: { value: '20' } });
    expect(screen.getByText(/only when Number of rows is greater than 20/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Save schedule' }));
    await waitFor(() => expect(svc.createSubscription).toHaveBeenCalled());
    const body = svc.createSubscription.mock.calls[0][1];
    expect(body).toMatchObject({ frequency: 'hourly', alert: { measure: 'row_count', op: 'gt', value: '20', only_on_change: true } });
  });
});

describe('DashboardRenderer — dashboard-level date filter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    svc.getVocabulary.mockResolvedValue({ data: { date_presets: DATE_PRESETS } });
    svc.widgetData.mockResolvedValue({ data: { value: 42, label: 'Open', type: 'number', tiles: [] }, meta: {} });
  });

  it('shows the bar only when a report-backed widget exists, and re-fetches every report widget with the range', async () => {
    const dashboard = { label: 'Sales', widgets: [
      { id: 1, widget_type: 'metric', title: 'Open deals', data_source: { type: 'report', report_id: 7, shape: 'metric' } },
      { id: 2, widget_type: 'text', title: 'Note', config: { content: 'hi' } },
    ] };
    wrap(<DashboardRenderer dashboard={dashboard} />);
    const select = await screen.findByLabelText('Dashboard date range');
    await waitFor(() => expect(svc.widgetData).toHaveBeenCalledWith(7, 'metric', undefined, undefined));
    fireEvent.change(select, { target: { value: 'this_fiscal_year' } });
    await waitFor(() => expect(svc.widgetData).toHaveBeenCalledWith(7, 'metric', undefined, { date_range: 'this_fiscal_year' }));
    expect(screen.getByText(/Applies to 1 of 2 widgets/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Clear dashboard date range' }));
    expect(select.value).toBe('');
  });

  it('hides the bar for a dashboard of built-in datasets only', () => {
    const dashboard = { label: 'Ops', widgets: [{ id: 2, widget_type: 'text', title: 'Note', config: { content: 'hi' } }] };
    wrap(<DashboardRenderer dashboard={dashboard} />);
    expect(screen.queryByLabelText('Dashboard date range')).toBeNull();
  });
});

describe('builder controls', () => {
  const vocabulary = {
    aggregations: [{ key: 'count', label: 'Number of records', needs_field: false }, { key: 'sum', label: 'Sum of', needs_field: true, numeric: true }],
    formula_ops: [],
    calculations: [{ key: '', label: 'Plain value' }, { key: 'running_total', label: 'Running total' }, { key: 'percent_of_total', label: '% of total' }],
    operators: [{ key: 'equals', label: 'is', types: '*' }, { key: 'date_range', label: 'is within', types: 'date', preset: true }, { key: 'is_empty', label: 'is empty', types: '*', no_value: true }],
    date_presets: DATE_PRESETS,
  };
  const fields = [{ key: 'amount', label: 'Amount', type: 'currency', agg: true }, { key: 'stage', label: 'Stage', type: 'enum', options: ['a', 'b'] }];

  it('offers "Show as" on a measure and writes the calc key', () => {
    const onChange = vi.fn();
    render(<MeasureEditor metrics={[{ agg: 'sum', field: 'amount', label: '' }]} fields={fields} vocabulary={vocabulary} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText('Show as'), { target: { value: 'percent_of_total' } });
    expect(onChange).toHaveBeenCalledWith([{ agg: 'sum', field: 'amount', label: '', calc: 'percent_of_total' }]);
  });

  it('lets a condition be marked "Ask when running" with a prompt label', () => {
    const onChange = vi.fn();
    wrap(<FilterGroupBuilder source="opportunities" fields={fields} vocabulary={vocabulary} value={{ logic: 'AND', conditions: [{ field: 'stage', op: 'equals', value: 'a' }] }} onChange={onChange} />);
    fireEvent.click(screen.getByLabelText('Ask when running'));
    expect(onChange).toHaveBeenCalledWith({ logic: 'AND', conditions: [{ field: 'stage', op: 'equals', value: 'a', prompt: true }] });
  });
});
