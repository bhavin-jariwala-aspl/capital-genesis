# Genesis CRM — Changelog

All notable changes to Genesis CRM are documented in this file.

The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased]

### Added — Web forms page for staff (2026-10-15)

- **Tools ▸ Web forms** lists every published public form (`/f/<key>`) with a description and, where the form has a
  product picker, the products it offers. Any staff member can **Email to client** (EN/FR, optional product and
  personal note; logged under Email logs; 30 per user per hour), **Copy link** (optionally with a product
  preselected) or **Open** it. Shared links are tagged `utm_source=crm`.
- API: `GET /api/web-forms`, `POST /api/web-forms/:id/link`, `POST /api/web-forms/:id/send`.
- The Genesis Capital forms have descriptions, and the second "Loan calculator" (no contact details) is now
  **Quick loan estimate**, so the two can be told apart.

### Changed — Kanban board; Cards view made optional (2026-10-14)

- The **Cards** view is now **opt-in**: it appears only on objects whose pipeline ticks *Card view* in the Pipeline
  Builder (off for new pipelines and for pipelines that never chose their views). Records without an image show a
  coloured panel with their initials instead of a random photo loaded from an outside website.
- **A refused Kanban move crashed the board.** The API's error object was rendered as-is; the card now goes back to
  its column and a message names what is missing, by field label ("Complete LMS booking reference, Value date before
  moving to Booked"), with **Open record to complete**. A successful move shows a short "… moved to …" notice.
- The whole column — header and padding included — accepts a dropped card; before, only the card list did.
  Drops on the *Unsorted* lane are ignored.
- New pipeline setting `config.status_field: { field, map }` keeps a status picklist in step with the stage on
  every stage change. The Genesis Capital *Disbursement* pipeline mirrors its stage into *Status*.

### Changed — Website forms redesigned (2026-10-14)

- The hosted web form (`/f/<key>`) has a brand panel with the workspace's logo, name and theme; two steps with a
  progress bar for longer forms; option cards for short picklists; one consistent label style; Builder defaults
  pre-filled; and a confirmation that shows the reference and the calculator or questionnaire results, labelled
  and formatted. It works on phones and in dark mode.
- New public-form setting `field_options` narrows a picklist on one form. Both Genesis Capital loan calculators
  now offer only the four loan products (they listed all 22, including funds and forex).
- Fixed: a picklist's disabled "Choose…" placeholder made the browser pick the first option silently, so an
  untouched product field could submit "Real Estate Loan".
- Currency fields on public forms show a plain amount: the page has no currency profile, so they showed "$"
  whatever currency was chosen.

### Fixed — Record links on a fresh page load (2026-10-14)

- A `?record=<id>` link (Approvals inbox, notifications, guides) opened the list instead of the record when the
  page loaded cold — the record arrived before the object's metadata and the "object changed" effect closed it.
  A record of the object being opened now stays open.
- The home page accepts `?dashboard=<id>`, and choosing a dashboard updates the address, so a dashboard can be
  linked or bookmarked. A dashboard the viewer cannot see falls back to their first one.
- `docs/GENESIS-CAPITAL/DEMO_PITCH.md` gives the exact link, account and demo record for every scene.

### Fixed — Theme reaches every screen (2026-10-14)

- The client portal, published web forms, shared-document and e-signature pages now wear their workspace's theme.
  Before, they showed the remembered sign-in brand or the product's default indigo to anyone who had not signed in
  on that device.
- The loading spinner, wizard progress ring and stage colours without their own value used fixed indigo / violet
  hex codes; they now follow the primary, mid and accent theme colours (and the neutral palette for grey).

### Changed — Portal fund orders (2026-10-14)

- **Redeem** now sits on each row of *Fund holdings* and places a redemption for that holding's share class. The
  *Fund orders* button is **+ Invest** and places subscriptions only (it was "Invest or redeem" with an order-type
  picker). Switches are requested from the RM.
- New generic portal option `row_actions` (`config.portal.<realm>.row_actions`): a per-row button that creates a record
  in another section. The server checks the row belongs to the user and sets `prefill` / `defaults` itself.

### Changed — One demo workspace: Genesis Capital (2026-10-14)

- The financial-services vertical pack is now **Genesis Capital** (`prisma/verticals/genesis-capital`, tenant
  `genesis-capital`). Staff IDs use the `GC` prefix (`GCADMIN`, `GCRM1`, …) and `@genesis-capital.demo` emails;
  the demo password is `GenesisDemo#2026`. Docs moved to `docs/GENESIS-CAPITAL/`; the pack test is
  `tests/genesis-capital-pack.test.js`.
- The generic *Genesis CRM Demo* workspace (`genesis-life-demo`) is retired. `TEMPLATE_TENANT_SLUG` now
  defaults to `genesis-capital`.
- **`prisma/seed.js` rewritten.** It seeds the platform layer, installs the Genesis Capital pack through the
  same installer as `scripts/install-vertical.js` (now also a module exporting `installVertical`), then creates
  `PLATFORM01`. `--no-demo` skips demo records.

### Fixed — dangerous behaviour

- **The seed ran on `require`** and emptied the database. A syntax check (`node -e "require('./prisma/seed.js')"`)
  once truncated the shared database. It now runs only when executed directly, and it refuses a non-local
  `DATABASE_URL` without `--allow-remote` / `SEED_ALLOW_REMOTE=1`.
- **The seed cleared a hand-kept table list** that had fallen behind the schema, leaving rows that broke the
  platform-wide unique employee and office codes on re-seed. It now clears every Prisma model.
- **Field "indexed" flag ran DDL.** Turning on `is_indexed` executed `ALTER TABLE records ADD COLUMN …` on the
  shared table from a Builder request. The syntax was MariaDB-only, so MySQL rejected it. Nothing read the
  columns, and each one drifted the schema from Prisma. It is now a stored flag only.
- **Employee deactivate / reactivate / update** (`/api/auth/employees/:id…`): a workspace admin could deactivate
  the platform administrator, deactivate themselves, or deactivate or reset the password of an account with more
  authority. All three routes now share one guard (`findManageableEmployee`).
- Removed `frontend/public/_seed.html`, a development helper shipped in the production bundle that planted a
  fake session in `localStorage`.

### Removed

- Scripts for the retired demo workspace: `scripts/setup-sla-demo.js`, `scripts/setup-report-samples.js`,
  `prisma/seed-status-tracker.js`; and the one-off `scripts/remove-insurance-domain.js` (already applied; a fresh
  database never holds insurance data).
- Unused frontend modules: `PDFViewer.jsx` (insurance quote viewer), `TabbedWorkspace.jsx`, `ui/Card.jsx`,
  `hooks/useResolvedObject.js`; and `linkedin-posts.md`.

### Performance

- `HierarchyService.getTree` loads every direct-manager edge in one query instead of one query per descendant.
- The client portal resolves the subject's records across exposed objects in parallel.

### Added — End-to-end demo completeness (2026-10-14)

#### Platform

- **Approvals inbox** (*Tools ▸ Approvals*): every workflow approval step waits here for its approvers; decisions
  carry a comment, are recorded on the record's history and resume the workflow. Before this, approval
  notifications linked to a raw API URL and could not be acted on in the UI.
- **Record visibility per role** (`ui_permissions.view_scope`, *Builder ▸ Permissions ▸ Records*): "Own & team" or
  "All" records per role and object. Managers now also see records their team owns, not only records it created.
- **PDF documents**: merge templates render letterheaded PDFs (no dependency); `generate_document` uses picklist
  labels, formatted amounts and the business unit's legal entity. Generated letters were previously rejected by
  categories that accept only PDF and images.
- **Builder defaults on every create path** (website forms, workflows, imports, API).
- **Field-change workflows fire on Builder objects.** Editing a record now publishes `record.field_changed` with the
  fields that changed; before, only stage changes did, so workflows such as "conflict decision recorded" never ran.
- **SLA timers start immediately** on record creation and stage change; completion times for timers created after
  the fact come from the record's stage history.
- **Installer**: demo ownership routing, stage history, `platformDemo` (activities, tasks, reminders, documents,
  share links, e-signatures, wall-crossings, audit-chain baseline), `--reset-passwords`, faster parallel updates,
  encrypted-field-aware change detection.

#### Genesis Capital

- **Products & Services** module with full product sheets from genesis-capital.demo; fund master with
  published ISINs, benchmarks, minimums and fees; FMB 2029 corrected to a USD feeder fund.
- Realistic staff names; website enquiry form asks for tenure; conversion gate for loan enquiries; dedicated STR
  document category.
- About 800 sample PDF documents, 430 activities, tasks, reminders, signatures, share links and six
  wall-crossings.

#### Data

- Migration `20261014110000_permission_view_scope` (additive).
- Genesis CRM Demo tenant: 38 leftover insurance-era sample texts (cases, tasks, leads, activities, notifications)
  reworded to neutral financial-services wording.

### Added — Genesis Capital full scope and platform hardening (2026-10-14)

The Genesis Capital vertical now covers all 25 PRD modules and all 22 products on genesis-capital.demo, with
demo data across the application. Details: [GENESIS-CAPITAL/IMPLEMENTATION.md](../GENESIS-CAPITAL/IMPLEMENTATION.md),
[PLATFORM_BUILDER_EXTENSIONS.md §12–22](../developer-guide/PLATFORM_BUILDER_EXTENSIONS.md#12-personal-data-protection).

#### Genesis pack (configuration only)

- **Scope.** 18 modules, 91 objects, 1,406 fields, 71 workflows, 22 assignment rules, 13 SLA policies,
  15 dashboards, 34 EN/FR email templates, 14 merge templates, 11 checklists, 11 wizards and 6 public forms.
- **New areas.** Commercial lending, collateral and margin calls, loan servicing and PLR campaigns, funds and
  FMB 2029, securities, corporate advisory with insider lists, the Forex desk, cross-sell with next-best
  actions, marketing and consent, introducers, revenue, and the compliance registers.
- **Demo data.** About 2,300 records with 12 months of history.

#### Platform

- **Personal data.** Masked `pii` fields with an audited *Reveal* (`view_pii` permission); AES-256-GCM
  `encrypt` fields; view auditing; `conceal_existence` for STR-style registers.
- **Client & introducer portal** at `/portal/<workspace>`, driven by `config.portal` on objects. It covers
  email one-time codes, own-records-only views, creation, uploads (content-checked) and messaging.
- **Sessions.** Rotating refresh tokens with reuse detection; revocation on deactivation, password change and
  *Sign out everywhere*; TOTP two-factor with recovery codes, enforced by the security policy.
- **Records.** Record merge with re-pointing and 30-day reversal; bulk reassign; `records.updated_by`.
- **Workflows.** New `send_sms` step; integration `field_map` write-back; actions can write through a lookup
  (`lookup.field`).
- **Durable job queue** (`job_queue`). Failed integration and SMS calls are retried with back-off and
  dead-lettered; queue depth is shown on `/health`.
- **Sandbox integrations** (type `simulator`): screening, MCIB, LMS, transfer agent, OMS, FX dealing, SMS.
- **Public data feeds** (`GET /api/public/feeds/:workspace/:name`) from `config.public_feed`.
- **Personal calendar feed** (iCalendar) under *My account ▸ Security*.
- **Labels.** French labels on modules, objects, fields, stages and options, with an EN/FR switch in the
  header.
- **Daily formula refresh** for `TODAY` / `NOW` / `AGE` formulas.
- **Deployment.** Dockerfiles, a docker-compose stack and a GitHub Actions CI workflow.
- **Installer.** Diff-based and batched: an unchanged re-run writes nothing, and a full demo install
  dropped from more than an hour of single-row writes.

**Migrations** (all additive): `20261014090000_auth_hardening`, `20261014093000_module_config`,
`20261014100000_record_updated_by`, `20261014103000_job_queue`.

### Fixed (2026-10-14)

- **Single-record reads.** A leftover include of the removed `quote` relation made every single-record
  read fail.
- **Missing routes.** The public form routes and the Builder form-publish routes were not registered.
- **Role-level fallback.** An unresolvable role level fell back to `0` (the most powerful level) in the
  activity, task, reminder, search and record services. It now resolves to the least privilege.
- **Barrier override defaults.** The merged operational-permission defaults showed `barrier_override` as
  granted to every role. It now defaults to no access.

### Added — Platform Builder extensions and the Genesis Capital vertical (2026-10-13)

Generic platform capabilities, so an industry CRM can be configured in the Builder rather than coded,
and the first vertical built on them: Genesis Capital (Phase 0 + Phase 1 MVP of
`docs/GENESIS-CAPITAL/GENESIS_Capital_CRM_PRD.md`). Details:
[PLATFORM_BUILDER_EXTENSIONS.md](../developer-guide/PLATFORM_BUILDER_EXTENSIONS.md),
[GENESIS-CAPITAL/IMPLEMENTATION.md](../GENESIS-CAPITAL/IMPLEMENTATION.md).

- **Formula language** (`services/formula.js`): a safe parser/evaluator, with no `eval`. It powers formula
  fields, `expression` validation rules, workflow `expression` conditions and stage entry rules. Includes
  `LOOKUP` (effective-dated), `LATEST`, `COUNT_RELATED`, `SUM_RELATED`, `PMT`, date and age functions.
  Parent roll-ups recompute when children change.
- **Lookup fields**: record picker, titles in lists and panels, and an automatic **Related** tab on every record.
- **Record actions**: manual workflows appear as buttons on the record panel.
- **Stage gates**: `required_fields` and `entry_rule` per pipeline stage, enforced for drag, API, bulk and
  workflow moves.
- **Business units and information barriers**: records stamped from object config and filtered in lists,
  search, related lists, lookups, analytics and documents. Barriers bind admins. Time-bound
  wall-crossings need four-eyes approval. UI: **Tools ▸ Access & Barriers**.
- **Tamper-evident audit chain** for permission, membership, wall-crossing and publishing changes, with a
  verify endpoint.
- **Public web forms**: publish any Builder form at `/f/<key>`. Consent, honeypot, rate limits, optional
  reCAPTCHA and computed `result_fields` are supported.
- **Object analytics** dashboard source (`POST /api/analytics/object`) and **record SLAs** on any
  object's pipeline.
- **Workflow steps** `send_email` (language variants) and `generate_document`. `create_record` with
  `link_field`/`store_as`/`stage`; stage moves by name; maker-checker approvals
  (`exclude_actor`/`exclude_field`).
- **Vertical packs**: `scripts/install-vertical.js` installs a pack of Builder metadata idempotently.
  `prisma/verticals/genesis-capital` provides 8 modules, 26 objects, 15 workflows, 12 assignment rules,
  6 SLA policies, 14 EN/FR email templates, 5 merge templates, 5 wizards, 3 dashboards and 3 public forms.
- **Database** (additive migration `20261013180000_platform_builder_extensions`): `business_units`,
  `employee_business_units`, `barrier_zones`, `barrier_members`, `wall_crossings`, `audit_chain_events`;
  `records.business_unit_id`/`barrier_zone_id`; `ui_objects.config`; `ui_forms.config`/`public_key`;
  `sla_policies.object_id`/`config`.

### Fixed (2026-10-13)

- **Record fetch after the Quotes removal:** the record hydration path and the email merge path
  still included the deleted `quote` relation. Prisma rejects that at query time, so single-record
  reads failed. Mocked tests could not see it; `tests/record-include-schema.test.js` now checks
  those includes against the real schema.
- **Barrier override shown as granted:** the Permissions screen showed every role as holding the
  barrier override because missing rows defaulted to the level-based scopes. Missing rows now
  default to no access, and an unknown role level no longer defaults to the admin tier.
- **Legacy `lead_score` object view:** the read-only view and the record service path behind it were
  removed. No tenant has the object.
- **Cross-tenant moves:** a request body carrying `tenant_id` could move a module, object, field or
  form into another tenant. Scoped writes now pin the tenant, and metadata writes take column whitelists.
- **Document access:** documents attached to a record were listable and downloadable by users who
  could not see the record. They now inherit the record's access.
- **Rule-based assignment:** conditions on custom objects never matched, because only `crm_*` columns
  were read.
- **Auto-numbering:** numbers ignored the format width, so the sequence reissued numbers after 999.
  Two objects with a same-named field also shared one sequence.
- **Custom validation rules:** `custom` rules ran admin-typed JavaScript in users' browsers (stored
  XSS). The rule type is retired in favour of server-side `expression` rules.
- **Public form keys** could be set through the ordinary form update.
- **Hardcoded conversion maps:** the lead and prospect conversion maps had insurance-specific
  hardcoded field maps. Conversion now copies same-named fields.
- **List cells** were formatted by hardcoded field names. A metadata-driven `FieldValue` renderer
  replaces them.
- **Test flake:** the forged-JWT test failed intermittently.

### Changed (2026-10-13)

- The demo tenant is now **Genesis CRM Demo** (industry *professional services*). The remaining
  insurance wording was removed from its fields, option sets, lead-scoring rules and seed text.
- The Sidebar groups modules by their `category`, so a new category gets its own section without a
  code change.

### Removed — The INSURANCE domain and the Quotes object (2026-10-13)

Genesis CRM is now a general-purpose CRM. The life-insurance Agency Management System and the CRM
Quotes object were deleted end to end. Entries below this one describe them as they were and are
kept as history.

- **UI:** the INSURANCE left-sidebar section and its pages — Quote Engine, Quotes, Applications,
  Policies, Claims, Underwriting (and the case review page), Commissions, Agent Workbench,
  Declarations and Document Collection — with their routes under `/insurance/*` and `/quotes`.
- **Modules and metadata:** the `quotes`, `applications`, `policies`, `claims`, `underwriting`,
  `commissions`, `declarations` and `document_collection` modules, and the life-insurance
  application wizard.
- **API and services:** every `/api/insurance/*` route and `/api/runtime/quotes*`;
  `insurance-domain.service.js`, `calculation-engine.service.js` (premium calculation engine),
  `rating-adapter.js` (carrier rating adapters), `template-engine.service.js` (insurance PDFs and
  illustrations) and `quote.service.js`. The insurance stage automation (application →
  underwriting, claim status sync) and the record → `insurance_applications` bridge are gone.
- **Database:** the 24 insurance tables (`insurance_carriers`, `carrier_adapter_configs`,
  `carrier_products`, `insurance_policies`, `insurance_policy_beneficiaries`,
  `insurance_policy_status_history`, `insurance_applications`, `underwriting_cases`,
  `underwriting_requirements`, `insurance_claims`, `claim_events`, `commission_entries`,
  `quote_scenarios`, `compliance_artifacts`, `submission_checklists`, `policy_endorsements`,
  `renewal_tasks`, `billing_schedules`, `policy_invoices`, `policy_payments`, `claim_reserves`,
  `claim_payment_events`, `producer_appointments`, `commission_statements`), the CRM `quotes` and
  `quote_line_items` tables, and the `documents.application_id` column.
- **Entitlements:** the `insurance` feature group and the keys `ins_quoting`, `ins_policy_admin`,
  `ins_underwriting`, `ins_claims`, `ins_commissions`, `ins_carrier_feeds`, `ins_ai_underwriting`
  and `analytics_policy`, along with the legacy flag aliases `underwriting_workflow`,
  `ai_underwriting` and `policy_analytics`.
- **Docs:** deleted `user-guide/GENESIS_INSURE_JOURNEY.md`, `user-guide/UNDERWRITING_FLOW.md` and
  `user-guide/SAMPLE_FLOW.md`. `user-guide/PRODUCTS_AND_QUOTES.md` is now `user-guide/PRODUCTS.md`
  and covers products only. Insurance endpoints, tables, feature keys, dashboards, workflows and
  examples were removed from the rest of the knowledge base.

**Kept:** the standalone Document Management module (`/documents`), Products, the CRM objects
(leads, prospects, clients, contacts, accounts, opportunities, cases), SLA, reporting, workflows,
social and the currency service.

### Documented — What a live WhatsApp and paid-ads rollout actually requires (September 2026)

A client engagement asked for four things: bulk and targeted WhatsApp messaging, Facebook campaign
analytics, two-way customer chat landing in the CRM, and whatever UI that implies. The existing
`WHATSAPP INTEGRATION` section covered roughly half of it. Three gaps were material enough to correct
rather than leave for the implementer to discover:

- **The social schema is post-and-mention shaped, not message shaped.** `SocialMediaPost` is
  broadcast-to-the-world with one engagement blob, so it cannot track per-recipient delivery; and
  `SocialMediaMention` is one flat row with a single `response_content`, so it cannot hold a
  conversation. Neither bulk sending nor two-way chat fits the tables we have. The docs now name the
  five models required and warn against stretching `SocialMediaMention`, which would break the inbox,
  the routing rules and the campaign roll-up — all of which assume one row is one complete item.
- **`SocialMediaCampaign` is not a Meta Ads campaign**, and the roll-up in `refreshCampaignPerformance()`
  is positional: it sums every published post on a matching platform inside the date window. With one
  campaign live the number reads correctly; **with two overlapping on the same platform, both report the
  combined total**. Paid metrics (spend, CTR, conversions) come from the Marketing API — a different
  token, a different object hierarchy and a separate App Review from the page publishing scopes already
  documented. The caveat is now stated everywhere the figure is described: the admin guide, the user
  guide and the engine reference.
- **The multi-tenant decision precedes the code.** A SaaS serving many clients wants Meta **Embedded
  Signup**, so each tenant brings its own WABA, number, templates and billing. Retrofitting that onto a
  single shared operator account is expensive, so it is now called out before the integration steps
  rather than after them.

Also added: the business-registration and App Review sequence (the schedule risk, not the code),
opt-in / quality-rating compliance, the `eng_whatsapp` entitlement key, an explicit build order, and a
build-vs-reuse table for the UI — the answer being one new `/conversations` route plus a record-embedded
thread, with tenant lists, audience pickers and analytics reusing what already exists.

No code changed. Documentation only:
[SOCIAL_MEDIA.md](../admin-guide/SOCIAL_MEDIA.md) (new **Meta Ads & Campaign Analytics** section, expanded
WhatsApp sections), [SOCIAL_ENGINE.md](../developer-guide/SOCIAL_ENGINE.md) (known gaps, roll-up caveat),
[12-social-media.md](../user-guide/12-social-media.md), [ROADMAP.md](ROADMAP.md) (Phase 7 items 4 and 5).

### Fixed — Every deployed plan sold one feature out of thirty-seven (September 2026)

Reported from the demo tenant: an **Enterprise** workspace could not see the Insurance modules, and
neither could any user below its administrator. Not by design — a defect in the entitlement
resolution introduced with the plan-gating work, and the most damaging one in this series.

`subscription_plans.features` predates the feature catalogue and holds free text on every deployed
database: `['basic_crm', 'email_templates', 'workflow_automation', 'pipeline_management', …]`. Not
one of those strings is a catalogue key or a legacy alias, so `normaliseFeatureList` discards all of
them and returns the core features alone. `#planFeatureSet` treated any **non-empty** stored array
as a curated list, so every plan row on every existing installation resolved to exactly one feature
(`crm_records`) out of thirty-seven — Free, Starter, Professional and Enterprise alike.

The blast radius was most of the product, for every tenant:

- all eight shipped Insurance modules dropped from the sidebar and from `/runtime/bootstrap`;
- the insurance API refused 23 route families with 403;
- Reports, SLA Board, Social Media and Documents disappeared from Tools;
- nine Builder sections disappeared, and Workflow and Assignment writes returned 403.

Administrators were not exempt and should not have been: an admin bypasses *role* permissions, but a
plan is commercial, not role-based.

The rule is now "at least one entry must be a key we understand" (`hasCuratedFeatures`), and a list
with none falls back to the tier default. One recognisable key is enough to call it curated, because
no legacy name collides with a catalogue key — every key carries a `crm_` / `ins_` / `auto_` / …
prefix — so a partial match means somebody edited the plan with the current editor and their intent
must win, even when it sells *less* than the tier. A deliberately narrow curated list is therefore
still honoured.

This makes existing installations self-healing at read time: no migration is required, and the live
Enterprise tenant now resolves to 35 of 37 features (the two withheld are `ins_ai_underwriting` and
`analytics_policy`, switched off platform-wide by feature flags — that layer working as intended).
`SubscriptionService.list` reports `features_explicit: false` for such a row, so the Plans console
shows its **tier default** badge; saving the plan, or **Reset features** on its card, replaces the
legacy strings with catalogue keys and removes the reliance on the fallback.

`tests/entitlements.test.js` pins the exact strings the previous seed wrote, for all four tiers.

### Fixed — Custom tenant roles lost their authority after the role-map hardening (September 2026)

A regression introduced by the September authorization fix, caught on review. `initRoleLevel` had
correctly stopped absorbing every tenant's `roles` rows into the process-wide `ROLE_LEVEL` map (a
tenant naming a role `admin` at level 7 was moving the admin bar for every other tenant). But five
call sites — the admin-bypass checks in `PermissionService` and `MetadataService`, and the
operational-scope defaults — still resolved a role's level from that map with no other source. Every
**custom** tenant role therefore fell to `NO_ACCESS_LEVEL`: a `regional_manager` at level 4 that
relied on the default scopes dropped from `hierarchy` to `own`, and a custom admin-level role lost
its admin bypass.

`services/role-level.js` is now the one resolver: it reads the tenant's own `roles` row (then the
shared system row), falls back to the built-in ladder, and fails closed — the same order sign-in
uses — memoised per (tenant, role) and dropped on any role edit. `PermissionService`,
`MetadataService` and `DashboardService` (which had grown its own private copy) all use it, so the
three cannot disagree. `tests/role-level.test.js` pins the regression cases.

The client had the mirror-image defect: `ProtectedRoute` checked roles by **name**, so the same
custom admin-level role was turned away from `/builder` in the browser while the server would have
admitted it. It now compares `role_level`, accepting `roles` for existing callers.

### Added — Plans are enforced on the request path, and the client hides what it cannot use (September 2026)

The entitlement engine answered "does this tenant have feature X?" for a release before anything but
the underwriting guard asked it. A Starter tenant could open Claims, Commissions and every automation
builder and use them in full — the price book was a suggestion. And the one screen that was gated
rendered first and refused second.

- **`middleware/require-feature.js`** — `requireFeature(key)` per route, and `featureGateByPrefix`
  for a plugin that declares dozens of routes under a few prefixes: one table, matched against the
  *declared route pattern* (never user-supplied path text), longest prefix first, so a new route
  under an existing prefix is gated without anyone remembering to annotate it. A refusal is a 403
  with `code: FEATURE_NOT_ENTITLED` naming the feature and the tier it is sold from, so the client
  can explain rather than shrug. Platform admins pass every gate — they have no plan.
- **Applied** to the insurance plugin (quoting, policy administration, underwriting, claims,
  commissions, carrier feeds, application documents — 23 prefixes) and to the write paths of the
  Workflow and Assignment builders. Reference data every insurance tenant has from Starter
  (products, carriers, templates) stays open.
- **`GET /api/auth/entitlements`** returns the enabled keys and, for each locked one, the reason.
  The same block ships inside `/runtime/bootstrap` so every screen has it from the first render.
- **Shipped modules are filtered server-side** in `/runtime/modules` and bootstrap by
  `MODULE_FEATURE`, so a Starter tenant's navigation simply does not show Claims. Tenant-made
  modules are never gated.
- **The client** gains `useEntitlements()` (fails *open* until bootstrap delivers — hiding half the
  product because a sync is slow is worse than the 403 the server produces anyway), a `FeatureGate`
  route element that infers the feature from the path, and a **locked-feature page** that names the
  feature, quotes the server's reason, and shows an admin where to go about it. Sidebar tools and
  Builder sections the plan excludes are hidden rather than shown-and-refused.

### Added — An assignment-rule simulator: "who would get this record, and why?" (September 2026)

Routing rules fail quietly. A rule that never matches, a pool with nobody active in it, a catch-all
placed above the specific rules — none of that is visible in a list, because the answer depends on
the record. `AssignmentService.explain()` is a dry run of `assign()`: every active rule for the
object is evaluated in order and reported — matched, no match, or skipped, with the reason, the
failed conditions and their actual values, the open-load table for a load-balanced pick, and the
pool members skipped as deactivated — then the decision. Nothing is written and the round-robin
cursor is *peeked*, not advanced, so simulating never steals a turn from the next real record.

`POST /builder/assignment-rules/explain` takes an existing `record_id` or hypothetical `fields`,
and the Builder's **Test these rules** panel sits above the rule list. No mainstream CRM ships this
for assignment; HubSpot's closest equivalent previews one rule at a time.

The rule form also now offers a pool on a `rule_based` rule — the engine has always rotated through
one when a matched rule names no assignee, but the picker was hidden for that type, so the path
could not be configured.

### Changed — The SLA editor only offers what the engine will run (September 2026)

The policy editor read `GET /api/sla/capabilities` from the previous release's server work but the
metric dropdowns were still hard-coded to both metrics for every entity. They are now derived from
the capabilities response per entity — a lead offers first response only, a task resolution only —
with a plain-language line stating what the entity is measured on, and a warning listing any
existing target the server will reject before the save button is pressed.

### Fixed — AUTOMATE: four ways a rule could look configured and do nothing (September 2026)

Every defect here shares one failure mode, which is the worst an automation builder can have: the
configuration saves cleanly, looks right in the UI, and never runs. The team believes it is covered.

- **Toggling an assignment rule crashed.** `AssignmentService.updateRule` destructured `...update`
  from a `const` rest pattern and then rebound it, so `TypeError: Assignment to constant variable`
  was thrown on any update carrying `is_active` — i.e. every activate/deactivate answered 500.
- **Invalid workflow step JSON was silently discarded.** The step editor did
  `try { JSON.parse(config) } catch { config = {} }`, so a misplaced comma threw the author's work
  away and saved an **empty** config: a webhook with no URL, a condition with no field, no error.
  The editor now parses as you type, shows the parse error and the missing required keys, and blocks
  the save.
- **Every record-triggered workflow built in the Builder was inert.** The engine finds workflows
  with `where: { object_id, trigger_type, is_active }`, and the create form had no object field at
  all — so every `on_create` / `on_update` / `on_delete` / `field_changed` workflow saved with
  `object_id: null` and could never match an event. The form now requires an object for those four
  triggers, `assertWorkflowTriggerable` rejects a save without one, and the list flags pre-existing
  rows as **Not bound — cannot fire**.
- **An unrecognised SLA condition operator matched everything.** `conditionsMatch` defaulted to
  `return true`, so a typo in one condition silently widened a policy to every record of the entity.
  It now fails closed, matching the workflow and assignment engines, which already did. An empty
  condition list still matches everything — that is the documented catch-all.

### Fixed — Assignment routing sent work to people who could not receive it (September 2026)

- **Round-robin and load-balanced assigned to deactivated employees.** Neither strategy filtered the
  pool, so a deactivated rep stayed in the rotation and kept receiving records they can no longer
  sign in to see. Pools are now filtered to active employees, falling through to the rule's fallback
  when none remain.
- **Load balancing counted lifetime volume, not current workload.** It counted *every* record ever
  assigned, across *every* object, including trashed ones. A rep who had closed 400 deals looked 400
  times busier than a new hire with an empty desk, so the newest joiner received everything until
  they caught up on lifetime volume — the strategy inverted itself. It now counts open records of
  the rule's own object, excluding terminal stages and deleted rows. A stage is terminal when its
  metadata says so (`config.is_closed`) or it is conventionally named (won/lost/closed/…), mirroring
  the existing `is_conversion_stage` convention.
- **Pools are de-duplicated on save**, in both create and update. A duplicate in a round-robin pool
  silently doubled that person's share, which is the one thing a round-robin exists to prevent.

### Changed — The shipped lead-scoring model is now a life-insurance model (September 2026)

The starter rules were generic B2B-SaaS boilerplate, and two of them could not work at all:

- **"Senior Job Title"** and **"Manager Job Title"** used `contains` with a comma-separated list
  (`'VP, Director, Chief, President, Owner, Founder'`). `contains` is a single substring test, so
  each asked whether a job title contained that entire literal string. They awarded 20 and 10 points
  to nobody while looking entirely reasonable in the UI.
- **"Target Industry"** scored a B2B firmographic list (`Technology, Software, Finance…`),
  meaningless for individual and family life cover. **"Has Website"** scored a company attribute on
  a consumer prospect. Annual revenue and rating were filed as `behavioral`, which neither is.

Replaced with eleven rules built on the values this product actually stores: income bands read as
annual household income (the figure life cover is sized against), the insurance source hierarchy
(referral and partner highest, cold-call and untargeted social negative), needs-analysis progress,
and contactability with phone weighted above email because life cover is sold in conversation. Two
rules carry **negative** points on purpose — in a model where every rule adds, every lead eventually
scores highly and the ranking stops meaning anything. "Agent rates it hot" is weighted below source
and status deliberately: it is a judgement, not an observation.

`tests/automate-rules.test.js` now asserts every shipped rule uses an operator the engine
implements, reads a field the scorer actually selects, matches real stored values, and never pairs
`contains` with a list.

### Added — Implemented-but-unreachable automation features are now reachable (September 2026)

Three capabilities existed on the server, were documented and tested, and could not be chosen:

- **The `field_changed` workflow trigger** — one of six, absent from the form. It is the trigger that
  can read a field's *previous* value, which is how you detect a transition (open → won) rather than
  merely landing on a value.
- **Five of the fourteen lead-scoring operators** (`starts_with`, `ends_with`, `greater_equal`,
  `less_equal`, `not_in_list`). The value input is now operator-aware: it disappears for operators
  that test the field itself, warns on a non-numeric value for numeric comparisons, and explains
  comma-separated matching for list operators.
- **The full SLA vocabulary**, via `GET /api/sla/capabilities` — entity/metric matrix, condition
  operators, escalation triggers and actions — so the Builder reads the engine's capabilities rather
  than hard-coding dropdowns that can drift from it.

### Added — Configuration guidance on every Builder section (September 2026)

One section (Workflows) shipped with an explanatory panel: a bespoke 100-line component used nowhere
else. The other nineteen dropped an admin straight into a form with no statement of what the thing
is for, no note on how it is normally set up, and no warning about the mistakes that make a rule
silently inert.

`BuilderGuide` now renders the same four-part guide on all twenty sections from
`utils/builderGuides.js`: **what** it configures, **when** to use it rather than a neighbouring
section, **how it is normally set up**, and **what to watch out for** in this product specifically.
It opens by default so a first-time admin cannot miss it, and remembers per section when collapsed,
so an experienced admin dismisses each once while it stays available for the next person.

Content is data rather than JSX, so a new section needs an entry rather than a component, and
`tests/builderGuides.test.jsx` fails the build if a Builder route has no guide, if a guide is a stub,
or if a line is filler.

The workflow step editor additionally gains a per-step-type reference — the accepted config keys,
which the engine cannot act without, a practice note, and **Insert a working example**. The schemas
are read from the engine's own branches, and a test asserts every shipped example satisfies its own
required fields.

### Added — SLA policies are validated against what the engine can do (September 2026)

The reconciler iterates `Object.keys(ENTITY[type].metricStatus)`, so it only ever evaluates the
metrics an entity declares: cases on first response and resolution, leads on first response, tasks
on resolution. The Builder offered both metrics for all three, so a `resolution` target on a lead
saved cleanly and was then ignored forever.

`assertPolicyShape` now rejects, with an explanation, a target on an unsupported metric, a
non-positive target duration, a warning threshold outside 1–99 (zero warns at creation, 100 warns
exactly at breach — neither is a warning), an escalation action the engine has no branch for, and a
condition operator that is not supported. `supportedMetrics` is derived from the reconciler's own
map rather than a parallel list, so the two cannot drift.

### Fixed — Two "required" markers that enforced nothing (September 2026)

`WorkflowBuilderPage` and `PipelineBuilderPage` both rendered `label="Name *"` with an `error={…}`
binding but registered the field with no validation rule, so the asterisk was decorative, the error
slot could never populate, and an empty name reached the server. Both now register a required rule.

### Added — Plans now decide what a customer gets, and features are managed per tenant (September 2026)

There were two unrelated notions of "feature", and neither did anything.
`subscription_plans.features` held free text (`'basic_crm'`, `'workflow_automation'`) that nothing
read, nothing validated, and the plan editor had no field for — so its only possible value was
whatever `prisma/seed.js` wrote once. `feature_flags.name` held a disjoint set
(`underwriting_workflow`, `ai_underwriting`, `api_v2`, `dark_mode`), and `isEnabled()` resolved
override → rollout → global default **without ever consulting the plan**. The two sets shared not one
key, so "which features does this customer have?" had no answer anywhere, and the `premium` flag
category gated nothing despite the admin guide saying it did.

- **A feature catalogue** (`services/platform/feature-catalogue.js`) is now the single vocabulary
  both sides speak: 37 features in 8 groups, each declaring the cheapest tier that includes it.
  Tiers are generated from that declaration rather than four hand-maintained arrays, so each tier is
  a strict superset of the one below **by construction** and a new feature lands in the right tiers
  the moment it is added. Five pre-catalogue flag names resolve through aliases, so deployed rows and
  existing call sites keep working without a migration against production.
- **One resolver** (`services/platform/entitlement.service.js`) answers every entitlement question,
  in a deliberate order: the **plan** says what was sold; a **flag** says whether we have shipped it
  and may only *withhold*, never grant (so switching a flag on platform-wide cannot hand paid
  functionality to a free tenant); a **per-tenant override** is the deliberate exception and is the
  only input allowed to contradict the other two, in both directions. Core features sit outside all
  of it and cannot be switched off. Every answer carries the `source` and a reason in words, because
  "not sold", "switched off platform-wide", "outside a rollout cohort" and "explicitly revoked" are
  four different problems with four different fixes.
- **`FeatureFlagService.isEnabled` delegates to the resolver**, so the underwriting guards in
  `routes/insurance` and `routes/runtime` became plan-aware without being touched.
- **A Features panel per tenant** (`TenantFeaturesPanel.jsx`), reached from the ✨ action on a tenant
  row: every feature grouped, with its resolved state, the reason, and a **three-state** control —
  Plan default / Granted / Revoked. The third state is what makes an exception undoable; a two-state
  switch would let an operator create an override that can never be removed, leaving the tenant
  permanently detached from its own plan. Per-tenant control previously existed only as an
  undocumented API call taking a numeric flag id.
- **The plan editor edits features.** A grouped picker with select-all per group and a one-click
  reset to the tier default, plus a **Compare** view — tiers across the top, the whole catalogue down
  the side — which is the only way to see whether Professional really is a superset of Starter.
  Plan cards now show feature counts and how many tenants are on each plan.
- **Feature Flags says what each flag controls** and which tier sells it. A flag whose name matches
  no catalogue feature is labelled *gates nothing sellable*, because a switch with nothing behind it
  is worse than no switch.
- **New endpoints:** `GET /platform/feature-catalogue`, `GET /platform/tenants/:id/features`,
  `PUT /platform/tenants/:id/features/:key`, `PUT /platform/tenants/:id/features`,
  `POST /platform/plans/:id/reset-features`. Overrides are audited.
- **Docs** — `admin-guide/PLANS_AND_FEATURES.md` (new), `admin-guide/SUPER_ADMIN.md`,
  `developer-guide/API_REFERENCE.md`.

Not done yet, and called out in the guide: the tenant-facing app does not hide what it is not
entitled to. The engine is authoritative server-side and `enabledKeys()` exists to drive client
gating, but wiring it through the CRM's navigation touches most of the app and deserves its own pass.

### Added — Quick Find for configuration (September 2026)

Configuration lives on three surfaces that did not know about each other: the Builder (twenty-odd
pages inside a collapsed sidebar group), the Platform console (eight more, in a different collapsed
group), and Settings. The Builder had a search box that only filtered the Builder, so a question
whose answer was in Settings or the console could not be answered by searching — only by already
knowing.

`SetupFinder` is one keyboard-first finder (Cmd/Ctrl-K) over every configurable destination, grouped
by surface so the answer also teaches where the thing lives. It matches on **synonyms** rather than
page titles — "picklist" finds Modules & Objects, "SSO" and "2FA" find Security, "round robin" finds
Assignment Rules, "business hours" finds the SLA engine — because the useful vocabulary is the one
users bring, not the one we chose. Entries a viewer cannot reach are never indexed, so it does not
double as a map of the admin console for non-admins. Ranking puts an exact label match above a
prefix above a keyword, so "roles" surfaces Roles & Levels rather than Assignment Rules.

It sits beside the existing record search rather than merging with it: one searches what the business
does, the other how it is set up, and the right ranking for one is wrong for the other.

### Changed — A platform admin lands on the platform console, not on one tenant's CRM (September 2026)

`PLATFORM01` was shown Tools, Documents, every runtime module and the whole Builder inline, with
nothing saying whose data any of it was. It is one tenant's: the platform admin carries a
`tenant_id` like every other employee (the column is non-nullable), so those sections render the
workspace that employee happens to belong to — the demo tenant on a seeded install. An operator
reasonably reads them as platform-wide, and they are not.

Every major CRM keeps these surfaces apart rather than interleaved. Salesforce puts partner and org
management in a separate Partner Business Org (Environment Hub, LMA); Dynamics 365 puts it on a
different site altogether (Power Platform Admin Center); HubSpot makes you switch accounts out of
the partner portal; Zoho and Freshworks both use a distinct admin console (Zoho Directory, Neo Admin
Center). In all of them you reach a customer's data by explicitly entering that customer.

So the tenant-facing sections now sit behind a labelled **Workspace view** boundary that names the
workspace, collapsed by default for a platform admin on a console page. Access is deliberately
unchanged — a support engineer needs a way in, and removing it would be a bigger change than the
confusion warrants. What changes is that entering a workspace is an explicit, named act. Every other
role sees the sidebar exactly as before. The login response now carries `tenant_name`, `tenant_slug`
and `tenant_plan` so the boundary can name the workspace.

### Fixed — The Platform sidebar always highlighted Dashboard (September 2026)

The sidebar decided the active link per link, as `pathname === to || pathname.startsWith(to + '/')`.
That is right for a link whose children are its own detail pages, and wrong the moment a section has
an index route that is also the prefix of its siblings. `/platform` is the prefix of
`/platform/tenants`, `/platform/plans` and every other console page, so **Dashboard** matched on all
of them: it was permanently highlighted, and two links appeared current at once.

`utils/navActive.js` now decides against the whole link set — a link is current when it matches and
no *longer* link in the same group matches better — which is the standard "most specific route wins"
rule, applied once per group so a new nested route cannot silently light up its parent. Applied to
both the Platform and Builder groups; a lone link such as `/settings` keeps prefix behaviour and
stays lit on its detail pages. Pinned by `tests/navActive.test.js`, including that exactly one link
is ever lit for every console path.

### Fixed — Plan CRUD accepted values that could not work (September 2026)

- **Plan limits were caller-settable free text.** `max_users: -1` and `trial_days: 400` were both
  accepted; a negative cap locks a tenant out of their own workspace. Limits, prices and trial
  length are now range-checked.
- **A plan could be renamed**, orphaning every tenant on it — `tenants.plan` points at the name.
  Rejected with an explanation; the editor already disabled the field, but the API did not.
- **`features` accepted anything.** Now validated against the catalogue, with the unknown keys named
  in the error. Omitting it on create means "the standard set for this tier" rather than nothing,
  which is never what the operator meant.
- **Plans with no stored feature list** (every plan created before this) now display the catalogue
  derivation for their tier instead of reading as selling nothing.

### Added — One-call tenant onboarding, with a setup checklist per tenant (September 2026)

Creating a tenant used to insert one row. Everything that makes the product work — the role ladder,
an office, the modules/objects/fields/forms/pages/pipelines/wizards the whole UI is generated from,
the dashboards, the automation, the document taxonomy — existed only for the tenant `prisma/seed.js`
builds, so the first administrator of every new tenant signed in to a CRM with no CRM in it. The
platform admin's only recourse was to run seed scripts by hand against the database.

- **`TenantProvisioningService`** (`services/platform/tenant-provisioning.service.js`) turns a
  `tenants` row into a usable workspace in eight idempotent steps: role ladder, office and region,
  CRM metadata, automation, dashboards, SLA policies, email templates, first administrator. Each
  step checks what is already there and installs only the gap, so a re-run finishes a
  half-provisioned tenant instead of duplicating it, and a failure mid-way is recoverable rather
  than a tenant to delete and start again.
- **Metadata comes from a template tenant, catalogues from code.** UI metadata is data, not code —
  it lives only in the database and an admin edits it in the Builder — so it is cloned from a
  nominated template tenant (explicit id → `TEMPLATE_TENANT_SLUG`, default `genesis-life-demo` →
  the lowest-numbered tenant that has any). The clone plan is a declarative, parent-first table of
  19 models that rewrites every foreign key as it copies, drops rows whose parent did not come
  across, remaps the polymorphic `ui_permissions.entity_id` per `entity_type`, and clears columns
  naming a template-tenant employee. Workflows and dashboards are installed from
  `prisma/crm-workflows.js` / `prisma/crm-dashboards.js` instead, so a new tenant gets the current
  catalogue even if the template's copy has been hand-edited. Business data — records, leads,
  policies, claims, quotes, documents, reports, employees — is never copied.
- **`POST /api/platform/tenants/onboard`** creates the tenant *and* provisions it *and* creates its
  first administrator in one request, returning a per-step report. The tenant row is committed
  before the steps run, so a failing step leaves a real tenant the console can finish rather than a
  rolled-back half-creation an operator has to diagnose from a log.
- **Readiness and "finish setup".** `GET /tenants/:id/readiness` reports what is present and what is
  missing per step, and distinguishes *usable* (roles + metadata + an admin: somebody can sign in
  and see a CRM) from *ready* (all eight). `POST /tenants/:id/provision { missing_only: true }` runs
  just the gap. The tenant list now carries a **Setup** column — `Ready` / `n/8 set up` /
  `Needs setup` — that opens the checklist.
- **A three-step wizard** replaces the two disconnected modals. The URL slug is derived from the
  organisation name and checked for availability as you type (accents folded, so "Café Assurance"
  becomes `cafe-assurance`); the admin's employee ID is suggested from the workspace name and
  likewise checked, with a workspace-prefixed alternative offered in one click; passwords are
  generated (18 characters, no `0 O 1 l I` so they survive being read aloud) with a strength
  read-out. **Next** is disabled until the address is confirmed free, so a form that will 409 cannot
  be submitted. The final screen shows the setup report and the credentials to hand over rather than
  a bare "Created" toast.
- **`GET /tenants/check-slug`**, **`GET /tenants/check-admin`** and **`GET
  /tenants/provisioning-steps`** back the wizard's live feedback. `employees.employee_id` and
  `employees.email` are unique across the whole platform, not per tenant, which is why availability
  is checked before submit rather than discovered from a constraint violation.
- **`POST /api/sla/seed-defaults`** now shares its policy set with provisioning via an exported
  `seedSlaDefaults`, so the two cannot drift.
- **Docs** — `admin-guide/TENANT_ONBOARDING.md` (new), `admin-guide/SUPER_ADMIN.md`,
  `developer-guide/SECURITY.md`.

### Fixed — Authorization: three ways a tenant could act as a platform administrator (September 2026)

Three independent escalation paths, all ending at level 1 — which in a multi-tenant deployment means
reading every other customer's data. See `developer-guide/SECURITY.md` for the full write-up.

- **An unresolvable role was the most powerful role.** `AuthService.login` ended its role lookup with
  `role?.level ?? 1`, and level 1 is `platform_admin`. An employee whose role name matched no `roles`
  row signed in with platform-wide authority — the *guaranteed* state of every tenant created
  through the console, since roles are tenant-scoped and only the seeded demo tenant had rows. The
  same `?? 1` sat in the impersonation endpoint and in the dashboard/runtime visibility filters.
  `resolveRoleLevel` now falls back to the built-in ladder and then to `NO_ACCESS_LEVEL`, and clamps:
  only the literal role name `platform_admin` may hold level 1, whatever a row or a token claims.
- **One tenant's role name moved the gates for every tenant.** `requireRole('admin')` took its
  threshold from a process-wide map hydrated at boot from *every* tenant's `roles` rows, last-write-
  wins. A tenant creating a role called `admin` at level 7 moved the admin bar to 7 platform-wide; a
  role called `platform_admin` at level 2 (permitted — only the level was reserved) handed the
  platform console to every level-2 user everywhere. Gates now compare against a frozen
  `BUILTIN_ROLE_LEVEL`; `initRoleLevel` absorbs only system roles (`tenant_id IS NULL`) and never
  overwrites a built-in; the name `platform_admin` is reserved.
- **A tenant admin could rewrite their own role.** `PUT`/`POST /api/auth/employees` spread
  `req.body` into Prisma, so `{ role: "platform_admin" }` re-badged the caller and
  `{ tenant_id: 7 }` moved an employee into another workspace. Both routes now take an explicit
  field whitelist, and `assertAssignableRole` requires the role to exist, be visible to the tenant,
  and not be reserved.

### Fixed — Suspending a tenant now actually suspends it (September 2026)

`Tenant.status` was decorative. The admin guide promised that suspending a tenant made "all users
lose access", but nothing consulted the flag on the request path: every issued JWT kept working
until it expired, so a suspended, cancelled or deleted customer carried on using the product.
`trial_ends_at` was written at creation and never read again.

`middleware/tenant-lifecycle.js` is the single decision point, called from `authenticate()` on every
request and from `AuthService.login`, so both "no new sessions" and "existing sessions stop" are
covered. Statuses are memoised for 30 s (one query per tenant per TTL, not per request) and every
platform route that changes a status drops the memo as it writes, so suspend/reactivate/delete/
restore take effect on the next request. A database error fails open and caches nothing — a blip
must not lock every tenant out. The sign-in check runs after the password comparison so it cannot be
used to probe for accounts.

### Fixed — Dashboard `min_role` admitted exactly the wrong roles (September 2026)

`ui_dashboards.min_role` is the *least powerful* role admitted ("'manager' = manager + admin +
super_admin only"), and levels are inverted, so a viewer passes when `viewerLevel <= minLevel`. Both
the list filter and the single-dashboard gate asked `minLevel <= viewerLevel` — so a board
restricted to managers was hidden from admins and super admins and shown to every ordinary user.
`min_role` is the only restriction on a dashboard with no explicit `UiPermission` row, i.e. on
anything built by hand. The comparison now lives once in `DashboardService.canSeeDashboard`, used by
both call sites, and resolves levels from the tenant's own `roles` rows so a custom role used as the
bar works. A `min_role` whose role was deleted is treated as admin-and-above.

### Fixed — Every missing-parameter guard in three route files returned 500 instead of 400 (September 2026)

Thirteen guards were written as `return fastify.httpErrors.badRequest(...)`, but `@fastify/sensible`
is not installed: the decorator does not exist, so each threw a `TypeError` and the request answered
500. Every missing-`object_id`, missing-`csv_data` and invalid-`entity_type` request was reported to
the client as a server fault. They now throw the app's own `ValidationError` / `NotFoundError`,
which `app.js` maps to 400 / 404.

### Fixed — Tenant CRUD and paging (September 2026)

- **`TenantService.list` dropped rows between pages.** `take` was clamped to 100 but `skip` was
  computed from the unclamped `limit`, so any caller asking for more than 100 per page silently
  skipped a different number of rows than it returned.
- **`create`/`update` spread the request body into Prisma.** Plan limits (`max_users`,
  `max_storage_mb`, `max_api_calls`) were caller-settable even though the chosen plan is supposed to
  dictate them, and a misspelled plan or status ("Enterprise", "activ") produced a tenant that
  matched no `subscription_plans` row and no lifecycle branch. Both now take a field whitelist and
  validate plan, status, slug shape and billing email; limits come from the plan row only. `slug`
  and `plan` are rejected on `update` and directed to their own paths, since neither can be
  half-applied.
- **`provision-admin` reported an id clash as a bare constraint error.** It now checks the
  platform-wide unique columns up front and returns a 409 that says what to do.

### Removed — Dead authorization code (September 2026)

- **The `X-Impersonate-User` header path.** `middleware/authenticate.js` exported an `impersonation`
  hook that read the header and swapped `request.user`; it was imported by the platform routes but
  never registered as a hook, so the header was silently ignored on every route while reading as a
  live feature in both the code and the admin guide. Real impersonation mints a short-lived JWT
  through `POST /api/platform/impersonate`. The admin guide has been corrected.
- **`RequestUtils.isSuperAdmin` / `requireSuperAdmin`.** `isSuperAdmin` compared the caller's level
  against `Math.max(...Object.values(ROLE_LEVEL))`, which every real role satisfies — it returned
  `true` for everybody. Unused, and removed rather than left as a guard that guards nothing.
- The inverted elevation test in `routes/tasks` (`>=` where the inverted ladder needs `<=`) treated
  ordinary users as elevated and admins as not; the service-side scope filter was the only thing
  keeping the rows honest.

### Fixed — Form labels were not associated with their controls (September 2026)

The shared `Input`, `Select` and `TextArea` rendered a `<label>` with no `htmlFor`, so a screen
reader announced an unlabelled edit box, clicking a label did not focus its field, and `error`/`help`
text was read as unrelated prose. All three now generate an id, pair the label to the control, and
wire `aria-describedby` / `aria-invalid`.

### Fixed — A machine without Redis no longer fills the backend log (September 2026)

ioredis reconnected every two seconds forever and the plugin logged each failure, so a development
laptop without Redis produced a warning every two seconds for as long as the server ran. The client
now backs off exponentially (2 s → 60 s), has no offline queue (a command issued while disconnected
fails at once instead of waiting for the next attempt), and logs the outage once plus a line when
Redis returns. `CacheService.enabled` follows the live connection state instead of a startup snapshot,
so a Redis that appears later is used. `/health` reports `services.redis` as `connected` or
`unavailable`.

### Added — Reporting: table calculations, prompted filters, fiscal presets, dashboard cross-filtering, snapshots, alerts, insights and a local-model "Ask" (September 2026)

The benchmark in `REPORTING.md` listed what Genesis still lacked against Salesforce, Zoho Analytics,
Power BI-style dashboards and Tableau. This release closes most of that list without a schema
migration, and adds a natural-language layer no CRM ships on a local model.

- **Table calculations ("Show as")** — running total, % of total, rank, change and % change from
  the previous row, 3-period moving average, per measure, from a dropdown. Runs over the sorted
  result before the row limit, restarts per series on a matrix, and keeps totals honest.
- **Prompted filters (runtime parameters)** — tick *Ask when running* on any condition and the
  viewer answers it in a parameter bar; a blank answer means "any". Exports and print honour the
  answers. One report now serves every region instead of one copy per region.
- **Date presets** — month/quarter/year to date, last 12 months, and *this / last fiscal year* and
  *fiscal year to date* driven by the tenant's fiscal-year start month (memoised per tenant,
  invalidated on settings save).
- **Dashboard-level date range** — one picker re-runs every report-backed widget on its own
  primary date; injected at render time, never stored on the widget. Owner filtering is in the API.
- **Historical trending** — every plain run of a saved report records its totals (one per scope per
  day, bounded to 120) on the previously dead `cached_result` column; the viewer draws a sparkline
  per measure once two days exist.
- **Threshold alerts** — a subscription may carry *Only send when… measure op value*; the report
  runs on schedule but only emails (and raises an in-app notification) when the condition holds,
  with *only on change* to suppress repeats and *has changed* for baseline alerts. **Hourly**
  frequency added. Skipped checks are recorded in run history as *not sent*.
- **Insights** — plain-statistics narration under every result (leader and share, concentration,
  long tail, outliers, trend and peak, latest move, movers, data-quality warning), computed from
  the result so every number is on screen. No model involved.
- **Ask Genesis (AI)** — natural-language report building behind `AI_REPORTING_ENABLED`, Ollama by
  default. The model emits a **report config, never SQL**, constrained to a JSON schema derived
  from the registry; the plan is validated against the closed vocabulary (one repair round-trip),
  named business metrics expand from code, the config runs through the ordinary scope-clamped
  engine, the chart is chosen from the result, and the summary is numeral-checked against the
  table. Follow-ups, clarifications, refusals, **Save as report**, and **Explain** on any saved
  report. `StubProvider` keeps CI model-free. The panel's back arrow moves up one level —
  conversation → landing page → report library — keeping the conversation so it can be reopened,
  with **Start over** as the separate, explicit way to discard it.
- **Docs** — `AI_REPORTING.md` (new), `REPORTING.md`, `19-reports.md`, `API_REFERENCE.md`,
  `.env.example`; the architecture study is marked implemented.
- **Tests** — 4 new suites (backend `report-calculations`, `report-alerts`, `ai-reporting`;
  frontend `ReportingExtras`).

### Changed — The demo dashboards now demonstrate the charting engine instead of defaulting through it (September 2026)

Every dashboard widget was seeded as `{ chart_type, xAxisKey, yAxisKey }` taken straight from the
analytics catalogue and nothing else. The charts were correct and characterless: premium plotted as
bare integers (`2750000`), no axis titles, no targets, no data labels, the same palette on all four
boards, and long category lists in whatever order the database returned. The appearance engine added
earlier in this release was entirely unused by them.

- **All four boards rebuilt** — 49 widgets, 30 charts, using **every one of the 19 chart types** the
  renderer supports. Money renders compactly (`$2.8M`), counts as whole numbers, axes are labelled,
  and each board has its own palette (Agency follows the tenant brand colour; Sales, Claims and
  Portfolio use ocean, warm and vivid).
- **Charts that answer something**, rather than plot something: premium written against a dashed
  monthly **target line**, the producer league table **ranked with its tail folded into "Other"**,
  claimed vs paid as a **stacked area** so the reserve gap is visible, application outcomes as a
  **waterfall**, exposure as a **treemap**, monthly premium spread as a **candlestick**.
- **Managed as code.** New catalogue `prisma/crm-dashboards.js` + installer
  `scripts/seed-dashboards.js` (`--dry-run` / `--all` / `--tenant`), and `prisma/seed.js` calls the same
  installer so `db:seed` and the script cannot drift — the arrangement `crm-workflows.js` already uses.
  By default only the catalogue's own boards are replaced, so admin-built dashboards survive.
- **Grid coordinates are computed**, not hand-maintained: widgets declare a size (`kpi`/`half`/`full`/`tall`)
  and are packed into the 12-column grid, with a test asserting no two overlap.
- **New `currency_compact` number format** for charts, since money on a 260px-tall widget axis is
  unreadable in full. Offered in the Dashboard Builder's format picker.

#### Fixed

- **`policy-terms-timeline` threw on every render**, so the Portfolio board's timeline widget was
  permanently broken. It filtered `effective_date: { not: null }` on a **non-nullable** column, which
  Prisma rejects outright ("Argument `not` must not be null"). All 43 analytics datasets now run clean.

#### Tests

`tests/dashboard-catalogue.test.js` (19 cases) validates the catalogue against the live analytics
catalogue and the renderer's contract — dataset existence, shape/widget-type agreement, valid chart
types and appearance keys, money never formatted as a bare integer, goal lines only on chart types that
draw one, no grid overlaps, and **sort/topN never applied to a chart whose y-key is not a measure**
(timeline, candlestick, bubble, heatmap, scatter), where ranking would silently corrupt the picture.
Backend 849 tests, frontend 138.

### Added — End-to-end configurability: tenant theming, server-enforced validation, field & chart appearance; core hardening (September 2026)

The Builder now configures how the product **looks and behaves**, not only what data it holds, and the
engines underneath were hardened. Nothing here needs a migration or a redeploy.

#### Appearance & Branding (new Builder section)

- **Tenant theming applied live.** `primary`/`accent` Tailwind palettes, the border-radius scale and the base
  font are CSS variables written by `utils/appearance.js`; a single brand hex is expanded into an 11-step
  ramp. Settings: app name, logo, primary/accent colour, default light/dark/system mode (with an optional
  lock), corner radius, density (scales the whole UI), typeface, page background, sidebar style, chart
  palette, login tagline. New `appearance` settings group; `/builder/appearance` page with presets and a live
  preview (the whole app is the preview); sidebar/header/builder home wired; light/dark precedence documented.
- **Brand-colour sweep:** ~1,100 hard-coded `indigo-*`/`fuchsia-*` classes across 82 files became
  `primary-*`/`accent-*`, so the theme reaches every screen.

#### Validation engine

- **Server-side enforcement (ROADMAP P0 #1 closed).** `RecordService` validates every create/update before
  writing — `is_required`, formats implied by field type, 23 admin rule types including cross-field
  comparisons and date bounds, and uniqueness against the field-value store or CRM column. Errors return
  `details: [{ field, message }]` and the form shows them inline and scrolls to the first.
- **Form Builder lost validation edits** — `updateField` discarded the `validations` key and the builder
  never sent it (nor `options`, `default_value`, `is_unique`). Fixed on both sides; the API now replaces the
  rule set.
- **Record form showed a generic error** because it read the wrong envelope path; it now shows the API
  message and the per-field details.
- Validation editor rewritten: grouped rule types with suggestions per field type, field pickers for
  cross-field rules, default messages, explicit "browser only" flag on Custom JS.

#### Field and chart appearance

- Form Builder **Look** tab: label position, size, prefix/suffix, description, character counter, rows,
  numeric step/decimals/bounds, choice display (dropdown / radio / chips / segmented), date bounds. Per-form
  layout `config` overrides (label, placeholder, help, read-only, appearance) are now honoured and
  `is_visible: false` layouts are hidden.
- Dashboard Builder **Chart appearance**: palette (tenant/brand/named/custom colours), legend, number format
  (number, compact, currency, percent, integer) with decimals, sort and top-N with an "Other" fold, axis
  titles, goal line, data labels, grid, smooth, stacked — applied by `ChartRenderer` through
  `utils/chart.js`.

#### Core engines hardened

- **Tenant isolation actually works on requests** (hardening follow-up #1). `authenticate` verified the JWT
  with an `await` before `enterWith()`, so the tenant context never reached handlers and every query ran
  unscoped. It now verifies synchronously; currency profiles are installed from a boot-warmed cache. System
  roles (nullable `tenant_id`) are read as "mine or shared"; `CarrierAdapterConfig` added to the global
  list; a DMMF test guards the model list.
- **Login brute-force protection** — per-account and per-IP limits on login, forgot- and reset-password
  (Redis-backed, in-memory fallback), `429` + `Retry-After`.
- **Security headers** on every response (nosniff, DENY framing, referrer, permissions, COOP/CORP, HSTS in prod).
- **Integration signing secrets masked** on read and preserved on update (hardening follow-up #5).
- Validation errors carry `details`; rate-limit errors carry `Retry-After`.
- **A stale code chunk no longer dead-ends the app.** Every route is a lazy import, so when a redeploy
  replaces the hashed chunks (or the dev server restarts) an open tab requests a module that is no longer
  served — which React surfaced as the generic "Something went wrong" screen with no way forward. The error
  boundary now recognises that failure in all four browser phrasings, reloads once to pick up the current
  build, and if the reload does not help says so plainly instead of looping.

#### Docs

- New [CONFIGURABILITY.md](../developer-guide/CONFIGURABILITY.md) and
  [user-guide/21-appearance.md](../user-guide/21-appearance.md); Form Builder and Dashboard Builder guides
  updated; [SECURITY.md](../developer-guide/SECURITY.md) gained sections for each hardening item; roadmap rows
  #1, #4, #6, #12 updated.

**Tests:** backend 830 (new `validation-engine`, `record-validation`, `authenticate-tenant-context`,
`tenant-scope-coverage`, `rate-limit`; `metadata-field` extended); frontend 134 (new `appearance`,
`chartAndValidation`).

### Fixed / Added — Social media became an engine, and every background loop got a registry (September 2026)

A review of the social module and the rule-based schedulers found the module was a form over a table, with
one defect that made it unusable and several documented features that did not exist.

#### Fixed

- **Account, post and campaign lists returned HTTP 500.** The service asked Prisma to count `engagements` and
  `leads` — relations dropped from the schema in July 2026 (`drop_orphaned_domains`). Every list/detail call on
  `/accounts`, `/posts` and `/campaigns` failed, so the Posts, Accounts and Campaigns tabs were empty on both
  pages. Both UIs also rendered those dead counts; engagement now comes from the platform-reported metrics.
- **OAuth tokens were returned to every authenticated user** on `GET /accounts`. Account responses now strip
  `access_token`/`refresh_token` and expose `has_access_token`/`has_refresh_token` plus `token_expires_at`.
- **Scheduled posts never published.** `scheduled_for` was stored and nothing acted on it. A `social-publish`
  scheduler now runs every minute; each post is claimed with an atomic status flip so pods (or a manual click
  racing the sweep) cannot double-post. A rejected post is marked `failed`, its author receives an in-app
  notification with the reason, and **Retry** re-publishes it.
- **`sync_frequency` and `auto_monitoring` were ignored** — every account was synced every 5 minutes. The sync
  cycle now syncs an account only when due under its own frequency (hourly/daily/weekly), claims it by stamping
  `last_sync_at`, honours the monitoring flag, and marks an account `error` when its platform call fails.
- **Tokens never refreshed and `expired` was never set**, contrary to the docs. Tokens expiring within 24 h are
  refreshed through the connector before any platform call; an expired account without a refresh token is
  marked `expired` and skipped until re-authorized. `POST /accounts/:id/refresh-token` with an empty body now
  performs the connector refresh (a body with `access_token` remains a manual rotation).
- **Replies were recorded but never sent.** `PUT /mentions/:id` with `response_content` now delivers the reply
  through the connector first and only then marks the mention responded (502 on rejection, 409 on a second reply).
- **Deleting a published post left it live on the platform.** The connector's `deletePost` is called first.
- **Listening keywords matched nothing.** Incoming mentions are matched (match type, case, platform scope);
  hits are stored on `keywords_matched`, and a high-priority keyword raises the mention's response priority.
- **The manual single-account sync ran three connector calls in parallel** and raced its own `last_sync_at`
  writes; it is now sequential and shares the scheduler's path.
- **Authors could set a post to `published` by hand.** Status is limited to `draft`/`scheduled`; a scheduled post
  requires content and a date; published posts are locked except for promotion settings.
- **Social route handlers ran without a tenant context** (the `authenticate` hook's context does not reach
  handlers — hardening follow-up #1). Every social route is now wrapped in the shared `scopedHandler`.
- **Docs described a Routing UI, an "Assigned to me" filter and automatic token refresh that did not exist**;
  the admin guide's connector table said API keys switch a platform to live (they do not). All corrected.

#### Added

- **Inbox routing UI** — the builder gained a **Routing** tab for the social assignment rules API (fixed,
  round robin, load balanced, rule based; per channel; reorder). Assignees are notified in-app with a deep link.
- **Mention → lead** (`POST /mentions/:id/convert-to-lead`) — creates a CRM lead from the author; idempotent via
  the lead's `external_id`; the inbox shows the lead badge. No schema change.
- **Inbox filters** — `assigned_to=me`, `open=true`; the runtime tab is now an inbox with those toggles.
- **OAuth round-trip** — `GET /oauth/:id/authorize` (signed `state`) and the public `GET /oauth/callback`;
  **Authorize** on the account card. The simulation connector completes the flow in one click.
- **Campaign performance roll-up** — engagement on posts published inside an active campaign's window to its
  platforms is summed onto `performance_summary` after each sync and shown on the card.
- **Overview health tiles** — open mentions, scheduled/failed posts, expiring tokens, posts by status, engagement.
- **`social.*` domain events** on the bus (post published/failed/deleted, mentions received, mention
  responded/converted, account connected/token refreshed) for workflows and outbound integrations.
- **`SchedulerRegistry`** (`utils/scheduler.js`) — replaces five hand-rolled interval blocks in `app.js` for
  the workflow, SLA, reminder, report-delivery and social loops; adds the overlap guard the SLA and social loops
  lacked, and reports every loop's last run, duration, result and error on `GET /health` under `schedulers`.
- **Docs** — new [SOCIAL_ENGINE.md](../developer-guide/SOCIAL_ENGINE.md) (engine internals, connector contract,
  events, benchmark against the top-5 CRMs, invariants); rewritten user guide and admin guide sections;
  API reference updated.

#### Removed

- Orphan schema doc-comments left behind when the unused social/partner models were dropped.
- Duplicated platform lists (services now import `PLATFORMS` from the connector registry) and duplicated
  constants/components across the two social pages (`components/social/shared.jsx`).
- A second `SocialMediaService` instance the routes constructed alongside the decorated one.

#### Not done (needs a migration; the shared database was unreachable in this pass)

- Store the publish failure reason on the post (`last_error`, `publish_attempts`) instead of only in the
  notification, and add a `platform_mention_id` for connector-independent mention identity.

**Tests:** backend 784 (was 733) — new `social-media-service.test.js`, `scheduler.test.js`; frontend 119 —
new `SocialMediaPage.test.jsx`.

### Added — 18 benchmarked CRM workflows, and a workflow engine that can actually run them (August 2026)

**Builder ▸ Workflows** now ships **18 pre-configured workflows** spanning the full CRM lifecycle —
lead capture and routing, first-response SLA, qualification handoff, quoting and quote approval,
application submission and jumbo-limit referral, underwriting SLA escalation, policy onboarding,
renewal and lapse prevention, claims triage and documentation SLA, commission payout approval, and
client data hygiene. They replace the three demo workflows (`application_auto_assign`,
`claim_filed_notification`, `policy_renewal_reminder`).

Every workflow implements an automation pattern that Salesforce, HubSpot, Zoho CRM, Dynamics 365
and Pipedrive all ship out of the box, adapted to the life-insurance object model. The pattern each
one implements is recorded on the workflow's own description, so the coverage claim is auditable
from inside the Builder.

See [Workflows](../user-guide/06-workflows.md#what-ships-out-of-the-box) for the catalogue,
[Workflow Automation](../admin-guide/WORKFLOW_AUTOMATION.md#built-in-workflows) for the three step
shapes they are built from, and the
[Workflow Engine Technical Reference](../developer-guide/WORKFLOW_ENGINE.md#shipped-workflow-catalogue)
for the installer.

#### Fixed — workflows on non-CRM objects were silently doing nothing

The engine read and wrote fields only on the five first-class `crm_*` tables. Every object except
Prospect stores its data in the typed field-value store, so on an Application, Policy, Claim, Quote
or Client record: `{{placeholders}}` rendered blank, `condition` steps saw no value and halted the
chain, and `action` steps wrote nothing. Scheduled workflows compounded it by running **once with no
record at all**, so `policy_renewal_reminder`'s "Is Policy Active?" condition could never pass. The
workflows appeared configured and correct while doing nothing.

- **New `services/crm-storage-map.js`** — one source of truth for which store owns an object's
  field data, shared by `RecordService` (the API write path) and `WorkflowEngineService`, so a
  workflow resolves a field exactly the way a form save does. `RecordService` previously held these
  maps inline.
- **Storage-routed field access** — `#loadFields` merges the typed field-value store, the CRM entity
  row, and record-level columns (`assigned_to`, `pipeline_stage_id`); `#writeField` routes writes
  back to whichever store owns the field. Aliased columns resolve under both names, so
  `{{annual_income}}` and `{{annual_revenue}}` both work on a Prospect.
- **`create_record` and `update_related`** use the same routing, so they work across insurance and
  custom objects. `create_record` splits CRM columns from overflow fields instead of dropping the
  overflow; `update_related` gained `link_value` for matching related records on a business key
  (e.g. every claim on a `policy_number`) rather than only on record id.
- **A real CRM column on a record with no entity row is now a reported no-op**, not a shadow write
  into the field-value store that the API's hydration would then mask.
- **Writes bypass `RecordService` deliberately** — it publishes `record.updated`, which this engine
  subscribes to, so routing an action step through it would re-trigger the running workflow.

#### Added — scheduled workflows can sweep records

`trigger_config.per_record: true` runs a scheduled workflow **once per live record** of its object,
like a Salesforce scheduled-triggered Flow or a Zoho scheduled rule, which is what date-driven
sweeps need. `limit` caps a sweep (default 500, ceiling 5 000) and records are processed
sequentially so a sweep never contends with request traffic. Without the flag the previous
behaviour is unchanged: one run, no record context.

#### Added — the catalogue is code, not hand-built UI data

- **`prisma/crm-workflows.js`** holds the definitions; **`scripts/seed-crm-workflows.js`** installs
  them (`--dry-run`, `--keep`, `--tenant N`). `prisma/seed.js` imports the same installer, so
  `npm run db:seed` and the standalone script always produce an identical suite.
- `{{@manager}}` in a step config resolves at install time to the tenant's active manager, so no
  employee ID is hard-coded.
- The installer creates an **Approval Status** field (Pending / Approved / Rejected) on Quote,
  Application and Commission. It surfaces the reviewer's decision on the record and acts as the
  latch that stops a record being re-submitted for approval on every save.

#### Documented — the approval guard convention

A step with no explicit link falls through to the next step by order, so an approval's approved
branch would otherwise run its own rejection steps. Each approval workflow ends its approved path
with a **guard** condition that re-reads the state the approved branch just wrote and stops there.
`tests/crm-workflow-catalogue.test.js` enforces this, along with link resolution, operator and step
type validity, recipient addressability, and the `per_record` requirement for scheduled workflows
that read record fields.

32 new backend tests (733 total).

#### Documented

- [Workflows](../user-guide/06-workflows.md#the-workflows-in-detail) — a full plain-English
  explanation of each of the 18 workflows: what it is for, when it fires, what it does step by step,
  and which settings to change.
- [Workflow Automation](../admin-guide/WORKFLOW_AUTOMATION.md#tuning-the-built-in-workflows) — a
  tuning reference for every adjustable threshold, timing and recipient role, plus the two edits
  that break a workflow quietly (removing an approval guard, removing the conversion latch).
- [Workflow Engine](../developer-guide/WORKFLOW_ENGINE.md) — **Part 4 — Extending the Engine**: the
  complete file-by-file procedure for adding a step type, operator, trigger type or storage backend,
  testing conventions, and a verified enhancement backlog.

### Added — Self-service reporting: a business user can build, share and schedule reports with no technical help (August 2026)

The client requirement was that a **non-technical member of their staff configures reports
unaided**, after a short on-site training session. Reporting was already declarative, but two things
blocked that: the report builder assumed some analytical vocabulary, and **dashboards could not show
a saved report at all** — a widget could only point at one of ~45 datasets hard-coded in
`analytics.service.js`, so every new dashboard number needed a developer and a release.

See [Reporting Engine](../developer-guide/REPORTING.md) for the implementation and the CRM
benchmark, and [Reports](../user-guide/19-reports.md) for the end-user guide (which includes a
suggested 90-minute on-site training run).

#### Any saved report is now a dashboard widget

- **`GET /reports/:id/data?shape=series|metric|rows`** reshapes a saved report for a widget and
  returns metadata describing itself (`xKey`, `series`, `columns`, comparison deltas).
- **New `data_source` type `report`** — `{ type: 'report', report_id, shape }`. The widget stores
  **no field names**: `useDataSource` and `ChartRenderer` read the axis/measure metadata at render
  time, so renaming a measure or changing a grouping in a report can never leave a widget pointing
  at a column that no longer exists.
- **Dashboard Builder** — a **Reports** palette section adds a fully-wired widget from any saved
  report in one click, inferring the widget shape from the report's visualization.

#### Guided builder for non-technical authors

- **Template gallery** (`report-templates.js`, 26 starter reports) — the default first screen of
  *New report*. Each card states the business question it answers ("For every dollar of premium, how
  much are we paying out per product?") and opens as an editable draft.
- **Stepped builder** — the builder is now a numbered list of plain-English questions with
  completion ticks, a "next step" hint and a live preview, instead of a single dense sidebar.
- **Every control is a dropdown.** Sources, fields, operators, aggregations, periods, formula
  operations and schedule options are all enumerated by the server
  (`GET /reports/sources`, `GET /reports/vocabulary`), so the builder cannot produce a config the
  engine rejects.
- **Filter values are pick-lists** — picklist fields offer their real options; free-text fields offer
  the values that exist in the data (`GET /reports/field-values`). Nobody needs to know a status is
  stored as `closed_won`.

#### Engine capabilities (benchmarked against Salesforce, HubSpot, Zoho, Dynamics 365, Pipedrive)

- **Nested AND/OR filter groups** replacing the flat list.
- **Cross-object fields** — one relation hop, surfaced as "Owner ▸ Name", "Policy ▸ Product",
  "Carrier ▸ Name". Group commissions by agent *name*, not agent ID.
- **Value bands (bucket fields)** — group a number or picklist into named bands
  (*Under 10k · 10k–50k · 250k+*) with a user-named "everything else" band.
- **Calculated measures** — combine two earlier measures via a fixed operation list
  (ratio, % of B, % of total, difference, % change). No expression parser, nothing `eval`d, cycles
  impossible by construction; divide-by-zero yields `—` rather than `Infinity`.
- **Totals and subtotals** — grand total plus a subtotal per group on a matrix, with each
  aggregation recomputed rather than summed.
- **Period-over-period comparison** — *previous period* / *same period last year*, adding the prior
  value and % change to every row, tile and chart.
- **Drill-down** — click any bar, slice, row or matrix cell for the records behind it; the bucket is
  replayed as a filter, so the list is provably what was counted.
- **Conditional formatting**, dropdown-driven, first-match-wins.
- **Area, donut and funnel** visualizations alongside table, bar, line, pie, number tiles and matrix.
- **Column-level `select`** — the engine now asks for only the columns a config references instead of
  whole rows.

#### Library, sharing and delivery

- **Folders, favourites and search** (`report_folders`, `report_favorites`). Deleting a folder never
  deletes reports.
- **Visibility** (`custom_reports.visibility`) — *Only me · My team · Specific roles · Everyone*,
  each with its consequence spelled out in the UI. Rows predating the column fall back to the old
  `is_shared` boolean, so nothing disappears on upgrade. Sharing controls **viewing only**; editing
  stays with the author and admins, and everyone else gets *Save as a copy*.
- **Sharing never widens data access** — `resolveScope` clamps the requested scope to the viewer's
  role, so a shared report shows each viewer only their own slice.
- **Scheduled email delivery** (`report_subscriptions` + `ReportScheduleService`) — daily / weekdays
  / weekly / monthly, as an Excel or CSV attachment or inline, set up by the user with no admin
  involvement. The dialog echoes the schedule as a sentence and **Send now** proves it works
  immediately. The 60 s sweeper claims each due row atomically (`updateMany` guarded on the
  `next_run_at` it read) so multiple pods cannot double-send, runs inside `tenantContext.run()`, and
  reschedules even after a failure so one bad send cannot kill a schedule.
- **Excel and PDF export** alongside CSV — `toXlsx` via the existing `xlsx` dependency; PDF via a
  server-rendered print view plus the browser's own Save as PDF (the same HTML is the scheduled-email
  body, so there is one renderer rather than two).
- **Run history** — the last 25 executions, including scheduled deliveries.

#### Removed — developer-only dashboard data sources

- **External REST (`data_source.type: 'api'`)** is gone, including `fetchExternal` in
  `useDataSource`. It required a URL, hand-written auth headers and a dot-notation path — knowledge
  no business user has — and let a dashboard author point the browser at an arbitrary host.
- **Static JSON authoring** is gone from the builder. Existing widgets carrying a payload still
  render; the panel shows what they hold read-only with a prompt to move them onto a report, rather
  than discarding data someone put there.
- **Raw "X-Axis Key" / "Y-Axis Data Key" text inputs** are hidden for report-backed widgets, which
  resolve their own axes.

### Fixed — "Which columns?" now reflects the columns a table actually shows (August 2026)

Reported: a table report renders a standard set of columns, but the **Which columns?** step showed
nothing ticked — so the picker and the visible result disagreed, with no way to tell which was
authoritative.

- The default-column definition moved out of the engine into the registry as `defaultFields()` /
  `defaultColumns()`, and is published on each source as `default_columns`. One definition, so the two
  cannot drift apart again.
- The builder seeds `config.columns` from it whenever a table report has none — on source select, on
  switching the visualization to Table, and when a saved report or template loads. Ticked now means
  rendered.
- "Clear selection" became **"Reset to the standard columns"** (it only appears when the selection
  differs from the default), and unticking everything shows a note that the standard set will be used —
  which is what the server does with an empty list.
- **The default set itself was wrong.** It filtered on `group !== false`, conflating "can be a
  grouping" with "worth showing as a column", which dropped every free-text field: a leads table listed
  `last_name` and no `first_name`. Defaults are now the source's curated field order with the title
  field first, so leads open as *Last name · First name · Company · Email · Phone · Job title · Status
  · Rating*. Reports saved with an empty `columns` list therefore render a slightly better set; an
  empty list still means "the defaults" server-side, so nothing else changes.

### Added — Join model: curated multi-hop paths and fan-out-free roll-ups (August 2026)

Reporting could previously reach exactly **one** related record. Two ordinary insurance questions were
therefore unanswerable: *"which region writes the most premium?"* (needs policy → agent → region) and
*"which carriers pay out most?"* (needs claim → policy → carrier). Territory was worse than missing —
`Owner ▸ Branch` exposed the raw `branch_id`, so users grouped by "1", "2", "3".

Implemented in two parts, matching how Salesforce separates report-type paths from roll-up summary
fields. Full rationale and the benchmark in
[REPORTING.md](../developer-guide/REPORTING.md#the-join-model).

#### Curated multi-hop to-one paths

- `relations` is now a **recursive tree**, capped at `MAX_RELATION_HOPS` (2). A field key is its dotted
  path (`agent.branch.branch_name`); `relationSelect` builds one **merged** nested Prisma `select`, and
  the new `nestClause` wraps filters and drill-down clauses to full depth.
- **Every hop must be to-one, enforced by test** — so the row count is identical to a single-table
  query and no measure can be inflated.
- New paths: territory (`branch`, `region`) from every owner/agent/assignee/adjuster relation;
  `claims.policy → carrier / writing agent / account`; `commissions.policy → carrier / writing agent`;
  `quotes.opportunity → account`; `policies.contact → account`.
- `primary: true` collapses a redundant leaf label once a path is 2+ hops, so
  `agent.branch.branch_name` reads **"Agent ▸ Branch"** rather than "Agent ▸ Branch ▸ Name". One-hop
  labels are unchanged, so no saved report's display churned.

#### Parent→children roll-ups

- New `rollups` declaration: `ROLLUP('claims', 'Claims', 'insuranceClaim', 'policy_id', […])` exposes
  `claims.$count` and `claims.paid_amount` on the **policies** source.
- `#attachRollups` runs **one `groupBy` on the child table** over the parent ids just fetched and
  writes the result onto each row under the collection name, so a roll-up is indistinguishable from a
  to-one relation downstream — grouping, measures, formulas, totals and comparison needed no changes.
- **This is deliberately not a join.** `policies ⋈ claims` duplicates the parent per child, so a policy
  with £1,200 premium and three claims would contribute £3,600 to "total premium". Pinned by test and
  verified against the real database: premium totals are identical with and without roll-ups in play.
- Declared on: policies (claims, commissions, beneficiaries), opportunities (quotes), quotes
  (line items), claims (payment events).
- Parent ids are **chunked at 1 000** per `groupBy` rather than one `IN` of up to `FETCH_CAP` values.
- No children is a real **zero** for a sum or count but **null** for an average/min/max — an absent
  average is unknown, and feeding zero into a later average would be wrong.
- Roll-ups are measures only: not groupable, and **not filterable** (the values exist only after the
  rows are read, so it would need a `HAVING` pass). A filter on one is now *reported* rather than
  silently dropped, and the filter UI omits non-filterable fields.

#### Four new templates

`claims-vs-premium-by-carrier`, `premium-by-region`, `claims-frequency-by-product`,
`quoted-vs-won-by-owner` — 30 starters in total, all verified against the live database.

#### Fixed / optimised alongside

- **Territory grouped by a numeric id.** `owner.branch_id` / `owner.region_id` are marked `hidden`:
  still resolvable so saved reports keep running, but no longer offered — superseded by
  `…branch.branch_name` / `…region.region_name`.
- **The field catalogue leaked internals.** `getSources()` now projects through `publicField()`, a
  whitelist. The resolved field carries *how to reach* the value — the relation path, and for a roll-up
  the child Prisma model and foreign key — which the browser has no use for and should not be told.
  It was also most of the payload: **61 KB → 42 KB**.
- **`getField` / `allFields` now memoise** on `source|fieldKey`; both sit in hot paths and the registry
  is immutable.
- **`id` is selected explicitly**, independent of the registry — it is not a reportable field but is
  needed for drill-down, roll-up keying and `__id`.
- **Two shipped templates computed a bogus "loss ratio"**, dividing a cumulative claims total by
  `premium_amount`, which is the amount *per payment* — the live figure came out at 3597%. Both
  renamed to show claims paid and premium side by side, with the basis stated; the user guide's
  premium caveat now calls this out specifically.
- `report-registry-schema.test.js` extended to walk the **whole** relation tree (every hop to-one, no
  path deeper than the engine resolves), validate each roll-up against its to-many relation, child
  model, foreign key and stated aggregation, and reject a name shared by a relation and a roll-up.

### Changed — Reports stays under Tools, not Builder (August 2026)

Reviewed where reporting belongs in the navigation. **Reports remains under `Tools`**, and that is a
requirement constraint rather than a preference: the whole `Builder` section is admin-only — gated in
the sidebar by `isAdmin() || isPlatformAdmin()` and per-route by
`<ProtectedRoute roles={['admin','super_admin','platform_admin']}>` — so filing report authoring there
would hide it from the non-technical staff the feature exists for. This also matches Salesforce,
HubSpot, Zoho and Dynamics, all of which put report authoring in the app for end users and keep only
the *source catalogue* in admin setup.

- `ReportBuilderPage.jsx` **moved from `pages/builder/` to `pages/runtime/`**, next to `ReportsPage`.
  Every other file in `pages/builder/` is an admin-gated builder, so that location implied a gating
  that does not — and must not — exist. Route paths are unchanged.
- `Builder → Configure` gains a **shortcut to `/reports`** beside Dashboard Builder, since dashboard
  widgets are now report-backed and an admin wiring one up needs to get there. It links to the same
  shared page (never a `/builder/*` path) and its tooltip says report building is open to every user.
- `NavItem` accepts an optional `title` so a sidebar entry can explain itself on hover.
- The `/reports/new` and `/reports/:id/edit` routes carry a comment recording why they sit outside the
  admin guard, and `Sidebar.test.jsx` asserts the invariant: a non-admin sees Reports and no Builder
  section, and the admin shortcut never targets `/builder/*`.

Documented in [REPORTING.md](../developer-guide/REPORTING.md#where-it-lives-in-the-navigation-and-why),
including why an admin **"Reporting sources"** screen — the Salesforce *Report Types* equivalent, and
the one piece of reporting that would legitimately belong under `Builder` — has not been built.

### Fixed — hardening pass over the new reporting feature (August 2026)

A review of the feature's own diff found 17 defects. The data-scope ones are the serious group:
self-service reporting means a permissive default is a data-exposure bug, not a convenience.

**Data scope failed open in four places** (each now fails closed, all covered by
`report-hardening.test.js`):

- A `scope` value that was not `me`/`team`/`all` passed straight through `resolveScope` to the
  engine, matched no branch in `#applyScope`, and so applied **no owner filter at all** — a level-5
  user sending `scope: "sneaky"` received every record in the tenant.
- `scope: 'team'` with an empty hierarchy closure applied no filter instead of narrowing to the
  caller; likewise `scope: 'me'` with no employee id.
- The scope clause was **assigned** to `where[ownerField]`, silently replacing a report's own filter
  on Owner and widening the result.
- Scheduled delivery clamped on a hard-coded `level > 2` while `ADMIN_THRESHOLD` is 3, narrowing an
  admin's emailed report to their team; and a missing subscription owner triggered
  `role.findFirst({ name: undefined })`, which drops the condition and returns an arbitrary role —
  potentially the most privileged one.

**Also fixed:**

- `report_folders` PUT/DELETE had **no ownership check** — any user could rename or delete anyone's
  folder and uncategorise its reports.
- **`claims.closed_at` does not exist** on `InsuranceClaim` (the column is `paid_at`); picking
  "Closed on" made Prisma throw. A new `report-registry-schema.test.js` now validates every registry
  field, relation and declared type against Prisma's DMMF, because the mock-based suites accept any
  field name and cannot catch this class of bug.
- A date **`between`** window cast its upper bound to midnight, dropping every record during the
  final day of the range.
- A table-mode **grand total was computed after the row-limit slice**, so "Total" silently covered
  only the visible page.
- The derived prior-period window **inherited the filter node's logic**, so on an `OR` filter it
  became an alternative and the comparison aggregated records the report excluded.
- `sendRaw` does not throw when SMTP rejects a message — it records the failure and returns the log —
  so **bounced deliveries were counted and reported as "sent"**.
- The **Print/PDF** link was a plain `<a href>` to `/api/reports/:id/print`; auth is header-only, so
  it always 401'd. It now fetches through the authenticated client into a pre-opened tab (opened
  before the request, so pop-up blockers do not reject it).
- The Dashboard Builder's **Reports palette always read "You have no reports yet"** — it unwrapped
  `data.data` on an already-extracted array.
- A **pivot column footer summed averages, minimums and derived measures** that the engine
  deliberately refuses to combine. `publicCol` now emits `agg` so the footer knows what is additive.
- A **`null` grand total** (a distinct count, which cannot be combined across buckets) was treated as
  absent, so the first bucket's value was shown as the headline number on a KPI tile and in
  `toWidgetShape`.
- A filter whose **operator does not apply to its field** was silently dropped, so a report quietly
  included records the author believed they had excluded. The engine now warns, and the builder
  repairs such conditions when a saved report is loaded rather than displaying a fallback operator it
  is not using.
- `getFieldValues` used `findMany({ distinct })`, which Prisma de-duplicates **in memory** on MySQL —
  a dominant value could fill the 200-row window and truncate the pick-list to one entry. It now
  groups in the database.
- **`cached_result` wrote the entire result of every saved-report run** — a JSON blob of up to 20 000
  rows, on every view — and was read by nothing. The write has been removed; only `last_run_at` is
  stored. The column is retained and marked legacy.

### Fixed — period-over-period comparison (August 2026)

Reported by the client hitting *"Add a date condition using 'is within' so Genesis knows which
period to compare"* on a perfectly reasonable report. Four defects behind it:

- **Comparison never matched on a date-grouped report, so every delta was `0`/`null`.** The prior
  window produces labels in its own period (`2025-03`) while the current rows are labelled
  `2026-03`, and the join was on the raw label — so nothing ever matched. `shiftLabel` now realigns
  prior labels into the current label space before joining. This silently affected the shipped
  `won-revenue-by-month`, `new-business-by-month` and `claims-turnaround` templates, all of which
  set `compare`; the zeros were previously mistaken for absent historical data.
- **A date *grouping* was not accepted as the period.** A report grouped "by month" already states
  its period, but a `date_range` filter was demanded as well — rejecting the most common trend
  report there is. The window is now derived from the grouping's bucket span when no date filter
  exists, and `previous_period` on such a report means **the preceding bucket** (labelled
  "Previous month" and so on).
- **An explicit `between` window was rejected**, even though it bounds a date on both sides just as
  well as a relative preset.
- **Choosing "is within" but no period produced silence** — no comparison and no warning. It now
  says *"Pick a period for the date filter…"*.

Also: a bucket with **no counterpart** in the earlier period now yields `null` rather than `0` for
the prior value and both deltas, and renders as **"no earlier data"**. Treating it as zero implied
infinite growth on the first bar of every series. Calendar arithmetic (`advancePeriod`) replaces
fixed millisecond offsets, so month and quarter lengths stay correct across February and year ends.
`comparison.matched` is now reported, and a prior window that returned rows but matched none warns
instead of rendering a table of dashes.

### Fixed — reporting defects found while building the above

- **Two filters on the same field silently overwrote each other.** The engine flattened filters into
  `where[field] = clause`, so `amount >= 100 AND amount <= 500` became just `amount <= 500`.
  Conditions now become entries in a Prisma `AND` / `OR` array.
- **Records with no value were counted as zero when bucketing.** `Number(null) === 0`, so a record
  with no amount landed in whichever band starts at zero. Missing values now go to the "other" band
  before any numeric coercion.
- **A grand-total average was wrong when any row had no value.** The average was weighted by row
  count, so rows with no value dragged it down — for `100, 300, 600, null` it reported `275` instead
  of the true `333.33`. It is now weighted by the number of values each bucket actually averaged.
- **The "no value" bucket sorted before real months** on a time series, because `'—'` sorts ahead of
  `'2026-01'`. It is now placed last.
- **A filter naming an unavailable field threw**; it is now dropped with a warning naming the
  condition, so a stale saved report still runs.
- **`distinct_count` grand totals** are left blank (`—`) rather than reporting a figure that cannot be
  derived from per-bucket counts.

### Database

Migration `20260817120000_add_report_self_service` — **additive only**, no drops:

- New tables `report_folders`, `report_subscriptions`, `report_favorites`.
- New nullable/defaulted columns `custom_reports.folder_id`, `custom_reports.visibility`.
- `custom_reports.refresh_frequency` and `cache_expires_at` are now unused (marked legacy in the
  schema, columns retained).

### Known limitations

Documented in [REPORTING.md](../developer-guide/REPORTING.md#benchmark): one relation hop only, one
source per report, no dashboard-wide cross-filtering, no historical snapshots, no threshold alerts,
and a 20 000-row fetch cap.

### Changed — Dashboards read live data from an analytics API instead of static JSON (August 2026)

Dashboard widgets used to embed a hard-coded JSON payload in their configuration, so every
number on a dashboard was a snapshot frozen at seed/authoring time. Widgets now store a
*pointer* to a dataset and fetch the numbers at render time.

- **New analytics API** (`/api/analytics`, `backend/src/routes/analytics/index.js` over
  `AnalyticsService`) — `GET /datasets` returns the dataset catalog that drives the builder's
  picker; `GET /data/:key` runs one dataset. Both require a JWT. Every dataset is computed with
  ordinary Prisma calls, so the tenant-scope extension isolates rows automatically (the service
  deliberately avoids `$queryRaw`, which would bypass it).
- **43 datasets** across Policies, Applications, Claims, Production, Pipeline, KPIs and Lists,
  computed from `insurance_policies`, `insurance_applications`, `insurance_claims`,
  `underwriting_cases`, `commission_entries`, `crm_opportunities` and `crm_leads`. Each declares a
  `shape` (`series` / `metric` / `rows`) plus the chart type and axis keys the builder should
  pre-fill. Premium is annualised through `premium_frequency`; status datasets emit their full enum
  domain so a chart keeps its axis before every state has records; month series are fixed-length
  UTC buckets.
- **New `data_source` type `endpoint`** — `{ type: 'endpoint', dataset: '<key>' }` (or
  `{ type: 'endpoint', url, dataPath? }` for any other internal API path). `api` (external REST,
  `http`/`https` only) and `json` (static) still work; nothing seeded uses `json` any more.
- **`useDataSource` hook** (`frontend/src/hooks/useDataSource.js`) — one react-query-backed
  resolver for all three source types, now shared by charts, metric cards and list widgets in both
  the runtime dashboard and the builder canvas. Previously only charts fetched anything; metric
  cards and lists read `data_source.data` literally. Replaces the bespoke fetch that lived inside
  `ChartRenderer`.
- **Dashboard Builder** — a new **Live** palette section adds a fully-wired widget from any dataset
  in one click, and the **Data Source** tab gained a category-grouped dataset picker that shows the
  resolved endpoint and a live preview of the response. Builder previews for metric, list and table
  widgets now render real data instead of a placeholder.
- **Seed** — 4 demo dashboards (Agency, Sales & Distribution, Claims & Underwriting, Portfolio
  Analytics) totalling 44 endpoint-backed widgets and a 6-chart library, exercising all 18
  supported chart types. `seed.js` imports the server's own dataset catalog, so seeded chart types
  and axis keys cannot drift from the service.
- **Tests** — `backend/tests/analytics.test.js` (55 cases) runs every catalog entry against a
  Prisma double and asserts premium annualisation, month bucketing, funnel monotonicity, status-domain
  completeness and trend inversion.

### Fixed — Dashboard chart wiring (August 2026)

- The palette offered a **Stacked Bar** chart as `stacked_bar` while `ChartRenderer` switched on
  `bar_stacked`, so picking it silently rendered an ordinary bar chart. Aligned on `bar_stacked` and
  added the previously unreachable **Stacked Area** (`area_stacked`) to the palette.
- `composed` charts defaulted to `barKey: 'bar'` / `lineKey: 'line'` — field names no real dataset
  uses — so they rendered empty unless both keys were set by hand. They now fall back to the first
  and second declared series keys.
- A widget dropped on the canvas carries `y: Infinity` until react-grid-layout positions it.
  `Infinity` serialises to `null`, and `ui_dashboard_widgets.y` is `NOT NULL`, so saving before the
  grid settled could fail. The save path now coerces non-finite coordinates to `0`.

### Docs — Client Life-Event Capture proposed-feature catalog (July 2026)

- Added a **Client Life-Event Capture — Proposed Feature Catalog** section to
  [ROADMAP.md](ROADMAP.md#client-life-event-capture--proposed-feature-catalog):
  architect-level guidance on *why / when / how* Genesis should capture client life
  events (marriage, new baby, home purchase, retirement, bereavement, …) — the highest-ROI
  buying and re-underwriting triggers for the insurance vertical. Covers the business case,
  an event taxonomy with timing/sensitivity discipline, capture mechanisms mapped to
  **existing** services (Activity Timeline, portal, the `WorkflowPendingStep`-style scheduler
  over held DOB/policy dates, enrichment/AI), a detect-vs-act architecture (a metadata-driven
  `LifeEvent` object + workflow `field_changed`/event-bus actions + a verification queue +
  consent/tenant scoping), and a crawl→walk→run rollout. **Guidance only — no feature built.**

### Added — Document Management: standalone module, multi-cloud storage, builder, folders, search, sharing, templates & e-signature (July 2026)

The DMS was promoted from an INSURANCE sub-feature to a **standalone, configurable, top-level
module**. The insurance document flow is unchanged. New capabilities:

- **Standalone module** — a domain-neutral Documents page at `/documents` with its own sidebar
  section, over the generic `/api/documents` API.
- **Document Management builder** (`/builder/documents`, admin) — configurable **categories**
  (per-category allowed MIME, size cap, retention, review-required, required-document flag),
  **required-document checklists** per entity type, and **merge templates**. Uploads now enforce
  the matching category's MIME/size policy and route review-required categories to `under_review`.
  New tables: `ui_document_categories`, `ui_document_checklists`, `document_templates`.
- **Multi-cloud & on-prem storage** — `S3StorageProvider` (Amazon S3 **and** S3-compatible:
  MinIO, Cloudflare R2, Backblaze B2, DO Spaces, Wasabi), `AzureBlobStorageProvider`, and
  `GcsStorageProvider`, all behind the existing `getStorage()` factory (`STORAGE_DRIVER=local|s3|azure|gcs`).
  Cloud SDKs are lazy-loaded; `local` stays the default. On-prem = config only (local/NFS or MinIO).
- **Folders** — hierarchical `document_folders` with materialised paths, move/rename with
  descendant re-pathing and cycle protection, and a folder rail in the UI.
- **Full-text search** — pdf/docx/txt text extraction on upload into `documents.content_text`
  with a `FULLTEXT` index; search matches metadata **and** document contents. (Extracted text is
  omitted from all API responses.)
- **Sharing & engagement analytics** — expiring public share links (`/share/:token`) with
  view/download tracking (`document_share_links`, `document_view_events`) and an analytics modal.
- **Native e-signature** — `document_signature_requests` / `document_signatories`, ordered
  multi-signer flow, a public signing page (`/sign/:token`) with drawn/typed signatures and
  decline, and an auto-generated HTML **signature certificate** (audit trail) stored as a Document.
- **In-app document preview** — a **Preview** button next to every Download action (standalone
  Documents list & detail, record document panel, insurance application-documents collection,
  underwriting case review, and the public `/share/:token` page). PDFs and images render natively;
  Word (`.docx`) and Excel (`.xlsx`/`.xls`) are converted server-side to sandbox-safe HTML
  (mammoth / SheetJS); text/CSV render as text; other types show a graceful "download to view"
  notice. Preview responses are served inline with `Content-Security-Policy: sandbox` and shown in
  a sandboxed iframe. New endpoints: `GET /api/documents/:id/preview`,
  `GET /api/documents/public/:token/preview`, `GET /api/insurance/application-documents/:id/preview`.
  A **BUILDER › Document Management → Show the "Preview" button** toggle
  (`documents.show_preview_button`, default on) hides/shows it everywhere, including public links
  (surfaced as `allow_preview` in the public share metadata). New dep: `xlsx` (SheetJS).
- Migrations: `20260713120000`, `20260713140000`, `20260713160000`, `20260713180000`,
  `20260713200000` (all additive). New deps: `@aws-sdk/client-s3`, `pdf-parse`, `mammoth`, `xlsx`
  (Azure/GCS SDKs are optional, installed per-deployment). The preview toggle reuses the existing
  `tenant_configs` settings store — no migration.

**Fixed:**

- Extracted full-text (`content_text`, ~200 KB/doc) was being returned in `/api/documents`
  list/get responses; it is now stripped at the API boundary and omitted from the list query.
- E-signature request creation failed against a real database — `DocumentSignatureService`
  created signatories via a nested `signatories.create`, but the tenant-scope Prisma extension
  only injects `tenant_id` into the top-level row, so each signatory was missing its required
  `tenant_id` ("Argument `tenant` is missing"). `tenant_id` is now stamped explicitly on every
  nested signatory (with a regression test).
- **Owner-less dedup/versioning was tenant-global.** For a standalone-DMS upload with no owning
  record (the normal case for a plain folder upload), the dedup and versioning look-ups collapsed
  to "any document in the tenant" — so an identical file uploaded elsewhere was silently discarded
  as a duplicate, and two unrelated same-named files cross-incremented each other's `version`.
  Owner-less uploads are now scoped to the target **folder** (`entity_type/entity_id/application_id`
  all null + `folder_id`), so unrelated files never dedup or co-version.
- **Concurrent final signers could double-complete a signature request**, generating two
  certificate documents. Completion now claims the request via an atomic conditional
  `updateMany` (only the update that flips the still-open request to `completed` proceeds), so
  exactly one certificate is generated.
- **Folder names could inject fake path levels.** A folder name containing `/` or `\` corrupted the
  materialised `path` and defeated the descendant/cycle guards. Names are now sanitised of path
  separators and control characters (with regression tests).
- **`Content-Disposition` header built from the raw `original_filename`** could be corrupted by a
  quote or CRLF in a stored filename (header injection / a spurious 404 from Fastify header
  validation). Download/inline responses now emit an ASCII-safe quoted filename plus an RFC 5987
  `filename*` for Unicode.
- **Non-numeric ids returned an opaque 500.** `GET /api/documents?related_record_id=abc`, a
  non-numeric `folder_id`/`limit`/`offset`, or `GET /api/documents/record/abc` reached Prisma as
  `NaN`; these params are now validated and return **400** instead.
- **Public signing metadata resolved `completed` requests.** `resolveByToken` now also rejects
  `completed` requests, matching the route's advertised "not found, completed, or expired" contract.

### Changed — Modal & dialog redesign (July 2026)

Every dialog now reads as one contemporary system. The shared `Modal` (`components/ui/Modal.jsx`)
gained a blurred scrim, a rounded panel with a brand **accent ribbon** and an aurora-washed header
(optional gradient icon chip, eyebrow, subtitle), a tinted footer, a **bottom-sheet** layout on
small screens, and `prefers-reduced-motion` support — so every screen that uses it is restyled for
free. New reusable tokens `.modal-scrim` / `.modal-panel` / `.modal-accent` (in `index.css`) bring
the same language to dialogs that can't use the component: the bespoke platform/builder quick-forms
(Tenants, Plans, Feature Flags, Announcements, Roles, Employees), the Convert-Lead dialogs, the
dashboard delete-confirm, and the email composer / PDF "email document" dialogs were all uplifted to
match.

**Fixed:**

- **`SlaBuilderPage` shadowed the shared `Modal`** with a private in-file `Modal` component, so its
  four dialogs diverged visually from the rest of the app. It now imports and uses the shared
  component (removing the duplicate), unifying the look and behaviour.
- **Modal scrim didn't always cover the full viewport.** Dialogs rendered inline, so on any screen
  whose layout has a `transform`/`filter` ancestor (e.g. the drag-and-drop and zoomable **builder
  canvases**) the `fixed inset-0` overlay was contained by that ancestor instead of the viewport —
  leaving the top header and sidebar (the "Genesis" chrome) crisp and uncovered. The shared `Modal`
  and the bespoke email-composer, PDF "email document", Convert-Lead, and dashboard delete dialogs
  now render through a **React portal into `document.body`**, so the blurred scrim always spans the
  entire height over the header and sidebar. (This is expected behaviour — a modal should cover the
  whole page, not just the content area.)

### Added / Fixed — Webhook & app-wide robustness pass (July 2026)

- **Inbound webhooks hardened** (`POST /api/integrations/inbound/:name`):
  - **Replay / idempotency defence** — each request is fingerprinted (caller `Idempotency-Key`, else
    the HMAC signature, else a hash of the raw body) and recorded in Redis for 24 h; a replayed capture
    or a duplicate sender-retry is acknowledged (`200 { duplicate }`) but **not re-processed**, so it
    can't duplicate records/automations.
  - **Body-size cap** — payloads over 1 MB are rejected (`413`) before the raw body is buffered for
    HMAC, closing the unbounded-buffering DoS vector (was inheriting the global 50 MB limit).
  - **Rate limiting** — a Redis fixed-window limit per (integration, client IP) returns `429` past
    120 req/min. All three degrade fail-open if Redis is down (except the body cap, which is always on).
- **Central error handler now honours any 4xx.** Routes/services that throw `{ statusCode, message }`
  (e.g. the insurance routes' 404s, `requireFields` 400s) were being masked as **HTTP 500** with a
  generic message; the handler now surfaces any explicit 4xx status as-is. Fixes a whole class of
  wrong-error-contract bugs across the insurance API.
- **Insurance date coercion** — `createRenewalTask` / `createBillingSchedule` used `new Date(a ?? b)`,
  so an empty-string `renewal_date` / `next_due_date` became an **Invalid Date** (500) and a `null`
  became the 1970 epoch. A shared `firstValidDate()` helper now skips empty/invalid candidates and
  returns a clean `400` when none is valid. (Same class as the social-post `scheduled_for` fix.)
- **Removed a misleading dead surface** — the Assignment Rules "drag to reorder" grip handle did
  nothing (no DnD was wired) and its client method was unused; both removed. (The backend reorder
  endpoint remains for programmatic use.)

> **Deferred (honest scope note):** a fully crash-durable outbound-delivery **outbox** was scoped but
> intentionally not shipped in this pass — it needs its own migration + idempotency and a rushed version
> risks double-delivering webhooks. Outbound deliveries already retry synchronously with exponential
> backoff (up to 3 attempts); inbound replay is now covered by the idempotency guard above.

### Fixed — Builder AUTOMATE & CONNECT hardening pass (July 2026)

A robustness sweep across the Builder's Automate & Connect features. Highlights:

- **Workflows: multi-step workflows now actually run.** The engine only followed explicit
  `on_true_id`/`on_false_id` links, but the Workflow Builder never sets them — so every workflow
  built in the UI silently executed only its **first** step. Steps now **fall through by
  `order_index`** when no branch link is set (explicit links still win). *(critical)*
- **Workflows: one failing step no longer aborts the rest.** Each step runs in a try/catch; a throw
  is recorded in the run log and execution continues. `manualRun` ("Test Run") no longer 500s and
  always returns the step-by-step log.
- **Workflows: loop & dangling-reference guards.** An `integration` step can no longer publish a
  reserved `record.*` event (which re-triggered the engine into an infinite loop); a `create_record`
  step whose target object was deleted now no-ops instead of throwing on a dangling FK.
- **Integrations: signing secrets no longer exposed to non-admins.** `GET /builder/integrations*`
  (list, detail, logs, stats, event-catalog) returned rows containing `config.secret` and outbound
  auth headers to any authenticated user; these reads are now `requireAdmin`. *(security)*
- **Integration Health page repaired.** The Retry button and red status dot keyed off a log status
  value (`'failure'`) the backend never writes (`'error'`), and the cards read non-existent stat
  fields (`success_count`/`error_count`) and treated `error_rate` (a 0..1 fraction) as a percent —
  so the page showed blank counts, wrong health, and an unreachable Retry. All aligned to the API.
- **Email Templates & Lead Scoring: inactive rows were invisible and unrecoverable.** A default
  parameter (`isActive = true`) re-applied when the route passed `undefined`, so soft-deactivated
  templates/rules vanished from the builder with no way to reactivate them. Listing now returns all
  when no filter is given.
- **Email Templates: preview no longer inflates analytics.** `renderTemplate` bumped `usage_count`
  on every preview; usage is now counted only on the real send path.
- **Social Media: editing a post with no schedule no longer 500s** — an empty `scheduled_for` is
  coerced to `null` instead of the empty string Prisma rejects.
- **Push Notifications: honest responses.** Validation errors returned HTTP 200 with an error body
  (UI reported false success); they now return 400. Targeting a role/user that matches no active
  recipient returns 422 instead of logging a phantom "sent" with 0 recipients.

### Added — Comprehensive pipeline audit trail (July 2026)

- **Every user action on pipeline data is now audited**, attributed to the logged-in user. Filled the gaps
  so no mutation goes unrecorded: record **bulk delete**, **bulk stage move**, **restore**, and **purge** now
  write `audit_logs` entries (they previously did not), and single deletes record their **mode** (soft/hard)
  in `changes`.
- **Pipeline configuration changes are audited too** — `pipeline.create` / `pipeline.update` /
  `pipeline.delete`, with the actor and a summary of what changed. Viewable per pipeline via a new **History**
  button in the Pipeline Builder (`GET /api/builder/pipelines/:id/audit`).
- **Audit is now durable and general.** `audit_logs.record_id` became nullable with an **ON DELETE SET NULL**
  FK (migration `audit_log_general_durable`), so the trail **survives hard-deletes and purges** (the original
  id is preserved in `changes`). New `entity_type` / `entity_id` columns let the same table record non-record
  actions (pipeline config). Previously a hard delete cascade-wiped its own audit entry.
- Backed by tests (`tests/pipeline-audit.test.js`, plus audit assertions in `tests/record-trash.test.js`).

### Added — Record Trash & soft/hard delete (July 2026)

- **Deleting a record now moves it to a Trash first (by default).** Records (Leads, Prospects, and every
  other object's rows) carry `deleted_at` / `deleted_by` (migration `add_record_soft_delete`). When a user
  deletes a record, it is soft-deleted — hidden from all user-facing lists, boards, exports, and bulk
  operations, but retained in the database. Users are never exposed to the soft/hard distinction; the record
  simply disappears from their view.
- **Per-pipeline soft/hard delete toggle.** Each pipeline carries its own **Deletion behaviour** setting —
  a modern toggle in the Pipeline Builder create/edit modal, stored on `ui_pipelines.config.delete_mode`
  (`soft` default / `hard`). `RecordService` resolves the mode per record from its object's pipeline, so
  different objects can have different behaviour. (This replaced an earlier global `data.delete_mode`
  application setting, which was removed.)
- **Admin Trash / recovery bin.** A new admin-only **Trash** page (`/builder/trash`, reachable from a Trash
  button on the Pipeline Builder header) lists soft-deleted records — hydrated with a name/email summary,
  type, last stage, and who deleted them — with **Restore** and **Delete permanently** actions and a
  by-type filter. New endpoints: `GET /api/builder/trash/records`, `POST /api/builder/trash/records/:id/restore`,
  `DELETE /api/builder/trash/records/:id` (all `requireAdmin`). Permanent deletion requires the record to
  already be in the Trash, so accidental loss takes two deliberate steps. Backed by regression tests
  (`tests/record-trash.test.js`).
- **New reusable `Toggle` component** — a modern iOS-style switch (`components/ui/Toggle.jsx`), used for the
  per-pipeline delete-mode control.

### Fixed — UI polish pass (July 2026)

- **`Button` `glass` and `warning` variants were undefined.** Buttons using `variant="glass"`
  (Underwriting Case Review header) and `variant="warning"` (Policies → File Claim) rendered with
  no colour/background because those variants didn't exist. Added both to `Button` (frosted
  translucent-white `glass` for use on gradient headers; amber `warning` matching the Badge/Alert
  semantic), so the affected buttons now style correctly.
- **Unescaped apostrophes** in `ReminderPanel` and `RemindersPage` (`react/no-unescaped-entities`
  lint errors) were escaped.
- **All `react-hooks/exhaustive-deps` warnings resolved** (Sidebar, NotificationBell,
  OrganizationSettings, ChartRenderer, DeclarationPage). Query-derived arrays/objects
  (`modules`, `notifications`, `schema`, `serverValues`) are now memoised so effects/memos no
  longer re-run every render; effect dependency lists were completed with their stable setters
  (`setError`, `setSearchParams`); and a `form`-dependent effect now reads state inside the
  `setForm` updater instead of depending on it. Frontend `npm run lint` is now **completely clean
  (0 errors, 0 warnings)**. Backed by new regression tests (`tests/NotificationBell.test.jsx`
  asserts the auto-mark-read effect converges and fires exactly once — a broken dep would loop;
  `tests/Sidebar.test.jsx` asserts metadata modules still group by category).

### Optimized

- **De-duplicated the colour→tone map.** The legacy-colour-name → `StatTile` tone mapping was
  copied in `PlatformDashboard` and `AnalyticsPage`; it now lives once in `StatTile` as the
  exported `toneForColor()` helper.

### Added — App-wide "widget" design language (July 2026)

- **A reusable widget layer, on top of the metadata framework.** New design tokens in `index.css`
  (`.widget`, `.widget-hover`, `.widget-accent`, `.widget-title`, `.widget-value`, `.icon-chip`,
  `.aurora-wash`) plus three shared components — `PageHeader`, `StatTile`, `EmptyState` — give the
  app a consistent, snappy, modern look without touching per-page business logic. The UI/UX layer
  sits entirely on top of the existing metadata-driven rendering.
- **`DataTable` is now widget-framed.** Optional `title` / `subtitle` / `icon` / `actions` header
  slot, a self-contained widget frame, and an engaging `EmptyState` (gradient icon + encouraging
  copy + optional CTA) replace the flat "No records found". A `frame` prop lets pages that already
  wrap the table in a card opt out of double-framing. Builder list pages (Modules, Pipelines,
  Wizards, Workflows) pick up the widget frame automatically.
- **`Card` gained a widget variant** — `icon` (gradient chip), `subtitle`, `accent` (top gradient
  ribbon), and `hover` (lift) props.
- **Metadata-driven surfaces refreshed.** The module views (`ModulePage`) and the dashboard home
  (`RuntimeHome`) now lead with a `PageHeader` — gradient icon chip, display title, and a warm,
  time-of-day greeting ("Good morning, … — here's your day at a glance.") to make the app feel
  engaging and personal. Every metadata-defined module inherits the header automatically.
- **Snappier shell chrome.** Sidebar nav items nudge on hover; the header avatar became a
  gradient, ring-bordered chip with a hover pop. Benchmarked against Linear, Stripe, Vercel,
  Notion, and Superhuman.
- **Rolled out across the app.** The widget language now leads the insurance suite (Quotes,
  Policies, Claims, Applications, Underwriting, Commissions, Declarations, Document Collection,
  Agent Workbench), the core Builder list pages (Modules & Objects, Pipelines, Workflows,
  Wizards), and the Platform-admin suite (Dashboard, Tenants, Plans, Feature Flags, Security,
  Analytics, Announcements, Audit Log) — bespoke gradient banners and divided stat strips were
  replaced with `PageHeader` + `StatTile` grids and widget-framed tables. `StatTile` gained a
  `sub` caption; platform `StatCard`/`MetricCard` now delegate to `StatTile`, so their KPI grids
  upgraded without touching call sites.
- **Remaining Builder pages swept.** Builder Studio home, Assignment Rules, Employees, Email
  Templates, Permissions, Roles & Hierarchy, Social Media, Integrations, Lead Scoring, Push
  Notifications, and Integration Health now lead with `PageHeader` (their gradient banners /
  divided stat strips became `PageHeader` + `StatTile`). Full-canvas editors (Form, Dashboard,
  Report builders) and the SLA/Org-Chart toolbars keep their purpose-built layouts by design.

### Changed — Wizard stepper redesign & configurable step validation (July 2026)

- **Modern, engaging stepper.** The runtime wizard (`WizardRenderer`) was rebuilt around a new
  metadata-driven `WizardStepper`: a vertical progress rail with a gradient spine, glowing
  current node, and check/alert states on desktop (Stripe / Linear onboarding feel), collapsing
  to a shimmering segmented progress bar on mobile (Typeform / Apple-checkout feel). Steps now
  render in an airy card with a per-step slide-up transition, a gradient progress line, and
  warm, progress-aware encouragement copy so long forms feel light. Completed steps are
  clickable in the rail to jump back. Benchmarked against Typeform, Stripe Checkout, Linear
  onboarding, Apple, and Duolingo.
- **Configurable step validation is now a first-class pillar — and actually enforced.** The
  Wizard Builder's raw "Validation Rules (JSON)" textarea is replaced by a structured rule
  builder (`StepValidationEditor`): pick a field, an operator (required, min/max, min/max
  length, regex, equals, and cross-field *matches / after / before / greater-than / less-than*),
  an optional comparison field, and a custom message — plus a "block Continue until valid"
  toggle. Rules are stored on `ui_wizard_steps.config.validation` and evaluated at runtime by a
  shared `utils/wizardValidation` module, so they genuinely block advancing (previously the JSON
  was stored but never applied). Cross-field rules can reference values entered on earlier steps.
- **Backend hardening.** `addWizardStep` / `updateWizardStep` now whitelist writable columns
  (`name, label, description, form_id, order_index, config`), dropping the stale
  `validation_rules` key that Prisma would otherwise reject. Wizards with no rules configured
  behave exactly as before.

### Added — Reminders (July 2026)

- **Reminders on records.** A new **Reminders** tab on the Lead/Prospect/Client (and every
  record) detail view lets users set a time-based reminder with a title, date/time, priority,
  and note — with one-click presets ("In 1 hour", "Tomorrow 9am", "Next week"), snooze, mark
  done, and dismiss. Benchmarked against the reminder/follow-up primitive in Salesforce,
  HubSpot, Dynamics, Zoho, and Pipedrive.
- **Synced with notifications.** A 60s scheduler sweep (`ReminderService.sweepDue`, wired in
  `app.js` alongside the workflow/SLA runners) fires due reminders as in-app **Notifications**
  (type `reminder`), so they appear in the notification bell automatically. Each due reminder
  is claimed with an atomic conditional UPDATE, so it is safe to run across multiple pods.
- **"My Reminders" agenda** (`/reminders`, in the Tools sidebar) groups a user's open reminders
  into **Overdue / Today / Tomorrow / This Week / Later** — the calendar-style agenda surface.
- **API.** `GET/POST /api/reminders`, `GET /api/reminders/my`, `PUT /api/reminders/:id`,
  `POST /api/reminders/:id/{snooze,complete,dismiss}`, `DELETE /api/reminders/:id` — role-scoped
  (own / hierarchy / all). New `reminders` table (migration `20260708130000_add_reminders`).

### Changed — tenant isolation hardened to ALS-only (July 2026)

- **Removed the shared-instance `prisma._requestTenantId` fallback.** Row-level tenant isolation
  now relies solely on `AsyncLocalStorage`. The fallback was a singleton mutated by every request
  and could, in principle, cross-scope concurrent requests; on Node 18+/Fastify 5 `enterWith()`
  propagates reliably from the authenticate preHandler to the handler. Proven by a new test
  (`tenant-als-propagation.test.js`: 100 concurrent interleaved requests, zero leaks). This also
  fixes the platform-admin cross-tenant bypass, which the stale fallback previously neutralised.

### Fixed (platform hardening pass — July 2026)

- **Field builder no longer 500s on inline validations.** `MetadataService.createField`
  wrote validation rules as a *nested* `createMany`, which the tenant-scope Prisma
  extension never injected `tenant_id` into (a required column) — so creating any field
  with validation rules failed. Validations are now written as a separate tenant-scoped
  top-level `createMany`.
- **DDL injection on the shared `records` table closed.** Field `name` is now validated
  against a safe SQL-identifier grammar before it is interpolated into the
  `ALTER TABLE records … ADD COLUMN` statement used when a field is indexed.
- **SSRF hardened for all outbound webhooks.** The guard now validates the *resolved* IP
  (not just the hostname string) and pins the connection to it, blocking cloud-metadata
  (169.254.169.254) and DNS-rebinding access. Shared by the workflow engine and integrations.
- **Record list bounded.** `GET /api/runtime/records` and CSV export were unbounded
  `findMany` calls; they now apply a safety cap and accept optional `limit`/`offset`
  server-side pagination.
- **Tenant isolation on insurance sequence numbers.** The raw `FOR UPDATE` sequence query
  (policy/app/claim/… numbers) is now scoped by `tenant_id`, so one tenant's max can no
  longer determine another's next number.
- **Reliable audit/activity trail.** Fire-and-forget audit and activity writes now capture
  `tenant_id` synchronously and log failures instead of silently dropping rows.
- **List grids: search & sort work again.** The shared `DataTable` read top-level `row[key]`
  while metadata records nest values under `row.data` — search, sort, and cell rendering now
  resolve nested values, and pagination clamps when the data set shrinks.
- **Frontend correctness:** notification "mark read on open" now fires after the list loads;
  invalid chart JSON surfaces an error instead of rendering blank; deferred navigation/close
  timers are cleared on unmount; `columns` memo stabilised in Applications; dead imports removed
  (0 lint warnings).

### Changed (platform hardening pass — July 2026)

- **Metadata-driven lead→client conversion.** A pipeline stage can now trigger conversion via
  a `config.is_conversion_stage` metadata flag (in addition to the conventional `converted`
  stage name), so tenants can rename/relocate the conversion lane without breaking automation.
- **Lead-score grade banding centralised.** The A–F thresholds, previously duplicated (and
  drift-prone) in `record.service` and `lead-scoring.service`, now live in one
  tenant-overridable utility (`utils/lead-grade`).

### Removed (platform hardening pass — July 2026)

- **~65 orphaned database models dropped (schema 170 → 105).** Nine feature domains had been
  scaffolded in `schema.prisma` with **no** service, route, seed data, or UI — and were
  verified empty (0 rows) before removal: **Email Campaigns**, **Calendar/Meetings**,
  **Analytics/KPI** (a duplicate of the live `UiDashboard` stack), **Contracts**, **Deal
  Stages**, **Territories**, **Sales Teams**, **Customer Portal/Knowledge Base**, and
  **Partner/Channel (PRM)** — plus the `CallLog` remnant and three unused SocialMedia models.
  Migration: `20260708120000_drop_orphaned_domains`. The README no longer markets these as
  shipped; they are tracked as roadmap items.
- **Misleading `email_campaigns` feature flag removed** (it was seeded `is_enabled: true`
  with no backend behind it).
- **Dead `BaseRepository.query()`** removed (it interpolated SQL as a bound parameter and
  could never execute).

### Added

#### Cohesive workflows ⇄ integrations (end-to-end)

- **Named connections in workflows.** A workflow **Webhook** step can now reference a registered integration by name
  (`{ "integration": "slack-notify", "body": {…} }`) instead of re-declaring a URL/secret — reusing its endpoint,
  signing secret, headers and retry policy, and logging every call to that integration's health dashboard. This is
  the Salesforce "named credential" pattern; the ad-hoc `{ "url": … }` mode still works.
- **New `integration` workflow step.** Explicitly invoke a registered integration mid-flow, or **publish a custom
  domain event** (`{ "event": "lead.qualified" }`) that event-subscribed integrations and other workflows react to —
  so a workflow can broadcast a business event to external systems (Salesforce Platform-Event-from-Flow pattern).
- **Enrichment write-back (metadata-driven).** An `integration` step with `field_map` maps a data-enrichment
  provider's response onto the record's own fields (`{ "field_map": { "company_size": "data.employees" } }`).
- **Metadata-driven, per-object event subscriptions.** In addition to generic `record.*` events, integrations can
  subscribe to per-object events derived from the tenant's objects — `lead.created`, `opportunity.updated`, etc.
  (HubSpot/Pipedrive/Zoho pattern). New `GET /api/builder/integrations/event-catalog` serves the catalog; the
  builder's event picker consumes it.
- **Completed connectors.** `enrichment` (calls a provider, returns data) and `custom` (user-defined generic
  outbound) are now real, working connectors — no more "not yet available" placeholders. The unbuilt `email_sync`
  option was retired from the type list. Explicit invocations run regardless of the `is_active` toggle (which now
  governs only automatic event firing).

#### Event-driven integrations — webhooks are now a first-class part of the CRM

- **Integrations are no longer stand-alone, and workflows + integrations now share one event backbone.** A new
  in-process bus (`DomainEventBus`, `events.service.js`) decouples domain-event *production* from *consumption*. The
  **record/CRM service layer** (`RecordService`, `CrmService`) publishes canonical events — `record.created` /
  `record.updated` / `record.deleted` / `record.field_changed` — and **both** the workflow engine and
  `IntegrationService` are independent **consumers**. (Previously the workflow engine was the sole event producer;
  it is now a subscriber like integrations.) A single CRM mutation drives both workflow automations **and**
  event-subscribed webhooks. This is the Salesforce (Platform Events), HubSpot (webhook subscriptions), Dynamics
  (plugin pipeline), Zoho (Notifications), and Pipedrive (Webhooks) pattern.
- **Event subscriptions** — an outbound integration fires only for the events listed in `config.events`
  (`record.*` patterns, exact names, or `*`), configured via a picker in the Integration Builder. Previously outbound
  webhooks only fired from a manual **Test** button.
- **Signed payloads** — set `config.secret` and each outbound request is signed over its exact body and sent as
  `X-Signature-256` (HMAC-SHA256) — the symmetric counterpart to inbound verification.
- **Standard versioned envelope** — every outbound event carries `{ id, event, api_version, occurred_at,
  integration, object, actor, data }`.
- **At-least-once delivery** — any non-2xx response is treated as a failure; transient failures (network/timeout/
  HTTP 429/5xx) retry with exponential backoff (`config.retry`).
- **Inbound → workflow bridge** — a verified inbound webhook now runs any workflow mapped in `config.event_map`
  (`{ eventName: workflowId }`, resolved in the owning tenant's context) and re-publishes onto the domain bus.
- **Single outbound-delivery path** — the workflow `webhook` step now delivers through `IntegrationService.deliver()`,
  so all outbound HTTP shares one SSRF policy, one signing scheme, and one HTTP client.
- **Docs:** [Integrations](../user-guide/09-integrations.md), [SYSTEM_CONFIGURATION](../admin-guide/SYSTEM_CONFIGURATION.md),
  [SECURITY](../developer-guide/SECURITY.md), [API_REFERENCE](../developer-guide/API_REFERENCE.md),
  [WORKFLOW_ENGINE](../developer-guide/WORKFLOW_ENGINE.md).

#### Distinct Lead object — Lead → Prospect → Client lifecycle

- **New "Leads" module** — a first-class **Lead** object (raw/unqualified inbound) now sits in front of Prospect,
  matching how Salesforce/Zoho/Dynamics/Pipedrive separate a *Lead* from the qualified working entity. Prospect and
  Client are unchanged. Internal object name is `lead_intake` (UI label "Lead") to avoid colliding with the legacy
  `lead` alias for the `crm_leads`/Prospect entity.
- **Convert to Prospect** — qualifying a Lead creates a Prospect (`crm_leads`) record via
  `CrmService.convertLeadToProspect`; the lead is marked converted and linked (`converted_prospect_id`). Available as a
  button on the Lead record and auto-fired when a Lead is dragged to the "Converted" pipeline stage.
- **Schema:** new `crm_lead_intake` table / `CrmLeadIntake` model with a `record_id` bridge (migration
  `20260706130000_add_crm_lead_intake`); additive only — no data migration. Existing prospects are untouched.
- **API:** `POST /api/runtime/records/:id/convert-to-prospect`. Wired into `record.service.js` entity mapping
  (`CRM_FIELDS`/`FIELD_ALIAS`/`modelMap`/hydration) so Leads flow through the normal runtime record path.
- **Seed:** Leads module + `lead_intake` object (14 fields, create form), a 4-stage qualification pipeline, and sample
  leads. **Note:** the new object's metadata is per-tenant — fresh installs get it via `db:reset`; existing tenants
  must be provisioned (Builder or an idempotent seed).
- **Docs:** [DATABASE_SCHEMA](../developer-guide/DATABASE_SCHEMA.md), [DATA_DICTIONARY](../developer-guide/DATA_DICTIONARY.md)
  (incl. the Lead-vs-Prospect rationale vs. top-5 CRMs), and [API_REFERENCE](../developer-guide/API_REFERENCE.md).

#### Conversion gating — Prospect → Client requires complete required fields

- A Prospect can no longer be converted to a Client until **all of its required fields are filled** — the same
  required-field enforcement offered by Salesforce ("Require Validation for Converted Leads"), Zoho, HubSpot, Dynamics
  365, and Pipedrive. Enforced on **every** conversion path: the **Convert** button (`POST …/convert-lead` and
  `…/crm/leads/:id/convert`) and dragging a Prospect to the **Converted** Kanban lane
  (`PATCH …/records/:id/stage`, checked *before* the move so the card can't land in "Converted" without converting).
- Incomplete conversions return **400** with `{ error, missing_fields: [...] }`. The Convert modal shows the message;
  a blocked drag reverts the card and shows an inline alert listing the missing fields. New
  `RecordService.getMissingRequiredFields()` computes them from the object's `is_required` fields (skipping
  computed/read-only ones).

#### Lead scoring — surfaced inline on the Leads module

- **Score lives on the lead, not a separate module.** The standalone read-only "Lead Scoring" module was removed;
  instead the **Leads** module shows read-only **Score** and **Grade** (A–F) columns in the list and on the lead's
  detail panel — the Salesforce/HubSpot/Zoho pattern (a score is an attribute of the lead, not a separate screen).
  Values are injected from the `lead_scores` table at read time (`RecordService.#attachLeadScores`); "Lead Scoring
  **Rules**" (Builder) is unchanged. Fresh seeds no longer create the `lead_scoring` module; existing tenants can
  delete it (the read path is retained for backward compatibility).

#### Lead scoring — automatic execution

- **Scoring targets the Leads module.** The engine scores **Leads** (`crm_lead_intake`) — `scoreLeadIntake` runs
  automatically on lead create/update (fire-and-forget hook in `RecordService`), so "Lead Scoring" now genuinely
  reflects the Leads you see in the sidebar (the Salesforce/Zoho/HubSpot pattern: score inbound to prioritize
  qualification). `lead_scores` gained a nullable `lead_intake_id` (migration `20260706140000_lead_score_target_lead_intake`);
  `lead_id` is now nullable and retained for legacy/manual **Prospect** scoring. Prospect scoring stays available via
  `POST /lead-scoring/leads/:id/score` but is no longer auto-fired.
- **Auto-scoring** — creating or updating a scored entity runs the engine automatically (fire-and-forget hook in
  `RecordService`), so `lead_scores` populate from the rules engine instead of never running.
- **Grade badges + insights** — the Leads list and Kanban cards show a colored **A–F grade badge** for quick triage,
  and the Leads module has a collapsible **Lead Scoring Insights** panel (grade distribution + top-scoring leads +
  headline KPIs), served live from `/api/lead-scoring/{distribution,top,analytics}`.
- **Reminder:** seed rules first via **Lead Scoring Rules → Setup Defaults**, else every lead scores 0.

#### Bulk-import sample template

- **Download sample CSV** — the Import wizard now generates a ready-to-fill template from the selected object's own
  fields (real headers + one example row, select fields use valid option values, engine/disabled columns excluded, UTF-8
  BOM for Excel). Works for every module automatically — matches the HubSpot/Dynamics "example file from your schema"
  pattern.

#### Login & authentication enhancements

- **Show/hide password** — an eye icon inside the password field on the login and
  reset-password screens toggles the password between hidden and visible.
- **Remember me** — a checkbox on the login screen controls session persistence.
  Checked (default) stores the session in `localStorage` so it survives a browser
  restart; unchecked uses `sessionStorage` so it ends when the tab/browser closes.
  `setAuth(token, employee, remember)` writes to the chosen store and clears the other.
- **Forgot / reset password** — self-service password reset via email:
  - New public pages `/forgot-password` and `/reset-password`, plus a "Forgot
    password?" link on the login screen.
  - **API:** `POST /api/auth/forgot-password` (accepts an Employee ID **or** email,
    always responds generically so account existence isn't leaked) and `POST
    /api/auth/reset-password` (consumes the emailed token, min 8-char password).
  - **Security:** reset tokens are random 32-byte values, stored only as a **sha256
    hash** with a **1-hour expiry**, and are single-use (cleared on reset). Email
    send is via the existing SMTP transport (preview-mode when `SMTP_HOST` is unset).
  - **Schema:** `employees.reset_token` + `reset_token_expires` columns
    (migration `20260706120000_add_password_reset`).
  - **Docs:** [First Login & password reset](../getting-started/INSTALLATION.md#resetting-a-forgotten-password).

#### Configurable reporting module

- **Report builder** (`/reports/new`) — build fully configurable reports over 10 CRM/insurance data sources (leads,
  opportunities, cases, tasks, activities, quotes, policies, claims, commissions, SLA timers). Choose a visualization
  (table · bar · line · pie · KPI · pivot), columns, filters (equals / in / contains / comparisons / date-range /
  empty), group-by dimensions with date bucketing (day→year), and aggregations (count · sum · avg · min · max ·
  distinct), with a **live preview** and one-click **CSV export**. Nothing is hard-coded — every report is declarative.
- **Reports gallery & viewer** (`/reports`, Tools → Reports) — saved reports grouped by category; run live with a
  role-gated scope toggle (Mine / Team / All), refresh, export, edit, delete.
- **Engine** — new `ReportService` + curated data-source registry translate a declarative config into tenant-scoped
  Prisma queries (DB-side filtering, capped 20k-row scan) and apply grouping/aggregation/date-bucketing/pivots in
  code so every source behaves identically. Built on the previously-unused `CustomReport` / `ReportExecution`
  schema; execution history and result caching are recorded.
- **API:** `GET /api/reports/sources`, CRUD `/api/reports`, ad-hoc `POST /api/reports/run`, saved `POST
  /api/reports/:id/run`, and `POST /api/reports/export` (CSV). Verified end-to-end against live data.
- **Sample data:** `npm run db:seed` (and `scripts/setup-report-samples.js`) create 7–9 starter reports — Pipeline by
  Stage, Leads by Source, Cases by Priority, Premium by Product, Commission Summary, and more.
- **Docs:** new [Reports guide](../user-guide/19-reports.md) with a top-5-CRM benchmark.

### Fixed

- **Outbound webhook SSRF bypass** — the shared URL guard never actually blocked IPv6 hosts (Node keeps them
  bracketed, e.g. `[::1]`, so the checks silently passed) and allowed IPv4-mapped IPv6 (`::ffff:127.0.0.1`) and
  integer/hex-encoded IPv4 (`2130706433`, `0x7f000001`). The policy now strips brackets, unwraps mapped forms, and
  rejects encoded IPs. It is the single outbound-URL policy for both integration deliveries and the workflow
  `webhook` step.
- **Outbound webhooks logged HTTP 4xx/5xx as success** — a non-2xx response is now correctly recorded as a failed
  delivery (and eligible for automatic retry).
- **Inbound webhook returned 400 instead of 401 for a missing signature header** — signature errors (missing header
  *or* mismatch) now consistently return `401`.
- **Inbound webhook logging crashed outside a tenant context** — the public inbound route carries no tenant, so the
  tenant-scoped log/`last_run_at` writes failed; `receiveInbound` now runs inside the owning integration's tenant
  context.
- **Push notification "Specific Employees" dropdown** showed `undefined undefined (<USER_TYPE>)` — the option label read
  non-existent `first_name`/`last_name` fields; now uses the API's `employee_name` / `employee_id`.
- **Record create 403** — view-only roles saw New / Import / Edit / bulk actions and hit a 403 only after submitting;
  the module UI now gates all write actions on the object's `_can_edit` permission.
- **SLA child tables were not tenant-scoped** — `sla_targets` and `sla_escalations` lacked a `tenant_id` column, but
  the tenant middleware injects `tenant_id` into every non-global model's queries. Under a request's tenant context,
  reading or writing targets/escalations (config routes, seed, setup scripts) would error. Added `tenant_id` +
  relation + index to both models (migration `20260703130000_add_sla_child_tenant_id`, backfilled from the parent
  policy) so they follow the same tenant-isolation convention as every other table.

### Changed

- Removed the "Set up your SLA engine" banner from the home Dashboard; SLA setup is reached from the sidebar
  (Builder → Automate → **SLA Engine**). Extracted the duplicated `useTick` countdown hook into a shared `useNow`.

#### Configurable SLA engine + live dashboard radiator

- **SLA engine** — configurable service-level agreements on **cases, leads, and tasks**. Admins define policies
  (Builder → Automate → **SLA Engine**, `/builder/sla`) with per-priority **First-response** and **Resolution**
  targets, **warning thresholds**, **match conditions**, **pause statuses**, and **escalations** (notify owner /
  notify manager / raise priority / create follow-up task). A background reconciler (60 s tick, offset 15 s from the
  workflow scheduler) attaches one timer per (record, metric), computes **business-hours-aware** due dates, flags
  at-risk / breached, and fires escalations. New models: `SlaBusinessHours`, `SlaPolicy`, `SlaTarget`,
  `SlaEscalation`, `SlaInstance` (migration `20260703120000_add_sla_engine` — **run `db:migrate` to apply**).
- **Business-hours calendars** — timezone (fixed UTC offset, DST-free), weekly working hours, and holidays; SLA
  clocks only tick inside them (or 24/7 when unset). Pure, dependency-free date math, unit-tested for weekend/holiday
  skips, cross-day rollover, before-hours starts, and offset timezones.
- **Dashboard SLA radiator** — a live, always-visible information radiator at the top of the home Dashboard for every
  user: on-time compliance gauge, actionable breached / at-risk / on-track counters, and real-time countdowns.
- **SLA Board** (`/sla`, Tools → SLA Board) — full monitoring view with My / Team / Everyone scopes (role-gated),
  compliance gauge, breakdowns by priority / record type / policy, and a live, filterable timers table.
- **API:** `GET /api/sla/dashboard` (all users, scope-clamped by role), admin config CRUD for
  `/api/sla/policies` and `/api/sla/business-hours`, plus `POST /api/sla/seed-defaults` and `POST /api/sla/reconcile`.
- **Sample data:** `npm run db:seed` now seeds the SLA engine — a business-hours calendar, 4 policies (a conditional
  Critical/Priority case policy, a standard case policy, Speed-to-Lead, and Task Due), and 6 sample support cases. It
  runs the real engine twice (start timers → resolve two cases → settle) so the seeded board shows a realistic spread
  across on-track, at-risk, breached, met-on-time and met-late — with a live compliance %.
- **Docs:** new [SLA Engine guide](../user-guide/18-sla-engine.md) with a top-5-CRM benchmark, plus a plain-language
  [how-to guide](../user-guide/NEW_FEATURES_HOW_TO.md); indexed in the docs index and user-guide README.

#### Interactive organization chart (admin)

- **Org Chart screen** (`/builder/org-chart`, admin-only, Builder → Manage) — a
  single interactive view of the entire member hierarchy. Renders the whole
  company as a top-down org chart (or an indented tree) with zoom/pan,
  collapse/expand per team and globally, search that highlights matches and
  auto-expands paths to them, filters (role / region / branch / active status),
  colour coding by role level / region / branch, a member detail panel (reporting
  line, direct reports, Direct/Team/Level metrics, contact info), and
  focus/re-root on any subtree. Read-only by design — reporting lines are still
  edited on the Employees screen (deep-linked from the panel).
- **`GET /api/auth/org-hierarchy`** (admin-only) — returns all employees, their
  direct-report edges, and role levels in one request, backed by the existing
  `EmployeeHierarchy` closure table via `HierarchyService.getOrgGraph()`. The
  browser assembles the (multi-root) forest, so the chart always reflects the
  same hierarchy that powers Team/Hierarchy permission scopes.
- **Docs:** new [user guide](../user-guide/17-org-chart.md); cross-linked from the
  Employees guide and the docs index.

### Removed

- **Call Logs module** — the standalone Call Logs feature (service `call-log.service.js`, routes `/api/call-logs`,
  and the `call_log` metadata module) has been removed as unwanted; call tracking is handled via the Activity
  Timeline (type: call). The `call_logs` table and its `CallLog` Prisma model were subsequently **dropped** by
  migration `20260708120000_drop_orphaned_domains` and no longer exist in the schema. Documentation references across
  the user guide, admin guide, API reference, data dictionary, database schema, and roadmap have been removed or
  annotated accordingly.

---

## [4.2.0] — 2026-06-15

### Added (4.2.0)

#### Inbound social conversation routing — all channels

- **Auto-assignment of inbound mentions / DMs / comments** across every channel
  (Facebook, Instagram, LinkedIn, X, WhatsApp). Previously `pullMentions`
  ingested conversations but never assigned them; the "routed to employees via
  assignment rules" behaviour documented for WhatsApp was unimplemented
  everywhere. Routing now runs inside the mention sync (5-minute background
  cycle + manual `POST /accounts/:id/sync`) and is reported as
  `mentions_assigned` per sync.
- **Configurable assignment rules** (`SocialAssignmentRule`, migration
  `20260615120000_add_social_assignment_rules`) scoped per platform, mirroring
  the record assignment engine: `fixed`, `round_robin` (inline cursor),
  `load_balanced`, and `rule_based` (conditions over the mention's own fields).
  Managed via admin-only `GET/POST/PUT/DELETE /api/social-media/assignment-rules`
  (+ `/reorder`). When no rule applies, routing falls back to load-balancing
  across the managed-by social team.
- **Reuse:** extracted `AssignmentService.leastLoaded()` and
  `matchesConditions()` so the load-balancing and operator semantics live in one
  place, shared by record and social routing.
- **Runtime Social Media nav link** — added a **Tools → Social Media** sidebar
  entry visible to every authenticated user. The `/social-media` runtime page
  existed and was open to all roles, but had no nav link (only the admin-only
  Builder entry), so non-admins could not discover it. Documented post
  permissions for the `user` role (view-only; create/edit/publish = manager+;
  delete = admin; no post "react" feature) in the social media guides.

### Fixed (4.2.0)

- **Workflow scheduler tenant isolation** — scheduled workflow execution now
  runs inside the owning workflow's tenant context
  (`tenantContext.run(...)`). Previously the scheduler had no tenant context, so
  the Prisma middleware fell back to a stale per-request tenant id — a
  cross-tenant execution hazard. The discovery query remains intentionally
  global.
- **`RecordFormPage` rules-of-hooks violation** — `useMemo` was called
  conditionally (right-hand side of `??`), so the hook count varied between
  renders. Now computed unconditionally before the fallback.
- **`insurance-domain` test suite** — added the missing `$queryRawUnsafe` mock
  so the raw `FOR UPDATE` sequence-number query is exercised (7 previously
  failing tests now pass).

### Changed (4.2.0)

- **Prisma:** dropped the deprecated `previewFeatures = ["fullTextIndex"]`
  (GA in Prisma 6).
- **Performance:** dashboard widget-position updates now invalidate dashboards
  concurrently (`Promise.all`) instead of sequentially.
- **Logging:** workflow scheduler errors now go through the central `logger`
  instead of `console.error`.
- **Cleanup:** removed unused imports/constants in `PoliciesPage`,
  `UnderwritingPage`, and `UnderwritingCaseReviewPage` (frontend lint: 1 error +
  20 warnings → 0 errors + 14 warnings).

---

## [4.1.0] — 2026-06-11

### Added (4.1.0)

#### New `status_tracker` fieldtype — logistics-style status timeline

- **New display fieldtype** benchmarked against Amazon / UPS / Bluedart package
  trackers. Renders three layers for a record: a milestone stepper, a
  current-status banner, and a dated event log (time · location · description).
- **`StatusTracker`** component (`frontend/src/components/ui/StatusTracker.jsx`) —
  composes the existing `StatusStepper` with a grouped-by-day event timeline.
  Registered in `constants.js`; dispatched from `FieldRenderer` (`recordId`
  threaded through `FormRenderer` → `RecordFormPage`).
- **New `status_events` table** (migration `20260611065018_add_status_events`) —
  generic per-record timeline (`status`, `title`, `description`, `location`,
  `event_type`, `occurred_at`, `changed_by`). Works for any object.
- **Auto-capture:** `RecordService.updateRecordStage` now appends a milestone
  event on every pipeline stage change, so the timeline self-populates.
- **API:** `GET` / `POST /api/runtime/records/:id/status-events`
  (`statusEvent.service.js` on the frontend).
- **Demo:** `backend/prisma/seed-status-tracker.js` wires a configured tracker
  onto the **Claim** and **Application** objects with realistic timelines.
- **Architecture decision:** implemented as a display-only *fieldtype* backed by
  a dedicated *events table* (not a new module/object), so admins can drop it on
  any object's form via metadata with zero per-object code.

---

## [4.0.9] — 2026-04-10

### Changed (4.0.9)

#### Metadata-Driven Architecture Expansion

- **Converted 3 hardcoded pages to fully metadata-driven:**
  - `ProductsPage` → now renders via `ModulePage` at `/module/:moduleId`
  - `CallLogsPage` → now renders via `ModulePage` at `/module/:moduleId`
  - `LeadScoringPage` → now renders via `ModulePage` at `/module/:moduleId`
- **Added 3 new modules to seed data:** Products (8 fields, form, computed
  margin), Call Logs (9 fields, form), Lead Scoring (7 fields, form, grade
  pipeline)
- **Removed dedicated routes** for `/products`, `/call-logs`, `/lead-scoring`
  — these now appear in the sidebar automatically from metadata

#### New Generic Reusable UI Components

- **StatusStepper** (`/components/ui/StatusStepper.jsx`) — Reusable status
  pipeline visualization with 3 variants (bar, pills, steps). Used in
  ApplicationsPage, available for Claims, Policies, Commissions.
- **TabbedWorkspace** (`/components/ui/TabbedWorkspace.jsx`) — Metadata-driven
  tabbed container with 3 variants (underline, pills, boxed). Used in
  CommissionsPage.
- **LineItemEditor** (`/components/ui/LineItemEditor.jsx`) — Reusable
  repeating-row editor with metadata-driven columns, computed fields, totals,
  and reordering.

#### Tier 2 Hybrid Conversion

- Integrated `StatusStepper` into ApplicationsPage (replaces custom PipelineBar)
- Integrated `StatusStepper` import into ClaimsPage, PoliciesPage
- Integrated `TabbedWorkspace` into CommissionsPage (replaces custom tab rendering)
- Added `TabbedWorkspace` import to AgentWorkbenchPage for future use

#### Computed Field: calc_margin

- Added `calc_margin` function to `fieldFunctions.js` — auto-calculates product
  margin percentage from `unit_price` and `cost_price`

#### Documentation

- Created `docs/project/Configuration_Details.md` — comprehensive reference
  documenting which screens are metadata-driven, hybrid, or hardcoded, with
  recommendations for future development

---

## [4.0.8] — 2026-04-10

### Changed (4.0.8)

#### Category-Based Sidebar Navigation

- **Added `category` column to `ui_modules`** — Modules now have a
  `category` field (`crm`, `insurance`, `tools`, `settings`) that
  determines which sidebar section they appear under.
- **Sidebar is fully metadata-driven** — Removed the hardcoded
  Insurance and Tools sections from `Sidebar.jsx`. The sidebar now
  dynamically groups modules by their `category` value using the
  `MODULE_CATEGORIES` constant, eliminating duplicate entries.
- **Module Builder updated** — Added a Category dropdown to the
  module create/edit form so admins can assign categories via the UI.
- **Migration** — `20260410120000_add_module_category` adds the column
  with a default of `'crm'` and backfills existing insurance modules.

#### Declaration → Document Upload Navigation

- **"Upload Docs" in the right-side activity panel** — When an
  accepted declaration record is selected, the side panel header
  shows an **Upload Docs** button (same pattern as Convert, Get
  Quote, Process, etc. on other modules).
- **"Upload Documents" in the detail modal** — After clicking
  "Mark as Accepted", the modal stays open and shows an **Upload
  Documents** button.
- **Table-level action icon** — A green folder icon appears in the
  actions column for any accepted declaration row.
- **`app_number` query param** — Document Collection page now
  accepts `?app_number=` to pre-filter documents by application
  number, used by all declaration navigation paths.

#### Seed Data — Full Module Coverage

- **All 11 modules now have demo data** — Declarations (5 records)
  and Document Collection (6 records) were previously empty.
- **3 new pipelines** — Policy (6 stages), Underwriting (5 stages),
  and Commission (4 stages). Total pipelines: 9.
- **Full EAV seeded** for Declarations and Documents so list views
  display data instead of `--` placeholders.

---

## [4.0.7] — 2026-04-09

### Fixed (4.0.7)

#### EAV Upsert Race Condition

- **Prisma unique-constraint error on `record_field_values`** —
  `RecordService.#upsertCustomFieldValues()` used a batched
  `$transaction([...promises])` that executed upserts concurrently,
  causing `Unique constraint failed on record_field_values_record_id_field_name_key`
  errors under load. Switched to a sequential **interactive transaction**
  (`$transaction(async tx => { ... })`) so upserts run one-at-a-time
  within a single atomic transaction.

#### Post-Submit Redirect — Declarations Before Documents

- **Wizard redirected to Document Collection (Step 6) instead of
  Send Declarations (Step 5)** — After completing the 5-step Application
  Wizard, `WizardPage.jsx` now navigates to
  `/insurance/declarations?record_id=N` instead of `/insurance/documents`.
  This ensures the agent sends required legal disclosures (HIPAA, AML,
  etc.) before uploading supporting documents.

#### Declaration Auto-Open & Auto-Populate

- **Send Declarations modal auto-opens** — `DeclarationPage.jsx` reads
  the `?record_id=` query parameter from the wizard redirect, resolves it
  to the matching `InsuranceApplication`, pre-selects the application in
  the modal dropdown, and auto-opens the modal immediately.
- **Declaration fields auto-populated** — `Declaration #` is
  auto-generated (`DCL-YYYY-NNN`), `Application #` and `Applicant` name
  are resolved from the linked `InsuranceApplication` and `CrmContact`.

---

## [4.0.6] — 2026-04-07

### Added (4.0.6)

#### Document Storage — Industry-Standard Folder Structure

- **Structured folder hierarchy** following ACORD/NAIC compliance
  conventions:

  ```text
  uploads/documents/{tenant_id}/{year}/{app_number}/{category}/{filename}
  ```

  - **Tenant isolation** at the filesystem level — documents from
    different tenants never share directories.
  - **Year-based partitioning** for archival and retention policy
    compliance (7-year retention per NAIC Model Regulation 672).
  - **Application-centric grouping** — all documents for an application
    are co-located under its `app_number` (e.g., `APP-2026-000001/`).
  - **Category sub-folders** — documents organised by type
    (`government_id/`, `medical_records/`, `proof_of_income/`, etc.)
    for quick visual or automated audits.
- **Sanitised filenames** — user-provided filenames are sanitised
  (non-alphanumeric characters replaced, truncated to 100 chars,
  timestamp appended) to prevent path traversal and filesystem issues
  while preserving the original filename in the database.

#### Document Tracking & Integrity

- **`document_ref`** — each document receives a unique reference in
  `DOC-{APP_NUMBER}-{SEQ}` format (e.g., `DOC-APP-2026-000001-001`),
  providing a human-readable identifier for audit trails.
- **`file_hash`** (SHA-256) — computed on upload for integrity
  verification and duplicate detection. Duplicate files within the same
  application are automatically rejected with a warning log.
- **`version`** field — tracks re-uploads after rejection (incremented
  when a rejected document is replaced), maintaining a clear audit trail.
- **`original_filename`** / **`stored_filename`** — the user's original
  filename and the sanitised on-disk filename are stored separately,
  so downloads serve the original name while storage remains safe.

#### UI Permissions for Metadata-Driven Objects

- Added `declarationObject` and `appDocObject` to the seed permissions
  array (`seed.js`). Without explicit permission rows, non-admin users
  (manager, user) received 403 errors when creating records for these
  metadata-driven objects.

---

## [4.0.5] — 2026-04-07

### Added (4.0.5)

#### Auto-Number Generation for Metadata-Driven Records

- **`RecordService.#generateAutoNumbers()`** — generic auto-number
  generation for any metadata-driven object. When a `UiField` has
  `config.auto_number: { prefix, format }`, `createRecord()` auto-
  generates the next sequential value (e.g., `DOC-2026-001`) before
  persisting the record. Works for all objects, not just documents.
  Queries existing EAV values filtered by tenant to determine the next
  number in the sequence.

#### Document Collection — Metadata-Driven Business Process

- **`DocumentCollectionPage.jsx`** now uses the metadata-driven runtime
  API (`runtimeService.getRecords()`, `createRecord()`, `updateRecord()`)
  for all CRUD operations. Document metadata (filename, category, status,
  etc.) is stored as EAV records under the `application_document` object,
  while binary file data is stored on disk via the insurance file API.
- **Wizard → Document Collection flow**: After completing Step 5 (Review
  & Submit) of the application wizard, users are automatically redirected
  to Document Collection (`/insurance/documents?record_id=X`) instead of
  Applications. This makes document upload the immediate next step in the
  business process: Prospects → Quotes → Applications → Document
  Collection → Underwriting → Policy.
- **ApplicationsPage** — added Documents button (folder icon) in the
  table actions and "Upload Documents" button in the detail modal for
  easy navigation to Document Collection.
- **Backend API** (`/api/insurance/application-documents`): endpoints for
  binary file upload, download (supports lookup by runtime `record_id`),
  and review (approve/reject/waive). The `ApplicationDocument` model
  includes a `record_id` bridge column linking to the metadata-driven
  record system.

### Fixed (4.0.5)

#### Document Collection — Double-Create Bug

- **`DocumentCollectionPage.handleUpload()`** previously created documents
  via both the runtime API AND the insurance domain API, resulting in
  duplicate records. Fixed: metadata record is created first via
  `runtimeService.createRecord()`, then the binary file is stored via
  the insurance endpoint keyed by the runtime `record_id`.

#### Document Collection — Download Type Mismatch

- **`handleDownload()`** now passes `by_record_id: true` to the download
  endpoint, since document IDs in the metadata-driven view are runtime
  Record IDs, not ApplicationDocument IDs.

#### Assignment Service — Round-Robin Tenant Isolation

- **`#roundRobin()` upsert** — `tenant_id` now falls back to
  `rule.tenant_id` if `getTenantId()` returns null, and always uses
  `tenant: { connect: { id } }` relation syntax (required by Prisma
  when other relations use connect syntax in the same create block).

#### Auto-Number Tenant Isolation

- **`#generateAutoNumbers()`** — the EAV query for existing sequence
  numbers now always filters by `tenant_id` when available, preventing
  cross-tenant sequence collisions.

---

## [4.0.4] — 2026-04-07

### Fixed (4.0.4)

#### Prisma Middleware Migration (`$use` → `$extends`)

- **Tenant-scoping middleware** (`backend/src/middleware/tenant-scope.js`)
  rewritten from the removed `prisma.$use()` API to `prisma.$extends()`
  with `query.$allOperations`. The old `$use` middleware was removed in
  Prisma 6+ and caused a `prisma.$use is not a function` crash on startup.
- **Closure reference bug fixed**: The `$extends` query handler previously
  captured a reference to the **original** Prisma instance, but
  `setTenantContext()` wrote `_requestTenantId` to the **extended**
  instance. This meant `tenant_id` was never injected via the fallback
  path, causing all `$transaction` create operations to fail with
  `Argument 'tenant' is missing`. Fixed by using a shared ref object with
  a getter that reads from the extended instance.
- **`app.js`**: Changed `const prisma` to `let prisma` so the variable can
  be reassigned to the extended client returned by `applyTenantMiddleware()`.

#### Explicit `tenant_id` in `$transaction` Blocks

Added explicit `tenant_id` to all `.create()` calls inside `$transaction`
callbacks across **7 service files** (26 create operations total). The
`$extends` query handler may not reliably inject `tenant_id` inside
interactive transactions, so explicit values serve as a safety net.

| Service File | Methods Fixed |
| ------------ | ------------- |
| `crm.service.js` | `createLead`, `createContact`, `createAccount`, `createOpportunity`, `createCase`, `convertLead` |
| `quote.service.js` | `createQuote`, `addLineItem` |
| `product.service.js` | `createProduct` |
| `document.service.js` | `uploadDocument`, `createDocumentFromPath` |
| `assignment.service.js` | `createRule`, `roundRobinState` upsert |
| `email-template.service.js` | `createTemplate` |
| `record.service.js` | `#syncInsuranceApplication` (CrmContact find-or-create) |

#### Pipeline Kanban Stage-Change Workflow Triggers

- **`RecordService.updateRecordStage()`** now fires both
  `wfEngine.trigger('on_update', ...)` and
  `wfEngine.triggerFieldChanged(...)` with `pipeline_stage_id` old/new
  values. Previously, dragging a card between Kanban lanes updated the
  stage but **did not trigger any workflow engine events**, silently
  breaking all configured `on_update` and `field_changed` automations
  on stage transitions.
- **`RecordService.bulkUpdateStage()`** — same fix applied for bulk
  operations (fetches existing records before the update, then fires
  workflow triggers for each affected record).

#### Quote-to-Application Data Bridge

- **Quote Engine** (`InsuranceQuotePage.jsx`): Added **Contact Details**
  card with First Name, Last Name, Email, Phone, and Date of Birth fields.
  Previously, applicant name and email were sourced only from URL
  parameters (`?clientName=&clientEmail=`), which were often empty when
  navigating directly to the quote page.
- **Insurance Domain Bridge** (`record.service.js#syncInsuranceApplication`):
  Now resolves or creates a `CrmContact` record from the applicant's
  name/email and links it via `contact_id` on the `InsuranceApplication`.
  Previously, `contact_id` was always `null`, causing the Applications
  page to show "—" for the applicant name.
- **Schema**: Added `date_of_birth`, `health_class`, `term_years`, and
  `payment_frequency` columns to the `InsuranceApplication` model. These
  fields were collected by the Quote Engine but lost during the sync.
- **Applications Page** (`ApplicationsPage.jsx`): Detail modal now
  displays Contact Details (email, phone), Date of Birth, Gender, Health
  Class, Term, and Payment Frequency.

#### Assignment Service

- **`roundRobinState` upsert** (`assignment.service.js`): Fixed
  `Argument 'rule' is missing` error by using
  `rule: { connect: { id: rule.id } }` instead of passing `rule_id` as
  a scalar in the `create` block.

---

## [4.0.3] — 2026-04-06

### Added (4.0.3)

#### Metadata-Driven Declaration Acceptance Screen

- **`DeclarationPage.jsx`** — new metadata-driven screen at
  `/insurance/declarations` for managing client declarations, disclosures,
  and regulatory acknowledgments required for policy acceptance. Standard
  across major insurance CRM providers (Applied Epic, Vertafore, EZLynx,
  Salesforce Financial Services Cloud).
- **Fully metadata-driven**: field definitions, status options, declaration
  type options, delivery method options, and table columns are all loaded
  from the configured `declaration` object via `runtimeService.resolveObject()`
  and `runtimeService.getObject()`. No hardcoded field definitions in the
  frontend — admins can add/remove/reorder fields via the Builder.
- **12 industry-standard declaration types** (seeded as `declaration_type`
  field options): HIPAA Authorization, AML Acknowledgment, Replacement
  Policy Disclosure (NAIC 613), Suitability Statement, Privacy Notice
  (GLBA), Producer/Agent Disclosure, Electronic Delivery Consent, Fraud
  Warning Statement, Statement of Good Health, Beneficiary Designation,
  Premium Payment Authorization, MIB Authorization.
- **Send Declarations modal**: application picker, declaration type
  multi-select (options from metadata), delivery method (options from
  metadata), notes.
- **Pipeline**: Pending → Sent → Viewed → Accepted / Declined / Expired
  (defined in `declaration_pipeline` pipeline stages).
- **Stats bar**: total sent, accepted, pending, declined, acceptance rate.
- **Detail modal**: metadata-driven field grid, declaration text preview,
  e-signature capture info (signer, timestamp, hash), activity timeline.

#### Metadata-Driven Document Collection Screen

- **`DocumentCollectionPage.jsx`** — new metadata-driven screen at
  `/insurance/documents` for capturing and managing documents required for
  application processing, underwriting, and policy issuance.
- **Fully metadata-driven**: field definitions, status options, document
  category options, and table columns are loaded from the configured
  `application_document` object. Admins can customize categories and
  statuses via the Builder without code changes.
- **14 standard document categories** (seeded as `category` field options,
  based on ACORD standards): Government-Issued Photo ID, Proof of Income,
  Medical Records/APS, Signed Application (ACORD 121), Beneficiary
  Designation Form, Payment Authorization/EFT, Existing Policy
  Documentation, Trust Documents, Power of Attorney, Lab/Paramedical
  Results, Financial Justification, Motor Vehicle Report, Inspection
  Report, Other.
- **Drag-and-drop upload** with multi-file support (25 MB limit per file).
- **Document Readiness Overview**: per-application progress bars.
- **Review workflow**: approve or reject with metadata-driven rejection
  reason field label.
- **Pipeline**: Required → Pending → Uploaded → Under Review → Approved /
  Rejected / Waived (defined in `document_pipeline` pipeline stages).

#### Backend — Seed Data (Metadata Configuration)

- **`declarations` module** with `declaration` object: 14 fields, create
  form (2-column layout, 8 field placements), declaration pipeline (6
  stages). Fields include: `declaration_number` (auto-number DCL-),
  `declaration_type` (12-option select), `applicant_name`, `app_number`,
  `status` (6-option select with colors), `delivery_method` (4-option
  select), `sent_at`, `viewed_at`, `accepted_at`, `signed_by`,
  `ip_address`, `signature_hash`, `content`, `notes`.
- **`document_collection` module** with `application_document` object: 14
  fields, create form (2-column layout, 7 field placements), document
  pipeline (7 stages). Fields include: `document_number` (auto-number
  DOC-), `filename`, `category` (14-option select), `applicant_name`,
  `app_number`, `status` (7-option select with colors), `mime_type`,
  `file_size`, `uploaded_at`, `uploaded_by`, `reviewed_by`, `reviewed_at`,
  `rejection_reason`, `notes`.
- All fields have `show_in_list` config for metadata-driven table column
  rendering.

#### Frontend — Routing, Navigation & Module Integration

- **Routes added** in `App.jsx`: `/insurance/declarations` →
  `DeclarationPage`, `/insurance/documents` → `DocumentCollectionPage`
  (lazy-loaded).
- **Sidebar updated** in `Sidebar.jsx`: "Declarations" (FileSignature icon)
  and "Documents" (FolderOpen icon) under the Insurance section.
- **`INSURANCE_ROUTES`** in `ModulePage.jsx`: added `declaration` →
  `/insurance/declarations` and `application_document` →
  `/insurance/documents` so CRM module navigation auto-redirects to the
  insurance domain pages.

#### Frontend — All Insurance Pages Now Metadata-Driven

- **ApplicationsPage.jsx**: Loads `application` object metadata via
  `resolveObject` + `getObject`; status and product filter options now
  derived from field metadata with hardcoded fallbacks.
- **PoliciesPage.jsx**: Loads `policy` object metadata; status and product
  filter options from metadata.
- **ClaimsPage.jsx**: Loads `claim` object metadata; status and claim type
  filter options from metadata.
- **UnderwritingPage.jsx**: Loads `underwriting_case` object metadata;
  status filter and risk class options in the decision modal from metadata.
- **CommissionsPage.jsx**: Loads `commission` object metadata; status and
  product type filter options from metadata.

**Pages that cannot be metadata-driven** (by design — not CRUD screens):

- **InsuranceQuotePage.jsx** — actuarial calculator with computation logic,
  PDF generation, and quote comparison. Not a Module > Object > Fields
  CRUD screen.
- **AgentWorkbenchPage.jsx** — cross-object dashboard aggregating renewals,
  compliance, and tasks from multiple entities. Not a single-object view.

#### Backend — Seed Data Enhancements

- Added `show_in_list: true` config to key fields across all existing
  insurance objects (application, policy, claim, underwriting_case,
  commission) to enable metadata-driven table column rendering.

#### Frontend — Code Quality & Deduplication

- **Shared `formatters.js` utility** (`src/utils/formatters.js`): Extracted
  duplicate formatter functions (`fmtCurrency`, `fmtDate`, `fmtDateTime`,
  `fmtPct`, `formatSize`, `contactName`) that were copy-pasted across 7
  insurance pages into a single shared module. All 7 pages now import from
  this utility instead of defining local copies.
- **Shared `metadata-helpers.js` utility** (`src/utils/metadata-helpers.js`):
  Extracted metadata-driven helpers (`statusVariant`, `fieldLabel`,
  `fieldOptions`, `optionLabel`) used by DeclarationPage and
  DocumentCollectionPage into a reusable module.
- **Removed unused imports**: `FormRenderer`, `metadataService`, `AlertCircle`
  removed from DeclarationPage; `AlertCircle` removed from
  DocumentCollectionPage.
- **Removed dead code**: Unused `requiredCount` variable in
  DocumentCollectionPage's `DocumentChecklist` component.
- **Fixed ESLint warnings**: Wrapped `handleResend` (DeclarationPage),
  `handleApprove`, and `handleDownload` (DocumentCollectionPage) in
  `useCallback` to satisfy `react-hooks/exhaustive-deps` rule.
- **ESLint result**: 0 errors, 0 warnings across all 7 insurance pages.

#### Services — API Integration

- **10 new service methods** added to `insurance.service.js`:
  - Declarations: `listDeclarations`, `getDeclaration`, `sendDeclarations`,
    `updateDeclaration`, `resendDeclaration`
  - Document Collection: `listApplicationDocuments`,
    `getApplicationDocument`, `uploadApplicationDocuments`,
    `reviewApplicationDocument`, `downloadApplicationDocument`

---

## [4.0.2] — 2026-04-05

### Added (4.0.2)

#### Backend — Underwriter Operational Permission

- **`assertCanDecideUnderwriting` method** added to `PermissionService`.
  Admins (roles at or below `ADMIN_THRESHOLD`) bypass the DB check automatically.
  All other roles require an explicit `operational_permissions` row with
  `entity_type = 'underwriting'` and `edit_scope != 'none'`.
- **Underwriting route guards**: `PATCH /api/insurance/underwriting/:id` and
  `POST /api/insurance/underwriting/:id/decision` now call
  `permSvc.assertCanDecideUnderwriting` before executing. A `manager` or `user`
  without the underwriting operational permission receives a **403** with the
  message *"Your role does not have underwriting decision authority. Contact
  your administrator."*
- **`PermissionService` injected into insurance routes**: `insurance/index.js` now
  instantiates `PermissionService` alongside the existing domain services.

#### Database — Seed

- **Underwriter permission seeded for `admin`**: `seed.js` upserts an
  `operational_permissions` row — `entity_type = 'underwriting'`, `role_name =
  'admin'`, all scopes set to `all` — so the default admin login can make UW
  decisions immediately after seeding with no manual configuration.

#### Documentation

- **`PERMISSIONS_AND_ROLES.md`**: Added section *3a. Underwriting Decision
  Authority* documenting the `underwriting` entity type, the bypass rule, the
  seeded default, and how to grant the permission to additional roles.
  Updated `operational_permissions` table definition to include `underwriting`
  as a valid `entity_type` and corrected the unique index note to include
  `tenant_id`.

---

## [4.0.1] — 2026-04-05

### Changed (4.0.1)

#### Frontend — Code Quality & Performance

- **Zero lint warnings**: ESLint now produces 0 errors and 0 warnings
  (reduced from 103 warnings). Changes across ~35 files:
  - Removed redundant `import React` (JSX transform handles it) in 24 files
  - Removed ~50 unused icon/component/hook imports
  - Fixed `react-hooks/exhaustive-deps` violations in `GlobalSearch`,
    `EmailComposeModal`, `ModulePage`, `RecordFormPage`,
    `EmailTemplateBuilderPage`
  - Fixed `no-unused-vars` across builder and runtime pages
  - Added `eslint-disable-next-line` for intentional dep-array patterns
    (object-change-only useEffect triggers)
- **Stable `useMemo` deps**: Replaced `|| []` logical expressions in
  deps arrays with `useMemo`-wrapped derivations in `ModulePage`,
  `RecordFormPage`, and `EmailTemplateBuilderPage` to eliminate
  unnecessary re-renders.
- **`INSURANCE_ROUTES` moved to module scope**: Constant was being
  recreated on every render of `ModulePage`; now defined once at
  module level.
- **Route code splitting**: All 40+ page components in `App.jsx`
  converted to `React.lazy()` with a top-level `Suspense` boundary.
  Each route now loads as a separate chunk, shrinking the initial
  bundle significantly.
- **Vite `manualChunks`**: Added `vendor-icons` chunk for
  `lucide-react` to ensure consistent named splitting.

#### Backend — Carrier Adapter Maturity

- **`CarrierAdapterConfig` model**: New Prisma model and migration
  (`20260405_carrier_adapter_config`) adds per-carrier adapter
  configuration persisted in the `carrier_adapter_configs` table.
  Fields: `adapter_type` (simulated | api | disabled),
  `api_base_url`, `api_key_env_var` (env-var name, never the value),
  `timeout_ms`, `is_enabled`, `environment`, `supported_products`,
  `health_status`, `health_detail`.
- **3-priority adapter loading**: `RatingAdapterRegistry.loadCarriersFromDb`
  now resolves each carrier using: (1) DB `CarrierAdapterConfig` row,
  (2) legacy `CARRIER_{CODE}_API_KEY` + `_API_URL` env vars, (3)
  auto-simulated fallback derived from AM Best rating.
- **`AM_BEST_RATE_FACTORS` constant**: Moved from inline object inside
  `_rateFactorFromRating()` to frozen module-level constant — allocated
  once, not per call.
- **New insurance routes**:
  - `GET /api/insurance/carriers/:carrierCode/adapter-status` — returns
    live adapter metadata + DB config state including whether the
    `api_key_env_var` resolves in the current environment.
  - `PUT /api/insurance/carriers/:carrierCode/adapter-config` — upserts
    `CarrierAdapterConfig`; validates that API adapter type requires an
    env-var name; forces registry re-initialization on next request.
- **`insurance.service.js`**: Added `getCarrierAdapterStatus` and
  `updateCarrierAdapterConfig` frontend service methods.
- **`rating-adapter.test.js`**: New test file (17 tests) covering all
  adapter classes (`InternalRatingAdapter`, `SimulatedCarrierAdapter`,
  `CarrierApiAdapter`) and all 3 `loadCarriersFromDb` config paths.

#### Tests

- **16 suites, 228 tests — all green** (up from earlier session baselines).
  New `rating-adapter.test.js` adds 17 tests; no regressions.

---

## [4.0.0] — 2026-04-05

### Added (4.0.0)

Major upgrade from insurance-themed CRM to production-depth
insurance CRM/AMS, closing 6 priority gaps identified against
Salesforce Insurance, AgencyBloc AMS+, Applied Epic, and
Guidewire InsuranceSuite.

#### P0: Production Rating Architecture

- **RatingAdapter pattern**: New adapter interface
  (`backend/src/services/rating-adapter.js`) with
  `InternalRatingAdapter` wrapping the existing CSO-based engine
  and `CarrierApiAdapter` placeholder for future carrier API
  integrations. `RatingAdapterRegistry` resolves the appropriate
  adapter per carrier.
- **QuoteScenario persistence**: New `quote_scenarios` table
  stores every rated quote with full input params, output results,
  rate source metadata, and validity window. Quotes are
  auto-persisted on `/calculate-quote` and `/compare-quotes`.
- **Comparative quoting**: Comparison groups link related
  scenarios via `comparison_group` field.
- **Scenario lifecycle**: `active` -> `expired` | `converted`.
  Convert links scenario to application.
- **Calculation engine reclassified**: Removed "mock" label.
  Engine uses 2017 CSO mortality tables, expense loading, rider
  pricing, and cash value projections — production-quality for a
  CRM/AMS.

#### P1: Compliance & Submission Pack

- **ComplianceArtifact model**: Tracks SOA, consent, attestation,
  e-signature, and disclosure artifacts linked to contacts,
  applications, and policies. Status: pending -> completed |
  expired | waived. Includes signature metadata (signed_by, IP),
  regulatory retention deadline.
- **SubmissionChecklist model**: Per-application checklist with
  document, compliance, info, and signature item types. Tracks
  received/waived status with document linking.
- **Submission readiness API**: `GET /applications/:id/
  submission-readiness` returns `{ ready, completed, pending }`
  for workflow gates.
- **Frontend integration**: ApplicationsPage detail modal now
  shows compliance artifacts + submission checklist with inline
  add/complete/waive actions and a readiness progress bar.

#### P2: Policy Servicing & Billing

- **PolicyEndorsement model**: Tracks policy modifications
  (beneficiary change, coverage increase/decrease, rider
  add/remove, etc.) with approval workflow and premium impact.
  Endorsements flow: pending -> approved -> applied | rejected.
- **RenewalTask model**: Renewal workbench with agent assignment,
  outreach tracking, and status progression (upcoming ->
  in_progress -> renewed | lapsed | not_renewing).
- **BillingSchedule + PolicyInvoice + PolicyPayment**: Three-tier
  billing lifecycle. Schedule defines frequency and amount;
  invoices generated per billing period; payments recorded against
  invoices with method tracking.
- **PoliciesPage enhancement**: Detail modal now has
  "Endorsements" and "Billing" tabs with inline CRUD.

#### P3: Claims Ops Enhancement

- **FNOL fields**: InsuranceClaim extended with reporter_name,
  reporter_phone, reporter_relationship, loss_date,
  loss_location, loss_description, fnol_received_at.
- **ClaimReserve model**: Reserve tracking with initial set +
  adjustments + release. Running total maintained automatically.
  Timeline events auto-created.
- **ClaimPaymentEvent model**: Payment events (partial,
  settlement, final, recovery) with payee tracking. Claim
  paid_amount auto-summed from all payments.
- **Fraud/litigation flags**: is_fraud_flagged, is_litigation,
  litigation_details on InsuranceClaim. Fraud flag toggle creates
  timeline event.
- **Adjuster work queue**: `GET /claims/adjuster-queue` returns
  open claims for an adjuster with reserve/payment summaries,
  sorted by priority.
- **ClaimsPage enhancement**: FNOL fields in create modal,
  reserve section, fraud badges, adjuster queue view.

#### P4: Producer / Carrier Operations

- **ProducerAppointment model**: Per-agent, per-carrier,
  per-state appointment tracking with license number/type,
  appointment status, and expiry.
- **CommissionStatement model**: Carrier statement ingestion
  for reconciliation. Expected vs actual totals with variance.
  Reconciliation matches statement to commission entries.
- **CommissionEntry enhanced**: Added commission_type
  (first_year | renewal | override | bonus), expected_amount,
  variance, and statement_id link.
- **CommissionsPage enhancement**: Three-tab view
  (Commissions | Statements | Appointments) with statement
  reconciliation and appointment management.

#### P5: Agent Renewal & Compliance Workbench

- **AgentWorkbenchPage**: New dashboard at `/insurance/workbench`
  combining renewal tasks and compliance artifacts for the
  logged-in agent.
- Summary stats: renewals due 30d/90d, compliance pending/overdue.
- Renewal task table with "Start Renewal" and "Contact" actions.
- Compliance artifact table with "Complete" and "Waive" actions.
- Sidebar navigation entry under Insurance section.

#### Database

- 12 new Prisma models: QuoteScenario, ComplianceArtifact,
  SubmissionChecklist, PolicyEndorsement, RenewalTask,
  BillingSchedule, PolicyInvoice, PolicyPayment, ClaimReserve,
  ClaimPaymentEvent, ProducerAppointment, CommissionStatement.
- 2 existing models modified: InsuranceClaim (FNOL + reserve +
  fraud fields), CommissionEntry (type + expected + variance +
  statement link).
- All new models follow existing patterns: tenant_id,
  @@index([tenant_id]), @@map("snake_case"), reverse relations
  on Tenant/Employee/InsuranceCarrier/etc.

#### Test Coverage (4.0.0)

- 12 new test cases for P0-P4 features in
  insurance-domain.test.js (31 total, all passing).
- Rating adapter registry tests.
- Fixed pre-existing CRM test mock issue (missing
  uiPipelineStage).

### Changed (4.0.0)

- `POST /insurance/calculate-quote` now auto-persists quotes as
  QuoteScenario records and returns `scenario_id`/`scenario_ref`.
- `POST /insurance/compare-quotes` persists all quotes in a
  comparison group.
- CalculationEngineService is no longer labeled "mock" — the
  engine is production-quality for a CRM/AMS context.

---

## [3.3.0] — 2026-04-05

### Added (3.3.0)

#### Kanban Pipeline Automation (Drag-and-Drop Triggers)

Pipeline stage changes via Kanban drag-and-drop now auto-trigger
the same insurance domain actions as clicking the explicit action
buttons. This creates a fully automated flow where moving a card
to a lane is equivalent to pressing the corresponding button.

| Module | Stage Dragged To | Auto-Action Triggered |
| ------ | ---------------- | --------------------- |
| Prospects | Converted | Auto-converts lead to client — creates Account + Contact, copies EAV fields |
| Applications | Under Review | Auto-creates underwriting case (same as "Send to UW" button) — creates UW record + EAV, navigates to Underwriting |
| Applications | Pending Medical | Syncs status to `insurance_applications` + EAV |
| Applications | Declined | Syncs status to `insurance_applications` + EAV |
| Claims | Any valid status | Syncs status to `insurance_claims` via `updateClaim()` + EAV |

Implemented in `PATCH /api/runtime/records/:id/stage` (backend `routes/runtime/index.js`).
The response now includes an `automation` object:
`{ action: 'lead_converted' | 'sent_to_underwriting' | 'status_synced' | 'claim_status_synced', error?: string }`.

Frontend `ModulePage.jsx` `moveStage` mutation's `onSuccess`
handler reads the automation result and auto-navigates to the
appropriate module (Clients after conversion, Underwriting after
UW case creation).

#### Intra-Module Data Flow Fixes

- **EAV field mapping on lead conversion**: Prospect EAV fields
  are now properly mapped to client field names during conversion
  (e.g., `lead_status`, `rating`, `preferred_product` are dropped;
  shared fields like `date_of_birth`, `smoker_status`, `occupation`
  carry over). `client_since` auto-populated with today's date.
- **InsuranceApplication `submitted_at`**: The insurance domain
  bridge now sets `submitted_at` from the form's `submitted_date`
  field (or defaults to now), fixing the guard in
  `convertToUnderwriting()` that requires the app to be in
  `submitted` status.
- **Policy issuance pipeline sync**: `issuePolicy()` now syncs the
  application's CRM pipeline stage to `issued` via
  `#syncPipelineStage()`.
- **CRM Record + EAV auto-creation for domain objects**: New
  `#createRecordWithEav()` helper on `InsuranceDomainService` that
  creates a `Record` anchor + typed EAV field values + auto-resolves
  pipeline stage from status. Called during:
  - `convertToUnderwriting()` — creates UW case module record
  - `issuePolicy()` — creates policy module record (with
    policyholder name from contact) and commission module record
    (with agent display name)
- **Lead conversion navigation**: After converting a prospect, the
  UI now navigates to the Clients module and invalidates all record
  caches so the new client appears immediately.

#### Seed Data Improvements

- **Pipeline stages aligned with domain statuses**:
  - Application pipeline: added `pending_medical` (stage 3) and
    `issued` (stage 6) — now 6 stages matching all domain statuses
  - Claims pipeline: added `closed` (stage 6) — now 6 stages
  - Claim UI select options: added `closed`
- **Application UI select options**: Changed `medical_exam` to
  `pending_medical` to match domain; added `issued`
- **Policy UI select options**: Added `pending` status
- **Fixed mismatched seed values**: Quote status `sent` →
  `presented`; claim type `waiver_of_premium` → `disability`;
  smoker status values aligned (`non_smoker` → `never`, etc.)
- **Complete EAV coverage**: All module list views now show data
  instead of "--" — every UI field has a corresponding EAV row in
  the seed for all 8 objects (Prospect, Client, Quote, Application,
  Policy, Claim, Underwriting Case, Commission)
- **Commission agent names**: EAV `agent_name` field now stores
  employee display names instead of raw IDs
- **Prisma migrations squashed**: 23 migration files consolidated
  into a single `init` migration

### Changed (3.3.0)

- `PATCH /api/runtime/records/:id/stage` endpoint now returns
  `{ ...record, automation: { action, error? } }` instead of just
  the record, to communicate pipeline automation results to the
  frontend.

---

## [3.2.0] — 2026-04-05

### Added (3.2.0)

#### Automatic Pipeline Stage Sync (Kanban)

Every insurance domain status change now auto-updates the
corresponding CRM record's pipeline stage, so Kanban boards
reflect real-time processing status across all modules:

| Operation | Module | Stage Change |
| --------- | ------ | ------------ |
| Convert Lead | Prospects | → Converted |
| Send to UW | Applications | → Under Review |
| UW Approve | Applications | → Approved |
| UW Decline | Applications | → Declined |
| Submit Quote | Quotes | → Presented |
| Approve Quote | Quotes | → Accepted |
| Reject Quote | Quotes | → Declined |
| Claim status change | Claims | → matches status |

Implemented via `InsuranceDomainService.#syncPipelineStage()` — a
reusable helper that looks up the pipeline stage by name for the
record's object and updates `pipeline_stage_id`. Called inside
each `$transaction` so the stage update is atomic with the domain
status change. Also added to `CrmService.convertLead()` for
prospect → "converted" stage sync, and
`QuoteService.updateQuoteStatus()` with a status-to-stage name
map (`sent`→`presented`, `accepted`→`accepted`, etc.).

Pipeline component now shows an "Unsorted" column for records
without a pipeline stage, preventing records from being invisible
in Kanban view.

#### End-to-End Inter-Module Connectivity

Complete prospect-to-policy journey with one-click action buttons
that carry data forward between modules:

- **Prospect → Client**: "Convert" button in side panel creates
  Account + Contact + Opportunity. All EAV fields (DOB, gender,
  smoker status, income, etc.) bulk-copied to client record via
  `createMany`.
- **Client → Quote Engine**: "Get Quote" button in side panel
  navigates to `/insurance/quotes` with URL params (age, gender,
  smoker status, health class, coverage interest). Quote Engine
  pre-fills form via `useSearchParams`.
- **Quote Engine → Application**: "Apply Now" button appears after
  premium calculation. Creates `insurance_application` with product
  type, coverage, premium, age, gender, smoker status, and linked
  contact. Backend resolves `contact_record_id` to `crm_contacts.id`.
- **Policy → Claim**: "File Claim" button (amber icon) on active
  policy rows and detail modal. Navigates to `/insurance/claims`
  with `policy_id` and `amount` as URL params. Claims page
  auto-opens pre-filled create modal.
- **Policy → Commission**: Auto-created at policy issuance
  (already existed, now documented in the connected flow).

#### Insurance Domain Bridge & Wizard Integration

- **CRM ↔ Insurance auto-sync**: When a CRM Application record
  (MODULES > Applications) is created or saved, the
  `RecordService.#syncInsuranceDomain()` bridge auto-upserts the
  corresponding `insurance_applications` row. Bridge check runs
  BEFORE the CRM_FIELDS check so insurance objects are intercepted
  correctly. Uses `Promise.allSettled` so EAV save and domain sync
  don't block each other.
- **Apply Now → 5-Step Wizard**: "Apply Now" on the Quote Engine
  now creates a CRM record pre-filled with quote data, then opens
  the Life Insurance Application wizard (Personal → Health →
  Coverage → Beneficiary → Review). Wizard fields are pre-populated
  from the quote (name, email, gender, smoker, coverage, product).
- **Wizard updates existing record**: `WizardPage` accepts
  `?record_id=N` URL parameter. When present, wizard completion
  updates the existing record instead of creating a new one.
  Flat `defaultValues` (from record EAV) are distributed to all
  wizard steps via `WizardRenderer` enhancement.
- **Post-wizard redirect**: After submitting the wizard for an
  insurance application, user is auto-redirected to INSURANCE >
  Applications after a 2-second success message.
- **"Process" / "Manage" buttons**: CRM module side panel shows
  context-aware action buttons for insurance objects (Application
  → "Process", Policy → "Manage", Claim → "Process") that navigate
  to the corresponding INSURANCE operations page.
- **Save Changes redirect**: Saving an insurance object in the CRM
  module form (RecordFormPage) auto-redirects to the corresponding
  INSURANCE page instead of back to the module list.

#### Performance & Reliability

- **Global transaction timeout**: Increased Prisma interactive
  transaction timeout to 30s (from default 5s) for remote RDS
  latency via `transactionOptions` on PrismaClient.
- **Tenant context fallback**: Added `prisma._requestTenantId`
  set from Fastify `preHandler` as fallback when AsyncLocalStorage
  `enterWith()` doesn't propagate across hook boundaries.
- **Batched seed execution**: Replaced `Promise.all` with
  `batchRun()` helper (batch size 5) in `createFields` and
  `createForm` to prevent RDS connection drops during seeding.
- **Frontend timeout**: Increased axios timeout to 60s for
  remote database operations.

### Fixed (3.2.0)

- **Prospect object not mapped to CRM lead**: Object name
  `prospect` was not in `CRM_FIELDS` or `modelMap`, so prospect
  form data went to EAV only (no `crm_leads` row). Added
  `prospect` as alias for `lead` in both maps.
- **Audit log / round-robin tenant_id missing**: `#audit()`,
  `#roundRobin()`, `#applyAssignment()` relied on
  AsyncLocalStorage which didn't propagate in Fastify. Added
  explicit `tenant_id` parameter passing and `getTenantId()`
  fallback.
- **EAV overflow fields silently dropped**: `#upsertCrmEntity`
  only saved fields matching `CRM_FIELDS` to the CRM table;
  extra fields (insurance-specific) were lost. Now saves
  overflow fields to EAV in parallel with CRM entity write.

---

## [3.1.3] — 2026-04-04

### Fixed (3.1.3)

#### Form Fields Disabled for Non-Admin Roles

- **All form fields read-only for non-admins** —
  `MetadataService.getFormForViewer()` defaulted `can_edit` to `false`
  when no explicit `ui_permissions` row existed for a field. Since no
  field-level permissions were seeded, every field got
  `always_disabled: true` injected for non-admin roles (manager, user).
  Changed the default to `true` — fields are now editable unless
  explicitly restricted via a permission row.

#### Missing Data in CRM List/Table Views

- **No EAV field values seeded for insurance records** — The seed
  created `record` anchors for applications, policies, claims, etc.
  and wrote data to the insurance domain tables, but never wrote
  corresponding `record_field_values` entries. The metadata-driven
  `ModulePage` tables showed `--` for every column. Added `seedEav()`
  helper that writes EAV rows matching each object's form fields.
- **Account records polluting Client list** — `crm_account` records
  (companies) were created with `object_id = clientObject.id`, making
  them appear in the Client table alongside contacts. Account fields
  (`name`, `industry`) don't match the Client form (`first_name`,
  `last_name`), so they rendered as `--`. Moved account record anchors
  to the `prospect` object so they no longer appear in Client views.
- **Extra policy/claim records using wrong object_id** — Additional
  policy and claim records were seeded with
  `object_id: applicationObject.id` instead of `policyObject.id` /
  `claimObject.id`. Fixed to use the correct object for each type.

#### Edit Form Data Not Populating

- **Single-record hydration missing EAV fields** —
  `RecordService.#hydrateCrm()` only returned CRM entity columns
  (e.g. `first_name`, `email`) but ignored custom EAV fields stored
  in `record_field_values` (e.g. `smoker_status`, `coverage_interest`,
  `health_notes`). Forms use a mix of both, so all custom fields
  appeared blank when editing. Now merges EAV + CRM data with the
  same non-null-wins strategy used by `#hydrateMany()`.
- **Date fields blank on edit** — HTML `<input type="date">` expects
  `YYYY-MM-DD` format but the backend returns full ISO strings like
  `2026-04-04T00:00:00.000Z`. `FormRenderer` now coerces date and
  datetime values to the correct HTML input format before calling
  `reset()`.

---

## [3.1.2] — 2026-04-04

### Fixed (3.1.2)

#### Critical Fixes

- **CRM/EAV field merge data loss** — `RecordService.#hydrateMany()`
  was merging CRM fields over EAV fields via object spread, causing
  null CRM columns to overwrite valid EAV data (e.g. `date_of_birth`,
  `smoker_status`). Now only applies non-null/non-empty CRM fields.
- **Quote number race condition** — `QuoteService.#generateQuoteNumber()`
  ran outside the `$transaction`, allowing concurrent requests to
  generate duplicate quote numbers. Now runs inside the transaction.
- **Death benefit Option A calculation** — Illustration engine
  calculated death benefit as `faceValue + cashValue * 0.0`, which
  always equalled face value. Fixed to increase death benefit when
  cash value exceeds face amount (IRC Section 7702 corridor).
- **Comparison table crash** — `InsuranceQuotePage` comparison table
  used unsafe fallback `(comparisonResult.quotes || comparisonResult || [])`
  which could pass a non-array to `.map()`. Now uses `Array.isArray()`.
- **`parseInt` missing radix** — `QuoteService` used `parseInt(parts[2])`
  without radix parameter. Fixed to `parseInt(match[1], 10)`.

#### Hardening & Observability

- **Silent failure logging** — `RecordService.#audit()`,
  `InsuranceDomainService.#policyStatusChange()`, and auto-commission
  creation now log warnings instead of silently swallowing errors.
- **Date validation** — `RecordService.#upsertCrmEntity()` now validates
  `close_date` and `birthdate` values before coercing with `new Date()`.
  Invalid dates are silently skipped instead of creating `Invalid Date`.
- **Tenant ID enforcement** — Insurance route `tenantId()` helper now
  throws a 403 error if `tenant_id` is missing from the auth context,
  preventing accidental cross-tenant data leaks.
- **Compare-quotes input validation** — `POST /compare-quotes` now
  returns 400 if `req.body.quotes` is not an array, instead of
  crashing with an unhandled type error.
- **Redis scan safety** — `seed.js` Redis SCAN loop now has a
  10,000-iteration guard to prevent infinite loops if cursor format
  changes.

---

## [3.1.1] — 2026-04-04

### Fixed (3.1.1)

#### Critical Bug Fixes

- **`#nextSeq` sequence number generation** — Was using `MAX(id)+1`
  instead of parsing the sequence number from the generated field
  (e.g. `POL-2026-000042`). Now parses the trailing digits from the
  latest matching record, preventing sequence collisions across models.
- **Cash value projection premiums** — `normalizeQuoteResult()` in
  `InsuranceQuotePage` calculated `premiumPaid` as `year * annual`,
  which was incorrect for milestone-based projections (years 5, 10,
  15...). Now correctly accumulates premium across gaps between
  projection milestones.
- **Underwriting case update race condition** — `updateUnderwritingCase`
  updated the UW case and propagated the decision to the application
  in separate database calls. Wrapped both in a `$transaction` to
  ensure atomicity.

#### Security Fixes

- **XSS in template engine** — `kvSection()` and `disclaimerBlock()` in
  `template-engine.service.js` were not escaping user-provided values.
  Client names, addresses, and other user data could inject HTML into
  rendered PDF documents. All values now pass through `escapeHtml()`.

#### Optimization & Hardening

- **Mortality table boundary handling** — Calculation engine now
  extrapolates mortality rates for ages above 85 using exponential
  growth from the last two table entries (capped at 1000 per 1000),
  and linearly interpolates for fractional ages.
- **Async PDF temp file cleanup** — `html-to-pdf.js` now uses
  `fs/promises` for writing, reading, and cleaning up temp files,
  preventing potential race conditions in the `finally` block.
- **Input validation on insurance routes** — Added `requireFields()` and
  `requirePositiveNumber()` validation on `POST /policies`,
  `POST /applications`, `POST /claims`, `POST /commissions`, and
  `POST /underwriting/:id/decision`. Invalid requests now return 400
  instead of causing Prisma validation errors.
- **Shared error handler** — Insurance routes now have a
  `setErrorHandler` that propagates `statusCode` from service errors
  instead of returning 500 for all failures.
- **Clawback reason required** — `ClawbackModal` in `CommissionsPage`
  now requires a non-empty reason before submission, ensuring audit
  trail completeness.
- **Duplicate UW decision prevention** — Approve/Decline buttons in
  `UnderwritingPage` are now disabled while a decision is being saved,
  preventing accidental double-submissions.

---

## [3.1.0] — 2026-04-05

### Added (3.1.0)

#### HTML-to-PDF Email Pipeline

- **`backend/src/utils/html-to-pdf.js`** — New utility that converts an HTML
  string to a real PDF buffer using Chrome headless (`--headless=new
  --print-to-pdf`). Detects Chrome from the `CHROME_EXECUTABLE` environment
  variable or a list of well-known paths (macOS, Linux, Windows). Returns
  `null` when Chrome is unavailable so callers can fall back gracefully.
- **`POST /api/email/send-with-pdf`** — New email route that accepts
  `{ pdf_html, pdf_filename?, extra_attachments?, ... }`, converts the HTML
  to a PDF via Chrome headless, attaches it (or falls back to HTML inline),
  and sends via nodemailer. Accepts an `extra_attachments` array of
  `{ filename, content_base64, content_type }` objects so drag-dropped files
  are included in the outgoing message.
- **`sendRaw` attachment support** — `EmailSendService.sendRaw()` now accepts
  an `attachments` array in nodemailer format and passes it through to
  `transporter.sendMail`.

#### PDFViewer Improvements

- **Inline viewer in InsuranceQuotePage** — "Quote PDF" and "Policy
  Illustration" buttons now render the document *inside* a full-featured
  `PDFViewer` panel (with zoom, print, email, fullscreen, and outline
  sidebar) instead of opening a plain new tab. The viewer appears directly
  below the action buttons as soon as the document is ready.
- **Drag-drop files included in email** — Files dropped onto the PDFViewer
  sidebar are now converted to base64 on the client and sent as
  `extra_attachments` to `POST /api/email/send-with-pdf`. The backend
  attaches them alongside the PDF in the outgoing message.
- **Extra-attachments indicator** — `DocumentEmailModal` now shows an amber
  badge listing every drag-dropped file that will be included in the email,
  so agents can confirm what attachments will be sent before clicking
  *Send Email*.

### Fixed (3.1.0)

- **`DocumentEmailModal` 404 on send** — The component was posting to
  `/email/send-document` (non-existent route). Fixed to use
  `/email/send-with-pdf` so recipients receive a real PDF attachment.
- **Email Client 404** — The *Email Client* button on InsuranceQuotePage
  posted to `/api/email/send-document` (double `/api` prefix + wrong path).
  Fixed to render the quote HTML then call `/email/send-with-pdf`,
  so the client receives an actual PDF rather than raw HTML.
- **`getProducts` / `getRiders` not arrays** — Both service methods were
  returning the raw `ok()` wrapper object instead of the inner array.
  Fixed to unwrap `r.data?.data?.products` / `r.data?.data?.riders`.
- **`calculateQuote` 500 error** — The submit payload used camelCase flat
  fields; the backend expects snake_case with a nested `applicant` object.
  Fixed `onSubmit` and used `watchProductType` (RHF watch) as the
  authoritative source for `product_type`.
- **Quote details showing `--`** — The raw backend response is nested
  snake_case but display components expect flat camelCase. Added
  `normalizeQuoteResult()` to map the response before setting state.
- **PDF/Illustration `onSuccess` ignored** — Handlers were trying to read
  `.url` / `.pdfUrl` on an HTML string. Fixed to store the string directly
  in state for the inline PDFViewer.
- **Error alert reading** — Fixed the error path from
  `response.data.message` to `response.data.error?.message` (correct nested
  structure for Fastify error responses).

---

## [3.0.1] — 2026-04-04

### Fixed (3.0.1)

#### Critical Bug Fixes and Stabilization

- **TemplateEngineService export mismatch**: Changed
  `module.exports = { TemplateEngineService }` to
  `module.exports = TemplateEngineService` so the insurance route module
  can instantiate the class. All 7 template API routes were broken.
- **WizardRenderer hooks-after-returns violation**: Moved all
  `useCallback`/`useMemo` hooks above the early-return guards so React's
  Rules of Hooks are never violated. Previously the component would crash
  when the wizard data was loading.
- **InsuranceQuotePage PDFViewer prop**: Changed `url=` to `content=` on
  all three `<PDFViewer>` instances (quote PDF, illustration, comparison)
  since the component's interface only accepts `content`.
- **Email mutation endpoint**: The "Email Client" button was calling
  `renderQuoteSummary` (PDF generation) instead of actually sending an
  email. Fixed to first render the quote HTML, then POST to
  `/api/email/send-document`.
- **Custom validators silently overwritten**: Auto-sanitization logic in
  `buildValidationRules()` was replacing any existing `custom` validator
  function. Fixed by wrapping existing function validators into the
  validation object before merging sanitizers.

#### High-Priority Fixes

- **Calculation engine memory leak**: The in-memory quote store
  (`Map`) grew without bound. Added a 1 000-entry cap with LRU-style
  eviction (oldest entry deleted first).
- **Cash value mortality mismatch**: `#projectCashValues` was using raw
  base mortality rates instead of gender/smoker/health-class-adjusted
  rates, causing inaccurate illustrations. Now calls `#getMortalityRate`
  with the applicant object.
- **IRR NaN guard**: Newton-Raphson loop in `#estimateIRR` could produce
  `NaN` if the guess went negative. Added `isNaN` break guard and
  fallback return of `0`.
- **Division-by-zero guard**: Protected percentage-of-premium calculation
  in cash value projections against `grossAnnualPremium === 0`.
- **Industry template object name**: Changed `object_name: 'case'` to
  `object_name: 'claim'` in the Claims Filing email template to match
  the seed data object name.
- **Seed clearDatabase() missing tables**: Added 11 tables that were
  missing from the clear list: `assignment_rules`, `round_robin_states`,
  `assignment_logs`, `workflow_pending_steps`, `ui_permissions`,
  `operational_permissions`, `record_field_values`, `quotas`,
  `import_jobs`, `integration_logs`, `integrations`. Re-seeding no
  longer fails with constraint violations.

#### Medium-Priority Fixes and Optimizations

- **PDFViewer blob URL leak**: `URL.createObjectURL` was called inline
  in JSX on every render for dropped-file previews. Replaced with a
  state-managed Map that creates URLs in a `useEffect` and revokes them
  in the cleanup function.
- **PDFViewer email timeout leak**: `setTimeout` for auto-closing the
  email modal after success was never cleared on unmount. Added `useRef`
  storage and cleanup `useEffect`.
- **PDFViewer dead DnD import**: Removed `useDroppable` from
  `@dnd-kit/core` since the component uses native HTML5 drag events and
  has no `DndContext` ancestor.
- **Unused imports removed**: Cleaned up 10 unused lucide-react icon
  imports across PoliciesPage (3), ApplicationsPage (1),
  ClaimsPage (2), UnderwritingPage (2), CommissionsPage (2).
- **Invalid Tailwind classes**: Replaced non-standard `h-4.5`/`w-4.5`
  with `h-[1.125rem]`/`w-[1.125rem]` in InsuranceQuotePage (3 spots).
- **Responsive grid**: Changed `grid-cols-6` to `grid-cols-3 md:grid-cols-6`
  in UnderwritingPage risk summary cards for mobile usability.
- **Memoized stat computations**: PoliciesPage stats (active count,
  total coverage, avg premium, expiring soon) now use `useMemo` instead
  of recomputing on every render.
- **Dynamic import warning**: Converted dynamic `import('../../services/api')`
  in InsuranceQuotePage email mutation to a static top-level import,
  eliminating the Vite build warning.

### Build Verification

- Frontend: `vite build` passes with **0 errors, 0 warnings**
- Backend: All 4 new service/route modules parse without errors

---

## [3.0.0] — 2026-04-04

### Added (3.0.0)

#### Life Insurance CRM Reconfiguration

Complete platform reconfiguration targeting the Life Insurance industry,
following CRM standards set by industry leaders (Salesforce Financial
Services Cloud, AgencyBloc, Applied Epic).

#### New Modules (8 Insurance-Specific Modules)

- **Prospects**: Lead management with insurance-specific fields (DOB, smoker
  status, coverage interest, preferred product, annual income)
- **Clients**: Policyholder management with SSN, health class, beneficiary,
  marital status, dependents
- **Quotes**: Quote generation integrated with the calculation engine, with
  pipeline tracking (Draft to Presented to Accepted/Declined)
- **Applications**: Insurance application processing with 5-step wizard,
  medical exam tracking, underwriting status pipeline
- **Policies**: Active policy management with cash value, payment tracking,
  beneficiary info, status pipeline
- **Claims**: Claims processing with claim types (death/disability/critical
  illness/accidental), document checklist, adjuster assignment
- **Underwriting**: Risk assessment queue with health class, medical history,
  risk factors, decision workflow
- **Commissions**: Agent commission tracking with rates, clawback status,
  period tracking

#### Calculation Engine (Mock)

- New backend service `calculation-engine.service.js` that mimics actual
  insurance premium calculation engines
- Supports 6 product types: Term Life, Whole Life, Universal Life, Variable
  Life, Indexed Universal Life, Final Expense
- Actuarial-style calculations using 2017 CSO mortality approximation,
  gender/smoker/health-class adjustments, expense loading, profit margins
- Returns: base premium, rider premiums, total across all payment
  frequencies, cash value projections, surrender values, policy fee
  breakdown
- Methods: calculateQuote, compareQuotes, getIllustration,
  getAvailableProducts, getAvailableRiders
- 7 riders: Waiver of Premium, Accidental Death, Child Term, Guaranteed
  Insurability, Return of Premium, Chronic Illness, Long-Term Care
- API routes at `/api/insurance/*` wired into app.js

#### Configurable Template Engine

- New backend service `template-engine.service.js` for rendering
  calculation results into professional document templates
- 7 built-in templates: Quote Summary, Policy Illustration,
  Application Form, Coverage Comparison, Claims Form, Policy Schedule,
  Annual Review
- Each template has structured sections (header, table, key\_value, text,
  signature, checklist, disclaimer)
- Renders print-ready HTML with inline CSS, page break hints, company
  branding placeholders, regulatory compliance notices
- Convenience methods: renderQuoteSummary, renderIllustration,
  renderApplicationForm, renderComparisonReport

#### PDF Viewer Component

- New `PDFViewer.jsx` component with comprehensive document viewing
- Zoom controls (50%-200%), fit-to-page, fit-to-width
- Page navigation with scroll tracking
- Drag-and-drop file upload (PDF, PNG, JPG) using @dnd-kit
- Full-screen toggle, print, download capabilities
- Built-in email modal with To/CC/BCC, pre-filled subject and body,
  attachment toggle, API integration
- Collapsible sidebar with auto-generated table of contents and file list
- Dark mode compatible

#### Life Insurance Email Templates

- 8 professional email templates for the `life_insurance` industry:
  New Prospect Welcome, Needs Analysis Follow-up, Quote Presentation,
  Application Confirmation, Underwriting Status Update, Policy Delivery,
  Annual Policy Review, Claims Filing Assistance
- Navy blue and forest green color schemes for trust/stability
- Insurance-specific merge variables (policy\_number, coverage\_amount,
  premium\_amount, agent\_name, free\_look\_days, etc.)

#### Insurance Runtime Pages

- **InsuranceQuotePage**: Two-panel quote generation with product
  selector, applicant info, rider selection, premium results, PDF
  generation, product comparison modal
- **PoliciesPage**: Policy listing with status badges, stats row,
  detail modal, annual review and claim filing actions
- **ApplicationsPage**: Application tracking with pipeline
  visualization, status filters, underwriting notes
- **ClaimsPage**: Claims management with priority indicators, timeline,
  document checklist, processing stats
- **UnderwritingPage**: Risk assessment queue with health info, risk
  factor badges, decision actions
- **CommissionsPage**: Commission tracking with agent breakdown, tier
  chart, period filtering

### Changed (3.0.0)

#### Tenant Creation — Life Insurance Only

- Industry dropdown in TenantsPage now restricted to "Life Insurance"
  only; other industries removed pending future reconfiguration
- Default industry pre-selected as `life_insurance`

#### Wizard Strict Validation

- WizardRenderer now enforces strict per-step validation before
  allowing progression to next step
- Validation error summary banner with shake animation shown when
  attempting to proceed with invalid fields
- Step indicators show red warning icon for steps with validation
  failures, green checkmark for validated steps
- FormRenderer now accepts `onInvalid` callback for validation error
  reporting

#### Input Sanitization Validators

- `buildValidationRules()` in helpers.js now auto-applies field-type
  sanitization validators:
  - Email: strict RFC-like pattern enforcement
  - Phone: 7-20 digit format validation
  - URL: must start with http(s)://
  - Number/currency/percentage: numeric validation
  - Currency: non-negative enforcement
  - Percentage: 0-100 range enforcement
  - Date: reasonable date range (1900-2126)
  - SSN: XXX-XX-XXXX format for SSN fields
  - Text: script injection prevention
  - All text fields: leading/trailing whitespace rejection
- Required fields now always enforced via `is_required` flag

#### Sidebar Navigation

- New "Insurance" section with 6 dedicated links: Quote Engine,
  Applications, Policies, Claims, Underwriting, Commissions
- Social Media link removed from Tools section (not relevant to
  insurance CRM)

#### Seed Data

- Complete rewrite of seed.js for Life Insurance context
- 8 modules, 8 objects, 120+ fields with validations
- 5-step Application Wizard
- Agency Dashboard with 3 charts and 4 KPIs
- 4 pipelines (Prospect, Quote, Application, Claims)
- 3 workflows (Auto-assign, Claim notification, Renewal reminder)
- 4 assignment rules
- Demo CRM records: 5 leads, 5 contacts, 3 accounts, 3 opportunities

### Notes

- The calculation engine is a mock implementation. It will be replaced
  by the actual calculation engine by the team in a future release.
- All existing configuration builders (Form, Dashboard, Pipeline,
  Workflow, Wizard, Permissions, Assignment, Email Templates,
  Integrations, Lead Scoring, Social Media, Push Notifications) are
  preserved and enhanced for insurance context — none were removed.
- Each module maps to exactly one business process flow with no
  unnecessary object nesting.

---

## [2.5.0] — 2026-04-03

### Added (2.5.0)

#### Enhanced Quote Form — Full CRM Depth

- **Account & Contact linking**: Quote creation/edit form now includes
  Account and Contact dropdowns populated from CRM data, matching the
  backend's `account_id` and `contact_id` fields.
- **Discount controls**: Added both percentage-based (`discount_percent`)
  and fixed-amount (`discount_amount`) discount fields to the form.
- **Currency selector**: Quote form now includes a currency picker
  (USD, EUR, GBP, CAD, AUD, INR) wired to the backend's `currency`
  field.
- **Billing & Shipping addresses**: Collapsible address sections with
  street, city, state, country, and ZIP fields for both billing and
  shipping. Shows "(filled)" indicator when populated.
- **Quote detail view**: Shows account name, contact name, currency,
  and discount % when present on the quote record.

#### Call Log Analytics Dashboard

- **Analytics card**: New "Call Analytics" section on the Call Logs page
  consuming `GET /call-logs/analytics`. Displays result breakdown
  (answered, no answer, busy, voicemail, wrong number) with counts,
  plus duration statistics (average, longest, total time).
- **Recording URL**: Added recording URL field to create/edit form.
  Call list rows with a recording show a clickable link icon.

#### Lead Score Breakdown Drill-Down

- **Clickable lead rows**: Lead scoring table rows are now interactive;
  clicking a lead opens an inline ScoreBreakdown panel.
- **Rule-by-rule breakdown**: Shows each matched scoring rule with its
  type (Demographic, Behavioral, Engagement), field name, operator,
  value, and point contribution. Color-coded badges for positive/
  negative points.
- **Per-lead recalculate**: Inline recalculate button refreshes a
  single lead's score without bulk-scoring all leads.

---

## [2.4.0] — 2026-04-03

### Added (2.4.0)

#### Custom-Object Search Fix + Tests

- **Fixed runtime-broken custom-object search**: `SearchService`
  queried nonexistent `field_id` column and `field` relation on
  `RecordFieldValue`. Changed to use `field_name` (matching the
- **SearchService test suite**: 11 new tests covering CRM search,
  custom-object search contract (verifying `field_name` usage),
  result shape, limit enforcement, and owner/visibility filtering

#### Quote Line Item Management

- `deleteLineItem` to `runtimeService` (metadata.service.js).
- **Quote detail view**: Clicking a quote row opens a detail view
  item list with add/edit/remove, and product picker that
  auto-fills name and price from the product catalog.
- **Line item editing**: Only available for `draft` status quotes.
- **Frontend tests**: 7 new QuotesPage tests covering list
  rendering, detail view navigation, line item display, Add Item
  button visibility, summary cards, and empty states.

#### Lead Scoring Product Surface

- rule CRUD, score/recalculate per lead, bulk scoring, top leads,
  analytics, distribution, and default rule setup.
- rule management with rule type badges, CrmLead field/operator
  selectors, points configuration, and one-click default setup.
- **Runtime page** (`/lead-scoring`): Scored lead rankings with
  highest score, active rules), grade distribution chart, and
  bulk recalculate action.
- section.

#### Call Log Product Surface

- related record lookup, and analytics.
- **Runtime page** (`/call-logs`): Call log management with
  inbound/outbound stats, direction/search filters, create/edit/
  delete modals with all schema-aligned fields, duration
  formatting, and call result badges.
- **Sidebar navigation**: Added to Tools section.

#### Integration Health Dashboard

- **Builder page** (`/builder/integration-health`): Cross-
  integration health overview showing per-integration status
  cards with success/error counts, avg duration, error rate,
  failed executions.
- **Frontend service methods**: Added `getIntegrationStats` and
- **Sidebar navigation**: Added to Builder section.

#### CallLogService Schema Alignment

- **Root cause**: `CallLogService` used field names (`contact_name`,
  `subject`, `follow_up_date`, `record_id`, `contact_email`) that
- **Fix**: Rewrote `CallLogService` to use only actual schema
  columns: `phone_number`, `direction`, `duration_seconds`,
  `caller_name`, `logged_by`, `called_at`, `related_to_id`,
  `related_to_type`, `tenant_id`.
- **Routes**: Refactored call-log routes to delegate to the
  corrected `CallLogService` instead of raw Prisma queries.
- **Root cause**: `LeadScore.lead_id` was a plain integer with no
  two-query hydration patterns.
- **Fix**: Added formal `@relation` between `LeadScore` and
  `CrmLead` with `onDelete: Cascade`. Simplified
  `getTopScoredLeads` and `getLeadsByScoreRange` from manual
- Updated tests to verify the `include`-based pattern.

### Optimized

- Removed 10 unused imports across `Sidebar.jsx`,
  `LeadScoringPage.jsx`.

### Testing

- **Backend**: 176+ tests passing across 14+ suites
- **Frontend**: 34 tests passing across 6 suites
- **Lint**: 0 errors, 0 warnings on all changed files

---

## [2.3.1] — 2026-04-03

### Fixed (2.3.1)

#### Backend Stability & Schema Alignment

- **CrmService audit logging resilience**: Guarded `auditLog` and
  `activity` delegates with existence checks before calling `.create()`.
  Prevents synchronous `TypeError` when delegates are absent in test or
  alternate DB contexts. Audit logging still fires in production.
- **Lead Scoring — full schema alignment**: Rewrote
  `lead-scoring.service.js` to match Prisma schema exactly:
  - `value` field renamed to `field_value` (matching `LeadScoringRule` schema)
  - `title` renamed to `job_title` (matching `CrmLead` schema)
  - Removed `employee_count` (does not exist on `CrmLead`)
  - Added `tenant_id` to all `LeadScoringRule` and `LeadScore` creates
  - Replaced `include: { lead }` with manual hydration queries
    (`LeadScore` has no relation to `CrmLead`)
  - Default scoring rules rewritten to use actual CrmLead fields
    (`job_title`, `industry`, `annual_revenue`, `rating`, `email`,
    `phone`, `website`, `lead_source`) instead of fictitious fields
  - Added `order_index` support for rule ordering
- **Permission service — tenant-scoped unique keys**: Updated all
  `UiPermission` queries from 3-field compound key
  (`entity_type_entity_id_role_name`) to 4-field key
  (`entity_type_entity_id_role_name_tenant_id`). Applied across
  `permission.service.js`, `runtime/index.js`, `builder/index.js`,
  and `record.service.js`.
- **Auth test mock**: Added missing `role` delegate to auth test mock
  factory for role-level lookup.

#### Frontend Contract Alignment

- **Products page**: Aligned field names with backend contract:
  - `price` → `unit_price`, `cost` → `cost_price`
  - Fixed response extraction for paginated shape (`r.data.products`)
  - Clean payload construction (strips `_isEdit`/`_id` before send)
  - Margin calculation uses `Number()` for Decimal string values
- **Quotes page**: Complete contract realignment:
  - Removed `customer_name`, `customer_email`, `description` (not in
    Quote schema)
  - Added required `name` field and `terms` field
  - Status values aligned: `submitted` → `sent`, `approved` → `accepted`
  - Fixed response extraction for paginated shape (`r.data.quotes`)
  - Clean payload construction (strips `_isEdit`/`_id` before send)
- **Quote rejection**: Frontend service sends `{ rejection_reason }`
  instead of `{ reason }` (matching backend route expectation).

#### Frontend Lint & Test Recovery

- **SocialMediaBuilderPage**: Fixed 2 unescaped apostrophe lint errors
  (lines 470, 1177) with `&apos;` entities.
- **ErrorBoundary test**: Replaced unmockable `import.meta.env.MODE`
  mutation with a test verifying dev details are hidden in test mode.
  Vite inlines `MODE` at compile time, making runtime mutation invalid.
- **ModulePage tests**: Wrapped `<ModulePage>` in `<Routes><Route>` so
  `useParams()` extracts `moduleId`/`objectId` from the URL. Used
  `getByTestId('spinner')` and `getAllByText` for robust assertions.
- **usePerformanceMonitor**: Suppressed intentional `console` warnings
  with file-level `eslint-disable no-console`. Fixed `react-hooks/exhaustive-deps`
  warning on `useExpensiveOperation` with explicit disable comment
  (caller controls deps). Replaced `React.useMemo` with direct `useMemo`
  import.
- **apiWrapper.js**: Removed unused `api` import.

### Testing (2.3.1)

- **Backend**: 165/165 tests passing across 13 suites (was 161/165
  with 2 failing suites)
- **Frontend**: 27/27 tests passing across 5 suites (was 21/27)
- **Lint**: 0 errors, 0 warnings (was 2 errors, 7 warnings)
- **Build**: Passing
- **New test file**: `lead-scoring.test.js` — 15 tests covering rule
  CRUD, score calculation, operator coverage (equals, contains,
  greater_than, in_list, is_empty, is_not_empty), top-scored lead
  hydration, analytics, and distribution grading.

---

## [2.3.0] — 2026-04-03

### Added (2.3.0)

#### Social Media Integration — Split Model (Runtime + Builder)

Complete implementation following the Salesforce/HubSpot/Zoho pattern
of splitting social media into a runtime page (daily use) and an admin
control panel (configuration):

- **Runtime Page** (`/social-media`): Available to all authenticated
  users via Sidebar > Tools. Tabs: Feed, Posts, Campaigns, Mentions,
  Accounts. Managers can create/edit posts and draft campaigns. Users
  can view everything and respond to mentions. Admins see a link to
  the Builder config panel.
- **Admin Control Panel** (`/builder/social-media`): Full CRUD for
  accounts, OAuth tokens, listening keywords, campaign lifecycle.
  Admin-only access.
- **Backend Service** (`backend/src/services/social-media.service.js`):
  CRUD for accounts, posts, campaigns, mentions, and listening keywords.
  Overview/analytics endpoint with platform and sentiment breakdowns.
- **REST API** (`/api/social-media/*`): Three-tier permissions —
  read (any user), create/edit posts and campaigns (manager+),
  account management and keywords (admin only).
- **Frontend Service** (`frontend/src/services/social-media.service.js`):
  Dedicated API client with full method coverage.
- **Architecture**: One corporate account per platform per tenant.
  Employees share access via RBAC (admins manage connections, users
  create posts and respond to mentions).
- **WhatsApp Business**: Single registered business number per tenant.
  Incoming messages routed to employees via assignment rules.
- **OAuth Token Management**: Encrypted token storage with refresh
  support and expiry tracking.
- **Campaign Management**: Full lifecycle (planning → active → paused →
  completed → cancelled) with budget tracking and multi-platform targeting.
- **Social Listening**: Keyword monitoring with type classification
  (brand, competitor, industry, product, hashtag), match types, and
  platform selection.
- **Mention Monitoring**: Sentiment tracking (positive/neutral/negative),
  influence scoring, response management, and priority assignment.
- **Connector Architecture**: Platform connector framework matching
  Salesforce/HubSpot/Zoho pattern. Abstract `SocialConnector` base
  class with `publish()`, `getMentions()`, `syncEngagement()`,
  `refreshToken()` interface. Platform-specific connectors:
  - `SimulationConnector` — full demo mode, no API keys needed
  - `MetaConnector` — Facebook + Instagram via Graph API (scaffold)
  - `LinkedInConnector` — LinkedIn Marketing API v2 (scaffold)
  - `TwitterConnector` — X API v2 (scaffold)
- **Auto-detection**: Registry falls back to simulation when platform
  env vars are not set. Set `META_APP_ID`, `LINKEDIN_CLIENT_ID`, or
  `TWITTER_CLIENT_ID` to enable live connectors.
- **Background Sync**: 5-minute scheduler pulls mentions, syncs
  engagement metrics, and updates profile stats for all active accounts.
- **Publish Flow**: Users create draft/scheduled posts, click Publish
  to push to platform API (real or simulated).
- **Sync Button**: Per-account manual sync triggers immediate
  metrics + mentions + engagement refresh.
- **Demo Data**: 44 seed records (5 accounts, 10 posts, 4 campaigns,
  8 mentions, 6 engagements, 8 keywords, 3 leads).
- **Navigation**: Added to Builder Home, Sidebar Tools, and App routes.

### API Endpoints

| Method | Path | Description |
| ------ | ---- | ----------- |
| `GET` | `/api/social-media/overview` | Dashboard analytics |
| `GET/POST` | `/api/social-media/accounts` | List / connect accounts |
| `GET/PUT/DELETE` | `/api/social-media/accounts/:id` | Account CRUD |
| `POST` | `/api/social-media/accounts/:id/toggle` | Enable/disable |
| `POST` | `/api/social-media/accounts/:id/refresh-token` | Refresh OAuth |
| `GET/POST` | `/api/social-media/posts` | List / create posts |
| `GET/PUT/DELETE` | `/api/social-media/posts/:id` | Post CRUD |
| `GET/POST` | `/api/social-media/campaigns` | List / create campaigns |
| `GET/PUT/DELETE` | `/api/social-media/campaigns/:id` | Campaign CRUD |
| `GET` | `/api/social-media/mentions` | List mentions (filterable) |
| `PUT` | `/api/social-media/mentions/:id` | Update / respond to mention |
| `GET/POST` | `/api/social-media/keywords` | List / create keywords |
| `PUT/DELETE` | `/api/social-media/keywords/:id` | Keyword CRUD |

---

## [2.1.0] — 2026-03-30

### Major Features Added

#### Product Catalog Management

Full-stack implementation of product and service management:

- **Backend API**: Complete REST endpoints with authentication
  (`/api/runtime/products`)
- **Frontend Interface**: Professional product management page
  at `/products`
- **Database Schema**: Proper Product table with pricing,
  inventory, and relationships
- Product and service catalog with detailed information
- Multi-currency pricing with cost tracking and profit margins
- Inventory management with vendor relationships
- Advanced search and filtering
- Real-time analytics and performance metrics
- DataTable with sorting, filtering, and pagination
- Modal-based create/edit forms with validation
- Optimistic updates for snappy user experience

#### Quote Management System

Full-stack implementation of quote lifecycle management:

- **Backend API**: Complete quote lifecycle management
  (`/api/runtime/quotes`)
- **Frontend Interface**: Professional quote management
  at `/quotes`
- **Workflow Engine**: Status transitions
  (draft > submitted > approved/rejected > sent > accepted)
- Professional quote generation with automated numbering
  (QUO-001, QUO-002, etc.)
- Multi-stage approval workflows
- Opportunity linking for proper CRM integration
- Quote validity tracking with expiration management
- Revenue forecasting and conversion analytics
- PDF export ready (infrastructure in place)

#### Advanced Search Infrastructure

- Fixed EAV (Entity-Attribute-Value) pattern for proper
  custom-object searches
- Custom-object search now uses correct `field_name` column
  (matching `RecordFieldValue` schema and persistence path)
- All custom object searches work correctly with proper
  performance

### Critical Fixes (2.3.0)

#### Custom-Object Search Engine

- Problem: Search functionality was broken for custom objects
  due to incorrect database queries
- Solution: Fixed EAV pattern to use `field_name` consistently
  across search and persistence
- Impact: All custom object searches now work correctly

#### Lead Scoring Service

- Problem: Schema misalignment causing database errors in
  lead qualification
- Solution: Completely rewrote service to match LeadScore table
  schema exactly (lead_id, total_score, scoring_details)
- Impact: Automated lead scoring now works seamlessly with
  CRM data

#### Authentication Security

- Problem: Debug logs exposing sensitive authentication
  information in production
- Solution: Removed console.log statements from authentication
  middleware
- Impact: Improved security and cleaner production logs

#### Database Performance

- Optimized EAV queries with proper foreign key joins

### Frontend Enhancements

- **React Query Integration**: Centralized API calls through
  runtimeService
- **Optimistic Updates**: Snappy user experience with immediate
  UI feedback
- **Error Boundaries**: Robust error handling with
  development/production modes
- **Component Optimization**: Standardized UI patterns and
  reusable components
- Products accessible via main navigation or `/products` URL
- Quotes accessible via main navigation or `/quotes` URL
- Integrated search across both product and quote databases

### Testing and Quality

- **Backend Tests**: 145/145 tests passing (100% success rate)
- **Frontend Tests**: 16/22 tests passing (improved from
  initial state)
- **Integration Testing**: All API endpoints validated
- **Code Optimization**: Replaced direct fetch() calls with
  service layer
- **Performance**: Efficient database queries and React
  rendering patterns
- ESLint compliance: All new code follows project standards

### Docs

- Complete guides for Product and Quote management
- Updated API documentation with new endpoints and usage
  examples
- User guides with step-by-step workflows for all new features
- Technical specs with architecture decisions and
  implementation details

---

## [Unreleased / Pre-2.1.0]

### Added (Pre-2.1.0)

- Comprehensive root README.md with architecture overview and
  quick start guide
- CONTRIBUTING.md with detailed contribution guidelines and
  development workflow
- CHANGELOG.md for tracking project changes
- ErrorBoundary component for graceful error handling in React
- Performance monitoring hooks for development optimization
- Comprehensive test coverage for ErrorBoundary and ModulePage
  components

### Changed (Pre-2.1.0)

- Enhanced documentation structure with better organization
  and navigation

### Fixed (Pre-2.1.0)

- Backend RecordService hydration regression with optional
  Prisma delegates
- Frontend environment variable issues
  (`process.env` to `import.meta.env`)
- Critical lint errors in ErrorBoundary and
  usePerformanceMonitor components
- Markdown formatting issues across documentation files

### Security (Pre-2.1.0)

- Replaced console statements in production services with
  centralized logging
- Added input validation and error sanitization in
  ErrorBoundary component
- Implemented structured error reporting with
  environment-appropriate detail levels

---

## [1.0.0] — 2026-03-28

### Implementation

- Complete metadata-driven CRM platform
- Visual form and dashboard builders
- Workflow automation engine
- Pipeline management with Kanban boards
- Role-based access control system
- CSV import/export functionality
- Global search across all objects
- Essential CRM features:
  - Product catalog management
  - Quote generation system
  - Email template management (Builder > Email Templates)
  - Email sending from any record via Activity Timeline
  - Document storage and organization
  - Lead scoring automation
  - Field change automation (audit logs, auto-activity,
    workflow triggers)
  - Lead status change workflow with notifications
- Comprehensive test suites for backend and frontend
- Production-ready deployment configurations

### Technical Stack

- Node.js backend with Fastify and Prisma ORM
- React frontend with Vite and TailwindCSS
- MySQL database with Redis caching
- JWT authentication with bcrypt password hashing
- RESTful API with comprehensive error handling
- Docker containerization support

### Initial Docs

- Complete user guide with step-by-step instructions
- Technical documentation for developers
- API reference documentation
- Deployment and configuration guides
- Permission management documentation
- Workflow automation guides

---

## Release Notes

### Version 2.2.0 Highlights

- **Email System**: Send emails from any record using
  templates scoped to Module > Object. Image-based HTML
  templates with variable auto-resolution from record data.
  SMTP integration with preview mode for development.
- **Email Templates in Builder**: Template management moved
  to Builder (admin-only). Templates grouped by Module >
  Object with create/edit/preview/delete.
- **Field Change Automation**: New `field_changed` workflow
  trigger fires when CRM entity fields are updated. Automatic
  audit logging with old/new values and auto-activity for
  status changes.
- **Lead Status Workflow**: Built-in workflow triggers on
  lead_status changes. Notifies assigned rep on every change,
  alerts manager when qualified or unqualified.
- **Call Log Removed**: Standalone Call Log object removed.
  Call tracking handled via Activity Timeline (type: call).
- **Assignment Rules**: 5 pre-configured rules across Lead,
  Opportunity, Case, and Contact. All 4 rule types
  demonstrated (fixed, round_robin, rule_based, load_balanced).
- **Workflow Fixes**: All 4 seeded workflows rewritten with
  correct trigger types, operator names, notification config
  keys, and proper step branching via on_true_id/on_false_id.
- **Builder Studio Cleanup**: Added Pipeline Builder card.
  Removed Forecast and Import (runtime pages, not builder
  tools). Builder Studio now matches sidebar (10 sections).
- **Dashboard Cleanup**: Removed redundant admin-only right
  sidebar modules panel from the Dashboard home screen.
- **Forecast and Quotas in Sidebar**: Added under a new
  "Tools" section, visible to all users. Combined forecast +
  quota management page.
- **Demo Quotas**: 27 seeded quotas for Opportunity
  (monthly/quarterly/annual) and Lead (monthly).
- **Import from Module**: Import button added to each
  module toolbar (next to Export) with object pre-selected.
- **Document Management**: Full integration — upload, download,
  and delete files from the new Docs tab in any record's
  side panel. API routes at `/api/documents`. Supports PDF,
  Office, images, text (50 MB max). Files stored in
  `uploads/` organized by year/month.

### Version 2.1.0 Highlights

Genesis CRM 2.1.0 completes the essential sales tools
required for production deployment:

- **Product Catalog**: Full product and service management
  with pricing intelligence
- **Quote Management**: Professional quote lifecycle with
  approval workflows
- **Search Fix**: Critical fix for custom-object search
  restores reliable data access
- **Test Coverage**: 145/145 backend tests passing

### Version 1.0.0 Highlights

Genesis CRM 1.0.0 represents the initial complete,
production-ready CRM platform:

- **Zero-Code Configuration**: Build forms, dashboards,
  and workflows without coding
- **Complete CRM Suite**: Lead management, opportunities,
  quotes, products, and documents
- **Developer-Friendly**: Comprehensive APIs, test coverage,
  and documentation
- **Production-Ready**: Security, performance, and
  scalability considerations built-in

---

## Technical Implementation Details

### Essential CRM Features (v1.0.0 to v2.1.0)

#### Database Schema Additions

9 new models added across versions:

- `Product` — Product catalog with pricing and inventory
- `Quote` — Quote header with status workflow
- `QuoteLineItem` — Quote line items with product references
- `EmailTemplate` — Dynamic email templates with variable
  replacement
- `EmailLog` — Email delivery tracking
- `Document` — File storage with duplicate detection
- `LeadScoringRule` — Configurable scoring criteria
- `LeadScore` — Lead qualification scores and grades
- ~~`CallLog`~~ — Removed; call tracking handled via
  Activity Timeline (type: call)

#### Enterprise Feature Additions (Schema)

50+ additional models for enterprise features:

- Email Marketing: `EmailCampaign`, `CampaignRecipient`,
  `EmailList`, and more
- Calendar: `CalendarEvent`, `MeetingRoom`, `RoomBooking`,
  and more
- Analytics: `CustomReport`, `KpiDefinition`,
  `AnalyticDashboard`, and more
- Contracts: `Contract`, `ContractApproval`,
  `ContractSignature`, and more
- Territory: `Territory`, `SalesTeam`,
  `TerritoryAssignment`, and more
- Customer Portal: `CustomerPortalUser`,
  `KnowledgeArticle`, and more
- Social Media: `SocialMediaAccount`,
  `SocialMediaLead`, and more
- Partners: `Partner`, `PartnerOpportunity`,
  `PartnerCertification`, and more

#### Code Optimizations

- Input validation: `parseInt()` with bounds-checking
  instead of `Number()` for all IDs
- Error context: Comprehensive error messages with full
  context information
- Security hardening: Input validation, file type
  restrictions, and access controls

---

## Related Guides

- **Roadmap**: [ROADMAP.md](ROADMAP.md)
- **Getting Started**:
  [../getting-started/INSTALLATION.md](../getting-started/INSTALLATION.md)
- **Developer Architecture**:
  [../developer-guide/ARCHITECTURE_AND_SETUP.md](../developer-guide/ARCHITECTURE_AND_SETUP.md)
