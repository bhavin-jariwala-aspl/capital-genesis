# LLM Primer — for the Genesis CRM team

**Who this is for:** an experienced engineer who has not worked with language models before, and who
needs to make good architectural decisions about the Ask Builder feature within days rather than
months.

**What it is not:** a machine-learning course. There is no maths here. Nothing below requires you to
understand how a transformer works, any more than using MySQL requires you to understand B-trees.

**Companion documents.** This explains the *concepts*. `LLM_IMPLEMENTATION_WALKTHROUGH.md` is the
hands-on, do-this-then-that guide. `AI_REPORTING_ARCHITECTURE.md` is the design.
`LOCAL_LLM_OPERATIONS.md` is how to run it. Read this one first.

---

## 0. The ten-minute version

If you read nothing else, read this table. Everything after it is elaboration.

| Belief a newcomer usually arrives with | The reality | Why it matters for Genesis |
|---|---|---|
| "The model will learn our data as we use it" | **It learns nothing.** It is a pure function: same input → same output. It has no memory between calls. | Conversation memory is *our* code re-sending context, not the model remembering |
| "We need to train it on our database" | **Almost certainly not.** You *describe* your schema in the prompt, every time. | Part 2 of the operations doc: fine-tuning is the last resort |
| "It knows our tables" | It knows nothing about Genesis. It knows English, and general patterns from public text. | We send the field catalogue on every single request |
| "Bigger model = better" | Bigger = better *reasoning*, and proportionally slower. There is a real trade. | Why we chose a 14B and accept ~5–7 s |
| "It can add up the numbers" | It is **terrible** at arithmetic and will produce confident wrong totals. | MySQL does every calculation. The model never sees a number it must compute |
| "A better prompt will stop it doing bad things" | **No.** A prompt is a suggestion, not a constraint. | Security is the validator and the Prisma layer, never the prompt |
| "It returns JSON if I ask nicely" | Sometimes. Asking is unreliable; *constraining* is reliable. | Grammar-constrained decoding is non-optional in our design |
| "We can test it like a function" | You cannot assert one exact output. You measure a *rate* across many cases. | Why the eval harness exists |

---

## 1. What a language model actually is

Four sentences, and they carry most of the intuition you need:

1. **It predicts the next token, repeatedly.** Given a sequence of text, it produces a probability
   distribution over what comes next, picks one, appends it, and repeats. That is the entire
   mechanism.
2. **It is stateless.** Every call is independent. It does not remember your last question, your
   database, or that you corrected it yesterday.
3. **Its knowledge is frozen at training time.** It knows public text up to some cut-off. It has
   never seen your database, your client, or your field names.
4. **It has no notion of truth.** It produces text that is *plausible* given its training. When
   plausible and true diverge, you get a confident, fluent, wrong answer. This is called
   hallucination, and it is not a bug being fixed — it is what the mechanism does.

### The most useful mental model

**Treat the LLM as a very fast, very well-read intern who has never seen your system, has no access
to anything, forgets everything between tasks, and will confidently guess rather than admit
ignorance — unless you explicitly tell them it is fine to say "I don't know."**

Every design decision in `AI_REPORTING_ARCHITECTURE.md` follows from taking that description
literally:

- *Never seen your system* → we send the field catalogue every time
- *No access to anything* → the model never touches the database; it writes a plan, we execute it
- *Forgets everything* → we re-send a compressed conversation on each turn
- *Confidently guesses* → the validator rejects anything that does not resolve, and the prompt
  explicitly rewards refusing

---

## 2. The vocabulary, decoded

The jargon is the main barrier. Here is the whole working set.

| Term | What it actually means | Genesis example |
|---|---|---|
| **Token** | A chunk of text, roughly ¾ of a word. Models read and write in tokens, not characters. | `"opportunities"` ≈ 3 tokens; our whole prompt ≈ 3 000 |
| **Context window** | The maximum tokens the model can see at once — prompt *plus* its answer. Exceed it and the oldest text is dropped. | Qwen3-14B: 32K+. We use ~4K. Lots of headroom |
| **Prompt** | Everything you send. Not just the user's question — the instructions and catalogue too | System rules + 40 fields + temporal facts + history + question |
| **System prompt** | Instructions that frame the model's role and rules, sent before the user's message | "You convert a business question into a report plan. Never invent a field." |
| **Inference** | Running the model to get an answer. (As opposed to *training*.) | Every Ask Builder request |
| **Parameters** | The learned numbers inside the model. "7B" = 7 billion. Roughly, capacity. | Qwen3-14B = 14.8 billion |
| **Weights** | The parameter values, as files on disk. What you download. | ~9 GB for our 4-bit 14B |
| **Quantisation** | Storing weights at lower precision (16-bit → 4-bit) to shrink and speed them up, at a small quality cost | `Q4_K_M` — 29.5 GB becomes 9 GB |
| **Temperature** | Randomness. 0 = always pick the most likely token. 1.0 = creative and varied | Planner: `0`. Summary: `0.3` |
| **Sampling** | How the next token is chosen from the distribution (top-p, top-k, greedy) | We use greedy/near-greedy for the planner |
| **Hallucination** | Confident, fluent, wrong output | Inventing `opportunities.profit` — which our validator catches |
| **Few-shot / in-context learning** | Putting worked examples in the prompt. The model imitates them. **This is not training** — nothing is saved | 12 example question→plan pairs |
| **Zero-shot** | Asking with no examples | What you will try first, and it will be worse |
| **Fine-tuning** | Actually modifying the weights with your own examples. Slow, expensive, permanent | Our last resort — see the operations doc |
| **LoRA** | Cheap fine-tuning: freeze the model, train a small add-on adapter | ~150 MB file instead of a 29 GB model |
| **Embedding** | Text → a list of numbers, where similar meanings are numerically close. Used for search, not generation | Optional, for finding similar past questions |
| **RAG** | Retrieval-Augmented Generation: look something up, put it in the prompt, then ask | Our schema catalogue selection *is* RAG |
| **Structured output** | Forcing the answer into a fixed shape (JSON matching a schema) | `ReportPlan` |
| **Constrained / guided decoding** | The mechanism that *guarantees* it: illegal tokens are blocked at generation time | xgrammar (vLLM) / `format` (Ollama) |
| **Grammar (GBNF)** | The rule set describing legal output, used by the constraint | Generated from our registry |
| **Prompt injection** | Text inside the input that hijacks the instructions | "Ignore previous instructions and…" |
| **Open-weight** | The weight files are downloadable. Not the same as open-source | Qwen3 — Apache-2.0 |
| **Local inference** | Running the model on your own hardware | Our entire requirement |
| **Serving framework** | The server that loads weights and answers HTTP | Ollama, vLLM, llama.cpp |
| **KV cache** | Per-request memory the model uses while generating. Grows with context length | ~160 KB per token for our 14B |
| **Batching** | Serving several requests through the GPU together | Why vLLM handles concurrency well |
| **Eval** | A scored test set. The only honest way to compare models or prompts | Our 60-question golden set |

---

## 3. Tokens and the context window, concretely

Everything is metered in tokens: speed, memory, and (on hosted APIs) cost.

```text
"Show me total sales by region for the last 12 months"
  ≈ 11 tokens

Our full planner prompt:
  system instructions + rules   ~   400 tokens
  field catalogue (~40 fields)  ~ 1 800 tokens   ← the biggest part
  vocabulary + temporal facts   ~   500 tokens
  few-shot examples             ~   900 tokens
  conversation history          ~   150 tokens
  the user's question           ~    11 tokens
  ─────────────────────────────────────────────
  TOTAL PROMPT                  ~ 3 761 tokens
  
  The answer (a ReportPlan)     ~   210 tokens
```

Three practical consequences:

- **Prompt size costs latency.** Reading 3 761 tokens ("prefill") is fast — under a second. But it is
  not free, and doubling the catalogue doubles it.
- **Long prompts reduce accuracy.** Models get measurably worse at picking the right item from a
  long list. This is *why* `SchemaContextService` sends ~40 relevant fields instead of all 299 — not
  to save money, but to be more accurate.
- **Generation is the slow part.** Tokens come out one at a time — ~45/second for our 14B. 210 tokens
  ≈ 4.7 seconds. **This is where nearly all the latency lives**, and it is why the plan is designed
  to be compact JSON rather than an essay.

---

## 4. Temperature and determinism

| Temperature | Behaviour | Use for |
|---|---|---|
| `0` | Always picks the highest-probability token | **The planner.** Same question → same plan |
| `0.2–0.4` | Slight variation, more natural phrasing | **The summary.** Prose at 0 reads robotic |
| `0.7–1.0` | Creative, varied, less reliable | Brainstorming. Never for us |

**An important caveat:** `temperature: 0` is *near*-deterministic, not guaranteed. GPU floating-point
operations can reorder under batching, occasionally flipping a near-tie between two tokens. So:

- Do not build anything that *requires* byte-identical output across runs.
- Do build a validator that accepts any *valid* plan. Which is exactly what we did.

---

## 5. Size, quantisation, and hardware — the intuition

**Parameters ≈ capacity.** More parameters means better reasoning and better multi-constraint
instruction following. It also means proportionally slower generation and more memory.

**Quantisation ≈ compression.** Weights are stored as numbers. Full precision is 16 bits each;
quantising to 4 bits makes the file ~4× smaller and generation faster, for a small quality cost.

The rule that matters, and it is counter-intuitive at first:

> **A bigger model, heavily quantised, beats a smaller model at full precision — at the same file
> size.** Qwen3-14B at 4-bit (~9 GB) is better than Qwen3-8B at 8-bit (~8.5 GB).

So the sizing question is: *what is the largest model that fits my GPU at 4-bit, with room for the KV
cache?* For a 24 GB card, that is comfortably a 14B.

### The memory arithmetic

```text
weights (4-bit)                    9.0 GB
framework overhead                 1.0 GB
KV cache (per concurrent request)  ~0.7 GB at our prompt sizes
                                   × 8 concurrent = 5.6 GB
─────────────────────────────────────────
                                  15.6 GB  → fits a 24 GB L4 with headroom
```

You will meet these numbers again in `LOCAL_LLM_OPERATIONS.md` §3.3. They are the whole reason the
recommendation is "one `g6.xlarge`".

---

## 6. What an LLM cannot do

The most valuable section here, because every architectural mistake a newcomer makes comes from
expecting one of these.

| It cannot | Why | What we do instead |
|---|---|---|
| **Do arithmetic reliably** | It predicts plausible digits; it does not calculate | **MySQL computes every number.** The model never sums anything |
| **Know your current data** | It has never seen your database and cannot query it | It writes a *plan*; our engine runs it |
| **Remember previous conversations** | Stateless | We store turns and re-send a compressed context |
| **Be a security boundary** | Instructions are suggestions; text can override text | Validator + Prisma tenant extension + scope clamping |
| **Guarantee valid output by request** | "Return JSON" is a hope | Constrained decoding makes it structural |
| **Reliably say "I don't know"** | Trained to be helpful; guessing scores better than refusing | Explicit refusal instructions, refusal examples, **and a validator that rejects invented fields** |
| **Give you a confidence score you can trust** | Its internal probabilities are not calibrated to correctness | We validate deterministically instead |
| **Explain its real reasoning** | Post-hoc explanations are also generated text | We show the *plan* and the *assumptions*, which are checkable |
| **Stay current** | Frozen at training time | Everything time-dependent is supplied in the prompt |

### The one that will catch you out

**The model is confidently wrong in exactly the same tone as it is confidently right.** There is no
tell. A human expert hedges when unsure; a model does not. This is why the design puts a
deterministic validator between the model and the database, and why `assumptions` is surfaced in the
UI rather than buried.

---

## 7. Eight beliefs that will cost you weeks

1. **"I'll fix it with a better prompt."** Prompts fix *quality*. They never fix *security* or
   *guarantees*. If correctness matters, put code in the path.
2. **"I need to fine-tune on our data."** Almost never the first answer. Description in the prompt is
   faster, cheaper, and editable in minutes. See the adaptation ladder below.
3. **"More context is better."** Beyond a point, more context makes the model *worse*. Select, do not
   dump.
4. **"It worked in my three tests."** Three tests tell you nothing about a probabilistic system.
   Build the eval harness early — it is the difference between a demo and a product.
5. **"Temperature 0 makes it deterministic, so I can snapshot-test it."** Near-deterministic. Assert
   on *properties*, not exact strings.
6. **"Prompt injection is a prompt problem."** It is an architecture problem. Assume the model is
   fully compromised and ask what it could then do. In our design: produce a valid report the user
   was already allowed to run. That is the correct answer.
7. **"The model can validate its own output."** Asking a model "is this correct?" gets you another
   generation, not a check. Validate in code.
8. **"We'll add evaluation later."** Then every future change — new model, new prompt, new field — is
   a guess. Write the golden set before you tune anything.

---

## 8. Prompting: the parts of a request

A request is a list of messages with roles:

```jsonc
[
  { "role": "system",    "content": "You convert a business question into a report plan. Rules: …" },
  { "role": "user",      "content": "Show sales by region for 2026" },
  { "role": "assistant", "content": "{\"intent\":\"report\", …}" },   // a previous answer
  { "role": "user",      "content": "Only the top 5" }                // the new question
]
```

- **system** — role, rules, catalogue, temporal facts. The stable part.
- **user** — what the person typed.
- **assistant** — what the model previously said. **You send this back**; the model does not remember
  it.

**Few-shot** means putting worked examples in the prompt so the model imitates the pattern. It is the
highest-value, lowest-effort technique available, and it is *not* training — nothing is saved, and it
costs prompt tokens on every request.

The examples that matter most are the **negative** ones: an ambiguous question that produces a
clarification, an impossible one that produces a refusal. A model shown only successful answers
learns that every question has an answer, and stops refusing.

---

## 9. Structured output — the single most important technique here

You need JSON. There are three ways to get it, and only one is reliable.

| Approach | Reliability | Verdict |
|---|---|---|
| Ask nicely ("respond in JSON") | ~85–95 % | Fails often enough to be a support burden |
| Ask + parse + retry on failure | ~99 % | Works, but wastes a full generation on each failure |
| **Constrained decoding** | **~100 % structurally** | ★ What we use |

**How constrained decoding works.** At each step the model produces probabilities for every possible
next token. The framework masks out every token that would break your JSON Schema, and samples only
from what remains. If the schema says the next value must be one of ten source names, no other token
can be produced. Not "unlikely" — *impossible*.

This is why the earlier model recommendation changed from a code-tuned model to a general one: once
the grammar guarantees the format, "good at emitting JSON" stops being a differentiator, and what
remains is reasoning and prose quality.

**What it does *not* guarantee:** that the content is *correct*. The grammar can force
`"field": "<some string>"` but cannot know that `opportunities.profit` does not exist. That is the
validator's job. Structure is guaranteed by the grammar; meaning is guaranteed by code.

---

## 10. The adaptation ladder — how a model comes to know your business

Work down this list. Only descend when the level above has measurably run out of road.

```text
CHEAPEST, FASTEST, MOST REVERSIBLE
   │
   1. Put it in the prompt         "Here are your 40 relevant fields."
   │                               Instant. Generated from the registry.
   │
   2. Define your terms            "Revenue = sum of amount where is_won."
   │                               Minutes. A code file, reviewed in a PR.
   │
   3. Add synonyms                 "deals / pipeline / sales → opportunities"
   │                               Minutes.
   │
   4. Show worked examples         12 question→plan pairs, including refusals.
   │                               Hours.
   │
   5. Retrieve relevant examples   Find the 3 most similar approved past questions
   │                               and inject them. Automatic, improves with use.
   │
   6. Fine-tune (LoRA)             Actually change the weights. Days. Permanent
   │                               maintenance burden. Needs 300+ curated examples.
   ▼
MOST EXPENSIVE, SLOWEST, HARDEST TO UNDO
```

**Levels 1–5 deliver the overwhelming majority of achievable accuracy** for a task like ours, where
the model selects from a closed vocabulary with a validator behind it.

The decisive practical difference: at levels 1–5, a wrong answer reported on Monday can be fixed on
Monday. At level 6, it waits for the next training run, and the fix might break something else.

---

## 11. Embeddings and RAG, briefly

**An embedding** turns text into a list of numbers (a vector) such that similar meanings sit close
together. `"deal value"` and `"opportunity amount"` land near each other; `"deal value"` and
`"Tuesday"` do not. Embeddings are for *finding* things, not generating them, and they come from a
different, much smaller model (~130 MB, not 9 GB).

**RAG** — Retrieval-Augmented Generation — is a three-step pattern:

```text
1. RETRIEVE   find the material relevant to this question
2. AUGMENT    put it in the prompt
3. GENERATE   ask the model
```

You are already doing RAG. `SchemaContextService` retrieves the relevant sources and fields and puts
them in the prompt. It uses keyword matching rather than embeddings because ten sources is a small
enough space that keywords are accurate, instant and debuggable. Embeddings become worthwhile at
level 5 of the ladder, for finding similar *past questions*.

**RAG is not training.** Nothing is saved into the model. It is lookup-then-ask, on every request.

---

## 12. Inference frameworks — what they actually are

A serving framework is a program that loads weight files into memory and answers HTTP requests. That
is all. The model is data; the framework is the database engine that serves it.

| | Ollama | vLLM | llama.cpp |
|---|---|---|---|
| Best for | Development | Production | CPU / Apple silicon |
| Setup | `brew install`, one command | Docker + GPU | Compile or Docker |
| Model management | Built in (`ollama pull`) | You manage files | You manage files |
| Concurrency | Modest | **Excellent** (continuous batching) | Modest |
| Constrained JSON | ✅ `format` | ✅ `guided_json` | ✅ GBNF |
| API | OpenAI-compatible | OpenAI-compatible | OpenAI-compatible |

**They all speak the same HTTP API.** That is the key operational fact: your code writes to one
interface and the framework becomes a URL in configuration. Which is precisely what
`LlmProvider` is for.

---

## 13. Security: the one rule

> **The LLM is not a security boundary. Ever.**

Assume any text reaching the model — a user's question, a lead's company name, a case subject — can
say anything, including "ignore your instructions". Then ask: *what is the worst thing the model
could do if it obeyed?*

In our architecture the honest answer is: **produce a valid report the user was already entitled to
run.** Not because the prompt is clever, but because:

- the model's output is a JSON object whose every field is checked against a closed vocabulary;
- it has no database connection;
- the tenant filter is injected by the Prisma layer, below anything the model can influence;
- the row scope comes from the JWT, and the model has no input into it.

That is what "defence in depth" means here — and it is why the design deliberately does *not* have
the model write SQL. Not because SQL cannot be validated, but because validating a closed vocabulary
is *provably* complete, while validating an open language never quite is.

---

## 14. Evaluation: you cannot unit-test a language model

A normal function: same input → same output → `assert`.

A model: same input → *usually* the same output; a paraphrase might give a different one; a new model
version changes everything. So you measure **rates over a set**, not equality on a case.

```text
Golden set: 60 questions with expected plans
   ├── 40 answerable   → measure exact-match and semantic-equivalence rates
   ├── 10 ambiguous    → must CLARIFY, not guess
   ├──  5 impossible   → must REFUSE, not invent
   └──  5 adversarial  → must REFUSE, and never widen scope

Report:  exact match 74 % · equivalent 89 % · refusals 5/5 · clarifications 8/10 · p95 5.9 s
```

This harness is what makes every later decision objective: *is the 14B worth the latency? did the new
prompt help? did the fine-tune regress anything?* Without it, all of those are opinions.

**Build it before you tune anything.** It is a few hundred lines and it pays for itself the first
time you change a prompt.

---

## 15. How all of this maps onto Genesis

```text
YOUR EXISTING SYSTEM                      WHAT THE LLM ADDS
─────────────────────────────────────────────────────────────────────────────
report-registry.js                   →    becomes the CATALOGUE in the prompt
  10 sources, 299 labelled fields           (the model's only knowledge of you)

report-semantics.js (new)            →    becomes the BUSINESS DEFINITIONS
  "revenue = sum(amount) where won"          (so it doesn't guess what you mean)

The report config JSON               →    becomes the MODEL'S OUTPUT FORMAT
  { source, viz, metrics, filters }          (a plan, not a query)

ReportService.run()                  →    UNCHANGED. Executes the plan.
  Prisma + tenant scoping                    (this is where truth lives)

ReportResult.jsx                     →    UNCHANGED. Renders the answer.
  9 visualizations, Recharts

The user's typed question            →    the only genuinely new input
```

**The insight worth internalising:** you are not adding an AI system to Genesis. You are adding a
*translation layer* — from English into a config format your product already speaks fluently.
Everything downstream of that translation is code you have already written, tested and shipped.

That framing is why this is a weeks project rather than a months one, and why it cannot break the
existing Reports module: the LLM produces an input to a function that already exists.

---

## 16. Latency and cost intuition

| | Hosted API (for reference) | Our local deployment |
|---|---|---|
| Cost model | Per token — variable, unbounded | Per hour — fixed, predictable |
| Typical latency | 1–3 s, streaming | 5–7 s |
| Data leaves your network | Yes | **No** |
| Works offline / air-gapped | No | **Yes** |
| Model changes under you | Yes, silently | Only when you change it |
| Monthly cost at our scale | usage-dependent | **~$300–600** |

Hosted APIs are not an option here — they fail the data-residency and offline requirements outright.
The column exists only to calibrate the numbers.

**On the 5–7 seconds:** the instinct is to compare against a streaming chatbot. The right comparison
is what it replaces — opening the report builder, choosing a source, a measure, a grouping, a filter
tree and a date range. Two to four minutes for someone who knows the tool; a support ticket for
someone who does not.

---

## 17. Glossary

**Adapter** — a small trained add-on (see LoRA) layered onto a frozen base model.
**AWQ / GPTQ** — quantisation formats used by vLLM.
**Batching** — processing several requests through the GPU together.
**Context window** — maximum tokens visible at once.
**Continuous batching** — vLLM's ability to let a new request join a running batch.
**Decoding** — generating output tokens one at a time.
**Embedding** — text as a vector of numbers, for similarity search.
**Few-shot** — examples in the prompt.
**GGUF** — the file format used by llama.cpp and Ollama.
**Grammar / GBNF** — rules describing legal output, enforced during decoding.
**Greedy decoding** — always take the highest-probability token (temperature 0).
**Hallucination** — confident, fluent, wrong output.
**Inference** — running the model to get an answer.
**KV cache** — per-request working memory during generation.
**LoRA / QLoRA** — cheap fine-tuning via a small adapter; QLoRA quantises the base during training.
**Open-weight** — downloadable weights (not necessarily open-source).
**Prefill** — processing the prompt before generation starts.
**Prompt injection** — input text that hijacks the instructions.
**Quantisation** — lower-precision weights; smaller and faster.
**RAG** — retrieve relevant material, put it in the prompt, then ask.
**Safetensors** — a weight format that cannot execute code on load (unlike pickle).
**System prompt** — the instruction block that frames the model's role.
**Temperature** — randomness in token selection.
**Token** — ~¾ of a word; the unit models read and write.
**tok/s** — generation speed.
**VRAM** — GPU memory.
**Zero-shot** — asking with no examples.

---

## 18. Where to learn more, in a sensible order

Ordered by usefulness *for this project*, not by fame.

| Read/do | Why |
|---|---|
| **`LLM_IMPLEMENTATION_WALKTHROUGH.md`** | Start here. Concepts land when you have run them |
| **Ollama's documentation** (`ollama.com/docs`) | Small, practical, and the tool you will use daily |
| **The OpenAI Chat Completions API reference** | Not because we use OpenAI — because *everyone's* API copies its shape, including Ollama and vLLM |
| **Your chosen model's Hugging Face model card** | Context length, chat template, licence, prompt format. Read it before debugging anything |
| **vLLM's documentation, "guided decoding"** | The production mechanism behind our JSON guarantee |
| **Anthropic's and OpenAI's prompt-engineering guides** | Vendor-published but largely model-agnostic and genuinely good on structure and examples |
| **OWASP Top 10 for LLM Applications** | The security checklist. Confirms *why* our design keeps the model out of the trust path |
| **`AI_REPORTING_ARCHITECTURE.md` Parts C, F, G** | Once the concepts land, the design will read as obvious rather than arbitrary |

**What to skip for now:** transformer architecture explainers, attention-mechanism maths, papers.
Genuinely interesting, and irrelevant to shipping this feature. You do not need to know how an engine
works to be an excellent driver — and you have a product to ship.

---

## 19. The five things to remember

1. **The model translates; it never computes and never decides.** MySQL computes. Code decides.
2. **It knows nothing about Genesis except what you put in the prompt** — every single time.
3. **Structure is guaranteed by the grammar; meaning is guaranteed by your validator.** Never by the
   prompt.
4. **Prompt, define, exemplify, retrieve — and only then, maybe, train.** In that order.
5. **Measure with an eval set**, or every decision after the first is a guess.
