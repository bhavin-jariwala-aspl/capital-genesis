# Underwriting Flow

This document describes the end-to-end underwriting workflow
in Genesis, covering role separation, decision outcomes,
requirements handling, policy issuance, commission crediting,
and post-decision paths.

---

## 1. Role Separation

Underwriting is carried out by **dedicated underwriting teams**.
Agents, Users (USR), Managers (MGR), and Admins must NOT make
underwriting decisions. This separation is required for
regulatory compliance (IRDAI / state insurance departments) and
prevents conflicts of interest between the person selling the
policy and the person assessing the risk.

### Underwriting Team Hierarchy

| Role | Authority | Scope |
|------|-----------|-------|
| Junior Underwriter | Low-risk cases within binding limits | Standard risk, coverage up to threshold |
| Senior Underwriter | Complex cases, higher coverage | Substandard / rated, higher limits |
| Chief UW / UW Manager | Exceptions, oversized policies, reinsurance | All cases, final escalation |
| Medical Director | Medically impaired cases | Advisory, part-time or external |

Each level has a **binding authority limit** (e.g., Junior UW
approves up to 25L coverage, Senior up to 1Cr, beyond that
requires Chief UW sign-off).

### What Each Role Can and Cannot Do

| Role | Can Do | Cannot Do |
|------|--------|-----------|
| Agent / USR | Submit apps, upload docs, respond to UW reqs | Make UW decisions |
| Manager (MGR) | Oversee submissions, escalate, view UW status | Make UW decisions |
| Admin | Configure system, manage users, view reports | Make UW decisions |
| Underwriter | Review risk, request requirements, decide | Submit applications |

---

## 2. Application-to-Underwriting Flow

### 2.1 Application Submission

1. Agent creates an `InsuranceApplication` (status: **submitted**)
2. Agent completes the submission checklist
   (documents, compliance artifacts, applicant details)
3. Agent drags the application to the **under_review** pipeline
   stage (or it is moved programmatically)

### 2.2 Automatic Underwriting Case Creation

When an application reaches the `under_review` stage, the
system automatically:

1. Creates an `UnderwritingCase`
   (status: **pending**, case number: `UW-YYYY-NNNNNN`)
2. Links it one-to-one with the application
3. Captures initial medical/risk data
   (BMI, blood pressure, cholesterol, conditions, medications,
   family history)
4. Updates the application status to `under_review`

### 2.3 Underwriter Assignment

A case is assigned to an underwriter via the
`assigned_underwriter` field. Assignment can be manual or based
on workload / specialization rules.

---

## 3. Underwriting Review Process

### 3.1 Risk Assessment

The underwriter evaluates:

- **Applicant profile:** Age, gender, occupation, income
- **Medical history:** Pre-existing conditions, medications,
  family history, BMI
- **Lab results:** Blood work, urine analysis, BP, cholesterol
- **Financial justification:** Coverage amount relative to income
- **MIB check:** Medical Information Bureau shared database for
  undisclosed conditions
- **Lifestyle factors:** Smoking status, hazardous activities,
  travel history

### 3.2 Risk Classification

Based on the assessment, the underwriter assigns a risk class:

| Risk Class | Meaning | Premium Impact |
|------------|---------|----------------|
| Preferred Plus | Excellent health, no risk factors | Lowest rates |
| Preferred | Very good health, minimal risk | Below-standard rates |
| Standard | Average risk, typical health | Base premium rates |
| Substandard / Rated | Higher risk, manageable conditions | Loading (+25% to +100%) |
| High Risk | Significant risk factors | Substantial loading |
| Decline | Unacceptable risk | Not insurable |

---

## 4. Underwriting Decisions

### 4.1 Decision Outcomes

| Decision | Meaning | What Happens Next |
|----------|---------|------------------|
| **Approved (Standard)** | Acceptable at standard rates | Policy at quoted premium |
| **Approved (Rated)** | Acceptable, higher than standard | Policy with premium loading |
| **Approved w/ Exclusions** | Acceptable with carve-outs | Policy excluding conditions |
| **Referred** | Beyond this UW's authority | Escalated to senior UW |
| **Postponed** | Insufficient info / temp risk | Paused, revisit later |
| **Declined** | Unacceptable risk | Case closed |

### 4.2 Decision Recording

When a decision is made:

- `UnderwritingCase.status` is updated to the decision outcome
- `UnderwritingCase.risk_class` is set based on the assessment
- `UnderwritingCase.decision_notes` captures the rationale
- `UnderwritingCase.decided_at` records the timestamp
- The parent `InsuranceApplication.status` is updated to match
- The pipeline stage is synced automatically

---

## 5. Underwriting Requirements (Additional Findings)

When the underwriter identifies gaps during review, they create
**requirements** that the agent or applicant must fulfil before
a decision can be made.

### 5.1 Requirement Types

| Type | Description | Turnaround |
|------|-------------|------------|
| Medical Exam | Blood/urine, BP, height/weight via vendor | 1-2 weeks |
| Lab Work | Specific blood panels (lipid, HbA1c, etc.) | 1-2 weeks |
| APS | Medical records from applicant's doctor | 2-6 weeks |
| Inspection Report | Background / financial verification | 1-3 weeks |
| Medical Records | Hospital summaries, specialist reports | 2-4 weeks |
| Tele-interview | Phone interview to verify details | 1 week |
| Other | Income proof, travel itinerary, etc. | Varies |

### 5.2 Requirement Lifecycle

```text
Underwriter identifies gap
  -> Creates Requirement (status: pending)
    -> Agent / USR / MGR is notified
      -> Agent coordinates with applicant
        -> Documents uploaded via ApplicationDocument
          -> Requirement status: pending -> received
            -> All fulfilled → underwriter resumes review
```

### 5.3 Requirement Statuses

| Status | Meaning |
|--------|---------|
| Pending | Created, awaiting fulfilment |
| Received | Document or info received from agent/applicant |
| Waived | UW waives it (not needed given other evidence) |
| Not Required | Determined to be unnecessary |

### 5.4 Who Does What

- **Underwriter** creates requirements and reviews documents
- **Agent / USR** uploads documents, coordinates with applicant
- **MGR** can oversee and escalate if requirements are stalled
- **Admin** has no role in the requirements workflow

---

## 6. Policy Issuance (On Approval)

When a case is **approved**, the following occurs in a single
atomic transaction:

1. **Policy Creation**
   - `InsurancePolicy` created (status: **active**)
   - Policy number generated: `POL-YYYY-NNNNNN`
   - Effective date, expiry date, renewal due date set
   - Coverage amount, premium, payment frequency recorded

2. **Commission Crediting**
   - If an agent is linked, a `CommissionEntry` is auto-created
   - Default first-year rate applied (e.g., 45% of FY premium)
   - Commission status set to **pending** (awaiting payout)

3. **Application Status Update**
   - `InsuranceApplication.status` updated to **issued**
   - Pipeline stage is synced

### 6.1 Commission Types

| Type | Description | Typical Rate |
|------|-------------|-------------|
| First-Year (FYC) | Paid on FY premium to producing agent | 25%-55% |
| Renewal | Paid on renewal premiums in later years | 2%-5% |
| Override | Paid to agent's manager or agency | 5%-10% |
| Bonus | Performance-based incentive | Varies |

### 6.2 Commission Lifecycle

```text
Policy Issued
  -> Commission Entry created (status: pending)
    -> Reconciled against carrier CommissionStatement
      -> Status: paid (with paid_at timestamp)
         OR
      -> Status: clawed_back (lapse within 12-24 months)
```

### 6.3 Commission Splits

When two agents co-produce a case, the commission is split
using the `split_agent_id` and `split_percent` fields on the
commission entry.

---

## 7. Decline Path

When a case is **declined**, it is a terminal state. The case
cannot proceed to policy issuance.

### 7.1 What Happens on Decline

1. `UnderwritingCase.status` set to **declined**
2. `InsuranceApplication.status` set to **declined**
3. `decision_notes` must capture the reason for decline
4. Agent and applicant are notified
5. Any advance premium collected is refunded

### 7.2 Post-Decline Options

Although decline is terminal for the current case, there are
paths forward:

| Option | Description |
|--------|-------------|
| **Counter-Offer** | Modified terms (higher premium, lower coverage, exclusions) |
| **Reconsideration** | New evidence submitted, new review cycle requested |
| **Re-application** | Reapply after 6-12 months if reason was temporary |

---

## 8. Complete Lifecycle Summary

```text
APPLICATION SUBMITTED (by Agent)
  |
  v
UNDER REVIEW (auto-creates UnderwritingCase)
  |
  v
UNDERWRITER ASSIGNED
  |
  v
RISK ASSESSMENT
  |
  +-- Requirements needed? --YES--> CREATE REQUIREMENTS
  |                                    |
  |                                    v
  |                                  AGENT UPLOADS DOCUMENTS
  |                                    |
  |                                    v
  |                                  REQUIREMENTS FULFILLED
  |                                    |
  |                    <---------------+
  |
  v
UNDERWRITING DECISION
  |
  +-- APPROVED -------> POLICY ISSUED (POL-YYYY-NNNNNN)
  |                        |
  |                        +-> COMMISSION CREDITED
  |
  +-- APPROVED (RATED) -> POLICY WITH LOADING
  |
  +-- REFERRED ---------> ESCALATED TO SENIOR UW
  |
  +-- POSTPONED --------> CASE PAUSED
  |
  +-- DECLINED ---------> CASE CLOSED
                            |
                            +-> Counter-offer / Reconsider
```

---

## 9. Key Reference Numbers

| Entity | Format | Example |
|--------|--------|---------|
| Application | `APP-YYYY-NNN` | APP-2026-001 |
| UW Case | `UW-YYYY-NNN` | UW-2026-001 |
| Policy | `POL-YYYY-NNNNN` | POL-2026-00001 |
| Claim | `CLM-YYYY-NNN` | CLM-2026-001 |
| Declaration | `DCL-YYYY-NNN` | DCL-2026-001 |
| Document | `DOC-{APP}-{SEQ}` | DOC-APP2026001-001 |

---

## 10. Case Review Page

### 10.1 Overview

The Case Review page (`/insurance/underwriting/:id`) gives an
underwriter a single, comprehensive view of everything needed
to make a decision. It replaces the previous detail modal with
a full-page, tabbed review experience following industry-standard
underwriting workflows (Guidewire, Salesforce FSC patterns).

### 10.2 Navigation

From the Underwriting list page:

- Click any **row** in the cases table, OR
- Click the **Eye icon** (Review Case) button

This navigates to `/insurance/underwriting/:id`.

### 10.3 Page Structure

The page has a **header ribbon** and **five tabs**:

**Header:**

- Breadcrumb navigation back to the list
- Case number, status badge, applicant summary
- Approve / Decline buttons (visible for pending/in-progress)
- Readiness ribbon: documents, declarations, requirements, and
  risk class status at a glance

**Tabs:**

| Tab | What it shows |
|-----|---------------|
| **Case Overview** | Applicant info, case metadata, medical summary, decision notes, clickable summary panels |
| **Application** | Full application details, applicant contact, linked quote scenarios |
| **Documents** | All uploaded documents with individual and bulk approve/reject/waive |
| **Declarations** | Declaration status, signature details, delivery method, timestamps |
| **Requirements** | Outstanding requirements with received/waive actions, add new |

### 10.4 Document Review

**Individual review:**
Each document card shows filename, category, size, upload date,
and version. Pending documents have approve (checkmark) and
reject (X) action buttons.

**Bulk review:**
Select multiple documents via checkboxes (or "Select all pending"),
then choose Approve/Reject/Waive from the dropdown and click Apply.

**Download:**
Click the download icon on any document to save the file.

### 10.5 Decision Workflow

The Approve/Decline modal includes a **Readiness Check** that
shows whether:

- All documents have been reviewed
- All declarations are accepted/signed
- All requirements are fulfilled

This is advisory — the underwriter can still proceed if items
are outstanding (e.g., waiving a requirement).

### 10.6 Metadata-Driven Architecture

The Case Review page follows the Genesis metadata-driven pattern
(**Module > Object > Fields**):

```text
UiObject (name: "underwriting_case")
  └── status, risk_class, case_number, decision_notes, bmi, ...

UiObject (name: "application_document")
  └── status, category, rejection_reason, ...

UiObject (name: "application")
  └── status, product_type, coverage_amount, ...
```

**How it works at runtime:**

1. Frontend resolves three objects via `runtimeService`:
   `underwriting_case`, `application_document`, `application`
2. Field options (status values, risk classes, categories) are
   derived from `UiField.options` with metadata colors
3. Badge variants are resolved via `statusVariant()` using the
   field color → variant mapping
4. Field labels are resolved via `fieldLabel()` from metadata
5. Static fallbacks are used only when metadata is unavailable

### 10.7 Technical Implementation

| Component | File |
|-----------|------|
| Case Review page | `frontend/.../pages/runtime/UnderwritingCaseReviewPage.jsx` |
| List page | `frontend/.../pages/runtime/UnderwritingPage.jsx` |
| Route | `/insurance/underwriting/:id` in `App.jsx` |
| Backend UW API | `backend/.../routes/insurance/index.js` |
| Frontend service | `frontend/.../services/insurance.service.js` |
| Metadata helpers | `frontend/.../utils/metadata-helpers.js` |

### 10.8 Backend API Endpoints Used

| Endpoint | Purpose |
|----------|---------|
| `GET /underwriting/:id` | Case details + application + requirements |
| `GET /applications/:id` | Full application with contact, carrier |
| `GET /application-documents?application_id=X` | Documents for the application |
| `GET /application-documents/:id` | Single document detail |
| `GET /application-documents/:id/download` | Download document file |
| `PATCH /application-documents/:id/review` | Approve/reject/waive document |
| `GET /declarations?search=APP_NUMBER` | Declarations for the application |
| `GET /quote-scenarios?contact_id=X` | Quote scenarios for the applicant |
| `POST /underwriting/:id/decision` | Make approve/decline decision |
| `POST /underwriting/:id/requirements` | Add new requirement |
| `PATCH /underwriting/requirements/:id` | Update requirement status |

---

## 11. Application Report & Client Communication

### 11.1 Overview

The Applications module provides two client-facing actions
from both the application list (table row) and detail modal:

- **View Report** — generates a PDF-ready application report
  summarizing all filled-in data
- **Email Client** — renders the same report as a PDF
  attachment and emails it directly to the applicant

Both actions follow the same pattern used by the Quote
module's "View Quote" and "Email Client" features.

### 11.2 Metadata-Driven Architecture

The Applications page follows the Genesis metadata-driven
pattern: **Module > Object > Fields**.

```text
UiModule (name: "applications", icon: "FileText")
  └── UiObject (name: "application")
        └── UiField (name: "status", field_type: "select")
        └── UiField (name: "product_type", field_type: "select")
        └── UiField (name: "coverage_amount", field_type: "currency")
        └── ... (12 fields total)
```

**How it works at runtime:**

1. Frontend calls `GET /runtime/resolve?object=application`
   to get the `object_id`
2. Frontend calls `GET /runtime/object/:id` to get the object
   with its fields (role-filtered)
3. Status filter options, product filter options, table labels,
   and badge variants are derived from `UiField.options`
4. Static fallback values are used only when metadata
   resolution fails (initial load or unseeded object)

### 11.3 Application Report Generation

**Flow:**

```text
User clicks "View Report" (or "Email Client")
  → POST /insurance/templates/render-application-report
    → Backend fetches full application with relations
    → Renders APPLICATION_REPORT template as HTML
  → Displays in full-screen PDFViewer (View Report)
     OR
  → Sends HTML to POST /email/send-with-pdf (Email Client)
    → Backend converts HTML to PDF via Chrome headless
    → Sends email with PDF attachment to client
```

**Report Sections:**

| Section | Content |
|---------|---------|
| Header | App number, status, carrier branding |
| Application Summary | Number, status, submission date, product |
| Applicant Information | Name, email, phone, DOB, age, gender |
| Coverage Details | Amount, premium, term, frequency, carrier |
| Agent / Producer | Agent name, email |
| Underwriting Case | Case number, status, risk class, requirements |
| Policy Information | Policy number, status, effective date |
| Notes | Application notes |
| Disclaimers | Standard regulatory disclaimers |

### 11.4 Technical Implementation

| Component | File |
|-----------|------|
| Template definition | `backend/.../template-engine.service.js` |
| Backend route | `backend/.../routes/insurance/index.js` |
| Frontend service | `frontend/.../services/insurance.service.js` |
| Frontend page | `frontend/.../pages/runtime/ApplicationsPage.jsx` |
| PDF conversion | `backend/.../utils/html-to-pdf.js` |
| Email dispatch | `backend/.../routes/email/index.js` |

### 11.5 User Actions

| Action | Location | Behavior |
|--------|----------|----------|
| **View Report** | Table + Modal | Renders report, auto-archives as document, opens PDFViewer. |
| **Email Client** | Modal only | PDF emailed to client. Inline feedback. |
| **Upload Docs** | Table + Modal | Navigates to Document Collection page. |

### 11.6 Mandatory Report Viewing & Auto-Archiving

Reports must be viewed at key workflow checkpoints before the
user can proceed. When a report is viewed, it is automatically
archived as an `ApplicationDocument` for the case file.

**Quote Report (InsuranceQuotePage):**

- The **"Apply Now"** button is disabled until the agent clicks
  **"Quote PDF"** to view the quote report
- A hint ("View Quote PDF first") appears next to the disabled
  button
- This ensures the quote has been reviewed before creating an
  application

**Application Report (ApplicationsPage):**

- The **"Send to UW"** button is disabled until the agent clicks
  **"View Report"** to review the application report
- When the report is viewed, it is automatically rendered AND
  archived via `POST /templates/render-and-archive`
- Both HTML and PDF versions are saved as documents in the
  `reports` category
- The detail modal shows a warning banner if the report has not
  yet been viewed, and a confirmation banner once it has

**Backend: `POST /templates/render-and-archive`**

This endpoint renders a report and saves it as an
`ApplicationDocument` in one call:

```text
Request: { report_type, application_id, calculation?, client?, agent? }
  report_type: "quote_report" | "application_report"

Response: { html, documents, already_archived }
  html: rendered HTML string for display
  documents: created ApplicationDocument records (HTML + PDF)
  already_archived: true if an identical report was already saved
```

Files are stored under `uploads/documents/{tenant}/{year}/{app}/reports/`.
PDF generation uses headless Chrome and gracefully falls back
to HTML-only if Chrome is unavailable.

---

## 12. Underwriting Feature Toggle (ON/OFF)

The entire underwriting workflow can be switched ON or OFF
per tenant using the `underwriting_workflow` feature flag.

### 12.1 When Underwriting is ON (default)

- Applications follow the full pipeline:
  submitted → under_review → UW case → approved/declined → policy
- "Send to UW" button is visible on the Applications page
- Pipeline drag to `under_review` auto-creates an
  `UnderwritingCase`
- Policy issuance requires UW approval first

### 12.2 When Underwriting is OFF

- Applications go directly from submitted → policy issuance
- "Send to UW" and "In Underwriting" buttons are hidden
- "Issue Policy" appears on submitted applications
- Pipeline drag to `under_review` does NOT create a UW case
- The underwriting module remains accessible but no new
  cases are auto-created

### 12.3 How to Toggle

Admins toggle via the platform Feature Flags panel:

```text
POST /api/platform/feature-flags/:id/toggle
  or
POST /api/platform/feature-flags/:id/tenant-override
  { tenant_id, is_enabled: true/false }
```

Frontend checks:
`GET /api/insurance/feature/underwriting-workflow`
returns `{ enabled: true/false }`.

---

## 13. Underwriter Roles and Access Control

### 13.1 Role Definitions (Metadata-Driven)

Roles are seeded in the `roles` table and loaded at startup
via `initRoleLevel()`. The ROLE_LEVEL map uses an inverted
system — lower number = more access.

| Role | Level | Description |
|------|-------|-------------|
| `platform_admin` | 1 | System-wide super admin |
| `super_admin` | 2 | Full tenant access |
| `admin` | 3 | Configure system, manage users |
| `manager` | 4 | Team/hierarchy scoped (agent side) |
| `uw_manager` | 4 | Chief UW; all cases, manage UW team |
| `user` | 5 | Own records only (agent side) |
| `senior_underwriter` | 5 | Complex cases, higher limits |
| `underwriter` | 6 | Standard UW, binding authority |

### 13.2 UiPermission Access Matrix

Underwriter roles are restricted via `UiPermission` rows
(entity_type: 'object'). This is enforced by the
`filterMetadataByRole()` in PermissionService — modules
and sidebar items the user cannot view are hidden.

| Object | UW Roles | Agent Roles |
|--------|----------|-------------|
| Underwriting Cases | view + edit | view + edit |
| Application Documents | view + edit | view + edit |
| Applications | view only | view + edit |
| Policies | view only | view + edit |
| Claims | view only | view + edit |
| Clients | view only | view + edit |
| Prospects | no access | view + edit |
| Quotes | no access | view + edit |
| Commissions | no access | view + edit |
| Settings | no access | view + edit |
| Declarations | no access | view + edit |

### 13.3 OperationalPermission for UW Decisions

The `POST /underwriting/:id/decision` and
`PATCH /underwriting/:id` endpoints are protected by
`assertCanDecideUnderwriting()` which checks for an
`OperationalPermission` row with
`entity_type='underwriting'` and `edit_scope != 'none'`.

| Role | edit_scope | Can Decide |
|------|-----------|------------|
| `admin` | all | Yes — all cases |
| `uw_manager` | all | Yes — all cases |
| `senior_underwriter` | all | Yes — all cases |
| `underwriter` | own | Yes — assigned cases only |
| `manager` | (none) | No |
| `user` | (none) | No |

### 13.4 What Underwriters Cannot Do

- Create or submit applications
- Generate or view quotes
- Manage prospects or clients (edit)
- View or manage commissions
- Modify system settings
- Issue policies (only the agent side does this)

---

## 14. Seed Data Inventory

### 14.1 Underwriting Team Logins

| Employee ID | Name | Role | Email | Password |
|---|---|---|---|---|
| `UWMGR001` | Chief Underwriter | `uw_manager` | `chief.uw@genesislife.local` | Underwriter@123 |
| `SRUW001` | Senior Underwriter | `senior_underwriter` | `senior.uw@genesislife.local` | Underwriter@123 |
| `UW001` | Underwriter | `underwriter` | `underwriter@genesislife.local` | Underwriter@123 |

The UW team hierarchy: `admin → uwMgr → srUw → uw1`.

### 14.2 Seeded Underwriting Cases (8 total)

| Case | App | Underwriter | Status | Risk | Detail |
|---|---|---|---|---|---|
| UW-0001 | APP-0001 | Senior UW | approved | preferred | Clean labs |
| UW-0002 | APP-0002 | Underwriter | in_progress | standard | Mild hypertension |
| UW-0003 | APP-0003 | Underwriter | pending | standard | Just received |
| UW-0004 | APP-0004 | Senior UW | in_progress | standard | Cancer family hx |
| UW-0005 | APP-0005 | Chief UW | referred | preferred | Reinsurer referral |
| UW-0006 | APP-0006 | Senior UW | in_progress | substandard | Multiple risk factors |
| UW-0007 | APP-0007 | Chief UW | declined | decline | Liver + BP issues |
| UW-0008 | APP-0008 | Underwriter | approved | preferred_plus | Clean, fast approval |

### 14.3 Seeded Requirements (23 total)

Requirement types across all 8 cases:

- **medical_exam** — paramedical exams, mammogram, stress test
- **attending_physician** — APS from named doctors
- **lab_work** — metabolic panels, lipid panels
- **records** — MIB checks, prescription history, income docs
- **inspection** — financial justification for high coverage
- **other** — tele-interviews, reinsurer submissions

Statuses: mix of `received` (with timestamps) and `pending`
(with due dates). Some include `notes` with clinical findings.

### 14.4 Feature Flags

| Flag | Default | Description |
|------|---------|-------------|
| `underwriting_workflow` | ON | Full UW pipeline. OFF = direct issuance. |
| `ai_underwriting` | OFF | AI-powered risk scoring (premium). |
