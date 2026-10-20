# Step 7 — Configure or code?

<!-- nav:top -->
> **[Docs roadmap](../README.md)** › **[Understanding Genesis](README.md)** › 7 of 8 · **For:** Everyone
> ← [Step 6 — What happens automatically](06-what-happens-automatically.md) · [Step 8 — Codebase tour](08-codebase-tour.md) →
<!-- /nav:top -->

> **Track:** both. **Time:** 10 minutes.

The most useful question about any change request is: **who can make it?** Genesis has three answers.

## The three ways to change Genesis

| Way | Who | What it is | Takes effect |
|---|---|---|---|
| **1. The Builder** | The customer's administrator | Screens under `/builder` that edit the blueprint | Immediately, for that workspace only |
| **2. The vertical pack** | Implementation team | Files in `backend/prisma/verticals/genesis-capital/` describing a whole workspace — modules, objects, fields, forms, pipelines, roles, workflows, dashboards, demo data | When the pack is installed or re-installed |
| **3. Platform code** | Developers | The engine in `backend/src` and `frontend/src` | After a release, for every workspace |

The Builder and the pack write the **same tables**. The pack is simply the Builder's work saved as a file, so a
workspace can be rebuilt, copied or reviewed. The installer is **incremental**: it matches rows by name, writes only
what differs and leaves anything the pack does not mention alone, so an administrator's own additions survive a
re-install. (A workflow the pack does define is replaced if it was edited in the Builder.)

## What needs which

| Change | Builder | Pack | Code |
|---|:-:|:-:|:-:|
| New object, field, picklist value, form layout | ● | ● | |
| New pipeline stage, stage gate, required fields per stage | ● | ● | |
| Formula, roll-up, auto-number, validation rule | ● | ● | |
| Workflow, assignment rule, SLA policy, scoring rule | ● | ● | |
| Dashboard, report, email or document template | ● | ● | |
| Role, permission, record scope, business unit, barrier | ● | ● | |
| Appearance: colours, logo, fonts, density | ● | ● | |
| Portal: which objects and fields clients see | | ● | |
| A new **field type** or dashboard widget type | | | ● |
| A server-side validation that needs custom logic | | | ● |
| A connector to a new outside system (beyond webhooks) | | | ● |
| A brand-new kind of screen | | | ● |
| Anything in Steps 3–6 (storage, security, engines) | | | ● |

Rule of thumb: if it is **about the customer's business**, it is configuration. If it is **about how the CRM works**,
it is code.

## Why this matters for estimates

Most requests from a business team are configuration and take hours, not weeks. Effort estimates for typical
processes: [BUILD_EFFORT_AND_CAPABILITIES](../project/build-effort-and-capabilities.md). The Builder's
features in depth: [PLATFORM_BUILDER_EXTENSIONS](../developer-guide/engines/platform-builder-extensions.md) and
[CONFIGURABILITY](../developer-guide/engines/configurability.md).

## A new customer

A new workspace is created in the platform console (onboarding wizard: eight repeatable provisioning steps), then
either configured in the Builder or filled from a vertical pack. See
[TENANT_ONBOARDING](../platform-operations/tenant-onboarding.md).

## Go deeper

| If you are | Read next |
|---|---|
| Decision-makers | [Build effort & capabilities](../project/build-effort-and-capabilities.md) · [Roadmap](../project/roadmap.md) |
| Administrators | [Builder guide](../builder-guide/README.md) — the screens, in build order |
| Implementers | [Implementation](../genesis-capital/implementation.md) · [Platform Builder extensions](../developer-guide/engines/platform-builder-extensions.md) · [Tenant onboarding](../platform-operations/tenant-onboarding.md) |
| Business readers | you have the whole picture — continue with the [Genesis Capital user guide](../genesis-capital/user-guide.md) or your [journey](../README.md#2-choose-your-journey) |

<!-- nav:bottom -->

---

### Where to next

| | |
|---|---|
| **Next** | [Step 8 — Codebase tour](08-codebase-tour.md) — Folder layout, five files to read first, how to trace any feature, tests |
| **Previous** | [Step 6 — What happens automatically](06-what-happens-automatically.md) |
| **On these journeys** | [Decision-maker](../README.md#decision-maker) (step 4 of 8) |
| **Lost?** | [Docs roadmap](../README.md) · [Understanding Genesis](README.md) · [Understanding Genesis](README.md) |
<!-- /nav:bottom -->
