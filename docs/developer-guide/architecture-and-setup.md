# Genesis CRM — Architecture & Development Setup

<!-- nav:top -->
> **[Docs roadmap](../README.md)** › **[Developer guide](README.md#core-reading-in-order)** › 1 of 9 · **For:** Engineers
> ← [AWS deployment](../platform-operations/aws-deployment.md) *(Platform operations)* · [Database schema](database-schema.md) →
> New to Genesis? Background: [Understanding Genesis › How a request travels](../understanding/04-how-a-request-travels.md)
<!-- /nav:top -->

For: Software Developers and Technical Contributors

---

## Table of Contents

1. [VS Code Project Setup](#vs-code-project-setup)
2. [Development Environment](#development-environment)
3. [Architecture Overview](#architecture-overview)
4. [Runtime Data Loading Pipeline](#runtime-data-loading-pipeline)
5. [Backend Development](#backend-development)
6. [Frontend Development](#frontend-development)
7. [Database Management](#database-management)
8. [Troubleshooting](#troubleshooting)

---

## VS Code Project Setup

This section walks through setting up Genesis in Visual Studio
Code from a fresh clone to a running development environment.

### Step 1 — Clone and Open in VS Code

```bash
git clone <repo-url> genesis
code genesis
```

Or from VS Code: **File > Open Folder** and select the `genesis`
directory.

### Step 2 — Install Recommended Extensions

Install the following extensions for the best development
experience. Open the Extensions panel (`Cmd+Shift+X` on Mac,
`Ctrl+Shift+X` on Windows/Linux) and search for each:

| Extension | ID | Purpose |
|---|---|---|
| Prisma | `Prisma.prisma` | Schema syntax highlighting, formatting, auto-complete |
| ESLint | `dbaeumer.vscode-eslint` | JavaScript/JSX linting |
| Tailwind CSS IntelliSense | `bradlc.vscode-tailwindcss` | Class name auto-complete, hover previews |
| DotENV | `mikestead.dotenv` | `.env` file syntax highlighting |
| MySQL (optional) | `cweijan.vscode-mysql-client2` | Browse database from sidebar |

### Step 3 — Install Dependencies

Open the VS Code integrated terminal (`Ctrl+`` `) and run:

```bash
# Backend dependencies
cd backend && npm install

# Frontend dependencies
cd ../frontend && npm install
```

### Step 4 — Configure Environment

```bash
cd backend
cp .env.example .env
```

Open `backend/.env` in VS Code and update:

```dotenv
# Point to your MySQL instance
DATABASE_URL="mysql://root:yourpassword@localhost:3306/genesis_crm"

# Set a strong secret (minimum 32 characters)
JWT_SECRET="replace-with-a-long-random-secret-key-at-least-32-chars"
```

Create the database if it does not exist:

```bash
mysql -u root -p -e "CREATE DATABASE IF NOT EXISTS genesis_crm;"
```

### Step 5 — Set Up the Database

```bash
cd backend

# Apply all migrations
npx prisma migrate deploy

# Seed demo data (platform layer + Genesis Capital workspace + PLATFORM01)
node prisma/seed.js
```

> **Warning:** `seed.js` wipes all existing data. It refuses a non-local
> `DATABASE_URL` unless `--allow-remote` is passed.

### Step 6 — Start Development Servers

Open two terminals in VS Code (click the **+** icon in the
terminal panel or use **Terminal > Split Terminal**):

**Terminal 1 — Backend:**

```bash
cd backend
npm run dev
# Output: Server listening at http://0.0.0.0:3001
```

**Terminal 2 — Frontend:**

```bash
cd frontend
npm run dev
# Output: Local: http://localhost:5173/
```

Open `http://localhost:5173` in your browser. The Vite dev
server proxies all `/api/*` requests to the backend at port
3001 automatically.

### Step 7 — Log In

Use one of the seeded accounts:

| Role | Employee ID | Password |
|---|---|---|
| CRM Administrator (full access + Builder) | `GCADMIN` | `GenesisDemo#2026` |
| Relationship Manager | `GCRM1` | `GenesisDemo#2026` |
| Platform Administrator | `PLATFORM01` | `Platform@123` |

All 22 staff accounts are listed in
[genesis-capital/implementation.md §0](../genesis-capital/implementation.md#0-signing-in-to-the-genesis-demo).

### VS Code Workspace Settings (Optional)

Create `.vscode/settings.json` in the project root for
consistent editor behaviour across the team:

```json
{
  "editor.formatOnSave": true,
  "editor.defaultFormatter": "dbaeumer.vscode-eslint",
  "eslint.workingDirectories": ["frontend", "backend"],
  "tailwindCSS.rootFontSize": 16,
  "files.exclude": {
    "**/node_modules": true,
    "**/dist": true
  },
  "[prisma]": {
    "editor.defaultFormatter": "Prisma.prisma"
  }
}
```

### VS Code Debug Configuration (Optional)

Create `.vscode/launch.json` to enable one-click debugging:

```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "name": "Backend (Fastify)",
      "type": "node",
      "request": "launch",
      "cwd": "${workspaceFolder}/backend",
      "runtimeExecutable": "npm",
      "runtimeArgs": ["run", "dev"],
      "console": "integratedTerminal",
      "skipFiles": ["<node_internals>/**"]
    },
    {
      "name": "Backend Tests",
      "type": "node",
      "request": "launch",
      "cwd": "${workspaceFolder}/backend",
      "runtimeExecutable": "npx",
      "runtimeArgs": ["jest", "--runInBand", "${relativeFile}"],
      "console": "integratedTerminal"
    }
  ]
}
```

Press `F5` to start the backend with the debugger attached.
Set breakpoints in any `.js` file under `backend/src/`.

### Key Ports

| Service | URL | Notes |
|---|---|---|
| Frontend (Vite) | `http://localhost:5173` | Open in browser |
| Backend (Fastify) | `http://localhost:3001` | API server |
| Prisma Studio | `http://localhost:5555` | `npx prisma studio` |
| MySQL | `localhost:3306` | Database |
| Redis | `localhost:6379` | Optional cache |

### NPM Scripts Quick Reference

**Backend** (run from `backend/`):

| Script | Command | Description |
|---|---|---|
| `npm run dev` | nodemon | Start with auto-reload |
| `npm start` | node | Production start |
| `npm test` | jest | Run test suite |
| `npm run db:seed` | prisma seed | Seed demo data |
| `npm run db:studio` | prisma studio | Database browser |
| `npm run db:migrate` | prisma migrate dev | Create migration |
| `npm run db:generate` | prisma generate | Regenerate client |

**Frontend** (run from `frontend/`):

| Script | Command | Description |
|---|---|---|
| `npm run dev` | vite | Start dev server |
| `npm run build` | vite build | Production build |
| `npm run lint` | eslint | Check for issues |
| `npm run test` | vitest run | Run tests |

---

## Development Environment

### Prerequisites

| Tool | Minimum Version | Check |
| ---- | --------------- | ----- |
| Node.js | 18.0 LTS+ | `node --version` |
| npm | 9.0+ | `npm --version` |
| MySQL | 8.0+ | `mysql --version` |
| Git | 2.30+ | `git --version` |

**Optional**: Redis 6+ (caching), Docker

### Local Setup

```bash
# Clone repository
git clone <repo-url> genesis
cd genesis

# Install dependencies
cd backend && npm install
cd ../frontend && npm install

# Configure environment
cp backend/.env.example backend/.env
# Edit backend/.env with your database credentials

# Set up database
cd backend
npx prisma migrate deploy
node prisma/seed.js

# Start development servers (two terminals)
cd backend && npm run dev   # http://localhost:3001
cd frontend && npm run dev  # http://localhost:5173
```

### Environment Variables

```bash
# Database
DATABASE_URL="mysql://user:password@localhost:3306/genesis_crm"

# Redis (optional — app degrades gracefully without it)
REDIS_HOST="127.0.0.1"
REDIS_PORT=6379
REDIS_PASSWORD=""

# JWT Authentication
JWT_SECRET="your-super-secret-jwt-key-here-minimum-32-chars"
JWT_EXPIRY="8h"

# Server
PORT=3001
HOST="0.0.0.0"
NODE_ENV="development"

# Cache TTL (seconds)
CACHE_TTL_METADATA=3600
CACHE_TTL_SESSION=28800
```

---

## Architecture Overview

### System Architecture

```text
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Frontend      │    │   Backend       │    │   Database      │
│   React + Vite  │◄──►│   Fastify       │◄──►│   MySQL/Prisma  │
│   TailwindCSS   │    │   Node.js       │    │   Redis Cache   │
└─────────────────┘    └─────────────────┘    └─────────────────┘
```

### Technology Stack

**Frontend**:

- React 18 with hooks
- Vite 7 for build tooling and HMR
- TailwindCSS for utility-first styling
- TanStack React Query v5 for server state management and caching
- React Router v6 for client-side routing
- Vitest + React Testing Library for testing
- Zustand for global state (auth, theme)

**Backend**:

- Fastify 5 web framework (high performance, schema-driven)
- Prisma 6 ORM for database modeling and migrations
- JWT for authentication and authorization
- bcryptjs for password hashing (salt rounds: 12)
- Fastify's built-in Pino logger for structured logging

**Database**:

- MySQL 8.0+ as primary database
- Redis 6+ for caching and session storage (optional)

### Project Structure

```text
genesis/
├── backend/
│   ├── src/
│   │   ├── app.js              # Application setup, plugin registration
│   │   ├── index.js            # Server entry point
│   │   ├── config/             # Configuration files
│   │   ├── middleware/         # authenticate.js, requireAdmin.js, tenant-scope.js
│   │   ├── plugins/            # jwt.js, cors.js, redis.js
│   │   ├── routes/
│   │   │   ├── auth/           # Login, logout, password change
│   │   │   ├── builder/        # Admin-only builder API
│   │   │   ├── analytics/      # Live dashboard datasets (catalog + data)
│   │   │   └── runtime/        # Runtime record/module API
│   │   ├── services/
│   │   │   ├── analytics.service.js           # Dashboard dataset catalog + tenant-scoped aggregations
│   │   │   ├── industry-templates.js          # Pre-built email templates for 11 industries
│   │   │   └── ...             # All other business logic services
│   │   └── utils/
│   │       ├── html-to-pdf.js  # Chrome headless PDF generation
│   │       └── ...             # schemas.js, helpers
│   ├── prisma/
│   │   ├── schema.prisma       # 55+ model database schema
│   │   ├── migrations/         # Database migration files
│   │   └── seed.js             # Demo data seeder
│   └── tests/                  # Backend test suites (416 tests, 28 suites)
├── frontend/
│   ├── src/
│   │   ├── App.jsx             # Main application component
│   │   ├── main.jsx            # Application entry point
│   │   ├── components/
│   │   │   ├── layout/         # Sidebar, Header, ProtectedRoute
│   │   │   └── ui/             # Button, DataTable, Modal, Spinner, etc.
│   │   ├── pages/
│   │   │   ├── builder/        # Builder pages (admin only)
│   │   │   ├── platform/       # Platform admin pages
│   │   │   └── runtime/        # Runtime pages
│   │   ├── hooks/              # Custom React hooks
│   │   ├── services/           # API service layer
│   │   ├── store/              # Zustand stores (authStore, themeStore)
│   │   └── utils/              # Helper utilities (formatters.js, metadata-helpers.js, helpers.js, ...)
│   └── tests/                  # Frontend tests (22+ Vitest tests)
└── docs/                       # Documentation knowledge base
```

### Metadata-Driven Architecture

Genesis CRM is **metadata-driven**: every module, object, field, form, pipeline, dashboard, and workflow is defined
in the database and rendered at runtime. No code deployment is needed to add or change modules.

**Key metadata tables:**

| Table | Purpose |
| ----- | ------- |
| `ui_modules` | Sidebar modules (Prospects, Clients, Opportunities, etc.) — `category` column groups into sidebar sections |
| `ui_objects` | Objects within modules (Lead, Opportunity, etc.) |
| `ui_fields` | Fields on each object |
| `ui_forms` / `ui_form_fields` | Form layouts (create/edit) |
| `ui_pipelines` / `ui_pipeline_stages` | Kanban pipeline definitions |
| `ui_dashboards` / `ui_dashboard_panels` | Dashboard widget configuration |
| `ui_workflows` / `ui_workflow_steps` | Workflow automation rules |
| `ui_wizards` / `ui_wizard_steps` | Guided multi-step forms |
| `ui_permissions` | Metadata entity access control (can_view/can_edit) |
| `operational_permissions` | Task/activity scope control |

**Runtime request flow (high-level):**

```text
Browser GET /module/sales
  → Frontend: reads URL, calls GET /api/runtime/modules
  → Backend: MetadataService loads module from DB or Redis cache
  → Backend: PermissionService filters by user role
  → Frontend: renders sidebar and module list dynamically
```

> For the full step-by-step loading pipeline see the
> [Runtime Data Loading Pipeline](#runtime-data-loading-pipeline) section below.

---

## Runtime Data Loading Pipeline

This section documents exactly how modules, forms, fields, and record data are loaded
end-to-end. There are two API layers:

| API prefix | Auth | Purpose |
| --- | --- | --- |
| `/api/metadata/*` | `requireAdmin` | Builder-time CRUD — create/update/delete metadata |
| `/api/runtime/*` | `authenticate` | Runtime renderer — role-filtered read-only views |

---

### 1. Module Loading (Sidebar Navigation)

**Source file:** `frontend/src/components/layout/Sidebar.jsx`

```text
Sidebar mounts
  → useQuery(['runtime-modules'], staleTime: 300 000 ms)
  → GET /api/runtime/modules
  → backend/src/routes/runtime/index.js  GET /modules
      → MetadataService.getModules()
          → CacheService.remember('modules:all', ...)
              → db.uiModule.findMany({ is_active: true, include: { objects } })
      → PermissionService.filterMetadataByRole(modules, 'module', roleName)
          → also filters each module's nested objects[] by role
  → response: [ { id, name, label, icon, color, category, objects: [...] } ]
  → Sidebar groups modules by `category` (crm, tools)
  → Each category renders as a separate sidebar section with its own header
  → Categories are defined in MODULE_CATEGORIES (frontend/src/utils/constants.js)
```

Each module entry already contains its nested `objects[]` — no second request needed
to render the sidebar.

**Redis cache key:** `modules:all` (TTL: `CACHE_TTL_METADATA`, default 3 600 s)

---

### 2. Module Page — Object & Records

**Source file:** `frontend/src/pages/runtime/ModulePage.jsx`  
**Route:** `/module/:moduleId/object/:objectId`

Three sequential queries fire in order:

| Step | React Query key | API call | What it loads |
| --- | --- | --- | --- |
| 1 | `['runtime-module', moduleId]` | `GET /runtime/module/:id` | Module + permission-filtered objects |
| 2 | `['runtime-object', objectId]` | `GET /runtime/object/:id` | Object + active fields + attached pipelines |
| 3 | `['runtime-records', objectId]` | `GET /runtime/records?object_id=X` | All hydrated records for that object |

**Record hydration** (`RecordService.getRecords` → `#hydrateMany`). A record's fields are stored one row per field
(see [How data is stored and read](../understanding/03-how-data-is-stored.md)), so a list is read in two steps and
reassembled in memory:

```text
GET /api/runtime/records?object_id=X[&stage_id=&limit=&offset=]
  → RecordService.getRecords(objectId, stageId, viewer)
      1. db.record.findMany({ object_id, deleted_at: null, ...ownerFilter(viewer) })
            newest first, paginated (limit/offset) or capped at LIST_SAFETY_CAP
      2. #hydrateMany(records) — one parallel batch, all keyed by the record ids:
            db.recordFieldValue.findMany      ← where every Genesis Capital object's fields live
            db.crmLead / crmContact / crmAccount / crmOpportunity / crmCase / crmLeadIntake
            db.product / emailTemplate        ← typed stores; empty unless an object uses a reserved name
         per record: data = { ...fieldValues, ...nonNullTypedColumns }
      3. #attachLookupLabels  — adds the display title of each lookup target
      4. #maskPii             — masks protected fields the viewer may not see
```

Each value row is turned back into a JavaScript value by `fromTypedRow` (the most specific filled column wins:
`json_value > date_value > bool_value > num_value > str_value`).

---

### 3. Form Loading (Create / Edit)

**Source file:** `frontend/src/pages/runtime/RecordFormPage.jsx`  
**Routes:** `.../object/:objectId/new` | `.../object/:objectId/edit/:recordId`

The form loading sequence:

```text
1. GET /api/runtime/module/:moduleId
     → resolves active UiObject from module.objects[]

2. GET /api/metadata/forms?object_id=X
     → MetadataService.getForms(objectId)
     → returns list of UiForm rows (id, name, form_type: 'create'|'edit')
     → frontend picks: form_type === 'edit' (edit mode) or 'create' (new mode)
                       falls back to first form if no exact match
                       falls back to auto-form if no forms exist at all

3. GET /api/runtime/form/:formId
     → MetadataService.getFormForViewer(id, roleName)
         → getFormFull(id)  [Redis cached]
             → db.uiForm.findUnique({
                 include: {
                   field_layouts: {             ← UiFormFieldLayout rows
                     where: { is_visible: true },
                     orderBy: [row, col, order_index],
                     include: {
                       field: {                 ← UiField metadata
                         include: { validations, dependencies_as_source,
                                    dependencies_as_target }
                       }
                     }
                   }
                 }
               })
         → role-permission filter:
             can_view=false → field layout removed entirely
             can_edit=false → field.config.always_disabled = true

4. [Edit mode only] GET /api/runtime/records/:recordId
     → RecordService.getRecord(id)
     → #hydrateCrm(record) — same merge strategy as list view but single record
     → existingValues = record.data
     → FormRenderer: react-hook-form reset(coerced)
         date ISO strings truncated: "2026-04-05T00:00:00Z" → "2026-04-05"

[Fallback — no designer form exists]
     → GET /api/runtime/object/:objectId
     → buildAutoFormMeta(fields): auto 2-column grid layout, no col_span config
     → banner shown: "Using an auto-generated form"
```

**Redis cache key for a form:** `form:full:{id}` (not cached when role-filtered)

---

### 4. Field Layout Normalisation

**Source function:** `normaliseFormMeta()` in `RecordFormPage.jsx`

```text
rawForm.field_layouts[]
  → sorted by order_index
  → each layout entry mapped to:
      {
        ...field,           ← all UiField columns (label, field_type, options, config, …)
        field_name: field.name,
        col_span:   Math.round(fl.col_span × (12 / form.columns)),
        position:   fl.order_index,
        row:        fl.row,
        col:        fl.col,
      }
  → result: { ...form, fields: [...], dependencies: [...] }
```

The 12-column grid system maps designer `col_span` (1–`form.columns`) to Tailwind
`col-span-{n}` (1–12). Default `form.columns` is 2, so each half-width field becomes
`col-span-6` and a full-width field becomes `col-span-12`.

**Auto-form fallback** (`buildAutoFormMeta`):
Wide field types (`textarea`, `richtext`, `json`) get `col_span=12`; all others get `col_span=6`.
Rows and columns are computed greedily left-to-right.

---

### 5. FormRenderer — Field State & Computed Fields

**Source file:** `frontend/src/components/runtime/FormRenderer.jsx`

```text
FormRenderer receives { formMeta, defaultValues }
  → useForm({ defaultValues })           ← react-hook-form
  → useEffect on defaultValues change    → reset(coerced)  (handles async edit data)
  → watch() → formValues (live)
  → computeFieldStates(dependencies, formValues, fields)
      → evaluates dependency rules (show/hide/enable/disable/require)
      → returns { [field_name]: { visible, disabled, required } }
  → useEffect on formValues change
      → for each field with config.computed.fn:
          computeField(fn, formValues) — executes sandboxed expression
          setValue(field_name, result)  — updates form without re-validation
  → sortedFields.map(field => ...)
      → skips if state.visible === false
      → wraps in <div style={{ gridColumn: `span ${col_span}` }}>
      → renders <FieldRenderer field={...} ... />
```

---

### 6. FieldRenderer — Input Type Dispatch

**Source file:** `frontend/src/components/runtime/FieldRenderer.jsx`

| `field_type` | Rendered component | Binding |
| --- | --- | --- |
| `heading` | `<h3>` (layout only) | none |
| `divider` | `<hr>` (layout only) | none |
| `status_tracker` | `<StatusTracker recordId={...} config={...}>` (display only) | none |
| `rich_text` | `<TextArea rows=5>` | `Controller` |
| `select`, `lookup` | `<Select options={...}>` | `Controller` |
| `multi_select` | checkbox group | `Controller` |
| `radio` | `<RadioGroup>` | `Controller` |
| `checkbox` | `<Checkbox>` | `Controller` |
| `currency` | `<CurrencyInput>` | `Controller` |
| `number`, `integer`, `decimal`, `percent` | `<Input type="number">` | `register` |
| `date` | `<Input type="date">` | `register` |
| `datetime` | `<Input type="datetime-local">` | `register` |
| `time` | `<Input type="time">` | `register` |
| everything else (`text`, `email`, `url`, …) | `<Input type="text">` | `register` |

Validation rules are compiled by `buildValidationRules(field)` from `frontend/src/utils/helpers.js`
and passed to either `register(fieldName, rules)` or `Controller rules={...}`.
In `readOnly` mode no validation rules are attached.

**`status_tracker` (display-only timeline).** Renders a logistics-style status
timeline (Amazon / UPS / Bluedart) for a record via
`frontend/src/components/ui/StatusTracker.jsx` — a milestone stepper (reusing
`StatusStepper`), a current-status banner, and a dated event log. It reads
`GET /api/runtime/records/:id/status-events` and takes its milestones from
`field.config.stages`. `FormRenderer` threads `recordId` down to
`FieldRenderer`, so the timeline shows in edit mode and falls back to a "saved
record required" placeholder during create. Events are appended automatically
on pipeline stage changes (`RecordService.updateRecordStage` →
`status_events`) and can be added manually via
`POST /api/runtime/records/:id/status-events`.

---

### 7. Record Save Flow

```text
FormRenderer: handleSubmit(formData)
  → RecordFormPage: saveMutation
      Create: POST /api/runtime/records  { object_id, data: formData, stage_id? }
      Edit:   PUT  /api/runtime/records/:id  { data: formData }
  → RecordService.createRecord (updateRecord follows the same shape)
      → #assertObjectEditPermission(objectId, viewer)
      → #withDefaults → compute.applyFormulas → #assertValid   (nothing is written if validation fails)
      → #generateAutoNumbers (then formulas again, so a title can include the number)
      → db.record.create({ object_id, pipeline_stage_id (first stage if none), created_by,
                           assigned_to, tenant_id, business_unit_id / barrier_zone_id stamps })
      → #upsertCrmEntity — routes the field values by object name (crm-storage-map):
          reserved name (lead, contact, …) → typed crm_* row, any other fields → record_field_values
          every other object               → record_field_values only
        record_field_values write: one createMany for new fields, then per-field upserts (5 at a time)
        str_value always filled + num|bool|date|json_value as applicable; protected fields encrypted
      → #audit(...)                                   fire-and-forget
      → AssignmentService.assign(...) then emit 'record.created' (workflows, SLA, notifications listen)
      → #maybeScoreLead, #refreshParents (parent roll-ups)
  There is no transaction around the envelope + value writes; each individual write is atomic.
  → invalidateRecordData(queryClient, { recordId, objectId })   (utils/invalidate.js)
  → navigate(backPath)
```

---

### 8. Caching Summary

| Cache key pattern | Populated by | Invalidated by |
| --- | --- | --- |
| `modules:all` | `getModules()` | `createModule`, `updateModule`, `deleteModule` |
| `module:{id}` | `getModule(id)` | `updateModule`, `deleteModule` |
| `objects:module:{moduleId}` | `getObjects(moduleId)` | `createObject`, `updateObject`, `deleteObject` |
| `object:{id}` | `getObject(id)` | `updateObject`, `deleteObject`, any field write on that object (`invalidateField` — the cached object embeds its field list) |
| `form:full:{id}` | `getFormFull(id)` | `updateForm`, `deleteForm`, `upsertFormLayout` |
| `field:{id}` | `getField(id)` | `updateField`, `deleteField`, validation create/update/delete (with the real object id) |
| `fields:object:{objectId}` | `getFields(objectId)` | any field write on that object, `invalidateObject` |
| `pipeline:object:{objectId}` | `DashboardService` pipeline reads (embed the object and module) | pipeline writes, `invalidateObject` |

`getFormForViewer()` (role-filtered form) is **never Redis-cached** — it is computed
per-request based on the viewer's role.

Separately, `RecordService.clearMetadataCaches()` clears the per-process memos (object names, field
defaults, PII flags, child-reader map); it is called on every field/object write.

---

## Backend Development

### Fastify Framework

Fastify provides schema-validated, high-performance routes:

```javascript
// backend/src/app.js
const fastify = require('fastify')({ logger: true });

await fastify.register(require('./plugins/jwt'));
await fastify.register(require('./plugins/redis'));

await fastify.register(require('./routes/auth'), { prefix: '/api/auth' });
await fastify.register(require('./routes/builder'), { prefix: '/api/builder' });
await fastify.register(require('./routes/runtime'), { prefix: '/api/runtime' });

module.exports = fastify;
```

### Record Storage & Pipeline Automation

**Generic status timeline** (migration `20260611065018_add_status_events`):

| Table | Purpose |
| ----- | ------- |
| `status_events` | Generic per-record status timeline backing the `status_tracker` fieldtype. One row per milestone/scan event (`status`, `title`, `description`, `location`, `event_type`, `occurred_at`, `changed_by`). Works for any object — auto-appended on pipeline stage changes and via the status-events API. |

**Record data hydration**: `RecordService.#hydrateMany()` (lists) and `#hydrateCrm()` (one record) both build
`record.data` from `record_field_values`, then lay any non-null typed `crm_*` columns on top. For Genesis Capital the
typed layer is always empty. `FIELD_ALIAS` maps form field names to `crm_*` column names.

The lead-conversion automation below applies only to tenants with objects named `lead_intake` / `prospect` /
`lead`. Genesis Capital converts an `enquiry` with the workflow `genesis_enquiry_conversion`: moving the enquiry to its "Converted" stage creates the `party`, the relationship, a KYC case and, for loans, the application.

**Automatic pipeline stage sync**: Lead conversions move the source record's
`pipeline_stage_id` to the matching stage by name:

- `CrmService.convertLeadToProspect()` → lead record → "converted"
- `CrmService.convertLead()` → prospect record → "converted"

**Kanban drag-and-drop automation** (pipeline → conversion): The reverse
direction is also supported. When a user drags a card to a new Kanban
lane via `PATCH /api/runtime/records/:id/stage`, the route handler
auto-triggers the corresponding conversion:

- Lead → "converted" lane: calls `crmSvc.convertLeadToProspect()` (creates a Prospect)
- Prospect → "converted" lane: calls `crmSvc.convertLead()` + EAV copy

The response includes `automation: { action, error? }` so the frontend
can react (e.g., navigate to the target module). Automation failures
are logged but do not block the stage update.

The `Pipeline.jsx` component also adds an "Unsorted" column for records
with no `pipeline_stage_id`, preventing them from disappearing in Kanban.

### Route Development Pattern

```javascript
// backend/src/routes/runtime/index.js
async function routes(fastify, options) {
  const { authenticate } = fastify;

  fastify.get('/modules', {
    preHandler: [authenticate],
    schema: {
      response: {
        200: { type: 'array', items: { /* module schema */ } }
      }
    }
  }, async (request, reply) => {
    const modules = await fastify.metadataService.getModulesForViewer(request.user);
    return modules;
  });
}

module.exports = routes;
```

### Service Layer Pattern

All business logic lives in service classes injected at startup:

```javascript
// backend/src/services/record.service.js
class RecordService {
  constructor(prisma, options = {}) {
    this.db = prisma;
    this.cache = options.cache;
  }

  async getRecord(id, user) {
    const recordId = parseInt(id);
    if (isNaN(recordId) || recordId <= 0) throw new Error('Invalid record ID');

    const record = await this.db.record.findUnique({ where: { id: recordId } });
    await this.#assertRecordAccess(record, user);
    return record;
  }
}
```

**Key services and their responsibilities:**

| Service | File | Responsibility |
| ------- | ---- | -------------- |
| MetadataService | `metadata.service.js` | Module/object/field/form loading + caching |
| RecordService | `record.service.js` | CRUD for all runtime records + EAV storage |
| WorkflowService | `workflow.service.js` | Workflow execution engine |
| crm-storage-map | `crm-storage-map.js` | Not a service — the shared map of which store owns an object's field data (first-class `crm_*` table vs typed EAV), plus the form↔column alias maps. Imported by RecordService and WorkflowService so an automation resolves a field exactly the way an API write does |
| PermissionService | `permission.service.js` | Two-tier permission enforcement |
| AssignmentService | `assignment.service.js` | Lead/record assignment engine |
| SearchService | `search.service.js` | Cross-object global search |
| ImportService | `import.service.js` | CSV import pipeline |
| ForecastService | `forecast.service.js` | Pipeline forecasting and quotas |
| IntegrationService | `integration.service.js` | Event-driven webhook framework: subscribes to the domain event bus and fans CRM events out to signed, retried, SSRF-protected outbound webhooks; receives inbound webhooks and bridges them to workflows |
| DomainEventBus | `events.service.js` | In-process publish/subscribe backbone that decouples domain-event production (record create/update/delete/field-change) from consumption (WorkflowService automations + IntegrationService webhooks) |
| AuthService | `auth.service.js` | Authentication and password management |

### Authentication Flow

```javascript
// backend/src/middleware/authenticate.js
async function authenticate(request, reply) {
  const token = request.headers.authorization?.replace('Bearer ', '');
  if (!token) return reply.code(401).send({ error: 'No token provided' });

  const decoded = await request.jwtVerify();
  // decoded.employeeId, decoded.role are available
  request.user = decoded;
}
```

Roles are stored in the `employees` table. Role hierarchy: `super_admin > admin > manager > user`.

Builder routes use `requireAdmin` middleware — only `admin` and `super_admin` can access them.

### Multi-Tenant Row-Level Isolation

**Implementation:** `backend/src/middleware/tenant-scope.js`

Tenant isolation is enforced via a Prisma Client extension (`$extends`)
that intercepts all queries and injects `tenant_id` filters:

- **Read operations** (`findMany`, `count`, etc.): `WHERE tenant_id = ?`
  is added automatically.
- **Create operations**: `tenant_id` is injected into the `data` object.
- **Write-with-WHERE operations** (`update`, `delete`, `upsert`):
  `tenant_id` is added to the `WHERE` clause.
- **Global models** (e.g., `Tenant`, `SubscriptionPlan`, `FeatureFlag`)
  are excluded from tenant filtering.

Tenant context is resolved **solely** from **AsyncLocalStorage**
(`tenantContext`), set per-request by the Fastify `authenticate` preHandler
via `tenantContext.enterWith({ tenantId })`. On Node 18+/Fastify 5 this
propagates reliably from the preHandler to the route handler and stays
isolated across concurrent requests (verified in
`tests/tenant-als-propagation.test.js`).

> **Historical note:** earlier versions also kept a shared-instance
> `prisma._requestTenantId` fallback because an older stack didn't propagate
> ALS across the hook→handler boundary. That fallback was a process-wide
> singleton and could cross-scope concurrent requests, so it was **removed**
> (July 2026). Do not reintroduce a shared mutable for tenant context.

> **Important for developers (v4.0.4):** Always pass `tenant_id`
> explicitly to `.create()` calls inside `$transaction` callbacks. The
> `$extends` query handler may not reliably inject `tenant_id` inside
> interactive transactions. Use `const tenantId = getTenantId()` before
> the transaction and pass it to every create call within the block.

```javascript
// Correct pattern for $transaction creates
const { getTenantId } = require('../middleware/tenant-scope');

async createEntity(data) {
  const tenantId = getTenantId(); // resolve BEFORE the transaction
  return this.db.$transaction(async (tx) => {
    await tx.someModel.create({
      data: { ...fields, tenant_id: tenantId },
    });
  });
}
```

### Auto-Number Field Generation (v4.0.5+)

**Implementation:** `RecordService.#generateAutoNumbers()` in `record.service.js`

Any `UiField` with `config.auto_number` will have its value auto-generated
when a record is created via `RecordService.createRecord()`. The generation
runs before the record is persisted, so the number is available in EAV
and in any workflow triggers.

```javascript
// Field metadata (seed.js example)
{ name: 'document_number', config: { auto_number: { prefix: 'DOC-', format: 'YYYY-NNN' } } }
// Generates: DOC-2026-001, DOC-2026-002, ...
```

Sequence numbers are scoped per tenant — the query always filters
`recordFieldValue` by `tenant_id` to prevent cross-tenant collisions.

### Input Validation

All IDs must be validated with `parseInt()` + bounds checking:

```javascript
// Correct pattern
const productId = parseInt(id);
if (isNaN(productId) || productId <= 0) throw new Error('Invalid product ID');

// Wrong — never use Number() for IDs
const productId = Number(id); // DO NOT DO THIS
```

---

## Frontend Development

### React Query v5 — Critical Notes

> **Critical:** React Query v5 changed `useMutation` to accept a single options object only.
> There is NO second argument. This is a breaking change from v4.

```javascript
// React Query v5 — CORRECT
const mutation = useMutation({
  mutationFn: (data) => runtimeService.createRecord(objectId, data),
  onSuccess: () => {
    invalidateRecordData(queryClient);   // never hand-pick query keys — see below
  },
  onError: (error) => {
    console.error('Mutation failed:', error);
  },
});

// Use isPending (NOT isLoading — removed in v5)
if (mutation.isPending) return <Spinner />;
```

### Invalidation after mutations — `utils/invalidate.js`

Never hand-pick query keys after a record or metadata mutation; call one of the two helpers.
Hand-picked keys were how lists went stale: the workflow action button invalidated `['records']`,
which no query uses; the Edit form reopened with values from before the last save; imports,
approvals and conversions did not refresh lists; builder saves took up to 5 minutes (React Query)
/ 30 minutes (metadata store) to reach runtime pages.

| Helper | Used by | What it does |
| --- | --- | --- |
| `invalidateRecordData(queryClient)` | Every record mutation — form save, Kanban move, bulk delete/reassign, convert, wizard finish, import, approval decision, workflow action button, Trash restore/unmerge/purge, social mention→lead | Invalidates by prefix: runtime-records, runtime-record, related, audit, status-events, activities, tasks, lookup-label, lookup-search, widget-data, runtime-dashboard, report-run, forecast, approvals, records-trash, lead-score-*, portal-list, sla-dashboard; plus one delayed pass (~1.8 s) for records, related, activities and status events so results of after-save workflows appear |
| `invalidateMetadata(queryClient)` | Module / Form / Pipeline / Wizard / Dashboard builder saves | Refreshes the runtime metadata keys and reloads the metadata store (bootstrap) |

The open record panel (360° view) re-reads the record, so it follows saves, stage moves and workflow
results while open. Closing it removes `?record=` from the URL so the same search result or
notification reopens it.

### Component Import Convention

> **Important:** All UI components (`Button`, `DataTable`, `Modal`, `Spinner`, etc.) use **default exports**.
> Always import them as default imports.

```javascript
// CORRECT
import Button from '../components/ui/Button';
import DataTable from '../components/ui/DataTable';
import Modal from '../components/ui/Modal';

// WRONG — will cause "not a function" runtime error
import { Button } from '../components/ui/Button';
```

### State Management

**Server state**: TanStack React Query — all data fetched from the API

```javascript
const { data, isLoading, error } = useQuery({
  queryKey: ['records', objectId, searchTerm],
  queryFn: () => runtimeService.getRecords(objectId, { search: searchTerm }),
  staleTime: 30_000,
});
```

**Global state**: Zustand stores

```javascript
// src/store/authStore.js
import { create } from 'zustand';
const useAuthStore = create((set) => ({
  user: null,
  token: null,
  setAuth: (user, token) => set({ user, token }),
  logout: () => set({ user: null, token: null }),
}));
```

### Tailwind CSS Dynamic Classes

> **Important:** Tailwind's JIT engine scans source files at build time. Dynamic class names assembled at
> runtime (e.g. `"text-" + color`) will NOT be included in the production bundle.

```javascript
// CORRECT — use complete class names
const colorMap = {
  red: 'text-red-500 bg-red-50',
  green: 'text-green-500 bg-green-50',
};
const classes = colorMap[color];

// WRONG — Tailwind JIT will not detect these
const classes = `text-${color}-500 bg-${color}-50`;
```

### Error Boundaries

A React `ErrorBoundary` wraps the entire app. If any route crashes, the whole UI is replaced with the fallback. To
prevent cascading failures:

- Never throw inside `useEffect` — use `try/catch` and set error state instead
- Never throw during render — validate data before rendering it
- Keep error states per-component rather than letting them bubble to the boundary

### Code Splitting

All page-level components are loaded on demand via `React.lazy` + `Suspense` (see `src/App.jsx`).
Only the shell components (`Login`, `AppLayout`, `ProtectedRoute`, `ErrorBoundary`) are eager-loaded:

```javascript
import { lazy, Suspense } from 'react';
import Login from './pages/Login';           // eager — needed immediately
import AppLayout from './components/layout/AppLayout'; // eager — shell

const ModulePage = lazy(() => import('./pages/runtime/ModulePage'));
// ... all other ~40 pages

<Suspense fallback={<PageLoader />}>
  <Routes>...</Routes>
</Suspense>
```

Vite groups vendor dependencies into named chunks via `rollupOptions.manualChunks`:

| Chunk | Contents |
| ----- | -------- |
| `vendor-react` | react, react-dom, react-router-dom |
| `vendor-query` | @tanstack/react-query |
| `vendor-charts` | recharts, apexcharts, react-apexcharts |
| `vendor-dnd` | @dnd-kit/* |
| `vendor-grid` | react-grid-layout |
| `vendor-icons` | lucide-react |

---

## Database Management

### Prisma Schema

The schema lives at `backend/prisma/schema.prisma` and contains 99 models. Grouped by what they hold:

| Group | Models | Holds |
|---|---|---|
| **Blueprint** (configuration) | `UiModule`, `UiObject`, `UiField`, `UiForm`, `UiFormFieldLayout`, `UiValidation`, `UiFieldDependency`, `UiPipeline`, `UiPipelineStage`, `UiWorkflow`, `UiWorkflowStep`, `UiWizard`, `UiWizardStep`, `UiDashboard`, `UiDashboardWidget`, `UiChart`, `UiPage`, `UiPermission` | What objects, fields, screens and automations exist |
| **Business records** | `Record`, `RecordFieldValue` | Every business record (envelope + one row per field) |
| **Typed CRM store** (optional) | `CrmLead`, `CrmLeadIntake`, `CrmContact`, `CrmAccount`, `CrmOpportunity`, `CrmCase`, `CrmLeadConversion`, `CrmAssociation` | Used only by objects with reserved names; empty in Genesis Capital |
| **Hanging off a record** | `Activity`, `Task`, `Reminder`, `Notification`, `AuditLog`, `StatusEvent`, `Document*`, `LeadScore`, `SlaInstance` | Timeline, work items, files and timers for a record |
| **People & access** | `Employee`, `EmployeeHierarchy`, `Role`, `Region`, `Branch`, `OperationalPermission`, `BusinessUnit`, `BarrierZone`, `BarrierMember`, `WallCrossing`, `AuthRefreshToken` | Staff, logins, the org tree and who may see what |
| **Engines' own config** | `AssignmentRule`, `RoundRobinState`, `AssignmentLog`, `LeadScoringRule`, `Sla*`, `CustomReport`, `Report*`, `EmailTemplate`, `EmailLog`, `Integration*`, `Social*`, `Quota`, `ImportJob`, `JobQueue` | Rules and logs for each engine |
| **Platform** | `Tenant`, `TenantConfig`, `TenantUsage`, `SubscriptionPlan`, `FeatureFlag`, `TenantFeatureOverride`, `PlatformAuditLog`, `SecurityPolicy`, … | Multi-tenant SaaS administration |

Every table except the platform ones carries `tenant_id`. Column-level detail: [DATABASE_SCHEMA](database-schema.md);
why each table exists: [DATA_DICTIONARY](data-dictionary.md).

### Migrations

```bash
# Apply all pending migrations (production)
cd backend
npx prisma migrate deploy

# Create and apply a new migration (development)
npx prisma migrate dev --name add_my_feature

# Regenerate Prisma client after schema changes
npx prisma generate

# Open database GUI
npx prisma studio
```

### EAV Storage Pattern

Business-record fields are stored as entity-attribute-value rows with typed columns:

```text
record_field_values
  record_id    INT        → records.id (cascade delete)
  field_name   VARCHAR    → ui_fields.name of the record's object (matched by name, no FK)
  str_value    TEXT       → always written (encrypted fields: enc:v1:… ciphertext)
  num_value    DOUBLE     → numbers, currency, lookups (target records.id)
  bool_value   BOOLEAN    → checkboxes
  date_value   DATETIME   → dates
  json_value   JSON       → multi-selects, arrays, objects
  UNIQUE (record_id, field_name) — one row per field per record; an empty field has no row
```

`toTypedValue` / `fromTypedRow` convert in each direction. The full picture, including why the platform is built this
way and its trade-offs: [How data is stored and read](../understanding/03-how-data-is-stored.md).

### Seeding

```bash
cd backend
node prisma/seed.js
```

> **Warning:** The seed script deletes ALL data before inserting. It refuses a non-local `DATABASE_URL` unless
> `--allow-remote` is passed, and it does nothing when `require`d — only `node prisma/seed.js` runs it.

The seed creates the platform layer (system role, plans, feature flags, security policy, rate limits), installs
the Genesis Capital vertical pack (`prisma/verticals/genesis-capital`) into a new tenant through
`scripts/install-vertical.js`, and adds the platform administrator `PLATFORM01`. `--no-demo` skips the demo
records.

---

## Troubleshooting

| Symptom | Likely Cause | Fix |
| ------- | ------------ | --- |
| "Cannot find module" error | Named import on default-export | Use default imports for UI components |
| `useMutation` onSuccess not firing | React Query v4 pattern used | Move `onSuccess` into the options object (v5 API) |
| `isPending` undefined | Using deprecated v4 `isLoading` | Use `isPending` in React Query v5 |
| Tailwind classes missing in production | Dynamic class names | Use complete static class strings |
| DB connection refused | `.env` not configured | Check `DATABASE_URL` in `backend/.env` |
| Redis connection error | Redis not running | App degrades gracefully — check `REDIS_HOST` or disable |
| Seed refuses to run | `DATABASE_URL` is not a local host | Pass `--allow-remote` only if wiping that database is intended |
| JWT invalid after restart | Secret changed | Clear browser storage, re-login |
| Builder routes return 403 | Non-admin user | Use `GCADMIN` (or another admin-level account) for Builder access |

---

## Related Guides

- **Installation**: [../getting-started/installation.md](../getting-started/installation.md)
- **API Reference**: [api-reference.md](api-reference.md)
- **Deployment**: [../platform-operations/aws-deployment.md](../platform-operations/aws-deployment.md)
- **Workflow Engine**: [workflow-engine.md](engines/workflow-engine.md)
- **Dashboard Analytics**: [dashboard-analytics.md](engines/dashboard-analytics.md)
- **Security**: [security.md](security.md)
- **Contributing**: [contributing.md](contributing.md)

<!-- nav:bottom -->

---

### Where to next

| | |
|---|---|
| **Next** | [Database schema](database-schema.md) — Every table's columns, types and relationships; SQL recipes for record data |
| **Previous** | [AWS deployment](../platform-operations/aws-deployment.md) *(Platform operations)* |
| **Background** | [Understanding Genesis › How a request travels](../understanding/04-how-a-request-travels.md) |
| **On these journeys** | [Engineer](../README.md#engineer) (step 3 of 9) |
| **Lost?** | [Docs roadmap](../README.md) · [Developer guide](README.md#core-reading-in-order) · [Understanding Genesis](../understanding/README.md) |
<!-- /nav:bottom -->
