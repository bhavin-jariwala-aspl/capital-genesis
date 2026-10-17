# Process Flows — Genesis CRM for Genesis Capital

These documents explain, in plain steps, how work moves through each module of the CRM from the first touch to the
finished outcome. Each module has its own file. Start with the purpose document if you are new to the CRM.

The demo workspace is branded **Genesis Capital**. Its six business units mirror a multi-entity financial-services
group (lending, wealth, funds, securities, corporate advisory, forex). At go-live the names, letterheads, product
sheets, rates and staff accounts become the client's own. The flows stay the same.

## Start here

| Document | Read it to learn |
|---|---|
| [00 — Purpose: why Genesis Capital uses this CRM](00-purpose-genesis-capital.md) | What the CRM is for, who uses it and what it changes for Genesis Capital |

## Module process flows

| # | Module | Sidebar section | One-line summary |
|---|---|---|---|
| 01 | [Products & Services](01-products-and-services.md) | Client 360 | The product catalogue that prices and routes everything else |
| 02 | [Clients (Client 360)](02-clients-client-360.md) | Client 360 | One golden record per client, shared by every desk |
| 03 | [Enquiries & Leads](03-enquiries-and-leads.md) | Client 360 | Website, phone, walk-in and referral enquiries to a converted client |
| 04 | [Cross-sell & RM Workbench](04-cross-sell-and-rm-workbench.md) | Client 360 | Next-best actions, opportunities, meeting notes and RM targets |
| 05 | [Retail Lending](05-retail-lending.md) | Lending | Home, personal and investment-backed loans from application to disbursement |
| 06 | [Commercial Lending](06-commercial-lending.md) | Lending | Corporate facilities, credit memo, covenants and annual review |
| 07 | [Collateral & Pledges](07-collateral-and-pledges.md) | Lending | Collateral register, revaluations, LTV monitoring and margin calls |
| 08 | [Loan Servicing](08-loan-servicing.md) | Lending | Loan book, PLR change notices, instalment reminders and collections |
| 09 | [Wealth Management](09-wealth-management.md) | Investments | Risk profiling, suitability, mandates and reviews |
| 10 | [Investment Funds](10-investment-funds.md) | Investments | Fund orders with maker-checker, holdings, NAVs and the FMB 2029 campaign |
| 11 | [Trading Solutions](11-trading-solutions.md) | Investments | Securities accounts, order intake, IPO / bond book and research |
| 12 | [Corporate Advisory](12-corporate-advisory.md) | Advisory | Deals behind the advisory wall: conflict check, insiders, investor book |
| 13 | [Forex Desk](13-forex-desk.md) | Advisory | FX quotes to deals, rate alerts and forward maturities |
| 14 | [Marketing & Consent](14-marketing-and-consent.md) | Growth | Campaigns, segments, events, subscriptions and consent |
| 15 | [Introducers](15-introducers.md) | Growth | External partners, their referrals and commissions |
| 16 | [Revenue](16-revenue.md) | Growth | The revenue ledger credited to RMs and referrers |
| 17 | [Service & Complaints](17-service-and-complaints.md) | Service | Service requests and the FSC-aligned complaints register |
| 18 | [KYC & Compliance](18-kyc-and-compliance.md) | Compliance | KYC / AML cases, screening, STRs, registers and data subject requests |
| 19 | [Masters](19-masters.md) | Masters | Reference data that drives formulas and routing |
| 20 | [Tools: approvals, documents, SLAs, access](20-tools.md) | Tools | The shared services every module uses |
| 21 | [Client & Introducer Portal](21-client-and-introducer-portal.md) | Outside the CRM | What clients and introducers do online, and where it lands |

## How to read a flow

Every module file uses the same layout:

1. **What it is for** — the business purpose in two or three lines.
2. **Who works here** — the roles involved.
3. **Records** — the record types (objects) in the module.
4. **The flow at a glance** — a diagram of the stages.
5. **Step by step** — who does what, and what the CRM does by itself.
6. **Rules and controls** — gates, approvals and blocks that protect the process.
7. **Timers (SLAs)** — targets the CRM measures, where the module has them.
8. **Where to see results** — dashboards and reports.

### Symbols used in the diagrams

| Shape | Meaning |
|---|---|
| Rounded box | A stage the record sits in |
| Diamond | A decision or check |
| Arrow label | What moves the record on (a person, an approval, a timer) |

### Terms you will see everywhere

| Term | Meaning |
|---|---|
| **Stage** | A step in a record's pipeline (for example *Credit appraisal*). Move it by dragging the card or using the stage bar. |
| **Gate** | A rule that refuses a stage move until the record is ready. The message names what is missing. |
| **Approval** | A step that waits in **Tools ▸ Approvals** for a named role. The person who started it can never approve it (maker-checker). |
| **Automation** | Steps the CRM runs by itself when a record is created, changes stage, or on a daily or hourly sweep. They appear in the record's **Audit** tab. |
| **Sandbox integration** | A stand-in for an external system (LMS, transfer agent, OMS, dealing system, screening, MCIB, SMS) until the live connection is configured. |

## Related documents

- [Genesis Capital user guide](../GENESIS-CAPITAL/genesis-capital-user-guide.md) — screen-by-screen help and the full glossary
- [Implementation record](../GENESIS-CAPITAL/IMPLEMENTATION.md) — requirement-by-requirement delivery, roles and demo accounts
- [Demo pitch and Q&A](../GENESIS-CAPITAL/DEMO_PITCH.md) — the scripted client demo
