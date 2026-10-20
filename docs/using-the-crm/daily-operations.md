# Genesis CRM — Daily Operations Guide

<!-- nav:top -->
> **[Docs roadmap](../README.md)** › **[Using the CRM](README.md)** › 1 of 6 · **For:** All staff
> ← [Tutorial videos](../genesis-capital/videos/README.md) *(Tutorial videos)* · [What's new — how-to](whats-new.md) →
> New to Genesis? Background: [Understanding Genesis › The building blocks](../understanding/02-building-blocks.md)
<!-- /nav:top -->

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

Genesis CRM has four built-in workspace roles (plus `platform_admin`, which runs the platform console). Each
employee has one role, set in **Builder > Employees**.

| Role | What they can do |
| ---- | ---------------- |
| super_admin | Everything — full system administration |
| admin | Module management, Builder access, user management |
| manager | Team record access, task assignment, reporting |
| user | Own records, assigned records, basic CRM functions |

A workspace can add its own roles in **Builder > Roles & Levels**. Each custom role sits at the manager or user
level. The Genesis Capital workspace has 17 of them, for example Relationship Manager (`rm`), Loans Executive,
Credit Analyst, Compliance Officer and MLRO.

**Visible UI differences:**

- `admin` / `super_admin` see a **Builder** section (collapsible) in the left sidebar
- Non-admin roles do **not** see the Builder section

### Two-Tier Permission Model

Genesis CRM enforces a **two-tier permission model** on top
of the base roles. The rules are applied **server-side**.

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

> **Limits:** these rules hide metadata (menus, objects, fields, forms) from the
> role. The record API does not check an object's `can_view`, and a field with
> `can_view = false` is hidden on screen only — its value still comes back in
> the record data. Use operational scopes and information barriers to restrict
> records.

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
[permissions-and-roles.md](../administration/permissions-and-roles.md).

---

## Navigation Overview

The application has a persistent **left sidebar** and a **top header bar** on all screens.

### Top Header Bar

```text
┌─────────────────────────────────────────────────────────────────┐
│  ≡  │  Search records…  Quick Find   │  Builder  🔔  Aa  EN/FR  You  │
└─────────────────────────────────────────────────────────────────┘
```

| Element | Description |
| ------- | ----------- |
| ≡ Menu | Opens/closes left sidebar (mobile) |
| Search | Global record search across all modules |
| Quick Find | Searches Builder settings (admins only; Ctrl/Cmd + K) |
| Builder | Opens the Builder home (admins only) |
| Notifications | Bell icon with unread count indicator |
| Personalise | Light/dark theme, text size and motion for you |
| EN / FR | Display language for labels that have a French version |
| Avatar | Opens **My account — security** (password, MFA) |

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
│  TOOLS                                                          │
│     Approvals · My Reminders · Web forms · Reports ·            │
│     Access & Barriers · SLA Board · Social Media                │
│  DOCUMENTS                                                      │
│     Document Management                                         │
│                                                                 │
│  CLIENT 360           (category: client_360)                    │
│     Products & Services · Clients · Enquiries & Leads ·         │
│     Cross-sell & RM Workbench                                   │
│  LENDING · INVESTMENTS · ADVISORY · GROWTH · SERVICE ·          │
│  COMPLIANCE · MASTERS (one section per module category)         │
│                                                                 │
│  Builder  (admin only, collapsible)                             │
│     Configure: Modules & Objects · Appearance Studio ·          │
│                Form Builder · Dashboard Builder · Reports ·     │
│                Pipeline Builder · Wizards · Document Management │
│     Automate:  Workflows · Assignment Rules ·                   │
│                Lead Scoring Rules · SLA Engine                  │
│     Connect:   Integrations · Health · Email · Social · Push    │
│     Manage:    Permissions · Employees · Org Chart ·            │
│                Roles & Levels                                   │
│                                                                 │
│  Platform  (platform_admin only, collapsible)                   │
│     Dashboard · Tenants · Feature Flags · Plans ·               │
│     Announcements · Analytics · Security · Audit Log            │
├─────────────────────────────────────────────────────────────────┤
│  John Doe  /  user  /  Settings                                 │
└─────────────────────────────────────────────────────────────────┘
```

`MODULE_CATEGORIES` in `frontend/src/utils/constants.js` names
two categories (`crm` → "Modules", `tools` → "Tools"). Any other
category becomes its own section, titled from the key
(`client_360` → "Client 360"). Empty categories are hidden
automatically.

In the Genesis Capital workspace the 19 modules sit in eight
categories: Client 360, Lending, Investments, Advisory, Growth,
Service, Compliance and Masters.

The sidebar collapses on mobile — tap the hamburger menu (≡) in the top-left header to open it.

---

## Dashboard (Home Screen)

The Dashboard is the first screen you see after login.
It updates automatically based on what panels are configured
in the Dashboard Builder.

### What you see

In the Genesis Capital workspace each desk lands on its own dashboard (the
**Home Dashboard by Role** setting): for example a Relationship Manager opens
**My Workbench**, the lending roles open **Lending Pipeline**, and Compliance
opens **Compliance**. Roles not listed open the default, **Group Executive**.

**KPI Metric Cards (top row of Group Executive):** Each card shows a headline number.

| Card | Value |
| ---- | ----- |
| Total relationship value (MUR) | Sum of every client's relationship value |
| Wealth AUM (MUR) | Assets under wealth mandates |
| Fund holdings (MUR) | Value of fund holdings |
| Loan book (MUR) | Outstanding balance of loan accounts |

**Chart panels (below KPI cards):** revenue by entity and by month, loans
disbursed by month, FX volume by month, relationships by entity, clients by
segment, products held per client, and open cross-sell opportunities by entity.

### Switching dashboards

If more than one dashboard exists, a dropdown appears in the
top-left of the dashboard area. Select a different dashboard
to switch views. Genesis Capital ships 15 dashboards (for
example Lead Funnel, Loan Book and Forex Desk).

---

## Essential CRM Features

These features work alongside the module system.

### Product Catalog

In the Genesis Capital workspace the product catalogue is the **Product** object in the
**Products & Services** module. It holds the 22 products and services, each with a code,
category, risk rating, margin over the Genesis PLR and a product sheet.

**Accessing the Product Catalog:**

1. Open **Products & Services** in the left sidebar
2. Administrators can click **+ New Product** to add one; staff roles can view only

For details, see [products-and-services.md](products-and-services.md).

### Email Templates

The Email Template system provides standardized communication
with dynamic personalization. Templates support HTML and plain
text formats, automatic variable extraction, multi-language
capabilities, and usage analytics.

#### Managing Email Templates (Builder — Admin Only)

Email templates are managed in the **Builder** section and
are scoped to specific **Module > Object** combinations.
For example, the "enquiry_ack" template belongs to
Enquiries & Leads > Enquiry, and "complaint_ack" belongs to
Service & Complaints > Service Request.

1. Navigate to **Builder > Email Templates** from the left sidebar (admin/super_admin only)
2. Templates are grouped by **Module > Object** sections (e.g. Enquiries & Leads > Enquiry)
3. Each section shows its templates with name, category, subject, usage count, and status
4. Click any template row to expand and see variables, subject preview, and action buttons

#### Creating a Template

1. Click **+ New Template** in the top-right
2. Fill in the following fields:

| Field | Required | Description |
| ----- | -------- | ----------- |
| Assign to Object | Yes | Select the Module > Object this template belongs to (e.g. Enquiries & Leads > Enquiry) |
| Name | Yes | Template name |
| Category | No | One of: sales, marketing, support, onboarding, welcome, newsletter, follow_up, other |
| Subject | Yes | Email subject line. Supports `{{variables}}` |
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
| Sales | `{{first_name}}`, `{{enquiry_no}}`, `{{product_code}}` |
| Service | `{{application_no}}`, `{{upload_link}}` |

#### Sending an Email from Any Record

The email compose feature is available from **every record**
in the application, in any module.

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
field values and maps them onto the template's
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

Using the "enquiry_ack" template with these variables:

| Variable | Value |
| -------- | ----- |
| `first_name` | John |
| `enquiry_no` | ENQ-2026-000123 |
| `product_code` | Personal Loan |

Produces:

- **Subject:** "We received your enquiry — ENQ-2026-000123"
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

The Genesis Capital pack ships 18 templates, each in English
and French (the French copy has a `_fr` suffix). Examples:

- **enquiry_ack** (Enquiry) — Subject:
  "We received your enquiry — `{{enquiry_no}}`"
- **loan_document_request** (Loan Application) — Subject:
  "Documents needed for your loan application `{{application_no}}`"
- **complaint_ack**, **service_ack** (Service Request)
- **kyc_refresh_request** (Party)

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
1. Select a category (the list is set in
   **Builder > Document Management**)
1. Click **Choose file** and select a file from your
   computer
1. The file uploads and appears in the document list

#### Supported File Types

- PDF documents
- Microsoft Office (Word, Excel, PowerPoint)
- Plain text and CSV
- Images (JPEG, PNG, GIF, WebP)
- Maximum file size: 25 MB by default (`STORAGE_MAX_FILE_SIZE`).
  A category can set a lower limit.

#### Document List

Each document shows:

- File name with type-specific icon
- File size and category
- Upload timestamp
- **Download** button (hover) — downloads the file
- **Delete** button (hover) — removes the document

#### How Documents Are Stored

Files are saved by the configured storage driver
(`STORAGE_DRIVER`): the server's `uploads/` directory by
default, or S3, Azure Blob or Google Cloud Storage. Each file
is stored under a relative key with a unique name. Document
metadata (name, size, type, category, status, version) is
stored in the `documents` table, with `entity_type` and
`entity_id` linking it to the record.

#### API Endpoints

| Method | Path | Description |
| ------ | ---- | ----------- |
| POST | `/api/documents/upload` | Upload (base64) |
| GET | `/api/documents` | List with filters |
| GET | `/api/documents/:id` | Get metadata |
| GET | `/api/documents/:id/download` | Download file |
| GET | `/api/documents/record/:recordId` | Docs for a record |
| PUT | `/api/documents/:id` | Update metadata |
| DELETE | `/api/documents/:id` | Delete |

### Lead Scoring

**In Genesis Capital:** each **Enquiry** shows a **Lead score** (0–100) and a
**Grade** (A–F). These are formula fields on the enquiry object. They recalculate
when the enquiry is saved, from the amount, whether the enquirer is an existing
client, the contact details given, marketing consent and the channel. The
Lead Scoring Rules screen does not affect them; to change the scoring, edit the
formulas in **Builder > Modules & Objects**.

**The scoring engine:** **Builder → Automate → Lead Scoring Rules** (admin only)
scores only an object named `lead_intake`. Genesis Capital has no such object, so
these rules score nothing there. Where a `lead_intake` object exists, its module
shows the score, the grade and a **Lead Scoring Insights** panel. See
[Lead Scoring Rules](../builder-guide/13-lead-scoring-rules.md).

### Notifications (Bell Icon)

The bell icon in the top-right header shows your in-app
notifications with a red badge for unread count.

**How notifications reach you:**

Notifications are created automatically by the system, not
manually by other users. The main sources are:

1. **Workflow notifications** — When a workflow executes a
   `notification` step.
2. **Approval requests** — When a workflow reaches an
   `approval` step, all designated approvers receive a
   notification with a link to approve/reject.
3. **Admin push notifications** — Admins can send targeted
   notifications from **Builder > Push Notifications** to
   specific roles, individual employees, or all users.
4. **Other events** — reminders falling due, SLA warnings and
   breaches, scheduled-report alerts, social posts and
   mentions, and portal messages.

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
| `sla` | An SLA target is near breach or breached |
| `report_alert` | A scheduled report's alert condition is met |
| `social`, `mention` | A social post or mention needs your attention |

### Reminders

Set a **reminder** on any record (an enquiry, a client, a loan application) to be
notified at a specific time.

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

**Deleted records:** reminders on a record in the Trash are hidden from My
Reminders and do not notify you. They stay pending and fire normally if the
record is restored.

> **Tasks vs. reminders:** a **task** is assignable work with a status; a
> **reminder** simply notifies you at a moment in time. Use tasks for "what
> needs doing", reminders for "ping me then".

### Enquiry Stage Change Automation

When an enquiry's stage changes, the system automatically triggers a chain of actions:

**What happens on every stage change:**

1. **Audit log** — records old and new values with timestamp and user
2. **Activity entry** — the stage move appears in the record's timeline
3. **Workflow trigger** — matching `field_changed` workflows fire

#### Built-in enquiry workflows

Workflows on the Enquiry object run without any setup, for example:

| Workflow | When | What you see |
| -------- | ---- | ------------ |
| Enquiry — acknowledgement (EN/FR) | An enquiry is created | The enquirer gets an acknowledgement email in their language |
| Enquiry — existing clients go to their RM | An enquiry is created | An enquiry from an existing client is reassigned to the client's primary RM |
| Enquiry — convert to Party, relationship, KYC and application | Stage moves to **Converted** | The party is created (or the existing one linked), the entity relationship and KYC case are opened, and a loan application is started for retail loans |

The conversion only runs while the enquiry has no party yet, so moving it back and
forth does not create a second party.

See [Workflows](../builder-guide/12-workflows.md#what-ships-out-of-the-box) for the full catalogue
of 89 built-in Genesis Capital workflows.

#### Applies to every object

The `field_changed` trigger works for any object. A field
change creates an audit log entry and fires matching
workflows.

---

## Working with Records

### Browsing a Module

Click any **module name** in the left sidebar (e.g. Clients, Enquiries & Leads) to view its record list.

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
| {Wizard name} | Launch the object's guided creation wizard (shown when one exists) |
| Export | Download records as CSV |
| Import | Open the CSV import for this object |
| Delete / Reassign | Bulk actions on selected records |

### Creating a New Record

1. Click **+ New {Object}** in the module toolbar
2. Fill out the form fields (required fields marked with *)
3. Click **Create {Object}** to save, or **Cancel** to go back

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
- Click **Save Changes** to update the record
- Click **Cancel** to discard changes

### Pipeline (Kanban) View

Switch to Pipeline view to see records organized by stage/status.

**Using Pipeline View:**

- **Drag & Drop**: Drag a card onto any part of another column. The new stage is saved immediately — and any status
  field the pipeline mirrors is updated with it — and a short "moved to …" notice confirms it.
- **Refused moves**: If the stage requires fields or a condition first, the card returns to its column and a message
  names what is missing (by field label), with a link to open the record and complete it.
- **Stage Columns**: Each column represents a different stage
- **Stage history**: Every move is logged on the record's timeline and audit trail
- **Bulk stage change**: Moving several records at once does exactly what a single move does — it updates the
  mirrored status field and writes the timeline entry for each record

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
4. Selected records disappear from every list; totals on their parent records update straight away

> **Note:** By default deleted records go to the Trash, where an administrator can restore them. Only objects whose
> pipeline is set to permanent delete (Pipeline Builder ▸ delete mode) remove records for good.

### Merging Duplicates

When a duplicate is merged into the record you keep (see
[Merging duplicate records](my-account-and-record-tools.md#merging-duplicate-records)), the duplicate's
**activities, tasks, reminders, documents and email history** move to the kept record. Totals on parent records
stop counting the duplicate. Reversing the merge moves exactly those items back; anything added to the kept record
since stays where it is. Any SLA timers on the duplicate are cancelled.

### Records in the Trash

While a record is in the Trash:

- Its tasks and reminders are left out of task lists, **My Reminders** and the calendar feed. The record's own
  Tasks and Reminders tabs still show them.
- Its reminders do not fire. They stay pending and fire if the record is restored.
- It is left out of reports and of totals on parent records. Restoring it counts it again.

### Screens Stay Up to Date

- Lists, boards, dashboards and related lists refresh by themselves after a save, a stage move, a bulk action, an
  import, an approval decision or a workflow button. Results of workflows that run after a save appear a moment
  later.
- An open record panel follows these changes while it stays open. The **Edit** form always opens with the latest
  saved values.
- Totals and counts on a parent record (for example the number of holdings on a client) update when a child record
  is edited, moved to another parent, deleted, restored or merged.

---

## Search & Filtering

### Global Search

The **search bar** in the top header searches across all modules and records you have access to.

**Search Features:**

- **Cross-module**: Searches clients, enquiries, loan applications and every other object
- **Searchable fields**: Matches the fields marked searchable on each object
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

- Click a sortable column header to sort ascending
- Click again to sort descending

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
2. Click **Import** in the module toolbar
3. Upload CSV file with properly formatted headers
4. Map CSV columns to CRM fields
5. Review and execute import

**Import Features:**

- **Duplicate detection**: Prevents duplicate records based on key fields
- **Validation**: Each row is checked like a normal save (required fields, validation rules, defaults,
  formulas, auto-numbers, starting stage, assignment rules and workflows)
- **Batch processing**: Handles large files efficiently
- **Error reporting**: A row that fails validation is skipped without stopping the import. The done screen shows
  a **Failed** count and the first reasons; recent imports show "N created · M failed"

For detailed import instructions, see
[system-configuration.md](../administration/system-configuration.md#data-management).

---

## Quick Reference

### Keyboard Shortcuts

| Shortcut | Action |
| -------- | ------ |
| Ctrl/Cmd + K | Open Setup Quick Find (admins) |
| Escape | Close modal/panel, or clear the search box |

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

- **Installation**: [../getting-started/installation.md](../getting-started/installation.md)
- **Products**: [products-and-services.md](products-and-services.md)
- **Admin Configuration**: [../administration/system-configuration.md](../administration/system-configuration.md)
- **Workflow Automation**: [../administration/workflow-automation.md](../administration/workflow-automation.md)

<!-- nav:bottom -->

---

### Where to next

| | |
|---|---|
| **Next** | [What's new — how-to](whats-new.md) — Plain-language how-to for recent features |
| **Previous** | [Tutorial videos](../genesis-capital/videos/README.md) *(Tutorial videos)* |
| **Background** | [Understanding Genesis › The building blocks](../understanding/02-building-blocks.md) |
| **Related** | [Genesis Capital user guide](../genesis-capital/user-guide.md) |
| **On these journeys** | [Genesis Capital staff](../README.md#genesis-capital-staff) (step 6 of 9) |
| **Lost?** | [Docs roadmap](../README.md) · [Using the CRM](README.md) · [Understanding Genesis](../understanding/README.md) |
<!-- /nav:bottom -->
