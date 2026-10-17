# Purpose — Why Genesis Capital Uses This CRM

**For:** Genesis Capital's management, business-unit heads, Compliance, Operations and IT.
**In one sentence:** one CRM for every desk — lending, wealth, funds, securities, corporate advisory, forex and
compliance — that follows Genesis Capital's rules and that Genesis Capital's own team can change without developers.

> The working demonstration is branded **Genesis Capital** and uses invented clients, people and documents (every
> sample document is marked SPECIMEN). Its structure — six licensed business units under one group brand, Mauritian
> regulation, MUR as the base currency, English and French — was chosen to match the client's group. At go-live
> the entity names, products, rates, letterheads and staff accounts are replaced with the client's own.

---

## 1. The problem it solves

A multi-entity financial-services group usually runs each business on its own spreadsheets, mailboxes and systems.
That causes the same problems in every group:

| Today | Effect |
|---|---|
| Each entity keeps its own client list | No one sees the whole relationship; the same client is onboarded and KYC-checked several times |
| Enquiries arrive by website, phone, email and walk-in | Some are answered late, some are lost, and nobody can measure speed to lead |
| Approvals happen by email and signature | Hard to prove who approved what, when, and that the maker did not approve their own work |
| Compliance checks sit in separate checklists | Controls are applied after the fact rather than built into the process |
| Cross-selling depends on memory | Opportunities between lending, wealth, funds and forex are missed |
| Reports are assembled by hand | Management sees last month, not today |

## 2. What the CRM gives Genesis Capital

### One client, one record, every desk

Each client — individual or company — is held **once for the whole group** (the *party*). Every entity the client
deals with is a *relationship* on that record. The **Client 360** view adds up loans, wealth AUM, fund holdings,
securities and FX volume into a **total relationship value** in MUR and USD, and lists everything Genesis Capital does
with the client. KYC done once can be relied on by another entity.

### Every process, end to end

Twenty-one modules carry the work from first contact to completion:

| Business area | What runs in the CRM |
|---|---|
| **Client 360** | Product catalogue, clients, enquiries and leads, cross-sell and the RM workbench |
| **Lending** | Retail loans (home, personal, investment-backed), commercial facilities, collateral and pledges, loan servicing and PLR changes |
| **Investments** | Wealth mandates and suitability, fund distribution, securities trading |
| **Advisory** | Corporate advisory deals behind an information barrier, the forex desk |
| **Growth** | Marketing campaigns and consent, introducers and commissions, the revenue ledger |
| **Service** | Service requests and the complaints register |
| **Compliance** | KYC / CDD / AML, screening, STRs, restricted and watch lists, conflicts, gifts, personal dealing, data subject requests |

Each module has its own process-flow document in this folder ([index](README.md)).

### Rules built into the work, not bolted on

The controls a regulator expects are part of each step, so they cannot be skipped:

- **KYC before business.** A fund order, disbursement, trade or account activation is refused unless the client's KYC
  is approved. High-risk and PEP clients need enhanced due diligence and MLRO sign-off.
- **Suitability.** A product riskier than the client's profile is blocked unless an override reason and the client's
  acknowledgement are recorded.
- **Maker-checker.** Credit decisions, KYC sign-off, disbursements, fund orders and other approvals go to a named
  role; the person who started the request can never approve it.
- **Approval matrix.** Loans route by amount: Loans Manager up to MUR 5 million, Credit Committee up to MUR 20 million,
  Board Credit Committee above.
- **Information barriers (Chinese walls).** Advisory deals, suspicious-transaction reports, the watch list and VIP
  clients are visible only to members of the wall — administrators included. Crossing a wall needs a time-limited,
  Compliance-approved request.
- **Personal data.** ID numbers are encrypted and masked; revealing one is recorded in a tamper-evident audit chain.
- **Regulatory timers.** Complaints, data subject requests (30 days under the DPA 2017), KYC turnaround and other
  service levels are timed and escalated automatically.

The regulatory context is Mauritian: FSC licensing and the complaints register, Bank of Mauritius purpose codes on FX
deals, FIAMLA and the FSC AML/CFT Handbook for KYC, the FIU for STRs, the Data Protection Act 2017, and referrals to
the Ombudsperson for Financial Services.

### Automation that removes routine work

72 workflows do the routine steps. Examples:

- A website enquiry is routed to the right entity and person, acknowledged in the client's language, scored A–F and
  given an indicative rate and instalment — before anyone touches it.
- Converting an enquiry opens the client record, the entity relationship, the KYC case, the consent record and, for a
  retail loan, the loan application.
- Moving a loan to *Offer issued* produces the PDF offer letter on Genesis Capital's letterhead and emails the client;
  unaccepted offers lapse after 30 days.
- A change of the Prime Lending Rate sends every variable-rate borrower a personalised notice with the old and new
  instalment.
- Daily sweeps raise next-best actions (for example a fund holder with no loan is offered an investment-backed loan),
  open KYC periodic reviews, warn of expiring IDs, monitor LTV and issue margin calls.

### Clients and partners served online

- **Website forms** (enquiry, loan calculator, investor questionnaire, call-back, newsletter) feed the CRM directly.
- **Secure upload links** let a client send requested documents from a phone without signing in.
- **The client portal** shows loans, applications, fund holdings and orders (with *Invest* and *Redeem*), mandates,
  trading accounts, FX deals, requests and complaints, consents and KYC — and lets clients message their RM.
- **The introducer portal** lets brokers, agents and other partners submit referrals and follow their commissions.
- **Website feeds** publish FX rates, fund NAVs and the PLR straight from the CRM.

### Management sees today, not last month

Fifteen dashboards — Group Executive, Lead Funnel, Lending Pipeline, Loan Book, Wealth, Funds, Trading, Corporate
Advisory, Forex, Compliance, Service, RM League Table, Marketing, Regulatory Extracts and each RM's *My Workbench* —
update as the work happens. Every widget counts only what the viewer may see. Staff build and schedule their own
reports without IT.

### Genesis Capital's team can change it

Every screen, field, stage, rule, workflow, letter and dashboard is a **setting**, not code. Genesis Capital's
administrators can add a field, change an approval limit, add a product or adjust a workflow in the Builder, and the
change appears at once with no release. Reference data such as the PLR, FX board, haircuts and approval matrices is
maintained as ordinary records.

## 3. Who uses it and for what

| Role | Uses the CRM to |
|---|---|
| **Relationship manager** | See every client's full relationship, work enquiries and next-best actions, log meetings, track targets |
| **Loans executive** | Take an enquiry through application, documents, offer, security and disbursement |
| **Credit analyst / committee** | Appraise applications and facilities, and approve within their limit |
| **Operations checker** | Check and release disbursements and fund orders (four eyes) |
| **Portfolio / fund manager** | Run mandates, reviews, SAAC decisions, fund orders and campaigns |
| **Trader** | Open securities accounts, log orders, run the IPO / bond book, distribute research |
| **Corporate advisor** | Run deals behind the wall: conflict checks, deal teams, investor books, fees |
| **Forex dealer** | Quote, book deals, manage rate alerts and forward maturities |
| **Marketing** | Run campaigns, events and subscriptions within consent rules |
| **BD / unit head** | Manage introducers, approve service requests, follow the funnel |
| **Compliance officer / MLRO** | Approve KYC, run the registers, manage barriers, file STRs, answer data subject requests |
| **COO / ExCo** | Follow the group on the executive dashboard |
| **Internal audit** | Read-only access to everything, with the audit trail |

## 4. What changes for Genesis Capital

| Outcome | How the CRM delivers it |
|---|---|
| Faster response to prospects | Automatic routing and acknowledgement; first contact timed against a four-business-hour target |
| Shorter time to decision | Gated stages, automatic document requests and approvals that go straight to the right person |
| One KYC per client for the group | Group party record and KYC reliance between entities |
| Fewer compliance gaps | KYC, suitability, restricted-list and barrier checks enforced in the process, with a tamper-evident audit trail |
| More revenue per client | Daily next-best actions and referrals between entities, with credit to the referring RM |
| Fewer manual letters and notices | Offer, decline, PLR, margin-call, KYC-refresh and engagement letters generated in English or French |
| Better client experience | Self-service portal, upload links, status emails in the client's language |
| Live management information | Fifteen role-based dashboards and self-service reports |

## 5. What Genesis Capital provides to go live

The demonstration runs end to end today. External systems are connected through **sandbox integrations** that return
realistic responses; going live means entering each provider's details in *Builder ▸ Integrations*, with no change to
the workflows.

| Item | Needed from Genesis Capital |
|---|---|
| Entity names, letterheads, product sheets, fees, rates | Confirmation of the content to replace the Genesis placeholders |
| Staff list, roles, business units and approval limits | The organisation chart and delegated authorities |
| Loan management system, transfer agent, OMS / CDS, FX dealing system | Connection details and test access |
| Sanctions / PEP screening, MCIB, SMS provider | Provider contracts and credentials |
| Email sending (SMTP) | A sending domain and account |
| Single sign-on (Entra ID or Google) and two-way calendar sync | Genesis Capital's identity tenant and an app registration |
| WhatsApp | A Meta WhatsApp Business account |
| Data migration | Client and product extracts; every object accepts imports matched on an external reference |

Not yet included: full translation of buttons and menus into French (labels, stages, picklists and all client
correspondence are already bilingual), e-KYC / OCR, telephony integration and infrastructure-as-code for the hosting
platform.

## 6. Where to go next

- [Process-flow index](README.md) — one document per module
- [Genesis Capital user guide](../GENESIS-CAPITAL/genesis-capital-user-guide.md) — how to use every screen
- [Implementation record](../GENESIS-CAPITAL/IMPLEMENTATION.md) — what was built against each requirement
- [Client sandbox](../GENESIS-CAPITAL/CLIENT_SANDBOX.md) — how Genesis Capital's staff can try the CRM safely
