/**
 * What each workflow step type accepts in its `config`.
 *
 * ── Why this exists ─────────────────────────────────────────────────────────
 * The step editor offered one free-form "Configuration (JSON)" textarea with a
 * single example string per type, and on save it did:
 *
 *     try { config = JSON.parse(config); } catch { config = {}; }
 *
 * So a misplaced comma silently threw the author's work away and saved an
 * **empty** config. The step then did nothing — a webhook with no URL, a
 * condition with no field — with no error at save time and nothing in the UI to
 * show it. That is the worst failure mode an automation builder can have: the
 * author believes the automation is live.
 *
 * The keys below are read from the engine's own branches in
 * `backend/src/services/workflow.service.js`, so this is a description of what
 * the engine does, not a wish list. `required` means the engine's branch
 * no-ops (or cannot act) without it — every one of those no-ops is a line in
 * that file, quoted in the `why` text.
 *
 * Keeping it as data rather than bespoke JSX per type means the editor can
 * validate, explain, and pre-fill from one place, and a new step type needs one
 * entry rather than a new form.
 */

/** Operators the engine's `#evaluate` understands, grouped for the picker. */
export const CONDITION_OPERATORS = [
  { value: 'eq',               label: 'equals',                group: 'Compare' },
  { value: 'neq',              label: 'does not equal',        group: 'Compare' },
  { value: 'gt',               label: 'greater than',          group: 'Compare' },
  { value: 'gte',              label: 'greater than or equal', group: 'Compare' },
  { value: 'lt',               label: 'less than',             group: 'Compare' },
  { value: 'lte',              label: 'less than or equal',    group: 'Compare' },
  { value: 'contains',         label: 'contains',              group: 'Text' },
  { value: 'in',               label: 'is one of',             group: 'Text' },
  { value: 'nin',              label: 'is not one of',         group: 'Text' },
  { value: 'empty',            label: 'is empty',              group: 'Presence' },
  { value: 'notempty',         label: 'is not empty',          group: 'Presence' },
  { value: 'today',            label: 'is today',              group: 'Date' },
  { value: 'before_today',     label: 'is before today',       group: 'Date' },
  { value: 'after_today',      label: 'is after today',        group: 'Date' },
  { value: 'date_within_days', label: 'is within N days',      group: 'Date' },
  { value: 'date_overdue',     label: 'is overdue',            group: 'Date' },
  { value: 'expression',       label: 'formula is true',       group: 'Formula' },
];

/** Operators that need no `value` — asking for one would be misleading. */
export const VALUELESS_OPERATORS = new Set(['empty', 'notempty', 'today', 'before_today', 'after_today', 'date_overdue']);

/** `delay` units the engine converts (anything else falls back to minutes). */
export const DELAY_UNITS = ['minutes', 'hours', 'days'];

/**
 * One schema per step type.
 *
 * - `summary`  — what the step does, in one line.
 * - `standard` — the industry practice note: how this step is normally used,
 *                and the mistake that most often makes it useless.
 * - `fields`   — `{ key, label, type, required, help, placeholder }`.
 * - `example`  — a valid config, used by "Insert example".
 */
export const STEP_SCHEMAS = {
  trigger: {
    summary: 'Marks the entry point. Validates the event and passes through.',
    standard:
      'A trigger step is optional — a workflow starts at its first step whatever the type. '
      + 'Add one only to document the entry condition on the canvas.',
    fields: [],
    example: {},
  },

  condition: {
    summary: 'A gate. Continues down the true branch when the comparison holds, otherwise the false branch.',
    standard:
      'Put the cheapest, most selective check first: a failed gate stops the chain, so a condition early '
      + 'in the sequence is what keeps a workflow from doing work it will discard. On a field_changed '
      + 'workflow, set Source to "previous value" to test what the field changed *from* — that is how you '
      + 'detect a specific transition (open → won) rather than merely landing on a value.',
    fields: [
      { key: 'field', label: 'Field', type: 'field', required: true,
        help: 'The record field to test. Reads the CRM column, the custom-field store, or assigned_to / pipeline_stage_id.' },
      { key: 'operator', label: 'Operator', type: 'operator', required: true,
        help: 'How to compare.' },
      { key: 'value', label: 'Value', type: 'text',
        help: 'What to compare against. For "is one of", give a comma-separated list. Not used by presence and date-only operators. '
          + 'For "formula is true", write a formula over the whole record, e.g. amount > 5000000 AND risk_grade != \'A\' (Field is then ignored).' },
      { key: 'source', label: 'Source', type: 'select', options: ['', 'new', 'old'],
        help: 'field_changed workflows only: compare the new value or the previous one. Leave blank for the current value.' },
    ],
    example: { field: 'lead_status', operator: 'eq', value: 'qualified' },
  },

  action: {
    summary: 'Writes a value to a field on the record that triggered the workflow.',
    standard:
      'Use this for stamping state the rest of the system reads — a status, an owner, a stage. '
      + 'The value supports {{field}} interpolation from the same record. Note that writing a field can '
      + 'itself raise a field_changed event, so avoid two workflows that each set a field the other watches.',
    fields: [
      { key: 'field', label: 'Field to set', type: 'field', required: true,
        help: 'Engine: the step is a no-op without both field and value.' },
      { key: 'value', label: 'New value', type: 'text', required: true,
        help: 'Supports {{other_field}} placeholders, filled from the triggering record.' },
    ],
    example: { field: 'lead_status', value: 'working' },
  },

  notification: {
    summary: 'Creates in-app notifications for the recipients you resolve.',
    standard:
      'Prefer a role or a field over a hard-coded employee id: an id breaks the moment that person changes '
      + 'team or leaves, and it is the most common reason an alert quietly stops reaching anyone. '
      + 'Role recipients are filtered to active employees by the engine.',
    fields: [
      { key: 'title', label: 'Title', type: 'text',
        help: 'Supports {{field}} placeholders. Defaults to "Workflow notification".' },
      { key: 'message', label: 'Message', type: 'textarea',
        help: 'Supports {{field}} placeholders.' },
      { key: 'role', label: 'Notify a role', type: 'text',
        help: 'Every active employee holding this role, e.g. manager.' },
      { key: 'employee_id', label: 'Notify one employee', type: 'text',
        help: 'A specific employee id. Least durable option — prefer a role or a field.' },
      { key: 'field', label: 'Notify whoever is in a field', type: 'field',
        help: 'Reads an employee id out of the record, e.g. assigned_to or owner_id.' },
      { key: 'notify_actor', label: 'Also notify whoever triggered it', type: 'boolean' },
      { key: 'link', label: 'Deep link', type: 'text', help: 'Where the notification takes the reader.' },
    ],
    example: { role: 'manager', title: 'New qualified lead', message: '{{first_name}} at {{company}} is ready', link: '/module/1' },
    atLeastOneOf: {
      keys: ['role', 'employee_id', 'field', 'notify_actor'],
      message: 'A notification needs at least one recipient — a role, an employee, a field to read one from, or the actor.',
    },
  },

  delay: {
    summary: 'Pauses the workflow. Persisted, and resumed by the scheduler when due.',
    standard:
      'Delays are durable: the remainder of the workflow is written to the database and picked up by the '
      + '60-second scheduler, so a restart does not lose it. The scheduler ticks every minute, so treat a '
      + 'minute as the practical floor. A delay needs a following step to resume into — a delay at the end '
      + 'of a chain simply stops.',
    fields: [
      { key: 'duration', label: 'Wait for', type: 'number', required: true, placeholder: '3' },
      { key: 'unit', label: 'Unit', type: 'select', options: DELAY_UNITS, required: true },
    ],
    example: { duration: 3, unit: 'hours' },
  },

  approval: {
    summary: 'Halts and notifies approvers; resumes down the true branch when approved, the false branch when rejected.',
    standard:
      'Wire both branches. The engine records the resolved approvers and only accepts a decision from one of '
      + 'them, so an approval with no resolvable recipient can never be completed — it waits forever. '
      + 'Give the rejection path somewhere to go, or a rejected record silently stalls.',
    fields: [
      { key: 'title', label: 'Request title', type: 'text' },
      { key: 'message', label: 'What the approver is deciding', type: 'textarea' },
      { key: 'role', label: 'Approver role', type: 'text', help: 'Every active employee with this role may decide.' },
      { key: 'employee_id', label: 'Specific approver', type: 'text' },
      { key: 'field', label: 'Approver from a field', type: 'field', help: 'e.g. the record owner\'s manager id.' },
      { key: 'exclude_actor', label: 'Maker-checker: not the person who triggered it', type: 'select', options: ['', 'true'],
        help: 'Four eyes: whoever caused this step can never approve it, even if they hold the approver role.' },
      { key: 'exclude_field', label: 'Also exclude the person in field', type: 'field',
        help: 'e.g. a `maker` field — that employee cannot approve.' },
    ],
    example: { role: 'manager', title: 'Discount approval', message: 'Approve {{discount_pct}}% on {{name}}?', exclude_actor: true },
    atLeastOneOf: {
      keys: ['role', 'employee_id', 'field'],
      message: 'An approval with no resolvable approver can never be completed — it will wait forever. Name a role, an employee, or a field to read one from.',
    },
  },

  webhook: {
    summary: 'Calls an external URL, or a registered integration by name.',
    standard:
      'Prefer naming a registered integration over an ad-hoc URL: the integration holds the signing secret, '
      + 'retries with backoff, and shows up in Integration Health. Ad-hoc URLs are SSRF-checked and time out '
      + 'after 10 seconds, but they are invisible to monitoring and carry the secret in the step config.',
    fields: [
      { key: 'integration', label: 'Registered integration', type: 'text',
        help: 'The integration name from Builder ▸ Integrations. Preferred.' },
      { key: 'url', label: 'Ad-hoc URL', type: 'text', placeholder: 'https://…',
        help: 'Used only when no integration is named. Must be https and publicly routable.' },
      { key: 'method', label: 'Method', type: 'select', options: ['POST', 'PUT', 'PATCH'] },
      { key: 'body', label: 'Body', type: 'json', help: 'Values support {{field}} placeholders.' },
      { key: 'secret', label: 'Signing secret', type: 'text',
        help: 'Ad-hoc calls only. A registered integration keeps its own secret, out of this config.' },
    ],
    example: { integration: 'slack-notify', body: { text: '{{first_name}} reached qualified' } },
    atLeastOneOf: {
      keys: ['integration', 'url'],
      message: 'A webhook step needs either a registered integration name or a URL.',
    },
  },

  integration: {
    summary: 'Invokes a registered integration, or publishes a custom domain event.',
    standard:
      'Use an event (rather than a direct call) when more than one thing should react — every integration '
      + 'subscribed to that event fires, and adding a second consumer later needs no change to this workflow.',
    fields: [
      { key: 'integration', label: 'Integration name', type: 'text' },
      { key: 'event', label: 'Or publish an event', type: 'text', placeholder: 'lead.qualified' },
      { key: 'body', label: 'Payload', type: 'json' },
      { key: 'field_map', label: 'Field map', type: 'json',
        help: 'Maps response values back onto the record, e.g. { "company_size": "data.employees" }.' },
    ],
    example: { integration: 'crm-sync', body: { id: '{{id}}' } },
    atLeastOneOf: {
      keys: ['integration', 'event'],
      message: 'Name an integration to call, or an event to publish.',
    },
  },

  create_record: {
    summary: 'Creates a record in another object.',
    standard:
      'Carry the link back to the originating record in the new record\'s fields (e.g. account_id: "{{id}}"), '
      + 'or the two are unrelated afterwards and nothing can navigate between them. Guard this step behind a '
      + 'condition — an unguarded create on on_update runs on every single save.',
    fields: [
      { key: 'object_id', label: 'Target object', type: 'object', required: true,
        help: 'Engine: the step is a no-op without object_id, and skips cleanly if the object was since deleted.' },
      { key: 'fields', label: 'Field values', type: 'json', required: true,
        help: 'Values support {{field}} placeholders from the triggering record, and {{id}} for its id.' },
      { key: 'link_field', label: 'Link back through', type: 'text',
        help: 'A lookup field on the NEW record that should point at this record — it then appears in this record\'s Related tab.' },
      { key: 'store_as', label: 'Store new id in', type: 'text',
        help: 'A lookup field on THIS record that receives the new record\'s id.' },
    ],
    example: { object_id: 5, fields: { subject: 'Follow up with {{first_name}}' }, link_field: 'enquiry' },
  },

  send_email: {
    summary: 'Sends an email template to an address on the record.',
    standard:
      'Name the template, not its content, so communications stay editable by the business in Email Templates. '
      + 'With a language field, a template named <template>_<lang> (e.g. enquiry_ack_fr) is used when it exists — '
      + 'that is how one workflow sends English and French correspondence.',
    fields: [
      { key: 'template', label: 'Email template name', type: 'text', required: true },
      { key: 'to_field', label: 'Recipient field', type: 'field', help: 'Field holding the email address. Defaults to email.' },
      { key: 'to', label: 'Or a fixed address', type: 'text', help: 'Supports {{field}} placeholders.' },
      { key: 'language_field', label: 'Language field', type: 'field', help: 'e.g. preferred_language (en / fr).' },
    ],
    example: { template: 'enquiry_ack', to_field: 'email', language_field: 'preferred_language' },
  },

  generate_document: {
    summary: 'Renders a merge template from this record and files it in the record\'s Docs.',
    standard:
      'Templates are business-owned (Builder ▸ Document Management ▸ Merge templates); the step only names one, '
      + 'so wording changes never need a workflow edit. Pair it with a stage change: generate the offer letter '
      + 'when the record reaches “Offer issued”, then share it or send it for e-signature from the Docs tab.',
    fields: [
      { key: 'template', label: 'Merge template name', type: 'text', required: true },
      { key: 'filename', label: 'File name', type: 'text', help: 'Supports {{field}} placeholders, e.g. Offer {{application_no}}.' },
    ],
    example: { template: 'loan_offer_letter', filename: 'Offer letter {{application_no}}' },
  },

  update_related: {
    summary: 'Bulk-updates records in another object that link back to this one.',
    standard:
      'This writes to every matching record, so scope it deliberately: link_field must be the column on the '
      + 'target object that holds this record\'s id. A wrong link_field either matches nothing or matches far '
      + 'too much, and the step reports how many rows it touched in the run log — check it on a test run.',
    fields: [
      { key: 'object_id', label: 'Target object', type: 'object', required: true },
      { key: 'link_field', label: 'Link field on the target', type: 'text', required: true,
        help: 'The target column holding this record\'s id, e.g. account_id.' },
      { key: 'field', label: 'Field to set', type: 'text', required: true },
      { key: 'value', label: 'New value', type: 'text', required: true, help: 'Supports {{field}} placeholders.' },
      { key: 'link_value', label: 'Match value', type: 'text',
        help: 'Defaults to the triggering record\'s id. Override to match on something else.' },
    ],
    example: { object_id: 5, link_field: 'account_id', field: 'status', value: 'active' },
  },
};

/** Step types in the order the canvas offers them. */
export const STEP_TYPE_KEYS = Object.keys(STEP_SCHEMAS);

/**
 * Parse a config textarea, telling the caller *why* it failed.
 *
 * Returns `{ ok, value, error }`. The old code collapsed the failure case to
 * `{}` and saved it, which is what made a typo destroy the author's work
 * silently.
 */
export function parseStepConfig(raw) {
  if (raw == null || (typeof raw === 'string' && raw.trim() === '')) return { ok: true, value: {} };
  if (typeof raw === 'object') return { ok: true, value: raw };
  try {
    const value = JSON.parse(raw);
    if (value === null || typeof value !== 'object' || Array.isArray(value)) {
      return { ok: false, error: 'Configuration must be a JSON object, e.g. { "field": "status" }.' };
    }
    return { ok: true, value };
  } catch (e) {
    return { ok: false, error: `Invalid JSON — ${e.message}` };
  }
}

/**
 * Check a parsed config against its step type's schema.
 *
 * @returns {{ missing: string[], warnings: string[] }} `missing` blocks saving;
 *          `warnings` are advisory and never block.
 */
export function validateStepConfig(stepType, config = {}) {
  const schema = STEP_SCHEMAS[stepType];
  if (!schema) return { missing: [], warnings: [] };

  const present = (key) => {
    const v = config?.[key];
    if (v === undefined || v === null) return false;
    if (typeof v === 'string') return v.trim() !== '';
    if (typeof v === 'object') return Object.keys(v).length > 0;
    return true;
  };

  const missing = schema.fields
    .filter((f) => f.required && !present(f.key))
    // A formula condition reads the whole record — it needs a value, not a field.
    .filter((f) => !(stepType === 'condition' && config.operator === 'expression' && f.key === 'field'))
    .map((f) => f.label);
  if (stepType === 'condition' && config.operator === 'expression' && !present('value')) missing.push('Value');

  const warnings = [];
  if (schema.atLeastOneOf && !schema.atLeastOneOf.keys.some(present)) {
    warnings.push(schema.atLeastOneOf.message);
  }
  // A condition whose operator needs no value but was given one reads as a
  // mistake to the next person maintaining it.
  if (stepType === 'condition' && VALUELESS_OPERATORS.has(config.operator) && present('value')) {
    warnings.push(`The "${config.operator}" operator ignores Value — it tests the field itself.`);
  }
  return { missing, warnings };
}
