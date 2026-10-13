# SWAN Capital CRM — Implementation (Phase 0 + Phase 1 MVP)

Implementation record for [SWAN_Capital_CRM_PRD.md](SWAN_Capital_CRM_PRD.md), October 2026.

**Approach.** SWAN is delivered as a **vertical pack**: plain Builder metadata installed into its own tenant (`swan-capital`). There are no SWAN pages, routes or tables. Every screen is a Builder module/object/form/pipeline, every process is a Builder workflow, assignment rule, SLA policy or stage gate, and every calculation is a Builder formula field. Where the platform could not express a PRD requirement, the platform was extended generically, so every tenant gets the capability. Those extensions are documented in [Platform Builder Extensions](../developer-guide/PLATFORM_BUILDER_EXTENSIONS.md).

Pack source: `backend/prisma/verticals/swan-capital/` (`options.js`, `masters.js`, `objects.js`, `automation.js`, `content.js`, `index.js`).

---

## 1. Installing

```bash
cd backend
npx prisma migrate deploy                      # 20261013180000_platform_builder_extensions (additive)
npx jest tests/swan-pack.test.js               # every field / stage / role / template reference resolves
node scripts/install-vertical.js swan-capital --create-tenant --demo
```

- `--create-tenant` creates tenant `swan-capital` (plan *enterprise*, industry *finance*, timezone `Indian/Mauritius`) and runs the structural onboarding steps (role ladder, office). The generic CRM catalogue is **not** cloned; the pack replaces it.
- Re-running with `--tenant swan-capital` upgrades in place. The installer is idempotent; see [§11 of the platform guide](../developer-guide/PLATFORM_BUILDER_EXTENSIONS.md#11-vertical-packs).
- Staff accounts are created once with random passwords printed once (or `--password`). Change them at first login.
- The three public forms print their paths at the end of the install (`/f/<key>`). Embed them on swancapital.mu with an `<iframe>`, or post to `POST /api/public/forms/<key>` from the site's own form.

## 2. Phase 0 — platform foundations (PRD §14)

| PRD | Requirement | Status | Delivered as |
|---|---|---|---|
| E-04 | Multi-currency, FX rate table, base-currency reporting | **Delivered (vertical level)** | `currency_code` on monetary objects; `fx_rate` effective-dated master; `*_mur` formula fields (`LOOKUP(..., 'rate_date')` picks the latest rate in effect). All dashboards report MUR. |
| E-05 | Business-unit dimension in permissions | **Delivered** | `business_units`, `employee_business_units`, `records.business_unit_id`; enforced in the record service, search, related lists, lookups, analytics and documents. Six SWAN units with licence references. |
| E-06 | Information barriers | **Delivered** | Barrier zones, members, time-bound wall-crossings with four-eyes approval. Binds admins. `ADV_PRIVATE` (advisory mandates), `MLRO_STR` (STR register), `COMPLIANCE_ONLY` (watch list entries). Override: MLRO only. |
| E-07 | Request-body schemas | **Delivered for new routes** | `/api/access`, `/api/public`, `/api/analytics/object`, form publishing, record actions. |
| E-08 | Permission audit, hash-chained audit | **Delivered** | `audit_chain_events` with verification endpoint; permission, membership, crossing and publishing changes are chained. |
| E-09 | Email notifications with templates | **Delivered (email)** | `send_email` workflow step with EN/FR template variants. SMS/WhatsApp: not delivered. |
| E-15 | Bilingual correspondence | **Partial** | 14 EN/FR email templates chosen by the party's `preferred_language`. The application UI is English only. |
| E-17 | Maker-checker | **Partial** | Workflow approval `exclude_actor` / `exclude_field`: the maker can never be the checker (disbursement, KYC approval). No pending-change diff UI. |
| E-01, E-02, E-03, E-10, E-11, E-13, E-14, E-16 | Refresh tokens, MFA/SSO enforcement, durable queue, full-text search, per-tenant identity uniqueness, `updated_by`, CI/CD, field encryption | **Not delivered** | Out of scope for this increment; see [§7](#7-not-delivered--follow-ups). |

## 3. Phase 1 modules

| PRD | Module | Builder objects (module) | What is configured |
|---|---|---|---|
| M01 | Lead & Enquiry Management | `enquiry`, `referral` (*SWAN Enquiries*) | Public web form + calculator form; product → business-unit routing (`product_routing` master, Appendix A); 6 BU assignment rules (round robin per desk); EN/FR acknowledgement; *speed to lead* SLA; formula lead score; duplicate detection against existing parties; conversion to Party + Client Relationship + KYC case + Loan Application by workflow; referral between entities with a one-day acceptance SLA. |
| M02 | Client 360 & Party Master | `party`, `client_relationship`, `party_relationship`, `consent_record` (*SWAN Clients*) | Individuals and corporates; age, ID expiry, KYC badge (latest KYC case), total relationship value roll-ups; relationships per BU; household/group links; consent records. The **Related** tab on a party is the Client 360: every enquiry, application, KYC case, mandate, request and document pointing at it. |
| M03 | KYC / CDD / AML | `kyc_case`, `str_report` (*SWAN Compliance*) | Risk score formula (country risk from the country master, PEP, product, delivery channel, occupation, ownership complexity, transaction profile) → low/medium/high (PEP is always high), with an override reason; EDD for high risk; screening result captured (adapter not integrated); stage gates block approval until the checklist, screening and EDD are complete; high risk routes approval to the MLRO, others to Compliance; periodic review by risk (high 1, medium 3, low 5 years) opens a new KYC case when due; ID-expiry reminders; STR register behind the `MLRO_STR` barrier. |
| M04 | Investor Profiling & Suitability | `risk_profile`, `suitability_record`, `model_portfolio` | Questionnaire (wizard + public form) scored by formula to risk bands and model portfolios A–E; suitability record checks the product's risk against the profile; a web questionnaire creates an enquiry for the Wealth desk. |
| M05 | Retail Loan Origination | `loan_application`, `collateral` (*SWAN Lending*) | 15-stage pipeline; pricing = PLR (effective-dated) + product margin; EMI (`PMT`); LTV, DSR, age at maturity, eligibility; approval authority by amount (Loans Manager ≤ MUR 5M, Credit Committee ≤ 20M, Board above) with matching approval workflows; offer letter generated and filed on the record; daily lapse of offers not accepted by their validity date; security perfection gate; disbursement with maker-checker; cross-sell referral to Wealth on disbursal; decline letter. |
| M09–M13 | Wealth, Funds, Securities, Advisory, FX | `wealth_mandate`, `fund_order`, `securities_account`, `advisory_mandate`, `fx_profile` | **Phase 2 — objects and pipelines only**, so the BUs can start recording; no automation yet. Advisory mandates sit behind the `ADV_PRIVATE` barrier. |
| M15 | RM Workbench | (platform) | Activities, tasks and reminders from the core platform; workflows raise notifications (documents, KYC review due, ID expiry) and records (cross-sell referrals, review cases). |
| M16 | Service Requests & Complaints | `service_request` (*SWAN Service*) | Request catalogue per entity; complaint fields shown only for complaints; FSC-aligned register (category, root cause, final response, redress, Ombudsperson referral); a complaint cannot be resolved without root cause and final response; BU routing; acknowledgement email; complaint and request SLAs. |
| M17 | Documents & E-Signature | (platform DMS) | 19 SWAN document categories, 4 checklists (individual KYC, corporate KYC, real-estate loan, personal loan), 5 merge templates (offer letter, decline letter, PLR change notice, KYC refresh, engagement letter). Documents attached to a record inherit its BU and barrier visibility. |
| M21 | Compliance & Information Barriers | `restricted_list_entry`, `conflict_register`, `str_report` | Restricted/watch lists (watch entries visible to Compliance only), conflicts register, STR register; **Tools ▸ Access & Barriers** for zones, members, wall-crossings and audit-chain verification. |
| M22 | Dashboards & MI | (Dashboard Builder) | *Group executive* (tenant default): open enquiries, loan pipeline and disbursed volume (MUR), open complaints, enquiries by entity/stage/channel/month, relationships by entity, clients by segment. *Lending*: applications in progress, average DSR and LTV, exceptions referred to credit, pipeline value by stage, applications by product, decline reasons. *Compliance*: KYC awaiting approval, reviews due in 30 days, high-risk clients, open screening matches, KYC by stage, risk distribution, complaints by category, consents by purpose. All widgets are object-analytics widgets scoped by the viewer's access. |
| M24 | Administration & Masters | `financial_product`, `product_routing`, `plr_rate`, `country`, `fx_rate`, `model_portfolio` (*SWAN Masters*) | Products with margins (real estate −0.675, personal +0.175, investment-backed −0.175), website label routing, PLR 6.825% from 2026-01-01, country risk, FX rates, model portfolios. Admins maintain them as ordinary records. |

## 4. MVP journeys (PRD §15.1)

| # | Journey | How it runs |
|---|---|---|
| 1 | Website "Real Estate Loan" enquiry is routed to Loans, acknowledged EN/FR, with an SLA | Public form `enquiry_web` → `enquiry` record. The `business_unit` formula resolves `LND` from `product_routing`; the *Route LND enquiries* rule assigns a Loans Executive; `swan_enquiry_acknowledgement` sends `swan_enquiry_ack_en`/`_fr`; *Enquiry — speed to lead* starts. |
| 2 | Qualify, convert to Party + Relationship + Application, request documents | Move the enquiry to **Converted** (gate: first name, last name, email). `swan_enquiry_conversion` creates the party (or links the detected duplicate), the entity relationship, the KYC case and the consent record and, for retail loan products, the loan application, each linked back. On *documents_pending*, `swan_loan_documents` emails the client the product checklist and notifies the owner. |
| 3 | KYC with screening and risk rating; high risk to the MLRO | `kyc_case` on the party: checklist, screening result, computed risk. Gates enforce completeness. `swan_kyc_approval` asks the MLRO (high) or Compliance (other), excluding the maker; approval schedules the next review. |
| 4 | Credit appraisal → approval matrix → offer → security → disbursement | `approval_level` formula drives `swan_loan_credit_approval`; on approval the stage moves to *offer_issued* and `swan_loan_offer` generates the offer letter; *security_perfection* → *ready_for_disbursement* gate (security complete, KYC approved); `swan_loan_disbursement` requires an Operations checker other than the maker. On approval a webhook sends the LMS hand-off event; point it at the LMS endpoint (no LMS adapter is built). |
| 5 | RM sees the Client 360 | Party record: KYC badge, relationship value, consents, and the Related tab (applications, KYC cases, mandates, requests, documents, activities). |
| 6 | Compliance sees KYC overdue and the complaints register | *SWAN Compliance* dashboard (KYC awaiting approval, reviews due) plus the `service_request` list filtered by *Complaint*. |
| 7 | COO sees the group lead funnel and the lending pipeline | *SWAN Group Executive* dashboard (tenant default). |

## 5. Roles and logins

Roles sit on the Genesis ladder at levels 4–5 (no custom role can reach the admin band). Object permissions: 46 entries in `automation.js`.

| Employee ID | Role | Business units | Notes |
|---|---|---|---|
| SWADMIN | super_admin | (unrestricted) | Tenant administrator; **bound by barriers** (in no zone) |
| SWCOO | coo | (unrestricted) | Group dashboards |
| SWRM1 | rm | WLT, LND, FND | Relationship manager |
| SWLMGR, SWLOAN1, SWLOAN2 | loans_manager, loans_executive | LND | Loan origination |
| SWCRED1, SWCC1 | credit_analyst, credit_committee | LND | Appraisal and approval |
| SWOPS1 | operations_checker | LND, FND | Disbursement checker |
| SWPM1 | portfolio_manager | WLT, FND | Phase 2 desk |
| SWTRD1 | trader | SEC | Phase 2 desk |
| SWADV1 | corporate_advisor | ADV | Zone `ADV_PRIVATE` |
| SWFX1 | fx_dealer | FX | Phase 2 desk |
| SWCOMP1 | compliance_officer | (unrestricted) | Zones `ADV_PRIVATE`, `COMPLIANCE_ONLY` |
| SWMLRO | mlro | (unrestricted) | Zones `MLRO_STR`, `ADV_PRIVATE`, `COMPLIANCE_ONLY`; holds `barrier_override` |

An employee with no business-unit memberships is unrestricted by unit; barriers still apply.

Passwords are printed once by the installer; they are not stored anywhere else.

## 6. Requirement traceability (selected)

| PRD requirement | Implementation |
|---|---|
| Lead routing by product label (Appendix A) | `product_routing` master + `business_unit` formula on `enquiry` + 6 assignment rules |
| Indicative pricing on the website (calculator) | Public form `enquiry_calculator` with `result_fields: indicative_rate, indicative_emi` |
| PLR change does not need a deployment | `plr_rate` is effective-dated; pricing formulas read the latest rate in effect |
| Approval matrix by amount | `approval_level` formula + `swan_loan_credit_approval` conditional approvals |
| Maker-checker on disbursement and KYC | Approval `exclude_actor` / `exclude_field` |
| Stage cannot advance with missing data | Stage `required_fields` / `entry_rule` (enforced for drag, API, bulk and workflow moves) |
| Information barrier binds administrators | `access-scope.service.js`; covered by `tests/access-scope.test.js` |
| Tamper-evident permission audit | `audit_chain_events` + `GET /api/access/audit-chain/verify` |
| Consent captured with the enquiry | Public form `consent_field` with text version and timestamp |
| Bilingual client correspondence | `send_email` with `language_field: preferred_language` |
| Complaint register (FSC) | `service_request` complaint fields, gate and SLA |

## 7. Not delivered — follow-ups

| Item | PRD | Why / next step |
|---|---|---|
| MFA / SSO enforcement, refresh tokens with revocation | E-01, E-02 | Security sprint; policy flags exist but are not enforced |
| Durable job queue (BullMQ) | E-03 | Scheduled workflows and SLA reconciliation run in-process; acceptable for one node |
| SMS / WhatsApp channels | E-09 | Email only |
| UI translation (react-i18next) | E-15 | Correspondence is bilingual; the UI is not |
| Field-level encryption of PII | E-16 | Not started |
| Per-tenant uniqueness of employee ID and email | E-11 | Identity columns remain platform-wide unique, so SWAN staff IDs are prefixed `SW` |
| Screening adapter, LMS / PMS / CDS / MCIB integrations | §12 | Screening results are captured manually; the LMS hand-off is a configurable webhook |
| E-signature of the offer letter | M17 | The DMS e-sign flow works on the generated document; no provider integration |
| Phase 2 automation (M06–M14, M18, M20) and Phase 3 (portal, introducers) | §15 | Objects and pipelines for M09–M13 exist so data capture can start |
