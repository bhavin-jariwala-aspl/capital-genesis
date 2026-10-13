'use strict';

const { logger } = require('./logging.service');

/**
 * RatingAdapter — Production-grade adapter interface for insurance rating engines.
 *
 * Genesis CRM supports multiple rating sources through the adapter pattern:
 *   - InternalRatingAdapter: Built-in CSO-based calculation engine (always available)
 *   - CarrierApiAdapter: Carrier-specific API integration with config-driven setup
 *   - SimulatedCarrierAdapter: Uses internal engine with carrier-specific adjustments
 *
 * Each adapter implements `rate(params)` and returns a standardized quote result
 * with rate source metadata for audit, comparison, and regulatory traceability.
 *
 * Connector lifecycle:
 *   1. Registry created at app startup with the internal engine as fallback
 *   2. Carrier adapters registered from DB config or environment on boot
 *   3. Route handler calls registry.getAdapter(carrierCode) — gets carrier-specific
 *      adapter if configured, otherwise falls back to internal
 *   4. Adapter.rate(params) returns { quoteResult, rateSource, rateSourceMeta }
 *   5. Result is persisted as a QuoteScenario with rate_source metadata
 */

// ── Adapter status constants ─────────────────────────────────────────────────
const ADAPTER_STATUS = {
  READY:        'ready',        // Adapter is configured and operational
  DEGRADED:     'degraded',     // Adapter available but with reduced capability
  UNAVAILABLE:  'unavailable',  // Adapter not configured — will fallback
  ERROR:        'error',        // Adapter experienced a runtime error
};

// AM Best rating → rate factor map (higher-rated carriers price more competitively)
const AM_BEST_RATE_FACTORS = Object.freeze({
  'A++': 0.92, 'A+': 0.95, 'A': 1.00, 'A-': 1.03,
  'B++': 1.06, 'B+': 1.10, 'B': 1.15,
});
// ═══════════════════════════════════════════════════════════════════════════════
// Base class
// ═══════════════════════════════════════════════════════════════════════════════

class RatingAdapter {
  /**
   * Rate an insurance quote.
   * @param {Object} params - Quote parameters
   * @returns {Promise<{quoteResult: Object, rateSource: string, rateSourceMeta: Object}>}
   */
  async rate(params) {
    throw new Error('RatingAdapter.rate() must be implemented by subclass');
  }

  /** @returns {{ adapter: string, version: string, status: string, capabilities: string[] }} */
  getMetadata() {
    throw new Error('RatingAdapter.getMetadata() must be implemented by subclass');
  }

  /** Check if this adapter supports a given product type */
  supports(productType) {
    return this.getMetadata().capabilities.includes(productType);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Internal (built-in) adapter
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * InternalRatingAdapter — Wraps the built-in CalculationEngineService.
 * Uses 2017 CSO mortality tables, expense loading, rider pricing, and
 * cash value projections to produce realistic US-market premiums.
 * Always available as the fallback adapter.
 */
class InternalRatingAdapter extends RatingAdapter {
  /** @param {import('./calculation-engine.service')} engine */
  constructor(engine) {
    super();
    this.engine = engine;
  }

  async rate(params) {
    const quoteResult = this.engine.calculateQuote(params);
    return {
      quoteResult,
      rateSource: 'internal',
      rateSourceMeta: {
        adapter: 'genesis_engine',
        version: '1.0',
        status: ADAPTER_STATUS.READY,
        mortality_table: '2017_CSO_approx',
        rated_at: new Date().toISOString(),
        capabilities: this.getMetadata().capabilities,
      },
    };
  }

  getMetadata() {
    return {
      adapter: 'genesis_engine',
      version: '1.0',
      status: ADAPTER_STATUS.READY,
      capabilities: [
        'term_life', 'whole_life', 'universal_life', 'variable_life',
        'indexed_universal_life', 'final_expense',
        'riders', 'cash_value_projections', 'comparative_quoting',
      ],
    };
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Carrier API adapter (config-driven, production-ready contract)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * CarrierApiAdapter — Config-driven carrier integration.
 *
 * Configuration contract (from DB carrier record or environment):
 * {
 *   carrierCode: 'GLA',
 *   apiBaseUrl:  'https://api.guardianlife.example/v1',
 *   apiKey:      process.env.CARRIER_GLA_API_KEY,
 *   timeout:     10000,
 *   products:    ['term_life', 'whole_life'],
 *   enabled:     true,
 * }
 *
 * When a carrier API is not yet configured (no apiBaseUrl or apiKey),
 * the adapter reports status=unavailable and rate() falls back to
 * the internal engine with a carrier-branded wrapper, clearly marking
 * the rate_source as 'internal_fallback' for audit transparency.
 */
class CarrierApiAdapter extends RatingAdapter {
  /**
   * @param {string} carrierCode
   * @param {Object} config - Carrier API configuration
   * @param {InternalRatingAdapter} fallbackAdapter - Internal engine for graceful degradation
   */
  constructor(carrierCode, config, fallbackAdapter) {
    super();
    this.carrierCode = carrierCode;
    this.config = config || {};
    this.fallback = fallbackAdapter;
    this._isConfigured = !!(config?.apiBaseUrl && config?.apiKey && config?.enabled !== false);
  }

  /** Whether this adapter has a real carrier API configured */
  get isConfigured() { return this._isConfigured; }

  async rate(params) {
    // If carrier API is configured and enabled, attempt the real call
    if (this._isConfigured) {
      try {
        return await this._rateViaCarrierApi(params);
      } catch (err) {
        logger?.warn?.(`[CarrierAdapter:${this.carrierCode}] API call failed, falling back to internal`, {
          error: err.message,
          carrierCode: this.carrierCode,
        });
        // Fall through to fallback
      }
    }

    // Graceful fallback: use internal engine, clearly mark the source
    const internal = await this.fallback.rate(params);
    return {
      quoteResult: internal.quoteResult,
      rateSource: 'internal_fallback',
      rateSourceMeta: {
        ...internal.rateSourceMeta,
        adapter: `carrier_fallback_${this.carrierCode}`,
        carrier_code: this.carrierCode,
        fallback_reason: this._isConfigured ? 'api_error' : 'not_configured',
        status: this._isConfigured ? ADAPTER_STATUS.ERROR : ADAPTER_STATUS.UNAVAILABLE,
        rated_at: new Date().toISOString(),
      },
    };
  }

  /**
   * Real carrier API call (placeholder implementation).
   * When a carrier provides their API contract, this method would:
   *   1. Transform Genesis params → carrier request format
   *   2. POST to config.apiBaseUrl with auth headers
   *   3. Transform carrier response → Genesis quote result format
   *   4. Return with rate_source = 'carrier_api'
   */
  async _rateViaCarrierApi(params) {
    const { apiBaseUrl, apiKey, timeout = 10000 } = this.config;

    // This is the integration point. When carrier partnerships are established:
    // const response = await fetch(`${apiBaseUrl}/rate`, {
    //   method: 'POST',
    //   headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    //   body: JSON.stringify(this._transformRequest(params)),
    //   signal: AbortSignal.timeout(timeout),
    // });
    // const carrierResult = await response.json();
    // return { quoteResult: this._transformResponse(carrierResult), ... };

    throw new Error(`Carrier API integration for ${this.carrierCode} requires implementation of _rateViaCarrierApi`);
  }

  getMetadata() {
    return {
      adapter: `carrier_api_${this.carrierCode}`,
      version: '1.0',
      status: this._isConfigured ? ADAPTER_STATUS.READY : ADAPTER_STATUS.UNAVAILABLE,
      carrier_code: this.carrierCode,
      is_configured: this._isConfigured,
      capabilities: this.config?.products || [],
    };
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Simulated carrier adapter (for demo/testing without real API)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * SimulatedCarrierAdapter — Uses the internal engine with carrier-specific
 * adjustments (rate factor, product restrictions) for realistic demo scenarios.
 * Clearly marks rate_source as 'simulated' so it's never confused with real
 * carrier data in production.
 */
class SimulatedCarrierAdapter extends RatingAdapter {
  /**
   * @param {string} carrierCode
   * @param {Object} carrierProfile - { name, rateFactor, products, amBestRating }
   * @param {InternalRatingAdapter} internalAdapter
   */
  constructor(carrierCode, carrierProfile, internalAdapter) {
    super();
    this.carrierCode = carrierCode;
    this.profile = carrierProfile;
    this.internal = internalAdapter;
  }

  async rate(params) {
    // Check product support
    if (this.profile.products?.length && !this.profile.products.includes(params.product_type)) {
      const err = new Error(
        `Carrier ${this.profile.name || this.carrierCode} does not offer ${params.product_type}`,
      );
      err.statusCode = 422;
      throw err;
    }

    // Get internal quote, then apply carrier-specific rate adjustment
    const { quoteResult } = await this.internal.rate(params);
    const factor = this.profile.rateFactor ?? 1.0;

    // Apply rate factor to all premium amounts
    if (quoteResult.premium?.breakdown) {
      for (const key of Object.keys(quoteResult.premium.breakdown)) {
        quoteResult.premium.breakdown[key] = Math.round(quoteResult.premium.breakdown[key] * factor * 100) / 100;
      }
    }
    if (quoteResult.premium?.total_annual) {
      quoteResult.premium.total_annual = Math.round(quoteResult.premium.total_annual * factor * 100) / 100;
    }

    return {
      quoteResult,
      rateSource: 'simulated',
      rateSourceMeta: {
        adapter: `simulated_${this.carrierCode}`,
        version: '1.0',
        status: ADAPTER_STATUS.READY,
        carrier_code: this.carrierCode,
        carrier_name: this.profile.name,
        am_best_rating: this.profile.amBestRating,
        rate_factor: factor,
        rated_at: new Date().toISOString(),
        capabilities: this.profile.products || [],
        disclaimer: 'Simulated rate — not a binding carrier quote',
      },
    };
  }

  getMetadata() {
    return {
      adapter: `simulated_${this.carrierCode}`,
      version: '1.0',
      status: ADAPTER_STATUS.READY,
      carrier_code: this.carrierCode,
      carrier_name: this.profile.name,
      is_simulated: true,
      capabilities: this.profile.products || [],
    };
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Registry
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * RatingAdapterRegistry — Resolves the appropriate adapter for a given
 * carrier code. Falls back to the internal engine when no carrier-specific
 * adapter is registered.
 *
 * Boot sequence:
 *   1. Instantiated with the internal CalculationEngineService
 *   2. loadCarriersFromDb(prisma, tenantId) reads carrier records and
 *      registers simulated adapters for demo carriers
 *   3. registerCarrier() can be called to add carrier API adapters
 *      configured via environment variables
 */
class RatingAdapterRegistry {
  constructor(internalEngine) {
    this._internal = new InternalRatingAdapter(internalEngine);
    this._carrierAdapters = new Map();
  }

  /** Register a carrier-specific adapter */
  registerCarrier(carrierCode, adapter) {
    this._carrierAdapters.set(carrierCode, adapter);
    logger?.info?.(`[RatingRegistry] Registered adapter for carrier ${carrierCode}: ${adapter.getMetadata().adapter}`);
  }

  /**
   * Register a carrier API adapter from configuration.
   * If the config is incomplete, the adapter will gracefully fallback to internal.
   */
  registerCarrierApi(carrierCode, config) {
    const adapter = new CarrierApiAdapter(carrierCode, config, this._internal);
    this.registerCarrier(carrierCode, adapter);
    return adapter;
  }

  /**
   * Register a simulated carrier adapter for demo/testing.
   * Uses the internal engine with carrier-specific rate adjustments.
   */
  registerSimulated(carrierCode, carrierProfile) {
    const adapter = new SimulatedCarrierAdapter(carrierCode, carrierProfile, this._internal);
    this.registerCarrier(carrierCode, adapter);
    return adapter;
  }

  /**
   * Load carrier records from the database and register simulated adapters.
   * This is the recommended boot-time initialization path.
   * Priority order for each carrier:
   *   1. CarrierAdapterConfig row (DB-driven configuration — most explicit)
   *   2. Environment variables CARRIER_{CODE}_API_KEY + CARRIER_{CODE}_API_URL (legacy fallback)
   *   3. Simulated adapter derived from AM Best rating
   */
  async loadCarriersFromDb(prisma, tenantId) {
    try {
      const carriers = await prisma.insuranceCarrier.findMany({
        where: { tenant_id: tenantId, is_active: true },
        include: {
          carrier_products: { select: { product_type: true } },
          adapter_config: true,          // join CarrierAdapterConfig if present
        },
      });

      for (const carrier of carriers) {
        const cfg = carrier.adapter_config;
        const products = carrier.carrier_products.map(p => p.product_type);

        // ── Path 1: Explicit DB adapter config ──────────────────────────────
        if (cfg && cfg.is_enabled) {
          if (cfg.adapter_type === 'api') {
            // Resolve the API key from the env var name stored in DB
            const apiKey = cfg.api_key_env_var ? process.env[cfg.api_key_env_var] : undefined;
            this.registerCarrierApi(carrier.code, {
              carrierCode:  carrier.code,
              apiBaseUrl:   cfg.api_base_url,
              apiKey:       apiKey,
              timeout:      cfg.timeout_ms ?? 10000,
              products:     cfg.supported_products ?? products,
              enabled:      !!(cfg.api_base_url && apiKey),
              environment:  cfg.environment ?? 'sandbox',
            });
          } else if (cfg.adapter_type === 'simulated') {
            const rateFactor = this._rateFactorFromRating(carrier.am_best_rating);
            this.registerSimulated(carrier.code, {
              name:          carrier.name,
              rateFactor,
              amBestRating:  carrier.am_best_rating,
              products:      cfg.supported_products ?? products,
              configSource:  'db',
            });
          }
          // adapter_type === 'disabled' → intentionally skip; falls back to internal
          continue;
        }

        // ── Path 2: Legacy env-var convention ───────────────────────────────
        const envApiKey = process.env[`CARRIER_${carrier.code}_API_KEY`];
        const envApiUrl = process.env[`CARRIER_${carrier.code}_API_URL`];
        if (envApiKey && envApiUrl) {
          this.registerCarrierApi(carrier.code, {
            carrierCode: carrier.code,
            apiBaseUrl:  envApiUrl,
            apiKey:      envApiKey,
            timeout:     10000,
            products,
            enabled:     true,
          });
          continue;
        }

        // ── Path 3: Simulated (default for all configured carriers) ─────────
        const rateFactor = this._rateFactorFromRating(carrier.am_best_rating);
        this.registerSimulated(carrier.code, {
          name:         carrier.name,
          rateFactor,
          amBestRating: carrier.am_best_rating,
          products,
          configSource: 'auto',
        });
      }

      logger?.info?.(`[RatingRegistry] Loaded ${carriers.length} carrier adapters from database`);
    } catch (err) {
      logger?.warn?.('[RatingRegistry] Failed to load carriers from DB — internal engine only', { error: err.message });
    }
  }

  /** Derive a rate factor from AM Best rating (higher-rated carriers charge less) */
  _rateFactorFromRating(rating) {
    return AM_BEST_RATE_FACTORS[rating] ?? 1.00;
  }

  /** Get the adapter for a carrier (falls back to internal) */
  getAdapter(carrierCode) {
    if (!carrierCode) return this._internal;
    return this._carrierAdapters.get(carrierCode) || this._internal;
  }

  /** Get the internal adapter directly */
  getInternal() {
    return this._internal;
  }

  /** Whether a carrier-specific adapter exists */
  hasCarrier(carrierCode) {
    return this._carrierAdapters.has(carrierCode);
  }

  /** Get metadata for all registered adapters */
  listAdapters() {
    const adapters = [{ carrierCode: null, ...this._internal.getMetadata() }];
    for (const [code, adapter] of this._carrierAdapters) {
      adapters.push({ carrierCode: code, ...adapter.getMetadata() });
    }
    return adapters;
  }
}

module.exports = {
  ADAPTER_STATUS,
  RatingAdapter,
  InternalRatingAdapter,
  CarrierApiAdapter,
  SimulatedCarrierAdapter,
  RatingAdapterRegistry,
};
