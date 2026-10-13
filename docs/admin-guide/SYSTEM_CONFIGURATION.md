# Genesis CRM — System Configuration Guide

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

### Admin Dashboard

Navigate to the admin dashboard for system overview:

- **Active Users**: Current logged-in users
- **System Health**: Database, Redis, API status
- **Recent Activity**: Latest admin changes
- **Module Summary**: Usage statistics per module

---

## Module Management

### Creating Custom Modules

#### 1. Navigate to Module Builder

- Go to **Builder → Modules & Objects → Create Module**
- Choose module type: Standard, CRM, Custom

#### 2. Basic Module Configuration

```text
Label (Display Name): "Projects"
Name (Key):           "projects"        (snake_case, unique)
Icon:                 "Briefcase"       (Lucide icon name)
Category:             "crm"             (sidebar section: crm, insurance, tools, settings)
Description:          "Track project management"
Status:               Active / Inactive
```

#### 3. Module Categories

The **Category** field controls which sidebar section a module appears under:

| Category | Sidebar Header | Typical Modules |
|----------|---------------|----------------|
| `crm` | Modules | Leads, Prospects, Clients, Products |
| `insurance` | Insurance | Quotes, Applications, Policies, Claims, Underwriting, Commissions |
| `tools` | Tools | Forecast |
| `settings` | Settings | Application settings |

Categories are fully metadata-driven — changing a module's category in the Builder
immediately moves it to the corresponding sidebar section. No code changes required.

#### 4. Module Settings

- **Visibility**: Public, Private, Role-based
- **Permissions**: Create, Read, Update, Delete defaults
- **Features**: Comments, Attachments, Workflows
- **API Access**: Enable/disable REST endpoints

### Configuring Existing Modules

**Standard CRM Modules**:

- **Leads**: Sales prospect management
- **Accounts**: Customer/company records
- **Contacts**: Individual person records
- **Opportunities**: Sales pipeline management
- **Tasks**: Activity and follow-up tracking

**Module Customization Options**:

- Custom fields and layouts
- Business rules and validation
- Automated workflows
- Integration mappings
- Reporting configuration

### Module Relationships

Configure how modules connect:

**One-to-Many**: Account → Contacts

```text
Parent Module: Accounts
Child Module: Contacts
Relationship Field: account_id
Display: "Contacts" tab on Account detail
```

**Many-to-Many**: Opportunities ↔ Products

```text
Junction Table: opportunity_products
Fields: opportunity_id, product_id, quantity, price
Display: "Products" section on Opportunity detail
```

---

## Field Configuration

### Field Types

**Basic Fields**:

- **Text**: Single-line text input
- **Textarea**: Multi-line text input
- **Number**: Integer or decimal values
- **Email**: Email address with validation
- **Phone**: Phone number with formatting
- **URL**: Web address with validation

**Advanced Fields**:

- **Date/DateTime**: Calendar picker
- **Boolean**: Checkbox (true/false)
- **Picklist**: Dropdown with predefined options
- **Multi-select**: Multiple choice selection
- **Currency**: Money values with formatting
- **Percentage**: Percentage values with % symbol

**Relationship Fields**:

- **Lookup**: Reference to another module record
- **Master-Detail**: Dependent relationship
- **Junction**: Many-to-many relationship

**Display Fields** (read-only, capture no input):

- **Heading / Divider**: Section layout helpers
- **Status Tracker**: A logistics-style status timeline (think Amazon / UPS /
  Bluedart package tracking) showing a milestone stepper, the current status
  banner, and a dated event log (time · location · description) for the record.
  Configure the milestones in the field's `config.stages`; events are appended
  automatically as the record moves through its pipeline, and can also be added
  via `POST /api/runtime/records/:id/status-events`. See
  [ARCHITECTURE_AND_SETUP.md](../developer-guide/ARCHITECTURE_AND_SETUP.md) for
  the data model.

### Field Properties

**Validation Rules**:

```javascript
// Required field validation
required: true

// Custom validation formula
validation: "length(name) > 2 && length(name) < 50"

// Conditional requirements
required_when: "type == 'Enterprise'"
```

**Display Options**:

- **Label**: User-friendly field name
- **Help Text**: Tooltip guidance
- **Placeholder**: Input hint text
- **Read Only**: Display-only field
- **Hidden**: Field exists but not shown

**Data Options**:

- **Default Value**: Auto-populated value
- **Unique**: Prevent duplicate values
- **Indexed**: Improve search performance
- **Encrypted**: Secure sensitive data

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

**Standard Roles**:

- **super_admin**: Full system access, bypasses all ui_permissions
- **admin**: Module management, Builder access
- **manager**: Team management + team data access
- **user**: Standard data access (own records)

See [PERMISSIONS_AND_ROLES.md](PERMISSIONS_AND_ROLES.md) for the complete permission model.

### User Account Management

**Creating Users**:

New users are employees added directly to the `employees` table. Required fields:

- Employee ID (e.g. EMP001)
- Full Name
- Email
- Role (super_admin / admin / manager / user)
- Password (stored bcrypt-hashed)

**Bulk User Import**:

1. Prepare CSV with required columns
2. Map columns to employee fields
3. Upload via the import pipeline
4. Review and confirm import results

**User Deactivation**:

- Preserve user data and assignments
- Remove login access by changing role or removing from employees table
- Transfer records to manager before deactivating
- Maintain audit trail

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
- Failed workflows identified by `[workflow:N] "name" failed: ...` log entries

### Workflow Deployment

**Development Workflow**:

1. **Create** workflow in test environment
2. **Test** with sample data (use Test Run feature)
3. **Review** execution logs
4. **Enable** the workflow (`is_active = true`)
5. **Monitor** for errors after enabling

For complete workflow creation and management details, see [WORKFLOW_AUTOMATION.md](WORKFLOW_AUTOMATION.md).

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
5. Round-robin state is tracked per rule in `round_robin_states` table

### Pre-configured Rules

Genesis CRM ships with 5 demo assignment rules:

| Object | Rule | Type | Logic |
| ------ | ---- | ---- | ----- |
| Lead | High-Value Lead > Senior Rep | `rule_based` | If lead_source in [partner_referral, trade_show] > assign to MGR001 |
| Lead | Default Lead Round-Robin | `round_robin` | Pool: USR001, USR002, MGR001 — cycles through |
| Opportunity | All Opportunities > Manager | `fixed` | Always assigns to MGR001 |
| Case | Critical Cases > Admin | `rule_based` | If priority == critical > assign to ADMIN001 |
| Case | Default Case Load-Balance | `load_balanced` | Pool: USR001, USR002 — assigns to rep with fewest cases |
| Contact | Contact Round-Robin | `round_robin` | Pool: USR001, USR002, MGR001 |

### Creating a Rule

1. Navigate to **Builder > Assignment Rules**
2. Click **+ New Rule**
3. Select the target object (Lead, Contact, Account, etc.)
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

- Hide sensitive fields by setting `can_view = false` per role
- Read-only fields for certain roles by setting `can_edit = false`
- Configured per field in Builder → Modules → Object → Fields → Access tab

**Record-Level Security**:

- Territory-based access via `employees.region_id` / `branch_id`
- Team/department restrictions via `view_scope` operational permission
- Dynamic ownership rules via the assignment engine

For complete permission configuration instructions, see [PERMISSIONS_AND_ROLES.md](PERMISSIONS_AND_ROLES.md).

---

## System Settings

### Database Configuration

**Performance Tuning**:

- Index optimization for search fields
- Query execution plan analysis
- Connection pool sizing (default: 10 connections, 30s timeout)
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
- JWT expiry configurable via `JWT_EXPIRY`
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

1. **Upload** CSV file via Import section in Builder
2. **Map** columns to CRM fields using the field mapping UI
3. **Preview** with duplicate detection results
4. **Execute** import (skip / create / merge strategy)

**Deduplication Strategies**:

- **skip**: Keep existing record, discard incoming row
- **create**: Always insert new record (may create duplicates)
- **merge**: Field-level merge — updates existing record with incoming values, leaves unmapped columns untouched

**Data Export Options**:

- **CSV Export**: From any module table via Export button
- **Scheduled Exports**: Configure via workflow automation

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
- Consent management: track consent fields on contact records

---

## Document Management (DMS)

The **Document Management System** is a standalone, top-level module (**Documents** in the sidebar) plus an admin
**builder** at **Builder → Document Management** (`/builder/documents`). It is domain-neutral — the same platform backs
generic CRM attachments, insurance application documents, generated documents, and e-signed documents. Full technical
reference: [developer-guide/DOCUMENT_MANAGEMENT.md](../developer-guide/DOCUMENT_MANAGEMENT.md).

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
- **Checklists** — required-document sets per entity type (e.g. every `application` must have these categories).
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

- **Notification step**: Sends a message to the record owner,
  assigned rep, manager, or a specific employee.
- **Approval step**: Sends an approval request with an
  accept/reject link.

Recipients are resolved from the workflow step config — you
can target the record owner, the actor who triggered the
workflow, a specific employee ID, or a manager in the
hierarchy.

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
       (admin, manager, user)
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
- **WhatsApp** uses a single registered business number per tenant; messages are routed via assignment rules.

### Configuration

1. Navigate to **Builder > Social Media > Accounts**
2. Click **Connect Account** and provide platform credentials (OAuth tokens from the platform's developer console)
3. Configure sync frequency and auto-monitoring settings
4. Set up **Listening Keywords** to monitor brand, competitor, and industry terms

For the complete guide, see [SOCIAL_MEDIA.md](SOCIAL_MEDIA.md).

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
Check role permissions in Builder → Permission Management and module assignments in Builder → Modules.

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

- **Installation**: [../getting-started/INSTALLATION.md](../getting-started/INSTALLATION.md)
- **Permissions**: [PERMISSIONS_AND_ROLES.md](PERMISSIONS_AND_ROLES.md)
- **Workflow Automation**: [WORKFLOW_AUTOMATION.md](WORKFLOW_AUTOMATION.md)
- **Developer Architecture**: [../developer-guide/ARCHITECTURE_AND_SETUP.md](../developer-guide/ARCHITECTURE_AND_SETUP.md)
