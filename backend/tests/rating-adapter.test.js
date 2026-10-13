'use strict';

/**
 * Tests for the rating adapter registry:
 *   - InternalRatingAdapter — always available, returns internal engine result
 *   - SimulatedCarrierAdapter — applies rate factor, marks source as 'simulated'
 *   - CarrierApiAdapter — fallback to internal when not configured, fallback_reason explicit
 *   - RatingAdapterRegistry.getAdapter — returns carrier-specific or internal fallback
 *   - RatingAdapterRegistry.loadCarriersFromDb — DB config path + env-var legacy path + simulated default
 *   - ADAPTER_STATUS constants
 */

const {
  ADAPTER_STATUS,
  InternalRatingAdapter,
  SimulatedCarrierAdapter,
  CarrierApiAdapter,
  RatingAdapterRegistry,
} = require('../src/services/rating-adapter');

// ── Minimal calculation engine stub ─────────────────────────────────────────
function makeEngine(overrideResult = {}) {
  return {
    calculateQuote: jest.fn(() => ({
      premium: {
        total: { monthly: 150, quarterly: 450, semi_annual: 900, annual: 1800 },
        breakdown: { base: 140, rider_add: 10 },
        total_annual: 1800,
      },
      coverage: { death_benefit: 500000 },
      product_details: { name: 'Test Product', type: 'term_life', term_years: 20 },
      applicant_summary: { age: 35, gender: 'male', smoker_status: 'never', health_class: 'preferred' },
      cash_value_projections: [],
      ...overrideResult,
    })),
  };
}

const QUOTE_PARAMS = {
  product_type: 'term_life',
  coverage_amount: 500000,
  applicant: { age: 35, gender: 'male', smoker_status: 'never', health_class: 'preferred' },
};

// ── InternalRatingAdapter ────────────────────────────────────────────────────

describe('InternalRatingAdapter', () => {
  it('calls calculateQuote and returns rate_source=internal with READY status', async () => {
    const engine = makeEngine();
    const adapter = new InternalRatingAdapter(engine);
    const result = await adapter.rate(QUOTE_PARAMS);

    expect(engine.calculateQuote).toHaveBeenCalledWith(QUOTE_PARAMS);
    expect(result.rateSource).toBe('internal');
    expect(result.rateSourceMeta.status).toBe(ADAPTER_STATUS.READY);
    expect(result.rateSourceMeta.adapter).toBe('genesis_engine');
    expect(result.quoteResult.premium.total.monthly).toBe(150);
  });

  it('getMetadata returns expected capability list', () => {
    const adapter = new InternalRatingAdapter(makeEngine());
    const meta = adapter.getMetadata();
    expect(meta.status).toBe(ADAPTER_STATUS.READY);
    expect(meta.capabilities).toContain('term_life');
    expect(meta.capabilities).toContain('whole_life');
    expect(meta.capabilities).toContain('universal_life');
  });

  it('supports() returns true for known product types', () => {
    const adapter = new InternalRatingAdapter(makeEngine());
    expect(adapter.supports('term_life')).toBe(true);
    expect(adapter.supports('whole_life')).toBe(true);
    expect(adapter.supports('unknown_product')).toBe(false);
  });
});

// ── SimulatedCarrierAdapter ──────────────────────────────────────────────────

describe('SimulatedCarrierAdapter', () => {
  it('applies rate factor to premium breakdown and marks rate_source=simulated', async () => {
    const internal = new InternalRatingAdapter(makeEngine());
    const adapter = new SimulatedCarrierAdapter('GLA', {
      name: 'Guardian Life',
      rateFactor: 0.95,
      amBestRating: 'A+',
      products: ['term_life', 'whole_life'],
    }, internal);

    const result = await adapter.rate(QUOTE_PARAMS);

    expect(result.rateSource).toBe('simulated');
    expect(result.rateSourceMeta.carrier_code).toBe('GLA');
    expect(result.rateSourceMeta.carrier_name).toBe('Guardian Life');
    expect(result.rateSourceMeta.rate_factor).toBe(0.95);
    expect(result.rateSourceMeta.disclaimer).toMatch(/simulated/i);
    // Rate factor applied: base was 140, rider 10 → 140*0.95=133, 10*0.95=9.5
    expect(result.quoteResult.premium.breakdown.base).toBeCloseTo(133, 0);
  });

  it('throws 422 when product type not supported by carrier', async () => {
    const internal = new InternalRatingAdapter(makeEngine());
    const adapter = new SimulatedCarrierAdapter('GLA', {
      name: 'Guardian Life',
      rateFactor: 1.0,
      products: ['whole_life'],   // no term_life
    }, internal);

    await expect(adapter.rate({ ...QUOTE_PARAMS, product_type: 'term_life' }))
      .rejects.toMatchObject({ statusCode: 422 });
  });

  it('getMetadata reports is_simulated=true', () => {
    const internal = new InternalRatingAdapter(makeEngine());
    const adapter = new SimulatedCarrierAdapter('XYZ', { products: [] }, internal);
    expect(adapter.getMetadata().is_simulated).toBe(true);
  });
});

// ── CarrierApiAdapter ────────────────────────────────────────────────────────

describe('CarrierApiAdapter', () => {
  it('falls back to internal with rate_source=internal_fallback when not configured', async () => {
    const internal = new InternalRatingAdapter(makeEngine());
    const adapter = new CarrierApiAdapter('PRUD', {}, internal);

    expect(adapter.isConfigured).toBe(false);
    const result = await adapter.rate(QUOTE_PARAMS);

    expect(result.rateSource).toBe('internal_fallback');
    expect(result.rateSourceMeta.fallback_reason).toBe('not_configured');
    expect(result.rateSourceMeta.status).toBe(ADAPTER_STATUS.UNAVAILABLE);
    expect(result.rateSourceMeta.carrier_code).toBe('PRUD');
  });

  it('isConfigured=true requires apiBaseUrl, apiKey, and enabled', () => {
    const internal = new InternalRatingAdapter(makeEngine());
    const unconfigured = new CarrierApiAdapter('X', {}, internal);
    expect(unconfigured.isConfigured).toBe(false);

    const partial = new CarrierApiAdapter('X', { apiBaseUrl: 'https://x.com' }, internal);
    expect(partial.isConfigured).toBe(false);  // missing apiKey

    const full = new CarrierApiAdapter('X', { apiBaseUrl: 'https://x.com', apiKey: 'secret' }, internal);
    expect(full.isConfigured).toBe(true);
  });

  it('falls back on API call failure with fallback_reason=api_error', async () => {
    const internal = new InternalRatingAdapter(makeEngine());
    const adapter = new CarrierApiAdapter('PRUD', {
      apiBaseUrl: 'https://api.prud.example',
      apiKey: 'fake-key',
      enabled: true,
    }, internal);

    // _rateViaCarrierApi throws because it's not implemented
    const result = await adapter.rate(QUOTE_PARAMS);

    expect(result.rateSource).toBe('internal_fallback');
    expect(result.rateSourceMeta.fallback_reason).toBe('api_error');
    expect(result.rateSourceMeta.status).toBe(ADAPTER_STATUS.ERROR);
  });
});

// ── RatingAdapterRegistry ────────────────────────────────────────────────────

describe('RatingAdapterRegistry', () => {
  it('getAdapter returns internal when no carrier registered', () => {
    const registry = new RatingAdapterRegistry(makeEngine());
    const adapter = registry.getAdapter('UNKNOWN');
    expect(adapter.getMetadata().adapter).toBe('genesis_engine');
  });

  it('getAdapter returns carrier adapter after registerSimulated', () => {
    const registry = new RatingAdapterRegistry(makeEngine());
    registry.registerSimulated('GLA', { name: 'Guardian Life', products: ['term_life'] });
    const adapter = registry.getAdapter('GLA');
    expect(adapter.getMetadata().adapter).toBe('simulated_GLA');
  });

  it('listAdapters includes internal + all registered carriers', () => {
    const registry = new RatingAdapterRegistry(makeEngine());
    registry.registerSimulated('GLA', { name: 'Guardian Life', products: [] });
    registry.registerSimulated('PRUD', { name: 'Prudential', products: [] });
    const adapters = registry.listAdapters();
    expect(adapters).toHaveLength(3);  // internal + GLA + PRUD
    const codes = adapters.map(a => a.carrierCode);
    expect(codes).toContain('GLA');
    expect(codes).toContain('PRUD');
  });

  it('hasCarrier returns false before registration', () => {
    const registry = new RatingAdapterRegistry(makeEngine());
    expect(registry.hasCarrier('GLA')).toBe(false);
    registry.registerSimulated('GLA', { products: [] });
    expect(registry.hasCarrier('GLA')).toBe(true);
  });

  describe('loadCarriersFromDb', () => {
    function makePrisma(carriers) {
      return {
        insuranceCarrier: {
          findMany: jest.fn().mockResolvedValue(carriers),
        },
      };
    }

    it('registers simulated adapter when no env vars and no DB config', async () => {
      const registry = new RatingAdapterRegistry(makeEngine());
      const prisma = makePrisma([{
        id: 1, code: 'GLA', name: 'Guardian Life', am_best_rating: 'A+', is_active: true,
        carrier_products: [{ product_type: 'term_life' }],
        adapter_config: null,
      }]);
      // No env vars set for CARRIER_GLA_API_KEY
      delete process.env.CARRIER_GLA_API_KEY;
      delete process.env.CARRIER_GLA_API_URL;

      await registry.loadCarriersFromDb(prisma, 1);

      expect(registry.hasCarrier('GLA')).toBe(true);
      const meta = registry.getAdapter('GLA').getMetadata();
      expect(meta.is_simulated).toBe(true);
    });

    it('registers api adapter from DB config with is_enabled=true and adapter_type=api', async () => {
      const registry = new RatingAdapterRegistry(makeEngine());
      process.env.TEST_CARRIER_KEY = 'test-secret';
      const prisma = makePrisma([{
        id: 2, code: 'PRUD', name: 'Prudential', am_best_rating: 'A', is_active: true,
        carrier_products: [{ product_type: 'whole_life' }],
        adapter_config: {
          adapter_type:    'api',
          api_base_url:    'https://api.prud.example/v1',
          api_key_env_var: 'TEST_CARRIER_KEY',
          timeout_ms:      8000,
          is_enabled:      true,
          environment:     'sandbox',
          supported_products: null,
        },
      }]);

      await registry.loadCarriersFromDb(prisma, 1);
      delete process.env.TEST_CARRIER_KEY;

      expect(registry.hasCarrier('PRUD')).toBe(true);
      const meta = registry.getAdapter('PRUD').getMetadata();
      expect(meta.adapter).toMatch(/carrier_api/);
    });

    it('skips carrier when DB config has adapter_type=disabled', async () => {
      const registry = new RatingAdapterRegistry(makeEngine());
      const prisma = makePrisma([{
        id: 3, code: 'MET', name: 'MetLife', am_best_rating: 'A', is_active: true,
        carrier_products: [],
        adapter_config: { adapter_type: 'disabled', is_enabled: true },
      }]);

      await registry.loadCarriersFromDb(prisma, 1);

      // disabled → not registered → falls back to internal
      expect(registry.hasCarrier('MET')).toBe(false);
    });

    it('silently succeeds when DB query fails', async () => {
      const registry = new RatingAdapterRegistry(makeEngine());
      const prisma = {
        insuranceCarrier: { findMany: jest.fn().mockRejectedValue(new Error('DB down')) },
      };
      await expect(registry.loadCarriersFromDb(prisma, 1)).resolves.toBeUndefined();
    });
  });
});
