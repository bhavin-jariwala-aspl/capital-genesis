# Configuration Details — Metadata-Driven Architecture

> Last updated: 2026-10-13 (insurance domain screens removed; counts below
> were reduced by the removed screens' recorded line counts, not re-measured)
>
> Counts, inventories and route tables in this document are generated from
> source. If you add or remove a screen, regenerate them rather than editing the
> numbers by hand — the previous revision drifted by 10 screens and ~5,000 lines
> before anyone noticed.

## Overview

Genesis CRM follows a **metadata-driven architecture** where the core pattern is:
**Modules > Objects > Fields > Forms > Pipelines > Dashboards**

This document classifies every screen in the application by its
architecture type, quantifies metadata coverage, and provides
recommendations for future development.

---

## Metadata Coverage Summary

### Overall Application (47 screens, 17,010 lines)

| Classification | Screens | % Screens | Lines | % Lines |
|---|---|---|---|---|
| Metadata renderers | 4 | 8.5% | 1,856 | 10.9% |
| Hybrid (metadata + domain logic) | 1 | 2.1% | 568 | 3.3% |
| Domain / registry-driven | 7 | 14.9% | 3,744 | 22.0% |
| Builder (metadata editors) | 21 | 44.7% | 8,474 | 49.8% |
| Platform Admin | 8 | 17.0% | 1,386 | 8.1% |
| Utility (auth, settings, public links) | 6 | 12.8% | 982 | 5.8% |

### Runtime / User-Facing Screens Only (12 screens, 6,168 lines)

| Classification | Screens | % | Lines | % |
|---|---|---|---|---|
| Metadata renderers | 4 | 33.3% | 1,856 | 30.1% |
| Hybrid | 1 | 8.3% | 568 | 9.2% |
| Domain / registry-driven | 7 | 58.3% | 3,744 | 60.7% |

### Key Metric: Metadata Influence

**42% of runtime screens (5 of 12)** consume module/object metadata, accounting
for **39% of runtime code (2,424 of 6,168 lines)**.

The seven remaining screens split into two groups, and the distinction matters:

- **Genuinely domain-specific** (Forecast, Social Media). Expressing these as metadata would
  mean building a general-purpose calculation and integration engine larger than
  the pages themselves.
- **Driven by their own registry** (Reports, Report Builder, SLA Dashboard,
  Documents, Reminders). These are *not* hardcoded — they are configurable, just
  through a subsystem registry rather than the module/object metadata tree. The
  report vocabulary (`GET /api/reports/vocabulary`) and the SLA policy tables
  play the same role for them that field metadata plays for a module screen.

### Metadata Consumption Across the Codebase

| Metadata Feature | Screens Using It |
|---|---|
| `ModulePage` (renders any module) | 1 screen serving 7+ modules |
| `FormRenderer` (dynamic forms) | RecordFormPage, WizardPage |
| `DashboardRenderer` | RuntimeHome |
| `useMetadataStore()` | 3 screens (ModulePage, RecordFormPage, WizardPage) |
| `StatusStepper` (from metadata) | `StatusTracker` (the `status_tracker` fieldtype) |

---

## Architecture Classification — Full Inventory

### Tier 1 — Metadata Renderers (4 screens, 1,856 lines)

Four shared renderers that draw entirely from metadata. Between them they serve
every module in the workspace, so their line count understates their reach: one
new module costs zero new screens.

| Screen | File | Lines | Renders from |
|---|---|---|---|
| Module page | `ModulePage.jsx` | 1,246 | Object + field metadata — table, card and pipeline views for any module |
| Record form | `RecordFormPage.jsx` | 416 | Form metadata via `FormRenderer` — create and edit |
| Wizard | `WizardPage.jsx` | 112 | Wizard step metadata |
| Dashboard | `RuntimeHome.jsx` | 82 | Dashboard widget metadata via `DashboardRenderer` |

**How it works:** the sidebar builds module links from the
`/api/runtime/bootstrap` response. Clicking a module routes to `ModulePage`,
which renders from the object's field definitions. Create and edit route to
`RecordFormPage`, which renders `FormRenderer` from form metadata.

**Computed fields:**

- `product.margin` → `calc_margin`: `((price - cost) / price) * 100`
- `prospect.full_name` → `calc_full_name`: first + last name
- `prospect.age` → `calc_age`: derived from date of birth

### Tier 2 — Hybrid Metadata-Driven (1 screen, 568 lines)

These read field options, labels and status choices from metadata via
`useMetadataStore` (or the metadata API), but keep
custom logic for domain workflows and calculations.

| Screen | File | Lines | Metadata used | Custom logic retained |
|---|---|---|---|---|
| Import | `ImportPage.jsx` | 568 | Object + field metadata for column mapping | Upload, parse, map, preview, execute |

**Pattern:** read field definitions for the object from `useMetadataStore`. Status options, select choices and labels come from
metadata, so admins can change them in the Builder without a code change.

### Tier 3 — Domain-Specific & Registry-Driven (7 screens, 3,744 lines)

Two different things live here, and conflating them is what made the previous
revision of this document misleading.

**Registry-driven** — configurable, but through a subsystem registry rather than
module/object metadata. Not candidates for conversion; they already are
configurable.

| Screen | File | Lines | Configured by |
|---|---|---|---|
| Documents | `DocumentsPage.jsx` | 923 | DMS folder tree, document config, storage provider |
| Report Builder | `ReportBuilderPage.jsx` | 710 | Report registry + `GET /api/reports/vocabulary` |
| Reports | `ReportsPage.jsx` | 531 | Report library, saved report definitions |
| SLA Dashboard | `SlaDashboardPage.jsx` | 268 | SLA policies and targets |
| Reminders | `RemindersPage.jsx` | 173 | Reminder rules |

**Genuinely domain-specific** — should stay as they are. Converting them means
building a general-purpose calculation/integration engine larger than the pages.

| Screen | File | Lines | Why it stays |
|---|---|---|---|
| Social Media | `SocialMediaPage.jsx` | 698 | 7 platform surfaces, scheduling, sentiment |
| Forecast | `ForecastPage.jsx` | 441 | Weighted pipeline aggregation, quotas by period |

### Builder Pages — Metadata Editors (21 screens, 8,474 lines)

These create and edit metadata itself. They are the configuration tools, not
candidates for metadata-driven conversion.

| Screen | File | Lines | Purpose |
|---|---|---|---|
| Social Media Config | `SocialMediaBuilderPage.jsx` | 1,223 | Account and campaign configuration |
| Org Chart | `OrgChartPage.jsx` | 800 | Employee hierarchy editor |
| Integrations | `IntegrationBuilderPage.jsx` | 711 | Webhook and API integration config |
| Email Templates | `EmailTemplateBuilderPage.jsx` | 693 | Email template designer |
| Pipeline Builder | `PipelineBuilderPage.jsx` | 581 | Kanban stage configuration |
| Document Builder | `DocumentBuilderPage.jsx` | 532 | DMS folders, categories, document policy |
| SLA Builder | `SlaBuilderPage.jsx` | 401 | SLA policies, targets, escalation |
| Assignment Rules | `AssignmentBuilderPage.jsx` | 391 | Record auto-assignment rules |
| Roles | `RolesPage.jsx` | 378 | Role hierarchy management |
| Module Builder | `ModuleBuilder.jsx` | 333 | CRUD for modules, objects, fields |
| Employees | `EmployeesPage.jsx` | 330 | System user management |
| Push Notifications | `PushNotificationsPage.jsx` | 276 | Notification configuration |
| Wizard Builder | `WizardBuilderPage.jsx` | 261 | Multi-step wizard configuration |
| Lead Scoring Rules | `LeadScoringBuilderPage.jsx` | 235 | Scoring rule builder |
| Workflow Builder | `WorkflowBuilderPage.jsx` | 224 | Trigger/condition/action automation |
| Records Trash | `RecordsTrashPage.jsx` | 209 | Soft-deleted record recovery |
| Integration Health | `IntegrationHealthPage.jsx` | 202 | Execution logs and monitoring |
| Permissions | `PermissionsBuilderPage.jsx` | 191 | Role-based field/entity access control |
| Form Builder | `FormBuilderPage.jsx` | 183 | Visual drag-and-drop form designer |
| Builder Home | `BuilderHome.jsx` | 162 | Landing page / overview |
| Dashboard Builder | `DashboardBuilderPage.jsx` | 158 | Dashboard widget designer |

### Platform Admin Pages (8 screens, 1,386 lines)

Infrastructure management for the SaaS platform. Not business data.

| Screen | File | Lines | Purpose |
|---|---|---|---|
| Tenants | `TenantsPage.jsx` | 289 | Tenant provisioning and management |
| Security | `SecurityPage.jsx` | 191 | Security policy configuration |
| Analytics | `AnalyticsPage.jsx` | 169 | Platform usage reporting |
| Plans | `PlansPage.jsx` | 157 | Subscription plan management |
| Announcements | `AnnouncementsPage.jsx` | 154 | System-wide notifications |
| Dashboard | `PlatformDashboard.jsx` | 154 | Platform health metrics |
| Feature Flags | `FeatureFlagsPage.jsx` | 145 | Feature toggle control |
| Audit Log | `AuditLogPage.jsx` | 127 | System audit trail viewer |

### Utility Pages (6 screens, 982 lines)

Authentication, workspace settings, and the two public token-authenticated pages
that render outside the app shell.

| Screen | File | Lines | Notes |
|---|---|---|---|
| Organization Settings | `OrganizationSettings.jsx` | 213 | Workspace settings, rendered generically from the settings schema |
| Sign Document | `SignDocumentPage.jsx` | 198 | Public e-signature page (`/sign/:token`) |
| Login | `Login.jsx` | 187 | Authentication form |
| Reset Password | `ResetPassword.jsx` | 158 | Password reset (`/reset-password`) |
| Shared Document | `SharedDocumentPage.jsx` | 116 | Public document link (`/share/:token`) |
| Forgot Password | `ForgotPassword.jsx` | 110 | Reset request |

---

## Generic Reusable Components

Three generic components support metadata-driven UI patterns across the
application. They are part of the shared component library at
`frontend/src/components/ui/`.

### StatusStepper (`StatusStepper.jsx`)

Reusable status pipeline/workflow visualization. Consumes the
`options` array from any metadata select field directly.

**Variants:**

- `bar` — horizontal distribution bar with counts per stage
- `pills` — clickable status pills with color coding
- `steps` — numbered step indicators (completed / active / upcoming)

**Props:** `stages`, `currentValue`, `onChange`, `showCounts`,
`variant`, `size`, `className`

**Used by:** `StatusTracker` (milestone stepper layer).

### StatusTracker (`StatusTracker.jsx`)

Logistics-style status timeline (Amazon / UPS / Bluedart package tracking)
that backs the **`status_tracker`** display fieldtype. Composes three layers
from a record's status events: a milestone stepper (reuses `StatusStepper`),
a current-status banner, and a dated event log (time · location · description).

**Data source:** `GET /api/runtime/records/:id/status-events`. Milestones come
from the field's `config.stages`. Events are appended automatically as a record
moves through its pipeline (`RecordService.updateRecordStage` → `status_events`)
and can be added manually via `POST /api/runtime/records/:id/status-events`.

**Props:** `recordId`, `config` (`{ stages, variant, title }`), `label`

**Wired via metadata:** dropped onto a form like any other field. `FormRenderer`
threads `recordId` to `FieldRenderer`, which renders `StatusTracker` for the
`status_tracker` type.

## Seed Data Structure

`node prisma/seed.js` installs one workspace from the **Genesis Capital** vertical pack
(`backend/prisma/verticals/genesis-capital/`): 19 modules, 91 objects, 72 workflows, 15 dashboards and
22 staff accounts, plus demo records. The module and object inventory is in
[GENESIS-CAPITAL/IMPLEMENTATION.md](../GENESIS-CAPITAL/IMPLEMENTATION.md). Tenants onboarded from the
platform console instead clone the template tenant's metadata (see
[TENANT_ONBOARDING.md](../admin-guide/TENANT_ONBOARDING.md)).

## Computed Field Registry

All computed-field logic lives in
`frontend/src/utils/fieldFunctions.js`. Functions are referenced by
name in `field.config.computed.fn`.

| Function | Trigger Fields | Description |
|---|---|---|
| `calc_full_name` | `first_name`, `last_name` | Concatenates first + last name |
| `calc_age` | `date_of_birth` | Calculates age from DOB |
| `calc_margin` | `unit_price`, `cost_price` | `((price - cost) / price) * 100` |
| `set_probability_from_stage` | `stage` | Maps pipeline stage to win probability % |

To add a new computed field:

1. Add a `case` to the `switch` in `computeField()`.
2. Add an entry to `COMPUTED_FIELD_FUNCTIONS` (for the builder picker).
3. Set the field's `config.computed.fn` to the case name in seed data
   or via the Builder UI.

---

## Route Configuration

### Converted Routes (removed — now metadata-driven)

| Old Route | New Route | Notes |
|---|---|---|
| `/products` | `/module/:moduleId` | Sidebar auto-generates the link |
| `/lead-scoring` | `/module/:moduleId` | Sidebar auto-generates the link |

### Active Dedicated Routes

Generated from `frontend/src/App.jsx`. 55 routes.

```text
Public (no auth):
  /login                                            → Login
  /forgot-password                                  → ForgotPassword
  /reset-password                                   → ResetPassword
  /share/:token                                     → SharedDocumentPage
  /sign/:token                                      → SignDocumentPage

Runtime:
  /                                                 → RuntimeHome (dashboard)
  /module/:moduleId                                 → ModulePage (any module)
  /module/:moduleId/object/:objectId                → ModulePage (specific object)
  /module/:moduleId/object/:objectId/new            → RecordFormPage (create)
  /module/:moduleId/object/:objectId/edit/:recordId → RecordFormPage (edit)
  /record/:objectId/new                             → RecordFormPage (object-only create)
  /record/:objectId/:recordId                       → RecordFormPage (object-only edit)
  /wizard/:wizardId                                 → WizardPage
  /settings                                         → OrganizationSettings
  /forecast                                         → ForecastPage
  /import                                           → ImportPage
  /social-media                                     → SocialMediaPage
  /sla                                              → SlaDashboardPage
  /documents                                        → DocumentsPage
  /reminders                                        → RemindersPage
  /reports                                          → ReportsPage
  /reports/new                                      → ReportBuilderPage
  /reports/:id/edit                                 → ReportBuilderPage

Builder (admin only):
  /builder                                          → BuilderHome
  /builder/modules                                  → ModuleBuilder
  /builder/form  ·  /builder/form/:formId           → FormBuilderPage
  /builder/dashboard  ·  /builder/dashboard/:dashId → DashboardBuilderPage
  /builder/pipeline                                 → PipelineBuilderPage
  /builder/workflow                                 → WorkflowBuilderPage
  /builder/wizard                                   → WizardBuilderPage
  /builder/permissions                              → PermissionsBuilderPage
  /builder/assignment                               → AssignmentBuilderPage
  /builder/integrations                             → IntegrationBuilderPage
  /builder/integration-health                       → IntegrationHealthPage
  /builder/email-templates                          → EmailTemplateBuilderPage
  /builder/social-media                             → SocialMediaBuilderPage
  /builder/lead-scoring                             → LeadScoringBuilderPage
  /builder/push-notifications                       → PushNotificationsPage
  /builder/employees                                → EmployeesPage
  /builder/org-chart                                → OrgChartPage
  /builder/roles                                    → RolesPage
  /builder/sla                                      → SlaBuilderPage
  /builder/documents                                → DocumentBuilderPage
  /builder/trash                                    → RecordsTrashPage

Platform (platform_admin only):
  /platform                                         → PlatformDashboard
  /platform/tenants                                 → TenantsPage
  /platform/feature-flags                           → FeatureFlagsPage
  /platform/plans                                   → PlansPage
  /platform/announcements                           → AnnouncementsPage
  /platform/analytics                               → AnalyticsPage
  /platform/security                                → SecurityPage
  /platform/audit-log                               → AuditLogPage
```

---

## Benchmark — architecture posture vs. the top 5 CRM providers

The metadata-driven position this document describes is the platform's main
structural bet. Measured against Salesforce, Microsoft Dynamics 365, HubSpot,
Zoho CRM and Pipedrive:

| Capability | Salesforce | Dynamics 365 | HubSpot | Zoho CRM | Pipedrive | **Genesis** |
| --- | --- | --- | --- | --- | --- | --- |
| Custom objects defined at runtime | ✅ | ✅ | ✅ | ✅ | ⚠️ custom fields only | ✅ |
| Layouts/forms configured without code | ✅ | ✅ | ✅ | ✅ | ⚠️ | ✅ |
| One renderer serving every object | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ `ModulePage` |
| Pipeline/stage config per object | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Self-service reporting over custom objects | ✅ | ✅ | ✅ | ✅ | ⚠️ | ✅ |
| Native social publishing | ❌ retired 2024 | ❌ | ✅ | ❌ separate product | ❌ | ❌ simulation only |
| Rule-based scoring | ✅ | ✅ | ✅ | ✅ | ⚠️ | ✅ |
| AI/predictive scoring | ✅ Einstein | ✅ Copilot | ✅ | ✅ Zia | ⚠️ | ❌ |

**Where the architecture holds up.** Runtime-defined objects, forms and
pipelines rendered by shared components is the same pattern all five majors
converged on, and Genesis reaches it with four renderers totalling 1,856 lines.
Adding a module costs no new screens.

**Where the classification is honestly weaker than the headline.** 58% of
runtime screens do not consume module metadata. Five of those seven are
configurable through their own registry (Reports, SLA, Documents, Reminders) —
a split the majors also make, since Salesforce reports and Dynamics dashboards
are not built on layout metadata either. The other two are domain code that
should stay that way.

**The real gap is not architectural.** Social publishing is simulated and there
is no AI layer; both are tracked in [ROADMAP.md](ROADMAP.md). Social is the
lesser of the two — four of the five majors have also stepped back from native
social. The AI gap is the one that matters, because all five ship predictive
scoring and Genesis ships rule-based only.

---

## Recommendations for Future Development

### DO: Use metadata for new CRUD screens

When building a new screen, always check if it can be expressed as a
module + object + fields. If the UI is a form + table with status
badges, it should be metadata-driven.

**Checklist for new screens:**

1. Can the data model be expressed as Object fields? → Add to seed
2. Can the form be expressed as a grid layout? → Use FormBuilder
3. Does it have a status workflow? → Add a Pipeline
4. Does it need a multi-step flow? → Use WizardBuilder
5. Does it need charts/KPIs? → Use DashboardBuilder

### DO: Use generic components for common UI patterns

- Status workflows → `StatusStepper` component
- Logistics-style tracking timelines → `StatusTracker` (the `status_tracker` fieldtype)

### DO: Use the hybrid approach for complex domain screens

New domain-specific screens should follow the Tier 2
pattern:

1. Define the object and fields in metadata (in the Builder, or in a vertical pack).
2. Load field options from `useMetadataStore`.
3. Render select options, labels, and colors from metadata.
4. Keep business logic (calculations, workflows, API calls) in code.

This gives admins the ability to modify field options (add a new case
type, rename a status) without code changes, while keeping complex
logic maintainable in React.

### DON'T: Force metadata on complex domain logic

If a screen involves:

- External API integrations (third-party APIs, social platforms)
- Complex calculations (forecasts, weighted pipelines)
- Multi-entity orchestration (case review across 3+ objects)
- Platform-specific rendering (post types per social platform)

Keep it as a custom page with metadata-driven fields where possible
(hybrid approach).

### DON'T: Build meta-engines for one-off patterns

Building a generic calculation DSL, state machine engine, or API
orchestration framework to replace 700 lines of readable React code
is a net negative. The maintenance cost of the meta-system would
exceed the maintenance cost of the pages themselves.
