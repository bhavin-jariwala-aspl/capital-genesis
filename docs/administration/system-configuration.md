# Genesis CRM — System Configuration Guide

<!-- nav:top -->
> **[Docs roadmap](../README.md)** › **[Administration](README.md)** › 1 of 5 · **For:** Administrators
> ← [Appearance & branding](../builder-guide/20-appearance.md) *(Builder guide)* · [Permissions & roles](permissions-and-roles.md) →
> New to Genesis? Background: [Understanding Genesis › Configure or code?](../understanding/07-configure-or-code.md)
<!-- /nav:top -->

For: System Administrators and Module Managers

Complete guide for administering Genesis CRM, managing modules, and configuring system-wide settings.

---

## Table of Contents

1. [Admin Access](#admin-access)
2. [Module Management](#module-management)
3. [Field Configuration](#field-configuration)
4. [User Management](#user-management)
5. [Workflow Administration](#workflow-administration)
6. [Assignment Rules](#assignment-rules)
7. [Permission Configuration](#permission-configuration)
8. [System Settings](#system-settings)
9. [Data Management](#data-management)
10. [Document Management (DMS)](#document-management-dms)
11. [Integration Setup](#integration-setup)
12. [Notification Management](#notification-management)
13. [Social Media Integration](#social-media-integration)
14. [Monitoring and Maintenance](#monitoring-and-maintenance)

---

## Admin Access

### Prerequisites

- Admin role assigned by system owner
- Access to admin panel: **Builder** section in sidebar (visible only to admin/super_admin)

### Builder Home

**Builder** (`/builder`) opens the Builder Studio: counts of dashboards, workflows and forms, and a card
for each Builder section. System health, active users and usage figures are in the platform console, not
in a workspace (see [platform-administration.md](../platform-operations/platform-administration.md)).

---

## Module Management

### Creating Custom Modules

#### 1. Navigate to Module Builder

- Go to **Builder → Modules & Objects** and click **New Module**

#### 2. Basic Module Configuration

```text
Label (Display Name): "Projects"
Name (Key):           "projects"        (snake_case, unique)
Icon:                 "Briefcase"       (Lucide icon name)
Category:             "lending"         (sidebar section; any key)
Description:          "Track project management"
Status:               Active / Inactive
```

#### 3. Module Categories

The **Category** field controls which sidebar section a module appears under. Pick a known category or type a new key — every category becomes its own sidebar section, titled from
the key. Genesis Capital uses `client_360`, `lending`, `investments`, `advisory`, `growth`, `service`,
`compliance` and `masters`.

Categories are fully metadata-driven — changing a module's category in the Builder
immediately moves it to the corresponding sidebar section. No code changes required.

### Configuring Existing Modules

The Genesis Capital workspace ships 19 modules with 91 objects, for example **Clients** (`party`),
**Enquiries & Leads** (`enquiry`), **Retail Lending** (`loan_application`), **Commercial Lending**
(`credit_facility`), **Collateral & Pledges**, **Loan Servicing** (`loan_account`), **Wealth Management**,
**Investment Funds**, **Trading Solutions**, **Corporate Advisory**, **Forex Desk**, **Marketing & Consent**,
**Introducers**, **Revenue**, **Service & Complaints**, **KYC & Compliance** and **Masters**. All of them are
Builder metadata and can be changed like any module you create.

Each object can carry fields, forms, a pipeline, validation rules, workflows and assignment rules. On the
object itself you can also set a title field, a business-unit field and an information barrier.

### Module Relationships

Objects connect through **Lookup** fields. A lookup stores the target record's id (`records.id`); there is
no database foreign key. The record page shows the linked records of child objects as related lists.

```text
Child object:   loan_application
Lookup field:   party  → party (Clients)
Display:        loan applications listed on the client's record
```

A many-to-many link is modelled as its own object with two lookups.

How records and field values are stored is explained in
[How data is stored](../understanding/03-how-data-is-stored.md).

---

## Field Configuration

### Field Types

**Basic Fields**:

- **Text**, **Text Area**, **Rich Text**
- **Number**
- **Email**, **Phone**, **URL** (format checked)

**Selection Fields**:

- **Dropdown**, **Multi-Select**, **Radio Group**, **Checkbox**

**Date, Numeric and Special Fields**:

- **Date**, **Date & Time**, **Time**
- **Currency**, **Percentage**, **Rating**
- **Color Picker**, **File Upload**, **Image**, **Code Editor**
- **Lookup**: reference to a record of another object
- **Formula**: value computed from other fields
- **Auto Number**: sequential reference such as `PTY-2026-000001`

**Display Fields** (read-only, capture no input):

- **Label / Divider**: Section layout helpers
- **Status Tracker**: A logistics-style status timeline (think Amazon / UPS /
  Bluedart package tracking) showing a milestone stepper, the current status
  banner, and a dated event log (time · location · description) for the record.
  Configure the milestones in the field's `config.stages`; events are appended
  automatically as the record moves through its pipeline, and can also be added
  via `POST /api/runtime/records/:id/status-events`. See
  [architecture-and-setup.md](../developer-guide/architecture-and-setup.md) for
  the data model.

### Field Properties

**Validation Rules**:

Each field has **Required** and zero or more validation rules (`ui_validations`), each a type, a value and an
error message. The same rules run in the browser and on the server.

```text
min / max                 numeric bounds          value: 0 / 100
minLength / maxLength     text length             value: 2 / 50
pattern                   regular expression      value: ^[A-Z]{2}[0-9]{6}$
in / not_in               allowed values          value: retail,corporate
min_date / max_date       date bounds             value: today
gt_field / lte_field …    compare to a field      value: start_date
requires_field            if set, that one too    value: maturity_date
unique                    no other live record has this value
expression                formula must be true
```

**Display Options**:

- **Label**: User-friendly field name
- **Help Text**: Tooltip guidance
- **Placeholder**: Input hint text
- **Read Only**: Display-only field
- **Hidden**: Field exists but not shown

**Data Options**:

- **Default Value**: Auto-populated value
- **Unique**: Prevent duplicate values (checked on save)
- **Indexed**: A flag only; no database index is created
- **Encrypted** (`config.encrypt`): stored AES-256-GCM encrypted; **PII** (`config.pii`) masks the value for
  roles without the view-PII permission

### Changing Fields and Objects Safely

The Builder refuses changes that would break data or configuration, and its message names what is in the way:

- **Field Name (Key) rename or delete**: refused while the field is used (formulas, roll-ups, validation rules,
  pipeline entry rules or mirrored status, object settings, workflows, assignment conditions, dashboard widgets).
  **Edit Field** lists the usages; `GET /api/metadata/fields/:id/usages` returns them with the number of records
  holding a value. A permitted rename carries existing values to the new name. Labels can always change.
- **Moving a field to another object**: not allowed.
- **Removing picklist values in use**: the Builder opens a **Move to…** dialog to pick a replacement value; records
  are moved to it on save.
- **Object delete or Name (Key) rename**: refused while the object has records (including the Trash) or other
  objects reference it; renames are also refused for the built-in CRM objects.
- **Pipeline stage removal or pipeline delete**: refused while live records sit in that stage or pipeline.

The Genesis Capital vertical installer writes metadata directly and is not affected by these checks. Builder edits
reach users immediately; there is no longer a cache delay. See
[Modules & Objects](../builder-guide/01-modules-and-objects.md#renaming-moving-and-deleting-fields) for the end-user
view.

### Custom Field Examples

**Lead Score Field**:

```text
Type: Number
Label: "Lead Score"
Min Value: 0
Max Value: 100
Default: 50
Help Text: "Calculated lead qualification score"
```

**Industry Picklist**:

```text
Type: Picklist
Label: "Industry"
Options: [Technology, Healthcare, Finance, Manufacturing, Other]
Default: "Technology"
```

---

## User Management

### User Roles and Permissions

**Built-in role ladder** (lower level = more power):

- **platform_admin** (1): Platform console only; not a workspace role
- **super_admin** (2): Full workspace access, bypasses all ui_permissions
- **admin** (3): Builder access
- **manager** (4): Team data access
- **user** (5): Own records

A workspace adds its own roles, each with a level on the same ladder. Genesis Capital has 17 (for example
Relationship Manager at 5, Manager — Loans & Fixed Income at 4, COO at 4); GCADMIN is its super_admin.

See [permissions-and-roles.md](permissions-and-roles.md) for the complete permission model.

### User Account Management

**Creating Users**:

Go to **Builder → Employees** and add the employee (`POST /api/auth/employees`). Required fields:

- Employee ID (e.g. GCRM4)
- Full Name
- Email
- Role (a built-in role or one of the workspace's roles)
- Password (stored bcrypt-hashed)

There is no bulk employee import.

**User Deactivation**:

- **Deactivate** on the employee sets `is_active = false` and ends all of that employee's sessions at once
- Records stay assigned to the employee; reassign them before or after deactivating
- Assignment rules skip a deactivated assignee
- The audit trail is kept

### Directory Integration

**Single Sign-On (SSO)** — planned/future:

- SAML 2.0: Enterprise identity providers
- OAuth: Google, Microsoft, social logins
- LDAP: Active Directory integration

---

## Workflow Administration

### Workflow Monitoring

**Execution Logs**:

- Step-by-step execution trace logged to server console
- Error messages include workflow name and step context
- Failed workflows identified by `[workflow:N] … failed` log entries (for example `scheduled run failed`)
- A manual run (`POST /api/builder/workflows/:id/run`) returns the step-by-step log

### Workflow Deployment

**Development Workflow**:

1. **Create** workflow in test environment
2. **Test** with sample data (use Test Run feature)
3. **Review** execution logs
4. **Enable** the workflow (`is_active = true`)
5. **Monitor** for errors after enabling

For complete workflow creation and management details, see [workflow-automation.md](workflow-automation.md).

---

## Assignment Rules

Assignment rules automatically assign new records to the right employee
when they are created. Rules are evaluated in `order_index` order — the
first matching rule wins. Configure rules in **Builder > Assignment Rules**.

### Rule Types

| Type | How it works |
| ---- | ------------ |
| `fixed` | Always assigns to a single employee (`assignee_id`) |
| `round_robin` | Cycles through a pool of employees in order |
| `rule_based` | Evaluates conditions against record fields; assigns to `assignee_id` if all conditions match |
| `load_balanced` | Assigns to the employee in the pool with the fewest open records |

### How Rules Are Evaluated

1. Engine fetches all active rules for the record's object, sorted by `order_index`
2. For `rule_based`: checks each condition `{ field, operator, value }` against record data — all must match
3. First matching rule determines the assignee
4. If no rule matches, the `fallback_id` from the last evaluated rule is used
   - A `fixed` or `rule_based` assignee who is deactivated (or unknown) is passed over and the next rule is tried;
     a deactivated fallback is never used, so the record stays unassigned
5. Round-robin state is tracked per rule in `round_robin_states` table

### Pre-configured Rules

The Genesis Capital pack ships 31 assignment rules. Most are `rule_based` with a pool and no single
assignee: when the conditions match, the rule rotates through its pool.

| Object | Rules | Logic |
| ------ | ----- | ----- |
| Enquiry | 6, one per business unit | `business_unit` = LND / WLT / FND / SEC / ADV / FX → that unit's team; fallback GCRM1 |
| Referral | 6, one per business unit | `to_business_unit` → the receiving unit's team; fallback GCRM1 |
| Service request | 7 | Complaints → GCCOMP1 first; then one rule per business unit |
| Opportunity (`fs_opportunity`) | 2 | LND → GCLOAN1/GCLOAN2; WLT → GCRM2/GCPM1 |
| Credit facility, FX quote, FX profile, FX rate alert, fund order, client order, data subject request, introducer referral, conflict check, margin call | 1 each | `round_robin` to the owning desk (e.g. FX → GCFX1, compliance items → GCCOMP1) |

### Creating a Rule

1. Navigate to **Builder > Assignment Rules**
2. Click **+ New Rule**
3. Select the target object (Enquiry, Referral, Service Request, etc.)
4. Choose the rule type
5. Configure conditions (for `rule_based`) or pool members (for `round_robin` / `load_balanced`)
6. Set the `order_index` to control priority (lower = evaluated first)
7. Set a `fallback_id` in case the rule cannot assign

### Integration with Workflows

Assignment rules run **before** workflows. When a record is created:

1. `RecordService.createRecord()` calls `AssignmentService.assign()`
2. Assignment engine evaluates rules and sets `record.assigned_to`
3. `on_create` workflows fire with the already-assigned record

This means workflow condition steps can read `assigned_to` reliably.

---

## Permission Configuration

### Role-Based Access Control (RBAC)

**Permission Structure**:

```text
Module Level:
├── Metadata Permissions (ui_permissions)
│   ├── can_view: show/hide the entity
│   └── can_edit: read-only vs. editable
└── Operational Permissions (operational_permissions)
    ├── view_scope: own / team / hierarchy / all
    ├── create_scope
    ├── edit_scope
    ├── delete_scope
    └── assign_scope
```

**Field-Level Security**:

- Hide sensitive fields by setting `can_view = false` per role (hidden on screen only; the API still returns the value — use PII masking for data that must not leave the server)
- Read-only fields for certain roles by setting `can_edit = false`
- Configured per field in Builder → Modules → Object → Fields → Access tab

**Record-Level Security**:

- Own / team / hierarchy / all via the `view_scope` operational permission
- Business-unit scope: an employee who belongs to business units sees only those units' records (plus records with no unit)
- Information barriers: records in a barrier zone are visible only to zone members, approved wall-crossings and roles with `barrier_override`, admins included
- Ownership set by the assignment engine

For complete permission configuration instructions, see [permissions-and-roles.md](permissions-and-roles.md).

---

## System Settings

### Database Configuration

**Performance Tuning**:

- Index optimization for search fields
- Query execution plan analysis
- Connection pool sizing (default: 30 connections, 45s pool timeout, set in `app.js` unless `DATABASE_URL` sets them)
- Cache configuration (Redis TTL settings in `.env`)

**Backup and Recovery**:

- Daily automated backups (configure via hosting environment)
- Point-in-time recovery setup
- Data retention policies

### API Configuration

**Rate Limiting** (recommended for production):

```text
Requests per minute: 1000
Burst limit: 2000
Per-user limit: 100/min
IP-based throttling: Enabled
```

**Security Settings**:

- CORS policy configured in backend `.env`
- JWT expiry configurable via `JWT_EXPIRY` (default 8h; refresh tokens rotate and last 14 days)
- SSL/TLS enforcement at load balancer level

### Email Configuration

**SMTP Settings** (when email integration is configured):

```text
Server: smtp.company.com
Port: 587 (TLS) or 465 (SSL)
Authentication: Required
Username: alerts@company.com
```

---

## Data Management

### Data Import/Export

**Bulk Data Import (4-step pipeline)**:

1. **Upload** CSV file via the **Import** button on a module page (`/import`)
2. **Map** columns to CRM fields using the field mapping UI
3. **Preview** with duplicate detection results
4. **Execute** import (skip / create / merge strategy)

Rows for Builder objects are created one at a time through the normal record save: validation, defaults,
formulas, auto-numbers, the first pipeline stage, field encryption, assignment rules, audit and `on_create`
workflows and SLA timers. Parent roll-ups are recalculated once at the end. A row that fails validation is skipped,
not fatal: the result reports created, merged, skipped and failed counts, and the job keeps the first 100 failed
rows with their reasons (the done screen shows the first five).

**Deduplication Strategies**:

- **skip**: Keep existing record, discard incoming row
- **create**: Always insert new record (may create duplicates)
- **merge**: Field-level merge — updates existing record with incoming values, leaves unmapped columns untouched

**Data Export Options**:

- **CSV Export**: From any module table via Export button

### Data Quality Management

**Duplicate Detection**:

- Configurable key fields (e.g. email, phone, company+name)
- Case-insensitive matching against existing records
- Preview results before executing import

**Data Validation**:

- Email format validation
- Phone number standardization
- Required field enforcement
- Numeric range checking

### Archive and Retention

**GDPR Compliance**:

- Data subject access requests: export records for specific person
- Right to erasure: delete records and associated data
- Consent management: consent records on the client (Genesis Capital: **Clients → Consents**); data subject requests are their own object with an SLA

---

## Document Management (DMS)

The **Document Management System** is a standalone, top-level module (**Documents** in the sidebar) plus an admin
**builder** at **Builder → Document Management** (`/builder/documents`). It is domain-neutral — the same platform backs
generic CRM attachments, generated documents, and e-signed documents. Full technical
reference: [developer-guide/engines/document-management.md](../developer-guide/engines/document-management.md).

### Storage backend (deployment-time)

Storage is pluggable and chosen by the `STORAGE_DRIVER` env var — no code or database change to switch:

| `STORAGE_DRIVER` | Backend | Notes |
|---|---|---|
| `local` (default) | Local disk / NFS / SAN | Root at `STORAGE_ROOT`; atomic writes, path-traversal contained |
| `s3` | Amazon S3 **or** S3-compatible | R2, Backblaze B2, DigitalOcean Spaces, Wasabi, on-prem MinIO/Ceph (set `STORAGE_S3_ENDPOINT`, `STORAGE_S3_FORCE_PATH_STYLE=true` for MinIO) |
| `azure` | Azure Blob Storage | Connection string, or account + key |
| `gcs` | Google Cloud Storage | Service-account key file, or Application Default Credentials |

`STORAGE_MAX_FILE_SIZE` sets the global per-file ceiling (25 MB default; per-category caps override). See the DMS dev
doc for the full env-var list.

### Builder → Document Management (admin, no code)

- **Categories** — machine `code` + label, per-category **allowed MIME types**, **max size**, **retention days**,
  **requires review** (uploads land in `under_review` instead of `uploaded`), **required document**, and colour.
  Upload policy is enforced at write time.
- **Checklists** — required-document sets per entity type (e.g. every `opportunity` must have these categories).
- **Merge templates** — reusable HTML/text templates with `{{placeholder}}` / `{{dot.path}}` tokens; live placeholder
  detection. **Preview** renders without storing; **render** files the output as a first-class document.

Read access to builder config requires a valid login; create/update/delete require an **admin** role.

### End-user capabilities (Documents page)

Folders (hierarchical, drag-free rail), category + **in-document full-text** search (PDF/DOCX/text contents),
SHA-256 dedup + versioning, per-row view/download/**share**/**sign**/delete. **Share** mints a public link (optional
expiry, optional download-disable) with view/download **engagement analytics**. **Sign** starts a **native
e-signature** request — one or more signers (optional order) each get a private link to draw or type a signature;
when all sign, an audit-trail **certificate** is generated as a document.

### Retention / GC

Soft-deleted documents (`deleted_at`) are reclaimed by `DocumentService.purgeDeleted(cutoff)`, which hard-deletes the
row and its blob. Per-category `retention_days` is configured in the builder; wire `purgeDeleted` to a scheduler to
enforce retention automatically.

### Public route surface (security note)

Two route families are intentionally **unauthenticated**, gated only by an unguessable token: the share surface
(`/api/documents/public/:token`) and the signing surface (`/api/documents/sign/:token`). They carry no tenant context
and resolve strictly by token — worth a periodic security review.

---

## Integration Setup

### Third-Party Integrations

Genesis CRM supports outbound and inbound webhook integrations via the **Builder → Integrations** section.

**Outbound Webhooks**:

- **Event-driven**: fires automatically on the CRM domain events it subscribes to (`config.events`:
  `record.created`, `record.updated`, `record.deleted`, `record.field_changed`, or `*`) — no workflow required. A
  manual **Test** is also available.
- Configurable HTTP method (POST, PUT, PATCH) and timeout (default 10,000 ms)
- Custom headers including authentication tokens
- **Signed payloads**: set `config.secret` to add an `X-Signature-256` HMAC-SHA256 header
- **Automatic retries** with exponential backoff on transient failures (`config.retry.attempts`, default 3;
  `config.retry.backoff_ms`, default 500)
- **SSRF-protected**: private/loopback/link-local destinations are blocked

**Inbound Webhooks**:

- Receives data from external systems at `POST /api/integrations/inbound/:name`
- HMAC-SHA256 signature verification via `X-Signature-256` header
- **Workflow bridge**: `config.event_map` (`{ eventName: workflowId }`) runs a workflow when a matching event
  arrives; the event is also re-published on the domain bus
- Execution retry available from integration logs

**Integration CRUD**:

Go to **Builder → Integrations** to:

1. Create new integrations
2. View execution logs and health stats
3. Toggle active/inactive
4. Retry failed executions

### Webhook Configuration Example

```javascript
// Outbound webhook (stored in Integration.config)
{
  url: "https://external-system.com/webhook",
  method: "POST",
  events: ["record.created", "record.updated"], // events this integration subscribes to
  secret: "shared-signing-secret",              // adds X-Signature-256 (HMAC-SHA256)
  retry:  { attempts: 3, backoff_ms: 500 },     // exponential backoff on transient failures
  headers: {
    "Authorization": "Bearer token123"
    // Content-Type: application/json is added automatically
  }
}
```

---

## Notification Management

Genesis CRM has an in-app notification system that delivers
messages to the bell icon in each user's header bar.

### How Notifications Are Generated

Notifications can be created in two ways:

#### 1. Workflow-Driven (Automatic)

Workflows configured in **Builder > Workflows** can include
`notification` and `approval` steps. When the workflow fires
(triggered by record creation, field change, or schedule),
it resolves recipients and creates notification rows.

- **Notification step**: Sends a message to a specific employee, the employee named in a record field
  (for example `assigned_to`), every active employee with a role, and/or the person who triggered the
  workflow. The triggering person, or the person a field names (such as a maker), can be excluded.
- **Approval step**: Sends an approval request with an
  accept/reject link.

Template variables (`{{first_name}}`, `{{status}}`, etc.)
are interpolated from the CRM record data at execution time.

#### 2. Push Notifications (Manual — Admin)

Admins can send ad-hoc notifications from **Builder > Push
Notifications**. This is useful for:

- Announcing system maintenance windows
- Notifying sales teams about new pricing or policies
- Alerting specific roles about urgent changes
- Sending reminders to individual employees

**Steps to send a push notification:**

1. Navigate to **Builder > Push Notifications**
2. Click **Send Notification**
3. Fill in the form:
   - **Title** (required) — short headline
   - **Message** — body text with details
   - **Link** (optional) — URL the user is taken to on click
   - **Target** — choose one:
     - *All Users* — every employee in the tenant
     - *By Role* — select one or more roles
     - *Specific Employees* — pick individual employees
4. Click **Send** — notifications are delivered immediately
5. Recipients see a red badge on the bell icon within 30s

**Viewing sent notifications:**

The Push Notifications page shows a history of previously
sent notifications with title, target, recipient count, and
timestamp. Only admins can access this page.

### API Endpoints

| Method | Path | Auth | Description |
| ------ | ---- | ---- | ----------- |
| `GET` | `/api/notifications` | Any user | List own notifications |
| `GET` | `/api/notifications/count` | Any user | Unread count |
| `PATCH` | `/api/notifications/read` | Any user | Mark specific IDs as read |
| `PATCH` | `/api/notifications/read-all` | Any user | Mark all as read |
| `POST` | `/api/builder/push-notifications` | Admin | Send push notification |
| `GET` | `/api/builder/push-notifications` | Admin | List sent notifications |

### Database

Notifications are stored in the `notifications` table with
`employee_id`, `type`, `title`, `body`, `link`, `is_read`,
and `created_at`. Indexed on `(employee_id, is_read)` for
efficient unread count queries. Tenant-scoped via the Prisma
middleware.

---

## Social Media Integration

Genesis CRM includes a full social media management module accessible at **Builder > Social Media**.

### Key Concepts

- **One corporate account per platform per tenant** — Facebook Page, Instagram Business,
  LinkedIn Company Page, or WhatsApp Business number is connected at the organization level.
- **Shared access via RBAC** — Admins manage connections; all users can view and interact within their role permissions.
- **WhatsApp** is a registered platform but, like every platform, runs on the simulation connector: no live connector ships today.

### Configuration

1. Navigate to **Builder > Social Media > Accounts**
2. Click **Connect Account** and provide platform credentials (OAuth tokens from the platform's developer console)
3. Configure sync frequency and auto-monitoring settings
4. Set up **Listening Keywords** to monitor brand, competitor, and industry terms

For the complete guide, see [social-media.md](social-media.md).

---

## Monitoring and Maintenance

### System Health Monitoring

**Key Metrics**:

- Database response times
- API endpoint performance
- User session activity
- Storage usage trends

**Alert Configuration**:

- Email alerts for system issues (requires email integration)
- Dashboard widgets for real-time status

### Performance Optimization

**Database Optimization**:

- Regular index maintenance
- Query performance analysis
- Archive old data to reduce table sizes

**Application Performance**:

- Cache hit ratio monitoring (Redis)
- Background job queue management

### Security Maintenance

**Security Auditing**:

- Access log review
- Failed login attempt monitoring
- Permission change tracking via `updated_by` field
- Data export audit trail

**Regular Security Tasks**:

- Password policy enforcement
- Inactive user cleanup
- API key rotation
- Security patch application

### Backup and Disaster Recovery

**Backup Strategy**:

- Daily incremental backups
- Weekly full backups
- Off-site backup storage
- Backup integrity testing

**Recovery Objectives**:

- Recovery Time Objective (RTO): 4 hours
- Recovery Point Objective (RPO): 1 hour

---

## Troubleshooting Common Issues

### User Access Problems

**User can't access certain modules:**
Check role permissions in Builder → Permissions and the module's objects in Builder → Modules & Objects.

**Login fails after password change:**
Verify bcrypt hash is updated — the `auth.service.js` service validates the current password before allowing changes.

### Performance Issues

**Slow page load times:**
Check database query performance with `EXPLAIN` and verify Redis cache is connected (`REDIS_HOST` in `.env`).

**Workflow execution delays:**
Review workflow complexity and external API dependencies in integration steps.

### Data Issues

**Import failures:**
Validate CSV format, check required field mapping, and review the preview step for error details.

**Missing related records:**
Verify relationship configuration in Builder → Modules and check that the user has view permissions on the related object.

---

## Related Guides

- **Installation**: [../getting-started/installation.md](../getting-started/installation.md)
- **Permissions**: [permissions-and-roles.md](permissions-and-roles.md)
- **Workflow Automation**: [workflow-automation.md](workflow-automation.md)
- **Developer Architecture**: [../developer-guide/architecture-and-setup.md](../developer-guide/architecture-and-setup.md)

<!-- nav:bottom -->

---

### Where to next

| | |
|---|---|
| **Next** | [Permissions & roles](permissions-and-roles.md) — The permission model end to end |
| **Previous** | [Appearance & branding](../builder-guide/20-appearance.md) *(Builder guide)* |
| **Background** | [Understanding Genesis › Configure or code?](../understanding/07-configure-or-code.md) |
| **On these journeys** | [CRM administrator](../README.md#crm-administrator) (step 2 of 7) |
| **Lost?** | [Docs roadmap](../README.md) · [Administration](README.md) · [Understanding Genesis](../understanding/README.md) |
<!-- /nav:bottom -->
