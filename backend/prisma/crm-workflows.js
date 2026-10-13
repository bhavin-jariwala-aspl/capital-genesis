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
 * platforms ship out of the box, adapted to this product's life-insurance
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
 * state the approval branch just wrote and halts. See `quote_high_value_approval`.
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
  // QUOTING
  // ══════════════════════════════════════════════════════════════════════════
  {
    name:        'quote_presented_followup',
    label:       'Quote — Presented Follow-up Cadence',
    description: 'Three days after a quote is presented, checks whether the client has decided. If it is still open, the owner gets a follow-up reminder rather than letting the quote go quiet.',
    object:      'quote',
    trigger_type: 'on_update',
    trigger_config: {},
    benchmark: 'Pipedrive stage-change automations · HubSpot deal-stage workflows · Salesforce Opportunity stage Flow · Zoho CRM Blueprint SLA',
    steps: [
      { key: 't',  name: 'Trigger: Quote Updated', step_type: 'trigger',
        config: { description: 'Evaluates the quote on every save.' } },
      { key: 'c1', name: 'Gate: Quote Presented to Client?', step_type: 'condition',
        config: { field: 'status', operator: 'eq', value: 'presented' } },
      { key: 'd1', name: 'Wait 3 Days for a Decision', step_type: 'delay',
        config: { duration: 3, unit: 'days' } },
      { key: 'c2', name: 'Gate: Still Awaiting a Decision?', step_type: 'condition',
        config: { field: 'status', operator: 'eq', value: 'presented' } },
      { key: 'n1', name: 'Follow-up Reminder for Quote Owner', step_type: 'notification',
        config: { field: 'assigned_to', notify_actor: true, title: 'Quote {{quote_number}} still open',
          message: '{{client_name}} has had the {{product_type}} quote ({{coverage_amount}} cover) for 3 days without deciding. Follow up before it goes cold.' } },
    ],
  },

  {
    name:        'quote_high_value_approval',
    label:       'Quote — High-Value Approval',
    description: 'Any quote presented with cover of 1,000,000 or more is pulled back to draft and routed to the sales manager for approval. Approved quotes are released to the client; rejected quotes are sent back to the owner to revise.',
    object:      'quote',
    trigger_type: 'on_update',
    trigger_config: {},
    benchmark: 'Salesforce Approval Processes & Big Deal Alerts · Zoho CRM Approval Process · Dynamics 365 approvals · HubSpot quote approval',
    steps: [
      { key: 't',  name: 'Trigger: Quote Updated', step_type: 'trigger',
        config: { description: 'Evaluates the quote on every save.' } },
      { key: 'c1', name: 'Gate: Quote Presented?', step_type: 'condition',
        config: { field: 'status', operator: 'eq', value: 'presented' } },
      { key: 'c2', name: 'Gate: Coverage 1,000,000 or More?', step_type: 'condition',
        config: { field: 'coverage_amount', operator: 'gte', value: 1000000 } },
      { key: 'c3', name: 'Gate: Not Already Reviewed', step_type: 'condition',
        config: { field: 'approval_status', operator: 'empty' } },
      { key: 'a1', name: 'Mark Approval In Progress', step_type: 'action',
        config: { field: 'approval_status', value: 'pending' } },
      { key: 'a2', name: 'Hold Quote at Draft Until Approved', step_type: 'action',
        config: { field: 'status', value: 'draft' } },
      { key: 'ap', name: 'Sales Manager Approval — High-Value Quote', step_type: 'approval',
        config: { role: 'manager', title: 'Approval required: high-value quote',
          message: 'Quote {{quote_number}} for {{client_name}} carries {{coverage_amount}} of {{product_type}} cover at {{annual_premium}} annual premium. Approve to release it to the client.' },
        on_true: 'a3', on_false: 'g1' },
      { key: 'a3', name: 'Record Approval', step_type: 'action',
        config: { field: 'approval_status', value: 'approved' } },
      { key: 'a4', name: 'Release Quote to Client', step_type: 'action',
        config: { field: 'status', value: 'presented' } },
      { key: 'n1', name: 'Notify Owner — Quote Released', step_type: 'notification',
        config: { field: 'assigned_to', notify_actor: true, title: 'High-value quote approved',
          message: 'Quote {{quote_number}} for {{client_name}} was approved and is now presented to the client.' } },
      { key: 'g1', name: 'Guard: Stop Here If Already Approved', step_type: 'condition',
        config: { field: 'approval_status', operator: 'neq', value: 'approved' } },
      { key: 'a5', name: 'Record Rejection', step_type: 'action',
        config: { field: 'approval_status', value: 'rejected' } },
      { key: 'n2', name: 'Notify Owner — Revise and Resubmit', step_type: 'notification',
        config: { field: 'assigned_to', notify_actor: true, title: 'High-value quote not approved',
          message: 'Quote {{quote_number}} for {{client_name}} was not approved and is held at draft. Revise the terms and resubmit.' } },
    ],
  },

  {
    name:        'quote_expiry_warning',
    label:       'Quote — Expiry Warning',
    description: 'Daily sweep that warns the quote owner when an open quote is within seven days of its validity date, so it can be re-priced or closed before it lapses.',
    object:      'quote',
    trigger_type: 'scheduled',
    trigger_config: { interval_minutes: 1440, per_record: true, limit: 500 },
    benchmark: 'Salesforce scheduled-triggered Flow · Zoho CRM scheduled rules · HubSpot date-based workflows · Dynamics 365 reminders',
    steps: [
      { key: 't',  name: 'Trigger: Daily Quote Expiry Sweep', step_type: 'trigger',
        config: { description: 'Runs daily across every live quote record.' } },
      { key: 'c1', name: 'Gate: Quote Still Open?', step_type: 'condition',
        config: { field: 'status', operator: 'in', value: ['draft', 'presented'] } },
      { key: 'c2', name: 'Gate: Expiring Within 7 Days?', step_type: 'condition',
        config: { field: 'valid_until', operator: 'date_within_days', value: 7 } },
      { key: 'n1', name: 'Expiry Warning for Quote Owner', step_type: 'notification',
        config: { field: 'assigned_to', title: 'Quote {{quote_number}} expires soon',
          message: 'The {{product_type}} quote for {{client_name}} is valid only until {{valid_until}}. Close it or re-price before it lapses.' } },
    ],
  },

  {
    name:        'quote_auto_expire',
    label:       'Quote — Auto-Expire Past Validity',
    description: 'Daily sweep that closes out any open quote whose validity date has passed, keeping the quote pipeline honest instead of accumulating stale open quotes.',
    object:      'quote',
    trigger_type: 'scheduled',
    trigger_config: { interval_minutes: 1440, per_record: true, limit: 500 },
    benchmark: 'Zoho CRM scheduled rules · Salesforce date-based Flow updates · Pipedrive deal-rotting automation · HubSpot date-based workflows',
    steps: [
      { key: 't',  name: 'Trigger: Daily Quote Validity Sweep', step_type: 'trigger',
        config: { description: 'Runs daily across every live quote record.' } },
      { key: 'c1', name: 'Gate: Quote Still Open?', step_type: 'condition',
        config: { field: 'status', operator: 'in', value: ['draft', 'presented'] } },
      { key: 'c2', name: 'Gate: Past Its Validity Date?', step_type: 'condition',
        config: { field: 'valid_until', operator: 'date_overdue' } },
      { key: 'a1', name: 'Auto-Expire the Quote', step_type: 'action',
        config: { field: 'status', value: 'expired' } },
      { key: 'n1', name: 'Notify Owner of Expired Quote', step_type: 'notification',
        config: { field: 'assigned_to', title: 'Quote {{quote_number}} has expired',
          message: 'The {{product_type}} quote for {{client_name}} passed its validity date of {{valid_until}} and was auto-expired. Re-quote if the client is still interested.' } },
    ],
  },

  // ══════════════════════════════════════════════════════════════════════════
  // APPLICATION & UNDERWRITING
  // ══════════════════════════════════════════════════════════════════════════
  {
    name:        'application_submitted_to_underwriting',
    label:       'Application — Submission Handoff to Underwriting',
    description: 'On submission, stamps the application status, opens the matching underwriting case, and notifies both the underwriting team and the submitting agent.',
    object:      'application',
    trigger_type: 'on_create',
    trigger_config: {},
    benchmark: 'Salesforce record-triggered Flow creating a related record · Dynamics 365 Business Process Flow stage advance · Zoho CRM Blueprint · HubSpot deal handoff',
    steps: [
      { key: 't',  name: 'Trigger: New Application Submitted', step_type: 'trigger',
        config: { description: 'Fires when an application record is created from the wizard, portal, or API.' } },
      { key: 'a1', name: 'Set Status to Submitted', step_type: 'action',
        config: { field: 'status', value: 'submitted' } },
      { key: 'cr', name: 'Open Underwriting Case', step_type: 'create_record',
        config: {
          object: 'underwriting_case',
          fields: {
            case_number:     'UWC-{{application_number}}',
            applicant_name:  '{{applicant_name}}',
            product_type:    '{{product_type}}',
            coverage_amount: '{{coverage_amount}}',
            status:          'pending',
            notes:           'Auto-created from application {{application_number}}.',
          },
        } },
      { key: 'n1', name: 'Notify Underwriting Team', step_type: 'notification',
        config: { role: 'underwriter', title: 'New application ready for underwriting',
          message: 'Application {{application_number}} for {{applicant_name}} ({{product_type}}, {{coverage_amount}} cover) is queued for review.' } },
      { key: 'n2', name: 'Confirm Submission to Agent', step_type: 'notification',
        config: { field: 'assigned_to', notify_actor: true, title: 'Application {{application_number}} submitted',
          message: 'Your application for {{applicant_name}} is with underwriting. You will be notified when a decision is made.' } },
    ],
  },

  {
    name:        'application_jumbo_uw_approval',
    label:       'Application — Jumbo Limit Referral & Approval',
    description: 'Applications under review with cover of 2,000,000 or more are referred to the chief underwriter. Approval advances the application; rejection declines it. A referral latch stops the same case being referred twice.',
    object:      'application',
    trigger_type: 'on_update',
    trigger_config: {},
    benchmark: 'Salesforce Approval Processes · Zoho CRM Approval Process · Dynamics 365 approvals · industry-standard jumbo-limit referral',
    steps: [
      { key: 't',  name: 'Trigger: Application Updated', step_type: 'trigger',
        config: { description: 'Evaluates the application on every save.' } },
      { key: 'c1', name: 'Gate: Under Review?', step_type: 'condition',
        config: { field: 'status', operator: 'eq', value: 'under_review' } },
      { key: 'c2', name: 'Gate: Coverage 2,000,000 or More (jumbo limit)?', step_type: 'condition',
        config: { field: 'coverage_amount', operator: 'gte', value: 2000000 } },
      { key: 'c3', name: 'Gate: Not Already Referred', step_type: 'condition',
        config: { field: 'approval_status', operator: 'empty' } },
      { key: 'a1', name: 'Mark Referral In Progress', step_type: 'action',
        config: { field: 'approval_status', value: 'pending' } },
      { key: 'ap', name: 'Chief Underwriter Referral', step_type: 'approval',
        config: { role: 'uw_manager', title: 'Jumbo case referral',
          message: 'Application {{application_number}} for {{applicant_name}} requests {{coverage_amount}} of {{product_type}} cover at {{premium}} premium — above the jumbo limit. Approve or decline.' },
        on_true: 'a2', on_false: 'g1' },
      { key: 'a2', name: 'Record Approval', step_type: 'action',
        config: { field: 'approval_status', value: 'approved' } },
      { key: 'a3', name: 'Advance Application to Approved', step_type: 'action',
        config: { field: 'status', value: 'approved' } },
      { key: 'n1', name: 'Notify Agent — Jumbo Case Approved', step_type: 'notification',
        config: { field: 'assigned_to', notify_actor: true, title: 'Jumbo case approved',
          message: 'Application {{application_number}} for {{applicant_name}} cleared chief-underwriter referral and is approved.' } },
      { key: 'g1', name: 'Guard: Stop Here If Already Approved', step_type: 'condition',
        config: { field: 'approval_status', operator: 'neq', value: 'approved' } },
      { key: 'a4', name: 'Record Decline', step_type: 'action',
        config: { field: 'approval_status', value: 'rejected' } },
      { key: 'a5', name: 'Decline the Application', step_type: 'action',
        config: { field: 'status', value: 'declined' } },
      { key: 'n2', name: 'Notify Agent — Jumbo Case Declined', step_type: 'notification',
        config: { field: 'assigned_to', notify_actor: true, title: 'Jumbo case declined',
          message: 'Application {{application_number}} for {{applicant_name}} was declined at chief-underwriter referral. Discuss alternatives with the client.' } },
    ],
  },

  {
    name:        'underwriting_case_sla_escalation',
    label:       'Underwriting — 48-Hour SLA Escalation',
    description: 'Queues every new underwriting case to the underwriting team and starts a 48-hour clock. A case still sitting at Pending when the clock expires is escalated to the chief underwriter and flagged as referred.',
    object:      'underwriting_case',
    trigger_type: 'on_create',
    trigger_config: {},
    benchmark: 'Zoho CRM SLA Escalation Rules · Dynamics 365 SLA "Resolve By" KPI · Salesforce Entitlement Milestones · HubSpot ticket SLA',
    steps: [
      { key: 't',  name: 'Trigger: Underwriting Case Opened', step_type: 'trigger',
        config: { description: 'Fires when an underwriting case is created, including cases opened automatically on application submission.' } },
      { key: 'a1', name: 'Set Status to Pending', step_type: 'action',
        config: { field: 'status', value: 'pending' } },
      { key: 'n1', name: 'Queue to Underwriting Team', step_type: 'notification',
        config: { role: 'underwriter', title: 'New underwriting case in the queue',
          message: 'Case {{case_number}} for {{applicant_name}} ({{product_type}}, {{coverage_amount}} cover) is awaiting review. SLA: 48 hours.' } },
      { key: 'd1', name: 'Wait 48 Hours', step_type: 'delay',
        config: { duration: 48, unit: 'hours' } },
      { key: 'c1', name: 'Gate: Still Pending After 48 Hours?', step_type: 'condition',
        config: { field: 'status', operator: 'eq', value: 'pending' } },
      { key: 'n2', name: 'SLA Breach — Escalate to Chief Underwriter', step_type: 'notification',
        config: { role: 'uw_manager', title: 'Underwriting SLA breached',
          message: 'Case {{case_number}} for {{applicant_name}} has been untouched for 48 hours and is being flagged as referred.' } },
      { key: 'a2', name: 'Flag Case as Referred', step_type: 'action',
        config: { field: 'status', value: 'referred' } },
    ],
  },

  // ══════════════════════════════════════════════════════════════════════════
  // POLICY SERVICING & RETENTION
  // ══════════════════════════════════════════════════════════════════════════
  {
    name:        'policy_issued_onboarding',
    label:       'Policy — In-Force Onboarding Handoff',
    description: 'The closed-won handoff: when a policy goes in force, raises the welcome-call task for the servicing agent, opens the commission record, and tells the sales manager.',
    object:      'policy',
    trigger_type: 'on_create',
    trigger_config: {},
    benchmark: 'HubSpot closed-won handoff workflow · Salesforce closed-won Flow · Pipedrive deal-won automation · Zoho CRM conversion rules',
    steps: [
      { key: 't',  name: 'Trigger: Policy Record Created', step_type: 'trigger',
        config: { description: 'Fires when a policy is issued into the system.' } },
      { key: 'c1', name: 'Gate: Policy In Force?', step_type: 'condition',
        config: { field: 'status', operator: 'eq', value: 'active' } },
      { key: 'n1', name: 'Welcome-Call Task for Servicing Agent', step_type: 'notification',
        config: { field: 'assigned_to', notify_actor: true, title: 'Welcome call — policy {{policy_number}}',
          message: '{{policyholder}} is now covered for {{coverage_amount}} under a {{product_type}} policy effective {{effective_date}}. Make the welcome call and confirm payment details.' } },
      { key: 'cr', name: 'Open Commission Record', step_type: 'create_record',
        config: {
          object: 'commission',
          fields: {
            policy_number:  '{{policy_number}}',
            agent_name:     '{{assigned_to}}',
            premium_amount: '{{premium_annual}}',
            product_type:   '{{product_type}}',
            period:         '{{effective_date}}',
            status:         'pending',
            notes:          'Auto-created when policy {{policy_number}} went in force.',
          },
        } },
      { key: 'n2', name: 'Notify Sales Manager — New In-Force Policy', step_type: 'notification',
        config: { role: 'manager', title: 'New policy in force',
          message: 'Policy {{policy_number}} for {{policyholder}} is in force: {{product_type}}, {{coverage_amount}} cover, {{premium_annual}} annual premium.' } },
    ],
  },

  {
    name:        'policy_renewal_outreach',
    label:       'Policy — 30-Day Renewal Outreach',
    description: 'Daily sweep over in-force policies. Anything expiring within 30 days raises a renewal conversation for the servicing agent and surfaces on the sales manager\'s renewal pipeline.',
    object:      'policy',
    trigger_type: 'scheduled',
    trigger_config: { interval_minutes: 1440, per_record: true, limit: 500 },
    benchmark: 'Salesforce scheduled-triggered Flow · Zoho CRM scheduled Workflow Rules · Dynamics 365 renewal reminders · HubSpot date-based workflows',
    steps: [
      { key: 't',  name: 'Trigger: Daily Renewal Sweep', step_type: 'trigger',
        config: { description: 'Runs daily across every live policy record.' } },
      { key: 'c1', name: 'Gate: Policy In Force?', step_type: 'condition',
        config: { field: 'status', operator: 'eq', value: 'active' } },
      { key: 'c2', name: 'Gate: Expiring Within 30 Days?', step_type: 'condition',
        config: { field: 'expiry_date', operator: 'date_within_days', value: 30 } },
      { key: 'n1', name: 'Renewal Outreach for Servicing Agent', step_type: 'notification',
        config: { field: 'assigned_to', title: 'Renewal due — policy {{policy_number}}',
          message: '{{policyholder}}\'s {{product_type}} policy ({{coverage_amount}} cover) expires on {{expiry_date}}. Open the renewal conversation now.' } },
      { key: 'n2', name: 'Renewal Pipeline Alert for Sales Manager', step_type: 'notification',
        config: { role: 'manager', title: 'Policy entering the renewal window',
          message: 'Policy {{policy_number}} for {{policyholder}} expires on {{expiry_date}} — {{premium_annual}} annual premium at risk.' } },
    ],
  },

  {
    name:        'policy_lapse_prevention',
    label:       'Policy — Lapse Prevention',
    description: 'Daily sweep for overdue premium payments on in-force policies, alerting the servicing agent and the sales manager while the policy can still be saved.',
    object:      'policy',
    trigger_type: 'scheduled',
    trigger_config: { interval_minutes: 1440, per_record: true, limit: 500 },
    benchmark: 'HubSpot churn-risk workflows · Zoho CRM payment reminders · Salesforce retention Flows · Dynamics 365 customer-health alerts',
    steps: [
      { key: 't',  name: 'Trigger: Daily Premium Payment Sweep', step_type: 'trigger',
        config: { description: 'Runs daily across every live policy record.' } },
      { key: 'c1', name: 'Gate: Policy In Force?', step_type: 'condition',
        config: { field: 'status', operator: 'eq', value: 'active' } },
      { key: 'c2', name: 'Gate: Premium Payment Overdue?', step_type: 'condition',
        config: { field: 'next_payment_date', operator: 'date_overdue' } },
      { key: 'n1', name: 'Lapse-Risk Alert for Servicing Agent', step_type: 'notification',
        config: { field: 'assigned_to', title: 'Premium overdue — lapse risk on {{policy_number}}',
          message: '{{policyholder}} missed the payment due {{next_payment_date}} ({{payment_method}}). Contact them before the policy lapses.' } },
      { key: 'n2', name: 'Retention Alert for Sales Manager', step_type: 'notification',
        config: { role: 'manager', title: 'Policy at risk of lapsing',
          message: 'Policy {{policy_number}} for {{policyholder}} is past its payment due date of {{next_payment_date}}.' } },
    ],
  },

  // ══════════════════════════════════════════════════════════════════════════
  // CLAIMS SERVICE
  // ══════════════════════════════════════════════════════════════════════════
  {
    name:        'claim_intake_triage',
    label:       'Claim — Intake Triage & Large-Loss Routing',
    description: 'Triages every new claim: stamps the status, alerts the claims manager, and routes large-loss claims to a senior underwriter while moving them straight into investigation.',
    object:      'claim',
    trigger_type: 'on_create',
    trigger_config: {},
    benchmark: 'Salesforce Case assignment & escalation rules · Zoho CRM case escalation · Dynamics 365 Customer Service routing · HubSpot ticket pipelines',
    steps: [
      { key: 't',  name: 'Trigger: Claim Filed', step_type: 'trigger',
        config: { description: 'Fires when a claim record is created from any intake channel.' } },
      { key: 'a1', name: 'Set Status to Filed', step_type: 'action',
        config: { field: 'status', value: 'filed' } },
      { key: 'n1', name: 'Notify Claims Manager', step_type: 'notification',
        config: { role: 'manager', title: 'New claim filed',
          message: 'Claim {{claim_number}} ({{claim_type}}) filed by {{claimant_name}} against policy {{policy_number}} for {{claim_amount}}.' } },
      { key: 'c1', name: 'Gate: Large-Loss Claim (250,000 or more)?', step_type: 'condition',
        config: { field: 'claim_amount', operator: 'gte', value: 250000 } },
      { key: 'n2', name: 'Large-Loss Review — Senior Underwriter', step_type: 'notification',
        config: { role: 'senior_underwriter', title: 'Large-loss claim needs review',
          message: 'Claim {{claim_number}} for {{claim_amount}} ({{claim_type}}) on policy {{policy_number}} exceeds the large-loss threshold.' } },
      { key: 'a2', name: 'Move Claim to Investigation', step_type: 'action',
        config: { field: 'status', value: 'under_investigation' } },
    ],
  },

  {
    name:        'claim_documentation_escalation',
    label:       'Claim — Documentation SLA Escalation',
    description: 'Starts a three-day documentation clock on every claim. If supporting documents are still missing, chases the adjuster and escalates the stalled claim to the manager.',
    object:      'claim',
    trigger_type: 'on_create',
    trigger_config: {},
    benchmark: 'Dynamics 365 SLA "Resolve By" KPI · Zoho CRM escalation after N hours · Salesforce Entitlement Milestones · HubSpot ticket SLA escalation',
    steps: [
      { key: 't',  name: 'Trigger: Claim Filed — Start Documentation Clock', step_type: 'trigger',
        config: { description: 'Starts the documentation SLA when the claim is filed.' } },
      { key: 'd1', name: 'Wait 3 Days for Documentation', step_type: 'delay',
        config: { duration: 3, unit: 'days' } },
      { key: 'c1', name: 'Gate: Documents Still Outstanding?', step_type: 'condition',
        config: { field: 'documents_received', operator: 'eq', value: false } },
      { key: 'n1', name: 'Chase Documentation — Claims Adjuster', step_type: 'notification',
        config: { field: 'assigned_to', title: 'Documents outstanding on claim {{claim_number}}',
          message: '{{claimant_name}} has not supplied the supporting documents for claim {{claim_number}} ({{claim_type}}). Chase them today.' } },
      { key: 'n2', name: 'Escalate Stalled Claim to Manager', step_type: 'notification',
        config: { role: 'manager', title: 'Claim stalled at intake',
          message: 'Claim {{claim_number}} on policy {{policy_number}} has been waiting 3 days for documentation.' } },
    ],
  },

  // ══════════════════════════════════════════════════════════════════════════
  // COMMISSIONS & DATA QUALITY
  // ══════════════════════════════════════════════════════════════════════════
  {
    name:        'commission_payout_approval',
    label:       'Commission — Large Payout Approval',
    description: 'Any pending commission of 25,000 or more needs sales-manager sign-off before it is released for payment. Approval marks it paid; rejection leaves it pending and flags it for review.',
    object:      'commission',
    trigger_type: 'on_update',
    trigger_config: {},
    benchmark: 'Salesforce Approval Processes · Zoho CRM Approval Process · Dynamics 365 approvals · HubSpot approval workflows',
    steps: [
      { key: 't',  name: 'Trigger: Commission Updated', step_type: 'trigger',
        config: { description: 'Evaluates the commission record on every save.' } },
      { key: 'c1', name: 'Gate: Payout Still Pending?', step_type: 'condition',
        config: { field: 'status', operator: 'eq', value: 'pending' } },
      { key: 'c2', name: 'Gate: Amount 25,000 or More?', step_type: 'condition',
        config: { field: 'commission_amount', operator: 'gte', value: 25000 } },
      { key: 'c3', name: 'Gate: Not Already Reviewed', step_type: 'condition',
        config: { field: 'approval_status', operator: 'empty' } },
      { key: 'a1', name: 'Mark Approval In Progress', step_type: 'action',
        config: { field: 'approval_status', value: 'pending' } },
      { key: 'ap', name: 'Sales Manager Payout Approval', step_type: 'approval',
        config: { role: 'manager', title: 'Approval required: large commission payout',
          message: '{{agent_name}} is due {{commission_amount}} on policy {{policy_number}} ({{product_type}}, {{period}}). Approve to release for payment.' },
        on_true: 'a2', on_false: 'g1' },
      { key: 'a2', name: 'Record Approval', step_type: 'action',
        config: { field: 'approval_status', value: 'approved' } },
      { key: 'a3', name: 'Release Commission for Payment', step_type: 'action',
        config: { field: 'status', value: 'paid' } },
      { key: 'n1', name: 'Notify Agent — Payout Approved', step_type: 'notification',
        config: { field: 'assigned_to', notify_actor: true, title: 'Commission approved for payout',
          message: 'Your {{commission_amount}} commission on policy {{policy_number}} was approved and released for payment.' } },
      { key: 'g1', name: 'Guard: Stop Here If Already Approved', step_type: 'condition',
        config: { field: 'approval_status', operator: 'neq', value: 'approved' } },
      { key: 'a4', name: 'Record Rejection', step_type: 'action',
        config: { field: 'approval_status', value: 'rejected' } },
      { key: 'n2', name: 'Notify Manager — Payout Held for Review', step_type: 'notification',
        config: { role: 'manager', title: 'Commission payout rejected',
          message: 'The {{commission_amount}} payout to {{agent_name}} on policy {{policy_number}} was rejected and remains pending. Review the calculation.' } },
    ],
  },

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
  {
    objects: ['quote', 'application', 'commission'],
    field: {
      name:       'approval_status',
      label:      'Approval Status',
      field_type: 'select',
      data_type:  'string',
      help_text:  'Set by the approval workflow for this object. Empty until an approval is requested.',
      options: [
        { value: 'pending',  label: 'Pending Approval', color: '#f59e0b' },
        { value: 'approved', label: 'Approved',         color: '#10b981' },
        { value: 'rejected', label: 'Rejected',         color: '#ef4444' },
      ],
    },
  },
];

module.exports = { WORKFLOWS, SUPPORTING_FIELDS, ACTOR_PLACEHOLDERS };
