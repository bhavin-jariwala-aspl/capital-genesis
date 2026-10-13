'use strict';

const { logger } = require('./logging.service');

/**
 * DomainEventBus — a lightweight, in-process publish/subscribe backbone.
 *
 * This is the single source of truth for "something happened in the CRM".
 * Domain mutations (record created / updated / deleted, field changed, an
 * inbound webhook arrived) are published here exactly once, and any number of
 * consumers subscribe independently:
 *
 *   • WorkflowEngineService  — runs no-code automations (its own triggers)
 *   • IntegrationService     — fans events out to subscribed external webhooks
 *
 * This mirrors how the major CRMs decouple event *production* from event
 * *consumption*:
 *   - Salesforce   → Platform Events / the trigger + outbound-message pipeline
 *   - HubSpot      → the CRM object-event → webhook-subscription bus
 *   - Dynamics 365 → the plugin execution pipeline + Service Bus endpoints
 *   - Zoho         → Notifications API subscriptions on module events
 *   - Pipedrive    → Webhooks v1 (event_action + event_object) subscriptions
 *
 * Delivery is fire-and-forget and error-isolated: a slow or throwing consumer
 * can never fail (or block) the originating request.
 */
class DomainEventBus {
  constructor() {
    /** @type {Map<string, Set<Function>>} event name → handler set */
    this._handlers = new Map();
  }

  /**
   * Subscribe a handler to an event name, or to '*' for every event.
   * The handler receives (eventName, payload).
   * @returns {Function} an unsubscribe function
   */
  subscribe(event, handler) {
    if (typeof handler !== 'function') throw new TypeError('handler must be a function');
    if (!this._handlers.has(event)) this._handlers.set(event, new Set());
    this._handlers.get(event).add(handler);
    return () => this._handlers.get(event)?.delete(handler);
  }

  /**
   * Publish an event to all matching handlers. Never throws — each handler is
   * awaited independently and its errors are swallowed after logging so one
   * bad consumer cannot poison the others or the caller.
   *
   * Returns a promise that resolves once every handler has settled; callers
   * that want fire-and-forget semantics simply do not await it.
   */
  async publish(event, payload) {
    const targets = new Set([
      ...(this._handlers.get(event) ?? []),
      ...(this._handlers.get('*') ?? []),
    ]);
    if (targets.size === 0) return;

    await Promise.allSettled(
      [...targets].map(async (handler) => {
        try {
          await handler(event, payload);
        } catch (err) {
          logger?.error?.('[events] handler failed', { event, error: err.message });
        }
      }),
    );
  }
}

module.exports = { DomainEventBus };
