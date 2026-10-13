# Reporting Engine

Genesis reporting is a **declarative engine over a curated registry**. A report is a JSON config
produced entirely by dropdowns; the engine turns it into a tenant-scoped Prisma query plus an
in-memory grouping pass. There is no query language, no expression parser, and nothing that a report
author can write which the engine cannot run.

This document covers the implementation. For the end-user view, see
[Reports](../user-guide/19-reports.md). For endpoints, see
[Reports · `/api/reports`](API_REFERENCE.md#reports--apireports).

---

## Design constraint that shapes everything

The requirement is that a **non-technical member of the client's staff configures reports with no
help from the CRM team**, after a short on-site training session. Two consequences run through the
whole design:

1. **The UI may never require typed technical input.** Every field, operator, aggregation, period and
   formula operation is enumerated by the server (`GET /reports/sources`, `GET /reports/vocabulary`)
   and rendered as a dropdown. The builder cannot construct a config the engine rejects, because the
   builder's vocabulary *is* the engine's vocabulary.
2. **Anything a user builds must be usable everywhere.** A saved report is the data source for
   dashboard widgets, scheduled emails and exports. There is no second, developer-only authoring path
   that users must escalate to.

Consequence 2 is why report-backed dashboard widgets exist, and why the widget stores only a report
id — see [Report-backed dashboard widgets](#report-backed-dashboard-widgets).

---

## Where it lives in the navigation, and why

**Reports sits under `Tools`, not under `Builder`.** This is a requirement constraint, not a
styling preference, and it is worth stating plainly because "it's a builder, so it belongs in
Builder" is the obvious-looking wrong answer.

The entire `Builder` section is admin-only in two places: the sidebar renders it behind
`isAdmin() || isPlatformAdmin()`, and every `/builder/*` route is wrapped in
`<ProtectedRoute roles={['admin','super_admin','platform_admin']}>`. Filing report authoring there
would hide it from every non-admin — that is, from the non-technical staff the feature exists for —
and turn "no technical help required" into "ask an administrator". The routes `/reports`,
`/reports/new` and `/reports/:id/edit` therefore sit **outside** that guard.

This matches how the products Genesis is benchmarked against split the two concerns:

| | End users author reports in | Admins configure |
|---|---|---|
| Salesforce | **Reports** tab | Setup → *Report Types* (which objects/fields are reportable) |
| HubSpot | **Reporting** nav | — |
| Zoho CRM | **Reports** module | Setup → Modules & Fields |
| Dynamics 365 | in-app Reports/Dashboards | admin centre |
| Genesis | **Tools → Reports** | `report-registry.js` (a code file — no UI yet) |

So the admin-side counterpart of a report builder is not the builder itself; it is the **catalogue of
reportable sources and fields**. In Genesis that is `report-registry.js`, edited in code. A
"Reporting sources" admin screen would be the thing that legitimately belongs under `Builder` —
see [Benchmark](#benchmark) for why it has not been built.

Two supporting details:

- `Builder → Configure` carries a **shortcut** to `/reports`, because dashboard widgets are now
  report-backed and an admin wiring a dashboard needs to get there. It is a link to the same shared
  page — not a second, admin-only authoring surface — and its tooltip says so.
- `ReportBuilderPage.jsx` lives in `pages/runtime/`, alongside `ReportsPage.jsx`. It was originally
  in `pages/builder/`, where every other file is an admin-gated builder; that location implied a
  gating that does not (and must not) exist.

`frontend/tests/Sidebar.test.jsx` asserts the invariant: a non-admin sees Reports and no Builder
section at all, and the admin shortcut never points at a `/builder/*` path.

## The pieces

| File | Role |
|---|---|
| `backend/src/services/report-registry.js` | The curated catalogue: sources, fields, types, multi-hop relation paths, roll-up collections |
| `backend/src/services/report.service.js` | The engine: filters → Prisma, grouping, formulas, totals, comparison, drill-down, export |
| `backend/src/services/report-templates.js` | The starter gallery (~26 working configs) |
| `backend/src/services/report-library.service.js` | Visibility rules, folders, favourites, scope clamping |
| `backend/src/services/report-schedule.service.js` | Recurring emailed delivery + the sweeper |
| `backend/src/routes/reports/index.js` | `/api/reports` — all of the above |
| `frontend/src/pages/runtime/ReportBuilderPage.jsx` | The guided, stepped builder |
| `frontend/src/pages/runtime/ReportsPage.jsx` | Library + viewer |
| `frontend/src/components/reports/` | Filter tree, measures, groupings/bands, colour rules, sharing, scheduling, drill-down |
| `frontend/src/components/runtime/ReportResult.jsx` | Renders every visualization, totals, deltas, drill-down |
| `report-insights.js` | Plain-statistics narration of a result (leaders, outliers, trend, movers) |
| `report-snapshots.js` | Bounded trend history of a saved report's headline numbers, on `cached_result` |
| `report-run-context.js` | Adds the tenant fiscal-year month to a run context (memoised per tenant) |
| `report-semantics.js`, `ai-reporting.service.js`, `llm/provider.js`, `routes/ai-reports/` | The AI layer — see [AI_REPORTING.md](AI_REPORTING.md) |

---

## The config

```js
{
  source:   'opportunities',            // a key in the registry
  viz:      'bar',                      // table | bar | line | area | pie | donut | funnel | kpi | pivot
  columns:  ['name', 'amount'],         // table mode; may include { key, label, formula }
  group_by: [{ field, period?, buckets?, other_label? }],   // 0–2 dimensions
  metrics:  [{ agg, field?, label?, calc? } | { agg: 'formula', formula: { op, a, b }, calc? }],
  filters:  { logic: 'AND', conditions: [ condition | group ] },
            // condition = { field, op, value, prompt?: true, label?, param? }
  totals:   true,
  compare:  'previous_period' | 'previous_year',
  sort:     [{ key, dir }],
  limit:    100,
  insights: true,                       // false switches the statistics narration off
  format_rules: [{ column, op, value, value2?, color }],    // presentation only
}
```

`calc` is a table calculation ("show as", below); `prompt` marks a condition the viewer answers at
run time (runtime parameters, below).

It is stored on `custom_reports.data_source`. The `fields` / `filters` / `grouping` / `sorting` /
`chart_config` columns are **mirrors** kept for SQL readability and list queries; `data_source` is the
single source of truth and the only thing `run()` reads.

`filters` also accepts the legacy flat array (`[{ field, op, value }]`), so reports saved before the
AND/OR tree existed still open and run.

---

## Execution path

`ReportService.run(config, ctx)`, where `ctx` is `{ scope, employeeId, teamIds }` from
`resolveScope` plus, from `report-run-context.js`, `fiscal_year_start_month`, and optionally
`params` (answers to prompted filters) and `global` (dashboard-level filters):

1. **Resolve the source** from the registry; unknown source → `ValidationError`.
2. **Resolve prompts and global filters.** Prompted conditions take the answer in `ctx.params` (a
   blank answer drops the condition); `ctx.global.date_range` / `owner` are ANDed on at the top on
   the source's `dateField` / `ownerField`.
3. **Build the where clause** from the filter tree. Conditions become entries in a Prisma `AND` /
   `OR` array — never `where[field] = …`.
4. **Apply the data scope** (`me` / `team` / `all`) on the source's owner field.
5. **Select only the referenced columns.** `#buildSelect` walks the filters, groupings, measures,
   columns and sort keys and asks for exactly those, plus `id`. Related fields become a nested
   `select` on the relation.
6. **Fetch** up to `FETCH_CAP` (20 000) rows. Hitting the cap sets `meta.capped` and pushes a
   plain-English warning telling the user to add a filter.
7. **Group or project** in application code, so every source behaves identically. Table
   calculations run as a final pass over the sorted result.
8. **Comparison**, if asked for: re-run over the prior window and pair the buckets.
9. **Insights**: plain-statistics narration over the finished result (`report-insights.js`).

The result carries `columns`, `rows`, `summary`, `comparison`, `insights` and `meta` — `meta`
includes `parameters` (the prompts and the values this run used) and `global`.

Aggregation is deliberately in-memory rather than pushed into SQL `GROUP BY`. Date periods, custom
value bands, two-dimension matrices, cross-object groupings, derived measures and weighted totals all
compose uniformly there; expressing that set in Prisma's `groupBy` would mean several divergent code
paths and dialect-specific SQL. The column-level `select` is what keeps the row fetch cheap.

### Filters: why the tree matters

The previous engine flattened filters into `where[field] = clause`, so two conditions on the same
field silently overwrote each other — `amount >= 100 AND amount <= 500` became just `amount <= 500`.
Building `AND` / `OR` arrays fixes that and is what makes nested groups expressible:

```js
{ AND: [ { is_closed: false }, { OR: [ { stage: 'proposal' }, { amount: { gt: 500 } } ] } ] }
```

A condition naming an unavailable field is **dropped with a warning**, not thrown — a stale saved
report still runs and tells the user which condition was ignored.

### The join model

Two kinds of cross-table reporting, and deliberately no third.

#### 1. Curated to-one paths (`relations`)

Each source declares a recursive `relations` tree, up to `MAX_RELATION_HOPS` (**2**) deep:

```js
REL('agent', 'Agent', EMPLOYEE_FIELDS, [REL('branch', 'Branch', BRANCH_FIELDS)])
```

A field key is the dotted path — `agent.branch.branch_name` — and `getField` walks the chain to
return `{ kind: 'related', path: ['agent','branch'], leaf: 'branch_name' }`. That one descriptor
drives everything:

| Concern | How the path is used |
|---|---|
| Fetch | `relationSelect` builds a **merged** nested `select`, so `owner.employee_name` and `owner.branch.branch_name` produce one `owner` subtree, not two |
| Filter | `nestClause` wraps the clause to full depth: `{ agent: { branch: { branch_name: … } } }` |
| Read | `readPath` already walks arbitrary depth |
| Group / drill-down | `#bucketToWhere` replays through the same `nestClause` |

**Every hop is to-one, enforced by test**, so the row count is identical to a single-table query and
no measure can be inflated. Adding a path is a registry edit; nothing in the engine changes.

`primary: true` on a field marks it as the related record's identity, collapsing the label once the
path is 2+ hops: `agent.branch.branch_name` reads **"Agent ▸ Branch"**, not the useless "Agent ▸
Branch ▸ Name". At one hop the leaf label is kept, so existing labels ("Owner ▸ Name") did not churn.

#### 2. Parent→children roll-ups (`rollups`)

This is the answer to "report on policies *and* their claims", and the reason it is not a join:

```js
ROLLUP('claims', 'Claims', 'insuranceClaim', 'policy_id', [
  F('paid_amount', 'Total paid', 'currency', { rollup: 'sum' }),
])
```

`#attachRollups` runs **one `groupBy` on the child table**, keyed by the foreign key over the parent
ids just fetched, and writes the result onto each parent row under the collection name — so
`row.claims = { $count: 3, paid_amount: 300 }`. To everything downstream a roll-up is
indistinguishable from a to-one relation and `readPath('claims.paid_amount')` reads it unchanged:
grouping, measures, formulas, totals and comparison needed no special case.

**Why not a join.** `policies ⋈ claims` multiplies the parent row once per child. A policy with
£1,200 premium and three claims then contributes £3,600 to "total premium". Roll-ups cannot do this
because the parent row is never duplicated — a property pinned by
`report-joins.test.js` ("counts a policy premium once, however many claims it has"), and verified
against the real database: premium totals are byte-identical with and without roll-ups in play.
Salesforce draws the same distinction, calling these **roll-up summary fields** and keeping them
separate from report-type joins.

Roll-up fields are `agg: true`, `group: false`, `filterable: false`. The last one matters: the values
exist only after the rows are read, so filtering on them would need a `HAVING` pass. The engine
**reports** such a condition instead of dropping it silently, and the filter UI omits non-filterable
fields entirely.

Implementation details worth knowing:

- **Parent ids are chunked** at `ROLLUP_ID_CHUNK` (1 000) per `groupBy`. A single `IN` of up to
  `FETCH_CAP` values is hostile to the query planner and some drivers cap placeholders outright.
- **No children is a real zero for a sum or count, but `null` for an average, minimum or maximum** —
  an absent average is unknown, and feeding zero into a later average would be wrong.
- A missing child delegate degrades to a warning; the report still renders.
- `relations` and `rollups` may not share a name — they occupy one dotted-key namespace, and the
  roll-up writer would overwrite the selected relation. Enforced by test.

#### What is deliberately absent

Arbitrary user-defined joins. None of Salesforce, HubSpot, Zoho CRM, Dynamics 365 or Pipedrive
exposes them to business users either — they curate the paths (Salesforce *Report Types*) or push
real joins into a separate technical product (Zoho Analytics, Power BI). Beyond matching the market,
three reasons are specific to this engine: fan-out silently corrupts every measure; a fan-out join
multiplies rows into `FETCH_CAP` and truncates; and a hand-built raw join would bypass the Prisma
tenant-scope extension. Choosing join direction and reasoning about grain is also precisely the
expertise the client's staff do not have — Salesforce's "with or without related records" toggle
confuses trained admins.

If true to-many joins ever become a requirement, the state of the art is Looker's **symmetric
aggregates**, which de-duplicate fanned-out rows mathematically. That is an engine rewrite (with
aggregation moved into SQL), not an increment.

### Default table columns

`defaultFields(sourceKey)` in the registry is the single definition of the columns a table report
shows when its author has picked none, and of the columns a drill-down lists. `getSources()` publishes
it as `default_columns`, and the builder seeds `config.columns` from it (`withSeededColumns`) whenever
a table report has none — on source select, on switching the visualization to Table, and when a saved
report or template loads.

Keeping the definition in one place is the point. It previously lived privately in the engine, so the
preview rendered eight columns while "Which columns?" showed nothing ticked — the picker and the result
disagreed, with no way for the user to tell which was authoritative. Seeding also means unticking is
now the only way to *remove* a column, which is what a checkbox list implies.

The selection is the source's own field order (curated identity-first), capped at
`DEFAULT_COLUMN_COUNT` (8), with the `titleField` hoisted first. It deliberately does **not** filter on
`group`: groupability says whether a field makes a sensible *dimension*, which has nothing to do with
whether it is worth showing as a column. Filtering on it dropped every free-text field, so a leads
table listed `last_name` and no `first_name`.

An empty `columns` array still means "the defaults" server-side, so older saved reports and direct API
callers are unaffected — they now simply get a slightly better set.

### Field catalogue hygiene

`getSources()` projects fields through `publicField()`, a whitelist. The resolved field also carries
*how to reach* the value — the relation path, and for a roll-up the child Prisma model and foreign
key — which the browser has no use for and should not be told. It was also most of the payload:
the catalogue is 42 KB rather than 61 KB, and `report-joins.test.js` asserts none of `model`, `fk`,
`path`, `leaf` or `source` appears in it.

`getField` and `allFields` memoise on `source|fieldKey`; both sit in hot paths (once per condition,
measure, column and sort key on every run) and the registry is immutable.

### Retiring a field without breaking saved reports

`hidden: true` keeps a field resolvable but removes it from the builder. Used for
`owner.branch_id` / `owner.region_id`, which grouped territory by a **numeric id** — users saw bars
labelled "1", "2", "3". They are superseded by `owner.branch.branch_name` and
`owner.region.region_name`, and reports saved against the old keys keep running. Two tests hold this:
the catalogue must advertise nothing hidden, and every hidden field must still resolve.

### Buckets

`group_by[i].buckets` maps raw values onto named bands — numeric ranges (`min` inclusive, `max`
exclusive, so adjacent bands cannot double-count) or explicit value lists for picklists. Anything
unmatched goes to `other_label`.

**A missing value is never zero.** `bucketValue` returns the "other" band for `null` / `undefined` /
`''` *before* coercing with `Number()`, because `Number(null) === 0` would otherwise file every
record with no amount into whichever band starts at zero.

### Formulas

`{ agg: 'formula', formula: { op, a, b } }`. `a` and `b` name earlier measures (`m0`, `m1`) or are
numeric constants; `op` comes from a fixed list (`add`, `subtract`, `multiply`, `divide`,
`percent_of`, `percent_of_total`, `difference_pct`).

There is no expression parser and nothing is ever `eval`d, so there is no injection surface and no
syntax for a user to get wrong. Only measures *above* a formula may be referenced, which makes cycles
impossible by construction. Division by zero yields `null`, rendered as `—` — never `Infinity` or
`NaN`.

Aggregation runs in two passes: plain measures and their column totals first, then formulas (which
need those totals for `percent_of_total`).

### Table calculations ("show as")

Any measure may carry `calc`: `running_total`, `percent_of_total`, `rank`, `difference`,
`percent_change` or `moving_avg` (trailing 3). These are Tableau's *quick table calculations* and
Power BI's *quick measures*: a post-aggregation pass that replaces the measure's value, chosen from a
dropdown so the base aggregation is unchanged and nothing is typed.

Rules the pass enforces (`applyCalculations`):

- It runs over the **sorted, full** result and only then is `limit` applied, so a running total or a
  rank is never truncated into nonsense.
- With two groupings it runs along the first grouping **within each value of the second** — a
  running total per series, which is what a stacked or multi-line chart expects.
- Types follow the calculation: `percent_of_total` and `percent_change` are `percent`, `rank` is a
  number, the rest keep the base type. Labels become "Sum of Amount (running total)" unless the
  author named the column.
- Grand totals: a running total's total is the base total; `percent_of_total` totals to 100; the
  others have no meaningful total and are blank. Ties share a rank.

The list is published as `vocabulary.calculations`.

### Runtime parameters (prompted filters)

A condition with `prompt: true` is a *parameter*: the builder's value is the default, and the viewer
is asked for a value when the report runs (Salesforce prompted filters, Crystal parameters, Power BI
slicers). `run()` takes the answers in `ctx.params`, keyed by `cond.param` or the field key; a blank
answer means "any" and drops the condition for that run. `meta.parameters` describes every prompt —
label, operator, type, options, default, the effective value and, for a date preset, the resolved
window — so the viewer can render `ParameterBar` without knowing anything about the config. Exports,
print and drill-down accept the same `params`, so what is downloaded is what was on screen.

A run with answers is not the report's own number, so it is neither snapshotted nor cached.

### Totals

`grandTotals` recomputes rather than adds, because adding is wrong for most aggregations:

| Aggregation | Grand total |
|---|---|
| `count` | Total rows scanned |
| `sum` | Sum of the column |
| `avg` | **Weighted by the number of values each bucket averaged**, not by row count |
| `min` / `max` | Min / max across buckets |
| `count_distinct` | `null` → rendered `—`; cannot be combined from buckets without re-querying |
| formula | Re-evaluated against the column totals |

The `avg` weight is the count of rows carrying a usable number (`numericCount`), stored per measure as
`m0__n`. Weighting by plain row count instead lets rows with no value drag the average down: for
amounts `100, 300, 600, null` the true average is `333.33`, but row-count weighting gives `275`.

`subtotals` covers the first dimension of a two-dimension matrix.

### Comparison

`#compareSpec` decides what "the previous period" means, preferring an explicit window in the filters
and falling back to the grouping:

| Config has | Window | `previous_period` shifts by | `previous_year` shifts by |
|---|---|---|---|
| A `date_range` or `between` condition on a date field | That window | The window's own length | 1 calendar year |
| No date filter, but grouped by a date period | The span of the result's buckets | **One bucket** (`advancePeriod`) | 1 calendar year |
| Neither | — | Returns `null` + a warning naming both remedies | same |

Requiring a filter *and* rejecting `between` (the original rule) turned away the most common trend
report there is — "group by month, compare to last year" — so both are now accepted, and a date
grouping alone is sufficient.

**Prior labels are realigned before joining.** This is the subtle part. A date-bucketed dimension is
labelled in its own period, so the prior window yields `2025-03` while the current rows are `2026-03`;
joining on the raw label matches nothing and every delta comes back `0`/`null`. `shiftLabel` therefore
converts each prior label back to a date (`periodWindow`), advances it by the comparison offset, and
re-buckets it, so it lands in the current label space. Non-date dimensions join on their raw values as
before.

Shifts use **calendar arithmetic** (`advancePeriod`), not fixed millisecond offsets, so month and
quarter lengths stay correct across February and year boundaries.

Output per row is `m0` (the prior value), `m0__delta` and `m0__delta_pct`. A bucket with **no
counterpart** gets `null` for all three rather than `0` — a missing counterpart is unknown, not zero,
and treating it as zero would render as infinite growth. The UI shows "no earlier data" for that cell.
`comparison.matched` reports how many rows found a counterpart; if the prior window returned rows but
none matched, the engine returns `null` with a warning rather than a table of dashes.

### Drill-down

`runDrilldown(config, keys, ctx)` replays the report's own filters plus the clicked bucket, using
`#bucketToWhere` — the inverse of the bucketing rules. A month label becomes the matching date
window, a named band becomes its range, a value becomes an equality. That is what makes the listed
records provably the records that were counted.

---

## Report-backed dashboard widgets

`GET /reports/:id/data?shape=series|metric|rows` returns a saved report reshaped for a widget, plus
metadata describing itself:

```js
// shape=series
{ rows: [...], xKey: 'stage', xLabel: 'Stage', series: [{ key: 'm0', label: 'Pipeline value', type: 'currency' }] }
```

A widget's `data_source` is `{ type: 'report', report_id, shape }` and **stores no field names**. The
renderer reads `meta.xKey` / `meta.series` at render time (`useDataSource` → `ChartRenderer`), so
renaming a measure or changing a grouping in the report can never leave a widget pointing at a column
that no longer exists.

`shape=metric` prefers the grand total over the first row, and folds a comparison into
`change` / `trend`, which is what makes a KPI tile show a delta.

### Dashboard-level filters (cross-filtering)

`GET /reports/:id/data` also accepts `?date_range=<preset|from,to>` and `?owner=<id[,id]>`. The
engine ANDs them onto the report's own filters on the source's primary `dateField` / `ownerField`
(`applyGlobalFilters`), so a dashboard's date picker applies to every report-backed widget at once
without editing any report. `DashboardRenderer` shows the picker only when the board has a
report-backed widget, injects `{ global }` into each such widget's `data_source` at render time
(never stored), and tells the user how many widgets it applies to — endpoint-backed widgets read
fixed datasets and are unaffected. A source without a primary date reports a warning rather than
silently ignoring the range.

### Removed data-source modes

The builder previously offered `{ type: 'api', url, headers, dataPath }` and
`{ type: 'json', data }`. Both are gone from the UI:

- **External REST** required a URL, hand-written auth headers and a dot-notation path — knowledge no
  business user has — and let a dashboard author point the browser at an arbitrary host. `fetchExternal`
  has been removed from `useDataSource` entirely, so the descriptor no longer resolves.
- **Static JSON** froze numbers at authoring time. Existing widgets that carry a payload still
  render, and the panel shows what they hold read-only with a prompt to move them onto a report,
  rather than silently discarding data someone put there.

`{ type: 'endpoint', dataset }` remains: the ~45 pre-computed datasets in
[Dashboard Analytics](DASHBOARD_ANALYTICS.md). Those are developer-authored by design; reports are the
path that does not need a developer.

---

## Snapshots — historical trending

Every plain run of a saved report (viewer, dashboard widget or schedule) appends its headline
numbers to `custom_reports.cached_result`: `{ version, columns, snapshots: [{ at, scope, row_count,
grand }] }`, one entry per scope per calendar day, capped at 120 (`report-snapshots.js`). The
column is the legacy result cache, which used to receive a 20 000-row blob on every view and was
never read; it now holds ~10 KB of history. `GET /reports/:id/snapshots?scope=` returns the
history and `TrendStrip` draws a sparkline per measure with the change since the first snapshot.

This answers "how has this KPI moved" for reports that read *current state* (open pipeline, active
policies, overdue tasks) without a warehouse or a snapshot table. It is not a substitute for a
dated fact table: a snapshot only exists for a day the report ran, and the schedule sweeper is what
guarantees a daily point.

---

## Insights — statistics, not an LLM

`report-insights.js` narrates a result in sentences derived from the numbers on screen: the leader
and its share, concentration of the top groups, a long tail, outliers beyond two standard
deviations, trend direction and peak on a period series, the latest period's move, the biggest
movers when a comparison is present, the share of rows with a blank grouping, and the row cap. Each
insight is `{ kind, severity, title, detail, measure?, rows? }`, at most six, deduplicated, and
computed only from the finished result — so every sentence is reproducible and every number in it
is in the table. Insights ride on `result.insights` (switch off per config with `insights: false`)
and render in `InsightsPanel`. The AI layer reads the same insights when it writes a summary, which
is what keeps its prose grounded.

---

## Threshold alerts (exception reports)

A subscription may carry an **alert**: `recipients` becomes `{ emails: [...], alert: { measure,
op, value, only_on_change, label?, state? } }` (a subscription without an alert still stores the
plain array, so older readers keep working). The report runs on its schedule as before, but
`#send` evaluates the alert first (`evaluateAlert`): the watched number is the measure's grand total
(`m0`, `m1`… or `row_count`), else the single KPI row, else the column sum. When the condition
is not met the run is recorded as `last_status: 'skipped'` with the reason, a `report_executions`
row with status `skipped` is written, and nothing is emailed. When it is met the email goes out
with an alert subject, and the owner also receives an in-app notification (`type: 'report_alert'`).

Operators: `gt gte lt lte equals not_equals changed`. `changed` fires when the value differs from
the previous check, so the first run only sets a baseline. `only_on_change` suppresses repeats
while a threshold stays met. The baseline lives in `alert.state` (`last_value`, `last_met`) and
survives unrelated edits. **Send now** bypasses the condition — it is a test of the delivery.

`hourly` joined the frequencies for exactly this use: an exception report is worth checking more
often than a digest is worth reading.

---

## Fail-closed rules

Reporting is self-service, so a permissive default is a data-exposure bug rather than a
convenience. The engine and library therefore fail closed in five specific places, each of which
originally failed open:

| Situation | Behaviour |
|---|---|
| `scope` is a string that is not `me`/`team`/`all` | Treated as "not requested" and re-derived from the role. An unrecognised value must never reach `#applyScope`, where it matches no branch and applies **no** owner filter. |
| `scope: 'team'` with an empty hierarchy closure | Narrows to the caller (`{ in: [employeeId] }`), never "no filter". |
| `scope: 'me'` with no `employeeId` | `{ in: [] }` — matches nothing. |
| A report filters on the owner field *and* a scope applies | The scope is **ANDed on** (`where.AND.push`), never assigned to `where[ownerField]`, which would silently replace the author's own filter. |
| A subscription owner (or their role) cannot be found | Level falls back to the least privileged, and no `role.findFirst` is issued — `findFirst({ name: undefined })` drops the condition and returns an arbitrary row, potentially the most privileged role in the tenant. |

A filter whose **operator does not apply to its field type** is also reported rather than dropped:
the condition could never produce a clause, so the report would quietly include records the author
believes they excluded. (A filter with no *value* stays silent — that is the normal mid-edit state.)
The builder additionally repairs such conditions when a saved report is loaded, so it never displays
an operator the engine is not using.

## Visibility and scope

Two independent axes, which is worth keeping straight:

- **Visibility** — *who can open the report*. `custom_reports.visibility` is
  `private` | `team` | `shared` | `everyone`; `shared_with` holds role names / employee IDs and is only
  consulted for `shared`. Rows predating the column fall back to the old `is_shared` boolean, so
  nothing disappears on upgrade. Admins can always view (they support the authors); only the author
  and admins can edit.
- **Scope** — *which records the report shows*. `resolveScope` clamps the requested scope to the
  viewer's role: a user is forced to `me`, a manager to `team`. Sharing therefore never widens
  anyone's data access; the same report shows each viewer their own slice.

`team` visibility needs the hierarchy closure in both directions (a manager sees what their reports
build; a member sees what their manager published to the team), which is not expressible as one
Prisma `where` — hence the application-side filter in `visibleReports`.

---

## Scheduled delivery

`report_subscriptions` holds one recurring delivery, owned by an employee. `next_run_at` is what the
sweeper claims on and is recomputed after every send.

`sweepDue()` runs on a 60 s interval from `app.js` (offset 20 s). For each due row it:

1. **Claims atomically** — `updateMany({ where: { id, next_run_at: <the value it read> }, data: { next_run_at: null } })`.
   A second pod reading the same row updates 0 rows and skips it, so multiple pods cannot double-send.
2. Runs the report inside `tenantContext.run({ tenantId })` — a scheduled run has no request, so the
   tenant must be established explicitly or the Prisma tenant-scope extension sees no tenant at all.
3. Emails each recipient, writes a `report_executions` row, and reschedules.

A failed run is **still rescheduled**, so one bad send cannot silently kill a schedule; the failure is
recorded on `last_status` / `last_error` and surfaced in the UI.

Frequencies are `hourly | daily | weekdays | weekly | monthly`. Every delivery also records a trend
snapshot, and a subscription with an alert only emails when its condition holds — see
[Threshold alerts](#threshold-alerts-exception-reports).

The delivery scope comes from the *subscription owner's* role, so scheduling cannot be used to email
data the owner could not see interactively.

---

## Tenant scoping — a local workaround

Report route handlers are registered through a local `on()` helper that wraps them in
`tenantContext.run({ tenantId })`.

This is necessary because `authenticate` calls `tenantContext.enterWith()` *after*
`await request.jwtVerify()`. After that await the hook resumes in a child async context which Fastify
discards, so the store never reaches the handler: `getTenantId()` returns `null`, and the tenant-scope
extension skips scoping entirely — reads come back unscoped and creates are rejected with
`Argument 'tenant' is missing`.

Re-entering the context around the handler works because there is no hook boundary in between. The
proper fix is to verify the JWT synchronously in a non-async preHandler, but that changes scoping for
**every** route at once — enabling real filtering on queries that currently run unscoped — so it is
tracked as its own change rather than bundled here.

---

## Export

| Format | How |
|---|---|
| CSV | `toCsv` — RFC-4180 quoting, grand total appended |
| Excel | `toXlsx` — the `xlsx` dependency already in the project; lazily required so a missing optional dep cannot break report *viewing* |
| PDF | `toHtml` → `GET /reports/:id/print`, then the browser's own Save as PDF |

PDF is deliberately not server-rendered. A headless browser is a heavy dependency for one feature, and
the browser's print output matches what the user is looking at. The same HTML is the body of a
scheduled email, so there is one renderer rather than two.

`toHtml` escapes all report content (`escapeHtml`) — report data is user-controlled and ends up in both
a browser and an email client.

Export filenames are sanitised to `[a-z0-9 _-]` before reaching `Content-Disposition`, so a report
name cannot inject a header.

---

## Adding to the registry

To expose a new source:

1. Add an entry to `SOURCES` in `report-registry.js`: `key`, `label`, `description` (in business
   terms — the builder shows it), Prisma `model`, `category`, `icon`, `dateField`, `ownerField`,
   `titleField`, and `fields`.
2. Mark aggregatable fields `agg: true`, give free-text fields `group: false`, give picklists their
   `options`, and add a `hint` wherever the label alone is ambiguous.
3. Add `relations` for related-object fields, reusing the shared field sets where possible.
4. Nothing else. The builder, filters, exports, scheduling and dashboard widgets all pick it up.

`tests/report-engine.test.js` asserts every source has a description and every field a valid
label/type, and runs all templates against a stub datasource — a malformed registry entry fails there.

---

## Benchmark

Against Salesforce, HubSpot, Zoho CRM/Analytics, Dynamics 365 and Pipedrive:

| Capability | SF | HS | Zoho | D365 | PD | Genesis |
|---|---|---|---|---|---|---|
| Curated report types / sources | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Table / summary / matrix formats | ✓ | ✓ | ✓ | ✓ | ~ | ✓ |
| Grouping with subtotals & grand total | ✓ | ✓ | ✓ | ✓ | ~ | ✓ |
| Value bands / bucket fields | ✓ | ✓ | ✓ | ~ | ✗ | ✓ |
| Calculated measures, no code | ✓ | ✓ | ✓ | ✓ | ✗ | ✓ |
| Nested AND/OR filter logic | ✓ | ✓ | ✓ | ✓ | ~ | ✓ |
| Relative date presets | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Cross-object / related fields | ✓ | ✓ | ✓ | ✓ | ~ | ✓ (2 hops, curated) |
| Parent→child roll-ups without fan-out | ✓ | ~ | ✓ | ✓ | ✗ | ✓ |
| Arbitrary user-defined joins | ✗ | ✗ | ✗ (in CRM) | ✗ | ✗ | ✗ — by design |
| Period-over-period comparison | ✓ | ✓ | ✓ | ✓ | ~ | ✓ |
| Conditional formatting | ✓ | ~ | ✓ | ✓ | ✗ | ✓ |
| Drill-down to records | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Starter template library | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ (26) |
| Folders, favourites, search | ✓ | ✓ | ✓ | ✓ | ~ | ✓ |
| Sharing by role / team | ✓ | ✓ | ✓ | ✓ | ~ | ✓ |
| Scheduled email subscriptions | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Export CSV / Excel / PDF | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Reports as dashboard widgets | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Table calculations (running total, % of total, rank, change) | ~ | ✗ | ✓ | ✓ | ✗ | ✓ |
| Prompted filters / runtime parameters | ✓ | ✗ | ✓ | ✓ | ✗ | ✓ |
| Fiscal-year and to-date presets | ✓ | ~ | ✓ | ✓ | ✗ | ✓ |
| Dashboard-level cross-filtering | ✓ | ✓ | ✓ | ✓ | ~ | ✓ (date, owner) |
| Historical trending of a report's numbers | ✓ | ✗ | ~ | ~ | ✗ | ✓ (snapshots) |
| Threshold alerts / exception reports | ✓ | ~ | ✓ | ✓ | ✗ | ✓ |
| Automatic insights | ✓ (Einstein) | ✗ | ✓ (Zia) | ✓ | ✗ | ✓ (statistics, no LLM needed) |
| Natural-language report building | ✓ (cloud) | ✓ (cloud) | ✓ (cloud) | ✓ (cloud) | ✗ | ✓ **local model, config-only** |
| **Genesis-specific: insurance sources** | ✗ | ✗ | ✗ | ~ | ✗ | ✓ policies, claims, commissions, SLA |

Where Genesis is still behind, and why each was left out:

| Gap | Note |
|---|---|
| **Relation paths beyond 2 hops** | `MAX_RELATION_HOPS` is 2, which covers every path identified as valuable (territory via owner, carrier via policy). Salesforce allows ~4 levels. Raising it is a constant plus registry entries; the cost is catalogue size, not correctness. |
| **Two primary sources in one report** | One source per report, plus its related paths and roll-ups. Salesforce's *joined reports* (up to 5 blocks sharing a grouping) would be the equivalent — a presentation feature, not a join, and the safer way to put pipeline, policies and claims side by side. |
| **Filtering on a roll-up total** | Needs a `HAVING`-style pass after aggregation. Currently reported to the user rather than silently ignored. |
| **Snapshots need a run** | Trend history is written when a report runs; a report nobody opens and nobody schedules has no history. A nightly sweep over every saved report would close this at the cost of running every report every night. |
| **Global filters beyond date and owner** | The dashboard bar applies a date range (and the API an owner); an arbitrary field filter across widgets would need a per-widget field mapping. |
| **>20 000 row reports** | The fetch cap. Beyond it, aggregation would have to move into SQL `GROUP BY`. |
| **No admin UI for the source catalogue** | Exposing a new source or field means editing `report-registry.js` and shipping. This is the Salesforce "Report Types" equivalent and is the one piece of reporting that would legitimately live under `Builder`. Deliberate for now: the registry encodes plain-English labels, hints, aggregatability and relation safety per field, and a UI that let an admin add an unchecked field would reintroduce the runtime-error class that `report-registry-schema.test.js` exists to prevent. |

---

## Testing

| Suite | Covers |
|---|---|
| `backend/tests/report-registry-schema.test.js` | **Every registry field, relation and declared type against Prisma's own DMMF.** The other suites use a Prisma double that accepts any field name, so a registry entry naming a column that does not exist passes them all and throws at runtime — `claims.closed_at` shipped exactly that way (`InsuranceClaim` has `paid_at`). Also asserts no relation is to-many, since a to-many join would multiply rows and inflate every measure. Needs no database. |
| `backend/tests/report-joins.test.js` | Multi-hop resolution and label collapsing, depth cap, merged nested selects, nested filter/drill-down clauses, roll-up descriptors, the child `groupBy` (shape, id chunking, skipped when unreferenced), **the fan-out arithmetic**, roll-up guard rails, and the public catalogue's whitelist |
| `backend/tests/report-hardening.test.js` | The fail-closed rules above, folder ownership, scheduled-delivery scope clamping and bounce accounting, `between` date windows including the final day, totals covering rows hidden by the row limit, and prior-period composition under an `OR` filter |
| `backend/tests/report-engine.test.js` | Filter trees (incl. the same-field regression), relation routing, select narrowing, buckets, date periods, formulas, totals, comparison, drill-down replay, CSV/XLSX/HTML export, registry and template integrity |
| `backend/tests/report-library.test.js` | Visibility per mode, legacy fallback, edit rights, scope clamping, list filters, sharing payload, folder cycles |
| `backend/tests/report-schedule.test.js` | Next-run maths per frequency, clamping, recipient parsing/dedup/cap, sweep claim semantics |
| `backend/tests/report-calculations.test.js` | Table calculations (all six, limit ordering, per-series partitioning, totals), to-date/fiscal presets, prompted filters and `meta.parameters`, global filters under `OR`, every insight kind, snapshot ring buffer |
| `backend/tests/report-alerts.test.js` | Hourly schedules, alert validation and storage shape, baseline survival across edits, `evaluateAlert` per operator, skipped vs sent deliveries, in-app notification, Send-now override |
| `backend/tests/ai-reporting.test.js` | Semantics keys resolve against the registry, plan schema enums equal the vocabulary, source routing, validator messages, value coercion, chart recommender, numeral grounding, provider factory, and `ask()` end to end with the stub model: repair round-trip, give-up, clarify/refuse/chitchat, outage, throttling |
| `frontend/tests/ReportResult.test.jsx` | Totals rendering, null totals, comparison deltas, warnings, empty state, every visualization, conditional formatting, filter-tree helpers, report→widget mapping |
| `frontend/tests/ReportingExtras.test.jsx` | Parameter bar, insights panel and Explain gating, trend strip series, Ask panel (starter chips, success, clarify → follow-up, disabled state), alert subscriptions, dashboard date filter re-fetching report widgets only, Show-as and Ask-when-running controls |

The engine tests use a Prisma double and need no database.

---

## Related

- [Reports (user guide)](../user-guide/19-reports.md)
- [AI reporting ("Ask")](AI_REPORTING.md) — the natural-language layer over this engine
- [Dashboard Analytics](DASHBOARD_ANALYTICS.md) — the built-in dataset catalogue
- [API Reference](API_REFERENCE.md)
- [Security](SECURITY.md)
