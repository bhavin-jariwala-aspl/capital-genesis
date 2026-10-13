# Genesis CRM — Configurability Engine Technical Reference

For: Developers extending the Builder or the runtime renderers

Everything here reflects the **actual implementation** as of September 2026. Grep the symbol names if line
numbers drift.

---

## Table of Contents

Part 1 — Appearance

1. [Mental model](#mental-model)
2. [Appearance & Branding](#appearance--branding)
3. [How the palette is generated](#how-the-palette-is-generated)
4. [Light/dark precedence](#lightdark-precedence)

Part 2 — Forms

1. [Validation engine](#validation-engine)
2. [Field appearance](#field-appearance)
3. [Per-form layout overrides](#per-form-layout-overrides)

Part 3 — Charts

1. [Chart appearance](#chart-appearance)

Part 4 — Working on it

1. [Testing](#testing)
2. [Known gaps](#known-gaps)
3. [Invariants — read before you change anything](#invariants--read-before-you-change-anything)

---

# Part 1 — Appearance

## Mental model

Genesis is metadata-driven: modules, objects, fields, forms, dashboards and workflows are rows, not code.
Until September 2026 the *presentation* layer was the exception — the brand colour, corner radius,
typeface and chart palette were compile-time Tailwind constants, and roughly 1,100 `indigo-*` classes were
hard-wired across 82 files. Field validation rules were rows, but only the browser read them.

The configurability engine closes those gaps along four axes, all tenant-level, all applied live:

| Axis | Where an admin edits it | Where it is stored | Who consumes it |
| --- | --- | --- | --- |
| Look & theme | Builder → Configure → **Appearance & Branding** | `tenant_configs` (`appearance.*`) + `tenants.primary_color/logo_url` | `utils/appearance.js` → CSS variables on `<html>` |
| Validations | Form Builder → field → **Validations** | `ui_validations` | Browser (`buildValidationRules`) **and** API (`validation-engine.js` via `RecordService`) |
| UI element look | Form Builder → field → **Look**; form layout `config` | `ui_fields.config`, `ui_form_field_layouts.config` | `FieldRenderer`, `normaliseFormMeta` |
| Charts | Dashboard Builder → widget → **Appearance** | `ui_dashboard_widgets.config.appearance` | `ChartRenderer` via `utils/chart.js` |

## Appearance & Branding

**Where an admin edits it:** Builder → Configure → **Appearance Studio** (`/builder/appearance`). The Studio is
an iOS-Settings-style panel: a section rail (Themes, Colours, Branding, Layout & shape, Typography, Light & dark,
Sign-in page, Charts, Motion), inset grouped lists of controls, and a sticky live preview (a miniature
workspace and a miniature sign-in page). The whole app is also the preview — every knob is applied to `<html>`
as the admin edits. A floating bar offers **Discard** / **Save for everyone**. Themes can be **exported** and
**imported** as JSON (`exportTheme` / `importTheme`; look keys only, never names or logos). The generic
Organization Settings page still renders the raw `appearance` group for completeness and links to the Studio.

**Settings** — the `appearance` group in `backend/src/services/settings.service.js` (schema-driven), plus the
pre-existing `organization.primary_color` and `organization.logo_url` tenant columns:

| Key | Type | Values / default |
| --- | --- | --- |
| `appearance.app_name` | text | "Genesis CRM" |
| `appearance.theme_preset` | text | id of the last preset applied, or `custom` (`genesis`) |
| `appearance.logo_dark_url`, `appearance.icon_url`, `appearance.favicon_url`, `appearance.login_image_url` | url | brand assets (see below) |
| `appearance.logo_display` | select | `mark_and_name` · `logo_only` · `name_only` |
| `appearance.accent_color` | color | `#d946ef` |
| `appearance.neutral` | select | `cool` · `slate` · `warm` · `graphite` — the grey ramp (`--n-*`) |
| `appearance.mode` | select | `light` · `dark` · `system` |
| `appearance.dark_surface` | select | `midnight` · `graphite` · `oled` — the dark surface stack (`--s-*`) |
| `appearance.allow_user_mode_toggle`, `appearance.allow_user_density` | boolean | what the Personalize panel offers |
| `appearance.radius` | select | `sharp` · `soft` · `rounded` · `pill` ("Continuous") |
| `appearance.density` | select | `compact` (14.5px) · `comfortable` (16px) · `spacious` (17px) |
| `appearance.surface_style` | select | `glass` · `flat` · `elevated` (`data-surface`) |
| `appearance.button_style` | select | `gradient` · `solid` · `soft` (`data-buttons`, styles `.btn-primary` and `.icon-chip`) |
| `appearance.motion` | select | `full` · `subtle` · `reduced` (`data-motion`) |
| `appearance.font` | select | `inter` · `cupertino` (SF stack) · `system` · `geometric` · `humanist` · `serif` |
| `appearance.heading_font` | select | `match` or any font (`--font-display`) |
| `appearance.background` | select | `aurora` · `plain` · `tinted` · `mesh` |
| `appearance.sidebar_style` | select | `light` · `dark` · `brand` · `glass` |
| `appearance.sidebar_width` | select | `compact` (200px) · `regular` (232px) · `wide` (264px) (`--sidebar-w`, Tailwind `w-sidebar`) |
| `appearance.nav_active_style` | select | `gradient` · `pill` · `line` (`data-nav`) |
| `appearance.chart_palette` | select | `vivid` · `brand` · `pastel` · `mono` · `ocean` · `warm` · `cupertino` |
| `appearance.login_layout` | select | `split` · `centered` · `cover` |
| `appearance.login_tagline`, `appearance.login_footer`, `appearance.show_powered_by` | text / text / boolean | |

Colours are validated as 6-digit hex; text is capped at 200 characters; `url` values must be `http(s)://…` or a
same-origin path (so `javascript:` / `data:` can never be stored). Saving is the ordinary `PUT /api/settings`.

**Theme presets** — `THEME_PRESETS` in `utils/appearance.js` (Genesis, Cupertino, Graphite, Midnight, Ocean,
Forest, Sunset, Royal). A preset sets every `THEME_KEYS` entry at once and leaves identity/logos alone;
`matchPreset(values)` names the current one (or `null` → "Custom"). Add a preset by adding an object — the test
suite checks every preset sets every theme key to a value `resolveAppearance` accepts.

**Brand assets** — `backend/src/services/branding.service.js` + routes in `routes/settings/index.js`:

| Route | Who | What |
| --- | --- | --- |
| `POST /api/settings/branding/assets` `{ kind, mime_type, data(base64) }` | admin | stores the file through the shared `StorageProvider` under `{tenant}/branding/{kind}_{sha256[0:16]}.{ext}` and writes its URL into the matching setting (`logo` → `organization.logo_url`, `logo_dark`, `icon`, `favicon`, `login_image` → `appearance.*_url`). PNG/JPEG/WebP/SVG/ICO, ≤ 1 MB (artwork ≤ 4 MB). SVGs containing `<script>`, `on*=` handlers, `javascript:` or embedded documents are refused. The previous asset is deleted when replaced. |
| `DELETE /api/settings/branding/assets/:kind` | admin | clears the setting, deletes our file |
| `GET /api/settings/branding/:tenantId/:file` | public | streams the asset (`Cache-Control: immutable` — the hash is in the name); filenames must match `ASSET_FILE_RE` |
| `GET /api/settings/branding/public/:tenantId` | public | the `appearance.*` values plus company name, logo and primary colour — what the sign-in page needs |

Public routes are rate-limited per IP (120/min) via `utils/rate-limit.js`. Uploads persist immediately (the
Studio shows them as saved, not as a draft).

**Runtime** — `frontend/src/utils/appearance.js`:

- `applyAppearance(values)` writes `--p-50…950`, `--a-50…950` (brand ramps), `--n-50…950` (neutral ramp),
  `--s-0…3` (dark surfaces: canvas, chrome, panel, raised), `--on-primary`, `--radius-sm…3xl`,
  `--base-font-size`, `--font-sans`, `--font-display`, `--sidebar-w`, and `data-background` / `data-sidebar` /
  `data-density` / `data-surface` / `data-buttons` / `data-motion` / `data-nav` / `data-font` onto `<html>`.
- `tailwind.config.js` maps `primary`, `accent` **and `gray`** to the ramps, adds `night-0…3` for dark surfaces,
  `w-sidebar`, `ease-spring` / `ease-ios`, and brand-tinted shadows (`shadow-card`, `shadow-primary`,
  `shadow-hig`, `shadow-hig-lg`) that read the variables. **Every literal dark hex (`#141327`, `#0d0c1e`,
  `#131224`, …) was swept to `night-*`** so the dark surface setting reaches every screen.
- `index.css` holds the defaults in `:root`, the Apple-style pieces (`.material` frosted chrome, `.seg` segmented
  control, `.ios-list` / `.ios-row` inset lists, `.large-title`, `.popover`, `.pressable`, hairlines) and the
  `html[data-*]` rules that implement surface, button, motion, sidebar and nav styles.
- `applyDocumentChrome()` sets the tab title and favicon (uploaded favicon → app icon → generated monogram SVG).
- `store/appearanceStore.js` loads `GET /api/settings/effective` after login, applies it, writes a **branding
  snapshot** to `localStorage` (`genesis-branding`, keyed by tenant), and layers the user's personal overrides.
  Signed out, `applyPreLoginBranding()` wears the snapshot and refreshes it from the public branding route, so the
  sign-in page shows the client's logo, colours, tagline and layout — not the vendor's.
- `components/ui/BrandLogo.jsx` is the one place identity renders (sidebar, sign-in, Studio previews): uploaded
  logo, dark variant on dark/brand surfaces, app icon, display mode, generated monogram.
- Charts read `useAppearanceStore(s => s.current)` for the tenant palette and the `--n-*` / `--s-*` tokens for
  axes and tooltips.

**Personalize panel** — `components/layout/PersonalizePanel.jsx` (header). Each person may pick light / dark /
auto, text size (density) and motion for their own browser, within what the organisation allows
(`allow_user_mode_toggle`, `allow_user_density`). Choices live in `themeStore` (`mode`, `density`, `motion`) and
are re-applied by `appearanceStore.applyUserPrefs`; "Use organization defaults" clears them. Admins see a link to
the Studio.

## How the palette is generated

`buildPalette(hex)` expands one colour into Tailwind's 11-step ramp. The supplied colour is pinned to shade
**500**, or to **600** when it is already dark (HSL lightness < 0.45), or **800** when very dark (< 0.2, e.g.
graphite) so hover/active states stay darker and the tints above stay usable. Other shades keep the hue, move
lightness to fixed targets (50 → 0.97 … 950 → 0.17), and ease saturation toward the ends so pale tints are not
neon and deep shades are not muddy. Indigo reproduces Tailwind's own ramp within a couple of points.

**Dark mode gets its own ramp.** `buildPalette(hex, { dark: true })` lifts every action shade (50–700) at least a
step above its light-mode counterpart (and never below the dark targets: 500 → 0.66, 600 → 0.58 …), easing
saturation as it lifts so the colour does not turn neon on near-black; 800–950 stay deep. This is the shift Apple
makes between its light and dark system colours (`#007aff` → `#0a84ff`), and it is why `text-primary-600` or
`bg-primary-600` keep contrast in dark mode **without** a `dark:` override. `applyAppearance` writes both ramps
(`--p-*` / `--pd-*`, `--a-*` / `--ad-*`); `index.css` points `--pc-*` / `--ac-*` at the light set on `:root` and
at the dark set under `html.dark`, and Tailwind's `primary` / `accent` read `--pc-*` / `--ac-*`. Text on the brand
is `--on-primary` / `--on-primary-dark` (judged against the 600 shade of each ramp) exposed as `text-on-primary`,
plus `--on-accent` (`text-on-accent`).

**Gradients have a derived middle stop.** `gradientMid(primary, accent)` is the hue half-way between the two the
short way round the wheel (an achromatic partner follows the coloured one), with saturation capped at 0.62 and
lightness between the two ends — so a green + gold brand sweeps through olive, not the fixed violet that used to
sit in every gradient. Exposed as `--g-mid(-600)` / `--gd-mid(-600)` → `--gc-mid(-600)` → Tailwind `mid`, `mid-600`.
**Every `via-violet-*` / `via-purple-*` / `to-violet-*` companion in a brand gradient was swept to `via-mid` /
`to-mid(-600)`, and every `text-white` on a `bg-primary-*` / `from-primary-*` surface to `text-on-primary`.**
`prefersLightText()` picks the readable text colour from relative luminance; `contrastRatio()` backs the WCAG
badge in the Studio.

## Light/dark precedence

1. The tenant default (`appearance.mode`) applies the first time a user signs in on a device.
2. After that, the user's own toggle (persisted by `themeStore` with `userChose = true`) wins…
3. …unless the admin disabled the toggle, in which case the tenant mode is re-applied on every login and the
   header hides the switch.

---

# Part 2 — Forms

## Validation engine

`backend/src/services/validation-engine.js` is the single evaluator. `RecordService.createRecord` runs it
over the submitted field map **before any write**; `updateRecord` runs it in *partial* mode (only the keys
in the body are checked, so an untouched required field does not fail a patch). Failures throw a
`ValidationError` whose `details` is `[{ field, message }]`; the global error handler emits it, and
`FormRenderer` maps it onto the fields with react-hook-form's `setError` and scrolls to the first.

Evaluation order per field:

1. **Presence** — `is_required` or an explicit `required` rule (its message wins). A blank required value
   short-circuits the rest.
2. **Type & format implied by `field_type`** — numeric parse, date parse, email/url/phone patterns,
   percentage 0–100, non-negative currency (unless `config.allow_negative`), rating bounds, and
   select/multi-select values must be listed options (unless `config.allow_other`).
3. **Admin rules** in `order_index` order.

Rule vocabulary (`validation_type` → `value`): `required`, `min`, `max`, `minLength`, `maxLength`,
`pattern`, `email`, `url`, `phone`, `integer`, `positive`, `non_negative`, `in`, `not_in`, `min_date`,
`max_date` (ISO date or `today`), `equals_field`, `not_equals_field`, `gt_field`, `gte_field`, `lt_field`,
`lte_field`, `requires_field` (all take another field's `name`), `unique`, `custom`.

Two rules are special:

- **`unique`** (and `is_unique` on the field) needs the database, so `RecordService.#hasDuplicate` checks
  it: against the CRM table column for first-class CRM objects (`crm-storage-map`), else against
  `record_field_values` for the object, excluding the record being updated and soft-deleted records.
- **`custom`** (a JavaScript expression) is **never executed on the server**. It remains a browser-side
  convenience and the builder labels it as such.

A rule whose `value` cannot be parsed (bad regex, non-numeric bound, unknown type) is reported as a
*configuration* problem: logged as a warning, not applied, never blocks the user. The browser mirror lives
in `frontend/src/utils/helpers.js#buildValidationRules`; cross-field rules use react-hook-form's
`validate(value, formValues)` signature.

Auto-number, formula and computed fields are exempt from the required check (the server fills them).

The Form Builder used to lose validation edits: `FormBuilderPage` never sent `validations` on update and
`MetadataService.updateField` discarded the key. Both are fixed — the builder sends the full list, the
service replaces the stored rows (top-level writes, so the tenant-scope extension stamps `tenant_id`), and
`options`, `default_value` and `is_unique` are persisted alongside.

## Field appearance

`ui_fields.config` carries presentation knobs edited on the Form Builder's **Look** tab and read by
`FieldRenderer`:

| Key | Effect |
| --- | --- |
| `label_position` | `top` (default) · `left` (two-column row) · `hidden` (placeholder + aria-label only) |
| `size` | `sm` · `md` · `lg` input padding/type scale |
| `prefix` / `suffix` | adornments inside the input (`$`, `%`, `kg`) — percentage fields default to `%` |
| `description` | longer text under the input, joined to `help_text` |
| `show_count` | live character counter (text types) |
| `rows` | textarea / rich text height |
| `step`, `precision`, `min`, `max_input` | numeric input behaviour (soft — validations enforce) |
| `choice_display` | `dropdown` · `radio` · `chips` · `segmented` for select/radio; `chips` for multi-select |
| `min_date_input` / `max_date_input` | date picker bounds |
| `allow_negative`, `allow_other`, `max` (rating) | also read by the validation engine |
| `always_disabled` | read-only (pre-existing) |

## Per-form layout overrides

`ui_form_field_layouts.config` may override how a field appears **on that form only**:
`{ label, placeholder, help_text, read_only, appearance: { …field-config keys… } }`. Both normalisers
(`store/metadataStore.js` and `pages/runtime/RecordFormPage.jsx`) merge these over the field, and
`is_visible: false` layouts are now dropped instead of rendered.

---

# Part 3 — Charts

## Chart appearance

`ui_dashboard_widgets.config.appearance`, edited on the Dashboard Builder's Appearance tab (chart widgets
only) and resolved by `frontend/src/utils/chart.js#resolveChartAppearance`:

| Key | Values | Applied by |
| --- | --- | --- |
| `palette` | `tenant` (default) · `brand` · `vivid` · `pastel` · `mono` · `ocean` · `warm` | `useChartTheme` |
| `colors` | `["#hex", …]` per-series overrides | `useChartTheme` |
| `legend` | `auto` · `top` · `bottom` · `hidden` | cartesian + pie |
| `dataLabels` | boolean | bar, line, pie/donut |
| `format`, `decimals`, `currency` | `number` · `compact` · `currency` · `percent` · `integer` | `makeValueFormatter` → ticks, tooltip, labels, donut total |
| `sort`, `topN` | `none/asc/desc`, N | `applySeriesTransforms` — top-N folds the rest into one "Other (n)" row summed per series |
| `goal`, `goalLabel` | number, text | `ReferenceLine` on cartesian charts |
| `xLabel`, `yLabel` | text | axis titles (margins widen automatically) |
| `showGrid`, `smooth`, `stacked` | booleans | grid lines, curve type, stacking override |

`appearanceCapabilities(chartType)` tells the builder which controls to show. The tenant palette comes from
`appearance.chart_palette` through `chartSeries(appearance, isDark)`; `brand` derives the series from the
primary/accent ramps. Per-widget settings flow to the leaf chart components through a React context so the
sub-chart props stay small.

---

# Part 4 — Working on it

## Testing

- Backend: `tests/validation-engine.test.js` (vocabulary, presence, implicit rules, config warnings),
  `tests/record-validation.test.js` (enforcement on create/update, uniqueness, exemptions),
  `tests/metadata-field.test.js` (rule replacement on update).
- Backend: `tests/branding.test.js` (schema knobs, url validation, asset upload/replace/remove, SVG safety,
  public branding subset).
- Frontend: `tests/appearance.test.js` (palette maths, defaults, CSS variables, presets, export/import, snapshot,
  document chrome), `tests/Branding.test.jsx` (BrandLogo modes, Personalize panel gating, mode precedence),
  `tests/chartAndValidation.test.js` (transforms, formatter, capabilities, browser rule mirror).

When adding a validation type: add it to `RULE_TYPES` and `evaluateRule` on the server, to
`VALIDATION_TYPES` and `buildValidationRules` in the browser, and a case to both test files.

## Known gaps

- Custom JavaScript validators are browser-only by design; there is no sandboxed server evaluation.
- Uniqueness is checked for EAV objects and first-class CRM columns; insurance-domain mirrored tables are
  covered through their EAV copy only.
- Branding before login relies on the browser having signed in to that workspace before (the snapshot). A first
  visit on a fresh device shows product defaults until sign-in; a tenant-slug login URL would close this.
- Brand asset URLs contain the tenant id, and the public branding route answers for any active tenant id — by
  design (a sign-in page is public), but nothing operational is exposed.
- Fonts other than Inter/Plus Jakarta Sans are referenced by family name and fall back to system fonts
  unless loaded by the deployment.
- Form-level appearance (section styling, column gap) has no `UiForm.config` column; adding one needs a
  migration.

## Invariants — read before you change anything

1. **Never hard-code a brand hue, a grey, or a dark surface.** Use `primary-*` / `accent-*` / `mid` / `gray-*` /
   `night-*`; a literal `indigo-*`, `via-violet-600` or `bg-[#141327]` breaks theming for every tenant. Text on a
   brand surface is `text-on-primary`, never `text-white`. Primary buttons use the `Button` component (or
   `.btn-primary`) so the button-style setting reaches them. Brand-tinted CSS reads `var(--pc-N)` (mode-aware),
   not `var(--p-N)`.
2. **The server is the source of truth for validation.** A rule that the browser enforces but the server
   does not is a bug; keep `evaluateRule` and `buildValidationRules` in step.
3. **Custom JS never runs on the server.** Do not "fix" that with `vm` — it is not a security boundary.
4. **Validation runs before the first write.** A rejected create leaves no record, no EAV rows, no audit line.
5. **`applyAppearance` must stay idempotent and synchronous** — it runs on every builder keystroke.
6. **Appearance changes never require a redeploy or a migration.** New knobs go into the settings schema
   (tenant_configs) or a JSON `config` column, never a new column. Brand assets go through
   `BrandingService`, never a new column or a data URL in settings.
7. **A new knob is four edits:** `APPEARANCE_DEFAULTS` + `ENUMS` in `utils/appearance.js`, the settings
   schema, every `THEME_PRESETS` entry (the test enforces this), and a `[data-*]` rule or variable in
   `index.css`.
