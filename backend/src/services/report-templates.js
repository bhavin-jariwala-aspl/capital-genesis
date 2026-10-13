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
    key: 'account-value-and-load',
    name: 'Account value and support load',
    question: 'Which accounts carry the most deal value, and how much support do they need?',
    category: 'sales',
    icon: 'Building2',
    config: {
      source: 'accounts',
      viz: 'table',
      // Deal value and case count are rolled up from each account's children, so an
      // account with several deals still contributes its annual revenue exactly once.
      group_by: [{ field: 'industry' }],
      metrics: [
        { agg: 'count', label: 'Accounts' },
        { agg: 'sum', field: 'opportunities.amount', label: 'Deal value' },
        { agg: 'sum', field: 'cases.$count', label: 'Cases' },
        { agg: 'formula', label: 'Cases per account', formula: { op: 'divide', a: 'm2', b: 'm0' } },
      ],
      totals: true,
      sort: [{ key: 'm1', dir: 'desc' }],
      limit: 25,
    },
  }),
  T({
    key: 'pipeline-by-region',
    name: 'Pipeline by region',
    question: 'Which territories hold the most open pipeline?',
    category: 'sales',
    icon: 'Network',
    config: {
      source: 'opportunities',
      viz: 'bar',
      // Two hops: opportunity → owner → region.
      group_by: [{ field: 'owner.region.region_name' }],
      metrics: [
        { agg: 'sum', field: 'amount', label: 'Pipeline value' },
        { agg: 'count', label: 'Deals' },
        { agg: 'formula', label: '% of pipeline', formula: { op: 'percent_of_total', a: 'm0' } },
      ],
      filters: { logic: 'AND', conditions: [{ field: 'is_closed', op: 'equals', value: false }] },
      totals: true,
      sort: [{ key: 'm0', dir: 'desc' }],
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
