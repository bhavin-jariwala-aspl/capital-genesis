'use strict';

/**
 * LLM provider abstraction for the AI reporting layer.
 *
 * Three implementations behind one tiny interface, chosen by `LLM_PROVIDER`:
 *
 *   ollama             — a local Ollama server (default). Uses /api/chat with a
 *                        JSON-schema `format`, so the model is grammar-constrained
 *                        to the ReportPlan contract and cannot emit prose.
 *   openai-compatible  — any server speaking the OpenAI chat-completions API
 *                        (vLLM, LM Studio, llama.cpp, a hosted model). Uses
 *                        `response_format: json_schema` when supported, else
 *                        `json_object` plus a parse.
 *   stub               — deterministic canned answers for tests and CI. Never
 *                        makes a network call.
 *
 * The interface is deliberately minimal — `generateJson` and `generateText` —
 * because everything that makes the feature safe (validation, scope, execution)
 * happens *after* the model in ai-reporting.service.js, not in here.
 *
 * Environment:
 *   LLM_PROVIDER=ollama|openai-compatible|stub
 *   LLM_BASE_URL   (default http://localhost:11434 for ollama)
 *   LLM_MODEL      (default llama3.1:8b)
 *   LLM_API_KEY    (openai-compatible only)
 *   LLM_TIMEOUT_MS (default 90000)
 *   LLM_THINKING   (default false — reasoning traces are wasted tokens for a planner)
 */

const DEFAULT_TIMEOUT_MS = 90_000;
/** Prompt + plan comfortably fit; the Ollama default (4k) can silently truncate the catalogue. */
const NUM_CTX = 8192;
/** Keep the model loaded between questions so only the first one pays the load cost. */
const KEEP_ALIVE = '30m';

class LlmError extends Error {
  constructor(message, { code = 'llm_error', cause = null, status = null } = {}) {
    super(message);
    this.name = 'LlmError';
    this.code = code;
    this.cause = cause;
    this.status = status;
  }
}

/** POST JSON with a timeout; surfaces network and HTTP failures as LlmError. */
async function postJson(url, body, { headers = {}, timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    const text = await res.text();
    if (!res.ok) throw new LlmError(`Model server returned ${res.status}`, { code: 'llm_http', status: res.status, cause: text.slice(0, 500) });
    try { return JSON.parse(text); } catch (e) { throw new LlmError('Model server returned malformed JSON', { code: 'llm_bad_response', cause: e }); }
  } catch (err) {
    if (err instanceof LlmError) throw err;
    if (err.name === 'AbortError') throw new LlmError('The model took too long to answer', { code: 'llm_timeout' });
    throw new LlmError('The model server could not be reached', { code: 'llm_unavailable', cause: err });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Pull the first JSON object out of a model reply that may be wrapped in fences
 * or prose — the fallback path for providers without constrained decoding.
 */
function extractJson(text) {
  if (!text) throw new LlmError('The model returned an empty answer', { code: 'llm_empty' });
  const cleaned = String(text).replace(/```(?:json)?/gi, '').trim();
  try { return JSON.parse(cleaned); } catch { /* fall through */ }
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start === -1 || end <= start) throw new LlmError('The model did not return JSON', { code: 'llm_not_json' });
  try { return JSON.parse(cleaned.slice(start, end + 1)); } catch (e) {
    throw new LlmError('The model returned unparsable JSON', { code: 'llm_not_json', cause: e });
  }
}

// ── Ollama ──────────────────────────────────────────────────────────────────

class OllamaProvider {
  constructor({ baseUrl, model, timeoutMs, thinking }) {
    this.name = 'ollama';
    this.baseUrl = (baseUrl || 'http://localhost:11434').replace(/\/$/, '');
    this.model = model || 'llama3.1:8b';
    this.timeoutMs = timeoutMs || DEFAULT_TIMEOUT_MS;
    this.thinking = !!thinking;
  }

  #messages(system, messages) {
    return [{ role: 'system', content: system }, ...messages.map((m) => ({ role: m.role, content: m.content }))];
  }

  async generateJson({ system, messages, schema, temperature = 0, maxTokens = 1200 }) {
    const started = Date.now();
    const res = await postJson(`${this.baseUrl}/api/chat`, {
      model: this.model,
      messages: this.#messages(system, messages),
      stream: false,
      format: schema,
      think: this.thinking,
      keep_alive: KEEP_ALIVE,
      options: { temperature, num_predict: maxTokens, num_ctx: NUM_CTX },
    }, { timeoutMs: this.timeoutMs });
    const raw = res?.message?.content ?? '';
    return { json: extractJson(raw), raw, ms: Date.now() - started, model: res?.model || this.model };
  }

  async generateText({ system, messages, temperature = 0.2, maxTokens = 400 }) {
    const started = Date.now();
    const res = await postJson(`${this.baseUrl}/api/chat`, {
      model: this.model,
      messages: this.#messages(system, messages),
      stream: false,
      think: this.thinking,
      keep_alive: KEEP_ALIVE,
      options: { temperature, num_predict: maxTokens, num_ctx: NUM_CTX },
    }, { timeoutMs: this.timeoutMs });
    return { text: String(res?.message?.content ?? '').trim(), ms: Date.now() - started, model: res?.model || this.model };
  }

  /** Cheap liveness + "is the configured model actually pulled" check. */
  async health() {
    const started = Date.now();
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 3000);
      const res = await fetch(`${this.baseUrl}/api/tags`, { signal: ctrl.signal }).finally(() => clearTimeout(t));
      if (!res.ok) return { ok: false, provider: this.name, model: this.model, reason: `Ollama returned ${res.status}` };
      const body = await res.json();
      const names = (body.models || []).map((m) => m.name);
      const present = names.includes(this.model) || names.includes(`${this.model}:latest`);
      return {
        ok: present,
        provider: this.name,
        model: this.model,
        latency_ms: Date.now() - started,
        reason: present ? null : `Model "${this.model}" is not pulled. Run: ollama pull ${this.model}`,
        available_models: names.slice(0, 10),
      };
    } catch (err) {
      return { ok: false, provider: this.name, model: this.model, reason: `Ollama is not reachable at ${this.baseUrl} (${err.message})` };
    }
  }
}

// ── OpenAI-compatible ───────────────────────────────────────────────────────

class OpenAICompatibleProvider {
  constructor({ baseUrl, model, apiKey, timeoutMs }) {
    this.name = 'openai-compatible';
    this.baseUrl = (baseUrl || 'http://localhost:8000/v1').replace(/\/$/, '');
    this.model = model || 'default';
    this.apiKey = apiKey || '';
    this.timeoutMs = timeoutMs || DEFAULT_TIMEOUT_MS;
  }

  #headers() { return this.apiKey ? { Authorization: `Bearer ${this.apiKey}` } : {}; }

  async generateJson({ system, messages, schema, temperature = 0, maxTokens = 1200 }) {
    const started = Date.now();
    const body = {
      model: this.model,
      temperature,
      max_tokens: maxTokens,
      messages: [{ role: 'system', content: system }, ...messages],
      response_format: schema
        ? { type: 'json_schema', json_schema: { name: 'ReportPlan', schema, strict: true } }
        : { type: 'json_object' },
    };
    let res;
    try {
      res = await postJson(`${this.baseUrl}/chat/completions`, body, { headers: this.#headers(), timeoutMs: this.timeoutMs });
    } catch (err) {
      // Servers that do not support json_schema reject with 400 — retry with json_object.
      if (err.status !== 400 || !schema) throw err;
      res = await postJson(`${this.baseUrl}/chat/completions`, { ...body, response_format: { type: 'json_object' } }, { headers: this.#headers(), timeoutMs: this.timeoutMs });
    }
    const raw = res?.choices?.[0]?.message?.content ?? '';
    return { json: extractJson(raw), raw, ms: Date.now() - started, model: res?.model || this.model };
  }

  async generateText({ system, messages, temperature = 0.2, maxTokens = 400 }) {
    const started = Date.now();
    const res = await postJson(`${this.baseUrl}/chat/completions`, {
      model: this.model, temperature, max_tokens: maxTokens,
      messages: [{ role: 'system', content: system }, ...messages],
    }, { headers: this.#headers(), timeoutMs: this.timeoutMs });
    return { text: String(res?.choices?.[0]?.message?.content ?? '').trim(), ms: Date.now() - started, model: res?.model || this.model };
  }

  async health() {
    const started = Date.now();
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 3000);
      const res = await fetch(`${this.baseUrl}/models`, { headers: this.#headers(), signal: ctrl.signal }).finally(() => clearTimeout(t));
      return { ok: res.ok, provider: this.name, model: this.model, latency_ms: Date.now() - started, reason: res.ok ? null : `Server returned ${res.status}` };
    } catch (err) {
      return { ok: false, provider: this.name, model: this.model, reason: `Model server not reachable at ${this.baseUrl} (${err.message})` };
    }
  }
}

// ── Stub (tests / CI) ───────────────────────────────────────────────────────

/**
 * Answers from a queue of canned replies (`stub.queue(json)`), or a default
 * clarification when the queue is empty. Records every prompt for assertions.
 */
class StubProvider {
  constructor() {
    this.name = 'stub';
    this.model = 'stub';
    this.calls = [];
    this.replies = [];
    this.textReplies = [];
  }

  queue(json) { this.replies.push(json); return this; }
  queueText(text) { this.textReplies.push(text); return this; }

  async generateJson(req) {
    this.calls.push({ kind: 'json', ...req });
    const json = this.replies.length ? this.replies.shift() : {
      intent: 'clarify',
      clarification: { question: 'Which of these do you mean?', options: ['Opportunities', 'Policies'] },
    };
    return { json, raw: JSON.stringify(json), ms: 1, model: this.model };
  }

  async generateText(req) {
    this.calls.push({ kind: 'text', ...req });
    const text = this.textReplies.length ? this.textReplies.shift() : '';
    return { text, ms: 1, model: this.model };
  }

  async health() { return { ok: true, provider: this.name, model: this.model, latency_ms: 0, reason: null }; }
}

// ── Factory ─────────────────────────────────────────────────────────────────

function createProvider(env = process.env) {
  const kind = String(env.LLM_PROVIDER || 'ollama').toLowerCase();
  const common = {
    baseUrl: env.LLM_BASE_URL,
    model: env.LLM_MODEL,
    apiKey: env.LLM_API_KEY,
    timeoutMs: Number(env.LLM_TIMEOUT_MS) || DEFAULT_TIMEOUT_MS,
    thinking: String(env.LLM_THINKING || 'false') === 'true',
  };
  if (kind === 'stub') return new StubProvider();
  if (kind === 'openai-compatible' || kind === 'openai') return new OpenAICompatibleProvider(common);
  return new OllamaProvider(common);
}

module.exports = { createProvider, OllamaProvider, OpenAICompatibleProvider, StubProvider, LlmError, extractJson };
