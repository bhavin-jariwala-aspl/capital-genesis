# Genesis CRM — Documentation Roadmap

Every document, arranged as paths you can follow from start to finish. Pick a journey, follow its numbered steps,
and use the **Where to next** box at the bottom of every page to keep going. You never need to know a file name.

## 1. Start here

**[Understanding Genesis](understanding/README.md)** — eight short steps that explain the whole system, each with a
plain-language part for everyone and a technical part for engineers. Whatever your role, read steps 1 and 2 first
(25 minutes).

```text
 WHY        1 What Genesis is
 WHAT       2 Building blocks ──► 3 How data is stored and read
 HOW        4 How a request travels ──► 5 Who sees what ──► 6 What happens automatically
 CHANGE     7 Configure or code? ──► 8 Codebase tour
```

## 2. Choose your journey

| Journey | For | Time |
|---|---|---|
| [Decision-maker](#decision-maker) | Management, product owners, buyers | 1 hour |
| [Genesis Capital staff](#genesis-capital-staff) | RMs, loans, compliance, operations | 2 hours, then per desk |
| [CRM administrator](#crm-administrator) | Whoever configures the workspace | 1 day |
| [Platform operator](#platform-operator) | Runs the service for customers | half a day |
| [Implementer / presenter](#implementer--presenter) | Delivers or demonstrates Genesis Capital | 1 day |
| [Engineer](#engineer) | Develops, supports, integrates | 2–3 days |
| [AI evaluator](#ai-evaluator) | Evaluates or extends "Ask Genesis" | half a day |

<!-- nav:journeys -->
### Decision-maker

*Management, product owners, buyers — "what is this and is it right for us?"* — about 1 hour.

1. [Step 1 — What Genesis is](understanding/01-what-genesis-is.md) — The platform and the Genesis Capital configuration
2. [Step 2 — The building blocks](understanding/02-building-blocks.md) — The vocabulary you'll hear
3. [00 — Purpose](genesis-capital/process-flows/00-purpose.md) — The business problems it solves
4. [Step 7 — Configure or code?](understanding/07-configure-or-code.md) — What your team can change without developers
5. [Step 3 — How data is stored and read](understanding/03-how-data-is-stored.md) — Where the data lives (Part A)
6. [Step 5 — Who sees what](understanding/05-who-sees-what.md) — How access and compliance controls work (Part A)
7. [Build effort & capabilities](project/build-effort-and-capabilities.md) — Effort to add a new process
8. [Roadmap](project/roadmap.md) — What is done and what is next

### Genesis Capital staff

*Relationship managers, loans, compliance, operations — "how do I do my job in it?"* — about 2 hours, then per desk.

1. [Step 1 — What Genesis is](understanding/01-what-genesis-is.md) — What the CRM is
2. [Step 2 — The building blocks](understanding/02-building-blocks.md) — Modules, records, stages — the words on screen
3. [Genesis Capital user guide](genesis-capital/user-guide.md) — Navigation, records, approvals, documents, glossary
4. [Tutorial videos](genesis-capital/videos/README.md) — Watch the getting-started video and your module's video
5. [Process flows](genesis-capital/process-flows/README.md) — Read the process flow for your desk
6. [Daily operations](using-the-crm/daily-operations.md) — Search, tasks, import and export in depth
7. [Reports](using-the-crm/reports.md) — Reports
8. [Documents](using-the-crm/documents.md) — Documents and e-signature
9. [My account, record tools, portal](using-the-crm/my-account-and-record-tools.md) — Your account, record tools and the client portal

### CRM administrator

*Configures the workspace in the Builder — "how do I change it?"* — about 1 day.

1. [Understanding Genesis](understanding/README.md) — Steps 1–7 (Part A of each, plus Part B of step 5)
2. [System configuration](administration/system-configuration.md) — The administration overview
3. [Builder guide](builder-guide/README.md) — In order: blueprint → access → automation → channels → look
4. [Permissions & roles](administration/permissions-and-roles.md) — The permission model end to end
5. [Automation reference](administration/automation-reference.md) — Choosing between workflow, assignment, scoring and SLA
6. [Workflow automation](administration/workflow-automation.md) — Workflow patterns and troubleshooting
7. [Implementation](genesis-capital/implementation.md) — How the Genesis Capital workspace is configured

### Platform operator

*Runs the SaaS: workspaces, plans, hosting — "how do I run it for customers?"* — about half a day.

1. [Step 1 — What Genesis is](understanding/01-what-genesis-is.md) — Platform vs workspace
2. [Step 4 — How a request travels](understanding/04-how-a-request-travels.md) — Sign-in, tokens and the tenant filter
3. [Step 5 — Who sees what](understanding/05-who-sees-what.md) — Workspace isolation and plans
4. [Installation & setup](getting-started/installation.md) — Install and seed
5. [Platform administration](platform-operations/platform-administration.md) — The platform console
6. [Tenant onboarding](platform-operations/tenant-onboarding.md) — Onboarding a new customer
7. [Plans & features](platform-operations/plans-and-features.md) — Plans, features and overrides
8. [AWS deployment](platform-operations/aws-deployment.md) — Hosting on AWS
9. [Client sandbox](genesis-capital/client-sandbox.md) — Running a client sandbox

### Implementer / presenter

*Delivers or demonstrates Genesis Capital — "how was it built and how do I show it?"* — about 1 day.

1. [Understanding Genesis](understanding/README.md) — Steps 1–3 and 7
2. [Product requirements (PRD)](genesis-capital/product-requirements.md) — What the client asked for
3. [Implementation](genesis-capital/implementation.md) — How it was built, installed and seeded
4. [Process flows](genesis-capital/process-flows/README.md) — Every module's end-to-end process
5. [Tutorial videos](genesis-capital/videos/README.md) — Twenty captioned walk-throughs to show or share
6. [Demo pitch and Q&A](genesis-capital/demo-pitch.md) — Running the demonstration and answering questions
7. [Client sandbox](genesis-capital/client-sandbox.md) — Letting the client's testers try it

### Engineer

*Develops, supports or integrates — "how does it work inside?"* — about 2–3 days.

1. [Understanding Genesis](understanding/README.md) — All eight steps, both parts
2. [Installation & setup](getting-started/installation.md) — Run it locally
3. [Architecture & setup](developer-guide/architecture-and-setup.md) — Architecture and the runtime loading pipeline
4. [Database schema](developer-guide/database-schema.md) — Tables and SQL recipes
5. [Data dictionary](developer-guide/data-dictionary.md) — Why each table exists
6. [API reference](developer-guide/api-reference.md) — Endpoints
7. [Security](developer-guide/security.md) — Security and known gaps
8. [Engine references](developer-guide/engines/README.md) — The engine for the feature you are working on
9. [Contributing](developer-guide/contributing.md) — How to contribute

### AI evaluator

*Anyone evaluating or extending "Ask Genesis"* — about half a day.

1. [Ask Genesis (what is built)](developer-guide/ai-reporting/ask-genesis.md) — What is built and how to run it
2. [LLM primer](developer-guide/ai-reporting/llm-primer.md) — LLMs explained
3. [AI reporting architecture study](developer-guide/ai-reporting/architecture-study.md) — The architecture study
4. [LLM implementation walkthrough](developer-guide/ai-reporting/implementation-walkthrough.md) — The build walkthrough
5. [Local LLM operations](developer-guide/ai-reporting/local-llm-operations.md) — Operating a local model
<!-- /nav:journeys -->

## 3. Find by question

### Understanding the system

| Question | Answer |
|---|---|
| Where is our data stored, and why are tables like `crm_contacts` empty? | [How data is stored and read](understanding/03-how-data-is-stored.md) |
| Who can see a record, and why can't I? | [Who sees what](understanding/05-who-sees-what.md) |
| Why did something change on its own? | [What happens automatically](understanding/06-what-happens-automatically.md) |
| Can we change X without a developer? | [Configure or code?](understanding/07-configure-or-code.md) |
| How much effort is a new process? | [Build effort & capabilities](project/build-effort-and-capabilities.md) |
| What is missing today? | [Roadmap](project/roadmap.md) |

### Using Genesis Capital

| Question | Answer |
|---|---|
| How do I use the CRM at my desk? | [Genesis Capital user guide](genesis-capital/user-guide.md) |
| How does my module's process work, end to end? | [Process flows](genesis-capital/process-flows/README.md) |
| Can I watch it? | [Tutorial videos](genesis-capital/videos/README.md) |
| How do I send a web form to a client? | [User guide › web forms](genesis-capital/user-guide.md#sending-a-web-form-to-a-client) |
| How do I build a report or a dashboard? | [Reports](using-the-crm/reports.md) · [Dashboard builder](builder-guide/05-dashboard-builder.md) |

### Configuring a workspace

| Question | Answer |
|---|---|
| Where do I start configuring? | [Builder guide](builder-guide/README.md) |
| Workflow, assignment rule, score or SLA — which one? | [Automation reference](administration/automation-reference.md) |
| How do roles, levels and permissions combine? | [Permissions & roles](administration/permissions-and-roles.md) |
| How do I wall off a desk's confidential work? | [Business units & barriers](builder-guide/10-business-units-and-barriers.md) |
| How do I change colours, logo and fonts? | [Appearance & branding](builder-guide/20-appearance.md) |

### Running the platform

| Question | Answer |
|---|---|
| How do I install it? | [Installation](getting-started/installation.md) |
| How do I onboard a new customer? | [Tenant onboarding](platform-operations/tenant-onboarding.md) |
| How do plans and feature overrides work? | [Plans & features](platform-operations/plans-and-features.md) |
| How do I host it on AWS, or give a client a sandbox? | [AWS deployment](platform-operations/aws-deployment.md) · [Client sandbox](genesis-capital/client-sandbox.md) |

### Developing

| Question | Answer |
|---|---|
| Where is the code for X? | [Codebase tour](understanding/08-codebase-tour.md) |
| How are screens and records loaded at runtime? | [Architecture › runtime loading pipeline](developer-guide/architecture-and-setup.md#runtime-data-loading-pipeline) |
| What does this table or column mean? | [Data dictionary](developer-guide/data-dictionary.md) · [Database schema](developer-guide/database-schema.md) |
| Which endpoint does this, and who calls it? | [API reference](developer-guide/api-reference.md) |
| How is it secured, and what are the known gaps? | [Security](developer-guide/security.md) |
| How does engine X work? | [Engine references](developer-guide/engines/README.md) |

## 4. All documents

<!-- nav:catalog -->
### Understanding Genesis

*Everyone — start here* · [section guide](understanding/README.md)

| Document | For | What you'll learn |
|---|---|---|
| [Step 1 — What Genesis is](understanding/01-what-genesis-is.md) | Everyone | The platform vs the Genesis Capital configuration, who uses it, what it is built with |
| [Step 2 — The building blocks](understanding/02-building-blocks.md) | Everyone | Workspace, module, object, field, record, stage, form, lookup and role — and how they fit |
| [Step 3 — How data is stored and read](understanding/03-how-data-is-stored.md) | Everyone (Part B: engineers) | Blueprint + envelope + values; why crm_* tables are empty; read/write paths; SQL recipes |
| [Step 4 — How a request travels](understanding/04-how-a-request-travels.md) | Everyone (Part B: engineers) | Sign-in, tokens, the tenant filter on every query, API groups, caching |
| [Step 5 — Who sees what](understanding/05-who-sees-what.md) | Everyone (Part B: admins, engineers) | The seven access locks, from workspace to personal-data masking, and known gaps |
| [Step 6 — What happens automatically](understanding/06-what-happens-automatically.md) | Everyone (Part B: engineers) | What runs after a save: formulas, assignment, workflows, SLA timers, schedulers, audit |
| [Step 7 — Configure or code?](understanding/07-configure-or-code.md) | Everyone | Builder vs vertical pack vs platform code: who can make which change |
| [Step 8 — Codebase tour](understanding/08-codebase-tour.md) | Engineers | Folder layout, five files to read first, how to trace any feature, tests |

### Getting started

*Anyone installing or running Genesis* · [section guide](getting-started/README.md)

| Document | For | What you'll learn |
|---|---|---|
| [Installation & setup](getting-started/installation.md) | Administrators, engineers | Install, configure, seed the Genesis Capital demo, sign in, local demo database, common issues |

### Genesis Capital workspace

*Genesis Capital staff, implementers, presenters* · [section guide](genesis-capital/README.md)

| Document | For | What you'll learn |
|---|---|---|
| [Genesis Capital user guide](genesis-capital/user-guide.md) | Genesis Capital staff | Navigation, records, approvals, documents, every module and journey, glossary |
| [Product requirements (PRD)](genesis-capital/product-requirements.md) | Implementers, product owners | What Genesis Capital asked for, module by module |
| [Implementation](genesis-capital/implementation.md) | Implementers, engineers | How the PRD was built: modules, products, dashboards, portal, install, roles, logins, demo data |
| [Demo pitch and Q&A](genesis-capital/demo-pitch.md) | Presenters | Running a client demonstration: scenes, links, talk tracks, expected questions |
| [Client sandbox](genesis-capital/client-sandbox.md) | Implementers, operators | Building, running, resetting and closing a hosted sandbox for a client's testers |

### Process flows

*Business users, analysts, implementers* · [section guide](genesis-capital/process-flows/README.md)

| Document | For | What you'll learn |
|---|---|---|
| [00 — Purpose](genesis-capital/process-flows/00-purpose.md) | Management, everyone | Why Genesis Capital uses this CRM: the problems it solves and what it gives each desk |
| [01 — Products & Services](genesis-capital/process-flows/01-products-and-services.md) | Business users | The product catalogue and how products route enquiries |
| [02 — Clients (Client 360)](genesis-capital/process-flows/02-clients-client-360.md) | Business users | One client record for the group, relationships, the Client 360 view |
| [03 — Enquiries & Leads](genesis-capital/process-flows/03-enquiries-and-leads.md) | Business users | Capture, routing, qualification and conversion of enquiries |
| [04 — Cross-sell & RM Workbench](genesis-capital/process-flows/04-cross-sell-and-rm-workbench.md) | Business users | Opportunities, next-best actions, meeting notes and RM targets |
| [05 — Retail Lending](genesis-capital/process-flows/05-retail-lending.md) | Business users | Loan application to approval and disbursement |
| [06 — Commercial Lending](genesis-capital/process-flows/06-commercial-lending.md) | Business users | Credit facilities, financial spreads and covenants |
| [07 — Collateral & Pledges](genesis-capital/process-flows/07-collateral-and-pledges.md) | Business users | Collateral, valuations, links and margin calls |
| [08 — Loan Servicing](genesis-capital/process-flows/08-loan-servicing.md) | Business users | Loan accounts, PLR changes, notifications and collections |
| [09 — Wealth Management](genesis-capital/process-flows/09-wealth-management.md) | Business users | Risk profiles, suitability, mandates and AUM |
| [10 — Investment Funds](genesis-capital/process-flows/10-investment-funds.md) | Business users | Funds, share classes, NAV, orders and holdings |
| [11 — Trading Solutions](genesis-capital/process-flows/11-trading-solutions.md) | Business users | Securities accounts, client orders, IOIs and research |
| [12 — Corporate Advisory](genesis-capital/process-flows/12-corporate-advisory.md) | Business users | Mandates, conflict checks, deal teams, insider lists, fees |
| [13 — Forex Desk](genesis-capital/process-flows/13-forex-desk.md) | Business users | FX profiles, quotes, deals and rate alerts |
| [14 — Marketing & Consent](genesis-capital/process-flows/14-marketing-and-consent.md) | Business users | Campaigns, segments, events, subscriptions and consent |
| [15 — Introducers](genesis-capital/process-flows/15-introducers.md) | Business users | Introducers, referrals and commissions |
| [16 — Revenue](genesis-capital/process-flows/16-revenue.md) | Business users | Revenue entries and how they roll up |
| [17 — Service & Complaints](genesis-capital/process-flows/17-service-and-complaints.md) | Business users | Service requests, complaints and service levels |
| [18 — KYC & Compliance](genesis-capital/process-flows/18-kyc-and-compliance.md) | Business users, compliance | KYC cases, screening, reliance, STRs, registers and data-subject requests |
| [19 — Masters](genesis-capital/process-flows/19-masters.md) | Administrators | Reference lists: rates, countries, routing, approval matrix |
| [20 — Tools](genesis-capital/process-flows/20-tools.md) | Business users | Approvals, reminders, reports, access & barriers, SLA board, documents, web forms |
| [21 — Client & Introducer Portal](genesis-capital/process-flows/21-client-and-introducer-portal.md) | Business users | What clients and introducers see and do in the portal |

### Tutorial videos

*Everyone who prefers to watch* · [section guide](genesis-capital/videos/README.md)

| Document | For | What you'll learn |
|---|---|---|
| [Tutorial videos](genesis-capital/videos/README.md) | Everyone | Twenty captioned videos: getting started and one end-to-end process per module |

### Using the CRM

*Staff who work in the CRM every day* · [section guide](using-the-crm/README.md)

| Document | For | What you'll learn |
|---|---|---|
| [Daily operations](using-the-crm/daily-operations.md) | All staff | Navigation, records, search, pipelines, tasks, activities, import and export |
| [What's new — how-to](using-the-crm/whats-new.md) | All staff | Plain-language how-to for recent features |
| [Reports](using-the-crm/reports.md) | All staff | Building, sharing and scheduling reports — and which data they can use |
| [Documents](using-the-crm/documents.md) | All staff | Upload, folders, search, sharing, templates and e-signature |
| [My account, record tools, portal](using-the-crm/my-account-and-record-tools.md) | All staff | Your profile and sign-in security, merge and bulk tools, the client portal |
| [Products & Services catalogue](using-the-crm/products-and-services.md) | All staff | Genesis Capital's product catalogue (the financial_product object) and how rates are set |

### Builder guide

*CRM administrators configuring the workspace* · [section guide](builder-guide/README.md)

| Document | For | What you'll learn |
|---|---|---|
| [Modules & objects](builder-guide/01-modules-and-objects.md) | Administrators | Create modules, objects and fields — the blueprint |
| [Form builder](builder-guide/02-form-builder.md) | Administrators | Lay out create/edit forms, validations, dependencies |
| [Pipeline builder](builder-guide/03-pipeline-builder.md) | Administrators | Stages, stage gates, Kanban, delete mode |
| [Wizards](builder-guide/04-wizards.md) | Administrators | Guided multi-step data capture |
| [Dashboard builder](builder-guide/05-dashboard-builder.md) | Administrators | Widgets, charts and role home dashboards |
| [Permissions](builder-guide/06-permissions.md) | Administrators | What each role may view and edit |
| [Roles & levels](builder-guide/07-roles-and-levels.md) | Administrators | Roles and the fixed level ladder |
| [Employees](builder-guide/08-employees.md) | Administrators | Staff accounts, activation, passwords |
| [Org chart](builder-guide/09-org-chart.md) | Administrators | Reporting lines that drive manager visibility and escalation |
| [Business units & barriers](builder-guide/10-business-units-and-barriers.md) | Administrators, compliance | Legal-entity scope, information barriers, wall crossings |
| [Assignment rules](builder-guide/11-assignment-rules.md) | Administrators | Who gets a new record: fixed, rules, round robin, load balanced |
| [Workflows](builder-guide/12-workflows.md) | Administrators | When X happens and Y is true, do Z |
| [Lead scoring rules](builder-guide/13-lead-scoring-rules.md) | Administrators | Rule-based scores and grades — and which object they apply to |
| [SLA engine](builder-guide/14-sla-engine.md) | Administrators | Service-level policies, targets, business hours and escalations |
| [Email templates](builder-guide/15-email-templates.md) | Administrators | Templates with merge fields |
| [Push notifications](builder-guide/16-push-notifications.md) | Administrators | Sending notifications to staff devices |
| [Integrations](builder-guide/17-integrations.md) | Administrators | Inbound and outbound webhooks and connectors |
| [Integration health](builder-guide/18-integration-health.md) | Administrators | Monitoring deliveries, failures and retries |
| [Social media](builder-guide/19-social-media.md) | Administrators | Accounts, publishing, the inbox and listening |
| [Appearance & branding](builder-guide/20-appearance.md) | Administrators | Colours, logo, fonts, density, chart palette |

### Administration

*CRM administrators* · [section guide](administration/README.md)

| Document | For | What you'll learn |
|---|---|---|
| [System configuration](administration/system-configuration.md) | Administrators | Modules, fields, users, settings, import, integrations, monitoring — the overview |
| [Permissions & roles](administration/permissions-and-roles.md) | Administrators | The permission model end to end |
| [Automation reference](administration/automation-reference.md) | Administrators | Workflow vs assignment vs scoring vs SLA: which to use, full vocabulary, shipped rules, guard rails |
| [Workflow automation](administration/workflow-automation.md) | Administrators | Workflow concepts, testing, patterns, troubleshooting |
| [Social media administration](administration/social-media.md) | Administrators | Accounts, OAuth, publishing, routing; Meta/WhatsApp go-live plans |

### Platform operations

*Platform operators (super administrators) and DevOps* · [section guide](platform-operations/README.md)

| Document | For | What you'll learn |
|---|---|---|
| [Platform administration](platform-operations/platform-administration.md) | Platform operators | Tenants, plans, flags, security, analytics, impersonation, audit |
| [Tenant onboarding](platform-operations/tenant-onboarding.md) | Platform operators | The onboarding wizard, eight provisioning steps, readiness, API |
| [Plans & features](platform-operations/plans-and-features.md) | Platform operators | Plans, the feature catalogue, per-tenant grants, where gates are enforced |
| [AWS deployment](platform-operations/aws-deployment.md) | DevOps | Deploying Genesis on AWS |

### Developer guide

*Engineers* · [section guide](developer-guide/README.md#core-reading-in-order)

| Document | For | What you'll learn |
|---|---|---|
| [Architecture & setup](developer-guide/architecture-and-setup.md) | Engineers | Stack, structure, runtime loading pipeline, patterns, troubleshooting |
| [Database schema](developer-guide/database-schema.md) | Engineers | Every table's columns, types and relationships; SQL recipes for record data |
| [Data dictionary](developer-guide/data-dictionary.md) | Engineers | Why each table exists and when its rows are written |
| [API reference](developer-guide/api-reference.md) | Engineers, integrators | Every endpoint, its purpose and who calls it |
| [Security](developer-guide/security.md) | Engineers, security reviewers | Auth, RBAC, tenant isolation, PII, input validation, known gaps |
| [Metadata configuration details](developer-guide/metadata-configuration.md) | Engineers | How metadata (modules, objects, fields, forms) is configured and rendered |
| [Performance optimisation](developer-guide/performance-optimization.md) | Engineers | Metadata caching and optimistic UI |
| [Design system](developer-guide/design-system.md) | Frontend engineers | Tokens, shared components, patterns, new-page checklist |
| [Contributing](developer-guide/contributing.md) | Engineers | Code style, testing, pull requests |

### Engine references

*Engineers and advanced administrators* · [section guide](developer-guide/engines/README.md)

| Document | For | What you'll learn |
|---|---|---|
| [Platform Builder extensions](developer-guide/engines/platform-builder-extensions.md) | Engineers, implementers | Formulas, lookups, record actions, stage gates, BUs, barriers, audit chain, web forms, packs, portal, MFA, job queue |
| [Configurability engine](developer-guide/engines/configurability.md) | Engineers | Theming, server-side validation, field appearance, form overrides |
| [Workflow engine](developer-guide/engines/workflow-engine.md) | Engineers | Triggers, steps, operators, functions, storage routing |
| [SLA engine](developer-guide/engines/sla-engine.md) | Engineers | Reconcile loop, policy matching, timers, business hours, escalations |
| [Lead scoring engine](developer-guide/engines/lead-scoring.md) | Engineers | Triggers, rule evaluation, grading |
| [Reporting engine](developer-guide/engines/reporting.md) | Engineers | Report sources, filters, measures, snapshots, scheduling |
| [Dashboard analytics](developer-guide/engines/dashboard-analytics.md) | Engineers | How dashboard widgets read live data, including Builder objects |
| [Document management](developer-guide/engines/document-management.md) | Engineers | Storage providers, folders, search, sharing, templates, e-signature |
| [Social engine](developer-guide/engines/social-engine.md) | Engineers | Publish/sync schedulers, mentions, connectors, the scheduler registry |
| [Currency](developer-guide/engines/currency.md) | Engineers | Display currency resolution and switching |
| [Application settings](developer-guide/engines/application-settings.md) | Engineers | Tenant-wide settings model and API |
| [Status tracker](developer-guide/engines/status-tracker.md) | Engineers, administrators | Building the status stepper field |

### AI reporting

*Engineers and decision-makers interested in AI* · [section guide](developer-guide/ai-reporting/README.md)

| Document | For | What you'll learn |
|---|---|---|
| [Ask Genesis (what is built)](developer-guide/ai-reporting/ask-genesis.md) | Engineers, administrators | Natural-language reporting on a local model: how it works and how to run it |
| [LLM primer](developer-guide/ai-reporting/llm-primer.md) | Everyone curious about AI | Large language models explained for the team |
| [AI reporting architecture study](developer-guide/ai-reporting/architecture-study.md) | Architects | Architecture and feasibility study |
| [LLM implementation walkthrough](developer-guide/ai-reporting/implementation-walkthrough.md) | Engineers | Step-by-step plan for building AI reporting |
| [Local LLM operations](developer-guide/ai-reporting/local-llm-operations.md) | DevOps, engineers | Acquiring, adapting and operating a local model |

### Project

*Everyone tracking the product* · [section guide](project/README.md)

| Document | For | What you'll learn |
|---|---|---|
| [Roadmap](project/roadmap.md) | Everyone | What is done, what is next, known gaps and backlog |
| [Build effort & capabilities](project/build-effort-and-capabilities.md) | Architects, decision-makers | No-code envelope and effort estimates for new processes |
| [Changelog](project/changelog.md) | Everyone | What changed in each release |
<!-- /nav:catalog -->

## 5. Quick reference

### Demo accounts

After `node prisma/seed.js`: workspace **Genesis Capital** (`genesis-capital`); staff password
`GenesisDemo#2026`; platform administrator `PLATFORM01` / `Platform@123`.

| Role | Employee ID | Name |
|---|---|---|
| CRM Administrator | GCADMIN | Kevin Lam |
| Chief Operating Officer | GCCOO | Anjali Gopee |
| Relationship Manager | GCRM1 | Priya Ramdin |
| Loans Executive | GCLOAN1 | Sophie Lagesse |
| Manager, Loans & Fixed Income | GCLMGR | Rajiv Doorgakant |
| Compliance Officer | GCCOMP1 | Fatima Hossenbux |
| Corporate Advisor | GCADV1 | Camille Rivalland |

All 22 accounts: [Implementation §0](genesis-capital/implementation.md#0-signing-in-to-the-genesis-demo).

### Local URLs

| URL | What |
|---|---|
| `http://localhost:5173` | The application (workspace) |
| `http://localhost:5173/builder` | The Builder (administrators) |
| `http://localhost:5173/platform` | The platform console (platform administrator) |
| `http://localhost:3001` | The API (`/health` for a health check) |

### Stack

React 18 · Vite · Tailwind · React Query 5 · Zustand │ Node.js · Fastify 5 · Prisma 6 │ MySQL 8 │ Redis
(optional) │ JWT (8 h) + refresh tokens, bcrypt.

## 6. Keeping the roadmap current

The journeys, the catalogue above, each section's table of contents and the navigation boxes on every page are
generated from [`navigation.json`](navigation.json). To add or move a document, edit that file and run:

```bash
node docs/tools/build-nav.mjs          # rewrite the navigation blocks
node docs/tools/build-nav.mjs --check  # report broken entries and documents missing from the roadmap
```

Only the text between `<!-- nav:… -->` markers is generated; everything else is hand-written.
