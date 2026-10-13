'use strict';

/**
 * Report semantics — the business vocabulary layered over report-registry.js
 * for the AI planner ("Ask"), kept as a code file for the same reason the
 * registry is: an unchecked entry here would be a runtime error class, and a
 * code file is covered by tests.
 *
 * It holds what the registry does not:
 *
 *   1. SOURCE_SEMANTICS  — what a source is *called* in conversation, its grain,
 *                          which date a question about it usually means, and the
 *                          trap a naive question falls into.
 *   2. FIELD_SYNONYMS    — words a user says for a field they would never call
 *                          by its label.
 *   3. METRICS           — named business measures expressed AS CONFIG FRAGMENTS,
 *                          never as SQL or expressions. The planner references a
 *                          metric by name; the service expands it deterministically,
 *                          so the model can pick the wrong metric (a visible error)
 *                          but cannot get a definition subtly wrong (a silent one).
 *   4. SENSITIVE_FIELDS  — fields the AI path never names in a prompt and the
 *                          validator rejects, even though the registry allows them.
 *
 * Every field key here is checked against the registry by report-semantics.test.js.
 */

const SOURCE_SEMANTICS = {
  leads: {
    also_known_as: ['leads', 'prospects', 'enquiries', 'inquiries', 'lead generation', 'top of funnel'],
    grain: 'One row per lead — a person or company that showed interest but is not yet a customer.',
    default_date_field: 'created_at',
    caution: '"Converted" leads became opportunities; use is_converted rather than lead_status for conversion questions.',
  },
  opportunities: {
    also_known_as: ['deals', 'pipeline', 'sales', 'opportunities', 'revenue', 'bookings', 'forecast'],
    grain: 'One row per deal in the sales pipeline.',
    default_date_field: 'close_date',
    caution: 'Open deals have no won value yet — "revenue" or "sales" means is_won = true. "Pipeline" means is_closed = false.',
  },
  cases: {
    also_known_as: ['cases', 'tickets', 'support', 'service requests', 'complaints', 'issues'],
    grain: 'One row per customer-service case.',
    default_date_field: 'created_at',
    caution: '"Open" cases are status in new, open, in_progress, escalated — not just "open".',
  },
  tasks: {
    also_known_as: ['tasks', 'to-dos', 'follow-ups', 'action items', 'workload'],
    grain: 'One row per task.',
    default_date_field: 'due_date',
    caution: '"Overdue" means due_date before today and status not completed or cancelled.',
  },
  activities: {
    also_known_as: ['activities', 'calls', 'meetings', 'emails logged', 'touches', 'interactions', 'activity log'],
    grain: 'One row per logged activity (call, meeting, email, note).',
    default_date_field: 'created_at',
    caution: 'Use the "type" field to separate calls from meetings; duration only applies to some types.',
  },
  quotes: {
    also_known_as: ['quotes', 'quotations', 'proposals', 'estimates', 'pricing'],
    grain: 'One row per quote issued against an opportunity.',
    default_date_field: 'created_at',
    caution: 'Quote totals are not revenue — a quote is accepted before a deal is won.',
  },
  policies: {
    also_known_as: ['policies', 'contracts', 'in-force business', 'book of business', 'premium', 'coverage', 'insurance'],
    grain: 'One row per insurance policy.',
    default_date_field: 'effective_date',
    caution: 'premium_amount is per payment, not annualised. "In force" means status = active.',
  },
  claims: {
    also_known_as: ['claims', 'losses', 'payouts', 'settlements', 'loss ratio'],
    grain: 'One row per insurance claim.',
    default_date_field: 'filed_at',
    caution: 'Claimed amount and paid amount differ — "paid out" means paid_amount.',
  },
  commissions: {
    also_known_as: ['commissions', 'agent pay', 'payouts to agents', 'earnings', 'compensation', 'overrides'],
    grain: 'One row per commission entry earned by an agent.',
    default_date_field: 'created_at',
    caution: 'Clawed-back commissions are negative for the agent; filter status when asking about pay.',
  },
  sla: {
    also_known_as: ['sla', 'service levels', 'response times', 'breaches', 'targets', 'first response', 'resolution time'],
    grain: 'One row per SLA target tracked on a case, lead or task.',
    default_date_field: 'started_at',
    caution: 'breached = true is the missed target; status "met" is the opposite.',
  },
};

const FIELD_SYNONYMS = {
  'opportunities.amount': ['deal value', 'deal size', 'revenue', 'value', 'sales', 'bookings'],
  'opportunities.stage': ['pipeline stage', 'deal stage', 'funnel stage'],
  'opportunities.owner_id': ['salesperson', 'rep', 'account executive', 'ae', 'seller'],
  'opportunities.close_date': ['closed', 'closing', 'won date', 'close month'],
  'opportunities.account.name': ['customer', 'client', 'account', 'company'],
  'leads.lead_source': ['channel', 'source', 'where leads come from', 'campaign source'],
  'leads.lead_status': ['lead stage', 'lead state'],
  'leads.owner_id': ['salesperson', 'rep', 'sdr', 'owner'],
  'cases.owner_id': ['agent', 'support agent', 'assignee', 'handler'],
  'cases.priority': ['severity', 'urgency'],
  'tasks.assigned_to': ['assignee', 'owner', 'who'],
  'tasks.due_date': ['deadline', 'due'],
  'policies.premium_amount': ['premium', 'apn', 'annualised premium', 'price'],
  'policies.coverage_amount': ['coverage', 'face amount', 'sum assured', 'benefit'],
  'policies.product_type': ['product', 'plan', 'line'],
  'policies.agent_id': ['agent', 'producer', 'advisor', 'broker'],
  'policies.agent.branch.branch_name': ['branch', 'office', 'location'],
  'policies.agent.region.region_name': ['region', 'territory', 'area', 'zone'],
  'opportunities.owner.branch.branch_name': ['branch', 'office', 'location'],
  'opportunities.owner.region.region_name': ['region', 'territory', 'area', 'zone'],
  'claims.paid_amount': ['paid out', 'settlement', 'payout', 'losses paid'],
  'claims.amount': ['claimed', 'claim value', 'reserve'],
  'claims.adjuster_id': ['adjuster', 'handler', 'assessor'],
  'commissions.commission_amount': ['commission', 'pay', 'earnings', 'payout'],
  'commissions.agent_id': ['agent', 'producer', 'advisor'],
  'sla.breached': ['missed', 'late', 'breach', 'violated'],
  'activities.duration_min': ['time spent', 'talk time', 'minutes'],
};

/**
 * Named business measures. `metric` is the measure fragment; `filters` are ANDed
 * onto the plan's own filters; `allowed_dimensions` is the whitelist of groupings
 * the metric may be sliced by (a security and a correctness control).
 */
const METRICS = {
  won_revenue: {
    label: 'Won revenue',
    description: 'Total value of opportunities that closed as won.',
    also_known_as: ['revenue', 'sales', 'closed won', 'bookings', 'won value'],
    source: 'opportunities',
    metric: { agg: 'sum', field: 'amount', label: 'Won revenue' },
    filters: [{ field: 'is_won', op: 'equals', value: true }],
    date_field: 'close_date',
    allowed_dimensions: ['close_date', 'owner_id', 'owner.employee_name', 'owner.branch.branch_name', 'owner.region.region_name', 'account.name', 'account.industry', 'lead_source', 'type'],
  },
  open_pipeline: {
    label: 'Open pipeline',
    description: 'Total value of deals that are still open.',
    also_known_as: ['pipeline', 'pipeline value', 'open deals', 'in flight'],
    source: 'opportunities',
    metric: { agg: 'sum', field: 'amount', label: 'Open pipeline' },
    filters: [{ field: 'is_closed', op: 'equals', value: false }],
    date_field: 'close_date',
    allowed_dimensions: ['stage', 'close_date', 'owner_id', 'owner.employee_name', 'owner.branch.branch_name', 'owner.region.region_name', 'forecast_category', 'account.name'],
  },
  weighted_pipeline: {
    label: 'Weighted pipeline',
    description: 'Open deal value × probability — the expected value of the pipeline.',
    also_known_as: ['expected revenue', 'forecast', 'weighted forecast'],
    source: 'opportunities',
    // Expressed with the engine's formula vocabulary: sum(amount) × avg(probability) / 100.
    metrics: [
      { agg: 'sum', field: 'amount', label: 'Open value' },
      { agg: 'avg', field: 'probability', label: 'Avg. probability' },
      { agg: 'formula', formula: { op: 'multiply', a: 'm0', b: 'm1' }, label: 'Weighted ×100' },
    ],
    filters: [{ field: 'is_closed', op: 'equals', value: false }],
    date_field: 'close_date',
    allowed_dimensions: ['stage', 'close_date', 'owner_id', 'owner.employee_name', 'forecast_category'],
  },
  deals_won: {
    label: 'Deals won',
    description: 'Number of opportunities closed as won.',
    also_known_as: ['wins', 'won deals', 'closed won count'],
    source: 'opportunities',
    metric: { agg: 'count', label: 'Deals won' },
    filters: [{ field: 'is_won', op: 'equals', value: true }],
    date_field: 'close_date',
    allowed_dimensions: ['close_date', 'owner_id', 'owner.employee_name', 'owner.branch.branch_name', 'owner.region.region_name', 'lead_source', 'account.industry'],
  },
  average_deal_size: {
    label: 'Average deal size',
    description: 'Average value of won opportunities.',
    also_known_as: ['avg deal', 'deal size', 'average order value', 'aov'],
    source: 'opportunities',
    metric: { agg: 'avg', field: 'amount', label: 'Average deal size' },
    filters: [{ field: 'is_won', op: 'equals', value: true }],
    date_field: 'close_date',
    allowed_dimensions: ['close_date', 'owner_id', 'owner.employee_name', 'owner.region.region_name', 'account.industry', 'lead_source'],
  },
  new_leads: {
    label: 'New leads',
    description: 'Number of leads created.',
    also_known_as: ['lead volume', 'leads generated', 'inbound'],
    source: 'leads',
    metric: { agg: 'count', label: 'New leads' },
    filters: [],
    date_field: 'created_at',
    allowed_dimensions: ['created_at', 'lead_source', 'lead_status', 'rating', 'industry', 'owner_id', 'owner.employee_name', 'owner.branch.branch_name'],
  },
  converted_leads: {
    label: 'Converted leads',
    description: 'Number of leads that became opportunities.',
    also_known_as: ['conversions', 'lead conversion', 'qualified to opportunity'],
    source: 'leads',
    metric: { agg: 'count', label: 'Converted leads' },
    filters: [{ field: 'is_converted', op: 'equals', value: true }],
    date_field: 'converted_at',
    allowed_dimensions: ['converted_at', 'created_at', 'lead_source', 'owner_id', 'owner.employee_name', 'industry'],
  },
  open_cases: {
    label: 'Open cases',
    description: 'Cases not yet resolved or closed.',
    also_known_as: ['backlog', 'open tickets', 'outstanding cases', 'unresolved'],
    source: 'cases',
    metric: { agg: 'count', label: 'Open cases' },
    filters: [{ field: 'status', op: 'in', value: ['new', 'open', 'in_progress', 'escalated'] }],
    date_field: 'created_at',
    allowed_dimensions: ['status', 'priority', 'type', 'origin', 'owner_id', 'owner.employee_name', 'created_at'],
  },
  overdue_tasks: {
    label: 'Overdue tasks',
    description: 'Tasks past their due date that are not completed or cancelled.',
    also_known_as: ['late tasks', 'past due', 'missed deadlines'],
    source: 'tasks',
    metric: { agg: 'count', label: 'Overdue tasks' },
    filters: [
      { field: 'due_date', op: 'lt', value: '$today' },
      { field: 'status', op: 'not_in', value: ['completed', 'cancelled'] },
    ],
    date_field: 'due_date',
    allowed_dimensions: ['assigned_to', 'assignee.employee_name', 'priority', 'due_date'],
  },
  in_force_premium: {
    label: 'In-force premium',
    description: 'Total premium of active policies.',
    also_known_as: ['premium', 'book premium', 'active premium', 'in force'],
    source: 'policies',
    metric: { agg: 'sum', field: 'premium_amount', label: 'In-force premium' },
    filters: [{ field: 'status', op: 'equals', value: 'active' }],
    date_field: 'effective_date',
    allowed_dimensions: ['product_type', 'premium_frequency', 'agent_id', 'agent.employee_name', 'agent.branch.branch_name', 'agent.region.region_name', 'carrier.name', 'effective_date'],
  },
  policies_sold: {
    label: 'Policies sold',
    description: 'Number of policies by effective date.',
    also_known_as: ['new business', 'policies issued', 'policy count', 'sales volume'],
    source: 'policies',
    metric: { agg: 'count', label: 'Policies sold' },
    filters: [],
    date_field: 'effective_date',
    allowed_dimensions: ['effective_date', 'product_type', 'status', 'agent_id', 'agent.employee_name', 'agent.branch.branch_name', 'agent.region.region_name', 'carrier.name'],
  },
  lapse_count: {
    label: 'Lapsed policies',
    description: 'Policies that lapsed.',
    also_known_as: ['lapses', 'lapse rate', 'churned policies', 'fall-off'],
    source: 'policies',
    metric: { agg: 'count', label: 'Lapsed policies' },
    filters: [{ field: 'status', op: 'equals', value: 'lapsed' }],
    date_field: 'effective_date',
    allowed_dimensions: ['product_type', 'agent_id', 'agent.employee_name', 'agent.branch.branch_name', 'effective_date', 'carrier.name'],
  },
  claims_paid: {
    label: 'Claims paid',
    description: 'Total amount paid out on claims.',
    also_known_as: ['payouts', 'losses', 'paid losses', 'settlements paid'],
    source: 'claims',
    metric: { agg: 'sum', field: 'paid_amount', label: 'Claims paid' },
    filters: [{ field: 'status', op: 'in', value: ['paid', 'closed'] }],
    date_field: 'paid_at',
    allowed_dimensions: ['claim_type', 'status', 'paid_at', 'filed_at', 'policy.product_type', 'adjuster_id', 'adjuster.employee_name', 'policy.carrier.name'],
  },
  loss_ratio: {
    label: 'Loss ratio',
    description: 'Claims paid as a percentage of the premium on the policies claimed against.',
    also_known_as: ['loss ratio', 'claims ratio', 'paid-to-premium'],
    source: 'claims',
    metrics: [
      { agg: 'sum', field: 'paid_amount', label: 'Claims paid' },
      { agg: 'sum', field: 'policy.premium_amount', label: 'Premium' },
      { agg: 'formula', formula: { op: 'percent_of', a: 'm0', b: 'm1' }, label: 'Loss ratio' },
    ],
    filters: [],
    date_field: 'filed_at',
    allowed_dimensions: ['claim_type', 'policy.product_type', 'policy.carrier.name', 'filed_at', 'adjuster.employee_name'],
  },
  commission_paid: {
    label: 'Commission paid',
    description: 'Total commission paid to agents.',
    also_known_as: ['agent pay', 'commissions', 'payout', 'compensation'],
    source: 'commissions',
    metric: { agg: 'sum', field: 'commission_amount', label: 'Commission paid' },
    filters: [{ field: 'status', op: 'equals', value: 'paid' }],
    date_field: 'created_at',
    allowed_dimensions: ['agent_id', 'agent.employee_name', 'agent.branch.branch_name', 'commission_type', 'product_type', 'created_at', 'commission_period'],
  },
  sla_breaches: {
    label: 'SLA breaches',
    description: 'Service-level targets that were missed.',
    also_known_as: ['breaches', 'missed slas', 'late responses', 'violations'],
    source: 'sla',
    metric: { agg: 'count', label: 'SLA breaches' },
    filters: [{ field: 'breached', op: 'equals', value: true }],
    date_field: 'started_at',
    allowed_dimensions: ['entity_type', 'metric', 'priority', 'owner_id', 'started_at', 'policy.name'],
  },
};

/**
 * Never named to the model, never accepted from it. Personal contact details
 * are the obvious class; the AI path is for aggregates, not for listing people.
 */
const SENSITIVE_FIELDS = new Set([
  'leads.email', 'leads.phone',
  'opportunities.contact.email', 'opportunities.owner.email',
  'leads.owner.email', 'cases.owner.email', 'tasks.assignee.email', 'activities.employee.email',
  'quotes.owner.email', 'policies.agent.email', 'claims.adjuster.email', 'commissions.agent.email',
]);

/**
 * Stage-like fields whose values have a natural order — the funnel test in the
 * chart recommender uses this rather than guessing from the label.
 */
const ORDERED_STAGE_FIELDS = new Set(['stage', 'status', 'lead_status', 'forecast_category']);

/** Tokens the metric fragments may use for "now", resolved at expansion time. */
function resolveMetricValue(value) {
  if (value === '$today') { const d = new Date(); d.setHours(0, 0, 0, 0); return d.toISOString(); }
  return value;
}

module.exports = { SOURCE_SEMANTICS, FIELD_SYNONYMS, METRICS, SENSITIVE_FIELDS, ORDERED_STAGE_FIELDS, resolveMetricValue };
