# Genesis Capital: CRM Product Requirements Document (PRD)

<!-- nav:top -->
> **[Docs roadmap](../README.md)** › **[Genesis Capital workspace](README.md)** › 2 of 5 · **For:** Implementers, product owners
> ← [Genesis Capital user guide](user-guide.md) · [Implementation](implementation.md) →
> New to Genesis? Background: [Understanding Genesis › What Genesis is](../understanding/01-what-genesis-is.md)
<!-- /nav:top -->

**Product:** Genesis Capital CRM, built on the GenesisCRM platform (`genesis/insure-genesis`)
**Document type:** Product Requirements Document (functional, data and architecture)
**Version:** 1.0 (Draft for review)
**Date:** 13 October 2026
**Status:** Draft. No code changes have been made.

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Business Context: What Genesis Capital Does](#2-business-context-what-genesis-capital-does)
3. [Problem Statement and Opportunity](#3-problem-statement-and-opportunity)
4. [Goals, Non-Goals and Success Metrics](#4-goals-non-goals-and-success-metrics)
5. [Users, Personas and Roles](#5-users-personas-and-roles)
6. [Solution Architecture on GenesisCRM](#6-solution-architecture-on-genesiscrm)
7. [Module Catalogue](#7-module-catalogue)
8. [Detailed Module Requirements](#8-detailed-module-requirements)
9. [Cross-Cutting Functional Requirements](#9-cross-cutting-functional-requirements)
10. [Data Model](#10-data-model)
11. [Roles and Permission Matrix](#11-roles-and-permission-matrix)
12. [Integrations](#12-integrations)
13. [Non-Functional Requirements](#13-non-functional-requirements)
14. [Required Enhancements to the GenesisCRM Platform](#14-required-enhancements-to-the-genesiscrm-platform)
15. [Release Plan and Phasing](#15-release-plan-and-phasing)
16. [Risks, Assumptions, Dependencies and Open Questions](#16-risks-assumptions-dependencies-and-open-questions)
17. [Appendices](#17-appendices)

---

## 1. Executive Summary

Genesis Capital (SCS) handles everything in the Genesis Group, Mauritius, that is not insurance. One brand ("Think. Multiply.") covers six regulated legal entities:

- lending (through Genesis Life Ltd)
- wealth management
- in-house investment funds
- stockbroking and trading
- corporate advisory
- foreign exchange

The clients are high-net-worth individuals (HNWIs), affluent retail clients, corporates and institutions (pension funds, insurers, investment funds).

Today the public channel is a single "Get In Touch" form with about 21 products in one dropdown, and only email is mandatory. Nothing in the visible process covers loan intake, document collection, onboarding of investors who have taken the risk questionnaire, cross-entity client visibility, or regulated suitability and AML records.

This PRD defines a **complete, multi-entity, relationship-led CRM for financial services**, built on the **GenesisCRM architecture**:

- Fastify 5 + Prisma 6 + MySQL 8
- React 18 + Vite + Tailwind
- metadata engine with typed custom fields (EAV)
- workflow, SLA, assignment and lead-scoring engines
- document management system (DMS) with e-signature
- report builder with "Ask Genesis" AI reporting
- multi-tenant SaaS layer

The CRM delivers:

1. **A single Client 360** across all six Genesis entities: one client, many relationships, many products.
2. **Product-specific pipelines:** Retail Lending, Commercial Lending, Wealth Mandates, Fund Subscriptions, Trading Account Opening, Advisory Mandates and Forex Deals.
3. **Regulatory-grade onboarding.** This covers KYC/CDD (customer due diligence), AML/CFT (anti-money laundering and countering the financing of terrorism) risk rating, sanctions and PEP (politically exposed person) screening, investor suitability, and consent under the Mauritius Data Protection Act 2017.
4. **Information barriers (Chinese walls)** between Corporate Advisory, which holds price-sensitive information, and Trading/Wealth. This is the most important architectural addition to Genesis.
5. **Cross-sell intelligence**, for example from investment client to investment-backed loan, from borrower to wealth client, and from corporate to forex and advisory.
6. **Management analytics** across the group: pipeline, assets under management (AUM), loan book origination, fee revenue, RM productivity and compliance exceptions.

> **Mentor note.** The client is not an Indian loan DSA or aggregator, which a first reading of "Capital Solutions" might suggest. It is a **balance-sheet lender plus asset manager plus broker-dealer plus advisory boutique plus FX dealer**, regulated by the **FSC Mauritius** and the **Bank of Mauritius**. That changes the design in three ways:
> - **KYC and suitability are mandatory steps**, not optional extras.
> - **Information barriers are a regulatory need**, not a nice-to-have.
> - **Multi-currency** (MUR, USD, EUR, GBP and others) is required from day one.

---

## 2. Business Context: What Genesis Capital Does

The source is an analysis of genesis-capital.demo and genesis-life.demo, done in October 2026. Rates and figures are as published on the site and must be confirmed with Genesis before build.

### 2.1 Legal Entities (Business Units)

| # | Legal entity | Business line | Regulator / licence | CRM business unit code |
|---|---|---|---|---|
| 1 | **Genesis Life Ltd (Loans business line)** | Real Estate, Personal, Investment-Backed and Commercial loans (own balance sheet) | FSC IS10000013 | `LND` |
| 2 | **Genesis Wealth Managers Ltd** (est. 2004) | Discretionary wealth management, advisory, managing collective investment schemes (CIS). AUM above USD 1.49bn | FSC IX09000018, CM12000023, DF09000007 | `WLT` |
| 3 | **Genesis Global Funds Ltd** (est. 2006) | In-house funds: Money Market (USD/MUR/EUR), Income, Foreign Equity, Emerging Markets Equity, Global Private Equity, Fixed Maturity Bond 2029 | FSC CI11000044 | `FND` |
| 4 | **Genesis CMB Securities Ltd** (since 1989) | Investment dealer, underwriting, local and international trading | FSC IP16000002 | `SEC` |
| 5 | **Genesis Corporate Advisors Ltd** (est. 2017) | Fund raising, Valuation and Business Plan, Corporate Restructuring | FSC IZ19000019 | `ADV` |
| 6 | **Genesis Forex Ltd** | Spot, forwards and swaps for corporates and individuals | Bank of Mauritius FX Dealer Licence No. 03 | `FX` |

Group context: Genesis Group (the largest insurance group in Mauritius) is the parent. The insurance businesses are separate. This CRM must support **referrals into and out of** the insurance businesses, for example life and building insurance required as security for real-estate loans.

### 2.2 Product Catalogue (Initial Master Data)

**A. Retail financing (Genesis Life Ltd).** Rates are linked to the **Genesis PLR** (prime lending rate), currently 6.825%.

| Product | Purpose | Amount | Tenure | Indicative rate | Security / conditions |
|---|---|---|---|---|---|
| Real Estate Loan | Buy a residential property, buy a construction lot, renovation, real-estate investment | Up to 100% of project cost | Up to 30 years; must end by age 65 | Variable, from 6.15% (PLR − 0.675%) | First-rank fixed charge. Life and building insurance assigned to Genesis Life. Moratorium or interest-only options |
| Personal Loan | Car, wedding, education, travel, luxury assets | From MUR 500,000 | Up to 10 years; max age 65 | From 7.00% (PLR + 0.175%) | First-rank fixed charge on property |
| Investment-Backed Loan | Liquidity without selling investments (existing clients only) | Depends on the pledged asset | Up to 10 years; max age 65 | From 6.65% (PLR − 0.175%) | Pledge of Genesis Global Funds units or a Genesis Securities portfolio |

**B. Commercial financing.** Corporate loans and refinancing for short- and long-term cash flow. RM-led assessment.

**C. Investment solutions**

- **Wealth Management:**
  - discretionary portfolio management
  - asset allocation
  - global platform (ETFs, third-party funds, rated bonds)
  - sustainable investing
  - monthly reports and periodic reviews
- **Investment Funds:**
  - money market funds (USD/MUR/EUR)
  - Income Fund
  - Foreign Equity Fund
  - Emerging Markets Equity Fund
  - Global Private Equity Fund
  - Fixed Maturity Bond 2029
- **Trading Solutions:** local investments (SEM, the Stock Exchange of Mauritius), international offering, market statistics.

**D. Corporate advisory**

- Fund Raising: debt, bond and share offers; investor access
- Valuation & Business Plan: purchase-price allocation (PPA), IP, mark-to-market, ESOP, tax, disputes, M&A, IPO
- Corporate Restructuring: formation and liquidation, recapitalisation, viability studies, turnaround

**E. Forex.** Spot, forwards and swaps in AUD, EUR, GBP, JPY, USD, ZAR and others.

### 2.3 Customer Segments

| Segment | Typical products | Primary entity |
|---|---|---|
| Retail / affluent individuals | Real Estate Loan, Personal Loan, Money Market and Income funds, FX | LND, FND, FX |
| HNWIs | Wealth mandates, Investment-Backed Loans, trading, Private Equity fund | WLT, LND, SEC, FND |
| Existing investment clients | Investment-Backed Loans (cross-sell) | LND |
| Corporates / SMEs | Commercial loans, advisory, forex hedging, corporate treasury funds | LND, ADV, FX, FND |
| Institutions (pension funds, insurers, funds) | Institutional mandates, funds, trading, bond underwriting | WLT, FND, SEC |
| International clients | Wealth, funds and FX (Genesis has a presence in Seychelles, Comoros, Zambia and Rwanda) | WLT, FND, FX |

### 2.4 Current Digital Touchpoints Found on the Website

| Touchpoint | Observation | CRM implication |
|---|---|---|
| "Get In Touch" form | Product dropdown (~21 items, with duplicates), first and last name, email (required), mobile, message, reCAPTCHA. **No consent text** | Web-to-lead API with routing by product and entity. Capture consent |
| "Request More Info" CTAs | Link to `/get-in-touch/?prod=<Product>`, which pre-selects the product | Use `prod` as the source/product tag for automatic routing and UTM attribution |
| Loan Calculator | JavaScript widget; captures no lead | Embeddable calculator that turns into a lead (amount, tenure, age, rate) |
| Investor Questionnaire | Time horizon, risk tolerance, model portfolios A–E, name, email, age, email opt-in. No visible submit or result | Risk profiling with scoring as a CRM object, feeding suitability |
| "Talk to us" / "Talk to our FX specialist" | Phone and email only | Callback and appointment booking, click-to-call logging |
| Phone / email | 203 4600, 291 1994, 207 3581; info@genesis-capital.demo | Shared inbox capture to Case/Lead, call logging |
| News & Media | Weekly market highlights, notices | Newsletter subscriptions, segmented distribution, engagement tracking |
| Social | Facebook, LinkedIn, YouTube, Instagram | Genesis Social module (connectors need to go live) |
| Not present | WhatsApp, chat, online application, document upload, introducer portal | Delivered by this CRM in Phases 2–3 |

---

## 3. Problem Statement and Opportunity

| # | Problem (inferred from public footprint) | Impact | CRM response |
|---|---|---|---|
| P1 | One generic enquiry form for 6 entities and about 21 products | Manual triage, slow response, leads lost | Automatic routing by product, entity, segment and RM (Genesis Assignment Rules plus SLA) |
| P2 | Thin lead data (only email required) | RMs re-qualify every lead by phone | Progressive profiling, product-specific intake wizards, lead scoring |
| P3 | No online loan application, checklist or tracking | Long time to decision, paper and email chasing | Loan Origination pipeline with document checklists, client upload links and status notifications |
| P4 | Client relationships split across entities | Missed cross-sell; inconsistent KYC; duplicate onboarding | Client 360 with a single party master and group-level KYC reused across entities (subject to consent and legal basis) |
| P5 | Regulated suitability and AML obligations (FSC AML/CFT, Securities Act, FIAMLA) | Regulatory and audit risk | KYC/CDD module, risk rating, screening, periodic reviews, suitability records, immutable audit |
| P6 | Price-sensitive information in Advisory | Insider-dealing and conflict risk | Information barriers, restricted/watch lists, conflict checks |
| P7 | PLR-linked loan book | Every PLR change must be communicated to borrowers | Rate-change campaign workflow and borrower notification log |
| P8 | No management view across the group | Decisions made without data | Group dashboards: pipeline, AUM flows, loan book, fee revenue, RM league tables |
| P9 | Data protection (Mauritius DPA 2017) | Consent missing on forms | Consent and preference centre; data subject requests |

---

## 4. Goals, Non-Goals and Success Metrics

### 4.1 Goals

- **G1.** One place to manage every Genesis Capital prospect and client across all six entities.
- **G2.** Shorter lead-to-decision time for loans, and lead-to-funding time for investments.
- **G3.** Higher products-per-client through structured cross-sell.
- **G4.** Audit-ready, regulator-defensible KYC, suitability, consent and information-barrier controls.
- **G5.** Reuse at least 70% of GenesisCRM capabilities. New build should go into domain modules, not the platform.

### 4.2 Non-Goals

These systems remain the **system of record** for their area. The CRM integrates with them but does not replace them.

- **Core lending / loan management system (LMS):** amortisation, accounting, interest accrual. The CRM holds origination and a servicing view.
- **Portfolio management / fund accounting / transfer-agency system:** NAV calculation, unit registry. The CRM holds the client view, mandates and subscription requests.
- **Order management / trading system and the CDS** (Central Depository & Settlement, Mauritius). The CRM holds accounts, the order intake log and client service.
- **Treasury / FX dealing system.** The CRM holds quotes, deal capture handoff and the client view.
- **General ledger and billing for insurance products.**

### 4.3 Success Metrics (KPIs)

| KPI | Baseline | Target (12 months after go-live) |
|---|---|---|
| Median time from web enquiry to first RM contact | Unknown (manual) | ≤ 4 business hours (SLA-tracked) |
| Share of leads automatically routed to the correct entity and RM | 0% | ≥ 90% |
| Loan application to credit decision (Real Estate) | TBC | −30% |
| Products per active client | TBC | +15% |
| KYC periodic reviews overdue | TBC | < 2% |
| Clients with a recorded consent status | ~0% | 100% of new clients; 80% of existing clients |
| Weekly active RM users | n/a | ≥ 90% of licensed users |
| Dashboard and report adoption (management) | n/a | Monthly MI pack produced 100% in the CRM |

---

## 5. Users, Personas and Roles

| Persona | Entity | Key needs |
|---|---|---|
| **Business Development / Strategic Partnerships** (e.g. Senior Manager, Strategic Partnership & BD; BD Team Leader) | Group | Lead generation, campaigns, introducers, cross-entity pipeline |
| **Relationship Manager (RM) / Financial Solutions Executive** | Group / WLT | Client 360, tasks, cross-sell prompts, meeting notes, reviews |
| **Loans Executive / Client Relationship Executive (Loans)** | LND | Loan intake, document chasing, application tracking, offer and disbursement |
| **Manager: Loans & Fixed Income** | LND | Credit pipeline, approvals, TAT, portfolio |
| **Credit Analyst / Credit Committee** | LND | Appraisal, scoring, approvals with conditions |
| **Portfolio / Fund Manager** | WLT / FND | Mandates, review cycles, suitability, client reporting |
| **Manager: Investments** | WLT / FND | Flows, AUM, fund sales pipeline |
| **Trader / Head of Trading / Manager, Genesis Securities** | SEC | Account opening, client orders log, client service |
| **Corporate Advisor / Analyst** | ADV | Mandates, deal teams, investor lists, valuations, fees |
| **Forex Dealer / MD Genesis Forex** | FX | Client FX profile, quotes and deals, limits, rate alerts |
| **Compliance Officer / MLRO** (Money Laundering Reporting Officer) | Group | KYC approvals, screening hits, high-risk clients, restricted lists, STR (suspicious transaction report) workflow, audit |
| **Operations / Back Office** | All | Onboarding checks, document verification, data quality |
| **COO / Executive Management** | Group | Group dashboards, revenue, AUM, risk exceptions |
| **CRM Administrator** | Group | Metadata builder, workflows, users, permissions |
| **External: Client** (Phase 3) | n/a | Portal: applications, document upload, statements, service requests |
| **External: Introducer / Partner** (Phase 3) | n/a | Refer leads, track status and commissions |

---

## 6. Solution Architecture on GenesisCRM

### 6.1 Platform Baseline (Reused As-Is)

| Layer | GenesisCRM capability | Reuse for Genesis |
|---|---|---|
| Backend | Fastify 5, CommonJS, `routes/<group>/index.js` with inline handlers calling `services/*.service.js` classes | New domain route groups follow the same pattern |
| Data | Prisma 6 on MySQL 8 (AWS RDS); `Record` plus typed EAV (`RecordFieldValue`); first-class `crm_*` tables | Domain tables use the insurance-vertical pattern: nullable unique `record_id` link, `PREFIX-YYYY-NNNNNN` numbering, status-history tables |
| Tenancy | Row-level `tenant_id` through a Prisma `$extends` extension and AsyncLocalStorage | Genesis Capital is one tenant. The Genesis Group insurance arms can be other tenants later |
| AuthN | JWT HS256 (8h), bcrypt; login by `employee_id` | Reuse. Add refresh tokens, MFA and SSO (see §14) |
| AuthZ | Role ladder; `UiPermission` (view/edit per field); `OperationalPermission` scopes `none/own/team/hierarchy/all`; `EmployeeHierarchy` closure table | Reuse. Extend with a **Business Unit (legal entity) scope** and **information barriers** |
| Metadata | Modules, objects, fields (27 types), forms, validations (23), dependencies, wizards, pipelines, pages | Configure the Genesis objects, intake wizards and pipelines with no code |
| Automation | Workflow engine (triggers, conditions, approvals, delays, webhooks, create/update related); assignment rules; lead scoring; SLA engine | Lead routing, credit approvals, KYC reviews, PLR notifications, TAT |
| Documents | DMS: categories, checklists, versioning, full-text search, merge templates, share links, e-signature | KYC packs, loan document checklists, offer letters, mandates, engagement letters |
| Analytics | Report builder (registry sources), dashboards (19 chart types), scheduled subscriptions, AI "Ask Genesis" | Group MI pack, entity dashboards, regulatory reports |
| Engagement | Email templates (finance pack), activities, tasks, reminders, notifications, social module | RM engagement, campaigns, newsletters |
| SaaS | Plans, feature catalogue, `requireFeature` gates, tenant provisioning from a template tenant | Package the "Financial Services" vertical as plan-gated features |
| Frontend | React 18, React Query 5, Zustand, react-hook-form, Tailwind widget design system, `DataTable`, `FormRenderer`, `DashboardRenderer` | New domain pages follow the `PageHeader → StatTile row → DataTable in Card → EmptyState` convention |

### 6.2 Target Logical Architecture

```
                        ┌──────────────────────────────────────────────────────────┐
  Website / Calculators │  Public Intake API  (/api/public/intake/*)  reCAPTCHA,    │
  Investor Questionnaire│  rate-limited, consent capture, UTM + ?prod= tagging     │
  Client & Introducer   └───────────────┬──────────────────────────────────────────┘
  Portals (Ph-3)                        │ domain events (record.created …)
                                        ▼
┌───────────────────────────── GenesisCRM Core (reused) ──────────────────────────────┐
│ Auth/RBAC + BU scope + Info Barriers │ Metadata Engine │ Workflow │ SLA │ Assignment │
│ Lead Scoring │ DMS + e-Sign │ Activities/Tasks/Reminders │ Reports/Dashboards │ AI   │
└───────────────┬─────────────────────────────────────────────────────────┬───────────┘
                │                                                         │
┌───────────────▼──────────── Genesis Financial-Services Vertical ───────────▼───────────┐
│ Client 360 & Party Master │ KYC/AML & Suitability │ Retail & Commercial Lending      │
│ Collateral & Pledges │ Wealth Mandates │ Fund Subscriptions │ Securities Accounts    │
│ Advisory Mandates & Deal Rooms │ Forex Desk │ Cross-sell │ Fees & Revenue │ Service  │
│ Requests & Complaints │ Compliance Registers (Restricted/Watch list, Conflicts, STR)│
└───────────────┬──────────────────────────────────────────────────────────────────────┘
                │ Integration Hub (webhooks out / inbound, adapters, durable job queue)
                ▼
  Core Loan System │ Portfolio/Fund Admin & Transfer Agency │ Trading/OMS & CDS │
  FX Dealing System │ Screening provider (sanctions/PEP) │ MCIB credit bureau │
  SMS / WhatsApp / Email gateway │ Genesis Life insurance systems │ Market data / PLR feed
```

### 6.3 Key Architecture Decisions (ADRs)

| ADR | Decision | Rationale |
|---|---|---|
| ADR-01 | **One tenant (`genesis-capital`), with Business Unit as a first-class data dimension** on every client-facing record. Not one tenant per entity | A Client 360 and cross-sell across entities need shared data. Tenant isolation would prevent both. Entity-level segregation is enforced by BU scope and information barriers |
| ADR-02 | **Party master model.** One `Party` (Individual or Organisation). Each entity has a `ClientRelationship` linked to it | One identity and KYC, many relationships. Mirrors how regulators view a "customer" per licensed entity |
| ADR-03 | **Domain tables are first-class Prisma models** (`LoanApplication`, `WealthMandate` and so on), each with a `record_id` link to the generic `Record`. This is the insurance-vertical pattern | Gets Kanban, metadata custom fields and list views free, plus relational integrity and reporting performance |
| ADR-04 | **The CRM is not the system of record for balances, positions or NAV.** It shows synced read models (`*_snapshot` tables) | Avoids duplicating LMS, PMS and OMS logic. Keeps regulatory books where they already are |
| ADR-05 | **Information barriers are enforced in the service layer and the Prisma tenant extension**, not only in the UI | Cannot be bypassed by API calls, search, reports or AI Ask |
| ADR-06 | **Real multi-currency.** Every amount is stored as `amount` + `currency_code` + `fx_rate_to_base` + `amount_base` (base = MUR) | FX, USD funds and international clients. Genesis today supports only a display currency |
| ADR-07 | **Introduce a durable job queue** (BullMQ on the existing Redis) for screening, sync jobs, bulk notifications and report generation | Genesis's in-process schedulers lose in-flight work. Regulatory jobs need guaranteed delivery |
| ADR-08 | **API naming:** new route groups under `/api/fs/*` (financial services), for example `/api/fs/lending`, `/api/fs/kyc`. Same response envelope (`{success, data, pagination}`) and error codes | Consistent with Genesis conventions. Clean feature-gating with `featureGateByPrefix('/api/fs')` |
| ADR-09 | **Every new route has a JSON request schema** (Fastify schema) | Closes a known Genesis gap. Mandatory for regulated data |
| ADR-10 | **Data residency:** host in an approved region, and record the regulators' outsourcing and cloud requirements (FSC / Bank of Mauritius). Encrypt personal data at field level | Data Protection Act 2017; outsourcing guidelines |

> **Mentor note on ADR-01 vs. tenant-per-entity.** Separate tenants for each legal entity looks attractive because it gives "hard" segregation. But Genesis tenants are hard silos: no shared search, no shared client, and no cross-tenant reports. Genesis's whole value proposition ("single touchpoint") needs a shared client. So use **one tenant plus BU scope plus barriers**, and invest in proving the barrier controls with automated tests, the same way Genesis already tests tenant isolation.

---

## 7. Module Catalogue

| ID | Module | Primary entity / BU | Genesis reuse | New build | Phase |
|---|---|---|---|---|---|
| M01 | Lead & Enquiry Management | Group | High (CrmLead, CrmLeadIntake, assignment, scoring, SLA) | Public intake API, product routing matrix | 1 |
| M02 | Client 360 & Party Master | Group | Medium (CrmAccount, CrmContact, CrmAssociation) | Party model, relationships, households and groups, Client 360 UI | 1 |
| M03 | KYC / CDD / AML Onboarding | Group (Compliance) | Medium (DMS checklists, workflow approvals, SLA) | Risk rating engine, screening adapter, periodic review, STR register | 1 |
| M04 | Investor Profiling & Suitability | WLT, FND, SEC | Medium (wizards, scoring) | Risk questionnaire engine, model portfolio mapping, suitability record | 1 |
| M05 | Retail Loan Origination | LND | High (pattern from Application → Underwriting → Policy) | Eligibility and pricing engine (PLR), credit appraisal, offer, security perfection, disbursement | 1 |
| M06 | Commercial Lending | LND | High (Opportunity, pipeline, approvals) | Credit memo, facility structure, covenants | 2 |
| M07 | Collateral, Security & Pledge Management | LND | Low | Collateral register, valuation, insurance assignment, LTV monitoring, margin calls | 2 |
| M08 | Loan Servicing View & PLR Change Management | LND | Medium (billing schedule pattern, campaigns) | LMS sync, PLR change workflow, early settlement and restructure requests | 2 |
| M09 | Wealth Management Mandates & Reviews | WLT | Medium (pipeline, reminders, report subscriptions) | Mandate lifecycle, review cycles, client report distribution, AUM snapshot | 1–2 |
| M10 | Fund Distribution & Investor Servicing | FND | Medium (Quote/Policy pattern) | Subscription and redemption requests, holdings snapshot, FMB 2029 campaign | 2 |
| M11 | Securities Account & Trading Client Mgmt | SEC | Medium | Account opening, CDS account link, order intake log, best-execution and complaint linkage | 2 |
| M12 | Corporate Advisory Mandates & Deal Management | ADV | Medium (Opportunity, DMS share links, e-sign) | Mandate pipeline, conflict checks, deal team, investor bookbuilding, data-room tracking, insider lists | 2 |
| M13 | Forex Desk CRM | FX | Low–Medium | FX client profile, rate board, quote and deal capture, limits, rate alerts | 2 |
| M14 | Cross-Sell & Opportunity Management | Group | High (Opportunity, Forecast, Quota) | Next-best-action rules, referral between entities, opportunity ownership split | 1–2 |
| M15 | RM Workbench, Activities & Calendar | Group | High (Activities, Tasks, Reminders, agent workbench pattern) | Calendar sync, meeting notes templates, call logging | 1 |
| M16 | Service Requests & Complaints | Group | High (CrmCase, SLA engine) | FSC-aligned complaints register, root cause, regulatory TAT | 1 |
| M17 | Document Management & E-Signature | Group | Very high (DMS) | Genesis categories, retention, templates (offer letter, mandate, engagement letter) | 1 |
| M18 | Marketing, Campaigns & Consent | Group | Medium (email templates, social module) | Campaign object (removed from Genesis, rebuild), consent and preferences, newsletter, events | 2 |
| M19 | Introducer & Partner Management | Group | Medium (ProducerAppointment, CommissionEntry patterns) | Introducer agreements, referral tracking, commission | 3 |
| M20 | Fees, Revenue & Commission Tracking | All | Medium (CommissionEntry, statements) | Revenue attribution per RM and entity, advisory fee schedules, retainers | 2 |
| M21 | Compliance Registers & Information Barriers | Group (Compliance) | Low (audit log only) | Barriers, restricted and watch lists, conflicts register, gifts register, STR, audit views | 1 (barriers) / 2 |
| M22 | Reporting, Dashboards & MI | Group | Very high | Genesis report sources, MI pack, regulatory extracts | 1–2 |
| M23 | Client & Introducer Portal | External | Low (share links, sign links) | Authenticated portal, uploads, status tracking, statements | 3 |
| M24 | Administration, Masters & Configuration | Group | Very high | Genesis masters: BU, products, PLR, rate cards, risk factors, checklists | 1 |
| M25 | Integration Hub | Group | Medium (webhooks, adapters) | LMS, PMS/TA, OMS/CDS, FX, screening, MCIB, SMS/WhatsApp | 1–3 |

---

## 8. Detailed Module Requirements

Conventions:

- Requirement IDs are `<MODULE>-FR-nn`.
- Priority uses MoSCoW: **M**ust, **S**hould, **C**ould.
- "Reuse" names the Genesis component to extend.

---

### M01: Lead & Enquiry Management

**Purpose.** Capture every enquiry from every channel, de-duplicate it, qualify it, and route it to the right entity, team and RM within SLA.

**Reuse:** `CrmLeadIntake` (prospects), `CrmLead`, `assignment.service.js` (round_robin / rule_based / load_balanced), `lead-scoring.service.js`, `sla.service.js`, `/api/integrations/inbound/:name`, `import.service.js`.

**Channels:**

- website "Get In Touch" form
- product "Request More Info" CTAs (`?prod=`)
- Loan Calculator
- Investor Questionnaire
- phone (manual or CTI)
- shared email inbox
- walk-in at Genesis Centre or branches
- events
- referrals: introducers, Genesis insurance agents, existing clients, internal cross-entity referrals
- social (Genesis social module)
- WhatsApp (Phase 2)

| ID | Requirement | Priority |
|---|---|---|
| LEAD-FR-01 | Public intake endpoint `POST /api/public/intake/enquiry`. reCAPTCHA verification, IP rate limiting, payload schema validation, consent fields, UTM parameters, `prod` parameter, page URL, and language (EN/FR) | M |
| LEAD-FR-02 | **Product-to-entity routing matrix** (admin-configurable master). Maps each website product label (including the duplicate labels found on the current form) to `product_code`, `business_unit`, `team`, `default_queue` and `SLA policy` | M |
| LEAD-FR-03 | Duplicate detection on email, mobile (E.164 normalised), national ID or passport, and company registration number (BRN). Configurable merge or link. Matches against existing Parties as well as Leads | M |
| LEAD-FR-04 | Automatic assignment through Genesis Assignment Rules: by BU, then product, then segment (amount bands, e.g. personal loan ≥ MUR 500k), language and RM capacity. Existing-client leads go to the client's primary RM | M |
| LEAD-FR-05 | **Product-specific qualification wizards** (Genesis `UiWizard`): Real Estate Loan (purpose, property value, amount, age, income, employment type), Wealth (investable assets, horizon), Advisory (company, revenue, need), FX (currency pair, monthly volume, purpose) | M |
| LEAD-FR-06 | Lead scoring per BU (Genesis rules plus A–F grade). Example factors: amount band, existing-client flag, completeness, engagement, HNWI indicator, age-tenure feasibility (loan must end by age 65) | S |
| LEAD-FR-07 | SLA: first contact within 4 business hours (configurable per product). Warning at 75%, escalation to team lead, then BU manager (Genesis SLA escalations) | M |
| LEAD-FR-08 | Lead statuses: New → Contacted → Qualified → Converted / Disqualified (reason codes) / Nurture. Disqualification reason is mandatory | M |
| LEAD-FR-09 | Conversion creates or links a **Party**, creates a **Client Relationship** for the BU (status Prospect), and creates a product **Opportunity** or **Application**. Reuse `CrmLeadConversion` | M |
| LEAD-FR-10 | Calculator lead capture: an embeddable EMI/eligibility calculator posts inputs (amount, tenure, age, rate) with optional contact details. Anonymous sessions are kept as web events | S |
| LEAD-FR-11 | Investor questionnaire submission creates a Lead plus a provisional Risk Profile (see M04) with the score and model portfolio (A–E) | M |
| LEAD-FR-12 | Automatic acknowledgement email or SMS in EN/FR, with product-specific next steps and a document checklist link | S |
| LEAD-FR-13 | Bulk lead import (events, purchased lists) through Genesis CSV import with dedupe and a consent-source attribute | M |
| LEAD-FR-14 | Lead source attribution: channel, campaign, introducer and referring entity. Feeds M18 ROI and M19 commissions | M |
| LEAD-FR-15 | Internal referral: any user can refer a client or lead to another BU (e.g. Wealth to Loans). The referral is tracked with the referrer's credit and SLA | M |

**Key fields (Lead):** `lead_no` (LD-YYYY-NNNNNN), `party_type` (Individual/Organisation), names, `email`, `mobile_e164`, `preferred_language`, `country_of_residence`, `product_code`, `business_unit`, `channel`, `source_detail`, `utm_*`, `estimated_amount`, `currency_code`, `consent_marketing`, `consent_timestamp`, `consent_text_version`, `score`, `grade`, `owner_id`, `status`, `disqualify_reason`.

---

### M02: Client 360 & Party Master

**Purpose.** One golden record per real-world person or organisation. All relationships, holdings, applications, interactions, documents and compliance status are visible according to permissions and barriers.

**Reuse:** `CrmAccount` / `CrmContact` (map to the Party sub-types), `CrmAssociation` (polymorphic links with `assoc_type`), `ActivityTimeline`, `DocumentPanel`, `ClientDetails` component.

| ID | Requirement | Priority |
|---|---|---|
| C360-FR-01 | **Party** entity with sub-types **Individual** (name, DOB, gender, nationality, NIC/passport, tax residency, occupation, employer, income band, source of wealth) and **Organisation** (legal name, BRN, incorporation country/date, legal form, sector, revenue band, listed or unlisted, regulated status) | M |
| C360-FR-02 | **Party relationships:** spouse, dependant, director, shareholder (with %), ultimate beneficial owner (UBO), authorised signatory, guarantor, power of attorney, introducer, employer. Uses `CrmAssociation` with typed roles and validity dates | M |
| C360-FR-03 | **Households / client groups** (family office, corporate group) with aggregated relationship value | S |
| C360-FR-04 | **Client Relationship (per BU)** with status (Prospect / Onboarding / Active / Dormant / Closed / Exited), primary RM, service team, segment (Retail / Affluent / HNW / UHNW / Corporate / Institutional), start date, KYC status and risk rating snapshot | M |
| C360-FR-05 | **Client 360 page** with these widgets: profile; KYC and risk badge; consents; relationships graph; **product holdings by BU** (loans, mandates, fund holdings, securities account, FX facility, advisory mandates); open applications and opportunities; service requests; activity timeline; documents; next-best actions; total relationship value (TRV) in MUR and USD | M |
| C360-FR-06 | Each holdings widget is permission- and barrier-aware. Hidden data shows as "Restricted: contact Compliance", not as an empty list | M |
| C360-FR-07 | Contact points: multiple addresses (residential, correspondence, registered) and phones, with verification status and preferred channel | M |
| C360-FR-08 | Party merge with full audit and re-pointing of child records. Unmerge within 30 days | S |
| C360-FR-09 | Key dates: birthdays, loan maturity, FMB 2029 maturity, mandate review, KYC review, ID expiry. These trigger reminders | M |
| C360-FR-10 | VIP / sensitivity flags (staff, PEP, celebrity, board member) that restrict visibility to named users | M |
| C360-FR-11 | Global search across Parties by name, ID, phone, email, BRN, account numbers and loan numbers. Results respect barriers | M |

---

### M03: KYC / CDD / AML Onboarding

**Purpose.** Meet FSC AML/CFT obligations (FIAMLA and FIAML Regulations 2018, the FSC AML/CFT Handbook) through a risk-based onboarding and ongoing-monitoring workflow that is shared across BUs.

**Reuse:** DMS categories and checklists (`UiDocumentCategory`, `UiDocumentChecklist`), workflow `approval` steps, SLA, `StatusEvent`/`status_tracker`, e-signature, `AuditLog`.

| ID | Requirement | Priority |
|---|---|---|
| KYC-FR-01 | **KYC Case** per Party (and, where needed, per BU relationship) with lifecycle: Initiated → Documents Pending → Under Verification → Screening → Risk Assessed → Pending Approval (MLRO for high risk) → Approved / Rejected / On Hold | M |
| KYC-FR-02 | Configurable **document checklists** by party type, nationality, residency, risk level and product. For example: Individual needs ID, proof of address (< 3 months) and source-of-funds evidence. Corporate needs certificate of incorporation, constitution, register of directors and shareholders, UBO declarations, and board resolution | M |
| KYC-FR-03 | **Sanctions, PEP and adverse-media screening** through an adapter (e.g. LSEG World-Check, Dow Jones, ComplyAdvantage, LexisNexis). Screening runs on onboarding, on name or ID change, and through daily batch rescreening. Hits are triaged as true match, false positive or escalate | M |
| KYC-FR-04 | **Customer risk rating engine.** Weighted factors: geography (FATF lists), product risk, channel (face-to-face or not), occupation and industry, PEP, ownership complexity, transaction profile. Result is a Low / Medium / High score with an override reason. Weights are versioned and stored as master data | M |
| KYC-FR-05 | **Enhanced due diligence (EDD)** path for high risk or PEP: extra documents, source of wealth, senior management approval, and MLRO sign-off | M |
| KYC-FR-06 | **Periodic review scheduler:** High every 1 year, Medium every 3 years, Low every 5 years (configurable). Also event-driven reviews (trigger events). Uses Genesis `scheduled` workflows | M |
| KYC-FR-07 | ID and document expiry tracking, with automatic requests to the client (email, SMS or portal upload link) | M |
| KYC-FR-08 | **KYC reuse across BUs.** An approved KYC can be relied on by another Genesis entity if it is within validity and risk appetite, with a documented reliance record. Product-specific add-ons still apply (e.g. suitability for SEC and WLT) | S |
| KYC-FR-09 | FATCA and CRS self-certification capture, tax residency, and TIN validation | M |
| KYC-FR-10 | **Suspicious Transaction Report (STR) register.** Internal reports raised by any user and visible only to the MLRO. Status tracking for filing with the FIU Mauritius. Strict "no tipping-off" access controls | M |
| KYC-FR-11 | Onboarding blocks: no account activation, loan disbursement, fund subscription or trade until KYC is Approved. Enforced as a workflow condition plus a service-level guard | M |
| KYC-FR-12 | Video-KYC / e-KYC (selfie match, document OCR) for remote onboarding | C |

---

### M04: Investor Profiling & Suitability

**Purpose.** Digitise the website's investor questionnaire and make suitability defensible for wealth, funds and trading advice.

| ID | Requirement | Priority |
|---|---|---|
| SUIT-FR-01 | Configurable **risk questionnaire engine**: versioned questions, answer weights, and score bands mapped to **model portfolios A–E** (as on the website) and to a risk profile (Conservative to Aggressive) | M |
| SUIT-FR-02 | Inputs captured: investment horizon, risk tolerance, knowledge and experience (product classes), financial situation (income, net worth, liquidity needs), objectives, ESG preference | M |
| SUIT-FR-03 | **Suitability record** per recommendation: client profile version, product or portfolio recommended, rationale, risks disclosed, client acknowledgement (e-sign) | M |
| SUIT-FR-04 | **Mismatch alerts:** a product's risk rating above the client's profile blocks the recommendation or requires a documented override and acknowledgement (e.g. Global Private Equity Fund for a conservative profile) | M |
| SUIT-FR-05 | Profile refresh at least every 2 years, and on any significant life event recorded on the Party | S |
| SUIT-FR-06 | Client classification (retail / professional / institutional or sophisticated investor) under FSC rules, with evidence | M |

---

### M05: Retail Loan Origination (Real Estate, Personal, Investment-Backed)

**Purpose.** Take a borrower from enquiry to disbursement with transparent status, document control, credit decisioning and security perfection.

**Reuse pattern (insurance → lending):**

| Insurance artefact | Lending equivalent |
|---|---|
| `InsuranceApplication` + `SubmissionChecklist` | `LoanApplication` + `LoanDocumentChecklist` |
| `UnderwritingCase` + `UnderwritingRequirement` | `CreditAppraisal` + `CreditCondition` |
| `QuoteScenario` / calculation engine | `LoanOffer` scenarios / pricing and eligibility engine |
| `InsurancePolicy` + status history | `LoanAccount` (CRM view) + status history |
| `BillingSchedule` | `RepaymentScheduleSnapshot` (from LMS) |
| `UnderwritingCaseReview` page | Credit Appraisal workbench |

**Pipeline stages** (Genesis `UiPipeline`; Kanban moves trigger domain actions through the `#syncPipelineStage` pattern):

```
Enquiry → Pre-Qualified → Application Captured → Documents Pending → Documents Complete
→ Credit Appraisal → Credit Committee / Approval → Offer Issued → Offer Accepted
→ Security & Insurance Perfection → Ready for Disbursement → Disbursed
   (exits: Declined, Withdrawn, Lapsed)
```

| ID | Requirement | Priority |
|---|---|---|
| LOAN-FR-01 | **Loan application** (LA-YYYY-NNNNNN): product (Real Estate / Personal / Investment-Backed), purpose sub-type (purchase residential property, purchase construction lot, renovation, real-estate investment, car, education, wedding, travel, other), amount, currency (MUR by default), tenure, repayment type (amortising, interest-only, moratorium period), applicants (primary and co-borrowers, with relationship), guarantors | M |
| LOAN-FR-02 | **Eligibility engine** (configurable rules, versioned): age at maturity ≤ 65; tenure ≤ 30 years (Real Estate) or ≤ 10 years (Personal and Investment-Backed); personal loan minimum MUR 500,000; loan-to-value ≤ product maximum (up to 100% of project cost for Real Estate, subject to policy); debt-service ratio (DSR/DTI) ≤ threshold; Investment-Backed only for existing WLT/FND/SEC clients | M |
| LOAN-FR-03 | **Pricing engine:** rate = Genesis PLR ± product margin (e.g. Real Estate PLR − 0.675%, Personal PLR + 0.175%, Investment-Backed PLR − 0.175%), with an approval matrix for discretionary spread changes. Stores the PLR version at offer time | M |
| LOAN-FR-04 | **EMI / affordability calculator** inside the application, with scenario comparison (tenure vs. EMI vs. total interest), reusing the Quote Scenario comparison UI | M |
| LOAN-FR-05 | **Income and obligations capture:** salaried (payslips, employer), self-employed (financials, tax returns), rental income, existing liabilities (MCIB report), bank statement summary | M |
| LOAN-FR-06 | **Credit bureau** pull from MCIB (Mauritius Credit Information Bureau), with consent captured and the report stored as a DMS document. Structured fields extracted where an API is available | S |
| LOAN-FR-07 | **Document checklist** per product and applicant type, with client upload links (Genesis share and upload links), verification status per document, and automatic reminders for missing documents | M |
| LOAN-FR-08 | **Credit appraisal workbench:** capacity and DSR calculation, collateral summary, risk grade, exceptions to policy, analyst recommendation and conditions precedent / subsequent | M |
| LOAN-FR-09 | **Approval matrix** by amount band and exception type (e.g. ≤ MUR 5m Loans Manager; ≤ MUR 20m Credit Committee; above that, Board Credit Committee). Configurable, using Genesis workflow `approval` steps with token approvals and full audit | M |
| LOAN-FR-10 | **Offer letter** generation (merge template), with e-signature by all borrowers and guarantors and an offer validity period (auto-lapse) | M |
| LOAN-FR-11 | **Security and insurance perfection** checklist: notary appointment, fixed-charge registration (first rank) at the Conservator of Mortgages, property valuation report, **life insurance and building insurance assigned to Genesis Life** (with a referral into the Genesis insurance tenant or system), pledge registration for Investment-Backed loans | M |
| LOAN-FR-12 | **Disbursement request** (single or staged for construction and renovation, with stage certificates), conditions check, maker-checker authorisation, then a hand-off to the LMS for booking (integration event `loan.disbursement_requested`, callback `loan.booked` with the account number) | M |
| LOAN-FR-13 | Status notifications to the client at each milestone (email, SMS, portal) in EN/FR | S |
| LOAN-FR-14 | TAT/SLA tracking per stage (e.g. documents complete to credit decision within 5 business days) with an SLA board view | M |
| LOAN-FR-15 | Decline handling: reason codes, compliant decline letter, and a re-application cool-off period | M |
| LOAN-FR-16 | **Investment-Backed specifics:** automatic retrieval of eligible holdings (FND units, SEC portfolio), haircut per asset class to calculate the maximum loan, and creation of a pledge instruction to the transfer agent or custodian | M |
| LOAN-FR-17 | Cross-sell prompts at offer stage: insurance (life and building), wealth account for surplus funds, FX for foreign-currency property buyers | S |

---

### M06: Commercial Lending

**Purpose.** RM-led corporate lending and refinancing, as described on the website ("a relationship manager reviews the situation, then a dedicated team").

| ID | Requirement | Priority |
|---|---|---|
| COM-FR-01 | **Credit opportunity** on `CrmOpportunity` with facility type (term loan, refinancing, revolving or working capital, bridge), amount, currency, purpose, tenor, pricing and fees | M |
| COM-FR-02 | Borrower group exposure view: aggregate exposure across the group's parties, against single-obligor and group limits | M |
| COM-FR-03 | **Credit memo builder:** company background, management, financial spreading (3 to 5 years of P&L and balance sheet, imported from Excel), ratios (DSCR, leverage, gearing, interest cover), projections, SWOT, recommendation | M |
| COM-FR-04 | **Facility structure:** multiple facilities and tranches per approval; security package; guarantors; covenants (financial and information) | M |
| COM-FR-05 | **Covenant monitoring:** schedule of test dates, compliance certificate requests, breach and waiver workflow | S |
| COM-FR-06 | Annual review and renewal pipeline, generated automatically from facility expiry | M |
| COM-FR-07 | Same approval matrix, offer and term-sheet, security perfection and disbursement flow as M05, using commercial templates | M |
| COM-FR-08 | Cross-sell hooks: FX hedging (M13), advisory for fund raising or restructuring (M12), corporate treasury money market funds (M10) | S |

---

### M07: Collateral, Security & Pledge Management

| ID | Requirement | Priority |
|---|---|---|
| COLL-FR-01 | **Collateral register:** type (residential property, land or construction lot, commercial property, fund units, securities portfolio, cash, guarantee), owner Party, description, title references, charge rank, registration details, value, valuation date, valuer | M |
| COLL-FR-02 | Many-to-many links between collateral and loans or facilities, with allocated value | M |
| COLL-FR-03 | **Revaluation scheduler** (e.g. property every 3 years; pledged securities daily via market data or PMS feed) | S |
| COLL-FR-04 | **LTV monitoring for Investment-Backed loans:** daily LTV from pledged-asset valuation. Thresholds: warning, margin call, liquidation trigger. Margin-call workflow with notification to client and RM | M |
| COLL-FR-05 | Insurance-on-collateral tracking: policy number, insurer (Genesis or other), sum insured, expiry, assignment status. Renewal reminders. Breach if it lapses | M |
| COLL-FR-06 | Release of security on loan closure, with a discharge document workflow | S |

---

### M08: Loan Servicing View & PLR Change Management

The CRM provides a service view only. The LMS is the system of record.

| ID | Requirement | Priority |
|---|---|---|
| SERV-FR-01 | **Loan account snapshot** (synced daily from the LMS): outstanding principal, rate, next instalment, arrears days, maturity date, status | M |
| SERV-FR-02 | **PLR master and change management:** each PLR change is recorded with an effective date. The system identifies the affected variable-rate loans, generates personalised notification letters (merge with old and new EMI where the LMS supplies them), distributes them (email, post, portal), and logs delivery | M |
| SERV-FR-03 | Service requests specific to loans: early settlement quote, partial prepayment, tenure change, moratorium request, statement request, change of debit account, release of title deeds. All tracked as M16 cases with SLAs | M |
| SERV-FR-04 | **Early-warning and collections lite:** arrears buckets (1–30, 31–60, 61–90, 90+) from the LMS; tasks for the RM or collections officer; promise-to-pay logging; escalation | S |
| SERV-FR-05 | Maturity and renewal pipeline: loans nearing maturity create retention or new-need opportunities | C |

---

### M09: Wealth Management Mandates & Reviews

| ID | Requirement | Priority |
|---|---|---|
| WLT-FR-01 | **Mandate pipeline:** Prospect → Discovery Meeting → Risk Profiling (M04) → Proposal (Investment Policy Statement / IPS) → Mandate Signed → Account Funded → Active | M |
| WLT-FR-02 | Mandate record: type (discretionary, advisory, execution-only), model portfolio (A–E), base currency, benchmark, investment restrictions (ESG, exclusions), fee schedule (management fee %, performance fee, minimum fee), custodian, portfolio manager | M |
| WLT-FR-03 | **AUM snapshot** synced from the PMS (daily or monthly): market value by asset class, performance (MTD/YTD/since inception) and flows. Shown in Client 360 and dashboards | M |
| WLT-FR-04 | **Review cycle scheduler** (quarterly, semi-annual or annual by segment), with a meeting-preparation pack (holdings, performance, suitability check, notes from the last review) and minute capture | M |
| WLT-FR-05 | **Monthly client report distribution:** the PMS generates the PDF, the CRM ingests it into DMS and distributes it by secure link or portal, and tracks opens. Reuses DMS share links and view analytics | S |
| WLT-FR-06 | **Strategic Asset Allocation Committee (SAAC)** decisions log, with the impact on model portfolios and a bulk client communication workflow | C |
| WLT-FR-07 | Inflow/outflow tracking: top-ups and withdrawals as service requests, with approvals | M |
| WLT-FR-08 | Attrition-risk signals: declining AUM, missed reviews, complaints, inactivity. These raise RM tasks | S |

---

### M10: Fund Distribution & Investor Servicing (Genesis Global Funds)

| ID | Requirement | Priority |
|---|---|---|
| FND-FR-01 | **Fund and share-class master:** fund, class, currency, ISIN or internal code, risk rating (for suitability), minimum investment, fees, dealing frequency, cut-off time, documents (prospectus, factsheet, KIID-equivalent) | M |
| FND-FR-02 | **Subscription / redemption / switch requests:** captured by the RM or (later) on the portal. Includes KYC and suitability checks, payment proof upload, cut-off validation and maker-checker. Handed off to the transfer agent through an integration event | M |
| FND-FR-03 | **Holdings snapshot** per investor (units, NAV, value, currency) synced from the TA. NAV history for factsheets. This also fixes the "NAV shows 0" display issue on the website by providing a reliable NAV API | M |
| FND-FR-04 | **Product campaigns,** e.g. the Fixed Maturity Bond 2029: subscription window, target raise, allocation tracking, investor list, and a maturity communications plan | S |
| FND-FR-05 | Distributor and intermediary tracking (if third parties distribute the funds), with trail commission linked to M20 | C |
| FND-FR-06 | Dividend and distribution notices: bulk communication to unitholders, linked to News & Media notices | S |

---

### M11: Securities Account & Trading Client Management (Genesis CMB Securities)

| ID | Requirement | Priority |
|---|---|---|
| SEC-FR-01 | **Trading account opening pipeline:** KYC (M03), suitability or appropriateness (M04), account agreement e-sign, CDS account creation request, OMS account creation, trading limits | M |
| SEC-FR-02 | Account record: type (individual, joint, corporate, nominee), markets (SEM local, international), CDS account number, custodian, settlement bank, trading limits, authorised instructors | M |
| SEC-FR-03 | **Client order intake log** (for phone or email instructions): time-stamped capture, instrument, side, quantity, price type, voice-recording reference, and hand-off to the OMS. Not a replacement for the OMS | S |
| SEC-FR-04 | Underwriting and IPO / bond-issue participation: investor indication-of-interest capture (shared with M12 bookbuilding, subject to barrier rules) | S |
| SEC-FR-05 | Market statistics and research distribution lists, with consent and opt-in per product type | C |
| SEC-FR-06 | Dormant-account monitoring and reactivation campaigns | C |

---

### M12: Corporate Advisory Mandates & Deal Management (Genesis Corporate Advisors)

| ID | Requirement | Priority |
|---|---|---|
| ADV-FR-01 | **Mandate pipeline:** Origination → Pitch → **Conflict Check** → Engagement Letter → Execution → Completion / Abandoned. Service lines: Fund Raising (debt, bond, equity), Valuation (PPA, IP, MTM, ESOP, tax, disputes, M&A, IPO), Business Plan and Market Research, Restructuring (formation, liquidation, recap, viability, turnaround) | M |
| ADV-FR-02 | **Conflict-of-interest check** before engagement: searches the Party master, all BU relationships, open mandates and the restricted list. Compliance clears or declines. Result stored as an audit artifact | M |
| ADV-FR-03 | **Deal record:** project code name (deals must be referenced by code name in all non-barrier views), client, counterparties, deal team, deal value, currency, fee structure (retainer, success fee %, milestone fees), key dates | M |
| ADV-FR-04 | **Insider list** per deal: everyone who received inside information, with date, time and reason. Automatically adds deal team members. Exportable for the regulator | M |
| ADV-FR-05 | **Investor bookbuilding** (fund raising): investor universe (institutions, pension funds, insurers, HNWIs) with targeting, NDA tracking, information memorandum (IM) distribution through DMS share links with view analytics, indications of interest, commitments and allocations | M |
| ADV-FR-06 | **Deliverables and milestones:** valuation reports, business plans, models. Version-controlled in DMS, with review and approval | M |
| ADV-FR-07 | Time and effort capture per mandate (optional) for profitability analysis | C |
| ADV-FR-08 | Fee invoicing triggers (milestone reached, so the fee is due) and an accounting hand-off. Tracked in M20 | S |
| ADV-FR-09 | Closed-deal tombstones and credentials library for future pitches | C |

---

### M13: Forex Desk CRM (Genesis Forex)

| ID | Requirement | Priority |
|---|---|---|
| FX-FR-01 | **FX client profile:** purpose of FX (imports, exports, education, property abroad, investment), expected monthly volume, currency pairs, settlement accounts, approved products (spot, forward, swap), credit or settlement limits | M |
| FX-FR-02 | **Indicative rate board** (from the dealing system), shown in the CRM and publishable to the website rates page through an API | S |
| FX-FR-03 | **Quote and deal capture hand-off:** client requests a quote, dealer quotes, client accepts, deal reference is returned from the dealing system. Includes a time-stamped audit for best execution | S |
| FX-FR-04 | **Rate alerts:** client-requested target-rate alerts, sent by email or SMS when hit | C |
| FX-FR-05 | Forward maturity calendar: reminders for settlement and roll-over opportunities | S |
| FX-FR-06 | Bank of Mauritius regulatory reporting extracts (transaction purpose codes) | S |
| FX-FR-07 | Corporate hedging opportunity flags from commercial lending (foreign-currency exposure) | C |

---

### M14: Cross-Sell & Opportunity Management

| ID | Requirement | Priority |
|---|---|---|
| XS-FR-01 | Unified **Opportunity** (`CrmOpportunity`) with BU, product, amount, currency, probability, stage, expected close, forecast category. Per-BU pipelines | M |
| XS-FR-02 | **Next-best-action rules engine** (configurable conditions on the Party, holdings and events). Examples: <br>• fund holder with value ≥ X and no loan → offer Investment-Backed Loan<br>• Real Estate borrower → offer Wealth or Money Market Fund for the surplus<br>• corporate borrower with foreign-currency revenue → offer FX hedging<br>• FMB 2029 holder near maturity → offer a reinvestment proposal<br>• HNW with a personal loan only → offer a Wealth discovery meeting | M |
| XS-FR-03 | **Inter-entity referral** with dual credit (referrer RM and receiving RM), referral SLA, and outcome tracking | M |
| XS-FR-04 | Forecasting and quotas per RM, team and BU, reusing `ForecastService` and `Quota` with multi-currency (MUR base) | S |
| XS-FR-05 | Share-of-wallet view: client's estimated investable assets vs. AUM held | C |

---

### M15: RM Workbench, Activities & Calendar

| ID | Requirement | Priority |
|---|---|---|
| RM-FR-01 | **RM home** (based on the Genesis Agent Workbench): my tasks, overdue follow-ups, SLA breaches, today's meetings, reviews due, KYC expiring, NBA suggestions, pipeline summary, birthday list | M |
| RM-FR-02 | Activity logging: calls, meetings, emails, WhatsApp (Phase 2), notes. Structured meeting-note templates (discovery meeting, review meeting, credit visit) | M |
| RM-FR-03 | Calendar sync (Microsoft 365 / Google) both ways, and Outlook email logging add-in | S |
| RM-FR-04 | Click-to-call with call logging; CTI integration where available | C |
| RM-FR-05 | Mobile-responsive UI for client visits; a PWA with offline notes | S |
| RM-FR-06 | Team view for managers: activity volume, pipeline movement, SLA compliance per RM | M |

---

### M16: Service Requests & Complaints

**Reuse:** `CrmCase`, SLA engine (business hours, holidays, escalations), email-to-case.

| ID | Requirement | Priority |
|---|---|---|
| SR-FR-01 | **Service request catalogue** per BU, each with its own form, checklist, SLA and approval. Examples: address change, statement request, early settlement quote, redemption, top-up, FX settlement query, certificate of balance, title release | M |
| SR-FR-02 | Channels: email-to-case, phone, walk-in, portal (Phase 3), WhatsApp (Phase 2) | M |
| SR-FR-03 | **Complaints register** aligned with FSC expectations: acknowledgement within a defined time, investigation, final response, root-cause category, redress, escalation to the Ombudsperson for Financial Services where applicable. Kept separate from routine service requests | M |
| SR-FR-04 | Complaint MI: volumes, ageing, root causes, BU, product. Board and regulatory reports | M |
| SR-FR-05 | Client satisfaction survey (CSAT/NPS) on closure | C |

---

### M17: Document Management & E-Signature

**Reuse:** The Genesis DMS in full: upload with SHA-256 dedupe, versioning, folders, full-text extraction, categories (MIME, size, retention, review), checklists, merge templates, share links with analytics, native e-signature with an audit certificate, and the multi-cloud `StorageProvider`.

| ID | Requirement | Priority |
|---|---|---|
| DOC-FR-01 | Genesis **document taxonomy** (categories): KYC/ID, Proof of Address, Source of Funds/Wealth, Corporate Docs, Financial Statements, Bank Statements, Property and Title, Valuation, Insurance, Offer and Facility Letters, Security Docs, Mandates/IPS, Fund Forms, Account Agreements, Engagement Letters, Deal Documents (barrier-protected), Correspondence, Complaints | M |
| DOC-FR-02 | Retention schedules per category (e.g. AML records kept at least 7 years after the relationship ends), legal hold, and a defensible deletion log | M |
| DOC-FR-03 | **Merge templates** (EN/FR): acknowledgement, document request, offer letter, decline letter, PLR change notice, mandate agreement, IPS, engagement letter, NDA, margin call notice, KYC refresh request | M |
| DOC-FR-04 | Secure client upload links, tied to a specific checklist item, with an expiry date and malware scanning | M |
| DOC-FR-05 | **Barrier-aware document access:** deal documents visible only to deal-team members and Compliance | M |
| DOC-FR-06 | Field-level encryption, or an encrypted storage bucket, for ID documents | M |
| DOC-FR-07 | OCR and data extraction for IDs, payslips and bank statements (IDP, intelligent document processing) | C |

---

### M18: Marketing, Campaigns & Consent

Note: the Campaigns domain was removed from the Genesis schema in July 2026 and has to be rebuilt here.

| ID | Requirement | Priority |
|---|---|---|
| MKT-FR-01 | **Consent and preference centre:** consent per purpose (marketing, research and newsletters, profiling, data sharing within Genesis Group) and per channel (email, SMS, WhatsApp, phone, post), with source, timestamp, text version and withdrawal. Mauritius DPA 2017 compliant | M |
| MKT-FR-02 | **Segments:** dynamic lists built with the report-builder filter trees (e.g. HNW clients with no wealth mandate; borrowers with a PLR-linked rate; FMB 2029 holders) | M |
| MKT-FR-03 | **Campaigns:** objective, BU, product, budget, channels, audience, content, schedule, response tracking, attributed leads, opportunities and revenue (ROI) | M |
| MKT-FR-04 | **Newsletter and research distribution:** weekly market highlights, press and notices, with subscription management, sends and engagement metrics | S |
| MKT-FR-05 | Events: seminars and investor briefings with registration, attendance and follow-up tasks | S |
| MKT-FR-06 | Suppression rules: no marketing to clients flagged do-not-contact, without consent, or under a complaint or collections hold | M |
| MKT-FR-07 | Social: reuse the Genesis social module (Facebook, LinkedIn, Instagram, YouTube) once the live connectors are built (see §14) | C |

---

### M19: Introducer & Partner Management (Phase 3)

| ID | Requirement | Priority |
|---|---|---|
| INT-FR-01 | Introducer onboarding: KYC of the introducer, agreement, allowed products, commission plan. Follows the `ProducerAppointment` pattern | M |
| INT-FR-02 | Referral submission through the portal or a unique link. Protection window for attribution. Status visibility limited to the introducer's own referrals and to what the client has consented to share | M |
| INT-FR-03 | Commission calculation on disbursed or funded volume, with clawback rules. Reuse the `CommissionEntry` / `CommissionStatement` splits and reconciliation | S |
| INT-FR-04 | Internal Genesis Group insurance agents as referral sources (cross-group referral programme) | S |

---

### M20: Fees, Revenue & Commission Tracking

| ID | Requirement | Priority |
|---|---|---|
| REV-FR-01 | **Revenue lines:** loan arrangement and processing fees, interest income (from the LMS, summary only), management and performance fees (WLT, FND), brokerage (SEC), advisory retainers and success fees (ADV), FX spread income (FX) | M |
| REV-FR-02 | Revenue attribution to Party, RM, BU and product, with split credit for referrals | M |
| REV-FR-03 | Advisory fee schedules and milestone invoicing triggers, plus invoice status from accounting | S |
| REV-FR-04 | RM incentive calculation support: exports, not payroll | C |
| REV-FR-05 | Revenue reconciliation against finance figures (variance report). Reuse the commission reconciliation pattern | C |

---

### M21: Compliance Registers & Information Barriers

| ID | Requirement | Priority |
|---|---|---|
| CMP-FR-01 | **Information barrier engine:** define walls between groups (e.g. ADV private side vs. SEC/WLT public side). Records tagged with a barrier zone (e.g. Advisory Mandate, Deal Document, Insider List) are invisible across the wall in lists, search, reports, dashboards, AI Ask, exports, notifications and the audit UI. Enforced in the service and data layer | M |
| CMP-FR-02 | **Wall-crossing workflow:** a request to bring a public-side person over the wall, approved by Compliance, time-bound, automatically added to the insider list, and audited | M |
| CMP-FR-03 | **Restricted list and watch list:** securities and issuers. Restricted list is visible to all and blocks or warns on SEC order intake and WLT trade ideas. Watch list is visible only to Compliance | M |
| CMP-FR-04 | **Conflicts register,** fed by M12 conflict checks and staff declarations | M |
| CMP-FR-05 | Gifts and hospitality register; staff personal-account dealing pre-clearance | C |
| CMP-FR-06 | Compliance dashboards: KYC overdue, high-risk clients, screening hits outstanding, open STRs (MLRO only), complaints ageing, wall-crossings, consent coverage | M |
| CMP-FR-07 | **Immutable audit:** all create, update, delete and view-sensitive events (viewing PEP, STR or deal data) go to an append-only audit store with tamper-evidence (hash chain). Extends Genesis `AuditLog`, including **permission-change auditing** (a current Genesis gap) | M |
| CMP-FR-08 | Regulatory and data-subject requests: DPA access, rectification, erasure (subject to AML retention) and portability, with a 30-day SLA. Reuses `DataExportRequest` | M |

---

### M22: Reporting, Dashboards & MI

**Reuse:**

- Report builder: AND/OR filters, buckets, calculated measures, period comparison, drill-down, snapshots, alerts and scheduled emailed subscriptions
- 19 dashboard chart types
- "Ask Genesis"

New report sources go in `report-registry.js`. Datasets go in `analytics.service.js`.

| ID | Dashboard / report | Audience |
|---|---|---|
| RPT-01 | **Group Executive Dashboard:** new clients, TRV, AUM (WLT and FND), loan origination (volume and value), advisory pipeline, FX volumes, revenue by BU, cross-sell ratio | COO / ExCo |
| RPT-02 | Lead funnel by channel, product and BU; speed-to-lead; conversion; SLA compliance | BD, BU heads |
| RPT-03 | Lending pipeline: stage ageing, TAT per stage, approval rates, decline reasons, offer-to-disbursal conversion, PLR exposure | Loans Manager |
| RPT-04 | Loan book view (from LMS snapshots): by product, LTV band, arrears bucket, maturity profile | Loans, Risk |
| RPT-05 | Wealth: AUM and net flows, mandates won and lost, reviews completed vs. due, suitability exceptions | Investments Manager |
| RPT-06 | Funds: subscriptions and redemptions by fund, investor concentration, FMB 2029 campaign progress | Fund team |
| RPT-07 | Advisory: mandates by stage and service line, fee pipeline (weighted), win rate (barrier-aware) | ADV head |
| RPT-08 | FX: client activity, top clients, forward book maturity, rate-alert conversions | Genesis Forex MD |
| RPT-09 | Compliance MI: KYC status, risk distribution, overdue reviews, screening hits, complaints, consents | Compliance / MLRO |
| RPT-10 | RM league table and productivity: activities, meetings, pipeline created, revenue, cross-sell | Management |
| RPT-11 | Campaign ROI | Marketing |
| RPT-12 | Regulatory extracts: complaints log, FX transaction reporting, insider lists, AML statistics | Compliance |

Requirement **RPT-FR-01 (M):** all reports and the AI Ask feature must honour BU scope, hierarchy scope and information barriers. AI Ask must never surface barrier-protected records.

---

### M23: Client & Introducer Portal (Phase 3)

| ID | Requirement | Priority |
|---|---|---|
| PRT-FR-01 | Secure client login (email or mobile with OTP; MFA) as a separate auth realm from staff JWTs | M |
| PRT-FR-02 | Online loan application (prefill from the calculator), document upload against the checklist, application status tracker, offer e-sign | M |
| PRT-FR-03 | Holdings overview (loans, funds, mandates) from snapshots; statements and monthly reports download | S |
| PRT-FR-04 | Service requests and complaints submission and tracking; secure messaging with the RM | M |
| PRT-FR-05 | Consent and preferences self-service; KYC refresh self-service (upload new ID) | M |
| PRT-FR-06 | Fund subscription and redemption requests (subject to cut-offs and suitability) | C |
| PRT-FR-07 | Introducer portal: submit referrals, track status and commissions | S |

---

### M24: Administration, Masters & Configuration

**Reuse:** Genesis builder (modules, forms, pipelines, workflows, wizards, permissions, assignment, SLA, documents, email templates, roles, employees, org chart), settings service and branding.

**Genesis masters to configure:**

| Master | Key attributes |
|---|---|
| Business Units / Legal Entities | Code, legal name, licence numbers, regulator, default currency, letterhead, disclaimer text |
| Products | BU, category, code, name (EN/FR), risk rating, eligibility rule set, pricing rule, document checklist, SLA policy, approval matrix |
| Website product mapping | Website label, `?prod` value, product code, routing queue |
| Genesis PLR history | Rate, effective date, approved by |
| Rate cards / margins | Product, margin vs. PLR, validity, discretion limits per role |
| Approval matrices | BU, product, amount band, exception type, approver role(s), quorum |
| KYC risk factors and weights | Factor, value, score, version |
| Countries | ISO code, FATF status, sanctions flag, risk score |
| Risk questionnaire | Questions, answers, weights, score bands → model portfolio A–E |
| Model portfolios | A–E, description, risk level, asset allocation |
| Funds / share classes | See M10 |
| Currencies and FX reference rates | ISO 4217, daily rate to MUR |
| Collateral types and haircuts | Type, haircut %, revaluation frequency |
| Service request catalogue | Type, BU, form, SLA, approvals |
| Complaint categories / root causes | Hierarchy |
| Reason codes | Lead disqualification, loan decline, mandate loss, account closure |
| Holidays / business hours | Mauritius public holidays (via SLA business hours) |
| Branches / regions | Port Louis HQ and others; international offices |

---

### M25: Integration Hub

See §12.

---

## 9. Cross-Cutting Functional Requirements

| ID | Area | Requirement | Priority |
|---|---|---|---|
| X-01 | **Multi-currency** | Every monetary field stores `amount`, `currency_code`, `fx_rate`, `amount_base_mur`. Users can switch the display between MUR, USD and EUR. Daily FX reference rates are stored | M |
| X-02 | **Bilingual** | UI and client-facing templates in English and French; preferred language stored per Party | M |
| X-03 | **Business Unit scope** | Every client-facing record carries `business_unit_id`. Users are assigned to one or more BUs. `OperationalPermission` scopes are evaluated inside the BU (see §11) | M |
| X-04 | **Information barriers** | See CMP-FR-01. Applies everywhere, including search, AI, export and notifications | M |
| X-05 | **Maker-checker** | Configurable for sensitive actions: KYC approval, disbursement request, rate override, master-data changes, party merge | M |
| X-06 | **Status timeline** | Every domain object exposes a status history (`StatusEvent` / `status_tracker`) | M |
| X-07 | **Notifications** | In-app (existing), plus email, SMS and WhatsApp channels with templates and user preferences | M |
| X-08 | **Data masking** | NIC/passport, bank accounts and income are masked by default and revealed on click with an audit entry, for roles without the "view PII" permission | M |
| X-09 | **Bulk operations** | Bulk reassign (RM exit), bulk communications, bulk KYC refresh requests | S |
| X-10 | **Import / migration** | Migration templates for existing client lists, loan applications in progress, mandates, fund investors and KYC documents | M |

---

## 10. Data Model

### 10.1 Conventions (as in Genesis)

- Prisma models are PascalCase. Tables are snake_case plurals via `@@map`. Columns are snake_case.
- Base fields on every model:
  - `id Int @id @default(autoincrement())`
  - `tenant_id Int` with `@@index([tenant_id])`
  - `created_at`, `updated_at`, `created_by`, plus **`updated_by`** (new and mandatory for FS)
  - **`business_unit_id`** where the record is client-facing (new)
  - **`barrier_zone_id`** where applicable (new)
- Domain objects carry `record_id Int? @unique`, linking to `Record` for Kanban, metadata and EAV custom fields.
- Business numbers use the format `PREFIX-YYYY-NNNNNN`, generated through `SELECT … FOR UPDATE`.
- Soft delete (`deleted_at`, `deleted_by`) on all FS domain tables. Hard delete only through retention jobs.
- Money is stored as `Decimal(18,2)` (or `Decimal(18,6)` for units and NAV) plus `currency_code CHAR(3)`.

### 10.2 New Entities (Logical)

| Group | Entity (model) | Key fields / relations | Number prefix |
|---|---|---|---|
| Org | `BusinessUnit` | code, legal_name, licences JSON, regulator, base_currency | n/a |
| Org | `EmployeeBusinessUnit` | employee_id ↔ business_unit_id, is_primary | n/a |
| Org | `BarrierZone`, `BarrierMembership`, `WallCrossing` | zone, members, approvals, valid_from/to | WC- |
| Party | `Party` | party_type, display_name, status, segment, vip_flag, preferred_language, primary_rm_id | PTY- |
| Party | `PartyIndividual` | party_id, names, dob, nationality, id_type, id_number (encrypted), tax_residency, occupation, income_band, source_of_wealth | n/a |
| Party | `PartyOrganisation` | party_id, legal_name, brn, incorporation_country/date, legal_form, sector, revenue_band | n/a |
| Party | `PartyRelationship` | from_party_id, to_party_id, role (director/UBO/spouse/guarantor…), ownership_pct, valid_from/to | n/a |
| Party | `ContactPoint` | party_id, type, value, verified, preferred | n/a |
| Party | `ClientRelationship` | party_id, business_unit_id, status, rm_id, segment, onboarded_at, closed_at | CR- |
| Party | `ClientGroup` / `ClientGroupMember` | household / corporate group | CG- |
| Consent | `ConsentRecord` | party_id, purpose, channel, status, source, text_version, captured_at, withdrawn_at | n/a |
| KYC | `KycCase` | party_id, scope (group/BU), status, risk_rating, edd_flag, approved_by, next_review_at | KYC- |
| KYC | `KycRiskAssessment` | kyc_case_id, factor scores JSON, model_version, total, override_reason | n/a |
| KYC | `ScreeningRequest` / `ScreeningHit` | provider, list types, result, disposition, reviewer | SCR- |
| KYC | `TaxSelfCertification` | FATCA/CRS status, TINs | n/a |
| KYC | `SuspiciousTransactionReport` | party_id, raised_by, narrative (encrypted), status, fiu_reference (MLRO-only) | STR- |
| Suitability | `RiskQuestionnaire`, `RiskQuestion`, `RiskProfile` | version, answers JSON, score, model_portfolio (A–E), valid_until | RP- |
| Suitability | `SuitabilityRecord` | party_id, product/mandate ref, rationale, override, acknowledged_doc_id | SUIT- |
| Product | `FinancialProduct` | business_unit_id, category, code, risk_rating, rules refs | n/a |
| Product | `PlrRate`, `ProductRateCard` | rate, effective_from, margin, discretion limits | n/a |
| Lead | `CrmLead` (extend) | + business_unit_id, product_code, consent fields, utm JSON, introducer_id | LD- |
| Lending | `LoanApplication` | party (primary), product_id, purpose, amount, currency, tenure_months, repayment_type, moratorium_months, rate_offered, plr_rate_id, status, stage | LA- |
| Lending | `LoanApplicant` | application_id, party_id, role (primary/co-borrower/guarantor), income JSON, obligations JSON | n/a |
| Lending | `EligibilityResult` | application_id, rule_set_version, results JSON, pass/fail | n/a |
| Lending | `CreditAppraisal` | application_id, dsr, ltv, risk_grade, recommendation, analyst_id | CA- |
| Lending | `CreditCondition` | appraisal_id, type (CP/CS), text, status | n/a |
| Lending | `CreditApproval` | appraisal_id, level, approver, decision, conditions, timestamp | n/a |
| Lending | `LoanOffer` | application_id, amount, rate, tenure, emi, fees, valid_until, signed_at | OF- |
| Lending | `Disbursement` | application_id, tranche_no, amount, conditions_met, maker, checker, lms_reference, status | DB- |
| Lending | `LoanAccountSnapshot` | lms_account_no, party_id, outstanding, rate, arrears_days, maturity, synced_at | n/a |
| Lending | `CommercialFacility`, `Covenant`, `CovenantTest` | facility structure and monitoring | CF- |
| Collateral | `Collateral`, `CollateralLink`, `CollateralValuation`, `CollateralInsurance`, `Pledge` | register, allocation, valuations, insurance, pledge status | COL- |
| Lending | `PlrChangeEvent`, `PlrNotification` | event, affected accounts, delivery log | PLR- |
| Wealth | `WealthMandate` | party_id, type, model_portfolio, base_ccy, fee_schedule JSON, pm_id, status | WM- |
| Wealth | `MandateReview` | mandate_id, due_at, held_at, minutes_doc_id, outcome | n/a |
| Wealth | `AumSnapshot` | mandate_id / party_id, as_of, market_value, by_asset_class JSON, perf JSON | n/a |
| Funds | `Fund`, `FundShareClass`, `NavHistory` | master data, NAV | n/a |
| Funds | `FundOrderRequest` | party_id, class_id, type (sub/red/switch), amount/units, cut_off_date, status, ta_reference | FO- |
| Funds | `FundHoldingSnapshot` | party_id, class_id, units, nav, value, as_of | n/a |
| Securities | `SecuritiesAccount` | party_id, type, cds_account_no, markets, limits, status | SA- |
| Securities | `ClientOrderLog` | account_id, instrument, side, qty, price_type, received_at, channel, oms_ref | OL- |
| Advisory | `AdvisoryMandate` | code_name, client_party_id, service_line, fee_structure JSON, barrier_zone_id, status | ADV- |
| Advisory | `ConflictCheck` | mandate_id, matches JSON, decision, cleared_by | CC- |
| Advisory | `DealTeamMember`, `InsiderListEntry` | mandate_id, employee/party, added_at, reason | n/a |
| Advisory | `InvestorTarget` | mandate_id, party_id, nda_status, im_shared_at, ioi_amount, commitment, allocation | n/a |
| FX | `FxClientProfile`, `FxQuote`, `FxDealRef`, `FxRateAlert` | profile, quote/deal hand-off, alerts | FXQ- |
| Cross-sell | `NbaRule`, `NbaSuggestion`, `Referral` | rule conditions JSON, suggestion status, referral credit | REF- |
| Service | `CrmCase` (extend) | + business_unit_id, request_type_id, is_complaint, root_cause, redress | SR- / CMP- |
| Marketing | `Campaign`, `CampaignMember`, `Segment`, `Subscription`, `Event`, `EventRegistration` | rebuilt marketing domain | CMPN- |
| Partners | `Introducer`, `IntroducerAgreement`, `IntroducerReferral` | plus reuse `CommissionEntry` | INT- |
| Revenue | `RevenueEntry` | party, BU, product, type, amount, ccy, period, rm credit split | n/a |
| Compliance | `RestrictedListEntry`, `WatchListEntry`, `ConflictRegisterEntry`, `GiftRegisterEntry` | compliance registers | n/a |
| Audit | `ImmutableAuditEvent` | hash, prev_hash, actor, action, entity, payload, sensitivity | n/a |
| Integration | `ExternalSyncJob`, `ExternalReference` | system, entity, external_id, last_sync, status | n/a |

### 10.3 Core Relationships (Conceptual ERD)

```
BusinessUnit 1─* ClientRelationship *─1 Party 1─* PartyRelationship *─1 Party
                                         │
             ┌───────────────┬───────────┼──────────────┬───────────────┬─────────────┐
             ▼               ▼           ▼              ▼               ▼             ▼
          KycCase      RiskProfile  LoanApplication  WealthMandate  FundOrderRequest  AdvisoryMandate
             │               │        │   │   │          │               │             │  (barrier zone)
     ScreeningHit   SuitabilityRecord │   │   └─ LoanOffer ─ Disbursement ─> LoanAccountSnapshot
                                      │   └─ CreditAppraisal ─ CreditApproval
                                      └─ LoanApplicant / CollateralLink ─ Collateral ─ Pledge
Party 1─* ConsentRecord | Party 1─* CrmCase | Party 1─* Opportunity/Referral/NbaSuggestion
Every entity ── record_id ──> Record (Kanban, EAV custom fields, AuditLog, Activities, Documents)
```

---

## 11. Roles and Permission Matrix

### 11.1 Role Mapping to the Genesis Role Ladder

| Genesis level | Genesis roles (custom `Role` rows, levels ≥ 6 for custom where required) |
|---|---|
| 2 `super_admin` | CRM System Owner |
| 3 `admin` | CRM Administrator; Compliance Head (with special permissions) |
| 4 `manager` | COO; BU Heads (Loans & Fixed Income Manager, Investments Manager, Head of Trading, Advisory Head, Forex MD); Team Leaders |
| 5 `user` | RMs, Loans Executives, Portfolio/Fund Managers, Traders, Advisors, FX Dealers, Credit Analysts, Compliance Officers, Operations |
| 6+ custom | MLRO (special), Credit Committee Member, Read-only Auditor, Marketing, Introducer (external), Client (external portal realm) |

### 11.2 Access Model: Three Layers

1. **BU scope (new).** A user sees records only for the BUs they belong to, plus cross-BU Party basics (name and RM) for the Client 360. Holdings in other BUs are visible only with the `c360.cross_bu_view` permission (RMs by default; can be restricted).
2. **Operational scope (existing):** `own | team | hierarchy | all` within the BU, through `OperationalPermission` and the `EmployeeHierarchy` closure table.
3. **Barrier zone (new).** Overrides both of the above. Barrier records are visible only to zone members and Compliance.

### 11.3 Indicative CRUD Matrix

V = view, C = create, E = edit, A = approve, — = none. Scope follows in brackets.

| Object | RM | Loans Exec | Credit Analyst | Loans Mgr | PM / Fund Mgr | Trader | Advisor | FX Dealer | Compliance | MLRO | COO |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Lead | VCE (own/team) | VCE (BU) | V | VCE (BU) | VCE (BU) | VCE (BU) | VCE (BU) | VCE (BU) | V (all) | V | V (all) |
| Party / Client 360 | VCE (own) | VCE (BU) | V (BU) | V (BU) | VCE (BU) | VCE (BU) | VCE (BU, barrier) | VCE (BU) | V (all) | V (all) | V (all) |
| KYC Case | VC | VC | V | V | VC | VC | VC | VC | VEA | VEA | V |
| STR | C | C | C | C | C | C | C | C | — | VEA | — |
| Loan Application | VC (own) | VCE (BU) | VE | VEA | — | — | — | — | V | V | V |
| Credit Approval | — | — | VC | A (≤ limit) | — | — | — | — | V | — | A (CC) |
| Wealth Mandate | VCE (own) | — | — | — | VCE (BU) | V | — | — | V | V | V |
| Fund Order | VC | — | — | — | VCEA | — | — | — | V | V | V |
| Advisory Mandate | — | — | — | — | — | — | VCE (zone) | — | V (all) | V | V (summary, code name) |
| Restricted List | V | V | V | V | V | V | V | V | VCE | V | V |
| FX Profile / Quote | V | — | — | — | — | — | — | VCE | V | V | V |
| Complaints | VC | VC | — | VE | VC | VC | VC | VC | VEA | V | V |
| Masters / Config | — | — | — | — | — | — | — | — | partial | — | — (Admin only) |

Field-level restrictions use `UiPermission`, for example: income and net worth, ID numbers, internal credit grade, and STR existence (never visible outside the MLRO's view).

---

## 12. Integrations

| # | System | Direction | Purpose | Mechanism (Genesis-aligned) | Phase |
|---|---|---|---|---|---|
| I-01 | **Website** (genesis-capital.demo) | In | Enquiries, calculator, questionnaire, newsletter signup | Public intake API (new, rate-limited, reCAPTCHA) | 1 |
| I-02 | **Website** | Out | NAV feed, FX indicative rates, PLR | Read-only public API with cache | 2 |
| I-03 | **Core Loan Management System** | Both | Book loan on disbursement; daily account snapshot; arrears | Outbound webhook event `loan.disbursement_requested`; inbound `/api/integrations/inbound/lms`; nightly batch through a durable queue | 1–2 |
| I-04 | **Portfolio Mgmt / Fund Admin / Transfer Agency** | Both | Mandates, AUM, holdings, NAV, fund orders | Adapter (based on the `CarrierAdapterConfig` / rating-adapter registry pattern) | 2 |
| I-05 | **Trading OMS and CDS** | Both | Account creation, order log hand-off, positions | Adapter / file exchange | 2 |
| I-06 | **FX dealing system** | Both | Rates, quotes, deal references | Adapter / API | 2 |
| I-07 | **Sanctions/PEP screening provider** | Both | Onboarding and batch rescreening | Adapter with a durable queue; results as `ScreeningHit` | 1 |
| I-08 | **MCIB (credit bureau)** | Out/In | Credit reports | Adapter with a consent check | 2 |
| I-09 | **Genesis insurance systems** (Genesis Life / General) | Both | Referral for loan-linked insurance; policy assignment status; group-level Party matching | Webhooks; possibly a separate Genesis insurance tenant | 2 |
| I-10 | **Email** | Out/In | SMTP is available today. Add a transactional provider (open/click tracking) and inbound email-to-case | Extend `email-send.service.js`; inbound parser | 1 |
| I-11 | **SMS gateway** (local Mauritius provider) | Out | OTP, notifications | New notification channel provider | 1 |
| I-12 | **WhatsApp Business API** | Both | Notifications, conversations | Replace the simulation connector with a live Meta connector | 2 |
| I-13 | **Microsoft 365 / Google Workspace** | Both | Calendar, email logging, SSO (Entra ID) | OAuth connectors; SAML/OIDC SSO | 1–2 |
| I-14 | **Accounting / ERP** | Out | Fee invoices, revenue reconciliation | Webhook / file | 3 |
| I-15 | **Market data** | In | Securities prices for LTV monitoring; FX reference rates | Scheduled job | 2 |
| I-16 | **E-KYC / IDP provider** | Both | OCR, liveness | Adapter | 3 |

**Integration non-functionals:**

- All outbound calls are HMAC-signed and SSRF-guarded, as already implemented in the Genesis `integration.service.js`.
- Retries with backoff through the new **durable queue**.
- Idempotency keys on every inbound endpoint.
- An `ExternalReference` table for ID mapping.
- Integration health dashboard (exists in Genesis).

---

## 13. Non-Functional Requirements

| Category | Requirement |
|---|---|
| **Security** | TLS 1.2+. AES-256 at rest (RDS and S3 encryption) plus application-level encryption of sensitive PII (ID numbers, STR narratives). **MFA mandatory** for staff. SSO (Entra ID). Short access tokens with **refresh tokens and revocation** (token invalidated on user deactivation). IP allow-listing for admin. OWASP ASVS L2. Annual penetration test |
| **Privacy** | Mauritius Data Protection Act 2017, and GDPR where EU clients exist. Data protection impact assessment (DPIA) before go-live. Purpose limitation. Consent records. Data subject request (DSR) SLA of 30 days. Retention schedules |
| **Regulatory** | FSC AML/CFT Handbook; FIAMLA and FIAML Regulations 2018; Securities Act 2005; FSC complaints and conduct rules; Bank of Mauritius outsourcing and cloud guidelines (record the hosting-location decision). Evidence-ready audit trails |
| **Availability** | 99.5% in business hours (Mon–Fri 08:00–18:00 MUT), 99.0% overall. RPO ≤ 15 min, RTO ≤ 4 h. Multi-AZ RDS. Daily backups kept 35 days, plus monthly backups kept 7 years for audit |
| **Performance** | P95 API < 500 ms for record reads and < 1.5 s for list and search. Client 360 load < 2 s. Dashboards < 3 s from cache. Support 150 named users, 60 concurrent, 500k Parties and 5M activities without redesign |
| **Scalability** | Stateless API pods (ECS Fargate). Redis cache. Durable queue workers that scale independently. Read replica for reporting |
| **Auditability** | Immutable audit for sensitive events. View-audit on PEP, STR, deal and PII reveals. Admin permission-change audit |
| **Usability** | Responsive (desktop, tablet, mobile). WCAG 2.1 AA. EN/FR. Light and dark themes (existing). Keyboard-first data entry for back-office |
| **Observability** | Structured logs (pino) to central logging. Metrics (API latency, queue depth, SLA breaches). Health endpoint (exists). Alerting |
| **Data quality** | Mandatory field rules per stage. Dedupe. Address normalisation. Phone E.164. Data quality dashboard |
| **Testability** | Automated test suites for **BU isolation and information barriers** (as for the existing Genesis tenant-isolation tests). Contract tests for integrations. UAT scripts per module |
| **DevOps** | Dockerfiles, CI/CD pipeline (GitHub Actions) and infrastructure-as-code. These are documented in Genesis but not in the repo, so they must be delivered. Separate DEV / UAT / PROD. Masked data in non-prod |

---

## 14. Required Enhancements to the GenesisCRM Platform

These are platform-level changes. They benefit every Genesis tenant and must be done before or alongside the Genesis vertical.

| # | Gap in current Genesis | Enhancement | Needed for | Priority |
|---|---|---|---|---|
| E-01 | No refresh tokens; deactivation does not revoke issued tokens | Refresh tokens plus a token-revocation list (Redis); short-lived access tokens | Security | M (Ph-1) |
| E-02 | MFA and SSO not enforced (only flags in `SecurityPolicy`) | TOTP/SMS MFA enforcement; OIDC/SAML SSO (Entra ID) | Security, regulator | M (Ph-1) |
| E-03 | No durable job queue (in-process schedulers) | BullMQ on Redis for screening, sync, notifications, reports, PLR mass notices | Reliability | M (Ph-1) |
| E-04 | Single display currency | True multi-currency amounts, FX rate table, base-currency reporting | FX, funds, international | M (Ph-1) |
| E-05 | No BU / legal-entity dimension in permissions | `BusinessUnit` model, `EmployeeBusinessUnit`, a BU filter inside `OperationalPermission` evaluation and the Prisma extension | Multi-entity | M (Ph-1) |
| E-06 | No information barriers | Barrier zones enforced in the service layer, search, reports, AI Ask, notifications and exports | Advisory / Securities | M (Ph-1) |
| E-07 | Most routes lack request-body schemas | Mandatory Fastify JSON schemas for all new and touched routes | Security | M |
| E-08 | Permission changes not audited; audit not tamper-evident | Permission audit; append-only hash-chained `ImmutableAuditEvent`; view-audit | Compliance | M |
| E-09 | Notifications in-app only; no SMS; WhatsApp simulation only | Notification channel framework (email, SMS, WhatsApp) with templates and preferences | Client comms | M (SMS/email Ph-1, WhatsApp Ph-2) |
| E-10 | `LIKE`-based search | MySQL FULLTEXT or OpenSearch for Party, documents and activities, barrier-filtered | Usability at scale | S |
| E-11 | `employee_id` and email unique across the whole platform | Per-tenant uniqueness | Multi-tenant hygiene | S |
| E-12 | Campaigns, Calendar, Portal and PRM domains removed from schema | Rebuild Campaigns (M18), Calendar sync (M15), Portal (M23), Introducers (M19) as reusable platform modules | Marketing, portal | S–C |
| E-13 | No `updated_by`; soft delete only on some models | Add `updated_by` and soft delete to FS domain tables by default | Audit | M |
| E-14 | No CI/CD or Dockerfiles in the repo | Deliver the containerisation, pipelines and IaC described in `platform-operations/aws-deployment.md` | Delivery | M |
| E-15 | Language: English only (assumed) | i18n framework (react-i18next) plus FR translations; bilingual templates | Mauritius market | M |
| E-16 | Field-level encryption not present | Prisma middleware or service-level encryption for tagged PII fields | Privacy | M |
| E-17 | Maker-checker only possible through generic workflow approvals | A reusable maker-checker primitive with a pending-change diff UI | Ops control | S |

> **Mentor note.** Do E-03 (queue), E-04 (multi-currency), E-05 (BU scope) and E-06 (barriers) **first**, in a "Platform Sprint 0". Adding them after domain modules exist means touching every service and every report source. That is the most expensive kind of rework in a metadata-driven CRM.

---

## 15. Release Plan and Phasing

| Phase | Duration (indicative) | Scope | Exit criteria |
|---|---|---|---|
| **Phase 0: Foundations** | 6–8 weeks | E-01 to E-08, E-13 to E-16; Genesis tenant provisioning from a template; masters (M24); data migration design | Barrier and BU isolation test suite green; security review passed |
| **Phase 1: Core CRM and Retail Lending (MVP)** | 12–14 weeks | M01 Leads (web intake, routing, SLA), M02 Client 360, M03 KYC/AML (incl. screening adapter), M04 Suitability, M05 Retail Loan Origination, M15 RM Workbench, M16 Service Requests and Complaints, M17 DMS templates, M21 barriers and compliance basics, M22 core dashboards, I-01 / I-03 (disbursement hand-off) / I-07 / I-10 / I-11 / I-13 | Live for Loans, Wealth RMs and Compliance; website form switched to the CRM; KYC and consent on all new clients |
| **Phase 2: Investments, Advisory, FX and Servicing** | 14–16 weeks | M06 Commercial Lending, M07 Collateral and LTV, M08 Servicing and PLR changes, M09 Wealth (full), M10 Funds, M11 Securities, M12 Advisory (full barriers, insider lists, bookbuilding), M13 FX, M14 NBA engine, M18 Marketing and Consent centre, M20 Revenue; I-02 / I-04 / I-05 / I-06 / I-08 / I-09 / I-12 / I-15 | All six BUs live; group MI pack produced in the CRM |
| **Phase 3: Digital Self-Service and Ecosystem** | 10–12 weeks | M23 Client and Introducer Portal, M19 Introducers, e-KYC (I-16), accounting (I-14), AI enhancements (NBA scoring models, document IDP), advanced search (E-10) | Online loan application and portal adoption targets met |

### 15.1 MVP Definition (Phase 1)

**Must-have user journeys:**

1. A website enquiry for "Real Estate Loan" is automatically routed to the Loans team and acknowledged in EN/FR, with an SLA running.
2. A Loans Executive qualifies the lead, converts it to Party + Client Relationship + Loan Application, and sends a document upload link.
3. KYC is completed with screening and a risk rating. A high-risk case goes to the MLRO.
4. Credit appraisal goes through the approval matrix to an offer letter, e-signed, then the security checklist, then the disbursement request to the LMS.
5. An RM sees the Client 360 with KYC badge, consents, loan application status and activities.
6. Compliance sees the KYC overdue dashboard and the complaints register.
7. The COO sees the group lead funnel and the lending pipeline dashboard.

### 15.2 Data Migration Approach

- Sources: spreadsheets and email-based trackers, legacy client lists per entity, LMS/PMS/TA client masters.
- Sequence: Parties (dedupe across entities) → relationships → KYC status and documents → open applications and mandates → historical activities (optional, last 2 years).
- Tools: Genesis CSV import (field mapping, dedupe keys, preview and execute), extended with Party-matching rules and migration reconciliation reports.

---

## 16. Risks, Assumptions, Dependencies and Open Questions

### 16.1 Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| A barrier implementation leak exposes advisory MNPI (material non-public information) | Medium | Very high | Enforce at the data and service layer; automated leak tests across search, reports, AI and exports; Compliance UAT sign-off |
| Integration dependency on legacy LMS/PMS/OMS without APIs | High | High | Start with file-based batch adapters; define the canonical integration contracts early |
| Group data-sharing legal basis between Genesis entities is unclear | Medium | High | Legal opinion; DPIA; consent purpose "intra-group sharing"; BU-scoped defaults |
| RM adoption | Medium | High | Mobile UX; email and calendar sync; the RM workbench answers "what do I do today"; management uses CRM-only MI |
| Scope creep into core-system functions (LMS/PMS) | Medium | Medium | Hold to ADR-04; snapshots only |
| Genesis platform gaps (queue, currency, MFA) slip | Medium | High | Phase 0 gate; platform team ownership |

### 16.2 Assumptions

- Genesis Capital will run as a single Genesis tenant hosted on AWS (or an approved cloud), subject to an FSC / Bank of Mauritius outsourcing assessment.
- Core systems (LMS, PMS/TA, OMS, FX dealing) exist and can expose data through APIs or files.
- Product rules on the website (age 65 cap, 30-year and 10-year tenures, MUR 500k minimum, PLR margins) are current as of October 2026 and will be validated with the business.
- About 150 named internal users across six entities at go-live. This needs confirming.
- English and French are both required for client communications.

### 16.3 Open Questions for Genesis Stakeholders

1. Which core systems are used for loans, portfolio management, transfer agency, trading and FX? Which of them have APIs?
2. Is KYC currently performed **per entity** or centrally at group level? Is KYC reliance across entities legally approved?
3. What is the credit approval matrix for retail and commercial loans (amount bands, committees)?
4. Which sanctions/PEP screening provider is used today (if any)?
5. Should the CRM also serve **Genesis insurance** (Life / General) for group cross-sell, as a second tenant or in a shared group view?
6. What are the expected user volumes per BU, and are external introducers in scope for Year 1?
7. Are there international clients (Seychelles, Comoros, Zambia, Rwanda, others) that need different KYC or language rules?
8. What are the retention periods mandated by internal policy beyond the AML minimums?
9. Is a client portal or mobile app expected in Year 1, or is the RM-assisted model enough?
10. What data is published on the website from internal systems (NAVs, FX rates), and should the CRM become the publishing source?
11. What MI does the Board and ExCo currently receive, so it can be replicated in RPT-01?
12. What are the hosting constraints: data residency in Mauritius, or acceptable regions?

---

## 17. Appendices

### Appendix A: Website Product Label → CRM Routing (Initial Mapping)

| Website "I am interested in" label | Product code | BU | Default queue |
|---|---|---|---|
| Real Estate Loan | LND-RE | LND | Retail Loans |
| Personal Loan | LND-PL | LND | Retail Loans |
| Investment Backed Loans | LND-IBL | LND | Retail Loans (notify existing RM) |
| Commercial | LND-COM | LND | Commercial Lending |
| Wealth Management | WLT-DPM | WLT | Wealth RMs |
| Genesis funds (each fund listed) | FND-<fund> | FND | Fund Sales |
| Fixed Maturity Bond 2029 | FND-FMB29 | FND | Fund Sales |
| Trading Solutions / Local Investments / International Offering / Market Statistics (de-duplicate) | SEC-* | SEC | Securities Desk |
| Fund Raising | ADV-FR | ADV | Advisory (private side) |
| Valuation & Business Plan | ADV-VAL | ADV | Advisory |
| Corporate Restructuring Advisory | ADV-RES | ADV | Advisory |
| Genesis Forex | FX-GEN | FX | Forex Desk |

> The current website form contains duplicate entries (International Offering, Local Investments and Trading Solutions). Fix this at source when the form is moved to the CRM intake API.

### Appendix B: Insurance → Financial Services Pattern Mapping (Genesis Reuse Guide)

| Genesis insurance component | Genesis FS equivalent |
|---|---|
| `InsuranceCarrier` / `CarrierProduct` | `BusinessUnit` / `FinancialProduct` |
| `CarrierAdapterConfig` + rating-adapter registry | Integration adapters for LMS, PMS/TA, OMS, FX, screening |
| `calculation-engine.service.js` | Eligibility, pricing and EMI engine; KYC risk scoring; questionnaire scoring |
| `QuoteScenario` + comparison UI | Loan offer scenarios; model portfolio proposals |
| `InsuranceApplication` + `SubmissionChecklist` + readiness check | `LoanApplication` + document checklist + readiness to submit to credit |
| `UnderwritingCase` / `UnderwritingRequirement` / case review page | `CreditAppraisal` / `CreditCondition` / credit workbench |
| `InsurancePolicy` + status history | `LoanAccountSnapshot`, `WealthMandate`, `SecuritiesAccount` + status history |
| `PolicyEndorsement` (old/new JSON) | Mandate amendments, facility amendments, Party change requests |
| `RenewalTask` | Facility annual review, KYC periodic review, mandate review |
| `BillingSchedule` / `PolicyInvoice` / `PolicyPayment` | Repayment schedule snapshot, advisory fee invoices |
| `InsuranceClaim` + events | Service requests, complaints, margin calls |
| `CommissionEntry` + `CommissionStatement` + reconciliation | Introducer commissions, revenue attribution and reconciliation |
| `ProducerAppointment` | Introducer agreements; staff licence and competency register |
| `ComplianceArtifact` / declarations | KYC declarations, suitability acknowledgements, FATCA/CRS |
| Agent Workbench | RM Workbench |

### Appendix C: Proposed API Surface (Indicative, `/api/fs/*`)

| Route group | Examples |
|---|---|
| `/api/public/intake` | `POST /enquiry`, `POST /calculator-lead`, `POST /risk-questionnaire`, `POST /newsletter` |
| `/api/fs/parties` | CRUD, `/:id/360`, `/:id/relationships`, `/:id/consents`, `/merge` |
| `/api/fs/kyc` | `/cases`, `/cases/:id/screen`, `/cases/:id/assess`, `/cases/:id/approve`, `/reviews/due`, `/str` (MLRO) |
| `/api/fs/suitability` | `/questionnaires`, `/profiles`, `/records` |
| `/api/fs/lending` | `/applications`, `/applications/:id/eligibility`, `/applications/:id/price`, `/appraisals`, `/approvals`, `/offers`, `/disbursements`, `/plr`, `/plr/:id/notify` |
| `/api/fs/collateral` | `/`, `/:id/valuations`, `/pledges`, `/ltv/alerts` |
| `/api/fs/wealth` | `/mandates`, `/mandates/:id/reviews`, `/aum` |
| `/api/fs/funds` | `/funds`, `/orders`, `/holdings`, `/nav` |
| `/api/fs/securities` | `/accounts`, `/order-log` |
| `/api/fs/advisory` | `/mandates`, `/mandates/:id/conflict-check`, `/mandates/:id/insiders`, `/mandates/:id/investors` |
| `/api/fs/fx` | `/profiles`, `/quotes`, `/alerts`, `/rates` |
| `/api/fs/compliance` | `/barriers`, `/wall-crossings`, `/restricted-list`, `/watch-list`, `/conflicts`, `/audit` |
| `/api/fs/xsell` | `/nba-rules`, `/suggestions`, `/referrals` |
| `/api/fs/revenue` | `/entries`, `/attribution` |

All routes follow the Genesis conventions: `{ success, data, pagination }` envelope, typed error codes, `requireFeature('fs_*')` plan gates, JSON request schemas, tenant + BU + barrier scoping, and an audit trail.

### Appendix D: Glossary

| Term | Meaning |
|---|---|
| AML/CFT | Anti-Money Laundering / Combating the Financing of Terrorism |
| AUM | Assets Under Management |
| BU | Business Unit (a Genesis legal entity) |
| CDD / EDD | Customer Due Diligence / Enhanced Due Diligence |
| CDS | Central Depository & Settlement Co. Ltd (Mauritius) |
| DSR / DTI | Debt-Service Ratio / Debt-to-Income |
| FIAMLA | Financial Intelligence and Anti-Money Laundering Act (Mauritius) |
| FSC | Financial Services Commission, Mauritius |
| IPS | Investment Policy Statement |
| LMS | Loan Management System |
| LTV | Loan-to-Value |
| MCIB | Mauritius Credit Information Bureau |
| MLRO | Money Laundering Reporting Officer |
| MNPI | Material Non-Public Information |
| NBA | Next-Best Action |
| PEP | Politically Exposed Person |
| PLR | Prime Lending Rate (Genesis PLR) |
| SEM | Stock Exchange of Mauritius |
| STR | Suspicious Transaction Report |
| TA | Transfer Agent |
| TAT | Turnaround Time |
| TRV | Total Relationship Value |
| UBO | Ultimate Beneficial Owner |

### Appendix E: Sources

- genesis-capital.demo: Home, About Us, Our Team, Our Approach, Products & Services, Individuals and Commercial financing, Real Estate Loan, Personal Loan, Investment Backed Loans, Wealth Management, Investment Funds, Trading Solutions, Fund Raising, Valuation & Business Plan, Corporate Restructuring Advisory, Genesis Forex, News & Media, Get In Touch, Disclaimer, Investor Questionnaire. Reviewed October 2026.
- genesis-life.demo: Genesis Capital page.
- GenesisCRM (`genesis/insure-genesis`): README, `docs/` (architecture, security, workflow, SLA, reporting, DMS, permissions, plans, roadmap, deployment), `backend/prisma/schema.prisma`, `backend/src` and `frontend/src` structure.

---

*End of document*

<!-- nav:bottom -->

---

### Where to next

| | |
|---|---|
| **Next** | [Implementation](implementation.md) — How the PRD was built: modules, products, dashboards, portal, install, roles, logins, demo data |
| **Previous** | [Genesis Capital user guide](user-guide.md) |
| **Background** | [Understanding Genesis › What Genesis is](../understanding/01-what-genesis-is.md) |
| **Related** | [Implementation](implementation.md) · [00 — Purpose](process-flows/00-purpose.md) |
| **On these journeys** | [Implementer / presenter](../README.md#implementer--presenter) (step 2 of 7) |
| **Lost?** | [Docs roadmap](../README.md) · [Genesis Capital workspace](README.md) · [Understanding Genesis](../understanding/README.md) |
<!-- /nav:bottom -->
