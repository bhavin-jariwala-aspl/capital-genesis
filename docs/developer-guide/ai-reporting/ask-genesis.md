# AI Reporting — "Ask Genesis"

<!-- nav:top -->
> **[Docs roadmap](../../README.md)** › **[AI reporting](README.md)** › 1 of 5 · **For:** Engineers, administrators
> ← [Status tracker](../engines/status-tracker.md) *(Engine references)* · [LLM primer](llm-primer.md) →
> New to Genesis? Background: [Understanding Genesis › How data is stored and read](../../understanding/03-how-data-is-stored.md)
<!-- /nav:top -->

**Status:** shipped (September 2026). This is the implementation note for the natural-language
layer over the reporting engine. The design study that preceded it — model selection, the full
threat analysis, the phased roadmap — is [architecture-study.md](architecture-study.md);
[local-llm-operations.md](local-llm-operations.md) covers obtaining and hosting a model, and
[llm-primer.md](llm-primer.md) the concepts. This document describes what was built, how it is
wired, and how to run it.

---

## The one decision

**The model produces a report config — never SQL, never code.** The config is the same declarative
DSL the report builder produces (`{ source, viz, metrics, group_by, filters, sort, limit, compare }`,
see [reporting.md](../engines/reporting.md#the-config)). Everything after the model is the existing engine:

```text
question ─► catalogue selection ─► LLM plan ─► validate + expand ─► ReportService.run ─► chart pick ─► narrative
            (lexical, no model)    (JSON-schema      (closed vocabulary,   (scope-clamped,     (rules over    (statistics always;
                                    constrained)      one repair)           tenant-scoped)      the result)    model summary checked)
```

Consequences that make the feature safe by construction rather than by prompt:

- The model cannot reach a table, column or row the builder cannot. That also limits what Ask can
  answer: the report registry holds seven fixed typed sources (leads, accounts, opportunities, cases,
  tasks, activities, SLA) and cannot see Builder objects. In the Genesis Capital workspace the
  leads, accounts, opportunities and cases sources read the empty `crm_*` tables, and none of the
  pack's own objects (enquiries, loan applications, funds, …) can be asked about.
- The model has no database access, no
  tool access, and its output is validated field-by-field against `report-registry.js` before
  anything runs.
- Visibility is enforced by `ReportLibraryService.resolveScope` exactly as for a hand-built report;
  the prompt *tells* the model the user's scope only so it does not add owner filters itself.
- A wrong answer is a wrong **report** — visible, drillable, fixable in the builder — not a wrong
  number nobody can check. "Save as report" turns any answer into an ordinary saved report.
- Business definitions live in code (`report-semantics.js` → `METRICS`) as config fragments the
  model *references by name*. It can pick the wrong metric (a visible error) but cannot get
  "won revenue" subtly wrong (a silent one).

---

## Files

| File | Role |
|---|---|
| `backend/src/services/llm/provider.js` | Provider abstraction: `OllamaProvider` (default, `/api/chat` with a JSON-schema `format`), `OpenAICompatibleProvider` (vLLM, LM Studio, hosted), `StubProvider` (tests). Interface: `generateJson`, `generateText`, `health` |
| `backend/src/services/report-semantics.js` | Source synonyms and cautions, field synonyms, **named metrics as config fragments** with `allowed_dimensions`, the sensitive-field denylist |
| `backend/src/services/ai-reporting.service.js` | The pipeline: plan schema derived from the registry, catalogue selection, prompt, validator, chart recommender, numeral grounding, `ask()` / `explain()` |
| `backend/src/routes/ai-reports/index.js` | `/api/ai-reports` — `status`, `suggestions`, `ask`, `explain` |
| `frontend/src/components/reports/AskPanel.jsx` | The conversation UI under **Tools → Reports → Ask Genesis**. Navigation is one level deep: the back arrow goes from a conversation to the landing page (conversation kept, reopenable) and from the landing page out to the report library |
| `frontend/src/components/reports/InsightsPanel.jsx` | "Explain" on any saved report's result |
| `backend/tests/ai-reporting.test.js` | 35 tests against the stub provider — no model needed |

Ask lives under **Tools → Reports**, not Builder, for the same reason reporting does: it must be
available to every user, and `/builder/*` is admin-gated.

---

## The pipeline in detail

### 1. Catalogue selection (no model call)

Sending all ~170 fields every turn costs tokens and accuracy. `routeSources` scores the seven sources
lexically — label, description, `also_known_as`, field labels, field synonyms, named-metric names —
with a strong bonus for the source already in play in the conversation. The top source is kept,
plus a runner-up within 75 %. `shortlistFields` then keeps up to 24 fields per source: the primary
date, owner and title fields, every measure and pick-list, then lexical matches. Sensitive and hidden
fields are never named. The result is a ~2 K-token prompt.

### 2. Plan (one model call, grammar-constrained)

`buildPlanSchema()` derives the `ReportPlan` JSON schema from the engine's own vocabulary — sources,
aggregations, operators, visualizations, metric names are enums taken from the registry at build
time, so they cannot drift (a test asserts it). Ollama's `format` field and the OpenAI
`response_format: json_schema` make the model *unable* to emit prose or an unknown key. Filter
values are always strings (`"a,b"`, `"true"`, `"from,to"`) — one scalar type keeps the grammar
simple for small models — and the validator coerces them.

The system prompt carries the rules, the catalogue block, the vocabulary, **temporal facts** (today,
the tenant's fiscal-year start month and its resolved windows, the currency, the user's scope), six
worked examples and the last four turns. Relative dates are chosen from the preset list, never
computed by the model.

### 3. Validate and expand (closed vocabulary)

`validatePlan` trusts nothing the model says about a field:

- source must be a registry key; every field must exist on it and not be in `SENSITIVE_FIELDS`
- a measure must be a field flagged `agg` (count / count_distinct are always allowed); a grouping
  must be groupable and not a roll-up; a period only on a date
- `metric_refs` expand to their measure(s) and filters; a grouping outside the metric's
  `allowed_dimensions` is rejected
- operators must apply to the field type; enum values must be real options; `date_range` must be a
  preset or `YYYY-MM-DD,YYYY-MM-DD`
- sort keys must be `m<n>` or a grouping; `limit` is clamped to 1 000; totals are always on

Errors are specific ("`stage` has no value `won`. Valid values: prospecting, …") and are sent back to
the model **exactly once** as a repair turn. A plan that fails twice becomes a clarification to the
user, not a third guess.

### 4. Execute

`ReportService.run(config, ctx)` with the same `ctx` a saved report gets — scope from
`resolveScope`, fiscal month from `report-run-context.js`. Nothing AI-specific.

### 5. Chart recommendation (rules over the *result*)

`recommendViz` decides from the actual `{ columns, rows }`: one measure and one row → `kpi`; a
period dimension → `line`; two dimensions → `pivot` (one measure) or `table`; an ordered stage
field with falling values → `funnel`; more than 25 categories → `table`; a comparison is never a
pie. An explicit request ("as a pie chart") wins; `alternatives` lets the UI re-draw without a
second model call.

### 6. Narrative, grounded by construction

Every answer carries a narrative. By default it is assembled from
[`report-insights.js`](../engines/reporting.md#insights--statistics-not-an-llm) — deterministic sentences
computed from the result. When a summary is requested, a second model call receives **only** the
result table (≤ 40 rows), the totals and those insights, with the instruction to state nothing
outside them. `isGrounded` then checks every numeral in the reply against the numbers in the
result (allowing separators, rounding and k/M scaling); a reply that invents a number is discarded
in favour of the computed sentences and the response says so (`narrative_grounded: false`). The
UI labels this. The same path powers **Explain** on any saved report.

---

## API

| Method & Path | Purpose |
|---|---|
| GET `/api/ai-reports/status` | `{ enabled, ok, provider, model, reason, latency_ms }`. The UI shows Ask only when `enabled`. |
| GET `/api/ai-reports/suggestions` | Starter questions from the template gallery and the named metrics. No model call. |
| POST `/api/ai-reports/ask` | `{ message, history?: [{ message, config }], scope?, options?: { force_viz, want_summary } }` → see below |
| POST `/api/ai-reports/explain` | `{ title, result, scope? }` → `{ status, narrative, grounded, fallback }` |

`ask` response `data`:

```jsonc
{
  "status": "success",            // success | no_data | clarify | plan_invalid | refused | chitchat
                                  // | llm_unavailable | execution_error | disabled
  "interpretation": { "intent", "title", "description", "assumptions": [], "confidence" },
  "query":          { "kind": "report_config", "config": { /* validated, runnable */ }, "source_label" },
  "data":           { "columns", "rows", "summary", "comparison", "insights" },
  "visualization":  { "type", "auto_selected", "reason", "alternatives": [] },
  "narrative":      "…", "narrative_grounded": true,
  "clarification":  { "question", "options": [] } | null,
  "refusal":        "…" | null,
  "suggestions":    ["Compare with last year", "…"],
  "metadata":       { "row_count", "scanned", "capped", "warnings", "scope", "generated_at" },
  "timings":        { "plan", "repair?", "execute", "summary?", "total" },
  "model":          { "provider", "name" }
}
```

Conversation context is held by the client (the last four `{ message, config }` turns) and sent with
each question; nothing is persisted server-side, so there is no new table and no migration. A model
outage is a `status`, not a 5xx. Each user is limited to 30 questions per 10 minutes
(`fastify.rateLimiter`, Redis-backed when available); over the limit returns 429 with `Retry-After`.

---

## Running it

```bash
# backend/.env
AI_REPORTING_ENABLED=true
LLM_PROVIDER=ollama              # ollama | openai-compatible | stub
LLM_BASE_URL=http://localhost:11434
LLM_MODEL=llama3.1:8b            # any model Ollama has pulled
LLM_TIMEOUT_MS=90000
LLM_THINKING=false               # reasoning traces are wasted tokens for a JSON planner
```

```bash
ollama pull llama3.1:8b && ollama serve
```

`GET /api/ai-reports/status` reports whether the configured model is actually pulled and gives the
`ollama pull` command if not. With `LLM_PROVIDER=stub` the feature is "on" but answers with a fixed
clarification — that is what CI and the test suite use. The Ollama calls pass `num_ctx: 8192` (the
4 k default can silently truncate the catalogue) and `keep_alive: 30m` so only the first question
pays the model-load cost.

### What to expect from a laptop-class model

Measured on this development machine (Apple Silicon, `llama3.1:8b`, ~2 K-token prompt): the plan
call takes **20–60 s** and the summary **5–13 s**; almost all of it is prompt evaluation, which is
why the catalogue is trimmed rather than the whole registry sent. Plan quality on the eight
worked shapes (aggregate, trend, ranking, matrix, comparison, follow-up, clarify, refuse) is good;
an 8B model will occasionally add an unasked `compare` or misread a currency as a count in the
summary — the grounding check catches invented numbers, not misdescribed ones, which is why the
computed insights are always shown alongside. The architecture study's recommendation for
production stands: a 14B-class instruction model on a GPU host brings the plan call to 2–5 s.

---

## Security summary

| Threat | Where it is stopped |
|---|---|
| SQL injection / arbitrary queries | Structurally impossible — the model emits a config, the engine builds Prisma calls from a closed vocabulary |
| Access to another user's data | `resolveScope` clamps every run; the model never sees a scope switch |
| Exfiltrating personal data | `SENSITIVE_FIELDS` are never in the prompt and are rejected by the validator; listing-style requests are refused by rule |
| Prompt injection via the question | The output grammar has no free-form field except `title`, `explanation` and the clarification text; none is executed |
| Prompt injection via *data* | The summary model sees result values, but its reply is text only and is numeral-checked; nothing it says is acted on |
| Hallucinated fields or metrics | Rejected with a specific error; one repair; then the user is asked |
| Cost / abuse | Per-user rate limit; one repair round-trip maximum; bounded history and prompt |

---

## Extending

- **A new business metric**: add an entry to `METRICS` in `report-semantics.js` with `source`,
  `metric` (or `metrics`), `filters`, `date_field`, `allowed_dimensions`, `also_known_as`.
  `ai-reporting.test.js` verifies every key resolves in the registry.
- **A new synonym**: `FIELD_SYNONYMS['<source>.<field>']`. Both routing and field shortlisting read it.
- **A new source**: add it to the registry as usual, then a `SOURCE_SEMANTICS` entry (the test
  requires one per source).
- **Another model server**: `LLM_PROVIDER=openai-compatible` with `LLM_BASE_URL`, `LLM_MODEL`,
  `LLM_API_KEY`. The provider tries `response_format: json_schema` and falls back to `json_object`.

## Related

- [reporting.md](../engines/reporting.md) — the engine the AI layer sits on
- [architecture-study.md](architecture-study.md) — the design study and phased roadmap
- [local-llm-operations.md](local-llm-operations.md) — obtaining and hosting a model
- [Reports (user guide)](../../using-the-crm/reports.md#ask-genesis)

<!-- nav:bottom -->

---

### Where to next

| | |
|---|---|
| **Next** | [LLM primer](llm-primer.md) — Large language models explained for the team |
| **Previous** | [Status tracker](../engines/status-tracker.md) *(Engine references)* |
| **Background** | [Understanding Genesis › How data is stored and read](../../understanding/03-how-data-is-stored.md) |
| **On these journeys** | [AI evaluator](../../README.md#ai-evaluator) (step 1 of 5) |
| **Lost?** | [Docs roadmap](../../README.md) · [AI reporting](README.md) · [Understanding Genesis](../../understanding/README.md) |
<!-- /nav:bottom -->
