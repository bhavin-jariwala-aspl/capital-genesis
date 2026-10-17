# Genesis Capital CRM — User Guide

How to use Genesis CRM at Genesis Capital: finding your way around, working with clients and records, running
each business process from enquiry to completion, and what every term on the screen means.

This guide is for Genesis staff: relationship managers, loans, credit, operations, wealth and fund managers, traders,
corporate advisors, forex dealers, marketing, compliance, management and audit. Administrators will also want the
[implementation record](IMPLEMENTATION.md).

## Contents

1. [Getting started](#1-getting-started)
2. [Finding your way around](#2-finding-your-way-around)
3. [Working with records](#3-working-with-records)
4. [Who sees what](#4-who-sees-what)
5. [Approvals](#5-approvals)
6. [Documents](#6-documents)
7. [Tasks, reminders, calendar and SLAs](#7-tasks-reminders-calendar-and-slas)
8. [Dashboards and reports](#8-dashboards-and-reports)
9. [The modules](#9-the-modules)
10. [Step-by-step journeys](#10-step-by-step-journeys)
11. [The client and introducer portal](#11-the-client-and-introducer-portal)
12. [Working in French](#12-working-in-french)
13. [Glossary](#13-glossary)
14. [Questions and troubleshooting](#14-questions-and-troubleshooting)

---

## 1. Getting started

### Signing in

1. Open Genesis CRM and enter your **Employee ID** (for example `GCRM1`) and **password**. Employee IDs are in capitals.
2. Staff accounts start with `GC`. `PLATFORM01` opens the platform console, not the CRM workspace.
3. Demo accounts and the demo password are listed in [IMPLEMENTATION.md §0](IMPLEMENTATION.md#0-signing-in-to-the-genesis-demo).

### Securing your account

Click your **avatar** (top right) to open **My account ▸ Security**:

- **Change password** — signs you out everywhere afterwards.
- **Two-factor authentication** — add the key to an authenticator app and enter the 6-digit code; keep the ten recovery
  codes safe. If your organisation requires it, you are asked to set it up when you sign in.
- **Calendar feed** — **Show my calendar link** ▸ **Copy**, then add it to Outlook, Google or Apple Calendar as an
  internet calendar. Your meetings, task due dates, reminders, review dates and FX value dates appear there.
- **Sign out everywhere** — use it if a device is lost.

### Your home page

After signing in you land on your **home dashboard**:

- At the top, the **SLA radiator**: your items that are on track, at risk or breached (see [§7](#7-tasks-reminders-calendar-and-slas)).
- Below it, your default dashboard — *Group Executive* for management, *My Workbench* for relationship managers, or the
  dashboard of your desk.

---

## 2. Finding your way around

### The header

| Element | What it does |
|---|---|
| **Search** | Finds clients, enquiries, applications and other records by name, number, email or phone. Results respect what you are allowed to see. |
| **Bell** | Notifications: new assignments, approvals waiting for you, SLA warnings, workflow messages. Click one to open the record or the approval. |
| **Personalise** (palette icon) | Light or dark mode, text size, motion. |
| **EN \| FR** | Switches module, field, stage and picklist names between English and French ([§12](#12-working-in-french)). |
| **Avatar** | My account ▸ Security. |
| **Builder** (administrators) | Configuration: modules, fields, forms, workflows, permissions. |

### The sidebar

Modules are grouped by business area. Each module contains one or more **objects** (record types).

| Section | Modules |
|---|---|
| **Client 360** | Products & Services · Clients · Enquiries & Leads · Cross-sell & RM Workbench |
| **Lending** | Retail Lending · Commercial Lending · Collateral & Pledges · Loan Servicing |
| **Investments** | Wealth Management · Investment Funds · Trading Solutions |
| **Advisory** | Corporate Advisory · Forex Desk |
| **Growth** | Marketing & Consent · Introducers · Revenue |
| **Service** | Service & Complaints |
| **Compliance** | KYC & Compliance |
| **Masters** | Reference data: routing, PLR, countries, FX rates, model portfolios, risk factors, haircuts, approval matrices, service catalogue, reason codes |
| **Tools** | Approvals · My Reminders · Reports · Access & Barriers · SLA Board · Document Management |

You only see the modules your role is allowed to use.

---

## 3. Working with records

A **record** is one item: a client, an enquiry, a loan application, a fund order. Every record belongs to an object and,
for most objects, sits at a **stage** of a pipeline.

### Lists and views

Open a module and pick an object (tabs at the top of the module). Two views are available (an administrator can
also switch on a **Cards** grid per pipeline in *Builder ▸ Pipelines*):

- **Pipeline** — a Kanban board with one column per stage. Drag a card anywhere onto another column (its title
  included) to move the record: the new stage is saved at once and a short "moved to …" notice confirms it. If the
  stage needs information first (for example an LMS reference before *Booked*), the card returns to its column and a
  message names what is missing, with **Open record to complete**.
- **Table** — rows and columns; sort by clicking a column header, select rows for bulk actions.

Toolbar actions: **New** (create a record), **search and filters**, **Export** (CSV of what you see), **Import** (CSV,
administrators and managers).

With rows selected you can **Change stage**, **Reassign** (managers — for example when an RM leaves) or **Delete**.

### The record panel

Click a record to open its panel:

1. **Header** — the record's title, its stage bar, owner and actions (**Edit**, **Merge into…** for managers, and
   buttons for any *record actions* configured for that object).
2. **Fields** — grouped under headings. Calculated fields (formulas) are greyed and update by themselves.
3. **Tabs**:

| Tab | Shows |
|---|---|
| **Related** | Every record linked to this one — for a client: applications, KYC cases, mandates, holdings, orders, deals, requests, meetings… Rows you may not see show as "N restricted — contact Compliance". |
| **Activity** | Calls, meetings, emails and notes logged on the record; add your own. |
| **Tasks** | Follow-ups with owner, due date and priority. |
| **Reminders** | Personal reminders on the record. |
| **Docs** | Documents filed on the record, the **document checklist** for it, upload, preview, share and e-signature ([§6](#6-documents)). |
| **Audit** | Who changed what and when, stage changes, approvals with comments, data reveals. |

### Moving a record through its stages

Drag the card or use the stage bar. Some stages have **gates**: the move is refused with a message until the record is
ready, for example:

- an enquiry cannot be **Converted** without first name, last name and email — and, for a loan product, the amount and
  tenure;
- a KYC case cannot reach **Pending approval** until documents are complete, screening is not a true match and, for
  high risk, enhanced due diligence is recorded;
- a loan cannot be **Ready for disbursement** until security is complete and the client's KYC is approved.

Stage moves often start **automation**: an email to the client, a document, an approval request, a record in another
module. The steps that ran appear in the record's Audit tab.

### Personal data

ID numbers and income bands are always shown **masked** (•••• 1234). Roles that may view personal data (Compliance,
MLRO, credit, operations) see a **Reveal** link next to the value; every reveal is recorded in the tamper-evident audit
trail. Other roles see the masked value only.

### Duplicates

Managers can open the duplicate and choose **Merge into…** ▸ pick the record to keep. Linked records move to the record
kept and the duplicate goes to the Trash. An administrator can **Reverse merge** within 30 days (Builder ▸ Trash).

---

## 4. Who sees what

Three layers decide whether you see a record:

1. **Your book or the whole desk.** Relationship managers and loans executives see records they created or own
   (managers also see their team's). Other desks — credit, operations, compliance, portfolio and fund management,
   dealing, advisory, marketing, management, audit — see all records of the objects they work with. Products, funds,
   rates and other reference data are visible to everyone.
2. **Business units.** Records tagged with an entity (Lending, Wealth, Funds, Securities, Advisory, Forex) are visible
   to that entity's members. Group functions (COO, Compliance, MLRO, audit, marketing) see every unit. A client's party
   record has no unit and is shared by every entity.
3. **Information barriers** (Chinese walls). Advisory mandates and deal records, suspicious-transaction reports, the
   watch list and VIP clients sit behind walls; only members of the wall see them — administrators included.

To work on something behind a wall, request a **wall-crossing** in **Tools ▸ Access & Barriers**; Compliance approves it
for a limited time. Details: [Access & Barriers guide](../user-guide/22-access-and-barriers.md).

---

## 5. Approvals

Credit decisions, KYC sign-off, the checker step on disbursements and fund orders, gifts above the threshold and other
controls are **approval steps**. They wait in **Tools ▸ Approvals**; the sidebar shows how many are waiting for you and
the bell links straight to them.

| Tab | Contents |
|---|---|
| **Waiting for me** | Requests you can decide |
| **All pending** | Every open request (managers) |
| **My decisions** | What you decided, when, with your comment |

Open the linked record to review it, add a comment, then **Approve** (the process continues — for example the loan
moves to *Offer issued*) or **Reject** (the process takes its rejection path). The person who started the request can
never approve it (**maker-checker**).

Who approves what:

| Request | Approver |
|---|---|
| Loan up to MUR 5 million | Manager, Loans & Fixed Income |
| Loan up to MUR 20 million | Credit Committee |
| Loan above MUR 20 million | Board Credit Committee |
| KYC, standard or medium risk | Compliance Officer |
| KYC, high risk or PEP | MLRO |
| Disbursement / fund order check | Operations Checker (never the maker) |
| Commercial facility | Per the approval matrix (Masters ▸ Approval Matrices) |
| Gift or hospitality above MUR 5,000 | Compliance |
| Service request needing approval | BD / business-unit head |

---

## 6. Documents

### On a record (Docs tab)

- **Checklist** — the documents this kind of record needs (for example the *Real estate loan* checklist: ID, proof of
  address, bank statements, payslips, title deed, valuation report, insurance assignment). The checklist is picked
  from the record's product. Items show as received (with their review status) or outstanding, and the badge counts
  the required ones still missing. A rejected document does not count: the item reopens.
- **Email link to client** / **Copy client link** — a secure upload link for the client (see below).
- **Upload** — choose the category that matches the checklist item.
- **Review status** — *Uploaded* (new), *Under review*, *Approved*, *Rejected* (with a reason). Reviewers set it.
- **Generated letters** — offer letters, decline letters, PLR change notices, margin-call notices, KYC refresh letters
  and engagement letters are produced automatically as PDFs on the entity's letterhead.
- **Share** — a secure link with an expiry; the share's analytics show views and downloads (used for information
  memoranda and monthly client reports).
- **E-signature** — send a document for signature by named signers; the status shows *Pending*, *Viewed*, *Signed* and a
  completion certificate is filed.

Documents follow the record's visibility: a document on an advisory mandate is behind the advisory wall.

### Asking a client for documents (upload link)

1. On the record, open **Docs** and check the checklist.
2. Click **Email link to client**: the client's email is filled in from the record; choose English or French and how
   many days the link works (default 14, at most 60), then **Send**. Or click **Copy client link** to paste it into
   a message.
3. The client opens the link on a phone or computer, without signing in. They see only the documents still needed
   and whether each has arrived — never file names or other documents — and upload a photo or PDF for each.
4. Each upload appears on the Docs tab for review. Approve it, or reject it with a reason so the item reopens and the
   same link asks for it again.

The loan-documents email (*Documents pending*) and the ID-renewal email (30 days before an ID expires) already carry
an upload link. A link cannot be cancelled before it expires, so keep it short for sensitive files.

### Document Management (sidebar)

All documents in one place: search by name or content, filter by category, status or record, and see what is waiting
for review.

### Categories

KYC — identity · Proof of address · Source of funds / wealth · Corporate documents · Financial statements · Bank
statements · Property & title · Valuation report · Insurance (assigned policies) · Offer & facility letters · Security
documents · Mandates & IPS · Fund forms · Account agreements · Engagement letters · Deal documents (barrier-protected) ·
Correspondence · Complaints · Generated letters · FATCA / CRS self-certification · MCIB credit report · Compliance
certificates · Monthly client reports · Prospectus & factsheets · Non-disclosure agreements · Insider list exports · Data
subject request evidence · Suspicious transaction reports (MLRO only).

Every regulated category is kept seven years.

---

## 7. Tasks, reminders, calendar and SLAs

- **Tasks** (record ▸ Tasks) — follow-ups with a due date and priority; overdue tasks appear on your workbench.
- **Reminders** (record ▸ Reminders, or **Tools ▸ My Reminders**) — a nudge at a set time (birthdays, offer follow-ups,
  forward maturities). Snooze or complete them.
- **Activities** (record ▸ Activity) — log calls, meetings, emails and notes; scheduled meetings appear in your calendar
  feed.
- **SLA Board** (Tools) — service-level timers on enquiries, applications, KYC cases, complaints, referrals, fund
  orders, FX quotes, conflict checks, margin calls and data subject requests.

| SLA state | Meaning |
|---|---|
| **On track** | Within target |
| **At risk** | Past the warning point (usually 75% of the target) |
| **Breached** | Past the target; escalated to the team lead / manager |
| **Met on time / met late** | Completed before / after the target |
| **Paused** | Waiting on the client (for example *Awaiting client*) |

Examples: first contact on a website enquiry within **4 business hours**; FX quotes answered fast; data subject
requests within **30 days**; complaints acknowledged and resolved within the FSC-aligned targets.

---

## 8. Dashboards and reports

| Dashboard | For | Highlights |
|---|---|---|
| Group Executive | COO, ExCo | Total relationship value, AUM, fund holdings, loan book, revenue by entity and month, disbursements, FX volume, cross-sell |
| Lead Funnel | BD, unit heads | Funnel, channels, products, grades, disqualification reasons |
| Lending Pipeline | Loans | Pipeline by stage, DSR, exceptions, decisions, decline reasons |
| Loan Book | Loans, risk | Outstanding by product, arrears buckets, LTV bands, PLR-linked share |
| Wealth | Investments | AUM by model portfolio, mandate pipeline, net flows, reviews |
| Investment Funds | Fund team | Holdings by fund, subscriptions vs redemptions, FMB 2029 campaign |
| Trading | Securities | Accounts, orders by market, IPO / bond book |
| Corporate Advisory | Advisory (behind the wall) | Fee pipeline, mandates by stage, bookbuilding |
| Forex Desk | Genesis Forex | Volume by currency and month, top clients, quote outcomes |
| Compliance | Compliance, MLRO | KYC by stage, risk distribution, screening hits, complaints, consents |
| Service & Complaints | Service | Requests by type, root causes, CSAT, NPS |
| RM League Table | Management | Meetings, revenue, pipeline, target attainment per RM |
| Marketing | Marketing | Campaign ROI, events, subscribers, introducers |
| Regulatory Extracts | Compliance | Complaints log, Ombudsperson referrals, insiders, FX by BoM purpose code |
| My Workbench | Relationship managers | My enquiries, next-best actions, reviews, KYC, pipeline, meetings |

Every widget only counts records you are allowed to see. **Tools ▸ Reports** lets you build your own reports (filters,
groupings, charts) and schedule them by email.

---

## 9. The modules

Each module below lists what it is for, its record types and pipelines, what happens automatically and who works in it.

### Products & Services

Genesis's catalogue of 22 products and services exactly as published on genesis-capital.demo. Each **product sheet**
gives the legal entity, description, features, eligibility, security and insurance, documents required, fees, who it is
for, how to apply, the website page and the document checklist. **Rate from** shows the current Genesis PLR plus the
product margin and updates when the PLR changes. Pricing and eligibility on loan applications read these values.

| Area | Products |
|---|---|
| Lending (Genesis Life Ltd) | Real Estate Loan · Personal Loan · Investment-Backed Loan · Commercial Financing |
| Wealth (Genesis Wealth Managers) | Wealth Management |
| Funds (Genesis Global Funds) | Money Market · Income · Foreign Equity · Emerging Markets Equity · Global Private Equity · Fixed Maturity Bond 2029 |
| Securities (Genesis CMB Securities) | Trading Solutions · Local Investments (SEM) · International Offering · Market Statistics & Research |
| Advisory (Genesis Corporate Advisors) | Fund Raising · Valuation & Business Plan · Corporate Restructuring Advisory |
| Forex (Genesis Forex) | Genesis Forex · Forex Spot · Forward Transactions · Forex Swap |

### Clients (Client 360)

- **Parties** — one golden record per person or company: identity, contact, segment, preferred language and channel,
  KYC status and AML risk, PEP and VIP flags. Calculated **Client 360** figures: loans outstanding, wealth AUM, fund
  holdings, securities value, FX volume, **total relationship value** (MUR and USD), products held, open applications and
  complaints, marketing consent, next-best actions, suitable risk ceiling.
- **Households & Groups** — families and corporate groups with aggregated value and the group lending limit.
- **Client Relationships** — one per entity the client deals with: *Prospect → Onboarding → Active → Dormant → Closed →
  Exited*.
- **Party Relationships** — spouse, director, shareholder %, beneficial owner, signatory, guarantor, power of attorney.
- **Addresses & Phones** and **Consents** (per purpose and channel, with withdrawal).

Start any client conversation here: the **Related** tab shows everything Genesis does with the client.

### Enquiries & Leads

- **Enquiries**: *New → Contacted → Qualified → Converted* (or *Nurture*, *Disqualified* with a reason). Website forms,
  the loan calculator, the investor questionnaire, walk-ins, phone, events, introducers and referrals all land here.
  The enquiry is **routed** to the right entity and executive, **acknowledged** in the client's language, given a
  **lead score and grade (A–F)** and an **indicative rate and instalment**, and timed by the speed-to-lead SLA.
  Duplicates against existing clients are flagged; an existing client's enquiry goes to their RM. An enquiry from a
  *Talk to* link (see §11) goes straight to the person it names.
  **Converting** creates (or links) the party, opens the entity relationship and the KYC case, records consent and —
  for retail loans — starts the loan application.
- **Calculator Sessions** — anonymous website calculator and newsletter / call-back events.
- **Referrals** — one Genesis entity referring a client to another, with the referrer's credit and a one-day acceptance SLA.

### Cross-sell & RM Workbench

- **Opportunities**: *Identified → Qualified → Proposal → Negotiation → Won / Lost*, with probability, forecast category
  and weighted value; each stage sets the default probability and forecast category, *Lost* needs a loss reason, and the
  referring RM can share the credit.
- **Next-Best Actions** — suggestions raised daily by rules (fund holder without a loan → Investment-Backed Loan;
  borrower → wealth or money market; corporate with foreign-currency revenue → FX hedging; HNW without a mandate → wealth
  discovery; FMB 2029 holders near maturity → reinvestment). The **Accept** and **Dismiss** buttons sit on each open
  suggestion: Accept opens an opportunity; Dismiss asks for a reason.
- **Meeting Notes** — structured notes (discovery, review, credit visit, call, event follow-up).
- **RM Targets & Quotas** — quarterly targets and attainment.

### Retail Lending

- **Loan Applications**: *Enquiry → Pre-qualified → Application captured → Documents pending → Documents complete →
  Credit appraisal → Credit approval → Offer issued → Offer accepted → Security & insurance → Ready for disbursement →
  Disbursed* (exits: *Declined, Withdrawn, Lapsed*). Calculated: PLR, margin, interest rate, monthly instalment (EMI),
  total interest, LTV, DSR, age at maturity, eligibility, approval level. Automation: MCIB report on capture, document
  request email, approval by the right authority, PDF offer letter on *Offer issued*, offers lapse after 30 days,
  disbursement checker, LMS booking, loan account creation, cross-sell referrals, status emails to the client.
- **Applicants & Guarantors**, **Credit Conditions** (conditions precedent / subsequent), **Offer Scenarios** (compare
  tenure, instalment and total interest), **Disbursements** (*Requested → Checker review → Sent to LMS → Booked*), staged
  for construction.

### Commercial Lending

- **Commercial Facilities**: *Origination → RM assessment → Credit memo → Credit approval → Term sheet / offer → Security
  perfection → Active → Annual review → Closed / Declined*. Credit memo with background, SWOT, projections and the
  security package; group exposure against the group limit; annual review opened automatically before expiry.
- **Financial Spreading** (P&L and balance sheet by year, with ratios), **Covenants** and **Covenant Tests** (breach
  alerts, waivers).

### Collateral & Pledges

- **Collateral Register** — property, land, fund units, securities, cash, guarantees: value, haircut, lending value,
  insurance and expiry, revaluation date, pledge status.
- **Collateral Allocations** (one collateral to several loans), **Collateral Valuations**, **Margin Calls**
  (*Issued → Client contacted → Cured / Liquidation*), raised when an investment-backed loan's LTV passes the call level.
- Haircut, revaluation frequency and LTV warning / margin-call / liquidation levels come from **Masters ▸ Collateral
  types**. The latest recorded valuation sets the market value and the next revaluation date; a pledge of fund units
  can cover only part of a holding (*Units pledged*). Owner left empty = the loan applicant.
- Investment-backed loans show **LTV monitoring** on the application (drawn exposure ÷ registered pledges, shortfall to
  restore cover). The margin call — with its notice letter, email and SMS — is raised the moment a revaluation pushes
  the LTV past the call level. *Cured* needs the cure recorded (additional collateral or partial repayment);
  *Liquidation* needs the cure set to liquidation. Reminders: 30 days before collateral insurance lapses, and when a
  revaluation falls due.

### Loan Servicing

- **Loan Book (LMS view)** — daily snapshot from the loan system: outstanding, rate, instalment, next due date, arrears,
  maturity, LTV. Instalment reminders by SMS three days ahead.
- **PLR Change Campaigns** (*Draft → Approved → Notices generated → Distributed*) and **PLR Notices** — every
  variable-rate borrower gets a personalised notice with old and new instalment.
- **Collections (early warning)** — arrears buckets, calls, promises to pay, escalation.

### Wealth Management

- **Risk Profiles** — the investor questionnaire scored to a model portfolio (A–E) and a risk ceiling; valid two years.
- **Suitability Records** — each recommendation with rationale and risks disclosed; above the client's ceiling it needs
  an override reason and the client's acknowledgement.
- **Wealth Mandates**: *Prospect → Discovery meeting → Risk profiling → Proposal (IPS) → Mandate signed → Account funded →
  Active → Closed*, with benchmark, custodian, fees, AUM, performance and attrition risk.
- **Mandate Reviews** (*Scheduled → Pack prepared → Meeting held → Completed*), **AUM Snapshots** (monthly), **SAAC
  Decisions** (house view changes with a briefing to portfolio managers).

### Investment Funds

- **Funds** and **Fund Share Classes** — ISIN, currency, risk, minimums, fees, dealing frequency and cut-off; latest NAV.
- **NAV History**, **Fund Holdings** (units, value, gain; pledged units).
- **Fund Orders**: *Captured → Checks complete → Sent to TA → Confirmed* (or *Rejected*) — subscriptions, redemptions,
  switches. KYC must be approved and the fund suitable (or overridden); the operations checker approves; the transfer
  agent's reference is recorded and the client gets a confirmation.
- **Fund Campaigns** — the FMB 2029 series: *Planned → Window open → Allocating → Closed*, target and progress.
- **Dividend & Distribution Notices**.

### Trading Solutions

- **Securities Accounts**: *Requested → KYC & appropriateness → Agreement → CDS opening → Active → Closed*.
- **Order Intake Log**: *Received → Sent to OMS → Executed* — phone and email instructions time-stamped and handed to the
  order system; orders on a **restricted** issuer are refused.
- **IPO / Bond Book** (indications of interest) and **Research & Market Statistics**. On a research note or weekly
  highlights, **Send to subscribers** emails it to every active subscriber of that topic, in their language, skipping
  clients who opted out of marketing. *Sent* is ticked and **Opens** counts how many recipients opened it (an
  estimate: some mail apps block images).

### Corporate Advisory (behind the advisory wall)

- **Advisory Mandates**: *Origination → Pitch → Conflict check → Engagement letter → Execution → Completed / Abandoned*.
  Code names keep deals discreet. Moving to *Conflict check* opens a **Conflict Check** for Compliance (*Requested →
  Compliance review → Decided*); the decision is written back to the mandate.
- **Deal Teams** (members are added to the **Insider List** automatically), **Investor Bookbuilding** (*Targeted → NDA →
  IM shared → Indication → Committed → Allocated*), **Deliverables & Milestones**, **Time & Effort**, **Fee Invoices**,
  **Tombstones & Credentials**.

### Forex Desk

- **FX Client Profiles** — purpose, volumes, currency pairs, approved products, limits, settlement accounts.
- **FX Quotes**: *Requested → Quoted → Accepted / Rejected / Expired* — accepting books an **FX Deal** with the dealing
  system's reference and the improvement against the board rate.
- **FX Rate Alerts** (*Active → Triggered → Expired*) — the client is told by email or SMS when the target is reached;
  alerts are checked as soon as a new board rate is published, and every hour.
- **FX Reference Rates** (Masters) — the daily TT buying and selling board, published by the dealer.

### Marketing & Consent

**Campaigns** (*Planning → Compliance review → Approved → Live → Completed / Cancelled*) with budget, audience,
attributed enquiries, loans, revenue and ROI. Moving a campaign to *Compliance review* sends a sign-off to Compliance in
**Tools ▸ Approvals**; approval moves it to *Approved* (a return sends it back to *Planning*), and it cannot be approved
or go live without that sign-off. Web enquiries whose link carries the campaign's **tracking code** (`utm_campaign`)
are attributed to it automatically, and the loan application opened on conversion keeps the campaign; **Segments**; **Events & Seminars** and **Registrations** (assigned to the guest's RM, who is told to follow up after attendance);
**Newsletter & Research Subscriptions** (who receives *Send to subscribers*). Clients without consent, flagged do-not-contact or with an open complaint
cannot be added to a campaign.

### Introducers

**Introducers & Partners** (*Applied → KYC → Agreement → Active → Suspended*), **Introducer Referrals** (*Submitted →
Accepted → In progress → Funded / disbursed → Lost*) — a referral creates and routes an enquiry — and **Commissions**
accrued on funded volume, with clawback.

### Revenue

**Revenue Ledger** — arrangement fees, interest income summary, management and performance fees, brokerage, advisory
retainers and success fees, FX spread income; credited to the RM and a referrer; reconciled to finance figures.
A new FX deal posts its spread income and a paid advisory fee invoice posts its fee automatically (**Source** shows
where a line came from); Finance posts the rest by hand. Entering the **finance figure** sets **Reconciliation** to
*Reconciled* or *Variance to investigate*. Search the ledger with several words (`Lending arrangement 2026-10`) and
**Export** downloads the rows shown.

### Service & Complaints

**Service Requests & Complaints**: *New → Acknowledged → In progress → Awaiting client → Resolved → Closed*. The request
type comes from the catalogue (address change, statements, early settlement quote, redemption, top-up, title release,
complaint…), each with its SLA and approval. Complaints are acknowledged automatically, routed to Compliance and cannot
be resolved without a root cause and final response; referral to the Ombudsperson for Financial Services is recorded.
When a request is resolved the client is emailed a satisfaction survey (CSAT and NPS); the scores are recorded on the
request.

### KYC & Compliance

- **KYC Cases**: *Initiated → Documents pending → Under verification → Screening → Risk assessed → Pending approval →
  Approved / Rejected / On hold*. Screening runs on entering *Screening*; the **risk score** combines country, PEP,
  product, channel, occupation, ownership and activity; high risk needs EDD and MLRO approval; periodic reviews open
  automatically (high 1 year, medium 3, low 5).
- **Screening Hits** (true match, false positive, escalate), **KYC Reliance Records** (one entity relying on another's
  KYC).
- **STR Register** (MLRO only): *Raised → MLRO review → Filed with FIU / Closed — no filing*.
- **Restricted & Watch List**, **Conflicts Register**, **Gifts & Hospitality Register**, **Personal Dealing
  Pre-clearance**, **Data Subject Requests (DPA)**: *Received → Verifying identity → In progress → Completed / Refused*.

### Masters

Reference data that drives the formulas — maintained by administrators as ordinary records: website product routing,
Genesis PLR history, countries (AML risk), FX reference rates, model portfolios, KYC risk factors and weights, collateral
types and haircuts, approval matrices, the service request catalogue and reason codes. A change here (for example a new
PLR) takes effect without any release. A new PLR reprices loans and products' "Rate from" by itself; other masters are
read when a record is saved — a routing change (queue, first-contact target) applies from the next enquiry, and a new
risk weight or country score re-scores a KYC case at its next save or review. The approval matrix's "Up to" limits set
the credit approval band (blank = no upper limit).

---

## 10. Step-by-step journeys

### A. Website enquiry to disbursed home loan

| Step | Who | What to do | What happens automatically |
|---|---|---|---|
| 1 | Client | Submits *Get in touch* (Real Estate Loan) on the website | Enquiry created, routed to a loans executive, acknowledged in the client's language, SLA started |
| 2 | Loans executive | Calls the client; moves the enquiry to *Contacted*, then *Qualified*; checks amount and tenure | First-contact SLA met |
| 3 | Loans executive | Moves to *Converted* | Party, relationship, KYC case, consent and loan application created |
| 4 | Loans executive | KYC case: fill the risk questions, collect ID / address / source of funds, move through *Screening* to *Pending approval* | Screening result recorded; approval request to Compliance (MLRO if high risk) |
| 5 | Compliance | **Approvals** ▸ approve | KYC approved; client's KYC status = approved |
| 6 | Loans executive | Application: income, obligations, property value, MCIB consent; *Application captured* → *Documents pending* → *Documents complete* | MCIB report pulled; document request emailed with an upload link; rate, EMI, DSR, LTV and eligibility calculated |
| 7 | Credit analyst | *Credit appraisal*: risk grade, recommendation, conditions; *Credit approval* | Approval request to the right authority |
| 8 | Loans manager / committee | **Approvals** ▸ approve | Moves to *Offer issued*; PDF offer letter filed; e-signature can be sent |
| 9 | Loans executive | Offer signed ▸ *Offer accepted* ▸ *Security & insurance*: valuation, notary, charge, life and building insurance | Security complete calculated |
| 10 | Loans executive | Disbursement amount ▸ *Ready for disbursement* | Approval request to the operations checker |
| 11 | Operations checker | **Approvals** ▸ approve | Loan booked in the LMS; account number recorded |
| 12 | Loans executive | *Disbursed* | Loan account opened; cross-sell referral to Wealth for large loans |

### B. Fund subscription

1. Fund manager: **Investment Funds ▸ Fund Orders ▸ New** — client, share class, amount; tick *Payment proof received*.
   If the fund is riskier than the client's profile, record the override and the client's acknowledgement.
2. Move to *Checks complete* — an approval goes to the operations checker.
3. Operations checker approves — the order is sent to the transfer agent, its reference recorded, the order *Confirmed*
   and the client emailed.

### C. FX deal

1. Dealer: **Forex Desk ▸ FX Quotes ▸ New** — client, profile, product, side, currency, amount.
2. Enter the quoted rate ▸ *Quoted*; when the client agrees ▸ *Accepted*.
3. An **FX Deal** is created and booked in the dealing system with its reference and the improvement against the board
   rate; forwards get a maturity reminder on the dealer's **Reminders** a week before the value date.

### D. Advisory mandate

1. Advisor: **Corporate Advisory ▸ Advisory Mandates ▸ New** with a project code name ▸ *Pitch* ▸ *Conflict check*.
2. Compliance: open the **Conflict Check**, review Genesis's relationships and the restricted list, set the decision
   (*Cleared*, *Managed with controls*, *Declined*).
3. Advisor: *Engagement letter* (signed) ▸ *Execution*; add the deal team (they join the insider list), build the
   investor book, share the information memorandum by secure link.

### E. Complaint

1. Anyone: **Service & Complaints ▸ New**, request type *Complaint*, client, description, channel.
2. The client is acknowledged automatically; Compliance is notified.
3. Owner investigates; resolution requires root cause and final response; the client receives the satisfaction survey.

### F. Wall-crossing

1. Requester: **Tools ▸ Access & Barriers ▸ Wall-crossings** — zone, employee, reason ▸ *Submit request*.
2. Compliance approves for a limited period (never the requester).
3. The person appears on the zone's insider list until the crossing expires.

---

## 11. The client and introducer portal

### Sending a web form to a client

When a client asks for a form — a loan calculator, the investor questionnaire, a call-back request — open
**Tools ▸ Web forms**. Every published form is listed with what it is for.

- **Email to client** — enter the client's email (and name, if you like), pick English or French, optionally
  preselect a product and add a personal note, then **Send**. The client gets a short email with a button that
  opens the form. The email is recorded under Email logs.
- **Copy link** — copies the form's address, with the product you preselected, to paste into WhatsApp, Teams or a
  message.
- **Open** — shows the form in a new tab.
- **Talk to** (on *Get in touch* and *Request a call-back*) — name the person the client will deal with, for
  example yourself. The form shows *You'll speak with …* and the enquiry is assigned to that person instead of the
  usual routing. Leave it on *Normal routing* otherwise.

Answers become records in the CRM (an enquiry, a call-back request…) and are routed to the right team, exactly like a
form filled in from the website. Links you share are tagged as coming from the CRM, so reports can tell them apart.

### The website preview

`/site/genesis-capital` shows what the Genesis website can display straight from the CRM: indicative exchange rates,
the prime lending rate, fund prices with a performance chart, and every published form. No sign-in is needed. The
website team can use the same data feeds (listed at the bottom of the page).

### The portal

`/portal/<workspace>` — for Genesis, `/portal/genesis-capital`.

- **Clients** sign in with the email Genesis holds and a one-time code. They see their loan applications (and upload
  requested documents), loans, fund holdings (with a **Redeem** button on each holding) and fund orders (with
  **+ Invest** for a new subscription), mandates, trading accounts, FX deals,
  requests and complaints (and can raise new ones), consents (and can change them) and their KYC case (to upload a
  renewed ID). They can download letters and reports shared with them and message their RM.
- **Introducers** submit referrals, follow them (when the prospect agreed to share) and see their commissions.

What clients send arrives in the CRM: messages as activities with a notification to the owner, uploads in the record's
Docs tab, new requests and orders in their modules.

---

## 12. Working in French

Click **FR** in the header. Module, object, field, stage and picklist names switch to French wherever a translation
exists; buttons and menus stay in English. Client letters and emails follow each client's **preferred language**
automatically, whatever language you work in.

---

## 13. Glossary

### Genesis and the regulatory context

| Term | Meaning |
|---|---|
| **Genesis Capital** | The Genesis Group's financial-services brand. Its licensed entities are the CRM's **business units**. |
| **Business unit (entity)** | LND — Genesis Life Ltd (Loans) · WLT — Genesis Wealth Managers Ltd · FND — Genesis Global Funds Ltd · SEC — Genesis CMB Securities Ltd · ADV — Genesis Corporate Advisors Ltd · FX — Genesis Forex Ltd. |
| **FSC** | Financial Services Commission, Mauritius — licenses and supervises Genesis's entities. |
| **BoM** | Bank of Mauritius — licenses Genesis Forex; FX deals carry a **BoM purpose code**. |
| **FIU** | Financial Intelligence Unit — receives suspicious-transaction reports. |
| **FIAMLA** | Financial Intelligence and Anti-Money Laundering Act; with its 2018 regulations and the FSC AML/CFT Handbook it sets KYC and AML duties. |
| **DPA 2017** | Mauritius Data Protection Act — consent, data subject rights, 30-day response. |
| **Ombudsperson for Financial Services** | Independent body a client may refer an unresolved complaint to. |

### Clients, sales and service

| Term | Meaning |
|---|---|
| **Party** | A client or prospect — an individual or an organisation — held once for the whole group. |
| **Client 360** | The single view of everything Genesis does with a client (the party's fields and Related tab). |
| **Client relationship** | The client's relationship with one entity, with its own status and RM. |
| **RM** | Relationship manager — the client's main contact. |
| **Segment** | Retail, Affluent, HNW (high net worth), UHNW (ultra-high net worth), Corporate, Institutional. |
| **TRV** | Total relationship value — loans, AUM, fund holdings, securities and FX volume, in MUR (and USD). |
| **Enquiry / lead** | A request for information from a prospect or client before an application. |
| **Lead score / grade** | Points for amount, existing client, completeness and feasibility; grade A (best) to F. |
| **Speed to lead** | Time from enquiry to first contact; the SLA target is four business hours. |
| **Conversion** | Turning a qualified enquiry into a client record (party), relationship, KYC case and application. |
| **Nurture** | An enquiry kept warm for later contact. |
| **Referral** | A client passed from one Genesis entity to another, with credit to the referrer. |
| **Introducer** | An external partner (broker, agent, notary, accountant) who refers clients for a commission. |
| **Protection window** | Days during which an introducer's referral is credited to them. |
| **Clawback** | Commission returned if the referred business is cancelled early. |
| **Opportunity** | A potential sale with value, probability and expected close. |
| **Weighted value** | Opportunity value × probability. |
| **NBA — next-best action** | A rule-based suggestion of the next product to offer a client. |
| **Cross-sell** | Selling another entity's product to an existing client. |
| **Campaign / segment** | A marketing action and the audience it targets. |
| **Consent** | Permission per purpose (marketing, research, profiling, group sharing) and channel; can be withdrawn. |
| **Suppression** | Excluding clients from marketing (no consent, do-not-contact, open complaint). |
| **Service request** | A client request from the catalogue (address change, statement, settlement quote…). |
| **Complaint** | An expression of dissatisfaction, recorded in the FSC-aligned register with root cause and redress. |
| **CSAT / NPS** | Customer satisfaction score (1–5) / Net Promoter Score (likelihood to recommend, 0–10). |

### Lending

| Term | Meaning |
|---|---|
| **PLR** | Genesis Prime Lending Rate (6.825% from 1 January 2026). Variable loans are priced as PLR ± a margin. |
| **Margin** | The product's spread over or under the PLR (e.g. Real Estate −0.675% → 6.15%). |
| **EMI** | Equated monthly instalment — the monthly repayment. |
| **Tenure** | Loan term in months. |
| **Moratorium** | A period with reduced or no repayments (e.g. during construction). |
| **Interest-only** | Repaying only interest each month; capital at the end. |
| **LTV** | Loan-to-value — loan amount ÷ property or collateral value. |
| **DSR / DTI** | Debt-service ratio — monthly debt repayments ÷ net monthly income. |
| **Age at maturity** | The borrower's age when the loan ends; Genesis's limit is 65. |
| **Eligibility** | Whether the application meets product limits (age, tenure, LTV, minimum amount). |
| **MCIB** | Mauritius Credit Information Bureau — the credit bureau; reports need the client's consent. |
| **Credit appraisal** | The analyst's assessment: capacity, risk grade, recommendation, conditions. |
| **Risk grade** | Internal credit grade from A (strong) to E (weak). |
| **Approval matrix** | Who may approve which amount or exception. |
| **Conditions precedent / subsequent** | Conditions to meet before / after disbursement. |
| **Offer letter** | The formal loan offer; valid 30 days, then it lapses. |
| **Security perfection** | Completing security: valuation, notary, registering the charge, assigning insurance. |
| **First-rank fixed charge** | A mortgage giving Genesis first claim on the property. |
| **Assignment of insurance** | Life and building policies made payable to Genesis Life Ltd. |
| **Pledge** | Investments (fund units, securities) given as security without selling them. |
| **Haircut** | The percentage deducted from collateral value to get its lending value. |
| **Lending value** | Collateral value after haircut. |
| **Margin call** | A demand to restore LTV on an investment-backed loan (extra collateral or repayment); liquidation if not cured. |
| **Disbursement / tranche** | Paying out the loan, in one go or in stages (tranches). |
| **Maker-checker** | One person prepares, a different person approves. |
| **LMS** | Loan management system — the system of record for booked loans. |
| **Arrears / bucket** | Overdue amounts grouped by days past due (1–30, 31–60, 61–90, 90+). |
| **Promise to pay** | The borrower's commitment to settle arrears by a date. |
| **Credit memo** | The written credit case for a commercial facility. |
| **Financial spreading** | Entering a company's accounts year by year to compute ratios. |
| **DSCR** | Debt-service coverage ratio — cash flow ÷ debt service. |
| **Gearing** | Debt ÷ equity. |
| **Interest cover** | Earnings ÷ interest expense. |
| **Covenant** | A condition the borrower must keep (e.g. DSCR ≥ 1.25x); tested on set dates. |
| **Waiver** | A lender's agreement to overlook a covenant breach, with terms. |
| **Term sheet** | The summary of a commercial facility's terms before documentation. |
| **Group exposure** | Total lending to companies of one group, against the group limit. |

### Wealth, funds and securities

| Term | Meaning |
|---|---|
| **AUM** | Assets under management. |
| **Mandate** | The agreement to manage a client's portfolio: discretionary (Genesis decides), advisory (client decides on advice) or execution-only. |
| **IPS** | Investment Policy Statement — objectives, allocation ranges and restrictions of a mandate. |
| **Model portfolio A–E** | Genesis's reference allocations from most cautious (A) to most dynamic (E). |
| **Risk profile / questionnaire** | The investor questionnaire scoring horizon, loss tolerance, knowledge and objective. |
| **Suitability** | Whether a product fits the client's profile; above the ceiling it needs an override and acknowledgement. |
| **Risk ceiling** | The highest product risk (1–5) suitable for the client. |
| **Appropriateness** | For trading: whether the client understands the products traded. |
| **Client classification** | Retail, professional / sophisticated or institutional investor. |
| **Benchmark** | The index a portfolio or fund is measured against (e.g. MSCI World). |
| **YTD / MTD** | Year-to-date / month-to-date performance. |
| **Net flows** | Money added minus money withdrawn. |
| **Attrition risk** | Signs a client may leave: falling AUM, missed reviews, complaints. |
| **SAAC** | Strategic Asset Allocation Committee — sets the house view and model changes. |
| **Fund / share class** | A collective investment scheme and its version by currency or fee (e.g. MUR class). |
| **ISIN** | International Securities Identification Number of a fund or security. |
| **NAV** | Net asset value per unit — the fund's price. |
| **Units** | Shares of a fund held by an investor. |
| **Subscription / redemption / switch** | Buying / selling fund units / moving between funds. |
| **Cut-off** | Latest time for an order to be dealt at that day's NAV. |
| **Dealing frequency** | How often the fund prices and deals (daily, weekly, quarterly). |
| **TA — transfer agent** | Keeps the fund's register and confirms orders. |
| **Entry / exit fee** | Charges on buying / selling units. |
| **Distribution / dividend** | Income paid to unitholders. |
| **FMB 2029** | Fixed Maturity Bond 2029 — a USD fund holding bonds to May 2029, with quarterly dividends. |
| **Feeder fund** | A fund investing all its assets in another (master) fund. |
| **SEM / SEMDEX** | Stock Exchange of Mauritius / its main index. |
| **CDS** | Central Depository & Settlement — holds Mauritian securities; investors need a CDS account. |
| **OMS** | Order management system used to execute trades. |
| **IOI / bookbuilding** | Indication of interest — an investor's intended amount in an IPO or bond issue. |
| **Restricted list** | Issuers Genesis may not trade or research while it holds inside information. |
| **Watch list** | Issuers monitored by Compliance (visible to Compliance only). |
| **Dormant account** | No trade for 12 months; triggers reactivation. |

### Corporate advisory and forex

| Term | Meaning |
|---|---|
| **Advisory mandate / deal** | An engagement of Genesis Corporate Advisors, referred to by a project code name. |
| **Conflict check** | Compliance's search for conflicts before engagement: cleared, managed with controls or declined. |
| **Engagement letter** | The signed agreement for an advisory mandate: scope, fees, confidentiality. |
| **Retainer / success fee** | A fixed fee during the work / a fee on success (e.g. % of funds raised). |
| **Deal team** | The people working on a mandate. |
| **Insider list** | Everyone holding inside information about a deal, with dates — a regulatory record. |
| **NDA** | Non-disclosure agreement. |
| **IM** | Information memorandum — the confidential document shown to investors. |
| **Tombstone / credential** | A record of a completed deal for future pitches. |
| **Spot / forward / swap** | Exchange now (two business days) / at a fixed future date and rate / now and back later. |
| **TT rate** | Telegraphic-transfer rate: **buy TT** (Genesis buys foreign currency) and **sell TT** (Genesis sells). |
| **Board rate / mid rate** | The published indicative rate / halfway between buy and sell. |
| **Spread income** | Profit from the difference between the deal rate and the mid rate. |
| **Value date** | The settlement date of an FX deal. |
| **Roll-over** | Extending a forward to a later date. |
| **Rate alert** | A client's request to be told when a currency reaches a target rate. |

### Compliance and data protection

| Term | Meaning |
|---|---|
| **KYC / CDD** | Know your customer / customer due diligence — verifying identity, address, source of funds. |
| **EDD** | Enhanced due diligence for high-risk clients and PEPs, with senior approval. |
| **AML / CFT** | Anti-money laundering / countering the financing of terrorism. |
| **PEP** | Politically exposed person — always high risk. |
| **Screening** | Checking names against sanctions, PEP and adverse-media lists. |
| **Screening hit** | A possible match: true match, false positive or escalated. |
| **Risk rating / score** | Low, medium or high from weighted factors (country, PEP, product, channel, occupation, ownership, activity). |
| **Periodic review** | KYC refresh: high risk every year, medium every 3 years, low every 5. |
| **KYC reliance** | One Genesis entity relying on another's approved KYC. |
| **FATCA / CRS** | US and international tax-reporting rules; clients self-certify their tax residency. |
| **TIN** | Tax identification number. |
| **STR** | Suspicious transaction report, filed with the FIU by the MLRO. |
| **MLRO** | Money Laundering Reporting Officer. |
| **Tipping-off** | Telling a client they are under suspicion — prohibited; the STR register hides even its count. |
| **Information barrier / Chinese wall** | Separation that keeps confidential information on one side (e.g. advisory) from the other (e.g. trading). |
| **Barrier zone** | A wall in the CRM: ADV_PRIVATE, MLRO_STR, COMPLIANCE_ONLY, VIP_CLIENTS. |
| **Wall-crossing** | Time-limited, approved permission to go over a wall. |
| **Barrier override** | Permission to see past every wall (MLRO only). |
| **Gifts & hospitality** | Gifts given or received; above MUR 5,000 Compliance decides. |
| **PA dealing** | Staff personal-account dealing; pre-cleared for two business days. |
| **DSR (data)** | Data subject request: access, rectification, erasure, portability, objection — answered within 30 days. |
| **Audit chain** | The tamper-evident log of access, permission and sensitive actions; **Verify integrity** proves it is unaltered. |

### CRM terms

| Term | Meaning |
|---|---|
| **Module** | A sidebar entry grouping related record types (e.g. Retail Lending). |
| **Object** | A record type (e.g. Loan Application). |
| **Record** | One item of an object. |
| **Field** | One piece of information on a record. |
| **Formula / calculated field** | A field computed from others (e.g. EMI); read-only. |
| **Roll-up** | A formula summing or counting related records (e.g. loans outstanding on the party). |
| **Lookup** | A field linking to another record (e.g. the loan's party). |
| **Picklist** | A field with a fixed list of options. |
| **Pipeline / stage** | The sequence of steps a record moves through. |
| **Stage gate** | A rule that must be met before entering a stage. |
| **Workflow / automation** | Steps the system runs when something happens (email, document, approval, new record). |
| **Approval** | A workflow step waiting for a named person's decision. |
| **Assignment rule** | Decides who owns a new record (by entity, product, round robin). |
| **Owner** | The employee responsible for a record. |
| **SLA** | Service-level agreement — a target time, measured by timers. |
| **Escalation** | Notifying a manager when an SLA is at risk or breached. |
| **Checklist** | The documents a record needs. |
| **Merge template** | A letter with placeholders filled from the record (offer letter, notices). |
| **E-signature** | Signing a document online with an audit certificate. |
| **Share link** | A secure, expiring link to a document, with view tracking. |
| **Masked field** | Personal data shown as •••• unless you may reveal it. |
| **Reveal** | Showing a masked value; recorded in the audit chain. |
| **Dashboard / widget** | A page of charts and counters / one chart or counter. |
| **Report** | A saved query with filters, grouping and charts. |
| **Portal** | The secure website for clients and introducers. |
| **Sandbox integration** | A stand-in for an external system (screening, MCIB, LMS, TA, OMS, dealing, SMS) until the live connection is configured. |
| **Ext. ref** | A record's identifier in a source system, used for imports and integrations. |

---

## 14. Questions and troubleshooting

| Question | Answer |
|---|---|
| A record I expect is missing | It may belong to another entity or sit behind a wall. Check with your manager or request a wall-crossing. |
| The stage move is refused | Read the message: it lists what is missing (a field, documents, KYC approval, a decision). |
| The approval does not appear | Approvals go to the role in the approval matrix; the person who started the request never sees it. Managers can check **All pending**. |
| A personal-data field shows •••• | Your role may not view it. Ask Compliance if you need it. |
| A client did not receive an email | Check the client's email and preferred language, and the record's Audit tab for the send. |
| A rate or product term is wrong | Product terms live in **Products & Services**; the PLR in **Masters ▸ Genesis PLR History**. Ask an administrator. |
| I need help on a screen | The general user guides are in [docs/user-guide](../user-guide/README.md). |
