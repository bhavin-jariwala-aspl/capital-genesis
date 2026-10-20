# Local LLM — Acquisition, Adaptation and Operations

<!-- nav:top -->
> **[Docs roadmap](../../README.md)** › **[AI reporting](README.md)** › 5 of 5 · **For:** DevOps, engineers
> ← [LLM implementation walkthrough](implementation-walkthrough.md) · [Roadmap](../../project/roadmap.md) *(Project)* →
> New to Genesis? Background: [Understanding Genesis › How a request travels](../../understanding/04-how-a-request-travels.md)
<!-- /nav:top -->

**Companion to** `architecture-study.md`. That document decides *what* to build; this one
answers three operational questions:

1. **How do we get a valid model, legally and reproducibly?**
2. **How does the model come to understand *our* business?**
3. **Where does it live, how does it work, and why there?**

**Status: operations proposal, not a description of what is deployed.** The shipped code (`services/llm/provider.js`, default `llama3.1:8b` on Ollama) is in [ask-genesis.md](ask-genesis.md); the `ops/llm/` files, eval script and GPU hosting below do not exist.

> **The short version of Part 2, up front, because it is the most commonly misunderstood part:**
> **We almost certainly should not train the model at first — and quite possibly never.**
> The model's knowledge of *your* business does not live in its weights. It lives in the schema
> catalogue, the business-metric definitions and the worked examples we send it on every request.
> Those are editable in minutes, reviewable in a pull request, and cost nothing to change.
> Fine-tuning is the last resort, not the first move, and Part 2 explains exactly when it becomes
> worth it and what it costs when it does.

---

# PART 1 — OBTAINING A VALID MODEL

## 1.1 What "valid" has to mean for a commercial product

Four criteria, in this order. A model that fails any one of them is not a candidate, however good it
scores.

| Criterion | Requirement | Why it is non-negotiable |
|---|---|---|
| **Licence** | Permits commercial use, multi-tenant SaaS hosting, and redistribution inside a container image, with no user-count clause | Genesis is sold to clients. A licence breach is a legal exposure that no benchmark score offsets. |
| **Open weights** | Downloadable weight files, not an API | The brief requires no cloud LLM dependency. An "open" model reachable only through someone's endpoint fails this. |
| **Provenance** | Published by the model's actual authors, on an official repository, with a pinned revision | Fine-tunes and re-quantisations by unknown third parties are unaudited code and unaudited weights. |
| **Reproducibility** | A specific revision hash and file checksum we can pin and re-verify | "We downloaded qwen sometime in August" is not a deployment artefact. |

### Licence positions of the shortlisted families

| Family | Licence | Commercial SaaS | Notes |
|---|---|---|---|
| **Qwen3** (0.6B–32B dense, 30B-A3B MoE) | **Apache-2.0** | ✅ Yes | No attribution requirement, no user cap. **The recommended family.** |
| **Qwen2.5 / Qwen2.5-Coder** (0.5B–32B, except the 3B and 72B variants — check each) | **Apache-2.0** | ✅ Yes | The conservative alternate. Verify per-size: a few Qwen sizes ship under the separate Qwen licence rather than Apache-2.0. |
| Mistral Small / Ministral | Apache-2.0 (Small 3.x) | ✅ Yes | Larger than needed for this task |
| IBM Granite 3.x | Apache-2.0 | ✅ Yes | Solid alternative |
| Microsoft Phi-4 | MIT | ✅ Yes | Shorter context |
| Meta Llama 3.x | Llama Community Licence | ⚠️ Conditional | 700 M-MAU clause; must display "Built with Llama"; naming restrictions on derivatives. **Requires legal sign-off.** |
| Mistral Codestral | Mistral Non-Production Licence | ❌ **No** | Prohibits production use. Excluded. |
| Defog SQLCoder | CC-BY-SA-4.0 | ⚠️ Share-alike | Copyleft obligations on derivatives; and it emits SQL, which our architecture does not want |

**Decision: Apache-2.0 only, unless legal explicitly clears the Llama licence.** That makes the
default **`Qwen3-14B`**, with `Qwen2.5-14B-Instruct` as the conservative alternate and `Qwen3-8B` as
the latency escape hatch. The reasoning behind the size and the choice of a *general* instruct model
over a code-tuned one is in `architecture-study.md` Part D — read D3 before substituting a
different model.

## 1.2 Capture the licence as a deployment artefact

Do this **before** the first byte of weights is downloaded, because it is the step everyone skips.

```bash
mkdir -p ops/llm/licences
curl -L -o ops/llm/licences/qwen3-14b-LICENSE \
  https://huggingface.co/Qwen/Qwen3-14B/raw/main/LICENSE
curl -L -o ops/llm/licences/qwen3-14b-README.md \
  https://huggingface.co/Qwen/Qwen3-14B/raw/main/README.md
```

Commit both, alongside a short `ops/llm/MODEL_REGISTER.md` recording: model name, exact revision
hash, licence, date retrieved, who approved it, and which release first shipped it. When a client's
security review asks "what third-party model are you running and under what licence", that file is
the answer.

## 1.3 Choosing the quantisation

Quantisation trades precision for memory and speed. For **structured selection from a closed
vocabulary** — which is what our planner does — the quality loss at 4-bit is small, and far smaller
than it would be for open-ended prose or long-form code.

### Qwen3-14B — the recommended model

| Quantisation | File size | Quality | Verdict |
|---|---|---|---|
| `F16` (unquantised) | ~29.5 GB | reference | Does not fit a 24 GB card; use only to produce other quants |
| `Q8_0` | ~15.7 GB | indistinguishable from F16 | Fits, but leaves too little for KV cache at real concurrency |
| `Q6_K` | ~12.1 GB | near-indistinguishable | Viable; caps concurrency at ~6 |
| `Q5_K_M` | ~10.5 GB | very good | Good middle ground if VRAM allows |
| **`Q4_K_M`** | **~9.0 GB** | **very good; the community default** | ★ **Recommended** — leaves ~14 GB for KV and overhead |
| `Q4_0` | ~8.5 GB | noticeably worse than Q4_K_M for the same size | Avoid — Q4_K_M dominates it |
| `Q3_K_M` | ~7.0 GB | measurable degradation | Not worth it — drop to Qwen3-8B at Q4_K_M instead |

### Qwen3-8B — the latency escape hatch

| Quantisation | File size | Verdict |
|---|---|---|
| **`Q4_K_M`** | **~5.0 GB** | ★ Use only if the 14B fails the p95 latency gate, or on a 16 GB developer machine |
| `Q5_K_M` | ~5.8 GB | If VRAM allows |
| `Q6_K` | ~6.7 GB | Diminishing returns |

**Rule: pick the largest model that fits comfortably at Q4_K_M, not the least-quantised version of a
smaller model.** A 14B at Q4_K_M consistently beats an 8B at Q8_0 despite being a similar size —
which is exactly why the recommendation is a 14B at 4-bit rather than an 8B at 8-bit.

For **vLLM** the equivalent is **AWQ** or **GPTQ** 4-bit (vLLM does not read GGUF efficiently). Use
GGUF for Ollama and llama.cpp; AWQ for vLLM.

## 1.4 Route A — Ollama (development, and small single-node deployments)

The simplest path, and the one every developer on the team should use locally.

```bash
# 1. Install
brew install ollama                 # macOS
curl -fsSL https://ollama.com/install.sh | sh   # Linux

# 2. Start the server (listens on 127.0.0.1:11434)
ollama serve

# 3. Pull the model, pinned to an explicit quantisation tag
ollama pull qwen3:14b            # Q4_K_M is Ollama's default tag for this size
#   on a 16 GB developer machine, use:  ollama pull qwen3:8b

# 4. Verify what you actually got
ollama list
ollama show qwen3:14b
#   → architecture, parameters, quantisation, context length, licence

# 5. Prove it responds and honours JSON-schema constrained decoding
curl -s http://localhost:11434/api/chat -d '{
  "model": "qwen3:14b",
  "stream": false,
  "think": false,
  "options": { "temperature": 0 },
  "format": {
    "type": "object",
    "properties": { "source": { "enum": ["leads","opportunities","cases"] } },
    "required": ["source"]
  },
  "messages": [
    { "role": "user", "content": "Which source answers: total pipeline value by stage?" }
  ]
}' | python3 -m json.tool
```

Step 5 is the acceptance test for the download, and it checks **two** things:

- If `format` does not constrain the output to the enum, the Ollama version is too old. Constrained
  decoding is what makes the whole "strict structured output" design work, and it is not optional.
- If the response contains a `<think>` block, `think: false` was not honoured. **Qwen3's hybrid
  reasoning mode must be off for the planner** — left on it adds several seconds per request and
  fights the JSON grammar. See `architecture-study.md` Part D6.

### Where Ollama puts the files

| OS | Path |
|---|---|
| macOS | `~/.ollama/models` |
| Linux | `/usr/share/ollama/.ollama/models` (or `~/.ollama/models` for a user install) |
| Override | `OLLAMA_MODELS=/data/models` |

Layout is `blobs/sha256-<digest>` plus `manifests/`. **The blob digest is the checksum** — record it
in the model register.

### Pinning the model in a private registry

Public tags can move. For production reproducibility, push the exact blob to your own registry:

```bash
ollama cp qwen3:14b genesis/planner:1.0.0
# then either bake it into the image (§1.7) or push to a private OCI registry
```

Application config then references `genesis/planner:1.0.0` — a name **we** control, so an upstream
retag can never silently change what production runs.

## 1.5 Route B — Hugging Face (production, vLLM, and air-gapped builds)

```bash
pip install "huggingface_hub[cli]"

# AWQ 4-bit weights for vLLM, pinned to an exact commit — NOT to `main`
huggingface-cli download Qwen/Qwen3-14B-AWQ \
  --revision <commit-sha> \
  --local-dir ./ops/llm/weights/qwen3-14b-awq \
  --local-dir-use-symlinks False

# GGUF for llama.cpp / Ollama import — a single file
huggingface-cli download Qwen/Qwen3-14B-GGUF \
  Qwen3-14B-Q4_K_M.gguf \
  --revision <commit-sha> \
  --local-dir ./ops/llm/weights
```

`--revision <commit-sha>` is the important flag. `main` is a moving target; a commit hash is an
immutable artefact, and it is what makes a build from six months ago reproducible today.

### Verify before you trust

```bash
# 1. Checksum every file and record it
sha256sum ops/llm/weights/*.gguf | tee ops/llm/weights/SHA256SUMS

# 2. Confirm the GGUF header says what you think it says
python3 - <<'PY'
from gguf import GGUFReader          # pip install gguf
r = GGUFReader('ops/llm/weights/Qwen3-14B-Q4_K_M.gguf')
for f in r.fields.values():
    if any(k in f.name for k in ('general.', 'context_length', 'block_count')):
        print(f.name, '=', f.parts[-1])
PY

# 3. Confirm nothing was truncated
ls -l ops/llm/weights/           # compare against the size published on the model card
```

**Never load a `.bin`/pickle checkpoint from an unofficial repository.** Pickle deserialisation
executes code. Prefer `safetensors` (which cannot) or GGUF, and prefer the model authors' own
repository over a re-upload.

## 1.6 Air-gapped / offline acquisition

For a client environment with no internet egress — which several enterprise deployments will be:

```text
┌── Staging host (has internet) ─────────────┐      ┌── Target environment (no egress) ───┐
│ 1. Download weights, pinned by revision    │      │ 4. Verify SHA256SUMS on arrival     │
│ 2. sha256sum → SHA256SUMS                  │ ───► │ 5. Import into Ollama / mount into   │
│ 3. Capture LICENSE + README + model card   │ USB  │    the vLLM container               │
│    → tar.gz the whole bundle               │ /S3  │ 6. Run the §1.8 acceptance test      │
└────────────────────────────────────────────┘      └──────────────────────────────────────┘
```

Import a bare GGUF into Ollama on the target:

```bash
cat > Modelfile <<'EOF'
FROM ./Qwen3-14B-Q4_K_M.gguf
PARAMETER temperature 0
PARAMETER num_ctx 8192
EOF
ollama create genesis/planner:1.0.0 -f Modelfile
```

The transferred bundle is the deployment artefact. It contains weights, checksums and licence — the
three things an audit will ask for.

## 1.7 Baking the model into a container image

This is what makes "fully offline" true in operation rather than merely in intent: the runtime pulls
nothing, so a network outage, a rate limit or an upstream deletion cannot affect a running service or
a new task starting up.

```dockerfile
# ops/llm/Dockerfile — new file (the repo's only Dockerfiles are backend/ and frontend/)
FROM vllm/vllm-openai:latest

# Weights are copied in at BUILD time. The runtime has no internet egress.
COPY ops/llm/weights/qwen3-14b-awq /models/planner
COPY ops/llm/licences /licences

ENV MODEL_PATH=/models/planner
EXPOSE 8000

CMD ["--model", "/models/planner", \
     "--served-model-name", "genesis-planner", \
     "--quantization", "awq", \
     "--max-model-len", "8192", \
     "--gpu-memory-utilization", "0.90", \
     "--guided-decoding-backend", "xgrammar", \
     "--disable-log-requests"]
```

Trade-off, stated plainly: this produces a **~10–12 GB container image** for the 14B, which is slow to push and
pull. The alternative is an EFS/EBS volume mounted at `/models`, which keeps the image small but
reintroduces an external dependency at start-up and a separate artefact to version. **Recommendation:
bake it.** Image size is a build-time annoyance; a runtime dependency is an outage.

`--disable-log-requests` matters: without it, vLLM logs full prompts, and our prompts contain the
business metadata catalogue. That is a data-handling decision, not a verbosity preference.

## 1.8 The acceptance test for any model download

A model is not "downloaded" until this passes. Run it in CI on the built image, not by hand.

| # | Check | Pass condition |
|---|---|---|
| 1 | Licence file present in the image | `/licences/*LICENSE` exists and is the expected licence |
| 2 | Checksum matches the register | `sha256sum -c SHA256SUMS` |
| 3 | Server answers `/v1/models` (or `/api/tags`) | 200, and the served name is what config expects |
| 4 | Constrained decoding works | A request with a JSON-Schema `enum` returns a value from that enum, 20/20 times |
| 5 | Context length | `num_ctx` / `--max-model-len` ≥ 8192 |
| 6 | Determinism at `temperature: 0` | The same prompt returns the same plan across 5 runs |
| 6b | **Reasoning mode off** | No `<think>` block in any response; latency matches the §3.4 budget |
| 7 | Latency | p95 for a 200-token plan within the Part 3 budget on the target hardware |
| 8 | **Golden-set eval** | The `scripts/eval-ai-reporting.js` harness clears the thresholds in `architecture-study.md` Part S.4 |

Check 8 is the real gate. Checks 1–7 confirm you downloaded *a working model*; check 8 confirms you
downloaded *a model that can do this job*.

---

# PART 2 — HOW THE MODEL LEARNS *YOUR* REQUIREMENTS

## 2.1 The question behind the question

"How does the model get trained on my requirements?" usually means one of these, and they have very
different answers:

| What you might mean | The actual mechanism | Cost to change |
|---|---|---|
| "It must know our tables and fields" | **Schema catalogue**, sent in the prompt | Zero — it is generated from `report-registry.js` |
| "It must know that *revenue* means won opportunity value" | **Business metric definitions** in `report-semantics.js` | Minutes — edit a file, open a PR |
| "It must know our financial year runs April–March" | **Temporal facts** computed from the tenant setting | Zero — already a setting |
| "It must phrase things our way / handle our jargon" | **Synonyms** + **few-shot exemplars** | Minutes |
| "It must get better at the questions our users actually ask" | **Dynamic exemplar retrieval** from an approved corpus | Automatic, once built |
| "It must literally have our knowledge in its weights" | **Fine-tuning (LoRA)** | Days, and a permanent maintenance burden |

**Only the last row is "training".** The first five deliver most of the accuracy, take hours rather
than weeks, are reviewable in a pull request, and — critically — can be corrected the same day a user
reports a wrong answer. Fine-tuned weights cannot.

## 2.2 The adaptation stack

Work down this list. Only move to the next layer when the eval harness proves the current one has run
out of road.

```text
  Effort    Layer                                  What it fixes                       Change latency
  ───────────────────────────────────────────────────────────────────────────────────────────────────
  ▏         1. Schema catalogue                    "it doesn't know our fields"        instant (generated)
  ▏▏        2. Business metric definitions         "it computes revenue wrongly"       minutes
  ▏▏        3. Synonyms & source descriptions      "it picks the wrong table"          minutes
  ▏▏▏       4. System rules & refusal policy       "it invents things / guesses"       minutes
  ▏▏▏       5. Static few-shot exemplars           "it gets the shape wrong"           minutes
  ▏▏▏▏      6. Constrained decoding + validator    "it returns broken output"          build once
  ▏▏▏▏▏     7. Dynamic exemplar retrieval          "it fails on OUR phrasings"         automatic
  ▏▏▏▏▏▏▏▏  8. LoRA fine-tuning                    everything above, but in weights    days + retrain
  ───────────────────────────────────────────────────────────────────────────────────────────────────
                                                          ▲ 1–7 cover the overwhelming majority
```

### Layer 1 — Schema catalogue *(generated, not authored)*

The registry holds 7 fixed typed sources (leads, accounts, opportunities, cases, tasks, activities, SLA)
and their business-labelled fields. It cannot see objects built in the Builder, so none of Genesis
Capital's objects are in the catalogue. `SchemaContextService` (shipped as `routeSources` +
`shortlistFields` in `ai-reporting.service.js`) selects the relevant slice and formats it. **Adding a report source to the product automatically
teaches the AI about it** — there is no second place to update, which is the property that stops the
two drifting apart.

### Layer 2 — Business metric definitions *(this is where accuracy actually comes from)*

The single highest-value artefact in the whole feature. Each definition is a config fragment, not
prose and not SQL:

```js
// backend/src/services/report-semantics.js
METRICS = {
  won_revenue: {
    label: 'Won revenue',
    description: 'Total value of opportunities that closed as won.',
    synonyms: ['revenue', 'sales', 'closed business', 'bookings'],
    source: 'opportunities',
    metric:  { agg: 'sum', field: 'amount', label: 'Won revenue' },
    filters: [{ field: 'is_won', op: 'equals', value: true }],
    allowed_dimensions: ['close_date', 'stage', 'owner.employee_name',
                         'owner.branch.branch_name', 'owner.region.region_name'],
  },

  open_cases: {
    label: 'Open cases',
    description: 'Support cases that have not yet been resolved or closed.',
    synonyms: ['open tickets', 'backlog', 'unresolved cases'],
    source: 'cases',
    metric:  { agg: 'count', label: 'Open cases' },
    filters: [{ field: 'status', op: 'not_in', value: ['resolved', 'closed'] }],
    allowed_dimensions: ['created_at', 'priority', 'type', 'owner.employee_name'],
  },
}
```

The model **names** a metric; the backend **expands** it. So the model cannot get a business
definition subtly wrong — it can only pick the wrong metric, which is a visible, correctable error
rather than a silently wrong number on a board report.

> This is the deliverable I need from the business, and the one thing in this project I cannot
> produce myself. See `architecture-study.md` Part W4.

### Layer 3 — Synonyms and grain descriptions

Users do not say "opportunities"; they say deals, pipeline, sales. Users do not say
"cases"; they say tickets or support requests. Every synonym added is a whole class of misroutes removed,
and it costs one line.

### Layer 4 — System rules

The refusal and clarification policy: never invent a field, prefer a named metric, ask when
genuinely ambiguous, resolve dates only from the supplied temporal facts. These are prompt rules
backed by validator enforcement — the rule tells the model what to do; the validator guarantees it
regardless.

### Layer 5 — Static few-shot exemplars

10–15 hand-written `(question → plan)` pairs covering the shapes that go wrong most often, including
the negative cases (ambiguous → clarify, impossible → refuse, injection → refuse). Small models
imitate structure well; showing a correct refusal is the most reliable way to get correct refusals.

### Layer 6 — Constrained decoding and the validator

Not "teaching" in the usual sense, but it is what converts a probabilistic model into a component
with a contract. The grammar makes an invalid *shape* impossible; the validator makes an invalid
*reference* impossible. Together they mean a bad generation degrades to a clean error rather than a
wrong report.

### Layer 7 — Dynamic exemplar retrieval *(the big win, and it is not training)*

This is how the system genuinely gets better at *your* users' questions, continuously, without ever
touching the weights:

```text
User asks a question
   → plan generated → executed → user gives 👍 (or an admin approves it in the audit screen)
   → the (question, approved plan) pair is stored in the corpus
                              │
   Next similar question ─────┘
   → retrieve the 3–5 most similar approved pairs
   → inject them as few-shot examples for THIS request
   → the model now answers your phrasing the way your team already confirmed is right
```

Similarity in v1 is lexical (token overlap over the normalised question). If that plateaus, a local
embedding model — `bge-small-en` or `all-MiniLM-L6-v2`, ~130 MB, served by the same Ollama instance —
upgrades it without new infrastructure.

**Why this beats fine-tuning for most of the value:**

| | Dynamic exemplars | Fine-tuning |
|---|---|---|
| Effect of one correction | Immediate, next request | After the next training run |
| Removing a bad example | Delete a row | Retrain from scratch |
| Auditability | You can point at the exact examples used | Weights are opaque |
| Cost per improvement | ~0 | GPU hours + eval + redeploy |
| Risk of regression elsewhere | None | Real (catastrophic forgetting) |
| Works from day one | Yes, once ~20 pairs exist | Needs 300+ |

The thumbs-up/down feedback already specified in the API (`POST /messages/:id/feedback`) exists
precisely to feed this corpus. **It is the training loop** — just one that operates on data instead
of weights.

## 2.3 If fine-tuning is genuinely needed

### When it becomes justified

Fine-tune only when **all** of these hold:

1. The eval harness has been running for weeks and shows a **stable, specific** failure class.
2. Layers 1–7 have been tried against that class and measurably failed to fix it.
3. There are **300+ high-quality, human-approved** `(question → plan)` pairs.
4. The failure costs more than the ongoing retraining burden — because fine-tuning is not a one-off:
   every registry change, new source, new metric or model upgrade potentially invalidates the tune.

Realistically, the most likely legitimate trigger is *latency*, not accuracy: a fine-tuned model can
drop the few-shot block from the prompt, cutting prefill and shaving perhaps 15–25 % off plan time.
That is a real benefit, but it should be measured, not assumed.

### What is actually trained: LoRA, not the whole model

**LoRA** (Low-Rank Adaptation) trains a small pair of low-rank matrices injected beside the frozen
attention/MLP weights. The base model is never modified.

| | Full fine-tune (14B) | **LoRA / QLoRA (14B)** |
|---|---|---|
| Trainable parameters | 14.8 B | ~35–60 M (≈0.3 %) |
| VRAM needed | 160 GB+ (multi-GPU) | **~15–19 GB — still fits the same 24 GB L4, with `batch_size 1` + gradient checkpointing** |
| Output artefact | A new 29 GB model | **A ~90–250 MB adapter** |
| Training time (800 examples, 3 epochs) | many hours on rented A100s | **~2–3 hours** |
| Rollback | Redeploy the old model | **Detach the adapter** |
| Can serve several variants | No | Yes — vLLM can hot-swap LoRA adapters |

**QLoRA** additionally quantises the frozen base to 4-bit during training, which is what brings a 14B
onto a single 24 GB card at all. Note the practical constraint: training and serving cannot share the
GPU simultaneously — either train on a separate box, or train during a scheduled window when the
inference service is scaled to zero (§3.6).

### The dataset is the whole job

Training is a day. Building a dataset you trust is the project.

```jsonc
// One line per example, in the exact chat format used at inference time.
{"messages":[
  {"role":"system","content":"<the SAME system + catalogue block used in production>"},
  {"role":"user","content":"How much did we close last quarter by region?"},
  {"role":"assistant","content":"{\"intent\":\"report\",\"title\":\"Won revenue by region — last quarter\",\"config\":{\"source\":\"opportunities\",\"viz\":\"bar\",\"metric_refs\":[\"won_revenue\"],\"group_by\":[{\"field\":\"owner.region.region_name\"}],\"filters\":{\"logic\":\"AND\",\"conditions\":[{\"field\":\"close_date\",\"op\":\"date_range\",\"value\":\"last_quarter\"}]},\"totals\":true}}"}
]}
```

Composition targets:

| Slice | Share | Source |
|---|---|---|
| Real user questions, thumbs-up, admin-approved | 50 % | The feedback corpus |
| The 30 existing report templates' `question` strings + their known-correct configs | 15 % | Already in the repo — free, curated, domain-accurate |
| Paraphrases of real questions (2–3 per question) | 15 % | Written by hand, or generated then human-reviewed |
| **Ambiguous → clarify** | 8 % | Hand-written |
| **Impossible → refuse** | 7 % | Hand-written |
| **Adversarial / injection → refuse** | 5 % | The security test corpus |

The last three slices are the ones teams omit, and omitting them is how a fine-tuned model becomes
*more* confident and *less* safe: a model trained only on answerable questions learns that every
question is answerable, and stops refusing. Refusal and clarification examples are not padding — they
are the point.

Hold out **20 %** as a test split that is *never* trained on, and keep the golden set separate from
both.

### The procedure

```bash
# ── 1. Environment (a GPU box; the same g6.xlarge is fine) ────────────────
pip install "torch" "transformers" "peft" "trl" "datasets" "bitsandbytes" "accelerate"

# ── 2. Train a QLoRA adapter ──────────────────────────────────────────────
python ops/llm/train_planner_lora.py \
  --base_model Qwen/Qwen3-14B \
  --train_file ops/llm/data/planner-train.jsonl \
  --eval_file  ops/llm/data/planner-eval.jsonl \
  --output_dir ops/llm/adapters/planner-v1 \
  --load_in_4bit \
  --lora_r 16 --lora_alpha 32 --lora_dropout 0.05 \
  --target_modules q_proj,k_proj,v_proj,o_proj,gate_proj,up_proj,down_proj \
  --learning_rate 1e-4 --lr_scheduler_type cosine --warmup_ratio 0.03 \
  --num_train_epochs 3 --per_device_train_batch_size 1 \
  --gradient_accumulation_steps 16 --max_seq_length 4096 \
  --bf16 --gradient_checkpointing

# ── 3. Merge + quantise for serving (GGUF route) ──────────────────────────
python ops/llm/merge_lora.py \
  --base Qwen/Qwen3-14B \
  --adapter ops/llm/adapters/planner-v1 \
  --out ops/llm/weights/genesis-planner-v1-f16
python llama.cpp/convert_hf_to_gguf.py ops/llm/weights/genesis-planner-v1-f16 \
  --outfile ops/llm/weights/genesis-planner-v1-f16.gguf
./llama.cpp/llama-quantize ops/llm/weights/genesis-planner-v1-f16.gguf \
  ops/llm/weights/genesis-planner-v1-q4_k_m.gguf Q4_K_M

# ── 4. THE GATE — the tuned model must BEAT the base model ────────────────
node backend/scripts/eval-ai-reporting.js --model base   --out ops/llm/eval/base.json
node backend/scripts/eval-ai-reporting.js --model tuned  --out ops/llm/eval/v1.json
node backend/scripts/eval-ai-reporting.js --compare ops/llm/eval/base.json ops/llm/eval/v1.json
```

Ship the adapter **only if** it improves exact-plan-match on the held-out split **and** does not
regress the refusal, clarification or security sets. A tune that gains 4 points on accuracy while
losing one refusal case is a net loss and must be rejected — the eval harness is what makes that call
objective rather than a matter of impression.

For vLLM, the adapter can be served without merging (`--enable-lora --lora-modules
planner=/adapters/planner-v1`), which makes A/B and instant rollback trivial. Prefer that over
merging.

### Hyperparameters that matter, and why

| Setting | Value | Reason |
|---|---|---|
| `lora_r` | 16 (32 if the dataset exceeds ~2 000 examples) | Higher rank memorises; on a small dataset that is overfitting, not learning |
| `learning_rate` | 1e-4 | The standard LoRA range (1e-4 – 2e-4); a full fine-tune's 2e-5 under-trains an adapter |
| `num_train_epochs` | 3 | Beyond ~4 on a small set, the model starts reproducing training questions verbatim |
| `max_seq_length` | 4096 | Must cover system + catalogue + question + plan, or examples are silently truncated |
| Loss masking | **completion only** | Compute loss on the assistant turn only. Training on the catalogue teaches it to *recite the catalogue*, which is worse than useless |

### Recurring costs, stated honestly

| Cost | Reality |
|---|---|
| Dataset curation | 2–5 days of an engineer + business review, per major revision |
| Training run | ~2–3 GPU-hours (~$3 on a g6.xlarge) — genuinely negligible |
| Eval + sign-off | Half a day |
| **Re-tune triggers** | Every registry change, new metric, new source, or base-model upgrade |
| **Ongoing** | The tune is now a versioned artefact with a lifecycle, forever |

The training run is cheap. The *lifecycle* is not, and that asymmetry is the argument for staying on
layers 1–7 as long as they hold.

## 2.4 What we will actually do

```text
Phase 3   Layers 1–6. Run the eval harness. ── This is the go/no-go gate for the whole feature.
Phase 4–5 Ship. Collect thumbs-up/down from real usage.
Phase 6   Layer 7 — dynamic exemplar retrieval from the approved corpus.
Phase 9+  Re-run the eval. Fine-tune ONLY IF a stable failure class survives, and only if it
          clears the comparison gate against the base model.
```

**The honest expectation: we will not need to fine-tune.** The task is constrained selection from a
closed vocabulary with a validator behind it; that is exactly the shape where prompt-plus-retrieval
performs at or near a tune's level. The plan keeps the option open and measurable rather than
promising it — and if you would like fine-tuning treated as a committed deliverable rather than a
contingency, that is a scope and budget decision to make now, not later.

---

# PART 3 — WHERE THE MODEL LIVES, HOW IT WORKS, AND WHY

## 3.1 Why local at all

The brief mandates it, but the reasons are worth stating because they also constrain *how* it is
deployed.

| Reason | Consequence for the design |
|---|---|
| **Data residency** — prompts carry the client's business metadata (source names, metric definitions, field labels) | The inference host must be inside our VPC, with no internet egress. Not "a local model reachable over the internet". |
| **No per-token billing** — reporting questions are unbounded and bursty | Fixed cost per hour, not variable per use. Makes the feature safe to offer to every user. |
| **Offline capability** — some client deployments are air-gapped | Weights baked into the image (§1.7). No runtime dependency on any external host. |
| **No vendor availability risk** — an outage of a hosted API would take the feature down | We control uptime; and the feature degrades cleanly when the host is down. |
| **Auditability** — a client security review must be answerable | One named model, one pinned revision, one licence file, one register entry. |
| **Model stability** — a hosted model silently changing behind a version alias would break the eval baseline | Our weights change only when we change them. The golden-set scores stay meaningful. |

The cost of all this is the GPU bill and the operational surface. Part 3.7 sizes both.

## 3.2 Where it resides — the topology

```text
                    ┌───────────────────────────────────────────────────────┐
   Internet ──ALB──►│  ECS Fargate · genesis-frontend   (nginx, static SPA) │
                    │  ECS Fargate · genesis-backend    (Fastify, Node 20)  │
                    └──────────┬──────────────────────────┬─────────────────┘
                               │                          │
        ┌──────────────────────┘                          └──────────────────────┐
        │  SG-to-SG, private subnets, NO public IP, NO internet egress            │
        ▼                                                                         ▼
┌────────────────────────────┐                          ┌─────────────────────────────────────┐
│ RDS MySQL 8  (+ replica)   │                          │ ECS on EC2 (GPU) · genesis-llm      │
│ ElastiCache Redis          │                          │  g6.xlarge — NVIDIA L4, 24 GB        │
└────────────────────────────┘                          │  vLLM · Qwen3-14B (AWQ), think off   │
                                                        │  weights baked into the image        │
                                                        │  internal NLB → :8000                │
                                                        │  ── no DB access                     │
                                                        │  ── no internet egress               │
                                                        │  ── no public endpoint               │
                                                        └─────────────────────────────────────┘
```

Three properties are deliberate and worth defending in a review:

1. **The LLM service has no database credentials and no database route.** Even a fully compromised
   model container cannot reach a single row of client data. The model sees metadata in prompts and
   result *rows* only in the summary call — never a connection.
2. **It has no internet egress.** Nothing can be exfiltrated to, or pulled from, outside.
3. **It is a separate ECS service.** It scales, restarts, deploys and fails independently of the API.

### Why not Fargate

**ECS Fargate does not offer GPUs.** This is the single hard constraint on the deployment shape. The
options are:

| Option | Verdict |
|---|---|
| Fargate + CPU inference | ~8–15 tok/s → 15–30 s per answer. Demo only, not shippable. |
| **ECS on EC2 with a GPU capacity provider** | ★ **Recommended.** Keeps ECS as the orchestrator (same tooling, same deploy pipeline), adds one GPU capacity provider. |
| EKS with a GPU node group | Only if the organisation is already on Kubernetes. Otherwise it is new operational surface for no gain. |
| SageMaker endpoint | Managed, autoscaling — but more expensive and it reintroduces a managed-service dependency the "local" requirement was meant to remove. |
| Bare EC2 + systemd | Simplest, cheapest, no orchestration. Viable for a single-tenant on-prem install. |

### Alternative shapes for other deployment models

| Deployment | Where the model lives |
|---|---|
| **Multi-tenant SaaS (this one)** | One shared GPU service per environment. Prompts contain metadata but never cross-request state, so sharing is safe. |
| **Single-tenant / on-prem** | One GPU box beside the app server. Often an existing workstation-class GPU is enough. |
| **Air-gapped client site** | Same, with the §1.6 offline bundle. |
| **Developer laptop** | Ollama. An Apple-silicon Mac with 32 GB runs the 14B at usable speed; 16 GB machines should use `qwen3:8b`. The plan shape is identical either way. |
| **CI** | `LLM_PROVIDER=stub`. No model, no GPU, deterministic canned plans. |

## 3.3 How memory is actually consumed

The number that decides the instance size. For the recommended **Qwen3-14B** (40 layers, 8 KV heads
via GQA, head dim 128):

```text
  Weights (AWQ / Q4_K_M 4-bit)                              ~ 9.0 GB
  CUDA context + framework overhead                         ~ 1.0 GB
  KV cache  = 2 (K,V) × 40 layers × 8 kv_heads × 128 dim × 2 bytes
            ≈ 160 KB per token
              → 8 192-token context  ≈ 1.31 GB per concurrent sequence
              → 8 concurrent sequences ≈ 10.5 GB
  ─────────────────────────────────────────────────────────────────
  Total at 8-way concurrency (worst case, full context)     ~ 20.5 GB   ✅ on a 24 GB L4
```

That worst case assumes every one of eight sequences fills the full 8 K window. **Our prompts are
~2 700–4 100 tokens**, so real KV usage is roughly half — about **16 GB total at 8-way concurrency**,
which is the comfortable operating point. The headroom is deliberate: it is what lets concurrency
rise under load instead of requests failing, and it leaves room for a LoRA adapter later.

For the escape-hatch **Qwen3-8B** (36 layers, 8 KV heads): ~5.0 GB weights and ~144 KB/token, giving
roughly **11 GB at 8-way concurrency** — ample room, at the cost of the accuracy the 14B buys.

If concurrency must exceed ~12, the answer is a second GPU task behind the internal NLB, not a
smaller model — the service is stateless per request.

## 3.4 How a request actually works

```text
  t=0 ms   Browser POST /api/ai-reports/ask   { message: "Sales by region last quarter" }
     ↓
   +2 ms   Fastify: authenticate → JWT verified → tenantContext.run({ tenantId })
     ↓
   +4 ms   Feature flag + rate limit + provider health (cached, 15 s) — all in-process
     ↓
   +6 ms   ConversationService: load the active plan + last 6 compressed turns
     ↓
  +10 ms   SchemaContextService: route to `opportunities`, shortlist ~40 fields
           (in-memory; the catalogue was built once at boot)
     ↓
  +12 ms   PromptBuilder: system + catalogue + vocabulary + temporal facts + history
     ↓
  +12 ms   ── HTTP over the private subnet ──►  LLM service
     │
     │        vLLM: tokenise (~3 100 tokens)
     │        prefill  ~500 ms  (batched with any concurrent request)
     │        decode   ~210 tokens at ~45 tok/s, grammar-constrained to ReportPlan,
     │                 reasoning mode OFF
     │        ≈ 4 700 ms
     │
  +4.7 s   ◄── ReportPlan JSON ──
     ↓
  +4.7 s   PlanValidator: every field resolved against the registry, limits clamped   (~3 ms)
     ↓
  +4.7 s   Metric refs expanded → concrete { metrics, filters }
     ↓
  +5.1 s   ReportService.run(config, ctx) → Prisma (+ tenant extension) → MySQL      (~400 ms)
     ↓
  +5.1 s   ChartRecommender: 6 rows, 1 dimension, 1 measure → `bar`                  (<1 ms)
     ↓
           ── the chart and table are returned to the client HERE (summary async) ──
     ↓
  +7.2 s   SummaryService: second LLM call over 6 result rows only                   (~2 100 ms)
     ↓
  +7.2 s   Persist turn + audit row; respond
```

Two design choices fall straight out of this trace:

- **The LLM call dominates — ~94 % of the wall clock.** Everything else totals under half a second.
  Optimisation effort belongs on the prompt size and the plan cache, nowhere else. In particular,
  tuning the Prisma query here would be effort spent on 5 % of the time.
- **The summary is the last 30 %.** Returning the chart before it (`AI_REPORT_SUMMARY_ASYNC=true`)
  takes the user-perceived answer from ~7.2 s to ~5.1 s for free, and is why that flag defaults on in
  production.
- **A cached plan skips straight from +12 ms to the query**, giving a ~0.4 s answer. For a team that
  asks similar questions each morning, most requests are cache hits.

### Concurrency

vLLM's continuous batching means a second request arriving mid-decode joins the running batch rather
than queueing behind it. Practical envelope on one L4 with the recommended 14B:

| Concurrent plan requests | p95 latency (14B) | p95 (8B, for reference) | Note |
|---|---|---|---|
| 1 | ~4.5 s | ~2.6 s | Best case |
| 4 | ~5.5 s | ~3.2 s | The design target; `AI_REPORT_MAX_CONCURRENT` default |
| 8 | ~7.5 s | ~4.5 s | Acceptable peak |
| 12 | ~11 s | ~6 s | Degrading — scale out rather than accept this |
| 16+ | queueing | queueing | The visible "waiting for the model" state, then a clear rejection |

When p95 breaches the target consistently, the first fix is a **second GPU task behind the internal
NLB** — the service is stateless per request, so it scales horizontally without coordination.
Dropping to `Qwen3-8B` is the second option, and it trades away exactly the multi-constraint accuracy
the 14B was chosen for; make that trade on eval evidence, not on impatience.

## 3.5 How the application talks to it

One interface, three implementations, selected by configuration — so the model, the framework and the
host are all replaceable without touching reporting code.

```text
LlmProvider                       generateJson({ system, messages, schema, … }) → object
   │                              generateText({ system, messages, … }) → text
   │                              health() → status    (as shipped in services/llm/provider.js)
   ├── OllamaProvider             POST /api/chat        { format: <json-schema> }
   ├── OpenAiCompatibleProvider   POST /v1/chat/completions   (vLLM · llama.cpp · TGI · LM Studio)
   └── StubProvider               deterministic canned plans — CI and offline development
```

```bash
# Development (the shipped default is llama3.1:8b; qwen3:14b is this document's recommendation)
LLM_PROVIDER=ollama
LLM_BASE_URL=http://localhost:11434
LLM_MODEL=qwen3:14b
LLM_THINKING=false

# Production
LLM_PROVIDER=openai-compatible
LLM_BASE_URL=http://genesis-llm.internal:8000/v1
LLM_MODEL=genesis-planner
LLM_THINKING=false

# CI
LLM_PROVIDER=stub
```

Switching from Ollama to vLLM, from the 14B to the 8B, or from a base model to a fine-tuned adapter
is a change to these variables. **That is the whole point of the abstraction**, and it is what keeps
the model choice a measured decision rather than a permanent commitment.

### Health, circuit breaking and failure

```text
health probe every 15 s (cached) ──► healthy ──► normal operation
                                 └─► 5 consecutive failures ──► CIRCUIT OPEN
                                                                 │
                    all /api/ai-reports/ask return 200 with      │
                    status: "llm_unavailable"                    │
                    the Ask Builder tab hides itself             │
                    ── /api/reports/* is COMPLETELY UNAFFECTED ──┘
                                                                 │
                                            after 60 s ──► HALF-OPEN ──► one probe ──► closed
```

`GET /health` reports `services.llm` but **never lets it affect the overall verdict** — an LLM outage
must not pull the API task out of the load balancer.

## 3.6 Operating it

### Lifecycle

| Event | Behaviour |
|---|---|
| **Cold start** | Container start → weights loaded from the local filesystem (baked in) → CUDA graphs warmed. **~60–120 s** for the 14B. Health checks must allow for it (grace period ≥ 180 s), or ECS will kill the task mid-load. |
| **Warm** | Weights stay resident. There is no per-request load cost. |
| **Idle** | The GPU idles at ~15–30 W. Memory stays allocated — that is desirable, not a leak. |
| **Deploy** | Rolling: start the new task, wait for healthy, drain the old. Zero-downtime; a brief window of doubled GPU cost. |
| **Scale to zero** | Viable outside business hours via a scheduled ECS service update. Accepts a ~2 min cold start for the first morning request. Roughly halves the bill, and frees the GPU for a fine-tuning window if one is ever needed. |
| **Crash** | ECS restarts the task. The circuit breaker keeps the API healthy throughout. |

### Monitoring

| Signal | Source | Alert when |
|---|---|---|
| GPU utilisation, VRAM used | DCGM exporter / CloudWatch agent | VRAM > 90 % sustained |
| Requests queued, time-to-first-token | vLLM `/metrics` | queue depth > 8 |
| p95 plan latency | Application (`timings_ms.plan`) | > 8 s for 10 min (the 14B gate) |
| Plan validation failure rate | Application | > 10 % over an hour — the model or catalogue drifted |
| Circuit-breaker state | Application | any open transition |
| Container restarts | ECS | > 2 in an hour |

### Swapping the model — the runbook

```text
1. Pull the candidate to a staging host; record revision + checksum in the model register (§1.2)
2. Build the image; run the §1.8 acceptance test (checks 1–7)
3. Run scripts/eval-ai-reporting.js against the candidate; compare with the incumbent's scores
4. If it does not clearly win on the golden set AND hold the refusal/security sets → stop
5. Deploy to staging; soak for 48 h with real traffic mirrored or a pilot group
6. Production: rolling deploy, or run both behind the NLB and shift traffic
7. Rollback = redeploy the previous image tag. Under 5 minutes.
```

Step 4 is the discipline that matters. Without it, model upgrades become taste, and regressions ship.

### Backup and recovery

There is no state to back up — the service is stateless and the weights are in the image. Recovery is
redeploying an image tag. What **must** be preserved is: the model register, the pinned revision
hashes, the licence files, the golden set, and the approved-exemplar corpus (in MySQL, covered by the
existing RDS backups). Those are the irreplaceable artefacts; the weights are re-downloadable.

## 3.7 What it costs

Indicative `us-east-2` on-demand; re-check before committing, but the ranking is stable.

| Item | Monthly (24×7) | With a 12 h/day schedule |
|---|---|---|
| `g6.xlarge` (L4 24 GB) on-demand | ~$580 | ~$290 |
| Same, 1-year Savings Plan | ~$350 | — |
| Same, Spot with on-demand fallback | ~$180–230 | ~$110 |
| EBS (100 GB gp3, image + logs) | ~$8 | ~$8 |
| Internal NLB | ~$18 | ~$18 |
| **Realistic target** | **~$370–600** | **~$300–320** |

Spot is genuinely viable here **because AI reporting is a degradable feature**: an interruption
opens the circuit breaker, the tab hides itself, and existing Reports carries on untouched. That is
precisely the workload profile Spot is designed for.

For comparison, the same volume against a hosted API would be usage-priced and unbounded — and would
fail the data-residency and offline requirements outright, so it is not actually an available
alternative, only a cost reference point.

## 3.8 Why this shape, in one table

| Decision | Alternative rejected | Reason |
|---|---|---|
| Separate ECS service | Run the model in the backend container | Different scaling profile, different hardware, and a model crash would take the API down |
| GPU on EC2 | Fargate | Fargate has no GPUs; CPU inference is 5–10× too slow |
| Weights baked into the image | Volume mount / runtime download | Removes a runtime dependency; makes "offline" true rather than aspirational |
| No DB access from the LLM host | Give it a read-only connection for "smarter" answers | The architecture never needs it, and not having it makes a whole class of compromise impossible |
| Shared service across tenants | One model per tenant | Requests are independent and carry no cross-request state; per-tenant GPUs would multiply cost with no security gain |
| One interface, config-selected provider | Hard-code Ollama | The model is a measured choice that will change; it must be replaceable without code |
| vLLM in production, Ollama in development | One framework everywhere | Ollama is far better for developer ergonomics; vLLM is far better under concurrency. Both speak the same API, so this costs nothing |
| Circuit breaker + feature flag | Retry until it works | An LLM outage must be invisible to the existing Reports module, which is the brief's hardest requirement |

---

## Appendix — the checklist

### Getting the model

- [ ] Licence reviewed and approved (Apache-2.0 unless legal clears otherwise)
- [ ] `LICENSE` + model card committed to `ops/llm/licences/`
- [ ] `ops/llm/MODEL_REGISTER.md` created — model, revision hash, licence, date, approver
- [ ] Weights downloaded pinned to a **commit SHA**, never `main`
- [ ] `SHA256SUMS` generated and committed
- [ ] Constrained-decoding smoke test passes (§1.4 step 5)
- [ ] Reasoning/thinking mode confirmed **off** (no `<think>` block in any response)
- [ ] Weights baked into `ops/llm/Dockerfile`
- [ ] Acceptance test 1–8 green, including the golden-set eval

### Teaching it your business

- [ ] Schema catalogue generating from `report-registry.js`
- [ ] **8–12 business metric definitions agreed with the business** and written into `report-semantics.js`
- [ ] Synonyms for all 6 sources
- [ ] Financial-year convention confirmed and wired to `fiscal_year_start_month`
- [ ] 10–15 few-shot exemplars, including clarify / refuse / injection cases
- [ ] Golden set of ~60 questions with expected plans
- [ ] Feedback capture live, feeding the approved-exemplar corpus
- [ ] Dynamic exemplar retrieval (Phase 6)
- [ ] Fine-tuning: **not planned** — revisit only against a stable, measured failure class
- [ ] Golden-set eval run across Qwen3-14B / Qwen2.5-14B-Instruct / Qwen3-8B; Part D9 rule applied

### Running it

- [ ] GPU capacity provider + ECS service + internal NLB
- [ ] Security groups: backend → LLM only; no public IP; no internet egress
- [ ] No database credentials on the LLM task
- [ ] Health-check grace period ≥ 180 s (14B cold start)
- [ ] `--disable-log-requests` (or equivalent) — prompts are not logged
- [ ] Circuit breaker + feature flag verified by killing the service in staging
- [ ] **Regression test: existing `/api/reports/*` fully functional with the LLM dead**
- [ ] GPU/queue/latency monitoring and alerts
- [ ] Model-swap runbook rehearsed once

<!-- nav:bottom -->

---

### Where to next

| | |
|---|---|
| **Next** | [Roadmap](../../project/roadmap.md) *(Project)* — What is done, what is next, known gaps and backlog |
| **Previous** | [LLM implementation walkthrough](implementation-walkthrough.md) |
| **Background** | [Understanding Genesis › How a request travels](../../understanding/04-how-a-request-travels.md) |
| **On these journeys** | [AI evaluator](../../README.md#ai-evaluator) (step 5 of 5) |
| **Lost?** | [Docs roadmap](../../README.md) · [AI reporting](README.md) · [Understanding Genesis](../../understanding/README.md) |
<!-- /nav:bottom -->
