'use strict';

/**
 * Starter report library — the "pick a report, then tweak it" path.
 *
 * Every top CRM ships a starter set (Salesforce report templates, HubSpot's
 * report library, Zoho's standard reports, Dynamics' out-of-the-box views) for
 * one reason: a business user handed a blank builder stalls, but a user handed a
 * working report they can adjust succeeds on the first try. These are ordinary
 * report configs — opening one loads it into the builder as an unsaved draft, so
 * nothing here is privileged or read-only.
 *
 * `question` is the plain-English business question the report answers; the
 * gallery shows it under the title so a non-technical user can pick by intent.
 */

const T = (t) => t;

const TEMPLATES = [
  // ── Sales ────────────────────────────────────────────────────────────────
  T({
    key: 'pipeline-by-stage',
    name: 'Pipeline by stage',
    question: 'How much value sits in each stage of our pipeline right now?',
    category: 'sales',
    icon: 'TrendingUp',
    config: {
      source: 'opportunities',
      viz: 'bar',
      group_by: [{ field: 'stage' }],
      metrics: [
        { agg: 'sum', field: 'amount', label: 'Pipeline value' },
        { agg: 'count', label: 'Deals' },
      ],
      filters: { logic: 'AND', conditions: [{ field: 'is_closed', op: 'equals', value: false }] },
      totals: true,
      sort: [{ key: 'm0', dir: 'desc' }],
      limit: 20,
    },
  }),
  T({
    key: 'won-revenue-by-month',
    name: 'Won revenue by month',
    question: 'How much did we close each month, and is it trending up?',
    category: 'sales',
    icon: 'LineChart',
    config: {
      source: 'opportunities',
      viz: 'line',
      group_by: [{ field: 'close_date', period: 'month' }],
      metrics: [{ agg: 'sum', field: 'amount', label: 'Won revenue' }],
      filters: {
        logic: 'AND',
        conditions: [
          { field: 'is_won', op: 'equals', value: true },
          { field: 'close_date', op: 'date_range', value: 'this_year' },
        ],
      },
      compare: 'previous_year',
      totals: true,
      limit: 24,
    },
  }),
  T({
    key: 'win-rate-by-owner',
    name: 'Win rate by owner',
    question: 'Which salespeople convert the highest share of their deals?',
    category: 'sales',
    icon: 'Target',
    config: {
      source: 'opportunities',
      viz: 'table',
      group_by: [{ field: 'owner.employee_name' }],
      metrics: [
        { agg: 'count', label: 'Closed deals' },
        { agg: 'sum', field: 'amount', label: 'Closed value' },
        { agg: 'formula', label: 'Avg deal size', formula: { op: 'divide', a: 'm1', b: 'm0' } },
      ],
      filters: { logic: 'AND', conditions: [{ field: 'is_closed', op: 'equals', value: true }] },
      totals: true,
      sort: [{ key: 'm1', dir: 'desc' }],
      limit: 50,
    },
  }),
  T({
    key: 'deal-size-bands',
    name: 'Deals by size band',
    question: 'Are we winning lots of small deals or a few large ones?',
    category: 'sales',
    icon: 'BarChart3',
    config: {
      source: 'opportunities',
      viz: 'bar',
      group_by: [{
        field: 'amount',
        buckets: [
          { label: 'Under 10k', max: 10000 },
          { label: '10k – 50k', min: 10000, max: 50000 },
          { label: '50k – 250k', min: 50000, max: 250000 },
          { label: '250k+', min: 250000 },
        ],
        other_label: 'No amount set',
      }],
      metrics: [
        { agg: 'count', label: 'Deals' },
        { agg: 'formula', label: '% of deals', formula: { op: 'percent_of_total', a: 'm0' } },
      ],
      totals: true,
    },
  }),
  T({
    key: 'lead-source-effectiveness',
    name: 'Lead source effectiveness',
    question: 'Which lead sources actually convert?',
    category: 'sales',
    icon: 'UserPlus',
    config: {
      source: 'leads',
      viz: 'table',
      group_by: [{ field: 'lead_source' }],
      metrics: [
        { agg: 'count', label: 'Leads' },
        { agg: 'formula', label: '% of all leads', formula: { op: 'percent_of_total', a: 'm0' } },
      ],
      totals: true,
      sort: [{ key: 'm0', dir: 'desc' }],
      limit: 25,
    },
  }),
  T({
    key: 'leads-by-status-rating',
    name: 'Leads by status and rating',
    question: 'Where are our hot leads sitting in the funnel?',
    category: 'sales',
    icon: 'Grid3x3',
    config: {
      source: 'leads',
      viz: 'pivot',
      group_by: [{ field: 'lead_status' }, { field: 'rating' }],
      metrics: [{ agg: 'count', label: 'Leads' }],
      totals: true,
    },
  }),
  T({
    key: 'quote-conversion',
    name: 'Quote outcomes',
    question: 'How many quotes get accepted, and what are they worth?',
    category: 'sales',
    icon: 'FileText',
    config: {
      source: 'quotes',
      viz: 'bar',
      group_by: [{ field: 'status' }],
      metrics: [
        { agg: 'count', label: 'Quotes' },
        { agg: 'sum', field: 'total_amount', label: 'Value' },
      ],
      totals: true,
    },
  }),

  // ── Insurance ────────────────────────────────────────────────────────────
  T({
    key: 'premium-by-product',
    name: 'Premium by product',
    question: 'Which products bring in the most premium?',
    category: 'insurance',
    icon: 'Shield',
    config: {
      source: 'policies',
      viz: 'bar',
      group_by: [{ field: 'product_type' }],
      metrics: [
        { agg: 'sum', field: 'premium_amount', label: 'Premium' },
        { agg: 'sum', field: 'coverage_amount', label: 'Coverage' },
        { agg: 'count', label: 'Policies' },
      ],
      filters: { logic: 'AND', conditions: [{ field: 'status', op: 'equals', value: 'active' }] },
      totals: true,
      sort: [{ key: 'm0', dir: 'desc' }],
    },
  }),
  T({
    key: 'new-business-by-month',
    name: 'New business by month',
    question: 'How much new premium did we write each month?',
    category: 'insurance',
    icon: 'LineChart',
    config: {
      source: 'policies',
      viz: 'line',
      group_by: [{ field: 'effective_date', period: 'month' }],
      metrics: [
        { agg: 'sum', field: 'premium_amount', label: 'New premium' },
        { agg: 'count', label: 'Policies' },
      ],
      filters: { logic: 'AND', conditions: [{ field: 'effective_date', op: 'date_range', value: 'this_year' }] },
      compare: 'previous_year',
      totals: true,
    },
  }),
  T({
    key: 'policy-status-mix',
    name: 'Policy status mix',
    question: 'What share of the book is active, lapsed or pending?',
    category: 'insurance',
    icon: 'PieChart',
    config: {
      source: 'policies',
      viz: 'pie',
      group_by: [{ field: 'status' }],
      metrics: [{ agg: 'count', label: 'Policies' }],
    },
  }),
  T({
    key: 'agent-production',
    name: 'Agent production league table',
    question: 'Who are our top-producing agents this year?',
    category: 'insurance',
    icon: 'Award',
    config: {
      source: 'policies',
      viz: 'table',
      group_by: [{ field: 'agent.employee_name' }],
      metrics: [
        { agg: 'count', label: 'Policies sold' },
        { agg: 'sum', field: 'premium_amount', label: 'Premium written' },
        { agg: 'avg', field: 'coverage_amount', label: 'Average coverage' },
      ],
      filters: { logic: 'AND', conditions: [{ field: 'effective_date', op: 'date_range', value: 'this_year' }] },
      totals: true,
      sort: [{ key: 'm1', dir: 'desc' }],
      limit: 25,
    },
  }),
  T({
    key: 'carrier-concentration',
    name: 'Carrier concentration',
    question: 'How dependent are we on any one carrier?',
    category: 'insurance',
    icon: 'Building2',
    config: {
      source: 'policies',
      viz: 'bar',
      group_by: [{ field: 'carrier.name' }],
      metrics: [
        { agg: 'sum', field: 'premium_amount', label: 'Premium' },
        { agg: 'formula', label: '% of premium', formula: { op: 'percent_of_total', a: 'm0' } },
      ],
      totals: true,
      sort: [{ key: 'm0', dir: 'desc' }],
      limit: 15,
    },
  }),
  T({
    key: 'claims-vs-premium-by-carrier',
    name: 'Claims against premium, by carrier',
    question: 'Which carriers are paying out the most relative to the premium we place with them?',
    category: 'insurance',
    icon: 'Building2',
    config: {
      source: 'policies',
      viz: 'table',
      // Premium comes from the policy; claims paid is rolled up from the child claims,
      // so a policy with several claims still contributes its premium exactly once.
      //
      // Deliberately NOT called a loss ratio: `premium_amount` is the amount per
      // payment, not an annualised figure, so dividing a cumulative claims total by
      // it does not produce the actuarial ratio and would read as a wildly inflated
      // percentage. The two figures are shown side by side, with the payment
      // frequency, so the comparison a user makes is one they can see the basis of.
      group_by: [{ field: 'carrier.name' }],
      metrics: [
        { agg: 'sum', field: 'premium_amount', label: 'Premium (per payment)' },
        { agg: 'sum', field: 'claims.paid_amount', label: 'Claims paid to date' },
        { agg: 'sum', field: 'claims.$count', label: 'Claims' },
        { agg: 'count', label: 'Policies' },
      ],
      totals: true,
      sort: [{ key: 'm1', dir: 'desc' }],
    },
  }),
  T({
    key: 'premium-by-region',
    name: 'Premium by region',
    question: 'Which territories are writing the most premium?',
    category: 'insurance',
    icon: 'Network',
    config: {
      source: 'policies',
      viz: 'bar',
      // Two hops: policy → agent → region.
      group_by: [{ field: 'agent.region.region_name' }],
      metrics: [
        { agg: 'sum', field: 'premium_amount', label: 'Premium' },
        { agg: 'count', label: 'Policies' },
        { agg: 'formula', label: '% of premium', formula: { op: 'percent_of_total', a: 'm0' } },
      ],
      filters: { logic: 'AND', conditions: [{ field: 'status', op: 'equals', value: 'active' }] },
      totals: true,
      sort: [{ key: 'm0', dir: 'desc' }],
    },
  }),
  T({
    key: 'claims-frequency-by-product',
    name: 'Claims frequency by product',
    question: 'Which products generate the most claims per policy?',
    category: 'insurance',
    icon: 'AlertTriangle',
    config: {
      source: 'policies',
      viz: 'table',
      group_by: [{ field: 'product_type' }],
      metrics: [
        { agg: 'count', label: 'Policies' },
        { agg: 'sum', field: 'claims.$count', label: 'Claims' },
        { agg: 'formula', label: 'Claims per policy', formula: { op: 'divide', a: 'm1', b: 'm0' } },
      ],
      totals: true,
      sort: [{ key: 'm2', dir: 'desc' }],
    },
  }),
  T({
    key: 'quoted-vs-won-by-owner',
    name: 'Quoted vs won by owner',
    question: 'How much has each person quoted, and how much of it closed?',
    category: 'sales',
    icon: 'Target',
    config: {
      source: 'opportunities',
      viz: 'table',
      group_by: [{ field: 'owner.employee_name' }],
      metrics: [
        { agg: 'count', label: 'Deals' },
        { agg: 'sum', field: 'quotes.total_amount', label: 'Quoted' },
        { agg: 'sum', field: 'amount', label: 'Deal value' },
        { agg: 'formula', label: 'Deal vs quoted %', formula: { op: 'percent_of', a: 'm2', b: 'm1' } },
      ],
      totals: true,
      sort: [{ key: 'm1', dir: 'desc' }],
      limit: 25,
    },
  }),
  T({
    key: 'claims-by-status',
    name: 'Claims by status',
    question: 'How many claims are open, and what are they worth?',
    category: 'insurance',
    icon: 'AlertTriangle',
    config: {
      source: 'claims',
      viz: 'bar',
      group_by: [{ field: 'status' }],
      metrics: [
        { agg: 'count', label: 'Claims' },
        { agg: 'sum', field: 'amount', label: 'Claimed' },
        { agg: 'sum', field: 'paid_amount', label: 'Paid' },
      ],
      totals: true,
    },
  }),
  T({
    key: 'claims-loss-ratio-by-product',
    name: 'Claims paid vs premium, by product',
    question: 'Which products are paying out the most relative to their premium? (Premium is per payment, so treat the ratio as indicative, not an actuarial loss ratio.)',
    category: 'insurance',
    icon: 'Gauge',
    config: {
      source: 'claims',
      viz: 'table',
      group_by: [{ field: 'policy.product_type' }],
      metrics: [
        { agg: 'sum', field: 'paid_amount', label: 'Claims paid' },
        { agg: 'sum', field: 'policy.premium_amount', label: 'Premium' },
        { agg: 'formula', label: 'Loss ratio %', formula: { op: 'percent_of', a: 'm0', b: 'm1' } },
      ],
      totals: true,
      sort: [{ key: 'm2', dir: 'desc' }],
    },
  }),
  T({
    key: 'claims-turnaround',
    name: 'Claim volume trend',
    question: 'Are claims going up month over month?',
    category: 'insurance',
    icon: 'LineChart',
    config: {
      source: 'claims',
      viz: 'line',
      group_by: [{ field: 'filed_at', period: 'month' }],
      metrics: [{ agg: 'count', label: 'Claims filed' }],
      filters: { logic: 'AND', conditions: [{ field: 'filed_at', op: 'date_range', value: 'this_year' }] },
      compare: 'previous_period',
      totals: true,
    },
  }),
  T({
    key: 'renewals-due',
    name: 'Renewals coming up',
    question: 'Which policies expire in the next 90 days?',
    category: 'insurance',
    icon: 'CalendarClock',
    config: {
      source: 'policies',
      viz: 'table',
      columns: ['policy_number', 'product_type', 'status', 'premium_amount', 'coverage_amount', 'expiry_date', 'agent.employee_name'],
      filters: {
        logic: 'AND',
        conditions: [
          { field: 'expiry_date', op: 'date_range', value: 'next_90_days' },
          { field: 'status', op: 'equals', value: 'active' },
        ],
      },
      sort: [{ key: 'expiry_date', dir: 'asc' }],
      limit: 200,
    },
  }),

  // ── Finance ──────────────────────────────────────────────────────────────
  T({
    key: 'commission-by-agent',
    name: 'Commission by agent',
    question: 'What do we owe each agent, and what has already been paid?',
    category: 'finance',
    icon: 'DollarSign',
    config: {
      source: 'commissions',
      viz: 'table',
      group_by: [{ field: 'agent.employee_name' }],
      metrics: [
        { agg: 'sum', field: 'commission_amount', label: 'Commission' },
        { agg: 'sum', field: 'source_premium', label: 'On premium' },
        { agg: 'formula', label: 'Effective rate %', formula: { op: 'percent_of', a: 'm0', b: 'm1' } },
      ],
      totals: true,
      sort: [{ key: 'm0', dir: 'desc' }],
      limit: 50,
    },
  }),
  T({
    key: 'commission-pending',
    name: 'Unpaid commission',
    question: 'How much commission is still pending payout?',
    category: 'finance',
    icon: 'Gauge',
    config: {
      source: 'commissions',
      viz: 'kpi',
      metrics: [
        { agg: 'sum', field: 'commission_amount', label: 'Pending commission' },
        { agg: 'count', label: 'Entries' },
      ],
      filters: { logic: 'AND', conditions: [{ field: 'status', op: 'equals', value: 'pending' }] },
    },
  }),
  T({
    key: 'commission-by-type-period',
    name: 'Commission by type and period',
    question: 'How does first-year commission compare with renewals over time?',
    category: 'finance',
    icon: 'Grid3x3',
    config: {
      source: 'commissions',
      viz: 'pivot',
      group_by: [{ field: 'commission_period' }, { field: 'commission_type' }],
      metrics: [{ agg: 'sum', field: 'commission_amount', label: 'Commission' }],
      totals: true,
      sort: [{ key: 'commission_period', dir: 'desc' }],
    },
  }),

  // ── Support ──────────────────────────────────────────────────────────────
  T({
    key: 'cases-by-priority',
    name: 'Open cases by priority',
    question: 'What is the shape of our open support queue?',
    category: 'support',
    icon: 'LifeBuoy',
    config: {
      source: 'cases',
      viz: 'bar',
      group_by: [{ field: 'priority' }],
      metrics: [{ agg: 'count', label: 'Open cases' }],
      filters: { logic: 'AND', conditions: [{ field: 'status', op: 'not_in', value: ['resolved', 'closed'] }] },
      totals: true,
    },
  }),
  T({
    key: 'cases-by-channel-month',
    name: 'Case volume by channel',
    question: 'Which channels are our cases arriving through, month by month?',
    category: 'support',
    icon: 'Grid3x3',
    config: {
      source: 'cases',
      viz: 'pivot',
      group_by: [{ field: 'created_at', period: 'month' }, { field: 'origin' }],
      metrics: [{ agg: 'count', label: 'Cases' }],
      filters: { logic: 'AND', conditions: [{ field: 'created_at', op: 'date_range', value: 'this_year' }] },
      totals: true,
    },
  }),
  T({
    key: 'sla-breaches',
    name: 'SLA breaches by target',
    question: 'Where are we missing our response and resolution targets?',
    category: 'support',
    icon: 'Timer',
    config: {
      source: 'sla',
      viz: 'bar',
      group_by: [{ field: 'metric' }, { field: 'priority' }],
      metrics: [
        { agg: 'count', label: 'Breaches' },
        { agg: 'formula', label: '% of breaches', formula: { op: 'percent_of_total', a: 'm0' } },
      ],
      filters: { logic: 'AND', conditions: [{ field: 'breached', op: 'equals', value: true }] },
      totals: true,
    },
  }),
  T({
    key: 'case-load-by-owner',
    name: 'Case load by owner',
    question: 'Is the support workload spread evenly across the team?',
    category: 'support',
    icon: 'Users',
    config: {
      source: 'cases',
      viz: 'bar',
      group_by: [{ field: 'owner.employee_name' }],
      metrics: [{ agg: 'count', label: 'Open cases' }],
      filters: { logic: 'AND', conditions: [{ field: 'status', op: 'not_in', value: ['resolved', 'closed'] }] },
      totals: true,
      sort: [{ key: 'm0', dir: 'desc' }],
      limit: 25,
    },
  }),

  // ── Productivity ─────────────────────────────────────────────────────────
  T({
    key: 'activity-by-type',
    name: 'Activity mix by type',
    question: 'How is the team spending its time — calls, emails or meetings?',
    category: 'productivity',
    icon: 'Activity',
    config: {
      source: 'activities',
      viz: 'donut',
      group_by: [{ field: 'type' }],
      metrics: [{ agg: 'count', label: 'Activities' }],
      filters: { logic: 'AND', conditions: [{ field: 'created_at', op: 'date_range', value: 'last_30_days' }] },
    },
  }),
  T({
    key: 'activity-minutes-by-employee',
    name: 'Time logged by employee',
    question: 'Who is logging the most customer-facing time?',
    category: 'productivity',
    icon: 'Users',
    config: {
      source: 'activities',
      viz: 'bar',
      group_by: [{ field: 'employee.employee_name' }],
      metrics: [
        { agg: 'sum', field: 'duration_min', label: 'Minutes logged' },
        { agg: 'count', label: 'Activities' },
      ],
      filters: { logic: 'AND', conditions: [{ field: 'created_at', op: 'date_range', value: 'last_30_days' }] },
      totals: true,
      sort: [{ key: 'm0', dir: 'desc' }],
      limit: 25,
    },
  }),
  T({
    key: 'overdue-tasks',
    name: 'Overdue tasks by assignee',
    question: 'Who has work that is past its due date?',
    category: 'productivity',
    icon: 'CheckSquare',
    config: {
      source: 'tasks',
      viz: 'bar',
      group_by: [{ field: 'assignee.employee_name' }],
      metrics: [{ agg: 'count', label: 'Overdue tasks' }],
      filters: {
        logic: 'AND',
        conditions: [
          { field: 'status', op: 'not_in', value: ['completed', 'cancelled'] },
          { field: 'due_date', op: 'lt', value: new Date().toISOString().slice(0, 10) },
        ],
      },
      totals: true,
      sort: [{ key: 'm0', dir: 'desc' }],
      limit: 25,
    },
  }),
];

const CATEGORY_LABELS = {
  sales: 'Sales',
  insurance: 'Insurance',
  finance: 'Finance',
  support: 'Support',
  productivity: 'Productivity',
};

/**
 * The gallery payload. Date-relative templates (e.g. "overdue tasks") are built
 * at call time so the embedded dates stay current.
 */
function getTemplates() {
  return TEMPLATES.map((t) => ({ ...t, category_label: CATEGORY_LABELS[t.category] || t.category }));
}

const getTemplate = (key) => getTemplates().find((t) => t.key === key) || null;

module.exports = { getTemplates, getTemplate, CATEGORY_LABELS };
