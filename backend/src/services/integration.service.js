'use strict';

const https  = require('node:https');
const http   = require('node:http');
const crypto = require('node:crypto');
const dns    = require('node:dns');

const { logger }                     = require('./logging.service');
const { tenantContext, getTenantId } = require('../middleware/tenant-scope');

// Private / loopback / link-local ranges an outbound request must never reach.
// Applied both to literal hosts in the URL and to every DNS-resolved IP.
const PRIVATE_HOST_PATTERNS = [
  /^localhost$/,
  /^127\./,
  /^0\./,            // 0.0.0.0/8 (incl. the "this host" address)
  /^10\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^192\.168\./,
  /^169\.254\./,     // link-local (incl. cloud metadata 169.254.169.254)
  /^::1$/,           // IPv6 loopback
  /^::$/,            // IPv6 unspecified
  /^::ffff:/,        // any remaining IPv4-mapped form
  /^[fF][cCdD]/,     // IPv6 ULA fc00::/7
  /^fe80:/i,         // IPv6 link-local
];

/**
 * True if `rawHost` (a hostname literal or a resolved IP) falls in a
 * private/loopback/link-local range and must be blocked for SSRF safety.
 * Normalises bracketed IPv6, IPv4-mapped IPv6, and integer/hex IPv4 encodings.
 */
function isPrivateHost(rawHost) {
  let host = String(rawHost).toLowerCase().replace(/^\[|\]$/g, '');
  if (!host) return true;
  const mapped = host.match(/^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/);
  if (mapped) host = mapped[1];
  // Non-standard integer / hex IPv4 encodings (e.g. 2130706433, 0x7f000001).
  if (/^\d+$/.test(host) || /^0x[0-9a-f]+$/.test(host)) return true;
  return PRIVATE_HOST_PATTERNS.some((r) => r.test(host));
}

/**
 * A drop-in replacement for dns.lookup used as the http(s) request `lookup`
 * option. It resolves the host and rejects the connection if ANY resolved
 * address is private — and because the connection then uses the very address
 * we validated, a DNS-rebinding TOCTOU (public on the guard check, private on
 * the real connect) cannot slip through.
 */
function ssrfSafeLookup(hostname, options, callback) {
  dns.lookup(hostname, { ...options, all: true }, (err, addresses) => {
    if (err) return callback(err);
    const list = Array.isArray(addresses) ? addresses : [addresses];
    for (const a of list) {
      if (isPrivateHost(a.address)) {
        const e = new Error('Blocked outbound URL (SSRF protection): host resolves to a private/loopback address');
        e.code = 'SSRF_BLOCKED';
        return callback(e);
      }
    }
    if (options && options.all) return callback(null, list);
    return callback(null, list[0].address, list[0].family);
  });
}

// Version stamped on every outbound event envelope. Bump when the envelope
// shape changes so external subscribers can branch on it (as Stripe/HubSpot do).
const INTEGRATION_API_VERSION = '2024-01';

// Connector types that dispatchEvent() can fan an event out to (they make an
// outbound call). Inbound connectors never "send", so they are never subscribers.
// Defined as a getter below once the connector list exists.

// ── Connector registry ────────────────────────────────────────────────────

/**
 * Each connector must implement:
 *   async execute(config, payload) → { status, response_body, duration_ms }
 */

class OutboundWebhookConnector {
  async execute(config, payload) {
    const url = config?.url;
    if (!url) {
      const err = new Error('OutboundWebhookConnector: config.url is required');
      err.code = 'CONFIG_ERROR'; // deterministic — do not retry
      throw err;
    }

    const body = typeof payload === 'string' ? payload : JSON.stringify(payload ?? {});
    return this.request({
      url,
      method:     config?.method ?? 'POST',
      headers:    config?.headers ?? {},
      body,
      secret:     config?.secret ?? null,
      timeout_ms: config?.timeout_ms ?? 10_000,
    });
  }

  /**
   * Low-level single-shot delivery — the ONE place any outbound webhook HTTP
   * call is made in the whole application (workflow webhook steps delegate here
   * too). It provides, in one spot:
   *   • SSRF protection (private/loopback hosts rejected)
   *   • optional HMAC-SHA256 request signing (X-Signature-256)
   *   • non-2xx = failure semantics (matches HubSpot / Stripe / Pipedrive)
   *
   * @throws on SSRF block, network error, timeout, or any non-2xx response so
   *         the caller's retry + error-logging path engages.
   */
  async request({ url, method = 'POST', headers = {}, body = '', secret = null, timeout_ms = 10_000 }) {
    if (!OutboundWebhookConnector.isSafeUrl(url)) {
      const err = new Error('Blocked outbound URL (SSRF protection): private/loopback hosts are not allowed');
      err.code = 'SSRF_BLOCKED';
      throw err;
    }

    method = String(method).toUpperCase();
    const noBody = ['GET', 'HEAD'].includes(method);
    const finalHeaders = { 'Content-Type': 'application/json', ...headers };

    // Sign the EXACT bytes we transmit so the receiver can authenticate the
    // sender — the symmetric counterpart to inbound verifySignature().
    if (secret && !noBody) {
      finalHeaders['X-Signature-256'] = 'sha256=' + crypto
        .createHmac('sha256', secret)
        .update(body, 'utf-8')
        .digest('hex');
    }

    const start = Date.now();
    const res   = await this.#httpRequest({ url, method, headers: finalHeaders, body: noBody ? null : body, timeout_ms });
    const duration_ms = Date.now() - start;

    if (res.status < 200 || res.status >= 300) {
      const err = new Error(`Webhook returned HTTP ${res.status}`);
      err.status        = res.status;
      err.response_body = res.body;
      err.duration_ms   = duration_ms;
      throw err;
    }

    return { status: res.status, response_body: res.body, duration_ms };
  }

  /** Simple promisified HTTP/HTTPS request without third-party dependencies */
  #httpRequest({ url, method, headers, body, timeout_ms = 10_000 }) {
    return new Promise((resolve, reject) => {
      const parsedUrl = new URL(url);
      const lib       = parsedUrl.protocol === 'https:' ? https : http;
      const hasBody   = body != null && body !== '';

      const options = {
        hostname: parsedUrl.hostname,
        port:     parsedUrl.port || (parsedUrl.protocol === 'https:' ? 443 : 80),
        path:     parsedUrl.pathname + parsedUrl.search,
        method,
        headers:  hasBody ? { ...headers, 'Content-Length': Buffer.byteLength(body) } : headers,
        // Validate the RESOLVED IP (not just the hostname string) and pin the
        // connection to it — closes the SSRF/DNS-rebinding hole where a public
        // name resolves to an internal/metadata address at connect time.
        lookup:   ssrfSafeLookup,
      };

      const req = lib.request(options, res => {
        const chunks = [];
        res.on('data', c => chunks.push(c));
        res.on('end',  () => {
          let parsed;
          const raw = Buffer.concat(chunks).toString('utf-8');
          try { parsed = JSON.parse(raw); } catch { parsed = raw; }
          resolve({ status: res.statusCode, body: parsed });
        });
      });

      req.setTimeout(timeout_ms, () => {
        req.destroy(new Error('Request timed out'));
      });

      req.on('error', reject);
      if (hasBody) req.write(body);
      req.end();
    });
  }

  /**
   * Canonical SSRF guard for ALL outbound HTTP in the app. Blocks
   * private/loopback/link-local hosts and any non-http(s) scheme.
   * Exposed statically so the workflow engine reuses the exact same policy.
   */
  static isSafeUrl(urlString) {
    let url;
    try { url = new URL(urlString); } catch { return false; }
    if (!['http:', 'https:'].includes(url.protocol)) return false;
    if (!url.hostname) return false;
    // Fast synchronous pre-filter for literal private hosts. The authoritative
    // check happens at connection time (ssrfSafeLookup validates the resolved
    // IP), which also covers public names that resolve to internal addresses.
    return !isPrivateHost(url.hostname);
  }
}

/**
 * EnrichmentConnector — calls an external data-enrichment provider (Clearbit,
 * Apollo, a custom lookup service, …) with the current record and returns the
 * enrichment data. It is a real, working connector: it POSTs the payload to
 * `config.url` (SSRF-guarded, optionally signed) and returns the provider's
 * response as `response_body`.
 *
 * When used as a workflow `enrichment`/`integration` step, `config.field_map`
 * (`{ recordField: 'dotted.path.in.response' }`) tells the caller which response
 * values to write back onto the record — the metadata-driven write-back is
 * performed by the workflow engine, which owns the record context.
 */
class EnrichmentConnector {
  async execute(config, payload) {
    const url = config?.url;
    if (!url) {
      const err = new Error('EnrichmentConnector: config.url is required');
      err.code = 'CONFIG_ERROR';
      throw err;
    }
    return new OutboundWebhookConnector().request({
      url,
      method:     config?.method ?? 'POST',
      headers:    config?.headers ?? {},
      body:       JSON.stringify(payload ?? {}),
      secret:     config?.secret ?? null,
      timeout_ms: config?.timeout_ms ?? 10_000,
    });
  }
}

/**
 * CustomConnector — a user-defined generic outbound connector. Behaves exactly
 * like an outbound webhook (SSRF-guarded, optionally signed, retried) but is a
 * distinct type so teams can model bespoke destinations separately from
 * first-class "outbound webhook" integrations.
 */
class CustomConnector extends OutboundWebhookConnector {}

/**
 * InboundWebhookConnector — receives and logs inbound HTTP payloads.
 *
 * Unlike the outbound connector, this one is not "executed" in the classic
 * sense.  Instead, IntegrationService.receiveInbound() is the entry point.
 * This connector acts as the config schema / validator for inbound integrations.
 *
 * Supported config fields:
 *   secret      — optional string; if set, every inbound request must carry a
 *                 valid HMAC-SHA256 signature in X-Signature-256 header.
 *   event_field — optional dotted path to the event name inside the payload
 *                 (default: tries `event`, then `type`, then `action`).
 *   event_map   — optional { eventName: workflowId } map; when the inbound
 *                 event matches, the corresponding workflow is executed.
 */
class InboundWebhookConnector {
  async execute(_config, _payload) {
    // Inbound webhooks are received via the /api/integrations/inbound/:name
    // route; the `execute()` path is not used for inbound type.
    throw new Error('InboundWebhookConnector: use receiveInbound() instead of executeIntegration()');
  }

  /**
   * Verify an HMAC-SHA256 signature.
   * @param {string}         rawBody   original request body string (before JSON parse)
   * @param {string}         secret    shared secret from integration config
   * @param {string|undefined} signature value of X-Signature-256 header (format: sha256=<hex>)
   * @throws when signature is absent or invalid
   */
  static verifySignature(rawBody, secret, signature) {
    if (!secret) return; // no secret configured → no verification required
    if (!signature) throw new Error('Missing X-Signature-256 header');
    const expected = 'sha256=' + crypto
      .createHmac('sha256', secret)
      .update(rawBody, 'utf-8')
      .digest('hex');
    // Buffers must be equal length for timingSafeEqual, else it throws — guard first.
    const sigBuf = Buffer.from(signature);
    const expBuf = Buffer.from(expected);
    if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
      throw new Error('Inbound webhook signature mismatch');
    }
  }
}

const CONNECTOR_REGISTRY = {
  outbound_webhook:  OutboundWebhookConnector,
  inbound_webhook:   InboundWebhookConnector,
  enrichment:        EnrichmentConnector,
  custom:            CustomConnector,
  // email_sync — planned (requires IMAP/OAuth mailbox sync); not yet offered.
};

// ── IntegrationService ────────────────────────────────────────────────────

const VALID_TYPES = Object.keys(CONNECTOR_REGISTRY);
// Connector types that can be the target of an event fan-out (they "send").
const DELIVERABLE_TYPES = new Set(['outbound_webhook', 'custom', 'enrichment']);
const parseBool   = v => v === 'true' || v === true;

/**
 * Match a subscription pattern against a concrete event name.
 * Supports exact ('lead.created'), catch-all ('*'), and single-segment
 * wildcards ('lead.*', '*.created') — the same shape Pipedrive/Zoho expose.
 */
function eventMatches(pattern, event) {
  if (pattern === '*' || pattern === event) return true;
  if (!pattern.includes('*')) return false;
  const p = pattern.split('.');
  const e = event.split('.');
  if (p.length !== e.length) return false;
  return p.every((seg, i) => seg === '*' || seg === e[i]);
}

class IntegrationService {
  /**
   * @param {import('@prisma/client').PrismaClient} prisma
   * @param {object} [deps]
   * @param {import('./events.service').DomainEventBus} [deps.eventBus]     domain event backbone to subscribe to
   * @param {import('./workflow.service')}              [deps.workflowEngine] used for the inbound → workflow bridge
   */
  constructor(prisma, { eventBus = null, workflowEngine = null } = {}) {
    this.db             = prisma;
    this.eventBus       = null;
    this.workflowEngine = workflowEngine;
    // Short-TTL, per-tenant cache of active integrations so a high-frequency
    // event stream (every record create/update) doesn't hit the DB each time —
    // the common case (no subscribers) is served entirely from memory.
    this._subCache      = new Map(); // tenantId → { at: epochMs, integrations: [] }
    this._subCacheTtlMs = 15_000;
    this._objectCache   = new Map(); // objectId → { id, name } (slug, for the envelope)
    if (eventBus) this.setEventBus(eventBus);
  }

  // ── Dependency wiring (set up once in app.js) ──────────────────────────────

  /**
   * Register this service as a consumer on the domain event bus. From now on,
   * every domain event fans out to any active outbound integration subscribed
   * to it — this is what makes integrations a first-class, event-driven part
   * of the app rather than a stand-alone module.
   */
  setEventBus(eventBus) {
    this.eventBus = eventBus;
    eventBus.subscribe('*', (event, payload) => this.#onBusEvent(event, payload));
    return this;
  }

  /**
   * Normalise a bus payload into `dispatchEvent(event, data, context)`.
   * Handles both shapes on the bus:
   *   • record.* events from the service layer: `{ objectId, record, actorId, changed? }`
   *   • inbound-bridge events (`inbound.*`): `{ data, context }`
   */
  #onBusEvent(event, payload) {
    const data = payload?.record ?? payload?.data ?? payload ?? {};
    const context = {
      objectId: payload?.objectId ?? payload?.context?.objectId ?? null,
      object:   payload?.context?.object ?? null,
      actorId:  payload?.actorId ?? payload?.context?.actorId ?? null,
    };
    return this.dispatchEvent(event, data, context);
  }

  setWorkflowEngine(workflowEngine) {
    this.workflowEngine = workflowEngine;
    return this;
  }

  /** The app's single SSRF policy for outbound URLs (see OutboundWebhookConnector). */
  static isSafeUrl(url) {
    return OutboundWebhookConnector.isSafeUrl(url);
  }

  // ── CRUD ──────────────────────────────────────────────────────────────────

  /**
   * Signing secrets never leave the server. Reads replace `config.secret` with
   * a fixed placeholder and add `has_secret`; an update that sends the
   * placeholder back (or omits the key) keeps the stored secret unchanged.
   */
  static get SECRET_MASK() { return '••••••••'; }

  static maskSecret(row) {
    if (!row || !row.config || typeof row.config !== 'object') return row;
    const { secret, ...rest } = row.config;
    return { ...row, config: { ...rest, ...(secret ? { secret: IntegrationService.SECRET_MASK } : {}), has_secret: !!secret } };
  }

  async listIntegrations() {
    const rows = await this.db.integration.findMany({ orderBy: { name: 'asc' } });
    return rows.map(IntegrationService.maskSecret);
  }

  async getIntegration(id) {
    return IntegrationService.maskSecret(await this.db.integration.findUnique({ where: { id } }));
  }

  async createIntegration({ name, label, type, config, is_active }) {
    this.#validateType(type);
    const { has_secret: _hs, ...cleanConfig } = (config && typeof config === 'object') ? config : {};
    if (cleanConfig.secret === IntegrationService.SECRET_MASK || !cleanConfig.secret) delete cleanConfig.secret;
    const created = await this.db.integration.create({
      data: {
        name,
        label:     label ?? name,
        type,
        config:    cleanConfig,
        is_active: parseBool(is_active ?? false),
      },
    });
    this.#invalidateSubCache();
    return IntegrationService.maskSecret(created);
  }

  async updateIntegration(id, { label, type, config, is_active }) {
    if (type) this.#validateType(type);
    let nextConfig = config;
    if (config && typeof config === 'object') {
      const { has_secret: _hs, ...rest } = config;
      nextConfig = rest;
      if (!('secret' in rest) || rest.secret === IntegrationService.SECRET_MASK) {
        // Keep the stored secret: the client only ever saw the mask.
        const existing = await this.db.integration.findUnique({ where: { id }, select: { config: true } });
        if (existing?.config?.secret) nextConfig.secret = existing.config.secret;
        else delete nextConfig.secret;
      } else if (!rest.secret) {
        delete nextConfig.secret; // explicit blank clears it
      }
    }
    const updated = await this.db.integration.update({
      where: { id },
      data:  { label, type, config: nextConfig, ...(is_active !== undefined && { is_active: parseBool(is_active) }) },
    });
    this.#invalidateSubCache();
    return IntegrationService.maskSecret(updated);
  }

  async toggleIntegration(id, is_active) {
    const updated = await this.db.integration.update({ where: { id }, data: { is_active } });
    this.#invalidateSubCache();
    return updated;
  }

  async deleteIntegration(id) {
    const deleted = await this.db.integration.delete({ where: { id } });
    this.#invalidateSubCache();
    return deleted;
  }

  // ── Event catalog (for the UI subscription picker) ─────────────────────────

  /** The generic, object-agnostic events, plus the per-object action suffixes. */
  static get EVENT_ACTIONS() {
    return [
      { action: 'created',       label: 'created' },
      { action: 'updated',       label: 'updated' },
      { action: 'deleted',       label: 'deleted' },
      { action: 'field_changed', label: 'field changed' },
    ];
  }

  /**
   * The canonical generic event catalog (object-agnostic). Kept static so the
   * builder UI and the dispatch layer never drift apart.
   */
  static get EVENT_CATALOG() {
    return [
      ...IntegrationService.EVENT_ACTIONS.map(a => ({ event: `record.${a.action}`, label: `Record ${a.label}` })),
      { event: '*', label: 'All events' },
    ];
  }

  /**
   * Metadata-driven event catalog: the generic `record.*` events PLUS a
   * per-object variant for every active object in the system (e.g. `lead.created`,
   * `opportunity.updated`). This mirrors HubSpot/Pipedrive/Zoho, where you
   * subscribe to a specific object's events — and it's derived from the app's
   * own object metadata, so it always reflects the tenant's real objects.
   */
  async getEventCatalog() {
    let objects = [];
    try {
      objects = await this.db.uiObject.findMany({
        where:   { is_active: true },
        select:  { name: true, label: true },
        orderBy: { order_index: 'asc' },
      });
    } catch { /* metadata unavailable — fall back to generic events only */ }

    const generic = IntegrationService.EVENT_CATALOG;
    const perObject = objects.flatMap(o =>
      IntegrationService.EVENT_ACTIONS.map(a => ({
        event:  `${o.name}.${a.action}`,
        label:  `${o.label || o.name} ${a.label}`,
        object: o.name,
      })),
    );
    return { generic, objects: objects.map(o => ({ name: o.name, label: o.label || o.name })), events: [...generic, ...perObject] };
  }

  // ── Execution ─────────────────────────────────────────────────────────────

  /**
   * Execute a single integration by ID and log the result.
   * Transient failures (network error, timeout, HTTP 429/5xx) are retried with
   * exponential backoff, matching the at-least-once delivery guarantee the
   * major CRM webhook platforms provide.
   */
  async executeIntegration(id, payload = {}, opts = {}) {
    // dispatchEvent passes the already-loaded row to avoid a redundant lookup
    // per subscriber; direct callers (test button, retry) pass just an id.
    const integration = opts.integration ?? await this.db.integration.findUnique({ where: { id } });
    if (!integration) throw new Error(`Integration ${id} not found`);
    // The is_active toggle governs *automatic* event firing. Explicit invocations
    // (workflow named-connection / dispatch step) pass force to run regardless.
    if (!integration.is_active && !opts.force) throw new Error(`Integration ${id} is not active`);

    const ConnectorClass = CONNECTOR_REGISTRY[integration.type];
    if (!ConnectorClass) throw new Error(`No connector for type: ${integration.type}`);

    const connector = new ConnectorClass();

    // Retry policy — default 3 attempts for HTTP-sending connectors, single-shot otherwise.
    const maxAttempts = Math.max(1, Number(
      integration.config?.retry?.attempts ?? (DELIVERABLE_TYPES.has(integration.type) ? 3 : 1),
    ));
    const backoffMs = Number(integration.config?.retry?.backoff_ms ?? 500);

    const start = Date.now();
    let status        = 'success';
    let response_body = null;
    let errorMsg      = null;
    let duration_ms   = 0;
    let attempts      = 0;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      attempts = attempt;
      try {
        const result = await connector.execute(integration.config, payload);
        response_body = result.response_body;
        duration_ms   = result.duration_ms ?? (Date.now() - start);
        status        = 'success';
        errorMsg      = null;
        break;
      } catch (err) {
        status        = 'error';
        errorMsg      = err.message;
        response_body = err.response_body ?? null;
        duration_ms   = Date.now() - start;
        if (attempt >= maxAttempts || !this.#isRetryable(err)) break;
        await this.#sleep(backoffMs * 2 ** (attempt - 1));
      }
    }

    if (attempts > 1) errorMsg = errorMsg && `${errorMsg} (after ${attempts} attempts)`;

    // Batch log creation and last_run_at update in one transaction so
    // the integration never shows a stale timestamp on concurrent calls.
    const [log] = await this.db.$transaction([
      this.db.integrationLog.create({
        data: {
          integration_id: id,
          status,
          request_body:   payload,
          response_body:  response_body ?? null,
          error:          errorMsg,
          duration_ms,
        },
      }),
      this.db.integration.update({
        where: { id },
        data:  { last_run_at: new Date() },
      }),
    ]);

    if (status === 'error') throw new Error(errorMsg);
    return log;
  }

  /**
   * Low-level, un-persisted delivery used by callers that don't own an
   * Integration row (e.g. a workflow's inline `webhook` step). Routing it here
   * guarantees every outbound webhook in the app shares one SSRF policy, one
   * signing scheme, and one HTTP client.
   */
  async deliver({ url, method, headers, body, secret, timeout_ms } = {}) {
    return new OutboundWebhookConnector().request({ url, method, headers, body, secret, timeout_ms });
  }

  /**
   * Fan a domain event out to every active outbound integration subscribed to
   * it. This is the primary, event-driven entry point — the piece that was
   * previously missing and left webhooks stand-alone.
   *
   * @param {string} event   canonical event name, e.g. 'record.created'
   * @param {object} data    the event data (record, changes, …)
   * @param {object} context { actorId, object, ... } — envelope metadata
   */
  async dispatchEvent(event, data = {}, context = {}) {
    let integrations;
    try {
      integrations = await this.#activeIntegrations();
    } catch (err) {
      logger?.error?.('[integration] dispatch fetch failed', { event, error: err.message });
      return [];
    }

    // Quick exit before any object lookup if nothing could ever match.
    const deliverable = integrations.filter(i =>
      DELIVERABLE_TYPES.has(i.type) && Array.isArray(i.config?.events) && i.config.events.length,
    );
    if (deliverable.length === 0) return [];

    // Resolve the object once (cached) so we can offer a per-object event name
    // (e.g. `lead.created`) in addition to the generic `record.created` — the
    // metadata-driven, per-object subscription model the major CRMs expose.
    const object      = context.object ?? await this.#resolveObject(context.objectId);
    const objectEvent = object?.name ? this.#objectEventName(event, object.name) : null;
    const ctx         = { ...context, object };

    const subscribers = deliverable.filter(i => this.#subscribes(i, event, objectEvent));
    if (subscribers.length === 0) return [];

    const results = await Promise.allSettled(
      subscribers.map(i =>
        this.executeIntegration(i.id, this.#buildEnvelope(event, data, ctx, i), { event, integration: i }),
      ),
    );

    return results.map((r, idx) => ({
      integration_id:   subscribers[idx].id,
      integration_name: subscribers[idx].name,
      success:          r.status === 'fulfilled',
      error:            r.status === 'rejected' ? r.reason?.message : null,
    }));
  }

  /**
   * Run a registered integration by name with an explicit payload, and log it.
   * Used by workflow steps that reference an integration as a "named connection"
   * (reusing its URL/secret/headers/retry) or dispatch it as an action.
   * `force` runs it regardless of the `is_active` event-subscription toggle,
   * since the caller is invoking it explicitly.
   */
  async executeByName(name, payload = {}, { force = true } = {}) {
    const integration = await this.db.integration.findUnique({ where: { name } });
    if (!integration) throw new Error(`Integration '${name}' not found`);
    return this.executeIntegration(integration.id, payload, { integration, force });
  }

  /**
   * Trigger all active integrations of a given type (legacy, type-based fan-out).
   * Retained for backward compatibility; new call sites should use dispatchEvent().
   */
  async triggerByType(type, payload = {}) {
    const integrations = await this.db.integration.findMany({
      where: { type, is_active: true },
    });

    const results = await Promise.allSettled(
      integrations.map(i => this.executeIntegration(i.id, payload)),
    );

    return results.map((r, idx) => ({
      integration_id:   integrations[idx].id,
      integration_name: integrations[idx].name,
      success:          r.status === 'fulfilled',
      error:            r.status === 'rejected' ? r.reason?.message : null,
    }));
  }

  // ── Inbound webhook reception ─────────────────────────────────────────────

  /**
   * Receive and log an inbound webhook payload for an active `inbound_webhook`
   * integration identified by name.
   *
   * @param {string} name       integration.name used as the public endpoint slug
   * @param {object} payload    parsed JSON body from the inbound request
   * @param {object} options
   * @param {string} [options.rawBody]   original request body string (for sig verification)
   * @param {string} [options.signature] value of the X-Signature-256 header
   * @returns {object} the created IntegrationLog entry
   *
   * The method:
   *   1. Looks up the integration by name (must be type=inbound_webhook and active)
   *   2. If config.secret is set, verifies the HMAC-SHA256 signature
   *   3. Logs the inbound payload to integration_logs (status = 'success' or 'error')
   *   4. Updates last_run_at
   *   5. On success, bridges the inbound event into the app: fires any mapped
   *      workflow (config.event_map) and re-publishes it on the domain bus so
   *      other integrations can react (inbound → outbound chaining).
   */
  async receiveInbound(name, payload, { rawBody = null, signature = null } = {}) {
    // Look up BEFORE entering tenant scope — inbound routes are public and carry
    // no tenant context; integration.name is globally unique.
    const integration = await this.db.integration.findUnique({ where: { name } });
    if (!integration)                throw new Error(`Integration '${name}' not found`);
    if (!integration.is_active)      throw new Error(`Integration '${name}' is not active`);
    if (integration.type !== 'inbound_webhook') {
      throw new Error(`Integration '${name}' is not an inbound_webhook (type=${integration.type})`);
    }

    // Everything below writes tenant-scoped rows, so run it inside the owning
    // tenant's context (the public route has none of its own).
    return tenantContext.run({ tenantId: integration.tenant_id }, async () => {
      const start    = Date.now();
      let   status   = 'success';
      let   errorMsg = null;

      try {
        const secret = integration.config?.secret ?? null;
        if (secret) {
          InboundWebhookConnector.verifySignature(rawBody ?? JSON.stringify(payload), secret, signature);
        }
      } catch (err) {
        status   = 'error';
        errorMsg = err.message;
      }

      const [log] = await this.db.$transaction([
        this.db.integrationLog.create({
          data: {
            integration_id: integration.id,
            status,
            request_body:   payload,
            response_body:  null,
            error:          errorMsg,
            duration_ms:    Date.now() - start,
          },
        }),
        this.db.integration.update({
          where: { id: integration.id },
          data:  { last_run_at: new Date() },
        }),
      ]);

      if (status === 'error') {
        const err = new Error(errorMsg);
        err.log = log;
        throw err;
      }

      // ── Bridge the verified inbound event into the rest of the app ──────────
      this.#bridgeInbound(integration, payload).catch(err =>
        logger?.error?.('[integration] inbound bridge failed', { name, error: err.message }),
      );

      return log;
    });
  }

  // ── Retry / error recovery ────────────────────────────────────────────────

  /**
   * Retry a failed integration execution by re-running the original payload
   * from an existing IntegrationLog entry.
   *
   * @param {number} logId  ID of the failed IntegrationLog row to retry
   * @returns {object}      new IntegrationLog entry for the retry attempt
   */
  async retryIntegration(logId) {
    const log = await this.db.integrationLog.findUnique({ where: { id: logId } });
    if (!log) throw new Error(`IntegrationLog ${logId} not found`);
    if (log.status !== 'error') {
      throw new Error(`Log ${logId} has status '${log.status}' — only error logs can be retried`);
    }
    const payload = log.request_body ?? {};
    return this.executeIntegration(log.integration_id, payload);
  }

  // ── Execution status visibility ───────────────────────────────────────────

  /**
   * Return aggregated execution stats for an integration.
   * Useful for health dashboards and alerting.
   */
  async getIntegrationStats(integrationId) {
    const logs = await this.db.integrationLog.findMany({
      where:   { integration_id: integrationId },
      select:  { status: true, duration_ms: true, created_at: true },
      orderBy: { created_at: 'desc' },
      take:    200,
    });

    // Single-pass accumulation: count successes/errors and sum durations together.
    let errors = 0, success = 0, durationSum = 0, durationCount = 0;
    for (const l of logs) {
      if (l.status === 'error')   errors++;
      else                        success++;
      const d = l.duration_ms ?? 0;
      if (d > 0) { durationSum += d; durationCount++; }
    }
    const total   = logs.length;
    const avgMs   = durationCount ? Math.round(durationSum / durationCount) : null;
    const lastRun = logs[0]?.created_at ?? null;

    return { total, success, errors, error_rate: total ? errors / total : 0, avg_duration_ms: avgMs, last_run: lastRun };
  }

  // ── Logs ──────────────────────────────────────────────────────────────────

  async getIntegrationLogs(integrationId, limit = 50) {
    return this.db.integrationLog.findMany({
      where:   { integration_id: integrationId },
      orderBy: { created_at: 'desc' },
      take:    Number(limit),
    });
  }

  // ── Private ───────────────────────────────────────────────────────────────

  /**
   * Standard outbound event envelope. Consistent, versioned shape across every
   * integration — the same discipline Stripe/HubSpot/Salesforce apply so that
   * subscribers can parse one predictable structure.
   */
  #buildEnvelope(event, data, context, integration) {
    return {
      id:          crypto.randomUUID(),
      event,
      api_version: INTEGRATION_API_VERSION,
      occurred_at: new Date().toISOString(),
      integration: integration?.name ?? null,
      object:      context?.object ?? null,
      actor:       context?.actor ?? (context?.actorId != null ? { id: context.actorId } : null),
      data:        data ?? {},
    };
  }

  /**
   * Active integrations for the current tenant, served from a short-TTL cache.
   * Bounds staleness to _subCacheTtlMs across pods; mutations invalidate it
   * locally for immediate consistency on the writing node.
   */
  async #activeIntegrations() {
    const tenantId = getTenantId();
    if (tenantId == null) {
      // No tenant context (platform/startup) → don't cache, just query.
      return this.db.integration.findMany({ where: { is_active: true } });
    }
    const hit = this._subCache.get(tenantId);
    if (hit && (Date.now() - hit.at) < this._subCacheTtlMs) return hit.integrations;

    const integrations = await this.db.integration.findMany({ where: { is_active: true } });
    this._subCache.set(tenantId, { at: Date.now(), integrations });
    return integrations;
  }

  /** Drop the whole subscription cache (cheap; mutations are rare vs. events). */
  #invalidateSubCache() {
    this._subCache.clear();
  }

  /** Resolve (and cache) a UiObject's slug for the event envelope's `object`. */
  async #resolveObject(objectId) {
    const id = Number(objectId);
    if (!id) return null;
    if (this._objectCache.has(id)) return this._objectCache.get(id);
    let object;
    try {
      const row = await this.db.uiObject.findUnique({ where: { id }, select: { name: true } });
      object = { id, name: row?.name ?? null };
    } catch {
      object = { id, name: null }; // best-effort — envelope still ships without a slug
    }
    this._objectCache.set(id, object);
    return object;
  }

  /**
   * Does this integration subscribe to the event? Matches its `config.events`
   * patterns against BOTH the generic event (`record.created`) and the
   * per-object event (`lead.created`), so a subscription can be scoped to one
   * object or apply across all of them.
   */
  #subscribes(integration, event, objectEvent) {
    const events = integration.config?.events;
    if (!Array.isArray(events) || events.length === 0) return false;
    return events.some(p => eventMatches(p, event) || (objectEvent && eventMatches(p, objectEvent)));
  }

  /**
   * Derive the per-object event name from a generic one and the object slug:
   * `record.created` + `lead` → `lead.created`. Returns null for non-`record.*`
   * events (e.g. `inbound.*`, custom events already carry their own name).
   */
  #objectEventName(event, slug) {
    if (!slug || !event.startsWith('record.')) return null;
    return `${slug}.${event.slice('record.'.length)}`;
  }

  /**
   * After a verified inbound webhook: run any workflow mapped in config.event_map
   * for the resolved event, and re-publish the event onto the domain bus.
   */
  async #bridgeInbound(integration, payload) {
    const cfg     = integration.config ?? {};
    const evName  = this.#resolveInboundEvent(cfg, payload);

    // 1. Inbound → workflow bridge (config.event_map: { eventName: workflowId })
    const workflowId = evName != null ? cfg.event_map?.[evName] : undefined;
    if (workflowId && this.workflowEngine?.manualRun) {
      try {
        await this.workflowEngine.manualRun(Number(workflowId), payload, null);
      } catch (err) {
        logger?.error?.('[integration] inbound workflow run failed', {
          integration: integration.name, workflowId, error: err.message,
        });
      }
    }

    // 2. Re-publish onto the domain bus so outbound integrations can chain off it.
    if (this.eventBus) {
      const busEvent = `inbound.${evName ?? 'received'}`;
      this.eventBus.publish(busEvent, {
        data:    payload,
        context: { object: integration.name, actor: null },
      }).catch(() => {});
    }
  }

  /** Resolve the event name from an inbound payload per config. */
  #resolveInboundEvent(cfg, payload) {
    if (cfg.event_field) {
      return cfg.event_field.split('.').reduce((o, k) => (o == null ? o : o[k]), payload) ?? null;
    }
    return payload?.event ?? payload?.type ?? payload?.action ?? null;
  }

  /** Only transient failures are worth retrying — never SSRF blocks or 4xx. */
  #isRetryable(err) {
    if (err?.code === 'SSRF_BLOCKED' || err?.code === 'CONFIG_ERROR') return false;
    const s = err?.status;
    if (s == null) return true;                 // network error / timeout
    return s === 429 || (s >= 500 && s < 600);  // rate-limited or server error
  }

  #sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  #validateType(type) {
    if (!VALID_TYPES.includes(type)) {
      throw new Error(`Invalid integration type: ${type}. Valid: ${VALID_TYPES.join(', ')}`);
    }
  }
}

module.exports = IntegrationService;
