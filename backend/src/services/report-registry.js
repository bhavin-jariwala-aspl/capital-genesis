'use strict';

/**
 * Report data-source registry — the curated set of "report types" a business
 * user can build reports on, the same model Salesforce ("report types"),
 * HubSpot ("data sources"), Zoho ("modules") and Dynamics expose.
 *
 * Everything here is written for a NON-TECHNICAL author:
 *   • every source and field carries a plain-English `label`
 *   • `description` explains, in business terms, what one row means
 *   • `hint` on a field explains what it is when the label alone is ambiguous
 *   • related-object fields are exposed as "Owner ▸ Name", so a user can report
 *     across objects without knowing what a join is
 *
 * Nothing in the report builder UI is free-text-technical: the builder reads
 * this file to populate every dropdown it shows.
 *
 * ── The join model ────────────────────────────────────────────────────────────
 *
 * Two kinds of cross-table reporting, and deliberately no third:
 *
 * 1. **`relations` — curated to-one paths, up to `MAX_RELATION_HOPS` deep.**
 *    `REL('agent', 'Agent', EMPLOYEE_FIELDS, [REL('branch', 'Branch', BRANCH_FIELDS)])`
 *    yields the field key `agent.branch.branch_name`, resolved with a nested Prisma
 *    `select`. Every hop is to-one, so **the row count never changes** and no
 *    measure can be inflated. This is the equivalent of a Salesforce report type's
 *    related-object path.
 *
 * 2. **`rollups` — parent→children aggregates.**
 *    `ROLLUP('opportunities', 'Opportunities', 'crmOpportunity', 'account_id', [...])`
 *    yields `opportunities.$count` and `opportunities.amount` on the *accounts*
 *    source. These are computed by a separate `groupBy` on the child table and
 *    attached to each parent row, **never by a row-multiplying join**. Salesforce
 *    calls the same thing a roll-up summary field, and keeps it separate from joins
 *    for exactly this reason: joining `accounts → opportunities` and summing annual
 *    revenue counts an account with three deals three times.
 *
 * Arbitrary user-defined joins are intentionally not supported — see
 * docs/developer-guide/REPORTING.md#the-join-model.
 *
 * Field types: string | enum | number | currency | percent | date | boolean
 * Field flags:
 *   agg:      true → can be summed/averaged (offered under "Measure")
 *   group:    false → never offered as a grouping (e.g. free-text names)
 *   options:  fixed picklist → the filter UI renders a dropdown, not a textbox
 *   employee: true → values are employee IDs; the UI resolves them to names
 *   primary:  true → this field *is* the related record's identity, so its own
 *             label is dropped once the path is 2+ hops deep: `agent.branch.branch_name`
 *             reads "Agent ▸ Branch", not "Agent ▸ Branch ▸ Name"
 *   hidden:   true → still resolvable (so saved reports keep working) but no longer
 *             offered in the builder — used to retire a field in favour of a better one
 *   rollup:   'sum' | 'avg' | 'min' | 'max' → how the child rows fold into the parent
 */

/** How many to-one hops a field path may traverse from the source. */
const MAX_RELATION_HOPS = 2;

/** How many columns a table report shows before the author picks their own. */
const DEFAULT_COLUMN_COUNT = 8;

const F = (key, label, type, extra = {}) => ({ key, label, type, ...extra });

/**
 * A related-object field group. `via` is the Prisma relation name (which must be
 * **to-one**); each field becomes a dotted key (`owner.employee_name`) that the
 * report engine resolves with a nested `select`. `nested` declares further to-one
 * hops from the target model, giving `owner.branch.branch_name`.
 */
const REL = (via, label, fields, nested = []) => ({ via, label, fields, relations: nested });

/**
 * A parent→children roll-up. `via` names the collection for the field key only —
 * the engine reads the children with its own `groupBy` on `model`, keyed by the
 * foreign key `fk`, so no join and no fan-out is involved.
 *
 * Each field must declare how its child rows fold into one parent value
 * (`rollup: 'sum' | 'avg' | 'min' | 'max'`). `$count` is always available.
 */
const ROLLUP = (via, label, model, fk, fields = []) => ({ via, label, model, fk, fields });

// ── Reusable related-object field sets ─────────────────────────────────────

const BRANCH_FIELDS = [
  F('branch_name', 'Name', 'string', { group: true, primary: true }),
  F('branch_code', 'Code', 'string'),
];

const REGION_FIELDS = [
  F('region_name', 'Name', 'string', { group: true, primary: true }),
  F('region_code', 'Code', 'string'),
];

const EMPLOYEE_FIELDS = [
  F('employee_name', 'Name', 'string', { group: true, primary: true }),
  F('email', 'Email', 'string', { group: false }),
  F('role', 'Role', 'string'),
  // Retired in favour of `…branch.branch_name` / `…region.region_name`, which group
  // by the territory's *name* instead of its numeric id. Kept resolvable so reports
  // saved against them keep running; `hidden` removes them from the picker.
  F('branch_id', 'Branch (id)', 'number', { hidden: true }),
  F('region_id', 'Region (id)', 'number', { hidden: true }),
];

/** Territory hops available from any employee-shaped relation. */
const EMPLOYEE_RELATIONS = [
  REL('branch', 'Branch', BRANCH_FIELDS),
  REL('region', 'Region', REGION_FIELDS),
];

const ACCOUNT_FIELDS = [
  F('name', 'Name', 'string', { group: true, primary: true }),
  F('industry', 'Industry', 'string'),
  F('account_type', 'Type', 'enum', { options: ['prospect', 'customer', 'partner', 'competitor'] }),
  F('annual_revenue', 'Annual revenue', 'currency', { agg: true }),
  F('employee_count', 'Employees', 'number', { agg: true }),
  F('billing_city', 'City', 'string'),
  F('billing_state', 'State', 'string'),
  F('billing_country', 'Country', 'string'),
];

const CONTACT_FIELDS = [
  F('first_name', 'First name', 'string', { group: false }),
  F('last_name', 'Last name', 'string', { group: false }),
  F('email', 'Email', 'string', { group: false }),
  F('title', 'Job title', 'string'),
  F('department', 'Department', 'string'),
];

const SOURCES = {
  leads: {
    key: 'leads', label: 'Leads', model: 'crmLead', category: 'sales', icon: 'UserPlus',
    description: 'One row per lead — people or companies that have shown interest but are not yet customers.',
    dateField: 'created_at', ownerField: 'owner_id', titleField: 'last_name',
    fields: [
      F('first_name', 'First name', 'string', { group: false }),
      F('last_name', 'Last name', 'string', { group: false }),
      F('company', 'Company', 'string'),
      F('email', 'Email', 'string', { group: false }),
      F('phone', 'Phone', 'string', { group: false }),
      F('job_title', 'Job title', 'string'),
      F('lead_status', 'Status', 'enum', { options: ['new', 'contacted', 'qualified', 'unqualified', 'converted'] }),
      F('rating', 'Rating', 'enum', { options: ['hot', 'warm', 'cold'], hint: 'How promising the lead looks' }),
      F('lead_source', 'Source', 'string', { hint: 'Where the lead came from — web, referral, event…' }),
      F('industry', 'Industry', 'string'),
      F('annual_revenue', 'Annual revenue', 'currency', { agg: true }),
      F('is_converted', 'Converted', 'boolean', { hint: 'Became an opportunity' }),
      F('owner_id', 'Owner', 'string', { employee: true }),
      F('converted_at', 'Converted on', 'date'),
      F('created_at', 'Created', 'date'),
    ],
    relations: [REL('owner', 'Owner', EMPLOYEE_FIELDS, EMPLOYEE_RELATIONS)],
  },

  accounts: {
    key: 'accounts', label: 'Accounts', model: 'crmAccount', category: 'sales', icon: 'Building2',
    description: 'One row per customer or prospect company, with roll-ups of its deals and cases.',
    dateField: 'created_at', ownerField: 'owner_id', titleField: 'name',
    fields: [
      F('name', 'Name', 'string', { group: false }),
      F('industry', 'Industry', 'string'),
      F('account_type', 'Type', 'enum', { options: ['prospect', 'customer', 'partner', 'competitor'] }),
      F('annual_revenue', 'Annual revenue', 'currency', { agg: true }),
      F('employee_count', 'Employees', 'number', { agg: true }),
      F('billing_city', 'City', 'string'),
      F('billing_state', 'State', 'string'),
      F('billing_country', 'Country', 'string'),
      F('owner_id', 'Owner', 'string', { employee: true }),
      F('created_at', 'Created', 'date'),
    ],
    relations: [REL('owner', 'Owner', EMPLOYEE_FIELDS, EMPLOYEE_RELATIONS)],
    rollups: [
      ROLLUP('opportunities', 'Opportunities', 'crmOpportunity', 'account_id', [
        F('amount', 'Total deal value', 'currency', { rollup: 'sum' }),
        F('probability', 'Average probability', 'percent', { rollup: 'avg' }),
      ]),
      ROLLUP('cases', 'Cases', 'crmCase', 'account_id', []),
    ],
  },

  opportunities: {
    key: 'opportunities', label: 'Opportunities', model: 'crmOpportunity', category: 'sales', icon: 'TrendingUp',
    description: 'One row per deal in the pipeline, with its value, stage and expected close date.',
    dateField: 'created_at', ownerField: 'owner_id', titleField: 'name',
    fields: [
      F('name', 'Name', 'string', { group: false }),
      F('amount', 'Amount', 'currency', { agg: true, hint: 'The value of the deal' }),
      F('stage', 'Stage', 'enum', { options: ['prospecting', 'qualification', 'proposal', 'negotiation', 'closed_won', 'closed_lost'] }),
      F('probability', 'Probability', 'percent', { agg: true, hint: 'Chance of winning, 0–100' }),
      F('forecast_category', 'Forecast category', 'enum', { options: ['pipeline', 'best_case', 'commit', 'closed'] }),
      F('type', 'Deal type', 'string'),
      F('lead_source', 'Source', 'string'),
      F('next_step', 'Next step', 'string', { group: false }),
      F('is_closed', 'Closed', 'boolean'),
      F('is_won', 'Won', 'boolean'),
      F('close_date', 'Close date', 'date'),
      F('owner_id', 'Owner', 'string', { employee: true }),
      F('created_at', 'Created', 'date'),
    ],
    relations: [
      REL('owner', 'Owner', EMPLOYEE_FIELDS, EMPLOYEE_RELATIONS),
      REL('account', 'Account', ACCOUNT_FIELDS),
      REL('contact', 'Contact', CONTACT_FIELDS, [REL('account', 'Account', ACCOUNT_FIELDS)]),
    ],
  },

  cases: {
    key: 'cases', label: 'Cases', model: 'crmCase', category: 'support', icon: 'LifeBuoy',
    description: 'One row per customer service case or ticket.',
    dateField: 'created_at', ownerField: 'owner_id', titleField: 'subject',
    fields: [
      F('subject', 'Subject', 'string', { group: false }),
      F('status', 'Status', 'enum', { options: ['new', 'open', 'in_progress', 'escalated', 'resolved', 'closed'] }),
      F('priority', 'Priority', 'enum', { options: ['low', 'medium', 'high', 'critical'] }),
      F('type', 'Case type', 'string'),
      F('origin', 'Channel', 'enum', { options: ['web', 'email', 'phone', 'chat'], hint: 'How the case reached us' }),
      F('contact_name', 'Contact name', 'string', { group: false }),
      F('owner_id', 'Owner', 'string', { employee: true }),
      F('created_at', 'Created', 'date'),
      F('updated_at', 'Last updated', 'date'),
    ],
    relations: [
      REL('owner', 'Owner', EMPLOYEE_FIELDS, EMPLOYEE_RELATIONS),
      REL('account', 'Account', ACCOUNT_FIELDS),
      REL('contact', 'Contact', CONTACT_FIELDS),
    ],
  },

  tasks: {
    key: 'tasks', label: 'Tasks', model: 'task', category: 'productivity', icon: 'CheckSquare',
    description: 'One row per task assigned to a team member.',
    dateField: 'created_at', ownerField: 'assigned_to', titleField: 'title',
    fields: [
      F('title', 'Title', 'string', { group: false }),
      F('status', 'Status', 'enum', { options: ['open', 'in_progress', 'completed', 'cancelled'] }),
      F('priority', 'Priority', 'enum', { options: ['low', 'normal', 'high', 'urgent'] }),
      F('assigned_to', 'Assignee', 'string', { employee: true }),
      F('due_date', 'Due date', 'date'),
      F('completed_at', 'Completed on', 'date'),
      F('created_at', 'Created', 'date'),
    ],
    relations: [
      REL('assignee', 'Assignee', EMPLOYEE_FIELDS, EMPLOYEE_RELATIONS),
      REL('creator', 'Created by', EMPLOYEE_FIELDS, EMPLOYEE_RELATIONS),
    ],
  },

  activities: {
    key: 'activities', label: 'Activities', model: 'activity', category: 'productivity', icon: 'Activity',
    description: 'One row per logged call, email, meeting or note.',
    dateField: 'created_at', ownerField: 'employee_id', titleField: 'subject',
    fields: [
      F('type', 'Activity type', 'enum', { options: ['note', 'call', 'email', 'meeting', 'task', 'other'] }),
      F('subject', 'Subject', 'string', { group: false }),
      F('outcome', 'Outcome', 'string'),
      F('duration_min', 'Duration (minutes)', 'number', { agg: true }),
      F('employee_id', 'Employee', 'string', { employee: true }),
      F('scheduled_at', 'Scheduled for', 'date'),
      F('completed_at', 'Completed on', 'date'),
      F('created_at', 'Logged', 'date'),
    ],
    relations: [REL('employee', 'Employee', EMPLOYEE_FIELDS, EMPLOYEE_RELATIONS)],
  },

  sla: {
    key: 'sla', label: 'Service levels (SLA)', model: 'slaInstance', category: 'support', icon: 'Timer',
    description: 'One row per SLA timer — used to report on response and resolution targets.',
    dateField: 'started_at', ownerField: 'owner_id', titleField: 'metric',
    fields: [
      F('entity_type', 'Record type', 'enum', { options: ['case', 'lead', 'task'] }),
      F('metric', 'Target', 'enum', { options: ['first_response', 'resolution'] }),
      F('priority', 'Priority', 'string'),
      F('status', 'Status', 'enum', { options: ['running', 'paused', 'met', 'breached', 'canceled'] }),
      F('breached', 'Breached', 'boolean', { hint: 'The target was missed' }),
      F('owner_id', 'Owner', 'string', { employee: true }),
      F('started_at', 'Started', 'date'),
      F('due_at', 'Due', 'date'),
      F('completed_at', 'Completed', 'date'),
    ],
    relations: [
      REL('policy', 'SLA policy', [
        F('name', 'Name', 'string', { group: true }),
        F('entity_type', 'Applies to', 'enum', { options: ['case', 'lead', 'task'] }),
      ]),
    ],
  },
};

// ── Lookups ────────────────────────────────────────────────────────────────
//
// `getField` and `allFields` sit in hot paths (once per condition, measure, column
// and sort key on every run, and once per source on every builder load), and the
// registry is immutable, so both memoise. Keys are `source|fieldKey`.

const fieldCache = new Map();
const allFieldsCache = new Map();
const defaultFieldsCache = new Map();

const getSource = (key) => SOURCES[key] || null;

/** Own (non-dotted) field on a source. */
const getOwnField = (sourceKey, fieldKey) =>
  (SOURCES[sourceKey]?.fields || []).find((f) => f.key === fieldKey) || null;

/**
 * Compose the label for a related field.
 *
 * `primary` marks the field that *is* the related record's identity, so its own
 * label is dropped once the path is two or more hops deep — `agent.branch.branch_name`
 * reads "Agent ▸ Branch" rather than the unhelpful "Agent ▸ Branch ▸ Name". At a
 * single hop the leaf label is kept, so existing labels ("Owner ▸ Name") are unchanged.
 */
function composeLabel(relLabels, field) {
  const collapse = field.primary && relLabels.length >= 2;
  return [...relLabels, ...(collapse ? [] : [field.label])].join(' ▸ ');
}

/**
 * Resolve any field key on a source:
 *   `amount`                     → own scalar
 *   `owner.employee_name`        → one to-one hop
 *   `agent.branch.branch_name`   → two to-one hops
 *   `opportunities.$count`       → roll-up count
 *   `opportunities.amount`       → roll-up aggregate
 *
 * Related fields come back with `path` (the relation chain) and `leaf` so the engine
 * can build a nested `select`/`where`; roll-ups come back with `kind: 'rollup'` and
 * the descriptor needed to aggregate the child table separately.
 */
function getField(sourceKey, fieldKey) {
  if (!fieldKey) return null;
  const cacheKey = `${sourceKey}|${fieldKey}`;
  if (fieldCache.has(cacheKey)) return fieldCache.get(cacheKey);
  const resolved = resolveField(sourceKey, fieldKey);
  fieldCache.set(cacheKey, resolved);
  return resolved;
}

function resolveField(sourceKey, fieldKey) {
  const source = SOURCES[sourceKey];
  if (!source) return null;

  const parts = String(fieldKey).split('.');
  if (parts.length === 1) {
    const own = getOwnField(sourceKey, fieldKey);
    return own ? { ...own, kind: 'own' } : null;
  }

  // ── Roll-up? Matched first: a roll-up `via` is a collection, never a to-one hop.
  const rollup = (source.rollups || []).find((r) => r.via === parts[0]);
  if (rollup && parts.length === 2) {
    const leaf = parts[1];
    if (leaf === '$count') {
      return {
        key: fieldKey,
        label: `${rollup.label} ▸ Number of`,
        type: 'number',
        kind: 'rollup',
        agg: true,
        group: false,
        filterable: false,
        rollup: 'count',
        via: rollup.via,
        leaf: '$count',
        relation_label: rollup.label,
        source: rollup,
      };
    }
    const f = rollup.fields.find((x) => x.key === leaf);
    if (!f) return null;
    return {
      ...f,
      key: fieldKey,
      label: `${rollup.label} ▸ ${f.label}`,
      kind: 'rollup',
      agg: true,
      group: false,
      filterable: false,
      via: rollup.via,
      leaf,
      relation_label: rollup.label,
      source: rollup,
    };
  }

  // ── Otherwise walk the to-one relation chain.
  const path = [];
  const relLabels = [];
  let level = source;
  for (let i = 0; i < parts.length - 1; i += 1) {
    if (i >= MAX_RELATION_HOPS) return null;
    const rel = (level.relations || []).find((r) => r.via === parts[i]);
    if (!rel) return null;
    path.push(rel.via);
    relLabels.push(rel.label);
    level = rel;
  }
  const leaf = parts[parts.length - 1];
  const f = (level.fields || []).find((x) => x.key === leaf);
  if (!f) return null;

  return {
    ...f,
    key: parts.join('.'),
    label: composeLabel(relLabels, f),
    kind: 'related',
    related: true,
    path,
    via: path[0],
    leaf,
    relation_label: relLabels.join(' ▸ '),
  };
}

/**
 * Every field a user may pick on a source: own fields, then each related path
 * (breadth-first so shallower, more useful paths sort first), then roll-ups.
 * `hidden` fields are resolvable but excluded unless explicitly asked for.
 */
function allFields(sourceKey, { includeHidden = false } = {}) {
  const cacheKey = `${sourceKey}|${includeHidden}`;
  if (allFieldsCache.has(cacheKey)) return allFieldsCache.get(cacheKey);

  const source = SOURCES[sourceKey];
  if (!source) return [];

  const out = source.fields.map((f) => ({ ...f, kind: 'own', group: f.group !== false }));

  // Breadth-first over the relation tree, so depth-1 paths come before depth-2.
  let frontier = (source.relations || []).map((rel) => ({ rel, path: [rel.via], labels: [rel.label] }));
  for (let hop = 0; hop < MAX_RELATION_HOPS && frontier.length; hop += 1) {
    const next = [];
    for (const node of frontier) {
      for (const f of node.rel.fields) {
        out.push({
          ...f,
          key: [...node.path, f.key].join('.'),
          label: composeLabel(node.labels, f),
          kind: 'related',
          related: true,
          group: f.group !== false,
          path: node.path,
          via: node.path[0],
          leaf: f.key,
          relation_label: node.labels.join(' ▸ '),
        });
      }
      for (const child of node.rel.relations || []) {
        next.push({ rel: child, path: [...node.path, child.via], labels: [...node.labels, child.label] });
      }
    }
    frontier = next;
  }

  for (const rollup of source.rollups || []) {
    out.push(getField(sourceKey, `${rollup.via}.$count`));
    for (const f of rollup.fields) out.push(getField(sourceKey, `${rollup.via}.${f.key}`));
  }

  const result = out.filter(Boolean).filter((f) => includeHidden || !f.hidden);
  allFieldsCache.set(cacheKey, result);
  return result;
}

/**
 * The Prisma `select` tree for whichever to-one relations the given field keys
 * touch. Paths are merged, so `owner.employee_name` and `owner.branch.branch_name`
 * produce one nested `owner` select rather than two. Roll-up and own fields are
 * ignored — roll-ups are read by their own aggregate query.
 */
function relationSelect(sourceKey, fieldKeys) {
  const root = {};
  for (const key of fieldKeys) {
    const f = getField(sourceKey, key);
    if (f?.kind !== 'related') continue;
    let node = root;
    for (const hop of f.path) {
      node[hop] ||= { select: {} };
      node = node[hop].select;
    }
    node[f.leaf] = true;
  }
  return Object.keys(root).length ? root : null;
}

/**
 * The columns a table report shows when its author has not picked any, and the
 * columns a drill-down lists.
 *
 * Defined here rather than inside the engine so the builder can pre-tick exactly
 * what the report will render. Keeping the two definitions apart is what produced
 * the mismatch this replaces: the preview showed eight columns while "Which
 * columns?" showed nothing checked.
 */
function defaultFields(sourceKey) {
  const cached = defaultFieldsCache.get(sourceKey);
  if (cached) return cached;
  const source = SOURCES[sourceKey];
  if (!source) return [];
  // Declaration order in each source is already curated identity-first, so it is the
  // column order. Note this deliberately does NOT filter on `group` — groupability
  // says whether a field makes a sensible *dimension*, which has nothing to do with
  // whether it is worth showing as a column. Filtering on it dropped every free-text
  // field, so a leads table listed last_name and no first_name.
  const titleField = source.fields.find((f) => f.key === source.titleField && !f.hidden);
  const ordered = titleField
    ? [titleField, ...source.fields.filter((f) => f !== titleField)]
    : [...source.fields];
  const fields = ordered
    .filter((f) => !f.hidden)
    .slice(0, DEFAULT_COLUMN_COUNT)
    .map((f) => ({ ...f, kind: 'own' }));
  defaultFieldsCache.set(sourceKey, fields);
  return fields;
}

/** Just the keys, for seeding `config.columns` in the builder. */
const defaultColumns = (sourceKey) => defaultFields(sourceKey).map((f) => f.key);

/** The roll-up descriptors a set of field keys needs, grouped by collection. */
function rollupsFor(sourceKey, fieldKeys) {
  const needed = new Map();
  for (const key of fieldKeys) {
    const f = getField(sourceKey, key);
    if (f?.kind !== 'rollup') continue;
    const entry = needed.get(f.via) || { spec: f.source, fields: [] };
    entry.fields.push(f);
    needed.set(f.via, entry);
  }
  return needed;
}

module.exports = {
  SOURCES,
  MAX_RELATION_HOPS,
  DEFAULT_COLUMN_COUNT,
  getSource,
  getField,
  getOwnField,
  allFields,
  defaultFields,
  defaultColumns,
  relationSelect,
  rollupsFor,
};
