# Org Chart

> **Builder → Manage** · `/builder/org-chart` · Explore the entire organization's reporting hierarchy in one interactive view.

## What it is

The Org Chart is a single, interactive screen that visualizes **every member in the system** and how they report to
one another. Where the [Employees](15-employees.md) screen lists people one row at a time (and can pop a small chart
for a single person), the Org Chart draws the **whole company** as a top-down tree you can zoom, pan, search, filter,
collapse, and drill into. It is designed so that any level of the hierarchy can be understood at a glance.

The view is **read-only** — it is for understanding the structure, not editing it. To change who reports to whom, use
the **Reports To** field on the [Employees](15-employees.md) screen (there is an **Edit** shortcut in the detail panel
that takes you there).

## Where to find it

Sidebar → **Builder** → **Manage** → **Org Chart**. Requires an **Admin**, **Super Admin**, or **Platform Admin** role.

## The screen at a glance

- **Stats strip** (top) — Members (and how many are active), Managers, Levels (depth of the deepest branch), Top-level
  members (people with no manager), Average span (average direct reports per manager), and the current colour mode.
- **Toolbar** — search, filters, colour-by selector, collapse/expand all, and (in Chart view) zoom controls.
- **Canvas** — the org chart itself, or an indented Tree list, depending on the view toggle.
- **Detail panel** — slides in from the right when you click a member.

## Two views

Use the **Chart / Tree** toggle in the header:

- **Chart** — the classic top-down org chart. Each person is a card; direct reports hang below, connected by lines.
  Best for seeing shape, breadth, and reporting lines.
- **Tree** — a compact, indented, collapsible list. Best for scanning names quickly or working on a narrow screen.

Both views share the same search, filters, colour coding, selection, and collapse state.

## Interacting with the chart

### Navigate the canvas

- **Pan** — click and drag any empty area of the canvas to move around.
- **Zoom** — use the `−` / `+` buttons, or **Fit to screen** (the expand icon) to frame everything at once. The
  current zoom percentage is shown between the buttons.

### Collapse and expand

- Every manager card has a small pill at its bottom edge. Click it to **collapse** that person's team (the pill then
  shows the total number of people hidden below) or **expand** it again.
- **Collapse** / **Expand** buttons in the toolbar fold or unfold the entire chart at once. Start collapsed to see the
  top of the company, then open the branches you care about.

### Focus on a team

- Open any member's detail panel and click **Focus team** to re-root the chart on that person — the chart now shows
  only them and everyone below. A banner appears at the top; click **Show full org** to return to the whole company.

## Search and filter

- **Search** — type a name, Employee ID, role, email, branch, or region. Matches are highlighted with an amber border,
  the tree **auto-expands** to reveal them, and branches with no match are dimmed so the results stand out.
- **Filters** (click **Filters**) — narrow the chart by **Role**, **Region**, **Branch**, and **Status**
  (Active / Inactive). A person is shown if they match, or if anyone below them matches, so reporting lines stay
  intact. Click **Clear all** to reset.

## Colour coding

The **Colour by** selector tints each card so you can read the org by:

- **Role** — everyone at the same role level shares a colour (spot all managers, all agents, etc.).
- **Region** — one colour per region.
- **Branch** — one colour per branch.

A small green/grey dot on each avatar shows whether the person is **active** or **inactive**.

## The detail panel

Click any card (or any name in the Tree view) to open the detail panel, which shows:

- **Identity** — name, role, and active/inactive status.
- **Metrics** — **Direct** (direct reports), **Team** (everyone below at any depth), and **Level** (depth in the org).
- **Contact & placement** — Employee ID, email, phone, branch, region.
- **Reporting line** — the full chain from the top of the company down to this person; click any name to jump to them.
- **Direct reports** — a clickable list of the people who report to them.
- **Actions** — **Focus team** (re-root the chart here) and **Edit** (open the [Employees](15-employees.md) screen).

## Reference: controls

| Control | What it does |
| --- | --- |
| Chart / Tree toggle | Switch between the visual org chart and the indented list |
| Search box | Filter and highlight members by name, ID, role, email, branch, or region |
| Filters | Narrow by role, region, branch, and active/inactive status |
| Colour by | Tint cards by role level, region, or branch |
| Collapse / Expand (toolbar) | Fold or unfold the whole chart |
| Node pill (bottom of a card) | Collapse or expand that one team |
| Zoom `−` / `+` / Fit | Scale the chart; Fit frames everything |
| Drag on canvas | Pan around |
| Click a card | Open the detail panel |
| Focus team | Re-root the chart on the selected person |

## How the data is built

The screen loads the whole organization in a single request to `GET /api/auth/org-hierarchy` (admin only). The backend
returns all employees, the direct-report relationships, and the role levels; the browser assembles the tree from that.
Because the data comes from the same **employee hierarchy** that powers "Team" and "Hierarchy" permission scopes, the
chart always reflects the real reporting structure — set **Reports To** on the Employees screen and it appears here.

- People with no manager appear as **top-level** roots (a company can have more than one).
- Everyone below a person — at any depth — is counted in their **Team** total.

## Tips

- Set **Reports To** for as many people as possible on the Employees screen. Anyone without a manager shows up as a
  separate top-level root, which usually signals a gap to fix.
- Start **collapsed**, then expand only the branches you are reviewing — much easier than scrolling a fully expanded
  chart.
- Use **Colour by → Region** or **Branch** to sanity-check that people are grouped where you expect.
- Use **Focus team** before sharing your screen so the audience sees only the relevant part of the org.

## Related guides

- [Employees](15-employees.md) — add users and set who they report to
- [Roles & Levels](16-roles-and-levels.md) — define the access hierarchy that drives role colours
- [Permissions](14-permissions.md) — how the reporting hierarchy powers Team and Hierarchy scopes

## Troubleshooting

- **A person is missing** — They may be filtered out. Clear the search and filters, and check the **Status** filter is
  not hiding inactive members.
- **Someone is at the top level unexpectedly** — They have no **Reports To** set. Open the Employees screen and assign
  a manager.
- **The chart looks empty** — Either no employees exist yet, or your current filters exclude everyone. Use **Clear all**.
- **I can't edit the hierarchy here** — This screen is read-only by design. Use **Edit** in the detail panel (or the
  Employees screen) to change reporting lines.
