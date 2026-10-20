# Design System — the "widget" language

<!-- nav:top -->
> **[Docs roadmap](../README.md)** › **[Developer guide](README.md#core-reading-in-order)** › 8 of 9 · **For:** Frontend engineers
> ← [Performance optimisation](performance-optimization.md) · [Contributing](contributing.md) →
> New to Genesis? Background: [Understanding Genesis › Codebase tour](../understanding/08-codebase-tour.md)
<!-- /nav:top -->

Genesis CRM's UI/UX layer sits **on top of** the metadata-driven rendering framework: metadata
still defines *what* renders (modules, objects, forms, wizards, dashboards); this design system
defines *how* it looks. The goal is a modern, chic, snappy, "widget-ized" feel that makes the app
engaging to use. Reach for these shared primitives before writing bespoke markup so every screen
stays consistent.

## Design tokens (`frontend/src/index.css`)

| Class | Use |
| --- | --- |
| `.widget` | Self-contained surface — rounded, subtle border, soft elevation. The default container for a "widget". |
| `.widget-hover` | Adds a hover lift + pointer; compose on interactive/clickable widgets. |
| `.widget-accent` | Thin gradient ribbon along the widget's top edge. |
| `.widget-pad` | Standard internal padding (`p-5`). |
| `.widget-title` | Small uppercase eyebrow label (primary colour). |
| `.widget-value` | Large bold metric value. |
| `.icon-chip` | Gradient brand icon square (primary → mid → accent). Size it with `h-*/w-*`. |
| `.aurora-wash` | Soft radial brand glow for headers. |
| `.card` | Heavier framed surface. |
| `.text-gradient` | Brand gradient text. |
| `.modal-scrim` | Blurred dialog backdrop — becomes a bottom sheet on small screens. |
| `.modal-panel` | Elevated, rounded dialog panel (`rounded-t-3xl` mobile → `rounded-3xl`). |
| `.modal-accent` | Brand gradient ribbon for a dialog panel's top edge. |

Palette, shadows, gradients, and animations (`fade-in`, `slide-in`, `slide-up`, `scale-in`, `pop`,
`spin-slow`, `float`, `shimmer`) live in `tailwind.config.js`; `animate-shake` is in `index.css`.
`primary`, `accent` and `mid` (the gradient middle stop) are CSS variables, so a tenant's Appearance
settings recolour the whole UI at runtime (`utils/appearance.js` writes the ramps). Use `primary`,
`accent`, `mid`, `sky2` (cyan) and `night` (dark-mode surfaces) rather than fixed colours such as
`indigo` or `purple`.

## Shared components (`frontend/src/components/ui/`)

- **`PageHeader`** — top-of-page title block. Props: `icon`, `eyebrow`, `title`, `subtitle`,
  `actions`. Renders a gradient icon chip + display title over an aurora wash. Use it as the first
  element on every page.
- **`StatTile`** — a compact KPI widget. Props: `icon`, `label`, `value`, `delta` (`{value, suffix}`),
  `sub` (muted caption), `tone` (`primary|accent|sky|emerald|amber|rose`), `onClick`. Lay several
  out in a `grid gap-4 sm:grid-cols-2 lg:grid-cols-4`. It also exports `toneForColor(color)` to map
  legacy Tailwind colour names (`indigo/green/blue/amber/red/purple`) to tones — handy when adapting
  an existing `StatCard`-style component to delegate to `StatTile`.
- **`EmptyState`** — engaging empty placeholder. Props: `icon`, `title`, `message`, `action`,
  `compact`. Encourages the next action instead of dead-ending.
- **`DataTable`** — widget-framed table. Optional `title` / `subtitle` / `icon` / `actions` header
  slot; renders `EmptyState` when empty (`emptyText`, `emptyMessage`, `emptyIcon`, `emptyAction`).
  Pass `frame={false}` when the table already lives inside a `.card` to avoid double-framing.
- **`Button`** — variants: `primary`, `secondary`, `outline`, `danger`, `warning` (amber),
  `ghost`, `glass` (frosted translucent-white — for use on gradient/dark headers), `link`. Sizes:
  `xs`–`xl`, `icon`. Prefer semantic variants over one-off `className` colours.
- **`Modal`** — the shared dialog surface: a blurred scrim, a rounded panel with a brand accent
  ribbon and an aurora-washed header, a scroll-contained body, and a tinted footer (when the
  `footer` prop is passed). Becomes a bottom sheet on mobile; motion respects
  `prefers-reduced-motion`. Props: `open`/`isOpen`, `onClose`, `title`, plus optional `icon`
  (gradient chip), `eyebrow`, `subtitle`, `footer`, `size` (`sm`–`xl`, `full`), `accent`
  (ribbon, default on), `hideClose`, `closeOnBackdrop`, `className`. **Reach for `Modal` before
  hand-rolling a dialog**; if a surface truly can't (full-screen viewer, tabbed composer), compose
  `.modal-scrim` + `.modal-panel` (+ `.modal-accent`) so it still matches.

## Patterns

- **Every page starts with a `PageHeader`.** Give it the module/feature icon and a warm subtitle.
- **Group KPIs into `StatTile`s**, not bespoke divs.
- **Lists use `DataTable`.** Provide an `emptyAction` (e.g. a "New …" button) so empty tables invite
  action.
- **Interactive tiles** get `.widget .widget-hover`. Static panels get `.widget` or `.card`.
- **Keep motion subtle** — `animate-slide-up` on entrance, small hover translate/scale. No spinners
  where a skeleton or gradient shimmer reads better.

## Adding a new page — checklist

1. `PageHeader` with an icon, title, and an encouraging subtitle.
2. A KPI row of `StatTile`s if the page has metrics.
3. `DataTable` (or `.widget` / `.card` panels) for the body, with a friendly `EmptyState`.
4. Use tokens (`.widget`, `.icon-chip`, brand palette) — avoid one-off colors so light/dark stay
   consistent.

## Reference implementations

- Wizard runtime: `components/runtime/WizardStepper.jsx` (widget rail + gradient progress ring),
  `components/runtime/WizardRenderer.jsx`.
- Module views: `pages/runtime/ModulePage.jsx` (widget header).
- Dashboard home: `pages/runtime/RuntimeHome.jsx` (`PageHeader` + greeting).
- KPI-heavy page: `pages/platform/PlatformDashboard.jsx` (`StatTile` grid; `StatCard` delegates
  to `StatTile` via `toneForColor`).
- List page with header actions: `pages/runtime/DocumentsPage.jsx`
  (`PageHeader` + stats + list).

## Coverage

The widget language leads every primary surface: the metadata-driven runtime hubs (dashboard
home, module views, wizard runtime), the
Builder list/config pages (Modules & Objects, Pipelines, Workflows, Wizards, Assignment, Lead
Scoring, Integrations, Integration Health, Push Notifications, Email Templates, Permissions,
Roles, Employees, Social Media, Builder home), and the Platform-admin suite (Dashboard, Tenants,
Plans, Feature Flags, Security, Analytics, Announcements, Audit Log).

Intentionally excluded — these have purpose-built layouts, not page headers: full-canvas editors
(Form / Dashboard / Report builders) and sticky full-height toolbars (SLA Engine, Org Chart).

<!-- nav:bottom -->

---

### Where to next

| | |
|---|---|
| **Next** | [Contributing](contributing.md) — Code style, testing, pull requests |
| **Previous** | [Performance optimisation](performance-optimization.md) |
| **Background** | [Understanding Genesis › Codebase tour](../understanding/08-codebase-tour.md) |
| **Lost?** | [Docs roadmap](../README.md) · [Developer guide](README.md#core-reading-in-order) · [Understanding Genesis](../understanding/README.md) |
<!-- /nav:bottom -->
