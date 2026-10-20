# Understanding Genesis CRM — a step-by-step guide

<!-- nav:top -->
> **[Docs roadmap](../README.md)** › **Understanding Genesis** — Everyone — start here
<!-- /nav:top -->

This guide takes you from "what is this?" to "I know where everything is", in eight short steps. It is the place to
start before any other document in `docs/`.

## Pick your track

| You are… | Read | Then go to |
|---|---|---|
| **Business** — management, product owner, sales, business analyst, a client's project team | Steps 1, 2, 3 (Part A), 5 (Part A), 6 (Part A), 7 | [Genesis Capital user guide](../genesis-capital/user-guide.md), [process flows](../genesis-capital/process-flows/README.md), [tutorial videos](../genesis-capital/videos/README.md) |
| **Administrator** — configures the CRM in the Builder | All of the business track, plus Step 5 (Part B) | [Admin guide](../administration/README.md), [Builder user guides](../using-the-crm/README.md) |
| **Engineer** — develops, supports or integrates | All steps, both parts | [Developer guide](../developer-guide/README.md) |

Every step has a **Part A** in plain language and, where it matters, a **Part B** with the technical detail. Business
readers can stop at the end of Part A of any step.

## The map

```text
                         ┌──────────────────────────────────────────────┐
  WHY      Step 1        │ What Genesis is and the problem it solves    │
                         └──────────────────────┬───────────────────────┘
                                                ▼
  WHAT     Step 2        │ The building blocks: workspace, module, object, field, record, stage, form │
                                                ▼
           Step 3        │ How data is stored and read  (the key idea: blueprint + envelope + values) │
                                                ▼
  HOW      Step 4        │ How a request travels: sign-in → screen → server → database → back         │
           Step 5        │ Who sees what: workspaces, roles, ownership, business units, barriers, PII │
           Step 6        │ What happens automatically: workflows, routing, scoring, SLAs, schedulers  │
                                                ▼
  CHANGE   Step 7        │ Configure or code? What an admin changes vs what needs a developer         │
           Step 8        │ Codebase tour: where each piece lives and how to trace a feature           │
```

| Step | Title | Business | Engineer | Time |
|---|---|---|---|---|
| 1 | [What Genesis is](01-what-genesis-is.md) | ● | ● | 10 min |
| 2 | [The building blocks](02-building-blocks.md) | ● | ● | 15 min |
| 3 | [How data is stored and read](03-how-data-is-stored.md) | Part A | ● | 20 min |
| 4 | [How a request travels](04-how-a-request-travels.md) | Part A | ● | 15 min |
| 5 | [Who sees what](05-who-sees-what.md) | Part A | ● | 20 min |
| 6 | [What happens automatically](06-what-happens-automatically.md) | Part A | ● | 20 min |
| 7 | [Configure or code?](07-configure-or-code.md) | ● | ● | 10 min |
| 8 | [Codebase tour](08-codebase-tour.md) | — | ● | 30 min |

## Five ideas to keep in mind

1. **Genesis is a platform, Genesis Capital is a configuration of it.** The platform knows nothing about loans or
   funds; the Genesis Capital *vertical pack* teaches it (Step 7).
2. **The data model is data.** Objects, fields, forms, pipelines and rules are rows in `ui_*` tables, not code (Step 2).
3. **Every business record is one envelope plus one row per field.** That is why tables like `crm_contacts` are empty
   (Step 3).
4. **Every row belongs to one workspace (tenant).** The server adds the tenant filter to every query automatically
   (Steps 4 and 5).
5. **Saving a record starts things.** Workflows, assignment, scoring, SLA timers and roll-ups react to a save; they
   never block it (Step 6).

## How this guide was written

It reflects the code as of October 2026 and the Genesis Capital workspace — the only workspace the seed builds. Each
technical claim was checked against the source. If something here disagrees with the code, the code is right — please
fix the guide.
