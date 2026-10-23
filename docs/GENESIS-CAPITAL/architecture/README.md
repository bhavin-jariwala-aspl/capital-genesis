# Genesis Capital CRM — architecture diagrams

High-level diagrams of the Genesis Capital CRM for client demos.

| File | What it is |
| ---- | ---------- |
| [genesis-capital-architecture.drawio](genesis-capital-architecture.drawio) | Editable source, two pages. Open in [draw.io / diagrams.net](https://app.diagrams.net) or the draw.io desktop app. |
| [1-module-architecture.png](1-module-architecture.png) · [.svg](1-module-architecture.svg) | **Module architecture**: channels → six business domains (19 modules, their sub-modules and each record type's process) → common modules → masters and platform administration → integrations → technology foundation. |
| [2-business-process-flows.png](2-business-process-flows.png) · [.svg](2-business-process-flows.svg) | **Business process flows**: every pipeline stage by stage, grouped by domain; the main path ends in the green stage, red tags are the exits. |
| [genesis-capital-architecture.pdf](genesis-capital-architecture.pdf) | Both pages in one PDF, for printing or sending. |

The modules, sub-modules and stages come from the Genesis Capital vertical definition
(`backend/prisma/verticals/genesis-capital/modules.js` and the `objects*.js` files). If modules or pipelines change
there, update the diagram to match.
