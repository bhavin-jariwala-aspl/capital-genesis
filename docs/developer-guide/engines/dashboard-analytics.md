# Dashboard Analytics — Live Data for Dashboard Widgets

<!-- nav:top -->
> **[Docs roadmap](../../README.md)** › **[Engine references](README.md)** › 7 of 12 · **For:** Engineers
> ← [Reporting engine](reporting.md) · [Document management](document-management.md) →
> New to Genesis? Background: [Understanding Genesis › How data is stored and read](../../understanding/03-how-data-is-stored.md)
<!-- /nav:top -->

Dashboard widgets do not store numbers. They store a **pointer to a dataset**, and
fetch the numbers from `/api/analytics` every time they render.

This document covers the implementation: the pieces involved, how data flows from
a Prisma table to a rendered chart, how to add a dataset, and the conventions the
existing datasets follow.

The datasets here are **developer-authored** — adding one is a code change. That is
by design: they are the pre-computed metrics that ship with Genesis. They read the
`crm_leads` and `crm_opportunities` tables, which are empty in Genesis Capital. The path
that needs no developer is a **saved report**, which any business user can build and drop
onto a dashboard — see [reporting.md](reporting.md). Reports also read only fixed typed
tables. For Builder objects (every Genesis Capital object) use an **object widget**
(`{ type: 'object' }`, below); all 15 Genesis Capital dashboards are built from them. See
[How data is stored](../../understanding/03-how-data-is-stored.md).

For the end-user view of the same feature, see
[Dashboard Builder](../../builder-guide/05-dashboard-builder.md). For the endpoint
contract, see [Analytics · `/api/analytics`](../api-reference.md#analytics--apianalytics).

---

## Why it works this way

A widget that embeds its own JSON has three problems: the numbers are frozen at
authoring time, they are duplicated into every dashboard that wants them, and they
sit in a config blob that is copied around (and cached in Redis) without any
tenant-awareness of their own.

Storing a dataset key instead fixes all three. The widget config becomes small and
portable, the same dataset can back a widget on five dashboards, the Redis cache on
`getDashboard()` caches *layout* rather than *numbers*, and the figures are computed
per-request under the caller's tenant scope.

---

## How it fits together

| Piece | File | Role |
| --- | --- | --- |
| Dataset catalog + runners | `backend/src/services/analytics.service.js` | The `DATASETS` array: metadata plus an `async run(db)` per dataset |
| Object widgets | `backend/src/services/object-analytics.service.js` | Aggregates the records of any Builder object (EAV) for `{ type: 'object' }` widgets |
| Routes | `backend/src/routes/analytics/index.js` | `GET /datasets`, `GET /data/:key`, `POST /object` |
| Route registration | `backend/src/app.js` | Mounted at `/api/analytics` |
| Tenant isolation | `backend/src/middleware/tenant-scope.js` | Prisma extension; injects `tenant_id` into every read |
| API client | `frontend/src/services/analytics.service.js` | `getDatasets()`, `getData(key)` |
| Data resolver | `frontend/src/hooks/useDataSource.js` | Resolves any `data_source` descriptor to live data |
| Widget/chart merge | `frontend/src/utils/dashboard.js` | `resolveWidgetChart`, `shapeForWidgetType`, `widgetUpdatesForDataset` |
| Chart rendering | `frontend/src/components/runtime/ChartRenderer.jsx` | 19 chart types over recharts + ApexCharts |
| Runtime dashboard | `frontend/src/components/runtime/DashboardRenderer.jsx` | Metric cards, charts, text and list widgets |
| Builder canvas | `frontend/src/components/builder/DashboardCanvas.jsx` | Same renderers, live previews on the editing grid |
| Builder palette | `frontend/src/components/builder/WidgetPalette.jsx` | **Live** section — one click adds a wired widget |
| Builder config panel | `frontend/src/components/builder/WidgetConfigPanel.jsx` | Dataset picker + endpoint display + response preview |
| Catalogue | `backend/prisma/crm-dashboards.js` | Onboarding dashboards; built from `DATASETS` so configs cannot drift |
| Tests | `backend/tests/analytics.test.js`, `object-analytics.test.js` | Runs every catalog entry against a Prisma double; object-widget aggregation |

---

## Data flow

```text
CrmOpportunity / CrmLead / …   (Prisma models)
        │
        │  dataset.run(db) — groupBy / aggregate / findMany, never $queryRaw
        ▼
AnalyticsService.getData('opportunity-win-loss-monthly')
        │  tenant-scope extension injects tenant_id into every read
        ▼
GET /api/analytics/data/opportunity-win-loss-monthly   → { success, data, meta }
        │
        │  useDataSource() — react-query, keyed on the serialised descriptor
        ▼
widget.data_source = { type: 'endpoint', dataset: 'opportunity-win-loss-monthly' }
        │
        │  resolveWidgetChart(widget) merges inline config over any linked chart
        ▼
<ChartRenderer chart={…} />  → recharts stacked <BarChart>
```

### Widget data source shapes

`ui_dashboard_widgets.data_source` (and `ui_charts.data_source`) accepts these
descriptors, all handled by `useDataSource`:

| Descriptor | Transport | Notes |
| --- | --- | --- |
| `{ type: 'report', report_id, shape }` | axios client (JWT attached) | **The self-service default.** Resolves to `GET /api/reports/<id>/data?shape=…` — any saved report becomes a widget. See [reporting.md](reporting.md#report-backed-dashboard-widgets) |
| `{ type: 'object', object, metric, field?, group_by?, filters? }` | axios client (JWT attached) | Aggregates the records of **any Builder object**: `POST /api/analytics/object`. `metric` count/sum/avg/min/max; `group_by` `stage`, `created_month` or a field; filters `{ field, op, value }` (`stage` filters on the stage API name). Scoped by the viewer's record access (owner, business unit, barrier). Builder: *Records of an object*. See [platform-builder-extensions.md](platform-builder-extensions.md#8-object-analytics) |
| `{ type: 'endpoint', dataset }` | axios client (JWT attached) | One of the pre-computed datasets below — `GET /api/analytics/data/<dataset>` |
| `{ type: 'endpoint', url, dataPath? }` | axios client (JWT attached) | Any other internal API path |
| `{ type: 'json', data }` | none | Static inline payload, resolved synchronously. Read-only back-compat; the builder no longer offers it |

`{ type: 'api', … }` (external REST) **has been removed**, along with `fetchExternal`.
It required a URL, hand-written auth headers and a dot-notation path — knowledge no
business user has — and let a dashboard author point the browser at an arbitrary
host. The descriptor no longer resolves.

`useDataSource` returns `{ data, meta, loading, error, refetch }`. `meta` is populated
for report-backed widgets and carries the report's own description of itself
(`xKey`, `series`, `columns`), which is why such a widget stores no field names.
Two thin wrappers normalise the payload: `useDataSourceRows` coerces to an array
(charts, lists) and `useDataSourceRecord` unwraps to a single object (metric cards).

### Widget ↔ chart-record precedence

A chart widget can either link a saved `ui_charts` record via `chart_id` or carry
its own inline `config` / `data_source`. `resolveWidgetChart()` merges them with the
**widget winning**, so edits in the builder's config panel take effect immediately
without mutating the shared chart definition. The seed uses both paths so each stays
exercised.

---

## Dataset shapes

Every dataset declares a `shape`, which decides which widget types may consume it.
`shapeForWidgetType()` maps the other direction, and the builder's picker filters on
it — a Metric Card will not offer you a 12-row time series.

| Shape | `run()` returns | Widget types | Config the builder pre-fills |
| --- | --- | --- | --- |
| `series` | Array of row objects | `chart` | `chart_type`, `xAxisKey`, `yAxisKey` |
| `metric` | `{ value, change?, trend?, raw? }` | `metric` | `valueKey`, `changeKey` |
| `rows` | Array of flat objects | `list`, `table` | `columns` |

`trend` is `up` / `down` / `flat` and drives the colour and icon on the KPI card.

---

## Adding a dataset

Append an entry to `DATASETS` in `analytics.service.js`. No route, migration or
frontend change is needed — it appears in the builder's picker on the next page
load, and `analytics.test.js` covers it automatically.

```js
{
  key: 'leads-created-monthly',
  label: 'New Leads per Month',
  description: 'Leads created each month over the last year.',
  category: 'Pipeline',
  shape: 'series',
  chart_type: 'line',   // suggestion — the builder pre-fills it
  xKey: 'month',
  yKey: 'created',
  async run(db) {
    const buckets = monthBuckets(12);
    const rows = await db.crmLead.findMany({
      where:  { created_at: { gte: buckets[0].start } },
      select: { created_at: true },
      take:   MAX_ROWS,
    });
    const counts = new Map(buckets.map((b) => [b.key, 0]));
    for (const r of rows) {
      const k = monthKey(r.created_at);
      if (counts.has(k)) counts.set(k, counts.get(k) + 1);
    }
    return buckets.map((b) => ({ month: b.label, period: b.key, created: counts.get(b.key) }));
  },
}
```

### Rules

1. **Never use `$queryRaw`.** The tenant-scope extension hooks Prisma's query
   pipeline; raw SQL bypasses it and would leak across tenants. Use `findMany`,
   `groupBy`, `aggregate` and `count`.
2. **Cap your reads.** Pass `take: MAX_ROWS` (5000) on `findMany`, or something
   smaller for point-per-record charts (scatter, bubble, timeline).
3. **Convert Decimals.** Prisma returns `Decimal` for money columns; the `num()` and
   `round()` helpers coerce them so JSON serialisation and chart maths behave.
4. **Return a stable shape on empty data.** A dataset that returns `[]` renders "No
   data available". Where a fixed domain exists, prefer emitting zeroes.
5. **Match the chart contract.** `xKey` / `yKey` must be real field names in the rows
   you return; `ChartRenderer` reads them straight through.

### Shared helpers

| Helper | What it does |
| --- | --- |
| `monthBuckets(n)` | The last `n` months as UTC `{ key, label, start, end }`, oldest first |
| `monthKey(date)` | UTC `YYYY-MM` key for bucketing |
| `tallyByDomain(rows, field, domain, keys)` | Counts by field, emitting every domain value including zeroes |
| `withDelta(model, dateField, days, where)` | Current vs preceding window counts, for KPI change values |
| `delta(current, previous)` | Turns those counts into `{ change, trend }` |
| `money(v)` | Compact currency (`$48.2M`, `$3.7K`) |
| `titleize(s)` | `closed_won` → `Closed Won` |

---

## Conventions the existing datasets follow

- **Status datasets keep their full domain.** `tallyByDomain()` emits every known
  enum value, so a bar chart keeps a complete axis before the tenant has records in
  each state — and a status appearing later does not change the chart's shape.
- **Month buckets are fixed-length and UTC.** `monthBuckets(12)` always returns 12
  entries ending with the current month, so a sparse table still yields a continuous
  time series with real zeroes rather than gaps.
- **Multi-series datasets declare `yKey` as an array** — e.g.
  `opportunity-win-loss-monthly` → `['won', 'lost']`. `ChartRenderer` treats the
  array as its series list. For `composed` charts the first key is drawn as bars and
  the second as the overlaid line.
- **Some metric trends are inverted.** For a metric where more is worse (a backlog
  of unresolved items, say), report a *rise* as `trend: 'down'`. Decide this per
  metric rather than assuming up-is-good.
- **Money metrics carry both forms.** `value` is the display string (`'$48.2M'`) and
  `raw` the number, so a consumer that needs to compute is not re-parsing a label.

---

## Chart type reference

`ChartRenderer` switches on `chart_type`; anything unrecognised falls back to `bar`.

| Library | Types |
| --- | --- |
| recharts | `bar`, `bar_stacked`, `line`, `area`, `area_stacked`, `pie`, `donut`, `scatter`, `radar`, `radial_bar`, `treemap`, `funnel`, `composed`, `waterfall` |
| ApexCharts | `heatmap`, `candlestick`, `gauge`, `bubble`, `timeline` |

Row shapes a few of the less obvious types expect:

| Type | Expected row |
| --- | --- |
| `heatmap` | `{ series, name, value }` — `series` becomes the y-axis band |
| `candlestick` | `{ x, open, high, low, close }` |
| `timeline` | `{ series, task, start, end }` — `start`/`end` are dates |
| `bubble` | `{ [xKey], [yKey], r }` — `r` is the bubble radius |
| `gauge` | A single row `{ name, value }`, `value` a 0–100 percentage |
| `waterfall` | `{ [xKey], [yKey] }` where negative values step down |

---

## Seeded dashboards

The generic dashboard catalogue imports `DATASETS` from the service and derives each widget's
chart type and axis keys from it, so a change to a dataset's suggested keys propagates
to every newly onboarded tenant automatically. Its dashboards cover the CRM pipeline datasets — open
pipeline, lead sources and status, opportunity stages and won-vs-lost by month.

`prisma/seed.js` does not install this catalogue. The Genesis Capital workspace gets its 15
dashboards from its vertical pack (`prisma/verticals/genesis-capital/content.js`), and every widget
there is an object widget over a Genesis Capital object.

Some widgets render through saved `ui_charts` records (`chart_id`) rather than
inline config, keeping the chart-library path exercised.

---

## Testing

`backend/tests/analytics.test.js` mocks `@prisma/client` and supplies a Prisma
double whose delegates return empty results by default, so no database is needed.

- **Catalog invariants** — unique keys, runners stripped from the public catalog,
  every `series` dataset carrying a chart type and axis keys, every `rows` dataset
  carrying columns.
- **Every dataset executes** — a parameterised case per catalog entry asserts the
  runner completes and returns its declared shape against empty data. New datasets
  inherit this the moment they are registered.
- **Aggregation behaviour** — month bucketing, status-domain completeness and
  multi-series row shapes.

---

## Related guides

- [Dashboard Builder (user guide)](../../builder-guide/05-dashboard-builder.md)
- [api-reference.md — Analytics](../api-reference.md#analytics--apianalytics)
- [data-dictionary.md — `ui_dashboard_widgets` / `ui_charts`](../data-dictionary.md)
- [security.md](../security.md) — tenant isolation and the Prisma scope extension

---

## The shipped dashboards (September 2026)

The demo boards are a catalogue in
[`backend/prisma/crm-dashboards.js`](../../../backend/prisma/crm-dashboards.js), installed by
[`backend/scripts/seed-dashboards.js`](../../../backend/scripts/seed-dashboards.js). Tenant onboarding calls
the same installer (its dashboards step, skipped when the tenant already has dashboards), so a new
tenant and the standalone script cannot produce different boards — the arrangement `crm-workflows.js`
already uses for workflows. The seed does not run it; the Genesis Capital workspace has its own
15 dashboards, defined in its vertical pack.

```bash
node scripts/seed-dashboards.js --dry-run    # show what would change
node scripts/seed-dashboards.js              # replace the catalogue's own boards
node scripts/seed-dashboards.js --all        # also delete boards not in the catalogue
node scripts/seed-dashboards.js --tenant 4   # one tenant
```

By default only dashboards whose `name` is in the catalogue are replaced, so anything an admin built
themselves survives.

### What a catalogue entry looks like

```js
{
  dataset: 'opportunity-pipeline-by-stage', size: 'full', chart: 'funnel',
  title: 'Pipeline Value by Stage',
  appearance: { format: 'currency_compact', dataLabels: true, legend: 'hidden' },
}
```

`dataset` keys the analytics catalogue, `chart` optionally overrides that dataset's default type, and
`appearance` is the block `ChartRenderer` reads (see
[configurability.md → Chart appearance](configurability.md#chart-appearance)). Widgets used to be
seeded as `{ chart_type, xAxisKey, yAxisKey }` and nothing else, which is why every board rendered
money as bare integers, with no targets, labels, ranking or palette.

`size` (`kpi` · `half` · `full` · `tall`) is packed into 12-column grid coordinates by
`buildDashboard`, so no widget carries hand-maintained x/y/w/h any more. The runtime renderer flows
widgets by type and only distinguishes full-width from half-width, but the Builder canvas is a real
grid, so the coordinates still have to be correct — a test asserts no two widgets overlap.

### What the tests enforce

`tests/dashboard-catalogue.test.js` validates the catalogue against the live analytics catalogue and
the renderer's contract, because nothing at runtime rejects a mismatch:

- every `dataset` exists, and the widget type matches its shape (series → chart, metric → tile, rows → list);
- every chart type is one the renderer draws, and every `appearance` key is one it reads;
- **sort/topN are never set on a chart whose y-key is not a measure** — timeline, candlestick, bubble,
  heatmap, scatter and gauge, where ranking rows would reorder an OHLC candle or a Gantt row into nonsense;
- a `goal` line is only set on a chart type that draws one;
- a money dataset is never formatted as a bare integer;
- the catalogue between them uses **every** chart type the renderer supports.

<!-- nav:bottom -->

---

### Where to next

| | |
|---|---|
| **Next** | [Document management](document-management.md) — Storage providers, folders, search, sharing, templates, e-signature |
| **Previous** | [Reporting engine](reporting.md) |
| **Background** | [Understanding Genesis › How data is stored and read](../../understanding/03-how-data-is-stored.md) |
| **Lost?** | [Docs roadmap](../../README.md) · [Engine references](README.md) · [Understanding Genesis](../../understanding/README.md) |
<!-- /nav:bottom -->
