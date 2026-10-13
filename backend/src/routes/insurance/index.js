'use strict';

const { authenticate } = require('../../middleware/authenticate');
const { ok }           = require('../../utils/response');

// Services
const CalculationEngineService = require('../../services/calculation-engine.service');
const TemplateEngineService    = require('../../services/template-engine.service');
const InsuranceDomainService   = require('../../services/insurance-domain.service');
const PermissionService        = require('../../services/permission.service');
const RecordService            = require('../../services/record.service');
const preview                  = require('../../services/document-preview');
const { getTenantId }          = require('../../middleware/tenant-scope');

// ── Tiny query-param coercion helpers ─────────────────────────────────────────
const toInt  = (v) => (v !== undefined ? parseInt(v, 10) : undefined);
const toBool = (v) => v === 'true' ? true : v === 'false' ? false : undefined;

// ── Input validation helpers ──────────────────────────────────────────────────
function requireFields(body, fields) {
  const missing = fields.filter(f => body[f] == null || body[f] === '');
  if (missing.length > 0) {
    const err = new Error(`Missing required fields: ${missing.join(', ')}`);
    err.statusCode = 400;
    throw err;
  }
}

function requirePositiveNumber(body, field) {
  const val = Number(body[field]);
  if (isNaN(val) || val <= 0) {
    const err = new Error(`${field} must be a positive number`);
    err.statusCode = 400;
    throw err;
  }
}

const { featureGateByPrefix } = require('../../middleware/require-feature');

/**
 * Which plan feature each route family belongs to.
 *
 * Matched on the declared route pattern's first segment(s), longest prefix
 * first. Families not listed — products, carriers, templates, quote maths —
 * are reference data every insurance tenant has from Starter, and stay open.
 * Underwriting keeps its own flag-aware guard below; this table is what
 * stops a Starter tenant using Claims and Commissions in full while the plan
 * that excludes them was a suggestion.
 */
const FEATURE_GATES = [
  ['/calculate-quote',          'ins_quoting'],
  ['/compare-quotes',           'ins_quoting'],
  ['/illustration',             'ins_quoting'],
  ['/quote-scenarios',          'ins_quoting'],
  ['/templates/render-quote',   'ins_quoting'],
  ['/templates/render-illustration', 'ins_quoting'],
  ['/templates/render-comparison',   'ins_quoting'],
  ['/applications',             'ins_policy_admin'],
  ['/policies',                 'ins_policy_admin'],
  ['/endorsements',             'ins_policy_admin'],
  ['/renewal-tasks',            'ins_policy_admin'],
  ['/invoices',                 'ins_policy_admin'],
  ['/declarations',             'ins_policy_admin'],
  ['/compliance',               'ins_policy_admin'],
  ['/checklist',                'ins_policy_admin'],
  ['/application-documents',    'docs_management'],
  ['/templates/render-and-archive', 'docs_management'],
  ['/underwriting',             'ins_underwriting'],
  ['/claims',                   'ins_claims'],
  ['/commissions',              'ins_commissions'],
  ['/commission-statements',    'ins_commissions'],
  ['/producer-appointments',    'ins_commissions'],
  ['/rating-adapters',          'ins_carrier_feeds'],
];

module.exports = async function insuranceRoutes(fastify) {
  // All insurance routes require authentication
  fastify.addHook('preHandler', authenticate);
  // …and the plan must include the family the route belongs to.
  fastify.addHook('preHandler', featureGateByPrefix(FEATURE_GATES));

  // Shared error handler — propagates statusCode from service errors
  fastify.setErrorHandler((err, req, reply) => {
    const statusCode = err.statusCode || 500;
    if (statusCode < 500) req.log.info({ code: err.code, reason: err.message, details: err.details }, 'request rejected');
    else req.log.error({ err }, 'insurance request failed');
    reply.status(statusCode).send({
      ok: false,
      message: err.message || 'Internal server error',
      ...(Array.isArray(err.details) && err.details.length ? { details: err.details } : {}),
    });
  });

  // Instantiate services
  const calcSvc     = new CalculationEngineService(fastify.prisma);
  const templateSvc = new TemplateEngineService(fastify.prisma);
  const domainSvc   = new InsuranceDomainService(fastify.prisma);
  const permSvc     = new PermissionService(fastify.prisma);
  const recSvc      = new RecordService(fastify.prisma, fastify.eventBus, permSvc);

  const FeatureFlagService = require('../../services/platform/feature-flag.service');
  const ffSvc = new FeatureFlagService(fastify.prisma);

  /** Check if underwriting_workflow feature flag is enabled for the tenant. */
  async function assertUwEnabled(req) {
    const enabled = await ffSvc.isEnabled('underwriting_workflow', tenantId(req));
    if (!enabled) {
      const err = new Error('Underwriting workflow is disabled for this tenant. Applications proceed directly to policy issuance.');
      err.statusCode = 400;
      throw err;
    }
  }

  // Rating adapter registry — initialized once per app lifecycle
  const { RatingAdapterRegistry } = require('../../services/rating-adapter');
  const ratingRegistry = new RatingAdapterRegistry(calcSvc);

  // Helper: extract tenant_id / actor from request (set by authenticate middleware)
  function tenantId(req) {
    const tid = req.user?.tenant_id;
    if (!tid) {
      const err = new Error('Tenant context missing — ensure authentication provides tenant_id');
      err.statusCode = 403;
      throw err;
    }
    return tid;
  }
  function actorId(req)  { return req.user?.employee_id ?? req.user?.sub ?? 'SYSTEM'; }

  // ═══════════════════════════════════════════════════════════
  // CALCULATION ENGINE  (unchanged)
  // ═══════════════════════════════════════════════════════════

  fastify.get('/products', async () => {
    try { return ok(await calcSvc.getAvailableProducts()); }
    catch (err) { throw { statusCode: err.statusCode || 500, message: err.message }; }
  });

  fastify.get('/products/:productType/riders', async (req) => {
    try { return ok(await calcSvc.getAvailableRiders(req.params.productType)); }
    catch (err) { throw { statusCode: err.statusCode || 500, message: err.message }; }
  });

  // Initialize carrier adapters on first request (lazy boot)
  let _registryBooted = false;
  async function ensureRegistryBooted(req) {
    if (!_registryBooted) {
      _registryBooted = true;
      await ratingRegistry.loadCarriersFromDb(fastify.prisma, tenantId(req)).catch(() => {});
    }
  }

  fastify.post('/calculate-quote', async (req) => {
    try {
      await ensureRegistryBooted(req);
      // Use carrier-specific adapter if carrier_code is provided, else internal
      const carrierCode = req.body?.carrier_code;
      const adapter = ratingRegistry.getAdapter(carrierCode);
      const { quoteResult, rateSource, rateSourceMeta } = await adapter.rate(req.body);

      // Resolve contact_record_id → contact_id if provided
      if (req.body.contact_record_id && !req.body.contact_id) {
        const contact = await fastify.prisma.crmContact.findUnique({
          where: { record_id: Number(req.body.contact_record_id) },
          select: { id: true },
        });
        if (contact) req.body.contact_id = contact.id;
      }

      // Persist the quote scenario
      const scenario = await calcSvc.persistQuote(
        tenantId(req), req.body, quoteResult, rateSource, rateSourceMeta, actorId(req),
      ).catch(() => null);

      return ok({
        ...quoteResult,
        scenario_id: scenario?.id ?? null,
        scenario_ref: scenario?.scenario_ref ?? null,
        rate_source: rateSource,
        rate_source_meta: rateSourceMeta,
      });
    }
    catch (err) { throw { statusCode: err.statusCode || 500, message: err.message }; }
  });

  fastify.post('/compare-quotes', async (req) => {
    if (!Array.isArray(req.body?.quotes)) {
      const err = new Error('Request body must contain a "quotes" array');
      err.statusCode = 400;
      throw err;
    }
    try {
      await ensureRegistryBooted(req);
      const comparisonResult = calcSvc.compareQuotes(req.body.quotes);
      const meta = ratingRegistry.getInternal().getMetadata();

      // Persist comparison scenarios
      await calcSvc.persistComparison(
        tenantId(req), req.body.quotes, comparisonResult,
        'internal', { adapter: meta.adapter, version: meta.version, rated_at: new Date().toISOString() },
        actorId(req),
      ).catch(() => null);

      return ok(comparisonResult);
    }
    catch (err) { throw { statusCode: err.statusCode || 500, message: err.message }; }
  });

  // List registered rating adapters and their capabilities
  fastify.get('/rating-adapters', async (req) => {
    await ensureRegistryBooted(req);
    return ok(ratingRegistry.listAdapters());
  });

  // Per-carrier adapter status (combines live registry state with DB config)
  fastify.get('/carriers/:carrierCode/adapter-status', async (req) => {
    try {
      await ensureRegistryBooted(req);
      const { carrierCode } = req.params;
      const tid = tenantId(req);

      // Look up the carrier + its optional DB adapter config
      const carrier = await fastify.prisma.insuranceCarrier.findFirst({
        where: { code: carrierCode, tenant_id: tid },
        include: { adapter_config: true },
      });
      if (!carrier) throw { statusCode: 404, message: `Carrier '${carrierCode}' not found` };

      const hasRegistered = ratingRegistry.hasCarrier(carrierCode);
      const adapter = ratingRegistry.getAdapter(carrierCode);
      const meta = adapter.getMetadata();

      return ok({
        carrier_code:     carrier.code,
        carrier_name:     carrier.name,
        am_best_rating:   carrier.am_best_rating,
        // Live adapter details from the registry
        adapter_type:     meta.adapter.startsWith('simulated') ? 'simulated'
                        : meta.adapter.startsWith('carrier_api') ? 'api'
                        : 'internal',
        is_registered:    hasRegistered,
        adapter_status:   meta.status,
        adapter_meta:     meta,
        // DB-persisted configuration (if admin has configured it)
        db_config: carrier.adapter_config ? {
          adapter_type:    carrier.adapter_config.adapter_type,
          is_enabled:      carrier.adapter_config.is_enabled,
          environment:     carrier.adapter_config.environment,
          api_base_url:    carrier.adapter_config.api_base_url,
          api_key_env_var: carrier.adapter_config.api_key_env_var,
          api_key_present: !!(carrier.adapter_config.api_key_env_var &&
                               process.env[carrier.adapter_config.api_key_env_var]),
          supported_products: carrier.adapter_config.supported_products,
          health_status:   carrier.adapter_config.health_status,
          health_detail:   carrier.adapter_config.health_detail,
          last_health_check_at: carrier.adapter_config.last_health_check_at,
        } : null,
      });
    }
    catch (err) { throw { statusCode: err.statusCode || 500, message: err.message }; }
  });

  // Update carrier adapter configuration (admin only)
  fastify.put('/carriers/:carrierCode/adapter-config', async (req) => {
    try {
      const { carrierCode } = req.params;
      const tid = tenantId(req);
      const { adapter_type, api_base_url, api_key_env_var, timeout_ms,
              is_enabled, environment, supported_products, notes } = req.body ?? {};

      const carrier = await fastify.prisma.insuranceCarrier.findFirst({
        where: { code: carrierCode, tenant_id: tid },
      });
      if (!carrier) throw { statusCode: 404, message: `Carrier '${carrierCode}' not found` };

      // Validate: api adapter requires at minimum an env var name
      if (adapter_type === 'api' && !api_key_env_var) {
        throw { statusCode: 400, message: 'api_key_env_var is required when adapter_type is "api"' };
      }

      const config = await fastify.prisma.carrierAdapterConfig.upsert({
        where:  { carrier_id: carrier.id },
        create: {
          carrier_id:          carrier.id,
          adapter_type:        adapter_type ?? 'simulated',
          api_base_url:        api_base_url ?? null,
          api_key_env_var:     api_key_env_var ?? null,
          timeout_ms:          timeout_ms ?? 10000,
          is_enabled:          is_enabled ?? true,
          environment:         environment ?? 'sandbox',
          supported_products:  supported_products ?? null,
          notes:               notes ?? null,
          health_status:       'unknown',
        },
        update: {
          adapter_type:        adapter_type ?? 'simulated',
          api_base_url:        api_base_url ?? null,
          api_key_env_var:     api_key_env_var ?? null,
          timeout_ms:          timeout_ms ?? 10000,
          is_enabled:          is_enabled ?? true,
          environment:         environment ?? 'sandbox',
          supported_products:  supported_products ?? null,
          notes:               notes ?? null,
          health_status:       'unknown',  // reset on config change
          health_detail:       null,
        },
      });

      // Force registry re-boot on next request so new config is picked up
      _registryBooted = false;

      return ok({ message: 'Adapter configuration updated', config });
    }
    catch (err) { throw { statusCode: err.statusCode || 500, message: err.message }; }
  });

  // Check if underwriting workflow feature is enabled for this tenant
  fastify.get('/feature/underwriting-workflow', async (req) => {
    const enabled = await ffSvc.isEnabled('underwriting_workflow', tenantId(req));
    return ok({ enabled });
  });

  fastify.post('/illustration', async (req) => {
    try { return ok(await calcSvc.getIllustration(req.body.quote_id, req.body)); }
    catch (err) { throw { statusCode: err.statusCode || 500, message: err.message }; }
  });

  // ═══════════════════════════════════════════════════════════
  // TEMPLATE ENGINE  (unchanged)
  // ═══════════════════════════════════════════════════════════

  fastify.get('/templates', async () => {
    try { return ok(await templateSvc.getTemplates()); }
    catch (err) { throw { statusCode: err.statusCode || 500, message: err.message }; }
  });

  fastify.get('/templates/:templateId', async (req) => {
    try { return ok(await templateSvc.getTemplate(req.params.templateId)); }
    catch (err) { throw { statusCode: err.statusCode || 500, message: err.message }; }
  });

  fastify.post('/templates/:templateId/render', async (req) => {
    try { return ok(await templateSvc.renderTemplate(req.params.templateId, req.body)); }
    catch (err) { throw { statusCode: err.statusCode || 500, message: err.message }; }
  });

  fastify.post('/templates/render-quote', async (req) => {
    try { return ok(await templateSvc.renderQuoteSummary(req.body.calculation, req.body.client, req.body.agent)); }
    catch (err) { throw { statusCode: err.statusCode || 500, message: err.message }; }
  });

  fastify.post('/templates/render-illustration', async (req) => {
    try { return ok(await templateSvc.renderIllustration(req.body.calculation, req.body.client)); }
    catch (err) { throw { statusCode: err.statusCode || 500, message: err.message }; }
  });

  fastify.post('/templates/render-application', async (req) => {
    try { return ok(await templateSvc.renderApplicationForm(req.body.client, req.body.quote)); }
    catch (err) { throw { statusCode: err.statusCode || 500, message: err.message }; }
  });

  fastify.post('/templates/render-application-report', { preHandler: [authenticate] }, async (req) => {
    const { application_id } = req.body ?? {};
    if (!application_id) throw { statusCode: 400, message: 'application_id is required' };
    try {
      const app = await domainSvc.getApplication(Number(application_id), tenantId(req));
      return ok(await templateSvc.renderApplicationReport(app));
    } catch (err) { throw { statusCode: err.statusCode || 500, message: err.message }; }
  });

  fastify.post('/templates/render-comparison', async (req) => {
    try { return ok(await templateSvc.renderComparisonReport(req.body.quotes, req.body.client)); }
    catch (err) { throw { statusCode: err.statusCode || 500, message: err.message }; }
  });

  // ═══════════════════════════════════════════════════════════
  // INSURANCE DOMAIN — CARRIERS
  // ═══════════════════════════════════════════════════════════

  fastify.get('/carriers', async (req) => {
    return ok(await domainSvc.listCarriers(tenantId(req), { isActive: toBool(req.query.is_active) }));
  });

  fastify.get('/carriers/:id', async (req) => {
    return ok(await domainSvc.getCarrier(toInt(req.params.id), tenantId(req)));
  });

  fastify.post('/carriers', async (req) => {
    return ok(await domainSvc.createCarrier(req.body, tenantId(req)));
  });

  fastify.patch('/carriers/:id', async (req) => {
    return ok(await domainSvc.updateCarrier(toInt(req.params.id), req.body, tenantId(req)));
  });

  fastify.get('/carrier-products', async (req) => {
    const q = req.query;
    return ok(await domainSvc.listCarrierProducts(tenantId(req), {
      carrierId:   toInt(q.carrier_id),
      productType: q.product_type,
      isActive:    toBool(q.is_active),
    }));
  });

  fastify.post('/carrier-products', async (req) => {
    return ok(await domainSvc.createCarrierProduct(req.body, tenantId(req)));
  });

  // ═══════════════════════════════════════════════════════════
  // INSURANCE DOMAIN — POLICIES
  // ═══════════════════════════════════════════════════════════

  fastify.get('/policies', async (req) => {
    const q = req.query;
    return ok(await domainSvc.listPolicies(tenantId(req), {
      status:        q.status,
      contactId:     toInt(q.contact_id),
      agentId:       q.agent_id,
      carrierId:     toInt(q.carrier_id),
      renewalBefore: q.renewal_before,
      search:        q.search,
      limit:         toInt(q.limit) ?? 50,
      offset:        toInt(q.offset) ?? 0,
    }));
  });

  fastify.get('/policies/:id', async (req) => {
    return ok(await domainSvc.getPolicy(toInt(req.params.id), tenantId(req)));
  });

  fastify.post('/policies', async (req) => {
    requireFields(req.body, ['product_type', 'coverage_amount', 'premium_amount', 'effective_date']);
    requirePositiveNumber(req.body, 'coverage_amount');
    requirePositiveNumber(req.body, 'premium_amount');
    return ok(await domainSvc.createPolicy(req.body, tenantId(req), actorId(req)));
  });

  fastify.patch('/policies/:id', async (req) => {
    return ok(await domainSvc.updatePolicy(toInt(req.params.id), req.body, tenantId(req), actorId(req)));
  });

  fastify.delete('/policies/:id', async (req) => {
    await domainSvc.deletePolicy(toInt(req.params.id), tenantId(req));
    return ok({ deleted: true });
  });

  fastify.get('/policies/:id/beneficiaries', async (req) => {
    const policy = await domainSvc.getPolicy(toInt(req.params.id), tenantId(req));
    return ok(policy.beneficiaries);
  });

  fastify.put('/policies/:id/beneficiaries', async (req) => {
    return ok(await domainSvc.upsertBeneficiaries(toInt(req.params.id), req.body.beneficiaries ?? [], tenantId(req)));
  });

  fastify.post('/policies/:id/status', async (req) => {
    return ok(await domainSvc.updatePolicy(
      toInt(req.params.id),
      { status: req.body.status, reason: req.body.reason },
      tenantId(req),
      actorId(req),
    ));
  });

  // ═══════════════════════════════════════════════════════════
  // INSURANCE DOMAIN — APPLICATIONS
  // ═══════════════════════════════════════════════════════════

  fastify.get('/applications', async (req) => {
    const q = req.query;
    return ok(await domainSvc.listApplications(tenantId(req), {
      status:    q.status,
      contactId: toInt(q.contact_id),
      agentId:   q.agent_id,
      carrierId: toInt(q.carrier_id),
      search:    q.search,
      limit:     toInt(q.limit) ?? 50,
      offset:    toInt(q.offset) ?? 0,
    }));
  });

  fastify.get('/applications/:id', async (req) => {
    return ok(await domainSvc.getApplication(toInt(req.params.id), tenantId(req)));
  });

  fastify.post('/applications', async (req) => {
    requireFields(req.body, ['product_type', 'coverage_amount']);
    requirePositiveNumber(req.body, 'coverage_amount');
    const body = { ...req.body };
    // Resolve record_id → crm_contacts.id when passed from Quote Engine flow
    if (body.contact_record_id && !body.contact_id) {
      const contact = await fastify.prisma.crmContact.findUnique({
        where: { record_id: Number(body.contact_record_id) },
        select: { id: true },
      });
      if (contact) body.contact_id = contact.id;
      delete body.contact_record_id;
    }
    return ok(await domainSvc.createApplication(body, tenantId(req), actorId(req)));
  });

  fastify.patch('/applications/:id', async (req) => {
    return ok(await domainSvc.updateApplication(toInt(req.params.id), req.body, tenantId(req)));
  });

  // Convert application → underwriting case (requires UW workflow to be ON)
  fastify.post('/applications/:id/convert-underwriting', async (req) => {
    await assertUwEnabled(req);
    return ok(await domainSvc.convertToUnderwriting(toInt(req.params.id), req.body, tenantId(req), actorId(req)));
  });

  // Issue a policy from an approved application
  fastify.post('/applications/:id/issue-policy', async (req) => {
    return ok(await domainSvc.issuePolicy(toInt(req.params.id), req.body, tenantId(req), actorId(req)));
  });

  // ═══════════════════════════════════════════════════════════
  // INSURANCE DOMAIN — UNDERWRITING
  // ═══════════════════════════════════════════════════════════

  fastify.get('/underwriting', async (req) => {
    const q = req.query;
    return ok(await domainSvc.listUnderwritingCases(tenantId(req), {
      status:        q.status,
      riskClass:     q.risk_class,
      underwriterId: q.underwriter_id,
      search:        q.search,
      limit:         toInt(q.limit) ?? 50,
      offset:        toInt(q.offset) ?? 0,
    }));
  });

  fastify.get('/underwriting/:id', async (req) => {
    return ok(await domainSvc.getUnderwritingCase(toInt(req.params.id), tenantId(req)));
  });

  fastify.patch('/underwriting/:id', async (req) => {
    await permSvc.assertCanDecideUnderwriting(req.user?.role, tenantId(req));
    return ok(await domainSvc.updateUnderwritingCase(toInt(req.params.id), req.body, tenantId(req), actorId(req)));
  });

  fastify.post('/underwriting/:id/decision', async (req) => {
    await permSvc.assertCanDecideUnderwriting(req.user?.role, tenantId(req));
    const { status, risk_class, decision_notes } = req.body;
    if (!status || !['approved', 'declined', 'referred'].includes(status)) {
      const err = new Error('status must be one of: approved, declined, referred');
      err.statusCode = 400;
      throw err;
    }
    return ok(await domainSvc.updateUnderwritingCase(
      toInt(req.params.id),
      { status, risk_class, decision_notes },
      tenantId(req),
      actorId(req),
    ));
  });

  fastify.post('/underwriting/:id/requirements', async (req) => {
    return ok(await domainSvc.addRequirement(toInt(req.params.id), req.body, tenantId(req)));
  });

  fastify.patch('/underwriting/requirements/:reqId', async (req) => {
    return ok(await domainSvc.updateRequirement(toInt(req.params.reqId), req.body, tenantId(req)));
  });

  // ═══════════════════════════════════════════════════════════
  // INSURANCE DOMAIN — CLAIMS
  // ═══════════════════════════════════════════════════════════

  fastify.get('/claims', async (req) => {
    const q = req.query;
    return ok(await domainSvc.listClaims(tenantId(req), {
      status:     q.status,
      claimType:  q.claim_type,
      policyId:   toInt(q.policy_id),
      adjusterId: q.adjuster_id,
      search:     q.search,
      limit:      toInt(q.limit) ?? 50,
      offset:     toInt(q.offset) ?? 0,
    }));
  });

  fastify.get('/claims/:id', async (req) => {
    return ok(await domainSvc.getClaim(toInt(req.params.id), tenantId(req)));
  });

  fastify.post('/claims', async (req) => {
    requireFields(req.body, ['policy_id', 'amount']);
    requirePositiveNumber(req.body, 'amount');
    return ok(await domainSvc.createClaim(req.body, tenantId(req), actorId(req)));
  });

  fastify.patch('/claims/:id', async (req) => {
    return ok(await domainSvc.updateClaim(toInt(req.params.id), req.body, tenantId(req), actorId(req)));
  });

  fastify.post('/claims/:id/events', async (req) => {
    return ok(await domainSvc.addClaimEvent(toInt(req.params.id), req.body, tenantId(req), actorId(req)));
  });

  // ═══════════════════════════════════════════════════════════
  // INSURANCE DOMAIN — COMMISSIONS
  // ═══════════════════════════════════════════════════════════

  fastify.get('/commissions', async (req) => {
    const q = req.query;
    return ok(await domainSvc.listCommissions(tenantId(req), {
      agentId:        q.agent_id,
      status:         q.status,
      period:         q.period,
      policyId:       toInt(q.policy_id),
      commissionType: q.product_type ?? q.commission_type, // support both param names
      search:         q.search,
      limit:          toInt(q.limit) ?? 100,
      offset:         toInt(q.offset) ?? 0,
    }));
  });

  fastify.get('/commissions/summary', async (req) => {
    return ok(await domainSvc.getCommissionSummary(tenantId(req), {
      agentId: req.query.agent_id,
      period:  req.query.period,
    }));
  });

  fastify.post('/commissions', async (req) => {
    requireFields(req.body, ['agent_id', 'product_type', 'source_premium', 'commission_rate']);
    requirePositiveNumber(req.body, 'source_premium');
    return ok(await domainSvc.createCommission(req.body, tenantId(req), actorId(req)));
  });

  fastify.patch('/commissions/:id/status', async (req) => {
    return ok(await domainSvc.updateCommissionStatus(
      toInt(req.params.id),
      req.body.status,
      req.body.reason,
      tenantId(req),
      actorId(req),
    ));
  });

  // ═══════════════════════════════════════════════════════════
  // P0 — QUOTE SCENARIOS
  // ═══════════════════════════════════════════════════════════

  fastify.get('/quote-scenarios', async (req) => {
    const q = req.query;
    return ok(await calcSvc.listScenarios(tenantId(req), {
      contactId:       toInt(q.contact_id),
      productType:     q.product_type,
      status:          q.status,
      comparisonGroup: q.comparison_group,
      limit:           toInt(q.limit) ?? 50,
      offset:          toInt(q.offset) ?? 0,
    }));
  });

  fastify.get('/quote-scenarios/:id', async (req) => {
    return ok(await calcSvc.getScenario(toInt(req.params.id), tenantId(req)));
  });

  fastify.post('/quote-scenarios/:id/convert', async (req) => {
    return ok(await calcSvc.convertScenario(
      toInt(req.params.id), toInt(req.body?.application_id), tenantId(req),
    ));
  });

  // ═══════════════════════════════════════════════════════════
  // P1 — COMPLIANCE & SUBMISSION PACK
  // ═══════════════════════════════════════════════════════════

  fastify.get('/compliance', async (req) => {
    const q = req.query;
    return ok(await domainSvc.listComplianceArtifacts(tenantId(req), {
      contactId:     toInt(q.contact_id),
      applicationId: toInt(q.application_id),
      policyId:      toInt(q.policy_id),
      status:        q.status,
      artifactType:  q.artifact_type,
      limit:         toInt(q.limit) ?? 50,
      offset:        toInt(q.offset) ?? 0,
    }));
  });

  fastify.post('/compliance', async (req) => {
    requireFields(req.body, ['artifact_type']);
    return ok(await domainSvc.createComplianceArtifact(req.body, tenantId(req), actorId(req)));
  });

  fastify.patch('/compliance/:id', async (req) => {
    return ok(await domainSvc.updateComplianceArtifact(toInt(req.params.id), req.body, tenantId(req)));
  });

  fastify.get('/applications/:id/checklist', async (req) => {
    return ok(await domainSvc.getSubmissionChecklist(toInt(req.params.id), tenantId(req)));
  });

  fastify.post('/applications/:id/checklist', async (req) => {
    const items = Array.isArray(req.body) ? req.body : req.body?.items ?? [];
    return ok(await domainSvc.createSubmissionChecklist(toInt(req.params.id), items, tenantId(req)));
  });

  fastify.patch('/checklist/:id', async (req) => {
    return ok(await domainSvc.updateChecklistItem(toInt(req.params.id), req.body, tenantId(req)));
  });

  fastify.get('/applications/:id/submission-readiness', async (req) => {
    return ok(await domainSvc.getSubmissionReadiness(toInt(req.params.id), tenantId(req)));
  });

  // ═══════════════════════════════════════════════════════════
  // DECLARATIONS  (EAV-backed via RecordService)
  // ═══════════════════════════════════════════════════════════

  /**
   * Resolve the declaration UiObject id (cached after first call).
   * Returns { objectId, pipelineStages } so routes can look up stage ids.
   */
  let _declObjCache = null;
  async function resolveDeclObject() {
    if (_declObjCache) return _declObjCache;
    const obj = await fastify.prisma.uiObject.findFirst({
      where: { name: 'declaration' },
      select: { id: true, pipelines: { select: { stages: { select: { id: true, name: true }, orderBy: { order_index: 'asc' } } } } },
    });
    if (!obj) throw Object.assign(new Error('Declaration object not found — run seed'), { statusCode: 500 });
    const stages = obj.pipelines?.[0]?.stages ?? [];
    _declObjCache = { objectId: obj.id, stages };
    return _declObjCache;
  }

  // GET /insurance/declarations
  fastify.get('/declarations', async (req) => {
    const { objectId } = await resolveDeclObject();
    const records = await recSvc.getRecords(objectId, null, req.user);

    let declarations = records.map(r => ({ id: r.id, created_at: r.created_at, updated_at: r.updated_at, ...r.data }));

    // Filtering
    const { status, declaration_type, search } = req.query;
    if (status)           declarations = declarations.filter(d => d.status === status);
    if (declaration_type) declarations = declarations.filter(d => d.declaration_type === declaration_type);
    if (search) {
      const s = search.toLowerCase();
      declarations = declarations.filter(d =>
        (d.applicant_name ?? '').toLowerCase().includes(s) ||
        (d.declaration_number ?? '').toLowerCase().includes(s),
      );
    }
    return ok({ declarations, total: declarations.length });
  });

  // GET /insurance/declarations/:id
  fastify.get('/declarations/:id', async (req) => {
    const record = await recSvc.getRecord(req.params.id, req.user);
    return ok({ id: record.id, created_at: record.created_at, updated_at: record.updated_at, ...record.data });
  });

  // POST /insurance/declarations  — create one record per declaration_type
  fastify.post('/declarations', async (req) => {
    const { application_id, declaration_types, delivery_method, notes } = req.body;
    if (!declaration_types?.length) {
      throw Object.assign(new Error('declaration_types is required'), { statusCode: 400 });
    }

    const { objectId, stages } = await resolveDeclObject();
    const pendingStage = stages.find(s => s.name === 'pending') ?? stages[0];

    // Resolve applicant name + app number from the application
    let applicantName = '';
    let appNumber = '';
    if (application_id) {
      const app = await fastify.prisma.insuranceApplication.findFirst({
        where: { id: Number(application_id), tenant_id: tenantId(req) },
        include: { contact: { select: { first_name: true, last_name: true } } },
      });
      if (app) {
        applicantName = app.contact ? `${app.contact.first_name ?? ''} ${app.contact.last_name ?? ''}`.trim() : '';
        appNumber = app.app_number ?? '';
      }
    }

    // Idempotent per application: a type that is already out for acceptance (or
    // accepted) is not sent again — a retried or double-clicked send, or one the
    // browser timed out on, must not create duplicates. Declined/expired may resend.
    const activeTypes = new Set();
    if (appNumber) {
      const appRows = await fastify.prisma.recordFieldValue.findMany({
        where:  { field_name: 'app_number', str_value: appNumber, tenant_id: tenantId(req),
                  record: { object_id: objectId, deleted_at: null } },
        select: { record_id: true },
      });
      const ids = appRows.map(r => r.record_id);
      if (ids.length) {
        const vals = await fastify.prisma.recordFieldValue.findMany({
          where:  { record_id: { in: ids }, field_name: { in: ['declaration_type', 'status'] } },
          select: { record_id: true, field_name: true, str_value: true },
        });
        const byRec = {};
        for (const v of vals) (byRec[v.record_id] ??= {})[v.field_name] = v.str_value;
        for (const d of Object.values(byRec)) {
          if (d.declaration_type && !['declined', 'expired'].includes(d.status)) activeTypes.add(d.declaration_type);
        }
      }
    }

    const created = [];
    const skipped = [];
    for (const declType of declaration_types) {
      if (activeTypes.has(declType)) { skipped.push(declType); continue; }
      activeTypes.add(declType); // a type listed twice in one request is sent once
      const crmData = {
        declaration_type: declType,
        applicant_name:   applicantName,
        app_number:       appNumber,
        delivery_method:  delivery_method ?? 'email',
        status:           'sent',
        sent_at:          new Date().toISOString(),
        notes:            notes ?? '',
      };
      const record = await recSvc.createRecord(
        objectId,
        pendingStage?.id ?? null,
        actorId(req),
        null,
        req.user,
        crmData,
      );
      created.push({ id: record.id, ...record.data });
    }
    return ok({ declarations: created, skipped });
  });

  // PATCH /insurance/declarations/:id
  fastify.patch('/declarations/:id', async (req) => {
    const allowed = ['status', 'accepted_at', 'viewed_at', 'signed_by', 'ip_address', 'signature_hash', 'notes'];
    const crmData = {};
    for (const key of allowed) {
      if (req.body[key] !== undefined) crmData[key] = req.body[key];
    }
    const record = await recSvc.updateRecord(toInt(req.params.id), actorId(req), req.user, undefined, crmData);
    return ok({ id: record.id, ...record.data });
  });

  // POST /insurance/declarations/:id/resend
  fastify.post('/declarations/:id/resend', async (req) => {
    const crmData = { status: 'sent', sent_at: new Date().toISOString() };
    const record = await recSvc.updateRecord(toInt(req.params.id), actorId(req), req.user, undefined, crmData);
    return ok({ id: record.id, ...record.data });
  });

  // ═══════════════════════════════════════════════════════════
  // P2 — POLICY SERVICING & BILLING
  // ═══════════════════════════════════════════════════════════

  // Endorsements
  fastify.get('/endorsements', async (req) => {
    return ok(await domainSvc.listEndorsements(tenantId(req), {
      policyId: toInt(req.query.policy_id),
      status:   req.query.status,
      limit:    toInt(req.query.limit) ?? 50,
      offset:   toInt(req.query.offset) ?? 0,
    }));
  });

  fastify.post('/endorsements', async (req) => {
    requireFields(req.body, ['policy_id', 'endorsement_type', 'description', 'effective_date']);
    return ok(await domainSvc.createEndorsement(req.body, tenantId(req), actorId(req)));
  });

  fastify.post('/endorsements/:id/approve', async (req) => {
    return ok(await domainSvc.approveEndorsement(toInt(req.params.id), tenantId(req), actorId(req)));
  });

  fastify.post('/endorsements/:id/apply', async (req) => {
    return ok(await domainSvc.applyEndorsement(toInt(req.params.id), tenantId(req), actorId(req)));
  });

  // Renewal tasks
  fastify.get('/renewal-tasks', async (req) => {
    return ok(await domainSvc.listRenewalTasks(tenantId(req), {
      agentId:       req.query.agent_id,
      status:        req.query.status,
      renewalBefore: req.query.renewal_before,
      limit:         toInt(req.query.limit) ?? 50,
      offset:        toInt(req.query.offset) ?? 0,
    }));
  });

  fastify.post('/renewal-tasks', async (req) => {
    requireFields(req.body, ['policy_id']);
    return ok(await domainSvc.createRenewalTask(req.body, tenantId(req)));
  });

  fastify.patch('/renewal-tasks/:id', async (req) => {
    return ok(await domainSvc.updateRenewalTask(toInt(req.params.id), req.body, tenantId(req)));
  });

  // Billing
  fastify.get('/policies/:id/billing', async (req) => {
    return ok(await domainSvc.getBillingHistory(toInt(req.params.id), tenantId(req)));
  });

  fastify.post('/policies/:id/billing', async (req) => {
    return ok(await domainSvc.createBillingSchedule(toInt(req.params.id), req.body ?? {}, tenantId(req)));
  });

  fastify.post('/policies/:id/invoices', async (req) => {
    const billing = await fastify.prisma.billingSchedule.findFirst({
      where: { policy_id: toInt(req.params.id), tenant_id: tenantId(req) },
    });
    if (!billing) {
      const err = new Error('No billing schedule found for this policy');
      err.statusCode = 404;
      throw err;
    }
    return ok(await domainSvc.generateInvoice(billing.id, tenantId(req)));
  });

  fastify.post('/invoices/:id/payments', async (req) => {
    return ok(await domainSvc.recordPayment(toInt(req.params.id), req.body ?? {}, tenantId(req), actorId(req)));
  });

  // ═══════════════════════════════════════════════════════════
  // P3 — CLAIMS OPS (enhanced)
  // ═══════════════════════════════════════════════════════════

  fastify.post('/claims/:id/reserves', async (req) => {
    requireFields(req.body, ['amount']);
    requirePositiveNumber(req.body, 'amount');
    return ok(await domainSvc.setReserve(toInt(req.params.id), req.body, tenantId(req), actorId(req)));
  });

  fastify.post('/claims/:id/payments', async (req) => {
    requireFields(req.body, ['amount']);
    requirePositiveNumber(req.body, 'amount');
    return ok(await domainSvc.recordClaimPayment(toInt(req.params.id), req.body, tenantId(req), actorId(req)));
  });

  fastify.post('/claims/:id/fraud-flag', async (req) => {
    return ok(await domainSvc.flagFraud(toInt(req.params.id), req.body?.is_fraud ?? true, tenantId(req), actorId(req)));
  });

  fastify.get('/claims/adjuster-queue', async (req) => {
    if (!req.query.adjuster_id) {
      const err = new Error('adjuster_id is required');
      err.statusCode = 400;
      throw err;
    }
    return ok(await domainSvc.getAdjusterWorkQueue(req.query.adjuster_id, tenantId(req)));
  });

  // ═══════════════════════════════════════════════════════════
  // P4 — PRODUCER / CARRIER OPS
  // ═══════════════════════════════════════════════════════════

  fastify.get('/producer-appointments', async (req) => {
    return ok(await domainSvc.listAppointments(tenantId(req), {
      agentId:   req.query.agent_id,
      carrierId: toInt(req.query.carrier_id),
      stateCode: req.query.state_code,
      status:    req.query.status,
      limit:     toInt(req.query.limit) ?? 50,
      offset:    toInt(req.query.offset) ?? 0,
    }));
  });

  fastify.post('/producer-appointments', async (req) => {
    requireFields(req.body, ['agent_id', 'carrier_id', 'state_code']);
    return ok(await domainSvc.createAppointment(req.body, tenantId(req)));
  });

  fastify.patch('/producer-appointments/:id', async (req) => {
    return ok(await domainSvc.updateAppointment(toInt(req.params.id), req.body, tenantId(req)));
  });

  fastify.get('/commission-statements', async (req) => {
    return ok(await domainSvc.listCommissionStatements(tenantId(req), {
      carrierId: toInt(req.query.carrier_id),
      period:    req.query.period,
      status:    req.query.status,
      limit:     toInt(req.query.limit) ?? 50,
      offset:    toInt(req.query.offset) ?? 0,
    }));
  });

  fastify.post('/commission-statements', async (req) => {
    requireFields(req.body, ['carrier_id', 'statement_period', 'received_date', 'total_actual']);
    return ok(await domainSvc.createCommissionStatement(req.body, tenantId(req), actorId(req)));
  });

  fastify.post('/commission-statements/:id/reconcile', async (req) => {
    return ok(await domainSvc.reconcileStatement(toInt(req.params.id), tenantId(req), actorId(req)));
  });

  fastify.get('/commissions/variance-report', async (req) => {
    return ok(await domainSvc.getCommissionVarianceReport(tenantId(req), {
      period:    req.query.period,
      carrierId: toInt(req.query.carrier_id),
    }));
  });

  // ═══════════════════════════════════════════════════════════
  // P5 — AGENT WORKBENCH
  // ═══════════════════════════════════════════════════════════

  fastify.get('/agent-workbench', async (req) => {
    const agId = req.query.agent_id ?? actorId(req);
    return ok(await domainSvc.getAgentWorkbench(agId, tenantId(req)));
  });

  // ═══════════════════════════════════════════════════════════
  // P6 — APPLICATION DOCUMENTS
  // ═══════════════════════════════════════════════════════════

  const DocumentService = require('../../services/document.service');

  // All application-document storage/DB work goes through the unified
  // DocumentService (tenant-first keys, atomic writes, SHA-256 dedup,
  // versioning, soft-delete). Documents are stored with
  // entity_type = "application" and a typed `application_id` link.
  const docSvc = () => new DocumentService(fastify.prisma);

  /** Flatten a unified Document row into the shape the frontend expects. */
  function enrichAppDoc(d) {
    return {
      ...d,
      filename:       d.original_filename,
      app_number:     d.application?.app_number ?? null,
      applicant_name: d.application?.contact
        ? `${d.application.contact.first_name} ${d.application.contact.last_name}`.trim()
        : null,
    };
  }

  // GET /api/insurance/application-documents
  fastify.get('/application-documents', async (req) => {
    const where = { entity_type: 'application', deleted_at: null };
    if (req.query.status)        where.status   = req.query.status;
    if (req.query.category)      where.category = req.query.category;
    if (req.query.application_id) {
      // application_id may be the InsuranceApplication ID or a CRM Record ID — resolve if needed
      let appId = Number(req.query.application_id);
      const directApp = await fastify.prisma.insuranceApplication.findUnique({ where: { id: appId }, select: { id: true } });
      if (!directApp) {
        // Try resolving as a CRM record_id
        const byRecord = await fastify.prisma.insuranceApplication.findUnique({ where: { record_id: appId }, select: { id: true } });
        if (byRecord) appId = byRecord.id;
      }
      where.application_id = appId;
    }
    if (req.query.search)        where.original_filename = { contains: req.query.search };

    const documents = await fastify.prisma.document.findMany({
      where,
      orderBy: { created_at: 'desc' },
      take: toInt(req.query.limit) || 100,
      skip: toInt(req.query.offset) || 0,
      include: {
        application: { select: { id: true, app_number: true, contact: { select: { first_name: true, last_name: true } } } },
      },
    });

    return ok({ documents: documents.map(enrichAppDoc) });
  });

  // GET /api/insurance/application-documents/:id
  fastify.get('/application-documents/:id', async (req) => {
    const id  = Number(req.params.id);
    const doc = await fastify.prisma.document.findFirst({
      where: { id, entity_type: 'application', deleted_at: null },
      include: {
        application: { select: { id: true, app_number: true, contact: { select: { first_name: true, last_name: true, email: true } } } },
      },
    });
    if (!doc) throw Object.assign(new Error('Document not found'), { statusCode: 404 });
    return ok(enrichAppDoc(doc));
  });

  // Allowed MIME types for application documents
  const ALLOWED_MIME_TYPES = new Set([
    'application/pdf',
    'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/tiff', 'image/bmp',
    'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/plain', 'text/csv',
  ]);
  const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25 MB per file

  // POST /api/insurance/application-documents (binary file storage)
  // Files are stored via DocumentService under the canonical tenant-first key:
  //   {tenant_id}/application/{application_id}/{category}/{uuid}_{filename}
  fastify.post('/application-documents', async (req) => {
    const tid = tenantId(req);
    const { application_id, category, notes, record_id, files } = req.body;
    if (!application_id) throw Object.assign(new Error('application_id is required'), { statusCode: 400 });
    if (!Array.isArray(files) || files.length === 0) throw Object.assign(new Error('At least one file is required'), { statusCode: 400 });

    // Validate each file before processing
    for (const file of files) {
      if (!file.filename || !file.data) {
        throw Object.assign(new Error('Each file must have a filename and data'), { statusCode: 400 });
      }
      if (file.mime_type && !ALLOWED_MIME_TYPES.has(file.mime_type)) {
        throw Object.assign(new Error(`File type "${file.mime_type}" is not allowed`), { statusCode: 400 });
      }
      let decoded;
      try { decoded = Buffer.from(file.data, 'base64'); } catch {
        throw Object.assign(new Error(`Invalid base64 data for file "${file.filename}"`), { statusCode: 400 });
      }
      if (decoded.length > MAX_FILE_SIZE) {
        throw Object.assign(new Error(`File "${file.filename}" exceeds the 25 MB size limit`), { statusCode: 400 });
      }
    }

    // Resolve app_number for the document reference prefix
    const app = await fastify.prisma.insuranceApplication.findUnique({
      where: { id: Number(application_id) },
      select: { app_number: true },
    });
    const appNumber = app?.app_number ?? `APP-${application_id}`;
    const cat = category ?? 'other';
    const svc = docSvc();

    const created = [];
    for (const file of files) {
      const doc = await svc.upload({
        tenantId:      tid,
        buffer:        Buffer.from(file.data, 'base64'),
        filename:      file.filename,
        mimeType:      file.mime_type ?? 'application/octet-stream',
        entityType:    'application',
        entityId:      Number(application_id),
        applicationId: Number(application_id),
        recordId:      record_id ? Number(record_id) : null,
        category:      cat,
        notes:         notes ?? null,
        uploadedBy:    actorId(req),
        refPrefix:     appNumber,
      });
      if (doc.duplicate) {
        fastify.log.warn({ duplicateId: doc.id, filename: file.filename }, '[app-docs] Duplicate file detected, skipping');
        continue;
      }
      created.push(doc);
    }

    return ok({ documents: created });
  });

  // POST /api/insurance/templates/render-and-archive
  // Renders a report (quote or application) and saves the output as ApplicationDocuments.
  // Returns { html, documents } so the frontend can display the report AND know it's archived.
  const { htmlToPdf } = require('../../utils/html-to-pdf');

  fastify.post('/templates/render-and-archive', async (req) => {
    const tid = tenantId(req);
    const { report_type, application_id, calculation, client, agent } = req.body ?? {};

    if (!application_id) throw Object.assign(new Error('application_id is required'), { statusCode: 400 });
    if (!report_type)    throw Object.assign(new Error('report_type is required (quote_report | application_report)'), { statusCode: 400 });

    // 1. Render the HTML
    let html = '';
    let filenameBase = '';

    if (report_type === 'quote_report') {
      if (!calculation) throw Object.assign(new Error('calculation is required for quote_report'), { statusCode: 400 });
      html = await templateSvc.renderQuoteSummary(calculation, client ?? {}, agent ?? {});
      filenameBase = `Quote-Report-${calculation.quote_reference || Date.now()}`;
    } else if (report_type === 'application_report') {
      const app = await domainSvc.getApplication(Number(application_id), tid);
      html = await templateSvc.renderApplicationReport(app);
      filenameBase = `Application-Report-${app.app_number || application_id}`;
    } else {
      throw Object.assign(new Error('report_type must be quote_report or application_report'), { statusCode: 400 });
    }

    if (typeof html !== 'string' || !html) {
      throw Object.assign(new Error('Template rendering returned empty result'), { statusCode: 500 });
    }

    // 2. Resolve application for the document reference prefix
    const app = await fastify.prisma.insuranceApplication.findUnique({
      where: { id: Number(application_id) },
      select: { app_number: true },
    });
    const appNumber = app?.app_number ?? `APP-${application_id}`;
    const category = 'reports';
    const svc = docSvc();

    const archive = (buffer, filename, mimeType, kind) => svc.upload({
      tenantId:      tid,
      buffer,
      filename,
      mimeType,
      entityType:    'application',
      entityId:      Number(application_id),
      applicationId: Number(application_id),
      category,
      notes:         `Auto-archived ${report_type.replace(/_/g, ' ')}${kind ? ` (${kind})` : ''}`,
      uploadedBy:    actorId(req),
      refPrefix:     appNumber,
    });

    const created = [];

    // 3. Archive the HTML (DocumentService dedups identical bytes automatically)
    const htmlDoc = await archive(Buffer.from(html, 'utf-8'), `${filenameBase}.html`, 'text/html');
    const alreadyArchived = !!htmlDoc.duplicate;
    if (!alreadyArchived) created.push(htmlDoc);

    // 4. Try to generate a PDF and archive it too
    if (!alreadyArchived) {
      try {
        const pdfBuf = await htmlToPdf(html);
        if (pdfBuf) {
          const pdfDoc = await archive(pdfBuf, `${filenameBase}.pdf`, 'application/pdf', 'PDF');
          if (!pdfDoc.duplicate) created.push(pdfDoc);
        }
      } catch (pdfErr) {
        fastify.log.warn({ err: pdfErr }, '[render-and-archive] PDF generation failed, HTML saved only');
      }
    }

    return ok({ html, documents: created, already_archived: alreadyArchived });
  });

  // PATCH /api/insurance/application-documents/:id/review
  fastify.patch('/application-documents/:id/review', async (req) => {
    const id   = Number(req.params.id);
    const { status, rejection_reason } = req.body;
    if (!['approved', 'rejected', 'waived'].includes(status)) {
      throw Object.assign(new Error('Status must be approved, rejected, or waived'), { statusCode: 400 });
    }

    const svc = docSvc();
    const doc = await svc.get(id);
    if (!doc || doc.entity_type !== 'application') throw Object.assign(new Error('Document not found'), { statusCode: 404 });

    const updated = await svc.review(id, {
      status,
      reviewedBy:      actorId(req),
      rejectionReason: status === 'rejected' ? (rejection_reason ?? null) : null,
    });
    return ok(updated);
  });

  // GET /api/insurance/application-documents/:id/download
  // Supports lookup by ApplicationDocument ID or by runtime record_id (?by_record_id=true)
  fastify.get('/application-documents/:id/download', async (req, reply) => {
    const id  = Number(req.params.id);
    const svc = docSvc();
    const doc = req.query.by_record_id === 'true'
      ? await svc.getByRecordId(id)
      : await svc.get(id);
    if (!doc) throw Object.assign(new Error('Document not found'), { statusCode: 404 });
    if (!doc.stored_key) throw Object.assign(new Error('File not available'), { statusCode: 404 });

    let stream, mimeType, filename;
    try {
      ({ stream, mimeType, filename } = await svc.openStream(doc));
    } catch {
      throw Object.assign(new Error('File not found in storage'), { statusCode: 404 });
    }
    return reply
      .header('Content-Type', mimeType)
      .header('Content-Disposition', `attachment; filename="${filename}"`)
      .send(stream);
  });

  // GET /api/insurance/application-documents/:id/preview
  // Renders the file inline (pdf/image natively, Office → HTML) for in-app
  // preview before download. Same lookup semantics as /download.
  fastify.get('/application-documents/:id/preview', async (req, reply) => {
    if (!(await preview.previewEnabled(fastify.prisma, getTenantId(req)))) {
      throw Object.assign(new Error('Document preview is disabled'), { statusCode: 403 });
    }
    const id  = Number(req.params.id);
    const svc = docSvc();
    const doc = req.query.by_record_id === 'true'
      ? await svc.getByRecordId(id)
      : await svc.get(id);
    if (!doc) throw Object.assign(new Error('Document not found'), { statusCode: 404 });
    if (!doc.stored_key) throw Object.assign(new Error('File not available'), { statusCode: 404 });
    return preview.sendPreview(reply, svc, doc);
  });
};
