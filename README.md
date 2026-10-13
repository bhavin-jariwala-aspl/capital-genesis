# Genesis CRM Platform

## A Complete, Fully Configurable Enterprise-Grade CRM Platform

> **Latest Update (July 2026):** New standalone **Document Management System
> (DMS)** — pluggable multi-cloud storage (local · S3 · Azure Blob · Google Cloud
> Storage), an admin builder (categories, upload policies, checklists), folders,
> in-document full-text search, merge templates, tracked public sharing with
> engagement analytics, and native e-signature. See
> [DOCUMENT_MANAGEMENT.md](docs/developer-guide/DOCUMENT_MANAGEMENT.md). Also a new
> **Reminders** feature — set time-based
> reminders on any record, get a notification when due, and see a "My Reminders"
> agenda. Plus a platform hardening pass: fixed the field-builder validation
> bug, closed SSRF/DDL-injection gaps, hardened tenant isolation to
> AsyncLocalStorage-only (removing a racy shared-state fallback), bounded the
> record-list query, and repaired list search/sort. Removed ~65 orphaned,
> never-implemented database models (schema trimmed 170 → 106) so the data model
> reflects what actually ships. See
> [docs/project/CHANGELOG.md](docs/project/CHANGELOG.md).
>
> Genesis CRM includes a full **Life Insurance Agency Management System** —
> actuarial quote engine, policy lifecycle, underwriting, claims, commissions,
> and professional PDF document generation.

Genesis CRM is a comprehensive, metadata-driven Customer Relationship Management platform that
combines powerful customization capabilities with enterprise-grade features. Built for organizations
that need complete control over their CRM configuration while maintaining the sophistication of
market-leading platforms.

## 🌟 What Makes Genesis CRM Different

- **🎯 Fully Visual Configuration** — No coding required for forms, workflows, dashboards,
  or custom objects
- **🔧 Complete Enterprise Feature Set** — Email marketing, territory management, customer portals,
  social integration, and more
- **⚡ Metadata-Driven Architecture** — Every UI element is configurable and stored in your database
- **🚀 Real-Time Adaptability** — Changes appear instantly without deployments
- **📊 Reporting Your Team Owns** — Non-technical staff build, share and schedule their own
  reports, and drop any of them onto a dashboard — no developer, no release, no ticket
- **🔌 Seamless Integrations** — Connect with calendars, social platforms, document systems,
  and third-party tools

## 🏆 Key Features

### **Core Platform Capabilities**

1. **Metadata Engine** — All UI definitions (modules, objects, fields, forms, dashboards) live in
   MySQL and are Redis-cached
2. **Drag-and-Drop Form Builder** — Drag field types onto a canvas, configure validations,
   inter-field dependencies, and custom auto-populate functions
3. **Dashboard Builder** — Drag widgets (charts, tables, metrics, pipelines) onto a grid; resize
   freely; wire up REST or JSON data sources
4. **19 Chart Types** — Bar, Line, Area, Pie, Donut, Scatter, Radar, Treemap, Funnel, Heatmap,
   Candlestick, Gauge, RadialBar, Bubble, etc.
5. **Workflow Automation** — Build multi-step process automations visually with conditions,
   actions, delays, notifications, and approval gates. **18 workflows ship pre-configured**,
   covering lead routing and SLAs, quote and payout approvals, underwriting escalation, policy
   renewal and lapse prevention, and claims triage — each benchmarked against the equivalent
   feature in Salesforce, HubSpot, Zoho CRM, Dynamics 365 and Pipedrive
6. **Multi-step Wizards** — Define step-by-step information capture flows
7. **Pipeline/Kanban Board** — Draggable stage-based pipelines per object with forecast weights
   per stage
8. **Role-Based Access** — Two-tier permission model: metadata (UI) permissions + operational
   (scope) permissions

### **🚀 Enterprise CRM Features**

Shipped and wired end-to-end:

1. **Self-Service Reporting & Analytics** — A report builder aimed at business users, not
   analysts: a 26-report starter gallery, a stepped builder where every control is a dropdown,
   nested AND/OR filters with real-data value pick-lists, cross-object fields, named value bands,
   no-code calculated measures, truthful totals, period-over-period comparison, drill-down to the
   underlying records, folders and favourites, role/team sharing that never widens data scope, and
   emailed subscriptions. **Any saved report is also a dashboard widget** (`UiDashboard`, 19 chart
   types), so a new dashboard number never needs a developer. CSV / Excel / PDF export. See
   [REPORTING.md](docs/developer-guide/REPORTING.md) and the
   [user guide](docs/user-guide/19-reports.md)
2. **Social Media Integration** — Multi-platform management, scheduling, and
   lead capture (`social-media.service`)
3. **Email & Templates** — Transactional send + dynamic templates with variable
   resolution and usage analytics
4. **Integrations Framework** — Outbound/inbound webhooks, event subscriptions,
   HMAC signing, SSRF-guarded delivery, and a health dashboard
5. **Workflow Automation & Assignment** — Visual multi-step workflows, and a
   fixed/round-robin/rule-based/load-balanced assignment engine

> **Roadmap (not yet implemented).** The following were previously scaffolded in
> the database only and have been removed from the active schema until they are
> built with real services and UI: **Email Marketing Campaigns**, **Calendar &
> Meeting Management**, **Contract & Deal Management**, **Territory Management &
> Sales Teams**, **Customer Portal & Knowledge Base**, and **Partner/Channel
> Management**. See [docs/project/ROADMAP.md](docs/project/ROADMAP.md).

### **🏥 Insurance Agency Management (New - April 2026)**

1. **Actuarial Quote Engine** — 2017 CSO mortality tables, 6 product
   types, 9 riders, cash value projections, multi-frequency premiums
2. **Full Policy Lifecycle** — Application pipeline, underwriting with
   risk classification, policy issuance, beneficiary management
3. **Claims Workflow** — Filing, investigation, approval, payment
   tracking with timeline events
4. **Commission Tracking** — Auto-commission on policy issuance,
   agent splits, clawback with audit trail
5. **Professional Documents** — Quote summaries, policy illustrations,
   application forms, comparison reports via Chrome headless PDF
6. **11 Insurance Database Tables** — Carriers, products, policies,
   applications, underwriting, claims, commissions with full tenant
   isolation

### **📈 Essential CRM Capabilities**

1. **Product Catalog** — Comprehensive product/service management with pricing and inventory
2. **Quote Management** — Professional quote generation with line items and approval workflows
3. **Email Templates** — Dynamic templates with variable replacement and usage analytics
4. **Document Management System (DMS)** — Standalone, configurable document platform:
   pluggable storage (local · Amazon S3 / S3-compatible · Azure Blob · Google Cloud
   Storage), SHA-256 dedup + versioning, hierarchical folders, in-document full-text
   search (PDF/DOCX/text), an admin builder (categories, upload policies, required-document
   checklists), merge templates → generated documents, tracked public share links with
   engagement analytics, and native e-signature with an audit-trail certificate
5. **Lead Scoring** — Automated qualification with demographic and behavioral scoring
6. **Communication Tracking** — Email tracking and activity/meeting logging via the
   unified Activity timeline
7. **Tasks & Reminders** — Assignable tasks and time-based reminders on any record, with
   snooze/complete, a due-time notification sweep, and a "My Reminders" agenda
   (Overdue / Today / Upcoming)

## 🛠️ Technology Stack

- **Backend:** Node.js + Fastify + Prisma ORM + MySQL + Redis
- **Frontend:** React + Vite + TailwindCSS
- **Database:** MySQL with optimized indexing and full-text search
- **Caching:** Redis for metadata and session management
- **Deployment:** Docker containerized with environment-specific configurations

## Documentation

Complete documentation is organized in the [docs/](docs/) knowledge base.

**[→ docs/INDEX.md](docs/INDEX.md)** — Start here. Find any guide by role or topic.

| Section | Audience | Key Guides |
| ------- | -------- | ---------- |
| [Getting Started](docs/getting-started/) | Everyone | Installation, demo accounts |
| [User Guide](docs/user-guide/) | Sales Teams | Daily operations, products, quotes |
| [Admin Guide](docs/admin-guide/) | Admins | Configuration, permissions, workflows |
| [Developer Guide](docs/developer-guide/) | Developers | Architecture, API, security, contributing |
| [Project](docs/project/) | All | Changelog, roadmap |

## 🚀 Quick Start

### Prerequisites

- Node.js 18+
- MySQL 8.0+
- Redis 6.0+ (optional, will use mock client if unavailable)

### Installation

1. **Clone the repository:**

   ```bash
   git clone https://github.com/your-org/genesis-crm.git
   cd genesis-crm
   ```

2. **Configure the backend:**

   ```bash
   cd backend
   cp .env.example .env
   # Set DATABASE_URL (and Redis, if you use it) in .env
   npx prisma migrate deploy
   npx prisma db seed
   cd ..
   ```

3. **Install and run — one command for both servers:**

   ```bash
   make install    # npm install in backend and frontend
   make start      # both servers in the background
   ```

   | Command | What it does |
   | ------- | ------------ |
   | `make start` | Starts backend and frontend, waits until both answer, prints the URLs |
   | `make stop` | Stops both |
   | `make restart` | Stops, then starts |
   | `make status` | What is running, on which ports, and whether the database answers |
   | `make logs` | Follows both logs (Ctrl-C detaches; the servers keep running) |
   | `make dev` | Runs both in the foreground instead (Ctrl-C stops both) |

   Logs and pid files live in `.dev/`. To run the servers by hand instead, use
   `npm run dev` in `backend/` and in `frontend/` in two terminals.

4. **Access the platform:**

   - Frontend: <http://localhost:5173>
   - Backend API: <http://localhost:3001> (health check at `/health`)

## 🎯 Use Cases

**Perfect for organizations that need:**

- **Customizable CRM Solutions** — Adapt the platform to your unique business processes
- **Enterprise-Grade Features** — All the capabilities of major CRM platforms without vendor lock-in
- **Rapid Deployment** — Get started quickly with pre-built modules and workflows
- **Complete Data Control** — Your data stays in your infrastructure
- **Cost-Effective Growth** — Scale without per-user licensing fees
- **Integration Flexibility** — Connect with your existing tools and systems

## Contributing

We welcome contributions! See [docs/developer-guide/CONTRIBUTING.md](docs/developer-guide/CONTRIBUTING.md) for guidelines.

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 📧 Support

For support and questions:

- 📖 Check the [documentation](docs/)
- 🐛 Open an [issue](https://github.com/your-org/genesis-crm/issues)
- 💬 Start a [discussion](https://github.com/your-org/genesis-crm/discussions)

---

**Genesis CRM** - Empowering organizations with complete CRM control and enterprise-grade capabilities.
# pbtb-genesis
# swan-genesis
