'use strict';

/**
 * crm-storage-map — single source of truth for "where does a record's field
 * data actually live?".
 *
 * Genesis stores record data in three different places depending on the
 * UiObject's `name`:
 *
 *   1. A first-class CRM table (`crm_leads`, `crm_contacts`, …) — canonical,
 *      typed columns. Only the object names listed in MODEL_MAP land here.
 *   2. `crm_lead_intake` — the raw inbound Lead object (`lead_intake`).
 *   3. The typed EAV table `record_field_values` — every other object
 *      (insurance domain objects, `client`, and all custom objects).
 *
 * Both RecordService (the write path used by the API) and
 * WorkflowEngineService (the automation engine) need this mapping, so it lives
 * here rather than being duplicated — a workflow that reads or writes a field
 * must resolve it exactly the way the API does, or automations silently no-op.
 */

// ── Allowed writable columns per CRM entity type ──────────────────────────────
// Maps form/API field names to the set of actual DB columns that are writable.
// Computed columns (full_name, age), internal IDs, and timestamps are excluded.
const LEAD_FIELDS = new Set([
  'first_name', 'last_name', 'company', 'email', 'phone', 'mobile', 'job_title',
  'lead_source', 'lead_status', 'rating', 'industry', 'annual_revenue', 'website',
  'description', 'is_converted',
]);
// Writable columns for the raw-lead intake object (its own crm_lead_intake table).
const LEAD_INTAKE_FIELDS = new Set([
  'first_name', 'last_name', 'company', 'email', 'phone', 'mobile', 'job_title',
  'lead_source', 'lead_status', 'rating', 'industry', 'annual_revenue', 'website',
  'description', 'is_converted',
]);

const CRM_FIELDS = {
  lead:        LEAD_FIELDS,
  prospect:    LEAD_FIELDS,          // prospect object uses the same crm_leads table
  lead_intake: LEAD_INTAKE_FIELDS,   // raw "Lead" object → crm_lead_intake table
  contact: new Set([
    'first_name', 'last_name', 'email', 'phone', 'mobile', 'title', 'department',
    'lead_source', 'birthdate', 'mailing_street', 'mailing_city', 'mailing_state',
    'mailing_country', 'mailing_zip', 'description', 'account_id', 'do_not_contact',
  ]),
  account: new Set([
    // Note: 'num_employees' is an alias handled by FIELD_ALIAS below.
    'name', 'account_type', 'industry', 'annual_revenue', 'employee_count', 'phone',
    'website', 'billing_street', 'billing_city', 'billing_state', 'billing_country',
    'billing_zip', 'description',
    // 'rating' intentionally omitted — not a column on crm_accounts.
  ]),
  opportunity: new Set([
    'name', 'stage', 'amount', 'close_date', 'probability', 'lead_source',
    'type', 'next_step', 'description', 'is_closed', 'is_won', 'account_id', 'contact_id',
    'currency', 'forecast_category',
  ]),
  case: new Set([
    'subject', 'status', 'priority', 'type', 'origin', 'description', 'resolution',
    // contact_email / contact_name exist on crm_cases (customer contact info)
    'contact_email', 'contact_name',
    'account_id', 'contact_id',
    // omitted: 'internal_comments','maturity_stage','assigned_to' — not schema cols
  ]),
};

// ── Canonical field-name aliases ──────────────────────────────────────────────
// Maps legacy / frontend form field names → actual DB column names.
// Applied before writing so the form surface and the DB schema can diverge
// safely without scattering one-off translations.
const FIELD_ALIAS = {
  lead: {
    annual_income: 'annual_revenue', // form sends annual_income, DB has annual_revenue
    title:         'job_title',      // form may send title, DB has job_title
    notes:         'description',    // form sends notes, DB has description
  },
  prospect: {
    annual_income: 'annual_revenue', // same as lead (prospect uses crm_leads table)
    title:         'job_title',
    notes:         'description',
  },
  lead_intake: {
    annual_income: 'annual_revenue', // raw Lead object → crm_lead_intake table
    title:         'job_title',
    notes:         'description',
  },
  contact: {
    name:           'first_name',     // defensive alias if form sends a single 'name' field
    date_of_birth:  'birthdate',      // form/metadata field → CRM column
    notes:          'description',    // form sends notes, DB has description
    address_street: 'mailing_street', // form address fields → CRM mailing fields
    address_city:   'mailing_city',
    address_state:  'mailing_state',
    address_zip:    'mailing_zip',
  },
  account: {
    num_employees: 'employee_count', // legacy / seed field name
    account_name:  'name',           // some forms use account_name
  },
  opportunity: {},
  case: {
    email: 'contact_email', // generic email → case contact_email
  },
};

// ── Reverse alias map: DB column name → form/metadata field name ──────────────
// Built from FIELD_ALIAS so that CRM columns are exposed under the names the
// frontend form actually uses.  e.g. CRM has `birthdate` but form expects
// `date_of_birth`, CRM has `annual_revenue` but form uses `annual_income`.
const REVERSE_ALIAS = {};
for (const [objName, aliases] of Object.entries(FIELD_ALIAS)) {
  REVERSE_ALIAS[objName] = {};
  for (const [formName, dbCol] of Object.entries(aliases)) {
    REVERSE_ALIAS[objName][dbCol] = formName;
  }
}

/** UiObject name → Prisma model accessor for its first-class CRM table. */
const MODEL_MAP = {
  lead:        'crmLead',
  prospect:    'crmLead',
  lead_intake: 'crmLeadIntake',
  contact:     'crmContact',
  account:     'crmAccount',
  opportunity: 'crmOpportunity',
  case:        'crmCase',
};

/** Objects that additionally mirror into the insurance domain tables. */
const INSURANCE_OBJECTS = new Set([
  'application', 'policy', 'claim', 'underwriting_case', 'commission',
]);

/**
 * Columns that live on `records` itself rather than on any entity/EAV row.
 * Workflow steps address these by their plain names (e.g. an action step that
 * sets `assigned_to` must write the anchor row, not a CRM column).
 */
const RECORD_COLUMNS = new Set(['assigned_to', 'pipeline_stage_id']);

/**
 * Resolve where an object's field data is stored.
 *
 * @param {string} objectName – UiObject.name
 * @returns {{ kind: 'crm'|'eav', model: string|null, fields: Set<string>|null,
 *             aliases: Object, reverseAliases: Object, isInsurance: boolean }}
 */
function resolveStorage(objectName) {
  const name  = String(objectName ?? '');
  const model = MODEL_MAP[name] ?? null;
  return {
    kind:           model ? 'crm' : 'eav',
    model,
    fields:         CRM_FIELDS[name] ?? null,
    aliases:        FIELD_ALIAS[name] ?? {},
    reverseAliases: REVERSE_ALIAS[name] ?? {},
    isInsurance:    INSURANCE_OBJECTS.has(name),
  };
}


// ── Typed EAV (record_field_values) serialisation ─────────────────────────────
// One row holds a value in whichever typed column matches the UiField's data
// type, always mirrored into str_value for text search / display.

/** Serialise a JS value into the typed columns of a record_field_values row. */
function toTypedValue(value, dataType) {
  const str  = value != null ? String(value) : null;
  const base = { str_value: str };
  if (value == null) return base;
  switch (dataType) {
    case 'number':
      return { ...base, num_value: Number.isNaN(Number(value)) ? null : Number(value) };
    case 'boolean':
      return { ...base, bool_value: value === true || value === 'true' || value === 1 || value === '1' };
    case 'date':
      try {
        const d = new Date(value);
        return { ...base, date_value: Number.isNaN(d.getTime()) ? null : d };
      } catch { return base; }
    case 'array':
    case 'object':
      try {
        const parsed = typeof value === 'string' ? JSON.parse(value) : value;
        return { ...base, json_value: parsed };
      } catch { return base; }
    default: // 'string' and anything else
      return base;
  }
}

/** Read the single meaningful value back out of a record_field_values row. */
function fromTypedRow(row) {
  if (row.json_value != null) return row.json_value;
  if (row.date_value != null) return row.date_value;
  if (row.bool_value != null) return row.bool_value;
  if (row.num_value  != null) return row.num_value;
  return row.str_value ?? null;
}

module.exports = {
  LEAD_FIELDS,
  LEAD_INTAKE_FIELDS,
  CRM_FIELDS,
  FIELD_ALIAS,
  REVERSE_ALIAS,
  MODEL_MAP,
  INSURANCE_OBJECTS,
  RECORD_COLUMNS,
  resolveStorage,
  toTypedValue,
  fromTypedRow,
};
