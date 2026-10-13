# Genesis CRM — Daily Operations Guide

> **Who is this guide for?**
> End users, sales teams, and managers who work with Genesis CRM daily.
> This guide covers navigation, CRM features, and record management.

---

## Table of Contents

1. [Roles & Permissions](#roles--permissions)
2. [Navigation Overview](#navigation-overview)
3. [Dashboard (Home Screen)](#dashboard-home-screen)
4. [Essential CRM Features](#essential-crm-features)
5. [Working with Records](#working-with-records)
6. [Search & Filtering](#search--filtering)
7. [Import & Export](#import--export)

---

## Roles & Permissions

Genesis CRM has four built-in roles. Roles are set per employee in the database.

| Role | What they can do |
| ---- | ---------------- |
| super_admin | Everything — full system administration |
| admin | Module management, Builder access, user management |
| manager | Team record access, task assignment, reporting |
| user | Own records, assigned records, basic CRM functions |

**Visible UI differences:**

- `admin` / `super_admin` see a **Builder** section (collapsible) in the left sidebar
- Non-admin roles do **not** see the Builder section

### Two-Tier Permission Model

Genesis CRM enforces a **two-tier permission model** on top
of the four base roles. All logic runs **server-side** — the
backend filters data before it reaches the frontend.

#### Tier 1 — Metadata Permissions

Controls which roles can **view** or **edit** each individual
metadata entity: modules, objects, fields, forms, pipelines,
and wizards.

| Condition | Rendered behaviour |
| --------- | ------------------ |
| `can_view = false` | Entity is completely hidden from role |
| `can_view = true, can_edit = false` | Entity visible but read-only |
| `can_view = true, can_edit = true` | Full access to entity |

`super_admin` and `admin` always bypass these rules and receive full access.

#### Tier 2 — Operational Permissions

Controls the **scope** of what each role can do with tasks and activities.

| Dimension | Default: manager | Default: user |
| --------- | ---------------- | ------------- |
| view_scope | hierarchy | own |
| create_scope | all | own |
| edit_scope | team | own |
| delete_scope | team | own |
| assign_scope | all | none |

Scope values: `none` · `own` · `team` · `hierarchy` · `all`

For full permission configuration details, see
[PERMISSIONS_AND_ROLES.md](../admin-guide/PERMISSIONS_AND_ROLES.md).

---

## Navigation Overview

The application has a persistent **left sidebar** and a **top header bar** on all screens.

### Top Header Bar

```text
┌─────────────────────────────────────────────────────────────────┐
│  ≡  │  Search records…                       │  (unread dot)    │
└─────────────────────────────────────────────────────────────────┘
```

| Element | Description |
| ------- | ----------- |
| ≡ Menu | Opens/closes left sidebar (mobile) |
| Search | Global record search across all modules |
| Notifications | Bell icon with unread count indicator |

> The search bar is hidden on small screens (< `sm` breakpoint) and visible on desktop.

### Left Sidebar

The sidebar is **fully metadata-driven**. Modules are grouped by
their `category` field into sections. Admins can change a module's
category in the Builder to move it between sections instantly.

```text
┌─────────────────────────────────────────────────────────────────┐
│  G  Genesis CRM          (logo, click to go home)               │
├─────────────────────────────────────────────────────────────────┤
│  Dashboard            (home screen with KPI cards)              │
│                                                                 │
│  MODULES              (category: crm)                           │
│     Leads             (raw inbound; score + grade inline)       │
│     Prospects         (prospect management)                     │
│     Clients           (customer relationships)                  │
│                                                                 │
│  Builder  (admin only, collapsible)                             │
│     Configure: Modules & Objects · Form Builder ·               │
│                Dashboard Builder · Pipeline Builder · Wizards   │
│     Automate:  Workflows · Assignment Rules · Lead Scoring      │
│     Connect:   Integrations · Health · Email · Social · Push    │
│     Manage:    Permissions · Employees · Roles & Levels         │
│                                                                 │
│  Platform  (platform_admin only, collapsible)                   │
│     Dashboard · Tenants · Feature Flags · Plans ·               │
│     Announcements · Analytics · Security · Audit Log            │
├─────────────────────────────────────────────────────────────────┤
│  John Doe  /  user  /  Settings                                 │
└─────────────────────────────────────────────────────────────────┘
```

Sidebar sections are driven by `MODULE_CATEGORIES` in
`frontend/src/utils/constants.js`. Empty categories are hidden
automatically.

The sidebar collapses on mobile — tap the hamburger menu (≡) in the top-left header to open it.

---

## Dashboard (Home Screen)

The Dashboard is the first screen you see after login.
It updates automatically based on what panels are configured
in the Dashboard Builder.

### What you see

**KPI Metric Cards (top row):** Each card shows a headline number with a trend indicator.

| Card | Default value |
| ---- | ------------- |
| Open Pipeline | Value of all open opportunities |
| Open Leads | Count of leads not yet converted |

**Chart panels (below KPI cards):**

| Chart | Type | Description |
| ----- | ---- | ----------- |
| Pipeline Value by Stage | Funnel | Open opportunity value at each pipeline stage |
| Where Leads Come From | Donut | Leads by source |
| Leads by Status | Bar | Leads at each status |
| Won vs Lost by Month | Stacked bar | Opportunities won and lost per month |

### Switching dashboards

If more than one dashboard exists, a dropdown appears in the
top-left of the dashboard area. Select a different dashboard
to switch views.

---

## Essential CRM Features

Genesis CRM includes comprehensive sales and customer
management capabilities that integrate seamlessly with
the module system.

### Product Catalog

The Product Catalog manages your company's products and services for sales teams.

**Accessing the Product Catalog:**

1. Navigate to **Sales > Product** from the main navigation
2. Click **+ New Product** to create a new product or service

**Key Features:**

- Product information: Name, SKU, description, and categorization
- Pricing management: Unit price, cost price, and profit margin tracking
- Inventory details: Stock levels, minimum/maximum quantities
- Vendor management: Vendor information and vendor SKU tracking
- Multi-currency support: Configure pricing in different currencies
- Tax configuration: Set tax rates for compliance

**Creating a Product:**

1. Fill in basic information (Name and Unit Price are required)
2. Set the product category for organization
3. Configure pricing details including cost price for profit tracking
4. Add vendor information if applicable
5. Set inventory parameters if managing stock levels
6. Save the product

For complete product management details, see [PRODUCTS.md](PRODUCTS.md).

### Email Templates

The Email Template system provides standardized communication
with dynamic personalization. Templates support HTML and plain
text formats, automatic variable extraction, multi-language
capabilities, and usage analytics.

#### Managing Email Templates (Builder — Admin Only)

Email templates are managed in the **Builder** section and
are scoped to specific **Module > Object** combinations.
For example, a "Lead Follow-up" template belongs to
Sales > Lead, and a "Support Case Update" belongs to
Service > Case.

1. Navigate to **Builder > Email Templates** from the left sidebar (admin/super_admin only)
2. Templates are grouped by **Module > Object** sections (e.g. Sales > Lead, Service > Case)
3. Each section shows its templates with name, category, subject, usage count, and status
4. Click any template row to expand and see variables, subject preview, and action buttons

#### Creating a Template

1. Click **+ New Template** in the top-right
2. Fill in the following fields:

| Field | Required | Description |
| ----- | -------- | ----------- |
| Assign to Object | Yes | Select the Module > Object this template belongs to (e.g. Sales > Lead) |
| Name | Yes | Template name (minimum 3 characters) |
| Category | No | One of: sales, marketing, support, onboarding, welcome, newsletter, follow_up, other |
| Subject | Yes | Email subject line (5–200 characters). Supports `{{variables}}` |
| Body (HTML) | No | Rich text email body with HTML formatting |
| Body (Plain Text) | No | Plain text fallback for email clients that don't render HTML |
| Language | No | Template language: en, es, fr, de, pt (defaults to English) |
| Is Active | No | Whether the template is available for use (defaults to active) |

1. Click **Create Template** to save

> Variables are **automatically extracted** from the subject,
> HTML body, and plain text body when you save. You do not
> need to list them manually.

#### Using Variables for Personalization

Use the `{{variable_name}}` syntax anywhere in the subject
line or body content. Variables are replaced with actual
values when the email is sent.

**How variable replacement works:**

- `{{first_name}}` becomes the recipient's first name (e.g., "John")
- Whitespace inside braces is allowed: `{{ first_name }}` works the same
- Unmatched variables (no value provided) are silently removed from the output
- Variable names must start with a letter or underscore, followed by letters, digits, or underscores

**Common variables by template category:**

| Category | Typical Variables |
| -------- | ----------------- |
| Sales | `{{first_name}}`, `{{company}}`, `{{product_name}}`, `{{sender_name}}` |
| Onboarding | `{{first_name}}`, `{{company_name}}`, `{{help_center_url}}` |
| Support | `{{contact_name}}`, `{{case_number}}`, `{{case_subject}}`, `{{case_priority}}` |

#### Sending an Email from Any Record

The email compose feature is available from **every record**
in the application — leads, contacts, accounts,
opportunities, cases, and any custom module.

**How to open it:**

1. Click any record to open the **side panel**
2. On the **Activity** tab, click **Log Activity**
3. Click the **Email** pill in the activity type selector
4. The Email Compose modal opens

**Using the Email Compose modal:**

1. **Choose mode**: Select "Use Template" (recommended) or "Compose Manually"
2. **Enter recipient**: The **To** field is auto-filled from the record's email field. Edit if needed
3. **Add CC/BCC** (optional): Expand the CC/BCC section and enter comma-separated emails
4. **Template mode**:
   - Select a template from the dropdown (only templates assigned to the current object are shown)
   - Template variables are **automatically resolved from the record's data** by the server
   - Fields that were successfully auto-filled show a green border
   - Review and edit any variable values as needed
   - Click **Preview** to see the fully rendered email before sending
5. **Manual mode**:
   - Enter a subject line and compose the email body (HTML supported)
6. Click **Send Email** to dispatch

**What happens when you send:**

- The template is rendered with your variable values
- The email is dispatched via the configured mail provider
- An **Email Log** entry is created to track delivery status
- An **Activity** entry (type: email) is automatically logged on the record's timeline
- The activity timeline refreshes to show the new email activity

**How variable auto-population works:**

When you select a template, the backend loads the record's
CRM entity data and maps it onto the template's
`{{variables}}` using a three-step strategy:

1. **Direct match** — record field name matches the
   variable exactly (e.g. `{{first_name}}` from
   `first_name`)
1. **Alias lookup** — common name mappings are checked
   (e.g. `{{contact_name}}` from `first_name + last_name`)
1. **Prefix stripping** — entity prefixes removed and
   re-matched (e.g. `{{case_status}}` from `status`)

If no match is found, the field is left empty for manual
entry. You can always edit any value before sending.

**Rendering example:**

Using the "Lead Follow-up" template with these variables:

| Variable | Value |
| -------- | ----- |
| `first_name` | John |
| `product_name` | Genesis CRM |
| `company` | Acme Corp |
| `sender_name` | Sarah |

Produces:

- **Subject:** "Thank you for your interest, John"
- **Body:** Personalized HTML/text with all variables replaced

**Email log tracking:**

Every sent email is recorded with:

| Field | Description |
| ----- | ----------- |
| Recipient | To, CC, and BCC email addresses |
| Sender | From email address |
| Content | Rendered subject, HTML body, and plain text body |
| Status | One of: sent, delivered, opened, clicked, bounced |
| Timestamps | Sent at, opened at, clicked at, bounced at |
| Related record | Link to the CRM record |

#### Viewing Email History for a Record

All emails sent from a record are visible in two places:

1. **Activity Timeline** — Email activities appear with a
   violet Mail icon in the record's side panel
1. **Email Logs** — Detailed log with delivery status
   tracking (sent, delivered, opened, clicked, bounced)

#### SMTP Configuration

Email sending requires SMTP configuration. Set these environment variables in the backend:

| Variable | Description | Example |
| -------- | ----------- | ------- |
| `SMTP_HOST` | Mail server hostname | `smtp.gmail.com` |
| `SMTP_PORT` | Mail server port | `587` |
| `SMTP_USER` | Authentication username | `user@company.com` |
| `SMTP_PASS` | Authentication password | `app-password` |
| `SMTP_FROM` | Default sender address | `crm@company.com` |

> If SMTP is not configured, the system runs in
> **preview mode** — emails are logged but not actually
> dispatched. Useful for development and demo environments.

#### Pre-built Templates

Genesis CRM ships with default templates, created
automatically when the database is seeded (`npm run db:seed`):

- **Lead Follow-up** (Sales > Lead) — Subject:
  "Thank you for your interest, `{{first_name}}`"
- **Welcome New Customer** (Contacts > Contact) — Subject:
  "Welcome to `{{company_name}}`, `{{first_name}}`!"
- **Support Case Update** (Service > Case) — Subject:
  "Case #`{{case_number}}` Update"
- **Product Information** (Sales > Product) — Subject:
  "Introducing `{{product_name}}`"

#### Template Analytics

Track how your templates perform over time:

- **Usage count**: How many times a template has been rendered
- **Email status distribution**: Breakdown of sent, delivered, opened, clicked, and bounced counts
- **Open rate**: Percentage of delivered emails that were opened
- **Most used templates**: Ranking of templates by usage count

#### Editing and Deleting Templates

**Editing:** (Builder > Email Templates)

1. Expand a template row and click **Edit**
2. Modify fields as needed — variables are re-extracted automatically on save
3. Click **Save** to apply changes

**Deleting:**

- Templates that have **never been used** to send emails are permanently deleted
- Templates that have been used are **deactivated** (soft delete) to preserve email log history
- Deactivated templates no longer appear in template selection but remain in analytics

### Document Management

Attach files to any CRM record from the **Docs** tab in
the record side panel.

#### Uploading a Document

1. Click any record to open the side panel
1. Switch to the **Docs** tab
1. Click **Upload**
1. Select a category (Contract, Proposal, Presentation,
   Photo, Other)
1. Click **Choose file** and select a file from your
   computer
1. The file uploads and appears in the document list

#### Supported File Types

- PDF documents
- Microsoft Office (Word, Excel, PowerPoint)
- Plain text and CSV
- Images (JPEG, PNG, GIF, WebP)
- Maximum file size: 50 MB

#### Document List

Each document shows:

- File name with type-specific icon
- File size and category
- Upload timestamp
- **Download** button (hover) — downloads the file
- **Delete** button (hover) — removes the document

#### How Documents Are Stored

Files are saved to the server's `uploads/` directory,
organized by year and month (`uploads/2026/04/`). Each
file gets a unique name to prevent collisions. Document
metadata (name, size, type, category) is stored in the
`documents` database table with a `related_to_id` linking
it to the CRM record.

#### API Endpoints

| Method | Path | Description |
| ------ | ---- | ----------- |
| POST | `/api/documents/upload` | Upload (base64) |
| GET | `/api/documents` | List with filters |
| GET | `/api/documents/:id` | Get metadata |
| GET | `/api/documents/:id/download` | Download file |
| GET | `/api/documents/record/:id` | Docs for a record |
| PUT | `/api/documents/:id` | Update metadata |
| DELETE | `/api/documents/:id` | Delete |

### Lead Scoring

Automated lead qualification and prioritization. **Scoring is surfaced on the
Leads module itself — there is no separate "Lead Scoring" screen.**

**Where scores appear:** Open the **Leads** module. Each lead is scored
automatically by the engine (on create/update) and shows a **Score** and a
colored **Grade** (A–F) — as list columns, a badge on the Kanban card, and on
the lead's detail panel. The Leads module also has a collapsible **Lead Scoring
Insights** panel (grade distribution, top-scoring leads, headline KPIs).

**Configuring rules:** Rules live under **Builder → Automate → Lead Scoring
Rules** (admin only). Click **Setup Defaults** for a starter set, or create your
own; see [Lead Scoring Rules](08-lead-scoring-rules.md).

**Key features:**

- Rule-based scoring engine (demographic / behavioral / engagement criteria)
- Automatic A–F grade assignment, shown inline on each lead
- Scores recalculate automatically whenever a lead is created or updated
- Grade distribution + top-lead insights on the Leads module

> **Tip:** If leads show no score, make sure active rules exist
> (**Lead Scoring Rules → Setup Defaults**) — with no rules every lead scores 0.

### Notifications (Bell Icon)

The bell icon in the top-right header shows your in-app
notifications with a red badge for unread count.

**How notifications reach you:**

Notifications are created automatically by the system, not
manually by other users. There are three sources:

1. **Workflow notifications** — When a workflow executes a
   `notification` step. For example, the built-in "Lead
   Status Change" workflow notifies the assigned rep when a
   lead is contacted, qualified, or unqualified.
2. **Approval requests** — When a workflow reaches an
   `approval` step, all designated approvers receive a
   notification with a link to approve/reject.
3. **Admin push notifications** — Admins can send targeted
   notifications from **Builder > Push Notifications** to
   specific roles, individual employees, or all users.

**Using the notification dropdown:**

1. Click the **bell icon** — a dropdown shows your latest
   20 notifications, newest first
2. **Unread** notifications are highlighted with a blue
   background
3. Click a notification to mark it as read; if it has a
   link, you are navigated there
4. Click **Mark all read** to clear the unread badge
5. The badge polls every 30 seconds — new notifications
   appear automatically

**Notification types and their icons:**

| Type | When Created |
| ---- | ------------ |
| `workflow` | A workflow notification step fires |
| `approval` | A workflow requests your approval |
| `system` | An admin sends a push notification |
| `reminder` | One of your reminders becomes due (see below) |

### Reminders

Set a **reminder** on any Lead, Prospect, Client, or other record to be
notified at a specific time — the follow-up primitive you'll recognise from
Salesforce, HubSpot, and Pipedrive.

**Set a reminder on a record:**

1. Open a record and go to the **Reminders** tab (next to Activity and Tasks)
2. Click **Add Reminder**, enter what to remind you about, and pick a time —
   or use a quick preset: **In 1 hour**, **Tomorrow 9am**, or **Next week**
3. Optionally set a priority and a note, then **Set Reminder**

**When it's due:** the system checks every minute and, when a reminder's time
passes, drops a `reminder` notification into your bell automatically (no action
needed). From the reminder you can **snooze** (1 hour / tomorrow / next week),
mark it **done**, or **dismiss** it.

**My Reminders agenda:** the **Tools > My Reminders** sidebar link shows all
your open reminders grouped into **Overdue / Today / Tomorrow / This Week /
Later**, where you can also create standalone reminders not tied to a record.

> **Tasks vs. reminders:** a **task** is assignable work with a status; a
> **reminder** simply notifies you at a moment in time. Use tasks for "what
> needs doing", reminders for "ping me then".

### Lead Status Change Automation

When a lead's status changes, the system automatically triggers a chain of actions:

**What happens on every status change:**

1. **Audit log** — records old and new values with timestamp and user
2. **Activity entry** — "Status changed: new → contacted" appears in the record's timeline
3. **Workflow trigger** — the `field_changed` workflow fires

#### Built-in lead workflows

Three workflows ship on the Lead object and run without any setup:

| Workflow | When | What you see |
| -------- | ---- | ------------ |
| Instant Routing & Priority Alert | A lead is created | The sales queue is notified; hot and warm leads also escalate to the sales manager for a 5-minute callback |
| First-Response SLA & Re-routing | 60 minutes after capture | If the lead is still at **New**, the manager is alerted and the lead is re-assigned to them |
| Qualification Handoff to Prospect | Status reaches **Qualified** | A Prospect record is created automatically and the manager is notified |

The qualification handoff is latched, so re-saving an already-qualified lead will
not create a second Prospect.

See [Workflows](06-workflows.md#what-ships-out-of-the-box) for the full catalogue
of 18 built-in workflows across every module.

#### Applies to all CRM entities

The `field_changed` trigger works for leads, contacts,
accounts, opportunities, and cases. Any field change on
these entities creates an audit log and fires matching
workflows.

---

## Working with Records

### Browsing a Module

Click any **module name** in the left sidebar (e.g. Sales, Contacts) to view its record list.

**Table View Features:**

- **Search bar**: Filter records by any text content
- **Sort columns**: Click any column header to sort ascending/descending
- **Pagination**: Navigate through large datasets
- **Row actions**: Edit, delete, or view individual records

**Toolbar Actions:**

| Button | Function |
| ------ | -------- |
| + New {Object} | Create a new record |
| Pipeline | Switch to Kanban pipeline view |
| Wizard | Launch guided creation wizard |
| Export | Download all records as CSV |
| Delete | Bulk delete selected records |

### Creating a New Record

1. Click **+ New {Object}** in the module toolbar
2. Fill out the form fields (required fields marked with *)
3. Use **Save & Close** to save and return to the list
4. Use **Save & New** to save and immediately create another record

**Form Features:**

- **Field validation**: Real-time validation with error messages
- **Auto-calculate**: Fields that compute values automatically
- **Dependencies**: Fields that show/hide based on other field values
- **File uploads**: Attach documents directly to records

### Editing a Record

**From the table:**

1. Click the Edit icon in any table row
2. Or click the record name to open the detail view, then click **Edit**

**In the edit form:**

- All field values are pre-populated
- Change any values as needed
- Click **Save** to update the record
- Click **Cancel** to discard changes

### Pipeline (Kanban) View

Switch to Pipeline view to see records organized by stage/status.

**Using Pipeline View:**

- **Drag & Drop**: Move records between stages by dragging cards
- **Stage Columns**: Each column represents a different stage
- **Card Details**: Quick summary of key record information
- **Stage Actions**: Update record stage with automatic logging

### Record Side Panel

Click any record name in the table to open the **side panel** — a detailed view that slides in from the right.

**Panel Tabs:**

#### Activity Tab

Shows the **Activity Timeline** for the selected record — a chronological list of all interactions.

- **Log new activities**: Calls, emails, meetings, notes
- **Edit activities**: Modify your own activity entries
- **Activity types**: Multiple predefined types available
- **Authorization**: Only activity creator or admin/manager can edit

#### Tasks Tab

Shows the **Task Panel** for the selected record — a
checklist of follow-up tasks.

- **Create tasks**: Set priorities, due dates, assignments
- **Task status**: Mark tasks as complete or in progress
- **Task assignment**: Assign tasks to team members
- **Authorization**: Task creator or assigned employee only

#### Docs Tab

Shows all **documents attached** to the selected record.

- **Upload files**: Click Upload, pick a category, choose
  a file (PDF, Office, images, text — max 50 MB)
- **Download**: Hover a document and click the download icon
- **Delete**: Hover a document and click the trash icon
- **Metadata**: File size, category, and upload timestamp

#### Audit Tab

Shows the last 50 change-history entries for the record, newest first.

| Column | Description |
| ------ | ----------- |
| Timestamp | When the change occurred |
| Employee | Who made the change |
| Action | What was changed (create/update/delete/stage_change) |
| Details | Specific field changes made |

Action color-coding: create = green · update = blue · delete = red · stage_change = violet.

### Bulk Operations

**Multi-Select Records:**

1. Tick checkboxes on one or more table rows
2. Use "Select all" checkbox in header to select all visible rows
3. Action bar appears showing selected count and available operations

**Bulk Delete:**

1. Select multiple records using checkboxes
2. Click Delete in the action bar
3. Confirm deletion in the prompt
4. Selected records are permanently removed

> **Warning:** Bulk delete is permanent and cannot be undone unless you restore from a database backup.

---

## Search & Filtering

### Global Search

The **search bar** in the top header searches across all modules and records you have access to.

**Search Features:**

- **Cross-module**: Searches leads, contacts, accounts, opportunities, etc.
- **Full-text search**: Matches any field content
- **Instant results**: Updates as you type
- **Record links**: Click any result to open the record
- **Permission-aware**: Only shows records you can access

### Module-Level Search

Each module page has its own **search bar** above the table.

**Module Search Features:**

- **Current module only**: Searches records in the current object
- **Field matching**: Searches across all visible fields
- **Real-time filtering**: Table updates instantly as you type
- **Clear search**: X button to reset search

### Advanced Filtering

**Column Sorting:**

- Click any column header to sort ascending
- Click again to sort descending
- Click a third time to remove sorting

**Date Ranges:**

- Date fields support range filtering
- Use format: YYYY-MM-DD to YYYY-MM-DD

---

## Import & Export

### CSV Export

**Export all records:**

1. Navigate to any module page
2. Click **Export** button in toolbar
3. CSV file downloads automatically

**Export Features:**

- **All records**: Exports every record visible to your account
- **Current view**: Respects any active filters or search
- **All fields**: Includes all field data for the object
- **Filename format**: `{objectName}-{timestamp}.csv`

### CSV Import

**Import process:**

1. Navigate to the module where you want to import records
2. Look for **Import** option in module toolbar or Builder section
3. Upload CSV file with properly formatted headers
4. Map CSV columns to CRM fields
5. Review and execute import

**Import Features:**

- **Duplicate detection**: Prevents duplicate records based on key fields
- **Validation**: Checks data format and required fields
- **Batch processing**: Handles large files efficiently
- **Error reporting**: Shows any records that failed to import

For detailed import instructions, see
[SYSTEM_CONFIGURATION.md](../admin-guide/SYSTEM_CONFIGURATION.md#data-management).

---

## Quick Reference

### Keyboard Shortcuts

| Shortcut | Action |
| -------- | ------ |
| Ctrl/Cmd + K | Open global search |
| Ctrl/Cmd + N | Create new record (when in module) |
| Ctrl/Cmd + E | Edit selected record |
| Ctrl/Cmd + S | Save current form |
| Escape | Close modal/panel |

### Common Tasks

**Daily workflow:**

1. Check Dashboard for KPIs and chart updates
2. Review notifications for assigned tasks
3. Update records assigned to you
4. Log activities for customer interactions
5. Move deals through pipeline stages

**Weekly workflow:**

1. Export records for reporting
2. Review team performance metrics
3. Follow up on pending approvals
4. Clean up completed tasks
5. Plan upcoming activities and tasks

---

## Related Guides

- **Installation**: [../getting-started/INSTALLATION.md](../getting-started/INSTALLATION.md)
- **Products**: [PRODUCTS.md](PRODUCTS.md)
- **Admin Configuration**: [../admin-guide/SYSTEM_CONFIGURATION.md](../admin-guide/SYSTEM_CONFIGURATION.md)
- **Workflow Automation**: [../admin-guide/WORKFLOW_AUTOMATION.md](../admin-guide/WORKFLOW_AUTOMATION.md)
