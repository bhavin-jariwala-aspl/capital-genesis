'use strict';

/**
 * Genesis CRM — benchmarked workflow catalogue.
 *
 * A definition-only module: it describes the automations that ship in
 * Builder ▸ Workflows and knows nothing about Prisma. Both `prisma/seed.js`
 * and `scripts/seed-crm-workflows.js` consume it, so the demo database and a
 * live tenant always get exactly the same suite.
 *
 * ── How these were chosen ───────────────────────────────────────────────────
 * Every workflow below maps to an automation pattern that all five leading CRM
 * platforms ship out of the box, adapted to this product's
 * object model. The `benchmark` field on each definition names the equivalent
 * feature in each platform, so the coverage claim is auditable:
 *
 *   Salesforce      — Lead Assignment Rules, record-triggered & scheduled Flows,
 *                     Approval Processes, Case Escalation Rules, Entitlement
 *                     Milestones, Big Deal Alerts
 *   HubSpot         — lead rotation, MQL→SQL handoff, unworked-lead re-rotation,
 *                     deal-stage workflows, closed-won handoff, ticket SLA,
 *                     re-engagement and data-quality workflows
 *   Zoho CRM        — Assignment Rules, Workflow Rules, Blueprints, Approval
 *                     Processes, SLA Escalation Rules, scheduled rules
 *   Dynamics 365    — lead routing, Business Process Flows, SLA KPIs
 *                     ("First Response By" / "Resolve By"), approvals
 *   Pipedrive       — new-lead automations, stage-change automations,
 *                     deal-rotting alerts, deal-won automations
 *
 * ── How the engine executes these ───────────────────────────────────────────
 * Steps run top-to-bottom by `order_index`. A step normally falls through to
 * the next one; a `condition` that evaluates false HALTS the chain unless it
 * has an explicit `on_false` link. That makes the natural shape of a workflow
 * a linear chain of progressively narrower gates, which is how the catalogue
 * below is written.
 *
 * `approval` is the one genuinely branching step: approved resumes at
 * `on_true`, rejected at `on_false`. Because the approved branch would
 * otherwise fall through into the rejected branch's steps, each approval
 * workflow ends its approved path with a "Guard" condition that re-reads the
 * state the approval branch just wrote and halts.
 *
 * ── Placeholders ────────────────────────────────────────────────────────────
 * `{{@manager}}` in a step config is replaced at seed time with the tenant's
 * sales-manager employee_id, so no employee ID is hard-coded here.
 */

/** Employee-ID placeholders resolved by the seeder against the live tenant. */
const ACTOR_PLACEHOLDERS = {
  '{{@manager}}': 'manager',
};

const WORKFLOWS = [
  // ══════════════════════════════════════════════════════════════════════════
  // LEAD MANAGEMENT
  // ══════════════════════════════════════════════════════════════════════════
  {
    name:        'lead_instant_routing',
    label:       'Lead — Instant Routing & Priority Alert',
    description: 'Fires the moment a lead is captured: normalises its status, drops it into the sales queue, and escalates hot/warm leads to the sales manager for a five-minute callback.',
    object:      'lead_intake',
    trigger_type: 'on_create',
    trigger_config: {},
    benchmark: 'Salesforce Lead Assignment Rules · HubSpot lead rotation · Zoho CRM Assignment Rules · Dynamics 365 lead routing · Pipedrive new-lead automation',
    steps: [
      { key: 't',  name: 'Trigger: New Lead Captured', step_type: 'trigger',
        config: { description: 'Fires when any lead record is created, from any source (web form, import, API, manual entry).' } },
      { key: 'a1', name: 'Normalise Status to New', step_type: 'action',
        config: { field: 'lead_status', value: 'new' } },
      { key: 'n1', name: 'Notify Sales Queue', step_type: 'notification',
        config: { role: 'user', title: 'New lead in your queue',
          message: '{{first_name}} {{last_name}} ({{company}}) came in via {{lead_source}}. Make first contact inside the 5-minute speed-to-lead window.' } },
      { key: 'c1', name: 'Gate: Hot or Warm Rating?', step_type: 'condition',
        config: { field: 'rating', operator: 'in', value: ['hot', 'warm'] } },
      { key: 'n2', name: 'Escalate High-Intent Lead to Sales Manager', step_type: 'notification',
        config: { role: 'manager', title: 'High-intent lead captured',
          message: '{{first_name}} {{last_name}} ({{company}}) arrived rated {{rating}} from {{lead_source}}. Confirm an owner is on it now.' } },
    ],
  },

  {
    name:        'lead_first_response_sla',
    label:       'Lead — First-Response SLA & Re-routing',
    description: 'Starts a 60-minute first-response clock on every new lead. If the lead is still untouched when the clock expires, the sales manager is alerted and the lead is re-routed to them.',
    object:      'lead_intake',
    trigger_type: 'on_create',
    trigger_config: {},
    benchmark: 'Dynamics 365 SLA "First Response By" KPI · Zoho CRM SLA Escalation Rules · Salesforce Entitlement Milestones · HubSpot unworked-lead re-rotation',
    steps: [
      { key: 't',  name: 'Trigger: Lead Captured — Start Response Clock', step_type: 'trigger',
        config: { description: 'Starts the first-response SLA the instant the lead lands.' } },
      { key: 'd1', name: 'Wait 60 Minutes for First Touch', step_type: 'delay',
        config: { duration: 60, unit: 'minutes' } },
      { key: 'c1', name: 'Gate: Lead Still Untouched?', step_type: 'condition',
        config: { field: 'lead_status', operator: 'eq', value: 'new' } },
      { key: 'n1', name: 'SLA Breach — Alert Sales Manager', step_type: 'notification',
        config: { role: 'manager', title: 'First-response SLA breached',
          message: 'Lead {{first_name}} {{last_name}} ({{company}}) has sat untouched for 60 minutes. Ownership is being moved to you.' } },
      { key: 'a1', name: 'Re-route Lead to Sales Manager', step_type: 'action',
        config: { field: 'assigned_to', value: '{{@manager}}' } },
    ],
  },

  {
    name:        'lead_qualification_handoff',
    label:       'Lead — Qualification Handoff to Prospect',
    description: 'When a lead reaches Qualified, converts it into a Prospect record and hands it to sales. A conversion latch makes the workflow idempotent, so re-saving a qualified lead never creates a duplicate prospect.',
    object:      'lead_intake',
    trigger_type: 'on_update',
    trigger_config: {},
    benchmark: 'HubSpot MQL→SQL handoff · Salesforce Lead Conversion · Zoho CRM Blueprint transition · Dynamics 365 lead qualification',
    steps: [
      { key: 't',  name: 'Trigger: Lead Updated', step_type: 'trigger',
        config: { description: 'Evaluates the lead every time it is saved.' } },
      { key: 'c1', name: 'Gate: Status = Qualified?', step_type: 'condition',
        config: { field: 'lead_status', operator: 'eq', value: 'qualified' } },
      { key: 'c2', name: 'Gate: Not Already Converted', step_type: 'condition',
        config: { field: 'is_converted', operator: 'neq', value: true } },
      { key: 'a1', name: 'Latch: Mark Lead as Converted', step_type: 'action',
        config: { field: 'is_converted', value: true } },
      { key: 'cr', name: 'Create Prospect from Lead', step_type: 'create_record',
        config: {
          object: 'prospect',
          fields: {
            first_name:  '{{first_name}}',
            last_name:   '{{last_name}}',
            email:       '{{email}}',
            phone:       '{{phone}}',
            mobile:      '{{mobile}}',
            company:     '{{company}}',
            job_title:   '{{job_title}}',
            industry:    '{{industry}}',
            lead_source: '{{lead_source}}',
            lead_status: 'qualified',
            rating:      'hot',
            notes:       'Converted from qualified lead {{first_name}} {{last_name}}.',
          },
        } },
      { key: 'n1', name: 'Notify Sales Manager of Qualified Lead', step_type: 'notification',
        config: { role: 'manager', title: 'Lead qualified — prospect created',
          message: '{{first_name}} {{last_name}} ({{company}}) qualified from {{lead_source}} and is now a prospect. Assign an owner for discovery.' } },
    ],
  },

  {
    name:        'prospect_nurture_sweep',
    label:       'Prospect — Cold Nurture Sweep',
    description: 'Weekly sweep over every prospect. Any prospect still sitting at New or Contacted with a cold rating raises a re-engagement task for its owner, so nothing decays silently in the pipeline.',
    object:      'prospect',
    trigger_type: 'scheduled',
    trigger_config: { interval_minutes: 10080, per_record: true, limit: 500 },
    benchmark: 'HubSpot re-engagement workflows · Zoho CRM scheduled Workflow Rules · Salesforce scheduled-triggered Flow · Pipedrive activity reminders',
    steps: [
      { key: 't',  name: 'Trigger: Weekly Prospect Sweep', step_type: 'trigger',
        config: { description: 'Runs weekly across every live prospect record.' } },
      { key: 'c1', name: 'Gate: Still Un-Qualified?', step_type: 'condition',
        config: { field: 'lead_status', operator: 'in', value: ['new', 'contacted'] } },
      { key: 'c2', name: 'Gate: Rated Cold?', step_type: 'condition',
        config: { field: 'rating', operator: 'eq', value: 'cold' } },
      { key: 'n1', name: 'Re-engagement Task for Owner', step_type: 'notification',
        config: { field: 'assigned_to', title: 'Re-engage a cold prospect',
          message: '{{first_name}} {{last_name}} is still at "{{lead_status}}" with a cold rating. Book a nurture touch or mark them unqualified.' } },
    ],
  },

  // ══════════════════════════════════════════════════════════════════════════
  // DATA QUALITY
  // ══════════════════════════════════════════════════════════════════════════
  {
    name:        'client_data_hygiene_sweep',
    label:       'Client — Data Hygiene Sweep',
    description: 'Weekly completeness check across the client book. Any client missing an email address raises a data-hygiene task for its servicing agent, so outreach automation never silently skips them.',
    object:      'client',
    trigger_type: 'scheduled',
    trigger_config: { interval_minutes: 10080, per_record: true, limit: 500 },
    benchmark: 'Zoho CRM validation & data-enrichment rules · HubSpot data-quality automation · Salesforce completeness/duplicate rules · Dynamics 365 data quality',
    steps: [
      { key: 't',  name: 'Trigger: Weekly Client Data Quality Sweep', step_type: 'trigger',
        config: { description: 'Runs weekly across every live client record.' } },
      { key: 'c1', name: 'Gate: Missing Email Address?', step_type: 'condition',
        config: { field: 'email', operator: 'empty' } },
      { key: 'n1', name: 'Data Hygiene Task for Servicing Agent', step_type: 'notification',
        config: { field: 'assigned_to', title: 'Client record missing an email address',
          message: '{{first_name}} {{last_name}} has no email on file, so renewal and servicing emails cannot reach them. Capture it at the next contact.' } },
    ],
  },
];

/**
 * Fields these workflows write that are not part of the base object metadata.
 * The seeder creates them on the target objects so an approval outcome is
 * visible in the UI rather than living only in the automation's own state.
 */
const SUPPORTING_FIELDS = [
];

module.exports = { WORKFLOWS, SUPPORTING_FIELDS, ACTOR_PLACEHOLDERS };
