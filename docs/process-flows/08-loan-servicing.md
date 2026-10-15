# 08 — Loan Servicing

**Sidebar:** Lending ▸ Loan Servicing

## What it is for

Looks after loans once they are booked. The loan book is a daily snapshot from the loan management system (LMS). The
CRM reminds borrowers before each instalment, notifies every variable-rate borrower when the Prime Lending Rate (PLR)
changes, opens collections follow-ups on arrears and raises retention conversations before maturity.

## Who works here

| Role | Does |
|---|---|
| Loans Manager | Approves PLR change campaigns |
| Loans executive / RM | Follows up arrears and maturities |
| Administrator | Records the new PLR in Masters |

## Records

| Record | Holds |
|---|---|
| **Loan Book (LMS view)** | Account number, outstanding, rate, instalment, next due date, arrears days and amount, maturity, LTV, status |
| **PLR Change Campaign** | Old and new rate, effective date, approver |
| **PLR Notice** | Per account: old and new instalment, channel, sent date |
| **Collections action** | Call, letter, promise to pay, escalation, outcome |

## The flow at a glance

PLR change campaign:

```mermaid
flowchart LR
    D(["Draft"]) --> A(["Approved"]) --> N(["Notices generated"]) --> S(["Distributed"])
```

Daily servicing sweeps:

```mermaid
flowchart TD
    L["Loan account, daily"] --> I{"Instalment due<br/>in 3 days?"}
    I -- Yes --> I1["SMS reminder in the client's language"]
    L --> R{"In arrears?"}
    R -- Yes --> R1["Collections follow-up opened for the RM"]
    R -- "Back to current" --> R2["Follow-up closed"]
    L --> P{"New PLR change<br/>not yet notified?"}
    P -- Yes --> P1["Personalised notice emailed and logged"]
    L --> M{"Matures within<br/>6 months?"}
    M -- Yes --> M1["Retention suggestion for the RM"]
```

## Step by step

### A. A new loan enters the book

1. A disbursed application creates the **loan account** with the LMS account number ([flow 05](05-retail-lending.md)).
2. The LMS snapshot refreshes outstanding, instalment, arrears and next due date.

### B. PLR change

| Step | Who | What to do | What the CRM does |
|---|---|---|---|
| 1 | Administrator | Add the new rate in **Masters ▸ PLR history** | Product **Rate from** and new loan pricing update at once |
| 2 | Loans Manager | **New** PLR Change Campaign with old rate, new rate, effective date ▸ **Approved** (approver required) | — |
| 3 | — | Daily sweep | Every variable-rate, unsettled account not yet notified gets a **PLR Notice** (old and new instalment) by email in its language, logged with date and channel |
| 4 | Loans Manager | ▸ **Notices generated** ▸ **Distributed** | Delivery log available on the campaign |

### C. Instalments and arrears

| Step | Who | What to do | What the CRM does |
|---|---|---|---|
| 1 | — | 3 days before each instalment | Sends the borrower an SMS reminder |
| 2 | — | Account enters arrears | Opens a **collections** follow-up (call) for the RM with the arrears bucket |
| 3 | RM | Call, log the outcome, record a **promise to pay** with amount and date, escalate if needed | — |
| 4 | — | Account back to current | Closes the follow-up |

### D. Maturity

1. Six months before maturity the CRM raises a **retention** next-best action for the RM.
2. The RM discusses a new need or reinvestment ([flow 04](04-cross-sell-and-rm-workbench.md)).

### E. Service requests on a loan

Early settlement quotes, statements, title release and similar requests are raised in
[Service & Complaints](17-service-and-complaints.md) from the service catalogue.

## Where to see results

- **Loan Book** dashboard: outstanding by product, arrears buckets (1–30, 31–60, 61–90, 90+), LTV bands, PLR-linked
  share, collections.

## Related flows

[Retail Lending](05-retail-lending.md) · [Collateral & Pledges](07-collateral-and-pledges.md) ·
[Service & Complaints](17-service-and-complaints.md) · [Masters](19-masters.md)
