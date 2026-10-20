# Step 2 — The building blocks

<!-- nav:top -->
> **[Docs roadmap](../README.md)** › **[Understanding Genesis](README.md)** › 2 of 8 · **For:** Everyone
> ← [Step 1 — What Genesis is](01-what-genesis-is.md) · [Step 3 — How data is stored and read](03-how-data-is-stored.md) →
<!-- /nav:top -->

> **Track:** both. **Time:** 15 minutes.

Genesis has a small vocabulary. Once you know these nine words, every screen and every table makes sense.

## The vocabulary

| Word | Plain meaning | Genesis Capital example | Stored in |
|---|---|---|---|
| **Workspace** (tenant) | One customer's private copy of the CRM | Genesis Capital | `tenants` |
| **Module** | A section in the sidebar, grouping related work | Retail Lending | `ui_modules` |
| **Object** | A kind of thing you keep records of | Loan application (`loan_application`) | `ui_objects` |
| **Field** | One piece of information about an object | Requested amount, tenure, applicant | `ui_fields` |
| **Record** | One actual thing, with its field values filled in | One client's home-loan application | `records` + `record_field_values` |
| **Pipeline & stages** | The steps a record moves through, shown as a board | Submitted → Credit review → Approved → Disbursed | `ui_pipelines`, `ui_pipeline_stages` |
| **Form** | Which fields appear, in what layout, when creating or editing | "New loan application" | `ui_forms`, `ui_form_field_layouts` |
| **Lookup** | A field that points at another record | The application's *party* field → the client | a field of type `lookup` |
| **Role** | What a person may do and see | Relationship Manager, Compliance Officer | `roles`, `ui_permissions` |

## How they fit together

```text
Workspace  (Genesis Capital)
 └─ Module  (Retail Lending)
     └─ Object  (loan_application)
         ├─ Fields     requested_amount · tenure · party (lookup → Client) · status …
         ├─ Forms      which fields to show when creating / editing
         ├─ Pipeline   Submitted → Credit review → Approved → Disbursed
         ├─ Rules      validations, formulas, workflows, SLA timers, permissions
         └─ Records    one per actual application  ← the business data
```

Everything above the **Records** line is the *blueprint*: it describes what the CRM looks like and how it behaves.
Records are the *business data*. Both are stored in the database, which is why an administrator can change the
blueprint in the Builder and see the result immediately — no developer and no software release is needed.

## The kinds of field

Around thirty field types, in a few families:

| Family | Examples | Notes |
|---|---|---|
| Basic values | text, long text, number, currency, percent, date, checkbox, email, phone | Validated on the server as well as in the browser |
| Choices | picklist, multi-select | Options defined in the field |
| Links | lookup (to another record), employee (to a staff member) | A lookup also gives the target a *related list* ("this client's applications") |
| Calculated | formula, roll-up (sum/count of related records), auto-number | Computed by the server and stored with the record |
| Special | file, status tracker, signature, address and others | Rendered by dedicated components |

A field can also be marked **required**, **unique**, **searchable**, **personal data** (masked on screen) or
**encrypted** (stored scrambled in the database).

## Genesis Capital in numbers

The Genesis Capital workspace defines **19 modules, 91 objects and about 1,500 fields**. The main object in each
module:

| Module | Main object | Module | Main object |
|---|---|---|---|
| Products & Services | `financial_product` | Trading Solutions | `securities_account` |
| Clients | `party` | Corporate Advisory | `advisory_mandate` |
| Enquiries & Leads | `enquiry` | Forex Desk | `fx_profile` |
| Cross-sell & RM Workbench | `opportunity` | Marketing & Consent | `campaign` |
| Retail Lending | `loan_application` | Introducers | `introducer` |
| Commercial Lending | `credit_facility` | Revenue | `revenue_entry` |
| Collateral & Pledges | `collateral` | Service & Complaints | service request |
| Loan Servicing | `loan_account` | KYC & Compliance | `kyc_case` |
| Wealth Management | `risk_profile`, `wealth_mandate` | Masters | reference lists (countries, rates…) |
| Investment Funds | `fund` | | |

Every module and its process: [process flows](../genesis-capital/process-flows/README.md). Every object and field:
[IMPLEMENTATION](../genesis-capital/implementation.md).

## Two other places people work

- **The Builder** (`/builder`) — where administrators edit the blueprint: modules, objects, fields, forms, pipelines,
  workflows, dashboards, permissions, assignment, SLAs, templates, appearance.
- **The platform console** (`/platform`) — where the platform operator creates workspaces and sets their plan and
  features. It sits above all workspaces.

## Go deeper

| If you are | Read next |
|---|---|
| Genesis Capital staff | [Genesis Capital user guide](../genesis-capital/user-guide.md) · [process flow for your desk](../genesis-capital/process-flows/README.md) |
| Administrators | [Modules & objects](../builder-guide/01-modules-and-objects.md) — where these blocks are created |
| Implementers, engineers | [Implementation](../genesis-capital/implementation.md) — every Genesis Capital object and field |

<!-- nav:bottom -->

---

### Where to next

| | |
|---|---|
| **Next** | [Step 3 — How data is stored and read](03-how-data-is-stored.md) — Blueprint + envelope + values; why crm_* tables are empty; read/write paths; SQL recipes |
| **Previous** | [Step 1 — What Genesis is](01-what-genesis-is.md) |
| **On these journeys** | [Decision-maker](../README.md#decision-maker) (step 2 of 8) · [Genesis Capital staff](../README.md#genesis-capital-staff) (step 2 of 9) |
| **Lost?** | [Docs roadmap](../README.md) · [Understanding Genesis](README.md) · [Understanding Genesis](README.md) |
<!-- /nav:bottom -->
