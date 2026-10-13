'use strict';

const {
  SOURCES, getSource, getField, allFields, defaultFields, defaultColumns, relationSelect, rollupsFor,
} = require('./report-registry');
const { ValidationError } = require('../utils/errors');
const CurrencyService = require('./currency.service');
const { computeInsights } = require('./report-insights');

const FETCH_CAP = 20000;
const DRILLDOWN_CAP = 500;
const DISTINCT_CAP = 200;
/** Parent ids per roll-up `groupBy`, to keep the `IN` list sane. */
const ROLLUP_ID_CHUNK = 1000;

/** Aggregations a business user can pick from the "Measure" dropdown. */
const AGGREGATIONS = [
  { key: 'count',          label: 'Number of records', needs_field: false },
  { key: 'sum',            label: 'Sum of',            needs_field: true, numeric: true },
  { key: 'avg',            label: 'Average of',        needs_field: true, numeric: true },
  { key: 'min',            label: 'Smallest',          needs_field: true, numeric: true },
  { key: 'max',            label: 'Largest',           needs_field: true, numeric: true },
  { key: 'count_distinct', label: 'Distinct count of', needs_field: true },
];

/**
 * Formula operations. Deliberately a fixed, dropdown-driven list — there is no
 * expression parser and nothing is ever `eval`d, so a non-technical author
 * cannot write anything unsafe or syntactically broken.
 */
const FORMULA_OPS = [
  { key: 'add',              label: 'A plus B',                symbol: '+',  result: 'same' },
  { key: 'subtract',         label: 'A minus B',               symbol: '−',  result: 'same' },
  { key: 'multiply',         label: 'A times B',               symbol: '×',  result: 'same' },
  { key: 'divide',           label: 'A divided by B',          symbol: '÷',  result: 'number' },
  { key: 'percent_of',       label: 'A as a % of B',           symbol: '%',  result: 'percent' },
  { key: 'percent_of_total', label: 'A as a % of the total',   symbol: '%',  result: 'percent' },
  { key: 'difference_pct',   label: 'A vs B, % change',        symbol: 'Δ%', result: 'percent' },
];

/** Relative date windows offered in the filter UI ("Date range" operator). */
const DATE_PRESETS = [
  { key: 'today',            label: 'Today' },
  { key: 'yesterday',        label: 'Yesterday' },
  { key: 'last_7_days',      label: 'Last 7 days' },
  { key: 'last_30_days',     label: 'Last 30 days' },
  { key: 'last_90_days',     label: 'Last 90 days' },
  { key: 'this_week',        label: 'This week' },
  { key: 'last_week',        label: 'Last week' },
  { key: 'this_month',       label: 'This month' },
  { key: 'last_month',       label: 'Last month' },
  { key: 'this_quarter',     label: 'This quarter' },
  { key: 'last_quarter',     label: 'Last quarter' },
  { key: 'this_year',        label: 'This year' },
  { key: 'last_year',        label: 'Last year' },
  { key: 'month_to_date',    label: 'Month to date' },
  { key: 'quarter_to_date',  label: 'Quarter to date' },
  { key: 'year_to_date',     label: 'Year to date' },
  { key: 'last_12_months',   label: 'Last 12 months' },
  { key: 'this_fiscal_year', label: 'This fiscal year',  fiscal: true },
  { key: 'last_fiscal_year', label: 'Last fiscal year',  fiscal: true },
  { key: 'fiscal_year_to_date', label: 'Fiscal year to date', fiscal: true },
  { key: 'next_30_days',     label: 'Next 30 days' },
  { key: 'next_90_days',     label: 'Next 90 days' },
];

/**
 * Table calculations — "show this measure as…". Each is a post-aggregation pass
 * over the sorted result, so the base aggregation is unchanged and the author
 * picks the calculation from a dropdown exactly as they pick the aggregation.
 * With two groupings the calculation runs along the first grouping inside each
 * value of the second, which is what a stacked or multi-line chart expects.
 */
const CALCULATIONS = [
  { key: '',                 label: 'Plain value' },
  { key: 'running_total',    label: 'Running total',          suffix: 'running total',   result: 'same' },
  { key: 'percent_of_total', label: '% of total',             suffix: '% of total',      result: 'percent' },
  { key: 'rank',             label: 'Rank (1 = largest)',     suffix: 'rank',            result: 'number' },
  { key: 'difference',       label: 'Change from previous',   suffix: 'change',          result: 'same' },
  { key: 'percent_change',   label: '% change from previous', suffix: '% change',        result: 'percent' },
  { key: 'moving_avg',       label: 'Moving average (3)',     suffix: '3-period average', result: 'same', window: 3 },
];

/** Filter operators, with the plain-English wording the UI shows. */
const OPERATORS = [
  { key: 'equals',       label: 'is',                  types: '*' },
  { key: 'not_equals',   label: 'is not',              types: '*' },
  { key: 'in',           label: 'is any of',           types: 'string,enum', multi: true },
  { key: 'not_in',       label: 'is none of',          types: 'string,enum', multi: true },
  { key: 'contains',     label: 'contains',            types: 'string' },
  { key: 'starts_with',  label: 'starts with',         types: 'string' },
  { key: 'gt',           label: 'is greater than',     types: 'number,currency,percent,date' },
  { key: 'gte',          label: 'is at least',         types: 'number,currency,percent,date' },
  { key: 'lt',           label: 'is less than',        types: 'number,currency,percent,date' },
  { key: 'lte',          label: 'is at most',          types: 'number,currency,percent,date' },
  { key: 'between',      label: 'is between',          types: 'number,currency,percent,date', pair: true },
  { key: 'is_empty',     label: 'is empty',            types: '*', no_value: true },
  { key: 'is_not_empty', label: 'is not empty',        types: '*', no_value: true },
  { key: 'date_range',   label: 'is within',           types: 'date', preset: true },
];

/**
 * ReportService — the configurable report engine behind /api/reports.
 *
 * A report config is fully declarative and is produced entirely by dropdowns in
 * the report builder — no SQL, no code, no field names typed by hand:
 *
 *   {
 *     source:   'opportunities',
 *     viz:      'table' | 'bar' | 'line' | 'area' | 'pie' | 'donut' | 'kpi' | 'pivot' | 'funnel',
 *     columns:  ['name', 'amount', { key:'f0', label:'…', formula:{…} }],   // table mode
 *     filters:  { logic:'AND', conditions:[ {field,op,value} | {logic,conditions:[…]} ] },
 *     group_by: [{ field, period?, buckets? }],                             // 0–2 dimensions
 *     metrics:  [{ agg, field?, label? } | { agg:'formula', formula:{op,a,b} }],
 *     totals:   true,          // subtotals per first dimension + a grand total
 *     compare:  'previous_period' | 'previous_year',
 *     sort:     [{ key, dir }],
 *     limit:    number,
 *   }
 *
 * run() selects only the columns the config touches (tenant-scoped by the Prisma
 * extension), then groups/aggregates or projects in application code so every
 * source behaves identically — including date bucketing, custom buckets,
 * multi-dimension pivots, formulas, totals and period-over-period comparison.
 */
class ReportService {
  constructor(prisma) {
    this.db = prisma;
  }

  // ── Registry surface (drives every dropdown in the builder) ───────────────

  getSources() {
    return Object.values(SOURCES).map((s) => ({
      key: s.key,
      label: s.label,
      description: s.description,
      category: s.category,
      icon: s.icon,
      dateField: s.dateField,
      ownerField: s.ownerField,
      fields: allFields(s.key).map(publicField),
      // Lets the builder tick the columns a table report shows by default, instead
      // of leaving the picker empty while the preview renders them.
      default_columns: defaultColumns(s.key),
      relations: (s.relations || []).map((r) => ({ via: r.via, label: r.label })),
      rollups: (s.rollups || []).map((r) => ({ via: r.via, label: r.label })),
    }));
  }

  getVocabulary() {
    return {
      aggregations: AGGREGATIONS,
      formula_ops: FORMULA_OPS,
      calculations: CALCULATIONS,
      operators: OPERATORS,
      date_presets: DATE_PRESETS,
      periods: [
        { key: '', label: 'Exact value' },
        { key: 'day', label: 'By day' },
        { key: 'week', label: 'By week' },
        { key: 'month', label: 'By month' },
        { key: 'quarter', label: 'By quarter' },
        { key: 'year', label: 'By year' },
      ],
      compare: [
        { key: '', label: 'No comparison' },
        { key: 'previous_period', label: 'vs the previous period' },
        { key: 'previous_year', label: 'vs the same period last year' },
      ],
    };
  }

  /**
   * Distinct values actually present for a field, so the filter UI can offer a
   * pick-list instead of asking the user to type a value. Only for own scalar
   * fields without a fixed option list.
   */
  async getFieldValues(sourceKey, fieldKey) {
    const source = getSource(sourceKey);
    if (!source) throw new ValidationError(`Unknown report source "${sourceKey}"`);
    const field = getField(sourceKey, fieldKey);
    if (!field) throw new ValidationError(`Unknown field "${fieldKey}"`);
    if (field.options) return field.options;
    if (field.kind !== 'own') return []; // related / roll-up values are not enumerated
    if (['date', 'boolean'].includes(field.type)) return [];

    // `groupBy` deduplicates in the database. `findMany({ distinct })` would take
    // the first DISTINCT_CAP *rows* and only then dedupe them, so a field with one
    // dominant value (200 leads all sourced from "web") would offer a pick-list of
    // one entry. Tenant scoping applies to groupBy exactly as it does to findMany.
    const rows = await this.db[source.model].groupBy({
      by: [fieldKey],
      take: DISTINCT_CAP,
      orderBy: { [fieldKey]: 'asc' },
    });
    return rows.map((r) => r[fieldKey]).filter((v) => v !== null && v !== undefined && v !== '');
  }

  // ── Execution ────────────────────────────────────────────────────────────

  /**
   * @param config  report config (see class comment)
   * @param ctx     { scope, employeeId, teamIds,              — visibility (resolveScope)
   *                  params?:  { [paramKey]: value },          — answers to prompted filters
   *                  global?:  { date_range?, owner? },        — dashboard-level filters
   *                  fiscal_year_start_month?: 1–12 }          — for fiscal presets
   */
  async run(config, ctx = {}) {
    const started = Date.now();
    const source = getSource(config.source);
    if (!source) throw new ValidationError(`Unknown report source "${config.source}"`);

    const warnings = [];
    const dateOpts = { fiscalStart: fiscalStartMonth(ctx.fiscal_year_start_month) };
    const parameters = describeParameters(source, normalizeFilters(config.filters), ctx.params, dateOpts);
    let filterTree = applyParameters(normalizeFilters(config.filters), ctx.params);
    filterTree = applyGlobalFilters(source, filterTree, ctx.global, warnings);
    const where = this.#buildWhere(source, filterTree, warnings, dateOpts);
    this.#applyScope(where, source, ctx);

    const select = this.#buildSelect(source, config);
    const rows = await this.db[source.model].findMany({ where, select, take: FETCH_CAP });
    const capped = rows.length >= FETCH_CAP;
    if (capped) {
      warnings.push(`Only the first ${FETCH_CAP.toLocaleString()} records were included. Add a filter (for example a date range) to narrow the report.`);
    }

    // Roll-ups are folded in before aggregation, shaped exactly like a to-one
    // relation, so grouping / measures / formulas / totals need no special case.
    await this.#attachRollups(source, rows, config, warnings);

    const grouped = this.#isGrouped(config);
    const out = grouped
      ? this.#aggregate(source, rows, config)
      : this.#project(source, rows, config);

    // Period-over-period comparison re-runs the same shape over the prior window.
    let comparison = null;
    if (config.compare && grouped) {
      comparison = await this.#runComparison(source, config, filterTree, ctx, out, warnings, dateOpts);
    }

    const result = {
      columns: out.columns,
      rows: out.rows,
      summary: out.summary ?? null,
      comparison,
      insights: [],
      meta: {
        source: source.key,
        source_label: source.label,
        row_count: out.rows.length,
        scanned: rows.length,
        capped,
        warnings,
        viz: config.viz || 'table',
        grouped,
        drilldown: grouped && (config.group_by?.length || 0) > 0,
        parameters,
        global: ctx.global && Object.keys(ctx.global).length ? ctx.global : null,
        executed_ms: Date.now() - started,
        generated_at: new Date().toISOString(),
      },
    };
    // Plain-statistics narration (leaders, outliers, trend, movers). Never an LLM:
    // these are computed from the numbers above and are therefore always right.
    if (config.insights !== false) result.insights = computeInsights(result, config);
    return result;
  }

  /**
   * The records behind one cell/bar of a grouped report. `keys` maps each
   * grouping field to the bucket label the user clicked, so the same bucketing
   * rules are replayed as equality/range filters.
   */
  async runDrilldown(config, keys = {}, ctx = {}) {
    const source = getSource(config.source);
    if (!source) throw new ValidationError(`Unknown report source "${config.source}"`);

    const dateOpts = { fiscalStart: fiscalStartMonth(ctx.fiscal_year_start_month) };
    let tree = applyParameters(normalizeFilters(config.filters), ctx.params);
    tree = applyGlobalFilters(source, tree, ctx.global, []);
    const where = this.#buildWhere(source, tree, [], dateOpts);
    this.#applyScope(where, source, ctx);

    const groupDefs = this.#groupDefs(source, config);
    const extra = [];
    for (const g of groupDefs) {
      const wanted = keys[g.field.key];
      if (wanted === undefined || wanted === null) continue;
      const clause = this.#bucketToWhere(g, wanted);
      if (clause) extra.push(clause);
    }
    const finalWhere = extra.length ? { AND: [where, ...extra] } : where;

    const detailFields = this.#detailFields(source);
    const select = { id: true, ...Object.fromEntries(detailFields.filter((f) => f.kind !== 'related').map((f) => [f.key, true])) };
    const relSelect = relationSelect(source.key, detailFields.map((f) => f.key));
    const rows = await this.db[source.model].findMany({
      where: finalWhere,
      select: { ...select, ...(relSelect || {}) },
      take: DRILLDOWN_CAP,
      orderBy: { id: 'desc' },
    });

    return {
      columns: [
        { key: 'id', label: 'ID', type: 'number' },
        ...detailFields.map((f) => ({ key: f.key, label: f.label, type: f.type })),
      ],
      rows: rows.map((r) => {
        const o = { id: r.id };
        for (const f of detailFields) o[f.key] = coerce(readPath(r, f.key), f.type);
        return o;
      }),
      meta: { source: source.key, capped: rows.length >= DRILLDOWN_CAP, keys },
    };
  }

  // ── Query building ───────────────────────────────────────────────────────

  #isGrouped(config) {
    if ((config.group_by?.length || 0) > 0) return true;
    const viz = config.viz || 'table';
    return viz !== 'table' && (config.metrics?.length || 0) > 0;
  }

  /** Only pull the columns the config actually reads — not whole rows. */
  #buildSelect(source, config) {
    const keys = new Set(this.#referencedFields(source, config));

    // `id` is always needed and is deliberately not a registry field: drill-down
    // returns it, roll-ups key their child aggregates on it, and table mode stamps
    // it as `__id`. It must therefore be added outside the registry-driven filter.
    const select = { id: true };
    for (const key of keys) {
      if (getField(source.key, key)?.kind === 'own') select[key] = true;
    }
    // To-one paths become one merged nested select; roll-ups select nothing here —
    // they are read by their own aggregate query.
    const rel = relationSelect(source.key, [...keys]);
    return { ...select, ...(rel || {}) };
  }

  #referencedFields(source, config) {
    const out = new Set();
    const add = (k) => { if (k && getField(source.key, k)) out.add(k); };

    walkConditions(normalizeFilters(config.filters), (c) => add(c.field));
    for (const g of config.group_by || []) add(g.field);
    for (const m of config.metrics || []) {
      add(m.field);
      if (m.formula) { add(m.formula.a); add(m.formula.b); }
    }
    for (const c of config.columns || []) {
      if (typeof c === 'string') add(c);
      else if (c?.formula) { add(c.formula.a); add(c.formula.b); }
    }
    for (const s of config.sort || []) add(s.key);

    // Table mode with no explicit columns falls back to a sensible default set.
    if (!this.#isGrouped(config) && !(config.columns?.length)) {
      for (const f of this.#detailFields(source)) add(f.key);
    }
    return out;
  }

  /**
   * The default column set for table / drill-down output. Delegates to the registry
   * so the builder pre-ticks exactly these — see `defaultFields` for why.
   */
  #detailFields(source) {
    return defaultFields(source.key);
  }

  /**
   * Turn a filter tree into a Prisma where clause. Conditions become entries in
   * an `AND`/`OR` array — never `where[field] = …` — so two filters on the same
   * field combine correctly instead of one silently overwriting the other.
   */
  #buildWhere(source, node, warnings, dateOpts = {}) {
    const build = (n) => {
      if (!n) return null;
      if (n.conditions) {
        const parts = n.conditions.map(build).filter(Boolean);
        if (!parts.length) return null;
        if (parts.length === 1) return parts[0];
        return n.logic === 'OR' ? { OR: parts } : { AND: parts };
      }
      const field = getField(source.key, n.field);
      if (!field) {
        if (n.field) warnings.push(`Filter on "${n.field}" was ignored — that field is not available on this report.`);
        return null;
      }
      // An operator that does not apply to this field type can never produce a
      // clause, so the condition would be dropped and the report would quietly
      // include records the author believes they excluded. Say so instead.
      const operator = OPERATORS.find((o) => o.key === n.op);
      if (!operator || !(operator.types === '*' || operator.types.split(',').includes(field.type))) {
        warnings.push(
          `The condition on "${field.label}" was ignored — "${n.op}" is not a comparison that applies to this kind of field.`,
        );
        return null;
      }
      // Roll-ups are computed after the rows are fetched, so they cannot be part of
      // the query. Filtering on one would need a HAVING-style pass; say so rather
      // than silently ignoring the condition.
      if (field.kind === 'rollup') {
        warnings.push(
          `The condition on "${field.label}" was ignored — totals from related records cannot be used as a filter. Filter the report and compare the total instead.`,
        );
        return null;
      }
      const clause = this.#filterClause(field, n.op, n.value, dateOpts);
      // A missing value is the normal mid-edit state, so it stays silent.
      if (clause === undefined) return null;
      return nestClause(field, clause);
    };
    return build(node) || {};
  }

  #filterClause(field, op, value, dateOpts = {}) {
    const numeric = ['currency', 'number', 'percent'].includes(field.type);
    const cast = (v) => {
      if (numeric) { const n = Number(v); return Number.isNaN(n) ? undefined : n; }
      if (field.type === 'date') { const d = new Date(v); return Number.isNaN(d.getTime()) ? undefined : d; }
      if (field.type === 'boolean') return v === true || v === 'true';
      return v;
    };
    const list = (v) => (Array.isArray(v) ? v : String(v ?? '').split(',').map((x) => x.trim()).filter(Boolean));

    switch (op) {
      case 'equals':       return value === '' || value === undefined ? undefined : cast(value);
      case 'not_equals':   return value === '' || value === undefined ? undefined : { not: cast(value) };
      case 'in':           { const l = list(value).map(cast).filter((v) => v !== undefined); return l.length ? { in: l } : undefined; }
      case 'not_in':       { const l = list(value).map(cast).filter((v) => v !== undefined); return l.length ? { notIn: l } : undefined; }
      case 'contains':     return value ? { contains: String(value) } : undefined;
      case 'starts_with':  return value ? { startsWith: String(value) } : undefined;
      case 'gt':           return orUndef(cast(value), (v) => ({ gt: v }));
      case 'gte':          return orUndef(cast(value), (v) => ({ gte: v }));
      case 'lt':           return orUndef(cast(value), (v) => ({ lt: v }));
      case 'lte':          return orUndef(cast(value), (v) => ({ lte: v }));
      case 'between':      {
        if (!Array.isArray(value)) return undefined;
        // A date window is resolved the same way "is within" resolves an explicit
        // [from, to] pair, so the last day is included in full instead of only its
        // first instant — "between the 1st and the 31st" must not drop the 31st.
        if (field.type === 'date') { const w = resolveWindow(value, dateOpts); return w ? { gte: w.gte, lt: w.lt } : undefined; }
        const [a, b] = [cast(value[0]), cast(value[1])];
        if (a === undefined || b === undefined) return undefined;
        return { gte: a, lte: b };
      }
      case 'is_empty':     return null;
      case 'is_not_empty': return { not: null };
      case 'date_range':   { const w = resolveWindow(value, dateOpts); return w ? { gte: w.gte, lt: w.lt } : undefined; }
      default:             return undefined;
    }
  }

  /**
   * Narrow the query to the rows the caller may see.
   *
   * Two things matter here and both are security-relevant:
   *
   *   • the clause is ANDed onto the where rather than assigned to
   *     `where[ownerField]`, so a user filter on the owner field cannot be
   *     silently overwritten (nor overwrite the scope);
   *   • anything other than `all` fails *closed*. A team scope with an empty
   *     hierarchy closure means "just me", never "everyone".
   */
  #applyScope(where, source, { scope = 'all', employeeId, teamIds } = {}) {
    if (!source.ownerField || scope === 'all') return;
    const owners = scope === 'team' && teamIds?.length
      ? [...new Set([...teamIds, ...(employeeId ? [employeeId] : [])])]
      : (employeeId ? [employeeId] : []);
    const clause = { [source.ownerField]: { in: owners } };
    where.AND = [...(Array.isArray(where.AND) ? where.AND : where.AND ? [where.AND] : []), clause];
  }

  /**
   * Fold parent→children aggregates onto each fetched row.
   *
   * This is the "join between two tables" a user asks for, done the way it has to
   * be done to keep the numbers right: **one `groupBy` on the child table**, keyed
   * by the foreign key, and the result attached to the parent row. There is no
   * join, so there is no fan-out — an account with three deals still contributes its
   * annual revenue exactly once, which an `accounts ⋈ opportunities` join could not
   * guarantee.
   *
   * The values are attached under the collection name (`row.opportunities.amount`), so
   * to everything downstream a roll-up is indistinguishable from a to-one relation
   * and `readPath` reads it unchanged.
   */
  async #attachRollups(source, rows, config, warnings) {
    if (!rows.length) return;
    const needed = rollupsFor(source.key, [...this.#referencedFields(source, config)]);
    if (!needed.size) return;

    const ids = rows.map((r) => r.id).filter((id) => id !== null && id !== undefined);
    if (!ids.length) return;

    for (const [via, { spec, fields }] of needed) {
      const delegate = this.db[spec.model];
      if (!delegate?.groupBy) {
        warnings.push(`"${spec.label}" totals are unavailable on this deployment.`);
        continue;
      }

      // Aggregates are grouped per operation; `$count` is always cheap to include.
      const byOp = { _sum: {}, _avg: {}, _min: {}, _max: {} };
      let wantCount = false;
      for (const f of fields) {
        if (f.leaf === '$count') { wantCount = true; continue; }
        const key = `_${f.rollup || 'sum'}`;
        if (byOp[key]) byOp[key][f.leaf] = true;
      }
      const aggregates = Object.fromEntries(
        Object.entries(byOp).filter(([, v]) => Object.keys(v).length > 0),
      );
      if (wantCount || !Object.keys(aggregates).length) aggregates._count = { _all: true };

      // Chunk the id list: a single `IN` of up to FETCH_CAP values is needlessly
      // hostile to the planner, and some drivers cap placeholders outright.
      const index = new Map();
      for (let i = 0; i < ids.length; i += ROLLUP_ID_CHUNK) {
        const chunk = ids.slice(i, i + ROLLUP_ID_CHUNK);
        // eslint-disable-next-line no-await-in-loop -- chunks are sequential by design
        const groups = await delegate.groupBy({
          by: [spec.fk],
          where: { [spec.fk]: { in: chunk } },
          ...aggregates,
        });
        for (const g of groups) index.set(g[spec.fk], g);
      }

      for (const row of rows) {
        const g = index.get(row.id);
        const bucket = { $count: g?._count?._all ?? 0 };
        for (const f of fields) {
          if (f.leaf === '$count') continue;
          const opKey = `_${f.rollup || 'sum'}`;
          // No child rows is a real zero for a sum/count, but genuinely unknown for
          // an average, minimum or maximum — those stay null so they are not averaged in.
          const raw = g?.[opKey]?.[f.leaf];
          bucket[f.leaf] = raw === null || raw === undefined
            ? (f.rollup === 'sum' || !f.rollup ? 0 : null)
            : Number(raw);
        }
        row[via] = bucket;
      }
    }
  }

  // ── Projection (table mode) ──────────────────────────────────────────────

  #project(source, rows, config) {
    const specs = (config.columns?.length ? config.columns : this.#detailFields(source).map((f) => f.key));
    const cols = [];
    for (const [i, spec] of specs.entries()) {
      if (typeof spec === 'string') {
        const f = getField(source.key, spec);
        if (f) cols.push({ key: f.key, label: f.label, type: f.type, field: f });
      } else if (spec?.formula) {
        const type = formulaType(spec.formula, (k) => getField(source.key, k)?.type);
        cols.push({ key: spec.key || `f${i}`, label: spec.label || formulaLabel(spec.formula, (k) => getField(source.key, k)?.label), type, formula: spec.formula });
      }
    }

    let out = rows.map((r) => {
      const o = { __id: r.id };
      for (const c of cols) {
        o[c.key] = c.formula
          ? applyFormula(c.formula, (ref) => Number(readPath(r, ref) ?? 0), null)
          : coerce(readPath(r, c.key), c.type);
      }
      return o;
    });

    out = sortRows(out, config.sort, cols);
    // Totals are computed over every matching row, then the row limit is applied:
    // a "Total" that silently covered only the visible page would be wrong.
    const grand = config.totals ? this.#numericTotals(cols, out) : null;
    const hidden = config.limit && out.length > config.limit ? out.length - config.limit : 0;
    if (config.limit) out = out.slice(0, config.limit);

    const summary = config.totals ? { grand, subtotals: [], hidden_rows: hidden } : null;
    return { columns: cols.map(publicCol), rows: out, summary };
  }

  /** Sum the numeric columns of a table-mode report for the grand-total row. */
  #numericTotals(cols, rows) {
    const grand = {};
    for (const c of cols) {
      if (!['currency', 'number', 'percent'].includes(c.type)) continue;
      grand[c.key] = round(rows.reduce((a, r) => a + (Number(r[c.key]) || 0), 0));
    }
    return grand;
  }

  // ── Aggregation (chart / pivot / kpi / summary) ──────────────────────────

  #groupDefs(source, config) {
    return (config.group_by || [])
      .map((g) => ({ ...g, field: getField(source.key, g.field) }))
      .filter((g) => g.field);
  }

  #aggregate(source, rows, config) {
    const groupDefs = this.#groupDefs(source, config);
    const metrics = config.metrics?.length ? config.metrics : [{ agg: 'count', label: 'Number of records' }];

    // Bucket the rows by the (possibly period-bucketed / custom-bucketed) dims.
    const buckets = new Map();
    for (const r of rows) {
      const parts = groupDefs.map((g) => bucketValue(g, readPath(r, g.field.key)));
      const key = parts.join(' ▸ ');
      if (!buckets.has(key)) buckets.set(key, { parts, rows: [] });
      buckets.get(key).rows.push(r);
    }
    if (groupDefs.length === 0) buckets.set('', { parts: [], rows });

    const metricCols = metrics.map((m, i) => {
      const isFormula = m.agg === 'formula' || !!m.formula;
      const baseType = isFormula
        ? formulaType(m.formula, (ref) => metricRefType(ref, metrics, source))
        : metricType(m, source);
      const baseLabel = isFormula ? formulaLabel(m.formula, (ref) => metricRefLabel(ref, metrics, source)) : metricLabel(m, source);
      const calc = CALCULATIONS.find((c) => c.key && c.key === m.calc) || null;
      return {
        key: `m${i}`,
        label: m.label || (calc ? `${baseLabel} (${calc.suffix})` : baseLabel),
        type: calc ? calcType(calc, baseType) : baseType,
        spec: m,
        formula: isFormula ? m.formula : null,
        calc,
      };
    });

    const plainCols = metricCols.filter((c) => !c.formula);
    const bucketList = [...buckets.values()];

    // Pass 1 — plain aggregations, and the column totals formulas may reference.
    const raw = bucketList.map((b) => {
      const o = { __rows: b.rows.length, __ids: b.rows.slice(0, 50).map((r) => r.id) };
      groupDefs.forEach((g, i) => { o[g.field.key] = b.parts[i]; });
      for (const c of plainCols) {
        o[c.key] = computeMetric(b.rows, c.spec);
        // An average must be re-weighted by how many values it actually averaged
        // (rows with no value are not zeroes), so record that count alongside it.
        if (c.spec?.agg === 'avg') o[`${c.key}__n`] = numericCount(b.rows, c.spec.field);
      }
      return o;
    });
    const columnTotals = {};
    for (const c of plainCols) columnTotals[c.key] = raw.reduce((a, r) => a + (Number(r[c.key]) || 0), 0);

    // Pass 2 — formula metrics, which may reference plain metrics or a constant.
    for (const row of raw) {
      for (const c of metricCols) {
        if (!c.formula) continue;
        row[c.key] = applyFormula(
          c.formula,
          (ref) => Number(row[ref] ?? 0),
          (ref) => Number(columnTotals[ref] ?? 0),
        );
      }
    }

    const groupCols = groupDefs.map((g) => ({
      key: g.field.key,
      label: g.period ? `${g.field.label} (${periodLabel(g.period)})` : g.field.label,
      type: g.period || g.buckets?.length ? 'string' : g.field.type,
      dimension: true,
    }));

    let out = sortRows(raw, config.sort?.length ? config.sort : [{ key: metricCols[0].key, dir: 'desc' }], metricCols);
    // Date-bucketed dimensions read chronologically unless the user sorted, with
    // the "no value" bucket last so it never leads a time series.
    if (!config.sort?.length && groupDefs[0]?.period) {
      const dimKey = groupDefs[0].field.key;
      out = [...out].sort((a, b) => {
        const av = String(a[dimKey]), bv = String(b[dimKey]);
        if (av === '—') return 1;
        if (bv === '—') return -1;
        return av.localeCompare(bv);
      });
    }

    // "Show as" calculations run over the *sorted* full result, before any limit,
    // so a running total or rank is not truncated into nonsense.
    const grand = config.totals ? grandTotals(metricCols, out, columnTotals, rows.length) : null;
    out = applyCalculations(out, metricCols, groupDefs.map((g) => g.field.key));

    const truncated = config.limit && out.length > config.limit;
    const shown = truncated ? out.slice(0, config.limit) : out;

    const summary = config.totals
      ? {
          grand: calcGrand(metricCols, grand),
          subtotals: groupDefs.length === 2 ? subtotals(groupDefs, metricCols, out) : [],
          hidden_rows: truncated ? out.length - shown.length : 0,
        }
      : null;

    return {
      columns: [...groupCols, ...metricCols.map(publicCol)],
      rows: shown,
      summary,
    };
  }

  /**
   * Re-run the report over the preceding window and pair each bucket with its
   * prior value, so KPI tiles, tables and charts can show a delta.
   *
   * Two things make this work on real reports:
   *
   *   • **The window can come from the grouping, not just a filter.** A report
   *     grouped "by month" already states its period, so requiring an explicit date
   *     filter as well would reject the most common trend report there is.
   *   • **Date bucket labels are realigned before joining.** The prior window
   *     produces labels in its own period ("2025-03"), which would never match the
   *     current rows ("2026-03"). Prior labels are therefore shifted forward by the
   *     comparison offset so they land in the current label space.
   */
  async #runComparison(source, config, filterTree, ctx, current, warnings, dateOpts = {}) {
    const spec = this.#compareSpec(source, config, filterTree, current, warnings, dateOpts);
    if (!spec) return null;

    const { priorTree, shift, priorWindow } = spec;
    const where = this.#buildWhere(source, priorTree, [], dateOpts);
    this.#applyScope(where, source, ctx);

    const rows = await this.db[source.model].findMany({
      where, select: this.#buildSelect(source, config), take: FETCH_CAP,
    });
    const prev = this.#aggregate(source, rows, { ...config, compare: null, limit: null });

    // Align the prior rows onto the current label space, then join on dimensions.
    const groupDefs = this.#groupDefs(source, config);
    const dimKeys = current.columns.filter((c) => c.dimension).map((c) => c.key);
    const periodByKey = new Map(
      groupDefs.filter((g) => g.field.type === 'date' && g.period && !g.buckets?.length)
        .map((g) => [g.field.key, g.period]),
    );

    const index = new Map();
    for (const r of prev.rows) {
      const key = dimKeys.map((k) => {
        const period = periodByKey.get(k);
        return period ? shiftLabel(r[k], period, shift) : r[k];
      }).join(' ▸ ');
      index.set(key, r);
    }

    const metricKeys = current.columns.filter((c) => !c.dimension).map((c) => c.key);
    let matched = 0;

    const cmpRows = current.rows.map((r) => {
      const match = index.get(dimKeys.map((k) => r[k]).join(' ▸ '));
      if (match) matched += 1;
      const o = {};
      for (const k of metricKeys) {
        const now = Number(r[k]) || 0;
        // A bucket with no counterpart is *unknown*, not zero — leave it null so the
        // UI shows "—" instead of implying a 100% rise from nothing.
        const was = match ? Number(match[k]) || 0 : null;
        o[k] = was;
        o[`${k}__delta`] = was === null ? null : round(now - was);
        o[`${k}__delta_pct`] = was === null || was === 0 ? null : round(((now - was) / Math.abs(was)) * 100, 1);
      }
      return o;
    });

    // Nothing to compare against is a dead end, not a comparison: rendering a column
    // of "no earlier data" with no explanation just looks broken. Say why instead.
    if (matched === 0) {
      warnings.push(
        prev.rows.length === 0
          ? `There is no data in the ${spec.label.toLowerCase()} to compare against.`
          : `No rows in the ${spec.label.toLowerCase()} line up with this report, so no comparison is shown.`,
      );
      return null;
    }

    return {
      mode: config.compare,
      label: spec.label,
      window: priorWindow
        ? { from: priorWindow.gte.toISOString(), to: priorWindow.lt.toISOString() }
        : null,
      matched,
      rows: cmpRows,
      grand: prev.summary?.grand ?? null,
    };
  }

  /**
   * Work out what "the previous period" means for this config, and build the filter
   * tree for it. Returns null (after pushing a warning) when it cannot be decided.
   *
   * Preference order: an explicit date window in the filters, then the date grouping.
   */
  #compareSpec(source, config, filterTree, current, warnings, dateOpts = {}) {
    const mode = config.compare;
    const explicit = findDateWindowCondition(source, filterTree);

    // ── An explicit date window in the filters ────────────────────────────────
    if (explicit) {
      const window = resolveConditionWindow(explicit, dateOpts);
      if (!window) {
        warnings.push('Pick a period for the date filter so Genesis knows what to compare against.');
        return null;
      }
      const shift = mode === 'previous_year'
        ? { kind: 'year', n: 1 }
        : { kind: 'ms', ms: window.lt - window.gte };
      const priorWindow = shiftWindowBack(window, shift);
      return {
        label: mode === 'previous_year' ? 'Same period last year' : 'Previous period',
        shift,
        priorWindow,
        priorTree: replaceCondition(filterTree, explicit, betweenCondition(explicit.field, priorWindow)),
      };
    }

    // ── Otherwise, derive it from a date grouping ─────────────────────────────
    const groupDefs = this.#groupDefs(source, config);
    const dateGroup = groupDefs.find((g) => g.field.type === 'date' && g.period && !g.buckets?.length);
    if (!dateGroup) {
      warnings.push(
        'To compare periods, either group this report by a date (for example "by month") '
        + 'or add a date filter using "is within".',
      );
      return null;
    }

    const span = labelSpan(current.rows.map((r) => r[dateGroup.field.key]), dateGroup.period);
    if (!span) {
      warnings.push('There is not enough dated data in this report to compare periods.');
      return null;
    }

    const shift = mode === 'previous_year'
      ? { kind: 'year', n: 1 }
      : { kind: 'period', period: dateGroup.period, n: 1 };
    const priorWindow = shiftWindowBack(span, shift);

    return {
      label: mode === 'previous_year' ? 'Same period last year' : `Previous ${dateGroup.period}`,
      shift,
      priorWindow,
      // There was no date condition to replace, so AND one on for the prior window.
      // It must be a *restriction*: appending it to an `OR` group would instead make
      // it an alternative, and the prior period would pull in records the report's
      // own filters exclude.
      priorTree: {
        logic: 'AND',
        conditions: [filterTree, betweenCondition(dateGroup.field.key, priorWindow)],
      },
    };
  }

  /** Replay one grouping bucket as a Prisma where clause, for drill-down. */
  #bucketToWhere(groupDef, label) {
    const f = groupDef.field;
    const wrap = (clause) => nestClause(f, clause);

    if (groupDef.buckets?.length) {
      const b = groupDef.buckets.find((x) => x.label === label);
      if (!b) return null;
      if (Array.isArray(b.values)) return wrap({ in: b.values });
      const clause = {};
      if (b.min !== undefined && b.min !== null && b.min !== '') clause.gte = Number(b.min);
      if (b.max !== undefined && b.max !== null && b.max !== '') clause.lt = Number(b.max);
      return Object.keys(clause).length ? wrap(clause) : null;
    }

    if (f.type === 'date' && groupDef.period) {
      const w = periodWindow(label, groupDef.period);
      return w ? wrap({ gte: w.gte, lt: w.lt }) : null;
    }
    if (label === '—') return wrap(null);
    if (f.type === 'boolean') return wrap(label === 'Yes');
    if (['number', 'currency', 'percent'].includes(f.type)) return wrap(Number(label));
    return wrap(label);
  }

  // ── Export ───────────────────────────────────────────────────────────────

  toCsv({ columns, rows, summary }) {
    const esc = (v) => {
      if (v === null || v === undefined) return '';
      const s = String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const lines = [columns.map((c) => esc(c.label)).join(',')];
    for (const r of rows) lines.push(columns.map((c) => esc(r[c.key])).join(','));
    if (summary?.grand && Object.keys(summary.grand).length) {
      lines.push(columns.map((c, i) => esc(i === 0 ? 'Total' : summary.grand[c.key] ?? '')).join(','));
    }
    return lines.join('\n');
  }

  /** Excel workbook buffer, using the `xlsx` dependency already in the project. */
  toXlsx({ columns, rows, summary }, sheetName = 'Report') {
    // Required lazily so a missing optional dep can never break report *viewing*.
    const XLSX = require('xlsx');
    const header = columns.map((c) => c.label);
    const body = rows.map((r) => columns.map((c) => r[c.key] ?? null));
    if (summary?.grand && Object.keys(summary.grand).length) {
      body.push(columns.map((c, i) => (i === 0 ? 'Total' : summary.grand[c.key] ?? null)));
    }
    const ws = XLSX.utils.aoa_to_sheet([header, ...body]);
    ws['!cols'] = columns.map((c) => ({ wch: Math.max(12, Math.min(40, c.label.length + 4)) }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, sheetName.slice(0, 31) || 'Report');
    return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  }

  /**
   * Print-ready HTML for a report — used for the "Print / Save as PDF" action and
   * as the body of a scheduled email. Kept as HTML rather than pulling in a
   * headless-browser dependency: the browser's own print-to-PDF is faithful and
   * the same markup renders inline in an email client.
   */
  toHtml(result, { name, description, subtitle } = {}) {
    // Money follows the tenant's Localization settings; the profile comes from
    // the request (or scheduled-run) currency context, defaulting to USD.
    const money = CurrencyService.activeProfile();
    const fmt = (v, type) => {
      if (v === null || v === undefined || v === '') return '—';
      if (type === 'currency') return escapeHtml(money.format(v, { decimals: 0 }));
      if (type === 'percent') return `${Number(v).toLocaleString('en-US', { maximumFractionDigits: 1 })}%`;
      if (type === 'number') return Number(v).toLocaleString('en-US', { maximumFractionDigits: 2 });
      if (type === 'date') return new Date(v).toLocaleDateString('en-US');
      return escapeHtml(String(v).replace(/_/g, ' '));
    };
    const numeric = (t) => ['currency', 'number', 'percent'].includes(t);
    const { columns, rows, summary } = result;

    const head = columns.map((c) => `<th style="text-align:${numeric(c.type) ? 'right' : 'left'}">${escapeHtml(c.label)}</th>`).join('');
    const body = rows.map((r) => `<tr>${columns.map((c) => `<td style="text-align:${numeric(c.type) ? 'right' : 'left'}">${fmt(r[c.key], c.type)}</td>`).join('')}</tr>`).join('');
    const total = summary?.grand && Object.keys(summary.grand).length
      ? `<tr class="total">${columns.map((c, i) => `<td style="text-align:${numeric(c.type) ? 'right' : 'left'}">${i === 0 ? 'Total' : (summary.grand[c.key] !== undefined ? fmt(summary.grand[c.key], c.type) : '')}</td>`).join('')}</tr>`
      : '';

    return `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(name || 'Report')}</title>
<style>
  body{font:14px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;color:#111827;margin:32px}
  h1{font-size:20px;margin:0 0 4px}
  p.sub{color:#6b7280;font-size:12px;margin:0 0 20px}
  table{border-collapse:collapse;width:100%;font-size:12px}
  th,td{padding:7px 10px;border-bottom:1px solid #e5e7eb}
  th{background:#f9fafb;font-weight:600;color:#374151;text-transform:uppercase;font-size:10px;letter-spacing:.04em}
  tr.total td{font-weight:700;background:#f9fafb;border-top:2px solid #d1d5db}
  tbody tr:nth-child(even){background:#fcfcfd}
  @media print{body{margin:12mm}thead{display:table-header-group}}
</style></head><body>
<h1>${escapeHtml(name || 'Report')}</h1>
<p class="sub">${escapeHtml(description || '')}${description && subtitle ? ' · ' : ''}${escapeHtml(subtitle || '')}${
  result.meta ? ` · ${result.meta.row_count} rows · generated ${new Date(result.meta.generated_at).toLocaleString('en-US')}` : ''
}</p>
<table><thead><tr>${head}</tr></thead><tbody>${body}${total}</tbody></table>
</body></html>`;
  }
}

// ── Filter-tree helpers ─────────────────────────────────────────────────────

/** Accept both the legacy flat array and the AND/OR tree. */
function normalizeFilters(filters) {
  if (!filters) return { logic: 'AND', conditions: [] };
  if (Array.isArray(filters)) return { logic: 'AND', conditions: filters };
  if (filters.conditions) return { logic: filters.logic === 'OR' ? 'OR' : 'AND', conditions: filters.conditions };
  return { logic: 'AND', conditions: [] };
}

function walkConditions(node, fn) {
  if (!node) return;
  for (const c of node.conditions || []) {
    if (c?.conditions) walkConditions(c, fn);
    else if (c) fn(c);
  }
}

/**
 * The first filter condition that bounds a date on both sides — either a relative
 * preset ("is within") or an explicit `between`. Both describe a usable window;
 * one-sided operators (`gte`, `lte`) deliberately do not.
 */
function findDateWindowCondition(source, node) {
  let found = null;
  walkConditions(node, (c) => {
    if (found) return;
    if (c.op !== 'date_range' && c.op !== 'between') return;
    if (getField(source.key, c.field)?.type !== 'date') return;
    found = c;
  });
  return found;
}

/** Resolve whichever window shape the condition carries. */
function resolveConditionWindow(cond, dateOpts = {}) {
  if (cond.op === 'date_range') return resolveWindow(cond.value, dateOpts);
  if (cond.op === 'between' && Array.isArray(cond.value)) return resolveWindow(cond.value, dateOpts);
  return null;
}

const betweenCondition = (field, window) => ({
  field,
  op: 'between',
  value: [window.gte.toISOString(), new Date(window.lt.getTime() - 1).toISOString()],
});

function replaceCondition(node, target, replacement) {
  if (!node) return node;
  return {
    logic: node.logic,
    conditions: (node.conditions || []).map((c) =>
      c?.conditions ? replaceCondition(c, target, replacement) : (c === target ? replacement : c)),
  };
}


/** Clamp a fiscal-year start month to 1–12; anything unusable means January. */
function fiscalStartMonth(v) {
  const n = Number(v);
  return Number.isInteger(n) && n >= 1 && n <= 12 ? n : 1;
}

// ── Runtime parameters (prompted filters) ───────────────────────────────────

/**
 * A condition flagged `prompt: true` asks the viewer for its value at run time
 * (Salesforce "prompted filters", Power BI slicers, Crystal parameters). The
 * builder's value becomes the default; a runner passes overrides in `params`,
 * keyed by `cond.param` or, failing that, the field key.
 */
const paramKey = (cond) => String(cond.param || cond.field || '');
const isBlank = (v) => v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0);

/** Clone the tree with each prompted condition carrying its effective value. */
function applyParameters(node, params) {
  if (!node) return node;
  return {
    logic: node.logic,
    conditions: (node.conditions || []).map((c) => {
      if (c?.conditions) return applyParameters(c, params);
      if (!c?.prompt) return c;
      const supplied = params ? params[paramKey(c)] : undefined;
      // A blank answer means "any" — the condition is dropped for this run rather
      // than left pointing at an empty value the engine would silently ignore.
      const value = supplied !== undefined ? supplied : c.value;
      return isBlank(value) ? null : { ...c, value };
    }).filter(Boolean),
  };
}

/** The prompts a viewer should be shown, with the value this run used. */
function describeParameters(source, node, params, dateOpts) {
  const out = [];
  walkConditions(node, (c) => {
    if (!c.prompt) return;
    const field = getField(source.key, c.field);
    if (!field) return;
    const key = paramKey(c);
    const supplied = params ? params[key] : undefined;
    const value = supplied !== undefined ? supplied : (c.value ?? null);
    const operator = OPERATORS.find((o) => o.key === c.op);
    out.push({
      key,
      field: c.field,
      label: c.label || field.label,
      type: field.type,
      op: c.op,
      op_label: operator?.label || c.op,
      options: field.options || null,
      preset: !!operator?.preset,
      pair: !!operator?.pair,
      multi: !!operator?.multi,
      default: c.value ?? null,
      value: isBlank(value) ? null : value,
      window: c.op === 'date_range' && !isBlank(value) ? windowIso(resolveWindow(value, dateOpts)) : null,
    });
  });
  return out;
}

const windowIso = (w) => (w ? { from: w.gte.toISOString(), to: new Date(w.lt.getTime() - 1).toISOString() } : null);

// ── Dashboard-level (global) filters ────────────────────────────────────────

/**
 * A dashboard's date picker or owner selector applies to every report-backed
 * widget on it without editing any report. The clause is ANDed on at the top so
 * it is always a restriction (see #compareSpec for why that matters).
 */
function applyGlobalFilters(source, tree, global, warnings) {
  if (!global) return tree;
  const extra = [];
  if (!isBlank(global.date_range)) {
    if (source.dateField && getField(source.key, source.dateField)) {
      extra.push({ field: source.dateField, op: 'date_range', value: global.date_range });
    } else {
      warnings.push(`The dashboard date range was not applied — ${source.label} has no primary date.`);
    }
  }
  if (!isBlank(global.owner)) {
    if (source.ownerField && getField(source.key, source.ownerField)) {
      extra.push({ field: source.ownerField, op: Array.isArray(global.owner) ? 'in' : 'equals', value: global.owner });
    } else {
      warnings.push(`The dashboard owner filter was not applied — ${source.label} has no owner.`);
    }
  }
  if (!extra.length) return tree;
  return { logic: 'AND', conditions: [tree, ...extra] };
}

// ── Date windows ────────────────────────────────────────────────────────────

/** Resolve a date-range value (preset token or explicit [from,to]) to a window. */
function resolveWindow(token, { fiscalStart = 1, now: nowArg } = {}) {
  if (Array.isArray(token)) {
    const gte = new Date(token[0]);
    const lt = new Date(token[1]);
    if (Number.isNaN(gte.getTime()) || Number.isNaN(lt.getTime())) return null;
    lt.setHours(23, 59, 59, 999);
    return { gte, lt: new Date(lt.getTime() + 1) };
  }
  const now = nowArg ? new Date(nowArg) : new Date();
  const day = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
  const addDays = (d, n) => new Date(day(d).getTime() + n * 86400000);
  const monthStart = (y, m) => new Date(y, m, 1);
  const q = Math.floor(now.getMonth() / 3);
  // Fiscal years are named by the calendar year they *start* in. With a start
  // month of April, "this fiscal year" on 5 Sep 2026 is 1 Apr 2026 – 31 Mar 2027.
  const fyStartMonth = fiscalStartMonth(fiscalStart) - 1;
  const fyStartYear = now.getMonth() >= fyStartMonth ? now.getFullYear() : now.getFullYear() - 1;
  const fyStart = monthStart(fyStartYear, fyStartMonth);

  switch (token) {
    case 'today':        return { gte: day(now), lt: addDays(now, 1) };
    case 'yesterday':    return { gte: addDays(now, -1), lt: day(now) };
    case 'last_7_days':  return { gte: addDays(now, -7), lt: addDays(now, 1) };
    case 'last_30_days': return { gte: addDays(now, -30), lt: addDays(now, 1) };
    case 'last_90_days': return { gte: addDays(now, -90), lt: addDays(now, 1) };
    case 'this_week':    { const s = addDays(now, -((now.getDay() + 6) % 7)); return { gte: s, lt: addDays(s, 7) }; }
    case 'last_week':    { const s = addDays(now, -((now.getDay() + 6) % 7) - 7); return { gte: s, lt: addDays(s, 7) }; }
    case 'this_month':   return { gte: monthStart(now.getFullYear(), now.getMonth()), lt: monthStart(now.getFullYear(), now.getMonth() + 1) };
    case 'last_month':   return { gte: monthStart(now.getFullYear(), now.getMonth() - 1), lt: monthStart(now.getFullYear(), now.getMonth()) };
    case 'this_quarter': return { gte: monthStart(now.getFullYear(), q * 3), lt: monthStart(now.getFullYear(), q * 3 + 3) };
    case 'last_quarter': return { gte: monthStart(now.getFullYear(), q * 3 - 3), lt: monthStart(now.getFullYear(), q * 3) };
    case 'this_year':    return { gte: monthStart(now.getFullYear(), 0), lt: monthStart(now.getFullYear() + 1, 0) };
    case 'last_year':    return { gte: monthStart(now.getFullYear() - 1, 0), lt: monthStart(now.getFullYear(), 0) };
    case 'month_to_date':   return { gte: monthStart(now.getFullYear(), now.getMonth()), lt: addDays(now, 1) };
    case 'quarter_to_date': return { gte: monthStart(now.getFullYear(), q * 3), lt: addDays(now, 1) };
    case 'year_to_date':    return { gte: monthStart(now.getFullYear(), 0), lt: addDays(now, 1) };
    case 'last_12_months':  return { gte: monthStart(now.getFullYear(), now.getMonth() - 11), lt: addDays(now, 1) };
    case 'this_fiscal_year':    return { gte: fyStart, lt: monthStart(fyStartYear + 1, fyStartMonth) };
    case 'last_fiscal_year':    return { gte: monthStart(fyStartYear - 1, fyStartMonth), lt: fyStart };
    case 'fiscal_year_to_date': return { gte: fyStart, lt: addDays(now, 1) };
    case 'next_30_days': return { gte: day(now), lt: addDays(now, 31) };
    case 'next_90_days': return { gte: day(now), lt: addDays(now, 91) };
    default:             return null;
  }
}

const shiftYear = (d, n) => new Date(new Date(d).setFullYear(new Date(d).getFullYear() + n));

/** Move a date by whole calendar periods, so month/quarter lengths stay correct. */
function advancePeriod(date, period, n) {
  const d = new Date(date);
  switch (period) {
    case 'year':    d.setFullYear(d.getFullYear() + n); return d;
    case 'quarter': d.setMonth(d.getMonth() + 3 * n); return d;
    case 'month':   d.setMonth(d.getMonth() + n); return d;
    case 'week':    d.setDate(d.getDate() + 7 * n); return d;
    case 'day':     d.setDate(d.getDate() + n); return d;
    default:        return d;
  }
}

/** Apply a comparison offset to a single date. `dir` is +1 forward, -1 back. */
function shiftDate(date, shift, dir) {
  if (shift.kind === 'year')   return shiftYear(date, dir * shift.n);
  if (shift.kind === 'period') return advancePeriod(date, shift.period, dir * shift.n);
  return new Date(date.getTime() + dir * shift.ms);
}

const shiftWindowBack = (window, shift) => ({
  gte: shiftDate(window.gte, shift, -1),
  lt: shiftDate(window.lt, shift, -1),
});

/**
 * Move a date-bucket label forward into the current period's label space, so a
 * prior-window bucket can be joined to the row it should be compared against.
 */
function shiftLabel(label, period, shift) {
  const w = periodWindow(label, period);
  if (!w) return label;
  return bucketValue({ field: { type: 'date' }, period }, shiftDate(w.gte, shift, +1));
}

/** The full window covered by a set of date-bucket labels. */
function labelSpan(labels, period) {
  const windows = labels.map((l) => periodWindow(l, period)).filter(Boolean);
  if (!windows.length) return null;
  return {
    gte: new Date(Math.min(...windows.map((w) => w.gte.getTime()))),
    lt: new Date(Math.max(...windows.map((w) => w.lt.getTime()))),
  };
}

/** Inverse of `#bucket` for date periods — turns "2026-08" back into a window. */
function periodWindow(label, period) {
  const s = String(label);
  try {
    if (period === 'year')    return { gte: new Date(+s, 0, 1), lt: new Date(+s + 1, 0, 1) };
    if (period === 'quarter') { const [y, qq] = s.split(' Q'); return { gte: new Date(+y, (+qq - 1) * 3, 1), lt: new Date(+y, +qq * 3, 1) }; }
    if (period === 'month')   { const [y, m] = s.split('-'); return { gte: new Date(+y, +m - 1, 1), lt: new Date(+y, +m, 1) }; }
    if (period === 'day')     { const d = new Date(`${s}T00:00:00`); return { gte: d, lt: new Date(d.getTime() + 86400000) }; }
    if (period === 'week')    {
      const [y, w] = s.split('-W');
      const jan4 = new Date(+y, 0, 4);
      const start = new Date(jan4.getTime() - ((jan4.getDay() + 6) % 7) * 86400000 + (+w - 1) * 7 * 86400000);
      return { gte: start, lt: new Date(start.getTime() + 7 * 86400000) };
    }
  } catch { /* fall through */ }
  return null;
}

const periodLabel = (p) => ({ day: 'by day', week: 'by week', month: 'by month', quarter: 'by quarter', year: 'by year' }[p] || p);

// ── Bucketing ───────────────────────────────────────────────────────────────

/** Map a raw field value onto its group label — custom bucket, date period, or the value itself. */
function bucketValue(groupDef, value) {
  const { field, period, buckets } = groupDef;

  if (buckets?.length) {
    if (Array.isArray(buckets[0]?.values)) {
      const v = value === null || value === undefined ? null : String(value);
      const hit = buckets.find((b) => (b.values || []).map(String).includes(v));
      return hit ? hit.label : (groupDef.other_label || 'Other');
    }
    // A missing value is NOT zero — without this, a record with no amount would
    // be counted in whichever band starts at 0 and quietly skew the report.
    if (value === null || value === undefined || value === '') return groupDef.other_label || 'Other';
    const n = Number(value);
    if (Number.isNaN(n)) return groupDef.other_label || 'Other';
    const hit = buckets.find((b) => {
      const min = b.min === undefined || b.min === null || b.min === '' ? -Infinity : Number(b.min);
      const max = b.max === undefined || b.max === null || b.max === '' ? Infinity : Number(b.max);
      return n >= min && n < max;
    });
    return hit ? hit.label : (groupDef.other_label || 'Other');
  }

  if (value === null || value === undefined || value === '') return '—';

  if (field.type === 'date' && period) {
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return '—';
    const y = d.getFullYear(), m = d.getMonth();
    switch (period) {
      case 'year':    return `${y}`;
      case 'quarter': return `${y} Q${Math.floor(m / 3) + 1}`;
      case 'month':   return `${y}-${String(m + 1).padStart(2, '0')}`;
      case 'week':    return `${y}-W${String(weekOfYear(d)).padStart(2, '0')}`;
      default:        return localDateKey(d);
    }
  }
  if (field.type === 'boolean') return value ? 'Yes' : 'No';
  if (field.type === 'date') return localDateKey(new Date(value));
  return String(value);
}

// ── Table calculations ("show as") ──────────────────────────────────────────

const calcType = (calc, baseType) => (calc.result === 'same' ? baseType : calc.result);

/**
 * Replace each calc column's value with its calculation, computed along the
 * first dimension within each partition of the remaining dimensions. Rows are
 * already in display order, so "previous" means the row above.
 */
function applyCalculations(rows, metricCols, dimKeys) {
  const calcCols = metricCols.filter((c) => c.calc);
  if (!calcCols.length || !rows.length) return rows;

  const partitionOf = (r) => dimKeys.slice(1).map((k) => String(r[k])).join(' ▸ ');
  const partitions = new Map();
  rows.forEach((r, i) => {
    const p = partitionOf(r);
    if (!partitions.has(p)) partitions.set(p, []);
    partitions.get(p).push(i);
  });

  const out = rows.map((r) => ({ ...r }));
  for (const c of calcCols) {
    const num = (r) => Number(r[c.key]) || 0;
    for (const idx of partitions.values()) {
      const total = idx.reduce((a, i) => a + num(rows[i]), 0);
      const ranked = idx.slice().sort((a, b) => num(rows[b]) - num(rows[a]));
      const rankOf = new Map();
      ranked.forEach((i, pos) => {
        // Ties share a rank, like a league table.
        const prev = ranked[pos - 1];
        rankOf.set(i, prev !== undefined && num(rows[prev]) === num(rows[i]) ? rankOf.get(prev) : pos + 1);
      });
      let running = 0;
      idx.forEach((i, pos) => {
        const v = num(rows[i]);
        const prev = pos > 0 ? num(rows[idx[pos - 1]]) : null;
        switch (c.calc.key) {
          case 'running_total':    running += v; out[i][c.key] = round(running); break;
          case 'percent_of_total': out[i][c.key] = total === 0 ? null : round((v / total) * 100, 1); break;
          case 'rank':             out[i][c.key] = rankOf.get(i); break;
          case 'difference':       out[i][c.key] = prev === null ? null : round(v - prev); break;
          case 'percent_change':   out[i][c.key] = prev === null || prev === 0 ? null : round(((v - prev) / Math.abs(prev)) * 100, 1); break;
          case 'moving_avg': {
            const w = c.calc.window || 3;
            const slice = idx.slice(Math.max(0, pos - w + 1), pos + 1);
            out[i][c.key] = round(slice.reduce((a, j) => a + num(rows[j]), 0) / slice.length);
            break;
          }
          default: break;
        }
      });
    }
  }
  return out;
}

/** A grand total only means something for some calculations; the rest are blank. */
function calcGrand(metricCols, grand) {
  if (!grand) return grand;
  const out = { ...grand };
  for (const c of metricCols) {
    if (!c.calc) continue;
    if (c.calc.key === 'percent_of_total') out[c.key] = 100;
    else if (c.calc.key !== 'running_total') out[c.key] = null;
  }
  return out;
}

// ── Metrics & formulas ──────────────────────────────────────────────────────

/** How many rows carry a usable number for `field` — the weight for an average. */
function numericCount(rows, field) {
  let n = 0;
  for (const r of rows) {
    const v = readPath(r, field);
    if (v === null || v === undefined || v === '') continue;
    if (!Number.isNaN(Number(v))) n += 1;
  }
  return n;
}

function computeMetric(rows, spec) {
  const agg = spec.agg || 'count';
  if (agg === 'count') return rows.length;
  const vals = rows.map((r) => readPath(r, spec.field)).filter((v) => v !== null && v !== undefined);
  if (agg === 'count_distinct') return new Set(vals.map(String)).size;
  const nums = vals.map(Number).filter((n) => !Number.isNaN(n));
  if (nums.length === 0) return 0;
  switch (agg) {
    case 'sum': return round(nums.reduce((a, b) => a + b, 0));
    case 'avg': return round(nums.reduce((a, b) => a + b, 0) / nums.length);
    case 'min': return round(Math.min(...nums));
    case 'max': return round(Math.max(...nums));
    default:    return rows.length;
  }
}

/**
 * Evaluate one formula. `readRef` resolves an operand that names another column
 * (a metric key like `m0`, or a field key in table mode); `readTotal` resolves
 * the same operand's column total, for "% of total". Numbers pass through as
 * constants. No expression parsing, so no injection surface.
 */
function applyFormula(formula, readRef, readTotal) {
  if (!formula) return null;
  const operand = (v) => {
    if (v === null || v === undefined || v === '') return 0;
    if (typeof v === 'number') return v;
    const asNum = Number(v);
    if (!Number.isNaN(asNum) && !/^[a-z_]/i.test(String(v))) return asNum;
    return readRef(v);
  };
  const a = operand(formula.a);

  if (formula.op === 'percent_of_total') {
    const total = readTotal ? readTotal(formula.a) : 0;
    return total === 0 ? null : round((a / total) * 100, 1);
  }

  const b = operand(formula.b);
  switch (formula.op) {
    case 'add':            return round(a + b);
    case 'subtract':       return round(a - b);
    case 'multiply':       return round(a * b);
    case 'divide':         return b === 0 ? null : round(a / b, 2);
    case 'percent_of':     return b === 0 ? null : round((a / b) * 100, 1);
    case 'difference_pct': return b === 0 ? null : round(((a - b) / Math.abs(b)) * 100, 1);
    default:               return null;
  }
}

const formulaType = (formula, typeOf) => {
  const op = FORMULA_OPS.find((o) => o.key === formula?.op);
  if (!op) return 'number';
  if (op.result === 'percent') return 'percent';
  if (op.result === 'same') return typeOf?.(formula.a) === 'currency' ? 'currency' : 'number';
  return 'number';
};

function formulaLabel(formula, labelOf) {
  const op = FORMULA_OPS.find((o) => o.key === formula?.op);
  const name = (v) => (typeof v === 'number' || /^\d/.test(String(v ?? '')) ? String(v) : (labelOf?.(v) || v));
  if (!op) return 'Formula';
  if (op.key === 'percent_of_total') return `${name(formula.a)} % of total`;
  return `${name(formula.a)} ${op.symbol} ${name(formula.b)}`;
}

const metricRefType = (ref, metrics, source) => {
  const m = /^m(\d+)$/.exec(String(ref ?? ''));
  return m ? metricType(metrics[+m[1]] || {}, source) : 'number';
};
const metricRefLabel = (ref, metrics, source) => {
  const m = /^m(\d+)$/.exec(String(ref ?? ''));
  if (!m) return ref;
  const spec = metrics[+m[1]];
  return spec ? (spec.label || metricLabel(spec, source)) : ref;
};

function metricLabel(m, source) {
  if (m.agg === 'count' || !m.agg) return 'Number of records';
  const f = getField(source.key, m.field);
  const agg = AGGREGATIONS.find((a) => a.key === m.agg);
  return `${agg?.label || m.agg} ${f?.label || m.field}`.trim();
}

function metricType(m, source) {
  if (!m.agg || m.agg === 'count' || m.agg === 'count_distinct') return 'number';
  const t = getField(source.key, m.field)?.type;
  return t === 'currency' ? 'currency' : t === 'percent' ? 'percent' : 'number';
}

/**
 * Grand totals. Sums are additive so they sum; averages, percentages, min/max
 * and formulas must be recomputed over the whole set instead of summed, which is
 * the mistake that makes a "total" row wrong in a lot of reporting tools.
 */
function grandTotals(metricCols, rows, columnTotals, scannedRows) {
  const grand = {};
  for (const c of metricCols) {
    const agg = c.spec?.agg;
    if (c.formula) {
      grand[c.key] = applyFormula(c.formula, (ref) => Number(columnTotals[ref] ?? 0), (ref) => Number(columnTotals[ref] ?? 0));
    } else if (agg === 'count') {
      grand[c.key] = scannedRows;
    } else if (agg === 'sum') {
      grand[c.key] = round(columnTotals[c.key] ?? 0);
    } else if (agg === 'avg') {
      // Weighted by how many values each bucket averaged, so the grand average
      // equals the average over the whole set rather than an average-of-averages.
      const num = rows.reduce((a, r) => a + (Number(r[c.key]) || 0) * (r[`${c.key}__n`] ?? 0), 0);
      const den = rows.reduce((a, r) => a + (r[`${c.key}__n`] ?? 0), 0);
      grand[c.key] = den ? round(num / den) : 0;
    } else if (agg === 'min') {
      grand[c.key] = rows.length ? round(Math.min(...rows.map((r) => Number(r[c.key]) || 0))) : 0;
    } else if (agg === 'max') {
      grand[c.key] = rows.length ? round(Math.max(...rows.map((r) => Number(r[c.key]) || 0))) : 0;
    } else if (agg === 'count_distinct') {
      // Distinct counts cannot be combined from buckets — left blank rather than wrong.
      grand[c.key] = null;
    }
  }
  return grand;
}

/** Subtotal per value of the first dimension (matrix/pivot reports). */
function subtotals(groupDefs, metricCols, rows) {
  const key = groupDefs[0].field.key;
  const order = [];
  const groups = new Map();
  for (const r of rows) {
    const v = r[key];
    if (!groups.has(v)) { groups.set(v, []); order.push(v); }
    groups.get(v).push(r);
  }
  return order.map((v) => {
    const bucket = groups.get(v);
    const values = {};
    for (const c of metricCols) {
      const agg = c.spec?.agg;
      if (c.formula || agg === 'count_distinct') { values[c.key] = null; continue; }
      const nums = bucket.map((r) => Number(r[c.key]) || 0);
      if (agg === 'avg') {
        const den = bucket.reduce((a, r) => a + (r[`${c.key}__n`] ?? 0), 0);
        values[c.key] = den ? round(bucket.reduce((a, r) => a + (Number(r[c.key]) || 0) * (r[`${c.key}__n`] ?? 0), 0) / den) : 0;
      } else if (agg === 'min') values[c.key] = round(Math.min(...nums));
      else if (agg === 'max') values[c.key] = round(Math.max(...nums));
      else values[c.key] = round(nums.reduce((a, b) => a + b, 0));
    }
    return { dimension: key, value: v, label: `${v} subtotal`, values, row_count: bucket.reduce((a, r) => a + (r.__rows || 0), 0) };
  });
}

// ── Small utilities ─────────────────────────────────────────────────────────

// `agg` travels with a metric column so a client can tell an additive measure
// (count/sum) from one that must never be added up (avg/min/max/distinct/formula).
/**
 * The field shape the builder receives. Deliberately a whitelist: the resolved
 * field also carries how to *reach* the value — the relation path, and for a
 * roll-up the child Prisma model and foreign key — which is internal detail the
 * browser has no use for and should not be told. It is also most of the payload.
 */
const publicField = (f) => ({
  key: f.key,
  label: f.label,
  type: f.type,
  kind: f.kind,
  ...(f.agg ? { agg: true } : {}),
  ...(f.group === false ? { group: false } : {}),
  ...(f.filterable === false ? { filterable: false } : {}),
  ...(f.options ? { options: f.options } : {}),
  ...(f.hint ? { hint: f.hint } : {}),
  ...(f.employee ? { employee: true } : {}),
  ...(f.relation_label ? { relation_label: f.relation_label } : {}),
  ...(f.kind === 'related' ? { related: true } : {}),
});

const publicCol = (c) => ({
  key: c.key,
  label: c.label,
  type: c.type,
  ...(c.dimension ? { dimension: true } : {}),
  ...(c.formula ? { agg: 'formula' } : c.spec?.agg ? { agg: c.spec.agg } : {}),
  ...(c.calc ? { calc: c.calc.key } : {}),
});
const orUndef = (v, fn) => (v === undefined ? undefined : fn(v));

/**
 * Wrap a clause in the nesting its field path requires:
 *   `amount`                   → { amount: clause }
 *   `owner.employee_name`      → { owner: { employee_name: clause } }
 *   `agent.branch.branch_name` → { agent: { branch: { branch_name: clause } } }
 */
function nestClause(field, clause) {
  if (field.kind !== 'related') return { [field.key]: clause };
  let inner = { [field.leaf]: clause };
  for (let i = field.path.length - 1; i >= 0; i -= 1) inner = { [field.path[i]]: inner };
  return inner;
}

/** Read `owner.employee_name` off a row that Prisma nested under `owner`. */
function readPath(row, path) {
  if (!path) return undefined;
  if (!path.includes('.')) return row?.[path];
  return path.split('.').reduce((o, k) => (o === null || o === undefined ? undefined : o[k]), row);
}

function coerce(value, type) {
  if (value === null || value === undefined) return null;
  if (['currency', 'number', 'percent'].includes(type)) return Number(value);
  if (type === 'date') return value instanceof Date ? value.toISOString() : value;
  if (type === 'boolean') return !!value;
  return value;
}

/** Multi-key sort; unknown keys are ignored so a stale sort never throws. */
function sortRows(rows, sort, cols) {
  if (!sort?.length) return rows;
  const valid = sort.filter((s) => s?.key);
  if (!valid.length) return rows;
  const typeOf = new Map((cols || []).map((c) => [c.key, c.type]));
  return [...rows].sort((a, b) => {
    for (const s of valid) {
      const dir = s.dir === 'asc' ? 1 : -1;
      const av = a[s.key], bv = b[s.key];
      if (av === bv) continue;
      if (av === null || av === undefined) return 1;
      if (bv === null || bv === undefined) return -1;
      const numeric = ['currency', 'number', 'percent'].includes(typeOf.get(s.key)) || (typeof av === 'number' && typeof bv === 'number');
      const cmp = numeric ? Number(av) - Number(bv) : String(av).localeCompare(String(bv));
      if (cmp !== 0) return cmp * dir;
    }
    return 0;
  });
}

function round(n, dp = 2) {
  const f = 10 ** dp;
  return Math.round((Number(n) || 0) * f) / f;
}

function weekOfYear(d) {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  return Math.ceil(((date - yearStart) / 86400000 + 1) / 7);
}

/** Local-time YYYY-MM-DD, so a day bucket matches the user's calendar day. */
const localDateKey = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const escapeHtml = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

module.exports = ReportService;
module.exports.AGGREGATIONS = AGGREGATIONS;
module.exports.FORMULA_OPS = FORMULA_OPS;
module.exports.OPERATORS = OPERATORS;
module.exports.DATE_PRESETS = DATE_PRESETS;
module.exports.CALCULATIONS = CALCULATIONS;
module.exports.resolveWindow = resolveWindow;
module.exports.applyParameters = applyParameters;
module.exports.applyGlobalFilters = applyGlobalFilters;
module.exports.applyCalculations = applyCalculations;
