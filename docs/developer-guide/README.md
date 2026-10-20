# Developer Guide

<!-- nav:top -->
> **[Docs roadmap](../README.md)** › **Developer guide** — Engineers
<!-- /nav:top -->

Technical reference for engineers building on, extending, supporting or deploying Genesis.

## Before you start

1. Read [Understanding Genesis](../understanding/README.md), **all eight steps, both parts** (about 2.5 hours). It
   gives you the model every document below assumes: blueprint + envelope + values storage, the tenant filter, the
   access locks and the event flow.
2. Run it: [Installation](../getting-started/installation.md).
3. Then follow the core reading in order, and open an engine reference when you work on that feature.

## Core reading (in order)

<!-- nav:toc:dev-core -->
| # | Document | For | What you'll learn |
|---|---|---|---|
| 1 | [Architecture & setup](architecture-and-setup.md) | Engineers | Stack, structure, runtime loading pipeline, patterns, troubleshooting |
| 2 | [Database schema](database-schema.md) | Engineers | Every table's columns, types and relationships; SQL recipes for record data |
| 3 | [Data dictionary](data-dictionary.md) | Engineers | Why each table exists and when its rows are written |
| 4 | [API reference](api-reference.md) | Engineers, integrators | Every endpoint, its purpose and who calls it |
| 5 | [Security](security.md) | Engineers, security reviewers | Auth, RBAC, tenant isolation, PII, input validation, known gaps |
| 6 | [Metadata configuration details](metadata-configuration.md) | Engineers | How metadata (modules, objects, fields, forms) is configured and rendered |
| 7 | [Performance optimisation](performance-optimization.md) | Engineers | Metadata caching and optimistic UI |
| 8 | [Design system](design-system.md) | Frontend engineers | Tokens, shared components, patterns, new-page checklist |
| 9 | [Contributing](contributing.md) | Engineers | Code style, testing, pull requests |
<!-- /nav:toc:dev-core -->

## Going further

| Folder | What is in it |
|---|---|
| [engines/](engines/README.md) | One reference per engine: workflows, SLA, reporting, dashboards, documents, social, currency, settings… |
| [ai-reporting/](ai-reporting/README.md) | "Ask Genesis": what is built, the LLM primer, the architecture study and the operating plans |

## Key technical facts

- **Backend:** Node.js, Fastify 5, Prisma 6, MySQL 8, Redis (optional — the server falls back to the database)
- **Frontend:** React 18, Vite 7, Tailwind 3, TanStack React Query 5, Zustand 4
- **Data model:** 99 Prisma models; every business record is a `records` row plus `record_field_values` rows
  ([why](../understanding/03-how-data-is-stored.md))
- **Tenancy:** a Prisma extension adds `tenant_id` to every query ([how](../understanding/04-how-a-request-travels.md))
- **Auth:** JWT (8 h) + rotating refresh tokens (14 days), bcrypt (12 rounds), optional TOTP
- **Automation:** fire-and-forget after the response; workflows have a 50-step loop guard
- **Tests:** backend Jest (`cd backend && npm test`), frontend Vitest (`cd frontend && npm test`)
- **Conventions:** UI components use default exports; React Query v5 `useMutation` takes one options object and
  exposes `isPending`; Tailwind classes must be complete static strings
