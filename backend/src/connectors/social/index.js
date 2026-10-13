'use strict';

const SimulationConnector = require('./simulation');

/**
 * Social Connector Registry
 *
 * Resolves the connector that handles each social platform.
 *
 * ── Current status ───────────────────────────────────────────────────────────
 * No live platform connector ships with Genesis. Every platform is served by
 * `SimulationConnector`, which produces realistic responses for demo,
 * development, and testing. Publishing, mentions, and engagement metrics are
 * therefore simulated end to end.
 *
 * This is a deliberate position rather than an omission. The industry moved
 * away from CRM vendors maintaining per-platform social connectors: Salesforce
 * retired Social Studio in November 2024 and now partners with Sprout Social,
 * Zoho ships social as a separate product (Zoho Social) rather than inside CRM,
 * and Pipedrive offers no native social publishing at all. Of the five largest
 * providers only HubSpot still ships native publishing. Maintaining OAuth,
 * token refresh, and per-platform API drift for Meta/LinkedIn/X is a product in
 * its own right; integrating a specialist tool is the cheaper path.
 *
 * ── Adding a live connector ──────────────────────────────────────────────────
 * Subclass `SocialConnector` (./base.js) implementing the methods you need,
 * then add one entry to `LIVE_CONNECTORS` below:
 *
 *     linkedin: {
 *       requiredEnv: ['LINKEDIN_CLIENT_ID', 'LINKEDIN_CLIENT_SECRET'],
 *       load: () => new (require('./linkedin'))(),
 *     }
 *
 * A platform falls back to simulation unless its entry exists AND every one of
 * its `requiredEnv` vars is set. That ordering matters: a half-configured
 * connector must never displace a working simulation — an earlier revision of
 * this file routed to throw-only scaffolds the moment an API key appeared,
 * which broke social publishing for anyone who set one.
 */

/**
 * Live platform connectors. Empty by design — see the note above.
 * @type {Record<string, { requiredEnv: string[], load: () => import('./base') }>}
 */
const LIVE_CONNECTORS = {};

const simulation = new SimulationConnector();

/** Memoised live connector instances, so `load()` runs at most once each. */
const loaded = new Map();

/** True when every env var the platform's connector needs is present. */
function isConfigured(entry) {
  return entry.requiredEnv.every((key) => !!process.env[key]);
}

/**
 * Get the connector for a platform.
 *
 * Always returns a usable connector — never null, never a partially wired one.
 *
 * @param {string} platform 'facebook' | 'instagram' | 'linkedin' | 'twitter' | 'whatsapp' | …
 * @returns {import('./base')} connector instance
 */
function getConnector(platform) {
  const entry = LIVE_CONNECTORS[platform];
  if (!entry || !isConfigured(entry)) return simulation;

  if (!loaded.has(platform)) {
    try {
      loaded.set(platform, entry.load());
    } catch {
      // A connector that cannot even be constructed must not take the feature
      // down with it; simulation keeps the workspace usable.
      loaded.set(platform, simulation);
    }
  }
  return loaded.get(platform);
}

/** Platforms the UI offers, whether or not a live connector backs them. */
const PLATFORMS = ['facebook', 'instagram', 'linkedin', 'twitter', 'whatsapp', 'youtube', 'tiktok'];

/**
 * Per-platform connector mode, for the integration-health surface.
 * @returns {Object<string, { connector: string, mode: 'live' | 'simulation' }>}
 */
function getConnectorStatus() {
  return Object.fromEntries(PLATFORMS.map((p) => {
    const c = getConnector(p);
    return [p, { connector: c.name, mode: c === simulation ? 'simulation' : 'live' }];
  }));
}

module.exports = { getConnector, getConnectorStatus, PLATFORMS, SimulationConnector };
