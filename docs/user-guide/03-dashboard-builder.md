# Dashboard Builder

> **Builder → Configure** · `/builder/dashboard` · Build drag-and-drop dashboards from charts, metric cards,
> and other widgets.

## What it is

The Dashboard Builder lets you assemble dashboards from a palette of widgets (charts, metric cards, tables, and
more) on a resizable grid. You arrange widgets by dragging and resizing them, configure each widget's title and
data, and control which roles can see the finished dashboard. Dashboards are saved per workspace and surface the
numbers your team cares about.

## Where to find it

Sidebar → **Builder** → **Configure** → **Dashboard**. Requires an **Admin** or **Super Admin** role.

The editor opens at `/builder/dashboard` for a new dashboard, or `/builder/dashboard/<id>` when you select an
existing one from the toolbar.

## Before you begin

- Make sure the objects or data you want to visualize already exist (see
  [Modules & Objects](01-modules-and-objects.md)).
- Know which role should see the dashboard if you plan to restrict visibility.

## Create a dashboard: step by step

1. Go to **Builder → Configure → Dashboard**. A fresh, empty canvas opens with the **Dashboard Builder** toolbar
   across the top.
2. In the toolbar, the dashboard selector shows **+ New Dashboard**. Leave it on that to start a new one, or pick
   an existing dashboard to edit it.
3. (Optional) Set **Visible to** to a role to restrict the dashboard, or leave it on **All Roles**.
4. Add widgets from the left **Widget Palette**:
   - Use the **reports** / **built-in** / **blank** toggle at the top of the palette to switch sections.
   - **reports** is the fastest route, and the one that needs no technical help: click any report you built in
     [Reports](19-reports.md) and you get a widget already wired to it, with the right shape and chart type
     chosen for you. Nothing else to configure. (There is a **Reports** shortcut in the Builder menu itself if
     you need to go and build one first — reports are available to every user, not just admins.)
   - **built-in** lists the ready-made metrics that ship with Genesis (for example **Opportunity Pipeline Value**
     or **Open Leads**) — click one for a fully-wired widget.
   - In **blank**, click an empty widget or a chart shape, then choose what it should show on the **Data** tab.
5. Arrange the widgets on the grid. Drag a widget by its header (the grip handle) to move it, and drag its edges
   or corners to resize. The grid is 12 columns wide.
6. Click a widget to select it, then use the right **Widget Config** panel:
   - On the **Appearance** tab, set the **Widget Title**, the chart type, and **Width (cols)** /
     **Height (rows)**.
   - On the **Data** tab, choose where the numbers come from: **A saved report** (anything you built in
     [Reports](19-reports.md)) or **A built-in dataset** (the ready-made metrics that ship with Genesis).
     Either way the panel shows a live preview of what came back.
7. Use **Preview** in the toolbar to see the dashboard without edit handles, and **Edit** to return.
8. Click **Save Dashboard**. A new dashboard is created and the URL updates to include its ID; further saves
   update it in place.

## Reference: fields & options

| Field / Option | What it does | Notes |
| --- | --- | --- |
| Dashboard selector | Switches between **+ New Dashboard** and existing dashboards | Top-left of the toolbar |
| Visible to | Restricts the dashboard to one role, or **All Roles** | Stored as the dashboard's `min_role` |
| Widget count | Shows how many widgets are on the canvas | Read-only badge in the toolbar |
| Preview / Edit | Toggles between the live preview and the editing grid | Hides palettes in Preview mode |
| Save Dashboard | Creates or updates the dashboard and all its widgets | New widgets are added, existing ones updated |
| Delete | Removes the dashboard and all its widgets | Only available for a saved dashboard; asks to confirm |

### Widget types (Widgets palette)

| Widget type | What it shows | Default size (cols x rows) |
| --- | --- | --- |
| Chart / Graph | A configurable chart | 6 x 4 |
| Metric Card | A single key number plus an optional change value | 3 x 2 |
| Data Table | A tabular data widget | 8 x 5 |
| List View | A simple list widget | 4 x 4 |
| Pipeline Board | A Kanban-style pipeline board widget | 12 x 6 |
| Custom HTML | A custom HTML block | 4 x 3 |

### Chart types (Charts palette)

| Library | Chart types |
| --- | --- |
| recharts | Bar, Stacked Bar, Line, Area, Stacked Area, Pie, Donut, Scatter, Radar, Radial Bar, Treemap, Funnel, Composed, Waterfall |
| apexcharts | Heatmap, Candlestick, Gauge/Radial, Bubble, Timeline/Gantt |

### Widget Config panel

| Field | Applies to | What it does |
| --- | --- | --- |
| Widget Title | All widgets | Sets the heading shown on the widget |
| Chart Type | Chart widgets | Picks the chart style from the chart-type list |
| X-Axis Key | Chart widgets | The data field used for the x-axis (for example `month`) |
| Y-Axis Data Key(s) | Chart widgets | The data field used for the values (for example `value`); comma-separate several fields to plot multiple series |
| Value Key / Change Key | Metric cards | The data fields for the main number and its change |
| Width (cols) / Height (rows) | All widgets | The grid footprint, from 2 up to 12 |

### Chart appearance (chart widgets)

Below the size controls, chart widgets have an **Chart appearance** block. Only the controls that make sense
for the chosen chart type are shown.

| Control | What it does |
| --- | --- |
| Palette | Organization default (from Appearance & Branding), Brand colours, or a named palette |
| Series colours | Hex colours in series order, overriding the palette |
| Legend | Automatic, always below, always above, or hidden |
| Number format / Decimals / Currency code | How values print on axes, tooltips and labels: number, compact (1.2K), currency, percent, whole number |
| Sort | As returned, largest first, smallest first |
| Top N (+ Other) | Keep the N largest categories and fold the rest into one **Other** bar/slice |
| X-axis / Y-axis title | Axis captions |
| Goal line / Goal label | A dashed reference line at a target value |
| Data labels · Grid lines · Smooth curves · Stacked | Toggles |

### Data Source tab

| Field | What it does | Notes |
| --- | --- | --- |
| Where the numbers come from | Chooses **A saved report**, **A built-in dataset** or **Records of an object** | Drives the rest of the fields |
| Object / Measure / Group by | For **Records of an object**: which object, what to compute (number of records, or the sum, average, minimum or maximum of a field), and how to split it (`stage`, `created_month` or a field) | Any Builder object works. Each viewer sees only the records they may see |
| Filters (optional JSON) | For **Records of an object**: e.g. `[{"field":"stage","op":"nin","value":"declined,withdrawn"}]` | Ops: `eq neq in nin gt gte lt lte contains empty notempty` |
| Report | The saved report the widget shows | Grouped by category. A report whose shape does not fit the widget type is flagged but still selectable |
| Dataset | The built-in dataset the widget reads | Grouped by category and filtered to datasets that fit the widget type |
| Live result | Preview of what came back right now, plus which column is the category and which are the measures | Use it to confirm the widget is pointing at the right thing |

A report-backed widget has **no axis keys to set** — it reads the categories and measures from the report
itself. Change the grouping or measures in the report and every dashboard using it follows automatically.

> **Widgets created before this** may still hold fixed values entered by hand. The Data tab shows what they
> contain, read-only, so you can move them onto a saved report. The old **External REST API** option has been
> removed.

### The dashboards that ship

One board is installed with the demo data. It doubles as a working reference
for what a dashboard can look like.

| Dashboard | What it answers | Notable charts |
| --------- | --------------- | -------------- |
| **Sales Dashboard** | Where does business come from, and how is the pipeline converting? | Pipeline value **funnel** by stage, lead-source **donut**, leads-by-status **bar**, won vs lost **stacked bar** by month |

The board uses its own palette, money is shown compactly (`$2.8M` rather than
`2750000`), counts are whole numbers, and axes are labelled. You can change any
of it: open the dashboard in the Builder, click a widget, and edit the
**Chart appearance** block described above.

> This board is managed as code (`backend/prisma/crm-dashboards.js`), installed
> when a tenant is onboarded and reinstalled by `node scripts/seed-dashboards.js`.
> Edits you make to it in the Builder are replaced the next time the script runs —
> copy a board first if you want to keep your own version.

### Live datasets

Live datasets are computed from this workspace's own records every time a widget renders, so a dashboard never
goes stale and never ships a copy of your numbers inside its configuration. Each dataset has a shape that decides
which widgets can use it:

| Shape | Used by | Categories available |
| --- | --- | --- |
| Series | Chart widgets | Pipeline (opportunity value by stage, leads by source and status, won vs lost) |
| Metric | Metric Cards | KPIs (open pipeline, open leads) |
| Rows | List / Data Table widgets | Lists (when a row dataset is available) |

Every dataset is scoped to your workspace and respects the signed-in user's session — a dashboard shared with
another tenant shows that tenant's numbers, not yours.

## Tips

- Start from the **reports** palette section. It is the only route that lets you put a *new* number on a
  dashboard without anyone technical: build the report first, then click it here.
- Report-backed widgets have nothing to keep in sync by hand — no axis keys, no column names. Refine the report
  and the dashboard follows.
- A chart plots one series per measure in the report, so add a second measure to the report to get a second
  series.
- Add a chart from the **charts** section of the palette to start with the chart type already set; you can still
  change it later on the **Config** tab.
- The grid is 12 columns wide. Keep a Metric Card narrow (around 3 columns) and a Pipeline Board full width.
- Use **Preview** before saving to confirm the layout looks right without the drag handles in the way.

## Related guides

- [Modules & Objects](01-modules-and-objects.md)
- [Form Builder](02-form-builder.md)
- [Pipeline Builder](04-pipeline-builder.md)
- [Reports](19-reports.md) — ad-hoc, exportable analysis, as opposed to a standing dashboard
- [Dashboard Analytics (developer guide)](../developer-guide/DASHBOARD_ANALYTICS.md) — how the live
  datasets are built, and how a developer adds one

## Troubleshooting

- **A chart is blank** — the **X-Axis Key** or **Y-Axis Data Key** probably does not match a field in your data.
  Open the **Data Source** tab, compare the keys against the **Live response** preview, and update them on the
  **Config** tab.
- **A live widget says "No data available"** — the endpoint worked but your workspace has no matching records
  yet (for example no opportunities closed this year). Add the underlying records and the widget fills in on its own.
- **The Dataset list is empty** — the widget type has no datasets of its shape. Metric Cards only accept KPI
  datasets and List views only accept row datasets; switch the widget type or pick a different dataset.
- **The Report list is empty** — you have no saved reports yet. Build one in [Reports](19-reports.md), then
  come back; it appears in the list immediately.
- **A report-backed widget looks wrong** — open the report itself (the **Open this report to change it** link in
  the Data tab) and check its grouping and measures. The widget always mirrors the report.
- **I cannot delete a dashboard** — the **Delete** button only appears once a dashboard has been saved. Save it
  first, then delete.
