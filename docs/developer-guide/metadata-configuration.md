# Configuration Details — Metadata-Driven Architecture

<!-- nav:top -->
> **[Docs roadmap](../README.md)** › **[Developer guide](README.md#core-reading-in-order)** › 6 of 9 · **For:** Engineers
> ← [Security](security.md) · [Performance optimisation](performance-optimization.md) →
> New to Genesis? Background: [Understanding Genesis › The building blocks](../understanding/02-building-blocks.md)
<!-- /nav:top -->

> Last updated: 2026-10-20 (screen inventory, line counts and routes re-measured
> from `frontend/src/App.jsx` and `frontend/src/pages/`)
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

Metadata (modules, objects, fields, forms, pipelines, dashboards) lives in the
`ui_*` tables. Business records do not get a table per object: every record is
one row in `records` plus one row per filled field in `record_field_values`.
The plain explanation is in
[03 — How data is stored](../understanding/03-how-data-is-stored.md).

---

## Metadata Coverage Summary

### Overall Application (56 screens, 21,163 lines)

| Classification | Screens | % Screens | Lines | % Lines |
|---|---|---|---|---|
| Metadata renderers | 4 | 7.1% | 1,972 | 9.3% |
| Hybrid (metadata + domain logic) | 1 | 1.8% | 622 | 2.9% |
| Domain / registry-driven | 10 | 17.9% | 4,310 | 20.4% |
| Builder (metadata editors) | 22 | 39.3% | 9,991 | 47.2% |
| Platform Admin | 8 | 14.3% | 1,930 | 9.1% |
| Utility (auth, settings, public pages) | 11 | 19.6% | 2,338 | 11.0% |

### Runtime / User-Facing Screens Only (15 screens, 6,904 lines)

| Classification | Screens | % | Lines | % |
|---|---|---|---|---|
| Metadata renderers | 4 | 26.7% | 1,972 | 28.6% |
| Hybrid | 1 | 6.7% | 622 | 9.0% |
| Domain / registry-driven | 10 | 66.7% | 4,310 | 62.4% |

### Key Metric: Metadata Influence

**33% of runtime screens (5 of 15)** consume module/object metadata, accounting
for **38% of runtime code (2,594 of 6,904 lines)**.

The ten remaining screens split into two groups, and the distinction matters:

- **Genuinely domain-specific** (Forecast, Social Media). Expressing these as metadata would
  mean building a general-purpose calculation and integration engine larger than
  the pages themselves.
- **Driven by their own registry** (Reports, Report Builder, SLA Dashboard,
  Documents, Reminders, Web Forms, Approvals, Access). These are *not* hardcoded —
  they are configurable, just through a subsystem registry rather than the
  module/object metadata tree. The report vocabulary (`GET /api/reports/vocabulary`)
  and the SLA policy tables play the same role for them that field metadata plays
  for a module screen. The report registry covers fixed typed sources only (leads,
  accounts, opportunities, cases, tasks, activities, SLA); it cannot see objects
  built in the Builder, which is every Genesis Capital object.

### Metadata Consumption Across the Codebase

| Metadata Feature | Screens Using It |
|---|---|
| `ModulePage` (renders any module) | 1 screen serving every module (19 in Genesis Capital) |
| `FormRenderer` (dynamic forms) | RecordFormPage, WizardPage |
| `DashboardRenderer` | RuntimeHome |
| `useMetadataStore()` | 3 screens (ModulePage, RecordFormPage, WizardPage) |
| `StatusStepper` (from metadata) | `StatusTracker` (the `status_tracker` fieldtype) |

---

## Architecture Classification — Full Inventory

### Tier 1 — Metadata Renderers (4 screens, 1,972 lines)

Four shared renderers that draw entirely from metadata. Between them they serve
every module in the workspace, so their line count understates their reach: one
new module costs zero new screens.

| Screen | File | Lines | Renders from |
|---|---|---|---|
| Module page | `ModulePage.jsx` | 1,313 | Object + field metadata — table, card and pipeline views for any module |
| Record form | `RecordFormPage.jsx` | 497 | Form metadata via `FormRenderer` — create and edit |
| Wizard | `WizardPage.jsx` | 75 | Wizard step metadata |
| Dashboard | `RuntimeHome.jsx` | 87 | Dashboard widget metadata via `DashboardRenderer` |

**How it works:** the sidebar builds module links from the
`/api/runtime/bootstrap` response. Clicking a module routes to `ModulePage`,
which renders from the object's field definitions. Create and edit route to
`RecordFormPage`, which renders `FormRenderer` from form metadata.

**Computed fields:** see the [Computed Field Registry](#computed-field-registry) below. Genesis Capital
computes its values with server-side `formula` fields instead.

### Tier 2 — Hybrid Metadata-Driven (1 screen, 622 lines)

These read field options, labels and status choices from metadata via
`useMetadataStore` (or the metadata API), but keep
custom logic for domain workflows and calculations.

| Screen | File | Lines | Metadata used | Custom logic retained |
|---|---|---|---|---|
| Import | `ImportPage.jsx` | 622 | Object + field metadata for column mapping | Upload, parse, map, preview, execute |

**Pattern:** read field definitions for the object from `useMetadataStore`. Status options, select choices and labels come from
metadata, so admins can change them in the Builder without a code change.

### Tier 3 — Domain-Specific & Registry-Driven (10 screens, 4,310 lines)

Two different things live here, and conflating them is what made the previous
revision of this document misleading.

**Registry-driven** — configurable, but through a subsystem registry rather than
module/object metadata. Not candidates for conversion; they already are
configurable.

| Screen | File | Lines | Configured by |
|---|---|---|---|
| Documents | `DocumentsPage.jsx` | 758 | DMS folder tree, document config, storage provider |
| Report Builder | `ReportBuilderPage.jsx` | 712 | Report registry + `GET /api/reports/vocabulary` |
| Reports | `ReportsPage.jsx` | 604 | Report library, saved report definitions |
| Access | `AccessPage.jsx` | 306 | Business units and information-barrier zones |
| SLA Dashboard | `SlaDashboardPage.jsx` | 291 | SLA policies and targets |
| Web Forms | `WebFormsPage.jsx` | 247 | Share published forms; "Your public pages" (website preview, portal) |
| Reminders | `RemindersPage.jsx` | 174 | Reminder rules |
| Approvals | `ApprovalsPage.jsx` | 126 | Workflow approval steps |

**Genuinely domain-specific** — should stay as they are. Converting them means
building a general-purpose calculation/integration engine larger than the pages.

| Screen | File | Lines | Why it stays |
|---|---|---|---|
| Social Media | `SocialMediaPage.jsx` | 700 | 7 platform surfaces, scheduling, sentiment |
| Forecast | `ForecastPage.jsx` | 441 | Weighted pipeline aggregation, quotas by period |

### Builder Pages — Metadata Editors (22 screens, 9,991 lines)

These create and edit metadata itself. They are the configuration tools, not
candidates for metadata-driven conversion.

| Screen | File | Lines | Purpose |
|---|---|---|---|
| Social Media Config | `SocialMediaBuilderPage.jsx` | 1,229 | Account and campaign configuration |
| Appearance | `AppearanceBuilderPage.jsx` | 842 | Theme, colours, logo and sign-in branding |
| Org Chart | `OrgChartPage.jsx` | 804 | Employee hierarchy editor |
| Integrations | `IntegrationBuilderPage.jsx` | 745 | Webhook and API integration config |
| Email Templates | `EmailTemplateBuilderPage.jsx` | 695 | Email template designer |
| Pipeline Builder | `PipelineBuilderPage.jsx` | 636 | Kanban stage configuration |
| Assignment Rules | `AssignmentBuilderPage.jsx` | 549 | Record auto-assignment rules |
| Document Builder | `DocumentBuilderPage.jsx` | 534 | DMS folders, categories, document policy |
| SLA Builder | `SlaBuilderPage.jsx` | 487 | SLA policies, targets, escalation |
| Module Builder | `ModuleBuilder.jsx` | 425 | CRUD for modules, objects, fields |
| Roles | `RolesPage.jsx` | 380 | Role hierarchy management |
| Employees | `EmployeesPage.jsx` | 332 | System user management |
| Workflow Builder | `WorkflowBuilderPage.jsx` | 300 | Trigger/condition/action automation |
| Lead Scoring Rules | `LeadScoringBuilderPage.jsx` | 291 | Scoring rule builder (scores the `lead_intake` object only) |
| Push Notifications | `PushNotificationsPage.jsx` | 278 | Notification configuration |
| Wizard Builder | `WizardBuilderPage.jsx` | 266 | Multi-step wizard configuration |
| Form Builder | `FormBuilderPage.jsx` | 240 | Visual drag-and-drop form designer |
| Records Trash | `RecordsTrashPage.jsx` | 225 | Soft-deleted record recovery |
| Integration Health | `IntegrationHealthPage.jsx` | 204 | Execution logs and monitoring |
| Permissions | `PermissionsBuilderPage.jsx` | 195 | Role-based field/entity access control |
| Builder Home | `BuilderHome.jsx` | 168 | Landing page / overview |
| Dashboard Builder | `DashboardBuilderPage.jsx` | 166 | Dashboard widget designer |

### Platform Admin Pages (8 screens, 1,930 lines)

Infrastructure management for the SaaS platform. Not business data.

| Screen | File | Lines | Purpose |
|---|---|---|---|
| Plans | `PlansPage.jsx` | 488 | Subscription plan management |
| Tenants | `TenantsPage.jsx` | 463 | Tenant provisioning and management (plus `TenantOnboardWizard.jsx` and `TenantFeaturesPanel.jsx`, not counted) |
| Security | `SecurityPage.jsx` | 190 | Security policy configuration |
| Feature Flags | `FeatureFlagsPage.jsx` | 189 | Feature toggle control |
| Analytics | `AnalyticsPage.jsx` | 168 | Platform usage reporting |
| Dashboard | `PlatformDashboard.jsx` | 153 | Platform health metrics |
| Announcements | `AnnouncementsPage.jsx` | 153 | System-wide notifications |
| Audit Log | `AuditLogPage.jsx` | 126 | System audit trail viewer |

### Utility Pages (11 screens, 2,338 lines)

Authentication, workspace and account settings, and the public token- or
code-authenticated pages that render outside the app shell.

| Screen | File | Lines | Notes |
|---|---|---|---|
| Client Portal | `portal/PortalPage.jsx` | 369 | Client portal (`/portal/:slug`), email one-time code sign-in; shows `StaffPreviewBar` to the workspace's own staff |
| Public Form | `PublicFormPage.jsx` | 360 | Published web form (`/f/:key`) |
| Login | `Login.jsx` | 327 | Authentication form |
| Website Preview | `WebsitePreviewPage.jsx` | 239 | Public site preview (`/site/:slug`); shows `StaffPreviewBar` to the workspace's own staff |
| Organization Settings | `OrganizationSettings.jsx` | 225 | Workspace settings, rendered generically from the settings schema |
| Sign Document | `SignDocumentPage.jsx` | 199 | Public e-signature page (`/sign/:token`) |
| Reset Password | `ResetPassword.jsx` | 157 | Password reset (`/reset-password`) |
| Upload | `UploadPage.jsx` | 131 | Client document-upload link (`/upload/:token`) |
| Shared Document | `SharedDocumentPage.jsx` | 117 | Public document link (`/share/:token`) |
| Account Security | `AccountSecurityPage.jsx` | 114 | The signed-in user's MFA settings (`/account/security`) |
| Forgot Password | `ForgotPassword.jsx` | 109 | Reset request |

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
(`backend/prisma/verticals/genesis-capital/`): 19 modules, 91 objects, 89 workflows, 15 dashboards and
22 staff accounts, plus demo records. The module and object inventory is in
[genesis-capital/implementation.md](../genesis-capital/implementation.md). Tenants onboarded from the
platform console instead clone the template tenant's metadata (see
[tenant-onboarding.md](../platform-operations/tenant-onboarding.md)).

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

These run in the browser. No Genesis Capital field uses them; its computed values are server-side
`formula` fields defined in the vertical pack.

To add a new computed field:

1. Add a `case` to the `switch` in `computeField()`.
2. Add an entry to `COMPUTED_FIELD_FUNCTIONS` (for the builder picker).
3. Set the field's `config.computed.fn` to the case name in seed data
   or via the Builder UI.

---

## Route Configuration

### Active Dedicated Routes

Generated from `frontend/src/App.jsx`. 63 routes.

```text
Public (no auth):
  /login                                            → Login
  /forgot-password                                  → ForgotPassword
  /reset-password                                   → ResetPassword
  /share/:token                                     → SharedDocumentPage
  /sign/:token                                      → SignDocumentPage
  /f/:key                                           → PublicFormPage
  /portal/:slug                                     → PortalPage (client portal)
  /upload/:token                                    → UploadPage
  /site/:slug                                       → WebsitePreviewPage
  /site, /portal                                    → OwnWorkspaceRedirect (signed in → own tenant_slug; else /login)

Runtime:
  /                                                 → RuntimeHome (dashboard)
  /module/:moduleId                                 → ModulePage (any module)
  /module/:moduleId/object/:objectId                → ModulePage (specific object)
  /module/:moduleId/object/:objectId/new            → RecordFormPage (create)
  /module/:moduleId/object/:objectId/edit/:recordId → RecordFormPage (edit)
  /record/:objectId/new                             → RecordFormPage (object-only create)
  /record/:objectId/:recordId                       → RecordFormPage (object-only edit)
  /wizard/:wizardId                                 → WizardPage
  /web-forms                                        → WebFormsPage
  /approvals                                        → ApprovalsPage
  /settings                                         → OrganizationSettings (admin)
  /forecast                                         → ForecastPage
  /import                                           → ImportPage
  /social-media                                     → SocialMediaPage
  /sla                                              → SlaDashboardPage
  /documents                                        → DocumentsPage
  /reminders                                        → RemindersPage
  /access                                           → AccessPage
  /account/security                                 → AccountSecurityPage
  /reports                                          → ReportsPage
  /reports/new                                      → ReportBuilderPage
  /reports/:id/edit                                 → ReportBuilderPage

Builder (admin only):
  /builder                                          → BuilderHome
  /builder/modules                                  → ModuleBuilder
  /builder/appearance                               → AppearanceBuilderPage
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
| Self-service reporting over custom objects | ✅ | ✅ | ✅ | ✅ | ⚠️ | ⚠️ dashboard widgets only; the Report builder covers fixed typed sources |
| Native social publishing | ❌ retired 2024 | ❌ | ✅ | ❌ separate product | ❌ | ❌ simulation only |
| Rule-based scoring | ✅ | ✅ | ✅ | ✅ | ⚠️ | ✅ |
| AI/predictive scoring | ✅ Einstein | ✅ Copilot | ✅ | ✅ Zia | ⚠️ | ❌ |

**Where the architecture holds up.** Runtime-defined objects, forms and
pipelines rendered by shared components is the same pattern all five majors
converged on, and Genesis reaches it with four renderers totalling 1,972 lines.
Adding a module costs no new screens.

**Where the classification is honestly weaker than the headline.** 67% of
runtime screens do not consume module metadata. Eight of those ten are
configurable through their own registry (Reports, SLA, Documents, Reminders,
Web Forms, Approvals, Access) —
a split the majors also make, since Salesforce reports and Dynamics dashboards
are not built on layout metadata either. The other two are domain code that
should stay that way.

**The real gap is not architectural.** Social publishing is simulated and there
is no predictive AI (the only AI feature is "Ask Genesis", natural-language report
building, off by default); both are tracked in [roadmap.md](../project/roadmap.md). Social is the
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

<!-- nav:bottom -->

---

### Where to next

| | |
|---|---|
| **Next** | [Performance optimisation](performance-optimization.md) — Metadata caching and optimistic UI |
| **Previous** | [Security](security.md) |
| **Background** | [Understanding Genesis › The building blocks](../understanding/02-building-blocks.md) |
| **Lost?** | [Docs roadmap](../README.md) · [Developer guide](README.md#core-reading-in-order) · [Understanding Genesis](../understanding/README.md) |
<!-- /nav:bottom -->
