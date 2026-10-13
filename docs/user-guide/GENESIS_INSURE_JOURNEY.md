# Genesis Insure — Prospect to Policy Buyer Journey

This document traces the complete end-to-end journey of a raw prospect becoming
an insurance policy holder inside Genesis CRM. Each stage maps to concrete
backend services, database models, frontend pages, and API routes.

---

## Table of Contents

1. [Journey Overview](#journey-overview)
2. [Stage 1 — Lead Capture & Qualification](#stage-1--lead-capture--qualification)
3. [Stage 2 — Quote Generation](#stage-2--quote-generation)
4. [Stage 3 — Application Submission](#stage-3--application-submission)
   - [Stage 3a — Declaration Acceptance](#stage-3a--declaration-acceptance)
   - [Stage 3b — Document Collection](#stage-3b--document-collection)
5. [Stage 4 — Underwriting Review](#stage-4--underwriting-review)
6. [Stage 5 — Policy Issuance](#stage-5--policy-issuance)
7. [Stage 6 — Policy Lifecycle Management](#stage-6--policy-lifecycle-management)
8. [Stage 7 — Claims & Commissions](#stage-7--claims--commissions-post-sale)
9. [Data Flow Diagram](#data-flow-diagram)
10. [Cross-Cutting Concerns](#cross-cutting-concerns)

---

## Journey Overview

Genesis CRM implements a **7-stage pipeline** that takes a raw prospect through
to a paying insurance policyholder:

```text
                          MODULES (category: crm)          INSURANCE (category: insurance)
                          ───────────────────────          ─────────────────────────────────

Lead ──[Convert to Prospect]──► Prospect ──[Convert]──► Client ──[Get Quote]──► Quote Engine
                                                     │
                                               [Apply Now]
                                                     │
                                                     ▼
                                          5-Step Wizard ◄─── Life Insurance
                                          (pre-filled)       Application
                                          1. Personal Info
                                          2. Health & Lifestyle
                                          3. Coverage Selection
                                          4. Beneficiary & Financial
                                          5. Review & Submit
                                                     │
                                            [Submit Application]
                                                     │
                              ┌───────────────┐      │     ┌───────────────────┐
                              │ MODULES >      │◄─────┴────►│ INSURANCE >       │
                              │ Applications   │  bridge    │ Applications      │
                              │ (form data)    │  syncs     │ (process actions) │
                              └───────────────┘            └────────┬──────────┘
                                                                    │
                                                          [Send to UW]
                                                                    ▼
                                                          INSURANCE > Underwriting
                                                          [Approve / Decline]
                                                                    │
                                                          [Issue Policy]
                                                                    ▼
                                                          INSURANCE > Policies
                                                          [File Claim]  │
                                                              │     auto-creates
                                                              ▼         ▼
                                                     INSURANCE >   INSURANCE >
                                                      Claims       Commissions
```

Each arrow represents a **one-click action button** in the UI that carries
data forward to the next module automatically. The **insurance domain
bridge** keeps CRM module records and insurance domain tables in sync.

### Inter-Module Action Buttons

| From | Action | To | Data Carried Forward |
| ---- | ------ | -- | -------------------- |
| Lead | **Convert to Prospect** (side panel) | Prospect | Name, email, phone, company, job title, source, rating, industry |
| Prospect | **Convert** (side panel) | Client | Name, email, phone, all EAV fields (DOB, gender, smoker, income, etc.) |
| Client | **Get Quote** (side panel) | Quote Engine | Age, gender, smoker status, health class, coverage interest, client name/email |
| Quote Engine | **Apply Now** (action bar) | 5-Step Wizard | Creates CRM record pre-filled with quote data (name, gender, smoker, coverage, product, term), then opens the Life Insurance Application wizard for full data capture |
| Wizard | **Submit Application** | INSURANCE > Declarations | Saves all wizard data to CRM record; insurance domain bridge auto-creates `insurance_applications` row; redirects to **Send Declarations** with the application pre-selected so the agent can send required legal disclosures immediately |
| Application | **Send to UW** (table row) | Underwriting | Full application data, medical info |
| Application | **In Underwriting →** (table row) | Underwriting page | Navigates to underwriting for decision |
| Application | **Issue Policy** (table row) | Policy | Coverage, premium, carrier, contact, agent + auto-creates commission |
| Policy | **File Claim** (table row + detail) | Claims | Policy ID, coverage amount pre-filled in create modal |
| Policy Issuance | *Auto-created* | Commission | Agent, premium, 45% default rate |

### Two-Surface Architecture

Insurance records exist in **two synchronized surfaces**:

| Surface | Access Path | Purpose |
| ------- | ----------- | ------- |
| **CRM Modules** | Sidebar > MODULES > (Applications, Policies, etc.) | Agent-facing: data entry via metadata-driven forms and the 5-step wizard |
| **Insurance Operations** | Sidebar > INSURANCE > (Applications, Policies, etc.) | Operations-facing: status tracking, action buttons (Send to UW, Issue Policy, File Claim) |

The **insurance domain bridge** (`RecordService.#syncInsuranceDomain`)
auto-syncs data between these surfaces on every create/update. Agents
fill forms in the CRM modules; operations teams process them in the
Insurance section.
| Policy Issuance | *Auto-created* | Commission | Agent, premium, 45% default rate |

### Navigation

The insurance module is accessed via the sidebar under the **Insurance** section
(`frontend/src/components/layout/Sidebar.jsx`, lines 183-189):

| Menu Item       | Route                       | Page Component            |
| --------------- | --------------------------- | ------------------------- |
| Quote Engine    | `/insurance/quotes`         | InsuranceQuotePage         |
| Applications    | `/insurance/applications`   | ApplicationsPage           |
| Declarations    | `/insurance/declarations`   | DeclarationPage            |
| Documents       | `/insurance/documents`      | DocumentCollectionPage     |
| Policies        | `/insurance/policies`       | PoliciesPage               |
| Claims          | `/insurance/claims`         | ClaimsPage                 |
| Underwriting    | `/insurance/underwriting`   | UnderwritingPage           |
| Commissions     | `/insurance/commissions`    | CommissionsPage            |

All routes are defined in `frontend/src/App.jsx` (lines 88-94) and require
authentication.

---

## Stage 1 — Lead Capture & Qualification

**Where it lives:** CRM core (not insurance-specific)

The front of the funnel is a three-stage progression: **Lead → Prospect → Client.**

- A **Lead** (`crm_lead_intake`, UI module "Leads") is raw, unqualified inbound —
  manual entry, CSV import, or web form. It carries basic profile data
  (`first_name`, `last_name`, `email`, `phone`, `company`, `lead_source`) and a
  `lead_status` of `new → contacted → qualified → converted`.
- Qualifying a Lead **converts it into a Prospect** (`crm_leads`, UI module
  "Prospects") — the working sales record.
- A Prospect then **converts into a Client** (contact/account/opportunity).

> **Why Lead and Prospect are separate.** This mirrors the top-5 CRM providers:
> Salesforce, Zoho, Microsoft Dynamics 365 and Pipedrive all keep a raw *Lead*
> distinct from the qualified working entity it converts into; "Prospect" is the
> qualified lead being actively worked. (HubSpot models the same idea as lifecycle
> *stages* on one Contact object.) Keeping Leads in their own module means
> cold/bulk-imported inbound never clutters the working prospect pipeline.

### Lead → Prospect Conversion (UI: "Convert to Prospect" Button)

**Frontend:** `ModulePage.jsx` — a **Lead** record's side panel shows a blue
**Convert to Prospect** button. Clicking it confirms, then calls
`POST /api/runtime/records/:id/convert-to-prospect`. A Lead is also converted
automatically when dragged to the **Converted** stage on the Leads Kanban.

**Backend:** `crm.service.js` — `convertLeadToProspect()` creates a `crm_leads`
(Prospect) record + anchor `record` from the lead's fields, marks the lead
`is_converted = true` / `lead_status = 'converted'`, and links it via
`converted_prospect_id`.

### Prospect → Client Conversion (UI: "Convert" Button)

**Frontend:** `ModulePage.jsx` — side panel header shows a blue **Convert**
button when viewing a **Prospect** record. Clicking it opens a confirmation
modal, then calls `POST /api/runtime/records/:id/convert-lead`.

> **Required-field gate:** a Prospect cannot convert to a Client until **all of
> its required fields are filled** (the required-field enforcement offered by
> Salesforce, Zoho, HubSpot, Dynamics 365 and Pipedrive). Both the **Convert**
> button and dragging the card to the **Converted** lane are blocked (HTTP 400,
> `missing_fields`) until the record is complete.

**Backend:** `backend/src/routes/runtime/index.js` — the `convert-lead`
endpoint handles two scenarios:

1. If a `crm_leads` row already exists for this record, converts it directly
2. If only EAV data exists (user-created prospect), auto-creates a
   `crm_leads` row from the EAV fields first, then converts

The conversion itself (`crm.service.js` — `convertLead()`) runs in a
**single Prisma `$transaction`** and atomically:

1. Marks the lead `is_converted = true`, `lead_status = 'converted'`
2. Creates a **`crm_accounts`** record (the company or household)
3. Creates a **`crm_contacts`** record (the person — copies name, email,
   phone, title from the lead)
4. Optionally creates a **`crm_opportunities`** record (the sales deal,
   stage: `prospecting`, probability: 10%)
5. Writes a **`crm_lead_conversions`** audit row linking all four entities

**EAV Data Copy:** After the transaction, all `record_field_values` from
the prospect record are bulk-copied (`createMany`) to both the new contact
and account records. This ensures insurance-specific fields (date of birth,
gender, smoker status, occupation, annual income, coverage interest, etc.)
carry over to the Client module without manual re-entry.

The `contact_id` produced here is the identity that threads through every
subsequent insurance stage — applications, policies, and claims all
reference this contact.

### Key Guards

- Duplicate conversion prevented: `if (lead.is_converted) throw Error`
- Account reuse supported: existing `account_id` can be passed instead of
  creating a new one

---

## Stage 2 — Quote Generation

**Frontend:** `frontend/src/pages/runtime/InsuranceQuotePage.jsx`
**Backend:** `backend/src/services/calculation-engine.service.js` —
`calculateQuote()` (lines 292-416)

The agent selects a product and fills in applicant details via a react-hook-form
driven interface.

### Inputs

| Input            | Values                                                                                                    |
| ---------------- | --------------------------------------------------------------------------------------------------------- |
| Product type     | `term_life`, `whole_life`, `universal_life`, `variable_life`, `indexed_universal_life`, `final_expense`    |
| Coverage amount  | $2K – $10M (product-dependent min/max)                                                                    |
| Term length      | 10 / 15 / 20 / 25 / 30 years (term life only)                                                            |
| Applicant        | age (18-85), gender, smoker_status (`never`/`former`/`current`), health_class                              |
| Riders           | Up to 9 add-ons: WP, ADB, CTR, GIO, ROP, CIA, LTC, term conversion, spouse                               |
| Payment frequency| `monthly`, `quarterly`, `semi_annual`, `annual`                                                           |

### How the Premium is Calculated

`CalculationEngineService.calculateQuote()` follows a simplified
equivalence-principle actuarial approach:

```text
1. For each year in the horizon (term length or to endowment age 100):
   a. Look up base mortality rate from 2017 CSO table (ages 18-85)
      - Ages > 85: exponential extrapolation from last two table entries
      - Fractional ages: linear interpolation
   b. Apply multipliers: gender factor x smoker factor x health class factor
   c. Compute survival probability to year t
   d. PV(benefits) += coverage x mortality x survival x discount factor
   e. PV(annuity)  += survival x discount factor

2. Net annual premium = PV(benefits) / PV(annuity)
   - Permanent products: +35% reserve loading
   - Final expense: +55% simplified underwriting surcharge

3. Gross annual premium = net x (1 + 25% expense loading + 8% profit margin)
                        + annual policy fee ($60-$150 by product type)

4. Rider premiums added:
   - Rate-based: (coverage / 1000) x rate_per_1000 x age_factor
   - Flat-fee riders: fixed annual amount (e.g. $72 child term rider)

5. Frequency breakdown:
   - Annual:      1.000x
   - Semi-annual: 0.520x (slight surcharge)
   - Quarterly:   0.265x
   - Monthly:     0.090x
```

### Quote Response

The backend returns a comprehensive quote object including:

- `quote_reference` — unique ID (e.g. `LI-XXXXXX-YYYYYYYY`), valid 30 days
- `product_details` — name, type, term, convertibility, renewability
- `applicant_summary` — age, gender, smoker, health class, underwriting class
- `coverage` — face value and death benefit
- `premium` — base, riders, and total broken down by all four frequencies
- `cash_value_projections` — milestone years 5/10/15/20/25/30 (permanent only)
- `surrender_value_projections` — with surrender charge schedule

Quotes are cached in a bounded in-memory LRU store (max 1,000 entries) for later
illustration retrieval.

### Entering the Quote Engine (UI: "Get Quote" Button)

When viewing a Client record in the side panel, a blue **Get Quote** button
appears. Clicking it navigates to `/insurance/quotes` with URL parameters
carrying the client's data: `age`, `gender`, `smokerStatus`, `healthClass`,
`coverageAmount`, `clientName`, `clientEmail`, and `contactRecordId`.

The `InsuranceQuotePage` reads these URL parameters on mount via
`useSearchParams` and pre-fills the form using `setValue()`. This
eliminates manual data re-entry for known clients.

### Agent Actions from the Quote Page

| Action               | What Happens                                                                              |
| -------------------- | ----------------------------------------------------------------------------------------- |
| **Generate Quote PDF** | `renderQuoteSummary()` renders HTML via template engine → inline PDFViewer display       |
| **Generate Illustration** | `renderIllustration()` produces year-by-year table (premiums, cash value, death benefit) |
| **Email to Client**  | Renders quote HTML → Chrome headless converts to PDF → sent via `POST /email/send-with-pdf` |
| **Compare Products** | `compareQuotes()` generates side-by-side comparison of up to 6 product quotes             |
| **Apply Now**        | Creates a CRM record in **MODULES > Applications** pre-filled with quote data, then opens the **Life Insurance Application** wizard (5 steps: Personal → Health → Coverage → Beneficiary → Review). Wizard fields are pre-populated from the quote (name, email, gender, smoker status, health class, product type, coverage amount, term length). On submit, the wizard saves all data and the **insurance domain bridge** auto-creates the `insurance_applications` row. User is redirected to **INSURANCE > Declarations** with the Send Declaration modal auto-opened and the application pre-selected. |

### Document Generation Pipeline

```text
Template Engine (HTML)  →  Chrome Headless (PDF)  →  Email Service (Attachment)
template-engine.service.js   html-to-pdf.js            email-send.service.js
```

The template engine (`backend/src/services/template-engine.service.js`) provides
five built-in document templates: Quote Summary, Policy Illustration, Application
Form, Comparison Report, and Claims Summary. All values pass through
`escapeHtml()` to prevent XSS in rendered documents.

---

## Stage 3 — Application Submission

### Two-Surface Model

Applications exist in **two places** that stay synchronized:

| Surface | Path | Purpose |
| ------- | ---- | ------- |
| **CRM Module** | MODULES > Applications | Agent-facing form — captures full applicant details (personal, medical, beneficiary, coverage preferences). Editable via the metadata-driven form builder. |
| **Insurance Domain** | INSURANCE > Applications | Operations-facing pipeline — tracks processing status, links to underwriting/policy. Shows application number, status badges, and action buttons. |

### How They Stay in Sync: Insurance Domain Bridge

When a CRM Application record is created or updated (via `POST/PUT
/api/runtime/records`), the `RecordService.#syncInsuranceDomain()` bridge
automatically upserts the corresponding `insurance_applications` row:

```text
CRM Record (EAV)                    Insurance Domain
+-------------------+  bridge       +-------------------+
| record_field_values| -----------> | insurance_         |
| product_type      |  #syncInsur-  | applications      |
| coverage_amount   |  anceApplic-  | app_number        |
| premium           |  ation()      | product_type      |
| applicant_name    |               | coverage_amount   |
| status            |               | premium_amount    |
| wiz_* fields      |               | status            |
+-------------------+               +-------------------+
```

The bridge:

- **On create**: generates an `APP-YYYY-NNNNNN` number and creates the
  `insurance_applications` row linked via `record_id`
- **Contact resolution (v4.0.4)**: finds or creates a `CrmContact` from
  the applicant's name/email (`wiz_first_name`, `wiz_last_name`,
  `wiz_email`) and links it via `contact_id`. If a matching contact
  exists (by email or name), it is reused. Date of birth is synced to
  the contact's `birthdate` field.
- **On update**: updates only non-empty fields (preserves data entered
  directly in the insurance domain)
- **Handles field name mapping**: `premium` (CRM) → `premium_amount`
  (domain), `wiz_smoker_status` → `is_smoker`, `wiz_health_class` →
  `health_class`, `wiz_term_years` → `term_years`,
  `wiz_payment_frequency` → `payment_frequency`, etc.

This means the agent fills in the full application in the CRM module
form, and the operations team sees it appear in the Insurance pipeline
automatically — no manual re-entry needed.

### Application Data Model

**Frontend:** `frontend/src/pages/runtime/ApplicationsPage.jsx`
**Backend:** `backend/src/services/insurance-domain.service.js` —
`createApplication()` (lines 392-423)

The insurance domain table stores:

```text
insurance_applications
├── app_number         — APP-2026-000001 (unique per tenant)
├── contact_id         → crm_contacts (auto-resolved from applicant name/email in v4.0.4)
├── account_id         → crm_accounts (their household/company)
├── agent_id           → employees (the writing agent)
├── carrier_id         → insurance_carriers
├── carrier_product_id → carrier_products
├── product_type, product_name
├── coverage_amount, premium_amount
├── Applicant data: age, gender, date_of_birth, is_smoker, health_class,
│                   height_in, weight_lbs
├── Policy details: term_years, payment_frequency
├── notes
└── status: 'submitted' (initial)
```

### Application Status Pipeline

The frontend displays a pipeline bar showing progression through:

```text
submitted → under_review → pending_medical → approved → declined / withdrawn → issued
```

### Sequence Number Generation

All insurance sequence numbers use the `PREFIX-YYYY-NNNNNN` format. The
`#nextSeq()` private method (`insurance-domain.service.js`, lines 33-46):

1. Queries for the latest matching record ordered by the field value descending
2. Parses the trailing digits via regex (`/-(\d+)$/`)
3. Increments by 1 and zero-pads to 6 digits

This approach avoids the bug of using `MAX(id)` which would collide across
models.

### Stage 3a — Declaration Acceptance

**Frontend:** `frontend/src/pages/runtime/DeclarationPage.jsx`
**Route:** `/insurance/declarations`
**Metadata Object:** `declaration` (module: `declarations`)

Before an application can proceed to underwriting, the client must review and
accept legally required declarations and disclosures. This is a standard step
across major insurance carriers and CRM providers (Applied Epic, Vertafore,
EZLynx, Salesforce Financial Services Cloud).

This screen is **metadata-driven** — all field definitions, status options,
declaration type options, delivery method options, and table columns are loaded
from the configured `declaration` object at runtime via
`runtimeService.resolveObject('declaration')` and `runtimeService.getObject()`.
Admins can add/remove/reorder fields and options via the Builder without code
changes.

#### Declaration Types

The `declaration_type` field is seeded with **12 industry-standard options**:

| Declaration | Regulatory Basis |
| ----------- | ---------------- |
| HIPAA Authorization | Health Insurance Portability and Accountability Act |
| AML Acknowledgment | Bank Secrecy Act / USA PATRIOT Act |
| Replacement Policy Disclosure | NAIC Model Regulation 613 |
| Suitability Statement | NAIC Suitability in Annuity Transactions Model Regulation |
| Privacy Notice (GLBA) | Gramm-Leach-Bliley Act |
| Producer/Agent Disclosure | State insurance department requirements |
| Electronic Delivery Consent | UETA / E-SIGN Act |
| Fraud Warning Statement | State-specific insurance fraud statutes |
| Statement of Good Health | Policy delivery requirements |
| Beneficiary Designation | Beneficiary confirmation acknowledgment |
| Premium Payment Authorization | EFT/ACH authorization |
| MIB Authorization | Medical Information Bureau inquiry consent |

#### Auto-Numbering

Each declaration is automatically assigned a unique number in the format
`DCL-YYYY-NNN` (e.g., `DCL-2026-001`) when created. This is handled by the
`RecordService` auto-number engine, which reads the `auto_number` config from
the `declaration_number` UiField metadata and generates the next sequential
value per tenant per year.

#### Declaration Workflow

```text
Agent sends declarations  →  Client receives  →  Client views  →  Client accepts/declines
     (sent)                    (sent)             (viewed)          (accepted/declined)
```

**Delivery methods:** Email, SMS, Client Portal, or In-Person.

**E-Signature capture:** When a client accepts a declaration, the system records
the signer name, timestamp, IP address, user agent, and a signature hash for
audit purposes.

#### Key Features

- **Bulk send:** Select multiple declaration types and send to a client in one
  action via the Send Declarations modal
- **Status tracking:** Pipeline view with statuses — Pending, Sent, Viewed,
  Accepted, Declined, Expired
- **Stats dashboard:** Acceptance rate, total sent, accepted, pending, declined
- **Resend capability:** Resend expired or pending declarations
- **Activity timeline:** Full audit trail of sent, viewed, and accepted events
- **Detail modal:** Declaration text preview, e-signature info, and action buttons

#### API Endpoints

| Method | Route | Description |
|--------|-------|-------------|
| `GET` | `/insurance/declarations` | List declarations (filters: `status`, `declaration_type`, `search`) |
| `GET` | `/insurance/declarations/:id` | Get single declaration |
| `POST` | `/insurance/declarations` | Send declarations (creates one record per type with auto-number) |
| `PATCH` | `/insurance/declarations/:id` | Update declaration (status, accepted_at, etc.) |
| `POST` | `/insurance/declarations/:id/resend` | Resend a declaration (resets to `sent` status) |

Declarations are stored as EAV records via `RecordService`. The `POST`
endpoint accepts `{ application_id, declaration_types: [...],
delivery_method, notes }` and creates one record per declaration type,
each receiving an auto-generated `DCL-YYYY-NNN` number.

#### Auto-Population of Fields

When declarations are created, the backend automatically resolves and
populates fields from the linked insurance application:

| Field | Source | How |
|-------|--------|-----|
| `declaration_number` | Auto-generated | `RecordService.#generateAutoNumbers()` reads `auto_number` config from field metadata and generates `DCL-YYYY-NNN` |
| `app_number` | `InsuranceApplication.app_number` | Looked up via `application_id` from the request body |
| `applicant_name` | `InsuranceApplication.contact` | Resolved from the linked `CrmContact` (first + last name) |

The **Send Declarations modal** (`DeclarationPage.jsx`) accepts a
`?record_id=` query parameter from the wizard redirect. This is matched
against `InsuranceApplication.record_id` to auto-select the application
in the dropdown and auto-open the modal.

### Stage 3b — Document Collection

**Frontend:** `frontend/src/pages/runtime/DocumentCollectionPage.jsx`
**Route:** `/insurance/documents`
**Metadata Object:** `application_document` (module: `document_collection`)

Alongside declarations, the carrier requires supporting documents before the
application can be submitted for underwriting. The Document Collection screen
manages the capture, upload, review, and approval of these documents.

This screen is **fully metadata-driven** (v4.0.5) — all field definitions,
status options, document category options, and table columns are loaded from
the configured `application_document` object at runtime. Document records
are stored in the EAV system via `runtimeService.createRecord()` and
`getRecords()`, with auto-number generation for `document_number` (e.g.,
`DOC-2026-001`). Binary file storage uses a dedicated endpoint while
metadata follows the standard runtime records pattern. Admins can customize
categories, statuses, and fields via the Builder without code changes.

#### Business Process Integration (v4.0.5 → v4.0.7)

After completing the 5-step Application Wizard (Step 5: Review & Submit),
users are automatically redirected to **Send Declarations** (Stage 3a)
with the application pre-selected in the modal. This ensures legal
disclosures are sent before document collection begins. The full
post-submission flow is:

```text
Prospects → Quotes → Applications (Wizard) → Declarations → Document Collection → Underwriting → Policy
```

Documents can be accessed in five ways:

1. **From the right-side activity panel** — click on an accepted
   declaration record and use the **"Upload Docs"** button in the
   panel header (same pattern as Convert, Get Quote, etc.)
2. **From the declarations table** — click the green **folder icon**
   in the actions column of any accepted declaration row
3. **From the declaration detail modal** — after clicking
   **"Mark as Accepted"**, the modal stays open and shows an
   **"Upload Documents"** button
4. **From the Applications page** — click the folder icon on an
   application row
5. **From the sidebar** — navigate to **Document Collection** under
   the Insurance section

All paths navigate to the Document Collection page with the
application pre-filtered via `app_number`.

#### Document Categories

Genesis supports **14 standard document categories** based on ACORD standards:

| Category | Required | Description |
| -------- | -------- | ----------- |
| Government-Issued Photo ID | Yes | Valid passport, driver's license, or state-issued ID |
| Proof of Income | Yes | Pay stubs, W-2, tax returns, or employer verification |
| Signed Application (ACORD 121) | Yes | Completed and signed insurance application form |
| Beneficiary Designation Form | Yes | Completed beneficiary designation with signatures |
| Payment Authorization / EFT | Yes | EFT/ACH authorization or voided check |
| Medical Records / APS | No | Attending Physician Statement or medical exam reports |
| Existing Policy Documentation | No | In-force illustrations for replacement evaluation |
| Trust Documents | No | Trust agreement or entity ownership documentation |
| Power of Attorney | No | Notarized POA for authorized agent signing |
| Lab / Paramedical Results | No | Blood work, urinalysis from approved vendor |
| Financial Justification | No | Net worth statement for coverage justification |
| Motor Vehicle Report (MVR) | No | Driving history for motor risk applicants |
| Inspection Report | No | Property or personal inspection as required |
| Other Supporting Document | No | Additional documentation per underwriting request |

#### Document Workflow

```text
Upload document  →  Under Review  →  Approved / Rejected
                                         ↓ (if rejected)
                                    Re-upload with feedback
```

#### Storage & Tracking (v4.0.6)

Documents are stored in a structured folder hierarchy following
ACORD/NAIC compliance conventions:

```text
uploads/documents/{tenant_id}/{year}/{app_number}/{category}/{filename}
```

Example:

```text
uploads/documents/1/2026/APP-2026-000001/government_id/passport_1719832400.pdf
uploads/documents/1/2026/APP-2026-000001/proof_of_income/W2_2025_1719832401.pdf
uploads/documents/1/2026/APP-2026-000001/medical_records/APS_report_1719832402.pdf
```

Each document receives:

- **`document_ref`** — unique reference (e.g., `DOC-APP-2026-000001-001`)
- **`file_hash`** (SHA-256) — integrity verification and duplicate detection
- **`version`** — tracks re-uploads after rejection
- **`original_filename`** / **`stored_filename`** — user's original name
  preserved for downloads, sanitised name used on disk

#### Document Collection Features

- **Drag-and-drop upload:** Multi-file upload with 25 MB limit per file
  (PDF, JPG, PNG, TIFF, DOCX supported)
- **Duplicate detection:** SHA-256 hash comparison rejects duplicate files
  within the same application automatically
- **Document Readiness Overview:** Per-application progress bars showing how
  many required documents have been approved vs. total required
- **Review workflow:** Approve or reject documents; rejection includes a
  mandatory reason that notifies the applicant to re-upload
- **Detail modal:** File preview (images), download, document metadata, and
  review actions
- **Stats dashboard:** Total documents, approved, pending review, rejected

#### Relationship to Other Stages

The Declaration Acceptance and Document Collection screens sit between
Application Submission (Stage 3) and Underwriting Review (Stage 4). Together
they ensure the application package is complete before it enters underwriting:

```text
Stage 3: Application Submitted
     │
     ├── Stage 3a: Declarations accepted (HIPAA, AML, Suitability, etc.)
     ├── Stage 3b: Documents collected and approved (ID, income, medical, etc.)
     │
     ▼
Stage 4: Send to Underwriting (application package is complete)
```

---

## Stage 4 — Underwriting Review

> **Feature toggle:** This entire stage is controlled by the
> `underwriting_workflow` feature flag. When OFF, applications
> skip underwriting and go directly to policy issuance
> (Stage 5). See
> [UNDERWRITING_FLOW.md §11](UNDERWRITING_FLOW.md#11-underwriting-feature-toggle-onoff)
> for details.

**Frontend:** `frontend/src/pages/runtime/UnderwritingPage.jsx`
**Backend:** `backend/src/services/insurance-domain.service.js` —
`convertToUnderwriting()` (lines 441-480)

**Performed by:** Dedicated underwriting team only
(`uw_manager`, `senior_underwriter`, `underwriter`).
Agent roles (`manager`, `user`) cannot make UW decisions.
See
[UNDERWRITING_FLOW.md §12](UNDERWRITING_FLOW.md#12-underwriter-roles-and-access-control)
for the full access matrix.

### Converting to Underwriting

When the agent clicks "Convert to Underwriting" on an application, a
`$transaction` atomically:

1. **Creates** an `underwriting_cases` record (`UW-2026-000001`) with status
   `pending`
2. **Stores** medical data: BMI, blood pressure, cholesterol, conditions,
   medications, family history
3. **Updates** the application status to `under_review`

Guards:

- Application must be in `submitted` or `under_review` status (422 otherwise)
- Only one UW case per application (409 Conflict if duplicate attempted)

### Requirements Tracking

The underwriter can add `underwriting_requirements` to request documentation:

| Requirement Type       | Status Flow                          |
| ---------------------- | ------------------------------------ |
| `medical_exam`         | pending → received                   |
| `lab_work`             | pending → received                   |
| `attending_physician`  | pending → received / waived          |
| `records`              | pending → received                   |
| `inspection`           | pending → received / not_required    |

Each requirement tracks `due_date`, `received_at`, and `notes`.

### Underwriting Decision

**Backend:** `updateUnderwritingCase()` (lines 605-637)

The underwriter clicks Approve or Decline in the decision modal. The backend runs
in a `$transaction`:

1. Updates `underwriting_cases`:
   - `status` → `approved` / `declined` / `referred`
   - `decided_at` → current timestamp
   - `risk_class` → one of: `preferred_plus`, `preferred`, `standard`,
     `substandard`, `rated`
   - `decision_notes` — free text
2. **Propagates** the decision to the application:
   - Approved → `insurance_applications.status = 'approved'`
   - Declined → `insurance_applications.status = 'declined'`

The transaction ensures both writes succeed or neither does, preventing
inconsistent states between the UW case and its application.

---

## Stage 5 — Policy Issuance

**Backend:** `backend/src/services/insurance-domain.service.js` —
`issuePolicy()` (lines 484-554)

This is the critical conversion moment — the prospect becomes a policyholder. A
single `$transaction` performs **four atomic writes**:

```text
issuePolicy($transaction) {

  1. CREATE insurance_policies
     ├── policy_number: POL-2026-000001
     ├── status: 'active'
     ├── effective_date: today (or specified date)
     ├── carrier_id, carrier_product_id (from application or override)
     ├── contact_id, account_id, agent_id (from application)
     ├── product_type, product_name
     ├── coverage_amount, premium_amount, premium_frequency
     └── death_benefit = coverage_amount (default)

  2. CREATE insurance_policy_status_history
     ├── from_status: null
     ├── to_status: 'active'
     └── reason: "Issued from application APP-2026-000001"

  3. UPDATE insurance_applications
     └── status → 'issued'

  4. CREATE commission_entries (if agent_id is set)
     ├── agent_id: the writing agent
     ├── source_premium: application.premium_amount
     ├── commission_rate: 45% (default)
     ├── commission_amount: premium x 45%
     ├── commission_period: "2026-04" (current month)
     └── status: 'pending'
}
```

### Guards

- Application must be in `approved` status (422 if not)
- No policy already issued for this application (409 Conflict)

---

## Stage 6 — Policy Lifecycle Management

**Frontend:** `frontend/src/pages/runtime/PoliciesPage.jsx`
**Backend:** `backend/src/services/insurance-domain.service.js` —
`updatePolicy()` (lines 259-290)

### Policy Status Transitions

```text
pending → active → lapsed → reinstated
                 → surrendered
                 → matured
                 → cancelled
```

Each transition writes to `insurance_policy_status_history` via
`#policyStatusChange()` (lines 48-73) and creates an `activity` record on the
linked CRM record for timeline visibility.

Special status side-effects:

- `lapsed` → sets `is_lapsed = true`, `lapsed_at = now`
- `active` (from `lapsed`) → sets `reinstated_at = now`

### Beneficiary Management

**Backend:** `upsertBeneficiaries()` (lines 304-332)

Agents can add or update beneficiaries using a soft-deactivation pattern:

1. All existing beneficiaries marked `is_active = false`
2. New beneficiary set created with:
   - `name`, `relationship`
   - `beneficiary_type`: `primary` or `contingent`
   - `allocation_pct`: 0-100%
   - Optional: `contact_id`, `date_of_birth`

### Dashboard Statistics (PoliciesPage)

The frontend computes from the loaded policy list:

- **Active Policies** — count of `status = 'active'`
- **Total Coverage** — sum of `coverage_amount` across active policies
- **Average Premium** — mean `premium_amount`
- **Renewals Due** — count where `renewal_due_date` is approaching

---

## Stage 7 — Claims & Commissions (Post-Sale)

### Claims (UI: "File Claim" from Policy)

**Frontend:** `frontend/src/pages/runtime/ClaimsPage.jsx`
**Backend:** `backend/src/services/insurance-domain.service.js` —
`createClaim()` (lines 719-749), `updateClaim()` (lines 759-781)

Active policies show a **File Claim** button (amber warning triangle icon)
in both the table actions column and the policy detail modal. Clicking it
navigates to `/insurance/claims?policy_id=X&amount=Y` with the policy ID
and coverage amount as URL parameters. The `ClaimsPage` reads these params
on mount, pre-fills the `CreateClaimModal` form, and auto-opens it.

```text
insurance_claims
├── claim_number    — CLM-2026-000001 (unique per tenant)
├── policy_id       → insurance_policies
├── contact_id      → crm_contacts (the claimant)
├── claim_type      — death | disability | critical_illness | accident | other
├── amount          — claimed amount
├── priority        — high | medium | low
├── adjuster_id     → employees
├── description
└── status progression:
    filed → under_investigation → approved → paid → closed
                                → denied (with denial_reason)
```

When status changes to `paid`:

- `paid_at` automatically set to current timestamp
- `paid_amount` set (defaults to claim `amount` if not specified)

**Claim Timeline:** Each claim has `claim_events` that record the full history:

- Event types: `filed`, `note`, `document_received`, `decision`, `payment`
- Each event: `description`, `created_by`, `created_at`
- Auto-created on filing and on every status change

### Commissions

**Frontend:** `frontend/src/pages/runtime/CommissionsPage.jsx`
**Backend:** `backend/src/services/insurance-domain.service.js` — commission
methods (lines 809-897)

```text
commission_entries
├── Auto-created at policy issuance (Step 5, 45% default rate)
├── agent_id        → employees (the writing producer)
├── policy_id       → insurance_policies
├── application_id  → insurance_applications
├── carrier_id      → insurance_carriers
├── source_premium  — the premium basis for commission
├── commission_rate — e.g. 45.00 for 45%
├── commission_amount — source_premium x rate%
├── commission_period — "2026-04" (ISO month)
├── status: pending → paid (manual action)
│           → clawed_back (with mandatory reason)
└── Optional split:
    ├── split_agent_id → employees (co-producer)
    └── split_percent  — % of commission to co-producer
```

**Commission Summary** (`getCommissionSummary()`): Aggregates all commission
entries by agent into `paid`, `pending`, `clawed_back`, and `total` buckets.

**Clawback Flow:** When a policy lapses or is surrendered, the agent's commission
can be clawed back. The `ClawbackModal` requires a mandatory reason field before
submission to maintain audit trail completeness.

---

## Data Flow Diagram

```text
 ModulePage (Prospects)              ModulePage (Clients)
 +------------------+  [Convert]    +------------------+
 | Prospect record  | -----------> | Client record    |
 | EAV fields       |  + EAV copy   | crm_contacts     |
 | crm_leads        |  $transaction | crm_accounts     |
 +------------------+               +--------+---------+
                                             | [Get Quote] button
                                             | URL params: age, gender,
                                             | smoker, coverage, contact
                                             v
 CalculationEngine                  InsuranceQuotePage
 +--------------------+             +------------------+
 | CSO mortality      |<------------|  Pre-filled from |
 | Expense loading    | calculateQ  |  client params   |
 | Rider pricing      |------------>|  Premium display |
 | Cash value proj.   | quote_ref   +--------+---------+
 +--------------------+                      |
                                             | [Apply Now] button
 TemplateEngine <-- renderQuoteSummary       | 1. Creates CRM record
 htmlToPdf <---- Chrome headless             | 2. Opens 5-step wizard
 EmailSendService <-- send-with-pdf          |
                                             v
                                    WizardPage (5 steps)
                                    +------------------+
                                    | 1. Personal Info |  ◄── pre-filled:
                                    | 2. Health        |      name, email,
                                    | 3. Coverage      |      gender, smoker,
                                    | 4. Beneficiary   |      coverage, product
                                    | 5. Review/Submit |
                                    +--------+---------+
                                             |
                                    [Submit Application]
                                             |
                   ┌─────────────────────────┼──────────────────────┐
                   v                         v                      v
          CRM record updated         EAV fields saved     Insurance bridge
          (record_field_values)                            (#syncInsuranceDomain)
                                                                   |
                                                                   v
                                    INSURANCE > Applications
                                    +------------------+
 insurance_applications <-----------|  APP-2026-000001 |
 +--------------------+             |  [Send to UW]    |
 | contact, carrier   |             |  [In UW →]       |
 | coverage, premium  |             +--------+---------+
 +--------------------+                      |
                                             v
                                    INSURANCE > Underwriting
                                    +------------------+
 underwriting_cases <---------------|  Medical review  |
 +--------------------+  $txn       |  Requirements    |
 | UW-2026-000001     |             |  Approve/Decline |
 | risk_class         |             +--------+---------+
 | requirements[]     |                      |
 +--------------------+             [Issue Policy] button
                                             v
                                    +------------------+
 insurance_policies <---------------|  $transaction:   |
 +--------------------+             |  1. Create policy|
 | POL-2026-000001    |             |  2. Status hist. |
 | status: active     |             |  3. App -> issued|
 | beneficiaries[]    |             |  4. Commission   |
 | status_history[]   |             +--------+---------+
 +----------+---------+                      |
            |                                v
            |  [File Claim]         commission_entries
            |  button               +------------------+
            |  (URL params:         | 45% of premium   |
            |   policy_id, amount)  | auto-created     |
            v                       +------------------+
 insurance_claims                   ClaimsPage
 +--------------------+             +------------------+
 | CLM-2026-000001    |<------------|  Pre-filled from |
 | claim_events[]     |             |  policy params   |
 | filed -> paid      |             |  Adjuster assign |
 +--------------------+             +------------------+
```

---

## Cross-Cutting Concerns

| Concern               | How Genesis Handles It                                                                                                              |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| **Multi-tenancy**     | Every query includes `tenant_id` — enforced at service layer, validated at route layer (403 if missing)                              |
| **Audit trail**       | `insurance_policy_status_history` for policies, `claim_events` for claims, `audit_logs` for records, `email_logs` for sent emails    |
| **Sequence numbers**  | `#nextSeq()` parses trailing digits from `PREFIX-YYYY-NNNNNN` pattern, ordered by field value descending                             |
| **Atomicity**         | Critical multi-table writes use Prisma `$transaction` — policy issuance, lead conversion, UW decisions, beneficiary updates          |
| **Document generation** | Template engine renders HTML with escaped values, Chrome headless converts to PDF, nodemailer sends as attachment                  |
| **Data hydration**    | Both `#hydrateMany()` and `#hydrateCrm()` merge EAV + CRM fields (non-null CRM wins). Date values coerced to HTML input format.     |
| **Dual storage**      | Insurance data lives in domain tables (`insurance_policies`, etc.) AND in `record_field_values` (EAV) for CRM list views             |
| **Authorization**     | `authenticate` middleware on all insurance routes; `PermissionService` for object-level RBAC (`can_view`, `can_edit`)                |
| **Input validation**  | `requireFields()` and `requirePositiveNumber()` on all insurance create endpoints; UW decision status validated against allowed set   |
| **Error propagation** | Insurance routes use a shared `setErrorHandler` that propagates `statusCode` from service errors with structured `{ok, message}` body |
| **Caching**           | Quote results cached in bounded LRU map (max 1,000); metadata cached in Redis with configurable TTL                                 |
| **Pipeline sync**     | Every insurance status change auto-updates the CRM record's `pipeline_stage_id` via `#syncPipelineStage()`, keeping Kanban boards in sync |

---

## Automatic Kanban Pipeline Sync

Every insurance domain status change propagates to the CRM record's
pipeline stage automatically. This means the Kanban boards under
MODULES reflect real-time processing status without manual updates.

```text
Insurance Operation          │  CRM Pipeline Stage Change
─────────────────────────────┼──────────────────────────────
Convert Lead                 │  Prospects → "Converted"
Send to Underwriting         │  Applications → "Under Review"
UW Decision: Approve         │  Applications → "Approved"
UW Decision: Decline         │  Applications → "Declined"
Submit Quote                 │  Quotes → "Presented"
Approve Quote                │  Quotes → "Accepted"
Reject Quote                 │  Quotes → "Declined"
Claim Status Change          │  Claims → matches new status
```

### How It Works

`InsuranceDomainService.#syncPipelineStage(tx, recordId, statusName)`:

1. Looks up the record's `object_id`
2. Finds the `ui_pipeline_stages` row matching `statusName` for that
   object's pipeline
3. Updates `record.pipeline_stage_id` to the matched stage
4. Runs inside the same `$transaction` as the domain operation — atomic
5. Failures are logged but don't block the domain operation

For quotes, a status-to-stage name map translates domain statuses to
pipeline names (`sent` → `presented`, `accepted` → `accepted`,
`rejected` → `declined`).

The Pipeline UI component also includes an "Unsorted" column for
records that have no pipeline stage assigned, preventing them from
being invisible in the Kanban view.

---

## Kanban Drag-and-Drop Automation

In addition to the button-driven flow described above, pipeline
stage changes via **Kanban drag-and-drop** now auto-trigger the
same insurance domain actions. Dragging a card to a lane is
equivalent to pressing the corresponding action button.

### Supported Automations

| Module | Lane Dragged To | Auto-Action |
| ------ | --------------- | ----------- |
| Prospects | **Converted** | Converts lead to client — creates Account + Contact, copies EAV fields, navigates to Clients module |
| Applications | **Under Review** | Creates underwriting case — generates UW record + EAV, navigates to Underwriting |
| Applications | **Pending Medical** / **Declined** / **Submitted** | Syncs status to `insurance_applications` + updates EAV status field |
| Claims | Any valid status lane | Syncs status to `insurance_claims` via `updateClaim()` + updates EAV |

### Automation Mechanics

The `PATCH /api/runtime/records/:id/stage` endpoint in
`routes/runtime/index.js` now performs two steps:

1. **Stage update**: Updates `record.pipeline_stage_id` (same as
   before) with audit logging.
2. **Automation**: After the stage update, resolves the stage name
   and object name. Based on the combination, triggers the
   appropriate insurance domain action:
   - Prospect + `converted` → calls `crmSvc.convertLead()` with
     EAV field mapping and copy (same transaction logic as the
     "Convert" button in `convert-lead` route)
   - Application + `under_review` → calls
     `domainSvc.convertToUnderwriting()` (same as "Send to UW")
   - Application + status stages → syncs to
     `InsuranceApplication.status` + EAV `status` field
   - Claim + status stages → calls `domainSvc.updateClaim()`

### Response Format

The endpoint response now includes an `automation` field:

```json
{
  "ok": true,
  "data": {
    "id": 42,
    "pipeline_stage_id": 5,
    "pipeline_stage": { "id": 5, "name": "converted", "label": "Converted" },
    "automation": {
      "action": "lead_converted",
      "contactRecordId": 87
    }
  }
}
```

Possible `action` values:

- `lead_converted` — lead was auto-converted to client
- `sent_to_underwriting` — UW case auto-created
- `status_synced` — application status synced to domain
- `claim_status_synced` — claim status synced to domain
- `null` — no automation triggered (stage change only)

### Frontend Handling

`ModulePage.jsx`'s `moveStage` mutation reads the `automation`
result in its `onSuccess` handler:

- `lead_converted` → invalidates all record caches, navigates
  to the Clients module
- `sent_to_underwriting` → invalidates all record caches,
  navigates to `/insurance/underwriting`
- Other actions → standard cache invalidation, no navigation

### Error Handling

If automation fails, the **stage update still succeeds** — the
pipeline card moves to the new lane. The automation error is
logged server-side and returned in `automation.error` but does
not roll back the stage change. This ensures the Kanban UI
remains responsive even if a downstream operation fails.

### EAV Auto-Creation for Domain Objects

When insurance domain objects are created during automation (or
via action buttons), the system now auto-creates CRM Record
anchors with EAV field values so they appear in module list
views immediately:

| Domain Object Created | CRM Record Object | EAV Fields Populated |
| --------------------- | ------------------ | -------------------- |
| `underwriting_cases` | `underwriting_case` | case_number, applicant_name, product_type, coverage_amount, risk_class, status, assigned_underwriter, medical_history, risk_factors |
| `insurance_policies` | `policy` | policy_number, policyholder (from contact), product_type, coverage_amount, premium_monthly/annual, status, effective_date, payment_method |
| `commission_entries` | `commission` | agent_name (display name), policy_number, product_type, premium_amount, commission_rate/amount, status, period |

This is handled by `InsuranceDomainService.#createRecordWithEav()`
which creates the Record row, resolves the pipeline stage from the
status field, and writes typed EAV values in a single transaction.

---

## Key Database Models

| Model                                | Table                               | Role in Journey                            |
| ------------------------------------ | ----------------------------------- | ------------------------------------------ |
| `CrmLead`                            | `crm_leads`                         | Prospect entry point                       |
| `CrmContact`                         | `crm_contacts`                      | Converted prospect — threads through all stages |
| `CrmAccount`                         | `crm_accounts`                      | Household or company grouping              |
| `InsuranceCarrier`                    | `insurance_carriers`                | Carrier metadata (NAIC, AM Best)           |
| `CarrierProduct`                      | `carrier_products`                  | Product offerings per carrier              |
| `InsuranceApplication`                | `insurance_applications`            | Application with status pipeline           |
| `UnderwritingCase`                    | `underwriting_cases`                | UW decision, risk class, medical data      |
| `UnderwritingRequirement`             | `underwriting_requirements`         | Documentation requirements                 |
| `InsurancePolicy`                     | `insurance_policies`                | Active policy with lifecycle               |
| `InsurancePolicyBeneficiary`          | `insurance_policy_beneficiaries`    | Beneficiary designations                   |
| `InsurancePolicyStatusHistory`        | `insurance_policy_status_history`   | Status change audit trail                  |
| `InsuranceClaim`                      | `insurance_claims`                  | Filed claims with adjuster workflow        |
| `ClaimEvent`                          | `claim_events`                      | Claim timeline entries                     |
| `CommissionEntry`                     | `commission_entries`                | Agent compensation tracking                |

---

## File Reference

| Layer    | File                                                         | Purpose                                      |
| -------- | ------------------------------------------------------------ | -------------------------------------------- |
| Frontend | `frontend/src/pages/runtime/InsuranceQuotePage.jsx`          | Quote calculator and PDF viewer              |
| Frontend | `frontend/src/pages/runtime/ApplicationsPage.jsx`            | Application pipeline and creation            |
| Frontend | `frontend/src/pages/runtime/UnderwritingPage.jsx`            | UW case management and decisions             |
| Frontend | `frontend/src/pages/runtime/PoliciesPage.jsx`                | Policy dashboard and lifecycle               |
| Frontend | `frontend/src/pages/runtime/ClaimsPage.jsx`                  | Claims filing and tracking                   |
| Frontend | `frontend/src/pages/runtime/CommissionsPage.jsx`             | Commission tracking and clawbacks            |
| Frontend | `frontend/src/components/runtime/PDFViewer.jsx`              | Shared PDF viewer with email integration     |
| Frontend | `frontend/src/services/insurance.service.js`                 | API client for all insurance endpoints       |
| Backend  | `backend/src/services/calculation-engine.service.js`         | Actuarial premium calculation engine         |
| Backend  | `backend/src/services/insurance-domain.service.js`           | Full insurance AMS business logic            |
| Backend  | `backend/src/services/rating-adapter.js`                     | Rating adapter interface + registry          |
| Backend  | `backend/src/services/template-engine.service.js`            | Professional document rendering              |
| Backend  | `backend/src/services/crm.service.js`                        | Lead conversion and CRM entity management    |
| Backend  | `backend/src/services/email-send.service.js`                 | Email delivery with PDF attachments          |
| Backend  | `backend/src/utils/html-to-pdf.js`                           | Chrome headless PDF generation               |
| Backend  | `backend/src/routes/insurance/index.js`                      | All insurance REST API routes                |
| Frontend | `frontend/src/pages/runtime/AgentWorkbenchPage.jsx`          | Agent renewal and compliance workbench       |
| Database | `backend/prisma/schema.prisma`                               | Full schema (77+ models)                     |

### Insurance AMS Database Models (v4.0)

| Model | Table | Purpose |
| ----- | ----- | ------- |
| `QuoteScenario` | `quote_scenarios` | Persisted rated quotes with rate source metadata |
| `ComplianceArtifact` | `compliance_artifacts` | SOA, consent, e-sign, attestation tracking |
| `SubmissionChecklist` | `submission_checklists` | Per-application submission readiness items |
| `PolicyEndorsement` | `policy_endorsements` | Policy modification requests with approval |
| `RenewalTask` | `renewal_tasks` | Renewal workbench task tracking |
| `BillingSchedule` | `billing_schedules` | Policy billing frequency and amounts |
| `PolicyInvoice` | `policy_invoices` | Generated invoices per billing period |
| `PolicyPayment` | `policy_payments` | Payments recorded against invoices |
| `ClaimReserve` | `claim_reserves` | Reserve set/adjust/release tracking |
| `ClaimPaymentEvent` | `claim_payment_events` | Claim payment events (partial/settlement) |
| `ProducerAppointment` | `producer_appointments` | Agent licensing per carrier per state |
| `CommissionStatement` | `commission_statements` | Carrier statement reconciliation |
