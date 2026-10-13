# SWAN Capital CRM — Implementation

Implementation record for [SWAN_Capital_CRM_PRD.md](SWAN_Capital_CRM_PRD.md), October 2026. It covers all 25 PRD modules (M01–M25), the cross-cutting requirements (§9), the platform enhancements (§14) and the integrations (§12), with demo data across the whole application.

**Approach.** SWAN is a **vertical pack**: Builder metadata installed into its own tenant (`swan-capital`). There are no SWAN-specific pages, routes or tables.

- Every screen is a Builder module, object, form or pipeline.
- Every process is a Builder workflow, assignment rule, SLA policy or stage gate.
- Every calculation is a Builder formula.

Where the platform could not express a requirement, the platform was extended generically, so every tenant gets the capability. See [Platform Builder Extensions](../developer-guide/PLATFORM_BUILDER_EXTENSIONS.md).

Pack source: `backend/prisma/verticals/swan-capital/`.

| File | Contents |
|---|---|
| `objects.js`, `objects-lending.js`, `objects-investments.js`, `objects-advisory-fx.js`, `objects-growth.js`, `objects-compliance.js` | The 91 objects: fields, formulas, validations, pipelines, forms |
| `modules.js` | The 18 modules, plus external references, portal sections, website feeds and French labels |
| `options.js`, `master-data.js`, `masters.js` | Picklists, the product catalogue and other masters, roles, staff, business units, barrier zones |
| `automation.js`, `automation-phase2.js` | Workflows, assignment rules, SLA policies, sandbox integrations, object permissions |
| `content.js`, `content-phase2.js` | Document categories, checklists, merge and email templates, wizards, dashboards, public forms |
| `portal.js` | What clients and introducers see in the portal |
| `i18n-fr.js` | French labels |
| `demo.js` | The demo record generator |
| `demo-platform.js` | Demo activities, tasks, reminders, sample PDF documents, share links, e-signatures, wall-crossings |

## 0. Signing in to the SWAN demo

SWAN Capital is its **own workspace** (tenant `swan-capital`). Signing in as `ADMIN001` or `USR001` opens the
generic *Genesis CRM Demo* workspace, which contains none of SWAN's data. Use the SWAN staff accounts (§10), for
example:

| Sign in as | To see |
|---|---|
| `SWADMIN` (Kevin Lam, administrator) | Everything except barrier-protected records; Builder |
| `SWCOO` (Anjali Gopee, COO) | Group Executive dashboard (default), all business units |
| `SWRM1` (Priya Ramdin, relationship manager) | *My Workbench*, own clients, enquiries, tasks, calendar |
| `SWLOAN1` (Sophie Lagesse, loans executive) | Lending pipeline, applications, documents |
| `SWLMGR` (Rajiv Doorgakant, loans manager) | Credit approvals in **Tools ▸ Approvals** |
| `SWCOMP1` (Fatima Hossenbux, compliance) | KYC approvals, registers, Access & Barriers |
| `SWADV1` (Camille Rivalland, corporate advisor) | Advisory mandates behind the `ADV_PRIVATE` wall |

Demo passwords are set by the installer: `node scripts/install-vertical.js swan-capital --tenant swan-capital
--reset-passwords --password '<demo password>'` (demo environments only). Your administrator holds the current demo
password.

## 1. At a glance

| | Count |
|---|---|
| Modules (sidebar sections) | 19 |
| Objects | 91 |
| Fields (including formulas and roll-ups) | 1,406 |
| Workflows | 71 |
| Assignment rules / SLA policies | 22 / 13 |
| Object permission entries | 208 |
| Roles / staff logins | 17 / 22 |
| Business units / barrier zones | 6 / 4 |
| Dashboards | 15 |
| Email templates (EN + FR) | 34 |
| Merge templates / document categories / checklists | 14 / 27 / 11 |
| Wizards / public website forms | 11 / 6 |
| Sandbox integrations | 7 |
| Master-data sets | 13 (22 products, 6 funds, 9 share classes, 18 countries, …) |
| Demo records | about 2,300 across 78 sets, with 12 months of back-dated history |

## 2. Installing and upgrading

```bash
cd backend
npx prisma migrate deploy        # additive migrations, including 20261014090000 … 20261014103000
npx jest tests/swan-pack.test.js # every field, stage, role, template and portal reference resolves
node scripts/install-vertical.js swan-capital --create-tenant --demo   # first install
node scripts/install-vertical.js swan-capital --tenant swan-capital --demo   # upgrade in place
node scripts/install-vertical.js swan-capital --tenant swan-capital --recompute   # recompute all formulas (repair)
```

### What the install does

- **First install.** `--create-tenant` creates tenant `swan-capital` (plan *enterprise*, industry *finance*, timezone `Indian/Mauritius`) and runs the structural onboarding steps. The generic CRM catalogue is not cloned; the pack replaces it.
- **Re-runs.** The installer is idempotent and diff-based: unchanged metadata is skipped and demo records are matched by `ext_ref`. A re-run reports what it created, updated or left unchanged.
- **Staff accounts.** These are created once, with random passwords printed once (or `--password`). Change them at first sign-in.
- **Duration.** A full install with demo data takes about 40–60 minutes against a remote database (each write is a network round trip). Upgrades that change only metadata take a few minutes.

### Environment for production

| Variable | Purpose |
|---|---|
| `FIELD_ENCRYPTION_KEY` | 64 hex characters. Key for encrypted fields (`id_number`, MFA secrets). If unset, the key is derived from `JWT_SECRET`. Set it before go-live and never change it without re-encrypting. |
| `SMTP_*` | Outbound email: correspondence, portal sign-in codes. |
| `RECAPTCHA_SECRET` | Turns on reCAPTCHA for the public website forms. |
| `ALLOWED_ORIGINS` | Front-end origins allowed by CORS. |
| `CALENDAR_FEED_SECRET`, `PORTAL_SECRET` | Optional dedicated signing keys. Both default to values derived from `JWT_SECRET`. |

`scripts/encrypt-existing-fields.js` encrypts values stored before a field was marked encrypted. It is a dry run by default; add `--apply` to write.

## 3. SWAN's products in the CRM

All 22 products and services on [swancapitalsolutions.com/products-services](https://www.swancapitalsolutions.com/products-services/)
are in the **Products & Services** module (first in the sidebar). Each product is a full product sheet taken from
the website (13–14 October 2026):

- legal entity, tagline, description, features and benefits
- eligibility, security and insurance, documents required, fees and charges
- who it is for, how to apply, the product page, and the DMS checklist the application uses
- the terms the formulas read: risk rating, margin over the Swan PLR, a live **Rate from** (PLR + margin), minimum
  amount, maximum tenure, maximum age at maturity, maximum financing

Where the website publishes nothing (most fees, document lists), the sheet says so or lists SWAN's standard
onboarding pack. Confirm these with SWAN before go-live.

The fund master carries the published fund facts:

- ISINs: Income MU0768S00046, Foreign Equity MU0768S00053, Emerging Markets MU0768S00004, Global Private Equity
  MU0768S00012, Money Market USD MU0768S00020 and MUR MU0768S00038
- launch dates, benchmarks, minimums, entry and exit fees, dealing and distributions
- the **Fixed Maturity Bond 2029**: a USD feeder fund into the Schroder Special Situations Fund FMB 7, with a
  USD 50,000 minimum, May 2029 maturity, quarterly dividends and an entry fee of up to 2%

The `product_routing` master maps every website label (22 labels, including the duplicates found on the live form) to a product code and a business unit, so a website enquiry reaches the right desk.

| Code | Product (website) | Entity | Where it lives in the CRM | Key automation |
|---|---|---|---|---|
| LND-RE | Real Estate Loan | Swan Life — Lending | Retail Lending: `loan_application` (15-stage pipeline), applicants, conditions, offers, disbursements | Pricing PLR − 0.675%, EMI, LTV, DSR, age at maturity; MCIB; approval matrix; offer letter; security perfection gate; staged disbursements with maker-checker; LMS booking |
| LND-PL | Personal Loan | Swan Life — Lending | Retail Lending | PLR + 0.175%; minimum MUR 500k; ≤ 10 years; same flow as above |
| LND-IBL | Investment-Backed Loan | Swan Life — Lending | Retail Lending + Collateral & Pledges | PLR − 0.175%; only for existing fund or securities clients; maximum loan from pledged holdings after haircuts; pledge instruction; daily LTV, margin calls |
| LND-COM | Commercial Financing | Swan Life — Lending | Commercial Lending: `credit_facility`, financial spreads, covenants, covenant tests | Credit memo with DSCR, gearing, interest cover; group exposure; approval matrix; covenant breach alerts; annual review pipeline |
| WLT-DPM | Wealth Management | Swan Wealth Managers | Wealth Management: risk profiles, suitability, `wealth_mandate`, reviews, AUM snapshots, SAAC | Mandate pipeline; review scheduler and invitations; attrition alerts; SAAC briefing |
| FND-MMF | Money Market Fund (short term) | Swan Global Funds | Investment Funds: `fund`, share classes (USD/MUR/EUR), NAV history, orders, holdings | Fund-order maker-checker and transfer-agent hand-off; suitability block; NAV on the website feed |
| FND-INC | Income Fund (medium term) | Swan Global Funds | Investment Funds | Distribution notices; as above |
| FND-FEQ | Foreign Equity Fund (long term) | Swan Global Funds | Investment Funds | Suitability override required above the client's profile |
| FND-EME | Emerging Markets Equity Fund | Swan Global Funds | Investment Funds | As above |
| FND-GPE | Global Private Equity Fund (alternative) | Swan Global Funds | Investment Funds | As above (risk 5) |
| FND-FMB29 | Fixed Maturity Bond 2029 | Swan Global Funds | Investment Funds: `fund_campaign` (Series 1 closed, Series 2 open) | Subscription window, target raise, progress %; reinvestment proposals before maturity |
| SEC-TRD | Trading Solutions | Swan CMB Securities | Trading Solutions: `securities_account`, `client_order`, IPO/bond book, research | Account-opening pipeline; order log with OMS hand-off; restricted-list block; dormant-account reactivation |
| SEC-LOC | Local Investments (SEM) | Swan CMB Securities | Trading Solutions | As above, market SEM |
| SEC-INT | International Offering | Swan CMB Securities | Trading Solutions | As above, international markets |
| SEC-MKT | Market Statistics & Research | Swan CMB Securities | `research_publication`, `subscription` | Distribution lists with consent; weekly highlights |
| ADV-FR | Fund Raising | Swan Corporate Advisors | Corporate Advisory (barrier-protected): mandates, conflict checks, deal teams, insiders, investor book, deliverables, time, invoices, credentials | Conflict check before engagement; engagement letter; insider list auto-add; NDA-gated indications; milestone invoicing |
| ADV-VAL | Valuation & Business Plan | Swan Corporate Advisors | Corporate Advisory | As above (eight valuation service lines) |
| ADV-RES | Corporate Restructuring Advisory | Swan Corporate Advisors | Corporate Advisory | As above (five restructuring service lines) |
| FX-GEN | Swan Forex ("Talk to our Forexpert") | Swan Forex | Forex Desk: FX profiles, quotes, deals, rate alerts; `fx_rate` board | Quote-to-deal with dealing-system reference; improvement vs board rate; limits |
| FX-SPOT | Forex Spot | Swan Forex | Forex Desk | As above |
| FX-FWD | Forward Transactions | Swan Forex | Forex Desk | Forward maturity reminders and roll-over offers |
| FX-SWAP | Forex Swap | Swan Forex | Forex Desk | As above |

The FX board carries real TT buying and selling rates (13 October 2026) for USD, EUR, GBP, ZAR, AUD, JPY, CAD and CHF. The PLR history (6.825% from 1 January 2026) drives every loan price and the PLR change campaign.

## 4. Modules (PRD §7–§8)

Each row lists the Builder objects and how the PRD requirements are met. Requirement IDs are the PRD's.

### M01 Lead & Enquiry Management — *Enquiries & Leads*

Objects: `enquiry`, `web_event`, `referral`.

| Requirement | Delivered as |
|---|---|
| LEAD-FR-01 public intake | `POST /api/public/forms/<key>` for the published forms `enquiry_web` and `enquiry_calculator`, plus `web_event_*` (calculator, newsletter, call-back). Rate limited, schema-validated, optional reCAPTCHA, honeypot, consent text and version, UTM fields, `prod`, page URL, language. |
| LEAD-FR-02 routing matrix | `product_routing` master (22 website labels) → `product_code`, `business_unit`, queue, first-contact target. |
| LEAD-FR-03 duplicates | `mobile_e164` normalisation; matches existing parties by email, mobile, national ID and BRN (`existing_party_*` formulas); conversion links rather than duplicates. |
| LEAD-FR-04 assignment | Six rules route enquiries by business unit. `swan_enquiry_existing_client_rm` sends an existing client's enquiry to their primary RM. |
| LEAD-FR-05 wizards | Real estate application, investor questionnaire, wealth, advisory and FX qualification wizards. |
| LEAD-FR-06 scoring | `lead_score` and grade A–F formulas: amount band, existing client, completeness, age-tenure feasibility. |
| LEAD-FR-07 SLA | *Enquiry — speed to lead*: first contact within the product's business hours; warning and escalation. |
| LEAD-FR-08 statuses | New → Contacted → Qualified → Converted / Disqualified / Nurture. Disqualification needs a reason code (gate). |
| LEAD-FR-09 conversion | `swan_enquiry_conversion` creates or links the party, the entity relationship, the KYC case and the consent record and, for loans, the loan application. |
| LEAD-FR-10 calculator | Calculator form returns the indicative rate and EMI; anonymous sessions are `web_event` records. |
| LEAD-FR-11 questionnaire | `risk_profile_web` form; `swan_questionnaire_lead` creates the enquiry for the Wealth desk. |
| LEAD-FR-12 acknowledgement | `enquiry_ack` / `enquiry_ack_fr` by preferred language. |
| LEAD-FR-13 import | Platform CSV import with dedupe; consent source field. |
| LEAD-FR-14 attribution | `channel`, `campaign`, `introducer`, `referred_by`, UTM fields; feeds campaign ROI and commissions. |
| LEAD-FR-15 internal referral | `referral` with referrer credit, receiving RM and the *accept within a day* SLA. |

### M02 Client 360 & Party Master — *Clients*

Objects: `party`, `client_group`, `client_relationship`, `party_relationship`, `contact_point`, `consent_record`.

- **C360-FR-01.** Individual and organisation fields.
- **C360-FR-02.** Typed relationships (spouse, director, shareholder %, UBO, signatory, guarantor, power of attorney…).
- **C360-FR-03.** Households and groups with aggregated value and group lending limit.
- **C360-FR-04.** Relationship per business unit, with lifecycle and segment.
- **C360-FR-05: the party record is the Client 360.**
  - Roll-ups: loans outstanding, wealth AUM, fund holdings, securities value, FX volume, total relationship value in MUR and USD, products held, open applications, open complaints.
  - Also shown: next-best actions, consents, the KYC badge, and every related record.
- **C360-FR-06.** Related lists show "N restricted — contact Compliance" instead of hiding barrier-protected rows. The STR register conceals even the count (no tipping-off).
- **C360-FR-07.** Contact points with verification and preferred flag.
- **C360-FR-08.** Record merge re-points every child record and is recorded on the audit chain. Unmerge from Trash ("Reverse merge") within 30 days.
- **C360-FR-09.** Key dates drive reminders: birthday, ID expiry, profile refresh, loan maturity, FMB 2029, mandate review, KYC review.
- **C360-FR-10.** VIP / sensitive clients sit in the `VIP_CLIENTS` barrier zone (named users only); views are audited.
- **C360-FR-11.** Global search covers searchable fields of every object and respects barriers.

### M03 KYC / CDD / AML — *KYC & Compliance*

Objects: `kyc_case`, `screening_hit`, `kyc_reliance`, `str_report`, `kyc_risk_factor` (master).

| Requirement | Delivered as |
|---|---|
| KYC-FR-01 lifecycle | Initiated → Documents Pending → Under Verification → Screening → Risk Assessed → Pending Approval → Approved / Rejected / On Hold, with stage gates. |
| KYC-FR-02 checklists | Individual and corporate KYC packs (11 checklists in total). |
| KYC-FR-03 screening | `swan_kyc_screening` calls the screening integration; hits become `screening_hit` records; daily batch rescreening; triage (true match escalates to the MLRO). Providers: World-Check, Dow Jones, ComplyAdvantage, LexisNexis. |
| KYC-FR-04 risk engine | Weighted factors read from the versioned `kyc_risk_factor` master (country, PEP, product, channel, occupation, ownership, activity); low / medium / high with an override reason. |
| KYC-FR-05 EDD | High risk or PEP needs EDD notes and MLRO approval. |
| KYC-FR-06 periodic review | High 1 year, medium 3, low 5; `swan_kyc_periodic_review` opens the review case. |
| KYC-FR-07 expiry | `swan_id_expiry` requests a new ID 30 days ahead (email; portal upload). |
| KYC-FR-08 reliance | `kyc_reliance` records one entity relying on another's KYC, with validity and add-on checks. |
| KYC-FR-09 FATCA/CRS | Status, tax residencies, TINs, self-certification category. |
| KYC-FR-10 STR register | `MLRO_STR` barrier; `conceal_existence` hides even the count; FIU reference and filing date. |
| KYC-FR-11 onboarding blocks | Validations refuse a fund order, disbursement, trade or activation unless KYC is approved. |

### M04 Investor Profiling & Suitability — *Wealth Management*

Objects: `risk_profile`, `suitability_record`, `model_portfolio`.

- Versioned questionnaire scored to model portfolios A–E and a product-risk ceiling (SUIT-FR-01, -02).
- A suitability record per recommendation (SUIT-FR-03).
- A product, fund or order above the client's ceiling is blocked unless an override reason and the client's acknowledgement are recorded (SUIT-FR-04).
- `swan_profile_refresh` flags profiles older than two years (SUIT-FR-05).
- Client classification: retail, professional, institutional (SUIT-FR-06).

### M05 Retail Loan Origination — *Retail Lending*

Objects: `loan_application`, `loan_applicant`, `credit_condition`, `loan_offer`, `disbursement`.

| Requirement | Delivered as |
|---|---|
| LOAN-FR-01 application | Product, purpose, amount, currency, tenure, repayment type, moratorium; applicants and guarantors. |
| LOAN-FR-02 eligibility | Age at maturity ≤ 65; tenure and LTV from the product master; personal loan minimum; DSR; investment-backed only for fund or securities clients. |
| LOAN-FR-03 pricing | PLR (effective-dated) + product margin; discretionary spread changes go through the approval matrix; `plr_at_offer` stored. |
| LOAN-FR-04 scenarios | `loan_offer` scenarios compare tenure, EMI and total interest; the selected one feeds the offer letter. |
| LOAN-FR-05/06 income and MCIB | Income and obligations per applicant; `swan_loan_mcib` requests the MCIB report after consent and stores the score and reference. |
| LOAN-FR-07 documents | Product checklists (real estate, personal, investment-backed); `swan_loan_documents` emails the request (EN/FR). |
| LOAN-FR-08 appraisal | Risk grade, recommendation, conditions precedent and subsequent, exceptions. |
| LOAN-FR-09 approval matrix | `approval_matrix` master (by amount band and exception type); `swan_loan_credit_approval`. |
| LOAN-FR-10 offer | Offer letter merge template; e-signature in the DMS; daily lapse of unaccepted offers. |
| LOAN-FR-11 security | Valuation, notary, charge registration, life and building insurance assigned to Swan Life, pledge; gate before *Ready for disbursement*. |
| LOAN-FR-12 disbursement | Staged tranches with certificates; checker is never the maker; LMS booking returns the account number. |
| LOAN-FR-13 client updates | `swan_loan_status_update` emails each milestone in EN/FR (portal shows status). |
| LOAN-FR-14 TAT | *Loan — application to decision* SLA; Lending dashboard. |
| LOAN-FR-15 decline | Reason codes, decline letter, re-apply date. |
| LOAN-FR-16 investment-backed | Security value and maximum loan from pledged holdings after haircuts (`collateral_type` master); pledge status to the TA or custodian. |
| LOAN-FR-17 cross-sell | `swan_loan_cross_sell_offer` refers insurance (to Swan Life / General), wealth and FX. |

### M06 Commercial Lending — *Commercial Lending*

Objects: `credit_facility`, `financial_spread`, `covenant`, `covenant_test`, plus `client_group` exposure.

- Facilities with type, tranche, tenor, margin and fees (COM-FR-01).
- Group exposure against the group limit (COM-FR-02).
- Credit memo fields with financial spreading (P&L and balance sheet) and calculated ratios: EBITDA margin, gearing, interest cover, DSCR (COM-FR-03).
- Covenants and tests with breach alerts and waivers (COM-FR-04, -05).
- The annual review pipeline is opened by `swan_facility_annual_review` (COM-FR-06).
- The approval matrix, term-sheet template and security flow are shared with M05 (COM-FR-07).
- The FX hedging next-best action (COM-FR-08).

### M07 Collateral, Security & Pledges — *Collateral & Pledges*

Objects: `collateral`, `collateral_link`, `collateral_valuation`, `margin_call`.

- Register with type, owner, title, rank, value and valuer (COLL-FR-01).
- Many-to-many allocation (COLL-FR-02).
- Revaluation due from the collateral-type frequency (COLL-FR-03).
- Daily LTV against the type's warning, margin-call and liquidation thresholds; margin calls are notified by letter, email and SMS (COLL-FR-04).
- Insurance on collateral with lapse alerts (COLL-FR-05).
- Release date and a discharge template (COLL-FR-06).

### M08 Loan Servicing & PLR Change — *Loan Servicing*

Objects: `loan_account`, `plr_change_event`, `plr_notification`, `collection_action`.

- Account snapshot from the LMS (SERV-FR-01).
- A PLR change creates personalised notices for every variable-rate account, with old and new instalments and a delivery log (SERV-FR-02).
- Loan service requests come from the service catalogue (SERV-FR-03).
- Arrears buckets, collections follow-up, promise to pay (SERV-FR-04).
- Maturity retention opportunities (SERV-FR-05).
- Instalment reminders by SMS three days ahead.

### M09 Wealth Management — *Wealth Management*

Objects: `wealth_mandate`, `mandate_review`, `aum_snapshot`, `saac_decision`.

- Mandate pipeline Prospect → Active (WLT-FR-01).
- Full mandate record (WLT-FR-02).
- Monthly AUM snapshots by asset class, with performance and flows (WLT-FR-03).
- The review scheduler opens reviews by segment cycle and invites the client (WLT-FR-04).
- Monthly reports go in the DMS category *Monthly client reports*, shared by link (WLT-FR-05).
- SAAC log with portfolio-manager briefing (WLT-FR-06).
- Top-ups and withdrawals as service requests (WLT-FR-07).
- Attrition risk from falling AUM, overdue reviews and complaints raises an RM alert (WLT-FR-08).

### M10 Fund Distribution — *Investment Funds*

Objects: `fund`, `fund_share_class`, `nav_history`, `fund_order`, `fund_holding`, `fund_campaign`, `distribution_notice`.

- Six funds, nine share classes with risk, minimums, fees, dealing and cut-off (FND-FR-01).
- Orders with KYC, suitability, cut-off and maker-checker, handed to the transfer agent (FND-FR-02).
- Holdings and 117 NAV points; NAVs published to the website feed (FND-FR-03).
- FMB 2029 campaigns (FND-FR-04).
- Distribution notices to unitholders (FND-FR-06).

### M11 Securities — *Trading Solutions*

Objects: `securities_account`, `client_order`, `ioi_entry`, `research_publication`.

- Account-opening pipeline (SEC-FR-01).
- Account record with CDS, OMS, limits and instructors (SEC-FR-02).
- Time-stamped order log with OMS hand-off and the restricted-list block (SEC-FR-03).
- IPO / bond indications (SEC-FR-04).
- Research distribution with consent (SEC-FR-05).
- Dormant-account reactivation (SEC-FR-06).

### M12 Corporate Advisory — *Corporate Advisory*

All records are behind the `ADV_PRIVATE` barrier. Objects: `advisory_mandate`, `conflict_check`, `deal_team_member`, `insider_list_entry`, `investor_target`, `advisory_deliverable`, `time_entry`, `fee_invoice`, `deal_credential`.

- Pipeline with the conflict check before the engagement letter, and all service lines from the website (ADV-FR-01).
- The conflict check searches SWAN relationships, exposure and the restricted list (ADV-FR-02).
- Project code names (ADV-FR-03).
- Deal-team members are added to the insider list automatically (ADV-FR-04).
- Investor book with NDA gating and information-memorandum view counts (ADV-FR-05).
- Deliverables with review (ADV-FR-06).
- Time capture and cost (ADV-FR-07).
- Milestone invoices (ADV-FR-08).
- Tombstones (ADV-FR-09).

### M13 Forex Desk — *Forex Desk*

Objects: `fx_profile`, `fx_quote`, `fx_deal`, `fx_rate_alert`, `fx_rate`.

- Profiles with purpose, pairs, products, limits and settlement accounts (FX-FR-01).
- Rate board, published to the website feed (FX-FR-02).
- Quote → deal with timestamps, improvement against the board, and the dealing-system reference (FX-FR-03).
- Rate alerts by email or SMS (FX-FR-04).
- Forward maturity reminders (FX-FR-05).
- Bank of Mauritius purpose codes and a regulatory dashboard (FX-FR-06).
- Corporate hedging next-best action (FX-FR-07).

### M14 Cross-sell — *Cross-sell & RM Workbench*

Objects: `fs_opportunity`, `nba_suggestion`.

- Opportunities per business unit, with probability, forecast category and weighted value (XS-FR-01).
- Four next-best-action rules as daily workflows: fund holder → investment-backed loan; borrower → Wealth / Money Market; corporate → FX hedging; HNW without a mandate → Wealth discovery. FMB 2029 holders near maturity get a reinvestment proposal from `swan_fmb_maturity`. Accepting a suggestion opens an opportunity (XS-FR-02).
- Referrer credit split (XS-FR-03).
- `rm_target` quotas with attainment (XS-FR-04).

### M15 RM Workbench — *Cross-sell & RM Workbench*

Objects: `meeting_note`, `rm_target`.

- *My Workbench* dashboard (RM-FR-01).
- Meeting-note templates for discovery, review, credit visit, call and event follow-up (RM-FR-02).
- **Calendar feed:** an iCalendar subscription for Outlook, Google or Apple Calendar, under *My account ▸ Security*. It shows each user's activities, tasks and reminders, plus their meeting notes (timed, Mauritius time) and follow-ups, mandate reviews due, FX value dates, covenant tests, events and advisory deliverables. This is a one-way feed (RM-FR-03).
- The UI is responsive (RM-FR-05).
- The *RM League Table* dashboard (RM-FR-06).

### M16 Service & Complaints — *Service & Complaints*

Objects: `service_request`, `service_catalogue` (master).

- Catalogue of 13 request types, each with its own SLA and approval (SR-FR-01).
- Channels: phone, email, walk-in, portal (SR-FR-02).
- FSC complaints register, gated: no resolution without root cause and final response; Ombudsperson referral (SR-FR-03).
- Complaint MI and regulatory extracts (SR-FR-04).
- CSAT and NPS survey on closure (SR-FR-05).

### M17 Documents & E-Signature (platform DMS)

- 27 SWAN categories with seven-year retention (DOC-FR-01, -02).
- 14 merge templates (DOC-FR-03).
- Client upload through the portal, against the record (DOC-FR-04).
- Deal documents inherit the advisory barrier (DOC-FR-05).
- National ID numbers are encrypted (AES-256-GCM) and masked (DOC-FR-06).
- E-signature uses the DMS's native flow.

### M18 Marketing & Consent — *Marketing & Consent*

Objects: `campaign`, `campaign_member`, `segment`, `marketing_event`, `event_registration`, `subscription`, plus `consent_record`.

- Consent per purpose and channel, with source, text version and withdrawal (MKT-FR-01).
- Segments with filter criteria (MKT-FR-02).
- Campaigns with budget, attributed enquiries, loans and revenue, and ROI (MKT-FR-03).
- Newsletter and research subscriptions, with a welcome email (MKT-FR-04).
- Events with registration, attendance and follow-up (MKT-FR-05).
- Suppression: a campaign member cannot be added when the client has no consent, is do-not-contact or has an open complaint (MKT-FR-06).

### M19 Introducers — *Introducers*

Objects: `introducer`, `introducer_referral`, `commission_entry`.

- Onboarding checklist and agreement, allowed products, commission %, clawback and protection window (INT-FR-01).
- Referrals from the introducer portal create enquiries; status is shared only with the prospect's consent (INT-FR-02).
- Commission accrues on funded volume (INT-FR-03).
- SWAN insurance agents are an introducer type (INT-FR-04).

### M20 Revenue — *Revenue*

Objects: `revenue_entry`, `fee_invoice`, `commission_entry`.

- All revenue types (REV-FR-01).
- RM and referrer split credit (REV-FR-02).
- Advisory milestone invoicing (REV-FR-03).
- Exports for incentives (REV-FR-04).
- A finance figure with variance for reconciliation (REV-FR-05).

### M21 Compliance & Barriers — *KYC & Compliance*

Objects: `restricted_list_entry`, `conflict_register`, `gift_register`, `pa_dealing`, `data_subject_request`, and the STR register.

- Barrier zones `ADV_PRIVATE`, `MLRO_STR`, `COMPLIANCE_ONLY` and `VIP_CLIENTS`, enforced in lists, search, related lists, reports, dashboards, documents and notifications. They bind administrators (CMP-FR-01).
- Wall-crossings are time-bound with four-eyes approval (*Tools ▸ Access & Barriers*) (CMP-FR-02).
- The restricted list blocks client orders; watch entries are visible to Compliance only (CMP-FR-03).
- Conflicts register fed by conflict checks (CMP-FR-04).
- Gifts above MUR 5,000 go to Compliance; personal-dealing pre-clearance checks the restricted list (CMP-FR-05).
- Compliance dashboard (CMP-FR-06).
- Hash-chained audit, including permission changes, PII reveals and views of VIP and STR records (CMP-FR-07).
- Data subject requests with the 30-day SLA and the AML-retention check (CMP-FR-08).

### M22 Reporting & Dashboards

15 dashboards (§8). Every widget is an object-analytics widget scoped by the viewer's business units and barriers (RPT-FR-01).

### M23 Client & Introducer Portal

See §9.

### M24 Administration & Masters — *Masters*

Masters: products, routing, PLR history, countries (FATF, sanctions, risk score), FX reference rates, model portfolios, KYC risk factors, collateral types and haircuts, approval matrices, service catalogue, reason codes, funds and share classes. Administrators maintain them as ordinary records. Business units, roles, staff and business hours are Builder settings.

### M25 Integration Hub

See §7.

## 5. Cross-cutting requirements (PRD §9)

| ID | Delivered as |
|---|---|
| X-01 multi-currency | `currency_code` on money fields; `*_mur` formulas use the latest `fx_rate` in effect; dashboards report MUR; total relationship value also in USD. |
| X-02 bilingual | EN/FR correspondence (34 templates). The UI has an **EN / FR switch** in the header: module, object, field, stage and option labels carry French versions (`config.label_fr`, `label_fr`). Builder ▸ field ▸ *Label (French)* edits them. Shell text (buttons, menus) stays in English. |
| X-03 business-unit scope | Six business units; records are stamped and filtered by the viewer's units. |
| X-04 barriers | See M21. |
| X-05 maker-checker | Workflow approvals with `exclude_actor`: KYC approval, disbursement, fund orders, rate overrides. Merge is manager-only. |
| X-06 status timeline | Every pipeline records its stage history. |
| X-07 notifications | In-app, email, and SMS (`send_sms` workflow step through the SMS integration). WhatsApp is not connected (§11). |
| X-08 masking | `id_number` and income band are masked for roles without `view_pii`. *Reveal* writes an audit-chain entry. |
| X-09 bulk operations | Bulk reassign (RM exit), bulk stage change, bulk delete. |
| X-10 import / migration | `ext_ref` on every object; CSV import matches on it. |

## 6. Platform enhancements (PRD §14)

| ID | Status | Delivered as |
|---|---|---|
| E-01 refresh tokens and revocation | **Delivered** | Rotating refresh tokens with reuse detection (a replayed token revokes the family); `tokens_valid_after` revokes issued access tokens on deactivation, password change or *Sign out everywhere*. |
| E-02 MFA / SSO | **MFA delivered; SSO not** | TOTP with recovery codes; enforced by the security policy. OIDC/SAML SSO needs the client's Entra ID tenant. |
| E-03 durable queue | **Delivered** | `job_queue` table worked by every API instance (atomic claims, leases, exponential back-off, dead-letter). Failed integration and SMS calls retry instead of being lost. Depth is shown on `/health`. Built on the database rather than BullMQ, so no new infrastructure is required. |
| E-04 multi-currency | **Delivered** | See X-01. |
| E-05 business units | **Delivered** | See X-03. |
| E-06 information barriers | **Delivered** | See M21. |
| E-07 request schemas | **Delivered for new routes** | Portal, public forms and feeds, calendar, record reveal / merge / bulk, auth. |
| E-08 audit | **Delivered** | Hash-chained audit with verification; permission and access changes; view audit. |
| E-09 notification channels | **Email and SMS delivered** | WhatsApp needs a Meta Business account. |
| E-10 full-text search | **Not delivered** | Search uses indexed `LIKE` over searchable fields; adequate for the demo volumes. |
| E-11 per-tenant identity uniqueness | **Not delivered** | Changing unique constraints on the shared database needs a planned migration; SWAN staff IDs are prefixed `SW`. |
| E-12 rebuilt domains | **Delivered as Builder objects** | Campaigns, portal, introducers, calendar feed. |
| E-13 `updated_by` | **Delivered** | `records.updated_by` is stamped by edits, stage moves and bulk operations. |
| E-14 Docker and CI | **Delivered** | `backend/Dockerfile`, `frontend/Dockerfile` (nginx), `docker-compose.yml` (MySQL, Redis, API, web), `.github/workflows/ci.yml` (tests, lint, build, images). Infrastructure-as-code for AWS is not included. |
| E-15 i18n | **Delivered for Builder labels** | See X-02. |
| E-16 field encryption | **Delivered** | `config.encrypt` stores AES-256-GCM ciphertext; typed reads decrypt; backfill script. |
| E-17 maker-checker primitive | **Partial** | Approvals exclude the maker; there is no pending-change diff screen. |

## 7. Integrations (PRD §12)

All external systems are Builder integrations. In this environment they use the **sandbox simulator** connector, which returns realistic, deterministic responses. Going live means changing each integration's type and credentials in *Builder ▸ Integrations*; no workflow changes are needed.

| # | System | How |
|---|---|---|
| I-01 | Website in | Six public forms (§M01). |
| I-02 | Website out | `GET /api/public/feeds/swan-capital/{fx-rates, fund-nav, plr}`: cached, read-only and open to any origin. The fields are configured on the object (`config.public_feed`); personal data is never published. |
| I-03 | Loan management system | `swan_lms`: disbursement booking returns the account number; `loan_account` holds the daily snapshot. |
| I-04 | Transfer agent | `swan_ta`: fund orders. |
| I-05 | OMS / CDS | `swan_oms`: client orders. |
| I-06 | FX dealing system | `swan_fx_dealing`: deal references. |
| I-07 | Screening | `swan_screening`: onboarding, name change and daily batch. |
| I-08 | MCIB | `swan_mcib`: credit reports, with a consent check. |
| I-09 | SWAN insurance | Referral to the `INS` business unit (cross-sell). |
| I-10 | Email | SMTP with EN/FR templates. |
| I-11 | SMS | `swan_sms` via the `send_sms` step: instalment reminders, margin calls, rate alerts. |
| I-12 | WhatsApp | Not connected. |
| I-13 | Microsoft 365 / Google | One-way calendar feed (ICS); two-way sync and SSO need the client's tenant. |
| I-14 | Accounting | Fee invoices and revenue carry the finance reference for export. |
| I-15 | Market data | FX board and NAV history masters; the LTV monitor reads them. |
| I-16 | e-KYC / OCR | Not connected. |

Failed calls are retried by the durable queue (E-03). Every call is logged under *Builder ▸ Integrations ▸ Logs*.

## 8. Dashboards (PRD §M22)

| PRD | Dashboard | Highlights |
|---|---|---|
| RPT-01 | Group Executive (default) | Total relationship value, AUM, fund holdings, loan book, revenue by entity and month, disbursements, FX volume, cross-sell |
| RPT-02 | Lead Funnel | Funnel, channels, products, grades, disqualification reasons |
| RPT-03 | Lending Pipeline | Pipeline value by stage, DSR, exceptions, decisions, decline reasons, tranches |
| RPT-04 | Loan Book | Outstanding by product, arrears buckets, LTV bands, PLR-linked share, collections |
| RPT-05 | Wealth | AUM by model, mandate pipeline, net flows, reviews, suitability overrides |
| RPT-06 | Investment Funds | Holdings by fund, subscriptions vs redemptions, FMB 2029 progress |
| — | Trading | Accounts, orders by market, consideration, IPO / bond book |
| RPT-07 | Corporate Advisory (barrier-aware) | Weighted fee pipeline, mandates by stage and service line, bookbuilding, hours |
| RPT-08 | Forex Desk | Volume by currency and month, top clients, quote outcomes, rate alerts |
| RPT-09 | Compliance | KYC by stage, risk distribution, screening hits, STRs (MLRO only), complaints, consents, DSRs |
| — | Service & Complaints | Requests by type and entity, root causes, CSAT, NPS |
| RPT-10 | RM League Table | Meetings, revenue credited, pipeline, wins, target attainment |
| RPT-11 | Marketing | ROI by campaign, attributed revenue, events, subscribers, introducers |
| RPT-12 | Regulatory Extracts | Complaints, Ombudsperson referrals, insiders, STRs filed, FX by BoM purpose code |
| RM-FR-01 | My Workbench | My enquiries, next-best actions, reviews, KYC, pipeline, meetings |

## 9. Client and introducer portal (PRD M23)

URL: `/portal/swan-capital`.

**Sign-in.** A one-time code is emailed to the address on the client's party record (or the introducer's portal email). This is a separate realm: portal tokens are never accepted by staff APIs.

**What a client sees** (configured in `portal.js` through `config.portal`):

| Section | The client can |
|---|---|
| Loan applications | Follow status and figures; upload requested documents (PRT-FR-02) |
| My loans | See outstanding balance, rate, instalment and next due date |
| Fund holdings, Fund orders | See units and value; place subscription or redemption requests, subject to the cut-off, KYC and suitability rules (PRT-FR-06) |
| Wealth mandates, Trading accounts, FX deals | See their holdings (PRT-FR-03) |
| Requests & complaints | Raise and follow requests and complaints; attach documents (PRT-FR-04) |
| My consents | Grant or withdraw consent per purpose (PRT-FR-05) |
| Know your customer | Upload a renewed ID or proof of address (PRT-FR-05) |

Clients can also download documents in categories marked portal-visible (offer letters, statements, monthly reports) and message their RM. Messages become activities on the client's record and notify the owner. New loan applications start from the website forms (calculator or enquiry) rather than inside the portal.

**What an introducer sees.** They submit referrals, which become enquiries. They see their own referrals (the stage only where the prospect agreed to share it) and their commissions (PRT-FR-07).

## 10. Roles and sign-ins

All roles sit at levels 4–5 on the Genesis ladder; no custom role can reach the admin band. Passwords are printed once by the installer.

| Employee ID | Name | Role | Business units | Barrier zones |
|---|---|---|---|---|
| SWADMIN | Kevin Lam | super_admin | all | none (bound by barriers) |
| SWCOO | Anjali Gopee | coo | all | VIP_CLIENTS |
| SWBDH | Shalini Ramtohul | bu_head | all | — |
| SWRM1, SWRM2, SWRM3 | Priya Ramdin, Natasha Appadoo, Bruno Chan | rm | WLT/LND/FND; WLT/FND/SEC; LND/FX | SWRM2: VIP_CLIENTS |
| SWLMGR | Rajiv Doorgakant | loans_manager | LND | — |
| SWLOAN1, SWLOAN2 | Sophie Lagesse, Yash Bholah | loans_executive | LND | — |
| SWCRED1 | Nadia Peerbux | credit_analyst | LND | — (view PII) |
| SWCC1 | Jean-Marc Desvaux | credit_committee | LND | — |
| SWOPS1 | Ritesh Seewoo | operations_checker | LND, FND | — (view PII) |
| SWPM1, SWPM2 | Laurent Koenig, Vanessa Ah-Kee | portfolio_manager | WLT/FND; FND | — |
| SWTRD1 | Arvind Ramsurrun | trader | SEC | — |
| SWADV1, SWADV2 | Camille Rivalland, Ryan Pillay | corporate_advisor | ADV | ADV_PRIVATE |
| SWFX1 | Deepak Mungur | fx_dealer | FX | — |
| SWMKT1 | Emilie Fanchette | marketing | all | — |
| SWCOMP1 | Fatima Hossenbux | compliance_officer | all | ADV_PRIVATE, COMPLIANCE_ONLY (view PII) |
| SWMLRO | Olivier Maurel | mlro | all | MLRO_STR, ADV_PRIVATE, COMPLIANCE_ONLY, VIP_CLIENTS (view PII, barrier override) |
| SWAUD1 | Karim Joomun | auditor | all | — (read-only) |

**Who sees which records.** Relationship managers and loans executives work their own book (records they own;
managers also see their team's). Every other desk — credit, operations, compliance, portfolio and fund management,
dealing, advisory, marketing, management and audit — sees all records of the objects it handles (**Records: All** on
the object permission), within its business units and barrier zones. Reference data (products, funds, rates,
campaigns) is visible to everyone.

**Approvals.** Credit decisions, KYC sign-off, disbursement and fund-order checks, gifts above the threshold and
other approval steps wait in **Tools ▸ Approvals** for the people they name; the sidebar shows the count. The
maker can never approve their own request.

Every user can turn on two-factor authentication and copy their calendar link under *My account ▸ Security* (click the avatar).

## 11. Demo data

About 2,300 records across 78 sets, generated deterministically by `demo.js`. They tell one consistent story over 12 months:

- 64 parties (individuals and companies) with contact points, relationships, consents and households
- 66 KYC cases, screening hits (true match, false positives, pending), an STR
- 130 enquiries across all channels and products, plus calculator and website events
- loan applications at every stage, with applicants, conditions, offers and staged disbursements
- loan accounts with arrears, a PLR change campaign and its notices
- commercial facilities with financial spreads, covenants and a breach
- collateral, valuations, LTV and margin calls
- mandates, AUM snapshots, reviews, SAAC decisions
- 117 NAV points, holdings, orders (some with documented suitability overrides), FMB 2029 campaigns
- securities accounts, orders and the IPO / bond book
- advisory mandates with conflict checks, deal teams, insiders, investor books, deliverables, time and invoices
- FX profiles, quotes, deals, forwards and rate alerts
- campaigns, segments, events, subscriptions, introducers, commissions and revenue
- service requests and complaints with CSAT and NPS
- gifts, personal dealing, data subject requests

Records are back-dated (`created_at`), so dashboards show trends. On top of the records, the demo install adds:

- **Owners.** Enquiries and requests are routed by the assignment rules; child records take their parent's owner.
- **History.** Each back-dated record gets a stage timeline from creation to its current stage, so the status
  timeline, stage-ageing reports and SLA outcomes look like a year of real use.
- **Activities and follow-ups.** About 430 calls, meetings, emails and notes, with upcoming meetings on the
  calendar feed, open and overdue tasks per desk, and reminders (birthdays, offer follow-ups, forward maturities).
- **Documents.** About 800 sample PDFs filed against each record's DMS checklist: KYC packs, loan document packs,
  valuation reports, MCIB reports, offer letters, term sheets, audited accounts, mandate agreements, IPS, monthly
  client reports, prospectuses and factsheets, subscription forms, engagement letters, NDAs, information memoranda,
  complaint letters and STR reports. Checklists are complete for records past the document stage and partial for
  records still collecting.
- **Review, sharing and signing.** Documents carry review status (approved, under review). Share links have view
  analytics, for example information memoranda sent to investors and monthly reports. Offer letters, mandate
  agreements and engagement letters have e-signature requests, signed or awaiting signature.
- **Access history.** Six wall-crossings (approved, rejected, pending) and an audit-chain baseline (see
  [Access & Barriers](../user-guide/22-access-and-barriers.md#worked-example-swan-capital-solutions)).

Every sample document is marked SPECIMEN; no real client data is used.

## 12. Demo walk-through

1. **Website to loan.** Submit the website form (`/f/<key>`, printed by the installer) for *Real Estate Loan*. It is routed to Lending, acknowledged in the client's language and timed by the speed-to-lead SLA. Move it to *Converted*: the party, KYC case and application appear. Follow the application through MCIB, approval, offer, security and disbursement (the checker must be another user, for example SWOPS1). The LMS returns the account number.
2. **Client 360.** Open a high-value party: roll-ups, products held, next-best actions, related records. Sign in as SWRM1: advisory rows read "restricted — contact Compliance". The ID number is masked; SWCOMP1 can reveal it, and the reveal is audited.
3. **Suitability.** Enter a Global Private Equity order for a conservative client: it is refused until an override and acknowledgement are recorded.
4. **Barriers.** As SWADV1, open an advisory mandate; as SWTRD1 it does not exist. Add a deal-team member and they appear on the insider list.
5. **FX.** Create a quote, accept it, and see the deal booked with a dealing reference. Rate alerts trigger hourly from the board.
6. **Portal.** Open `/portal/swan-capital`, sign in as a demo client's email (the code is shown on screen outside production when SMTP is not configured), view applications and holdings, upload a document, send a message.
7. **French.** Switch the header to **FR**: modules, fields, stages and picklists show in French.
8. **Executive view.** Sign in as SWCOO: the Group Executive dashboard.
9. **Approvals.** Move an application to *Credit approval* as SWCRED1; sign in as SWLMGR, open **Tools ▸ Approvals**,
   approve with a comment; the application moves to *Offer issued* and the PDF offer letter appears in its documents.
10. **Documents.** Open a loan application's Docs tab: the checklist shows which items are in, each with its
    review status; open the offer letter and its signature request.

## 13. Not delivered, or needs the client's accounts

| Item | PRD | What is needed |
|---|---|---|
| SSO (Entra ID / Google) | E-02, I-13 | The client's identity tenant and an app registration |
| Two-way calendar sync, Outlook add-in | RM-FR-03 | Microsoft 365 / Google OAuth credentials (the one-way feed works now) |
| WhatsApp | E-09, I-12 | A Meta WhatsApp Business account |
| Live screening, MCIB, LMS, TA, OMS, FX dealing, SMS providers | §12 | Provider contracts and credentials; integrations run on the sandbox simulator |
| Full-text search engine | E-10 | Not required at current volumes |
| Per-tenant uniqueness of staff ID and email | E-11 | A planned constraint migration on the shared database |
| Pending-change diff screen for maker-checker | E-17 | Approvals already exclude the maker |
| Shell UI text in French | X-02 | Builder labels are bilingual; buttons and menus are English |
| e-KYC, OCR, CTI, offline PWA | KYC-FR-12, DOC-FR-07, RM-FR-04, RM-FR-05 | "Could" priority; vendor selection |
| Infrastructure-as-code (AWS) | E-14 | Docker and CI are delivered; Terraform/CDK is a deployment decision |

## 14. Verification

- `backend`: `npx jest`. 76 suites, including `swan-pack.test.js` (every reference in the pack resolves), plus tests for portal, auth hardening, field protection, job queue, calendar feed, public feeds, workflow steps and record visibility.
- **Live business flows**, driven through the API against the installed workspace, with each step performed by the
  role that owns it:
  - *Lending, 14 steps:* website enquiry (French), routing, French acknowledgement, speed-to-lead SLA, conversion
    (party, relationship, KYC, consent, application), KYC with screening and Compliance four-eyes approval, MCIB,
    pricing and eligibility, credit appraisal and Loans Manager approval, PDF offer letter, offer acceptance,
    security perfection, maker-checker disbursement, LMS booking, loan account.
  - *Desks:* fund order maker-checker to TA confirmation; suitability block; FX quote to deal with dealing
    reference; advisory conflict check invisible to the trading desk; complaint acknowledgement; restricted-list
    block; introducer referral through the portal to a routed enquiry.
- `frontend`: `npx vitest run`, `npm run lint`, `npm run build`.
- CI runs all of the above on every push (`.github/workflows/ci.yml`).
