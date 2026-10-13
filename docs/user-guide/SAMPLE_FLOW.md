# Sample Flow: Lead to Policy Issuance

A step-by-step walkthrough of the complete insurance lifecycle in
Genesis — from a raw inbound **Lead**, through qualification into a
**Prospect**, all the way to an issued policy.

This guide uses the **seeded demo users and data** so you can follow
along in a local environment immediately after running
`npx prisma db seed`.

---

## Seeded Users

### Agency Team

| Name | Role | Employee ID | Email | Password |
|------|------|-------------|-------|----------|
| Platform Super Admin | `platform_admin` | PLATFORM01 | `platform@genesislife.local` | `Platform@123` |
| Agency Owner | `super_admin` | ADMIN001 | `owner@genesislife.local` | `Admin@123` |
| Sales Manager | `manager` | MGR001 | `sales.manager@genesislife.local` | `Manager@123` |
| Senior Agent | `user` | USR001 | `senior.agent@genesislife.local` | `User@123` |
| Agent | `user` | USR002 | `agent@genesislife.local` | `User@123` |

### Underwriting Team

| Name | Role | Employee ID | Email | Password |
|------|------|-------------|-------|----------|
| Chief Underwriter | `uw_manager` | UWMGR001 | `chief.uw@genesislife.local` | `Underwriter@123` |
| Senior Underwriter | `senior_underwriter` | SRUW001 | `senior.uw@genesislife.local` | `Underwriter@123` |
| Underwriter | `underwriter` | UW001 | `underwriter@genesislife.local` | `Underwriter@123` |

### Team Hierarchy

```text
Agency side                        Underwriting side
──────────                         ─────────────────
Platform Super Admin               Agency Owner (ADMIN001)
  └── Agency Owner (ADMIN001)        └── Chief Underwriter (UWMGR001)
        └── Sales Manager (MGR001)         └── Senior Underwriter (SRUW001)
              ├── Senior Agent (USR001)          └── Underwriter (UW001)
              └── Agent (USR002)
```

### Who Can Do What

| Action | Agent (USR001/USR002) | Manager (MGR001) | Underwriter (UW001) | Admin (ADMIN001) |
|--------|:---------------------:|:-----------------:|:-------------------:|:----------------:|
| Manage prospects | Yes | Yes | No | Yes |
| Convert prospect to client | Yes | Yes | No | Yes |
| Create quotes | Yes | Yes | No | No |
| Create applications | Yes | Yes | No | No |
| Send declarations | Yes | Yes | No | No |
| Upload documents | Yes | Yes | No | No |
| Send to underwriting | Yes | Yes | No | No |
| Review UW case | No | No | Yes | Yes |
| Add UW requirements | No | No | Yes | Yes |
| Make UW decision | No | No | Yes | Yes |
| Issue policy | Yes | Yes | No | No |

---

## Seeded Sample Data

The seed creates a set of prospects, clients, quotes, and
applications that are already at various stages. This walkthrough
uses **Robert Thompson** — a seeded prospect who has not yet been
converted — as our example.

### Seeded Prospects

| Name | Status | Interest | Assigned To |
|------|--------|----------|-------------|
| Robert Thompson | `new` | $500K term life | Senior Agent (USR001) |
| Maria Garcia | `new` | Whole life with investment | Agent (USR002) |
| David Park | `contacted` | Universal life & annuity | Senior Agent (USR001) |
| Sarah Johnson | `qualified` | Key-person insurance | Sales Manager (MGR001) |
| James Wilson | `converted` | $1M term + whole life | Senior Agent (USR001) |

### Seeded Clients (already converted)

| Name | Occupation | Health Class | Annual Income |
|------|-----------|-------------|---------------|
| James Wilson | Attorney | Preferred Plus | $280,000 |
| David Park | Physician | Preferred | $420,000 |
| Sarah Johnson | CEO | Standard | $195,000 |
| Lisa Chen | Financial Planner | Preferred | $135,000 |
| Michael Brown | Business Owner | Standard | $310,000 |

### Seeded Quotes

| Quote # | For | Product | Total | Status |
|---------|-----|---------|-------|--------|
| Q-2026-0001 | Robert Thompson | Term Life + Accidental Death Rider | $1,900 | Presented |
| Q-2026-0002 | David Park | Universal Life + Waiver of Premium | $3,840 | Draft |
| Q-2026-0003 | Sarah Johnson | Key Person Term + Business Rider | $2,400 | Accepted |

### Seeded Declarations

| Declaration # | Type | Applicant | App # | Status |
|---------------|------|-----------|-------|--------|
| DCL-2026-0001 | HIPAA Authorization | James Wilson | APP-2026-0001 | Accepted |
| DCL-2026-0002 | Replacement Disclosure | David Park | APP-2026-0002 | Sent |
| DCL-2026-0003 | Suitability Statement | Sarah Johnson | APP-2026-0003 | Accepted |
| DCL-2026-0004 | Privacy Notice | James Wilson | APP-2026-0001 | Accepted |
| DCL-2026-0005 | Fraud Warning | Lisa Chen | APP-2026-0005 | Pending |

### Seeded Documents

| Document # | Filename | Category | Applicant | Status |
|------------|----------|----------|-----------|--------|
| DOC-2026-0001 | wilson_drivers_license.pdf | Government ID | James Wilson | Approved |
| DOC-2026-0002 | wilson_w2_2025.pdf | Proof of Income | James Wilson | Approved |
| DOC-2026-0003 | park_medical_records.pdf | Medical Records | David Park | Under Review |
| DOC-2026-0004 | johnson_trust_docs.pdf | Trust Documents | Sarah Johnson | Uploaded |
| DOC-2026-0005 | chen_income_verification.pdf | Financial Statement | Lisa Chen | Pending |
| DOC-2026-0006 | brown_lab_results.pdf | Lab Results | Michael Brown | Rejected |

---

## Step 0 — Capture & qualify a Lead

**Log in as: Agent (USR002)**

Raw inbound starts in the **Leads** module (front of the funnel).

1. Navigate to **Leads** from the sidebar and click **"+ New Lead"**
2. Fill in the basics (name, email, phone, company, source) and **Save**.
   The engine scores the lead automatically — a **Score** and **Grade** (A–F)
   appear on the lead (list column, Kanban badge, detail panel), and the
   **Lead Scoring Insights** panel updates.
3. Work the lead through **New → Contacted → Qualified**. When it's qualified,
   click **Convert to Prospect** (or drag it to the **Converted** lane). This
   creates a **Prospect** record from the lead's data.

> Prefer to start at the Prospect stage? You can also create a Prospect
> directly (Step 1) — the seed already includes prospects.

## Step 1 — Work the Prospect

**Log in as: Agent (USR002)**
Email: `agent@genesislife.local` | Password: `User@123`

A Prospect arrives either from converting a Lead (Step 0) or created directly:

1. Navigate to **Prospects** from the sidebar
2. Click **"+ New Prospect"** (or open the one created by converting a Lead)
3. Fill in the prospect form:
   - **First Name** — Robert
   - **Last Name** — Thompson
   - **Email** — `robert.thompson@email.com`
   - **Phone** — +1-415-555-0101
   - **Company** — Self-employed
   - **Job Title** — Contractor
   - **Lead Source** — Web
   - **Rating** — Hot
   - **Annual Revenue** — 95000
   - **Notes** — "Interested in $500K term life policy. Has two
     young children and recently bought a home."
4. Click **Save**

The prospect is created in the **New** pipeline stage.

> **Tip:** The seed already has Robert Thompson as a prospect
> assigned to Senior Agent (USR001). You can use the existing
> record or create a new one.

---

## Step 2 — Qualify and Convert to Client

Log in as: Agent (USR002) — `agent@genesislife.local` / `User@123`

After initial contact and qualification:

1. Open **Robert Thompson's** prospect record
2. Drag the prospect card to the **Qualified** stage
   (or update the lead status to `qualified`)
3. Once qualified, drag to the **Converted** stage
   (or click **"Convert"** on the record)

What the system does:

- Creates a new **Client** record (CRM Contact) with Robert
  Thompson's details
- Copies fields from the prospect: name, email, phone, DOB, age,
  gender, smoker status, occupation, income, notes
- Creates a linked **Account** record if applicable
- Marks the prospect as `is_converted = true`
- Sets `client_since` to today's date

### Complete the Client Profile

After conversion, open the new Client record and fill in any
missing insurance-specific fields:

- **Date of Birth** — 1987-04-15
- **Gender** — Male
- **SSN** — (masked)
- **Smoker Status** — Never
- **Health Class** — Preferred
- **Occupation** — Contractor
- **Annual Income** — 95,000
- **Marital Status** — Married
- **Dependents** — 2
- **Beneficiary Name** — Linda Thompson
- **Beneficiary Relationship** — Spouse
- **Address** — 123 Main St, San Francisco, CA 94102

---

## Step 3 — Generate a Quote

Log in as: Agent (USR002) — `agent@genesislife.local` / `User@123`

This is the critical step that calculates premium, coverage, and
rider details. An application without quote data has no pricing
context.

1. Navigate to **Quotes** under the **Insurance** section in the sidebar
2. Fill in the Quote Calculator form:

   **Applicant Details:**
   - **First Name** — Robert
   - **Last Name** — Thompson
   - **Date of Birth** — 1987-04-15
   - **Age** — 38
   - **Gender** — Male
   - **Smoker Status** — Never
   - **Health Class** — Preferred

   **Product Details:**
   - **Product Type** — Term Life
   - **Coverage Amount** — $500,000 (or select from presets:
     $100K, $250K, $500K, $1M)
   - **Term Length** — 20 Years
   - **Payment Frequency** — Monthly

   **Riders (optional):**
   - Accidental Death Benefit
   - Waiver of Premium
   - (select any applicable riders)

3. Click **"Calculate Quote"**

What the system does:

- Runs the Calculation Engine with the applicant data
- Returns monthly premium, annual premium, and rider costs
- Persists the result as a **Quote Scenario**
  (ref: `QS-2026-XXXXXX`, valid for 30 days)
- Displays a detailed breakdown:
  - Base premium
  - Rider premiums
  - Total monthly and annual cost
  - Death benefit

### Review the Quote (Mandatory)

- View the full quote summary on screen
- Click **"Quote PDF"** to generate the quote report —
  **this is mandatory before Apply Now is enabled**
- Click **"Email Client"** to send the quote PDF to Robert
- Click **"Compare"** to run side-by-side comparisons with
  different products or coverage amounts

> **Important:** The "Apply Now" button remains disabled until
> the agent has viewed the Quote PDF report. This ensures
> the quote has been reviewed before proceeding to application.

### Save Multiple Scenarios

You can generate and save multiple quote scenarios for the same
client (e.g., $500K vs $1M, Term vs Whole Life) before deciding
which one to proceed with. Each scenario is saved with a unique
reference number.

---

## Step 4 — Create an Application from the Quote

Log in as: Agent (USR002) — `agent@genesislife.local` / `User@123`

Once Robert accepts a quote scenario:

1. On the Quote results page, click **"Apply Now"**
   (or **"Convert to Application"** on a saved scenario)

What the system does:

- Creates a new **Application** record via the runtime system
- Auto-generates application number (e.g., `APP-2026-009`)
- Pre-fills the application with all quote data:
  - Product type, coverage amount, premium
  - Applicant name, DOB, age, gender, smoker status
  - Health class, term years, payment frequency
- Sets status to **Submitted**
- Places it in the **Submitted** pipeline stage
- Links back to the quote scenario
  (scenario status changes to `converted`)
- If a wizard is configured, navigates to the application wizard
  for additional data entry

> **Why this matters:** Creating applications through the Quote
> Engine ensures all pricing, product, and applicant details carry
> forward. An application created without quote data has no premium
> calculation, no rider details, and no rate-source audit trail.

---

## Step 5 — Send Declarations

Log in as: Agent (USR002) — `agent@genesislife.local` / `User@123`

Declarations are legal disclosures (HIPAA, AML, Privacy, etc.) the
client must accept before the application can move forward.

> **Auto-redirect:** After completing Step 4 (Application Wizard), the
> system automatically redirects to the Declarations page with the
> **Send Declarations** modal pre-opened and the application pre-selected.
> You do not need to manually navigate here.

1. The **Send Declarations** modal opens automatically after
   application submission (or navigate to **Declarations** from the
   sidebar and click **"Send Declarations"** manually)
2. Verify the pre-selected application is correct (e.g.,
   `APP-2026-009` — Robert Thompson)
3. Fill in the remaining fields:
   - **Declaration Types** — check all that apply:
     - HIPAA Authorization
     - AML Acknowledgment
     - Suitability Statement
     - Privacy Notice (GLBA)
     - Electronic Delivery Consent
     - Fraud Warning Statement
   - **Delivery Method** — Email
   - **Notes** — "Please review and sign at your earliest
     convenience"
4. Click **Send**

What the system does:

- Creates one declaration record per selected type (6 records)
- Auto-generates declaration numbers: `DCL-2026-001` through
  `DCL-2026-006`
- Auto-populates **Applicant** name from the application's linked
  contact and **Application #** from `app_number`
- Sets each status to **Sent**

### Mark Declarations as Accepted

Once Robert reviews and signs each declaration:

1. Click on a declaration row to open the detail modal
2. Click **"Mark as Accepted"**
3. The system records the acceptance timestamp, signer name,
   IP address, and signature hash
4. The modal stays open and now shows an **"Upload Documents"**
   button — click it to navigate directly to Document Collection
   with the application pre-selected
5. Repeat for all declarations

> **Tip:** You can also reach Upload Documents from
> the green **folder icon** in the table's actions column for any
> accepted declaration, or the **"Upload Docs"** button in the
> right-side activity panel when you click on an accepted
> declaration record.

---

## Step 6 — Upload Documents

Log in as: Agent (USR002) — `agent@genesislife.local` / `User@123`

Carriers require supporting documents before underwriting can begin.

1. Click **"Upload Documents"** on an accepted declaration (from the
   detail modal or the folder icon in the table row), or navigate
   to **Document Collection** from the sidebar
2. Click **"Upload Documents"**
3. Select **Application** — Robert Thompson's application
4. Upload the following documents (one at a time):

   | Category | Example Document |
   |----------|-----------------|
   | Government ID | Driver's license or passport |
   | Proof of Income | Recent tax return or pay stubs |
   | Medical Records | Physical exam results |
   | Bank Statement | For premium payment verification |

5. For each upload: choose the **Document Category**, drag & drop
   the file (PDF, JPG, PNG, TIFF, DOCX — max 25 MB), and click
   **Upload**

What the system does:

- Creates an application document record per upload
- Sets each document status to **Uploaded**
- Documents are now visible to the underwriting team for review

---

## Step 7 — Send to Underwriting

Log in as: Agent (USR002) — `agent@genesislife.local` / `User@123`

> This step only applies when the **Underwriting Workflow** feature
> flag is **ON** (this is the default). When OFF, skip directly to
> Step 10 to issue the policy without underwriting.

1. Navigate to **Applications**
2. Find Robert Thompson's application
3. Click **"View Report"** to generate and review the Application
   Report — **this is mandatory before submission**. The report
   is auto-archived as an application document (HTML + PDF).
4. After viewing the report, the **"Send to UW"** button becomes
   active. Click it to submit for underwriting.
   (Alternatively, drag the application card to the **Under
   Review** stage in the Kanban view.)

> **Important:** The "Send to UW" button remains disabled until
> the agent views the Application Report. This ensures all
> application details have been reviewed before submission. The
> report is automatically saved as a document attachment.

What the system does:

- Archives the Application Report (HTML + PDF) as documents
- Creates an underwriting case (e.g., `UW-2026-009`)
- Links the case to the application
- Updates application status to **Under Review**
- Assigns the case to an underwriter from the UW team

---

## Step 8 — Review the Case

**Log out. Log in as: Underwriter (UW001)**
Email: `underwriter@genesislife.local` | Password: `Underwriter@123`

1. Navigate to **Underwriting** under the **Insurance** section in the sidebar
2. Click the **Eye icon** or click the row for Robert Thompson's
   case (e.g., `UW-2026-009`)
3. This opens the **Case Review** page with full case details

### Case Review Page — Tabs

The review page has five tabs that give the underwriter a complete
picture of the case:

| Tab            | Contents                                              |
| -------------- | ----------------------------------------------------- |
| Case Overview  | Applicant info, case details, medical summary, and    |
|                | readiness dashboard (documents, declarations,         |
|                | requirements status at a glance)                      |
| Application    | Full application data, contact details, and linked    |
|                | quote scenarios                                       |
| Documents      | All uploaded documents with individual and bulk        |
|                | approve/reject/waive actions                          |
| Declarations   | Declaration status, signature details, delivery info  |
| Requirements   | Outstanding requirements with received/waive actions  |

### Review Submitted Documents (Documents Tab)

- View all documents uploaded by Agent (USR002) in Step 6
- Each document shows filename, category, size, upload date, and
  version
- Click **checkmark** to approve or **X** to reject individually
- To reject, provide a rejection reason in the modal
- **Bulk actions:** Select multiple pending documents using
  checkboxes, then choose Approve/Reject/Waive from the bulk
  action dropdown and click Apply
- Click the **download icon** to download any document

### Review Declaration Status (Declarations Tab)

- Verify all required declarations are in **Accepted** or
  **Signed** status
- View signature details (signed by, IP address, timestamps)
- If any are missing or expired, notify the agent

### Add Requirements (Requirements Tab)

If more information is needed before a decision can be made:

1. Click **"Add Requirement"** button
2. Select the requirement type from the dropdown:
   - **Medical Exam** — paramedical exam, blood/urine
   - **Lab Work** — lipid panel, metabolic panel, HbA1c
   - **APS** — attending physician statement from Robert's doctor
   - **Inspection Report** — financial verification for high
     coverage
   - **Medical Records** — hospital summaries
   - **Tele-Interview** — phone interview to verify details
   - **Income Verification** — income proof
   - **Motor Vehicle Report** — MVR
   - **Prescription History Check** — Rx check
   - **Other** — travel itinerary, etc.
3. Add a description and due date
4. Click **Add Requirement**

**Managing requirements:**

- Click **Received** to mark a requirement as fulfilled
- Click **Waive** to waive a requirement

**What happens next:**

- Agent (USR002) is notified about the pending requirement
- Agent (USR002) coordinates with Robert to gather the documents
- Agent (USR002) uploads the documents (repeat Step 6)
- Underwriter (UW001) marks the requirement as **Received** or
  **Waived** once fulfilled

### Making a Decision

The **Approve** and **Decline** buttons are in the top-right
corner of the Case Review page (visible when case is pending or
in-progress). Before deciding, a **Readiness Check** shows
whether all documents, declarations, and requirements are
fulfilled.

> **Escalation:** If the case is complex or exceeds binding
> authority, Underwriter (UW001) can refer the case to Senior
> Underwriter (SRUW001) or Chief Underwriter (UWMGR001).

---

## Step 9 — Make Underwriting Decision

Log in as: Underwriter (UW001) — `underwriter@genesislife.local` / `Underwriter@123`

Once all documents are approved and requirements are fulfilled:

1. Open Robert Thompson's underwriting case
2. Click **"Make Decision"**
3. Fill in:
   - **Decision** — Approved
   - **Risk Class** — Preferred
   - **Decision Notes** — "All documents verified. Non-smoker,
     BMI within range, no adverse MIB findings. Preferred class
     approved at quoted rates."
4. Click **Submit Decision**

**If Approved:**

- Underwriting case status changes to **Approved**
- Application status changes to **Approved**
- Application moves to the **Approved** pipeline stage
- Agent (USR002) is notified

**If Declined:**

- Both the case and application are marked **Declined**
- Agent (USR002) is notified; no policy can be issued
- Post-decline options: counter-offer, reconsideration, or
  re-application after 6-12 months

### Decision Authority by Role

| Role | Can Decide On |
|------|---------------|
| Underwriter (UW001) | Own assigned cases only |
| Senior Underwriter (SRUW001) | All cases |
| Chief Underwriter (UWMGR001) | All cases, including exceptions and reinsurance referrals |

---

## Step 10 — Issue Policy

**Log out. Log in as: Agent (USR002)**
Email: `agent@genesislife.local` | Password: `User@123`

1. Navigate to **Applications**
2. Find Robert Thompson's application (status: **Approved**)
3. Click **"Issue Policy"**

What the system does:

- Creates an insurance policy (e.g., `POL-2026-00009`)
- Sets policy status to **Active**
- Records effective date, expiry date, and renewal due date
- Coverage amount, premium, and payment frequency from the
  original quote carry through
- Updates application status to **Issued**
- Auto-creates a **Commission Entry** for Agent (USR002)
  with status **Pending**

---

## After Policy Issuance

Log in as: Agent (USR002) or Sales Manager (MGR001)

| Where to look | What you will see |
|----------------|-------------------|
| **Policies** page | Robert Thompson's policy with status **Active**, linked to the application and client record |
| **Commissions** page | Commission entry for Agent (USR002) — status **Pending**, paid on reconciliation |
| **Applications** page | Robert Thompson's application with status **Issued** in the final pipeline stage |
| **Clients** page | Robert Thompson's client record with the policy linked |

### Commission Details

- First-year commission (FYC): typically 25%-55% of first-year
  premium
- Commission status lifecycle: Pending → Paid
  (or Clawed Back if the policy lapses within 12-24 months)
- Sales Manager (MGR001) can view commissions for their entire
  team

---

## Quick Reference — Auto-Generated Numbers

| Entity | Format | Example |
|--------|--------|---------|
| Quote Scenario | `QS-YYYY-NNNNNN` | QS-2026-123456 |
| Application | `APP-YYYY-NNN` | APP-2026-001 |
| Declaration | `DCL-YYYY-NNN` | DCL-2026-001 |
| UW Case | `UW-YYYY-NNN` | UW-2026-001 |
| Policy | `POL-YYYY-NNNNN` | POL-2026-00001 |
| Claim | `CLM-YYYY-NNN` | CLM-2026-001 |

---

## Quick Reference — Pipeline Stages

| Entity | Stages (in order) |
|--------|------------------|
| Lead | New → Contacted → Qualified → Converted |
| Prospect | New → Contacted → Qualified → Unqualified → Converted |
| Quote | Draft → Presented → Accepted → Declined → Expired |
| Application | Submitted → Under Review → Pending Medical → Approved → Declined → Issued |
| Declaration | Pending → Sent → Viewed → Accepted → Declined → Expired |
| Document | Required → Pending → Uploaded → Under Review → Approved → Rejected → Waived |
| UW Case | Pending → In Progress → Approved → Declined → Referred |

---

## Quick Reference — Status Flow

```text
PROSPECT        CLIENT         QUOTE           APPLICATION       UW CASE          POLICY
────────        ──────         ─────           ───────────       ───────          ──────
New                            Draft           
   |                              |
Contacted       (created by      |
   |             conversion)  Presented
Qualified ──>  Client Record     |
   |           completed      Accepted
Converted                        |
                                 └──> Submitted           Pending
                                         |                   |
                                      Under Review        In Progress
                                         |                   |
                                      Pending Medical     (requirements)
                                         |                   |
                                      Approved  <─────    Approved
                                         |
                                      Issued    ─────>    Active
                                                             |
                                                          Commission (Pending)
```

---

## End-to-End at a Glance

Preceded by **Step 0** — capture a **Lead** in the Leads module (auto-scored),
then **Convert to Prospect**. The glance below picks up from the Prospect stage.

```text
 Agent (USR002)    Agent (USR002)    Agent (USR002)    Agent (USR002)    Agent (USR002)   Agent (USR002)    Agent (USR002)     UW (UW001)      Agent (USR002)
┌─────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌─────────────┐  ┌─────────────┐  ┌──────────────┐  ┌─────────────┐  ┌──────────────┐
│ Add Prospect│─>│Convert to    │─>│Generate Quote│─>│Create App    │─>│   Send      │─>│  Upload     │─>│ Send to UW   │─>│  Review &   │─>│ Issue Policy  │
│  Robert T.  │  │   Client     │  │  $500K Term  │  │ from Quote   │  │Declarations │  │  Documents  │  │              │  │  Approve    │  │              │
└─────────────┘  └──────────────┘  └──────────────┘  └──────────────┘  └─────────────┘  └─────────────┘  └──────────────┘  └─────────────┘  └──────────────┘
    Step 1           Step 2            Step 3            Step 4           Step 5           Step 6            Step 7          Step 8-9          Step 10
```
