# Step 1 — What Genesis is

<!-- nav:top -->
> **[Docs roadmap](../README.md)** › **[Understanding Genesis](README.md)** › 1 of 8 · **For:** Everyone
> [Step 2 — The building blocks](02-building-blocks.md) →
<!-- /nav:top -->

> **Track:** both. **Time:** 10 minutes.

## In one sentence

Genesis CRM is a **configurable CRM platform**: one product that each customer shapes into its own system, from the
browser, without developers. **Genesis Capital** is the configuration built on it for a financial-services group.

## Two layers: platform and vertical

| | Genesis CRM (the platform) | Genesis Capital (the vertical) |
|---|---|---|
| What it is | The engine: screens, forms, storage, security, automation, reports | One customer's business set up on that engine |
| Knows about | Objects, fields, records, stages, rules — in general | Clients, enquiries, loans, funds, KYC, forex… |
| Changed by | Developers | Administrators in the Builder, or the vertical pack file |
| Analogy | A spreadsheet program | One workbook built in it |

Everything you see in the demo — the Clients module, the loan pipeline, the KYC checks — is configuration. A second
customer in a different industry would get its own configuration on the same platform, in the same database, fully
separated from Genesis Capital.

## What Genesis Capital does with it

Genesis Capital is a (fictional) Mauritian group with six licensed business units — lending, wealth, funds,
securities, corporate advisory and forex — working in MUR, English and French. The CRM gives it:

- **One client, one record** across every desk (the *party*), with a Client 360 view of the whole relationship;
- **Every process end to end**: enquiry → client → KYC → loan application → approval → servicing, and the equivalents
  for wealth, funds, trading, advisory and forex;
- **Controls built in**: four-eyes approvals, information barriers between desks, masked personal data and a
  tamper-evident audit trail;
- **Automation**: routing of enquiries, follow-up tasks, service-level timers and escalations;
- **Live reporting**: dashboards per role, self-service reports and a natural-language "Ask Genesis".

Full purpose: [Why Genesis Capital uses this CRM](../genesis-capital/process-flows/00-purpose.md).

## Who uses it

| Who | Where they work |
|---|---|
| Staff (relationship managers, loans, compliance, operations…) | The **workspace** — modules, records, tasks, dashboards |
| The customer's CRM administrator | The **Builder** — defines objects, fields, forms, rules |
| The customer's clients and introducers | The **portal** — a small, separate site that shows only their own data |
| The Genesis platform operator | The **platform console** — creates workspaces, sets plans and features |

## What it is built with

A web application: a React front end in the browser, a Node.js (Fastify) server, a MySQL database, and optionally
Redis as a cache. It can run on one machine with Docker or on cloud hosting. Step 8 covers the code.

## Go deeper

| If you are | Read next |
|---|---|
| Business | [Why Genesis Capital uses this CRM](../genesis-capital/process-flows/00-purpose.md) · [Demo pitch](../genesis-capital/demo-pitch.md) |
| Everyone | carry on to Step 2 — the vocabulary every other document uses |

<!-- nav:bottom -->

---

### Where to next

| | |
|---|---|
| **Next** | [Step 2 — The building blocks](02-building-blocks.md) — Workspace, module, object, field, record, stage, form, lookup and role — and how they fit |
| **On these journeys** | [Decision-maker](../README.md#decision-maker) (step 1 of 8) · [Genesis Capital staff](../README.md#genesis-capital-staff) (step 1 of 9) · [Platform operator](../README.md#platform-operator) (step 1 of 9) |
| **Lost?** | [Docs roadmap](../README.md) · [Understanding Genesis](README.md) · [Understanding Genesis](README.md) |
<!-- /nav:bottom -->
